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
  /**
   * area name -> tick its middle chunk can be read: an area saved with the world loads over the first second of the run.
   * As in BDS 1.26.52, an area loads the whole square of (2r + 1)^2 chunks around its middle, the middle first and each
   * ring of chunks further out 3 ticks later; and a chunk still loading when the last area over it is removed can never
   * be loaded again in this run (F73: "chunk at x,z did not load in 400 ticks" for every area added over it later).
   */
  const readyAt = new Map(saved.areas.map((a) => [a.name, startedAt + 30]));
  /** @type {Set<string>} chunks that will never load again in this run */
  const stuck = new Set();
  const commands = [];
  const players = [];
  const chunkOf = (v) => Math.floor(v / 16);
  const ring = (a, cx, cz) => Math.max(Math.abs(cx - chunkOf(a.x)), Math.abs(cz - chunkOf(a.z)));
  const chunkReady = (a, cx, cz) => ring(a, cx, cz) <= a.radius && (readyAt.get(a.name) ?? Infinity) + 3 * ring(a, cx, cz) <= game.tick;
  // A chunk can be read a few ticks before it is done: removed in between, it is stuck all the same (on BDS, spawns a
  // chunk over failed when the area went 2 ticks after its last chunk could be read, never 10 or more ticks after).
  const chunkDone = (a, cx, cz) => chunkReady(a, cx, cz) && (readyAt.get(a.name) ?? Infinity) + 3 * ring(a, cx, cz) + 5 <= game.tick;
  const loaded = (x, z) => {
    const cx = chunkOf(x), cz = chunkOf(z);
    return !stuck.has(`${cx},${cz}`) && saved.areas.some((a) => chunkReady(a, cx, cz));
  };
  /** Removing an area: its chunks that it had not finished loading, and no other area has, are stuck. */
  const removing = (gone) => {
    const others = saved.areas.filter((a) => a !== gone);
    for (let dx = -gone.radius; dx <= gone.radius; dx++)
      for (let dz = -gone.radius; dz <= gone.radius; dz++) {
        const cx = chunkOf(gone.x) + dx, cz = chunkOf(gone.z) + dz;
        if (!chunkDone(gone, cx, cz) && !others.some((a) => chunkDone(a, cx, cz))) stuck.add(`${cx},${cz}`);
      }
  };

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
        removing(saved.areas[i]);
        saved.areas.splice(i, 1);
        return { successCount: 1 };
      }
      if (command === "tickingarea remove_all") {
        const n = saved.areas.length;
        for (const a of [...saved.areas]) removing(a);
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
  return { game, system: game.system, world, gametest, harnessUrl, saved, commands, players, stuck };
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
  return { done, out, logs, commands: server.commands, areas: saved.areas.map((a) => a.name), stuck: [...server.stuck] };
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
  const two = await runPhase(saved, RESTART_SCENARIO, 2);
  assert.equal(two.done.ok, true, two.done.msg);
  assert.equal(two.done.restart, false);
});

test("the same, when phase 1's areas could not be removed and are saved with the world", async () => {
  const saved = savedWorld({ failRemove: ["harness_1_1", "harness_1_2"] });
  const one = await runPhase(saved, RESTART_SCENARIO, 1);
  assert.equal(one.done.ok, true, one.done.msg);
  assert.equal(one.done.restart, true);
  assert.ok(saved.areas.length >= 2, "phase 1's areas are saved with the world");
  saved.failRemove.clear();
  const two = await runPhase(saved, RESTART_SCENARIO, 2);
  assert.equal(two.done.ok, true, two.done.msg);
  assert.equal(two.done.restart, false);
  assert.ok(two.logs.some((l) => /ticking areas from earlier phases removed: harness_1_1, harness_1_2/.test(l)), two.logs.join("\n"));
});

// BDS: an earlier phase's area removed at the start of the next run, while its chunks were still loading from the save,
// left those chunks unloadable for the whole run (atlas phase 2). A phase that asks for a restart removes its own areas
// first, while their chunks are loaded, and saves an empty list.
test("a phase that asks for a restart removes its own areas before it ends", async () => {
  const saved = savedWorld();
  saved.areas.push({ name: "pool", x: 900, z: 900, radius: 1 });
  const one = await runPhase(saved, RESTART_SCENARIO, 1);
  assert.equal(one.done.restart, true);
  assert.deepEqual(saved.areas.map((a) => a.name), ["pool"], "only the scenario's own area is saved with the world");
  assert.equal(saved.props.has("harness:tickingAreas"), false, "nothing is left for the next phase to remove");
  assert.ok(one.logs.some((l) => /this phase's ticking areas \(before the restart\) removed: harness_1_1, harness_1_2/.test(l)), one.logs.join("\n"));
  const removeAt = one.out.findIndex((o) => o.type === "log" && /before the restart/.test(o.msg));
  assert.ok(removeAt >= 0 && removeAt < one.out.findIndex((o) => o.type === "done"), "removed before the phase reports done");
  const last = await runPhase(saved, RESTART_SCENARIO, 2);
  assert.equal(last.done.ok, true, last.done.msg);
  assert.ok(last.areas.some((n) => n.startsWith("harness_2_")), "a phase that ends without a restart keeps its areas until the next run");
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

// BDS answers "tickingarea remove" of an area that is no longer there with no success, the same as a refusal. An area
// that is gone (a scenario's "/tickingarea remove_all") gets one retry at the next phase's start, then leaves the list.
test("an area that is already gone is tried once more at the next start, then dropped, not retried every phase", async () => {
  const saved = savedWorld();
  const scenario = `export default async function (t) {
    if (t.phase === 1) {
      const a = await t.player("Ann");
      await t.loadArea(a.location.x + 30, a.location.z, { radius: 1 });
      t.server("/tickingarea remove_all");
    }
    if (t.phase < 3) t.restart("again");
  }`;
  const one = await runPhase(saved, scenario, 1);
  assert.equal(one.done.restart, true);
  assert.ok(one.logs.some((l) => /could not remove harness_1_1/.test(l)), one.logs.join("\n"));
  assert.match(String(saved.props.get("harness:tickingAreas")), /harness_1_1/, "kept for one retry");
  const two = await runPhase(saved, scenario, 2);
  assert.ok(two.logs.some((l) => /no more tries for harness_1_1, harness_1_2/.test(l)), two.logs.join("\n"));
  assert.equal(saved.props.has("harness:tickingAreas"), false, "dropped after the retry");
  const three = await runPhase(saved, scenario, 3);
  assert.equal(three.done.ok, true, three.done.msg);
  assert.deepEqual(three.commands.filter((c) => c.startsWith("tickingarea remove ")), [], "no third try");
  assert.equal(three.logs.some((l) => /ticking area cleanup/.test(l)), false, three.logs.join("\n"));
});

test("a rejected add of a name the game never saw is still a hard failure with the game's message", async () => {
  const saved = savedWorld();
  for (let i = 0; i < MAX_AREAS; i++) saved.areas.push({ name: `other_${i}`, x: 5000 + i * 100, z: 5000, radius: 1 });
  const r = await runPhase(saved, `export default async function (t) { await t.loadArea(163, 170, { radius: 2 }); }`, 1);
  assert.equal(r.done.ok, false);
  assert.match(r.done.msg, /tickingarea add circle 163 0 170 2 failed/);
});

// F73/F75: the perf soak and saga-perf-quests remove each spawn's ticking area right after the spawn (Bedrock allows
// 10). loadArea used to return once the middle chunk could be read, while the rest of the area was still loading, so
// that removal left those chunks unloadable for the whole run, and the next player's spawn a chunk over failed with
// "chunk at 193,170 did not load in 400 ticks" (every row of saga-perf-quests at x 193-207 in one run).
test("an area removed right after loadArea returns leaves no chunk unloadable, so the next spawn a chunk over loads", async () => {
  const saved = savedWorld();
  const scenario = `export default async function (t) {
    const clear = () => {
      for (const a of JSON.parse(t.world.getDynamicProperty("harness:tickingAreas") ?? "[]")) t.dimension.runCommand("tickingarea remove " + a.name);
    };
    let made = 0;
    for (let i = 0; i < 10; i++) {
      clear();
      try { await t.player("P" + i, { x: 163 + 6 * (i % 5), z: 170 + 6 * Math.floor(i / 5), settle: 2 }); made++; }
      catch (e) { t.log("could not spawn P" + i + ": " + e.message); }
    }
    clear();
    t.assert(made === 10, "spawned " + made + " of 10");
  }`;
  const r = await runPhase(saved, scenario, 1);
  assert.equal(r.done.ok, true, `${r.done.msg}\n${r.logs.join("\n")}`);
  assert.deepEqual(r.stuck, [], "no chunk was left loading when its area was removed");
});

test("loadArea fails with the chunks it waited for when the rest of its area never loads", async () => {
  const saved = savedWorld();
  const scenario = `export default async function (t) {
    t.dimension.runCommand("tickingarea add circle 200 0 170 1 other true");
    t.dimension.runCommand("tickingarea remove other");
    await t.loadArea(163, 170, { radius: 2, timeout: 100 });
  }`;
  const r = await runPhase(saved, scenario, 1);
  assert.equal(r.done.ok, false);
  assert.deepEqual(r.stuck.length, 9, "the other area's 9 chunks are stuck");
  assert.match(r.done.msg, /chunk at 163,170 loaded, but 6 of the 25 chunks of its ticking area harness_1_1 did not load in 100 ticks/);
});
