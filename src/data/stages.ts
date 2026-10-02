/**
 * 夜行位（百鬼夜行の成長段階）ごとの演出データ。
 * ルール側は minCount だけを見て段階を決め、演出側がこの表を読む。
 */
export type StageId = "SOLO" | "SMALL_PARADE" | "PARADE" | "FESTIVAL" | "HYAKKI_YAGYO";
export type ThreatMode = "chase" | "yield" | "follow";

export interface StageDef {
  stage: StageId;
  label: string;
  jp: string;
  minCount: number;
  /** 楽器レイヤー音量 A:環境 B:篠笛 C:三味線 D:琴 E:太鼓 F:鈴・拍子木 */
  music: { A: number; B: number; C: number; D: number; E: number; F: number };
  tempo: number;
  uiTheme: string;
  joinVfx: "washi" | "washi_petal" | "washi_gold" | "gold_confetti";
  ambientSfx: "none" | "crowd_small" | "crowd_medium" | "crowd_large";
  lanternLevel: number;
  camera: { distance: number; pitch: number };
  playerLight: number;
  threatMode: ThreatMode;
  confetti: boolean;
  kitsunebi: boolean;
}

export const STAGES: StageDef[] = [
  {
    stage: "SOLO", label: "SOLO", jp: "独り歩き", minCount: 1,
    music: { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 }, tempo: 84,
    uiTheme: "solo", joinVfx: "washi", ambientSfx: "none", lanternLevel: 0,
    camera: { distance: 10, pitch: 1.0 }, playerLight: 11, threatMode: "chase", confetti: false, kitsunebi: false,
  },
  {
    stage: "SMALL_PARADE", label: "SMALL PARADE", jp: "小行列", minCount: 5,
    music: { A: 0.9, B: 1, C: 0, D: 0, E: 0, F: 0 }, tempo: 86,
    uiTheme: "small", joinVfx: "washi", ambientSfx: "crowd_small", lanternLevel: 1,
    camera: { distance: 15, pitch: 0.95 }, playerLight: 14, threatMode: "chase", confetti: false, kitsunebi: false,
  },
  {
    stage: "PARADE", label: "PARADE", jp: "行列", minCount: 15,
    music: { A: 0.7, B: 1, C: 0.9, D: 0.8, E: 0, F: 0 }, tempo: 88,
    uiTheme: "parade", joinVfx: "washi_petal", ambientSfx: "crowd_small", lanternLevel: 2,
    camera: { distance: 22, pitch: 0.9 }, playerLight: 18, threatMode: "yield", confetti: false, kitsunebi: false,
  },
  {
    stage: "FESTIVAL", label: "FESTIVAL", jp: "宴", minCount: 30,
    music: { A: 0.5, B: 1, C: 1, D: 0.9, E: 1, F: 0.3 }, tempo: 92,
    uiTheme: "festival", joinVfx: "washi_gold", ambientSfx: "crowd_medium", lanternLevel: 3,
    camera: { distance: 31, pitch: 0.86 }, playerLight: 22, threatMode: "follow", confetti: false, kitsunebi: true,
  },
  {
    stage: "HYAKKI_YAGYO", label: "HYAKKI YAGYO", jp: "百鬼夜行", minCount: 50,
    music: { A: 0.4, B: 1, C: 1, D: 1, E: 1, F: 1 }, tempo: 96,
    uiTheme: "hyakki", joinVfx: "gold_confetti", ambientSfx: "crowd_large", lanternLevel: 4,
    camera: { distance: 40, pitch: 0.82 }, playerLight: 26, threatMode: "follow", confetti: true, kitsunebi: true,
  },
];

export function stageFor(count: number): StageDef {
  let s = STAGES[0];
  for (const st of STAGES) if (count >= st.minCount) s = st;
  return s;
}
export function stageIndex(id: StageId) {
  return STAGES.findIndex((s) => s.stage === id);
}

/**
 * 中盤から百妖までの音の段（夜行位の楽器 A〜F に重ねる）。30 妖までの音（はじめの無音・最初に鳴りだす笛）は変えない。
 * 行列が count 妖に届くと、その楽器が静かに加わる。どれも昔からある（ありそうな）和の鳴り物。煩くしない（遠く・低く・残響多め）。
 * 楽器の音は presentation/audio/Instruments.ts、鳴らし方は MusicDirector。**値はすべて仮**（聴いて決める）
 */
export type SwellId = "tsuzumi" | "kane" | "sho" | "biwa" | "ryuteki" | "horagai";

export interface MusicSwell {
  id: SwellId;
  /** 楽器の名前（デバッグ・説明用） */
  jp: string;
  count: number;
  /** 加わったときの音量（0..1） */
  level: number;
  /** テンポへの足し算（夜行位のテンポに足す。少しずつ前のめりに） */
  tempo: number;
}

export const MUSIC_SWELLS: MusicSwell[] = [
  { id: "tsuzumi", jp: "小鼓", count: 40, level: 0.8, tempo: 0 },
  { id: "kane", jp: "摺鉦", count: 60, level: 0.7, tempo: 1 },
  { id: "sho", jp: "笙", count: 70, level: 0.6, tempo: 1 },
  { id: "biwa", jp: "琵琶", count: 80, level: 0.8, tempo: 2 },
  { id: "ryuteki", jp: "龍笛", count: 90, level: 0.7, tempo: 3 },
  { id: "horagai", jp: "法螺貝", count: 100, level: 0.8, tempo: 4 },
];

/** 行列の数で加わっている段（楽器ごとの音量）と、テンポへの足し算 */
export function swellsFor(count: number, swells: readonly MusicSwell[] = MUSIC_SWELLS) {
  const levels = Object.fromEntries(swells.map((s) => [s.id, count >= s.count ? s.level : 0])) as Record<SwellId, number>;
  let tempo = 0;
  for (const s of swells) if (count >= s.count) tempo = s.tempo;
  return { levels, tempo };
}
