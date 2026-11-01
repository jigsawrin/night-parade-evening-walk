/**
 * 骨付きの GLB（yokai_rigging の出力）のクリップ名。
 * どの妖怪が骨付きかは public/models/rigged.json（id の配列）が決める。ファイルが無ければ全員が手続き生成のモデルで動く。
 * GLB は public/models/<id>.glb。
 */
export const RIG_CLIPS = ["Idle", "Walk", "Happy", "Surprise", "Appear"] as const;
export type RigClipName = (typeof RIG_CLIPS)[number];
