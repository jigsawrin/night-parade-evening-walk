import { Actor } from "../../characters/Actor";
import type { ModelFactory } from "../../characters/ModelFactory";
import type { World } from "../../world/World";
import type { Rng } from "../../core/seed";
import { dampAngle, toKanji } from "../../core/util";
import { YOKAI } from "../../data/yokaiTypes";
import { aweModifiers, resistsPurge } from "../legends/LegendRules";
import { BARRIER, ONMYOJI_CFG as C, ONMYOJI_GATE, ONMYOJI_GUARDS, type AweReason, type OnmyojiGuardDef } from "../../data/onmyoji";
import { aweNeed, guardArrives, inSight, onmyojiAwe, purgeCount, routText, suspicionRate } from "./OnmyojiRules";
import type { GameBus } from "../events";
import type { Parade } from "../Parade";
import type { Player } from "../Player";
import type { WildYokai } from "../WildYokai";

type GuardState = "hidden" | "arrive" | "patrol" | "look" | "suspect" | "cast" | "form" | "barrier" | "flee" | "routed";

export interface OnmyojiGuard {
  def: OnmyojiGuardDef;
  actor: Actor;
  state: GuardState;
  /** 怪しさ（0..1。1 で見つかる） */
  sus: number;
  timer: number;
  /** 見張りに戻るまで（この間は見ない） */
  cooldown: number;
  wp: number;
  /** 立ち止まって左右を見るときの基準の向き */
  baseYaw: number;
  /** 直近の視線判定で主人公が見えていたか */
  seen: boolean;
  /** 結界の持ち場 */
  tx: number;
  tz: number;
}

export interface OnmyojiDeps {
  factory: ModelFactory;
  world: World;
  bus: GameBus;
  parade: Parade;
  player: Player;
  wild: WildYokai;
  /** 見廻りの間・結界の休みの揺らぎ（?seed= で再現する） */
  rng: Rng;
  /** 今の行列の顔ぶれ（低頻度で数えたもの） */
  counts: () => ReadonlyMap<string, number>;
  /** 賑わいの段（0..4） */
  momentumLevel: () => number;
}

const ACTIVE: ReadonlySet<GuardState> = new Set(["arrive", "patrol", "look", "suspect", "cast", "form", "barrier"]);
const WATCHING: ReadonlySet<GuardState> = new Set(["patrol", "look", "suspect", "cast"]);

/**
 * 陰陽師（見廻りの高位版）：神社の手前・参道を守る。戦闘はない。
 *  - 視野（前方の扇形＋すぐそば）に主人公が入り、遮るもの（家・木・灯籠）がないと「怪しさ」が溜まる → 振り向く → 詠唱 → 祓う
 *  - 詠唱の間に視線を切れば外れる。祓われた妖怪は行列から離れ、町のどこかへ散る（触れれば戻る）
 *  - 二人以上いると、参道に合体魔法陣（結界）を張ることがある。外から踏み込むと祓われる。脇から回るか、消えるのを待つ
 *  - 百鬼夜行の威光（五十妖／二人以上なら八十妖・大妖怪・狐の一族・熱狂）があれば、逆に退散する
 * ゲームルールは GameBus にイベントを流すだけ（魔法陣・音・一言は ParadePresentationDirector 側）。
 */
export class OnmyojiGuards {
  readonly guards: OnmyojiGuard[] = [];
  /** 退散させた（今夜はもう現れない） */
  routed: AweReason | null = null;
  /** 今の威光（null = まだ敵わない） */
  awe: AweReason | null = null;
  /** 連れている妖怪の、陰陽師を弱める効き目（データの awe：slowCast・lowerSuspicion） */
  private mods = { castScale: 1, suspicionScale: 1 };
  private d: OnmyojiDeps;
  private aweT = 0;
  private visionT = 0;
  private bPhase: "rest" | "form" | "on" = "rest";
  private bT = 8;
  private casters: OnmyojiGuard[] = [];
  /** 結界が張られたとき、主人公が既に中にいたか（中から出て、また外から踏み込んだときだけ祓う） */
  private bInside = false;
  private bWarned = 0;
  private bWarnedThis = false;
  private metFirst = false;
  private purges = 0;

  constructor(d: OnmyojiDeps) {
    this.d = d;
    for (const def of ONMYOJI_GUARDS) {
      const a = new Actor(d.factory, "onmyoji");
      a.scale = 1.12;
      const [x, z] = def.post;
      a.setPos(x, 0, z);
      a.yaw = Math.PI;
      a.animate(0.016, 0);
      const g: OnmyojiGuard = { def, actor: a, state: "hidden", sus: 0, timer: 0, cooldown: 0, wp: 0, baseYaw: Math.PI, seen: false, tx: x, tz: z };
      if (def.arrive) a.setVisible(false);
      else g.state = "patrol";
      this.guards.push(g);
    }
  }

  /** 今いる（退散していない）陰陽師の数 */
  get present() {
    let n = 0;
    for (const g of this.guards) if (ACTIVE.has(g.state)) n++;
    return n;
  }

  get barrierPhase() {
    return this.bPhase;
  }

  /** @param progress 夜の進み具合（0..1） */
  update(dt: number, t: number, progress: number) {
    const { player } = this.d;
    const px = player.x, pz = player.z;

    // 低頻度：増援・威光
    this.aweT -= dt;
    if (this.aweT <= 0) {
      this.aweT = 1;
      this.checkArrivals(progress);
      const present = this.present;
      this.awe = onmyojiAwe({ present, total: this.d.parade.total, counts: this.d.counts(), momentumLevel: this.d.momentumLevel() });
      this.mods = aweModifiers(this.d.counts());
      if (this.awe && present > 0 && this.feelsAwe(px, pz)) this.rout(this.awe);
      if (!this.metFirst && !this.awe) {
        const g = this.guards.find((q) => ACTIVE.has(q.state) && Math.hypot(q.actor.x - px, q.actor.z - pz) < 30);
        if (g) {
          this.metFirst = true;
          this.d.bus.emit("toast", { text: "参道に陰陽師がいる…見つかると、妖怪が祓われてしまう" });
        }
      }
    }

    // 低頻度：視線
    this.visionT -= dt;
    if (this.visionT <= 0) {
      const tick = C.tick - this.visionT;
      this.visionT = C.tick;
      this.vision(tick, px, pz);
    }

    this.updateBarrier(dt, px, pz);
    for (const g of this.guards) this.move(g, dt, t, px, pz);
  }

  private checkArrivals(progress: number) {
    if (this.routed) return;
    for (const g of this.guards) {
      if (g.state !== "hidden" || !g.def.arrive) continue;
      if (!guardArrives(g.def.arrive, this.d.parade.total, progress)) continue;
      const [x, z] = ONMYOJI_GATE;
      g.actor.setPos(x, 0, z);
      g.actor.setVisible(true);
      g.actor.pop();
      g.state = "arrive";
      this.d.bus.emit("onmyojiArrive", { id: g.def.id, x, z, first: false, present: this.present });
    }
  }

  /** 威光を感じる距離まで百鬼夜行が来たか */
  private feelsAwe(px: number, pz: number) {
    if (Math.hypot(px - BARRIER.x, pz - BARRIER.z) < C.aweRange) return true;
    return this.guards.some((g) => ACTIVE.has(g.state) && Math.hypot(g.actor.x - px, g.actor.z - pz) < C.aweRange);
  }

  private rout(reason: AweReason) {
    const n = this.present;
    let x = 0, z = 0;
    for (const g of this.guards) {
      if (!ACTIVE.has(g.state)) continue;
      x += g.actor.x / n;
      z += g.actor.z / n;
      g.state = "flee";
      g.sus = 0;
      g.actor.surprise();
    }
    this.endBarrier(false);
    this.routed = reason;
    this.d.bus.emit("toast", { text: routText(reason) });
    this.d.bus.emit("onmyojiRout", { reason, n, x, z });
  }

  private vision(tick: number, px: number, pz: number) {
    const { world, player } = this.d;
    const blind = this.awe !== null || player.invuln > 0;
    for (const g of this.guards) {
      if (g.cooldown > 0) g.cooldown -= tick;
      if (!WATCHING.has(g.state)) continue;
      const a = g.actor;
      const dist = Math.hypot(px - a.x, pz - a.z);
      g.seen = !blind && g.cooldown <= 0 && inSight(a.x, a.z, a.yaw, px, pz) && world.lineOfSight(a.x, a.z, px, pz);
      if (g.state === "cast") continue;
      if (g.seen) {
        g.sus = Math.min(1, g.sus + suspicionRate(dist) * this.mods.suspicionScale * tick);
        if (g.state !== "suspect" && g.sus >= C.noticeAt) {
          g.state = "suspect";
          a.surprise();
          this.d.bus.emit("onmyojiNotice", { id: g.def.id, x: a.x, z: a.z });
        }
        if (g.state === "suspect" && g.sus >= 1) {
          g.state = "cast";
          g.timer = C.castSec * this.mods.castScale;
          this.d.bus.emit("onmyojiCast", { id: g.def.id, x: a.x, z: a.z });
        }
      } else {
        g.sus = Math.max(0, g.sus - C.drain * tick);
        if (g.state === "suspect" && g.sus <= 0) g.state = "patrol";
      }
    }
  }

  /** 祓う：行列の後ろから何妖かが離れ、町のどこかへ散る（大妖怪以上は祓われない） */
  private purge(g: OnmyojiGuard, barrier: boolean) {
    const { parade, player, wild, bus } = this.d;
    const actors = parade.purge(purgeCount(parade.count), (a) => resistsPurge(YOKAI[a.typeId]));
    const pts = actors.map((a) => ({ x: a.x, z: a.z }));
    for (const a of actors) wild.rehome(a, BARRIER.x, BARRIER.z);
    player.invuln = C.invuln;
    for (const q of this.guards) {
      q.sus = 0;
      q.cooldown = Math.max(q.cooldown, 3);
    }
    g.cooldown = C.cooldown;
    this.purges++;
    bus.emit("onmyojiPurge", { id: g.def.id, n: actors.length, x: g.actor.x, z: g.actor.z, pts, barrier });
    // 何妖あれば怯むのか、陰陽師の口から（二度目以降はときどき）
    if (this.purges === 1 || this.purges % 3 === 0) {
      bus.emit("toast", { text: `陰陽師「${toKanji(aweNeed(this.present))}妖にも満たぬ百鬼夜行など、祓ってくれる」` });
    }
  }

  private updateBarrier(dt: number, px: number, pz: number) {
    const { bus, player } = this.d;
    const B = BARRIER;
    const dc = Math.hypot(px - B.x, pz - B.z);
    if (this.bPhase === "rest") {
      this.bT -= dt;
      if (this.bT > 0 || this.awe || this.routed || dc > B.trigger || dc < B.r + 2) return;
      const free = this.guards.filter((g) => g.state === "patrol" || g.state === "look");
      if (free.length < 2 || this.present < 2) return;
      free.sort((a, b) => Math.hypot(a.actor.x - B.x, a.actor.z - B.z) - Math.hypot(b.actor.x - B.x, b.actor.z - B.z));
      this.casters = free.slice(0, 2);
      this.casters.forEach((g, i) => {
        g.state = "form";
        g.tx = B.x + (i === 0 ? -1 : 1) * (B.r + 0.9);
        g.tz = B.z;
        g.sus = 0;
      });
      this.bPhase = "form";
      this.bT = B.formSec;
      this.bWarnedThis = false;
      bus.emit("onmyojiBarrier", { phase: "form", x: B.x, z: B.z, r: B.r, casters: this.casters.map((g) => g.def.id) });
      return;
    }
    if (this.casters.some((g) => g.state !== "form" && g.state !== "barrier")) {
      this.endBarrier(true);
      return;
    }
    if (this.bPhase === "form") {
      this.bT -= dt;
      const ready = this.casters.every((g) => Math.hypot(g.actor.x - g.tx, g.actor.z - g.tz) < 0.6);
      if (!ready && this.bT > 0) return;
      for (const g of this.casters) g.state = "barrier";
      this.bPhase = "on";
      this.bT = B.sec;
      this.bInside = dc < B.r;
      bus.emit("onmyojiBarrier", { phase: "on", x: B.x, z: B.z, r: B.r, casters: this.casters.map((g) => g.def.id) });
      return;
    }
    // 張られている
    this.bT -= dt;
    const inside = dc < B.r;
    if (inside && !this.bInside && player.invuln <= 0) {
      this.purge(this.casters[0], true);
      this.endBarrier(true);
      return;
    }
    if (!inside) this.bInside = false;
    // 近づいたら一言（一つの結界につき一度、一夜に二度まで）
    if (dc < B.r + 4 && !this.bInside && !this.bWarnedThis && this.bWarned < 2) {
      this.bWarned++;
      this.bWarnedThis = true;
      bus.emit("toast", { text: "結界が参道を塞いでいる…脇から回るか、消えるのを待とう" });
    }
    if (this.bT <= 0) this.endBarrier(true);
  }

  private endBarrier(rest: boolean) {
    if (this.bPhase === "rest") return;
    const B = BARRIER;
    for (const g of this.casters) {
      if (g.state === "form" || g.state === "barrier") {
        g.state = "patrol";
        g.cooldown = Math.max(g.cooldown, 2);
      }
    }
    this.d.bus.emit("onmyojiBarrier", { phase: "off", x: B.x, z: B.z, r: B.r, casters: this.casters.map((g) => g.def.id) });
    this.casters = [];
    this.bPhase = "rest";
    this.bT = rest ? this.d.rng.range(B.rest[0], B.rest[1]) : 9999;
  }

  private move(g: OnmyojiGuard, dt: number, t: number, px: number, pz: number) {
    if (g.state === "hidden") return;
    const a = g.actor;
    let tx = a.x, tz = a.z, sp = 0;
    switch (g.state) {
      case "arrive":
        [tx, tz] = g.def.post;
        sp = C.walk * 1.4;
        if (Math.hypot(tx - a.x, tz - a.z) < 0.8) g.state = "patrol";
        break;
      case "patrol": {
        const p = g.def.patrol[g.wp];
        [tx, tz] = p;
        sp = C.walk;
        if (Math.hypot(tx - a.x, tz - a.z) < 0.6) {
          g.state = "look";
          g.timer = this.d.rng.range(C.lookSec[0], C.lookSec[1]);
          g.baseYaw = a.yaw;
        }
        break;
      }
      case "look":
        // 立ち止まって左右を見る
        g.timer -= dt;
        a.yaw = dampAngle(a.yaw, g.baseYaw + Math.sin(g.timer * 1.7) * 0.95, 4, dt);
        if (g.timer <= 0) {
          g.wp = (g.wp + 1) % g.def.patrol.length;
          g.state = "patrol";
        }
        break;
      case "suspect":
        a.face(px - a.x, pz - a.z, dt, 3.2);
        break;
      case "cast":
        a.face(px - a.x, pz - a.z, dt, 6);
        g.timer -= dt;
        if (g.timer <= 0) {
          const dist = Math.hypot(px - a.x, pz - a.z);
          if (g.seen && dist < C.castRange && this.d.player.invuln <= 0 && !this.awe) this.purge(g, false);
          else {
            g.cooldown = C.missCooldown;
            this.d.bus.emit("onmyojiMiss", { id: g.def.id, x: a.x, z: a.z });
          }
          g.sus = 0;
          g.state = "patrol";
        }
        break;
      case "form":
        tx = g.tx;
        tz = g.tz;
        sp = C.walk * 2;
        break;
      case "barrier":
        a.face(BARRIER.x - a.x, BARRIER.z - a.z, dt, 4);
        break;
      case "flee": {
        [tx, tz] = g.def.flee;
        sp = 6.5;
        if (Math.hypot(tx - a.x, tz - a.z) < 1) g.state = "routed";
        break;
      }
      case "routed":
        // 遠巻きに、恐る恐る百鬼夜行を見送る
        a.face(px - a.x, pz - a.z, dt, 2);
        if (Math.random() < dt * 0.25) a.surprise();
        break;
    }
    const mx = tx - a.x, mz = tz - a.z;
    const md = Math.hypot(mx, mz);
    if (sp > 0 && md > 0.2) {
      const step = Math.min(md, sp * dt);
      const p = { x: a.x + (mx / md) * step, z: a.z + (mz / md) * step };
      this.d.world.resolve(p, 0.45);
      a.face(mx, mz, dt, 6);
      a.speed = Math.hypot(p.x - a.x, p.z - a.z) / Math.max(dt, 1e-4);
      a.x = p.x;
      a.z = p.z;
    } else a.speed = 0;
    a.y = this.d.world.groundHeight(a.x, a.z);
    a.groundY = a.y;
    a.animate(dt, t);
  }

  /** デバッグ：まだ出ていない陰陽師を呼び、結界をすぐ張れるようにする */
  debugArrive() {
    for (const g of this.guards) if (g.state === "hidden" && g.def.arrive) g.def = { ...g.def, arrive: { total: 0 } };
    this.aweT = 0;
    if (this.bPhase === "rest") this.bT = 0;
  }

  /** HUD の「！」：怪しんでいる・詠唱している陰陽師 */
  alerting(): OnmyojiGuard | null {
    let best: OnmyojiGuard | null = null;
    for (const g of this.guards) if ((g.state === "suspect" || g.state === "cast") && (!best || g.sus > best.sus)) best = g;
    return best;
  }

  /** 近くの陰陽師（HUD の一言） */
  nearest(px: number, pz: number, r: number): OnmyojiGuard | null {
    let best: OnmyojiGuard | null = null;
    let bd = r;
    for (const g of this.guards) {
      if (g.state === "hidden") continue;
      const d = Math.hypot(g.actor.x - px, g.actor.z - pz);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  /** 写真から隠す NPC */
  actors() {
    return this.guards.filter((g) => g.state !== "hidden").map((g) => g.actor);
  }

  debug() {
    const s = this.guards.map((g) => `${g.def.id}:${g.state}${g.sus > 0 ? `(${g.sus.toFixed(1)})` : ""}`).join(" ");
    return `陰陽師 ${s}　結界 ${this.bPhase} ${Math.max(0, this.bT).toFixed(0)}s　威光 ${this.awe ?? "-"}${this.routed ? `　退散（${this.routed}）` : ""}`;
  }
}
