/**
 * 温泉宿「宵霞楼（よいがすみろう）」の宿泊客の設定と、宿の区域。**人数の値はすべて仮**。
 * 温泉宿は攻略するところではなく、図鑑に載った妖怪たちと再会して眺めるおまけの場所（docs/architecture.md「温泉宿」）。
 * 入れるかどうか（SPECIAL_UNLOCKS、data/legendConfig.ts）と、誰が泊まっているか（ここ・OnsenGuestRoster）と、
 * どこにいるか（区域・居場所：ここと data/onsenMap.ts、OnsenPlacementRules）は別。
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */

export interface OnsenGuestConfig {
  /** 一度の訪問で泊まっている種類の数（格ごと。登録済みがそれより少なければ全員） */
  normal: { min: number; max: number };
  greater: { min: number; max: number };
  threeGreat: { min: number; max: number };
  /** 隠し妖怪（discovery = hidden）：格の抽選とは別に、この確率で最大 max 種類 */
  hidden: { chance: number; max: number };
  /** 大妖怪・三大妖怪は、図鑑に載っているだけでなく縁帳で「仲間にした」ことも要る */
  legendNeedsJoined: boolean;
}

export const ONSEN_GUESTS: OnsenGuestConfig = {
  normal: { min: 15, max: 25 },
  greater: { min: 1, max: 3 },
  threeGreat: { min: 0, max: 1 },
  hidden: { chance: 0.2, max: 1 },
  legendNeedsJoined: true,
};

/**
 * 宿の区域。妖怪の居たがる場所（YokaiType.onsen.preferredArea）はこの名前で書く。
 * 居場所が埋まっていれば、同じ系統（group）の区域へ、それも無ければ空いているどこかへ。
 */
export type OnsenAreaId =
  | "maeniwa" | "genkan" | "chouba" | "hiroma" | "zashiki" | "banquet"
  | "engawa" | "tsukimi" | "uchiyu" | "rotenburo" | "iwaburo" | "nakaniwa" | "okuniwa" | "nikai" | "bourou";

/** 区域がどの解禁で開くか：base = 温泉宿への道（onsenEntrance）、banquet = 特別宴会場、inner = 最深部（月見の奥庭） */
export type OnsenZone = "base" | "banquet" | "inner";

export interface OnsenAreaDef {
  name: string;
  /** 系統（居場所が埋まっていたときの行き先） */
  group: "house" | "engawa" | "bath" | "garden";
  zone: OnsenZone;
}

export const ONSEN_AREAS: Record<OnsenAreaId, OnsenAreaDef> = {
  maeniwa: { name: "前庭", group: "garden", zone: "base" },
  genkan: { name: "玄関", group: "house", zone: "base" },
  chouba: { name: "帳場", group: "house", zone: "base" },
  hiroma: { name: "大広間", group: "house", zone: "base" },
  zashiki: { name: "畳座敷", group: "house", zone: "base" },
  banquet: { name: "宴会場", group: "house", zone: "banquet" },
  engawa: { name: "縁側", group: "engawa", zone: "base" },
  tsukimi: { name: "月見台", group: "engawa", zone: "inner" },
  uchiyu: { name: "内湯", group: "bath", zone: "base" },
  rotenburo: { name: "露天風呂", group: "bath", zone: "base" },
  iwaburo: { name: "大岩風呂", group: "bath", zone: "base" },
  nakaniwa: { name: "中庭", group: "garden", zone: "base" },
  okuniwa: { name: "月見の奥庭", group: "garden", zone: "inner" },
  nikai: { name: "二階の客間", group: "house", zone: "base" },
  bourou: { name: "望楼", group: "engawa", zone: "base" },
};

/**
 * 湯に入る（主人公）。**値はすべて仮**（遊んで決める）。
 * 湯の中はゆっくり歩き、しばらく浸かっていると顔がほんのり赤くなる（上がると少しずつ冷める）
 */
export const ONSEN_BATH = {
  /** 湯の中の歩く速さ（ふだんの何倍か。深さに応じて近づける） */
  speed: 0.42,
  /** 沈む深さ（水面から足元まで。主人公の背丈 ≒1 に対して。宿泊客の湯につかる深さと同じ） */
  sink: 0.42,
  /** 縁から何歩で深さいっぱいになるか */
  depthRamp: 1.2,
  /** 顔が赤くなりはじめるまで浸かる時間（秒） */
  blushAfter: 10,
  /** 赤くなりきるまでの時間（秒） */
  blushRamp: 4,
  /** 上がってから冷める速さ（浸かっていた時間を、1 秒に何秒ぶん減らすか） */
  coolRate: 0.6,
};

