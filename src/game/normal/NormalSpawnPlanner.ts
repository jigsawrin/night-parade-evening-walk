/**
 * 今夜の通常妖怪の配置（純粋関数）：町に置く通常妖怪（SPAWNS・気配・地区覚醒）の一覧に、今夜の新しい顔ぶれ（NormalNightRoster）を混ぜる。
 *  - 新しい顔ぶれの数だけ、はじめの 12 種の群れを一妖ずつ減らす（群れの最後の一妖は残す）。一夜の総数はほぼ変わらない
 *  - 新しい妖怪は、その妖怪の場所の候補（data/normalYokai.ts の NormalSite）へ置く。川辺を歩くと現れる妖怪（arrive "river"）は、
 *    町に置かずに河童の一妖と入れ替わる（WildArrivals）ので、ほかの群れは減らさない
 *  - 世界の層（屋根・裏路地・妖怪船・横丁）の群れ・大妖怪以上は減らさない
 *  - wave 0（はじめの 12 種だけ）の夜は、一覧を何も変えない（今までと同じ夜・同じ seed の並び）
 * prepareNormalNight は夜の始まりの窓口（進み具合を読み、開いた wave を記して保存し、顔ぶれと配置を決める）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import type { Rng } from "../../core/seed";
import { loadHistory, loadNormalProgress, saveNormalProgress, type KV } from "../../core/SaveData";
import { NORMAL_NIGHT, NORMAL_SITES, type NormalSite } from "../../data/normalYokai";
import { SPAWNS, type SpawnDef } from "../../data/map";
import { AWAKEN_SPAWNS, PRESENCE_SPAWNS } from "../../data/presences";
import { YOKAI, type YokaiType } from "../../data/yokaiTypes";
import { drawNormalRoster, emptyNormalRoster, type NormalRoster } from "./NormalNightRoster";
import { freshWaves, noteOpenedWaves, recordCompletedNight, type NormalProgress } from "./NormalProgress";
import { isWaveNormal, unlockedNormalWave } from "./NormalUnlockRules";

type Defs = Readonly<Record<string, YokaiType>>;

/** 町に置く通常妖怪の一覧（town = SPAWNS、extra = 気配・地区覚醒。WildYokai が置く順） */
export interface SpawnLists {
  town: readonly SpawnDef[];
  extra: readonly SpawnDef[];
}

/** 今までの町の一覧（SPAWNS と、気配・地区覚醒） */
export const BASE_SPAWN_LISTS: SpawnLists = { town: SPAWNS, extra: [...PRESENCE_SPAWNS, ...AWAKEN_SPAWNS] };

export interface NormalSpawnPlan extends SpawnLists {
  /** 川辺を歩くと、河童の代わりに現れる妖怪（一妖ずつ） */
  river: string[];
  /** 減らした・足した数（確認用） */
  removed: number;
  added: number;
}

/** 新しい顔ぶれへ枠を譲れる群れか（世界の層・大妖怪以上・後から混ざる妖怪は譲らない） */
function replaceable(s: SpawnDef, defs: Defs) {
  const d = defs[s.type];
  return !s.layer && isWaveNormal(d) && (d.normalWave ?? 0) === 0;
}

/** 置き換えられる枠の合計（新しい顔ぶれの数の元） */
export function replaceablePool(base: SpawnLists, defs: Defs = YOKAI) {
  return [...base.town, ...base.extra].reduce((a, s) => a + (replaceable(s, defs) ? s.n : 0), 0);
}

const riverOnly = (sites: readonly NormalSite[]) => sites.length > 0 && sites.every((s) => s.arrive === "river");

function toSpawn(type: string, s: NormalSite, n: number): SpawnDef {
  return {
    type, x: s.x, z: s.z, r: s.r, n, snap: true, keepRule: !!s.layer,
    appearAt: s.appearAt, presence: s.presence, district: s.district, layer: s.layer, y: s.y, roof: s.roof, after: s.after, lurk: s.lurk,
    yaw: s.yaw, trail: s.trail,
  };
}

export function planNormalSpawns(base: SpawnLists, roster: NormalRoster, rng: Rng, sites: Readonly<Record<string, readonly NormalSite[]>> = NORMAL_SITES, defs: Defs = YOKAI): NormalSpawnPlan {
  const town = base.town.map((s) => ({ ...s }));
  const extra = base.extra.map((s) => ({ ...s }));
  const plan: NormalSpawnPlan = { town, extra, river: [], removed: 0, added: 0 };
  if (!roster.types.length) return plan;

  // はじめの 12 種の群れを減らす（大きな群れほど減りやすい。最後の一妖は残す）
  const pool = [...town, ...extra].filter((s) => replaceable(s, defs));
  let cut = roster.types.reduce((a, t) => a + (riverOnly(sites[t] ?? []) ? 0 : roster.counts[t]), 0);
  while (cut > 0) {
    const s = rng.weighted(pool, (q) => q.n - 1);
    if (!s) break;
    s.n--;
    plan.removed++;
    cut--;
  }

  // 新しい顔ぶれを、その妖怪の場所の候補へ（候補を seed で並べ替え、一妖ずつ順に置く）
  for (const t of roster.types) {
    const list = sites[t] ?? [];
    const n = roster.counts[t];
    if (!list.length) continue;
    if (riverOnly(list)) {
      for (let i = 0; i < n; i++) plan.river.push(t);
      plan.added += n;
      continue;
    }
    const idx = rng.shuffle(list.map((_, i) => i));
    const per = new Map<number, number>();
    for (let i = 0; i < n; i++) per.set(idx[i % idx.length], (per.get(idx[i % idx.length]) ?? 0) + 1);
    for (const [i, k] of per) extra.push(toSpawn(t, list[i], k));
    plan.added += n;
  }
  return plan;
}

/** 一覧の総数（確認用：町に置く妖怪の数。気配の確率は数えない） */
export function spawnTotal(lists: SpawnLists) {
  return [...lists.town, ...lists.extra].reduce((a, s) => a + s.n, 0);
}

export interface NormalNight {
  progress: NormalProgress;
  wave: number;
  roster: NormalRoster;
  plan: NormalSpawnPlan;
}

/**
 * 夜の始まり：進み具合を読み（無ければ履歴の件数から）、今の wave を出し、開いた wave を記して保存し、今夜の顔ぶれと配置を決める。
 * rosterRng は顔ぶれ、placeRng は群れを減らす・場所を選ぶ乱数（どちらも NightSeed の別の流れ）
 */
export function prepareNormalNight(kv: KV | null, zukan: Readonly<Record<string, number>>, rosterRng: Rng, placeRng: Rng, base: SpawnLists = BASE_SPAWN_LISTS): NormalNight {
  const progress = loadNormalProgress(kv, loadHistory(kv).length);
  const wave = unlockedNormalWave(progress, zukan);
  if (noteOpenedWaves(progress, wave)) saveNormalProgress(kv, progress);
  const roster = wave > 0
    ? drawNormalRoster({ wave, fresh: freshWaves(progress, wave, NORMAL_NIGHT.fresh.nights), pool: replaceablePool(base), rng: rosterRng })
    : emptyNormalRoster(0);
  return { progress, wave, roster, plan: planNormalSpawns(base, roster, placeRng) };
}

/** 夜が正常に終わった（結果が出た）：夜の数を一つ増やして保存する。同じ夜（endedAt）は二度数えない */
export function finishNormalNight(kv: KV | null, night: NormalNight, endedAt: number) {
  if (recordCompletedNight(night.progress, endedAt)) saveNormalProgress(kv, night.progress);
}
