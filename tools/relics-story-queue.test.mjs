// A story relic sent to an offline player is saved once, even when 20 ordinary relics are already waiting.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const STORY = "lantern_shard";

function saved(sim, id) {
  const raw = sim.props.get(`relics:pending:${id}`);
  return raw ? JSON.parse(raw) : undefined;
}

async function world() {
  const sim = createSim();
  await sim.load("relics_bp");
  sim.boot();
  return sim;
}

test("a story relic for an offline player with no record is saved once", async () => {
  const sim = await world();
  for (let i = 0; i < 2; i++) sim.game.deliver("realm:relic_give", JSON.stringify({ player: "offline1", relic: STORY }));
  sim.step(1);
  assert.deepEqual(saved(sim, "offline1")?.r, [STORY]);
});

test("a story relic is kept when 20 ordinary relics are waiting", async () => {
  const sim = await world();
  sim.props.set("relics:pending:offline2", JSON.stringify({ r: Array.from({ length: 20 }, () => "ember_ring"), s: 0 }));
  sim.props.set("relics:pending_idx", JSON.stringify(["offline2"]));
  sim.game.deliver("realm:relic_give", JSON.stringify({ player: "offline2", relic: STORY }));
  sim.step(1);
  const r = saved(sim, "offline2")?.r ?? [];
  assert.equal(r.filter((x) => x === STORY).length, 1);
});
