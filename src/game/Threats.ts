import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import { THREATS, type ThreatDef } from "../data/map";
import type { ThreatMode } from "../data/stages";
import type { World } from "../world/World";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { GameBus } from "./events";
import { rand, pick } from "../core/util";

type TState = "idle" | "patrol" | "chase" | "return" | "yield" | "follow";

interface Threat {
  def: ThreatDef;
  actor: Actor;
  state: TState;
  timer: number;
  cooldown: number;
  patrolIdx: number;
  bubbleCd: number;
}

const CFG = {
  dog: { detect: 11, speed: 8.4, leash: 32, walk: 2.2 },
  watchman: { detect: 9, speed: 6.4, leash: 40, walk: 2.4 },
  monk: { detect: 7.5, speed: 5.2, leash: 20, walk: 1.5 },
};

/**
 * 避けるべき存在（仕様 10章）。戦闘はなく、捕まると最後尾の妖怪が少し散るだけ。
 * 夜行位が上がると「道を譲る」→「一緒についてくる」へと反応が逆転する。
 */
export class Threats {
  list: Threat[] = [];
  mode: ThreatMode = "chase";
  /** 祭りの見物人 */
  crowd: Actor[] = [];
  private tmp = { x: 0, z: 0, dx: 0, dz: 0 };

  constructor(private factory: ModelFactory, private world: World, private bus: GameBus, private parade: Parade, private player: Player) {
    for (const d of THREATS) {
      const a = new Actor(factory, d.kind);
      a.setPos(d.x, 0, d.z);
      this.list.push({ def: d, actor: a, state: d.patrol ? "patrol" : "idle", timer: rand(0, 3), cooldown: 0, patrolIdx: 0, bubbleCd: 0 });
    }
  }

  setMode(m: ThreatMode) {
    this.mode = m;
    for (const t of this.list) if (t.state === "chase") t.state = "return";
  }

  /** 祭りになると見物人が集まってくる */
  spawnCrowd() {
    if (this.crowd.length) return;
    const spots: [number, number][] = [];
    for (let z = -110; z < 50; z += 9) spots.push([rand(-7.5, -6.5), z + rand(-2, 2)], [rand(6.5, 7.5), z + rand(-2, 2)]);
    for (let x = -95; x < 50; x += 11) spots.push([x + rand(-2, 2), -13.8], [x + rand(-2, 2), -26.2]);
    for (const [x, z] of spots) {
      if (!this.world.isWalkable(x, z, 0.3)) continue;
      const a = new Actor(this.factory, "villager", pick(["villager_a", "villager_b", "villager_c"]));
      a.setPos(x, 0, z);
      a.yaw = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      a.pop();
      this.crowd.push(a);
    }
  }

  update(dt: number, t: number) {
    const px = this.player.x, pz = this.player.z;
    for (const th of this.list) {
      const a = th.actor;
      const cfg = CFG[th.def.kind];
      const dx = px - a.x, dz = pz - a.z;
      const dist = Math.hypot(dx, dz);
      const homeD = Math.hypot(a.x - th.def.x, a.z - th.def.z);
      if (th.cooldown > 0) th.cooldown -= dt;
      if (th.bubbleCd > 0) th.bubbleCd -= dt;
      let tx = a.x, tz = a.z, sp = 0;

      if (this.mode === "chase") {
        if ((th.state === "idle" || th.state === "patrol") && th.cooldown <= 0 && dist < cfg.detect && this.player.invuln <= 0) {
          th.state = "chase";
          a.surprise();
          this.bus.emit("threatAlert", { kind: th.def.kind, x: a.x, z: a.z });
        }
      } else if (this.mode === "yield") {
        if (th.state === "chase") th.state = "return";
        if (dist < 7 && th.state !== "yield") {
          th.state = "yield";
          th.timer = 2.5;
          a.surprise();
          this.bus.emit("threatYield", { kind: th.def.kind, x: a.x, z: a.z });
        }
      } else if (this.mode === "follow") {
        if (th.state !== "follow" && dist < 20) {
          th.state = "follow";
          a.happy();
        }
      }

      switch (th.state) {
        case "chase":
          tx = px;
          tz = pz;
          sp = cfg.speed;
          if (dist < 1.3) {
            // 捕まった：最後尾の妖怪が散る
            const n = Math.min(12, Math.ceil(this.parade.count * 0.3));
            if (n > 0) this.bus.emit("scatter", { n, x: a.x, z: a.z, kind: th.def.kind });
            this.player.invuln = 3;
            th.state = "return";
            th.cooldown = 9;
          } else if (homeD > cfg.leash || dist > cfg.detect * 2.2) {
            th.state = "return";
            th.cooldown = 3;
          }
          break;
        case "return":
          tx = th.def.x;
          tz = th.def.z;
          sp = cfg.walk * 1.4;
          if (homeD < 1) th.state = th.def.patrol ? "patrol" : "idle";
          break;
        case "patrol": {
          const p = th.def.patrol![th.patrolIdx];
          tx = p[0];
          tz = p[1];
          sp = cfg.walk;
          if (Math.hypot(tx - a.x, tz - a.z) < 1) th.patrolIdx = (th.patrolIdx + 1) % th.def.patrol!.length;
          if (th.bubbleCd <= 0 && dist < 25 && this.mode === "chase") {
            th.bubbleCd = 12;
            this.bus.emit("toast", { text: "夜回り「火の用心、カチカチ…」" });
          }
          break;
        }
        case "idle":
          th.timer -= dt;
          if (th.timer < 0) {
            th.timer = rand(2, 5);
            (th as any).wx = th.def.x + rand(-4, 4);
            (th as any).wz = th.def.z + rand(-4, 4);
          }
          tx = (th as any).wx ?? a.x;
          tz = (th as any).wz ?? a.z;
          sp = cfg.walk * 0.6;
          break;
        case "yield": {
          // 道を譲る：行列から横へ退く
          th.timer -= dt;
          const l = dist || 1;
          tx = a.x - (dx / l) * 3 + (-dz / l) * 2;
          tz = a.z - (dz / l) * 3 + (dx / l) * 2;
          sp = th.timer > 1.8 ? 0 : 3.5;
          if (th.timer <= 0 && dist > 9) th.state = th.def.patrol ? "patrol" : "idle";
          break;
        }
        case "follow": {
          // 後ろからついてくる
          this.parade.tail(this.tmp);
          const ox = this.tmp.x - a.x, oz = this.tmp.z - a.z;
          const od = Math.hypot(ox, oz);
          if (od > 4.5) {
            tx = this.tmp.x;
            tz = this.tmp.z;
            sp = Math.min(9, 2 + od * 0.5);
          }
          if (od > 70) th.state = "idle";
          if (th.bubbleCd <= 0 && dist < 30) {
            th.bubbleCd = 20;
            this.bus.emit("toast", {
              text: th.def.kind === "dog" ? "犬「わん！（楽しそう）」" : th.def.kind === "monk" ? "僧侶「これはまた、見事な百鬼夜行…」" : "夜回り「こりゃあ、祭りだ！」",
            });
          }
          break;
        }
      }
      const mx = tx - a.x, mz = tz - a.z;
      const md = Math.hypot(mx, mz);
      if (md > 0.2 && sp > 0) {
        const step = Math.min(md, sp * dt);
        const p = { x: a.x + (mx / md) * step, z: a.z + (mz / md) * step };
        this.world.resolve(p, 0.45);
        a.face(mx, mz, dt, 8);
        a.speed = Math.hypot(p.x - a.x, p.z - a.z) / dt;
        a.x = p.x;
        a.z = p.z;
      } else {
        a.speed = 0;
        if (th.state === "yield" || th.state === "follow") a.face(dx, dz, dt, 4);
      }
      a.y = this.world.groundHeight(a.x, a.z);
      a.groundY = a.y;
      a.animate(dt, t);
    }

    // 見物人：行列が近いと跳ねて喜ぶ
    for (const c of this.crowd) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < 14) {
        c.face(px - c.x, pz - c.z, dt, 4);
        if (Math.random() < dt * 0.8) c.happy();
      }
      c.speed = 0;
      c.animate(dt, t);
    }
  }
}
