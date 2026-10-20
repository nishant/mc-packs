import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (/** @type {string} */ rel) => fs.readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");

// The scenario runs inside the game and cannot read files, so its constants are checked here against the producers.
test("admin-size-profile.js uses the Champions ceiling that elite_bp and admin_bp declare", () => {
  const scenario = read("tools/test-bds/examples/admin-size-profile.js");
  const small = Number(/const eliteSmall = (\d+);/.exec(scenario)?.[1]);
  const large = Number(/const eliteLarge = (\d+);/.exec(scenario)?.[1]);
  assert.equal(small, Number(/^\s*maxAlive: (\d+),/m.exec(read("packs/elite_bp/scripts/config.js"))?.[1]), "default maxAlive");
  assert.equal(large, Number(/pack: "elite_bp", key: "maxAlive", large: (\d+)/.exec(read("packs/admin_bp/scripts/presets.js"))?.[1]), "Large server maxAlive");
});

test("admin-size-profile.js has no Node imports (it is copied into the game)", () => {
  assert.doesNotMatch(read("tools/test-bds/examples/admin-size-profile.js"), /node:|\bimport\s/);
});
