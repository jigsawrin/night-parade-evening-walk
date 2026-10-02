import { test } from "node:test";
import assert from "node:assert/strict";
import { Emitter } from "../src/core/Events.ts";
import { DISTRICT_BY_ID } from "../src/data/districts.ts";
import type { GameEvents } from "../src/game/events.ts";
import { DistrictAwakeningSystem, VISIT_GRACE, awakenNeed } from "../src/game/DistrictAwakeningSystem.ts";

/** 商店街（x -108..58, z -34..-6）を東西に歩く */
function setup(total = 40) {
  const bus = new Emitter<GameEvents>();
  const awakened: string[] = [];
  bus.on("districtAwaken", (e) => awakened.push(e.id));
  const player = { x: 0, z: -20 };
  const parade = {
    total,
    // 最後尾は主人公のすぐ後ろ（地区に入っている）
    tail: (o: { x: number; z: number }) => {
      o.x = player.x - 3;
      o.z = player.z;
    },
  };
  const sys = new DistrictAwakeningSystem(bus, parade, player, { revealDistrict: () => 0 });
  let t = 0;
  const walk = (x0: number, x1: number, z = -20) => {
    const n = Math.ceil(Math.abs(x1 - x0) / 1.5);
    for (let i = 0; i <= n; i++) {
      player.x = x0 + ((x1 - x0) * i) / n;
      player.z = z;
      t += 0.25;
      sys.update(t);
    }
  };
  const leave = (sec: number) => {
    player.x = 0;
    player.z = 20; // 広場
    for (let s = 0; s < sec; s += 0.25) {
      t += 0.25;
      sys.update(t);
    }
  };
  return { sys, walk, leave, awakened, player };
}

test("地区覚醒：一回の訪問で十分に練り歩くと目覚める", () => {
  const { sys, walk, awakened } = setup();
  walk(-100, 50);
  assert.deepEqual(awakened, ["shotengai"]);
  assert.equal(sys.awakenedCount, 1);
});

test("地区覚醒：少し歩いて出て、戻ってきても前回分は合算しない（新しい訪問）", () => {
  const { sys, walk, leave, awakened } = setup();
  const need = awakenNeed(DISTRICT_BY_ID.get("shotengai")!, 0);
  // 半分ずつ、別々の訪問で歩く
  walk(-100, -100 + need * 5);
  const first = sys.visitCells("shotengai");
  assert.ok(first > 0 && first < need);
  leave(VISIT_GRACE + 5);
  walk(-100 + need * 5, -100 + need * 10);
  assert.deepEqual(awakened, [], "昔少し歩いた蓄積だけで突然祭りにはならない");
  assert.ok(sys.visitCells("shotengai") < need);
});

test("地区覚醒：境目で少しふらついただけなら同じ訪問のまま", () => {
  const { sys, walk, leave } = setup();
  walk(-100, -60);
  const before = sys.visitCells("shotengai");
  leave(VISIT_GRACE - 3);
  walk(-60, -58);
  assert.ok(sys.visitCells("shotengai") >= before);
});

test("地区覚醒：行列が小さいと歩いても数えない。覚醒させた地区が増えるほど長く歩く", () => {
  const { walk, awakened } = setup(10);
  walk(-100, 50);
  assert.deepEqual(awakened, []);
  const d = DISTRICT_BY_ID.get("shotengai")!;
  assert.ok(awakenNeed(d, 4) > awakenNeed(d, 0));
  assert.ok(awakenNeed(d, 4) <= awakenNeed(d, 0) * 2);
});
