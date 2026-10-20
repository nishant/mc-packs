// Town Projects' placed-block cells (packs/town_bp/scripts/placed.js): natural-kind blocks players place in a town
// are kept as 4 x 4 x 4 cells (packed, 5,000 at most, then the town is marked full and never levels), and the scan
// avoids them. Also checks main.js's wiring: playerPlaceBlock marks only natural kinds inside a town, and
// realm:blocks_placed is accepted.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CELL, MAX_CELLS, PER_PROP, addCell, boxCells, cellOf, decodeCells, encodeCells, loadCells, saveParts, touches } from "../packs/town_bp/scripts/placed.js";

const center = { x: 100, z: -40 };

test("cells: packed relative to the town's center, 4 characters each", () => {
  const a = cellOf(center, 100, 64, -40);
  assert.ok(a >= 0);
  assert.equal(cellOf(center, 103, 67, -37), a, "the same 4 x 4 x 4 cell");
  assert.notEqual(cellOf(center, 104, 64, -40), a);
  assert.notEqual(cellOf(center, 100, 68, -40), a);
  assert.ok(cellOf(center, 100 + 256, 64, -40) >= 0 && cellOf(center, 100 - 256, -64, -40 + 256) >= 0, "the whole of a 256-block town");
  assert.ok(cellOf(center, 319, 319, -40) >= 0);
  assert.equal(cellOf(center, 100 + 300, 64, -40), -1, "too far");
  assert.equal(cellOf(center, 100, 400, -40), -1);
  const list = [a, cellOf(center, 356, 319, 216), cellOf(center, -156, -64, -296)];
  const s = encodeCells(list);
  assert.equal(s.length, 12);
  assert.deepEqual(decodeCells(s), list);
  assert.deepEqual(decodeCells("zz!!0000"), [0], "damaged chunks are skipped");
  assert.deepEqual(decodeCells(undefined), []);
});

test("bound: 5,000 cells over two properties, then the oldest go and the town is full", () => {
  const c = loadCells([], false);
  for (let i = 0; i < MAX_CELLS; i++) assert.ok(addCell(c, i));
  assert.equal(c.full, false);
  assert.equal(addCell(c, 7), false, "a cell already marked");
  const [p0, p1] = saveParts(c);
  assert.equal(p0.length, PER_PROP * 4);
  assert.equal(p1.length, PER_PROP * 4);
  assert.ok(p0.length < 30000 && p1.length < 30000, "each property stays far under the 32 KB limit");
  addCell(c, MAX_CELLS + 1);
  assert.equal(c.full, true, "full");
  assert.equal(c.list.length, MAX_CELLS);
  assert.ok(!c.set.has(0), "the oldest was dropped");
  const back = loadCells(saveParts(c), c.full);
  assert.deepEqual(back.list, c.list);
  assert.equal(back.full, true);
  assert.equal(loadCells([encodeCells([5, 5, 6])], false).list.length, 2, "duplicates read once");
});

test("boxes: realm:blocks_placed boxes, bounded; touches", () => {
  const cells = boxCells(center, [100, 64, -40, 107, 71, -33]);
  assert.equal(cells.length, 8, "2 x 2 x 2 cells");
  assert.equal(boxCells(center, [0, -64, 0, 4000, 319, 4000]), undefined, "a huge box: too many cells");
  const c = loadCells([], false);
  for (const n of cells) addCell(c, n);
  assert.ok(touches(c, center, { x1: 106, z1: -36, x2: 120, z2: -20 }, 60, 66));
  assert.ok(!touches(c, center, { x1: 108, z1: -36, x2: 120, z2: -20 }, 60, 66), "the next cell over");
  assert.ok(!touches(c, center, { x1: 100, z1: -40, x2: 101, z2: -39 }, 72, 90), "above");
  assert.ok(!touches(undefined, center, { x1: 0, z1: 0, x2: 1, z2: 1 }, 0, 1));
  assert.equal(CELL, 4);
});

test("main.js: natural kinds and wild plants placed inside a town are marked, and other packs can report boxes", () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
  const handler = main.slice(main.indexOf("world.afterEvents.playerPlaceBlock.subscribe"));
  assert.ok(handler.length > 0, "playerPlaceBlock is subscribed");
  assert.match(handler.slice(0, 600), /NATURAL\.has\(/, "only natural kinds (the rest is man-made anyway)");
  // Wild plants too: a flower bed looks like wild ground to the scan, and builds and paths would remove it (F40 review).
  assert.match(handler.slice(0, 600), /!NATURAL\.has\(block\.typeId\) && !WILD\.has\(block\.typeId\)/, "and wild plants");
  assert.match(main, /"realm:blocks_placed"/);
  assert.match(main, /town:pl:/);
});
