import { Color3, FresnelParameters, Scene, StandardMaterial, Material } from "../core/babylon";
import type { GlowKind } from "../characters/models";

/** 共有マテリアル。頂点カラー＋少数のマテリアルで描画バッチを減らす。 */
export class Materials {
  char: StandardMaterial;
  static: StandardMaterial;
  glow: Record<GlowKind, StandardMaterial>;
  lanternOff: StandardMaterial;
  shadow: StandardMaterial;
  private glowSet = new Set<Material>();

  constructor(scene: Scene) {
    this.char = new StandardMaterial("char", scene);
    this.char.diffuseColor = new Color3(1, 1, 1);
    this.char.specularColor = new Color3(0.08, 0.08, 0.1);
    this.char.emissiveColor = new Color3(1, 1, 1);
    // 月明かりの縁取り（リムライト）
    this.char.emissiveFresnelParameters = new FresnelParameters({
      leftColor: new Color3(0.42, 0.4, 0.62),
      rightColor: new Color3(0.13, 0.11, 0.16),
      power: 2.2,
      bias: 0.05,
    });

    this.static = new StandardMaterial("static", scene);
    this.static.diffuseColor = new Color3(1, 1, 1);
    this.static.specularColor = new Color3(0.02, 0.02, 0.03);
    this.static.emissiveColor = new Color3(0.07, 0.07, 0.11);

    const mk = (name: string, c: Color3) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = new Color3(0, 0, 0);
      m.specularColor = new Color3(0, 0, 0);
      m.emissiveColor = c;
      this.glowSet.add(m);
      return m;
    };
    this.glow = {
      warm: mk("glowWarm", new Color3(1, 0.62, 0.3)),
      cool: mk("glowCool", new Color3(0.5, 0.85, 1)),
      red: mk("glowRed", new Color3(1, 0.32, 0.28)),
      violet: mk("glowViolet", new Color3(0.78, 0.5, 1)),
    };

    this.lanternOff = new StandardMaterial("lanternOff", scene);
    this.lanternOff.diffuseColor = new Color3(0.62, 0.56, 0.46);
    this.lanternOff.specularColor = new Color3(0, 0, 0);
    this.lanternOff.emissiveColor = new Color3(0.1, 0.09, 0.08);

    this.shadow = new StandardMaterial("blob", scene);
    this.shadow.diffuseColor = new Color3(0, 0, 0);
    this.shadow.specularColor = new Color3(0, 0, 0);
    this.shadow.emissiveColor = new Color3(0.02, 0.02, 0.05);
    this.shadow.alpha = 0.4;
    this.shadow.disableLighting = true;
  }

  /** 追加の発光マテリアル（街の灯りなど） */
  makeGlow(scene: Scene, name: string, c: Color3) {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(0, 0, 0);
    m.specularColor = new Color3(0, 0, 0);
    m.emissiveColor = c;
    this.glowSet.add(m);
    return m;
  }
  isGlow(m: Material | null | undefined) {
    return !!m && this.glowSet.has(m);
  }
}
