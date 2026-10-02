import { ArcRotateCamera, Camera, Scene, Vector3 } from "../core/babylon";
import { damp, dampAngle, clamp } from "../core/util";
import type { StageDef } from "../data/stages";

export type CamMode = "title" | "follow" | "overview" | "ending" | "view" | "photo";

/** 撮影のカメラ（プリセットで決めて、手で微調整できる） */
export interface PhotoCam {
  tx: number;
  ty: number;
  tz: number;
  alpha: number;
  beta: number;
  radius: number;
  fov: number;
}

export interface CamContext {
  px: number;
  pz: number;
  /** 主人公の足元の高さ（温泉宿の二階・三階。無ければ 0） */
  py?: number;
  pvx: number;
  pvz: number;
  count: number;
  bounds: { cx: number; cz: number; size: number };
  tailX: number;
  tailZ: number;
  dt: number;
}

/**
 * カメラ（仕様 13章）。行列が伸びるほど引いていき、俯瞰モードで全体を見渡せる。
 */
export class CameraDirector {
  cam: ArcRotateCamera;
  mode: CamMode = "title";
  private dist = 13;
  private pitch = 0.95;
  private target = new Vector3(0, 1, -110);
  private endT = 0;
  private endAlpha = 0;
  yaw = -Math.PI / 2;
  /** プレイヤーが上下に振った量（+ で上を向く：カメラが下がる） */
  pitchOffset = 0;
  /** キャラクターへの距離の倍率（ホイール・ピンチ・寄る/引くボタン）。夜行位ごとの基本距離に掛ける */
  zoom = 1;
  /** 締めの演出で引いていく秒数 */
  endDuration = 10;
  /** 撮影のカメラ（setMode("photo") の前に setPhoto で決める） */
  photo: PhotoCam = { tx: 0, ty: 1, tz: 0, alpha: 0, beta: 1.1, radius: 30, fov: 0.8 };
  /** カメラを遮るものの高さ（World から渡す）。視点を下げたときに家や森の中へ入らないよう寄せる */
  obstacleHeight: (x: number, z: number) => number = () => 0;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.cam = new ArcRotateCamera("cam", -Math.PI / 2, 0.9, 20, new Vector3(0, 1, -110), scene);
    this.cam.minZ = 0.5;
    this.cam.maxZ = 2000;
    this.cam.fov = 0.8;
    void canvas; // 入力は自前で扱う
    this.fitAspect();
    window.addEventListener("resize", () => this.fitAspect());
  }

  /**
   * スマホの縦長画面では横の画角を固定する（縦に広く見える＝行列の前後が見やすい）。
   * 横長では従来どおり縦の画角を固定。
   */
  fitAspect() {
    const eng = this.cam.getScene().getEngine();
    const aspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
    if (aspect < 1) {
      this.cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
      this.cam.fov = 0.78;
    } else {
      this.cam.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
      this.cam.fov = 0.8;
    }
  }

  applyStage(s: StageDef) {
    this.setFollowFraming(s.camera.distance, s.camera.pitch);
  }

  /** 追いかけるカメラの基本の距離と見下ろす角度（夜行位ごと。温泉宿は室内なので近め） */
  setFollowFraming(distance: number, pitch: number) {
    this.dist = distance;
    this.pitch = pitch;
  }

  setMode(m: CamMode) {
    if (m === "ending") {
      this.endT = 0;
    }
    if (m !== "photo") this.fitAspect();
    this.mode = m;
  }

  /** 撮影のカメラを決める（プリセット選択）。snap = 一気に移す */
  setPhoto(p: PhotoCam, snap = false) {
    this.photo = { ...p };
    if (snap) {
      this.target.set(p.tx, p.ty, p.tz);
      this.cam.target.copyFrom(this.target);
      this.cam.alpha = p.alpha;
      this.cam.beta = p.beta;
      this.cam.radius = p.radius;
    }
  }

  /** 撮影中の手動の移動：左右・高さ・前後（歩）。前後はカメラが見ている向き（地面に沿って） */
  photoNudge(right: number, up: number, forward = 0) {
    const a = this.cam.alpha;
    // カメラの右方向（画面の右）と前方向（カメラから見つめる先へ）
    const rx = Math.sin(a), rz = -Math.cos(a);
    const fx = -Math.cos(a), fz = -Math.sin(a);
    this.photo.tx += rx * right + fx * forward;
    this.photo.tz += rz * right + fz * forward;
    this.photo.ty = clamp(this.photo.ty + up, 0.2, 40);
  }

  /** 移動入力をカメラ基準のワールドベクトルへ */
  forward() {
    const a = this.cam.alpha;
    return { fx: -Math.cos(a), fz: -Math.sin(a) };
  }

  update(c: CamContext, yawInput: number, pitchInput = 0, zoomInput = 0) {
    const cam = this.cam;
    const dt = c.dt;
    this.yaw += yawInput;
    this.pitchOffset = clamp(this.pitchOffset + pitchInput, -0.75, 0.75);
    const po = this.pitchOffset;
    this.zoom = clamp(this.zoom * Math.exp(zoomInput), 0.4, 1.8);
    const zm = this.zoom;
    let tx: number, tz: number, ty = 1, r: number, beta: number, alpha = this.yaw;

    switch (this.mode) {
      case "title": {
        this.yaw += dt * 0.05;
        alpha = this.yaw;
        tx = c.px;
        tz = c.pz + 30;
        ty = 2;
        r = 70;
        beta = 1.05;
        break;
      }
      case "follow": {
        tx = c.px + c.pvx * 0.35;
        tz = c.pz + c.pvz * 0.35;
        r = (this.dist + Math.min(8, Math.hypot(c.pvx, c.pvz) * 0.4)) * zm;
        beta = clamp(this.pitch + po, 0.3, 1.45);
        // 上を向くほどカメラは低く・近くなり、主人公の頭上の空（花火）が見える
        const up = Math.max(0, beta - 1.0);
        r *= 1 - up * 0.7;
        ty = (c.py ?? 0) + 1 + up * 5;
        break;
      }
      case "overview": {
        // 俯瞰：主人公（青鬼）を中心に、進む先を少し広めに。行列の長さに応じて引くが、引きすぎない
        tx = c.px + c.pvx * 0.6;
        tz = c.pz + c.pvz * 0.6;
        r = clamp(34 + c.bounds.size * 0.45, 44, 95) * zm;
        beta = clamp(0.5 + po, 0.2, 1.3);
        break;
      }
      case "ending": {
        // 完成した行列を横から
        this.endT += dt;
        const dx = c.px - c.tailX, dz = c.pz - c.tailZ;
        const len = Math.hypot(dx, dz) || 1;
        if (this.endT < dt * 2) {
          const dir = Math.atan2(dz, dx);
          this.endAlpha = dir - Math.PI / 2;
          // カメラが家の裏にならないよう、今のカメラに近い側を選ぶ
          if (Math.abs(Math.sin((this.endAlpha - this.yaw) / 2)) > 0.7) this.endAlpha += Math.PI;
        }
        const p = clamp(this.endT / this.endDuration, 0, 1);
        const e = p * p * (3 - 2 * p);
        tx = c.tailX + dx * (0.2 + 0.6 * e);
        tz = c.tailZ + dz * (0.2 + 0.6 * e);
        r = clamp(len * 0.7, 22, 110);
        beta = 1.05 - e * 0.2;
        alpha = this.endAlpha + e * 0.35;
        this.yaw = alpha;
        break;
      }
      case "photo": {
        const ph = this.photo;
        ph.alpha += yawInput;
        ph.beta = clamp(ph.beta + pitchInput, 0.15, 1.52);
        ph.radius = clamp(ph.radius * Math.exp(zoomInput), 3, 260);
        tx = ph.tx;
        tz = ph.tz;
        ty = ph.ty;
        r = ph.radius;
        beta = ph.beta;
        alpha = ph.alpha;
        this.yaw = alpha;
        // 画角（超ワイド）
        cam.fov = damp(cam.fov, ph.fov, 3, dt);
        break;
      }
      case "view": {
        this.yaw += dt * 0.06;
        alpha = this.yaw;
        tx = c.bounds.cx;
        tz = c.bounds.cz;
        r = Math.max(40, c.bounds.size * 0.9 + 20) * zm;
        beta = clamp(0.9 + po, 0.3, 1.45);
        break;
      }
    }
    // 低い視点で家・森の中に入らないよう、主人公からカメラまでの間を調べて寄せる
    let pullIn = false;
    if (this.mode !== "title" && this.mode !== "ending" && this.mode !== "photo" && beta > 0.95) {
      const sb = Math.sin(beta), cb = Math.cos(beta);
      const ox = Math.cos(alpha) * sb, oz = Math.sin(alpha) * sb;
      for (let s = 3; s <= r; s += 1.5) {
        const y = ty + cb * s;
        if (y < this.obstacleHeight(tx + ox * s, tz + oz * s)) {
          r = Math.max(4, s - 2);
          pullIn = true;
          break;
        }
      }
    }
    const play = this.mode === "follow" || this.mode === "overview";
    const k = play ? 6 : this.mode === "photo" ? 5 : 2.2;
    this.target.x = damp(this.target.x, tx, k, dt);
    this.target.z = damp(this.target.z, tz, k, dt);
    this.target.y = damp(this.target.y, ty, k, dt);
    cam.target.copyFrom(this.target);
    const ph = this.mode === "photo";
    cam.radius = damp(cam.radius, r, pullIn && r < cam.radius ? 10 : play ? 2.6 : ph ? 5 : 1.4, dt);
    cam.beta = damp(cam.beta, beta, ph ? 6 : 2, dt);
    cam.alpha = dampAngle(cam.alpha, alpha, play ? 8 : ph ? 7 : 2.5, dt);
  }

  get targetPos() {
    return this.target;
  }
}
