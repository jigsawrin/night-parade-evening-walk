/**
 * 建物の透過・非表示（どの建物をどれだけ透かすか）を決める純粋ロジック。
 * World が部品ごとに「どの建物か（グループ）」を記録し、StructureVisibilityDirector がここで決めた値をシェーダーへ渡す。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */

/** 写真で隠せる分類。npc は Actor 側（建物ではない） */
export type StructureCategory = "landmark" | "building" | "tree";
export type HideCategory = StructureCategory | "npc";

export const HIDE_CATEGORIES: { id: HideCategory; name: string; text: string }[] = [
  { id: "landmark", name: "重要な建物", text: "神社・寺・五重塔・鳥居・御神木" },
  { id: "building", name: "その他の建築物", text: "家・長屋・提灯・屋台・墓" },
  { id: "tree", name: "木", text: "林・町の木・竹林" },
  { id: "npc", name: "NPC", text: "行列以外の妖怪・人・犬" },
];

export interface StructureInfo {
  /** 1 から始まる通し番号（0 = どの建物でもない） */
  id: number;
  cat: StructureCategory;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** いちばん高いところ */
  top: number;
  /** 主人公・百鬼夜行が近づいたときに透かす（家・大きな建物・木）。提灯などの小物はカメラのすぐ前のときだけ透かす */
  fadeable: boolean;
}

/** 建物の透過（設定）：0 切 / 1 主人公とカメラのまわり / 2 百鬼夜行のまわりも */
export type FadeMode = 0 | 1 | 2;

export interface FadeFocus {
  mode: FadeMode;
  /** 主人公（null = 見ない：撮影中など） */
  player: { x: number; y: number; z: number } | null;
  camera: { x: number; y: number; z: number } | null;
  /** 百鬼夜行の位置（間引いたもの） */
  parade: readonly { x: number; z: number }[];
  /**
   * 小物（提灯・灯籠・柱など、fadeable でないもの）も、主人公のこの距離の中にある背の高いもの・カメラと主人公の間をふさぐものは透かす
   * （温泉宿。無ければ町と同じく、小物はカメラのすぐ前のときだけ）
   */
  small?: number;
}

/** 透かしたときの濃さ（0 = 見えない、1 = そのまま） */
export const GHOST = 0.28;
export const PLAYER_R = 6;
export const CAMERA_R = 5;
export const PARADE_R = 3.5;
/** カメラと主人公の間をふさぐ建物を調べる範囲 */
export const OCCLUDE_RANGE = 45;

function distToBox(s: StructureInfo, x: number, z: number) {
  const dx = Math.max(s.x0 - x, 0, x - s.x1);
  const dz = Math.max(s.z0 - z, 0, z - s.z1);
  return Math.hypot(dx, dz);
}

/** 線分（カメラ → 主人公）が建物の箱をふさぐか（平面で交わり、その地点で建物の方が線より高い） */
function occludes(s: StructureInfo, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const pad = 0.6;
  const dx = b.x - a.x, dz = b.z - a.z;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, dx, s.x0 - pad, s.x1 + pad], [a.z, dz, s.z0 - pad, s.z1 + pad]] as const) {
    if (Math.abs(d) < 1e-6) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let e = (lo - p) / d, f = (hi - p) / d;
    if (e > f) [e, f] = [f, e];
    t0 = Math.max(t0, e);
    t1 = Math.min(t1, f);
    if (t0 > t1) return false;
  }
  // 主人公のすぐ手前（主人公の足元）ではなく、線の途中をふさぐ
  if (t0 > 0.97) return false;
  const y = a.y + (b.y - a.y) * t0;
  return s.top > y;
}

/**
 * 各建物の目標の濃さを out[id] に入れる。
 * hidden の分類は 0（写真で隠す）。透かす建物は GHOST、それ以外は 1。
 */
export function fadeTargets(list: readonly StructureInfo[], f: FadeFocus, hidden: ReadonlySet<HideCategory>, out: Float32Array) {
  const eye = f.player ? { x: f.player.x, y: f.player.y + 1.2, z: f.player.z } : null;
  for (const s of list) {
    if (hidden.has(s.cat)) {
      out[s.id] = 0;
      continue;
    }
    let v = 1;
    // カメラのすぐ前の物は、提灯などの小物でも透かす（視界をふさぐ）
    if (f.mode > 0 && f.camera && distToBox(s, f.camera.x, f.camera.z) < CAMERA_R && s.top > f.camera.y - 2) v = GHOST;
    // 主人公の足元より低い物（温泉宿の上の階から見た下の階）は、近くても透かさない
    else if (f.player && s.top < f.player.y + 0.3) v = 1;
    else if (f.mode > 0 && !s.fadeable && f.small && eye) {
      // 背の低い物（座卓・座布団など）は近くでも透かさない
      if (s.top > eye.y + 0.4 && distToBox(s, eye.x, eye.z) < f.small) v = GHOST;
      else if (f.camera && distToBox(s, eye.x, eye.z) < OCCLUDE_RANGE && occludes(s, f.camera, eye)) v = GHOST;
    }
    else if (f.mode > 0 && s.fadeable) {
      if (eye && distToBox(s, eye.x, eye.z) < PLAYER_R) v = GHOST;
      else if (eye && f.camera && distToBox(s, eye.x, eye.z) < OCCLUDE_RANGE && occludes(s, f.camera, eye)) v = GHOST;
      else if (f.mode === 2) {
        for (const p of f.parade) {
          if (distToBox(s, p.x, p.z) < PARADE_R) {
            v = GHOST;
            break;
          }
        }
      }
    }
    out[s.id] = v;
  }
}

/** 濃さを目標へなめらかに（戻るときはゆっくり）。変わったら true */
export function stepFade(cur: Float32Array, target: Float32Array, dt: number) {
  let changed = false;
  for (let i = 1; i < cur.length; i++) {
    const d = target[i] - cur[i];
    if (d === 0) continue;
    const rate = d < 0 ? 5 : 2.5;
    const step = rate * dt;
    cur[i] = Math.abs(d) <= step ? target[i] : cur[i] + Math.sign(d) * step;
    changed = true;
  }
  return changed;
}
