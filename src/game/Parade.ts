import type { Actor } from "../characters/Actor";
import type { World } from "../world/World";
import { rand } from "../core/util";
import { followerOffsets, pairGap } from "./ParadeSpacing";

interface Follower {
  actor: Actor;
  /** 加入アニメーション */
  joinT: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  lastX: number;
  lastZ: number;
  arc: number;
}

interface Stray {
  actor: Actor;
  t: number;
  vx: number;
  vz: number;
  state: "flee" | "wait" | "return";
  stuck: number;
}

/**
 * 百鬼夜行の本体（仕様 8章）。
 * 先頭の移動軌跡を距離ベースで記録し、各妖怪は先頭から「前の妖怪との間隔」を積み重ねた距離だけ後ろの軌跡上の点を目標にする。
 * 間隔はふつう spacing。大きな妖怪（Actor.scale）の前後だけ広がる（ParadeSpacing）。
 * 経路探索なし・軽量・長い S 字や蛇行が自然にできる。
 */
export class Parade {
  followers: Follower[] = [];
  strays: Stray[] = [];
  /** 基本の間隔（ふつうの大きさの妖怪どうし） */
  spacing = 1.3;
  /** 先頭から i 番目の妖怪までの軌跡上の距離（大きさを含めて毎フレーム積み直す） */
  private offsets: number[] = [];
  private scales: number[] = [];
  private px: number[] = [];
  private pz: number[] = [];
  private pd: number[] = [];
  private head = 0; // 先頭の累積距離
  private readonly step = 0.22;

  constructor(private world: World, startX: number, startZ: number, dirX = 0, dirZ = 1) {
    // 開始直後の加入でも行列の形になるよう、背後に軌跡を敷いておく
    const len = 40;
    for (let d = len; d > 0; d -= this.step) this.pushPoint(startX - dirX * d, startZ - dirZ * d);
    this.pushPoint(startX, startZ);
  }

  get count() {
    return this.followers.length;
  }
  /** 主人公を含む総数（妖） */
  get total() {
    return this.followers.length + 1;
  }
  get headDistance() {
    return this.head;
  }

  private pushPoint(x: number, z: number) {
    const n = this.px.length;
    if (n > 0) this.head += Math.hypot(x - this.px[n - 1], z - this.pz[n - 1]);
    this.px.push(x);
    this.pz.push(z);
    this.pd.push(this.head);
  }

  record(x: number, z: number) {
    const n = this.px.length;
    const dx = x - this.px[n - 1], dz = z - this.pz[n - 1];
    const d = Math.hypot(dx, dz);
    if (d >= this.step) this.pushPoint(x, z);
    // 古い軌跡を捨てる
    const keep = this.offsetOf(this.followers.length) + (this.strays.length + 12) * this.spacing + 30;
    if (this.pd.length > 4000 || this.pd[0] < this.head - keep * 1.5) {
      let cut = 0;
      while (cut < this.pd.length - 2 && this.pd[cut] < this.head - keep) cut++;
      if (cut > 0) {
        this.px.splice(0, cut);
        this.pz.splice(0, cut);
        this.pd.splice(0, cut);
      }
    }
  }

  /** 累積距離 d における軌跡上の点 */
  sample(d: number, out: { x: number; z: number; dx: number; dz: number }) {
    const pd = this.pd;
    const n = pd.length;
    if (d <= pd[0]) {
      out.x = this.px[0];
      out.z = this.pz[0];
      out.dx = this.px[1] - this.px[0];
      out.dz = this.pz[1] - this.pz[0];
      return out;
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pd[mid] < d) lo = mid;
      else hi = mid;
    }
    const span = pd[hi] - pd[lo] || 1;
    const t = Math.min(1, Math.max(0, (d - pd[lo]) / span));
    out.x = this.px[lo] + (this.px[hi] - this.px[lo]) * t;
    out.z = this.pz[lo] + (this.pz[hi] - this.pz[lo]) * t;
    out.dx = this.px[hi] - this.px[lo];
    out.dz = this.pz[hi] - this.pz[lo];
    return out;
  }

  add(actor: Actor) {
    this.followers.push({
      actor, joinT: 0, fromX: actor.x, fromY: actor.y, fromZ: actor.z, lastX: actor.x, lastZ: actor.z, arc: 2.2,
    });
    actor.pop();
  }

  /** 最後尾から n 体を散らす（犬などに驚かされたとき） */
  scatter(n: number, fromX: number, fromZ: number) {
    const out: Actor[] = [];
    for (let i = 0; i < n && this.followers.length > 0; i++) {
      const f = this.followers.pop()!;
      const a = f.actor;
      let vx = a.x - fromX, vz = a.z - fromZ;
      const l = Math.hypot(vx, vz) || 1;
      const ang = Math.atan2(vz, vx) + rand(-1.2, 1.2);
      vx = Math.cos(ang) * 7;
      vz = Math.sin(ang) * 7;
      void l;
      a.surprise();
      this.strays.push({ actor: a, t: rand(0.6, 1.1), vx, vz, state: "flee", stuck: 0 });
      out.push(a);
    }
    return out;
  }

  /**
   * 陰陽師に祓われる：後ろ半分から n 体を行列から外す（keep が true の妖怪＝大妖怪は残る）。
   * 散った妖怪と違って自分では戻らない。外した Actor は呼び出し側が町のどこかへ置き直す。
   */
  purge(n: number, keep: (a: Actor) => boolean): Actor[] {
    const out: Actor[] = [];
    const half = Math.floor(this.followers.length / 2);
    for (let i = this.followers.length - 1; i >= 0 && out.length < n; i--) {
      if (i < half && out.length > 0) break;
      const a = this.followers[i].actor;
      if (keep(a)) continue;
      this.followers.splice(i, 1);
      out.push(a);
    }
    // 後ろ半分が大妖怪ばかりなら前からも
    for (let i = this.followers.length - 1; i >= 0 && out.length < n; i--) {
      const a = this.followers[i].actor;
      if (keep(a)) continue;
      this.followers.splice(i, 1);
      out.push(a);
    }
    return out;
  }

  /** 各妖怪の目標の距離を、今の顔ぶれの大きさで積み直す（加入・散る・祓われるで顔ぶれが変わる） */
  private layout() {
    const n = this.followers.length;
    this.scales.length = n;
    for (let i = 0; i < n; i++) this.scales[i] = this.followers[i].actor.scale;
    followerOffsets(this.scales, this.spacing, 1, this.offsets);
  }

  /**
   * 先頭から i 番目の妖怪までの軌跡上の距離（i = 人数なら最後尾のさらに一つ後ろ：戻ってくる妖怪の行き先）。
   * update の間に積み直した値（顔ぶれが変わった直後の一フレームは古いことがある）
   */
  offsetOf(i: number) {
    const n = Math.min(this.offsets.length, this.followers.length);
    if (i < n) return this.offsets[i];
    const last = n ? this.offsets[n - 1] : 0;
    const lastScale = n ? this.scales[n - 1] : 1;
    return last + pairGap(lastScale, 1, this.spacing) + (i - n) * this.spacing;
  }

  /** 最後尾の位置 */
  tail(out: { x: number; z: number; dx: number; dz: number }) {
    return this.sample(this.head - this.offsetOf(this.followers.length), out);
  }

  /** 行列全体の外接矩形 */
  bounds(hx: number, hz: number) {
    let x0 = hx, x1 = hx, z0 = hz, z1 = hz;
    for (const f of this.followers) {
      const a = f.actor;
      if (a.x < x0) x0 = a.x;
      if (a.x > x1) x1 = a.x;
      if (a.z < z0) z0 = a.z;
      if (a.z > z1) z1 = a.z;
    }
    return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, size: Math.max(x1 - x0, z1 - z0) };
  }

  private tmp = { x: 0, z: 0, dx: 0, dz: 0 };

  update(dt: number, t: number, onRejoin: (a: Actor) => void) {
    const s = this.tmp;
    this.layout();
    for (let i = 0; i < this.followers.length; i++) {
      const f = this.followers[i];
      const a = f.actor;
      this.sample(this.head - this.offsets[i], s);
      // 少しだけ左右に揺らして「行列らしさ」を出す
      const l = Math.hypot(s.dx, s.dz) || 1;
      const nx = -s.dz / l, nz = s.dx / l;
      const sway = Math.sin(t * 1.3 + i * 0.7) * 0.18;
      let tx = s.x + nx * sway;
      let tz = s.z + nz * sway;
      let ty = this.world.groundHeight(tx, tz);

      if (f.joinT < 1) {
        // 加入：放物線を描いて列へ飛び込む
        f.joinT = Math.min(1, f.joinT + dt / (f.arc > 3 ? 1.0 : 0.65));
        const p = f.joinT;
        const e = p * p * (3 - 2 * p);
        tx = f.fromX + (tx - f.fromX) * e;
        tz = f.fromZ + (tz - f.fromZ) * e;
        ty = f.fromY + (ty - f.fromY) * e + Math.sin(p * Math.PI) * f.arc;
        a.x = tx;
        a.z = tz;
        a.y = ty;
      } else {
        const k = 1 - Math.exp(-14 * dt);
        a.x += (tx - a.x) * k;
        a.z += (tz - a.z) * k;
        a.y = ty;
      }
      const mdx = a.x - f.lastX, mdz = a.z - f.lastZ;
      const sp = Math.hypot(mdx, mdz) / Math.max(dt, 1e-4);
      a.speed += (sp - a.speed) * Math.min(1, dt * 8);
      if (sp > 0.3) a.face(mdx, mdz, dt, 10);
      f.lastX = a.x;
      f.lastZ = a.z;
      a.groundY = a.y;
      a.animate(dt, t);
    }

    // 散った妖怪：しばらくすると最後尾へ戻ってくる
    for (let i = this.strays.length - 1; i >= 0; i--) {
      const st = this.strays[i];
      const a = st.actor;
      st.t -= dt;
      if (st.state === "flee") {
        const p = { x: a.x + st.vx * dt, z: a.z + st.vz * dt };
        this.world.resolve(p, 0.4);
        a.face(p.x - a.x, p.z - a.z, dt, 12);
        a.speed = 7;
        a.x = p.x;
        a.z = p.z;
        if (st.t <= 0) {
          st.state = "wait";
          st.t = rand(4, 7);
        }
      } else if (st.state === "wait") {
        a.speed = 0;
        a.yaw += Math.sin(t * 3 + a.seed) * dt;
        if (st.t <= 0) st.state = "return";
      } else {
        this.tail(s);
        const dx = s.x - a.x, dz = s.z - a.z;
        const d = Math.hypot(dx, dz);
        const v = 11;
        if (d < 1.2) {
          this.strays.splice(i, 1);
          this.add(a);
          onRejoin(a);
          continue;
        }
        const p = { x: a.x + (dx / d) * v * dt, z: a.z + (dz / d) * v * dt };
        if (d > 60) {
          // 遠すぎたら一気に近くへ
          p.x = s.x - (dx / d) * 20;
          p.z = s.z - (dz / d) * 20;
        }
        this.world.resolve(p, 0.3);
        a.face(dx, dz, dt, 12);
        a.speed = v;
        // 建物に阻まれたら、屋根を飛び越えて列へ戻る
        const moved = Math.hypot(p.x - a.x, p.z - a.z);
        st.stuck = moved < v * dt * 0.3 ? st.stuck + dt : 0;
        a.x = p.x;
        a.z = p.z;
        if (st.stuck > 0.6) {
          this.strays.splice(i, 1);
          this.add(a);
          this.followers[this.followers.length - 1].arc = Math.min(8, 3 + d * 0.2);
          onRejoin(a);
          continue;
        }
      }
      a.y = this.world.groundHeight(a.x, a.z);
      a.groundY = a.y;
      a.animate(dt, t);
    }
  }

  /** プレイヤーが散った妖怪に触れたら即復帰 */
  touchStrays(x: number, z: number, onRejoin: (a: Actor) => void) {
    for (let i = this.strays.length - 1; i >= 0; i--) {
      const a = this.strays[i].actor;
      if (Math.hypot(a.x - x, a.z - z) < 1.8) {
        this.strays.splice(i, 1);
        this.add(a);
        onRejoin(a);
      }
    }
  }

  /** 先頭から距離 d を通過済みの人数（行列アクティビティ用） */
  passedCount(dMark: number) {
    let n = 0;
    for (let i = 0; i < this.followers.length; i++) if (this.head - this.offsetOf(i) >= dMark) n++;
    return n;
  }
}
