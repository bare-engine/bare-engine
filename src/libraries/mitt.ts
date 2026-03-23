export type EventType = string | symbol;

export type EventArgs<T> = T extends any[] ? T : [T];

export type Handler<T = unknown> = (...event: EventArgs<T>) => void;
export type WildcardHandler<Events extends object> = <K extends keyof Events>(
  type: K,
  ...event: EventArgs<Events[K]>
) => void;

type Entry =
  | { fn: (...evt: any[]) => void; once?: boolean; persistent?: boolean; wildcard?: false; alias?: string }
  | { fn: (type: any, ...evt: any[]) => void; once?: boolean; persistent?: boolean; wildcard: true; alias?: string };

type List = Entry[];

export interface Emitter<Events extends object> {
  // raw storage (optional to expose, but keeping parity with mitt style)
  all: Map<keyof Events | "*", List>;

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>, alias?: string): void;
  on(type: "*", handler: WildcardHandler<Events>, alias?: string): void;

  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>, alias?: string): void;
  once(type: "*", handler: WildcardHandler<Events>, alias?: string): void;

  off<K extends keyof Events>(type: K, handler?: Handler<Events[K]>): void;
  off(type: "*", handler?: WildcardHandler<Events>): void;

  offAlias(alias: string): void;

  emit<K extends keyof Events>(type: K, ...event: EventArgs<Events[K]>): void;

  // removes only non-persistent handlers
  clear(type?: keyof Events | "*"): void;

  // removes everything including persistent handlers
  clearAll(type?: keyof Events | "*"): void;

  // persistent view: registers handlers that survive clear()
  persistent: {
    on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void;
    on(type: "*", handler: WildcardHandler<Events>): void;

    once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void;
    once(type: "*", handler: WildcardHandler<Events>): void;

    off<K extends keyof Events>(type: K, handler?: Handler<Events[K]>): void;
    off(type: "*", handler?: WildcardHandler<Events>): void;
  };
}

function getList<Events extends object>(
  all: Map<keyof Events | "*", List>,
  type: keyof Events | "*"
): List {
  let list = all.get(type);
  if (!list) {
    list = [];
    all.set(type, list);
  }
  return list;
}

export default function mitt<Events extends object>(
  all?: Map<keyof Events | "*", List>
): Emitter<Events> {
  all = all || new Map();

  const add = (type: any, fn: any, opts?: Partial<Entry>) => {
    const list = getList<Events>(all!, type);
    if (type === "*") list.push({ fn, wildcard: true, ...opts } as Entry);
    else list.push({ fn, wildcard: false, ...opts } as Entry);
  };

  const remove = (type: any, fn?: any) => {
    const list = all!.get(type);
    if (!list) return;

    if (!fn) {
      all!.set(type, []);
      return;
    }

    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]!.fn === fn) list.splice(i, 1);
    }
  };

  const emit = (type: any, ...evt: any[]) => {
    const list = all!.get(type);
    if (list && list.length) {
      for (const entry of list.slice()) {
        (entry.fn as any)(...evt);
        if (entry.once) remove(type, entry.fn);
      }
    }

    const star = all!.get("*");
    if (star && star.length) {
      for (const entry of star.slice()) {
        (entry.fn as any)(type, ...evt);
        if (entry.once) remove("*", entry.fn);
      }
    }
  };

  const clear = (type?: any) => {
    if (type != null) {
      const list = all!.get(type);
      if (!list) return;
      all!.set(type, list.filter((e) => e.persistent));
      return;
    }

    for (const [k, list] of all!.entries()) {
      all!.set(k, list.filter((e) => e.persistent));
    }
  };

  const clearAll = (type?: any) => {
    if (type != null) {
      all!.set(type, []);
      return;
    }
    for (const k of all!.keys()) all!.set(k, []);
  };

  const api: any = {
    all,

    on(type: any, handler: any, alias?: string) {
      add(type, handler, alias ? { alias } : undefined);
    },

    once(type: any, handler: any, alias?: string) {
      add(type, handler, alias ? { once: true, alias } : { once: true });
    },

    off(type: any, handler?: any) {
      remove(type, handler);
    },

    offAlias(alias: string) {
      for (const [type, list] of all!.entries()) {
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i]!.alias === alias) list.splice(i, 1);
        }
      }
    },

    emit: emit as any,

    clear,
    clearAll,
  };

  api.persistent = {
    on(type: any, handler: any) {
      add(type, handler, { persistent: true });
    },

    once(type: any, handler: any) {
      add(type, handler, { persistent: true, once: true });
    },

    off(type: any, handler?: any) {
      remove(type, handler);
    },
  };

  return api as Emitter<Events>;
}
