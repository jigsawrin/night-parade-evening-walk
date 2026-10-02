import { mtof, type AudioEngine } from "../../presentation/audio/AudioEngine";
import { Instruments } from "../../presentation/audio/Instruments";

/** 陽音階（D E G A B）。明るく、どこか懐かしい */
const YO = [0, 2, 5, 7, 9];
const deg = (d: number) => 62 + Math.floor(d / 5) * 12 + YO[((d % 5) + 5) % 5];

/**
 * 旋律 [音度, 8分音符の長さ]（16 小節 = 128 ステップ）。音度 −1 は休み。
 * A（問い）→ A'（答え）→ B（ひらける）→ B'（家に帰る）。短い動機を繰り返して耳に残す
 */
const MELODY: [number, number][] = [
  // A
  [7, 2], [8, 1], [9, 1], [8, 2], [7, 2], [5, 4], [-1, 4],
  [4, 2], [5, 1], [7, 1], [5, 2], [4, 2], [2, 6], [-1, 2],
  // A'
  [7, 2], [8, 1], [9, 1], [10, 2], [9, 2], [8, 4], [-1, 2], [7, 2],
  [8, 2], [7, 1], [5, 1], [4, 2], [5, 2], [5, 6], [-1, 2],
  // B
  [9, 3], [10, 1], [9, 2], [8, 2], [7, 4], [5, 4],
  [8, 3], [9, 1], [8, 2], [7, 2], [5, 6], [-1, 2],
  // B'
  [4, 2], [5, 2], [7, 2], [8, 2], [9, 4], [8, 2], [7, 2],
  [5, 2], [4, 2], [2, 2], [4, 2], [5, 8],
];
/** 小節ごとの低音（音度。0 = D） */
const ROOTS = [0, 2, 0, 3, 0, 2, 3, 0, 2, 0, 1, 3, 2, 0, 3, 0];

/**
 * 宵霞楼の音楽：ゆるやかな時が流れる、安心する子守歌のような一曲（ゆっくりの 8 分・陽音階）。
 * 琴の旋律、琴の分散和音、柔らかい和音の持続音、ときどき鈴のような鐘。二巡目からは篠笛がそっと旋律をなぞる。
 * 町の音楽（MusicDirector）とは別の曲。音量は控えめで、残響を多めに（湯屋の広がり）。
 */
export class OnsenMusic {
  private inst: Instruments;
  private out: GainNode;
  private pad: GainNode;
  private tempo = 66;
  private step = 0;
  private loop = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private events = new Map<number, [number, number]>();

  constructor(private e: AudioEngine) {
    this.inst = new Instruments(e);
    this.out = e.bus(e.music, 0.5);
    this.out.gain.value = 0.9;
    this.pad = e.bus(e.music, 0.6);
    this.pad.gain.value = 0.5;
    let s = 0;
    for (const [d, len] of MELODY) {
      if (d >= 0) this.events.set(s, [d, len]);
      s += len;
    }
  }

  start() {
    this.nextTime = this.e.now + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const sd = 60 / this.tempo / 2;
    while (this.nextTime < this.e.now + 0.25) {
      this.play(this.step, this.nextTime, sd);
      this.step = (this.step + 1) % 128;
      if (this.step === 0) this.loop++;
      this.nextTime += sd;
    }
  }

  private play(step: number, t: number, sd: number) {
    const bar = Math.floor(step / 8), inBar = step % 8;
    const root = ROOTS[bar];
    // 和音の持続音（小節の頭に、根音・五度・九度をゆっくり）
    if (inBar === 0) {
      for (const [d, v] of [[root, 0.05], [root + 3, 0.035], [root + 6, 0.025]] as const) {
        const f = mtof(deg(d) - 12);
        this.e.osc("sine", f, t, sd * 8, this.pad, v, sd * 3, sd * 9);
        this.e.osc("sine", f * 1.004, t, sd * 8, this.pad, v * 0.6, sd * 3, sd * 9);
      }
      this.e.osc("sine", mtof(deg(root) - 24), t, sd * 8, this.pad, 0.07, 0.4, sd * 8);
    }
    // 琴の分散和音（低い音で、裏拍に）
    const arp = [root, root + 3, root + 5, root + 6];
    if (inBar % 2 === 1) this.inst.koto(t, mtof(deg(arp[(inBar - 1) / 2]) - 12), this.out, 0.28);
    // 旋律（琴）。二巡目からは篠笛がそっとなぞる
    const ev = this.events.get(step);
    if (ev) {
      const [d, len] = ev;
      const f = mtof(deg(d));
      this.inst.koto(t, f, this.out, 0.62);
      if (this.loop % 2 === 1 && bar >= 8) this.inst.fue(t, f, len * sd * 0.95, this.out, 0.35);
    }
    // 四小節ごとに、鈴のような鐘
    if (step % 32 === 0) {
      this.e.osc("sine", 1318, t, 3.5, this.pad, 0.03, 0.005);
      this.e.osc("sine", 1318 * 2.76, t, 1.5, this.pad, 0.008, 0.005);
    }
  }
}
