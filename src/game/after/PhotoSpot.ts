/**
 * 集合写真の場所選び（一度きりの計算。毎フレームは走らない）。
 *  - shrinePhotoSpot：参道の鳥居を背にした広場（撮影の間だけ御神木を隠す）。陣形の記念撮影はまずここ
 *  - findPhotoSpot：主人公の近くの開けた場所（広場に収まらないとき）
 * 町（World）は歩けるか・丸い当たりだけを読む。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import type { FormationDef } from "../../data/photo";
import { PLAZA, SANDO_TORII } from "../../data/map";
import { formationBounds, layoutFormation, type FormationContext, type FormationMember } from "./PhotoFormation";

/** 場所選びが読む町（World の一部） */
export interface SpotWorld {
  isWalkable(x: number, z: number, rad?: number): boolean;
  circlesNear(x: number, z: number, r: number, ignore?: { x: number; z: number; r: number }): number;
}

/**
 * 集合写真の場所選び：主人公の近くで、並べた立ち位置がなるべく全部歩ける（家・川の中にならない）場所と正面を探す。
 * 候補は主人公のまわりの粗い格子 × 8 方向。一度きりの計算なので毎フレームは走らない。
 */
export function findPhotoSpot(
  world: SpotWorld,
  def: FormationDef,
  members: readonly FormationMember[],
  hero: { x: number; z: number; yaw: number },
  prefer: { fx: number; fz: number },
): FormationContext {
  const cands: { x: number; z: number; d: number }[] = [];
  for (let dx = -84; dx <= 84; dx += 12) for (let dz = -84; dz <= 84; dz += 12) {
    const x = hero.x + dx, z = hero.z + dz;
    if (!world.isWalkable(x, z, 1)) continue;
    cands.push({ x, z, d: Math.hypot(dx, dz) });
  }
  // まず周り 12 点の歩きやすさで絞る
  const quick = cands.map((c) => {
    let ok = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (world.isWalkable(c.x + Math.cos(a) * 9, c.z + Math.sin(a) * 9, 0.5)) ok++;
    }
    return { ...c, q: ok / 12 - c.d / 400 };
  }).sort((a, b) => b.q - a.q).slice(0, 10);
  let best: FormationContext | null = null;
  let bestScore = -Infinity;
  const dirs = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  for (const c of quick) {
    for (const a of dirs) {
      const fx = Math.sin(a), fz = Math.cos(a);
      const ctx: FormationContext = { anchorX: c.x, anchorZ: c.z, fx, fz, hero };
      const { walk, blockers } = spotScore(world, def, members, ctx);
      // 歩ける割合を最優先、次に手前の木の少なさ、近さ、今カメラのいる側を正面に
      const score = walk - blockers * 0.03 - c.d / 600 + (fx * prefer.fx + fz * prefer.fz) * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = ctx;
      }
    }
  }
  return best ?? { anchorX: hero.x, anchorZ: hero.z, fx: prefer.fx, fz: prefer.fz, hero };
}

/**
 * 並べた立ち位置のうち歩ける（家・川・木の中でない）割合と、カメラ側（正面 22 歩まで）で写真を遮る木の数。
 * clear：写真の間だけ隠す物（御神木）の円。その中の当たりは無いものとして数える
 */
function spotScore(world: SpotWorld, def: FormationDef, members: readonly FormationMember[], ctx: FormationContext, clear?: { x: number; z: number; r: number }) {
  const res = layoutFormation(def, members, ctx);
  const all = [res.hero, ...res.slots];
  let ok = 0;
  for (const s of all) if (s.lift > 1 || (world.isWalkable(s.x, s.z, 0.4) && world.circlesNear(s.x, s.z, 0.9, clear) === 0)) ok++;
  const b = formationBounds(res, ctx);
  const { fx, fz } = ctx;
  let blockers = 0;
  for (let v = 3; v <= 22; v += 4) for (let u = -b.width / 2; u <= b.width / 2; u += 4) {
    blockers += world.circlesNear(ctx.anchorX + fz * u + fx * (v + b.depth * 0.2), ctx.anchorZ - fx * u + fz * (v + b.depth * 0.2), 2, clear);
  }
  // 並びの奥の端（正面と逆向きにいちばん遠い立ち位置）
  let back = 0;
  for (const s of all) back = Math.max(back, -((s.x - ctx.anchorX) * fx + (s.z - ctx.anchorZ) * fz));
  return { walk: ok / all.length, blockers, back };
}

/**
 * 記念撮影の場所：参道の入口の鳥居の手前、広場の広い空間。撮影の間だけ御神木（広場の真ん中）を隠して使う。
 * 値は見た目の値（遊びの手触りではない）
 */
export const SHRINE_PHOTO = {
  /** 並びの奥の端がこの z を越えない（参道の鳥居の手前） */
  backLimitZ: SANDO_TORII.z - 1.5,
  /** 探す範囲の南の端（広場の南） */
  minZ: PLAZA.z - PLAZA.r - 12,
  /** 撮影の間だけ隠す御神木（この円の中の当たりは無いものとする） */
  clear: { x: PLAZA.x, z: PLAZA.z, r: 3.4 },
  /** 歩ける割合がこれに届かなければ、ここをあきらめて近くの開けた場所へ */
  minWalk: 0.8,
};

/**
 * 記念撮影の場所：参道の鳥居と、その奥の参道・神社を背にして、広場に南（カメラ側）を向いて並ぶ。
 * 並びの奥の端が鳥居の手前に収まる中で、立ち位置が歩ける割合が高く、鳥居に近い場所を選ぶ（人数が多いほど広場の手前へ下がる）。
 * 歩ける場所が足りなければ null（呼ぶ側が findPhotoSpot で近くの開けた場所を探す）
 */
export function shrinePhotoSpot(world: SpotWorld, def: FormationDef, members: readonly FormationMember[], hero: { x: number; z: number; yaw: number }): FormationContext | null {
  const fx = 0, fz = -1;
  let best: FormationContext | null = null;
  let bestScore = -Infinity;
  for (let z = SHRINE_PHOTO.backLimitZ; z >= SHRINE_PHOTO.minZ; z -= 1.5) {
    const ctx: FormationContext = { anchorX: SANDO_TORII.x, anchorZ: z, fx, fz, hero };
    const sc = spotScore(world, def, members, ctx, SHRINE_PHOTO.clear);
    if (z + sc.back > SHRINE_PHOTO.backLimitZ || sc.walk < SHRINE_PHOTO.minWalk) continue;
    // 歩ける割合を最優先、次に手前の木の少なさ、鳥居に近いこと
    const score = sc.walk - sc.blockers * 0.02 + (z - SHRINE_PHOTO.minZ) / 200;
    if (score > bestScore) {
      bestScore = score;
      best = ctx;
    }
  }
  return best;
}
