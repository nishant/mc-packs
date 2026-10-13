// Treasure Maps: putting the land back. Every block a marker or a buried chest placed is recorded (with what was
// there before) in a world dynamic property as it is placed, and put back once the hunt no longer needs it: the
// leg's marker was found, the treasure was found, or the hunt was given up. Only blocks that are still what the
// hunt placed are restored (a block a player changed since is left alone), a chest only once it is empty (items
// are never destroyed), and only while nobody is within CLEAR_RADIUS blocks (or CLEAR_FORCE after it was due).
// Unloaded land is retried every few seconds, so a restart or a far-away hunt is cleaned up when its chunk loads.

import { BlockPermutation, system, world } from "@minecraft/server";

const LIST = "maps:undo"; // world: JSON list of record ids
const keyOf = (/** @type {string} */ id) => `maps:undo:${id}`;
const CLEAR_DELAY = 30000; // ms after the hunt is done with the blocks
const CLEAR_RADIUS = 32; // blocks: nobody this close
const CLEAR_FORCE = 10 * 60000; // ms after it was due: put back even with a player near (never a chest with items)
const CHEST_KEEP = 30 * 24 * 3600000; // ms: a chest still holding items is left in the ground for good after this
const ANY_WOOL = "*wool"; // a flag's cloth on a marker recorded before 1.3.0 (its color wasn't saved)

/**
 * @typedef {{ t: string, s?: Record<string, string | number | boolean> }} Kind a block type and its states
 * @typedef {object} UndoRecord
 * @property {string} id
 * @property {string} dim
 * @property {string} owner the player whose hunt placed it
 * @property {string} hunt the hunt id
 * @property {"mark" | "chest"} what
 * @property {number} due when the hunt let go of it (ms since 1970); 0 while the hunt still needs it
 * @property {Kind[]} types the block kinds `blocks` uses
 * @property {number[][]} blocks [x, y, z, placed kind, original kind]
 */

/** @returns {string[]} */
function ids() {
  try {
    const raw = world.getDynamicProperty(LIST);
    const v = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** @param {string} id @returns {UndoRecord | undefined} */
function load(id) {
  try {
    const raw = world.getDynamicProperty(keyOf(id));
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** @param {UndoRecord} r */
function save(r) {
  world.setDynamicProperty(keyOf(r.id), JSON.stringify(r));
  const list = ids();
  if (!list.includes(r.id)) world.setDynamicProperty(LIST, JSON.stringify([...list, r.id]));
}

/** @param {string} id */
function drop(id) {
  world.setDynamicProperty(keyOf(id), undefined);
  const list = ids().filter((x) => x !== id);
  world.setDynamicProperty(LIST, list.length ? JSON.stringify(list) : undefined);
}

/** A block's kind, to put it back later. @param {import("@minecraft/server").Block} b @returns {Kind} */
export function kindOf(b) {
  try {
    const s = b.permutation.getAllStates();
    return Object.keys(s).length ? { t: b.typeId, s } : { t: b.typeId };
  } catch {
    return { t: b.typeId };
  }
}

/**
 * Records blocks a hunt is about to place (or just placed). Returns the record id, to keep on the hunt.
 * @param {{ dim: string, owner: string, hunt: string, what: "mark" | "chest" }} at
 * @param {{ x: number, y: number, z: number, placed: string, orig: Kind }[]} list
 */
export function record(at, list) {
  /** @type {Kind[]} */
  const types = [];
  /** @param {Kind} k */
  const index = (k) => {
    const key = JSON.stringify(k);
    let i = types.findIndex((t) => JSON.stringify(t) === key);
    if (i < 0) i = types.push(k) - 1;
    return i;
  };
  const blocks = list.map((b) => [b.x, b.y, b.z, index({ t: b.placed }), index(b.orig)]);
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  save({ id, ...at, due: 0, types, blocks });
  return id;
}

/** The hunt is done with these blocks: put them back after a short wait. @param {string | undefined} id */
export function release(id) {
  if (!id) return;
  const r = load(id);
  if (!r) return;
  if (r.due) return;
  r.due = Date.now() + CLEAR_DELAY;
  save(r);
}

/** Records waiting (for tests and the operator). */
export const pending = () => ids().length;

/** @param {UndoRecord} r @returns {boolean} true when done with (put back, or nothing left to put back) */
function restore(r) {
  const dim = world.getDimension(r.dim);
  /** @type {import("@minecraft/server").Block[]} */
  const at = [];
  for (const [x, y, z] of r.blocks) {
    let b;
    try {
      b = dim.getBlock({ x, y, z });
      if (b) void b.typeId; // throws when the chunk is loaded but not ticking
    } catch {
      b = undefined;
    }
    if (!b) return false; // not loaded (or not ticking): later
    at.push(b);
  }
  const now = Date.now();
  if (now < r.due + CLEAR_FORCE) {
    const c = r.blocks[0];
    try {
      if (dim.getPlayers({ location: { x: c[0] + 0.5, y: c[1], z: c[2] + 0.5 }, maxDistance: CLEAR_RADIUS }).length) return false;
    } catch {
      return false;
    }
  }
  // Bottom up, so a two-block plant gets its lower half first.
  const order = r.blocks.map((b, i) => i).sort((a, b) => r.blocks[a][1] - r.blocks[b][1]);
  for (const i of order) {
    const [, , , placed, orig] = r.blocks[i];
    const b = at[i];
    const want = r.types[placed]?.t;
    const was = r.types[orig];
    if (!want || !was) continue;
    const still = want === ANY_WOOL ? b.typeId.endsWith("_wool") : b.typeId === want;
    if (!still) continue; // a player changed it: theirs now
    if (r.what === "chest") {
      const inv = b.getComponent("minecraft:inventory")?.container;
      if (inv && inv.emptySlotsCount < inv.size) return now > r.due + CHEST_KEEP; // treasure still in it: never destroyed
    }
    try {
      b.setPermutation(BlockPermutation.resolve(was.t, was.s));
    } catch {
      try {
        b.setType(was.t);
      } catch (e) {
        console.warn(`[maps] restore ${r.id}: ${e}`);
      }
    }
  }
  return true;
}

/**
 * Lets go of records whose hunt is gone: `live(owner)` returns the record ids the owner's hunts still hold, or
 * undefined when the owner isn't online (then nothing is known).
 * @param {(owner: string) => string[] | undefined} live
 */
export function sweep(live) {
  for (const id of ids()) {
    const r = load(id);
    if (!r || !Array.isArray(r.blocks) || !Array.isArray(r.types)) {
      drop(id);
      continue;
    }
    try {
      if (!r.due) {
        const held = live(r.owner);
        if (held && !held.includes(r.id)) release(r.id);
        continue;
      }
      if (Date.now() < r.due) continue;
      if (restore(r)) drop(id);
    } catch (e) {
      console.warn(`[maps] undo ${id}: ${e}`);
    }
  }
}

export { ANY_WOOL };

/** Starts the sweep: every 5 seconds. @param {(owner: string) => string[] | undefined} live */
export function startSweep(live) {
  system.runInterval(() => {
    try {
      sweep(live);
    } catch (e) {
      console.warn(`[maps] undo: ${e}`);
    }
  }, 100);
}
