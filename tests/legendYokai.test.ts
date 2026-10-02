// 大妖怪・三大妖怪・隠し妖怪の実装データ（data/legendYokai.ts）：姿・出る場所・加入条件が揃っていて、伝承に沿った言葉になっているか
import { test } from "node:test";
import assert from "node:assert/strict";
import { YOKAI, YOKAI_ICON, YOKAI_ORDER } from "../src/data/yokaiTypes.ts";
import { LEGEND_IDS, LEGEND_SPAWNS, LEGEND_YOKAI } from "../src/data/legendYokai.ts";
import { SPAWNS, WORLD } from "../src/data/map.ts";
import { DISTRICT_BY_ID } from "../src/data/districts.ts";
import { ENCOUNTER_GOALS } from "../src/data/encounters.ts";
import { WORLD_LAYERS } from "../src/data/worldLayers.ts";
import { MODELS } from "../src/characters/models.ts";
import { NightSeed } from "../src/core/seed.ts";
import { Emitter } from "../src/core/Events.ts";
import { LEGENDS_KEY, ZUKAN_KEY, type KV } from "../src/core/SaveData.ts";
import { emptyLegendProgress } from "../src/game/legends/LegendProgress.ts";
import { checkCondition, describeLegendRule, emptyLegendContext, isLegend, isSpecialYokai, legendMet } from "../src/game/legends/LegendRules.ts";
import { LegendSystem } from "../src/game/legends/LegendSystem.ts";
import { MOMENTUM_LEVELS } from "../src/game/FestivalMomentum.ts";
import type { GameEvents } from "../src/game/events.ts";

const NORMAL_TYPES = YOKAI_ORDER.filter((id) => !isSpecialYokai(YOKAI[id]));

test("大妖怪以上：図鑑の順は legendYokai の並び。すべてに姿（モデル）・墨判の一文字・町の場所が一つずつある", () => {
  assert.deepEqual(YOKAI_ORDER.slice(-LEGEND_IDS.length), LEGEND_IDS);
  for (const id of LEGEND_IDS) {
    const d = LEGEND_YOKAI[id];
    assert.equal(YOKAI[id], d);
    assert.ok(isSpecialYokai(d), id);
    assert.ok(MODELS[id]?.length > 3, `${id}：モデル`);
    assert.equal([...(YOKAI_ICON[id] ?? "")].length, 1, `${id}：墨判`);
    const sp = SPAWNS.filter((s) => s.type === id);
    assert.equal(sp.length, 1, `${id}：出る場所は一か所`);
    assert.deepEqual([sp[0].n, sp[0].r], [1, 0]);
    assert.ok(sp[0].x > WORLD.minX && sp[0].x < WORLD.maxX && sp[0].z > WORLD.minZ && sp[0].z < WORLD.maxZ, `${id}：町の中`);
    if (sp[0].layer) assert.ok(WORLD_LAYERS.some((l) => l.id === sp[0].layer) && sp[0].keepRule, `${id}：世界の層`);
    if (sp[0].appearAt !== undefined) assert.ok(sp[0].appearAt > 0 && sp[0].appearAt < 1, id);
    assert.ok(d.scale && d.scale >= 1, `${id}：大きさ`);
  }
  assert.equal(LEGEND_SPAWNS.length, LEGEND_IDS.length);
});

test("大妖怪以上の加入条件：すべて legend。条件は実在する妖怪・地区・出来事・賑わいの段を指す", () => {
  for (const id of LEGEND_IDS) {
    const r = YOKAI[id].rule;
    assert.equal(r.kind, "legend", id);
    if (r.kind !== "legend") continue;
    assert.ok(r.conditions.length >= 1 && r.ask && r.ok, id);
    for (const c of r.conditions) {
      switch (c.kind) {
        case "specificYokai":
          assert.ok(NORMAL_TYPES.includes(c.type), `${id}：${c.type} は町で仲間にできる通常の妖怪`);
          break;
        case "districtAwakened":
          if (c.district) assert.ok(DISTRICT_BY_ID.get(c.district)?.awaken, `${id}：${c.district}`);
          break;
        case "encounterComplete":
          if (c.encounter) assert.ok(c.encounter in ENCOUNTER_GOALS, `${id}：${c.encounter}`);
          break;
        case "momentum":
          assert.ok(c.level >= 0 && c.level < MOMENTUM_LEVELS.length, id);
          break;
        case "typeVariety":
          assert.ok(c.n <= NORMAL_TYPES.length, `${id}：集められる種類の数まで`);
          break;
        default:
          break;
      }
    }
    // 条件の説明が作れる（結果・縁帳の「どうやって加わったか」）
    assert.equal(describeLegendRule(r).length, r.conditions.length);
  }
});

test("伝承に沿う：茨木童子は鬼を、牛鬼は河童と川辺を、ガシャドクロは人魂を、玉藻前は狐と狐火を求める。玉藻前は陰陽師を退けない", () => {
  const conds = (id: string) => JSON.stringify(YOKAI[id].rule);
  assert.match(conds("ibaraki"), /"type":"oni"/);
  assert.match(conds("ushi_oni"), /"type":"kappa".*"district":"riverside"/);
  assert.match(conds("gashadokuro"), /"type":"hitodama"/);
  assert.match(conds("tamamo"), /"type":"kitsune".*"encounter":"foxfireTrail"/);
  assert.match(conds("orochi"), /"encounter":"hungryGroup"/);
  // 神野悪五郎は魔物を率いる頭領：多くの種類を従え、よその百鬼夜行と張り合う（山本五郎左衛門の「怪異三つ＋ろくろ首」とは別）
  assert.match(conds("shinno_akugoro"), /typeVariety.*"encounter":"miniParade"/);
  assert.notEqual(conds("shinno_akugoro"), conds("sanmoto"));
  assert.ok(!/rokurokubi/.test(conds("shinno_akugoro")));
  // 対になる二体は、相手を連れていると一言（加入条件ではない）
  assert.match(conds("shinno_akugoro"), /"greet":\{"with":"sanmoto"/);
  assert.match(conds("sanmoto"), /"greet":\{"with":"shinno_akugoro"/);
  assert.ok(!/"type":"sanmoto"|"type":"shinno_akugoro"/.test(conds("shinno_akugoro") + conds("sanmoto")), "相手を加入条件にしない");
  assert.equal(YOKAI.tamamo.awe, undefined, "伝承で正体を見破ったのは陰陽師");
  assert.equal(SPAWNS.find((s) => s.type === "ushi_oni")!.x < 58, true, "牛鬼は川辺（川の西岸）");
  assert.equal(YOKAI.nurarihyon.omen, undefined, "隠し妖怪は気配で教えない");
  for (const id of LEGEND_IDS) assert.equal(isLegend(YOKAI[id]), true, id);
});

test("条件「妖怪の種類」（typeVariety）：今の行列にいる種類の数（主人公を除く）", () => {
  const x = emptyLegendContext();
  const c = { kind: "typeVariety" as const, n: 3 };
  assert.deepEqual(checkCondition(c, x), { met: false, lack: "妖怪の種類あと三つ" });
  x.counts = new Map([["oni", 5], ["kappa", 1], ["tanuki", 0]]);
  assert.deepEqual(checkCondition(c, x).lack, "妖怪の種類あと一つ", "0 妖の種類は数えない");
  x.counts = new Map([["oni", 5], ["kappa", 1], ["tanuki", 2]]);
  assert.ok(legendMet({ conditions: [c] }, x));
  assert.deepEqual(describeLegendRule({ conditions: [c] }), ["三種の妖怪"]);
});

// ---------------------------------------------------------------- 隠し妖怪に気づく（町）

function memKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

/** 通常の図鑑を埋めた保存（隠し妖怪を除く） */
function completedZukan(kv: KV) {
  kv.setItem(ZUKAN_KEY, JSON.stringify(Object.fromEntries(YOKAI_ORDER.filter((id) => YOKAI[id].discovery === "normal").map((id) => [id, 1]))));
}
const night = (kv: KV, s: number, player?: { x: number; z: number }) =>
  new LegendSystem({ bus: new Emitter<GameEvents>(), seed: new NightSeed(s), kv, parade: { total: 1, followers: [] }, player });

test("ぬらりひょん：図鑑を埋めても、温泉宿で見つけるまでは町の夜にいない", () => {
  const kv = memKV();
  completedZukan(kv);
  for (let s = 1; s <= 300; s++) assert.deepEqual(night(kv, s).roster.data.hidden, [], `seed ${s}`);
});

test("ぬらりひょん：温泉宿で見つけた（縁帳の met）後は、町の夜にまれにいて、すぐそばまで来たときだけ姿を見せる（案内しない）", () => {
  const kv = memKV();
  completedZukan(kv);
  kv.setItem(LEGENDS_KEY, JSON.stringify({ ...emptyLegendProgress(), met: ["nurarihyon"] }));
  const player = { x: 0, z: 0 };
  let nights = 0, found: LegendSystem | null = null;
  for (let s = 1; s <= 400; s++) {
    const sys = night(kv, s, player);
    if (sys.roster.data.hidden.includes("nurarihyon")) {
      nights++;
      found ??= sys;
    }
  }
  assert.ok(nights > 15 && nights < 80, `400 夜中 ${nights} 夜（postDiscoveryWorldChance 0.1）`);
  const at = SPAWNS.find((s) => s.type === "nurarihyon")!;
  const revealed: string[] = [];
  found!.bindHidden({ hiddenAt: (t) => (revealed.includes(t) ? null : { x: at.x, z: at.z }), revealHidden: (t) => revealed.push(t) });
  player.x = at.x + 20;
  player.z = at.z;
  found!.update(1);
  assert.deepEqual(revealed, [], "遠くからは気づかない");
  player.x = at.x + 3;
  found!.update(1);
  assert.deepEqual(revealed, ["nurarihyon"]);
  found!.update(1);
  assert.deepEqual(revealed, ["nurarihyon"], "一度だけ");
});
