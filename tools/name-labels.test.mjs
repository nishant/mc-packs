import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createNameLabels, encodeHiddenMarker, HEAD_OFFSET, isSuppressedName, matchesHiddenMarker, OBSERVER_RANGE, SUPPRESSED_NAME } from "../packs/npc_bp/scripts/name-labels.js";

const nativeNamePacks = [
  { pack: "npc_bp", main: "../packs/npc_bp/scripts/main.js", labelType: "realm:npc_label" },
  { pack: "caravan_bp", main: "../packs/caravan_bp/scripts/main.js", labelType: "realm:caravan_label" },
  { pack: "wander_bp", main: "../packs/wander_bp/scripts/main.js", labelType: "realm:wander_label" },
  { pack: "saga_bp", main: "../packs/saga_bp/scripts/actors.js", labelType: "realm:saga_label" },
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

test("npc, caravan, wander, and saga share identical name-labels helpers and suppress native nameplates with §r", () => {
  const canonicalHelper = readFileSync(new URL("../packs/npc_bp/scripts/name-labels.js", import.meta.url), "utf8");
  for (const { pack, main, labelType } of nativeNamePacks) {
    const mainSource = readFileSync(new URL(main, import.meta.url), "utf8");
    const helperSource = readFileSync(new URL(`../packs/${pack}/scripts/name-labels.js`, import.meta.url), "utf8");
    const config = readFileSync(new URL(`../packs/${pack}/scripts/config.js`, import.meta.url), "utf8");
    const settings = readFileSync(new URL(`../packs/${pack}/scripts/settings.js`, import.meta.url), "utf8");
    assert.equal(helperSource, canonicalHelper, `${pack} name-labels.js stays in sync`);
    assert.match(mainSource, /createNameLabels/);
    assert.match(mainSource, /SUPPRESSED_NAME/);
    assert.match(mainSource, new RegExp(labelType));
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

test("createNameLabels maintains one world-fixed helper per owned target and suppresses native nameTag with §r", () => {
  const { dimensions, target, viewer } = probeWorld();
  const labels = createNameLabels({
    labelType: "realm:npc_label",
    ownerTag: "realm:npc_owner:npc_bp",
    labelTag: "realm:npc_label",
    labelIdTag: "realm:npc_label_id:",
  });
  assert.equal(SUPPRESSED_NAME, "§r");
  assert.equal(HEAD_OFFSET, 0.4);
  assert.equal(OBSERVER_RANGE, 24);

  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(-20), viewer(20)], dimensions);
  const [helper] = dimensions[0].getEntities({ type: "realm:npc_label" });
  assert.ok(helper, "helper spawned");
  assert.equal(target.nameTag, "§r", "native entity nameTag is suppressed with §r");
  assert.equal(helper.nameTag, "§eIda §7the Blacksmith", "helper carries canonical name");
  assert.deepEqual(helper.location, { x: 0, y: 6.2, z: 0 }, "helper stays pinned at head + 0.4y");
  assert.ok(helper.tags.includes("realm:npc_label_id:ida"));

  labels.sync([{ id: "ida", entity: target, name: "§fThe forge stays hot." }], [viewer(-5), viewer(20)], dimensions);
  assert.equal(dimensions[0].getEntities({ type: "realm:npc_label" }).length, 1, "single helper reused for speech");
  assert.equal(helper.nameTag, "§fThe forge stays hot.");
  assert.equal(target.nameTag, "§r");

  const stray = dimensions[0].spawnEntity("realm:npc_label", { x: 1, y: 6.2, z: 0 });
  assert.equal(labels.loaded(stray), true);
  assert.equal(stray.isValid, false, "untracked loaded helper is removed immediately");

  labels.removeFor("ida");
  assert.equal(dimensions[0].getEntities({ type: "realm:npc_label" }).length, 0, "removeFor removes helper before skin save");

  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(40)], dimensions);
  assert.equal(dimensions[0].getEntities({ type: "realm:npc_label" }).length, 0, "no helper beyond observerRange");
  assert.equal(target.nameTag, "§eIda §7the Blacksmith", "without an active helper, native nameTag retains canonical fallback");
});

test("createNameLabels falls back to canonical native nameTag with bounded warning when helper spawn/caption fails or unloads, and no pack unconditionally writes §r outside name-labels.js", async () => {
  const { dimensions, target, viewer } = probeWorld();
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const labels = createNameLabels({
      labelType: "realm:npc_label",
      ownerTag: "realm:npc_owner:npc_bp",
      labelTag: "realm:npc_label",
      labelIdTag: "realm:npc_label_id:",
    });

    // 1. Throwing spawnEntity: target must NOT be left blank with "§r" and no helper; must fall back to canonical name/speech and warn once per entity.
    const origSpawn = dimensions[0].spawnEntity.bind(dimensions[0]);
    dimensions[0].spawnEntity = () => {
      throw new Error("Could not spawn realm:npc_label");
    };
    target.nameTag = "§r";
    labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(5)], dimensions);
    assert.equal(dimensions[0].getEntities({ type: "realm:npc_label" }).length, 0, "no helper created when spawn throws");
    assert.equal(target.nameTag, "§eIda §7the Blacksmith", "target falls back to canonical name when helper spawn throws");
    assert.equal(warnings.length, 1, "warns once when helper fails for an entity");

    // Repeated failing syncs on the same entity update fallback speech/caption without spamming warnings.
    labels.sync([{ id: "ida", entity: target, name: "§fThe forge stays hot." }], [viewer(5)], dimensions);
    assert.equal(target.nameTag, "§fThe forge stays hot.", "fallback updates to current speech caption while helper is unavailable");
    assert.equal(warnings.length, 1, "bounded warning per entity (no log spam)");

    // 2. Recovery: when spawnEntity succeeds again, helper carries caption and native nameTag becomes "§r".
    dimensions[0].spawnEntity = origSpawn;
    labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(5)], dimensions);
    const [helper] = dimensions[0].getEntities({ type: "realm:npc_label" });
    assert.ok(helper?.isValid, "helper spawned after recovery");
    assert.equal(helper.nameTag, "§eIda §7the Blacksmith");
    assert.equal(target.nameTag, "§r", "native nameTag suppressed only after helper is live and captioned");

    // 3. Missing/unloaded helper and throwing re-spawn: restores canonical native nameTag and warns once for the new failure.
    helper.isValid = false;
    dimensions[0].spawnEntity = () => {
      throw new Error("Chunk unloaded");
    };
    labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(5)], dimensions);
    assert.equal(target.nameTag, "§eIda §7the Blacksmith", "unloaded helper + failed respawn restores canonical native nameTag");
    assert.equal(warnings.length, 2, "warns once after recovery + new failure");
  } finally {
    console.warn = origWarn;
  }

  // 4. Pack-level spawn/dress/say/resend fallback across all 4 families:
  // When no observer is near or helper creation fails, each pack's target retains its canonical name/speech;
  // when an observer is near and helper creation succeeds, the helper carries the name and the target has "§r".
  for (const { pack, labelType } of nativeNamePacks) {
    const { dimensions: dims, target: ent, viewer: v } = probeWorld();
    const { createNameLabels: createPackLabels } = await import(`../packs/${pack}/scripts/name-labels.js`);
    const packLabels = createPackLabels({
      labelType,
      ownerTag: `realm:npc_owner:${pack}`,
      labelTag: labelType,
      labelIdTag: `${labelType}_id:`,
    });
    // Out of range: fallback name preserved
    packLabels.sync([{ id: "t1", entity: ent, name: `§e${pack} Name` }], [v(100)], dims);
    assert.equal(ent.nameTag, `§e${pack} Name`, `${pack}: keeps canonical native nameTag when out of observerRange`);
    assert.equal(dims[0].getEntities({ type: labelType }).length, 0);

    // In range + success: single helper carries name, native suppressed
    packLabels.sync([{ id: "t1", entity: ent, name: `§e${pack} Name` }], [v(5)], dims);
    assert.equal(ent.nameTag, "§r", `${pack}: native nameTag suppressed when helper is live`);
    assert.equal(dims[0].getEntities({ type: labelType })[0]?.nameTag, `§e${pack} Name`);

    // Helper removed/unloaded + spawn throws during speech update: native nameTag falls back to speech line
    dims[0].getEntities({ type: labelType })[0].remove();
    const savedSpawn = dims[0].spawnEntity.bind(dims[0]);
    dims[0].spawnEntity = () => {
      throw new Error("spawn blocked");
    };
    const origWarn2 = console.warn;
    console.warn = () => {};
    try {
      packLabels.sync([{ id: "t1", entity: ent, name: "§fHello traveler!" }], [v(5)], dims);
    } finally {
      console.warn = origWarn2;
      dims[0].spawnEntity = savedSpawn;
    }
    assert.equal(ent.nameTag, "§fHello traveler!", `${pack}: native nameTag falls back to speech line when helper fails`);
  }

  // 5. No pack script outside name-labels.js may assign SUPPRESSED_NAME directly to entity.nameTag / ent.nameTag.
  for (const { pack, main } of nativeNamePacks) {
    const mainSource = readFileSync(new URL(main, import.meta.url), "utf8");
    assert.doesNotMatch(
      mainSource,
      /\b(entity|ent)\.nameTag\s*=(?!=)\s*[^;\n]*SUPPRESSED_NAME/,
      `${pack} must not assign SUPPRESSED_NAME directly outside name-labels.js`,
    );
  }
});

test("townsfolk still resend their helper names for near viewers within 20 blocks and exclude helpers from saved skins", () => {
  const npcMain = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  const caravanMain = readFileSync(new URL("../packs/caravan_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(npcMain, /const NAME_RANGE = 20;/);
  assert.match(npcMain, /getPlayers\(\{ location: entity\.location, maxDistance: NAME_RANGE \}\)/);
  assert.match(npcMain, /nameLabels\.removeFor\(id\)/);
  assert.match(caravanMain, /nameLabels\.removeFor\(String\(i\)\)/);

  // Verify that when a new viewer enters within 20 blocks of an already-suppressed NPC, createNameLabels
  // resends BOTH the helper caption AND the native suppressed nameTag ("§r" <-> "§r§r", or marker <-> marker+"§r")
  // after 1 sync step and 3 sync steps so the Bedrock client refreshes its cached default "NPC" nameplate.
  const { dimensions, target } = probeWorld();
  const labels = createNameLabels({
    labelType: "realm:npc_label",
    ownerTag: "realm:npc_owner:npc_bp",
    labelTag: "realm:npc_label",
    labelIdTag: "realm:npc_label_id:",
  });
  const v1 = { id: "v1", name: "Viewer1", isValid: true, dimension: dimensions[0], location: { x: 5, y: 4, z: 0 }, getGameMode: () => "survival" };
  const v2 = { id: "v2", name: "Viewer2", isValid: true, dimension: dimensions[0], location: { x: 6, y: 4, z: 0 }, getGameMode: () => "survival" };

  // Initial spawn with Viewer1:
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1], dimensions);
  const [helper] = dimensions[0].getEntities({ type: "realm:npc_label" });
  assert.equal(target.nameTag, "§r");
  assert.equal(helper.nameTag, "§eIda §7the Blacksmith");

  // Viewer2 joins within 20m while target is already "§r":
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1, v2], dimensions);
  // 1 step later (~1s): both helper and native suppressed nameTag toggle to their §r-suffixed variants
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1, v2], dimensions);
  assert.equal(target.nameTag, "§r§r", "native suppressed nameTag toggles to §r§r 1s after a new near viewer joins");
  assert.equal(helper.nameTag, "§eIda §7the Blacksmith§r", "helper caption toggles to §r-suffixed form 1s after join");

  // 3 steps later (~3s): both toggle back to their base forms
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1, v2], dimensions);
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1, v2], dimensions);
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [v1, v2], dimensions);
  assert.equal(target.nameTag, "§r", "native suppressed nameTag toggles back to §r 3s later");
  assert.equal(helper.nameTag, "§eIda §7the Blacksmith", "helper caption toggles back to base form 3s later");
});

test("saga Transformed handler only removes/respawns its own uniquely marked actor, leaving adjacent §r or foreign-marked witches and ambiguous actors untouched", () => {
  const actorsSource = readFileSync(new URL("../packs/saga_bp/scripts/actors.js", import.meta.url), "utf8");
  const handlers = [];
  const spawned = [];
  const actors = new Map();
  const actorMarker = (id) => encodeHiddenMarker("7a", id);
  const context = {
    ACTOR: "saga:actor",
    ADD: "saga:add",
    LABEL_TYPE: "realm:saga_label",
    LABEL_TAG: "realm:saga_label",
    LABEL_ID_TAG: "realm:saga_label_id:",
    SUPPRESSED_NAME: "§r",
    TURNED: /^minecraft:(witch|zombie_villager|zombie_villager_v2)$/,
    actors,
    names: new Set(["§ePell the Pilgrim"]),
    dressing: new Map(),
    nameLabels: { removeFor() {} },
    actorMarker,
    isSuppressedName,
    matchesHiddenMarker,
    dist3: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    poof() {},
    spawnActor(dim, type, at, opts) {
      spawned.push({ dim, type, at: { ...at }, opts });
    },
    onLost() {},
    system: { run: (fn) => fn() },
    world: {
      afterEvents: {
        entitySpawn: { subscribe: (fn) => handlers.push(fn) },
      },
    },
  };
  const start = actorsSource.indexOf("// A story villager struck by lightning");
  const end = actorsSource.indexOf("// An actor or story mob nobody knows");
  runInNewContext(actorsSource.slice(start, end), context);
  assert.equal(handlers.length, 1);

  const dim = { id: "minecraft:overworld" };
  // Invalid saga actor at (100, 64, 100), while an adjacent wanderer or foreign villager 1m away at (101, 64, 100)
  // is struck by lightning into a witch with bare "§r" or a wander_bp marker.
  actors.set("actor-1", {
    ent: { id: "actor-1", isValid: false, location: { x: 100, y: 64, z: 100 } },
    marker: actorMarker("actor-1"),
    anchor: { x: 100, y: 64, z: 100 },
    owner: "player-1",
    key: "w_pell_road:chapel:0",
    role: "escort",
    dim: dim.id,
    type: "minecraft:villager_v2",
    opts: { owner: "player-1", key: "w_pell_road:chapel:0", role: "escort", name: "§ePell the Pilgrim" },
  });
  for (const foreignName of ["§r", "§r§r", encodeHiddenMarker("b4", "road:pell"), `${encodeHiddenMarker("b4", "road:pell")}§r`]) {
    const wandererWitch = {
      typeId: "minecraft:witch",
      nameTag: foreignName,
      isValid: true,
      dimension: dim,
      location: { x: 100.8, y: 64, z: 100 },
      removed: false,
      remove() {
        this.removed = true;
        this.isValid = false;
      },
    };
    handlers[0]({ entity: wandererWitch, cause: "Transformed" });
    assert.equal(wandererWitch.removed, false, `saga must NOT remove an adjacent <1m foreign witch (${JSON.stringify(foreignName)})`);
    assert.equal(actors.has("actor-1"), true, "invalid saga actor must NOT be consumed by adjacent foreign witch");
    assert.equal(spawned.length, 0, "saga must NOT respawn Pell at the foreign witch's coordinates");
  }

  // Legitimate transformation of saga's own actor carrying its resend-toggled (`${actorMarker}§r`) marker: removed and respawned in place.
  const ownWitch = {
    typeId: "minecraft:witch",
    nameTag: `${actorMarker("actor-1")}§r`,
    isValid: true,
    dimension: dim,
    location: { x: 100, y: 64, z: 100 },
    removed: false,
    remove() {
      this.removed = true;
      this.isValid = false;
    },
  };
  handlers[0]({ entity: ownWitch, cause: "Transformed" });
  assert.equal(ownWitch.removed, true, "saga removes its own uniquely marked transformed witch (including resend §r variant)");
  assert.equal(actors.has("actor-1"), false, "matched invalid actor entry cleaned up");
  assert.equal(spawned.length, 1, "legitimate saga actor respawned where it stood");
  assert.deepEqual(spawned[0].at, { x: 100, y: 64, z: 100 });
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

test("a spawn that hands back another entity (repeating entity ids) is never tagged or named as a helper", () => {
  const { dimensions, target, viewer } = probeWorld();
  const labels = createNameLabels({ labelType: "realm:npc_label", ownerTag: "realm:npc_owner:npc_bp", labelTag: "realm:npc_label", labelIdTag: "realm:npc_label_id:" });
  // An existing dropped item comes back from every spawnEntity call.
  const item = { id: "item-1", typeId: "minecraft:item", nameTag: "", isValid: true, tags: [], location: { x: 0, y: 6, z: 0 }, dimension: dimensions[0],
    addTag(tag) { this.tags.push(tag); }, teleport(at) { this.location = { ...at }; }, remove() { this.isValid = false; } };
  const origSpawn = dimensions[0].spawnEntity.bind(dimensions[0]);
  dimensions[0].spawnEntity = () => item;
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(5)], dimensions);
  } finally {
    console.warn = origWarn;
  }
  assert.deepEqual(item.tags, [], "the item got no helper tags");
  assert.equal(item.nameTag, "", "the item was not named");
  assert.equal(item.isValid, true, "the item is not ours to remove");
  assert.equal(target.nameTag, "§eIda §7the Blacksmith", "the target keeps its own name while no helper exists");
  dimensions[0].spawnEntity = origSpawn;
  labels.sync([{ id: "ida", entity: target, name: "§eIda §7the Blacksmith" }], [viewer(5)], dimensions);
  assert.equal(dimensions[0].getEntities({ type: "realm:npc_label" }).length, 1, "a real helper once spawning works");
});
