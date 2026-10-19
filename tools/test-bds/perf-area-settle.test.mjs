import assert from "node:assert/strict";
import test from "node:test";
import soak from "./examples/perf-soak.js";

test("perf population setup settles area removals before adding the next player's loader", async () => {
  let tick = 0, removalPending = false;
  const reports = [];
  const dimension = { runCommand(command) { if (command === "tickingarea remove_all") removalPending = true; } };
  const t = {
    args: { players: "1", seconds: "10", water: "0", nether: "0", commands: "0", refill: "0" },
    packs: [],
    get tick() { return tick; },
    world: { getDimension: () => dimension, getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }) },
    server() {},
    log() {},
    report(name, data) { reports.push({ name, data }); },
    assert(ok, message) { assert.ok(ok, message); },
    check(ok, message) { assert.ok(ok, message); },
    async wait(ticks) { tick += ticks; removalPending = false; },
    async player(_name, at) {
      assert.equal(removalPending, false, "a deferred remove_all must not erase the new loader in the same tick");
      return { location: { ...at, y: 70 }, isValid: true, moveToLocation() {}, lookAtLocation() {}, jump() {}, stopMoving() {} };
    },
  };
  await soak(t);
  const final = reports.at(-1).data;
  assert.equal(final.spawned, 1);
  assert.equal(final.retention.minValid, 1);
  assert.equal(final.soak.ticks, 200);
});
