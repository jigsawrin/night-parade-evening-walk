/** 行列アクティビティ（仕様 9章）。行列そのものを遊びにする。 */
export interface Reward { type: string; n: number }

export type ActivityDef =
  | {
      id: string;
      kind: "passage";
      title: string;
      /** 入口 → 出口（プレイヤーがこの順に通る） */
      entry: [number, number];
      exit: [number, number];
      radius: number;
      minFollowers: number;
      reward: Reward;
      /** 入口から出口までに許される最大移動距離（寄り道しすぎると無効） */
      maxTrail: number;
    }
  | {
      id: string;
      kind: "circle";
      title: string;
      x: number;
      z: number;
      rMin: number;
      rMax: number;
      minFollowers: number;
      reward: Reward;
    };

export const ACTIVITIES: ActivityDef[] = [
  {
    id: "senbon", kind: "passage", title: "千本鳥居を全員で通り抜ける",
    entry: [96, 52], exit: [110, 92], radius: 6, minFollowers: 6,
    reward: { type: "kitsune", n: 3 }, maxTrail: 90,
  },
  {
    id: "bridge", kind: "passage", title: "太鼓橋を全員で渡る",
    entry: [52, 50], exit: [84, 50], radius: 5, minFollowers: 8,
    reward: { type: "kappa", n: 2 }, maxTrail: 60,
  },
  {
    id: "shotengai", kind: "passage", title: "商店街を一列で抜ける",
    entry: [-100, -20], exit: [50, -20], radius: 6, minFollowers: 12,
    reward: { type: "nekomata", n: 3 }, maxTrail: 230,
  },
  {
    id: "plaza", kind: "circle", title: "広場の御神木を一周する",
    x: 0, z: 25, rMin: 4, rMax: 15, minFollowers: 10,
    reward: { type: "oni", n: 4 },
  },
];
