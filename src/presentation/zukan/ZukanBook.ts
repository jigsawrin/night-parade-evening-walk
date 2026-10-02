import { toKanji } from "../../core/util";
import { YOKAI, YOKAI_ICON, type YokaiRank } from "../../data/yokaiTypes";
import { inkPortrait } from "../../data/yokaiInk";
import { zukanCompletion, zukanListing, type ZukanEntry } from "../../game/ZukanRules";
import { entryCardHtml, sectionTitle, unknownCardHtml } from "./ZukanCards";
import { ZukanModelViewer } from "./ZukanModelViewer";
import { ZukanVisual } from "./ZukanVisual";
import "./zukan.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** 図鑑が読む縁帳（会った・見つけた、縁を結んだ夜の数）と、今開いている通常妖怪の wave（段は画面に出さない） */
export interface ZukanFound {
  met: readonly string[];
  joinCount?: Readonly<Record<string, number>>;
  normalWave?: number;
}

/**
 * 妖怪図鑑（一体で横一列を丸ごと使う本の形。本編・設定・宵霞楼のどこから開いてもこれ一つ）。
 *  - 上の帳（sticky）：題・出会った数・閉じる・名前の検索・登録済みのみ・区分（妖怪 / 大妖怪 / 三大妖怪）へのジャンプ
 *  - 並べる枠と区分・検索は ZukanRules（zukanListing。まだ混ざらない通常妖怪・見つけていない隠し妖怪は枠ごと無い。
 *    検索は登録済みだけを名前・よみ・別名で探す）。一枠の中身は ZukanCards、墨絵 / 3D の切り替えは ZukanVisual
 *  - 3D の姿見（ZukanModelViewer）は一つだけ。「3D」を押した枠へ移して映す。閉じると止めて片付ける
 *  - 検索・登録済みのみは、枠を作り直さずに隠すだけ（映している 3D がそのまま残る）。同じページの間は閉じても
 *    「登録済みのみ」とスクロールの位置を覚えておく（保存はしない）
 */
export class ZukanBook {
  private viewer = new ZukanModelViewer();
  private visual = new ZukanVisual<HTMLElement>(this.viewer);
  private book = $("zukan-book");
  private grid = $("zukan-grid");
  private search = $<HTMLInputElement>("zukan-search");
  private onlyBtn = $<HTMLButtonElement>("zukan-registered");
  /** 枠と妖怪の対応（DOM の属性には書かない：未登録の枠から正体が漏れないように） */
  private cards = new Map<string, HTMLElement>();
  private typeOf = new WeakMap<HTMLElement, string>();
  private sections = new Map<YokaiRank, HTMLElement>();
  private counts: Record<string, number> = {};
  private found: { met: string[]; joinCount: Record<string, number>; normalWave?: number } = { met: [], joinCount: {} };
  private registeredOnly = false;
  private open = false;
  private scrollTop = 0;
  private searching = false;
  private beforeSearch = 0;
  /** 映している 3D の枠が見えているか（見えない間は描かない） */
  private io = new IntersectionObserver((es) => {
    const t = this.visual.active;
    if (t) for (const e of es) this.visual.setVisible(t, e.isIntersecting);
  }, { root: $("zukan-book") });

  constructor() {
    this.grid.addEventListener("click", (ev) => this.onClick(ev.target as HTMLElement));
    this.search.addEventListener("input", () => {
      // 検索を始める前の位置を覚えておき、検索を消したらそこへ戻る
      const had = this.searching;
      this.searching = !!this.search.value.trim();
      if (!had && this.searching) this.beforeSearch = this.book.scrollTop;
      this.applyFilter();
      if (had && !this.searching) this.book.scrollTop = this.beforeSearch;
    });
    this.onlyBtn.addEventListener("click", () => {
      this.registeredOnly = !this.registeredOnly;
      this.onlyBtn.setAttribute("aria-pressed", String(this.registeredOnly));
      this.applyFilter();
    });
    document.querySelectorAll<HTMLButtonElement>("#zukan .zk-jump [data-rank]").forEach((b) =>
      b.addEventListener("click", () => this.jump(b.dataset.rank as YokaiRank)),
    );
    window.addEventListener("resize", () => {
      if (this.open) fitLines(this.grid);
    });
  }

  /** これまでに仲間になった数（すべての夜の合計・保存される）と、今夜の数・縁帳 */
  build(tonight: ReadonlyMap<string, number>, allTime: Readonly<Record<string, number>>, found: ZukanFound) {
    this.visual.stop();
    this.io.disconnect();
    const counts: Record<string, number> = { ...allTime };
    for (const [t, n] of tonight) counts[t] = Math.max(counts[t] ?? 0, n);
    this.counts = counts;
    this.found = { met: [...found.met], joinCount: { ...found.joinCount }, normalWave: found.normalWave };
    this.grid.innerHTML = "";
    this.cards.clear();
    this.sections.clear();
    for (const s of zukanListing(counts, this.found)) {
      const sec = document.createElement("section");
      sec.className = `zk-section rank-${s.rank}`;
      sec.innerHTML = `<h3 class="zk-section-title">${sectionTitle(s)}</h3>`;
      for (const e of s.entries) sec.appendChild(this.card(e, tonight.get(e.type) ?? 0));
      this.sections.set(s.rank, sec);
      this.grid.appendChild(sec);
    }
    const c = zukanCompletion(counts, this.found);
    $("zukan-seen").textContent = `出会った妖怪　${toKanji(c.seen)} ／ ${toKanji(c.total)}種`;
    // 検索は開くたびに空へ戻す（「登録済みのみ」は同じページの間は覚えておく）
    this.search.value = "";
    this.searching = false;
    this.applyFilter();
  }

  show(v: boolean) {
    // 隠す前に位置を覚える（隠した後は 0 になる）
    if (!v && this.open) this.scrollTop = this.searching ? this.beforeSearch : this.book.scrollTop;
    this.open = v;
    $("zukan").classList.toggle("hidden", !v);
    if (v) {
      // 見えてからでないと幅を測れない
      fitLines(this.grid);
      this.book.scrollTop = this.scrollTop;
    } else this.stop3d();
  }

  private card(e: ZukanEntry, tonight: number) {
    const el = document.createElement("article");
    if (!e.seen) {
      el.className = "zk-entry unknown";
      el.innerHTML = unknownCardHtml(YOKAI[e.type].hint);
    } else {
      el.className = `zk-entry rank-${e.rank}`;
      const mode = this.visual.modeOf(e.type);
      el.innerHTML = entryCardHtml(e, { mode, inkUrl: inkPortrait(e.type), hasModel: ZukanModelViewer.has(e.type), icon: YOKAI_ICON[e.type] ?? "妖" }, { tonight });
    }
    this.cards.set(e.type, el);
    this.typeOf.set(el, e.type);
    return el;
  }

  private onClick(target: HTMLElement) {
    const card = target.closest<HTMLElement>(".zk-entry");
    const type = card && this.typeOf.get(card);
    if (!card || !type || card.classList.contains("unknown")) return;
    const mount = card.querySelector<HTMLElement>(".zk-model-mount");
    const prev = this.visual.active;
    const tab = target.closest<HTMLButtonElement>(".zk-tab");
    if (tab && !tab.disabled && mount) this.visual.setMode(type, tab.dataset.mode === "ink" ? "ink" : "3d", mount);
    else if (target.closest(".zk-play") && mount) this.visual.play(type, mount);
    else return;
    this.io.disconnect();
    if (this.visual.active === type && mount) this.io.observe(mount);
    if (prev && prev !== type) this.refresh(prev);
    this.refresh(type);
  }

  /** 枠の見せ方（墨絵 / 3D・映しているか）を今の状態に合わせる */
  private refresh(type: string) {
    const card = this.cards.get(type);
    const stage = card?.querySelector<HTMLElement>(".zk-stage");
    if (!card || !stage) return;
    const mode = this.visual.modeOf(type);
    stage.dataset.mode = mode;
    stage.classList.toggle("playing", this.visual.active === type);
    card.querySelectorAll<HTMLButtonElement>(".zk-tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }

  private stop3d() {
    const t = this.visual.active;
    this.visual.stop();
    this.io.disconnect();
    if (t) this.refresh(t);
  }

  /** 検索・登録済みのみ：枠を作り直さずに隠す（未登録の枠は、検索の文字がある間は出さない） */
  private applyFilter() {
    const shown = new Set<string>();
    for (const s of zukanListing(this.counts, this.found, { query: this.search.value, registeredOnly: this.registeredOnly })) {
      for (const e of s.entries) shown.add(e.type);
    }
    for (const [t, el] of this.cards) el.hidden = !shown.has(t);
    for (const [rank, sec] of this.sections) sec.hidden = ![...this.cards].some(([t, el]) => YOKAI[t].rank === rank && !el.hidden);
    document.querySelectorAll<HTMLButtonElement>("#zukan .zk-jump [data-rank]").forEach((b) => {
      const sec = this.sections.get(b.dataset.rank as YokaiRank);
      b.disabled = !sec || sec.hidden !== false;
    });
    $("zukan-empty").hidden = shown.size > 0;
    if (this.visual.active && !shown.has(this.visual.active)) this.stop3d();
    if (this.open) fitLines(this.grid);
  }

  /** 区分の先頭へ（目次。絞り込みではない）。上の帳の下に見出しが来るように */
  private jump(rank: YokaiRank) {
    const sec = this.sections.get(rank);
    if (!sec || sec.hidden) return;
    const head = this.book.querySelector<HTMLElement>(".zk-toolbar");
    const title = sec.querySelector<HTMLElement>(".zk-section-title") ?? sec;
    const top = title.getBoundingClientRect().top - this.book.getBoundingClientRect().top - this.book.clientTop + this.book.scrollTop;
    this.book.scrollTop = top - (head?.offsetHeight ?? 0) - 10;
  }
}

/** 詰めても字を小さくするのはここまで（それでも入らなければ横に詰める） */
const MIN_FONT_RATIO = 0.72;

/**
 * .fit を一行に収める：まず字を小さく（元の MIN_FONT_RATIO まで）、それでも入らなければ横に詰める（scaleX）。
 * 読みと書きを分けて一度ずつ行う（枠が多くてもレイアウトの計算を何度も起こさない）。隠れている枠（幅 0）は測らない
 */
export function fitLines(root: HTMLElement) {
  const els = [...root.querySelectorAll<HTMLElement>(".fit")];
  for (const el of els) {
    el.style.fontSize = "";
    (el.firstElementChild as HTMLElement).style.transform = "";
  }
  const m = els.map((el) => ({ base: parseFloat(getComputedStyle(el).fontSize), avail: el.clientWidth, w: (el.firstElementChild as HTMLElement).offsetWidth }));
  els.forEach((el, i) => {
    const { base, avail, w } = m[i];
    if (w > avail && avail > 0) el.style.fontSize = `${Math.max(base * MIN_FONT_RATIO, Math.floor((base * avail * 10) / w) / 10)}px`;
  });
  const w2 = els.map((el) => (el.firstElementChild as HTMLElement).offsetWidth);
  els.forEach((el, i) => {
    const avail = el.clientWidth;
    if (w2[i] > avail && avail > 0) (el.firstElementChild as HTMLElement).style.transform = `scaleX(${(avail / w2[i]).toFixed(3)})`;
  });
}
