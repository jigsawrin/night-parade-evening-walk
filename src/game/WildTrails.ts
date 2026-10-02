import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import type { World } from "../world/World";
import type { Player } from "./Player";

/**
 * 細い蜘蛛の糸の道（絡新婦）：橋や水辺に、白く細い糸が一本だけ見える。そばを通ると糸がきらりと揺れ、次の糸が見える。
 * すべて辿ると、その先で潜んでいた妖怪が姿を見せる（done）。狐火の道しるべ（光・音で先へ誘う Encounter）とは別もので、
 * 光らない細い糸と小さな蜘蛛だけ。案内の一覧（ヒント・ミニマップ・Pacing）には入れない。
 * 糸は小道具（Actor の使い回しの型 "silk"）で、辿り終えてもその夜は残る。
 */
interface Trail {
  pts: [number, number][];
  strands: Actor[];
  next: number;
  done: () => void;
}

/** 糸に気づく距離（歩） */
const TOUCH_R = 2.6;

export class WildTrails {
  private list: Trail[] = [];

  constructor(private factory: ModelFactory, private world: World, private player: Player) {}

  /** 糸の道を張る（最初の一本だけ見せる） */
  add(pts: readonly [number, number][], done: () => void) {
    const t: Trail = { pts: pts.map(([x, z]) => this.snap(x, z)), strands: [], next: 0, done };
    this.show(t, 0);
    this.list.push(t);
  }

  private snap(x: number, z: number): [number, number] {
    if (this.world.isWalkable(x, z, 0.5)) return [x, z];
    const q = this.world.nearestWalkable(x, z);
    return [q.x, q.z];
  }

  private show(t: Trail, i: number) {
    const [x, z] = t.pts[i];
    const a = new Actor(this.factory, "silk", "silk");
    a.setPos(x, this.world.groundHeight(x, z), z);
    a.groundY = a.y;
    // 次の糸の方へ少し傾ける（道の向きが分かる程度）
    const n = t.pts[i + 1];
    a.yaw = n ? Math.atan2(n[0] - x, n[1] - z) : Math.random() * Math.PI * 2;
    t.strands.push(a);
  }

  update(dt: number, time: number) {
    const px = this.player.x, pz = this.player.z;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const t = this.list[k];
      for (const a of t.strands) a.animate(dt, time);
      const [x, z] = t.pts[t.next];
      if (Math.hypot(px - x, pz - z) > TOUCH_R) continue;
      t.strands[t.next].pop();
      t.next++;
      if (t.next < t.pts.length) this.show(t, t.next);
      else {
        this.list.splice(k, 1);
        t.done();
      }
    }
  }
}
