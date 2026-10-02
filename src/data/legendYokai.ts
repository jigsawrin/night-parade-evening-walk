/**
 * 大妖怪・三大妖怪・隠し妖怪の定義（図鑑の文・姿の大きさ・気配・陰陽師への効き目・写真の立ち位置）と、
 * **出る場所（spawn）と加入条件（rule）**。一体ずつ一つの塊にまとめてあるので、条件を変えるときはその妖怪の塊だけを直す。
 *
 * **出る場所と加入条件はすべて仮**（遊びの手触りはユーザーが遊んで決める）。どちらも伝承に沿わせる：
 *  出る場所は伝承の土地に近い町の場所（大江山 → 裏路地の酒盛り、水辺 → 川辺、墓 → 墓地…）、
 *  加入条件は伝承にちなんだ百鬼夜行（酒でもてなす、怪異をくぐる胆力、多くの種類を知る…）。
 *  - spawn：町のどこに一体（x・z）。appearAt＝夜の進み（0〜1）で現れる、layer＝世界の層が開くと現れる（keepRule で条件はそのまま）
 *  - rule.conditions：すべて満たす（AND）。使える条件は yokaiTypes.ts の LegendCondition。足りないときの言葉は LegendRules が作る
 *  - rule.ask：足りないときの一言、rule.ok：認めたときの一言、hint：近くで聞こえる一言
 * 今夜いるかは NightLegendRoster（候補の数は legendConfig.ts の NIGHT_ROSTER）。隠し妖怪の見つかり方は legendConfig.ts の HIDDEN_DISCOVERIES。
 * 姿は characters/legendModels.ts。
 * ※ node --test から直接読み込むため、実行時の import を持たない。
 */
import type { SpawnDef } from "./map";
import type { YokaiType } from "./yokaiTypes";

/** 町に置く場所（一夜一体なので n = 1・r = 0） */
type LegendSpawn = Pick<SpawnDef, "x" | "z"> & Partial<Pick<SpawnDef, "appearAt" | "layer" | "keepRule" | "y">>;

interface LegendEntry {
  def: YokaiType;
  spawn: LegendSpawn;
}

/** 定義の並び（図鑑の順ではない。図鑑の順は data/zukanOrder.ts） */
const ENTRIES: LegendEntry[] = [
  // ================================================================ 大妖怪（greater）
  {
    // 夜更けに五重塔の前へ舞い降りる。眷属の天狗を連れ、行列の遊びを二つ成就していると加わる
    spawn: { x: -100, z: 27.5, appearAt: 0.3 },
    def: {
      id: "daitengu", name: "大天狗", reading: "だいてんぐ", family: "CHIBI_BIPED", se: "hoo", scale: 1.45,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "rear",
      awe: { mode: "rout", text: "陰陽師「大天狗様まで…これは祓えぬ」", memory: "大天狗を連れて、陰陽師を退けた" },
      omen: { kind: "fue", cues: ["wind", "wings", "distantFlute"] },
      onsen: { preferredArea: "rotenburo", lines: ["山の風もよいが、湯煙の風も悪くない。", "ここでは翼をたたんでおる。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "tengu", n: 1 }, { kind: "activityCount", n: 2 }],
        ask: "我が眷属の天狗を連れ、見事な練り歩きを二つ見せよ", ok: "見事。この大天狗、百鬼夜行の殿を務めよう",
      },
      lore: "天狗の中でも特に位が高く、強い力を持つ存在。山奥から風を従え、並の天狗を見下ろす。",
      zukanEncounter: "夜更けに寺町の五重塔の前へ舞い降りる。天狗を連れ、行列の遊びを二つ成し遂げて会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "並の天狗を見かけると、つい背筋を正させる。",
      hint: "「我が眷属はどこじゃ」",
    },
  },
  {
    // 羅生門の鬼：寺の門のそばに佇む。酒呑童子の配下らしく、鬼の子分を連れた立派な行列を求める
    spawn: { x: -54, z: 21, appearAt: 0.35 },
    def: {
      id: "ibaraki", name: "茨木童子", reading: "いばらきどうじ", aliases: ["茨城童子"], family: "CHIBI_BIPED", se: "karan", scale: 1.4,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      omen: { kind: "shadow", cues: ["gate", "severedArm", "rain"] },
      onsen: { preferredArea: "banquet", vignetteTags: ["banquet", "sake"], lines: ["頭領の酒の相手は、骨が折れる。", "この腕か？ もう痛まぬ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "oni", n: 6 }, { kind: "totalCount", n: 25 }],
        ask: "鬼の子分を六匹。頭領に恥じぬ二十五妖の行列で来い", ok: "悪くない。腕の一本くらいは貸してやる",
      },
      lore: "酒呑童子配下の名高い鬼。羅生門で渡辺綱と渡り合い、斬られた腕をのちに取り返したと語られる。",
      zukanEncounter: "夜更けに寺の門のそばに佇む。小鬼を六妖連れた二十五妖以上の行列で会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "取り返した腕の具合を、ときどき確かめている。",
      hint: "「この腕、二度と斬らせはせぬ」",
    },
  },
  {
    // 水辺の怪：川辺の南の岸に潜む。河童たちを連れ、川辺を祭りにすると水から上がってくる
    spawn: { x: 52, z: -96, appearAt: 0.4 },
    def: {
      id: "ushi_oni", name: "牛鬼", reading: "うしおに", family: "CHIBI_QUAD", se: "pita", scale: 1.6,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      omen: { kind: "glint", cues: ["water", "redEyes", "lowMoo"] },
      onsen: { preferredArea: "rotenburo", vignetteTags: ["water"], lines: ["……ぶもぉ。（湯に深く沈んで、目だけ出している）", "水辺は好きだが、湯もまた、よい。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "kappa", n: 3 }, { kind: "districtAwakened", district: "riverside" }],
        ask: "水の仲間の河童を三匹。川辺を祭りにしてみせよ", ok: "濡れた足のまま、ついて行こう",
      },
      lore: "牛の姿や牛頭の怪物として各地に伝わる妖怪。海や川、滝など、水辺の怪異として語られることも多い。",
      zukanEncounter: "夜更けに川辺の南の岸に潜む。河童を三妖連れ、川辺を祭りにして会いに行くと、水から上がって加わる。",
      zukanFlavor: "水から上がった足跡が、行列の後ろに点々と続く。",
      hint: "水音の中から、低い唸り声がする",
    },
  },
  {
    // 出雲の大蛇：川上の岸にとぐろを巻く。八塩折の酒の故事にちなみ、腹ぺこの妖怪をもてなした大きな行列で会う
    spawn: { x: 82, z: 108, appearAt: 0.45 },
    def: {
      id: "orochi", name: "八岐大蛇", reading: "やまたのおろち", aliases: ["八俣遠呂智"], family: "SERPENT", se: "bo", scale: 1.9,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "rear",
      awe: { mode: "rout", text: "陰陽師「八つの首…！ 八岐大蛇だと」", memory: "八岐大蛇を連れて、陰陽師を退けた" },
      omen: { kind: "shadow", cues: ["river", "eightHeads", "sakeScent"] },
      onsen: { preferredArea: "okuniwa", vignetteTags: ["water"], lines: ["八つの頭が、みな同じ湯を気に入った。珍しいことよ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "encounterComplete", encounter: "hungryGroup", n: 1 }, { kind: "totalCount", n: 40 }],
        ask: "八つの頭が腹を空かせておる。腹ぺこの妖怪をもてなし、四十妖の行列で来い", ok: "酒の匂いのする行列よ…ついて行こう",
      },
      lore: "八つの頭と八つの尾を持つ出雲の大蛇。酒に酔わされ、その尾から天叢雲剣が現れたと神話は語る。",
      zukanEncounter: "夜更けに川上の岸でとぐろを巻く。腹ぺこの妖怪を一度もてなし、四十妖以上の行列で会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "八つの頭が、それぞれ別の屋台を見ている。",
      hint: "川上から、何かが八つ、こちらを見ている",
    },
  },
  {
    // 山を運ぶ巨人：町はずれの野原に腰を下ろす。大きな行列が町を祭りに変えていく様を見に来る
    spawn: { x: 104, z: -96, appearAt: 0.55 },
    def: {
      id: "daidara", name: "ダイダラボッチ", reading: "だいだらぼっち", aliases: ["ダイダラ坊", "大太法師"], family: "CHIBI_BIPED", se: "bo", scale: 2.8,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "rear",
      omen: { kind: "taiko", cues: ["footsteps", "rumble", "mountain"] },
      onsen: { preferredArea: "iwaburo", lines: ["この岩風呂は、わしでも足が伸ばせる。", "昔、山を運んだついでに、湯を掘ったこともあった。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "totalCount", n: 50 }, { kind: "districtAwakened", n: 2 }],
        ask: "わしの一歩で池ができる。五十妖の行列と、祭りの町を二つ見せてくれ", ok: "よし、町ごと跨いで歩いてやろう",
      },
      lore: "山を運び、足跡を池や沼に変えたと語られる巨人。日本各地の地形に、その巨大な痕跡を残す。",
      zukanEncounter: "夜更けに町はずれの野原に腰を下ろす。二つの地区を祭りにし、五十妖以上の行列で会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "一歩ごとに、行列の提灯がそろって揺れる。",
      hint: "地面が、どしん、と揺れた",
    },
  },
  {
    // 『稲生物怪録』の魔王：夜更けの長屋の奥の屋敷に現れる。怪異をくぐり、ろくろ首にも怯まぬ胆力を試す
    spawn: { x: -98, z: -102, appearAt: 0.65 },
    def: {
      id: "sanmoto", name: "山本五郎左衛門", reading: "さんもとごろうざえもん", aliases: ["山ン本五郎左衛門"], family: "CHIBI_BIPED", se: "karan", scale: 1.45,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      awe: { mode: "rout", text: "陰陽師「魔王…山本五郎左衛門か。わしの手には負えぬ」", memory: "山本五郎左衛門を連れて、陰陽師を退けた" },
      omen: { kind: "lantern", cues: ["oldHouse", "mallet", "thirtyNights"] },
      onsen: { preferredArea: "zashiki", lines: ["静かな座敷は、よい。肝の据わった客ばかりだ。", "茶をもう一杯、所望しよう。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "encounterComplete", n: 3 }, { kind: "specificYokai", type: "rokurokubi", n: 1 }],
        ask: "怪異を三つくぐり、ろくろ首を連れても怯まぬ胆力を見せよ", ok: "見事な胆力。この山本五郎左衛門が見届けよう",
        greet: { with: "shinno_akugoro", text: "悪五郎まで来たか。今宵は騒がしくなる。" },
      },
      lore: "『稲生物怪録』に現れる魔物たちの頭領。三十日にわたる怪異で少年の胆力を試し、最後にはその勇気を認めた。",
      zukanEncounter: "夜更けに長屋の奥の屋敷に現れる。町の怪異を三つくぐり抜け、ろくろ首を連れて会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "肝の据わった者を見ると、どこか嬉しそうだ。",
      hint: "「肝の据わった者は、おらぬか」",
    },
  },
  {
    // 『稲生物怪録』で山本五郎左衛門と並ぶ魔物の頭領：妖怪横丁の門の前に、夜更けに現れる。人を驚かす腕を競う頭領らしく、
    // 多くの種類の魔物を率い、ほかの百鬼夜行と張り合った（合流した）行列を認める（山本五郎左衛門の「胆力」とは別の条件）
    spawn: { x: -104, z: -24, appearAt: 0.4 },
    def: {
      id: "shinno_akugoro", name: "神野悪五郎", reading: "しんのあくごろう", aliases: ["神ン野悪五郎", "真の悪五郎", "真野悪五郎"], family: "CHIBI_BIPED", se: "hoo", scale: 1.45,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      awe: { mode: "lowerSuspicion", amount: 0.3 },
      omen: { kind: "shadow", cues: ["yokochoGate", "rivalry", "manyFollowers"] },
      onsen: {
        preferredArea: "banquet",
        lines: ["五郎左衛門の姿も見えるな。今宵は退屈せずに済みそうだ。", "驚かせ比べは、湯の外でやるものよ。", "上座は譲らんぞ。……いや、湯の中では構わん。"],
      },
      rule: {
        kind: "legend", conditions: [{ kind: "typeVariety", n: 10 }, { kind: "encounterComplete", encounter: "miniParade", n: 1 }],
        ask: "魔物を率いる者なら、十種の妖怪を従え、よその百鬼夜行とも張り合ってみせよ", ok: "ほう、よい頭領ぶりだ。この悪五郎、しばし肩を並べてやろう",
        greet: { with: "sanmoto", text: "ほう、五郎左衛門まで連れておるか。" },
      },
      lore: "『稲生物怪録』に名を残す魔物たちの頭領。山本五郎左衛門と並ぶ大物として語られ、互いに人を驚かせる腕を競った。",
      zukanEncounter: "夜更けに妖怪横丁の門の前に現れる。十種以上の妖怪を連れ、小さな百鬼夜行と一度合流してから会いに行くと加わる。",
      zukanFlavor: "今宵の行列を眺め、誰かと張り合うように笑っている。",
      hint: "「わしより人を驚かせる者が、この町におるかな」",
    },
  },
  {
    // 飛騨の英雄・守護者：寺町の林に立つ。寺町を祭りにし、里を守るような行列を見守って加わる
    spawn: { x: -48, z: 50, appearAt: 0.3 },
    def: {
      id: "ryomen", name: "両面宿儺", reading: "りょうめんすくな", aliases: ["宿儺"], family: "CHIBI_BIPED", se: "hoo", scale: 1.55,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      awe: { mode: "lowerSuspicion", amount: 0.3 },
      omen: { kind: "suzu", cues: ["temple", "twoFaces", "axe"] },
      onsen: { preferredArea: "nakaniwa", lines: ["前の顔は庭を、後ろの顔は湯を見ておる。", "里の湯を思い出す。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "districtAwakened", district: "temple" }, { kind: "totalCount", n: 30 }],
        ask: "寺町を祭りにせよ。里を守る行列なら、前も後ろも見張ってやろう", ok: "二つの顔で、この行列を守ろう",
      },
      lore: "一つの体に二つの顔と四本の手足を持つ異形の者。『日本書紀』では討たれた怪人、飛騨では英雄・守護者としても語られる。",
      zukanEncounter: "夜更けに寺町の林に立つ。寺町を祭りにし、三十妖以上の行列で会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "前の顔は行く先を、後ろの顔は来た道を見ている。",
      hint: "前と後ろ、二つの声が同時に話しかけてきた",
    },
  },
  {
    // 墓地に現れる巨大な骸骨：夜更けの墓地で、人魂たちを連れて賑やかに来た行列に加わる
    spawn: { x: -95, z: 80, appearAt: 0.6 },
    def: {
      id: "gashadokuro", name: "ガシャドクロ", reading: "がしゃどくろ", family: "SPECIAL", se: "karan", scale: 2.4,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "rear",
      omen: { kind: "shadow", cues: ["graveyard", "rattle", "bones"] },
      onsen: { preferredArea: "okuniwa", lines: ["がしゃ……湯に浸かると、骨まで温まる。", "月がよう見える。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "hitodama", n: 6 }, { kind: "momentum", level: 2 }],
        ask: "がしゃ、がしゃ…人魂を六つ、賑やかに連れて来い", ok: "がしゃり。骨の髄まで祭りを味わおう",
      },
      lore: "無数の骸骨が集まった巨大な姿で知られる妖怪。実は昭和の妖怪文化から広まった、比較的新しい怪異である。",
      zukanEncounter: "夜更けの墓地に現れる。火の玉を六妖連れ、賑わいを「賑わい」まで高めて会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "がしゃり。大きな骨の手で、そっと提灯を持つ。",
      hint: "がしゃ、がしゃ…と骨の鳴る音がする",
    },
  },
  {
    // 何事にも逆らう荒ぶる神：人には見えぬ妖怪横丁の奥にいる。「ついて来い」には逆らい、よその行列と混じってから出直せと言う
    spawn: { x: -148, z: -40, layer: "yokocho", keepRule: true },
    def: {
      id: "amanozako", name: "天逆毎", reading: "あまのざこ", aliases: ["天逆毎姫"], family: "CHIBI_BIPED", se: "kusu", scale: 1.45,
      rank: "greater", discovery: "normal", uniquePerNight: true, photoRole: "flank",
      omen: { kind: "warai", cues: ["contrary", "wind", "fangs"] },
      onsen: { preferredArea: "maeniwa", lines: ["くつろいでなどおらぬ。……おらぬぞ。", "皆と同じ湯など、入らぬ。あとで入る。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "encounterComplete", encounter: "miniParade", n: 1 }, { kind: "totalCount", n: 45 }],
        ask: "ついて来いだと？ 逆じゃ。よその行列と混じってから、四十五妖で出直せ", ok: "…ふん。行ってやらぬこともない",
      },
      lore: "素戔嗚の猛気から生まれたとされる怪神。強神を投げ飛ばし、堅い刃さえ噛み砕く、何事にも逆らう荒ぶる存在。",
      zukanEncounter: "妖怪横丁が開くと、その奥にいる。小さな百鬼夜行と一度合流し、四十五妖以上の行列で会いに行くと加わる。",
      zukanFlavor: "ついて行かぬと言いながら、歩みは同じ向き。",
      hint: "「賑やかな行列など、好かぬ。…好かぬぞ」",
    },
  },

  // ================================================================ 隠し妖怪（格は大妖怪）
  {
    // 温泉宿で初めて会った後、町ではまれに茶屋の縁台で当然のように茶をすすっている。案内はしない（すぐそばまで来ると、いつの間にかいる）
    spawn: { x: 29, z: -15 },
    def: {
      id: "nurarihyon", name: "ぬらりひょん", reading: "ぬらりひょん", aliases: ["滑瓢"], family: "CHIBI_BIPED", se: "kusu", scale: 1.25,
      rank: "greater", discovery: "hidden", uniquePerNight: true, photoRole: "flank",
      onsen: { preferredArea: "chouba", lines: ["……よい湯じゃな。", "茶が冷めぬうちに、どうじゃ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "momentum", level: 3 }],
        ask: "（茶をすすっている）…にぎやかな行列じゃのう。もっと賑やかなら、混ざってもよいが", ok: "では、しれっと混ざるとしよう",
      },
      lore: "江戸の妖怪絵巻に姿を残す、つかみどころのない老人姿の妖怪。後世には「妖怪の総大将」とも呼ばれるようになった。",
      zukanEncounter: "宵霞楼で初めて出会う。その後は町の茶屋の縁台などに、いつの間にか座っている。賑わいが「大賑わい」の行列で会うと、しれっと加わる。",
      zukanFlavor: "気づけば、いちばんいい席に座っている。",
      hint: "",
    },
  },

  // ================================================================ 三大妖怪（threeGreat）
  {
    // 大江山の酒盛り：裏路地の妖怪祭りで酒盛りをしている。鬼の子分と、徳利を持った狸を連れて来ると加わる
    spawn: { x: -84, z: -79, layer: "alleyFestival", keepRule: true },
    def: {
      id: "shuten", name: "酒呑童子", reading: "しゅてんどうじ", aliases: ["酒顛童子", "酒天童子"], family: "CHIBI_BIPED", se: "karan", scale: 1.5,
      rank: "threeGreat", discovery: "normal", uniquePerNight: true, photoRole: "centerpiece",
      awe: { mode: "rout", text: "陰陽師「しゅ、酒呑童子…！ 大江山の鬼が、なぜここに」", memory: "酒呑童子を連れて、陰陽師を退けた" },
      omen: { kind: "warai", cues: ["laughter", "sakazuki", "taiko", "redLight"] },
      onsen: { preferredArea: "banquet", vignetteTags: ["banquet", "sake"], lines: ["湯上がりの一杯までが温泉よ。", "今宵は付き合え。つまみもあるぞ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "oni", n: 8 }, { kind: "specificYokai", type: "tanuki", n: 2 }],
        ask: "鬼の子分を八匹と、酒を持った狸を二匹連れて来い", ok: "よい酒盛りになりそうだ。付き合ってやろう",
      },
      lore: "大江山に鬼たちを従えた頭領。酒を愛し、その名は御伽草子や絵巻、能や歌舞伎にまで語り継がれた。",
      zukanEncounter: "裏路地の妖怪祭りが始まると、そこで酒盛りをしている。小鬼を八妖、化け狸を二妖連れて会いに行くと百鬼夜行へ加わる。",
      zukanFlavor: "今夜の酒盛りは、この行列そのものらしい。",
      hint: "「酒だ、酒を持って来い」",
    },
  },
  {
    // 宮中の美女、正体は金毛九尾の狐：稲荷の奥に現れる。狐たちと狐火をたどり、宴のような賑わいで迎えに来る行列に加わる。
    // 伝承で正体を見破ったのは陰陽師なので、陰陽師は退かない（awe を書かない）
    spawn: { x: 120, z: 112, appearAt: 0.4 },
    def: {
      id: "tamamo", name: "玉藻前", reading: "たまものまえ", aliases: ["九尾の狐", "金毛九尾の狐"], family: "CHIBI_BIPED", se: "kon", scale: 1.45,
      rank: "threeGreat", discovery: "normal", uniquePerNight: true, photoRole: "centerpiece",
      omen: { kind: "foxfire", cues: ["goldenLight", "nineTails", "court"] },
      onsen: { preferredArea: "tsukimi", vignetteTags: ["poem", "fan"], lines: ["今宵の月は、宮中で見たものより静かね。", "湯煙越しの灯りも、風情がありますわ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "specificYokai", type: "kitsune", n: 4 }, { kind: "encounterComplete", encounter: "foxfireTrail", n: 1 }, { kind: "momentum", level: 3 }],
        ask: "狐を四匹。狐火をたどり、宮中の宴のように賑やかな行列で迎えに来て", ok: "よいでしょう。今宵は正体を隠さずに歩きましょう",
      },
      lore: "宮中に現れた美貌の女。その正体は金毛九尾の狐とされ、のちに那須の殺生石の伝説へとつながる。",
      zukanEncounter: "夜更けに稲荷の奥に現れる。化け狐を四妖連れ、狐火を一度追い、賑わいを「大賑わい」まで高めて会いに行くと加わる。",
      zukanFlavor: "ふとした影に、九つの尾が揺れた気がする。",
      hint: "「わらわを迎えに来たのは、どなた」",
    },
  },
  {
    // 鈴鹿山の鬼神：町はずれの東に黒雲を呼んで立つ。嵐のような賑わいの大行列にだけ動く
    spawn: { x: 126, z: -56, appearAt: 0.45 },
    def: {
      id: "otakemaru", name: "大嶽丸", reading: "おおたけまる", family: "CHIBI_BIPED", se: "bo", scale: 1.6,
      rank: "threeGreat", discovery: "normal", uniquePerNight: true, photoRole: "centerpiece",
      awe: { mode: "rout", text: "陰陽師「鈴鹿の鬼神、大嶽丸…！ 退け、退けっ」", memory: "大嶽丸を連れて、陰陽師を退けた" },
      omen: { kind: "taiko", cues: ["thunder", "blackCloud", "storm"] },
      onsen: { preferredArea: "rotenburo", lines: ["黒雲も、今宵は湯煙に紛れておる。", "鈴鹿の山の湯を思い出すわ。"] },
      rule: {
        kind: "legend", conditions: [{ kind: "totalCount", n: 55 }, { kind: "momentum", level: 3 }],
        ask: "鈴鹿の鬼神を動かすか。嵐のような賑わいと、五十五妖の行列を見せよ", ok: "黒雲を呼べ。この大嶽丸が先を行く",
      },
      lore: "鈴鹿山に棲んだと語られる鬼神。強大な神通力を操り、坂上田村麻呂と鈴鹿御前の物語に名を残す。",
      zukanEncounter: "夜更けに町はずれの東へ黒雲を呼んで立つ。賑わいを「大賑わい」まで高め、五十五妖以上の行列で会いに行くと加わる。",
      zukanFlavor: "黒雲の下を歩くと、太鼓の音まで低く響く。",
      hint: "遠くで、雷のような太鼓が鳴った",
    },
  },
];

/** 大妖怪・三大妖怪・隠し妖怪（YOKAI に入る） */
export const LEGEND_YOKAI: Record<string, YokaiType> = Object.fromEntries(ENTRIES.map((e) => [e.def.id, e.def]));
/** 大妖怪・三大妖怪・隠し妖怪の ID（定義の並び。図鑑の順は data/zukanOrder.ts） */
export const LEGEND_IDS: string[] = ENTRIES.map((e) => e.def.id);
/** 町に置く場所（map.ts の SPAWNS に入る。今夜の候補に入らなければ置かれない） */
export const LEGEND_SPAWNS: SpawnDef[] = ENTRIES.map((e) => ({ type: e.def.id, n: 1, r: 0, ...e.spawn }));
