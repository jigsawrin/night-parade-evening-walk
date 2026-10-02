/** 一夜の時計。戌の刻から卯の刻（夜明け）まで。 */
export const KOKU = ["戌の刻", "亥の刻", "子の刻", "丑の刻", "寅の刻", "卯の刻"];

export class NightClock {
  elapsed = 0;
  constructor(public duration: number) {}
  update(dt: number) {
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
  }
  get progress() {
    return this.elapsed / this.duration;
  }
  get koku() {
    return KOKU[Math.min(KOKU.length - 1, Math.floor(this.progress * KOKU.length))];
  }
  get isDawn() {
    return this.elapsed >= this.duration;
  }
}
