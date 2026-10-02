/**
 * NightResult：一夜の結果をひとまとめにしたデータ。結果画面・絵巻・共有カードが読む。
 * localStorage にそのまま保存できるよう、プレーンな値だけで持つ（Map は配列に）。
 *
 * 百鬼値（Night Parade Score・仮）：人数だけが圧倒的に有利にならないよう、数は平方根で逓減させ、
 * 種類・出来事・地区・合流・賑わい・役を足す。「どんな夜だったか」を一つの数字で楽しむためのもので、競技用ではない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import { evaluateRoles, type EarnedRole, type RoleInput } from "../../data/roles";
import type { EarnedTitle } from "../../data/titles";
import { RANK_INFO } from "../../data/legendConfig";
import type { CompanionRecord, LegendRecord, MemoryEvent, RoutePoint } from "./NightMemoryLog";

/** 2：legends（大妖怪・三大妖怪の加入）を足した。古い結果には無い（読むときは r.legends ?? []） */
export const RESULT_VERSION = 2;

/** 百鬼値の内訳の係数（調整はここだけ） */
export const SCORE = {
  /** 40 × √妖数（25 妖 → 200、100 妖 → 400、150 妖 → 490） */
  perSqrtTotal: 40,
  perType: 30,
  perEncounter: 25,
  maxEncounters: 12,
  perActivity: 40,
  perDistrict: 50,
  perMerge: 60,
  maxMerges: 4,
  /** 最高賑わい（0..100）× 2 */
  perMomentum: 2,
  hundred: 100,
} as const;

export interface ScoreInput {
  total: number;
  typeCount: number;
  encountersDone: number;
  activitiesDone: number;
  districtsAwakened: number;
  miniMerged: number;
  peakMomentum: number;
  roles: readonly EarnedRole[];
  /** 加わった大妖怪・三大妖怪（加点は格ごとに RANK_INFO.score。仮で 0） */
  legends?: readonly Pick<LegendRecord, "rank">[];
}

export interface ScorePart {
  id: string;
  label: string;
  points: number;
}

export function computeScore(s: ScoreInput): { score: number; parts: ScorePart[] } {
  const parts: ScorePart[] = [
    { id: "total", label: "行列の大きさ", points: Math.round(SCORE.perSqrtTotal * Math.sqrt(Math.max(0, s.total))) },
    { id: "types", label: "妖怪の種類", points: SCORE.perType * s.typeCount },
    { id: "encounters", label: "出来事の成就", points: SCORE.perEncounter * Math.min(SCORE.maxEncounters, s.encountersDone) },
    { id: "activities", label: "行列の遊び", points: SCORE.perActivity * s.activitiesDone },
    { id: "districts", label: "祭りにした地区", points: SCORE.perDistrict * s.districtsAwakened },
    { id: "merges", label: "行列との合流", points: SCORE.perMerge * Math.min(SCORE.maxMerges, s.miniMerged) },
    { id: "momentum", label: "最高の賑わい", points: Math.round(SCORE.perMomentum * Math.max(0, Math.min(100, s.peakMomentum))) },
    { id: "roles", label: "役", points: s.roles.reduce((a, r) => a + r.points, 0) },
    { id: "legends", label: "大妖怪", points: (s.legends ?? []).reduce((a, l) => a + RANK_INFO[l.rank].score, 0) },
  ];
  if (s.total >= 100) parts.push({ id: "hundred", label: "百妖到達", points: SCORE.hundred });
  return { score: parts.reduce((a, p) => a + p.points, 0), parts: parts.filter((p) => p.points > 0) };
}

export interface NightResult {
  version: number;
  /** 夜が終わった日時（ミリ秒。履歴の表示用） */
  endedAt: number;
  seed: number;
  theme: string;
  themeType: string;
  reason: "shrine" | "dawn";
  /** プレイ時間（秒） */
  elapsed: number;
  nightLength: number;
  total: number;
  stage: string;
  /** 種類 → 数（多い順） */
  types: [string, number][];
  typeCount: number;
  topType: string | null;
  encountersDone: number;
  encountersByKind: [string, number][];
  miniMerged: number;
  activitiesDone: string[];
  districtsAwakened: string[];
  /** 歩いた地区（名前） */
  districtsWalked: string[];
  peakMomentum: number;
  scatters: number;
  hundred: boolean;
  score: number;
  scoreParts: ScorePart[];
  titles: EarnedTitle[];
  roles: EarnedRole[];
  /** 今夜の友（最初の仲間） */
  friend: (CompanionRecord & { together: number }) | null;
  hundredth: CompanionRecord | null;
  /** 加わった大妖怪・三大妖怪（加入順。隠し妖怪として見つけたなら discovery: "hidden"）。version 1 の古い結果には無い */
  legends: LegendRecord[];
  highlights: MemoryEvent[];
  timeline: MemoryEvent[];
  route: RoutePoint[];
}

export interface NightResultInput {
  endedAt?: number;
  seed: number;
  theme: string;
  themeType: string;
  reason: "shrine" | "dawn";
  elapsed: number;
  nightLength: number;
  total: number;
  stage: string;
  types: ReadonlyMap<string, number>;
  encountersByKind: ReadonlyMap<string, number>;
  miniMerged: number;
  activitiesDone: readonly string[];
  districtsAwakened: readonly string[];
  districtsWalked: readonly string[];
  peakMomentum: number;
  scatters: number;
  titles: readonly EarnedTitle[];
  memory: {
    firstFriend: CompanionRecord | null;
    hundredth: CompanionRecord | null;
    legends?: readonly LegendRecord[];
    highlights: (n?: number) => MemoryEvent[];
    timeline: () => MemoryEvent[];
    route: readonly RoutePoint[];
  };
}

export function buildNightResult(i: NightResultInput): NightResult {
  const types = [...i.types.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const encountersDone = [...i.encountersByKind.values()].reduce((a, b) => a + b, 0);
  const legends = (i.memory.legends ?? []).map((l) => ({ ...l, conditions: [...l.conditions] }));
  const roleInput: RoleInput = {
    total: i.total, types: i.types, districtsAwakened: i.districtsAwakened, encountersByKind: i.encountersByKind,
    miniMerged: i.miniMerged, activitiesDone: i.activitiesDone.length, scatters: i.scatters, peakMomentum: i.peakMomentum,
    legends,
  };
  const roles = evaluateRoles(roleInput);
  const { score, parts } = computeScore({
    total: i.total, typeCount: types.length, encountersDone, activitiesDone: i.activitiesDone.length,
    districtsAwakened: i.districtsAwakened.length, miniMerged: i.miniMerged, peakMomentum: i.peakMomentum, roles, legends,
  });
  const f = i.memory.firstFriend;
  return {
    version: RESULT_VERSION,
    endedAt: i.endedAt ?? 0,
    seed: i.seed, theme: i.theme, themeType: i.themeType, reason: i.reason,
    elapsed: i.elapsed, nightLength: i.nightLength, total: i.total, stage: i.stage,
    types, typeCount: types.length, topType: types[0]?.[0] ?? null,
    encountersDone, encountersByKind: [...i.encountersByKind.entries()],
    miniMerged: i.miniMerged,
    activitiesDone: [...i.activitiesDone],
    districtsAwakened: [...i.districtsAwakened],
    districtsWalked: [...i.districtsWalked],
    peakMomentum: Math.round(i.peakMomentum),
    scatters: i.scatters,
    hundred: i.total >= 100 || !!i.memory.hundredth,
    score, scoreParts: parts,
    titles: [...i.titles],
    roles,
    friend: f ? { ...f, together: Math.max(0, i.elapsed - f.t) } : null,
    hundredth: i.memory.hundredth,
    legends,
    highlights: i.memory.highlights(3),
    timeline: i.memory.timeline(),
    route: [...i.memory.route],
  };
}

/** 共有用の短い文 */
export function shareText(r: NightResult, typeName: (t: string) => string) {
  const lines = [`今宵の百鬼夜行：${r.total}妖`, r.theme];
  const lead = r.roles[0]?.name ?? r.titles[0]?.name;
  if (lead) lines.push(`役「${lead}」`);
  if (r.topType) lines.push(`いちばん多かったのは${typeName(r.topType)}`);
  lines.push(`百鬼値 ${r.score}`, `Seed ${r.seed}`);
  return lines.join("\n");
}

/** 画像のファイル名：hyakki_seed12345_112yokai.png */
export function photoFileName(seed: number, total: number, suffix = "") {
  return `hyakki_seed${seed}_${total}yokai${suffix ? `_${suffix}` : ""}.png`;
}
