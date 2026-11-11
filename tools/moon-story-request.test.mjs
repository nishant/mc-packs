// Blood Moon story requests (moon_bp, MCP-244): a realm:sky_request must respect an operator's choice for tonight
// (even an ordinary moon) and "never two moon nights in a row". Runs the REAL packs/moon_bp/scripts/main.js against
// tools/lib/pack-sim.mjs with a minimal fake world; the saved night (moon:night) carries `op` and `p`.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

/** Load the pack at `time` of day `day` with a saved night; returns a way to send a request and read the night. @param {{ time: number, day: number, night: object }} o */
async function load({ time, day, night }) {
  const sim = createSim();
  const g = { time, day };
  let server;
  Object.defineProperty(sim, "server", {
    configurable: true,
    get: () => server,
    set(v) {
      server = v;
      const dim = { id: "minecraft:overworld", getEntities: () => [], getPlayers: () => [] };
      Object.assign(v.world, { getDimension: () => dim, getMoonPhase: () => 1, getDay: () => g.day, getTimeOfDay: () => g.time });
    },
  });
  sim.props.set("moon:night", JSON.stringify(night));
  await sim.load("moon_bp");
  sim.game.emit("world.after.worldLoad");
  sim.step(20);
  const request = (kind = "blood_moon") => {
    sim.game.emit("system.after.scriptEventReceive", { id: "realm:sky_request", message: JSON.stringify({ kind, from: "test" }), sourceType: "Server" });
    sim.step(20);
  };
  const saved = () => JSON.parse(sim.props.get("moon:night"));
  return { sim, request, saved, story: () => sim.props.get("moon:story") };
}

test("an operator's ordinary moon tonight refuses a story request", async () => {
  const t = await load({ time: 14000, day: 5, night: { d: 5, s: "normal", a: 1, alive: [], op: 1 } });
  t.request();
  assert.equal(t.saved().s, "normal");
  assert.equal(t.story(), undefined);
});

test("a Blood Moon last night refuses a request after dusk tonight", async () => {
  const t = await load({ time: 14000, day: 6, night: { d: 6, s: "normal", a: 1, alive: [], p: { d: 5, s: "blood" } } });
  t.request();
  assert.equal(t.saved().s, "normal");
  assert.equal(t.story(), undefined);
});

test("a plain night after a normal night accepts a request", async () => {
  const t = await load({ time: 14000, day: 6, night: { d: 6, s: "normal", a: 1, alive: [], p: { d: 5, s: "normal" } } });
  t.request();
  assert.equal(t.saved().s, "blood");
  assert.equal(t.saved().op, undefined);
  assert.deepEqual(t.saved().p, { d: 5, s: "normal" });
  assert.equal(t.story(), 6);
});
