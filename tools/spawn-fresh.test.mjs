import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FOLDERS = ["elite_bp", "saga_bp", "atlas_bp", "domt_bp", "calendar_bp", "moon_bp", "expedition_bp"];
const url = (folder, file) => new URL(`../packs/${folder}/scripts/${file}`, import.meta.url);
const read = (folder, file) => readFileSync(url(folder, file), "utf8");

/** A dimension whose spawnEntity hands back the queued entities in turn (then fresh ones), recording every call. */
function fakeDim(queue = [], id = "minecraft:overworld") {
  const calls = [];
  const dim = {
    id,
    calls,
    spawnEntity(type, at, opts) {
      calls.push({ type, at, opts, argc: arguments.length });
      return queue.length ? queue.shift() : entity(type, at, id);
    },
  };
  return dim;
}
function entity(typeId, at = { x: 0, y: 0, z: 0 }, dimId = "minecraft:overworld", tags = []) {
  return { typeId, location: { ...at }, dimension: { id: dimId }, getTags: () => tags };
}
const at = { x: 10, y: 64, z: -3 };

for (const folder of FOLDERS) {
  const load = () => import(url(folder, "spawn.js").href);

  test(`${folder}: spawns once and returns the entity when the game hands back the right type`, async () => {
    const { spawnFresh } = await load();
    const dim = fakeDim();
    const e = spawnFresh(dim, "minecraft:zombie", at);
    assert.equal(e.typeId, "minecraft:zombie");
    assert.equal(dim.calls.length, 1);
    assert.equal(dim.calls[0].argc, 2, "no options given: spawnEntity gets exactly (type, at)");
  });

  test(`${folder}: spawns again when a reused entity id hands back another entity, never tagging it`, async () => {
    const { spawnFresh } = await load();
    const item = entity("minecraft:item");
    const dim = fakeDim([item, entity("minecraft:wolf")]);
    const e = spawnFresh(dim, "minecraft:zombie", at);
    assert.equal(dim.calls.length, 3);
    assert.notEqual(e, item);
    assert.equal(e.typeId, "minecraft:zombie");
  });

  test(`${folder}: an id without the namespace still matches`, async () => {
    const { spawnFresh } = await load();
    const dim = fakeDim([], "minecraft:overworld");
    dim.spawnEntity = (type) => entity("minecraft:zombie");
    assert.equal(spawnFresh(dim, "zombie", at).typeId, "minecraft:zombie");
  });

  test(`${folder}: throws after the attempts run out, 8 by default and as many as asked`, async () => {
    const { spawnFresh } = await load();
    const other = () => entity("minecraft:item");
    const dim = fakeDim(Array.from({ length: 20 }, other));
    assert.throws(() => spawnFresh(dim, "minecraft:zombie", at), /kept returning another entity/);
    assert.equal(dim.calls.length, 8);
    const few = fakeDim(Array.from({ length: 20 }, other));
    assert.throws(() => spawnFresh(few, "minecraft:zombie", at, { attempts: 4 }), /kept returning another entity/);
    assert.equal(few.calls.length, 4);
  });

  test(`${folder}: spawn options (spawnEvent) reach spawnEntity every attempt; attempts/fresh do not`, async () => {
    const { spawnFresh } = await load();
    const dim = fakeDim([entity("minecraft:item")]);
    spawnFresh(dim, "minecraft:turtle", at, { spawnEvent: "minecraft:entity_born", attempts: 4 });
    assert.equal(dim.calls.length, 2);
    for (const c of dim.calls) assert.deepEqual(c.opts, { spawnEvent: "minecraft:entity_born" });
    const bare = fakeDim();
    spawnFresh(bare, "minecraft:zombie", at, { attempts: 4 });
    assert.equal(bare.calls[0].argc, 2, "only attempts: no options object reaches spawnEntity");
  });

  test(`${folder}: an entity that went invalid throws instead of being used`, async () => {
    const { spawnFresh } = await load();
    const dim = fakeDim([{ get typeId() { throw new Error("invalid entity"); } }]);
    assert.throws(() => spawnFresh(dim, "minecraft:zombie", at), /invalid entity/);
    assert.equal(dim.calls.length, 1, "no blind retry past an invalid entity");
  });
}

test("fresh: someone's tagged or elsewhere minecart of the same type is skipped (the expedition contract)", async () => {
  const { spawnFresh } = await import(url("elite_bp", "spawn.js").href);
  const type = "minecraft:chest_minecart";
  const dim = fakeDim([
    entity(type, at, "minecraft:overworld", ["owned"]),
    entity(type, { x: 40, y: 64, z: -3 }),
    entity(type, at, "minecraft:nether"),
    entity(type, { x: 10, y: 70, z: -3 }),
  ]);
  const e = spawnFresh(dim, type, at, { fresh: true });
  assert.equal(dim.calls.length, 5);
  assert.deepEqual(e.location, at);
  const plain = fakeDim([entity(type, at, "minecraft:overworld", ["owned"])]);
  assert.equal(spawnFresh(plain, type, at).getTags().length, 1, "without fresh the type alone decides");
  const stuck = fakeDim(Array.from({ length: 20 }, () => entity(type, at, "minecraft:overworld", ["owned"])));
  assert.throws(() => spawnFresh(stuck, type, at, { fresh: true }), /kept returning another entity/);
  assert.equal(stuck.calls.length, 8);
});

// What each caller asks of the shared helper: the actual source, so a dropped option or a copy that came back fails.
const callers = [
  ["elite_bp", "main.js", [/spawnFresh\(dim, mob, loc, HAS_BABY\.has\(mob\) \? \{ spawnEvent: "minecraft:as_baby" \} : undefined\)/]],
  ["saga_bp", "actors.js", [/spawnFresh\(dim, type, at, villager \? \{ spawnEvent: "minecraft:spawn_from_village" \} : undefined\)/]],
  ["saga_bp", "objectives.js", [/spawnFresh\(dim, champ\.mob, spawnAt\)/]],
  ["atlas_bp", "main.js", [/spawnFresh\(dim, type, at\)/]],
  ["domt_bp", "helpers.js", [/spawnFresh\(p\.dimension, type, spot\)/]],
  ["domt_bp", "effects.js", [/spawnFresh\(dim, "minecraft:vindicator", at\)/]],
  ["domt_bp", "events.js", [/spawnFresh\(dim, type, \{ x: state\.center\.x/]],
  ["calendar_bp", "main.js", [/\{ spawnEvent: "minecraft:entity_born", attempts: 4 \}/, /\+ 1, z: at\.z \}, \{ attempts: 4 \}/]],
  ["moon_bp", "main.js", [/spawnFresh\(p\.dimension, id, \{ x: at\.x \+ 0\.5, y: at\.y, z: at\.z \+ 0\.5 \}, \{ attempts: 4 \}\)\.addTag\(MOB_TAG\)/]],
  ["expedition_bp", "gauntlet.js", [/spawnShared\(dim, type, at, \{ fresh: true \}\)/, /spawnFresh\(dim, "minecraft:chest_minecart", \{ x: at\.x \+ 0\.5/]],
];
for (const [folder, file, wanted] of callers) {
  test(`${folder}/${file} calls the shared spawnFresh the way it always spawned`, () => {
    const source = read(folder, file);
    assert.match(source, /^import [^;]*\bspawnFresh\b[^;]*from "\.\/spawn\.js";/m);
    assert.doesNotMatch(source, /^\s*(export\s+)?function spawnFresh\b/m);
    for (const re of wanted) assert.match(source, re);
  });
}

test("a failed spawn is the caller's to handle: every caller wraps spawnFresh in its own try/catch", () => {
  for (const [folder, file] of callers) {
    const source = read(folder, file);
    assert.ok(/catch\s*(\(\w+\))?\s*\{/.test(source), `${folder}/${file} still catches`);
  }
});
