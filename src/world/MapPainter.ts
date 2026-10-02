import { mulberry32 } from "../core/util";
import type { StructureCategory } from "./structureFade";
import {
  BRIDGES, GRAVEYARD, NAGAYA, PLAZA, RIVER, ROADS, SHRINE, TEMPLE, WORLD, YOKOCHO, type Rect,
} from "../data/map";

/** 地面テクスチャとミニマップを同じ地図データから描く */
export const MAP_SCALE = 6; // px / unit
export const MAP_W = (WORLD.maxX - WORLD.minX) * MAP_SCALE;
export const MAP_H = (WORLD.maxZ - WORLD.minZ) * MAP_SCALE;

export const toPx = (x: number) => (x - WORLD.minX) * MAP_SCALE;
export const toPy = (z: number) => (WORLD.maxZ - z) * MAP_SCALE;

function fillRect(ctx: CanvasRenderingContext2D, r: Rect, pad = 0) {
  ctx.fillRect(toPx(r.x0 - pad), toPy(r.z1 + pad), (r.x1 - r.x0 + pad * 2) * MAP_SCALE, (r.z1 - r.z0 + pad * 2) * MAP_SCALE);
}

/**
 * 地面を描く。noShadow の分類の家は影を描かない（写真でその分類の建物を隠したとき、影の跡を残さない）。
 * into を渡すとそのキャンバスに描き直す（同じ乱数の種なので、影以外は毎回同じ絵）
 */
export function paintGround(
  extra: { houses: (Rect & { cat?: StructureCategory })[]; paddies: Rect[] },
  noShadow: ReadonlySet<string> = new Set(),
  into?: HTMLCanvasElement,
): HTMLCanvasElement {
  const cv = into ?? document.createElement("canvas");
  cv.width = MAP_W;
  cv.height = MAP_H;
  const ctx = cv.getContext("2d")!;
  const rnd = mulberry32(7);

  // 草地
  ctx.fillStyle = "#34432f";
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (let i = 0; i < 9000; i++) {
    const g = 40 + Math.floor(rnd() * 30);
    ctx.fillStyle = `rgba(${g - 10},${g + 20},${g - 14},${0.25 + rnd() * 0.3})`;
    const s = 2 + rnd() * 8;
    ctx.fillRect(rnd() * MAP_W, rnd() * MAP_H, s, s);
  }

  // 区画ごとの土
  ctx.fillStyle = "#5a5040";
  fillRect(ctx, NAGAYA);
  ctx.fillStyle = "#4b4658";
  fillRect(ctx, YOKOCHO);
  ctx.fillStyle = "#6c6a5c";
  fillRect(ctx, GRAVEYARD);
  ctx.fillStyle = "#8f887a";
  fillRect(ctx, { x0: TEMPLE.x - 22, z0: TEMPLE.z - 14, x1: TEMPLE.x + 16, z1: TEMPLE.z + 16 });
  // 神社の玉砂利
  ctx.fillStyle = "#a9a28e";
  fillRect(ctx, { x0: -20, z0: 100, x1: 20, z1: 134 });

  // 田んぼ
  for (const p of extra.paddies) {
    ctx.fillStyle = "#2b3d44";
    fillRect(ctx, p);
    ctx.strokeStyle = "#5d5a3e";
    ctx.lineWidth = 5;
    ctx.strokeRect(toPx(p.x0), toPy(p.z1), (p.x1 - p.x0) * MAP_SCALE, (p.z1 - p.z0) * MAP_SCALE);
  }

  // 道
  for (const r of ROADS) {
    ctx.fillStyle = "#6e624c";
    fillRect(ctx, r, 0.8);
  }
  for (const r of ROADS) {
    ctx.fillStyle = "#8f8064";
    fillRect(ctx, r);
  }
  // 道の粒
  for (let i = 0; i < 14000; i++) {
    const x = WORLD.minX + rnd() * (WORLD.maxX - WORLD.minX);
    const z = WORLD.minZ + rnd() * (WORLD.maxZ - WORLD.minZ);
    if (!ROADS.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) continue;
    ctx.fillStyle = rnd() < 0.5 ? "rgba(60,50,36,0.35)" : "rgba(180,165,130,0.3)";
    ctx.fillRect(toPx(x), toPy(z), 2 + rnd() * 3, 2 + rnd() * 3);
  }

  // 広場（石畳）
  ctx.fillStyle = "#8d8a7c";
  ctx.beginPath();
  ctx.arc(toPx(PLAZA.x), toPy(PLAZA.z), PLAZA.r * MAP_SCALE, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,58,50,0.5)";
  ctx.lineWidth = 2;
  for (let r = 3; r < PLAZA.r; r += 3) {
    ctx.beginPath();
    ctx.arc(toPx(PLAZA.x), toPy(PLAZA.z), r * MAP_SCALE, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 参道の石畳
  ctx.fillStyle = "#a39c88";
  fillRect(ctx, { x0: -2, z0: 62, x1: 2, z1: 112 });
  ctx.fillStyle = "rgba(60,58,50,0.5)";
  for (let z = 62; z < 112; z += 2) ctx.fillRect(toPx(-2), toPy(z), 4 * MAP_SCALE, 2);

  // 家の影
  ctx.fillStyle = "rgba(10,10,20,0.45)";
  for (const h of extra.houses) if (!noShadow.has(h.cat ?? "building")) fillRect(ctx, h, 0.7);

  // 川
  ctx.fillStyle = "#4e5a44";
  fillRect(ctx, RIVER, 2.5);
  ctx.fillStyle = "#6b6a58";
  fillRect(ctx, RIVER, 0.8);
  ctx.fillStyle = "#16283c";
  fillRect(ctx, RIVER);
  // 橋の影
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  for (const b of BRIDGES) fillRect(ctx, b.r);

  // 神社
  ctx.fillStyle = "rgba(200,60,40,0.25)";
  ctx.beginPath();
  ctx.arc(toPx(SHRINE.x), toPy(SHRINE.z), 8 * MAP_SCALE, 0, Math.PI * 2);
  ctx.fill();
  return cv;
}

/** ミニマップ用に縮小した画像 */
export function makeMinimapImage(ground: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  const ratio = MAP_H / MAP_W;
  cv.width = size;
  cv.height = Math.round(size * ratio);
  const ctx = cv.getContext("2d")!;
  ctx.filter = "saturate(0.7) brightness(1.25) sepia(0.35)";
  ctx.drawImage(ground, 0, 0, cv.width, cv.height);
  return cv;
}
