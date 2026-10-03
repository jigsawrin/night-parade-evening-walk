# 百鬼夜行 ～宵歩き～ / Night Parade: Evening Walk - 開発ルール

このリポジトリで作業するときに守るルール。

- **最初に読む**：[docs/architecture.md](docs/architecture.md)（層・流れ・「何を変えたいか → どこを見るか」・大きいファイルの一覧）
- 遊びの仕様と値：[README.md](README.md)（版ごとの節。新しい節ほど正）
- 初期の仕様書：[docs/spec-v0.1.md](docs/spec-v0.1.md)（v0.1 時点。README と食い違うときは README が正）

## 進め方

- **チャットに表示する言語は日本語**（返答・途中経過・最終報告。コードの識別子・コマンドはそのまま）。PR 本文・コミットメッセージ・ドキュメントも日本語で書く。
- `main` へ直接コミット・マージしない。作業ブランチを切り、PR を作ってレビュー待ちで止める（マージはユーザーが指示したときだけ）。
- マージ済みのブランチは、ローカル・リモートとも削除する（残すのは `main` と作業中のブランチだけ）。
- 既存の設計・演出・世界観を尊重し、全面書き換えはしない。
- 完了前に必ず `npm run typecheck`・`npm test`・`npm run build`・`npm run check:size` を通す（CI も同じ順で動く）。
- 見た目・操作が変わる変更は、ブラウザ（開発サーバ）で**デスクトップとスマホ縦画面（375×812）の両方**を確認する。

## ユーザーが決めること

- **バランス調整（数値の手触り）はユーザーが遊んで決める。** AI は勝手に値を変えず、気付いたことを報告する。対象の一覧は docs/architecture.md の「ユーザーが決めること」。

## ゲームの原則

- **新しい遊び・機能・演出のアイデアを出すときは、スキル `yoiaruki-identity`（`.claude/skills/yoiaruki-identity/SKILL.md`：類似タイトルとの差別化ルール）を読む。**
- **自動成長の禁止**：放置・時間経過・人数の閾値だけで妖怪が加入しない。加入には必ず「発見 → 判断 → 移動 → 軽い攻略」が要る。
- 戦闘なし。失敗の罰は軽く（散ってもすぐ戻る）、時間制限だらけにしない。
- 誘導は巨大なマーカーではなく、世界の中の現象（狐火・言霊・笛・提灯・光る目…）で行う。ミニマップは現在地・向き・行列の広がり・地形だけ（Encounter・狐火の行き先・噂のマーカーやナビ線を描かない。波紋は `?debug` のみ）。
- 静けさは資産：何も起きない 5〜15 秒をバグ扱いしない。「常に次のイベント」を目標にしない（間・同時数・Pacing の値は README の v0.2.1）。
- 音・演出は**煩くしない**。遠くのものは小さく・低く・残響多めに。花火などは画面中央（行列）の邪魔をしない。

## このゲームだけで完結させる

- 有料 API・外部サービス・サーバを使わない（AI API・解析・広告・ログイン・クラウド保存・オンラインランキング・外部 CDN のスクリプトを足さない）。
- 保存はブラウザの localStorage だけ（`core/SaveData.ts`）。共有は端末の機能（画像の保存・`navigator.share`）だけ。
- 実行時の npm 依存は `@babylonjs/core`・`@babylonjs/loaders` だけ。依存を増やすときはユーザーに相談する。
- モデル・音・テクスチャは手続き生成（コード）で作る。素材ファイルを足すときは `public/` に置き、ライセンスを `LICENSES/` に書く。
- フォントも同梱（`src/assets/fonts/`。画面に出る字だけのサブセット、OFL は `LICENSES/`）。画面の文言を足したら `npm run fonts`（開発時だけネットを使う。ゲームの実行時は外部へ一切つながない）。
- これらは `tests/assets.test.ts` が確かめる（URL・通信・外部 CDN が無い、依存は Babylon だけ）。

## 読み込みを軽く保つ

- **Babylon は `src/core/babylon.ts` からだけ import する**（`@babylonjs/core` の一括 import はエンジン全部＝約 5MB を読む）。新しい部品はそこに 1 行足す。
- 一部の場面でしか使わない重いもの（撮影・GLB など）は `core/babylon.ts` の動的 import の関数にして、最初の読み込みに入れない。
- `npm run build` の後に `npm run check:size`（最初に読む JS 1400KB・フォント 2000KB まで。フォントの 2000KB は最終の上限で、これ以上は上げない。超えそうなら削る：docs/architecture.md「読み込み」）。import を変えたら製品ビルド（`npm run preview`、launch.json の `hyakki-build`）でも動作を確かめる。

## ファイル分割（肥大化させない）

- 目安：**1 ファイル 400 行を超えたら分割を考え、600 行を超えたら分ける**（600 行超は `npm test` が失敗する）。1 ファイル 1 つの仕組み。
- **分けすぎない**：100 行に満たない断片を増やさない。同じ仕組みの部品は同じフォルダにまとめる（例：`world/build/`、`game/onmyoji/`）。分けたら docs/architecture.md の表を直す。
- 分け方：値は `data/`、純粋な判定は `*Rules.ts`（テストできる）、状態と Actor を持つ仕組みは別クラス、絵・音は `presentation/` の Director。
- `Game.ts` は組み立てと毎フレームの順番だけ。新しい仕組みは別ファイルに書き、Game からは生成と `update` の一行で呼ぶ。
- 既存の大きいファイル（`world/World.ts` など）に足すときは、まず docs/architecture.md の「次に分けるなら」に沿って切り出してから足す。
- 使わなくなったコード・古いコメント・デバッグ用の console.log は残さない。構成を変えたら docs/architecture.md の地図も直す。

## コードの構成

- ゲームルールは `GameBus` にイベントを流すだけ。音・光・UI・DOM は `ParadePresentationDirector` と各 Director が担当する（ルールから DOM や音楽を直接触らない）。
- データは `src/data/` に置く（データ駆動）。
- `Game.ts`・`WildYokai.ts` を肥大化させない。まとまった仕組みは別ファイル（例：`game/FestivalSystems.ts` 配下、移動入力は `game/PlayerControl.ts`、HUD は `presentation/PlayHud.ts`、加入条件は `game/WildJoinRules.ts`）へ。
- 毎フレーム全マップを総当たりしない。判定は低頻度（0.25〜1 秒）＋キャッシュ。キャラクターは Actor（InstancedMesh）を使い回す。
- 純粋ロジックは `tests/` で `node --test`（追加依存なし）。テストから読むモジュールは Babylon・DOM を実行時に読まず、パラメータプロパティ・enum を使わない（Node の型除去で動かすため）。拡張子なしの相対 import は `tests/support/resolve-ts.mjs` が `.ts` に解決する。
- Encounter は complete / expired のどちらでも `dispose()` される。一時リソースは `OwnedResources` に預け、行列へ移譲した Actor は `release()` で外す。
- 陰陽師は `game/onmyoji/` 配下（判定は `OnmyojiRules.ts` の純粋関数、値は `data/onmyoji.ts`）。祓われた妖怪は `WildYokai.rehome` で町に置き直す（Actor を使い回す。戻ったときは join ではなく rejoin）。大妖怪以上（`YokaiType.rank` が normal 以外）は祓われない。
- 子供・犬の追いかけ（`ParadeTagalongs`）は行列に加えない（数えない・祓われない・散らない）。
- 妖怪は二つの軸：格（`rank`：通常妖怪・大妖怪 `greater`・三大妖怪 `threeGreat`）と発見方式（`discovery`：通常・隠し）。混ぜない（隠しは格ではない）。「上級妖怪」「boss」という名前は使わない。大妖怪・三大妖怪・隠し妖怪は `game/legends/`（判定と出す窓口 `SpawnGate` は `LegendRules.ts`、今夜の候補は `NightLegendRoster.ts`、縁帳は `LegendProgress.ts`、値は `data/legendConfig.ts`）。妖怪ごとの違いはデータで書き、妖怪ごとの if 文を作らない。大妖怪・隠し妖怪は `spawnWild`・`spawnBonus`・Encounter・Pacing から出さない（`WildYokai` の初期配置と `spawnSpecial` だけ。隠し妖怪が姿を見せるのは `revealHidden` だけ。見つけるまで図鑑にも出さない：`game/ZukanRules.ts`）。Pacing・狐火・言霊は大妖怪・隠し妖怪へ誘導しない（`game/GuidanceRules.ts`）。足し方は docs/architecture.md の「大妖怪を足すとき」。
- 何夜も歩くと町に混ざってくる通常妖怪（41 種。通常妖怪は全部で 53 種）は `game/normal/`（解禁は `NormalUnlockRules.ts`、今夜の顔ぶれは `NormalNightRoster.ts`、配置は `NormalSpawnPlanner.ts`、値は `data/normalYokai.ts`）。すべて通常妖怪（`rank`・`discovery` とも normal）で、大妖怪の仕組みに入れない。段（`normalWave`）・由来は画面に出さない（全部「妖怪」、「新」「レア」の印も付けない）。町に置く総数は増やさず、新しい顔ぶれの分だけはじめの 12 種を減らす。一夜一体（`uniquePerNight`）は大妖怪と同じ意味ではない（白沢・八尺様など通常妖怪にもいる。`isUniquePerNight` と `isLegend`・`isSpecialYokai` を混ぜない。画面に「一夜一体」「希少」などを出さない）。ぬらりひょんの条件は `allNormalContentComplete`（最後の wave まで開き、通常の図鑑をすべて埋めた）。足し方は docs/architecture.md の「通常妖怪を足すとき」。
- 温泉宿（まだ無い）は攻略ではなく、図鑑に載った妖怪と再会して眺めるおまけの場所。依頼・収集のタスクにしない。宿泊客は `game/onsen/OnsenGuestRoster.ts`（入れるかの判定とは別）。
- 新しい Encounter を出す判断は `EncounterScheduler`（間・同時数・噂）を通す。Pacing から直接 Encounter を置かない。
- ゲームプレイ上重要な抽選は `NightSeed`（`?seed=`）の乱数列を使う。純粋な見た目の乱数は `Math.random` でよい。

## 操作の仕様（変えるときは README も更新）

| 操作 | キーボード / マウス | タッチ |
| --- | --- | --- |
| 歩く | WASD、クリックした場所へ歩く、左ボタン長押し | 指を置いた場所から滑らせた方へ歩く（画面の上へ滑らせると奥へ。どこを触っても同じ）。短くタップした場所へも歩く |
| 見回す | 矢印キー、右ドラッグ、Q・E | もう一本の指（歩きの指を置いたまま）、視点パッド（◀ ▲ ▶ ▼） |
| 寄る・引く | ホイール、`+` `-` | ピンチ（歩きながらでも）、視点パッド（寄 / 引） |

- **カメラは「押した方を向く」**：→ で右を見る、← で左を見る、↑ でカメラが下がって上を見上げる、↓ で見下ろす。ドラッグも同じ（ドラッグした方を向く）。カメラが押した方へ「移動する」のではない。
- 矢印キーはカメラ専用（移動は WASD）。
- 俯瞰は主人公（青鬼）を画面の中心にする。
- カメラが家や外周の森の中に入らないよう、遮るものがあれば手前へ寄せる（`World.cameraObstacle`）。

- 夜が終わった後（締めの演出・結果・眺める・記念撮影）は、ゲームの進行（野良妖怪・脅威・Encounter・Pacing・賑わい・地区覚醒・夜の刻）を止める。記念撮影は行列の Actor を並べ直すだけで、複製・大量生成をしない。写真の演出はゲームの状態を変えない。
- 絵巻雲は画面の端だけ（主人公・行列の中央・進行方向を隠さない）。板ポリのプールで、夜の間 10 枚まで。
- 結果（`NightResult`）はプレーンな値だけで持つ（直近 10 件を localStorage に保存。`core/SaveData.ts`）。
- 町の静的な部品は `World.group(分類, 透かすか, …)` の中で作る（建物 ID が頂点カラーのアルファに入り、建物単位の透過・写真での非表示が効く）。新しい建物・木・提灯を足すときも group で囲む。
- ブラウザの保存（localStorage）は読み書きの失敗をすべて無視する（プライベート閲覧でも遊べるように）。

## スマホ対応（縦画面を基本に）

- 縦長画面（幅 600px 以下）を常に想定する。`src/style.css` の `@media (max-width: 600px)` と `(hover: none) and (pointer: coarse)` を更新する。
- タッチの押せる大きさは **44px 以上**。下の左に視点パッド、右に行動ボタン（2×2）。HUD 同士・ボタンと重ならないこと。
- ノッチ・ホームバーを避ける：位置は `env(safe-area-inset-*)` を足して決める。
- ホバー専用の操作・説明を作らない（キーボードの説明はタッチ端末では隠れる）。
- 縦画面ではカメラの横の画角を固定する（`CameraDirector.fitAspect`）。
- 画面座標 → ワールドの変換（`scene.createPickingRay`）には **CSS ピクセル**を渡す。Babylon がハードウェアスケーリングを内部で考慮するので、描画解像度に掛け直さない（高解像度のスマホで狙いがずれる）。
- 重さに注意：粒子は使い回し、同時に出す数を絞る。

## 確認に便利なもの

- `?debug`：賑わい・Pacing・Encounter・山札・seed・地区の状態を表示。J 妖怪を呼ぶ／T 時間／K 賑わい／N Encounter／G 狐火／L 言霊／H 花火／O 陰陽師をすべて呼ぶ
- `?seed=12345`：同じ夜を再現。`?night=300`：一夜の長さ（秒）
