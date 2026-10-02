import { toKanji } from "../core/util";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface OnsenUIActions {
  talk(): void;
  zukan(): void;
  photo(): void;
  leave(): void;
  shoot(): void;
  photoBack(): void;
  save(): void;
  share(): void;
}

/**
 * 宵霞楼の画面：左上に宿の名と今夜の宿泊客の数、右下に 図鑑・写真・宿を出る、近くに客がいれば「話す」。
 * 宿泊客の一覧や「？？？」は出さない（歩いて見つける）。宿を出るときは一度たずねる（次は客が変わるので）。
 */
export class OnsenUI {
  private noteT = 0;

  constructor(a: OnsenUIActions) {
    const on = (id: string, fn: () => void) => $(id).addEventListener("click", fn);
    on("onsen-talk", () => a.talk());
    on("onsen-dialog", () => a.talk());
    on("onsen-zukan", () => a.zukan());
    on("onsen-photo", () => a.photo());
    on("onsen-leave", () => $("onsen-leave-ask").classList.remove("hidden"));
    on("onsen-leave-no", () => $("onsen-leave-ask").classList.add("hidden"));
    on("onsen-leave-yes", () => a.leave());
    on("onsen-shoot", () => a.shoot());
    on("onsen-photo-ui", () => this.setClean(true));
    on("onsen-ui-back", () => this.setClean(false));
    on("onsen-photo-back", () => a.photoBack());
    on("onsen-shot-save", () => a.save());
    on("onsen-shot-share", () => a.share());
    on("onsen-shot-close", () => $("onsen-shot").classList.add("hidden"));
  }

  show() {
    $("onsen-ui").classList.remove("hidden");
    $("onsen-loading").classList.add("hidden");
  }

  setGuests(n: number) {
    $("onsen-count").textContent = `今夜の宿泊客　${toKanji(n)}妖`;
  }

  /** 近くに話せる客がいるか */
  setTalkable(v: boolean) {
    $("onsen-talk").classList.toggle("hidden", !v);
  }

  /** 会話（name が空なら名前を出さない：まだ知らない客） */
  showDialog(name: string, text: string) {
    $("onsen-dialog-name").textContent = name;
    $("onsen-dialog-name").classList.toggle("hidden", !name);
    $("onsen-dialog-text").textContent = text;
    $("onsen-dialog").classList.remove("hidden");
    this.setTalkable(false);
  }
  hideDialog() {
    $("onsen-dialog").classList.add("hidden");
  }
  get talking() {
    return !$("onsen-dialog").classList.contains("hidden");
  }

  /** 静かな知らせ（大きな見出しや音は使わない） */
  note(main: string, sub: string) {
    $("onsen-note-main").textContent = main;
    $("onsen-note-sub").textContent = sub;
    const el = $("onsen-note");
    el.classList.remove("hidden", "fade");
    clearTimeout(this.noteT);
    this.noteT = window.setTimeout(() => {
      el.classList.add("fade");
      this.noteT = window.setTimeout(() => el.classList.add("hidden"), 1200);
    }, 3600);
  }

  /** 写真：宿の画面を隠して撮影の札だけに */
  setPhoto(v: boolean) {
    $("onsen-hud").classList.toggle("hidden", v);
    $("onsen-photo-bar").classList.toggle("hidden", !v);
    if (!v) {
      // 撮った写真の画面も閉じる（Esc で写真を抜けたときに残らないように）
      $("onsen-shot").classList.add("hidden");
      this.setClean(false);
    }
    this.hideDialog();
    this.setTalkable(false);
  }
  /** 写真の札も隠す（右上の小さな札で戻す） */
  setClean(v: boolean) {
    document.body.classList.toggle("onsen-clean", v);
  }

  showShot(url: string) {
    $<HTMLImageElement>("onsen-shot-img").src = url;
    $("onsen-shot").classList.remove("hidden");
  }

  toast(text: string) {
    const el = $("onsen-toast");
    el.textContent = text;
    el.classList.remove("hidden");
    window.setTimeout(() => el.classList.add("hidden"), 2400);
  }
}
