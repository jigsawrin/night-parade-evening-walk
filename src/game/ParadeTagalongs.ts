import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import type { World } from "../world/World";
import { pick, rand } from "../core/util";
import { anchorIndex, pickAnchor, tagalongCap } from "./TagalongRules";
import type { GameBus } from "./events";
import type { Parade } from "./Parade";
import type { Player } from "./Player";

type TagKind = "kid" | "dog";

interface Tagalong {
  actor: Actor;
  kind: TagKind;
  state: "off" | "follow" | "leave";
  /** 沿う場所（-1 = 主人公の斜め後ろ、0..1 = 行列の先頭〜最後尾） */
  anchor: number;
  side: 1 | -1;
  /** 行列からの横の距離 */
  off: number;
  /** 沿う場所を変えるまで */
  reT: number;
  /** 追いかけるのに飽きるまで */
  life: number;
  hopT: number;
  stuck: number;
  lx: number;
  lz: number;
}

const POOL_MAX = 8;
const KIDS = ["kid_a", "kid_b"];

/**
 * 大きな百鬼夜行（五十妖〜）を、子供や犬が走って追いかけてくる。
 * 行列には加えない（数えない・祓われない・散らない）。最後尾だけでなく、主人公の斜め後ろや行列の途中の横にも沿い、
 * ときどき場所を変え、しばらくすると飽きて帰っていく（また別の子が来る）。Actor は使い回す（最大 8）。
 * 見た目の賑やかしなので、抽選は Math.random でよい。
 */
export class ParadeTagalongs {
  readonly list: Tagalong[] = [];
  private checkT = 0;
  private spawnT = 2;
  private cap = 0;
  private first = true;
  private s = { x: 0, z: 0, dx: 0, dz: 0 };

  constructor(private factory: ModelFactory, private world: World, private bus: GameBus, private parade: Parade, private player: Player) {}

  update(dt: number, t: number) {
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 1;
      this.cap = tagalongCap(this.parade.total, this.cap > 0);
      const on = this.list.filter((g) => g.state === "follow");
      // 行列が小さくなったら、多すぎる分から帰っていく
      if (on.length > this.cap) {
        on.sort((a, b) => a.life - b.life);
        for (let i = 0; i < on.length - this.cap; i++) this.leave(on[i]);
      }
      this.spawnT -= 1;
      if (on.length < this.cap && this.spawnT <= 0) {
        this.spawn();
        this.spawnT = rand(3, 7);
      }
    }
    for (const g of this.list) if (g.state !== "off") this.move(g, dt, t);
  }

  private spawn() {
    const kind: TagKind = Math.random() < 0.3 ? "dog" : "kid";
    let g = this.list.find((q) => q.state === "off" && q.kind === kind);
    if (!g) {
      if (this.list.length >= POOL_MAX) return;
      const a = kind === "dog" ? new Actor(this.factory, "dog") : new Actor(this.factory, "villager", pick(KIDS));
      a.scale = kind === "dog" ? 0.9 : 0.84;
      g = { actor: a, kind, state: "off", anchor: 1, side: 1, off: 2, reT: 0, life: 0, hopT: 0, stuck: 0, lx: 0, lz: 0 };
      this.list.push(g);
    }
    // 最後尾のさらに後ろ、少し横から走ってくる
    const s = this.parade.tail(this.s);
    const l = Math.hypot(s.dx, s.dz) || 1;
    const fx = s.dx / l, fz = s.dz / l;
    const side = Math.random() < 0.5 ? 1 : -1;
    const q = this.world.nearestWalkable(s.x - fx * 9 + fz * side * rand(3, 7), s.z - fz * 9 - fx * side * rand(3, 7), 0.4);
    const a = g.actor;
    a.setPos(q.x, this.world.groundHeight(q.x, q.z), q.z);
    a.setVisible(true);
    a.pop();
    g.state = "follow";
    g.anchor = pickAnchor(this.list.filter((o) => o !== g && o.state === "follow").map((o) => o.anchor), Math.random());
    g.side = side;
    g.off = rand(1.4, 2.4);
    g.reT = rand(9, 16);
    g.life = rand(50, 95);
    g.hopT = rand(2, 5);
    g.stuck = 0;
    this.bus.emit("tagalong", { kind, x: q.x, z: q.z, first: this.first });
    this.first = false;
  }

  private leave(g: Tagalong) {
    if (g.state !== "follow") return;
    g.state = "leave";
    g.life = 3.5;
    // 行列から離れる向きへ走って帰る
    const a = g.actor;
    const dx = a.x - this.player.x, dz = a.z - this.player.z;
    const l = Math.hypot(dx, dz) || 1;
    g.lx = a.x + (dx / l) * 18;
    g.lz = a.z + (dz / l) * 18;
  }

  /** 沿う場所の目標点 */
  private target(g: Tagalong, out: { x: number; z: number }) {
    const p = this.parade;
    const i = anchorIndex(g.anchor, p.count);
    const s = p.sample(i < 0 ? p.headDistance - 1.7 : p.headDistance - p.offsetOf(i), this.s);
    const l = Math.hypot(s.dx, s.dz) || 1;
    const nx = -s.dz / l, nz = s.dx / l;
    const off = i < 0 ? 1.6 : g.off;
    const bx = i < 0 ? s.x : p.followers[i].actor.x;
    const bz = i < 0 ? s.z : p.followers[i].actor.z;
    out.x = bx + nx * g.side * off;
    out.z = bz + nz * g.side * off;
    return out;
  }

  private tgt = { x: 0, z: 0 };

  private move(g: Tagalong, dt: number, t: number) {
    const a = g.actor;
    let tx: number, tz: number, sp: number;
    if (g.state === "leave") {
      g.life -= dt;
      tx = g.lx;
      tz = g.lz;
      sp = 8;
      if (g.life <= 0 || Math.hypot(tx - a.x, tz - a.z) < 1) {
        g.state = "off";
        a.setVisible(false);
        return;
      }
    } else {
      g.life -= dt;
      g.reT -= dt;
      if (g.life <= 0) {
        this.leave(g);
        return;
      }
      if (g.reT <= 0) {
        // 行列の別のところへ（先頭の方へ駆け上がったり、最後尾へ戻ったり）
        g.reT = rand(9, 16);
        g.anchor = pickAnchor(this.list.filter((o) => o.state === "follow").map((o) => o.anchor), Math.random());
        if (Math.random() < 0.4) g.side = g.side === 1 ? -1 : 1;
      }
      const q = this.target(g, this.tgt);
      tx = q.x;
      tz = q.z;
      const d = Math.hypot(tx - a.x, tz - a.z);
      // 遠くに置いていかれたら、最後尾の後ろから走り直す
      if (d > 70) {
        g.state = "off";
        a.setVisible(false);
        return;
      }
      sp = d > 0.6 ? Math.min(12, 1.5 + d * 2.8) : 0;
      // 子供はときどき跳ねてはしゃぐ
      g.hopT -= dt;
      if (g.hopT <= 0) {
        g.hopT = rand(3, 8);
        if (g.kind === "kid") a.happy();
        else a.surprise();
      }
    }
    const mx = tx - a.x, mz = tz - a.z;
    const md = Math.hypot(mx, mz);
    if (sp > 0 && md > 0.05) {
      const step = Math.min(md, sp * dt);
      const p = { x: a.x + (mx / md) * step, z: a.z + (mz / md) * step };
      this.world.resolve(p, 0.35);
      const moved = Math.hypot(p.x - a.x, p.z - a.z);
      g.stuck = moved < step * 0.3 ? g.stuck + dt : 0;
      a.face(mx, mz, dt, 10);
      a.speed = moved / Math.max(dt, 1e-4);
      a.x = p.x;
      a.z = p.z;
      // 建物に阻まれたら、諦めて帰る
      if (g.stuck > 1.5 && g.state === "follow") this.leave(g);
    } else {
      a.speed = 0;
      a.face(this.player.x - a.x, this.player.z - a.z, dt, 3);
    }
    a.y = this.world.groundHeight(a.x, a.z);
    a.groundY = a.y;
    a.animate(dt, t);
  }

  /** 写真から隠す NPC */
  actors() {
    return this.list.filter((g) => g.state !== "off").map((g) => g.actor);
  }

  get following() {
    return this.list.filter((g) => g.state === "follow").length;
  }
}
