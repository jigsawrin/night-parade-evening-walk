import { BakedVertexAnimationManager, InstancedMesh, Matrix, Mesh, Scene, Vector4, VertexAnimationBaker, loadGlbMeshes } from "../core/babylon";
import type { RigClipName } from "../data/riggedModels";

/** 焼くときの標本化（フレーム/秒）と、再生の既定の速さ */
const SAMPLE = 30;

interface Range {
  from: number;
  to: number;
}

/**
 * 骨付き GLB を「頂点アニメーションのテクスチャ」に焼いたもの。
 * 骨のクリップを 30fps で標本化して 1 枚のテクスチャにし、インスタンスごとに「どのクリップのどこか」だけを持たせる。
 * 100 体以上でも描画は種類ごとに 1 回で、骨の計算は GPU が焼いた行列を読むだけ（Actor は InstancedMesh のまま）。
 */
export class Rig {
  constructor(private clips: Record<string, Range>, private manager: BakedVertexAnimationManager) {}

  has(name: string) {
    return name in this.clips;
  }

  /** クリップの長さ（秒） */
  length(name: string) {
    const c = this.clips[name];
    return c ? (c.to - c.from + 1) / SAMPLE : 0;
  }

  /**
   * インスタンスに再生するクリップを入れる。
   * once: その時点を 0 フレーム目として始める（ループの途中から入らない）。seconds: その長さに収める。
   */
  play(inst: InstancedMesh, name: RigClipName, once = false, seconds = 0) {
    const c = this.clips[name] ?? this.clips.Idle;
    if (!c) return;
    const total = c.to - c.from + 1;
    const fps = seconds > 0 ? total / seconds : SAMPLE;
    let offset = Math.random() * total;
    if (once) {
      // シェーダは frame = mod(fract(t·fps/total)·n + offset, n)（n = total - 1。t·fps/total ≥ 1 のあと）
      const n = Math.max(1, total - 1);
      const phase = ((this.manager.time * fps) / total) % 1;
      offset = (((-phase * n) % n) + n) % n;
    }
    inst.instancedBuffers.bakedVertexAnimationSettingsInstanced = new Vector4(c.from, c.to, offset, fps);
  }
}

/** 骨付き GLB を読み、全クリップを焼いたテンプレートを返す。骨・クリップが無い GLB は null */
export async function loadRigged(url: string, scene: Scene, clock: () => number): Promise<{ mesh: Mesh; rig: Rig } | null> {
  const res = await loadGlbMeshes(url, scene);
  const skinned = res.meshes.find((m): m is Mesh => m instanceof Mesh && m.skeleton != null && m.getTotalVertices() > 0);
  const skeleton = res.skeletons[0];
  if (!skinned || !skeleton || res.animationGroups.length === 0) {
    res.meshes.forEach((m) => m.dispose());
    return null;
  }
  const clips: Record<string, Range> = {};
  const rows: Float32Array[] = [];
  for (const g of res.animationGroups) {
    g.stop();
    const frames = Math.max(2, Math.round(((g.to - g.from) / 60) * SAMPLE) + 1); // glTF ローダのフレームは 60fps
    const from = rows.length;
    for (let i = 0; i < frames; i++) {
      const f = g.from + ((g.to - g.from) * i) / (frames - 1);
      g.start(false, 1, f, f);
      g.goToFrame(f);
      res.meshes[0].computeWorldMatrix(true);
      res.meshes[0].getDescendants(false).forEach((n) => (n as Mesh).computeWorldMatrix?.(true));
      skeleton.prepare(true);
      rows.push(new Float32Array(skeleton.getTransformMatrices(skinned)));
    }
    g.stop();
    clips[g.name] = { from, to: rows.length - 1 };
  }
  res.animationGroups.forEach((g) => g.dispose());
  // glTF ローダは根（__root__）に左右反転の変換を持たせ、インスタンスもそれを親として引き継ぐ。
  // すると Actor の位置が左右反転して影とずれるので、根の変換を頂点と焼いた行列へ移し、親を外す。
  const world = skinned.computeWorldMatrix(true).clone();
  const inverse = world.clone().invert();
  const blocks = Matrix.Identity();
  for (const row of rows) {
    for (let o = 0; o < row.length; o += 16) {
      Matrix.FromArrayToRef(row, o, blocks);
      inverse.multiply(blocks).multiply(world).copyToArray(row, o);
    }
  }
  skinned.parent = null;
  skinned.position.setAll(0);
  skinned.rotationQuaternion = null;
  skinned.rotation.setAll(0);
  skinned.scaling.setAll(1);
  skinned.bakeTransformIntoVertices(world);
  const data = new Float32Array(rows.length * rows[0].length);
  rows.forEach((r, i) => data.set(r, i * r.length));
  const manager = new BakedVertexAnimationManager(scene);
  manager.texture = new VertexAnimationBaker(scene, skinned).textureFromBakedVertexData(data);
  skinned.bakedVertexAnimationManager = manager;
  skinned.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4);
  skinned.isVisible = false;
  skinned.isPickable = false;
  scene.onBeforeRenderObservable.add(() => (manager.time = clock()));
  return { mesh: skinned, rig: new Rig(clips, manager) };
}
