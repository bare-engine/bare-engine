type Fn = (...args: any[]) => any;

export interface Matt<Spec extends object> {
  set<K extends keyof Spec>(type: K, fn: Spec[K]): void;
  has<K extends keyof Spec>(type: K): boolean;
  remove<K extends keyof Spec>(type: K): void;
  clear(): void;

  run<K extends keyof Spec>(
    type: K,
    ...args: Spec[K] extends (...a: infer A) => any ? A : never
  ): Spec[K] extends (...a: any[]) => infer R ? R : never;
}

export default function matt<
  Spec extends { [K in keyof Spec]: Fn }
>(): Matt<Spec> {
  const fns = new Map<keyof Spec, Fn>();

  return {
    set(type, fn) {
      fns.set(type, fn as Fn);
    },
    has(type) {
      return fns.has(type);
    },
    remove(type) {
      fns.delete(type);
    },
    clear() {
      fns.clear();
    },
    run(type, ...args) {
      const fn = fns.get(type);
      //if (!fn) throw new Error(`matt: no pipe registered for "${String(type)}"`);
      if (!fn) return;
      return fn(...args);
    },
  };
}
