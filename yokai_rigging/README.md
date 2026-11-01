# 妖怪リギング制作基盤

Blender 5.2.1 / Python 3.12、Windowsで検証する独立ツールです。ゲーム本体を変更せず、ローカルだけで処理します。追加Pythonパッケージは不要です。

## 実行

リポジトリのルートでPowerShellから実行します。

```powershell
$env:BLENDER = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
python yokai_rigging/scripts/cli.py --list
python yokai_rigging/scripts/cli.py --id kappa
python yokai_rigging/scripts/cli.py                  # 有効な全設定
python yokai_rigging/scripts/cli.py --changed        # 入力・設定・実装変更、出力欠落
python yokai_rigging/scripts/cli.py --failed         # 前回失敗したもの
python -m unittest discover -s yokai_rigging/tests -v
```

入力は `input/007_kappa/河童.zip`。無い場合はその場所に配置してください。FBXと画像をサブフォルダへ直接置き、設定の `input` にFBX相対パスを指定することもできます。ZIP内のFBXは1個です。画像参照は元の名前を優先し、候補が1枚なら参照を修復します。候補が複数ある場合は曖昧に選ばず失敗します。`texture` で展開後FBXのフォルダからの相対パスを指定できます。

出力は `output/<id>/<実行ID>/web, roblox, blend, previews/`。過去の結果と原本を上書きしません。`reports/<id>/<実行ID>/quality.json` と `blender.log` に検査結果・例外・Blenderログを保存し、一覧状態は `reports/state.json` に保存します。失敗しても次の設定を処理し、終了コード1を返します。並行したCLI起動は状態ファイルが競合するため避けてください。

## 別の妖怪を追加

1. `input/008_oni/` などに未リグのFBXと画像、またはZIPを配置。
2. `configs/007_kappa.json` を複製し、`number,name,id,input` を変更。河童固有の `rigid_regions` は一度空配列に戻し、新モデルの領域を指定。
3. `--id <id>` で生成。正面・背面・側面とBLENDで骨位置・ウェイト・全モーションを確認。
4. 設定を調整して再実行。確認済みの実行IDの出力を採用。

最初の実装は `humanoid_chibi` のみです。`one_leg,floating,quadruped,serpentine` は登録名を予約していますが明示的に未対応エラーになります。全67体の設定や素材が揃っているわけではありません。

## 手動補正

内部座標はXが左右、Zが上、-Yが前。正面指定はFBXをBlenderに読み込んだ後の軸です。Web出力はglTF標準のY上へ変換します。高さ1、足元原点が既存ゲームの規約です。`target_height * scale` で変更できます。既定の骨格はAポーズを仮定します。Tポーズ・短い腕・大きな甲羅などは骨位置を調整してください。自動推定は外形比率であり意味解析ではありません。

`bone_overrides` は骨ごとの `head,tail` 座標を指定します。Xは全幅、Yは奥行き、Zは高さに対する比率です。省略した骨は共通リグ定義を使います。共通骨名・親子関係を変えるとモーション互換性が失われます。

```json
"bone_overrides": {
  "Head": {"head": [0, 0, 0.61], "tail": [0, 0, 0.94]}
},
"rigid_regions": [
  {"bone": "Spine", "min": [-0.3, 0.08, 0.3], "max": [0.3, 0.5, 0.62]}
]
```

領域は高さで正規化したXYZの箱です。`object` でメッシュ名を限定可能。後の領域が優先されます。甲羅はSpine、皿・髪はHeadなどへ固定します。`feather` で境界から内側へなじませる幅を指定でき、指定なしは完全な固定です。甲羅と身体の境界は実モデルを見て決めてください。大頭上部はHeadへ固定し、首近傍は自動ウェイトを残します。通常はBlender自動ウェイト、失敗・未割当なら骨との距離で代替。最大4影響へ切り詰め正規化、Rootへのウェイトは禁止します。距離方式を強制する場合は `weight_method: "distance"`。

BLENDを開き、Edit Modeで骨位置、Weight Paintで領域を調整できます。保存先は出力BLENDであり原本FBXではありません。現在のCLIはFBXから再生成するため、BLENDの手動変更は再実行に引き継がれません。再現する補正はJSONに反映してください。頂点単位の手塗りは採用したBLENDを別保存して管理します。

アニメーションは共通定義と同じ骨のローカル回転から毎回生成します。キャラクター設定の各クリップに `duration,amplitude,speed` を指定可能。Idle/Walkは同じ始終姿勢、WalkのRootは固定。Happy/Surprise/Appearは一回動作。BLENDのAction Editorで各Actionを選択できます（NLAトラックは保存用にミュート）。

## 品質の扱い

非多様体・境界・重複座標・退化面・孤立点・ゼロ法線・面の向き不整合・細長い三角形を記録します。既定ではトポロジを修復しません。重複座標はUV/ハードエッジのための意図的分離の可能性があります。穴埋めや頂点統合は外見・UVを壊すため手動判断とします。`quality_exceptions` に例えば `{"boundary_edges": "口の開口として目視確認済み"}` と理由を指定すると、その診断をacceptedとして記録します。件数は消さず、ウェイトや出力欠落の失敗は免除しません。

各クリップ5フレームの有限座標・辺伸長を検査します。伸長2倍超は目視対象です。自己交差・足滑り・装飾の自然さ・裏返りを保証する検査ではありません。すべてのGLB/FBX/BLENDを再読込し、骨名・階層・ウェイト・テクスチャ・クリップ存在と範囲を確認します。技術検査成功は目視採用や実機保証とは別です。

## ゲームへの接続とRoblox

Web版はBabylon.js。既存 `src/characters/ModelFactory.ts` はGLBを結合して静的インスタンス化し、`Actor.ts` は手続きモーションを使います。そのまま差し替えても骨格クリップ再生の統合にはなりません。将来はAssetContainerなどで骨格・AnimationGroupを保持してキャラクター単位で複製し、`Idle/Walk/Happy/Surprise/Appear` を選択再生するアダプタが必要です。多数表示の性能・実機確認も必要。今回は本体への強制組込みは行っていません。

Robloxは独自NPC用。R15アバター用の認証モデルではありません。

1. Studioの3D Importerで `roblox/kappa.fbx` を開き、テクスチャ・スケール・骨とスキニングをプレビュー。
2. 同じ骨格の各 `kappa_<Clip>.fbx` をAnimation Editorで個別インポートし、所有者・公開先を確認して保存。生成されたアニメーションIDを管理。
3. NPC ModelにAnimationControllerを追加、その子にAnimatorを追加。移動用の基点・当たり判定・アンカー状態はゲームの設計に合わせて設定。
4. サーバで作ったAnimatorにAnimationをロードし、Loopedを設定して再生します。

```lua
local animator = npc.AnimationController.Animator
local animation = Instance.new("Animation")
animation.AnimationId = "rbxassetid://YOUR_ANIMATION_ID"
local track = animator:LoadAnimation(animation)
track.Looped = true -- Idle / Walk
track:Play()
```

最大4影響・クリップ別エクスポートは[Roblox公式の一般仕様](https://create.roblox.com/docs/art/modeling/specifications)に合わせています。[カスタムキャラクターの説明](https://create.roblox.com/docs/resources/beyond-the-dark/custom-characters)では、無ウェイトの骨はインポートされない場合があるとされています。Rootはユーザー要件により無ウェイトです。Studio側の骨名とルート動作は必ず確認してください。Blenderでの再読込成功とStudio動作確認は別で、Studioでの確認は未実施です。
