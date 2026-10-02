/**
 * 結果画面からの行き先（URL の組み立て）。
 *  - title：タイトルへ戻る（種は付けない）
 *  - same ：同じ夜をもう一度（今の seed のまま、すぐ始める）
 *  - next ：次の夜（新しい seed で、すぐ始める）
 * ?debug・?night= など調整用のパラメータは引き継ぐ。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export type NightStartMode = "title" | "same" | "next";

export function nightSearch(search: string, mode: NightStartMode, seed: number, random: () => number = Math.random): string {
  const p = new URLSearchParams(search);
  p.delete("seed");
  p.delete("go");
  if (mode === "same") {
    p.set("seed", String(seed));
    p.set("go", "1");
  } else if (mode === "next") {
    let s = seed;
    for (let i = 0; i < 8 && s === seed; i++) s = Math.floor(random() * 900000) + 100000;
    if (s === seed) s = seed + 1;
    p.set("seed", String(s));
    p.set("go", "1");
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}
