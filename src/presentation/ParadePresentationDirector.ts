import type { GameBus } from "../game/events";
import { STAGES, type StageDef } from "../data/stages";
import { YOKAI } from "../data/yokaiTypes";
import { RANK_INFO } from "../data/legendConfig";
import { ZukanKnown } from "../game/ZukanRules";
import { toKanji } from "../core/util";
import type { MusicDirector } from "./audio/MusicDirector";
import type { AudioDirector } from "./audio/AudioDirector";
import type { VFXDirector } from "./VFXDirector";
import type { UIDirector } from "./UIDirector";
import type { CameraDirector } from "./CameraDirector";
import type { WorldAtmosphereDirector } from "./WorldAtmosphereDirector";
import type { DistrictFestivalDirector } from "./DistrictFestivalDirector";
import type { KotodamaDirector } from "./KotodamaDirector";
import type { FireworksDirector } from "./FireworksDirector";
import type { EmakiCloudDirector } from "./EmakiCloudDirector";
import type { OnmyojiDirector } from "./OnmyojiDirector";
import { stageIndex } from "../data/stages";
import type { BurstKind } from "./VFXDirector";
import type { OmenKind } from "../data/encounters";
import { DISTRICT_BY_ID } from "../data/districts";
import type { RhythmPhase } from "../game/NightRhythm";

/** 気配の種類 → 世界の中に見える灯り */
const OMEN_VFX: Record<OmenKind, [BurstKind, number] | null> = {
  fue: ["lantern", 6],
  hayashi: ["lantern", 9],
  suzu: ["glint", 4],
  taiko: null,
  warai: ["shadow", 10],
  foxfire: ["foxfire", 8],
  glint: ["glint", 3],
  lantern: ["lantern", 6],
  shadow: ["shadow", 14],
};

/** 夜の波 → 音楽の「間」（1 = 静か：楽器を控えめに、虫・風鈴が聞こえる） */
const LULL: Record<RhythmPhase, number> = { quiet: 1, curiosity: 0.6, cooldown: 0.55, pursuit: 0.2, festival: 0 };

/** 遠くの祭りの環境音の大きさ（夜行位ごと） */
const FAR_FESTIVAL = [0, 0.08, 0.25, 0.5, 0.75];

/** v0.2 以降の演出の子システム */
export interface FestivalPresentation {
  festival: DistrictFestivalDirector;
  kotodama: KotodamaDirector;
  fireworks: FireworksDirector;
  clouds: EmakiCloudDirector;
  onmyoji: OnmyojiDirector;
}

/** 賑わいが上がったときの一言 */
const MOMENTUM_TEXT = ["", "町が、ざわめきはじめた", "町が賑わってきた", "町じゅうが大賑わいだ", "夜が熱狂に包まれた"];

/**
 * ParadePresentationDirector（仕様 25章）
 * ゲームルールと演出を直接結びつけない。百鬼夜行の状態イベントを受け取り、各演出システムへ通知する。
 */
export class ParadePresentationDirector {
  stage: StageDef = STAGES[0];
  /** 今夜仲間になった数 */
  discovered = new Map<string, number>();
  /** 図鑑上で既知の妖怪（ZukanRules.ZukanKnown：仲間にした通常の妖怪と、見つけた隠し妖怪）。既知でない種類が加わったときだけ「初見」 */
  readonly zukanKnown = new ZukanKnown();
  get known() {
    return this.zukanKnown.types;
  }
  private celebrated100 = false;
  /** 聞き手（プレイヤー）の位置：気配の左右・遠近に使う */
  private lx = 0;
  private lz = 0;
  private landmarksSeen = new Set<string>();
  private total = 1;
  private momentumV = 0;
  private kotodamaSeen = 0;
  private festival: DistrictFestivalDirector;
  /** 陰陽師の一言の間引き */
  private noticeCd = 0;
  private casts = 0;
  private barriers = 0;

  constructor(
    bus: GameBus,
    private music: MusicDirector | null,
    private audio: AudioDirector | null,
    private vfx: VFXDirector,
    private ui: UIDirector,
    private camera: CameraDirector,
    private atmos: WorldAtmosphereDirector,
    private fx: FestivalPresentation,
  ) {
    this.festival = fx.festival;
    // 花火：遠くで控えめに鳴り、空がほんのり明るむ
    fx.fireworks.onLaunch = (pan) => this.audio?.fireworkLaunch(pan);
    fx.fireworks.onBurst = (pan, big) => {
      this.audio?.firework(pan, big);
      this.atmos.flash(big ? 0.12 : 0.07);
    };
    bus.on("specialDiscovered", (e) => {
      // 隠し妖怪を見つけた：まず図鑑上の既知に入れる（announce に関係なく。後で加わっても初見にしない）。
      // 知らせは初めてのときだけ静かに：図鑑に記された（announce = false・前の夜から知っている妖怪なら何も出さない）
      if (!this.zukanKnown.discovered(e)) return;
      this.ui.toast(`${YOKAI[e.type]?.name ?? e.type}　新たな妖怪が図鑑に記された`);
      this.audio?.kifuda();
    });
    bus.on("legendJoin", (e) => {
      // 大妖怪・三大妖怪が加わった（見出しと一言は格ごとのデータ）
      if (e.rank === "normal") return;
      const r = RANK_INFO[e.rank];
      this.ui.banner(r.banner, YOKAI[e.type]?.name ?? e.type, r.bannerText);
      this.audio?.stageUp();
      this.fx.clouds.swell(e.rank === "threeGreat" ? 0.8 : 0.6);
      this.vfx.burst("stage", e.x, 1.5, e.z, e.rank === "threeGreat" ? 80 : 60, 0.3);
    });
    bus.on("join", (e) => {
      const n = this.discovered.get(e.type) ?? 0;
      const isNew = this.zukanKnown.joined(e.type);
      this.discovered.set(e.type, n + 1);
      this.ui.joinCard(e.type, isNew);
      this.ui.setCount(e.total, this.stage, true);
      this.audio?.join(e.bonus);
      this.audio?.yokai(YOKAI[e.type].se, 0.8);
      this.vfx.burst(this.stage.joinVfx, e.x, e.y + 0.8, e.z, isNew ? 40 : 22);
      if (isNew) {
        setTimeout(() => this.audio?.discover(), 250);
        setTimeout(() => this.audio?.kifuda(), 900);
      } else setTimeout(() => this.audio?.washi(), 120);
      this.total = e.total;
      this.music?.setCount(e.total);
      if (e.total === 50) this.fx.clouds.swell(0.7);
      if (e.total >= 100 && !this.celebrated100) {
        this.celebrated100 = true;
        // 絵巻開き：雲が少し濃くなり → 左右へ流れて開き → 巨大な百鬼夜行が見える → 「百鬼夜行」 → 花火
        // 主役は妖怪。雲は開いて退くだけ
        this.fx.clouds.openScroll();
        setTimeout(() => {
          this.ui.banner("百 妖 到 達", "百鬼夜行", "百の妖が、夜を練り歩く", true);
          this.audio?.finale();
        }, 1700);
        this.fx.fireworks.show(9, 2.4);
        this.fx.fireworks.ambient = true;
        this.vfx.burst("stage", e.x, 2, e.z, 120);
      }
    });
    bus.on("rejoin", (e) => {
      this.total = e.total;
      this.music?.setCount(e.total);
      this.ui.setCount(e.total, this.stage, false);
    });
    bus.on("stageChange", (e) => {
      this.stage = e.stage;
      this.music?.applyStage(e.stage, e.up ? 3 : 1.5);
      this.music?.setCount(e.total);
      this.camera.applyStage(e.stage);
      this.atmos.applyStage(e.stage);
      this.ui.setTheme(e.stage);
      this.ui.setCount(e.total, e.stage, false);
      if (e.up) {
        this.ui.banner("夜 行 位", e.stage.jp, `${e.stage.label}　─　${toKanji(e.total)}妖の行列`);
        this.audio?.stageUp();
        this.fx.clouds.swell(0.5);
      }
    });
    bus.on("scatter", (e) => {
      this.audio?.scatter();
      if (e.kind === "dog") this.audio?.bark();
      if (e.kind === "watchman") this.audio?.hyoshigiPair();
      this.vfx.burst("scatter", e.x, 1, e.z, 30);
      const who = e.kind === "dog" ? "犬に吠えられて" : e.kind === "monk" ? "お経に驚いて" : "夜回りに見つかって";
      this.ui.toast(`${who}、${toKanji(e.n)}妖が散ってしまった！（すぐ戻ってくる）`);
    });
    bus.on("layerUnlock", (e) => {
      this.ui.banner("世 界 の 層", e.title, e.text);
      this.audio?.discover();
      if (e.id === "yokocho") {
        this.atmos.openGate();
        this.audio?.gate();
      }
    });
    // 行列の数に誘われて、町に何かが姿を見せた（名前も場所も出さない。見つけるのはプレイヤー）
    bus.on("paradeDraw", () => this.ui.toast("行列の賑わいに誘われて、町のどこかで何かが姿を見せた…"));
    bus.on("activityProgress", (e) => this.ui.activity(e.title, e.done, e.total));
    bus.on("activityComplete", (e) => {
      this.ui.activity(e.title, e.id === "plaza" ? 100 : 1, 1);
      this.ui.banner("成 就", e.title.replace(/を.*$/, ""), `${e.title}！ ${YOKAI[e.reward.type].name}が集まってきた`);
      this.audio?.stageUp();
      this.audio?.hyoshigiPair();
    });
    bus.on("activityFail", (e) => this.ui.toast(`${e.title}…途中で列が崩れた。もう一度！`));
    bus.on("dango", (e) => {
      this.ui.setDango(e.n);
    });
    bus.on("threatAlert", (e) => {
      if (e.kind === "dog") this.audio?.bark();
      else if (e.kind === "watchman") this.audio?.hyoshigiPair();
      else this.audio?.cancel();
      const who = e.kind === "dog" ? "犬" : e.kind === "monk" ? "お坊さん" : "夜回り";
      this.ui.toast(`${who}に気づかれた！ 走って逃げよう（Shift）`);
    });
    bus.on("threatYield", (e) => {
      if (Math.random() < 0.5) this.ui.toast(e.kind === "dog" ? "犬「きゃいん」" : "「ひいっ、百鬼夜行だ…道をあけろ」");
    });
    bus.on("reveal", (e) => {
      this.vfx.burst(e.type === "kappa" ? "splash" : "smoke", e.x, e.y + 0.5, e.z, 26);
      if (e.type === "kappa") this.audio?.splash();
      else this.audio?.puff();
      if (e.type === "chochin") this.audio?.yokai("fuwa", 0.8);
    });
    bus.on("riverMeter", (e) => this.ui.setRiver(e.v));
    bus.on("toast", (e) => this.ui.toast(e.text));
    // ---- v0.2：街が百鬼夜行に応える
    bus.on("kotodama", (e) => {
      this.fx.kotodama.launch(e.fromX, e.fromZ, e.toX, e.toZ);
      this.audio?.kotodama(this.pan(e.toX, e.toZ) * 0.6);
      if (this.kotodamaSeen++ < 2) this.ui.toast("言霊がひとつ、妖怪の気配のする方へ泳いでいく…");
    });
    bus.on("momentum", (e) => {
      this.momentumV = e.v;
      this.ui.setMomentum(e.v, e.name, e.up);
      if (e.up && MOMENTUM_TEXT[e.level]) {
        this.ui.toast(MOMENTUM_TEXT[e.level]);
        this.audio?.cheer();
      }
    });
    bus.on("presenceTier", (e) => {
      this.ui.toast(e.text);
      this.audio?.omen("warai", 0, 0.5);
    });
    bus.on("omen", (e) => this.omen(e.kind, e.x, e.y, e.z, e.strength));
    // 潜んでいる妖怪の音（小豆を洗う音）：近いほど大きく。光・印は出さない
    bus.on("murmur", (e) => this.audio?.lurkSound(e.kind, this.pan(e.x, e.z), e.strength * e.strength * 0.9));
    bus.on("guide", (e) => {
      // 狐火が、ぽっ、ぽっ、ぽっと灯る（プレイヤーの近くから遠くへ）
      e.points.forEach((q, i) => {
        this.vfx.burst("foxfire", q.x, 1.8, q.z, 9, i * 0.5);
        setTimeout(() => this.audio?.foxfire(this.pan(q.x, q.z), 0.5), i * 500);
      });
      // ミニマップはクエストマップにしない（波紋は ?debug のときだけ）
      const last = e.points[e.points.length - 1];
      this.ui.mapPing(last.x, last.z);
    });
    bus.on("rumor", (e) => {
      // 噂：遠くの音・光だけ。分かれ道では、二つ目は少し遅れて別の方向から届く
      if (e.delay > 0) setTimeout(() => this.ui.toast(e.text), e.delay * 1000);
      else this.ui.toast(e.text);
    });
    bus.on("rhythm", (e) => this.music?.setLull(LULL[e.phase]));
    bus.on("foxfire", (e) => {
      this.vfx.burst("foxfire", e.x, e.y, e.z, e.last ? 14 : 7);
      this.audio?.foxfire(this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.6);
    });
    bus.on("encounterStart", (e) => {
      // 噂から昇格したときは、気配の一言は既に出ている
      if (!e.promoted) this.ui.toast(e.text);
      this.ui.mapPing(e.x, e.z, "rgba(255,200,120,");
    });
    bus.on("encounterProgress", (e) => {
      if (e.p < 0) this.ui.activity("", -1, 100);
      else this.ui.activity(`${e.label ?? e.title}`, Math.round(e.p * 100), 100);
    });
    bus.on("encounterComplete", (e) => {
      if (e.kind === "miniParade") return;
      this.ui.toast(`「${e.title}」成就！`);
      this.audio?.hyoshigiPair();
      this.vfx.burst(this.stage.joinVfx, e.x, 1.5, e.z, 30);
    });
    bus.on("encounterEnd", (e) => this.ui.toast(e.text));
    bus.on("miniParadeMerge", (e) => {
      this.ui.banner("合 流", "行列と行列", `${toKanji(e.n)}妖の小さな百鬼夜行が、合わさった`);
      // 左右から墨雲がふわっと膨らみ、薄れると新しい大きな百鬼夜行が見える
      this.fx.clouds.swell(0.9);
      this.audio?.merge();
      this.vfx.burst("merge", e.x, 2, e.z, 70);
      this.vfx.burst("stage", this.lx, 1.5, this.lz, 50, 0.6);
    });
    bus.on("landmark", (e) => {
      this.audio?.cheer();
      if (!this.landmarksSeen.has(e.id)) {
        this.landmarksSeen.add(e.id);
        this.ui.toast(`百鬼夜行が${e.name}を練り歩く`);
      }
    });
    bus.on("districtEnter", (e) => {
      if (e.first) this.ui.toast(`― ${e.name} ―`);
    });
    bus.on("districtProgress", (e) => {
      this.ui.activity(`${e.name}を百鬼夜行で練り歩く`, Math.round(e.p * 100), 100);
    });
    bus.on("districtAwaken", (e) => {
      const d = DISTRICT_BY_ID.get(e.id);
      this.ui.banner("祭 り", `${e.name}が目覚めた`, d?.cheer ?? "祭りだ、祭りだ！");
      this.audio?.awaken();
      this.festival.awaken(e.id, e.x, e.z);
      this.fx.clouds.swell(0.6);
      this.vfx.burst("stage", e.x, 1.5, e.z, 60, 0.4);
      setTimeout(() => this.ui.toast("屋根や路地の奥から、妖怪たちがこちらを覗いている…"), 2600);
    });
    // ---- 陰陽師（音は小さく・低く。遠くのものは控えめに）
    bus.on("onmyojiArrive", (e) => {
      if (e.first) return;
      this.audio?.omen("suzu", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.6);
      this.ui.toast(e.present >= 2 ? `神社から陰陽師がもう一人…${toKanji(e.present)}人では、八十妖の百鬼夜行でなければ怯まない` : "神社から陰陽師が出てきた");
    });
    bus.on("onmyojiNotice", (e) => {
      this.audio?.omen("suzu", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.45);
      if (this.noticeCd <= 0) {
        this.noticeCd = 6;
        this.ui.toast("陰陽師「ん…？ 妖の気配が」");
      }
    });
    bus.on("onmyojiCast", (e) => {
      this.audio?.cancel();
      this.audio?.omen("suzu", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.7);
      this.ui.toast(this.casts++ < 2 ? "陰陽師が祓いの呪を唱えはじめた！ 物陰へ隠れるか、見えないところへ" : "陰陽師「臨・兵・闘・者…」");
    });
    bus.on("onmyojiMiss", () => this.ui.toast("陰陽師「…気のせいか」"));
    bus.on("onmyojiPurge", (e) => {
      this.audio?.scatter();
      this.audio?.hyoshigiPair();
      this.vfx.burst("washi", e.x, 1.6, e.z, 24);
      e.pts.slice(0, 8).forEach((q, i) => this.vfx.burst("smoke", q.x, 0.8, q.z, 14, 0.05 + i * 0.06));
      if (e.n > 0) this.ui.toast(`${e.barrier ? "結界に触れて" : "陰陽師に見つかって"}、${toKanji(e.n)}妖が祓われ、町のどこかへ散ってしまった…（触れれば戻る）`);
      else this.ui.toast("陰陽師「…大妖怪は祓えぬか」");
    });
    bus.on("onmyojiBarrier", (e) => {
      this.fx.onmyoji.barrier(e.phase, e.x, e.z, e.r);
      if (e.phase === "form") {
        this.audio?.omen("suzu", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.6);
        if (this.barriers++ < 2) this.ui.toast("陰陽師たちが参道に並び、合体魔法陣を張ろうとしている…");
      } else if (e.phase === "on") {
        this.audio?.omen("taiko", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.5);
      }
    });
    bus.on("onmyojiRout", (e) => {
      this.ui.banner("退 散", "陰陽師が逃げていく", e.n >= 2 ? "百鬼夜行の前に、陰陽師たちが道をあけた" : "百鬼夜行の前に、陰陽師が道をあけた");
      this.audio?.stageUp();
      this.audio?.cheer();
      this.fx.clouds.swell(0.6);
      this.vfx.burst("stage", e.x, 1.5, e.z, 50, 0.2);
    });
    // ---- 百鬼夜行を追いかける子供・犬（控えめに：初めの一度だけ一言）
    bus.on("tagalong", (e) => {
      if (e.first) this.ui.toast("子供や犬が、はしゃぎながら百鬼夜行を追いかけてくる");
      if (e.kind === "kid") this.audio?.omen("warai", this.pan(e.x, e.z), this.falloff(e.x, e.z) * 0.22);
    });
    bus.on("ending", () => {
      this.fx.onmyoji.clear();
      // 夜の締め：太鼓・笛の最後の一節 → 楽器が静まり、虫と風鈴の余韻へ
      this.audio?.closing();
      setTimeout(() => this.music?.rest(3), 2900);
      this.fx.clouds.swell(0.8);
      if (this.total >= 100) this.fx.fireworks.show(4, 3);
    });
  }

  /** 毎フレーム（Game から）：言霊・花火・遠くの祭りの環境音 */
  update(dt: number, t: number) {
    this.fx.kotodama.update(dt, t);
    if (this.noticeCd > 0) this.noticeCd -= dt;
    this.fx.fireworks.update(dt);
    // 百鬼夜行が育つほど、遠くの祭囃子とざわめきが近づいてくる（夜明けには静まる）
    let lvl = FAR_FESTIVAL[stageIndex(this.stage.stage)] * (0.6 + 0.4 * (this.momentumV / 100));
    if (this.total >= 100) lvl = Math.min(1, lvl + 0.15);
    this.audio?.farFestivalTick(dt, lvl * (1 - this.atmos.dawn));
  }

  /** 聞き手の位置（毎フレーム Game から） */
  setListener(x: number, z: number) {
    this.lx = x;
    this.lz = z;
  }

  /** 画面の左右（-1..1）。カメラの右方向への射影 */
  private pan(x: number, z: number) {
    const a = this.camera.cam.alpha;
    const fx = -Math.cos(a), fz = -Math.sin(a);
    const dx = x - this.lx, dz = z - this.lz;
    const d = Math.hypot(dx, dz) || 1;
    return ((dx * fz - dz * fx) / d) * 0.85;
  }

  /** 距離による減衰 */
  private falloff(x: number, z: number) {
    const d = Math.hypot(x - this.lx, z - this.lz);
    return Math.max(0.12, Math.min(1, 1 - (d - 15) / 150));
  }

  /** 世界の中の気配：遠くの音と、そこにだけ見える灯り */
  private omen(kind: OmenKind, x: number, y: number, z: number, strength: number) {
    const vfx = OMEN_VFX[kind];
    if (vfx) {
      const [k, n] = vfx;
      if (kind === "glint") {
        // 二つの目
        this.vfx.burst("glint", x - 0.18, y, z, n);
        this.vfx.burst("glint", x + 0.18, y, z, n, 0.02);
      } else this.vfx.burst(k, x, y, z, Math.round(n * (0.6 + strength * 0.6)));
    }
    // 弱い気配（提灯の揺れ等）は近くでだけ、控えめに鳴る
    const d = Math.hypot(x - this.lx, z - this.lz);
    if (strength >= 0.5 || d < 35) this.audio?.omen(kind, this.pan(x, z), this.falloff(x, z) * strength * (strength < 0.5 ? 0.5 : 1));
    if (strength >= 0.7 && d > 30) this.ui.mapPing(x, z);
  }
}
