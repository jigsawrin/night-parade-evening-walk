import { ONSEN_WALLS } from "../../data/onsenMap";
import type { OnsenWorld } from "../OnsenWorld";
import { INN } from "./innBuild";

/** 朱塗り・金・夜の瓦（煌びやかな湯屋の色） */
export const SHU = "#b8322a";
export const SHU_DARK = "#7a1e1a";
export const ROOF = "#2c3a3a";
/** 提灯を吊るす紐（黒い電線に見えないよう、暗い朱の組紐） */
const CORD = "#6a2a22";

/**
 * 宵霞楼を煌びやかに：前庭の朱の大門、宿の北にそびえる高楼（何層もの灯りの窓と朱の欄干）、提灯の連なり、縁側の朱の欄干、
 * 外に面した障子の灯り、参道の朱の提灯柱。灯りは町と同じ灯りの材質（赤い提灯は OnsenWorld.redLamps）でにじむ。
 * 重くしない：静的な部品として結合する（動くものは OnsenAtmosphere）。
 */
export function buildGrand(k: OnsenWorld) {
  mainGate(k);
  tower(k);
  approachPoles(k);
  railings(k);
  litShoji(k);
  // 提灯の連なり：玄関の前・縁側の軒・中庭の上・露天風呂の上・大岩風呂
  garland(k, -14, -27.4, 16, -27.4, 4.2, 14);
  garland(k, -30, 3.25, 30, 3.25, 3.1, 24);
  garland(k, -12, 4, 12, 22, 4.6, 12);
  garland(k, 12, 22, -12, 4.5, 4.6, 12);
  garland(k, 12.5, 4, 33.5, 22, 4.2, 12);
  garland(k, 35, -13, 58, 22, 4.8, 14);
  for (const [x, z] of [[-14, -27.4], [16, -27.4], [-12, 4], [12, 22], [-12, 22], [12, 4], [33.5, 22], [35, -13], [58, 22]]) post(k, x, z, 4.6);
}

/** 赤い提灯（にじむ） */
export function redLantern(k: OnsenWorld, x: number, y: number, z: number, s = 1) {
  k.add({ s: "sphere", c: "#ffffff", p: [x, y, z], sc: [0.5 * s, 0.68 * s, 0.5 * s] }, k.redLamps);
  k.box(x, y + 0.38 * s, z, 0.28 * s, 0.07 * s, 0.28 * s, "#1c1418");
  k.box(x, y - 0.38 * s, z, 0.28 * s, 0.07 * s, 0.28 * s, "#1c1418");
}

/**
 * 二点の間にたるんで吊るした提灯の列（赤と温かい白を交互に）。紐は隣の提灯どうしをまっすぐつなぐ（傾けて途切れさせない）。
 * 紐一本と、その先の提灯を一つの小物にまとめる（近づいたとき・カメラの前をふさぐときに透ける）
 */
function garland(k: OnsenWorld, x0: number, z0: number, x1: number, z1: number, h: number, n: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(x1 - x0, z1 - z0);
  const hl = len / n;
  const at = (i: number) => {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * Math.min(1.2, len * 0.04);
    return { x: x0 + (x1 - x0) * t, y: h - sag, z: z0 + (z1 - z0) * t };
  };
  for (let i = 0; i < n; i++) {
    const a = at(i), b = at(i + 1);
    const dy = b.y - a.y;
    k.group("building", false, () => {
      // 紐（提灯の少し上を通る）
      k.add({ s: "box", c: CORD, p: [(a.x + b.x) / 2, (a.y + b.y) / 2 + 0.35, (a.z + b.z) / 2], sc: [0.04, 0.04, Math.hypot(hl, dy) + 0.02], r: [-Math.atan2(dy, hl), ang, 0] });
      if (i + 1 === n) return;
      if ((i + 1) % 2) redLantern(k, b.x, b.y, b.z, 0.6);
      else k.add({ s: "sphere", c: "#ffffff", p: [b.x, b.y, b.z], sc: [0.3, 0.4, 0.3] }, k.lamps[0]);
    });
  }
}

function post(k: OnsenWorld, x: number, z: number, h: number) {
  k.group("building", false, () => k.cyl(x, h / 2, z, 0.22, h, SHU));
  k.circles.push({ x, z, r: 0.2 });
}

/** 前庭の入口の朱の大門（大きな赤提灯を二つ） */
function mainGate(k: OnsenWorld) {
  const z = -43.4;
  k.group("landmark", true, () => {
    for (const sx of [-4, 4]) {
      k.cyl(sx, 2.8, z, 0.6, 5.6, SHU);
      k.cyl(sx, 0.2, z, 0.8, 0.4, "#1c1418");
    }
    k.box(0, 5.4, z, 10, 0.5, 0.8, SHU_DARK);
    k.box(0, 4.8, z, 8.6, 0.3, 0.5, SHU);
    k.roof(0, 5.7, z, 12, 3, 1.8, ROOF, false);
    k.box(0, 5.1, z - 0.45, 3, 0.9, 0.08, "#2a1a10");
    k.box(0, 5.1, z - 0.5, 2.6, 0.6, 0.04, INN.gold);
  });
  for (const sx of [-2, 2]) k.group("building", false, () => redLantern(k, sx, 3.6, z, 1.5));
  for (const sx of [-4, 4]) k.circles.push({ x: sx, z, r: 0.45 });
}

/** 参道の両脇の朱の提灯柱 */
function approachPoles(k: OnsenWorld) {
  for (let z = -39; z <= -27; z += 4) {
    for (const sx of [-6.5, 6.5]) {
      k.group("building", false, () => {
        k.cyl(sx, 1.4, z, 0.16, 2.8, SHU);
        k.box(sx, 2.85, z, 0.9, 0.08, 0.12, SHU_DARK);
        redLantern(k, sx, 2.35, z, 0.7);
      });
      k.circles.push({ x: sx, z, r: 0.15 });
    }
  }
}

/** 縁側の朱の欄干（中庭・露天風呂へ降りる口は開けてある） */
function railings(k: OnsenWorld) {
  const spans: [number, number][] = [[-12, -1.8], [2.6, 12], [12, 16.5], [21.5, 30]];
  for (const [a, b] of spans) {
    k.group("building", false, () => {
      k.box((a + b) / 2, 0.85, 3.05, b - a, 0.1, 0.12, SHU);
      k.box((a + b) / 2, 0.45, 3.05, b - a, 0.06, 0.08, SHU_DARK);
      for (let x = a; x <= b + 0.01; x += 1.5) k.cyl(x, 0.45, 3.05, 0.12, 0.9, SHU);
    });
    k.collide({ x0: a, z0: 2.95, x1: b, z1: 3.15 });
  }
}

/** 外に面した壁の障子に灯り（宿の中の賑わいが外へ漏れる） */
function litShoji(k: OnsenWorld) {
  for (const w of ONSEN_WALLS) {
    if (w.kind !== "wall") continue;
    const r = w.r;
    const outer = r.z1 < -16.5 || Math.abs(r.x0) > 29;
    if (!outer) continue;
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const n = Math.floor(len / 2.2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const cx = (r.x0 + r.x1) / 2 + (alongX ? t * len : 0), cz = (r.z0 + r.z1) / 2 + (alongX ? 0 : t * len);
      k.group("building", true, () => k.box(cx, 1.65, cz, alongX ? 1.5 : 0.36, 1.0, alongX ? 0.36 : 1.5, "#ffffff", k.windows[i % 3]));
    }
  }
}

/** 宿の北にそびえる高楼（何層もの灯りの窓・朱の欄干・反った屋根・提灯）。歩いては行けない遠景 */
function tower(k: OnsenWorld) {
  const cz = 88;
  const floors = [
    { w: 44, d: 20, h: 6 },
    { w: 36, d: 17, h: 5.5 },
    { w: 29, d: 14, h: 5 },
    { w: 22, d: 11, h: 4.6 },
    { w: 14, d: 8, h: 4.2 },
  ];
  let y = 0;
  floors.forEach((f, i) => {
    k.box(0, y + f.h / 2, cz, f.w, f.h, f.d, i % 2 ? "#5a3020" : "#6a3a24");
    // 灯りの窓（層ごとに一列）
    const n = Math.floor(f.w / 2.6);
    for (let j = 0; j < n; j++) {
      const x = -f.w / 2 + 1.3 + j * 2.6;
      if ((j * 7 + i * 3) % 5 === 0) continue;
      k.box(x, y + f.h * 0.52, cz - f.d / 2 - 0.05, 1.7, f.h * 0.46, 0.1, "#ffffff", k.windows[(j + i) % 5]);
    }
    // 朱の欄干
    k.box(0, y + f.h + 0.15, cz - f.d / 2 - 0.9, f.w + 1.6, 0.3, 0.2, SHU);
    k.box(0, y + f.h - 0.1, cz, f.w + 2.4, 0.3, f.d + 2.4, SHU_DARK);
    // 反った屋根
    k.roof(0, y + f.h + 0.1, cz, f.w + 4.5, f.d + 4.5, 2.2, ROOF, false);
    // 軒の提灯
    for (let j = 0; j <= 6; j++) redLantern(k, -f.w / 2 + (f.w * j) / 6, y + f.h - 0.7, cz - f.d / 2 - 1.6, 1.3);
    y += f.h + 1.2;
  });
  // 屋根の上の金の飾り
  k.cyl(0, y + 1.2, cz, 0.5, 2.6, INN.gold);
  k.add({ s: "sphere", c: INN.gold, p: [0, y + 2.8, cz], sc: 1 });
}
