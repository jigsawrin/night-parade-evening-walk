import type { GlowLayer, Scene, StandardMaterial } from "../core/babylon";
import type { WorldKit } from "../world/WorldKit";

/** 透過・非表示を当てる場所（町でも温泉宿でも）。地面の家の影は町だけ */
type FadeWorld = Pick<WorldKit, "structures" | "structureMeshes" | "lightGroups"> & { setHouseShadowsHidden?(cats: ReadonlySet<string>): void };
import { StructureFadePlugin, StructureFadeTexture } from "../world/StructureFadePlugin";
import { fadeTargets, stepFade, type FadeFocus, type FadeMode, type HideCategory } from "../world/structureFade";

/**
 * 建物の透過と、写真での非表示。
 *  - 夜の間：主人公・カメラのまわり、カメラと主人公の間をふさぐ建物・木を透かす（設定で「百鬼夜行のまわりも」）
 *  - 記念撮影：分類（重要な建物・その他の建築物・木）ごとに丸ごと隠す
 * 判定は 0.1 秒ごと、濃さの変化は毎フレーム。結合メッシュのまま、描画コールは増やさない。
 */
export class StructureVisibilityDirector {
  mode: FadeMode = 1;
  private hidden = new Set<HideCategory>();
  /** 分類とは別に、一つずつ隠す建物（記念撮影の場所で邪魔になる御神木など） */
  private hiddenIds = new Set<number>();
  /** 透かさない建物（温泉宿：今上っている階段） */
  private solidIds = new Set<number>();
  private cur: Float32Array;
  private target: Float32Array;
  private fade: StructureFadeTexture;
  private t = 0;

  /** reserve：後から作る建物グループの分の空き（温泉宿の上の階。町は 0） */
  constructor(scene: Scene, private world: FadeWorld, materials: StandardMaterial[], private glow: GlowLayer, reserve = 0) {
    const n = world.structures.length + 1 + reserve;
    this.cur = new Float32Array(n).fill(1);
    this.target = new Float32Array(n).fill(1);
    this.fade = new StructureFadeTexture(scene, world.structures.length + reserve);
    for (const m of materials) new StructureFadePlugin(m, this.fade);
  }

  isHidden(c: HideCategory) {
    return this.hidden.has(c);
  }

  /** 写真で分類ごとに隠す（NPC は Actor 側で隠す） */
  setHidden(c: HideCategory, on: boolean) {
    if (on) this.hidden.add(c);
    else this.hidden.delete(c);
    for (const { mesh, cat } of this.world.structureMeshes) mesh.setEnabled(!this.hidden.has(cat));
    // 地面に焼き込んだ家の影も、その分類を隠したら消す
    this.world.setHouseShadowsHidden?.(this.hidden);
    // 隠した提灯・窓の光のにじみ（GlowLayer）も消す
    const hideLamps = this.hidden.has("building");
    for (const g of this.world.lightGroups) {
      for (const m of g) {
        if (hideLamps) this.glow.addExcludedMesh(m);
        else this.glow.removeExcludedMesh(m);
      }
    }
    this.t = 0;
  }

  /** 写真で建物を一つずつ隠す（ids を丸ごと置き換える。空なら全部戻す） */
  setHiddenIds(ids: readonly number[]) {
    this.hiddenIds = new Set(ids.filter((i) => i > 0));
    this.t = 0;
  }

  /** 近くにいても・ふさいでいても透かさない建物（ids を丸ごと置き換える） */
  setSolidIds(ids: readonly number[]) {
    this.solidIds = new Set(ids);
    this.t = 0;
  }

  clearHidden() {
    for (const c of [...this.hidden]) this.setHidden(c, false);
    this.setHiddenIds([]);
  }

  update(dt: number, focus: Omit<FadeFocus, "mode">) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.1;
      fadeTargets(this.world.structures, { ...focus, mode: this.mode }, this.hidden, this.target);
      for (const id of this.solidIds) if (this.target[id] > 0) this.target[id] = 1;
      for (const id of this.hiddenIds) this.target[id] = 0;
    }
    // 隠す・出すは一瞬で（写真）
    let jumped = false;
    for (let i = 1; i < this.cur.length; i++) {
      if ((this.target[i] === 0 || this.cur[i] === 0) && this.cur[i] !== this.target[i]) {
        this.cur[i] = this.target[i];
        jumped = true;
      }
    }
    if (stepFade(this.cur, this.target, dt) || jumped) this.fade.upload(this.cur);
  }
}
