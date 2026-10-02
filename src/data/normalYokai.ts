/**
 * 何度か夜を歩くうちに町へ混ざってくる通常妖怪（はじめの 12 種の後の 41 種。通常妖怪は全部で 53 種）の設定と、名簿のまとめ。
 * 妖怪ごとの定義（図鑑の文・姿の系統・加入条件・出る場所）は normalYokaiSecond.ts（21 種）・normalYokaiThird.ts（20 種）。
 *  - すべて rank: "normal"・discovery: "normal"。画面では、はじめの 12 種と同じ「妖怪」（段・wave・由来は画面に出さない）
 *  - 大妖怪の仕組み（今夜の候補・一夜一体・気配・特等席・legendJoin）には入れない
 *  - 町に置く数は増やさない：新しい顔ぶれの数だけ、はじめの 12 種の枠を減らす（NormalSpawnPlanner）
 * 解禁の判定は game/normal/NormalUnlockRules.ts、今夜の顔ぶれは game/normal/NormalNightRoster.ts。
 * **値はすべて仮**（遊びの手触りはユーザーが遊んで決める）。
 * ※ node --test から直接読み込むため、実行時の import は data/ の値だけ（Babylon・DOM を読まない）。
 */
import type { YokaiType } from "./yokaiTypes";
import { SECOND_ENTRIES } from "./normalYokaiSecond";
import { THIRD_ENTRIES } from "./normalYokaiThird";

/**
 * 通常妖怪の出る場所の候補（一種類に数か所。今夜の数だけ、ここから選んで置く）。
 * 置き方は SpawnDef と同じ（appearAt・presence・district・layer・y・yaw・trail）。ほかに：
 *  roof：y の代わりに屋根の高さへ／after：地区覚醒・行列の遊びの数がそろうと姿を見せる／
 *  lurk：潜んでいる（そばで立ち止まると姿を見せる）／arrive "river"：川辺を歩くと現れる（河童の一妖と入れ替わる）
 */
export interface NormalSite {
  x: number;
  z: number;
  r: number;
  appearAt?: number;
  presence?: string;
  district?: string;
  layer?: string;
  y?: number;
  roof?: boolean;
  after?: { districts?: number; activities?: number };
  lurk?: boolean;
  arrive?: "river";
  /** 置いたときの向き（障子など、道の方を向けたいもの） */
  yaw?: number;
  /** 細い蜘蛛の糸の道（順に辿ると、その先で潜んでいた妖怪が姿を見せる：WildTrails） */
  trail?: [number, number][];
}

export interface NormalEntry {
  def: YokaiType;
  sites: NormalSite[];
}

/**
 * wave の解禁条件（添字 0 が wave 1）。夜の数（夜が正常に終わった数）と図鑑の登録数を組み合わせる。
 *  scope "base"：はじめの 12 種のうち登録した数／"normal"：通常妖怪（段を問わない）のうち登録した数
 *  mode "or"：どちらか／"and"：両方。wave は順に開く（前の wave が開いていなければ開かない）
 */
export interface NormalWaveUnlock {
  nights: number;
  zukan: number;
  scope: "base" | "normal";
  mode: "or" | "and";
}

export const NORMAL_UNLOCK: NormalWaveUnlock[] = [
  { nights: 1, zukan: 4, scope: "base", mode: "or" },
  { nights: 2, zukan: 7, scope: "base", mode: "or" },
  { nights: 3, zukan: 10, scope: "base", mode: "or" },
  { nights: 4, zukan: 14, scope: "normal", mode: "and" },
  { nights: 6, zukan: 22, scope: "normal", mode: "or" },
  { nights: 8, zukan: 30, scope: "normal", mode: "or" },
];

/** いちばん後の wave（ここまで開き、通常妖怪をすべて登録すると「通常妖怪を知り尽くした」：ぬらりひょんの条件） */
export const FINAL_NORMAL_WAVE = NORMAL_UNLOCK.length;

/**
 * 今夜の新しい顔ぶれ（NormalNightRoster・NormalSpawnPlanner）。添字は今の wave。
 *  share：町に置く通常妖怪の枠（置き換えられる枠の合計）のうち、新しい顔ぶれへ回す割合。回した数だけ、はじめの 12 種の枠を減らす
 *  maxTypes：今夜出る新しい種類の上限（解禁済みのうちから seed で選ぶ。全種類が毎晩いるわけではない）
 *  perType：一種類あたりの数
 *  fresh：wave が開いてから nights 夜のあいだ、その wave の妖怪を選びやすく（weight 倍）、少なくとも minTypes 種類を今夜に入れる
 */
export const NORMAL_NIGHT = {
  share: [0, 0.1, 0.17, 0.24, 0.3, 0.36, 0.42],
  maxTypes: [0, 5, 8, 11, 13, 15, 17],
  perType: { min: 1, max: 3 },
  fresh: { nights: 2, weight: 2.5, minTypes: 2 },
};

const ENTRIES: NormalEntry[] = [...SECOND_ENTRIES, ...THIRD_ENTRIES];

/** 後から混ざる 41 種の定義（YOKAI に入る） */
export const NORMAL_YOKAI: Record<string, YokaiType> = Object.fromEntries(ENTRIES.map((e) => [e.def.id, e.def]));
/** 後から混ざる 41 種の ID（定義の並び。図鑑の順は data/zukanOrder.ts） */
export const NORMAL_IDS: string[] = ENTRIES.map((e) => e.def.id);
/** 出る場所の候補 */
export const NORMAL_SITES: Record<string, NormalSite[]> = Object.fromEntries(ENTRIES.map((e) => [e.def.id, e.sites]));
