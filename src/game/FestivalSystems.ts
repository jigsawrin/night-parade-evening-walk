import type { NightSeed, Rng } from "../core/seed";
import type { ModelFactory } from "../characters/ModelFactory";
import type { World } from "../world/World";
import { ACTIVITIES } from "../data/activities";
import { stageIndex, type StageDef } from "../data/stages";
import { evaluateTitles, type NightRecordData } from "../data/titles";
import { ParadeAttractionSystem } from "./ParadeAttractionSystem";
import { KOTODAMA_FILTER, PACING_FILTER, type ContentPoint } from "./GuidanceRules";
import { NightPacingDirector, type PacingAction } from "./NightPacingDirector";
import { EncounterDirector } from "./EncounterDirector";
import { DistrictAwakeningSystem } from "./DistrictAwakeningSystem";
import { NightRhythm } from "./NightRhythm";
import { NightMetrics } from "./NightMetrics";
import type { Activities } from "./Activities";
import type { GameBus } from "./events";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { WildYokai } from "./WildYokai";

export interface FestivalDeps {
  bus: GameBus;
  factory: ModelFactory;
  world: World;
  parade: Parade;
  player: Player;
  wild: WildYokai;
  activities: Activities;
  typeCounts: ReadonlyMap<string, number>;
  seed: NightSeed;
}

/**
 * v0.2「行列が育つほど、夜の街がこちらに応えてくる」のゲームルール一式。
 *  ParadeAttractionSystem（賑わい・気配）/ NightPacingDirector / EncounterDirector / DistrictAwakeningSystem
 * をまとめて Game から一行で動かす。ゲームルールは GameBus にイベントを流すだけで、演出には直接触れない。
 *
 * v0.2.1「退屈はなくす。しかし、夜の余白はなくさない」
 *  - Pacing は「次の仕事」を作らない：既にあるものの気配 → 音・光で方向 → 新しい噂 → 最終手段 の順
 *  - NightRhythm：静 → 気になる → 向かう → 祭り → 余韻 の波を読む（演出・計測用）
 *  - NightMetrics：?debug で一夜の終わりに、Encounter 数・静寂の長さ等を console へ
 */
export class FestivalSystems {
  readonly attraction: ParadeAttractionSystem;
  readonly pacing = new NightPacingDirector();
  readonly encounters: EncounterDirector;
  readonly districts: DistrictAwakeningSystem;
  readonly rhythm = new NightRhythm();
  readonly metrics = new NightMetrics();
  private t = 0;
  private slowT = 0;
  private activeT = 0;
  private scatters = 0;
  private purges = 0;
  private routed = false;
  private lastAction: PacingAction | "" = "";
  /** 言霊を出すまでの溜め（序盤、近くに何もないとき） */
  private wispT = 0;
  /** 次の言霊に要る溜め（初回は早め、以降は長め） */
  private wispNeed: number;
  private wispCount = 0;
  private wispRng: Rng;
  private d: FestivalDeps;

  constructor(d: FestivalDeps) {
    this.d = d;
    this.districts = new DistrictAwakeningSystem(d.bus, d.parade, d.player, d.wild);
    this.encounters = new EncounterDirector(
      { factory: d.factory, world: d.world, bus: d.bus, parade: d.parade, player: d.player, wild: d.wild, typeCounts: d.typeCounts },
      d.seed,
      this.districts,
    );
    this.attraction = new ParadeAttractionSystem(d.bus, d.parade, d.player, d.wild, this.encounters, this.districts, d.activities, d.seed.stream("attraction"));
    this.attraction.onOmen = () => this.pacing.notifyOmen();
    this.wispRng = d.seed.stream("kotodama");
    this.wispNeed = this.wispRng.range(8, 12);
    this.wire();
  }

  get momentum() {
    return this.attraction.momentum;
  }

  /** ゲームルール側のイベント → 賑わい・Pacing・夜の波・計測 */
  private wire() {
    const { bus, player } = this.d;
    const m = () => this.attraction.momentum;
    const mt = this.metrics;
    bus.on("join", (e) => {
      m().gain(e.bonus ? "bonusJoin" : "join", this.t);
      this.pacing.notifyJoin();
      mt.stim();
    });
    bus.on("activityComplete", () => {
      m().gain("activity", this.t);
      this.pacing.notifyEvent();
      this.rhythm.festival();
      mt.stim();
    });
    bus.on("layerUnlock", () => {
      m().gain("layer", this.t);
      this.pacing.notifyEvent();
      this.rhythm.festival();
      mt.stim();
    });
    bus.on("encounterStart", (e) => {
      this.pacing.notifyEvent();
      mt.encounterStart(e.kind);
    });
    bus.on("encounterProgress", (e) => {
      if (e.p >= 0) mt.stim();
    });
    bus.on("encounterComplete", (e) => {
      m().gain(e.kind === "miniParade" ? "merge" : "encounter", this.t);
      this.pacing.notifyEvent();
      this.rhythm.festival();
      mt.encounterCompletes++;
      mt.stim();
    });
    bus.on("miniParadeMerge", () => {
      this.rhythm.festival(10);
      mt.miniMerges++;
      mt.stim();
    });
    bus.on("districtAwaken", (e) => {
      m().gain("awaken", this.t);
      this.pacing.notifyEvent();
      this.rhythm.festival(12);
      mt.awakenings++;
      mt.stim();
      // 覚醒そのものが大きな出来事：長めの間をとり、その後その地区らしい出来事が噂になりやすくなる
      this.encounters.onAwaken(this.t, e.id);
    });
    bus.on("onmyojiRout", () => {
      m().gain("rout", this.t);
      this.pacing.notifyEvent();
      this.rhythm.festival();
      this.routed = true;
      mt.stim();
    });
    bus.on("onmyojiPurge", (e) => {
      if (e.n > 0) this.purges++;
    });
    bus.on("districtEnter", (e) => {
      if (e.first) m().gain("newDistrict", this.t);
      else if (e.gap > 120) m().gain("revisitDistrict", this.t);
    });
    bus.on("reveal", (e) => {
      // 目に入る距離で何かが姿を見せたら「発見」
      if (Math.hypot(e.x - player.x, e.z - player.z) < 45) this.pacing.notifyDiscover();
    });
    bus.on("rumor", (e) => {
      // 噂は「気配」：Pacing の気配段階を済ませたことにする
      this.pacing.notifyOmen();
      this.rhythm.curious();
      mt.rumors++;
      if (e.choice && e.delay === 0) mt.choiceMoments++;
      mt.stim();
    });
    bus.on("omen", (e) => {
      if (!e.source) return;
      this.rhythm.curious();
      mt.omens++;
      mt.stim();
    });
    bus.on("guide", () => {
      this.rhythm.curious();
      mt.guides++;
      mt.stim();
    });
    bus.on("kotodama", () => {
      this.rhythm.curious();
      mt.kotodama++;
      mt.stim();
    });
    bus.on("scatter", () => this.scatters++);
  }

  /**
   * @param moving プレイヤーが実際に歩いている
   * @param stage 現在の夜行位
   */
  update(dt: number, t: number, moving: boolean, stage: StageDef) {
    this.t = t;
    this.activeT = moving ? 0 : this.activeT + dt;
    const active = this.activeT < 12;
    this.attraction.update(dt, t, active);
    this.encounters.update(dt, t);

    this.slowT -= dt;
    if (this.slowT > 0) return;
    const step = 0.25 - this.slowT;
    this.slowT = 0.25;
    this.districts.update(t);
    // 何かのそばにいるなら「見つけている」
    const p = this.d.player;
    const near = this.attraction.nearestContent(p.x, p.z, 0);
    const nearD = near ? Math.hypot(near.x - p.x, near.z - p.z) : Infinity;
    if (nearD < 12) this.pacing.notifyDiscover();
    const exploring = this.attraction.momentum.recentExploration(t, 20) >= 2;
    this.updateKotodama(step, moving, nearD, exploring);
    const action = this.pacing.update(step, { moving, exploring, stageIndex: stageIndex(stage.stage) });
    if (action) this.act(action, t);

    // 夜の波・計測
    const enc = this.encounters;
    const phase = this.rhythm.update(step, {
      breathing: enc.breathing(t),
      active: enc.active.length,
      rumors: enc.rumors.length,
      heading: this.heading(),
    });
    if (phase) this.d.bus.emit("rhythm", { phase });
    const hasCandidate = enc.active.length > 0 || enc.rumors.length > 0 || nearD < this.attraction.radius;
    this.metrics.tick(step, { total: this.d.parade.total, hasCandidate });
  }

  /** 噂・Encounter の方へ向かって歩いているか */
  private heading() {
    const p = this.d.player;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp < 1) return false;
    return this.encounters.targets().some((e) => {
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return (dx * p.vx + dz * p.vz) / (d * sp) > 0.7;
    });
  }

  /**
   * 言霊：序盤（特に独り歩き）で近くに何もないとき、光の玉が近くの妖怪の方へ泳いでいく。
   * 迷子防止であってナビではない：初回だけ早め（8〜12 秒）、以降は 15〜25 秒以上あける。
   * 新しい場所へ向かって歩いている（探索中）なら、さらに出にくい。妖怪は動かないし加入もしない。
   */
  private updateKotodama(step: number, moving: boolean, nearD: number, exploring: boolean) {
    const total = this.d.parade.total;
    if (total >= 15) return;
    if (nearD < 14) {
      this.wispT = Math.min(this.wispT, 0);
      return;
    }
    this.wispT += step * (moving ? (exploring && this.wispCount > 0 ? 0.5 : 1) : 0.6);
    if (this.wispT < this.wispNeed) return;
    const p = this.d.player;
    const tgt = this.attraction.nearestContent(p.x, p.z, 14, KOTODAMA_FILTER);
    if (!tgt) {
      this.wispT = this.wispNeed - 3;
      return;
    }
    this.d.bus.emit("kotodama", { fromX: p.x, fromZ: p.z, toX: tgt.x, toZ: tgt.z });
    this.wispCount++;
    this.wispT = 0;
    this.wispNeed = this.wispRng.range(15, 25);
  }

  /**
   * NightPacing：迷子になりそうなときに、世界へ小さな引っ掛かりを作る。報酬（妖怪）は与えない。
   * 優先順位：1 既にあるものの気配を再提示 → 2 音・光で方向を匂わせる → 3 新しい噂 → 4 最終手段で噂を本物に。
   * すぐ新しいコンテンツは作らない。向け先は最寄りの一つに固定しない。
   */
  private act(action: PacingAction, t: number) {
    const { player } = this.d;
    const enc = this.encounters;
    this.lastAction = action;
    const far = Math.max(90, this.attraction.radius);
    // 向け先は出来事・地区・遊びだけ（妖怪・大妖怪・隠し妖怪へは誘導しない。GuidanceRules.PACING_FILTER）
    const pick = () => this.attraction.pickContent(player.x, player.z, 22, far, PACING_FILTER);
    if (action === "omen") {
      // 1. 既にある妖怪・Activity・地区・Encounter・噂の気配を、もう一度だけ
      const c = pick();
      if (c) this.omenAt(c);
      return;
    }
    if (action === "guide") {
      // 2. 狐火で、大まかな方向だけ
      const c = pick();
      if (c) this.guideTo(c);
      return;
    }
    // 3. それでも何もなければ新しい噂。間の最中・枠が埋まっているなら、既にある気配を再提示するだけ
    if (action === "encounter" || !enc.rumors.length) {
      if (enc.request(t, "pacing", { preferUnvisited: true }).length) return;
      const c = pick();
      if (!c) return;
      if (action === "encounter") this.omenAt(c);
      else this.guideTo(c);
      return;
    }
    // 4. 最終手段：噂が出たまま長く迷っている → いちばん近い噂を本物の Encounter に（その光・音で導く）
    if (enc.forcePromote(t)) return;
    const c = pick();
    if (c) this.guideTo(c);
  }

  private omenAt(c: ContentPoint) {
    this.d.bus.emit("omen", { kind: c.omen, x: c.x, y: c.omen === "shadow" ? 5 : 1.8, z: c.z, strength: 1, source: "pacing" });
  }

  private guideTo(c: ContentPoint) {
    this.d.bus.emit("guide", { points: this.guidePoints(c.x, c.z) });
  }

  /** プレイヤーの少し先から、向け先の方向へ狐火を置く */
  private guidePoints(tx: number, tz: number) {
    const p = this.d.player;
    const dx = tx - p.x, dz = tz - p.z;
    const L = Math.hypot(dx, dz) || 1;
    const out: { x: number; z: number }[] = [];
    for (let d = 9; d < Math.min(L - 3, 46); d += 8) {
      out.push(this.d.world.nearestWalkable(p.x + (dx / L) * d, p.z + (dz / L) * d));
    }
    if (!out.length) out.push({ x: tx, z: tz });
    return out;
  }

  /** デバッグ：強制的に Encounter を出す */
  debugDeal() {
    return this.encounters.debugDeal(this.t);
  }
  debugGuide() {
    this.act("guide", this.t);
  }
  debugKotodama() {
    this.wispT = 99;
  }

  /** 一夜の計測（?debug で console へ） */
  metricsReport() {
    return this.metrics.report(this.d.parade.total);
  }

  /** 夜の記録（結果画面の称号） */
  record(time: number, nightLength: number, reason: "shrine" | "dawn"): NightRecordData {
    return {
      total: this.d.parade.total,
      types: this.d.typeCounts,
      scatters: this.scatters,
      activitiesDone: this.d.activities.completed.length,
      activitiesTotal: ACTIVITIES.length,
      districtsAwakened: this.districts.awakenedCount,
      miniMerged: this.encounters.miniMerged,
      encountersDone: this.encounters.completed,
      cellsVisited: this.attraction.momentum.cellsVisited,
      time,
      nightLength,
      reason,
      peakMomentum: this.attraction.peak,
      onmyojiRouted: this.routed,
      purges: this.purges,
    };
  }
  titles(time: number, nightLength: number, reason: "shrine" | "dawn") {
    return evaluateTitles(this.record(time, nightLength, reason), 3);
  }

  debugLines(seed: number) {
    const pc = this.pacing;
    const t = pc.t;
    return [
      `seed ${seed}　波：${this.rhythm.phase}　Pacing：静 ${pc.quiet.toFixed(1)}s 段 ${pc.step} 放置 ${pc.idle.toFixed(0)}s 直近 ${this.lastAction || "-"}`,
      `最終加入 ${(t - pc.lastJoinT).toFixed(0)}s前　最終発見 ${(t - pc.lastDiscoverT).toFixed(0)}s前　最終イベント ${(t - pc.lastEventT).toFixed(0)}s前`,
      this.attraction.debug(),
      ...this.encounters.debug(this.t),
      `地区：${this.districts.debug()}`,
    ];
  }
}
