/**
 * EncounterScheduler：「いつ・何を・いくつ」場に出すかを決める（Encounter の中身は EncounterDirector）。
 *
 * v0.2.1「退屈はなくす。しかし、夜の余白はなくさない」
 *  - Breathing room：Encounter が始まった直後・終わった直後・地区覚醒の直後は、しばらく新しいものを出さない。
 *  - 同時数：序盤 1、20 妖〜は最大 2。3 つ同時は特殊な夜（festivalNight：辻の大祭など、将来）だけ。
 *  - 噂（Rumor / Encounter 候補）：いきなり Encounter を置かず、まず遠くの音・光だけを世界に出す。
 *    プレイヤーがどれかへ近づくと本物の Encounter に昇格し、同じ組の他の噂は山札へ戻る（後で再登場しうる）。
 *    ときどき 2 方向から別々の噂が届く（Choice Moment / 分かれ道）。
 *  - 選択の偏り：追った噂の系統が少しだけ引かれやすくなり、成就した Encounter の顔ぶれが今夜の行列に寄る。
 *  - Mini Parade は珍しく：前回から数分あける。賑やかな行列（grand）はさらに珍しい。
 *
 * 報酬（妖怪）は一切与えない。昇格しても、加入には各 Encounter の「軽い攻略」が要る。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import type { Rng } from "../core/seed";
import { ENCOUNTER_SITES, MINI_PARADE_ROUTES, type EncounterDef, type EncounterKind, type EncounterSite, type MiniParadeRoute, type OmenKind } from "../data/encounters";
import { EventDeck, pickSite } from "./EventDeck";

export type DealReason = "attraction" | "pacing" | "awaken" | "debug";

/** 新しい Encounter を出さない「間」（秒）。seed の乱数で軽く揺らす */
export const BREATH = {
  /** 普通の Encounter が始まった／終わった直後 */
  normal: [14, 22],
  /** Mini Parade などの大きな Encounter の後 */
  big: [18, 28],
  /** 地区覚醒の直後（覚醒そのものが大イベント） */
  awaken: [26, 36],
  /** 気配が薄れて終わった（expired）後 */
  expired: [9, 14],
  /** 噂が誰にも追われず消えた後 */
  faded: [6, 10],
} as const satisfies Record<string, readonly [number, number]>;

/** Mini Parade と次の Mini Parade の間（秒） */
export const MINI_GAP: readonly [number, number] = [170, 260];

/** 噂が本物の Encounter へ昇格する距離（ここまで自分で近づく） */
export function promoteRadius(kind: EncounterKind) {
  if (kind === "miniParade") return 70;
  if (kind === "foxfireTrail") return 60;
  return 38;
}

/** 同時に場に出せる数（噂の組も一枠と数える） */
export function maxActiveFor(total: number, festivalNight = false) {
  const base = total < 20 ? 1 : 2;
  return festivalNight ? base + 1 : base;
}

/** 分かれ道（2 方向から別々の噂）になる確率 */
export function choiceChance(total: number) {
  if (total < 20) return 0;
  if (total < 50) return 0.3;
  return 0.55;
}

export interface Placement {
  site: EncounterSite | null;
  route: MiniParadeRoute | null;
  x: number;
  z: number;
}

/** 噂（Encounter 候補）。遠くの音・光だけで、まだ何も置かれていない */
export interface Rumor extends Placement {
  id: number;
  /** 同じ組の噂のうち、昇格するのは一つだけ */
  group: number;
  def: EncounterDef;
  omen: OmenKind;
  bornT: number;
  life: number;
  nextOmenT: number;
  promoteR: number;
}

/** 世界の今の様子（EncounterDirector が渡す） */
export interface SchedulerView {
  t: number;
  px: number;
  pz: number;
  /** 進行方向（単位ベクトル。止まっていれば 0,0） */
  fx: number;
  fz: number;
  total: number;
  /** 場に出ている Encounter の種類 */
  activeKinds: readonly EncounterKind[];
  /** 使用中の場所 id（route:xxx を含む） */
  busy: ReadonlySet<string>;
  districtOf: (x: number, z: number) => string | null;
  districtVisit: (id: string) => number | undefined;
}

export interface OfferOptions {
  preferUnvisited?: boolean;
  district?: string;
}

export interface Promotion {
  rumor: Rumor;
  /** 同じ組で選ばれなかった噂（山札へ戻った） */
  dropped: Rumor[];
  /** 最終手段（Pacing が迷子を救うため）で昇格した */
  forced: boolean;
}

export interface SchedulerTick {
  /** 今、気配（音・光）を出す噂 */
  omens: Rumor[];
  promoted: Promotion | null;
  /** 誰にも追われず消えた噂 */
  faded: Rumor[];
}

export class EncounterScheduler {
  readonly deck: EventDeck;
  rumors: Rumor[] = [];
  /** この時刻までは新しい Encounter・噂を出さない */
  breathUntil = 0;
  lastDealT = -999;
  lastMiniT = -Infinity;
  miniCount = 0;
  grandCount = 0;
  /** 分かれ道が生まれた回数 */
  choiceMoments = 0;
  /** 将来の特殊な夜（辻の大祭・複数の行列が集まる夜）だけ 3 つ同時を許す */
  festivalNight = false;
  /** 追った噂の系統 → 回数（その系統が少し引かれやすくなる） */
  readonly kindAffinity = new Map<EncounterKind, number>();
  /** 成就した Encounter の顔ぶれ → 偏り（composeGroup の bias） */
  readonly typeBias = new Map<string, number>();
  /** 覚醒した地区：しばらく、その地区の出来事が噂になりやすい */
  favorDistrict: { id: string; until: number } | null = null;
  private rng: Rng;
  private nextId = 1;
  private nextGroup = 1;
  private miniGap: number;
  private recentSites: string[] = [];

  constructor(deck: EventDeck, rng: Rng) {
    this.deck = deck;
    this.rng = rng;
    this.miniGap = rng.range(MINI_GAP[0], MINI_GAP[1]);
  }

  maxActive(total: number) {
    return maxActiveFor(total, this.festivalNight);
  }

  breathing(t: number) {
    return t < this.breathUntil;
  }

  /** 場の枠のうち使っている数（噂の組は一枠） */
  occupied(activeCount: number) {
    return activeCount + (this.rumors.length ? 1 : 0);
  }

  /** 新しい噂を出せるか（debug は常に可） */
  canOffer(t: number, total: number, activeCount: number, reason: DealReason) {
    if (reason === "debug") return true;
    if (this.breathing(t) || this.rumors.length) return false;
    return this.occupied(activeCount) < this.maxActive(total);
  }

  /** このカードを今出してよいか（人数・同じ種類・Mini Parade の間隔） */
  eligible(d: EncounterDef, total: number, activeKinds: readonly EncounterKind[], t: number) {
    if (d.minTotal > total) return false;
    if (activeKinds.includes(d.kind)) return false;
    if (d.kind === "miniParade") {
      const grand = d.id.includes("grand");
      if (grand && this.miniCount < 1) return false;
      if (t - this.lastMiniT < this.miniGap * (grand ? 1.3 : 1)) return false;
    }
    return true;
  }

  /** 引く重み：追ってきた系統ほど少し重い（極端にはしない） */
  cardWeight(d: EncounterDef) {
    return 1 + Math.min(1.2, 0.35 * (this.kindAffinity.get(d.kind) ?? 0));
  }

  /**
   * 噂を出す（1 つ、ときどき 2 方向から）。出せなければ空。
   * reason === "debug" は間・枠を無視する。
   */
  offer(v: SchedulerView, reason: DealReason, opt: OfferOptions = {}): Rumor[] {
    if (!this.canOffer(v.t, v.total, v.activeKinds.length, reason)) return [];
    const district = opt.district ?? (this.favorDistrict && v.t < this.favorDistrict.until ? this.favorDistrict.id : undefined);
    const want = this.rng.chance(choiceChance(v.total)) ? 2 : 1;
    const group = this.nextGroup++;
    const out: Rumor[] = [];
    const kinds = [...v.activeKinds];
    for (let i = 0; i < want; i++) {
      const placed = new Map<EncounterDef, Placement>();
      const card = this.deck.drawWeighted((d) => {
        if (!this.eligible(d, v.total, kinds, v.t)) return false;
        const p = this.place(d, v, reason, { ...opt, district }, out);
        if (!p) return false;
        placed.set(d, p);
        return true;
      }, (d) => this.cardWeight(d));
      if (!card) break;
      const p = placed.get(card)!;
      kinds.push(card.kind);
      out.push({
        ...p, id: this.nextId++, group, def: card, omen: card.announce,
        bornT: v.t, life: this.rng.range(100, 140),
        // 分かれ道では、二つ目の気配は少し遅れて別の方向から届く
        nextOmenT: v.t + 0.5 + i * 4.5,
        promoteR: promoteRadius(card.kind),
      });
    }
    if (!out.length) return [];
    if (out.length > 1) this.choiceMoments++;
    for (const r of out) this.remember(r);
    this.rumors.push(...out);
    return out;
  }

  /**
   * 今すぐ本物の Encounter を出す場所とカードを決める（デバッグ用）。
   * 通常プレイでは噂 → 昇格を経る。
   */
  dealNow(v: SchedulerView, opt: OfferOptions = {}): { def: EncounterDef; place: Placement } | null {
    const placed = new Map<EncounterDef, Placement>();
    const card = this.deck.drawWeighted((d) => {
      if (!this.eligible(d, v.total, v.activeKinds, v.t)) return false;
      const p = this.place(d, v, "debug", opt, []);
      if (p) placed.set(d, p);
      return !!p;
    }, (d) => this.cardWeight(d));
    if (!card) return null;
    const place = placed.get(card)!;
    this.remember(place);
    return { def: card, place };
  }

  /** 低頻度（0.25〜0.5 秒ごと）で呼ぶ。噂の気配・昇格・消滅 */
  update(v: SchedulerView): SchedulerTick {
    const res: SchedulerTick = { omens: [], promoted: null, faded: [] };
    if (!this.rumors.length) return res;
    // 誰にも追われなかった噂は薄れて消え、札は山札へ戻る
    for (let i = this.rumors.length - 1; i >= 0; i--) {
      const r = this.rumors[i];
      if (v.t - r.bornT < r.life) continue;
      this.rumors.splice(i, 1);
      this.deck.putBack(r.def);
      res.faded.push(r);
    }
    if (res.faded.length && !this.rumors.length) this.breathe(v.t, BREATH.faded);
    // 自分で近づいた噂が、本物の Encounter になる
    let best: Rumor | null = null;
    let bd = Infinity;
    for (const r of this.rumors) {
      const d = Math.hypot(r.x - v.px, r.z - v.pz);
      if (d < r.promoteR && d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best) {
      res.promoted = this.promote(best, false);
      return res;
    }
    for (const r of this.rumors) {
      if (v.t < r.nextOmenT) continue;
      r.nextOmenT = v.t + this.rng.range(10, 15);
      res.omens.push(r);
    }
    return res;
  }

  /** 最終手段：長く迷っているとき、いちばん近い噂を本物にする（その Encounter 自身の光・音で導く） */
  forcePromote(v: SchedulerView, minAge = 40): Promotion | null {
    let best: Rumor | null = null;
    let bd = Infinity;
    for (const r of this.rumors) {
      if (v.t - r.bornT < minAge) continue;
      const d = Math.hypot(r.x - v.px, r.z - v.pz);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best ? this.promote(best, true) : null;
  }

  private promote(r: Rumor, forced: boolean): Promotion {
    const dropped = this.rumors.filter((x) => x.group === r.group && x !== r);
    this.rumors = this.rumors.filter((x) => x.group !== r.group);
    for (const d of dropped) this.deck.putBack(d.def);
    // 自分で選んで向かった系統は、今夜少しだけ寄ってきやすくなる
    if (!forced) this.kindAffinity.set(r.def.kind, (this.kindAffinity.get(r.def.kind) ?? 0) + 1);
    return { rumor: r, dropped, forced };
  }

  /** Encounter が始まった */
  onStart(t: number, d: EncounterDef) {
    this.lastDealT = t;
    const big = d.kind === "miniParade";
    this.breathe(t, big ? BREATH.big : BREATH.normal);
    if (big) {
      this.lastMiniT = t;
      this.miniCount++;
      if (d.id.includes("grand")) this.grandCount++;
      this.miniGap = this.rng.range(MINI_GAP[0], MINI_GAP[1]);
    }
  }

  /** Encounter が終わった（成就 / 薄れた） */
  onSettled(t: number, d: EncounterDef, st: "complete" | "expired") {
    if (st === "expired") {
      this.breathe(t, BREATH.expired);
      return;
    }
    this.breathe(t, d.kind === "miniParade" ? BREATH.big : BREATH.normal);
    // 成就した Encounter の顔ぶれが、今夜の行列の個性として少し残る
    const top = Math.max(...Object.values(d.members));
    for (const [type, w] of Object.entries(d.members)) this.typeBias.set(type, (this.typeBias.get(type) ?? 0) + w / top);
  }

  /** 地区が目覚めた。覚醒そのものが大きな出来事なので長めに間をとり、その後その地区の出来事を噂にしやすくする */
  onAwaken(t: number, id: string) {
    this.breathe(t, BREATH.awaken);
    this.favorDistrict = { id, until: this.breathUntil + 120 };
  }

  private breathe(t: number, [a, b]: readonly [number, number]) {
    this.breathUntil = Math.max(this.breathUntil, t + this.rng.range(a, b));
  }

  private remember(p: Placement) {
    const id = p.site ? p.site.id : `route:${p.route!.id}`;
    this.recentSites.push(id);
    if (this.recentSites.length > 5) this.recentSites.shift();
  }

  /** 場所を決める。siblings と同じ方向（70° 以内）は避ける（分かれ道は別々の方向から） */
  private place(d: EncounterDef, v: SchedulerView, reason: DealReason, opt: OfferOptions, siblings: readonly Placement[]): Placement | null {
    const R = promoteRadius(d.kind);
    const apart = (x: number, z: number) => siblings.every((s) => {
      const a = Math.atan2(x - v.px, z - v.pz) - Math.atan2(s.x - v.px, s.z - v.pz);
      return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > (70 * Math.PI) / 180;
    });
    if (d.kind === "miniParade") {
      const busy = new Set([...v.busy, ...this.rumors.map((r) => (r.route ? `route:${r.route.id}` : ""))]);
      const cand = MINI_PARADE_ROUTES.filter((r) => {
        if (busy.has(`route:${r.id}`)) return false;
        const [sx, sz] = r.points[0];
        const dd = Math.hypot(sx - v.px, sz - v.pz);
        return dd > (reason === "debug" ? 40 : R + 10) && dd < 170 && apart(sx, sz);
      });
      const route = this.rng.weighted(cand, (r) => {
        const [sx, sz] = r.points[0];
        const dist = v.districtOf(sx, sz);
        let w = 1;
        if (opt.district && dist === opt.district) w *= 4;
        if (opt.preferUnvisited && dist && v.districtVisit(dist) === undefined) w *= 3;
        return w;
      });
      return route ? { site: null, route, x: route.points[0][0], z: route.points[0][1] } : null;
    }
    const used = new Set([...this.recentSites, ...v.busy, ...this.rumors.map((r) => r.site?.id ?? "")]);
    const tries = siblings.length ? 3 : 1;
    for (let k = 0; k < tries; k++) {
      const site = pickSite(ENCOUNTER_SITES, d.siteTags, {
        px: v.px, pz: v.pz, fx: v.fx, fz: v.fz,
        minD: reason === "debug" ? 32 : R + 14,
        maxD: reason === "pacing" ? 120 : 135,
        used,
        districtOf: v.districtOf,
        districtVisit: v.districtVisit,
        now: v.t,
        preferUnvisited: !!opt.preferUnvisited,
        district: opt.district,
      }, this.rng);
      if (!site) return null;
      if (apart(site.x, site.z)) return { site, route: null, x: site.x, z: site.z };
      used.add(site.id);
    }
    return null;
  }

  debug(t: number) {
    const br = Math.max(0, this.breathUntil - t);
    const rum = this.rumors.map((r) => `${r.def.id}#${r.group}(${Math.round(t - r.bornT)}s)`).join(",") || "-";
    const aff = [...this.kindAffinity].map(([k, n]) => `${k}${n}`).join(",") || "-";
    return `間 ${br.toFixed(0)}s 噂 ${rum} 分かれ道 ${this.choiceMoments} 行列 ${this.miniCount}(${this.grandCount}) 偏り ${aff}`;
  }
}
