import type { Engine } from "../core/babylon";
import { YOKAI } from "../data/yokaiTypes";
import { photoFileName, shareText, type NightResult } from "../game/after/NightResult";
import type { AudioDirector } from "./audio/AudioDirector";
import type { CameraDirector } from "./CameraDirector";
import type { PhotoUI } from "./PhotoUI";
import { capturePhoto, copyText, dataUrlToBlob, makeShareCard, saveBlob, shareImage } from "./ShareTools";

export interface PhotoShotHost {
  engine: Engine;
  camera: CameraDirector;
  audio(): AudioDirector | null;
  ui: PhotoUI;
  seed(): number;
  /** 行列の総数（ファイル名） */
  total(): number;
  result(): NightResult | null;
}

/**
 * 記念撮影の「撮る・保存・共有」。画像は端末に保存するか、端末の共有（navigator.share）に渡すだけ（外部へは送らない）。
 * ファイル名は hyakki_seed12345_112yokai.png。
 */
export class PhotoShot {
  shotUrl = "";
  private busy = false;

  constructor(private h: PhotoShotHost) {}

  async shoot() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.h.audio()?.shutter();
      this.shotUrl = await capturePhoto(this.h.engine, this.h.camera.cam);
      this.h.ui.showShot(this.shotUrl);
    } catch (e) {
      console.warn(e);
      this.h.ui.toast("撮影できませんでした");
    } finally {
      this.busy = false;
    }
  }

  private fileName(suffix = "") {
    return photoFileName(this.h.seed(), this.h.total(), suffix);
  }
  private lead() {
    const r = this.h.result();
    return r ? (r.roles[0]?.name ?? r.titles[0]?.name ?? "") : "";
  }

  async savePlain() {
    if (!this.shotUrl) return;
    saveBlob(await dataUrlToBlob(this.shotUrl), this.fileName());
    this.h.ui.toast("写真を保存した");
  }

  async saveCard() {
    const r = this.h.result();
    if (!this.shotUrl || !r) return;
    saveBlob(await makeShareCard(this.shotUrl, r, this.lead()), this.fileName("card"));
    this.h.ui.toast("文字入りの写真を保存した");
  }

  async share() {
    const r = this.h.result();
    if (!this.shotUrl || !r) return;
    const blob = await makeShareCard(this.shotUrl, r, this.lead());
    const text = shareText(r, (t) => YOKAI[t]?.name ?? t);
    const res = await shareImage(blob, this.fileName("card"), text);
    if (res === "fallback") this.h.ui.toast("共有に対応していないため、画像を保存して結果の文をコピーした");
    else if (res === "shared-text") this.h.ui.toast("画像を保存し、結果の文を共有した");
  }

  async copyResult() {
    const r = this.h.result();
    if (!r) return;
    const ok = await copyText(shareText(r, (t) => YOKAI[t]?.name ?? t));
    this.h.ui.toast(ok ? "結果の文をコピーした" : "コピーできませんでした");
  }
}
