// 後から町へ混ざる通常妖怪（41 種）：データ・解禁（wave）・図鑑・今夜の顔ぶれと配置・一夜一体の通常妖怪・ぬらりひょんとの整合
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { YOKAI, YOKAI_ICON, YOKAI_ORDER } from "../src/data/yokaiTypes.ts";
import { FINAL_NORMAL_WAVE, NORMAL_NIGHT, NORMAL_IDS, NORMAL_SITES, NORMAL_UNLOCK } from "../src/data/normalYokai.ts";
import { WORLD } from "../src/data/map.ts";
import { DISTRICT_BY_ID } from "../src/data/districts.ts";
import { PRESENCE_TIERS } from "../src/data/presences.ts";
import { WORLD_LAYERS } from "../src/data/worldLayers.ts";
import { ONSEN_AREAS } from "../src/data/onsen.ts";
import { MODELS } from "../src/characters/models.ts";
import { NightSeed } from "../src/core/seed.ts";
import { HISTORY_KEY, NORMAL_PROGRESS_KEY, ZUKAN_KEY, loadNormalProgress, type KV } from "../src/core/SaveData.ts";
import { emptyNormalProgress, freshWaves, noteOpenedWaves, recordCompletedNight } from "../src/game/normal/NormalProgress.ts";
import { isNormalUnlocked, newNormalTypes, registeredNormalCount, unlockedNormalWave } from "../src/game/normal/NormalUnlockRules.ts";
import { drawNormalRoster } from "../src/game/normal/NormalNightRoster.ts";
import { BASE_SPAWN_LISTS, finishNormalNight, planNormalSpawns, prepareNormalNight, replaceablePool, spawnTotal } from "../src/game/normal/NormalSpawnPlanner.ts";
import { visibleZukanTypes, zukanCompletion, zukanEntry } from "../src/game/ZukanRules.ts";
import { legendCandidates } from "../src/game/legends/NightLegendRoster.ts";
import { firstDiscoveriesNow } from "../src/game/onsen/OnsenVisit.ts";
import { emptyLegendProgress, legendTally } from "../src/game/legends/LegendProgress.ts";
import { SpawnGate, isLegend, isSpecialYokai, isUniquePerNight } from "../src/game/legends/LegendRules.ts";
import { drawOnsenGuests } from "../src/game/onsen/OnsenGuestRoster.ts";

const SECOND = ["海坊主", "テケテケ", "アマビエ", "天邪鬼", "雪女", "鵺", "なまはげ", "子泣き爺", "ぬりかべ", "砂かけ婆", "鎌鼬", "件", "すねこすり", "人魚", "八尺様", "獏", "一つ目小僧", "山姥", "小豆洗い", "絡新婦", "のっぺらぼう"];
const THIRD = ["磯姫", "一本だたら", "うわん", "土蜘蛛", "狂骨", "片輪車", "餓鬼", "魍魎", "覚", "ぬっぺっぽう", "野槌", "枕返し", "ムジナ", "八咫烏", "わいら", "尻こぼし", "白沢", "釣瓶落とし", "火車", "目目連"];
/** 一夜一体の通常妖怪（大妖怪ではない） */
const NORMAL_UNIQUE = ["hakutaku", "umibozu", "teketeke", "amabie", "nue", "hasshaku", "yatagarasu", "jorogumo", "tsurube_otoshi", "kasha", "nopperabo"];
const BASE = ["小鬼", "火の玉", "提灯お化け", "化け狸", "座敷童", "猫又", "河童", "唐傘お化け", "ろくろ首", "天狗", "化け狐", "一反木綿"];

const byName = (name: string) => Object.values(YOKAI).find((d) => d.name === name)!;
const waveOf = (id: string) => YOKAI[id].normalWave ?? 0;
const NEW = NORMAL_IDS;
const BASE_IDS = YOKAI_ORDER.filter((t) => YOKAI[t].rank === "normal" && waveOf(t) === 0);
const zukanOf = (types: readonly string[]) => Object.fromEntries(types.map((t) => [t, 1]));
const memKV = (): KV & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};
const nights = (n: number) => ({ completedNights: n });

// ---------------------------------------------------------------- data

test("データ：後から混ざる 41 種（第 2 段階 21・第 3 段階 20）はすべて通常妖怪（rank normal・discovery normal）。future にしない", () => {
  assert.deepEqual(NEW.map((id) => YOKAI[id].name).sort(), [...SECOND, ...THIRD].sort());
  assert.equal(NEW.length, 41);
  for (const id of NEW) {
    const d = YOKAI[id];
    assert.deepEqual([d.rank, d.discovery], ["normal", "normal"], id);
    assert.equal(d.zukanAvailability, undefined, `${id}：future にしない`);
    assert.ok(d.rule.kind !== "legend" && !d.omen && !d.photoRole, `${id}：大妖怪の仕組みに入れない`);
    assert.equal(!!d.uniquePerNight, NORMAL_UNIQUE.includes(id), `${id}：一夜一体か`);
  }
  // はじめの 12 種は wave 0 のまま
  assert.deepEqual(BASE_IDS.map((t) => YOKAI[t].name), BASE);
  // 第 2 段階は wave 1〜3、第 3 段階は wave 4〜6
  for (const n of SECOND) assert.ok(waveOf(byName(n).id) >= 1 && waveOf(byName(n).id) <= 3, n);
  for (const n of THIRD) assert.ok(waveOf(byName(n).id) >= 4 && waveOf(byName(n).id) <= 6, n);
});

test("名簿：通常妖怪 53 種・大妖怪 10 体・三大妖怪 3 体（コードから数える）。口裂け女・花子さんは無い。白沢は通常妖怪、神野悪五郎は大妖怪", () => {
  const all = Object.values(YOKAI);
  assert.equal(all.filter((d) => d.rank === "normal" && d.discovery === "normal").length, 53);
  assert.equal(all.filter((d) => d.rank === "greater" && d.discovery === "normal").length, 10);
  assert.equal(all.filter((d) => d.rank === "threeGreat").length, 3);
  assert.deepEqual(all.filter((d) => d.discovery === "hidden").map((d) => d.id), ["nurarihyon"]);
  assert.equal(all.filter((d) => d.rank === "normal" && d.uniquePerNight).length, NORMAL_UNIQUE.length);
  for (const id of ["kuchisake", "kuchisake_onna", "kuchisakeonna", "hanako", "hanako_san", "toilet_hanako"]) {
    assert.equal(YOKAI[id], undefined, id);
    assert.ok(!YOKAI_ORDER.includes(id) && !(id in YOKAI_ICON) && !(id in MODELS) && !(id in NORMAL_SITES), id);
  }
  assert.ok(!all.some((d) => /口裂け|花子/.test(d.name + (d.aliases ?? []).join(""))));
  const h = YOKAI.hakutaku;
  assert.deepEqual([h.name, h.rank, h.discovery, h.uniquePerNight, h.aliases], ["白沢", "normal", "normal", true, ["白澤"]]);
  assert.ok(!h.omen && !h.photoRole && h.rule.kind !== "legend", "大妖怪の仕組み（気配・特等席・legend の条件）を持たない");
  const a = YOKAI.shinno_akugoro;
  assert.deepEqual([a.name, a.reading, a.rank, a.discovery, a.uniquePerNight, a.photoRole], ["神野悪五郎", "しんのあくごろう", "greater", "normal", true, "flank"]);
  assert.equal(YOKAI.sanmoto.rank, "greater", "山本五郎左衛門は大妖怪のまま");
  for (const id of ["azukiarai", "jorogumo", "tsurube_otoshi", "kasha", "mokumokuren", "nopperabo", "shinno_akugoro", "teketeke"]) assert.ok(YOKAI[id], id);
  // 新しい 6 種は一つの wave にまとめない
  assert.ok(new Set(["azukiarai", "jorogumo", "tsurube_otoshi", "kasha", "mokumokuren", "nopperabo"].map(waveOf)).size >= 3);
});

test("データ：かんきちは入れない・新しい「鬼」は作らない（小鬼 oni のまま）・ぬっぺっぽうの別名にぬっぺふほふ", () => {
  assert.ok(!Object.values(YOKAI).some((d) => /かんきち|カンキチ/.test(d.name + d.reading)));
  assert.equal(Object.values(YOKAI).filter((d) => d.name === "鬼" || d.reading === "おに").length, 0, "「鬼」という新しい種類は無い");
  assert.deepEqual([YOKAI.oni.id, YOKAI.oni.name, YOKAI.oni.normalWave], ["oni", "小鬼", undefined]);
  const n = byName("ぬっぺっぽう");
  assert.deepEqual([n.reading, n.aliases], ["ぬっぺっぽう", ["ぬっぺふほふ"]]);
  assert.deepEqual(byName("磯姫").aliases, ["磯女"]);
  assert.deepEqual(byName("ムジナ").aliases, ["狢"]);
  assert.deepEqual(byName("尻こぼし").aliases, ["コボシ"]);
  assert.notEqual(byName("天邪鬼").id, "amanozako", "大妖怪の天逆毎とは別の種類");
  assert.equal(byName("天逆毎").rank, "greater");
});

test("データ：全員に読み・伝承・宿での一言と居たがる区域・姿・墨判。伝承は短く（出会い方は zukanEncounter へ分けた）", () => {
  const icons = new Set<string>();
  for (const id of YOKAI_ORDER) {
    const d = YOKAI[id];
    assert.ok(d.reading && d.lore, id);
    assert.ok(d.onsen?.preferredArea && d.onsen.preferredArea in ONSEN_AREAS, `${id}：居たがる区域`);
    assert.ok((d.onsen?.lines?.length ?? 0) >= 1, `${id}：宿での一言`);
    assert.ok(MODELS[id]?.length >= 4, `${id}：姿`);
    const icon = YOKAI_ICON[id];
    assert.equal([...(icon ?? "")].length, 1, `${id}：墨判`);
    assert.ok(!icons.has(icon), `${id}：墨判が重ならない（${icon}）`);
    icons.add(icon);
  }
  for (const id of [...BASE_IDS, ...NEW]) {
    const l = YOKAI[id].lore;
    assert.ok(l.length >= 15 && l.length <= 80, `${id}：${l.length} 字`);
    assert.ok((l.match(/。/g) ?? []).length <= 2, `${id}：2 文まで`);
  }
  // 伝承・原典の考証（後世の設定を原典のように書かない）
  assert.ok(!/古寺/.test(byName("うわん").lore));
  assert.ok(!/モグラ/.test(byName("わいら").lore));
  assert.match(byName("狂骨").lore, /鳥山石燕/);
  assert.match(byName("八咫烏").lore, /神話/);
  assert.ok(!/妖怪/.test(byName("八咫烏").lore.split("。")[0]), "八咫烏を妖怪伝承とは書かない");
  assert.match(byName("魍魎").lore, /広く指した言葉/);
  assert.match(byName("土蜘蛛").lore, /朝廷に従わぬ者/);
  assert.match(byName("アマビエ").lore, /予言獣/);
  assert.match(byName("なまはげ").lore, /来訪神/);
  assert.match(byName("餓鬼").lore, /仏教/);
  assert.match(byName("目目連").lore, /鳥山石燕/);
  assert.ok(!/亡骸を.*(食|喰)|血|死体/.test(byName("火車").lore + JSON.stringify(YOKAI.kasha.talk)), "火車：遺体・捕食・流血を書かない");
});

test("データ：加入条件は触れるだけにしない（既存の条件を使い回し、足した汎用の条件は数種類だけ）。妖怪ごとの if 文を作らない", () => {
  const kinds = new Map<string, number>();
  for (const id of NEW) kinds.set(YOKAI[id].rule.kind, (kinds.get(YOKAI[id].rule.kind) ?? 0) + 1);
  assert.ok((kinds.get("touch") ?? 0) <= NEW.length / 3, `touch は ${kinds.get("touch")} 種`);
  assert.ok(kinds.size >= 10, `条件の種類 ${kinds.size}`);
  for (const k of ["shy", "flee", "food", "minCount"]) assert.ok(kinds.has(k), `既存の ${k} を使う`);
  const added = [...kinds.keys()].filter((k) => !["touch", "shy", "flee", "food", "minCount", "lantern", "river", "sky"].includes(k));
  assert.ok(added.length <= 10, `足した条件 ${added.join("・")}`);
  // 加入の判定に妖怪の ID を書かない
  for (const f of ["src/game/WildJoinRules.ts", "src/game/WildCompanionRules.ts", "src/game/WildIdle.ts", "src/game/WildArrivals.ts", "src/game/WildTrails.ts", "src/game/WildYokai.ts"]) {
    const src = readFileSync(f, "utf8");
    for (const id of NEW) assert.ok(!src.includes(`"${id}"`), `${f}：${id} を名指ししない`);
    assert.ok(!/猫又「|座敷童「|天狗「/.test(src), `${f}：一言はデータ（talk）から`);
  }
});

test("データ：出る場所は町の中。気配・地区・世界の層は実在するもの。一種類に一か所以上", () => {
  for (const id of NEW) {
    const sites = NORMAL_SITES[id];
    assert.ok(sites?.length >= 1, id);
    for (const s of sites) {
      if (s.arrive) continue;
      assert.ok(s.x > WORLD.minX && s.x < WORLD.maxX && s.z > WORLD.minZ && s.z < WORLD.maxZ, `${id}：町の中`);
      if (s.presence) assert.ok(PRESENCE_TIERS.some((t) => t.id === s.presence), `${id}：${s.presence}`);
      if (s.district) assert.ok(DISTRICT_BY_ID.get(s.district)?.awaken, `${id}：${s.district}`);
      if (s.layer) assert.ok(WORLD_LAYERS.some((l) => l.id === s.layer), `${id}：${s.layer}`);
      if (s.appearAt !== undefined) assert.ok(s.appearAt > 0 && s.appearAt < 1, id);
    }
  }
});

// ---------------------------------------------------------------- unlock

test("解禁：新しいセーブでは wave 0（はじめの 12 種）だけ", () => {
  assert.equal(unlockedNormalWave(nights(0), {}), 0);
  for (const id of NEW) assert.equal(isNormalUnlocked(id, nights(0), {}), false, id);
  for (const id of BASE_IDS) assert.equal(isNormalUnlocked(id, nights(0), {}), true, id);
  assert.ok(isNormalUnlocked("shuten", nights(0), {}), "大妖怪はここでは止めない");
  assert.deepEqual(newNormalTypes(0), []);
});

test("解禁：1〜2 夜で wave 1・2 が開きはじめる。図鑑の進み（はじめの 12 種の登録）でも早められる", () => {
  assert.equal(unlockedNormalWave(nights(1), {}), 1);
  assert.equal(unlockedNormalWave(nights(2), {}), 2);
  assert.equal(unlockedNormalWave(nights(3), {}), 3);
  // 夜を終えていなくても、はじめの 12 種を 4・7・10 種登録すれば
  assert.equal(unlockedNormalWave(nights(0), zukanOf(BASE_IDS.slice(0, 3))), 0);
  assert.equal(unlockedNormalWave(nights(0), zukanOf(BASE_IDS.slice(0, 4))), 1);
  assert.equal(unlockedNormalWave(nights(0), zukanOf(BASE_IDS.slice(0, 7))), 2);
  assert.equal(unlockedNormalWave(nights(0), zukanOf(BASE_IDS.slice(0, 10))), 3);
  // wave 4 は夜の数と図鑑の両方（AND）
  assert.equal(unlockedNormalWave(nights(4), zukanOf(BASE_IDS)), 3, "14 種に届かない");
  assert.equal(unlockedNormalWave(nights(3), zukanOf([...BASE_IDS, ...NEW.slice(0, 5)])), 3, "夜が足りない");
  assert.equal(unlockedNormalWave(nights(4), zukanOf([...BASE_IDS, ...NEW.slice(0, 2)])), 4);
  // 順に開く（飛ばさない）
  assert.equal(unlockedNormalWave(nights(8), {}), 3, "図鑑が進まなければ wave 4 で止まる");
  assert.equal(unlockedNormalWave(nights(8), zukanOf([...BASE_IDS, ...NEW.slice(0, 2)])), 6);
  assert.equal(unlockedNormalWave(nights(4), zukanOf([...BASE_IDS, ...NEW.slice(0, 18)])), 6, "図鑑を埋めれば wave 5・6 も早まる");
  assert.equal(registeredNormalCount({ ...zukanOf(BASE_IDS), shuten: 1 }, "normal"), 12, "大妖怪は数えない");
  assert.equal(NORMAL_UNLOCK.length, FINAL_NORMAL_WAVE);
});

test("解禁：第 2 段階相当の 21 種は一度に開かない。第 3 段階相当の 20 種も段階的", () => {
  const counts = [1, 2, 3, 4, 5, 6].map((w) => NEW.filter((t) => waveOf(t) === w).length);
  for (const c of counts) assert.ok(c >= 4 && c <= 8, `一つの wave に ${c} 種`);
  assert.equal(counts[0] + counts[1] + counts[2], 21);
  assert.equal(counts[3] + counts[4] + counts[5], 20);
  for (let w = 0; w < 6; w++) assert.ok(newNormalTypes(w).length < newNormalTypes(w + 1).length);
});

test("夜の数：夜が正常に終わったときだけ +1。同じ夜を二度数えない（リロード・結果の再表示）。夜の始まりでは増えない", () => {
  const kv = memKV();
  const rng = () => new NightSeed(5).stream("r");
  const night = prepareNormalNight(kv, {}, rng(), rng());
  assert.equal(night.progress.completedNights, 0);
  // リロード（夜の始まりをもう一度）では増えない
  assert.equal(prepareNormalNight(kv, {}, rng(), rng()).progress.completedNights, 0);
  finishNormalNight(kv, night, 1000);
  finishNormalNight(kv, night, 1000);
  assert.equal(loadNormalProgress(kv).completedNights, 1, "同じ夜は一度だけ");
  assert.equal(prepareNormalNight(kv, {}, rng(), rng()).progress.completedNights, 1);
  assert.equal(prepareNormalNight(kv, {}, rng(), rng()).wave, 1);
  const p = emptyNormalProgress();
  assert.equal(recordCompletedNight(p, 1), true);
  assert.equal(recordCompletedNight(p, 1), false);
  assert.equal(recordCompletedNight(p, 2), true);
  assert.equal(p.completedNights, 2);
});

test("夜の数：保存が無ければ、今までの履歴の件数を最低値にする（既存のプレイヤーの移行）。壊れていても遊べる", () => {
  const kv = memKV();
  kv.setItem(HISTORY_KEY, JSON.stringify([1, 2, 3].map((i) => ({ total: i }))));
  assert.equal(loadNormalProgress(kv, 3).completedNights, 3);
  kv.setItem(NORMAL_PROGRESS_KEY, "{壊れた");
  assert.equal(loadNormalProgress(kv, 3).completedNights, 3);
  kv.setItem(NORMAL_PROGRESS_KEY, JSON.stringify({ completedNights: 5 }));
  assert.equal(loadNormalProgress(kv, 3).completedNights, 5, "保存があればそちら");
  assert.equal(loadNormalProgress(null).completedNights, 0);
  kv.setItem(ZUKAN_KEY, JSON.stringify({}));
  const night = prepareNormalNight(kv, {}, new NightSeed(1).stream("a"), new NightSeed(1).stream("b"));
  assert.equal(night.wave, 3, "5 夜歩いても、図鑑が進んでいなければ wave 4（夜の数と図鑑の両方）の手前で止まる");
});

// ---------------------------------------------------------------- zukan

test("図鑑：まだ町に混ざらない通常妖怪は、枠も分母も見せない（？？？も無い）。wave が開くと通常の枠として増える", () => {
  const w0 = visibleZukanTypes({}, { met: [], normalWave: 0 });
  for (const id of NEW) assert.ok(!w0.includes(id), `${id}：wave 0 では枠が無い`);
  assert.equal(zukanEntry(NEW[0], {}, { met: [], joinCount: {} }), null);
  const c0 = zukanCompletion(zukanOf(BASE_IDS), { met: [], normalWave: 0 });
  const legendNormal = YOKAI_ORDER.filter((t) => YOKAI[t].rank !== "normal" && YOKAI[t].discovery === "normal").length;
  assert.equal(c0.total, BASE_IDS.length + legendNormal);
  let prev = c0.total;
  for (let w = 1; w <= FINAL_NORMAL_WAVE; w++) {
    const c = zukanCompletion({}, { met: [], normalWave: w });
    const grow = NEW.filter((t) => waveOf(t) === w).length;
    assert.equal(c.total, prev + grow, `wave ${w}：その wave の妖怪だけ枠が増える`);
    prev = c.total;
    // 開いた wave の妖怪は、未登録でも通常の？？？の枠
    const vis = visibleZukanTypes({}, { met: [], normalWave: w });
    for (const id of NEW) assert.equal(vis.includes(id), waveOf(id) <= w, `${id} @ wave ${w}`);
  }
  // 図鑑の順：はじめの 12 種 → 第 2 段階 → 第 3 段階 → 大妖怪 → … → 三大妖怪（見出しは無い）
  const all = visibleZukanTypes({}, { met: [], normalWave: FINAL_NORMAL_WAVE });
  assert.deepEqual(all.slice(0, 12 + 41), [...BASE_IDS, ...NEW]);
  // 白沢は通常妖怪の位置（大妖怪の並びには無い）、神野悪五郎は大妖怪の位置（山本五郎左衛門の次）
  assert.ok(all.indexOf("hakutaku") < all.indexOf("daitengu"));
  assert.equal(all.indexOf("shinno_akugoro"), all.indexOf("sanmoto") + 1);
});

/**
 * 画面に文字を出す実装（プレイヤーが目にする文言の置き場所）。clean checkout に実在するものだけを明示する
 * （data/・game/normal/ は内部の仕様として段・由来を書く場所なので含めない）
 */
const UI_FILES = ["index.html", "src/main.ts"];
const UI_DIRS = ["src/presentation", "src/onsen"];
/** 画面に出してはいけない言葉（段・内部の分類・希少さの印） */
const UI_FORBIDDEN = /第[2-3２３二三]段階|段階|追加妖怪|レア|希少|ユニーク|一夜一体|都市伝説|現代妖怪|新妖怪|NEW!?|来訪神|予言獣/;
/** 文字列リテラル・テンプレートの中で、内部の値を画面に差し込んでいないか */
const UI_INTERNAL = /\bnormalWave\b|\boriginKind\b|\buniquePerNight\b|\bwave\b/;

/** ソースの文字列リテラル（"…"・'…'・`…`）を取り出す。コメント・識別子の受け渡しは対象にしない */
function stringLiterals(src: string) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
  return [...code.matchAll(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g)].map((m) => m[0]);
}

test("図鑑：格の呼び名は全員「妖怪」。段・wave・由来・一夜一体・「レア」「NEW」などを画面に出さない", () => {
  for (const id of [...NEW, ...BASE_IDS]) {
    const e = zukanEntry(id, { [id]: 1 }, { met: [], joinCount: {} })!;
    assert.equal(e.rankLabel, "妖怪", id);
    // 図鑑の画面が読む一項目に、内部の段・由来・一夜一体を載せない
    for (const k of ["normalWave", "originKind", "uniquePerNight"]) assert.ok(!(k in e), `${id}：${k}`);
  }
  const files = [...UI_FILES];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(ts|html)$/.test(p)) files.push(p);
    }
  };
  for (const d of UI_DIRS) walk(d);
  assert.ok(files.some((f) => f.includes("ZukanBook")) && files.some((f) => f.includes("OnsenUI")), "図鑑・宿の画面を検査している");
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (f.endsWith(".html")) {
      assert.ok(!UI_FORBIDDEN.test(src.replace(/<!--[\s\S]*?-->/g, "")), `${f}：段・内部の分類を画面に出さない`);
      continue;
    }
    for (const lit of stringLiterals(src)) {
      assert.ok(!UI_FORBIDDEN.test(lit), `${f}：${lit.slice(0, 40)}`);
      assert.ok(!UI_INTERNAL.test(lit), `${f}：内部の値を文言に差し込まない（${lit.slice(0, 40)}）`);
    }
  }
  // 一言（talk）・ヒント・宿での一言にも段や「新」の印・内部の分類を書かない
  for (const id of NEW) {
    const d = YOKAI[id];
    const text = [d.hint, ...Object.values(d.talk ?? {}), ...(d.onsen?.lines ?? [])].join(" ");
    assert.ok(!UI_FORBIDDEN.test(text), id);
  }
});

test("ぬらりひょん：はじめの 12 種（や途中の wave）だけ埋めた完成では、通常妖怪を知り尽くしたことにならない", () => {
  const legends = YOKAI_ORDER.filter((t) => YOKAI[t].rank !== "normal" && YOKAI[t].discovery === "normal");
  const p = { ...emptyLegendProgress(), joined: [...legends], met: [...legends] };
  // wave 0 で 12 種＋大妖怪を埋めた：今の図鑑は完成だが、知り尽くしてはいない
  const early = zukanCompletion(zukanOf([...BASE_IDS, ...legends]), { met: p.met, normalWave: 0 });
  assert.deepEqual([early.normalComplete, early.allNormalContentComplete], [true, false]);
  assert.deepEqual(firstDiscoveriesNow(zukanOf([...BASE_IDS, ...legends]), p, 0), []);
  // 途中の wave の完成でも
  const mid = zukanOf([...BASE_IDS, ...NEW.filter((t) => waveOf(t) <= 5), ...legends]);
  assert.equal(zukanCompletion(mid, { met: p.met, normalWave: 5 }).allNormalContentComplete, false);
  assert.deepEqual(firstDiscoveriesNow(mid, p, 5), []);
  // 最後の wave まで開いたが、まだ登録していない妖怪がいる
  assert.equal(zukanCompletion(mid, { met: p.met, normalWave: FINAL_NORMAL_WAVE }).allNormalContentComplete, false);
  // 全 wave が開き、すべての通常妖怪を登録して初めて成り立つ
  const done = zukanOf([...BASE_IDS, ...NEW, ...legends]);
  const c = zukanCompletion(done, { met: p.met, normalWave: FINAL_NORMAL_WAVE });
  assert.deepEqual([c.normalComplete, c.allNormalContentComplete, c.seen, c.total], [true, true, c.total, 53 + legends.length]);
  assert.deepEqual(firstDiscoveriesNow(done, p, FINAL_NORMAL_WAVE), ["nurarihyon"]);
  // 見つけると N/N → N+1/N+1
  const found = zukanCompletion(done, { met: [...p.met, "nurarihyon"], normalWave: FINAL_NORMAL_WAVE });
  assert.deepEqual([found.seen, found.total, found.complete], [c.total + 1, c.total + 1, true]);
});

// ---------------------------------------------------------------- spawn

const BASE_TOTAL = spawnTotal(BASE_SPAWN_LISTS);
const POOL = replaceablePool(BASE_SPAWN_LISTS);
/** 開いた wave と開いたばかりの wave で、今夜の顔ぶれと配置を作る */
const planAt = (wave: number, seed: number, fresh: number[] = []) => {
  const s = new NightSeed(seed);
  const roster = drawNormalRoster({ wave, fresh, pool: POOL, rng: s.stream("normalRoster") });
  return { roster, plan: planNormalSpawns(BASE_SPAWN_LISTS, roster, s.stream("normalPlace")) };
};
const typesIn = (lists: { town: readonly { type: string; n: number }[]; extra: readonly { type: string; n: number }[] }) => {
  const m = new Map<string, number>();
  for (const s of [...lists.town, ...lists.extra]) m.set(s.type, (m.get(s.type) ?? 0) + s.n);
  return m;
};

test("配置：wave 0 の夜は今までの一覧そのまま（同じ夜・同じ seed の並び）", () => {
  const { roster, plan } = planAt(0, 1);
  assert.deepEqual(roster.types, []);
  assert.deepEqual([plan.town, plan.extra], [BASE_SPAWN_LISTS.town, BASE_SPAWN_LISTS.extra]);
  assert.equal(plan.river.length, 0);
});

test("配置：まだ解禁されていない通常妖怪は絶対に置かない。解禁後は通常妖怪として置かれうる", () => {
  for (let wave = 0; wave <= FINAL_NORMAL_WAVE; wave++) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { roster, plan } = planAt(wave, seed, [wave]);
      for (const t of roster.types) assert.ok(waveOf(t) >= 1 && waveOf(t) <= wave, `${t} @ wave ${wave}`);
      for (const [t] of typesIn(plan)) if (NEW.includes(t)) (assert.ok(waveOf(t) <= wave, `${t} @ wave ${wave}`), seen.add(t));
      for (const t of plan.river) (assert.ok(waveOf(t) <= wave), seen.add(t));
    }
    // 解禁済みの妖怪は、いくつかの夜のうちに一度は町に混ざる
    for (const t of newNormalTypes(wave)) assert.ok(seen.has(t), `${t} @ wave ${wave}`);
  }
});

test("配置：同じ seed・同じ進み具合なら同じ顔ぶれ・同じ配置", () => {
  assert.deepEqual(planAt(4, 77, [4]), planAt(4, 77, [4]));
  assert.notDeepEqual(planAt(4, 77, [4]).roster, planAt(4, 78, [4]).roster);
  const kv1 = memKV(), kv2 = memKV();
  for (const kv of [kv1, kv2]) kv.setItem(NORMAL_PROGRESS_KEY, JSON.stringify({ completedNights: 4, waveOpenedAt: [0, 1, 2, 3, 4] }));
  const z = zukanOf([...BASE_IDS, ...NEW.slice(0, 3)]);
  const a = prepareNormalNight(kv1, z, new NightSeed(9).stream("normalRoster"), new NightSeed(9).stream("normalPlace"));
  const b = prepareNormalNight(kv2, z, new NightSeed(9).stream("normalRoster"), new NightSeed(9).stream("normalPlace"));
  assert.deepEqual([a.wave, a.roster, a.plan], [b.wave, b.roster, b.plan]);
});

test("配置：最後の wave でも一夜の総数は今までとほぼ同じ（増えない）。はじめの 12 種の割合は wave ごとに下がる", () => {
  const avgShare: number[] = [];
  for (let wave = 0; wave <= FINAL_NORMAL_WAVE; wave++) {
    let oldSum = 0, allSum = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { plan } = planAt(wave, seed);
      // 川辺から現れる妖怪は河童の一妖と入れ替わる（数に足さない）
      const total = spawnTotal(plan);
      assert.ok(total <= BASE_TOTAL && total >= BASE_TOTAL - 3, `wave ${wave} seed ${seed}：${total}（今まで ${BASE_TOTAL}）`);
      assert.equal(plan.removed, plan.added - plan.river.length, "足した数だけ、はじめの 12 種を減らす");
      for (const [t, n] of typesIn(plan)) {
        if (YOKAI[t].rank !== "normal") continue;
        allSum += n;
        if (BASE_IDS.includes(t)) oldSum += n;
      }
    }
    avgShare.push(oldSum / allSum);
  }
  assert.equal(avgShare[0], 1);
  for (let w = 1; w < avgShare.length; w++) assert.ok(avgShare[w] < avgShare[w - 1], `wave ${w}：${avgShare.map((v) => v.toFixed(2)).join(" → ")}`);
  assert.ok(avgShare[FINAL_NORMAL_WAVE] > 0.5, "最後の wave でも、はじめの 12 種が半分以上（見慣れた顔ぶれは残る）");
  // 群れの最後の一妖は残す（はじめの 12 種が町から消えない）
  const { plan } = planAt(FINAL_NORMAL_WAVE, 3);
  for (const t of BASE_IDS.filter((t) => typesIn(BASE_SPAWN_LISTS).has(t))) assert.ok((typesIn(plan).get(t) ?? 0) >= 1, t);
});

test("配置：開いたばかりの wave の妖怪は、今夜に入りやすい（少なくとも数種類）。印は付けない", () => {
  let freshHit = 0, plainHit = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const fresh = planAt(3, seed, [3]).roster;
    const plain = planAt(3, seed, []).roster;
    assert.ok(fresh.fresh.length >= Math.min(NORMAL_NIGHT.fresh.minTypes, fresh.types.length), `seed ${seed}`);
    freshHit += fresh.types.filter((t) => waveOf(t) === 3).length;
    plainHit += plain.types.filter((t) => waveOf(t) === 3).length;
  }
  assert.ok(freshHit > plainHit * 1.2, `開いたばかり ${freshHit} ／ ふだん ${plainHit}`);
  // 開いてから 2 夜のあいだだけ
  const p = emptyNormalProgress(1);
  noteOpenedWaves(p, 1);
  assert.deepEqual(freshWaves(p, 1, 2), [1]);
  p.completedNights = 2;
  assert.deepEqual(freshWaves(p, 1, 2), [1]);
  p.completedNights = 3;
  assert.deepEqual(freshWaves(p, 1, 2), []);
});

test("配置：全種類が毎晩いるわけではない。一夜に同じ種類が何妖いてもよい（一夜一体の制限は無い）", () => {
  let multi = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { roster } = planAt(FINAL_NORMAL_WAVE, seed);
    assert.ok(roster.types.length < NEW.length && roster.types.length <= NORMAL_NIGHT.maxTypes[FINAL_NORMAL_WAVE]);
    if (roster.types.some((t) => roster.counts[t] >= 2)) multi++;
  }
  assert.ok(multi > 20, "同じ種類が二妖以上いる夜がよくある");
});

test("大妖怪の仕組みに入れない：今夜の大妖怪の候補（NightLegendRoster）に通常妖怪は入らない", () => {
  const ids = legendCandidates().map((c) => c.id);
  for (const id of NEW) assert.ok(!ids.includes(id), id);
  const legendSrc = readFileSync("src/data/legendYokai.ts", "utf8");
  for (const id of NEW) assert.ok(!legendSrc.includes(`"${id}"`), `${id} を legendYokai に書かない`);
});

// ---------------------------------------------------------------- 一夜一体の通常妖怪（大妖怪とは別）

test("一夜一体の通常妖怪：同じ夜に二体出ない（今夜の顔ぶれ・配置）。ほかの通常妖怪は何妖いてもよい", () => {
  let multiNonUnique = 0;
  const seenUnique = new Set<string>();
  for (let seed = 1; seed <= 150; seed++) {
    const { roster, plan } = planAt(FINAL_NORMAL_WAVE, seed, [FINAL_NORMAL_WAVE]);
    const n = typesIn(plan);
    for (const t of NORMAL_UNIQUE) {
      assert.ok((n.get(t) ?? 0) <= 1, `seed ${seed}：${t} が ${n.get(t)} 体`);
      assert.ok([...plan.town, ...plan.extra].filter((s) => s.type === t).length <= 1, `${t}：置き場所は一か所`);
      if (roster.types.includes(t)) (assert.equal(roster.counts[t], 1), seenUnique.add(t));
    }
    for (const t of ["azukiarai", "mokumokuren"]) if ((n.get(t) ?? 0) >= 2) multiNonUnique++;
    assert.ok((n.get("oni") ?? 0) >= 2 && (n.get("kappa") ?? 0) >= 2);
  }
  assert.ok(multiNonUnique > 0, "小豆洗い・目目連は二妖以上いる夜がある");
  assert.deepEqual([...seenUnique].sort(), [...NORMAL_UNIQUE].sort(), "一夜一体の妖怪も、いつかの夜にはいる");
});

test("一夜一体の通常妖怪：出す窓口は一体だけ通し、今夜の大妖怪の候補を見ない。汎用の窓口（報酬・Encounter）からは出さない", () => {
  const gate = new SpawnGate(() => false);
  for (const t of NORMAL_UNIQUE) {
    assert.equal(gate.claim(t), true, `${t}：大妖怪の候補に入っていなくても一体目は置ける`);
    assert.equal(gate.claim(t), false, `${t}：二体目は置けない`);
    assert.equal(gate.allowsGeneric(t), false, `${t}：報酬・Encounter からは出さない`);
    assert.equal(isSpecialYokai(YOKAI[t]), false, `${t}：特別な妖怪（大妖怪・隠し）ではない`);
    assert.equal(isLegend(YOKAI[t]), false);
    assert.equal(isUniquePerNight(YOKAI[t]), true);
  }
  for (const t of ["oni", "azukiarai", "mokumokuren"]) {
    assert.ok(gate.claim(t) && gate.claim(t), `${t}：何妖でも`);
    assert.equal(gate.allowsGeneric(t), true);
  }
});

test("一夜一体の通常妖怪は大妖怪の仕組みに入らない：今夜の候補・縁帳の格・温泉宿の解禁・加入の見出し", () => {
  const cands = legendCandidates().map((c) => c.id);
  for (const t of NORMAL_UNIQUE) assert.ok(!cands.includes(t), t);
  assert.ok(cands.includes("shinno_akugoro") && cands.includes("sanmoto") && !cands.includes("hakutaku"));
  // 縁帳：白沢と縁を結んでいても、大妖怪の数（温泉宿の解禁）に数えない
  const p = { ...emptyLegendProgress(), met: ["hakutaku"], joined: ["hakutaku"] };
  assert.equal(legendTally(p).greater, 0);
  assert.equal(legendTally({ ...p, joined: ["hakutaku", "shinno_akugoro"] }).greater, 1);
  // 加入の見出し（legendJoin）は大妖怪以上だけ（WildYokai.join が isSpecialYokai を見る）
  const src = readFileSync("src/game/WildYokai.ts", "utf8");
  assert.match(src, /if \(isSpecialYokai\(def\)\) \{[\s\S]*?"legendJoin"/);
  // 温泉宿：白沢は通常妖怪として、図鑑に載れば（仲間にしたことがあれば）候補になる（縁帳は要らない）
  const g = drawOnsenGuests({ registered: ["hakutaku", ...BASE_IDS], legendProgress: { met: [], joined: [] }, seed: 3 });
  const pool = new Set<string>();
  for (let s = 1; s <= 40; s++) for (const t of drawOnsenGuests({ registered: ["hakutaku", ...BASE_IDS], legendProgress: { met: [], joined: [] }, seed: s }).normal) pool.add(t);
  assert.ok(pool.has("hakutaku") && !g.greater.includes("hakutaku"));
  // 神野悪五郎は大妖怪として、縁帳で仲間にしてから
  const noJoin = drawOnsenGuests({ registered: ["shinno_akugoro", ...BASE_IDS], legendProgress: { met: [], joined: [] }, seed: 3 });
  assert.ok(!noJoin.all.includes("shinno_akugoro"));
  const legendPool = new Set<string>();
  for (let s = 1; s <= 40; s++) for (const t of drawOnsenGuests({ registered: ["shinno_akugoro", ...BASE_IDS], legendProgress: { met: ["shinno_akugoro"], joined: ["shinno_akugoro"] }, seed: s }).greater) legendPool.add(t);
  assert.ok(legendPool.has("shinno_akugoro"));
});

test("古い保存：消した妖怪（口裂け女・花子さん）の ID が残っていても壊れず、図鑑・温泉宿・解禁に出ない", () => {
  const zukan = { ...zukanOf(BASE_IDS), kuchisake: 3, hanako: 2, kuchisake_onna: 1 };
  const vis = visibleZukanTypes(zukan, { met: [], normalWave: FINAL_NORMAL_WAVE });
  assert.ok(!vis.includes("kuchisake") && !vis.includes("hanako"));
  assert.equal(zukanCompletion(zukan, { met: [], normalWave: 0 }).seen, 12);
  assert.equal(registeredNormalCount(zukan, "normal"), 12);
  assert.equal(zukanEntry("kuchisake", zukan, { met: [], joinCount: {} }), null);
  for (let s = 1; s <= 10; s++) {
    const g = drawOnsenGuests({ registered: Object.keys(zukan), legendProgress: { met: ["hanako"], joined: ["kuchisake"] }, seed: s });
    assert.ok(!g.all.includes("kuchisake") && !g.all.includes("hanako"));
  }
});

// ---------------------------------------------------------------- 現在の名簿（コードから数える。将来の追加で変わる値はここだけに書く）

test("現在の名簿：通常 53（はじめ 12＋後から 41）・一夜一体の通常 11・大妖怪 10・三大妖怪 3・隠しはぬらりひょんだけ。最後の wave の図鑑は 66 / 66 → 67 / 67", () => {
  const ids = (pred: (d: (typeof YOKAI)[string]) => boolean) => YOKAI_ORDER.filter((t) => pred(YOKAI[t]));
  assert.equal(BASE_IDS.length, 12);
  assert.equal(NEW.length, 41);
  assert.equal(ids((d) => d.rank === "normal" && d.discovery === "normal").length, 53);
  assert.deepEqual(ids((d) => d.rank === "normal" && !!d.uniquePerNight).sort(), [...NORMAL_UNIQUE].sort());
  for (const t of NORMAL_UNIQUE) assert.deepEqual([YOKAI[t].rank, YOKAI[t].discovery, YOKAI[t].uniquePerNight], ["normal", "normal", true], t);
  assert.deepEqual(ids((d) => d.rank === "greater" && d.discovery === "normal"), ["daitengu", "ibaraki", "ushi_oni", "orochi", "daidara", "sanmoto", "shinno_akugoro", "ryomen", "gashadokuro", "amanozako"]);
  assert.deepEqual(ids((d) => d.rank === "threeGreat"), ["shuten", "tamamo", "otakemaru"]);
  assert.deepEqual(ids((d) => d.discovery === "hidden"), ["nurarihyon"]);
  const final = zukanCompletion({}, { met: [], normalWave: FINAL_NORMAL_WAVE });
  assert.equal(final.total, 53 + 10 + 3);
  assert.equal(zukanCompletion({}, { met: ["nurarihyon"], normalWave: FINAL_NORMAL_WAVE }).total, 53 + 10 + 3 + 1);
});

// ---------------------------------------------------------------- 夜をまたぐ（結果 → 保存 → 次のページ → prepareNormalNight）

test("夜をまたぐ：結果が出た夜（finishNormalNight）を保存し、次のページの始まり（prepareNormalNight）で夜の数と wave が進む", () => {
  // 結果画面の「同じ夜をもう一度」「次の夜」「タイトルへ」はページを読み直し、新しい Game が prepareNormalNight を呼ぶ（AfterNightDirector.nightSearch）
  const kv = memKV();
  const rng = () => new NightSeed(11).stream("r");
  const seen: [number, number][] = [];
  for (let night = 0; night < 4; night++) {
    const n = prepareNormalNight(kv, {}, rng(), rng());
    seen.push([n.progress.completedNights, n.wave]);
    // 同じ夜の読み直し（リロード）では進まない
    assert.deepEqual([prepareNormalNight(kv, {}, rng(), rng()).progress.completedNights], [n.progress.completedNights]);
    finishNormalNight(kv, n, 1000 + night);
  }
  assert.deepEqual(seen, [[0, 0], [1, 1], [2, 2], [3, 3]]);
  const src = readFileSync("src/game/Game.ts", "utf8");
  assert.match(src, /this\.normal = prepareNormalNight\(/);
  assert.match(src, /finishNormalNight\(this\.kv, this\.normal, r\.endedAt\)/);
});
