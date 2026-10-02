# フォントのライセンス

本プロジェクトは以下のフォントを**同梱**しています（`src/assets/fonts/`。ゲームで使う字だけのサブセット。実行時に外部から読み込まない）。いずれも SIL Open Font License, Version 1.1 で提供されています。ライセンス本文は同じフォルダの `OFL-*.txt`。

| フォント | 用途 | 配布元 | ライセンス |
| --- | --- | --- | --- |
| Yuji Syuku | 見出し・妖怪名・数 | https://fonts.google.com/specimen/Yuji+Syuku | SIL OFL 1.1（[OFL-yujisyuku.txt](OFL-yujisyuku.txt)） |
| Shippori Mincho | 本文 | https://fonts.google.com/specimen/Shippori+Mincho | SIL OFL 1.1（[OFL-shipporimincho.txt](OFL-shipporimincho.txt)） |
| Kaisei Decol | 補助（夜行位・ボタン） | https://fonts.google.com/specimen/Kaisei+Decol | SIL OFL 1.1（[OFL-kaiseidecol.txt](OFL-kaiseidecol.txt)） |

- サブセットは `npm run fonts`（`scripts/fonts.mjs`）で作り直す。画面の文言を足して字が足りなくなると `tests/assets.test.ts` が失敗する（足りない字は端末の serif で表示されるだけで、遊べなくなることはない）。
- サブセットは改変版にあたるが、OFL は改変・同梱・再配布を認めている（フォントだけを単体で販売しないこと、ライセンス本文を添えること）。フォント名の「予約フォント名」の指定はいずれも無い。
