import type { ModelFactory } from "../../characters/ModelFactory";
import type { World } from "../../world/World";
import type { Rng } from "../../core/seed";
import type { EncounterDef, OmenKind } from "../../data/encounters";
import type { GameBus } from "../events";
import type { Parade } from "../Parade";
import type { Player } from "../Player";
import type { WildYokai } from "../WildYokai";

/** Encounter が使う共有の部品 */
export interface EncounterContext {
  factory: ModelFactory;
  world: World;
  bus: GameBus;
  parade: Parade;
  player: Player;
  wild: WildYokai;
  rng: Rng;
  /** 今宵の妖怪（顔ぶれが偏る） */
  theme: string;
  /** 行列の構成（多い種類がさらに集まりやすい） */
  typeCounts: ReadonlyMap<string, number>;
  /** プレイヤーが追ってきた Encounter の系統による、顔ぶれの小さな偏り */
  typeBias: ReadonlyMap<string, number>;
}

export type EncounterStatus = "running" | "complete" | "expired";

/**
 * 場に出ている Encounter 一つ。
 * 必ず「発見 → 判断 → 移動 → 軽い攻略 → 加入」を経る。近づいただけ・放置では加入しない。
 */
export interface EncounterRuntime {
  readonly id: number;
  readonly def: EncounterDef;
  /** 今いちばん注目すべき地点（気配・誘導の向け先） */
  readonly x: number;
  readonly z: number;
  /** 気配の種類 */
  readonly omen: OmenKind;
  update(dt: number, t: number): EncounterStatus;
  dispose(): void;
  /** デバッグ表示 */
  status(): string;
}

export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
