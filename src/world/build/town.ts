import { DANGO_STALLS, PLAZA, rect } from "../../data/map";
import type { WorldKit } from "../WorldKit";

/**
 * 町なか：商店街・長屋・川向こう・広場（御神木）・屋台・街灯・祭り提灯の縄。
 * WorldKit の部品（家・屋根・鳥居・木・提灯…）で組み立てる。呼ぶ順番は World.build（町の乱数の並びが変わらないように）。
 */

// ------------------------------------------------------------------ districts
export function buildShops(kit: WorldKit) {
  const noren = ["#2a4a8a", "#8a2a3a", "#2a6a4a", "#6a3a7a", "#a8742a", "#2a2a3a"];
  const skip = (x: number, w: number) =>
    [[-8, 8], [-69, -57], [-99, -87], [-38, -32]].some(([a, b]) => x + w / 2 > a && x - w / 2 < b);
  for (const side of [1, -1]) {
    const cz = side === 1 ? -9.5 : -30.5;
    let x = -104;
    while (x < 54) {
      const w = 7 + Math.floor(kit.rnd() * 3);
      const cx = x + w / 2;
      if (cx + w / 2 > 55) break;
      if (!skip(cx, w)) {
        kit.house(cx, cz, w, 7, 3.2 + kit.rnd() * 0.8, side === 1 ? "s" : "n", {
          noren: noren[Math.floor(kit.rnd() * noren.length)], lit: Math.floor(kit.rnd() * 3),
        });
        // 軒先の提灯（段階 2 で灯る）
        kit.lantern(cx - w / 3, 3.0, cz - side * 4.2, 2, "#ffffff", 0.8);
        if (kit.rnd() < 0.5) kit.lantern(cx + w / 3, 3.0, cz - side * 4.2, 2, "#ffffff", 0.8);
      }
      x += w + 1;
    }
  }
  // 川向こう
  for (let x = 84; x < 128; x += 10) {
    kit.house(x, -9.5, 8, 7, 3.4, "s", { noren: noren[Math.floor(kit.rnd() * noren.length)] });
    kit.house(x, -30.5, 8, 7, 3.4, "n", {});
  }
}

export function buildNagaya(kit: WorldKit) {
  const rows = [-44, -58, -78, -94, -108];
  const segs: [number, number][] = [[-110, -97], [-89, -67], [-59, -24]];
  for (const z of rows) {
    for (const [a, b] of segs) {
      const len = b - a;
      const units = Math.max(1, Math.round(len / 4.2));
      const uw = len / units;
      for (let i = 0; i < units; i++) {
        const cx = a + uw * (i + 0.5);
        kit.house(cx, z, uw - 0.1, 6, 2.6, z > -64 ? "s" : "n", { thatch: true, wall: "#cbbd9e", lit: Math.floor(kit.rnd() * 5) });
      }
    }
  }
  // 井戸と物干し
  kit.group("building", false, () => {
    kit.cyl(-78, 0.4, -67 + 5, 1.6, 0.8, "#7a766c");
    kit.box(-78, 1.8, -62, 2.4, 0.12, 0.12, "#6b4a2e");
  });
  for (const [x, z] of [[-50, -84], [-80, -99], [-40, -51]]) kit.group("building", false, () => {
    kit.box(x, 1.8, z, 0.1, 1.8, 0.1, "#6b4a2e");
    kit.box(x + 4, 1.8, z, 0.1, 1.8, 0.1, "#6b4a2e");
    kit.box(x + 2, 2.6, z, 4.2, 0.06, 0.06, "#6b4a2e");
    kit.box(x + 1.2, 2.1, z, 1.2, 1.0, 0.04, "#e8e4f0");
    kit.box(x + 2.8, 2.15, z, 1.0, 0.9, 0.04, "#8aa0c8");
  });
  // 裏路地の祭り提灯（段階 layer: 路地祭りで点灯 → level 2 に相乗り）
  for (let x = -88; x <= -68; x += 3) kit.lantern(x, 2.6, -84 + Math.sin(x) * 0.5, 3, "#ffffff", 0.6);
}

export function buildEastDistrict(kit: WorldKit) {
  // 大通り東の町家（南）
  for (let z = -110; z < -40; z += 10) {
    if (Math.abs(z + 61) < 5) continue;
    kit.house(12, z, 8, 7, 3.4, "w", {});
    kit.house(-13, z, 7, 7, 3.2, "e", { lit: 1 });
    if (kit.rnd() < 0.7) kit.house(28, z + 2, 9, 7, 3.2, "w", { thatch: kit.rnd() < 0.5 });
    if (kit.rnd() < 0.6) kit.house(44, z, 8, 7, 3, "n", {});
  }
  // 北東
  for (const [x, z] of [[20, 8], [34, 12], [46, 4], [22, 35], [44, 38], [14, 62], [34, 64], [-18, 42], [-26, 30]] as const) {
    kit.house(x, z, 8, 7, 3.2, kit.rnd() < 0.5 ? "s" : "w", { lit: Math.floor(kit.rnd() * 5) });
  }
  // 田んぼ
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) kit.paddies.push(rect(88 + i * 14, -120 + j * 22, 100 + i * 14, -102 + j * 22));
  kit.house(110, -70, 9, 7, 3, "s", { thatch: true });
  kit.box(86, 1.2, -95, 0.2, 2.4, 0.2, "#6b4a2e");
}

export function buildPlaza(kit: WorldKit) {
  // 御神木
  const { x, z } = PLAZA;
  kit.group("landmark", true, () => shinbokuBody(kit));
  kit.circles.push({ x, z, r: 1.4 });
  kit.circles.push({ x, z, r: 3.3 });
  // 広場の提灯柱（段階 1）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const px = x + Math.cos(a) * 14, pz = z + Math.sin(a) * 14;
    kit.group("building", false, () => {
      kit.box(px, 1.6, pz, 0.18, 3.2, 0.18, "#4a3426");
      kit.lantern(px, 3.3, pz, 1, "#ffffff", 0.9);
    });
  }
}

export function shinbokuBody(kit: WorldKit) {
  const { x, z } = PLAZA;
  kit.add({ s: "cyl", c: "#4a3628", p: [x, 2.5, z], sc: [1.6, 5, 1.6], top: 0.6 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    kit.add({ s: "sphere", c: i % 2 ? "#2c4a30" : "#365a36", p: [x + Math.cos(a) * 2.6, 6 + (i % 3) * 0.8, z + Math.sin(a) * 2.6], sc: 4.2 });
  }
  kit.add({ s: "sphere", c: "#2c4a30", p: [x, 8.2, z], sc: 4.6 });
  // しめ縄
  kit.add({ s: "torus", c: "#e6d8a8", p: [x, 2.2, z], sc: 1.9, th: 0.16 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.box(x + Math.cos(a) * 0.98, 1.85, z + Math.sin(a) * 0.98, 0.14, 0.5, 0.04, "#ffffff", kit.stat, -a);
  }
  // 石柵
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    kit.box(x + Math.cos(a) * 3.2, 0.4, z + Math.sin(a) * 3.2, 0.3, 0.8, 0.3, "#8a867c");
  }
}

export function buildStalls(kit: WorldKit) {
  for (const [x, z] of DANGO_STALLS) kit.group("building", false, () => {
    kit.box(x, 0.6, z, 3, 1.2, 1.6, "#7a5a3e");
    for (const sx of [-1.4, 1.4]) kit.box(x + sx, 1.5, z - 0.6, 0.12, 3, 0.12, "#4a3426");
    kit.roof(x, 2.9, z, 3.8, 2.4, 0.6, "#8a3a2a", true);
    kit.box(x, 2.3, z - 0.95, 3, 0.7, 0.04, "#e8e0c8");
    kit.box(x, 2.3, z - 0.98, 1.6, 0.35, 0.02, "#c83a3a");
    // 団子
    for (let i = 0; i < 3; i++) {
      kit.cyl(x - 0.8 + i * 0.8, 1.55, z, 0.04, 0.9, "#c8a060");
      kit.add({ s: "sphere", c: "#f4b8c8", p: [x - 0.8 + i * 0.8, 1.65, z], sc: 0.22 });
      kit.add({ s: "sphere", c: "#f8f4e8", p: [x - 0.8 + i * 0.8, 1.44, z], sc: 0.22 });
      kit.add({ s: "sphere", c: "#9ac87a", p: [x - 0.8 + i * 0.8, 1.23, z], sc: 0.22 });
    }
    kit.lantern(x + 1.9, 2.3, z - 0.9, 0, "#ffffff", 0.7);
    kit.collide(rect(x - 1.5, z - 0.8, x + 1.5, z + 0.8));
  });
}

export function buildStreetLamps(kit: WorldKit) {
  // 大通りの街灯（段階 1）
  for (let z = -128; z < 60; z += 12) {
    if (z > -34 && z < -8) continue;
    for (const sx of [-6, 6]) kit.group("building", false, () => {
      kit.box(sx, 1.4, z, 0.2, 2.8, 0.2, "#3a2a22");
      kit.box(sx * 0.93, 2.9, z, 1, 0.1, 0.1, "#3a2a22");
      kit.lantern(sx * 0.86, 2.45, z, z < -80 ? 0 : 1, "#ffffff", 0.7);
    });
  }
}

export function buildGarlands(kit: WorldKit) {
  // 祭りの提灯（段階 3）
  for (let z = -110; z < 60; z += 14) {
    if (z > -34 && z < -8) continue;
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const x = -5 + t * 10;
      kit.lantern(x, 4.3 - Math.sin(Math.PI * t) * 0.8, z + 6, 3, "#ffffff", 0.55);
    }
    kit.group("building", false, () => kit.box(0, 4.6, z + 6, 11, 0.04, 0.04, "#2a2020"));
  }
  for (let x = -100; x < 50; x += 3) {
    if (Math.abs(x) < 6) continue;
    kit.lantern(x, 4.1 + Math.sin(x * 0.5) * 0.2, -20, 3, "#ffffff", 0.5);
  }
  kit.group("building", false, () => kit.box(-25, 4.5, -20, 150, 0.04, 0.04, "#2a2020"));
  // 百鬼夜行の大行灯（段階 4）：参道と大通りに大きな灯り
  for (let z = -120; z < 60; z += 20) {
    for (const sx of [-8.5, 8.5]) {
      kit.group("building", false, () => {
        kit.box(sx, 1.2, z + 3, 0.9, 2.4, 0.9, "#3a2a22");
        kit.box(sx, 3.0, z + 3, 1.3, 1.4, 1.3, "#ffffff", kit.lamps[4]);
      });
      kit.circles.push({ x: sx, z: z + 3, r: 0.8 });
    }
  }
}
