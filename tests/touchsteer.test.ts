import { test } from "node:test";
import assert from "node:assert/strict";
import { STEER_DEAD, STEER_FULL, steerAxes } from "../src/core/TouchSteer.ts";

test("指のスライド：死角の中は歩かない。上へ滑らせると奥、右へ滑らせると右", () => {
  assert.deepEqual(steerAxes(0, 0), { ix: 0, iz: 0 });
  assert.deepEqual(steerAxes(STEER_DEAD, 0), { ix: 0, iz: 0 });
  assert.deepEqual(steerAxes(0, -STEER_DEAD), { ix: 0, iz: 0 });

  const up = steerAxes(0, -(STEER_DEAD + STEER_FULL));
  assert.ok(Math.abs(up.ix) < 1e-9, `ix=${up.ix}`);
  assert.ok(Math.abs(up.iz - 1) < 1e-9, `iz=${up.iz}`);

  const right = steerAxes(STEER_DEAD + STEER_FULL, 0);
  assert.ok(Math.abs(right.ix - 1) < 1e-9);
  assert.ok(Math.abs(right.iz) < 1e-9);

  const down = steerAxes(0, STEER_DEAD + STEER_FULL);
  assert.ok(Math.abs(down.iz + 1) < 1e-9);
});

test("指のスライド：斜めも速さは 1 まで。最大より長く滑らせても増えない", () => {
  const diag = steerAxes(STEER_FULL, -STEER_FULL);
  const mag = Math.hypot(diag.ix, diag.iz);
  assert.ok(mag <= 1 + 1e-9, `mag=${mag}`);
  assert.ok(diag.ix > 0.5 && diag.iz > 0.5);
  const past = steerAxes(STEER_FULL * 3, -STEER_FULL * 3);
  assert.ok(Math.abs(Math.hypot(past.ix, past.iz) - 1) < 1e-9);
});

test("指のスライド：死角のすぐ外は遅く、最大を超えても 1 のまま", () => {
  const nudge = steerAxes(0, -(STEER_DEAD + 8));
  assert.ok(nudge.iz > 0 && nudge.iz < 0.35, `iz=${nudge.iz}`);
  const far = steerAxes(0, -400);
  assert.ok(Math.abs(far.iz - 1) < 1e-9);
});
