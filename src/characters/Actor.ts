import type { InstancedMesh } from "../core/babylon";
import type { ModelFactory } from "./ModelFactory";
import { YOKAI, type RigFamily } from "../data/yokaiTypes";
import { dampAngle } from "../core/util";
import type { PoseSample } from "../game/after/PhotoPose";

export type AnimState = "idle" | "walk" | "run";

/**
 * 画面に出るキャラクター 1 体。
 * 骨格アニメーションの代わりに、Rig Family ごとの手続きアニメーション（トランスフォームのみ）で動かす。
 * → 100 体以上でも Skeleton なしで軽量。GLB + Skeleton に差し替えても外側の API は同じ。
 */
export class Actor {
  mesh: InstancedMesh;
  shadow: InstancedMesh;
  family: RigFamily;
  hover: number;
  scale: number;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** 表示上の高さオフセット（ジャンプ等） */
  lift = 0;
  speed = 0;
  phase = Math.random() * 10;
  seed = Math.random() * 100;
  /**
   * 写真のポーズ（null = 通常の手続きアニメ）。集合写真・フォトモードで PoseDriver が毎フレーム入れる。
   * 将来の骨格アニメーションでは、ここが Rig Pose の再生に置き換わる。
   */
  pose: PoseSample | null = null;
  private happyT = 0;
  private surpriseT = 0;
  private popT = 0;
  private visible = true;
  /** 一本足で跳ねる歩き方（YokaiType.gait） */
  private hopGait: boolean;

  constructor(factory: ModelFactory, public typeId: string, modelId = typeId) {
    this.mesh = factory.instance(modelId);
    this.shadow = factory.shadow();
    const def = YOKAI[typeId];
    this.family = def?.family ?? (typeId === "dog" ? "CHIBI_QUAD" : "CHIBI_BIPED");
    if (typeId === "karakasa" || typeId === "rokurokubi") this.family = "SPECIAL";
    this.hover = def?.hover ?? 0;
    this.scale = def?.scale ?? 1;
    this.hopGait = def?.gait === "hop";
  }

  setPos(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  face(dx: number, dz: number, dt: number, rate = 10) {
    if (dx * dx + dz * dz < 1e-6) return;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), rate, dt);
  }

  happy() {
    this.happyT = 0.7;
  }
  surprise() {
    this.surpriseT = 0.5;
  }
  pop() {
    this.popT = 0.45;
  }

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    this.mesh.setEnabled(v);
    this.shadow.setEnabled(v);
  }
  get isVisible() {
    return this.visible;
  }

  /** speed: 実移動速度（u/s） */
  animate(dt: number, t: number) {
    const s = this.scale;
    const moving = this.speed > 0.4;
    const k = Math.min(this.speed, 12);
    this.phase += dt * (moving ? 3 + k * 1.3 : 1.2);
    let bob = 0, roll = 0, pitch = 0, sy = 1;

    const pose = this.pose;
    if (pose) {
      bob = pose.bob + (this.family === "FLOAT" ? this.hover : 0);
      roll = pose.roll;
      pitch = pose.pitch;
      sy = pose.sy;
    } else switch (this.family) {
      case "CHIBI_BIPED":
        if (moving) {
          bob = Math.abs(Math.sin(this.phase)) * 0.14;
          roll = Math.sin(this.phase) * 0.12;
          pitch = Math.min(0.25, k * 0.02);
        } else {
          sy = 1 + Math.sin(this.phase * 1.3) * 0.025;
        }
        break;
      case "CHIBI_QUAD":
        if (moving) {
          bob = Math.abs(Math.sin(this.phase * 1.2)) * 0.1;
          pitch = Math.sin(this.phase * 2.4) * 0.08;
        } else sy = 1 + Math.sin(this.phase * 1.3) * 0.02;
        break;
      case "FLOAT":
        bob = this.hover + Math.sin(t * 2.2 + this.seed) * 0.15;
        roll = Math.sin(t * 1.6 + this.seed) * 0.12;
        pitch = moving ? 0.15 : 0;
        if (this.typeId === "ittan") pitch = Math.sin(t * 3 + this.seed) * 0.2;
        break;
      case "SERPENT":
        // 大蛇：とぐろのまま首をゆらす（進むと少し伸び縮み）
        roll = Math.sin(t * 1.1 + this.seed) * 0.06;
        sy = 1 + Math.sin(t * 1.7 + this.seed) * 0.03;
        if (moving) bob = Math.abs(Math.sin(this.phase * 0.5)) * 0.05;
        break;
      case "SPECIAL":
        if (this.hopGait) {
          bob = Math.abs(Math.sin(this.phase * (moving ? 1 : 0.5))) * (moving ? 0.4 : 0.12);
          sy = 1 - Math.max(0, 0.1 - bob) * 1.2;
        } else {
          // ろくろ首など：ゆらゆら
          roll = Math.sin(t * 1.4 + this.seed) * 0.08;
          if (moving) bob = Math.abs(Math.sin(this.phase)) * 0.08;
        }
        break;
      default:
        break;
    }

    if (this.happyT > 0) {
      this.happyT -= dt;
      const p = 1 - this.happyT / 0.7;
      bob += Math.sin(p * Math.PI) * 0.9;
      this.mesh.rotation.y = this.yaw + p * Math.PI * 2;
    } else {
      this.mesh.rotation.y = this.yaw + (pose ? pose.yawOffset : 0);
    }
    if (this.surpriseT > 0) {
      this.surpriseT -= dt;
      const p = 1 - this.surpriseT / 0.5;
      bob += Math.sin(p * Math.PI) * 0.6;
      sy *= 1 + Math.sin(p * Math.PI) * 0.25;
    }
    let pop = 1;
    if (this.popT > 0) {
      this.popT -= dt;
      const p = 1 - this.popT / 0.45;
      pop = p < 0.5 ? p * 2 * 1.25 : 1.25 - (p - 0.5) * 0.5;
    }

    this.mesh.position.set(this.x, this.y + bob + this.lift, this.z);
    this.mesh.rotation.z = roll;
    this.mesh.rotation.x = pitch;
    const sc = s * pop;
    this.mesh.scaling.set(sc / Math.sqrt(sy), sc * sy, sc / Math.sqrt(sy));
    // 影
    const h = bob + this.lift + (this.y > 0.5 ? 0 : 0);
    const shs = (this.family === "FLOAT" ? 0.8 : 1) * s * Math.max(0.35, 1 - h * 0.25);
    this.shadow.position.set(this.x, this.groundY + 0.03, this.z);
    this.shadow.scaling.set(shs, 1, shs);
  }

  /** 影を落とす地面の高さ（屋根の上などは呼び出し側で設定） */
  groundY = 0;

  dispose() {
    this.mesh.dispose();
    this.shadow.dispose();
  }
}
