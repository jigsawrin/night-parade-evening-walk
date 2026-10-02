import { test } from "node:test";
import assert from "node:assert/strict";
import { Emitter } from "../src/core/Events.ts";
import type { GameEvents } from "../src/game/events.ts";
import { NightRecorder } from "../src/game/after/NightRecorder.ts";
import { cloudLevelForCount } from "../src/presentation/emakiCloudLevel.ts";

test("NightRecorder：GameBus のイベントから一夜の記録を集める（夜の前後は記録しない）", () => {
  const bus = new Emitter<GameEvents>();
  let now = 0;
  const rec = new NightRecorder(bus, () => now);
  bus.emit("join", { type: "oni", total: 2, first: true, x: 0, y: 0, z: -118 });
  assert.equal(rec.log.companions.length, 0, "夜が始まる前は記録しない");
  rec.start(0, -118);
  now = 12;
  bus.emit("join", { type: "kappa", total: 2, first: true, x: 60, y: 0, z: -10 });
  now = 40;
  bus.emit("districtAwaken", { id: "riverside", name: "川辺", x: 60, z: 0 });
  bus.emit("encounterComplete", { id: 1, kind: "foxfireTrail", title: "狐火を追う", x: 10, z: 10 });
  bus.emit("encounterComplete", { id: 2, kind: "foxfireTrail", title: "狐火を追う", x: 12, z: 10 });
  bus.emit("miniParadeMerge", { id: 3, n: 5, x: 0, z: -20 });
  bus.emit("activityComplete", { id: "torii", title: "千本鳥居をくぐる", reward: { type: "kitsune", n: 3 } });
  bus.emit("rejoin", { type: "", total: 10 });
  for (let t = 40; t < 80; t += 0.5) {
    now = t;
    rec.track(t, -118 + t);
  }
  rec.end("dawn", 0, 100);
  now = 200;
  bus.emit("join", { type: "tengu", total: 11, first: true, x: 0, y: 0, z: 0 });

  assert.equal(rec.log.firstFriend!.type, "kappa");
  assert.equal(rec.log.firstFriend!.district, "川辺");
  assert.deepEqual(rec.districtsAwakened, ["riverside"]);
  assert.equal(rec.encountersByKind.get("foxfireTrail"), 2);
  assert.deepEqual(rec.activitiesDone, ["千本鳥居をくぐる"]);
  const kinds = rec.log.timeline().map((e) => e.kind);
  assert.deepEqual(kinds.filter((k) => k === "milestone").length, 1, "散って戻った 10 妖も節目になる");
  assert.equal(kinds[kinds.length - 1], "end");
  assert.ok(rec.log.route.length > 5 && rec.log.route.length < 40, `route=${rec.log.route.length}`);
  assert.equal(rec.log.companions.length, 1, "夜が明けた後の加入は記録しない");
});

test("絵巻雲：妖怪の数とともに増えるが、常に最大にはしない", () => {
  const levels = [1, 9, 10, 29, 30, 49, 50, 79, 80, 99, 100, 150].map(cloudLevelForCount);
  assert.equal(levels[0], 0);
  assert.equal(levels[1], 0, "1〜9 妖はほぼ無し");
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] >= levels[i - 1]);
  assert.ok(levels[2] > 0 && levels[2] < 0.2, "10〜29 妖は非常に薄い");
  assert.ok(levels[levels.length - 1] < 1, "百妖でも常時最大強度にはしない");
});
