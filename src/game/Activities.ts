import { ACTIVITIES, type ActivityDef } from "../data/activities";
import { wrapAngle } from "../core/util";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { GameBus } from "./events";

interface State {
  def: ActivityDef;
  done: boolean;
  /** passage: 入口を通った時点の先頭距離 */
  entryD: number;
  /** passage: 出口を通った時点の先頭距離（-1 = まだ） */
  exitD: number;
  total: number;
  /** circle: 累積角度 */
  angle: number;
  lastA: number;
  inside: boolean;
}

/** 行列アクティビティ（鳥居を全員で通過・橋を渡る・広場を一周…） */
export class Activities {
  states: State[];

  constructor(private bus: GameBus, private parade: Parade, private player: Player) {
    this.states = ACTIVITIES.map((def) => ({ def, done: false, entryD: -1, exitD: -1, total: 0, angle: 0, lastA: 0, inside: false }));
  }

  update() {
    const px = this.player.x, pz = this.player.z;
    const head = this.parade.headDistance;
    for (const s of this.states) {
      if (s.done) continue;
      const d = s.def;
      if (d.kind === "passage") {
        const inEntry = Math.hypot(px - d.entry[0], pz - d.entry[1]) < d.radius;
        const inExit = Math.hypot(px - d.exit[0], pz - d.exit[1]) < d.radius;
        if (s.exitD < 0) {
          if (inEntry) s.entryD = head;
          if (s.entryD >= 0 && head - s.entryD > d.maxTrail) s.entryD = -1;
          if (inExit && s.entryD >= 0) {
            if (this.parade.count < d.minFollowers) {
              if (!s.inside) this.bus.emit("toast", { text: `${d.title}には、あと${d.minFollowers - this.parade.count}妖ほど足りない…` });
              s.inside = true;
              s.entryD = -1;
              continue;
            }
            s.exitD = head;
            s.total = this.parade.count;
            this.bus.emit("activityProgress", { id: d.id, title: d.title, done: 0, total: s.total });
          }
          if (!inExit) s.inside = false;
        } else {
          const passed = Math.min(s.total, this.parade.passedCount(s.exitD));
          this.bus.emit("activityProgress", { id: d.id, title: d.title, done: passed, total: s.total });
          if (passed >= s.total || passed >= this.parade.count) {
            s.done = true;
            this.bus.emit("activityComplete", { id: d.id, title: d.title, reward: d.reward });
          } else if (head - s.exitD > this.parade.offsetOf(s.total) + 40) {
            // 途中で引き返すなどしても罰はない。もう一度挑戦できる
            s.exitD = -1;
            s.entryD = -1;
            this.bus.emit("activityFail", { id: d.id, title: d.title });
          }
        }
      } else {
        const r = Math.hypot(px - d.x, pz - d.z);
        const a = Math.atan2(pz - d.z, px - d.x);
        if (r > d.rMin && r < d.rMax) {
          if (!s.inside) {
            s.inside = true;
            s.angle = 0;
          } else {
            s.angle += wrapAngle(a - s.lastA);
          }
          const prog = Math.min(1, Math.abs(s.angle) / (Math.PI * 2));
          if (prog > 0.08 && this.parade.count >= d.minFollowers) {
            this.bus.emit("activityProgress", { id: d.id, title: d.title, done: Math.floor(prog * 100), total: 100 });
          }
          if (prog >= 1) {
            if (this.parade.count >= d.minFollowers) {
              s.done = true;
              this.bus.emit("activityComplete", { id: d.id, title: d.title, reward: d.reward });
            } else {
              this.bus.emit("toast", { text: `御神木「もう少し賑やかな行列で回っておくれ（${d.minFollowers}妖以上）」` });
              s.angle = 0;
            }
          }
        } else if (s.inside) {
          s.inside = false;
          s.angle = 0;
          this.bus.emit("activityProgress", { id: d.id, title: d.title, done: -1, total: 100 });
        }
        s.lastA = a;
      }
    }
  }

  get completed() {
    return this.states.filter((s) => s.done).map((s) => s.def.title);
  }
}
