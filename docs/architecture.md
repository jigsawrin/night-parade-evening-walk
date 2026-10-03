# 百鬼夜行 ～宵歩き～ - 設計と地図（AI・開発者向け）

作業を始める前に読む「どこに何があるか」。ルールは [CLAUDE.md](../CLAUDE.md)、遊びの仕様・値は [README.md](../README.md)、初期の仕様書は [spec-v0.1.md](spec-v0.1.md)（v0.1 時点。以降の変更は README の各版の節が正）。

## 前提

- **このゲームだけで完結する**：サーバ・有料 API・外部サービス（解析・広告・ログイン・AI API・クラウド保存）を使わない。保存はブラウザの localStorage だけ。実行時の依存は `@babylonjs/core` と `@babylonjs/loaders` だけ（開発時は TypeScript・Vite）。
- 3D モデル・音・テクスチャはすべてコードで手続き生成する（`characters/models.ts`・`legendModels.ts`（大妖怪以上）・`presentation/audio/`・Canvas で描くテクスチャ）。画像・音の素材ファイルは無い（`public/models/` は GLB 差し替え用の空の受け口、`public/yokai-ink/` は図鑑の墨絵（水墨画。作者さうりん、67 点：`LICENSES/yokai-ink.md`）。墨絵は正式な画像だけを置く：`data/yokaiInk.ts`）。
- **外部からは何も読み込まない**。フォントも同梱（`src/assets/fonts/`、画面に出る字だけのサブセット）。`tests/assets.test.ts` が URL・通信・外部 CDN が無いことを確かめる。

## 読み込み（軽く・速く）

- **Babylon は `src/core/babylon.ts` からだけ読む**。`@babylonjs/core` を一括 import するとエンジン全部（約 5MB）が入るので、使う部品だけを個別のパスから読む。`MeshBuilder` も使う形（箱・円柱・円盤・地面・板・球・輪）だけ。新しい部品が要るときはここに 1 行足す（機能を足すだけのモジュールは上の `import "…"` に）
- 使うときだけ読むもの（最初の読み込みに入れない）：写真の撮影（`captureScreenshot`）・GLB の読み込み（`loadGlbMeshes`）。同じように「一部の場面でしか使わない重いもの」は `core/babylon.ts` に動的 import の関数を作る
- 最初に読む JS は約 1.2MB（gzip 約 310KB）。`npm run check:size` がビルドの大きさを見張る（上限は `scripts/bundle-size.mjs`。CI でも動く）
- フォント：使う太さだけブラウザが読む（`font-display: swap` なので、読み込み中も文字は出る）。Yuji Syuku 400／Shippori Mincho 400・800（600・700 は 800 で表示）／Kaisei Decol 400・700。合計約 1.15MB
- **フォントの上限は 2000KB（最終の上限。これ以上は上げない）**：2026-09 に、今後の文章（妖怪 3 倍ほどの図鑑・加入時の言葉・温泉宿のセリフと UI・案内図）を見込んで 1100KB から上げた。フォントの大きさは画面に出る漢字の種類で決まる（全書体の合計で 1 字あたり約 1.1〜1.3KB。2000KB でおよそ 1800 字）。10Mbps の回線で、同梱しない場合との差は約 1.5 秒まで
- 2000KB を超えそうなときは、上限を上げずに削る。効く順に：題字の Yuji Syuku（全体の約 1/3）に入れる字を見出し・妖怪名に絞る（書体ごとのサブセット）／Kaisei Decol を Shippori Mincho の太字に寄せて書体を減らす／まだ本編に出ない妖怪（future）の文を同梱しない／言い回しを見直して珍しい漢字を減らす
- 画面の文言を足したら `npm run fonts`（開発時だけネットにつなぐ。足りない字は `npm test` が教えてくれる）
- TODO（計測してから）：本編の始まりに `factory.warmup(Object.keys(MODELS))` で全モデル（後から混ざる通常妖怪 41 種を含む）の高・低テンプレートを作っている。PC・スマホ・画質ごとに「Game.init → scene ready」の時間・メモリ・長いフレームを測り、問題があれば、はじめの 12 種＋今夜の顔ぶれ（NormalNightRoster・NightLegendRoster）＋主人公・人・演出だけを先に作り、ほかは要るときに作る方式を検討する
- 製品ビルドの確認は `npm run build` → `npm run preview`（`.claude/launch.json` の `hyakki-build`）。開発サーバと製品ビルドは読み込み方が違うので、import を変えたら製品ビルドでも動かす

## 層と流れ

```
入力（core/Input, game/PlayerControl）
   ↓
ゲームルール（src/game/**）── GameBus（game/events.ts）にイベントを流すだけ ──→ 演出（src/presentation/**）
   ↑ データ（src/data/**）                                                     ParadePresentationDirector が各 Director に配る
   ↑ 町（src/world/**）・キャラクター（src/characters/**）                        音・光・UI・DOM・カメラはここだけ
```

- ルールは DOM・音・UI を触らない。演出はゲームの状態を変えない（読むのはよい：例 `PlayHud`・`OnmyojiDirector`）。
- `Game.ts` は組み立てと毎フレームの順番だけ。仕組みは別ファイルに置き、Game からは一行で呼ぶ。
- 一夜の段階は `after/AfterNightState`：title → play → showcase → result → view / photo。夜が終わった後はゲームの進行を止める。

## 何を変えたいか → どこを見るか

| やりたいこと | 主なファイル |
| --- | --- |
| 妖怪の種類・加入条件の値 | `data/yokaiTypes.ts`（種類）、`data/map.ts`（配置 SPAWNS）、`game/WildJoinRules.ts`（加入条件の振る舞い）・`game/WildCompanionRules.ts`（立ち止まる・一緒に歩く・応える・背を向ける・回り込む・潜む）、`game/WildYokai.ts`（出現・姿を見せる経路）、`game/WildIdle.ts`（うろつき・ヒントとミニマップへの一覧）、`game/WildArrivals.ts`（河童・一反木綿の現れ方） |
| 行列の数に誘われて姿を見せる妖怪（後から混ざる段ほど大きな行列で。大妖怪 90・三大妖怪 100） | `data/paradeAppear.ts`（値）、`game/ParadeAppearRules.ts`（`appearCount`・預かり `ParadeAppearHold`）、`WildYokai.reveal` の入口で預かる（下の「行列の数に誘われて現れる妖怪と音の段」） |
| 何夜も歩くと町に混ざってくる通常妖怪（41 種） | **`data/normalYokaiSecond.ts`・`normalYokaiThird.ts`（一体ずつ：図鑑の文・wave・加入条件・出る場所の候補 `sites`）**、`data/normalYokai.ts`（wave の解禁条件 `NORMAL_UNLOCK`・今夜の顔ぶれの値 `NORMAL_NIGHT`）、`characters/normalModels.ts`・`normalModelsThird.ts`（姿）、`game/WildTrails.ts`（絡新婦の蜘蛛の糸の道）、`game/normal/`（`NormalProgress` 歩いた夜の数・`NormalUnlockRules` 解禁の判定・`NormalNightRoster` 今夜の顔ぶれ・`NormalSpawnPlanner` 町の配置と夜の始まりの窓口）。下の「後から混ざる通常妖怪」 |
| 大妖怪・三大妖怪・隠し妖怪（酒呑童子・大天狗…） | **`data/legendYokai.ts`（一体ずつ、図鑑の文・`rank`・`discovery`・`awe`・`photoRole`・`omen` と、出る場所 `spawn`・加入条件 `rule` を一つの塊に。条件を変えるときはここだけ）**、`characters/legendModels.ts`（姿）、`data/legendConfig.ts`（格ごとの扱い・今夜の候補の数・温泉宿の解禁の閾値）、`game/legends/`（`LegendRules` 判定と出す窓口 `SpawnGate`・`NightLegendRoster` 今夜の候補・`LegendProgress` 縁帳・`LegendSystem` まとめ役）。足し方は下の「大妖怪を足すとき」ほか |
| 誘導の向け先（気配・狐火・言霊・Pacing が何を指してよいか） | `game/GuidanceRules.ts`（下の「誘導の向け先」） |
| 図鑑の枠・数・完成・区分・検索（隠し妖怪は見つけるまで出さない。まだ町に混ざらない通常妖怪も出さない） | `game/ZukanRules.ts`（`zukanListing`・`zukanMatches`。下の「隠し妖怪」「後から混ざる通常妖怪」）、正式な順は `data/zukanOrder.ts`、画面は `presentation/zukan/`（`ZukanBook` 本と上の帳・検索・ジャンプ、`ZukanCards` 一枠の HTML、`ZukanVisual` 墨絵 / 3D の切り替え、`ZukanModelViewer` 一つだけの 3D の姿見、`zukan.css`）、墨絵の受け口は `data/yokaiInk.ts`（下の「妖怪図鑑のデータ」） |
| 温泉宿の宿泊客（旅館そのものはまだ無い） | `game/onsen/OnsenGuestRoster.ts`、`data/onsen.ts`（下の「温泉宿」） |
| 行列の動き・散る・祓われる | `game/Parade.ts`（間隔は妖怪の大きさに合わせる：`game/ParadeSpacing.ts`。雛壇の特等席も同じ規則） |
| 犬・夜回り・僧侶 | `game/Threats.ts`、`data/map.ts`（THREATS） |
| 陰陽師・合体魔法陣・威光 | `data/onmyoji.ts`（値）、`game/onmyoji/OnmyojiRules.ts`（純粋な判定）、`game/onmyoji/OnmyojiGuards.ts`（状態機械）、`presentation/OnmyojiDirector.ts`（陣の絵） |
| 追いかける子供・犬 | `game/TagalongRules.ts`、`game/ParadeTagalongs.ts` |
| 夜行位（5・15・30・50）と演出段階 | `data/stages.ts` |
| 世界の層（屋根・裏路地・妖怪船…） | `data/worldLayers.ts`、`WildYokai.activateLayer` |
| 賑わい・気配・Pacing・Encounter・地区覚醒 | `game/FestivalSystems.ts`（まとめ役）と配下（`ParadeAttractionSystem`・`FestivalMomentum`・`NightPacingDirector`・`EncounterScheduler`・`EncounterDirector`・`encounters/*`・`DistrictAwakeningSystem`）、値は `data/encounters.ts`・`data/districts.ts`・`data/presences.ts` |
| 行列の遊び（千本鳥居・太鼓橋…） | `data/activities.ts`、`game/Activities.ts` |
| 主人公の移動入力（WASD・タップ・指のスライド） | `game/PlayerControl.ts`、`game/TapMove.ts`（タップ移動）、`core/TouchSteer.ts`（指のスライド）、`core/Input.ts`、印は `presentation/TouchSteerMark.ts`、iPhone のアプリ内ブラウザ（LINE など）で下へ滑らせるとウィンドウが下がるのを止めるのは `core/TouchLock.ts` |
| カメラ | `presentation/CameraDirector.ts` |
| 夜の間の HUD（ヒント・「！」・ミニマップ） | `presentation/PlayHud.ts`、`presentation/UIDirector.ts`、`index.html`、`style.css` |
| イベントへの演出（一言・音・光） | `presentation/ParadePresentationDirector.ts` |
| 音楽・効果音 | `presentation/audio/`（`MusicDirector`・`AudioDirector`・`Instruments`・`AudioEngine`）。夜行位ごとの楽器 A〜F は `data/stages.ts` の `STAGES`、中盤から百妖までの段（小鼓・摺鉦・笙・琵琶・龍笛・法螺貝）は同じファイルの `MUSIC_SWELLS`（下の「行列の数に誘われて現れる妖怪と音の段」） |
| 粒子・花火・言霊・絵巻雲 | `presentation/VFXDirector.ts`・`FireworksDirector.ts`・`KotodamaDirector.ts`・`EmakiCloudDirector.ts` |
| 町の地形・建物 | `data/map.ts`（配置）、`world/World.ts`（当たり判定・歩ける・視線・灯り・門）、`world/WorldKit.ts`（家・屋根・鳥居・木・提灯などの部品と結合）、`world/build/`（`town.ts` 町なか・`landmarks.ts` 神社・寺・稲荷・横丁・`nature.ts` 川・林・地面・空）。**組み立ての順番（World.build）を変えると町の乱数の並びが変わる** |
| 結果・称号・役・百鬼値・絵巻 | `game/after/NightResult.ts`、`data/titles.ts`、`data/roles.ts`、`presentation/ResultUI.ts` |
| 思い出の記録 | `game/after/NightRecorder.ts`（イベントを聞く）、`NightMemoryLog.ts` |
| 温泉宿「宵霞楼」 | `src/onsen/`（遅延読み込み：`OnsenApp` 入口・`OnsenWorld` と `build/` 箱庭（二階・三階は `upperBuild`）・`OnsenAtmosphere` 空気・`OnsenGuests` 客の動き・`OnsenBath` 湯に入る・`OnsenUI` 画面）、`game/onsen/`（`OnsenVisit` 入れるか・訪問・宿泊客、`OnsenPlacementRules` 居場所、`OnsenGuestRoster` 抽選、`OnsenGroundRules` 階・階段・湯の深さ・湯あたり）、`data/onsen.ts`（人数・区域）・`data/onsenMap.ts`（間取り・居場所）。下の「温泉宿「宵霞楼」」 |
| 記念撮影 | `game/after/PhotoFormation.ts`（陣形）・`PhotoPose.ts`（ポーズ・カメラの方を向く `faceYaw`）・`PhotoStage.ts`（並べ直す）・`PhotoSpot.ts`（場所：参道の鳥居を背にした広場 `shrinePhotoSpot`・近くの開けた場所 `findPhotoSpot`）、`data/photo.ts`、`presentation/PhotoModeDirector.ts`（撮影の操作・カメラ・隠す）・`AfterNightDirector.ts`（夜の後の流れ）・`PhotoUI.ts`・`PhotoShot.ts`（撮る・保存・共有）・`ShareTools.ts`。建物を隠すと地面の家の影も消す（`World.setHouseShadowsHidden`）、御神木など一つずつ隠す（`StructureVisibilityDirector.setHiddenIds`） |
| デバッグ（?debug のキー・表示） | `game/DebugTools.ts` |
| Babylon の部品・遅延読み込み | `core/babylon.ts` |
| フォント | `src/assets/fonts/`（生成物）、`scripts/fonts.mjs` |
| 保存（消音・設定・図鑑・直近 10 夜・縁帳・歩いた夜の数） | `core/SaveData.ts`（縁帳の中身は `game/legends/LegendProgress.ts`、歩いた夜の数は `game/normal/NormalProgress.ts`） |
| 乱数（?seed=） | `core/seed.ts`（`NightSeed.stream(名前)`） |

## イベントを足すとき

1. `game/events.ts` の `GameEvents` に型を足す。
2. ルール側で `bus.emit`。
3. 演出は `ParadePresentationDirector` で受ける。記録に残すなら `NightRecorder`、称号・賑わいに効くなら `FestivalSystems`。

## 妖怪の二つの軸：格と発見方式

妖怪は二つの軸で分ける。**二つは別のもので、混ぜない**（`data/yokaiTypes.ts` の `rank` と `discovery`。すべての妖怪に書く）。

| 軸 | 値 | 意味 |
| --- | --- | --- |
| 格（`rank`） | `normal` 通常妖怪／`greater` 大妖怪／`threeGreat` 三大妖怪 | 強さ・格式。大妖怪以上は一夜に一体・祓われない・加入条件は `legend`。見出し・思い出の重み・写真の特等席・縁帳の分類は格で決まる（`RANK_INFO`） |
| 発見方式（`discovery`） | `normal` 通常／`hidden` 隠し | 見つけ方。隠し妖怪は格の抽選とは別に今夜いるかを決め、誘導（下）からは外れる |

- 例：大天狗 = 大妖怪＋通常、酒呑童子 = 三大妖怪＋通常、ぬらりひょん（将来）= 大妖怪＋隠し、珍しい小妖怪（将来）= 通常妖怪＋隠し
- 分類名は「通常妖怪・大妖怪・三大妖怪」だけ（画面では「妖怪・大妖怪・三大妖怪」。`ZukanRules.zukanRankLabel`）。「隠し妖怪」は格と同列の分類にしない（縁帳では「秘」の印などで表す）
- 三大妖怪は酒呑童子・玉藻前・大嶽丸の三体だけ。`rank: "threeGreat"` そのものが三大妖怪を表す（別のまとまりのタグは要るときまで作らない）
- 大妖怪は正式に 10 種：大天狗・茨木童子・牛鬼・八岐大蛇・ダイダラボッチ・山本五郎左衛門・神野悪五郎・両面宿儺・ガシャドクロ・天逆毎（この順が図鑑の順）。白沢は通常妖怪（一夜一体）へ移した（ID は hakutaku のまま）。海坊主は大妖怪にしない（通常妖怪）
- **一夜一体（`uniquePerNight`）は大妖怪と同じ意味ではない**：`isUniquePerNight` は「一夜に最大一体」だけ、`isLegend` は格（greater・threeGreat）だけ、`isSpecialYokai` は大妖怪以上か隠し妖怪。一夜一体の通常妖怪（白沢・八尺様…）は今夜の大妖怪の候補を見ず（`SpawnGate.claim` が一体だけ通す）、汎用の窓口（報酬・Encounter）からは出ない（`allowsGeneric`）。legendJoin・縁帳の格の数・温泉宿の解禁には入らない
- 三つ目の軸として、図鑑に数えるか（`zukanAvailability`：`active`／`future`）がある。下の「妖怪図鑑のデータ」
- 通常妖怪には、町に混ざりはじめる段（`normalWave`：0 = はじめの 12 種、1〜6 = 後から混ざる 41 種）がある。**内部だけ**で、画面・図鑑・加入の演出には出さない（画面では全部「妖怪」）。由来の区分（`originKind`：来訪神・仏教・神話・予言獣・近現代の怪談）も内部だけ。下の「後から混ざる通常妖怪」

## 妖怪図鑑のデータ

図鑑の情報は `YokaiType` の `name`・`reading`・`aliases?`・`rank`・`discovery`・`lore`・`zukanEncounter`・`zukanFlavor`（重複するフィールドを作らない）。図鑑は「一体の妖怪をじっくり見る場所」（結果の絵巻は「一夜を振り返る場所」。役割を混ぜない）。

| 項目 | 使う場所 |
| --- | --- |
| `name` | ゲーム中で使う短い正式名。名前の見出し・加入カード・写真・結果・図鑑の見出し（例：玉藻前・山本五郎左衛門・八岐大蛇） |
| `reading` | 図鑑だけ。ひらがな（例：さんもとごろうざえもん）。名前に連結しない |
| `aliases` | 図鑑だけ。別名のある妖怪にだけ書く（空の配列にしない。無ければ図鑑の欄ごと出さない。「なし」と書かない） |
| `rank` | 図鑑の見出しに「妖怪・大妖怪・三大妖怪」 |
| `lore` | 図鑑の「伝承」：本来の妖怪について（伝承・原典・一般に語られる性質）だけ。1〜2 文。このゲームでの出会い方を書かない |
| `zukanEncounter` | 図鑑の「この町での出会い方」：このゲームでの出会い方・加入条件（登録後に読むので隠さない）。**加入条件・出る場所を変えたらここも直す**（`tests/zukanBook.test.ts` が数・相手・地区・賑わいの食い違いを見つける） |
| `zukanFlavor` | 図鑑のひとこと：このゲーム世界の情景を一行で（8〜35 字）。史実の説明にしない。全員を同じ文体にしすぎない |

- 「玉藻前（たまものまえ／九尾の狐）」のような名前の表示はしない。`reading`・`aliases` を読むのは `ZukanRules`・図鑑の一枠（`presentation/zukan/ZukanCards.ts`）だけ（`tests/roster.test.ts` が確かめる）
- **一体で横一列**：PC は左に姿（約 38%）・右に文、スマホは縦積み（名前 → よみ・格 → 姿 → 伝承 → 出会い方 → ひとこと → 記録）。登録済みの一枠は 見出し（名前・格）→ よみ → 別名（あるときだけ）→ 姿（墨絵 / 3D の札）→ 伝承 → この町での出会い方 → ひとこと → 記録（これまで・今夜・大妖怪以上は縁帳の縁を結んだ夜。保存データは増やさない）。**名前・よみ・別名は一行**（長いときは字を小さく、さらに横に詰める：`ZukanBook.fitLines`）
- **未登録（？？？）**：ヒントの一言だけ（`ZukanCards.unknownCardHtml`）。名前・読み・別名・文・墨絵・3D・姿の影・格・妖怪の ID（DOM の属性）を出さない。枠と妖怪の対応は `ZukanBook` が JS の中だけで持つ
- **上の帳（sticky）**：題・出会った数・閉じる・検索・「登録済みのみ」・区分へのジャンプ（妖怪・大妖怪・三大妖怪。絞り込みではなく目次）。区分の見出しは「妖 怪」「大 妖 怪」「三 大 妖 怪」だけ（通常妖怪の中に段・wave の見出しを付けない。隠し妖怪の札も作らない）。**通し番号は出さない**（見つけていない隠し妖怪の欠番から存在が漏れる）
- **検索**（`ZukanRules.zukanMatches`）：登録済みだけを名前・よみ・別名で探す。未登録の枠は、検索の文字がある間は並べない（正体を推し量れない）。検索・「登録済みのみ」は枠を作り直さずに隠す（`zukanListing` の結果で `hidden`）。保存はしない（「登録済みのみ」とスクロールの位置は同じページの間だけ覚える）。検索欄で字を打っている間は、ゲームのキー（Z・M・Space など）を効かせない（`core/Input` が文字の欄の打鍵を無視する）
- **姿（墨絵 / 3D）**：妖怪ごとに切り替える（`ZukanVisual`。図鑑全体の一括ではない）。初めは墨絵があれば墨絵、無ければ 3D（`data/yokaiInk.ts` の `initialVisualMode`）。今は図鑑の全員に墨絵がある。墨絵が無い妖怪（新しく足した妖怪など）の「墨絵」の札は「準備中」で押せない（3D の白黒の写しや手続き生成の偽物を墨絵の代わりにしない）
- **3D の姿見**（`ZukanModelViewer`）は図鑑全体で一つだけ（一つの canvas・Engine・Scene。ゲームとは別。背景は透明。町と同じ `ModelFactory` のモデル）。「姿を映す」「3D」を押した枠へ canvas を移し、前の妖怪の姿は片付けてから作る（同時に二体を描かない。図鑑を開いただけでは作らない）。ドラッグで回す・ピンチ／ホイールで寄る（canvas の中だけ指とホイールを取る。外は図鑑をスクロールできる）。墨絵に切り替える・枠が画面の外へ出る（IntersectionObserver）・検索で隠れる・図鑑を閉じると止める。透明な背景では GlowLayer が光る部分を消すので使わない
- **墨絵の受け口**（`data/yokaiInk.ts`、UI に依存しない。次の絵巻も同じ `inkPortrait`・`hasInkPortrait` を使う）：元絵は `art-source/yokai-ink/original/`（重いので git に入れない：`.gitignore`）。`python scripts/yokai-ink.py`（Python と Pillow。開発時だけ）で透明な余白を切り、800×1000 の枠に収め（比率は絵のまま）、WebP（quality 92・透明度は無劣化。1 枚 200KB ほど）にして `public/yokai-ink/<ID>.webp` に置く。`yokaiInk.ts` の `INKED` に ID を足すだけで図鑑に出る（UI のコードは変えない）。URL は `import.meta.env.BASE_URL` から作る（GitHub Pages のサブパスを壊さない。`/yokai-ink/…` を直書きしない）。背景は透明（和紙の地は画面側）・中央に一体。CSS は `object-fit: contain`（切り取らない）・`loading="lazy"`。外部 URL・localStorage には入れない。登録とファイルの食い違いは `tests/zukanBook.test.ts` が見つける
- 隠し妖怪は見つけるまで何も出さない（下の「隠し妖怪」）。隠しは格ではないので、格の欄は「大妖怪」など（「隠し妖怪」と書かない）
- **lore の考証**：「史料上の伝承」「後世に定着したイメージ」「ゲーム独自の設定」を混同しない。ゲーム独自の設定は `zukanEncounter`・`zukanFlavor`・加入条件・出現の演出・`hint` に書き、`lore` には書かない。例：ぬらりひょんが江戸期から「妖怪の総大将」だったとは書かない／ガシャドクロを古代・江戸の妖怪と書かない（昭和に広まった）／両面宿儺を単純な悪と断定しない（飛騨では英雄・守護者）／白沢を日本固有としない（中国の瑞獣）／天逆毎を古代神話から広く伝わった存在と断定しない／八咫烏を古来の一般的な妖怪と書かない／なまはげを一般的な妖怪伝承と断定しない（来訪神）／餓鬼の仏教的な由来を消さない／うわん・わいらに後世の創作の設定を原典として足さない／火車の亡骸・流血を生々しく書かない

### まだ本編に出ない妖怪（`zukanAvailability: "future"`）

- 名簿と図鑑の文だけを先に決めた妖怪。`zukanAvailability: "future"` を書く（姿・加入条件・音・ヒントの項目は仮の値でよい。使われない）
- **図鑑の枠も分母も無い**（？？？も出さない）。今夜の候補（`legendCandidates`）・温泉宿の客（`onsenEligible`）・デバッグの J にもならない。判定は `isActiveYokai`（`ZukanRules.isZukanTarget` も通す）。今の図鑑が N / N なら、future を足しても N / N のまま
- **hidden とは別**：hidden は「実装されているが存在を秘密にしている」、future は「ゲームプレイ側がまだ無い」。future を `discovery` に混ぜない（隠し妖怪を名簿だけ先に足すなら future＋hidden）
- 本編に実装するとき：family・rule・se・hint・出る場所などを書き、`zukanAvailability` を消す（書かなければ active）。それだけで `YOKAI_ORDER` の場所に図鑑の枠が現れる
- 今 future の妖怪はいない（2026-09 に大妖怪 10 種・三大妖怪 3 体・ぬらりひょん、続けて後から混ざる通常妖怪を本編に出した。今は 41 種・通常妖怪は全部で 53 種）。future（ゲームプレイ側がまだ無い）と、まだ町に混ざらない通常妖怪（`normalWave`。実装済みで、進むと現れる）は別
- `YOKAI_ORDER` は図鑑の正式な順で、**唯一の元は `data/zukanOrder.ts`**（`NORMAL_ZUKAN_ORDER`・`LEGEND_ZUKAN_ORDER`。データの定義の並びを変えても図鑑の順は変わらない）：通常妖怪 53 種（町に混ざる順。後から混ざる妖怪が前の妖怪の間へ割り込まない）→ 大妖怪 10 種 → ぬらりひょん（見つけた後だけ）→ 三大妖怪 3 体。**明示的な指示が無い限り並べ替えない**（`tests/zukanBook.test.ts` が完全一致で固定）。新しい妖怪を足すときは、ここのどこに入れるかをユーザーに確かめる
- 名簿にまだ載せない今後の大妖怪の空き枠は `legendConfig.ts` の `PLANNED_YOKAI`（名前の無い仮の ID。テストの抽選用。以前ここにいた磯姫・尻こぼし・鵺は通常妖怪として実装した）

## 大妖怪を足すとき

大妖怪（`greater`）は、ほぼデータだけで足せる。`Game.ts`・`WildYokai.ts`・`WildJoinRules.ts` に妖怪ごとの if 文を書かない。

1. **`src/data/legendYokai.ts` の `ENTRIES`** に一体足す（`def` と、出る場所 `spawn`）。`YOKAI` と `SPAWNS` にはここから入る。図鑑の順は `data/zukanOrder.ts` の `LEGEND_ZUKAN_ORDER` に足す
   - `rank: "greater"`・`discovery: "normal"`。`uniquePerNight` は省略してよい（大妖怪以上は一夜一体）
   - `rule: { kind: "legend", conditions: [...], ask, ok }`：条件はすべて満たす（AND）。使える条件は `specificYokai`・`totalCount`・`activityCount`・`districtAwakened`・`encounterComplete`・`momentum`・`typeVariety`（行列にいる妖怪の種類の数）。足りないときの言葉は `LegendRules.legendMissing` が作るので書かなくてよい。ask は足りないときの一言、ok は認めたときの一言
   - `awe`：陰陽師への効き目（`{ mode: "rout", text, memory }` で退散させる／`slowCast`・`lowerSuspicion` で弱める／書かなければ効かない）
   - `photoRole`：雛壇の特等席（`centerpiece` 主人公のすぐ後ろの中央／`flank` 両脇／`rear` 最後列の後ろの中央／`air` 上空の中央）
   - `omen`：町にいる間の気配（`kind` は今ある音・光の種類、`cues` は将来の専用演出の手がかり）
   - 別名・呼称があれば `aliases`（図鑑の詳細にだけ出る。表示名 `name` は短く）。温泉宿での居場所・寸劇の手がかりは `onsen`（任意）
   - `name`・`reading`・`family`・`se`・`scale`・`lore`・`zukanEncounter`（加入条件 `conditions` を正確に文にする）・`zukanFlavor`・`hint` は通常の妖怪と同じ
2. **`YOKAI_ICON`**（`data/yokaiTypes.ts`）に墨判の一文字を足す。陰陽師の退散の理由は格の高い順、同じ格なら `YOKAI_ORDER` の順
3. **見た目**：`src/characters/legendModels.ts` の `LEGEND_MODELS` に形を足す（部品の道具は `modelParts.ts`。伸びる首・脚は `limb`）
4. **出る場所**：同じ塊の `spawn` に **一か所**（`appearAt`＝夜の進み具合で現れる、`layer`＋`keepRule`＝世界の層が開くと現れる、など）。歩ける場所か開発サーバで `game.world.isWalkable(x, z, 1)` を確かめる。今夜の候補に入らなければ置かれない。夜の途中に出すなら `WildYokai.spawnSpecial`（`spawnWild`・`spawnBonus` からは出せない）
   - **伝承に沿わせる**：出る場所は伝承の土地に近い町の場所、加入条件は伝承にちなむ百鬼夜行にする（例：牛鬼は川辺で河童と、ガシャドクロは墓地で人魂と、玉藻前は稲荷で狐と狐火）。ゲーム独自の設定は加入条件・演出で足してよいが、図鑑の lore には書かない
5. **`src/data/legendConfig.ts` の `PLANNED_YOKAI`** に書いてあれば消す。今夜の候補の数（`NIGHT_ROSTER`）を変えるならここ
6. 画面の文言を足したので `npm run fonts`
7. `tests/legendYokai.test.ts` が、姿・墨判・出る場所・条件の参照先が揃っているかを確かめる。特別な確かめ方が要れば足す。`npm run typecheck`・`npm test`・`npm run build`・`npm run check:size`
8. 新しい種類の条件が要るときだけ：`data/yokaiTypes.ts` の `LegendCondition` に一つ足し、`LegendRules.checkCondition`・`describeLegendRule` の switch と、材料が要るなら `LegendContext`（`LegendSystem` がイベントを聞いて集める）に足す

流れ（変えない）：町に姿と気配がある（`omen`）→ 会いに行く → 近くで求めを聞く（`legendMeet`。縁帳の「会った」）→ 条件を満たすと認めて加わる（`join` の後に `legendJoin`。見出し・思い出・結果の `legends`・縁帳の「仲間にした」）。

## 三大妖怪を足すとき

酒呑童子・玉藻前・大嶽丸の三体だけを想定する。手順は大妖怪と同じで、違うのは：

- `rank: "threeGreat"`。見出しは「三 大 妖 怪」、思い出の重みは 95（今夜の三大出来事にほぼ必ず入る）、雛壇では `photoRole: "centerpiece"`（同じ立ち位置なら三大妖怪が中央）
- 一夜に 0〜1 体の想定：三体が揃ったら `NIGHT_ROSTER.threeGreat` を `{ min: 0, max: 1 }` にする予定（三体とも揃ったが、値は遊んで決めるので今は `{ min: 1, max: 1 }` のまま＝毎晩一体）
- 一夜で三体すべてを集めることを基本の攻略にしない。何夜もかけて縁帳を埋める
- 例：玉藻前は `name: "玉藻前"`・`aliases: ["九尾の狐", "金毛九尾の狐"]`（図鑑の表示名は玉藻前だけ。詳細に「別名　九尾の狐・金毛九尾の狐」）。玉藻前は伝承で正体を見破ったのが陰陽師なので、陰陽師を退けない（`awe` を書かない）

## 隠し妖怪

隠し妖怪は、**存在そのものが隠されている妖怪**。通常の妖怪のように「？？？　どこかにいるらしい…」という図鑑の枠すら、はじめは見せない。

- `discovery: "hidden"`（格は別に書く。ぬらりひょんは `rank: "greater"`、珍しい小妖怪なら `rank: "normal"`）
- **見つけるまで図鑑に無い**：枠・？？？・名前の字数・ヒント・別名・一言・格・総数への加算のどれも出さない（`game/ZukanRules.ts` の `isZukanVisible`・`visibleZukanTypes`。図鑑の画面はこの結果を並べるだけ）
- **図鑑の「登録」の意味が違う**：通常の妖怪の図鑑は「仲間になった記録」（仲間にしたら登録。見ただけでは登録しない）。隠し妖怪の図鑑は「存在を見つけた記録」（見つけたら登録。仲間にしていなくてもよい）。判定は `isZukanSeen`。仲間になった数（`count`）は登録とは別に持つ
- **通常の図鑑完成の分母に入れない**：通常の妖怪を全部登録すれば、隠し妖怪を見つけていなくても「N / N 完成」（`zukanCompletion` の `normalComplete`）。隠し妖怪を見つけると、枠と登録が同時に一つ増えて **N+1 / N+1**（N / N+1 にはしない。完成が未完成に戻らない）。完成した瞬間は `completionReached` で分かる
- **隠し妖怪の出現条件は `allNormalContentComplete`**（通常妖怪を知り尽くした：後から混ざる通常妖怪の最後の wave まで開き、そのうえで通常の枠がすべて埋まった。その妖怪自身を含めない）。`normalComplete` は「今見えている図鑑の完成」なので、はじめの 12 種や途中の wave だけ埋めた完成でも true になる。そこでぬらりひょんに会わせない
- 見つけただけの隠し妖怪も、図鑑では名前・読み・別名・一言・格を普通に出す（仲間になった数は出さない）
- **発見と加入は別の出来事**：「新たな妖怪が図鑑に記された」は見つけたときの一度だけ。見つけた後に加わっても「百鬼夜行に加わった」だけ（初見・判子「初見」にしない）。演出の「図鑑上で既知か」は `ZukanRules.ZukanKnown`（起動時は `knownZukanTypes`＝`isZukanSeen`、見つけたら announce に関係なく既知へ）。大妖怪に会っただけ（met）では既知にしない
- **姿を見せるのは専用の経路だけ**：`WildYokai.revealHidden(type, source, announce)`。初期配置・気配の段階（presence）・地区覚醒・世界の層・夜の進み（`appearAt`）では、入口で隠し妖怪を外し（待ち行列にも積まない）、さらに `reveal` の門（`LegendRules.revealAllowed`）が最後に止める（入口と出口の二重の守り）
- 姿を見せたら発見は必ず確定する：`specialDiscovered`（一夜に一度。格は問わない）→ 縁帳の `met` にすぐ保存（加入していなくてもよい）→ 図鑑に登録される。`revealHidden(type, source, announce)` の `announce` は**演出だけ**を決める（false なら知らせ・見出しを出さず、将来の会話で名前を出す、など）。発見の記録は announce に関係なく行う
- `known`：この発見より前の夜にもう見つけていた。前に見つけた妖怪が町にまた現れても「新たな妖怪」とは知らせない（演出は `!e.announce || e.known` なら何も出さない）
- 見つけた後の加入は、その妖怪の加入条件（通常妖怪の隠しなら touch・food など、大妖怪の隠しなら legend）
- **誘導から外す**：NightPacing（再提示・狐火の道しるべ）・言霊・通常の気配（ParadeAttraction）・近くのヒント・ミニマップの「！」は隠し妖怪を教えない。向け先の一覧（content）にも入れない（`GuidanceRules.wildContent` が null。発見方式を先に見るので、気配 `omen` の無い隠し妖怪も通常妖怪扱いに落ちない）。一度見つけた後でも案内しない
- **一夜一体**が既定（`isUniquePerNight`。何体もいる隠し妖怪にするときだけ `uniquePerNight: false`）。出すのは初期配置と `WildYokai.spawnSpecial`（置くだけで姿は見せない）
- 今夜いるかは格の抽選とは別の乱数（`legendHidden`）で、一種類ずつ資格と確率を見て決める（一夜に一種類まで）。見つかり方は `data/legendConfig.ts` の `HIDDEN_DISCOVERIES`
- 大妖怪の隠し妖怪は、写真では普通に大妖怪の特等席に立つ（格で決まる）

### ぬらりひょん

- 定義：`data/legendYokai.ts` の `nurarihyon`（`rank: "greater"`・`discovery: "hidden"`。茶屋の縁台に座って茶をすすっている）。見つかり方は `HIDDEN_DISCOVERIES.nurarihyon`
- 見つかり方：`firstSource: "onsen"`・`requiresZukanComplete`・`requiresUnlock: "onsenEntrance"`・`postDiscoveryWorldChance`（仮 0.1）。**町で初めて見つかることは無い**（温泉宿がまだ無いので、今は見つける経路そのものが無い）
- 見つけた後の町：今夜の候補に入った夜は、茶屋の縁台（`spawn`）に隠れている。**すぐそばまで来たら気づく**（`LegendSystem.noticeHidden` → `WildYokai.hiddenAt`・`revealHidden`。主人公が `noticeRadius`（無ければ `HIDDEN_NOTICE_RADIUS` 仮 5 歩）まで近づいたとき）。案内は無い。加入条件は賑わい「大賑わい」（仮）
- 流れ：

```
通常妖怪を知り尽くした（最後の wave まで開き、隠し妖怪を除く通常の図鑑がすべて埋まった）＋ 温泉宿への道
  ↓
次に温泉宿へ行くと、必ずいる（宿泊客の抽選に任せない：LegendProgress.onsenFirstDiscoveries → OnsenGuestRoster の forcedGuests）
  ↓
見つける（revealHidden → specialDiscovered → 縁帳の met）
  ↓
図鑑に項目が増える（N / N → N+1 / N+1。今の名簿の最後の wave なら 66 / 66 → 67 / 67）
  ↓
以後、町の夜にもまれに今夜の候補に入る（hiddenWorldEligible・postDiscoveryWorldChance）。温泉宿でも通常の隠し妖怪の抽選に入る
```

- **見つけるまで町には出ない**：図鑑を埋める前・温泉宿で会う前に、町の夜の隠し妖怪の抽選でぬらりひょんが出ることは無い（`hiddenWorldEligible`）
- **温泉宿での初めての出会い**：「ぬらりひょんが解禁されました！」とは知らせない。いつもの宿に、見覚えのない老人が一番いい席で当然のように茶を飲んでいる。プレイヤー自身が気づき、近づき、話して、初めて名前「ぬらりひょん」が出る。そして「新たな妖怪が図鑑に記された」。派手な大妖怪の演出はしない。鍵探し・依頼・パズル・戦いも要らない（図鑑を埋めたこと自体が条件）
- **町で再び会うとき**：一度見つけたからといって案内はしない（Pacing・狐火・言霊・気配・ミニマップ・ヒントを使わない）。また気づいたらいる。例：茶屋に座っている／民家の縁側にいる／橋の欄干の近くにいる／行列の最後尾近くを歩いている／屋台で普通に飲んでいる
- 一言（lore）は、江戸の絵巻に姿がある一方、「妖怪の総大将」という呼び名は後世に広まったもの、と書き分ける（江戸期から総大将と決まっていたとは書かない）
- いちばん大事な体験：「N / N」を見て図鑑を完成させたと思った世界に、まだ知らないものがいた

## 後から混ざる通常妖怪（normalWave）

はじめは 12 種。何度か夜を歩く・図鑑を埋めるうちに、知らなかった通常妖怪が少しずつ町に混ざる（41 種。通常妖怪は全部で 53 種）。**「種類が増えた」ではなく「何度か夜を歩くたび、知らなかった妖怪が自然に町へ混ざり始める」**。画面には段・wave・「新」「レア」を一切出さない。

- 41 種はすべて `rank: "normal"`・`discovery: "normal"`（`data/normalYokaiSecond.ts` 21 種・`normalYokaiThird.ts` 20 種。`normalWave` 1〜3 / 4〜6。通常妖怪は全部で 53 種）。うち 11 種は一夜一体（`uniquePerNight`）で、今夜の顔ぶれに入っても一体だけ（`NormalNightRoster` が数を 1 に、`SpawnGate.claim` が二体目を止める）。大妖怪の仕組み（`NightLegendRoster`・一夜一体・`omen`・`photoRole`・`legendJoin`）に入れない。陰陽師にも祓われる
- **解禁**（`game/normal/NormalUnlockRules.ts`、純粋関数）：`unlockedNormalWave(progress, zukan)`。wave ごとに「夜の数」と「図鑑の登録数（はじめの 12 種／通常妖怪全体）」を or / and で組む（`data/normalYokai.ts` の `NORMAL_UNLOCK`）。順に開き、飛ばさない。`isNormalUnlocked(type, progress, zukan)`
- **夜の数**（`game/normal/NormalProgress.ts`、`hyakki.normalProgress.v1`）：結果が出たとき（`AfterNightDirector.onResult` → `finishNormalNight`）だけ +1。同じ夜（`endedAt`）は二度数えない。保存が無ければ結果の履歴の件数から始める。開いた wave を最初に見た夜（`waveOpenedAt`）も残し、開いてから 2 夜は選ばれやすくする
- **夜の始まり**（`NormalSpawnPlanner.prepareNormalNight`、Game から一行）：wave を出す → 開いた wave を記して保存 → 今夜の顔ぶれ（`NormalNightRoster.drawNormalRoster`：seed の `normalRoster`）→ 町の配置（`planNormalSpawns`：seed の `normalPlace`）→ `WildYokai` に渡す。夜の間は wave を変えない（図鑑も夜の間はこの wave で見せる）
- **数を増やさない**：新しい顔ぶれの数（置き換えられる枠 × `NORMAL_NIGHT.share[wave]`）だけ、はじめの 12 種の群れ（世界の層・大妖怪以上を除く SPAWNS・気配・地区覚醒）を一妖ずつ減らす（群れの最後の一妖は残す）。川辺から現れる妖怪（`arrive: "river"`）は河童の一妖と入れ替わるので減らさない。wave 0 の夜は一覧を何も変えない（今までと同じ seed の並び）
- **出る場所の候補**（`NormalSite`）：`SpawnDef` と同じ（`appearAt`・`presence`・`district`・`layer`・`y`）に、`roof`（屋根の高さ）・`after`（地区覚醒・行列の遊びの数がそろうと姿を見せる：`WildYokai.revealAfter`）・`lurk`（潜む）・`arrive`
- **加入条件**：既存の touch・shy（`dist` で跳ねる距離）・flee・food・minCount に、汎用の条件を足した（`game/WildCompanionRules.ts`）：`standStill`・`followSteps`・`respond`・`contrary`・`sidestep`・`drop`（高い所から降りて驚かせる）・`gaze`（別の姿 `looks` から近づくたび `near` で次の姿へ。目目連・のっぺらぼう）、`WildJoinRules` に `variety`（行列の妖怪の種類。白沢）・`disguise`（別の妖怪の姿で置き、触れると `unmask` で正体を現す）・`perch`（止まり木の上。近づくと降りる）。一言は `YokaiType.talk`（tease・tired・ask・ok・appear。（…）で始まる言葉は地の文）。猫又・座敷童・天狗の一言も talk に移した。妖怪ごとの if 文は書かない
- **潜む**（`lurk`・`lurkBy`：still 立ち止まる／trail 蜘蛛の糸を辿る（`WildTrails`）／rule 加入条件の中で現れる）：置くが姿を見せない（`Actor.setVisible(false)`）。そばで 1.2 秒立ち止まると姿を見せる（`applyLurk`）。潜んでいる間は、ヒント・ミニマップ・気配・Pacing の一覧（`WildIdle` の `guidable`・`forEachShown`）に入れない。呼びかける妖怪（respond）は、近くで声だけ聞こえる（名前は出さない）。音を立てる妖怪（`YokaiType.murmur`：小豆洗い）は `murmur` イベントで近いほど大きく鳴る（`AudioDirector.lurkSound`。印は出さない）
- **図鑑**（`ZukanRules`）：`found.normalWave`（無ければ 0）より後の wave の通常妖怪は枠も分母も出さない（仲間にしたことがあれば出す）。開いたら通常の枠。`allNormalContentComplete` は最後の wave まで開き、通常の枠がすべて埋まったとき（ぬらりひょんの条件）
- 歩き方：`YokaiType.gait: "hop"`（一本足で跳ねる。唐傘お化け・一本だたら）

### 通常妖怪を足すとき

1. `data/normalYokaiSecond.ts` か `normalYokaiThird.ts` に一体足す（`def` に `rank: "normal"`・`discovery: "normal"`・`normalWave`・`reading`・`lore`（伝承だけ）・`zukanEncounter`（この町での出会い方）・`zukanFlavor`（ひとこと）・`hint`・`onsen`（`preferredArea` と `lines`）・`talk`、`sites` に出る場所の候補を一か所以上）。図鑑の順は `data/zukanOrder.ts` の `NORMAL_ZUKAN_ORDER` に足す（町に混ざる順）
2. `YOKAI_ICON`（`data/yokaiTypes.ts`）に墨判の一文字（ほかと重ねない）、`characters/normalModels.ts` に姿
3. 新しい wave を作るなら `NORMAL_UNLOCK` に条件、`NORMAL_NIGHT` の `share`・`maxTypes` に一つずつ足す
4. 画面の文言を足したので `npm run fonts`。`tests/normalYokai.test.ts` がデータ・解禁・図鑑・配置を確かめる

## 誘導の向け先（GuidanceRules）

| 向け先（`ContentSource`） | 通常の気配（ParadeAttraction） | NightPacing・狐火（`PACING_FILTER`） | 言霊（`KOTODAMA_FILTER`） |
| --- | --- | --- | --- |
| `wild` 町の通常妖怪 | ○ | × | ○ |
| `legend` 大妖怪・三大妖怪 | ○（世界から偶然聞こえる弱い気配） | × | × |
| `hidden` 隠し妖怪 | ×（一覧に入れない） | × | × |
| `rumor`・`encounter`・`district`・`activity` | ○ | ○ | × |

- `pickContent` の `prefer` は重みだけ。ふるいは `allowed` / `excluded`。`hidden` は `allowed` で名指ししない限り、どの選び方でも選ばれない
- 暇なときに Pacing が大妖怪の居場所を教えることはしない。大妖怪を出す・置くのも Pacing・Encounter からはしない（出す窓口は `WildYokai` の初期配置と `spawnSpecial` だけ。`SpawnGate` が今夜の候補・一夜一体を守る）

## 温泉宿「宵霞楼（よいがすみろう）」

温泉宿は攻略するところではなく、**これまでに出会った妖怪たちと再会して眺める、おまけの場所**（昔のゲームの秘密のおまけ部屋・キャラクターギャラリーのような、来るだけで嬉しい場所）。画面の名前は「宵霞楼」だけ。説明が要るところだけ「妖たちが夜ごと集う、山あいの湯宿。」

- することは、歩く・見る・話す（1〜2 行）・写真を撮る・くつろぐ。**依頼・収集のタスク・スコア・時間制限・陰陽師・脅威・加入は無い**（「団子を五つ集めろ」などは作らない）。宿の妖怪はみな「客」で、触れても行列に加わらない
- **本編の町とは別の地図**（`?onsen`）。町（`World`）・夜の刻・Pacing・Encounter・脅威・陰陽師・賑わい・今夜の候補・野良妖怪は作らない。宿を出るとタイトルへ（本編の途中へは戻らない）
- **遅延読み込み**：`main.ts` が `?onsen` のときだけ `import("./onsen/OnsenApp")`。宿の箱庭・空気・客の動き・画面（`src/onsen/`）は、本編の夜だけ遊ぶときは読まない。建物は町と同じ `WorldKit` の部品（建物グループ・透過・灯り）、客は同じ `ModelFactory`・`Actor`、操作は同じ `Input`・`Player`・`PlayerControl`・`CameraDirector`

仕組みは四つの責務に分けてある（混ぜない）：

| 責務 | どこ | 中身 |
| --- | --- | --- |
| **入れるか** | `game/onsen/OnsenVisit.ts` の `onsenAccess`・`openZones`（縁帳の `SPECIAL_UNLOCKS`） | 温泉宿への道（`onsenEntrance`）で入れる。噂（`onsenRumor`）だけならタイトルに小さく一行。特別宴会場（`onsenBanquet`）で宴会場の襖が開き、最深部（`onsenInnerArea`）で中庭の奥の門が開いて月見の奥庭へ（閉じている間は森）。進み具合の表示は出さない |
| **誰がいるか** | `OnsenVisit.visitGuests` → `OnsenGuestRoster.drawOnsenGuests`（人数は `data/onsen.ts` の `ONSEN_GUESTS`） | 図鑑に載った（一度でも仲間にした）妖怪から、訪問ごとに一部。大妖怪以上は縁帳で仲間にしたことも要る。隠し妖怪は見つけた後だけ抽選。**訪問**（`hyakki.onsen.v1`：`visitNo`・今の訪問の `seed` と `forced`）は「宿を出る」までが一回で、リロード・図鑑・写真・部屋の移動では変わらない |
| **どこにいるか** | `game/onsen/OnsenPlacementRules.ts` の `placeGuests`、居場所は `data/onsenMap.ts` の `ONSEN_SPOTS`、区域は `data/onsen.ts` の `ONSEN_AREAS` | 固定の居場所（座布団・縁側・湯の中・岩の横・宙…）に割り当てる。`YokaiType.onsen.preferredArea` の区域 → 同じ系統 → 空いているどこか。居場所ごとの大きさの上限（`maxScale`）で大きな妖怪は湯・庭・外周へ。浮く妖怪は湯につからない。妖怪ごとの if 文は無い |
| **どう見つけるか** | `LegendProgress.discoverHidden`（町の `revealHidden` → `specialDiscovered` と同じ意味） | 見つけていない隠し妖怪に**話しかけたとき**に縁帳の met へ保存し、図鑑に記される（N/N → N+1/N+1）。入館しただけでは記録しない |

- 客の動き：`src/onsen/OnsenGuests.ts`（座る・湯につかる・佇む・浮く・少し歩く。本編の野良妖怪の動きは使わない）。一言は `YokaiType.onsen.lines`（加入条件の話はしない）。寸劇の手がかりは `vignetteTags`（今は同じ区域を居たがることで自然に集まる）
- 宿の空気：`src/onsen/OnsenAtmosphere.ts`（夜の藍・行灯の橙・月光。湯は半透明でゆらぎの模様をゆっくり流す・ときどき水面に輪・少数の湯煙の板ポリ・湯に浮かぶ灯籠・夜空へ昇る灯り。軽量画質ではどれも数を減らす）
- 煌びやかな湯屋：`src/onsen/build/grandBuild.ts`（前庭の朱の大門と朱の提灯柱、宿の北にそびえる高楼（遠景。何層もの灯りの窓・朱の欄干・反った屋根）、赤と白の提灯の連なり、縁側の朱の欄干、外に面した障子の灯り）。赤い提灯は `OnsenWorld.redLamps` を結合して赤くにじむ灯りの材質に。提灯の連なりの紐は隣の提灯どうしをまっすぐ（傾けて）つなぐ暗い朱の組紐
- 宿の透かし：壁・生垣は町と同じく主人公のまわり・カメラとの間で透ける。宿では提灯・灯籠・提灯柱・紐などの小物も、主人公のそば（`SMALL_FADE_R` 歩）の背の高いものと、カメラと主人公の間をふさぐものを透かす（`FadeFocus.small`。町では渡さないので今まで通り）。玄関の看板は材質が別なので `OnsenApp` で近づいたら薄くする。主人公の足元より低いもの（上の階から見た下の階）は透かさない。階段は下にいるときは透けるが、上っている（下りている）間は近くにいても透かさない（`OnsenWorld.stairIds` → `StructureVisibilityDirector.setSolidIds`）。上の階の階段も透かせるよう、上の階を作る前に建物グループの空き（`UPPER_GROUPS`）を取っておき、`OnsenWorld.fadeGroup` で建物グループにする。玄関の暖簾は玄関の庇と同じく近づくと透ける
- 宿のカメラ：壁は透けるので、カメラを寄せる遮り（`cameraObstacle`）は外周の森だけ（部屋の中ではすぐアップにならない）。足元の影は床の面・畳の目地とちらつかないよう少し浮かせる（`SHADOW_LIFT`。湯の中は出さない）。会話は吹き出しの外をタップしても送れる
- 宿の音（`src/onsen/audio/`。最初の操作で鳴りはじめる。「音」・M で消音、町と同じ設定に保存）：`OnsenMusic`（ゆるやかな子守歌：陽音階・ゆっくりの 8 分、琴の旋律と分散和音・柔らかい持続音・ときどき鐘、二巡目から篠笛がそっとなぞる）、`OnsenSoundscape`（主人公のいる場所で聞こえ方が変わる：湯の流れ・滴る音・小さな水音、湯から上がって桶を置く「カポン」、言葉にならない遠くの話し声と笑い声（大広間・宴会場の方から。宴会場が開いていれば三味線も）、中庭の鹿威し、縁側の風鈴、庭のごく微かな鈴虫（ときどき）、湯に入ったときの小さな「ちゃぷ」、板の間を歩く足音、着いたときの小さな鈴）。遠くの音は小さく・こもらせ・残響多めに。素材ファイルは使わず合成
- **二階・三階**（`src/onsen/build/upperBuild.ts`、判定は `game/onsen/OnsenGroundRules.ts`、間取りは `data/onsenMap.ts` の `ONSEN_FLOOR_Y`・`ONSEN_UPPER`・`ONSEN_STAIRS`）：
  - 階段は建物の端（畳座敷の南の壁ぞい → 二階、二階の真ん中の西の端 → 三階の望楼）。踏み板だけの抜けた階段で、上からのぞくカメラから主人公が隠れにくい
  - **上の階は入り口では作らない**。上る階段に近づいた・上りはじめたとき（`floorsToPrepare`）に `OnsenWorld.buildFloor` で一度だけ作り、階ごとに一つの入れ物（TransformNode）にまとめる。上の階の部品は建物グループにしない（透かさない。見せるか隠すかだけ）
  - **見せるのは今いる階とその下だけ**（`shownFloor`。上りきる手前 `SHOW_UPPER_AT` で上の階を出す）。下の階にいる間、上の階は見えず、カメラも引っかからない（上の階の当たりもカメラの遮りも効かない）。上の階も屋根は付けず、壁は腰の高さまで（部屋と主人公が上から見える）。上の階の客（`OnsenSpotDef.floor`）はその階を見せている間だけ出し、話せるのは同じ階の客だけ
  - 当たりは「どこで効くか」（`lv`：階の番号・階段の id）を持ち、今の場所のものだけが効く（`OnsenWorld.resolve`）。階段は下の端・上の端からだけ出入りでき、両脇・上りきった先の下・上の階の下り口の先は当たりで閉じる（`stairColliders`）
  - カメラは主人公の足元の高さ（`CamContext.py`）を見て、タップは今の階の床の高さで拾う（`PlayerControl.pickY`）。二階を見せている間は内湯の湯煙を隠す（床を突き抜けない）
- **湯に入る**（`src/onsen/OnsenBath.ts`、値は `data/onsen.ts` の `ONSEN_BATH`）：湯の縁は越えられず、縁の切れ目（`OnsenPool.entry`：踏み石・内湯は低い踏み段）から入る。湯の中は深さに応じてゆっくり歩き、宿泊客と同じ高さまで沈む（`groundAt`）。浸かっていた時間（上がると冷める）が `blushAfter`（10 秒）を超えると、顔がほんのり赤くなる（`stepBathHeat`）。入ると小さな水音（`OnsenSoundscape.splash`）と水面の輪（`OnsenAtmosphere.ripple`）
  - 赤みは、**顔の位置（`characters/models.ts` の `FACE_ANCHORS`）に薄い赤の殻をかぶせて**出す（Actor の見た目に親子付け。モデルの色・材質は変えない）。本番モデル（GLB）に差し替えても、`FACE_ANCHORS` の値をそのモデルの顔に合わせれば同じように効く
  - **本番モデルでのメモ**：顔が大きく前に出ている・髪や面で顔が覆われているなど、殻では顔の形に合わない本番モデルでは見え方が再現できない可能性があり、再度作業が必要。また「肌そのものを赤くする」（顔の材質・テクスチャの色を変える）なら、本番モデルの作り（顔の材質が分かれているか、頂点カラーか）次第で作り直しになる（`OnsenBath` の赤みを出すところだけを差し替えればよい）
- 写真：景色をそのまま撮る（客を並べ替えない）。カメラを回す・寄る・左右・高さ・前後、UI を隠して撮る（`ShareTools.capturePhoto`）
- 画面：宿の名と今夜の宿泊客の数・図鑑・写真・宿を出る・近くに客がいれば「話す」。宿泊客の一覧・「？？？」・隠し客の数は出さない

### ぬらりひょん（宵霞楼での初めての出会い）

- 通常妖怪を知り尽くした（`allNormalContentComplete`）＋温泉宿への道＋まだ見つけていない → 次の訪問の始めに `onsenFirstDiscoveries` で**必ずいる客**（`forced`）になる（訪問の記録に残すので、その訪問の間は変わらない）
- 居場所は帳場の横のいちばんいい座布団（`chouba-kamiza`、`preferredArea: "chouba"`）。普通に茶を飲んでいる。頭上の名前・ヒント・光・音・特別な見出しは無い
- 話しかけると、名前を出さずに「……よい湯じゃな。」。この時点で見つける。会話を閉じると静かに「ぬらりひょん／新たな妖怪が図鑑に記された」。二度目からは名前が出る
- 見つけたことで最深部（三大妖怪 3＋隠し妖怪 1）が成り立てば、**その訪問のまま**奥の門が開く（`OnsenApp` の `reviewAccess` → `OnsenWorld.openInner`・`OnsenAtmosphere.openInner`）。月見の奥庭と閉じているときの森は両方作ってあり、片方を隠しているだけなので、宿は作り直さない。訪問・種・必ずいる客・宿泊客・居場所は変えない。知らせは、しばらくしてから小さく「奥の方で、戸の開く音がした。」だけ
- 次の訪問からは必ずいる客ではなく、通常の隠し妖怪の抽選（`ONSEN_GUESTS.hidden.chance`）へ。町の夜にもまれに（`postDiscoveryWorldChance` 0.1）今夜の候補に入る

## テスト

- `npm test`：`tests/*.test.ts` を `node --test` で動かす（追加依存なし）。
- テストから読むモジュールは実行時に Babylon・DOM を読まない（`import type` はよい）。純粋な判定は `*Rules.ts`・`data/*` に分けておくとテストできる。
- `tests/assets.test.ts`：構成の約束（外部につながない・Babylon は core/babylon.ts から・600 行まで・フォントに字が揃っている・依存は Babylon だけ）。
- `tests/legendYokai.test.ts`：大妖怪以上の姿・墨判・出る場所・加入条件の参照先、条件「妖怪の種類」、ぬらりひょんは温泉宿で見つけるまで町にいない・見つけた後は町で近くでだけ気づく。
- `tests/onsenInn.test.ts`：温泉宿の入れるか（道・宴会場・奥庭）、訪問（リロードで同じ・宿を出ると新しい種）、宿泊客（図鑑・縁帳・future・隠し・forced）、ぬらりひょんの初めての出会い（入館では記録しない・話しかけて met・N/N→N+1/N+1・次は forced でない）、居場所（全員・重ならない・大きな妖怪は室内に入らない・居たがる区域）。
- `tests/photoSpot.test.ts`：記念撮影の場所（参道の鳥居を越えない・人数で手前へ・御神木は邪魔にしない・ほかの木は避ける）と、向き直る・こっち向いて。
- `tests/spacing.test.ts`：行列・雛壇の間隔が妖怪の大きさに合わせて広がること（ふつうの大きさは今までどおり、大きな三体が同時でも重ならない、百妖以上でも壊れない）。
- `tests/paradeAppear.test.ts`：行列の数に誘われて現れる妖怪（はじめの 12 種は 0・後の段ほど大きな数・大妖怪 90・三大妖怪 100・隠し妖怪は対象外・預かりと取り出し・図鑑に数を添える）、音の段（30 妖までの音を変えない・40〜100 で一つずつ加わる・テンポは少しずつ）。
- `tests/zukanBook.test.ts`：妖怪図鑑の正式な順（通常 53・大妖怪 10・ぬらりひょん・三大妖怪 3 を完全一致）、図鑑の文（伝承 / 出会い方 / ひとこと、出会い方と加入条件の食い違い、考証）、未登録の情報を漏らさない（枠・一枠の HTML・検索）、登録済みのみ、格の表示、墨絵の受け口（URL・登録とファイル）、3D の姿見が一つだけ（前の姿を片付ける・止める）。
- `tests/roster.test.ts`：妖怪の正式な名簿と図鑑データ（読み・別名・格・大妖怪 10 種・三大妖怪 3 体・lore の考証）と、future の妖怪が図鑑の分母・今夜の候補に入らないこと。
- `tests/normalYokai.test.ts`：後から混ざる通常妖怪 41 種のデータ（名簿の数：通常 53・大妖怪 10・三大妖怪 3、消した妖怪が無い、白沢・神野悪五郎の格）、一夜一体の通常妖怪（同じ夜に二体出ない・窓口・大妖怪の仕組みに入らない）、古い保存の読み飛ばし、（格・別名・紹介の考証・加入条件の種類・出る場所）、解禁（wave・夜の数・図鑑の登録・移行・リロードで増えない）、図鑑（枠・分母・「妖怪」・段を出さない・ぬらりひょんの条件）、配置（未解禁は置かない・同じ seed で同じ・総数は増えない・はじめの 12 種の割合が下がる・開いた直後は選ばれやすい・大妖怪の候補に入らない）。
- CI（`.github/workflows/ci.yml`）：push・PR ごとに typecheck → test → build → check:size。
- 画面の確認は開発サーバで。ブラウザの自動確認では `window.game`（`game.paused = true` にして `game.update(1/30)` を回すと速く進められる。ブラウザの枠が隠れていると描画が止まるので、撮影などは `engine.beginFrame(); scene.render(); engine.endFrame()` を手で回す）。

## ファイルの大きさ（2026-09 時点）

分割の目安は CLAUDE.md の「ファイル分割」（400 行で考え、600 行を超えたらテストが失敗する）。400 行を超えているもの：

| ファイル | 行 | 次に分けるなら |
| --- | --- | --- |
| `game/WildYokai.ts` | 約 590（**600 の手前。次に足す前に必ず分ける**） | 置く（`addSpawn`・`revealAfter`）と姿を見せる・替える経路（`reveal`・`reshape`・`unveil`）を `WildPlacement` へ（蜘蛛の糸の道は `WildTrails.ts`、河童・一反木綿は `WildArrivals.ts`、うろつき・ヒントとミニマップへの一覧は `WildIdle.ts`、一緒に何かする加入条件は `WildCompanionRules.ts`、行列の数で姿を見せる判定は `ParadeAppearRules.ts` へ分けた） |
| `game/Game.ts` | 約 500 | 毎フレームの演出の更新（VFX・透過・群衆の音）を別ファイルへ |
| `presentation/audio/AudioDirector.ts` | 約 460 | 遠くの祭り・群衆の環境音を分ける |
| `game/onmyoji/OnmyojiGuards.ts` | 約 420 | 合体魔法陣の状態機械を `OnmyojiBarrier` へ |

分けすぎない：1 つの仕組みを 1 ファイルに。100 行に満たない断片を増やさない。

## 行列の数に誘われて現れる妖怪と音の段

行列が大きくなるほど、夜が応えてくる（差別化のルール 10・13：後半の攻略感は「列が長くなったことで起きる現象」、音楽は行列が完成させていく）。

- **現れる数**（`data/paradeAppear.ts`、仮）：はじめの 12 種は 0（いつでも）、後から混ざる通常妖怪は段（`normalWave`）ごとに 10・20・30・45・60・75、大妖怪 90、三大妖怪 100。隠し妖怪（ぬらりひょん）は対象外（見つけ方が別）
- 町には夜の始まりから置いてある。姿を見せる経路（初期配置・夜の進み・気配・地区覚醒・世界の層・行列の遊び）がそろっても、行列の数が届かなければ `WildYokai.reveal` の入口で預かる（`ParadeAppearHold.defer`）。0.5 秒ごとに見て、届いたらその場所で姿を見せ、`paradeDraw` を流す（演出は名前も場所も出さない一言だけ：「行列の賑わいに誘われて、町のどこかで何かが姿を見せた…」）。一度姿を見せたら、散って数が減っても隠れない
- **数だけで加わることは無い**（自動成長の禁止）：姿を見せた後は、その妖怪の加入条件（近づく・追いかける・立ち止まる…）が要る。預かり中の妖怪は姿が無いので、ヒント・ミニマップ・気配・Pacing・狐火・言霊にも出ない
- 川辺から現れる通常妖怪（尻こぼしなど）は、数が届くまでは河童のまま（`WildArrivals` の `ready`）。Encounter・報酬・祓われた仲間の置き直しは対象外（町に置いた妖怪だけ）
- 図鑑の「この町での出会い方」には、その数を自動で添える（`ZukanEntry.appearCount` → `ZukanCards`。妖怪ごとの文には書かない）
- 大妖怪の加入条件の `totalCount`（25〜55 妖）は、姿を見せる数（90）より小さいので、今は実質ほかの条件（連れている妖怪・地区・賑わい…）で決まる

**音の段**（`data/stages.ts` の `MUSIC_SWELLS`、`MusicDirector.setCount`）：30 妖までの音（はじめの無音・最初に鳴りだす笛・行列・宴）は変えない（`tests/paradeAppear.test.ts` が守る）。40 小鼓 → 50 鈴・拍子木・掛け声（夜行位「百鬼夜行」）→ 60 摺鉦（チャンチキ）→ 70 笙（合竹の和音）→ 80 琵琶 → 90 龍笛（篠笛の旋律を下で支える）→ 100 法螺貝（八小節に一度）。テンポも少しずつ（最大 +4）。音は `Instruments`（合成。録音素材に差し替えるならそこだけ）。静けさ（lull）・夜明け・撮影では段も控える

## ユーザーが決めること（AI が勝手に変えない）

**バランス（遊びの手触り）はユーザーが実際に遊んで決める。** AI は値を変えずに、気付いたことを報告する（変えるなら PR で提案し、変えた値と理由を書く）。対象：

- 陰陽師：見える距離・視野・怪しさの溜まる速さ・詠唱の長さ・祓う数・増援の条件（`data/onmyoji.ts` の `ONMYOJI_CFG`・`ONMYOJI_GUARDS`）、合体魔法陣の大きさ・長さ・休み（`BARRIER`）、威光の条件（`AWE`）
- 温泉宿の宿泊客の数・大妖怪に縁帳の「仲間にした」を求めるか・湯の中の歩く速さと顔が赤くなるまでの時間（`ONSEN_BATH`）（`data/onsen.ts`）
- 大妖怪・三大妖怪・隠し妖怪の出る場所・加入条件（`data/legendYokai.ts`。今はすべて仮）・隠し妖怪に気づく距離（`HIDDEN_NOTICE_RADIUS`）・行列と写真の大きさによる間隔（`game/ParadeSpacing.ts` の `BODY_RADIUS`・`BODY_GAP`）、今夜の候補の数・格ごとの思い出の重み・百鬼値（仮で 0）・温泉宿の解禁の閾値（`data/legendConfig.ts`）
- 追いかける子供・犬の人数（`game/TagalongRules.ts`）
- 町に置く妖怪の数（`data/map.ts` の SPAWNS。約 160。計測では 20 分の夜のうち 9〜12 分で百妖に届く）
- 後から混ざる通常妖怪：wave の解禁条件（`data/normalYokai.ts` の `NORMAL_UNLOCK`）、新しい顔ぶれへ回す割合・一夜の種類の数・一種類の数・開いた直後の選ばれやすさ（`NORMAL_NIGHT`）、41 種の出る場所・加入条件の値（立ち止まる秒・一緒に歩く歩数・逃げる速さなど。`data/normalYokaiSecond.ts`・`normalYokaiThird.ts`）
- Pacing・Encounter の間・同時数（README の v0.2.1）、賑わいの増え方（`game/FestivalMomentum.ts`）
- 夜行位の区切り（`data/stages.ts`）・一夜の長さ（既定 20 分）
- 行列の数に誘われて姿を見せる数（`data/paradeAppear.ts` の `PARADE_APPEAR`：通常妖怪の段ごと・大妖怪・三大妖怪）、中盤から百妖までの音の段の数・音量・テンポ（`data/stages.ts` の `MUSIC_SWELLS`）
