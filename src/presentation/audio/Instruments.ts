import type { AudioEngine } from "./AudioEngine";

/** 和楽器風の合成音。後で録音素材に差し替える場合はこの関数群を置き換える。 */
export class Instruments {
  private e: AudioEngine;

  constructor(e: AudioEngine) {
    this.e = e;
  }

  /** 篠笛：ゆっくりした立ち上がり・遅れて掛かるビブラート・息の音 */
  fue(t: number, f: number, dur: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.setValueAtTime(f * 2, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.35));
    lfo.connect(lg);
    lg.connect(o.frequency);
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.08;
    const v = 0.16 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.06);
    g.gain.setValueAtTime(v * 0.85, t + Math.max(0.07, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    const end = t + dur + 0.2;
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(end); o2.stop(end); lfo.stop(end);
    this.e.noiseBurst(t, 0.12, dest, 0.03 * vel, "bandpass", f * 2.2, 2, 0.02);
  }

  /** 三味線：撥で弾いた鋭い立ち上がりと、さわりの唸り */
  shamisen(t: number, f: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = 3;
    flt.frequency.setValueAtTime(4200, t);
    flt.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(flt).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.55);
    this.e.noiseBurst(t, 0.03, dest, 0.08 * vel, "highpass", 3000, 1);
  }

  /** 琴：柔らかい撥弦と長い余韻 */
  koto(t: number, f: number, dest: AudioNode, vel = 1) {
    this.e.osc("triangle", f, t, 1.4, dest, 0.12 * vel, 0.004);
    this.e.osc("sine", f * 2.005, t, 0.8, dest, 0.05 * vel, 0.004);
    this.e.osc("sine", f * 3.01, t, 0.3, dest, 0.02 * vel, 0.002);
  }

  /** 締太鼓 */
  shime(t: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.15);
    this.e.noiseBurst(t, 0.06, dest, 0.18 * vel, "bandpass", 1600, 1.5);
  }

  /** 大太鼓 */
  odaiko(t: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.85);
    this.e.noiseBurst(t, 0.12, dest, 0.2 * vel, "lowpass", 300, 1);
  }

  /** 鈴 */
  suzu(t: number, dest: AudioNode, vel = 1) {
    for (const f of [4200, 5350, 6700]) this.e.osc("sine", f * (0.99 + Math.random() * 0.02), t + Math.random() * 0.01, 0.25, dest, 0.03 * vel, 0.001);
    this.e.noiseBurst(t, 0.06, dest, 0.04 * vel, "highpass", 7000, 1);
  }

  /** 拍子木 */
  hyoshigi(t: number, dest: AudioNode, vel = 1) {
    this.e.osc("sine", 2300, t, 0.06, dest, 0.25 * vel, 0.001);
    this.e.osc("sine", 3400, t, 0.04, dest, 0.12 * vel, 0.001);
    this.e.noiseBurst(t, 0.035, dest, 0.25 * vel, "bandpass", 2600, 3);
  }

  /** 小鼓（ポン） */
  tsuzumi(t: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.4);
    this.e.noiseBurst(t, 0.05, dest, 0.12 * vel, "bandpass", 1200, 2);
  }

  /** 摺鉦（すりがね・チャンチキ）：小さな金物の鉦。倍音がずれた短い金属音 */
  kane(t: number, dest: AudioNode, vel = 1) {
    for (const [f, a, d] of [[1650, 0.05, 0.22], [2710, 0.035, 0.16], [4230, 0.02, 0.1]] as const) {
      this.e.osc("sine", f * (0.995 + Math.random() * 0.01), t, d, dest, a * vel, 0.001);
    }
    this.e.noiseBurst(t, 0.03, dest, 0.03 * vel, "bandpass", 5200, 2);
  }

  /** 笙（しょう）：雅楽の笙の和音（合竹）。ゆっくり息を入れて膨らみ、ゆっくり消える */
  sho(t: number, freqs: readonly number[], dur: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const g = ctx.createGain();
    const v = 0.045 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(1.2, dur * 0.4));
    g.gain.setValueAtTime(v, t + Math.max(0.2, dur - 0.9));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    g.connect(lp).connect(dest);
    for (const f of freqs) {
      for (const [type, mul, amp] of [["triangle", 1, 1], ["sine", 2, 0.35]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mul * (1 + (Math.random() - 0.5) * 0.003);
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  /** 琵琶：低く太い撥の音。撥で打つ音と、柱（じゅう）を押して少し下がる音程 */
  biwa(t: number, f: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 1.03, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.Q.value = 5;
    flt.frequency.setValueAtTime(2600, t);
    flt.frequency.exponentialRampToValueAtTime(420, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(flt).connect(g).connect(dest);
    o.start(t);
    o.stop(t + 1.35);
    this.e.noiseBurst(t, 0.04, dest, 0.1 * vel, "bandpass", 900, 1.5);
  }

  /** 龍笛（りゅうてき）：篠笛より太く、息の多い笛。少し下からしゃくり上げる */
  ryuteki(t: number, f: number, dur: number, dest: AudioNode, vel = 1) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain();
    const v = 0.1 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.09);
    g.gain.setValueAtTime(v * 0.8, t + Math.max(0.1, dur - 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.2);
    this.e.noiseBurst(t, Math.min(0.4, dur), dest, 0.025 * vel, "bandpass", f * 1.6, 1.2, 0.05);
  }

  /** 法螺貝：低く長い「ぶおお…」。ゆっくり膨らみ、口の形（フォルマント）で角のある音に */
  horagai(t: number, dest: AudioNode, vel = 1, dur = 2.4) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(98, t);
    o.frequency.linearRampToValueAtTime(110, t + 0.5);
    o.frequency.setValueAtTime(110, t + dur - 0.4);
    o.frequency.linearRampToValueAtTime(104, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.45);
    g.gain.setValueAtTime(0.2 * vel, t + dur - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const [ff, q] of [[420, 4], [900, 6]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = ff;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** 掛け声（ハッ／ヨイ）…人の声のような、そうでもないような */
  kakegoe(t: number, dest: AudioNode, vowel: "a" | "o" = "a", vel = 1) {
    const ctx = this.e.ctx;
    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(vowel === "a" ? 260 : 220, t);
    src.frequency.exponentialRampToValueAtTime(vowel === "a" ? 200 : 180, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const formants = vowel === "a" ? [800, 1200, 2500] : [500, 900, 2400];
    for (const ff of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = ff;
      bp.Q.value = 8;
      src.connect(bp).connect(g);
    }
    g.connect(dest);
    src.start(t);
    src.stop(t + 0.25);
    this.e.noiseBurst(t, 0.08, dest, 0.06 * vel, "bandpass", 1500, 1);
  }
}
