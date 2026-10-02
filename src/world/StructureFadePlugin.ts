import {
  MaterialPluginBase, RawTexture, Texture, type AbstractEngine, type Material, type Scene, type SubMesh, type UniformBuffer,
} from "../core/babylon";

/** 建物 ID の上限（頂点カラーのアルファに id / STRUCT_ID_SCALE で入れる） */
export const STRUCT_ID_SCALE = 4096;

/**
 * 建物ごとの濃さ（0..1）を 1 行のテクスチャで持ち、町の材質すべてで共有する。
 * 建物の部品は頂点カラーのアルファに建物 ID を持っている（アルファは描画に使っていない）。
 */
export class StructureFadeTexture {
  readonly tex: RawTexture;
  readonly width: number;
  private data: Uint8Array;

  constructor(scene: Scene, count: number) {
    this.width = Math.max(2, count + 1);
    this.data = new Uint8Array(this.width * 4).fill(255);
    this.tex = RawTexture.CreateRGBATexture(this.data, this.width, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    this.tex.wrapU = this.tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  }

  /** fade[id] = 0..1 */
  upload(fade: Float32Array) {
    const d = this.data;
    for (let i = 1; i < fade.length && i < this.width; i++) d[i * 4] = Math.round(Math.max(0, Math.min(1, fade[i])) * 255);
    this.tex.update(d);
  }
}

/**
 * 建物の透過プラグイン：濃さに応じて 4×4 のディザで画素を抜く（半透明の並べ替えが要らず、結合メッシュのまま建物単位で透ける）。
 * 濃さ 0 の建物は完全に描かない（写真で隠す）。頂点カラーのアルファが 1（キャラクター等）の物は対象外。
 * （標準の頂点シェーダーは VERTEXALPHA が無いと vColor.a を 1 にするので、建物 ID は専用の varying で渡す）
 */
export class StructureFadePlugin extends MaterialPluginBase {
  private fade: StructureFadeTexture;

  constructor(material: Material, fade: StructureFadeTexture) {
    super(material, "StructureFade", 250, { STRUCTFADE: false });
    this.fade = fade;
    this._enable(true);
  }

  override getClassName() {
    return "StructureFadePlugin";
  }

  override prepareDefines(defines: Record<string, unknown>) {
    defines.STRUCTFADE = true;
  }

  override getSamplers(samplers: string[]) {
    samplers.push("structFadeSampler");
  }

  override getUniforms() {
    return {
      ubo: [{ name: "structFadeW", size: 1, type: "float" }],
      fragment: "#ifdef STRUCTFADE\nuniform float structFadeW;\n#endif\n",
    };
  }

  override bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh) {
    ubo.updateFloat("structFadeW", this.fade.width);
    ubo.setTexture("structFadeSampler", this.fade.tex);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
#ifdef STRUCTFADE
varying float vStructId;
#endif
`,
        CUSTOM_VERTEX_MAIN_END: `
#ifdef STRUCTFADE
#ifdef VERTEXCOLOR
  vStructId = color.a;
#else
  vStructId = 1.0;
#endif
#endif
`,
      };
    }
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef STRUCTFADE
varying float vStructId;
uniform sampler2D structFadeSampler;
float structBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float structBayer4(vec2 a) { return structBayer2(0.5 * a) * 0.25 + structBayer2(a); }
#endif
`,
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
#ifdef STRUCTFADE
{
  float sid = floor(vStructId * ${STRUCT_ID_SCALE.toFixed(1)} + 0.5);
  if (sid > 0.5 && sid < structFadeW) {
    float fadeV = texture2D(structFadeSampler, vec2((sid + 0.5) / structFadeW, 0.5)).r;
    if (fadeV < 0.999 && fadeV <= structBayer4(gl_FragCoord.xy) + 0.03) discard;
  }
}
#endif
`,
    };
  }
}
