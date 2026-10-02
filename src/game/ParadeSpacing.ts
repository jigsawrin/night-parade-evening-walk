/**
 * 行列・写真の間隔を妖怪の大きさ（Actor.scale）に合わせる純粋な規則。
 * 妖怪の体の半径（真上から見た大きさ）を scale から見積もり、隣どうしの間隔を「基本の間隔」と「二妖の半径の和」の大きいほうにする。
 * ふつうの大きさの妖怪（scale ≒ 1.35 まで）どうしは基本の間隔のまま。大きな妖怪（ダイダラボッチ 2.8 など）の前後だけ広がる。
 * 妖怪ごとの if 文は書かない（大きさはデータの scale だけで決まる）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */

/** scale 1 の妖怪の体の半径（歩）。手続き生成モデルはおよそ幅 1 以内 */
export const BODY_RADIUS = 0.5;
/** 半径の和に掛ける余白（触れ合わない程度） */
export const BODY_GAP = 1.1;

/** 真上から見た体の半径（小さい妖怪も scale 1 として数える：間隔を今より詰めない） */
export function bodyRadius(scale = 1) {
  return BODY_RADIUS * Math.max(1, scale);
}

/** 隣り合う二妖（大きさ a・b）の間隔。基本の間隔 base より狭くしない */
export function pairGap(a: number, b: number, base: number) {
  return Math.max(base, (bodyRadius(a) + bodyRadius(b)) * BODY_GAP);
}

/**
 * 先頭（主人公、大きさ lead）から i 番目の妖怪までの距離（累積）。out[i] = 先頭から i 番目までの軌跡上の距離。
 * 例：大きさが全員 1 なら out[i] = (i + 1) × base（今までの「i 番目 × 間隔」と同じ）
 */
export function followerOffsets(scales: ArrayLike<number>, base: number, lead = 1, out: number[] = []) {
  out.length = scales.length;
  let d = 0, prev = lead;
  for (let i = 0; i < scales.length; i++) {
    d += pairGap(prev, scales[i], base);
    out[i] = d;
    prev = scales[i];
  }
  return out;
}

/**
 * 横一列に中央から外へ並べる（0, +1, -1, +2, -2 … の順）ときの横位置。
 * 隣どうしは pairGap（最低 base）。中央の一妖は 0、右（+）と左（−）へ大きさに合わせて広げる
 */
export function centerOutPositions(scales: readonly number[], base: number) {
  const u: number[] = [];
  let right = 0, left = 0, rPrev = -1, lPrev = -1;
  scales.forEach((s, k) => {
    if (k === 0) {
      u.push(0);
      rPrev = lPrev = s;
    } else if (k % 2) {
      right += pairGap(rPrev, s, base);
      rPrev = s;
      u.push(right);
    } else {
      left -= pairGap(lPrev, s, base);
      lPrev = s;
      u.push(left);
    }
  });
  return u;
}

/** 横一列に並んだ妖怪の、中央からいちばん外の端（横位置の絶対値＋体の半径） */
export function rowExtent(u: readonly number[], scales: readonly number[]) {
  let e = 0;
  u.forEach((x, k) => (e = Math.max(e, Math.abs(x) + bodyRadius(scales[k]))));
  return e;
}
