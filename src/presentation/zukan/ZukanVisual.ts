/**
 * 図鑑の姿の枠（墨絵 / 3D）の切り替え。DOM・Babylon を持たない（node --test で確かめる：tests/zukanBook.test.ts）。
 *  - 見せ方は妖怪ごと（図鑑全体の一括ではない）。初めは墨絵があれば墨絵、無ければ 3D（data/yokaiInk.ts の initialVisualMode）
 *  - 3D の舞台（ModelStage）は図鑑全体で一つだけ。ある妖怪で 3D を映すと、前に映していた妖怪の姿は片付けて、同じ舞台をその枠へ移す
 *    （同時に二体を描かない。図鑑を開いただけでは何も作らない）
 *  - 墨絵に切り替える・図鑑を閉じると、舞台を止めて片付ける。映している枠が画面の外へ出たら描くのを止め、戻ったら再開する
 * 将来、図鑑全体の一括の切り替えにするなら setAll を足す（modes を全部書き換えるだけ）。
 */
import { hasInkPortrait, type VisualMode } from "../../data/yokaiInk";

/** 3D の舞台（presentation/zukan/ZukanModelViewer）。mount は姿を映す枠 */
export interface ModelStage<M> {
  /** その枠へ舞台を移し、姿を作って描きはじめる（前の姿は片付ける） */
  show(type: string, mount: M): void;
  /** 描くのを止め、姿を片付け、枠から外す */
  hide(): void;
  /** 描く・止める（映している枠が画面の外へ出たとき） */
  setRunning(on: boolean): void;
}

export class ZukanVisual<M> {
  private modes = new Map<string, VisualMode>();
  private stage: ModelStage<M>;
  private hasInk: (type: string) => boolean;
  /** 今 3D を映している妖怪（無ければ null） */
  active: string | null = null;

  constructor(stage: ModelStage<M>, hasInk: (type: string) => boolean = (t) => hasInkPortrait(t)) {
    this.stage = stage;
    this.hasInk = hasInk;
  }

  /** 墨絵を選べるか（無ければ「墨絵」の札は押せない） */
  canInk(type: string) {
    return this.hasInk(type);
  }

  /** 今の見せ方（まだ選んでいなければ初めの見せ方） */
  modeOf(type: string): VisualMode {
    return this.modes.get(type) ?? (this.hasInk(type) ? "ink" : "3d");
  }

  /** 見せ方を選ぶ。3D を選んだら、その枠で映す。墨絵が無ければ墨絵は選べない（false） */
  setMode(type: string, mode: VisualMode, mount: M) {
    if (mode === "ink" && !this.canInk(type)) return false;
    this.modes.set(type, mode);
    if (mode === "3d") this.play(type, mount);
    else if (this.active === type) this.stop();
    return true;
  }

  /** 3D の枠で「姿を映す」 */
  play(type: string, mount: M) {
    this.modes.set(type, "3d");
    this.stage.show(type, mount);
    this.active = type;
  }

  /** 映している枠が見えるか（画面の外では描かない） */
  setVisible(type: string, visible: boolean) {
    if (this.active === type) this.stage.setRunning(visible);
  }

  /** 映している枠が画面から消えた（検索・絞り込みで隠れた）とき・図鑑を閉じたとき */
  stop() {
    if (this.active === null) return;
    this.stage.hide();
    this.active = null;
  }
}
