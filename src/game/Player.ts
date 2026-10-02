import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import type { World } from "../world/World";

/** 主人公が歩く場所（町でも温泉宿でも）：押し戻しと地面の高さ */
export type WalkWorld = Pick<World, "resolve" | "groundHeight">;
import { clamp } from "../core/util";

/** 主人公（小鬼）。サイズは変化しない。成長するのは行列のほう。 */
export class Player {
  actor: Actor;
  vx = 0;
  vz = 0;
  dango = 0;
  running = false;
  invuln = 0;
  walkSpeed = 7;
  runSpeed = 10.5;
  /** 自動歩行（エンディング用） */
  auto: { x: number; z: number } | null = null;

  constructor(factory: ModelFactory, private world: WalkWorld, x: number, z: number) {
    this.actor = new Actor(factory, "oni", "hero");
    this.actor.setPos(x, 0, z);
  }

  get x() {
    return this.actor.x;
  }
  get z() {
    return this.actor.z;
  }

  /** mx, mz: 入力ベクトル（ワールド座標、長さ 0..1） */
  update(dt: number, t: number, mx: number, mz: number, run: boolean) {
    if (this.auto) {
      const dx = this.auto.x - this.x, dz = this.auto.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        mx = (dx / d) * 0.6;
        mz = (dz / d) * 0.6;
      } else mx = mz = 0;
      run = false;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    this.running = run && len > 0.1;
    const max = this.running ? this.runSpeed : this.walkSpeed;
    const tx = mx * max, tz = mz * max;
    const acc = len > 0.05 ? 12 : 9;
    const k = 1 - Math.exp(-acc * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    const a = this.actor;
    const p = { x: a.x + this.vx * dt, z: a.z + this.vz * dt };
    this.world.resolve(p, 0.45);
    const realV = Math.hypot(p.x - a.x, p.z - a.z) / Math.max(dt, 1e-4);
    a.speed = clamp(realV, 0, 20);
    if (len > 0.05) a.face(mx, mz, dt, 12);
    a.x = p.x;
    a.z = p.z;
    a.y = this.world.groundHeight(a.x, a.z);
    a.groundY = a.y;
    a.animate(dt, t);
    if (this.invuln > 0) this.invuln -= dt;
  }
}
