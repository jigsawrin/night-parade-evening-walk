/**
 * 通常妖怪・第 2 段階（21 種。一般に名の知られた妖怪。近現代の怪談はテケテケ・八尺様）。wave 1〜3 に分けて少しずつ町へ混ざる。
 * 図鑑の文は三つに分ける：lore（伝承・原典の特徴だけ）・zukanEncounter（この町での出会い方）・zukanFlavor（情景のひとこと）。
 * 姿は characters/normalModels.ts。血・欠損・生々しい表現はしない（テケテケもかわいらしく崩す）。
 * 設定は normalYokai.ts。**出る場所・加入条件・数はすべて仮**。
 */
import type { NormalEntry } from "./normalYokai";

const N = { rank: "normal", discovery: "normal" } as const;

export const SECOND_ENTRIES: NormalEntry[] = [
  // ---- wave 1
  {
    def: {
      id: "umibozu", name: "海坊主", reading: "うみぼうず", aliases: ["海入道", "海法師"], family: "FLOAT", rule: { kind: "touch" }, se: "bo", ...N, uniquePerNight: true, normalWave: 1,
      lore: "海で船を止め、柄杓を求める怪として各地に伝わる。",
      zukanEncounter: "妖怪船が現れた夜、水辺に姿を見せる。近づくと百鬼夜行へ加わる。",
      zukanFlavor: "川の水は、この体には少しばかり浅いらしい。",
      hint: "妖怪船の夜、水辺を見てみよう", hover: 0.05, scale: 1.5,
      onsen: { preferredArea: "iwaburo", vignetteTags: ["water"], lines: ["この湯は、海よりずっと浅いな。", "柄杓は要らん。湯に浸かるだけでいい。"] },
    },
    sites: [{ x: 54, z: 10, r: 1, layer: "yokaiBoat" }, { x: 82, z: -4, r: 1, layer: "yokaiBoat" }],
  },
  {
    def: {
      id: "hitotsume", name: "一つ目小僧", reading: "ひとつめこぞう", family: "CHIBI_BIPED", rule: { kind: "shy", hops: 1 }, se: "kusu", ...N, normalWave: 1,
      lore: "額に一つ目を持つ小僧で、事八日の夜に家々を巡るとも語られる。",
      zukanEncounter: "夜の家並みの物陰にいる。一度逃げた後、近づくと百鬼夜行へ加わる。",
      zukanFlavor: "大きな一つ目で、行列の隅々まで見ている。",
      hint: "家並みの物陰に、何かいる…", scale: 0.85,
      talk: { tease: "べー！", ok: "えへへ、見つかっちゃった" },
      onsen: { preferredArea: "hiroma", lines: ["おいらの目、湯気でもくもらないんだ。", "大広間って、走りたくなるよね。"] },
    },
    sites: [{ x: -50, z: -75, r: 3, presence: "whisper" }, { x: 15, z: -100, r: 3, presence: "whisper" }, { x: -85, z: -42, r: 3, presence: "whisper" }],
  },
  {
    def: {
      id: "yukionna", name: "雪女", reading: "ゆきおんな", family: "FLOAT", rule: { kind: "standStill", secs: 2, reach: 7 }, se: "fuwa", ...N, normalWave: 1,
      lore: "雪の夜に女の姿で現れる怪異で、地方ごとに多くの姿が語られる。",
      zukanEncounter: "夜更けに現れる。そばで静かに佇んでいると、向こうから寄ってきて加わる。",
      zukanFlavor: "通り過ぎたあと、提灯の火がかすかに揺れる。",
      hint: "夜更け、そばで静かに佇んでみよう", hover: 0.12, scale: 1.1,
      talk: { tease: "……静かな夜ね", ok: "……ついていくわ" },
      onsen: { preferredArea: "engawa", lines: ["湯は熱すぎるから、縁側で涼んでいるの。", "……夜風が、ちょうどいいわ。"] },
    },
    sites: [{ x: -40, z: 40, r: 2, appearAt: 0.45 }, { x: 20, z: 62, r: 2, appearAt: 0.5 }, { x: 95, z: 60, r: 2, appearAt: 0.55 }],
  },
  {
    def: {
      id: "nurikabe", name: "ぬりかべ", reading: "ぬりかべ", family: "CHIBI_BIPED", rule: { kind: "sidestep" }, se: "bo", ...N, normalWave: 1,
      lore: "夜道に見えない壁となって行く手を塞ぐと九州で語られる怪異。",
      zukanEncounter: "道を塞ぎ、正面を向け続ける。脇や後ろへ回り込んで触れると百鬼夜行へ加わる。",
      zukanFlavor: "行列の最後尾で、黙って風よけになっている。",
      hint: "正面は壁のようだ。脇へ回ってみよう", scale: 1.3,
      talk: { tease: "……（道をふさいでいる）", ok: "……ぬり" },
      onsen: { preferredArea: "hiroma", lines: ["……（大広間の壁ぎわに、ぴったり並んでいる）", "……ぬり。（湯上がりで、少しやわらかい）"] },
    },
    sites: [{ x: -63, z: -78, r: 0 }, { x: -93, z: -55, r: 0 }, { x: 30, z: -61, r: 0 }],
  },
  {
    def: {
      id: "konaki", name: "子泣き爺", reading: "こなきじじい", family: "CHIBI_BIPED", rule: { kind: "followSteps", dist: 30 }, se: "kusu", ...N, normalWave: 1,
      lore: "山中で赤子のように泣き、抱き上げるほど重くなると語られる老人の怪。",
      zukanEncounter: "泣き声の主のそばで、しばらく一緒に歩いてやると、満足して百鬼夜行へ加わる。",
      zukanFlavor: "おぎゃあ、と泣いたあと、しれっと茶をすする。",
      hint: "泣き声の主を、しばらく連れて歩こう", scale: 0.85,
      talk: { tease: "おぎゃあ、おぎゃあ…", ok: "ふう、満足じゃ。ついていこう" },
      onsen: { preferredArea: "zashiki", lines: ["湯に浸かると、体が軽うなるのう。", "わしを背負うても、ここでは重うならんぞ。"] },
    },
    sites: [{ x: 30, z: 95, r: 3 }, { x: -30, z: 92, r: 3 }, { x: 118, z: 30, r: 3 }],
  },
  {
    def: {
      id: "sunakake", name: "砂かけ婆", reading: "すなかけばばあ", family: "CHIBI_BIPED", rule: { kind: "flee", speed: 4.2 }, se: "kusu", ...N, normalWave: 1,
      lore: "人気のない神社や森で、どこからともなく砂を浴びせると伝わる怪異。",
      zukanEncounter: "寺社の道で砂煙を立てて逃げる。追いついて捕まえると百鬼夜行へ加わる。",
      zukanFlavor: "袂の砂は、祭りの夜のためにとってある。",
      hint: "寺社の道の砂煙を、追いかけよう", scale: 0.9,
      talk: { tease: "ほれ、砂じゃ砂じゃ！", tired: "ひい、ひい…年寄りを走らせるでない" },
      onsen: { preferredArea: "chouba", lines: ["砂は置いてきたよ。宿の者に叱られるでな。", "ここの茶はうまいねえ。"] },
    },
    sites: [{ x: -35, z: 15, r: 4 }, { x: -6, z: 85, r: 4 }, { x: -70, z: 28, r: 4 }],
  },
  {
    def: {
      id: "yamauba", name: "山姥", reading: "やまうば", family: "CHIBI_BIPED", rule: { kind: "food" }, se: "hoo", ...N, normalWave: 1,
      lore: "山に棲む老女の怪で、恐ろしい鬼婆から福を授ける存在まで伝承は多様。",
      zukanEncounter: "町外れで腹を空かせている。団子を渡すと、機嫌よく百鬼夜行へ加わる。",
      zukanFlavor: "団子の礼に、山の話をひとつ聞かせてくれる。",
      hint: "「腹が減ったねえ…」", scale: 1.1,
      talk: { ask: "腹が減ったねえ…団子はないかい", ok: "団子かい。気が利くねえ、ついてってやろう" },
      onsen: { preferredArea: "hiroma", vignetteTags: ["sake"], lines: ["山の湯もいいが、宿の湯は格別だね。", "ほれ、あんたも食べな。饅頭だよ。"] },
    },
    sites: [{ x: -30, z: 98, r: 3 }, { x: 118, z: 15, r: 3 }, { x: 35, z: 88, r: 3 }],
  },
  // ---- wave 2
  {
    def: {
      id: "amanojaku", name: "天邪鬼", reading: "あまのじゃく", family: "CHIBI_BIPED", rule: { kind: "contrary" }, se: "karan", ...N, normalWave: 2,
      lore: "昔話で人に逆らい、真似をしたり意地悪をする怪として登場する。",
      zukanEncounter: "追うと逃げる。背を向けて歩くとついてきて、百鬼夜行へ加わる。",
      zukanFlavor: "ついてきていないと言いながら、いちばん近くにいる。",
      hint: "追うと逃げる。背を向けて歩いてみよう", scale: 0.9,
      talk: { tease: "来るな来るな！ …行っちゃうの？", ok: "べつに、ついていきたいわけじゃないからな！" },
      onsen: { preferredArea: "engawa", lines: ["湯なんか、ちっとも気持ちよくないぞ。…ふう。", "こっち見るな。…見てもいいけど。"] },
    },
    sites: [{ x: 20, z: 10, r: 4 }, { x: -50, z: -20, r: 4 }, { x: 100, z: -25, r: 4 }],
  },
  {
    def: {
      id: "kamaitachi", name: "鎌鼬", reading: "かまいたち", family: "CHIBI_QUAD", rule: { kind: "flee", speed: 7.6 }, se: "hira", ...N, normalWave: 2,
      lore: "風が通り過ぎた後、刃物もないのに傷が残る怪異として語られる。",
      zukanEncounter: "風の筋のように町を走り抜ける。追い切って捕まえると百鬼夜行へ加わる。",
      zukanFlavor: "ひゅうっと吹き抜けた風の先に、たいていいる。",
      hint: "風の筋を、追い切ってみよう", scale: 0.8,
      talk: { tease: "ひゅうっ！", tired: "は、速いな…降参だ" },
      onsen: { preferredArea: "maeniwa", lines: ["湯気の中は、風が通りにくいな。", "今夜は兄弟を置いてきた。のんびりするさ。"] },
    },
    sites: [{ x: -20, z: -20, r: 6 }, { x: 0, z: -45, r: 6 }, { x: 110, z: -20, r: 5 }],
  },
  {
    def: {
      id: "sunekosuri", name: "すねこすり", reading: "すねこすり", family: "CHIBI_QUAD", rule: { kind: "followSteps", dist: 20 }, se: "nya", ...N, normalWave: 2,
      lore: "岡山に伝わる、夜道で人の脛へまとわりつく小さな怪。",
      zukanEncounter: "足元にまとわりついてくる。しばらく一緒に歩いてやると、懐いて百鬼夜行へ加わる。",
      zukanFlavor: "歩きにくい。けれど、足元があたたかい。",
      hint: "足元にまとわりつく。一緒に歩いてみよう", scale: 0.7,
      talk: { tease: "すりすり…", ok: "すりすり！（懐いたようだ）" },
      onsen: { preferredArea: "zashiki", lines: ["すりすり…（湯上がりの足に、まとわりついてくる）"] },
    },
    sites: [{ x: -80, z: -67, r: 4 }, { x: 0, z: -80, r: 4 }, { x: 40, z: -30, r: 4 }],
  },
  {
    def: {
      id: "baku", name: "獏", reading: "ばく", family: "CHIBI_QUAD", rule: { kind: "standStill", secs: 2.5, reach: 8 }, se: "fuwa", ...N, normalWave: 2,
      lore: "悪い夢を食べると信じられ、枕や宝船にも姿を描かれた霊獣。",
      zukanEncounter: "夜更けの長屋に潜んでいる。そばで静かに待っていると現れ、百鬼夜行へ加わる。",
      zukanFlavor: "悪い夢の匂いがしない夜は、少し退屈そうだ。",
      hint: "夜更けの長屋で、静かに待ってみよう", scale: 1.1,
      talk: { appear: "（夢の匂いにつられて、何かが現れた）", ok: "むにゃ…ついていこう" },
      onsen: { preferredArea: "zashiki", lines: ["ここの客は、よい夢を見るのう。", "悪い夢は、ぜんぶ食べておいたぞ。"] },
    },
    sites: [{ x: -78, z: -52, r: 1, appearAt: 0.4, lurk: true }, { x: -45, z: -95, r: 1, appearAt: 0.45, lurk: true }],
  },
  {
    def: {
      id: "ningyo", name: "人魚", reading: "にんぎょ", family: "FLOAT", rule: { kind: "shy", hops: 1, dist: 8 }, se: "pita", ...N, normalWave: 2,
      lore: "人と魚が混じる怪異として、古くから日本各地で語られてきた。",
      zukanEncounter: "川辺を祭りにすると水辺に姿を見せる。一度跳ねて逃げた後、近づくと百鬼夜行へ加わる。",
      zukanFlavor: "水たまりを見つけるたび、尾びれがうずうずする。",
      hint: "川辺を歩き、水辺を賑わせてみよう", hover: 0.1,
      talk: { tease: "（ぽちゃん、と水辺へ跳ねた）", ok: "ふふ、陸を歩くのも楽しそう" },
      onsen: { preferredArea: "iwaburo", vignetteTags: ["water"], lines: ["尾びれを伸ばせる湯って、いいわね。", "このお湯、少ししょっぱいと落ち着くの。"] },
    },
    sites: [{ x: 54, z: -50, r: 1, district: "riverside" }, { x: 82, z: 70, r: 1, district: "riverside" }],
  },
  {
    def: {
      id: "azukiarai", name: "小豆洗い", reading: "あずきあらい", family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "kusu", ...N, normalWave: 2, murmur: "shaka",
      lore: "川や沢で、小豆を洗うような音を立てると各地に伝わる怪。",
      zukanEncounter: "水辺に潜み、小豆を洗う音だけが聞こえる。音の近くで立ち止まると姿を見せ、触れると加わる。",
      zukanFlavor: "しゃっ、しゃっ。行列の中でも、手は止まらない。",
      hint: "しゃっ、しゃっ……と聞こえる方へ", scale: 0.85,
      talk: { tease: "（しゃっ、しゃっ……どこかで、小豆を洗う音がする）", appear: "（ざるを抱えた小さな爺さまが、水際で顔を上げた）" },
      onsen: { preferredArea: "uchiyu", vignetteTags: ["water"], lines: ["湯の音も、小豆を洗う音も、よく似ておる。", "ざるは脱衣所に置いてきたわい。"] },
    },
    sites: [{ x: 54, z: -28, r: 1, lurk: true }, { x: 82, z: 45, r: 1, lurk: true }, { x: 54, z: 58, r: 1, lurk: true }],
  },
  {
    def: {
      id: "jorogumo", name: "絡新婦", reading: "じょろうぐも", family: "CHIBI_BIPED", rule: { kind: "touch" }, se: "fuwa", ...N, normalWave: 2, uniquePerNight: true,
      lore: "美女の姿で人を惑わす蜘蛛の怪として語られる。",
      zukanEncounter: "橋のたもとの細い蜘蛛の糸を辿ると、その先に姿を見せる。触れると百鬼夜行へ加わる。",
      zukanFlavor: "糸の先で、行列が通るのを静かに待っていた。",
      hint: "橋のたもとの細い糸を、辿ってみよう", scale: 1.1,
      talk: { appear: "（糸の先に、蜘蛛の脚をもつ女が静かに立っていた）", ok: "糸を辿ってきたのね。ご一緒しましょう" },
      onsen: { preferredArea: "engawa", lines: ["湯煙に糸が絡まぬよう、今日は休ませてもらうよ。", "縁側の梁、よい糸が張れそうね。"] },
    },
    sites: [
      { x: 83, z: -45, r: 0, trail: [[82, -25], [84, -31], [83, -38]] },
      { x: 52, z: 74, r: 0, trail: [[53, 55], [52, 61], [52, 68]] },
      { x: 86, z: 78, r: 0, trail: [[82, 56], [85, 63], [86, 71]] },
    ],
  },
  // ---- wave 3
  {
    def: {
      id: "teketeke", name: "テケテケ", reading: "てけてけ", family: "CHIBI_QUAD", rule: { kind: "flee", speed: 8.2 }, se: "karan", ...N, uniquePerNight: true, normalWave: 3, originKind: "modern",
      lore: "下半身を失い、腕で高速に移動すると語られる戦後の都市怪談。",
      zukanEncounter: "夜更けの道を素早く駆けていく。追いついて捕まえると百鬼夜行へ加わる。",
      zukanFlavor: "テケテケテケ。足音だけは、誰よりもにぎやか。",
      hint: "夜更けの道を駆けていく。追いつこう", scale: 0.85,
      talk: { tease: "テケテケテケ！", tired: "テケ…テケ…（ひと休み）" },
      onsen: { preferredArea: "hiroma", lines: ["テケテケ…（湯船のふちを、腕で一周している）", "走らないで入れる湯って、いいね。"] },
    },
    sites: [{ x: 0, z: -100, r: 5, appearAt: 0.4 }, { x: -60, z: -20, r: 5, appearAt: 0.45 }, { x: 30, z: -61, r: 4, appearAt: 0.5 }],
  },
  {
    def: {
      id: "amabie", name: "アマビエ", reading: "あまびえ", family: "FLOAT", rule: { kind: "respond", secs: 1.5 }, se: "pita", ...N, uniquePerNight: true, normalWave: 3, originKind: "prophetic",
      lore: "弘化三年、肥後の海に現れ、疫病には姿を写して見せよと告げた予言獣。",
      zukanEncounter: "川辺を祭りにすると水辺に上がってきて呼びかける。そばで立ち止まって応えると加わる。",
      zukanFlavor: "行列のみんなの顔を、ひとりずつ覚えている。",
      hint: "水辺が賑わうと、何かが上がってくる", hover: 0.2, scale: 0.9,
      talk: { tease: "わたしの姿を、よく見ておいて", ok: "よく見てくれたのね。一緒にいこう" },
      onsen: { preferredArea: "rotenburo", vignetteTags: ["water"], lines: ["湯の中から、みんなの無病を祈っているの。", "写し絵、描いてくれてもいいのよ。"] },
    },
    sites: [{ x: 53, z: -35, r: 1, district: "riverside" }, { x: 84, z: 2, r: 1, district: "riverside" }],
  },
  {
    def: {
      id: "nue", name: "鵺", reading: "ぬえ", family: "CHIBI_QUAD", rule: { kind: "perch", reach: 12 }, se: "hoo", ...N, uniquePerNight: true, normalWave: 3,
      lore: "『平家物語』で源頼政に射落とされた異形の怪物。",
      zukanEncounter: "百鬼夜行が空の気配を開くと、屋根の上に姿を見せる。近くまで行くと降りてきて加わる。",
      zukanFlavor: "ひょう、ひょう。鳴き声だけが先に行列へ届く。",
      hint: "空の気配が開いた夜、高い所を見上げよう", scale: 1.25,
      talk: { ok: "ひょう……" },
      onsen: { preferredArea: "bourou", lines: ["ひょう、ひょう……（望楼の上で、夜空を眺めている）"] },
    },
    sites: [
      { x: -40, z: -7, r: 0, layer: "sky", y: 5.6, roof: true },
      { x: 38, z: -33, r: 0, layer: "sky", y: 5.6, roof: true },
      { x: -55, z: -33, r: 0, layer: "sky", y: 5.6, roof: true },
    ],
  },
  {
    def: {
      id: "namahage", name: "なまはげ", reading: "なまはげ", family: "CHIBI_BIPED", rule: { kind: "minCount", count: 20 }, se: "hoo", ...N, normalWave: 3, originKind: "visitingGod",
      lore: "男鹿で家々を訪れ、怠けを戒め、厄を祓い福をもたらす来訪神。",
      zukanEncounter: "祭りになった地区に現れる。二十妖以上の元気な行列を見せると百鬼夜行へ加わる。",
      zukanFlavor: "大きな声とは裏腹に、歩みはゆっくりしている。",
      hint: "祭りの町で、元気な行列を見せよう", scale: 1.3,
      talk: { ask: "泣く子はいねがぁ！ もっと元気な{n}妖の行列を見せてみろ", ok: "よぉし、元気な行列だ！ ついてくぞぉ" },
      onsen: { preferredArea: "hiroma", lines: ["湯の中では、みんな怠けてよし！", "蓑が湯気を吸って、重たいのう。"] },
    },
    sites: [{ x: 0, z: -90, r: 3, district: "south" }, { x: 10, z: 30, r: 3, district: "plaza" }, { x: -40, z: -12, r: 3, district: "shotengai" }],
  },
  {
    def: {
      id: "kudan", name: "件", reading: "くだん", family: "CHIBI_QUAD", rule: { kind: "touch" }, se: "bo", ...N, normalWave: 3,
      lore: "人の顔と牛の体を持ち、未来を告げると語られる怪。",
      zukanEncounter: "二つの地区を祭りにすると姿を見せる。近づいて触れると百鬼夜行へ加わる。",
      zukanFlavor: "何も言わない。言わないほうがいい夜もある。",
      hint: "いくつかの地区を祭りにしてみよう", scale: 1.05,
      talk: { appear: "（人の顔をした牛が、静かにこちらを見ている）" },
      onsen: { preferredArea: "nakaniwa", lines: ["……明日も、よい湯でしょう。", "……（静かに湯気を見つめている）"] },
    },
    sites: [{ x: 115, z: -45, r: 2, after: { districts: 2 } }, { x: -30, z: -100, r: 2, after: { districts: 2 } }],
  },
  {
    def: {
      id: "hasshaku", name: "八尺様", reading: "はっしゃくさま", family: "CHIBI_BIPED", rule: { kind: "shy", hops: 3, dist: 16 }, se: "fuwa", ...N, uniquePerNight: true, normalWave: 3, originKind: "modern",
      lore: "非常に背の高い女が「ぽぽぽ」と現れる、平成のネット怪談から広まった怪異。",
      zukanEncounter: "遠くで声がして、近づくと離れていく。何度か追いかけると百鬼夜行へ加わる。",
      zukanFlavor: "ぽぽぽ、と遠くで聞こえた声は、いつの間にかすぐ後ろにいる。",
      hint: "遠くの声を、何度か追ってみよう", scale: 1.9,
      talk: { tease: "ぽぽぽ……", ok: "ぽぽ……（ついてくるようだ）" },
      onsen: { preferredArea: "engawa", lines: ["ぽぽぽ……（鴨居に頭をぶつけないよう、かがんでいる）"] },
    },
    sites: [{ x: 95, z: -55, r: 1 }, { x: -100, z: -100, r: 1 }, { x: 30, z: 85, r: 1 }],
  },
  {
    def: {
      id: "nopperabo", name: "のっぺらぼう", reading: "のっぺらぼう", family: "CHIBI_BIPED", rule: { kind: "gaze", looks: ["villager_b"], near: [3.5] }, se: "kusu", ...N, normalWave: 3, uniquePerNight: true,
      lore: "人の姿で現れ、振り向くと顔に目鼻口がないと語られる怪。",
      zukanEncounter: "夜道にぽつんと立つ人影に化けている。近づくと正体を現し、そのまま百鬼夜行へ加わる。",
      zukanFlavor: "顔がなくても、うれしいときはなんとなく分かる。",
      hint: "夜道にぽつんと立つ人影に、近づいてみよう",
      talk: { appear: "（振り向いた顔には、目も鼻も口もなかった）", ok: "……（顔のない顔で、うれしそうに頷いた）" },
      onsen: { preferredArea: "chouba", lines: ["顔がなくとも、湯上がりは分かるものさ。", "鏡の前は、ちと落ち着かんね。"] },
    },
    sites: [{ x: 0, z: -85, r: 0 }, { x: -40, z: -67, r: 0 }, { x: -30, z: 15, r: 0 }, { x: 110, z: -20, r: 0 }],
  },
];
