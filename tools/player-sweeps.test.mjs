// O1 long tail (per-second player sweeps): the real main.js of each pack runs in the offline fake game
// (tools/lib/pack-sim.mjs) with 40 players whose position reads are counted per tick. A sweep that visits every
// player on one tick shows 40 players read on that tick; spread over its interval (scripts/spread.js) it shows a
// share. The counters the sweeps keep are checked to come out the same. Milliseconds need a native profile.
//   node --test tools/player-sweeps.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSim } from "./lib/pack-sim.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Loads a real pack's main.js from a temporary copy with the game modules stubbed by `sim` (as o2-hotpaths.test.mjs). */
async function loadReal(sim, folder) {
  await sim.load("help_bp");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sweeps-"));
  const names = { "@minecraft/server": new Set(), "@minecraft/server-ui": new Set() };
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name));
      else if (e.name.endsWith(".js")) {
        let src = e.name === "diag.js" ? "export {};" : fs.readFileSync(path.join(from, e.name), "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@minecraft\/server(?:-ui)?)"/g)) for (const n of m[1].split(",")) if (n.trim()) names[m[2]].add(n.trim().split(/\s+as\s+/)[0]);
        src = src.replace(/from\s*"@minecraft\/server-ui"/g, 'from "/__ui.mjs"').replace(/from\s*"@minecraft\/server"/g, 'from "/__server.mjs"');
        fs.writeFileSync(path.join(to, e.name), src);
      }
    }
  };
  copy(path.join(ROOT, "packs", folder, "scripts"), dir);
  const stub = (pkg, slot) => [...names[pkg]].map((n) => `export const ${n} = globalThis.${sim.key}.${slot}[${JSON.stringify(n)}] ?? globalThis.${sim.key}.fallback(${JSON.stringify(n)});`).join("\n") || "export {};";
  fs.writeFileSync(path.join(dir, "__server.mjs"), stub("@minecraft/server", "server"));
  fs.writeFileSync(path.join(dir, "__ui.mjs"), stub("@minecraft/server-ui", "ui"));
  const fix = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) fix(p, `${rel}../`);
      else if (e.name.endsWith(".js")) fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"\/__(server|ui)\.mjs"/g, `"${rel}__$1.mjs"`));
    }
  };
  fix(dir, "./");
  return import(pathToFileURL(path.join(dir, "main.js")).href);
}

/**
 * `n` players that walk `speed` blocks per tick along x and count, per tick, which of them had their position read.
 * @returns {{ players: any[], perTick: Map<number, Set<string>>, maxPerTick: () => number }}
 */
function walkers(sim, n, { speed = 0.2, dim = "minecraft:overworld" } = {}) {
  /** @type {Map<number, Set<string>>} */
  const perTick = new Map();
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = sim.join(`P${i}`, { id: `-${1000 + i}` });
    const base = { x: i * 3, y: 64, z: i * 7 };
    let movedAt = 0;
    Object.defineProperty(p, "location", {
      get() {
        const t = sim.game.tick;
        if (!perTick.has(t)) perTick.set(t, new Set());
        perTick.get(t).add(p.id);
        movedAt = t;
        return { x: base.x + speed * t, y: base.y, z: base.z };
      },
      configurable: true,
    });
    p.dimension = { id: dim, getTopmostBlock: () => undefined, getBlock: () => undefined };
    p.getGameMode = () => "Survival";
    p.getRotation = () => ({ x: 0, y: 0 });
    p.inputInfo = { getMovementVector: () => ({ x: 0, y: 0 }) };
    p.isSleeping = false;
    p.isGliding = false;
    p.isSprinting = false;
    p.getComponent = () => undefined;
    p.getEffect = () => undefined;
    p.nameTag = p.name;
    void movedAt;
    players.push(p);
  }
  return { players, perTick, maxPerTick: () => Math.max(0, ...[...perTick.values()].map((s) => s.size)) };
}

test("atlas: the 2-second player loop reads at most a tenth of 40 players on any tick", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  await loadReal(sim, "atlas_bp");
  sim.step(400);
  assert.ok(w.perTick.size > 0, "the loop ran");
  for (const p of w.players) assert.ok([...w.perTick.values()].some((s) => s.has(p.id)), `${p.name} was visited`);
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
});

test("quests: travel counts the same with a tenth of 40 players read each run", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  const d = Math.floor(Date.now() / 86400000);
  for (const p of w.players) p.setDynamicProperty("quests:day", JSON.stringify({ d, q: [{ id: "travel_1k", p: 0, done: 0 }] }));
  await loadReal(sim, "quests_bp");
  sim.step(400);
  for (const p of w.players) {
    const day = JSON.parse(p.getDynamicProperty("quests:day"));
    // 4 blocks a second for 20 seconds, less the first second (a start point) and up to 5 seconds not yet added
    assert.ok(day.q[0].p >= 56 && day.q[0].p <= 80, `${p.name} traveled ${day.q[0].p}`);
  }
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
});

test("milestones: playtime and distance count the same spread over the second; AFK players aren't read; one objective lookup per stat a run", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  const idle = w.players[7];
  idle.addTag("afk");
  let lookups = 0;
  await loadReal(sim, "milestones_bp");
  sim.server.world.scoreboard = { getObjective: () => (lookups++, { getScore: () => 0 }) };
  sim.step(400);
  for (const p of w.players) {
    const r = JSON.parse(sim.props.get(`milestones:p:${p.id}`) ?? "null");
    if (p === idle) {
      assert.equal(r?.c?.travelled ?? 0, 0, "nothing counts while AFK");
      continue;
    }
    // 4 blocks a second for 20 seconds, less the first second; saved every 10 seconds
    assert.ok(r && r.c.travelled >= 30 && r.c.travelled <= 80, `${p.name} traveled ${r?.c?.travelled}`);
  }
  assert.ok(![...w.perTick.values()].some((s) => s.has(idle.id)), "an AFK player's position isn't read");
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
  // 20 check runs of 4 players and 8 milestones: 640 lookups when each check asks again, at most 8 a run when shared
  assert.ok(lookups <= 20 * 8, `objective lookups: ${lookups}`);
});

test("titles: distance counts the same and saves spread over the minute, a tenth of 40 players a run", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  await loadReal(sim, "titles_bp");
  /** @type {Map<number, number>} */
  const savesAt = new Map();
  const set = sim.server.world.setDynamicProperty;
  sim.server.world.setDynamicProperty = (k, v) => {
    if (String(k).startsWith("titles:p:")) savesAt.set(sim.game.tick, (savesAt.get(sim.game.tick) ?? 0) + 1);
    return set(k, v);
  };
  sim.step(1300);
  for (const p of w.players) {
    const r = JSON.parse(sim.props.get(`titles:p:${p.id}`) ?? "null");
    // 4 blocks a second, saved once a minute: at least 59 seconds' worth by 65 seconds
    assert.ok(r && r.s.d >= 4 * 50 && r.s.d <= 4 * 65, `${p.name} traveled ${r?.s?.d}`);
  }
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
  const most = Math.max(...savesAt.values());
  assert.ok(most <= 4, `at most 4 saves a tick, got ${most}`);
});

test("guilds: travel counts the same spread over the second, saves spread over the 30 seconds, AFK players aren't read", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  const idle = w.players[5];
  idle.addTag("afk");
  /** @type {Map<number, number>} */
  const savesAt = new Map();
  for (const p of w.players) {
    const set = p.setDynamicProperty.bind(p);
    p.setDynamicProperty = (k, v) => {
      if (k === "guilds:prog") savesAt.set(sim.game.tick, (savesAt.get(sim.game.tick) ?? 0) + 1);
      return set(k, v);
    };
  }
  await loadReal(sim, "guilds_bp");
  sim.step(700);
  for (const p of w.players) {
    const prog = JSON.parse(p.getDynamicProperty("guilds:prog") ?? "null");
    if (p === idle) {
      assert.equal(prog?.b ?? 0, 0, "nothing counts while AFK");
      continue;
    }
    // 4 blocks a second, saved once in the first 30 seconds (whole blocks)
    assert.ok(prog && prog.b >= 75 && prog.b <= 140, `${p.name} traveled ${prog?.b}`);
  }
  assert.ok(![...w.perTick.values()].some((s) => s.has(idle.id)), "an AFK player's position isn't read");
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
  const most = Math.max(...savesAt.values());
  assert.ok(most <= 4, `at most 4 saves a tick, got ${most}`);
});

test("afk: idle players go AFK after afkMinutes as before, turning players don't, a tenth of 40 read a run", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  /** @type {Map<number, Set<string>>} */
  const rotAt = new Map();
  /** @type {Map<string, number>} */
  const inputs = new Map();
  const turner = w.players[3];
  for (const p of w.players) {
    p.getRotation = () => {
      const t = sim.game.tick;
      if (!rotAt.has(t)) rotAt.set(t, new Set());
      rotAt.get(t).add(p.id);
      return p === turner ? { x: 0, y: t % 360 } : { x: 0, y: 0 };
    };
    p.inputInfo = { getMovementVector: () => (inputs.set(p.id, (inputs.get(p.id) ?? 0) + 1), { x: 0, y: 0 }) };
  }
  await loadReal(sim, "afk_bp");
  sim.step(5 * 1200 - 40);
  assert.ok(w.players.every((p) => !p.hasTag("afk")), "nobody is AFK before 5 minutes");
  sim.step(80);
  for (const p of w.players) assert.equal(p.hasTag("afk"), p !== turner, `${p.name} AFK: ${p.hasTag("afk")}`);
  // the Nicknames pack is told about each new AFK name tag
  const told = new Set(sim.game.sent.filter((e) => e.id === "realm:nametag").map((e) => JSON.parse(e.message).player));
  for (const p of w.players) assert.equal(told.has(p.id), p !== turner, `${p.name} realm:nametag`);
  const most = Math.max(...[...rotAt.values()].map((s) => s.size));
  assert.ok(most <= 4, `at most 4 players a tick, got ${most}`);
  // turning already counts as active: the turning player's movement input isn't read
  assert.ok((inputs.get(turner.id) ?? 0) <= 1, `movement reads for a turning player: ${inputs.get(turner.id)} (only the first look, before there is a turn to compare)`);
  assert.ok((inputs.get(w.players[0].id) ?? 0) > 250, "an idle player's movement is read every second");
});

test("nick: name tags are put right on realm:nametag at once and by a 5-second sweep of a tenth of the players", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  /** @type {Map<number, Set<string>>} */
  const tagsAt = new Map();
  for (const [i, p] of w.players.entries()) {
    sim.props.set(`nick:p:${p.id}`, JSON.stringify({ n: `Nick${i}`, c: "a", g: p.name }));
    const getTags = p.getTags.bind(p);
    p.getTags = () => {
      const t = sim.game.tick;
      if (!tagsAt.has(t)) tagsAt.set(t, new Set());
      tagsAt.get(t).add(p.id);
      return getTags();
    };
  }
  await loadReal(sim, "nick_bp");
  sim.step(200);
  for (const [i, p] of w.players.entries()) assert.ok(p.nameTag.includes(`Nick${i}`), `${p.name}: ${p.nameTag}`);
  const most = Math.max(...[...tagsAt.values()].map((s) => s.size));
  assert.ok(most <= 4, `at most 4 players a tick, got ${most}`);
  // Something else changed a tag and said so: put right within a tick or two.
  const a = w.players[3];
  a.nameTag = "changed";
  sim.game.system.sendScriptEvent("realm:nametag", JSON.stringify({ player: a.id, from: "afk_bp" }));
  sim.step(2);
  assert.ok(a.nameTag.includes("Nick3"), `after realm:nametag: ${a.nameTag}`);
  // ...and without a word: within the 5-second sweep.
  const b = w.players[4];
  b.nameTag = "changed";
  sim.step(100);
  assert.ok(b.nameTag.includes("Nick4"), `after the sweep: ${b.nameTag}`);
});

/** A tamed dolphin that counts the events it gets. */
function tamedDolphin(owner) {
  const props = new Map([["dolphin:owner", owner.id], ["dolphin:ownerName", owner.name]]);
  return {
    id: "-77",
    typeId: "minecraft:dolphin",
    isValid: true,
    nameTag: "",
    isInWater: false,
    location: { x: 0, y: 60, z: 0 },
    dimension: { id: "minecraft:overworld" },
    events: /** @type {string[]} */ ([]),
    riders: /** @type {any[]} */ ([]),
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => (v === undefined ? props.delete(k) : props.set(k, v)),
    getComponent(id) {
      return id === "minecraft:rideable" ? { getRiders: () => this.riders, ejectRider() {} } : undefined;
    },
    triggerEvent(e) {
      this.events.push(e);
    },
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    applyImpulse() {},
    setRotation() {},
  };
}

/** Counts, per tick, which players had their riding component asked for; `mounts` maps a player to what they ride. */
function countRiding(sim, players, mounts) {
  /** @type {Map<number, Set<string>>} */
  const at = new Map();
  for (const p of players) {
    p.getComponent = (id) => {
      if (id !== "minecraft:riding") return undefined;
      const t = sim.game.tick;
      if (!at.has(t)) at.set(t, new Set());
      at.get(t).add(p.id);
      const on = mounts.get(p);
      return on ? { entityRidingOn: on } : undefined;
    };
  }
  return { at, total: () => [...at.values()].reduce((n, s) => n + s.size, 0), most: () => Math.max(0, ...[...at.values()].map((s) => s.size)) };
}

test("dolphin: without a loaded tamed dolphin nobody's ride is looked up; with one, a fifth of 40 players a tick, and a ride without a tap is steered within 5 ticks", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  const mounts = new Map();
  const c = countRiding(sim, w.players, mounts);
  /** @type {any[]} */
  let loaded = [];
  await loadReal(sim, "dolphin_bp");
  sim.server.world.getDimension = () => ({ getEntities: () => loaded, id: "minecraft:overworld" });
  sim.server.world.getEntity = () => undefined;
  sim.step(40); // the first following check counts no tamed dolphin
  const before = c.total();
  sim.step(200);
  assert.equal(c.total() - before, 0, "no ride lookups while no tamed dolphin is loaded");
  // A tamed dolphin appears (counted at the next following check), and a player gets on it without a tap.
  const rider = w.players[9];
  const d = tamedDolphin(w.players[0]);
  loaded = [d];
  sim.step(20);
  c.at.clear();
  mounts.set(rider, d);
  d.riders = [rider];
  const on = sim.game.tick;
  await sim.until(() => d.events.includes("realm:dolphin_ridden"), 20);
  assert.ok(d.events.includes("realm:dolphin_ridden"), "the ride was found");
  assert.ok(sim.game.tick - on <= 5, `found within 5 ticks (${sim.game.tick - on})`);
  sim.step(40);
  assert.ok(c.most() <= 9, `at most 9 players a tick, got ${c.most()}`);
});

test("journal: a look reads the player's dimension id once and the world spawn once a round", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  let idReads = 0;
  for (const p of w.players) {
    const dim = p.dimension;
    p.dimension = { getTopmostBlock: dim.getTopmostBlock, getBlock: dim.getBlock, get id() { return idReads++, "minecraft:overworld"; } };
  }
  await loadReal(sim, "journal_bp");
  let spawns = 0;
  sim.server.world.getDefaultSpawnLocation = () => (spawns++, { x: 0, y: 64, z: 0 });
  sim.step(800);
  const looks = [...w.perTick.values()].reduce((n, s) => n + s.size, 0);
  assert.ok(looks >= 40 * 9, `every player looked at every 4 seconds (${looks} looks)`);
  assert.ok(idReads <= looks, `dimension id reads ${idReads} for ${looks} looks`);
  assert.ok(spawns <= 11, `world spawn read ${spawns} times in 10 rounds`);
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
});
