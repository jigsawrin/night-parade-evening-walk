/**
 * 動的 Encounter の山札（Event Deck）データ。
 * 一夜ごとに seed から山札を作り、ParadeAttraction / NightPacing の求めに応じて一枚ずつ場へ出す。
 * すべてが毎夜必ず出るわけではない（chance / copies）。
 *
 * 実装済みの kind：
 *  miniParade   小さな妖怪行列と並んで歩き、合流する（30妖〜。前回から数分あける＝「来た！」と思える珍しさ）
 *  foxfireTrail 狐火を追うと、その先に妖怪の群れ
 *  lanternRelay 消えた提灯を順番に灯す
 *  hokoraCircle 小さな祠の周囲を行列で一周
 *  hungryGroup  団子を欲しがる妖怪の集団
 *
 * 今後の候補（データ構造はこのまま使える）：橋を一定人数で渡る／川から祭囃子／屋根の上を移動する妖怪／
 * 妖怪船に出会う／特殊な夜店／人間の祭りと合流する
 *
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */

export type EncounterKind = "miniParade" | "foxfireTrail" | "lanternRelay" | "hokoraCircle" | "hungryGroup";

/**
 * 大妖怪・三大妖怪の加入条件（encounterComplete）の言葉。{n} に「あと一」や「二」が入る。
 * 例：狐火を{n}度追う → 「狐火をあと一度追う」（足りないとき）／「狐火を二度追う」（条件の説明）
 */
export const ENCOUNTER_GOALS: Record<EncounterKind, string> = {
  miniParade: "小さな百鬼夜行と{n}度合流する",
  foxfireTrail: "狐火を{n}度追う",
  lanternRelay: "消えた提灯を{n}度灯す",
  hokoraCircle: "祠の周りを{n}度巡る",
  hungryGroup: "腹ぺこの妖怪を{n}度もてなす",
};

/** 世界の中の「気配」。音・光で遠くから何かを知らせる（巨大なマーカーの代わり） */
export type OmenKind = "fue" | "suzu" | "warai" | "taiko" | "hayashi" | "foxfire" | "glint" | "lantern" | "shadow";

export type SiteTag = "alley" | "street" | "open" | "river" | "grove";

export interface EncounterDef {
  id: string;
  kind: EncounterKind;
  title: string;
  /** 発生しはじめる行列の大きさ（主人公を含む妖数） */
  minTotal: number;
  /** 山札に入る確率（1 = 毎夜） */
  chance: number;
  /** 山札に入る枚数 */
  copies: number;
  /** 抽選の重み */
  weight: number;
  siteTags: SiteTag[];
  /** 始まりを知らせる気配 */
  announce: OmenKind;
  /** 気配が届いたときの一言 */
  text: string;
  /** 登場する妖怪の候補と重み（今宵の妖怪・行列の構成で偏る） */
  members: Record<string, number>;
  /** 登場する妖怪の数 [最小, 最大] */
  size: [number, number];
  /** 必要な行列の妖怪数（主人公を除く） */
  needFollowers?: number;
}

export const ENCOUNTERS: EncounterDef[] = [
  {
    id: "hungry_tanuki", kind: "hungryGroup", title: "団子を欲しがる狸の一団",
    minTotal: 5, chance: 1, copies: 2, weight: 3, siteTags: ["open", "grove", "street"],
    announce: "warai", text: "どこかで、ぽんぽこと腹鼓が鳴っている…",
    members: { tanuki: 6, oni: 1 }, size: [3, 4],
  },
  {
    id: "hungry_mixed", kind: "hungryGroup", title: "腹ぺこの妖怪たち",
    minTotal: 14, chance: 0.7, copies: 1, weight: 2, siteTags: ["street", "open"],
    announce: "warai", text: "「団子の匂いがするぞ…」と、ひそひそ声がする",
    members: { tanuki: 3, kappa: 2, karakasa: 2, zashiki: 1 }, size: [3, 5],
  },
  {
    id: "foxfire_bride", kind: "foxfireTrail", title: "狐火を追う",
    minTotal: 8, chance: 1, copies: 2, weight: 3, siteTags: ["grove", "open", "alley"],
    announce: "foxfire", text: "青い狐火が、ぽっ、ぽっと灯っていく…",
    members: { kitsune: 5, hitodama: 2 }, size: [3, 4],
  },
  {
    id: "foxfire_wisp", kind: "foxfireTrail", title: "人魂の道しるべ",
    minTotal: 18, chance: 0.6, copies: 1, weight: 2, siteTags: ["grove", "river", "alley"],
    announce: "foxfire", text: "ゆらゆらと、人魂が道を示している",
    members: { hitodama: 4, chochin: 2, zashiki: 1 }, size: [3, 5],
  },
  {
    id: "lantern_relay", kind: "lanternRelay", title: "消えた提灯を順に灯す",
    minTotal: 8, chance: 1, copies: 2, weight: 3, siteTags: ["alley", "street"],
    announce: "lantern", text: "消えた提灯が、ひとつだけ揺れている…",
    members: { chochin: 1 }, size: [4, 5],
  },
  {
    id: "hokora_circle", kind: "hokoraCircle", title: "祠の周りを行列で一周",
    minTotal: 12, chance: 0.85, copies: 2, weight: 2, siteTags: ["open", "grove"],
    announce: "suzu", text: "見覚えのない祠から、鈴の音がする",
    members: { zashiki: 2, hitodama: 2, kitsune: 1, karakasa: 1 }, size: [3, 5], needFollowers: 10,
  },
  {
    id: "mini_parade", kind: "miniParade", title: "小さな百鬼夜行と合流",
    minTotal: 30, chance: 1, copies: 2, weight: 5, siteTags: [],
    announce: "fue", text: "遠くから、別の行列の笛が聞こえる…",
    members: { chochin: 3, oni: 3, tanuki: 2, kappa: 2, karakasa: 2, nekomata: 1 }, size: [4, 6],
  },
  {
    id: "mini_parade_grand", kind: "miniParade", title: "賑やかな妖怪行列と合流",
    minTotal: 55, chance: 0.5, copies: 1, weight: 4, siteTags: [],
    announce: "hayashi", text: "祭囃子とともに、もう一つの行列がやってくる",
    members: { oni: 2, kitsune: 2, hitodama: 2, karakasa: 2, rokurokubi: 1, nekomata: 2, kappa: 2 }, size: [6, 8],
  },
];

/** Encounter が起きる場所の候補（実行時に歩けるかを確かめ、だめなら近くへずらす） */
export interface EncounterSite {
  id: string;
  x: number;
  z: number;
  tags: SiteTag[];
}

export const ENCOUNTER_SITES: EncounterSite[] = [
  // 長屋の路地
  { id: "nagaya_lane_n", x: -63, z: -50, tags: ["alley"] },
  { id: "nagaya_back", x: -40, z: -51, tags: ["alley"] },
  { id: "nagaya_west", x: -93, z: -86, tags: ["alley"] },
  { id: "nagaya_south", x: -78, z: -101, tags: ["alley"] },
  { id: "nagaya_well", x: -78, z: -70, tags: ["alley", "open"] },
  // 通り
  { id: "shotengai_w", x: -82, z: -20, tags: ["street"] },
  { id: "shotengai_c", x: -48, z: -20, tags: ["street"] },
  { id: "shotengai_e", x: 36, z: -20, tags: ["street"] },
  { id: "eastside", x: 112, z: -20, tags: ["street"] },
  { id: "south_road", x: 0, z: -88, tags: ["street"] },
  { id: "temple_road", x: -34, z: 15, tags: ["street"] },
  { id: "north_road", x: 32, z: 50, tags: ["street"] },
  // 開けた場所・林
  { id: "graveyard", x: -95, z: 71, tags: ["open", "grove"] },
  { id: "temple_wood", x: -40, z: 62, tags: ["grove", "open"] },
  { id: "north_wood_w", x: -25, z: 88, tags: ["grove"] },
  { id: "north_wood_e", x: 28, z: 88, tags: ["grove"] },
  { id: "east_field", x: 100, z: -42, tags: ["open"] },
  { id: "inari_wood", x: 112, z: 20, tags: ["grove", "open"] },
  { id: "south_field", x: 102, z: -88, tags: ["open"] },
  { id: "plaza_edge", x: 22, z: 30, tags: ["open"] },
  // 川辺
  { id: "river_w_s", x: 53, z: -62, tags: ["river"] },
  { id: "river_w_n", x: 53, z: 22, tags: ["river"] },
  { id: "river_e_s", x: 83, z: -62, tags: ["river"] },
  { id: "river_e_n", x: 83, z: 22, tags: ["river"] },
];

/** Mini Parade の道筋。最後の点が「祭り地点」 */
export interface MiniParadeRoute {
  id: string;
  points: [number, number][];
  festival: string;
}

export const MINI_PARADE_ROUTES: MiniParadeRoute[] = [
  { id: "shotengai", points: [[-100, -20], [-60, -20], [-20, -20], [0, -20], [0, 6]], festival: "広場" },
  { id: "nagaya", points: [[-100, -67], [-63, -67], [-63, -20], [-20, -20], [0, -20], [0, 6]], festival: "広場" },
  { id: "south", points: [[0, -128], [0, -90], [0, -50], [0, -20], [0, 6]], festival: "広場" },
  { id: "east", points: [[126, -20], [100, -20], [80, -20], [58, -20], [30, -20], [4, -20], [0, 6]], festival: "広場" },
  { id: "inari", points: [[110, 92], [106, 72], [96, 52], [84, 50], [60, 50], [30, 50], [4, 50], [0, 44]], festival: "広場の北" },
  { id: "temple", points: [[-58, 15], [-40, 15], [-20, 15], [-9, 17]], festival: "広場の西" },
  { id: "north", points: [[0, 100], [0, 80], [0, 62], [0, 45]], festival: "広場の北" },
];

/** 今宵の妖怪：一夜ごとに seed で選ばれ、Encounter の顔ぶれが偏る */
export interface NightTheme {
  type: string;
  text: string;
  weight: number;
}
export const NIGHT_THEMES: NightTheme[] = [
  { type: "kappa", text: "川の匂いのする夜", weight: 1 },
  { type: "chochin", text: "提灯の揺れる夜", weight: 1 },
  { type: "tanuki", text: "腹鼓の聞こえる夜", weight: 1 },
  { type: "nekomata", text: "猫の目が光る夜", weight: 1 },
  { type: "oni", text: "小鬼の騒ぐ夜", weight: 1 },
  { type: "kitsune", text: "狐火の灯る夜", weight: 0.8 },
  { type: "hitodama", text: "人魂の漂う夜", weight: 0.8 },
  { type: "karakasa", text: "からん、ころんと傘の跳ねる夜", weight: 0.8 },
];
