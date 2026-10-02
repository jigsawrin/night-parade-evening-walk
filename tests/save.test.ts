import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_KEY, HISTORY_MAX, addZukan, loadHistory, loadZukan, pushHistory, type KV } from "../src/core/SaveData.ts";
import type { NightResult } from "../src/game/after/NightResult.ts";
import { GHOST, fadeTargets, stepFade, type FadeFocus, type HideCategory, type StructureInfo } from "../src/world/structureFade.ts";

function memKV(limit = Infinity): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
  };
}

const result = (i: number): NightResult => ({
  version: 1, endedAt: 1000 + i, seed: 100 + i, theme: "狐火の灯る夜", themeType: "kitsune", reason: "shrine", elapsed: 600, nightLength: 1200,
  total: 20 + i, stage: "行列", types: [["oni", 10]], typeCount: 1, topType: "oni", encountersDone: 1, encountersByKind: [], miniMerged: 0,
  activitiesDone: [], districtsAwakened: [], districtsWalked: [], peakMomentum: 30, scatters: 0, hundred: false, score: 300 + i, scoreParts: [],
  titles: [], roles: [], friend: null, hundredth: null, legends: [], highlights: [], timeline: [],
  route: [{ x: 1.23456, z: -2.98765, t: 3.14159 }],
});

test("結果の履歴：新しい順に直近 10 件だけ残し、ルートは小さくして保存", () => {
  const kv = memKV();
  for (let i = 0; i < 13; i++) pushHistory(kv, result(i));
  const list = loadHistory(kv);
  assert.equal(list.length, HISTORY_MAX);
  assert.equal(list[0].seed, 112, "いちばん新しい夜が先頭");
  assert.equal(list[9].seed, 103, "古い 3 件は消える");
  assert.deepEqual(list[0].route[0], { x: 1.2, z: -3, t: 3.1 });
});

test("結果の履歴：壊れたデータや保存できない環境でも落ちない。容量を超えたら古い夜から減らす", () => {
  const kv = memKV();
  kv.map.set(HISTORY_KEY, "{壊れた");
  assert.deepEqual(loadHistory(kv), []);
  assert.deepEqual(loadHistory(null), []);
  assert.equal(pushHistory(null, result(1)).length, 0, "保存先が無ければ何も残らない（遊ぶのは問題ない）");
  const one = JSON.stringify([result(0)]).length;
  const small = memKV(one * 3.5);
  for (let i = 0; i < 6; i++) pushHistory(small, result(i));
  const kept = loadHistory(small);
  assert.ok(kept.length >= 1 && kept.length <= 3, `kept=${kept.length}`);
  assert.equal(kept[0].seed, 105);
});

test("図鑑：すべての夜の合計を保存し、次の夜にも残る", () => {
  const kv = memKV();
  addZukan(kv, "kappa");
  addZukan(kv, "kappa");
  addZukan(kv, "oni", 3);
  assert.deepEqual(loadZukan(kv), { kappa: 2, oni: 3 });
  assert.deepEqual(loadZukan(null), {});
});

// ---------------------------------------------------------------- 建物の透過

const S = (id: number, cat: StructureInfo["cat"], x: number, z: number, fadeable = true, top = 5): StructureInfo =>
  ({ id, cat, x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3, top, fadeable });
const town = [
  S(1, "building", 0, 8), // 主人公のすぐ横の家
  S(2, "building", 0, 40), // 遠くの家
  S(3, "tree", 30, 0), // 行列の横の木
  S(4, "building", 0, -20), // カメラと主人公の間
  S(5, "building", 2, 7, false, 3), // 提灯（透かさない）
  S(6, "landmark", 60, 60),
];
const focus = (o: Partial<FadeFocus> = {}): FadeFocus => ({
  mode: 1, player: { x: 0, y: 0, z: 0 }, camera: { x: 0, y: 3, z: -40 }, parade: [{ x: 30, z: 5 }], ...o,
});
const G = Math.fround(GHOST);
const run = (f: FadeFocus, hidden: HideCategory[] = []) => {
  const out = new Float32Array(town.length + 1).fill(1);
  fadeTargets(town, f, new Set(hidden), out);
  return out;
};

test("建物の透過：主人公の近く・カメラと主人公の間をふさぐ建物を透かし、遠くの家と小物はそのまま", () => {
  const v = run(focus());
  assert.equal(v[1], G);
  assert.equal(v[2], 1);
  assert.equal(v[4], G, "カメラと主人公の間");
  assert.equal(v[5], 1, "提灯などの小物は透かさない");
  // 高い視点から見下ろしていれば、間の低い家はふさがない
  assert.equal(run(focus({ camera: { x: 0, y: 30, z: -40 } }))[4], 1);
});

test("建物の透過：百鬼夜行のまわりは設定が「百鬼夜行も」のときだけ。「切」なら何も透かさない", () => {
  assert.equal(run(focus({ mode: 1 }))[3], 1);
  assert.equal(run(focus({ mode: 2 }))[3], G);
  const off = run(focus({ mode: 0 }));
  assert.ok([...off].every((x) => x === 1));
});

test("写真から隠す：分類ごとに 0（重要な建物・その他の建築物・木）。透過の設定に関係なく隠れる", () => {
  const v = run(focus({ mode: 0, player: null }), ["building", "tree"]);
  assert.deepEqual([v[1], v[2], v[3], v[4], v[5], v[6]], [0, 0, 0, 0, 0, 1]);
  const lm = run(focus({ mode: 0, player: null }), ["landmark"]);
  assert.equal(lm[6], 0);
  assert.equal(lm[1], 1);
});

test("建物の透過：濃さはなめらかに変わる（消えるのは速く、戻るのはゆっくり）", () => {
  const cur = new Float32Array([1, 1, GHOST]);
  const target = new Float32Array([1, GHOST, 1]);
  assert.ok(stepFade(cur, target, 0.05));
  assert.ok(cur[1] < 1 && cur[1] > GHOST);
  assert.ok(1 - cur[1] > cur[2] - GHOST, "消える方が速い");
  for (let i = 0; i < 40; i++) stepFade(cur, target, 0.05);
  assert.deepEqual([...cur], [1, GHOST, 1].map((x) => Math.fround(x)));
  assert.equal(stepFade(cur, target, 0.05), false);
});

test("建物の透過（温泉宿）：small を渡すと、主人公のそばの背の高い小物・カメラと主人公の間の小物も透かす。低い物・足元より下の物は透かさない", () => {
  const list = [
    S(1, "building", 1, 1, false, 3), // 主人公のそばの提灯
    S(2, "building", 1, 1, false, 0.5), // そばの座卓（低い）
    S(3, "building", 0, -20, false, 4), // カメラと主人公の間の提灯の柱
    S(4, "building", 0, 20, false, 4), // 遠くの提灯
    S(5, "building", 0, 0, true, 2.6), // 上の階から見た、真下の壁（足元より低い）
  ];
  const at = (f: FadeFocus) => {
    const out = new Float32Array(list.length + 1).fill(1);
    fadeTargets(list, f, new Set(), out);
    return out;
  };
  const v = at(focus({ small: 3 }));
  assert.equal(v[1], G);
  assert.equal(v[2], 1, "低い物はそのまま");
  assert.equal(v[3], G, "カメラと主人公の間");
  assert.equal(v[4], 1);
  // small を渡さなければ町と同じ（小物はそのまま）
  const town0 = at(focus());
  assert.equal(town0[1], 1);
  assert.equal(town0[3], 1);
  // 主人公が二階（足元 3.4）にいれば、真下の一階の壁は近くても透かさない
  const up = at(focus({ small: 3, player: { x: 0, y: 3.4, z: 0 }, camera: { x: 0, y: 12, z: -9 } }));
  assert.equal(up[5], 1);
  assert.equal(at(focus({ small: 3 }))[5], G, "同じ階なら透かす");
});
