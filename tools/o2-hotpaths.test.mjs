// O2 remaining hot paths: the real main.js of each pack runs in the offline fake game (tools/lib/pack-sim.mjs) against
// counting stubs. These check that behavior is unchanged and that repeated native queries are asked once; they cannot
// show milliseconds, which only a native profile of the bundle can.
//   node --test tools/o2-hotpaths.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSim } from "./lib/pack-sim.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Loads a real pack's main.js from a temporary copy with the game modules stubbed by `sim` (the data-URL loader of
 * pack-sim.mjs nests every import in its importer, which a pack with many shared modules can't survive). The sim's own
 * `load` runs a small pack first, only to build the stubs.
 */
async function loadReal(sim, folder) {
  await sim.load("help_bp");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "o2-"));
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
  // bare "/__x.mjs" specifiers are rewritten to relative ones, since each module sits at a different depth
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

/** A player with equipment, counting the native reads made through it. */
function geared(sim, name, equipment, calls) {
  const p = sim.join(name);
  p.selectedSlotIndex = 0;
  p.bars = [];
  p.onScreenDisplay = { setTitle() {}, setActionBar: (t) => p.bars.push(t) };
  p.getComponent = (id) => (id === "minecraft:equippable" ? { getEquipment: (slot) => (calls.equip++, equipment[slot]) } : undefined);
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// durability_bp
// ---------------------------------------------------------------------------------------------------------------

/** An item whose durability component and type id count their reads; `dmg.damage` can change between checks. */
function tool(calls, typeId, max, dmg = { damage: 0 }) {
  const component = max > 0 ? { get maxDurability() { return calls.max++, max; }, get damage() { return dmg.damage; } } : undefined;
  return {
    get typeId() { return calls.typeId++, typeId; },
    nameTag: undefined,
    getComponent: (id) => (calls.comp++, id === "minecraft:durability" ? component : undefined),
  };
}

test("durability: warns once per level as a held tool wears down, and again after a repair", async () => {
  const sim = createSim();
  const calls = { equip: 0, comp: 0, max: 0, typeId: 0 };
  const dmg = { damage: 0 };
  const equipment = { Mainhand: tool(calls, "minecraft:diamond_pickaxe", 1000, dmg) };
  const p = geared(sim, "Alex", equipment, calls);
  await sim.load("durability_bp");
  sim.boot();
  sim.step(10);
  assert.deepEqual(p.bars, []);
  dmg.damage = 920; // 8% left
  sim.step(30);
  assert.equal(p.bars.length, 1, p.bars.join(" | "));
  assert.match(p.bars[0], /low: 80\/1000/);
  dmg.damage = 980; // 2% left
  sim.step(30);
  assert.equal(p.bars.length, 2);
  assert.match(p.bars[1], /about to break/);
  sim.step(60);
  assert.equal(p.bars.length, 2, "no repeat while it stays that low");
  dmg.damage = 0; // repaired: the levels start over
  sim.step(20);
  dmg.damage = 925;
  sim.step(20);
  assert.equal(p.bars.length, 3);
});

test("durability: an item type's max durability is read once and a type without durability is never asked for a component twice", async () => {
  const sim = createSim();
  const calls = { equip: 0, comp: 0, max: 0, typeId: 0 };
  const equipment = {
    Mainhand: tool(calls, "minecraft:diamond_pickaxe", 1000, { damage: 10 }),
    Offhand: tool(calls, "minecraft:dirt", 0),
  };
  geared(sim, "Alex", equipment, calls);
  geared(sim, "Bea", equipment, calls);
  await sim.load("durability_bp");
  sim.boot();
  sim.step(10 * 20);
  const checks = 20 * 2; // two players, 20 checks, held slots only (armor slots are empty)
  assert.ok(calls.equip >= checks * 2, `${calls.equip} equipment reads`);
  assert.equal(calls.max, 1, `maxDurability read ${calls.max} times`);
  // one component read per durable item per check, one for the dirt the very first time only
  assert.ok(calls.comp <= checks + 1, `${calls.comp} component reads for ${checks} durable checks`);
});

// ---------------------------------------------------------------------------------------------------------------
// relics_bp
// ---------------------------------------------------------------------------------------------------------------

function relicPlayer(sim, name, helmet, reads) {
  const p = sim.join(name);
  p.selectedSlotIndex = 0;
  p.effects = new Map();
  p.added = [];
  p.getEffect = (t) => p.effects.get(t);
  p.addEffect = (t, d, o) => (p.added.push([t, o?.amplifier ?? 0]), p.effects.set(t, { amplifier: o?.amplifier ?? 0, duration: d }));
  p.removeEffect = (t) => p.effects.delete(t);
  p.getComponent = (id) => {
    if (id === "minecraft:inventory") return { container: { getItem: () => undefined, setItem() {} } };
    if (id === "minecraft:equippable") return { getEquipment: (slot) => (slot === "Head" ? helmet : undefined), setEquipment() {} };
    return undefined;
  };
  let y = 20;
  Object.defineProperty(p, "location", { get: () => (reads.location++, { x: 0, y, z: 0 }) });
  Object.defineProperty(p, "dimension", { get: () => (reads.dimension++, { id: "minecraft:overworld" }) });
  return p;
}

function minersLamp() {
  const props = new Map([["relic:id", "miners_lamp"]]);
  let lore = [];
  let nameTag;
  return {
    typeId: "minecraft:golden_helmet",
    get nameTag() { return nameTag; },
    set nameTag(v) { nameTag = v; },
    getDynamicProperty: (k) => props.get(k),
    getLore: () => lore,
    setLore: (l) => { lore = l; },
    getComponent: () => undefined,
  };
}

test("relics: a player carrying nothing costs no location or dimension reads, and a worn Miner's Lamp still gives Haste", async () => {
  const sim = createSim();
  const reads = { location: 0, dimension: 0 };
  const idle = relicPlayer(sim, "Idle", undefined, reads);
  await sim.load("relics_bp");
  sim.boot();
  sim.step(100);
  assert.equal(reads.location + reads.dimension, 0, `${reads.location} location and ${reads.dimension} dimension reads for a player with no relics`);
  assert.deepEqual(idle.added, []);

  const lit = { location: 0, dimension: 0 };
  const miner = relicPlayer(sim, "Miner", minersLamp(), lit);
  sim.step(60);
  assert.ok(lit.location > 0, "a carrier's place is read");
  assert.ok(miner.added.some(([t]) => t === "haste"), `effects ${JSON.stringify(miner.added)}`);
  assert.deepEqual(idle.added, []);
});

// ---------------------------------------------------------------------------------------------------------------
// saga_bp
// ---------------------------------------------------------------------------------------------------------------

test("saga: the once-a-second loop and its send passes share one player list, and every player still gets their messages", async () => {
  const sim = createSim();
  const bob = sim.join("Bob");
  const cy = sim.join("Cy");
  await loadReal(sim, "saga_bp");
  let asked = 0;
  const all = sim.server.world.getAllPlayers;
  sim.server.world.getAllPlayers = () => (asked++, all());
  sim.boot();
  sim.step(20 * 10);
  const kinds = new Map();
  for (const e of sim.game.sent ?? []) kinds.set(e.id, (kinds.get(e.id) ?? 0) + 1);
  for (const id of ["realm:npc_flags", "realm:saga_progress"]) {
    const msgs = (sim.game.sent ?? []).filter((e) => e.id === id).map((e) => JSON.parse(e.message).player);
    assert.ok(msgs.includes(bob.id) && msgs.includes(cy.id), `${id} reached ${msgs.join(",")}`);
  }
  assert.ok(asked <= 10 + 3, `${asked} player lists asked in 10 runs: ${JSON.stringify([...kinds])}`);
});

// ---------------------------------------------------------------------------------------------------------------
// elytra_bp
// ---------------------------------------------------------------------------------------------------------------

test("elytra: a player who isn't gliding costs no setting reads, and a gliding one still gets the HUD, drops it on landing and when turned off", async () => {
  const sim = createSim();
  const walker = sim.join("Walker");
  const glider = sim.join("Glider");
  await loadReal(sim, "elytra_bp");
  const reads = { walker: 0 };
  const getProp = walker.getDynamicProperty.bind(walker);
  walker.getDynamicProperty = (k) => (reads.walker++, getProp(k));
  const bars = [];
  let speed = 0.5; // blocks per tick: under the slipstream's 1.2, so only the HUD interval draws
  for (const p of [walker, glider]) {
    p.isGliding = false;
    p.isOnGround = true;
    p.getVelocity = () => ({ x: p === glider ? speed : 0, y: 0, z: 0 });
    p.getViewDirection = () => ({ x: 1, y: 0, z: 0 });
    p.getHeadLocation = () => ({ x: 0, y: 65, z: 0 });
    p.getComponent = () => undefined;
    p.onScreenDisplay = { setTitle() {}, setActionBar: (t) => bars.push([p.name, String(t)]) };
  }
  const prefs = (v) => glider.setDynamicProperty("elytra:pref", JSON.stringify({ where: "hotbar", ...v }));
  prefs({});
  const barsOf = (name) => bars.filter(([n]) => n === name).map(([, t]) => t);
  const hud = (blocksPerSecond) => `§b${blocksPerSecond} blocks/s  §fY 64  §fElytra §7--  §7Rockets 0`;
  sim.boot();

  sim.step(100);
  assert.equal(reads.walker, 0, `${reads.walker} setting reads for a player on the ground`);
  assert.deepEqual(bars, [], "nobody on the ground is shown a HUD");

  glider.isGliding = true;
  glider.isOnGround = false;
  sim.step(40);
  assert.ok(barsOf("Glider").length >= 4, `a glider's HUD is drawn, got ${JSON.stringify(bars)}`);
  assert.ok(barsOf("Glider").every((t) => t === hud("10.0")), JSON.stringify(barsOf("Glider")));
  assert.equal(reads.walker, 0);

  glider.isGliding = false;
  glider.isOnGround = true;
  sim.step(2);
  bars.length = 0;
  sim.step(30);
  assert.deepEqual(bars, [], "landing stops the HUD");
  speed = 0.25;
  glider.isGliding = true;
  glider.isOnGround = false;
  sim.step(6);
  assert.equal(barsOf("Glider")[0], hud("5.0"), `landing forgot the old speed readings: ${JSON.stringify(bars)}`);

  prefs({ off: true });
  sim.step(2);
  bars.length = 0;
  sim.step(30);
  assert.deepEqual(bars, [], "turning the HUD off stops it while still gliding");
  speed = 0.75;
  prefs({});
  sim.step(6);
  assert.equal(barsOf("Glider")[0], hud("15.0"), `turning it off forgot the old speed readings: ${JSON.stringify(bars)}`);
});
