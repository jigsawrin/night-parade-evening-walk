/**
 * 手続き生成キャラクターの部品の型と、形を作る小さな道具（目・左右対称・鬼・天狗の素体）。
 * models.ts（町の妖怪・人）・normalModels.ts（後から町へ混ざる通常妖怪）・legendModels.ts（大妖怪・三大妖怪・隠し妖怪）が使う。
 * 規格: 高さ ≒1.0、原点は足元中央、前方 +Z。
 */
export type Shape = "sphere" | "box" | "cyl" | "cone" | "torus";
export type GlowKind = "warm" | "cool" | "red" | "violet";

export interface Part {
  s: Shape;
  c: string;
  p: [number, number, number];
  /** スケール（sphere/box/cyl は 1 単位の基本形状に掛ける） */
  sc?: [number, number, number] | number;
  r?: [number, number, number];
  /** cyl の上面直径比（0 で円錐） */
  top?: number;
  /** torus の太さ */
  th?: number;
  glow?: GlowKind;
  /** LOD で省く小部品 */
  small?: boolean;
}

export const EYE_W = "#fbf8ef";
export const EYE_B = "#1a1420";

/** 左右対称の目 */
export function eyes(y: number, z: number, spread: number, size = 0.1, white = true): Part[] {
  const out: Part[] = [];
  for (const sx of [-1, 1]) {
    if (white) out.push({ s: "sphere", c: EYE_W, p: [sx * spread, y, z], sc: size, small: true });
    out.push({ s: "sphere", c: EYE_B, p: [sx * spread, y, z + size * 0.35], sc: size * 0.6, small: true });
  }
  return out;
}
export const mirror = (fn: (sx: number) => Part[]) => [...fn(-1), ...fn(1)];

/** 付け根 a から先端 b へ伸びる円柱（首・腕・脚）。細さ w、先端の細さ top */
export function limb(c: string, a: [number, number, number], b: [number, number, number], w: number, top = 1, small = false): Part {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return {
    s: "cyl", c, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], sc: [w, len, w], top,
    r: [Math.atan2(dz, dy), 0, -Math.atan2(dx, Math.hypot(dy, dz))], small,
  };
}

export const ONI = (body: string, hair: string): Part[] => [
  ...mirror((sx) => [{ s: "cyl", c: body, p: [sx * 0.1, 0.1, 0], sc: [0.16, 0.2, 0.16] }]),
  { s: "sphere", c: body, p: [0, 0.34, 0], sc: [0.46, 0.42, 0.4] },
  { s: "cyl", c: "#e8b83a", p: [0, 0.25, 0], sc: [0.48, 0.12, 0.43] },
  { s: "cyl", c: "#2b2230", p: [0, 0.25, 0.005], sc: [0.49, 0.03, 0.44], small: true },
  ...mirror((sx) => [{ s: "sphere", c: body, p: [sx * 0.27, 0.38, 0.05], sc: 0.14 }]),
  { s: "sphere", c: body, p: [0, 0.8, 0], sc: 0.64 },
  { s: "sphere", c: hair, p: [0, 0.98, -0.05], sc: [0.62, 0.34, 0.6] },
  ...mirror((sx) => [{ s: "cyl", c: "#f3e6c4", p: [sx * 0.14, 1.14, 0.03], sc: [0.1, 0.22, 0.1], top: 0, r: [0, 0, -sx * 0.35] }]),
  ...eyes(0.8, 0.27, 0.12, 0.12),
  { s: "cyl", c: EYE_W, p: [0.07, 0.66, 0.28], sc: [0.05, 0.07, 0.05], top: 0, r: [Math.PI, 0, 0], small: true },
  { s: "sphere", c: "#ff9a9a", p: [-0.2, 0.72, 0.22], sc: [0.08, 0.05, 0.03], small: true },
  { s: "sphere", c: "#ff9a9a", p: [0.2, 0.72, 0.22], sc: [0.08, 0.05, 0.03], small: true },
];

export const TENGU: Part[] = [
  ...mirror((sx) => [{ s: "box", c: "#6b4a2e", p: [sx * 0.11, 0.05, 0], sc: [0.13, 0.1, 0.24] } as Part]),
  { s: "cyl", c: "#ece6d6", p: [0, 0.37, 0], sc: [0.56, 0.58, 0.5], top: 0.55 },
  ...[0.52, 0.4, 0.28].map((y) => ({ s: "sphere", c: "#3a6ac4", p: [0, y, 0.22], sc: 0.08, small: true }) as Part),
  ...mirror((sx) => [{ s: "sphere", c: "#2a2a33", p: [sx * 0.3, 0.62, -0.22], sc: [0.1, 0.56, 0.4], r: [0, 0, -sx * 0.45] } as Part]),
  { s: "sphere", c: "#d8423a", p: [0, 0.88, 0], sc: 0.56 },
  { s: "cyl", c: "#d8423a", p: [0, 0.86, 0.38], sc: [0.1, 0.34, 0.1], top: 0.6, r: [Math.PI / 2, 0, 0] },
  { s: "sphere", c: "#f4f0e6", p: [0, 1.02, -0.05], sc: [0.62, 0.3, 0.6] },
  { s: "cyl", c: "#1c1418", p: [0, 1.18, 0.1], sc: [0.16, 0.12, 0.16] },
  ...mirror((sx) => [{ s: "box", c: "#f4f0e6", p: [sx * 0.12, 0.98, 0.24], sc: [0.16, 0.04, 0.05], r: [0, 0, sx * 0.3], small: true } as Part]),
  ...eyes(0.92, 0.25, 0.12, 0.08, false),
  { s: "sphere", c: "#4a8a4a", p: [0.38, 0.62, 0.16], sc: [0.34, 0.4, 0.05], r: [0, 0, -0.3] },
];

// ---- 通常妖怪の素体（normalModels.ts・normalModelsThird.ts）
export const SKIN = "#f4dcc4";
export const HAIR = "#1c1820";
export const BONE = "#ece4d0";

/** 左右の短い脚（二本足の素体） */
export const legs = (c: string, spread = 0.1, h = 0.2): Part[] => mirror((sx) => [{ s: "cyl", c, p: [sx * spread, h / 2, 0], sc: [0.15, h, 0.15] }]);
/** 四つ足（前後・左右） */
export const quadLegs = (c: string, x: number, z: number, h = 0.22, w = 0.1): Part[] =>
  mirror((sx) => [
    { s: "cyl", c, p: [sx * x, h / 2, z], sc: [w, h, w] } as Part,
    { s: "cyl", c, p: [sx * x, h / 2, -z], sc: [w, h, w] } as Part,
  ]);

