/**
 * 陰陽師の純粋な判定（視線・怪しさ・祓う数・威光）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { AWE, ONMYOJI_CFG, ROUT_MEMORY, ROUT_TEXT, type AweReason, type CrowdAweReason } from "../../data/onmyoji";
import { YOKAI } from "../../data/yokaiTypes";
import { routingLegend } from "../legends/LegendRules";

export interface AweInput {
  /** 今いる（退散していない）陰陽師の数 */
  present: number;
  /** 行列の総数（主人公を含む） */
  total: number;
  /** 今の行列の種類 → 数 */
  counts: ReadonlyMap<string, number>;
  /** 賑わいの段（0..4） */
  momentumLevel: number;
}

/**
 * 百鬼夜行の威光：陰陽師を逆に退かせられるか。理由を返す（null = まだ敵わない）。
 *  陰陽師を退かせる妖怪（データの awe.mode = "rout"：酒呑童子・大天狗）を連れている／化け狐が六妖以上（葛の葉の眷属）／
 *  五十妖以上（陰陽師が二人以上なら八十妖以上）／熱狂の百鬼夜行（三十妖以上、陰陽師が一人のときだけ）
 */
export function onmyojiAwe(i: AweInput): AweReason | null {
  if (i.present <= 0) return null;
  const legend = routingLegend(i.counts);
  if (legend) return legend;
  if ((i.counts.get("kitsune") ?? 0) >= AWE.kitsune) return "kitsune";
  if (i.total >= aweNeed(i.present)) return "size";
  if (i.present === 1 && i.momentumLevel >= AWE.fervorLevel && i.total >= AWE.fervorMin) return "fervor";
  return null;
}

/** 退散のときの一言・絵巻の一言（妖怪が理由なら、その妖怪のデータから） */
export function routText(reason: AweReason) {
  const a = YOKAI[reason]?.awe;
  return a?.mode === "rout" ? a.text : ROUT_TEXT[reason as CrowdAweReason] ?? ROUT_TEXT.size;
}
export function routMemory(reason: AweReason) {
  const a = YOKAI[reason]?.awe;
  return a?.mode === "rout" ? a.memory : ROUT_MEMORY[reason as CrowdAweReason] ?? ROUT_MEMORY.size;
}

/** 人数だけで退かせるのに要る妖数 */
export function aweNeed(present: number) {
  return present >= 2 ? AWE.group : AWE.solo;
}

/**
 * 陰陽師から (px, pz) が視野に入っているか（遮るものは呼び出し側で別に判定する）。
 * yaw は Actor と同じ（前方 = (sin yaw, cos yaw)）。
 */
export function inSight(ax: number, az: number, yaw: number, px: number, pz: number, cfg: { sight: number; halfAngle: number; near: number } = ONMYOJI_CFG) {
  const dx = px - ax, dz = pz - az;
  const d = Math.hypot(dx, dz);
  if (d <= cfg.near) return true;
  if (d > cfg.sight) return false;
  const cos = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d;
  return cos >= Math.cos(cfg.halfAngle);
}

/** 見られている間、1 秒あたりに溜まる「怪しさ」（近いほど速く、遠いと遅い） */
export function suspicionRate(dist: number, cfg: { sight: number; near: number; fillNear: number; fillFar: number } = ONMYOJI_CFG) {
  const k = Math.min(1, Math.max(0, (dist - cfg.near) / Math.max(0.01, cfg.sight - cfg.near)));
  return cfg.fillNear + (cfg.fillFar - cfg.fillNear) * k;
}

/** 一度に祓われる妖怪の数（主人公以外の人数から。罰は軽く：三〜八妖） */
export function purgeCount(followers: number) {
  if (followers <= 0) return 0;
  return Math.min(followers, Math.max(3, Math.min(8, Math.round(followers * 0.1))));
}

/** 現れる条件（人数か夜の進み具合のどちらか） */
export function guardArrives(arrive: { total?: number; progress?: number } | null, total: number, progress: number) {
  if (!arrive) return true;
  return (arrive.total !== undefined && total >= arrive.total) || (arrive.progress !== undefined && progress >= arrive.progress);
}
