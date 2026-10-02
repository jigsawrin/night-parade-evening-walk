/**
 * NightLegendRoster：今夜、町のどこかにいる大妖怪・三大妖怪と、隠し妖怪（今夜の候補）。
 * 一夜の始まりに ?seed= の乱数から選ぶ：格（大妖怪・三大妖怪）は stream "legendRoster"、
 * 隠し妖怪は発見方式（discovery = hidden）で別に stream "legendHidden"。隠し妖怪は格の抽選に混ぜない。
 * 温泉宿で初めて見つかる隠し妖怪（ぬらりひょん）は、見つけるまで今夜の候補に入らない（HIDDEN_DISCOVERIES）。
 * 同じ seed なら同じ候補（「この seed に鵺はいた？」）。加わるかどうかはプレイヤー次第。
 * 候補は画面に一覧で出さない（噂・気配・景色で知る）。?debug のときだけ表示する。
 * 候補に入らなかった特別な妖怪は、今夜は町に置かない（WildYokai・SpawnGate）。どの妖怪も一夜に一体まで。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import type { Rng } from "../../core/seed";
import { NIGHT_ROSTER, type LegendRank, type RosterConfig } from "../../data/legendConfig";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiDiscovery, type YokaiRank } from "../../data/yokaiTypes";
import { isSpecialYokai } from "./LegendRules";
import { hiddenWorldChance, hiddenWorldEligible, type LegendProgress } from "./LegendProgress";

export interface LegendCandidate {
  id: string;
  rank: YokaiRank;
  discovery: YokaiDiscovery;
}

export interface NightLegendRosterData {
  /** 大妖怪（発見方式が通常のもの） */
  greater: string[];
  /** 三大妖怪（発見方式が通常のもの） */
  threeGreat: string[];
  /** 隠し妖怪（格は問わない。いなければ空） */
  hidden: string[];
}

/** 図鑑の順に並んだ、本編に出る特別な妖怪（大妖怪以上か隠し。zukanAvailability が future のものは入れない） */
export function legendCandidates(defs = YOKAI, order: readonly string[] = YOKAI_ORDER): LegendCandidate[] {
  return order.filter((id) => isActiveYokai(defs[id]) && isSpecialYokai(defs[id])).map((id) => ({ id, rank: defs[id].rank, discovery: defs[id].discovery }));
}

/** min..max から何種類選ぶか（ある数より多くは選ばない） */
export function drawCount(rng: Rng, r: { min: number; max: number }, available: number) {
  const lo = Math.max(0, Math.min(r.min, r.max)), hi = Math.max(lo, r.max);
  return Math.min(available, lo + rng.int(hi - lo + 1));
}

/** ids から n 種類（重複なし。並びは元の順） */
export function drawSome(rng: Rng, ids: readonly string[], r: { min: number; max: number }) {
  const pool = [...new Set(ids)];
  const n = drawCount(rng, r, pool.length);
  const picked = new Set(rng.shuffle([...pool]).slice(0, n));
  return pool.filter((id) => picked.has(id));
}

const ofRank = (cands: readonly LegendCandidate[], rank: LegendRank) => cands.filter((c) => c.rank === rank && c.discovery !== "hidden").map((c) => c.id);

/** 隠し妖怪の候補の資格と確率（縁帳から。無ければ「見つけていない」として扱う） */
export interface HiddenRosterRules {
  eligible(type: string): boolean;
  chance(type: string): number;
}

/** normalZukanComplete：通常の図鑑が埋まっているか（町で初めて見つかる隠し妖怪の条件） */
export function defaultHiddenRules(p: Pick<LegendProgress, "met"> = { met: [] }, cfg: RosterConfig = NIGHT_ROSTER, normalZukanComplete = false): HiddenRosterRules {
  return { eligible: (t) => hiddenWorldEligible(t, p, undefined, normalZukanComplete), chance: (t) => hiddenWorldChance(t, cfg.hidden.chance) };
}

/**
 * 今夜の候補を選ぶ。stream は NightSeed.stream（用途ごとに独立した乱数列）。
 * 候補の一覧（cands）を差し替えられる（テストでは将来の妖怪を想定して試す）。
 * 隠し妖怪は一種類ずつ資格（hidden.eligible）と確率（hidden.chance）を見て、通った中から一種類まで。
 * 乱数は資格が無くても一種類に一回ずつ引く（見つけた妖怪が増えても、ほかの妖怪の抽選の並びが崩れない）。
 */
export function drawNightLegends(
  stream: (name: string) => Rng,
  cands: readonly LegendCandidate[] = legendCandidates(),
  cfg: RosterConfig = NIGHT_ROSTER,
  hidden: HiddenRosterRules = defaultHiddenRules(undefined, cfg),
): NightLegendRosterData {
  const rng = stream("legendRoster");
  const greater = drawSome(rng, ofRank(cands, "greater"), cfg.greater);
  const threeGreat = drawSome(rng, ofRank(cands, "threeGreat"), cfg.threeGreat);
  // 隠し妖怪は別の乱数列（隠し妖怪が増えても、いてもいなくても、格の候補は変わらない）
  const hr = stream("legendHidden");
  const hiddenPool = [...new Set(cands.filter((c) => c.discovery === "hidden").map((c) => c.id))].sort();
  const passed = hiddenPool.filter((t) => {
    const roll = hr.next();
    return hidden.eligible(t) && roll < hidden.chance(t);
  });
  return { greater, threeGreat, hidden: passed.length ? [passed.length === 1 ? passed[0] : hr.pick(passed)] : [] };
}

export class NightLegendRoster {
  readonly data: NightLegendRosterData;
  private all: Set<string>;

  constructor(stream: (name: string) => Rng, cands?: readonly LegendCandidate[], cfg?: RosterConfig, hidden?: HiddenRosterRules) {
    this.data = drawNightLegends(stream, cands, cfg, hidden);
    this.all = new Set([...this.data.greater, ...this.data.threeGreat, ...this.data.hidden]);
  }

  /** 今夜、この妖怪が町にいるか（通常の妖怪はいつでも true） */
  appearsTonight(type: string) {
    return !isSpecialYokai(YOKAI[type]) || this.all.has(type);
  }

  /** ?debug 用 */
  debug() {
    const d = this.data;
    const f = (l: string[]) => (l.length ? l.map((id) => YOKAI[id]?.name ?? id).join("・") : "-");
    return `今夜の大妖怪 ${f(d.greater)}　三大 ${f(d.threeGreat)}　隠し ${f(d.hidden)}`;
  }
}
