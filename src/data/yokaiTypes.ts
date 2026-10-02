/**
 * 妖怪データ定義（データ駆動）。
 * modelUrl に GLB を指定すると、手続き生成モデルの代わりにそれが読み込まれる。
 * 妖怪は二つの軸で分ける：格（rank：通常妖怪・大妖怪・三大妖怪）と発見方式（discovery：通常・隠し）。二つは混ぜない。
 * 大妖怪・三大妖怪・隠し妖怪の足し方は docs/architecture.md の「大妖怪を足すとき」ほか。
 * 図鑑の情報（name・reading・aliases・rank・discovery・lore・zukanEncounter・zukanFlavor）の方針は docs/architecture.md の「妖怪図鑑のデータ」。
 * ゲーム本編にまだ出ない妖怪は zukanAvailability: "future"（図鑑にも今夜の候補にも出さない。隠し妖怪とは別の話）。
 * 大妖怪・三大妖怪・隠し妖怪の定義（出る場所・加入条件も）は data/legendYokai.ts。
 * ※ node --test から直接読み込むため、実行時の import は data/ の値だけ（Babylon・DOM を読まない）。
 */
import type { OmenKind } from "./encounters";
import type { OnsenAreaId } from "./onsen";
import { LEGEND_YOKAI } from "./legendYokai";
import { NORMAL_YOKAI } from "./normalYokai";
import { LEGEND_ZUKAN_ORDER, NORMAL_ZUKAN_ORDER } from "./zukanOrder";

export type RigFamily = "CHIBI_BIPED" | "CHIBI_QUAD" | "FLOAT" | "SERPENT" | "SPECIAL";

/** 加入条件の種類 */
export type JoinRule =
  | { kind: "touch" }
  | { kind: "shy"; hops: number; dist?: number } // 何度か逃げてから加わる（dist：一度に跳ねる距離。無ければ 6）
  | { kind: "flee"; speed: number } // 追いかけて捕まえる
  | { kind: "food" } // 団子が必要
  | { kind: "minCount"; count: number } // 一定数を連れて来る
  | { kind: "lantern" } // 暗い路地の提灯が灯る
  | { kind: "river" } // 川辺を歩くと現れる
  | { kind: "sky" } // 空から降りてくる
  | { kind: "perch"; reach: number } // 高いところにいて、reach まで近づくと降りてきて加わる
  | { kind: "standStill"; secs: number; reach: number } // reach の内で secs 秒立ち止まると、向こうから寄ってくる
  | { kind: "followSteps"; dist: number } // そばで一緒に dist 歩ぶん歩くと加わる（離れると待つ）
  | { kind: "respond"; secs: number } // 呼びかけてくる。そばで secs 秒立ち止まって応えると加わる
  | { kind: "contrary" } // 近づくと離れ、背を向けて歩くとついてきて加わる
  | { kind: "sidestep" } // 正面を向け続ける。脇・後ろへ回り込んで触れると加わる
  | { kind: "disguise"; as: string; hops: number } // 別の妖怪（as）に化けている。何度か逃げた後、触れると正体を現して加わる
  | { kind: "variety"; n: number } // 行列にいる妖怪の種類が n 種以上なら加わる（足りなければ一言）
  | { kind: "drop"; reach: number } // 高い所に潜み、reach まで来ると上から降りて驚かせる。その後は触れると加わる
  /** 別の姿（looks：MODELS の ID）で置き、近づくたび（near：歩）に次の姿へ。最後に本当の姿を現し、触れると加わる */
  | { kind: "gaze"; looks: string[]; near: number[] }
  /**
   * 大妖怪・三大妖怪：その妖怪らしい百鬼夜行（conditions をすべて満たす）を見せると認めて加わる。
   * ask：足りないときの一言、ok：認めたときの一言。判定は game/legends/LegendRules.ts
   */
  | { kind: "legend"; conditions: LegendCondition[]; ask: string; ok: string; greet?: LegendGreet };

/** 大妖怪に会ったとき、相手（with）をもう連れていたら言う一言（任意。加入条件ではない） */
export interface LegendGreet {
  with: string;
  text: string;
}

/**
 * 大妖怪・三大妖怪の加入条件の一つ（すべて AND）。足りないときの短い言葉は LegendRules.legendMissing が作る。
 * 新しい種類が要るときは、ここと LegendRules の switch に一つずつ足す（妖怪ごとの if 文は作らない）。
 */
export type LegendCondition =
  /** 今の行列に、この種類が n 妖以上 */
  | { kind: "specificYokai"; type: string; n: number }
  /** 行列の総数（主人公を含む）が n 妖以上 */
  | { kind: "totalCount"; n: number }
  /** 行列の遊び（千本鳥居・太鼓橋…）を n 個成就 */
  | { kind: "activityCount"; n: number }
  /** 地区を祭りにした（district を指定すればその地区、無ければ n 地区） */
  | { kind: "districtAwakened"; district?: string; n?: number }
  /** Encounter を n 回成就（encounter = 種類。foxfireTrail など。無ければ何でも） */
  | { kind: "encounterComplete"; encounter?: string; n: number }
  /** 賑わいが段 level（0 静か … 4 熱狂）以上 */
  | { kind: "momentum"; level: number }
  /** 今の行列にいる妖怪の種類が n 種以上（主人公を除く） */
  | { kind: "typeVariety"; n: number };

/**
 * 妖怪の格（強さ・格式）。
 *  normal：通常妖怪（町や Encounter で何妖も出る）／greater：大妖怪（一夜に各一体、今夜の候補から）／
 *  threeGreat：三大妖怪（酒呑童子・玉藻前・大嶽丸の三体だけ。大妖怪よりさらに特別。一夜に 0〜1）
 * 候補数・重要度などの値は data/legendConfig.ts。
 */
export type YokaiRank = "normal" | "greater" | "threeGreat";

/**
 * 発見方式（格とは別の軸）。hidden：隠し妖怪。通常の候補とは別に抽選し、Pacing・狐火・言霊・通常の気配・ヒントは教えない。
 * 例：ぬらりひょん = 格は大妖怪（greater）、発見方式は隠し（hidden）。珍しい小妖怪を normal + hidden にもできる。
 */
export type YokaiDiscovery = "normal" | "hidden";

/** 陰陽師への効き目（連れていると）。rout = 退散させる。ほかは弱める（まだ使う妖怪はいない） */
export type AweEffect =
  | { mode: "none" }
  | { mode: "rout"; text: string; memory: string }
  /** 詠唱を遅くする（amount = 0.3 なら 1.3 倍の長さ） */
  | { mode: "slowCast"; amount: number }
  /** 怪しさの溜まり方を弱める（amount = 0.3 なら 0.7 倍） */
  | { mode: "lowerSuspicion"; amount: number };

/** 集合写真での立ち位置（雛壇）。centerpiece = 主人公のすぐ後ろの中央、flank = 主人公の両脇、rear = 最後列の中央の高い所、air = 上空の中央 */
export type PhotoRole = "normal" | "centerpiece" | "flank" | "rear" | "air";

/**
 * 大妖怪・三大妖怪の気配（LegendOmen）。通常の妖怪とは少し違う音・光で、世界の中に存在を示す。
 * kind：今ある気配（ParadeAttractionSystem が鳴らす）。cues：将来の専用演出の手がかり（今は記録だけ）
 */
export interface LegendOmen {
  kind: OmenKind;
  cues: string[];
}

/**
 * 図鑑に数えるか（格・発見方式とは別の軸）。無ければ active。
 *  active：ゲーム本編で会える・仲間にできる。図鑑の分母に入る（隠し妖怪は見つけてから）
 *  future：名簿と図鑑の文だけ決まっていて、ゲーム本編にはまだ出ない。図鑑の枠も分母も無く、今夜の候補・温泉宿の客にもならない。
 * future の妖怪にも姿・加入条件などの項目は要る（仮の値でよい。使われない）。本編に実装したら値を書いて active にする（それだけで図鑑の対象になる）。
 */
export type ZukanAvailability = "active" | "future";

/**
 * 加入の前後の一言（無ければ既定の言葉）。名前は付けずに書く（「猫又「ぷいっ」」の「ぷいっ」だけ）。
 * tease：逃げる・ためらう・呼びかける、tired：追われて疲れた、ask：足りないとき（{n} は必要な数）、ok：加わる、appear：潜んでいたのが姿を見せる
 */
export interface YokaiTalk {
  tease?: string;
  tired?: string;
  ask?: string;
  ok?: string;
  appear?: string;
}

/**
 * 通常妖怪の由来の区分（内部だけ。画面には出さない。画面ではすべて「妖怪」）。
 * visitingGod 来訪神・buddhist 仏教・myth 神話・prophetic 予言獣・modern 近現代の怪談
 */
export type OriginKind = "folklore" | "visitingGod" | "buddhist" | "myth" | "prophetic" | "modern";

export type SeKey = "pita" | "ponpoko" | "fuwa" | "bo" | "karan" | "nya" | "kon" | "hoo" | "kusu" | "hira";

export interface YokaiType {
  id: string;
  /** 表示名（短い正式名。名前の見出し・加入・写真・結果で出すのはこれだけ） */
  name: string;
  /** 読み（ひらがな。図鑑でだけ出す。名前に連結しない） */
  reading: string;
  family: RigFamily;
  rule: JoinRule;
  se: SeKey;
  /**
   * 図鑑の「伝承」：本来の妖怪について（伝承・原典・一般に語られる性質）だけ。1〜2 文。
   * このゲームでの出会い方・加入条件は書かない（zukanEncounter へ）。史料の伝承とゲーム独自の設定を混ぜない
   */
  lore: string;
  /**
   * 図鑑の「この町での出会い方」：百鬼夜行 ～宵歩き～ での出会い方・加入条件（登録後に読むので条件を隠さない）。
   * **加入条件（rule）・出る場所を変えたら、ここも確かめる**（tests/zukanBook.test.ts が数・条件の食い違いの一部を見張る）
   */
  zukanEncounter: string;
  /** 図鑑のひとこと：このゲーム世界の情景を一行で（8〜35 字ほど）。史実の説明にしない */
  zukanFlavor: string;
  /** 近くに来たときのヒント（加入前） */
  hint: string;
  /** 浮遊高度 */
  hover?: number;
  scale?: number;
  modelUrl?: string;
  /** 格（すべての妖怪に書く） */
  rank: YokaiRank;
  /** 発見方式（すべての妖怪に書く） */
  discovery: YokaiDiscovery;
  /** 図鑑に載せるか（無ければ載せる。NPC・演出だけの妖怪を外すとき false） */
  zukan?: boolean;
  /** 別名・呼称（図鑑の詳細にだけ出す。表示名 name は短く。要る妖怪にだけ書く。例：玉藻前 → ["九尾の狐"]） */
  aliases?: string[];
  /** 図鑑に数えるか（無ければ active。まだ本編に出ない妖怪は future） */
  zukanAvailability?: ZukanAvailability;
  /** 一夜に一体まで（大妖怪以上は省略しても一体。LegendRules.isUniquePerNight） */
  uniquePerNight?: boolean;
  /** 陰陽師への効き目（無ければ効かない） */
  awe?: AweEffect;
  /** 集合写真での立ち位置（無ければ normal） */
  photoRole?: PhotoRole;
  /** 将来：写真で使う専用ポーズ（data/photo.ts の PoseId）。今はリグファミリーのポーズのまま */
  photoPoseOverride?: string;
  /** 大妖怪・三大妖怪の気配（隠し妖怪には書かない：通常の気配では教えない） */
  omen?: LegendOmen;
  /** 温泉宿「宵霞楼」に泊まりに来たとき（data/onsen.ts・onsenMap.ts） */
  onsen?: YokaiOnsen;
  /** 加入の前後の一言（無ければ既定の言葉） */
  talk?: YokaiTalk;
  /** 歩き方（hop：一本足で跳ねる。無ければ family の歩き方） */
  gait?: "hop";
  /**
   * 通常妖怪が町に混ざりはじめる段（内部だけ。画面・図鑑・加入の演出には出さない）。無ければ 0（はじめからいる 12 種）。
   * 解禁は game/normal/NormalUnlockRules.ts、値は data/normalYokai.ts
   */
  normalWave?: number;
  /** 由来の区分（内部だけ。画面には出さない） */
  originKind?: OriginKind;
  /** 潜んでいる間に聞こえる音（近いほど大きい。小豆洗いの「しゃっ、しゃっ」） */
  murmur?: MurmurKind;
}

/** 潜んでいる妖怪が立てる音の種類 */
export type MurmurKind = "shaka";

/**
 * 温泉宿での様子。preferredArea：居たがる区域（埋まっていれば同じ系統へ）、vignetteTags：小さな寸劇の手がかり（同じ札の客が近くに集まる）、
 * lines：話しかけたときの一言（1〜2 行。加入条件の話はしない）
 */
export interface YokaiOnsen {
  preferredArea?: OnsenAreaId;
  vignetteTags?: string[];
  lines?: string[];
}

/** 本編に出る妖怪か（future でない）。今夜の候補・図鑑・温泉宿の客はこれを通す */
export function isActiveYokai(def: Pick<YokaiType, "zukanAvailability"> | undefined) {
  return !!def && def.zukanAvailability !== "future";
}

export const YOKAI: Record<string, YokaiType> = {
  oni: {
    id: "oni", name: "小鬼", reading: "こおに", family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "karan", rank: "normal", discovery: "normal",
    lore: "鬼は人に災いや恐れをもたらす異形として古くから語られる。",
    zukanEncounter: "町で見つけて近づくと、楽しそうに百鬼夜行へ加わる。",
    zukanFlavor: "祭囃子が聞こえると、もう足が勝手に動いている。",
    hint: "「なんだか楽しそうだな…」",
    onsen: { preferredArea: "banquet", vignetteTags: ["sake"], lines: ["湯上がりの一杯が、いちばんうまい！", "ここの座布団、ふっかふかだぞ。"] },
  },
  kappa: {
    id: "kappa", name: "河童", reading: "かっぱ", family: "CHIBI_BIPED", rule: { kind: "river" }, se: "pita", rank: "normal", discovery: "normal",
    lore: "川や淵に棲む水の妖怪として各地に伝わる。",
    zukanEncounter: "川辺を歩き続けると水面から現れる。近づけば百鬼夜行へ加わる。",
    zukanFlavor: "行列の横を流れる水音だけは、いつまでも気になるらしい。",
    hint: "川辺をもっと歩いてみよう",
    onsen: { preferredArea: "uchiyu", vignetteTags: ["water"], lines: ["ここの湯は、川よりあったけえな。", "皿が乾かねえのが、何よりだ。"] },
  },
  chochin: {
    id: "chochin", name: "提灯お化け", reading: "ちょうちんおばけ", family: "FLOAT", rule: { kind: "lantern" }, se: "fuwa", rank: "normal", discovery: "normal",
    lore: "古い提灯が化けた妖怪として親しまれる。",
    zukanEncounter: "暗い路地の消えた提灯へ近づくと目を覚まし、そのまま百鬼夜行へ加わる。",
    zukanFlavor: "灯を入れてもらうと、少しだけ背筋が伸びる。",
    hint: "暗い路地の提灯に近づこう", hover: 0.55,
    onsen: { preferredArea: "genkan", lines: ["いらっしゃい。…いや、おれも客だった。", "玄関は明るいほうがいいだろう？"] },
  },
  tanuki: {
    id: "tanuki", name: "化け狸", reading: "ばけだぬき", family: "CHIBI_BIPED", rule: { kind: "food" }, se: "ponpoko", rank: "normal", discovery: "normal",
    lore: "狸は人を化かす獣として各地で語られてきた。",
    zukanEncounter: "団子を持って近づき、ひとつ渡すと百鬼夜行へ加わる。",
    zukanFlavor: "腹鼓の拍子は、たいてい団子の数で決まる。",
    hint: "「おなかすいた…団子があればなあ」",
    onsen: { preferredArea: "hiroma", vignetteTags: ["sake"], lines: ["宿のまんじゅう、もう三つ目だ。", "腹も湯も、ぽかぽかだぁ。"] },
  },
  zashiki: {
    id: "zashiki", name: "座敷童", reading: "ざしきわらし", family: "CHIBI_BIPED", rule: { kind: "flee", speed: 6.0 }, se: "kusu", rank: "normal", discovery: "normal",
    talk: { tease: "つかまえてごらん！", tired: "はあ、はあ…" },
    lore: "家に住みつき福をもたらすと語られる子供姿の怪。",
    zukanEncounter: "長屋で逃げ回る。追いついて捕まえると百鬼夜行へ加わる。",
    zukanFlavor: "行列の中で、いちばん楽しそうに笑っている。",
    hint: "追いかけて捕まえよう",
    onsen: { preferredArea: "zashiki", lines: ["この座敷、ぼくの家よりひろい！", "かくれんぼ、する？"] },
  },
  hitodama: {
    id: "hitodama", name: "火の玉", reading: "ひのたま", family: "FLOAT", rule: { kind: "touch" }, se: "bo", rank: "normal", discovery: "normal",
    lore: "死者の魂や怪火と結びつけて語られる火の玉。",
    zukanEncounter: "墓地のあたりを漂っている。触れると、ふわりと百鬼夜行についてくる。",
    zukanFlavor: "ぼっ、と灯るたび、夜道が少しあたたかい。",
    hint: "「ぼっ」", hover: 0.9, scale: 0.85,
    onsen: { preferredArea: "nakaniwa", lines: ["……ぼっ。（湯煙の中で、気持ちよさそうに揺れている）"] },
  },
  nekomata: {
    id: "nekomata", name: "猫又", reading: "ねこまた", family: "CHIBI_QUAD", rule: { kind: "shy", hops: 2 }, se: "nya", rank: "normal", discovery: "normal",
    talk: { tease: "ぷいっ", ok: "…しかたないにゃあ" },
    lore: "年を経た猫が尾を二つに分けて化けると語られる妖怪。",
    zukanEncounter: "近づくと何度か逃げる。諦めずについていくと百鬼夜行へ加わる。",
    zukanFlavor: "ついてきたのではない。たまたま同じ道だっただけ、らしい。",
    hint: "何度か近づいてみよう",
    onsen: { preferredArea: "engawa", lines: ["……ここなら尻尾を隠さんでもよさそうだ。", "縁側は、猫のためにある。"] },
  },
  karakasa: {
    id: "karakasa", name: "唐傘お化け", reading: "からかさおばけ", family: "SPECIAL", gait: "hop", rule: { kind: "touch" }, se: "karan", rank: "normal", discovery: "normal",
    lore: "古い傘が化けた姿で親しまれる妖怪。",
    zukanEncounter: "町なかや屋根の上を一本足で跳ね歩いている。見つけて触れると百鬼夜行へ加わる。",
    zukanFlavor: "雨の夜より、祭りの夜のほうが好きらしい。",
    hint: "「からん、ころん」",
    onsen: { preferredArea: "maeniwa", lines: ["湯気で、骨がしっとりするねえ。", "からん、ころん。庭石の上は歩きやすい。"] },
  },
  kitsune: {
    id: "kitsune", name: "化け狐", reading: "ばけぎつね", family: "CHIBI_QUAD", rule: { kind: "touch" }, se: "kon", rank: "normal", discovery: "normal",
    lore: "狐は人へ化け、不思議な術を使うものとして古くから語られる。",
    zukanEncounter: "稲荷や妖怪横丁に姿を見せる。近づいて触れると百鬼夜行へ加わる。",
    zukanFlavor: "こん、とひと声。振り向くと、もう行列にいる。",
    hint: "「こん」",
    onsen: { preferredArea: "nakaniwa", lines: ["こん。中庭の石灯籠、よい灯りです。", "狸殿が、また饅頭を取っていきました。"] },
  },
  tengu: {
    id: "tengu", name: "天狗", reading: "てんぐ", family: "CHIBI_BIPED", rule: { kind: "minCount", count: 15 }, se: "hoo", rank: "normal", discovery: "normal",
    talk: { ask: "小さい行列よのう。{n}妖を連れて参れ", ok: "見事な行列よ。わしも加わろう" },
    lore: "山に棲み、人知を超えた力を持つ存在として各地に伝わる。",
    zukanEncounter: "十五妖以上の行列を見せると認められ、百鬼夜行へ加わる。",
    zukanFlavor: "行列の長さを、腕を組んで数えている。",
    hint: "「小さい行列よのう。十五妖を連れて参れ」", scale: 1.15,
    onsen: { preferredArea: "engawa", lines: ["修行の合間の湯も、また修行よ。", "縁側からの眺め、悪くない。"] },
  },
  rokurokubi: {
    id: "rokurokubi", name: "ろくろ首", reading: "ろくろくび", family: "SPECIAL", rule: { kind: "touch" }, se: "kusu", rank: "normal", discovery: "normal",
    lore: "夜になると首を長く伸ばすと語られる妖怪。",
    zukanEncounter: "夜が更けるほど長屋の窓辺に姿を見せる。近づくと百鬼夜行へ加わる。",
    zukanFlavor: "首を伸ばせば、行列の先頭までよく見える。",
    hint: "「夜もふけてきたねえ」", scale: 1.0,
    onsen: { preferredArea: "zashiki", lines: ["首を伸ばすと、露天の様子まで見えるのよ。", "夜更けの宿って、落ち着くわねえ。"] },
  },
  ittan: {
    id: "ittan", name: "一反木綿", reading: "いったんもめん", family: "FLOAT", rule: { kind: "sky" }, se: "hira", rank: "normal", discovery: "normal",
    lore: "鹿児島に伝わる、白い布のように空を飛ぶ妖怪。",
    zukanEncounter: "百鬼夜行が大きくなり空の気配が開くと、上空から舞い降りてくる。",
    zukanFlavor: "夜空に白い布がひるがえると、行列が少しだけ長くなる。",
    hint: "", hover: 2.2, scale: 1.2,
    onsen: { preferredArea: "nakaniwa", lines: ["（湯煙に乗って、ひらひらと漂っている）"] },
  },
  // ---- 何度か夜を歩くうちに町へ混ざってくる通常妖怪（41 種。data/normalYokai.ts）
  ...NORMAL_YOKAI,
  // ---- 大妖怪・三大妖怪・隠し妖怪（出る場所・加入条件と一緒に data/legendYokai.ts）
  ...LEGEND_YOKAI,
};

/**
 * 図鑑の正式な順（data/zukanOrder.ts が唯一の元。データの定義の並びを変えても図鑑の順は変わらない）：
 * 通常妖怪 53 種（町に混ざる順）→ 大妖怪（ぬらりひょんは見つけた後だけ、大妖怪の最後）→ 三大妖怪。
 */
export const YOKAI_ORDER: string[] = [...NORMAL_ZUKAN_ORDER, ...LEGEND_ZUKAN_ORDER];

/** 絵巻・結果の小さなアイコン（丸い墨判の一文字） */
export const YOKAI_ICON: Record<string, string> = {
  oni: "鬼", hitodama: "魂", chochin: "灯", tanuki: "狸", zashiki: "童", nekomata: "猫",
  kappa: "河", karakasa: "傘", rokurokubi: "首", tengu: "天", kitsune: "狐", ittan: "反",
  umibozu: "坊", hitotsume: "目", yukionna: "雪", nurikabe: "壁", konaki: "泣", sunakake: "砂", yamauba: "姥",
  amanojaku: "邪", kamaitachi: "鎌", sunekosuri: "脛", baku: "獏", ningyo: "魚", azukiarai: "豆", jorogumo: "絡",
  nopperabo: "無", tsurube_otoshi: "釣", kasha: "車", mokumokuren: "障",
  teketeke: "手", amabie: "予", nue: "鵺", namahage: "蓑", kudan: "件", hasshaku: "八",
  tsuchigumo: "蜘", ippon_datara: "踏", mujina: "狢", gaki: "餓", satori: "覚", katawaguruma: "輪",
  kyokotsu: "井", nozuchi: "槌", makuragaeshi: "枕", isohime: "磯", moryo: "魍",
  uwan: "叫", nuppeppo: "肉", yatagarasu: "烏", waira: "爪", shirikoboshi: "潮",
  shuten: "酒", daitengu: "嶽", tamamo: "藻", otakemaru: "丸",
  ibaraki: "茨", ushi_oni: "牛", orochi: "蛇", daidara: "巨", sanmoto: "魔", shinno_akugoro: "神", ryomen: "儺", gashadokuro: "骨", amanozako: "逆", hakutaku: "沢",
  nurarihyon: "瓢",
};
