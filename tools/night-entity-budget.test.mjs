// O3: the elite aura/approach runs and the wander label sync must cost a bounded, fair amount per run however
// many champions or players there are, and champion density scales with the players online. The functions are
// taken from the production sources and run in a vm. NIGHT_SRC_ROOT points at another checkout (the baseline
// for the RED run): helpers and constants that checkout lacks are left out (or unbounded), so the baseline fails
// on the behavior asserted here, not on a missing symbol.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = process.env.NIGHT_SRC_ROOT ? process.env.NIGHT_SRC_ROOT : new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (p) => readFileSync(`${root}/${p}`, "utf8").replace(/\r\n/g, "\n");
const elite = read("packs/elite_bp/scripts/main.js");
const wander = read("packs/wander_bp/scripts/main.js");

function fn(source, name) {
  const m = source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0];
}
const optFn = (source, name) => (new RegExp(`^function ${name}\\(`, "m").test(source) ? fn(source, name) : "");
function line(source, name, fallback) {
  const m = source.match(new RegExp(`^const ${name} = [^\\n]*;$`, "m"));
  if (m) return m[0];
  assert.ok(fallback !== undefined, `production ${name}`);
  return `const ${name} = ${fallback};`;
}

/** A top-level `const NAME = ...;` that may span lines. @param {string} source @param {string} name */
function stmt(source, name) {
  const m = source.match(new RegExp(`^const ${name} =[\\s\\S]*?;$`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0];
}

const vec = (x, y = 64, z = 0) => ({ x, y, z });
const OVER = "minecraft:overworld";

function eliteContext({ champions, players, config = {}, tick = 1000, at = (i) => vec(i, 64, 0) }) {
  const touched = new Map();
  const steps = [];
  const puffs = [];
  const callbacks = [];
  const calls = { night: 0, players: 0 };
  const live = new Map();
  const known = new Map();
  for (let i = 0; i < champions; i++) {
    const id = `c${i}`;
    live.set(id, {
      id,
      isValid: true,
      get location() {
        touched.set(id, (touched.get(id) ?? 0) + 1);
        return at(i);
      },
      dimension: { id: OVER },
    });
  }
  const ctx = {
    console,
    Date,
    live,
    known,
    touched,
    steps,
    puffs,
    calls,
    config,
    world: {
      getAllPlayers: () => {
        calls.players++;
        return players.map((p) => ({ dimension: { id: OVER }, location: p }));
      },
    },
    system: { currentTick: tick, runInterval: (f) => callbacks.push(f) },
    get: (k) => ({ "approach.enabled": true, "approach.speed": 3, nightOnly: false, maxAlive: 80, maxAlivePerPlayer: 0.8, maxAliveNearby: 0, ...ctx.config })[k],
    traitOf: () => "fast",
    puff: (e) => puffs.push(e),
    shieldUp: () => true,
    BROKEN: { particle: "x" },
    LOOKS: { fast: { particle: "p" } },
    approachStep: (e, step, units) => steps.push({ e, step, units }),
    night: () => {
      calls.night++;
      return true;
    },
    CONFIG: { approach: { range: 48 } },
    CHAMP: "realm:champion",
    SPLIT: "elite:split",
  };
  vm.createContext(ctx);
  const code = [
    line(elite, "AURA_RANGE_SQ"),
    "const auraCost = [0, 0, 0];",
    line(elite, "AURA_PER_RUN", "Infinity"),
    line(elite, "APPROACH_PER_RUN", "Infinity"),
    line(elite, "APPROACH_CATCHUP", "1"),
    "const STEP_TICKS = 5;",
    "let auraCursor; let approachCursor; let loaded = 0; let recent = [];",
    line(elite, "NEARBY_RADIUS", "64"),
    optFn(elite, "turnOf"),
    optFn(elite, "stepFor"),
    optFn(elite, "aliveCap"),
    optFn(elite, "crowdedAround"),
    "const approachSeen = new Map();",
    // The near-player sort (O3 night scaling): absent in the baseline, where aura and approach take every champion.
    "const detours = new Map();",
    /^const NEAR_TICKS = /m.test(elite) ? line(elite, "NEAR_TICKS") : "",
    /^const NEAR_MARGIN = /m.test(elite) ? line(elite, "NEAR_MARGIN") : "",
    /^const SORT_PER_RUN = /m.test(elite) ? line(elite, "SORT_PER_RUN") : "",
    /^const playersAt = /m.test(elite) ? line(elite, "playersAt") : "",
    /^const nearState = /m.test(elite) ? line(elite, "nearState") : "",
    /^let sortCursor;/m.test(elite) ? "let sortCursor;" : "",
    optFn(elite, "sortNear"),
    /^const nearIds = /m.test(elite) ? line(elite, "nearIds") : "",
    fn(elite, "aura"),
    optFn(elite, "approachRun"),
    optFn(elite, "approachTurns"),
    /^let runBlocks;/m.test(elite) ? "let runBlocks;" : "",
    fn(elite, "convert").replace(/\n {2}if \(get\("surfaceOnly"\)[\s\S]*$/, "\n  return true;\n}"),
    "globalThis.api = { aura, convert, set loaded(v) { loaded = v; }, detours };",
  ].join("\n");
  vm.runInContext(code, ctx);
  // the new source names approachRun; the baseline had the same body inline in a runInterval callback
  const inline = elite.match(/^system\.runInterval\(\(\) => \{\n {2}if \(get\("approach\.enabled"\)[\s\S]*?^\}, STEP_TICKS\);/m);
  if (/^function approachRun\(/m.test(elite)) ctx.approach = () => vm.runInContext("approachRun()", ctx);
  else {
    assert.ok(inline, "production approach interval");
    vm.runInContext(inline[0], ctx);
    ctx.approach = () => callbacks.at(-1)();
  }
  return ctx;
}

function convertCap(players, config) {
  const ctx = eliteContext({ champions: 0, players: Array.from({ length: players }, (_, i) => vec(i)), config });
  const e = { isValid: true, hasTag: () => false, location: vec(0), dimension: { id: OVER } };
  for (let loaded = 0; loaded < 400; loaded++) {
    ctx.api.loaded = loaded;
    if (!ctx.api.convert(e)) return loaded;
  }
  return Infinity;
}

test("aura: one run touches a bounded number of champions and every one comes up within ceil(n/cap) runs", () => {
  const ctx = eliteContext({ champions: 50, players: [vec(0)] });
  ctx.api.aura();
  assert.ok(ctx.touched.size <= 12, `one run touched ${ctx.touched.size}`);
  const first = new Set(ctx.touched.keys());
  for (let i = 1; i < Math.ceil(50 / 12); i++) ctx.api.aura();
  assert.equal(ctx.touched.size, 50);
  assert.ok(first.size <= 12);
});

test("aura: an invalid champion is purged and doesn't block the others; a removal doesn't skip anyone", () => {
  const ctx = eliteContext({ champions: 30, players: [vec(0)] });
  ctx.live.get("c0").isValid = false;
  ctx.api.aura();
  assert.equal(ctx.live.has("c0"), false);
  for (let i = 0; i < Math.ceil(30 / 12); i++) ctx.api.aura();
  assert.equal(ctx.touched.size, 29, "every valid champion was looked at");
  assert.ok(ctx.puffs.length >= 29);
});

test("approach: a run steps a bounded number of champions and every one has its turn", () => {
  const ctx = eliteContext({ champions: 40, players: [vec(0)] });
  const visits = new Map();
  for (let r = 0; r < Math.ceil(40 / 8); r++) {
    ctx.steps.length = 0;
    ctx.system.currentTick += 5;
    ctx.approach();
    assert.ok(ctx.steps.length <= 8, `run stepped ${ctx.steps.length}`);
    for (const s of ctx.steps) visits.set(s.e.id, (visits.get(s.e.id) ?? 0) + 1);
  }
  assert.equal(visits.size, 40);
  assert.ok([...visits.values()].every((v) => v === 1));
});

test("approach: a champion's next visit covers the time since its last, within the 0.9 block safety cap; its detour timers get that time", () => {
  const ctx = eliteContext({ champions: 16, players: [vec(0)], config: { "approach.speed": 1 } });
  const last = new Map();
  for (let r = 0; r < 4; r++) {
    ctx.steps.length = 0;
    ctx.system.currentTick += 5;
    ctx.approach();
    for (const s of ctx.steps) last.set(s.e.id, { ...s, at: ctx.system.currentTick });
  }
  // c0 was served at run 1 and 3 (16 champions, 8 a run): 10 ticks between visits
  const c0 = last.get("c0");
  assert.equal(c0.units, 2, "elapsed time in step-times");
  assert.equal(c0.step, 0.5, "speed 1 for 10 ticks");
  const fast = eliteContext({ champions: 40, players: [vec(0)], config: { "approach.speed": 3 } });
  for (let r = 0; r < 12; r++) {
    fast.steps.length = 0;
    fast.system.currentTick += 5;
    fast.approach();
  }
  for (const s of fast.steps) assert.ok(s.step <= 0.9, "never more than the collision-safe 0.9 block");
  assert.ok(fast.steps.every((s) => s.units >= 4), "40 champions at 8 a run: a visit every 25 ticks");
});

test("approach: an invalid champion is purged and doesn't use a slot", () => {
  const ctx = eliteContext({ champions: 8, players: [vec(0)] });
  ctx.live.get("c0").isValid = false;
  ctx.system.currentTick += 5;
  ctx.approach();
  assert.equal(ctx.live.has("c0"), false);
  assert.equal(ctx.steps.length, 7);
});

test("night: champions far from every player take no aura or approach turn, so the near ones come up more often", () => {
  // 10 champions within 10 blocks of the player, 30 more 5,000 blocks away (a night with many loaded far off).
  const at = (i) => (i < 10 ? vec(i, 64, 0) : vec(5000 + i, 64, 0));
  const ctx = eliteContext({ champions: 40, players: [vec(0)], at });
  for (let r = 0; r < 4; r++) {
    ctx.system.currentTick += 5;
    ctx.approach(); // the first runs sort every champion once (12 a run)
  }
  ctx.steps.length = 0;
  for (let r = 0; r < 10; r++) {
    ctx.system.currentTick += 5;
    ctx.approach();
  }
  const stepped = new Map();
  for (const s of ctx.steps) stepped.set(s.e.id, (stepped.get(s.e.id) ?? 0) + 1);
  const far = [...stepped.keys()].filter((id) => Number(id.slice(1)) >= 10);
  assert.deepEqual(far, [], "no far champion was stepped");
  for (let i = 0; i < 10; i++) assert.ok((stepped.get(`c${i}`) ?? 0) >= 4, `near c${i} stepped ${stepped.get(`c${i}`) ?? 0} times in 10 runs (every 2 runs with 10 near, not every 5 with 40)`);
  ctx.puffs.length = 0;
  for (let r = 0; r < 4; r++) ctx.api.aura();
  assert.ok(ctx.puffs.length > 0 && ctx.puffs.every((e) => Number(e.id.slice(1)) < 10), "the aura puffs only for champions near a player");
});

test("night: with nobody online the aura puffs for no champion, not even unsorted ones after a reload", () => {
  // 40 champions loaded, no player: the first run sorts 12 of them; the other 28 have not been sorted yet.
  const ctx = eliteContext({ champions: 40, players: [] });
  for (let r = 0; r < 3; r++) ctx.api.aura();
  assert.equal(ctx.puffs.length, 0, `${ctx.puffs.length} puffs with no player online`);
});

test("night: sorting is bounded per run and a champion that a player walks up to is picked up again", () => {
  const spots = Array.from({ length: 40 }, (_, i) => vec(5000 + i, 64, 0));
  const ctx = eliteContext({ champions: 40, players: [vec(0)], at: (i) => spots[i] });
  ctx.system.currentTick += 5;
  ctx.approach();
  assert.ok(ctx.touched.size <= 12, `one run read ${ctx.touched.size} champions' places`);
  for (let r = 0; r < 4; r++) {
    ctx.system.currentTick += 5;
    ctx.approach();
  }
  ctx.steps.length = 0;
  spots[7] = vec(20, 64, 0); // c7 comes within range of the player
  for (let r = 0; r < 8; r++) {
    ctx.system.currentTick += 5;
    ctx.approach();
  }
  assert.ok(ctx.steps.some((s) => s.e.id === "c7"), "the champion now near the player is stepped within a few runs");
  assert.ok(ctx.steps.every((s) => s.e.id === "c7"), "and only it");
});

test("density: the cap scales with players online (1/10/40/100) under the default ceiling", () => {
  assert.equal(convertCap(1, {}), 1);
  assert.equal(convertCap(10, {}), 8);
  assert.equal(convertCap(40, {}), 32);
  assert.equal(convertCap(100, {}), 80);
  assert.equal(convertCap(500, {}), 80, "the ceiling stays");
});

test("density: a saved legacy ceiling (8, 16) is still honored, and per-player 0 gives the plain ceiling", () => {
  assert.equal(convertCap(100, { maxAlive: 8 }), 8);
  assert.equal(convertCap(100, { maxAlive: 16 }), 16);
  assert.equal(convertCap(4, { maxAlive: 8 }), 4);
  assert.equal(convertCap(1, { maxAlivePerPlayer: 0, maxAlive: 8 }), 8);
  assert.equal(convertCap(0, {}), 1, "never below one");
  assert.equal(convertCap(10, { maxAlivePerPlayer: "x", maxAlive: 8 }), 8);
});

test("density: a saturated world is turned away before the night check", () => {
  const ctx = eliteContext({ champions: 0, players: [vec(0), vec(1), vec(2)], config: { nightOnly: true } });
  const e = { isValid: true, hasTag: () => false, location: vec(0), dimension: { id: OVER } };
  ctx.api.loaded = 3;
  assert.equal(ctx.api.convert(e), undefined);
  assert.equal(ctx.calls.night, 0, "no night() read once the cap is reached");
  ctx.api.loaded = 2;
  assert.equal(ctx.api.convert(e), true);
});

test("density: no new champion within 64 blocks of the area limit (any champion type counts, as loaded)", () => {
  const ctx = eliteContext({ champions: 0, players: Array.from({ length: 40 }, (_, i) => vec(i)), config: { maxAliveNearby: 3 } });
  const e = { isValid: true, hasTag: () => false, location: vec(0), dimension: { id: OVER } };
  for (const x of [10, 20, 300]) ctx.known.set(`k${x}`, { dim: OVER, at: vec(x) });
  ctx.known.set("n", { dim: "minecraft:nether", at: vec(0) });
  ctx.api.loaded = 4;
  assert.equal(ctx.api.convert(e), true, "two neighbors near: room");
  ctx.known.set("k30", { dim: OVER, at: vec(30) });
  assert.equal(ctx.api.convert(e), undefined, "three neighbors near: crowded");
  ctx.config = { maxAliveNearby: 0 };
  assert.equal(ctx.api.convert(e), true, "0 = no area limit");
});

function wanderContext(players, targetCount) {
  const log = { all: 0, near: 0 };
  const dimension = {
    getPlayers: (opts) => {
      log.near++;
      return players.filter((p) => (p.location.x - opts.location.x) ** 2 + (p.location.z - opts.location.z) ** 2 <= opts.maxDistance ** 2);
    },
  };
  const entities = new Map();
  const liveRecords = {};
  for (let i = 0; i < targetCount; i++) {
    entities.set(`e${i}`, { dimension, location: vec(i * 1000, 64, 0) });
    liveRecords[`w${i}`] = { e: `e${i}`, w: `w${i}`, n: `N${i}` };
  }
  const ctx = {
    log,
    entities,
    liveRecords,
    seen: undefined,
    GameMode: { Spectator: "spectator" },
    system: { currentTick: 5000 },
    world: {
      getAllPlayers: () => players,
      getPlayers: () => {
        log.all++;
        return players;
      },
    },
  };
  vm.createContext(ctx);
  // the real updateLabels builds the targets and hands the sync its observers; the sync here only calls them
  vm.runInContext(
    [
      "const LABEL_OBSERVER_RANGE = 36;",
      line(wander, "LABEL_REACH", "40"),
      line(wander, "LABEL_QUERY_PLAYERS", "8"),
      line(wander, "LABEL_QUERY_TARGETS", "16"),
      "let onlineN = 0; let onlineAt = -Infinity;",
      // The near/far label passes (O3/O2 wander): absent in the baseline.
      /^const LABEL_HOT = /m.test(wander) ? line(wander, "LABEL_HOT") : "",
      /^const LABEL_FULL_EVERY = /m.test(wander) ? line(wander, "LABEL_FULL_EVERY") : "",
      /^let labelRun = /m.test(wander) ? "let labelRun = 0; let hotLabels = new Set(); const labelDims = () => [];" : "",
      optFn(wander, "labelObservers"),
      "let ready = true; const DIMENSIONS = []; const live = liveRecords; const camps = {}; const NAMED_BY_ID = new Map();",
      "const nameLabels = { sync(t, observers) { globalThis.seen = observers(); } };",
      "const entityById = (id) => entities.get(id);",
      "const wandererLabel = (w, n) => n; const wandererMarker = (k) => k;",
      fn(wander, "updateLabels"),
      "globalThis.updateLabels = updateLabels;",
    ].join("\n"),
    ctx,
  );
  return ctx;
}

test("wander labels: the real updateLabels reads only the players near a wanderer on a busy server, everyone on a small one", () => {
  const busy = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, location: vec(i < 3 ? 5 + i : 100000 + i * 100, 64, 0) }));
  const run = (players, n) => {
    const ctx = wanderContext(players, n);
    ctx.updateLabels();
    return ctx;
  };
  const ctx = run(busy, 3);
  assert.deepEqual([...new Set(ctx.seen.map((p) => p.id))].sort(), ["p0", "p1", "p2"]);
  assert.equal(ctx.log.all, 0, "no read of every player");
  assert.equal(ctx.log.near, 3, "one query per wanderer");

  const small = run(busy.slice(0, 6), 3);
  assert.equal(small.seen.length, 6);
  assert.equal(small.log.near, 0);

  const many = run(busy, 20);
  assert.equal(many.log.near, 0, "more wanderers than the query cap reads everyone");
  assert.equal(many.log.all, 1);
});

// Regression guard: the original (971ea5c6) already read nothing without camps; 4b79281e read every player eagerly.
test("wander upkeep: no camps, or the pack disabled, reads no player's place", () => {
  const m = wander.match(/^ {2}const players = \[\];\n[^\n]*\n/m) ?? wander.match(/^ {2}const players = world\.getAllPlayers\(\)[^\n]*\n/m);
  assert.ok(m, "production camp players read");
  let reads = 0;
  const player = { get dimension() { reads++; return { id: "d" }; }, get location() { reads++; return vec(0); } };
  const ctx = { world: { getAllPlayers: () => [player] }, camps: {}, enabled: true };
  vm.createContext(ctx);
  const run = () => vm.runInContext("(() => {" + m[0] + "return players.length; })()", ctx);
  run();
  assert.equal(reads, 0, "no camps: no reads");
  ctx.camps = { a: {} };
  ctx.enabled = false;
  run();
  assert.equal(reads, 0, "disabled: no reads");
});
test("approach: one run reads each block once, however many angles its steps try", () => {
  // A champion boxed in by a wall: every angle of a step and of its detour looks at the same few columns.
  const code = [
    stmt(elite, "WALK_THROUGH"),
    line(elite, "NO_STEP_ON"),
    /^let runBlocks;/m.test(elite) ? "let runBlocks;" : "let runBlocks;",
    optFn(elite, "lookAt"),
    line(elite, "open"),
    line(elite, "ground"),
    line(elite, "BODY"),
    line(elite, "SIDE"),
    fn(elite, "stepTo"),
    fn(elite, "bodyStep"),
    "globalThis.run = (dim, at, angles) => { if (typeof lookAt === 'function') runBlocks = new Map(); try { return angles.map((a) => bodyStep(dim, at, a, 0.5)); } finally { runBlocks = undefined; } };",
  ].join("\n");
  let reads = 0;
  const dim = {
    id: OVER,
    getBlock: ({ x, y }) => {
      reads++;
      const wall = x >= 2; // a wall from x 2 on, ground below y 64
      return { isAir: !(y < 64 || wall), isLiquid: false, typeId: y < 64 || wall ? "minecraft:stone" : "minecraft:air" };
    },
  };
  const ctx = { Math };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const angles = [-2, -1, 0, 1, 2, 3, 4].map((k) => (k * Math.PI) / 4);
  const at = { x: 1.5, y: 64, z: 0.5 };
  const result = ctx.run(dim, at, angles);
  assert.ok(result.some((r) => r === undefined) && result.some((r) => r !== undefined), "the wall blocks some angles and not others");
  assert.ok(reads <= 60, `7 angles of one step read ${reads} blocks`);
});

test("approach: a step reads each nearby player's place once and a champion's tags once per refresh", () => {
  const code = [
    stmt(elite, "WALK_THROUGH"),
    line(elite, "NO_STEP_ON"),
    "let runBlocks;",
    optFn(elite, "lookAt"),
    line(elite, "open"),
    line(elite, "ground"),
    line(elite, "BODY"),
    line(elite, "SIDE"),
    line(elite, "DETOUR_STEPS"),
    line(elite, "REST_STEPS"),
    line(elite, "LEASH"),
    line(elite, "LEASH_GRACE"),
    line(elite, "LEASH_MAX"),
    "const detours = new Map();",
    /^const ownedSeen = /m.test(elite) ? line(elite, "ownedSeen") : "",
    (elite.match(/^const ownedElsewhere = [^\n]*;$/m) ?? elite.match(/^const ownedElsewhere = [\s\S]*?^\};$/m))[0],
    line(elite, "dist"),
    fn(elite, "stepTo"),
    fn(elite, "bodyStep"),
    fn(elite, "feet"),
    fn(elite, "approachStep"),
    "globalThis.step = (e) => approachStep(e, 0.5, 1);",
  ].join("\n");
  const counts = { playerPlace: 0, tags: 0, teleports: 0 };
  const dim = {
    id: OVER,
    getBlock: ({ x, y }) => ({ isAir: !(y < 64 || x >= 3), isLiquid: false, typeId: y < 64 || x >= 3 ? "minecraft:stone" : "minecraft:air" }),
    getPlayers: () =>
      [0, 1, 2, 3, 4].map((i) => ({
        get location() {
          counts.playerPlace++;
          return vec(30, 64, 4 + i);
        },
      })),
  };
  const champ = {
    id: "c0",
    isValid: true,
    isInWater: false,
    isOnGround: true,
    location: vec(1.5, 64, 0.5),
    dimension: dim,
    getTags() {
      counts.tags++;
      return ["realm:champion"];
    },
    teleport() {
      counts.teleports++;
    },
  };
  const ctx = { Math, GameMode: { Creative: "c", Spectator: "s" }, CONFIG: { approach: { range: 48, stopDistance: 10 } }, get: () => 48, isProtected: () => false };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  for (let i = 0; i < 4; i++) ctx.step(champ);
  assert.ok(counts.teleports > 0, "the champion stepped round the wall");
  assert.ok(counts.playerPlace <= 4 * 5, `4 steps with 5 players read ${counts.playerPlace} player places`);
  assert.equal(counts.tags, 1, "tags read once");
});
