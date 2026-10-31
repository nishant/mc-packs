// Stash's access answer (realm:access_check_result) also lists the spots whose lock is the player's own or shared
// with them, so Chest Finder's private index can show a locked chest to its owner without them opening it (audit O28).
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

test("a lock's owner and shared players get 'ours'; others are closed; no lock means neither", async () => {
  const sim = createSim();
  sim.props.set("stash:lock:minecraft:overworld:3,64,3", JSON.stringify({ o: "id-Ann", n: "Ann", s: [{ i: "id-Bob", n: "Bob" }] }));
  await sim.load("stash_bp");
  sim.boot();
  const spots = [["minecraft:overworld", 3, 64, 3], ["minecraft:overworld", 9, 64, 9]];
  const ask = (player) => {
    const before = sim.game.sent.length;
    sim.game.deliver("realm:access_check", JSON.stringify({ id: "t", player, spots }));
    const r = sim.game.sent.slice(before).find((s) => s.id === "realm:access_check_result");
    const m = JSON.parse(r.message);
    return [m.closed, m.ours];
  };
  assert.deepEqual(ask("id-Ann"), [[], [0]]);
  assert.deepEqual(ask("id-Bob"), [[], [0]]);
  assert.deepEqual(ask("id-Cy"), [[0], []]);
});
