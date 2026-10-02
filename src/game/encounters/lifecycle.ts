import type { EncounterRuntime } from "./types";

export type SettledStatus = "complete" | "expired";

/**
 * 場に出ている Encounter を進め、終わったもの（complete / expired）を場から外して片付ける。
 * どちらの終わり方でも dispose() する（一時コライダー・小道具を残さない）。
 * 行列へ移譲した Actor などは、各 Encounter が所有権を手放しているので消されない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export function settleEncounters(
  active: EncounterRuntime[],
  dt: number,
  t: number,
  onSettled: (e: EncounterRuntime, st: SettledStatus) => void,
) {
  for (let i = active.length - 1; i >= 0; i--) {
    const e = active[i];
    const st = e.update(dt, t);
    if (st === "running") continue;
    active.splice(i, 1);
    try {
      onSettled(e, st);
    } finally {
      e.dispose();
    }
  }
}
