/**
 * 主人公。図鑑の妖怪（鬼 oni など）とは別のもので、行列の数にも種類にも数えない。
 * web 版は「鬼の色違いの青鬼」（モデル id は hero）。ロブロックス版は Roblox のアバターに替える予定で、
 * 差し替えるのはここの modelId だけ（typeId は YOKAI のどの id とも重ならない）。
 */
export const PROTAGONIST = {
  /** Actor の種類 id。YOKAI に無い id（動き方は既定の二足歩行） */
  typeId: "protagonist",
  /** モデルの id（MODELS の手続き生成。骨付きの GLB は public/models/<id>.glb） */
  modelId: "hero",
} as const;
