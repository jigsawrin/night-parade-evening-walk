import type { EncounterDef, EncounterSite, OmenKind } from "../../data/encounters";
import { composeGroup } from "../EventDeck";
import type { Wild } from "../WildYokai";
import { dist, type EncounterContext, type EncounterRuntime, type EncounterStatus } from "./types";

/**
 * 団子を欲しがる妖怪の集団。一匹ごとに団子が要る → 団子屋へ寄り道して戻ってくる遊び。
 * 途中で離れても罰はない。妖怪は町に残り、いつでも続きができる。
 */
export class HungryGroup implements EncounterRuntime {
  readonly omen: OmenKind;
  x: number;
  z: number;
  private members: Wild[] = [];
  private fed = 0;
  private idleT = 0;

  constructor(readonly id: number, readonly def: EncounterDef, site: EncounterSite, private ctx: EncounterContext) {
    this.omen = def.announce;
    this.x = site.x;
    this.z = site.z;
    const n = def.size[0] + ctx.rng.int(def.size[1] - def.size[0] + 1);
    const types = composeGroup(def.members, n, ctx.theme, ctx.typeCounts, ctx.rng, ctx.typeBias);
    types.forEach((type, i) => {
      const a = (i / n) * Math.PI * 2;
      const w = ctx.wild.spawnWild(type, site.x + Math.cos(a) * 2.2, site.z + Math.sin(a) * 2.2, { kind: "food" }, 1.5, false);
      if (w) this.members.push(w);
    });
  }

  update(dt: number): EncounterStatus {
    const left = this.members.filter((w) => this.ctx.wild.alive(w));
    const fed = this.members.length - left.length;
    if (fed !== this.fed) {
      this.fed = fed;
      this.idleT = 0;
      this.ctx.bus.emit("encounterProgress", { id: this.id, title: this.def.title, p: fed / this.members.length, label: "団子を配る" });
    }
    if (!left.length) return "complete";
    const p = this.ctx.player;
    // 長く放っておかれたら、山札の枠だけ空ける（妖怪は町に残る）
    this.idleT += dt;
    if (this.idleT > 240 && dist(p.x, p.z, this.x, this.z) > 90) return "expired";
    return "running";
  }

  dispose() {}

  status() {
    return `団子 ${this.fed}/${this.members.length}`;
  }
}
