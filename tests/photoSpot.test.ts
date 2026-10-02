// 記念撮影の場所（参道の鳥居を背にした広場）と、カメラの方を向く（向き直る・こっち向いて）
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { FORMATIONS, type Family } from "../src/data/photo.ts";
import { PLAZA, SANDO_TORII } from "../src/data/map.ts";
import { layoutFormation, type FormationMember } from "../src/game/after/PhotoFormation.ts";
import { SHRINE_PHOTO, shrinePhotoSpot, type SpotWorld } from "../src/game/after/PhotoSpot.ts";
import { LOOK_MAX_TURN, faceYaw } from "../src/game/after/PhotoPose.ts";

const FAM: Family[] = ["CHIBI_BIPED", "CHIBI_QUAD", "FLOAT", "SPECIAL"];
const crowd = (n: number): FormationMember[] =>
  Array.from({ length: n }, (_, i) => ({ typeId: `t${i % 7}`, family: FAM[i % 4], scale: [0.85, 1, 1.2][i % 3], x: 0, z: 0, yaw: 0, rank: "normal" as const }));
const hero = { x: 40, z: -80, yaw: 0 };
/** 丸い当たり（木）だけがある町。ignore の円の中の当たりは数えない（World.circlesNear と同じ約束） */
function town(circles: { x: number; z: number; r: number }[] = [], walk = () => true): SpotWorld {
  return {
    isWalkable: walk,
    circlesNear: (x, z, r, ignore) =>
      circles.filter((c) => !(ignore && Math.hypot(c.x - ignore.x, c.z - ignore.z) <= ignore.r) && Math.hypot(c.x - x, c.z - z) < r + c.r).length,
  };
}
const tiers = FORMATIONS.find((f) => f.id === "hinadan")!;
const fan = FORMATIONS.find((f) => f.id === "ougi")!;

test("撮影の場所：参道の鳥居の手前で南（カメラ側）を向き、並びの奥の端が鳥居を越えない。人数が多いほど広場の手前へ", () => {
  let prevZ = Infinity;
  for (const n of [10, 40, 100, 180]) {
    for (const def of [tiers, fan]) {
      const ms = crowd(n);
      const ctx = shrinePhotoSpot(town(), def, ms, hero)!;
      assert.ok(ctx, `${def.id} ${n}`);
      assert.deepEqual([ctx.anchorX, ctx.fx, ctx.fz], [SANDO_TORII.x, 0, -1]);
      const res = layoutFormation(def, ms, ctx);
      for (const s of [res.hero, ...res.slots]) assert.ok(s.z <= SHRINE_PHOTO.backLimitZ + 1e-9, `${def.id} ${n}：${s.z}`);
      assert.ok(ctx.anchorZ >= SHRINE_PHOTO.minZ);
    }
    const z = shrinePhotoSpot(town(), tiers, crowd(n), hero)!.anchorZ;
    assert.ok(z <= prevZ, `${n} 妖：${z}`);
    prevZ = z;
  }
});

test("撮影の場所：広場の真ん中の御神木は、撮影の間だけ隠すので邪魔にならない。ほかの木は避ける", () => {
  const shinboku = [{ x: PLAZA.x, z: PLAZA.z, r: 1.4 }, { x: PLAZA.x, z: PLAZA.z, r: 3.3 }];
  const ms = crowd(180);
  const withTree = shrinePhotoSpot(town(shinboku), tiers, ms, hero);
  const open = shrinePhotoSpot(town(), tiers, ms, hero);
  assert.deepEqual(withTree, open, "御神木は無いものとして選ぶ");
  // 御神木以外の木が並びの場所にあれば、そこを避けて（歩ける割合の高い場所へ）
  const grove = Array.from({ length: 30 }, (_, i) => ({ x: -12 + (i % 6) * 5, z: 50 + Math.floor(i / 6) * 2.5, r: 1 }));
  const ctx = shrinePhotoSpot(town(grove), fan, crowd(20), hero);
  assert.ok(ctx && ctx.anchorZ < 50, `林を避ける：${ctx?.anchorZ}`);
});

test("撮影の場所：歩ける場所が足りなければ null（近くの開けた場所を探す）", () => {
  assert.equal(shrinePhotoSpot(town([], () => false), tiers, crowd(30), hero), null);
});

test("向き直る：体ごとカメラの方へ。こっち向いて：並びの向きから LOOK_MAX_TURN までだけ振り向く", () => {
  assert.equal(faceYaw(1, 0, 0, 0, 10, "body"), 0);
  assert.ok(Math.abs(faceYaw(0, 0, 0, 10, 0, "body") - Math.PI / 2) < 1e-9);
  // 少しだけずれていれば、こっち向いてでもぴったり向く
  assert.ok(Math.abs(faceYaw(0, 0, 0, 1, 10, "look") - Math.atan2(1, 10)) < 1e-9);
  // 真後ろのカメラには、顔が向く分だけ（体ごとは向かない）
  const back = faceYaw(0, 0, 0, 0.5, -10, "look");
  assert.ok(Math.abs(Math.abs(back) - LOOK_MAX_TURN) < 1e-9);
  assert.ok(Math.abs(faceYaw(3, 0, 0, 0, -10, "look") - 3) <= LOOK_MAX_TURN + 1e-9);
});

test("撮影を終えるとき（結果・眺めるへ）は、撮影で隠した NPC を戻すだけ（隠し直さない）。隠すのは撮影中だけ", () => {
  const src = readFileSync("src/presentation/PhotoModeDirector.ts", "utf8");
  const body = (name: string) => {
    const a = src.indexOf(`\n  ${name}(`);
    const b = src.indexOf("\n  }\n", a);
    assert.ok(a > 0 && b > a, name);
    return src.slice(a, b);
  };
  const leave = body("leaveLook");
  assert.match(leave, /this\.restoreBystanders\(\)/);
  assert.ok(!/hideBystanders/.test(leave), "leaveLook で隠し直さない");
  assert.match(body("arrange"), /if \(this\.isPhoto\(\)\) this\.hideBystanders\(/, "結果・眺めるで並べ直すときは隠さない");
});
