/**
 * 温泉宿で主人公がどこに立っているか（純粋な規則）：階と階段、湯の深さ、湯に浸かって顔が赤くなるまで。
 *  - 階：今いる階（floor）と、階段の途中なら その階段（stair）。階段は下の端・上の端からだけ出入りでき、
 *    上の端から出れば上の階、下の端から出れば下の階。高さは階段の途中で下の階から上の階へなめらかに
 *  - 当たり：壁・欄干などの当たりは「どこで効くか」（lv：階の番号 "1" "2" … か 階段の id）を持ち、今の場所のものだけが効く
 *  - 上の階は、その階（または上りきる手前の階段）にいるときだけ見せる（下の階からは屋根の無い箱庭のまま）
 *  - 湯：縁の切れ目（entry）から入り、縁から depthRamp 歩で深さいっぱいに沈む
 * 値は data/onsenMap.ts（間取り）と data/onsen.ts の ONSEN_BATH。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { ONSEN_FLOOR_Y, ONSEN_POOLS, ONSEN_STAIRS, POOL_ENTRY_W, type OnsenPool, type OnsenStair, type ORect } from "../../data/onsenMap";

export interface OnsenLevel {
  /** 今いる階（階段の途中なら、上り始めた（下りはじめた）階） */
  floor: number;
  /** 階段の途中なら、その階段の id */
  stair: string | null;
}

/** 上の階を見せはじめる、階段を上った割合（上りきる手前で。途中から出すと上の床が主人公を隠す） */
export const SHOW_UPPER_AT = 0.85;

const inR = (r: ORect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const stairById = (id: string) => ONSEN_STAIRS.find((s) => s.id === id)!;

/** 階段をどれだけ上ったか（下の端 0・上の端 1。外なら 0 未満・1 を超える） */
export function stairProgress(s: OnsenStair, x: number, z: number) {
  const r = s.r;
  switch (s.up) {
    case "-x": return (r.x1 - x) / (r.x1 - r.x0);
    case "+x": return (x - r.x0) / (r.x1 - r.x0);
    case "-z": return (r.z1 - z) / (r.z1 - r.z0);
    default: return (z - r.z0) / (r.z1 - r.z0);
  }
}

/** 動いた後の階（階段に入った・階段の端から出た） */
export function stepLevel(lv: OnsenLevel, x: number, z: number, stairs: readonly OnsenStair[] = ONSEN_STAIRS): OnsenLevel {
  if (lv.stair) {
    const s = stairs.find((q) => q.id === lv.stair)!;
    if (inR(s.r, x, z)) return lv;
    return { floor: stairProgress(s, x, z) >= 0.5 ? s.upper : s.lower, stair: null };
  }
  for (const s of stairs) if ((s.lower === lv.floor || s.upper === lv.floor) && inR(s.r, x, z)) return { floor: lv.floor, stair: s.id };
  return lv;
}

/** 当たりが効く場所の名前（階なら "1" "2" …、階段の途中ならその id） */
export const levelKey = (lv: OnsenLevel) => lv.stair ?? String(lv.floor);

/** 見せる階の上限（この階より上は作っていても隠す） */
export function shownFloor(lv: OnsenLevel, x: number, z: number) {
  if (!lv.stair) return lv.floor;
  const s = stairById(lv.stair);
  return stairProgress(s, x, z) >= SHOW_UPPER_AT ? s.upper : s.lower;
}

/**
 * 用意しておく上の階（今いる階から上る階段に近づいた・上りはじめたら、その上の階）。
 * 上の階は入り口では作らず、ここで挙がったときに一度だけ作る
 */
export function floorsToPrepare(lv: OnsenLevel, x: number, z: number, near = 2.5, stairs: readonly OnsenStair[] = ONSEN_STAIRS) {
  const out: number[] = [];
  for (const s of stairs) {
    if (lv.stair === s.id) out.push(s.upper);
    else if (!lv.stair && s.lower === lv.floor) {
      const r = s.r;
      const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
      if (d < near) out.push(s.upper);
    }
  }
  return out;
}

/** 足元の湯（無ければ null）と深さ（0 = 縁、1 = 深さいっぱい） */
export function poolUnder(x: number, z: number, ramp: number, pools: readonly OnsenPool[] = ONSEN_POOLS) {
  for (const p of pools) {
    const r = p.r;
    if (!inR(r, x, z)) continue;
    const d = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
    return { pool: p, depth: clamp01(d / ramp) };
  }
  return null;
}

/** 湯の深さ（0 = 湯の外・縁、1 = 深さいっぱい） */
export function poolDepth(x: number, z: number, ramp: number, pools: readonly OnsenPool[] = ONSEN_POOLS) {
  return poolUnder(x, z, ramp, pools)?.depth ?? 0;
}

/** 足元の高さ：階段の途中は下の階から上の階へ、地上の湯の中は沈む（水面から sink だけ下：宿泊客の湯につかる高さと同じ） */
export function groundAt(lv: OnsenLevel, x: number, z: number, bath: { sink: number; depthRamp: number }) {
  if (lv.stair) {
    const s = stairById(lv.stair);
    const k = clamp01(stairProgress(s, x, z));
    return ONSEN_FLOOR_Y[s.lower] + (ONSEN_FLOOR_Y[s.upper] - ONSEN_FLOOR_Y[s.lower]) * k;
  }
  const y = ONSEN_FLOOR_Y[lv.floor];
  const w = lv.floor === 1 ? poolUnder(x, z, bath.depthRamp) : null;
  return w ? y + (w.pool.y - bath.sink - y) * w.depth : y;
}

export interface LevelRect { r: ORect; lv: string[] }

/**
 * 階段のまわりの当たり：両脇（下の階・上の階・階段の途中のどこでも）、上りきった先（下の階ではくぐれない）、
 * 下の端の先（上の階では穴に落ちない柵）
 */
export function stairColliders(s: OnsenStair): LevelRect[] {
  const r = s.r, T = 0.3;
  const lo = String(s.lower), hi = String(s.upper);
  const alongX = s.up === "-x" || s.up === "+x";
  const sides: ORect[] = alongX
    ? [{ x0: r.x0, z0: r.z0 - T, x1: r.x1, z1: r.z0 }, { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 + T }]
    : [{ x0: r.x0 - T, z0: r.z0, x1: r.x0, z1: r.z1 }, { x0: r.x1, z0: r.z0, x1: r.x1 + T, z1: r.z1 }];
  const bottom: ORect = {
    "-x": { x0: r.x1, z0: r.z0, x1: r.x1 + T, z1: r.z1 },
    "+x": { x0: r.x0 - T, z0: r.z0, x1: r.x0, z1: r.z1 },
    "-z": { x0: r.x0, z0: r.z1, x1: r.x1, z1: r.z1 + T },
    "+z": { x0: r.x0, z0: r.z0 - T, x1: r.x1, z1: r.z0 },
  }[s.up];
  return [
    ...sides.map((q) => ({ r: q, lv: [lo, hi, s.id] })),
    { r: s.landing, lv: [lo] },
    { r: bottom, lv: [hi] },
  ];
}

/** 湯の縁の当たり（四辺。入り口の切れ目は開けてある） */
export function poolRimRects(p: OnsenPool, T = 0.5): ORect[] {
  const r = p.r, e = p.entry, h = POOL_ENTRY_W / 2;
  const out: ORect[] = [];
  const edge = (horizontal: boolean, at: number, a: number, b: number) => {
    const onThis = horizontal ? Math.abs(e.z - at) < 0.01 : Math.abs(e.x - at) < 0.01;
    const c = horizontal ? e.x : e.z;
    const segs: [number, number][] = onThis ? [[a, c - h], [c + h, b]] : [[a, b]];
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.05) continue;
      out.push(horizontal ? { x0: s0, z0: at - T / 2, x1: s1, z1: at + T / 2 } : { x0: at - T / 2, z0: s0, x1: at + T / 2, z1: s1 });
    }
  };
  edge(true, r.z0, r.x0, r.x1);
  edge(true, r.z1, r.x0, r.x1);
  edge(false, r.x0, r.z0, r.z1);
  edge(false, r.x1, r.z0, r.z1);
  return out;
}

/** 縁の切れ目のそばか（縁の岩を置かない） */
export function nearPoolEntry(p: OnsenPool, x: number, z: number) {
  return Math.hypot(x - p.entry.x, z - p.entry.z) < POOL_ENTRY_W / 2 + 0.3;
}

/**
 * 湯あたり（顔がほんのり赤くなる）。heat = 浸かっていた時間（上がると coolRate で減る。赤くなりきった先は増やさない）。
 * 戻り値の blush は 0..1（blushAfter 秒浸かると赤くなりはじめ、blushRamp 秒で赤くなりきる）
 */
export function stepBathHeat(heat: number, soaking: boolean, dt: number, c: { blushAfter: number; blushRamp: number; coolRate: number }) {
  const max = c.blushAfter + c.blushRamp;
  const h = soaking ? Math.min(max, heat + dt) : Math.max(0, heat - dt * c.coolRate);
  return { heat: h, blush: clamp01((h - c.blushAfter) / c.blushRamp) };
}
