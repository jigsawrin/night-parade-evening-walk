import type { NightSeed, Rng } from "../core/seed";
import { ENCOUNTERS, NIGHT_THEMES, type EncounterDef, type NightTheme } from "../data/encounters";
import { districtAt } from "../data/districts";
import { EventDeck } from "./EventDeck";
import { EncounterScheduler, type DealReason, type OfferOptions, type Placement, type Rumor, type SchedulerView } from "./EncounterScheduler";
import type { DistrictAwakeningSystem } from "./DistrictAwakeningSystem";
import type { EncounterContext, EncounterRuntime } from "./encounters/types";
import { settleEncounters } from "./encounters/lifecycle";
import { FoxfireTrail } from "./encounters/FoxfireTrail";
import { HokoraCircle } from "./encounters/HokoraCircle";
import { HungryGroup } from "./encounters/HungryGroup";
import { LanternRelay } from "./encounters/LanternRelay";
import { MiniParade } from "./encounters/MiniParade";

export type { DealReason } from "./EncounterScheduler";

/**
 * EncounterDirector：Encounter の中身（場に出す・進める・片付ける）を担当する。
 * 「いつ・何を・いくつ」は EncounterScheduler（間・同時数・噂・分かれ道・選択の偏り）が決める。
 *
 * 流れ：ParadeAttraction / NightPacing が求める → 噂（遠くの音・光）だけを出す →
 *       プレイヤーが自分で近づく → 本物の Encounter へ昇格 → 軽い攻略 → 加入。
 * Encounter は complete / expired のどちらでも dispose() される（一時コライダー・小道具を残さない）。
 */
export class EncounterDirector {
  readonly scheduler: EncounterScheduler;
  readonly theme: NightTheme;
  active: EncounterRuntime[] = [];
  started = 0;
  completed = 0;
  miniMerged = 0;
  private nextId = 1;
  private slowT = 0;
  /** 場に出ている Encounter → 使っている場所 */
  private siteOf = new Map<EncounterRuntime, string>();
  private rng: Rng;
  private ctx: EncounterContext;
  private districts: DistrictAwakeningSystem;

  constructor(base: Omit<EncounterContext, "rng" | "theme" | "typeBias">, seed: NightSeed, districts: DistrictAwakeningSystem) {
    this.districts = districts;
    this.scheduler = new EncounterScheduler(new EventDeck(ENCOUNTERS, seed.stream("deck")), seed.stream("schedule"));
    this.theme = seed.stream("theme").weighted(NIGHT_THEMES, (t) => t.weight)!;
    this.rng = seed.stream("encounter");
    this.ctx = { ...base, rng: this.rng, theme: this.theme.type, typeBias: this.scheduler.typeBias };
    base.bus.on("miniParadeMerge", () => this.miniMerged++);
  }

  get deck() {
    return this.scheduler.deck;
  }
  get rumors(): readonly Rumor[] {
    return this.scheduler.rumors;
  }
  get lastDealT() {
    return this.scheduler.lastDealT;
  }
  maxActive(total: number) {
    return this.scheduler.maxActive(total);
  }
  breathing(t: number) {
    return this.scheduler.breathing(t);
  }

  update(dt: number, t: number) {
    settleEncounters(this.active, dt, t, (e, st) => {
      this.siteOf.delete(e);
      this.scheduler.onSettled(t, e.def, st);
      if (st === "complete") {
        this.completed++;
        this.ctx.bus.emit("encounterComplete", { id: e.id, kind: e.def.kind, title: e.def.title, x: e.x, z: e.z });
      } else {
        this.ctx.bus.emit("encounterEnd", {
          id: e.id, title: e.def.title,
          text: e.def.kind === "miniParade" ? "小さな行列は、夜道の向こうへ去っていった…" : "気配は、いつの間にか薄れていった",
        });
      }
      this.ctx.bus.emit("encounterProgress", { id: e.id, title: e.def.title, p: -1 });
    });

    // 噂は低頻度で：気配（音・光）・昇格・消滅
    this.slowT -= dt;
    if (this.slowT > 0) return;
    this.slowT = 0.25;
    const tick = this.scheduler.update(this.view(t));
    for (const r of tick.faded) this.ctx.bus.emit("rumorFade", { id: r.id });
    for (const r of tick.omens) this.ctx.bus.emit("omen", { kind: r.omen, x: r.x, y: 2, z: r.z, strength: 0.75, source: "rumor" });
    if (tick.promoted) this.start(tick.promoted.rumor.def, tick.promoted.rumor, t, true);
  }

  /**
   * 求めに応じて噂を出す（間・同時数の範囲で）。出せなければ空。
   * 地区覚醒の直後は間をとる（覚醒そのものが大きな出来事）。
   */
  request(t: number, reason: DealReason, opt: OfferOptions = {}): readonly Rumor[] {
    const rs = this.scheduler.offer(this.view(t), reason, opt);
    rs.forEach((r, i) => {
      this.ctx.bus.emit("rumor", { id: r.id, kind: r.def.kind, omen: r.omen, text: r.def.text, x: r.x, z: r.z, choice: rs.length > 1, delay: i * 4.5 });
    });
    return rs;
  }

  /** 地区が目覚めた：長めの間。その後、その地区の出来事が噂になりやすい */
  onAwaken(t: number, id: string) {
    this.scheduler.onAwaken(t, id);
  }

  /** 最終手段：長く迷っているとき、いちばん近い噂を本物の Encounter にする */
  forcePromote(t: number) {
    const p = this.scheduler.forcePromote(this.view(t));
    if (!p) return null;
    return this.start(p.rumor.def, p.rumor, t, true);
  }

  /** デバッグ：噂を経ずに、今すぐ一枚出す */
  debugDeal(t: number) {
    const d = this.scheduler.dealNow(this.view(t));
    return d ? this.start(d.def, d.place, t, false) : null;
  }

  private view(t: number): SchedulerView {
    const p = this.ctx.player;
    const sp = Math.hypot(p.vx, p.vz);
    return {
      t, px: p.x, pz: p.z,
      fx: sp > 0.5 ? p.vx / sp : 0, fz: sp > 0.5 ? p.vz / sp : 0,
      total: this.ctx.parade.total,
      activeKinds: this.active.map((a) => a.def.kind),
      busy: new Set(this.siteOf.values()),
      districtOf: (x, z) => districtAt(x, z)?.id ?? null,
      districtVisit: (id) => this.districts.visitTime(id),
    };
  }

  private start(def: EncounterDef, place: Placement, t: number, promoted: boolean) {
    const e = this.spawn(def, place);
    this.active.push(e);
    this.started++;
    this.scheduler.onStart(t, def);
    this.siteOf.set(e, place.site?.id ?? `route:${place.route!.id}`);
    this.ctx.bus.emit("encounterStart", { id: e.id, kind: def.kind, title: def.title, text: def.text, x: e.x, z: e.z, promoted });
    this.ctx.bus.emit("omen", { kind: def.announce, x: e.x, y: 2, z: e.z, strength: 1 });
    return e;
  }

  private spawn(d: EncounterDef, c: Placement): EncounterRuntime {
    const id = this.nextId++;
    switch (d.kind) {
      case "miniParade":
        return new MiniParade(id, d, c.route!, this.ctx);
      case "foxfireTrail":
        return new FoxfireTrail(id, d, c.site!, this.ctx);
      case "lanternRelay":
        return new LanternRelay(id, d, c.site!, this.ctx);
      case "hokoraCircle":
        return new HokoraCircle(id, d, c.site!, this.ctx);
      case "hungryGroup":
        return new HungryGroup(id, d, c.site!, this.ctx);
    }
  }

  /** 気配・誘導の向け先（場に出ている Encounter と、まだ噂のもの） */
  targets() {
    const out: { x: number; z: number; omen: Rumor["omen"]; kind: string; rumor: boolean }[] = [];
    for (const e of this.active) out.push({ x: e.x, z: e.z, omen: e.omen, kind: e.def.kind, rumor: false });
    for (const r of this.scheduler.rumors) out.push({ x: r.x, z: r.z, omen: r.omen, kind: r.def.kind, rumor: true });
    return out;
  }

  debug(t: number) {
    const act = this.active.map((e) => `${e.def.title}[${e.status()}]`).join(" / ") || "なし";
    return [
      `今宵：${this.theme.text}（${this.theme.type}）`,
      `場：${act}（枠 ${this.scheduler.occupied(this.active.length)}/${this.maxActive(this.ctx.parade.total)}）`,
      this.scheduler.debug(t),
      `山札：${this.deck.size}枚 次→${this.deck.peek(3).join(",")}`,
      `開始：${this.started} 成就：${this.completed} 合流：${this.miniMerged}`,
    ];
  }
}
