// ItemStacks travel through native entity inventories and World structures, never through a JSON serializer.
import { StructureSaveMode, world } from "@minecraft/server";

/** @typedef {import("@minecraft/server").ItemStack} ItemStack */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {{ s: number, item: ItemStack }} Entry */
/** @typedef {{ id: string, slots: number[], layout?: 2 }} Ref */
/** @typedef {{ v: 1, cur: number, layout?: 2, pages: Record<string, Ref>, pending?: { before: Ref, after: Ref } }} State */
const STATE = "stash:native";
const NEXT = "stash:snapshot_next";
const ENTITY = "realm:stash_page_store";

export class InventoryRecoveryError extends Error {}

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

/** A single property is the commit point for every page changed in an operation. @param {Player} player @param {State} state */
function writeState(player, state) {
  const text = JSON.stringify(state);
  player.setDynamicProperty(STATE, text);
  if (player.getDynamicProperty(STATE) !== text) throw new Error("page index readback failed");
}

/** @param {ItemStack | undefined} item */
function signature(item) {
  if (!item) return "";
  const damage = item.getComponent("minecraft:durability")?.damage;
  const ench = item.getComponent("minecraft:enchantable")?.getEnchantments().map((e) => [e.type.id, e.level]);
  const color = item.getComponent("minecraft:dyeable")?.color;
  // Stable 2.1.0 rejects dynamic-property access on stackable item types.
  const props = item.maxAmount === 1 ? item.getDynamicPropertyIds().sort().map((k) => [k, item.getDynamicProperty(k)]) : [];
  return JSON.stringify([item.typeId, item.amount, item.nameTag, item.getLore(), item.keepOnDeath, item.lockMode, item.getCanPlaceOn(), item.getCanDestroy(), damage, ench, color, props]);
}

/** @param {Player} player */
function stageAt(player) {
  const dim = player.dimension;
  const y = Math.max(dim.heightRange.min + 2, Math.min(dim.heightRange.max - 3, Math.floor(player.location.y) + 24));
  const at = { x: Math.floor(player.location.x), y, z: Math.floor(player.location.z) };
  if (!dim.getBlock(at)) throw new Error("storage staging chunk is not loaded");
  // Do not accidentally snapshot another entity (players included).
  if (dim.getEntities({ location: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 }, maxDistance: 2 }).length) throw new Error("storage staging space is occupied");
  return { dim, at };
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
    world.structureManager.place(ref.id, dim, at, { includeBlocks: false, includeEntities: true });
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
