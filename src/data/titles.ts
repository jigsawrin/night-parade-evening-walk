/**
 * 称号 / 夜の記録。優劣のランキングではなく「今夜はどんな百鬼夜行だったか」を表す。
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */

export interface NightRecordData {
  total: number;
  /** 種類 → 数 */
  types: ReadonlyMap<string, number>;
  scatters: number;
  activitiesDone: number;
  activitiesTotal: number;
  districtsAwakened: number;
  miniMerged: number;
  encountersDone: number;
  cellsVisited: number;
  time: number;
  nightLength: number;
  reason: "shrine" | "dawn";
  peakMomentum: number;
  /** 陰陽師を退散させた（v0.3 以降。古い記録には無い） */
  onmyojiRouted?: boolean;
  /** 陰陽師に見つからずに神社まで（一度も祓われなかった） */
  purges?: number;
}

export interface TitleDef {
  id: string;
  name: string;
  text: string;
  test: (r: NightRecordData) => boolean;
}

/** 行列の中で最も多い種類（単独で最多、全体の 22% 以上かつ 5 妖以上なら「○○中心」とみなす） */
export function dominantType(r: NightRecordData): string | null {
  let best: string | null = null;
  let bn = 0;
  let second = 0;
  let sum = 0;
  for (const [t, n] of r.types) {
    sum += n;
    if (n > bn) {
      second = bn;
      bn = n;
      best = t;
    } else if (n > second) second = n;
  }
  if (!best || bn === second || bn < 5 || bn / Math.max(1, sum) < 0.22) return null;
  return best;
}

const DOMINANT_NAMES: Record<string, [string, string]> = {
  kappa: ["河童の川流れ行列", "河童がいちばん多かった"],
  chochin: ["提灯だらけの夜", "提灯お化けがいちばん多かった"],
  tanuki: ["狸囃子の行列", "化け狸がいちばん多かった"],
  nekomata: ["猫又の大集会", "猫又がいちばん多かった"],
  oni: ["小鬼どもの大行進", "小鬼がいちばん多かった"],
  kitsune: ["狐の嫁入り", "化け狐がいちばん多かった"],
  hitodama: ["人魂の灯籠流し", "火の玉がいちばん多かった"],
  karakasa: ["唐傘の雨宿り", "唐傘お化けがいちばん多かった"],
  zashiki: ["座敷童の鬼ごっこ", "座敷童がいちばん多かった"],
};

/** 上から順に判定し、当てはまったものを最大 max 個 */
export const TITLES: TitleDef[] = [
  { id: "hyaku", name: "百妖到達", text: "百の妖が夜を練り歩いた", test: (r) => r.total >= 100 },
  { id: "taisan", name: "陰陽師退散", text: "百鬼夜行の威光で、陰陽師を退けた", test: (r) => !!r.onmyojiRouted },
  {
    id: "shinobi", name: "忍び足の百鬼夜行", text: "陰陽師に一度も祓われずに奉納した",
    test: (r) => r.reason === "shrine" && r.purges === 0 && !r.onmyojiRouted && r.total >= 10,
  },
  { id: "matsuri", name: "町じゅうを祭りに", text: "三つ以上の地区を目覚めさせた", test: (r) => r.districtsAwakened >= 3 },
  { id: "yobu", name: "行列を呼ぶ行列", text: "小さな百鬼夜行を二つ以上合流させた", test: (r) => r.miniMerged >= 2 },
  { id: "chirazu", name: "散らずの百鬼夜行", text: "一度も散らされなかった", test: (r) => r.scatters === 0 && r.total >= 10 },
  { id: "zenjoju", name: "全成就", text: "行列アクティビティをすべて成就した", test: (r) => r.activitiesTotal > 0 && r.activitiesDone >= r.activitiesTotal },
  {
    id: "dominant", name: "", text: "",
    test: (r) => dominantType(r) !== null && dominantType(r)! in DOMINANT_NAMES,
  },
  { id: "gojuu", name: "五十妖の百鬼夜行", text: "五十の妖を連れて歩いた", test: (r) => r.total >= 50 && r.total < 100 },
  { id: "yorimichi", name: "寄り道の達人", text: "町の隅々まで歩き、たくさんの出来事に出会った", test: (r) => r.encountersDone >= 4 || r.cellsVisited >= 140 },
  { id: "idaten", name: "韋駄天の夜行", text: "夜の半ばで神社に着いた", test: (r) => r.reason === "shrine" && r.time < r.nightLength * 0.45 && r.total >= 15 },
  { id: "nekkyo", name: "熱狂の夜", text: "賑わいが最高潮に達した", test: (r) => r.peakMomentum >= 85 },
  { id: "asamade", name: "夜明けまで", text: "夜明けまで歩き続けた", test: (r) => r.reason === "dawn" },
  { id: "shizuka", name: "静かな夜歩き", text: "ひっそりとした一夜", test: (r) => r.total < 10 },
];

export interface EarnedTitle {
  id: string;
  name: string;
  text: string;
}

export function evaluateTitles(r: NightRecordData, max = 3): EarnedTitle[] {
  const out: EarnedTitle[] = [];
  for (const t of TITLES) {
    if (out.length >= max) break;
    if (!t.test(r)) continue;
    if (t.id === "dominant") {
      const d = dominantType(r)!;
      const [name, text] = DOMINANT_NAMES[d];
      out.push({ id: `dominant_${d}`, name, text });
    } else out.push({ id: t.id, name: t.name, text: t.text });
  }
  return out;
}
