import { test } from "node:test";
import assert from "node:assert/strict";
import { Emitter } from "../src/core/Events.ts";
import { NightSeed, makeRng } from "../src/core/seed.ts";
import { ENCOUNTERS } from "../src/data/encounters.ts";
import type { GameEvents } from "../src/game/events.ts";
import { EventDeck } from "../src/game/EventDeck.ts";
import { EncounterScheduler } from "../src/game/EncounterScheduler.ts";
import { NightPacingDirector } from "../src/game/NightPacingDirector.ts";
import { DistrictAwakeningSystem } from "../src/game/DistrictAwakeningSystem.ts";
import { FestivalMomentum } from "../src/game/FestivalMomentum.ts";
import { HokoraCircle } from "../src/game/encounters/HokoraCircle.ts";
import type { EncounterContext } from "../src/game/encounters/types.ts";

/**
 * 自動成長の禁止：60 秒放置しても、妖怪は勝手に増えない。
 * 放置中に動きうるルール（Pacing・噂・地区覚醒・賑わい・祠）をまとめて 60 秒進め、加入・妖怪の出現が一度も起きないことを確かめる。
 */
test("放置 60 秒：Pacing・噂・地区覚醒・賑わい・祠のどれも、妖怪を増やさない", () => {
  const bus = new Emitter<GameEvents>();
  const joined: string[] = [];
  const spawned: string[] = [];
  bus.on("join", (e) => joined.push(e.type));
  const player = { x: 0, z: -20, vx: 0, vz: 0 };
  const parade = { count: 59, total: 60, tail: (o: { x: number; z: number }) => { o.x = player.x; o.z = player.z; } };

  const pacing = new NightPacingDirector();
  const seed = new NightSeed(2024);
  const sched = new EncounterScheduler(new EventDeck(ENCOUNTERS, seed.stream("deck")), seed.stream("schedule"));
  const districts = new DistrictAwakeningSystem(bus, parade, player, { revealDistrict: () => void spawned.push("district") });
  const momentum = new FestivalMomentum();
  momentum.setParadeSize(60);
  const ctx = {
    factory: { instance: () => ({ position: { set() {} }, rotation: { y: 0 }, dispose() {} }) },
    world: { nearestWalkable: (x: number, z: number) => ({ x, z }), addCircle: () => () => {} },
    bus, parade, player,
    wild: { spawnWild: (type: string) => void spawned.push(type) },
    rng: makeRng(1), theme: "oni", typeCounts: new Map(), typeBias: new Map(),
  } as unknown as EncounterContext;
  const hokora = new HokoraCircle(1, ENCOUNTERS.find((e) => e.kind === "hokoraCircle")!, { id: "h", x: 20, z: -20, tags: [] }, ctx);

  // 噂が既に一つ出ている状態から放置する
  const view = (t: number) => ({
    t, px: player.x, pz: player.z, fx: 0, fz: 0, total: 60, activeKinds: [], busy: new Set<string>(),
    districtOf: () => null, districtVisit: () => undefined,
  });
  assert.ok(sched.offer(view(0), "pacing").length);
  let pacingActs = 0;
  for (let t = 0.25; t <= 60; t += 0.25) {
    if (pacing.update(0.25, { moving: false, exploring: false, stageIndex: 4 })) pacingActs++;
    const tick = sched.update(view(t));
    assert.equal(tick.promoted, null);
    districts.update(t);
    momentum.observe(t, player.x, player.z, parade.count);
    momentum.decay(0.25, t);
    hokora.update(0.25);
  }
  assert.equal(pacingActs, 0);
  assert.deepEqual(joined, []);
  assert.deepEqual(spawned, []);
  assert.equal(parade.total, 60);
  assert.ok(momentum.value < 1.5);
});
