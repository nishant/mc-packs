import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const packs = ["wander_bp", "caravan_bp", "saga_bp"];
const helperPath = new URL("../packs/caravan_bp/scripts/name-labels.js", import.meta.url);
const helper = existsSync(helperPath) ? await import(helperPath) : undefined;

function setup() {
  const entities = [];
  let blockReads = 0;
  let block;
  const dim = {
    id: "minecraft:overworld",
    getBlock(pos) {
      blockReads++;
      return block?.(pos) ?? { isAir: true, isLiquid: false, typeId: "minecraft:air" };
    },
    spawnEntity(typeId, location) {
      const entity = {
        id: `label-${entities.length}`,
        typeId,
        location,
        dimension: dim,
        isValid: true,
        nameTag: "",
        tags: [],
        addTag(tag) {
          this.tags.push(tag);
        },
        teleport(pos, options) {
          this.location = pos;
          this.dimension = options.dimension;
        },
        remove() {
          this.isValid = false;
        },
      };
      entities.push(entity);
      return entity;
    },
  };
  const player = {
    id: "player",
    dimension: dim,
    location: { x: 0, y: 0, z: 0 },
    getHeadLocation() {
      return { ...this.location, y: this.location.y + 1.6 };
    },
    getGameMode() {
      return "Survival";
    },
  };
  const options = {
    labels: new Map(),
    targets: [{ id: "ida", dim: dim.id, x: 18, y: 0, z: 0, name: "§eIda §7the Relicsmith" }],
    players: [player],
    maxRange: 20,
    labelType: "realm:npc_label",
    ownerTag: "realm:npc_owner:npc_bp",
    labelTag: "realm:npc_label",
    labelIdTag: "realm:npc_label_id:",
    dimension: () => dim,
  };
  return {
    options,
    entities,
    player,
    dim,
    reads: () => blockReads,
    block: (fn) => {
      block = fn;
    },
    update() {
      assert.ok(helper, "name-label helper exists");
      helper.updateNameLabels(options);
    },
  };
}

test("wanderers, caravans and story actors still ship identical projected-label helpers", () => {
  assert.ok(helper, "name-label helper exists");
  const source = readFileSync(helperPath, "utf8");
  for (const pack of packs) {
    assert.equal(readFileSync(new URL(`../packs/${pack}/scripts/name-labels.js`, import.meta.url), "utf8"), source);
    const manifest = JSON.parse(readFileSync(new URL(`../packs/${pack}/manifest.json`, import.meta.url), "utf8"));
    assert.ok(manifest.modules.some((m) => m.type === "data"), `${pack} loads its label entity`);
    const labelType = `realm:${pack.replace("_bp", "")}_label`;
    const entity = JSON.parse(readFileSync(new URL(`../packs/${pack}/entities/${labelType.slice(6)}.json`, import.meta.url), "utf8"))["minecraft:entity"];
    assert.equal(entity.description.identifier, labelType, "distinct label identifiers and file paths also merge in the bundle");
    assert.equal(entity.components["minecraft:nameable"].always_show, true);
    assert.equal(entity.components["minecraft:physics"].has_collision, false);
    const config = readFileSync(new URL(`../packs/${pack}/scripts/config.js`, import.meta.url), "utf8");
    const settings = readFileSync(new URL(`../packs/${pack}/scripts/settings.js`, import.meta.url), "utf8");
    assert.match(config, /farNameRange: 20/);
    assert.match(settings, /key: "farNameRange".*min: 0, max: 200, step: 10/);
  }
});

test("npc townsfolk no longer ship projected-label assets or settings", () => {
  const npcMain = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  const npcConfig = readFileSync(new URL("../packs/npc_bp/scripts/config.js", import.meta.url), "utf8");
  const npcSettings = readFileSync(new URL("../packs/npc_bp/scripts/settings.js", import.meta.url), "utf8");
  assert.doesNotMatch(npcMain, /updateNameLabels/);
  assert.doesNotMatch(npcMain, /labelType:/);
  assert.doesNotMatch(npcConfig, /farNameRange:/);
  assert.doesNotMatch(npcSettings, /key: "farNameRange"/);
  assert.match(npcMain, /const LEGACY_LABEL_TYPE = "realm:npc_label";/);
  assert.match(npcMain, /function removeLegacyLabel\(entity\)/);
  assert.match(npcMain, /getEntities\(\{ type: LEGACY_LABEL_TYPE \}\)/);
  assert.equal(existsSync(new URL("../packs/npc_bp/scripts/name-labels.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../packs/npc_bp/entities/npc_label.json", import.meta.url)), false);
  assert.equal(existsSync(new URL("../packs/build_rp/entity/npc_label.entity.json", import.meta.url)), false);
});

test("projected-label packs still migrate legacy saved 120-block ranges down to 20 blocks", () => {
  const readers = [
    "../packs/wander_bp/scripts/main.js",
    "../packs/caravan_bp/scripts/main.js",
    "../packs/saga_bp/scripts/actors.js",
  ];
  for (const path of readers) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /rawRange === 120 \? 20 : rawRange/);
  }
});

test("townsfolk still resend their native names for near viewers within 20 blocks", () => {
  const npcMain = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(npcMain, /const NAME_RANGE = 20;/);
  assert.match(npcMain, /getPlayers\(\{ location: entity\.location, maxDistance: NAME_RANGE \}\)/);
});

test("all label entities have zero collision and an underground zero-sized hitbox", () => {
  for (const pack of packs) {
    const name = pack.replace("_bp", "");
    const definition = JSON.parse(readFileSync(new URL(`../packs/${pack}/entities/${name}_label.json`, import.meta.url), "utf8"));
    assert.equal(definition.format_version, "1.21.40", pack);
    const components = definition["minecraft:entity"].components;
    assert.deepEqual(components["minecraft:collision_box"], { width: 0, height: 0 }, pack);
    assert.deepEqual(components["minecraft:custom_hit_test"], {
      hitboxes: [{ pivot: [0, -48, 0], width: 0, height: 0 }],
    }, pack);
    assert.equal(components["minecraft:damage_sensor"].triggers.deals_damage, "no", pack);
  }
});

test("labels stay anchored above the target instead of projecting toward the viewer", () => {
  const f = setup();
  f.block((pos) => (pos.x === 4 ? { isAir: false, isLiquid: false, typeId: "minecraft:stone" } : { isAir: true, isLiquid: false, typeId: "minecraft:air" }));
  f.update();
  const label = f.options.labels.get("ida");
  assert.ok(label?.isValid);
  assert.deepEqual(label.location, { x: 18, y: 2.05, z: 0 });
  assert.equal(f.reads(), 1, "only the anchored target block is checked");
  assert.match(label.nameTag, /^§eIda §7the Relicsmith(?: §8\(18m\))?$/);
  assert.ok(label.tags.includes("realm:npc_label_id:ida"));
});

test("labels appear only within 20 blocks and are removed once the viewer moves beyond range", () => {
  const f = setup();
  f.update();
  assert.equal(f.options.labels.size, 1);
  const label = f.options.labels.get("ida");
  f.player.location.x = -3;
  f.update();
  assert.equal(f.options.labels.size, 0);
  assert.equal(label?.isValid, false);
});

for (const why of ["disabled", "spectator", "other dimension", "removed target"]) {
  test(`labels are removed when ${why}`, () => {
    const f = setup();
    f.update();
    const label = f.options.labels.get("ida");
    if (why === "disabled") f.options.maxRange = 0;
    if (why === "spectator") f.player.getGameMode = () => "Spectator";
    if (why === "other dimension") f.player.dimension = { id: "minecraft:nether" };
    if (why === "removed target") f.options.targets = [];
    f.update();
    assert.equal(f.options.labels.size, 0);
    assert.equal(label?.isValid, false);
  });
}

test("disabled and out-of-range labels do no block reads and spawn nothing", () => {
  const disabled = setup();
  disabled.options.maxRange = 0;
  disabled.update();
  assert.equal(disabled.reads(), 0);
  assert.equal(disabled.entities.length, 0);

  const far = setup();
  far.player.location.x = -1000;
  far.update();
  assert.equal(far.reads(), 0);
  assert.equal(far.entities.length, 0);
});

test("the closest eligible player in the same dimension owns the label", () => {
  const f = setup();
  f.player.location.x = -1000;
  f.options.players.push({
    ...f.player,
    id: "near",
    location: { x: 17, y: 0, z: 0 },
    dimension: f.dim,
    getGameMode() {
      return "Survival";
    },
  });
  f.update();
  assert.equal(f.options.labels.size, 1);
  assert.deepEqual(f.options.labels.get("ida")?.location, { x: 18, y: 2.05, z: 0 });
});

test("invalid labels are replaced and orphan loads are removed", () => {
  const f = setup();
  f.update();
  const old = f.options.labels.get("ida");
  old.isValid = false;
  f.update();
  assert.notEqual(f.options.labels.get("ida"), old);
  helper.removeOrphanLabel(f.entities[1], f.options.labels, "realm:npc_label");
  assert.equal(f.entities[1].isValid, true);
  old.isValid = true;
  helper.removeOrphanLabel(old, f.options.labels, "realm:npc_label");
  assert.equal(old.isValid, false);
});

test("a label follows its target into another dimension", () => {
  const f = setup();
  f.update();
  const nether = { ...f.dim, id: "minecraft:nether" };
  f.player.dimension = nether;
  f.options.targets[0].dim = nether.id;
  f.options.dimension = () => nether;
  f.update();
  assert.equal(f.options.labels.get("ida")?.dimension, nether);
  assert.deepEqual(f.options.labels.get("ida")?.location, { x: 18, y: 2.05, z: 0 });
});

test("an unloaded anchor block drops its stale label without stopping the next target", () => {
  const f = setup();
  f.update();
  const old = f.options.labels.get("ida");
  f.dim.getBlock = () => {
    throw new Error("unloaded chunk");
  };
  assert.doesNotThrow(() => f.update());
  assert.equal(f.options.labels.size, 0);
  assert.equal(old?.isValid, false);
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
