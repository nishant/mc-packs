import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { circleAnchors, manualCircleAnchors, countCircleAnchors, FillJobs } from "../packs/map_bp/scripts/terrain-work.js";
import { sampleCoord, colKey } from "../packs/map_bp/scripts/terrain.js";

const centers = [
  { x: .1, z: .1 },
  { x: -.999, z: .999 },
  { x: -100.4, z: -45.7 },
  { x: 29999999.8, z: -29999999.7 },
  { x: 33554431.2, z: 33554431.4 },
  { x: -33554431.9, z: -33554431.8 },
  { x: 33554500.2, z: 33554400.1 },
  { x: 1 + 1e-9, z: 0 },
  { x: 1 - 1e-9, z: 0 },
  { x: 0, z: 1 + 1e-9 },
  { x: 1 + 2 ** -50, z: 0 },
];

for (const radius of [1, 4, 64, 128, 384]) for (const center of centers) test("manual center-out exact key set radius" + radius + JSON.stringify(center), () => {
  const expected = new Set();
  for (const anchor of circleAnchors(center, radius, sampleCoord, colKey)) expected.add(anchor.key);
  const total = expected.size;
  assert.equal(total, countCircleAnchors(center, radius, sampleCoord, colKey));
  let count = 0, lastRing = -1;
  const cx = sampleCoord(center.x, 2), cz = sampleCoord(center.z, 2);
  for (const anchor of manualCircleAnchors(center, radius, sampleCoord, colKey)) {
    assert.equal(expected.delete(anchor.key), true, "no duplicate, missing-world, or outside-circle key");
    assert.equal(anchor.key, colKey(anchor.x, anchor.z, 2));
    assert.equal(anchor.x, sampleCoord(anchor.x, 2));
    assert.equal(anchor.z, sampleCoord(anchor.z, 2));
    assert.ok((anchor.x - center.x) ** 2 + (anchor.z - center.z) ** 2 <= radius ** 2);
    const ring = Math.max(Math.abs(anchor.x - cx), Math.abs(anchor.z - cz)) / 2;
    assert.ok(ring >= lastRing, "manual cursor never walks back out of a completed square ring");
    lastRing = ring; count++;
  }
  assert.equal(count, total);
  assert.equal(expected.size, 0);
});

test("IEEE boundary count matches two real tickets instead of prematurely retiring a zero-total job", () => {
  const center = { x: 1 + 1e-9, z: 0 };
  assert.equal(countCircleAnchors(center, 1, sampleCoord, colKey), 2);
  const jobs = new FillJobs(sampleCoord, colKey), job = jobs.start({ owner: "edge", storeId: "surface", profile: "native", center, radius: 1 });
  assert.equal(job.finished, false); assert.equal(job.total, 2);
  let settled = 0;
  for (let ticket = job.peek(); ticket; ticket = job.peek()) { assert.equal(job.settle(ticket, "mapped"), true); settled++; }
  assert.equal(settled, 2); assert.equal(job.progress().remaining, 0); assert.equal(job.progress().mapped, 2);
});

test("nearest canonical origin is first, global row-major iterator order is untouched", () => {
  const center = { x: -.2, z: .3 }, radius = 128;
  const manual = manualCircleAnchors(center, radius, sampleCoord, colKey).next().value;
  assert.equal(manual.x, sampleCoord(center.x, 2));
  assert.equal(manual.z, sampleCoord(center.z, 2));
  assert.equal(manual.key, colKey(center.x, center.z, 2));
  const legacy = circleAnchors(center, radius, sampleCoord, colKey).next().value;
  assert.notEqual(legacy.key, manual.key);
  assert.ok(legacy.z < center.z - 120, "automatic/diagnostic row-major contract did not change");
});

for (const center of centers.slice(0, 6)) test("bounded manual peek work, including real and packed world borders " + JSON.stringify(center), () => {
  let keyCalls = 0, largestBurst = 0, previous = 0, count = 0;
  const key = (x, z, resolution) => { keyCalls++; return colKey(x, z, resolution); };
  const cursor = manualCircleAnchors(center, 384, sampleCoord, key);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    largestBurst = Math.max(largestBurst, keyCalls - previous);
    previous = keyCalls; count++;
  }
  largestBurst = Math.max(largestBurst, keyCalls - previous);
  assert.ok(count > 0);
  assert.ok(largestBurst <= 64, "no peek scans outside-corner or out-of-world ticket arrays: max key calls " + largestBurst);
});

test("384 iterator is genuinely lazy, with no footprint-sized anchor collection", () => {
  let keyCalls = 0;
  const key = (x, z, resolution) => { keyCalls++; return colKey(x, z, resolution); };
  const cursor = manualCircleAnchors({ x: .2, z: -.2 }, 384, sampleCoord, key);
  for (let i = 0; i < 64; i++) assert.equal(cursor.next().done, false);
  assert.ok(keyCalls < 128, "first sixty-four nearby tickets do not precompute the 115k-ticket footprint");
  cursor.return();
  const source = fs.readFileSync(new URL("../packs/map_bp/scripts/terrain-work.js", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("export function* manualCircleAnchors"), source.indexOf("/** Run only when the footprint changes"));
  assert.doesNotMatch(body, /Array\.from|\.push\(|\.sort\(/);
});

test("manual queue keeps round-robin fairness, frozen origin, and one ticket in flight", () => {
  const jobs = new FillJobs(sampleCoord, colKey, 2), center = { x: .2, z: -.2 };
  const a = jobs.start({ owner: "a", storeId: "surface", profile: "native", center, radius: 384 });
  jobs.start({ owner: "b", storeId: "surface", profile: "native", center: { x: 100.2, z: 100.2 }, radius: 128 });
  center.x = 10000;
  const owners = [];
  for (let i = 0; i < 8; i++) {
    const next = jobs.next(); owners.push(next.job.spec.owner);
    assert.equal(next.job.peek(), next.ticket);
    const fixed = next.job.spec.center;
    assert.ok((next.ticket.x - fixed.x) ** 2 + (next.ticket.z - fixed.z) ** 2 < 64);
    assert.equal(next.job.settle(next.ticket, "mapped"), true);
  }
  assert.deepEqual(owners, ["a", "b", "a", "b", "a", "b", "a", "b"]);
  assert.equal(a.spec.center.x, .2);
});
