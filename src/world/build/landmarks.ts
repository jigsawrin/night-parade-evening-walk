import { MeshBuilder, TransformNode } from "../../core/babylon";
import { GRAVEYARD, INARI, SHRINE, TEMPLE, TORII_PATH, WORLD, YOKOCHO_GATE, rect, SANDO_TORII } from "../../data/map";
import { paint } from "../../characters/PartBuilder";
import type { WorldKit } from "../WorldKit";

/**
 * 名所：神社・寺（五重塔と墓地・竹林）・稲荷と千本鳥居・妖怪横丁。
 * WorldKit の部品（家・屋根・鳥居・木・提灯…）で組み立てる。呼ぶ順番は World.build（町の乱数の並びが変わらないように）。
 */

export function buildShrine(kit: WorldKit) {
  const { x, z } = SHRINE;
  kit.torii(SANDO_TORII.x, SANDO_TORII.z, 0, 1.25);
  kit.torii(0, SHRINE.gateZ, 0, 1.5);
  for (let zz = 68; zz < 100; zz += 6) {
    kit.toro(-3.8, zz, 0);
    kit.toro(3.8, zz, 0);
  }
  // 拝殿
  kit.group("landmark", true, () => {
  kit.box(x, 0.6, z, 16, 1.2, 12, "#6a5a4a");
  for (let i = 0; i < 5; i++) kit.box(x, 0.2 + i * 0.22, z - 6.5 - i * 0.4, 5, 0.22, 0.6, "#8a7a64");
  for (const sx of [-7, -3.5, 0, 3.5, 7]) for (const sz of [-5.5, 5.5]) kit.cyl(x + sx, 3.2, z + sz, 0.5, 4, "#c83a28");
  kit.box(x, 3.2, z + 1, 13, 4, 8, "#e8dcc4");
  kit.box(x, 5.3, z, 16.4, 0.5, 12.4, "#4a3426");
  kit.roof(x, 5.5, z, 20, 16, 4.8, "#3f6a5a", false);
  kit.box(x, 10.35, z, 8, 0.4, 0.6, "#2e4a3e");
  kit.box(x, 3.4, z - 3.1, 4, 1.8, 0.1, "#ffffff", kit.lamps[0]);
  kit.add({ s: "torus", c: "#e6d8a8", p: [x, 4.8, z - 5.8], sc: [7, 1, 1.2], th: 0.4, r: [Math.PI / 2, 0, 0] });
  kit.box(x, 1.7, z - 5.2, 2, 1, 1.2, "#5a3a24"); // 賽銭箱
  });
  kit.collide(rect(x - 8, z - 6, x + 8, z + 6));
  // 狛犬
  for (const sx of [-1, 1]) {
    kit.group("landmark", false, () => {
      kit.box(sx * 5, 0.6, z - 12, 1.2, 1.2, 1.2, "#8a867c");
      kit.add({ s: "sphere", c: "#9a968a", p: [sx * 5, 1.7, z - 12], sc: [1, 1.2, 1.1] });
      kit.add({ s: "sphere", c: "#9a968a", p: [sx * 5, 2.5, z - 11.7], sc: 0.9 });
    });
    kit.collide(rect(sx * 5 - 0.7, z - 12.7, sx * 5 + 0.7, z - 11.3));
  }
  // 杉林
  for (let i = 0; i < 26; i++) {
    const a = kit.rnd() * Math.PI * 2;
    const r = 17 + kit.rnd() * 10;
    const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
    if (tz < 104 && Math.abs(tx) < 8) continue;
    kit.tree(tx, tz, "cedar", 1.4 + kit.rnd() * 0.5);
  }
  // 神社の篝火（常時）
  for (const sx of [-6, 6]) kit.group("landmark", false, () => {
    kit.cyl(sx, 0.8, z - 9, 0.2, 1.6, "#4a3426");
    kit.add({ s: "sphere", c: "#ffffff", p: [sx, 1.9, z - 9], sc: [0.7, 0.9, 0.7] }, kit.lamps[0]);
  });
}

export function buildTemple(kit: WorldKit) {
  const { x, z } = TEMPLE;
  // 山門
  kit.group("landmark", true, () => {
    kit.box(-60, 2, 15, 1, 4, 1, "#5a3a2a");
    kit.box(-60, 2, 21, 1, 4, 1, "#5a3a2a");
    kit.roof(-60, 4, 18, 4, 9, 1.8, "#3e4452", false, true);
  });
  kit.collide(rect(-60.6, 14.4, -59.4, 15.6));
  kit.collide(rect(-60.6, 20.4, -59.4, 21.6));
  // 本堂
  kit.group("landmark", true, () => {
  kit.box(x, 0.5, z, 18, 1, 13, "#5a5654");
  kit.box(x, 3.2, z, 15, 4.4, 10, "#d8ccb0");
  for (const sx of [-7.5, -2.5, 2.5, 7.5]) kit.box(x + sx, 3.2, z - 5.05, 0.4, 4.4, 0.4, "#4a3426");
  kit.box(x, 5.5, z, 17, 0.4, 12, "#4a3426");
  kit.roof(x, 5.7, z, 22, 16, 5.5, "#384050", false);
  kit.box(x, 3, z - 5.1, 6, 2.2, 0.1, "#ffffff", kit.windows[0]);
  });
  kit.collide(rect(x - 9, z - 6.5, x + 9, z + 6.5));
  // 五重塔
  const px = -100, pz = 34;
  kit.group("landmark", true, () => {
  for (let i = 0; i < 5; i++) {
    const s = 1 - i * 0.12;
    kit.box(px, 1.4 + i * 3.2, pz, 5 * s, 2.4, 5 * s, "#a8402e");
    kit.roof(px, 2.6 + i * 3.2, pz, 8.4 * s, 8.4 * s, 1.3, "#384050", false);
  }
  kit.add({ s: "cyl", c: "#c8a040", p: [px, 18.5, pz], sc: [0.3, 4, 0.3] });
  for (let i = 0; i < 5; i++) kit.add({ s: "torus", c: "#c8a040", p: [px, 17.5 + i * 0.6, pz], sc: 0.7, th: 0.08 });
  });
  kit.collide(rect(px - 2.6, pz - 2.6, px + 2.6, pz + 2.6));
  // 墓地
  const g = GRAVEYARD;
  for (let gx = g.x0 + 3; gx < g.x1 - 2; gx += 3.4) {
    for (let gz = g.z0 + 3; gz < g.z1 - 2; gz += 4) {
      if (kit.rnd() < 0.2) continue;
      const h = 1 + kit.rnd() * 0.6;
      kit.group("building", false, () => {
        kit.box(gx, 0.2, gz, 1.2, 0.4, 1.0, "#6a6860");
        kit.box(gx, 0.4 + h / 2, gz, 0.6, h, 0.6, "#8a887e");
        if (kit.rnd() < 0.4) kit.box(gx + 0.6, 1.2, gz + 0.5, 0.1, 2.4, 0.2, "#b8a888");
      });
      kit.circles.push({ x: gx, z: gz, r: 0.6 });
    }
  }
  // 竹林
  for (let i = 0; i < 60; i++) {
    const bx = -130 + kit.rnd() * 16;
    const bz = 20 + kit.rnd() * 60;
    kit.group("tree", true, () => {
      kit.add({ s: "cyl", c: kit.rnd() < 0.5 ? "#6a9a4a" : "#5a8a3e", p: [bx, 3.5, bz], sc: [0.18, 7, 0.18] });
      kit.add({ s: "sphere", c: "#4a7a3a", p: [bx, 6.8, bz], sc: [1.4, 0.8, 1.4] });
    });
  }
}

export function buildInari(kit: WorldKit) {
  // 千本鳥居
  const pts = TORII_PATH;
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let d = acc; d < L; d += 2.2) {
      const t = d / L;
      kit.torii(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw + Math.PI / 2, 0.85, "#e04a2a");
    }
    acc = (acc + Math.ceil((L - acc) / 2.2) * 2.2) - L;
  }
  // 祠
  const { x, z } = INARI;
  kit.group("landmark", true, () => {
    kit.box(x, 0.5, z + 5, 7, 1, 6, "#6a5a4a");
    kit.box(x, 2.2, z + 5, 5, 2.6, 4, "#e8dcc4");
    kit.roof(x, 3.5, z + 5, 7.5, 6.5, 2.2, "#c83a28", true);
  });
  kit.collide(rect(x - 3.5, z + 2, x + 3.5, z + 8));
  // 天狗の座る岩
  kit.group("landmark", false, () => {
    kit.add({ s: "sphere", c: "#6a6660", p: [x, 0.3, z], sc: [2.4, 1.2, 2] });
    for (const sx of [-2.5, 2.5]) {
      kit.box(x + sx, 0.6, z - 1, 0.8, 1.2, 0.8, "#8a867c");
      kit.add({ s: "sphere", c: "#f4efe6", p: [x + sx, 1.6, z - 1], sc: [0.7, 0.9, 0.9] });
      kit.add({ s: "sphere", c: "#d8323a", p: [x + sx, 1.3, z - 0.6], sc: [0.6, 0.12, 0.3] });
    }
  });
  for (const sx of [-4, 4]) kit.lantern(x + sx, 2.4, z + 1, 0, "#ffffff", 0.8);
  for (let i = 0; i < 14; i++) {
    const a = kit.rnd() * Math.PI * 2, r = 9 + kit.rnd() * 8;
    kit.tree(x + Math.cos(a) * r, z + Math.sin(a) * r, kit.rnd() < 0.5 ? "cedar" : "momiji", 1.2);
  }
}

export function buildYokocho(kit: WorldKit) {
  const b = kit.yokochoStatic;
  const lampB = kit.yokochoLamps;
  // 大木戸と土塀
  const gx = YOKOCHO_GATE.x;
  kit.group("building", true, () => {
    for (const sz of [-6.2, 6.2]) kit.box(gx, 2.4, YOKOCHO_GATE.z + sz, 1, 4.8, 1, "#3a2a22");
    kit.roof(gx, 4.8, YOKOCHO_GATE.z, 3.4, 15, 1.6, "#2e3440", false, true);
    kit.box(gx, 5.5, YOKOCHO_GATE.z, 1.2, 0.9, 3, "#2e2018");
    kit.box(gx - 0.08, 5.5, YOKOCHO_GATE.z, 1.2, 0.6, 2.4, "#d8c49a");
  });
  for (const [z0, z1] of [[WORLD.minZ, YOKOCHO_GATE.z - 6.7], [YOKOCHO_GATE.z + 6.7, WORLD.maxZ]]) {
    const cz = (z0 + z1) / 2, L = z1 - z0;
    kit.group("building", false, () => {
      kit.box(gx, 1.3, cz, 1, 2.6, L, "#b8a888");
      kit.box(gx, 2.75, cz, 1.6, 0.3, L, "#3e4452");
    });
    kit.collide(rect(gx - 0.8, z0, gx + 0.8, z1));
  }
  kit.gateCollider = kit.collide(rect(gx - 0.8, YOKOCHO_GATE.z - 6, gx + 0.8, YOKOCHO_GATE.z + 6));
  for (const s of [-1, 1]) {
    const pivot = new TransformNode("doorPivot", kit.scene);
    pivot.position.set(gx, 0, YOKOCHO_GATE.z + s * 5.9);
    const door = MeshBuilder.CreateBox("door", { width: 0.4, height: 4.4, depth: 5.8 }, kit.scene);
    paint(door, "#4a3020");
    door.material = kit.mats.static;
    door.position.set(0, 2.2, -s * 2.9);
    door.parent = pivot;
    // 門扉の鋲
    const band = MeshBuilder.CreateBox("band", { width: 0.45, height: 0.2, depth: 5.8 }, kit.scene);
    paint(band, "#1a1418");
    band.material = kit.mats.static;
    band.position.set(0, 1.2, -s * 2.9);
    band.parent = pivot;
    kit.gateDoors.push(door);
    kit.structureMeshes.push({ mesh: door, cat: "building" }, { mesh: band, cat: "building" });
    (door as any).pivot = pivot;
    (door as any).side = s;
  }

  // 横丁の中
  kit.yokochoNode = new TransformNode("yokocho", kit.scene);
  const cols = ["#5a3a6a", "#3a2a4a", "#6a3a4a", "#2a3a5a"];
  for (const side of [1, -1]) {
    for (let x = -150; x < -114; x += 8.5) {
      const cz = YOKOCHO_GATE.z + side * 9.5;
      kit.house(x + 4, cz, 7.5, 7, 3.6 + kit.rnd() * 1.4, side === 1 ? "s" : "n", {
        wall: "#3a3040", roof: "#2a2030", noren: cols[Math.floor(kit.rnd() * cols.length)], bucket: b, lit: 0,
        winBucket: () => lampB,
      });
      for (const lx of [x + 1.5, x + 6.5]) {
        kit.group("building", false, () => kit.add({ s: "sphere", c: "#ffffff", p: [lx, 3.2, cz - side * 4.2], sc: [0.6, 0.8, 0.6] }, lampB));
      }
    }
  }
  // 提灯のアーチ
  for (let x = -148; x < -112; x += 2.5) {
    kit.group("building", false, () => kit.add({ s: "sphere", c: "#ffffff", p: [x, 5.2 + Math.sin(x * 0.7) * 0.3, YOKOCHO_GATE.z], sc: [0.5, 0.65, 0.5] }, lampB));
  }
  for (let i = 0; i < 10; i++) {
    const tx = -152 + kit.rnd() * 38, tz = kit.rnd() < 0.5 ? -40 + kit.rnd() * 8 : -2 + kit.rnd() * 6;
    kit.group("tree", true, () => {
      kit.add({ s: "cyl", c: "#3a2a30", p: [tx, 1.5, tz], sc: [0.3, 3, 0.3] }, b);
      kit.add({ s: "sphere", c: "#6a3a7a", p: [tx, 4, tz], sc: 2.6 }, b);
    });
  }
}
