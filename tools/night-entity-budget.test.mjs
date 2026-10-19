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
const read = (p) => readFileSync(`${root}/${p}`, "utf8");
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

const vec = (x, y = 64, z = 0) => ({ x, y, z });
const OVER = "minecraft:overworld";

function eliteContext({ champions, players, config = {}, tick = 1000 }) {
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
        return vec(i, 64, 0);
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
    fn(elite, "aura"),
    optFn(elite, "approachRun"),
    fn(elite, "convert").replace(/\n {2}if \(get\("surfaceOnly"\)[\s\S]*$/, "\n  return true;\n}"),
    "globalThis.api = { aura, convert, set loaded(v) { loaded = v; } };",
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
  const targets = Array.from({ length: targetCount }, (_, i) => ({ id: `t${i}`, entity: { dimension, location: vec(i * 1000, 64, 0) } }));
  const ctx = {
    log,
    targets,
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
  // the baseline's updateLabels read every player in the sync call; the new one asks labelObservers
  const update = fn(wander, "updateLabels");
  const observers = optFn(wander, "labelObservers");
  vm.runInContext(
    [
      "const LABEL_OBSERVER_RANGE = 36;",
      line(wander, "LABEL_REACH", "40"),
      line(wander, "LABEL_QUERY_PLAYERS", "8"),
      line(wander, "LABEL_QUERY_TARGETS", "16"),
      "let onlineN = 0; let onlineAt = -Infinity;",
      observers,
      "let ready = true; const DIMENSIONS = []; const live = {}; const camps = {}; const NAMED_BY_ID = new Map();",
      "const nameLabels = { sync(t, observers) { globalThis.seen = observers(); } };",
      "const entityById = () => undefined;",
      update,
      "globalThis.updateLabels = updateLabels;",
    ].join("\n"),
    ctx,
  );
  return ctx;
}

test("wander labels: a busy server reads only the players near a wanderer, a small one reads everyone", () => {
  const busy = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, location: vec(i < 3 ? 5 + i : 100000 + i * 100, 64, 0) }));
  const sync = (players, n) => {
    const ctx = wanderContext(players, n);
    // a sync with these wanderers as the live targets
    vm.runInContext("globalThis.sync = (t) => nameLabels.sync(t, () => " + (/^function labelObservers\(/m.test(wander) ? "labelObservers(t)" : "world.getPlayers({ excludeGameModes: [GameMode.Spectator] })") + ");", ctx);
    ctx.sync(ctx.targets);
    return ctx;
  };
  const ctx = sync(busy, 3);
  assert.deepEqual([...new Set(ctx.seen.map((p) => p.id))].sort(), ["p0", "p1", "p2"]);
  assert.equal(ctx.log.all, 0, "no read of every player");
  assert.equal(ctx.log.near, 3, "one query per wanderer");

  const small = sync(busy.slice(0, 6), 3);
  assert.equal(small.seen.length, 6);
  assert.equal(small.log.near, 0);

  const many = sync(busy, 20);
  assert.equal(many.log.near, 0, "more wanderers than the query cap reads everyone");
  assert.equal(many.log.all, 1);
});

test("wander upkeep: no camps or disabled reads no player's place", () => {
  const m = wander.match(/^ {2}const players = \[\];\n[^\n]*\n/m) ?? wander.match(/^ {2}const players = world\.getAllPlayers\(\)[^\n]*\n/m);
  assert.ok(m, "production camp players read");
  let reads = 0;
  const ctx = { world: { getAllPlayers: () => [{ get dimension() { reads++; return { id: "d" }; }, get location() { reads++; return vec(0); } }] }, camps: {}, enabled: true };
  vm.createContext(ctx);
  vm.runInContext("(() => {" + m[0] + "return players.length; })()", ctx);
  assert.equal(reads, 0, "no camps: no reads");
  ctx.camps = { a: {} };
  vm.runInContext("(() => {" + m[0] + "return players.length; })()", ctx);
  assert.equal(reads > 0, true);
});
