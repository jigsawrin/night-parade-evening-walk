/**
 * 誘導の向け先（Content）の純粋な規則：何を気配・狐火・言霊・Pacing の向け先にしてよいか。
 *  - wild：町の通常妖怪。通常の気配（ParadeAttraction）・言霊が向く
 *  - legend：大妖怪・三大妖怪。世界そのものから偶然聞こえる弱い気配（ParadeAttraction）だけ。Pacing・狐火・言霊は向けない
 *  - hidden：隠し妖怪。向け先の一覧（content）に入れない。通常の気配も出さない（将来、隠し妖怪専用の発見の仕組みだけが扱う）
 * 判定は発見方式 → 格の順（気配の無い隠し妖怪が wild に落ちない）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import type { Rng } from "../core/seed";
import type { OmenKind } from "../data/encounters";
import { LEGEND_OMEN_WEIGHT } from "../data/legendConfig";
import { YOKAI, type YokaiType } from "../data/yokaiTypes";
import { isHidden, isLegend } from "./legends/LegendRules";

export type ContentSource = "wild" | "legend" | "hidden" | "encounter" | "rumor" | "district" | "activity";

/** 気配の向け先（まだ攻略していない何か） */
export interface ContentPoint {
  x: number;
  z: number;
  omen: OmenKind;
  /** 選ばれやすさ */
  w: number;
  source: ContentSource;
}

/** 選ぶときの絞り込み。allowed / excluded はふるい（選ばれない）、prefer は重み（選ばれやすい）だけ */
export interface ContentFilter {
  allowed?: readonly ContentSource[];
  excluded?: readonly ContentSource[];
  prefer?: readonly ContentSource[];
}

/** NightPacing（再提示・狐火の道しるべ）が向けてよいもの：すでにある出来事・地区・遊びだけ。妖怪・大妖怪・隠しは向けない */
export const PACING_FILTER: ContentFilter = { allowed: ["rumor", "encounter", "district", "activity"] };
/** 言霊（序盤の誘導）が向けてよいもの：町の通常妖怪だけ */
export const KOTODAMA_FILTER: ContentFilter = { allowed: ["wild"] };

/** hidden は allowed で名指ししない限り、どの選び方でも選ばれない */
export function sourceAllowed(source: ContentSource, f: ContentFilter = {}) {
  if (f.allowed) return f.allowed.includes(source);
  if (source === "hidden") return false;
  return !f.excluded?.includes(source);
}

/** 野良妖怪の向け先の種類（発見方式を先に見る） */
export function wildSource(def: Pick<YokaiType, "rank" | "discovery"> | undefined): "wild" | "legend" | "hidden" {
  if (isHidden(def)) return "hidden";
  if (isLegend(def)) return "legend";
  return "wild";
}

/**
 * 町の野良妖怪の向け先。隠し妖怪は null（一覧に入れない）。
 * 大妖怪・三大妖怪はその妖怪らしい気配（omen）で、通常妖怪は種類ごとの気配で。
 */
export function wildContent(w: { type: string; state: string; perchY: number }, x: number, z: number, defs: Readonly<Record<string, YokaiType>> = YOKAI): ContentPoint | null {
  const def = defs[w.type];
  const src = wildSource(def);
  if (src === "hidden") return null;
  if (src === "legend") return { x, z, omen: def?.omen?.kind ?? omenForType(w.type), w: LEGEND_OMEN_WEIGHT, source: "legend" };
  const kind: OmenKind = w.state === "dormant" ? "lantern" : w.perchY > 0.5 ? "shadow" : omenForType(w.type);
  return { x, z, omen: kind, w: 1, source: "wild" };
}

/** 姿を見せたときに遠くへ届く気配（隠し妖怪は出さない） */
export function revealOmen(type: string, defs: Readonly<Record<string, YokaiType>> = YOKAI): OmenKind | null {
  const def = defs[type];
  if (isHidden(def)) return null;
  return def?.omen?.kind ?? omenForType(type);
}

/**
 * 気配・誘導の向け先を選ぶ。最寄りの一つに固定せず、重み付きで選ぶ（直前と同じ方向 lastDir は選ばれにくい）。
 */
export function pickContent(content: readonly ContentPoint[], px: number, pz: number, near: number, far: number, rng: Rng, f: ContentFilter = {}, lastDir: number | null = null): ContentPoint | null {
  const cand = content.filter((c) => {
    if (!sourceAllowed(c.source, f)) return false;
    const d = Math.hypot(c.x - px, c.z - pz);
    return d > near && d < far;
  });
  return rng.weighted(cand, (c) => {
    let w = c.w * (f.prefer?.includes(c.source) ? 2.5 : 1);
    if (lastDir !== null) {
      const a = Math.atan2(c.x - px, c.z - pz) - lastDir;
      if (Math.cos(a) > 0.7) w *= 0.35;
    }
    return w;
  });
}

/** 最寄りの向け先（言霊の向け先・近くに何かあるかの判定）。near より近いものは除く */
export function nearestContent(content: readonly ContentPoint[], px: number, pz: number, near = 18, f: ContentFilter = {}): ContentPoint | null {
  let best: ContentPoint | null = null;
  let bd = Infinity;
  for (const c of content) {
    if (!sourceAllowed(c.source, f)) continue;
    const d = Math.hypot(c.x - px, c.z - pz) / (c.source === "encounter" ? 1.6 : 1);
    if (d < near || d > bd) continue;
    bd = d;
    best = c;
  }
  return best;
}

/** 妖怪の種類ごとの「気配」の出し方 */
export function omenForType(type: string): OmenKind {
  switch (type) {
    case "nekomata":
      return "glint";
    case "hitodama":
    case "kitsune":
      return "foxfire";
    case "chochin":
      return "lantern";
    case "tanuki":
      return "taiko";
    case "karakasa":
    case "rokurokubi":
      return "shadow";
    default:
      return "warai";
  }
}
