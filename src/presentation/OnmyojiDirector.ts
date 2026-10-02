import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, type Scene } from "../core/babylon";
import type { VFXDirector } from "./VFXDirector";

/** 陣を描く陰陽師（ゲームルールの状態を読むだけ） */
export interface SealCaster {
  def: { id: string };
  actor: { x: number; z: number };
  state: string;
}

interface Seal {
  mesh: Mesh;
  /** 今の濃さと目標の濃さ */
  a: number;
  goal: number;
  spin: number;
}

const TEX = 512;
/** 九字 */
const KUJI = "臨兵闘者皆陣列在前";

/** 地面に描く陰陽の陣：外輪・九字・晴明桔梗（五芒星）・太極。墨と朱と淡い金で、夜の地面に浮かぶように */
function drawSeal(c: CanvasRenderingContext2D) {
  const S = TEX, cx = S / 2, cy = S / 2, R = S / 2 - 8;
  c.clearRect(0, 0, S, S);
  const ink = "rgba(255,236,196,0.95)";
  const shu = "rgba(255,112,72,0.95)";
  const ring = (r: number, w: number, col: string) => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
  };
  ring(R, 7, ink);
  ring(R - 15, 2.5, ink);
  // 九字（臨兵闘者皆陣列在前）を二巡り
  c.fillStyle = ink;
  c.font = `bold ${Math.round(S * 0.058)}px "Shippori Mincho", "Yu Mincho", serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const kuji = KUJI;
  for (let i = 0; i < 18; i++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((i / 18) * Math.PI * 2);
    c.fillText(kuji[i % 9], 0, -(R - 38));
    c.restore();
  }
  ring(R - 62, 2.5, ink);
  // 晴明桔梗（五芒星）
  const pr = R - 66;
  c.strokeStyle = shu;
  c.lineWidth = 5;
  c.lineJoin = "round";
  c.beginPath();
  for (let k = 0; k <= 5; k++) {
    const a = -Math.PI / 2 + ((k * 2) % 5) * ((Math.PI * 2) / 5);
    const x = cx + Math.cos(a) * pr, y = cy + Math.sin(a) * pr;
    if (k === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  // 中央の太極（陰陽）
  const r = R * 0.24;
  ring(r + 8, 3, ink);
  c.fillStyle = "rgba(210,70,56,0.9)";
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,238,205,0.95)";
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);
  c.arc(cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true);
  c.arc(cx, cy - r / 2, r / 2, Math.PI / 2, (Math.PI * 3) / 2, false);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(cx, cy + r / 2, r / 7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(210,70,56,0.9)";
  c.beginPath();
  c.arc(cx, cy - r / 2, r / 7, 0, Math.PI * 2);
  c.fill();
}

/**
 * 陰陽師の陣（Presentation）。ゲームルールは onmyoji* のイベントを流すだけで、ここが地面に陣を描く。
 *  - 詠唱中：陰陽師の足元に小さな陣がくるくると
 *  - 合体魔法陣：二人の足元の陣と、参道を塞ぐ大きな陣（張る前は薄く、張られると濃く、ゆっくり回る）
 * 陣は板ポリのプール（小 3・大 1）を使い回す。光らせすぎない（グローから外す）。
 */
export class OnmyojiDirector {
  private small = new Map<string, Seal>();
  private big: Seal;
  private mat: StandardMaterial;
  private rimT = 0;
  private bx = 0;
  private bz = 0;
  private br = 1;
  private on = false;

  constructor(private scene: Scene, private vfx: VFXDirector, private exclude: (m: Mesh) => void) {
    const tex = new DynamicTexture("onmyojiSeal", { width: TEX, height: TEX }, scene, true);
    drawSeal(tex.getContext() as unknown as CanvasRenderingContext2D);
    tex.update(true);
    // 九字の書体（同梱フォント）が読み込まれたら描き直す
    document.fonts?.load('bold 30px "Shippori Mincho"', KUJI).then(() => {
      drawSeal(tex.getContext() as unknown as CanvasRenderingContext2D);
      tex.update(true);
    }, () => {});
    tex.hasAlpha = true;
    const m = new StandardMaterial("onmyojiSealMat", scene);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.emissiveTexture = tex;
    m.opacityTexture = tex;
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    m.zOffset = -2;
    this.mat = m;
    this.big = this.makeSeal("onmyojiBarrier");
  }

  private makeSeal(name: string): Seal {
    const mesh = MeshBuilder.CreateGround(name, { width: 1, height: 1 }, this.scene);
    mesh.material = this.mat;
    mesh.isPickable = false;
    mesh.visibility = 0;
    mesh.setEnabled(false);
    this.exclude(mesh);
    return { mesh, a: 0, goal: 0, spin: 0.3 };
  }

  /** 合体魔法陣 */
  barrier(phase: "form" | "on" | "off", x: number, z: number, r: number) {
    this.bx = x;
    this.bz = z;
    this.br = r;
    this.on = phase === "on";
    const b = this.big;
    b.goal = phase === "on" ? 0.8 : phase === "form" ? 0.22 : 0;
    b.mesh.position.set(x, 0.07, z);
    b.mesh.scaling.set(r * 2, 1, r * 2);
    if (phase === "on") {
      // 陣が張られる瞬間：縁から護符（和紙）がふわっと舞う
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.vfx.burst("washi", x + Math.cos(a) * r, 0.6, z + Math.sin(a) * r, 5, i * 0.05);
      }
    }
  }

  /** 夜が終わった：陣を消す */
  clear() {
    this.big.goal = 0;
    this.on = false;
    for (const s of this.small.values()) s.goal = 0;
  }

  update(dt: number, casters: readonly SealCaster[]) {
    for (const g of casters) {
      const casting = g.state === "cast" || g.state === "barrier" || g.state === "form";
      let s = this.small.get(g.def.id);
      if (!s) {
        if (!casting) continue;
        s = this.makeSeal(`onmyojiSeal_${g.def.id}`);
        this.small.set(g.def.id, s);
      }
      s.goal = g.state === "cast" ? 0.9 : casting ? 0.6 : 0;
      s.spin = g.state === "cast" ? 2.4 : 0.8;
      s.mesh.position.set(g.actor.x, 0.08, g.actor.z);
      s.mesh.scaling.set(3.2, 1, 3.2);
    }
    for (const s of [...this.small.values(), this.big]) {
      s.a += (s.goal - s.a) * Math.min(1, dt * (s.goal > s.a ? 3 : 2));
      const vis = s.a > 0.01;
      if (vis !== s.mesh.isEnabled()) s.mesh.setEnabled(vis);
      if (!vis) continue;
      s.mesh.visibility = s.a;
      s.mesh.rotation.y += dt * s.spin * (s === this.big ? 0.4 : 1);
    }
    // 張られている間、ときどき縁から護符がひらり（控えめに）
    if (this.on) {
      this.rimT -= dt;
      if (this.rimT <= 0) {
        this.rimT = 1.4;
        const a = Math.random() * Math.PI * 2;
        this.vfx.burst("washi", this.bx + Math.cos(a) * this.br, 0.4, this.bz + Math.sin(a) * this.br, 3);
      }
    }
  }
}
