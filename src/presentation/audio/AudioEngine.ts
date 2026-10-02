/**
 * WebAudio の土台。素材（音源ファイル）は後から差し替えられるよう、
 * すべての音は「楽器関数」を通して鳴らす（v0.1 はすべて合成音）。
 */
export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  reverbSend: GainNode;
  noise: AudioBuffer;
  private comp: DynamicsCompressorNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    const ctx = this.ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.ambience = ctx.createGain();
    this.music.gain.value = 0.55;
    this.sfx.gain.value = 0.8;
    this.ambience.gain.value = 0.6;
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.ambience.connect(this.master);

    // 残響（夜の町の広がり）
    const rev = ctx.createConvolver();
    rev.buffer = this.makeImpulse(2.8, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(rev).connect(this.master);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private makeImpulse(sec: number, decay: number) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  get now() {
    return this.ctx.currentTime;
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  /** 音量（0..1。タイトルの設定） */
  volume = 0.8;

  setMuted(m: boolean) {
    this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.now, 0.1);
  }

  /** 出力先ノード（ドライ＋残響送り） */
  bus(dest: AudioNode, wet = 0.3) {
    const g = this.ctx.createGain();
    g.connect(dest);
    if (wet > 0) {
      const s = this.ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.reverbSend);
    }
    return g;
  }

  // ---------------------------------------------------------------- 基本部品
  osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, gain: number, attack = 0.005, release?: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + (release ?? dur) + 0.05);
    return { o, g };
  }

  noiseBurst(t: number, dur: number, dest: AudioNode, gain: number, filter: BiquadFilterType, freq: number, q = 1, attack = 0.002) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return { src, f, g };
  }
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
