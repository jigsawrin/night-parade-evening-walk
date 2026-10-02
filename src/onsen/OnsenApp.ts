import { Engine, Scene } from "../core/babylon";
import { NightSeed } from "../core/seed";
import { browserKV, loadLegendProgress, loadOnsenVisit, loadZukan, saveLegendProgress, saveOnsenVisit } from "../core/SaveData";
import { YOKAI } from "../data/yokaiTypes";
import { ONSEN_FLOOR_Y, ONSEN_SPOTS, ONSEN_START } from "../data/onsenMap";
import { ModelFactory } from "../characters/ModelFactory";
import { FACE_ANCHORS } from "../characters/models";
import { Input } from "../core/Input";
import { Materials } from "../world/Materials";
import { Player } from "../game/Player";
import { PlayerControl } from "../game/PlayerControl";
import { discoverHidden } from "../game/legends/LegendProgress";
import { isZukanSeen } from "../game/ZukanRules";
import { beginVisit, firstDiscoveriesNow, leaveVisit, onsenAccess, openZones, visitGuests } from "../game/onsen/OnsenVisit";
import { savedNormalWave } from "../game/normal/NormalUnlockRules";
import { placeGuests } from "../game/onsen/OnsenPlacementRules";
import { floorsToPrepare, shownFloor } from "../game/onsen/OnsenGroundRules";
import { CameraDirector } from "../presentation/CameraDirector";
import { StructureVisibilityDirector } from "../presentation/StructureVisibilityDirector";
import { ZukanBook } from "../presentation/zukan/ZukanBook";
import { capturePhoto, dataUrlToBlob, saveBlob, shareImage } from "../presentation/ShareTools";
import { OnsenWorld, UPPER_GROUPS } from "./OnsenWorld";
import { OnsenAtmosphere } from "./OnsenAtmosphere";
import { OnsenGuests, type Guest } from "./OnsenGuests";
import { OnsenUI } from "./OnsenUI";
import { AudioEngine } from "../presentation/audio/AudioEngine";
import { loadOptions, saveOptions } from "../presentation/OptionsUI";
import { OnsenMusic } from "./audio/OnsenMusic";
import { OnsenSoundscape } from "./audio/OnsenSoundscape";
import { OnsenBath } from "./OnsenBath";

const $ = (id: string) => document.getElementById(id)!;

/** 宿のカメラ：室内なので本編より近く、少し高めから */
const FRAMING = { distance: 11, pitch: 1.0 };
/** 足元の影を床からどれだけ浮かせるか（床の上面・畳の目地より上。ちらつかないように） */
const SHADOW_LIFT = 0.08;
/** 提灯・灯籠などの小物を、主人公のこの距離の中で透かす（歩） */
const SMALL_FADE_R = 3;
/** 撮影のカメラの移動の速さ（歩／秒） */
const NUDGE = 9;

export interface OnsenOptions {
  /** 画質（0 = 軽量） */
  quality: number;
  /** 建物の透過（0 切・1 主人公とカメラ・2 も同じ扱い） */
  fade: number;
  /** 音量（0..1）と消音（タイトルの設定と同じ保存） */
  volume: number;
  muted: boolean;
}

/**
 * 温泉宿「宵霞楼」を開く（`?onsen`。main.ts から import() で読む：本編の夜だけ遊ぶときはこのコードを読まない）。
 *  入れるか（縁帳の onsenEntrance）→ 訪問（hyakki.onsen.v1：宿を出るまで同じ種）→ 今回の宿泊客（drawOnsenGuests。初めて見つかる隠し妖怪は forced）
 *  → 居場所（placeGuests）→ 選ばれた客のモデルだけを用意 → 宿の箱庭を組み立てて歩く。
 * 本編の町・夜の刻・Pacing・Encounter・陰陽師・脅威・賑わい・今夜の候補・野良妖怪はここには無い。宿では加入の判定もしない。
 * 唯一の特別な出来事は、見つけていない隠し妖怪（ぬらりひょん）に話しかけたときの発見（LegendProgress.discoverHidden）。
 */
export async function startOnsen(canvas: HTMLCanvasElement, opts: OnsenOptions) {
  const kv = browserKV();
  const progress = loadLegendProgress(kv);
  const access = onsenAccess(progress);
  if (!access.entrance) {
    location.href = location.pathname;
    return;
  }
  const zukan = loadZukan(kv);
  const normalWave = savedNormalWave(kv, zukan);
  const visitSave = beginVisit(loadOnsenVisit(kv), () => (Math.random() * 4294967296) >>> 0, firstDiscoveriesNow(zukan, progress, normalWave));
  saveOnsenVisit(kv, visitSave);
  const visit = visitSave.active!;
  const guests = visitGuests(zukan, progress, visit);
  const placeRng = new NightSeed(visit.seed).stream("onsenPlace");
  const placements = placeGuests(guests.all, YOKAI, ONSEN_SPOTS, openZones(access), () => placeRng.next());
  const low = opts.quality === 0;

  const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
  engine.setHardwareScalingLevel(low ? 1.25 : 1 / Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;
  window.addEventListener("resize", () => engine.resize());
  const mats = new Materials(scene);
  const world = new OnsenWorld(scene, mats, access);
  world.build();
  const factory = new ModelFactory(scene, mats);
  // 今回の客（と主人公）のモデルだけを用意する（全員分は作らない）
  factory.warmup(["hero", ...new Set(placements.map((p) => p.type))]);
  const camera = new CameraDirector(scene, canvas);
  camera.obstacleHeight = (x, z) => world.cameraObstacle(x, z);
  camera.setFollowFraming(FRAMING.distance, FRAMING.pitch);
  camera.yaw = -Math.PI / 2;
  camera.setMode("follow");
  const atmos = new OnsenAtmosphere(scene, world, mats, low);
  const structures = new StructureVisibilityDirector(scene, world, world.structureMaterials(), atmos.glow, UPPER_GROUPS);
  structures.mode = opts.fade === 0 ? 0 : 1;
  // 月見の奥庭：今は見せない方の姿（閉じていれば奥庭、開いていれば森）を隠す
  structures.setHiddenIds(world.hiddenInnerIds());
  const input = new Input(canvas);
  const player = new Player(factory, world, ONSEN_START.x, ONSEN_START.z);
  const control = new PlayerControl(input, canvas, scene, camera, player, { burst: () => {} });
  const inn = new OnsenGuests(factory, placements);
  const book = new ZukanBook();
  // 湯に入る：ゆっくり歩き、しばらく浸かると顔がほんのり赤く
  const bath = new OnsenBath(scene, world, player, FACE_ANCHORS.hero, {
    enter: (x, z) => {
      atmos.ripple(x, z);
      sound?.scape.splash();
    },
    wade: (x, z) => atmos.ripple(x, z),
  });

  // ---------------------------------------------------------------- 音（最初の操作で鳴りはじめる：ブラウザの決まり）
  let sound: { engine: AudioEngine; music: OnsenMusic; scape: OnsenSoundscape } | null = null;
  let muted = opts.muted;
  const startSound = () => {
    if (sound) return;
    try {
      const engine = new AudioEngine();
      engine.volume = opts.volume;
      engine.setMuted(muted);
      engine.resume();
      const music = new OnsenMusic(engine);
      music.start();
      const scape = new OnsenSoundscape(engine, access);
      // 音が鳴りはじめる前に奥庭が開いていたら、それも伝える
      if (world.innerOpen) scape.openInner();
      scape.arrive();
      sound = { engine, music, scape };
    } catch (e) {
      console.warn("audio disabled", e);
    }
  };
  window.addEventListener("pointerdown", startSound, { once: true });
  window.addEventListener("keydown", startSound, { once: true });
  const setMuted = (m: boolean) => {
    muted = m;
    sound?.engine.setMuted(m);
    $("onsen-mute").classList.toggle("on", m);
    const o = loadOptions();
    o.muted = m;
    saveOptions(o);
  };
  $("onsen-mute").classList.toggle("on", muted);
  $("onsen-mute").addEventListener("click", () => {
    startSound();
    setMuted(!muted);
  });

  // ---------------------------------------------------------------- 話す
  let near: Guest | null = null;
  let talkingTo: Guest | null = null;
  let nearT = 0;
  const talked = new Map<string, number>();
  let pendingNote: string | null = null;
  let innerJustOpened = false;
  /**
   * 隠し妖怪を見つけて縁帳が変わったら、入れるかを見直す。月見の奥庭が開いたなら、この訪問のまま門を開ける
   * （訪問・種・必ずいる客・宿泊客・居場所は変えない。宿も作り直さない）
   */
  const reviewAccess = () => {
    if (world.innerOpen || !onsenAccess(progress).inner) return;
    world.openInner();
    structures.setHiddenIds(world.hiddenInnerIds());
    atmos.openInner();
    sound?.scape.openInner();
    innerJustOpened = true;
  };
  const talk = () => {
    if (talkingTo) {
      // 会話を閉じる
      talkingTo.facing = null;
      talkingTo = null;
      ui.hideDialog();
      if (pendingNote) {
        ui.note(pendingNote, "新たな妖怪が図鑑に記された");
        pendingNote = null;
        // 奥の門がいつの間にか開いていたなら、しばらくしてから小さく
        if (innerJustOpened) window.setTimeout(() => ui.toast("奥の方で、戸の開く音がした。"), 5200);
        innerJustOpened = false;
      }
      return;
    }
    if (!near) return;
    const g = near;
    const def = YOKAI[g.type];
    // まだ見つけていない隠し妖怪：話しかけたこのときに見つける（縁帳の met。図鑑はここから決まる）。名前はまだ出さない
    const known = isZukanSeen(g.type, zukan, progress);
    if (!known && def.discovery === "hidden" && discoverHidden(progress, g.type, Date.now(), (p) => saveLegendProgress(kv, p))) {
      pendingNote = def.name;
      reviewAccess();
    }
    const lines = def.onsen?.lines ?? ["……（湯煙の向こうで、くつろいでいる）"];
    const n = talked.get(g.type) ?? 0;
    talked.set(g.type, n + 1);
    g.facing = { x: player.x, z: player.z };
    talkingTo = g;
    ui.showDialog(known ? def.name : "", lines[n % lines.length]);
  };

  // ---------------------------------------------------------------- 写真（景色をそのまま撮る。客を並べ替えない）
  let photo = false;
  let shotUrl = "";
  const enterPhoto = () => {
    if (talkingTo) talk();
    photo = true;
    const c = camera.cam;
    camera.setPhoto({ tx: player.x, ty: player.actor.y + 1.2, tz: player.z, alpha: c.alpha, beta: c.beta, radius: c.radius, fov: 0.8 }, true);
    camera.setMode("photo");
    ui.setPhoto(true);
    ui.toast("ドラッグで回す・ピンチ／ホイールで寄る");
  };
  const leavePhoto = () => {
    photo = false;
    camera.setMode("follow");
    ui.setPhoto(false);
  };
  const shoot = async () => {
    try {
      shotUrl = await capturePhoto(engine, camera.cam);
      ui.showShot(shotUrl);
    } catch (e) {
      console.warn(e);
      ui.toast("撮影できませんでした");
    }
  };
  const fileName = () => `hyakki_yoigasumiro_${visitSave.visitNo}.png`;

  const ui = new OnsenUI({
    talk,
    zukan: () => {
      book.build(new Map(), zukan, { met: progress.met, joinCount: progress.joinCount, normalWave });
      book.show(true);
    },
    photo: enterPhoto,
    leave: () => {
      saveOnsenVisit(kv, leaveVisit(loadOnsenVisit(kv)));
      location.href = location.pathname;
    },
    shoot: () => void shoot(),
    photoBack: leavePhoto,
    save: () => void (async () => shotUrl && saveBlob(await dataUrlToBlob(shotUrl), fileName()))(),
    share: () => void (async () => {
      if (!shotUrl) return;
      const r = await shareImage(await dataUrlToBlob(shotUrl), fileName(), "宵霞楼にて #百鬼夜行宵歩き");
      if (r === "fallback") ui.toast("画像を保存しました");
    })(),
  });
  $("zukan-close").addEventListener("click", () => book.show(false));
  // 視点パッド：押している間だけ、そのキーを押したことにする
  document.querySelectorAll<HTMLButtonElement>("#onsen-ui .pad[data-key]").forEach((b) => {
    const code = b.dataset.key!;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      input.hold(code, true);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => input.hold(code, false));
  });
  ui.setGuests(guests.all.length);

  // ---------------------------------------------------------------- 毎フレーム
  let t = 0;
  let solidStair: string | null = null;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000 || 0.016);
    t += dt;
    const inp = input;
    const zukanOpen = !$("zukan").classList.contains("hidden");
    let yaw = inp.yawDelta + (photo ? inp.dragYaw : 0);
    let pitch = inp.pitchDelta + (photo ? inp.dragPitch : 0);
    let zoom = inp.zoomDelta;
    if (inp.down("Equal", "NumpadAdd", "ZoomIn")) zoom -= dt * 1.1;
    if (inp.down("Minus", "NumpadSubtract", "ZoomOut")) zoom += dt * 1.1;
    if (inp.down("ArrowLeft", "KeyQ")) yaw += dt * 1.8;
    if (inp.down("ArrowRight")) yaw -= dt * 1.8;
    if (inp.down("ArrowUp")) pitch += dt * 0.9;
    if (inp.down("ArrowDown")) pitch -= dt * 0.9;
    let mx = 0, mz = 0;
    if (photo) {
      const sp = NUDGE * dt;
      let right = 0, up = 0, fwd = 0;
      if (inp.down("KeyA", "PhotoLeft")) right -= sp;
      if (inp.down("KeyD", "PhotoRight")) right += sp;
      if (inp.down("KeyR", "PhotoFwd")) fwd += sp;
      if (inp.down("KeyF", "PhotoBack")) fwd -= sp;
      if (inp.down("KeyW", "PhotoUp")) up += sp * 0.6;
      if (inp.down("KeyS", "PhotoDown")) up -= sp * 0.6;
      if (right || up || fwd) camera.photoNudge(right, up, fwd);
      if (inp.hit("Space")) void shoot();
      if (inp.hit("KeyH")) ui.setClean(!document.body.classList.contains("onsen-clean"));
      if (inp.hit("Escape")) leavePhoto();
      inp.tap = null;
    } else if (!zukanOpen) {
      if (talkingTo) {
        // 吹き出しの外をタップしても、会話を送る（閉じる）
        if (inp.tap) talk();
        inp.tap = null;
      } else ({ mx, mz } = control.moveVector(dt));
      if (inp.hit("KeyE", "Enter", "Space")) talk();
      if (inp.hit("KeyZ")) ui.toast("図鑑は右下の札から");
    }
    player.update(dt, t, mx, mz, inp.down("ShiftLeft", "ShiftRight"));
    // 階と階段：上る階段に近づいたら上の階を用意し、見せるのは今いる階とその下だけ
    const lv = world.updateLevel(player.x, player.z);
    for (const n of floorsToPrepare(lv, player.x, player.z)) world.buildFloor(n);
    // 上っている（下りている）階段は、近くにいても透かさない（階段の下にいるときは透ける）
    if (lv.stair !== solidStair) {
      solidStair = lv.stair;
      structures.setSolidIds(solidStair ? world.stairIds[solidStair] ?? [] : []);
    }
    const shown = shownFloor(lv, player.x, player.z);
    if (world.setShownFloor(shown)) {
      inn.setShownFloor(shown);
      atmos.setUpperShown(shown >= 2);
    }
    control.pickY = lv.stair ? player.actor.y : ONSEN_FLOOR_Y[lv.floor];
    bath.update(dt);
    const py = player.actor.y;
    // 足元の影：床の面（畳の目地）とちらつかないよう少し上に。階段の途中は足元、湯の中は出さない
    player.actor.shadow.position.y = (lv.stair ? py : ONSEN_FLOOR_Y[lv.floor]) + SHADOW_LIFT;
    player.actor.shadow.setEnabled(bath.depth < 0.2);
    sound?.scape.update(dt, player.x, player.z, player.actor.speed > 1);
    if (inp.hit("KeyM")) setMuted(!muted);
    inn.update(dt, t);
    atmos.update(dt, t, { x: player.x, y: py, z: player.z });
    // 近くの客（低頻度）
    nearT -= dt;
    if (nearT <= 0) {
      nearT = 0.15;
      near = photo || talkingTo || lv.stair ? null : inn.nearest(player.x, player.z, lv.floor);
      ui.setTalkable(!!near && !photo && !talkingTo);
    }
    if (talkingTo && Math.hypot(talkingTo.actor.x - player.x, talkingTo.actor.z - player.z) > 5) talk();
    const cp = camera.cam.position;
    structures.update(dt, { player: photo ? null : { x: player.x, y: py, z: player.z }, camera: { x: cp.x, y: cp.y, z: cp.z }, parade: [], small: SMALL_FADE_R });
    // 玄関の看板（材質が別）：玄関の建物と同じく、主人公が近づいたら・カメラのすぐ前にあれば透かす
    if (world.sign) {
      const sp = world.sign.position;
      const near = !photo && ((Math.hypot(player.x - sp.x, player.z - sp.z) < 6 && py < 2) || Math.hypot(cp.x - sp.x, cp.z - sp.z) < 7);
      world.sign.visibility += ((near ? 0.28 : 1) - world.sign.visibility) * Math.min(1, dt * 4);
    }
    camera.update(
      { px: player.x, pz: player.z, py: Math.max(0, py), pvx: player.vx, pvz: player.vz, count: 1, bounds: { cx: player.x, cz: player.z, size: 0 }, tailX: player.x, tailZ: player.z, dt },
      yaw, pitch, zoom,
    );
    inp.endFrame();
    scene.render();
  });
  await scene.whenReadyAsync();
  ui.show();
  (window as unknown as { onsen?: unknown }).onsen = { world, inn, guests, placements, visit: visitSave, progress, camera, player, engine, scene, bath, structures, sound: () => sound };
}
