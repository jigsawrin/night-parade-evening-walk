/**
 * LegendSystem：一夜の大妖怪・三大妖怪・隠し妖怪のまとめ役。
 *  - 今夜の候補（NightLegendRoster）を seed から選ぶ（WildYokai は候補に入った妖怪だけを町に置く）
 *  - 加入条件が読む今の百鬼夜行の様子（LegendContext）を低頻度で作り直す（顔ぶれは陰陽師の威光も読む）
 *  - 会った・加わったを縁帳（LegendProgress）に書き、すぐ保存する
 * 出現と加入は分かれている：町に姿（と気配）がある → 会いに行く → 求めを聞く（legendMeet）→ 条件を満たして認められる（legendJoin）。
 * Pacing・Encounter はここを通さない（暇つぶしに大妖怪を出さない。誘導の向け先にもしない：GuidanceRules）。
 * ※ node --test から直接読み込めるよう、Babylon・DOM を実行時に読まない。
 */
import type { Rng } from "../../core/seed";
import { loadLegendProgress, loadZukan, saveLegendProgress, type KV } from "../../core/SaveData";
import { SPECIAL_UNLOCKS } from "../../data/legendConfig";
import { YOKAI } from "../../data/yokaiTypes";
import type { GameBus } from "../events";
import { countTypes, legendMissing, type LegendContext } from "./LegendRules";
import { discoverHidden, discoveryTally, evaluateSpecialUnlocks, hiddenNoticeRadius, recordJoined, recordMet, type LegendProgress } from "./LegendProgress";
import { NightLegendRoster, defaultHiddenRules } from "./NightLegendRoster";
import { zukanCompletion } from "../ZukanRules";
import { savedNormalWave } from "../normal/NormalUnlockRules";

export interface LegendSystemDeps {
  bus: GameBus;
  seed: { stream(name: string): Rng };
  kv: KV | null;
  parade: { readonly total: number; readonly followers: readonly { actor: { typeId: string } }[] };
  /** 縁帳に書く日時（テストでは差し替える） */
  clock?: () => number;
  /** 主人公の位置（町に隠れている隠し妖怪に気づく） */
  player?: { readonly x: number; readonly z: number };
}

/** 町に隠れている隠し妖怪（WildYokai）：置いた場所と、姿を見せるただ一つの経路 */
export interface HiddenHost {
  hiddenAt(type: string): { x: number; z: number } | null;
  revealHidden(type: string, source: string): unknown;
}

/** 顔ぶれを数え直す間隔（秒） */
const RECOUNT = 0.5;

export class LegendSystem {
  readonly roster: NightLegendRoster;
  /** 縁帳（永続） */
  progress: LegendProgress;
  /** 今の行列の顔ぶれ（陰陽師の威光も読む） */
  readonly counts = new Map<string, number>();
  private encounters = new Map<string, number>();
  private districts: string[] = [];
  private ctx: LegendContext;
  private t = 0;
  private d: LegendSystemDeps;
  private clock: () => number;
  /** 今夜会った・加わった（一夜に一度だけ数える） */
  private metTonight = new Set<string>();
  readonly joinedTonight: string[] = [];
  private hiddenHost: HiddenHost | null = null;

  constructor(d: LegendSystemDeps) {
    this.d = d;
    this.clock = d.clock ?? Date.now;
    this.progress = loadLegendProgress(d.kv);
    // 隠し妖怪の候補は縁帳と図鑑を見る（温泉宿で初めて見つかる妖怪は見つけるまで町に出ない。通常妖怪を知り尽くしてから見つかる妖怪もいる：
    // 最後の wave まで開き、通常の枠をすべて埋めた。途中の wave での図鑑の完成では成り立たない）
    const zukan = loadZukan(d.kv);
    const allNormal = zukanCompletion(zukan, { met: this.progress.met, normalWave: savedNormalWave(d.kv, zukan) }).allNormalContentComplete;
    this.roster = new NightLegendRoster((n) => d.seed.stream(n), undefined, undefined, defaultHiddenRules(this.progress, undefined, allNormal));
    this.ctx = { counts: this.counts, total: 1, activities: 0, districtsAwakened: this.districts, encounters: this.encounters, momentumLevel: 0 };
    const { bus } = d;
    bus.on("activityComplete", () => this.ctx.activities++);
    bus.on("districtAwaken", (e) => {
      if (!this.districts.includes(e.id)) this.districts.push(e.id);
    });
    bus.on("encounterComplete", (e) => this.encounters.set(e.kind, (this.encounters.get(e.kind) ?? 0) + 1));
    bus.on("momentum", (e) => (this.ctx.momentumLevel = e.level));
    bus.on("legendMeet", (e) => {
      if (this.metTonight.has(e.type)) return;
      this.metTonight.add(e.type);
      if (recordMet(this.progress, e.type, this.clock())) saveLegendProgress(d.kv, this.progress);
    });
    // 隠し妖怪を見つけた（格は問わない。加入していなくても縁帳の met に残り、図鑑に枠が増える）
    bus.on("specialDiscovered", (e) => {
      this.metTonight.add(e.type);
      discoverHidden(this.progress, e.type, this.clock(), (p) => saveLegendProgress(d.kv, p));
    });
    bus.on("legendJoin", (e) => {
      if (this.joinedTonight.includes(e.type)) return;
      this.joinedTonight.push(e.type);
      recordJoined(this.progress, e.type, this.clock());
      saveLegendProgress(d.kv, this.progress);
    });
  }

  /** 加入条件が読む今の様子（顔ぶれ・総数は RECOUNT 秒ごと） */
  get context(): LegendContext {
    return this.ctx;
  }

  /** 町に隠れている隠し妖怪を見せる窓口（WildYokai を作った後に渡す） */
  bindHidden(host: HiddenHost) {
    this.hiddenHost = host;
  }

  /** 夜の間だけ呼ぶ */
  update(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = RECOUNT;
    countTypes(this.d.parade.followers.map((f) => f.actor), this.counts);
    this.ctx.total = this.d.parade.total;
    this.noticeHidden();
  }

  /**
   * 町に隠れている今夜の隠し妖怪に、すぐそばまで来たら気づく（姿を見せる：revealHidden）。
   * 案内はしない（気配・ヒント・「！」も無い）。気づくかどうかは、プレイヤーが寄り道してそこへ行くかだけ
   */
  private noticeHidden() {
    const host = this.hiddenHost, p = this.d.player;
    if (!host || !p) return;
    for (const id of this.roster.data.hidden) {
      const at = host.hiddenAt(id);
      if (at && Math.hypot(at.x - p.x, at.z - p.z) <= hiddenNoticeRadius(id)) host.revealHidden(id, "world");
    }
  }

  /** 見つけたことがあるか（縁帳の met） */
  discovered(type: string) {
    return this.progress.met.includes(type);
  }

  /** 今夜この妖怪が町にいるか（候補に入らなかった大妖怪・隠し妖怪は置かない） */
  appearsTonight(type: string) {
    return this.roster.appearsTonight(type);
  }

  /** ?debug 用：候補・各加入条件の進み・縁帳・温泉宿の解禁 */
  debugLines() {
    const d = this.roster.data;
    const cond = [...d.threeGreat, ...d.greater, ...d.hidden].map((id) => {
      const def = YOKAI[id];
      const r = def?.rule;
      const state = this.joinedTonight.includes(id) ? "加入" : this.metTonight.has(id) ? "会った" : "未";
      const miss = r?.kind === "legend" ? legendMissing(r, this.ctx) : [];
      return `${def?.name ?? id}[${state}] ${miss.length ? miss.join("・") : "条件〇"}`;
    });
    const p = this.progress;
    const nm = (l: string[]) => l.map((id) => YOKAI[id]?.name ?? id).join("・") || "-";
    const un = evaluateSpecialUnlocks(p);
    const h = discoveryTally(p);
    return [
      `${this.roster.debug()}　${cond.join("　")}`,
      `縁帳 会った ${nm(p.met)}　仲間 ${nm(p.joined)}　秘 ${h.hiddenMet}/${h.hiddenJoined}　温泉宿 ${SPECIAL_UNLOCKS.map((u) => `${u.name}${un[u.id] ? "〇" : "×"}`).join(" ")}`,
    ];
  }
}
