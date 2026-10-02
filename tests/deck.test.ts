import { test } from "node:test";
import assert from "node:assert/strict";
import { NightSeed, parseSeed, makeRng } from "../src/core/seed.ts";
import { EventDeck, composeGroup, pickSite } from "../src/game/EventDeck.ts";
import { ENCOUNTERS, ENCOUNTER_SITES, NIGHT_THEMES } from "../src/data/encounters.ts";
import { evaluateTitles, type NightRecordData } from "../src/data/titles.ts";

test("seed：同じ種なら同じ乱数列、用途ごとの列は独立", () => {
  const a = new NightSeed(12345), b = new NightSeed(12345), c = new NightSeed(12346);
  const seq = (s: NightSeed) => Array.from({ length: 5 }, () => s.stream("deck").next());
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(a), seq(c));
  assert.notEqual(a.stream("deck").next(), a.stream("theme").next());
});

test("seed：URL の ?seed= は数字も文字列も受け付ける", () => {
  assert.equal(parseSeed("12345"), 12345);
  assert.equal(parseSeed("今日の種"), parseSeed("今日の種"));
  assert.notEqual(parseSeed("今日の種"), parseSeed("明日の種"));
  const r = parseSeed(null, () => 0.5);
  assert.ok(r >= 100000 && r < 1000000);
});

test("Event Deck：同じ種なら同じ山札・同じ引き順", () => {
  const draw = (seed: number) => {
    const deck = new EventDeck(ENCOUNTERS, new NightSeed(seed).stream("deck"));
    const out: string[] = [];
    for (let i = 0; i < 6; i++) out.push(deck.draw(() => true)?.id ?? "-");
    return out;
  };
  assert.deepEqual(draw(777), draw(777));
  // 種が違えば、どこかで違う夜になる
  const differs = [1, 2, 3, 4, 5].some((s) => draw(s).join() !== draw(777).join());
  assert.ok(differs);
});

test("Event Deck：すべてのイベントが毎夜必ず出るわけではない", () => {
  const sets = new Set<string>();
  for (let s = 1; s <= 40; s++) sets.add(new EventDeck(ENCOUNTERS, new NightSeed(s).stream("deck")).ids.sort().join(","));
  assert.ok(sets.size > 1, "山札の中身が夜ごとに変わる");
});

test("Event Deck：条件に合うカードだけ引き、尽きたら捨て札を切り直す", () => {
  const deck = new EventDeck(ENCOUNTERS, makeRng(1));
  const n = deck.size;
  const small: string[] = [];
  for (let i = 0; i < n + 3; i++) {
    const c = deck.draw((d) => d.minTotal <= 10);
    if (c) small.push(c.id);
  }
  assert.ok(small.length > 0);
  for (const id of small) assert.ok(ENCOUNTERS.find((e) => e.id === id)!.minTotal <= 10);
  // 30 妖未満では Mini Parade は出ない
  assert.ok(!small.some((id) => id.startsWith("mini_parade")));
});

test("pickSite：距離・使用中を守り、未訪問の地区を優先する", () => {
  const rng = makeRng(3);
  const counts = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    const s = pickSite(ENCOUNTER_SITES, [], {
      px: 0, pz: -118, fx: 0, fz: 1, minD: 32, maxD: 125,
      used: new Set(["south_road"]),
      districtOf: (x) => (x < 0 ? "west" : "east"),
      districtVisit: (id) => (id === "east" ? 10 : undefined),
      now: 20, preferUnvisited: true,
    }, rng)!;
    assert.ok(s);
    const d = Math.hypot(s.x, s.z + 118);
    assert.ok(d >= 32 && d <= 125);
    assert.notEqual(s.id, "south_road");
    const k = s.x < 0 ? "west" : "east";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.ok((counts.get("west") ?? 0) > (counts.get("east") ?? 0));
});

test("composeGroup：今宵の妖怪が多く、完全な均等にはならない", () => {
  const rng = makeRng(9);
  const members = { oni: 1, kappa: 1, tanuki: 1, chochin: 1 };
  const tally = new Map<string, number>();
  for (let i = 0; i < 200; i++) for (const t of composeGroup(members, 5, "kappa", new Map(), rng)) tally.set(t, (tally.get(t) ?? 0) + 1);
  const kappa = tally.get("kappa")!;
  for (const t of ["oni", "tanuki", "chochin"]) assert.ok(kappa > tally.get(t)! * 2, `${t}`);
  assert.ok(NIGHT_THEMES.length >= 5);
});

const rec = (o: Partial<NightRecordData>): NightRecordData => ({
  total: 40, types: new Map([["oni", 10], ["kappa", 20], ["tanuki", 9]]), scatters: 2, activitiesDone: 1, activitiesTotal: 4,
  districtsAwakened: 0, miniMerged: 0, encountersDone: 0, cellsVisited: 60, time: 600, nightLength: 1200, reason: "shrine", peakMomentum: 40,
  ...o,
});

test("称号：今夜の百鬼夜行を表す（最大 3 つ）", () => {
  const t = evaluateTitles(rec({}));
  assert.ok(t.some((x) => x.id === "dominant_kappa"), JSON.stringify(t));
  const t2 = evaluateTitles(rec({ total: 104, districtsAwakened: 4, miniMerged: 3, scatters: 0 }));
  assert.equal(t2.length, 3);
  assert.deepEqual(t2.map((x) => x.id), ["hyaku", "matsuri", "yobu"]);
  const t3 = evaluateTitles(rec({ scatters: 0, types: new Map([["oni", 5], ["kappa", 5], ["tanuki", 5], ["chochin", 5]]) }));
  assert.ok(t3.some((x) => x.id === "chirazu"));
  assert.ok(!t3.some((x) => x.id.startsWith("dominant")));
});
