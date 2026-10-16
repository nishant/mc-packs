import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const packs = ["npc_bp", "wander_bp", "caravan_bp", "saga_bp"];
const helperPath = new URL("../packs/npc_bp/scripts/name-labels.js", import.meta.url);
const helper = existsSync(helperPath) ? await import(helperPath) : undefined;

function setup() {
  const entities = [];
  let blockReads = 0;
  let wall;
  const dim = {
    id: "minecraft:overworld",
    getBlock(pos) {
      blockReads++;
      if (wall?.(pos)) return { isAir: false, isLiquid: false, typeId: "minecraft:stone" };
      return { isAir: true, isLiquid: false, typeId: "minecraft:air" };
    },
    spawnEntity(typeId, location) {
      const entity = {
        id: `label-${entities.length}`, typeId, location, dimension: dim, isValid: true, nameTag: "", tags: [],
        addTag(tag) { this.tags.push(tag); },
        teleport(pos, options) { this.location = pos; this.dimension = options.dimension; },
        remove() { this.isValid = false; },
      };
      entities.push(entity);
      return entity;
    },
  };
  const player = {
    dimension: dim, location: { x: 0, y: 0, z: 0 },
    getHeadLocation() { return { ...this.location, y: this.location.y + 1.6 }; },
    getGameMode() { return "Survival"; },
  };
  const options = {
    labels: new Map(), targets: [{ id: "ida", dim: dim.id, x: 38, y: 0, z: 0, name: "§eIda §7the Relicsmith" }],
    players: [player], maxRange: 120, labelType: "realm:npc_label", ownerTag: "realm:npc_owner:npc_bp",
    labelTag: "realm:npc_label", labelIdTag: "realm:npc_label_id:", dimension: () => dim,
  };
  return {
    options, entities, player, dim,
    reads: () => blockReads,
    wall: (fn) => { wall = fn; },
    update() {
      assert.ok(helper, "projected name helper exists");
      helper.updateNameLabels(options);
    },
  };
}

test("all four independent packs ship the same projection helper and their own data entity", () => {
  assert.ok(helper, "projected name helper exists");
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
    assert.match(config, /farNameRange: 120/);
    assert.match(settings, /key: "farNameRange".*min: 0, max: 200, step: 10/);
  }
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

for (const typeId of [
  "minecraft:light_block", "minecraft:light_block_15",
  "rdl:light_block_default", "rdl:light_block_soul", "rdl:light_block_copper", "rdl:light_block_white",
  "minecraft:oak_door", "minecraft:oak_trapdoor", "minecraft:oak_fence", "minecraft:oak_fence_gate",
  "minecraft:oak_wall_sign", "minecraft:oak_hanging_sign", "minecraft:lantern", "minecraft:chain",
  "minecraft:iron_bars", "minecraft:glass_pane", "minecraft:white_stained_glass_pane", "minecraft:oak_leaves",
]) {
  test(`${typeId} does not pull a projected label into the camera`, () => {
    const f = setup();
    f.dim.getBlock = (pos) => ({
      isAir: pos.x !== 0, isLiquid: false, typeId: pos.x === 0 ? typeId : "minecraft:air",
    });
    assert.equal(helper.firstWallDist(f.dim, f.player.getHeadLocation(), 1, 0, 0, 8.5), undefined);
    f.update();
    const eye = f.player.getHeadLocation(), pos = f.options.labels.get("ida").location;
    assert.ok(Math.abs(Math.hypot(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z) - 7.5) < 1e-10);
  });
}

for (const fishing of ["Mainhand", "Offhand", "nearby bobber"]) {
  function enableFishing(f) {
    f.player.getComponent = (id) => id === "minecraft:equippable" ? {
      getEquipment: (slot) => ({ typeId: slot === fishing ? "minecraft:fishing_rod" : "minecraft:stone" }),
    } : undefined;
    f.dim.getEntities = (query) => {
      assert.deepEqual(query, { type: "minecraft:fishing_hook", location: f.player.location, maxDistance: 24 });
      return fishing === "nearby bobber" ? [{}] : [];
    };
  }

  test(`fishing (${fishing}) keeps nearby labels above their target even behind a wall`, () => {
    const f = setup();
    f.options.targets[0].x = 10;
    f.wall(() => true);
    enableFishing(f);
    f.update();
    assert.deepEqual(f.options.labels.get("ida")?.location, { x: 10, y: 2.05, z: 0 });
  });

  test(`fishing (${fishing}) removes distant projections and prevents new ones until fishing ends`, () => {
    const f = setup();
    f.update();
    const old = f.options.labels.get("ida");
    enableFishing(f);
    f.update();
    assert.equal(f.options.labels.size, 0);
    assert.equal(old.isValid, false);
    f.update();
    assert.equal(f.entities.length, 1, "no new in-air label was spawned");
    f.player.getComponent = () => undefined;
    f.dim.getEntities = () => [];
    f.update();
    assert.equal(f.options.labels.size, 1, "projection resumes after fishing");
  });
}

test("120-block range needs no view direction or aiming check", () => {
  const f = setup();
  f.options.targets[0].x = 110;
  f.update();
  assert.ok(f.options.labels.get("ida").nameTag.includes("(110m)"));
  f.options.targets[0].x = 125;
  f.update();
  assert.equal(f.options.labels.size, 0);
});

test("a distant label stays on the overhead ray and under nine blocks from the camera", () => {
  const f = setup();
  f.update();
  const label = f.options.labels.get("ida");
  assert.ok(label?.isValid);
  const eye = f.player.getHeadLocation(), pos = label.location;
  assert.ok(Math.hypot(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z) < 9);
  assert.ok(Math.abs((pos.y - eye.y) / pos.x - (2.25 - eye.y) / 38) < 1e-10);
  assert.equal(label.nameTag, "§eIda §7the Relicsmith §8(38m)");
  assert.ok(label.tags.includes("realm:npc_label_id:ida"));
});

test("an obstructed label is in front of a wall, including up close", () => {
  const f = setup();
  f.wall((pos) => pos.x >= 4 && pos.x < 5);
  f.update();
  assert.ok(f.options.labels.get("ida").location.x < 4);
  f.options.targets[0].x = 6;
  f.update();
  assert.ok(f.options.labels.get("ida").location.x < 4);
});

test("clear nearby names keep the always-visible overhead label above the NPC", () => {
  const f = setup();
  f.update();
  const label = f.options.labels.get("ida");
  f.options.targets[0].x = 4;
  f.update();
  assert.equal(f.options.labels.size, 1);
  assert.equal(label.isValid, true);
  assert.equal(label.location.x, 4);
  assert.equal(label.location.y, 2.05);
  assert.equal(label.nameTag, "§eIda §7the Relicsmith");
});

for (const why of ["disabled", "out of range", "spectator", "other dimension", "removed target"]) {
  test(`labels are removed when ${why}`, () => {
    const f = setup();
    f.update();
    const label = f.options.labels.get("ida");
    if (why === "disabled") f.options.maxRange = 0;
    if (why === "out of range") f.player.location.x = -100;
    if (why === "spectator") f.player.getGameMode = () => "Spectator";
    if (why === "other dimension") f.player.dimension = { id: "minecraft:nether" };
    if (why === "removed target") f.options.targets = [];
    f.update();
    assert.equal(f.options.labels.size, 0);
    assert.equal(label.isValid, false);
  });
}

test("distant targets do no block reads", () => {
  const f = setup();
  f.player.location.x = -1000;
  f.update();
  assert.equal(f.reads(), 0);
  assert.equal(f.entities.length, 0);
});

test("the closest eligible player owns the projection", () => {
  const f = setup();
  f.options.players.push({ ...f.player, location: { x: 35, y: 0, z: 0 } });
  f.update();
  assert.equal(f.options.labels.size, 1, "the nearby player anchors the overhead label above Ida");
  assert.equal(f.options.labels.get("ida").location.x, 38);
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
  assert.equal(f.options.labels.get("ida").dimension, nether);
});

test("a wall beside the camera does not get skipped or put the label inside it", () => {
  const f = setup();
  f.player.location.x = 0.9;
  f.wall((pos) => pos.x === 1);
  f.update();
  assert.ok(f.options.labels.get("ida").location.x < 1);
});

test("a roof above the camera keeps its label below the ceiling", () => {
  const f = setup();
  f.options.targets[0] = { ...f.options.targets[0], x: 0, y: 30 };
  f.wall((pos) => pos.y === 3);
  f.update();
  assert.ok(f.options.labels.get("ida").location.y < 3);
});

test("an unloaded ray drops its stale projection without stopping the next target", () => {
  const f = setup();
  f.update();
  const old = f.options.labels.get("ida");
  f.dim.getBlock = () => { throw new Error("unloaded chunk"); };
  assert.doesNotThrow(() => f.update());
  assert.equal(f.options.labels.size, 0);
  assert.equal(old.isValid, false);
});

test("the townsfolk idle loop skips entity and block work beyond its active range", () => {
  const main = readFileSync(new URL("../packs/npc_bp/scripts/main.js", import.meta.url), "utf8");
  const source = main.slice(main.indexOf("let loops = 0;"), main.indexOf("world.afterEvents.worldLoad.subscribe("));
  let entityReads = 0;
  const state = { missing: 2, viewers: new Set(["player"]) };
  const context = {
    get: (key) => ({ enabled: true, farNameRange: 120, faceRange: 8 })[key],
    NAME_RANGE: 64, CONFIG: { respawnRange: 24, idleRange: 12 }, MISSING_EVERY: 4,
    world: { getAllPlayers: () => [{ dimension: { id: "minecraft:overworld" }, location: { x: 0, y: 0, z: 0 } }] },
    list: [{ id: "ida", dim: "minecraft:overworld", x: 1000, y: 0, z: 0 }],
    folk: new Map([["ida", {}]]), states: new Map([["ida", state]]),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    entityOf: () => { entityReads++; },
    dayTick() {}, console,
  };
  runInNewContext(`${source}\nfor (let i = 0; i < 8; i++) loop();`, context);
  assert.equal(entityReads, 0);
  assert.equal(state.missing, 0);
  assert.equal(state.viewers, undefined);
});
