import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode } from "../../core/babylon";
import { BRIDGES, DANGO_STALLS, GRAVEYARD, PLAZA, RIVER, SHRINE, TEMPLE, TORII_PATH, WORLD, YOKOCHO, inRect, rect } from "../../data/map";
import { paintGround } from "../MapPainter";
import { buildPart } from "../../characters/PartBuilder";
import type { Part } from "../../characters/models";
import type { WorldKit } from "../WorldKit";

/**
 * 自然と空：川と橋・林・外周の森・地面のテクスチャ・夜空と月。
 * WorldKit の部品（家・屋根・鳥居・木・提灯…）で組み立てる。呼ぶ順番は World.build（町の乱数の並びが変わらないように）。
 */

export function buildRiver(kit: WorldKit) {
  // 水面
  const water = MeshBuilder.CreateGround("water", { width: RIVER.x1 - RIVER.x0, height: RIVER.z1 - RIVER.z0 }, kit.scene);
  water.position.set((RIVER.x0 + RIVER.x1) / 2, 0.06, (RIVER.z0 + RIVER.z1) / 2);
  const wm = new StandardMaterial("water", kit.scene);
  wm.diffuseColor = new Color3(0.08, 0.16, 0.26);
  wm.specularColor = new Color3(0.9, 0.9, 1);
  wm.specularPower = 64;
  wm.emissiveColor = new Color3(0.03, 0.07, 0.12);
  wm.alpha = 0.92;
  const tex = new DynamicTexture("ripple", { width: 256, height: 256 }, kit.scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = `rgba(${kit.rnd() < 0.5 ? "255,255,255" : "0,0,0"},0.25)`;
    ctx.lineWidth = 1 + kit.rnd() * 2;
    const x = kit.rnd() * 256, y = kit.rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 10, y + 3, x + 20, y - 3, x + 30, y);
    ctx.stroke();
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = 3;
  tex.vScale = 30;
  wm.bumpTexture = tex;
  wm.bumpTexture.level = 0.35;
  water.material = wm;
  water.isPickable = false;
  kit.water = wm;
  kit.collide(rect(RIVER.x0 + 0.5, WORLD.minZ, RIVER.x1 - 0.5, WORLD.maxZ));

  // 橋
  for (const b of BRIDGES) {
    const col = b.red ? "#c83a28" : "#6a4a32";
    const L = b.r.x1 - b.r.x0;
    const W = b.r.z1 - b.r.z0;
    const cz = (b.r.z0 + b.r.z1) / 2;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const x0 = b.r.x0 + t0 * L, x1 = b.r.x0 + t1 * L;
      const y0 = Math.sin(Math.PI * t0) * b.arch, y1 = Math.sin(Math.PI * t1) * b.arch;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      kit.add({ s: "box", c: "#7a5a3e", p: [(x0 + x1) / 2, (y0 + y1) / 2 - 0.1, cz], sc: [len + 0.05, 0.25, W], r: [0, 0, ang] });
      for (const sz of [-1, 1]) {
        kit.add({ s: "box", c: col, p: [(x0 + x1) / 2, (y0 + y1) / 2 + 0.95, cz + sz * (W / 2 - 0.1)], sc: [len + 0.05, 0.14, 0.14], r: [0, 0, ang] });
        kit.box(x0, y0 + 0.5, cz + sz * (W / 2 - 0.1), 0.2, 1, 0.2, col);
      }
    }
    if (b.red) {
      for (const sx of [b.r.x0 + 1, b.r.x1 - 1]) for (const sz of [-1, 1]) kit.lantern(sx, 1.8, cz + sz * (W / 2 + 0.2), 1, "#ffffff", 0.7);
    }
  }
  // 川辺のすすき
  for (let i = 0; i < 90; i++) {
    const side = kit.rnd() < 0.5 ? RIVER.x0 - 1.2 - kit.rnd() * 2.5 : RIVER.x1 + 1.2 + kit.rnd() * 2.5;
    const z = WORLD.minZ + 5 + kit.rnd() * (WORLD.maxZ - WORLD.minZ - 10);
    if (BRIDGES.some((b) => inRect(b.r, side, z, 3))) continue;
    for (let k = 0; k < 3; k++) {
      kit.add({ s: "cyl", c: "#b8a878", p: [side + (kit.rnd() - 0.5), 0.7, z + (kit.rnd() - 0.5)], sc: [0.05, 1.4, 0.05], r: [(kit.rnd() - 0.5) * 0.5, 0, (kit.rnd() - 0.5) * 0.5] });
    }
    kit.add({ s: "sphere", c: "#e0d4b0", p: [side, 1.45, z], sc: [0.3, 0.5, 0.3] });
  }

  // 妖怪船（層：yokaiBoat で出現）
  kit.boat = new TransformNode("boat", kit.scene);
  const hull: Mesh[] = [];
  const add = (p: Part, glow = false) => {
    const m = buildPart(kit.scene, p, true);
    m.material = glow ? kit.glowWarm : kit.mats.static;
    hull.push(m);
  };
  add({ s: "box", c: "#5a3a26", p: [0, 0.45, 0], sc: [3.2, 0.5, 7] });
  add({ s: "box", c: "#4a2e1e", p: [0, 0.6, 3.7], sc: [2.2, 0.7, 1], r: [0.4, 0, 0] });
  add({ s: "box", c: "#4a2e1e", p: [0, 0.6, -3.7], sc: [2.2, 0.7, 1], r: [-0.4, 0, 0] });
  add({ s: "box", c: "#a02a24", p: [0, 0.75, 0], sc: [3.3, 0.12, 7.1] });
  for (const [lx, lz] of [[-1.4, -3], [1.4, -3], [-1.4, 3], [1.4, 3]]) {
    add({ s: "cyl", c: "#3a2418", p: [lx, 1.8, lz], sc: [0.08, 2.4, 0.08] });
    add({ s: "sphere", c: "#ffffff", p: [lx, 3.1, lz], sc: [0.55, 0.75, 0.55] }, true);
  }
  add({ s: "cyl", c: "#3a2418", p: [0, 3, 0], sc: [0.14, 5, 0.14] });
  add({ s: "box", c: "#e8dcc4", p: [0, 3.8, 0.3], sc: [2.8, 2.6, 0.06] });
  const boatMesh = Mesh.MergeMeshes(hull, true, true, undefined, false, true)!;
  boatMesh.parent = kit.boat;
  kit.boat.position.set(68, 0, 15);
  kit.boat.setEnabled(false);
}

export function buildNature(kit: WorldKit) {
  const kinds: ("momiji" | "pine" | "ginkgo")[] = ["momiji", "momiji", "pine", "ginkgo"];
  const clear = (x: number, z: number) => {
    if (inRect(RIVER, x, z, 4)) return false;
    if (kit.houses.some((h) => inRect(h, x, z, 3))) return false;
    if (Math.abs(x) < 9 && z < 110) return false;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2) return false;
    if (Math.abs(z + 20) < 7 && x > -110) return false;
    if (inRect(YOKOCHO, x, z, 4) || x < -106) return false;
    if (inRect(GRAVEYARD, x, z, 2)) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 16) return false;
    if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 16) return false;
    if (TORII_PATH.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) return false;
    if (DANGO_STALLS.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5)) return false;
    if (kit.paddies.some((p) => inRect(p, x, z, 2))) return false;
    if (Math.abs(z - 50) < 6 && x > 0 && x < 100) return false;
    if (Math.abs(z + 67) < 5 && x < 0) return false;
    if (Math.abs(z + 61) < 5 && x > 15 && x < 60) return false;
    if ((Math.abs(x + 63) < 4 || Math.abs(x + 93) < 4) && z < -20) return false;
    if (Math.abs(z - 15) < 5 && x < 0 && x > -62) return false;
    return true;
  };
  // 林（狸の住処）
  for (const [cx, cz, n] of [[30, 95, 14], [-30, 95, 12], [112, 20, 14], [40, -128, 8], [-40, -128, 8], [120, 60, 10], [-60, 110, 14]] as const) {
    for (let i = 0; i < n; i++) {
      const a = kit.rnd() * Math.PI * 2, r = 5 + kit.rnd() * 10;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (clear(x, z)) kit.tree(x, z, kinds[Math.floor(kit.rnd() * kinds.length)], 0.9 + kit.rnd() * 0.5);
    }
  }
  // 町の中の点在する木
  for (let i = 0; i < 90; i++) {
    const x = WORLD.minX + 50 + kit.rnd() * (WORLD.maxX - WORLD.minX - 55);
    const z = WORLD.minZ + 5 + kit.rnd() * (WORLD.maxZ - WORLD.minZ - 10);
    if (clear(x, z)) kit.tree(x, z, kinds[Math.floor(kit.rnd() * kinds.length)], 0.8 + kit.rnd() * 0.5);
  }
}

export function buildBoundary(kit: WorldKit) {
  // 外周の山と森
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const per = 2 * (WORLD.maxX - WORLD.minX + WORLD.maxZ - WORLD.minZ);
    let d = t * per;
    let x: number, z: number;
    const W = WORLD.maxX - WORLD.minX, H = WORLD.maxZ - WORLD.minZ;
    if (d < W) { x = WORLD.minX + d; z = WORLD.minZ - 6; }
    else if ((d -= W) < H) { x = WORLD.maxX + 6; z = WORLD.minZ + d; }
    else if ((d -= H) < W) { x = WORLD.maxX - d; z = WORLD.maxZ + 6; }
    else { d -= W; x = WORLD.minX - 6; z = WORLD.maxZ - d; }
    kit.add({ s: "sphere", c: kit.rnd() < 0.5 ? "#1e2e26" : "#26362c", p: [x, 2, z], sc: [22 + kit.rnd() * 10, 12 + kit.rnd() * 14, 22 + kit.rnd() * 10] });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    kit.add({ s: "cyl", c: "#1a2430", p: [Math.cos(a) * 330, 0, Math.sin(a) * 330], sc: [160, 70 + kit.rnd() * 60, 160], top: 0.1 });
  }
}

export function buildGround(kit: WorldKit) {
  kit.groundCanvas = paintGround({ houses: kit.houses, paddies: kit.paddies });
  const W = WORLD.maxX - WORLD.minX, H = WORLD.maxZ - WORLD.minZ;
  const g = MeshBuilder.CreateGround("ground", { width: W, height: H }, kit.scene);
  g.position.set((WORLD.minX + WORLD.maxX) / 2, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  const tex = new DynamicTexture("groundTex", kit.groundCanvas, kit.scene, true);
  kit.groundTex = tex;
  tex.update(true);
  tex.anisotropicFilteringLevel = 8;
  const m = new StandardMaterial("groundMat", kit.scene);
  m.diffuseTexture = tex;
  m.specularColor = new Color3(0, 0, 0);
  m.emissiveColor = new Color3(0.05, 0.05, 0.08);
  g.material = m;
  g.isPickable = false;
  g.receiveShadows = false;
  // 外側の地面
  const outer = MeshBuilder.CreateGround("outer", { width: 900, height: 900 }, kit.scene);
  outer.position.y = -0.05;
  const om = new StandardMaterial("outerMat", kit.scene);
  om.diffuseColor = new Color3(0.12, 0.16, 0.13);
  om.specularColor = new Color3(0, 0, 0);
  outer.material = om;
  outer.isPickable = false;
}

export function buildSky(kit: WorldKit) {
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 1400, segments: 16, sideOrientation: Mesh.BACKSIDE }, kit.scene);
  const tex = new DynamicTexture("skyTex", { width: 1024, height: 512 }, kit.scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const grd = ctx.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, "#05060f");
  grd.addColorStop(0.35, "#0d1230");
  grd.addColorStop(0.5, "#27264a");
  grd.addColorStop(0.56, "#3a2e4a");
  grd.addColorStop(1, "#0a0a14");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 900; i++) {
    const y = kit.rnd() * 250;
    const a = 0.3 + kit.rnd() * 0.7;
    ctx.fillStyle = `rgba(255,${240 + Math.floor(kit.rnd() * 15)},${210 + Math.floor(kit.rnd() * 45)},${a * (1 - y / 260)})`;
    const s = kit.rnd() < 0.06 ? 2 : 1;
    ctx.fillRect(kit.rnd() * 1024, y, s, s);
  }
  // 天の川
  for (let i = 0; i < 2500; i++) {
    const t = kit.rnd();
    const x = t * 1024;
    const y = 60 + Math.sin(t * Math.PI * 2) * 60 + (kit.rnd() - 0.5) * 50;
    ctx.fillStyle = `rgba(200,200,255,${kit.rnd() * 0.18})`;
    ctx.fillRect(x, y, 1, 1);
  }
  tex.update();
  const sm = new StandardMaterial("skyMat", kit.scene);
  sm.emissiveTexture = tex;
  sm.diffuseColor = new Color3(0, 0, 0);
  sm.specularColor = new Color3(0, 0, 0);
  sm.disableLighting = true;
  sm.fogEnabled = false;
  sm.backFaceCulling = false;
  sky.material = sm;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  kit.sky = sky;

  const moon = MeshBuilder.CreateDisc("moon", { radius: 26, tessellation: 40 }, kit.scene);
  const mm = kit.mats.makeGlow(kit.scene, "moonMat", new Color3(1, 0.95, 0.8));
  mm.fogEnabled = false;
  moon.material = mm;
  moon.billboardMode = Mesh.BILLBOARDMODE_ALL;
  moon.position.set(-260, 330, 420);
  moon.isPickable = false;
  kit.moon = moon;
}
