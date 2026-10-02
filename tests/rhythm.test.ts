import { test } from "node:test";
import assert from "node:assert/strict";
import { NightRhythm } from "../src/game/NightRhythm.ts";
import { NightMetrics, SILENCE_MIN } from "../src/game/NightMetrics.ts";

const quiet = { breathing: false, active: 0, rumors: 0, heading: false };

test("夜の波：静 → 気になる → 向かう → 祭り → 余韻 → 静 と巡り、祭りはずっと続かない", () => {
  const r = new NightRhythm();
  const seen: string[] = [];
  const run = (sec: number, i: typeof quiet) => {
    for (let s = 0; s < sec; s += 0.25) {
      const p = r.update(0.25, i);
      if (p) seen.push(p);
    }
  };
  run(5, quiet);
  run(3, { ...quiet, rumors: 1 });
  run(10, { ...quiet, rumors: 1, heading: true });
  r.festival(8);
  run(10, { ...quiet, active: 0, breathing: true });
  run(20, { ...quiet, breathing: true });
  run(20, quiet);
  assert.deepEqual(seen, ["curiosity", "pursuit", "festival", "cooldown", "quiet"]);
  assert.ok(r.time.festival <= 8.5);
  assert.ok(r.time.quiet > 20);
});

test("計測：静寂の長さ・Encounter の間隔・30 妖以降の候補なし時間", () => {
  const m = new NightMetrics();
  const tick = (sec: number, total: number, hasCandidate: boolean) => {
    for (let s = 0; s < sec; s += 0.25) m.tick(0.25, { total, hasCandidate });
  };
  tick(10, 10, true);
  m.encounterStart("hungryGroup");
  tick(2, 10, true);
  m.stim(); // 短い間は静寂と数えない
  tick(30, 35, false);
  m.encounterStart("miniParade");
  tick(6, 35, true);
  const r = m.report(42);
  assert.equal(r.Encounter開始, 2);
  assert.equal(r.MiniParade, 1);
  assert.equal(r.Encounter平均間隔秒, 32);
  assert.equal(r.最長静寂秒, 30);
  assert.equal(r["30妖以降_候補なし秒"], 30);
  assert.equal(r.最終妖怪数, 42);
  assert.ok(r.静寂の回数 >= 2 && SILENCE_MIN > 0);
});
