/**
 * ある地点の周りを一周したかを追う（祠の周りを行列で一周する等）。
 * ※ node --test から直接読み込むため、実行時の相対 import を持たない純粋ロジック。
 */
export class CircleTracker {
  angle = 0;
  inside = false;
  private lastA = 0;
  readonly x: number;
  readonly z: number;
  readonly rMin: number;
  readonly rMax: number;

  constructor(x: number, z: number, rMin: number, rMax: number) {
    this.x = x;
    this.z = z;
    this.rMin = rMin;
    this.rMax = rMax;
  }

  /** 位置を与えて、進み具合（0..1）を返す。輪の外なら -1（進み具合は消える） */
  update(px: number, pz: number): number {
    const r = Math.hypot(px - this.x, pz - this.z);
    const a = Math.atan2(pz - this.z, px - this.x);
    if (r > this.rMin && r < this.rMax) {
      if (!this.inside) {
        this.inside = true;
        this.angle = 0;
      } else {
        let d = a - this.lastA;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.angle += d;
      }
      this.lastA = a;
      return Math.min(1, Math.abs(this.angle) / (Math.PI * 2));
    }
    this.inside = false;
    this.angle = 0;
    this.lastA = a;
    return -1;
  }

  reset() {
    this.angle = 0;
  }
}
