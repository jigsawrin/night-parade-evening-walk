import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMON_CLIPS, RIG_CLIPS } from "../src/data/riggedModels.ts";

test("骨付きモデルのクリップ名：ツール（yokai_rigging）が書き出す 5 つと同じ", () => {
  assert.deepEqual([...RIG_CLIPS], ["Idle", "Walk", "Happy", "Surprise", "Appear"]);
});

test("共通クリップ名：全妖怪の GLB に入る 4 つ（animations/common.json と同じ）", () => {
  assert.deepEqual([...COMMON_CLIPS], ["Breath", "Bounce", "Spin", "Flip"]);
});
