/**
 * 一夜の種（seed）。同じ種なら、ゲームプレイ上重要な抽選（今宵の山札・今宵の妖怪・Mini Parade の顔ぶれ…）を再現できる。
 * 木の揺れなど純粋な見た目の乱数は対象外（Math.random のまま）。
 * ※ node --test から直接読み込むため、実行時の相対 import を持たない。
 */

/** シード付き乱数（mulberry32） */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列 → 32bit ハッシュ（FNV-1a） */
export function hashString(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  range(a: number, b: number): number;
  int(n: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | null;
  shuffle<T>(arr: T[]): T[];
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(items, weight) {
      let sum = 0;
      for (const it of items) sum += Math.max(0, weight(it));
      if (sum <= 0) return null;
      let r = next() * sum;
      for (const it of items) {
        r -= Math.max(0, weight(it));
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return rng;
}

/** URL の ?seed= を解釈する。数字はそのまま、文字列（"今日の種" 等）はハッシュ。無指定なら新しい種 */
export function parseSeed(param: string | null | undefined, fallback = Math.random): number {
  if (param !== null && param !== undefined && param.trim() !== "") {
    const s = param.trim();
    if (/^\d+$/.test(s)) return Number(s) % 1000000000;
    return hashString(s) % 1000000000;
  }
  return Math.floor(fallback() * 900000) + 100000;
}

export class NightSeed {
  readonly seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  /** 用途ごとに独立した乱数列。呼び出し順が変わっても他の抽選に影響しない */
  stream(name: string): Rng {
    return makeRng((this.seed ^ hashString(name)) >>> 0);
  }
}
