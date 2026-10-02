import { ONSEN_FLOOR_Y, ONSEN_SPOTS, ONSEN_STAIRS, ONSEN_UPPER, type OnsenStair, type ORect } from "../../data/onsenMap";
import { stairById } from "../../game/onsen/OnsenGroundRules";
import type { OnsenWorld } from "../OnsenWorld";
import { INN } from "./innBuild";
import { ROOF, SHU, SHU_DARK, redLantern } from "./grandBuild";

/**
 * 二階・三階（母屋の上）。階段を上りはじめたときに OnsenWorld.buildFloor から一度だけ作る（入り口では作らない）。
 * 地上と同じく屋根は付けず、壁も腰の高さまで（上からのぞき込むカメラが、部屋と主人公を見られるように）。
 * まわりは朱の欄干と提灯で、外（中庭・湯・奥の高楼）を見下ろす。部品はこの階の入れ物にまとめて、見せる・隠すは階ごと。
 *  - 二階：西の客間「霞の間」・真ん中の板の間（三階への階段）・東の客間「湯煙の間」
 *  - 三階：望楼（宿と月を見下ろす）
 */
export function buildUpperFloor(k: OnsenWorld, n: number) {
  if (n === 2) floor2(k);
  else if (n === 3) floor3(k);
}

/** 矩形から穴を除いた残り（床を穴あきで敷く） */
function minus(a: ORect, h: ORect): ORect[] {
  if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) return [a];
  const z0 = Math.max(a.z0, h.z0), z1 = Math.min(a.z1, h.z1);
  return [
    { x0: a.x0, z0: a.z0, x1: a.x1, z1: z0 },
    { x0: a.x0, z0: z1, x1: a.x1, z1: a.z1 },
    { x0: a.x0, z0, x1: Math.max(a.x0, h.x0), z1 },
    { x0: Math.min(a.x1, h.x1), z0, x1: a.x1, z1 },
  ].filter((r) => r.x1 - r.x0 > 0.01 && r.z1 - r.z0 > 0.01);
}

const cx = (r: ORect) => (r.x0 + r.x1) / 2;
const cz = (r: ORect) => (r.z0 + r.z1) / 2;

/** 床板（y = 床の上面）。穴（階段）を開ける */
function slab(k: OnsenWorld, r: ORect, holes: ORect[], y: number, c: string, t = 0.3) {
  let parts = [r];
  for (const h of holes) parts = parts.flatMap((p) => minus(p, h));
  for (const p of parts) k.box(cx(p), y - t / 2, cz(p), p.x1 - p.x0, t, p.z1 - p.z0, c);
}

/** 畳（目地つき）。穴で切り分けても、目地は部屋全体（r の角）にそろえる */
function tatami(k: OnsenWorld, r: ORect, holes: ORect[], y: number) {
  let parts = [r];
  for (const h of holes) parts = parts.flatMap((p) => minus(p, h));
  for (const p of parts) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0;
    k.box(cx(p), y + 0.02, cz(p), w, 0.04, d, INN.tatami);
    for (let x = r.x0 + 2; x < r.x1 - 0.2; x += 2) if (x > p.x0 + 0.05 && x < p.x1 - 0.05) k.box(x, y + 0.045, cz(p), 0.06, 0.01, d, INN.tatamiEdge);
    for (let z = r.z0 + 4; z < r.z1 - 0.2; z += 4) if (z > p.z0 + 0.05 && z < p.z1 - 0.05) k.box(cx(p), y + 0.045, z, w, 0.01, 0.06, INN.tatamiEdge);
  }
}

/** 朱の欄干（当たりつき）。every 歩ごとに提灯の柱 */
function railing(k: OnsenWorld, x0: number, z0: number, x1: number, z1: number, y: number, every = 0) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  k.box(mx, y + 0.9, mz, alongX ? len : 0.12, 0.1, alongX ? 0.12 : len, SHU);
  k.box(mx, y + 0.45, mz, alongX ? len : 0.08, 0.06, alongX ? 0.08 : len, SHU_DARK);
  const posts = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    k.cyl(x0 + (x1 - x0) * t, y + 0.45, z0 + (z1 - z0) * t, 0.12, 0.9, SHU);
  }
  if (every > 0) {
    const n = Math.max(1, Math.round(len / every));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      k.cyl(x, y + 1.0, z, 0.2, 2, SHU);
      k.box(x, y + 2.05, z, 0.5, 0.08, 0.5, ROOF);
      redLantern(k, x, y + 1.62, z, 0.62);
    }
  }
  k.collide({ x0: Math.min(x0, x1) - (alongX ? 0 : 0.15), z0: Math.min(z0, z1) - (alongX ? 0.15 : 0), x1: Math.max(x0, x1) + (alongX ? 0 : 0.15), z1: Math.max(z0, z1) + (alongX ? 0.15 : 0) });
}

/** まわりの欄干（四辺）と、床の縁の朱の化粧 */
function perimeter(k: OnsenWorld, r: ORect, y: number, every: number) {
  railing(k, r.x0, r.z0, r.x1, r.z0, y, every);
  railing(k, r.x0, r.z1, r.x1, r.z1, y, every);
  railing(k, r.x0, r.z0, r.x0, r.z1, y, every);
  railing(k, r.x1, r.z0, r.x1, r.z1, y, every);
  k.box(cx(r), y - 0.42, r.z0 - 0.1, r.x1 - r.x0 + 0.5, 0.26, 0.3, SHU_DARK);
  k.box(cx(r), y - 0.42, r.z1 + 0.1, r.x1 - r.x0 + 0.5, 0.26, 0.3, SHU_DARK);
  k.box(r.x0 - 0.1, y - 0.42, cz(r), 0.3, 0.26, r.z1 - r.z0, SHU_DARK);
  k.box(r.x1 + 0.1, y - 0.42, cz(r), 0.3, 0.26, r.z1 - r.z0, SHU_DARK);
}

/**
 * 階段（踏み板だけの抜けた階段：上からのぞくカメラから主人公が隠れにくい）。下の階の床から上の階の床まで。
 * 脇の開いた側には朱の手すり（sides: 手すりを付ける側。"lo" = r の小さい側、"hi" = 大きい側）
 */
export function stairs(k: OnsenWorld, s: OnsenStair, sides: ("lo" | "hi")[]) {
  const r = s.r, y0 = ONSEN_FLOOR_Y[s.lower], rise = ONSEN_FLOOR_Y[s.upper] - y0;
  const alongX = s.up === "-x" || s.up === "+x";
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const wid = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const n = 12;
  // 下の端からの距離 → ワールドの位置
  const at = (d: number): [number, number] => {
    switch (s.up) {
      case "-x": return [r.x1 - d, cz(r)];
      case "+x": return [r.x0 + d, cz(r)];
      case "-z": return [cx(r), r.z1 - d];
      default: return [cx(r), r.z0 + d];
    }
  };
  for (let i = 0; i < n; i++) {
    const [x, z] = at(((i + 0.5) / n) * len);
    const top = y0 + ((i + 1) / n) * rise;
    const step = len / n + 0.04;
    k.box(x, top - 0.06, z, alongX ? step : wid, 0.12, alongX ? wid : step, INN.wood);
    // 脇の桁（のこぎりの歯のように）
    for (const e of [-1, 1]) {
      const off = (wid / 2 - 0.08) * e;
      k.box(x + (alongX ? 0 : off), top - 0.3, z + (alongX ? off : 0), alongX ? step : 0.14, 0.48, alongX ? 0.14 : step, INN.woodDark);
    }
  }
  // 手すり（傾けた棒と、上下の親柱）
  const ang = Math.atan2(rise, len);
  const hyp = Math.hypot(len, rise);
  const [mx, mz] = at(len / 2);
  for (const side of sides) {
    const off = side === "lo" ? -wid / 2 : wid / 2;
    const px = mx + (alongX ? 0 : off), pz = mz + (alongX ? off : 0);
    // 上る向きへ傾ける（x 方向は z 軸まわり、z 方向は x 軸まわり）
    const rot: [number, number, number] = alongX ? [0, 0, s.up === "+x" ? ang : -ang] : [s.up === "+z" ? -ang : ang, 0, 0];
    k.add({ s: "box", c: SHU, p: [px, y0 + rise / 2 + 0.95, pz], sc: [alongX ? hyp : 0.1, 0.1, alongX ? 0.1 : hyp], r: rot });
    for (const d of [0.1, len - 0.1]) {
      const [x, z] = at(d);
      const top = y0 + (d / len) * rise;
      k.cyl(x + (alongX ? 0 : off), top + 0.5, z + (alongX ? off : 0), 0.14, 1, SHU);
    }
  }
}

function lowTable(k: OnsenWorld, x: number, y: number, z: number, w: number, d: number) {
  k.box(x, y + 0.42, z, w, 0.1, d, INN.woodDark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(x + sx * (w / 2 - 0.2), y + 0.2, z + sz * (d / 2 - 0.2), 0.14, 0.4, 0.14, INN.beam);
  k.cyl(x - w * 0.2, y + 0.52, z, 0.2, 0.16, "#8a9a7a");
  k.cyl(x + w * 0.2, y + 0.5, z + d * 0.15, 0.36, 0.06, "#e8dcc0");
  k.collide({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
}

/** 置き行灯（その階の灯り） */
function andon(k: OnsenWorld, x: number, y: number, z: number) {
  k.box(x, y + 0.35, z, 0.5, 0.7, 0.5, INN.woodDark);
  k.box(x, y + 0.85, z, 0.55, 0.7, 0.55, "#ffffff", k.lamps[0]);
  k.circles.push({ x, z, r: 0.35 });
}

/** 座る居場所の座布団（この階の分） */
function cushions(k: OnsenWorld, n: number, y: number) {
  for (const s of ONSEN_SPOTS) if ((s.floor ?? 1) === n && s.pose === "sit") k.box(s.x, y + 0.06, s.z, 1, 0.12, 1, INN.cushion, undefined, s.yaw);
}

/** 腰の高さの間仕切り（口を開けて。当たりつき） */
function lowWall(k: OnsenWorld, x: number, z0: number, z1: number, y: number, gap: [number, number]) {
  for (const [a, b] of [[z0, gap[0]], [gap[1], z1]]) {
    k.box(x, y + 0.45, (a + b) / 2, 0.2, 0.9, b - a, INN.wood);
    k.box(x, y + 0.95, (a + b) / 2, 0.26, 0.1, b - a, SHU);
    k.collide({ x0: x - 0.15, z0: a, x1: x + 0.15, z1: b });
  }
}

function floor2(k: OnsenWorld) {
  const y = ONSEN_FLOOR_Y[2];
  const F = ONSEN_UPPER[2];
  const s1 = stairById("s1"), s2 = stairById("s2");
  slab(k, F, [s1.r], y, "#5a3e28");
  // 回廊（まわりの板の間）と客間の畳、真ん中の板の間
  slab(k, F, [s1.r], y + 0.02, "#6b4a30", 0.02);
  const inset = 1.3;
  tatami(k, { x0: F.x0 + inset, z0: F.z0 + inset, x1: -14, z1: F.z1 - inset }, [s1.r, s1.landing], y);
  tatami(k, { x0: 14, z0: F.z0 + inset, x1: F.x1 - inset, z1: F.z1 - inset }, [], y);
  perimeter(k, F, y, 7.5);
  // 下りの階段の穴のまわり（北の脇と、東の下り口の先）
  railing(k, s1.r.x0, s1.r.z1 + 0.15, s1.r.x1, s1.r.z1 + 0.15, y);
  railing(k, s1.r.x1 + 0.15, s1.r.z0, s1.r.x1 + 0.15, s1.r.z1, y);
  lowWall(k, -14, F.z0 + 0.3, F.z1 - 0.3, y, [-10, -6]);
  lowWall(k, 14, F.z0 + 0.3, F.z1 - 0.3, y, [-10, -6]);
  // 三階への階段と、その先（三階の床の下）の飾り棚
  k.fadeGroup((k.stairIds[s2.id] ??= []), () => stairs(k, s2, ["lo", "hi"]));
  const L = s2.landing;
  k.box(cx(L), y + 0.45, cz(L), L.x1 - L.x0, 0.9, L.z1 - L.z0 - 0.2, INN.woodDark);
  for (let i = 0; i < 3; i++) k.cyl(cx(L), y + 1.1, L.z0 + 1 + i * 1.6, 0.34, 0.4, ["#5a6a7a", "#8a4a3a", "#6a7a5a"][i]);
  // 霞の間（西）：座卓・金屏風・畳んだ布団・行灯
  lowTable(k, -20, y, -8, 3, 2.4);
  for (let i = 0; i < 4; i++) k.box(-28.3, y + 1.0, -12 + i * 1.3, 0.08, 1.7, 1.25, i % 2 ? INN.gold : "#c8a040", undefined, i % 2 ? 0.25 : -0.25);
  k.collide({ x0: -28.6, z0: -12.7, x1: -28, z1: -7.1 });
  for (let i = 0; i < 4; i++) k.box(-16, y + 0.12 + i * 0.22, -2.4, 2, 0.2, 1.3, ["#e8e0d0", "#7a3a4a", "#e8e0d0", "#3a4a6a"][i]);
  k.collide({ x0: -17, z0: -3.1, x1: -15, z1: -1.7 });
  andon(k, -27.8, y, -2);
  andon(k, -15.3, y, -13.6);
  // 板の間（真ん中）：大きな生け花と行灯
  k.cyl(6, y + 0.3, -12.5, 0.9, 0.6, "#3a4a5a");
  for (const [dx, dz, c] of [[0, 0, "#c04030"], [0.4, 0.2, "#e8c040"], [-0.3, 0.3, "#d86a8a"]] as const) k.add({ s: "sphere", c, p: [6 + dx, y + 1.1 + dz, -12.5 + dz], sc: 0.5 });
  k.circles.push({ x: 6, z: -12.5, r: 0.6 });
  andon(k, 12.8, y, -1.5);
  andon(k, -12.8, y, -15.8);
  // 湯煙の間（東）：座卓・衣桁に掛けた着物・行灯
  lowTable(k, 22, y, -8, 3, 2.4);
  k.box(27.5, y + 1.7, -13.5, 3, 0.1, 0.1, INN.woodDark);
  for (const sx of [-1.4, 1.4]) k.box(27.5 + sx, y + 0.85, -13.5, 0.1, 1.7, 0.1, INN.woodDark);
  k.box(27.5, y + 1.05, -13.5, 2.6, 1.25, 0.06, "#7a3a8a");
  k.box(27.5, y + 1.05, -13.44, 2.2, 0.3, 0.02, INN.gold);
  k.collide({ x0: 25.8, z0: -13.8, x1: 29.2, z1: -13.2 });
  andon(k, 28.5, y, -1.5);
  cushions(k, 2, y);
}

function floor3(k: OnsenWorld) {
  const y = ONSEN_FLOOR_Y[3];
  const F = ONSEN_UPPER[3];
  const s2 = stairById("s2");
  slab(k, F, [s2.r], y, "#5a3e28");
  slab(k, F, [s2.r], y + 0.02, "#7a5636", 0.02);
  tatami(k, { x0: -7, z0: -12.5, x1: 9.5, z1: -6.5 }, [], y);
  perimeter(k, F, y, 5.5);
  // 上ってきた階段の穴（東の脇と、北の下り口の先）
  railing(k, s2.r.x1 + 0.15, s2.r.z0, s2.r.x1 + 0.15, s2.r.z1, y);
  railing(k, s2.r.x0, s2.r.z1 + 0.15, s2.r.x1, s2.r.z1 + 0.15, y);
  // 四隅の大きな赤提灯
  for (const [x, z] of [[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]]) {
    k.cyl(x, y + 1.4, z, 0.3, 2.8, SHU);
    k.box(x, y + 2.85, z, 0.8, 0.1, 0.8, ROOF);
    redLantern(k, x, y + 2.3, z, 1);
  }
  // 酒の座卓と、北を向いた遠眼鏡
  lowTable(k, 3, y, -9.5, 3.2, 1.6);
  k.cyl(9, y + 0.6, -4.8, 0.12, 1.2, INN.woodDark);
  k.add({ s: "cyl", c: INN.gold, p: [9, y + 1.3, -4.6], sc: [0.18, 0.9, 0.18], top: 0.7, r: [1.2, 0, 0] });
  k.circles.push({ x: 9, z: -4.8, r: 0.4 });
  andon(k, -6, y, -13);
  andon(k, 10, y, -13);
  cushions(k, 3, y);
}

/** 地上の階段（畳座敷の南の壁ぞい）と、上りきった先の下の飾り棚。近づいても透かさない（上る階段が見えるように。カメラのすぐ前のときだけ透ける） */
export function groundStairs(k: OnsenWorld) {
  for (const s of ONSEN_STAIRS) {
    if (s.lower !== 1) continue;
    k.track((k.stairIds[s.id] ??= []), () => k.group("building", false, () => stairs(k, s, ["hi"])));
    const L = s.landing;
    k.group("building", false, () => {
      k.box(cx(L), 0.45, cz(L), L.x1 - L.x0 - 0.1, 0.9, L.z1 - L.z0, INN.woodDark);
      k.cyl(cx(L), 1.1, cz(L), 0.4, 0.4, "#6a5a4a");
    });
  }
}
