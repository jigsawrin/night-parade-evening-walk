/**
 * 大妖怪・三大妖怪（legend）と隠し妖怪の純粋な判定：格・発見方式・一夜一体（出す窓口）・加入条件・足りないものの言葉・陰陽師への効き目。
 * 格（rank）と発見方式（discovery）は別の軸。隠しは格ではない。
 * 妖怪ごとの if 文は書かない（違いはすべて data/yokaiTypes.ts のデータで表す）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { YOKAI, YOKAI_ORDER, type JoinRule, type LegendCondition, type YokaiDiscovery, type YokaiRank, type YokaiType } from "../../data/yokaiTypes";
import { DISTRICT_BY_ID } from "../../data/districts";
import { ENCOUNTER_GOALS } from "../../data/encounters";
import { MOMENTUM_LEVELS } from "../FestivalMomentum";
import { toKanji } from "../../core/util";

export type LegendRule = Extract<JoinRule, { kind: "legend" }>;

type RankOnly = Pick<YokaiType, "rank"> & Partial<Pick<YokaiType, "uniquePerNight" | "discovery">>;
type Kind = Pick<YokaiType, "rank"> & Partial<Pick<YokaiType, "discovery">>;

export function rankOf(def: Pick<YokaiType, "rank"> | undefined): YokaiRank {
  return def?.rank ?? "normal";
}
export function discoveryOf(def: Partial<Pick<YokaiType, "discovery">> | undefined): YokaiDiscovery {
  return def?.discovery ?? "normal";
}
/** 大妖怪以上（greater・threeGreat） */
export function isLegend(def: Pick<YokaiType, "rank"> | undefined) {
  return rankOf(def) !== "normal";
}
export function isThreeGreat(def: Pick<YokaiType, "rank"> | undefined) {
  return rankOf(def) === "threeGreat";
}
/** 隠し妖怪（発見方式。格は問わない） */
export function isHidden(def: Partial<Pick<YokaiType, "discovery">> | undefined) {
  return discoveryOf(def) === "hidden";
}
/** 特別な妖怪（大妖怪以上か隠し）：今夜の候補に入ったときだけ町にいる。Encounter・報酬・誘導からは出さない */
export function isSpecialYokai(def: Kind | undefined) {
  return !!def && (isLegend(def) || isHidden(def));
}
/**
 * 一夜に一体まで（それだけを表す。大妖怪かどうかとは別：通常妖怪にも一夜一体の妖怪がいる。白沢・八尺様など）。
 * 大妖怪以上・隠し妖怪は書かなくても一体。複数いる隠し妖怪は uniquePerNight: false で例外にする
 */
export function isUniquePerNight(def: RankOnly | undefined) {
  return !!def && (def.uniquePerNight ?? (isLegend(def) || isHidden(def)));
}

/** 姿を見せる経路：generic = 初期配置・気配の段階・地区覚醒・世界の層・夜の進み（appearAt）・提灯など／hidden = revealHidden だけ */
export type RevealRoute = "generic" | "hidden";

/** 姿を見せてよいか。隠し妖怪は revealHidden（route "hidden"）でだけ姿を見せる（どの通常の経路からも出ない） */
export function revealAllowed(def: Partial<Pick<YokaiType, "discovery">> | undefined, route: RevealRoute) {
  return route === "hidden" || !isHidden(def);
}
/** 陰陽師に祓われない（大妖怪以上） */
export function resistsPurge(def: Pick<YokaiType, "rank"> | undefined) {
  return isLegend(def);
}

/** 大妖怪の加入条件が読む、今の百鬼夜行の様子（低頻度で作り直す） */
export interface LegendContext {
  /** 今の行列にいる種類 → 数（散った・祓われた妖怪は数えない） */
  counts: ReadonlyMap<string, number>;
  /** 行列の総数（主人公を含む） */
  total: number;
  /** 成就した行列の遊びの数 */
  activities: number;
  /** 祭りにした地区の id */
  districtsAwakened: readonly string[];
  /** 成就した Encounter の種類 → 回数 */
  encounters: ReadonlyMap<string, number>;
  /** 賑わいの段（0..4） */
  momentumLevel: number;
}

export function emptyLegendContext(): LegendContext {
  return { counts: new Map(), total: 1, activities: 0, districtsAwakened: [], encounters: new Map(), momentumLevel: 0 };
}

const typeName = (t: string) => YOKAI[t]?.name ?? t;

function encounterGoal(kind: string | undefined, n: string) {
  const tpl = (kind && (ENCOUNTER_GOALS as Record<string, string>)[kind]) || "出来事を{n}つ成就する";
  return tpl.replace("{n}", n);
}

/** 条件一つの「満たしたか」と「足りないときの短い言葉」 */
export function checkCondition(c: LegendCondition, x: LegendContext): { met: boolean; lack: string } {
  switch (c.kind) {
    case "specificYokai": {
      const lack = c.n - (x.counts.get(c.type) ?? 0);
      return { met: lack <= 0, lack: `${typeName(c.type)}あと${toKanji(lack)}妖` };
    }
    case "totalCount": {
      const lack = c.n - x.total;
      return { met: lack <= 0, lack: `行列あと${toKanji(lack)}妖` };
    }
    case "activityCount": {
      const lack = c.n - x.activities;
      return { met: lack <= 0, lack: `行列の遊びあと${toKanji(lack)}つ` };
    }
    case "districtAwakened": {
      if (c.district) {
        const name = DISTRICT_BY_ID.get(c.district)?.name ?? c.district;
        return { met: x.districtsAwakened.includes(c.district), lack: `${name}を祭りにする` };
      }
      const lack = (c.n ?? 1) - x.districtsAwakened.length;
      return { met: lack <= 0, lack: `祭りの地区あと${toKanji(lack)}つ` };
    }
    case "encounterComplete": {
      let done = 0;
      if (c.encounter) done = x.encounters.get(c.encounter) ?? 0;
      else for (const n of x.encounters.values()) done += n;
      const lack = c.n - done;
      return { met: lack <= 0, lack: encounterGoal(c.encounter, `あと${toKanji(lack)}`) };
    }
    case "momentum": {
      const name = MOMENTUM_LEVELS[Math.min(MOMENTUM_LEVELS.length - 1, Math.max(0, c.level))].name;
      return { met: x.momentumLevel >= c.level, lack: `賑わいを「${name}」まで高める` };
    }
    case "typeVariety": {
      let kinds = 0;
      for (const n of x.counts.values()) if (n > 0) kinds++;
      const lack = c.n - kinds;
      return { met: lack <= 0, lack: `妖怪の種類あと${toKanji(lack)}つ` };
    }
  }
}

/** 足りないものを短い言葉で返す（空なら加入できる） */
export function legendMissing(rule: Pick<LegendRule, "conditions">, x: LegendContext): string[] {
  const out: string[] = [];
  for (const c of rule.conditions) {
    const r = checkCondition(c, x);
    if (!r.met) out.push(r.lack);
  }
  return out;
}

export function legendMet(rule: Pick<LegendRule, "conditions">, x: LegendContext) {
  return rule.conditions.every((c) => checkCondition(c, x).met);
}

/** 条件そのものを短い言葉で（結果・縁帳の「どうやって加わったか」）。例：["小鬼八妖", "化け狸二妖"] */
export function describeLegendRule(rule: Pick<LegendRule, "conditions">): string[] {
  return rule.conditions.map((c) => {
    switch (c.kind) {
      case "specificYokai":
        return `${typeName(c.type)}${toKanji(c.n)}妖`;
      case "totalCount":
        return `${toKanji(c.n)}妖の行列`;
      case "activityCount":
        return `行列の遊び${toKanji(c.n)}つ`;
      case "districtAwakened":
        return c.district ? `${DISTRICT_BY_ID.get(c.district)?.name ?? c.district}の祭り` : `祭りの地区${toKanji(c.n ?? 1)}つ`;
      case "encounterComplete":
        return encounterGoal(c.encounter, toKanji(c.n));
      case "momentum":
        return `賑わい「${MOMENTUM_LEVELS[Math.min(MOMENTUM_LEVELS.length - 1, Math.max(0, c.level))].name}」`;
      case "typeVariety":
        return `${toKanji(c.n)}種の妖怪`;
    }
  });
}

/** 行列の顔ぶれを数える（低頻度で呼ぶ） */
export function countTypes(actors: Iterable<{ typeId: string }>, out = new Map<string, number>()) {
  out.clear();
  for (const a of actors) out.set(a.typeId, (out.get(a.typeId) ?? 0) + 1);
  return out;
}

// ---------------------------------------------------------------- 出す窓口（一夜一体の保証）

/**
 * 町に妖怪を出す窓口の約束（WildYokai が使う。データの約束ではなく、実行時に二体目を作れないようにする）。
 *  - 特別な妖怪（大妖怪以上・隠し）は今夜の候補に入っているときだけ。一夜一体の妖怪は一度だけ（claim）
 *  - 隠し妖怪を見つけたことは一夜に一度だけ知らせる（discover）
 *  - 報酬・Encounter の汎用の窓口（spawnBonus・spawnWild・adopt）からは、特別な妖怪も、一夜一体の通常妖怪も出せない（allowsGeneric）
 *  - 一夜一体の通常妖怪は今夜の候補（NightLegendRoster）を見ない（通常妖怪の顔ぶれ NormalNightRoster が選ぶ）。claim で一体だけにする
 */
export class SpawnGate {
  private placed = new Set<string>();
  private found = new Set<string>();
  private appearsTonight: (type: string) => boolean;
  private defs: Readonly<Record<string, YokaiType>>;

  constructor(appearsTonight: (type: string) => boolean, defs: Readonly<Record<string, YokaiType>> = YOKAI) {
    this.appearsTonight = appearsTonight;
    this.defs = defs;
  }

  /** 汎用の窓口から出してよい（通常妖怪で、発見方式も通常で、一夜一体でない） */
  allowsGeneric(type: string) {
    const def = this.defs[type];
    return !isSpecialYokai(def) && !isUniquePerNight(def);
  }

  /** 特別な妖怪・一夜一体の妖怪の窓口：（特別な妖怪は）今夜いて、一夜一体ならまだ出していないときだけ true（出したことを記録する） */
  claim(type: string) {
    const def = this.defs[type];
    if (!def) return false;
    if (isSpecialYokai(def) && !this.appearsTonight(type)) return false;
    if (!isUniquePerNight(def)) return true;
    if (this.placed.has(type)) return false;
    this.placed.add(type);
    return true;
  }

  /** 今夜もう出した一夜一体の妖怪 */
  get claimed(): ReadonlySet<string> {
    return this.placed;
  }

  /** 隠し妖怪を今夜はじめて見つけた（true は一夜に一度だけ。specialDiscovered を流す合図） */
  discover(type: string) {
    if (!isHidden(this.defs[type]) || this.found.has(type)) return false;
    this.found.add(type);
    return true;
  }
}

// ---------------------------------------------------------------- 陰陽師への効き目

/** 連れていると陰陽師が退散する妖怪（格の高い順、同じ格なら図鑑の順。先に見つかったものが理由になる） */
export function routingLegend(counts: ReadonlyMap<string, number>, defs: Readonly<Record<string, YokaiType>> = YOKAI, order: readonly string[] = YOKAI_ORDER): string | null {
  for (const rank of ["threeGreat", "greater", "normal"] as const) {
    for (const id of order) {
      if (defs[id]?.rank === rank && defs[id].awe?.mode === "rout" && (counts.get(id) ?? 0) > 0) return id;
    }
  }
  return null;
}

/**
 * 連れている妖怪の、陰陽師を弱める効き目（退散まではしない）。
 * castScale：詠唱の長さに掛ける（1 以上）。suspicionScale：怪しさの溜まり方に掛ける（1 以下）。
 */
export function aweModifiers(counts: ReadonlyMap<string, number>, defs: Readonly<Record<string, YokaiType>> = YOKAI) {
  let castScale = 1, suspicionScale = 1;
  for (const [id, n] of counts) {
    const a = n > 0 ? defs[id]?.awe : undefined;
    if (a?.mode === "slowCast") castScale = Math.max(castScale, 1 + a.amount);
    else if (a?.mode === "lowerSuspicion") suspicionScale = Math.min(suspicionScale, Math.max(0, 1 - a.amount));
  }
  return { castScale, suspicionScale };
}
