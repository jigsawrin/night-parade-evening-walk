import { AudioEngine, mtof } from "./AudioEngine";
import { Instruments } from "./Instruments";
import type { MurmurKind, SeKey } from "../../data/yokaiTypes";
import type { OmenKind } from "../../data/encounters";

/**
 * 効果音（UI・加入・妖怪固有音）と Audio Crowd System（仕様 19-20章）。
 * 近くの妖怪は個別の声、遠くは行列全体の足音・ざわめきとしてまとめる。
 */
export class AudioDirector {
  private inst: Instruments;
  private out: GainNode;
  private crowdOut: GainNode;
  /** 遠くの気配（残響多め） */
  private farOut: GainNode;
  private budget = 0;
  private patterNext = 0;
  crowdLevel = 0;
  crowdMoving = 0;
  crowdCount = 0;

  constructor(private e: AudioEngine) {
    this.inst = new Instruments(e);
    this.out = e.bus(e.sfx, 0.25);
    this.crowdOut = e.bus(e.ambience, 0.1);
    this.farOut = e.bus(e.sfx, 0.9);
    this.farOut.gain.value = 0.45;
    this.crowdOut.gain.value = 0;
  }

  // ---------------------------------------------------------------- UI / 共通
  ui() { this.inst.hyoshigi(this.e.now, this.out, 0.6); }
  cancel() { this.inst.tsuzumi(this.e.now, this.out, 0.6); }
  join(bonus = false) {
    const t = this.e.now;
    this.inst.suzu(t, this.out, 1.2);
    this.inst.suzu(t + 0.09, this.out, 0.8);
    if (bonus) this.inst.suzu(t + 0.18, this.out, 0.7);
  }
  discover() {
    const t = this.e.now;
    this.inst.fue(t, 1175, 0.12, this.out, 0.9);
    this.inst.fue(t + 0.12, 1397, 0.12, this.out, 0.9);
    this.inst.fue(t + 0.24, 1760, 0.45, this.out, 1);
  }
  stageUp() {
    const t = this.e.now;
    this.inst.odaiko(t, this.out, 1);
    this.inst.odaiko(t + 0.28, this.out, 0.8);
    this.inst.shime(t + 0.42, this.out, 1);
    this.inst.shime(t + 0.5, this.out, 1);
    this.inst.odaiko(t + 0.6, this.out, 1.1);
  }
  kifuda() {
    const t = this.e.now;
    this.e.osc("sine", 720, t, 0.08, this.out, 0.25, 0.001);
    this.e.noiseBurst(t, 0.05, this.out, 0.15, "bandpass", 1100, 3);
  }
  washi() { this.e.noiseBurst(this.e.now, 0.28, this.out, 0.06, "bandpass", 3200, 0.6, 0.08); }
  hyoshigiPair() {
    const t = this.e.now;
    this.inst.hyoshigi(t, this.out, 0.9);
    this.inst.hyoshigi(t + 0.18, this.out, 1);
  }
  bark() {
    const t = this.e.now;
    for (const dt of [0, 0.22]) {
      const o = this.e.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(520, t + dt);
      o.frequency.exponentialRampToValueAtTime(300, t + dt + 0.12);
      const bp = this.e.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 3;
      const g = this.e.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.3, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.15);
      o.connect(bp).connect(g).connect(this.out);
      o.start(t + dt);
      o.stop(t + dt + 0.2);
    }
  }
  scatter() {
    const t = this.e.now;
    this.inst.tsuzumi(t, this.out, 0.8);
    this.e.noiseBurst(t, 0.4, this.out, 0.1, "bandpass", 2000, 0.5, 0.02);
  }
  splash() { this.e.noiseBurst(this.e.now, 0.5, this.out, 0.2, "lowpass", 1400, 0.7, 0.01); }
  puff() { this.e.noiseBurst(this.e.now, 0.35, this.out, 0.12, "bandpass", 700, 0.8, 0.05); }
  gate() {
    const t = this.e.now;
    this.e.osc("sawtooth", 70, t, 1.6, this.out, 0.1, 0.2);
    this.e.noiseBurst(t, 1.6, this.out, 0.1, "lowpass", 250, 1, 0.3);
    this.inst.odaiko(t + 1.4, this.out, 1);
  }
  dango() {
    const t = this.e.now;
    this.e.osc("sine", 880, t, 0.1, this.out, 0.15, 0.002);
    this.e.osc("sine", 1320, t + 0.08, 0.15, this.out, 0.12, 0.002);
  }
  /** 夜の締め：太鼓「ドン、ドン、ドドン」・笛の長い一音・拍子木（3 秒ほど） */
  closing() {
    const t = this.e.now + 0.1;
    [0, 0.6, 1.2, 1.45].forEach((d, k) => this.inst.odaiko(t + d, this.out, k === 3 ? 1.1 : 0.85));
    this.inst.fue(t + 0.3, mtof(74), 1.6, this.out, 0.8);
    this.inst.fue(t + 1.9, mtof(69), 1.2, this.out, 0.7);
    this.inst.hyoshigi(t + 2.6, this.out, 1);
    this.inst.hyoshigi(t + 2.85, this.out, 0.9);
  }
  /** 写真のシャッター（木札の軽い音） */
  shutter() {
    this.inst.hyoshigi(this.e.now, this.out, 0.5);
    this.inst.suzu(this.e.now + 0.05, this.out, 0.5);
  }
  finale() {
    const t = this.e.now;
    for (let i = 0; i < 6; i++) this.inst.odaiko(t + i * 0.22, this.out, 1);
    this.inst.hyoshigi(t + 1.5, this.out, 1);
    this.inst.kakegoe(t + 1.7, this.out, "o", 1.2);
  }

  // ---------------------------------------------------------------- v0.2：街からの気配
  /**
   * 遠くの気配（笛・鈴・笑い声・太鼓…）。pan：-1 左 〜 1 右、vol：距離で減衰済みの音量。
   * 遠いほど残響を多めにして「どこか向こうで鳴っている」感じにする。
   */
  omen(kind: OmenKind, pan: number, vol: number) {
    if (vol < 0.02) return;
    const ctx = this.e.ctx;
    const t = this.e.now + 0.02;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(p).connect(this.farOut);
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
    }, 4000);
    const i = this.inst;
    switch (kind) {
      case "fue": {
        const notes: [number, number][] = [[784, 0.28], [880, 0.2], [784, 0.2], [622, 0.55]];
        let dt = 0;
        for (const [f, d] of notes) {
          i.fue(t + dt, f, d, g, 0.7);
          dt += d;
        }
        break;
      }
      case "hayashi":
        i.fue(t, 784, 0.25, g, 0.6);
        i.fue(t + 0.25, 880, 0.35, g, 0.6);
        for (let k = 0; k < 4; k++) i.shime(t + k * 0.18, g, k % 2 ? 0.5 : 0.8);
        i.suzu(t + 0.72, g, 0.6);
        break;
      case "suzu":
        for (let k = 0; k < 3; k++) i.suzu(t + k * 0.14, g, 0.9 - k * 0.2);
        break;
      case "taiko":
        i.odaiko(t, g, 0.8);
        i.shime(t + 0.22, g, 0.6);
        i.odaiko(t + 0.44, g, 0.7);
        break;
      case "warai":
        for (let k = 0; k < 4; k++) {
          const f = 620 + Math.random() * 160 - k * 30;
          this.e.osc("triangle", f, t + k * 0.13, 0.08, g, 0.12, 0.01);
          this.e.noiseBurst(t + k * 0.13, 0.07, g, 0.05, "bandpass", 1500, 2);
        }
        break;
      case "foxfire":
        this.e.noiseBurst(t, 0.25, g, 0.18, "lowpass", 380, 1, 0.01);
        this.e.osc("sine", 120, t, 0.25, g, 0.12, 0.01);
        this.e.osc("sine", 1320, t + 0.03, 0.4, g, 0.03, 0.01);
        break;
      case "glint":
        this.e.osc("sine", 2600, t, 0.5, g, 0.05, 0.005);
        this.e.osc("sine", 2600 * 1.5, t + 0.06, 0.4, g, 0.03, 0.005);
        break;
      case "lantern": {
        const n = this.e.noiseBurst(t, 0.45, g, 0.08, "bandpass", 600, 2, 0.15);
        n.f.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
        break;
      }
      case "shadow":
        i.tsuzumi(t, g, 0.35);
        this.e.noiseBurst(t + 0.1, 0.3, g, 0.05, "bandpass", 2800, 0.6, 0.06);
        break;
    }
  }

  /** 潜んでいる妖怪の音。shaka：ざるで小豆を洗う「しゃっ、しゃっ」（高い擦れる音を二つ） */
  lurkSound(kind: MurmurKind, pan: number, vol: number) {
    if (vol < 0.02) return;
    const ctx = this.e.ctx;
    const t = this.e.now + 0.02;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(p).connect(this.farOut);
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
    }, 2500);
    if (kind === "shaka") {
      for (let k = 0; k < 2; k++) {
        const n = this.e.noiseBurst(t + k * 0.32, 0.16, g, 0.22, "bandpass", 3600, 1.4, 0.03);
        n.f.frequency.exponentialRampToValueAtTime(5200, t + k * 0.32 + 0.14);
      }
    }
  }

  /** 狐火がぽっと灯る */
  foxfire(pan: number, vol: number) {
    this.omen("foxfire", pan, vol);
  }

  /** 二つの行列が合流：祭囃子のファンファーレ */
  merge() {
    const t = this.e.now;
    const i = this.inst;
    [784, 880, 1047, 880, 1175].forEach((f, k) => i.fue(t + k * 0.16, f, 0.22, this.out, 0.9));
    for (let k = 0; k < 6; k++) i.shime(t + k * 0.12, this.out, 0.8);
    i.odaiko(t + 0.8, this.out, 1);
    for (let k = 0; k < 5; k++) i.suzu(t + 0.9 + k * 0.08, this.out, 0.8);
    i.kakegoe(t + 1.1, this.out, "a", 1);
  }

  /** 地区が目覚める：太鼓の連打と掛け声 */
  awaken() {
    const t = this.e.now;
    const i = this.inst;
    for (let k = 0; k < 8; k++) i.shime(t + k * 0.1, this.out, 0.5 + k * 0.06);
    i.odaiko(t + 0.85, this.out, 1.1);
    i.hyoshigi(t + 1.2, this.out, 1);
    i.kakegoe(t + 1.4, this.out, "o", 1);
    i.fue(t + 1.5, 880, 0.5, this.out, 0.8);
  }

  /** ランドマークを百鬼夜行で通過：短い掛け声 */
  cheer() {
    const t = this.e.now;
    this.inst.shime(t, this.out, 0.7);
    this.inst.kakegoe(t + 0.1, this.out, "a", 0.7);
  }

  /** 言霊：ガラスの鈴のような、ごく小さな音 */
  kotodama(pan: number) {
    const t = this.e.now + 0.02;
    const g = this.panned(pan, 1, 3000);
    [1760, 2349, 2637, 3136].forEach((f, k) => this.e.osc("sine", f, t + k * 0.07, 0.9, g, 0.035 - k * 0.005, 0.004));
  }

  /** 花火：打ち上げの「ひゅう」（ごく小さく） */
  fireworkLaunch(pan: number) {
    const t = this.e.now;
    const g = this.panned(pan, 0.5, 2500, true);
    const o = this.e.ctx.createOscillator();
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.9);
    const og = this.e.ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.02, t + 0.15);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 1.05);
  }

  /** 花火：遠くの「どーん」とぱちぱち。遠いので少し遅れて、控えめに */
  firework(pan: number, big: boolean) {
    const t = this.e.now + 0.28;
    const g = this.panned(pan, big ? 0.8 : 0.6, 4000, true);
    this.e.noiseBurst(t, 1.3, g, 0.3, "lowpass", 160, 0.7, 0.005);
    this.e.osc("sine", 52, t, 1.0, g, 0.22, 0.005);
    for (let k = 0; k < 7; k++) this.e.noiseBurst(t + 0.35 + Math.random() * 0.9, 0.04, g, 0.035, "highpass", 3500, 0.7);
  }

  /** 左右に定位した出力（遠いものは farOut で残響多め） */
  private panned(pan: number, vol: number, ms: number, far = false) {
    const ctx = this.e.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(p).connect(far ? this.farOut : this.out);
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
    }, ms);
    return g;
  }

  // ---------------------------------------------------------------- 遠くの祭りの環境音
  private farBus: GainNode | null = null;
  private murmur: GainNode | null = null;
  private farLevel = 0;
  private farNext = 0;
  private murmurNext = 0;

  /**
   * 遠くで鳴っている祭囃子と人のざわめき。百鬼夜行が育つほど少しずつ近づいてくる（level 0..1）。
   * 高い音を削り（遠さ）、残響を多めに。常に BGM より十分小さく。
   */
  farFestivalTick(dt: number, level: number) {
    this.farLevel += (level - this.farLevel) * Math.min(1, dt * 0.25);
    const L = this.farLevel;
    if (L < 0.01) return;
    const e = this.e;
    const now = e.now;
    if (!this.farBus) {
      const lp = e.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 750;
      lp.Q.value = 0.5;
      this.farBus = e.ctx.createGain();
      this.farBus.gain.value = 0.55;
      this.farBus.connect(lp).connect(e.bus(e.ambience, 0.9));
      // ざわめき：帯域を絞ったノイズを、ゆっくり揺らす
      const src = e.ctx.createBufferSource();
      src.buffer = e.noise;
      src.loop = true;
      const bp = e.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 480;
      bp.Q.value = 0.6;
      this.murmur = e.ctx.createGain();
      this.murmur.gain.value = 0;
      src.connect(bp).connect(this.murmur).connect(this.farBus);
      src.start();
    }
    if (now >= this.murmurNext) {
      this.murmurNext = now + 0.7 + Math.random() * 0.8;
      this.murmur!.gain.setTargetAtTime(L * 0.05 * (0.5 + Math.random()), now, 0.8);
    }
    if (now < this.farNext) return;
    this.farNext = now + (5 + Math.random() * 7) / (0.45 + L);
    // 遠くの出来事：太鼓・笛・歓声・掛け声のどれか。左右はばらばら
    const g = e.ctx.createGain();
    g.gain.value = 0.35 + L * 0.45;
    const p = e.ctx.createStereoPanner();
    p.pan.value = (Math.random() - 0.5) * 1.4;
    g.connect(p).connect(this.farBus);
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
    }, 5000);
    const t = now + 0.05;
    const i = this.inst;
    const r = Math.random();
    if (r < 0.35) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) i.odaiko(t + k * 0.42, g, 0.45);
      i.shime(t + 0.21, g, 0.3);
    } else if (r < 0.6) {
      const notes = [784, 880, 1047, 880, 784, 622];
      const start = Math.floor(Math.random() * 3);
      for (let k = 0; k < 3; k++) i.fue(t + k * 0.3, notes[start + k], 0.32, g, 0.45);
    } else if (r < 0.85) {
      // 人々の歓声が遠くで湧く
      e.noiseBurst(t, 1.8, g, 0.06, "bandpass", 700, 0.5, 0.5);
      e.noiseBurst(t + 0.2, 1.4, g, 0.04, "bandpass", 1100, 0.7, 0.4);
    } else {
      i.kakegoe(t, g, Math.random() < 0.5 ? "a" : "o", 0.4);
      i.shime(t + 0.3, g, 0.3);
    }
  }

  // ---------------------------------------------------------------- 妖怪固有 SE
  yokai(key: SeKey, vol = 1) {
    const t = this.e.now;
    const o = this.out;
    const v = vol;
    switch (key) {
      case "pita":
        this.e.noiseBurst(t, 0.05, o, 0.2 * v, "lowpass", 600, 1);
        this.e.noiseBurst(t + 0.12, 0.05, o, 0.18 * v, "lowpass", 560, 1);
        break;
      case "ponpoko":
        for (const [dt, f] of [[0, 190], [0.16, 150]] as const) {
          const osc = this.e.ctx.createOscillator();
          osc.frequency.setValueAtTime(f * 1.4, t + dt);
          osc.frequency.exponentialRampToValueAtTime(f, t + dt + 0.05);
          const g = this.e.ctx.createGain();
          g.gain.setValueAtTime(0.4 * v, t + dt);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
          osc.connect(g).connect(o);
          osc.start(t + dt);
          osc.stop(t + dt + 0.25);
        }
        break;
      case "fuwa": {
        const n = this.e.noiseBurst(t, 0.45, o, 0.1 * v, "bandpass", 600, 2, 0.2);
        n.f.frequency.exponentialRampToValueAtTime(2000, t + 0.4);
        break;
      }
      case "bo":
        this.e.noiseBurst(t, 0.3, o, 0.3 * v, "lowpass", 350, 1, 0.01);
        this.e.osc("sine", 90, t, 0.3, o, 0.25 * v, 0.01);
        break;
      case "karan":
        this.e.osc("sine", 980, t, 0.07, o, 0.18 * v, 0.001);
        this.e.osc("sine", 760, t + 0.2, 0.07, o, 0.18 * v, 0.001);
        this.e.noiseBurst(t, 0.03, o, 0.1 * v, "bandpass", 1500, 3);
        this.e.noiseBurst(t + 0.2, 0.03, o, 0.1 * v, "bandpass", 1300, 3);
        break;
      case "nya": {
        const osc = this.e.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.linearRampToValueAtTime(820, t + 0.08);
        osc.frequency.exponentialRampToValueAtTime(480, t + 0.3);
        const bp = this.e.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1600;
        bp.Q.value = 4;
        const g = this.e.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.25 * v, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(bp).connect(g).connect(o);
        osc.start(t);
        osc.stop(t + 0.35);
        break;
      }
      case "kon":
        this.e.osc("triangle", 1100, t, 0.16, o, 0.2 * v, 0.005);
        this.e.osc("triangle", 820, t + 0.05, 0.16, o, 0.15 * v, 0.005);
        break;
      case "hoo":
        this.inst.fue(t, 587, 0.35, o, 0.8 * v);
        break;
      case "kusu":
        for (let i = 0; i < 3; i++) this.e.osc("sine", 1250 + i * 60 * (i % 2 ? -1 : 1), t + i * 0.07, 0.06, o, 0.1 * v, 0.005);
        break;
      case "hira": {
        const n = this.e.noiseBurst(t, 0.5, o, 0.1 * v, "highpass", 2500, 0.5, 0.05);
        const lfo = this.e.ctx.createOscillator();
        lfo.frequency.value = 14;
        const lg = this.e.ctx.createGain();
        lg.gain.value = 0.05 * v;
        lfo.connect(lg).connect(n.g.gain);
        lfo.start(t);
        lfo.stop(t + 0.5);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- Audio Crowd
  /**
   * 近距離の妖怪の個別音は予算制（1 秒あたり最大数）で鳴らし、
   * それ以外は行列全体の「足音のさざめき」に集約する。
   */
  crowdTick(dt: number, nearby: SeKey[], moving: number, count: number) {
    this.crowdMoving += (moving - this.crowdMoving) * Math.min(1, dt * 3);
    this.crowdCount = count;
    this.budget = Math.min(3, this.budget + dt * 1.4);
    if (nearby.length && this.budget >= 1 && Math.random() < dt * (1.5 + count * 0.03)) {
      this.budget -= 1;
      const k = nearby[Math.floor(Math.random() * nearby.length)];
      this.yokai(k, 0.35 + Math.random() * 0.2);
    }
    // 行列の足音（数に応じて密度が上がる）
    const target = Math.min(1, count / 40) * this.crowdMoving;
    this.crowdOut.gain.setTargetAtTime(target * 0.8, this.e.now, 0.3);
    const rate = Math.min(26, 2 + count * 0.4) * this.crowdMoving;
    const now = this.e.now;
    if (this.patterNext < now) this.patterNext = now;
    while (rate > 0.5 && this.patterNext < now + 0.12) {
      const t = this.patterNext;
      this.e.noiseBurst(t, 0.04, this.crowdOut, 0.05 + Math.random() * 0.04, "lowpass", 400 + Math.random() * 900, 1);
      if (Math.random() < 0.08 && count > 10) this.e.osc("sine", 900 + Math.random() * 300, t, 0.05, this.crowdOut, 0.03, 0.001);
      this.patterNext += (1 / rate) * (0.5 + Math.random());
    }
  }
}
