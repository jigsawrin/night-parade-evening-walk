import type { EncounterDef, EncounterSite, OmenKind } from "../../data/encounters";
import { composeGroup } from "../EventDeck";
import { dist, type EncounterContext, type EncounterRuntime, type EncounterStatus } from "./types";

const SPACING = 9;
const AHEAD = 3;

/**
 * 狐火を追う。狐火が数個、ぽっ、ぽっ、ぽっと順番に灯り、追いかけると次が灯る。
 * 最後の狐火の先で、妖怪の群れが姿を見せる（加入は触れてから）。
 */
export class FoxfireTrail implements EncounterRuntime {
  readonly omen: OmenKind;
  private points: { x: number; z: number }[] = [];
  private passed = 0;
  private shown = 0;
  private revealQueue: number[] = [];
  private revealT = 0;
  private pulseT = 0;
  private idleT = 0;
  private done = false;

  constructor(readonly id: number, readonly def: EncounterDef, site: EncounterSite, private ctx: EncounterContext) {
    this.omen = def.announce;
    const p = ctx.player;
    const dx = site.x - p.x, dz = site.z - p.z;
    const L = Math.hypot(dx, dz) || 1;
    // プレイヤーの少し先から、目的地へ向かって狐火を並べる（少しだけ蛇行）
    for (let d = 12; d < L - 4; d += SPACING) {
      const k = d / L;
      const wob = Math.sin(d * 0.21 + ctx.rng.range(0, 6)) * 2.5;
      const q = ctx.world.nearestWalkable(p.x + dx * k + (-dz / L) * wob, p.z + dz * k + (dx / L) * wob);
      this.points.push(q);
    }
    this.points.push(ctx.world.nearestWalkable(site.x, site.z));
    for (let i = 0; i < Math.min(AHEAD, this.points.length); i++) this.revealQueue.push(i);
  }

  get x() {
    return this.points[Math.min(this.passed, this.points.length - 1)].x;
  }
  get z() {
    return this.points[Math.min(this.passed, this.points.length - 1)].z;
  }

  update(dt: number): EncounterStatus {
    if (this.done) return "complete";
    const p = this.ctx.player;
    // ぽっ、ぽっ、ぽっ
    this.revealT -= dt;
    if (this.revealQueue.length && this.revealT <= 0) {
      const i = this.revealQueue.shift()!;
      this.shown = Math.max(this.shown, i + 1);
      const q = this.points[i];
      this.ctx.bus.emit("foxfire", { x: q.x, y: 1.6, z: q.z, last: i === this.points.length - 1 });
      this.revealT = 0.45;
    }
    // 灯っている狐火はゆらゆらと灯り続ける
    this.pulseT -= dt;
    if (this.pulseT <= 0) {
      this.pulseT = 1.7;
      for (let i = this.passed; i < this.shown; i++) {
        const q = this.points[i];
        if (dist(q.x, q.z, p.x, p.z) < 70) this.ctx.bus.emit("foxfire", { x: q.x, y: 1.6, z: q.z, last: false });
      }
    }
    // 近づいた狐火は消えて、その先が灯る
    for (let i = this.passed; i < this.shown; i++) {
      const q = this.points[i];
      if (dist(q.x, q.z, p.x, p.z) < (i === this.points.length - 1 ? 8 : 6.5)) {
        this.passed = i + 1;
        this.idleT = 0;
        const next = Math.min(this.points.length, this.passed + AHEAD);
        for (let j = this.shown; j < next; j++) if (!this.revealQueue.includes(j)) this.revealQueue.push(j);
        this.ctx.bus.emit("encounterProgress", { id: this.id, title: this.def.title, p: this.passed / this.points.length, label: "狐火を追う" });
      }
    }
    if (this.passed >= this.points.length) {
      this.arrive();
      return "complete";
    }
    this.idleT += dt;
    if (this.idleT > 100) return "expired";
    return "running";
  }

  private arrive() {
    this.done = true;
    const c = this.ctx;
    const n = this.def.size[0] + c.rng.int(this.def.size[1] - this.def.size[0] + 1);
    const types = composeGroup(this.def.members, n, c.theme, c.typeCounts, c.rng, c.typeBias);
    const end = this.points[this.points.length - 1];
    types.forEach((type, i) => {
      const a = (i / n) * Math.PI * 2 + 0.4;
      c.wild.spawnWild(type, end.x + Math.cos(a) * 4.5, end.z + Math.sin(a) * 4.5, { kind: "touch" }, 2);
    });
    c.bus.emit("toast", { text: "狐火の先に、妖怪たちが集まっていた。触れて仲間に迎えよう" });
  }

  dispose() {}

  status() {
    return `狐火 ${this.passed}/${this.points.length}`;
  }
}
