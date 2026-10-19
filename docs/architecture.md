# 百鬼夜行 ～宵歩き～ 設計と地図

どこを触るか。遊びと数値の正は [README](../README.md)。ルールは [CLAUDE.md](../CLAUDE.md)。[spec-v0.1.md](spec-v0.1.md) は初期の記録で、作業では開かない。

## 層

```
入力（core/Input, game/PlayerControl）
  → ルール（src/game/**）が GameBus（game/events.ts）へ流す
  → 演出（src/presentation/**）。ParadePresentationDirector が各 Director へ配る
データは src/data/。町は src/world/。キャラは src/characters/。
```

ルールは DOM・音・UI を触らない。演出は状態を変えない（読むのはよい）。`Game.ts` は組み立てと毎フレームの順だけ。一夜の段階は `after/AfterNightState`（title → play → showcase → result → view / photo）。夜のあとは進行を止める。

イベントを足す：`game/events.ts` に型 → ルールが `bus.emit` → 演出は `ParadePresentationDirector`。記録は `NightRecorder`、称号・賑わいは `FestivalSystems`。

## どこを見るか

| やりたいこと | 主なファイル |
| --- | --- |
| 妖怪の種類・加入 | `data/yokaiTypes.ts`、`data/map.ts`（SPAWNS）、`game/WildJoinRules.ts`、`game/WildCompanionRules.ts`、`game/WildYokai.ts`、`game/WildIdle.ts`、`game/WildArrivals.ts` |
| 行列の人数で姿を見せる | `data/paradeAppear.ts`、`game/ParadeAppearRules.ts`。`WildYokai.reveal` の入口で預かる |
| 後から混ざる通常妖怪（41 種） | `data/normalYokaiSecond.ts`・`normalYokaiThird.ts`（一体ずつ）、`data/normalYokai.ts`（解禁・今夜の数）、`characters/normalModels.ts`・`normalModelsThird.ts`、`game/normal/`、蜘蛛の糸は `game/WildTrails.ts` |
| 大妖怪・三大妖怪・隠し | `data/legendYokai.ts`（一体ずつ）、`characters/legendModels.ts`、`data/legendConfig.ts`、`game/legends/` |
| 誘導の向け先 | `game/GuidanceRules.ts` |
| 図鑑 | `game/ZukanRules.ts`、順は `data/zukanOrder.ts`、画面は `presentation/zukan/`、墨絵は `data/yokaiInk.ts` |
| 宵霞楼 | 箱庭 `src/onsen/`（`?onsen` のときだけ読む）。入れるか・客は `game/onsen/`、値は `data/onsen.ts`・`data/onsenMap.ts` |
| 行列の動き | `game/Parade.ts`、間隔は `game/ParadeSpacing.ts` |
| 犬・夜回り・僧侶 | `game/Threats.ts`、`data/map.ts`（THREATS） |
| 陰陽師 | `data/onmyoji.ts`、`game/onmyoji/`、絵は `presentation/OnmyojiDirector.ts` |
| 追いかける子供・犬 | `game/TagalongRules.ts`、`game/ParadeTagalongs.ts` |
| 夜行位・音の段 | `data/stages.ts` |
| 世界の層 | `data/worldLayers.ts`、`WildYokai.activateLayer` |
| 賑わい・Pacing・Encounter・地区 | `game/FestivalSystems.ts` と配下。値は `data/encounters.ts`・`districts.ts`・`presences.ts` |
| 行列の遊び | `data/activities.ts`、`game/Activities.ts` |
| 移動 | `game/PlayerControl.ts`、`game/TapMove.ts`、`core/TouchSteer.ts`、`core/Input.ts`、`core/TouchLock.ts` |
| カメラ / HUD / 演出 / 音 | `presentation/CameraDirector.ts`、`PlayHud.ts`、`ParadePresentationDirector.ts`、`presentation/audio/` |
| 粒子・花火・言霊・絵巻雲 | `VFXDirector`・`FireworksDirector`・`KotodamaDirector`・`EmakiCloudDirector` |
| 町 | `data/map.ts`、`world/World.ts`、`world/WorldKit.ts`、`world/build/`（town・landmarks・nature）。**World.build の順番を変えると町の乱数が変わる** |
| 結果・称号・役 | `game/after/NightResult.ts`、`data/titles.ts`、`data/roles.ts`、`presentation/ResultUI.ts` |
| 思い出 | `game/after/NightRecorder.ts`、`NightMemoryLog.ts` |
| 記念撮影 | `game/after/Photo*`、`data/photo.ts`、`presentation/PhotoModeDirector.ts`・`AfterNightDirector.ts`・`PhotoUI.ts`・`PhotoShot.ts` |
| デバッグ | `game/DebugTools.ts` |
| Babylon / フォント / 保存 / 乱数 | `core/babylon.ts`、`scripts/fonts.mjs`、`core/SaveData.ts`、`core/seed.ts` |

## 妖怪の二つの軸

| 軸 | 値 | 意味 |
| --- | --- | --- |
| 格 `rank` | normal / greater / threeGreat | 格式。大妖怪以上は一夜に一体、祓われない、加入は `legend` |
| 発見 `discovery` | normal / hidden | 見つけ方。隠しは格の抽選と別。誘導から外れる |

三大妖怪は酒呑童子・玉藻前・大嶽丸だけ。大妖怪は 10 種（図鑑の順：大天狗・茨木童子・牛鬼・八岐大蛇・ダイダラボッチ・山本五郎左衛門・神野悪五郎・両面宿儺・ガシャドクロ・天逆毎）。白沢は通常妖怪。画面の分類は「妖怪・大妖怪・三大妖怪」だけ。

`uniquePerNight` は「一夜に最大一体」だけ。`isLegend` は格、`isSpecialYokai` は大妖怪以上か隠し。混ぜない。一夜一体の通常妖怪は大妖怪の候補・縁帳・legendJoin に入らない。汎用の窓口（報酬・Encounter）からも出ない。

`zukanAvailability: "future"` は名簿だけで本編に無い。今はいない。`normalWave`（0 がはじめの 12 種、1〜6 が後の 41 種）は実装済みで、開くと町に混ざる。画面に段は出さない。

図鑑の文は `lore`（伝承だけ）・`zukanEncounter`（この町での出会い方。条件を変えたら直す）・`zukanFlavor`（ひとこと）。読みと別名は図鑑だけ。未登録はヒントだけ。隠しは見つけるまで枠も分母も無い。見つけたら N/N が N+1/N+1（完成は未完成に戻らない）。隠しの「登録」は見つけた記録（仲間にしなくてもよい）。通常は仲間にした記録。順の唯一の元は `data/zukanOrder.ts`（通常 53 → 大妖怪 10 → 見つけたぬらりひょん → 三大妖怪 3）。指示なく並べ替えない。墨絵は `public/yokai-ink/<ID>.webp`（67 体）。偽物の墨絵は置かない。

## 足し方

妖怪ごとの if 文は書かない。違いはデータ。

**大妖怪・三大妖怪**（`data/legendYokai.ts` の `ENTRIES` に `def` と `spawn` を一つ）

1. `rank` と `discovery`。`rule: { kind: "legend", conditions, ask, ok }`（条件は AND。`specificYokai`・`totalCount`・`activityCount`・`districtAwakened`・`encounterComplete`・`momentum`・`typeVariety`）。`awe`・`photoRole`・`omen`・図鑑の文。三大妖怪は `threeGreat`、`photoRole: "centerpiece"`、思い出の重み 95。
2. `YOKAI_ICON` に墨判。姿は `characters/legendModels.ts`。図鑑の順は `LEGEND_ZUKAN_ORDER`。`PLANNED_YOKAI` にあれば消す。
3. `spawn` は歩ける一か所。出すのは初期配置と `WildYokai.spawnSpecial`。`npm run fonts`。`tests/legendYokai.test.ts`。
4. 新しい条件の種類が要るときだけ `LegendCondition` と `LegendRules.checkCondition` を足す。

流れ：町に姿と気配 → 会う（`legendMeet`）→ 条件を満たすと `join` のあと `legendJoin`。

**通常妖怪**（`normalYokaiSecond.ts` か `normalYokaiThird.ts`）

1. `rank`・`discovery` は normal。`normalWave`・図鑑の文・`hint`・`onsen`・`talk`・`sites`。順は `NORMAL_ZUKAN_ORDER`。
2. 墨判、姿は `normalModels.ts`。新しい wave なら `NORMAL_UNLOCK` と `NORMAL_NIGHT` の `share`・`maxTypes`。
3. `npm run fonts`。`tests/normalYokai.test.ts`。

**隠し**（今はぬらりひょんだけ。`rank: greater`、`discovery: hidden`）

- 姿は `revealHidden` だけ。初期配置・気配・地区・層・`appearAt` では出さない（`revealAllowed` が最後に止める）。
- 姿を見せたら `specialDiscovered` → 縁帳の `met` → 図鑑。`announce` は演出だけで、記録は必ず行う。
- 誘導（Pacing・狐火・言霊・気配・ヒント・ミニマップ）には入れない。見つけたあとでも案内しない。
- ぬらりひょんの初対面は宵霞楼。条件は `allNormalContentComplete` かつ `onsenEntrance`。次の訪問で帳場の上座に必ずいる（`onsenFirstDiscoveries` → `forcedGuests`）。話しかけると見つかり、名前は会話を閉じたあとに出る。入館しただけでは記録しない。見つけたあと、町では `postDiscoveryWorldChance`（仮 0.1）で茶屋の縁台に隠れ、`HIDDEN_NOTICE_RADIUS`（仮 5 歩）まで来ると気づく。加入は賑わい「大賑わい」（仮）。

## 誘導

| 向け先 | 気配 | Pacing・狐火 | 言霊 |
| --- | --- | --- | --- |
| 町の通常妖怪 | ○ | × | ○ |
| 大妖怪・三大妖怪 | ○（弱い） | × | × |
| 隠し | × | × | × |
| 噂・Encounter・地区・遊び | ○ | ○ | × |

`hidden` は名指ししない限り選ばれない。大妖怪を出す・置くのも Pacing と Encounter からはしない。

## 宵霞楼

実装済み。本編とは別の地図（`?onsen`）。町・夜の刻・Pacing・Encounter・脅威・陰陽師は作らない。出るとタイトルへ戻る。客は触れても行列に加わらない。依頼・スコア・時間制限は無い。

| 責務 | どこ |
| --- | --- |
| 入れるか | `OnsenVisit.onsenAccess`。縁帳の `SPECIAL_UNLOCKS`（噂・道・宴会場・最深部）。進み具合は出さない |
| 誰がいるか | `OnsenGuestRoster`。図鑑に載った妖怪から訪問ごとに一部。大妖怪以上は仲間にしたことも要る。隠しは見つけたあとだけ。`hyakki.onsen.v1` は宿を出るまで同じ |
| どこにいるか | `OnsenPlacementRules`、居場所は `ONSEN_SPOTS` |
| 隠しの発見 | 話しかけたときに `LegendProgress.discoverHidden` |

二階・三階は階段に近づくまで作らず、今いる階とその下だけ見せる（`upperBuild.ts`、`OnsenGroundRules`）。湯は縁の切れ目から入り、約 10 秒で顔が赤くなる（`OnsenBath`、`ONSEN_BATH`）。

赤みは顔の位置（`characters/models.ts` の `FACE_ANCHORS`）に薄い赤の殻をかぶせる。モデルの色は変えない。本番モデルに差し替えても、`FACE_ANCHORS` をその顔に合わせれば効く。顔が大きく前に出ている・髪で覆われている本番モデルでは殻が合わないことがあり、肌そのものを赤くするなら材質の作り次第で `OnsenBath` の赤みだけを差し替える。

GLB は `YokaiType.modelUrl`（`public/models/`）。高さ 1・原点は足元・前は +Z。`ModelFactory` は骨格なしの静的メッシュとして読み、距離 LOD（75 で低、260 で非表示）は手続きモデルだけにつく。歩きはメッシュ全体のトランスフォーム（`Actor`）。

## 読み込み

Babylon は使う部品だけ（`core/babylon.ts`）。起動時に `factory.warmup(Object.keys(MODELS))` で全モデルを作っている。遅いようなら、はじめの 12 種＋今夜の顔ぶれ＋主人公・人・演出だけ先に作る（未計測。値は変えない）。

フォント上限 2000KB は上げない。超えそうなら削る（題字の字を絞る、書体を減らす、まだ本編に出ない文を同梱しない）。

## テスト

`npm test`（`tests/*.test.ts`）。主なファイル：`assets`（外部につながない・600 行・フォント）、`legendYokai`、`onsenInn`、`onsenFloors`、`photoSpot`、`spacing`、`paradeAppear`、`zukanBook`、`roster`、`normalYokai`。CI は typecheck → test → build → check:size。

## 大きいファイル

400 行で分割を考え、600 行超はテストが失敗する。

| ファイル | 行の目安 | 次に分けるなら |
| --- | --- | --- |
| `game/WildYokai.ts` | 約 570（600 の手前。足す前に分ける） | 置く・姿を見せる経路を `WildPlacement` へ |
| `game/Game.ts` | 約 500 | 毎フレームの演出の更新 |
| `presentation/audio/AudioDirector.ts` | 約 470 | 遠くの祭り・群衆の環境音 |
| `game/onmyoji/OnmyojiGuards.ts` | 約 420 | 合体魔法陣を `OnmyojiBarrier` へ |

## ユーザーが決めること

AI は値を変えず、気付いたことを報告する。

- 陰陽師（`data/onmyoji.ts` の `ONMYOJI_CFG`・`ONMYOJI_GUARDS`・`BARRIER`・`AWE`）
- 宵霞楼の人数・大妖怪に「仲間にした」を求めるか・湯の速さ・赤くなるまでの時間（`data/onsen.ts`）
- 大妖怪の出る場所・加入条件（`data/legendYokai.ts`。今は仮）、気づく距離、行列の間隔（`ParadeSpacing` の `BODY_RADIUS`・`BODY_GAP`）、今夜の候補数、思い出の重み、百鬼値（仮で 0）、宿の解禁（`data/legendConfig.ts`）
- 追いかける子供・犬の人数（`TagalongRules`）
- 町に置く数（`data/map.ts` の SPAWNS。約 160。20 分の夜の 9〜12 分で百妖に届く）
- 通常妖怪の解禁・今夜の割合と種類数・41 種の場所と加入の値（`data/normalYokai.ts`・`normalYokaiSecond.ts`・`normalYokaiThird.ts`）
- Pacing・Encounter の間と同時数、賑わいの増え方（`FestivalMomentum`）
- 夜行位の区切り（`data/stages.ts`）、一夜の長さ（既定 20 分）
- 姿を見せる人数（`data/paradeAppear.ts`）、40 妖以降の音（`MUSIC_SWELLS`）
