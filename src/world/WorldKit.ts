import { Color3, Mesh, Scene, StandardMaterial, TransformNode, VertexBuffer, VertexData, type DynamicTexture } from "../core/babylon";
import { buildPart, paint } from "../characters/PartBuilder";
import type { Part } from "../characters/models";
import { mulberry32 } from "../core/util";
import { PLAZA, rect, type Rect } from "../data/map";
import type { Materials } from "./Materials";
import type { StructureCategory, StructureInfo } from "./structureFade";
import { STRUCT_ID_SCALE } from "./StructureFadePlugin";
type Bucket = Mesh[];
interface Roof { r: Rect; h: number }

/**
 * 町を組み立てる道具（World の土台）。静的な部品は材質ごとの「バケツ」に入れ、最後に flush で 1 メッシュへ結合する。
 * 建物は group で囲むと建物 ID が頂点カラーのアルファに入る（建物単位の透過・写真での非表示）。
 * 部品を作る関数は world/build/*（town・landmarks・nature）。ここのメンバーは world/ の中からだけ使う。
 */
export class WorldKit {
  /** 当たり。lv = どこで効くか（温泉宿の階・階段。無ければ町・地上） */
  colliders: { r: Rect; on: boolean; lv?: string[] }[] = [];
  circles: { x: number; z: number; r: number; lv?: string[] }[] = [];
  /** 建物グループ（id は 1 から。透過・写真での非表示に使う） */
  structures: StructureInfo[] = [];
  /** 結合していない建物の部品（門扉など）：写真で隠すとき用 */
  structureMeshes: { mesh: Mesh; cat: StructureCategory }[] = [];
  cur: StructureInfo | null = null;
  roofs: Roof[] = [];
  /** 家の外形と、属する建物の分類（地面に焼き込む影。写真でその分類を隠すと影も消す） */
  houses: (Rect & { cat: StructureCategory })[] = [];
  paddies: Rect[] = [];
  groundCanvas!: HTMLCanvasElement;
  /** 地面のテクスチャ（groundCanvas を描き直したら update する） */
  groundTex!: DynamicTexture;

  /** lanternLevel ごとの灯りメッシュ（off→on でマテリアルを差し替え） */
  lightGroups: Mesh[][] = [[], [], [], [], []];
  glowWarm: StandardMaterial;
  glowWindow: StandardMaterial;
  glowViolet: StandardMaterial;
  offMat: StandardMaterial;
  water!: StandardMaterial;
  rnd = mulberry32(1234);

  stat: Bucket = [];
  lamps: Bucket[] = [[], [], [], [], []]; // [level]
  windows: Bucket[] = [[], [], [], [], []];
  yokochoLamps: Bucket = [];
  yokochoStatic: Bucket = [];

  yokochoNode!: TransformNode;
  gateDoors: Mesh[] = [];
  gateCollider!: { r: Rect; on: boolean };
  boat!: TransformNode;
  shinboku = { x: PLAZA.x, z: PLAZA.z };
  sky!: Mesh;
  moon!: Mesh;

  constructor(readonly scene: Scene, readonly mats: Materials) {
    this.glowWarm = mats.glow.warm;
    this.glowWindow = mats.makeGlow(scene, "window", new Color3(1, 0.78, 0.45));
    this.glowViolet = mats.glow.violet;
    this.offMat = mats.lanternOff;
  }

  // ------------------------------------------------------------------ 部品
  // ------------------------------------------------------------------ helpers
  /** fn の中で作る部品を一つの建物としてまとめる（入れ子なら外側の建物に含める） */
  group(cat: StructureCategory, fadeable: boolean, fn: () => void) {
    if (this.cur || this.structures.length + 1 >= STRUCT_ID_SCALE) {
      fn();
      return;
    }
    const st: StructureInfo = { id: this.structures.length + 1, cat, fadeable, x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, top: 0 };
    this.cur = st;
    try {
      fn();
    } finally {
      this.cur = null;
    }
    if (st.x0 !== Infinity) this.structures.push(st);
  }

  /** 部品に今の建物 ID を入れ、建物の外接箱を広げる */
  tag(m: Mesh) {
    const st = this.cur;
    if (!st) return m;
    const col = m.getVerticesData(VertexBuffer.ColorKind);
    if (col) {
      const a = st.id / STRUCT_ID_SCALE;
      for (let i = 3; i < col.length; i += 4) col[i] = a;
      m.setVerticesData(VertexBuffer.ColorKind, col);
    }
    m.refreshBoundingInfo();
    const bb = m.getBoundingInfo().boundingBox;
    st.x0 = Math.min(st.x0, bb.minimumWorld.x);
    st.z0 = Math.min(st.z0, bb.minimumWorld.z);
    st.x1 = Math.max(st.x1, bb.maximumWorld.x);
    st.z1 = Math.max(st.z1, bb.maximumWorld.z);
    st.top = Math.max(st.top, bb.maximumWorld.y);
    return m;
  }

  add(part: Part, bucket: Bucket = this.stat) {
    bucket.push(this.tag(buildPart(this.scene, part, true)));
  }

  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, bucket: Bucket = this.stat, ry = 0) {
    this.add({ s: "box", c, p: [x, y, z], sc: [sx, sy, sz], r: ry ? [0, ry, 0] : undefined }, bucket);
  }

  cyl(x: number, y: number, z: number, d: number, h: number, c: string, bucket: Bucket = this.stat, top = 1) {
    this.add({ s: "cyl", c, p: [x, y, z], sc: [d, h, d], top }, bucket);
  }

  collide(r: Rect) {
    const c: { r: Rect; on: boolean; lv?: string[] } = { r, on: true };
    this.colliders.push(c);
    return c;
  }

  /** 寄棟／切妻屋根。W/D はワールドの x/z 幅、alongZ で棟を z 方向に。flat normal を明示し、裏面カリングに依存しない */
  roof(cx: number, cy: number, cz: number, W: number, D: number, H: number, c: string, gable: boolean, alongZ = false, bucket: Bucket = this.stat) {
    if (alongZ) [W, D] = [D, W];
    const rh = gable ? W / 2 : Math.max(0.2, (W - D) / 2);
    const A = [-W / 2, 0, -D / 2], B = [W / 2, 0, -D / 2], C = [W / 2, 0, D / 2], Dd = [-W / 2, 0, D / 2];
    const R1 = [-rh, H, 0], R2 = [rh, H, 0];
    const tris = [
      [A, B, R2], [A, R2, R1],
      [C, Dd, R1], [C, R1, R2],
      [B, C, R2], [Dd, A, R1],
    ];
    const pos: number[] = [], nor: number[] = [], ind: number[] = [];
    tris.forEach((t, i) => {
      const [a, b, cc] = t;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const cen = [(a[0] + b[0] + cc[0]) / 3, (a[1] + b[1] + cc[1]) / 3 - H * 0.3, (a[2] + b[2] + cc[2]) / 3];
      if (n[0] * cen[0] + n[1] * cen[1] + n[2] * cen[2] < 0) n = n.map((q) => -q);
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = n.map((q) => q / len);
      for (const p of t) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
      }
      ind.push(i * 3, i * 3 + 1, i * 3 + 2);
    });
    const m = new Mesh("roof", this.scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.normals = nor;
    vd.indices = ind;
    vd.uvs = new Array((pos.length / 3) * 2).fill(0);
    vd.applyToMesh(m);
    if (alongZ) m.rotation.y = Math.PI / 2;
    m.position.set(cx, cy, cz);
    m.bakeCurrentTransformIntoVertices();
    paint(m, c);
    bucket.push(this.tag(m));
  }

  /** 町家・商家 */
  house(
    cx: number, cz: number, w: number, d: number, h: number,
    face: "n" | "s" | "e" | "w",
    o: { wall?: string; roof?: string; thatch?: boolean; noren?: string; lit?: number; bucket?: Bucket; winBucket?: (lvl: number) => Bucket } = {},
  ) {
    this.group("building", true, () => this.houseBody(cx, cz, w, d, h, face, o));
  }

  houseBody(
    cx: number, cz: number, w: number, d: number, h: number,
    face: "n" | "s" | "e" | "w",
    o: { wall?: string; roof?: string; thatch?: boolean; noren?: string; lit?: number; bucket?: Bucket; winBucket?: (lvl: number) => Bucket },
  ) {
    const b = o.bucket ?? this.stat;
    const wall = o.wall ?? (this.rnd() < 0.5 ? "#e6dcc4" : "#d8ccb0");
    const wood = "#4a3426";
    const roofC = o.roof ?? (o.thatch ? "#7a6446" : this.rnd() < 0.5 ? "#4a5060" : "#3e4452");
    this.box(cx, 0.15, cz, w + 0.3, 0.3, d + 0.3, "#5a5654", b);
    this.box(cx, h / 2 + 0.15, cz, w, h, d, wall, b);
    // 下半分は板張り
    this.box(cx, 0.7, cz, w + 0.04, 1.1, d + 0.04, "#5b4230", b);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(cx + (sx * w) / 2, h / 2 + 0.15, cz + (sz * d) / 2, 0.22, h, 0.22, wood, b);
    this.box(cx, h + 0.1, cz, w + 0.25, 0.22, d + 0.25, wood, b);
    const alongZ = face === "e" || face === "w";
    this.roof(cx, h + 0.2, cz, w + 1.4, d + 1.4, o.thatch ? 2.4 : 1.7, roofC, !o.thatch && this.rnd() < 0.6, alongZ, b);
    // group の後なので、入れ子（外側の建物の中の家）なら外側の分類
    this.houses.push({ ...rect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2), cat: this.cur?.cat ?? "building" });
    this.roofs.push({ r: rect(cx - w / 2 - 0.5, cz - d / 2 - 0.5, cx + w / 2 + 0.5, cz + d / 2 + 0.5), h: h + 1.9 });
    this.collide(rect(cx - w / 2 - 0.2, cz - d / 2 - 0.2, cx + w / 2 + 0.2, cz + d / 2 + 0.2));

    // 正面：窓（障子の灯り）と暖簾
    const dir = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }[face];
    const fx = cx + (dir[0] * (w / 2 + 0.06));
    const fz = cz + (dir[1] * (d / 2 + 0.06));
    const lateral = alongZ ? d : w;
    const nWin = Math.max(1, Math.floor(lateral / 3));
    for (let i = 0; i < nWin; i++) {
      const t = (i + 0.5) / nWin - 0.5;
      const ox = alongZ ? 0 : t * lateral * 0.8;
      const oz = alongZ ? t * lateral * 0.8 : 0;
      const lvl = o.lit !== undefined ? o.lit : Math.floor(this.rnd() * 5);
      const wb = o.winBucket ? o.winBucket(lvl) : this.windows[lvl];
      this.box(fx + ox, h * 0.62 + 0.3, fz + oz, alongZ ? 0.08 : 1.3, 1.0, alongZ ? 1.3 : 0.08, "#ffffff", wb);
      this.box(fx + ox + dir[0] * 0.02, h * 0.62 + 0.3, fz + oz + dir[1] * 0.02, alongZ ? 0.06 : 0.07, 1.0, alongZ ? 0.07 : 0.06, wood, b);
    }
    if (o.noren) {
      const nx = fx + dir[0] * 0.25;
      const nz = fz + dir[1] * 0.25;
      for (let i = -1; i <= 1; i++) {
        this.box(nx + (alongZ ? 0 : i * 0.62), 2.0, nz + (alongZ ? i * 0.62 : 0), alongZ ? 0.04 : 0.56, 0.9, alongZ ? 0.56 : 0.04, o.noren, b);
      }
      // 看板
      this.box(fx + dir[0] * 0.2, h + 0.55, fz + dir[1] * 0.2, alongZ ? 0.12 : 2.4, 0.7, alongZ ? 2.4 : 0.12, "#2e2018", b);
      this.box(fx + dir[0] * 0.27, h + 0.55, fz + dir[1] * 0.27, alongZ ? 0.04 : 2.0, 0.45, alongZ ? 2.0 : 0.04, "#d8c49a", b);
    }
  }

  /** 吊り提灯 */
  lantern(x: number, y: number, z: number, level: number, color = "#ffffff", scale = 1, bucket?: Bucket) {
    const b = bucket ?? this.lamps[level];
    this.group("building", false, () => {
      this.add({ s: "sphere", c: color, p: [x, y, z], sc: [0.55 * scale, 0.75 * scale, 0.55 * scale] }, b);
      this.box(x, y + 0.42 * scale, z, 0.32 * scale, 0.08 * scale, 0.32 * scale, "#1c1418");
      this.box(x, y - 0.42 * scale, z, 0.32 * scale, 0.08 * scale, 0.32 * scale, "#1c1418");
    });
  }

  /** 石灯籠 */
  toro(x: number, z: number, level: number) {
    this.group("building", false, () => {
      this.cyl(x, 0.2, z, 0.9, 0.4, "#8a867c");
      this.cyl(x, 0.9, z, 0.32, 1.1, "#8a867c");
      this.box(x, 1.5, z, 0.8, 0.14, 0.8, "#8a867c");
      this.box(x, 1.85, z, 0.52, 0.56, 0.52, "#ffffff", this.lamps[level]);
      this.roof(x, 2.13, z, 1.2, 1.2, 0.5, "#7a766c", false);
    });
    this.circles.push({ x, z, r: 0.6 });
  }

  /** 鳥居 */
  torii(x: number, z: number, ry: number, s = 1, c = "#d0402a") {
    this.group("landmark", true, () => this.toriiBody(x, z, ry, s, c));
  }

  toriiBody(x: number, z: number, ry: number, s: number, c: string) {
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const at = (lx: number) => [x + cos * lx, z - sin * lx] as const;
    for (const sx of [-1, 1]) {
      const [px, pz] = at(sx * 1.6 * s);
      this.add({ s: "cyl", c, p: [px, 1.8 * s, pz], sc: [0.34 * s, 3.6 * s, 0.34 * s] });
      this.add({ s: "cyl", c: "#1c1418", p: [px, 0.2, pz], sc: [0.42 * s, 0.4, 0.42 * s] });
    }
    this.add({ s: "box", c: "#1c1418", p: [x, 3.75 * s, z], sc: [4.8 * s, 0.3 * s, 0.5 * s], r: [0, ry, 0] });
    this.add({ s: "box", c, p: [x, 3.5 * s, z], sc: [4.3 * s, 0.24 * s, 0.4 * s], r: [0, ry, 0] });
    this.add({ s: "box", c, p: [x, 2.9 * s, z], sc: [3.9 * s, 0.2 * s, 0.26 * s], r: [0, ry, 0] });
  }

  tree(x: number, z: number, kind: "momiji" | "pine" | "ginkgo" | "cedar", s = 1) {
    this.group("tree", true, () => this.treeBody(x, z, kind, s));
    this.circles.push({ x, z, r: 0.5 * s });
  }

  treeBody(x: number, z: number, kind: "momiji" | "pine" | "ginkgo" | "cedar", s: number) {
    const r = this.rnd;
    this.add({ s: "cyl", c: "#4a3628", p: [x, 1.2 * s, z], sc: [0.35 * s, 2.4 * s, 0.35 * s], top: 0.7 });
    if (kind === "pine" || kind === "cedar") {
      const col = kind === "pine" ? "#24402e" : "#1e3628";
      for (let i = 0; i < 3; i++) {
        this.add({ s: "cyl", c: col, p: [x, (2 + i * 1.3) * s, z], sc: [(3 - i * 0.8) * s, 2 * s, (3 - i * 0.8) * s], top: 0 });
      }
    } else {
      const cols = kind === "momiji" ? ["#c0402c", "#d8602e", "#a83426", "#e08a3a"] : ["#d8b030", "#e8c848", "#c09a28"];
      for (let i = 0; i < 4; i++) {
        this.add({
          s: "sphere", c: cols[Math.floor(r() * cols.length)],
          p: [x + (r() - 0.5) * 2 * s, (3 + r() * 1.5) * s, z + (r() - 0.5) * 2 * s], sc: (2 + r() * 1.2) * s,
        });
      }
    }
  }

  flush() {
    const merge = (list: Mesh[], name: string, mat: StandardMaterial) => {
      if (!list.length) return null;
      const out: Mesh[] = [];
      // 大量頂点を一度に結合すると重いので分割
      for (let i = 0; i < list.length; i += 600) {
        const m = Mesh.MergeMeshes(list.slice(i, i + 600), true, true)!;
        m.name = name;
        m.material = mat;
        m.isPickable = false;
        m.freezeWorldMatrix();
        m.doNotSyncBoundingInfo = true;
        out.push(m);
      }
      return out;
    };
    this.mats.static.backFaceCulling = false;
    merge(this.stat, "static", this.mats.static);
    for (let lvl = 0; lvl < 5; lvl++) {
      const a = merge(this.lamps[lvl], `lamps${lvl}`, this.offMat) ?? [];
      const b = merge(this.windows[lvl], `win${lvl}`, this.offMat) ?? [];
      a.forEach((m) => ((m as any).litMat = this.glowWarm));
      b.forEach((m) => ((m as any).litMat = this.glowWindow));
      this.lightGroups[lvl] = [...a, ...b];
    }
    // 妖怪横丁（町だけ。温泉宿など横丁の無い場所では作らない）
    if (!this.yokochoNode) return;
    const ys = merge(this.yokochoStatic, "yokochoStatic", this.mats.static) ?? [];
    const yl = merge(this.yokochoLamps, "yokochoLamps", this.glowViolet) ?? [];
    [...ys, ...yl].forEach((m) => (m.parent = this.yokochoNode));
    this.yokochoNode.setEnabled(false);
  }
}
