/**
 * 一夜の段階（タイトル → 夜 → 締めの演出 → 結果 → 眺める／記念撮影）。
 * 夜が終わったあと（showcase 以降）は、ゲームの進行（野良妖怪・脅威・Encounter・Pacing・賑わい・地区覚醒・夜の刻）を止め、
 * キャラクターのアニメ・演出・カメラ・写真のポーズだけを動かす。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export type NightPhase = "title" | "play" | "showcase" | "result" | "view" | "photo";

const NEXT: Record<NightPhase, readonly NightPhase[]> = {
  title: ["play"],
  play: ["showcase"],
  showcase: ["result"],
  result: ["view", "photo"],
  view: ["result", "photo"],
  photo: ["result", "view"],
};

export class AfterNightState {
  phase: NightPhase = "title";
  /** 撮影・眺めるの前にいた段階（戻る先） */
  prev: NightPhase = "title";

  can(p: NightPhase) {
    return NEXT[this.phase].includes(p);
  }

  /** 段階を移る。許されない遷移は無視して false */
  go(p: NightPhase) {
    if (!this.can(p)) return false;
    this.prev = this.phase;
    this.phase = p;
    return true;
  }

  /** ゲームの進行（AI・Encounter・Pacing・賑わい・地区覚醒・夜の刻・プレイヤー入力）を進めてよいか */
  get gameplay() {
    return this.phase === "play";
  }
  /** 夜が終わった後（結果・眺める・撮影）：行列は立ち位置に並び、写真のポーズで動く */
  get afterNight() {
    return this.phase === "result" || this.phase === "view" || this.phase === "photo";
  }
  /** 行列が主人公の軌跡を追う（夜の間と、締めの演出で立ち止まるまで） */
  get paradeFollows() {
    return this.phase === "play" || this.phase === "showcase";
  }
}
