/**
 * 設定（タイトルの歯車）：音量・消音・夜の間の絵巻雲・画質。
 * 見た人のブラウザだけの好み（localStorage）。保存できない環境（プライベート閲覧など）でも既定値で動く。
 */
export interface Options {
  volume: number;
  muted: boolean;
  /** 夜の間の絵巻雲 0 切 / 1 控えめ / 2 標準 */
  clouds: number;
  /** 画質 0 軽量 / 1 標準 */
  quality: number;
  /** 建物の透過 0 切 / 1 主人公とカメラ / 2 百鬼夜行も */
  fade: number;
}

const KEY = "hyakki.options.v1";
const DEFAULTS: Options = { volume: 0.8, muted: false, clouds: 2, quality: 1, fade: 1 };

export function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* 保存できない環境 */
  }
  return { ...DEFAULTS };
}

export function saveOptions(o: Options) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* 保存できない環境でも遊べる */
  }
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface OptionLinks {
  zukan(): void;
  history(): void;
}

/** 設定画面をつなぐ。apply は値が変わるたびに呼ばれる */
export function bindOptions(o: Options, apply: (o: Options) => void, links: OptionLinks) {
  const vol = $<HTMLInputElement>("opt-volume");
  const show = () => {
    vol.value = String(Math.round(o.volume * 100));
    $("opt-volume-v").textContent = `${Math.round(o.volume * 100)}`;
    document.querySelectorAll<HTMLButtonElement>("#opt-clouds button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === o.clouds));
    document.querySelectorAll<HTMLButtonElement>("#opt-quality button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === o.quality));
    document.querySelectorAll<HTMLButtonElement>("#opt-fade button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === o.fade));
  };
  const changed = () => {
    saveOptions(o);
    apply(o);
    show();
  };
  vol.addEventListener("input", () => {
    o.volume = Number(vol.value) / 100;
    changed();
  });
  document.querySelectorAll<HTMLButtonElement>("#opt-clouds button").forEach((b) => b.addEventListener("click", () => {
    o.clouds = Number(b.dataset.v);
    changed();
  }));
  document.querySelectorAll<HTMLButtonElement>("#opt-quality button").forEach((b) => b.addEventListener("click", () => {
    o.quality = Number(b.dataset.v);
    changed();
  }));
  document.querySelectorAll<HTMLButtonElement>("#opt-fade button").forEach((b) => b.addEventListener("click", () => {
    o.fade = Number(b.dataset.v);
    changed();
  }));
  $("btn-opt-zukan").addEventListener("click", () => links.zukan());
  $("btn-opt-history").addEventListener("click", () => links.history());
  $("btn-options").addEventListener("click", () => {
    show();
    $("options").classList.remove("hidden");
  });
  $("btn-options-close").addEventListener("click", () => $("options").classList.add("hidden"));
  show();
  apply(o);
}
