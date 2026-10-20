// The real testpack/scripts/harness.js run in node against a fake game whose ticking areas and saved properties
// outlive a "server restart" the way BDS's do (a world's ticking areas are saved with it). The failure this pins came
// from native runs: after t.restart() a phase's first t.player() reused the name harness_1 for the area the previous
// phase had added, the game refused the add ("the command did not succeed") and the fail-fast loadArea reported it
// before the persisted area's chunks were readable.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createGame, dataUrl, readText, rewriteImports } from "./fake-game.mjs";

const harnessSource = readText(new URL("../testpack/scripts/harness.js", import.meta.url));
const tickingAreaUrl = new URL("./tickingarea.js", import.meta.url).href;
const MAX_AREAS = 10;

/** What BDS keeps between two runs of one world. */
function savedWorld({ failRemove = [], throwOnRemove = false } = {}) {
  return { props: new Map(), areas: [], failRemove: new Set(failRemove), throwOnRemove, runs: 0 };
}

const block = (x, y, z, typeId = "minecraft:grass_block") => ({
  typeId,
  location: { x, y, z },
  isSolid: true,
  below: () => block(x, y - 1, z, "minecraft:dirt"),
});

/** One server run: a fresh game and module state on top of the saved world. */
function startServer(saved, scenarioSource) {
  const game = createGame();
  saved.runs++;
  const startedAt = 0;
  /** area name -> tick its chunks can be read: an area saved with the world loads over the first second of the run */
  const readyAt = new Map(saved.areas.map((a) => [a.name, startedAt + 30]));
  const commands = [];
  const players = [];
  const chunkOf = (v) => Math.floor(v / 16);
  const loaded = (x, z) =>
    saved.areas.some((a) => (readyAt.get(a.name) ?? Infinity) <= game.tick && Math.hypot(chunkOf(x) - chunkOf(a.x), chunkOf(z) - chunkOf(a.z)) <= a.radius);

  const dimension = {
    id: "minecraft:overworld",
    runCommand(command) {
      commands.push(command);
      const add = /^tickingarea add circle (-?\d+) (-?\d+) (-?\d+) (\d+) (\S+)(?: (true|false))?$/.exec(command);
      if (add) {
        const [, x, , z, radius, name] = add;
        if (saved.areas.some((a) => a.name === name) || saved.areas.length >= MAX_AREAS) return { successCount: 0 };
        saved.areas.push({ name, x: Number(x), z: Number(z), radius: Number(radius) });
        readyAt.set(name, game.tick + 4);
        return { successCount: 1 };
      }
      const remove = /^tickingarea remove (\S+)$/.exec(command);
      if (remove) {
        if (saved.throwOnRemove) throw new Error("CommandError: tickingarea remove blew up");
        const i = saved.areas.findIndex((a) => a.name === remove[1]);
        if (i < 0 || saved.failRemove.has(remove[1])) return { successCount: 0 };
        saved.areas.splice(i, 1);
        return { successCount: 1 };
      }
      if (command === "tickingarea remove_all") {
        const n = saved.areas.length;
        saved.areas.length = 0;
        return { successCount: n ? 1 : 0 };
      }
      return { successCount: 1 };
    },
    getTopmostBlock({ x, z }) {
      if (!loaded(x, z)) throw new Error("LocationInUnloadedChunkError");
      return block(x, 69, z);
    },
    getBlock({ x, y, z }) {
      return loaded(x, z) ? block(x, y, z) : undefined;
    },
  };
  const world = {
    getDimension: () => dimension,
    getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }),
    getDynamicProperty: (key) => saved.props.get(key),
    setDynamicProperty(key, value) {
      if (value === undefined) saved.props.delete(key);
      else saved.props.set(key, value);
    },
    beforeEvents: game.group("world.before"),
    afterEvents: game.group("world.after"),
  };
  const gametest = {
    spawnSimulatedPlayer({ x, y, z }, name) {
      const player = { name, location: { x, y, z }, dimension };
      players.push(player);
      return player;
    },
  };
  // A data URL is one module for as long as its text is the same: every run needs its own copies.
  const unique = `${Math.random()}`;
  const serverUrl = dataUrl(
    `const g = globalThis.__fakeHarnessGame; export const world = g.world; export const system = g.system; export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" }; export const CommandPermissionLevel = { Any: 0, GameDirectors: 1 };\n// ${unique}`,
  );
  const gametestUrl = dataUrl(`const g = globalThis.__fakeHarnessGame; export const spawnSimulatedPlayer = (...a) => g.gametest.spawnSimulatedPlayer(...a);\n// ${unique}`);
  const scenarioUrl = dataUrl(`${scenarioSource}\n// ${unique}`);
  const harnessUrl = dataUrl(
    `${rewriteImports(harnessSource, { stubs: { "@minecraft/server": serverUrl, "@minecraft/server-gametest": gametestUrl }, relative: { "./scenario.js": scenarioUrl, "./tickingarea.js": tickingAreaUrl } })}\n// ${unique}`,
  );
  return { game, system: game.system, world, gametest, harnessUrl, saved, commands, players };
}

/** Runs one phase of the scenario on the saved world and returns what the harness reported. */
async function runPhase(saved, scenarioSource, phase) {
  const server = startServer(saved, scenarioSource);
  globalThis.__fakeHarnessGame = server;
  const out = [];
  const realWarn = console.warn;
  console.warn = (...args) => {
    const text = args.join(" ");
    if (text.startsWith("HARNESS ")) out.push(JSON.parse(text.slice(8)));
    else realWarn(...args);
  };
  try {
    await import(server.harnessUrl);
    server.game.step(2);
    server.game.deliver("harness:start", JSON.stringify({ phase, args: {}, packs: [] }));
    await server.game.until(() => out.some((o) => o.type === "done"));
  } finally {
    console.warn = realWarn;
  }
  const done = out.find((o) => o.type === "done");
  assert.ok(done, `phase ${phase} never finished: ${JSON.stringify(out.slice(-3))}`);
  const logs = out.filter((o) => o.type === "log").map((o) => o.msg);
  return { done, out, logs, commands: server.commands, areas: saved.areas.map((a) => a.name) };
}

const RESTART_SCENARIO = `export default async function (t) {
  const a = await t.player("Ann");
  await t.loadArea(a.location.x + 30, a.location.z, { radius: 1 });
  if (t.phase < Number(t.args.phases ?? 2)) t.restart("again");
  t.log("last phase " + t.phase);
}`;

test("a phase that starts after a physical restart can t.player at the same spot again", async () => {
  const saved = savedWorld();
  const one = await runPhase(saved, RESTART_SCENARIO, 1);
  assert.equal(one.done.ok, true, one.done.msg);
  assert.equal(one.done.restart, true);
  assert.ok(saved.areas.length >= 2, "phase 1's areas are saved with the world");
  const two = await runPhase(saved, RESTART_SCENARIO, 2);
  assert.equal(two.done.ok, true, two.done.msg);
  assert.equal(two.done.restart, false);
});

test("the areas of earlier phases are removed, nothing else, and the world never fills up over many restarts", async () => {
  const saved = savedWorld();
  const scenario = `export default async function (t) {
    const a = await t.player("Ann");
    await t.loadArea(a.location.x + 30, a.location.z, { radius: 1 });
    await t.loadArea(a.location.x - 30, a.location.z, { radius: 3 });
    if (t.phase === 1) t.server("/tickingarea add circle 900 0 900 1 pool true");
    if (t.phase < 6) t.restart("again");
  }`;
  for (let phase = 1; phase <= 6; phase++) {
    const r = await runPhase(saved, scenario, phase);
    assert.equal(r.done.ok, true, `phase ${phase}: ${r.done.msg}`);
    assert.ok(r.areas.includes("pool"), `phase ${phase}: the scenario's own area stays`);
    assert.ok(saved.areas.length <= 4, `phase ${phase}: ${r.areas.join(", ")}`);
    assert.deepEqual(
      r.areas.filter((n) => n !== "pool" && !n.startsWith(`harness_${phase}_`)),
      [],
      `phase ${phase}: only this phase's own areas remain`,
    );
  }
});

test("only names it added itself are removed, however the saved list was edited or damaged", async () => {
  const scenario = `export default async function (t) { await t.player("Ann"); }`;
  const here = "minecraft:overworld";
  const cases = [
    { raw: JSON.stringify([{ name: "pool", dimension: here }, { name: "harness_1_1", dimension: here }, { name: "harness_9_9;stop", dimension: here }]), logs: [/refused .*pool/, /refused .*harness_9_9;stop/], removed: ["harness_1_1"] },
    { raw: "{ not json", logs: [/not valid JSON/], removed: [] },
    { raw: JSON.stringify({ name: "pool" }), logs: [/not a list/], removed: [] },
    { raw: JSON.stringify([null, 7, { name: 5 }, { name: "harness_1_1", dimension: "minecraft:elsewhere" }]), logs: [/refused null/, /refused 7/, /refused \{"name":5\}/, /refused .*minecraft:elsewhere/], removed: [] },
  ];
  for (const { raw, logs, removed } of cases) {
    const saved = savedWorld();
    saved.areas.push({ name: "pool", x: 900, z: 900, radius: 1 }, { name: "harness_1_1", x: 163, z: 170, radius: 2 });
    saved.props.set("harness:tickingAreas", raw);
    const r = await runPhase(saved, scenario, 2);
    assert.equal(r.done.ok, true, `${raw}: ${r.done.msg}`);
    assert.ok(r.areas.includes("pool"), `${raw}: an area the harness never added is kept`);
    assert.deepEqual(r.commands.filter((c) => c.startsWith("tickingarea remove")), removed.map((n) => `tickingarea remove ${n}`), `${raw}: only valid names are removed`);
    for (const pattern of logs) assert.ok(r.logs.some((l) => pattern.test(l)), `${raw}: reported ${pattern}\n${r.logs.join("\n")}`);
    assert.equal(r.areas.includes("harness_1_1"), !removed.includes("harness_1_1"), `${raw}: harness_1_1`);
    assert.equal(saved.props.has("harness:tickingAreas"), true, "the new phase's own list is saved");
  }
});
test("a removal the game rejects or throws on is reported with its reason, and the run goes on", async () => {
  for (const mode of [{ failRemove: ["harness_1_1"] }, { throwOnRemove: true }]) {
    const saved = savedWorld(mode);
    const scenario = `export default async function (t) { await t.player("Ann"); if (t.phase === 1) t.restart("again"); }`;
    const one = await runPhase(saved, scenario, 1);
    assert.equal(one.done.restart, true);
    const two = await runPhase(saved, scenario, 2);
    assert.equal(two.done.ok, true, two.done.msg);
    assert.ok(two.logs.some((l) => /could not remove harness_1_1/.test(l)), two.logs.join("\n"));
    assert.ok(two.logs.some((l) => (mode.throwOnRemove ? /blew up/ : /did not succeed/).test(l)), two.logs.join("\n"));
  }
});

test("a rejected add of a name the game never saw is still a hard failure with the game's message", async () => {
  const saved = savedWorld();
  for (let i = 0; i < MAX_AREAS; i++) saved.areas.push({ name: `other_${i}`, x: 5000 + i * 100, z: 5000, radius: 1 });
  const r = await runPhase(saved, `export default async function (t) { await t.loadArea(163, 170, { radius: 2 }); }`, 1);
  assert.equal(r.done.ok, false);
  assert.match(r.done.msg, /tickingarea add circle 163 0 170 2 failed/);
});
