/**
 * 大妖怪・三大妖怪（まとめて「伝説の妖怪 = legend」）と隠し妖怪の設定値。
 * 妖怪ごとの情報（格・発見方式・加入条件・陰陽師への効き目・写真の立ち位置・気配）は data/yokaiTypes.ts に書く。
 * ここに置くのは、格ごとの扱い・今夜の候補の数・縁帳から開く特別な場所の閾値。
 * **値はすべて仮**（遊びの手触りはユーザーが遊んで決める）。
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */
import type { YokaiDiscovery, YokaiRank } from "./yokaiTypes";

/** 伝説の妖怪の格（大妖怪・三大妖怪）。隠しは格ではない（発見方式） */
export type LegendRank = Exclude<YokaiRank, "normal">;

export interface RankInfo {
  /** 分類名（縁帳・図鑑・デバッグ・思い出の文） */
  label: string;
  /** 加わったときの見出し（字間を空けた表記） */
  banner: string;
  /** 見出しの下の一言 */
  bannerText: string;
  /** 思い出（NightMemoryLog）の重み。firstFriend 90・百妖 100 と比べて決める */
  memoryWeight: number;
  /** 百鬼値への加点（仮。大妖怪をスコア稼ぎの必須にしない） */
  score: number;
}

export const RANK_INFO: Record<LegendRank, RankInfo> = {
  greater: { label: "大妖怪", banner: "大 妖 怪", bannerText: "名のある大妖怪が、百鬼夜行を認めて加わった", memoryWeight: 65, score: 0 },
  // 三大妖怪の加入は「今夜の三大出来事」にほぼ必ず入る（百妖の節目 100 の次）
  threeGreat: { label: "三大妖怪", banner: "三 大 妖 怪", bannerText: "名高き三大妖怪が、百鬼夜行を認めて加わった", memoryWeight: 95, score: 0 },
};

/**
 * 今夜の候補（NightLegendRoster）の数。一夜の始まりに ?seed= から選ぶ。候補に入らなかった妖怪は今夜は町に現れない。
 * 今は大妖怪が大天狗だけ・三大妖怪が酒呑童子だけなので、どちらも毎晩いる（今までと同じ遊び）。
 * 将来の目安：大妖怪 2〜3 種類、三大妖怪 0〜1 種類（threeGreat を { min: 0, max: 1 } に）。
 */
export const NIGHT_ROSTER: RosterConfig = {
  greater: { min: 2, max: 3 },
  threeGreat: { min: 1, max: 1 },
  /** 隠し妖怪（discovery = hidden）：格の抽選とは別の乱数で、一種類ずつこの確率（HIDDEN_DISCOVERIES に書いた妖怪はその値）。一夜に一種類まで */
  hidden: { chance: 0.15 },
};

export interface RosterConfig {
  greater: { min: number; max: number };
  threeGreat: { min: number; max: number };
  hidden: { chance: number };
}

/**
 * 隠し妖怪の見つかり方（妖怪ごと。書かない隠し妖怪は、今夜の候補に入れば町のどこかにいる：NIGHT_ROSTER.hidden.chance）。
 *  firstSource：はじめて見つかる場所。"onsen" なら温泉宿でだけ見つかり、見つかるまで町（今夜の候補）には出ない
 *  requiresZukanComplete：通常妖怪を知り尽くしたこと（後から混ざる通常妖怪の最後の wave まで開き、通常の図鑑（隠し妖怪を除く）が
 *    すべて埋まった：ZukanRules の allNormalContentComplete。はじめの 12 種・途中の wave までの完成では成り立たない）
 *  requiresUnlock：縁帳から開く場所（SPECIAL_UNLOCKS の id）が開いていること
 *  requiresZukanComplete は町（world）で初めて見つかる妖怪にも効く。requiresUnlock は温泉宿（onsen）でだけ見る
 *  postDiscoveryWorldChance：一度見つけた後、町の夜に今夜の候補に入る確率（案内はしない。また気づいたらいる）
 *  noticeRadius：町で、主人公がこの距離（歩）まで近づくと気づく（姿を見せる：revealHidden）。無ければ HIDDEN_NOTICE_RADIUS
 * 判定は game/legends/LegendProgress.ts（hiddenWorldEligible・onsenFirstDiscoveries）。**値はすべて仮**。
 */
export interface HiddenDiscoveryDef {
  firstSource: "onsen" | "world";
  requiresZukanComplete?: boolean;
  requiresUnlock?: string;
  postDiscoveryWorldChance?: number;
  noticeRadius?: number;
}

/** 町に隠れている隠し妖怪に、すぐそばまで来て気づく距離（歩。仮） */
export const HIDDEN_NOTICE_RADIUS = 5;

/**
 * ぬらりひょん：通常の図鑑を埋め、温泉宿への道が開いた後、温泉宿で初めて会う（LegendProgress.onsenFirstDiscoveries）。
 * 見つけて縁帳の met に残った後だけ、町の夜にもまれに（postDiscoveryWorldChance）今夜の候補に入り、茶屋の縁台（legendYokai.ts）に
 * 隠れている。すぐそばまで来ると気づく（LegendSystem.noticeHidden）。見つける前に町で出会うことは無い
 */
export const HIDDEN_DISCOVERIES: Record<string, HiddenDiscoveryDef> = {
  nurarihyon: { firstSource: "onsen", requiresZukanComplete: true, requiresUnlock: "onsenEntrance", postDiscoveryWorldChance: 0.1 },
};

/** 大妖怪の気配の選ばれやすさ（通常の気配 ParadeAttraction だけ。通常の妖怪は 1。Pacing・狐火・言霊は向けない） */
export const LEGEND_OMEN_WEIGHT = 1;

/**
 * 縁帳から開く特別な場所（温泉宿…まだ場所そのものは無い）。旅館に「入れるか」だけ。誰がいるかは OnsenGuestRoster。
 * anyOf のどれか一つを満たせば開く。一つの条件の中はすべて満たす。
 *  greater・threeGreat：縁を結んだ（一度でも仲間にした）格ごとの種類の数
 *  hiddenDiscovered：会った隠し妖怪の種類の数／hiddenJoined：仲間にした隠し妖怪の種類の数（格とは別の軸）
 * 判定は game/legends/LegendProgress.ts の evaluateSpecialUnlocks（純粋関数）。
 */
export interface UnlockRequirement {
  greater?: number;
  threeGreat?: number;
  hiddenDiscovered?: number;
  hiddenJoined?: number;
}

export interface SpecialUnlockDef {
  id: string;
  /** デバッグ表示の名前 */
  name: string;
  anyOf: UnlockRequirement[];
}

export const SPECIAL_UNLOCKS: SpecialUnlockDef[] = [
  { id: "onsenRumor", name: "温泉宿の噂", anyOf: [{ greater: 3 }] },
  { id: "onsenEntrance", name: "温泉宿への道", anyOf: [{ greater: 5 }, { greater: 2, threeGreat: 1 }] },
  { id: "onsenBanquet", name: "特別宴会場", anyOf: [{ threeGreat: 2 }] },
  { id: "onsenInnerArea", name: "最深部", anyOf: [{ threeGreat: 3, hiddenDiscovered: 1 }] },
];

/**
 * 名簿にもまだ載せていない、今後の大妖怪の空き枠（名前の無い仮の ID。YOKAI には無い。正式な大妖怪の一覧ではない）。
 * テストで候補の抽選・縁帳を確かめるのに使う。正式に決めたら YOKAI へ（図鑑の文だけなら zukanAvailability: "future" で）移し、ここから消す。
 * （以前ここに置いていた磯姫・尻こぼし・鵺は、通常妖怪として data/normalYokaiSecond.ts・normalYokaiThird.ts に実装した）
 */
export const PLANNED_YOKAI: Record<string, { rank: YokaiRank; discovery: YokaiDiscovery; aliases?: string[] }> = {
  planned_greater_a: { rank: "greater", discovery: "normal" },
  planned_greater_b: { rank: "greater", discovery: "normal" },
  planned_greater_c: { rank: "greater", discovery: "normal" },
};
