// A small offline simulation for running a REAL pack's scripts/main.js in node: a fake @minecraft/server and
// @minecraft/server-ui (players, world properties with read/write counters, timers, script events, command
// registration, forms answered by the test). Every module of the pack is imported as a data URL, so a
// "restart" is a fresh load against the same saved state. It is not a game: time moves only with step().
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createGame, dataUrl, flush } from "../test-bds/lib/fake-game.mjs";

export { flush };
const ROOT = resolve(import.meta.dirname, "..", "..");
let counter = 0;

/** Anything not modelled: an object whose every property is its own name (enums), callable as a class. */
const fallback = (name) => new Proxy(class {}, { get: (t, p) => (typeof p === "symbol" || p === "prototype" || p === "name" ? t[p] : String(p)) });

export class FakePlayer {
  constructor(sim, name, { op = false, id = name } = {}) {
    this.sim = sim;
    this.name = name;
    this.id = id;
    this.isValid = true;
    this.typeId = "minecraft:player";
    this.commandPermissionLevel = op ? 1 : 0;
    this.props = new Map();
    this.tags = new Set();
    this.messages = [];
    this.location = { x: 0, y: 64, z: 0 };
    this.dimension = { id: "minecraft:overworld" };
    this.onScreenDisplay = { setTitle() {}, setActionBar() {} };
  }
  getDynamicProperty(k) {
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  }
  getTags() {
    return [...this.tags];
  }
  hasTag(t) {
    return this.tags.has(t);
  }
  addTag(t) {
    this.tags.add(t);
    return true;
  }
  removeTag(t) {
    return this.tags.delete(t);
  }
  sendMessage(m) {
    this.messages.push(String(m));
  }
  playSound() {}
  runCommand(line) {
    this.sim.ran.push({ player: this.name, line });
    return { successCount: 1 };
  }
}

/** @param {{ stubs?: Record<string, any> }} [opts] */
export function createSim() {
  const game = createGame();
  const key = `__packSim${++counter}`;
  const props = new Map();
  const counts = { get: 0, set: 0, ids: 0 };
  const sim = {
    game,
    props,
    counts,
    players: /** @type {FakePlayer[]} */ ([]),
    pending: /** @type {{ form: any, player: any, resolve: (v: any) => void }[]} */ ([]),
    shown: /** @type {any[]} */ ([]),
    commands: new Map(),
    ran: [],
    warnings: /** @type {string[]} */ ([]),
    server: /** @type {Record<string, any>} */ ({}),
    ui: /** @type {Record<string, any>} */ ({}),
    key,
    fallback,
    join(name, opts) {
      const p = new FakePlayer(sim, name, opts);
      sim.players.push(p);
      return p;
    },
    leave(p) {
      p.isValid = false;
      sim.players.splice(sim.players.indexOf(p), 1);
      for (const w of sim.pending.filter((x) => x.player === p)) w.resolve({ canceled: true, cancelationReason: "UserClosed" });
      game.emit("world.after.playerLeave", { playerId: p.id, playerName: p.name });
    },
    /** Runs a registered command as `player` (the callback, then the deferred work). */
    run(name, player, ...args) {
      const c = sim.commands.get(name);
      if (!c) throw new Error(`no command ${name}`);
      const out = c.cb({ initiator: player, sourceEntity: player }, ...args);
      game.step(1);
      return out;
    },
    /** Fires the startup event so the pack registers its commands. */
    boot() {
      game.emit("system.before.startup", {
        customCommandRegistry: {
          registerCommand: (def, cb) => sim.commands.set(def.name, { def, cb }),
          registerEnum() {},
        },
      });
    },
    step: (n = 1) => game.step(n),
    /** Steps ticks one at a time with promises flushing between, until `done()` or the limit. */
    until: (done, limit = 3000) => game.until(done, limit),
    async settle(n = 3) {
      for (let i = 0; i < n; i++) {
        game.step(1);
        await flush();
      }
    },
    /** The oldest form waiting for an answer, after letting code run. */
    async nextForm(limit = 600) {
      await sim.until(() => sim.pending.length > 0, limit);
      return sim.pending[0];
    },
    /** Answers the oldest waiting form. */
    answer(res) {
      const w = sim.pending.shift();
      if (!w) throw new Error("no form is waiting");
      w.resolve(res);
    },
    async load(folder, file = "main.js") {
      const entryPath = join(ROOT, "packs", folder, "scripts", file);
      const names = { "@minecraft/server": new Set(), "@minecraft/server-ui": new Set() };
      const seen = new Set();
      const scan = (path) => {
        if (seen.has(path)) return;
        seen.add(path);
        const src = readFileSync(path, "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@minecraft\/server(?:-ui)?)"/g)) for (const n of m[1].split(",")) if (n.trim()) names[m[2]].add(n.trim().split(/\s+as\s+/)[0]);
        for (const m of src.matchAll(/from\s*"(\.\/[^"]+)"|import\s*"(\.\/[^"]+)"/g)) {
          const spec = m[1] ?? m[2];
          if (spec !== "./diag.js") scan(join(path, "..", spec));
        }
      };
      scan(entryPath);
      globalThis[key] = sim;
      sim.server = makeServer(sim);
      sim.ui = makeUi(sim);
      const stub = (pkg, slot) => dataUrl([...names[pkg]].map((n) => `export const ${n} = globalThis.${key}.${slot}[${JSON.stringify(n)}] ?? globalThis.${key}.fallback(${JSON.stringify(n)});`).join("\n") || "export {};");
      const urls = { "@minecraft/server": stub("@minecraft/server", "server"), "@minecraft/server-ui": stub("@minecraft/server-ui", "ui") };
      const cache = new Map();
      const build = (path) => {
        if (cache.has(path)) return cache.get(path);
        const dir = join(path, "..");
        const src = readFileSync(path, "utf8").replace(/(from\s*|import\s*)"([^"]+)"/g, (whole, lead, spec) => {
          if (spec === "./diag.js") return `${lead}${JSON.stringify(dataUrl("export {};"))}`;
          if (spec.startsWith("./")) return `${lead}${JSON.stringify(build(join(dir, spec)))}`;
          if (spec in urls) return `${lead}${JSON.stringify(urls[spec])}`;
          return whole;
        });
        const url = dataUrl(`${src}\n// ${key}-${path}`);
        cache.set(path, url);
        return url;
      };
      return import(build(entryPath));
    },
  };
  return sim;
}

function makeServer(sim) {
  const { game, props, counts } = sim;
  const players = sim.players;
  const system = {
    ...game.system,
    get currentTick() {
      return game.tick;
    },
    runJob(gen) {
      const id = game.system.runInterval(() => {
        for (let i = 0; i < 50; i++) if (gen.next().done) return void game.system.clearRun(id);
      }, 1);
      return id;
    },
  };
  const world = {
    beforeEvents: game.group("world.before"),
    afterEvents: game.group("world.after"),
    getDynamicProperty(k) {
      counts.get++;
      return props.get(k);
    },
    setDynamicProperty(k, v) {
      counts.set++;
      if (v === undefined) props.delete(k);
      else props.set(k, v);
    },
    getDynamicPropertyIds() {
      counts.ids++;
      return [...props.keys()];
    },
    getDynamicPropertyTotalByteCount: () => 0,
    getAllPlayers: () => [...players],
    getPlayers: () => [...players],
    getTimeOfDay: () => 1000,
    getDefaultSpawnLocation: () => ({ x: 0, y: 64, z: 0 }),
    sendMessage() {},
  };
  return {
    system,
    world,
    Player: FakePlayer,
    CommandPermissionLevel: { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 },
    CustomCommandStatus: { Success: 0, Failure: 1 },
    CustomCommandParamType: { String: "String", Integer: "Integer", PlayerSelector: "PlayerSelector", Boolean: "Boolean", Float: "Float", Location: "Location", Enum: "Enum" },
    WeatherType: { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" },
    GameMode: { Spectator: "Spectator" },
  };
}

function makeUi(sim) {
  class Form {
    constructor() {
      this.parts = [];
    }
    title(t) {
      this.titleText = t;
      return this;
    }
    body(t) {
      this.bodyText = t;
      return this;
    }
    button(t) {
      this.parts.push({ kind: "button", text: t });
      return this;
    }
    button1(t) {
      this.b1 = t;
      return this;
    }
    button2(t) {
      this.b2 = t;
      return this;
    }
    label(t) {
      this.parts.push({ kind: "label", text: t });
      return this;
    }
    divider() {
      return this;
    }
    header(t) {
      this.parts.push({ kind: "header", text: t });
      return this;
    }
    textField(label, hint, opts) {
      this.parts.push({ kind: "textField", label, hint, opts });
      return this;
    }
    dropdown(label, items, opts) {
      this.parts.push({ kind: "dropdown", label, items, opts });
      return this;
    }
    toggle(label, opts) {
      this.parts.push({ kind: "toggle", label, opts });
      return this;
    }
    slider(label, min, max, opts) {
      this.parts.push({ kind: "slider", label, min, max, opts });
      return this;
    }
    submitButton(t) {
      this.submit = t;
      return this;
    }
    get buttons() {
      return this.parts.filter((p) => p.kind === "button").map((p) => p.text);
    }
    show(player) {
      sim.shown.push(this);
      return new Promise((resolveForm) => {
        sim.pending.push({ form: this, player, resolve: resolveForm });
      });
    }
  }
  return {
    ActionFormData: class ActionFormData extends Form {},
    ModalFormData: class ModalFormData extends Form {},
    MessageFormData: class MessageFormData extends Form {},
    FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
  };
}
