import type { Actor } from "../characters/Actor";
import type { Rng } from "../core/seed";
import { YOKAI } from "../data/yokaiTypes";
import { toKanji } from "../core/util";
import type { World } from "../world/World";
import { legendMissing, type LegendContext } from "./legends/LegendRules";
import type { GameBus } from "./events";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { HintInfo, Wild } from "./WildYokai";
import { applyContrary, applyDrop, applyFollowSteps, applyGaze, applyLurk, applyRespond, applySidestep, applyStandStill, talkLine, toastTalk } from "./WildCompanionRules";

/** 触れると加わる距離 */
export const JOIN_R = 1.8;

/** 加入条件の判定が使う WildYokai の部品 */
export interface JoinRuleHost {
  bus: GameBus;
  world: World;
  player: Player;
  parade: Parade;
  /** ゲームプレイに効く位置の乱数（?seed= で再現） */
  pos: Rng;
  /** 大妖怪の加入条件が読む、今の百鬼夜行の様子 */
  legendContext(): LegendContext;
  join(w: Wild): void;
  /** 一言しゃべる（吹き出しの間引き） */
  say(w: Wild): void;
  /** 姿を替える（look：MODELS の ID。無ければ本来の姿に戻し、姿を見せた合図を出す） */
  reshape(w: Wild, look?: string): void;
  /** 潜んでいた妖怪が姿を見せる（見えるようにして、合図と一言） */
  unveil(w: Wild): void;
}

/**
 * 野良妖怪の加入条件（仕様 7章）：触れる・何度か近づく・追いかける・団子・人数・大妖怪の条件（legend）・化けている、
 * と、一緒に何かする条件（立ち止まる・一緒に歩く・応える・背を向ける・回り込む：WildCompanionRules）。
 * 返り値：joined = 加入した／held = その場の振る舞いを済ませた／wander = いつもどおり住処の周りを歩く。
 * 新しい加入条件はここに足す（WildYokai を肥大化させない）。一言は YokaiType.talk（妖怪ごとの if 文は作らない）。
 */
export function applyJoinRule(h: JoinRuleHost, w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): "joined" | "held" | "wander" {
  // 潜んでいる：立ち止まると現れる（still）・糸を辿ると現れる（trail）。rule は加入条件の中で自分で現れる（落ちてくる・姿を変える）
  if (w.lurk && (w.lurkBy ?? "still") === "still" && applyLurk(h, w, a, dist, dt)) return "held";
  if (w.lurk && w.lurkBy === "trail") {
    a.speed = 0;
    return "held";
  }
  const r = w.rule;
  switch (r.kind) {
    case "leap":
    case "perch":
      a.face(dx, dz, dt, 3);
      a.speed = 0;
      if (dist < (r.kind === "perch" ? r.reach : 13)) {
        if (r.kind === "perch") toastTalk(h, w, "ok");
        h.join(w);
        return "joined";
      }
      return "held";
    case "standStill":
      return applyStandStill(h, r, w, a, dist, dx, dz, dt);
    case "followSteps":
      return applyFollowSteps(h, r, w, a, dist, dx, dz, dt);
    case "respond":
      return applyRespond(h, r, w, a, dist, dx, dz, dt);
    case "contrary":
      return applyContrary(h, w, a, dist, dx, dz, dt);
    case "sidestep":
      return applySidestep(h, w, a, dist, dx, dz, dt);
    case "drop":
      return applyDrop(h, r, w, a, dist, dt);
    case "gaze":
      return applyGaze(h, r, w, a, dist);
    case "variety":
      a.face(dx, dz, dt, 3);
      a.speed = 0;
      if (dist < 3.4) {
        if (h.legendContext().counts.size >= r.n) {
          toastTalk(h, w, "ok");
          h.join(w);
          return "joined";
        }
        if (w.bubbleCd <= 0) h.bus.emit("toast", { text: talkOr(w.type, "ask", "{n}種の妖怪を連れて来るとよい", toKanji(r.n)) });
        h.say(w);
      }
      return "held";
    case "touch":
      if (dist < JOIN_R) {
        h.join(w);
        return "joined";
      }
      break;
    case "shy":
    case "disguise":
      if (dist < 2.6 && w.hops > 0) {
        w.hops--;
        const l = dist || 1, hop = r.kind === "shy" ? r.dist ?? 6 : 6;
        w.tx = a.x - (dx / l) * hop + h.pos.range(-2, 2);
        w.tz = a.z - (dz / l) * hop + h.pos.range(-2, 2);
        w.state = "hop";
        w.timer = 0.5;
        // 化けている妖怪は、逃げ方がおかしいだけ（名前は出さない）。正体は触れたときに現す
        toastTalk(h, w, w.hops > 0 || r.kind === "disguise" ? "tease" : "ok");
        return "held";
      }
      if (dist < JOIN_R && w.hops === 0) {
        if (r.kind === "disguise") {
          h.reshape(w);
          w.rule = { kind: "touch" };
          toastTalk(h, w, "appear");
          toastTalk(h, w, "ok");
        }
        h.join(w);
        return "joined";
      }
      break;
    case "flee": {
      if (dist < JOIN_R) {
        h.join(w);
        return "joined";
      }
      if (dist < 9) {
        w.fleeT += dt;
        const tired = w.fleeT > 6;
        const sp = tired ? r.speed * 0.6 : r.speed;
        let vx = -dx / (dist || 1), vz = -dz / (dist || 1);
        // 家から離れすぎたら回り込む
        const hx = a.x - w.homeX, hz = a.z - w.homeZ;
        if (Math.hypot(hx, hz) > 16) {
          vx = vx * 0.3 - hz * 0.05;
          vz = vz * 0.3 + hx * 0.05;
          const l = Math.hypot(vx, vz) || 1;
          vx /= l;
          vz /= l;
        }
        const p = { x: a.x + vx * sp * dt, z: a.z + vz * sp * dt };
        h.world.resolve(p, 0.4);
        a.face(p.x - a.x, p.z - a.z, dt, 12);
        a.speed = Math.hypot(p.x - a.x, p.z - a.z) / dt;
        a.x = p.x;
        a.z = p.z;
        if (w.bubbleCd <= 0) {
          w.bubbleCd = 5;
          toastTalk(h, w, tired ? "tired" : "tease");
        }
        return "held";
      }
      w.fleeT = Math.max(0, w.fleeT - dt);
      break;
    }
    case "food":
      if (dist < JOIN_R + 0.3) {
        if (h.player.dango > 0) {
          h.player.dango--;
          h.bus.emit("dango", { n: h.player.dango });
          h.bus.emit("toast", { text: talkOr(w.type, "ok", "団子だ！ ついてくよ") });
          h.join(w);
          return "joined";
        }
        if (w.bubbleCd <= 0) h.bus.emit("toast", { text: talkOr(w.type, "ask", "おなかすいた…団子があればなあ") });
        h.say(w);
      }
      break;
    case "legend": {
      // 大妖怪・三大妖怪：その妖怪らしい百鬼夜行（条件をすべて満たす）を見せると、認めて加わる。どの妖怪も同じ流れ
      a.face(dx, dz, dt, 3);
      a.speed = 0;
      if (dist < 3.6) {
        const def = YOKAI[w.type];
        const name = def.name;
        if (!w.met) {
          w.met = true;
          h.bus.emit("legendMeet", { type: w.type, rank: def.rank, discovery: def.discovery, x: a.x, z: a.z });
          // 対になる大妖怪をもう連れていたら、ひとこと（加入条件ではない）
          if (r.greet && (h.legendContext().counts.get(r.greet.with) ?? 0) > 0) h.bus.emit("toast", { text: `${name}「${r.greet.text}」` });
        }
        const miss = legendMissing(r, h.legendContext());
        if (!miss.length) {
          h.bus.emit("toast", { text: `${name}「${r.ok}」` });
          h.join(w);
          return "joined";
        }
        if (w.bubbleCd <= 0) h.bus.emit("toast", { text: `${name}「${r.ask}」（${miss.join("・")}）` });
        h.say(w);
      }
      return "held";
    }
    case "minCount":
      a.face(dx, dz, dt, 3);
      a.speed = 0;
      if (dist < 3.2) {
        if (h.parade.total >= r.count) {
          h.bus.emit("toast", { text: talkOr(w.type, "ok", "見事な行列だ。加わろう") });
          h.join(w);
          return "joined";
        }
        if (w.bubbleCd <= 0) h.bus.emit("toast", { text: talkOr(w.type, "ask", "{n}妖の行列を見せてみよ", r.count) });
        h.say(w);
      }
      return "held";
    default:
      break;
  }
  return "wander";
}

/** 一言（無ければ既定の言葉）。{n} は必要な数 */
function talkOr(type: string, key: "ask" | "ok", fallback: string, n?: number | string) {
  return talkLine(type, key, { n: n ?? "" }) ?? `${YOKAI[type].name}「${fallback.replace("{n}", String(n ?? ""))}」`;
}

/** ヒントの一言（近くの妖怪の名前と、足りないもの） */
export function hintFor(h: Pick<JoinRuleHost, "player" | "parade" | "legendContext">, best: Wild, discovered: Set<string>): HintInfo {
  if (best.state === "dormant") return { actor: best.dormant!, type: best.type, text: "消えた提灯が揺れている…", need: false };
  const r = best.rule;
  // 化けている妖怪は、化けた姿の名前だけ（見破るまで正体を教えない）
  const shown = r.kind === "disguise" ? r.as : best.type;
  let text = discovered.has(shown) ? YOKAI[shown].name : "？？？";
  let need = false;
  if (r.kind === "food" && h.player.dango === 0) {
    text += "　団子がほしそうだ";
    need = true;
  } else if (r.kind === "minCount" && h.parade.total < r.count) {
    text += `　${r.count}妖の行列を見せよう`;
    need = true;
  } else if (r.kind === "legend") {
    const miss = legendMissing(r, h.legendContext());
    if (miss.length) {
      text += `　${miss.join("・")}`;
      need = true;
    }
  } else if (r.kind === "flee") text += "　追いかけよう";
  else if (r.kind === "shy" && best.hops > 0) text += "　何度か近づこう";
  else if (r.kind === "standStill") text += "　立ち止まってみよう";
  else if (r.kind === "followSteps") text += "　一緒に歩こう";
  else if (r.kind === "respond") text += "　そばで立ち止まって応えよう";
  else if (r.kind === "contrary") text += "　背を向けて歩こう";
  else if (r.kind === "sidestep") text += "　脇へ回り込もう";
  else if (r.kind === "variety" && h.legendContext().counts.size < r.n) {
    text += `　${toKanji(r.n)}種の妖怪を連れて来よう`;
    need = true;
  }
  return { actor: best.actor!, type: shown, text, need };
}
