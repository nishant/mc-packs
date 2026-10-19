// A small fake of the parts of @minecraft/server that the BDS harness test pack and a pack under test touch, for offline
// tests that run the REAL harness.js (or a real pack's main.js) in node. It is not a game: time only moves when a test
// calls step(), and every module is a data URL, so a "server restart" is a fresh import against the same saved state.
import { readFileSync } from "node:fs";

export const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

/** Lets every promise continuation (a scenario awaiting a tick) run before the next tick. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A game clock with timers, signals and script events. */
export function createGame() {
  let tick = 0;
  let nextId = 1;
  /** @type {Map<number, { at: number, fn: Function, every?: number }>} */
  const timers = new Map();
  /** @type {Map<string, Function[]>} */
  const subs = new Map();
  /** @type {{ id: string, message: string }[]} */
  const queued = [];
  /** @type {{ id: string, message: string }[]} */
  const sent = [];

  const signal = (key) => ({
    subscribe(cb, options) {
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(Object.assign(cb, { options }));
      return cb;
    },
    unsubscribe(cb) {
      const list = subs.get(key) ?? [];
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    },
  });
  const group = (prefix) => new Proxy({}, { get: (target, name) => target[name] ?? (target[name] = signal(`${prefix}.${String(name)}`)) });

  const schedule = (fn, delay, every) => {
    const id = nextId++;
    timers.set(id, { at: tick + Math.max(1, delay), fn, every });
    return id;
  };
  const system = {
    get currentTick() {
      return tick;
    },
    run: (fn) => schedule(fn, 1),
    runTimeout: (fn, delay = 1) => schedule(fn, delay),
    runInterval: (fn, every = 1) => schedule(fn, every, Math.max(1, every)),
    clearRun: (id) => timers.delete(id),
    waitTicks: (n) => new Promise((resolve) => schedule(resolve, n)),
    sendScriptEvent(id, message) {
      sent.push({ id, message });
      queued.push({ id, message });
    },
    beforeEvents: group("system.before"),
    afterEvents: group("system.after"),
  };

  const emit = (key, event = {}) => {
    for (const cb of [...(subs.get(key) ?? [])]) cb(event);
  };
  /** Delivers a script event the way the game does: only to listeners that ask for its namespace. */
  const deliver = (id, message = "") => {
    for (const cb of [...(subs.get("system.after.scriptEventReceive") ?? [])]) {
      const namespaces = cb.options?.namespaces;
      if (namespaces && !namespaces.includes(id.slice(0, id.indexOf(":")))) continue;
      cb({ id, message, sourceType: "Server" });
    }
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      for (const e of queued.splice(0)) deliver(e.id, e.message);
      for (const [id, t] of [...timers]) {
        if (t.at > tick) continue;
        if (t.every) t.at = tick + t.every;
        else timers.delete(id);
        t.fn();
      }
    }
  };
  /** Steps one tick at a time, letting awaiting code run in between, until done() or `limit` ticks. */
  async function until(done, limit = 5000) {
    for (let i = 0; i < limit && !done(); i++) {
      step();
      await flush();
    }
    return done();
  }
  return { system, group, signal, emit, deliver, step, until, sent, get tick() { return tick; } };
}

/** Rewrites a module's bare imports to stub data URLs and relative imports to `map` (name -> url or source text). */
export function rewriteImports(source, { stubs = {}, relative = {} }) {
  return source.replace(/(from\s*|import\s*)"([^"]+)"/g, (whole, lead, spec) => {
    if (spec in stubs) return `${lead}${JSON.stringify(stubs[spec])}`;
    if (spec in relative) return `${lead}${JSON.stringify(relative[spec])}`;
    return whole;
  });
}

export const readText = (url) => readFileSync(url, "utf8");
