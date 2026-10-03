/**
 * ページ全体のスクロール・引っ張りを止める（スマホ）。
 * LINE などのアプリ内ブラウザ（iPhone）は、下へ滑らせるとウィンドウごと下がる／閉じることがある。
 * キャンバスの touch-action だけでは止まらないので、スクロールできる枠の外のタッチ移動は
 * touchmove で打ち消す。図鑑・結果・設定など、中でスクロールする枠はそのまま動く。
 */

/** その要素（または親）が、中身をスクロールできる枠か */
function insideScroller(el: Element | null): boolean {
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    const y = /(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight;
    const x = /(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth;
    if (y || x) return true;
  }
  return false;
}

export function installTouchLock(): void {
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.cancelable && !insideScroller(e.target as Element | null)) e.preventDefault();
    },
    { passive: false },
  );
  // iOS Safari の 2 本指ピンチ拡大（viewport の user-scalable=no を無視する）
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault());
}

/**
 * LINE のアプリ内ブラウザ（iPhone）には、下へ滑らせるとウィンドウごと下がる LINE 自身の動作があり、
 * ページ側の touchmove では止まらない。LINE は URL に openExternalBrowser=1 があると端末の標準ブラウザで開くので、
 * LINE の中で開かれたときは、その印を付けて開き直す（一度だけ。付いていれば何もしない）。
 * 開き直す先の URL を返す（開き直さないときは null）。
 */
export function lineExternalUrl(userAgent: string, pathname: string, search: string, hash: string): string | null {
  if (!/\bLine\//i.test(userAgent)) return null;
  const params = new URLSearchParams(search);
  if (params.has("openExternalBrowser")) return null;
  params.set("openExternalBrowser", "1");
  return `${pathname}?${params.toString()}${hash}`;
}
