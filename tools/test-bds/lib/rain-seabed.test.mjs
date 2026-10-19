// Rain Extras' seabed scenario (examples/rain-seabed.js) run offline: the REAL packs/rain_bp scripts, the REAL test hook
// from the scenario's own header recipe and the REAL scenario file, against a fake game whose clock and terrain this test
// controls. The native run failed twice with {"Swimmer":3,"Walker":1}: one storm fog push for a walker on dry sand,
// 20 ticks after the fixture built the sand, then none. Rain decides dry ground from one getTopmostBlock lookup per
// player per second and holds no classification of its own, so the push means that lookup (or what it read) was not yet
// "sand with nothing wet over it" at the storm's first step. The fixture never checked. These tests model the ways that
// can happen (a plant that has not popped off the new sand, a lookup that still answers with the old block, a chunk that
// cannot be read yet) and require the scenario to wait for Rain's own verdicts before it starts the storm.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGame, dataUrl } from "./fake-game.mjs";

const scenarioFile = new URL("../examples/rain-seabed.js", import.meta.url);
const rainDir = new URL("../../../packs/rain_bp/scripts/", import.meta.url);

// The scenario as it was before the readiness gate (examples/rain-seabed.js at 596d187f): counts only, a 10 tick wait.
const ORIGINAL_HOOK = `const __fogs = new Map();
const __run = Player.prototype.runCommand;
Player.prototype.runCommand = function (cmd) {
  if (/^fog @s push realm:rain_storm/.test(cmd)) __fogs.set(this.name, (__fogs.get(this.name) ?? 0) + 1);
  return __run.call(this, cmd);
};
system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
  if (id === "rntest:fogs") system.sendScriptEvent("rntest:fogs_r", JSON.stringify(Object.fromEntries(__fogs)));
}, { namespaces: ["rntest"] });`;
const ORIGINAL_SCENARIO = `export default async function (t) {
  const sys = t.mc.system;
  let fogs;
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rntest:fogs_r") fogs = JSON.parse(message);
  }, { namespaces: ["rntest"] });
  const sp = t.world.getDefaultSpawnLocation();
  const dim = t.dimension;
  const swimmer = await t.player("Swimmer", { x: sp.x + 20, z: sp.z });
  const walker = await t.player("Walker", { x: sp.x - 20, z: sp.z });
  const s = { x: Math.floor(swimmer.location.x), y: Math.floor(swimmer.location.y), z: Math.floor(swimmer.location.z) };
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (let dy = -4; dy <= 2; dy++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const type = dy === -4 ? "minecraft:sand" : dy >= 0 ? "minecraft:air" : edge ? "minecraft:stone" : "minecraft:water";
        dim.getBlock({ x: s.x + dx, y: s.y + dy, z: s.z + dz })?.setType(type);
      }
  swimmer.teleport({ x: s.x + 0.5, y: s.y - 2, z: s.z + 0.5 });
  const w = { x: Math.floor(walker.location.x), y: Math.floor(walker.location.y), z: Math.floor(walker.location.z) };
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) dim.getBlock({ x: w.x + dx, y: w.y - 1, z: w.z + dz })?.setType("minecraft:sand");
  await t.wait(10);
  t.server("/weather thunder");
  await t.seconds(20);
  fogs = undefined;
  await t.console("scriptevent rntest:fogs {}");
  await t.waitUntil(() => fogs, { timeout: 60, message: "the hook answered" });
  t.check((fogs.Swimmer ?? 0) > 0, \`the swimmer over a sandy bottom gets the storm fog (\${fogs.Swimmer ?? 0} pushes)\`);
  t.check((fogs.Walker ?? 0) === 0, \`the walker on dry sand doesn't (\${fogs.Walker ?? 0} pushes)\`);
}`;

/** The scenario header's recipe appends one here-document to rain_bp's main.js: that is the hook, as the suite builds it. */
function hookOf(scenarioText) {
  const lines = scenarioText.split("\n").filter((l) => l.startsWith("//   ")).map((l) => l.slice(5));
  const open = lines.findIndex((l) => /<<'HOOK'$/.test(l));
  const close = lines.findIndex((l, i) => i > open && l === "HOOK");
  assert.ok(open >= 0 && close > open, "the header recipe has a HOOK here-document");
  return lines.slice(open + 1, close).join("\n");
}

const TERRAIN_TOP = 69; // grass over dirt: the world the scenario sees

/** The fake game: columns of blocks, simulated players, weather, and the hazards that make a lookup lie for a while. */
function createEnv(hazards = {}) {
  const game = createGame();
  const changed = new Map();
  const mutatedAt = new Map(); // "x,z" -> tick of the first setType in the column
  const key = (x, y, z) => `${x},${y},${z}`;
  const col = (x, z) => `${x},${z}`;
  const walkerColumn = new Set();
  const typeAt = (x, y, z) => {
    const k = key(x, y, z);
    if (changed.has(k)) return changed.get(k);
    if (y > TERRAIN_TOP + 1 || y < 0) return y < 0 ? "minecraft:stone" : "minecraft:air";
    if (y === TERRAIN_TOP + 1) {
      const m = mutatedAt.get(col(x, z));
      const popped = m !== undefined && game.tick >= m + hazards.plantPopsAfter;
      return hazards.plantPopsAfter !== undefined && walkerColumn.has(col(x, z)) && !popped ? "minecraft:short_grass" : "minecraft:air";
    }
    return y === TERRAIN_TOP ? "minecraft:grass_block" : "minecraft:dirt";
  };
  const original = (y) => (y === TERRAIN_TOP ? "minecraft:grass_block" : "minecraft:dirt");
  const block = (x, y, z, typeId) => ({
    get typeId() {
      return typeId ?? typeAt(x, y, z);
    },
    location: { x, y, z },
    get isAir() {
      return this.typeId === "minecraft:air";
    },
    get isLiquid() {
      return this.typeId === "minecraft:water";
    },
    isSolid: true,
    above: () => block(x, y + 1, z),
    below: () => block(x, y - 1, z),
    setType(type) {
      const c = col(x, z);
      if (!mutatedAt.has(c)) mutatedAt.set(c, game.tick);
      changed.set(key(x, y, z), type);
    },
  });
  const settling = (x, z, ticks) => mutatedAt.has(col(x, z)) && game.tick < mutatedAt.get(col(x, z)) + ticks;
  const commands = [];
  class Player {
    constructor(name, x, z) {
      this.name = name;
      this.id = `id-${name}`;
      this.location = { x: Math.floor(x) + 0.5, y: TERRAIN_TOP + 1, z: Math.floor(z) + 0.5 };
      this.dimension = dimension;
      this.tags = new Set();
    }
    runCommand(command) {
      commands.push({ tick: game.tick, name: this.name, command });
      return { successCount: 1 };
    }
    get isInWater() {
      return typeAt(Math.floor(this.location.x), Math.floor(this.location.y), Math.floor(this.location.z)) === "minecraft:water";
    }
    teleport(to) {
      this.location = { ...to };
    }
    hasTag(tag) {
      return this.tags.has(tag);
    }
    addTag(tag) {
      this.tags.add(tag);
    }
    removeTag(tag) {
      this.tags.delete(tag);
    }
    getDynamicProperty() {}
    setDynamicProperty() {}
    getViewDirection() {
      return { x: 0, y: 0, z: 1 };
    }
    playSound() {}
    spawnParticle() {}
  }
  const players = [];
  const dimension = {
    id: "minecraft:overworld",
    runCommand: () => ({ successCount: 1 }),
    getBlock: ({ x, y, z }) => block(Math.floor(x), Math.floor(y), Math.floor(z)),
    getTopmostBlock({ x, z }) {
      if (hazards.unreadableForever && walkerColumn.has(col(x, z))) throw new Error("LocationInUnloadedChunkError");
      if (hazards.unreadableFor !== undefined && walkerColumn.has(col(x, z)) && settling(x, z, hazards.unreadableFor)) throw new Error("LocationInUnloadedChunkError");
      for (let y = TERRAIN_TOP + 3; y >= 0; y--) {
        // like the game: water is skipped, so the sand under a pool is the top
        const id = typeAt(x, y, z);
        if (id === "minecraft:air" || id === "minecraft:water") continue;
        if (hazards.staleFor !== undefined && settling(x, z, hazards.staleFor)) return block(x, TERRAIN_TOP, z, original(TERRAIN_TOP)); // still answers with the block that was there before
        return block(x, y, z);
      }
      return undefined;
    },
  };
  const world = {
    getDimension: () => dimension,
    getDefaultSpawnLocation: () => ({ x: 163, y: TERRAIN_TOP + 1, z: 170 }),
    getAllPlayers: () => [...players],
    getDynamicProperty: () => undefined,
    setDynamicProperty() {},
    getEntity: () => undefined,
    beforeEvents: game.group("world.before"),
    afterEvents: game.group("world.after"),
  };
  return { game, world, Player, players, commands, walkerColumn, dimension };
}

/** Rain Extras with the hook appended, built the way the suite builds its test copy, against the fake game. */
async function loadRain(env, hook, patchRain = (src) => src) {
  const g = globalThis;
  g.__rainEnv = {
    WeatherType: { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" },
    CommandPermissionLevel: { Any: 0, GameDirectors: 1 },
    CustomCommandStatus: { Success: 0, Failure: 1 },
    Dimension: class Dimension {},
    Player: env.Player,
    system: env.game.system,
    world: env.world,
  };
  const unique = `${Math.random()}`;
  const stub = dataUrl(
    `const g = globalThis.__rainEnv; export const { WeatherType, CommandPermissionLevel, CustomCommandStatus, Dimension, Player, system, world } = g;\n// ${unique}`,
  );
  const built = new Map();
  const build = (file) => {
    if (built.has(file)) return built.get(file);
    let src = readFileSync(new URL(file, rainDir), "utf8");
    if (file === "main.js") src = `${patchRain(src).replace('import "./diag.js";', "")}\n${hook}\n`;
    src = src
      .replaceAll('"@minecraft/server"', JSON.stringify(stub))
      .replace(/from\s*"\.\/([^"]+)"/g, (_, rel) => (rel === "config.js" ? `from ${JSON.stringify(new URL(rel, rainDir).href)}` : `from ${JSON.stringify(build(rel))}`));
    const url = dataUrl(`${src}\n// ${file} ${unique}`);
    built.set(file, url);
    return url;
  };
  await import(build("main.js"));
}

/** The harness's t, as far as the scenarios of this kind use it, driven by the fake clock. */
function createT(env) {
  const { game, world } = env;
  const failures = [];
  const logs = [];
  const sys = game.system;
  const t = {
    mc: { system: sys },
    world,
    get dimension() {
      return env.dimension;
    },
    failures,
    logs,
    get tick() {
      return game.tick;
    },
    log: (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
    wait: (n = 1) => sys.waitTicks(Math.max(1, Math.floor(n))),
    seconds: (s) => sys.waitTicks(Math.max(1, Math.round(s * 20))),
    check(ok, message) {
      if (!ok) failures.push(message);
      logs.push(`${ok ? "ok" : "FAILED"}: ${message}`);
      return !!ok;
    },
    assert(ok, message) {
      if (!ok) throw new Error(message);
    },
    fail(message) {
      throw new Error(message);
    },
    async waitUntil(fn, { timeout = 200, interval = 1, message } = {}) {
      const end = game.tick + timeout;
      for (;;) {
        let v;
        try {
          v = await fn();
        } catch {
          v = undefined;
        }
        if (v) return v;
        if (game.tick >= end) throw new Error(message || `waitUntil timed out after ${timeout} ticks`);
        await sys.waitTicks(interval);
      }
    },
    async player(name, { x, z } = {}) {
      const player = new env.Player(name, x, z);
      if (name === "Walker") env.walkerColumn.add(`${Math.floor(x)},${Math.floor(z)}`);
      env.players.push(player);
      game.emit("world.after.playerSpawn", { player, initialSpawn: true });
      await sys.waitTicks(10);
      return player;
    },
    server(command) {
      if (/^\/?weather thunder$/.test(command)) sys.runTimeout(() => game.emit("world.after.weatherChange", { dimension: "overworld", newWeather: "Thunder", previousWeather: "Clear" }), 1);
      return { ok: true };
    },
    async console(command) {
      const m = /^scriptevent (\S+) ?(.*)$/.exec(command);
      assert.ok(m, `a scriptevent console command: ${command}`);
      sys.sendScriptEvent(m[1], m[2]);
      await sys.waitTicks(2);
    },
  };
  return t;
}

/** One scenario run: Rain + hook + scenario on the fake game. */
async function run({ scenario, hook, hazards, patchRain }) {
  const env = createEnv(hazards);
  await loadRain(env, hook, patchRain);
  env.game.emit("world.after.worldLoad", {});
  const t = createT(env);
  const body = (await import(dataUrl(`${scenario}\n// ${Math.random()}`))).default;
  let outcome;
  body(t).then(
    () => (outcome = { ok: true }),
    (e) => (outcome = { ok: false, error: String(e?.message ?? e) }),
  );
  const finished = await env.game.until(() => outcome, 6000);
  assert.ok(finished, `the scenario never finished (tick ${env.game.tick})`);
  const failed = outcome.ok ? t.failures : [outcome.error, ...t.failures];
  return { ok: outcome.ok && !t.failures.length, failed, logs: t.logs, env, ticks: env.game.tick };
}

const scenarioText = readFileSync(scenarioFile, "utf8");
const HOOK = hookOf(scenarioText);
const CURRENT = { scenario: scenarioText.replace(/^\/\/.*\n/gm, ""), hook: HOOK };
const ORIGINAL = { scenario: ORIGINAL_SCENARIO, hook: ORIGINAL_HOOK };

test("model check: the original fixture passes when the new sand is classified at once, as in the native runs that passed", async () => {
  const r = await run({ ...ORIGINAL, hazards: {} });
  assert.deepEqual(r.failed, [], r.logs.join("\n"));
});

test("model check: the original fixture fails exactly like the native run when a lookup lags for a second", async () => {
  for (const hazards of [{ plantPopsAfter: 40 }, { staleFor: 40 }, { unreadableFor: 40 }]) {
    const r = await run({ ...ORIGINAL, hazards });
    assert.deepEqual(r.failed, ["the walker on dry sand doesn't (1 pushes)"], JSON.stringify(hazards));
    assert.ok(r.logs.some((l) => /the swimmer over a sandy bottom gets the storm fog \(3 pushes\)/.test(l)), JSON.stringify(hazards));
  }
});

test("the scenario waits for Rain's own verdicts, then Swimmer gets the storm fog and Walker none", async () => {
  for (const hazards of [{}, { plantPopsAfter: 40 }, { staleFor: 40 }, { unreadableFor: 40 }, { staleFor: 150 }]) {
    const r = await run({ ...CURRENT, hazards });
    assert.deepEqual(r.failed, [], `${JSON.stringify(hazards)}\n${r.logs.join("\n")}`);
    const log = r.logs.join("\n");
    assert.match(log, /the swimmer over a sandy bottom gets the storm fog \([1-9]\d* pushes\)/);
    assert.match(log, /the walker on dry sand doesn't \(0 pushes\)/);
  }
});

test("it starts the storm only after the classifier has been right for longer than one Rain update", async () => {
  const r = await run({ ...CURRENT, hazards: { staleFor: 100 } });
  assert.deepEqual(r.failed, []);
  const storm = r.env.commands.find((c) => /fog @s push realm:rain_storm/.test(c.command));
  assert.ok(storm, "the swimmer got the storm");
  assert.ok(storm.tick >= 100, `the first storm fog came at tick ${storm.tick}, after the stale lookup was gone`);
});

test("a classifier that never settles fails before the storm, naming what Rain saw", async (t) => {
  const r = await run({ ...CURRENT, hazards: { unreadableForever: true } });
  t.diagnostic(r.failed[0]);
  assert.equal(r.ok, false);
  assert.match(r.failed[0], /Rain's own verdict/);
  assert.match(r.failed[0], /Walker/);
  assert.match(r.failed[0], /here=none/);
  assert.equal(r.env.commands.some((c) => /fog @s push realm:rain_storm/.test(c.command)), false, "no storm was started on a fixture that was not ready");
});

test("a Rain that no longer calls sand dry ground is named before the storm, with what it and the scenario each read", async () => {
  const patchRain = (src) => {
    const broken = src.replace("const DRY_GROUND = /sand|terracotta|snow|ice/;", "const DRY_GROUND = /terracotta|snow|ice/;");
    assert.notEqual(broken, src, "the production line this test breaks is still there");
    return broken;
  };
  const r = await run({ ...CURRENT, hazards: {}, patchRain });
  assert.equal(r.ok, false);
  assert.match(r.failed[0], /Rain's own verdict/);
  assert.match(r.failed[0], /Walker: Rain's own verdict here=minecraft:sand .*dry=false; the scenario reads minecraft:sand/);
});

test("the suite still plans the scenario from its header: the whole recipe fits the 60 header lines and is plain shell", () => {
  const suite = fileURLToPath(new URL("../suite.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [suite, "--list", "--filter", "^rain-seabed$"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^rain-seabed: run\.mjs .*--scenario tools[\\/]test-bds[\\/]examples[\\/]rain-seabed\.js \(after header recipe\)/m, r.stdout);
  assert.doesNotMatch(r.stdout, /skipped/);
});
