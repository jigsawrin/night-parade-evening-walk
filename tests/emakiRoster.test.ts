import { test } from "node:test";
import assert from "node:assert/strict";
import { emakiSlots, emakiReadingOrder } from "../src/game/after/EmakiRoster.ts";
import { PROTAGONIST } from "../src/data/protagonist.ts";
import { YOKAI } from "../src/data/yokaiTypes.ts";

test("主人公：図鑑のどの妖怪の id とも重ならない（鬼は主人公と別の、単独の妖怪）", () => {
  assert.ok(!(PROTAGONIST.typeId in YOKAI));
  assert.ok("oni" in YOKAI);
  assert.equal(YOKAI.oni.name, "鬼");
});

test("絵巻の並び：0 人目は主人公、1 人目以降は加入順の妖怪（左端が 0 人目、右端が最後に加入）", () => {
  const s = emakiSlots(["tanuki", "kappa", "oni"]);
  assert.deepEqual(s.map((x) => [x.index, x.kind, x.id]), [[0, "protagonist", PROTAGONIST.typeId], [1, "yokai", "tanuki"], [2, "yokai", "kappa"], [3, "yokai", "oni"]]);
  assert.deepEqual(emakiReadingOrder(s).map((x) => x.id), ["oni", "kappa", "tanuki", PROTAGONIST.typeId]);
});

test("絵巻の並び：1 人目は鬼でなくてよい・主人公は差し替えられる（ロブロックスのアバター）", () => {
  const s = emakiSlots(["nekomata"], "roblox-avatar");
  assert.deepEqual(s.map((x) => x.id), ["roblox-avatar", "nekomata"]);
  assert.equal(s[1].index, 1);
});

test("絵巻の並び：妖怪がいなくても主人公だけの絵巻になる", () => {
  assert.deepEqual(emakiSlots([]).map((x) => x.index), [0]);
});
