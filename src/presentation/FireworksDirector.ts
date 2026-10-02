import { Color4, DynamicTexture, Matrix, ParticleSystem, Scene, Vector3, type ArcRotateCamera } from "../core/babylon";

interface Shell {
  from: Vector3;
  to: Vector3;
  t: number;
  rise: number;
  colors: [Color4, Color4];
  big: boolean;
  /** 見上げたカメラで、夜空に大きく開く */
  sky: boolean;
  /** 画面の左右（音の定位用） */
  pan: number;
}

/** 紅・金・藤・翠・白 */
const PALETTE: [number, number, number][] = [
  [1, 0.35, 0.3], [1, 0.8, 0.35], [0.75, 0.55, 1], [0.45, 1, 0.6], [1, 0.97, 0.88],
];

/**
 * 百妖到達の花火。画面の奥・上のほう（背景）に上がる。
 * 追従カメラは町を見下ろしているので、打ち上げ位置は「今見えている画面の上部の奥」から逆算する。
 * 粒子系は 2 つ（上昇の尾・開花）を使い回し、同時に開くのは 1〜2 発まで。最初の 100 妖までは作らない。
 */
export class FireworksDirector {
  private burstPs: ParticleSystem | null = null;
  private trailPs: ParticleSystem | null = null;
  private shells: Shell[] = [];
  private queue: number[] = [];
  private ambientT = 0;
  private clock = 0;
  /** 開花したとき（音・空の明るみ） */
  onBurst: (pan: number, big: boolean) => void = () => {};
  onLaunch: (pan: number) => void = () => {};
  /** 百妖以上の間、ときどき上がる */
  ambient = false;

  constructor(private scene: Scene, private cam: ArcRotateCamera) {}

  private ensure() {
    if (this.burstPs) return;
    const tex = new DynamicTexture("fwSpark", { width: 32, height: 32 }, this.scene, true);
    const c = tex.getContext() as CanvasRenderingContext2D;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 15);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    tex.hasAlpha = true;
    tex.update();

    const b = new ParticleSystem("fireworks", 700, this.scene);
    b.particleTexture = tex;
    b.createSphereEmitter(0.2, 0);
    b.emitter = new Vector3();
    b.manualEmitCount = 0;
    b.minLifeTime = 1.3;
    b.maxLifeTime = 2.1;
    b.minSize = 0.4;
    b.maxSize = 0.75;
    b.minEmitPower = 7;
    b.maxEmitPower = 10;
    b.gravity = new Vector3(0, -3.2, 0);
    b.blendMode = ParticleSystem.BLENDMODE_ADD;
    b.updateSpeed = 1 / 60;
    b.start();
    this.burstPs = b;

    const tr = new ParticleSystem("fireworksTrail", 120, this.scene);
    tr.particleTexture = tex;
    tr.emitter = new Vector3();
    tr.minEmitBox = new Vector3(-0.05, 0, -0.05);
    tr.maxEmitBox = new Vector3(0.05, 0, 0.05);
    tr.color1 = new Color4(1, 0.85, 0.55, 1);
    tr.color2 = new Color4(1, 0.7, 0.4, 1);
    tr.colorDead = new Color4(0.6, 0.3, 0.1, 0);
    tr.minSize = 0.18;
    tr.maxSize = 0.3;
    tr.minLifeTime = 0.3;
    tr.maxLifeTime = 0.6;
    tr.minEmitPower = 0;
    tr.maxEmitPower = 0.3;
    tr.gravity = new Vector3(0, -1, 0);
    tr.blendMode = ParticleSystem.BLENDMODE_ADD;
    tr.emitRate = 0;
    tr.start();
    this.trailPs = tr;
  }

  /** 何発かまとめて打ち上げる（間隔はばらばらに） */
  show(n: number, delay = 0) {
    this.ensure();
    let at = this.clock + delay;
    for (let i = 0; i < n; i++) {
      this.queue.push(at);
      at += 0.8 + Math.random() * 1.1;
    }
  }

  /** 今見えている画面の上部・奥に打ち上げ位置を取る */
  private launch() {
    const eng = this.scene.getEngine();
    // createPickingRay は CSS ピクセル基準
    const hs = eng.getHardwareScalingLevel();
    const w = eng.getRenderWidth() * hs, h = eng.getRenderHeight() * hs;
    // 見上げているとき（矢印↑）は夜空いっぱいに。見下ろしているときは行列のいる中央を避けて上の左右の隅に
    const sky = this.cam.beta > 1.15;
    const side = Math.random() < 0.5 ? 0 : 1;
    const sx = sky ? 0.12 + Math.random() * 0.76 : side ? 0.68 + Math.random() * 0.24 : 0.08 + Math.random() * 0.24;
    const sy = sky ? 0.06 + Math.random() * 0.26 : 0.04 + Math.random() * 0.14;
    const ray = this.scene.createPickingRay(sx * w, sy * h, Matrix.Identity(), this.cam);
    // 見下ろすカメラ：画面上部を通る視線が「屋根の少し上」の高さになる点で開く（画面の奥・上に見える）
    // 水平に近いカメラ（エンディング等）：本当の夜空の高いところで開く
    const hh = 9 + Math.random() * 6;
    const o = ray.origin, dir = ray.direction;
    let to: Vector3;
    if (dir.y < -0.15 && o.y > hh + 8) to = o.add(dir.scale((hh - o.y) / dir.y));
    else {
      to = o.add(dir.scale(sky ? 55 + Math.random() * 20 : 80 + Math.random() * 30));
      to.y = Math.max(to.y, sky ? 10 : 22);
    }
    const from = new Vector3(to.x + (Math.random() - 0.5) * 2, Math.max(0, to.y - 16), to.z);
    const p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const q = Math.random() < 0.35 ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : p;
    this.shells.push({
      from, to, t: 0, rise: 0.9 + Math.random() * 0.3, big: Math.random() < 0.3, sky, pan: (sx - 0.5) * 1.6,
      colors: [new Color4(p[0], p[1], p[2], 0.85), new Color4(q[0], q[1], q[2], 0.85)],
    });
    this.onLaunch((sx - 0.5) * 1.6);
  }

  update(dt: number) {
    this.clock += dt;
    if (!this.burstPs && !this.ambient) return;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i] > this.clock) continue;
      this.queue.splice(i, 1);
      if (this.shells.length < 2) this.launch();
    }
    // 百妖以上の間は、ときどき一、二発（邪魔にならない程度に）
    if (this.ambient) {
      this.ambientT -= dt;
      if (this.ambientT <= 0) {
        this.ambientT = 16 + Math.random() * 12;
        this.show(Math.random() < 0.4 ? 2 : 1);
      }
    }
    const tr = this.trailPs!;
    let rising = false;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.rise);
      const e = 1 - (1 - k) * (1 - k);
      if (k < 1) {
        (tr.emitter as Vector3).copyFrom(Vector3.Lerp(s.from, s.to, e));
        rising = true;
        continue;
      }
      // 開花
      const b = this.burstPs!;
      (b.emitter as Vector3).copyFrom(s.to);
      b.color1 = s.colors[0];
      b.color2 = s.colors[1];
      b.colorDead = new Color4(s.colors[1].r * 0.4, s.colors[1].g * 0.3, s.colors[1].b * 0.3, 0);
      const pk = s.sky ? 1.7 : 1;
      b.minEmitPower = (s.big ? 6.5 : 5) * pk;
      b.maxEmitPower = (s.big ? 8.5 : 6.5) * pk;
      b.minSize = s.sky ? 0.7 : 0.4;
      b.maxSize = s.sky ? 1.2 : 0.75;
      b.manualEmitCount = Math.max(0, b.manualEmitCount) + Math.round((s.big ? 130 : 85) * (s.sky ? 1.4 : 1));
      this.shells.splice(i, 1);
      this.onBurst(s.pan, s.big);
      break; // 1 フレームに開くのは 1 発
    }
    tr.emitRate = rising ? 70 : 0;
  }
}
