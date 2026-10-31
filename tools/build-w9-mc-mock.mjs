// Offline @minecraft/server stand-in for Easy Building action tests. Not a pack file.
const props = new Map();
const players = [];
const intervals = new Map();
const periods = new Map();
let respectPeriods = false;
let nextId = 1;

/** event key ("world.before.playerInteractWithBlock") -> subscribed callbacks, for tests that fire events */
const handlers = new Map();
function events(scope) {
  return new Proxy({}, {
    get(_, name) {
      return {
        subscribe(fn) {
          const key = `${scope}.${String(name)}`;
          if (!handlers.has(key)) handlers.set(key, []);
          handlers.get(key).push(fn);
          return fn;
        },
        unsubscribe() {},
      };
    },
  });
}
/** Calls every callback subscribed to `key` (e.g. "world.before.playerInteractWithBlock") with ev. */
export function fireEvent(key, ev) {
  for (const fn of handlers.get(key) ?? []) fn(ev);
  return ev;
}

export class Player {}
const formQueue = [];
export const shownForms = [];
export function queueForm(response) { formQueue.push(response); }
export class ActionFormData {
  constructor() { this.buttons = []; this.titleText = ""; this.bodyText = ""; }
  title(text) { this.titleText = text; return this; }
  body(text) { this.bodyText = text; return this; }
  button(label) { this.buttons.push(String(label)); return this; }
  divider() { return this; }
  show() {
    shownForms.push(this);
    const next = formQueue.shift();
    return Promise.resolve(typeof next === "function" ? next(this) : (next ?? { canceled: true }));
  }
}
export class ModalFormData { show() { return Promise.resolve({ canceled: true }); } }
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
export class CustomCommandRegistry {}
export class System {}
export class World {}
export class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
  }
}
export const EquipmentSlot = { Mainhand: "Mainhand" };
export const GameMode = { Survival: "Survival", Creative: "Creative", Adventure: "Adventure", Spectator: "Spectator" };
export const CommandPermissionLevel = { GameDirectors: 3 };
export const CustomCommandStatus = { Success: 0, Failure: 1 };
let resolveCalls = 0;
export function resolveCount() { return resolveCalls; }
export function resetResolveCount() { resolveCalls = 0; }
export const BlockPermutation = {
  resolve(typeId, states = {}) {
    resolveCalls++;
    if (typeId === "minecraft:end_gateway" || typeId === "minecraft:apple" || typeId === "minecraft:diamond_sword") throw new Error("unknown block");
    if (/_bed$/.test(String(typeId)) && typeId !== "minecraft:bed" && typeId !== "minecraft:straw_bed") {
      throw new Error("unknown block");
    }
    const copy = { ...states };
    return {
      typeId,
      getAllStates() { return { ...copy }; },
      withState(key, value) { return BlockPermutation.resolve(typeId, { ...copy, [key]: value }); },
    };
  },
};

const dimensions = new Map();
function dimension(id) {
  if (!dimensions.has(id)) dimensions.set(id, makeDimension(id));
  return dimensions.get(id);
}
function makeDimension(id) {
  const blocks = new Map();
  return {
    id,
    getBlock(pos) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      if (!blocks.has(key)) blocks.set(key, makeBlock("minecraft:air", {}));
      return blocks.get(key);
    },
    runCommand() { return { successCount: 1 }; },
    spawnItem() { return null; },
    spawnParticle() {},
  };
}
function makeBlock(typeId, states) {
  const block = {
    typeId,
    location: { x: 0, y: 0, z: 0 },
    isAir: typeId === "minecraft:air",
    permutation: BlockPermutation.resolve(typeId === "minecraft:end_gateway" ? "minecraft:bedrock" : typeId, states),
    setPermutation(perm) {
      block.typeId = perm.typeId;
      block.isAir = perm.typeId === "minecraft:air";
      block.permutation = perm;
    },
    setType(next) {
      block.typeId = next;
      block.isAir = next === "minecraft:air";
      const states = next === "minecraft:air" ? {} : block.permutation.getAllStates();
      try { block.permutation = BlockPermutation.resolve(next, states); } catch { block.permutation = BlockPermutation.resolve("minecraft:air"); }
    },
  };
  return block;
}

export const world = {
  getDynamicProperty(key) { return props.get(key); },
  setDynamicProperty(key, value) {
    if (value === undefined) props.delete(key);
    else props.set(key, value);
  },
  getDimension: dimension,
  getAllPlayers() { return players.slice(); },
  afterEvents: events("world.after"),
  beforeEvents: events("world.before"),
  getLootTableManager() { return undefined; },
};
export const system = {
  currentTick: 1,
  runInterval(fn, every = 1) {
    const id = nextId++;
    intervals.set(id, fn);
    periods.set(id, Math.max(1, Number(every) || 1));
    return id;
  },
  runTimeout(fn) { return nextId++; },
  run(fn) { fn(); },
  clearRun(id) { intervals.delete(id); },
  sendScriptEvent() {},
  afterEvents: events("system.after"),
  beforeEvents: events("system.before"),
};
/** Off by default (every interval runs every tick, as the older tests expect); on: each runs every `every` ticks. */
export function setRespectPeriods(on) { respectPeriods = !!on; }
export function flushIntervals(max = 30) {
  for (let n = 0; n < max && intervals.size; n++) {
    system.currentTick++;
    for (const [id, fn] of [...intervals]) {
      if (respectPeriods && system.currentTick % (periods.get(id) ?? 1) !== 0) continue;
      fn();
    }
  }
}
export function addPlayer(player) { players.push(player); }
export function resetWorld() {
  props.clear();
  players.length = 0;
  intervals.clear();
  dimensions.clear();
  system.currentTick = 1;
}
