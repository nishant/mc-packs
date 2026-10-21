// Saga story characters' nameplate sync (actors.js) leaves spectators out before it reads them: the observers come
// from world.getPlayers({ excludeGameModes: [Spectator] }) and the helper runs with spectatorsExcluded, like the
// other label users (npc, wander, caravan).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const STUB_PREFIX = "saga-test-stub:";
const STUBS = {
  "@minecraft/server": `
    export const GameMode = { Survival: "survival", Creative: "creative", Adventure: "adventure", Spectator: "spectator" };
    export const CommandPermissionLevel = { any: 0, gamedirector: 1, admin: 2, host: 3, owner: 4 };
    export class Player {}
    export const system = globalThis.__sagaStub.system;
    export const world = globalThis.__sagaStub.world;
  `,
  "@minecraft/server-ui": `
    export class ActionFormData {}
    export class MessageFormData {}
    export class ModalFormData {}
    export class FormCancelationReason {}
    export const uiManager = {};
  `,
};

registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(STUBS, specifier)) return { url: `${STUB_PREFIX}${specifier}`, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(STUB_PREFIX)) return { format: "module", source: STUBS[url.slice(STUB_PREFIX.length)], shortCircuit: true };
    return next(url, context);
  },
});

let dimensions = new Map();
let players = [];
let getPlayersCalls = [];
let getAllPlayersCalls = 0;
let gameModeReads = 0;

function makeEntity(dimension, typeId, location, id) {
  return {
    id,
    typeId,
    location: { ...location },
    dimension,
    nameTag: "",
    isValid: true,
    tags: [],
    addTag(tag) {
      this.tags.push(tag);
    },
    hasTag(tag) {
      return this.tags.includes(tag);
    },
    getTags() {
      return [...this.tags];
    },
    addEffect() {},
    teleport(at) {
      this.location = { ...at };
    },
    remove() {
      this.isValid = false;
    },
    getHeadLocation() {
      return { ...this.location, y: this.location.y + 1.8 };
    },
    matches() {
      return false;
    },
    triggerEvent() {},
  };
}

function makeDimension(id) {
  const dimension = {
    id,
    entities: [],
    spawnEntity(typeId, location) {
      const entity = makeEntity(dimension, typeId, location, `${id}-${dimension.entities.length + 1}`);
      dimension.entities.push(entity);
      return entity;
    },
    getEntities(query = {}) {
      return dimension.entities.filter(
        (e) => e.isValid && (!query.type || e.typeId === query.type) && (!query.tags || query.tags.every((t) => e.tags.includes(t))),
      );
    },
    // Like the game's Dimension.getPlayers: only the players in this dimension, the same query options.
    getPlayers(options = {}) {
      getPlayersCalls.push(options);
      const excluded = options.excludeGameModes ?? [];
      return players.filter((p) => p.dimension === dimension && !excluded.includes(p.mode));
    },
  };
  return dimension;
}

globalThis.__sagaStub = {
  system: { currentTick: 0, runInterval() {}, run(fn) { fn(); } },
  world: {
    afterEvents: { entitySpawn: { subscribe() {} }, entityLoad: { subscribe() {} } },
    // Like the game's world.getEntity: the entity with that id while it exists.
    getEntity(id) {
      for (const d of dimensions.values()) for (const e of d.entities) if (e.id === id && e.isValid) return e;
      return undefined;
    },
    getAllPlayers() {
      getAllPlayersCalls++;
      return [...players];
    },
    getPlayers(options = {}) {
      getPlayersCalls.push(options);
      const excluded = options.excludeGameModes ?? [];
      return players.filter((p) => !excluded.includes(p.mode));
    },
    getDimension(id) {
      const dimension = dimensions.get(id);
      if (!dimension) throw new Error(`no dimension ${id}`);
      return dimension;
    },
  },
};

const actorsModule = await import("../packs/saga_bp/scripts/actors.js");
const { actors, removeActors, spawnActor, updateActorLabels } = actorsModule;

function reset() {
  removeActors({});
  dimensions = new Map(["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map((id) => [id, makeDimension(id)]));
  players = [];
  getPlayersCalls = [];
  getAllPlayersCalls = 0;
  gameModeReads = 0;
  return dimensions.get("minecraft:overworld");
}

function addPlayer(id, x, mode, dimension) {
  const player = {
    id,
    name: id,
    isValid: true,
    mode,
    dimension,
    location: { x, y: 64, z: 0 },
    getGameMode() {
      gameModeReads++;
      return mode;
    },
  };
  players.push(player);
  return player;
}

function spawnIda(dimension) {
  return spawnActor(dimension, "minecraft:npc", { x: 0, y: 64, z: 0 }, { owner: "p-owner", key: "scene", role: "meet", name: "Ida" });
}

const helpers = (dimension) => dimension.entities.filter((e) => e.typeId === "realm:saga_label" && e.isValid);

test("saga label sync asks for observers without spectators, not through getAllPlayers", () => {
  const overworld = reset();
  addPlayer("survivor", 2, "survival", overworld);
  spawnIda(overworld);
  getPlayersCalls = [];
  getAllPlayersCalls = 0;
  updateActorLabels();
  assert.equal(getAllPlayersCalls, 0, "the label sync must not read every player");
  assert.ok(getPlayersCalls.length >= 1, "the label sync asks getPlayers (the world's or a dimension's) for its observers");
  assert.deepEqual(getPlayersCalls.at(-1).excludeGameModes, ["spectator"], "spectators are left out by the query");
});

test("a spectator alone near a story character gets no nameplate helper and is never read", () => {
  const overworld = reset();
  addPlayer("watcher", 2, "spectator", overworld);
  spawnIda(overworld);
  updateActorLabels();
  assert.equal(helpers(overworld).length, 0, "a spectator is not a viewer of the nameplate");
  assert.equal(gameModeReads, 0, "spectators are excluded before their game mode is read");
});

test("a survival player near a story character still gets its nameplate helper", () => {
  const overworld = reset();
  addPlayer("survivor", 2, "survival", overworld);
  spawnIda(overworld);
  updateActorLabels();
  assert.ok(helpers(overworld).length >= 1, "a survival observer keeps seeing the nameplate");
});

test("with no story character to label, the sync reads no observers", () => {
  const overworld = reset();
  addPlayer("survivor", 2, "survival", overworld);
  updateActorLabels();
  assert.equal(getAllPlayersCalls, 0);
  assert.equal(getPlayersCalls.length, 0);
  assert.equal(actors.size, 0);
});
