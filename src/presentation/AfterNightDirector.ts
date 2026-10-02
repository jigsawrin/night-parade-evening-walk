import type { Engine, Scene } from "../core/babylon";
import { districtAt } from "../data/districts";
import { CAMERA_PRESETS } from "../data/photo";
import type { StageDef } from "../data/stages";
import type { Input } from "../core/Input";
import type { World } from "../world/World";
import type { Parade } from "../game/Parade";
import type { Player } from "../game/Player";
import type { FestivalSystems } from "../game/FestivalSystems";
import type { WildYokai } from "../game/WildYokai";
import type { Threats } from "../game/Threats";
import type { Activities } from "../game/Activities";
import type { GameBus } from "../game/events";
import { AfterNightState } from "../game/after/AfterNightState";
import { NightRecorder } from "../game/after/NightRecorder";
import { buildNightResult, type NightResult } from "../game/after/NightResult";
import { PhotoStage } from "../game/after/PhotoStage";
import { nightSearch, type NightStartMode } from "../game/after/nightUrl";
import type { CameraDirector } from "./CameraDirector";
import type { EmakiCloudDirector } from "./EmakiCloudDirector";
import type { FireworksDirector } from "./FireworksDirector";
import type { UIDirector } from "./UIDirector";
import type { StructureVisibilityDirector } from "./StructureVisibilityDirector";
import type { DistrictFestivalDirector } from "./DistrictFestivalDirector";
import type { MusicDirector } from "./audio/MusicDirector";
import type { AudioDirector } from "./audio/AudioDirector";
import { ResultUI } from "./ResultUI";
import { PhotoModeDirector } from "./PhotoModeDirector";

/** AfterNightDirector が使う Game の部品 */
export interface AfterNightHost {
  engine: Engine;
  scene: Scene;
  bus: GameBus;
  world: World;
  parade: Parade;
  player: Player;
  festival: FestivalSystems;
  wild: WildYokai;
  threats: Threats;
  onmyoji: { actors(): { x: number; z: number; isVisible: boolean; setVisible(v: boolean): void }[] };
  tagalongs: { actors(): { x: number; z: number; isVisible: boolean; setVisible(v: boolean): void }[] };
  activities: Activities;
  camera: CameraDirector;
  clouds: EmakiCloudDirector;
  fireworks: FireworksDirector;
  ui: UIDirector;
  structures: StructureVisibilityDirector;
  festDecor: DistrictFestivalDirector;
  readonly music: MusicDirector | null;
  readonly audio: AudioDirector | null;
  readonly stage: StageDef;
  readonly seedValue: number;
  readonly nightLength: number;
  readonly playTime: number;
  readonly typeCounts: ReadonlyMap<string, number>;
}

/** 締めの演出の長さ（秒）。1.2 秒を過ぎたらクリック・キーで飛ばせる */
const SHOWCASE_SEC = 6.2;
const SHOWCASE_SKIP_AFTER = 1.2;

/**
 * After Night：一夜が終わってから、自分の百鬼夜行を眺める。
 *  夜が終わる → 行列が立ち止まる → 笛・太鼓が締める → カメラが引く → 「今宵の百鬼夜行」（締めの演出 3〜7 秒）
 *  → 結果（今夜の記録）→ 眺める／記念撮影／絵巻 → タイトルへ・同じ夜をもう一度・次の夜
 * 夜が終わった後はゲームの進行を止め、行列の Actor（複製しない）を並べ直してポーズを付けるだけ。
 */
export class AfterNightDirector {
  readonly state = new AfterNightState();
  readonly recorder: NightRecorder;
  result: NightResult | null = null;
  private resultUI: ResultUI;
  /** 記念撮影（並び・姿・風情・構図・演出・撮る） */
  private photoMode: PhotoModeDirector;
  private stage: PhotoStage | null = null;
  private showT = 0;
  /** 眺める：行列のどこを見ているか（先頭 0 → 最後尾） */
  private viewS = 0;
  private viewDir = 1;
  /** 結果ができたとき（履歴への保存など） */
  onResult: (r: NightResult) => void = () => {};

  constructor(private h: AfterNightHost) {
    this.recorder = new NightRecorder(h.bus, () => h.playTime);
    this.resultUI = new ResultUI({
      view: () => this.view(),
      photo: () => this.photo(),
      same: () => this.leave("same"),
      next: () => this.leave("next"),
      title: () => this.leave("title"),
    });
    this.photoMode = new PhotoModeDirector(h, () => this.stage, () => this.result, () => this.backToResult(), () => this.state.phase === "photo");
    document.getElementById("btn-view-back")!.addEventListener("click", () => this.backToResult());
    document.getElementById("btn-view-photo")!.addEventListener("click", () => this.photo());
  }

  get phase() {
    return this.state.phase;
  }

  /** 夜が始まる */
  beginNight() {
    this.state.go("play");
    this.recorder.start(this.h.player.x, this.h.player.z);
  }

  /** 夜の間（毎フレーム。ルートは中で間引く） */
  track() {
    if (this.state.gameplay) this.recorder.track(this.h.player.x, this.h.player.z);
  }

  /** 夜が終わった：締めの演出へ */
  endNight(reason: "shrine" | "dawn") {
    if (!this.state.go("showcase")) return;
    this.reason = reason;
    this.recorder.end(reason, this.h.player.x, this.h.player.z);
    this.showT = 0;
    this.h.camera.endDuration = 5;
    this.h.camera.setMode("ending");
    this.h.clouds.swell(0.8);
  }
  private reason: "shrine" | "dawn" = "shrine";

  /** 毎フレーム（Game から） */
  update(dt: number, t: number, input: Input) {
    const ph = this.state.phase;
    if (ph === "showcase") {
      this.showT += dt;
      // 始まってすぐのタップ（夜の間の操作の名残）では飛ばさない
      const skip = this.showT > SHOWCASE_SKIP_AFTER && (input.tap !== null || input.hit("Enter", "Space", "Escape", "KeyE"));
      input.tap = null;
      if (this.showT - dt < 2.9 && this.showT >= 2.9) {
        this.h.ui.banner("今 宵 の", "百鬼夜行", `${this.h.parade.total}妖の行列、ここに揃う`, true);
      }
      if (this.showT >= SHOWCASE_SEC || skip) this.toResult();
      return;
    }
    if (!this.state.afterNight || !this.stage) return;
    this.stage.update(dt, t);
    // 結果・眺める：大行列は先頭から最後尾へゆっくり眺めて折り返す。陣形のときは全体をゆっくり回る
    if (ph === "result" || ph === "view") {
      const cam = this.h.camera.photo;
      if (this.photoMode.def.layout === "trail") {
        const pts = this.stage.path();
        const n = pts.length;
        if (n > 1) {
          this.viewS += dt * 1.5 * this.viewDir;
          if (this.viewS >= n - 1) (this.viewS = n - 1), (this.viewDir = -1);
          if (this.viewS <= 0) (this.viewS = 0), (this.viewDir = 1);
          const i = Math.min(n - 2, Math.floor(this.viewS)), f = this.viewS - i;
          const k = Math.min(1, dt * 1.2);
          cam.tx += (pts[i].x + (pts[i + 1].x - pts[i].x) * f - cam.tx) * k;
          cam.tz += (pts[i].z + (pts[i + 1].z - pts[i].z) * f - cam.tz) * k;
        }
        cam.alpha += dt * 0.02;
      } else cam.alpha += dt * 0.045;
    }
    if (ph === "photo") {
      this.photoMode.update(dt, input);
      if (input.hit("Escape")) this.backToResult();
    }
  }

  /** Game の VFX（紙吹雪・狐火）へ：写真用の演出だけ */
  vfxFlags() {
    const ph = this.state.phase;
    if (ph === "photo") return { confetti: this.photoMode.fx.confetti, kitsunebi: this.photoMode.fx.kitsunebi };
    if (ph === "result" || ph === "view") return { confetti: false, kitsunebi: true };
    return null;
  }

  // ---------------------------------------------------------------- 結果
  private toResult() {
    if (!this.state.go("result")) return;
    const h = this.h;
    const f = h.festival;
    this.result = buildNightResult({
      endedAt: Date.now(),
      seed: h.seedValue,
      theme: f.encounters.theme.text,
      themeType: f.encounters.theme.type,
      reason: this.reason,
      elapsed: h.playTime,
      nightLength: h.nightLength,
      total: h.parade.total,
      stage: h.stage.jp,
      types: h.typeCounts,
      encountersByKind: this.recorder.encountersByKind,
      miniMerged: f.encounters.miniMerged,
      activitiesDone: this.recorder.activitiesDone,
      districtsAwakened: this.recorder.districtsAwakened,
      districtsWalked: [...this.recorder.log.districts((x, z) => districtAt(x, z)?.name ?? null)],
      peakMomentum: f.attraction.peak,
      scatters: f.record(h.playTime, h.nightLength, this.reason).scatters,
      titles: f.titles(h.playTime, h.nightLength, this.reason),
      memory: {
        firstFriend: this.recorder.log.firstFriend,
        hundredth: this.recorder.log.hundredth,
        legends: this.recorder.log.legends,
        highlights: (n) => this.recorder.log.highlights(n),
        timeline: () => this.recorder.log.timeline(),
        route: this.recorder.log.route,
      },
    });
    (window as unknown as { nightResult?: NightResult }).nightResult = this.result;
    this.onResult(this.result);
    document.getElementById("hud")!.classList.remove("ending");
    h.ui.showHud(false);
    // 行列はその場で立ち止まった隊列のまま（大行列）。Actor は複製しない
    this.stage = new PhotoStage(h.world, h.player.actor, h.parade.followers.map((f) => f.actor));
    this.photoMode.formation = 0;
    this.photoMode.arrange(false);
    this.lookAlong(true);
    h.camera.setMode("photo");
    h.clouds.setMode("photo");
    h.clouds.setPhotoLevel(2);
    this.resultUI.show(this.result, h.world.groundCanvas);
  }

  private view() {
    if (!this.state.go("view")) return;
    this.resultUI.hide();
    this.photoMode.leaveLook();
    document.getElementById("view-bar")!.classList.remove("hidden");
    this.lookAlong(false);
    this.h.camera.setMode("photo");
  }

  private photo() {
    if (!this.state.go("photo")) return;
    this.resultUI.hide();
    document.getElementById("view-bar")!.classList.add("hidden");
    this.photoMode.enter();
    this.h.camera.setMode("photo");
  }

  private backToResult() {
    if (!this.state.go("result")) return;
    this.photoMode.ui.show(false);
    document.getElementById("view-bar")!.classList.add("hidden");
    this.photoMode.leaveLook();
    this.lookAlong(false);
    this.h.camera.setMode("photo");
    this.h.clouds.setPhotoLevel(2);
    if (this.result) this.resultUI.show(this.result, this.h.world.groundCanvas);
  }

  /** 眺めるカメラ：大行列は先頭のそばから斜め横に、陣形なら全体が収まる斜めの構図 */
  private lookAlong(snap: boolean) {
    if (this.photoMode.def.layout !== "trail" || !this.stage) {
      this.photoMode.applyPreset(CAMERA_PRESETS.findIndex((p) => p.id === "diag"), snap);
      return;
    }
    const ctx = this.stage.ctx!;
    const h = this.stage.heroPos;
    this.viewS = 0;
    this.viewDir = 1;
    this.h.camera.setPhoto({ tx: h.x, ty: 1.2, tz: h.z, alpha: Math.atan2(ctx.fz, ctx.fx) + 0.5, beta: 1.12, radius: 22, fov: 0.8 }, snap);
  }

  /** これまでの夜（履歴）から、その夜の記録・絵巻を開く */
  showPastRecord(r: NightResult) {
    this.resultUI.showRecordOf(r, this.h.world.groundCanvas);
  }
  showPastEmaki(r: NightResult) {
    this.resultUI.showEmakiOf(r, this.h.world.groundCanvas);
  }

  private leave(mode: NightStartMode) {
    location.search = nightSearch(location.search, mode, this.h.seedValue);
    if (mode === "title" && !location.search) location.reload();
  }
}
