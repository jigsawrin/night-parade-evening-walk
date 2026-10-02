import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import { dampAngle } from "../core/util";
import { ONSEN_FLOOR_Y, ONSEN_POOLS, type OnsenSpotDef } from "../data/onsenMap";
import type { Placement } from "../game/onsen/OnsenPlacementRules";

/** 話しかけられる距離（歩。大きな客は体の大きさの分だけ遠くから） */
const TALK_R = 2.4;

export interface Guest {
  type: string;
  spot: OnsenSpotDef;
  actor: Actor;
  seed: number;
  /** 湯につかる高さ（湯の居場所だけ） */
  waterY: number;
  /** 話している（主人公の方を向く） */
  facing: { x: number; z: number } | null;
  /** 居場所の階（上の階の客は、その階を見せている間だけ出す） */
  floor: number;
}

/**
 * 宿泊客：居場所（OnsenPlacementRules）に Actor を置き、宿の中だけの軽い動き（座る・湯につかる・佇む・浮く・少し歩く）をさせる。
 * 本編の野良妖怪（WildYokai）の動きは使わない。加入の判定もしない（宿では皆「客」）。
 */
export class OnsenGuests {
  readonly list: Guest[] = [];

  constructor(factory: ModelFactory, placements: readonly Placement[]) {
    for (const p of placements) {
      const a = new Actor(factory, p.type);
      const pool = ONSEN_POOLS.find((q) => p.spot.x >= q.r.x0 && p.spot.x <= q.r.x1 && p.spot.z >= q.r.z0 && p.spot.z <= q.r.z1);
      a.setPos(p.spot.x, 0, p.spot.z);
      a.yaw = p.spot.yaw;
      a.groundY = 0;
      if (p.spot.pose === "soak") a.shadow.setEnabled(false);
      const floor = p.spot.floor ?? 1;
      this.list.push({ type: p.type, spot: p.spot, actor: a, seed: a.seed, waterY: pool?.y ?? 0, facing: null, floor });
      a.setVisible(floor === 1);
    }
  }

  /** 見せている階が変わった：それより上の階の客は隠す */
  setShownFloor(n: number) {
    for (const g of this.list) g.actor.setVisible(g.floor <= n);
  }

  /** いちばん近い、話しかけられる客（同じ階の客だけ。いなければ null） */
  nearest(x: number, z: number, floor: number) {
    let best: Guest | null = null, bd = Infinity;
    for (const g of this.list) {
      if (g.floor !== floor) continue;
      const d = Math.hypot(g.actor.x - x, g.actor.z - z) - (g.actor.scale - 1) * 0.9;
      if (d < TALK_R && d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }

  update(dt: number, t: number) {
    for (const g of this.list) {
      if (!g.actor.isVisible) continue;
      const a = g.actor;
      const s = g.spot;
      const sd = g.seed;
      let yaw = s.yaw;
      a.speed = 0;
      a.lift = 0;
      switch (s.pose) {
        case "sit":
          a.y = 0;
          a.pose = { bob: 0, roll: Math.sin(t * 0.7 + sd) * 0.03, pitch: 0.05, sy: 0.84 + Math.sin(t * 1.1 + sd) * 0.012, yawOffset: Math.sin(t * 0.35 + sd) * 0.35 };
          break;
        case "soak":
          a.y = g.waterY - 0.42 * a.scale;
          a.pose = { bob: Math.sin(t * 0.8 + sd) * 0.04, roll: Math.sin(t * 0.5 + sd) * 0.04, pitch: -0.05, sy: 1, yawOffset: Math.sin(t * 0.3 + sd) * 0.3 };
          break;
        case "float":
          a.y = 0;
          a.pose = { bob: Math.sin(t * 1.4 + sd) * 0.18, roll: Math.sin(t * 0.9 + sd) * 0.1, pitch: 0, sy: 1, yawOffset: Math.sin(t * 0.25 + sd) * 0.6 };
          break;
        case "stroll": {
          // 居場所の左右を、ゆっくり行ったり来たり
          const k = Math.sin(t * 0.22 + sd);
          const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
          const px = a.x, pz = a.z;
          a.x = s.x + rx * k * 1.4;
          a.z = s.z + rz * k * 1.4;
          a.y = 0;
          a.speed = Math.hypot(a.x - px, a.z - pz) / Math.max(dt, 1e-4);
          yaw = Math.cos(t * 0.22 + sd) >= 0 ? Math.atan2(rx, rz) : Math.atan2(-rx, -rz);
          a.pose = null;
          break;
        }
        default:
          a.y = 0;
          a.pose = { bob: 0, roll: 0, pitch: 0, sy: 1 + Math.sin(t * 1.3 + sd) * 0.02, yawOffset: Math.sin(t * 0.3 + sd) * 0.4 };
      }
      if (g.facing) {
        yaw = Math.atan2(g.facing.x - a.x, g.facing.z - a.z);
        if (a.pose) a.pose.yawOffset = 0;
      }
      a.yaw = dampAngle(a.yaw, yaw, 4, dt);
      const base = ONSEN_FLOOR_Y[g.floor];
      a.y += base;
      // 影は床の面（畳の目地）より少し上に（ちらつかないように）
      a.groundY = base + 0.05;
      a.animate(dt, t);
    }
  }
}
