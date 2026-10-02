/**
 * 通常妖怪が町へ混ざりはじめる進み具合（hyakki.normalProgress.v1。結果の履歴とは別：履歴は表示用で 10 件までしか残らない）。
 *  - completedNights：夜が正常に終わった（結果まで進んだ）数。リロード・結果の再表示・過去の記録を開いても増えない
 *  - waveOpenedAt：wave が開いたのを最初に見た夜（その時点の completedNights）。開いた直後の 1〜2 夜だけ、その wave の妖怪を選びやすくする
 * 初めて読むとき（保存が無い）は、今までの履歴の件数を completedNights の最低値にする（既存のプレイヤーの移行）。
 * 画面には何も出さない（段・wave・夜の数を見せない）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */

export interface NormalProgress {
  version: 1;
  completedNights: number;
  /** 添字 = wave、値 = 開いたのを見た夜（まだなら無い） */
  waveOpenedAt: (number | null)[];
  /** 最後に数えた夜（NightResult.endedAt）。同じ夜を二度数えない */
  lastNightEndedAt: number | null;
}

export function emptyNormalProgress(completedNights = 0): NormalProgress {
  return { version: 1, completedNights, waveOpenedAt: [0], lastNightEndedAt: null };
}

/** 読み込んだ値を整える（無い・壊れている → 空から。無ければ historyCount を夜の数の最低値に） */
export function normalizeNormalProgress(v: unknown, historyCount = 0): NormalProgress {
  if (!v || typeof v !== "object") return emptyNormalProgress(Math.max(0, Math.floor(historyCount)));
  const o = v as Partial<NormalProgress>;
  const nights = typeof o.completedNights === "number" && o.completedNights >= 0 ? Math.floor(o.completedNights) : 0;
  const opened = Array.isArray(o.waveOpenedAt) ? o.waveOpenedAt.map((n) => (typeof n === "number" && n >= 0 ? Math.floor(n) : null)) : [];
  opened[0] = opened[0] ?? 0;
  return { version: 1, completedNights: nights, waveOpenedAt: opened, lastNightEndedAt: typeof o.lastNightEndedAt === "number" ? o.lastNightEndedAt : null };
}

/** 夜が正常に終わった（結果が出た）。同じ夜（endedAt）を二度数えない。数えたら true */
export function recordCompletedNight(p: NormalProgress, endedAt: number): boolean {
  if (p.lastNightEndedAt === endedAt) return false;
  p.completedNights++;
  p.lastNightEndedAt = endedAt;
  return true;
}

/** 今開いている wave（0..wave）のうち、まだ開いた夜を記していないものを記す。記したら true（保存する） */
export function noteOpenedWaves(p: NormalProgress, wave: number): boolean {
  let changed = false;
  for (let w = 0; w <= wave; w++) {
    if (p.waveOpenedAt[w] === undefined || p.waveOpenedAt[w] === null) {
      p.waveOpenedAt[w] = p.completedNights;
      changed = true;
    }
  }
  return changed;
}

/** 開いたばかりの wave（開いてから nights 夜のあいだ）。今夜の顔ぶれで選びやすくする */
export function freshWaves(p: NormalProgress, wave: number, nights: number): number[] {
  const out: number[] = [];
  for (let w = 1; w <= wave; w++) {
    const at = p.waveOpenedAt[w];
    if (typeof at === "number" && p.completedNights - at < nights) out.push(w);
  }
  return out;
}
