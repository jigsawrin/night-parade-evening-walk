import { Actor } from "../../characters/Actor";
import type { EncounterDef, EncounterSite, OmenKind } from "../../data/encounters";
import { OwnedResources } from "./Owned";
import { dist, type EncounterContext, type EncounterRuntime, type EncounterStatus } from "./types";

interface Lamp {
  x: number;
  z: number;
  off: Actor | null;
  lit: Actor | null;
}

/**
 * 消えた提灯を順番に灯す。次に灯すべき提灯だけがゆらゆら揺れて、灯りをこぼす。
 * すべて灯すと、提灯たちが提灯お化けとなって行列に加わる。
 * 行列へ加わった提灯は所有権を手放す。消えたままの提灯・灯ったが未加入の提灯は dispose で片付く。
 */
export class LanternRelay implements EncounterRuntime {
  readonly omen: OmenKind;
  private lamps: Lamp[] = [];
  private next = 0;
  private flickerT = 0;
  private wrongCd = 0;
  private idleT = 0;
  private joinT = 0;
  private joined = 0;
  private owned = new OwnedResources();

  constructor(readonly id: number, readonly def: EncounterDef, site: EncounterSite, private ctx: EncounterContext) {
    this.omen = def.announce;
    const n = def.size[0] + ctx.rng.int(def.size[1] - def.size[0] + 1);
    const base = ctx.rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      // 順番は輪の上を飛び飛びに（隣どうしではない）→ 路地を行き来する
      const k = (i * 2) % n + (n % 2 === 0 && i * 2 >= n ? 1 : 0);
      const a = base + (k / n) * Math.PI * 2;
      const r = 7 + ctx.rng.range(0, 3);
      const q = ctx.world.nearestWalkable(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
      const off = new Actor(ctx.factory, "chochin", "lantern_off");
      this.owned.own(off, () => off.dispose());
      off.family = "SPECIAL";
      off.setPos(q.x, 1.2, q.z);
      off.groundY = 0;
      off.shadow.setEnabled(false);
      off.mesh.position.set(q.x, 1.2, q.z);
      this.lamps.push({ x: q.x, z: q.z, off, lit: null });
    }
  }

  get x() {
    return this.lamps[Math.min(this.next, this.lamps.length - 1)].x;
  }
  get z() {
    return this.lamps[Math.min(this.next, this.lamps.length - 1)].z;
  }

  update(dt: number, t: number): EncounterStatus {
    const c = this.ctx;
    const p = c.player;
    if (this.wrongCd > 0) this.wrongCd -= dt;
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      if (l.off) {
        // 次に灯すべき提灯だけ大きく揺れる
        const sway = i === this.next ? 0.22 : 0.05;
        l.off.mesh.rotation.z = Math.sin(t * (i === this.next ? 4 : 1.5) + l.off.seed) * sway;
        l.off.mesh.position.set(l.x, 1.2, l.z);
      }
      if (l.lit) {
        l.lit.face(p.x - l.lit.x, p.z - l.lit.z, dt, 3);
        l.lit.speed = 0;
        l.lit.animate(dt, t);
      }
    }

    if (this.next < this.lamps.length) {
      const cur = this.lamps[this.next];
      this.flickerT -= dt;
      if (this.flickerT <= 0 && dist(cur.x, cur.z, p.x, p.z) < 80) {
        this.flickerT = 1.4;
        c.bus.emit("omen", { kind: "lantern", x: cur.x, y: 1.8, z: cur.z, strength: 0.35 });
      }
      if (dist(cur.x, cur.z, p.x, p.z) < 3.4) {
        this.light(cur);
        this.next++;
        this.idleT = 0;
        c.bus.emit("encounterProgress", { id: this.id, title: this.def.title, p: this.next / this.lamps.length, label: "提灯を灯す" });
      } else if (this.wrongCd <= 0) {
        for (let i = this.next + 1; i < this.lamps.length; i++) {
          const l = this.lamps[i];
          if (dist(l.x, l.z, p.x, p.z) < 3) {
            this.wrongCd = 5;
            c.bus.emit("toast", { text: "ぷすっ…この提灯ではないらしい。揺れている提灯から順に" });
            break;
          }
        }
      }
      this.idleT += dt;
      if (this.idleT > 150 && dist(cur.x, cur.z, p.x, p.z) > 100) return "expired";
      return "running";
    }

    // すべて灯った：提灯お化けとなって順に加わる
    this.joinT -= dt;
    if (this.joinT <= 0 && this.joined < this.lamps.length) {
      this.joinT = 0.3;
      const l = this.lamps[this.joined++];
      const a = l.lit!;
      l.lit = null;
      this.owned.release(a);
      c.wild.adopt(a, "chochin");
    }
    return this.joined >= this.lamps.length ? "complete" : "running";
  }

  private light(l: Lamp) {
    const c = this.ctx;
    if (l.off) this.owned.disposeOne(l.off);
    l.off = null;
    const a = new Actor(c.factory, "chochin");
    this.owned.own(a, () => a.dispose());
    a.setPos(l.x, 0.6, l.z);
    a.groundY = 0;
    a.pop();
    l.lit = a;
    c.bus.emit("reveal", { type: "chochin", x: l.x, y: 0.8, z: l.z });
  }

  dispose() {
    this.owned.dispose();
    for (const l of this.lamps) l.off = l.lit = null;
  }

  status() {
    return `提灯 ${this.next}/${this.lamps.length}`;
  }
}
