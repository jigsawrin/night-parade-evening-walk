import { STEER_DEAD, STEER_FULL } from "../core/TouchSteer";

/** 歩いている指の印（置いた場所と、今の指）。指が離れているときは出さない */
export interface TouchSteerPoint {
  x: number;
  y: number;
  ox: number;
  oy: number;
}

/**
 * タッチで歩いているあいだだけ、指を置いた場所に小さな輪を出す。
 * 常設のスティックは置かない（夜の画面をふさがず、指を離すと消える）。
 */
export class TouchSteerMark {
  private root: HTMLElement;
  private knob: HTMLElement;

  constructor() {
    this.root = document.getElementById("touch-steer")!;
    this.knob = this.root.querySelector(".knob")!;
    const ring = this.root.querySelector(".ring") as HTMLElement;
    const d = `${STEER_FULL * 2}px`;
    ring.style.width = d;
    ring.style.height = d;
    ring.style.marginLeft = `${-STEER_FULL}px`;
    ring.style.marginTop = `${-STEER_FULL}px`;
  }

  /** show が false のとき（撮影・図鑑・会話）は出さない。死角の中（タップ）も出さない */
  sync(show: boolean, steer: TouchSteerPoint | null) {
    if (!show || !steer || Math.hypot(steer.x, steer.y) <= STEER_DEAD) {
      this.root.classList.remove("on");
      return;
    }
    this.root.classList.add("on");
    this.root.style.transform = `translate(${steer.ox}px, ${steer.oy}px)`;
    this.knob.style.transform = `translate(${steer.x}px, ${steer.y}px)`;
  }
}
