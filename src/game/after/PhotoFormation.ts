/**
 * PhotoFormationSystem：百鬼夜行全体を写真向けに並べる（集合写真）。
 * 新しい妖怪は作らない。今の行列の Actor 一妖ずつに「立ち位置（slot）」を返すだけ（並べ直しは AfterNight 側）。
 * 配置は決定的（同じ人数・同じ構成なら同じ並び）。陣形の一覧は data/photo.ts の FORMATIONS。
 *
 * 座標：anchor を原点に、F = 行列が向く正面（カメラのいる側）、R = 横。world = anchor + R·u + F·v。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import type { Family, FormationDef } from "../../data/photo";
import type { PhotoRole, YokaiRank } from "../../data/yokaiTypes";
import { bodyRadius, centerOutPositions, pairGap, rowExtent } from "../ParadeSpacing";

export interface FormationMember {
  typeId: string;
  family: Family;
  scale: number;
  /** 今の位置（大行列はそのまま使う） */
  x: number;
  z: number;
  yaw: number;
  /** 写真での立ち位置（大妖怪。無ければ normal）と格（同じ立ち位置どうしの並び：三大妖怪を中央へ。隠しは格ではないので使わない） */
  photoRole?: PhotoRole;
  rank?: YokaiRank;
}

/** 同じ立ち位置のとき、中央に近いほうから */
const RANK_ORDER: Record<YokaiRank, number> = { threeGreat: 0, greater: 1, normal: 2 };

export interface Slot {
  x: number;
  z: number;
  /** 地面からの持ち上げ（雛壇の段・浮く妖怪の高さ） */
  lift: number;
  /** 向き（Actor.yaw と同じ：atan2(dx, dz)） */
  yaw: number;
  /** 何列目か（0 = 最前列） */
  row: number;
}

export interface FormationContext {
  anchorX: number;
  anchorZ: number;
  /** 正面（単位ベクトル） */
  fx: number;
  fz: number;
  /** 主人公の今の位置・向き（大行列用） */
  hero: { x: number; z: number; yaw: number };
}

export interface FormationResult {
  hero: Slot;
  /** members と同じ順番・同じ数 */
  slots: Slot[];
}

/** 背の高さの分類（雛壇：前 0 小さい → 1 普通 → 2 背が高い、3 浮く） */
export function heightClass(m: Pick<FormationMember, "family" | "scale" | "typeId">): 0 | 1 | 2 | 3 {
  if (m.family === "FLOAT") return 3;
  if (m.family === "SPECIAL" || m.scale >= 1.1) return 2;
  if (m.scale < 0.95) return 0;
  return 1;
}

/** 決定的な小さなばらつき（i ごとに -1..1） */
function jitter(i: number, salt: number) {
  const s = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function layoutFormation(def: FormationDef, members: readonly FormationMember[], c: FormationContext): FormationResult {
  const fx = c.fx, fz = c.fz;
  const rx = fz, rz = -fx;
  const faceYaw = Math.atan2(fx, fz);
  const at = (u: number, v: number, lift: number, yaw: number, row: number): Slot => ({
    x: c.anchorX + rx * u + fx * v, z: c.anchorZ + rz * u + fz * v, lift, yaw, row,
  });
  const n = members.length;
  const sp = def.spacing;
  const slots: Slot[] = new Array(n);
  let hero = at(0, 1.8, 0, faceYaw, 0);

  // 背の低い順（前列ほど小さい）に並べる順番
  const order = members.map((m, i) => ({ i, h: heightClass(m) })).sort((a, b) => a.h - b.h || a.i - b.i);
  const floatLift = (m: FormationMember) => (m.family === "FLOAT" ? 1.2 : 0);

  switch (def.layout) {
    case "trail": {
      // 大行列：今の隊列のまま（向きもそのまま）
      hero = { x: c.hero.x, z: c.hero.z, lift: 0, yaw: c.hero.yaw, row: 0 };
      members.forEach((m, i) => (slots[i] = { x: m.x, z: m.z, lift: 0, yaw: m.yaw, row: 0 }));
      break;
    }
    case "fan": {
      // 扇の陣：主人公を手前中央、後ろへ扇状に。前ほど小さい妖怪
      const half = (75 * Math.PI) / 180;
      let k = 0, row = 0;
      while (k < n) {
        const r = 3 + row * sp * 1.15;
        const cap = Math.max(1, Math.floor((r * 2 * half) / sp) + 1);
        const cnt = Math.min(cap, n - k);
        for (let j = 0; j < cnt; j++) {
          const { i } = order[k + j];
          const th = cnt === 1 ? 0 : -half + (2 * half * j) / (cnt - 1);
          const th2 = th + (row % 2 ? half / Math.max(2, cap) : 0) * 0.5;
          slots[i] = at(r * Math.sin(th2), 1.5 - r * Math.cos(th2), floatLift(members[i]) + row * 0.12, faceYaw, row);
        }
        k += cnt;
        row++;
      }
      break;
    }
    case "ring": {
      // 祭りの輪：主人公を中心に、同心の楕円。輪に沿って踊る向き
      hero = at(0, 0, 0, faceYaw, 0);
      let k = 0, row = 0;
      while (k < n) {
        const R = 5 + row * 1.8;
        const cap = Math.max(3, Math.floor((2 * Math.PI * R) / sp));
        const cnt = Math.min(cap, n - k);
        for (let j = 0; j < cnt; j++) {
          const { i } = order[k + j];
          const a = (j / cnt) * Math.PI * 2 + row * 0.35;
          const u = Math.cos(a) * R * 1.25, v = Math.sin(a) * R;
          // 接線方向（反時計回りに踊る）
          const tu = -Math.sin(a) * 1.25, tv = Math.cos(a);
          const wx = rx * tu + fx * tv, wz = rz * tu + fz * tv;
          slots[i] = at(u, v, members[i].family === "FLOAT" ? 1.6 : 0, Math.atan2(wx, wz), row);
        }
        k += cnt;
        row++;
      }
      break;
    }
    case "tiers": {
      // 雛壇：前（小）→ 中央（普通）→ 後ろ（背が高い）→ 上空（浮く）。互い違いに並べて頭が重ならないように
      // 大妖怪・三大妖怪は写真で埋もれないよう、立ち位置（photoRole）ごとに特等席へ：
      //  flank 主人公の両脇／centerpiece 主人公のすぐ後ろの中央／rear 最後列の後ろの中央の高い所／air 上空のいちばん上の中央
      // 特等席の真後ろの一列は、中央を空けて通常の妖怪が隠れないようにする
      const perRow = Math.max(8, Math.ceil(Math.sqrt(n) * 1.6));
      const role = (i: number) => members[i].photoRole ?? "normal";
      const byRole = (r: PhotoRole) =>
        order.filter((o) => role(o.i) === r).sort((a, b) => RANK_ORDER[members[a.i].rank ?? "normal"] - RANK_ORDER[members[b.i].rank ?? "normal"] || a.i - b.i);
      const ground = order.filter((o) => o.h < 3 && role(o.i) === "normal");
      const air = order.filter((o) => o.h === 3 && role(o.i) === "normal");
      const honorSp = sp * 1.8;
      // 特等席は中央から外へ（0, +1, -1, +2, -2 …）。隣どうしは最低 honorSp、大きな妖怪（scale）の隣はその分だけ広げる（ParadeSpacing）
      const scaleOf = (list: typeof order) => list.map(({ i }) => members[i].scale);
      const honorRow = (list: typeof order) => centerOutPositions(scaleOf(list), honorSp);
      // 特等席の真後ろ（上）の列で、中央を空ける幅：今までの幅と、特等席の妖怪の端のうち広いほう
      const bandGap = (list: typeof order, u: number[]) =>
        list.length ? Math.max(Math.ceil((list.length - 1) / 2) * honorSp + honorSp * 0.75, rowExtent(u, scaleOf(list)) + sp * 0.3) : 0;
      let row = 0;
      const placeRows = (list: typeof order, baseV: number, baseLift: number, dv: number, dLift: number, gap = 0) => {
        let r = 0;
        for (let k = 0; k < list.length; k += perRow) {
          const chunk = list.slice(k, k + perRow);
          const stagger = r % 2 ? sp * 0.5 : 0;
          if (r === 0 && gap > 0) {
            // 中央を空け、左右へ振り分ける
            chunk.forEach(({ i }, j) => {
              const side = j % 2 ? -1 : 1;
              slots[i] = at(side * (gap + sp * 0.5 + Math.floor(j / 2) * sp), baseV, baseLift, faceYaw, row);
            });
          } else {
            const w = (chunk.length - 1) * sp;
            chunk.forEach(({ i }, j) => {
              slots[i] = at(-w / 2 + j * sp + stagger, baseV - r * dv, baseLift + r * dLift, faceYaw, row);
            });
          }
          r++;
          row++;
        }
        return r;
      };
      // 両脇：主人公の右・左へ交互に。外へ行くほど、隣との間隔（大きさ込み）を積む
      const sideEdge = [0, 0], sidePrev = [1, 1];
      byRole("flank").forEach(({ i }, k) => {
        const side = k % 2 ? 1 : 0, s = members[i].scale;
        sideEdge[side] = k < 2 ? Math.max(1.9, pairGap(1, s, 0)) : sideEdge[side] + pairGap(sidePrev[side], s, honorSp);
        sidePrev[side] = s;
        slots[i] = at((side ? -1 : 1) * sideEdge[side], 1.5, 0, faceYaw, 0);
      });
      const center = byRole("centerpiece");
      const centerU = honorRow(center);
      center.forEach(({ i }, k) => (slots[i] = at(centerU[k], 0, 0, faceYaw, 0)));
      const gBase = center.length ? -1.75 : 0;
      const gRows = placeRows(ground, gBase, 0, 1.35, 0.38, bandGap(center, centerU));
      const rear = byRole("rear");
      const rearU = honorRow(rear);
      // 大きな妖怪は体の半径の分だけ後ろへ（前の段の妖怪に食い込まない）
      const rearDepth = rear.reduce((m, { i }) => Math.max(m, bodyRadius(members[i].scale)), 0);
      const rearV = gBase - gRows * 1.35 - 0.35 - Math.max(0, rearDepth - bodyRadius(1));
      const rearLift = gRows * 0.38 + 0.2;
      rear.forEach(({ i }, k) => (slots[i] = at(rearU[k], rearV, rearLift, faceYaw, row)));
      if (rear.length) row++;
      const airRows = placeRows(air, gBase - gRows * 1.35 + 0.6, gRows * 0.38 + 1.8, 0.7, 1.05, bandGap(rear, rearU));
      const airHonor = byRole("air");
      const airU = honorRow(airHonor);
      airHonor.forEach(({ i }, k) => {
        slots[i] = at(airU[k], gBase - gRows * 1.35 + 0.6 - airRows * 0.7, gRows * 0.38 + 2.2 + airRows * 1.05, faceYaw, row);
      });
      break;
    }
    case "scatter": {
      // 大騒ぎ：ひまわりの種の並び（重なりにくい）＋ばらつき。向きもばらばら
      const golden = Math.PI * (3 - Math.sqrt(5));
      order.forEach(({ i }, k) => {
        const r = sp * 0.62 * Math.sqrt(k + 2.5);
        const a = k * golden;
        const u = Math.cos(a) * r * 1.3 + jitter(k, 1) * 0.35;
        const v = Math.sin(a) * r - r * 0.25 + jitter(k, 2) * 0.35;
        slots[i] = at(u, v, floatLift(members[i]) + Math.max(0, jitter(k, 3)) * 0.3, faceYaw + jitter(k, 4) * 0.9, Math.floor(r / 2));
      });
      hero = at(0, Math.sqrt(n + 4) * sp * 0.5, 0, faceYaw, 0);
      break;
    }
  }
  return { hero, slots };
}

/** 写真の枠取り用：正面から見た横幅・奥行き・高さと中心 */
export function formationBounds(res: FormationResult, c: Pick<FormationContext, "fx" | "fz">) {
  const rx = c.fz, rz = -c.fx;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, h = 1.5;
  let sx = 0, sz = 0;
  const all = [res.hero, ...res.slots];
  for (const s of all) {
    const u = s.x * rx + s.z * rz, v = s.x * c.fx + s.z * c.fz;
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
    h = Math.max(h, s.lift + 1.5);
    sx += s.x;
    sz += s.z;
  }
  return { cx: sx / all.length, cz: sz / all.length, width: u1 - u0, depth: v1 - v0, height: h };
}
