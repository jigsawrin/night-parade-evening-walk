/**
 * 妖怪図鑑の正式な順（唯一の元。YOKAI_ORDER はここから作る）。**明示的なユーザーの指示が無い限り並べ替えない**
 * （tests/zukanBook.test.ts が ID の並びを完全一致で固定している）。
 *  - 通常妖怪は町に混ざりはじめる順が第一：後から混ざる妖怪が、前に見ていた妖怪の間へ割り込まない
 *    （段・wave は画面に出さない。見出しも付けない）
 *  - 大妖怪の最後に、見つけた後だけぬらりひょん（見つけるまで枠も番号も無い。だから画面に通し番号を出さない）
 *  - 最後に三大妖怪
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */

/** 通常妖怪 53 種 */
export const NORMAL_ZUKAN_ORDER = [
  // はじめからいる 12 種
  "oni", "hitodama", "chochin", "tanuki", "zashiki", "nekomata",
  "kappa", "karakasa", "rokurokubi", "tengu", "kitsune", "ittan",
  // 何度か夜を歩くうちに町へ混ざってくる 41 種（混ざる順）
  "umibozu", "hitotsume", "yukionna", "nurikabe", "konaki", "sunakake", "yamauba",
  "amanojaku", "kamaitachi", "sunekosuri", "baku", "ningyo", "azukiarai", "jorogumo",
  "teketeke", "amabie", "nue", "namahage", "kudan", "hasshaku", "nopperabo",
  "hakutaku", "tsuchigumo", "ippon_datara", "mujina", "gaki", "satori", "katawaguruma",
  "kyokotsu", "nozuchi", "makuragaeshi", "isohime", "moryo", "tsurube_otoshi", "kasha",
  "uwan", "nuppeppo", "yatagarasu", "waira", "shirikoboshi", "mokumokuren",
] as const;

/** 大妖怪 10 種 → ぬらりひょん（隠し。見つけた後だけ枠がある）→ 三大妖怪 3 体 */
export const LEGEND_ZUKAN_ORDER = [
  "daitengu", "ibaraki", "ushi_oni", "orochi", "daidara",
  "sanmoto", "shinno_akugoro", "ryomen", "gashadokuro", "amanozako",
  "nurarihyon",
  "shuten", "tamamo", "otakemaru",
] as const;
