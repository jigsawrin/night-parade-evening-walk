/**
 * 温泉宿「宵霞楼」の訪問（純粋な規則）：入れるか・一回の訪問・今回の宿泊客。
 *  - 入れるか：縁帳の SPECIAL_UNLOCKS（温泉宿の噂・道・特別宴会場・最深部）をそのまま使う（evaluateSpecialUnlocks）
 *  - 訪問：「宿を出る」までが一回。訪問ごとに種（seed）を一つ決めて保存する（hyakki.onsen.v1）。リロード・図鑑・写真・部屋の移動では変わらない
 *  - 宿泊客：drawOnsenGuests（OnsenGuestRoster）に、図鑑（一度でも仲間にした妖怪）・縁帳・訪問の種を渡すだけ。
 *    初めて見つかる隠し妖怪（ぬらりひょん）は、訪問を始めたときの onsenFirstDiscoveries を forcedGuests として保存し、その訪問の間は変えない
 * 入館しただけでは何も記録しない（隠し妖怪の発見は、話しかけたとき：LegendProgress.discoverHidden）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { evaluateSpecialUnlocks, onsenFirstDiscoveries, type LegendProgress } from "../legends/LegendProgress";
import { joinedTypes, zukanCompletion } from "../ZukanRules";
import { drawOnsenGuests, type OnsenGuests } from "./OnsenGuestRoster";
import type { OnsenZone } from "../../data/onsen";

type Progress = Pick<LegendProgress, "met" | "joined">;

/** 宿に入れるか・どこまで開いているか（噂は入口の手前の小さな知らせだけ） */
export interface OnsenAccess {
  rumor: boolean;
  entrance: boolean;
  banquet: boolean;
  inner: boolean;
}

export function onsenAccess(p: Progress): OnsenAccess {
  const u = evaluateSpecialUnlocks(p);
  return { rumor: !!u.onsenRumor, entrance: !!u.onsenEntrance, banquet: !!u.onsenBanquet, inner: !!u.onsenInnerArea };
}

/** 開いている区域（入口が開いていなければ何も無い） */
export function openZones(a: OnsenAccess): Set<OnsenZone> {
  const z = new Set<OnsenZone>();
  if (!a.entrance) return z;
  z.add("base");
  if (a.banquet) z.add("banquet");
  if (a.inner) z.add("inner");
  return z;
}

/** 保存する訪問の記録（hyakki.onsen.v1） */
export interface OnsenVisitSave {
  version: 1;
  /** これまでに始めた訪問の数 */
  visitNo: number;
  /** 今の訪問（宿を出たら null） */
  active: { seed: number; forced: string[] } | null;
}

export function emptyVisitSave(): OnsenVisitSave {
  return { version: 1, visitNo: 0, active: null };
}

/** 読み込んだ値を整える（壊れていても、読める分だけ） */
export function normalizeVisitSave(v: unknown): OnsenVisitSave {
  const o = (v && typeof v === "object" ? v : {}) as Partial<OnsenVisitSave>;
  const a = o.active && typeof o.active === "object" ? o.active : null;
  return {
    version: 1,
    visitNo: typeof o.visitNo === "number" && o.visitNo >= 0 ? Math.floor(o.visitNo) : 0,
    active: a && typeof a.seed === "number" ? { seed: a.seed >>> 0, forced: Array.isArray(a.forced) ? a.forced.filter((t) => typeof t === "string") : [] } : null,
  };
}

/**
 * 初めて見つかる隠し妖怪（今の図鑑・縁帳で、温泉宿で必ず会うもの）。
 * 図鑑の条件は「通常妖怪を知り尽くした」（normalWave が最後の wave まで開き、通常の枠をすべて埋めた：allNormalContentComplete）
 */
export function firstDiscoveriesNow(zukan: Readonly<Record<string, number>>, p: Progress, normalWave = 0) {
  const all = zukanCompletion(zukan, { met: p.met, normalWave }).allNormalContentComplete;
  return onsenFirstDiscoveries({ progress: p, normalZukanComplete: all, unlocks: evaluateSpecialUnlocks(p) });
}

/**
 * 宿に入る：今の訪問が続いていればそのまま（リロード）、無ければ新しい訪問を始める（訪問の数を一つ増やし、種と必ずいる客を決める）。
 * 戻り値の save を保存する
 */
export function beginVisit(save: OnsenVisitSave, newSeed: () => number, forcedNow: readonly string[]): OnsenVisitSave {
  if (save.active) return save;
  return { version: 1, visitNo: save.visitNo + 1, active: { seed: newSeed() >>> 0, forced: [...forcedNow] } };
}

/** 宿を出る：次に来たときが新しい訪問 */
export function leaveVisit(save: OnsenVisitSave): OnsenVisitSave {
  return { ...save, active: null };
}

/** 今回の宿泊客（同じ訪問の種＋同じ図鑑・縁帳なら同じ顔ぶれ） */
export function visitGuests(zukan: Readonly<Record<string, number>>, p: Progress, visit: { seed: number; forced: readonly string[] }): OnsenGuests {
  return drawOnsenGuests({ registered: joinedTypes(zukan), legendProgress: p, seed: visit.seed, forcedGuests: visit.forced });
}
