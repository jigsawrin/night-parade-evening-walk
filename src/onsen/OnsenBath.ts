import { Color3, Mesh, MeshBuilder, StandardMaterial, type Scene } from "../core/babylon";
import type { FaceAnchor } from "../characters/models";
import type { Player } from "../game/Player";
import { ONSEN_BATH } from "../data/onsen";
import { poolDepth, stepBathHeat } from "../game/onsen/OnsenGroundRules";
import type { OnsenWorld } from "./OnsenWorld";

/** 赤みのいちばん濃いところ（顔にかぶせる殻の不透明度） */
const BLUSH_ALPHA = 0.4;

export interface BathHooks {
  /** 湯に入った（小さな水音・水面の輪） */
  enter(x: number, z: number): void;
  /** 湯の中を歩いている（ときどき水面の輪） */
  wade(x: number, z: number): void;
}

/**
 * 主人公が湯に入る：湯の中では深さに応じてゆっくり歩き、しばらく浸かると顔がほんのり赤くなる（上がると少しずつ冷める）。
 * 沈む高さは OnsenWorld.groundHeight（OnsenGroundRules.groundAt）、値は data/onsen.ts の ONSEN_BATH。
 * 赤みは、顔の位置（FACE_ANCHORS）に薄い赤の殻をかぶせて出す（モデルの色は変えない。本番モデルでも位置を合わせれば効く）。
 */
export class OnsenBath {
  /** 浸かっていた時間（上がると減る） */
  heat = 0;
  /** 顔の赤み 0..1 */
  blush = 0;
  /** 今の湯の深さ 0..1 */
  depth = 0;
  private inWater = false;
  private wadeT = 0;
  private base: { walk: number; run: number };
  private face: Mesh | null = null;
  private mat: StandardMaterial | null = null;

  constructor(scene: Scene, private world: OnsenWorld, private player: Player, anchor: FaceAnchor | undefined, private hooks: BathHooks) {
    this.base = { walk: player.walkSpeed, run: player.runSpeed };
    if (!anchor) return;
    const mat = new StandardMaterial("onsenBlush", scene);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(1, 0.3, 0.34);
    mat.disableLighting = true;
    mat.alpha = 0;
    const m = MeshBuilder.CreateSphere("onsenBlush", { diameter: 1, segments: 12 }, scene);
    m.material = mat;
    m.isPickable = false;
    // Actor の見た目（向き・揺れ・大きさ）についていく
    m.parent = player.actor.mesh;
    m.position.set(0, anchor.y, anchor.z);
    m.scaling.set(anchor.w, anchor.h, anchor.d);
    m.setEnabled(false);
    this.face = m;
    this.mat = mat;
  }

  update(dt: number) {
    const p = this.player;
    const lv = this.world.level;
    const depth = lv.floor === 1 && !lv.stair ? poolDepth(p.x, p.z, ONSEN_BATH.depthRamp) : 0;
    this.depth = depth;
    const k = 1 - (1 - ONSEN_BATH.speed) * depth;
    p.walkSpeed = this.base.walk * k;
    p.runSpeed = this.base.run * k;
    // 入った・上がった（縁の近くで行き来してもばたつかないように、入るのは深め・上がるのは浅めで）
    if (!this.inWater && depth > 0.35) {
      this.inWater = true;
      this.hooks.enter(p.x, p.z);
    } else if (this.inWater && depth < 0.1) this.inWater = false;
    this.wadeT -= dt;
    if (this.inWater && p.actor.speed > 1 && this.wadeT <= 0) {
      this.wadeT = 0.9;
      this.hooks.wade(p.x, p.z);
    }
    const h = stepBathHeat(this.heat, depth > 0.5, dt, ONSEN_BATH);
    this.heat = h.heat;
    this.blush = h.blush;
    if (this.face && this.mat) {
      this.mat.alpha = this.blush * BLUSH_ALPHA;
      this.face.setEnabled(this.blush > 0.01);
    }
  }
}
