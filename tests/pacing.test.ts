import { test } from "node:test";
import assert from "node:assert/strict";
import { NightPacingDirector, pacingThresholds } from "../src/game/NightPacingDirector.ts";
import { FestivalMomentum } from "../src/game/FestivalMomentum.ts";
import { CircleTracker } from "../src/game/CircleTracker.ts";

const step = 0.25;
function run(p: NightPacingDirector, sec: number, input: { moving: boolean; exploring: boolean; stageIndex: number }) {
  const acts: { t: number; a: string }[] = [];
  for (let t = 0; t < sec; t += step) {
    const a = p.update(step, input);
    if (a) acts.push({ t: p.t, a });
  }
  return acts;
}

test("Pacing：放置中は何も起こさない（60 秒）", () => {
  const p = new NightPacingDirector();
  const acts = run(p, 60, { moving: false, exploring: false, stageIndex: 3 });
  assert.equal(acts.length, 0);
  assert.equal(p.quiet, 0);
});

test("Pacing：探索しているのに何も起きないと、気配 → 誘導 → Encounter の順に段階を踏む", () => {
  const p = new NightPacingDirector();
  const [o, g, e] = pacingThresholds(4);
  const acts = run(p, 40, { moving: true, exploring: true, stageIndex: 4 });
  assert.deepEqual(acts.slice(0, 3).map((x) => x.a), ["omen", "guide", "encounter"]);
  assert.ok(Math.abs(acts[0].t - o) <= step + 1e-9);
  assert.ok(Math.abs(acts[1].t - g) <= step + 1e-9);
  assert.ok(Math.abs(acts[2].t - e) <= step + 1e-9);
  // v0.2.1：後半でも 10 秒ほどの静けさは異常扱いしない（気配 12〜17 秒・Encounter 候補 32〜40 秒）
  assert.ok(o >= 12 && o <= 17 && e >= 32 && e <= 40);
});

test("Pacing：加入・イベントで静かな時間はリセットされる", () => {
  const p = new NightPacingDirector();
  run(p, 10, { moving: true, exploring: true, stageIndex: 3 });
  p.notifyJoin();
  assert.equal(p.quiet, 0);
  const acts = run(p, 11, { moving: true, exploring: true, stageIndex: 3 });
  assert.equal(acts.length, 0);
});

test("Pacing：街の気配が届いていれば「気配」段階は省く", () => {
  const p = new NightPacingDirector();
  p.notifyOmen();
  const acts = run(p, 30, { moving: true, exploring: true, stageIndex: 3 });
  assert.deepEqual(acts.map((x) => x.a), ["guide"]);
});

test("Pacing：同じ所を回っているだけなら進みは半分", () => {
  const p = new NightPacingDirector();
  run(p, 10, { moving: true, exploring: false, stageIndex: 3 });
  assert.ok(Math.abs(p.quiet - 5) < 0.3);
});

test("Momentum：時間経過・放置・同じマスでは増えない", () => {
  const m = new FestivalMomentum();
  m.setParadeSize(40);
  for (let t = 0; t < 60; t += 0.25) m.observe(t, 5, 5, 39);
  assert.ok(m.value < 1.5, `value=${m.value}`);
});

test("Momentum：小さく回るだけでは、ほとんど増えない", () => {
  const m = new FestivalMomentum();
  m.setParadeSize(40);
  let t = 0;
  for (; t < 120; t += 0.25) {
    const a = t * 1.2;
    m.observe(t, Math.cos(a) * 6, Math.sin(a) * 6, 39);
  }
  // 4 マスの初回ぶんだけ
  assert.ok(m.value < 10, `value=${m.value}`);
});

test("Momentum：新しい場所を長い行列で練り歩くと増え、大きな行列ほど上限が高い", () => {
  const small = new FestivalMomentum();
  const big = new FestivalMomentum();
  small.setParadeSize(3);
  big.setParadeSize(50);
  for (let t = 0; t < 120; t += 0.25) {
    small.observe(t, -150 + t * 2.4, 0, 2);
    big.observe(t, -150 + t * 2.4, 0, 49);
  }
  assert.ok(big.value > 20, `big=${big.value}`);
  assert.ok(small.value <= small.cap + 1e-9);
  assert.ok(small.value < big.value);
  assert.ok(small.cap < 40);
});

test("Momentum：何も起きなければゆっくり減衰する", () => {
  const m = new FestivalMomentum();
  m.setParadeSize(50);
  m.add(50, 0, "test");
  const v0 = m.value;
  for (let t = 0; t < 60; t += 0.5) m.decay(0.5, t);
  assert.ok(m.value < v0 && m.value > v0 - 30);
});

test("CircleTracker：一周で 1、輪の外に出ると -1", () => {
  const c = new CircleTracker(0, 0, 2, 10);
  let p = 0;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    p = c.update(Math.cos(a) * 5, Math.sin(a) * 5);
  }
  assert.equal(p, 1);
  assert.equal(c.update(30, 0), -1);
});

test("Pacing：序盤・中盤・後半とも、少しの静けさ（10 秒程度）は異常扱いしない", () => {
  const [o0, g0, e0] = pacingThresholds(0);
  const [o2, g2, e2] = pacingThresholds(2);
  const [o4, g4, e4] = pacingThresholds(4);
  assert.ok(o0 >= 16 && o0 <= 20 && g0 >= 25 && g0 <= 30 && e0 >= 38 && e0 <= 48);
  assert.ok(o2 >= 14 && o2 <= 18 && g2 >= 24 && g2 <= 28 && e2 >= 34 && e2 <= 42);
  assert.ok(o4 >= 12 && o4 <= 17 && g4 >= 22 && g4 <= 27 && e4 >= 32 && e4 <= 40);
  for (const [o] of [[o0], [o2], [o4]]) assert.ok(o > 10);
  // Encounter 段階の後は、しばらくして誘導し直す（最終手段は FestivalSystems が判断）
  const p = new NightPacingDirector();
  const acts = run(p, 70, { moving: true, exploring: true, stageIndex: 4 });
  assert.deepEqual(acts.map((x) => x.a), ["omen", "guide", "encounter", "retry"]);
});
