/**
 * 通常妖怪・第 3 段階（20 種。地域性・古典性の強い妖怪と、大妖怪から通常妖怪へ移した白沢）。wave 4〜6 に分けて、何夜も歩いた町へ少しずつ混ざる。
 * 図鑑の文は lore（伝承・原典の特徴だけ）・zukanEncounter（この町での出会い方）・zukanFlavor（情景のひとこと）に分ける。lore に後世の創作と疑われる設定は書かない
 * （うわんの「古寺で叫ぶ」・わいらの「モグラを食べる」など。狂骨・魍魎・八咫烏を豊富な民間伝承のようには書かない）。
 * 姿は characters/normalModels.ts。設定は normalYokai.ts。**出る場所・加入条件・数はすべて仮**。
 */
import type { NormalEntry } from "./normalYokai";

const N = { rank: "normal", discovery: "normal" } as const;

export const THIRD_ENTRIES: NormalEntry[] = [
  // ---- wave 4
  {
    // 大妖怪から通常妖怪へ移した（id は hakutaku のまま）。一夜に一体。万の怪異を知る瑞獣：多くの種類の妖怪を連れた行列を見て、書き留めるように加わる
    def: {
      id: "hakutaku", name: "白沢", reading: "はくたく", aliases: ["白澤"], family: "CHIBI_QUAD", rule: { kind: "variety", n: 8 }, se: "hoo", scale: 1.5, ...N, normalWave: 4, uniquePerNight: true,
      awe: { mode: "slowCast", amount: 0.4 },
      lore: "中国から伝わった瑞獣で、天下の怪異や鬼神を知るとされる。",
      zukanEncounter: "夜が少し更けると、参道の奥や稲荷のあたりに佇む。八種以上の妖怪を連れた行列を見せると加わる。",
      zukanFlavor: "知らぬ怪異を見つけるたび、静かに目を細める。",
      hint: "たくさんの目が、静かにこちらを数えている",
      talk: { ask: "世の妖怪なら皆知っておる。{n}種の妖怪が揃った行列を見せよ", ok: "よい顔ぶれ。この行列、書き留めておこう" },
      onsen: { preferredArea: "zashiki", vignetteTags: ["books"], lines: ["今宵もまた、知らぬ顔が増えたようだな。", "この宿の書棚は、よく揃っている。"] },
    },
    sites: [{ x: 8, z: 96, r: 0, appearAt: 0.25 }, { x: 106, z: 88, r: 0, appearAt: 0.3 }],
  },
  {
    def: {
      id: "tsuchigumo", name: "土蜘蛛", reading: "つちぐも", family: "CHIBI_QUAD", rule: { kind: "shy", hops: 2 }, se: "kusu", ...N, normalWave: 4,
      lore: "古代には朝廷に従わぬ者を指す語でもあり、後世の物語では巨大な蜘蛛の怪として描かれた。",
      zukanEncounter: "橋や林の陰に潜み、近づくと物陰へ隠れる。二度追いかけると百鬼夜行へ加わる。",
      zukanFlavor: "物陰から物陰へ。行列でも端を歩きたがる。",
      hint: "橋や林の陰を、何度か覗いてみよう", scale: 1.15,
      talk: { tease: "（さっと物陰へ隠れた）", ok: "……糸をつなごう。ついていく" },
      onsen: { preferredArea: "nakaniwa", lines: ["庭木に糸を張っておいた。朝露がきれいだぞ。"] },
    },
    sites: [{ x: 52, z: -28, r: 2 }, { x: 84, z: 55, r: 2 }, { x: -30, z: 100, r: 3 }],
  },
  {
    def: {
      id: "ippon_datara", name: "一本だたら", reading: "いっぽんだたら", family: "SPECIAL", gait: "hop", rule: { kind: "shy", hops: 3 }, se: "karan", ...N, normalWave: 4,
      lore: "紀伊山地で語られる一本足・一つ目の山の怪。",
      zukanEncounter: "夜更けの町外れに現れる。何度か跳ね逃げた後、近づくと百鬼夜行へ加わる。",
      zukanFlavor: "ぴょん、ぴょん。一本足でも行列に遅れない。",
      hint: "夜更けの町外れで、何度か近づこう", scale: 1.15,
      talk: { tease: "（一本足で、ぴょんと跳ねて逃げた）", ok: "ひと目、ひと足。よろしくな" },
      onsen: { preferredArea: "maeniwa", lines: ["一本足でも、庭石の上は歩きやすい。"] },
    },
    sites: [{ x: 130, z: -55, r: 2, appearAt: 0.5 }, { x: -115, z: -118, r: 2, appearAt: 0.5 }, { x: 125, z: 60, r: 2, appearAt: 0.55 }],
  },
  {
    def: {
      id: "mujina", name: "ムジナ", reading: "むじな", aliases: ["狢"], family: "CHIBI_QUAD", rule: { kind: "disguise", as: "oni", hops: 1 }, se: "ponpoko", ...N, normalWave: 4,
      lore: "狢は人へ化け、夜道で人を惑わす獣として古くから語られる。",
      zukanEncounter: "小鬼に化けて町に紛れている。妙な逃げ方をする小鬼に触れると正体を現し、百鬼夜行へ加わる。",
      zukanFlavor: "ときどき、まだ小鬼の顔のまま歩いている。",
      hint: "小鬼の中に、妙な逃げ方をするのがいる", scale: 0.95,
      talk: { tease: "（小鬼が、妙な逃げ方をした…）", appear: "（化けていたのは、ムジナだった！）", ok: "ばれたか。ついていこう" },
      onsen: { preferredArea: "hiroma", lines: ["狸殿とは親戚ではない。…たぶん。", "湯気に化けてみようか。"] },
    },
    sites: [{ x: -14, z: 5, r: 4 }, { x: 40, z: 30, r: 4 }, { x: -18, z: -50, r: 4 }],
  },
  {
    def: {
      id: "gaki", name: "餓鬼", reading: "がき", family: "CHIBI_BIPED", rule: { kind: "food" }, se: "kusu", ...N, normalWave: 4, originKind: "buddhist",
      lore: "仏教で、飢えと渇きに苦しむ餓鬼道の住人とされる。",
      zukanEncounter: "食べ物の匂いにつられて現れる。団子を渡すと百鬼夜行へ加わる。",
      zukanFlavor: "団子の串を、いつまでも大事そうに持っている。",
      hint: "「ひもじい…」", scale: 0.85,
      talk: { ask: "ひもじい…何か食べ物を…", ok: "団子だ…！ ありがたい、ついていく" },
      onsen: { preferredArea: "hiroma", vignetteTags: ["sake"], lines: ["膳が、いくら食べても減らぬ…ありがたい。"] },
    },
    sites: [{ x: -95, z: 55, r: 3 }, { x: -60, z: 45, r: 3 }, { x: 28, z: -8, r: 3 }],
  },
  {
    def: {
      id: "satori", name: "覚", reading: "さとり", family: "CHIBI_BIPED", rule: { kind: "standStill", secs: 1.2, reach: 10 }, se: "hoo", ...N, normalWave: 4,
      lore: "飛騨・美濃の山中で、人の心を読むとされる怪。",
      zukanEncounter: "動けば先回りされる。そばで立ち止まると、向こうから近づいてきて加わる。",
      zukanFlavor: "次に曲がる角を、たいてい先に知っている。",
      hint: "動けば先回りされる。立ち止まってみよう", scale: 1.1,
      talk: { tease: "今、『逃げよう』と思ったな？", ok: "『来てほしい』と思ったな。行こう" },
      onsen: { preferredArea: "engawa", lines: ["『いい湯だ』と思ったな？ わしもだ。"] },
    },
    sites: [{ x: -35, z: 95, r: 3 }, { x: 35, z: 100, r: 3 }, { x: 115, z: 25, r: 3 }],
  },
  {
    def: {
      id: "katawaguruma", name: "片輪車", reading: "かたわぐるま", family: "FLOAT", rule: { kind: "flee", speed: 7.2 }, se: "karan", ...N, normalWave: 4,
      lore: "江戸の怪談に登場する、炎をまとった片輪の車。",
      zukanEncounter: "夜が更けると、夜道を転がって走り去る。追いついて捕まえると百鬼夜行へ加わる。",
      zukanFlavor: "ごろごろと、行列の拍子に合わせて回っている。",
      hint: "夜道を転がる炎を、追いかけよう", hover: 0.02, scale: 1.1,
      talk: { tease: "ごろごろごろ…", tired: "（輪がくるくると止まった）" },
      onsen: { preferredArea: "maeniwa", lines: ["（前庭の石畳で、炎を小さくして休んでいる）"] },
    },
    sites: [{ x: 0, z: -30, r: 6, appearAt: 0.4 }, { x: -80, z: -67, r: 6, appearAt: 0.45 }, { x: 100, z: -20, r: 5, appearAt: 0.5 }],
  },
  // ---- wave 5
  {
    def: {
      id: "kyokotsu", name: "狂骨", reading: "きょうこつ", family: "FLOAT", rule: { kind: "touch" }, se: "fuwa", ...N, normalWave: 5,
      lore: "鳥山石燕が、井戸から現れる白骨の姿で描いた妖怪。",
      zukanEncounter: "夜更けの古井戸に浮かび上がる。近づいて触れると、静かに百鬼夜行へ加わる。",
      zukanFlavor: "井戸の底より、祭りの夜道のほうが明るいらしい。",
      hint: "夜更けの古井戸を、覗いてみよう", hover: 0.25,
      onsen: { preferredArea: "nakaniwa", lines: ["……井戸より、湯のほうがあたたかい。"] },
    },
    sites: [{ x: -70, z: 50, r: 0, appearAt: 0.5 }, { x: -80, z: -60, r: 0, appearAt: 0.55 }],
  },
  {
    def: {
      id: "nozuchi", name: "野槌", reading: "のづち", family: "SERPENT", rule: { kind: "flee", speed: 5.6 }, se: "bo", ...N, normalWave: 5,
      lore: "山中に棲む、太く短い蛇のような怪として語られる。",
      zukanEncounter: "林から転がるように飛び出して逃げる。追いついて捕まえると百鬼夜行へ加わる。",
      zukanFlavor: "ころころ転がって、いつの間にか先頭近くにいる。",
      hint: "林から転がり出たものを、追ってみよう", scale: 0.9,
      talk: { tease: "（ころころと転がって逃げた）", tired: "（ころん、と止まった）" },
      onsen: { preferredArea: "maeniwa", lines: ["（庭の岩の横で、丸くなって転がっている）"] },
    },
    sites: [{ x: 25, z: 98, r: 5 }, { x: -25, z: 88, r: 4 }, { x: 125, z: 5, r: 4 }],
  },
  {
    def: {
      id: "makuragaeshi", name: "枕返し", reading: "まくらがえし", family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "kusu", ...N, normalWave: 5,
      lore: "眠っている間に枕や体の向きを変えるとされる寝所の怪異。",
      zukanEncounter: "夜更けの長屋に潜んでいる。しばらく佇んでいると現れ、触れると百鬼夜行へ加わる。",
      zukanFlavor: "行列の向きを、こっそり変えたくてうずうずしている。",
      hint: "夜更けの長屋で、しばらく佇んでみよう", scale: 0.75,
      talk: { appear: "（いつの間にか、足元に枕が…）" },
      onsen: { preferredArea: "zashiki", lines: ["お客さんの枕、そっと北向きにしておいたよ。"] },
    },
    sites: [
      { x: -50, z: -58, r: 1, appearAt: 0.5, lurk: true },
      { x: -85, z: -78, r: 1, appearAt: 0.5, lurk: true },
      { x: -35, z: -100, r: 1, appearAt: 0.55, lurk: true },
    ],
  },
  {
    def: {
      id: "isohime", name: "磯姫", reading: "いそひめ", aliases: ["磯女"], family: "FLOAT", rule: { kind: "followSteps", dist: 25 }, se: "pita", ...N, normalWave: 5,
      lore: "九州沿岸に伝わる磯女を、鹿児島の一部では磯姫と呼ぶ。",
      zukanEncounter: "夜の川辺に、長い髪で現れる。しばらく一緒に歩くと百鬼夜行へ加わる。",
      zukanFlavor: "濡れた髪から、ときどき潮の匂いがする。",
      hint: "川辺の夜、長い髪の影と歩いてみよう", hover: 0.06, scale: 1.1,
      talk: { tease: "……水辺を、一緒に歩いて", ok: "……いいわ。ついていく" },
      onsen: { preferredArea: "iwaburo", vignetteTags: ["water"], lines: ["……長い髪が、湯に広がるの。"] },
    },
    sites: [{ x: 54, z: -80, r: 3, appearAt: 0.35 }, { x: 82, z: -60, r: 3, appearAt: 0.4 }, { x: 54, z: 100, r: 3, appearAt: 0.4 }],
  },
  {
    def: {
      id: "moryo", name: "魍魎", reading: "もうりょう", family: "FLOAT", rule: { kind: "touch" }, se: "bo", ...N, normalWave: 5,
      lore: "古くは山川や墓所などに潜む怪異を広く指した言葉。",
      zukanEncounter: "墓地の気配が濃くなると姿を見せる。近づいて触れると百鬼夜行へ加わる。",
      zukanFlavor: "名を呼ばれても、自分のことか分からないらしい。",
      hint: "墓地の気配が濃くなる夜に", hover: 0.4, scale: 0.8,
      onsen: { preferredArea: "nakaniwa", lines: ["……（石灯籠の陰に、じっと集まっている）"] },
    },
    sites: [{ x: -100, z: 64, r: 4, presence: "hayashi" }, { x: -86, z: 80, r: 4, presence: "farParade" }],
  },
  {
    def: {
      id: "tsurube_otoshi", name: "釣瓶落とし", reading: "つるべおとし", family: "FLOAT", rule: { kind: "drop", reach: 2.8 }, se: "bo", ...N, normalWave: 5, uniquePerNight: true, hover: 0.1,
      lore: "古木の上から突然現れる怪として、西日本などに伝わる。",
      zukanEncounter: "大きな木の上に潜み、下を通るとどすんと降りて驚かせる。その後に触れると百鬼夜行へ加わる。",
      zukanFlavor: "驚いた顔を見るまでは、ついていく気にならない。",
      hint: "大きな木の下を、通ってみよう", scale: 1.1,
      talk: { tease: "どすん！……けけけ、驚いたか", ok: "けけけ。ついていってやろう" },
      onsen: { preferredArea: "hiroma", lines: ["宿の梁から落ちるのは、さすがに叱られたわい。", "けけけ。湯の中なら、落ちても痛くない。"] },
    },
    sites: [{ x: 6, z: 20, r: 0, y: 5 }, { x: -8, z: 108, r: 0, y: 5 }, { x: -62, z: 46, r: 0, y: 5 }],
  },
  {
    def: {
      id: "kasha", name: "火車", reading: "かしゃ", family: "CHIBI_QUAD", rule: { kind: "shy", hops: 2, dist: 9 }, se: "nya", ...N, normalWave: 5, uniquePerNight: true,
      lore: "葬送の場に現れ、亡骸を奪うと恐れられた怪異。",
      zukanEncounter: "寺町を祭りにした夜、鐘の鳴る方に現れる。何度か跳ねて逃げた後、近づくと百鬼夜行へ加わる。",
      zukanFlavor: "今宵は何も運ばず、行列の灯りになっている。",
      hint: "寺町を祭りにした夜、鐘の鳴る方へ", scale: 1.15,
      talk: { appear: "（ごおん……と鐘が鳴り、黒雲の中に火が揺れた）", tease: "（火の粉を散らして、ひらりと跳んだ）", ok: "今宵は何も運ばん。行列の火になってやろう" },
      onsen: { preferredArea: "nakaniwa", lines: ["今宵は何も運ばん。ただ湯に浸かりに来ただけよ。", "湯気の中だと、火も静かになる。"] },
    },
    sites: [{ x: -72, z: 36, r: 2, district: "temple" }, { x: -92, z: 55, r: 2, district: "temple" }],
  },
  // ---- wave 6
  {
    def: {
      id: "uwan", name: "うわん", reading: "うわん", family: "CHIBI_BIPED", rule: { kind: "respond", secs: 1.2 }, se: "hoo", ...N, normalWave: 6,
      lore: "江戸の妖怪絵巻に名と姿を残す、正体の知れない怪。",
      zukanEncounter: "人気のない家から「うわん」と声がする。そばで立ち止まって応えると姿を見せ、百鬼夜行へ加わる。",
      zukanFlavor: "うわん。返事をすると、少しうれしそうだ。",
      hint: "人気のない家の声に、応えてみよう", scale: 1.1,
      talk: { tease: "うわん！", appear: "うわん！", ok: "うわん。" },
      onsen: { preferredArea: "nikai", lines: ["うわん！ …驚いた？ 宿でもやってみたかった。"] },
    },
    sites: [{ x: -60, z: -75, r: 0, lurk: true }, { x: 105, z: -10, r: 0, lurk: true }, { x: -100, z: -58, r: 0, lurk: true }],
  },
  {
    def: {
      id: "nuppeppo", name: "ぬっぺっぽう", reading: "ぬっぺっぽう", aliases: ["ぬっぺふほふ"], family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "bo", ...N, normalWave: 6,
      lore: "江戸の妖怪絵巻に描かれた、顔と体の境が曖昧な肉塊のような怪。",
      zukanEncounter: "夜更けに、ふらりと町へ現れる。見つけて触れると百鬼夜行へ加わる。",
      zukanFlavor: "どこが前か分からないが、ちゃんと前へ進んでいる。",
      hint: "夜更けの町を、ふらりと探そう",
      onsen: { preferredArea: "hiroma", lines: ["（ぷるぷると、湯気に揺れている）"] },
    },
    sites: [{ x: 12, z: 18, r: 6, appearAt: 0.5 }, { x: -10, z: -100, r: 6, appearAt: 0.55 }, { x: 95, z: -35, r: 5, appearAt: 0.6 }],
  },
  {
    def: {
      id: "yatagarasu", name: "八咫烏", reading: "やたがらす", family: "FLOAT", rule: { kind: "perch", reach: 12 }, se: "hoo", ...N, uniquePerNight: true, normalWave: 6, originKind: "myth",
      lore: "神武天皇を熊野から大和へ導いたと神話に語られる烏。",
      zukanEncounter: "行列の遊びを二つ成し遂げると、高い所へ舞い降りる。近くまで行くと降りてきて、道を共にする。",
      zukanFlavor: "三本の足で、行列の行く先をじっと見ている。",
      hint: "行列の遊びを、いくつか成し遂げよう", hover: 0.3,
      talk: { appear: "（空から、三本足の烏が舞い降りてきた）", ok: "……道を共にしよう" },
      onsen: { preferredArea: "bourou", lines: ["（望楼の欄干にとまり、遠くの山を見ている）"] },
    },
    sites: [{ x: 3, z: 60, r: 0, y: 3.5, after: { activities: 2 } }, { x: 104, z: 66, r: 0, y: 3.5, after: { activities: 2 } }],
  },
  {
    def: {
      id: "waira", name: "わいら", reading: "わいら", family: "CHIBI_QUAD", rule: { kind: "touch" }, se: "bo", ...N, normalWave: 6,
      lore: "江戸の妖怪絵巻に、太い鉤爪を持つ姿だけが残る正体不明の怪。",
      zukanEncounter: "町外れの林の奥に潜んでいる。見つけて触れると百鬼夜行へ加わる。",
      zukanFlavor: "鉤爪で、ときどき地面に何か書いている。",
      hint: "町外れの林の奥を、探してみよう", scale: 1.2,
      onsen: { preferredArea: "nakaniwa", lines: ["（大きな爪で、器用に湯を掬っている）"] },
    },
    sites: [{ x: -30, z: 105, r: 3, presence: "peek" }, { x: 130, z: 40, r: 3, presence: "peek" }, { x: 130, z: -90, r: 3, presence: "eyes" }],
  },
  {
    def: {
      id: "shirikoboshi", name: "尻こぼし", reading: "しりこぼし", aliases: ["コボシ"], family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "pita", ...N, normalWave: 6,
      lore: "三重県志摩地方に伝わる海の怪で、河童の類ともされる。",
      zukanEncounter: "川辺を歩き続けると水際に現れる。近づくと百鬼夜行へ加わる。",
      zukanFlavor: "河童と並ぶと、どちらが先輩かで少しもめる。",
      hint: "川辺を、もっと歩き続けてみよう", scale: 0.9,
      talk: { appear: "水際で、何かがぬるりと動いた…" },
      onsen: { preferredArea: "uchiyu", vignetteTags: ["water"], lines: ["海の湯とは、また違うな。"] },
    },
    sites: [{ x: 0, z: 0, r: 0, arrive: "river" }],
  },
  {
    def: {
      id: "mokumokuren", name: "目目連", reading: "もくもくれん", family: "SPECIAL", rule: { kind: "gaze", looks: ["shoji_plain", "shoji_blink"], near: [12, 6] }, se: "kusu", ...N, normalWave: 6,
      lore: "鳥山石燕が、破れ障子いっぱいに目が浮かぶ姿で描いた妖怪。",
      zukanEncounter: "夜の長屋に、視線を感じる障子がある。近づくたびに目が開き、最後に触れると百鬼夜行へ加わる。",
      zukanFlavor: "行列のどこにいても、誰かと目が合う。",
      hint: "長屋の障子から、視線を感じる",
      talk: { appear: "（障子いっぱいに、目がぱちりと開いた）", ok: "（目という目が、うれしそうに細くなった）" },
      onsen: { preferredArea: "zashiki", lines: ["この宿の障子は、ずいぶん居心地がよい。", "（障子の目が、湯煙をぼんやり眺めている）"] },
    },
    sites: [{ x: -72, z: -62.9, r: 0, yaw: Math.PI }, { x: -45, z: -73.1, r: 0, yaw: 0 }, { x: -88, z: -62.9, r: 0, yaw: Math.PI }, { x: -35, z: -62.9, r: 0, yaw: Math.PI }],
  },
];
