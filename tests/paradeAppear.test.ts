// 行列の数に誘われて姿を見せる妖怪（後から混ざる妖怪ほど大きな行列で）と、中盤から百妖までの音の段
import { test } from "node:test";
import assert from "node:assert/strict";
import { YOKAI, YOKAI_ORDER } from "../src/data/yokaiTypes.ts";
import { NORMAL_ZUKAN_ORDER } from "../src/data/zukanOrder.ts";
import { PARADE_APPEAR } from "../src/data/paradeAppear.ts";
import { MUSIC_SWELLS, STAGES, swellsFor } from "../src/data/stages.ts";
import { ParadeAppearHold, appearCount } from "../src/game/ParadeAppearRules.ts";
import { zukanEntry } from "../src/game/ZukanRules.ts";
import { entryCardHtml } from "../src/presentation/zukan/ZukanCards.ts";

test("出現：はじめの 12 種はいつでも、後から混ざる段ほど大きな行列で。大妖怪・三大妖怪は百に近い数、隠し妖怪は対象外", () => {
  for (const id of NORMAL_ZUKAN_ORDER.slice(0, 12)) assert.equal(appearCount(YOKAI[id]), 0, id);
  // 図鑑の順（＝町に混ざる順）に、要る数が減らない
  let prev = 0;
  for (const id of NORMAL_ZUKAN_ORDER) {
    const n = appearCount(YOKAI[id]);
    assert.ok(n >= prev, `${id}：${n} < ${prev}`);
    assert.equal(n, PARADE_APPEAR.normal[YOKAI[id].normalWave ?? 0], id);
    prev = n;
  }
  assert.ok(PARADE_APPEAR.normal.every((n, i, a) => i === 0 || n > a[i - 1]), "段ごとに増える");
  for (const id of YOKAI_ORDER) {
    const d = YOKAI[id];
    if (d.discovery === "hidden") assert.equal(appearCount(d), 0, `${id}：隠し妖怪は見つけ方が別`);
    else if (d.rank === "greater") assert.equal(appearCount(d), PARADE_APPEAR.greater, id);
    else if (d.rank === "threeGreat") assert.equal(appearCount(d), PARADE_APPEAR.threeGreat, id);
  }
  assert.ok(PARADE_APPEAR.greater >= 80 && PARADE_APPEAR.threeGreat >= PARADE_APPEAR.greater && PARADE_APPEAR.threeGreat <= 100, "百に近い数");
  assert.ok(PARADE_APPEAR.greater > Math.max(...PARADE_APPEAR.normal), "大妖怪は通常妖怪のどの段より後");
  assert.equal(appearCount(YOKAI.hakutaku), PARADE_APPEAR.normal[4], "白沢は通常妖怪の段");
  assert.equal(appearCount(YOKAI.shinno_akugoro), PARADE_APPEAR.greater, "神野悪五郎は大妖怪");
});

test("出現：数が届くまで預かり、届いたら渡す（一度渡したら、数が減っても戻さない）", () => {
  const hold = new ParadeAppearHold<{ id: string; need?: number; held?: boolean }>();
  const a = { id: "a", need: 10 }, b = { id: "b", need: 30 }, c = { id: "c" };
  assert.equal(hold.defer(a, 5), true);
  assert.equal(hold.defer(a, 6), true, "何度呼んでも一つだけ預かる");
  assert.equal(hold.defer(b, 5), true);
  assert.equal(hold.defer(c, 5), false, "要る数が無ければすぐ");
  assert.equal(hold.defer({ id: "d", need: 5 }, 5), false, "届いていればすぐ");
  assert.equal(hold.size, 2);
  const shown: string[] = [];
  const show = (x: { id: string }) => (shown.push(x.id), true);
  assert.equal(hold.tick(0.6, 9, show), 0);
  assert.equal(hold.tick(0.6, 12, show), 1);
  assert.deepEqual(shown, ["a"]);
  assert.equal(a.need, undefined);
  assert.equal(hold.tick(0.1, 40, show), 0, "低頻度でしか見ない");
  assert.equal(hold.tick(0.6, 40, show), 1);
  assert.deepEqual(shown, ["a", "b"]);
  assert.equal(hold.size, 0);
});

test("図鑑：行列の数に誘われて現れる妖怪は、出会い方にその数を添える（はじめの 12 種には付けない）", () => {
  const yuki = entryCardHtml(zukanEntry("yukionna", { yukionna: 1 }, { met: [], joinCount: {} })!, { mode: "ink", inkUrl: null, hasModel: true, icon: "雪" }, { tonight: 0 });
  assert.match(yuki, /行列が十妖に届くと、町に姿を見せる。/);
  const shuten = entryCardHtml(zukanEntry("shuten", { shuten: 1 }, { met: [], joinCount: {} })!, { mode: "ink", inkUrl: null, hasModel: true, icon: "酒" }, { tonight: 0 });
  assert.match(shuten, /行列が百妖に届くと/);
  const oni = entryCardHtml(zukanEntry("oni", { oni: 1 }, { met: [], joinCount: {} })!, { mode: "ink", inkUrl: null, hasModel: true, icon: "鬼" }, { tonight: 0 });
  assert.ok(!/届くと/.test(oni));
});

test("音楽：30 妖までの音は変えない。中盤（40）から百妖まで、昔の鳴り物が一つずつ加わる", () => {
  // はじめの無音・最初に鳴りだす笛・行列・宴の音（お気に入り）をそのまま守る
  assert.deepEqual(STAGES.slice(0, 4).map((s) => [s.minCount, s.tempo, s.music]), [
    [1, 84, { A: 1, B: 0, C: 0, D: 0, E: 0, F: 0 }],
    [5, 86, { A: 0.9, B: 1, C: 0, D: 0, E: 0, F: 0 }],
    [15, 88, { A: 0.7, B: 1, C: 0.9, D: 0.8, E: 0, F: 0 }],
    [30, 92, { A: 0.5, B: 1, C: 1, D: 0.9, E: 1, F: 0.3 }],
  ]);
  for (let n = 0; n < 40; n++) {
    const w = swellsFor(n);
    assert.ok(Object.values(w.levels).every((v) => v === 0) && w.tempo === 0, `${n} 妖では何も足さない`);
  }
  const counts = MUSIC_SWELLS.map((s) => s.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b));
  assert.ok(counts[0] >= 40 && counts.at(-1) === 100);
  // 一つずつ加わる（数が増えるほど鳴っている楽器が減らない）・テンポは少しずつ（大きく変えない）
  let prevOn = 0, prevTempo = 0;
  for (let n = 30; n <= 120; n++) {
    const w = swellsFor(n);
    const on = Object.values(w.levels).filter((v) => v > 0).length;
    assert.ok(on >= prevOn && w.tempo >= prevTempo, `${n}`);
    prevOn = on;
    prevTempo = w.tempo;
  }
  assert.equal(prevOn, MUSIC_SWELLS.length);
  assert.ok(prevTempo <= 6, "テンポは少しだけ前のめりに");
  for (const s of MUSIC_SWELLS) assert.ok(s.level > 0 && s.level <= 1, s.id);
});
