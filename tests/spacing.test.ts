// 行列・写真の間隔を妖怪の大きさ（scale）に合わせる（ParadeSpacing と雛壇の特等席）
import { test } from "node:test";
import assert from "node:assert/strict";
import { YOKAI } from "../src/data/yokaiTypes.ts";
import { FORMATIONS, type Family } from "../src/data/photo.ts";
import { bodyRadius, centerOutPositions, followerOffsets, pairGap } from "../src/game/ParadeSpacing.ts";
import { layoutFormation, type FormationMember } from "../src/game/after/PhotoFormation.ts";

const BASE = 1.3;

test("行列：ふつうの大きさの妖怪（scale 0.85〜1.2）どうしの間隔は今までどおり（i 番目 × 1.3）", () => {
  const scales = Array.from({ length: 120 }, (_, i) => [0.85, 1, 1.15, 1.2][i % 4]);
  const off = followerOffsets(scales, BASE);
  off.forEach((d, i) => assert.ok(Math.abs(d - (i + 1) * BASE) < 1e-9, `${i}`));
  // 大妖怪でも 1.35 程度までは変わらない
  assert.equal(pairGap(1, 1.35, BASE), BASE);
});

test("行列：scale 2.8 の妖怪の前後だけ広がり、そこから後ろは元の間隔に戻る", () => {
  const scales = [1, 1, 1, 2.8, 1, 1, 1];
  const off = followerOffsets(scales, BASE);
  const gaps = off.map((d, i) => d - (i ? off[i - 1] : 0));
  const same = (a: number[], b: number) => a.every((g) => Math.abs(g - b) < 1e-9);
  assert.ok(same(gaps.slice(0, 3), BASE));
  assert.ok(gaps[3] > BASE * 1.5 && gaps[4] > BASE * 1.5, `前 ${gaps[3]}・後ろ ${gaps[4]}`);
  assert.ok(Math.abs(gaps[3] - gaps[4]) < 1e-9, "前後は同じ広がり");
  assert.ok(same(gaps.slice(5), BASE));
  // 前後の妖怪と体が重ならない
  assert.ok(gaps[3] >= bodyRadius(2.8) + bodyRadius(1));
  // 大きな妖怪が続けば、その分さらに広い
  assert.ok(pairGap(2.8, 2.4, BASE) > pairGap(2.8, 1, BASE));
});

test("特等席の横並び：中央から外へ。大きな妖怪の隣は広い", () => {
  const u = centerOutPositions([1.5, 2.8, 1.9, 2.4], 2.16);
  assert.equal(u[0], 0);
  assert.ok(u[1] > 0 && u[2] < 0 && u[3] > u[1]);
  for (const [a, b] of [[0, 1], [0, 2], [1, 3]]) {
    assert.ok(Math.abs(u[a] - u[b]) >= bodyRadius([1.5, 2.8, 1.9, 2.4][a]) + bodyRadius([1.5, 2.8, 1.9, 2.4][b]), `${a}-${b}`);
  }
  assert.deepEqual(centerOutPositions([1, 1, 1], 2.16), [0, 2.16, -2.16], "ふつうの大きさなら今までどおり honorSp ごと");
});

// ---------------------------------------------------------------- 雛壇

const tiers = FORMATIONS.find((f) => f.layout === "tiers")!;
const PCTX = { anchorX: 0, anchorZ: 0, fx: 0, fz: 1, hero: { x: 0, z: 0, yaw: 0 } };
const FAM: Family[] = ["CHIBI_BIPED", "CHIBI_QUAD", "FLOAT", "SPECIAL"];
const legend = (id: string): FormationMember => ({
  typeId: id, family: YOKAI[id].family as Family, scale: YOKAI[id].scale ?? 1, x: 0, z: 0, yaw: 0, photoRole: YOKAI[id].photoRole, rank: YOKAI[id].rank,
});
function crowd(n: number, legends: string[]): FormationMember[] {
  const out: FormationMember[] = Array.from({ length: n }, (_, i) => ({
    typeId: `t${i % 7}`, family: FAM[i % 4], scale: [0.85, 1, 1.2][i % 3], x: i, z: 0, yaw: 0, rank: "normal" as const,
  }));
  legends.forEach((id, k) => out.splice(Math.floor(((k + 1) * n) / (legends.length + 1)), 0, legend(id)));
  return out;
}

const GIANTS = ["orochi", "daidara", "gashadokuro"];
const ALL_LEGENDS = [...GIANTS, "shuten", "tamamo", "otakemaru", "ibaraki", "ryomen", "sanmoto", "hakutaku", "daitengu"];

test("雛壇：八岐大蛇・ダイダラボッチ・ガシャドクロが同時にいても、特等席どうし・前の段の妖怪と体が重ならない", () => {
  for (const n of [0, 20, 80, 150]) {
    const ms = crowd(n, ALL_LEGENDS);
    const res = layoutFormation(tiers, ms, PCTX);
    const honored = ms.map((m, i) => i).filter((i) => ms[i].photoRole && ms[i].photoRole !== "normal");
    for (const i of honored) {
      for (let j = 0; j < ms.length; j++) {
        if (i === j) continue;
        const a = res.slots[i], b = res.slots[j];
        // 同じ高さの段どうし（浮く妖怪は上空なので除く）
        if (ms[j].family === "FLOAT" && !ms[j].photoRole) continue;
        if (Math.abs(a.lift - b.lift) > 1.2) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        assert.ok(d >= (bodyRadius(ms[i].scale) + bodyRadius(ms[j].scale)) * 0.95, `n=${n} ${ms[i].typeId} と ${ms[j].typeId}：${d.toFixed(2)}`);
      }
    }
    // 大きな三体は最後列の後ろ（手前の通常の妖怪より奥）、三大妖怪は中央の手前（既存の立ち位置）
    const v = (id: string) => res.slots[ms.findIndex((m) => m.typeId === id)].z;
    const groundV = res.slots.filter((_, k) => !ms[k].photoRole && ms[k].family !== "FLOAT").map((s) => s.z);
    if (groundV.length) for (const g of GIANTS) assert.ok(v(g) < Math.min(...groundV), `${g} は後ろ`);
    const three = ["shuten", "tamamo", "otakemaru"].map((id) => res.slots[ms.findIndex((m) => m.typeId === id)]);
    assert.ok(three.every((s) => s.z === 0), "三大妖怪は主人公のすぐ後ろの列");
    assert.ok(Math.min(...three.map((s) => Math.abs(s.x))) === 0, "いちばん格の高い一体が中央");
  }
});

test("雛壇：100 妖以上でも、枠の数は同じで、すべての位置が数になり、重なった位置が無い", () => {
  for (const n of [100, 160, 220]) {
    const ms = crowd(n, ALL_LEGENDS);
    for (const f of FORMATIONS) {
      const res = layoutFormation(f, ms, PCTX);
      assert.equal(res.slots.length, ms.length, `${f.id} ${n}`);
      for (const s of res.slots) assert.ok([s.x, s.z, s.lift, s.yaw].every(Number.isFinite), f.id);
    }
    const res = layoutFormation(tiers, ms, PCTX);
    const keys = new Set(res.slots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)},${s.lift.toFixed(2)}`));
    assert.equal(keys.size, ms.length, `n=${n}`);
  }
});
