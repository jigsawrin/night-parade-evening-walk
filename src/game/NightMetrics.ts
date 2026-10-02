/**
 * 人間プレイ用の計測（?debug で一夜の終わりに console へ出す）。
 * 「暇だった」「忙しすぎた」を、数値と一緒に調整するため。bot 最適化だけで決めない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */

/** これより短い間は「静寂」と数えない（秒） */
export const SILENCE_MIN = 3;

export interface MetricsTickInput {
  total: number;
  /** 向かう先の候補（Encounter・噂・近くの未攻略のもの）がある */
  hasCandidate: boolean;
}

export class NightMetrics {
  encounterStarts = 0;
  encounterCompletes = 0;
  miniParades = 0;
  miniMerges = 0;
  awakenings = 0;
  omens = 0;
  guides = 0;
  kotodama = 0;
  rumors = 0;
  choiceMoments = 0;
  /** 30 妖以降の、何の候補もない時間（秒） */
  noCandidate30 = 0;
  /** 30 妖以降の時間（秒） */
  time30 = 0;
  private t = 0;
  private startTimes: number[] = [];
  private lastStim = 0;
  private silences: number[] = [];

  /** 何かが起きた・届いた（加入・噂・気配・誘導・言霊・Encounter の進行・覚醒…） */
  stim() {
    const gap = this.t - this.lastStim;
    if (gap >= SILENCE_MIN) this.silences.push(gap);
    this.lastStim = this.t;
  }

  encounterStart(kind: string) {
    this.encounterStarts++;
    if (kind === "miniParade") this.miniParades++;
    this.startTimes.push(this.t);
    this.stim();
  }

  tick(dt: number, i: MetricsTickInput) {
    this.t += dt;
    if (i.total >= 30) {
      this.time30 += dt;
      if (!i.hasCandidate) this.noCandidate30 += dt;
    }
  }

  report(finalTotal: number) {
    const open = this.t - this.lastStim;
    const sil = open >= SILENCE_MIN ? [...this.silences, open] : this.silences;
    const gaps = this.startTimes.slice(1).map((s, i) => s - this.startTimes[i]);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      プレイ秒: r1(this.t),
      Encounter開始: this.encounterStarts,
      Encounter成就: this.encounterCompletes,
      MiniParade: this.miniParades,
      MiniParade合流: this.miniMerges,
      地区覚醒: this.awakenings,
      噂: this.rumors,
      分かれ道: this.choiceMoments,
      Omen: this.omens,
      Guide: this.guides,
      Kotodama: this.kotodama,
      "30妖以降_候補なし秒": r1(this.noCandidate30),
      "30妖以降_秒": r1(this.time30),
      Encounter平均間隔秒: r1(avg(gaps)),
      最長静寂秒: r1(Math.max(0, ...sil)),
      平均静寂秒: r1(avg(sil)),
      静寂の回数: sil.length,
      最終妖怪数: finalTotal,
    };
  }
}
