/**
 * 絵巻に並べる顔ぶれ。0 人目は主人公、1 人目以降は妖怪（加入順）。
 * 巻物は右から左へ読む：右端が最後に加入した妖怪、左端が 0 人目（主人公）。
 * 1 人目に来る妖怪は決まっていない（鬼でなくてよい）。主人公の id は呼び出し側が決める
 * （web 版は data/protagonist.ts、ロブロックス版は Roblox のアバター）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import { PROTAGONIST } from "../../data/protagonist";

export interface EmakiSlot {
  /** 0 = 主人公、1 以降 = 加入順の妖怪 */
  index: number;
  kind: "protagonist" | "yokai";
  /** 主人公は主人公の id、妖怪は種類 id */
  id: string;
}

/** 左から右へ（0 人目が左端、最後に加入した妖怪が右端） */
export function emakiSlots(joinOrder: readonly string[], protagonistId: string = PROTAGONIST.typeId): EmakiSlot[] {
  return [{ index: 0, kind: "protagonist", id: protagonistId }, ...joinOrder.map((id, i) => ({ index: i + 1, kind: "yokai" as const, id }))];
}

/** 読む順（右端から左端へ。最後に加入した妖怪が先頭） */
export function emakiReadingOrder(slots: readonly EmakiSlot[]): EmakiSlot[] {
  return [...slots].reverse();
}
