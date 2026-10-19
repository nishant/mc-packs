// Tornado sounds by distance band: loads the real tornado_bp scripts against a small stub of @minecraft/server, forms a
// tornado with the real /realm:tornado_spawn command and drives its real frame loop. The sounds each player hears come
// from the pack's own everySecond; nothing here calls its helpers directly.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const STUB = `
export const __h = { startup: [], intervals: [], dims: {}, worldPlaySounds: 0, props: { "tornado:cfg": JSON.stringify({ throwPlayers: false }) } };
export class InvalidEntityError extends Error {}
export class Player {}
export class Dimension {}
export class ItemStack {}
export class MolangVariableMap { setFloat() {} setVector3() {} setColorRGB() {} setColorRGBA() {} }
export const GameMode = {};
export const WeatherType = { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" };
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
const noop = () => {};
const sub = { subscribe: noop };
export const system = {
  currentTick: 0,
  run: (fn) => fn(),
  runTimeout: noop,
  runInterval(fn, ticks) { __h.intervals.push({ fn, ticks }); return __h.intervals.length; },
  clearRun: noop,
  sendScriptEvent: noop,
  beforeEvents: { startup: { subscribe: (cb) => __h.startup.push(cb) } },
  afterEvents: { scriptEventReceive: sub },
};
export const world = {
  afterEvents: new Proxy({}, { get: () => sub }),
  beforeEvents: new Proxy({}, { get: () => sub }),
  getDimension: (id) => __h.dims[id],
  getDefaultSpawnLocation: () => ({ x: 0, y: 64, z: 0 }),
  getDynamicProperty: (k) => __h.props[k],
  setDynamicProperty: (k, v) => { __h.props[k] = v; },
  getAllPlayers: () => Object.values(__h.dims).flatMap((d) => d.getPlayers()),
  playSound() { __h.worldPlaySounds++; },
};
`;

/** One fresh copy of the pack (module state is per copy) and its stub. */
async function loadPack() {
  const root = mkdtempSync(join(tmpdir(), "tornado-sound-"));
  const scripts = join(root, "tornado_bp", "scripts");
  cpSync(new URL("../packs/tornado_bp/scripts/", import.meta.url), scripts, { recursive: true });
  writeFileSync(join(scripts, "diag.js"), "");
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  for (const name of ["server", "server-ui"]) {
    const dir = join(root, "node_modules", "@minecraft", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), `{"name":"@minecraft/${name}","type":"module","main":"index.js"}`);
    writeFileSync(join(dir, "index.js"), name === "server" ? STUB : "export const ActionFormData = class {}; export const FormCancelationReason = { UserBusy: 'UserBusy' };");
  }
  const stub = await import(pathToFileURL(join(root, "node_modules", "@minecraft", "server", "index.js")).href);
  await import(pathToFileURL(join(scripts, "main.js")).href);
  return { stub, config: (await import(pathToFileURL(join(scripts, "config.js")).href)).CONFIG };
}

/** A world with an Overworld and a Nether; players are added with add(). */
function makeWorld(stub) {
  const sounds = [];
  const stops = [];
  const players = [];
  const dim = (id) => {
    const d = Object.assign(new stub.Dimension(), {
      id,
      getPlayers: () => players.filter((p) => p.dimension === d),
      getTopmostBlock: () => undefined,
      spawnParticle() {},
      playSound() { throw new Error("a dimension-wide sound would reach players who did not ask for it"); },
    });
    return d;
  };
  const overworld = dim("minecraft:overworld");
  const nether = dim("minecraft:nether");
  stub.__h.dims["minecraft:overworld"] = overworld;
  stub.__h.dims["minecraft:nether"] = nether;
  const add = (name, x, { dimension = overworld, valid = true, z = 0 } = {}) => {
    const p = Object.assign(new stub.Player(), {
      id: name,
      name,
      dimension,
      location: { x, y: 64, z },
      isValid: valid,
      getViewDirection: () => ({ x: 1, y: 0, z: 0 }),
      sendMessage() {},
      playSound(id, options) {
        if (!this.isValid) throw new stub.InvalidEntityError(`${name} is invalid`);
        sounds.push({ player: name, id, ...options });
      },
      runCommand(cmd) {
        if (!this.isValid) throw new stub.InvalidEntityError(`${name} is invalid`);
        stops.push({ player: name, cmd });
        return { successCount: 1 };
      },
    });
    if (!valid) {
      Object.defineProperty(p, "location", { get() { throw new stub.InvalidEntityError(`${name} is invalid`); } });
    }
    players.push(p);
    return p;
  };
  return { overworld, add, sounds, stops, players };
}

/** Forms a tornado 40 blocks east of the spawner with the real command; returns the loop that runs it a frame at a time. */
function spawnTornado(stub, spawner) {
  const [startup] = stub.__h.startup;
  const commands = new Map();
  startup({ customCommandRegistry: { registerCommand: (def, run) => commands.set(def.name, run) } });
  const result = commands.get("realm:tornado_spawn")({ initiator: spawner });
  assert.equal(result.status, stub.CustomCommandStatus.Success);
  const frame = stub.__h.intervals.find((i) => i.ticks === 2);
  assert.ok(frame, "the tornado's frame loop is running");
  return { frame: frame.fn, seconds(n) { for (let i = 0; i < n * 10; i++) frame.fn(); } };
}

// The tornado forms at x = 40, z = 0 (the spawner stands at 0 and looks east), so a player at x = 40 - d is d blocks away.
const at = (d) => 40 - d;
const heard = (sounds, id) => sounds.filter((s) => s.id === id);
const volumeOf = (sounds, id, player) => heard(sounds, id).find((s) => s.player === player)?.volume;

test("distance bands: players in one band hear one volume, the next band is quieter", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  w.add("a", at(9));
  w.add("b", at(15.9));
  w.add("c", at(16));
  w.add("d", at(23.9));
  spawnTornado(stub, spawner);
  const wind = config.sounds.wind;
  assert.equal(volumeOf(w.sounds, wind, "a"), volumeOf(w.sounds, wind, "b"), "9 and 15.9 blocks share the 8-16 band");
  assert.ok(volumeOf(w.sounds, wind, "c") < volumeOf(w.sounds, wind, "a"), "16 blocks is the next band, quieter");
  assert.equal(volumeOf(w.sounds, wind, "c"), volumeOf(w.sounds, wind, "d"));
});

test("distance bands: the volume still falls with distance and keeps its floor", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  for (const d of [0, 4, 20, 40, 48]) w.add(`p${d}`, at(d), { z: 0 });
  spawnTornado(stub, spawner);
  const v = (d) => volumeOf(w.sounds, config.sounds.wind, `p${d}`);
  assert.ok(v(0) > v(20) && v(20) > v(40), "louder when closer");
  assert.equal(v(48), 0.15, "the edge of the wind range is the quietest, never silent");
  assert.ok(v(0) <= 1 && v(0) > 0.9);
});

test("distance bands: each sound stops at its own range, edges included", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0, { z: 500 }); // out of range of everything; only forms the tornado
  spawner.getViewDirection = () => ({ x: 1, y: 0, z: 0 });
  // The tornado forms 40 east of the spawner: use z offsets so players sit at exact distances from (40, 500).
  const ring = (name, d) => w.add(name, 40 + d, { z: 500 });
  ring("wind48", 48);
  ring("wind48_5", 48.5);
  ring("rumble100", 100);
  ring("rumble100_5", 100.5);
  ring("horn150", 150);
  ring("horn150_5", 150.5);
  spawner.location = { x: 0, y: 64, z: 500 };
  spawnTornado(stub, spawner);
  const hears = (id, p) => heard(w.sounds, id).some((s) => s.player === p);
  assert.ok(hears(config.sounds.wind, "wind48"));
  assert.ok(!hears(config.sounds.wind, "wind48_5"));
  assert.ok(hears(config.sounds.rumble, "rumble100"));
  assert.ok(!hears(config.sounds.rumble, "rumble100_5"));
  assert.ok(hears(config.sounds.horn, "horn150"));
  assert.ok(!hears(config.sounds.horn, "horn150_5"));
  assert.ok(hears(config.sounds.horn, "wind48_5") && hears(config.sounds.rumble, "wind48_5"), "inside the wider ranges");
});

test("only Overworld players hear it; Nether players never do, and nothing is broadcast", async () => {
  const { stub } = await loadPack();
  const w = makeWorld(stub);
  const nether = stub.__h.dims["minecraft:nether"];
  const spawner = w.add("spawner", 0);
  w.add("near", at(5));
  w.add("hell", at(5), { dimension: nether });
  spawnTornado(stub, spawner).seconds(3);
  assert.ok(w.sounds.some((s) => s.player === "near"));
  assert.ok(!w.sounds.some((s) => s.player === "hell"));
  assert.ok(!w.stops.some((s) => s.player === "hell"));
  assert.equal(stub.__h.worldPlaySounds, 0, "no world-wide playSound");
});

test("each sound goes to its own listener from the tornado's direction, at a nearby spot", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  w.add("far", at(30));
  spawnTornado(stub, spawner);
  const s = heard(w.sounds, config.sounds.wind).find((x) => x.player === "far");
  assert.ok(s);
  assert.equal(s.location.x, at(30) + 6, "6 blocks from the listener toward the funnel");
  assert.equal(s.location.y, 65);
  assert.equal(s.pitch, 0.7);
  assert.ok(w.stops.some((x) => x.player === "far" && x.cmd === `stopsound @s ${config.sounds.wind}`), "the wind's own stopsound");
});

test("an invalid entity is skipped and the players after it still hear the tornado", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  w.add("gone", at(5), { valid: false });
  w.add("later", at(10));
  spawnTornado(stub, spawner);
  assert.ok(heard(w.sounds, config.sounds.wind).some((s) => s.player === "later"));
  assert.ok(heard(w.sounds, config.sounds.horn).some((s) => s.player === "later"));
  assert.ok(!w.sounds.some((s) => s.player === "gone"));
});

test("cadence: wind every 5 s, rumble every 6 s, horn every 20 s, from the first second", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  w.add("near", at(10));
  const run = spawnTornado(stub, spawner);
  const count = (id) => heard(w.sounds, id).filter((s) => s.player === "near").length;
  assert.deepEqual([count(config.sounds.wind), count(config.sounds.rumble), count(config.sounds.horn)], [1, 1, 1]);
  run.seconds(12);
  assert.equal(count(config.sounds.wind), 3, "seconds 0, 5, 10");
  assert.equal(count(config.sounds.rumble), 3, "seconds 0, 6, 12");
  assert.equal(count(config.sounds.horn), 1);
  run.seconds(8);
  assert.equal(count(config.sounds.horn), 2, "second 20");
});

test("a player who leaves the dimension between seconds stops hearing it", async () => {
  const { stub, config } = await loadPack();
  const w = makeWorld(stub);
  const spawner = w.add("spawner", 0);
  const mover = w.add("mover", at(10));
  const run = spawnTornado(stub, spawner);
  const before = heard(w.sounds, config.sounds.wind).filter((s) => s.player === "mover").length;
  mover.dimension = stub.__h.dims["minecraft:nether"];
  run.seconds(12);
  assert.equal(heard(w.sounds, config.sounds.wind).filter((s) => s.player === "mover").length, before);
});
