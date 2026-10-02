export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 角度を -PI..PI に正規化 */
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** シード付き乱数（街の生成を毎回同じにする） */
export { mulberry32 } from "./seed";

const DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/** 27 → 二十七, 100 → 百, 115 → 百十五 */
export function toKanji(n: number): string {
  if (n <= 0) return DIGITS[0];
  let out = "";
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (th) out += (th > 1 ? DIGITS[th] : "") + "千";
  if (h) out += (h > 1 ? DIGITS[h] : "") + "百";
  if (t) out += (t > 1 ? DIGITS[t] : "") + "十";
  if (o) out += DIGITS[o];
  return out;
}

export function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

/** 192 → 三分十二秒、488 → 八分〇八秒（思い出・絵巻の時刻） */
export function kanjiTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ss = s === 0 ? "〇" : s < 10 ? `〇${toKanji(s)}` : toKanji(s);
  return `${m > 0 ? `${toKanji(m)}分` : ""}${ss}秒`;
}
