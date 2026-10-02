/**
 * 百鬼夜行を追いかける子供・犬の数と、行列のどこに沿うか（純粋ロジック）。
 * 彼らは行列には加わらない（数えない・祓われない・散らない）。見た目の賑やかしだけ。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */

/** 追いかけはじめる妖数（これを下回ると帰っていく。少しだけ余裕を持たせる） */
export const TAGALONG_START = 50;
export const TAGALONG_STOP = 45;

/** 同時に追いかける数：五十妖で三人、そこから十二妖ごとに一人、最大八 */
export function tagalongCap(total: number, active: boolean) {
  const need = active ? TAGALONG_STOP : TAGALONG_START;
  if (total < need) return 0;
  return Math.min(8, 3 + Math.floor(Math.max(0, total - TAGALONG_START) / 12));
}

/**
 * 沿う場所：-1 = 主人公の斜め後ろ、0..1 = 行列の先頭〜最後尾の割合。
 * 同じ場所に固まらないよう、いま使われていない場所から選ぶ。
 */
export const TAGALONG_ANCHORS = [-1, 0.12, 0.3, 0.5, 0.7, 0.88, 1] as const;

export function pickAnchor(used: readonly number[], r: number) {
  const free = TAGALONG_ANCHORS.filter((a) => !used.includes(a));
  const pool = free.length ? free : TAGALONG_ANCHORS;
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

/** 行列の何番目の横に沿うか（anchor が -1 なら主人公のすぐ後ろ） */
export function anchorIndex(anchor: number, count: number) {
  if (anchor < 0 || count <= 0) return -1;
  return Math.min(count - 1, Math.round(anchor * (count - 1)));
}
