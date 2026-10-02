import { toKanji, formatTime } from "../core/util";
import { STAGES, type StageDef } from "../data/stages";
import { YOKAI } from "../data/yokaiTypes";
import { ZukanBook, type ZukanFound } from "./zukan/ZukanBook";
import { SHRINE, WORLD } from "../data/map";
import { MAP_H, MAP_W } from "../world/MapPainter";
import type { EarnedTitle } from "../data/titles";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** UI（仕様 21-22章）。和紙・木札・判子モチーフ。 */
export class UIDirector {
  private toastCount = 0;
  private cards = 0;
  private bannerTimer = 0;
  private minimap: CanvasRenderingContext2D;
  private mapImg: HTMLCanvasElement | null = null;
  /** ミニマップの気配の波紋（補助。ゲーム画面の中の気配が主） */
  private pings: { x: number; z: number; t: number; color: string }[] = [];
  /** ?debug のときだけミニマップに気配の波紋を出す */
  debugPings = false;
  private debugEl: HTMLElement | null = null;
  private zukan = new ZukanBook();

  constructor() {
    this.minimap = $<HTMLCanvasElement>("minimap").getContext("2d")!;
  }

  showHud(v: boolean) {
    $("hud").classList.toggle("hidden", !v);
  }

  setMapImage(img: HTMLCanvasElement) {
    this.mapImg = img;
    const c = $<HTMLCanvasElement>("minimap");
    c.width = img.width;
    c.height = img.height;
  }

  setCount(total: number, stage: StageDef, bump: boolean) {
    const el = $("count-kanji");
    el.textContent = toKanji(total);
    if (bump) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
    $("stage-jp").textContent = stage.jp;
    $("stage-en").textContent = stage.label;
    const idx = STAGES.indexOf(stage);
    const next = STAGES[idx + 1];
    if (next) {
      const p = (total - stage.minCount) / (next.minCount - stage.minCount);
      $("stage-fill").style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
      $("stage-next").textContent = `次の夜行位「${next.jp}」まで あと${toKanji(next.minCount - total)}妖`;
    } else {
      $("stage-fill").style.width = `${Math.min(1, total / 100) * 100}%`;
      $("stage-next").textContent = total >= 100 ? "百鬼夜行、ここに成る" : `百妖まで あと${toKanji(100 - total)}妖`;
    }
  }

  /** 賑わい（Festival Momentum） */
  setMomentum(v: number, name: string, up: boolean) {
    $("momentum-fill").style.width = `${Math.max(0, Math.min(100, v))}%`;
    $("momentum-name").textContent = name;
    if (up) {
      const el = $("momentum");
      el.classList.remove("up");
      void el.offsetWidth;
      el.classList.add("up");
      setTimeout(() => el.classList.remove("up"), 3000);
    }
  }

  /**
   * ミニマップに気配の波紋を出す（?debug のときだけ）。
   * 通常プレイではミニマップをクエストマップにしない：Encounter・狐火の行き先・噂の位置は描かない。
   */
  mapPing(x: number, z: number, color = "rgba(140,220,255,") {
    if (!this.debugPings) return;
    this.pings.push({ x, z, t: performance.now() / 1000, color });
    if (this.pings.length > 8) this.pings.shift();
  }

  /** ?debug 時のオーバーレイ */
  debug(lines: string[]) {
    if (!this.debugEl) {
      this.debugEl = document.createElement("div");
      this.debugEl.id = "debug";
      document.body.appendChild(this.debugEl);
    }
    this.debugEl.textContent = lines.join("\n");
  }

  setTheme(stage: StageDef) {
    document.body.dataset.stage = stage.uiTheme;
  }

  setClock(koku: string, p: number) {
    $("koku").textContent = koku;
    $("night-fill").style.width = `${p * 100}%`;
    const moons = ["🌕", "🌖", "🌗", "🌘", "🌅"];
    $("moon").textContent = moons[Math.min(4, Math.floor(p * 5))];
  }

  setObjective(px: number, pz: number, camAlpha: number) {
    const dx = SHRINE.x - px, dz = SHRINE.z - pz;
    const d = Math.hypot(dx, dz);
    // 画面上の方向：カメラの前方 (-cos α, -sin α) を上とする
    const fx = -Math.cos(camAlpha), fz = -Math.sin(camAlpha);
    const rx = fz, rz = -fx;
    const up = (dx * fx + dz * fz) / (d || 1);
    const right = (dx * rx + dz * rz) / (d || 1);
    const ang = Math.atan2(right, up);
    $("obj-arrow").style.transform = `rotate(${ang}rad)`;
    $("obj-dist").textContent = d < 20 ? "すぐそこ" : `${Math.round(d)}歩`;
  }

  setDango(n: number) {
    $("dango").classList.toggle("hidden", n <= 0);
    $("dango-n").textContent = String(n);
  }

  setRiver(v: number) {
    $("river").classList.toggle("hidden", v < 0);
    if (v >= 0) $("river-fill").style.width = `${Math.min(1, v) * 100}%`;
  }

  activity(title: string, done: number, total: number) {
    const el = $("activity");
    if (done < 0) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    $("act-title").textContent = title;
    $("act-fill").style.width = `${(done / total) * 100}%`;
    $("act-count").textContent = total === 100 ? `${done}%` : `${toKanji(done)} / ${toKanji(total)}妖 通過`;
    clearTimeout((el as any)._t);
    (el as any)._t = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  toast(text: string) {
    const box = $("toasts");
    if (box.children.length >= 3) box.firstElementChild?.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    box.appendChild(el);
    this.toastCount++;
    setTimeout(() => el.remove(), 3400);
  }

  /** 妖怪加入カード（和紙→判子） */
  joinCard(type: string, isNew: boolean) {
    const def = YOKAI[type];
    const box = $("join-cards");
    if (box.children.length >= 4) box.firstElementChild?.remove();
    const el = document.createElement("div");
    el.className = "join-card washi-card" + (isNew ? " new" : "");
    el.innerHTML = `<div class="jc-name">${def.name}</div><div class="jc-text">${isNew ? "新しい妖怪を発見！ 図鑑に記した" : "百鬼夜行に加わった！"}</div><div class="hanko">${isNew ? "初見" : "加入"}</div>`;
    box.appendChild(el);
    this.cards++;
    setTimeout(() => el.remove(), 3200);
  }

  banner(sub: string, main: string, text: string, huge = false) {
    const el = $("banner");
    el.classList.remove("hidden");
    el.classList.toggle("huge", huge);
    $("banner-sub").textContent = sub;
    $("banner-main").textContent = main;
    $("banner-text").textContent = text;
    const inner = el.firstElementChild as HTMLElement;
    inner.style.animation = "none";
    void inner.offsetWidth;
    inner.style.animation = "";
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => el.classList.add("hidden"), 4100);
  }

  hint(x: number, y: number, text: string | null, need = false) {
    const el = $("hint");
    if (!text) {
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    el.classList.toggle("need", need);
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  alert(x: number, y: number, show: boolean) {
    const el = $("alert");
    el.classList.toggle("hidden", !show);
    if (show) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  endPrompt(show: boolean) {
    $("end-prompt").classList.toggle("hidden", !show);
  }

  setOverviewAvailable(ok: boolean, on: boolean) {
    const b = $<HTMLButtonElement>("btn-overview");
    b.disabled = !ok;
    b.classList.toggle("on", on);
    b.title = ok ? "俯瞰（Space）" : "五妖以上で使える";
  }

  drawMinimap(player: { x: number; z: number; yaw: number }, parade: { x: number; z: number }[], wild: { x: number; z: number; type: string }[], discovered: Set<string>) {
    const ctx = this.minimap;
    const c = ctx.canvas;
    if (!this.mapImg) return;
    const sx = c.width / MAP_W * 6, sz = c.height / MAP_H * 6;
    const X = (x: number) => (x - WORLD.minX) * sx;
    const Z = (z: number) => (WORLD.maxZ - z) * sz;
    ctx.drawImage(this.mapImg, 0, 0);
    // 神社
    ctx.fillStyle = "#e0402a";
    ctx.font = "bold 13px serif";
    ctx.textAlign = "center";
    ctx.fillText("⛩", X(SHRINE.x), Z(SHRINE.z) + 5);
    // 近くの妖怪（発見済みは色つき、未発見は「？」）
    for (const w of wild) {
      if (Math.hypot(w.x - player.x, w.z - player.z) > 55) continue;
      ctx.fillStyle = discovered.has(w.type) ? "rgba(255,220,140,0.9)" : "rgba(200,200,255,0.8)";
      ctx.beginPath();
      ctx.arc(X(w.x), Z(w.z), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 気配の波紋（?debug のみ。1.5 秒で消える）
    const now = performance.now() / 1000;
    this.pings = this.pings.filter((p) => now - p.t < 1.5);
    for (const p of this.pings) {
      const k = (now - p.t) / 1.5;
      ctx.strokeStyle = `${p.color}${(1 - k) * 0.9})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), 3 + k * 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 行列
    ctx.fillStyle = "#ffb060";
    for (let i = 0; i < parade.length; i += 2) {
      ctx.fillRect(X(parade[i].x) - 1, Z(parade[i].z) - 1, 2, 2);
    }
    // 主人公
    ctx.save();
    ctx.translate(X(player.x), Z(player.z));
    ctx.rotate(player.yaw);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#c8372d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 4);
    ctx.lineTo(-4.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** 図鑑：これまでに仲間になった数（すべての夜の合計）と今夜の数・縁帳。画面は presentation/zukan/ZukanBook */
  buildZukan(tonight: ReadonlyMap<string, number>, allTime: Readonly<Record<string, number>>, found: ZukanFound) {
    this.zukan.build(tonight, allTime, found);
  }

  showZukan(v: boolean) {
    this.zukan.show(v);
  }

  showResult(o: {
    total: number; stage: StageDef; types: Map<string, number>; acts: string[]; time: number; reason: "shrine" | "dawn";
    titles: EarnedTitle[]; seed: number; theme: string;
  }) {
    $("result").classList.remove("hidden");
    $("result-kanji").textContent = toKanji(o.total);
    $("result-stage").textContent = `夜行位　${o.stage.jp}（${o.stage.label}）`;
    $("result-reason").textContent =
      o.reason === "shrine" ? "神社にて、百鬼夜行を奉納した" : "夜が明けた。妖怪たちは朝霧に溶けていく…また今夜";
    const types = $("result-types");
    types.innerHTML = "";
    const main = [...o.types.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id, n] of main) {
      const el = document.createElement("span");
      el.className = "rt";
      el.innerHTML = `${YOKAI[id].name}<b>${toKanji(n)}</b>`;
      types.appendChild(el);
    }
    const lead = main[0] ? `${YOKAI[main[0][0]].name}の多い、にぎやかな百鬼夜行` : "静かな夜歩き";
    $("result-acts").innerHTML =
      `<div>${lead}</div>` + (o.acts.length ? `<div>成就：${o.acts.join("・")}</div>` : "");
    $("result-time").textContent = `歩いた時間　${formatTime(o.time)}　／　妖怪の種類　${toKanji(o.types.size)}種`;
    // 称号 / 夜の記録（優劣ではなく、今夜がどんな百鬼夜行だったか）
    const tbox = $("result-titles");
    tbox.innerHTML = "";
    for (const t of o.titles) {
      const el = document.createElement("span");
      el.className = "title-chip";
      el.innerHTML = `${t.name}<small>${t.text}</small>`;
      tbox.appendChild(el);
    }
    $("result-seed").textContent = `今宵は「${o.theme}」　夜の種 ${o.seed}（?seed=${o.seed} で同じ夜をもう一度）`;
  }

  hideResult() {
    $("result").classList.add("hidden");
  }
}
