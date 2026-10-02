/**
 * 賑わい（Festival Momentum）。百鬼夜行の「今の勢い」を表す内部値（0〜100）。
 *
 * - 時間経過では増えない。新しい場所を歩く・地区に入る・アクティビティ成就・ランドマーク通過・
 *   長い行列での行進・加入などの「能動的な行動」で増える。
 * - 同じ場所をぐるぐる回る／放置／壁に向かって歩き続ける、ではほとんど増えない（訪れたマスは暫く再加算しない）。
 * - しばらく何も起きないと、ゆっくり減衰する。
 *
 * ※ node --test から直接読み込むため、実行時の相対 import を持たない純粋ロジック。
 */

export const MOMENTUM_GAIN = {
  /** 初めて歩くマス（行列が大きいほど大きく響く） */
  newCell: 0.5,
  /** 久しぶり（STALE_SEC 以上前）に歩くマス */
  staleCell: 0.18,
  newDistrict: 6,
  revisitDistrict: 2,
  activity: 12,
  landmark: 4,
  layer: 5,
  join: 1.2,
  bonusJoin: 0.3,
  encounter: 9,
  merge: 10,
  awaken: 12,
  /** 陰陽師を退散させた */
  rout: 12,
} as const;

export type MomentumReason = keyof typeof MOMENTUM_GAIN | "march";

export const MOMENTUM_LEVELS = [
  { min: 0, name: "静か" },
  { min: 15, name: "ざわめき" },
  { min: 35, name: "賑わい" },
  { min: 60, name: "大賑わい" },
  { min: 85, name: "熱狂" },
] as const;

const CELL = 10;
const STALE_SEC = 100;
const MARCH_WINDOW = 5;
const DECAY_DELAY = 14;
const DECAY_RATE = 0.45;

export class FestivalMomentum {
  value = 0;
  /** 行列の大きさで決まる上限。小さな行列では「熱狂」にはならない */
  cap = 100;
  /** 歩いたマス → 最後に訪れた時刻 */
  private cells = new Map<number, number>();
  private cellKey = NaN;
  private lastGainT = 0;
  private marchX = NaN;
  private marchZ = 0;
  private marchT = 0;
  /** 最近「新しい／久しぶりの場所」を踏んだ時刻（探索中かどうかの判定用） */
  private exploreTimes: number[] = [];
  /** 直近の加算理由（デバッグ表示用） */
  lastReason = "";

  get level() {
    let l = 0;
    for (let i = 0; i < MOMENTUM_LEVELS.length; i++) if (this.value >= MOMENTUM_LEVELS[i].min) l = i;
    return l;
  }
  get levelName() {
    return MOMENTUM_LEVELS[this.level].name;
  }
  get cellsVisited() {
    return this.cells.size;
  }

  /** 行列の大きさ（主人公を含む妖数）から上限を決める：一妖 ≒ 31、五十妖以上で 100 */
  setParadeSize(total: number) {
    this.cap = 30 + 70 * Math.min(1, total / 50);
  }

  /** 行動による加算。高いほど伸びにくく、上限（cap）を超えない */
  add(amount: number, t: number, reason = "") {
    if (amount <= 0) return 0;
    const soft = 1 - (this.value / 130) * 0.6;
    const g = Math.max(0, Math.min(amount * soft, this.cap - this.value));
    this.value += g;
    this.lastGainT = t;
    if (reason) this.lastReason = reason;
    return g;
  }

  gain(reason: Exclude<MomentumReason, "march">, t: number, scale = 1) {
    return this.add(MOMENTUM_GAIN[reason] * scale, t, reason);
  }

  /**
   * 位置の観測（低頻度で呼ぶ：4Hz 程度）。探索と行進を評価する。
   * @param followers 行列の妖怪数（主人公を除く）
   */
  observe(t: number, x: number, z: number, followers: number) {
    const key = Math.floor(x / CELL) * 1000 + Math.floor(z / CELL);
    if (key !== this.cellKey) {
      this.cellKey = key;
      const last = this.cells.get(key);
      // 大きな行列ほど、新しい場所での反響が大きい（独り歩きではささやか）
      const scale = 0.4 + Math.min(1.6, followers / 20);
      if (last === undefined) {
        this.add(MOMENTUM_GAIN.newCell * scale, t, "explore");
        this.exploreTimes.push(t);
      } else if (t - last > STALE_SEC) {
        this.add(MOMENTUM_GAIN.staleCell * scale, t, "explore");
        this.exploreTimes.push(t);
      }
      this.cells.set(key, t);
      if (this.exploreTimes.length > 32) this.exploreTimes.shift();
    } else {
      this.cells.set(key, t);
    }

    // 長い行列を維持したまま、一定距離を進んだ（その場で回るだけでは変位が出ない）
    if (Number.isNaN(this.marchX)) {
      this.marchX = x;
      this.marchZ = z;
      this.marchT = t;
    } else if (t - this.marchT >= MARCH_WINDOW) {
      const disp = Math.hypot(x - this.marchX, z - this.marchZ);
      if (followers >= 12 && disp > 14) this.add(Math.min(2.5, 0.6 + followers * 0.02), t, "march");
      this.marchX = x;
      this.marchZ = z;
      this.marchT = t;
    }
  }

  /** 何も起きない時間が続くと、ゆっくり落ち着いていく */
  decay(dt: number, t: number) {
    if (t - this.lastGainT > DECAY_DELAY) this.value = Math.max(0, this.value - DECAY_RATE * dt);
    // 散らされて行列が小さくなったら、上限まで静かに下がる
    if (this.value > this.cap) this.value = Math.max(this.cap, this.value - 2 * dt);
  }

  /** 直近 window 秒のうちに、新しい（久しぶりの）場所を踏んだ回数 */
  recentExploration(t: number, window = 20) {
    let n = 0;
    for (const e of this.exploreTimes) if (t - e <= window) n++;
    return n;
  }
}
