/**
 * ブラウザに残すもの：図鑑（これまでに出会った妖怪と数）・直近 10 夜の結果・縁帳（大妖怪・三大妖怪と結んだ縁）・温泉宿の訪問・
 * 通常妖怪が町へ混ざりはじめる進み具合（歩いた夜の数）。
 * （消音・音量などの設定は presentation/OptionsUI.ts）
 * localStorage が使えない環境（プライベート閲覧など）でも遊べるよう、読み書きの失敗はすべて無視する。
 * 保存先は差し替えられる（テストでは Map で）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import type { NightResult } from "../game/after/NightResult";
import { normalizeLegendProgress, type LegendProgress } from "../game/legends/LegendProgress";
import { normalizeVisitSave, type OnsenVisitSave } from "../game/onsen/OnsenVisit";
import { normalizeNormalProgress, type NormalProgress } from "../game/normal/NormalProgress";

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const HISTORY_KEY = "hyakki.history.v1";
export const ZUKAN_KEY = "hyakki.zukan.v1";
/** 縁帳（履歴とは別。履歴が消えても残る） */
export const LEGENDS_KEY = "hyakki.legends.v1";
/** 温泉宿の訪問（今の訪問の種・必ずいる客・これまでの訪問の数） */
export const ONSEN_KEY = "hyakki.onsen.v1";
/** 通常妖怪の進み具合（夜が正常に終わった数。履歴とは別：履歴は 10 件までしか残らない） */
export const NORMAL_PROGRESS_KEY = "hyakki.normalProgress.v1";
export const HISTORY_MAX = 10;

/** 使えるブラウザの保存先（無ければ null） */
export function browserKV(): KV | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const k = "hyakki.__probe";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function read<T>(kv: KV | null, key: string, fallback: T): T {
  if (!kv) return fallback;
  try {
    const raw = kv.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(kv: KV | null, key: string, v: unknown) {
  if (!kv) return false;
  try {
    kv.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 結果の履歴

/** 直近の結果（新しい順） */
export function loadHistory(kv: KV | null): NightResult[] {
  const list = read<NightResult[]>(kv, HISTORY_KEY, []);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.total === "number") : [];
}

/** 保存用に小さくする（ルートは小数 1 桁） */
export function compactResult(r: NightResult): NightResult {
  const q = (v: number) => Math.round(v * 10) / 10;
  return { ...r, route: r.route.map((p) => ({ x: q(p.x), z: q(p.z), t: q(p.t) })) };
}

/** 結果を先頭に足し、HISTORY_MAX 件を超えた古いものを捨てる。保存できなかったら古いものから減らして再挑戦 */
export function pushHistory(kv: KV | null, r: NightResult, max = HISTORY_MAX): NightResult[] {
  let list = [compactResult(r), ...loadHistory(kv)].slice(0, max);
  while (list.length && !write(kv, HISTORY_KEY, list)) list = list.slice(0, list.length - 1);
  return list;
}

// ---------------------------------------------------------------- 図鑑

/** 種類 → これまでに仲間になった数（すべての夜の合計） */
export function loadZukan(kv: KV | null): Record<string, number> {
  const z = read<Record<string, number>>(kv, ZUKAN_KEY, {});
  return z && typeof z === "object" ? z : {};
}

export function addZukan(kv: KV | null, type: string, n = 1): Record<string, number> {
  const z = loadZukan(kv);
  z[type] = (z[type] ?? 0) + n;
  write(kv, ZUKAN_KEY, z);
  return z;
}

// ---------------------------------------------------------------- 縁帳

/** 無い・壊れている・古い形でも、読める分だけ（無ければ空から） */
export function loadLegendProgress(kv: KV | null): LegendProgress {
  return normalizeLegendProgress(read<unknown>(kv, LEGENDS_KEY, null));
}

export function saveLegendProgress(kv: KV | null, p: LegendProgress) {
  return write(kv, LEGENDS_KEY, p);
}

// ---------------------------------------------------------------- 温泉宿の訪問

export function loadOnsenVisit(kv: KV | null): OnsenVisitSave {
  return normalizeVisitSave(read<unknown>(kv, ONSEN_KEY, null));
}

export function saveOnsenVisit(kv: KV | null, v: OnsenVisitSave) {
  return write(kv, ONSEN_KEY, v);
}

// ---------------------------------------------------------------- 通常妖怪の進み具合

/** 無ければ historyCount（今までの履歴の件数）を夜の数の最低値にして作る（既存のプレイヤーの移行） */
export function loadNormalProgress(kv: KV | null, historyCount = 0): NormalProgress {
  return normalizeNormalProgress(read<unknown>(kv, NORMAL_PROGRESS_KEY, null), historyCount);
}

export function saveNormalProgress(kv: KV | null, p: NormalProgress) {
  return write(kv, NORMAL_PROGRESS_KEY, p);
}
