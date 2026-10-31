// Rain Extras, Storm Chasing, Regional Weather, Tornadoes, Night and Moon (O57): the overworld weather can't be read, so
// each pack keeps the last weatherChange it saw. A pack added in the middle of a storm (or a world that changed its
// weather while a pack was away) knows nothing until the next change. The Weather Almanac knows: it sends
// `realm:weather_plan` `{ now, until, next, off? }` whenever its plan changes and answers `realm:weather_ask`. These
// packs ask once the world has loaded and take `now` from the plan until a real weatherChange has come in; without
// the Almanac nothing changes, and nothing waits for it. Rainbows & the Pot of Gold keeps no weather state (it reacts
// to the transition event's own previousWeather), so there is nothing for it to learn.
// The server run is tools/test-bds/examples/weather-plan-intake.js.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packsDir = new URL("../packs/", import.meta.url);
const dataUrl = (/** @type {string} */ code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

/** Anything else the game offers: callable, constructible, every property another one of itself. */
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => /** @type {any} */ (anything),
  has: () => false,
});

function fakeGame() {
  /** @type {Map<string, Function[]>} */
  const subs = new Map();
  const signal = (/** @type {string} */ key) => ({
    subscribe(/** @type {Function} */ cb, /** @type {any} */ options) {
      if (!subs.has(key)) subs.set(key, []);
      /** @type {any[]} */ (subs.get(key)).push(Object.assign(cb, { options }));
      return cb;
    },
    unsubscribe(/** @type {Function} */ cb) {
      const list = subs.get(key) ?? [];
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    },
  });
  const group = (/** @type {string} */ prefix) => new Proxy({}, { get: (target, name) => /** @type {any} */ (target)[name] ?? (/** @type {any} */ (target)[name] = signal(`${prefix}.${String(name)}`)) });
  const props = new Map();
  /** @type {{ id: string, message: string }[]} */
  const sent = [];
  /** @type {{ at: number, fn: Function }[]} */
  let timers = [];
  let tick = 0;
  const system = new Proxy(
    {
      get currentTick() {
        return tick;
      },
      run: (/** @type {Function} */ fn) => timers.push({ at: tick + 1, fn }),
      runTimeout: (/** @type {Function} */ fn, /** @type {number} */ t = 1) => timers.push({ at: tick + Math.max(1, t), fn }),
      runInterval: () => 1,
      runJob: () => 1,
      clearRun: () => {},
      waitTicks: () => Promise.resolve(),
      sendScriptEvent: (/** @type {string} */ id, /** @type {string} */ message) => {
        sent.push({ id, message });
      },
      beforeEvents: group("system.before"),
      afterEvents: group("system.after"),
    },
    { get: (target, key) => (key in target ? /** @type {any} */ (target)[key] : anything) },
  );
  /** @type {{ key: string, value: unknown }[]} */
  const writes = [];
  const world = new Proxy(
    {
      beforeEvents: group("world.before"),
      afterEvents: group("world.after"),
      getDynamicProperty: (/** @type {string} */ k) => props.get(k),
      setDynamicProperty(/** @type {string} */ k, /** @type {unknown} */ v) {
        writes.push({ key: k, value: v });
        if (v === undefined) props.delete(k);
        else props.set(k, v);
      },
      getDynamicPropertyIds: () => [...props.keys()],
      getAllPlayers: () => [],
      getTimeOfDay: () => 6000,
      getDay: () => 1,
    },
    { get: (target, key) => (key in target ? /** @type {any} */ (target)[key] : anything) },
  );
  /** Calls the subscribers of a signal. */
  const emit = (/** @type {string} */ key, /** @type {any} */ event = {}) => {
    for (const cb of [...(subs.get(key) ?? [])]) cb(event);
  };
  /** Delivers a script event the way the game does: only to listeners that ask for its namespace. */
  const deliver = (/** @type {string} */ id, /** @type {string} */ message = "{}") => {
    for (const cb of [...(subs.get("system.after.scriptEventReceive") ?? [])]) {
      const options = /** @type {any} */ (cb).options;
      if (options?.namespaces && !options.namespaces.includes(id.slice(0, id.indexOf(":")))) continue;
      cb({ id, message, sourceType: "Server" });
    }
  };
  const step = (/** @type {number} */ n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const due = timers.filter((t) => t.at <= tick);
      timers = timers.filter((t) => t.at > tick);
      for (const t of due) t.fn();
    }
  };
  return { system, world, props, writes, sent, emit, deliver, step, subs };
}

/** A pack's main.js with its own files (and nothing else) behind it, run against the fake game. @param {string} folder */
async function loadPack(folder) {
  const game = fakeGame();
  const g = /** @type {any} */ (globalThis);
  g.__weatherGame = { WeatherType: { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" }, system: game.system, world: game.world, anything };
  const dir = new URL(`${folder}/scripts/`, packsDir);
  /** @type {Map<string, string>} */
  const built = new Map();
  const names = (/** @type {string} */ src, /** @type {string} */ from) => [...src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${from}"`, "g"))].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  // Every load gets its own modules (a data URL is one module for as long as its text is the same), so each has its own fake game.
  const unique = Math.random();
  const stub = (/** @type {string[]} */ list) => dataUrl(`const g = globalThis.__weatherGame; ${[...new Set(list)].map((n) => `export const ${n} = g[${JSON.stringify(n)}] ?? g.anything;`).join("\n")}\n// ${unique}`);
  const sources = new Map();
  const collect = (/** @type {string} */ file) => {
    if (sources.has(file)) return;
    const src = readFileSync(new URL(file, dir), "utf8");
    sources.set(file, src);
    for (const m of src.matchAll(/from\s*"(\.\/[^"]+)"/g)) collect(m[1].slice(2));
  };
  collect("main.js");
  const serverUrl = stub([...sources.values()].flatMap((s) => names(s, "@minecraft/server")));
  const uiUrl = stub([...sources.values()].flatMap((s) => names(s, "@minecraft/server-ui")));
  const build = (/** @type {string} */ file) => {
    const cached = built.get(file);
    if (cached) return cached;
    const src = /** @type {string} */ (sources.get(file))
      .replace('import "./diag.js";', "")
      .replaceAll('"@minecraft/server"', JSON.stringify(serverUrl))
      .replaceAll('"@minecraft/server-ui"', JSON.stringify(uiUrl))
      .replace(/from\s*"\.\/([^"]+)"/g, (_, rel) => (rel === "config.js" ? `from ${JSON.stringify(new URL(rel, dir).href)}` : `from ${JSON.stringify(build(rel))}`));
    const url = dataUrl(`${src}\n// ${folder} ${file} ${unique}`);
    built.set(file, url);
    return url;
  };
  await import(build("main.js"));
  return game;
}

const PACKS = [
  { folder: "rain_bp", prop: "rain:weather" },
  { folder: "storm_bp", prop: "storm:weather" },
  { folder: "climate_bp", prop: "climate:weather" },
  { folder: "tornado_bp", prop: "tornado:weather" },
  { folder: "night_bp", prop: "night:weather" },
  { folder: "moon_bp", prop: "moon:weather" },
];
const plan = (/** @type {object} */ extra = {}) => JSON.stringify({ now: "Thunder", until: 123456, next: [{ weather: "Clear", at: 123456 }], ...extra });
const asks = (/** @type {any} */ game) => game.sent.filter((/** @type {any} */ s) => s.id === "realm:weather_ask");

for (const { folder, prop } of PACKS) {
  test(`${folder} asks the Almanac for the plan once the world has loaded, one time`, async () => {
    const game = await loadPack(folder);
    assert.equal(asks(game).length, 0, "nothing is sent while the scripts load");
    game.emit("world.after.worldLoad", {});
    game.step(60);
    assert.equal(asks(game).length, 0, "the other packs are still setting up");
    game.step(100);
    assert.equal(asks(game).length, 1);
    assert.equal(asks(game)[0].message, "{}");
    game.step(2000);
    assert.equal(asks(game).length, 1, "it doesn't keep asking");
  });

  test(`${folder} added in the middle of a storm takes the weather from the plan and saves it`, async () => {
    const game = await loadPack(folder);
    game.emit("world.after.worldLoad", {});
    game.step(5);
    assert.equal(game.props.get(prop), undefined, "a new pack has nothing saved");
    game.deliver("realm:weather_plan", plan());
    assert.equal(game.props.get(prop), "Thunder");
    game.deliver("realm:weather_plan", plan({ now: "Clear" }));
    assert.equal(game.props.get(prop), "Clear", "the plan keeps teaching it until the game itself reports a change");
    game.deliver("realm:weather_plan", plan({ now: "Rain", dim: "minecraft:overworld" }));
    assert.equal(game.props.get(prop), "Rain", "a prefixed overworld id is the overworld");
    game.deliver("realm:weather_plan", plan({ now: "Thunder", dimension: "overworld" }));
    assert.equal(game.props.get(prop), "Thunder", "and so is the bare one");
  });

  test(`${folder} ignores plans that don't describe the overworld weather now`, async () => {
    const game = await loadPack(folder);
    game.emit("world.after.worldLoad", {});
    game.step(5);
    for (const message of [
      plan({ off: true }),
      plan({ dim: "minecraft:nether" }),
      plan({ dimension: "the_end" }),
      plan({ now: "Hail" }),
      plan({ now: undefined }),
      "{ not json",
      "null",
      "7",
    ]) {
      game.deliver("realm:weather_plan", message);
    }
    assert.equal(game.props.get(prop), undefined, "the Almanac off reports only the last weather it saw, which is no better than the pack's own");
    assert.deepEqual(game.writes.filter((w) => w.key === prop), []);
  });

  test(`${folder} lets a real weatherChange win over the plan, in either spelling of the dimension`, async () => {
    for (const dimension of ["overworld", "minecraft:overworld"]) {
      const game = await loadPack(folder);
      game.emit("world.after.worldLoad", {});
      game.step(5);
      game.emit("world.after.weatherChange", { dimension: "minecraft:nether", newWeather: "Rain", previousWeather: "Clear" });
      game.deliver("realm:weather_plan", plan({ now: "Thunder" }));
      assert.equal(game.props.get(prop), "Thunder", "another dimension's change is not the overworld's");
      game.emit("world.after.weatherChange", { dimension, newWeather: "Clear", previousWeather: "Thunder" });
      assert.equal(game.props.get(prop), "Clear");
      game.deliver("realm:weather_plan", plan({ now: "Rain" }));
      game.deliver("realm:weather_plan", plan({ now: "Thunder" }));
      assert.equal(game.props.get(prop), "Clear", `${dimension}: the game's report is newer than the plan`);
    }
  });

  test(`${folder} without the Almanac still follows weatherChange and the saved weather (unchanged)`, async () => {
    const game = await loadPack(folder);
    game.props.set(prop, "Rain");
    game.emit("world.after.worldLoad", {});
    game.step(5000);
    assert.equal(game.props.get(prop), "Rain", "the saved weather stands when no plan ever comes");
    game.emit("world.after.weatherChange", { dimension: "overworld", newWeather: "Thunder", previousWeather: "Rain" });
    assert.equal(game.props.get(prop), "Thunder");
    game.emit("world.after.weatherChange", { dimension: "minecraft:overworld", newWeather: "Clear", previousWeather: "Thunder" });
    assert.equal(game.props.get(prop), "Clear");
  });

  test(`${folder} waits for nothing: with no answer to its one question the saved weather and the next change are all it has`, async () => {
    const game = await loadPack(folder);
    game.props.set(prop, "Thunder");
    game.emit("world.after.worldLoad", {});
    game.step(5000);
    assert.equal(asks(game).length, 1, "one unanswered question is all it costs");
    assert.equal(game.props.get(prop), "Thunder");
    assert.deepEqual(game.writes.filter((w) => w.key === prop), [], "and it writes nothing of its own");
  });
}

test("the six packs read a plan with the same code (one tools/weather-plan-shared.js, F52)", () => {
  const shared = readFileSync(new URL("../tools/weather-plan-shared.js", import.meta.url), "utf8");
  const texts = PACKS.map(({ folder }) => {
    const src = readFileSync(new URL(`${folder}/scripts/main.js`, packsDir), "utf8");
    assert.match(src, /^import \{ planNow \} from "\.\/weather-plan\.js";$/m, `${folder} reads the plan with its weather-plan.js`);
    assert.doesNotMatch(src, /function planNow\(/, `${folder} keeps no copy of its own`);
    return readFileSync(new URL(`${folder}/scripts/weather-plan.js`, packsDir), "utf8");
  });
  for (const t of texts) assert.equal(t, `// Generated from tools/weather-plan-shared.js by node tools/sync-weather.mjs: edit that file, not this copy.\n${shared}`);
  assert.match(texts[0], /m\.off === true/);
  assert.match(texts[0], /replace\(\/\^minecraft:\/, ""\)/);
});

test("Rainbows & the Pot of Gold has no weather guess to replace", () => {
  assert.ok(existsSync(new URL("rainbow_bp/scripts/main.js", packsDir)));
  const src = readFileSync(new URL("rainbow_bp/scripts/main.js", packsDir), "utf8");
  assert.doesNotMatch(src, /rainbow:weather|PROP_WEATHER/);
  assert.match(src, /previousWeather === WeatherType\.Clear/, "it reads the transition from the event itself");
});

test("the Almanac answers the asks of every pack that loads together with one plan, and a later ask with another", async () => {
  const game = await loadPack("weather_bp");
  const plans = () => game.sent.filter((s) => s.id === "realm:weather_plan");
  const before = plans().length;
  for (let i = 0; i < 7; i++) game.deliver("realm:weather_ask", "{}");
  game.step(1);
  game.deliver("realm:weather_ask", "{}");
  game.step(30);
  assert.equal(plans().length - before, 1, "eight asks in a few ticks get one answer");
  game.deliver("realm:weather_ask", "{}");
  game.step(30);
  assert.equal(plans().length - before, 2, "an ask a little later gets its own");
  const msg = JSON.parse(plans().at(-1).message);
  assert.deepEqual(Object.keys(msg).sort(), ["next", "now", "off", "until"], "the plan's schema: now, until, next, off when the Almanac is off");
});
