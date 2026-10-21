import assert from "node:assert/strict";
import test from "node:test";
import soak from "./examples/perf-soak.js";

test("perf population cleanup removes its own loaders without deleting production pack areas", async () => {
  let tick = 0, serial = 0;
  const reports = [];
  const ledger = [];
  const areas = new Map([["realm_townhouses", "minecraft:overworld"], ["realm_farm", "minecraft:nether"]]);
  const dimensions = new Map(["overworld", "nether"].map(id => {
    const dimension = {
      id: `minecraft:${id}`,
      runCommand(command) {
        if (command === "tickingarea remove_all") {
          for (const [name, dim] of areas) if (dim === this.id) areas.delete(name);
          return { successCount: 1 };
        }
        const name = /^tickingarea remove "?([^"]+)"?$/.exec(command)?.[1];
        return { successCount: name && areas.delete(name) ? 1 : 0 };
      },
    };
    return [id, dimension];
  }));
  const t = {
    args: { players: "2", seconds: "10", water: "0", nether: "0", commands: "0", refill: "0" },
    packs: [],
    get tick() { return tick; },
    world: {
      getDimension: id => dimensions.get(id.replace("minecraft:", "")),
      getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }),
      getDynamicProperty: key => { assert.equal(key, "harness:tickingAreas"); return JSON.stringify(ledger); },
    },
    server() {},
    log() {},
    report(name, data) { reports.push({ name, data }); },
    assert(ok, message) { assert.ok(ok, message); },
    check(ok, message) { assert.ok(ok, message); },
    async wait(ticks) { tick += ticks; },
    async loadArea(_x, _z, { dimension }) {
      const name = `harness_1_${++serial}`;
      ledger.push({ name, dimension: dimension.id });
      areas.set(name, dimension.id);
      return { name };
    },
    async player(_name, at) {
      await this.loadArea(at.x, at.z, { dimension: dimensions.get(at.dimension) });
      return { location: { ...at, y: 70 }, isValid: true, moveToLocation() {}, lookAtLocation() {}, jump() {}, stopMoving() {} };
    },
  };
  await soak(t);
  const final = reports.at(-1).data;
  assert.equal(final.spawned, 2);
  assert.equal(final.retention.minValid, 2);
  assert.equal(final.soak.ticks, 200);
  assert.equal(areas.has("realm_townhouses"), true, "the production town loader must survive");
  assert.equal(areas.has("realm_farm"), true, "another dimension's production loader must survive");
  assert.equal([...areas.keys()].some(name => name.startsWith("harness_")), false, "all scenario loaders are released");
});

// F73: BDS left the chunks of an area removed while they were still loading unloadable for the rest of the run, and the
// old ramp removed each player's loader 2 ticks after its center column could be read (96 of 100 spawned). This fake
// game poisons every chunk of an area removed before it loaded whole; a spawn on a poisoned chunk fails.
test("perf population removes only whole-loaded areas, spawns each group under one loader, and ramps in waves", async () => {
  let tick = 0, serial = 0, peak = 0;
  const live = new Map(); // name -> { whole, x, z }
  const poisoned = new Set();
  const chunk = (x, z) => `${Math.floor(Math.floor(x) / 16)},${Math.floor(Math.floor(z) / 16)}`;
  const spawns = [];
  const ledger = [];
  const dimension = (id) => ({
    id: `minecraft:${id}`,
    runCommand(command) {
      const name = /^tickingarea remove "?([^"]+)"?$/.exec(command)?.[1];
      const area = name && live.get(name);
      if (!area) return { successCount: 0 };
      if (!area.whole) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) poisoned.add(chunk(area.x + dx * 16, area.z + dz * 16));
      live.delete(name);
      return { successCount: 1 };
    },
  });
  const dims = { overworld: dimension("overworld"), nether: dimension("nether") };
  const reports = [];
  const t = {
    args: { players: "100", seconds: "10", commands: "0", refill: "0" },
    packs: [],
    get tick() { return tick; },
    world: {
      getDimension: (id) => dims[id.replace("minecraft:", "")],
      getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }),
      getDynamicProperty: () => JSON.stringify(ledger),
    },
    server() {},
    log() {},
    report(name, data) { reports.push(data); },
    assert(ok, message) { assert.ok(ok, message); },
    check(ok, message) { assert.ok(ok, message); },
    async wait(ticks) { tick += ticks; },
    async waitUntil(fn) { return fn(); },
    async loadArea(x, z, { dimension = dims.overworld, whole = false } = {}) {
      const name = `harness_1_${++serial}`;
      ledger.push({ name, dimension: dimension.id });
      live.set(name, { whole, x, z });
      peak = Math.max(peak, live.size);
      tick += whole ? 60 : 20; // the center reads first, the rest of the area later
      return { name, top: { location: { y: 64 } } };
    },
    async player(name, at) {
      if (at.area !== false) await this.loadArea(at.x, at.z);
      if (poisoned.has(chunk(at.x, at.z))) throw new Error(`chunk at ${at.x},${at.z} did not load in 400 ticks`);
      spawns.push({ name, at });
      tick += at.settle ?? 10;
      return { location: { x: at.x, y: 64, z: at.z }, isValid: true, moveToLocation() {}, lookAtLocation() {}, jump() {}, stopMoving() {} };
    },
  };
  await soak(t);
  const final = reports.at(-1);
  assert.equal(final.spawned, 100);
  assert.deepEqual([final.kinds.water, final.kinds.nether], [2, 2]);
  assert.equal(poisoned.size, 0, "no area was removed before it had loaded whole");
  assert.ok(spawns.every((s) => s.at.area === false), "every player spawns under a loader that is already there");
  assert.ok(peak <= 6, `at most 4 group loaders plus the pool and the Nether pocket at once (peak ${peak})`);
  assert.ok(serial <= 22, `one loader per group, the pool and the pocket (${serial})`);
  assert.equal(live.size, 0, "every loader is released before the soak");
});
