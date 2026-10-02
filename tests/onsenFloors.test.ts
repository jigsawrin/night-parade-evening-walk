// 温泉宿「宵霞楼」：二階・三階と階段（上の階は上るまで作らない・見せない）、湯に入る・顔が赤くなるまで
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ONSEN_FLOOR_Y, ONSEN_POOLS, ONSEN_SPOTS, ONSEN_STAIRS, ONSEN_UPPER, POOL_ENTRY_W, type ORect } from "../src/data/onsenMap.ts";
import { ONSEN_AREAS, ONSEN_BATH } from "../src/data/onsen.ts";
import {
  SHOW_UPPER_AT, floorsToPrepare, groundAt, levelKey, poolDepth, poolRimRects, shownFloor, stairColliders, stepBathHeat, stepLevel,
  type OnsenLevel,
} from "../src/game/onsen/OnsenGroundRules.ts";

const inR = (r: ORect, x: number, z: number, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
const F1: OnsenLevel = { floor: 1, stair: null };
const s1 = ONSEN_STAIRS.find((s) => s.id === "s1")!;
const s2 = ONSEN_STAIRS.find((s) => s.id === "s2")!;

/** 階段の中心線に沿って、下の端の外（-0.5）から上の端の外（1.5）まで歩く */
function walk(lv: OnsenLevel, s: typeof s1, from: number, to: number) {
  const r = s.r;
  const len = s.up === "-x" || s.up === "+x" ? r.x1 - r.x0 : r.z1 - r.z0;
  const pos = (k: number) => {
    const d = k * len;
    switch (s.up) {
      case "-x": return [r.x1 - d, (r.z0 + r.z1) / 2];
      case "+x": return [r.x0 + d, (r.z0 + r.z1) / 2];
      case "-z": return [(r.x0 + r.x1) / 2, r.z1 - d];
      default: return [(r.x0 + r.x1) / 2, r.z0 + d];
    }
  };
  const trace: { lv: OnsenLevel; y: number; shown: number }[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const [x, z] = pos(from + ((to - from) * i) / n);
    lv = stepLevel(lv, x, z);
    trace.push({ lv, y: groundAt(lv, x, z, ONSEN_BATH), shown: shownFloor(lv, x, z) });
  }
  return trace;
}

test("階段：下の端から上ると上の階へ、上の端から下りると下の階へ。高さはなめらかにつながる", () => {
  const up = walk(F1, s1, -0.3, 1.3);
  assert.deepEqual(up.at(-1)!.lv, { floor: 2, stair: null });
  assert.equal(up.at(-1)!.y, ONSEN_FLOOR_Y[2]);
  for (let i = 1; i < up.length; i++) assert.ok(Math.abs(up[i].y - up[i - 1].y) < 0.25, `段差なし ${i}`);
  const down = walk(up.at(-1)!.lv, s1, 1.3, -0.3);
  assert.deepEqual(down.at(-1)!.lv, F1);
  assert.equal(down.at(-1)!.y, 0);
  // 二階から三階へ
  const up3 = walk({ floor: 2, stair: null }, s2, -0.3, 1.3);
  assert.deepEqual(up3.at(-1)!.lv, { floor: 3, stair: null });
  assert.equal(up3.at(-1)!.y, ONSEN_FLOOR_Y[3]);
});

test("階段：途中で引き返しても元の階。ほかの階の階段には入らない", () => {
  const half = walk(F1, s1, -0.3, 0.6);
  const back = walk(half.at(-1)!.lv, s1, 0.6, -0.3);
  assert.deepEqual(back.at(-1)!.lv, F1);
  // 一階から、二階→三階の階段（二階の真ん中の真下）には入らない
  const x = (s2.r.x0 + s2.r.x1) / 2, z = (s2.r.z0 + s2.r.z1) / 2;
  assert.deepEqual(stepLevel(F1, x, z), F1);
  assert.equal(levelKey(F1), "1");
  assert.equal(levelKey({ floor: 1, stair: "s1" }), "s1");
});

test("上の階は、上りきる手前まで見せない（下の階にいる間は上の階がカメラ・見た目の邪魔をしない）", () => {
  const up = walk(F1, s1, -0.3, 1.3);
  for (const t of up) if (!t.lv.stair && t.lv.floor === 1) assert.equal(t.shown, 1);
  for (const t of up) if (t.shown === 1) assert.ok(t.y < ONSEN_FLOOR_Y[2]);
  const firstShown = up.findIndex((t) => t.shown === 2);
  assert.ok(firstShown > 0 && up[firstShown].y >= ONSEN_FLOOR_Y[2] * SHOW_UPPER_AT - 0.01, "上りきる手前で見せる");
  assert.ok(SHOW_UPPER_AT >= 0.8);
});

test("上の階は入り口では用意しない。上る階段に近づいた・上りはじめたときだけ", () => {
  assert.deepEqual(floorsToPrepare(F1, 0, -33), [], "宿に着いたところ");
  assert.deepEqual(floorsToPrepare(F1, 0, -8), [], "大広間の真ん中");
  assert.deepEqual(floorsToPrepare(F1, s1.r.x1 + 1, (s1.r.z0 + s1.r.z1) / 2), [2], "階段の下");
  assert.deepEqual(floorsToPrepare({ floor: 1, stair: "s1" }, -24, -15.8), [2]);
  assert.deepEqual(floorsToPrepare({ floor: 2, stair: null }, (s2.r.x0 + s2.r.x1) / 2, s2.r.z1 + 1), [3]);
  // 作るのは OnsenApp の毎フレームの見直しからだけ（宿を組み立てるときには作らない）
  const world = readFileSync("src/onsen/OnsenWorld.ts", "utf8");
  const build = world.slice(world.indexOf("  build() {"), world.indexOf("\n  }\n", world.indexOf("  build() {")));
  assert.ok(!/buildFloor|buildUpperFloor/.test(build));
  const app = readFileSync("src/onsen/OnsenApp.ts", "utf8");
  assert.match(app, /for \(const n of floorsToPrepare\(lv, player\.x, player\.z\)\) world\.buildFloor\(n\);/);
});

test("階段の当たり：脇からは入れない・上りきった先は下の階でくぐれない・上の階では下り口の先に柵", () => {
  for (const s of ONSEN_STAIRS) {
    const c = stairColliders(s);
    const lo = String(s.lower), hi = String(s.upper);
    assert.equal(c.filter((q) => q.lv.includes(lo) && q.lv.includes(hi) && q.lv.includes(s.id)).length, 2, `${s.id} 両脇`);
    assert.ok(c.some((q) => q.r === s.landing && q.lv.join() === lo), `${s.id} 上りきった先`);
    assert.ok(c.some((q) => q.lv.join() === hi && !inR(q.r, (s.r.x0 + s.r.x1) / 2, (s.r.z0 + s.r.z1) / 2)), `${s.id} 下り口の先`);
    // 階段の途中で効くのは両脇だけ（端から出られる）
    assert.equal(c.filter((q) => q.lv.includes(s.id)).length, 2);
    // 上の階の床の中にある
    const U = ONSEN_UPPER[s.upper];
    assert.ok(inR(U, s.landing.x0, s.landing.z0, 0.2) && inR(U, s.landing.x1, s.landing.z1, 0.2), `${s.id} 上りきった先は上の階の床`);
  }
});

test("上の階の居場所：その階の床の上（階段・上りきった先ではない）。大きな妖怪は上がらない。区域は入り口で開く", () => {
  const up = ONSEN_SPOTS.filter((s) => (s.floor ?? 1) > 1);
  assert.ok(up.some((s) => s.floor === 2) && up.some((s) => s.floor === 3));
  for (const s of up) {
    assert.ok(inR(ONSEN_UPPER[s.floor!], s.x, s.z, -0.5), `${s.id} は床の上`);
    for (const st of ONSEN_STAIRS) {
      if (st.lower === s.floor || st.upper === s.floor) assert.ok(!inR(st.r, s.x, s.z, 0.8), `${s.id} は階段にかからない`);
      if (st.lower === s.floor) assert.ok(!inR(st.landing, s.x, s.z, 0.8), `${s.id} は上りきった先の下ではない`);
    }
    assert.ok(s.maxScale < 1.7, `${s.id} 大きな妖怪は上の階へ上がらない`);
    assert.notEqual(s.pose, "soak");
    assert.equal(ONSEN_AREAS[s.area].zone, "base");
  }
});

test("湯：縁の切れ目からだけ入れる。湯の中は沈み（宿泊客と同じ高さ）、ゆっくり歩く", () => {
  for (const p of ONSEN_POOLS) {
    const rims = poolRimRects(p);
    assert.ok(!rims.some((r) => inR(r, p.entry.x, p.entry.z, 0.5)), `${p.id} 切れ目は通れる`);
    const w = rims.reduce((a, r) => a + Math.max(r.x1 - r.x0, r.z1 - r.z0), 0);
    const perim = 2 * (p.r.x1 - p.r.x0 + p.r.z1 - p.r.z0);
    assert.ok(Math.abs(perim - POOL_ENTRY_W - w) < 0.05, `${p.id} 切れ目のほかは縁`);
    const cx = (p.r.x0 + p.r.x1) / 2, cz = (p.r.z0 + p.r.z1) / 2;
    assert.equal(poolDepth(cx, cz, ONSEN_BATH.depthRamp), 1);
    assert.equal(groundAt(F1, cx, cz, ONSEN_BATH), p.y - ONSEN_BATH.sink, "宿泊客の湯につかる高さと同じ");
    assert.equal(groundAt({ floor: 2, stair: null }, cx, cz, ONSEN_BATH), ONSEN_FLOOR_Y[2], "上の階では沈まない");
  }
  assert.equal(poolDepth(0, -33, ONSEN_BATH.depthRamp), 0);
  assert.equal(groundAt(F1, 0, -33, ONSEN_BATH), 0);
  assert.ok(ONSEN_BATH.speed > 0 && ONSEN_BATH.speed < 1);
});

test("湯あたり：10 秒ほど浸かると顔がほんのり赤くなりはじめ、上がると少しずつ冷める", () => {
  let heat = 0;
  let blush = 0;
  const dt = 0.1;
  for (let t = 0; t < ONSEN_BATH.blushAfter - 0.2; t += dt) ({ heat, blush } = stepBathHeat(heat, true, dt, ONSEN_BATH));
  assert.equal(blush, 0, "浸かってすぐは赤くならない");
  for (let t = 0; t < ONSEN_BATH.blushRamp + 1; t += dt) ({ heat, blush } = stepBathHeat(heat, true, dt, ONSEN_BATH));
  assert.equal(blush, 1);
  assert.ok(ONSEN_BATH.blushAfter >= 8 && ONSEN_BATH.blushAfter <= 12, "10 秒ほど");
  // 上がると少しずつ冷める（すぐには消えない）
  ({ heat, blush } = stepBathHeat(heat, false, 1, ONSEN_BATH));
  assert.ok(blush > 0 && blush < 1);
  for (let t = 0; t < 60; t += dt) ({ heat, blush } = stepBathHeat(heat, false, dt, ONSEN_BATH));
  assert.equal(blush, 0);
  assert.equal(heat, 0);
});

test("湯あたりの赤み：顔の位置はデータ（本番モデルに差し替えても値を合わせれば効く）。モデルの色は変えない", () => {
  const models = readFileSync("src/characters/models.ts", "utf8");
  assert.match(models, /export const FACE_ANCHORS/);
  const bath = readFileSync("src/onsen/OnsenBath.ts", "utf8");
  assert.match(bath, /m\.parent = player\.actor\.mesh/, "Actor の見た目についていく");
  assert.ok(!/mats\.char|\.char\b/.test(bath), "キャラクターの材質を書き換えない");
  const doc = readFileSync("docs/architecture.md", "utf8");
  assert.match(doc, /本番モデル/, "差し替えのときのメモ");
});

test("カメラ：宿の壁ではカメラを寄せない（外周の森だけ）。吹き出しの外をタップしても会話を送る。足元の影は床より上", () => {
  const world = readFileSync("src/onsen/OnsenWorld.ts", "utf8");
  const cam = world.slice(world.indexOf("  cameraObstacle("), world.indexOf("\n  }\n", world.indexOf("  cameraObstacle(")));
  assert.ok(!/ONSEN_WALLS/.test(cam), "壁は遮りにしない");
  const app = readFileSync("src/onsen/OnsenApp.ts", "utf8");
  assert.match(app, /if \(talkingTo\) \{\s*\/\/[^\n]*\n\s*if \(inp\.tap\) talk\(\);/);
  assert.match(app, /player\.actor\.shadow\.position\.y = \(lv\.stair \? py : ONSEN_FLOOR_Y\[lv\.floor\]\) \+ SHADOW_LIFT;/);
  assert.match(app, /small: SMALL_FADE_R/);
});

test("階段の透かし：上っている階段は近くにいても透かさない（下にいるときは透ける）。上の階の階段も透かせる。玄関の暖簾は近づくと透ける", () => {
  const app = readFileSync("src/onsen/OnsenApp.ts", "utf8");
  assert.match(app, /structures\.setSolidIds\(solidStair \? world\.stairIds\[solidStair\] \?\? \[\] : \[\]\)/);
  assert.match(app, /new StructureVisibilityDirector\(.*, UPPER_GROUPS\);/, "上の階の階段の分の空き");
  const up = readFileSync("src/onsen/build/upperBuild.ts", "utf8");
  assert.match(up, /k\.fadeGroup\(\(k\.stairIds\[s2\.id\] \?\?= \[\]\)/);
  assert.match(up, /k\.track\(\(k\.stairIds\[s\.id\] \?\?= \[\]\)/);
  const dir = readFileSync("src/presentation/StructureVisibilityDirector.ts", "utf8");
  assert.match(dir, /for \(const id of this\.solidIds\) if \(this\.target\[id\] > 0\) this\.target\[id\] = 1;/, "写真で隠すのは優先");
  const inn = readFileSync("src/onsen/build/innBuild.ts", "utf8");
  assert.match(inn, /k\.group\("building", true, \(\) => \{\s*for \(let i = -2; i <= 2; i\+\+\) k\.box\(i \* 1\.2, 2\.45/);
});
