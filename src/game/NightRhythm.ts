/**
 * 夜の波（静と動）。明示的な進行制御ではなく、今どんな時間かを読むだけの軽い状態。
 *
 *  quiet      探索・風景を見る（虫・風・風鈴・足音。Encounter ではない、大切な時間）
 *  curiosity  何かが聞こえた（噂・気配・狐火・言霊）
 *  pursuit    向かっている／攻略している
 *  festival   成就・合流・地区覚醒の直後
 *  cooldown   余韻（新しいものを出さない「間」の最中）
 *
 * 演出（音楽の厚み・環境音）と計測が参照する。ずっと festival にはしない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export type RhythmPhase = "quiet" | "curiosity" | "pursuit" | "festival" | "cooldown";

export const RHYTHM_PHASES: readonly RhythmPhase[] = ["quiet", "curiosity", "pursuit", "festival", "cooldown"];

export interface RhythmInput {
  /** 新しい Encounter を出さない「間」の最中 */
  breathing: boolean;
  /** 場に出ている Encounter の数 */
  active: number;
  /** 噂の数 */
  rumors: number;
  /** 噂・Encounter の方へ向かって歩いている */
  heading: boolean;
}

export class NightRhythm {
  phase: RhythmPhase = "quiet";
  /** 各状態で過ごした秒数 */
  readonly time: Record<RhythmPhase, number> = { quiet: 0, curiosity: 0, pursuit: 0, festival: 0, cooldown: 0 };
  private t = 0;
  private festivalUntil = -1;
  private curiousUntil = -1;

  /** 大きな出来事（成就・合流・地区覚醒・世界の層） */
  festival(dur = 8) {
    this.festivalUntil = Math.max(this.festivalUntil, this.t + dur);
  }
  /** 何かが聞こえた・見えた（噂・Pacing の気配・誘導・言霊） */
  curious(dur = 12) {
    this.curiousUntil = Math.max(this.curiousUntil, this.t + dur);
  }

  /** dt 秒進める。状態が変わったら新しい状態を返す */
  update(dt: number, i: RhythmInput): RhythmPhase | null {
    this.t += dt;
    this.time[this.phase] += dt;
    let next: RhythmPhase;
    if (this.t < this.festivalUntil) next = "festival";
    else if (i.active > 0 || (i.rumors > 0 && i.heading)) next = "pursuit";
    else if (i.breathing) next = "cooldown";
    else if (i.rumors > 0 || this.t < this.curiousUntil) next = "curiosity";
    else next = "quiet";
    if (next === this.phase) return null;
    this.phase = next;
    return next;
  }
}
