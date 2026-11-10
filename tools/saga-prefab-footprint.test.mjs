import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("../packs/saga_bp/scripts/prefabs.js", import.meta.url), "utf8").replace(
  /^import \{[^}]*\} from "@minecraft\/server";/m,
  "const BlockPermutation = {}; const LiquidType = {};",
);
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
const { CAMPS, PREFABS, blueprint, footprint, prefabInfo } = mod;

test("every prefab's blocks stay inside its footprint's height", () => {
  for (const name of [...Object.keys(PREFABS), ...Object.keys(CAMPS)]) {
    const info = prefabInfo(name);
    const below = info.below ?? 0;
    const { entries } = blueprint(name, { x: 0, y: 100, z: 0 });
    for (const e of entries) {
      if (e.y < -below || e.y > info.size.y - 1 - below) assert.fail(`${name}: block at local y ${e.y} is outside below ${below}, size.y ${info.size.y}`);
    }
  }
});

test("camp_peak's pad depth fits inside its footprint", () => {
  const { entries } = blueprint("camp_peak", { x: 0, y: 100, z: 0 });
  const lowest = Math.min(...entries.map((e) => e.y));
  const fp = footprint("camp_peak", { x: 0, y: 100, z: 0 }, 0);
  assert.ok(100 + lowest >= fp.min.y, `pad reaches y ${100 + lowest}, footprint starts at ${fp.min.y}`);
});

test("the old mine's minecart is tagged so Remove can find it", () => {
  const { entities } = blueprint("old_mine", { x: 0, y: 100, z: 0 });
  assert.ok(entities.length > 0);
  assert.ok(entities.every((en) => en.tag === "saga:prefab"));
});
