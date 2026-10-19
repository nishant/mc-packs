// Entity-lifecycle guards in elite_bp and moon_bp: an entity that is already gone must be skipped without a
// console warning, and a valid kill must still grant its reward. Loads each pack's real scripts folder with a
// stub @minecraft/server whose entity reads throw InvalidEntityError once the entity is invalid, as in the game.
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const MOB_TAG = "realm:moon_mob";

/** Named imports a pack's scripts take from one module, so the stub can export each of them. */
function importedNames(scriptsDir, moduleName) {
  const names = new Set();
  const re = new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*"${moduleName.replace("/", "\\/")}"`, "g");
  for (const f of readdirSync(scriptsDir)) {
    if (!f.endsWith(".js")) continue;
    for (const m of readFileSync(join(scriptsDir, f), "utf8").matchAll(re)) {
      for (const part of m[1].split(",")) {
        const id = part.trim().split(/\s+as\s+/)[0];
        if (id) names.add(id);
      }
    }
  }
  return [...names];
}

/** A module whose every export is a recording proxy; subscribe(fn) stores fn under the export's path. */
function stubSource(names) {
  return `
export const __handlers = {};
export class InvalidEntityError extends Error { constructor(m) { super(m); this.name = "InvalidEntityError"; } }
export class Player {}
export class Entity {}
export const EntityInitializationCause = { Spawned: "Spawned", Loaded: "Loaded" };
const make = (path) => new Proxy(function () {}, {
  get(_, prop) {
    if (prop === Symbol.iterator) return function* () {};
    if (prop === Symbol.toPrimitive) return () => "";
    if (prop === "then") return undefined;
    if (prop === "subscribe") return (cb) => { (__handlers[path] ??= []).push(cb); };
    return make(path + "." + String(prop));
  },
  apply() { return make(path + "()"); },
  construct() { return make("new " + path); },
});
${names.filter((n) => !["InvalidEntityError", "Player", "Entity", "EntityInitializationCause"].includes(n))
    .map((n) => `export const ${n} = make(${JSON.stringify(n)});`).join("\n")}
`;
}

/** Copies a pack's scripts into a temp dir with stub packages next to them; returns its loaded modules. */
async function loadPack(pack) {
  const root = mkdtempSync(join(tmpdir(), `${pack}-guards-`));
  const scripts = join(root, pack, "scripts");
  cpSync(new URL(`../packs/${pack}/scripts/`, import.meta.url), scripts, { recursive: true });
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  const server = join(root, "node_modules", "@minecraft", "server");
  const ui = join(root, "node_modules", "@minecraft", "server-ui");
  mkdirSync(server, { recursive: true });
  mkdirSync(ui, { recursive: true });
  writeFileSync(join(server, "package.json"), '{"name":"@minecraft/server","type":"module","main":"index.js"}');
  writeFileSync(join(ui, "package.json"), '{"name":"@minecraft/server-ui","type":"module","main":"index.js"}');
  writeFileSync(join(server, "index.js"), stubSource(importedNames(scripts, "@minecraft/server")));
  writeFileSync(join(ui, "index.js"), stubSource(importedNames(scripts, "@minecraft/server-ui")));
  const stub = await import(pathToFileURL(join(server, "index.js")).href);
  await import(pathToFileURL(join(scripts, "main.js")).href);
  const config = await import(pathToFileURL(join(scripts, "config.js")).href);
  return { root, stub, config };
}

/** Entity reads throw InvalidEntityError once the entity is invalid, as the game does. */
function makeEntityMethods(stub) {
  const guard = (s) => {
    if (!s.valid) throw new stub.InvalidEntityError(`${s.id} is invalid`);
    return s;
  };
  return {
    get isValid() { return this._s.valid; },
    get typeId() { return guard(this._s).typeId; },
    get dimension() { return guard(this._s).dim; },
    get location() { return guard(this._s).loc; },
    hasTag(t) { return guard(this._s).tags.has(t); },
    getTags() { return [...guard(this._s).tags]; },
    removeTag(t) { guard(this._s).tags.delete(t); },
    getDynamicProperty() { return guard(this._s).prop; },
    setDynamicProperty(k, v) { guard(this._s).prop = v; },
    getComponent() { return undefined; },
  };
}

function defineMethods(target, methods) {
  Object.defineProperties(target, Object.getOwnPropertyDescriptors(methods));
}

function fakeDimension() {
  return { id: "minecraft:overworld", spawned: [], spawnEntity(type) { this.spawned.push(type); return {}; }, getEntities() { return []; } };
}

function fakeMob(stub, { id, typeId = "minecraft:zombie", tags = [], valid = true }) {
  const entityProto = Object.defineProperties({}, Object.getOwnPropertyDescriptors(makeEntityMethods(stub)));
  return Object.assign(Object.create(entityProto), { _s: { id, typeId, tags: new Set(tags), valid, dim: fakeDimension(), loc: { x: 0, y: 64, z: 0 } } });
}

function fakePlayer(stub, { id, valid = true }) {
  const dim = fakeDimension();
  const player = new stub.Player();
  Object.assign(player, { _s: { id, typeId: "minecraft:player", tags: new Set(), valid, dim, loc: { x: 0, y: 64, z: 0 } } });
  return Object.assign(player, { addExperience() {}, sendMessage() {} });
}

/** Runs fn and returns the console.warn lines it produced. */
function collectWarns(fn) {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warns;
}

const packs = await Promise.all([loadPack("moon_bp"), loadPack("elite_bp")]);
const [moon, elite] = packs;
for (const p of packs) test.after(() => rmSync(p.root, { recursive: true, force: true }));
defineMethods(elite.stub.Player.prototype, makeEntityMethods(elite.stub));
defineMethods(moon.stub.Player.prototype, makeEntityMethods(moon.stub));

test("moon: a Blood Moon mob that is already gone is skipped without a warning", () => {
  const handler = moon.stub.__handlers["world.afterEvents.entityDie"].at(-1);
  const mob = fakeMob(moon.stub, { id: "mob1", tags: [MOB_TAG], valid: false });
  const killer = fakePlayer(moon.stub, { id: "p1" });
  const warns = collectWarns(() => handler({ deadEntity: mob, damageSource: { damagingEntity: killer } }));
  assert.deepEqual(warns, []);
  assert.deepEqual(killer._s.dim.spawned, []);
});

test("moon: a valid Blood Moon mob kill still drops the bonus experience orbs", () => {
  const handler = moon.stub.__handlers["world.afterEvents.entityDie"].at(-1);
  const mob = fakeMob(moon.stub, { id: "mob2", tags: [MOB_TAG] });
  const killer = fakePlayer(moon.stub, { id: "p2" });
  const warns = collectWarns(() => handler({ deadEntity: mob, damageSource: { damagingEntity: killer } }));
  assert.deepEqual(warns, []);
  assert.equal(killer._s.dim.spawned.length, moon.config.CONFIG.blood.bonusXpOrbs);
});

test("moon: a kill whose killer is already gone grants nothing and does not warn", () => {
  const handler = moon.stub.__handlers["world.afterEvents.entityDie"].at(-1);
  const mob = fakeMob(moon.stub, { id: "mob3", tags: [MOB_TAG] });
  const killer = fakePlayer(moon.stub, { id: "p3", valid: false });
  const warns = collectWarns(() => handler({ deadEntity: mob, damageSource: { damagingEntity: killer } }));
  assert.deepEqual(warns, []);
  assert.deepEqual(killer._s.dim.spawned, []);
});

test("elite: a spawn event for an entity that is already gone is skipped without a warning", () => {
  const handler = elite.stub.__handlers["world.afterEvents.entitySpawn"].at(-1);
  const mob = fakeMob(elite.stub, { id: "e1", valid: false });
  const warns = collectWarns(() => handler({ entity: mob, cause: elite.stub.EntityInitializationCause.Spawned }));
  assert.deepEqual(warns, []);
});
