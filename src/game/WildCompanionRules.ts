import type { Actor } from "../characters/Actor";
import { YOKAI, type JoinRule, type YokaiTalk } from "../data/yokaiTypes";
import type { Wild } from "./WildYokai";
import { JOIN_R, type JoinRuleHost } from "./WildJoinRules";

/**
 * 触れるだけではない、妖怪と「一緒に何かする」加入条件（WildJoinRules から呼ぶ。どの妖怪も同じ振る舞いで、違いはデータの値と一言）：
 *  - standStill：そばで立ち止まると、向こうから寄ってくる（動いていると少し離れる）
 *  - followSteps：そばで一緒にしばらく歩くと加わる（離れると、その場で待つ）
 *  - respond：呼びかけてくる。そばで立ち止まって応えると加わる
 *  - contrary：追うと逃げ、背を向けて歩くとついてきて加わる
 *  - sidestep：正面を向け続ける。脇・後ろへ回り込んで触れると加わる
 *  - 潜む（lurk）：姿を見せていない。そばでしばらく立ち止まると姿を見せる（加入条件はその後）。音を立てる妖怪（murmur）は近いほど大きく聞こえる
 *  - drop：高い所に潜み、真下を通ると降りてきて驚かせる（その後は触れると加わる。痛いことはしない）
 *  - gaze：別の姿（障子・人影）で置き、近づくたびに次の姿へ。最後に本当の姿を現す
 * 妖怪ごとの if 文は作らない。一言は YokaiType.talk（（…）で始まる言葉は地の文として、名前を付けずに出す）。
 */

type Kind<K extends JoinRule["kind"]> = Extract<JoinRule, { kind: K }>;
type Result = "joined" | "held" | "wander";

/** 主人公が立ち止まっているか */
export const isStill = (h: JoinRuleHost) => h.player.actor.speed < 0.4;

/** 一言（無ければ null）。（…）で始まる言葉は地の文 */
export function talkLine(type: string, key: keyof YokaiTalk, vars: Record<string, string | number> = {}): string | null {
  const def = YOKAI[type];
  let text = def?.talk?.[key];
  if (!text) return null;
  for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
  return text.startsWith("（") ? text : `${def.name}「${text}」`;
}

export function toastTalk(h: JoinRuleHost, w: Wild, key: keyof YokaiTalk, vars?: Record<string, string | number>) {
  const text = talkLine(w.type, key, vars);
  if (text) h.bus.emit("toast", { text });
}

/** (tx, tz) へ speed で歩く（建物に押し戻される） */
function stepToward(h: JoinRuleHost, a: Actor, tx: number, tz: number, speed: number, dt: number) {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) {
    a.speed = 0;
    return;
  }
  const p = { x: a.x + (dx / d) * speed * dt, z: a.z + (dz / d) * speed * dt };
  h.world.resolve(p, 0.4);
  a.face(p.x - a.x, p.z - a.z, dt, 8);
  a.speed = Math.hypot(p.x - a.x, p.z - a.z) / Math.max(dt, 1e-4);
  a.x = p.x;
  a.z = p.z;
}

/** 主人公から離れる（住処から離れすぎない） */
function stepAway(h: JoinRuleHost, w: Wild, a: Actor, dx: number, dz: number, dist: number, speed: number, dt: number) {
  const l = dist || 1;
  let tx = a.x - (dx / l) * 3, tz = a.z - (dz / l) * 3;
  if (Math.hypot(tx - w.homeX, tz - w.homeZ) > w.r + 8) (tx = w.homeX), (tz = w.homeZ);
  stepToward(h, a, tx, tz, speed, dt);
}

function join(h: JoinRuleHost, w: Wild): Result {
  toastTalk(h, w, "ok");
  h.join(w);
  return "joined";
}

export function applyStandStill(h: JoinRuleHost, r: Kind<"standStill">, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): Result {
  if (w.follow) {
    stepToward(h, a, h.player.x, h.player.z, 2.6, dt);
    return dist < JOIN_R ? join(h, w) : "held";
  }
  if (dist >= r.reach) {
    w.rt = Math.max(0, w.rt - dt);
    return "wander";
  }
  if (isStill(h)) {
    a.face(dx, dz, dt, 3);
    a.speed = 0;
    w.rt += dt;
    if (w.rt >= r.secs) w.follow = true;
    return "held";
  }
  // 動いていると、先回りするように少し離れる
  w.rt = Math.max(0, w.rt - dt * 2);
  if (w.bubbleCd <= 0) {
    w.bubbleCd = 6;
    toastTalk(h, w, "tease");
  }
  stepAway(h, w, a, dx, dz, dist, 1.3, dt);
  return "held";
}

export function applyFollowSteps(h: JoinRuleHost, r: Kind<"followSteps">, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): Result {
  if (!w.follow && dist < 3) {
    w.follow = true;
    if (w.bubbleCd <= 0) {
      w.bubbleCd = 8;
      toastTalk(h, w, "tease");
    }
  }
  if (w.follow && dist > 10) w.follow = false; // 離れすぎた：その場で待つ
  if (!w.follow) {
    w.rt = Math.max(0, w.rt - dt * 1.5);
    return "wander";
  }
  const moved = h.player.actor.speed * dt;
  if (moved > 0.02 && dist < 5) w.rt += moved;
  if (w.rt >= r.dist) return join(h, w);
  if (dist > 1.7) stepToward(h, a, h.player.x, h.player.z, Math.min(11, h.player.actor.speed + 2), dt);
  else {
    a.face(dx, dz, dt, 6);
    a.speed = 0;
  }
  return "held";
}

export function applyRespond(h: JoinRuleHost, r: Kind<"respond">, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): Result {
  a.face(dx, dz, dt, 3);
  a.speed = 0;
  if (dist < 14 && w.bubbleCd <= 0) {
    w.bubbleCd = 8;
    toastTalk(h, w, "tease");
    h.say(w);
  }
  if (dist < 3.6 && isStill(h)) {
    w.rt += dt;
    if (w.rt >= r.secs) return join(h, w);
  } else w.rt = Math.max(0, w.rt - dt * 0.5);
  return "held";
}

export function applyContrary(h: JoinRuleHost, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): Result {
  const vx = h.player.vx, vz = h.player.vz;
  const sp = Math.hypot(vx, vz);
  // 主人公の進む向きが、こちらへ向いているか（1 = まっすぐ来る、-1 = まっすぐ離れる）
  const toward = sp > 1 && dist > 0 ? (vx * -dx + vz * -dz) / (sp * dist) : 0;
  if (w.follow) {
    if (dist < JOIN_R) return join(h, w);
    if (dist > 20 || (toward > 0.6 && dist < 5)) {
      w.follow = false; // 振り返られた・離れすぎた
      return "held";
    }
    stepToward(h, a, h.player.x, h.player.z, 5.5, dt);
    return "held";
  }
  if (dist < 8 && toward > 0.3) {
    if (w.bubbleCd <= 0) {
      w.bubbleCd = 6;
      toastTalk(h, w, "tease");
    }
    stepAway(h, w, a, dx, dz, dist, 4.2, dt);
    return "held";
  }
  if (dist < 14 && toward < -0.4) {
    w.follow = true;
    return "held";
  }
  return "wander";
}

export function applySidestep(h: JoinRuleHost, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): Result {
  // ゆっくり正面を向ける（素早く回り込めば、脇・後ろへ出られる）
  a.face(dx, dz, dt, 1.1);
  a.speed = 0;
  if (dist < 2.4 && dist > 0) {
    const front = (dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw)) / dist;
    if (front < 0.35) return join(h, w);
    if (w.bubbleCd <= 0) {
      w.bubbleCd = 5;
      toastTalk(h, w, "tease");
    }
  }
  return "held";
}

/**
 * 潜んでいる妖怪：姿を見せず、そばで立ち止まると姿を見せる。まだ潜んでいれば true（加入条件は見ない）。
 * 呼びかける妖怪（respond）は、潜んでいる間も近くで声だけ聞こえる（名前は出さない）
 */
export function applyLurk(h: JoinRuleHost, w: Wild, a: Actor, dist: number, dt: number): boolean {
  a.speed = 0;
  const def = YOKAI[w.type];
  if (w.rule.kind === "respond" && dist < 16 && w.bubbleCd <= 0) {
    const call = def?.talk?.tease;
    if (call) h.bus.emit("toast", { text: `どこからか「${call}」と声がした…` });
    w.bubbleCd = 9;
  }
  // 音を立てる妖怪：近いほど大きく（場所の印は出さない）。消音でも分かるよう、すぐ近くでは地の文でも
  if (def?.murmur && dist < MURMUR_RANGE) {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = 1.7;
      h.bus.emit("murmur", { kind: def.murmur, x: a.x, z: a.z, strength: 1 - dist / MURMUR_RANGE });
    }
    if (dist < 12 && w.bubbleCd <= 0) {
      w.bubbleCd = 14;
      toastTalk(h, w, "tease");
    }
  }
  if (dist < 5 && isStill(h)) {
    w.rt += dt;
    if (w.rt >= 1.2) {
      w.rt = 0;
      h.unveil(w);
      return false;
    }
  } else w.rt = Math.max(0, w.rt - dt);
  return true;
}

/** 潜む妖怪の音が届く距離（歩） */
const MURMUR_RANGE = 40;

export function applyDrop(h: JoinRuleHost, r: Kind<"drop">, w: Wild, a: Actor, dist: number, dt: number): Result {
  a.speed = 0;
  if (w.lurk) {
    if (dist >= r.reach) return "held";
    // 真下を通った：上から降りてくる（姿は見せたまま、止まり木の高さを下げていく）
    w.lurk = false;
    w.follow = true;
    a.setVisible(true);
  }
  if (w.follow) {
    w.perchY = Math.max(0, w.perchY - dt * 16);
    if (w.perchY > 0) return "held";
    w.follow = false;
    h.player.actor.surprise();
    a.happy();
    h.bus.emit("reveal", { type: w.type, x: a.x, y: 0, z: a.z });
    toastTalk(h, w, "tease");
    w.rule = { kind: "touch" };
  }
  return "held";
}

export function applyGaze(h: JoinRuleHost, r: Kind<"gaze">, w: Wild, a: Actor, dist: number): Result {
  a.speed = 0;
  const stage = w.stage ?? 0;
  if (dist >= (r.near[stage] ?? 0)) return "held";
  w.stage = stage + 1;
  if (w.stage < r.looks.length) h.reshape(w, r.looks[w.stage]);
  else {
    // 本当の姿を現す（その後は触れると加わる）
    w.lurk = false;
    w.rule = { kind: "touch" };
    h.reshape(w);
    toastTalk(h, w, "appear");
  }
  return "held";
}
