import { Matrix, type Scene } from "../core/babylon";
import type { Input } from "../core/Input";
import type { CameraDirector } from "../presentation/CameraDirector";
import type { VFXDirector } from "../presentation/VFXDirector";
import type { Player } from "./Player";
import { tapMoveStep, type TapTarget } from "./TapMove";

/**
 * 主人公の移動入力：WASD（カメラの向き基準）・タップした場所へ歩く・長押しで押している方へ。
 * 矢印キーはカメラ専用なので、ここでは読まない。
 */
export class PlayerControl {
  /** タップした場所（そこまで歩いていく） */
  moveTarget: TapTarget | null = null;
  /** タップした場所を拾う床の高さ（温泉宿の二階・三階。町では 0） */
  pickY = 0;

  constructor(
    private input: Input,
    private canvas: HTMLCanvasElement,
    private scene: Scene,
    private camera: CameraDirector,
    private player: Player,
    private vfx: Pick<VFXDirector, "burst">,
  ) {}

  /** 夜の間だけ呼ぶ。戻り値はワールド座標の入力ベクトル（長さ 0..1） */
  moveVector(dt: number) {
    const inp = this.input;
    let ix = 0, iz = 0;
    if (inp.down("KeyW")) iz += 1;
    if (inp.down("KeyS")) iz -= 1;
    if (inp.down("KeyA")) ix -= 1;
    if (inp.down("KeyD")) ix += 1;
    const { fx, fz } = this.camera.forward();
    const rx = fz, rz = -fx;
    let mx = fx * iz + rx * ix;
    let mz = fz * iz + rz * ix;
    // タップ：その場所まで歩いていく（キー操作・長押しで上書き）
    if (inp.tap) {
      const g = this.pickGround(inp.tap.x, inp.tap.y);
      inp.tap = null;
      if (g) {
        const dx = g.x - this.player.x, dz = g.z - this.player.z;
        const d = Math.hypot(dx, dz);
        const k = Math.min(1, 60 / (d || 1));
        this.moveTarget = { x: this.player.x + dx * k, z: this.player.z + dz * k, stuck: 0, lastD: Infinity };
        this.vfx.burst("glint", this.moveTarget.x, 0.4, this.moveTarget.z, 4);
      }
    }
    if (ix !== 0 || iz !== 0 || inp.pointerDown) this.moveTarget = null;
    const mt = this.moveTarget;
    if (mt) {
      const dx = mt.x - this.player.x, dz = mt.z - this.player.z;
      const d = Math.hypot(dx, dz);
      // 着いた、または壁などで進めなくなったらやめる（実時間で判定：フレームレートに依らない）
      if (!tapMoveStep(mt, d, dt)) this.moveTarget = null;
      else {
        const s = Math.min(1, d / 2.5);
        mx = (dx / d) * s;
        mz = (dz / d) * s;
      }
    }
    if (inp.pointerDown && ix === 0 && iz === 0) {
      const g = this.pickGround(inp.pointerX, inp.pointerY);
      if (g) {
        const dx = g.x - this.player.x, dz = g.z - this.player.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) {
          const s = Math.min(1, d / 3);
          mx = (dx / d) * s;
          mz = (dz / d) * s;
        }
      }
    }
    return { mx, mz };
  }

  private pickGround(sx: number, sy: number) {
    // createPickingRay は CSS ピクセルを受け取り、内部でハードウェアスケーリングを考慮する
    // （ここで描画解像度に掛け直すと、高解像度のスマホで狙いがずれる）
    const rect = this.canvas.getBoundingClientRect();
    const ray = this.scene.createPickingRay(sx - rect.left, sy - rect.top, Matrix.Identity(), this.camera.cam);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (this.pickY - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }
}
