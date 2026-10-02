/**
 * 温泉宿の宿泊客を居場所（data/onsenMap.ts の ONSEN_SPOTS）へ割り当てる純粋な規則。
 *  - 居たがる区域（YokaiType.onsen.preferredArea）の空きを先に、埋まっていれば同じ系統の区域、それも無ければ空いているどこか
 *  - 大きな妖怪（scale）は、その大きさまで置ける居場所だけ（狭い室内に押し込まない）。小さな妖怪は大きな居場所をなるべく使わない
 *  - 浮く妖怪は湯につからず、宙の居場所は浮く妖怪だけ
 *  - 開いていない区域（宴会場・奥庭）の居場所は使わない。一つの居場所に一妖だけ
 *  - 隠し妖怪 → 大きな妖怪 → 三大妖怪 → 大妖怪 → 通常の妖怪 の順に決める（上座や広い場所を先に）
 * 同じ乱数・同じ客なら同じ割り当て（訪問の種から作った乱数を渡す）。妖怪ごとの if 文は書かない（データだけで決まる）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { ONSEN_AREAS, type OnsenZone } from "../../data/onsen";
import type { OnsenSpotDef } from "../../data/onsenMap";
import type { YokaiType } from "../../data/yokaiTypes";

type GuestDef = Pick<YokaiType, "rank" | "discovery" | "family" | "scale" | "onsen">;

/** この大きさ以上は「大きな妖怪」（先に広い居場所を取る） */
export const BIG_SCALE = 1.7;

export interface Placement {
  type: string;
  spot: OnsenSpotDef;
}

const RANK_ORDER = { threeGreat: 1, greater: 2, normal: 3 } as const;

/** その居場所に置けるか（区域が開いている・空いている・大きさ・浮く妖怪と湯） */
export function spotFits(s: OnsenSpotDef, d: GuestDef, open: ReadonlySet<OnsenZone>) {
  if (!open.has(ONSEN_AREAS[s.area].zone)) return false;
  if ((d.scale ?? 1) > s.maxScale) return false;
  const floats = d.family === "FLOAT";
  if (s.pose === "float" && !floats) return false;
  if (s.pose === "soak" && floats) return false;
  return true;
}

/** 決める順番：隠し → 大きな妖怪（大きい順）→ 三大妖怪 → 大妖怪 → 通常 */
function order(types: readonly string[], defs: Readonly<Record<string, GuestDef>>) {
  const key = (t: string) => {
    const d = defs[t];
    const s = d.scale ?? 1;
    return [d.discovery === "hidden" ? 0 : 1, s >= BIG_SCALE ? -s : 0, RANK_ORDER[d.rank]];
  };
  return types
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((o) => o.t);
}

/**
 * 宿泊客（types）を居場所へ。置けなかった妖怪は返さない（居場所の数は宿泊客の上限より十分多くしてある：テストで確かめる）。
 * rand は 0..1 の乱数（訪問の種から）。同じ区域の中でどこに座るかだけに使う
 */
export function placeGuests(
  types: readonly string[],
  defs: Readonly<Record<string, GuestDef>>,
  spots: readonly OnsenSpotDef[],
  open: ReadonlySet<OnsenZone>,
  rand: () => number,
): Placement[] {
  const used = new Set<string>();
  const out: Placement[] = [];
  for (const t of order(types.filter((t) => !!defs[t]), defs)) {
    const d = defs[t];
    const scale = d.scale ?? 1;
    const fits = spots.filter((s) => !used.has(s.id) && spotFits(s, d, open));
    if (!fits.length) continue;
    const pref = d.onsen?.preferredArea;
    const group = pref ? ONSEN_AREAS[pref].group : null;
    const tiers = [
      fits.filter((s) => s.area === pref),
      fits.filter((s) => group && ONSEN_AREAS[s.area].group === group),
      fits,
    ];
    const tier = tiers.find((l) => l.length)!;
    // 大きさに見合った居場所（余りの少ない順）から、同じくらいのものの中で乱数で選ぶ
    const waste = (s: OnsenSpotDef) => Math.floor((s.maxScale - scale) / 0.5);
    const best = Math.min(...tier.map(waste));
    // 上座のような特別な居場所（区域の最初の居場所）を、その区域を居たがる格の高い客へ
    const snug = tier.filter((s) => waste(s) === best);
    const pick = d.rank !== "normal" || d.discovery === "hidden" ? snug[0] : snug[Math.floor(rand() * snug.length) % snug.length];
    used.add(pick.id);
    out.push({ type: t, spot: pick });
  }
  return out;
}
