// run.mjs --native-profile summarizes BDS's .cpuprofile: self samples by pack folder and the top functions, native
// frames included.
import assert from "node:assert/strict";
import test from "node:test";
import { cpuProfileLines, summarizeCpuProfile } from "./native-profile.mjs";

test("summarizeCpuProfile groups self samples by pack and names native frames", () => {
  const node = (/** @type {number} */ id, /** @type {string} */ fn, /** @type {string} */ url, /** @type {number} */ hits) => ({ id, hitCount: hits, callFrame: { functionName: fn, url, lineNumber: 9 } });
  const s = summarizeCpuProfile({
    startTime: 0, endTime: 2_000_000,
    nodes: [node(0, "(root)", "", 0), node(1, "System::currentTick", "map_bp/main.js", 6), node(2, "tick", "map_bp/main.js", 2), node(3, "World::getAllPlayers", "_shared/spread.js", 1), node(4, "(idle)", "", 10), node(5, "f", "build_bp/core/Coach.js", 1)],
  });
  assert.equal(s.samples, 20);
  assert.equal(s.busy, 10);
  assert.equal(s.native, 7);
  assert.equal(s.durationMs, 2000);
  assert.deepEqual(s.packs.map((p) => [p.pack, p.hits]), [["map_bp", 8], ["(other)", 1], ["build_bp", 1]]);
  assert.equal(s.functions[0].key, "System::currentTick @ map_bp/main.js");
  assert.equal(s.functions[1].key, "tick @ map_bp/main.js:10");
  assert.match(cpuProfileLines(s, "p.cpuprofile").join("\n"), /by pack: map_bp 80\.0%[\s\S]*\[native\] System::currentTick/);
});
