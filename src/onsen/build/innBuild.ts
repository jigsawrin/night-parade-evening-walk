import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, type Mesh } from "../../core/babylon";
import { ONSEN_DOORS, ONSEN_POOLS, ONSEN_ROOMS, ONSEN_SPOTS, ONSEN_WALLS, POOL_ENTRY_W, type OnsenRoom } from "../../data/onsenMap";
import type { OnsenWorld } from "../OnsenWorld";
import { groundStairs } from "./upperBuild";

/** 宿の色：焦茶の木・畳の緑・障子の白・行灯の橙（町より静かで暖かく） */
export const INN = {
  wood: "#5a3a24",
  woodDark: "#3a2416",
  beam: "#2e1c12",
  shoji: "#efe6cf",
  plaster: "#d8cbb0",
  tatami: "#8f9a5a",
  tatamiEdge: "#2e3a22",
  stone: "#66625a",
  gravel: "#6a665c",
  moss: "#34482f",
  cushion: "#6a2f3a",
  cushionBest: "#8a3a8a",
  gold: "#d8b050",
};

const FLOOR_COLOR: Record<OnsenRoom["floor"], string> = {
  tatami: INN.tatami, wood: "#6b4a30", stone: INN.stone, gravel: INN.gravel, moss: INN.moss,
};

/**
 * 宿の建物：床（畳・板・石）、壁と障子、柱、玄関と看板、帳場、大広間の座卓と囲炉裏、畳座敷の床の間と書棚、内湯の湯船、
 * 宴会場の長い座卓と襖（特別宴会場が開いていなければ閉じている）。座る居場所には座布団を敷く。
 * 屋根は付けない（箱庭をのぞき込むように、部屋の中が見える）。二階への階段は畳座敷の南の壁ぞい（二階・三階は build/upperBuild.ts）。
 */
export function buildInn(k: OnsenWorld) {
  floors(k);
  walls(k);
  genkan(k);
  hiroma(k);
  zashiki(k);
  uchiyu(k);
  banquet(k);
  cushions(k);
  groundStairs(k);
  // 縁側の柱と吊り提灯
  for (let x = -28; x <= 28; x += 7) {
    if (x > -25 && x < -17) continue;
    k.group("building", false, () => k.cyl(x, 1.3, 2.85, 0.26, 2.6, "#b8322a"));
    k.circles.push({ x, z: 2.85, r: 0.2 });
    k.lantern(x + 3.5, 2.3, 2.6, 0, "#ffffff", 0.7);
  }
}

function floors(k: OnsenWorld) {
  // 宿のまわりの地面（夜の苔と土）
  k.box(13, -0.06, 7, 120, 0.1, 110, "#26311f");
  for (const room of ONSEN_ROOMS) {
    if (room.area === "okuniwa" || room.area === "tsukimi") continue;
    const r = room.r;
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    k.box((r.x0 + r.x1) / 2, 0.01, (r.z0 + r.z1) / 2, w, 0.04, d, FLOOR_COLOR[room.floor]);
    // 畳の目地
    if (room.floor === "tatami") {
      for (let x = r.x0 + 2; x < r.x1; x += 2) k.box(x, 0.035, (r.z0 + r.z1) / 2, 0.06, 0.01, d, INN.tatamiEdge);
      for (let z = r.z0 + 4; z < r.z1; z += 4) k.box((r.x0 + r.x1) / 2, 0.035, z, w, 0.01, 0.06, INN.tatamiEdge);
    }
  }
}

function walls(k: OnsenWorld) {
  for (const w of ONSEN_WALLS) {
    const r = w.r;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const sx = r.x1 - r.x0, sz = r.z1 - r.z0;
    const along = sx > sz ? sx : sz;
    k.group("building", true, () => {
      if (w.kind === "hedge") {
        k.box(cx, w.h / 2, cz, sx + 0.5, w.h, sz + 0.5, "#2c4428");
        return;
      }
      if (w.kind === "fence") {
        k.box(cx, w.h / 2, cz, sx, w.h, sz, "#8a8a4a");
        const n = Math.max(2, Math.round(along / 0.9));
        for (let i = 0; i <= n; i++) {
          const t = i / n - 0.5;
          k.cyl(cx + (sx > sz ? t * sx : 0), w.h / 2 + 0.1, cz + (sx > sz ? 0 : t * sz), 0.14, w.h + 0.2, "#a8a860");
        }
        k.box(cx, w.h * 0.7, cz, sx + (sx > sz ? 0 : 0.2), 0.12, sz + (sx > sz ? 0.2 : 0), INN.woodDark);
        return;
      }
      // 宿の壁：腰板・障子・長押
      k.box(cx, 0.5, cz, sx, 1, sz, INN.wood);
      k.box(cx, 1 + (w.h - 1) / 2, cz, sx * 0.98, w.h - 1, sz * 0.98, INN.shoji);
      k.box(cx, w.h, cz, sx + 0.06, 0.16, sz + 0.06, INN.beam);
      const n = Math.max(1, Math.round(along / 1.8));
      for (let i = 0; i <= n; i++) {
        const t = i / n - 0.5;
        k.box(cx + (sx > sz ? t * sx : 0), w.h / 2, cz + (sx > sz ? 0 : t * sz), sx > sz ? 0.12 : sx + 0.05, w.h, sx > sz ? sz + 0.05 : 0.12, INN.woodDark);
      }
    });
  }
}

function genkan(k: OnsenWorld) {
  // 玄関の庇と看板「宵霞楼」
  k.group("building", true, () => {
    for (const sx of [-3.4, 3.4]) k.cyl(sx, 1.6, -24.6, 0.34, 3.2, INN.woodDark);
    k.box(0, 3.3, -24.6, 8, 0.3, 1.6, INN.beam);
    k.roof(0, 3.45, -24.6, 9.6, 3, 1.6, "#3a3f4e", false);
  });
  for (const sx of [-2.6, 2.6]) k.lantern(sx, 2.4, -25.1, 0, "#ffffff", 0.9);
  // 暖簾（玄関の庇と同じく、近づいたら透ける）
  k.group("building", true, () => {
    for (let i = -2; i <= 2; i++) k.box(i * 1.2, 2.45, -24.2, 1.1, 0.9, 0.04, "#2a3a6a");
  });
  signboard(k);
  // 上がり框と沓脱石
  k.box(0, 0.15, -18.2, 12, 0.3, 1.2, INN.woodDark);
  k.box(0, 0.08, -19.6, 2, 0.16, 0.8, INN.stone);
  // 帳場：帳場格子と帳面、上座のそばの行灯
  k.group("building", false, () => {
    k.box(9.5, 0.5, -18.6, 5, 1, 0.8, INN.wood);
    k.box(9.5, 1.1, -18.6, 5, 0.1, 0.9, INN.woodDark);
    for (let x = 7.2; x <= 11.8; x += 0.5) k.box(x, 1.45, -18.25, 0.05, 0.6, 0.05, INN.beam);
    k.box(8.5, 1.18, -18.7, 0.8, 0.06, 0.5, "#e8dcc0");
  });
  k.collide({ x0: 7, z0: -19, x1: 12, z1: -18.2 });
  andon(k, 14.8, -22.8);
  // 上座の脇息と茶
  k.box(14.2, 0.3, -20.5, 0.3, 0.3, 1, INN.woodDark);
  k.cyl(12, 0.12, -19.6, 0.25, 0.2, "#6a7a5a");
}

/** 看板「宵霞楼」（字は同梱のフォントで描く） */
function signboard(k: OnsenWorld) {
  const tex = new DynamicTexture("innSign", { width: 512, height: 160 }, k.scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#2a1a10";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = "#e8cf8a";
  ctx.font = '110px "Yuji Syuku", "Shippori Mincho", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("宵霞楼", 256, 86);
  tex.update();
  const m = new StandardMaterial("innSignMat", k.scene);
  m.diffuseTexture = tex;
  m.emissiveTexture = tex;
  m.emissiveColor = new Color3(0.55, 0.5, 0.45);
  m.specularColor = new Color3(0, 0, 0);
  const p = MeshBuilder.CreatePlane("innSign", { width: 3.6, height: 1.12 }, k.scene);
  p.position.set(0, 4.35, -25.5);
  p.material = m;
  p.isPickable = false;
  k.sign = p;
  // 同梱のフォントが読み込まれたら描き直す
  void document.fonts?.load('110px "Yuji Syuku"', "宵霞楼").then(() => {
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(16, 16, 480, 128);
    ctx.fillStyle = "#e8cf8a";
    ctx.fillText("宵霞楼", 256, 86);
    tex.update();
  });
}

/** 置き行灯（lamps：灯りを入れる先。奥庭の行灯は別にまとめて、閉じている間は消す） */
export function andon(k: OnsenWorld, x: number, z: number, lamps: Mesh[] = k.lamps[0]) {
  k.group("building", false, () => {
    k.box(x, 0.35, z, 0.5, 0.7, 0.5, INN.woodDark);
    k.box(x, 0.85, z, 0.55, 0.7, 0.55, "#ffffff", lamps);
  });
  k.circles.push({ x, z, r: 0.35 });
}

function lowTable(k: OnsenWorld, x: number, z: number, w: number, d: number) {
  k.group("building", false, () => {
    k.box(x, 0.42, z, w, 0.1, d, INN.woodDark);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(x + sx * (w / 2 - 0.2), 0.2, z + sz * (d / 2 - 0.2), 0.14, 0.4, 0.14, INN.beam);
    // 湯呑みと菓子
    k.cyl(x - w * 0.2, 0.52, z, 0.2, 0.16, "#8a9a7a");
    k.cyl(x + w * 0.2, 0.5, z + d * 0.15, 0.36, 0.06, "#e8dcc0");
  });
  k.collide({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
}

function hiroma(k: OnsenWorld) {
  lowTable(k, -7, -8.5, 3.6, 3.6);
  lowTable(k, 7, -8.5, 3.6, 3.6);
  // 囲炉裏
  k.group("building", false, () => {
    k.box(0, 0.08, -8.5, 2.2, 0.16, 2.2, INN.beam);
    k.box(0, 0.1, -8.5, 1.6, 0.1, 1.6, "#3a2a22");
    k.add({ s: "sphere", c: "#ffffff", p: [0, 0.2, -8.5], sc: [0.9, 0.3, 0.9] }, k.lamps[1]);
    k.cyl(0, 1.6, -8.5, 0.06, 3, INN.beam);
    k.cyl(0, 0.75, -8.5, 0.5, 0.5, "#2a2224");
  });
  k.circles.push({ x: 0, z: -8.5, r: 1.1 });
  for (const x of [-7, 7]) k.lantern(x, 2.2, -8.5, 0, "#ffffff", 0.8);
}

function zashiki(k: OnsenWorld) {
  lowTable(k, -21.5, -8.5, 3, 2.6);
  // 床の間（掛け軸と生け花）
  k.group("building", false, () => {
    k.box(-29.4, 0.12, -3.5, 1, 0.24, 4, INN.wood);
    k.box(-29.8, 1.4, -3.5, 0.06, 1.6, 0.7, "#f0e8d8");
    k.box(-29.76, 1.5, -3.5, 0.02, 1.0, 0.4, "#2a2a3a");
    k.cyl(-29.3, 0.4, -2.3, 0.3, 0.4, "#5a6a7a");
    k.add({ s: "sphere", c: "#c04030", p: [-29.3, 0.8, -2.3], sc: 0.35 });
  });
  k.collide({ x0: -29.9, z0: -5.5, x1: -28.9, z1: -1.5 });
  // 書棚（白沢の居場所のそば）
  k.group("building", false, () => {
    k.box(-29.5, 0.9, -9, 0.6, 1.8, 3.4, INN.woodDark);
    const cols = ["#6a3a2a", "#2a4a6a", "#8a7a4a", "#3a5a3a"];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) k.box(-29.3, 0.35 + row * 0.55, -10.4 + i * 0.55, 0.3, 0.42, 0.3, cols[(i + row) % 4]);
  });
  k.collide({ x0: -29.9, z0: -10.8, x1: -29.1, z1: -7.2 });
  andon(k, -15.3, -15.8);
}

function uchiyu(k: OnsenWorld) {
  const p = ONSEN_POOLS.find((q) => q.id === "uchiyu")!.r;
  k.group("building", false, () => {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0;
    // 檜の湯船の縁（西の入り口だけ縁が低い踏み段）
    const e = ONSEN_POOLS.find((q) => q.id === "uchiyu")!.entry, gw = POOL_ENTRY_W / 2;
    k.box(cx, 0.3, p.z0, w + 0.6, 0.6, 0.5, "#b8946a");
    k.box(cx, 0.3, p.z1, w + 0.6, 0.6, 0.5, "#b8946a");
    for (const [a, b] of [[p.z0, e.z - gw], [e.z + gw, p.z1]]) k.box(p.x0, 0.3, (a + b) / 2, 0.5, 0.6, b - a, "#b8946a");
    k.box(p.x0, 0.06, e.z, 0.6, 0.12, gw * 2, "#9a7a56");
    k.box(p.x1, 0.3, cz, 0.5, 0.6, d, "#b8946a");
    // 湯口
    k.box(p.x1 + 0.2, 0.8, cz, 0.5, 0.5, 0.5, INN.stone);
  });
  // 手桶の山
  k.group("building", false, () => {
    for (const [dx, y] of [[0, 0.2], [0.5, 0.2], [0.25, 0.55]]) k.cyl(28.3 + dx, y, -2, 0.45, 0.35, "#c8a878");
  });
  k.circles.push({ x: 28.5, z: -2, r: 0.6 });
  andon(k, 15.2, -1.2);
}

function banquet(k: OnsenWorld) {
  // 長い座卓と酒
  k.group("building", false, () => {
    k.box(-20, 0.42, 11.5, 10, 0.12, 2, INN.woodDark);
    for (const x of [-24.5, -15.5]) for (const z of [10.8, 12.2]) k.box(x, 0.2, z, 0.16, 0.4, 0.16, INN.beam);
    for (let i = 0; i < 6; i++) {
      k.cyl(-24 + i * 1.8, 0.62, 11.3 + (i % 2) * 0.4, 0.22, 0.34, "#e8e0d0");
      k.cyl(-23.4 + i * 1.8, 0.52, 11.7, 0.26, 0.06, "#c03a2a");
    }
  });
  k.collide({ x0: -25, z0: 10.5, x1: -15, z1: 12.5 });
  // 金屏風
  k.group("building", false, () => {
    for (let i = 0; i < 4; i++) k.box(-29.6, 1.1, 7 + i * 1.3, 0.08, 1.8, 1.25, i % 2 ? INN.gold : "#c8a040", undefined, i % 2 ? 0.25 : -0.25);
  });
  for (const x of [-26, -20, -14]) k.lantern(x, 2.2, 11.5, 1, "#ffffff", 0.9);
  // 襖（閉じていれば通れない。開いていれば脇へ引いてある）
  const d = ONSEN_DOORS.banquet;
  const open = k.access.banquet;
  k.group("building", true, () => {
    const panels = 4, w = (d.x1 - d.x0) / panels;
    for (let i = 0; i < panels; i++) {
      const x = open ? d.x1 + 0.2 + i * 0.12 : d.x0 + w * (i + 0.5);
      const z = open ? 3 - 0.35 - i * 0.12 : 3;
      k.box(x, 1.2, z, open ? 0.08 : w - 0.05, 2.3, open ? w - 0.05 : 0.08, "#e8dcc0");
      if (!open) k.add({ s: "sphere", c: "#3a5a4a", p: [x, 1.4 + (i % 2) * 0.3, z - 0.06], sc: [w * 0.5, 0.5, 0.02] });
      k.box(x, 2.38, z, open ? 0.12 : w, 0.08, open ? w : 0.12, INN.beam);
    }
  });
}

/** 座る居場所には座布団（上座は特別な色） */
function cushions(k: OnsenWorld) {
  for (const s of ONSEN_SPOTS) {
    if (s.pose !== "sit" || (s.floor ?? 1) !== 1) continue;
    if (s.area === "banquet" && !k.access.banquet) continue;
    const best = s.id.endsWith("kamiza");
    const put = () => {
      k.box(s.x, 0.06, s.z, best ? 1.25 : 1, 0.12, best ? 1.25 : 1, best ? INN.cushionBest : INN.cushion, undefined, s.yaw);
      if (best) k.box(s.x, 0.13, s.z, 1.3, 0.02, 1.3, INN.gold, undefined, s.yaw);
    };
    // 奥庭の座布団は奥庭と一緒に見せる・隠す
    if (s.area === "tsukimi" || s.area === "okuniwa") k.track(k.inner.openIds, () => k.group("building", false, put));
    else put();
  }
}
