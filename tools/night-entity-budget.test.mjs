// O3: the elite aura/approach runs and the wander label sync must cost a bounded, fair amount per run however
// many champions or players there are, and champion density scales with the players online. The functions are
// taken from the production sources and run in a vm. NIGHT_SRC_ROOT points at another checkout (the baseline
// for the RED run).
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
function line(source, name) {
  const m = source.match(new RegExp(`^const ${name} = [^\\n]*;$`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0];
}

const vec = (x, y = 64, z = 0) => ({ x, y, z });

function eliteContext({ champions, players, config = {}, tick = 1000 }) {
  const touched = new Map();
  const steps = [];
  const puffs = [];
  const live = new Map();
  const known = new Map();
  for (let i = 0; i < champions; i++) {
    const id = `c${i}`;
    live.set(id, {
      isValid: true,
      get location() {
        touched.set(id, (touched.get(id) ?? 0) + 1);
        return vec(i, 64, 0);
      },
      dimension: { id: "minecraft:overworld" },
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
    world: { getAllPlayers: () => players.map((p) => ({ dimension: { id: "minecraft:overworld" }, location: p })) },
    system: { currentTick: tick, runInterval: () => {} },
    get: (k) => ({ "approach.enabled": true, "approach.speed": 3, nightOnly: false, maxAlive: 8, ...config })[k],
    traitOf: () => "fast",
    puff: (e) => puffs.push(e),
    shieldUp: () => true,
    BROKEN: { particle: "x" },
    LOOKS: { fast: { particle: "p" } },
    approachStep: (e, step) => steps.push([e, step]),
    night: () => true,
    CHAMP: "realm:champion",
    SPLIT: "elite:split",
  };
  vm.createContext(ctx);
  const code = [
    line(elite, "AURA_RANGE_SQ"),
    "const auraCost = [0, 0, 0];",
    line(elite, "AURA_PER_RUN"),
    line(elite, "APPROACH_PER_RUN"),
    line(elite, "APPROACH_CATCHUP"),
    "const STEP_TICKS = 5;",
    "let auraCursor = 0; let approachCursor = 0; let loaded = 0;",
    fn(elite, "turnOf"),
    fn(elite, "aura"),
    "globalThis.api = { aura, turnOf, set loaded(v) { loaded = v; } };",
  ].join("\n");
  vm.runInContext(code, ctx);
  return ctx;
}

test("turnOf: bounded batches that cover every id with no starvation", () => {
  const ctx = eliteContext({ champions: 0, players: [] });
  const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
  const seen = new Map();
  let cursor = 0;
  for (let run = 0; run < Math.ceil(30 / 8); run++) {
    const { batch, next } = ctx.api.turnOf(ids, cursor, 8);
    assert.ok(batch.length <= 8);
    assert.equal(new Set(batch).size, batch.length);
    for (const id of batch) seen.set(id, (seen.get(id) ?? 0) + 1);
    cursor = next;
  }
  assert.equal(seen.size, 30);
  const empty = ctx.api.turnOf([], 5, 8);
  assert.equal(empty.batch.length, 0);
  assert.equal(empty.next, 0);
});

test("aura: one run touches a bounded number of champions and every one comes up within ceil(n/cap) runs", () => {
  const ctx = eliteContext({ champions: 50, players: [vec(0)] });
  ctx.api.aura();
  assert.ok(ctx.touched.size <= 12, `one run touched ${ctx.touched.size}`);
  for (let i = 1; i < Math.ceil(50 / 12); i++) ctx.api.aura();
  assert.equal(ctx.touched.size, 50);
});

test("aura: an invalid champion is purged and doesn't block the others", () => {
  const ctx = eliteContext({ champions: 5, players: [vec(0)] });
  ctx.live.get("c0").isValid = false;
  ctx.api.aura();
  assert.equal(ctx.live.has("c0"), false);
  assert.equal(ctx.puffs.length, 4);
});

test("approach: a run steps a bounded number of champions, fairly, at a steady pace", () => {
  const ctx = eliteContext({ champions: 40, players: [vec(0)] });
  const code = [fn(elite, "stepFor"), "const approachSeen = new Map();", fn(elite, "approachRun"), "globalThis.run = approachRun; globalThis.seen = approachSeen; globalThis.stepFor = stepFor;"].join("\n");
  vm.runInContext(code, ctx);
  const visits = new Map();
  const runs = Math.ceil(40 / 8);
  for (let r = 0; r < runs; r++) {
    ctx.steps.length = 0;
    ctx.system.currentTick += 5;
    ctx.run();
    assert.ok(ctx.steps.length <= 8, `run stepped ${ctx.steps.length}`);
    for (const [e, step] of ctx.steps) {
      visits.set(e, (visits.get(e) ?? 0) + 1);
      assert.ok(step > 0 && step <= 0.9);
    }
  }
  assert.equal(visits.size, 40);
  assert.ok([...visits.values()].every((v) => v === 1));
  assert.equal(ctx.stepFor(3, 5), 0.75);
  assert.equal(ctx.stepFor(3, 20), 0.9, "capped under a block");
  assert.equal(ctx.stepFor(3, 1000), 0.9);
  assert.equal(ctx.stepFor(0.5, 20), 0.5);
  assert.equal(ctx.stepFor(0.1, 1), 0.025);
});

test("density: aliveCap scales with the players online under the maxAlive ceiling", () => {
  const ctx = eliteContext({ champions: 0, players: [] });
  vm.runInContext(fn(elite, "aliveCap") + "\nglobalThis.aliveCap = aliveCap;", ctx);
  const cap = ctx.aliveCap;
  assert.equal(cap(8, 0.8, 10), 8);
  assert.equal(cap(8, 0.8, 4), 4);
  assert.equal(cap(8, 0.8, 1), 1);
  assert.equal(cap(8, 0.8, 0), 1);
  assert.equal(cap(8, 0.8, 100), 8);
  assert.equal(cap(16, 0.8, 100), 16);
  assert.equal(cap(8, 0, 1), 8);
  assert.equal(cap(8, NaN, 1), 8);
  assert.equal(cap(8, "x", 1), 8);
  assert.equal(cap(8, -1, 1), 8);
  assert.equal(cap("bad", 0.8, 10), 1);
  assert.equal(cap(NaN, 0, 10), 1);
});

test("density: crowdedAround counts known champions near the spot in the same dimension", () => {
  const ctx = eliteContext({ champions: 0, players: [] });
  vm.runInContext(line(elite, "NEARBY_RADIUS") + "\n" + fn(elite, "crowdedAround") + "\nglobalThis.crowded = crowdedAround;", ctx);
  const o = "minecraft:overworld";
  const infos = [
    { dim: o, at: vec(10, 64, 0) },
    { dim: o, at: vec(20, 64, 0) },
    { dim: o, at: vec(300, 64, 0) },
    { dim: "minecraft:nether", at: vec(0, 64, 0) },
  ];
  assert.equal(ctx.crowded(infos, o, vec(0), 2), true);
  assert.equal(ctx.crowded(infos, o, vec(0), 3), false);
  assert.equal(ctx.crowded(infos, o, vec(0), 0), false);
  assert.equal(ctx.crowded(infos, o, vec(0), undefined), false);
});

test("density: convert stops before any native read once the player-scaled cap is reached", () => {
  const ctx = eliteContext({ champions: 0, players: [vec(0), vec(1), vec(2)], config: { maxAliveNearby: 0, maxAlivePerPlayer: 0.8 } });
  vm.runInContext([fn(elite, "aliveCap"), line(elite, "NEARBY_RADIUS"), fn(elite, "crowdedAround"), fn(elite, "convert").replace(/\n  const at = e\.location;[\s\S]*$/, "\n  return true;\n}")].join("\n") + "\nglobalThis.convert = convert;", ctx);
  const e = { isValid: true, hasTag: () => false };
  ctx.api.loaded = 3;
  assert.equal(ctx.convert(e), undefined, "3 players * 0.8 -> cap 3, 3 loaded");
  ctx.api.loaded = 2;
  assert.equal(ctx.convert(e), true, "room left");
  ctx.get = (k) => ({ nightOnly: false, maxAlive: 8, maxAlivePerPlayer: 0 })[k];
  ctx.api.loaded = 3;
  assert.equal(ctx.convert(e), true, "per-player limit off: only maxAlive");
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
  vm.runInContext([line(wander, "LABEL_REACH"), line(wander, "LABEL_QUERY_PLAYERS"), line(wander, "LABEL_QUERY_TARGETS"), "let onlineN = 0; let onlineAt = -Infinity;", fn(wander, "labelObservers"), "globalThis.labelObservers = labelObservers;"].join("\n"), ctx);
  return ctx;
}

test("wander labels: a busy server reads only the players near a wanderer, a small one reads everyone", () => {
  const busy = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, location: vec(i < 3 ? 5 + i : 100000 + i * 100, 64, 0) }));
  const ctx = wanderContext(busy, 3);
  const seen = ctx.labelObservers(ctx.targets);
  assert.deepEqual([...new Set(seen.map((p) => p.id))].sort(), ["p0", "p1", "p2"]);
  assert.equal(ctx.log.all, 0, "no read of every player");
  assert.equal(ctx.log.near, 3, "one query per wanderer");

  const small = wanderContext(busy.slice(0, 6), 3);
  assert.equal(small.labelObservers(small.targets).length, 6);
  assert.equal(small.log.near, 0);

  const many = wanderContext(busy, 20);
  many.labelObservers(many.targets);
  assert.equal(many.log.near, 0, "more wanderers than the query cap reads everyone");
  assert.equal(many.log.all, 1);
});
