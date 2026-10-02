import type { AudioEngine } from "../../presentation/audio/AudioEngine";
import { Instruments } from "../../presentation/audio/Instruments";
import { ONSEN_POOLS, ONSEN_ROOMS, type ORect } from "../../data/onsenMap";
import type { OnsenAccess } from "../../game/onsen/OnsenVisit";

/** 声の母音（第 1・第 2 フォルマント）。言葉にはしない */
const VOWELS: [number, number][] = [[800, 1200], [300, 2300], [350, 1300], [500, 1900], [500, 900]];
const INDOOR = new Set(["genkan", "chouba", "hiroma", "zashiki", "uchiyu", "banquet"]);
const WOOD = new Set(["genkan", "chouba", "engawa", "uchiyu", "hiroma", "zashiki", "banquet", "tsukimi"]);

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function distToRect(r: ORect, x: number, z: number) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}
/**
 * いちばん近い湯までの距離（湯の音・滴る音・カポンの大きさ）。月見の湯は、月見の奥庭が開いているときだけ数える
 * （訪問の途中で開いたら openInner から）
 */
export function nearestPoolDistance(x: number, z: number, innerOpen: boolean) {
  let d = Infinity;
  for (const p of ONSEN_POOLS) if (p.id !== "tsukiyu" || innerOpen) d = Math.min(d, distToRect(p.r, x, z));
  return d;
}
const roomAt = (x: number, z: number) => ONSEN_ROOMS.find((r) => x >= r.r.x0 && x <= r.r.x1 && z >= r.r.z0 && z <= r.r.z1)?.area ?? null;

/**
 * 宵霞楼の環境音（主人公のいる場所で聞こえ方が変わる。遠くのものは小さく・低く・残響多めに）。
 *  - 湯：湯の近くでさらさらと流れる音、ときどき滴る音・小さな水音
 *  - カポン：湯から上がって桶を置いた音（どこかの湯で。遠いほど小さく、響く）
 *  - 遠くの喧騒：言葉にならない話し声と笑い声（大広間・宴会場の方から）。宴会場が開いていれば三味線も
 *  - 中庭の鹿威し（コーン）、縁側の風鈴、庭の鈴虫
 *  - 板の間・畳を歩く足音、宿に着いたときの小さな鈴
 * 鳴らすかどうかの判定は低頻度（update が秒数を数える）。音は合成（AudioEngine・Instruments）で、素材ファイルは使わない。
 */
export class OnsenSoundscape {
  private inst: Instruments;
  private near: GainNode;
  private far: GainNode;
  private water: GainNode;
  private crowd: GainNode;
  private timers = { drip: 1, kapon: 6, splash: 9, phrase: 1.5, laugh: 14, shishi: 10, furin: 5, cricket: 2, shamisen: 18, step: 0 };

  private e: AudioEngine;
  private access: OnsenAccess;
  /** 月見の奥庭が開いているか（入館時の解禁。訪問の途中で開いたら openInner） */
  private innerOpen: boolean;

  constructor(e: AudioEngine, access: OnsenAccess) {
    this.e = e;
    this.access = access;
    this.innerOpen = access.inner;
    this.inst = new Instruments(e);
    this.near = e.bus(e.sfx, 0.35);
    this.near.gain.value = 0.9;
    this.far = e.bus(e.ambience, 0.8);
    this.far.gain.value = 0.9;
    // 湯の流れ（ずっと鳴っている。湯から離れると静かに）
    this.water = e.ctx.createGain();
    this.water.gain.value = 0;
    this.water.connect(e.bus(e.ambience, 0.4));
    const src = e.ctx.createBufferSource();
    src.buffer = e.noise;
    src.loop = true;
    const lp = e.ctx.createBiquadFilter();
    lp.type = "bandpass";
    lp.frequency.value = 650;
    lp.Q.value = 0.6;
    src.connect(lp).connect(this.water);
    src.start();
    // 遠くの喧騒の出口（低く、こもらせる）
    this.crowd = e.ctx.createGain();
    const muffle = e.ctx.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 1500;
    this.crowd.connect(muffle).connect(this.far);
  }

  /** 訪問の途中で月見の奥庭が開いた：以後は月見の湯も湯の音の対象にする */
  openInner() {
    this.innerOpen = true;
  }

  /** 宿に着いた：小さな鈴 */
  arrive() {
    this.inst.suzu(this.e.now + 0.2, this.near, 0.6);
  }

  update(dt: number, px: number, pz: number, moving: boolean) {
    const t = this.e.now;
    const T = this.timers;
    for (const k of Object.keys(T) as (keyof typeof T)[]) T[k] -= dt;
    const area = roomAt(px, pz);
    const indoor = area !== null && INDOOR.has(area);
    const poolD = nearestPoolDistance(px, pz, this.innerOpen);
    const wet = clamp01(1 - poolD / 16);
    this.water.gain.setTargetAtTime(0.012 + wet * 0.07, t, 0.6);
    // 大広間・宴会場への近さ（喧騒の大きさ）
    const hallD = Math.min(distToRect(ONSEN_ROOMS.find((r) => r.area === "hiroma")!.r, px, pz), this.access.banquet ? distToRect(ONSEN_ROOMS.find((r) => r.area === "banquet")!.r, px, pz) : Infinity);
    const bustle = 0.25 + clamp01(1 - hallD / 30) * 0.75;
    this.crowd.gain.setTargetAtTime(0.35 * bustle, t, 1);

    if (T.drip <= 0) {
      T.drip = rnd(0.7, 2.2);
      if (wet > 0.1) this.drip(t, wet);
    }
    if (T.splash <= 0) {
      T.splash = rnd(8, 16);
      if (wet > 0.2) this.e.noiseBurst(t, 0.45, this.near, 0.03 * wet, "lowpass", 1100, 0.7, 0.02);
    }
    if (T.kapon <= 0) {
      T.kapon = rnd(9, 20);
      this.kapon(t, clamp01(1 - poolD / 45) * 0.8 + 0.2);
    }
    if (T.phrase <= 0) {
      T.phrase = rnd(0.35, 1.2);
      this.phrase(t);
    }
    if (T.laugh <= 0) {
      T.laugh = rnd(9, 22);
      this.laugh(t);
    }
    if (T.shishi <= 0) {
      T.shishi = rnd(18, 28);
      const d = Math.hypot(px - 0, pz - 13);
      if (d < 40) this.shishiodoshi(t, clamp01(1 - d / 40));
    }
    if (T.furin <= 0) {
      T.furin = rnd(6, 14);
      const d = Math.abs(pz - 2);
      if (d < 16) this.furin(t, clamp01(1 - d / 16));
    }
    if (T.cricket <= 0) {
      T.cricket = rnd(4, 10);
      this.cricket(t, indoor ? 0.25 : 1);
    }
    if (T.shamisen <= 0) {
      T.shamisen = rnd(16, 30);
      if (this.access.banquet) this.shamisen(t, bustle);
    }
    if (moving && area && WOOD.has(area) && T.step <= 0) {
      T.step = 0.42;
      this.e.osc("sine", rnd(170, 210), t, 0.06, this.near, area === "engawa" ? 0.05 : 0.025, 0.002);
      this.e.noiseBurst(t, 0.04, this.near, 0.012, "bandpass", 900, 1.5);
    }
  }

  /** 滴る音（ぽちゃん） */
  private drip(t: number, near: number) {
    const f = rnd(1300, 2400);
    const o = this.e.ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    const g = this.e.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.025 * near, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.near);
    o.start(t);
    o.stop(t + 0.15);
  }

  /** カポン：木の桶を石の床に置いた、うつろな音（ときどき二度） */
  private kapon(t: number, v: number) {
    const hit = (tt: number, s: number) => {
      this.e.osc("sine", 380, tt, 0.22, this.far, 0.1 * v * s, 0.002);
      this.e.osc("sine", 760, tt, 0.12, this.far, 0.05 * v * s, 0.002);
      this.e.osc("triangle", 1150, tt, 0.05, this.far, 0.025 * v * s, 0.001);
      this.e.noiseBurst(tt, 0.05, this.far, 0.05 * v * s, "bandpass", 1400, 2);
    };
    hit(t, 1);
    if (Math.random() < 0.4) hit(t + 0.16, 0.45);
  }

  /** 言葉にならない話し声のひとくだり（遠く） */
  private phrase(t: number) {
    const base = rnd(130, 250);
    const n = 2 + Math.floor(Math.random() * 5);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const len = rnd(0.07, 0.19);
      this.syllable(tt, base * rnd(0.9, 1.15), len, 0.07);
      tt += len + rnd(0.02, 0.09);
    }
  }

  /** 遠くの笑い声（はは…） */
  private laugh(t: number) {
    const base = rnd(170, 260);
    for (let i = 0; i < 4; i++) this.syllable(t + i * 0.17, base * (1 - i * 0.05), 0.11, 0.08, 0);
  }

  private syllable(t: number, f: number, len: number, v: number, vowel = Math.floor(Math.random() * VOWELS.length)) {
    const ctx = this.e.ctx;
    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(f, t);
    src.frequency.linearRampToValueAtTime(f * rnd(0.85, 1.12), t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    for (const ff of VOWELS[vowel]) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = ff;
      bp.Q.value = 6;
      src.connect(bp).connect(g);
    }
    g.connect(this.crowd);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  /** 鹿威し：水が溜まる音のあと、竹が石を打つ「コーン」 */
  private shishiodoshi(t: number, v: number) {
    this.e.noiseBurst(t, 0.8, this.far, 0.012 * v, "bandpass", 2400, 2, 0.4);
    const o = this.e.ctx.createOscillator();
    o.frequency.setValueAtTime(980, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(720, t + 1.05);
    const g = this.e.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.9);
    g.gain.linearRampToValueAtTime(0.09 * v, t + 0.902);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    o.connect(g).connect(this.far);
    o.start(t + 0.9);
    o.stop(t + 1.4);
    this.e.noiseBurst(t + 0.9, 0.03, this.far, 0.05 * v, "highpass", 2500, 1);
  }

  /** 風鈴 */
  private furin(t: number, v: number) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.12, 0.3);
      const f = rnd(2600, 3200);
      this.e.osc("sine", f, tt, 1.6, this.far, 0.018 * v, 0.002);
      this.e.osc("sine", f * 2.4, tt, 0.6, this.far, 0.006 * v, 0.002);
    }
  }

  /** 鈴虫（リーン）。ごく微かに、遠くで */
  private cricket(t: number, v: number) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = rnd(3900, 4400);
    // 震え（トレモロ）は音の大きさに対する割合で掛ける（0.5..1 の間でゆれる）
    const am = ctx.createOscillator();
    am.frequency.value = 38;
    const amg = ctx.createGain();
    amg.gain.value = 0.25;
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const g = ctx.createGain();
    const peak = 0.0025 * v;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.05);
    g.gain.setValueAtTime(peak, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    am.connect(amg).connect(trem.gain);
    o.connect(trem).connect(g).connect(this.far);
    o.start(t);
    am.start(t);
    o.stop(t + 0.6);
    am.stop(t + 0.6);
  }

  /** 湯に入った：小さな「ちゃぷ」 */
  splash() {
    const t = this.e.now;
    this.e.noiseBurst(t, 0.35, this.near, 0.035, "lowpass", 900, 0.7, 0.01);
    this.e.noiseBurst(t + 0.12, 0.25, this.near, 0.015, "bandpass", 1600, 1.2, 0.01);
  }

  /** 宴会場の方から、三味線のひとふし（遠く） */
  private shamisen(t: number, v: number) {
    const notes = [62, 64, 67, 69, 71, 74];
    for (let i = 0; i < 6; i++) {
      const m = notes[Math.floor(Math.random() * notes.length)];
      this.inst.shamisen(t + i * 0.28, 440 * Math.pow(2, (m - 69) / 12), this.crowd, 0.35 * v);
    }
  }
}
