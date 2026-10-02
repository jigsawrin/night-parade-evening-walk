// 温泉宿の宿泊客（OnsenGuestRoster）と図鑑の一項目（別名）。温泉宿そのものはまだ無い：純粋ロジックだけ
import { test } from "node:test";
import assert from "node:assert/strict";
import { YOKAI, YOKAI_ORDER, type YokaiType } from "../src/data/yokaiTypes.ts";
import { ONSEN_GUESTS } from "../src/data/onsen.ts";
import { drawOnsenGuests, guestArea, onsenEligible } from "../src/game/onsen/OnsenGuestRoster.ts";

/** 将来を想定した図鑑：通常妖怪 30 種・大妖怪 6 種・三大妖怪 3 種・隠し 2 種 */
const DEFS: Record<string, YokaiType> = { ...YOKAI };
const ORDER: string[] = [...YOKAI_ORDER];
const add = (id: string, base: string, o: Partial<YokaiType>) => {
  DEFS[id] = { ...YOKAI[base], id, ...o };
  ORDER.push(id);
};
for (let i = 0; i < 18; i++) add(`n${i}`, "oni", { rank: "normal" });
for (const id of ["ibaraki", "planned_greater_c", "ushi_oni", "planned_greater_a", "planned_greater_b"]) add(id, "daitengu", { rank: "greater" });
add("tamamo", "shuten", { rank: "threeGreat", aliases: ["九尾の狐"] });
add("otakemaru", "shuten", { rank: "threeGreat" });
add("nurarihyon", "daitengu", { rank: "greater", discovery: "hidden" });
add("mamedanuki", "tanuki", { rank: "normal", discovery: "hidden" });
const NORMALS = ORDER.filter((t) => DEFS[t].rank === "normal" && DEFS[t].discovery === "normal");
const LEGENDS = ORDER.filter((t) => DEFS[t].rank !== "normal");
const ALL = [...ORDER];
const draw = (registered: string[], seed: number, joined: string[] = LEGENDS, cfg = ONSEN_GUESTS, extra?: string[], forced?: string[], met: string[] = []) =>
  drawOnsenGuests({ registered, legendProgress: { met, joined }, seed, extraEligible: extra, forcedGuests: forced }, cfg, DEFS, ORDER);

test("温泉宿：図鑑に載っていない妖怪は泊まりに来ない。載っていれば候補になる", () => {
  const reg = ["oni", "kappa", "tanuki", "daitengu"];
  for (let s = 1; s <= 30; s++) for (const t of draw(reg, s).all) assert.ok(reg.includes(t), `${t}`);
  assert.equal(onsenEligible("kitsune", { registered: reg, legendProgress: { met: [], joined: [] } }, ONSEN_GUESTS, DEFS), false);
  assert.equal(onsenEligible("oni", { registered: reg, legendProgress: { met: [], joined: [] } }, ONSEN_GUESTS, DEFS), true);
  // 通常妖怪が少なければ全員泊まっている
  assert.deepEqual(draw(["oni", "kappa"], 3).normal, ["oni", "kappa"].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
});

test("温泉宿：大妖怪・三大妖怪は縁帳で仲間にしたことも要る（設定で変えられる）", () => {
  const reg = ["oni", "daitengu", "shuten"];
  for (let s = 1; s <= 20; s++) {
    const r = draw(reg, s, []);
    assert.deepEqual([r.greater, r.threeGreat], [[], []]);
  }
  const loose = { ...ONSEN_GUESTS, legendNeedsJoined: false, greater: { min: 1, max: 1 }, threeGreat: { min: 1, max: 1 } };
  const r = draw(reg, 1, [], loose);
  assert.deepEqual([r.greater, r.threeGreat], [["daitengu"], ["shuten"]]);
});

test("温泉宿：同じ訪問の seed ＋ 同じ図鑑なら同じ宿泊客。seed が違えば顔ぶれが変わる", () => {
  for (const s of [1, 42, 12345]) {
    assert.deepEqual(draw(ALL, s), draw(ALL, s));
    assert.deepEqual(draw(ALL, s), draw([...ALL].reverse(), s), "図鑑の並びに左右されない");
  }
  const seen = new Set<string>();
  for (let s = 1; s <= 30; s++) seen.add(draw(ALL, s).all.join(","));
  assert.ok(seen.size > 20, `顔ぶれ ${seen.size} 通り`);
});

test("温泉宿：大妖怪・三大妖怪・隠し妖怪の人数を設定で抑えられる。全員登録しても毎回全員は来ない", () => {
  let hiddenVisits = 0;
  for (let s = 1; s <= 200; s++) {
    const r = draw(ALL, s);
    assert.ok(r.normal.length >= ONSEN_GUESTS.normal.min && r.normal.length <= ONSEN_GUESTS.normal.max, `seed ${s} 通常 ${r.normal.length}`);
    assert.ok(r.greater.length >= 1 && r.greater.length <= 3, `seed ${s}`);
    assert.ok(r.threeGreat.length <= 1, `seed ${s}`);
    assert.ok(r.hidden.length <= ONSEN_GUESTS.hidden.max);
    assert.ok(!r.greater.includes("nurarihyon") && !r.normal.includes("mamedanuki"), "隠し妖怪は格の枠に混ぜない");
    assert.ok(r.all.length < ALL.length, "全員は来ない");
    assert.equal(new Set(r.all).size, r.all.length);
    hiddenVisits += r.hidden.length;
  }
  assert.ok(hiddenVisits > 0 && hiddenVisits < 100, "隠し妖怪はたまに");
  const tight = { ...ONSEN_GUESTS, greater: { min: 0, max: 1 }, threeGreat: { min: 0, max: 0 } };
  for (let s = 1; s <= 50; s++) {
    const r = draw(ALL, s, LEGENDS, tight);
    assert.ok(r.greater.length <= 1 && r.threeGreat.length === 0);
  }
  assert.ok(NORMALS.length > ONSEN_GUESTS.normal.max);
});

test("温泉宿：将来の特例（図鑑に載る前から旅館にいる）を足せる入口がある", () => {
  const always = { ...ONSEN_GUESTS, hidden: { chance: 1, max: 1 } };
  const r = draw(["oni"], 5, [], always, ["nurarihyon"]);
  assert.deepEqual(r.hidden, ["nurarihyon"]);
  assert.equal(guestArea("shuten"), "banquet");
  assert.equal(guestArea("oni"), "banquet", "通常の妖怪にも居たがる区域がある");
  assert.equal(guestArea("nothing"), null);
});

test("温泉宿：隠し妖怪は見つけた（縁帳の met）後だけ、隠し妖怪の抽選に入る", () => {
  const cfg = { ...ONSEN_GUESTS, hidden: { chance: 1, max: 1 } };
  const reg = NORMALS.slice(0, 5);
  for (let s = 1; s <= 20; s++) assert.deepEqual(draw(reg, s, [], cfg, undefined, undefined, []).hidden, [], "見つけていない");
  for (let s = 1; s <= 20; s++) assert.deepEqual(draw(reg, s, [], cfg, undefined, undefined, ["nurarihyon"]).hidden, ["nurarihyon"], "見つけた後");
});

test("温泉宿：必ずいる客（forcedGuests）は抽選に関係なく、数の上限の外で必ずいる", () => {
  const none = { ...ONSEN_GUESTS, hidden: { chance: 0, max: 1 }, greater: { min: 3, max: 3 } };
  for (let s = 1; s <= 30; s++) {
    const r = draw(ALL, s, LEGENDS, none, undefined, ["nurarihyon"], []);
    assert.deepEqual(r.forced, ["nurarihyon"]);
    assert.ok(r.all.includes("nurarihyon"), `seed ${s}`);
    assert.equal(r.greater.length, 3, "大妖怪の枠はそのまま（ぬらりひょんは枠の外）");
    assert.ok(!r.greater.includes("nurarihyon") && !r.hidden.includes("nurarihyon"));
  }
  assert.deepEqual(draw(["oni"], 1, [], ONSEN_GUESTS, undefined, ["ghost"]).forced, [], "実在しない種類は入れない");
});

test("温泉宿：乱数は格ごとに別（通常妖怪が増えても、大妖怪・三大妖怪の顔ぶれは変わらない）", () => {
  const fewer = ALL.filter((t) => !/^n1/.test(t));
  for (let s = 1; s <= 30; s++) {
    const a = draw(ALL, s), b = draw(fewer, s);
    assert.deepEqual([a.greater, a.threeGreat, a.hidden], [b.greater, b.threeGreat, b.hidden], `seed ${s}`);
  }
});
