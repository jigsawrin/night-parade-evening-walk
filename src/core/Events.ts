/** 型付きの小さなイベントバス。ゲームルールと演出をつなぐ唯一の経路。 */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(p: any) => void>>();
  on<K extends keyof E>(k: K, fn: (p: E[K]) => void) {
    if (!this.map.has(k)) this.map.set(k, new Set());
    this.map.get(k)!.add(fn);
    return () => this.map.get(k)!.delete(fn);
  }
  emit<K extends keyof E>(k: K, p: E[K]) {
    this.map.get(k)?.forEach((fn) => fn(p));
  }
}
