import { Engine, Scene, Vector3 } from "../core/babylon";
import { Emitter } from "../core/Events";
import { Input } from "../core/Input";
import { pick } from "../core/util";
import { Materials } from "../world/Materials";
import { World } from "../world/World";
import { makeMinimapImage } from "../world/MapPainter";
import { ModelFactory } from "../characters/ModelFactory";
import { MODELS } from "../characters/models";
import { Parade } from "./Parade";
import { Player } from "./Player";
import { WildYokai } from "./WildYokai";
import { Threats } from "./Threats";
import { Activities } from "./Activities";
import { NightClock } from "./NightClock";
import { FestivalSystems } from "./FestivalSystems";
import { OnmyojiGuards } from "./onmyoji/OnmyojiGuards";
import { ParadeTagalongs } from "./ParadeTagalongs";
import { LegendSystem } from "./legends/LegendSystem";
import { finishNormalNight, prepareNormalNight, type NormalNight } from "./normal/NormalSpawnPlanner";
import { knownZukanTypes } from "./ZukanRules";
import { PlayerControl } from "./PlayerControl";
import { DebugTools } from "./DebugTools";
import { NightSeed, parseSeed } from "../core/seed";
import type { GameEvents } from "./events";
import { STAGES, stageFor, type StageDef } from "../data/stages";
import { WORLD_LAYERS } from "../data/worldLayers";
import { DANGO_STALLS, SHRINE, START } from "../data/map";
import { YOKAI, type SeKey } from "../data/yokaiTypes";
import { AudioEngine } from "../presentation/audio/AudioEngine";
import { MusicDirector } from "../presentation/audio/MusicDirector";
import { AudioDirector } from "../presentation/audio/AudioDirector";
import { VFXDirector } from "../presentation/VFXDirector";
import { UIDirector } from "../presentation/UIDirector";
import { CameraDirector } from "../presentation/CameraDirector";
import { WorldAtmosphereDirector } from "../presentation/WorldAtmosphereDirector";
import { ParadePresentationDirector } from "../presentation/ParadePresentationDirector";
import { DistrictFestivalDirector } from "../presentation/DistrictFestivalDirector";
import { KotodamaDirector } from "../presentation/KotodamaDirector";
import { FireworksDirector } from "../presentation/FireworksDirector";
import { EmakiCloudDirector } from "../presentation/EmakiCloudDirector";
import { AfterNightDirector } from "../presentation/AfterNightDirector";
import { StructureVisibilityDirector } from "../presentation/StructureVisibilityDirector";
import { OnmyojiDirector } from "../presentation/OnmyojiDirector";
import { PlayHud } from "../presentation/PlayHud";
import { addZukan, browserKV, loadZukan, pushHistory } from "../core/SaveData";

const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");

export class Game {
  engine: Engine;
  scene: Scene;
  input: Input;
  bus = new Emitter<GameEvents>();
  mats!: Materials;
  factory!: ModelFactory;
  world!: World;
  parade!: Parade;
  player!: Player;
  wild!: WildYokai;
  threats!: Threats;
  activities!: Activities;
  clock = new NightClock(Number(params.get("night")) || 20 * 60);
  /** 一夜の種（?seed=12345）。同じ種なら今夜の山札・今宵の妖怪・顔ぶれの傾向が再現される */
  seed = new NightSeed(parseSeed(params.get("seed")));
  festival!: FestivalSystems;
  /** 神社を守る陰陽師 */
  onmyoji!: OnmyojiGuards;
  /** 大きな百鬼夜行を追いかける子供・犬（行列には加わらない） */
  tagalongs!: ParadeTagalongs;
  /** 陰陽師の陣（地面に描く） */
  onmyojiFx!: OnmyojiDirector;
  /** 大妖怪・三大妖怪・隠し妖怪（今夜の候補・加入条件の様子・縁帳） */
  legends!: LegendSystem;
  /** 後から町へ混ざる通常妖怪（今の wave・今夜の顔ぶれと配置・歩いた夜の数） */
  normal!: NormalNight;
  festDecor!: DistrictFestivalDirector;
  kotodama!: KotodamaDirector;
  fireworks!: FireworksDirector;
  /** 絵巻雲（百鬼夜行が育つほど画面が絵巻に近づく） */
  clouds!: EmakiCloudDirector;
  /** 夜が終わった後（締め → 結果 → 眺める・記念撮影・絵巻） */
  after!: AfterNightDirector;
  /** 建物の透過・写真での非表示 */
  structures!: StructureVisibilityDirector;
  /** ブラウザの保存先（図鑑・直近 10 夜の結果） */
  readonly kv = browserKV();
  /** 図鑑：これまでに仲間になった数（すべての夜の合計） */
  zukan: Record<string, number> = {};
  /** 消音が切り替わったとき（設定の保存） */
  onMuteChange: (muted: boolean) => void = () => {};
  private paradeFocus: { x: number; z: number }[] = [];

  audioEngine: AudioEngine | null = null;
  music: MusicDirector | null = null;
  audio: AudioDirector | null = null;
  vfx!: VFXDirector;
  ui = new UIDirector();
  camera!: CameraDirector;
  atmos!: WorldAtmosphereDirector;
  director!: ParadePresentationDirector;
  /** 主人公の移動入力（WASD・タップ・長押し） */
  control!: PlayerControl;
  /** 夜の間の HUD（ヒント・「！」・ミニマップ） */
  hud!: PlayHud;

  stage: StageDef = STAGES[0];
  overview = false;
  paused = false;
  unlocked = new Set<string>();
  typeCounts = new Map<string, number>();
  private t = 0;
  private stallCd = DANGO_STALLS.map(() => 0);
  private kitsunebiAt: Vector3 | null = null;
  private kitsuneTimer = 0;
  private runToggle = false;
  /** 夜が始まってからの秒数 */
  playTime = 0;
  private atShrine = false;
  private muted = false;
  /** 音量（0..1。タイトルの設定） */
  volume = 0.8;
  /** ?debug のときだけ */
  private debug: DebugTools | null = DEBUG ? new DebugTools(this) : null;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.input = new Input(canvas);
    window.addEventListener("resize", () => this.engine.resize());
  }

  async init() {
    const scene = this.scene;
    this.mats = new Materials(scene);
    this.world = new World(scene, this.mats);
    this.world.build();
    this.factory = new ModelFactory(scene, this.mats);
    this.factory.warmup(Object.keys(MODELS));
    this.camera = new CameraDirector(scene, this.canvas);
    this.camera.obstacleHeight = (x, z) => this.world.cameraObstacle(x, z);
    this.atmos = new WorldAtmosphereDirector(scene, this.world, this.mats);
    this.vfx = new VFXDirector(scene);

    this.player = new Player(this.factory, this.world, START.x, START.z);
    this.control = new PlayerControl(this.input, this.canvas, scene, this.camera, this.player, this.vfx);
    this.parade = new Parade(this.world, START.x, START.z, 0, 1);
    this.legends = new LegendSystem({ bus: this.bus, seed: this.seed, kv: this.kv, parade: this.parade, player: this.player });
    this.zukan = loadZukan(this.kv);
    this.normal = prepareNormalNight(this.kv, this.zukan, this.seed.stream("normalRoster"), this.seed.stream("normalPlace"));
    this.wild = new WildYokai(this.factory, this.world, this.bus, this.parade, this.player, this.seed.stream("wild"), this.seed.stream("wildPos"), this.legends, this.normal.plan);
    this.legends.bindHidden(this.wild);
    this.threats = new Threats(this.factory, this.world, this.bus, this.parade, this.player);
    this.activities = new Activities(this.bus, this.parade, this.player);
    this.festival = new FestivalSystems({
      bus: this.bus, factory: this.factory, world: this.world, parade: this.parade, player: this.player,
      wild: this.wild, activities: this.activities, typeCounts: this.typeCounts, seed: this.seed,
    });
    this.onmyoji = new OnmyojiGuards({
      factory: this.factory, world: this.world, bus: this.bus, parade: this.parade, player: this.player, wild: this.wild,
      rng: this.seed.stream("onmyoji"), counts: () => this.legends.counts, momentumLevel: () => this.festival.momentum.level,
    });
    this.tagalongs = new ParadeTagalongs(this.factory, this.world, this.bus, this.parade, this.player);
    this.festDecor = new DistrictFestivalDirector(this.factory, this.world);
    this.kotodama = new KotodamaDirector(scene, this.mats);
    this.fireworks = new FireworksDirector(scene, this.camera.cam);
    this.clouds = new EmakiCloudDirector(scene, this.camera.cam, (m) => this.atmos.glow.addExcludedMesh(m));
    this.onmyojiFx = new OnmyojiDirector(scene, this.vfx, (m) => this.atmos.glow.addExcludedMesh(m));
    this.structures = new StructureVisibilityDirector(scene, this.world, this.world.structureMaterials(), this.atmos.glow);
    this.after = new AfterNightDirector(this);
    const game = this;
    this.hud = new PlayHud({
      scene, canvas: this.canvas, ui: this.ui, camera: this.camera, clock: this.clock, player: this.player, parade: this.parade,
      wild: this.wild, threats: this.threats, onmyoji: this.onmyoji,
      get overview() { return game.overview; },
      known: () => this.director.known,
    });
    // 夜が正常に終わった数を数える（次の夜はページを読み直し、新しい Game の prepareNormalNight が wave を出し直す）
    this.after.onResult = (r) => {
      pushHistory(this.kv, r);
      finishNormalNight(this.kv, this.normal, r.endedAt);
    };
    console.info(`[百鬼夜行] seed=${this.seed.seed} 今宵：${this.festival.encounters.theme.text}`);
    this.ui.setMapImage(makeMinimapImage(this.world.groundCanvas, 200));
    this.ui.debugPings = DEBUG;

    // ゲームルール側の反応（演出は Director が担当）
    this.bus.on("join", (e) => {
      this.typeCounts.set(e.type, (this.typeCounts.get(e.type) ?? 0) + 1);
      this.clouds.setCount(e.total);
      this.zukan = addZukan(this.kv, e.type);
    });
    this.bus.on("rejoin", (e) => this.clouds.setCount(e.total));
    this.bus.on("scatter", (e) => {
      this.parade.scatter(e.n, e.x, e.z);
      this.bus.emit("rejoin", { type: "", total: this.parade.total });
      this.checkStage();
    });
    this.bus.on("activityComplete", (e) => this.wild.spawnBonus(e.reward.type, e.reward.n));

    this.engine.runRenderLoop(() => this.frame());
    // 最初の数フレームでシェーダをコンパイルしておく
    await scene.whenReadyAsync();
  }

  /** 一夜の段階（title / play / showcase / result / view / photo） */
  get state() {
    return this.after?.phase ?? "title";
  }
  get seedValue() {
    return this.seed.seed;
  }
  get nightLength() {
    return this.clock.duration;
  }

  /** タイトルから開始（ユーザー操作起点で AudioContext を作る） */
  start() {
    try {
      this.audioEngine = new AudioEngine();
      this.audioEngine.volume = this.volume;
      this.audioEngine.setMuted(this.muted);
      this.music = new MusicDirector(this.audioEngine);
      this.audio = new AudioDirector(this.audioEngine);
      this.audioEngine.resume();
      this.music.start();
    } catch (e) {
      console.warn("audio disabled", e);
    }
    this.festDecor.music = this.music;
    this.director = new ParadePresentationDirector(this.bus, this.music, this.audio, this.vfx, this.ui, this.camera, this.atmos, {
      festival: this.festDecor, kotodama: this.kotodama, fireworks: this.fireworks, clouds: this.clouds, onmyoji: this.onmyojiFx,
    });
    // 図鑑上で既知の妖怪（仲間にした通常の妖怪・見つけた隠し妖怪）。判定は ZukanRules だけが持つ
    for (const t of knownZukanTypes(this.zukan, this.legends.progress)) this.director.known.add(t);
    this.bus.emit("stageChange", { stage: STAGES[0], prev: STAGES[0], total: 1, up: false });
    this.after.beginNight();
    this.camera.setMode("follow");
    this.ui.showHud(true);
    this.ui.setDango(0);
    this.audio?.ui();
    setTimeout(() => this.ui.toast("小鬼「ひとりぼっちの夜道…仲間を探しに行こう」"), 800);
    setTimeout(() => this.ui.toast("妖怪に近づくと、行列に加わってくれる"), 4200);
  }

  private checkStage() {
    const total = this.parade.total;
    const s = stageFor(total);
    if (s !== this.stage) {
      const prev = this.stage;
      const up = STAGES.indexOf(s) > STAGES.indexOf(prev);
      this.stage = s;
      this.threats.setMode(s.threatMode);
      if (s.stage === "FESTIVAL" || s.stage === "HYAKKI_YAGYO") this.threats.spawnCrowd();
      this.bus.emit("stageChange", { stage: s, prev, total, up });
      if (up) {
        for (const f of this.parade.followers) f.actor.happy();
        this.player.actor.happy();
        this.vfx.burst("stage", this.player.x, 1.5, this.player.z, 70);
      }
    }
    for (const l of WORLD_LAYERS) {
      if (!this.unlocked.has(l.id) && total >= l.minCount) {
        this.unlocked.add(l.id);
        if (l.id === "yokaiBoat") this.world.showBoat();
        this.wild.activateLayer(l.id);
        this.bus.emit("layerUnlock", { id: l.id, title: l.title, text: l.text });
      }
    }
  }

  // ------------------------------------------------------------------ 操作（俯瞰・走る・図鑑・音）
  toggleOverview() {
    if (this.state !== "play") return;
    if (this.parade.total < 5) {
      this.ui.toast("俯瞰は五妖以上の行列で使える");
      return;
    }
    this.overview = !this.overview;
    this.camera.setMode(this.overview ? "overview" : "follow");
    this.audio?.ui();
  }
  setRun(v: boolean) {
    this.runToggle = v;
  }
  toggleZukan() {
    const open = !this.paused;
    this.paused = open;
    if (open) this.ui.buildZukan(this.director?.discovered ?? new Map(), this.zukan, { met: this.legends.progress.met, joinCount: this.legends.progress.joinCount, normalWave: this.normal.wave });
    this.ui.showZukan(open);
    this.audio?.kifuda();
  }
  /** 音を消す／戻す（タイトル・ゲーム中の「音」ボタンと M キー。音が鳴る前でも切り替えられる） */
  toggleMute() {
    this.setMuted(!this.muted);
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.audioEngine?.setMuted(m);
    for (const id of ["btn-mute", "btn-title-mute"]) document.getElementById(id)?.classList.toggle("on", m);
    this.onMuteChange(m);
  }
  get isMuted() {
    return this.muted;
  }
  setVolume(v: number) {
    this.volume = v;
    if (this.audioEngine) {
      this.audioEngine.volume = v;
      this.audioEngine.setMuted(this.muted);
    }
  }

  /** 夜が終わる：行列が立ち止まり、笛・太鼓が締め、カメラが引く → 結果へ（AfterNightDirector） */
  endNight(reason: "shrine" | "dawn") {
    if (this.state !== "play") return;
    this.overview = false;
    this.ui.endPrompt(false);
    this.control.moveTarget = null;
    this.after.endNight(reason);
    this.bus.emit("ending", { reason });
    // 人間プレイ用の計測（「暇だった」「忙しすぎた」を数値と一緒に調整する）
    if (DEBUG) console.table(this.festival.metricsReport());
    document.getElementById("hud")!.classList.add("ending");
    this.ui.banner(reason === "shrine" ? "奉 納" : "夜 明 け", "", reason === "shrine" ? "神社に百鬼夜行が到着した" : "東の空が白んできた…");
    for (const f of this.parade.followers) f.actor.happy();
    this.player.actor.happy();
  }

  // ------------------------------------------------------------------ ループ
  private frame() {
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000 || 0.016);
    if (!this.paused) this.update(dt);
    this.input.endFrame();
    this.scene.render();
  }

  private update(dt: number) {
    this.t += dt;
    const t = this.t;
    const inp = this.input;

    // グローバル操作
    if (inp.hit("KeyM")) this.toggleMute();
    if (this.state === "play") {
      if (inp.hit("Space", "Tab")) this.toggleOverview();
      if (inp.hit("KeyZ")) this.toggleZukan();
      this.debug?.keys(this.t);
    }

    // カメラ：押した方をカメラが向く（← 左を見る / → 右を見る / ↑ 上を見る / ↓ 下を見る）
    const afterNight = this.after.state.afterNight;
    let yaw = inp.yawDelta + (afterNight ? inp.dragYaw : 0);
    let pitch = inp.pitchDelta + (afterNight ? inp.dragPitch : 0);
    let zoom = inp.zoomDelta;
    if (inp.down("Equal", "NumpadAdd", "ZoomIn")) zoom -= dt * 1.1;
    if (inp.down("Minus", "NumpadSubtract", "ZoomOut")) zoom += dt * 1.1;
    if (inp.down("ArrowLeft", "KeyQ")) yaw += dt * 1.8;
    if (inp.down("ArrowRight") || (inp.down("KeyE") && !this.atShrine)) yaw -= dt * 1.8;
    if (inp.down("ArrowUp")) pitch += dt * 0.9;
    if (inp.down("ArrowDown")) pitch -= dt * 0.9;

    let mx = 0, mz = 0, run = false;
    if (this.state === "play") {
      ({ mx, mz } = this.control.moveVector(dt));
      run = inp.down("ShiftLeft", "ShiftRight") || this.runToggle;
      this.playTime += dt;
      this.clock.update(dt);
    }
    // 夜が終わった後は、主人公も行列も写真の舞台（AfterNightDirector）が並べて動かす
    if (!afterNight) this.player.update(dt, t, mx, mz, run);
    if (this.after.state.paradeFollows) {
      this.parade.record(this.player.x, this.player.z);
      this.parade.update(dt, t, (a) => {
        this.bus.emit("rejoin", { type: a.typeId, total: this.parade.total });
        this.checkStage();
      });
      this.parade.touchStrays(this.player.x, this.player.z, (a) => {
        this.bus.emit("rejoin", { type: a.typeId, total: this.parade.total });
        this.checkStage();
      });
    } else if (this.state === "title") {
      this.parade.update(dt, t, () => {});
    }

    if (this.state === "play") {
      this.legends.update(dt);
      const before = this.parade.total;
      this.wild.update(dt, t, this.clock.progress);
      if (this.parade.total !== before) this.checkStage();
      this.threats.update(dt, t);
      this.activities.update();
      this.updateStalls(dt);
      // v0.2：街が百鬼夜行に応える（賑わい・気配・Pacing・Encounter・地区覚醒）
      const moving = Math.hypot(mx, mz) > 0.1 && this.player.actor.speed > 1.2;
      const before2 = this.parade.total;
      this.festival.update(dt, t, moving, this.stage);
      if (this.parade.total !== before2) this.checkStage();
      // 神社の陰陽師（祓われると行列が減る）・大きな百鬼夜行を追いかける子供と犬
      const before3 = this.parade.total;
      this.onmyoji.update(dt, t, this.clock.progress);
      if (this.parade.total !== before3) {
        this.bus.emit("rejoin", { type: "", total: this.parade.total });
        this.checkStage();
      }
      this.tagalongs.update(dt, t);

      // 目的地
      const sd = Math.hypot(this.player.x - SHRINE.x, this.player.z - SHRINE.z);
      this.atShrine = sd < SHRINE.endRadius;
      this.ui.endPrompt(this.atShrine);
      if (this.atShrine && inp.hit("KeyE", "Enter")) this.endNight("shrine");
      if (this.clock.isDawn) this.endNight("dawn");
      this.after.track();
    } else if (this.state === "title") {
      this.threats.update(dt, t);
      this.wild.update(dt, t, this.clock.progress);
    }
    // 締めの演出・結果・眺める・記念撮影（ゲームの進行は止まっている）
    this.after.update(dt, t, inp);

    // 演出
    const b = this.parade.bounds(this.player.x, this.player.z);
    const tail = { x: 0, z: 0, dx: 0, dz: 0 };
    this.parade.tail(tail);
    const lastF = this.parade.followers[this.parade.followers.length - 1];
    this.camera.update(
      {
        px: this.player.x, pz: this.player.z, pvx: this.player.vx, pvz: this.player.vz,
        count: this.parade.total, bounds: b,
        tailX: lastF ? lastF.actor.x : tail.x, tailZ: lastF ? lastF.actor.z : tail.z, dt,
      },
      yaw,
      pitch,
      zoom,
    );
    this.atmos.update(dt, t, this.player.x, this.player.actor.y, this.player.z, this.clock.progress);
    this.director?.setListener(this.player.x, this.player.z);
    this.director?.update(dt, t);
    this.onmyojiFx.update(dt, this.onmyoji.guards);
    this.festDecor.update(dt, t, this.player.x, this.player.z, lastF ? lastF.actor.x : tail.x, lastF ? lastF.actor.z : tail.z);
    this.world.update(t);
    if (this.state === "play") this.clouds.setMode(this.overview ? "overview" : "play");
    this.clouds.update(dt);
    // 建物の透過：夜の間は主人公・カメラ（設定で百鬼夜行も）のまわり。夜の後はカメラのまわりだけ
    const cp = this.camera.cam.position;
    const night = this.state === "play" || this.state === "showcase";
    this.paradeFocus.length = 0;
    if (night && this.structures.mode === 2) {
      const fs = this.parade.followers;
      const step = Math.max(1, Math.ceil(fs.length / 24));
      for (let i = 0; i < fs.length; i += step) this.paradeFocus.push({ x: fs[i].actor.x, z: fs[i].actor.z });
    }
    this.structures.update(dt, {
      player: night ? { x: this.player.x, y: this.player.actor.y, z: this.player.z } : null,
      camera: this.state === "title" ? null : { x: cp.x, y: cp.y, z: cp.z },
      parade: this.paradeFocus,
    });

    this.kitsuneTimer -= dt;
    if (this.kitsuneTimer <= 0 && this.parade.count > 0) {
      this.kitsuneTimer = 0.35;
      const f = pick(this.parade.followers).actor;
      this.kitsunebiAt = new Vector3(f.x, f.y, f.z);
    }
    const yawP = this.player.actor.yaw;
    this.vfx.setTarget(this.camera.targetPos.x, this.camera.targetPos.z);
    const photoFx = this.after.vfxFlags();
    this.vfx.update({
      playerLantern: new Vector3(this.player.x + Math.cos(yawP) * 0.33 + Math.sin(yawP) * 0.46, 1.1, this.player.z - Math.sin(yawP) * 0.33 + Math.cos(yawP) * 0.46),
      kitsunebiAt: this.kitsunebiAt,
      kitsunebi: photoFx ? photoFx.kitsunebi : this.stage.kitsunebi || this.state === "showcase",
      confetti: photoFx ? photoFx.confetti : this.stage.confetti || this.state === "showcase",
      dawn: this.atmos.dawn,
    });
    if (this.music) this.music.dawn = this.atmos.dawn;

    if (this.state === "play") this.hud.update(dt);
    if (this.state !== "title") this.debug?.overlay(dt);
    if (this.audio && this.state !== "title") {
      const near: SeKey[] = [];
      for (const f of this.parade.followers) {
        if (near.length > 12) break;
        if (Math.abs(f.actor.x - this.player.x) + Math.abs(f.actor.z - this.player.z) < 18) near.push(YOKAI[f.actor.typeId].se);
      }
      this.audio.crowdTick(dt, near, Math.min(1, Math.hypot(this.player.vx, this.player.vz) / 6), this.parade.count);
    }
  }

  private updateStalls(dt: number) {
    DANGO_STALLS.forEach(([x, z], i) => {
      if (this.stallCd[i] > 0) this.stallCd[i] -= dt;
      if (this.stallCd[i] <= 0 && Math.hypot(this.player.x - x, this.player.z - z) < 3.4 && this.player.dango < 3) {
        this.player.dango = 3;
        this.stallCd[i] = 25;
        this.bus.emit("dango", { n: this.player.dango });
        this.bus.emit("toast", { text: "団子屋「妖怪さんにも、おまけだよ」 団子をもらった" });
        this.audio?.dango();
      }
    });
  }
}
