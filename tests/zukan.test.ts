// 図鑑の見せ方と完成（隠し妖怪は見つけるまで枠も数も無い）と、ぬらりひょん（将来）の見つかり方の基盤
import { test } from "node:test";
import assert from "node:assert/strict";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiType } from "../src/data/yokaiTypes.ts";
import { FINAL_NORMAL_WAVE } from "../src/data/normalYokai.ts";
import { HIDDEN_DISCOVERIES, HIDDEN_NOTICE_RADIUS } from "../src/data/legendConfig.ts";
import { NightSeed } from "../src/core/seed.ts";
import { readFileSync } from "node:fs";
import { ZukanKnown, completionReached, isZukanSeen, isZukanVisible, joinedTypes, knownZukanTypes, visibleZukanTypes, zukanCompletion, zukanEntry } from "../src/game/ZukanRules.ts";
import { evaluateSpecialUnlocks, hiddenNoticeRadius, hiddenWorldChance, hiddenWorldEligible, onsenFirstDiscoveries, recordMet, emptyLegendProgress } from "../src/game/legends/LegendProgress.ts";
import { defaultHiddenRules, drawNightLegends, type LegendCandidate } from "../src/game/legends/NightLegendRoster.ts";
import { drawOnsenGuests } from "../src/game/onsen/OnsenGuestRoster.ts";

/** 将来の図鑑：今の妖怪 ＋ ぬらりひょん（大妖怪・隠し）＋ 豆狸（通常妖怪・隠し）＋ 図鑑に載せない妖怪 */
const DEFS: Record<string, YokaiType> = {
  ...YOKAI,
  nurarihyon: { ...YOKAI.daitengu, id: "nurarihyon", name: "ぬらりひょん", reading: "ぬらりひょん", rank: "greater", discovery: "hidden", aliases: ["妖怪の総大将"], hint: "秘密", omen: undefined },
  mamedanuki: { ...YOKAI.tanuki, id: "mamedanuki", name: "豆狸", rank: "normal", discovery: "hidden" },
  npc: { ...YOKAI.oni, id: "npc", name: "案内役", zukan: false },
};
const ORDER = [...new Set([...YOKAI_ORDER, "nurarihyon", "mamedanuki", "npc"])];
/** 本編に出る、発見方式が通常の妖怪（future は図鑑に出ない） */
const NORMAL = YOKAI_ORDER.filter((t) => isActiveYokai(YOKAI[t]) && YOKAI[t].discovery === "normal");
const all = (extra: string[] = []) => Object.fromEntries([...NORMAL, ...extra].map((t) => [t, 1]));
/** 後から混ざる通常妖怪がすべて町に混ざった（最後の wave まで開いた）図鑑。wave ごとの枠は tests/normalYokai.test.ts */
const comp = (zukan: Record<string, number>, met: string[] = []) => zukanCompletion(zukan, { met, normalWave: FINAL_NORMAL_WAVE }, DEFS, ORDER);

test("図鑑：見つけていない隠し妖怪は枠ごと無い（？？？も、名前・別名・ヒント・格も、総数への加算も無い）", () => {
  const vis = visibleZukanTypes({}, { met: [], normalWave: FINAL_NORMAL_WAVE }, DEFS, ORDER);
  assert.deepEqual(vis, NORMAL, "通常の妖怪は未登録でも枠がある（？？？）");
  for (const t of ["nurarihyon", "mamedanuki"]) {
    assert.equal(isZukanVisible(t, {}, { met: [] }, DEFS), false, t);
    assert.equal(zukanEntry(t, {}, { met: [], joinCount: {} }, DEFS), null, `${t} の中身を漏らさない`);
  }
  assert.equal(isZukanVisible("npc", { npc: 3 }, { met: [] }, DEFS), false, "zukan: false の妖怪は載せない");
  assert.equal(comp({}).total, NORMAL.length);
  assert.deepEqual(joinedTypes({ oni: 1, npc: 2 }, DEFS), ["oni"]);
});

test("図鑑：通常妖怪をすべて登録すれば、隠し妖怪を見つけていなくても通常の図鑑は完成する（N / N）", () => {
  const before = comp({ ...all(), oni: 0 });
  const done = comp(all());
  assert.deepEqual([done.seen, done.total, done.complete, done.normalComplete, done.hiddenFound], [NORMAL.length, NORMAL.length, true, true, 0]);
  assert.equal(before.complete, false);
  assert.deepEqual(completionReached(before, done), { normal: true, all: true }, "前は未完成 → 今は完成、を検知できる");
  assert.deepEqual(completionReached(done, done), { normal: false, all: false });
});

test("図鑑：隠し妖怪は見つけた時点で登録済み。仲間にしていなくても N / N → N+1 / N+1（未登録の枠を先に増やさない：N / N+1 にはならない）", () => {
  const before = comp(all());
  const found = comp(all(), ["mamedanuki"]);
  assert.deepEqual(
    [found.seen, found.total, found.complete, found.normalSeen, found.normalTotal, found.normalComplete, found.hiddenFound, found.hiddenSeen, found.hiddenJoined],
    [NORMAL.length + 1, NORMAL.length + 1, true, NORMAL.length, NORMAL.length, true, 1, 1, 0],
  );
  assert.deepEqual(completionReached(before, found), { normal: false, all: false }, "完成は完成のまま（true → false に戻らない）");
  assert.ok(visibleZukanTypes(all(), { met: ["mamedanuki"] }, DEFS, ORDER).includes("mamedanuki"));
  // 仲間にしたら count が増える（登録とは別の数）
  const joined = comp(all(["mamedanuki"]), ["mamedanuki"]);
  assert.deepEqual([joined.seen, joined.total, joined.complete, joined.hiddenSeen, joined.hiddenJoined], [NORMAL.length + 1, NORMAL.length + 1, true, 1, 1]);
  // 通常の妖怪は、見ただけ（met）では登録しない（仲間にして登録）
  const oniMet = comp({ ...all(), oni: 0 }, ["oni"]);
  assert.deepEqual([oniMet.seen, oniMet.complete], [NORMAL.length - 1, false]);
  assert.equal(isZukanSeen("oni", {}, { met: ["oni"] }, DEFS), false);
  assert.equal(isZukanSeen("mamedanuki", {}, { met: ["mamedanuki"] }, DEFS), true);
  assert.equal(isZukanSeen("mamedanuki", {}, { met: [] }, DEFS), false);
});

test("図鑑：ぬらりひょんは通常の図鑑の完成（N / N）→ 宵霞楼で見つける → 仲間にしていなくても N+1 / N+1 で完成のまま", () => {
  const done = comp(all());
  assert.deepEqual([done.seen, done.total, done.complete], [NORMAL.length, NORMAL.length, true]);
  const met = comp(all(), ["nurarihyon"]);
  assert.deepEqual([met.seen, met.total, met.complete, met.normalComplete, met.hiddenSeen, met.hiddenJoined], [NORMAL.length + 1, NORMAL.length + 1, true, true, 1, 0]);
  // 見つけただけの一項目：名前・読み・別名・一言・格は出る。登録済み（seen）で、仲間になった数は 0
  const e = zukanEntry("nurarihyon", {}, { met: ["nurarihyon"], joinCount: {} }, DEFS)!;
  assert.deepEqual([e.name, e.reading, e.aliases, e.rankLabel, e.discovery, e.seen, e.count], ["ぬらりひょん", "ぬらりひょん", ["妖怪の総大将"], "大妖怪", "hidden", true, 0]);
  const j = zukanEntry("nurarihyon", { nurarihyon: 1 }, { met: ["nurarihyon"], joinCount: { nurarihyon: 1 } }, DEFS)!;
  assert.deepEqual([j.seen, j.count, j.joinNights], [true, 1, 1]);
  // 通常の妖怪の一項目：未登録は seen = false（画面は ？？？）
  assert.equal(zukanEntry("oni", {})!.seen, false);
});

test("図鑑の一項目：別名はある妖怪だけ。格・縁帳の情報へ広げられる形", () => {
  const oni = zukanEntry("oni", { oni: 12 })!;
  assert.deepEqual([oni.name, oni.aliases, oni.rankLabel, oni.count], ["小鬼", [], "妖怪", 12]);
  for (const id of YOKAI_ORDER) assert.ok(!YOKAI[id].aliases || YOKAI[id].aliases!.length > 0, `${id}：空の別名を書かない`);
  const shuten = zukanEntry("shuten", { shuten: 1 }, { met: ["shuten"], joinCount: { shuten: 2 } })!;
  assert.deepEqual([shuten.rankLabel, shuten.met, shuten.joinNights], ["三大妖怪", true, 2]);
  assert.equal(zukanEntry("daitengu", {})!.rankLabel, "大妖怪");
  assert.equal(zukanEntry("nothing", {}), null);
});

// ---------------------------------------------------------------- ぬらりひょんの見つかり方
// 温泉宿ができたときの設計（温泉宿で初めて会う）を ONSEN_FIRST で確かめる。今の仮の設定（町で初めて見つかる）は下の別のテスト

const ONSEN_FIRST = { nurarihyon: { firstSource: "onsen" as const, requiresZukanComplete: true, requiresUnlock: "onsenEntrance", postDiscoveryWorldChance: 0.1 } };

const FUTURE: LegendCandidate[] = [
  { id: "daitengu", rank: "greater", discovery: "normal" },
  { id: "shuten", rank: "threeGreat", discovery: "normal" },
  { id: "nurarihyon", rank: "greater", discovery: "hidden" },
];
const stream = (s: number) => (n: string) => new NightSeed(s).stream(n);
const onsenUnlocked = { joined: ["daitengu", "ibaraki", "shuten"], met: [] as string[] };

test("ぬらりひょん：図鑑が未完成・温泉宿が開いていない・見つけていない間は、町の夜の候補にならない", () => {
  const p = emptyLegendProgress();
  assert.equal(hiddenWorldEligible("nurarihyon", p, ONSEN_FIRST, true), false, "温泉宿で初めて会う妖怪は、図鑑が埋まっていても町に出ない");
  // 確率 1 にしても、見つけるまでは出ない
  const rules = { eligible: (t: string) => hiddenWorldEligible(t, p, ONSEN_FIRST, true), chance: () => 1 };
  for (let s = 1; s <= 50; s++) assert.deepEqual(drawNightLegends(stream(s), FUTURE, undefined, rules).hidden, [], `seed ${s}`);
  // 図鑑が未完成なら温泉宿でも現れない
  const unlocks = evaluateSpecialUnlocks(onsenUnlocked);
  assert.ok(unlocks.onsenEntrance, "温泉宿への道（大妖怪二＋三大妖怪一）");
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: false, unlocks }, ONSEN_FIRST), []);
  // 図鑑は完成したが、温泉宿が開いていない
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: true, unlocks: {} }, ONSEN_FIRST), []);
});

test("ぬらりひょん：図鑑完成＋温泉宿への道 → 次の温泉宿で必ずいる（抽選に任せない）→ 見つけたら、以後は町の夜にもまれに候補", () => {
  const p = emptyLegendProgress();
  const unlocks = evaluateSpecialUnlocks(onsenUnlocked);
  const forced = onsenFirstDiscoveries({ progress: p, normalZukanComplete: comp(all()).normalComplete, unlocks }, ONSEN_FIRST);
  assert.deepEqual(forced, ["nurarihyon"], "図鑑完成（隠し妖怪自身は数えない）＋温泉宿への道");
  // 温泉宿：隠し妖怪の抽選が外れても必ずいる
  const reg = [...NORMAL, "daitengu", "shuten"];
  for (let s = 1; s <= 20; s++) {
    const r = drawOnsenGuests({ registered: reg, legendProgress: p, seed: s, forcedGuests: forced }, undefined, DEFS, ORDER);
    assert.ok(r.forced.includes("nurarihyon") && r.all.includes("nurarihyon"), `seed ${s}`);
  }
  // 旅館で会った（revealHidden → specialDiscovered → 縁帳の met）
  recordMet(p, "nurarihyon", 123);
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: true, unlocks }, ONSEN_FIRST), [], "二度目からは必ずではない");
  assert.equal(hiddenWorldEligible("nurarihyon", p, ONSEN_FIRST), true);
  assert.equal(hiddenWorldChance("nurarihyon", 0.15, ONSEN_FIRST), 0.1);
  // 以後の町の夜：まれに今夜の候補（確率は postDiscoveryWorldChance）。大妖怪・三大妖怪の候補は変わらない
  let nights = 0;
  for (let s = 1; s <= 400; s++) {
    const a = drawNightLegends(stream(s), FUTURE, undefined, defaultHiddenRules(p));
    const b = drawNightLegends(stream(s), FUTURE, undefined, defaultHiddenRules(emptyLegendProgress()));
    assert.deepEqual([a.greater, a.threeGreat], [b.greater, b.threeGreat]);
    nights += a.hidden.length;
  }
  assert.ok(nights > 15 && nights < 90, `400 夜中 ${nights} 夜（まれに）`);
  // 図鑑にも増える（N+1 / N+1 へ。仲間にしていなくても完成のまま）
  const after = comp(all(), p.met);
  assert.deepEqual([after.seen, after.total, after.complete], [NORMAL.length + 1, NORMAL.length + 1, true]);
});

test("ぬらりひょん（今の設定）：温泉宿で初めて会う。図鑑が埋まっていても、見つけるまでは町の夜の候補にならない", () => {
  const d = HIDDEN_DISCOVERIES.nurarihyon;
  assert.deepEqual([d.firstSource, d.requiresZukanComplete, d.requiresUnlock, d.postDiscoveryWorldChance], ["onsen", true, "onsenEntrance", 0.1]);
  const p = emptyLegendProgress();
  // 1. 図鑑完成済みでも、見つけていなければ町の夜の候補に入らない
  assert.equal(hiddenWorldEligible("nurarihyon", p, undefined, true), false);
  const always = { eligible: (t: string) => hiddenWorldEligible(t, p, undefined, true), chance: () => 1 };
  for (let s = 1; s <= 30; s++) assert.deepEqual(drawNightLegends(stream(s), FUTURE, undefined, always).hidden, [], `seed ${s}`);
  // 2. 図鑑完成＋温泉宿への道 → 温泉宿で必ずいる（onsenFirstDiscoveries）
  const unlocks = evaluateSpecialUnlocks(onsenUnlocked);
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: true, unlocks }), ["nurarihyon"]);
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: false, unlocks }), [], "図鑑が未完成");
  assert.deepEqual(onsenFirstDiscoveries({ progress: p, normalZukanComplete: true, unlocks: {} }), [], "温泉宿への道が開いていない");
  // 3. 見つけた（縁帳の met）後だけ、町の夜の抽選に入る（図鑑に関係なく。確率は postDiscoveryWorldChance）
  recordMet(p, "nurarihyon", 1);
  assert.equal(hiddenWorldEligible("nurarihyon", p), true);
  assert.deepEqual(drawNightLegends(stream(3), FUTURE, undefined, { eligible: (t: string) => hiddenWorldEligible(t, p), chance: () => 1 }).hidden, ["nurarihyon"]);
  assert.equal(hiddenWorldChance("nurarihyon", 0.15), 0.1);
  assert.equal(hiddenNoticeRadius("nurarihyon"), d.noticeRadius ?? HIDDEN_NOTICE_RADIUS);
});

// ---------------------------------------------------------------- 初見（図鑑上で既知か）：発見と加入は別の出来事

const known = (zukan: Record<string, number>, met: string[]) => new ZukanKnown(knownZukanTypes(zukan, { met }, DEFS, ORDER));
const found = (type: string, announce = true, isKnown = false) => ({ type, announce, known: isKnown });

test("初見：隠し妖怪を見つけて知らせ → 同じ夜に加わっても初見ではない（「新しい妖怪を発見」は一度だけ）", () => {
  const k = known({}, []);
  assert.equal(k.discovered(found("mamedanuki")), true, "見つけた：「新たな妖怪が図鑑に記された」");
  assert.equal(k.joined("mamedanuki"), false, "加わった：「百鬼夜行に加わった」（初見・判子「初見」にしない）");
  assert.equal(k.joined("mamedanuki"), false);
});

test("初見：announce = false でも既知に入る（知らせは出さない）→ 加わっても初見ではない", () => {
  const k = known({}, []);
  assert.equal(k.discovered(found("mamedanuki", false)), false, "知らせない");
  assert.ok(k.types.has("mamedanuki"));
  assert.equal(k.joined("mamedanuki"), false);
});

test("初見：前の夜に見つけた（met）が未加入の隠し妖怪は、起動した時点で既知 → 加わっても初見ではない", () => {
  for (const zukan of [{}, { mamedanuki: 0 }]) {
    const k = known(zukan, ["mamedanuki"]);
    assert.ok(k.types.has("mamedanuki"));
    assert.equal(k.discovered(found("mamedanuki", true, true)), false, "既知の再出現は新発見として知らせない");
    assert.equal(k.joined("mamedanuki"), false);
  }
  // ぬらりひょん（将来）も同じ：旅館で見つけた後の夜に加わっても「加わった」だけ
  const n = known(all(), ["nurarihyon"]);
  assert.equal(n.joined("nurarihyon"), false);
});

test("初見：イベントの known が食い違っても（保存の移行など）、図鑑上で既知なら「新たな妖怪」を二度出さない", () => {
  // 図鑑には豆狸が載っている（仲間にした）のに、縁帳の met には無い → イベントは known: false で届く
  const k = known({ mamedanuki: 2 }, []);
  assert.ok(k.types.has("mamedanuki"));
  assert.equal(k.discovered(found("mamedanuki", true, false)), false, "加える前から既知なら知らせない");
  // 同じ夜に二度届いても、二度目は知らせない
  const k2 = known({}, []);
  assert.equal(k2.discovered(found("mame2", true, false)), true);
  assert.equal(k2.discovered(found("mame2", true, false)), false);
});

test("初見：通常の妖怪はこれまでどおり（数が 0 なら、加わったときが初見）。見つけていない隠し妖怪も既知ではない", () => {
  const k = known({ oni: 3 }, []);
  assert.ok(k.types.has("oni") && !k.types.has("kappa") && !k.types.has("mamedanuki"));
  assert.equal(k.joined("kappa"), true);
  assert.equal(k.joined("kappa"), false);
  assert.equal(k.joined("mamedanuki"), true, "見つけずに加わった隠し妖怪は、そのとき初めて図鑑に記される");
});

test("初見：大妖怪に会っただけ（縁帳の met）では既知にならない（通常の妖怪は met ≠ 図鑑登録）", () => {
  const k = known({}, ["daitengu", "oni"]);
  assert.ok(!k.types.has("daitengu") && !k.types.has("oni"));
  assert.equal(k.joined("daitengu"), true);
  assert.deepEqual(knownZukanTypes({ shuten: 1 }, { met: ["daitengu", "mamedanuki"] }, DEFS, ORDER), ["shuten", "mamedanuki"]);
});

test("初見：演出と起動は ZukanRules を使う（別の定義を持たない）", () => {
  const pres = readFileSync("src/presentation/ParadePresentationDirector.ts", "utf8");
  // 隠し妖怪を見つけたら、演出の判定より前に必ず既知へ（ZukanKnown.discovered は既知に入れてから、知らせるかを返す）
  assert.match(pres, /bus\.on\("specialDiscovered", \(e\) => \{\n(\s+\/\/[^\n]*\n)+\s+if \(!this\.zukanKnown\.discovered\(e\)\) return;/);
  assert.match(pres, /const isNew = this\.zukanKnown\.joined\(e\.type\);/);
  assert.ok(!/this\.known\.add\(/.test(pres), "known を直接いじらない");
  const game = readFileSync("src/game/Game.ts", "utf8");
  assert.match(game, /for \(const t of knownZukanTypes\(this\.zukan, this\.legends\.progress\)\) this\.director\.known\.add\(t\);/);
  assert.ok(!/Object\.entries\(this\.zukan\)\) if \(n > 0\) this\.director\.known/.test(game));
});
