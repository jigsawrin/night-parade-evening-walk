import { loadGlbMeshes, InstancedMesh, Mesh, Scene, MeshBuilder } from "../core/babylon";
import { MODELS, type GlowKind, type Part } from "./models";
import { buildPart } from "./PartBuilder";
import type { Materials } from "../world/Materials";
import { YOKAI } from "../data/yokaiTypes";

/**
 * キャラクターテンプレートの工場。
 * - 1 種類につき 1 つのソースメッシュ（頂点カラー + 発光サブメッシュ）
 * - 表示は InstancedMesh（100体以上でも描画コールは種類数程度）
 * - 距離 LOD：遠距離は小部品を省いた低ポリ版
 * - YokaiType.modelUrl があれば GLB に差し替え（Character Rig Family の受け口）
 */
export class ModelFactory {
  private templates = new Map<string, Mesh>();
  private blob: Mesh;

  constructor(private scene: Scene, private mats: Materials) {
    this.blob = MeshBuilder.CreateDisc("blobShadow", { radius: 0.5, tessellation: 16 }, scene);
    this.blob.rotation.x = Math.PI / 2;
    this.blob.bakeCurrentTransformIntoVertices();
    this.blob.material = mats.shadow;
    this.blob.isVisible = false;
    this.blob.isPickable = false;
  }

  private build(id: string, low: boolean): Mesh {
    const parts = MODELS[id];
    if (!parts) throw new Error("no model " + id);
    const groups = new Map<"body" | GlowKind, Mesh[]>();
    for (const p of parts as Part[]) {
      if (low && p.small) continue;
      const m = buildPart(this.scene, p, low);
      const key = p.glow ?? "body";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    const merged: Mesh[] = [];
    for (const [key, list] of groups) {
      const m = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true)!;
      m.material = key === "body" ? this.mats.char : this.mats.glow[key];
      merged.push(m);
    }
    const out = merged.length === 1 ? merged[0] : Mesh.MergeMeshes(merged, true, true, undefined, false, true)!;
    out.name = `tpl_${id}${low ? "_low" : ""}`;
    out.isPickable = false;
    out.isVisible = false;
    return out;
  }

  template(id: string): Mesh {
    let t = this.templates.get(id);
    if (!t) {
      t = this.build(id, false);
      const low = this.build(id, true);
      // isVisible=false でもソース自身が描かれないだけで、インスタンスは描画される
      t.addLODLevel(75, low);
      t.addLODLevel(260, null);
      this.templates.set(id, t);
      const url = YOKAI[id]?.modelUrl;
      if (url) void this.swapToGlb(id, url);
    }
    return t;
  }

  /** 事前に全テンプレートを作ってヒッチを避ける */
  warmup(ids: string[]) {
    ids.forEach((id) => this.template(id));
  }

  instance(id: string, name = id): InstancedMesh {
    const inst = this.template(id).createInstance(name);
    inst.isPickable = false;
    inst.alwaysSelectAsActiveMesh = false;
    return inst;
  }

  shadow(): InstancedMesh {
    const s = this.blob.createInstance("shadow");
    s.isPickable = false;
    return s;
  }

  /**
   * GLB 差し替え（v0.1 では静的メッシュとして扱う。骨格アニメーションは Rig Family 実装時に拡張）。
   * 既存インスタンスはそのまま、以降のインスタンスが新モデルになる。
   */
  private async swapToGlb(id: string, url: string) {
    try {
      const res = await loadGlbMeshes(url, this.scene);
      const meshes = res.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
      const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
      if (!merged) return;
      const bb = merged.getBoundingInfo().boundingBox;
      const h = bb.maximumWorld.y - bb.minimumWorld.y || 1;
      merged.scaling.scaleInPlace(1 / h);
      merged.isVisible = false;
      this.templates.set(id, merged);
    } catch (e) {
      console.warn("GLB load failed, keep procedural model", id, e);
    }
  }
}
