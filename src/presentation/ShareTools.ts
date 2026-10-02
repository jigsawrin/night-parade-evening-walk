import { captureScreenshot, type Camera, type Engine } from "../core/babylon";
import { toKanji } from "../core/util";
import type { NightResult } from "../game/after/NightResult";

/** 今の 3D 画面を画像にする（HTML の UI は入らない＝写真のみ） */
export async function capturePhoto(engine: Engine, camera: Camera): Promise<string> {
  return captureScreenshot(engine, camera);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });
}

/**
 * 共有カード（文字入り）：集合写真を背景に、和紙の帯へ「百鬼夜行・妖数・今宵・代表の役・Seed」と判子。
 * 写真の縦横に合わせて、横長 1600×900 / 縦長 1080×1350。
 */
export async function makeShareCard(photoUrl: string, r: NightResult, lead: string): Promise<Blob> {
  const img = await loadImage(photoUrl);
  const portrait = img.height > img.width;
  const W = portrait ? 1080 : 1600, H = portrait ? 1350 : 900;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d")!;
  try {
    await document.fonts?.ready;
  } catch {
    /* フォントが無くても描ける */
  }
  // 背景：写真を画面いっぱいに
  const s = Math.max(W / img.width, H / img.height);
  c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  // 周辺をほんのり暗く
  const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(10,6,14,0.55)");
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);
  // 和紙の帯
  const bandH = portrait ? 250 : 190;
  const y0 = H - bandH;
  c.fillStyle = "rgba(246, 239, 220, 0.94)";
  c.fillRect(0, y0, W, bandH);
  c.fillStyle = "#5a3e26";
  c.fillRect(0, y0, W, 8);
  c.fillRect(0, H - 8, W, 8);
  const head = '"Yuji Syuku", "Shippori Mincho", serif';
  const body = '"Shippori Mincho", serif';
  c.fillStyle = "#2a2230";
  c.textBaseline = "alphabetic";
  c.font = `${portrait ? 64 : 58}px ${head}`;
  c.fillText("百鬼夜行", 44, y0 + (portrait ? 88 : 80));
  c.font = `${portrait ? 92 : 84}px ${head}`;
  const count = `${toKanji(r.total)}`;
  const cx = portrait ? 44 : 360;
  const cy = portrait ? y0 + 200 : y0 + 110;
  c.fillText(count, cx, cy);
  const cw = c.measureText(count).width;
  c.fillStyle = "#c8372d";
  c.font = `${portrait ? 46 : 42}px ${head}`;
  c.fillText("妖", cx + cw + 8, cy);
  c.fillStyle = "#2a2230";
  c.font = `${portrait ? 30 : 28}px ${body}`;
  const tx = portrait ? 420 : 820;
  c.fillText(r.theme, tx, y0 + (portrait ? 110 : 64));
  if (lead) c.fillText(`役「${lead}」`, tx, y0 + (portrait ? 156 : 108));
  c.fillStyle = "#5a4a52";
  c.font = `${portrait ? 24 : 22}px ${body}`;
  c.fillText(`百鬼値 ${r.score}　夜の種 ${r.seed}`, tx, y0 + (portrait ? 200 : 150));
  // 判子
  const hs = portrait ? 110 : 96;
  const hx = W - hs - 40, hy = y0 + (bandH - hs) / 2;
  c.save();
  c.translate(hx + hs / 2, hy + hs / 2);
  c.rotate(-0.14);
  c.strokeStyle = "#c8372d";
  c.lineWidth = 6;
  c.strokeRect(-hs / 2, -hs / 2, hs, hs);
  c.fillStyle = "#c8372d";
  c.font = `${hs * 0.38}px ${head}`;
  c.textAlign = "center";
  c.fillText("百", 0, -hs * 0.04);
  c.fillText("鬼", 0, hs * 0.36);
  c.restore();
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/png"));
}

export async function dataUrlToBlob(url: string) {
  return (await fetch(url)).blob();
}

/** 画像をファイルとして保存（ブラウザのダウンロード） */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 古い環境：選択してコピー
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export type ShareOutcome = "shared" | "shared-text" | "cancelled" | "fallback";

/**
 * Web Share API で画像＋文を共有。画像を共有できない環境では文だけ、それも無ければ
 * 画像を保存して文をコピーする（外部 SNS の SDK・ログインは使わない）。
 */
export async function shareImage(blob: Blob, name: string, text: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text, title: "百鬼夜行 ～宵歩き～" });
      return "shared";
    }
    if (nav.share) {
      saveBlob(blob, name);
      await nav.share({ text, title: "百鬼夜行" });
      return "shared-text";
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return "cancelled";
  }
  saveBlob(blob, name);
  await copyText(text);
  return "fallback";
}
