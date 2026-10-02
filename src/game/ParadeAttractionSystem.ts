import type { Rng } from "../core/seed";
import { LANDMARKS } from "../data/districts";
import { PRESENCE_TIERS } from "../data/presences";
import { FestivalMomentum } from "./FestivalMomentum";
import { nearestContent, pickContent, revealOmen, wildContent, type ContentFilter, type ContentPoint } from "./GuidanceRules";
import type { Activities } from "./Activities";
import type { DistrictAwakeningSystem } from "./DistrictAwakeningSystem";
import type { EncounterDirector } from "./EncounterDirector";
import type { GameBus } from "./events";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { WildYokai } from "./WildYokai";

export type { ContentPoint } from "./GuidanceRules";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * ParadeAttractionSystem：百鬼夜行が大きく賑やかになるほど、遠くの妖怪に存在を気付かせる。
 *
 * 人数と賑わいで変わるのは：
 *  - 妖怪を発見できる範囲（気付かれる半径）
 *  - 気配（音・光）が届く頻度
 *  - 隠れていた妖怪が姿を見せる条件（気配の段階）
 *  - 噂（Encounter 候補）が届く確率。ただし成長しても「常に何かある」状態にはしない：
 *    間（breathing room）・同時数は EncounterScheduler が守り、ここは低頻度でときどき求めるだけ。
 * 実際の加入には、必ずプレイヤーの移動・探索・攻略が要る（ここでは誰も加入させない）。
 * 判定はすべて低頻度（0.25〜1 秒ごと）。毎フレームの全探索はしない。
 */
export class ParadeAttractionSystem {
  momentum = new FestivalMomentum();
  /** 引き寄せる力 0..1 */
  level = 0;
  /** 気付かれる半径（歩） */
  radius = 28;
  tiers = new Set<string>();
  content: ContentPoint[] = [];
  /** 気配を出したとき（NightPacing へ） */
  onOmen: () => void = () => {};

  private observeT = 0;
  private slowT = 0;
  private omenT = 12;
  private dealT = 15;
  /** 直前に気配を出した方向（同じ方向ばかりにしない） */
  private lastOmenDir: number | null = null;
  private lastLevel = 0;
  private landmarkCd = new Map<string, number>();
  private lastMomentumSent = -1;
  peak = 0;

  constructor(
    private bus: GameBus,
    private parade: Parade,
    private player: Player,
    private wild: WildYokai,
    private encounters: EncounterDirector,
    private districts: DistrictAwakeningSystem,
    private activities: Activities,
    private rng: Rng,
  ) {}

  /**
   * @param active 最近プレイヤーが実際に動いている（放置中は街からの呼びかけを止める）
   */
  update(dt: number, t: number, active: boolean) {
    this.momentum.setParadeSize(this.parade.total);
    this.momentum.decay(dt, t);
    const px = this.player.x, pz = this.player.z;

    this.observeT -= dt;
    if (this.observeT <= 0) {
      this.observeT = 0.25;
      this.momentum.observe(t, px, pz, this.parade.count);
      this.checkLandmarks(t, px, pz);
    }

    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 1;
      this.refresh(px, pz);
    }

    if (!active) return;
    // 気配：大きく賑やかなほど遠くから届く。頻度はほどほどに（静けさを残す）
    this.omenT -= dt;
    if (this.omenT <= 0) {
      this.omenT = (20 - 6 * this.level) * this.rng.range(0.8, 1.25);
      // 噂が自分の音で呼んでいる間は、重ねて鳴らさない（煩くしない）
      if (this.parade.total >= 3 && !this.encounters.rumors.length) this.emitOmen(px, pz);
    }
    // 賑わいに引き寄せられて、ときどき噂が届く（間・同時数は EncounterScheduler が守る）
    this.dealT -= dt;
    if (this.dealT <= 0) {
      this.dealT = this.rng.range(12, 18);
      const total = this.parade.total;
      // 二つ目の枠は埋まりにくく（常に最大数を抱えるゲームにしない）
      const busy = this.encounters.active.length + this.encounters.rumors.length > 0;
      if (total >= 5 && this.rng.chance(0.05 + 0.3 * this.level) && (!busy || this.rng.chance(0.35))) this.encounters.request(t, "attraction");
    }
  }

  private refresh(px: number, pz: number) {
    const total = this.parade.total;
    const size = clamp01((total - 1) / 60);
    this.level = clamp01(0.6 * size + 0.4 * (this.momentum.value / 100));
    this.radius = 28 + 100 * this.level;
    this.peak = Math.max(this.peak, this.momentum.value);

    // 気配の段階
    for (const tier of PRESENCE_TIERS) {
      if (this.tiers.has(tier.id) || total < tier.minTotal) continue;
      this.tiers.add(tier.id);
      this.bus.emit("presenceTier", { id: tier.id, text: tier.text });
    }
    // 気付かれる範囲に入った、隠れていた妖怪が姿を見せる（加入はしない）
    if (this.tiers.size) {
      for (const w of this.wild.revealPresences(this.tiers, px, pz, this.radius)) {
        const a = w.actor!;
        const kind = revealOmen(w.type);
        if (kind && Math.hypot(a.x - px, a.z - pz) > 26) this.bus.emit("omen", { kind, x: a.x, y: 1.5, z: a.z, strength: 0.8 });
      }
    }

    const lvl = this.momentum.level;
    const v = Math.round(this.momentum.value);
    if (v !== this.lastMomentumSent || lvl !== this.lastLevel) {
      this.bus.emit("momentum", { v: this.momentum.value, level: lvl, name: this.momentum.levelName, up: lvl > this.lastLevel });
      this.lastMomentumSent = v;
      this.lastLevel = lvl;
    }
    this.rebuildContent(px, pz);
  }

  /** 未攻略のもの（気配・誘導の候補）を作り直す（1 秒ごとのキャッシュ） */
  private rebuildContent(px: number, pz: number) {
    const out: ContentPoint[] = [];
    this.wild.forEachContent((x, z, w) => {
      if (Math.abs(x - px) > 150 || Math.abs(z - pz) > 150) return;
      // 隠し妖怪は一覧に入れない（wildContent が null）。大妖怪は legend（Pacing・言霊は向けない）
      const c = wildContent(w, x, z);
      if (c) out.push(c);
    });
    for (const e of this.encounters.targets()) out.push({ x: e.x, z: e.z, omen: e.omen, w: e.rumor ? 2.5 : 3, source: e.rumor ? "rumor" : "encounter" });
    for (const d of this.districts.awakenable()) {
      const [gx, gz] = d.garland[Math.floor(d.garland.length / 2)];
      out.push({ x: gx, z: gz, omen: "hayashi", w: 2, source: "district" });
    }
    const count = this.parade.count;
    for (const s of this.activities.states) {
      if (s.done || count < s.def.minFollowers) continue;
      const d = s.def;
      const [x, z] = d.kind === "passage" ? d.entry : [d.x, d.z];
      out.push({ x, z, omen: "taiko", w: 1.5, source: "activity" });
    }
    this.content = out;
  }

  private emitOmen(px: number, pz: number) {
    const c = this.pickContent(px, pz, 24, this.radius);
    if (!c) return;
    this.bus.emit("omen", { kind: c.omen, x: c.x, y: c.omen === "shadow" ? 5 : 1.8, z: c.z, strength: 0.7 + 0.3 * this.level, source: "attraction" });
    this.onOmen();
  }

  /**
   * 気配・誘導の向け先を選ぶ（GuidanceRules.pickContent）。f.allowed / excluded で絞り、prefer で重みを変える。
   * 隠し妖怪はどの選び方でも選ばれない。
   */
  pickContent(px: number, pz: number, near: number, far: number, f: ContentFilter = {}): ContentPoint | null {
    const c = pickContent(this.content, px, pz, near, far, this.rng, f, this.lastOmenDir);
    if (c) this.lastOmenDir = Math.atan2(c.x - px, c.z - pz);
    return c;
  }

  /** 最寄りの未攻略のもの（言霊の向け先・近くに何かあるかの判定）。near より近いものは除く */
  nearestContent(px: number, pz: number, near = 18, f: ContentFilter = {}): ContentPoint | null {
    return nearestContent(this.content, px, pz, near, f);
  }

  /** 百鬼夜行でランドマークを通過 */
  private checkLandmarks(t: number, px: number, pz: number) {
    if (this.parade.count < 6) return;
    for (const l of LANDMARKS) {
      if (Math.hypot(px - l.x, pz - l.z) > l.r) continue;
      const cd = this.landmarkCd.get(l.id) ?? -999;
      if (t - cd < 90) continue;
      this.landmarkCd.set(l.id, t);
      this.momentum.gain("landmark", t, 1 + Math.min(1, this.parade.count / 30));
      this.bus.emit("landmark", { id: l.id, name: l.name, x: l.x, z: l.z });
    }
  }

  debug() {
    const m = this.momentum;
    return `賑わい ${m.value.toFixed(1)}（${m.levelName}・${m.lastReason}） 引力 ${this.level.toFixed(2)} 半径 ${Math.round(this.radius)} 探索マス ${m.cellsVisited} 気配段階 ${[...this.tiers].join(",") || "-"} 候補 ${this.content.length}`;
  }
}
