/**
 * キーボード + ポインタ（マウス / タッチ）。
 *  - マウス左：タップでその場所まで歩く。長押しで押している方へ歩く
 *  - タッチ：置いた場所から滑らせた方へ歩く（画面の上へ滑らせると奥へ）。短いタップはその場所まで
 *  - タッチのもう一本：ドラッグで見回す。二本の間隔で寄る・引く（歩きの指は置いたまま同時にできる）
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
  /** 1 本指・左ドラッグの量（撮影ではカメラを回す。夜の間のタッチは歩きに使う） */
  dragYaw = 0;
  dragPitch = 0;
  /** 短いタップ（その場所へ歩いていく）。読んだら null に戻す */
  tap: { x: number; y: number } | null = null;
  /**
   * タッチで歩いている指。x・y は置いた場所からのずれ（右・下が +、CSS px）。
   * ox・oy は置いた場所。マウスでは null。指が離れると null。
   */
  touchSteer: { x: number; y: number; ox: number; oy: number } | null = null;
  private dragButton = -1;
  private lastX = 0;
  private lastY = 0;
  private touches = new Map<number, { x: number; y: number }>();
  /** 歩きの指（最初の一本） */
  private steerId: number | null = null;
  private steerOriginX = 0;
  private steerOriginY = 0;
  private steerLastX = 0;
  private steerLastY = 0;
  /** この押し始めは、短いタップとしてよいか（もう一本が乗ったらだめ） */
  private steerTapOk = false;
  /** 見回す指（二本目）。二本のあいだは、歩きの量を保ったまま中点で見回し、間隔で寄る・引く */
  private lookId: number | null = null;
  private pinchDist = 0;
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
      this.clearTouch();
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
      if (e.pointerType === "touch") {
        this.onTouchDown(e);
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
      if (e.pointerType === "touch") {
        this.onTouchMove(e);
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
      if (e.pointerType === "touch") {
        this.onTouchUp(e);
        return;
      }
      // 短いクリックは「そこへ歩いていく」
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

  /** 最初の指は歩き、二本目は見回す。歩きながら見回せる */
  private onTouchDown(e: PointerEvent) {
    if (this.steerId === null) {
      this.steerId = e.pointerId;
      this.steerOriginX = e.clientX;
      this.steerOriginY = e.clientY;
      this.steerLastX = e.clientX;
      this.steerLastY = e.clientY;
      this.downT = performance.now();
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.steerTapOk = this.lookId === null;
      this.touchSteer = { x: 0, y: 0, ox: e.clientX, oy: e.clientY };
      if (this.lookId !== null) this.armTwoFinger();
      return;
    }
    if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.steerTapOk = false;
      this.tap = null;
      this.armTwoFinger();
    }
  }

  private onTouchMove(e: PointerEvent) {
    if (e.pointerId !== this.steerId && e.pointerId !== this.lookId) return;
    // 二本：歩きは置いたときのスライドのまま。中点のドラッグで見回し、間隔で寄る・引く
    if (this.steerId !== null && this.lookId !== null) {
      this.applyTwoFinger();
      return;
    }
    if (e.pointerId !== this.steerId) return;
    const fdx = e.clientX - this.steerLastX;
    const fdy = e.clientY - this.steerLastY;
    this.steerLastX = e.clientX;
    this.steerLastY = e.clientY;
    this.touchSteer = {
      x: e.clientX - this.steerOriginX,
      y: e.clientY - this.steerOriginY,
      ox: this.steerOriginX,
      oy: this.steerOriginY,
    };
    // 撮影中は一本の指でカメラを回す（夜の間は Game が dragYaw を使わない）
    this.dragYaw -= fdx * 0.006;
    this.dragPitch -= fdy * 0.004;
  }

  private onTouchUp(e: PointerEvent) {
    if (e.pointerId === this.steerId) {
      if (
        this.steerTapOk && e.type === "pointerup" && performance.now() - this.downT < 260 &&
        Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 14
      ) {
        this.tap = { x: e.clientX, y: e.clientY };
      }
      this.steerId = null;
      this.touchSteer = null;
      this.pinchDist = 0;
      return;
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      this.pinchDist = 0;
      // 二本のあいだに指がずれていても、歩きの量はそのまま。輪は今の指に合わせる
      this.reseatSteer();
    }
  }

  /** 今の指の位置を、今の歩きの量のまま起点に合わせ直す（輪が指から離れない） */
  private reseatSteer() {
    if (this.steerId === null || !this.touchSteer) return;
    const p = this.touches.get(this.steerId);
    if (!p) return;
    this.steerOriginX = p.x - this.touchSteer.x;
    this.steerOriginY = p.y - this.touchSteer.y;
    this.steerLastX = p.x;
    this.steerLastY = p.y;
    this.touchSteer = { x: this.touchSteer.x, y: this.touchSteer.y, ox: this.steerOriginX, oy: this.steerOriginY };
  }

  private clearTouch() {
    this.steerId = null;
    this.lookId = null;
    this.touchSteer = null;
    this.pinchDist = 0;
    this.steerTapOk = false;
  }

  private armTwoFinger() {
    this.pinchDist = this.fingerDist();
    const mid = this.fingerMid();
    this.gestureMidX = mid.x;
    this.gestureMidY = mid.y;
  }

  /** 二本指：中点で見回す、間隔で寄る・引く（広がると寄る。以前と同じ） */
  private applyTwoFinger() {
    const d = this.fingerDist();
    const mid = this.fingerMid();
    if (this.pinchDist > 0 && d > 0) this.zoomDelta += Math.log(this.pinchDist / d);
    this.yawDelta -= (mid.x - this.gestureMidX) * 0.006;
    this.pitchDelta -= (mid.y - this.gestureMidY) * 0.004;
    this.pinchDist = d;
    this.gestureMidX = mid.x;
    this.gestureMidY = mid.y;
  }

  private fingerPair() {
    if (this.steerId === null || this.lookId === null) return null;
    const a = this.touches.get(this.steerId);
    const b = this.touches.get(this.lookId);
    if (!a || !b) return null;
    return [a, b] as const;
  }

  private fingerDist() {
    const pair = this.fingerPair();
    if (!pair) return 0;
    return Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) || 1;
  }

  private fingerMid() {
    const pair = this.fingerPair();
    if (!pair) return { x: 0, y: 0 };
    return { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
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
