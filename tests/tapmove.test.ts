import { test } from "node:test";
import assert from "node:assert/strict";
import { TAP_GIVE_UP, tapMoveStep, type TapTarget } from "../src/game/TapMove.ts";

/** 壁に向かって詰まったまま、何秒で諦めるか */
function giveUpTime(fps: number) {
  const dt = 1 / fps;
  const mt: TapTarget = { x: 10, z: 0, stuck: 0, lastD: Infinity };
  let t = 0;
  while (tapMoveStep(mt, 10, dt)) {
    t += dt;
    if (t > 10) break;
  }
  return t;
}

/** 目的地へ速さ speed（歩/秒）で近づいているとき、途中で諦めてしまうか */
function reaches(fps: number, speed: number) {
  const dt = 1 / fps;
  const mt: TapTarget = { x: 20, z: 0, stuck: 0, lastD: Infinity };
  let d = 20;
  for (let t = 0; t < 30; t += dt) {
    if (!tapMoveStep(mt, d, dt)) return d < 1.5;
    d -= speed * dt;
  }
  return false;
}

test("タップ移動：詰まったら 30 / 60 / 120fps のどれでも同じ実時間で諦める", () => {
  const ts = [30, 60, 120].map(giveUpTime);
  for (const t of ts) assert.ok(Math.abs(t - TAP_GIVE_UP) < 0.05, `t=${ts.join(",")}`);
  // 旧実装（1 フレーム = 1/60 秒と数える）では 30fps で 2 倍、120fps で半分になっていた
  assert.ok(Math.max(...ts) - Math.min(...ts) < 0.06);
});

test("タップ移動：普通に歩いて（ゆっくりでも）近づいていれば、どの fps でも着くまで歩く", () => {
  for (const fps of [30, 60, 120, 144]) {
    assert.ok(reaches(fps, 7), `walk ${fps}`);
    assert.ok(reaches(fps, 2.5), `slow ${fps}`);
  }
});
