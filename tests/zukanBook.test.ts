// 妖怪図鑑（一体一列の本）：正式な順・図鑑の文（伝承 / 出会い方 / ひとこと）・未登録の情報を漏らさない・検索・墨絵 / 3D の切り替え
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { toKanji } from "../src/core/util.ts";
import { YOKAI, YOKAI_ORDER, isActiveYokai } from "../src/data/yokaiTypes.ts";
import { LEGEND_ZUKAN_ORDER, NORMAL_ZUKAN_ORDER } from "../src/data/zukanOrder.ts";
import { YOKAI_INK, hasInkPortrait, initialVisualMode, inkPortrait, inkPortraitUrl } from "../src/data/yokaiInk.ts";
import { DISTRICTS } from "../src/data/districts.ts";
import { MOMENTUM_LEVELS } from "../src/game/FestivalMomentum.ts";
import { FINAL_NORMAL_WAVE } from "../src/data/normalYokai.ts";
import { normalizeZukanQuery, zukanCompletion, zukanEntry, zukanListing, zukanMatches } from "../src/game/ZukanRules.ts";
import { entryCardHtml, sectionTitle, unknownCardHtml } from "../src/presentation/zukan/ZukanCards.ts";
import { ZukanVisual, type ModelStage } from "../src/presentation/zukan/ZukanVisual.ts";

const NORMAL_53 = [
  "oni", "hitodama", "chochin", "tanuki", "zashiki", "nekomata", "kappa", "karakasa", "rokurokubi", "tengu", "kitsune", "ittan",
  "umibozu", "hitotsume", "yukionna", "nurikabe", "konaki", "sunakake", "yamauba",
  "amanojaku", "kamaitachi", "sunekosuri", "baku", "ningyo", "azukiarai", "jorogumo",
  "teketeke", "amabie", "nue", "namahage", "kudan", "hasshaku", "nopperabo",
  "hakutaku", "tsuchigumo", "ippon_datara", "mujina", "gaki", "satori", "katawaguruma",
  "kyokotsu", "nozuchi", "makuragaeshi", "isohime", "moryo", "tsurube_otoshi", "kasha",
  "uwan", "nuppeppo", "yatagarasu", "waira", "shirikoboshi", "mokumokuren",
];
const GREATER_10 = ["daitengu", "ibaraki", "ushi_oni", "orochi", "daidara", "sanmoto", "shinno_akugoro", "ryomen", "gashadokuro", "amanozako"];
const THREE_GREAT_3 = ["shuten", "tamamo", "otakemaru"];

const ACTIVE = YOKAI_ORDER.filter((t) => isActiveYokai(YOKAI[t]));
/** 全部を登録した図鑑 */
const allCounts = (except: string[] = []) => Object.fromEntries(ACTIVE.filter((t) => YOKAI[t].discovery === "normal" && !except.includes(t)).map((t) => [t, 3]));
const FINAL = { met: [] as string[], joinCount: {}, normalWave: FINAL_NORMAL_WAVE };
const typesOf = (secs: ReturnType<typeof zukanListing>) => secs.flatMap((s) => s.entries.map((e) => e.type));

// ---------------------------------------------------------------- 正式な順（並べ替えない）

test("順：通常妖怪 53 種・大妖怪 10 種・ぬらりひょん・三大妖怪 3 体が、正式な順と完全に一致する（唯一の元は data/zukanOrder.ts）", () => {
  assert.deepEqual([...NORMAL_ZUKAN_ORDER], NORMAL_53);
  assert.deepEqual([...LEGEND_ZUKAN_ORDER], [...GREATER_10, "nurarihyon", ...THREE_GREAT_3]);
  assert.deepEqual(YOKAI_ORDER, [...NORMAL_53, ...GREATER_10, "nurarihyon", ...THREE_GREAT_3]);
  assert.deepEqual(YOKAI_ORDER.filter((t) => YOKAI[t].rank === "normal"), NORMAL_53);
  assert.deepEqual(YOKAI_ORDER.filter((t) => YOKAI[t].rank === "greater" && YOKAI[t].discovery === "normal"), GREATER_10);
  assert.deepEqual(YOKAI_ORDER.filter((t) => YOKAI[t].rank === "threeGreat"), THREE_GREAT_3);
  assert.deepEqual([...YOKAI_ORDER].sort(), Object.keys(YOKAI).sort(), "名簿の全員が順に一度ずつ");
});

test("順：最後の wave・全登録で 66 体が 妖怪 → 大妖怪 → 三大妖怪 の区分に、この順で並ぶ", () => {
  const secs = zukanListing(allCounts(), FINAL);
  assert.deepEqual(secs.map((s) => [s.rank, s.label, s.entries.length]), [["normal", "妖怪", 53], ["greater", "大妖怪", 10], ["threeGreat", "三大妖怪", 3]]);
  assert.deepEqual(typesOf(secs), [...NORMAL_53, ...GREATER_10, ...THREE_GREAT_3]);
  assert.deepEqual(secs.map(sectionTitle), ["妖 怪", "大 妖 怪", "三 大 妖 怪"]);
});

test("ぬらりひょん：見つけるまで枠も欠番も無い。見つけたら大妖怪の最後に増え、N / N → N+1 / N+1", () => {
  const counts = allCounts();
  const before = zukanListing(counts, FINAL);
  assert.equal(before[1].entries.length, 10);
  assert.ok(!typesOf(before).includes("nurarihyon"));
  assert.deepEqual(typesOf(zukanListing(counts, FINAL, { query: "ぬらり" })), [], "検索しても出ない");
  const c0 = zukanCompletion(counts, FINAL);
  const found = { ...FINAL, met: ["nurarihyon"] };
  const after = zukanListing(counts, found);
  assert.deepEqual(after[1].entries.map((e) => e.type), [...GREATER_10, "nurarihyon"]);
  assert.equal(after[1].entries.at(-1)!.rankLabel, "大妖怪");
  const c1 = zukanCompletion(counts, found);
  assert.deepEqual([c0.seen, c0.total, c1.seen, c1.total], [66, 66, 67, 67]);
  // 通し番号は画面に出さない（欠番から存在が漏れる）
  for (const e of after.flatMap((s) => s.entries)) assert.ok(!/No\.|第[0-9０-９一二三四五六七八九十]+|番/.test(entryCardHtml(e, visual(), { tonight: 0 })), e.type);
});

// ---------------------------------------------------------------- 図鑑の文

const INTERNAL = /wave|spawn|Roster|uniquePerNight|normalWave|originKind/i;

test("文：全員に よみ・伝承・この町での出会い方・ひとこと。伝承に出会い方（この町・行列へ加わる）や内部の言葉を書かない", () => {
  for (const id of ACTIVE) {
    const d = YOKAI[id];
    assert.ok(d.reading && d.lore && d.zukanEncounter && d.zukanFlavor, id);
    assert.notEqual(d.lore, d.zukanEncounter, id);
    assert.ok(!d.lore.includes(d.zukanEncounter) && !d.zukanEncounter.includes(d.lore), `${id}：伝承と出会い方を分ける`);
    assert.ok(!INTERNAL.test(d.lore + d.zukanEncounter + d.zukanFlavor), id);
    assert.ok(!/この町|百鬼夜行へ|行列へ加わ|町に混ざ/.test(d.lore), `${id}：伝承にこのゲームでの出会い方を書かない（${d.lore}）`);
    const f = [...d.zukanFlavor].length;
    assert.ok(f >= 8 && f <= 35, `${id}：ひとこと ${f} 字`);
    assert.ok([...d.zukanEncounter].length <= 90, `${id}：出会い方 ${d.zukanEncounter.length} 字`);
  }
});

test("文：考証（伝承の側）を分けたあとも守る", () => {
  const lore = (id: string) => YOKAI[id].lore;
  assert.match(lore("nurarihyon"), /後世/);
  assert.ok(!/江戸|古代/.test(lore("gashadokuro")));
  assert.match(lore("ryomen"), /飛騨/);
  assert.match(lore("hakutaku"), /中国/);
  assert.match(lore("yatagarasu"), /神話/);
  assert.match(lore("namahage"), /来訪神/);
  assert.match(lore("gaki"), /仏教/);
  assert.ok(!/古寺/.test(lore("uwan")) && !/モグラ/.test(lore("waira")));
  assert.ok(!/血|死体|喰|食べ/.test(lore("kasha") + YOKAI.kasha.zukanEncounter + YOKAI.kasha.zukanFlavor));
});

/**
 * 保守のきまり：**加入条件（rule）を変えたら zukanEncounter も確かめる**。
 * 数や名前の入る条件は、ここで食い違いを見つける（文そのものは自然な日本語を優先して手で書く）
 */
test("文：出会い方が今の加入条件（数・相手・地区・賑わい）と食い違わない", () => {
  const has = (id: string, s: string) => assert.ok(YOKAI[id].zukanEncounter.includes(s), `${id}：「${s}」が出会い方に無い（${YOKAI[id].zukanEncounter}）`);
  for (const id of ACTIVE) {
    const r = YOKAI[id].rule;
    if (r.kind === "minCount") has(id, `${toKanji(r.count)}妖`);
    if (r.kind === "variety") has(id, `${toKanji(r.n)}種`);
    if (r.kind === "food") has(id, "団子");
    if (r.kind === "river") has(id, "川辺");
    if (r.kind !== "legend") continue;
    for (const c of r.conditions) {
      if (c.kind === "specificYokai") has(id, `${YOKAI[c.type].name}を${toKanji(c.n)}妖`.replace(/を一妖$/, "を"));
      if (c.kind === "totalCount") has(id, `${toKanji(c.n)}妖`);
      if (c.kind === "typeVariety") has(id, `${toKanji(c.n)}種`);
      if (c.kind === "activityCount") has(id, `${toKanji(c.n)}つ`);
      if (c.kind === "encounterComplete") has(id, c.n === 1 ? "一度" : `${toKanji(c.n)}つ`);
      if (c.kind === "momentum") has(id, `「${MOMENTUM_LEVELS[c.level].name}」`);
      if (c.kind === "districtAwakened") has(id, c.district ? `${DISTRICTS.find((d) => d.id === c.district)!.name}を祭り` : `${toKanji(c.n ?? 1).replace("二", "二つ")}`);
    }
  }
});

// ---------------------------------------------------------------- 未登録の情報を漏らさない

test("未登録：まだ町に混ざらない通常妖怪・見つけていない隠し妖怪は枠ごと無い。開いた wave の未登録は？？？だけ", () => {
  const w0 = typesOf(zukanListing({}, { met: [], normalWave: 0 }));
  assert.ok(w0.includes("oni") && !w0.includes("yukionna") && !w0.includes("nurarihyon"));
  const w1 = zukanListing({}, { met: [], normalWave: 1 }).flatMap((s) => s.entries);
  const yuki = w1.find((e) => e.type === "yukionna")!;
  assert.equal(yuki.seen, false);
  for (const e of w1) {
    const html = unknownCardHtml(YOKAI[e.type].hint);
    const d = YOKAI[e.type];
    for (const secret of [d.name, d.reading, ...(d.aliases ?? []), d.lore, d.zukanEncounter, d.zukanFlavor]) {
      assert.ok(!html.includes(secret), `${e.type}：未登録の枠に「${secret}」`);
    }
    assert.ok(!/zk-tab|zk-play|zk-ink|zk-model|墨絵|3D|zk-rank|data-type/.test(html), `${e.type}：未登録に姿・札・格・ID を出さない`);
    assert.match(html, /？？？/);
  }
});

test("検索：登録済みだけを 名前・よみ・別名 で探す。未登録の正体は検索から推し量れない", () => {
  const counts = { kappa: 2, tamamo: 1, mujina: 1 };
  const found = { met: [], normalWave: FINAL_NORMAL_WAVE };
  const q = (s: string) => typesOf(zukanListing(counts, found, { query: s }));
  assert.deepEqual(q("河童"), ["kappa"]);
  assert.deepEqual(q("かっぱ"), ["kappa"]);
  assert.deepEqual(q("カッパ"), ["kappa"], "カタカナでも");
  assert.deepEqual(q("九尾"), ["tamamo"], "別名でも");
  assert.deepEqual(q("狢"), ["mujina"]);
  assert.deepEqual(q("ゆきおんな"), [], "未登録の雪女は出ない");
  assert.deepEqual(q("雪"), []);
  assert.deepEqual(q("  "), typesOf(zukanListing(counts, found)), "空白だけなら全部");
  assert.ok(typesOf(zukanListing(counts, found)).includes("yukionna"), "検索が空なら未登録の枠も並ぶ");
  assert.equal(zukanMatches({ seen: false, name: "雪女", reading: "ゆきおんな", aliases: [] }, "ゆき"), false);
  assert.equal(normalizeZukanQuery("ＫＡＰＰＡ　カッパ"), "kappaかっぱ");
});

test("登録済みのみ：未登録の？？？を並べない（まだ混ざらない妖怪はどちらでも出ない）", () => {
  const counts = { oni: 1, daitengu: 1 };
  const only = zukanListing(counts, { met: [], normalWave: 0 }, { registeredOnly: true });
  assert.deepEqual(only.map((s) => [s.rank, s.entries.map((e) => e.type)]), [["normal", ["oni"]], ["greater", ["daitengu"]]]);
  assert.ok(!typesOf(zukanListing(counts, { met: [], normalWave: 0 })).includes("yukionna"));
});

test("格：通常妖怪は全員「妖怪」（白沢も）。神野悪五郎・ぬらりひょんは「大妖怪」。画面に内部の分類を出さない", () => {
  const found = { met: ["nurarihyon"], joinCount: { shinno_akugoro: 2 }, normalWave: FINAL_NORMAL_WAVE };
  const counts = { ...allCounts(), nurarihyon: 0 };
  for (const e of zukanListing(counts, found).flatMap((s) => s.entries)) {
    assert.equal(e.rankLabel, { normal: "妖怪", greater: "大妖怪", threeGreat: "三大妖怪" }[e.rank], e.type);
    const html = entryCardHtml(e, visual(), { tonight: 1 });
    assert.ok(!/通常妖怪|一夜一体|ユニーク|隠し妖怪|modern|wave|レア|追加妖怪|段階/.test(html), e.type);
  }
  assert.equal(zukanEntry("hakutaku", { hakutaku: 1 }, { met: [], joinCount: {} })!.rankLabel, "妖怪");
  assert.equal(zukanEntry("shinno_akugoro", { shinno_akugoro: 1 }, { met: [], joinCount: {} })!.rankLabel, "大妖怪");
});

test("枠：登録済みは 名前・格・よみ・別名（あるときだけ）・伝承・出会い方・ひとこと・記録。記録は保存済みの数だけで作る", () => {
  const e = zukanEntry("tamamo", { tamamo: 12 }, { met: ["tamamo"], joinCount: { tamamo: 3 } })!;
  const html = entryCardHtml(e, visual(), { tonight: 2 });
  for (const s of ["玉藻前", "三大妖怪", "たまものまえ", "別名", "九尾の狐・金毛九尾の狐", "伝承", "この町での出会い方", e.zukanFlavor, "これまで", "十二妖", "今夜", "二妖", "縁を結んだ夜", "三夜"]) {
    assert.ok(html.includes(s), s);
  }
  const k = entryCardHtml(zukanEntry("kappa", { kappa: 1 }, { met: [], joinCount: {} })!, visual(), { tonight: 0 });
  assert.ok(!/別名|今夜|縁を結んだ夜/.test(k), "無い欄は作らない");
  // 見つけただけの隠し妖怪（まだ加わっていない）
  const n = entryCardHtml(zukanEntry("nurarihyon", {}, { met: ["nurarihyon"], joinCount: {} })!, visual(), { tonight: 0 });
  assert.match(n, /まだ加わっていない/);
});

// ---------------------------------------------------------------- 墨絵 / 3D

function visual(over: Partial<Parameters<typeof entryCardHtml>[1]> = {}) {
  return { mode: "3d" as const, inkUrl: null, hasModel: true, icon: "妖", ...over };
}

test("墨絵：図鑑の全員に墨絵があり、墨絵が初め。墨絵の無い妖怪なら 3D が初めで「墨絵」の札は押せず「準備中」", () => {
  assert.deepEqual(Object.keys(YOKAI_INK), ACTIVE, "図鑑の全員（図鑑の順）");
  assert.equal(initialVisualMode("kappa"), "ink");
  assert.equal(inkPortrait("kappa"), "./yokai-ink/kappa.webp");
  assert.equal(initialVisualMode("kappa", {}), "3d");
  assert.equal(inkPortrait("nope"), null);
  const e = zukanEntry("kappa", { kappa: 1 }, { met: [], joinCount: {} })!;
  const none = entryCardHtml(e, visual(), { tonight: 0 });
  assert.match(none, /data-mode="ink" aria-pressed="false" disabled>墨絵<small>準備中<\/small>/);
  assert.match(none, /data-mode="3d" aria-pressed="true">3D/);
  assert.ok(!/<img/.test(none), "偽物の墨絵を出さない");
  const ink = entryCardHtml(e, visual({ mode: "ink", inkUrl: "./yokai-ink/kappa.webp" }), { tonight: 0 });
  assert.match(ink, /data-mode="ink" aria-pressed="true">墨絵</);
  assert.match(ink, /<img class="zk-ink" src="\.\/yokai-ink\/kappa\.webp"[^>]*loading="lazy"/);
});

test("墨絵：URL はページの置き場所から作る（GitHub Pages のサブパスを壊さない）。登録と public/yokai-ink のファイルが揃う", () => {
  const ink = { kappa: "kappa.webp" };
  assert.equal(inkPortraitUrl("kappa", "./", ink), "./yokai-ink/kappa.webp");
  assert.equal(inkPortraitUrl("kappa", "/hyakki/", ink), "/hyakki/yokai-ink/kappa.webp");
  assert.equal(inkPortraitUrl("kappa", "/hyakki", ink), "/hyakki/yokai-ink/kappa.webp");
  assert.equal(inkPortraitUrl("oni", "./", ink), null);
  assert.equal(hasInkPortrait("kappa", ink), true);
  const files = existsSync("public/yokai-ink") ? readdirSync("public/yokai-ink").filter((f) => !f.startsWith(".")) : [];
  for (const [id, f] of Object.entries(YOKAI_INK)) {
    assert.ok(id in YOKAI, `${id}：名簿に無い`);
    assert.ok(files.includes(f!), `${id}：public/yokai-ink/${f} が無い`);
  }
  for (const f of files) assert.ok(Object.values(YOKAI_INK).includes(f), `public/yokai-ink/${f} を YOKAI_INK に登録する`);
  // scripts/yokai-ink.py で変換したもの（WebP・1 枚 500KB まで）。元絵をそのまま置かない
  for (const f of files) {
    assert.match(f, /^[a-z_]+\.webp$/, f);
    assert.ok(statSync(`public/yokai-ink/${f}`).size <= 500 * 1024, `${f}：大きすぎる（scripts/yokai-ink.py で変換する）`);
  }
});

/** 3D の舞台の代わり（一つだけ。姿を作るたびに前の姿を片付ける） */
class FakeStage implements ModelStage<string> {
  current: { type: string; mount: string } | null = null;
  disposed: string[] = [];
  running = false;
  shows = 0;
  show(type: string, mount: string) {
    if (this.current) this.disposed.push(this.current.type);
    this.current = { type, mount };
    this.running = true;
    this.shows++;
  }
  hide() {
    if (this.current) this.disposed.push(this.current.type);
    this.current = null;
    this.running = false;
  }
  setRunning(on: boolean) {
    this.running = on && !!this.current;
  }
}

test("3D：舞台は一つだけ。別の妖怪で映すと前の姿を片付けて移す。墨絵へ切り替える・閉じると止める。開いただけでは作らない", () => {
  const stage = new FakeStage();
  const v = new ZukanVisual(stage, (t) => t === "tamamo");
  assert.equal(v.modeOf("kappa"), "3d");
  assert.equal(v.modeOf("tamamo"), "ink");
  assert.equal(v.canInk("kappa"), false);
  assert.equal(v.setMode("kappa", "ink", "#kappa"), false, "墨絵が無ければ選べない");
  assert.equal(stage.shows, 0, "何も押さなければ 3D を作らない");
  v.play("kappa", "#kappa");
  assert.deepEqual([stage.current, v.active, stage.running], [{ type: "kappa", mount: "#kappa" }, "kappa", true]);
  v.setMode("nekomata", "3d", "#nekomata");
  assert.deepEqual(stage.current, { type: "nekomata", mount: "#nekomata" });
  assert.deepEqual(stage.disposed, ["kappa"], "前の姿を片付けた");
  assert.equal(v.active, "nekomata");
  // 画面の外では描かない
  v.setVisible("nekomata", false);
  assert.equal(stage.running, false);
  v.setVisible("kappa", true);
  assert.equal(stage.running, false, "映していない妖怪の見え隠れでは動かない");
  v.setVisible("nekomata", true);
  assert.equal(stage.running, true);
  // 墨絵へ：映していた妖怪なら止める
  v.play("tamamo", "#tamamo");
  assert.equal(v.setMode("tamamo", "ink", "#tamamo"), true);
  assert.deepEqual([stage.current, v.active, stage.running, v.modeOf("tamamo")], [null, null, false, "ink"]);
  // 閉じる
  v.play("kappa", "#kappa");
  v.stop();
  assert.deepEqual([stage.current, v.active, stage.running], [null, null, false]);
  assert.equal(v.modeOf("kappa"), "3d", "見せ方は覚えておく");
});
