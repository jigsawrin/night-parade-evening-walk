import { ONSEN_BOUNDS, ONSEN_DOORS, ONSEN_FALL, ONSEN_POND, ONSEN_POOLS, ONSEN_ROOMS, ONSEN_SPOTS, type OnsenPool, type ORect } from "../../data/onsenMap";
import { nearPoolEntry } from "../../game/onsen/OnsenGroundRules";
import type { OnsenWorld } from "../OnsenWorld";
import { INN, andon } from "./innBuild";

const ROCK = ["#6a6660", "#7a766e", "#5a5852", "#86817a"];

/** 居場所のそば（木や岩を置かない） */
function nearSpot(x: number, z: number, r = 2.2) {
  return ONSEN_SPOTS.some((s) => Math.hypot(s.x - x, s.z - z) < r);
}

/**
 * 宿の外：前庭の参道と石灯籠、中庭の池と紅葉、露天風呂と大岩風呂の岩、奥庭の門、月見の奥庭と、閉じているときの森（両方作って片方を隠す）、外周の森と遠くの山。
 * 湯の水面・湯煙・月・滝の水は OnsenAtmosphere（材質が別）。
 */
export function buildGardens(k: OnsenWorld) {
  maeniwa(k);
  nakaniwa(k);
  for (const p of ONSEN_POOLS) {
    if (p.indoor) continue;
    if (p.id === "tsukiyu") k.track(k.inner.openIds, () => rockRim(k, p.r, 1, p));
    else rockRim(k, p.r, p.id === "iwaburo" ? 1.5 : 1, p);
  }
  // 露天風呂の岩と灯籠、大岩風呂の松
  bigRock(k, 31, 6, 1.6);
  bigRock(k, 15, 5, 1.2);
  k.toro(32.5, 11, 0);
  for (const [x, z] of [[37, 20], [58, 4], [50, -12], [36, -3]]) if (!nearSpot(x, z)) k.tree(x, z, "pine", 1.2);
  bigRock(k, 55, 14, 2.2);
  gate(k);
  // 月見の奥庭（開いているとき）と森（閉じているとき）。見せるのはどちらか一方（OnsenWorld.hiddenInnerIds）
  k.track(k.inner.openIds, () => moonGarden(k));
  const c0 = k.circles.length;
  k.track(k.inner.closedIds, () => forest(k, { x0: -30, z0: 25, x1: 34, z1: 58 }, 5.5));
  k.inner.forestCircles.push(...k.circles.slice(c0));
  boundary(k);
}

function maeniwa(k: OnsenWorld) {
  // 飛び石の参道
  for (let z = -42; z <= -26; z += 2) k.box((z % 4 ? 0.4 : -0.4), 0.05, z, 1.6, 0.1, 1.2, "#9a958a", undefined, z * 0.3);
  for (const z of [-36, -29]) for (const x of [-4, 4]) k.toro(x, z, 0);
  for (const [x, z] of [[-13.5, -26.5], [15.5, -26.5], [15, -41], [-6, -43]]) k.tree(x, z, "pine", 1.1);
  andon(k, -9, -25.2);
  andon(k, 9, -25.2);
}

function nakaniwa(k: OnsenWorld) {
  const p = ONSEN_POND;
  rockRim(k, p, 0.7);
  k.toro(-3, 7, 0);
  k.toro(9.5, 10, 0);
  for (const [x, z, kind] of [[-10.5, 13, "momiji"], [10.5, 17, "momiji"], [-4, 21, "momiji"]] as const) if (!nearSpot(x, z, 1.6)) k.tree(x, z, kind, 0.8);
  // 飛び石（縁側 → 奥の門）
  for (let z = 4; z <= 22; z += 1.8) k.box(z % 3.6 < 1.8 ? 0.8 : 0.2, 0.05, z, 1.1, 0.1, 0.9, "#9a958a", undefined, z);
  bigRock(k, -7.5, 19, 0.9);
}

/** 湯・池の縁の岩（外周に並べる）。湯なら入り口（pool.entry）のところは岩を置かず、平たい踏み石を二つ */
function rockRim(k: OnsenWorld, r: ORect, s: number, pool?: OnsenPool) {
  let pts: [number, number][] = [];
  const step = 1.4 * s;
  for (let x = r.x0; x <= r.x1; x += step) pts.push([x, r.z0], [x, r.z1]);
  for (let z = r.z0 + step; z < r.z1; z += step) pts.push([r.x0, z], [r.x1, z]);
  if (pool) pts = pts.filter(([x, z]) => !nearPoolEntry(pool, x, z));
  k.group("building", false, () => {
    if (pool) for (const d of [-0.7, 0.7]) {
      const onZ = Math.abs(pool.entry.z - r.z0) < 0.01 || Math.abs(pool.entry.z - r.z1) < 0.01;
      k.add({ s: "cyl", c: ROCK[3], p: [pool.entry.x + (onZ ? d : 0), 0.05, pool.entry.z + (onZ ? 0 : d)], sc: [0.9, 0.1, 0.9] });
    }
    pts.forEach(([x, z], i) => {
      const sz = (0.9 + ((i * 37) % 7) / 12) * s;
      k.add({ s: "sphere", c: ROCK[i % ROCK.length], p: [x, 0.18 * s, z], sc: [sz * 1.3, sz * 0.55, sz * 1.1] });
    });
  });
}

function bigRock(k: OnsenWorld, x: number, z: number, s: number) {
  k.group("building", false, () => {
    k.add({ s: "sphere", c: ROCK[0], p: [x, 0.5 * s, z], sc: [2 * s, 1.3 * s, 1.7 * s] });
    k.add({ s: "sphere", c: ROCK[3], p: [x + 0.5 * s, 1.1 * s, z - 0.2 * s], sc: [1.1 * s, 0.9 * s, 1 * s] });
  });
  k.circles.push({ x, z, r: 0.9 * s });
}

/** 中庭の奥の門（開いた扉と閉じた扉を両方作り、最深部が開いているかで片方を隠す） */
function gate(k: OnsenWorld) {
  const d = ONSEN_DOORS.inner;
  const cz = (d.z0 + d.z1) / 2;
  const hw = (d.x1 - d.x0) / 2;
  k.group("building", true, () => {
    for (const sx of [d.x0, d.x1]) k.cyl(sx, 1.4, cz, 0.3, 2.8, INN.woodDark);
    k.box(0, 2.85, cz, d.x1 - d.x0 + 1, 0.22, 0.5, INN.beam);
    k.roof(0, 2.95, cz, d.x1 - d.x0 + 1.8, 1.4, 0.8, "#3a3f4e", false);
  });
  k.track(k.inner.openIds, () => k.group("building", false, () => {
    for (const side of [-1, 1]) k.box(side * (hw - 0.1), 1.2, cz + hw / 2, 0.1, 2.2, hw - 0.1, INN.wood);
  }));
  k.track(k.inner.closedIds, () => k.group("building", false, () => {
    for (const side of [-1, 1]) k.box((side * hw) / 2, 1.2, cz, hw - 0.05, 2.2, 0.1, INN.wood);
  }));
}

/** 月見の奥庭：月見の湯・滝・竹林・紅葉・行灯・月見台・遠くの山（ご褒美は景色そのもの） */
function moonGarden(k: OnsenWorld) {
  // 月見台
  const t = ONSEN_ROOMS.find((q) => q.area === "tsukimi")!.r;
  k.group("building", false, () => {
    k.box((t.x0 + t.x1) / 2, 0.03, (t.z0 + t.z1) / 2, t.x1 - t.x0, 0.06, t.z1 - t.z0, "#7a5a3a");
    for (let x = t.x0; x <= t.x1; x += 2) k.cyl(x, 0.5, t.z1, 0.14, 1, INN.woodDark);
    k.box((t.x0 + t.x1) / 2, 0.9, t.z1, t.x1 - t.x0, 0.1, 0.12, INN.woodDark);
  });
  k.collide({ x0: t.x0, z0: t.z1 - 0.1, x1: t.x1, z1: t.z1 + 0.1 });
  // 滝：岩の崖
  const f = ONSEN_FALL;
  k.group("building", false, () => {
    for (let i = 0; i < 7; i++) {
      const x = f.x + (i - 3) * 1.6;
      k.add({ s: "sphere", c: ROCK[i % 4], p: [x, 1.2 + (i % 2) * 0.8, f.z + 1.6], sc: [2.2, 3.4 + (i % 3), 2] });
    }
    k.add({ s: "sphere", c: ROCK[2], p: [f.x, 4.8, f.z + 2], sc: [5, 2.4, 3] });
  });
  k.collide({ x0: f.x - 6, z0: f.z + 0.6, x1: f.x + 6, z1: f.z + 3 });
  // 竹林（西）と紅葉
  k.group("tree", true, () => {
    for (let i = 0; i < 40; i++) {
      const x = -29 + (i % 8) * 1.1 + ((i * 13) % 5) * 0.12, z = 26 + Math.floor(i / 8) * 3.2 + (i % 3) * 0.5;
      if (nearSpot(x, z, 1.4)) continue;
      k.cyl(x, 3.2, z, 0.16, 6.4, i % 3 ? "#5a8a4a" : "#4a7a3e");
      k.add({ s: "sphere", c: "#3a6a3a", p: [x, 6.4, z], sc: [1.2, 0.9, 1.2] });
    }
  });
  for (let i = 0; i < 5; i++) k.circles.push({ x: -26 + i * 1.3, z: 34, r: 0.5 });
  for (const [x, z] of [[4, 28], [26, 40], [22, 27], [-20, 48], [8, 52], [28, 32]]) if (!nearSpot(x, z)) k.tree(x, z, "momiji", 1.1);
  for (const [x, z] of [[2, 30], [8, 36], [2, 44], [24, 44], [-20, 40]]) if (!nearSpot(x, z, 1.4)) andon(k, x, z, k.inner.lamps);
  // 遠くの山（北）
  for (const [x, h, w] of [[-40, 30, 60], [10, 44, 80], [60, 34, 70]]) k.add({ s: "cyl", c: "#1c2230", p: [x, h / 2 - 1, 100], sc: [w, h, 30], top: 0 });
}

/** 森（閉じている奥庭・外周） */
function forest(k: OnsenWorld, r: ORect, step: number) {
  for (let x = r.x0 + 2; x < r.x1; x += step) {
    for (let z = r.z0 + 2; z < r.z1; z += step) {
      const jx = x + (((x * 7 + z * 3) % 5) - 2) * 0.4, jz = z + (((x * 3 + z * 11) % 5) - 2) * 0.4;
      if (!nearSpot(jx, jz, 3)) k.tree(jx, jz, "cedar", 1.3 + (((x + z) % 3) * 0.15));
    }
  }
}

/** 外周の森（歩ける範囲の外） */
function boundary(k: OnsenWorld) {
  const b = ONSEN_BOUNDS;
  for (let x = b.x0 - 4; x <= b.x1 + 4; x += 6) {
    k.tree(x, b.z0 - 3, "cedar", 1.5);
    k.tree(x, b.z1 + 3, "cedar", 1.5);
  }
  for (let z = b.z0; z <= b.z1; z += 6) {
    k.tree(b.x0 - 3, z, "cedar", 1.5);
    k.tree(b.x1 + 3, z, "cedar", 1.5);
  }
  // 東の山（大岩風呂の向こう）
  for (const [z, h, w] of [[-20, 30, 50], [30, 38, 60]]) k.add({ s: "cyl", c: "#1a2030", p: [100, h / 2 - 1, z], sc: [30, h, w], top: 0 });
}
