import { Actor } from "../../characters/Actor";
import type { EncounterDef, MiniParadeRoute, OmenKind } from "../../data/encounters";
import { composeGroup } from "../EventDeck";
import { Parade } from "../Parade";
import { OwnedResources } from "./Owned";
import { dist, type EncounterContext, type EncounterRuntime, type EncounterStatus } from "./types";

type Phase = "walk" | "festival" | "leave" | "merge";

const SPEED = 3.4;
const NEED_TOGETHER = 7;
const NEAR = 9.5;

/**
 * Mini Parade Encounter：3〜8 妖ほどの小さな妖怪行列が、町の別の場所を歩いている。
 * 本体と同じ「軌跡追従方式」（Parade）で動く。
 *
 * 合流の条件（どちらか）：
 *  - 小行列と一定時間、並んで歩く
 *  - 祭り地点まで一緒に歩いていく
 * 近づいただけ・立っているだけでは合流しない。
 * 本体へ移譲した Actor は所有権を手放す（dispose で消さない）。残っている Actor だけ片付ける。
 */
export class MiniParade implements EncounterRuntime {
  readonly omen: OmenKind;
  private leader: Actor;
  private leaderType: string;
  private line: Parade;
  private phase: Phase = "walk";
  private idx = 1;
  private together = 0;
  private festT = 0;
  private leaveT = 0;
  private fueT = 2;
  private greeted = false;
  private shown = -1;
  private mergeT = 0;
  private leaderAdopted = false;
  private members: Actor[] = [];
  private owned = new OwnedResources();
  private ang = 0;
  private points: [number, number][];

  constructor(readonly id: number, readonly def: EncounterDef, readonly route: MiniParadeRoute, private ctx: EncounterContext) {
    this.omen = def.announce;
    this.points = route.points;
    const n = def.size[0] + ctx.rng.int(def.size[1] - def.size[0] + 1);
    const types = composeGroup(def.members, n, ctx.theme, ctx.typeCounts, ctx.rng, ctx.typeBias);
    // 提灯持ちが先頭（遠くからでも灯りが見える）
    const li = types.indexOf("chochin");
    this.leaderType = li >= 0 ? types.splice(li, 1)[0] : "chochin";
    const [sx, sz] = this.points[0];
    const [nx, nz] = this.points[1];
    const dl = Math.hypot(nx - sx, nz - sz) || 1;
    this.leader = this.own(new Actor(ctx.factory, this.leaderType));
    this.leader.setPos(sx, 0, sz);
    this.leader.yaw = Math.atan2(nx - sx, nz - sz);
    this.line = new Parade(ctx.world, sx, sz, (nx - sx) / dl, (nz - sz) / dl);
    this.line.spacing = 1.45;
    types.forEach((type, i) => {
      const a = this.own(new Actor(ctx.factory, type));
      a.setPos(sx - ((nx - sx) / dl) * (i + 1) * 1.45, 0, sz - ((nz - sz) / dl) * (i + 1) * 1.45);
      this.line.add(a);
      this.line.followers[this.line.followers.length - 1].joinT = 1;
      this.members.push(a);
    });
  }

  private own(a: Actor) {
    return this.owned.own(a, () => a.dispose());
  }

  get x() {
    return this.leader.x;
  }
  get z() {
    return this.leader.z;
  }
  get size() {
    return this.members.length + 1;
  }

  update(dt: number, t: number): EncounterStatus {
    const c = this.ctx;
    const p = c.player;
    const L = this.leader;

    if (this.phase === "merge") return this.updateMerge(dt, t);

    // ---- 先頭の移動
    let tx = L.x, tz = L.z, sp = SPEED;
    if (this.phase === "walk") {
      const [wx, wz] = this.points[this.idx];
      tx = wx;
      tz = wz;
      if (dist(L.x, L.z, wx, wz) < 1.5) {
        this.idx++;
        if (this.idx >= this.points.length) {
          // 祭り地点に着いた。ここまで一緒に歩いてきたなら合流
          if (this.together >= 2.5) return this.startMerge();
          this.phase = "festival";
          this.festT = 40;
          this.ang = Math.atan2(L.z - wz, L.x - wx);
          c.bus.emit("omen", { kind: "hayashi", x: L.x, y: 2, z: L.z, strength: 1 });
        }
      }
    } else if (this.phase === "festival") {
      // 祭り地点の周りで輪になって踊る
      const [cx, cz] = this.points[this.points.length - 1];
      this.ang += dt * 0.7;
      tx = cx + Math.cos(this.ang) * 4;
      tz = cz + Math.sin(this.ang) * 4;
      this.festT -= dt;
      if (this.festT <= 0) {
        this.phase = "leave";
        this.leaveT = 22;
        this.idx = this.points.length - 2;
      }
    } else if (this.phase === "leave") {
      const [wx, wz] = this.points[Math.max(0, this.idx)];
      tx = wx;
      tz = wz;
      if (dist(L.x, L.z, wx, wz) < 1.5 && this.idx > 0) this.idx--;
      this.leaveT -= dt;
      if (this.leaveT <= 0) {
        c.bus.emit("reveal", { type: this.leaderType, x: L.x, y: 1, z: L.z });
        return "expired";
      }
    }
    const mx = tx - L.x, mz = tz - L.z;
    const md = Math.hypot(mx, mz);
    if (md > 0.1) {
      const step = Math.min(md, sp * dt);
      const q = { x: L.x + (mx / md) * step, z: L.z + (mz / md) * step };
      c.world.resolve(q, 0.45);
      L.face(mx, mz, dt, 6);
      L.speed = Math.hypot(q.x - L.x, q.z - L.z) / Math.max(dt, 1e-4);
      L.x = q.x;
      L.z = q.z;
    } else L.speed = 0;
    L.y = c.world.groundHeight(L.x, L.z);
    L.groundY = L.y;
    L.animate(dt, t);
    this.line.record(L.x, L.z);
    this.line.update(dt, t, () => {});

    // ---- 笛の気配
    this.fueT -= dt;
    if (this.fueT <= 0) {
      this.fueT = 9;
      // 目の前にいるときは鳴らさない（遠くから呼ぶための笛）
      if (dist(L.x, L.z, p.x, p.z) > 22) c.bus.emit("omen", { kind: this.def.announce, x: L.x, y: 2, z: L.z, strength: 1 });
    }

    // ---- 並んで歩く
    const near = this.nearest(p.x, p.z) < NEAR;
    const moving = Math.hypot(p.vx, p.vz) > 1.2;
    if (near && !this.greeted) {
      this.greeted = true;
      L.happy();
      c.bus.emit("toast", { text: "小さな行列「おや、立派な百鬼夜行だ。いっしょに歩こうか」" });
    }
    if (near && moving) this.together += dt;
    else this.together = Math.max(0, this.together - dt * 0.35);
    const step = Math.floor((this.together / NEED_TOGETHER) * 10);
    if (step !== this.shown) {
      this.shown = step;
      c.bus.emit("encounterProgress", {
        id: this.id, title: this.def.title, p: step > 0 ? this.together / NEED_TOGETHER : -1,
        label: this.phase === "walk" ? "並んで歩く" : "輪に加わる",
      });
    }
    if (this.together >= (this.phase === "festival" ? 5 : NEED_TOGETHER)) return this.startMerge();
    return "running";
  }

  private nearest(px: number, pz: number) {
    let d = dist(this.leader.x, this.leader.z, px, pz);
    for (let i = 0; i < this.members.length; i += 2) d = Math.min(d, dist(this.members[i].x, this.members[i].z, px, pz));
    return d;
  }

  private startMerge(): EncounterStatus {
    this.phase = "merge";
    this.mergeT = 0.4;
    this.ctx.bus.emit("miniParadeMerge", { id: this.id, n: this.size, x: this.leader.x, z: this.leader.z });
    return "running";
  }

  /** 二つの行列が合流：先頭から順に、本体の最後尾へ */
  private updateMerge(dt: number, t: number): EncounterStatus {
    const c = this.ctx;
    // 先頭が本体へ加わったあとは、残りの列がその後を追って本体へ流れ込む
    this.line.record(this.leader.x, this.leader.z);
    this.line.update(dt, t, () => {});
    this.mergeT -= dt;
    if (this.mergeT > 0) return "running";
    this.mergeT = 0.22;
    if (!this.leaderAdopted) {
      this.leaderAdopted = true;
      this.owned.release(this.leader);
      c.wild.adopt(this.leader, this.leaderType);
      return "running";
    }
    const f = this.line.followers.shift();
    if (!f) return "complete";
    this.owned.release(f.actor);
    c.wild.adopt(f.actor, f.actor.typeId);
    return this.line.followers.length ? "running" : "complete";
  }

  dispose() {
    this.owned.dispose();
    this.line.followers.length = 0;
  }

  status() {
    return `${this.route.id} ${this.phase} 並走${this.together.toFixed(1)}s 妖${this.size}`;
  }
}
