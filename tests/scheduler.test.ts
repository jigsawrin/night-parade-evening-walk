import { test } from "node:test";
import assert from "node:assert/strict";
import { NightSeed } from "../src/core/seed.ts";
import { ENCOUNTERS, type EncounterKind } from "../src/data/encounters.ts";
import { EventDeck } from "../src/game/EventDeck.ts";
import { BREATH, EncounterScheduler, MINI_GAP, maxActiveFor, type Rumor, type SchedulerView } from "../src/game/EncounterScheduler.ts";

const mk = (seed: number) => {
  const s = new NightSeed(seed);
  return new EncounterScheduler(new EventDeck(ENCOUNTERS, s.stream("deck")), s.stream("schedule"));
};

const view = (o: Partial<SchedulerView> = {}): SchedulerView => ({
  t: 0, px: 0, pz: -118, fx: 0, fz: 1, total: 30, activeKinds: [], busy: new Set(),
  districtOf: () => null, districtVisit: () => undefined,
  ...o,
});

/** 噂のところまで歩いていって昇格させる */
function walkTo(s: EncounterScheduler, r: Rumor, t: number, total: number) {
  return s.update(view({ t, px: r.x, pz: r.z, total })).promoted;
}

test("同時数：序盤 1、中盤〜後半は最大 2。3 つ同時は特殊な夜だけ", () => {
  assert.equal(maxActiveFor(1), 1);
  assert.equal(maxActiveFor(12), 1);
  assert.equal(maxActiveFor(25), 2);
  assert.equal(maxActiveFor(60), 2);
  assert.equal(maxActiveFor(150), 2);
  assert.equal(maxActiveFor(60, true), 3);
});

test("Breathing room：始まった直後・終わった直後は、新しい噂を出さない", () => {
  const s = mk(11);
  const rs = s.offer(view({ t: 0 }), "pacing");
  assert.ok(rs.length >= 1);
  const p = walkTo(s, rs[0], 5, 30)!;
  assert.ok(p && !p.forced);
  s.onStart(5, p.rumor.def);
  assert.ok(s.breathUntil >= 5 + BREATH.normal[0]);
  // 始まった直後：Attraction からも Pacing からも出ない
  assert.equal(s.offer(view({ t: 10, activeKinds: [p.rumor.def.kind] }), "attraction").length, 0);
  assert.equal(s.offer(view({ t: 10, activeKinds: [p.rumor.def.kind] }), "pacing").length, 0);
  // 終わった直後も
  s.onSettled(40, p.rumor.def, "complete");
  assert.ok(s.breathing(41));
  assert.equal(s.offer(view({ t: 41 }), "pacing").length, 0);
  // 間が明ければまた出る
  assert.ok(s.offer(view({ t: s.breathUntil + 0.1 }), "pacing").length >= 1);
});

test("Breathing room：間の最中に何度求められても連続生成されない", () => {
  const s = mk(5);
  const first = s.offer(view({ t: 0, total: 60 }), "attraction");
  assert.ok(first.length);
  const p = walkTo(s, first[0], 1, 60)!;
  s.onStart(1, p.rumor.def);
  s.onSettled(2, p.rumor.def, "complete");
  let made = 0;
  for (let t = 2; t < s.breathUntil; t += 0.25) {
    made += s.offer(view({ t, total: 60 }), "attraction").length;
    made += s.offer(view({ t, total: 60 }), "pacing").length;
    made += s.offer(view({ t, total: 60 }), "awaken").length;
  }
  assert.equal(made, 0);
});

test("Breathing room：Mini Parade・地区覚醒の後は長め", () => {
  const s = mk(3);
  const mini = ENCOUNTERS.find((e) => e.kind === "miniParade")!;
  s.onStart(100, mini);
  assert.ok(s.breathUntil >= 100 + BREATH.big[0] && s.breathUntil <= 100 + BREATH.big[1]);
  const s2 = mk(3);
  s2.onAwaken(100, "shotengai");
  assert.ok(s2.breathUntil >= 100 + BREATH.awaken[0]);
  assert.ok(BREATH.awaken[0] > BREATH.normal[1] - 1);
});

test("噂の組は一枠：噂が出ている間は次の噂を重ねない。昇格しなければ薄れて山札へ戻る", () => {
  const s = mk(21);
  const rs = s.offer(view({ t: 0, total: 60 }), "pacing");
  assert.ok(rs.length >= 1 && rs.length <= 2);
  assert.equal(s.occupied(0), 1);
  assert.equal(s.offer(view({ t: 1, total: 60 }), "pacing").length, 0);
  const deckBefore = s.deck.size;
  let faded = 0;
  for (let t = 0; t < 200 && s.rumors.length; t += 0.5) faded += s.update(view({ t, total: 60, px: 500, pz: 500 })).faded.length;
  assert.equal(faded, rs.length);
  assert.equal(s.deck.size, deckBefore + rs.length, "選ばれなかった札は山札へ戻る");
});

test("分かれ道：2 方向から別々の噂が届き、片方を選ぶともう片方は山札へ戻る", () => {
  let found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const s = mk(seed);
    const rs = s.offer(view({ t: 0, total: 60 }), "attraction");
    if (rs.length < 2) continue;
    found = true;
    const [a, b] = rs;
    assert.notEqual(a.def.kind, b.def.kind, "別々の種類");
    const ang = Math.atan2(a.x, a.z + 118) - Math.atan2(b.x, b.z + 118);
    assert.ok(Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) > 1.2, "別々の方向");
    assert.ok(a.promoteR > 0 && Math.hypot(a.x, a.z + 118) > a.promoteR, "近づくまでは噂のまま");
    const p = walkTo(s, b, 3, 60)!;
    assert.equal(p.rumor, b);
    assert.deepEqual(p.dropped, [a]);
    assert.equal(s.rumors.length, 0);
    assert.equal(s.kindAffinity.get(b.def.kind), 1, "自分で選んだ系統が少し寄る");
  }
  assert.ok(found, "どこかの夜で分かれ道が生まれる");
});

test("Mini Parade：30 妖未満では出ない。出た後は数分あける", () => {
  const s = mk(8);
  for (let i = 0; i < 40; i++) {
    const t = i * 60;
    const rs = s.offer(view({ t, total: 29 }), "debug");
    assert.ok(!rs.some((r) => r.def.kind === "miniParade"));
    s.rumors.length = 0;
  }
  const mini = ENCOUNTERS.find((e) => e.id === "mini_parade")!;
  const grand = ENCOUNTERS.find((e) => e.id === "mini_parade_grand")!;
  assert.ok(s.eligible(mini, 30, [], 0));
  assert.ok(!s.eligible(grand, 80, [], 0), "賑やかな行列は、小さな行列に一度出会ってから");
  s.onStart(100, mini);
  assert.ok(!s.eligible(mini, 60, [], 100 + MINI_GAP[0] - 1));
  assert.ok(s.eligible(mini, 60, [], 100 + MINI_GAP[1] + 1));
  assert.ok(!s.eligible(mini, 60, ["miniParade"], 100 + MINI_GAP[1] + 1), "同時に二つは出さない");
});

/** 一夜ぶんの「噂 → 選ぶ → 攻略」を決まった選び方で回し、場に出た Encounter の順番を返す */
function playNight(seed: number, choose: (rs: readonly Rumor[]) => Rumor) {
  const s = mk(seed);
  const order: string[] = [];
  let t = 0;
  for (let n = 0; n < 14; n++) {
    t = Math.max(t, s.breathUntil) + 1;
    const rs = s.offer(view({ t, total: 60 }), "pacing");
    if (!rs.length) continue;
    const r = choose(rs);
    const p = walkTo(s, r, t + 20, 60)!;
    s.onStart(t + 20, p.rumor.def);
    order.push(p.rumor.def.id);
    t += 60;
    s.onSettled(t, p.rumor.def, "complete");
  }
  return { order, s };
}

test("Seed：同じ種・同じ選び方なら同じ夜（山札・噂・顔ぶれの偏り）", () => {
  const a = playNight(4242, (rs) => rs[0]);
  const b = playNight(4242, (rs) => rs[0]);
  assert.deepEqual(a.order, b.order);
  assert.deepEqual([...a.s.typeBias], [...b.s.typeBias]);
});

test("Seed：同じ種でも、選ぶ方向が違えば Encounter の消費順が分かれる", () => {
  let diverged = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const first = playNight(seed, (rs) => rs[0]);
    const last = playNight(seed, (rs) => rs[rs.length - 1]);
    if (first.order.join() !== last.order.join()) diverged++;
  }
  assert.ok(diverged >= 3, `diverged=${diverged}`);
  // 同じ系統を追い続けると、その系統の札が少し引かれやすい（ただし上限つき）
  const fox = playNight(9, (rs) => rs.find((r) => r.def.kind === "foxfireTrail") ?? rs[0]);
  const w = fox.s.cardWeight(ENCOUNTERS.find((e) => e.kind === "foxfireTrail")!);
  assert.ok(w > 1 && w <= 2.2, `weight=${w}`);
});

test("選択の偏り：成就した Encounter の顔ぶれが今夜の行列の個性として少し残る", () => {
  const s = mk(1);
  const fox = ENCOUNTERS.find((e) => e.id === "foxfire_bride")!;
  s.onSettled(10, fox, "complete");
  s.onSettled(80, fox, "complete");
  assert.ok((s.typeBias.get("kitsune") ?? 0) > (s.typeBias.get("hitodama") ?? 0));
  assert.equal(s.typeBias.get("kappa"), undefined);
  // 薄れて終わった（攻略しなかった）ものは偏りにならない
  const hungry = ENCOUNTERS.find((e) => e.id === "hungry_tanuki")!;
  s.onSettled(200, hungry, "expired");
  assert.equal(s.typeBias.get("tanuki"), undefined);
});

test("放置：立ち止まっていれば噂は昇格しない（最終手段も噂が十分古いときだけ）", () => {
  const s = mk(13);
  const rs = s.offer(view({ t: 0, total: 40 }), "pacing");
  assert.ok(rs.length);
  let promoted = 0;
  for (let t = 0; t < 60; t += 0.25) if (s.update(view({ t, total: 40 })).promoted) promoted++;
  assert.equal(promoted, 0);
  assert.equal(s.forcePromote(view({ t: 20, total: 40 }), 40), null);
});

test("同時数を常に埋めない：後半でも噂の組と Encounter で最大 2 枠", () => {
  const s = mk(77);
  const rs = s.offer(view({ t: 0, total: 80 }), "attraction");
  const p = walkTo(s, rs[0], 1, 80)!;
  s.onStart(1, p.rumor.def);
  const kinds: EncounterKind[] = [p.rumor.def.kind];
  const t = s.breathUntil + 1;
  const more = s.offer(view({ t, total: 80, activeKinds: kinds }), "attraction");
  assert.ok(more.length >= 1);
  assert.equal(s.occupied(1), 2);
  assert.equal(s.offer(view({ t: t + 100, total: 80, activeKinds: kinds }), "pacing").length, 0);
});
