import { Actor } from "../characters/Actor";
import type { ModelFactory } from "../characters/ModelFactory";
import { SPAWNS, DARK_LANTERNS, type SpawnDef } from "../data/map";
import { AWAKEN_SPAWNS, PRESENCE_SPAWNS } from "../data/presences";
import { makeRng, type Rng } from "../core/seed";
import { YOKAI, type JoinRule } from "../data/yokaiTypes";
import type { World } from "../world/World";
import type { Parade } from "./Parade";
import type { Player } from "./Player";
import type { GameBus } from "./events";
import { rand } from "../core/util";
import { applyJoinRule, hintFor, type JoinRuleHost } from "./WildJoinRules";
import { WildArrivals } from "./WildArrivals";
import { forEachGuidable, forEachShown, nearestGuidable, wanderNearHome } from "./WildIdle";
import { talkLine } from "./WildCompanionRules";
import { WildTrails } from "./WildTrails";
import { ParadeAppearHold, appearCount } from "./ParadeAppearRules";
import type { NormalSpawnPlan } from "./normal/NormalSpawnPlanner";
import { SpawnGate, describeLegendRule, emptyLegendContext, isHidden, isSpecialYokai, isUniquePerNight, revealAllowed, type LegendContext, type RevealRoute } from "./legends/LegendRules";

/** 大妖怪・三大妖怪・隠し妖怪まわりで WildYokai が使うもの（LegendSystem） */
export interface LegendHost {
  readonly context: LegendContext;
  appearsTonight(type: string): boolean;
  /** 前の夜までに見つけた隠し妖怪か（縁帳の met） */
  discovered?(type: string): boolean;
}

export type Rule = JoinRule | { kind: "leap" };
type State = "hidden" | "idle" | "wander" | "flee" | "hop" | "dormant" | "emerge" | "descend";

export interface Wild {
  type: string;
  rule: Rule;
  /** 気配の段階（presences.ts）で姿を見せる */
  presence?: string;
  /** 地区覚醒で姿を見せる */
  district?: string;
  actor: Actor | null;
  dormant?: Actor;
  homeX: number;
  homeZ: number;
  r: number;
  perchY: number;
  layer?: string;
  appearAt?: number;
  state: State;
  tx: number;
  tz: number;
  timer: number;
  hops: number;
  fleeT: number;
  bubbleCd: number;
  /** 陰陽師に祓われて町へ散った仲間（触れると戻る。加入ではなく復帰として数える） */
  returning?: boolean;
  /** 大妖怪：今夜もう会った（求めを聞いた） */
  met?: boolean;
  /** 加入条件の進み（立ち止まった秒・一緒に歩いた歩数など：WildCompanionRules） */
  rt: number;
  /** 寄ってくる・ついてくる途中（WildCompanionRules） */
  follow?: boolean;
  /** 潜んでいる（案内に出さない。still：そばで立ち止まると姿を見せる／trail：糸を辿ると／rule：加入条件の中で自分で現れる） */
  lurk?: boolean;
  lurkBy?: "still" | "trail" | "rule";
  /** 姿の段（gaze：別の姿から本当の姿へ） */
  stage?: number;
  /** 置いたときの向き */
  yaw?: number;
  /** 姿を見せたとき、近ければ一言（talk.appear） */
  announce?: boolean;
  /** 地区覚醒・行列の遊びの数がそろうと姿を見せる */
  after?: { districts?: number; activities?: number };
  /** 行列がこの数に届くまで姿を見せない（ParadeAppearRules。預けたら held） */
  need?: number;
  held?: boolean;
}

export interface HintInfo {
  actor: Actor;
  type: string;
  text: string;
  need: boolean;
}

/** 町にいる野良妖怪と、その加入条件（仕様 7章） */
export class WildYokai {
  list: Wild[] = [];
  /** 河童（川辺）・一反木綿（空）の現れ方 */
  private arrivals: WildArrivals;
  private pending: { type: string; x: number; z: number; delay: number; bonus: boolean }[] = [];
  /** ゲームプレイに効く位置の乱数（出現位置・舞い降りる場所・跳ねる先）。?seed= で再現する */
  private pos: Rng;
  /** 加入条件の判定（WildJoinRules）へ渡す部品 */
  private host: JoinRuleHost;
  /** 特別な妖怪（大妖怪以上・隠し）を出す窓口の約束：今夜の候補だけ・一夜一体・汎用の窓口からは出さない */
  private gate: SpawnGate;
  /** 細い蜘蛛の糸の道（絡新婦） */
  private trails: WildTrails;
  /** 地区覚醒・行列の遊びを成し遂げた数（after の妖怪が姿を見せる） */
  private tally = { districts: 0, activities: 0 };
  /** 行列の数に誘われて姿を見せる妖怪（数が届くまで預かる。低頻度で見る） */
  private appear = new ParadeAppearHold<Wild>();
  /** 祓われた妖怪を置き直す先（町の野良妖怪の住処） */
  private homes = SPAWNS.filter((s) => !s.layer && s.appearAt === undefined && !s.presence && !s.district && !isSpecialYokai(YOKAI[s.type]));

  constructor(
    private factory: ModelFactory,
    private world: World,
    private bus: GameBus,
    private parade: Parade,
    private player: Player,
    rng?: Rng,
    posRng?: Rng,
    /** 今夜の大妖怪・隠し妖怪（無ければ、候補の抽選をせずすべて置く） */
    private legends: LegendHost = { context: emptyLegendContext(), appearsTonight: () => true },
    /** 今夜の通常妖怪の配置（後から混ざる通常妖怪を混ぜた SPAWNS・気配・地区覚醒。無ければ今までどおり） */
    plan?: NormalSpawnPlan,
  ) {
    this.pos = posRng ?? makeRng((Math.random() * 4294967296) >>> 0);
    this.gate = new SpawnGate((type) => this.legends.appearsTonight(type));
    this.host = {
      bus, world, player, parade, pos: this.pos,
      legendContext: () => this.legends.context,
      join: (w) => this.join(w),
      say: (w) => this.say(w),
      reshape: (w, look) => this.reshape(w, look),
      unveil: (w) => this.unveil(w),
    };
    this.trails = new WildTrails(factory, world, player);
    for (const s of plan?.town ?? SPAWNS) this.addSpawn(s);
    // v0.2：気配として現れる妖怪・地区覚醒で現れる妖怪（今夜いるかどうかは seed で決まる）
    for (const s of plan?.extra ?? [...PRESENCE_SPAWNS, ...AWAKEN_SPAWNS]) {
      if (s.chance !== undefined && rng && !rng.chance(s.chance)) continue;
      this.addSpawn(s);
    }
    for (const [x, z] of DARK_LANTERNS) {
      const w = this.make("chochin", x, z, 0, { kind: "lantern" });
      w.state = "dormant";
      w.dormant = new Actor(factory, "chochin", "lantern_off");
      w.dormant.family = "SPECIAL";
      w.dormant.setPos(x, 1.2, z);
      w.dormant.groundY = 0;
      w.dormant.shadow.setEnabled(false);
      this.list.push(w);
    }
    this.arrivals = new WildArrivals({
      bus, world, player, pos: this.pos,
      ready: (type) => appearCount(YOKAI[type]) <= parade.total,
      place: (type, x, z, rule, perchY = 0) => {
        const w = this.make(type, x, z, 0, rule, perchY);
        this.reveal(w);
        this.list.push(w);
        return w;
      },
    }, plan?.river);
    bus.on("activityComplete", () => {
      this.tally.activities++;
      this.revealAfter();
    });
  }

  private make(type: string, x: number, z: number, r: number, rule: Rule, perchY = 0): Wild {
    return {
      type, rule, actor: null, homeX: x, homeZ: z, r, perchY, state: "hidden",
      tx: x, tz: z, timer: rand(0, 3), hops: rule.kind === "shy" || rule.kind === "disguise" ? rule.hops : 0, fleeT: 0, bubbleCd: 0, rt: 0,
    };
  }

  private addSpawn(s: SpawnDef) {
    const def = YOKAI[s.type];
    const special = isSpecialYokai(def);
    const unique = isUniquePerNight(def);
    for (let i = 0; i < s.n; i++) {
      // 特別な妖怪・一夜一体の妖怪は窓口（SpawnGate）を通す：（特別な妖怪は）今夜の候補に入っていなければ置かない。一夜一体なら二体目は置かない
      if ((special || unique) && !this.gate.claim(s.type)) return;
      const a = (i / s.n) * Math.PI * 2 + this.pos.range(0, 1);
      const rr = s.r * Math.sqrt(this.pos.next());
      let x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr;
      if ((s.presence || s.district || unique || s.snap) && !this.world.isWalkable(x, z, 0.5)) ({ x, z } = this.world.nearestWalkable(x, z));
      let rule: Rule = def.rule;
      if (s.layer && !s.keepRule) rule = s.y ? { kind: "leap" } : { kind: "touch" };
      let perchY = 0;
      if (s.y) {
        const roof = this.world.roofHeightAt(x, z);
        perchY = s.layer === "rooftops" ? (roof || 0) : s.roof ? roof || s.y : s.y;
        if (s.layer === "rooftops" && !roof) rule = { kind: "touch" };
      }
      const w = this.make(s.type, x, z, s.r, rule, perchY);
      w.layer = s.layer;
      w.appearAt = s.appearAt;
      w.presence = s.presence;
      w.district = s.district;
      w.after = s.after;
      w.yaw = s.yaw;
      w.need = appearCount(def) || undefined;
      // 潜み方：糸の道・加入条件（落ちてくる・姿を変える）・立ち止まる
      const own = rule.kind === "drop" || rule.kind === "gaze";
      w.lurk = !!(s.lurk || s.trail || own);
      w.lurkBy = s.trail ? "trail" : own ? "rule" : "still";
      if (s.trail) this.trails.add(s.trail, () => this.unveil(w));
      w.announce = !w.lurk && rule.kind !== "disguise" && !!def.talk?.appear;
      if (!s.layer && s.appearAt === undefined && !s.presence && !s.district && !s.after && !isHidden(def)) this.reveal(w, false);
      this.list.push(w);
    }
  }

  /**
   * 姿を見せる。隠し妖怪は revealHidden（route "hidden"）からでなければ見せない（false）：
   * 初期配置・気配の段階・地区覚醒・世界の層・夜の進み（appearAt）・提灯など、通常の経路はすべてここを通る。
   * 通常の経路は入口でも隠し妖怪を外している（待ち行列 pending にも積まない）。ここは最後の守り
   */
  private reveal(w: Wild, fx = true, route: RevealRoute = "generic"): boolean {
    if (!revealAllowed(YOKAI[w.type], route)) return false;
    // 行列の数がまだ届かない：預かって、届いたら姿を見せる（update）
    if (this.appear.defer(w, this.parade.total)) return false;
    // 化けている妖怪は化けた姿で（正体は reshape で現す）、姿を変える妖怪（gaze）は最初の姿で置く
    const r = w.rule;
    const a = r.kind === "disguise" ? new Actor(this.factory, r.as) : new Actor(this.factory, w.type, r.kind === "gaze" ? r.looks[0] : w.type);
    const gy = w.perchY || this.world.groundHeight(w.homeX, w.homeZ);
    a.setPos(w.homeX, gy, w.homeZ);
    a.groundY = gy;
    a.yaw = w.yaw ?? rand(-Math.PI, Math.PI);
    w.actor = a;
    w.state = "idle";
    a.animate(0.016, 0);
    // 潜んでいる妖怪は、置いても姿を見せない（姿を変える妖怪は、別の姿のまま見せる）
    if (w.lurk) {
      if (r.kind !== "gaze") a.setVisible(false);
      return true;
    }
    if (fx) {
      a.pop();
      this.bus.emit("reveal", { type: w.type, x: a.x, y: a.y, z: a.z });
      if (w.announce) this.announce(w);
    }
    return true;
  }

  /** 姿を見せたときの一言（近いときだけ。一度だけ） */
  private announce(w: Wild) {
    w.announce = false;
    if (Math.hypot(w.homeX - this.player.x, w.homeZ - this.player.z) > 40) return;
    const line = talkLine(w.type, "appear");
    if (line) this.bus.emit("toast", { text: line });
  }

  activateLayer(id: string) {
    if (id === "sky") this.arrivals.openSky();
    let k = 0;
    for (const w of this.list) {
      if (w.layer === id && w.state === "hidden" && !isHidden(YOKAI[w.type])) {
        this.pending.push({ type: "", x: 0, z: 0, delay: k * 0.08, bonus: false });
        (this.pending[this.pending.length - 1] as any).wild = w;
        k++;
      }
    }
  }

  /** 報酬の妖怪：プレイヤーの周りに現れて、すぐ行列へ（一夜に一体までの妖怪は報酬にしない） */
  spawnBonus(type: string, n: number) {
    if (!this.gate.allowsGeneric(type)) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.pending.push({ type, x: this.player.x + Math.cos(a) * 5, z: this.player.z + Math.sin(a) * 5, delay: 0.3 + i * 0.35, bonus: true });
    }
  }

  /**
   * 気配の段階が開いていて、百鬼夜行に「気付く」範囲にいる隠れた妖怪が姿を見せる（加入はしない）。
   * ParadeAttractionSystem から低頻度で呼ばれる。
   */
  revealPresences(tiers: ReadonlySet<string>, px: number, pz: number, radius: number) {
    const out: Wild[] = [];
    for (const w of this.list) {
      if (w.state !== "hidden" || !w.presence || !tiers.has(w.presence) || isHidden(YOKAI[w.type])) continue;
      if (Math.hypot(w.homeX - px, w.homeZ - pz) > radius) continue;
      if (this.reveal(w)) out.push(w);
    }
    return out;
  }

  /** 地区覚醒：屋根・路地・店の裏から妖怪が姿を見せる（加入はしない） */
  revealDistrict(id: string) {
    this.tally.districts++;
    this.revealAfter();
    let k = 0;
    for (const w of this.list) {
      if (w.state !== "hidden" || w.district !== id || isHidden(YOKAI[w.type])) continue;
      this.pending.push({ type: "", x: 0, z: 0, delay: 1.2 + k * 0.35, bonus: false });
      (this.pending[this.pending.length - 1] as any).wild = w;
      k++;
    }
    return k;
  }

  /** 地区覚醒・行列の遊びの数がそろった妖怪が姿を見せる（加入はしない。近ければ一言） */
  private revealAfter() {
    for (const w of this.list) {
      if (w.state !== "hidden" || !w.after || isHidden(YOKAI[w.type])) continue;
      if ((w.after.districts ?? 0) > this.tally.districts || (w.after.activities ?? 0) > this.tally.activities) continue;
      w.after = undefined;
      this.reveal(w);
    }
  }

  /** 姿を替える（化けていた・別の姿の妖怪。look が無ければ本来の姿に戻し、姿を見せた合図を出す）。Actor を作り直す */
  private reshape(w: Wild, look?: string) {
    const old = w.actor;
    if (!old) return;
    const a = new Actor(this.factory, w.type, look ?? w.type);
    a.setPos(old.x, old.y, old.z);
    a.groundY = old.groundY;
    a.yaw = old.yaw;
    old.dispose();
    w.actor = a;
    a.pop();
    if (!look) this.bus.emit("reveal", { type: w.type, x: a.x, y: a.y, z: a.z });
  }

  /** 潜んでいた妖怪が姿を見せる（そばで立ち止まった・糸を辿り終えた） */
  private unveil(w: Wild) {
    const a = w.actor;
    if (!a || !w.lurk) return;
    w.lurk = false;
    a.setVisible(true);
    a.pop();
    this.bus.emit("reveal", { type: w.type, x: a.x, y: a.y, z: a.z });
    const line = talkLine(w.type, "appear");
    if (line) this.bus.emit("toast", { text: line });
  }

  /**
   * Encounter が置く野良妖怪（加入条件つき。プレイヤーが条件を満たして初めて加わる）。
   * 大妖怪以上・隠し妖怪はここからは出せない（null）。出すなら spawnSpecial（今夜の候補・一夜一体を守る窓口）
   */
  spawnWild(type: string, x: number, z: number, rule: Rule, r = 0, fx = true): Wild | null {
    if (!this.gate.allowsGeneric(type)) {
      console.warn(`[百鬼夜行] ${type} は spawnWild では出せない（spawnSpecial を使う）`);
      return null;
    }
    if (!this.world.isWalkable(x, z, 0.5)) ({ x, z } = this.world.nearestWalkable(x, z));
    const w = this.make(type, x, z, r, rule);
    this.reveal(w, fx);
    this.list.push(w);
    return w;
  }

  /**
   * 陰陽師に祓われた仲間を、町のどこか（野良妖怪の住処）へ置き直す。Actor はそのまま使い回す。
   * 主人公と神社からは離れた場所を選ぶ。触れると行列へ戻る。
   */
  rehome(a: Actor, avoidX: number, avoidZ: number) {
    const px = this.player.x, pz = this.player.z;
    let home = this.pos.pick(this.homes);
    for (let k = 0; k < 8; k++) {
      if (Math.hypot(home.x - px, home.z - pz) > 45 && Math.hypot(home.x - avoidX, home.z - avoidZ) > 60) break;
      home = this.pos.pick(this.homes);
    }
    const ang = this.pos.range(0, Math.PI * 2);
    const rr = home.r + this.pos.range(1, 4);
    const q = this.world.nearestWalkable(home.x + Math.cos(ang) * rr, home.z + Math.sin(ang) * rr, 0.5);
    const w = this.make(a.typeId, q.x, q.z, 3, { kind: "touch" });
    w.returning = true;
    w.actor = a;
    w.state = "idle";
    a.setPos(q.x, this.world.groundHeight(q.x, q.z), q.z);
    a.groundY = a.y;
    a.lift = 0;
    a.pop();
    this.list.push(w);
    return w;
  }

  /** まだ加入していないか */
  alive(w: Wild) {
    return this.list.includes(w);
  }

  /**
   * 特別な妖怪（大妖怪・三大妖怪・隠し妖怪）を夜の途中に町へ出す窓口（初期配置と同じ約束：今夜の候補に入っていて、一夜一体ならまだ出していないとき）。
   * 加入条件はデータの rule（大妖怪は legend、隠しの通常妖怪は touch・food など）。出せなければ null。
   * 隠し妖怪は置くだけで姿を見せない（見せるのは revealHidden）
   */
  spawnSpecial(type: string, x: number, z: number): Wild | null {
    const def = YOKAI[type];
    if (!isSpecialYokai(def) || !this.gate.claim(type)) return null;
    if (!this.world.isWalkable(x, z, 0.5)) ({ x, z } = this.world.nearestWalkable(x, z));
    const w = this.make(type, x, z, 0, def.rule);
    this.reveal(w);
    this.list.push(w);
    return w;
  }

  /**
   * 隠し妖怪を姿を見せるただ一つの経路（将来、その妖怪専用の発見の仕組み・温泉宿から呼ぶ）。
   * 町に置かれて隠れている（state = hidden）その種類を見せる。姿を見せたら発見は必ず確定する：
   * 今夜はじめてなら specialDiscovered を流す（縁帳の met にすぐ残り、図鑑に登録される）。
   * announce は演出だけを決める（false なら知らせ・見出しを出さない。発見の記録は変わらない）
   */
  revealHidden(type: string, source: string, announce = true): Wild | null {
    const def = YOKAI[type];
    if (!isHidden(def)) return null;
    const w = this.list.find((q) => q.type === type && q.state === "hidden");
    if (!w || !this.reveal(w, announce, "hidden")) return null;
    if (this.gate.discover(type)) {
      const a = w.actor!;
      this.bus.emit("specialDiscovered", {
        type, rank: def.rank, discovery: def.discovery, x: a.x, z: a.z, source, announce, known: !!this.legends.discovered?.(type),
      });
    }
    return w;
  }

  /** 町に置かれて隠れている隠し妖怪の場所（無ければ null。気づく判定は LegendSystem） */
  hiddenAt(type: string): { x: number; z: number } | null {
    const w = this.list.find((q) => q.type === type && q.state === "hidden" && isHidden(YOKAI[q.type]));
    return w ? { x: w.homeX, z: w.homeZ } : null;
  }

  /** Encounter の妖怪（Mini Parade の一員など）をそのまま行列へ迎える（特別な妖怪は迎えない：Actor を片付ける） */
  adopt(a: Actor, type: string, bonus = true) {
    if (!this.gate.allowsGeneric(type)) {
      a.dispose();
      return;
    }
    this.parade.add(a);
    this.bus.emit("join", { type, total: this.parade.total, first: false, x: a.x, y: a.y, z: a.z, bonus });
  }

  /** 見えている未加入の妖怪（気配・Pacing の探索候補） */
  forEachContent(fn: (x: number, z: number, w: Wild) => void) {
    forEachShown(this.list, fn);
  }

  private join(w: Wild, bonus = false) {
    const a = w.actor!;
    const idx = this.list.indexOf(w);
    if (idx >= 0) this.list.splice(idx, 1);
    this.parade.add(a);
    if (w.returning) {
      // 祓われた仲間が戻ってきた（加入ではない：図鑑・記録は増やさない）
      this.bus.emit("rejoin", { type: w.type, total: this.parade.total });
      this.bus.emit("toast", { text: `祓われていた${YOKAI[w.type].name}が、行列に戻ってきた` });
      return;
    }
    this.bus.emit("join", { type: w.type, total: this.parade.total, first: false, x: a.x, y: a.y, z: a.z, bonus });
    const def = YOKAI[w.type];
    if (isSpecialYokai(def)) {
      const conditions = def.rule.kind === "legend" ? describeLegendRule(def.rule) : [];
      this.bus.emit("legendJoin", { type: w.type, rank: def.rank, discovery: def.discovery, total: this.parade.total, x: a.x, z: a.z, conditions });
    }
  }

  private say(w: Wild) {
    if (w.bubbleCd > 0) return;
    w.bubbleCd = 3;
    w.actor?.surprise();
  }

  update(dt: number, t: number, night: number) {
    const px = this.player.x, pz = this.player.z;

    // 遅延出現
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay > 0) continue;
      this.pending.splice(i, 1);
      const w = (p as any).wild as Wild | undefined;
      if (w) this.reveal(w);
      else {
        const nw = this.make(p.type, p.x, p.z, 0, { kind: "touch" });
        this.reveal(nw);
        this.list.push(nw);
        this.join(nw, p.bonus);
      }
    }

    const drawn = this.appear.tick(dt, this.parade.total, (w) => w.state === "hidden" && this.reveal(w));
    if (drawn) this.bus.emit("paradeDraw", { n: drawn, total: this.parade.total });
    this.arrivals.update(dt);
    this.trails.update(dt, t);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.bubbleCd > 0) w.bubbleCd -= dt;

      if (w.state === "hidden") {
        if (w.appearAt !== undefined && night >= w.appearAt && !isHidden(YOKAI[w.type]) && !w.held) this.reveal(w);
        continue;
      }
      if (w.state === "dormant") {
        const d = w.dormant!;
        d.mesh.rotation.z = Math.sin(t * 1.5 + d.seed) * 0.06;
        d.mesh.position.set(d.x, d.y, d.z);
        if (Math.hypot(d.x - px, d.z - pz) < 3.6) {
          // ふわっと灯る
          d.dispose();
          w.dormant = undefined;
          this.reveal(w);
          w.actor!.y = 1.2;
          w.state = "emerge";
          w.timer = 0.6;
        }
        continue;
      }
      const a = w.actor!;
      const dx = px - a.x, dz = pz - a.z;
      const dist = Math.hypot(dx, dz);
      // 遠くのものは動かさない（軽量化）
      if (dist > 110 && w.state !== "descend") {
        continue;
      }

      switch (w.state) {
        case "emerge":
          w.timer -= dt;
          a.speed = 0;
          if (w.timer <= 0) {
            this.join(w);
            continue;
          }
          break;
        case "descend": {
          const tx = w.tx, tz = w.tz;
          const k = 1 - Math.exp(-1.2 * dt);
          a.x += (tx - a.x) * k;
          a.z += (tz - a.z) * k;
          a.y += (0 - a.y) * k * 0.8;
          a.face(tx - a.x, tz - a.z, dt, 4);
          a.speed = 2;
          if (a.y < 0.6) {
            // 舞い降りた：触れると加わる
            a.y = 0;
            w.state = "idle";
            w.rule = { kind: "touch" };
            w.perchY = 0;
            w.homeX = a.x;
            w.homeZ = a.z;
            w.r = 3;
          }
          break;
        }
        case "hop": {
          w.timer -= dt;
          const p = { x: a.x + (w.tx - a.x) * Math.min(1, dt * 6), z: a.z + (w.tz - a.z) * Math.min(1, dt * 6) };
          this.world.resolve(p, 0.4);
          a.face(p.x - a.x, p.z - a.z, dt, 14);
          a.speed = 6;
          a.x = p.x;
          a.z = p.z;
          a.lift = Math.sin(Math.max(0, w.timer) / 0.5 * Math.PI) * 0.8;
          if (w.timer <= 0) {
            a.lift = 0;
            w.state = "idle";
            w.timer = 1.5;
          }
          break;
        }
        default:
          if (this.rule(w, a, dist, dx, dz, dt)) continue;
      }
      if (w.state === "descend") a.groundY = 0;
      else {
        const perched = w.rule.kind === "leap" || w.rule.kind === "perch" || w.rule.kind === "drop";
        a.y = w.perchY && perched ? w.perchY : this.world.groundHeight(a.x, a.z);
        a.groundY = a.y;
      }
      a.animate(dt, t);
    }
  }

  /** 加入条件の判定（WildJoinRules）。true を返すと加入済み */
  private rule(w: Wild, a: Actor, dist: number, dx: number, dz: number, dt: number): boolean {
    const r = applyJoinRule(this.host, w, a, dist, dx, dz, dt);
    if (r === "wander") wanderNearHome(this.world, w, a, dt);
    return r === "joined";
  }

  /** いちばん近い「気になる存在」（ヒント表示用。隠し妖怪・潜んでいる妖怪は教えない） */
  hint(discovered: Set<string>): HintInfo | null {
    const best = nearestGuidable(this.list, this.player.x, this.player.z);
    return best ? hintFor(this.host, best, discovered) : null;
  }

  /** ミニマップ・「！」用（隠し妖怪・潜んでいる妖怪は教えない） */
  forEachVisible(fn: (x: number, z: number, type: string) => void) {
    forEachGuidable(this.list, fn);
  }
}
