/**
 * キーボード + ポインタ（マウス / タッチ）。
 *  - 1 本指（左クリック）長押し：押している方へ歩く
 *  - 1 本指タップ（左クリック）：その場所まで歩いていく
 *  - 2 本指：ピンチで寄る・引く、2 本指ドラッグで見回す（ドラッグした方を向く）
 *  - 右ドラッグ：見回す（ドラッグした方を向く）、ホイール：寄る・引く
 */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  pointerDown = false;
  pointerX = 0;
  pointerY = 0;
  /** 右ドラッグ等でカメラを回す量（+ で左を向く） */
  yawDelta = 0;
  /** 右ドラッグ等でカメラを上下に振る量（+ で上を向く） */
  pitchDelta = 0;
  /** ホイール・ピンチでの距離の変化（+ で引く） */
  zoomDelta = 0;
  /** 1 本指・左ドラッグの量（撮影ではカメラを回す。夜の間は使わない：歩く操作のまま） */
  dragYaw = 0;
  dragPitch = 0;
  /** 短いタップ（その場所へ歩いていく）。読んだら null に戻す */
  tap: { x: number; y: number } | null = null;
  private dragButton = -1;
  private lastX = 0;
  private lastY = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private gesture = false;
  private gestureDist = 0;
  private gestureMidX = 0;
  private gestureMidY = 0;
  private downT = 0;
  private downX = 0;
  private downY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      // 文字を打っている間（図鑑の検索など）はゲームの操作にしない
      if (isTextField(e.target)) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pointerDown = false;
      this.touches.clear();
      this.gesture = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomDelta += Math.max(-0.3, Math.min(0.3, e.deltaY * 0.0009));
      },
      { passive: false },
    );
    canvas.addEventListener("pointerdown", (e) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 合成イベント等では捕捉できないことがある */
      }
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        // 2 本指：歩くのをやめて、見回す・寄る引くのジェスチャーへ
        this.pointerDown = false;
        this.gesture = true;
        this.tap = null;
        this.readGesture(true);
        return;
      }
      this.dragButton = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 0) {
        this.pointerDown = true;
        this.downT = performance.now();
        this.downX = e.clientX;
        this.downY = e.clientY;
      }
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gesture) {
        if (this.touches.size >= 2) this.readGesture(false);
        return;
      }
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      if (this.dragButton === 0) {
        this.dragYaw -= (e.clientX - this.lastX) * 0.006;
        this.dragPitch -= (e.clientY - this.lastY) * 0.004;
      }
      if (this.dragButton === 2 || this.dragButton === 1) {
        // ドラッグした方をカメラが向く（右へドラッグ → 右を見る、上へ → 上を見る）
        this.yawDelta -= (e.clientX - this.lastX) * 0.006;
        this.pitchDelta -= (e.clientY - this.lastY) * 0.004;
      }
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const up = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.gesture) {
        // 指がすべて離れるまで、歩き出さない
        if (this.touches.size === 0) this.gesture = false;
        else if (this.touches.size >= 2) this.readGesture(true);
        this.pointerDown = false;
        this.dragButton = -1;
        return;
      }
      // 短いタップは「そこへ歩いていく」
      if (
        e.type === "pointerup" && this.dragButton === 0 && performance.now() - this.downT < 260 &&
        Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 14
      ) {
        this.tap = { x: e.clientX, y: e.clientY };
      }
      this.pointerDown = false;
      this.dragButton = -1;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  /** 2 本指：ピンチ = 寄る・引く、中点のドラッグ = 見回す */
  private readGesture(reset: boolean) {
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!reset) {
      this.zoomDelta += Math.log(this.gestureDist / d);
      this.yawDelta -= (mx - this.gestureMidX) * 0.006;
      this.pitchDelta -= (my - this.gestureMidY) * 0.004;
    }
    this.gestureDist = d;
    this.gestureMidX = mx;
    this.gestureMidY = my;
  }

  down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }
  hit(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }
  /** 画面のボタン（視点パッドなど）から、押している間だけキーを押したことにする */
  hold(code: string, on: boolean) {
    if (on) {
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    } else this.keys.delete(code);
  }
  /** フレーム末尾で呼ぶ */
  endFrame() {
    this.pressed.clear();
    this.yawDelta = 0;
    this.pitchDelta = 0;
    this.zoomDelta = 0;
    this.dragYaw = 0;
    this.dragPitch = 0;
  }
  press(code: string) {
    this.pressed.add(code);
  }
  get canvasEl() {
    return this.canvas;
  }
}

/** 文字を打つ欄か（文字の input・textarea・編集できる要素。音量のつまみ・チェックの欄は含めない） */
function isTextField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "INPUT") return ["text", "search"].includes((el as HTMLInputElement).type);
  return el.tagName === "TEXTAREA" || el.isContentEditable;
}
