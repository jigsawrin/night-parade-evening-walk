import { cloudLevelForCount } from "./emakiCloudLevel";
import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Camera, type ArcRotateCamera, type Scene } from "../core/babylon";

/** 雲を置く場所（画面上の位置 -1..1。中央には置かない）。上から順に使う */
const SLOTS: { x: number; y: number; w: number; h: number; pat: number }[] = [
  { x: -1.0, y: 0.5, w: 1.0, h: 0.42, pat: 1 },
  { x: 1.0, y: 0.38, w: 1.0, h: 0.42, pat: 1 },
  { x: -0.45, y: 1.0, w: 1.3, h: 0.34, pat: 0 },
  { x: 0.5, y: 1.0, w: 1.2, h: 0.3, pat: 0 },
  { x: -0.95, y: -0.62, w: 1.1, h: 0.36, pat: 3 },
  { x: 0.95, y: -0.72, w: 1.1, h: 0.36, pat: 3 },
  { x: -1.05, y: -0.05, w: 0.8, h: 0.34, pat: 2 },
  { x: 1.05, y: -0.15, w: 0.8, h: 0.34, pat: 2 },
  { x: 0.02, y: 1.03, w: 1.0, h: 0.26, pat: 3 },
  { x: -0.55, y: -1.02, w: 1.0, h: 0.26, pat: 0 },
  // ここから下は結果・撮影（豪華）のときだけ
  { x: 0.6, y: -1.02, w: 1.0, h: 0.26, pat: 0 },
  { x: -1.0, y: 0.92, w: 0.8, h: 0.34, pat: 2 },
  { x: 1.0, y: 0.9, w: 0.8, h: 0.34, pat: 2 },
  { x: -0.98, y: 0.22, w: 0.7, h: 0.3, pat: 1 },
  { x: 0.98, y: 0.12, w: 0.7, h: 0.3, pat: 1 },
  { x: 0.0, y: -1.06, w: 0.9, h: 0.22, pat: 3 },
];
/** 同時に出す最大数：ゲーム中 10、結果・撮影 16 */
export const CLOUD_MAX_PLAY = 10;
export const CLOUD_MAX_PHOTO = SLOTS.length;

export type CloudMode = "play" | "overview" | "photo";

/**
 * EmakiCloudDirector：百鬼夜行が育つほど、画面そのものが昔の百鬼夜行絵巻に近づいていく。
 *  - リアルな霧ではなく、平面的な墨線の雲・霞（すやり霞・瑞雲の渦）。暖かい和紙色で半透明
 *  - カメラに付けた板ポリのプール（最大 16 枚、ゲーム中は 10 枚まで）。Volumetric Fog や粒子は使わない
 *  - 置くのは画面の左右端・上端・下の角だけ。主人公・行列の中央・進行方向は隠さない。俯瞰では薄く
 *  - 出来事（夜行位・地区覚醒・合流・五十妖・百妖・締め・陣形替え）で一時的に膨らむ。百妖では「絵巻開き」
 */
export class EmakiCloudDirector {
  private clouds: { mesh: Mesh; a: number; seed: number; flip: number }[] = [];
  private mats: StandardMaterial[] = [];
  private level = 0;
  private mode: CloudMode = "play";
  /** 撮影での強さ（0 切 / 1 控えめ / 2 標準 / 3 豪華。null = 妖怪の数で決まる） */
  private photoLevel: number | null = null;
  private boost = 0;
  /** 雲が画面の内側へ寄る量（膨らむ・開く演出） */
  private inward = 0;
  private open: { t: number } | null = null;
  /** 夜の間の絵巻雲の強さ（設定：切 0 / 控えめ 0.6 / 標準 1） */
  playScale = 1;
  private t = 0;

  constructor(private scene: Scene, private cam: ArcRotateCamera, exclude: (m: Mesh) => void) {
    for (let p = 0; p < 4; p++) {
      const tex = new DynamicTexture(`emakiCloud${p}`, { width: 512, height: 256 }, scene, true);
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      drawCloud(ctx, p);
      tex.update(true);
      tex.hasAlpha = true;
      const m = new StandardMaterial(`emakiCloudMat${p}`, scene);
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.emissiveTexture = tex;
      m.opacityTexture = tex;
      m.disableLighting = true;
      m.fogEnabled = false;
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
      this.mats.push(m);
    }
    SLOTS.forEach((s, i) => {
      const mesh = MeshBuilder.CreatePlane(`emakiCloud_${i}`, { width: 1, height: 1 }, scene);
      mesh.material = this.mats[s.pat];
      mesh.parent = cam;
      mesh.renderingGroupId = 2;
      mesh.isPickable = false;
      mesh.visibility = 0;
      mesh.setEnabled(false);
      exclude(mesh);
      this.clouds.push({ mesh, a: 0, seed: i * 1.7, flip: i % 3 === 1 ? -1 : 1 });
    });
    scene.setRenderingAutoClearDepthStencil(2, true);
  }

  /** 行列の大きさ（妖数） */
  setCount(total: number) {
    this.level = cloudLevelForCount(total);
  }
  setMode(m: CloudMode) {
    this.mode = m;
  }
  /** 撮影の絵巻雲（0..3）。null で妖怪の数に戻す */
  setPhotoLevel(v: number | null) {
    this.photoLevel = v;
  }
  /** 一時的に膨らむ（0..1） */
  swell(k = 0.6) {
    this.boost = Math.min(1, Math.max(this.boost, k));
  }
  /** 百妖：雲が少し濃くなり → 左右へ流れて開き → 巨大な百鬼夜行が見える */
  openScroll() {
    this.open = { t: 0 };
  }

  update(dt: number) {
    this.t += dt;
    this.boost = Math.max(0, this.boost - dt * 0.35);
    let inward = this.boost * 0.28;
    let openK = 0;
    if (this.open) {
      const o = this.open;
      o.t += dt;
      if (o.t < 1.2) inward = Math.max(inward, (o.t / 1.2) * 0.42); // 濃くなって少し寄る
      else if (o.t < 3.2) inward = 0.42 - ((o.t - 1.2) / 2) * 0.9; // 左右へ流れて開く
      else inward = -0.48 + Math.min(1, (o.t - 3.2) / 2.5) * 0.48;
      openK = o.t < 3.2 ? 1 : Math.max(0, 1 - (o.t - 3.2) / 2.5);
      if (o.t > 5.7) this.open = null;
    }
    this.inward += (inward - this.inward) * Math.min(1, dt * 4);

    // 強さと枚数
    let lv: number;
    let maxN: number;
    if (this.mode === "photo" && this.photoLevel !== null) {
      lv = [0, 0.45, 0.72, 1][this.photoLevel] ?? 0;
      maxN = CLOUD_MAX_PHOTO;
    } else {
      lv = this.level * (this.mode === "overview" ? 0.5 : 1) * (this.mode === "photo" ? 1 : this.playScale);
      maxN = this.mode === "photo" ? CLOUD_MAX_PHOTO : CLOUD_MAX_PLAY;
    }
    const fxScale = this.mode === "photo" ? 1 : this.playScale;
    lv = Math.min(1, lv + (this.boost * 0.35 + openK * 0.3) * fxScale);
    const n = lv <= 0.01 ? 0 : Math.min(maxN, Math.max(2, Math.round(lv * maxN)));
    const alphaMax = (this.mode === "play" || this.mode === "overview" ? 0.55 : 0.8) * (0.45 + 0.55 * lv);

    // 画面の広さ（カメラの前 D の距離での半幅・半高さ）
    const eng = this.scene.getEngine();
    const aspect = eng.getRenderWidth() / Math.max(1, eng.getRenderHeight());
    const D = 6;
    const cam = this.cam;
    let hw: number, hh: number;
    if (cam.fovMode === Camera.FOVMODE_HORIZONTAL_FIXED) {
      hw = D * Math.tan(cam.fov / 2);
      hh = hw / aspect;
    } else {
      hh = D * Math.tan(cam.fov / 2);
      hw = hh * aspect;
    }
    const unit = Math.min(hw, hh * 1.6);
    this.clouds.forEach((c, i) => {
      const s = SLOTS[i];
      const target = i < n ? alphaMax : 0;
      c.a += (target - c.a) * Math.min(1, dt * (target > c.a ? 1.2 : 0.8));
      const on = c.a > 0.004;
      if (c.mesh.isEnabled() !== on) c.mesh.setEnabled(on);
      if (!on) return;
      c.mesh.visibility = c.a;
      // ゆっくり漂う。左右の雲は膨らむ演出で内側へ
      const dx = Math.sin(this.t * 0.07 + c.seed) * 0.03;
      const dy = Math.sin(this.t * 0.05 + c.seed * 1.3) * 0.02;
      const side = Math.abs(s.x) > 0.8 ? Math.sign(s.x) : 0;
      const x = s.x + dx - side * this.inward;
      const y = s.y + dy - (side === 0 ? Math.sign(s.y) * this.inward * 0.35 : 0);
      c.mesh.position.set(x * hw, y * hh, D);
      const breathe = 1 + Math.sin(this.t * 0.3 + c.seed) * 0.03;
      c.mesh.scaling.set(s.w * unit * breathe * c.flip, s.h * unit * 1.1 * breathe, 1);
    });
  }
}

/** 墨線の雲・霞（平面的・丸い渦・少しデフォルメ・和紙色で半透明） */
function drawCloud(c: CanvasRenderingContext2D, pattern: number) {
  const W = 512, H = 256;
  c.clearRect(0, 0, W, H);
  const paper = "rgba(246, 234, 208, 0.92)";
  const ink = "rgba(58, 40, 36, 0.8)";
  const lobe = (x: number, y: number, r: number) => {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  };
  const curl = (x: number, y: number, r: number, dir = 1) => {
    c.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.12) {
      const rr = r * (1 - a / (Math.PI * 3.6));
      const px = x + Math.cos(a * dir) * rr, py = y + Math.sin(a * dir) * rr * 0.85;
      if (a === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
  };
  const fillShape = (shape: () => void) => {
    // 和紙色の塗り（縁をぼかす）
    c.save();
    c.shadowColor = "rgba(246, 234, 208, 0.9)";
    c.shadowBlur = 14;
    c.fillStyle = paper;
    c.beginPath();
    shape();
    c.fill();
    c.restore();
    // 墨の輪郭（少しかすれる）
    c.save();
    c.strokeStyle = ink;
    c.lineWidth = 4;
    c.lineCap = "round";
    c.beginPath();
    shape();
    c.stroke();
    c.globalCompositeOperation = "destination-out";
    c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      const x = 40 + Math.random() * (W - 80), y = 30 + Math.random() * (H - 60);
      c.moveTo(x, y);
      c.lineTo(x + 10 + Math.random() * 30, y + (Math.random() - 0.5) * 3);
      c.stroke();
    }
    c.restore();
  };
  if (pattern === 0) {
    // すやり霞：長い帯、両端が丸い
    fillShape(() => {
      c.moveTo(60, 110);
      c.bezierCurveTo(60, 70, 120, 78, 150, 88);
      c.lineTo(390, 88);
      c.bezierCurveTo(430, 70, 470, 90, 460, 118);
      c.bezierCurveTo(470, 150, 430, 168, 390, 160);
      c.lineTo(150, 160);
      c.bezierCurveTo(110, 172, 60, 150, 60, 110);
    });
    c.strokeStyle = "rgba(58,40,36,0.45)";
    c.lineWidth = 2;
    for (const y of [104, 124, 144]) {
      c.beginPath();
      c.moveTo(150, y);
      c.lineTo(380, y);
      c.stroke();
    }
  } else if (pattern === 1) {
    // 瑞雲：丸い雲の房と渦
    fillShape(() => {
      lobe(150, 140, 62);
      lobe(240, 110, 76);
      lobe(340, 138, 64);
      lobe(410, 160, 40);
      lobe(95, 170, 38);
      c.rect(95, 150, 320, 50);
    });
    c.strokeStyle = ink;
    c.lineWidth = 3;
    curl(240, 110, 40);
    curl(150, 142, 28, -1);
    curl(342, 140, 30);
  } else if (pattern === 2) {
    // 小さな渦雲
    fillShape(() => {
      lobe(200, 128, 70);
      lobe(290, 138, 56);
      lobe(140, 150, 42);
      lobe(350, 156, 36);
    });
    c.strokeStyle = ink;
    c.lineWidth = 3;
    curl(200, 128, 38);
    curl(292, 140, 26, -1);
  } else {
    // 重なる霞（二段の帯）
    fillShape(() => {
      c.moveTo(30, 90);
      c.bezierCurveTo(30, 60, 90, 62, 110, 72);
      c.lineTo(300, 72);
      c.bezierCurveTo(330, 60, 360, 76, 350, 100);
      c.bezierCurveTo(360, 118, 330, 128, 300, 122);
      c.lineTo(110, 122);
      c.bezierCurveTo(70, 130, 30, 118, 30, 90);
      c.moveTo(170, 170);
      c.bezierCurveTo(170, 140, 230, 142, 250, 150);
      c.lineTo(440, 150);
      c.bezierCurveTo(475, 140, 500, 160, 490, 180);
      c.bezierCurveTo(495, 200, 470, 208, 440, 202);
      c.lineTo(250, 202);
      c.bezierCurveTo(210, 210, 170, 198, 170, 170);
    });
  }
  // 金砂子（控えめ）
  c.fillStyle = "rgba(210, 170, 80, 0.55)";
  for (let i = 0; i < 40; i++) c.fillRect(60 + Math.random() * 400, 70 + Math.random() * 130, 2, 2);
}
