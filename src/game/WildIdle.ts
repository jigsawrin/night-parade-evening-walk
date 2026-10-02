import type { Actor } from "../characters/Actor";
import { rand } from "../core/util";
import { YOKAI } from "../data/yokaiTypes";
import type { World } from "../world/World";
import { isHidden } from "./legends/LegendRules";
import type { Wild } from "./WildYokai";

/**
 * 町の野良妖怪の「待っている間」：住処のまわりをうろつく（wander）と、ヒント・ミニマップ・気配への一覧。
 * 一覧は、隠し妖怪（見つけるまで教えない）・潜んでいる妖怪（lurk）を外す。化けている妖怪は、化けた姿の種類で数える。
 * WildYokai から分けた（加入条件の振る舞いは WildJoinRules・WildCompanionRules）。
 */

/** 住処のまわりを歩いたり止まったり（半径 0・止まり木の上なら動かない） */
export function wanderNearHome(world: Pick<World, "resolve">, w: Wild, a: Actor, dt: number) {
  if (w.r <= 0.01 || w.perchY) {
    a.speed = 0;
    return;
  }
  w.timer -= dt;
  if (w.timer <= 0) {
    if (w.state === "wander") {
      w.state = "idle";
      w.timer = rand(1.5, 4);
    } else {
      const ang = rand(0, Math.PI * 2);
      const rr = w.r * Math.sqrt(Math.random());
      w.tx = w.homeX + Math.cos(ang) * rr;
      w.tz = w.homeZ + Math.sin(ang) * rr;
      w.state = "wander";
      w.timer = rand(2, 5);
    }
  }
  if (w.state !== "wander") {
    a.speed = 0;
    return;
  }
  const dx = w.tx - a.x, dz = w.tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) {
    a.speed = 0;
    return;
  }
  const v = 1.4;
  const p = { x: a.x + (dx / d) * v * dt, z: a.z + (dz / d) * v * dt };
  world.resolve(p, 0.4);
  a.face(dx, dz, dt, 6);
  a.speed = v;
  a.x = p.x;
  a.z = p.z;
}

/** 見えている姿（消えた提灯は提灯そのもの） */
const shape = (w: Wild) => (w.state === "dormant" ? w.dormant : w.actor);

/** 案内に出してよいか（隠し妖怪・潜んでいる妖怪は教えない） */
const guidable = (w: Wild) => w.state !== "hidden" && !w.lurk && !isHidden(YOKAI[w.type]);

/** 見えている種類（化けている妖怪は化けた姿） */
export const shownType = (w: Wild) => (w.rule.kind === "disguise" ? w.rule.as : w.type);

/** いちばん近い「気になる存在」（ヒント表示用。radius の内だけ） */
export function nearestGuidable(list: readonly Wild[], px: number, pz: number, radius = 10): Wild | null {
  let best: Wild | null = null;
  let bd = radius;
  for (const w of list) {
    const a = shape(w);
    if (!a || !guidable(w)) continue;
    const d = Math.hypot(a.x - px, a.z - pz);
    if (d < bd) {
      bd = d;
      best = w;
    }
  }
  return best;
}

/** ミニマップ・「！」用（隠し妖怪・潜んでいる妖怪は教えない） */
export function forEachGuidable(list: readonly Wild[], fn: (x: number, z: number, type: string) => void) {
  for (const w of list) {
    const a = shape(w);
    if (a && guidable(w)) fn(a.x, a.z, shownType(w));
  }
}

/** 見えている未加入の妖怪（気配・Pacing の探索候補。潜んでいる妖怪は入れない。隠し妖怪の扱いは GuidanceRules） */
export function forEachShown(list: readonly Wild[], fn: (x: number, z: number, w: Wild) => void) {
  for (const w of list) {
    if (w.state === "hidden" || w.lurk) continue;
    const a = shape(w);
    if (a) fn(a.x, a.z, w);
  }
}
