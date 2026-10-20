// ItemStacks travel through native entity inventories and World structures, never through a JSON serializer.
import { StructureSaveMode, world } from "@minecraft/server";

/** @typedef {import("@minecraft/server").ItemStack} ItemStack */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {{ s: number, item: ItemStack }} Entry */
/** @typedef {{ id: string, slots: number[], layout?: 2 }} Ref */
/** @typedef {{ v: 1, cur: number, layout?: 2, pages: Record<string, Ref>, idx?: Record<string, { r: string, k: Record<string, number> }>, pending?: { before: Ref, after: Ref, out?: { d: string, p: [number, number, number][] } } }} State */
const STATE = "stash:native";
const NEXT = "stash:snapshot_next";
const ENTITY = "realm:stash_page_store";

export class InventoryRecoveryError extends Error {}

// Storage entities exist only inside one synchronous save or load, so any that spawns or loads later
// is a stray (older versions leaked them into the Overworld from the Nether and the End).
for (const signal of [world.afterEvents.entityLoad, world.afterEvents.entitySpawn]) {
  signal?.subscribe(({ entity }) => {
    try {
      if (entity.isValid && entity.typeId === ENTITY) removeStage(entity);
    } catch {
      // already gone
    }
  });
}

/** @param {Player} player @returns {State} */
export function stateOf(player) {
  const raw = player.getDynamicProperty(STATE);
  if (raw === undefined) {
    const cur = player.getDynamicProperty("stash:cur");
    if (cur !== undefined && (typeof cur !== "number" || !Number.isInteger(cur) || cur < 1 || cur > 25)) throw new Error("invalid legacy active page");
    return { v: 1, cur: typeof cur === "number" ? cur : 1, pages: {} };
  }
  if (typeof raw !== "string") throw new Error("invalid native page index");
  const state = /** @type {State} */ (JSON.parse(raw));
  if (state.v !== 1 || !Number.isInteger(state.cur) || state.cur < 1 || state.cur > 25 || !state.pages || typeof state.pages !== "object") throw new Error("invalid native page index");
  if (state.layout !== undefined && state.layout !== 2) throw new Error("unsupported inventory layout");
  for (const ref of Object.values(state.pages)) {
    if (!ref || (ref.layout !== undefined && ref.layout !== 2)) throw new Error("unsupported saved page layout");
  }
  return state;
}

/**
 * The page-content index rides in the same property as the page refs, so one write commits both. `idx[page]` is
 * `{ r, k }`: `r` is the id of the snapshot the counts were taken from, `k` maps a kind ("redstone" for
 * minecraft:redstone, a custom id as is, "id|Name" for a named stack) to how many are on that page. An entry whose
 * `r` is not the page's current snapshot, or a page without an entry (saved before the index existed, or dropped to
 * stay under the property limit), is unknown: readers must open that page, never treat it as empty.
 * @typedef {{ r: string, k: Record<string, number> }} PageIndex
 */
/** Longest a name may be and still be indexed whole; a page holding a longer one stays unindexed (unknown, read when needed). */
const KEY_NAME = 64;
/** Bytes the whole index property may use: the dynamic property limit is 32767, and a recovery journal adds two refs. */
const STATE_LIMIT = 30000;

/** `%` and `|` are escaped so an id or a name is never mistaken for the separator. @param {string} text */
const esc = (text) => text.replaceAll("%", "%25").replaceAll("|", "%7C");
/** @param {string} text */
const unesc = (text) => text.replaceAll("%7C", "|").replaceAll("%25", "%");

/** @param {string} id @param {string | undefined} name @returns {string} */
export function kindKey(id, name) {
  const short = id.startsWith("minecraft:") ? id.slice(10) : id;
  return name ? `${esc(short)}|${esc(name)}` : esc(short);
}

/** @param {string} key @returns {{ id: string, name: string | undefined }} */
export function parseKind(key) {
  const bar = key.indexOf("|");
  const id = unesc(bar < 0 ? key : key.slice(0, bar));
  return { id: id.includes(":") ? id : `minecraft:${id}`, name: bar < 0 ? undefined : unesc(key.slice(bar + 1)) };
}

/** The kinds a page holds, or undefined when one can't be keyed whole (a name over the cap), so the page stays unknown. @param {{ id: string, name?: string, n: number }[]} recs @returns {Record<string, number> | undefined} */
export function kindsOfRecs(recs) {
  /** @type {Record<string, number>} */
  const k = {};
  for (const r of recs) {
    if (r.name && r.name.length > KEY_NAME) return undefined;
    const key = kindKey(r.id, r.name);
    k[key] = (k[key] ?? 0) + r.n;
  }
  return k;
}

/**
 * What the committed index says a saved page holds, as full item id (and "|name") -> count, or undefined when the
 * page's contents are unknown (no entry, an entry for another snapshot, or an unreadable one).
 * @param {State} state @param {number} page @returns {Map<string, number> | undefined}
 */
export function indexedKinds(state, page) {
  const ref = state.pages?.[page];
  const entry = state.idx?.[page];
  if (!ref || !entry || entry.r !== ref.id || !entry.k || typeof entry.k !== "object") return undefined;
  const out = new Map();
  for (const [key, n] of Object.entries(entry.k)) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return undefined;
    const { id, name } = parseKind(key);
    out.set(name === undefined ? id : `${id}|${name}`, n);
  }
  return out;
}

/** The same committed index as records, so no name is ever re-split on a separator. @param {State} state @param {number} page @returns {{ id: string, name: string | undefined, n: number }[] | undefined} */
export function indexedEntries(state, page) {
  if (!indexedKinds(state, page)) return undefined;
  return Object.entries(/** @type {PageIndex} */ (state.idx?.[page]).k).map(([key, n]) => ({ ...parseKind(key), n }));
}

/** Records one page's kinds against the snapshot it came from; forgets every entry for a page that changed or went away. @param {State} state @param {number} page @param {Ref} ref @param {Record<string, number> | undefined} kinds */
export function recordIndex(state, page, ref, kinds) {
  const idx = { ...state.idx };
  if (kinds) idx[page] = { r: ref.id, k: kinds };
  else delete idx[page];
  state.idx = idx;
}

/** @param {State} state */
export function pruneIndex(state) {
  if (!state.idx) return;
  /** @type {Record<string, PageIndex>} */
  const keep = {};
  for (const [n, entry] of Object.entries(state.idx)) if (state.pages[n] && entry?.r === state.pages[n].id) keep[n] = entry;
  if (Object.keys(keep).length) state.idx = keep;
  else delete state.idx;
}

/** @param {string} text */
function byteLength(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Keeps the property under the dynamic property limit by dropping the largest index entries (those pages become
 * unknown and are read when needed). Refs, the journal and unknown fields are never dropped.
 * @param {State} state @returns {State}
 */
function fitIndex(state) {
  let text = JSON.stringify(state);
  if (byteLength(text) <= STATE_LIMIT || !state.idx) return state;
  const idx = { ...state.idx };
  const bySize = Object.keys(idx).sort((a, b) => JSON.stringify(idx[b]).length - JSON.stringify(idx[a]).length);
  /** @type {State} */
  const fit = { ...state, idx };
  for (const n of bySize) {
    delete idx[n];
    text = JSON.stringify(fit);
    if (byteLength(text) <= STATE_LIMIT) break;
  }
  if (!Object.keys(idx).length) delete fit.idx;
  return fit;
}

/** A single property is the commit point for every page changed in an operation. @param {Player} player @param {State} state */
function writeState(player, state) {
  const text = JSON.stringify(fitIndex(state));
  player.setDynamicProperty(STATE, text);
  if (player.getDynamicProperty(STATE) !== text) throw new Error("page index readback failed");
}

/**
 * What the readback checks compare: everything the API lets a script read about a stack. It can't see opaque
 * native data (a shulker box's contents), so it only confirms a stack is the one that was meant; it never rebuilds one.
 * @param {ItemStack | undefined} item
 */
export function signature(item) {
  if (!item) return "";
  const damage = item.getComponent("minecraft:durability")?.damage;
  const ench = item.getComponent("minecraft:enchantable")?.getEnchantments().map((e) => [e.type.id, e.level]);
  const color = item.getComponent("minecraft:dyeable")?.color;
  // Stable 2.1.0 rejects dynamic-property access on stackable item types.
  const props = item.maxAmount === 1 ? item.getDynamicPropertyIds().sort().map((k) => [k, item.getDynamicProperty(k)]) : [];
  return JSON.stringify([item.typeId, item.amount, item.nameTag, item.getLore(), item.keepOnDeath, item.lockMode, item.getCanPlaceOn(), item.getCanDestroy(), damage, ench, color, props]);
}

/** Heights above the player tried for the staging spot, then the same a few blocks to the side. */
const STAGE_UP = [24, 16, 32, 8];
const STAGE_SIDE = [0, 3, -3];

/**
 * Any storage entity found outside a synchronous save or load is a stray: the structure is the only
 * durable copy, so removing a stray never loses an item (remove() never drops its inventory).
 * @param {import("@minecraft/server").Entity[]} entities @returns {boolean} true when only strays were there
 */
function clearStrays(entities) {
  if (entities.some((e) => e.typeId !== ENTITY)) return false;
  for (const e of entities) removeStage(e);
  return true;
}

/**
 * A loaded, empty block near the player to stage the storage entity in. Busy spots (a bat, a dropped
 * item) are skipped for the next candidate instead of failing the whole save.
 * @param {Player} player
 */
function stageAt(player) {
  const dim = player.dimension;
  const { min, max } = dim.heightRange;
  let loaded = false;
  for (const up of STAGE_UP) {
    const y = Math.max(min + 2, Math.min(max - 3, Math.floor(player.location.y) + up));
    for (const side of STAGE_SIDE) {
      const at = { x: Math.floor(player.location.x) + side, y, z: Math.floor(player.location.z) };
      try {
        if (!dim.getBlock(at)) continue;
      } catch {
        continue;
      }
      loaded = true;
      // Do not accidentally snapshot another entity (players included).
      const near = dim.getEntities({ location: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 }, maxDistance: 2 });
      if (!near.length || clearStrays(near)) return { dim, at };
    }
  }
  throw new Error(loaded ? "storage staging space is occupied" : "storage staging chunk is not loaded");
}

/**
 * world.structureManager.place() puts a structure's entities into the wrong dimension while a player is
 * in the Nether or the End (BDS 1.26: they land in the Overworld at the same coordinates). The
 * structure command places them where it is told.
 * @param {string} id @param {import("@minecraft/server").Dimension} dim @param {{ x: number, y: number, z: number }} at
 */
function placeStage(id, dim, at) {
  const result = dim.runCommand(`structure load "${id}" ${at.x} ${at.y} ${at.z} 0_degrees none true false`);
  if (!result.successCount) throw new Error("native page snapshot could not be placed");
}

/** @param {import("@minecraft/server").Entity} entity */
function inventory(entity) {
  const inv = entity.getComponent("minecraft:inventory")?.container;
  if (!inv || inv.size !== 36) throw new Error("native page storage inventory is unavailable");
  return inv;
}

/** @param {import("@minecraft/server").Entity} entity */
function removeStage(entity) {
  // remove(), unlike killing an entity, never drops its inventory.
  entity.remove();
}

/** @param {Player} player @param {Ref} ref @returns {Entry[]} */
export function loadSnapshot(player, ref) {
  if (!ref || typeof ref.id !== "string" || !Array.isArray(ref.slots)) throw new Error("invalid page snapshot reference");
  if (!world.structureManager.get(ref.id)) throw new Error(`missing page snapshot ${ref.id}`);
  const { dim, at } = stageAt(player);
  /** @type {import("@minecraft/server").Entity[]} */
  let placed = [];
  try {
    placeStage(ref.id, dim, at);
    placed = dim.getEntities({ type: ENTITY, location: { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, maxDistance: 2 });
    if (placed.length !== 1) throw new Error("native page snapshot did not restore exactly one storage entity");
    const box = inventory(placed[0]);
    /** @type {Entry[]} */
    const entries = [];
    for (let s = 0; s < box.size; s++) {
      const item = box.getItem(s);
      if (item) entries.push({ s, item });
    }
    if (JSON.stringify(entries.map((e) => e.s)) !== JSON.stringify(ref.slots)) throw new Error("native page snapshot contents do not match its index");
    return entries;
  } finally {
    for (const entity of placed) removeStage(entity);
  }
}

/** @param {Ref | undefined} ref */
export function discardSnapshot(ref) {
  if (!ref) return;
  try {
    world.structureManager.delete(ref.id);
  } catch (e) {
    console.warn(`[stash] obsolete snapshot ${ref.id} could not be removed: ${e}`);
  }
}

/** @param {Player} player @param {Entry[]} entries @returns {Ref} */
export function saveSnapshot(player, entries) {
  entries = [...entries].sort((a, b) => a.s - b.s);
  const raw = world.getDynamicProperty(NEXT);
  const next = raw === undefined ? 1 : raw;
  if (typeof next !== "number" || !Number.isSafeInteger(next) || next < 1) throw new Error("invalid snapshot sequence");
  world.setDynamicProperty(NEXT, next + 1);
  if (world.getDynamicProperty(NEXT) !== next + 1) throw new Error("snapshot sequence readback failed");
  const id = `stash:page_${next}`;
  if (world.structureManager.get(id)) throw new Error("snapshot identifier already exists");
  const { dim, at } = stageAt(player);
  const entity = dim.spawnEntity(ENTITY, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  const ref = { id, slots: entries.map((e) => e.s) };
  try {
    const box = inventory(entity);
    const occupied = new Set();
    for (const e of entries) {
      if (!Number.isInteger(e.s) || e.s < 0 || e.s >= 36 || occupied.has(e.s)) throw new Error("invalid or duplicate storage slot");
      occupied.add(e.s);
      box.setItem(e.s, e.item);
      if (signature(box.getItem(e.s)) !== signature(e.item)) throw new Error("native storage item readback failed");
    }
    world.structureManager.createFromWorld(id, dim, at, { ...at, y: at.y + 1 }, { includeBlocks: false, includeEntities: true, saveMode: StructureSaveMode.World });
  } finally {
    removeStage(entity);
  }
  try {
    const restored = loadSnapshot(player, ref);
    if (restored.some((e, i) => e.s !== entries[i]?.s || signature(e.item) !== signature(entries[i]?.item))) throw new Error("snapshot metadata readback failed");
    return ref;
  } catch (e) {
    discardSnapshot(ref);
    throw e;
  }
}

/** @param {import("@minecraft/server").Container} inv @returns {Entry[]} */
export function carried(inv) {
  /** @type {Entry[]} */
  const entries = [];
  for (let s = 0; s < inv.size; s++) {
    const item = inv.getItem(s);
    if (item) entries.push({ s, item });
  }
  return entries;
}

/** @param {import("@minecraft/server").Container} inv @param {Entry[]} entries */
function replaceInventory(inv, entries) {
  const items = new Map(entries.map((e) => [e.s, e.item]));
  for (let s = 0; s < inv.size; s++) {
    const item = items.get(s);
    const have = inv.getItem(s);
    if (!have && !item) continue;
    if (have && item && have.amount === item.amount && have.isStackableWith(item)) continue;
    inv.setItem(s, item);
    if (signature(inv.getItem(s)) !== signature(item)) throw new Error(`inventory slot ${s} readback failed`);
  }
}

/**
 * Save both inventory images and the journal before touching live slots. Old page snapshots remain
 * referenced until the final index write succeeds. A failed rollback retains the recovery images.
 * @param {Player} player @param {State} old @param {State} next @param {Entry[]} after
 */
export function commitInventory(player, old, next, after) {
  if (old.pending) throw new Error("an inventory recovery is pending; tell an operator");
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) throw new Error("player inventory is unavailable");
  const before = saveSnapshot(player, carried(inv));
  let afterRef;
  let journaled = false;
  let committed = false;
  let retain = false;
  try {
    afterRef = saveSnapshot(player, after);
    writeState(player, { ...old, pending: { before, after: afterRef } });
    journaled = true;
    replaceInventory(inv, after);
    writeState(player, next);
    committed = true;
  } catch (error) {
    if (journaled) {
      try {
        replaceInventory(inv, loadSnapshot(player, before));
        writeState(player, old);
      } catch (rollback) {
        retain = true;
        try {
          if (afterRef) writeState(player, { ...old, pending: { before, after: afterRef } });
        } catch (journal) {
          console.warn(`[stash] recovery journal could not be refreshed; retained ${before.id}: ${journal}`);
        }
        console.warn(`[stash] inventory recovery retained in ${before.id} and ${afterRef?.id}: ${rollback}`);
        throw new InventoryRecoveryError(`inventory recovery is pending; items are saved, tell an operator (${error})`);
      }
    } else {
      // A set may succeed even when its readback throws. Restore the old pointer before deleting images.
      writeState(player, old);
    }
    throw error;
  } finally {
    // A failed rollback deliberately keeps both durable images and its journal.
    const live = stateOf(player);
    if (!retain && !live.pending) {
      discardSnapshot(before);
      discardSnapshot(afterRef);
    }
    if (committed) {
      for (const ref of Object.values(old.pages)) if (!Object.values(next.pages).some((r) => r.id === ref.id)) discardSnapshot(ref);
    }
  }

}

/**
 * A persisted journal means rollback failed or execution stopped between commit points. Inventory
 * signatures cannot prove custody (a drop can look exactly like the empty after-image), nor compare
 * opaque metadata. Keep both native images quarantined; never replay them speculatively.
 * @param {Player} player
 */
export function inventoryReady(player) {
  return !stateOf(player).pending;
}

const CHEST = "minecraft:chest";
const CHEST_SLOTS = 27;

/** What an operator is told before confirming, or undefined when nothing is pending. @param {Player} target @param {(e: Entry) => boolean} [skip] entries the exporter leaves out (the pack's own buttons) */
export function pendingSummary(target, skip) {
  const pending = stateOf(target).pending;
  if (!pending) return undefined;
  let items = pending.before.slots.length;
  if (skip) {
    try {
      items = loadSnapshot(target, pending.before).filter((e) => !skip(e)).length;
    } catch {
      // the export reports an unreadable image itself
    }
  }
  return { id: pending.before.id, items, chests: Math.max(1, Math.ceil(items / CHEST_SLOTS)), started: !!pending.out };
}

/** @param {import("@minecraft/server").Block | undefined} block @param {Entry[]} part */
function chestMatches(block, part) {
  if (block?.typeId !== CHEST) return false;
  const box = block.getComponent("minecraft:inventory")?.container;
  if (!box) return false;
  for (let i = 0; i < CHEST_SLOTS; i++) {
    const want = part[i]?.item;
    if (signature(box.getItem(i)) !== signature(want)) return false;
  }
  return true;
}

/**
 * A chest whose filled slots all hold what the export put there (an export that stopped half way): finished in place,
 * never touching a chest that holds anything else.
 * @param {import("@minecraft/server").Block} block @param {Entry[]} part
 */
function chestIsPrefixOf(block, part) {
  const box = block.getComponent("minecraft:inventory")?.container;
  if (!box) return false;
  for (let i = 0; i < CHEST_SLOTS; i++) {
    const have = box.getItem(i);
    if (have && signature(have) !== signature(part[i]?.item)) return false;
  }
  return true;
}

/**
 * Operator-confirmed export of a stuck recovery journal: the retained before-image goes into empty chests
 * beside the operator (air blocks only, nothing overwritten), then the journal is cleared and both images
 * discarded. The chest spots are journaled first, so a restart in between finishes the same export instead of
 * making a second copy. Opaque stacks are carried as ItemStacks and never rebuilt from signatures.
 * The target's live inventory is never touched. `skip` leaves out the pack's own page buttons (never real items).
 * An export already started stays in the dimension it began in: from another dimension it is refused, so a second set
 * of chests is never made.
 * @param {Player} operator @param {Player} target @param {(e: Entry) => boolean} [skip]
 * @returns {{ ok: boolean, message: string }}
 */
export function exportPending(operator, target, skip) {
  const state = stateOf(target);
  const pending = state.pending;
  if (!pending) return { ok: false, message: "Nothing is waiting for recovery." };
  let entries;
  try {
    entries = loadSnapshot(target, pending.before);
    if (skip) entries = entries.filter((e) => !skip(e));
  } catch (e) {
    return { ok: false, message: `The saved images could not be read, nothing changed (${e}).` };
  }
  const parts = [];
  for (let i = 0; i < entries.length; i += CHEST_SLOTS) parts.push(entries.slice(i, i + CHEST_SLOTS).map((e, j) => ({ s: j, item: e.item })));
  if (!parts.length) parts.push([]);
  try {
    const dim = operator.dimension;
    if (pending.out && pending.out.d !== dim.id) return { ok: false, message: `The export was started in ${pending.out.d}; finish it there. Nothing changed.` };
    let spots = pending.out?.p;
    if (!spots) {
      spots = [];
      const o = operator.location;
      const bx = Math.floor(o.x);
      const by = Math.floor(o.y);
      const bz = Math.floor(o.z);
      for (const r of [1, 2, 3, 4]) {
        for (let dx = -r; dx <= r && spots.length < parts.length; dx++) {
          for (let dz = -r; dz <= r && spots.length < parts.length; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const at = { x: bx + dx, y: by, z: bz + dz };
            if (dim.getBlock(at)?.isAir && dim.getBlock({ ...at, y: by - 1 })?.isAir === false) spots.push([at.x, at.y, at.z]);
          }
        }
        if (spots.length >= parts.length) break;
      }
      if (spots.length < parts.length) return { ok: false, message: "There is no empty floor space next to you for the chests; move to open ground. Nothing changed." };
      writeState(target, { ...state, pending: { ...pending, out: { d: dim.id, p: spots } } });
    }
    if (spots.length < parts.length) return { ok: false, message: "The saved export spots are incomplete; ask for help. Nothing changed." };
    for (let i = 0; i < parts.length; i++) {
      const block = dim.getBlock({ x: spots[i][0], y: spots[i][1], z: spots[i][2] });
      if (chestMatches(block, parts[i])) continue;
      const partial = block?.typeId === CHEST && chestIsPrefixOf(block, parts[i]);
      if (!block?.isAir && !partial) return { ok: false, message: `The export spot ${spots[i].join(" ")} is taken by something else; nothing was overwritten. Ask for help.` };
      if (!partial) block.setType(CHEST);
      const box = dim.getBlock({ x: spots[i][0], y: spots[i][1], z: spots[i][2] })?.getComponent("minecraft:inventory")?.container;
      if (!box) throw new Error("chest inventory is unavailable");
      for (const e of parts[i]) box.setItem(e.s, e.item);
      if (!chestMatches(dim.getBlock({ x: spots[i][0], y: spots[i][1], z: spots[i][2] }), parts[i])) throw new Error("chest readback failed");
    }
  } catch (e) {
    console.warn(`[stash] recovery export incomplete, journal kept: ${e}`);
    return { ok: false, message: "The export did not finish. The saved images are kept; run it again." };
  }
  const { pending: _done, ...rest } = state;
  try {
    writeState(target, rest);
  } catch (e) {
    console.warn(`[stash] recovery journal not cleared, export is kept and will be recognized: ${e}`);
    return { ok: false, message: "The chests are filled but the journal did not clear. Run it again; nothing will be copied twice." };
  }
  discardSnapshot(pending.before);
  discardSnapshot(pending.after);
  return { ok: true, message: `Exported ${entries.length} stacks into ${parts.length} chest(s) next to you. ${target.name}'s journal is cleared. Anything they still carried now exists twice: inspect their inventory and the chests, and back up what you need.` };
}
