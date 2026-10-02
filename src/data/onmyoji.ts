/**
 * 陰陽師（見廻りの高位版）のデータ。神社の手前・参道を守っている。
 * 戦闘はない。見つかると行列の妖怪が何妖か祓われ、町のどこかへ散ってしまう（触れれば戻る）。
 * 見つからないように通る（隠れる・背後を抜ける・脇から回る）ことも、百鬼夜行の威光で逆に退かせることもできる。
 * ※ node --test から読むため、実行時の import を持たない。
 */

export interface OnmyojiGuardDef {
  id: string;
  /** 見張りの持ち場 */
  post: [number, number];
  /** 見廻りの道（端で立ち止まって左右を見る） */
  patrol: [number, number][];
  /** 現れる条件（null = 夜のはじめから）。人数か夜の進み具合のどちらかを満たすと、神社から出てくる */
  arrive: { total?: number; progress?: number } | null;
  /** 退散するときに逃げていく先 */
  flee: [number, number];
}

export const ONMYOJI_GUARDS: OnmyojiGuardDef[] = [
  // 参道を行き来する（北へ歩くときは背中を向けている）
  { id: "a", post: [0, 90], patrol: [[0, 99], [0, 84], [0, 72], [0, 84]], arrive: null, flee: [-30, 80] },
  // 拝殿の前を左右に見廻る（脇から回り込む道を見張る）
  { id: "b", post: [0, 106], patrol: [[-11, 106], [11, 106]], arrive: { total: 40, progress: 0.45 }, flee: [30, 96] },
  // 夜更け：一の鳥居の前を見張る
  { id: "c", post: [0, 69], patrol: [[-13, 70], [13, 70]], arrive: { progress: 0.72 }, flee: [-28, 58] },
];

/** 陰陽師が出てくる場所（拝殿の前） */
export const ONMYOJI_GATE: [number, number] = [0, 109];

export const ONMYOJI_CFG = {
  /** 見える距離・視野の半角（ラジアン）・背後でも気付く距離 */
  sight: 14,
  halfAngle: 0.95,
  near: 3.2,
  /** 視線の判定の間隔（秒） */
  tick: 0.2,
  /** 見られている間に「怪しい」が溜まる速さ（近いほど速い）・見えなくなると抜ける速さ */
  fillNear: 1.7,
  fillFar: 0.7,
  drain: 0.6,
  /** ここを超えると振り向いて様子を見る（！） */
  noticeAt: 0.3,
  /** 見つけてから祓うまでの詠唱（この間に視線を切れば外れる） */
  castSec: 1.1,
  castRange: 17,
  /** 祓った後（外れた後）に見張りへ戻るまで */
  cooldown: 11,
  missCooldown: 5,
  /** 祓われた後、主人公が見逃される秒数 */
  invuln: 4,
  walk: 1.7,
  /** 見廻りの端で立ち止まる秒数 */
  lookSec: [1.6, 2.8] as [number, number],
  /** 威光を感じる距離（ここまで近づくと退散する） */
  aweRange: 17,
  /** 陰陽師の近くにいると HUD に一言出す距離 */
  hintRange: 15,
} as const;

/** 合体魔法陣（二人以上で参道に結界を張る） */
export const BARRIER = {
  x: 0,
  z: 96,
  r: 7.5,
  /** 張っている秒数 */
  sec: 13,
  /** 次に張るまでの休み（seed で揺らす） */
  rest: [20, 30] as [number, number],
  /** 主人公がここまで近づいたら張りはじめる */
  trigger: 44,
  /** 持ち場に着くまでの上限（秒） */
  formSec: 6,
} as const;

/** 逆に退かせる条件（威光） */
export const AWE = {
  /** 陰陽師が一人なら五十妖、二人以上なら八十妖 */
  solo: 50,
  group: 80,
  /** 化け狐がこれだけいると「葛の葉の眷属」として畏れる（安倍晴明の母は狐） */
  kitsune: 6,
  /** 熱狂（賑わいの最上段）の百鬼夜行には、一人の陰陽師では敵わない */
  fervorLevel: 4,
  fervorMin: 30,
  // 連れているだけで陰陽師が退く妖怪は、妖怪のデータ（data/yokaiTypes.ts の awe: { mode: "rout" }）に書く
} as const;

/** 人数・狐・熱狂による威光 */
export type CrowdAweReason = "kitsune" | "size" | "fervor";
/** 威光の理由：CrowdAweReason か、退かせた妖怪の種類（shuten など。awe.mode = "rout" を持つ妖怪） */
export type AweReason = CrowdAweReason | (string & {});

/** 退散のときの一言（理由ごと。妖怪が理由のときは、その妖怪の awe.text） */
export const ROUT_TEXT: Record<CrowdAweReason, string> = {
  kitsune: "陰陽師「葛の葉様の眷属…これは、手出しできぬ」",
  size: "陰陽師「な、なんという百鬼夜行…！ 退け、退けっ」",
  fervor: "陰陽師「この熱狂…一人では抑えきれぬ！」",
};

/** 絵巻・結果の一言（妖怪が理由のときは、その妖怪の awe.memory） */
export const ROUT_MEMORY: Record<CrowdAweReason, string> = {
  kitsune: "狐の一族を連れて、陰陽師を退けた",
  size: "百鬼夜行の威光で、陰陽師を退けた",
  fervor: "熱狂の百鬼夜行で、陰陽師を退けた",
};
