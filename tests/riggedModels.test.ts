import { test } from "node:test";
import assert from "node:assert/strict";
import { RIG_CLIPS } from "../src/data/riggedModels.ts";

test("骨付きモデルのクリップ名：ツール（yokai_rigging）が書き出す 5 つと同じ", () => {
  assert.deepEqual([...RIG_CLIPS], ["Idle", "Walk", "Happy", "Surprise", "Appear"]);
});
