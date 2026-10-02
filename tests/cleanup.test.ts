import { test } from "node:test";
import assert from "node:assert/strict";
import { Emitter } from "../src/core/Events.ts";
import { makeRng } from "../src/core/seed.ts";
import { ENCOUNTERS } from "../src/data/encounters.ts";
import type { GameEvents } from "../src/game/events.ts";
import { OwnedResources } from "../src/game/encounters/Owned.ts";
import { settleEncounters } from "../src/game/encounters/lifecycle.ts";
import { HokoraCircle } from "../src/game/encounters/HokoraCircle.ts";
import type { EncounterContext, EncounterRuntime, EncounterStatus } from "../src/game/encounters/types.ts";

/** World.addCircle と同じ振る舞い（一時コライダーの登録・解除）だけを持つ偽の World */
function fakeWorld() {
  const circles: { x: number; z: number; r: number }[] = [];
  return {
    circles,
    nearestWalkable: (x: number, z: number) => ({ x, z }),
    addCircle(x: number, z: number, r: number) {
      const c = { x, z, r };
      circles.push(c);
      return () => {
        const i = circles.indexOf(c);
        if (i >= 0) circles.splice(i, 1);
      };
    },
  };
}

function hokoraCtx(count = 20) {
  const world = fakeWorld();
  const props: { disposed: boolean }[] = [];
  const spawned: string[] = [];
  const player = { x: 0, z: 0, vx: 0, vz: 0 };
  const bus = new Emitter<GameEvents>();
  const ctx = {
    factory: {
      instance() {
        const m = { disposed: false, position: { set() {} }, rotation: { y: 0 }, dispose() { m.disposed = true; } };
        props.push(m);
        return m;
      },
    },
    world,
    bus,
    parade: { count, total: count + 1 },
    player,
    wild: { spawnWild: (type: string) => void spawned.push(type) },
    rng: makeRng(1),
    theme: "zashiki",
    typeCounts: new Map(),
    typeBias: new Map(),
  } as unknown as EncounterContext;
  return { ctx, world, props, spawned, player, bus };
}

const HOKORA = ENCOUNTERS.find((e) => e.kind === "hokoraCircle")!;
const SITE = { id: "test", x: 40, z: 40, tags: [] };

/** 祠の周りを一周歩く（半径 5） */
function walkAround(h: HokoraCircle, player: { x: number; z: number }) {
  let st: EncounterStatus = "running";
  for (let i = 0; i <= 80 && st === "running"; i++) {
    const a = (i / 64) * Math.PI * 2;
    player.x = SITE.x + Math.cos(a) * 5;
    player.z = SITE.z + Math.sin(a) * 5;
    st = h.update(0.1);
  }
  return st;
}

test("OwnedResources：dispose で全部片付き、release したもの（行列へ移譲した Actor）は消さない", () => {
  const o = new OwnedResources();
  const gone: string[] = [];
  const a = { n: "a" }, b = { n: "b" }, c = { n: "c" };
  o.own(a, () => gone.push("a"));
  o.own(b, () => gone.push("b"));
  o.own(c, () => gone.push("c"));
  assert.ok(o.release(b));
  assert.ok(o.disposeOne(c));
  o.dispose();
  o.dispose();
  assert.deepEqual(gone.sort(), ["a", "c"]);
  // dispose 後に預けたものは、その場で片付く
  o.own({}, () => gone.push("late"));
  assert.ok(gone.includes("late"));
});

test("Encounter：complete でも expired でも dispose される（一度だけ）", () => {
  const disposed: number[] = [];
  const settled: [number, string][] = [];
  const mk = (id: number, when: number, st: EncounterStatus): EncounterRuntime => ({
    id, def: HOKORA, x: 0, z: 0, omen: "suzu",
    update: (_dt, t) => (t >= when ? st : "running"),
    dispose: () => void disposed.push(id),
    status: () => "",
  });
  const active = [mk(1, 1, "complete"), mk(2, 2, "expired"), mk(3, 99, "complete")];
  for (let t = 0; t < 5; t += 0.5) settleEncounters(active, 0.5, t, (e, st) => settled.push([e.id, st]));
  assert.deepEqual(disposed.sort(), [1, 2]);
  assert.deepEqual(settled, [[1, "complete"], [2, "expired"]]);
  assert.deepEqual(active.map((e) => e.id), [3]);
});

test("HokoraCircle：成就すると祠が片付き、一時 circle コライダーが外れる", () => {
  const { ctx, world, props, spawned, player } = hokoraCtx();
  const active: EncounterRuntime[] = [new HokoraCircle(1, HOKORA, SITE, ctx)];
  assert.equal(world.circles.length, 1, "祠のコライダーが置かれる");
  assert.equal(props.length, 1);
  const h = active[0] as HokoraCircle;
  assert.equal(walkAround(h, player), "complete");
  assert.ok(spawned.length >= HOKORA.size[0], "祠の妖怪が姿を見せる（加入は触れてから）");
  // EncounterDirector と同じ片付け
  const settled: string[] = [];
  settleEncounters(active, 0.1, 0, (_e, st) => settled.push(st));
  assert.deepEqual(settled, ["complete"]);
  assert.equal(world.circles.length, 0, "見えない障害物が残らない");
  assert.ok(props[0].disposed, "祠の小道具が残らない");
  assert.equal(h.owned.size, 0);
});

test("HokoraCircle：気配が薄れて終わっても（expired）同じく片付く", () => {
  const { ctx, world, props, player } = hokoraCtx();
  player.x = 400;
  player.z = 400;
  const active: EncounterRuntime[] = [new HokoraCircle(1, HOKORA, SITE, ctx)];
  const settled: string[] = [];
  for (let t = 0; t < 260 && active.length; t += 0.5) settleEncounters(active, 0.5, t, (_e, st) => settled.push(st));
  assert.deepEqual(settled, ["expired"]);
  assert.equal(world.circles.length, 0);
  assert.ok(props[0].disposed);
});

test("HokoraCircle：山札が再循環して何度出ても、祠とコライダーは積み上がらない", () => {
  const { ctx, world, props, player } = hokoraCtx();
  for (let n = 0; n < 5; n++) {
    const active: EncounterRuntime[] = [new HokoraCircle(n + 1, HOKORA, SITE, ctx)];
    walkAround(active[0] as HokoraCircle, player);
    settleEncounters(active, 0.1, 0, () => {});
  }
  assert.equal(world.circles.length, 0);
  assert.equal(props.filter((p) => !p.disposed).length, 0);
});

test("HokoraCircle：行列が小さいうちは一周しても成就しない（コライダーは場に出ている間だけ）", () => {
  const { ctx, world, spawned, player } = hokoraCtx(3);
  const h = new HokoraCircle(1, HOKORA, SITE, ctx);
  assert.equal(walkAround(h, player), "running");
  assert.equal(spawned.length, 0);
  assert.equal(world.circles.length, 1);
  h.dispose();
  assert.equal(world.circles.length, 0);
});
