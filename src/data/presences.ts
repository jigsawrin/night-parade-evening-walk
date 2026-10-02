/**
 * 「見えなかった妖怪が見える」（Parade Attraction の成長報酬）。
 * 百鬼夜行が大きく賑やかになるほど、これまで認識できなかった妖怪・怪異の「気配」が見えるようになる。
 * 解禁されても加入はしない。姿を見せる／気配が現れる／探索候補になる、まで。
 *
 * 世界の層（WORLD_LAYERS: 10 屋根 / 20 裏路地 / 30 妖怪船 / 40 空 / 45 横丁）と噛み合うよう、層の間を埋める。
 */
import type { SpawnDef } from "./map";

export interface PresenceTierDef {
  id: string;
  /** 必要な行列の大きさ */
  minTotal: number;
  text: string;
}

export const PRESENCE_TIERS: PresenceTierDef[] = [
  { id: "whisper", minTotal: 6, text: "物陰で、何かがくすくす笑った…" },
  { id: "eyes", minTotal: 10, text: "暗がりで、猫又の目が光った" },
  { id: "hayashi", minTotal: 16, text: "何もなかった路地の奥から、祭囃子が聞こえる" },
  { id: "peek", minTotal: 20, text: "窓や軒下から、妖怪たちがこちらを覗いている" },
  { id: "farParade", minTotal: 30, text: "遠くで、別の妖怪行列の笛が鳴った" },
  { id: "highSky", minTotal: 42, text: "夜空の高いところを、灯りがいくつも横切った" },
];

/**
 * 気配として現れる妖怪。presence の段階が開き、かつ百鬼夜行の「気付かれる範囲」に入ると姿を見せる。
 * chance：seed で今夜いるかどうかが決まる（毎夜同じ配置にならない）。
 */
export const PRESENCE_SPAWNS: SpawnDef[] = [
  // 物陰の笑い声
  { type: "oni", x: 34, z: -52, n: 2, r: 3, presence: "whisper", chance: 0.8 },
  { type: "zashiki", x: -30, z: -86, n: 1, r: 2, presence: "whisper", chance: 0.7 },
  { type: "karakasa", x: 20, z: 20, n: 1, r: 2, presence: "whisper", chance: 0.7 },
  // 光る目
  { type: "nekomata", x: -93, z: -60, n: 1, r: 2, presence: "eyes", chance: 0.8 },
  { type: "nekomata", x: 100, z: -52, n: 2, r: 3, presence: "eyes", chance: 0.8 },
  { type: "nekomata", x: -52, z: 60, n: 1, r: 2, presence: "eyes", chance: 0.7 },
  { type: "nekomata", x: 40, z: 76, n: 2, r: 3, presence: "eyes", chance: 0.7 },
  // 路地の祭囃子
  { type: "oni", x: -40, z: -51, n: 3, r: 4, presence: "hayashi", chance: 0.8 },
  { type: "karakasa", x: -78, z: -101, n: 2, r: 4, presence: "hayashi", chance: 0.75 },
  { type: "tanuki", x: 95, z: -40, n: 2, r: 3, presence: "hayashi", chance: 0.75 },
  { type: "kappa", x: 84, z: 0, n: 2, r: 2, presence: "hayashi", chance: 0.7 },
  // 覗く妖怪
  { type: "rokurokubi", x: -50, z: -62.5, n: 1, r: 0, presence: "peek", chance: 0.8 },
  { type: "rokurokubi", x: -85, z: -73.5, n: 1, r: 0, presence: "peek", chance: 0.7 },
  { type: "zashiki", x: -100, z: -51, n: 1, r: 2, presence: "peek", chance: 0.8 },
  { type: "nekomata", x: 110, z: -13.6, n: 1, r: 1, presence: "peek", chance: 0.7 },
  // 遠くの行列の名残
  { type: "chochin", x: 30, z: 50, n: 2, r: 3, presence: "farParade", chance: 0.8 },
  { type: "oni", x: -34, z: 15, n: 2, r: 3, presence: "farParade", chance: 0.8 },
  // 高い空
  { type: "hitodama", x: -25, z: 88, n: 3, r: 5, presence: "highSky", chance: 0.8 },
  { type: "chochin", x: 28, z: 90, n: 2, r: 4, presence: "highSky", chance: 0.8 },
  { type: "hitodama", x: 112, z: -88, n: 3, r: 5, presence: "highSky", chance: 0.7 },
];

/**
 * 地区覚醒で「屋根・路地・店の裏」から現れる妖怪。覚醒した地区ごとに姿を見せる（加入はプレイヤーが触れてから）。
 */
export const AWAKEN_SPAWNS: SpawnDef[] = [
  { type: "nekomata", x: -30, z: -11, n: 2, r: 3, district: "shotengai" },
  { type: "tanuki", x: 12, z: -28, n: 2, r: 3, district: "shotengai" },
  { type: "karakasa", x: -80, z: -28, n: 2, r: 3, district: "shotengai" },
  { type: "zashiki", x: -45, z: -86, n: 2, r: 3, district: "nagaya" },
  { type: "chochin", x: -93, z: -45, n: 2, r: 3, district: "nagaya" },
  { type: "oni", x: 5, z: -75, n: 3, r: 4, district: "south" },
  { type: "kappa", x: 53, z: -30, n: 2, r: 3, district: "riverside" },
  { type: "kappa", x: 83, z: 40, n: 2, r: 3, district: "riverside" },
  { type: "tanuki", x: 118, z: -40, n: 2, r: 3, district: "east" },
  { type: "oni", x: 14, z: 30, n: 3, r: 4, district: "plaza" },
  { type: "hitodama", x: -70, z: 62, n: 3, r: 5, district: "temple" },
  { type: "kitsune", x: 20, z: 88, n: 2, r: 3, district: "north" },
  { type: "kitsune", x: 118, z: 70, n: 2, r: 3, district: "inari" },
  { type: "rokurokubi", x: -135, z: -10, n: 2, r: 3, district: "yokocho" },
];
