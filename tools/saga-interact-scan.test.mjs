import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { facesWay } from "./test-bds/examples/saga-escort.js";

const src = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const a = src.indexOf("/** Blocks one interact scan step");
const b = src.indexOf("/** Up to 4 blocks of an interact objective");
assert.ok(a >= 0 && b > a, "has the bounded scan");
const { scanInteract, interactScanStats } = runInNewContext(
  `${src.slice(a, b).replaceAll("export ", "")}\n({ scanInteract, interactScanStats })`,
  { across: (p, l) => Math.hypot(p.x - l.x, p.z - l.z) },
);

const run = (getBlock, alive = () => true) => {
  const out = { found: [], complete: false };
  const gen = scanInteract(getBlock, { x: 0.5, z: 0.5 }, 12, 64, 8, ["minecraft:lever"], out, alive);
  let steps = 0;
  const sizes = [];
  let last = interactScanStats.blocks;
  while (!gen.next().done) {
    steps++;
    sizes.push(interactScanStats.blocks - last);
    last = interactScanStats.blocks;
  }
  return { out, steps, sizes };
};

test("the interact scan is cut into small steps and counts every block it looks at", () => {
  interactScanStats.blocks = 0;
  const { out, steps, sizes } = run((p) => ({ typeId: p.x === 3 && p.y === 64 && p.z === 2 ? "minecraft:lever" : "minecraft:air" }));
  assert.ok(steps > 10, `${steps} steps`);
  assert.ok(Math.max(...sizes) <= 256, `largest step ${Math.max(...sizes)}`);
  assert.ok(interactScanStats.blocks > 5000);
  assert.deepEqual([...out.found.map((f) => [f.x, f.y, f.z])].map((r) => [...r]), [[3, 64, 2]]);
  assert.equal(out.complete, true);
});

test("an unloaded chunk makes the scan incomplete, and a cancelled scan stops at once", () => {
  assert.equal(run(() => undefined).out.complete, false);
  interactScanStats.blocks = 0;
  let calls = 0;
  const { out } = run(() => ({ typeId: "minecraft:air" }), () => ++calls < 2);
  assert.ok(interactScanStats.blocks <= 600, `${interactScanStats.blocks} blocks after cancel`);
  assert.deepEqual([...out.found], []);
});

test("a villager head turned to a close player still counts as walking the way he goes", () => {
  const move = { dx: 0.4, dz: 0 }; // east
  assert.equal(facesWay(-90, move, { dx: 3, dz: 0 }), true);
  assert.equal(facesWay(0, move, { dx: 0, dz: 3 }), true, "looking at the player south of the trail");
  assert.equal(facesWay(90, move, { dx: 3, dz: 0 }), false, "facing away from both");
});
