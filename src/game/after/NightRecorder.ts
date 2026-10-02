/**
 * NightRecorder：GameBus のイベントを聞いて、一夜の記録（NightMemoryLog・Encounter の種類ごとの成就数・目覚めた地区）を集める。
 * ゲームのルールには一切触れない（聞くだけ）。結果画面・絵巻・今夜の地図の材料になる。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import { districtAt } from "../../data/districts";
import type { GameBus } from "../events";
import { NightMemoryLog } from "./NightMemoryLog";
import { YOKAI } from "../../data/yokaiTypes";
import { routMemory } from "../onmyoji/OnmyojiRules";

export class NightRecorder {
  readonly log = new NightMemoryLog();
  readonly encountersByKind = new Map<string, number>();
  readonly districtsAwakened: string[] = [];
  readonly activitiesDone: string[] = [];
  private active = false;
  private now: () => number;

  /** now：夜が始まってからの秒数 */
  constructor(bus: GameBus, now: () => number) {
    this.now = now;
    const dn = (x: number, z: number) => districtAt(x, z)?.name;
    bus.on("join", (e) => {
      if (!this.active) return;
      this.log.join({ t: this.now(), type: e.type, total: e.total, x: e.x, z: e.z, district: dn(e.x, e.z), fromEvent: !!e.bonus });
    });
    bus.on("legendJoin", (e) => {
      if (!this.active || e.rank === "normal") return;
      const rec = { type: e.type, rank: e.rank, ...(e.discovery === "hidden" ? { discovery: "hidden" as const } : {}), t: this.now(), n: e.total, district: dn(e.x, e.z), x: e.x, z: e.z, conditions: [...e.conditions] };
      this.log.legend(rec, YOKAI[e.type]?.name ?? e.type);
    });
    bus.on("onmyojiRout", (e) => {
      if (this.active) this.log.onmyoji(this.now(), routMemory(e.reason), e.x, e.z);
    });
    bus.on("rejoin", (e) => {
      if (this.active && e.total > 0) this.log.reach(this.now(), e.total);
    });
    bus.on("districtAwaken", (e) => {
      if (!this.active) return;
      this.districtsAwakened.push(e.id);
      this.log.awaken(this.now(), e.name, e.x, e.z);
    });
    bus.on("miniParadeMerge", (e) => {
      if (this.active) this.log.merge(this.now(), e.n, e.x, e.z, dn(e.x, e.z));
    });
    bus.on("encounterComplete", (e) => {
      if (!this.active) return;
      this.encountersByKind.set(e.kind, (this.encountersByKind.get(e.kind) ?? 0) + 1);
      this.log.encounter(this.now(), e.kind, e.title, e.x, e.z, dn(e.x, e.z));
    });
    bus.on("activityComplete", (e) => {
      if (!this.active) return;
      this.activitiesDone.push(e.title);
      this.log.activity(this.now(), e.title, e.reward.type);
    });
    bus.on("layerUnlock", (e) => {
      if (this.active) this.log.layer(this.now(), e.title);
    });
  }

  start(x: number, z: number) {
    this.active = true;
    this.log.start(this.now(), x, z, districtAt(x, z)?.name);
  }

  /** 夜の間、毎フレーム呼んでよい（ルートは中で間引く） */
  track(x: number, z: number) {
    if (this.active) this.log.sample(this.now(), x, z);
  }

  end(reason: "shrine" | "dawn", x: number, z: number) {
    if (!this.active) return;
    this.log.end(this.now(), reason, x, z);
    this.active = false;
  }
}
