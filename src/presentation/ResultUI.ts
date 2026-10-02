import { kanjiTime, toKanji } from "../core/util";
import { YOKAI, YOKAI_ICON } from "../data/yokaiTypes";
import { DISTRICT_BY_ID } from "../data/districts";
import { MAP_W, toPx, toPy } from "../world/MapPainter";
import type { NightResult } from "../game/after/NightResult";
import type { MemoryEvent } from "../game/after/NightMemoryLog";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const nameOf = (t: string) => YOKAI[t]?.name ?? t;

export interface ResultActions {
  view(): void;
  photo(): void;
  same(): void;
  next(): void;
  title(): void;
}

/** 出来事の種類 → 絵巻の判の一文字 */
function iconFor(e: MemoryEvent) {
  if (e.type && YOKAI_ICON[e.type]) return YOKAI_ICON[e.type];
  switch (e.kind) {
    case "start": return "出";
    case "milestone": return e.text.includes("百") ? "百" : "数";
    case "awaken": return "祭";
    case "merge": return "合";
    case "encounter": return "成";
    case "activity": return "遊";
    case "layer": return "層";
    case "onmyoji": return "陰";
    case "end": return e.text.includes("神社") ? "奉" : "明";
    default: return "・";
  }
}

/**
 * 結果画面（仕様：最初は要点だけ。詳細は「記録」「絵巻」「撮影」へ）。和紙・墨・巻物・木札・判子のまま。
 *  第一画面：今宵の百鬼夜行・妖数・百鬼値・代表の役／称号・今夜の友（・百妖目）
 *  記録：今夜の思い出（三大出来事）・数字・役・称号・百鬼値の内訳・今夜の地図（墨線のルート）
 *  絵巻：Night Memory Log を時系列に横へ並べた巻物
 */
export class ResultUI {
  private r: NightResult | null = null;
  private ground: HTMLCanvasElement | null = null;

  constructor(a: ResultActions) {
    $("btn-r-view").addEventListener("click", () => a.view());
    $("btn-r-photo").addEventListener("click", () => a.photo());
    $("btn-r-emaki").addEventListener("click", () => this.openEmaki());
    $("btn-r-record").addEventListener("click", () => this.openRecord());
    $("btn-r-same").addEventListener("click", () => a.same());
    $("btn-r-next").addEventListener("click", () => a.next());
    $("btn-r-title").addEventListener("click", () => a.title());
    $("btn-record-close").addEventListener("click", () => $("record").classList.add("hidden"));
    $("btn-emaki-close").addEventListener("click", () => $("emaki").classList.add("hidden"));
    // 絵巻：ホイールで横へ
    const strip = $("emaki-scroll");
    strip.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        strip.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }

  show(r: NightResult, ground: HTMLCanvasElement) {
    this.r = r;
    this.ground = ground;
    $("result").classList.remove("hidden");
    $("result-kanji").textContent = toKanji(r.total);
    $("result-reason").textContent = r.reason === "shrine" ? "神社にて、百鬼夜行を奉納した" : "夜が明けた。妖怪たちは朝霧に溶けていく…また今夜";
    $("result-stage").textContent = `夜行位　${r.stage}　／　${r.theme}`;
    $("result-score").innerHTML = `<span class="rs-label">百鬼値</span><span class="rs-num">${r.score}</span>`;
    const lead: string[] = [];
    for (const x of r.roles.slice(0, 2)) lead.push(`<span class="role-chip" title="${esc(x.text)}">${esc(x.name)}</span>`);
    if (r.titles[0]) lead.push(`<span class="title-chip">${esc(r.titles[0].name)}<small>${esc(r.titles[0].text)}</small></span>`);
    $("result-lead").innerHTML = lead.join("");
    const f = r.friend;
    $("result-friend").innerHTML = f
      ? `<span class="fr-icon">${YOKAI_ICON[f.type] ?? "妖"}</span><div><b>今夜の友：${esc(nameOf(f.type))}</b><br><small>最初の仲間。${kanjiTime(f.together)}、一緒に夜を歩いた。</small></div>`
      : `<div><b>今夜の友</b><br><small>ひとりきりの、静かな夜歩きだった。</small></div>`;
    const h = r.hundredth;
    $("result-hundredth").classList.toggle("hidden", !h);
    if (h) {
      $("result-hundredth").innerHTML = `百妖目：<b>${esc(nameOf(h.type))}</b>　<small>${kanjiTime(h.t)}${h.district ? `・${esc(h.district)}` : ""}・${h.source === "event" ? "出来事から" : "町で出会った"}</small>`;
    }
  }

  /** これまでの夜（履歴）から、その夜の記録を開く */
  showRecordOf(r: NightResult, ground: HTMLCanvasElement) {
    this.r = r;
    this.ground = ground;
    this.openRecord();
  }
  showEmakiOf(r: NightResult, ground: HTMLCanvasElement) {
    this.r = r;
    this.ground = ground;
    this.openEmaki();
  }

  hide() {
    $("result").classList.add("hidden");
    $("record").classList.add("hidden");
    $("emaki").classList.add("hidden");
  }

  // ---------------------------------------------------------------- 記録
  openRecord() {
    const r = this.r;
    if (!r) return;
    $("record").classList.remove("hidden");
    $("record-memories").innerHTML = r.highlights.length
      ? r.highlights.map((e) => `<li><span class="mem-t">${kanjiTime(e.t)}</span>${esc(this.memoryText(e))}</li>`).join("")
      : "<li>静かな夜だった</li>";
    const top = r.topType ? `${nameOf(r.topType)}（${toKanji(r.types[0][1])}妖）` : "―";
    const rows: [string, string][] = [
      ["妖怪の数", `${toKanji(r.total)}妖`],
      ["妖怪の種類", `${toKanji(r.typeCount)}種`],
      ["いちばん多い妖怪", top],
      ["祭りにした地区", r.districtsAwakened.length ? r.districtsAwakened.map((id) => DISTRICT_BY_ID.get(id)?.name ?? id).join("・") : "―"],
      ["出来事の成就", `${toKanji(r.encountersDone)}`],
      ["小さな百鬼夜行と合流", `${toKanji(r.miniMerged)}`],
      ["行列の遊びの成就", r.activitiesDone.length ? r.activitiesDone.join("・") : "―"],
      ["最高の賑わい", `${r.peakMomentum}`],
      ["歩いた地区", `${toKanji(r.districtsWalked.length)}（${r.districtsWalked.join("・") || "―"}）`],
      ["百妖", r.hundred ? "達成" : "まだ"],
      ["歩いた時間", kanjiTime(r.elapsed)],
    ];
    $("record-stats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
    $("record-types").innerHTML = r.types.map(([t, n]) => `<span class="rt">${esc(nameOf(t))}<b>${toKanji(n)}</b></span>`).join("");
    $("record-roles").innerHTML = r.roles.length
      ? r.roles.map((x) => `<li><span class="role-chip">${esc(x.name)}</span><small>${esc(x.text)}　+${x.points}</small></li>`).join("")
      : "<li><small>今夜は役がそろわなかった。次はどんな組み合わせに？</small></li>";
    $("record-titles").innerHTML = r.titles.map((t) => `<span class="title-chip">${esc(t.name)}<small>${esc(t.text)}</small></span>`).join("");
    $("record-score").innerHTML = r.scoreParts.map((p) => `<dt>${p.label}</dt><dd>${p.points}</dd>`).join("") + `<dt class="sum">百鬼値</dt><dd class="sum">${r.score}</dd>`;
    $("record-seed").textContent = `今宵は「${r.theme}」　夜の種 ${r.seed}（?seed=${r.seed} で同じ夜をもう一度）`;
    this.drawMap($<HTMLCanvasElement>("record-map"), r);
  }

  private memoryText(e: MemoryEvent) {
    if (e.kind === "firstFriend" && e.type) return `${nameOf(e.type)}が最初の仲間になった`;
    if (e.kind === "hundredth" && e.type) return `${nameOf(e.type)}が百妖目として加わった`;
    return e.text;
  }

  /** 今夜の地図：町の簡易地図に、墨線のルート・覚醒した地区・合流・百妖・最終地点だけ */
  private drawMap(cv: HTMLCanvasElement, r: NightResult) {
    const g = this.ground;
    if (!g) return;
    const W = cv.width;
    const k = W / MAP_W;
    const c = cv.getContext("2d")!;
    c.save();
    c.filter = "sepia(0.75) saturate(0.55) brightness(1.35) contrast(0.8)";
    c.drawImage(g, 0, 0, W, cv.height);
    c.restore();
    c.fillStyle = "rgba(246, 239, 220, 0.35)";
    c.fillRect(0, 0, W, cv.height);
    const X = (x: number) => toPx(x) * k, Y = (z: number) => toPy(z) * k;
    // 墨線：にじみ（太く薄い）→ 芯（細く濃い）。筆圧のように太さを揺らす
    const pts = r.route;
    if (pts.length > 1) {
      for (const [w, a] of [[7, 0.12], [3.2, 0.78]] as const) {
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          c.strokeStyle = `rgba(30, 20, 22, ${a})`;
          c.lineCap = "round";
          c.lineWidth = w * (0.75 + 0.35 * Math.sin(i * 0.7)) ;
          c.beginPath();
          c.moveTo(X(p0.x), Y(p0.z));
          c.lineTo(X(p1.x), Y(p1.z));
          c.stroke();
        }
      }
    }
    const stamp = (x: number, z: number, ch: string, red = true) => {
      const px = X(x), py = Y(z);
      c.save();
      c.translate(px, py);
      c.rotate(-0.12);
      c.fillStyle = red ? "rgba(200, 55, 45, 0.9)" : "rgba(40, 30, 30, 0.85)";
      c.fillRect(-10, -10, 20, 20);
      c.fillStyle = "#fff6e0";
      c.font = '15px "Yuji Syuku", serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(ch, 0, 1);
      c.restore();
    };
    for (const e of r.timeline) {
      if (e.x === undefined || e.z === undefined) continue;
      if (e.kind === "awaken") stamp(e.x, e.z, "祭");
      else if (e.kind === "merge") stamp(e.x, e.z, "合");
      else if (e.kind === "hundredth") stamp(e.x, e.z, "百");
    }
    if (pts.length) {
      stamp(pts[0].x, pts[0].z, "始", false);
      const last = pts[pts.length - 1];
      stamp(last.x, last.z, "終", false);
    }
  }

  // ---------------------------------------------------------------- 絵巻
  openEmaki() {
    const r = this.r;
    if (!r) return;
    $("emaki").classList.remove("hidden");
    const events = r.timeline.filter((e) => e.kind !== "layer" || r.timeline.length < 14);
    // 出来事を時の順に横へ。詰まりすぎないよう最小の間隔をあける
    const GAP = 150, PAD = 110;
    const xs: number[] = [];
    let x = PAD;
    events.forEach((e, i) => {
      const want = PAD + (e.t / Math.max(1, r.elapsed)) * events.length * GAP;
      // 時間が空いたところは少し広く（歩いた間）。ただし空白が開きすぎないよう上限つき
      x = i === 0 ? PAD : Math.min(xs[i - 1] + GAP * 2.2, Math.max(xs[i - 1] + GAP, want));
      xs.push(x);
    });
    const W = (xs[xs.length - 1] ?? PAD) + PAD + 120;
    const H = 360;
    const lineY = 190;
    // 墨線：時刻 → 横位置（出来事の間は線形）。縦のうねりは、その時刻にいた場所（ルート）から
    const tx = (t: number) => {
      if (!events.length) return PAD;
      if (t <= events[0].t) return xs[0];
      for (let i = 1; i < events.length; i++) {
        if (t <= events[i].t) {
          const a = events[i - 1].t, b = events[i].t;
          return xs[i - 1] + ((t - a) / Math.max(0.001, b - a)) * (xs[i] - xs[i - 1]);
        }
      }
      return xs[xs.length - 1];
    };
    const zs = r.route.map((p) => p.x + p.z * 0.5);
    const z0 = Math.min(...zs, 0), z1 = Math.max(...zs, 1);
    const pathPts = r.route.map((p, i) => `${tx(p.t).toFixed(1)},${(lineY - 40 + ((zs[i] - z0) / (z1 - z0 || 1)) * 80).toFixed(1)}`);
    const d = pathPts.length > 1 ? `M${pathPts.join(" L")}` : `M${PAD},${lineY} L${W - PAD},${lineY}`;
    const clouds = Array.from({ length: Math.ceil(W / 380) }, (_, i) => {
      const cx = 60 + i * 380 + (i % 2) * 140, top = i % 2 === 0;
      return `<use href="#emaki-cloud" x="${cx}" y="${top ? 8 : H - 78}" width="220" height="70" opacity="0.85"/>`;
    }).join("");
    const items = events.map((e, i) => `
      <div class="em-item ${e.kind}" style="left:${xs[i]}px">
        <div class="em-time">${kanjiTime(e.t)}</div>
        <div class="em-icon">${iconFor(e)}</div>
        <div class="em-text">${esc(this.memoryText(e))}</div>
        ${e.district ? `<div class="em-place">${esc(e.district)}</div>` : ""}
      </div>`).join("");
    $("emaki-scroll").innerHTML = `
      <div class="emaki-strip" style="width:${W}px;height:${H}px">
        <svg class="emaki-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
          <defs>
            <symbol id="emaki-cloud" viewBox="0 0 220 70">
              <path d="M18 48 C8 30 30 18 46 26 C52 8 84 6 94 22 C106 6 140 8 146 26 C164 14 196 22 190 42 C212 46 206 64 186 62 L34 62 C16 64 8 56 18 48 Z"
                fill="rgba(236,222,190,0.9)" stroke="rgba(58,40,36,0.7)" stroke-width="2.4"/>
              <path d="M70 40 q10 -14 22 -2 q-6 10 -14 4" fill="none" stroke="rgba(58,40,36,0.6)" stroke-width="2"/>
              <path d="M140 42 q10 -12 20 -1 q-6 8 -12 3" fill="none" stroke="rgba(58,40,36,0.6)" stroke-width="2"/>
            </symbol>
          </defs>
          ${clouds}
          <path d="${d}" fill="none" stroke="rgba(30,20,22,0.18)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="${d}" fill="none" stroke="rgba(30,20,22,0.8)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${items}
        <div class="em-seal hanko">百鬼</div>
        <div class="em-colophon">${toKanji(r.total)}妖・${esc(r.theme)}・夜の種 ${r.seed}</div>
      </div>`;
    $("emaki-scroll").scrollLeft = 0;
  }
}
