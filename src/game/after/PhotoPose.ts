/**
 * Photo Pose System：写真用のポーズをリグファミリー単位で扱う。
 *
 * 今のプロトタイプのモデルには骨格が無いので、ポーズは「体全体の姿勢（上下・傾き・向き・伸び縮み・跳ね）」で疑似的に作る
 * （ProceduralPoseDriver）。将来 Tripo ＋共通 Rig Family を入れたら、同じ PoseId で正式な Rig Pose を再生する
 * PoseDriver に差し替えればよい（呼び出し側は PoseId と時刻を渡すだけ）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
import type { Family, PoseId, PoseStyleDef } from "../../data/photo";

/** 体全体の姿勢（Actor.animate がこれを使って描く） */
export interface PoseSample {
  /** 上下（跳ね・浮き） */
  bob: number;
  roll: number;
  pitch: number;
  /** 向きの足し算（体をひねる・手を振る代わりの左右の揺れ） */
  yawOffset: number;
  /** 縦の伸び縮み（1 = そのまま） */
  sy: number;
}

/** ポーズを再生するもの。今は手続き的、将来は骨格アニメーション */
export interface PoseDriver {
  sample(pose: PoseId, t: number, seed: number): PoseSample;
}

const S = (bob = 0, roll = 0, pitch = 0, yawOffset = 0, sy = 1): PoseSample => ({ bob, roll, pitch, yawOffset, sy });

/** 手続き的なポーズ（既存の Rig Family 別の手続きアニメと同じ語彙） */
export const ProceduralPoseDriver: PoseDriver = {
  sample(pose, t, seed) {
    const w = t + seed;
    switch (pose) {
      // ---- CHIBI_BIPED
      case "PHOTO_A": // 胸を張ってにっこり（小さく弾む）
        return S(Math.abs(Math.sin(w * 2.2)) * 0.05, 0, -0.08, 0, 1.03 + Math.sin(w * 2.2) * 0.02);
      case "PHOTO_B": // 首をかしげる
        return S(0, 0.16 + Math.sin(w * 1.1) * 0.03, 0, 0.25, 1);
      case "PHOTO_C": // 威風堂々：まっすぐ・少し胸を張る
        return S(0, 0, -0.12, 0, 1.05);
      case "BOW": // 静かに一礼（妖しい夜）
        return S(0, 0, 0.18 + Math.sin(w * 0.6) * 0.03, 0, 0.98);
      case "STILL":
        return S(0, Math.sin(w * 0.7) * 0.02, 0, 0, 1 + Math.sin(w * 1.3) * 0.01);
      case "JUMP": { // ぴょんぴょん
        const p = (w * 1.6) % 1;
        const h = Math.sin(p * Math.PI);
        return S(h * 0.8, 0, -h * 0.15, 0, 1 + (p < 0.1 ? -0.15 : h * 0.08));
      }
      case "WAVE": // 手を振る代わりに左右に揺れる
        return S(Math.abs(Math.sin(w * 4)) * 0.06, Math.sin(w * 6) * 0.2, 0, Math.sin(w * 3) * 0.3, 1);
      case "DANCE": // くるくる踊る
        return S(Math.abs(Math.sin(w * 5)) * 0.2, Math.sin(w * 5) * 0.15, 0, w * 2.2, 1 + Math.sin(w * 10) * 0.04);
      // ---- CHIBI_QUAD
      case "SIT": // お座り：少し縮んで前を見る
        return S(-0.05, 0, -0.25, 0, 0.9);
      case "PAW": // 前足を上げる代わりに、前を持ち上げて揺れる
        return S(Math.abs(Math.sin(w * 3)) * 0.08, Math.sin(w * 3) * 0.08, -0.35, 0, 1);
      case "REST": // 伏せる
        return S(-0.08, 0, 0.1, 0, 0.8 + Math.sin(w * 0.8) * 0.02);
      // ---- FLOAT
      case "FLOAT_A":
        return S(0.25 + Math.sin(w * 1.5) * 0.18, Math.sin(w * 1.2) * 0.08, 0, 0, 1);
      case "FLOAT_B": // 高めにゆらゆら
        return S(0.8 + Math.sin(w * 0.9) * 0.35, Math.sin(w * 0.9) * 0.18, 0.1, Math.sin(w * 0.5) * 0.4, 1);
      case "ORBIT": // その場で小さく回る
        return S(0.5 + Math.sin(w * 2) * 0.25, Math.sin(w * 2) * 0.2, 0, w * 1.4, 1);
      // ---- SPECIAL（唐傘・ろくろ首など個別）
      case "SPECIAL_HOP": {
        const h = Math.abs(Math.sin(w * 2.6));
        return S(h * 0.45, 0, 0, 0, 1 - Math.max(0, 0.1 - h) * 1.2);
      }
      case "SPECIAL_A":
      default:
        return S(0, Math.sin(w * 1.1) * 0.1, 0, 0, 1);
    }
  },
};

/** 一妖ずつのポーズ選び（決定的：同じ並びなら同じポーズ） */
export function choosePose(style: PoseStyleDef, family: Family, index: number): PoseId {
  const list = style.poses[family] ?? style.poses.SPECIAL;
  return list[(index * 7 + (index >> 2)) % list.length];
}

/** 向きのばらつき（決定的） */
export function poseYawJitter(style: PoseStyleDef, index: number) {
  const s = Math.sin(index * 91.7) * 1000;
  return (s - Math.floor(s) - 0.5) * 2 * style.yawJitter;
}

/**
 * カメラの方を向く：body = 体ごと向き直る、look = こっち向いて（体の向きはそのまま、顔が向く分だけ振り向く）。
 * 手続き生成のモデルは一つのメッシュで首が無いので、look は振り向く角度を LOOK_MAX_TURN までにして「顔だけこちらへ」に見せる
 */
export type FaceMode = "body" | "look";
/** こっち向いて：並びの向きから振り向く角度の上限（ラジアン） */
export const LOOK_MAX_TURN = 0.6;

/** 並びの向き base の妖怪（x, z）が、点（tx, tz）を向くときの向き */
export function faceYaw(base: number, x: number, z: number, tx: number, tz: number, mode: FaceMode) {
  const want = Math.atan2(tx - x, tz - z);
  if (mode === "body") return want;
  let d = want - base;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return base + Math.max(-LOOK_MAX_TURN, Math.min(LOOK_MAX_TURN, d));
}
