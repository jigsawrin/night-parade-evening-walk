/**
 * 温泉宿「宵霞楼」の間取り（x = 東、z = 北）と、宿泊客の居場所（OnsenGuestSpot）。本編の町（data/map.ts）とは別の小さな地図。
 * 南の前庭から玄関・帳場へ入り、大広間・畳座敷・内湯、北の縁側から中庭・露天風呂・大岩風呂へ。
 * 宴会場は「特別宴会場」の解禁で襖が開き、月見の奥庭は「最深部」の解禁で中庭の奥の門が開く。
 * 居場所は固定の候補（座布団・縁側・湯の中・岩の横…）。ランダムな座標にばら撒かない。割り当ては game/onsen/OnsenPlacementRules.ts。
 * **見た目の値**（遊びの手触りではない）。※ node --test から直接読み込むため、実行時の import を持たない。
 */
import type { OnsenAreaId } from "./onsen";

export interface ORect { x0: number; z0: number; x1: number; z1: number }
const r = (x0: number, z0: number, x1: number, z1: number): ORect => ({ x0, z0, x1, z1 });

/** 歩ける範囲の外枠 */
export const ONSEN_BOUNDS = r(-34, -44, 60, 58);
/** 宿に着いたところ（前庭の南。北＝玄関を向く） */
export const ONSEN_START = { x: 0, z: -33 };

/** 床の種類と区域（床を敷く・区域を知る） */
export interface OnsenRoom {
  area: OnsenAreaId;
  r: ORect;
  floor: "tatami" | "wood" | "stone" | "gravel" | "moss";
}
export const ONSEN_ROOMS: OnsenRoom[] = [
  { area: "maeniwa", r: r(-16, -44, 18, -24), floor: "gravel" },
  { area: "genkan", r: r(-6, -24, 6, -17), floor: "stone" },
  { area: "chouba", r: r(6, -24, 16, -17), floor: "wood" },
  { area: "hiroma", r: r(-14, -17, 14, 0), floor: "tatami" },
  { area: "zashiki", r: r(-30, -17, -14, 0), floor: "tatami" },
  { area: "uchiyu", r: r(14, -17, 30, 0), floor: "wood" },
  { area: "engawa", r: r(-30, 0, 30, 3), floor: "wood" },
  { area: "banquet", r: r(-30, 3, -12, 20), floor: "tatami" },
  { area: "nakaniwa", r: r(-12, 3, 12, 23), floor: "moss" },
  { area: "rotenburo", r: r(12, 3, 34, 23), floor: "stone" },
  { area: "iwaburo", r: r(34, -14, 60, 23), floor: "moss" },
  { area: "okuniwa", r: r(-30, 23, 34, 58), floor: "moss" },
  { area: "tsukimi", r: r(10, 30, 22, 38), floor: "wood" },
];

/** 壁・塀（厚さのある線分。h = 高さ）。wall は宿の壁（近づくと透ける）、fence は竹垣・生垣 */
export interface OnsenWall { r: ORect; h: number; kind: "wall" | "fence" | "hedge" }
const W = 0.3;
const wx = (x: number, z0: number, z1: number, h = 2.4, kind: OnsenWall["kind"] = "wall"): OnsenWall => ({ r: r(x - W / 2, z0, x + W / 2, z1), h, kind });
const wz = (z: number, x0: number, x1: number, h = 2.4, kind: OnsenWall["kind"] = "wall"): OnsenWall => ({ r: r(x0, z - W / 2, x1, z + W / 2), h, kind });
export const ONSEN_WALLS: OnsenWall[] = [
  // 玄関・帳場（南へ張り出す。玄関の口は x −3..3）
  wz(-24, -6, -3), wz(-24, 3, 16), wx(-6, -24, -17), wx(16, -24, -17),
  // 大広間の南（玄関からの口は x −3..3）と、座敷・内湯の南
  wz(-17, -30, -6), wz(-17, 3, 16), wz(-17, 16, 30),
  // 外の壁（西・東）
  wx(-30, -17, 0), wx(30, -17, 0),
  // 座敷｜大広間｜内湯の仕切り（口は z −10..−6）
  wx(-14, -17, -10), wx(-14, -6, 0), wx(14, -17, -10), wx(14, -6, 0),
  // 宴会場（縁側からの襖は x −24..−18）
  wz(3, -30, -24), wz(3, -18, -12), wx(-30, 3, 20), wz(20, -30, -12), wx(-12, 3, 20),
  // 中庭と露天風呂の間の竹垣（口は z 10..14）、露天風呂と大岩風呂の間（口は z 8..14）
  wx(12, 3, 10, 1.8, "fence"), wx(12, 14, 23, 1.8, "fence"),
  wx(34, 3, 8, 1.8, "fence"), wx(34, 14, 23, 1.8, "fence"),
  // 奥庭との境の生垣（中庭の奥の門は x −3..3）
  wz(23, -30, -3, 2.2, "hedge"), wz(23, 3, 34, 2.2, "hedge"),
  // 前庭の両脇の生垣
  wx(-16, -44, -24, 1.6, "hedge"), wx(18, -44, -24, 1.6, "hedge"),
];

/** 解禁で開く口（閉じている間は襖・門が立ち、通れない） */
export const ONSEN_DOORS = {
  /** 宴会場の襖（縁側から） */
  banquet: r(-24, 2.4, -18, 3.6),
  /** 月見の奥庭の門（中庭の奥） */
  inner: r(-3, 22.4, 3, 23.6),
};

/**
 * 湯。y = 水面の高さ。縁（岩・檜）は越えられず、entry（縁の上の一点）のところだけ縁が切れていて、そこから湯に入れる。
 * 湯の中では沈んで（game/onsen/OnsenGroundRules.ts）、ゆっくり歩く
 */
export interface OnsenPool { id: string; r: ORect; y: number; indoor?: boolean; entry: { x: number; z: number } }
export const ONSEN_POOLS: OnsenPool[] = [
  { id: "uchiyu", r: r(17, -13, 27, -4), y: 0.3, indoor: true, entry: { x: 17, z: -8.5 } },
  { id: "rotenburo", r: r(16, 7, 30, 20), y: 0.3, entry: { x: 19, z: 7 } },
  { id: "iwaburo", r: r(38, -8, 54, 16), y: 0.3, entry: { x: 38, z: 11 } },
  { id: "tsukiyu", r: r(-18, 31, 0, 45), y: 0.3, entry: { x: -3, z: 31 } },
];
/** 湯の縁の切れ目の幅 */
export const POOL_ENTRY_W = 2.6;

/**
 * 階（1 = 地上。二階・三階は母屋の上）。床の高さは ONSEN_FLOOR_Y[階]。
 * 上の階は、その階へ上がるまで作らない・見せない（下の階からは屋根の無い箱庭のまま部屋が見える）。見せるのは今いる階とその下だけ
 */
export const ONSEN_FLOOR_Y = [0, 0, 3.4, 6.8];
/** 上の階の床の広さ（二階 = 母屋の上いっぱい、三階 = 真ん中の望楼） */
export const ONSEN_UPPER: Record<number, ORect> = {
  2: r(-30, -17, 30, 0),
  3: r(-11, -14, 11, -3),
};
/**
 * 階段（建物の端に）。r = 階段の広さ、up = 上る向き、lower → upper の階をつなぐ。
 * landing = 上りきった先（上の階の床。下の階ではくぐれない）
 */
export interface OnsenStair { id: string; r: ORect; lower: number; upper: number; up: "-x" | "+x" | "-z" | "+z"; landing: ORect }
export const ONSEN_STAIRS: OnsenStair[] = [
  // 畳座敷の南の壁ぞい（東から西へ上る）→ 二階の西の客間
  { id: "s1", r: r(-27, -16.85, -22.5, -14.85), lower: 1, upper: 2, up: "-x", landing: r(-29.85, -16.85, -27, -14.85) },
  // 二階の真ん中、望楼の西の端（北から南へ上る）→ 三階の望楼
  { id: "s2", r: r(-11, -9, -9, -4.5), lower: 2, upper: 3, up: "-z", landing: r(-11, -14, -9, -9) },
];
/** 中庭の池（湯ではない） */
export const ONSEN_POND = r(-9, 9, -1, 17);
/** 奥庭の滝 */
export const ONSEN_FALL = { x: -9, z: 47 };
/** 月（奥庭の空） */
export const ONSEN_MOON = { x: 30, y: 46, z: 110 };

/**
 * 宿泊客の居場所の型。sit = 座る、soak = 湯につかる（浮く妖怪は入れない）、stand = 立つ・佇む、
 * float = 宙に浮く（浮く妖怪だけ）、stroll = 少し歩く
 */
export type OnsenSpotPose = "sit" | "soak" | "stand" | "float" | "stroll";

export interface OnsenSpotDef {
  id: string;
  area: OnsenAreaId;
  x: number;
  z: number;
  /** 向き（Actor.yaw と同じ：atan2(dx, dz)。0 = 北、π = 南） */
  yaw: number;
  pose: OnsenSpotPose;
  /** 置ける大きさ（YokaiType.scale）の上限。大きな妖怪は狭い室内に入れない */
  maxScale: number;
  /** 階（無ければ 1 = 地上） */
  floor?: number;
}

const N = 0, S = Math.PI, E = Math.PI / 2, Wd = -Math.PI / 2;
const spot = (id: string, area: OnsenAreaId, x: number, z: number, yaw: number, pose: OnsenSpotPose, maxScale = 1.55): OnsenSpotDef => ({ id, area, x, z, yaw, pose, maxScale });

export const ONSEN_SPOTS: OnsenSpotDef[] = [
  // 帳場：いちばんいい座布団（上座）は帳場の横
  spot("chouba-kamiza", "chouba", 13, -20.5, Wd, "sit"),
  spot("chouba-2", "chouba", 9, -22.5, N, "stand"),
  // 玄関・前庭
  spot("genkan-1", "genkan", -4, -20, E, "stand"),
  spot("genkan-lamp", "genkan", 0, -22.6, S, "float", 1.3),
  spot("maeniwa-1", "maeniwa", -11, -33, E, "stand"),
  spot("maeniwa-2", "maeniwa", 12, -31, Wd, "stroll"),
  spot("maeniwa-3", "maeniwa", -12, -40, 0.6, "stand", 1.6),
  // 大広間：二つの座卓のまわり
  spot("hiroma-1", "hiroma", -10, -12, 0.8, "sit"),
  spot("hiroma-2", "hiroma", -4, -12, -0.8, "sit"),
  spot("hiroma-3", "hiroma", -10, -5, 2.4, "sit"),
  spot("hiroma-4", "hiroma", -4, -5, -2.4, "sit"),
  spot("hiroma-5", "hiroma", 4, -12, 0.8, "sit"),
  spot("hiroma-6", "hiroma", 10, -12, -0.8, "sit"),
  spot("hiroma-7", "hiroma", 4, -5, 2.4, "sit"),
  spot("hiroma-8", "hiroma", 10, -5, -2.4, "sit"),
  spot("hiroma-9", "hiroma", 0, -14.5, N, "stand"),
  spot("hiroma-10", "hiroma", 0, -2, S, "stroll"),
  // 畳座敷（書棚のそばは静か）
  spot("zashiki-shoin", "zashiki", -27.5, -9, E, "sit"),
  spot("zashiki-1", "zashiki", -24, -13, N, "sit"),
  spot("zashiki-2", "zashiki", -19, -13, N, "sit"),
  spot("zashiki-3", "zashiki", -24, -4, S, "sit"),
  spot("zashiki-4", "zashiki", -19, -4, S, "sit"),
  spot("zashiki-5", "zashiki", -16.5, -8.5, Wd, "stand"),
  // 内湯
  spot("uchiyu-1", "uchiyu", 19.5, -11, 0.6, "soak", 1.5),
  spot("uchiyu-2", "uchiyu", 24.5, -11, -0.6, "soak", 1.5),
  spot("uchiyu-3", "uchiyu", 19.5, -6, 2.5, "soak", 1.5),
  spot("uchiyu-4", "uchiyu", 24.5, -6, -2.5, "soak", 1.5),
  spot("uchiyu-5", "uchiyu", 28.5, -15, Wd, "stand"),
  // 縁側（中庭を向いて腰かける）
  spot("engawa-1", "engawa", -27, 1.5, N, "sit"),
  spot("engawa-2", "engawa", -15, 1.5, N, "sit"),
  spot("engawa-3", "engawa", -8, 1.5, N, "sit"),
  spot("engawa-4", "engawa", -2, 1.5, N, "sit"),
  spot("engawa-5", "engawa", 4, 1.5, N, "sit"),
  spot("engawa-6", "engawa", 10, 1.5, N, "sit"),
  spot("engawa-7", "engawa", 26, 1.5, N, "sit"),
  // 中庭（池と石灯籠。大きな客も立てる広いところが二つ）
  spot("nakaniwa-1", "nakaniwa", -10, 6, 0.5, "stand"),
  spot("nakaniwa-2", "nakaniwa", 9.5, 6, -0.5, "stroll"),
  spot("nakaniwa-3", "nakaniwa", -10, 20, 2.6, "stand"),
  spot("nakaniwa-sky", "nakaniwa", 0, 8, S, "float", 1.4),
  spot("nakaniwa-big1", "nakaniwa", 6, 13, Wd, "stand", 2.6),
  spot("nakaniwa-big2", "nakaniwa", 6, 20, S, "stand", 2.6),
  // 露天風呂（岩の湯。牛鬼くらいまでは湯につかれる）
  spot("roten-1", "rotenburo", 19, 10.5, 0.7, "soak", 2.0),
  spot("roten-2", "rotenburo", 24.5, 10, 0, "soak", 2.0),
  spot("roten-3", "rotenburo", 27.5, 14, -1.2, "soak", 2.0),
  spot("roten-4", "rotenburo", 19, 17, 2.4, "soak", 2.0),
  spot("roten-5", "rotenburo", 24.5, 17.5, S, "soak", 2.2),
  spot("roten-6", "rotenburo", 31.5, 21, -2.4, "stand", 1.7),
  spot("roten-7", "rotenburo", 14.5, 21, 2.4, "stand", 1.7),
  // 大岩風呂（宿の外。いちばん大きな客も足を伸ばせる）
  spot("iwa-1", "iwaburo", 46, 4, Wd, "soak", 3.0),
  spot("iwa-2", "iwaburo", 42, 12, 2.6, "soak", 2.6),
  spot("iwa-3", "iwaburo", 56, 20, -2.4, "stand", 3.0),
  spot("iwa-4", "iwaburo", 38, -11, 0.4, "stand"),
  spot("iwa-5", "iwaburo", 56, -10, -0.6, "sit"),
  // 宴会場（特別宴会場）：長い座卓。上座は奥
  spot("banquet-kamiza", "banquet", -27.5, 11.5, E, "sit", 1.6),
  spot("banquet-1", "banquet", -24, 9, N, "sit", 1.6),
  spot("banquet-2", "banquet", -20, 9, N, "sit", 1.6),
  spot("banquet-3", "banquet", -16, 9, N, "sit", 1.6),
  spot("banquet-4", "banquet", -24, 14, S, "sit", 1.6),
  spot("banquet-5", "banquet", -20, 14, S, "sit", 1.6),
  spot("banquet-6", "banquet", -16, 14, S, "sit", 1.6),
  spot("banquet-7", "banquet", -14.5, 18, Wd, "stand", 1.6),
  // 月見の奥庭（最深部）：月見の湯・月見台・滝のそば・奥の外周
  spot("tsukiyu-1", "okuniwa", -14, 35, 0.4, "soak", 2.0),
  spot("tsukiyu-2", "okuniwa", -5, 35, -0.4, "soak", 2.0),
  spot("tsukiyu-3", "okuniwa", -10, 41, 0.2, "soak", 2.2),
  spot("tsukimi-1", "tsukimi", 13, 34, 0.5, "sit", 1.6),
  spot("tsukimi-2", "tsukimi", 19, 34, 0.5, "sit", 1.6),
  spot("okuniwa-fall", "okuniwa", -2, 50, Wd, "stand", 2.6),
  spot("okuniwa-far1", "okuniwa", 24, 50, -2.4, "stand", 3.0),
  spot("okuniwa-far2", "okuniwa", -24, 50, 2.4, "stand", 3.0),
  spot("okuniwa-bamboo", "okuniwa", -24, 30, 1.2, "stroll"),
  spot("okuniwa-sky", "okuniwa", 4, 40, S, "float", 1.4),
  // 二階の客間（西の霞の間・東の湯煙の間）と、北の欄干から中庭を見下ろすところ
  { ...spot("nikai-1", "nikai", -20, -10.5, N, "sit", 1.5), floor: 2 },
  { ...spot("nikai-2", "nikai", -20, -5.5, S, "sit", 1.5), floor: 2 },
  { ...spot("nikai-3", "nikai", 22, -10.5, N, "sit", 1.5), floor: 2 },
  { ...spot("nikai-4", "nikai", 4, -1.4, N, "stand", 1.5), floor: 2 },
  // 三階の望楼（宿と月を見下ろす）
  { ...spot("bourou-1", "bourou", 0, -5, N, "sit", 1.5), floor: 3 },
  { ...spot("bourou-2", "bourou", 6, -5, N, "sit", 1.5), floor: 3 },
];
