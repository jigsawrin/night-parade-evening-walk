import type { StageDef } from "../data/stages";
import type { OmenKind } from "../data/encounters";
import type { Emitter } from "../core/Events";
import type { RhythmPhase } from "./NightRhythm";
import type { AweReason } from "../data/onmyoji";
import type { MurmurKind, YokaiDiscovery, YokaiRank } from "../data/yokaiTypes";

/** ゲームルール → 演出（ParadePresentationDirector）へ流れるイベント */
export type GameEvents = {
  join: { type: string; total: number; first: boolean; x: number; y: number; z: number; bonus?: boolean };
  rejoin: { type: string; total: number };
  /** 大妖怪・三大妖怪（隠し妖怪も）に会った（今夜はじめて、その妖怪の求めを聞いた。加入はまだ） */
  legendMeet: { type: string; rank: YokaiRank; discovery: YokaiDiscovery; x: number; z: number };
  /**
   * 大妖怪・三大妖怪（隠し妖怪も）が百鬼夜行を認めて加わった（同じ加入の join のすぐ後に流れる）。
   * 思い出・演出・縁帳はこちらを聞く（join から格を推測しない）。conditions：満たした条件の短い言葉
   */
  /**
   * 隠し妖怪（discovery = hidden。格は問わない）を見つけた：revealHidden で姿を見せたとき、一夜に一度（announce に関係なく必ず）。
   * 縁帳の met への保存・図鑑への登録は announce に関係なく行う（LegendSystem）。
   * announce：知らせ・見出しを出すか（演出だけ。false なら演出側が後で名前を出す、など）。
   * known：この発見より前の夜に、もう見つけていた（縁帳の met）。既知の妖怪の再出現を「新発見」として扱わない
   */
  specialDiscovered: { type: string; rank: YokaiRank; discovery: YokaiDiscovery; x?: number; z?: number; source?: string; announce: boolean; known: boolean };
  legendJoin: { type: string; rank: YokaiRank; discovery: YokaiDiscovery; total: number; x: number; z: number; conditions: string[] };
  /** 行列の数に誘われて、町に置いてあった妖怪が n 妖姿を見せた（ParadeAppearRules） */
  paradeDraw: { n: number; total: number };
  stageChange: { stage: StageDef; prev: StageDef; total: number; up: boolean };
  scatter: { n: number; x: number; z: number; kind: string };
  layerUnlock: { id: string; title: string; text: string };
  activityProgress: { id: string; title: string; done: number; total: number };
  activityComplete: { id: string; title: string; reward: { type: string; n: number } };
  activityFail: { id: string; title: string };
  dango: { n: number };
  threatAlert: { kind: string; x: number; z: number };
  threatYield: { kind: string; x: number; z: number };
  reveal: { type: string; x: number; y: number; z: number };
  riverMeter: { v: number };
  toast: { text: string };
  ending: { reason: "shrine" | "dawn" };

  // ---- v0.2：街が百鬼夜行に応える
  /** 賑わい（Festival Momentum）。低頻度で通知 */
  momentum: { v: number; level: number; name: string; up: boolean };
  /** 気配の段階が開いた（見えなかったものが見えはじめる） */
  presenceTier: { id: string; text: string };
  /**
   * 世界の中の気配（音・光）。巨大なマーカーの代わり。
   * source：街・Pacing・噂から届いた「呼びかけ」（計測用）。Encounter 自身の笛・提灯の揺れ等は無し
   */
  /** 潜んでいる妖怪の立てる音（小豆を洗う音など）。strength：近いほど 1 */
  murmur: { kind: MurmurKind; x: number; z: number; strength: number };
  omen: { kind: OmenKind; x: number; y: number; z: number; strength: number; source?: "attraction" | "pacing" | "rumor" };
  /** 噂（Encounter 候補）が生まれた：遠くの音・光だけ。choice = 別の方向からもう一つ届いている（分かれ道） */
  rumor: { id: number; kind: string; omen: OmenKind; text: string; x: number; z: number; choice: boolean; delay: number };
  /** 誰にも追われず、噂が薄れた */
  rumorFade: { id: number };
  /** 夜の波（静 → 気になる → 向かう → 祭り → 余韻）。演出が環境音・音楽の厚みを変える */
  rhythm: { phase: RhythmPhase };
  /** 狐火の道しるべ（順番にぽっ、ぽっと灯る） */
  guide: { points: { x: number; z: number }[] };
  /** 言霊：光の玉が、プレイヤーのそばから妖怪のいる方へ泳いでいく（序盤の誘導） */
  kotodama: { fromX: number; fromZ: number; toX: number; toZ: number };
  /** 狐火がひとつ灯る（Encounter の道） */
  foxfire: { x: number; y: number; z: number; last: boolean };
  /** promoted：噂から昇格した（気配の一言は噂のときに出ている） */
  encounterStart: { id: number; kind: string; title: string; text: string; x: number; z: number; promoted: boolean };
  encounterProgress: { id: number; title: string; p: number; label?: string };
  encounterComplete: { id: number; kind: string; title: string; x: number; z: number };
  encounterEnd: { id: number; title: string; text: string };
  miniParadeMerge: { id: number; n: number; x: number; z: number };
  landmark: { id: string; name: string; x: number; z: number };
  /** gap：前回その地区を出てからの秒数 */
  districtEnter: { id: string; name: string; first: boolean; gap: number };
  districtProgress: { id: string; name: string; p: number };
  districtAwaken: { id: string; name: string; x: number; z: number };

  // ---- 陰陽師（神社の守り）と、百鬼夜行を追いかける子供・犬
  /** 陰陽師が現れた（first = 夜のはじめの一人。増援なら false） */
  onmyojiArrive: { id: string; x: number; z: number; first: boolean; present: number };
  /** 「ん？」怪しんで振り向いた */
  onmyojiNotice: { id: string; x: number; z: number };
  /** 見つけて祓いの詠唱をはじめた（この間に視線を切れば外れる） */
  onmyojiCast: { id: string; x: number; z: number };
  /** 詠唱が外れた（隠れた・離れた） */
  onmyojiMiss: { id: string; x: number; z: number };
  /** 祓われた：pts は祓われた妖怪がいた場所（そこから町のどこかへ散る） */
  onmyojiPurge: { id: string; n: number; x: number; z: number; pts: { x: number; z: number }[]; barrier: boolean };
  /**
   * 合体魔法陣（二人以上で参道に結界を張る）。form：持ち場へ向かう（陣が薄く浮かぶ）→ on：張られた（外から踏み込むと祓われる）→ off
   * casters：張っている陰陽師の id
   */
  onmyojiBarrier: { phase: "form" | "on" | "off"; x: number; z: number; r: number; casters: string[] };
  /** 百鬼夜行の威光で退散した */
  onmyojiRout: { reason: AweReason; n: number; x: number; z: number };
  /** 子供・犬が百鬼夜行を追いかけはじめた（行列には加わらない） */
  tagalong: { kind: "kid" | "dog"; x: number; z: number; first: boolean };
};

export type GameBus = Emitter<GameEvents>;
