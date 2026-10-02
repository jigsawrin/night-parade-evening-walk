import { AudioEngine, mtof } from "./AudioEngine";
import { Instruments } from "./Instruments";
import { MUSIC_SWELLS, swellsFor, type StageDef, type SwellId } from "../../data/stages";

type LayerId = "A" | "B" | "C" | "D" | "E" | "F";

/** 都節音階（D Eb G A Bb）。少しだけ人ならざる響き */
const SCALE = [0, 1, 5, 7, 8];
const deg = (d: number) => {
  const o = Math.floor(d / 5);
  const i = ((d % 5) + 5) % 5;
  return 62 + o * 12 + SCALE[i];
};

// 篠笛の旋律 [音度, 16分音符の長さ]（8小節 = 128 ステップ）
const MELODY: [number, number][] = [
  [8, 6], [7, 2], [8, 4], [9, 4],
  [10, 8], [9, 4], [8, 4],
  [7, 6], [6, 2], [5, 4], [6, 4],
  [7, 12], [-1, 4],
  [8, 4], [9, 2], [8, 2], [7, 4], [6, 4],
  [5, 6], [6, 2], [7, 8],
  [3, 4], [4, 4], [5, 6], [6, 2],
  [5, 14], [-1, 2],
];
const MELODY_B: [number, number][] = [
  [10, 4], [11, 4], [10, 2], [9, 2], [8, 4],
  [9, 8], [7, 8],
  [8, 4], [7, 2], [6, 2], [5, 8],
  [6, 6], [7, 2], [8, 8],
  [10, 6], [9, 2], [8, 4], [7, 4],
  [8, 12], [-1, 4],
  [6, 4], [7, 4], [8, 4], [6, 4],
  [5, 14], [-1, 2],
];
const ROOTS = [0, 0, 3, 2, 0, 2, 3, 0];

/** 中盤からの段の残響（遠く・低く・残響多め） */
const SWELL_WET: Record<SwellId, number> = { tsuzumi: 0.3, kane: 0.25, sho: 0.6, biwa: 0.35, ryuteki: 0.5, horagai: 0.7 };

/**
 * 音楽も百鬼夜行と共に成長する（仕様 18章）。
 * 別曲に切り替えず、同じ曲に楽器レイヤーを重ねていく。
 * 夜行位（A〜F）に加えて、中盤から百妖までは行列の数で段（data/stages.ts の MUSIC_SWELLS：小鼓・摺鉦・笙・琵琶・龍笛・法螺貝）を重ねる。
 * 30 妖までの音（はじめの無音・最初に鳴りだす笛）は変えない。
 */
export class MusicDirector {
  private inst: Instruments;
  private layers: Record<LayerId, GainNode>;
  private targets: Record<LayerId, number> = { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 };
  /** 夜行位の目標に、地区の祭り（覚醒した地区にいる間）の笛・太鼓を重ねた実効値 */
  private eff: Record<LayerId, number> = { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 };
  private boost = 0;
  /** 静けさ（0..1）。何も起きていない時間は楽器を控えめにし、虫・風鈴が聞こえるようにする */
  private lull = 0;
  private tempo = 84;
  /** 夜行位のテンポと、行列の数で足すテンポ */
  private baseTempo = 84;
  private swellTempo = 0;
  private swells: Record<SwellId, GainNode>;
  private swellTargets = swellsFor(0).levels;
  private swellEff = swellsFor(0).levels;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private melodyEvents: Map<number, [number, number]>[] = [];
  private loopCount = 0;
  private wind: AudioBufferSourceNode | null = null;
  private nextChirp = 0;
  private nextFurin = 0;
  /** 夜明けでの減衰 */
  dawn = 0;

  constructor(private e: AudioEngine) {
    this.inst = new Instruments(e);
    const mk = (wet: number) => e.bus(e.music, wet);
    this.layers = { A: e.bus(e.ambience, 0.2), B: mk(0.45), C: mk(0.2), D: mk(0.4), E: mk(0.15), F: mk(0.3) };
    (Object.keys(this.layers) as LayerId[]).forEach((k) => (this.layers[k].gain.value = k === "A" ? 1 : 0));
    this.swells = Object.fromEntries(MUSIC_SWELLS.map((s) => {
      const g = mk(SWELL_WET[s.id]);
      g.gain.value = 0;
      return [s.id, g];
    })) as Record<SwellId, GainNode>;
    for (const mel of [MELODY, MELODY_B]) {
      const m = new Map<number, [number, number]>();
      let s = 0;
      for (const [d, len] of mel) {
        if (d >= 0) m.set(s, [d, len]);
        s += len;
      }
      this.melodyEvents.push(m);
    }
  }

  start() {
    this.nextTime = this.e.now + 0.1;
    this.startWind();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  applyStage(s: StageDef, fade = 3) {
    this.targets = { ...s.music };
    this.baseTempo = s.tempo;
    this.tempo = this.baseTempo + this.swellTempo;
    this.apply(fade);
  }

  /** 行列の数（加わる・戻る・夜行位が変わるたび）。中盤から百妖までの段を重ねる */
  setCount(count: number) {
    const w = swellsFor(count);
    if (MUSIC_SWELLS.every((s) => w.levels[s.id] === this.swellTargets[s.id])) return;
    this.swellTargets = w.levels;
    this.swellTempo = w.tempo;
    this.tempo = this.baseTempo + this.swellTempo;
    this.apply(4);
  }

  /**
   * 覚醒した地区の中では、夜行位に関係なく笛・太鼓・鈴が加わる（0..1）。
   * 同じ曲のまま、その場所だけ祭囃子が厚くなる。
   */
  setFestivalBoost(b: number) {
    if (Math.abs(b - this.boost) < 0.05) return;
    this.boost = b;
    this.apply(2.5);
  }

  /**
   * 夜の波に合わせた「間」（0..1）。静かな時間は、同じ曲のまま楽器を少し引いて、虫・風・風鈴を前に出す。
   * 覚醒した地区の祭囃子（boost）は引かない。
   */
  setLull(v: number) {
    if (Math.abs(v - this.lull) < 0.05) return;
    this.lull = v;
    this.apply(4);
  }

  private apply(fade: number) {
    const b = this.boost;
    const T = this.targets;
    const k = 1 - 0.35 * this.lull;
    this.eff = { A: T.A, B: Math.max(T.B * k, b), C: T.C * k, D: T.D * k, E: Math.max(T.E * k, b * 0.85), F: Math.max(T.F * k, b * 0.7) };
    const now = this.e.now;
    (Object.keys(this.layers) as LayerId[]).forEach((k) => {
      this.layers[k].gain.cancelScheduledValues(now);
      this.layers[k].gain.setTargetAtTime(this.eff[k], now, fade / 3);
    });
    for (const s of MUSIC_SWELLS) {
      const v = this.swellTargets[s.id] * k;
      this.swellEff[s.id] = v;
      this.swells[s.id].gain.cancelScheduledValues(now);
      this.swells[s.id].gain.setTargetAtTime(v, now, fade / 3);
    }
  }

  /** 夜が明けた後：楽器を静め、虫・風・風鈴だけの余韻へ（fade 秒） */
  rest(fade = 3) {
    this.targets = { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 };
    this.swellTargets = swellsFor(0).levels;
    this.boost = 0;
    this.apply(fade);
  }

  /** 撮影の「祭」：静かに祭囃子を戻す */
  festive(on: boolean) {
    this.targets = on ? { A: 0.8, B: 0.5, C: 0.3, D: 0.2, E: 0.35, F: 0.3 } : { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 };
    this.swellTargets = swellsFor(0).levels;
    this.apply(3);
  }

  /** エンディング：全楽器で盛り上げる */
  finale() {
    const now = this.e.now;
    (Object.keys(this.layers) as LayerId[]).forEach((k) => {
      this.targets[k] = this.eff[k] = k === "A" ? 0.3 : 1;
      this.layers[k].gain.setTargetAtTime(this.targets[k], now, 1);
    });
    for (const s of MUSIC_SWELLS) {
      this.swellTargets[s.id] = this.swellEff[s.id] = s.level;
      this.swells[s.id].gain.setTargetAtTime(s.level, now, 1);
    }
  }

  private startWind() {
    const ctx = this.e.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.e.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = ctx.createGain();
    lg.gain.value = 0.035;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.layers.A);
    src.start();
    lfo.start();
    this.wind = src;
  }

  private schedule() {
    const e = this.e;
    const ahead = e.now + 0.15;
    // 環境音（テンポと無関係）
    while (this.nextChirp < ahead) {
      const t = Math.max(this.nextChirp, e.now);
      // 虫の声：高い音のトレモロ
      const f = 4300 + Math.random() * 600;
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) e.osc("sine", f, t + i * 0.035, 0.025, this.layers.A, 0.012 * (1 - this.dawn), 0.004);
      // 静かな時間ほど虫の声が密に
      this.nextChirp = t + (0.15 + Math.random() * 0.5) * (1 - 0.35 * this.lull);
    }
    while (this.nextFurin < ahead) {
      const t = Math.max(this.nextFurin, e.now);
      if (this.nextFurin > 0) {
        // 風鈴
        const base = 2400 + Math.random() * 500;
        e.osc("sine", base, t, 1.8, this.layers.A, 0.025, 0.002);
        e.osc("sine", base * 2.76, t, 0.9, this.layers.A, 0.01, 0.002);
      }
      this.nextFurin = t + (5 + Math.random() * 9) * (1 - 0.3 * this.lull);
    }

    const stepDur = 60 / this.tempo / 4;
    while (this.nextTime < ahead) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 128;
      if (this.step === 0) this.loopCount++;
    }
  }

  private playStep(step: number, t: number, sd: number) {
    const L = this.layers;
    const T = this.eff;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = ROOTS[bar];
    const i = this.inst;
    // B 篠笛
    if (T.B > 0.01) {
      const mel = this.melodyEvents[this.loopCount % 2];
      const ev = mel.get(step);
      if (ev) i.fue(t, mtof(deg(ev[0])), ev[1] * sd * 0.95, L.B, 0.9 + Math.random() * 0.15);
    }
    // C 三味線
    if (T.C > 0.01) {
      const pat: Record<number, number> = { 0: 0, 3: 5, 6: 2, 8: 0, 10: 3, 12: 5, 14: 4 };
      if (s in pat) i.shamisen(t, mtof(deg(root + pat[s] - 5)), L.C, s === 0 ? 1 : 0.75);
    }
    // D 琴
    if (T.D > 0.01) {
      const arp: Record<number, number> = { 2: 5, 6: 7, 10: 9, 14: 7 };
      if (s in arp) i.koto(t, mtof(deg(root + arp[s])) * (1 + (Math.random() - 0.5) * 0.004), L.D, 0.8);
      if (bar % 4 === 3 && s === 8) {
        for (let k = 0; k < 5; k++) i.koto(t + k * sd * 0.5, mtof(deg(root + 5 + k)), L.D, 0.6);
      }
    }
    // E 太鼓
    if (T.E > 0.01) {
      if ([0, 4, 8, 10, 12, 14].includes(s)) i.shime(t, L.E, s % 8 === 0 ? 1 : 0.6);
      if (bar === 7) {
        if ([0, 3, 6, 8, 11, 12, 14].includes(s)) i.odaiko(t, L.E, 1);
      } else if (s === 0 || s === 10) i.odaiko(t, L.E, s === 0 ? 1 : 0.7);
    }
    // F 鈴・拍子木・掛け声
    if (T.F > 0.01) {
      if (s % 4 === 2) i.suzu(t, L.F, 0.8);
      if ((bar === 0 || bar === 4) && s === 0) i.hyoshigi(t, L.F);
      if ((bar === 3 || bar === 7) && s === 12) i.kakegoe(t, L.F, bar === 3 ? "a" : "o");
    }
    this.playSwells(step, t, sd, bar, s, root);
  }

  /** 中盤から百妖までの段（鳴っている段だけ。どれも控えめに） */
  private playSwells(step: number, t: number, sd: number, bar: number, s: number, root: number) {
    const W = this.swells;
    const V = this.swellEff;
    const i = this.inst;
    // 小鼓（40）：裏で「ポン」。締太鼓の合間に
    if (V.tsuzumi > 0.01 && (s === 6 || (s === 14 && bar % 2 === 1))) i.tsuzumi(t, W.tsuzumi, s === 6 ? 0.55 : 0.4);
    // 摺鉦（60）：祭囃子のチャンチキ
    if (V.kane > 0.01 && [0, 2, 3, 8, 10, 11].includes(s)) i.kane(t, W.kane, s % 8 === 0 ? 0.9 : 0.55);
    // 笙（70）：二小節ごとに合竹（和音）を長く
    if (V.sho > 0.01 && bar % 2 === 0 && s === 0) i.sho(t, [5, 7, 9, 10].map((d) => mtof(deg(root + d))), sd * 30, W.sho, 0.9);
    // 琵琶（80）：小節の頭に低い撥、四小節目は撥で掻き鳴らす
    if (V.biwa > 0.01) {
      if (s === 0) i.biwa(t, mtof(deg(root - 5)), W.biwa, 0.9);
      if (bar % 4 === 3 && s === 8) for (let k = 0; k < 4; k++) i.biwa(t + k * 0.045, mtof(deg(root - 5 + k)), W.biwa, 0.5);
    }
    // 龍笛（90）：篠笛の旋律を一つ下の音で、ゆったり支える
    if (V.ryuteki > 0.01) {
      const ev = this.melodyEvents[this.loopCount % 2].get(step);
      if (ev && ev[1] >= 4) i.ryuteki(t, mtof(deg(ev[0] - 2)), ev[1] * sd * 0.95, W.ryuteki, 0.8);
    }
    // 法螺貝（100）：八小節の頭で一度だけ、低く長く
    if (V.horagai > 0.01 && step === 0) i.horagai(t, W.horagai, 0.9, sd * 14);
  }

  dispose() {
    this.stop();
    this.wind?.stop();
  }
}
