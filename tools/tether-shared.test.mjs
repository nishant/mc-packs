// tools/tether-shared.js on a fake world: a mob whose "vanilla AI" keeps strolling away from home (the worst case on
// open flat ground) is steered back without teleports, the old snap-to-home pattern loops, and the last resort
// (water, lava, a hole, far beyond the limit) still teleports, to a free spot near home, with a growing cooldown.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// TETHER_SHARED=<an older copy of tether-shared.js> runs these against it (the before evidence).
const shared = await import(process.env.TETHER_SHARED ? pathToFileURL(path.resolve(process.env.TETHER_SHARED)).href : "./tether-shared.js");
const { createSnapGuard, createTether, freeSpotNear, settledBelow } = shared;

/** Flat grass at y 63 (floor y 63, feet at 64), water and lava where asked. */
function flatDim({ water = new Set(), lava = new Set(), holes = new Set() } = {}) {
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    getBlock({ x, y, z }) {
      const k = key(x, y, z);
      if (water.has(k)) return { typeId: "minecraft:water", isAir: false, isLiquid: true };
      if (lava.has(k)) return { typeId: "minecraft:lava", isAir: false, isLiquid: true };
      if (y === 63 && !holes.has(`${x},${z}`)) return { typeId: "minecraft:grass_block", isAir: false, isLiquid: false };
      if (y < 63 && !holes.has(`${x},${z}`)) return { typeId: "minecraft:dirt", isAir: false, isLiquid: false };
      if (y < 55) return { typeId: "minecraft:stone", isAir: false, isLiquid: false };
      return { typeId: "minecraft:air", isAir: true, isLiquid: false };
    },
  };
}

/** A walking mob: strolls toward a target at its movement speed, and impulses add velocity that friction eats. */
function walker(dim, at, { def = 0.5 } = {}) {
  const m = { defaultValue: def, currentValue: def, effectiveMin: 0, resetToDefaultValue() { this.currentValue = this.defaultValue; }, setCurrentValue(v) { this.currentValue = v; return true; } };
  const e = {
    id: "-77",
    dimension: dim,
    location: { ...at },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0 },
    isOnGround: true,
    teleports: 0,
    get isInWater() {
      const b = dim.getBlock({ x: Math.floor(this.location.x), y: Math.floor(this.location.y), z: Math.floor(this.location.z) });
      return !!b && b.typeId === "minecraft:water";
    },
    getComponent: (id) => (id === "minecraft:movement" ? m : undefined),
    teleport(to) {
      this.location = { ...to };
      this.teleports++;
    },
    clearVelocity() {
      this.velocity = { x: 0, y: 0, z: 0 };
    },
    applyImpulse(v) {
      this.velocity.x += v.x;
      this.velocity.z += v.z;
    },
    setRotation(r) {
      this.rotation = r;
    },
    /** One game tick: walk toward `target` (0.2 blocks a tick at default speed), then the velocity. */
    tick(target) {
      const dx = target.x - this.location.x;
      const dz = target.z - this.location.z;
      const d = Math.hypot(dx, dz);
      const s = 0.2 * (m.currentValue / m.defaultValue);
      if (d > 0.01) {
        this.location.x += (dx / d) * Math.min(d, s);
        this.location.z += (dz / d) * Math.min(d, s);
      }
      this.location.x += this.velocity.x;
      this.location.z += this.velocity.z;
      this.velocity.x *= 0.546;
      this.velocity.z *= 0.546;
    },
  };
  return { e, m };
}

/** The AI's next stroll target: always about 10 blocks further from home (the worst case), changed every 100 ticks. */
function outward(e, home, tick, rand) {
  const a = Math.atan2(e.location.z - home.z, e.location.x - home.x) + (rand() - 0.5);
  return { x: e.location.x + Math.cos(a) * 10, z: e.location.z + Math.sin(a) * 10 };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296;
}

const home = { x: 0.5, y: 64, z: 0.5 };
const FIVE_MINUTES = 5 * 60 * 20;

/** The pattern wander_bp used before (tether every 10 ticks: past 12 blocks, teleport home). */
function oldTether(e) {
  const l = e.location;
  if (Math.hypot(l.x - home.x, l.z - home.z) > 12) {
    e.teleport(home);
    e.clearVelocity();
  }
}

test("before: the snap-to-home pattern loops on open ground (many teleports in 5 minutes)", () => {
  const { e } = walker(flatDim(), home);
  const rand = rng(1);
  let target = outward(e, home, 0, rand);
  for (let t = 0; t < FIVE_MINUTES; t++) {
    if (t % 100 === 0) target = outward(e, home, t, rand);
    e.tick(target);
    if (t % 10 === 0) oldTether(e);
  }
  assert.ok(e.teleports >= 20, `the old tether teleported ${e.teleports} times`);
});

test("after: steering keeps a mob that keeps walking away within the soft radius, with no teleports in 5 minutes", () => {
  const dim = flatDim();
  const { e, m } = walker(dim, home);
  const tether = createTether({ soft: 4, hard: 12 });
  const rand = rng(1);
  let target = outward(e, home, 0, rand);
  let max = 0;
  for (let t = 0; t < FIVE_MINUTES; t++) {
    if (t % 100 === 0) target = outward(e, home, t, rand);
    e.tick(target);
    max = Math.max(max, Math.hypot(e.location.x - home.x, e.location.z - home.z));
    if (t % 10 === 0) tether.check(e, home, t);
  }
  assert.equal(e.teleports, 0, "no teleports");
  assert.equal(tether.snaps, 0, "the snap counter agrees");
  assert.ok(max < 7, `stayed within the camp (farthest ${max.toFixed(2)} blocks)`);
  assert.ok(tether.steers > 0, "it was steered");
  assert.ok(m.currentValue < m.defaultValue || tether.stats(e.id).steering === 0, "slowed while steering");
});

test("speed comes back inside, and a mob saved while slowed gets its speed back on the first check", () => {
  const { e, m } = walker(flatDim(), { x: 6, y: 64, z: 0.5 });
  const tether = createTether({ soft: 4, hard: 12 });
  assert.equal(tether.check(e, home, 0), "steer");
  assert.ok(m.currentValue < 0.1, "slowed");
  e.location = { x: 1, y: 64, z: 0.5 };
  assert.equal(tether.check(e, home, 10), "in");
  assert.equal(m.currentValue, m.defaultValue, "its own speed again");
  const fresh = createTether({ soft: 4, hard: 12 });
  m.currentValue = 0.01; // saved mid-steer before a restart
  assert.equal(fresh.check(e, home, 0), "in");
  assert.equal(m.currentValue, m.defaultValue, "reset at the first sight");
});

test("last resort: past the hard radius it is teleported to a free spot near home (not the center)", () => {
  const { e } = walker(flatDim(), { x: 20.5, y: 66, z: 0.5 });
  const tether = createTether({ soft: 4, hard: 12 });
  assert.equal(tether.check(e, home, 100), "snap");
  const l = e.location;
  const d = Math.hypot(l.x - home.x, l.z - home.z);
  assert.ok(d > 0.5 && d <= 3.1, `near home, not on it (${d.toFixed(2)})`);
  assert.equal(l.y, 64, "standing on the floor");
  assert.equal(tether.snaps, 1);
});

test("water and lava: teleported out to a dry spot; a cooldown that doubles stops a loop", () => {
  const water = new Set();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (Math.hypot(x, z) > 2.5) water.add(`${x},64,${z}`);
  const { e } = walker(flatDim({ water }), { x: 3.5, y: 64, z: 0.5 });
  const tether = createTether({ soft: 4, hard: 12 });
  assert.equal(tether.check(e, home, 0), "snap");
  assert.ok(!e.isInWater, `out of the water at ${JSON.stringify(e.location)}`);
  // Put back in the water at once, again and again: the first two go quickly, then it waits longer each time.
  const snaps = [];
  for (let t = 10; t <= 2000; t += 10) {
    e.location = { x: 3.5, y: 64, z: 0.5 };
    if (tether.check(e, home, t) === "snap") snaps.push(t);
  }
  assert.ok(snaps[0] <= 20, `the next snap comes quickly (${snaps[0]})`);
  const gaps = snaps.slice(1).map((s, i) => s - snaps[i]);
  assert.ok(gaps.every((g, i) => i === 0 || g >= gaps[i - 1]), `gaps grow: ${gaps.join(",")}`);
  assert.ok(snaps.length <= 8, `${snaps.length} snaps in 100 s, not 200`);

  const lava = new Set(["2,64,0"]);
  const { e: e2 } = walker(flatDim({ lava }), { x: 2.5, y: 64, z: 0.5 });
  assert.equal(createTether({ soft: 4, hard: 12 }).check(e2, home, 0), "snap");
});

test("a hole: only after several checks below home", () => {
  const { e } = walker(flatDim(), { x: 1.5, y: 58, z: 0.5 });
  const tether = createTether({ soft: 4, hard: 12, holeDrop: 3, holeChecks: 3 });
  assert.equal(tether.check(e, home, 0), "in");
  assert.equal(tether.check(e, home, 10), "in");
  assert.equal(tether.check(e, home, 20), "snap");
});

test("freeSpotNear skips water, holes and the center; settledBelow spots a mob whose floor went", () => {
  const holes = new Set(["1,0", "2,0"]);
  const dim = flatDim({ holes });
  const s = freeSpotNear(dim, home, 3, 0);
  assert.ok(s && !(Math.floor(s.x) === 0 && Math.floor(s.z) === 0) && !holes.has(`${Math.floor(s.x)},${Math.floor(s.z)}`), JSON.stringify(s));
  const fell = { location: { x: 1.5, y: 60, z: 0.5 }, isOnGround: true, dimension: dim };
  assert.equal(settledBelow(fell, { x: 1.5, y: 64, z: 0.5 }), true, "fell through a hole under the anchor");
  const pushed = { location: { x: 1.5, y: 64, z: 3.5 }, isOnGround: true, dimension: dim };
  assert.equal(settledBelow(pushed, { x: 1.5, y: 64, z: 0.5 }), false, "pushed sideways: not settled below");
  const onFloor = { location: { x: 5.5, y: 62, z: 5.5 }, isOnGround: true, dimension: dim };
  assert.equal(settledBelow(onFloor, { x: 5.5, y: 64, z: 5.5 }), false, "its anchor still has a floor");
});

test("snap guard: free first, then a doubling wait while put-backs keep coming, reset after a quiet window", () => {
  const g = createSnapGuard({ cooldown: 20, maxCooldown: 80, window: 400 });
  assert.equal(g.allow("a", 0), true);
  g.snapped("a", 0);
  assert.equal(g.allow("a", 10), false);
  assert.equal(g.allow("a", 20), true);
  g.snapped("a", 20);
  assert.equal(g.allow("a", 50), false);
  assert.equal(g.allow("a", 60), true);
  g.snapped("a", 60);
  g.snapped("a", 140);
  assert.equal(g.allow("a", 200), false, "capped at 80");
  assert.equal(g.allow("a", 220), true);
  assert.equal(g.allow("a", 700), true, "quiet for a window");
  assert.equal(g.snaps, 4);
  assert.equal(g.count("a"), 4);
});

/** Flat grass at y 63 plus extra blocks: `extra` maps "x,y,z" to a type id. */
function builtDim(extra) {
  const base = flatDim();
  return {
    getBlock(p) {
      const t = extra.get(`${p.x},${p.y},${p.z}`);
      return t ? { typeId: t, isAir: false, isLiquid: false } : base.getBlock(p);
    },
  };
}

test("freeSpotNear never puts a mob on a roof or wall top two blocks up: home itself instead", () => {
  const extra = new Map();
  // A 2-high wall all around home (every column within 4 blocks but home's own), open on top.
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (x || z) for (const y of [64, 65]) extra.set(`${x},${y},${z}`, "minecraft:stone");
  const s = freeSpotNear(builtDim(extra), home, 3, 0);
  assert.ok(s, "a spot");
  assert.deepEqual([Math.floor(s.x), s.y, Math.floor(s.z)], [0, 64, 0], `home, not up on the wall (${JSON.stringify(s)})`);
});

test("freeSpotNear never picks a spot behind a fence (a closed pen next to home)", () => {
  const extra = new Map();
  for (let z = -5; z <= 5; z++) extra.set(`1,64,${z}`, "minecraft:oak_fence");
  for (let seed = 0; seed < 8; seed++) {
    const s = freeSpotNear(builtDim(extra), home, 3, seed);
    assert.ok(s && Math.floor(s.x) <= 0, `seed ${seed}: on home's side of the fence (${JSON.stringify(s)})`);
  }
});

test("a mob in a nook behind a wall is not pinned against it forever: it rests to find the way around, then the last resort", () => {
  // A nook open away from home (like the back of a tent): a wall at x 3 and sides at z -3 and 3 out to x 8.
  const extra = new Map();
  for (const y of [64, 65]) {
    for (let z = -3; z <= 3; z++) extra.set(`3,${y},${z}`, "minecraft:oak_planks");
    for (let x = 3; x <= 8; x++) for (const z of [-3, 3]) extra.set(`${x},${y},${z}`, "minecraft:oak_planks");
  }
  const dim = builtDim(extra);
  const { e } = walker(dim, { x: 5.5, y: 64, z: 0.5 });
  // Walls stop it: a step into a column whose feet block isn't air is undone.
  const tick = e.tick.bind(e);
  e.tick = (target) => {
    const was = { ...e.location };
    tick(target);
    if (!dim.getBlock({ x: Math.floor(e.location.x), y: 64, z: Math.floor(e.location.z) }).isAir) {
      e.location = was;
      e.velocity = { x: 0, y: 0, z: 0 };
    }
  };
  const tether = createTether({ soft: 3, hard: 12 });
  const rand = rng(7);
  let target = { x: 5.5, z: 0.5 };
  let back = -1;
  for (let t = 0; t < FIVE_MINUTES && back < 0; t++) {
    // Its own AI: a stroll target within 5 blocks of where it stands, every 100 ticks.
    if (t % 100 === 0) target = { x: e.location.x + (rand() - 0.5) * 10, z: e.location.z + (rand() - 0.5) * 10 };
    e.tick(target);
    if (t % 10 === 0) tether.check(e, home, t);
    if (Math.hypot(e.location.x - home.x, e.location.z - home.z) <= 3) back = t;
  }
  assert.ok(back >= 0, `back inside its radius (at tick ${back}), not wedged behind the wall for 5 minutes (at ${JSON.stringify(e.location)})`);
  assert.ok(tether.snaps <= 1, `${tether.snaps} snaps`);
});

test("fall watch: waits while a mob drops from its anchor, not while it floats in water or hangs without getting lower", () => {
  if (!shared.createFallWatch) assert.fail("no createFallWatch: a mob below its anchor and off the ground counts as falling for good");
  const fall = shared.createFallWatch({ maxTicks: 100 });
  const anchor = { x: 0.5, y: 64, z: 0.5 };
  const e = { dimension: flatDim({ holes: new Set(["0,0"]) }), location: { x: 0.5, y: 63, z: 0.5 }, isOnGround: false, isInWater: false };
  assert.equal(fall.falling(e, "a", anchor, 0), true, "just dropped");
  e.location.y = 61;
  assert.equal(fall.falling(e, "a", anchor, 10), true, "still dropping");
  assert.equal(fall.falling(e, "a", anchor, 20), true);
  assert.equal(fall.falling(e, "a", anchor, 30), true);
  assert.equal(fall.falling(e, "a", anchor, 40), false, "not getting lower: hanging, not falling");
  assert.equal(fall.falling(e, "a", anchor, 50), false, "and stays given up");
  const w = { ...e, id: "w", isInWater: true };
  assert.equal(fall.falling(w, "w", anchor, 0), false, "floating in water");
});
