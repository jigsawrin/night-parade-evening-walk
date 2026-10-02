import { CLOUD_LEVEL_NAMES } from "../data/photo";
import type { HideCategory } from "../world/structureFade";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export type PhotoToggle = "fireworks" | "confetti" | "kitsunebi" | "lanterns";

export interface PhotoFx {
  clouds: number;
  fireworks: boolean;
  confetti: boolean;
  kitsunebi: boolean;
  lanterns: boolean;
  /** 写真から隠している分類 */
  hide: HideCategory[];
}

export interface PhotoActions {
  formation(): void;
  pose(): void;
  style(): void;
  preset(): void;
  /** 体ごとカメラの方へ向き直る */
  face(): void;
  /** こっち向いて（顔が向く分だけ振り向く） */
  look(): void;
  clouds(level: number): void;
  toggle(k: PhotoToggle): void;
  hide(c: HideCategory): void;
  shoot(): void;
  savePlain(): void;
  saveCard(): void;
  share(): void;
  copy(): void;
  back(): void;
}

/**
 * フォトモードの UI。誰でも簡単に良い写真が撮れることを優先：
 * 並び（陣形）・姿（ポーズ）・風情（写真スタイル）・構図（カメラ）を押すたびに切り替え、演出は個別に ON/OFF。
 * 「UI」で画面の UI をすべて隠せる（右上の小さな札で戻す）。ボタンは 44px 以上。
 */
export class PhotoUI {
  private toastT = 0;

  constructor(a: PhotoActions) {
    const on = (id: string, fn: () => void) => $(id).addEventListener("click", fn);
    on("ph-formation", () => a.formation());
    on("ph-pose", () => a.pose());
    on("ph-style", () => a.style());
    on("ph-preset", () => a.preset());
    on("ph-face", () => a.face());
    on("ph-look", () => a.look());
    on("ph-fx", () => $("photo-fx").classList.toggle("hidden"));
    on("ph-fx-close", () => $("photo-fx").classList.add("hidden"));
    on("ph-shoot", () => a.shoot());
    on("ph-ui", () => this.setClean(true));
    on("ph-ui-back", () => this.setClean(false));
    on("ph-back", () => a.back());
    on("shot-plain", () => a.savePlain());
    on("shot-card", () => a.saveCard());
    on("shot-share", () => a.share());
    on("shot-copy", () => a.copy());
    on("shot-close", () => this.hideShot());
    document.querySelectorAll<HTMLButtonElement>("#fx-clouds button").forEach((b) => b.addEventListener("click", () => a.clouds(Number(b.dataset.v))));
    document.querySelectorAll<HTMLButtonElement>("#photo-fx [data-toggle]").forEach((b) => b.addEventListener("click", () => a.toggle(b.dataset.toggle as PhotoToggle)));
    document.querySelectorAll<HTMLButtonElement>("#photo-fx [data-hide]").forEach((b) => b.addEventListener("click", () => a.hide(b.dataset.hide as HideCategory)));
  }

  show(v: boolean) {
    $("photo-ui").classList.toggle("hidden", !v);
    if (!v) {
      $("photo-fx").classList.add("hidden");
      this.hideShot();
      this.setClean(false);
    }
  }

  setLabels(o: { formation: string; pose: string; style: string; preset: string; hint: string }) {
    $("ph-formation").innerHTML = `<small>並び</small>${o.formation}`;
    $("ph-pose").innerHTML = `<small>姿</small>${o.pose}`;
    $("ph-style").innerHTML = `<small>風情</small>${o.style}`;
    $("ph-preset").innerHTML = `<small>構図</small>${o.preset}`;
    $("photo-hint").textContent = o.hint;
  }

  /** 向き直る・こっち向いての札の押された印（並び・姿を替えると消える） */
  setFacing(mode: "body" | "look" | null) {
    for (const [id, m] of [["ph-face", "body"], ["ph-look", "look"]] as const) {
      $(id).classList.toggle("on", mode === m);
      $(id).setAttribute("aria-pressed", String(mode === m));
    }
  }

  setFx(fx: PhotoFx) {
    document.querySelectorAll<HTMLButtonElement>("#fx-clouds button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === fx.clouds));
    document.querySelectorAll<HTMLButtonElement>("#photo-fx [data-toggle]").forEach((b) => {
      const k = b.dataset.toggle as PhotoToggle;
      b.classList.toggle("on", fx[k]);
      b.setAttribute("aria-pressed", String(fx[k]));
    });
    $("fx-clouds-label").textContent = `絵巻雲：${CLOUD_LEVEL_NAMES[fx.clouds]}`;
    document.querySelectorAll<HTMLButtonElement>("#photo-fx [data-hide]").forEach((b) => {
      const on = fx.hide.includes(b.dataset.hide as HideCategory);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  /** UI をすべて隠す（写真だけの画面） */
  setClean(v: boolean) {
    document.body.classList.toggle("photo-clean", v);
  }
  get clean() {
    return document.body.classList.contains("photo-clean");
  }

  showShot(url: string) {
    $<HTMLImageElement>("shot-img").src = url;
    $("photo-shot").classList.remove("hidden");
  }
  hideShot() {
    $("photo-shot").classList.add("hidden");
  }

  toast(text: string) {
    const el = $("photo-toast");
    el.textContent = text;
    el.classList.remove("hidden");
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => el.classList.add("hidden"), 2600);
  }
}
