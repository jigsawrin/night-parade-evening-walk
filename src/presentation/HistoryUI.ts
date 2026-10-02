import { kanjiTime, toKanji } from "../core/util";
import type { NightResult } from "../game/after/NightResult";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface HistoryActions {
  record(r: NightResult): void;
  emaki(r: NightResult): void;
  replay(seed: number): void;
}

function when(ms: number) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** これまでの夜（直近 10 件）：妖数・百鬼値・今宵・代表の役。記録・絵巻を見返し、同じ種でもう一夜 */
export class HistoryUI {
  private list: NightResult[] = [];

  constructor(private a: HistoryActions) {
    $("btn-history-close").addEventListener("click", () => this.hide());
    $("history-list").addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-act]");
      if (!b) return;
      const r = this.list[Number(b.dataset.i)];
      if (!r) return;
      if (b.dataset.act === "record") this.a.record(r);
      else if (b.dataset.act === "emaki") this.a.emaki(r);
      else this.a.replay(r.seed);
    });
  }

  show(list: NightResult[]) {
    this.list = list;
    $("history").classList.remove("hidden");
    $("history-list").innerHTML = list.length
      ? list.map((r, i) => {
        const lead = r.roles[0]?.name ?? r.titles[0]?.name ?? "";
        return `<li>
          <div class="h-count">${toKanji(r.total)}<small>妖</small></div>
          <div class="h-main">${esc(when(r.endedAt))}　<b>百鬼値 ${r.score}</b>　${esc(r.theme)}${lead ? `　「${esc(lead)}」` : ""}<br>
            <small>${r.reason === "shrine" ? "奉納" : "夜明け"}・${kanjiTime(r.elapsed)}・夜の種 ${r.seed}</small></div>
          <div class="h-btns">
            <button class="fuda" data-act="record" data-i="${i}">記録</button>
            <button class="fuda" data-act="emaki" data-i="${i}">絵巻</button>
            <button class="fuda" data-act="replay" data-i="${i}">この種でもう一夜</button>
          </div>
        </li>`;
      }).join("")
      : `<li class="empty">まだ記録がありません。一夜を終えると、ここに残ります（最大十夜）。</li>`;
  }

  hide() {
    $("history").classList.add("hidden");
  }
}
