import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const nativeNamePacks = [
  { pack: "npc_bp", main: "../packs/npc_bp/scripts/main.js" },
  { pack: "caravan_bp", main: "../packs/caravan_bp/scripts/main.js" },
  { pack: "wander_bp", main: "../packs/wander_bp/scripts/main.js" },
  { pack: "saga_bp", main: "../packs/saga_bp/scripts/actors.js" },
];

const probeFile = new URL("./test-bds/examples/npc-name-capability.js", import.meta.url);
async function probeModule() {
  assert.equal(existsSync(probeFile), true, "the explicitly gated native/helper capability fixture exists");
  return import(probeFile.href);
}

function probeWorld() {
  let nextId = 0;
  const dimensions = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map((id) => ({
    id,
    entities: [],
    getEntities({ type }) { return this.entities.filter((e) => e.isValid && e.typeId === type); },
    spawnEntity(typeId, location) {
      const entity = {
        id: `probe-${nextId++}`, typeId, location: { ...location }, dimension: this,
        nameTag: "", isValid: true, tags: [],
        addTag(tag) { this.tags.push(tag); },
        teleport(at) { this.location = { ...at }; },
        remove() { this.isValid = false; },
      };
      this.entities.push(entity);
      return entity;
    },
  }));
  const target = {
    id: "ida", typeId: "minecraft:npc", nameTag: "Ida", isValid: true,
    location: { x: 0, y: 4, z: 0 }, dimension: dimensions[0],
    getHeadLocation() { return { ...this.location, y: this.location.y + 1.8 }; },
  };
  const viewer = (x, dimension = dimensions[0]) => ({
    dimension, location: { x, y: 4, z: 0 }, getGameMode: () => "Creative",
  });
  return { dimensions, target, viewer };
}

test("the new name helper is a gated capability probe, not an unproven production rollout", async () => {
  const probe = await probeModule();
  assert.equal(probe.NAME_PROBE_RELEASE_READY, false, "client proof is still required");
  for (const { main } of nativeNamePacks) {
    const source = readFileSync(new URL(main, import.meta.url), "utf8");
    assert.doesNotMatch(source, /npc_name_probe|npc-name-capability/);
  }
  for (const { pack } of nativeNamePacks) {
    const entities = new URL(`../packs/${pack}/entities/`, import.meta.url);
    for (const file of readdirSync(entities).filter((name) => name.endsWith(".json"))) {
      const entity = JSON.parse(readFileSync(new URL(file, entities)))["minecraft:entity"];
      assert.notEqual(entity.description.identifier, "minecraft:npc", "no blanket vanilla NPC replacement");
    }
  }
  const definition = JSON.parse(readFileSync(new URL("../packs/npc_bp/entities/npc_name_probe.json", import.meta.url)));
  const entity = definition["minecraft:entity"];
  assert.equal(entity.description.identifier, probe.NAME_PROBE_TYPE);
  assert.equal(entity.components["minecraft:nameable"].always_show, true);
  assert.deepEqual(entity.components["minecraft:collision_box"], { width: 0, height: 0 });
  assert.equal(entity.components["minecraft:physics"].has_collision, false);
  const client = JSON.parse(readFileSync(new URL("../packs/build_rp/entity/npc_name_probe.entity.json", import.meta.url)));
  assert.equal(client["minecraft:client_entity"].description.identifier, probe.NAME_PROBE_TYPE);
});

test("a name probe stays above its target for opposed viewers without rewriting native identity", async () => {
  const { createNameProbe, NAME_PROBE_TYPE } = await probeModule();
  const { dimensions, target, viewer } = probeWorld();
  const probe = createNameProbe(dimensions);
  probe.sync([target], [viewer(-20), viewer(20)]);
  const [label] = dimensions[0].getEntities({ type: NAME_PROBE_TYPE });
  assert.equal(label.nameTag, "Ida");
  assert.equal(target.nameTag, "Ida");
  const anchor = { x: 0, y: 6.2, z: 0 };
  assert.deepEqual(label.location, anchor);
  probe.sync([target], [viewer(5), viewer(-20)]);
  assert.deepEqual(label.location, anchor, "viewers do not move or scale the shared helper");
  target.location = { x: 3, y: 4, z: 2 };
  target.nameTag = "A speech line";
  probe.sync([target], [viewer(5), viewer(-20)]);
  assert.deepEqual(label.location, { x: 3, y: 6.2, z: 2 });
  assert.equal(label.nameTag, "A speech line");
  assert.equal(target.nameTag, "A speech line");
  probe.dispose();
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 0);
});

test("probe lifecycle removes duplicates, lost targets and unloaded/restarted helpers across dimensions", async () => {
  const { createNameProbe, NAME_PROBE_TYPE } = await probeModule();
  const { dimensions, target, viewer } = probeWorld();
  dimensions[0].spawnEntity(NAME_PROBE_TYPE, { x: 90, y: 8, z: 90 });
  const probe = createNameProbe(dimensions);
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 0, "startup clears stale probes");
  probe.sync([target, target], [viewer(5)]);
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 1);
  const duplicate = dimensions[0].spawnEntity(NAME_PROBE_TYPE, target.location);
  probe.loaded(duplicate);
  assert.equal(duplicate.isValid, false, "an untracked loaded helper cannot become a second label");
  target.dimension = dimensions[1];
  probe.sync([target], [viewer(5, dimensions[1])]);
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 0);
  assert.equal(dimensions[1].getEntities({ type: NAME_PROBE_TYPE }).length, 1);
  const [unloaded] = dimensions[1].getEntities({ type: NAME_PROBE_TYPE });
  unloaded.isValid = false;
  target.isValid = false;
  probe.sync([target], [viewer(5, dimensions[1])]);
  unloaded.isValid = true;
  probe.loaded(unloaded);
  assert.equal(unloaded.isValid, false, "an unloaded helper is removed when its chunk returns");
  target.isValid = true;
  probe.sync([target], [viewer(5, dimensions[1])]);
  probe.sync([target], [viewer(90, dimensions[1])]);
  assert.equal(dimensions[1].getEntities({ type: NAME_PROBE_TYPE }).length, 0, "no observers leaves no helper");
  probe.sync([target], [viewer(5, dimensions[1])]);
  const restarted = createNameProbe(dimensions);
  assert.equal(dimensions[1].getEntities({ type: NAME_PROBE_TYPE }).length, 0, "restart removes saved probes");
  restarted.sync([], [viewer(5, dimensions[1])]);
  assert.equal(dimensions[1].getEntities({ type: NAME_PROBE_TYPE }).length, 0);
  restarted.dispose();
});

test("probe read failures and spectator-only observers cannot strand a helper", async () => {
  const { createNameProbe, NAME_PROBE_TYPE } = await probeModule();
  const { dimensions, target, viewer } = probeWorld();
  const probe = createNameProbe(dimensions);
  probe.sync([target], [viewer(5)]);
  target.getHeadLocation = () => { throw new Error("LocationInUnloadedChunkError"); };
  probe.sync([target], [viewer(5)]);
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 0);
  target.getHeadLocation = () => ({ ...target.location, y: 5.8 });
  probe.sync([target], [{ ...viewer(5), getGameMode: () => "Spectator" }]);
  assert.equal(dimensions[0].getEntities({ type: NAME_PROBE_TYPE }).length, 0);
  probe.dispose();
});

test("npc, caravan, wander, and saga retain native production names and saved legacy-label cleanup", () => {
  for (const { pack, main } of nativeNamePacks) {
    const mainSource = readFileSync(new URL(main, import.meta.url), "utf8");
    const config = readFileSync(new URL(`../packs/${pack}/scripts/config.js`, import.meta.url), "utf8");
    const settings = readFileSync(new URL(`../packs/${pack}/scripts/settings.js`, import.meta.url), "utf8");
    assert.doesNotMatch(mainSource, /updateNameLabels/);
    assert.match(mainSource, /LEGACY_LABEL_TYPES/);
    assert.doesNotMatch(config, /farNameRange:/);
    assert.doesNotMatch(settings, /key: "farNameRange"/);
  }

  for (const path of [
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
    assert.equal(existsSync(new URL(path, import.meta.url)), true, path);
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
