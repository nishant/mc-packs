// Blood Moon at scale (moon_bp): the "is it built here" check reads each spot's own 9 x 9 x 9 box when it is asked
// (F5: no per-cell cache that a block placed by a script, a structure, /fill or a piston could get past; an unloaded
// chunk counts as built), and `blood.maxExtraWorld` caps the Blood Moon's monsters in the whole world (every dimension, counted once
// per second for all players' waves together). Runs the REAL packs/moon_bp/scripts/main.js against tools/lib/pack-sim.mjs
// with a small fake world; the probe counts below are read counts, not milliseconds.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const MOB_TAG = "realm:moon_mob";
const OVERWORLD = "minecraft:overworld";
const NETHER = "minecraft:nether";
const END = "minecraft:the_end";
const NIGHT = { d: 5, s: "blood", a: 1, alive: [] };

/** A repeatable random stream (the pack rolls waves, spots and monsters with Math.random). @param {number} seed */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One loaded Blood Moon night. `at(i)` places player i. Returns the fake world's records and a way to run seconds.
 * @param {{ cfg?: Record<string, unknown>, players: number, at: (i: number) => { x: number, z: number }, random?: () => number, builds?: { x: number, y: number, z: number }[], unloadedFromX?: number }} o
 */
async function night({ cfg, players, at, random = seeded(7), builds = [], unloadedFromX = Infinity }) {
  const sim = createSim();
  const g = { time: 13000, day: 5, builds, unloadedFromX, probes: [], tagListings: [], spawned: [], loneListings: 0 };
  /** @type {any[]} */
  const mobs = [];
  /** @type {Record<string, any>} */
  const dims = {};
  const near = (a, b, d) => Math.hypot(a.x - b.x, a.z - b.z) <= d;

  const makeDim = (id) => ({
    id,
    getEntities(opts = {}) {
      const tags = opts.tags ?? [];
      const tagged = mobs.filter((m) => m.dim === dims[id] && tags.every((t) => m.tags.has(t)));
      if (!opts.location) {
        g.tagListings.push({ dim: id, tick: sim.game.tick });
        return tagged.filter((m) => m.listed !== false);
      }
      return tagged.filter((m) => m.valid && near(m.location, opts.location, opts.maxDistance ?? Infinity));
    },
    spawnEntity(type, loc) {
      const e = {
        typeId: type,
        tags: new Set(),
        valid: true,
        location: { ...loc },
        dim: dims[id],
        get dimension() {
          return dims[id];
        },
        get isValid() {
          return this.valid;
        },
        addTag(t) {
          this.tags.add(t);
          return true;
        },
        hasTag(t) {
          return this.tags.has(t);
        },
        getTags() {
          return [...this.tags];
        },
        remove() {
          this.valid = false;
        },
      };
      mobs.push(e);
      g.spawned.push(e);
      return e;
    },
    getTopmostBlock({ x, z }) {
      return { isAir: false, isLiquid: false, typeId: "minecraft:grass_block", location: { x, y: 64, z }, above: () => ({ isLiquid: false, typeId: "minecraft:air" }) };
    },
    getPlayers({ location, maxDistance }) {
      return sim.players.filter((p) => near(p.location, location, maxDistance));
    },
    containsBlock(volume, _filter, allowUnloaded) {
      const { from, to } = volume;
      g.probes.push({ dim: id, from, to, allowUnloaded });
      if (!allowUnloaded && Math.max(from.x, to.x) >= g.unloadedFromX) throw new Error("UnloadedChunksError");
      if (Math.max(from.x, to.x) >= g.unloadedFromX) return false;
      return g.builds.some((b) => b.x >= from.x && b.x <= to.x && b.y >= from.y && b.y <= to.y && b.z >= from.z && b.z <= to.z);
    },
  });
  for (const id of [OVERWORLD, NETHER, END]) dims[id] = makeDim(id);

  let server;
  Object.defineProperty(sim, "server", {
    configurable: true,
    get: () => server,
    set(v) {
      server = v;
      Object.assign(v.world, {
        getDimension: (id) => dims[id] ?? (() => { throw new Error(`no dimension ${id}`); })(),
        getDifficulty: () => "Normal",
        gameRules: { doMobSpawning: true },
        getMoonPhase: () => 0,
        getDay: () => g.day,
        getTimeOfDay: () => g.time,
      });
      Object.assign(v, {
        GameMode: { Creative: "Creative", Spectator: "Spectator", Survival: "Survival" },
        Difficulty: { Peaceful: "Peaceful", Normal: "Normal" },
        BlockVolume: class { constructor(from, to) { this.from = from; this.to = to; } },
        BlockTypes: { getAll: () => [{ id: "minecraft:oak_planks" }, { id: "minecraft:chest" }, { id: "minecraft:glass" }] },
      });
    },
  });
  sim.props.set("moon:night", JSON.stringify(NIGHT));
  if (cfg) sim.props.set("moon:cfg", JSON.stringify(cfg));

  const realRandom = Math.random;
  const realWarn = console.warn;
  Math.random = random;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  await sim.load("moon_bp");
  for (let i = 0; i < players; i++) {
    const p = sim.join(`P${i}`);
    const { x, z } = at(i);
    p.location = { x, y: 64, z };
    p.dimension = dims[OVERWORLD];
    p.getGameMode = () => "Survival";
  }
  sim.game.emit("world.after.worldLoad");

  const alive = () => mobs.filter((m) => m.valid && m.tags.has(MOB_TAG));
  return {
    sim, g, dims, mobs, warnings, alive,
    /** @param {number} seconds @param {(second: number) => void} [each] */
    run(seconds, each) {
      for (let s = 0; s < seconds; s++) {
        sim.step(20);
        each?.(s);
      }
    },
    /** A mob appeared that no dimension listed before: an operator-less test double for a world that already had some. */
    add(dim, { valid = true, listed = true, throwing = false } = {}) {
      const e = dims[dim].spawnEntity("minecraft:zombie", { x: 0, y: 64, z: 0 });
      g.spawned.pop();
      e.tags.add(MOB_TAG);
      e.valid = valid;
      e.listed = listed;
      if (throwing) Object.defineProperty(e, "isValid", { get() { throw new Error("InvalidEntityError"); } });
      return e;
    },
    done() {
      Math.random = realRandom;
      console.warn = realWarn;
    },
  };
}

const cluster = (i) => ({ x: 2000 + (i % 4), z: 2000 + (Math.floor(i / 4) % 4) });
const apart = (i) => ({ x: 5000 * (i + 1), z: 0 });
const within = (m, b, d = 4) => Math.abs(Math.floor(m.location.x) - b.x) <= d && Math.abs(m.location.y - 1 - b.y) <= d && Math.abs(Math.floor(m.location.z) - b.z) <= d;

test("built check: one 9 x 9 x 9 read per spot tried, never more (SPOT_TRIES per monster at most)", async () => {
  const builds = [{ x: 1975, y: 64, z: 2000 }, { x: 2000, y: 66, z: 1972 }, { x: 2010, y: 62, z: 2020 }];
  const w = await night({ players: 40, at: cluster, builds });
  try {
    w.run(300, () => w.alive().forEach((m) => (m.valid = false)));
    const spawned = w.g.spawned.length;
    assert.ok(spawned >= 300, `enough spots were asked (${spawned} monsters)`);
    for (const p of w.g.probes) assert.deepEqual([p.to.x - p.from.x, p.to.y - p.from.y, p.to.z - p.from.z], [8, 8, 8], "each read is the spot's own 9 x 9 x 9 box");
    assert.ok(w.g.probes.length <= spawned * 4 + 40 * 15 * 4, `${w.g.probes.length} reads for ${spawned} monsters`);
  } finally {
    w.done();
  }
});

test("F5 built check: a shelter built during the night without a player placing a block (Easy Building, /fill, a structure) is protected at once", async () => {
  const w = await night({ players: 40, at: cluster });
  try {
    const kill = () => w.alive().forEach((m) => (m.valid = false));
    w.run(300, kill);
    // A whole ring of shelters around the players appears by script: no playerPlaceBlock event.
    const shelters = [];
    for (let x = 1960; x <= 2045; x += 6) for (let z = 1960; z <= 2045; z += 6) if (Math.hypot(x - 2002, z - 2002) > 12) shelters.push({ x, y: 64, z });
    w.g.builds.push(...shelters);
    const from = w.g.spawned.length;
    w.run(300, kill);
    for (const m of w.g.spawned.slice(from)) for (const b of shelters) assert.ok(!within(m, b), `${JSON.stringify(m.location)} appeared inside a shelter at ${JSON.stringify(b)}`);
  } finally {
    w.done();
  }
});

test("built check: a spot is never allowed within 4 blocks of a player-made block, cached or not", async () => {
  const builds = [{ x: 1975, y: 64, z: 2000 }, { x: 2000, y: 66, z: 1972 }, { x: 2010, y: 62, z: 2020 }, { x: 1990, y: 64, z: 2025 }, { x: 2015, y: 64, z: 1985 }];
  const w = await night({ players: 40, at: cluster, builds });
  try {
    w.run(200, () => w.alive().forEach((m) => (m.valid = false)));
    assert.ok(w.g.spawned.length >= 200);
    for (const m of w.g.spawned) for (const b of builds) assert.ok(!within(m, b), `${JSON.stringify(m.location)} is next to a build at ${JSON.stringify(b)}`);
  } finally {
    w.done();
  }
});

test("built check: an unloaded chunk throws, counts as built and is never cached", async () => {
  const build = { x: 2020, y: 64, z: 2000 };
  const w = await night({ players: 40, at: cluster, builds: [build], unloadedFromX: 2024 });
  try {
    const kill = () => w.alive().forEach((m) => (m.valid = false));
    w.run(150, kill);
    assert.ok(w.g.spawned.length >= 100);
    assert.ok(w.g.spawned.every((m) => Math.floor(m.location.x) + 4 < 2024), "nothing appears where its 9 x 9 x 9 check reaches a chunk that isn't loaded");
    assert.ok(w.g.probes.every((p) => p.allowUnloaded === false), "an unloaded chunk is never read as empty");
    const before = w.g.spawned.length;
    w.g.unloadedFromX = Infinity;
    w.run(300, kill);
    const later = w.g.spawned.slice(before);
    assert.ok(later.some((m) => Math.floor(m.location.x) + 4 >= 2024), "the spots that threw are asked again once the chunk loads");
    for (const m of later) assert.ok(!within(m, build), "and the build there is found");
  } finally {
    w.done();
  }
});

test("built check: another night starts with an empty cache (a base built in between is seen)", async () => {
  const w = await night({ players: 40, at: cluster });
  try {
    const kill = () => w.alive().forEach((m) => (m.valid = false));
    w.run(100, kill);
    const reads = w.g.probes.length;
    const base = { x: 2005, y: 64, z: 1975 };
    w.g.builds.push(base);
    w.g.time = 1000; // dawn: the night ends
    w.run(1);
    w.sim.props.set("moon:pending", "blood");
    w.g.day = 6;
    w.g.time = 13000; // the next dusk
    w.run(1);
    const from = w.g.spawned.length;
    w.run(200, kill);
    assert.ok(w.g.spawned.length - from >= 100, "the second Blood Moon spawns");
    assert.ok(w.g.probes.length > reads, "its cells are read again");
    for (const m of w.g.spawned.slice(from)) assert.ok(!within(m, base), "the base built after the first night is protected");
  } finally {
    w.done();
  }
});

test("built check: nothing is cached once the night is over", async () => {
  const w = await night({ players: 40, at: cluster });
  try {
    w.run(60, () => w.alive().forEach((m) => (m.valid = false)));
    const reads = w.g.probes.length;
    assert.ok(reads > 0);
    w.g.time = 1000;
    w.run(2);
    w.sim.props.set("moon:pending", "blood");
    w.g.day = 6;
    w.g.time = 13000;
    w.run(1);
    w.run(100, () => w.alive().forEach((m) => (m.valid = false)));
    assert.ok(w.g.probes.length > reads, "the same cells are read again for the new night");
  } finally {
    w.done();
  }
});

test("world cap: never more than blood.maxExtraWorld Blood Moon monsters at any second, and the cap is reached", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 3 }, players: 40, at: apart });
  try {
    let worst = 0;
    w.run(120, () => (worst = Math.max(worst, w.alive().length)));
    assert.equal(worst, 3);
    assert.equal(w.alive().length, 3);
    assert.equal(w.g.spawned.length, 3);
  } finally {
    w.done();
  }
});

test("world cap: waves that come in the same second share the room (no overshoot across players)", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 3 }, players: 40, at: apart, random: () => 0.99 });
  try {
    const sizes = [];
    w.run(60, () => sizes.push(w.alive().length));
    assert.equal(Math.max(...sizes), 3);
    // Two waves of two monsters fall in the first second any wave comes: 2 + 1, not 2 + 2.
    assert.ok(sizes.includes(3) && !sizes.some((n) => n > 3));
  } finally {
    w.done();
  }
});

test("world cap: counts the other dimensions' monsters, and skips entities that are already gone", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 4 }, players: 40, at: apart });
  try {
    w.add(NETHER);
    w.add(END);
    w.add(OVERWORLD, { valid: false });
    w.add(OVERWORLD, { valid: false });
    w.add(OVERWORLD, { throwing: true });
    w.run(120);
    assert.equal(w.g.spawned.length, 2, "4 - the 2 monsters alive in the Nether and the End");
    assert.deepEqual(w.warnings.filter((m) => /world cap|InvalidEntity/.test(m)), []);
  } finally {
    w.done();
  }
});

test("world cap: the world is counted once a second at most (one listing per dimension), and not at all without a cap", async () => {
  const capped = await night({ cfg: { "blood.maxExtraWorld": 50 }, players: 40, at: apart });
  try {
    const perSecond = new Map();
    capped.run(60);
    for (const l of capped.g.tagListings) perSecond.set(l.tick, (perSecond.get(l.tick) ?? 0) + 1);
    assert.ok(perSecond.size > 0);
    assert.ok(Math.max(...perSecond.values()) <= 3, "never more than one listing per dimension in a second");
  } finally {
    capped.done();
  }
  const open = await night({ players: 40, at: apart });
  try {
    open.run(60);
    assert.equal(open.g.tagListings.length, 0, "no cap, nothing counted");
    assert.ok(open.alive().length > 10, "no world cap: every player's waves still come (0 = no cap)");
  } finally {
    open.done();
  }
});

test("world cap: the per-player cap still applies underneath it", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 100 }, players: 1, at: () => ({ x: 3000, z: 3000 }) });
  try {
    let worst = 0;
    w.run(600, () => (worst = Math.max(worst, w.alive().length)));
    assert.equal(worst, 8, "maxExtraPerPlayer (default 8) stops the waves first");
  } finally {
    w.done();
  }
});

test("world cap: an error counting the world never lets a wave through", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 50 }, players: 40, at: apart });
  try {
    w.dims[END].getEntities = () => {
      throw new Error("boom");
    };
    w.run(60);
    assert.equal(w.g.spawned.length, 0);
    assert.ok(w.warnings.some((m) => m.includes("world cap")));
  } finally {
    w.done();
  }
});

test("world cap: blood.maxExtraWorld is a registered option, 0 by default", async () => {
  const { CONFIG } = await import("../packs/moon_bp/scripts/config.js");
  assert.equal(CONFIG.blood.maxExtraWorld, 0);
  const source = (await import("node:fs")).readFileSync(new URL("../packs/moon_bp/scripts/settings.js", import.meta.url), "utf8");
  assert.match(source, /key: "blood\.maxExtraWorld", type: "int", scope: "world"[^\n]*min: 0, max: 1000/);
});

test("built check: a base placed in the middle of the night is protected at once (cells that read clear are forgotten)", async () => {
  const w = await night({ players: 40, at: cluster });
  try {
    const kill = () => w.alive().forEach((m) => (m.valid = false));
    w.run(300, kill);
    const base = { x: 2005, y: 64, z: 1975 };
    w.g.builds.push(base);
    w.sim.game.emit("world.after.playerPlaceBlock", { block: { typeId: "minecraft:chest", location: base, dimension: w.dims[OVERWORLD] } });
    const from = w.g.spawned.length;
    w.run(400, kill);
    assert.ok(w.g.spawned.length - from >= 200);
    for (const m of w.g.spawned.slice(from)) assert.ok(!within(m, base), `${JSON.stringify(m.location)} appeared beside the new base`);
  } finally {
    w.done();
  }
});

test("built check: protection reaches 4 blocks from a build, as before (not the whole 16-block cell box)", async () => {
  const base = { x: 2000, y: 64, z: 1975 };
  const w = await night({ players: 40, at: cluster, builds: [base] });
  try {
    w.run(600, () => w.alive().forEach((m) => (m.valid = false)));
    const ring = w.g.spawned.filter((m) => within(m, base, 11) && !within(m, base, 4));
    assert.ok(ring.length > 0, "spots 5 to 11 blocks from the build still get monsters");
    assert.ok(w.g.spawned.every((m) => !within(m, base, 4)));
  } finally {
    w.done();
  }
});

test("dawn: Blood Moon monsters in the Nether and the End are removed too, so the world cap can't leak", async () => {
  const w = await night({ cfg: { "blood.maxExtraWorld": 1 }, players: 1, at: () => ({ x: 3000, z: 3000 }) });
  try {
    const nether = w.add(NETHER);
    const end = w.add(END);
    const gone = w.add(END, { valid: false });
    w.run(40);
    assert.equal(w.g.spawned.length, 0, "the cap is full of the ported monster");
    w.g.time = 1000;
    w.run(2);
    assert.equal(nether.valid, false);
    assert.equal(end.valid, false);
    assert.equal(gone.valid, false);
    w.sim.props.set("moon:pending", "blood");
    w.g.day = 6;
    w.g.time = 13000;
    w.run(120);
    assert.ok(w.g.spawned.length >= 1, "the next Blood Moon spawns again");
    assert.deepEqual(w.warnings.filter((m) => /InvalidEntity|\[moon\]/.test(m)), []);
  } finally {
    w.done();
  }
});
/** A fake block list of `n` types whose id reads are counted per game tick. @param {any} w @param {number} n */
function countedBlockList(w, n) {
  /** @type {Map<number, number>} */
  const perTick = new Map();
  const types = Array.from({ length: n }, (_, i) => ({
    get id() {
      perTick.set(w.sim.game.tick, (perTick.get(w.sim.game.tick) ?? 0) + 1);
      return i % 10 === 0 ? `minecraft:oak_planks_${i}` : `minecraft:stone_${i}`;
    },
  }));
  w.sim.server.BlockTypes.getAll = () => types;
  // One generator step a tick, as a busy server would run the job (pack-sim's runJob takes 50 at once).
  w.sim.server.system.runJob = (gen) => {
    const id = w.sim.server.system.runInterval(() => {
      if (gen.next().done) w.sim.server.system.clearRun(id);
    }, 1);
    return id;
  };
  return perTick;
}

test("O7 load hitch: the player-made block list is built in small steps after world load, not in one tick", async () => {
  const w = await night({ players: 0, at: apart });
  try {
    const perTick = countedBlockList(w, 1200);
    w.run(10);
    const reads = [...perTick.values()];
    assert.equal(reads.reduce((a, b) => a + b, 0), 1200, "every type's id was read once");
    assert.ok(Math.max(...reads) <= 64, `at most 64 ids read in one tick (most: ${Math.max(...reads)})`);
  } finally {
    w.done();
  }
});

test("O7 load hitch: a wave before the stepped list is done still gets the whole list", async () => {
  const w = await night({ players: 1, at: apart });
  try {
    // 30,000 types take 469 one-step ticks (over 23 s): the first wave (within 20 s) comes before the job is done.
    const perTick = countedBlockList(w, 30000);
    w.run(25);
    assert.equal([...perTick.values()].reduce((a, b) => a + b, 0), 30000, "the list was finished, each id read once");
    assert.ok(Math.max(...perTick.values()) > 64, "the first wave finished the rest of the list at once");
    assert.ok(w.g.spawned.length > 0, "waves spawned with the list built");
  } finally {
    w.done();
  }
});
