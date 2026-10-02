import { Color3, Color4, DirectionalLight, GlowLayer, HemisphericLight, PointLight, Scene, StandardMaterial, Vector3 } from "../core/babylon";
import type { StageDef } from "../data/stages";
import type { World } from "../world/World";
import type { Materials } from "../world/Materials";
import { damp, lerp } from "../core/util";

/**
 * 街の空気（仕様 12.2・25章）。夜行位に応じて灯りが増え、霧が温かくなり、門が開く。
 */
export class WorldAtmosphereDirector {
  hemi: HemisphericLight;
  moonLight: DirectionalLight;
  lantern: PointLight;
  glow: GlowLayer;
  private fogTarget = new Color3(0.06, 0.06, 0.13);
  private fogDensityTarget = 0.009;
  private lightRange = 11;
  private glowTarget = 0.8;
  private warm = 0;
  private warmNow = 0;
  private gateT = -1;
  dawn = 0;
  /** 花火で空がほんのり明るむ */
  private flashV = 0;

  constructor(private scene: Scene, private world: World, mats: Materials) {
    this.hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
    this.hemi.intensity = 0.62;
    this.hemi.diffuse = new Color3(0.55, 0.6, 0.95);
    this.hemi.groundColor = new Color3(0.14, 0.1, 0.2);
    this.hemi.specular = new Color3(0, 0, 0);

    this.moonLight = new DirectionalLight("moon", new Vector3(0.45, -0.8, -0.6), scene);
    this.moonLight.intensity = 0.55;
    this.moonLight.diffuse = new Color3(0.75, 0.8, 1);
    this.moonLight.specular = new Color3(0.5, 0.55, 0.7);

    this.lantern = new PointLight("playerLantern", new Vector3(0, 2, 0), scene);
    this.lantern.diffuse = new Color3(1, 0.68, 0.38);
    this.lantern.specular = new Color3(0.2, 0.12, 0.05);
    this.lantern.intensity = 1.3;
    this.lantern.range = 11;

    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = this.fogTarget.clone();
    scene.fogDensity = this.fogDensityTarget;
    scene.clearColor = new Color4(0.03, 0.03, 0.07, 1);
    scene.ambientColor = new Color3(0.25, 0.25, 0.3);

    this.glow = new GlowLayer("glow", scene, { mainTextureRatio: 0.5, blurKernelSize: 48 });
    this.glow.intensity = 0.8;
    this.glow.customEmissiveColorSelector = (_mesh, _sub, material, result) => {
      if (mats.isGlow(material)) {
        const c = (material as StandardMaterial).emissiveColor;
        result.set(c.r, c.g, c.b, 1);
      } else result.set(0, 0, 0, 0);
    };
    world.setLanternLevel(0);
  }

  applyStage(s: StageDef) {
    this.world.setLanternLevel(s.lanternLevel);
    this.lightRange = s.playerLight;
    const warm = s.lanternLevel / 4;
    this.warm = warm;
    this.fogTarget = new Color3(lerp(0.06, 0.16, warm), lerp(0.06, 0.08, warm), lerp(0.13, 0.12, warm));
    this.fogDensityTarget = lerp(0.009, 0.0045, warm);
    this.glowTarget = lerp(0.8, 1.15, warm);
  }

  flash(k: number) {
    this.flashV = Math.min(0.2, this.flashV + k);
  }

  openGate() {
    this.gateT = 0;
    this.world.openYokocho();
  }

  update(dt: number, t: number, px: number, py: number, pz: number, night: number) {
    const sc = this.scene;
    // 夜明けに向けて空が白む（最後の 12%）
    this.dawn = Math.max(0, (night - 0.88) / 0.12);
    const d = this.dawn;
    const fogC = Color3.Lerp(this.fogTarget, new Color3(0.55, 0.45, 0.5), d);
    sc.fogColor.r = damp(sc.fogColor.r, fogC.r, 1, dt);
    sc.fogColor.g = damp(sc.fogColor.g, fogC.g, 1, dt);
    sc.fogColor.b = damp(sc.fogColor.b, fogC.b, 1, dt);
    sc.fogDensity = damp(sc.fogDensity, this.fogDensityTarget * (1 - d * 0.4), 1, dt);
    sc.clearColor.set(sc.fogColor.r * 0.5, sc.fogColor.g * 0.5, sc.fogColor.b * 0.6, 1);
    // 祭りが進むほど町の灯りが空気を温める
    const w = (this.warmNow = damp(this.warmNow, this.warm, 0.8, dt));
    const nightC = Color3.Lerp(new Color3(0.55, 0.6, 0.95), new Color3(0.85, 0.66, 0.7), w);
    this.flashV = damp(this.flashV, 0, 4, dt);
    this.hemi.intensity = lerp(lerp(0.62, 0.82, w), 1.0, d) + this.flashV;
    this.hemi.diffuse = Color3.Lerp(nightC, new Color3(1, 0.85, 0.8), d);
    const skyMat = this.world.sky.material as StandardMaterial;
    if (skyMat.emissiveTexture) skyMat.emissiveTexture.level = 1 - d * 0.75;
    skyMat.emissiveColor = new Color3(0.9 * d, 0.55 * d, 0.45 * d);
    // 月は夜の進行とともに西へ傾く
    const ma = -0.6 + night * 1.6;
    this.world.moon.position.set(Math.sin(ma) * 520, 380 - night * 260, Math.cos(ma) * 420);

    this.lantern.position.set(px, py + 2.2, pz);
    this.lantern.range = damp(this.lantern.range, this.lightRange, 1.5, dt);
    this.lantern.intensity = 1.3 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13.3) * 0.04;
    this.glow.intensity = damp(this.glow.intensity, this.glowTarget * (1 - d * 0.5), 1, dt);

    if (this.gateT >= 0 && this.gateT < 1) {
      this.gateT = Math.min(1, this.gateT + dt / 2.2);
      const e = 1 - Math.pow(1 - this.gateT, 3);
      this.world.setGateOpen(e);
    }
  }
}
