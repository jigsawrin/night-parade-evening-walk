import { Mesh, TransformNode, type Scene, type StandardMaterial } from "../core/babylon";
import type { Materials } from "../world/Materials";
import type { StructureInfo } from "../world/structureFade";
import { WorldKit } from "../world/WorldKit";
import { ONSEN_BOUNDS, ONSEN_DOORS, ONSEN_POND, ONSEN_POOLS, ONSEN_STAIRS, ONSEN_WALLS, type ORect } from "../data/onsenMap";
import { ONSEN_BATH } from "../data/onsen";
import type { OnsenAccess } from "../game/onsen/OnsenVisit";
import { groundAt, levelKey, poolRimRects, stairColliders, stepLevel, type OnsenLevel } from "../game/onsen/OnsenGroundRules";
import { buildInn } from "./build/innBuild";
import { buildGardens } from "./build/gardenBuild";
import { buildGrand } from "./build/grandBuild";
import { buildUpperFloor } from "./build/upperBuild";

/** 上の階で作る、透かせる建物グループの数の上限（StructureVisibilityDirector の空き） */
export const UPPER_GROUPS = 16;
/** 地上の当たり（lv の無い当たりは地上で効く） */
const GROUND = ["1"];
/** 上の階を作っている間の建物グループ（ID 0 = どの建物でもない：上の階は透かさず、見せるか隠すかだけ） */
const NO_GROUP: StructureInfo = { id: 0, cat: "building", fadeable: false, x0: 0, z0: 0, x1: 0, z1: 0, top: 0 };

const inR = (r: ORect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

/**
 * 温泉宿「宵霞楼」の箱庭（本編の町 World とは別）。組み立ては町と同じ WorldKit の部品（建物グループ・結合・灯り）で、
 * 近くの壁や屋根はカメラと主人公の間で透ける（StructureVisibilityDirector）。
 * 宴会場の襖・奥庭の門は、解禁（OnsenAccess）で開いているときだけ通れる。閉じている奥庭は森のまま。
 * 月見の奥庭は、開いているときの姿（奥庭・開いた扉）と閉じているときの姿（森・閉じた扉）を両方作っておき、
 * 片方を隠す（StructureVisibilityDirector.setHiddenIds）。訪問の途中で最深部が開いたら openInner で切り替える（宿は作り直さない）
 * 二階・三階（build/upperBuild.ts）は、階段を上りはじめるまで作らない（buildFloor）。見せるのは今いる階とその下だけ（setShownFloor）で、
 * 上の階が下の階のカメラ・見た目の邪魔をしない。当たりは今いる階（または階段）のものだけが効く（OnsenGroundRules）。
 * ここは出来上がった宿への問い合わせ（歩ける・押し戻し・高さ・カメラを遮るもの）と、階の切り替えだけ。
 */
export class OnsenWorld extends WorldKit {
  /** 赤い提灯（にじむ赤の灯り。結合して一つに。上の階を作る間だけ、その階の入れ物に差し替える） */
  redLamps: Mesh[] = [];
  /** 階段ごとの建物グループ（上っている間は透かさない：StructureVisibilityDirector.setSolidIds） */
  readonly stairIds: Record<string, number[]> = {};
  /** 玄関の看板（材質が別なので、近づいたときの透かしは OnsenApp で） */
  sign: Mesh | null = null;
  /** 主人公のいる階（階段の途中も） */
  level: OnsenLevel = { floor: 1, stair: null };
  /** 見せている階の上限 */
  shown = 1;
  private floorNodes = new Map<number, TransformNode>();
  /**
   * 月見の奥庭の二つの姿：openIds = 開いているときに見せる建物グループ、closedIds = 閉じているときに見せる（森・閉じた扉）。
   * lamps = 奥庭の行灯（別に結合して、閉じている間は消す）、forestCircles = 閉じている森の木の当たり
   */
  readonly inner = { openIds: [] as number[], closedIds: [] as number[], lamps: [] as Mesh[], forestCircles: [] as { x: number; z: number; r: number }[] };
  /** 月見の奥庭が開いているか（訪問の途中で openInner で開く） */
  innerOpen: boolean;
  private innerGate: { on: boolean } | null = null;
  private innerLampMesh: Mesh | null = null;

  constructor(scene: Scene, mats: Materials, readonly access: OnsenAccess) {
    super(scene, mats);
    this.innerOpen = access.inner;
  }

  /** fn の中で作った建物グループの ID を list へ記録する */
  track(list: number[], fn: () => void) {
    const before = this.structures.length;
    fn();
    for (let i = before; i < this.structures.length; i++) list.push(this.structures[i].id);
  }

  /**
   * 上の階を作っている間でも、透かせる建物グループにする（上の階の階段：その下にいるときに透ける）。
   * ID は StructureVisibilityDirector の reserve（UPPER_GROUPS）の中
   */
  fadeGroup(list: number[], fn: () => void) {
    const keep = this.cur;
    this.cur = null;
    try {
      this.track(list, () => this.group("building", false, fn));
    } finally {
      this.cur = keep;
    }
  }

  /** 今隠しておく建物グループ（奥庭の、今は見せない方の姿） */
  hiddenInnerIds() {
    return this.innerOpen ? this.inner.closedIds : this.inner.openIds;
  }

  /**
   * 訪問の途中で月見の奥庭を開く（ぬらりひょんを見つけて最深部が開いたとき）：門を通れるようにし、森の当たりを外し、奥庭の行灯を灯す。
   * 見た目の切り替えは呼ぶ側が hiddenInnerIds を StructureVisibilityDirector へ渡す。すでに開いていれば false
   */
  openInner() {
    if (this.innerOpen) return false;
    this.innerOpen = true;
    if (this.innerGate) this.innerGate.on = false;
    const drop = new Set(this.inner.forestCircles);
    for (let i = this.circles.length - 1; i >= 0; i--) if (drop.has(this.circles[i])) this.circles.splice(i, 1);
    this.innerLampMesh?.setEnabled(true);
    return true;
  }

  build() {
    buildInn(this);
    buildGardens(this);
    buildGrand(this);
    for (const w of ONSEN_WALLS) this.collide(w.r);
    // 湯は縁の切れ目から入れる（縁は越えられない）
    for (const p of ONSEN_POOLS) for (const r of poolRimRects(p)) this.collide(r);
    for (const s of ONSEN_STAIRS) for (const c of stairColliders(s)) this.collide(c.r).lv = c.lv;
    this.collide({ x0: ONSEN_POND.x0 + 0.3, z0: ONSEN_POND.z0 + 0.3, x1: ONSEN_POND.x1 - 0.3, z1: ONSEN_POND.z1 - 0.3 });
    if (!this.access.banquet) this.collide(ONSEN_DOORS.banquet);
    this.innerGate = this.collide(ONSEN_DOORS.inner);
    this.innerGate.on = !this.innerOpen;
    this.flush();
    if (this.inner.lamps.length) {
      const m = Mesh.MergeMeshes(this.inner.lamps, true, true)!;
      m.material = this.glowWarm;
      m.isPickable = false;
      m.setEnabled(this.innerOpen);
      this.innerLampMesh = m;
    }
    if (this.redLamps.length) {
      const red = Mesh.MergeMeshes(this.redLamps, true, true)!;
      red.material = this.mats.glow.red;
      red.isPickable = false;
      red.freezeWorldMatrix();
    }
    // 宿の灯りはいつも灯っている（行灯・提灯・障子の明かり）
    for (const g of this.lightGroups) for (const m of g) m.material = (m as unknown as { litMat: typeof m.material }).litMat;
  }

  /** 建物の部品に使っている材質（建物の透過プラグインを付ける） */
  structureMaterials() {
    return [this.mats.static, this.offMat, this.glowWarm, this.glowWindow, this.glowViolet];
  }

  /**
   * 上の階を作る（階段を上りはじめたとき。一度だけ）。部品は階ごとに結合して一つの入れ物にまとめ、見せる・隠すを入れ物ごとに。
   * 当たりはその階でだけ効く。すでに作ってあれば false
   */
  buildFloor(n: number) {
    if (this.floorNodes.has(n)) return false;
    const node = new TransformNode(`onsenFloor${n}`, this.scene);
    const keep = { stat: this.stat, warm: this.lamps[0], red: this.redLamps };
    const b = { stat: [] as Mesh[], warm: [] as Mesh[], red: [] as Mesh[] };
    const nc = this.colliders.length, ncc = this.circles.length;
    this.stat = b.stat;
    this.lamps[0] = b.warm;
    this.redLamps = b.red;
    this.cur = NO_GROUP;
    try {
      buildUpperFloor(this, n);
    } finally {
      this.cur = null;
      this.stat = keep.stat;
      this.lamps[0] = keep.warm;
      this.redLamps = keep.red;
    }
    const lv = [String(n)];
    for (const c of this.colliders.slice(nc)) c.lv ??= lv;
    for (const c of this.circles.slice(ncc)) c.lv ??= lv;
    const merge = (list: Mesh[], mat: StandardMaterial) => {
      for (let i = 0; i < list.length; i += 600) {
        const m = Mesh.MergeMeshes(list.slice(i, i + 600), true, true)!;
        m.material = mat;
        m.isPickable = false;
        m.parent = node;
        m.freezeWorldMatrix();
      }
    };
    merge(b.stat, this.mats.static);
    merge(b.warm, this.glowWarm);
    merge(b.red, this.mats.glow.red);
    node.setEnabled(n <= this.shown);
    this.floorNodes.set(n, node);
    return true;
  }

  isFloorBuilt(n: number) {
    return this.floorNodes.has(n);
  }

  /** 見せる階の上限を変える（上の階は隠す）。変わったら true */
  setShownFloor(n: number) {
    if (n === this.shown) return false;
    this.shown = n;
    for (const [f, node] of this.floorNodes) node.setEnabled(f <= n);
    return true;
  }

  /** 主人公が動いた後に、階段に入った・階段から出たを見る */
  updateLevel(x: number, z: number) {
    this.level = stepLevel(this.level, x, z);
    return this.level;
  }

  /** 足元の高さ（階・階段・湯の中は沈む） */
  groundHeight(x: number, z: number) {
    return groundAt(this.level, x, z, ONSEN_BATH);
  }

  /** 今の場所で効く当たりか */
  private active(lv: string[] | undefined) {
    return (lv ?? GROUND).includes(levelKey(this.level));
  }

  isWalkable(x: number, z: number, rad = 0.4) {
    const b = ONSEN_BOUNDS;
    if (x < b.x0 + 1 || x > b.x1 - 1 || z < b.z0 + 1 || z > b.z1 - 1) return false;
    for (const c of this.colliders) if (c.on && this.active(c.lv) && inR(c.r, x, z, rad)) return false;
    return true;
  }

  /** 円 vs 箱・円の押し戻し（町の World.resolve と同じ考え方） */
  resolve(p: { x: number; z: number }, rad: number) {
    const b = ONSEN_BOUNDS;
    p.x = Math.min(Math.max(p.x, b.x0 + 1), b.x1 - 1);
    p.z = Math.min(Math.max(p.z, b.z0 + 1), b.z1 - 1);
    for (const c of this.colliders) {
      if (!c.on || !this.active(c.lv)) continue;
      const r = c.r;
      if (!inR(r, p.x, p.z, rad)) continue;
      const cx = Math.min(Math.max(p.x, r.x0), r.x1);
      const cz = Math.min(Math.max(p.z, r.z0), r.z1);
      const dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001) {
        if (d < rad) {
          p.x = cx + (dx / d) * rad;
          p.z = cz + (dz / d) * rad;
        }
      } else {
        const pushes = [p.x - r.x0 + rad, r.x1 - p.x + rad, p.z - r.z0 + rad, r.z1 - p.z + rad];
        const m = Math.min(...pushes);
        if (m === pushes[0]) p.x = r.x0 - rad;
        else if (m === pushes[1]) p.x = r.x1 + rad;
        else if (m === pushes[2]) p.z = r.z0 - rad;
        else p.z = r.z1 + rad;
      }
    }
    for (const c of this.circles) {
      if (!this.active(c.lv)) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + rad;
      if (d < min && d > 0.0001) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
  }

  /**
   * カメラを遮るものの高さ（外周の森だけ）。宿の壁・塀・生垣は近づくと透ける（StructureVisibilityDirector）ので、
   * カメラを寄せる遮りにはしない（部屋の中ではどこにでも壁があり、寄せるとすぐアップになってしまう）
   */
  cameraObstacle(x: number, z: number) {
    const b = ONSEN_BOUNDS;
    const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    return edge < -1.5 ? 9 : 0;
  }
}
