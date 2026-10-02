/**
 * Event Deck：一夜ぶんの Encounter の山札と、場所・顔ぶれの抽選。
 * 同じ seed なら同じ山札の順番・同じ顔ぶれの傾向になる（初期条件）。
 * いつ・どこで出るか、どの札が選ばれるかはプレイヤーの選択（どの気配を追ったか）で変わる。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import type { Rng } from "../core/seed";
import type { EncounterDef, EncounterSite } from "../data/encounters";

export class EventDeck {
  private cards: EncounterDef[] = [];
  private discard: EncounterDef[] = [];
  private rng: Rng;

  constructor(defs: readonly EncounterDef[], rng: Rng) {
    this.rng = rng;
    for (const d of defs) {
      if (!rng.chance(d.chance)) continue;
      for (let i = 0; i < d.copies; i++) this.cards.push(d);
    }
    rng.shuffle(this.cards);
  }

  get size() {
    return this.cards.length;
  }
  /** 今夜の山札に入っている id（重複なし・デバッグ／テスト用） */
  get ids() {
    return [...new Set([...this.cards, ...this.discard].map((c) => c.id))];
  }
  peek(n = 3) {
    return this.cards.slice(0, n).map((c) => c.id);
  }

  /**
   * 条件に合う先頭のカードを引く（山札の順番 = seed）。合うものが無ければ null。
   * 山札が尽きたら捨て札を切り直す（長い夜でもイベントが枯れない）。
   */
  draw(ok: (d: EncounterDef) => boolean): EncounterDef | null {
    for (let pass = 0; pass < 2; pass++) {
      const i = this.cards.findIndex(ok);
      if (i >= 0) {
        const [c] = this.cards.splice(i, 1);
        this.discard.push(c);
        return c;
      }
      if (!this.discard.length) break;
      this.cards.push(...this.rng.shuffle(this.discard.splice(0)));
    }
    return null;
  }

  /**
   * 山札の上から、条件に合うカードを window 枚まで見て、重み付きで一枚引く。
   * 重み（プレイヤーが追ってきた系統ほど少し重い）によって、同じ seed でも消費の順番が分かれる。
   */
  drawWeighted(ok: (d: EncounterDef) => boolean, weight: (d: EncounterDef) => number, window = 3): EncounterDef | null {
    for (let pass = 0; pass < 2; pass++) {
      const idx: number[] = [];
      for (let i = 0; i < this.cards.length && idx.length < window; i++) if (ok(this.cards[i])) idx.push(i);
      if (idx.length) {
        const i = this.rng.weighted(idx, (k) => weight(this.cards[k])) ?? idx[0];
        const [c] = this.cards.splice(i, 1);
        this.discard.push(c);
        return c;
      }
      if (!this.discard.length) break;
      this.cards.push(...this.rng.shuffle(this.discard.splice(0)));
    }
    return null;
  }

  /** 引いたが使われなかったカード（選ばれなかった噂）を山札の後ろ半分へ戻す。後で再登場しうる */
  putBack(card: EncounterDef) {
    const i = this.discard.lastIndexOf(card);
    if (i >= 0) this.discard.splice(i, 1);
    const half = Math.floor(this.cards.length / 2);
    this.cards.splice(half + this.rng.int(this.cards.length - half + 1), 0, card);
  }
}

export interface SitePickContext {
  px: number;
  pz: number;
  /** プレイヤーの進行方向（単位ベクトル。止まっていれば 0,0） */
  fx: number;
  fz: number;
  minD: number;
  maxD: number;
  /** 使用中・直近で使った場所 */
  used: ReadonlySet<string>;
  /** 場所 → 地区 id */
  districtOf: (x: number, z: number) => string | null;
  /** 地区を最後に訪れた時刻（未訪問は undefined） */
  districtVisit: (id: string) => number | undefined;
  now: number;
  /** 未訪問・久しぶりの地区を強く優先する */
  preferUnvisited: boolean;
  /** 特定の地区を優先（地区覚醒の直後など） */
  district?: string;
}

/** 場所の抽選：遠すぎず近すぎず、進行方向の先、まだ行っていない地区ほど選ばれやすい */
export function pickSite(sites: readonly EncounterSite[], tags: readonly string[], c: SitePickContext, rng: Rng): EncounterSite | null {
  const cand: { s: EncounterSite; w: number }[] = [];
  for (const s of sites) {
    if (c.used.has(s.id)) continue;
    if (tags.length && !s.tags.some((t) => tags.includes(t))) continue;
    const dx = s.x - c.px, dz = s.z - c.pz;
    const d = Math.hypot(dx, dz);
    if (d < c.minD || d > c.maxD) continue;
    let w = 1;
    const ahead = (dx * c.fx + dz * c.fz) / (d || 1);
    w *= 1 + Math.max(0, ahead) * 1.5;
    const dist = c.districtOf(s.x, s.z);
    if (dist) {
      const v = c.districtVisit(dist);
      const since = v === undefined ? Infinity : c.now - v;
      if (since === Infinity) w *= c.preferUnvisited ? 4 : 1.8;
      else if (since > 120) w *= c.preferUnvisited ? 2.5 : 1.3;
      if (c.district && dist === c.district) w *= 5;
    }
    cand.push({ s, w });
  }
  return rng.weighted(cand, (x) => x.w)?.s ?? null;
}

/**
 * 顔ぶれの抽選。今宵の妖怪（theme）が選ばれやすく、行列に既に多い種類もやや選ばれやすい。
 * bias：プレイヤーが追ってきた Encounter の系統（狐火を追う → 狐・人魂…）で少しだけ寄る。
 * → 一夜の百鬼夜行の構成が自然に偏る（完全な均等にはならない。極端なビルドにもならない）。
 */
export function composeGroup(
  members: Readonly<Record<string, number>>,
  n: number,
  theme: string,
  counts: ReadonlyMap<string, number>,
  rng: Rng,
  bias?: ReadonlyMap<string, number>,
): string[] {
  const types = Object.keys(members);
  const weight = (t: string) => {
    let w = members[t];
    if (t === theme) w = w * 2.5 + 1;
    w *= 1 + Math.min(0.8, (counts.get(t) ?? 0) * 0.06);
    if (bias) w *= 1 + Math.min(0.6, (bias.get(t) ?? 0) * 0.15);
    return w;
  };
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rng.weighted(types, weight) ?? types[0]);
  return out;
}
