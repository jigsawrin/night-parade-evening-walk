/**
 * 図鑑の一枠の HTML（一体で横一列を丸ごと使う）。DOM を持たない文字列だけ（node --test で中身を確かめる：tests/zukanBook.test.ts）。
 *  - 登録済み：名前（いちばん大きく）・格 → よみ → 別名（あるときだけ）→ 姿（墨絵 / 3D の札）→ 伝承 → この町での出会い方 → ひとこと → 記録
 *    （PC は左に姿・右に文、スマホは縦に積む。並べ方は zukan.css）
 *  - 未登録（？？？）：ヒントの一言だけ。名前・読み・別名・伝承・出会い方・ひとこと・墨絵・3D・姿の影・格を出さない。
 *    妖怪の ID も属性に書かない（枠と妖怪の対応は ZukanBook が JS の中だけで持つ）
 * 通し番号は出さない（見つけていない隠し妖怪の分が欠番になって、存在が漏れるため）。
 */
import { toKanji } from "../../core/util";
import type { VisualMode } from "../../data/yokaiInk";
import type { ZukanEntry, ZukanSection } from "../../game/ZukanRules";

export interface CardVisual {
  /** 初めの見せ方 */
  mode: VisualMode;
  /** 墨絵の URL（無ければ null：「墨絵」の札は押せず「準備中」） */
  inkUrl: string | null;
  /** 3D の姿があるか */
  hasModel: boolean;
  /** 3D を映す前の枠に置く墨判の一文字 */
  icon: string;
}

export interface CardRecord {
  /** 今夜仲間になった数 */
  tonight: number;
}

/** 一行に収める文字（ZukanBook.fitLines が外側の幅に合わせて詰める） */
export function fit(text: string, cls = "") {
  return `<span class="fit ${cls}"><span>${text}</span></span>`;
}

/** 区分の見出し（「妖 怪」のように一字ずつあける） */
export function sectionTitle(s: Pick<ZukanSection, "label">) {
  return [...s.label].join(" ");
}

/** 未登録の枠（？？？）。hint が空なら決まりの一言 */
export function unknownCardHtml(hint: string) {
  return `<h4 class="zk-name">？？？</h4><p class="zk-hint">${hint || "夜道のどこかにいるらしい…"}</p>`;
}

/** 登録済みの枠 */
export function entryCardHtml(e: ZukanEntry, v: CardVisual, r: CardRecord) {
  const alias = e.aliases.length ? `<div class="zk-alias"><span class="zk-label">別名</span>${fit(e.aliases.join("・"))}</div>` : "";
  return (
    `<header class="zk-entry-header"><h4 class="zk-name-row">${fit(e.name, "zk-name")}</h4><span class="zk-rank rank-${e.rank}">${e.rankLabel}</span></header>` +
    `<div class="zk-sub"><div class="zk-read">${fit(e.reading)}</div>${alias}</div>` +
    `<div class="zk-body">${visualHtml(e, v)}<div class="zk-info">` +
    `<section class="zk-lore"><h5>伝承</h5><p>${e.lore}</p></section>` +
    `<section class="zk-encounter"><h5>この町での出会い方</h5><p>${appearNote(e)}${e.zukanEncounter}</p></section>` +
    `<p class="zk-flavor">${e.zukanFlavor}</p>` +
    recordHtml(e, r) +
    `</div></div>`
  );
}

/** 姿の枠：墨絵（あれば）と 3D の置き場所、墨絵 / 3D の札 */
function visualHtml(e: ZukanEntry, v: CardVisual) {
  const ink = v.inkUrl
    ? `<img class="zk-ink" src="${v.inkUrl}" alt="${e.name}の墨絵" loading="lazy" decoding="async">`
    : "";
  const model = v.hasModel
    ? `<div class="zk-model-mount"><button type="button" class="zk-play" aria-label="${e.name}の姿を3Dで映す"><span class="zk-play-icon">${v.icon}</span><span class="zk-play-text">姿を映す</span></button></div>`
    : "";
  const tab = (mode: VisualMode, label: string, ok: boolean, note = "") =>
    `<button type="button" class="zk-tab" data-mode="${mode}" aria-pressed="${v.mode === mode}"${ok ? "" : " disabled"}>${label}${note}</button>`;
  return (
    `<figure class="zk-visual"><div class="zk-stage" data-mode="${v.mode}">${ink}${model}</div>` +
    `<div class="zk-visual-tabs" role="group" aria-label="${e.name}の姿の見せ方">` +
    tab("ink", "墨絵", !!v.inkUrl, v.inkUrl ? "" : `<small>準備中</small>`) +
    tab("3d", "3D", v.hasModel) +
    `</div></figure>`
  );
}

/** 行列の数に誘われて現れる妖怪は、出会い方の前にその数を添える（登録後なので隠さない） */
function appearNote(e: ZukanEntry) {
  return e.appearCount > 0 ? `<span class="zk-appear">行列が${toKanji(e.appearCount)}妖に届くと、町に姿を見せる。</span>` : "";
}

/** 記録：これまで・今夜（あれば）・縁を結んだ夜（大妖怪以上で、あれば）。保存データは増やさない */
function recordHtml(e: ZukanEntry, r: CardRecord) {
  const row = (k: string, val: string) => `<div><dt>${k}</dt><dd>${val}</dd></div>`;
  let rows = row("これまで", e.count > 0 ? `${toKanji(e.count)}妖` : "まだ加わっていない");
  if (r.tonight > 0) rows += row("今夜", `${toKanji(r.tonight)}妖`);
  if (e.rank !== "normal" && e.joinNights > 0) rows += row("縁を結んだ夜", `${toKanji(e.joinNights)}夜`);
  return `<dl class="zk-record">${rows}</dl>`;
}
