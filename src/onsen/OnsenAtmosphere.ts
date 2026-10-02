import {
  Color3, Color4, DirectionalLight, DynamicTexture, GlowLayer, HemisphericLight, Mesh, type InstancedMesh, MeshBuilder, PointLight, Scene, StandardMaterial, Texture, Vector3,
} from "../core/babylon";
import { ONSEN_FALL, ONSEN_MOON, ONSEN_POND, ONSEN_POOLS, type ORect } from "../data/onsenMap";
import type { Materials } from "../world/Materials";
import type { OnsenWorld } from "./OnsenWorld";

/** 湯煙・湯に浮かぶ灯籠・夜空へ昇る灯りの数（画質：軽量は減らす） */
const STEAM = { normal: 16, low: 6 };
const FLOATERS = { normal: 4, low: 2 };
const SKY_LIGHTS = { normal: 10, low: 4 };

interface Puff {
  mesh: Mesh;
  x: number;
  z: number;
  y0: number;
  t: number;
  life: number;
  /** 内湯の湯煙（二階を見せている間は、床を突き抜けないよう隠す） */
  indoor: boolean;
}

/**
 * 宿の空気：夜の藍・行灯の橙・月光。湯の水面（ゆっくり流れる波紋・半透明）、ときどき広がる水面の輪、
 * 少数の湯煙（板ポリ）、月と滝の水。重いシェーダーや大量の粒子は使わない（スマホ・軽量画質を優先）。
 */
export class OnsenAtmosphere {
  glow: GlowLayer;
  private water: StandardMaterial;
  private fall: StandardMaterial;
  private puffs: Puff[] = [];
  private rings: { mesh: Mesh; t: number }[] = [];
  private ringT = 1.5;
  /** 今見えている湯（奥庭が閉じていれば月見の湯を除く。openInner で加わる） */
  private pools = ONSEN_POOLS;
  /** 月見の奥庭の湯・滝・湯煙・浮かぶ灯籠（奥庭が開くまで消しておく） */
  private innerParts: { setEnabled(v: boolean): void }[] = [];
  lantern: PointLight;
  /** 湯に浮かぶ小さな灯籠（ゆっくり漂う） */
  private floaters: { mesh: InstancedMesh; x: number; z: number; y: number; r: ORect; ph: number }[] = [];
  /** 夜空へゆっくり昇っていく灯り（宿の向こう） */
  private sky: { mesh: InstancedMesh; x: number; z: number; y: number; v: number; ph: number }[] = [];

  constructor(private scene: Scene, world: OnsenWorld, mats: Materials, low: boolean) {
    scene.clearColor = new Color4(0.035, 0.04, 0.09, 1);
    scene.ambientColor = new Color3(0.28, 0.25, 0.3);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = new Color3(0.07, 0.07, 0.14);
    scene.fogDensity = 0.007;
    const hemi = new HemisphericLight("onsenHemi", new Vector3(0.1, 1, -0.3), scene);
    hemi.intensity = 0.6;
    hemi.diffuse = new Color3(0.72, 0.66, 0.78);
    hemi.groundColor = new Color3(0.2, 0.14, 0.12);
    hemi.specular = new Color3(0, 0, 0);
    const moon = new DirectionalLight("onsenMoon", new Vector3(-0.3, -0.7, -0.65), scene);
    moon.intensity = 0.45;
    moon.diffuse = new Color3(0.72, 0.78, 1);
    this.lantern = new PointLight("onsenLantern", new Vector3(0, 2, 0), scene);
    this.lantern.diffuse = new Color3(1, 0.7, 0.42);
    this.lantern.intensity = 1.1;
    this.lantern.range = 10;

    this.glow = new GlowLayer("onsenGlow", scene, { mainTextureRatio: low ? 0.35 : 0.5, blurKernelSize: 40 });
    this.glow.intensity = 0.75;
    this.glow.customEmissiveColorSelector = (_mesh, _sub, material, result) => {
      if (mats.isGlow(material)) {
        const c = (material as StandardMaterial).emissiveColor;
        result.set(c.r, c.g, c.b, 1);
      } else result.set(0, 0, 0, 0);
    };

    // 湯の水面：暖かい湯の色・半透明・波紋の模様をゆっくり流す
    this.water = new StandardMaterial("onsenWater", scene);
    this.water.diffuseColor = new Color3(0.36, 0.58, 0.6);
    this.water.emissiveColor = new Color3(0.1, 0.17, 0.2);
    this.water.specularColor = new Color3(0.35, 0.35, 0.32);
    this.water.specularPower = 48;
    this.water.alpha = 0.82;
    // 凹凸（bump）は照り方が強く出て縞に見えるので使わず、淡いゆらぎの模様を色に乗せて流す
    this.water.diffuseTexture = rippleTexture(scene);
    const isInner = (p: { id: string }) => p.id === "tsukiyu";
    this.pools = ONSEN_POOLS.filter((p) => !isInner(p) || world.innerOpen);
    for (const p of ONSEN_POOLS) {
      const m = this.surface(p.r, p.y);
      if (isInner(p)) this.innerParts.push(m);
      for (let i = 0; i < 3; i++) this.rings.push({ mesh: this.ring(), t: 1 });
    }
    const pond = new StandardMaterial("onsenPond", scene);
    pond.diffuseColor = new Color3(0.08, 0.14, 0.2);
    pond.emissiveColor = new Color3(0.03, 0.06, 0.1);
    pond.specularColor = new Color3(0.9, 0.9, 1);
    pond.alpha = 0.9;
    pond.diffuseTexture = this.water.diffuseTexture;
    this.surface(ONSEN_POND, 0.12, pond);

    // 湯煙（屋外の湯を多めに）
    const n = low ? STEAM.low : STEAM.normal;
    const pools = ONSEN_POOLS.filter((p) => !isInner(p));
    const steamMat = new StandardMaterial("onsenSteam", scene);
    steamMat.diffuseTexture = puffTexture(scene);
    steamMat.diffuseTexture.hasAlpha = true;
    steamMat.useAlphaFromDiffuseTexture = true;
    steamMat.emissiveColor = new Color3(0.75, 0.75, 0.78);
    steamMat.disableLighting = true;
    steamMat.backFaceCulling = false;
    const tsukiyu = ONSEN_POOLS.find(isInner)!;
    const innerSteam = low ? 1 : 3;
    for (let i = 0; i < n + innerSteam; i++) {
      const p = i < n ? pools[i % pools.length] : tsukiyu;
      const m = MeshBuilder.CreatePlane("steam", { size: 1 }, scene);
      if (i >= n) this.innerParts.push(m);
      m.billboardMode = Mesh.BILLBOARDMODE_ALL;
      m.material = steamMat;
      m.isPickable = false;
      m.visibility = 0;
      const x = p.r.x0 + 1 + Math.random() * (p.r.x1 - p.r.x0 - 2), z = p.r.z0 + 1 + Math.random() * (p.r.z1 - p.r.z0 - 2);
      this.puffs.push({ mesh: m, x, z, y0: p.y, t: Math.random() * 6, life: 5 + Math.random() * 3, indoor: !!p.indoor });
    }

    // 湯に浮かぶ灯籠（屋外の湯）と、夜空へ昇る灯り：灯りの材質（にじむ）の複製で描く
    const tpl = MeshBuilder.CreateBox("onsenFloater", { size: 1 }, scene);
    tpl.material = mats.glow.warm;
    tpl.isVisible = false;
    for (const p of ONSEN_POOLS.filter((q) => !q.indoor)) {
      for (let i = 0; i < (low ? FLOATERS.low : FLOATERS.normal); i++) {
        const m = tpl.createInstance("floater");
        if (isInner(p)) this.innerParts.push(m);
        m.scaling.set(0.34, 0.26, 0.34);
        m.isPickable = false;
        this.floaters.push({ mesh: m, x: p.r.x0 + 1.5 + Math.random() * (p.r.x1 - p.r.x0 - 3), z: p.r.z0 + 1.5 + Math.random() * (p.r.z1 - p.r.z0 - 3), y: p.y + 0.12, r: p.r, ph: Math.random() * 6 });
      }
    }
    const orb = MeshBuilder.CreateSphere("onsenSkyLight", { diameter: 1, segments: 4 }, scene);
    orb.material = mats.glow.warm;
    orb.isVisible = false;
    for (let i = 0; i < (low ? SKY_LIGHTS.low : SKY_LIGHTS.normal); i++) {
      const m = orb.createInstance("skyLight");
      m.scaling.set(0.7, 0.9, 0.7);
      m.isPickable = false;
      this.sky.push({ mesh: m, x: -40 + Math.random() * 90, z: 60 + Math.random() * 40, y: Math.random() * 40, v: 0.5 + Math.random() * 0.6, ph: Math.random() * 6 });
    }

    // 月
    const moonMat = new StandardMaterial("onsenMoonMat", scene);
    moonMat.emissiveColor = new Color3(1, 0.96, 0.82);
    moonMat.disableLighting = true;
    moonMat.fogEnabled = false;
    const disc = MeshBuilder.CreateDisc("onsenMoonDisc", { radius: 7, tessellation: 40 }, scene);
    disc.position.set(ONSEN_MOON.x, ONSEN_MOON.y, ONSEN_MOON.z);
    disc.billboardMode = Mesh.BILLBOARDMODE_ALL;
    disc.material = moonMat;
    disc.isPickable = false;

    // 滝の水（月見の奥庭）
    this.fall = new StandardMaterial("onsenFall", scene);
    this.fall.diffuseTexture = streakTexture(scene);
    this.fall.emissiveColor = new Color3(0.55, 0.62, 0.7);
    this.fall.alpha = 0.75;
    this.fall.backFaceCulling = false;
    const w = MeshBuilder.CreatePlane("onsenFallWater", { width: 2.4, height: 5 }, scene);
    w.position.set(ONSEN_FALL.x, 2.4, ONSEN_FALL.z + 0.3);
    w.material = this.fall;
    w.isPickable = false;
    this.innerParts.push(w);
    for (const m of this.innerParts) m.setEnabled(world.innerOpen);
  }

  /** 訪問の途中で月見の奥庭が開いた：月見の湯・滝・湯煙・浮かぶ灯籠を出す */
  openInner() {
    for (const m of this.innerParts) m.setEnabled(true);
    this.pools = ONSEN_POOLS;
  }

  private surface(r: ORect, y: number, mat = this.water) {
    const m = MeshBuilder.CreateGround("onsenSurface", { width: r.x1 - r.x0, height: r.z1 - r.z0 }, this.scene);
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.material = mat;
    m.isPickable = false;
    return m;
  }

  private ring() {
    const m = MeshBuilder.CreateTorus("onsenRing", { diameter: 1, thickness: 0.04, tessellation: 24 }, this.scene);
    const mat = new StandardMaterial("onsenRingMat", this.scene);
    mat.emissiveColor = new Color3(0.8, 0.85, 0.85);
    mat.disableLighting = true;
    m.material = mat;
    m.isPickable = false;
    m.setEnabled(false);
    return m;
  }

  /** 湯に入った・湯の中を歩いた：主人公のまわりに水面の輪 */
  ripple(x: number, z: number) {
    const free = this.rings.find((r) => r.t >= 1);
    if (!free) return;
    free.t = 0;
    free.mesh.position.set(x, 0.32, z);
    free.mesh.setEnabled(true);
  }

  /** 二階より上を見せている間は、内湯の湯煙を隠す（二階の床を突き抜けないように） */
  setUpperShown(v: boolean) {
    this.upperShown = v;
    for (const p of this.puffs) if (p.indoor) p.mesh.setEnabled(!v);
  }
  private upperShown = false;

  update(dt: number, t: number, player: { x: number; y: number; z: number }) {
    const ripple = this.water.diffuseTexture as Texture;
    ripple.uOffset = t * 0.012;
    ripple.vOffset = t * 0.02;
    (this.fall.diffuseTexture as Texture).vOffset = t * 0.9;
    this.lantern.position.set(player.x, player.y + 2.2, player.z);
    for (const p of this.puffs) {
      if (p.indoor && this.upperShown) continue;
      p.t += dt;
      if (p.t > p.life) p.t -= p.life;
      const k = p.t / p.life;
      p.mesh.position.set(p.x + Math.sin(t * 0.3 + p.x) * 0.4 * k, p.y0 + 0.3 + k * 3, p.z);
      p.mesh.scaling.setAll(1.2 + k * 2.4);
      p.mesh.visibility = Math.sin(k * Math.PI) * 0.35;
    }
    // ときどき水面に輪が広がる
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 1.2 + Math.random() * 2.5;
      const free = this.rings.find((r) => r.t >= 1);
      if (free) {
        const p = this.pools[Math.floor(Math.random() * this.pools.length)];
        free.t = 0;
        free.mesh.position.set(p.r.x0 + 1 + Math.random() * (p.r.x1 - p.r.x0 - 2), p.y + 0.02, p.r.z0 + 1 + Math.random() * (p.r.z1 - p.r.z0 - 2));
        free.mesh.setEnabled(true);
      }
    }
    for (const f of this.floaters) {
      // 湯の上をゆっくり漂い、縁に近づいたら向きを変える
      f.x += Math.sin(t * 0.05 + f.ph) * dt * 0.25;
      f.z += Math.cos(t * 0.04 + f.ph * 1.3) * dt * 0.25;
      f.x = Math.min(Math.max(f.x, f.r.x0 + 1), f.r.x1 - 1);
      f.z = Math.min(Math.max(f.z, f.r.z0 + 1), f.r.z1 - 1);
      f.mesh.position.set(f.x, f.y + Math.sin(t * 1.2 + f.ph) * 0.03, f.z);
      f.mesh.rotation.y = t * 0.1 + f.ph;
    }
    for (const l of this.sky) {
      l.y += l.v * dt;
      if (l.y > 55) l.y = 0;
      l.mesh.position.set(l.x + Math.sin(t * 0.2 + l.ph) * 1.5, 8 + l.y, l.z);
      // 複製ごとの透明度は持てないので、現れる・消えるは大きさで
      const k = Math.min(1, l.y / 6) * Math.min(1, (55 - l.y) / 10);
      l.mesh.scaling.set(0.7 * k, 0.9 * k, 0.7 * k);
    }
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / 2.2);
      r.mesh.scaling.set(0.3 + r.t * 2.2, 1, 0.3 + r.t * 2.2);
      r.mesh.visibility = (1 - r.t) * 0.5;
      if (r.t >= 1) r.mesh.setEnabled(false);
    }
  }
}

/** 湯のゆらぎ（やわらかい明暗の斑。色に掛ける） */
function rippleTexture(scene: Scene) {
  const tex = new DynamicTexture("onsenRipple", { width: 256, height: 256 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#d8d8d8";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const x = (i * 97) % 256, y = (i * 53 + (i % 7) * 11) % 256, rad = 12 + (i % 5) * 7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = i % 2 ? "255,255,255" : "0,0,0";
    g.addColorStop(0, `rgba(${c},0.12)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  tex.update();
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = tex.vScale = 2;
  return tex;
}

/** 湯煙（ふんわりした白い丸） */
function puffTexture(scene: Scene) {
  const tex = new DynamicTexture("onsenPuff", { width: 64, height: 64 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  return tex;
}

/** 滝の筋 */
function streakTexture(scene: Scene) {
  const tex = new DynamicTexture("onsenStreak", { width: 64, height: 128 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#8ea2b0";
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + (i % 4) * 0.15})`;
    ctx.fillRect((i * 29) % 64, (i * 41) % 128, 2 + (i % 3), 18 + (i % 5) * 6);
  }
  tex.update();
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}
