import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, Scene, Vector3 } from "../core/babylon";
import type { Materials } from "../world/Materials";

interface Orb {
  mesh: Mesh;
  trail: ParticleSystem;
  /** 出発点・向き・泳ぐ距離 */
  sx: number;
  sz: number;
  dx: number;
  dz: number;
  len: number;
  /** 泳いだ距離 */
  s: number;
  t: number;
  state: "idle" | "appear" | "swim" | "linger" | "fade";
}

const LINGER = 2.2;

/**
 * 言霊（ことだま）：何もないとき、光の玉がすすっと妖怪のいる方へ泳いでいく。
 * 報酬ではなく「あちらに何かいる」と示すだけの演出。玉は 2 つまで使い回す。
 */
export class KotodamaDirector {
  private orbs: Orb[] = [];

  constructor(scene: Scene, mats: Materials) {
    const mat = mats.makeGlow(scene, "kotodama", new Color3(1, 0.93, 0.7));
    const tex = new DynamicTexture("kotodamaSpark", { width: 32, height: 32 }, scene, true);
    const c = tex.getContext() as CanvasRenderingContext2D;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 15);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    tex.hasAlpha = true;
    tex.update();
    for (let i = 0; i < 2; i++) {
      const mesh = MeshBuilder.CreateSphere("kotodama", { diameter: 0.34, segments: 8 }, scene);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      const trail = new ParticleSystem("kotodamaTrail", 120, scene);
      trail.particleTexture = tex;
      trail.emitter = mesh;
      trail.minEmitBox = new Vector3(-0.08, -0.08, -0.08);
      trail.maxEmitBox = new Vector3(0.08, 0.08, 0.08);
      trail.color1 = new Color4(1, 0.95, 0.75, 1);
      trail.color2 = new Color4(0.8, 0.9, 1, 1);
      trail.colorDead = new Color4(0.6, 0.7, 1, 0);
      trail.minSize = 0.07;
      trail.maxSize = 0.17;
      trail.minLifeTime = 0.5;
      trail.maxLifeTime = 1.0;
      trail.minEmitPower = 0.05;
      trail.maxEmitPower = 0.25;
      trail.direction1 = new Vector3(-0.3, 0.2, -0.3);
      trail.direction2 = new Vector3(0.3, 0.6, 0.3);
      trail.gravity = new Vector3(0, 0.3, 0);
      trail.blendMode = ParticleSystem.BLENDMODE_ADD;
      trail.emitRate = 0;
      trail.start();
      this.orbs.push({ mesh, trail, sx: 0, sz: 0, dx: 0, dz: 1, len: 0, s: 0, t: 0, state: "idle" });
    }
  }

  /** プレイヤーのそばから、(tx, tz) の方へ泳ぎ出す */
  launch(px: number, pz: number, tx: number, tz: number) {
    const o = this.orbs.find((x) => x.state === "idle") ?? this.orbs[0];
    const dx = tx - px, dz = tz - pz;
    const d = Math.hypot(dx, dz) || 1;
    o.dx = dx / d;
    o.dz = dz / d;
    // 少し横から湧き出る
    o.sx = px - o.dz * 0.9;
    o.sz = pz + o.dx * 0.9;
    // 妖怪の手前まで。遠ければ途中まで行って方向だけ示す
    o.len = Math.max(8, Math.min(d - 3, 40));
    o.s = 0;
    o.t = 0;
    o.state = "appear";
    o.mesh.setEnabled(true);
    o.mesh.scaling.setAll(0.01);
  }

  update(dt: number, t: number) {
    for (const o of this.orbs) {
      if (o.state === "idle") continue;
      o.t += dt;
      let k = 1;
      if (o.state === "appear") {
        k = Math.min(1, o.t / 0.45);
        o.trail.emitRate = 20;
        if (o.t >= 0.6) {
          o.state = "swim";
          o.t = 0;
        }
      } else if (o.state === "swim") {
        // すすっ、すすっと魚のように緩急をつけて泳ぐ
        const v = 3.5 + 8 * Math.max(0, Math.sin(o.t * 5.5));
        o.s = Math.min(o.len, o.s + v * dt);
        o.trail.emitRate = 45;
        if (o.s >= o.len) {
          o.state = "linger";
          o.t = 0;
        }
      } else if (o.state === "linger") {
        o.trail.emitRate = 18;
        if (o.t >= LINGER) {
          o.state = "fade";
          o.t = 0;
        }
      } else {
        k = Math.max(0, 1 - o.t / 0.6);
        o.trail.emitRate = 0;
        if (o.t >= 0.6) {
          o.state = "idle";
          o.mesh.setEnabled(false);
          continue;
        }
      }
      const wob = Math.sin(o.s * 0.45) * 1.1 * Math.min(1, o.s / 5);
      const x = o.sx + o.dx * o.s - o.dz * wob;
      const z = o.sz + o.dz * o.s + o.dx * wob;
      const y = 1.3 + Math.min(0.5, o.s * 0.03) + Math.sin(t * 3.1) * 0.12;
      o.mesh.position.set(x, y, z);
      const pulse = 1 + Math.sin(t * 7) * 0.08;
      o.mesh.scaling.setAll(Math.max(0.01, k * pulse));
    }
  }
}
