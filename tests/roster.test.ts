// 妖怪の正式な名簿と図鑑データ（名前・読み・別名・格・発見方式・紹介）と、まだ本編に出ない妖怪（future）の扱い
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { YOKAI, YOKAI_ORDER, isActiveYokai } from "../src/data/yokaiTypes.ts";
import { PLANNED_YOKAI } from "../src/data/legendConfig.ts";
import { visibleZukanTypes, zukanCompletion, zukanEntry, zukanRankLabel } from "../src/game/ZukanRules.ts";
import { legendCandidates } from "../src/game/legends/NightLegendRoster.ts";
import { drawOnsenGuests } from "../src/game/onsen/OnsenGuestRoster.ts";

const byName = (name: string) => Object.values(YOKAI).find((d) => d.name === name)!;
const namesOf = (pred: (id: string) => boolean) => YOKAI_ORDER.filter(pred).map((id) => YOKAI[id].name);

const GREATER = ["大天狗", "茨木童子", "牛鬼", "八岐大蛇", "ダイダラボッチ", "山本五郎左衛門", "神野悪五郎", "両面宿儺", "ガシャドクロ", "天逆毎"];
const THREE_GREAT = ["酒呑童子", "玉藻前", "大嶽丸"];

test("名簿：YOKAI と図鑑の順が一致し、すべてに読み（ひらがな）・格・発見方式・紹介がある", () => {
  assert.deepEqual([...YOKAI_ORDER].sort(), Object.keys(YOKAI).sort());
  assert.equal(new Set(YOKAI_ORDER).size, YOKAI_ORDER.length);
  for (const id of YOKAI_ORDER) {
    const d = YOKAI[id];
    assert.equal(d.id, id);
    assert.ok(d.reading.length > 0, `${id}：読みが空`);
    assert.match(d.reading, /^[ぁ-ゖー]+$/, `${id}：読みはひらがなだけ`);
    assert.ok(!d.aliases || (d.aliases.length > 0 && d.aliases.every((a) => a.length > 0)), `${id}：別名は要るときだけ、空にしない`);
    assert.ok(!d.aliases?.includes(d.name), `${id}：別名に表示名を入れない`);
    assert.ok(["normal", "greater", "threeGreat"].includes(d.rank), id);
    assert.ok(["normal", "hidden"].includes(d.discovery), id);
    assert.ok(d.lore.length > 0, id);
    // 表示名は短い正式名だけ（読み・別名を連結しない）
    assert.ok(!/[（(／/]/.test(d.name), `${id}：表示名に括弧・区切りを入れない`);
  }
});

test("格：大妖怪は正式な 10 体（この順）、三大妖怪は酒呑童子・玉藻前・大嶽丸、ぬらりひょんは大妖怪＋隠し", () => {
  assert.deepEqual(namesOf((id) => YOKAI[id].rank === "greater" && YOKAI[id].discovery === "normal"), GREATER);
  assert.deepEqual(namesOf((id) => YOKAI[id].rank === "threeGreat"), THREE_GREAT);
  for (const n of THREE_GREAT) assert.equal(byName(n).discovery, "normal");
  const nura = YOKAI.nurarihyon;
  assert.deepEqual([nura.name, nura.rank, nura.discovery, nura.aliases], ["ぬらりひょん", "greater", "hidden", ["滑瓢"]]);
  // 図鑑の順：通常妖怪 → 大妖怪（ぬらりひょんは大妖怪の最後）→ 三大妖怪
  assert.deepEqual(YOKAI_ORDER.slice(-4), ["nurarihyon", "shuten", "tamamo", "otakemaru"]);
  const rankIdx = { normal: 0, greater: 1, threeGreat: 2 };
  const ranks = YOKAI_ORDER.map((id) => rankIdx[YOKAI[id].rank]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("海坊主は通常妖怪（大妖怪にしない）。別名は海入道・海法師", () => {
  const d = byName("海坊主");
  assert.deepEqual([d.id, d.rank, d.discovery, d.reading, d.aliases], ["umibozu", "normal", "normal", "うみぼうず", ["海入道", "海法師"]]);
  assert.ok(!GREATER.includes("海坊主"));
  assert.ok(!("umibozu" in PLANNED_YOKAI));
});

test("読み・別名：八岐大蛇・山本五郎左衛門・玉藻前・白沢など", () => {
  assert.equal(byName("八岐大蛇").reading, "やまたのおろち");
  assert.ok(!Object.values(YOKAI).some((d) => d.name === "大蛇"), "「大蛇」だけを表示名にしない");
  assert.equal(byName("山本五郎左衛門").reading, "さんもとごろうざえもん");
  assert.equal(byName("酒呑童子").reading, "しゅてんどうじ");
  assert.equal(byName("両面宿儺").reading, "りょうめんすくな");
  assert.equal(byName("天逆毎").reading, "あまのざこ");
  assert.equal(byName("白沢").reading, "はくたく");
  assert.ok(byName("玉藻前").aliases!.includes("九尾の狐"));
  assert.ok(byName("白沢").aliases!.includes("白澤"));
  assert.deepEqual(byName("酒呑童子").aliases, ["酒顛童子", "酒天童子"]);
  for (const n of ["大天狗", "牛鬼", "ガシャドクロ", "大嶽丸"]) assert.equal(byName(n).aliases, undefined, `${n}：別名は書かない`);
});

test("伝承（lore）：短く（1〜2 文）、誤伝を史実のように書かない", () => {
  for (const n of [...GREATER, ...THREE_GREAT, "ぬらりひょん", "白沢"]) {
    const l = byName(n).lore;
    assert.ok(l.length >= 15 && l.length <= 90, `${n}：${l.length} 字`);
    assert.ok((l.match(/。/g) ?? []).length <= 2, `${n}：2 文まで`);
  }
  assert.match(byName("ガシャドクロ").lore, /昭和/);
  assert.ok(!/江戸|古代/.test(byName("ガシャドクロ").lore));
  assert.match(byName("両面宿儺").lore, /飛騨/);
  assert.ok(!/邪悪/.test(byName("両面宿儺").lore));
  assert.match(byName("白沢").lore, /中国/);
  assert.ok(!/日本固有/.test(byName("白沢").lore));
  assert.match(byName("ぬらりひょん").lore, /後世/);
  // 神野悪五郎：作品ごとに違う後世の設定（必ず決闘した・妖怪の世界を二分した）を原典のように書かない
  assert.match(byName("神野悪五郎").lore, /稲生物怪録/);
  assert.ok(!/決闘|二分/.test(byName("神野悪五郎").lore));
  assert.deepEqual(byName("神野悪五郎").aliases, ["神ン野悪五郎", "真の悪五郎", "真野悪五郎"]);
});

// ---------------------------------------------------------------- future（まだ本編に出ない）

const ACTIVE_NORMAL = YOKAI_ORDER.filter((id) => isActiveYokai(YOKAI[id]) && YOKAI[id].discovery === "normal");
/** future の妖怪を仮に作る（今の名簿はすべて active） */
const withFuture = (ids: string[]) => Object.fromEntries(Object.entries(YOKAI).map(([id, d]) => [id, ids.includes(id) ? { ...d, zukanAvailability: "future" as const } : d]));

test("future：今の名簿はすべて本編に出る（active）。future は発見方式とは別の軸", () => {
  for (const id of YOKAI_ORDER) assert.ok(isActiveYokai(YOKAI[id]), id);
  assert.equal(YOKAI.nurarihyon.discovery, "hidden");
  assert.equal(YOKAI.nurarihyon.zukanAvailability, undefined);
});

test("future：図鑑の枠も分母も増えない（今の図鑑が埋まっていれば、埋まったまま）", () => {
  const defs = withFuture(["tamamo", "ibaraki"]);
  const normal = YOKAI_ORDER.filter((id) => isActiveYokai(defs[id]) && defs[id].discovery === "normal");
  const all = Object.fromEntries(normal.map((t) => [t, 1]));
  const c = zukanCompletion(all, undefined, defs);
  assert.deepEqual([c.seen, c.total, c.complete], [normal.length, normal.length, true]);
  assert.ok(!visibleZukanTypes({}, undefined, defs).includes("tamamo"), "？？？の枠も出さない");
  assert.equal(zukanEntry("tamamo", { tamamo: 1 }, { met: ["tamamo"], joinCount: {} }, defs), null);
});

test("future：今夜の候補・温泉宿の客にならない", () => {
  const defs = withFuture(["tamamo", "ibaraki"]);
  const ids = legendCandidates(defs).map((c) => c.id);
  assert.ok(!ids.includes("tamamo") && !ids.includes("ibaraki") && ids.includes("shuten"));
  const r = drawOnsenGuests({ registered: [...ACTIVE_NORMAL, "tamamo"], legendProgress: { met: [], joined: ["tamamo"] }, seed: 1, forcedGuests: ["tamamo"] }, undefined, defs);
  assert.ok(!r.all.includes("tamamo"));
});

test("見つけていない隠し妖怪（ぬらりひょん）は図鑑に何も出さない", () => {
  assert.ok(!visibleZukanTypes({}).includes("nurarihyon"));
  assert.equal(zukanEntry("nurarihyon", {}), null);
  assert.ok(visibleZukanTypes({}, { met: ["nurarihyon"] }).includes("nurarihyon"), "見つけたら出る");
});

// ---------------------------------------------------------------- 表示

test("格の呼び名：妖怪・大妖怪・三大妖怪（「通常妖怪」「隠し妖怪」にしない）", () => {
  assert.deepEqual([zukanRankLabel("normal"), zukanRankLabel("greater"), zukanRankLabel("threeGreat")], ["妖怪", "大妖怪", "三大妖怪"]);
  assert.equal(zukanEntry("oni", { oni: 1 })!.rankLabel, "妖怪");
});

test("読み・別名は図鑑でだけ使う（名前の見出し・加入・写真・結果に連結しない）", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (p.endsWith(".ts")) files.push(p.replace(/\\/g, "/"));
    }
  };
  walk("src");
  const allowed = new Set(["src/data/yokaiTypes.ts", "src/game/ZukanRules.ts", "src/presentation/zukan/ZukanCards.ts"]);
  for (const f of files) {
    if (allowed.has(f)) continue;
    assert.ok(!/\.(reading|aliases)\b/.test(readFileSync(f, "utf8")), `${f}：読み・別名は図鑑だけ`);
  }
  // 図鑑でも、名前の見出し（zk-name）には表示名だけ
  const ui = readFileSync("src/presentation/zukan/ZukanCards.ts", "utf8");
  assert.match(ui, /fit\(e\.name, "zk-name"\)/);
  assert.ok(!/別名：なし/.test(ui));
  // よみは見出し（「よみ」の字）を付けずに名前の下へ。名前・よみ・別名は一行に詰める（fit）
  assert.ok(!/>よみ</.test(ui));
  assert.match(ui, /<div class="zk-read">\$\{fit\(e\.reading\)\}<\/div>/);
  assert.match(ui, /fit\(e\.aliases\.join\("・"\)\)/);
});
