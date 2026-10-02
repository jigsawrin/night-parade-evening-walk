import { test } from "node:test";
import assert from "node:assert/strict";
import { aweNeed, guardArrives, inSight, onmyojiAwe, purgeCount, suspicionRate } from "../src/game/onmyoji/OnmyojiRules.ts";
import { countTypes } from "../src/game/legends/LegendRules.ts";
import { ONMYOJI_CFG } from "../src/data/onmyoji.ts";
import { anchorIndex, pickAnchor, tagalongCap, TAGALONG_ANCHORS } from "../src/game/TagalongRules.ts";
import { evaluateTitles, type NightRecordData } from "../src/data/titles.ts";
import { NightMemoryLog } from "../src/game/after/NightMemoryLog.ts";

const counts = (o: Record<string, number>) => new Map(Object.entries(o));
const awe = (present: number, total: number, c: Record<string, number> = {}, momentumLevel = 0) =>
  onmyojiAwe({ present, total, counts: counts(c), momentumLevel });

test("威光：一人なら五十妖、二人以上なら八十妖で退く", () => {
  assert.equal(awe(1, 49), null);
  assert.equal(awe(1, 50), "size");
  assert.equal(awe(2, 79), null);
  assert.equal(awe(2, 80), "size");
  assert.equal(awe(3, 79), null);
  assert.equal(aweNeed(1), 50);
  assert.equal(aweNeed(2), 80);
  // 誰もいなければ威光もない
  assert.equal(awe(0, 120), null);
});

test("威光：大妖怪を連れていれば人数に関わらず退く", () => {
  assert.equal(awe(2, 20, { shuten: 1 }), "shuten");
  assert.equal(awe(3, 20, { daitengu: 1 }), "daitengu");
});

test("威光：狐の一族（六妖）と、熱狂（一人のときだけ）", () => {
  assert.equal(awe(2, 30, { kitsune: 5 }), null);
  assert.equal(awe(2, 30, { kitsune: 6 }), "kitsune");
  assert.equal(awe(1, 30, {}, 4), "fervor");
  assert.equal(awe(1, 29, {}, 4), null);
  assert.equal(awe(2, 60, {}, 4), null);
  assert.equal(awe(1, 40, {}, 3), null);
});

test("視野：前方の扇形と、背後でもすぐそば", () => {
  // yaw = 0 → +z を向いている
  assert.equal(inSight(0, 0, 0, 0, 10), true);
  assert.equal(inSight(0, 0, 0, 0, -10), false, "背中側は見えない");
  assert.equal(inSight(0, 0, 0, 0, -2), true, "すぐそばなら背後でも気付く");
  assert.equal(inSight(0, 0, 0, 0, ONMYOJI_CFG.sight + 1), false, "遠すぎる");
  assert.equal(inSight(0, 0, 0, 10, 1), false, "真横は視野の外");
  assert.equal(inSight(0, 0, Math.PI / 2, 10, 1), true, "向きを変えれば見える");
});

test("怪しさ：近いほど速く溜まる", () => {
  assert.ok(suspicionRate(2) > suspicionRate(8));
  assert.ok(suspicionRate(8) > suspicionRate(14));
  assert.equal(suspicionRate(0), ONMYOJI_CFG.fillNear);
  assert.equal(suspicionRate(99), ONMYOJI_CFG.fillFar);
});

test("祓う数：三〜八妖（人数が少なければその分だけ）", () => {
  assert.equal(purgeCount(0), 0);
  assert.equal(purgeCount(2), 2);
  assert.equal(purgeCount(10), 3);
  assert.equal(purgeCount(49), 5);
  assert.equal(purgeCount(200), 8);
});

test("増援：人数か夜の進み具合のどちらかで現れる", () => {
  assert.equal(guardArrives(null, 1, 0), true);
  const b = { total: 40, progress: 0.45 };
  assert.equal(guardArrives(b, 39, 0.44), false);
  assert.equal(guardArrives(b, 40, 0), true);
  assert.equal(guardArrives(b, 1, 0.45), true);
  assert.equal(guardArrives({ progress: 0.72 }, 200, 0.5), false);
});

test("顔ぶれを数える", () => {
  const c = countTypes([{ typeId: "oni" }, { typeId: "oni" }, { typeId: "kappa" }]);
  assert.equal(c.get("oni"), 2);
  assert.equal(c.get("kappa"), 1);
  // 使い回しても前の数は残らない
  countTypes([{ typeId: "kappa" }], c);
  assert.equal(c.get("oni"), undefined);
});

test("追いかける子供・犬：五十妖から、四十五妖を下回ると帰る", () => {
  assert.equal(tagalongCap(49, false), 0);
  assert.equal(tagalongCap(50, false), 3);
  assert.equal(tagalongCap(47, true), 3, "少し減っただけでは帰らない");
  assert.equal(tagalongCap(44, true), 0);
  assert.equal(tagalongCap(74, false), 5);
  assert.equal(tagalongCap(500, false), 8);
});

test("追いかける子供・犬：空いている場所に沿い、主人公の斜め後ろにも行列の途中にも", () => {
  const used = [-1, 0.12, 0.3, 0.5, 0.7, 0.88];
  assert.equal(pickAnchor(used, 0.5), 1);
  for (let i = 0; i < 20; i++) assert.ok(TAGALONG_ANCHORS.includes(pickAnchor([], i / 20) as never));
  assert.equal(anchorIndex(-1, 60), -1);
  assert.equal(anchorIndex(0, 60), 0);
  assert.equal(anchorIndex(1, 60), 59);
  assert.equal(anchorIndex(0.5, 61), 30);
});

const baseRecord = (o: Partial<NightRecordData> = {}): NightRecordData => ({
  total: 30, types: new Map(), scatters: 1, activitiesDone: 0, activitiesTotal: 4, districtsAwakened: 0, miniMerged: 0,
  encountersDone: 0, cellsVisited: 0, time: 900, nightLength: 1200, reason: "shrine", peakMomentum: 20, ...o,
});

test("称号：陰陽師退散・忍び足（古い記録には付かない）", () => {
  assert.ok(evaluateTitles(baseRecord({ onmyojiRouted: true })).some((t) => t.id === "taisan"));
  assert.ok(evaluateTitles(baseRecord({ purges: 0 })).some((t) => t.id === "shinobi"));
  assert.ok(!evaluateTitles(baseRecord({ purges: 2 })).some((t) => t.id === "shinobi"));
  assert.ok(!evaluateTitles(baseRecord()).some((t) => t.id === "taisan" || t.id === "shinobi"));
});

test("思い出：陰陽師を退けた・大妖怪が加わった", () => {
  const log = new NightMemoryLog();
  log.legend({ type: "daitengu", rank: "greater", t: 100, n: 40, x: 0, z: 0, conditions: [] }, "大天狗");
  log.onmyoji(200, "百鬼夜行の威光で、陰陽師を退けた", 0, 96);
  const kinds = log.highlights(3).map((e) => e.kind);
  assert.ok(kinds.includes("onmyoji") && kinds.includes("legend"));
});
