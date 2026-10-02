/**
 * Encounter が持っている一時リソース（小道具のメッシュ・一時コライダー・まだ行列に入っていない Actor…）。
 * Encounter は complete / expired のどちらでも dispose() される。
 * 行列へ移譲した Actor のように「所有権を手放したもの」は release() で外しておけば、dispose() で消されない。
 * ※ node --test から直接読み込むため、Babylon・DOM を実行時に読まない純粋ロジック。
 */
export class OwnedResources {
  private items = new Map<object, () => void>();
  private disposed = false;

  /** key（メッシュ・Actor 等）を片付け方と一緒に預かる。dispose 済みならその場で片付ける */
  own<T extends object>(key: T, dispose: () => void): T {
    if (this.disposed) dispose();
    else this.items.set(key, dispose);
    return key;
  }

  /** 所有権を手放す（行列へ移譲した等）。以後 dispose() しても片付けない */
  release(key: object) {
    return this.items.delete(key);
  }

  /** 預かっているものを今すぐ片付ける（途中で消す提灯など） */
  disposeOne(key: object) {
    const fn = this.items.get(key);
    if (!fn) return false;
    this.items.delete(key);
    fn();
    return true;
  }

  has(key: object) {
    return this.items.has(key);
  }

  get size() {
    return this.items.size;
  }

  /** すべて片付ける。二度呼んでもよい */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const fns = [...this.items.values()];
    this.items.clear();
    for (const fn of fns) fn();
  }
}
