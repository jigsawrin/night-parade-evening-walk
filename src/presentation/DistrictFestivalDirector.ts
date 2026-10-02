import type { InstancedMesh } from "../core/babylon";
import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import { DISTRICTS, DISTRICT_BY_ID, districtAt, type DistrictDef } from "../data/districts";
import type { World } from "../world/World";
import type { MusicDirector } from "./audio/MusicDirector";

interface Lamp {
  x: number;
  z: number;
  y: number;
  mesh: InstancedMesh;
  lit: boolean;
}

interface Folk {
  actor: Actor;
  homeX: number;
  homeZ: number;
  child: boolean;
  /** 子供：行列についていく残り時間 */
  followT: number;
  cheerCd: number;
}

const PICK = ["villager_a", "villager_b", "villager_c"];
const LAMP_SCALE = 1.5;

/**
 * 地区覚醒の演出（Presentation）。ゲームルールは districtAwaken イベントを流すだけ。
 *  提灯が順番に灯る → 住民が店先へ出てくる → 屋台が開く → 子供が行列についてくる。
 * 人間は怖がって逃げるのではなく「祭りだ、祭りだ」と楽しげに。けれど提灯は少しだけ妖しい朱色。
 */
export class DistrictFestivalDirector {
  private lamps = new Map<string, Lamp[]>();
  private queue: { lamp: Lamp; at: number }[] = [];
  private folk: Folk[] = [];
  private stalls: { mesh: InstancedMesh; t: number }[] = [];
  private awakened = new Set<string>();
  private cords: InstancedMesh[] = [];
  private decorHidden = false;
  private folkHidden = false;
  private clock = 0;
  private boostT = 0;
  music: MusicDirector | null = null;

  constructor(private factory: ModelFactory, private world: World) {
    // 消えた祭り提灯を吊るしておく（覚醒の予兆）
    for (const d of DISTRICTS) {
      const list: Lamp[] = [];
      const pts = d.garland;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const L = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(L / 4.5));
        for (let k = 0; k <= n; k++) {
          if (i > 0 && k === 0) continue;
          const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
          const y = 4.1 + Math.sin(k * 1.7) * 0.15;
          const mesh = factory.instance("fest_lantern_off", "festLamp");
          mesh.position.set(x, y, z);
          mesh.scaling.setAll(LAMP_SCALE);
          list.push({ x, z, y, mesh, lit: false });
        }
      }
      // 提灯どうしを縄でつなぐ
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b = list[i + 1];
        const cord = factory.instance("fest_cord", "festCord");
        cord.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.45, (a.z + b.z) / 2);
        cord.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        cord.scaling.set(Math.hypot(b.x - a.x, b.z - a.z), 1, 1);
        this.cords.push(cord);
      }
      this.lamps.set(d.id, list);
    }
  }

  /** 写真から隠す：祭り提灯・縄・屋台（その他の建築物） */
  setDecorHidden(on: boolean) {
    this.decorHidden = on;
    for (const list of this.lamps.values()) for (const l of list) l.mesh.setEnabled(!on);
    for (const c of this.cords) c.setEnabled(!on);
    for (const s of this.stalls) s.mesh.setEnabled(!on);
  }
  /** 写真から隠す：店先の住民・子供（NPC） */
  setFolkHidden(on: boolean) {
    this.folkHidden = on;
    for (const f of this.folk) f.actor.setVisible(!on);
  }
  get hiddenState() {
    return { decor: this.decorHidden, folk: this.folkHidden };
  }

  /** 地区が目覚めた：プレイヤーの近くから順に灯していく */
  awaken(id: string, fromX: number, fromZ: number) {
    const d = DISTRICT_BY_ID.get(id);
    if (!d || this.awakened.has(id)) return;
    this.awakened.add(id);
    const lamps = [...(this.lamps.get(id) ?? [])].sort((a, b) => Math.hypot(a.x - fromX, a.z - fromZ) - Math.hypot(b.x - fromX, b.z - fromZ));
    lamps.forEach((lamp, i) => this.queue.push({ lamp, at: this.clock + 0.3 + i * 0.09 }));
    const delay = 0.6 + lamps.length * 0.09;
    setTimeout(() => this.bringOut(d), delay * 1000);
  }

  private bringOut(d: DistrictDef) {
    d.folk.forEach(([x, z], i) => {
      const q = this.world.nearestWalkable(x, z, 0.4);
      const child = i % 3 === 1;
      const a = new Actor(this.factory, "villager", PICK[i % PICK.length]);
      a.scale = child ? 0.72 : 1;
      a.setPos(q.x, 0, q.z);
      a.pop();
      a.happy();
      this.folk.push({ actor: a, homeX: q.x, homeZ: q.z, child, followT: child ? 45 : 0, cheerCd: Math.random() * 2 });
    });
    for (const [x, z, yaw] of d.stalls) {
      const q = this.world.nearestWalkable(x, z, 1.4);
      const m = this.factory.instance("yatai", "yatai");
      m.position.set(q.x, 0, q.z);
      m.rotation.y = yaw;
      m.scaling.setAll(0.01);
      this.stalls.push({ mesh: m, t: 0 });
    }
  }

  /**
   * @param px,pz プレイヤー位置
   * @param tailX,tailZ 行列の最後尾（子供がついてくる先）
   */
  update(dt: number, t: number, px: number, pz: number, tailX: number, tailZ: number) {
    this.clock += dt;
    // 提灯を順番に灯す
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.at > this.clock) continue;
      this.queue.splice(i, 1);
      const l = q.lamp;
      l.mesh.dispose();
      l.mesh = this.factory.instance("fest_lantern_on", "festLampLit");
      l.mesh.position.set(l.x, l.y, l.z);
      l.mesh.scaling.setAll(LAMP_SCALE);
      l.lit = true;
    }
    // 屋台が開く
    for (const s of this.stalls) {
      if (s.t >= 1) continue;
      s.t = Math.min(1, s.t + dt * 1.6);
      const e = 1 - Math.pow(1 - s.t, 3);
      s.mesh.scaling.setAll(Math.max(0.01, e));
    }
    // 住民
    for (const f of this.folk) {
      const a = f.actor;
      const d = Math.hypot(a.x - px, a.z - pz);
      if (d > 120) continue;
      let tx = f.homeX, tz = f.homeZ, sp = 0;
      if (f.child && f.followT > 0) {
        const td = Math.hypot(tailX - a.x, tailZ - a.z);
        if (td < 40) {
          f.followT -= dt;
          if (td > 3) {
            tx = tailX;
            tz = tailZ;
            sp = Math.min(6.5, 1.5 + td * 0.4);
          }
        }
      } else if (Math.hypot(a.x - f.homeX, a.z - f.homeZ) > 0.6) sp = 3;
      const mx = tx - a.x, mz = tz - a.z;
      const md = Math.hypot(mx, mz);
      if (sp > 0 && md > 0.4) {
        const step = Math.min(md, sp * dt);
        const q = { x: a.x + (mx / md) * step, z: a.z + (mz / md) * step };
        this.world.resolve(q, 0.35);
        a.face(mx, mz, dt, 8);
        a.speed = Math.hypot(q.x - a.x, q.z - a.z) / Math.max(dt, 1e-4);
        a.x = q.x;
        a.z = q.z;
      } else {
        a.speed = 0;
        if (d < 25) a.face(px - a.x, pz - a.z, dt, 4);
      }
      // 行列が通ると手を振って（跳ねて）喜ぶ
      f.cheerCd -= dt;
      if (d < 16 && f.cheerCd <= 0) {
        f.cheerCd = 1.2 + Math.random() * 1.8;
        a.happy();
      }
      a.y = this.world.groundHeight(a.x, a.z);
      a.groundY = a.y;
      a.animate(dt, t);
    }
    // 覚醒した地区の中では祭囃子が厚くなる
    this.boostT -= dt;
    if (this.boostT <= 0 && this.music) {
      this.boostT = 0.5;
      const d = districtAt(px, pz);
      this.music.setFestivalBoost(d && this.awakened.has(d.id) ? 1 : 0);
    }
  }

  get awakenedCount() {
    return this.awakened.size;
  }
}
