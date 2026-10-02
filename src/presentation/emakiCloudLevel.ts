/**
 * 妖怪の数 → 絵巻らしさ（0..1）。常に最大にはしない（EmakiCloudDirector が読む）。
 *  1〜9 妖：ほぼ無し / 10〜29：非常に薄い霞 / 30〜49：画面端に見える / 50〜79：絵巻らしさが分かる /
 *  80〜99：かなり完成した絵巻 / 100〜：一段豪華
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export function cloudLevelForCount(total: number) {
  if (total < 10) return 0;
  if (total < 30) return 0.12;
  if (total < 50) return 0.3;
  if (total < 80) return 0.5;
  if (total < 100) return 0.68;
  return 0.82;
}
