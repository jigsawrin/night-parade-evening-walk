import { pick } from "../core/util";
import { YOKAI, YOKAI_ORDER, isActiveYokai } from "../data/yokaiTypes";
import type { Game } from "./Game";
import { isSpecialYokai, isUniquePerNight } from "./legends/LegendRules";
import { drawOnsenGuests } from "./onsen/OnsenGuestRoster";
import { joinedTypes, zukanCompletion } from "./ZukanRules";
import { evaluateSpecialUnlocks, onsenFirstDiscoveries } from "./legends/LegendProgress";
import { spawnTotal } from "./normal/NormalSpawnPlanner";

/**
 * ?debug のときだけ使う道具：キー操作と画面上部のデバッグ表示。
 *  J 妖怪を呼ぶ／O 陰陽師をすべて呼ぶ／T 時間／K 賑わい／N Encounter／G 狐火／L 言霊／H 花火
 * ゲームの本筋（Game.update）にデバッグの分岐を散らさないために分けている。
 */
export class DebugTools {
  private t = 0;

  constructor(private game: Game) {}

  /** 夜の間だけ呼ぶ */
  keys(t: number) {
    const g = this.game;
    const inp = g.input;
    // 今夜の wave までに町へ混ざる通常妖怪から（まだ混ざらない妖怪・一夜一体の妖怪は呼ばない）
    if (inp.hit("KeyJ")) g.wild.spawnBonus(pick(YOKAI_ORDER.filter((id) => isActiveYokai(YOKAI[id]) && !isSpecialYokai(YOKAI[id]) && !isUniquePerNight(YOKAI[id]) && (YOKAI[id].normalWave ?? 0) <= g.normal.wave)), 5);
    if (inp.hit("KeyO")) g.onmyoji.debugArrive();
    if (inp.hit("KeyT")) g.clock.elapsed += 60;
    if (inp.hit("KeyK")) g.festival.momentum.add(15, t, "debug");
    if (inp.hit("KeyN")) g.festival.debugDeal();
    if (inp.hit("KeyG")) g.festival.debugGuide();
    if (inp.hit("KeyL")) g.festival.debugKotodama();
    if (inp.hit("KeyH")) g.fireworks.show(3);
  }

  /** 画面上部の表示（0.25 秒ごと） */
  overlay(dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const g = this.game;
    g.ui.debug([
      `妖 ${g.parade.total}　夜行位 ${g.stage.jp}　刻 ${g.clock.koku}　追いかける子・犬 ${g.tagalongs.following}`,
      ...g.festival.debugLines(g.seed.seed),
      g.onmyoji.debug(),
      ...g.legends.debugLines(),
      this.normalLine(),
      this.onsenLine(),
    ]);
  }

  /** 後から町へ混ざる通常妖怪：今の wave・歩いた夜の数・今夜の新しい顔ぶれ（種類 × 数）・町に置いた数 */
  private normalLine() {
    const n = this.game.normal;
    const r = n.roster;
    const faces = r.types.map((t) => `${YOKAI[t].name}${r.counts[t]}${r.fresh.includes(t) ? "*" : ""}`).join("・") || "-";
    return `通常 wave ${n.wave}（夜 ${n.progress.completedNights}）　今夜の新顔 ${faces}　町の通常妖怪 ${spawnTotal(n.plan)}（新 ${n.plan.added}・減 ${n.plan.removed}${n.plan.river.length ? `・川 ${n.plan.river.length}` : ""}）`;
  }

  /** 温泉宿の宿泊客（試し。この seed で訪れたら誰が泊まっているか） */
  private onsenLine() {
    const g = this.game;
    const p = g.legends.progress;
    const zc = zukanCompletion(g.zukan, { met: p.met, normalWave: g.normal.wave });
    const forced = onsenFirstDiscoveries({ progress: p, normalZukanComplete: zc.allNormalContentComplete, unlocks: evaluateSpecialUnlocks(p) });
    const r = drawOnsenGuests({ registered: joinedTypes(g.zukan), legendProgress: p, seed: g.seed.seed, forcedGuests: forced });
    const nm = (l: string[]) => l.map((id) => YOKAI[id]?.name ?? id).join("・") || "-";
    return `図鑑 ${zc.seen}/${zc.total}（通常 ${zc.normalSeen}/${zc.normalTotal}${zc.normalComplete ? " 完成" : ""}${zc.allNormalContentComplete ? "・知り尽くした" : ""}・秘 ${zc.hiddenFound}）　温泉宿の客（試し） 通常 ${r.normal.length}種　大妖怪 ${nm(r.greater)}　三大 ${nm(r.threeGreat)}　秘 ${nm(r.hidden)}　必ず ${forced.join("・") || "-"}`;
  }
}
