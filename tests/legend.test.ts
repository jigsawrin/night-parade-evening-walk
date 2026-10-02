// 大妖怪・三大妖怪（legend）と隠し妖怪の基盤：格と発見方式・加入条件・今夜の候補・一夜一体（出す窓口）・誘導からの隔離・陰陽師・思い出と結果・写真・縁帳・温泉宿の解禁
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiType } from "../src/data/yokaiTypes.ts";
import { NIGHT_ROSTER, PLANNED_YOKAI, RANK_INFO, SPECIAL_UNLOCKS } from "../src/data/legendConfig.ts";
import { SPAWNS } from "../src/data/map.ts";
import { PRESENCE_SPAWNS, AWAKEN_SPAWNS } from "../src/data/presences.ts";
import { ENCOUNTERS } from "../src/data/encounters.ts";
import { NightSeed } from "../src/core/seed.ts";
import { Emitter } from "../src/core/Events.ts";
import { HISTORY_KEY, LEGENDS_KEY, loadHistory, loadLegendProgress, pushHistory, saveLegendProgress, type KV } from "../src/core/SaveData.ts";
import {
  SpawnGate, aweModifiers, describeLegendRule, discoveryOf, emptyLegendContext, isHidden, isLegend, isSpecialYokai, isThreeGreat, isUniquePerNight,
  legendMissing, rankOf, resistsPurge, revealAllowed, routingLegend, type LegendContext, type LegendRule,
} from "../src/game/legends/LegendRules.ts";
import { drawNightLegends, legendCandidates, NightLegendRoster, type LegendCandidate } from "../src/game/legends/NightLegendRoster.ts";
import {
  discoveryTally, emptyLegendProgress, evaluateSpecialUnlocks, legendTally, normalizeLegendProgress, recordJoined, recordMet,
} from "../src/game/legends/LegendProgress.ts";
import { LegendSystem } from "../src/game/legends/LegendSystem.ts";
import { KOTODAMA_FILTER, PACING_FILTER, nearestContent, pickContent, revealOmen, sourceAllowed, wildContent, wildSource, type ContentPoint } from "../src/game/GuidanceRules.ts";
import { onmyojiAwe, routMemory, routText } from "../src/game/onmyoji/OnmyojiRules.ts";
import { NightMemoryLog } from "../src/game/after/NightMemoryLog.ts";
import { buildNightResult } from "../src/game/after/NightResult.ts";
import { layoutFormation, type FormationMember } from "../src/game/after/PhotoFormation.ts";
import { FORMATIONS, type Family } from "../src/data/photo.ts";
import type { GameEvents } from "../src/game/events.ts";

function memKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}
const ctx = (o: Partial<LegendContext> & { c?: Record<string, number> } = {}): LegendContext => ({
  ...emptyLegendContext(), ...o, counts: new Map(Object.entries(o.c ?? {})),
});
const ruleOf = (id: string) => YOKAI[id].rule as LegendRule;
const stream = (seed: number) => (n: string) => new NightSeed(seed).stream(n);
/** 名簿の特別な妖怪（本編に出るものも future も）＋ 今後の候補（将来の候補の数で試す） */
const FUTURE: LegendCandidate[] = [
  ...YOKAI_ORDER.filter((id) => isSpecialYokai(YOKAI[id])).map((id) => ({ id, rank: YOKAI[id].rank, discovery: YOKAI[id].discovery })),
  ...Object.entries(PLANNED_YOKAI).map(([id, d]) => ({ id, rank: d.rank, discovery: d.discovery })),
];
/** 将来の妖怪を仮に足した図鑑（ぬらりひょん = 大妖怪＋隠し、豆狸 = 通常妖怪＋隠し。気配 omen は書かない） */
const DUMMY: Record<string, YokaiType> = {
  ...YOKAI,
  nurarihyon: { ...YOKAI.daitengu, id: "nurarihyon", name: "ぬらりひょん", rank: "greater", discovery: "hidden", omen: undefined, awe: undefined },
  mamedanuki: { ...YOKAI.tanuki, id: "mamedanuki", name: "豆狸", rank: "normal", discovery: "hidden" },
};

// ---------------------------------------------------------------- 格と発見方式

test("格：通常妖怪・大妖怪・三大妖怪。すべての妖怪に rank と discovery がある", () => {
  for (const id of YOKAI_ORDER) {
    assert.ok(["normal", "greater", "threeGreat"].includes(YOKAI[id].rank), id);
    assert.ok(["normal", "hidden"].includes(YOKAI[id].discovery), id);
  }
  for (const id of ["oni", "tengu", "kitsune", "ittan"]) {
    assert.equal(rankOf(YOKAI[id]), "normal");
    assert.ok(!isLegend(YOKAI[id]) && !isSpecialYokai(YOKAI[id]) && !isUniquePerNight(YOKAI[id]) && !resistsPurge(YOKAI[id]));
  }
  assert.deepEqual([YOKAI.oni.rank, YOKAI.daitengu.rank, YOKAI.shuten.rank], ["normal", "greater", "threeGreat"]);
  assert.deepEqual([YOKAI.oni.discovery, YOKAI.daitengu.discovery, YOKAI.shuten.discovery], ["normal", "normal", "normal"]);
  assert.ok(isLegend(YOKAI.daitengu) && !isThreeGreat(YOKAI.daitengu));
  assert.ok(isLegend(YOKAI.shuten) && isThreeGreat(YOKAI.shuten));
  assert.deepEqual(Object.keys(RANK_INFO).sort(), ["greater", "threeGreat"], "隠しは格ではない");
  assert.deepEqual([RANK_INFO.greater.label, RANK_INFO.threeGreat.label], ["大妖怪", "三大妖怪"]);
  assert.deepEqual([RANK_INFO.greater.banner, RANK_INFO.threeGreat.banner], ["大 妖 怪", "三 大 妖 怪"]);
  assert.ok(!/陰陽師/.test(RANK_INFO.greater.bannerText), "陰陽師に効かない大妖怪もいるので、見出しの一言で陰陽師に触れない");
  // 今後の候補（名簿にまだ載せていない。勝手に消さない）
  for (const id of ["planned_greater_a", "planned_greater_b", "planned_greater_c"]) assert.equal(PLANNED_YOKAI[id].rank, "greater");
  for (const id of Object.keys(PLANNED_YOKAI)) assert.equal(YOKAI[id], undefined, `${id}：名簿に移したら PLANNED_YOKAI から消す`);
});

test("発見方式：格とは別の軸（大妖怪＋隠し・通常妖怪＋隠しが成り立つ）", () => {
  const nura = DUMMY.nurarihyon, mame = DUMMY.mamedanuki;
  assert.ok(isLegend(nura) && isHidden(nura) && isUniquePerNight(nura) && resistsPurge(nura), "ぬらりひょん：格は大妖怪、発見は隠し");
  assert.ok(!isLegend(mame) && isHidden(mame) && isSpecialYokai(mame) && isUniquePerNight(mame), "豆狸：通常妖怪の隠し（隠しは既定で一夜一体）");
  assert.ok(!resistsPurge(mame), "隠しの通常妖怪は祓われうる（格は通常）");
  assert.ok(!isUniquePerNight({ ...mame, uniquePerNight: false }), "uniquePerNight: false で何体もいる隠し妖怪にできる");
  assert.equal(discoveryOf(undefined), "normal");
  assert.ok(isUniquePerNight({ rank: "normal", uniquePerNight: true }), "通常の妖怪も一夜一体にできる");
});

test("大妖怪のデータ：加入条件は legend。boss・greatGroup・古い格の名残が無い", () => {
  for (const id of YOKAI_ORDER) {
    const d = YOKAI[id] as YokaiType & { boss?: unknown; greatGroup?: unknown };
    assert.equal(d.boss, undefined, id);
    assert.equal(d.greatGroup, undefined, id);
    assert.notEqual((d.rule as { kind: string }).kind, "boss", id);
    if (isLegend(d)) assert.equal(d.rule.kind, "legend", id);
  }
  for (const f of ["src/data/yokaiTypes.ts", "src/data/legendConfig.ts", "src/game/legends/LegendRules.ts", "src/game/legends/NightLegendRoster.ts", "src/game/legends/LegendProgress.ts"]) {
    const t = readFileSync(f, "utf8");
    assert.ok(!/"advanced"|"great"|上級/.test(t), f);
  }
});

// ---------------------------------------------------------------- 加入条件

test("酒呑童子：小鬼八妖＋化け狸二妖（今までと同じ）", () => {
  const r = ruleOf("shuten");
  assert.deepEqual(legendMissing(r, ctx({ c: { oni: 8, tanuki: 2 } })), []);
  assert.deepEqual(legendMissing(r, ctx({ c: { oni: 5 } })), ["小鬼あと三妖", "化け狸あと二妖"]);
  assert.deepEqual(describeLegendRule(r), ["小鬼八妖", "化け狸二妖"]);
});

test("大天狗：天狗一妖＋行列の遊び二つ（今までと同じ）", () => {
  const r = ruleOf("daitengu");
  assert.deepEqual(legendMissing(r, ctx({ c: { tengu: 1 }, activities: 2 })), []);
  assert.deepEqual(legendMissing(r, ctx({ c: { tengu: 1 }, activities: 1 })), ["行列の遊びあと一つ"]);
  assert.equal(legendMissing(r, ctx({ activities: 3 })).length, 1);
});

test("不足の表示：条件の種類ごとに短い言葉（妖怪ごとの if 文なし）", () => {
  const rule: Pick<LegendRule, "conditions"> = {
    conditions: [
      { kind: "specificYokai", type: "oni", n: 3 },
      { kind: "districtAwakened", district: "shotengai" },
      { kind: "encounterComplete", encounter: "foxfireTrail", n: 1 },
      { kind: "momentum", level: 4 },
      { kind: "totalCount", n: 30 },
      { kind: "activityCount", n: 1 },
    ],
  };
  assert.deepEqual(legendMissing(rule, ctx({ total: 20 })), [
    "小鬼あと三妖", "商店街を祭りにする", "狐火をあと一度追う", "賑わいを「熱狂」まで高める", "行列あと十妖", "行列の遊びあと一つ",
  ]);
  const ok = ctx({
    c: { oni: 3 }, total: 30, activities: 1, districtsAwakened: ["shotengai"], encounters: new Map([["foxfireTrail", 1]]), momentumLevel: 4,
  });
  assert.deepEqual(legendMissing(rule, ok), []);
  const any = { conditions: [{ kind: "districtAwakened" as const, n: 2 }, { kind: "encounterComplete" as const, n: 2 }] };
  assert.deepEqual(legendMissing(any, ctx({ districtsAwakened: ["plaza"], encounters: new Map([["hokoraCircle", 1]]) })), ["祭りの地区あと一つ", "出来事をあと一つ成就する"]);
});

// ---------------------------------------------------------------- 今夜の候補

test("今夜の候補：同じ seed なら同じ、seed が違えば変わりうる", () => {
  for (const s of [1, 12345, 999999]) assert.deepEqual(drawNightLegends(stream(s), FUTURE), drawNightLegends(stream(s), FUTURE));
  const seen = new Set<string>();
  for (let s = 1; s <= 40; s++) seen.add(JSON.stringify(drawNightLegends(stream(s), FUTURE)));
  assert.ok(seen.size > 5, `候補の組み合わせ ${seen.size} 通り`);
});

test("今夜の候補：大妖怪 2〜3・三大妖怪 0〜1（将来の設定）、同じ妖怪を二度選ばない", () => {
  const cfg = { greater: { min: 2, max: 3 }, threeGreat: { min: 0, max: 1 }, hidden: { chance: 0 } };
  const dup = [...FUTURE, ...FUTURE];
  let greatNights = 0;
  for (let s = 1; s <= 200; s++) {
    const r = drawNightLegends(stream(s), dup, cfg);
    assert.ok(r.greater.length >= 2 && r.greater.length <= 3, `seed ${s}`);
    assert.ok(r.threeGreat.length <= 1, `seed ${s}`);
    const all = [...r.greater, ...r.threeGreat, ...r.hidden];
    assert.equal(new Set(all).size, all.length, "重複なし");
    for (const id of r.greater) assert.ok(FUTURE.some((c) => c.id === id && c.rank === "greater" && c.discovery === "normal"));
    for (const id of r.threeGreat) assert.ok(FUTURE.some((c) => c.id === id && c.rank === "threeGreat"));
    assert.ok(!r.greater.includes("nurarihyon"), "隠し妖怪は大妖怪の枠で選ばない");
    greatNights += r.threeGreat.length;
  }
  assert.ok(greatNights > 20 && greatNights < 180, "三大妖怪のいない夜もある");
});

test("今夜の候補：隠し妖怪は発見方式で別に抽選（いてもいなくても、見つけても、大妖怪・三大妖怪の候補は変わらない）", () => {
  const always = { eligible: () => true, chance: () => 1 };
  const noHidden = FUTURE.filter((c) => c.discovery !== "hidden");
  const mame: LegendCandidate = { id: "mamedanuki", rank: "normal", discovery: "hidden" };
  for (let s = 1; s <= 30; s++) {
    const a = drawNightLegends(stream(s), FUTURE, NIGHT_ROSTER, always);
    const b = drawNightLegends(stream(s), noHidden, NIGHT_ROSTER, always);
    const c = drawNightLegends(stream(s), [...FUTURE, mame], NIGHT_ROSTER, always);
    const d = drawNightLegends(stream(s), [...FUTURE, mame], NIGHT_ROSTER);
    assert.deepEqual(a.hidden, ["nurarihyon"]);
    assert.deepEqual(b.hidden, []);
    assert.equal(c.hidden.length, 1, "一夜に一種類まで");
    assert.ok(["nurarihyon", "mamedanuki"].includes(c.hidden[0]), "通常妖怪の隠しも候補になる");
    for (const r of [b, c, d]) assert.deepEqual([a.greater, a.threeGreat], [r.greater, r.threeGreat]);
  }
  const never = { eligible: () => true, chance: () => 0 };
  assert.deepEqual(drawNightLegends(stream(7), FUTURE, NIGHT_ROSTER, never).hidden, []);
});

test("今夜の候補：今の設定（NIGHT_ROSTER）では大妖怪 2〜3・三大妖怪 1。見つけていない隠し妖怪はいない。同じ seed なら同じ", () => {
  const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) {
    const r = new NightLegendRoster(stream(s));
    const { greater, threeGreat, hidden } = r.data;
    assert.ok(greater.length >= NIGHT_ROSTER.greater.min && greater.length <= NIGHT_ROSTER.greater.max, `seed ${s}`);
    assert.equal(threeGreat.length, 1, `seed ${s}`);
    assert.deepEqual(hidden, [], "図鑑が未完成の縁帳では、ぬらりひょんはいない");
    for (const id of [...greater, ...threeGreat]) {
      assert.ok(isActiveYokai(YOKAI[id]) && !isHidden(YOKAI[id]), id);
      assert.ok(r.appearsTonight(id));
      seen.add(id);
    }
    assert.ok(r.appearsTonight("oni"));
    assert.deepEqual(new NightLegendRoster(stream(s)).data, r.data);
  }
  const all = YOKAI_ORDER.filter((id) => isLegend(YOKAI[id]) && !isHidden(YOKAI[id]));
  assert.deepEqual([...seen].sort(), [...all].sort(), "どの大妖怪・三大妖怪も、いつかの夜にはいる");
});

// ---------------------------------------------------------------- 一夜一体・出す窓口

test("一夜一体：町の配置で一夜一体の大妖怪・隠し妖怪は一か所・一体だけ。Encounter の顔ぶれに特別な妖怪・一夜一体の妖怪がいない", () => {
  const spawns = [...SPAWNS, ...PRESENCE_SPAWNS, ...AWAKEN_SPAWNS];
  // 一夜一体の通常妖怪（白沢・八尺様…）は町の決まった配置には無い（今夜の顔ぶれ NormalSpawnPlanner が一体だけ置く：tests/normalYokai.test.ts）
  for (const id of YOKAI_ORDER.filter((t) => isActiveYokai(YOKAI[t]) && isUniquePerNight(YOKAI[t]) && isSpecialYokai(YOKAI[t]))) {
    const s = spawns.filter((p) => p.type === id);
    assert.equal(s.length, 1, `${id} の置き場所`);
    assert.equal(s[0].n, 1, `${id} の数`);
  }
  for (const e of ENCOUNTERS) for (const t of Object.keys(e.members)) assert.ok(!isSpecialYokai(YOKAI[t]) && !isUniquePerNight(YOKAI[t]), `${e.id} に ${t}`);
});

test("出す窓口（SpawnGate）：汎用の窓口から大妖怪・隠し妖怪は出せない。一夜一体は実行時に二体目を作れない", () => {
  const tonight = new Set(["daitengu", "nurarihyon"]);
  const gate = new SpawnGate((t) => !isSpecialYokai(DUMMY[t]) || tonight.has(t), DUMMY);
  // spawnBonus・spawnWild・adopt が使う
  for (const t of ["daitengu", "shuten", "nurarihyon", "mamedanuki"]) assert.equal(gate.allowsGeneric(t), false, t);
  for (const t of ["oni", "tanuki", "tengu"]) assert.equal(gate.allowsGeneric(t), true, t);
  // 初期配置・spawnSpecial が使う
  assert.equal(gate.claim("daitengu"), true);
  assert.equal(gate.claim("daitengu"), false, "二体目は作れない");
  assert.equal(gate.claim("shuten"), false, "今夜の候補でなければ出せない");
  assert.equal(gate.claim("mamedanuki"), false, "隠しの通常妖怪も今夜いなければ出せない");
  tonight.add("mamedanuki");
  assert.equal(gate.claim("mamedanuki"), true);
  assert.equal(gate.claim("mamedanuki"), false, "隠しの通常妖怪も既定で一夜一体");
  assert.equal(gate.claim("nurarihyon"), true);
  assert.equal(gate.claim("nurarihyon"), false);
  assert.equal(gate.claim("oni"), true);
  assert.equal(gate.claim("oni"), true, "通常妖怪は何妖でも");
  assert.equal(gate.claim("nothing"), false);
  assert.deepEqual([...gate.claimed].sort(), ["daitengu", "mamedanuki", "nurarihyon"]);
  // 見つけたことの知らせは一夜に一度（隠し妖怪だけ）
  assert.equal(gate.discover("mamedanuki"), true);
  assert.equal(gate.discover("mamedanuki"), false);
  assert.equal(gate.discover("daitengu"), false, "隠しでない妖怪は「見つける」ものではない");
});

test("姿を見せる経路：隠し妖怪は revealHidden（route hidden）でだけ。通常の経路はすべて同じ門を通る", () => {
  for (const t of ["nurarihyon", "mamedanuki"]) {
    assert.equal(revealAllowed(DUMMY[t], "generic"), false, t);
    assert.equal(revealAllowed(DUMMY[t], "hidden"), true, t);
  }
  for (const t of ["oni", "daitengu", "shuten"]) assert.equal(revealAllowed(DUMMY[t], "generic"), true, t);
  const src = readFileSync("src/game/WildYokai.ts", "utf8");
  const body = (head: string) => {
    const i = src.indexOf(head);
    assert.ok(i >= 0, head);
    return src.slice(i, src.indexOf("\n  }\n", i));
  };
  // 門は reveal の入口に一つ。初期配置・気配の段階・地区覚醒・世界の層・appearAt・提灯・遅れて現れる妖怪は reveal を通る
  assert.match(body("  private reveal("), /if \(!revealAllowed\(YOKAI\[w\.type\], route\)\) return false;/);
  const calls = [...src.matchAll(/this\.reveal\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 8, `reveal の呼び出し ${calls.length}`);
  assert.deepEqual(calls.filter((c) => c.includes("\"hidden\"")), ["w, announce, \"hidden\""], "hidden で見せるのは revealHidden の一か所だけ");
  const rh = body("  revealHidden(");
  assert.match(rh, /this\.reveal\(w, announce, "hidden"\)/);
  // 発見の確定（discover・specialDiscovered）は announce に関係なく行う。announce はイベントに載せて演出だけが見る
  assert.match(rh, /if \(this\.gate\.discover\(type\)\) \{/);
  assert.ok(!/announce &&/.test(rh), "announce で発見の記録を止めない");
  assert.match(rh, /"specialDiscovered"[\s\S]*announce,/);
  // 入口でも隠し妖怪を外す（待ち行列 pending・即時表示・appearAt に積まない）。reveal の門は最後の守りとして残す
  for (const head of ["  activateLayer(", "  revealDistrict(", "  revealPresences("]) assert.match(body(head), /isHidden\(YOKAI\[w\.type\]\)/, head);
  assert.match(src, /appearAt !== undefined && night >= w\.appearAt && !isHidden\(YOKAI\[w\.type\]\)/);
  assert.match(src, /!s\.district && !s\.after && !isHidden\(def\)\) this\.reveal\(w, false\)/);
  // 地区覚醒・行列の遊びの数で姿を見せる妖怪（after）も入口で隠し妖怪を外す
  assert.match(body("  private revealAfter("), /isHidden\(YOKAI\[w\.type\]\)/);
  // 演出は announce と known を見る（発見の保存は LegendSystem が announce に関係なく行う）
  const pres = readFileSync("src/presentation/ParadePresentationDirector.ts", "utf8");
  // （ZukanKnown.discovered が既知に入れてから announce && !known を返す。tests/zukan.test.ts の「初見」）
  assert.match(pres, /if \(!this\.zukanKnown\.discovered\(e\)\) return;/);
  // 気配の段階で姿を見せた妖怪だけを返す（隠し妖怪の気配を鳴らさない）
  assert.match(body("  revealPresences("), /if \(this\.reveal\(w\)\) out\.push\(w\)/);
});

test("出す窓口：WildYokai のどの出し方も窓口を通る（spawnWild・spawnBonus・adopt・初期配置・spawnSpecial）", () => {
  const src = readFileSync("src/game/WildYokai.ts", "utf8");
  const body = (head: string) => {
    const i = src.indexOf(head);
    assert.ok(i >= 0, head);
    return src.slice(i, src.indexOf("\n  }\n", i));
  };
  for (const fn of ["  spawnWild(", "  spawnBonus(", "  adopt("]) assert.match(body(fn), /this\.gate\.allowsGeneric\(/, fn);
  assert.match(body("  spawnSpecial("), /this\.gate\.claim\(/);
  assert.ok(!/spawnLegend/.test(src));
  assert.match(body("  private addSpawn("), /this\.gate\.claim\(/);
  assert.match(body("  spawnWild("), /Wild \| null/, "特別な妖怪は null");
});

// ---------------------------------------------------------------- 誘導からの隔離

const P = (source: ContentPoint["source"], x = 40, z = 0): ContentPoint => ({ x, z, omen: "warai", w: 1, source });

test("誘導：NightPacing（再提示・狐火の道しるべ）は大妖怪・隠し妖怪・町の妖怪を選ばない", () => {
  const content = [P("legend", 40, 0), P("hidden", 0, 40), P("wild", -40, 0)];
  for (let s = 1; s <= 50; s++) assert.equal(pickContent(content, 0, 0, 5, 200, new NightSeed(s).stream("x"), PACING_FILTER), null);
  const ok = [...content, P("rumor", 0, -40)];
  for (let s = 1; s <= 50; s++) assert.equal(pickContent(ok, 0, 0, 5, 200, new NightSeed(s).stream("x"), PACING_FILTER)?.source, "rumor");
  assert.ok(!sourceAllowed("legend", PACING_FILTER) && !sourceAllowed("hidden", PACING_FILTER) && !sourceAllowed("wild", PACING_FILTER));
  // prefer は重みだけ（ふるいにならない）。Pacing は allowed で絞る
  assert.ok(sourceAllowed("legend", { prefer: ["rumor"] }));
  // FestivalSystems の Pacing・狐火は PACING_FILTER、言霊は KOTODAMA_FILTER
  const fs = readFileSync("src/game/FestivalSystems.ts", "utf8");
  assert.match(fs, /pickContent\(player\.x, player\.z, 22, far, PACING_FILTER\)/);
  assert.match(fs, /nearestContent\(p\.x, p\.z, 14, KOTODAMA_FILTER\)/);
  assert.equal((fs.match(/pickContent\(/g) ?? []).length, 1, "Pacing の選び方は一か所だけ");
});

test("誘導：言霊は町の通常妖怪だけ。大妖怪・隠し妖怪へは飛ばない", () => {
  const content = [P("legend", 20, 0), P("hidden", 21, 0)];
  assert.equal(nearestContent(content, 0, 0, 14, KOTODAMA_FILTER), null);
  assert.equal(nearestContent([...content, P("wild", 60, 0)], 0, 0, 14, KOTODAMA_FILTER)?.source, "wild");
});

test("誘導：隠し妖怪は向け先の一覧に入らず、通常の気配も出さない（気配の無い隠し妖怪も wild に落ちない）", () => {
  const w = { state: "idle", perchY: 0 };
  assert.equal(wildSource(DUMMY.nurarihyon), "hidden");
  assert.equal(wildSource(DUMMY.mamedanuki), "hidden", "通常妖怪の隠しも wild ではない");
  assert.equal(wildContent({ ...w, type: "nurarihyon" }, 0, 0, DUMMY), null);
  assert.equal(wildContent({ ...w, type: "mamedanuki" }, 0, 0, DUMMY), null);
  assert.equal(revealOmen("nurarihyon", DUMMY), null);
  assert.equal(revealOmen("mamedanuki", DUMMY), null);
  // 大妖怪は世界から偶然届く弱い気配（通常の ParadeAttraction）だけ。その妖怪らしい音で
  assert.deepEqual(wildContent({ ...w, type: "daitengu" }, 1, 2), { x: 1, z: 2, omen: "fue", w: 1, source: "legend" });
  assert.equal(wildContent({ ...w, type: "shuten" }, 0, 0)?.omen, "warai");
  assert.equal(wildContent({ ...w, type: "kitsune" }, 0, 0)?.source, "wild");
  // 絞り込み無しの通常の気配は legend を選べるが、hidden はどんな選び方でも選ばない
  assert.ok(sourceAllowed("legend") && !sourceAllowed("hidden") && !sourceAllowed("hidden", { excluded: [] }));
  const only = [P("hidden")];
  assert.equal(pickContent(only, 0, 0, 1, 100, new NightSeed(1).stream("x")), null);
  assert.equal(nearestContent(only, 0, 0, 0), null);
  // ヒント・ミニマップの「！」も隠し妖怪（と潜んでいる妖怪）を教えない：WildYokai の hint・forEachVisible は WildIdle の案内の一覧を通す
  const wy = readFileSync("src/game/WildYokai.ts", "utf8");
  const part = (head: string) => wy.slice(wy.indexOf(head), wy.indexOf("\n  }\n", wy.indexOf(head)));
  assert.match(part("  hint("), /nearestGuidable\(/);
  assert.match(part("  forEachVisible("), /forEachGuidable\(/);
  const idle = readFileSync("src/game/WildIdle.ts", "utf8");
  assert.match(idle, /const guidable = \(w: Wild\) => w\.state !== "hidden" && !w\.lurk && !isHidden\(YOKAI\[w\.type\]\)/);
});

// ---------------------------------------------------------------- 陰陽師

test("陰陽師：酒呑童子・大天狗を連れていると退く（妖怪のデータから）", () => {
  const awe = (c: Record<string, number>) => onmyojiAwe({ present: 2, total: 20, counts: new Map(Object.entries(c)), momentumLevel: 0 });
  assert.equal(awe({ shuten: 1 }), "shuten");
  assert.equal(awe({ daitengu: 1 }), "daitengu");
  assert.equal(awe({ shuten: 1, daitengu: 1 }), "shuten", "先に書かれている妖怪が理由");
  assert.equal(awe({ tengu: 5 }), null);
  assert.match(routText("shuten"), /酒呑童子/);
  assert.match(routMemory("daitengu"), /大天狗を連れて/);
  assert.match(routText("size"), /百鬼夜行/);
  // 大妖怪なら必ず退かせる、ではない：データの awe で決まる
  const defs: Record<string, YokaiType> = {
    a: { ...YOKAI.daitengu, id: "a", awe: { mode: "none" } },
    b: { ...YOKAI.daitengu, id: "b", awe: { mode: "slowCast", amount: 0.3 } },
    c: { ...YOKAI.daitengu, id: "c", awe: { mode: "lowerSuspicion", amount: 0.4 } },
    d: { ...YOKAI.oni, id: "d", awe: { mode: "rout", text: "", memory: "" } },
  };
  const all = new Map([["a", 1], ["b", 1], ["c", 1]]);
  assert.equal(routingLegend(all, defs, ["a", "b", "c", "d"]), null);
  assert.equal(routingLegend(new Map([["d", 1]]), defs, ["a", "b", "c", "d"]), "d");
  assert.deepEqual(aweModifiers(all, defs), { castScale: 1.3, suspicionScale: 0.6 });
  assert.deepEqual(aweModifiers(new Map([["shuten", 1], ["oni", 9]])), { castScale: 1, suspicionScale: 1 }, "今の妖怪では変わらない");
  assert.ok(resistsPurge(YOKAI.shuten) && resistsPurge(YOKAI.daitengu), "祓われない");
});

// ---------------------------------------------------------------- 思い出・結果

test("思い出：三大妖怪の加入は今夜の三大出来事にほぼ必ず入る。結果に大妖怪・三大妖怪の加入が残り、JSON にできる", () => {
  const log = new NightMemoryLog();
  log.start(0, 0, 0);
  for (let n = 2; n <= 60; n++) log.join({ t: n * 5, type: "oni", total: n, x: n, z: 0, district: "広場", fromEvent: false });
  log.awaken(200, "商店街", 0, 0);
  log.merge(250, 5, 0, 0);
  log.onmyoji(280, "百鬼夜行の威光で、陰陽師を退けた", 0, 96);
  log.legend({ type: "daitengu", rank: "greater", t: 300, n: 61, district: "寺町", x: -100, z: 27, conditions: describeLegendRule(ruleOf("daitengu")) }, "大天狗");
  log.legend({ type: "shuten", rank: "threeGreat", t: 400, n: 62, district: "妖怪横丁", x: -84, z: -79, conditions: describeLegendRule(ruleOf("shuten")) }, "酒呑童子");
  log.legend({ type: "nurarihyon", rank: "greater", discovery: "hidden", t: 500, n: 63, x: 0, z: 0, conditions: [] }, "ぬらりひょん");
  const hl = log.highlights(3);
  assert.ok(hl.some((e) => e.kind === "legend" && e.type === "shuten"), JSON.stringify(hl.map((e) => e.text)));
  assert.deepEqual([RANK_INFO.greater.memoryWeight, RANK_INFO.threeGreat.memoryWeight], [65, 95]);
  assert.ok(log.events.some((e) => e.text === "三大妖怪・酒呑童子が加わった") && log.events.some((e) => e.text === "大妖怪・大天狗が加わった"));

  const r = buildNightResult({
    seed: 1, theme: "", themeType: "", reason: "shrine", elapsed: 600, nightLength: 1200, total: 63, stage: "",
    types: new Map([["oni", 59], ["shuten", 1], ["daitengu", 1]]), encountersByKind: new Map(), miniMerged: 1, activitiesDone: [],
    districtsAwakened: [], districtsWalked: [], peakMomentum: 40, scatters: 0, titles: [],
    memory: { firstFriend: log.firstFriend, hundredth: null, legends: log.legends, highlights: (n) => log.highlights(n), timeline: () => log.timeline(), route: log.route },
  });
  assert.deepEqual(r.legends.map((l) => [l.type, l.rank, l.discovery]), [["daitengu", "greater", undefined], ["shuten", "threeGreat", undefined], ["nurarihyon", "greater", "hidden"]]);
  assert.deepEqual(r.legends[1].conditions, ["小鬼八妖", "化け狸二妖"]);
  assert.equal(r.legends[1].district, "妖怪横丁");
  assert.equal(r.legends[1].t, 400);
  assert.deepEqual(JSON.parse(JSON.stringify(r.legends)), r.legends, "プレーンな値だけ");
  assert.deepEqual(JSON.parse(JSON.stringify(r)).legends, r.legends);
  assert.ok(!r.scoreParts.some((p) => p.id === "legends"), "加点は仮で 0");
});

// ---------------------------------------------------------------- 写真

const FAM: Family[] = ["CHIBI_BIPED", "CHIBI_QUAD", "FLOAT", "SPECIAL"];
function crowd(n: number): FormationMember[] {
  const out: FormationMember[] = Array.from({ length: n }, (_, i) => ({
    typeId: `t${i % 7}`, family: FAM[i % 4], scale: [0.85, 1, 1.2][i % 3], x: i, z: 0, yaw: 0, rank: "normal" as const,
  }));
  const legend = (id: string): FormationMember => ({ typeId: id, family: "CHIBI_BIPED", scale: YOKAI[id].scale ?? 1, x: 0, z: 0, yaw: 0, photoRole: YOKAI[id].photoRole, rank: YOKAI[id].rank });
  // 行列の途中にいる（並びの順に頼らない）
  out.splice(Math.floor(n / 3), 0, legend("daitengu"));
  out.splice(Math.floor(n / 2), 0, legend("shuten"));
  return out;
}
const PCTX = { anchorX: 0, anchorZ: 0, fx: 0, fz: 1, hero: { x: 0, z: 0, yaw: 0 } };

test("雛壇：三大妖怪は主人公のすぐ後ろの中央、大妖怪は最後列の後ろの中央の高い所。通常の妖怪に埋もれない", () => {
  const tiers = FORMATIONS.find((f) => f.layout === "tiers")!;
  for (const n of [0, 10, 60, 150]) {
    const ms = crowd(n);
    const res = layoutFormation(tiers, ms, PCTX);
    const si = ms.findIndex((m) => m.typeId === "shuten"), di = ms.findIndex((m) => m.typeId === "daitengu");
    const s = res.slots[si], d = res.slots[di];
    const others = ms.filter((_, i) => i !== si && i !== di);
    const normal = res.slots.filter((_, i) => i !== si && i !== di);
    const ground = normal.filter((_, k) => others[k].family !== "FLOAT");
    // 主人公 → 三大妖怪 → 通常の妖怪（手前から）
    assert.ok(res.hero.z > s.z && Math.abs(s.x) < 0.01, `n=${n} 三大妖怪は主人公の後ろの中央`);
    for (const o of normal) assert.ok(o.z < s.z || o.lift > 1, `n=${n} 三大妖怪の前に通常の妖怪がいない`);
    for (const o of ground) if (o.lift < 0.3) assert.ok(Math.abs(o.x - s.x) > 1.2, `n=${n} 三大妖怪の真後ろが空いている`);
    // 大妖怪（rear）：地上のどの妖怪より奥で高く、中央
    assert.ok(Math.abs(d.x) < 0.01, `n=${n} 大妖怪は中央`);
    for (const o of ground) assert.ok(d.z < o.z && d.lift >= o.lift, `n=${n} 大妖怪は最後列の後ろ`);
    const all = [res.hero, ...res.slots];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z, (a.lift - b.lift) * 0.6) > 0.5, `n=${n} ${i} と ${j} が重なる`);
    }
  }
});

test("雛壇：両脇（flank）・上空（air）の大妖怪も、重ならずに特等席へ。同じ立ち位置なら三大妖怪が中央", () => {
  const tiers = FORMATIONS.find((f) => f.layout === "tiers")!;
  const ms: FormationMember[] = [
    ...crowd(40),
    { typeId: "f1", family: "CHIBI_BIPED", scale: 1.3, x: 0, z: 0, yaw: 0, photoRole: "flank", rank: "greater" },
    { typeId: "f2", family: "CHIBI_BIPED", scale: 1.3, x: 0, z: 0, yaw: 0, photoRole: "flank", rank: "greater" },
    { typeId: "a1", family: "FLOAT", scale: 1.3, x: 0, z: 0, yaw: 0, photoRole: "air", rank: "greater" },
    { typeId: "c2", family: "CHIBI_BIPED", scale: 1.3, x: 0, z: 0, yaw: 0, photoRole: "centerpiece", rank: "greater" },
  ];
  const res = layoutFormation(tiers, ms, PCTX);
  const [f1, f2, a1, c2] = res.slots.slice(-4);
  assert.ok(Math.abs(f1.z - res.hero.z) < 0.5 && Math.abs(f2.z - res.hero.z) < 0.5 && f1.x * f2.x < 0, "主人公の両脇");
  assert.ok(Math.abs(a1.x) < 0.01 && res.slots.every((o) => o === a1 || o.lift < a1.lift), "上空のいちばん上の中央");
  const shuten = res.slots[ms.findIndex((m) => m.typeId === "shuten")];
  assert.ok(Math.abs(shuten.x) < 0.01 && Math.abs(c2.x) > 1, "三大妖怪が中央、大妖怪はその横");
  for (const f of FORMATIONS) assert.equal(layoutFormation(f, ms, PCTX).slots.length, ms.length);
});

// ---------------------------------------------------------------- 縁帳（LegendProgress）

test("縁帳：保存・読み込み。会った／仲間にしたを区別する", () => {
  const kv = memKV();
  assert.deepEqual(loadLegendProgress(kv), emptyLegendProgress(), "無ければ空から");
  const p = loadLegendProgress(kv);
  assert.ok(recordMet(p, "daitengu", 10));
  assert.ok(!recordMet(p, "daitengu", 20), "二度目は変わらない");
  recordJoined(p, "shuten", 30);
  recordJoined(p, "shuten", 40);
  assert.ok(saveLegendProgress(kv, p));
  const q = loadLegendProgress(kv);
  assert.deepEqual(q.met, ["daitengu", "shuten"]);
  assert.deepEqual(q.joined, ["shuten"]);
  assert.equal(q.firstMetAt.daitengu, 10);
  assert.equal(q.firstJoinedAt.shuten, 30);
  assert.equal(q.joinCount.shuten, 2);
  assert.equal(q.version, 1);
  assert.ok(kv.map.has(LEGENDS_KEY) && LEGENDS_KEY !== HISTORY_KEY);
});

test("縁帳：壊れた保存・古い形・保存できない環境でも起動できる", () => {
  for (const raw of ["{oops", "null", "42", "[]", '"x"', JSON.stringify({ met: 3, joined: ["shuten", 5, "", "shuten"], firstJoinedAt: { shuten: "x", daitengu: 1 } })]) {
    const kv = memKV();
    kv.map.set(LEGENDS_KEY, raw);
    const p = loadLegendProgress(kv);
    assert.equal(p.version, 1, raw);
    assert.ok(Array.isArray(p.met) && Array.isArray(p.joined), raw);
  }
  const odd = normalizeLegendProgress({ met: 3, joined: ["shuten", 5, "", "shuten"], firstJoinedAt: { shuten: "x", daitengu: 1 } });
  assert.deepEqual(odd.joined, ["shuten"]);
  assert.deepEqual(odd.met, ["shuten"], "仲間にしたなら会っている");
  assert.deepEqual(odd.firstJoinedAt, { daitengu: 1 });
  const broken: KV = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.deepEqual(loadLegendProgress(broken), emptyLegendProgress());
  assert.equal(saveLegendProgress(broken, emptyLegendProgress()), false);
  assert.equal(saveLegendProgress(null, emptyLegendProgress()), false);
});

test("縁帳：直近 10 夜の履歴とは別。履歴が流れても・消えても残る", () => {
  const kv = memKV();
  const p = emptyLegendProgress();
  recordJoined(p, "shuten", 1);
  saveLegendProgress(kv, p);
  const res = (i: number) => ({ version: 2, endedAt: i, seed: i, total: 10, route: [], legends: [] }) as never;
  for (let i = 0; i < 15; i++) pushHistory(kv, res(i));
  assert.equal(loadHistory(kv).length, 10);
  kv.map.delete(HISTORY_KEY);
  assert.deepEqual(loadLegendProgress(kv).joined, ["shuten"]);
});

test("縁帳：格の数（大妖怪・三大妖怪）と、発見方式の数（隠し）は別に数える", () => {
  const p = { met: ["daitengu", "shuten", "nurarihyon", "mamedanuki"], joined: ["daitengu", "shuten", "nurarihyon", "oni", "unknown"] };
  assert.deepEqual(legendTally(p), { greater: 2, threeGreat: 1 }, "ぬらりひょんは大妖怪として数える。通常・知らない妖怪は数えない");
  const disc = (t: string) => (t === "mamedanuki" ? "hidden" as const : undefined) ?? (PLANNED_YOKAI[t]?.discovery ?? YOKAI[t]?.discovery ?? "normal");
  assert.deepEqual(discoveryTally(p, disc), { hiddenMet: 2, hiddenJoined: 1 });
});

test("縁帳：一夜の LegendSystem が、会った・加わったを一度だけ書いて保存する（次の夜にも残る）", () => {
  const kv = memKV();
  const night = (seed: number) => {
    const bus = new Emitter<GameEvents>();
    const followers = [{ actor: { typeId: "tengu" } }, { actor: { typeId: "oni" } }];
    const sys = new LegendSystem({ bus, seed: new NightSeed(seed), kv, parade: { total: 3, followers }, clock: () => 500 });
    return { bus, sys };
  };
  const { bus, sys } = night(1);
  sys.update(1);
  assert.equal(sys.counts.get("tengu"), 1);
  bus.emit("activityComplete", { id: "a", title: "", reward: { type: "oni", n: 1 } });
  assert.deepEqual(legendMissing(ruleOf("daitengu"), sys.context), ["行列の遊びあと一つ"]);
  bus.emit("activityComplete", { id: "b", title: "", reward: { type: "oni", n: 1 } });
  bus.emit("districtAwaken", { id: "plaza", name: "広場", x: 0, z: 0 });
  bus.emit("encounterComplete", { id: 1, kind: "foxfireTrail", title: "", x: 0, z: 0 });
  bus.emit("momentum", { v: 90, level: 4, name: "熱狂", up: true });
  assert.deepEqual(legendMissing(ruleOf("daitengu"), sys.context), []);
  assert.deepEqual([sys.context.districtsAwakened, sys.context.encounters.get("foxfireTrail"), sys.context.momentumLevel], [["plaza"], 1, 4]);
  bus.emit("legendMeet", { type: "daitengu", rank: "greater", discovery: "normal", x: 0, z: 0 });
  bus.emit("legendJoin", { type: "daitengu", rank: "greater", discovery: "normal", total: 4, x: 0, z: 0, conditions: [] });
  bus.emit("legendJoin", { type: "daitengu", rank: "greater", discovery: "normal", total: 4, x: 0, z: 0, conditions: [] });
  assert.equal(sys.progress.joinCount.daitengu, 1, "一夜に一度");
  assert.ok(sys.debugLines().join("\n").includes("大天狗"));
  // 隠し妖怪（通常妖怪の隠しでも）を見つけた：加入していなくても met に残る
  // announce = false（演出なし）でも、発見は必ず記録してすぐ保存する
  bus.emit("specialDiscovered", { type: "mamedanuki", rank: "normal", discovery: "hidden", source: "test", announce: false, known: false });
  assert.ok(sys.progress.met.includes("mamedanuki") && !sys.progress.joined.includes("mamedanuki"));
  assert.ok(sys.discovered("mamedanuki"));
  const next = night(2).sys;
  assert.deepEqual(next.progress.joined, ["daitengu"]);
  assert.ok(next.progress.met.includes("mamedanuki"), "すぐ保存されている");
  assert.equal(next.progress.firstJoinedAt.daitengu, 500);
});

// ---------------------------------------------------------------- 温泉宿の解禁

test("解禁：大妖怪・三大妖怪の数と、隠し妖怪の発見（別の軸）から、温泉宿の噂・道・宴会場・最深部を判定する", () => {
  const got = (joined: string[], met: string[] = joined) => evaluateSpecialUnlocks({ joined, met });
  assert.ok(Object.values(got([])).every((v) => !v));
  assert.deepEqual(Object.keys(got([])).sort(), SPECIAL_UNLOCKS.map((u) => u.id).sort());
  const three = got(["daitengu", "ibaraki", "planned_greater_c"]);
  assert.ok(three.onsenRumor && !three.onsenEntrance);
  assert.ok(!got(["shuten"]).onsenEntrance, "三大妖怪一種類だけでは開かない");
  assert.ok(got(["shuten", "daitengu", "planned_greater_c"]).onsenEntrance, "大妖怪二＋三大妖怪一");
  assert.ok(got(["daitengu", "ibaraki", "planned_greater_c", "ushi_oni", "planned_greater_a"]).onsenEntrance, "大妖怪五");
  assert.ok(got(["shuten", "tamamo"]).onsenBanquet);
  assert.ok(!got(["shuten", "tamamo", "otakemaru"]).onsenInnerArea, "隠し妖怪の発見も要る");
  assert.ok(got(["shuten", "tamamo", "otakemaru"], ["shuten", "tamamo", "otakemaru", "nurarihyon"]).onsenInnerArea, "会っただけでよい（hiddenDiscovered）");
  // ぬらりひょんは格では大妖怪として数える（隠しは格の数に混ぜない）
  assert.ok(got(["nurarihyon", "daitengu", "planned_greater_c"]).onsenRumor);
  // 閾値は差し替えられる
  assert.deepEqual(evaluateSpecialUnlocks({ joined: ["daitengu"], met: [] }, [{ id: "x", name: "x", anyOf: [{ greater: 1 }] }]), { x: true });
  assert.deepEqual(evaluateSpecialUnlocks({ joined: [], met: ["nurarihyon"] }, [{ id: "y", name: "y", anyOf: [{ hiddenJoined: 1 }] }]), { y: false });
});
