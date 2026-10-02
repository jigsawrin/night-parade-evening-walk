/**
 * 図鑑の純粋な規則：どの妖怪の枠を見せるか・「図鑑完成」の数え方・一項目の中身。
 *  - 発見方式が通常の妖怪は、はじめから枠がある（未登録なら？？？と一言のヒント）
 *  - 隠し妖怪（discovery = hidden）は、見つけるまで枠そのものが無い（？？？も、名前の字数も、ヒントも、総数への加算も無い）。
 *    見つけたら（縁帳の met）図鑑に項目が増え、分母も増える
 *  - 「登録」の意味が違う：通常の妖怪は仲間にしたら登録（仲間になった記録）。隠し妖怪は見つけたら登録（存在を見つけた記録）。
 *    だから通常の図鑑を埋めた N / N の後に隠し妖怪を見つけると、仲間にしていなくても N+1 / N+1（N / N+1 にはならない）。
 *    仲間になった数（count）は登録とは別に持つ
 *  - 通常の図鑑完成（normalComplete）は隠し妖怪を数えない。隠し妖怪の出現条件は、これに最後の wave を加えた allNormalContentComplete を見る（その妖怪自身を含めない）
 *  - まだ本編に出ない妖怪（zukanAvailability = "future"）は、枠も分母も無い（隠し妖怪とは別：見つけることもできない）
 *  - 後から町へ混ざる通常妖怪（normalWave 1 以上）は、その wave が開くまで枠も分母も無い（？？？も出さない）。開いたら通常の枠
 *    （未登録なら？？？）。段・wave は画面に出さない。wave は game/normal/NormalUnlockRules.ts が決め、found.normalWave で渡す（無ければ 0）
 *  - 「今の図鑑の完成」（normalComplete）と、隠し妖怪の条件に使う「通常妖怪を知り尽くした」（allNormalContentComplete：
 *    最後の wave まで開き、そのうえで通常の枠がすべて埋まった）は別。はじめの 12 種だけ埋めた完成で、ぬらりひょんに会わせない
 * 画面（UIDirector）はここの結果を並べるだけ。図鑑に載った妖怪は将来の温泉宿の宿泊客の候補にもなる（OnsenGuestRoster）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { RANK_INFO } from "../data/legendConfig";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiDiscovery, type YokaiRank, type YokaiType } from "../data/yokaiTypes";
import type { LegendProgress } from "./legends/LegendProgress";
import { appearCount } from "./ParadeAppearRules";

type Defs = Readonly<Record<string, YokaiType>>;
type Counts = Readonly<Record<string, number>>;
/** 縁帳のうち図鑑が読むところ（met = 会った・見つけた）と、今開いている通常妖怪の wave（無ければ 0 = はじめの 12 種だけ） */
export type Found = Pick<LegendProgress, "met"> & { normalWave?: number };

const NONE: Found = { met: [] };

/** 図鑑に載せる妖怪か（zukan: false の妖怪と、まだ本編に出ない future の妖怪は載せない） */
export function isZukanTarget(def: Pick<YokaiType, "zukan" | "zukanAvailability"> | undefined) {
  return !!def && isActiveYokai(def) && def.zukan !== false;
}

/** 図鑑に出す格の呼び名（通常妖怪は「妖怪」。隠しは格ではないので、ここには出ない） */
export function zukanRankLabel(rank: YokaiRank) {
  return rank === "normal" ? "妖怪" : RANK_INFO[rank].label;
}

/** 図鑑に枠を見せるか。隠し妖怪は見つけた（縁帳の met）か仲間にした後だけ。後から混ざる通常妖怪は wave が開いてから（仲間にしたことがあれば出す） */
export function isZukanVisible(type: string, zukan: Counts, found: Found = NONE, defs: Defs = YOKAI) {
  const d = defs[type];
  if (!isZukanTarget(d)) return false;
  if ((zukan[type] ?? 0) > 0) return true;
  if (d.discovery === "hidden") return found.met.includes(type);
  return (d.normalWave ?? 0) <= (found.normalWave ?? 0);
}

/** いちばん後の wave（通常妖怪の normalWave の最大） */
export function finalNormalWave(defs: Defs = YOKAI) {
  let w = 0;
  for (const d of Object.values(defs)) if (isZukanTarget(d) && d.discovery !== "hidden") w = Math.max(w, d.normalWave ?? 0);
  return w;
}

/**
 * 図鑑に登録済みか（seen）。通常の妖怪は仲間にしたら（count > 0）、隠し妖怪は見つけたら（縁帳の met）か仲間にしたら。
 * 見えている（visible）とは別：通常の妖怪は未登録でも枠が見える（？？？）
 */
export function isZukanSeen(type: string, zukan: Counts, found: Found = NONE, defs: Defs = YOKAI) {
  const d = defs[type];
  if (!isZukanTarget(d)) return false;
  const n = zukan[type] ?? 0;
  return d.discovery === "hidden" ? n > 0 || found.met.includes(type) : n > 0;
}

/** 図鑑に並べる種類（図鑑の順） */
export function visibleZukanTypes(zukan: Counts, found: Found = NONE, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  return order.filter((t) => isZukanVisible(t, zukan, found, defs));
}

export interface ZukanCompletion {
  /** 見えている枠のうち登録した数（isZukanSeen）と、見えている枠の数（隠し妖怪は見つけた後だけ分母に入り、見つけた時点で登録済み） */
  seen: number;
  total: number;
  /** 見えている枠がすべて埋まった */
  complete: boolean;
  /** 今見えている通常の図鑑（隠し妖怪を除く）。途中の wave の完成もある（隠し妖怪の条件は allNormalContentComplete） */
  normalSeen: number;
  normalTotal: number;
  normalComplete: boolean;
  /**
   * 通常妖怪を知り尽くした：最後の wave まで開き、そのうえで通常の枠（隠し妖怪を除く）がすべて埋まった。
   * 隠し妖怪（ぬらりひょん）の条件はこれを見る。はじめの 12 種・途中の wave までの完成（normalComplete）では成り立たない
   */
  allNormalContentComplete: boolean;
  /** 見つけた隠し妖怪（図鑑に枠がある）の数。hiddenSeen も同じ（隠し妖怪は見つけた時点で登録済み） */
  hiddenFound: number;
  hiddenSeen: number;
  /** 見つけた隠し妖怪のうち、仲間にしたことがある数 */
  hiddenJoined: number;
}

export function zukanCompletion(zukan: Counts, found: Found = NONE, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER): ZukanCompletion {
  const vis = visibleZukanTypes(zukan, found, defs, order);
  const seenOf = (t: string) => isZukanSeen(t, zukan, found, defs);
  const normal = vis.filter((t) => defs[t].discovery !== "hidden");
  const hidden = vis.filter((t) => defs[t].discovery === "hidden");
  const seen = vis.filter(seenOf).length, normalSeen = normal.filter(seenOf).length;
  return {
    seen, total: vis.length, complete: vis.length > 0 && seen === vis.length,
    normalSeen, normalTotal: normal.length, normalComplete: normal.length > 0 && normalSeen === normal.length,
    allNormalContentComplete: normal.length > 0 && normalSeen === normal.length && (found.normalWave ?? 0) >= finalNormalWave(defs),
    hiddenFound: hidden.length, hiddenSeen: hidden.filter(seenOf).length, hiddenJoined: hidden.filter((t) => (zukan[t] ?? 0) > 0).length,
  };
}

/** 図鑑が今埋まったか（前は未完成 → 今は完成）。完成の演出を出すときの合図 */
export function completionReached(prev: ZukanCompletion, next: ZukanCompletion) {
  return { normal: !prev.normalComplete && next.normalComplete, all: !prev.complete && next.complete };
}

/**
 * 図鑑の一項目（画面はここから必要なものだけ出す。見出しは名前と格、詳細に読み・別名・伝承・出会い方・ひとこと・記録）。
 * 未登録（seen = false）の項目の名前・読み・別名・文は、画面・検索に出さない（zukanListing・presentation/zukan/ZukanCards）。
 * 読み・別名は図鑑だけの情報（名前の見出しに連結しない）。将来の詳細（発見方式「秘」・縁を結んだ回数…）もここに足す。
 */
export interface ZukanEntry {
  type: string;
  name: string;
  reading: string;
  /** 別名・呼称（無ければ空） */
  aliases: string[];
  rank: YokaiRank;
  /** 格の呼び名（妖怪・大妖怪・三大妖怪） */
  rankLabel: string;
  discovery: YokaiDiscovery;
  /** 伝承（本来の妖怪について） */
  lore: string;
  /** この町での出会い方（このゲームでの出会い方・加入条件） */
  zukanEncounter: string;
  /** 情景のひとこと */
  zukanFlavor: string;
  /** 行列がこの数に届くと町に姿を見せる（0 = いつでも。ParadeAppearRules） */
  appearCount: number;
  /** 図鑑に登録済み（isZukanSeen）。隠し妖怪は仲間にしていなくても（count = 0 でも）true になる */
  seen: boolean;
  /** これまでに仲間になった数（登録とは別。見つけただけの隠し妖怪は 0） */
  count: number;
  /** 縁帳：会った・仲間にした夜の数（大妖怪・三大妖怪・隠し妖怪だけ意味がある） */
  met: boolean;
  joinNights: number;
}

/** 図鑑の一項目。見せない枠（見つけていない隠し妖怪）は null（名前・別名・一言・格を漏らさない） */
export function zukanEntry(type: string, zukan: Counts, legends?: Pick<LegendProgress, "met" | "joinCount">, defs: Defs = YOKAI): ZukanEntry | null {
  const d = defs[type];
  if (!d || !isZukanVisible(type, zukan, legends ?? NONE, defs)) return null;
  return {
    type, name: d.name, reading: d.reading, aliases: d.aliases ? [...d.aliases] : [],
    rank: d.rank, rankLabel: zukanRankLabel(d.rank), discovery: d.discovery,
    lore: d.lore, zukanEncounter: d.zukanEncounter, zukanFlavor: d.zukanFlavor, appearCount: appearCount(d), seen: isZukanSeen(type, zukan, legends ?? NONE, defs), count: zukan[type] ?? 0,
    met: !!legends?.met.includes(type), joinNights: legends?.joinCount[type] ?? 0,
  };
}

/**
 * 一度でも仲間にした種類（図鑑の数が 1 以上）。温泉宿の宿泊客の候補の元（見つけただけの隠し妖怪は含まない：
 * 温泉宿は縁帳の met から別に足す）。図鑑の「登録済み」は isZukanSeen・knownZukanTypes
 */
export function joinedTypes(zukan: Counts, defs: Defs = YOKAI): string[] {
  return Object.keys(zukan).filter((t) => (zukan[t] ?? 0) > 0 && isZukanTarget(defs[t]));
}

/** 図鑑上で既知の種類（isZukanSeen）：通常の妖怪は仲間にした、隠し妖怪は見つけた。大妖怪に会っただけ（met）では入らない */
export function knownZukanTypes(zukan: Counts, found: Found = NONE, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  return order.filter((t) => isZukanSeen(t, zukan, found, defs));
}

/**
 * 図鑑上で既知の種類を、一夜の間つねに正しく保つ（演出が「初見」かどうかを決める）。
 *  - 起動時：knownZukanTypes（前の夜までに仲間にした・見つけた）
 *  - 隠し妖怪を見つけた（specialDiscovered）：演出の前に必ず既知へ（announce・known に関係なく）
 *  - 加わった（join）：既知でなければ初見。見つけた後に加わった隠し妖怪は初見ではない（発見と加入は別の出来事）
 */
export class ZukanKnown {
  readonly types = new Set<string>();

  constructor(initial: Iterable<string> = []) {
    for (const t of initial) this.types.add(t);
  }

  /**
   * 隠し妖怪を見つけた。知らせ（新たな妖怪が図鑑に記された）を出すなら true。
   * イベントの known（縁帳）だけを信用せず、この夜の既知（加える前の状態）も見る：
   * 保存の移行などで縁帳と図鑑が食い違っても、図鑑上で既知の妖怪を二度「新たな妖怪」にしない
   */
  discovered(e: { type: string; announce: boolean; known: boolean }) {
    const wasKnown = this.types.has(e.type);
    this.types.add(e.type);
    return e.announce && !e.known && !wasKnown;
  }

  /** 加わった。初見（図鑑に初めて記した）なら true */
  joined(type: string) {
    const isNew = !this.types.has(type);
    this.types.add(type);
    return isNew;
  }
}

// ---------------------------------------------------------------- 図鑑の並び・区分・検索

/** 図鑑の区分（格ごと。目次のジャンプ先。隠し妖怪は格の中に入る：ぬらりひょんは大妖怪） */
export interface ZukanSection {
  rank: YokaiRank;
  /** 目次の札（妖怪・大妖怪・三大妖怪） */
  label: string;
  entries: ZukanEntry[];
}

export const ZUKAN_RANKS: readonly YokaiRank[] = ["normal", "greater", "threeGreat"];

/** 検索の文字をそろえる（全角・半角、カタカナ → ひらがな、空白を除く） */
export function normalizeZukanQuery(q: string) {
  return q
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 検索に合うか。**登録済みの妖怪だけ**を名前・読み・別名で探す（未登録の？？？の正体を検索から推し量れないように）。
 * 検索の文字が空なら、未登録でも合う（いつもどおり枠を見せる）
 */
export function zukanMatches(e: Pick<ZukanEntry, "seen" | "name" | "reading" | "aliases">, query: string) {
  const q = normalizeZukanQuery(query);
  if (!q) return true;
  if (!e.seen) return false;
  return [e.name, e.reading, ...e.aliases].some((s) => normalizeZukanQuery(s).includes(q));
}

export interface ZukanListOptions {
  /** 検索の文字 */
  query?: string;
  /** 登録済みだけを見せる */
  registeredOnly?: boolean;
}

/**
 * 図鑑に並べる区分と項目（図鑑の順）。見えない枠（まだ混ざらない通常妖怪・見つけていない隠し妖怪・future）はどの場合も入らない。
 * 空の区分は入れない。未登録の枠は、検索の文字がある間と「登録済みのみ」のときは入らない
 */
export function zukanListing(
  zukan: Counts, found: Pick<LegendProgress, "met"> & Partial<Pick<LegendProgress, "joinCount">> & { normalWave?: number } = NONE,
  opts: ZukanListOptions = {}, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER,
): ZukanSection[] {
  const legends = { met: found.met, joinCount: found.joinCount ?? {}, normalWave: found.normalWave };
  const out: ZukanSection[] = ZUKAN_RANKS.map((rank) => ({ rank, label: zukanRankLabel(rank), entries: [] }));
  for (const id of visibleZukanTypes(zukan, legends, defs, order)) {
    const e = zukanEntry(id, zukan, legends, defs)!;
    if (opts.registeredOnly && !e.seen) continue;
    if (!zukanMatches(e, opts.query ?? "")) continue;
    out[ZUKAN_RANKS.indexOf(e.rank)].entries.push(e);
  }
  return out.filter((s) => s.entries.length > 0);
}
