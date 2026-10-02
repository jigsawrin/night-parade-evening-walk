// 温泉宿「宵霞楼」：入れるか・訪問・宿泊客・ぬらりひょんの初めての出会い・居場所
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { YOKAI, YOKAI_ORDER, isActiveYokai } from "../src/data/yokaiTypes.ts";
import { HIDDEN_DISCOVERIES, SPECIAL_UNLOCKS } from "../src/data/legendConfig.ts";
import { FINAL_NORMAL_WAVE } from "../src/data/normalYokai.ts";
import { ONSEN_AREAS, ONSEN_GUESTS } from "../src/data/onsen.ts";
import { ONSEN_POOLS, ONSEN_SPOTS, ONSEN_BOUNDS } from "../src/data/onsenMap.ts";
import { NightSeed } from "../src/core/seed.ts";
import { ONSEN_KEY, loadOnsenVisit, saveOnsenVisit, type KV } from "../src/core/SaveData.ts";
import { discoverHidden, emptyLegendProgress, hiddenWorldEligible, type LegendProgress } from "../src/game/legends/LegendProgress.ts";
import { zukanCompletion, visibleZukanTypes } from "../src/game/ZukanRules.ts";
import { beginVisit, emptyVisitSave, firstDiscoveriesNow, leaveVisit, onsenAccess, openZones, visitGuests } from "../src/game/onsen/OnsenVisit.ts";
import { BIG_SCALE, placeGuests, spotFits } from "../src/game/onsen/OnsenPlacementRules.ts";
import { nearestPoolDistance } from "../src/onsen/audio/OnsenSoundscape.ts";

const NORMAL = YOKAI_ORDER.filter((t) => isActiveYokai(YOKAI[t]) && YOKAI[t].rank === "normal" && YOKAI[t].discovery === "normal");
const LEGENDS = YOKAI_ORDER.filter((t) => YOKAI[t].rank !== "normal" && YOKAI[t].discovery === "normal");
const THREE = LEGENDS.filter((t) => YOKAI[t].rank === "threeGreat");
const GREATER = LEGENDS.filter((t) => YOKAI[t].rank === "greater");
/** 図鑑：通常の妖怪と、渡した大妖怪を仲間にした */
const zukanOf = (types: readonly string[]) => Object.fromEntries(types.map((t) => [t, 1]));
const progressOf = (joined: string[], met: string[] = []): LegendProgress => ({ ...emptyLegendProgress(), joined: [...joined], met: [...new Set([...joined, ...met])] });
/** 温泉宿への道が開いている縁帳（大妖怪五） */
const ENTRANCE = GREATER.slice(0, 5);
const memKV = (): KV & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};
const rand = (seed: number) => {
  const r = new NightSeed(seed).stream("onsenPlace");
  return () => r.next();
};

// ---------------------------------------------------------------- 入れるか

test("入れるか：温泉宿への道（onsenEntrance）が開いていなければ入れない。噂だけなら入れない", () => {
  assert.deepEqual(onsenAccess(progressOf([])), { rumor: false, entrance: false, banquet: false, inner: false });
  const rumorOnly = onsenAccess(progressOf(GREATER.slice(0, 3)));
  assert.deepEqual([rumorOnly.rumor, rumorOnly.entrance], [true, false]);
  assert.equal(openZones(rumorOnly).size, 0);
  const e = onsenAccess(progressOf(ENTRANCE));
  assert.ok(e.entrance);
  assert.deepEqual([...openZones(e)], ["base"]);
  // 閾値はデータのまま（SPECIAL_UNLOCKS）
  assert.deepEqual(SPECIAL_UNLOCKS.find((u) => u.id === "onsenEntrance")!.anyOf, [{ greater: 5 }, { greater: 2, threeGreat: 1 }]);
});

test("入れるか：宴会場は onsenBanquet、月見の奥庭は onsenInnerArea で開く", () => {
  const banquet = onsenAccess(progressOf([...GREATER.slice(0, 2), ...THREE.slice(0, 2)]));
  assert.ok(banquet.entrance && banquet.banquet && !banquet.inner);
  assert.deepEqual([...openZones(banquet)].sort(), ["banquet", "base"]);
  const inner = onsenAccess(progressOf([...GREATER.slice(0, 2), ...THREE], ["nurarihyon"]));
  assert.ok(inner.inner);
  assert.deepEqual([...openZones(inner)].sort(), ["banquet", "base", "inner"]);
});

// ---------------------------------------------------------------- 訪問

test("訪問：宿を出るまで同じ訪問（リロード・図鑑・写真でも変わらない）。出て次に来ると新しい種", () => {
  const kv = memKV();
  let n = 100;
  const seed = () => n++;
  let save = beginVisit(loadOnsenVisit(kv), seed, []);
  saveOnsenVisit(kv, save);
  assert.deepEqual([save.visitNo, save.active!.seed], [1, 100]);
  // リロード相当：読み直して入り直しても同じ
  const again = beginVisit(loadOnsenVisit(kv), seed, ["nurarihyon"]);
  assert.deepEqual(again, save, "同じ訪問（必ずいる客も訪問を始めたときのまま）");
  save = leaveVisit(again);
  saveOnsenVisit(kv, save);
  const next = beginVisit(loadOnsenVisit(kv), seed, []);
  assert.deepEqual([next.visitNo, next.active!.seed], [2, 101]);
  assert.ok(kv.map.has(ONSEN_KEY));
  assert.deepEqual(loadOnsenVisit({ getItem: () => "{壊れた", setItem: () => {} }), emptyVisitSave());
});

test("訪問：同じ種＋同じ図鑑・縁帳なら同じ宿泊客。種が変われば顔ぶれも変わる", () => {
  const zukan = zukanOf([...NORMAL, ...LEGENDS]);
  const p = progressOf(LEGENDS);
  const a = visitGuests(zukan, p, { seed: 7, forced: [] });
  assert.deepEqual(visitGuests(zukan, p, { seed: 7, forced: [] }), a);
  const differs = [8, 9, 10, 11].some((s) => JSON.stringify(visitGuests(zukan, p, { seed: s, forced: [] }).all) !== JSON.stringify(a.all));
  assert.ok(differs);
});

// ---------------------------------------------------------------- 宿泊客

test("宿泊客：図鑑に載っていない妖怪・future の妖怪は来ない。大妖怪以上は縁帳で仲間にしたことが要る。人数は ONSEN_GUESTS のまま", () => {
  const reg = [...NORMAL.slice(0, 6), "shuten", "daitengu"];
  for (let s = 1; s <= 30; s++) {
    const g = visitGuests(zukanOf(reg), progressOf(["daitengu"]), { seed: s, forced: [] });
    for (const t of g.all) assert.ok(reg.includes(t), t);
    assert.ok(!g.all.includes("shuten"), "図鑑にいても、縁帳で仲間にしていなければ来ない");
    for (const t of g.all) assert.ok(isActiveYokai(YOKAI[t]));
  }
  const all = visitGuests(zukanOf([...NORMAL, ...LEGENDS]), progressOf(LEGENDS), { seed: 3, forced: [] });
  assert.ok(all.normal.length >= Math.min(NORMAL.length, ONSEN_GUESTS.normal.min) && all.normal.length <= ONSEN_GUESTS.normal.max);
  assert.ok(all.greater.length >= 1 && all.greater.length <= 3 && all.threeGreat.length <= 1);
  assert.deepEqual([ONSEN_GUESTS.hidden.chance, ONSEN_GUESTS.legendNeedsJoined], [0.2, true]);
});

test("宿泊客：隠し妖怪は見つけた（met）後だけ抽選に入る。必ずいる客（forced）は人数の上限を超えても必ずいる", () => {
  const zukan = zukanOf([...NORMAL, ...LEGENDS]);
  for (let s = 1; s <= 60; s++) assert.ok(!visitGuests(zukan, progressOf(LEGENDS), { seed: s, forced: [] }).all.includes("nurarihyon"), `seed ${s}`);
  const found = progressOf(LEGENDS, ["nurarihyon"]);
  const nights = Array.from({ length: 200 }, (_, s) => visitGuests(zukan, found, { seed: s + 1, forced: [] }).hidden.length).reduce((a, b) => a + b, 0);
  assert.ok(nights > 15 && nights < 80, `200 回中 ${nights} 回（hidden.chance 0.2）`);
  for (let s = 1; s <= 20; s++) {
    const g = visitGuests(zukan, progressOf(LEGENDS), { seed: s, forced: ["nurarihyon"] });
    assert.ok(g.all.includes("nurarihyon") && g.forced.includes("nurarihyon"));
    assert.ok(g.normal.length + g.greater.length + g.threeGreat.length <= ONSEN_GUESTS.normal.max + ONSEN_GUESTS.greater.max + ONSEN_GUESTS.threeGreat.max);
  }
});

// ---------------------------------------------------------------- ぬらりひょん

test("ぬらりひょん：図鑑が未完成・温泉宿への道が開いていなければ必ずいる客にならない。条件がそろい、見つけていなければ必ずいる", () => {
  assert.equal(HIDDEN_DISCOVERIES.nurarihyon.postDiscoveryWorldChance, 0.1);
  const complete = zukanOf([...NORMAL, ...LEGENDS]);
  const incomplete = zukanOf([...NORMAL.slice(1), ...LEGENDS]);
  assert.deepEqual(firstDiscoveriesNow(incomplete, progressOf(LEGENDS), FINAL_NORMAL_WAVE), [], "図鑑が未完成");
  // 図鑑は埋まったが、温泉宿への道が開いていない（大妖怪は仲間にしていない）
  assert.equal(zukanCompletion(complete, { ...progressOf([]), normalWave: FINAL_NORMAL_WAVE }).allNormalContentComplete, true);
  assert.deepEqual(firstDiscoveriesNow(complete, progressOf([]), FINAL_NORMAL_WAVE), []);
  assert.deepEqual(firstDiscoveriesNow(complete, progressOf(LEGENDS), FINAL_NORMAL_WAVE), ["nurarihyon"]);
  // 最後の wave がまだ開いていなければ（町に混ざる通常妖怪がまだいる）、今の図鑑が埋まっていても会わない
  const early = zukanOf([...NORMAL.filter((t) => (YOKAI[t].normalWave ?? 0) <= 2), ...LEGENDS]);
  assert.equal(zukanCompletion(early, { ...progressOf(LEGENDS), normalWave: 2 }).normalComplete, true, "wave 2 までの図鑑は完成");
  assert.deepEqual(firstDiscoveriesNow(early, progressOf(LEGENDS), 2), [], "途中の wave の完成では会わない");
  assert.deepEqual(firstDiscoveriesNow(complete, progressOf(LEGENDS), FINAL_NORMAL_WAVE - 1), [], "最後の wave が開くまでは会わない");
});

test("ぬらりひょん：入館しただけでは見つけたことにならない。話しかけたときに縁帳の met へ保存し、図鑑は N/N → N+1/N+1。次の訪問からは必ずいる客ではない", () => {
  const kv = memKV();
  const zukan = zukanOf([...NORMAL, ...LEGENDS]);
  const p = progressOf(LEGENDS);
  // 入館
  const forced = firstDiscoveriesNow(zukan, p, FINAL_NORMAL_WAVE);
  const save = beginVisit(emptyVisitSave(), () => 5, forced);
  const g = visitGuests(zukan, p, save.active!);
  assert.ok(g.all.includes("nurarihyon"));
  assert.ok(!p.met.includes("nurarihyon"), "入っただけでは見つけていない");
  assert.equal(hiddenWorldEligible("nurarihyon", p, undefined, true), false, "町の夜の候補にもならない");
  const before = zukanCompletion(zukan, p);
  assert.deepEqual([before.seen, before.total, before.complete], [before.total, before.total, true]);
  assert.ok(!visibleZukanTypes(zukan, p).includes("nurarihyon"));
  // 話しかけた
  let saved: LegendProgress | null = null;
  assert.equal(discoverHidden(p, "nurarihyon", 1234, (q) => (saved = q)), true);
  assert.ok(saved && (saved as LegendProgress).met.includes("nurarihyon"));
  assert.equal(discoverHidden(p, "nurarihyon", 1300, () => {}), false, "二度目は新しくない");
  const after = zukanCompletion(zukan, p);
  assert.deepEqual([after.seen, after.total, after.complete], [before.total + 1, before.total + 1, true], "N/N → N+1/N+1");
  // 同じ訪問の顔ぶれは変わらない（入り直しても同じ）
  assert.deepEqual(visitGuests(zukan, p, save.active!).all, g.all);
  // 次の訪問：必ずいる客ではなく、通常の隠し妖怪の抽選へ。町の夜の候補の資格も持つ
  assert.deepEqual(firstDiscoveriesNow(zukan, p), []);
  assert.equal(hiddenWorldEligible("nurarihyon", p), true);
  void kv;
});

// ---------------------------------------------------------------- 居場所

const defs = YOKAI;
const allOpen = openZones({ rumor: true, entrance: true, banquet: true, inner: true });
const baseOnly = openZones({ rumor: true, entrance: true, banquet: false, inner: false });

test("居場所：データの居場所は町の外枠の中で、湯の居場所は湯の中、ほかは湯の外。区域は正しい", () => {
  const inR = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  assert.equal(new Set(ONSEN_SPOTS.map((s) => s.id)).size, ONSEN_SPOTS.length);
  for (const s of ONSEN_SPOTS) {
    assert.ok(inR(s.x, s.z, ONSEN_BOUNDS), s.id);
    assert.ok(s.area in ONSEN_AREAS, s.id);
    // 湯は地上だけ（二階・三階の居場所は、真下が内湯でも湯ではない）
    const inPool = (s.floor ?? 1) === 1 && ONSEN_POOLS.some((p) => inR(s.x, s.z, p.r));
    assert.equal(inPool, s.pose === "soak", s.id);
  }
});

test("居場所：すべての客に居場所があり、同じ居場所に二妖いない。大きな妖怪は狭い室内に入らない。居たがる区域をなるべく使う", () => {
  // いちばん多い日：宿泊客の上限まで（通常は大きい妖怪から）＋大妖怪・三大妖怪・隠し妖怪
  const bigFirst = [...NORMAL].sort((a, b) => (defs[b].scale ?? 1) - (defs[a].scale ?? 1));
  const every = [...bigFirst.slice(0, ONSEN_GUESTS.normal.max), ...GREATER.slice(0, ONSEN_GUESTS.greater.max), ...THREE.slice(0, ONSEN_GUESTS.threeGreat.max), "nurarihyon"];
  for (const open of [baseOnly, allOpen]) {
    for (let s = 1; s <= 40; s++) {
      const g = visitGuests(zukanOf([...NORMAL, ...LEGENDS]), progressOf(LEGENDS, ["nurarihyon"]), { seed: s, forced: s % 3 ? [] : ["nurarihyon"] });
      const pl = placeGuests(g.all, defs, ONSEN_SPOTS, open, rand(s));
      assert.equal(pl.length, g.all.length, `seed ${s}：全員に居場所`);
      assert.equal(new Set(pl.map((p) => p.spot.id)).size, pl.length, "同じ居場所に二妖いない");
      for (const p of pl) {
        assert.ok(spotFits(p.spot, defs[p.type], open), `${p.type} → ${p.spot.id}`);
        if ((defs[p.type].scale ?? 1) >= BIG_SCALE) assert.ok(["bath", "garden"].includes(ONSEN_AREAS[p.spot.area].group), `${p.type} は室内に入らない（${p.spot.id}）`);
      }
    }
    // 全員（いちばん多い日）でも置ける
    const pl = placeGuests(every, defs, ONSEN_SPOTS, open, rand(1));
    assert.equal(pl.length, every.length);
  }
  // 居たがる区域
  const at = (types: string[], open = allOpen) => Object.fromEntries(placeGuests(types, defs, ONSEN_SPOTS, open, rand(2)).map((p) => [p.type, p.spot]));
  const a = at(["shuten", "ibaraki", "daidara", "kappa", "nurarihyon", "orochi", "gashadokuro", "tamamo", "ushi_oni"]);
  assert.equal(a.shuten.id, "banquet-kamiza");
  assert.equal(a.ibaraki.area, "banquet");
  assert.equal(a.daidara.area, "iwaburo");
  assert.equal(a.kappa.area, "uchiyu");
  assert.equal(a.nurarihyon.id, "chouba-kamiza", "帳場の横の上座");
  assert.equal(a.orochi.area, "okuniwa");
  assert.equal(a.gashadokuro.area, "okuniwa");
  assert.equal(a.tamamo.area, "tsukimi");
  assert.equal(a.ushi_oni.area, "rotenburo");
  // 宴会場・奥庭が閉じていれば、同じ系統か空いている場所へ
  const b = at(["shuten", "orochi", "gashadokuro", "tamamo"], baseOnly);
  assert.equal(ONSEN_AREAS[b.shuten.area].group, "house");
  assert.notEqual(b.shuten.area, "banquet");
  assert.ok(["nakaniwa", "maeniwa", "iwaburo"].includes(b.gashadokuro.area));
  assert.equal(b.tamamo.area, "engawa");
});

test("居場所：浮く妖怪は湯につからず、宙の居場所には浮く妖怪だけ", () => {
  for (let s = 1; s <= 20; s++) {
    const pl = placeGuests([...NORMAL, ...LEGENDS], defs, ONSEN_SPOTS, allOpen, rand(s));
    for (const p of pl) {
      if (defs[p.type].family === "FLOAT") assert.notEqual(p.spot.pose, "soak", p.type);
      if (p.spot.pose === "float") assert.equal(defs[p.type].family, "FLOAT", p.type);
    }
  }
});

test("宿の一言：すべての妖怪に、宿での一言と居たがる区域がある（加入条件の話はしない）", () => {
  for (const id of YOKAI_ORDER) {
    const o = YOKAI[id].onsen;
    assert.ok(o?.lines?.length && o.lines.every((l) => l.length > 0 && l.length <= 40), id);
    assert.ok(o?.preferredArea && o.preferredArea in ONSEN_AREAS, id);
    for (const l of o!.lines!) assert.ok(!/連れて|集め|条件|あと.妖/.test(l), `${id}：${l}`);
  }
  assert.equal(YOKAI.nurarihyon.onsen!.lines![0], "……よい湯じゃな。");
});

// ---------------------------------------------------------------- 訪問の途中で月見の奥庭が開く

test("月見の奥庭：三大妖怪 3・隠し妖怪 0 で入館 → 閉じている。ぬらりひょんを見つけると開く。訪問・種・必ずいる客・宿泊客・居場所は同じまま", () => {
  const zukan = zukanOf([...NORMAL, ...LEGENDS]);
  const p = progressOf([...GREATER.slice(0, 2), ...THREE]);
  const before = onsenAccess(p);
  assert.deepEqual([before.entrance, before.banquet, before.inner], [true, true, false], "隠し妖怪をまだ見つけていない");
  const save = beginVisit(emptyVisitSave(), () => 77, firstDiscoveriesNow(zukan, p, FINAL_NORMAL_WAVE));
  const visit = save.active!;
  assert.deepEqual(visit.forced, ["nurarihyon"]);
  const zones = openZones(before);
  const g1 = visitGuests(zukan, p, visit);
  const pl1 = placeGuests(g1.all, defs, ONSEN_SPOTS, zones, rand(visit.seed));
  // 話しかけて見つける
  assert.equal(discoverHidden(p, "nurarihyon", 1, () => {}), true);
  const after = onsenAccess(p);
  assert.equal(after.inner, true, "最深部（三大妖怪 3＋隠し妖怪 1）が成り立つ");
  // 同じ訪問のまま（入り直さない）：訪問の記録・種・必ずいる客・宿泊客・居場所は変わらない
  assert.equal(beginVisit(save, () => 999, firstDiscoveriesNow(zukan, p, FINAL_NORMAL_WAVE)), save, "今の訪問が続く（新しい訪問にしない）");
  assert.deepEqual([save.visitNo, save.active!.seed, save.active!.forced], [1, 77, ["nurarihyon"]]);
  assert.deepEqual(visitGuests(zukan, p, visit), g1);
  assert.deepEqual(placeGuests(g1.all, defs, ONSEN_SPOTS, zones, rand(visit.seed)), pl1, "居場所も同じ（区域は入館したときのまま）");
});

test("月見の奥庭：宿は作り直さず、その場で門を開けて奥庭を見せる（宿を出なくても入れる）。写真を抜けると撮った写真の画面も閉じる", () => {
  const app = readFileSync("src/onsen/OnsenApp.ts", "utf8");
  const review = app.slice(app.indexOf("const reviewAccess"), app.indexOf("};", app.indexOf("const reviewAccess")));
  assert.match(review, /onsenAccess\(progress\)\.inner/);
  assert.match(review, /world\.openInner\(\)/);
  assert.match(review, /structures\.setHiddenIds\(world\.hiddenInnerIds\(\)\)/);
  assert.match(review, /atmos\.openInner\(\)/);
  assert.ok(!/leaveVisit|beginVisit|visitGuests|placeGuests|location/.test(review), "訪問・宿泊客・居場所に触れない");
  assert.match(app, /pendingNote = def\.name;\s*reviewAccess\(\);/, "見つけたその場で見直す");
  // 門・森の当たり：開いた後は、門の当たりを外し、閉じている森の木の当たりを消す
  const world = readFileSync("src/onsen/OnsenWorld.ts", "utf8");
  const open = world.slice(world.indexOf("  openInner() {"), world.indexOf("\n  }\n", world.indexOf("  openInner() {")));
  assert.match(open, /this\.innerGate\.on = false/);
  assert.match(open, /forestCircles/);
  // 写真を抜けるとき（Esc・戻る）、撮った写真の画面も閉じる
  const ui = readFileSync("src/onsen/OnsenUI.ts", "utf8");
  const setPhoto = ui.slice(ui.indexOf("  setPhoto(v: boolean) {"), ui.indexOf("\n  }\n", ui.indexOf("  setPhoto(v: boolean) {")));
  assert.match(setPhoto, /onsen-shot"\)\.classList\.add\("hidden"\)/);
});

test("月見の奥庭が訪問の途中で開いたら、環境音も月見の湯を湯として数える（ほかの湯の音は変わらない）", () => {
  const tsuki = ONSEN_POOLS.find((p) => p.id === "tsukiyu")!.r;
  const cx = (tsuki.x0 + tsuki.x1) / 2, cz = (tsuki.z0 + tsuki.z1) / 2;
  assert.ok(nearestPoolDistance(cx, cz, false) > 10, "閉じている間は月見の湯を数えない");
  assert.equal(nearestPoolDistance(cx, cz, true), 0, "開いたら月見の湯のそばは湯のそば");
  // 露天風呂・大岩風呂・内湯のそばは、開いても開かなくても同じ
  for (const p of ONSEN_POOLS.filter((q) => q.id !== "tsukiyu")) {
    const x = (p.r.x0 + p.r.x1) / 2, z = (p.r.z0 + p.r.z1) / 2;
    assert.equal(nearestPoolDistance(x, z, true), nearestPoolDistance(x, z, false), p.id);
  }
  // 奥庭を開くところで Soundscape にも伝える（音が鳴りはじめる前に開いていたら、作ったときに伝える）
  const app = readFileSync("src/onsen/OnsenApp.ts", "utf8");
  const review = app.slice(app.indexOf("const reviewAccess"), app.indexOf("};", app.indexOf("const reviewAccess")));
  assert.match(review, /atmos\.openInner\(\);\s*sound\?\.scape\.openInner\(\);/);
  assert.match(app, /new OnsenSoundscape\(engine, access\);[\s\S]{0,80}if \(world\.innerOpen\) scape\.openInner\(\);/);
  const scape = readFileSync("src/onsen/audio/OnsenSoundscape.ts", "utf8");
  assert.match(scape, /nearestPoolDistance\(px, pz, this\.innerOpen\)/);
});
