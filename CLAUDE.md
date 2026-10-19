# 百鬼夜行 ～宵歩き～ 開発ルール

作業の約束。遊びと数値の正は [README.md](README.md)。どこを触るかは [docs/architecture.md](docs/architecture.md)。[docs/spec-v0.1.md](docs/spec-v0.1.md) は初期の記録なので、作業では開かない。

## 進め方

- チャット・PR・コミット・ドキュメントは日本語。識別子とコマンドはそのまま。
- `main` へ直接コミット・マージしない。作業ブランチで PR を作り、レビュー待ちで止める。マージはユーザーが指示したときだけ。
- マージ済みブランチはローカル・リモートとも消す（残すのは `main` と作業中だけ）。
- 既存の設計・演出・世界観を尊重し、全面書き換えはしない。
- 完了前に `npm run typecheck` → `npm test` → `npm run build` → `npm run check:size`。
- 見た目・操作が変わる変更は、開発サーバでデスクトップとスマホ縦（375×812）を確認する。

## ユーザーが決めること

バランス（数値の手触り）はユーザーが遊んで決める。AI は値を変えず、気付いたことを報告する。一覧は architecture の「ユーザーが決めること」。

## ゲームの原則

- 新しい遊び・機能・演出のアイデアは、先に `.claude/skills/yoiaruki-identity/SKILL.md` を読む。
- 自動成長の禁止。加入は「発見 → 判断 → 移動 → 軽い攻略」。放置・時間・人数の閾値だけでは加入しない。
- 戦闘なし。失敗の罰は軽い。時間制限だらけにしない。
- 誘導は世界の現象（狐火・言霊・笛・提灯・光る目）。ミニマップは現在地・向き・行列の広がり・地形だけ。Encounter・狐火の行き先・噂・ナビ線は描かない。波紋は `?debug` のみ。
- 静けさは資産。何も起きない数秒をバグにしない。間・同時数は README。
- 音は煩くしない。遠くは小さく・低く・残響多め。花火は画面中央（行列）を遮らない。

## 完結・読み込み・ファイル

- 有料 API・外部サービス・サーバは使わない。保存は localStorage（`core/SaveData.ts`）。共有は画像の保存と `navigator.share` だけ。
- 実行時の依存は `@babylonjs/core` と `@babylonjs/loaders` だけ。増やすときは相談。
- モデル・音・テクスチャは手続き生成。素材を足すときは `public/` と `LICENSES/`。フォントは `src/assets/fonts/`。画面の文言を足したら `npm run fonts`。
- 約束は `tests/assets.test.ts`（外部 URL なし、依存は Babylon だけ、600 行まで、フォントの字）。
- Babylon は `src/core/babylon.ts` からだけ import。撮影・GLB は動的 import。最初の JS 1400KB、フォント 2000KB まで。フォント上限は上げない。
- 400 行で分割を考え、600 行超はテストが失敗。100 行未満の断片は増やさない。値は `data/`、判定は `*Rules.ts`、状態はクラス、絵と音は Director。`Game.ts` は組み立てと毎フレームの順だけ。
- 死んだコード・古いコメント・`console.log` は残さない。構成を変えたら architecture の地図を直す。

## コードの約束

- ルールは `GameBus` にイベントを流すだけ。DOM・音・UI は Director。演出はゲームの状態を変えない。
- 判定は低頻度（0.25〜1 秒）＋キャッシュ。キャラは Actor（InstancedMesh）を使い回す。
- テストは `node --test`。実行時に Babylon・DOM を読まない。enum を使わない。
- Encounter は complete / expired のどちらでも `dispose()`。一時資源は `OwnedResources`。行列へ渡した Actor は `release()`。
- 陰陽師は `game/onmyoji/`。祓われた妖怪は `WildYokai.rehome`（戻るときは rejoin）。大妖怪以上は祓われない。子供・犬（`ParadeTagalongs`）は行列に入れない。
- 妖怪は格（`rank`: normal / greater / threeGreat）と発見（`discovery`: normal / hidden）を混ぜない。隠しは格ではない。「上級」「boss」は使わない。
- 大妖怪・三大妖怪・隠しは `game/legends/` と `data/legendYokai.ts`。`spawnWild`・`spawnBonus`・Encounter・Pacing から出さない。隠しの姿は `revealHidden` だけ。見つけるまで図鑑に出さない。Pacing・狐火・言霊は大妖怪と隠しへ誘導しない。
- 後から混ざる通常妖怪は `game/normal/`。段・由来・「新」「レア」は画面に出さない。町の総数は増やさず、はじめの 12 種を減らす。`uniquePerNight` と `isLegend` を混ぜない。ぬらりひょんの条件は `allNormalContentComplete`。
- 温泉宿「宵霞楼」は実装済み（`src/onsen/`、`?onsen`）。攻略ではなく再会の場所。依頼にしない。入れるかは `OnsenVisit`、誰がいるかは `OnsenGuestRoster`。
- 新しい Encounter は `EncounterScheduler` 経由。遊びの抽選は `NightSeed`（`?seed=`）。見た目の乱数は `Math.random`。
- 操作を変えたら README も更新する。カメラは押した方を向く。矢印はカメラ専用。俯瞰は主人公中心。遮るものがあれば手前へ寄せる（`World.cameraObstacle`）。
- 夜のあと（締め・結果・眺める・撮影）は野良・脅威・Encounter・Pacing・賑わい・地区・夜の刻を止める。撮影は Actor を並べ直すだけで複製しない。絵巻雲は画面の端、夜の間 10 枚まで。町の静的部品は `World.group`。localStorage の失敗は無視する。
- 縦画面（幅 600px 以下）が基準。タッチは 44px 以上。視点パッドは左下、行動は右。`env(safe-area-inset-*)`。ホバー専用の操作は作らない。picking には CSS ピクセル（描画解像度を掛けない）。
- `?debug`：J 妖怪 / T 時間 / K 賑わい / N Encounter / G 狐火 / L 言霊 / H 花火 / O 陰陽師。`?night=` は秒（既定 1200）。
