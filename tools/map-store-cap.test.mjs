// A terrain store at or over its cap (HUD-29, HUD-07): evicting far, old columns must not switch a walking viewer's
// planner to the full plan; a store over its cap takes new columns and goes back under it in batches; idle stores
// are freed; non-operators' manual scans are capped.
import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./map-movement-fixture.mjs";
import { SPEED } from "../packs/map_bp/scripts/map-profile.js";
import { COL, TRIM_BATCH, TerrainWorld, colKey } from "../packs/map_bp/scripts/terrain.js";
import { MANUAL_SCAN_MAX_RADIUS } from "../packs/map_bp/scripts/terrain-work.js";

const OW = "minecraft:overworld";
const stone = { kind: "stone", y: 64, depth: 0 };

test("at the store cap a walking viewer keeps the rolling planner (HUD-29)", () => {
  const f = fixture(1, { profile: SPEED });
  f.emit("worldLoad");
  const p = f.roster[0];
  f.context.setFor(p, "radar", true);
  const terrain = f.api.terrain, store = terrain.store(OW);
  // The store is full of old columns far behind the viewer (the first 280 blocks of a journey).
  for (let i = 0; store.cols.size < 6000; i++) terrain.put(store, 20001 + 2 * (i % 100), 1 + 2 * Math.floor(i / 100), stone, 0, COL);
  let full = 0;
  const set = f.api.labPlans.set.bind(f.api.labPlans);
  f.api.labPlans.set = (k, v) => { full++; return set(k, v); };
  const demandBefore = store.demandVer;
  for (let tick = 1; tick <= 600; tick++) {
    p.state.at = { ...p.state.at, x: p.state.at.x + 0.25 };
    f.scan(tick);
  }
  assert.ok(store.demandVer > demandBefore, "the walk evicted old columns (the store is at its cap)");
  assert.ok(store.cols.size <= terrain.maxCols, "the store stays at its cap");
  // 150 blocks walked: the rolling path carries the plan; a handful of full plans (the first, a rerank) is fine.
  assert.ok(full <= 12, `full plans while walking at the cap: ${full}`);
});

test("a store over its cap takes new columns and trims back under it in batches (HUD-07)", () => {
  const w = new TerrainWorld(3000), s = w.store(OW);
  for (let i = 0; s.cols.size < 3000; i++) w.put(s, 1 + 2 * (i % 100), 1 + 2 * Math.floor(i / 100), stone, 1, COL);
  w.maxCols = 1000; // a scan ended or players left
  assert.equal(w.makeRoom(s, 9001, 9001, COL, 2), true, "a new column is admitted at once");
  w.put(s, 9001, 9001, stone, 2, COL);
  assert.ok(s.cols.has(colKey(9001, 9001, COL)));
  let ticks = 0;
  while (s.cols.size > w.maxCols && ticks < 100) { assert.ok(w.trim(3 + ticks) <= TRIM_BATCH); ticks++; }
  assert.ok(s.cols.size <= 1000, "back under the cap");
  assert.ok(ticks <= Math.ceil(2000 / TRIM_BATCH), `trimmed in ${ticks} ticks`);
  assert.ok(s.cols.has(colKey(9001, 9001, COL)), "the newest column was kept");
  assert.equal(w.trim(200), 0, "nothing to do under the cap");
});

test("trim never evicts retained columns", () => {
  const w = new TerrainWorld(100), s = w.store(OW);
  w.protect("scan:a", s, { x: 0, z: 0 }, 1000);
  for (let i = 0; i < 100; i++) w.put(s, 1 + 2 * i, 1, stone, 1, COL);
  w.maxCols = 10;
  assert.equal(w.trim(2), 0);
  assert.equal(s.cols.size, 100);
});

test("stores no radar uses are freed after the idle time; used and retained ones stay (HUD-07)", () => {
  const w = new TerrainWorld(), a = w.store(OW), b = w.store("minecraft:the_end"), c = w.store("minecraft:nether", 40);
  for (const s of [a, b, c]) w.put(s, 1, 1, stone, 1, COL);
  w.protect("scan:x", c, { x: 1, z: 1 }, 8);
  assert.equal(w.releaseIdle(0, 6000, new Set([a])), 0, "the first check only starts the clock");
  assert.equal(w.releaseIdle(5999, 6000, new Set([a])), 0);
  const lost = b.demandVer;
  assert.equal(w.releaseIdle(6000, 6000, new Set([a])), 1);
  assert.ok(w.stores.has(a.id) && w.stores.has(c.id) && !w.stores.has(b.id));
  assert.ok(b.demandVer > lost, "a freed store with columns marks the loss");
  assert.equal(w.store("minecraft:the_end").cols.size, 0, "a returning viewer starts a new store");
});

test("non-operators' manual scans stop at radius 128; operators keep the full radius (HUD-07)", () => {
  const f = fixture(1, { profile: SPEED });
  const p = f.roster[0];
  assert.equal(f.api.manualScans.host.maxRadius(p), 128);
  p.commandPermissionLevel = 1;
  assert.equal(f.api.manualScans.host.maxRadius(p), MANUAL_SCAN_MAX_RADIUS);
});

