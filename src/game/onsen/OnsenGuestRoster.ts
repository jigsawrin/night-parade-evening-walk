/**
 * OnsenGuestRoster：温泉宿（まだ場所そのものは無い）に、今回の訪問で泊まっている妖怪を選ぶ純粋ロジック。
 *  - 図鑑に載った（一度でも仲間にした）妖怪が宿泊客の候補（図鑑に載る＝いつか泊まりに来られる）
 *  - 大妖怪・三大妖怪は縁帳で「仲間にした」ことも要る（ONSEN_GUESTS.legendNeedsJoined。data/onsen.ts で変えられる）
 *  - 毎回全員は泊まっていない。訪問ごとに一部を選ぶ（「今日は誰が泊まっているかな？」）。数は格ごと（data/onsen.ts）
 *  - 同じ訪問の seed ＋ 同じ図鑑・縁帳なら、同じ顔ぶれ（格ごとに別の乱数列：onsenNormal・onsenGreater・onsenThreeGreat・onsenHidden。
 *    通常妖怪が増えても、大妖怪・三大妖怪の顔ぶれは変わりにくい）
 *  - 隠し妖怪は、見つけた（縁帳の met）後だけ隠し妖怪の抽選に入る
 *  - 旅館では加入条件を求めない。宿泊客はくつろいでいるだけ（攻略・依頼・スコアにしない）
 * 旅館に入れるかどうか（evaluateSpecialUnlocks）とは別の仕組み。
 * forcedGuests：その訪問では必ずいる客（抽選の数の上限の外）。初めて見つかる隠し妖怪（ぬらりひょん）は
 *   LegendProgress.onsenFirstDiscoveries で決めてここへ渡す（抽選には任せない）。
 * extraEligible：図鑑に載る前から抽選の候補にしたい妖怪（将来の特例）。今は使わない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { NightSeed, type Rng } from "../../core/seed";
import { ONSEN_GUESTS, type OnsenGuestConfig } from "../../data/onsen";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiType } from "../../data/yokaiTypes";
import { drawSome } from "../legends/NightLegendRoster";
import type { LegendProgress } from "../legends/LegendProgress";

type GuestDef = Pick<YokaiType, "rank" | "discovery" | "onsen" | "zukanAvailability">;

export interface OnsenGuestInput {
  /** 一度でも仲間にした種類（ZukanRules.joinedTypes）。見つけただけの隠し妖怪は legendProgress.met から足す */
  registered: readonly string[];
  /** 縁帳（大妖怪・三大妖怪の「仲間にした」・隠し妖怪の「見つけた」） */
  legendProgress: Pick<LegendProgress, "met" | "joined">;
  /** 訪問ごとの種（数字か、NightSeed.stream と同じ形の乱数列） */
  seed: number | ((name: string) => Rng);
  /** 図鑑に載っていなくても候補にする種類（将来の特例。無ければ空） */
  extraEligible?: readonly string[];
  /** その訪問では必ずいる客（抽選の外。数の上限を超えても残る） */
  forcedGuests?: readonly string[];
}

export interface OnsenGuests {
  normal: string[];
  greater: string[];
  threeGreat: string[];
  /** 隠し妖怪（格は問わない） */
  hidden: string[];
  /** 必ずいる客（forcedGuests のうち、実在する種類） */
  forced: string[];
  /** 全員（図鑑の順） */
  all: string[];
}

/** 宿泊客になれるか（候補の資格） */
export function onsenEligible(type: string, i: Pick<OnsenGuestInput, "registered" | "legendProgress" | "extraEligible">, cfg: OnsenGuestConfig = ONSEN_GUESTS, defs: Readonly<Record<string, GuestDef>> = YOKAI) {
  const d = defs[type];
  // まだ本編に出ない妖怪（future）は泊まりに来ない
  if (!isActiveYokai(d)) return false;
  if (i.extraEligible?.includes(type)) return true;
  // 隠し妖怪は、見つけた（縁帳の met）ことがあれば候補
  if (d.discovery === "hidden") return i.legendProgress.met.includes(type) || i.registered.includes(type);
  if (!i.registered.includes(type)) return false;
  if (d.rank !== "normal" && cfg.legendNeedsJoined && !i.legendProgress.joined.includes(type)) return false;
  return true;
}

export function drawOnsenGuests(i: OnsenGuestInput, cfg: OnsenGuestConfig = ONSEN_GUESTS, defs: Readonly<Record<string, GuestDef>> = YOKAI, order: readonly string[] = YOKAI_ORDER): OnsenGuests {
  const stream = typeof i.seed === "number" ? (() => { const s = new NightSeed(i.seed); return (n: string) => s.stream(n); })() : i.seed;
  // 図鑑の順（同じ図鑑なら並びも同じ。図鑑の順に無いものは名前順で後ろへ）
  const rankIdx = (t: string) => {
    const k = order.indexOf(t);
    return k < 0 ? order.length : k;
  };
  const cands = [...new Set([...i.registered, ...(i.extraEligible ?? []), ...i.legendProgress.met.filter((t) => defs[t]?.discovery === "hidden")])]
    .filter((t) => onsenEligible(t, i, cfg, defs))
    .sort((a, b) => rankIdx(a) - rankIdx(b) || (a < b ? -1 : a > b ? 1 : 0));
  const visible = cands.filter((t) => defs[t].discovery !== "hidden");
  const forced = [...new Set(i.forcedGuests ?? [])].filter((t) => isActiveYokai(defs[t]));
  const pool = visible.filter((t) => !forced.includes(t));
  const normal = drawSome(stream("onsenNormal"), pool.filter((t) => defs[t].rank === "normal"), cfg.normal);
  const greater = drawSome(stream("onsenGreater"), pool.filter((t) => defs[t].rank === "greater"), cfg.greater);
  const threeGreat = drawSome(stream("onsenThreeGreat"), pool.filter((t) => defs[t].rank === "threeGreat"), cfg.threeGreat);
  const hr = stream("onsenHidden");
  const hiddenPool = cands.filter((t) => defs[t].discovery === "hidden" && !forced.includes(t));
  const hidden = hiddenPool.length && hr.chance(cfg.hidden.chance) ? drawSome(hr, hiddenPool, { min: 1, max: cfg.hidden.max }) : [];
  const set = new Set([...normal, ...greater, ...threeGreat, ...hidden, ...forced]);
  const idx = (t: string) => (order.indexOf(t) < 0 ? order.length : order.indexOf(t));
  const all = [...set].sort((a, b) => idx(a) - idx(b) || (a < b ? -1 : a > b ? 1 : 0));
  return { normal, greater, threeGreat, hidden, forced, all };
}

/** 宿泊客が居たがる場所（将来の配置用。データの onsen.preferredArea。無ければ null） */
export function guestArea(type: string, defs: Readonly<Record<string, GuestDef>> = YOKAI): string | null {
  return defs[type]?.onsen?.preferredArea ?? null;
}
