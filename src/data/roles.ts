/**
 * 役（今夜成立した百鬼夜行の特徴）。称号とは別に、麻雀の役のように「今夜はこんな行列になった」を並べる。
 * 競技性を強くしすぎない：点は小さめ。主目的は「次は別の組み合わせを作ってみたい」と思わせること。
 * 上位の役（大集会）が成立したら、下位の役（一族）は出さない（replaces）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { YOKAI } from "./yokaiTypes";

export interface RoleInput {
  total: number;
  /** 種類 → 数 */
  types: ReadonlyMap<string, number>;
  districtsAwakened: readonly string[];
  /** Encounter の種類 → 成就数 */
  encountersByKind: ReadonlyMap<string, number>;
  miniMerged: number;
  activitiesDone: number;
  scatters: number;
  peakMomentum: number;
  /**
   * 加わった大妖怪・三大妖怪（将来の役：鬼の双璧・天狗の宴・三大妖怪…の材料。格は rank（三大妖怪は rank = "threeGreat"）、発見方式は YOKAI[type].discovery）
   * 古い記録には無い
   */
  legends?: readonly { type: string; rank: string }[];
}

export interface RoleDef {
  id: string;
  name: string;
  text: string;
  /** 百鬼値への加点（小さめ） */
  points: number;
  /** 成立したら、この役を出さない（上位役が下位役を置き換える） */
  replaces?: string;
  /** 成立したら、表示用の名前（○○の一族など）を返す。不成立なら null */
  test: (r: RoleInput) => { name?: string; text?: string } | null;
}

const nameOf = (t: string) => YOKAI[t]?.name ?? t;

const n = (r: RoleInput, t: string) => r.types.get(t) ?? 0;
const top = (r: RoleInput) => {
  let best = "", bn = 0;
  for (const [t, c] of r.types) if (c > bn) [best, bn] = [t, c];
  return { type: best, n: bn };
};

export const ROLES: RoleDef[] = [
  {
    id: "daishukai", name: "大集会", text: "同じ種類が十妖以上", points: 40,
    test: (r) => {
      const t = top(r);
      return t.n >= 10 ? { name: `${nameOf(t.type)}の大集会`, text: `${nameOf(t.type)}が${t.n}妖集まった` } : null;
    },
  },
  {
    id: "ichizoku", name: "一族", text: "同じ種類が五妖以上", points: 20, replaces: "daishukai",
    test: (r) => {
      const t = top(r);
      return t.n >= 5 ? { name: `${nameOf(t.type)}の一族`, text: `${nameOf(t.type)}が${t.n}妖` } : null;
    },
  },
  {
    id: "hyakki_zoroi", name: "百鬼揃い", text: "八種類以上の妖怪が揃った", points: 60,
    test: (r) => ([...r.types.values()].filter((c) => c > 0).length >= 8 ? {} : null),
  },
  {
    id: "mizube", name: "水辺の一行", text: "河童を六妖以上連れて、川辺を祭りにした", points: 60,
    test: (r) => (n(r, "kappa") >= 6 && r.districtsAwakened.includes("riverside") ? {} : null),
  },
  {
    id: "kitsune_yomeiri", name: "狐の嫁入り", text: "化け狐を五妖以上連れて、狐火を追い切った", points: 70,
    test: (r) => (n(r, "kitsune") >= 5 && (r.encountersByKind.get("foxfireTrail") ?? 0) >= 1 ? {} : null),
  },
  {
    id: "chochin_gyoretsu", name: "提灯行列", text: "提灯お化けが十妖以上", points: 50,
    test: (r) => (n(r, "chochin") >= 10 ? {} : null),
  },
  {
    id: "hinotama", name: "人魂の灯籠流し", text: "火の玉を八妖以上、夜空に浮かべた", points: 50,
    test: (r) => (n(r, "hitodama") >= 8 ? {} : null),
  },
  {
    id: "machijuu", name: "町じゅう祭り", text: "五つ以上の地区を祭りにした", points: 80,
    test: (r) => (r.districtsAwakened.length >= 5 ? {} : null),
  },
  {
    id: "yobu", name: "行列が行列を呼ぶ", text: "小さな百鬼夜行と二度以上合流した", points: 60,
    test: (r) => (r.miniMerged >= 2 ? {} : null),
  },
  {
    id: "chirazu", name: "散らずの行進", text: "三十妖以上で、一度も散らされなかった", points: 40,
    test: (r) => (r.scatters === 0 && r.total >= 30 ? {} : null),
  },
  {
    id: "nekkyo", name: "熱狂の夜", text: "賑わいが最高潮（熱狂）に達した", points: 40,
    test: (r) => (r.peakMomentum >= 85 ? {} : null),
  },
  {
    id: "shosu_seiei", name: "少数精鋭", text: "三十妖未満で、六種類以上を揃えた", points: 50,
    test: (r) => (r.total < 30 && [...r.types.values()].filter((c) => c > 0).length >= 6 ? {} : null),
  },
];

export interface EarnedRole {
  id: string;
  name: string;
  text: string;
  points: number;
}

export function evaluateRoles(r: RoleInput): EarnedRole[] {
  const got = new Map<string, EarnedRole>();
  for (const d of ROLES) {
    const res = d.test(r);
    if (!res) continue;
    got.set(d.id, { id: d.id, name: res.name ?? d.name, text: res.text ?? d.text, points: d.points });
  }
  for (const d of ROLES) if (d.replaces && got.has(d.replaces)) got.delete(d.id);
  return [...got.values()];
}
