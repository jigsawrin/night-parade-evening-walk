/**
 * 今夜の通常妖怪の新しい顔ぶれ（純粋関数）：解禁済みの後から混ざる通常妖怪から、今夜出る種類と、それぞれの数を seed で決める。
 *  - 数の合計は「町に置く通常妖怪の枠」の一部（NORMAL_NIGHT.share）。その分だけ、はじめの 12 種の枠を減らす（NormalSpawnPlanner）。
 *    種類が増えても、一夜の総数はほぼ今までどおり（一種類あたりが少し減る）
 *  - 全種類が毎晩いるわけではない（maxTypes まで）。ふつうは一夜に何体出てもよい。一夜一体の通常妖怪（uniquePerNight：白沢・八尺様など）は
 *    一体だけ（大妖怪ではない：今夜の大妖怪の候補の枠は使わない。通常妖怪の総数の一体として数える）
 *  - 開いたばかりの wave の妖怪は選ばれやすく、少なくとも数種類は今夜に入る（「前の夜にはいなかった妖怪」に気づける）。
 *    画面には何も出さない（「NEW」などの印は付けない）
 * 同じ seed・同じ進み具合なら同じ顔ぶれ。大妖怪の今夜の候補（NightLegendRoster）とは別。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import type { Rng } from "../../core/seed";
import { NORMAL_NIGHT } from "../../data/normalYokai";
import { YOKAI, YOKAI_ORDER, type YokaiType } from "../../data/yokaiTypes";
import { newNormalTypes } from "./NormalUnlockRules";
import { isUniquePerNight } from "../legends/LegendRules";

export type NormalNightConfig = typeof NORMAL_NIGHT;

export interface NormalRosterInput {
  /** 今開いている wave */
  wave: number;
  /** 開いたばかりの wave（NormalProgress.freshWaves） */
  fresh: readonly number[];
  /** 町に置く通常妖怪のうち、置き換えられる枠の合計（NormalSpawnPlanner.replaceablePool） */
  pool: number;
  rng: Rng;
}

export interface NormalRoster {
  wave: number;
  /** 今夜出る後から混ざる通常妖怪（選んだ順） */
  types: string[];
  /** 種類 → 今夜の数 */
  counts: Record<string, number>;
  /** 今夜の顔ぶれのうち、開いたばかりの wave の妖怪 */
  fresh: string[];
}

export function emptyNormalRoster(wave = 0): NormalRoster {
  return { wave, types: [], counts: {}, fresh: [] };
}

/** 重みつきで一つ取り出す（取り出したものは list から消える） */
function takeWeighted(rng: Rng, list: string[], weight: (t: string) => number) {
  const t = rng.weighted(list, weight);
  if (t !== null) list.splice(list.indexOf(t), 1);
  return t;
}

export function drawNormalRoster(i: NormalRosterInput, cfg: NormalNightConfig = NORMAL_NIGHT, defs: Readonly<Record<string, YokaiType>> = YOKAI, order: readonly string[] = YOKAI_ORDER): NormalRoster {
  const wave = Math.max(0, Math.min(i.wave, cfg.share.length - 1));
  const unlocked = newNormalTypes(wave, defs, order);
  const budget = Math.round((cfg.share[wave] ?? 0) * i.pool);
  const k = Math.min(unlocked.length, cfg.maxTypes[wave] ?? 0, budget);
  if (k <= 0) return emptyNormalRoster(wave);
  const isFresh = (t: string) => i.fresh.includes(defs[t].normalWave ?? 0);
  const weight = (t: string) => (isFresh(t) ? cfg.fresh.weight : 1);

  // 開いたばかりの wave から、少なくとも minTypes 種類
  const freshPool = unlocked.filter(isFresh);
  const rest = unlocked.filter((t) => !isFresh(t));
  const types: string[] = [];
  while (types.length < Math.min(cfg.fresh.minTypes, k) && freshPool.length) types.push(takeWeighted(i.rng, freshPool, () => 1)!);
  const others = [...freshPool, ...rest];
  while (types.length < k && others.length) types.push(takeWeighted(i.rng, others, weight)!);

  // 一種類 min から、残りの枠を max まで配る（開いたばかりの妖怪へ多めに。一夜一体の妖怪は一体だけ）
  const cap = (t: string) => (isUniquePerNight(defs[t]) ? 1 : cfg.perType.max);
  const counts: Record<string, number> = {};
  for (const t of types) counts[t] = Math.min(cfg.perType.min, cap(t));
  let left = budget - types.reduce((a, t) => a + counts[t], 0);
  while (left > 0) {
    const t = i.rng.weighted(types, (q) => (counts[q] < cap(q) ? weight(q) : 0));
    if (t === null) break;
    counts[t]++;
    left--;
  }
  return { wave, types, counts, fresh: types.filter(isFresh) };
}
