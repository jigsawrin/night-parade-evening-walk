/**
 * 妖怪の墨絵（水墨画）の置き場所。図鑑・絵巻（将来）が同じものを使う（UI に依存しない）。
 *
 * **足し方**：元絵を art-source/yokai-ink/original/（git に入れない）に置き、`python scripts/yokai-ink.py` で
 * `public/yokai-ink/<ID>.webp` を作って、下の INKED に ID を足す
 * （tests/zukanBook.test.ts が、登録とファイルの食い違いを見張る）。UI のコードは変えなくてよい：
 * 墨絵がある妖怪は図鑑で墨絵が初めに出て、無い妖怪は 3D が初めに出る（initialVisualMode）。
 *
 * 画像の決まり（図鑑の姿の枠。はみ出さず、切り取らない：CSS は object-fit: contain）：
 *  - 背景は透明（和紙の地は画面側で出す）。800×1000 の枠に収まる大きさ（比率は絵のまま：横長の獣は横長）。中央に一体
 *  - ゲームの素材としてリポジトリに同梱する（外部 URL・CDN は使わない。保存データ localStorage にも入れない）
 *  - 手描き・自作の正式な画像だけ。3D の白黒の写しや、手続き生成の偽物を墨絵として置かない
 *  - 素材を足したら LICENSES/ にライセンスを書く
 *
 * URL はページの置き場所（GitHub Pages のサブパス）に合わせて、`import.meta.env.BASE_URL` を頭に付けて作る
 * （inkPortrait。"/yokai-ink/…" の絶対パスは書かない）。
 * ※ node --test から直接読み込むため、実行時の import を持たない（node では import.meta.env が無いので "./" にする）。
 */

/** public/ の中の墨絵のフォルダ */
export const YOKAI_INK_DIR = "yokai-ink/";

/**
 * 墨絵のある妖怪（作者：さうりん。LICENSES/yokai-ink.md）。図鑑の順（通常妖怪 53・大妖怪 10・ぬらりひょん・三大妖怪 3）。
 * 新しい妖怪の絵を足したら、ここに ID を足す
 */
const INKED = [
  "oni", "hitodama", "chochin", "tanuki", "zashiki", "nekomata", "kappa", "karakasa", "rokurokubi", "tengu", "kitsune", "ittan",
  "umibozu", "hitotsume", "yukionna", "nurikabe", "konaki", "sunakake", "yamauba",
  "amanojaku", "kamaitachi", "sunekosuri", "baku", "ningyo", "azukiarai", "jorogumo",
  "teketeke", "amabie", "nue", "namahage", "kudan", "hasshaku", "nopperabo",
  "hakutaku", "tsuchigumo", "ippon_datara", "mujina", "gaki", "satori", "katawaguruma",
  "kyokotsu", "nozuchi", "makuragaeshi", "isohime", "moryo", "tsurube_otoshi", "kasha",
  "uwan", "nuppeppo", "yatagarasu", "waira", "shirikoboshi", "mokumokuren",
  "daitengu", "ibaraki", "ushi_oni", "orochi", "daidara", "sanmoto", "shinno_akugoro", "ryomen", "gashadokuro", "amanozako",
  "nurarihyon",
  "shuten", "tamamo", "otakemaru",
];

/** 墨絵のある妖怪（ID → public/yokai-ink/ の中のファイル名） */
export const YOKAI_INK: Partial<Record<string, string>> = Object.fromEntries(INKED.map((id) => [id, `${id}.webp`]));

/** 図鑑の姿の見せ方 */
export type VisualMode = "ink" | "3d";

/** 墨絵があるか */
export function hasInkPortrait(type: string, ink: Partial<Record<string, string>> = YOKAI_INK) {
  return !!ink[type];
}

/** 墨絵の URL（base はページの置き場所。無ければ null） */
export function inkPortraitUrl(type: string, base: string, ink: Partial<Record<string, string>> = YOKAI_INK): string | null {
  const f = ink[type];
  if (!f) return null;
  return `${base.endsWith("/") ? base : base + "/"}${YOKAI_INK_DIR}${f}`;
}

/** 初めに見せる姿：墨絵があれば墨絵、無ければ 3D */
export function initialVisualMode(type: string, ink: Partial<Record<string, string>> = YOKAI_INK): VisualMode {
  return hasInkPortrait(type, ink) ? "ink" : "3d";
}

/** ページの置き場所（Vite の base。node --test では "./"） */
const PAGE_BASE: string = import.meta.env?.BASE_URL ?? "./";

/** 墨絵の URL（図鑑・絵巻が使う。無ければ null） */
export function inkPortrait(type: string) {
  return inkPortraitUrl(type, PAGE_BASE);
}
