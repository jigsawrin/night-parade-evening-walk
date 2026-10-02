import type { Rng } from "../core/seed";
import { YOKAI } from "../data/yokaiTypes";
import { rand } from "../core/util";
import { RIVER } from "../data/map";
import type { World } from "../world/World";
import type { GameBus } from "./events";
import type { Player } from "./Player";
import type { Rule, Wild } from "./WildYokai";

/** 河童が現れる川辺の距離（歩いた合計） */
const RIVER_STEPS = [18, 50, 90, 135, 185, 240, 300];

/** WildArrivals が使う WildYokai の部品 */
export interface ArrivalHost {
  bus: GameBus;
  world: World;
  player: Player;
  /** ゲームプレイに効く位置の乱数（?seed= で再現） */
  pos: Rng;
  /** 行列の数が届いていて、姿を見せてよい種類か（ParadeAppearRules。届かない川辺の客は、その回は河童のまま） */
  ready(type: string): boolean;
  /** 野良妖怪を作って姿を見せ、町に置く（通常の妖怪だけ） */
  place(type: string, x: number, z: number, rule: Rule, perchY?: number): Wild;
}

/**
 * 町に置いておくのではなく、プレイヤーの行動に応えて現れる野良妖怪（仕様 7章）：
 *  - 河童：川辺を長く歩くと、川からぺたぺたと現れる（歩いた距離の節目ごとに一妖）。
 *    今夜の顔ぶれに川辺の通常妖怪（尻こぼしなど：NormalSpawnPlanner の river）がいれば、二妖目からその数だけ河童と入れ替わる（数は増えない）
 *  - 一反木綿：世界の層「空」が開くと、プレイヤーの少し先に舞い降りて待つ（触れると加わる。放置では加入しない）
 * 加入の判定は WildJoinRules（ここは現れ方だけ）。
 */
export class WildArrivals {
  /** 川辺を歩いた合計 */
  riverWalk = 0;
  private riverIdx = 0;
  private lastX: number;
  private lastZ: number;
  private skyQueue: number[] = [];
  private h: ArrivalHost;
  /** 河童の代わりに川辺から現れる妖怪（今夜の顔ぶれ。一妖ずつ） */
  private riverGuests: string[];

  constructor(h: ArrivalHost, riverGuests: readonly string[] = []) {
    this.h = h;
    this.riverGuests = [...riverGuests];
    this.lastX = h.player.x;
    this.lastZ = h.player.z;
  }

  /** 世界の層「空」が開いた：一反木綿が三度に分けて舞い降りる */
  openSky() {
    this.skyQueue.push(1.5, 25, 60);
  }

  update(dt: number) {
    this.updateSky(dt);
    this.updateRiver();
  }

  private updateSky(dt: number) {
    const { player, world, pos } = this.h;
    for (let i = this.skyQueue.length - 1; i >= 0; i--) {
      this.skyQueue[i] -= dt;
      if (this.skyQueue[i] > 0) continue;
      this.skyQueue.splice(i, 1);
      const px = player.x, pz = player.z;
      const ang = pos.range(0, Math.PI * 2);
      const land = world.nearestWalkable(px + Math.cos(ang) * 16, pz + Math.sin(ang) * 16);
      const w = this.h.place("ittan", land.x, land.z, { kind: "sky" }, 28);
      w.actor!.setPos(px + rand(-6, 6), 28, pz + rand(-6, 6));
      w.tx = land.x;
      w.tz = land.z;
      w.state = "descend";
    }
  }

  private updateRiver() {
    const { player, world, bus } = this.h;
    const px = player.x, pz = player.z;
    const west = px > RIVER.x0 - 8 && px < RIVER.x0;
    const east = px > RIVER.x1 && px < RIVER.x1 + 8;
    const d = Math.hypot(px - this.lastX, pz - this.lastZ);
    this.lastX = px;
    this.lastZ = pz;
    if ((west || east) && !world.onBridge(px, pz) && d < 2) {
      this.riverWalk += d;
      bus.emit("riverMeter", { v: this.riverIdx < RIVER_STEPS.length ? this.riverWalk / RIVER_STEPS[this.riverIdx] : 1 });
      if (this.riverIdx < RIVER_STEPS.length && this.riverWalk >= RIVER_STEPS[this.riverIdx]) {
        const guest = this.riverIdx >= 1 && this.riverGuests.length && this.h.ready(this.riverGuests[0]) ? this.riverGuests.shift() : undefined;
        this.riverIdx++;
        const wx = west ? RIVER.x0 + 1.5 : RIVER.x1 - 1.5;
        const fz = Math.cos(player.actor.yaw) * 4;
        const w = this.h.place(guest ?? "kappa", wx, pz + fz, { kind: "touch" });
        w.actor!.y = 0;
        w.state = "emerge";
        w.timer = 0.7;
        bus.emit("toast", { text: guest ? YOKAI[guest].talk?.appear ?? "水際で、何かが動いた…" : "川面がぺたぺたと揺れた…河童だ！" });
      }
    } else if (!(west || east)) {
      bus.emit("riverMeter", { v: -1 });
    }
  }
}
