import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, Scene, Vector3, type InstancedMesh } from "../../core/babylon";
import { ModelFactory } from "../../characters/ModelFactory";
import { MODELS } from "../../characters/models";
import { Materials } from "../../world/Materials";
import { YOKAI } from "../../data/yokaiTypes";
import type { ModelStage } from "./ZukanVisual";

/** 姿見のカメラと操作（見た目の値。遊びの手触りではない） */
const ZUKAN_VIEW = {
  /** はじめの向き（正面からやや見下ろす）と距離（姿の大きさの倍率）・寄る／引くの限り */
  alpha: Math.PI / 2, beta: 1.25, distance: 2.6, minDistance: 0.9, maxDistance: 5,
  /** 描画の解像度の上限（スマホの発熱を抑える） */
  maxPixelRatio: 2,
};

/**
 * 図鑑の 3D の姿見（図鑑全体で一つだけ。ZukanVisual の ModelStage）。
 * 一つの canvas・Engine・Scene を、3D を選んだ妖怪の枠（mount）へ移して使い回す。前の妖怪の姿は片付けてから次の姿を作る
 * （同時に二体を描かない。図鑑を開いただけでは何も作らない）。ドラッグで回す・ピンチ／ホイールで寄る（canvas の中だけ指を取る：
 * 枠の外はいつもどおり図鑑をスクロールできる）。ゲームの Scene とは別（背景は透明）。モデルは町と同じ ModelFactory で作る
 * （今は手続き生成の仮のモデル。modelUrl の GLB を足せばそれが出る）。ゲームの状態は変えない。
 */
export class ZukanModelViewer implements ModelStage<HTMLElement> {
  private canvas = document.createElement("canvas");
  private help = document.createElement("p");
  private engine: Engine | null = null;
  private scene!: Scene;
  private camera!: ArcRotateCamera;
  private factory!: ModelFactory;
  private mesh: InstancedMesh | null = null;
  private running = false;

  /** 姿を見せられる種類か（モデルがある） */
  static has(type: string) {
    return !!MODELS[type];
  }

  constructor() {
    this.canvas.className = "zk-model-canvas";
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.help.className = "zk-model-help";
    this.help.textContent = "ドラッグで回す・ピンチ／ホイールで寄る";
    window.addEventListener("resize", () => {
      if (this.mesh) this.engine?.resize();
    });
  }

  show(type: string, mount: HTMLElement) {
    const def = YOKAI[type];
    if (!def || !ZukanModelViewer.has(type)) return;
    this.canvas.setAttribute("aria-label", `${def.name}の3Dの姿。ドラッグで回し、ピンチやホイールで寄る`);
    mount.append(this.canvas, this.help);
    this.ensureEngine();
    this.engine!.resize();
    // 前の妖怪の姿を片付けてから作る（同時に二体を描かない）
    this.mesh?.dispose();
    const m = this.factory.instance(type, "zukanModel");
    m.scaling.setAll(def.scale ?? 1);
    m.computeWorldMatrix(true);
    this.mesh = m;
    // 姿の大きさに合わせてカメラを置く（正面からやや見下ろす）
    const box = m.getBoundingInfo().boundingBox;
    const size = Math.max(box.extendSizeWorld.x, box.extendSizeWorld.y, box.extendSizeWorld.z) * 2;
    const c = this.camera;
    // 縦長の枠では横の画角が狭いので、そのぶん離れる
    const fit = size / Math.min(1, this.engine!.getAspectRatio(c));
    c.setTarget(box.centerWorld.clone());
    c.alpha = ZUKAN_VIEW.alpha;
    c.beta = ZUKAN_VIEW.beta;
    c.radius = fit * ZUKAN_VIEW.distance;
    c.lowerRadiusLimit = size * ZUKAN_VIEW.minDistance;
    c.upperRadiusLimit = fit * ZUKAN_VIEW.maxDistance;
    c.minZ = size * 0.02;
    this.setRunning(true);
  }

  hide() {
    this.setRunning(false);
    this.mesh?.dispose();
    this.mesh = null;
    this.canvas.remove();
    this.help.remove();
  }

  setRunning(on: boolean) {
    if (!this.engine || on === this.running || (on && !this.mesh)) return;
    this.running = on;
    if (on) this.engine.runRenderLoop(() => this.scene.render());
    else this.engine.stopRenderLoop();
  }

  /** 初めて映すときに作る（以後は使い回す） */
  private ensureEngine() {
    if (this.engine) return;
    const engine = new Engine(this.canvas, true, { alpha: true, stencil: false }, false);
    engine.setHardwareScalingLevel(1 / Math.min(ZUKAN_VIEW.maxPixelRatio, window.devicePixelRatio || 1));
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    const light = new HemisphericLight("zukanLight", new Vector3(0.3, 1, 0.4), scene);
    light.intensity = 0.9;
    light.groundColor = new Color3(0.25, 0.22, 0.3);
    // 光る部分の滲み（GlowLayer）は使わない：透明な背景では光る部分の色を消してしまう
    const mats = new Materials(scene);
    const cam = new ArcRotateCamera("zukanCam", ZUKAN_VIEW.alpha, ZUKAN_VIEW.beta, 4, Vector3.Zero(), scene);
    cam.lowerBetaLimit = 0.05;
    cam.upperBetaLimit = Math.PI - 0.05;
    cam.wheelDeltaPercentage = 0.01;
    cam.pinchDeltaPercentage = 0.004;
    cam.panningSensibility = 0;
    cam.angularSensibilityX = cam.angularSensibilityY = 600;
    // canvas の中の操作（回す・ホイールで寄る）で図鑑までスクロールしないよう、既定の動きを止める
    cam.attachControl(false);
    this.engine = engine;
    this.scene = scene;
    this.camera = cam;
    this.factory = new ModelFactory(scene, mats);
  }
}
