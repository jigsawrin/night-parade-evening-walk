import { test } from "node:test";
import assert from "node:assert/strict";
import { NightMemoryLog, ROUTE_MAX } from "../src/game/after/NightMemoryLog.ts";
import { buildNightResult, computeScore, photoFileName, shareText, type NightResultInput } from "../src/game/after/NightResult.ts";
import { evaluateRoles, type RoleInput } from "../src/data/roles.ts";
import { FORMATIONS, POSE_STYLES, type Family } from "../src/data/photo.ts";
import { formationBounds, heightClass, layoutFormation, type FormationMember } from "../src/game/after/PhotoFormation.ts";
import { ProceduralPoseDriver, choosePose } from "../src/game/after/PhotoPose.ts";
import { AfterNightState } from "../src/game/after/AfterNightState.ts";
import { nightSearch } from "../src/game/after/nightUrl.ts";

// ---------------------------------------------------------------- Night Memory Log

function playLog(total = 100) {
  const log = new NightMemoryLog();
  log.start(0, 0, -118, "大通り");
  const types = ["kappa", "oni", "chochin", "tanuki"];
  for (let n = 2; n <= total; n++) {
    log.join({ t: n * 8, type: n === 100 ? "nekomata" : types[n % 4], total: n, x: n, z: -100 + n, district: n < 30 ? "大通り" : "商店街", fromEvent: n % 5 === 0 });
    log.sample(n * 8, n, -100 + n);
  }
  log.awaken(300, "商店街", 10, -20);
  log.merge(500, 6, 0, 6, "広場");
  log.encounter(420, "foxfireTrail", "狐火を追う", 40, 40);
  log.end(1100, "shrine", 0, 110);
  return log;
}

test("NightMemoryLog：最初の仲間・節目（10/30/50/100）・覚醒・合流・終わりを時刻つきで記録", () => {
  const log = playLog();
  const kinds = log.timeline().map((e) => e.kind);
  assert.equal(kinds[0], "start");
  assert.equal(kinds[kinds.length - 1], "end");
  assert.ok(kinds.includes("firstFriend") && kinds.includes("awaken") && kinds.includes("merge") && kinds.includes("encounter"));
  const ms = log.events.filter((e) => e.kind === "milestone").map((e) => e.text);
  assert.equal(ms.length, 4);
  assert.ok(ms[3].includes("百妖"));
  // 節目は一度だけ
  log.reach(1200, 120);
  assert.equal(log.events.filter((e) => e.kind === "milestone").length, 4);
  // 時系列に並ぶ
  const ts = log.timeline().map((e) => e.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.equal(log.firstFriend!.type, "chochin");
});

test("NightMemoryLog：百妖目を記録（種類・時刻・地区・出来事由来か）。未到達なら記録しない", () => {
  const log = playLog(100);
  assert.deepEqual(
    { type: log.hundredth!.type, t: log.hundredth!.t, district: log.hundredth!.district, source: log.hundredth!.source, n: log.hundredth!.n },
    { type: "nekomata", t: 800, district: "商店街", source: "event", n: 100 },
  );
  assert.equal(playLog(99).hundredth, null);
});

test("NightMemoryLog：今夜の三大出来事は重要なもの優先（百妖・最初の仲間・初合流…）で時系列", () => {
  const h = playLog().highlights(3);
  assert.equal(h.length, 3);
  const text = h.map((e) => e.kind);
  assert.ok(text.includes("firstFriend"));
  assert.ok(h.some((e) => e.kind === "milestone" && e.text.includes("百妖")) || text.includes("hundredth"));
  assert.ok(text.includes("merge"));
  assert.deepEqual(h.map((e) => e.t), [...h.map((e) => e.t)].sort((a, b) => a - b));
});

test("NightMemoryLog：移動ルートは低頻度（間隔・距離）で、上限を超えたら間引く", () => {
  const log = new NightMemoryLog();
  for (let t = 0; t < 30; t += 1 / 60) log.sample(t, 0, 0);
  assert.equal(log.route.length, 1, "動いていなければ増えない");
  const log2 = new NightMemoryLog();
  for (let t = 0; t < 4000; t += 0.25) log2.sample(t, t * 3, 0);
  assert.ok(log2.route.length <= ROUTE_MAX && log2.route.length > 50);
  assert.equal(log2.route[0].x, 0, "始点は残る");
});

// ---------------------------------------------------------------- 役・百鬼値

const roleIn = (o: Partial<RoleInput> = {}): RoleInput => ({
  total: 60, types: new Map([["kitsune", 6], ["oni", 12]]), districtsAwakened: [], encountersByKind: new Map(),
  miniMerged: 0, activitiesDone: 0, scatters: 1, peakMomentum: 40, ...o,
});

test("役：条件を満たしたものだけ成立し、上位役（大集会）は下位役（一族）を置き換える", () => {
  const r = evaluateRoles(roleIn({ encountersByKind: new Map([["foxfireTrail", 1]]) })).map((x) => x.id);
  assert.ok(r.includes("kitsune_yomeiri"));
  assert.ok(r.includes("daishukai") && !r.includes("ichizoku"));
  const small = evaluateRoles(roleIn({ types: new Map([["oni", 6]]) })).map((x) => x.id);
  assert.ok(small.includes("ichizoku") && !small.includes("daishukai"));
  assert.ok(!small.includes("kitsune_yomeiri"));
  const machi = evaluateRoles(roleIn({ districtsAwakened: ["a", "b", "c", "d", "e"], types: new Map([["kappa", 7]]) }));
  assert.ok(machi.some((x) => x.id === "machijuu"));
  assert.ok(!machi.some((x) => x.id === "mizube"), "川辺を目覚めさせていなければ水辺の一行ではない");
  const mizu = evaluateRoles(roleIn({ districtsAwakened: ["riverside"], types: new Map([["kappa", 7]]) }));
  assert.ok(mizu.some((x) => x.id === "mizube"));
  const kinds = new Set(evaluateRoles(roleIn({ total: 25, types: new Map([["oni", 2], ["kappa", 2], ["tanuki", 2], ["chochin", 2], ["nekomata", 2], ["zashiki", 2]]) })).map((x) => x.id));
  assert.ok(kinds.has("shosu_seiei"));
});

test("百鬼値：人数だけが圧倒的に有利にならない（種類・出来事・地区の多い小さな夜が、単調な大きな夜に勝てる）", () => {
  const big = computeScore({ total: 150, typeCount: 3, encountersDone: 1, activitiesDone: 0, districtsAwakened: 0, miniMerged: 0, peakMomentum: 30, roles: [] });
  const rich = computeScore({ total: 70, typeCount: 9, encountersDone: 7, activitiesDone: 3, districtsAwakened: 4, miniMerged: 2, peakMomentum: 80, roles: [] });
  assert.ok(rich.score > big.score, `rich=${rich.score} big=${big.score}`);
  // 人数は逓減：100 → 150 妖で増えるのは 2 割程度
  const p100 = computeScore({ total: 100, typeCount: 0, encountersDone: 0, activitiesDone: 0, districtsAwakened: 0, miniMerged: 0, peakMomentum: 0, roles: [] });
  const p150 = computeScore({ total: 150, typeCount: 0, encountersDone: 0, activitiesDone: 0, districtsAwakened: 0, miniMerged: 0, peakMomentum: 0, roles: [] });
  assert.ok(p150.score - p100.score < 0.25 * p100.score);
  // 内訳の合計 = 百鬼値
  assert.equal(rich.parts.reduce((a, p) => a + p.points, 0), rich.score);
});

function resultInput(): NightResultInput {
  const log = playLog();
  return {
    seed: 13579, theme: "狐火の灯る夜", themeType: "kitsune", reason: "shrine", elapsed: 1112, nightLength: 1200, total: 112, stage: "百鬼夜行",
    types: new Map([["kitsune", 20], ["oni", 40], ["kappa", 12], ["chochin", 39]]),
    encountersByKind: new Map([["foxfireTrail", 2], ["hokoraCircle", 1]]),
    miniMerged: 2, activitiesDone: ["鳥居をくぐる"], districtsAwakened: ["shotengai", "riverside"], districtsWalked: ["商店街", "川辺", "広場"],
    peakMomentum: 88, scatters: 3, titles: [{ id: "hyaku", name: "百妖到達", text: "" }],
    memory: { firstFriend: log.firstFriend, hundredth: log.hundredth, highlights: (n) => log.highlights(n), timeline: () => log.timeline(), route: log.route },
  };
}

test("NightResult：保存・送信に必要な情報が揃い、プレーンな値で JSON にできる", () => {
  const r = buildNightResult(resultInput());
  for (const k of ["seed", "score", "total", "typeCount", "elapsed", "districtsAwakened", "encountersDone", "titles", "roles", "theme", "friend", "hundredth", "highlights", "route", "timeline", "topType", "peakMomentum", "miniMerged", "activitiesDone", "districtsWalked", "hundred"] as const) {
    assert.ok(r[k] !== undefined, k);
  }
  assert.equal(r.typeCount, 4);
  assert.equal(r.topType, "oni");
  assert.equal(r.encountersDone, 3);
  assert.equal(r.hundred, true);
  assert.ok(r.roles.some((x) => x.id === "kitsune_yomeiri"));
  assert.equal(r.friend!.type, "chochin");
  assert.equal(r.friend!.together, 1112 - 16);
  assert.equal(r.highlights.length, 3);
  const back = JSON.parse(JSON.stringify(r));
  assert.deepEqual(back.types, r.types);
  assert.equal(photoFileName(13579, 112), "hyakki_seed13579_112yokai.png");
  const text = shareText(r, (t) => t);
  assert.ok(text.includes("今宵の百鬼夜行：112妖") && text.includes("狐火の灯る夜") && text.includes("Seed 13579"));
});

// ---------------------------------------------------------------- 集合写真

const FAMILIES: Family[] = ["CHIBI_BIPED", "CHIBI_QUAD", "FLOAT", "SPECIAL"];
function members(n: number): FormationMember[] {
  return Array.from({ length: n }, (_, i) => ({
    typeId: `t${i % 7}`, family: FAMILIES[i % 4], scale: [0.85, 1, 1.2][i % 3], x: i * 1.3, z: 0, yaw: 0,
  }));
}
const ctx = { anchorX: 10, anchorZ: -20, fx: 0, fz: 1, hero: { x: 0, z: 0, yaw: 0 } };

test("Formation：どの陣形でも立ち位置の数 = 人数（100 妖・150 妖でも全員分）", () => {
  assert.ok(FORMATIONS.length >= 5);
  for (const n of [0, 1, 7, 30, 100, 150]) {
    const ms = members(n);
    for (const f of FORMATIONS) {
      const r = layoutFormation(f, ms, ctx);
      assert.equal(r.slots.length, n, `${f.id} n=${n}`);
      for (const s of r.slots) assert.ok(s && Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.lift), `${f.id} n=${n}`);
    }
  }
});

test("Formation：並べた妖怪どうしが重ならない（大騒ぎ以外は間隔の 7 割以上あく）", () => {
  const ms = members(120);
  for (const f of FORMATIONS.filter((f) => f.layout !== "trail" && f.layout !== "scatter")) {
    const r = layoutFormation(f, ms, ctx);
    let min = Infinity;
    for (let i = 0; i < r.slots.length; i++) for (let j = i + 1; j < r.slots.length; j++) {
      const a = r.slots[i], b = r.slots[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z, (a.lift - b.lift) * 0.8);
      min = Math.min(min, d);
    }
    assert.ok(min >= f.spacing * 0.7, `${f.id} min=${min.toFixed(2)}`);
  }
});

test("Formation：雛壇は前が小さく、上に浮く妖怪。百妖でも横幅は写真に収まる", () => {
  const ms = members(110);
  const f = FORMATIONS.find((x) => x.layout === "tiers")!;
  const r = layoutFormation(f, ms, ctx);
  const front = r.slots.filter((_, i) => heightClass(ms[i]) === 0).map((s) => s.z);
  const back = r.slots.filter((_, i) => heightClass(ms[i]) === 2).map((s) => s.z);
  const air = r.slots.filter((_, i) => heightClass(ms[i]) === 3).map((s) => s.lift);
  // 正面（+z）ほど前列
  assert.ok(Math.max(...back) <= Math.min(...front) + 1e-6);
  assert.ok(Math.min(...air) > 1.5);
  const b = formationBounds(r, ctx);
  assert.ok(b.width < 30, `width=${b.width}`);
  // 大行列は今の位置のまま
  const trail = layoutFormation(FORMATIONS[0], ms, ctx);
  assert.equal(trail.slots[5].x, ms[5].x);
});

test("Pose：ポーズスタイルは陣形と独立し、リグファミリーごとにポーズを選ぶ（有限の値）", () => {
  assert.ok(POSE_STYLES.length >= 4);
  for (const st of POSE_STYLES) for (const fam of FAMILIES) {
    const p = choosePose(st, fam, 3);
    assert.ok(st.poses[fam].includes(p));
    for (const t of [0, 0.4, 1.7]) {
      const s = ProceduralPoseDriver.sample(p, t, 2);
      assert.ok([s.bob, s.roll, s.pitch, s.yawOffset, s.sy].every(Number.isFinite));
      assert.ok(s.sy > 0.5 && s.sy < 1.5);
    }
  }
});

// ---------------------------------------------------------------- 状態・行き先

test("状態：撮影・眺めるの開始／終了でゲームの進行は止まったまま、結果へ戻れる", () => {
  const s = new AfterNightState();
  assert.ok(s.go("play") && s.gameplay);
  assert.ok(!s.go("photo"), "夜の途中で撮影には入れない");
  assert.ok(s.go("showcase") && !s.gameplay && s.paradeFollows);
  assert.ok(s.go("result") && s.afterNight && !s.paradeFollows);
  assert.ok(s.go("photo") && !s.gameplay && s.afterNight);
  assert.ok(s.go("result"));
  assert.ok(s.go("view") && s.go("photo") && s.go("view") && s.go("result"));
  assert.ok(!s.gameplay);
  assert.ok(!s.go("play"), "結果から夜へは戻らない（新しい夜はページを読み直して始める）");
});

test("行き先：同じ夜は同じ seed、次の夜は別の seed、タイトルは種なし。調整用パラメータは引き継ぐ", () => {
  const same = new URLSearchParams(nightSearch("?debug&seed=12345&night=300", "same", 12345));
  assert.equal(same.get("seed"), "12345");
  assert.equal(same.get("go"), "1");
  assert.ok(same.has("debug") && same.get("night") === "300");
  let k = 0;
  const seq = [0.1, 0.1, 0.7];
  const next = new URLSearchParams(nightSearch("?seed=190000", "next", 190000, () => seq[k++]));
  assert.notEqual(next.get("seed"), "190000");
  assert.equal(next.get("go"), "1");
  for (let i = 0; i < 50; i++) assert.notEqual(new URLSearchParams(nightSearch("", "next", 555555)).get("seed"), "555555");
  const title = new URLSearchParams(nightSearch("?seed=1&go=1&debug", "title", 1));
  assert.ok(!title.has("seed") && !title.has("go") && title.has("debug"));
});
