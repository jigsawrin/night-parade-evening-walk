/**
 * 町のレイアウト（x=東, z=北）。WorldBuilder / MapPainter / 各ゲームシステムが参照する唯一の地図データ。
 */
import { LEGEND_SPAWNS } from "./legendYokai";
export const WORLD = { minX: -160, maxX: 140, minZ: -140, maxZ: 140 };

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });
export const inRect = (r: Rect, x: number, z: number, pad = 0) =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

/** 道（描画用。歩行は建物・川以外どこでも可） */
export const ROADS: Rect[] = [
  rect(-5, -135, 5, 62), // 大通り（南北）
  rect(-108, -25, 58, -15), // 商店街（東西）
  rect(78, -25, 130, -15), // 川向こう
  rect(-105, -70, -20, -64), // 長屋の通り
  rect(-66, -110, -60, -25), // 長屋の路地（縦）
  rect(-96, -110, -90, -25),
  rect(-60, 12, -5, 18), // 寺への道
  rect(5, 46, 58, 54), // 北の橋へ
  rect(78, 46, 96, 54),
  rect(-3, 62, 3, 104), // 参道
  rect(-150, -25, -108, -15), // 妖怪横丁
  rect(20, -64, 58, -58), // 南東の道
];

export const RIVER = rect(58, -140, 78, 140);
export interface Bridge { r: Rect; arch: number; red: boolean }
export const BRIDGES: Bridge[] = [
  { r: rect(56, -24, 80, -16), arch: 1.2, red: false },
  { r: rect(56, 46, 80, 54), arch: 2.2, red: true },
];

export const PLAZA = { x: 0, z: 25, r: 15 };
export const SHRINE = { x: 0, z: 118, gateZ: 102, endRadius: 14 };
/** 参道の入口の鳥居（広場の北。記念撮影はこの鳥居を背にする） */
export const SANDO_TORII = { x: 0, z: 64 };
export const TEMPLE = { x: -75, z: 40 };
export const GRAVEYARD = rect(-110, 58, -80, 85);
export const NAGAYA = rect(-110, -115, -22, -32);
export const INARI = { x: 112, z: 100 };
/** 千本鳥居の中心線 */
export const TORII_PATH: [number, number][] = [
  [96, 52], [102, 62], [106, 72], [108, 82], [110, 92],
];
export const YOKOCHO = rect(-155, -45, -112, 5);
export const YOKOCHO_GATE = { x: -108, z: -20 };
export const DANGO_STALLS: [number, number][] = [
  [26, -12], [-40, -28], [8, 40], [100, -12],
];
export const START = { x: 0, z: -118 };

/** 暗い路地（提灯お化け） */
export const DARK_LANTERNS: [number, number][] = [
  [-63, -40], [-63, -52], [-63, -88], [-63, -100], [-93, -45], [-93, -95], [-35, -67], [-80, -67],
];

/** 野良妖怪の配置 */
export interface SpawnDef {
  type: string;
  x: number;
  z: number;
  n: number;
  r: number;
  layer?: string;
  /** 夜の進行度（0-1）で出現 */
  appearAt?: number;
  y?: number;
  /** 気配の段階（presences.ts）。段階が開き、百鬼夜行に気付いたときに姿を見せる */
  presence?: string;
  /** 地区覚醒で姿を見せる */
  district?: string;
  /** 今夜ここにいる確率（seed で決まる） */
  chance?: number;
  /** 世界の層でも加入条件を変えない（大妖怪・後から混ざる通常妖怪） */
  keepRule?: boolean;
  /** 歩けない場所なら近くの歩ける場所へ寄せる（後から混ざる通常妖怪の場所の候補） */
  snap?: boolean;
  /** y の代わりに屋根の高さへ（屋根が無ければ y） */
  roof?: boolean;
  /** 地区覚醒の数・行列の遊びの数がそろうと姿を見せる */
  after?: { districts?: number; activities?: number };
  /** 潜んでいる（そばで立ち止まると姿を見せる：WildJoinRules.applyLurk） */
  lurk?: boolean;
  /** 置いたときの向き（無ければ乱数） */
  yaw?: number;
  /** 細い蜘蛛の糸の道（順に辿ると、その先で姿を見せる：WildTrails） */
  trail?: [number, number][];
}
export const SPAWNS: SpawnDef[] = [
  // 小鬼の群れ
  { type: "oni", x: 8, z: -95, n: 2, r: 3 },
  { type: "oni", x: -18, z: -50, n: 3, r: 4 },
  { type: "oni", x: 30, z: -38, n: 3, r: 5 },
  { type: "oni", x: -14, z: 5, n: 2, r: 4 },
  { type: "oni", x: 40, z: 30, n: 3, r: 5 },
  { type: "oni", x: 100, z: -40, n: 3, r: 6 },
  { type: "oni", x: -40, z: 62, n: 2, r: 4 },
  { type: "oni", x: 25, z: 80, n: 2, r: 4 },
  // 火の玉（墓地）
  { type: "hitodama", x: -95, z: 71, n: 6, r: 10 },
  // 座敷童（長屋）
  { type: "zashiki", x: -78, z: -52, n: 1, r: 2 },
  { type: "zashiki", x: -45, z: -86, n: 1, r: 2 },
  { type: "zashiki", x: -102, z: -86, n: 1, r: 2 },
  // 化け狸（林）
  { type: "tanuki", x: 30, z: 95, n: 2, r: 4 },
  { type: "tanuki", x: -30, z: 95, n: 1, r: 3 },
  { type: "tanuki", x: 112, z: 20, n: 2, r: 4 },
  // 猫又（商店街）
  { type: "nekomata", x: -20, z: -27, n: 1, r: 2 },
  { type: "nekomata", x: 45, z: -9, n: 2, r: 3 },
  { type: "nekomata", x: -80, z: -10, n: 2, r: 3 },
  // 天狗（稲荷）
  { type: "tengu", x: 112, z: 100, n: 1, r: 0 },
  // ろくろ首（夜更け）
  { type: "rokurokubi", x: -48, z: -51, n: 1, r: 0, appearAt: 0.3 },
  { type: "rokurokubi", x: 15, z: -80, n: 1, r: 0, appearAt: 0.55 },
  // --- 世界の層 ---
  // 10妖：屋根の上
  { type: "oni", x: -40, z: -7, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "nekomata", x: -25, z: -33, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "oni", x: 18, z: -7, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "nekomata", x: 38, z: -33, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "oni", x: -70, z: -7, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "karakasa", x: 12, z: -33, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "oni", x: -14, z: -7, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  { type: "karakasa", x: -55, z: -33, n: 1, r: 0, layer: "rooftops", y: 5.6 },
  // 20妖：裏路地の妖怪祭り
  { type: "karakasa", x: -78, z: -84, n: 4, r: 5, layer: "alleyFestival" },
  { type: "oni", x: -78, z: -84, n: 4, r: 6, layer: "alleyFestival" },
  { type: "chochin", x: -78, z: -84, n: 2, r: 5, layer: "alleyFestival" },
  { type: "tanuki", x: -78, z: -84, n: 2, r: 5, layer: "alleyFestival" },
  // 30妖：川の妖怪船
  { type: "kappa", x: 68, z: 15, n: 4, r: 2.2, layer: "yokaiBoat", y: 0.9 },
  { type: "karakasa", x: 68, z: 15, n: 2, r: 2.2, layer: "yokaiBoat", y: 0.9 },
  { type: "hitodama", x: 68, z: 15, n: 2, r: 2.2, layer: "yokaiBoat", y: 0.9 },
  // 45妖：妖怪横丁
  { type: "oni", x: -130, z: -20, n: 6, r: 12, layer: "yokocho" },
  { type: "karakasa", x: -135, z: -32, n: 4, r: 7, layer: "yokocho" },
  { type: "chochin", x: -130, z: -8, n: 4, r: 9, layer: "yokocho" },
  { type: "nekomata", x: -142, z: -5, n: 3, r: 5, layer: "yokocho" },
  { type: "kitsune", x: -125, z: -35, n: 3, r: 5, layer: "yokocho" },
  { type: "hitodama", x: -145, z: -25, n: 4, r: 7, layer: "yokocho" },
  { type: "kappa", x: -120, z: -5, n: 2, r: 4, layer: "yokocho" },
  // 大妖怪・三大妖怪・隠し妖怪：一体ずつ（今夜の候補に入ったときだけ置かれる）。場所と加入条件は legendYokai.ts
  ...LEGEND_SPAWNS,
];

/** 脅威（戦闘なし。追われると行列が散るだけ） */
export interface ThreatDef {
  kind: "dog" | "watchman" | "monk";
  x: number;
  z: number;
  patrol?: [number, number][];
}
export const THREATS: ThreatDef[] = [
  { kind: "dog", x: 18, z: -72 },
  { kind: "dog", x: 100, z: -30 },
  { kind: "dog", x: -40, z: 32 },
  { kind: "watchman", x: -30, z: -20, patrol: [[-90, -20], [40, -20], [0, -20], [0, 40], [0, -20]] },
  { kind: "watchman", x: 0, z: -60, patrol: [[0, -110], [0, -20], [0, -67], [-100, -67], [0, -67]] },
  { kind: "monk", x: -58, z: 34 },
];
