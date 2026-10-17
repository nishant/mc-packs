import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const nativeNamePacks = [
  { pack: "npc_bp", main: "../packs/npc_bp/scripts/main.js" },
  { pack: "caravan_bp", main: "../packs/caravan_bp/scripts/main.js" },
  { pack: "wander_bp", main: "../packs/wander_bp/scripts/main.js" },
  { pack: "saga_bp", main: "../packs/saga_bp/scripts/actors.js" },
];

test("npc, caravan, wander, and saga packs no longer ship projected-label helpers or sliders", () => {
  for (const { pack, main } of nativeNamePacks) {
    const mainSource = readFileSync(new URL(main, import.meta.url), "utf8");
    const config = readFileSync(new URL(`../packs/${pack}/scripts/config.js`, import.meta.url), "utf8");
    const settings = readFileSync(new URL(`../packs/${pack}/scripts/settings.js`, import.meta.url), "utf8");
    assert.doesNotMatch(mainSource, /updateNameLabels|removeOrphanLabel|realm:[a-z_]+_label/);
    assert.doesNotMatch(config, /farNameRange:/);
    assert.doesNotMatch(settings, /key: "farNameRange"/);
  }

  for (const path of [
    "../packs/npc_bp/scripts/name-labels.js",
    "../packs/caravan_bp/scripts/name-labels.js",
    "../packs/wander_bp/scripts/name-labels.js",
    "../packs/saga_bp/scripts/name-labels.js",
    "../packs/npc_bp/entities/npc_label.json",
    "../packs/caravan_bp/entities/caravan_label.json",
    "../packs/wander_bp/entities/wander_label.json",
    "../packs/saga_bp/entities/saga_label.json",
    "../packs/build_rp/entity/npc_label.entity.json",
    "../packs/build_rp/entity/caravan_label.entity.json",
    "../packs/build_rp/entity/wander_label.entity.json",
    "../packs/build_rp/entity/saga_label.entity.json",
    "../packs/build_rp/models/entity/npc_label.geo.json",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  }
});

test("caravan, wanderers, and saga still set native entity name tags", () => {
  const caravanMain = readFileSync(new URL("../packs/caravan_bp/scripts/main.js", import.meta.url), "utf8");
  const wanderMain = readFileSync(new URL("../packs/wander_bp/scripts/main.js", import.meta.url), "utf8");
  const sagaActors = readFileSync(new URL("../packs/saga_bp/scripts/actors.js", import.meta.url), "utf8");
  assert.match(caravanMain, /entity\.nameTag = name/);
  assert.match(wanderMain, /ent\.nameTag = `\$\{NAMED_BY_ID\.has\(rec\.w\) \? "§6" : "§e"\}\$\{rec\.n\}`/);
  assert.match(sagaActors, /ent\.nameTag = o\.name/);
});

test("townsfolk still resend their native names for near viewers within 20 blocks", () => {
  const npcMain = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(npcMain, /const NAME_RANGE = 20;/);
  assert.match(npcMain, /getPlayers\(\{ location: entity\.location, maxDistance: NAME_RANGE \}\)/);
});

test("the townsfolk idle loop skips entity and block work beyond its active range", () => {
  const main = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  const source = main.slice(main.indexOf("let loops = 0;"), main.indexOf("world.afterEvents.worldLoad.subscribe("));
  let entityReads = 0;
  const state = { missing: 2, viewers: new Set(["player"]) };
  const context = {
    get: (key) => ({ enabled: true, faceRange: 8 })[key],
    NAME_RANGE: 20,
    CONFIG: { respawnRange: 24, idleRange: 12 },
    MISSING_EVERY: 4,
    world: { getAllPlayers: () => [{ dimension: { id: "minecraft:overworld" }, location: { x: 0, y: 0, z: 0 } }] },
    list: [{ id: "ida", dim: "minecraft:overworld", x: 1000, y: 0, z: 0 }],
    folk: new Map([["ida", {}]]),
    states: new Map([["ida", state]]),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    entityOf: () => {
      entityReads++;
    },
    dayTick() {},
    console,
  };
  runInNewContext(`${source}\nfor (let i = 0; i < 8; i++) loop();`, context);
  assert.equal(entityReads, 0);
  assert.equal(state.missing, 0);
  assert.equal(state.viewers, undefined);
});
