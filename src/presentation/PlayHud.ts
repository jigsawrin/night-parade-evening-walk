import { Matrix, Vector3, type Scene } from "../core/babylon";
import { ONMYOJI_CFG } from "../data/onmyoji";
import type { NightClock } from "../game/NightClock";
import type { Parade } from "../game/Parade";
import type { Player } from "../game/Player";
import type { Threats } from "../game/Threats";
import type { WildYokai } from "../game/WildYokai";
import type { OnmyojiGuards } from "../game/onmyoji/OnmyojiGuards";
import type { CameraDirector } from "./CameraDirector";
import type { UIDirector } from "./UIDirector";

/** PlayHud が読む Game の部品（読むだけ。ゲームの状態は変えない） */
export interface PlayHudHost {
  scene: Scene;
  canvas: HTMLCanvasElement;
  ui: UIDirector;
  camera: CameraDirector;
  clock: NightClock;
  player: Player;
  parade: Parade;
  wild: WildYokai;
  threats: Threats;
  onmyoji: OnmyojiGuards;
  readonly overview: boolean;
  /** 図鑑で知っている種類（名前を出すか「？？？」か） */
  known(): Set<string>;
}

/**
 * 夜の間の HUD：刻・目的地・俯瞰ボタン・近くの妖怪のヒント・「！」・ミニマップ。
 * ミニマップは現在地・向き・行列・地形だけ（Encounter や噂は描かない）。
 */
export class PlayHud {
  private mapTimer = 0;

  constructor(private h: PlayHudHost) {}

  /** ワールド座標 → 画面（CSS ピクセル）。画面の外なら null */
  project(x: number, y: number, z: number) {
    const { canvas, scene, camera } = this.h;
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    const p = Vector3.Project(new Vector3(x, y, z), Matrix.Identity(), scene.getTransformMatrix(), camera.cam.viewport.toGlobal(w, hh));
    return p.z > 1 || p.z < 0 ? null : p;
  }

  update(dt: number) {
    const { ui, clock, player, parade, wild, threats, onmyoji, camera } = this.h;
    ui.setClock(clock.koku, clock.progress);
    ui.setObjective(player.x, player.z, camera.cam.alpha);
    ui.setOverviewAvailable(parade.total >= 5, this.h.overview);

    // ヒント
    const known = this.h.known();
    const hint = wild.hint(known);
    if (hint) {
      const a = hint.actor;
      const p = this.project(a.x, a.y + (a.family === "FLOAT" ? 2.2 : 1.9) * a.scale, a.z);
      ui.hint(p?.x ?? 0, p?.y ?? 0, p ? hint.text : null, hint.need);
    } else {
      // 陰陽師の近く：見つからないように（威光があれば、おびえている）
      const g = onmyoji.nearest(player.x, player.z, ONMYOJI_CFG.hintRange);
      const p = g && this.project(g.actor.x, g.actor.y + 2.3, g.actor.z);
      const text = !g ? null : g.state === "routed" || g.state === "flee" ? "陰陽師　道をあけている" : onmyoji.awe ? "陰陽師　おびえている" : "陰陽師　見つからないように";
      ui.hint(p?.x ?? 0, p?.y ?? 0, p ? text : null, false);
    }

    // 追ってくる存在・怪しんでいる陰陽師
    const chasing = threats.list.find((th) => th.state === "chase")?.actor ?? onmyoji.alerting()?.actor;
    if (chasing) {
      const p = this.project(chasing.x, 2.6, chasing.z);
      ui.alert(p?.x ?? 0, p?.y ?? 0, !!p);
    } else ui.alert(0, 0, false);

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      const visible: { x: number; z: number; type: string }[] = [];
      wild.forEachVisible((x, z, type) => visible.push({ x, z, type }));
      ui.drawMinimap({ x: player.x, z: player.z, yaw: player.actor.yaw }, parade.followers.map((f) => f.actor), visible, known);
    }
  }
}
