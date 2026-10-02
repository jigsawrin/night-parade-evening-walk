import type { Actor } from "../../characters/Actor";
import type { World } from "../../world/World";
import type { Family, FormationDef, PoseId, PoseStyleDef } from "../../data/photo";
import { YOKAI } from "../../data/yokaiTypes";
import { dampAngle } from "../../core/util";
import { formationBounds, layoutFormation, type FormationContext, type FormationMember, type FormationResult } from "./PhotoFormation";
import { ProceduralPoseDriver, choosePose, faceYaw, poseYawJitter, type FaceMode, type PoseDriver } from "./PhotoPose";

interface StageItem {
  actor: Actor;
  fromX: number;
  fromZ: number;
  fromLift: number;
  toX: number;
  toZ: number;
  lift: number;
  yaw: number;
  pose: PoseId;
  seed: number;
}

/** 移動にかける秒数（ふわっと集合） */
const MOVE_SEC = 1.3;

/**
 * 集合写真の舞台：今の行列の Actor（主人公＋仲間）をそのまま並べ直す。
 * 新しく作らない・消さない。陣形を替えても同じ Actor が歩いて（跳んで）移るだけ。
 * 終わったら release() でポーズを外し、Actor を元の手続きアニメに戻す。
 */
export class PhotoStage {
  private items: StageItem[] = [];
  private moveT = 1;
  private result: FormationResult | null = null;
  ctx: FormationContext | null = null;
  driver: PoseDriver = ProceduralPoseDriver;
  /** カメラの方を向いているか（並び・姿を替えると並びの向きへ戻る） */
  private face: { x: number; z: number; mode: FaceMode } | null = null;

  constructor(private world: World, hero: Actor, followers: readonly Actor[]) {
    for (const a of [hero, ...followers]) {
      this.items.push({ actor: a, fromX: a.x, fromZ: a.z, fromLift: 0, toX: a.x, toZ: a.z, lift: 0, yaw: a.yaw, pose: "PHOTO_A", seed: a.seed });
    }
  }

  get size() {
    return this.items.length;
  }

  members(): FormationMember[] {
    return this.items.slice(1).map(({ actor: a }) => {
      const def = YOKAI[a.typeId];
      return { typeId: a.typeId, family: a.family as Family, scale: a.scale, x: a.x, z: a.z, yaw: a.yaw, photoRole: def?.photoRole, rank: def?.rank };
    });
  }

  /** 並べる（ctx は AfterNight が場所と正面を決めて渡す） */
  arrange(def: FormationDef, ctx: FormationContext, style: PoseStyleDef) {
    const res = layoutFormation(def, this.members(), ctx);
    this.result = res;
    this.ctx = ctx;
    const all = [res.hero, ...res.slots];
    this.items.forEach((it, i) => {
      const s = all[i];
      it.fromX = it.actor.x;
      it.fromZ = it.actor.z;
      it.fromLift = it.lift;
      it.toX = s.x;
      it.toZ = s.z;
      it.lift = s.lift;
      it.yaw = s.yaw;
    });
    this.setPoseStyle(style);
    this.moveT = 0;
  }

  /** カメラ（点 x, z）の方を向く。並び・姿を替えるまで続く */
  faceToward(x: number, z: number, mode: FaceMode) {
    this.face = { x, z, mode };
  }

  get facing() {
    return this.face?.mode ?? null;
  }

  setPoseStyle(style: PoseStyleDef) {
    this.face = null;
    this.items.forEach((it, i) => {
      it.pose = choosePose(style, it.actor.family as Family, i);
      it.yaw = (this.result ? [this.result.hero, ...this.result.slots][i].yaw : it.yaw) + (i === 0 ? 0 : poseYawJitter(style, i));
    });
  }

  bounds() {
    return this.result && this.ctx ? formationBounds(this.result, this.ctx) : null;
  }

  /** 並びの順（主人公 → 最後尾）の立ち位置。眺めるカメラが辿る */
  path() {
    return this.items.map((it) => ({ x: it.toX, z: it.toZ }));
  }

  get heroPos() {
    const h = this.items[0];
    return { x: h.toX, z: h.toZ };
  }

  update(dt: number, t: number) {
    const moving = this.moveT < 1;
    if (moving) this.moveT = Math.min(1, this.moveT + dt / MOVE_SEC);
    const p = this.moveT;
    const e = p * p * (3 - 2 * p);
    for (const it of this.items) {
      const a = it.actor;
      const px = a.x, pz = a.z;
      if (moving) {
        const d = Math.hypot(it.toX - it.fromX, it.toZ - it.fromZ);
        a.x = it.fromX + (it.toX - it.fromX) * e;
        a.z = it.fromZ + (it.toZ - it.fromZ) * e;
        a.lift = it.fromLift + (it.lift - it.fromLift) * e + Math.sin(p * Math.PI) * Math.min(3, d * 0.08);
        a.speed = d > 0.3 ? Math.hypot(a.x - px, a.z - pz) / Math.max(dt, 1e-4) : 0;
        if (d > 0.3) a.face(a.x - px, a.z - pz, dt, 10);
        a.pose = null;
      } else {
        a.x = it.toX;
        a.z = it.toZ;
        a.lift = it.lift;
        a.speed = 0;
        const f = this.face;
        a.yaw = f ? dampAngle(a.yaw, faceYaw(it.yaw, a.x, a.z, f.x, f.z, f.mode), 9, dt) : it.yaw;
        a.pose = this.driver.sample(it.pose, t, it.seed);
      }
      a.y = this.world.groundHeight(a.x, a.z);
      a.groundY = a.y;
      a.animate(dt, t);
    }
  }

  /** 元に戻す（ポーズを外す） */
  release() {
    for (const it of this.items) {
      it.actor.pose = null;
      it.actor.lift = 0;
    }
  }
}
