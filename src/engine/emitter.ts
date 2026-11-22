/** A minimal typed event emitter. */
export class Emitter<M> {
  private handlers = new Map<keyof M, Set<(payload: never) => void>>();

  on<K extends keyof M>(name: K, cb: (payload: M[K]) => void): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(cb as (payload: never) => void);
    return () => set!.delete(cb as (payload: never) => void);
  }

  emit<K extends keyof M>(name: K, payload: M[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (p: M[K]) => void)(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  clear() {
    this.handlers.clear();
  }
}
