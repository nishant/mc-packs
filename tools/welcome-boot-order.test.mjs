// O43: in a bundle the packs run in folder order, so Chest Finder's world-load decision (it saves find:mig) happens
// before Welcome decides the world's profile. That start-up marker alone must not make a new world look old.
// Loads the real find_bp and welcome_bp into one world (one property store, bundle order).
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function bundleWorld(seed = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(seed)) sim.props.set(k, v);
  await sim.load("find_bp");
  await sim.load("welcome_bp");
  sim.boot();
  sim.game.emit("world.after.worldLoad", {});
  return sim;
}

test("O43: an empty new world is generic although Chest Finder saved find:mig first", async () => {
  const sim = await bundleWorld();
  assert.equal(sim.props.get("find:mig"), 1, "Chest Finder decided before Welcome, as in the bundle order");
  assert.equal(sim.props.get("welcome:profile"), "generic");
  assert.equal(sim.props.has("welcome:settings"), false);
});

test("O43: an older world keeps the Realm text whatever else it has beside find:mig", async () => {
  for (const seed of [{ "stats:legacy": "x" }, { "find:idx:0": "[]" }, { "mystery:key": "1" }, { "welcome:settings": JSON.stringify({ body: "Saved old body" }) }]) {
    const sim = await bundleWorld(seed);
    assert.equal(sim.props.get("welcome:profile"), "realm", JSON.stringify(seed));
  }
});

test("O43: a saved profile and saved text are never changed", async () => {
  const saved = JSON.stringify({ body: "Saved old body" });
  for (const profile of ["realm", "generic"]) {
    const sim = await bundleWorld({ "welcome:profile": profile, "welcome:settings": saved });
    assert.equal(sim.props.get("welcome:profile"), profile);
    assert.equal(sim.props.get("welcome:settings"), saved);
  }
});
