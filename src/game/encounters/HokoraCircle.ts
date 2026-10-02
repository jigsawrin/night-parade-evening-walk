import type { InstancedMesh } from "../../core/babylon";
import type { EncounterDef, EncounterSite, OmenKind } from "../../data/encounters";
import { CircleTracker } from "../CircleTracker";
import { composeGroup } from "../EventDeck";
import { OwnedResources } from "./Owned";
import { dist, type EncounterContext, type EncounterRuntime, type EncounterStatus } from "./types";

/**
 * 見覚えのない小さな祠。一定の行列で周りを一周すると、祠に棲む妖怪たちが出てくる。
 * 祠と一時コライダーは、成就しても・気配が薄れても dispose() で必ず片付く（山札は再循環するので残さない）。
 */
export class HokoraCircle implements EncounterRuntime {
  readonly id: number;
  readonly def: EncounterDef;
  readonly omen: OmenKind;
  readonly x: number;
  readonly z: number;
  /** 祠の小道具と一時コライダー */
  readonly owned = new OwnedResources();
  private ctx: EncounterContext;
  private tracker: CircleTracker;
  private need: number;
  private shown = -1;
  private warnCd = 0;
  private idleT = 0;
  private suzuT = 0;

  constructor(id: number, def: EncounterDef, site: EncounterSite, ctx: EncounterContext) {
    this.id = id;
    this.def = def;
    this.ctx = ctx;
    this.omen = def.announce;
    const q = ctx.world.nearestWalkable(site.x, site.z, 3);
    this.x = q.x;
    this.z = q.z;
    const prop: InstancedMesh = ctx.factory.instance("hokora", "hokora");
    prop.position.set(q.x, 0, q.z);
    prop.rotation.y = ctx.rng.range(0, Math.PI * 2);
    this.owned.own(prop, () => prop.dispose());
    const removeCollider = ctx.world.addCircle(q.x, q.z, 0.9);
    this.owned.own(removeCollider, removeCollider);
    this.tracker = new CircleTracker(q.x, q.z, 2.2, 11);
    this.need = def.needFollowers ?? 8;
  }

  update(dt: number): EncounterStatus {
    const c = this.ctx;
    const p = c.player;
    if (this.warnCd > 0) this.warnCd -= dt;
    // 祠の鈴がときどき鳴る
    this.suzuT -= dt;
    if (this.suzuT <= 0 && dist(this.x, this.z, p.x, p.z) < 60) {
      this.suzuT = 7;
      c.bus.emit("omen", { kind: "suzu", x: this.x, y: 1.2, z: this.z, strength: 0.4 });
    }
    const prog = this.tracker.update(p.x, p.z);
    if (prog < 0) {
      if (this.shown >= 0) c.bus.emit("encounterProgress", { id: this.id, title: this.def.title, p: -1 });
      this.shown = -1;
      this.idleT += dt;
      if (this.idleT > 200 && dist(this.x, this.z, p.x, p.z) > 100) return "expired";
      return "running";
    }
    this.idleT = 0;
    if (c.parade.count < this.need) {
      if (this.warnCd <= 0) {
        this.warnCd = 8;
        c.bus.emit("toast", { text: `祠「もう少し賑やかな行列で回っておくれ（${this.need}妖ほど）」` });
      }
      this.tracker.reset();
      return "running";
    }
    const step = Math.floor(prog * 20);
    if (step !== this.shown && prog > 0.05) {
      this.shown = step;
      c.bus.emit("encounterProgress", { id: this.id, title: this.def.title, p: prog, label: "祠の周りを一周" });
    }
    if (prog >= 1) {
      const n = this.def.size[0] + c.rng.int(this.def.size[1] - this.def.size[0] + 1);
      const types = composeGroup(this.def.members, n, c.theme, c.typeCounts, c.rng, c.typeBias);
      types.forEach((type, i) => {
        const a = (i / n) * Math.PI * 2;
        c.wild.spawnWild(type, this.x + Math.cos(a) * 3.2, this.z + Math.sin(a) * 3.2, { kind: "touch" }, 2);
      });
      c.bus.emit("toast", { text: "祠の扉がかたりと開き、妖怪たちが顔を出した" });
      // 祠は役目を終えて煙とともに消える（小道具・コライダーは dispose() で片付く）
      c.bus.emit("reveal", { type: "hokora", x: this.x, y: 0.6, z: this.z });
      return "complete";
    }
    return "running";
  }

  dispose() {
    this.owned.dispose();
  }

  status() {
    return `祠 ${Math.round(Math.max(0, this.shown) * 5)}%`;
  }
}
