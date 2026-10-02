import { Color4 } from "../core/babylon";
import { CAMERA_PRESETS, FORMATIONS, PHOTO_STYLES, POSE_STYLES, type CameraPresetDef, type FormationDef, type PhotoStyleDef } from "../data/photo";
import type { Input } from "../core/Input";
import type { NightResult } from "../game/after/NightResult";
import type { PhotoStage } from "../game/after/PhotoStage";
import { SHRINE_PHOTO, findPhotoSpot, shrinePhotoSpot } from "../game/after/PhotoSpot";
import type { FaceMode } from "../game/after/PhotoPose";
import type { FormationContext } from "../game/after/PhotoFormation";
import type { HideCategory } from "../world/structureFade";
import type { AfterNightHost } from "./AfterNightDirector";
import { PhotoUI, type PhotoFx, type PhotoToggle } from "./PhotoUI";
import { PhotoShot } from "./PhotoShot";

/** 撮影のカメラの前後・左右・高さの速さ（歩／秒） */
const NUDGE_SPEED = 12;

/**
 * 記念撮影（フォトモード）：並び（陣形）・姿（ポーズ）・風情（写真スタイル）・構図（カメラ）・演出・隠す・撮る。
 * 並べる場所は、大行列はその場、ほかの陣形は参道の鳥居を背にした広場（PhotoStage.shrinePhotoSpot。撮影の間だけ御神木を隠す。
 * 無理なら近くの開けた場所）。
 * カメラは回す・寄る・前後・左右・高さを手で動かせ、「向き直る」「こっち向いて」でみんながカメラの方を向く。
 * 並べ直すのは行列の Actor だけ（複製しない）。写真の演出はゲームの状態を変えない。
 */
export class PhotoModeDirector {
  formation = 0;
  private poseStyle = 0;
  private photoStyle = 0;
  private preset = 0;
  fx: PhotoFx = { clouds: 2, fireworks: false, confetti: false, kitsunebi: false, lanterns: true, hide: [] };
  private bystanders = { x: 0, z: 0, r: 0 };
  private fwT = 0;
  private hidden: { setVisible(v: boolean): void }[] = [];
  readonly ui: PhotoUI;
  /** 撮る・保存・共有 */
  private shot: PhotoShot;
  private saved: { exposure: number; contrast: number; vignette: boolean; vignetteWeight: number; vignetteColor: Color4 } | null = null;

  constructor(
    private h: AfterNightHost,
    private stage: () => PhotoStage | null,
    result: () => NightResult | null,
    back: () => void,
    private isPhoto: () => boolean,
  ) {
    this.ui = new PhotoUI({
      formation: () => this.cycleFormation(),
      pose: () => this.cyclePose(),
      style: () => this.applyStyle((this.photoStyle + 1) % PHOTO_STYLES.length),
      preset: () => this.applyPreset((this.preset + 1) % CAMERA_PRESETS.length, false),
      face: () => this.faceCamera("body"),
      look: () => this.faceCamera("look"),
      clouds: (l) => this.setFx({ clouds: l }),
      toggle: (k: PhotoToggle) => this.setFx({ [k]: !this.fx[k] }),
      hide: (c: HideCategory) => this.toggleHide(c),
      shoot: () => void this.shot.shoot(),
      savePlain: () => void this.shot.savePlain(),
      saveCard: () => void this.shot.saveCard(),
      share: () => void this.shot.share(),
      copy: () => void this.shot.copyResult(),
      back,
    });
    this.shot = new PhotoShot({
      engine: h.engine, camera: h.camera, audio: () => h.audio, ui: this.ui,
      seed: () => h.seedValue, total: () => h.parade.total, result,
    });
  }

  get def(): FormationDef {
    return FORMATIONS[this.formation];
  }

  /** 記念撮影を始める：少人数なら扇、多ければ雛壇から（大行列のままなら切り替える） */
  enter() {
    const want = this.h.parade.total >= 40 ? "hinadan" : "ougi";
    if (this.def.id === "gyoretsu") this.formation = FORMATIONS.findIndex((f) => f.id === want);
    this.arrange(true);
    this.applyStyle(this.photoStyle, false);
    this.applyPreset(0, true);
    this.ui.show(true);
    this.ui.toast("ドラッグで回す・ピンチ／ホイールで寄る。「向き直る」「こっち向いて」でカメラの方を向く");
  }

  /** 毎フレーム（撮影中だけ）：キー操作と撮影の花火 */
  update(dt: number, input: Input) {
    this.input(dt, input);
    // 撮影の花火（写真用。ゲームの状態は変えない）
    if (this.fx.fireworks) {
      this.fwT -= dt;
      if (this.fwT <= 0) {
        this.fwT = 5 + Math.random() * 3;
        this.h.fireworks.show(Math.random() < 0.5 ? 2 : 1);
      }
    }
  }

  // ---------------------------------------------------------------- 並び・姿・風情・構図
  private cycleFormation() {
    this.formation = (this.formation + 1) % FORMATIONS.length;
    this.arrange(true);
    this.applyPreset(this.preset, false);
    this.h.clouds.swell(0.55);
  }

  private cyclePose() {
    this.poseStyle = (this.poseStyle + 1) % POSE_STYLES.length;
    this.stage()?.setPoseStyle(POSE_STYLES[this.poseStyle]);
    const em = POSE_STYLES[this.poseStyle].emphasis;
    if (em === "kitsunebi") this.setFx({ kitsunebi: true });
    if (em === "confetti") this.setFx({ confetti: true });
    this.labels();
  }

  /** みんながカメラの方を向く：body = 体ごと向き直る、look = こっち向いて（顔が向く分だけ振り向く）。並び・姿を替えると戻る */
  private faceCamera(mode: FaceMode) {
    const st = this.stage();
    if (!st) return;
    const p = this.h.camera.cam.position;
    st.faceToward(p.x, p.z, mode);
    this.ui.setFacing(mode);
    this.ui.toast(mode === "body" ? "みんなカメラの方へ向き直った" : "こっち向いて！");
  }

  /** 陣形に並べる。大行列は今の場所、ほかは参道の鳥居を背にした広場（無理なら近くの開けた場所）へ集合 */
  arrange(showHint: boolean) {
    const st = this.stage();
    if (!st) return;
    const def = this.def;
    const p = this.h.player;
    const hero = { x: p.actor.x, z: p.actor.z, yaw: p.actor.yaw };
    const cam = this.h.camera.cam;
    const prefer = { fx: Math.cos(cam.alpha), fz: Math.sin(cam.alpha) };
    let ctx: FormationContext;
    const members = st.members();
    if (def.layout === "trail") {
      // 行列の長い向きの真横を正面に（今カメラがいる側）
      let sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0;
      const pts = [hero, ...members];
      for (const m of pts) {
        sx += m.x;
        sz += m.z;
      }
      const cx = sx / pts.length, cz = sz / pts.length;
      for (const m of pts) {
        sxx += (m.x - cx) ** 2;
        szz += (m.z - cz) ** 2;
        sxz += (m.x - cx) * (m.z - cz);
      }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      let fx = -Math.sin(th), fz = Math.cos(th);
      if (fx * prefer.fx + fz * prefer.fz < 0) [fx, fz] = [-fx, -fz];
      ctx = { anchorX: cx, anchorZ: cz, fx, fz, hero };
      this.clearPlaza(false);
    } else {
      const spot = shrinePhotoSpot(this.h.world, def, members, hero);
      this.clearPlaza(!!spot);
      ctx = spot ?? findPhotoSpot(this.h.world, def, members, hero, prefer);
    }
    st.arrange(def, ctx, POSE_STYLES[this.poseStyle]);
    this.ui.setFacing(null);
    // 撮影中だけ、並べた場所のまわりの NPC を隠す（結果・眺めるで並べ直すときは隠さない）
    if (this.isPhoto()) this.hideBystanders(ctx.anchorX, ctx.anchorZ, 20 + Math.sqrt(members.length) * 2.5);
    else this.restoreBystanders();
    this.labels();
    if (showHint) this.ui.toast(`${def.name}：${def.text}`);
  }

  /** 広場で撮るときだけ、真ん中の御神木を隠す（ゲームの状態は変えない。撮影が終われば戻る） */
  private clearPlaza(on: boolean) {
    const c = SHRINE_PHOTO.clear;
    this.h.structures.setHiddenIds(on ? [this.h.world.structureAt(c.x, c.z, "landmark")] : []);
  }

  /** 写真から隠す分類（重要な建物・その他の建築物・木・NPC）。建物の地面の影も一緒に消える。ゲームの状態は変えない */
  private toggleHide(c: HideCategory) {
    const on = !this.fx.hide.includes(c);
    this.fx.hide = on ? [...this.fx.hide, c] : this.fx.hide.filter((x) => x !== c);
    if (c === "npc") {
      const b = this.bystanders;
      this.hideBystanders(b.x, b.z, b.r);
      this.h.festDecor.setFolkHidden(on);
    } else {
      this.h.structures.setHidden(c, on);
      if (c === "building") this.h.festDecor.setDecorHidden(on);
    }
    this.ui.setFx(this.fx);
  }

  /**
   * 撮影中だけ：並べた場所のまわりの、行列ではない妖怪・人を写真から外す。「NPC を隠す」ならすべて。
   * 前に隠したものは一度戻してから隠し直す（撮影の開始・並べ直し・「NPC を隠す」の切り替え）。撮影を終えるときは restoreBystanders
   */
  private hideBystanders(x: number, z: number, r: number) {
    this.restoreBystanders();
    this.bystanders = { x, z, r };
    const all = this.fx.hide.includes("npc") && this.isPhoto();
    const near = (ax: number, az: number) => all || Math.hypot(ax - x, az - z) < r;
    for (const w of this.h.wild.list) {
      for (const a of [w.actor, w.dormant]) {
        if (a && a.isVisible && near(a.x, a.z)) {
          a.setVisible(false);
          this.hidden.push(a);
        }
      }
    }
    for (const th of this.h.threats.list) if (th.actor.isVisible && near(th.actor.x, th.actor.z)) (th.actor.setVisible(false), this.hidden.push(th.actor));
    for (const c of this.h.threats.crowd) if (c.isVisible && near(c.x, c.z)) (c.setVisible(false), this.hidden.push(c));
    for (const c of [...this.h.onmyoji.actors(), ...this.h.tagalongs.actors()]) if (c.isVisible && near(c.x, c.z)) (c.setVisible(false), this.hidden.push(c));
  }

  applyPreset(i: number, snap: boolean) {
    this.preset = i;
    const st = this.stage();
    const b = st?.bounds();
    const ctx = st?.ctx;
    if (!st || !b || !ctx) return;
    const p: CameraPresetDef = CAMERA_PRESETS[i];
    const eng = this.h.engine;
    const aspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
    const fov = p.fov ?? 0.8;
    const portrait = aspect < 1;
    const vHalf = portrait ? Math.atan(Math.tan(fov / 2) / aspect) : fov / 2;
    const hHalf = portrait ? fov / 2 : Math.atan(Math.tan(fov / 2) * aspect);
    // カメラのいる向き（行列の正面から yaw だけ回す／横長は真横から）
    const rx = ctx.fz, rz = -ctx.fx;
    let dx = ctx.fx, dz = ctx.fz;
    if (p.side && this.def.layout !== "trail") [dx, dz] = [rx, rz];
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    [dx, dz] = [dx * cy - dz * sy, dx * sy + dz * cy];
    let tx = b.cx, tz = b.cz, ty = Math.min(4, b.height * 0.35 + 0.6), radius: number;
    if (p.hero) {
      tx = st.heroPos.x;
      tz = st.heroPos.z;
      ty = 1;
      radius = 7;
    } else {
      // 横幅・奥行きを、カメラから見た向きに投影して、全体が収まる距離
      const w = Math.abs(b.width * (dx * ctx.fx + dz * ctx.fz)) + Math.abs(b.depth * (dx * rx + dz * rz));
      const dep = Math.abs(b.depth * (dx * ctx.fx + dz * ctx.fz)) + Math.abs(b.width * (dx * rx + dz * rz));
      const rw = (w / 2 + 2.5) / Math.tan(hHalf);
      const rh = (b.height + 1.5) / Math.tan(vHalf);
      const rd = p.beta < 0.8 ? (dep / 2 + 3) / Math.tan(vHalf) : 0;
      radius = (Math.max(rw, rh, rd, 8) + (p.beta < 0.8 ? 0 : dep * 0.2)) * p.fit;
    }
    this.h.camera.setPhoto({ tx, ty, tz, alpha: Math.atan2(dz, dx), beta: p.beta, radius, fov }, snap);
    this.labels();
  }

  applyStyle(i: number, announce = true) {
    this.photoStyle = i;
    const s: PhotoStyleDef = PHOTO_STYLES[i];
    this.setFx({ clouds: s.clouds, fireworks: s.fireworks, confetti: s.confetti, kitsunebi: s.kitsunebi, lanterns: s.lanterns });
    const ip = this.h.scene.imageProcessingConfiguration;
    if (!this.saved) {
      this.saved = { exposure: ip.exposure, contrast: ip.contrast, vignette: ip.vignetteEnabled, vignetteWeight: ip.vignetteWeight, vignetteColor: ip.vignetteColor.clone() };
    }
    ip.exposure = s.exposure;
    ip.contrast = s.contrast;
    ip.vignetteEnabled = s.vignette > 0;
    ip.vignetteWeight = s.vignette;
    ip.vignetteColor = new Color4(0.25 * s.warm, 0.15 * s.warm, 0.08 * s.warm, 1);
    this.h.music?.festive(s.id === "matsuri");
    if (announce) this.ui.toast(`${s.name}：${s.text}`);
    this.labels();
  }

  private setFx(o: Partial<PhotoFx>) {
    this.fx = { ...this.fx, ...o };
    this.h.clouds.setPhotoLevel(this.fx.clouds);
    this.h.world.setLanternLevel(this.fx.lanterns ? Math.max(3, this.h.stage.lanternLevel) : 1);
    if (o.fireworks) this.fwT = 0;
    if (o.clouds !== undefined) this.h.clouds.swell(0.3);
    this.ui.setFx(this.fx);
  }

  /** 撮影で隠した NPC（野良妖怪・人・陰陽師・子供・犬）をすべて表示へ戻す */
  private restoreBystanders() {
    for (const a of this.hidden) a.setVisible(true);
    this.hidden = [];
  }

  /** 撮影の見た目を夜の終わりの状態へ戻す（ゲームの状態は元から変えていない） */
  leaveLook() {
    // 写真で隠した建物（と地面の影）・NPC を戻す
    this.fx.hide = [];
    this.h.structures.clearHidden();
    this.h.festDecor.setDecorHidden(false);
    this.h.festDecor.setFolkHidden(false);
    this.restoreBystanders();
    const ip = this.h.scene.imageProcessingConfiguration;
    if (this.saved) {
      ip.exposure = this.saved.exposure;
      ip.contrast = this.saved.contrast;
      ip.vignetteEnabled = this.saved.vignette;
      ip.vignetteWeight = this.saved.vignetteWeight;
      ip.vignetteColor = this.saved.vignetteColor;
      this.saved = null;
    }
    this.h.world.setLanternLevel(this.h.stage.lanternLevel);
    this.h.music?.festive(false);
    this.fx.fireworks = false;
  }

  private labels() {
    this.ui.setLabels({
      formation: this.def.name,
      pose: POSE_STYLES[this.poseStyle].name,
      style: PHOTO_STYLES[this.photoStyle].name,
      preset: CAMERA_PRESETS[this.preset].name,
      hint: `${this.def.name} × ${POSE_STYLES[this.poseStyle].name}`,
    });
  }

  /**
   * 撮影中のキー操作（視点パッドの Photo* も同じ）：A/D 左右、R/F 前後、W/S 高さ、1〜5 並び、
   * T 向き直る、Y こっち向いて、H UI、Space 撮る、Esc 戻る
   */
  private input(dt: number, input: Input) {
    const cam = this.h.camera;
    const sp = NUDGE_SPEED * dt;
    let right = 0, up = 0, fwd = 0;
    if (input.down("KeyA", "PhotoLeft")) right -= sp;
    if (input.down("KeyD", "PhotoRight")) right += sp;
    if (input.down("KeyR", "PhotoFwd")) fwd += sp;
    if (input.down("KeyF", "PhotoBack")) fwd -= sp;
    if (input.down("KeyW", "PhotoUp")) up += sp * 0.6;
    if (input.down("KeyS", "PhotoDown")) up -= sp * 0.6;
    if (right || up || fwd) cam.photoNudge(right, up, fwd);
    for (let k = 1; k <= FORMATIONS.length; k++) {
      if (input.hit(`Digit${k}`)) {
        this.formation = k - 1;
        this.arrange(true);
        this.applyPreset(this.preset, false);
        this.h.clouds.swell(0.55);
      }
    }
    if (input.hit("KeyT")) this.faceCamera("body");
    if (input.hit("KeyY")) this.faceCamera("look");
    if (input.hit("KeyH")) this.ui.setClean(!this.ui.clean);
    if (input.hit("Space")) void this.shot.shoot();
    input.tap = null;
  }
}
