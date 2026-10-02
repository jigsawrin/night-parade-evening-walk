/**
 * Night Memory Log：一夜の出来事を「思い出」として残す（結果画面・絵巻・今夜の地図が読む）。
 *  - 最初の仲間（今夜の友）・10 / 30 / 50 / 100 妖・百妖目・地区覚醒・Mini Parade 合流・Encounter 成就・神社／夜明け
 *  - プレイヤーの移動ルート（墨線用）：数秒ごと・一定距離ごとの低頻度サンプルだけ（全フレームは保存しない）
 * 将来は個体記録（一妖ずつの「いつ・どこで・どうやって」）へ広げられるよう、仲間の記録は配列で持つ。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import { toKanji } from "../../core/util";
import { RANK_INFO, type LegendRank } from "../../data/legendConfig";

export type MemoryKind =
  | "start" | "firstFriend" | "milestone" | "hundredth" | "awaken" | "merge" | "encounter" | "activity" | "layer" | "end"
  | "legend" | "onmyoji";

export interface MemoryEvent {
  /** 夜が始まってからの秒数 */
  t: number;
  kind: MemoryKind;
  /** 短い説明（絵巻・思い出に出す） */
  text: string;
  /** 関係する妖怪の種類（アイコン） */
  type?: string;
  /** 地区名 */
  district?: string;
  x?: number;
  z?: number;
  /** 思い出に選ばれやすさ（大きいほど優先） */
  weight: number;
}

/** 仲間になった一妖の記録（将来の個体記録の入口） */
export interface CompanionRecord {
  type: string;
  t: number;
  /** 何妖目か */
  n: number;
  district?: string;
  /** どうやって加わったか */
  source: "town" | "event";
  x: number;
  z: number;
}

/**
 * 大妖怪・三大妖怪が加わった記録（NightResult.legends。プレーンな値だけ。将来のランキング・共有カードにも使う）
 */
export interface LegendRecord {
  type: string;
  rank: LegendRank;
  /** 隠し妖怪として見つけた（格とは別の軸。通常の発見なら書かない） */
  discovery?: "hidden";
  /** 加わった時刻（夜が始まってからの秒） */
  t: number;
  /** 何妖目か */
  n: number;
  /** 地区名 */
  district?: string;
  x: number;
  z: number;
  /** 満たした条件の短い言葉（例：["小鬼八妖", "化け狸二妖"]） */
  conditions: string[];
}

export interface RoutePoint {
  x: number;
  z: number;
  t: number;
}

export const MILESTONES = [10, 30, 50, 100] as const;
/** 墨線のサンプル間隔（秒）と最小移動距離（歩） */
export const ROUTE_EVERY = 2.5;
export const ROUTE_MIN_MOVE = 5;
/** 20 分でも十分な上限。超えたら間引く */
export const ROUTE_MAX = 700;

export interface JoinInfo {
  t: number;
  type: string;
  total: number;
  x: number;
  z: number;
  district?: string;
  /** Encounter・合流・アクティビティの報酬から（true）か、町で出会ったか */
  fromEvent: boolean;
}

export class NightMemoryLog {
  readonly events: MemoryEvent[] = [];
  readonly companions: CompanionRecord[] = [];
  readonly route: RoutePoint[] = [];
  /** 今夜加わった大妖怪・三大妖怪 */
  readonly legends: LegendRecord[] = [];
  /** 百妖目（到達していなければ null） */
  hundredth: CompanionRecord | null = null;
  private reached = new Set<number>();
  private lastRouteT = -Infinity;
  private awakened = 0;
  private merged = 0;
  private firstKinds = new Set<string>();

  /** 今夜の友：最初に仲間になった妖怪（プロトタイプの基本ロジック） */
  get firstFriend(): CompanionRecord | null {
    return this.companions[0] ?? null;
  }

  private add(e: MemoryEvent) {
    this.events.push(e);
    return e;
  }

  start(t: number, x: number, z: number, district?: string) {
    this.add({ t, kind: "start", text: "夜道へ出た", x, z, district, weight: 5 });
    this.sample(t, x, z, true);
  }

  /** 加入（行列の総数 total は加入後の値。主人公を含む） */
  join(j: JoinInfo) {
    const rec: CompanionRecord = { type: j.type, t: j.t, n: j.total, district: j.district, source: j.fromEvent ? "event" : "town", x: j.x, z: j.z };
    this.companions.push(rec);
    if (this.companions.length === 1) {
      this.add({ t: j.t, kind: "firstFriend", text: "最初の仲間になった", type: j.type, district: j.district, x: j.x, z: j.z, weight: 90 });
    }
    if (j.total >= 100 && !this.hundredth) {
      this.hundredth = rec;
      this.add({ t: j.t, kind: "hundredth", text: "百妖目として加わった", type: j.type, district: j.district, x: j.x, z: j.z, weight: 70 });
    }
    this.reach(j.t, j.total, j.x, j.z, j.district);
  }

  /** 総数の変化（散った妖怪が戻ってきた等）。節目だけ記録する */
  reach(t: number, total: number, x?: number, z?: number, district?: string) {
    for (const m of MILESTONES) {
      if (total < m || this.reached.has(m)) continue;
      this.reached.add(m);
      const text = m === 100 ? "百鬼夜行、ここに成る（百妖）" : `${toKanji(m)}妖の行列になった`;
      this.add({ t, kind: "milestone", text, x, z, district, weight: m === 100 ? 100 : m === 50 ? 45 : m === 30 ? 35 : 20 });
    }
  }

  awaken(t: number, district: string, x: number, z: number) {
    this.awakened++;
    this.add({ t, kind: "awaken", text: `${district}が祭りになった`, district, x, z, weight: this.awakened === 1 ? 75 : 50 });
  }

  merge(t: number, n: number, x: number, z: number, district?: string) {
    this.merged++;
    this.add({ t, kind: "merge", text: `${toKanji(n)}妖の小さな百鬼夜行と合流した`, x, z, district, weight: this.merged === 1 ? 80 : 55 });
  }

  encounter(t: number, kind: string, title: string, x: number, z: number, district?: string, type?: string) {
    if (kind === "miniParade") return; // 合流は merge で記録
    const first = !this.firstKinds.has(kind);
    this.firstKinds.add(kind);
    this.add({ t, kind: "encounter", text: `「${title}」を成就した`, x, z, district, type, weight: first ? 30 : 15 });
  }

  activity(t: number, title: string, type?: string) {
    this.add({ t, kind: "activity", text: `${title}を成就した`, type, weight: 25 });
  }

  /** 大妖怪・三大妖怪が加わった（重みは格ごと。隠し妖怪の特別扱いは将来別に：data/legendConfig.ts の RANK_INFO） */
  legend(rec: LegendRecord, name: string) {
    this.legends.push(rec);
    const r = RANK_INFO[rec.rank];
    this.add({ t: rec.t, kind: "legend", text: `${r.label}・${name}が加わった`, type: rec.type, x: rec.x, z: rec.z, district: rec.district, weight: r.memoryWeight });
  }

  /** 陰陽師を退けた */
  onmyoji(t: number, text: string, x: number, z: number) {
    this.add({ t, kind: "onmyoji", text, x, z, weight: 72 });
  }

  layer(t: number, title: string) {
    this.add({ t, kind: "layer", text: `世界の層「${title}」が開いた`, weight: 12 });
  }

  end(t: number, reason: "shrine" | "dawn", x: number, z: number) {
    this.sample(t, x, z, true);
    this.add({ t, kind: "end", text: reason === "shrine" ? "神社に百鬼夜行を奉納した" : "夜が明けた", x, z, weight: 8 });
  }

  /** 移動ルートのサンプル（低頻度で呼べばよい。間隔と距離で間引く） */
  sample(t: number, x: number, z: number, force = false) {
    const last = this.route[this.route.length - 1];
    if (!force) {
      if (t - this.lastRouteT < ROUTE_EVERY) return;
      if (last && Math.hypot(x - last.x, z - last.z) < ROUTE_MIN_MOVE) return;
    }
    this.lastRouteT = t;
    this.route.push({ x, z, t });
    // 上限を超えたら一つおきに間引く（始点・終点は残る）
    if (this.route.length > ROUTE_MAX) {
      for (let i = this.route.length - 2; i > 0; i -= 2) this.route.splice(i, 1);
    }
  }

  /** 時系列の記録 */
  timeline(): MemoryEvent[] {
    return [...this.events].sort((a, b) => a.t - b.t);
  }

  /**
   * 今夜の三大出来事：重要なもの（百妖・最初の仲間・初合流・初覚醒…）を優先して最大 n 件、時系列に並べる。
   * 同じ種類の出来事ばかりにならないようにする。
   */
  highlights(n = 3): MemoryEvent[] {
    const pool = this.events.filter((e) => e.kind !== "start" && e.kind !== "end");
    const sorted = [...pool].sort((a, b) => b.weight - a.weight || a.t - b.t);
    const out: MemoryEvent[] = [];
    const kinds = new Map<string, number>();
    for (const e of sorted) {
      if (out.length >= n) break;
      // 百妖の節目と百妖目は同じ瞬間なので一つだけ
      const k = e.kind === "hundredth" ? "milestone" : e.kind;
      if ((kinds.get(k) ?? 0) >= 1 && sorted.length > n) continue;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
      out.push(e);
    }
    // 足りなければ種類の重複を許して埋める
    for (const e of sorted) {
      if (out.length >= n) break;
      if (!out.includes(e)) out.push(e);
    }
    return out.sort((a, b) => a.t - b.t);
  }

  /** 歩いた地区（ルート上の地区名） */
  districts(districtOf: (x: number, z: number) => string | null) {
    const s = new Set<string>();
    for (const p of this.route) {
      const d = districtOf(p.x, p.z);
      if (d) s.add(d);
    }
    for (const e of this.events) if (e.district) s.add(e.district);
    return s;
  }
}
