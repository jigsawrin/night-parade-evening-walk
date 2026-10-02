/**
 * 地区（District）。賑わい・Encounter の場所選び・地区覚醒（District Awakening）が参照する。
 * 地区覚醒：一定規模の百鬼夜行で、その地区を実際に練り歩くと、街そのものが祭りになる。
 */
import { rect, inRect, type Rect } from "./map";

export interface DistrictDef {
  id: string;
  name: string;
  area: Rect;
  /** 覚醒の条件。無ければ覚醒しない */
  awaken?: {
    /** 必要な行列の大きさ（主人公を含む妖数） */
    minTotal: number;
    /** 1 回の訪問で、行列を連れて歩く必要のある地区内の異なるマスの数（1 マス 10 歩。覚醒させた地区が増えると少し増える） */
    cells: number;
  };
  /** 覚醒で順番に灯る祭り提灯の線（折れ線。約 4.5 歩ごとに吊るす） */
  garland: [number, number][];
  /** 住民が顔を出す店先・戸口 */
  folk: [number, number][];
  /** 覚醒で開く屋台 [x, z, 向き] */
  stalls: [number, number, number][];
  /** 覚醒したときの住民の声 */
  cheer: string;
}

export const DISTRICTS: DistrictDef[] = [
  {
    id: "yokocho", name: "妖怪横丁", area: rect(-158, -48, -109, 8),
    awaken: { minTotal: 50, cells: 8 },
    garland: [[-148, -20], [-114, -20]],
    folk: [], stalls: [[-128, -12, 0], [-140, -28, Math.PI]],
    cheer: "横丁の妖怪たち「百鬼夜行のお通りだ！」",
  },
  {
    id: "riverside", name: "川辺", area: rect(48, -140, 86, 140),
    awaken: { minTotal: 35, cells: 14 },
    garland: [[53, -70], [53, 40]],
    folk: [[51, -40], [51, -10], [51, 30], [84, -40], [84, 30]],
    stalls: [[51, 8, Math.PI / 2]],
    cheer: "船頭「川が明るくなったねえ、祭りだ祭りだ」",
  },
  {
    id: "shotengai", name: "商店街", area: rect(-108, -34, 58, -6),
    awaken: { minTotal: 30, cells: 14 },
    garland: [[-100, -17.5], [50, -17.5]],
    folk: [[-92, -13.6], [-75, -26.4], [-52, -13.6], [-44, -26.4], [-24, -13.6], [-16, -26.4], [18, -13.6], [30, -26.4], [42, -13.6]],
    stalls: [[-63, -11, Math.PI], [-35, -29, 0], [0, -30, 0]],
    cheer: "店主「妖怪さんのお通りだ！ 祭りだ、祭りだ！」",
  },
  {
    id: "east", name: "川向こう", area: rect(86, -64, 140, 20),
    awaken: { minTotal: 35, cells: 11 },
    garland: [[84, -20], [128, -20]],
    folk: [[92, -13.6], [104, -26.4], [114, -13.6], [122, -26.4]],
    stalls: [[100, -36, 0]],
    cheer: "川向こうの衆「こっちまで祭りが来たぞ！」",
  },
  {
    id: "nagaya", name: "長屋", area: rect(-112, -118, -20, -34),
    awaken: { minTotal: 30, cells: 15 },
    garland: [[-100, -67], [-25, -67]],
    folk: [[-50, -62.5], [-40, -62.5], [-75, -62.5], [-84, -73.5], [-55, -73.5], [-35, -73.5], [-100, -73.5]],
    stalls: [[-78, -64, 0]],
    cheer: "長屋のおかみさん「あらまあ、にぎやかだこと！」",
  },
  {
    id: "south", name: "大通り", area: rect(-20, -140, 48, -34),
    awaken: { minTotal: 30, cells: 11 },
    garland: [[0, -112], [0, -40]],
    folk: [[-7, -100], [7, -90], [-7, -75], [7, -55], [-7, -45]],
    stalls: [[8, -64, -Math.PI / 2]],
    cheer: "大通りの人々「なんだなんだ、祭りか？」",
  },
  {
    id: "plaza", name: "広場", area: rect(-20, -6, 48, 46),
    awaken: { minTotal: 35, cells: 8 },
    garland: [[-10, 12], [10, 12], [12, 36], [-12, 36], [-10, 12]],
    folk: [[-16, 20], [16, 20], [-16, 32], [16, 32], [0, 42]],
    stalls: [[18, 12, Math.PI], [-18, 38, 0]],
    cheer: "広場の人々「御神木の下で祭りだ！」",
  },
  {
    id: "temple", name: "寺町", area: rect(-115, -6, -20, 95),
    awaken: { minTotal: 35, cells: 12 },
    garland: [[-58, 15], [-8, 15]],
    folk: [[-50, 19], [-30, 11], [-22, 19]],
    stalls: [[-45, 21, Math.PI]],
    cheer: "お坊さん「南無…いや、これはめでたい」",
  },
  {
    id: "north", name: "北の林", area: rect(-20, 46, 48, 112),
    awaken: { minTotal: 40, cells: 11 },
    garland: [[0, 56], [0, 100]],
    folk: [[-6, 70], [6, 80], [-6, 92]],
    stalls: [[8, 66, -Math.PI / 2]],
    cheer: "参拝の人々「神社まで、祭り行列だ」",
  },
  {
    id: "inari", name: "稲荷", area: rect(86, 20, 140, 140),
    awaken: { minTotal: 40, cells: 10 },
    garland: [[84, 50], [96, 50]],
    folk: [[118, 92], [104, 90]],
    stalls: [[120, 80, Math.PI / 2]],
    cheer: "稲荷の狐たち「こん、こん！」",
  },
];

export function districtAt(x: number, z: number): DistrictDef | null {
  for (const d of DISTRICTS) if (inRect(d.area, x, z)) return d;
  return null;
}
export const DISTRICT_BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

/** 百鬼夜行で通過すると賑わいが増すランドマーク */
export interface LandmarkDef {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
}
export const LANDMARKS: LandmarkDef[] = [
  { id: "torii", name: "千本鳥居", x: 106, z: 72, r: 7 },
  { id: "redBridge", name: "太鼓橋", x: 68, z: 50, r: 6 },
  { id: "flatBridge", name: "川向こうの橋", x: 68, z: -20, r: 6 },
  { id: "shinboku", name: "御神木", x: 0, z: 25, r: 13 },
  { id: "sando", name: "参道", x: 0, z: 90, r: 6 },
  { id: "templeGate", name: "寺の門", x: -58, z: 15, r: 7 },
  { id: "yokochoGate", name: "横丁の大木戸", x: -108, z: -20, r: 6 },
];
