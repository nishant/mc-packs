// Town Projects' built-in designs (packs/town_bp/scripts/designs.js): the 7 existing designs must keep exactly the
// blocks and footprints they had before they moved out of main.js, because saved spots keep the box they covered
// (`b`) and the structure snapshot of the ground under it. The expected values were read from the int23 main.js.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BUILDS, design, designFootprint, localBox, toWorld } from "../packs/town_bp/scripts/designs.js";

const EXPECTED = {
  well: { n: 83, min: { x: -2, y: -2, z: 1 }, max: { x: 2, y: 3, z: 5 }, hash: "67df80bb7229b097" },
  lamps: { n: 16, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 3, z: 12 }, hash: "e78890e193c7a9bb" },
  stall: { n: 32, min: { x: -2, y: 0, z: 1 }, max: { x: 2, y: 3, z: 3 }, hash: "8afc5daed1f26b93" },
  bell_tower: { n: 32, min: { x: -1, y: 0, z: 1 }, max: { x: 1, y: 7, z: 3 }, hash: "7635af9a4bbeb166" },
  dock: { n: 100, min: { x: -1, y: -9, z: 1 }, max: { x: 1, y: 1, z: 10 }, hash: "c015e40070fc975b" },
  garden: { n: 35, min: { x: -2, y: -2, z: 1 }, max: { x: 2, y: 0, z: 5 }, hash: "51ceb2d2ab72fa5f" },
  notice_board: { n: 20, min: { x: -2, y: 0, z: 0 }, max: { x: 2, y: 3, z: 1 }, hash: "f9d117954026bd0b" },
};

test("the 7 designs keep their blocks and local boxes", () => {
  assert.deepEqual([...BUILDS].sort(), Object.keys(EXPECTED).sort());
  for (const kind of BUILDS) {
    const places = design(kind);
    const box = localBox(kind);
    const hash = crypto.createHash("sha256").update(JSON.stringify(places)).digest("hex").slice(0, 16);
    assert.deepEqual({ n: places.length, min: box.min, max: box.max, hash }, EXPECTED[kind], kind);
  }
});

test("world footprints turn with the spot and match the old formula", () => {
  const spot = { x: 100, y: 64, z: -40 };
  for (const kind of BUILDS) {
    const lb = EXPECTED[kind];
    for (let f = 0; f < 4; f++) {
      const s = { ...spot, f };
      const a = toWorld(s, lb.min.x, lb.min.y, lb.min.z);
      const b = toWorld(s, lb.max.x, lb.max.y, lb.max.z);
      const want = {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
      };
      assert.deepEqual(designFootprint(kind, s), want, `${kind} f${f}`);
      // Every block of the design is inside its footprint.
      const fp = designFootprint(kind, s);
      for (const pl of design(kind)) {
        const w = toWorld(s, pl.x, pl.y, pl.z);
        assert.ok(w.x >= fp.min.x && w.x <= fp.max.x && w.y >= fp.min.y && w.y <= fp.max.y && w.z >= fp.min.z && w.z <= fp.max.z, `${kind} f${f} block inside`);
      }
    }
  }
  // A well facing south at the spot covers x 98..102, y 62..67, z -39..-35 (as built before the move).
  assert.deepEqual(designFootprint("well", { ...spot, f: 0 }), { min: { x: 98, y: 62, z: -39 }, max: { x: 102, y: 67, z: -35 } });
});

test("main.js uses designs.js instead of its own copy", () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
  assert.match(main, /from "\.\/designs\.js"/);
  assert.doesNotMatch(main, /^function design\(/m);
  assert.doesNotMatch(main, /^function localBox\(/m);
  const designs = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "designs.js"), "utf8");
  assert.doesNotMatch(designs, /@minecraft\//, "designs.js runs in node");
});
