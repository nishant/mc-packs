// HUD-38: the world's "Markers update every (ticks)" option (intervalTicks) sets the pass interval once the world loads;
// it used to be read from config.js only, so the Realm Configuration option did nothing even after a restart.
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./map-movement-fixture.mjs";

test("the saved intervalTicks setting is the pass interval after the world loads (HUD-38)", () => {
  const f = fixture(1);
  assert.equal(f.api.passInterval(), 10, "config.js's default before the world's settings can be read");
  f.config.intervalTicks = 30; // what the settings helper returns for the world's saved choice
  f.emit("worldLoad");
  assert.equal(f.api.passInterval(), 30);
});

test("an interval under 10 ticks is raised to 10 (HUD-38)", () => {
  const f = fixture(1);
  f.config.intervalTicks = 2;
  f.emit("worldLoad");
  assert.equal(f.api.passInterval(), 10);
});
