/**
 * タップした場所へ歩く（タップ移動）の「進めなくなった」判定。
 * 実時間（dt）ベースなので、30 / 60 / 120fps のどれでも同じ秒数で諦める。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */

/** これより遅くしか目的地へ近づけていなければ「詰まっている」（歩/秒。旧 60fps で 0.02 歩/フレーム相当） */
export const TAP_MIN_APPROACH = 1.2;
/** 詰まったまま、この秒数が過ぎたら諦める */
export const TAP_GIVE_UP = 1.2;
/** ここまで近づいたら着いた */
export const TAP_ARRIVE = 1.2;

export interface TapTarget {
  x: number;
  z: number;
  /** 詰まっている秒数 */
  stuck: number;
  /** 前回の目的地までの距離 */
  lastD: number;
}

/**
 * dt 秒ぶん判定を進める。歩き続けてよければ true、着いた・諦めたなら false。
 * @param d 今の目的地までの距離
 */
export function tapMoveStep(mt: TapTarget, d: number, dt: number): boolean {
  const approached = mt.lastD - d;
  mt.stuck = approached < TAP_MIN_APPROACH * dt ? mt.stuck + dt : 0;
  mt.lastD = d;
  return d >= TAP_ARRIVE && mt.stuck <= TAP_GIVE_UP;
}
