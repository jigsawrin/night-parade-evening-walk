/**
 * NightPacingDirector：プレイヤーが迷子になりそうなとき、世界に小さな引っ掛かりを作る。
 * 「次の仕事を作る」装置ではない。10 秒くらい静かな時間があっても異常扱いしない。報酬（妖怪）は直接与えない。
 *
 *  omen      → 既にある妖怪・Activity・地区・Encounter・噂の気配を、もう一度だけ届ける
 *  guide     → 狐火などで、音・光だけで大まかな方向を匂わせる
 *  encounter → それでも長く何もなければ、新しい噂（Encounter 候補）を世界に出す
 *  （最終手段：噂が出たまま迷い続けていれば、その噂を本物の Encounter にする ─ FestivalSystems）
 *
 *  序盤：気配 18 / 誘導 28 / 噂 44 秒　中盤：16 / 26 / 38 秒　後半：14 / 24 / 36 秒
 *
 * 静かな時間（quiet）は「実際に歩いている間」だけ進む。放置中は進まないので救済が大量発生しない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */

/** retry：Encounter 段階の後もまだ何も起きていない（誘導し直す／最終手段を考える） */
export type PacingAction = "omen" | "guide" | "encounter" | "retry";

export interface PacingInput {
  /** 実際に移動している（入力があり、速度が出ている） */
  moving: boolean;
  /** 最近、新しい／久しぶりの場所を踏んでいる */
  exploring: boolean;
  /** 夜行位のインデックス（0 = 独り歩き） */
  stageIndex: number;
}

/** 夜行位ごとの閾値 [気配, 誘導, Encounter]（秒） */
export function pacingThresholds(stageIndex: number): [number, number, number] {
  // 序盤（独り歩き・小行列）は固定配置の妖怪が密なので長めに待つ。後半（百鬼夜行）でも静けさは残す
  if (stageIndex <= 1) return [18, 28, 44];
  if (stageIndex <= 3) return [16, 26, 38];
  return [14, 24, 36];
}

/** Encounter 段階の後、それでも何も起きないときに方向をもう一度示す間隔（秒） */
export const PACING_RETRY = 24;

export class NightPacingDirector {
  t = 0;
  lastJoinT = 0;
  lastDiscoverT = 0;
  lastEventT = 0;
  /** 何も起きていない「歩いている」時間 */
  quiet = 0;
  /** 0: 何もしていない 1: 気配済み 2: 誘導済み 3: Encounter 済み */
  step = 0;
  idle = 0;
  private retry = 0;

  /** 妖怪が加入した */
  notifyJoin() {
    this.lastJoinT = this.t;
    this.reset();
  }
  /** 新しい妖怪・気配を見つけた（姿を見せた等） */
  notifyDiscover() {
    this.lastDiscoverT = this.t;
    this.reset();
  }
  /** イベントが起きた（Encounter 開始・成就、地区覚醒、世界の層…） */
  notifyEvent() {
    this.lastEventT = this.t;
    this.reset();
  }
  /** 街の方から気配が届いた（ParadeAttraction の気配）。「気配」段階を済ませたことにする */
  notifyOmen() {
    if (this.step < 1) this.step = 1;
  }

  private reset() {
    this.quiet = 0;
    this.step = 0;
    this.retry = 0;
  }

  /** dt 秒ぶん進める。低頻度（0.25〜0.5 秒ごと）で呼べばよい。行動が必要なら返す */
  update(dt: number, input: PacingInput): PacingAction | null {
    this.t += dt;
    if (!input.moving) {
      this.idle += dt;
      return null;
    }
    this.idle = 0;
    // 同じ所を回っているだけなら半分の速さで
    this.quiet += input.exploring ? dt : dt * 0.5;
    const [omen, guide, enc] = pacingThresholds(input.stageIndex);
    if (this.step < 1 && this.quiet >= omen) {
      this.step = 1;
      return "omen";
    }
    if (this.step < 2 && this.quiet >= guide) {
      this.step = 2;
      return "guide";
    }
    if (this.step < 3 && this.quiet >= enc) {
      this.step = 3;
      this.retry = this.quiet + PACING_RETRY;
      return "encounter";
    }
    // それでも何も起きなければ、しばらくして方向だけもう一度示す
    if (this.step >= 3 && this.quiet >= this.retry) {
      this.retry = this.quiet + PACING_RETRY;
      return "retry";
    }
    return null;
  }
}
