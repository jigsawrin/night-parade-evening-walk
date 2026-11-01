/**
 * 骨付きの GLB（yokai_rigging の出力）のクリップ名。Idle〜Appear は妖怪ごとの動き、Breath〜Flip は全妖怪共通の動き。
 * どの妖怪が骨付きかは public/models/rigged.json（id の配列）が決める。ファイルが無ければ全員が手続き生成のモデルで動く。
 * GLB は public/models/<id>.glb。
 */
export const RIG_CLIPS = ["Idle", "Walk", "Happy", "Surprise", "Appear"] as const;
/** 全妖怪共通（Root だけで動かす）：呼吸・ゆっくり上下に跳ねる・くるりと一回転・宙返り（横軸で一回転） */
export const COMMON_CLIPS = ["Breath", "Bounce", "Spin", "Flip"] as const;
export type RigClipName = (typeof RIG_CLIPS)[number] | (typeof COMMON_CLIPS)[number];
