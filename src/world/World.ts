import type { Texture, TransformNode } from "../core/babylon";
import { BRIDGES, RIVER, WORLD, inRect } from "../data/map";
import { WorldKit } from "./WorldKit";
import { paintGround } from "./MapPainter";
import { buildEastDistrict, buildGarlands, buildNagaya, buildPlaza, buildShops, buildStalls, buildStreetLamps } from "./build/town";
import { buildInari, buildShrine, buildTemple, buildYokocho } from "./build/landmarks";
import { buildBoundary, buildGround, buildNature, buildRiver, buildSky } from "./build/nature";

/**
 * 箱庭の町。静的な部品は材質ごとに 1 メッシュへ結合し、描画コールを抑える。
 * 灯り（提灯・窓）は段階ごとのグループに分け、WorldAtmosphereDirector が点灯させる。
 * 建物（家・神社・鳥居・木・提灯…）は「建物グループ」として記録し、部品の頂点カラーのアルファに建物 ID を入れる。
 * → 結合メッシュのまま、建物単位で透過・非表示できる（StructureVisibilityDirector / StructureFadePlugin）。
 * 組み立ては WorldKit（部品）と world/build/*（場所ごと）。ここは出来上がった町への問い合わせ（歩ける・当たり・視線・高さ）と灯り・門・舟。
 */
export class World extends WorldKit {
  build() {
    buildShops(this);
    buildNagaya(this);
    buildEastDistrict(this);
    buildPlaza(this);
    buildShrine(this);
    buildTemple(this);
    buildRiver(this);
    buildInari(this);
    buildYokocho(this);
    buildStalls(this);
    buildStreetLamps(this);
    buildGarlands(this);
    buildNature(this);
    buildBoundary(this);
    buildGround(this);
    buildSky(this);
    this.flush();
  }

  // ------------------------------------------------------------------ runtime
  /** 建物の部品に使っている材質（建物の透過プラグインを付ける） */
  structureMaterials() {
    return [this.mats.static, this.offMat, this.glowWarm, this.glowWindow, this.glowViolet];
  }

  setLanternLevel(level: number) {
    for (let l = 0; l < 5; l++) {
      for (const m of this.lightGroups[l]) m.material = l <= level ? (m as any).litMat : this.offMat;
    }
  }

  /**
   * 写真で隠した分類の家の影（地面に焼き込んだもの）を消す／戻す。地面を描き直すので、変わったときだけ呼ぶ。
   * ミニマップは夜の始めに縮小した写しなので変わらない
   */
  setHouseShadowsHidden(cats: ReadonlySet<string>) {
    const key = [...cats].sort().join(",");
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    paintGround({ houses: this.houses, paddies: this.paddies }, cats, this.groundCanvas);
    this.groundTex.update(true);
  }
  private shadowKey = "";

  openYokocho() {
    this.gateCollider.on = false;
    this.yokochoNode.setEnabled(true);
  }

  /** 門扉の開きアニメーション（0→1） */
  setGateOpen(t: number) {
    for (const d of this.gateDoors) {
      const pivot = (d as any).pivot as TransformNode;
      const s = (d as any).side as number;
      pivot.rotation.y = s * t * 1.7;
    }
  }

  showBoat() {
    this.boat.setEnabled(true);
  }

  update(t: number) {
    if (this.water?.bumpTexture) (this.water.bumpTexture as Texture).vOffset = t * 0.02;
    if (this.boat.isEnabled()) {
      this.boat.position.y = Math.sin(t * 1.3) * 0.08;
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.03;
    }
  }

  groundHeight(x: number, z: number) {
    for (const b of BRIDGES) {
      if (inRect(b.r, x, z)) {
        const t = (x - b.r.x0) / (b.r.x1 - b.r.x0);
        return Math.sin(Math.PI * t) * b.arch + 0.05;
      }
    }
    return 0;
  }

  onBridge(x: number, z: number) {
    return BRIDGES.some((b) => inRect(b.r, x, z));
  }

  roofHeightAt(x: number, z: number) {
    for (const r of this.roofs) if (inRect(r.r, x, z)) return r.h;
    return 0;
  }

  isWalkable(x: number, z: number, rad = 0.4) {
    if (x < WORLD.minX + 2 || x > WORLD.maxX - 2 || z < WORLD.minZ + 2 || z > WORLD.maxZ - 2) return false;
    if (this.onBridge(x, z)) return true;
    for (const c of this.colliders) if (c.on && inRect(c.r, x, z, rad)) return false;
    return true;
  }

  /** 近くの歩ける地点（Encounter の場所・気配の妖怪の置き場所を補正する） */
  nearestWalkable(x: number, z: number, rad = 0.6) {
    if (this.isWalkable(x, z, rad) && !inRect(RIVER, x, z, 0.5)) return { x, z };
    for (let r = 1.5; r <= 24; r += 1.5) {
      const n = Math.max(8, Math.round(r * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
        if (this.isWalkable(qx, qz, rad) && !inRect(RIVER, qx, qz, 0.5)) return { x: qx, z: qz };
      }
    }
    return { x, z };
  }

  /** カメラを遮るものの高さ（家・外周の森）。低い視点のカメラが物の中に入らないように */
  cameraObstacle(x: number, z: number) {
    // 外周の森は町の縁から 10 歩ほど内側まで盛り上がっている
    const edge = Math.min(x - WORLD.minX, WORLD.maxX - x, z - WORLD.minZ, WORLD.maxZ - z);
    if (edge < 10) return 16 - Math.max(0, edge) * 0.8;
    if (inRect(RIVER, x, z)) return 0;
    for (const c of this.colliders) if (c.on && inRect(c.r, x, z)) return Math.max(4.5, this.roofHeightAt(x, z) + 1.5);
    return 0;
  }

  /**
   * (x0, z0) から (x1, z1) が見通せるか（家・塀・木・灯籠が遮る。川は遮らない）。
   * 陰陽師の視線など、低頻度の判定に使う。
   */
  lineOfSight(x0: number, z0: number, x1: number, z1: number, step = 0.8) {
    const dx = x1 - x0, dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    const n = Math.ceil(L / step);
    const bx0 = Math.min(x0, x1) - 3, bx1 = Math.max(x0, x1) + 3, bz0 = Math.min(z0, z1) - 3, bz1 = Math.max(z0, z1) + 3;
    const cols = this.colliders.filter((c) => c.on && c.r.x1 >= bx0 && c.r.x0 <= bx1 && c.r.z1 >= bz0 && c.r.z0 <= bz1 && !(c.r.x0 > RIVER.x0 - 1 && c.r.x1 < RIVER.x1 + 1));
    const circ = this.circles.filter((c) => c.r >= 0.45 && c.x >= bx0 && c.x <= bx1 && c.z >= bz0 && c.z <= bz1);
    if (!cols.length && !circ.length) return true;
    // 両端（本人の足元）は数えない
    for (let i = 1; i < n; i++) {
      const x = x0 + (dx * i) / n, z = z0 + (dz * i) / n;
      for (const c of cols) if (inRect(c.r, x, z)) return false;
      for (const c of circ) if (Math.hypot(c.x - x, c.z - z) < c.r * 0.9) return false;
    }
    return true;
  }

  /** 一時的な円形の障害物（Encounter の祠など） */
  /** 半径 r の中にある木・祠などの丸い障害物の数（集合写真の場所選び） */
  /** 近くの丸い当たり（木など）の数。ignore の円の中に中心がある当たりは数えない（写真で隠した御神木など） */
  circlesNear(x: number, z: number, r: number, ignore?: { x: number; z: number; r: number }) {
    let n = 0;
    for (const c of this.circles) {
      if (ignore && Math.hypot(c.x - ignore.x, c.z - ignore.z) <= ignore.r) continue;
      if (Math.abs(c.x - x) < r + c.r && Math.abs(c.z - z) < r + c.r && Math.hypot(c.x - x, c.z - z) < r + c.r) n++;
    }
    return n;
  }

  /** その地点を含む建物グループの ID（分類 cat のもの。無ければ 0） */
  structureAt(x: number, z: number, cat: string) {
    return this.structures.find((s) => s.cat === cat && x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1)?.id ?? 0;
  }

  addCircle(x: number, z: number, r: number) {
    const c = { x, z, r };
    this.circles.push(c);
    return () => {
      const i = this.circles.indexOf(c);
      if (i >= 0) this.circles.splice(i, 1);
    };
  }

  /** 円 vs AABB/円 の押し戻し */
  resolve(p: { x: number; z: number }, rad: number) {
    p.x = Math.min(Math.max(p.x, WORLD.minX + 2), WORLD.maxX - 2);
    p.z = Math.min(Math.max(p.z, WORLD.minZ + 2), WORLD.maxZ - 2);
    const bridge = this.onBridge(p.x, p.z);
    for (const c of this.colliders) {
      if (!c.on) continue;
      const r = c.r;
      if (p.x < r.x0 - rad || p.x > r.x1 + rad || p.z < r.z0 - rad || p.z > r.z1 + rad) continue;
      // 橋の上では川のコライダーを無視
      if (bridge && r.x0 > RIVER.x0 - 1 && r.x1 < RIVER.x1 + 1) continue;
      const cx = Math.min(Math.max(p.x, r.x0), r.x1);
      const cz = Math.min(Math.max(p.z, r.z0), r.z1);
      let dx = p.x - cx, dz = p.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > 0.0001) {
        if (d < rad) {
          p.x = cx + (dx / d) * rad;
          p.z = cz + (dz / d) * rad;
        }
      } else {
        // 中に入り込んだ：最短の辺へ
        const pushes = [p.x - r.x0 + rad, r.x1 - p.x + rad, p.z - r.z0 + rad, r.z1 - p.z + rad];
        const m = Math.min(...pushes);
        if (m === pushes[0]) p.x = r.x0 - rad;
        else if (m === pushes[1]) p.x = r.x1 + rad;
        else if (m === pushes[2]) p.z = r.z0 - rad;
        else p.z = r.z1 + rad;
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + rad;
      if (d < min && d > 0.0001) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
  }
}
