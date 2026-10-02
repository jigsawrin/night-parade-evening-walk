import { Color4, DynamicTexture, ParticleSystem, Scene, Vector3, BaseTexture } from "../core/babylon";

export type BurstKind =
  | "washi" | "washi_petal" | "washi_gold" | "gold_confetti" | "smoke" | "splash" | "stage" | "scatter"
  // v0.2：世界の中の気配（遠くからでも見える大きめの灯り）
  | "foxfire" | "glint" | "lantern" | "shadow" | "merge";

/**
 * 和風 VFX（仕様 24章）：墨・和紙・金箔・紅葉・火の粉・狐火・紙吹雪。
 * 汎用の魔法陣や SF 的な光粒子は使わない。
 */
export class VFXDirector {
  private tex: Record<string, BaseTexture> = {};
  private ps: Record<string, ParticleSystem> = {};
  private queue: { kind: BurstKind; p: Vector3; n: number; at: number }[] = [];
  private leaves: ParticleSystem;
  private fireflies: ParticleSystem;
  private kitsunebi: ParticleSystem;
  private confetti: ParticleSystem;
  private sparks: ParticleSystem;
  private target = new Vector3();

  constructor(private scene: Scene) {
    this.tex.washi = this.makeTex((c) => {
      c.fillStyle = "#fbf5e6";
      c.fillRect(8, 8, 48, 48);
      c.strokeStyle = "rgba(180,160,120,0.5)";
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.moveTo(8 + Math.random() * 48, 8 + Math.random() * 48);
        c.lineTo(8 + Math.random() * 48, 8 + Math.random() * 48);
        c.stroke();
      }
    });
    this.tex.leaf = this.makeTex((c) => {
      c.fillStyle = "#ffffff";
      c.translate(32, 32);
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
        const b = a + Math.PI / 5;
        c.lineTo(Math.cos(b) * 11, Math.sin(b) * 11);
      }
      c.closePath();
      c.fill();
    });
    this.tex.petal = this.makeTex((c) => {
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(32, 32, 14, 26, 0.4, 0, Math.PI * 2);
      c.fill();
    });
    this.tex.spark = this.makeTex((c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.6)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    });
    this.tex.flame = this.makeTex((c) => {
      const g = c.createRadialGradient(32, 40, 0, 32, 40, 26);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(32, 2);
      c.bezierCurveTo(52, 30, 58, 62, 32, 62);
      c.bezierCurveTo(6, 62, 12, 30, 32, 2);
      c.fill();
    });
    this.tex.smoke = this.makeTex((c) => {
      for (let i = 0; i < 6; i++) {
        const g = c.createRadialGradient(20 + Math.random() * 24, 20 + Math.random() * 24, 0, 32, 32, 30);
        g.addColorStop(0, "rgba(255,255,255,0.5)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      }
    });
    this.tex.square = this.makeTex((c) => {
      c.fillStyle = "#ffffff";
      c.fillRect(14, 20, 36, 24);
    });

    // バースト用プール
    this.ps.washi = this.makeBurst("washi", this.tex.washi, 300, false);
    this.ps.petal = this.makeBurst("petal", this.tex.leaf, 300, false);
    this.ps.gold = this.makeBurst("gold", this.tex.square, 400, true);
    this.ps.smoke = this.makeBurst("smoke", this.tex.smoke, 200, false);
    this.ps.splash = this.makeBurst("splash", this.tex.spark, 200, true);
    // 気配：ゆっくり漂って長く残る灯り
    this.ps.foxfire = this.makeGlow("foxfire", this.tex.flame, 300, [0.5, 0.95], [2.2, 3.4], 0.7);
    this.ps.glint = this.makeGlow("glint", this.tex.spark, 80, [0.3, 0.38], [1.6, 2.2], 0.02);
    this.ps.lamp = this.makeGlow("lamp", this.tex.flame, 240, [0.5, 0.9], [1.4, 2.2], 0.5);

    // 常時：舞い散る紅葉
    this.leaves = this.makeAmbient("leaves", this.tex.leaf, 200, 5);
    this.leaves.minEmitBox = new Vector3(-30, 14, -30);
    this.leaves.maxEmitBox = new Vector3(30, 18, 30);
    this.leaves.color1 = new Color4(0.85, 0.3, 0.15, 1);
    this.leaves.color2 = new Color4(0.95, 0.6, 0.2, 1);
    this.leaves.colorDead = new Color4(0.5, 0.2, 0.1, 0);
    this.leaves.minSize = 0.25;
    this.leaves.maxSize = 0.45;
    this.leaves.minLifeTime = 6;
    this.leaves.maxLifeTime = 9;
    this.leaves.gravity = new Vector3(0, -1.2, 0);
    this.leaves.direction1 = new Vector3(-1, 0, -0.5);
    this.leaves.direction2 = new Vector3(1, 0, 0.5);
    this.leaves.minAngularSpeed = -2;
    this.leaves.maxAngularSpeed = 2;
    this.leaves.minEmitPower = 0.5;
    this.leaves.maxEmitPower = 1.2;
    this.leaves.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.leaves.start();

    // 川辺の蛍
    this.fireflies = this.makeAmbient("fireflies", this.tex.spark, 150, 12);
    this.fireflies.emitter = new Vector3(68, 0, 0);
    this.fireflies.minEmitBox = new Vector3(-16, 0.4, -120);
    this.fireflies.maxEmitBox = new Vector3(16, 2.4, 120);
    this.fireflies.color1 = new Color4(0.7, 1, 0.4, 1);
    this.fireflies.color2 = new Color4(1, 1, 0.6, 1);
    this.fireflies.colorDead = new Color4(0.3, 0.6, 0.1, 0);
    this.fireflies.minSize = 0.12;
    this.fireflies.maxSize = 0.25;
    this.fireflies.minLifeTime = 3;
    this.fireflies.maxLifeTime = 6;
    this.fireflies.gravity = new Vector3(0, 0.05, 0);
    this.fireflies.direction1 = new Vector3(-0.3, -0.1, -0.3);
    this.fireflies.direction2 = new Vector3(0.3, 0.2, 0.3);
    this.fireflies.start();

    // 狐火（祭り以降）
    this.kitsunebi = this.makeAmbient("kitsunebi", this.tex.flame, 200, 0);
    this.kitsunebi.color1 = new Color4(0.4, 0.9, 1, 1);
    this.kitsunebi.color2 = new Color4(0.5, 1, 0.7, 1);
    this.kitsunebi.colorDead = new Color4(0.1, 0.3, 0.6, 0);
    this.kitsunebi.minSize = 0.3;
    this.kitsunebi.maxSize = 0.6;
    this.kitsunebi.minLifeTime = 1.2;
    this.kitsunebi.maxLifeTime = 2.2;
    this.kitsunebi.minEmitBox = new Vector3(-1.5, 1.5, -1.5);
    this.kitsunebi.maxEmitBox = new Vector3(1.5, 3, 1.5);
    this.kitsunebi.gravity = new Vector3(0, 0.6, 0);
    this.kitsunebi.direction1 = new Vector3(-0.2, 0.2, -0.2);
    this.kitsunebi.direction2 = new Vector3(0.2, 0.5, 0.2);
    this.kitsunebi.start();

    // 紙吹雪（百鬼夜行）
    this.confetti = this.makeAmbient("confetti", this.tex.square, 800, 0);
    this.confetti.minEmitBox = new Vector3(-25, 16, -25);
    this.confetti.maxEmitBox = new Vector3(25, 20, 25);
    this.confetti.color1 = new Color4(1, 0.35, 0.4, 1);
    this.confetti.color2 = new Color4(1, 0.85, 0.35, 1);
    this.confetti.colorDead = new Color4(0.9, 0.9, 1, 0.2);
    this.confetti.minSize = 0.2;
    this.confetti.maxSize = 0.35;
    this.confetti.minLifeTime = 4;
    this.confetti.maxLifeTime = 6;
    this.confetti.gravity = new Vector3(0, -2.5, 0);
    this.confetti.minAngularSpeed = -6;
    this.confetti.maxAngularSpeed = 6;
    this.confetti.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.confetti.start();

    // 主人公の提灯の火の粉
    this.sparks = this.makeAmbient("sparks", this.tex.spark, 60, 5);
    this.sparks.color1 = new Color4(1, 0.7, 0.3, 1);
    this.sparks.color2 = new Color4(1, 0.5, 0.2, 1);
    this.sparks.colorDead = new Color4(0.6, 0.1, 0, 0);
    this.sparks.minSize = 0.05;
    this.sparks.maxSize = 0.12;
    this.sparks.minLifeTime = 0.6;
    this.sparks.maxLifeTime = 1.2;
    this.sparks.gravity = new Vector3(0, 1.5, 0);
    this.sparks.direction1 = new Vector3(-0.3, 0.5, -0.3);
    this.sparks.direction2 = new Vector3(0.3, 1, 0.3);
    this.sparks.start();
  }

  private makeTex(draw: (c: CanvasRenderingContext2D) => void) {
    const t = new DynamicTexture("vfx", { width: 64, height: 64 }, this.scene, true);
    t.hasAlpha = true;
    const c = t.getContext() as CanvasRenderingContext2D;
    c.clearRect(0, 0, 64, 64);
    draw(c);
    t.update();
    return t;
  }

  private makeBurst(name: string, tex: BaseTexture, cap: number, additive: boolean) {
    const ps = new ParticleSystem(name, cap, this.scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3();
    ps.manualEmitCount = 0;
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
    ps.maxEmitBox = new Vector3(0.3, 0.8, 0.3);
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.6;
    ps.minSize = 0.18;
    ps.maxSize = 0.4;
    ps.minEmitPower = 3;
    ps.maxEmitPower = 7;
    ps.direction1 = new Vector3(-1, 1.5, -1);
    ps.direction2 = new Vector3(1, 3, 1);
    ps.gravity = new Vector3(0, -6, 0);
    ps.minAngularSpeed = -5;
    ps.maxAngularSpeed = 5;
    ps.blendMode = additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.updateSpeed = 1 / 60;
    ps.start();
    return ps;
  }

  private makeGlow(name: string, tex: BaseTexture, cap: number, size: [number, number], life: [number, number], spread: number) {
    const ps = this.makeBurst(name, tex, cap, true);
    ps.minSize = size[0];
    ps.maxSize = size[1];
    ps.minLifeTime = life[0];
    ps.maxLifeTime = life[1];
    ps.minEmitBox = new Vector3(-spread, -0.1, -spread);
    ps.maxEmitBox = new Vector3(spread, spread + 0.3, spread);
    ps.direction1 = new Vector3(-0.1, 0.2, -0.1);
    ps.direction2 = new Vector3(0.1, 0.6, 0.1);
    ps.minAngularSpeed = 0;
    ps.maxAngularSpeed = 0;
    return ps;
  }

  private makeAmbient(name: string, tex: BaseTexture, cap: number, rate: number) {
    const ps = new ParticleSystem(name, cap, this.scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3();
    ps.emitRate = rate;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.minEmitPower = 0.2;
    ps.maxEmitPower = 0.6;
    ps.updateSpeed = 1 / 60;
    return ps;
  }

  /** delay 秒後に弾ける（狐火の「ぽっ、ぽっ、ぽっ」） */
  burst(kind: BurstKind, x: number, y: number, z: number, n = 30, delay = 0) {
    this.queue.push({ kind, p: new Vector3(x, y, z), n, at: performance.now() / 1000 + delay });
  }

  private emit(kind: BurstKind, p: Vector3, n: number) {
    const set = (ps: ParticleSystem, c1: Color4, c2: Color4, count: number, power = 1, gravity = -6) => {
      (ps.emitter as Vector3).copyFrom(p);
      ps.color1 = c1;
      ps.color2 = c2;
      ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
      ps.minEmitPower = 3 * power;
      ps.maxEmitPower = 7 * power;
      ps.gravity.y = gravity;
      ps.manualEmitCount = (ps.manualEmitCount > 0 ? ps.manualEmitCount : 0) + count;
    };
    const cream = new Color4(1, 0.97, 0.9, 1);
    const paper = new Color4(0.95, 0.9, 0.8, 1);
    const gold = new Color4(1, 0.82, 0.3, 1);
    const gold2 = new Color4(1, 0.65, 0.2, 1);
    switch (kind) {
      case "washi":
        set(this.ps.washi, cream, paper, n);
        break;
      case "washi_petal":
        set(this.ps.washi, cream, paper, n * 0.6);
        set(this.ps.petal, new Color4(1, 0.5, 0.6, 1), new Color4(0.95, 0.35, 0.25, 1), n * 0.6);
        break;
      case "washi_gold":
        set(this.ps.washi, cream, paper, n * 0.6);
        set(this.ps.gold, gold, gold2, n);
        break;
      case "gold_confetti":
        set(this.ps.gold, gold, new Color4(1, 0.4, 0.45, 1), n * 1.5);
        set(this.ps.petal, new Color4(1, 0.4, 0.3, 1), new Color4(1, 0.75, 0.3, 1), n);
        break;
      case "smoke":
        set(this.ps.smoke, new Color4(0.75, 0.7, 0.9, 0.8), new Color4(0.5, 0.45, 0.65, 0.6), n, 0.3, 1);
        break;
      case "splash":
        set(this.ps.splash, new Color4(0.6, 0.85, 1, 1), new Color4(0.8, 0.95, 1, 1), n, 1.1, -12);
        break;
      case "stage":
        set(this.ps.petal, new Color4(0.95, 0.3, 0.2, 1), new Color4(1, 0.7, 0.3, 1), n, 1.6, -3);
        set(this.ps.gold, gold, gold2, n, 1.8, -3);
        set(this.ps.washi, cream, paper, n * 0.5, 1.4, -3);
        break;
      case "scatter":
        set(this.ps.smoke, new Color4(0.8, 0.8, 0.85, 0.7), new Color4(0.6, 0.6, 0.7, 0.5), n, 0.6, 0.5);
        break;
      case "foxfire":
        set(this.ps.foxfire, new Color4(0.2, 0.6, 1, 0.9), new Color4(0.3, 0.95, 0.8, 0.9), n, 0.06, 0.35);
        break;
      case "glint":
        // 暗がりで光る二つの目
        set(this.ps.glint, new Color4(0.95, 0.85, 0.2, 1), new Color4(0.8, 1, 0.3, 1), n, 0, 0);
        break;
      case "lantern":
        set(this.ps.lamp, new Color4(1, 0.45, 0.15, 0.9), new Color4(1, 0.7, 0.3, 0.9), n, 0.06, 0.5);
        break;
      case "shadow":
        set(this.ps.smoke, new Color4(0.35, 0.25, 0.5, 0.8), new Color4(0.2, 0.15, 0.3, 0.6), n, 0.25, 0.8);
        break;
      case "merge":
        set(this.ps.gold, gold, new Color4(1, 0.4, 0.45, 1), n * 1.5, 1.8, -3);
        set(this.ps.petal, new Color4(1, 0.4, 0.3, 1), new Color4(1, 0.75, 0.3, 1), n, 1.6, -3);
        set(this.ps.washi, cream, paper, n, 1.5, -3);
        break;
    }
  }

  setTarget(x: number, z: number) {
    this.target.set(x, 0, z);
  }

  /** 毎フレーム：追従系エミッタの位置更新とバースト消化 */
  update(opts: { playerLantern: Vector3; kitsunebiAt: Vector3 | null; confetti: boolean; kitsunebi: boolean; dawn: number }) {
    // 1 フレームに弾けるのは 1 つ（同じ粒子系の発生位置が上書きされないように）
    const now = performance.now() / 1000;
    const i = this.queue.findIndex((q) => q.at <= now);
    if (i >= 0) {
      const [q] = this.queue.splice(i, 1);
      this.emit(q.kind, q.p, q.n);
    }
    (this.leaves.emitter as Vector3).copyFrom(this.target);
    (this.confetti.emitter as Vector3).copyFrom(this.target);
    (this.sparks.emitter as Vector3).copyFrom(opts.playerLantern);
    this.confetti.emitRate = opts.confetti ? 90 : 0;
    this.kitsunebi.emitRate = opts.kitsunebi && opts.kitsunebiAt ? 14 : 0;
    if (opts.kitsunebiAt) (this.kitsunebi.emitter as Vector3).copyFrom(opts.kitsunebiAt);
    this.fireflies.emitRate = 12 * (1 - opts.dawn);
  }
}
