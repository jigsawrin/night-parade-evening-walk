/**
 * 縁帳（LegendProgress）：大妖怪・三大妖怪と「縁を結んだ」永続の記録。隠し妖怪（格は問わない）を「見つけた」履歴もここに残す（met）。
 * 分類は格（大妖怪・三大妖怪）で、隠しは別の印。
 *  - met：一度でも会った（声を聞いた）／joined：一度でも仲間にした（種類ごとに一度だけ）
 *  - 直近 10 夜の履歴（hyakki.history.v1）とは別のキー（hyakki.legends.v1）。履歴が消えても縁帳は残る。
 *    長い目の解禁（温泉宿…）は履歴ではなく、必ずこちらから判定する。
 * 図鑑（何妖仲間にしたか）とは役割が違う：縁帳は「どの特別な妖怪と縁を結んだか」。
 * 保存・読み込みは core/SaveData.ts（loadLegendProgress / saveLegendProgress）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { HIDDEN_DISCOVERIES, HIDDEN_NOTICE_RADIUS, SPECIAL_UNLOCKS, PLANNED_YOKAI, type HiddenDiscoveryDef, type LegendRank, type SpecialUnlockDef, type UnlockRequirement } from "../../data/legendConfig";
import { YOKAI, type YokaiDiscovery, type YokaiRank } from "../../data/yokaiTypes";

export const LEGEND_PROGRESS_VERSION = 1;

export interface LegendProgress {
  version: number;
  /** 会った種類（加入順ではなく、初めて会った順） */
  met: string[];
  /** 仲間にした種類 */
  joined: string[];
  /** 初めて会った・仲間にした日時（ミリ秒） */
  firstMetAt: Record<string, number>;
  firstJoinedAt: Record<string, number>;
  /** 仲間にした夜の数（種類ごと） */
  joinCount: Record<string, number>;
}

export function emptyLegendProgress(): LegendProgress {
  return { version: LEGEND_PROGRESS_VERSION, met: [], joined: [], firstMetAt: {}, firstJoinedAt: {}, joinCount: {} };
}

const strList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : []);
const numRecord = (v: unknown) => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
  }
  return out;
};

/** 保存されていたもの（壊れていても・古くても）を、使える形に直す。読めない部分は空から */
export function normalizeLegendProgress(raw: unknown): LegendProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyLegendProgress();
  const r = raw as Record<string, unknown>;
  const joined = strList(r.joined);
  // 仲間にしたなら、会ってもいる
  const met = strList(r.met);
  for (const id of joined) if (!met.includes(id)) met.push(id);
  return {
    version: LEGEND_PROGRESS_VERSION,
    met, joined,
    firstMetAt: numRecord(r.firstMetAt),
    firstJoinedAt: numRecord(r.firstJoinedAt),
    joinCount: numRecord(r.joinCount),
  };
}

/** 会った（変わったら true） */
export function recordMet(p: LegendProgress, type: string, at: number) {
  if (p.met.includes(type)) return false;
  p.met.push(type);
  p.firstMetAt[type] ??= at;
  return true;
}

/**
 * 隠し妖怪を見つけた（町の revealHidden でも、温泉宿で話しかけたときでも同じ意味）：縁帳の met に記録してすぐ保存する。
 * 図鑑の登録（isZukanSeen）は met から決まる。初めてなら true（「新たな妖怪が図鑑に記された」を出す合図）
 */
export function discoverHidden(p: LegendProgress, type: string, at: number, save: (p: LegendProgress) => void) {
  const isNew = recordMet(p, type, at);
  save(p);
  return isNew;
}

/** 仲間にした（一夜に一度だけ呼ぶ） */
export function recordJoined(p: LegendProgress, type: string, at: number) {
  recordMet(p, type, at);
  if (!p.joined.includes(type)) {
    p.joined.push(type);
    p.firstJoinedAt[type] ??= at;
  }
  p.joinCount[type] = (p.joinCount[type] ?? 0) + 1;
}

/** 種類 → 格・発見方式（YOKAI に無い将来の妖怪は PLANNED_YOKAI から） */
export function defaultRankOf(type: string): YokaiRank {
  return YOKAI[type]?.rank ?? PLANNED_YOKAI[type]?.rank ?? "normal";
}
export function defaultDiscoveryOf(type: string): YokaiDiscovery {
  return YOKAI[type]?.discovery ?? PLANNED_YOKAI[type]?.discovery ?? "normal";
}

/** 格ごとの「縁を結んだ（仲間にした）種類の数」（縁帳の分類：大妖怪・三大妖怪） */
export function legendTally(p: Pick<LegendProgress, "joined">, rankOf: (type: string) => YokaiRank = defaultRankOf): Record<LegendRank, number> {
  const out: Record<LegendRank, number> = { greater: 0, threeGreat: 0 };
  for (const id of p.joined) {
    const r = rankOf(id);
    if (r !== "normal") out[r]++;
  }
  return out;
}

/** 発見方式の数（格とは別の軸）：会った・仲間にした隠し妖怪の種類の数。縁帳では「秘」の印などで表す */
export function discoveryTally(p: Pick<LegendProgress, "met" | "joined">, discoveryOf: (type: string) => YokaiDiscovery = defaultDiscoveryOf) {
  return {
    hiddenMet: p.met.filter((id) => discoveryOf(id) === "hidden").length,
    hiddenJoined: p.joined.filter((id) => discoveryOf(id) === "hidden").length,
  };
}

export type SpecialUnlocks = Record<string, boolean>;

/**
 * 縁帳から開く特別な場所（温泉宿の噂・入口・宴会場・最深部）。閾値は data/legendConfig.ts の SPECIAL_UNLOCKS。
 * 旅館に「入れるか」だけを決める（誰が泊まっているかは game/onsen/OnsenGuestRoster.ts）。
 * 例：{ onsenRumor: true, onsenEntrance: false, onsenBanquet: false, onsenInnerArea: false }
 */
export function evaluateSpecialUnlocks(
  p: Pick<LegendProgress, "met" | "joined">,
  defs: readonly SpecialUnlockDef[] = SPECIAL_UNLOCKS,
  rankOf?: (type: string) => YokaiRank,
  discoveryOf?: (type: string) => YokaiDiscovery,
): SpecialUnlocks {
  const t = legendTally(p, rankOf);
  const d = discoveryTally(p, discoveryOf);
  const have: Required<UnlockRequirement> = { greater: t.greater, threeGreat: t.threeGreat, hiddenDiscovered: d.hiddenMet, hiddenJoined: d.hiddenJoined };
  const out: SpecialUnlocks = {};
  for (const u of defs) {
    out[u.id] = u.anyOf.some((req) => (Object.keys(req) as (keyof UnlockRequirement)[]).every((k) => have[k] >= (req[k] ?? 0)));
  }
  return out;
}

// ---------------------------------------------------------------- 隠し妖怪の見つかり方（HIDDEN_DISCOVERIES）

/** 隠し妖怪を見つけたことがあるか（縁帳の met。見つけただけで、仲間にしていなくてもよい） */
export function isDiscovered(p: Pick<LegendProgress, "met">, type: string) {
  return p.met.includes(type);
}

/**
 * 町の夜の「今夜の候補」（NightLegendRoster の隠し妖怪）になれるか。
 * 温泉宿で初めて見つかる妖怪（firstSource = "onsen"）は、見つけるまで町には出ない。
 * 町で初めて見つかる妖怪は、requiresZukanComplete なら通常の図鑑が埋まっていること（見つけた後は問わない）。
 */
export function hiddenWorldEligible(type: string, p: Pick<LegendProgress, "met">, defs: Readonly<Record<string, HiddenDiscoveryDef>> = HIDDEN_DISCOVERIES, normalZukanComplete = false) {
  const d = defs[type];
  if (!d || isDiscovered(p, type)) return true;
  return d.firstSource === "world" && (!d.requiresZukanComplete || normalZukanComplete);
}

/** 町で隠し妖怪に気づく距離（歩） */
export function hiddenNoticeRadius(type: string, defs: Readonly<Record<string, HiddenDiscoveryDef>> = HIDDEN_DISCOVERIES) {
  return defs[type]?.noticeRadius ?? HIDDEN_NOTICE_RADIUS;
}

/** 町の夜に今夜の候補に入る確率（見つけた後の postDiscoveryWorldChance。書いていなければ fallback） */
export function hiddenWorldChance(type: string, fallback: number, defs: Readonly<Record<string, HiddenDiscoveryDef>> = HIDDEN_DISCOVERIES) {
  return defs[type]?.postDiscoveryWorldChance ?? fallback;
}

/**
 * 温泉宿の今回の訪問で必ずいる客（初めて見つかる隠し妖怪）：まだ見つけていなくて、条件（通常の図鑑完成・旅館の入口…）が揃ったもの。
 * 宿泊客の抽選には任せない（OnsenGuestRoster の forcedGuests へ渡す）。「解禁しました」とは知らせない。旅館にいるだけ。
 */
export function onsenFirstDiscoveries(
  i: { progress: Pick<LegendProgress, "met">; normalZukanComplete: boolean; unlocks: Readonly<Record<string, boolean>> },
  defs: Readonly<Record<string, HiddenDiscoveryDef>> = HIDDEN_DISCOVERIES,
) {
  return Object.keys(defs).filter((t) => {
    const d = defs[t];
    if (d.firstSource !== "onsen" || isDiscovered(i.progress, t)) return false;
    if (d.requiresZukanComplete && !i.normalZukanComplete) return false;
    return !d.requiresUnlock || !!i.unlocks[d.requiresUnlock];
  });
}
