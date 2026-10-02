import "./assets/fonts/fonts.css";
import "./style.css";
import { Game } from "./game/Game";
import { bindOptions, loadOptions, saveOptions } from "./presentation/OptionsUI";
import { HistoryUI } from "./presentation/HistoryUI";
import { browserKV, loadHistory, loadLegendProgress, loadOnsenVisit } from "./core/SaveData";
import { onsenAccess } from "./game/onsen/OnsenVisit";
import { nightSearch } from "./game/after/nightUrl";

const $ = (id: string) => document.getElementById(id)!;

/** 温泉宿「宵霞楼」へ（?onsen。町は作らない） */
const ONSEN_PARAM = "onsen";
const goOnsen = () => (location.search = `?${ONSEN_PARAM}`);

/**
 * 宵霞楼の札：温泉宿への道（onsenEntrance）が開いていればタイトル・設定・結果に出す。
 * 噂だけならタイトルに小さく一行（大きな「？？？」は出さない）。道が開いてまだ行ったことがなければ、それとなく一行
 */
function updateOnsenEntry() {
  const kv = browserKV();
  const a = onsenAccess(loadLegendProgress(kv));
  for (const id of ["btn-onsen", "btn-opt-onsen", "btn-r-onsen"]) $(id).classList.toggle("hidden", !a.entrance);
  const note = $("title-onsen-note");
  const text = a.entrance ? (loadOnsenVisit(kv).visitNo === 0 ? "山あいへ続く古い道が、いつの間にか開いている。" : "") : a.rumor ? "山あいに、妖が集う湯宿があるらしい。" : "";
  note.textContent = text;
  note.classList.toggle("hidden", !text);
}

async function bootOnsen(canvas: HTMLCanvasElement) {
  $("title").classList.add("hidden");
  $("onsen-loading").classList.remove("hidden");
  await new Promise((r) => setTimeout(r, 50));
  const opts = loadOptions();
  const { startOnsen } = await import("./onsen/OnsenApp");
  await startOnsen(canvas, { quality: opts.quality, fade: opts.fade, volume: opts.volume, muted: opts.muted });
}

async function boot() {
  const canvas = $("game") as HTMLCanvasElement;
  if (new URLSearchParams(location.search).has(ONSEN_PARAM)) return bootOnsen(canvas);
  const startBtn = $("btn-start") as HTMLButtonElement;
  startBtn.disabled = true;
  // ローディング文言を描画してから重い生成処理へ
  await new Promise((r) => setTimeout(r, 50));
  const game = new Game(canvas);
  await game.init();
  $("loading").textContent = "";
  startBtn.disabled = false;
  (window as any).game = game;

  // 設定（歯車）と消音：タイトルでもゲーム中と同じ「音」ボタン
  const opts = loadOptions();
  game.setMuted(opts.muted);
  // 消音はボタンでも M キーでも保存する
  game.onMuteChange = (m) => {
    opts.muted = m;
    saveOptions(opts);
  };
  // これまでの夜（直近 10 件）：記録・絵巻を見返し、同じ種でもう一夜
  const pastNights = new HistoryUI({
    record: (r) => game.after.showPastRecord(r),
    emaki: (r) => game.after.showPastEmaki(r),
    replay: (seed) => (location.search = nightSearch(location.search, "same", seed)),
  });
  bindOptions(opts, (o) => {
    game.setVolume(o.volume);
    game.clouds.playScale = [0, 0.6, 1][o.clouds] ?? 1;
    game.structures.mode = (o.fade === 0 || o.fade === 2 ? o.fade : 1);
    game.engine.setHardwareScalingLevel(o.quality === 0 ? 1.25 : 1 / Math.min(window.devicePixelRatio || 1, 1.5));
  }, {
    zukan: () => game.toggleZukan(),
    history: () => pastNights.show(loadHistory(game.kv)),
  });
  // 宵霞楼の札（結果を出したときも、縁が増えて道が開いたかを見直す）
  updateOnsenEntry();
  const onResult = game.after.onResult;
  game.after.onResult = (r) => {
    onResult(r);
    updateOnsenEntry();
  };
  for (const id of ["btn-onsen", "btn-opt-onsen", "btn-r-onsen"]) $(id).addEventListener("click", goOnsen);
  const toggleMute = () => game.toggleMute();
  $("btn-title-mute").addEventListener("click", toggleMute);
  $("btn-mute").addEventListener("click", toggleMute);

  const params = new URLSearchParams(location.search);
  const seed = params.get("seed");
  if (seed) {
    $("title-seed").textContent = `夜の種 ${game.seedValue}`;
    $("title-seed").classList.remove("hidden");
  }
  const begin = () => {
    $("title").classList.add("hidden");
    $("options").classList.add("hidden");
    game.start();
    canvas.focus();
  };
  startBtn.addEventListener("click", begin);
  // 結果画面の「同じ夜をもう一度」「次の夜」：タイトルを飛ばして始める（音は最初の操作で鳴りはじめる）
  if (params.get("go")) {
    params.delete("go");
    const q = params.toString();
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}`);
    begin();
    const resume = () => game.audioEngine?.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }

  $("btn-overview").addEventListener("click", () => game.toggleOverview());
  const run = $("btn-run");
  run.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    game.setRun(true);
    run.classList.add("on");
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    run.addEventListener(ev, () => {
      game.setRun(false);
      run.classList.remove("on");
    });
  }
  // 視点パッド（ゲーム中・記念撮影）：押している間だけ、そのキーを押したことにする
  document.querySelectorAll<HTMLButtonElement>(".pad[data-key]").forEach((b) => {
    const code = b.dataset.key!;
    const on = (e: Event) => {
      e.preventDefault();
      game.input.hold(code, true);
      b.classList.add("on");
    };
    const off = () => {
      game.input.hold(code, false);
      b.classList.remove("on");
    };
    b.addEventListener("pointerdown", on);
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, off);
  });
  $("btn-zukan").addEventListener("click", () => game.toggleZukan());
  $("zukan-close").addEventListener("click", () => game.toggleZukan());
  $("btn-end").addEventListener("click", () => game.endNight("shrine"));
}

boot().catch((e) => {
  console.error(e);
  $("loading").textContent = "読み込みに失敗しました：" + (e?.message ?? e);
});
