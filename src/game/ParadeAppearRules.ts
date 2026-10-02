/**
 * 行列の数に誘われて姿を見せる妖怪の判定（値は data/paradeAppear.ts）。
 *  - appearCount：その妖怪が姿を見せるのに要る行列の数（0 なら、いつもどおりすぐ見せる）
 *  - ParadeAppearHold：町に置いたが、まだ数が届かない妖怪を預かり、届いたらまとめて渡す（低頻度で見る）
 * 町に置く・姿を見せる本体は WildYokai（ここは数の判定だけ）。一度姿を見せたら、行列が散って数が減っても隠れない。
 * 置き方の条件（夜の進み appearAt・世界の層・気配・地区覚醒・行列の遊び）とは両方がそろって初めて姿を見せる。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない。
 */
import { PARADE_APPEAR } from "../data/paradeAppear";
import type { YokaiType } from "../data/yokaiTypes";

type Cfg = typeof PARADE_APPEAR;

/** 姿を見せるのに要る行列の数（主人公を含む。0 = すぐ） */
export function appearCount(def: Pick<YokaiType, "rank" | "discovery" | "normalWave"> | undefined, cfg: Cfg = PARADE_APPEAR) {
  if (!def || def.discovery === "hidden") return 0;
  if (def.rank === "greater") return cfg.greater;
  if (def.rank === "threeGreat") return cfg.threeGreat;
  const w = def.normalWave ?? 0;
  return cfg.normal[Math.min(w, cfg.normal.length - 1)] ?? 0;
}

/** 数が届くまで預かるもの（WildYokai の Wild） */
export interface AppearItem {
  /** 姿を見せるのに要る行列の数（無ければすぐ） */
  need?: number;
  /** 預けた */
  held?: boolean;
}

/** 町に置いたが、まだ数が届かない妖怪を預かり、届いたら渡す（低頻度で見る） */
export class ParadeAppearHold<T extends AppearItem> {
  private held: T[] = [];
  private timer = 0;

  get size() {
    return this.held.length;
  }

  /** 姿を見せる前に呼ぶ。まだ数が届かなければ預かって true（今は見せない） */
  defer(item: T, total: number) {
    if (!item.need || total >= item.need) return false;
    if (!item.held) this.held.push(item);
    item.held = true;
    return true;
  }

  /** 今の数で届いたものを取り出す */
  release(total: number): T[] {
    const out = this.held.filter((h) => (h.need ?? 0) <= total);
    if (out.length) this.held = this.held.filter((h) => (h.need ?? 0) > total);
    for (const h of out) h.need = undefined;
    return out;
  }

  /** every 秒ごとに release し、届いたものを show へ渡す。姿を見せた数を返す */
  tick(dt: number, total: number, show: (item: T) => boolean, every = 0.5) {
    this.timer -= dt;
    if (this.timer > 0 || !this.held.length) return 0;
    this.timer = every;
    let n = 0;
    for (const h of this.release(total)) if (show(h)) n++;
    return n;
  }
}
