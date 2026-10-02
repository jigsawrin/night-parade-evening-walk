import { DISTRICTS, districtAt, type DistrictDef } from "../data/districts";
import { inRect } from "../data/map";
import type { GameBus } from "./events";

/** DistrictAwakeningSystem が使う行列の様子（Parade の一部） */
export interface AwakenParade {
  readonly total: number;
  tail(out: { x: number; z: number; dx: number; dz: number }): void;
}

interface DistrictState {
  visited: boolean;
  lastVisit: number;
  /** 地区を出た時刻（-1 = 中にいる／未訪問） */
  leftAt: number;
  /** 今回の訪問で、行列を連れて歩いた地区内の異なるマス */
  cells: Set<number>;
  awakened: boolean;
  shownP: number;
}

const CELL = 10;
/** 境目でふらついただけなら、同じ訪問のまま（秒） */
export const VISIT_GRACE = 8;
/** 覚醒した地区が増えるほど、次の地区では少し長く練り歩く必要がある */
export const AWAKEN_GROWTH = 0.2;

/** 覚醒に要るマスの数（既に覚醒させた地区の数で少し増える） */
export function awakenNeed(d: DistrictDef, awakenedCount: number) {
  return d.awaken ? Math.ceil(d.awaken.cells * (1 + AWAKEN_GROWTH * awakenedCount)) : Infinity;
}

/**
 * District Awakening（地区覚醒）。
 * 単なる人数の閾値ではなく「一定規模の百鬼夜行で、その地区を今回の訪問で練り歩いた」ことが条件。
 *  1. 行列が minTotal 以上の状態で、地区に入ってから出るまで（1 回の訪問）に、異なるマスを need 個ぶん歩く
 *     （昔少し歩いた分の蓄積では覚醒しない。境目で VISIT_GRACE 秒以内に戻れば同じ訪問）
 *  2. 最後尾まで地区に入った（長い行列が通り抜けた）
 * → 提灯が順に灯り、住民が店先へ出てきて、屋根・路地・店の裏から妖怪の気配が現れる（演出は Presentation 側）。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export class DistrictAwakeningSystem {
  private states = new Map<string, DistrictState>();
  current: DistrictDef | null = null;
  awakenedCount = 0;
  private tmp = { x: 0, z: 0, dx: 0, dz: 0 };
  private bus: GameBus;
  private parade: AwakenParade;
  private player: { readonly x: number; readonly z: number };
  private wild: { revealDistrict(id: string): number };

  constructor(bus: GameBus, parade: AwakenParade, player: { readonly x: number; readonly z: number }, wild: { revealDistrict(id: string): number }) {
    this.bus = bus;
    this.parade = parade;
    this.player = player;
    this.wild = wild;
    for (const d of DISTRICTS) this.states.set(d.id, { visited: false, lastVisit: -1, leftAt: -1, cells: new Set(), awakened: false, shownP: -1 });
  }

  /** 低頻度（4Hz 程度）で呼ぶ */
  update(t: number) {
    const px = this.player.x, pz = this.player.z;
    const d = districtAt(px, pz);
    if (d !== this.current) {
      if (this.current) this.states.get(this.current.id)!.leftAt = t;
      const prevVisit = d ? this.states.get(d.id)!.lastVisit : -1;
      this.current = d;
      if (d) {
        const st = this.states.get(d.id)!;
        // 新しい訪問：前回の訪問で歩いた分は数えない
        if (st.leftAt >= 0 && t - st.leftAt > VISIT_GRACE) this.resetVisit(d, st);
        st.leftAt = -1;
        this.bus.emit("districtEnter", { id: d.id, name: d.name, first: !st.visited, gap: prevVisit < 0 ? Infinity : t - prevVisit });
        st.visited = true;
      }
    }
    if (!d) return;
    const st = this.states.get(d.id)!;
    st.lastVisit = t;
    if (!d.awaken || st.awakened || this.parade.total < d.awaken.minTotal) return;

    st.cells.add(Math.floor(px / CELL) * 1000 + Math.floor(pz / CELL));
    const walk = Math.min(1, st.cells.size / awakenNeed(d, this.awakenedCount));
    this.parade.tail(this.tmp);
    const tailIn = inRect(d.area, this.tmp.x, this.tmp.z, 4);
    const p = walk * 0.9 + (walk >= 1 && tailIn ? 0.1 : 0);
    const shown = Math.floor(p * 20) / 20;
    if (shown !== st.shownP) {
      st.shownP = shown;
      this.bus.emit("districtProgress", { id: d.id, name: d.name, p: shown });
    }
    if (walk >= 1 && tailIn) this.awaken(d, st);
  }

  private resetVisit(d: DistrictDef, st: DistrictState) {
    if (!st.cells.size) return;
    st.cells.clear();
    if (st.shownP > 0 && !st.awakened) this.bus.emit("districtProgress", { id: d.id, name: d.name, p: 0 });
    st.shownP = -1;
  }

  private awaken(d: DistrictDef, st: DistrictState) {
    st.awakened = true;
    this.awakenedCount++;
    this.bus.emit("districtAwaken", { id: d.id, name: d.name, x: this.player.x, z: this.player.z });
    // 屋根・路地・店の裏から、妖怪の気配（加入はプレイヤーが触れてから）
    this.wild.revealDistrict(d.id);
  }

  /** 最後にその地区を訪れた時刻（未訪問は undefined） */
  visitTime(id: string) {
    const st = this.states.get(id);
    return st && st.lastVisit >= 0 ? st.lastVisit : undefined;
  }
  isAwakened(id: string) {
    return this.states.get(id)?.awakened ?? false;
  }
  /** 今回の訪問で歩いたマスの数 */
  visitCells(id: string) {
    return this.states.get(id)?.cells.size ?? 0;
  }
  /** 覚醒できる（まだ覚醒しておらず、行列の大きさが足りている）地区 */
  awakenable() {
    return DISTRICTS.filter((d) => d.awaken && !this.states.get(d.id)!.awakened && this.parade.total >= d.awaken.minTotal);
  }
  debug() {
    return DISTRICTS.map((d) => {
      const st = this.states.get(d.id)!;
      return `${d.name}${st.awakened ? "◎" : st.visited ? `${st.cells.size}/${awakenNeed(d, this.awakenedCount)}` : "·"}`;
    }).join(" ");
  }
}
