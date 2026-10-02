/**
 * 通常妖怪の解禁（純粋関数）：何夜歩いたか・図鑑をどこまで埋めたかで、町に混ざる通常妖怪の wave が開く。
 *  - wave 0：はじめの 12 種（いつも）
 *  - wave 1〜：data/normalYokai.ts の NORMAL_UNLOCK（夜の数と図鑑の登録数を or / and で組み合わせる）。順に開き、飛ばさない
 *  - 大妖怪・三大妖怪・隠し妖怪は、ここでは扱わない（いつも「解禁済み」。出る・出ないは NightLegendRoster）
 * 画面には何も出さない（段・wave を見せない）。図鑑の枠・分母は ZukanRules が wave を見て決める。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { loadHistory, loadNormalProgress, loadZukan, type KV } from "../../core/SaveData";
import { NORMAL_UNLOCK, type NormalWaveUnlock } from "../../data/normalYokai";
import { YOKAI, YOKAI_ORDER, isActiveYokai, type YokaiType } from "../../data/yokaiTypes";
import type { NormalProgress } from "./NormalProgress";

type Defs = Readonly<Record<string, YokaiType>>;
type Counts = Readonly<Record<string, number>>;

/** wave の段を持つ通常妖怪か（格も発見方式も通常） */
export function isWaveNormal(d: Pick<YokaiType, "rank" | "discovery"> | undefined) {
  return !!d && d.rank === "normal" && d.discovery === "normal";
}

/** 図鑑に登録した通常妖怪の数（scope "base" ははじめの 12 種だけ） */
export function registeredNormalCount(zukan: Counts, scope: "base" | "normal", defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  return order.filter((t) => {
    const d = defs[t];
    if (!isWaveNormal(d) || !isActiveYokai(d) || (zukan[t] ?? 0) <= 0) return false;
    return scope === "normal" || (d.normalWave ?? 0) === 0;
  }).length;
}

/** 一つの wave の条件を満たすか */
export function waveConditionMet(u: NormalWaveUnlock, p: Pick<NormalProgress, "completedNights">, zukan: Counts, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  const nights = p.completedNights >= u.nights;
  const reg = registeredNormalCount(zukan, u.scope, defs, order) >= u.zukan;
  return u.mode === "and" ? nights && reg : nights || reg;
}

/** 今開いている通常妖怪の wave（0 = はじめの 12 種だけ）。順に見て、満たさない wave で止まる */
export function unlockedNormalWave(p: Pick<NormalProgress, "completedNights">, zukan: Counts, cfg: readonly NormalWaveUnlock[] = NORMAL_UNLOCK, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  let wave = 0;
  for (const u of cfg) {
    if (!waveConditionMet(u, p, zukan, defs, order)) break;
    wave++;
  }
  return wave;
}

/** この妖怪は今、町に混ざりうるか（通常妖怪でなければ、ここでは止めない） */
export function isNormalUnlocked(type: string, p: Pick<NormalProgress, "completedNights">, zukan: Counts, cfg: readonly NormalWaveUnlock[] = NORMAL_UNLOCK, defs: Defs = YOKAI) {
  const d = defs[type];
  if (!d || !isActiveYokai(d)) return false;
  if (!isWaveNormal(d)) return true;
  return (d.normalWave ?? 0) <= unlockedNormalWave(p, zukan, cfg, defs);
}

/** wave までに開いた、後から混ざる通常妖怪（wave 1 以上）。wave の順・図鑑の順 */
export function newNormalTypes(wave: number, defs: Defs = YOKAI, order: readonly string[] = YOKAI_ORDER) {
  return order.filter((t) => {
    const d = defs[t];
    return isWaveNormal(d) && isActiveYokai(d) && (d.normalWave ?? 0) >= 1 && (d.normalWave ?? 0) <= wave;
  });
}

/** 保存から今の wave を読む（温泉宿・縁帳の判定など、夜の外から） */
export function savedNormalWave(kv: KV | null, zukan: Counts = loadZukan(kv)) {
  return unlockedNormalWave(loadNormalProgress(kv, loadHistory(kv).length), zukan);
}
