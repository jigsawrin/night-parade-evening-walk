/**
 * タッチの歩き（指を置いた場所から滑らせた方へ）。
 * 画面のどこを触っても、上へ滑らせれば画面の奥（カメラの前）へ歩く。
 * 指は置いた場所の近くに留まるので、行き先や行列を隠さない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */

/** これより短いスライドは歩き出さない（px）。タップの揺れ（Input の 14px）と同じ */
export const STEER_DEAD = 14;
/** この長さで歩きが最大になる（px）。指は置いた場所の近くに留まる */
export const STEER_FULL = 72;

export interface SteerAxes {
  /** 画面の右が + */
  ix: number;
  /** 画面の上（奥）が + */
  iz: number;
}

/**
 * 指を置いた位置からのずれ（CSS px。右・下が +）を、カメラ基準の歩き（各 -1..1、長さも 1 まで）にする。
 * 死角の外から最大までを滑らかに増やす（ちょっと滑らせたときはゆっくり）。
 */
export function steerAxes(dx: number, dy: number, dead = STEER_DEAD, full = STEER_FULL): SteerAxes {
  const len = Math.hypot(dx, dy);
  if (!(len > dead) || !(full > dead)) return { ix: 0, iz: 0 };
  const t = Math.min(1, (len - dead) / (full - dead));
  const mag = t * t * (3 - 2 * t);
  const s = mag / len;
  return { ix: dx * s, iz: -dy * s };
}
