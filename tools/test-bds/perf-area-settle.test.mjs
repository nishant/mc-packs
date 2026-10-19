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
