/**
 * 集合写真・フォトモードのデータ（データ駆動。後から陣形・スタイルを足せる）。
 *  - FORMATIONS：並び方（配置のアルゴリズムは game/after/PhotoFormation.ts の layout ごと）
 *  - POSE_STYLES：写真全体の雰囲気（リグファミリーごとにどのポーズを使うか）。陣形とは独立
 *  - PHOTO_STYLES：写真の演出（絵巻雲・花火・紙吹雪・狐火・提灯・色）。ゲームの状態は変えない
 *  - CAMERA_PRESETS：誰でも良い写真が撮れる構図。選んだ後も手で微調整できる
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */

export type FormationLayout = "trail" | "fan" | "ring" | "tiers" | "scatter";

export interface FormationDef {
  id: string;
  name: string;
  /** 一言（フォトモードの説明） */
  text: string;
  layout: FormationLayout;
  /** 隣どうしの間隔（歩） */
  spacing: number;
}

export const FORMATIONS: FormationDef[] = [
  { id: "gyoretsu", name: "大行列", text: "夜が明けたときの隊列のまま。いちばんこのゲームらしい写真", layout: "trail", spacing: 1.3 },
  { id: "ougi", name: "扇の陣", text: "主人公を手前の中央に、仲間を後ろへ扇に", layout: "fan", spacing: 1.35 },
  { id: "wa", name: "祭りの輪", text: "大きな輪の真ん中に主人公。浮く妖怪は少し上に", layout: "ring", spacing: 1.45 },
  { id: "hinadan", name: "雛壇", text: "前に小さな妖怪、後ろに背の高い妖怪、上に浮く妖怪。百妖でも全員が写る", layout: "tiers", spacing: 1.2 },
  { id: "osawagi", name: "大騒ぎ", text: "整列しない、ばらけた祭り写真", layout: "scatter", spacing: 1.5 },
];

/** 写真用のポーズ（将来の正式な Rig Pose と同じ名前で差し替えられるよう、名前で扱う） */
export type PoseId =
  | "PHOTO_A" | "PHOTO_B" | "PHOTO_C" | "BOW" | "JUMP" | "WAVE" | "DANCE" | "STILL"
  | "SIT" | "PAW" | "REST"
  | "FLOAT_A" | "FLOAT_B" | "ORBIT"
  | "SPECIAL_A" | "SPECIAL_HOP";

export type Family = "CHIBI_BIPED" | "CHIBI_QUAD" | "FLOAT" | "SERPENT" | "SPECIAL";

export interface PoseStyleDef {
  id: string;
  name: string;
  /** リグファミリーごとの候補（一妖ずつ seed で選ぶ） */
  poses: Record<Family, PoseId[]>;
  /** 正面を向くばらつき（ラジアン） */
  yawJitter: number;
  /** 写真の演出への一押し（妖しい夜：狐火を強調 等） */
  emphasis?: "kitsunebi" | "confetti";
}

export const POSE_STYLES: PoseStyleDef[] = [
  {
    id: "hai_hyakki", name: "はい、百鬼！", yawJitter: 0.15,
    poses: { CHIBI_BIPED: ["PHOTO_A", "PHOTO_B", "WAVE"], CHIBI_QUAD: ["PAW", "SIT"], FLOAT: ["FLOAT_A", "FLOAT_B"], SERPENT: ["FLOAT_A"], SPECIAL: ["SPECIAL_HOP", "SPECIAL_A"] },
  },
  {
    id: "ifu_dodo", name: "威風堂々", yawJitter: 0.03,
    poses: { CHIBI_BIPED: ["PHOTO_C"], CHIBI_QUAD: ["SIT"], FLOAT: ["FLOAT_A"], SERPENT: ["FLOAT_A"], SPECIAL: ["SPECIAL_A"] },
  },
  {
    id: "osawagi", name: "大騒ぎ", yawJitter: 0.8, emphasis: "confetti",
    poses: { CHIBI_BIPED: ["JUMP", "WAVE", "DANCE", "PHOTO_B"], CHIBI_QUAD: ["PAW", "JUMP", "DANCE"], FLOAT: ["ORBIT", "FLOAT_B"], SERPENT: ["ORBIT"], SPECIAL: ["SPECIAL_HOP", "DANCE"] },
  },
  {
    id: "ayashi", name: "妖しい夜", yawJitter: 0.25, emphasis: "kitsunebi",
    poses: { CHIBI_BIPED: ["STILL", "BOW"], CHIBI_QUAD: ["REST", "SIT"], FLOAT: ["FLOAT_B", "ORBIT"], SERPENT: ["FLOAT_B"], SPECIAL: ["SPECIAL_A"] },
  },
];

/** 絵巻雲の強さ（0 = 切） */
export type CloudLevel = 0 | 1 | 2 | 3;
export const CLOUD_LEVEL_NAMES = ["切", "控えめ", "標準", "豪華"] as const;

export interface PhotoStyleDef {
  id: string;
  name: string;
  text: string;
  clouds: CloudLevel;
  fireworks: boolean;
  confetti: boolean;
  kitsunebi: boolean;
  lanterns: boolean;
  /** 色味：露出・コントラスト・周辺減光・暖色 */
  exposure: number;
  contrast: number;
  vignette: number;
  warm: number;
}

export const PHOTO_STYLES: PhotoStyleDef[] = [
  { id: "emaki", name: "絵巻", text: "墨雲強め、和紙のような落ち着いた色", clouds: 3, fireworks: false, confetti: false, kitsunebi: false, lanterns: true, exposure: 1.0, contrast: 1.05, vignette: 2.2, warm: 0.6 },
  { id: "matsuri", name: "祭", text: "提灯・紙吹雪・花火、明るめ", clouds: 1, fireworks: true, confetti: true, kitsunebi: false, lanterns: true, exposure: 1.2, contrast: 1.1, vignette: 0.8, warm: 0.35 },
  { id: "ayakashi", name: "妖", text: "狐火・人魂と少し怪しい霞", clouds: 2, fireworks: false, confetti: false, kitsunebi: true, lanterns: false, exposure: 0.95, contrast: 1.15, vignette: 1.6, warm: 0 },
  { id: "su", name: "素", text: "演出をほぼ外して、妖怪を見やすく", clouds: 0, fireworks: false, confetti: false, kitsunebi: false, lanterns: true, exposure: 1.25, contrast: 1.0, vignette: 0, warm: 0 },
];

/** カメラの構図。向きは「行列が向いている正面」からの角度 */
export interface CameraPresetDef {
  id: string;
  name: string;
  /** 正面からの水平角（ラジアン。+ で右から） */
  yaw: number;
  /** 見下ろし角（ArcRotateCamera の beta） */
  beta: number;
  /** 全体が収まる距離に掛ける倍率 */
  fit: number;
  /** 主人公に寄る */
  hero?: boolean;
  /** 横長（行列の長い方向を真横から） */
  side?: boolean;
  fov?: number;
}

export const CAMERA_PRESETS: CameraPresetDef[] = [
  { id: "front", name: "正面", yaw: 0, beta: 1.2, fit: 1 },
  { id: "diag", name: "斜め", yaw: 0.6, beta: 1.1, fit: 1.05 },
  { id: "top", name: "俯瞰", yaw: 0.25, beta: 0.45, fit: 1.25 },
  { id: "wide", name: "超ワイド", yaw: 0.15, beta: 1.15, fit: 1.35, fov: 1.15 },
  { id: "hero", name: "主人公寄り", yaw: 0.2, beta: 1.3, fit: 1, hero: true },
  { id: "side", name: "行列横長", yaw: 0, beta: 1.22, fit: 0.9, side: true },
];
