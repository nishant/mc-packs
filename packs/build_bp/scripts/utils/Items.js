// @ts-nocheck
import { ItemStack, system, world } from "@minecraft/server";
import { createIdleClock, idleDue } from "./idle-cadence.js";
import { forgetHolder, markHolderDirty } from "./tool-gate.js";

export const BOOK_ID          = "eb:building_book";
export const LEGACY_BOOK_ID   = "realm:building_book";
export const TUTORIAL_BOOK_ID = "eb:tutorial_book";

export const BOOK_NAME = "§b§lBuilding Book§r";
export const BOOK_LORE = [
    "§8> §7Right-click         §8| §fMenu",
    "§8> §7Hold right-click    §8| §fQuick switch",
    "§8> §7Sneak + right-click §8| §fSettings",
    "§8> §7Left-click           §8| §fBlock palette",
    "§7Hold it in your hand and use it",
];
export const TUTORIAL_BOOK_NAME = "§b§lEffortless Building Tutorial§r";
export const TUTORIAL_BOOK_LORE = [
    "§8> §7Hold it §8| §fThe tutorial opens in front of you",
    "§7Works in your main hand",
];

export function isBook(itemStack) {
    return itemStack?.typeId === BOOK_ID || itemStack?.typeId === LEGACY_BOOK_ID;
}

export function isTutorialBook(itemStack) {
    return itemStack?.typeId === TUTORIAL_BOOK_ID;
}

export function heldItem(player) {
    try {
        return player.getComponent("minecraft:inventory")
            ?.container?.getItem(player.selectedSlotIndex) ?? null;
    } catch { return null; }
}

let playersTick = -1;
let playersList = [];
/**
 * world.getAllPlayers(), read once a tick and shared by this pack's loops (it builds a fresh list of every player each
 * call, which adds up at 40+ players with a dozen loops). Handles can go invalid within the tick: callers already
 * guard each player with try/catch.
 */
export function allPlayers() {
    const now = system.currentTick;
    if (now !== playersTick) {
        playersTick = now;
        playersList = world.getAllPlayers();
    }
    return playersList;
}

/** player id -> the last read of the selected slot: { tick, slot, item } */
const heldCache = new Map();
/**
 * The item in the player's selected slot, shared by the per-tick loops (preview, double-sneak, tutorial book) so the
 * inventory is read once a tick at most. With maxAge, a read up to that many ticks old is reused unless it found a
 * building or tutorial book (those stay fresh every tick); a hotbar slot change always reads again.
 */
export function heldItemCached(player, maxAge = 0) {
    const now = system.currentTick;
    const c = heldCache.get(player.id);
    if (c && c.slot === player.selectedSlotIndex
        && (c.tick === now || (now - c.tick <= maxAge && !isBook(c.item) && !isTutorialBook(c.item)))) return c.item;
    const item = heldItem(player);
    heldCache.set(player.id, { tick: now, slot: player.selectedSlotIndex, item });
    setHand(player, item?.typeId);
    return item;
}

// What each player holds, kept from the hotbar and inventory events instead of polling every hand: the loops that only
// care about Building Book or Tutorial Book holders walk those few players, and the tool gate asks here without a read.
/** player id -> type id in the selected slot (null: empty hand) */
const handTypes = new Map();
/** player ids whose hand changed and must be read once */
const handDirty = new Map();
/** player id -> player, for those holding the Building Book */
const bookHands = new Map();
/** player id -> player, for those holding the Tutorial Book */
const tutorialHands = new Map();

function isBookId(typeId) {
    return typeId === BOOK_ID || typeId === LEGACY_BOOK_ID;
}

/** Records what the player holds now. A change wakes the tool gate for that player. */
function setHand(player, typeId) {
    const id = player.id;
    const next = typeId ?? null;
    const had = handTypes.has(id);
    const prev = handTypes.get(id);
    handTypes.set(id, next);
    handDirty.delete(id);
    if (isBookId(next)) bookHands.set(id, player); else bookHands.delete(id);
    if (next === TUTORIAL_BOOK_ID) tutorialHands.set(id, player); else tutorialHands.delete(id);
    if (!had || prev !== next) markHolderDirty(id);
}

/** Reads the hand of every player whose hand changed since the last look (once each). */
function syncHands() {
    if (handDirty.size === 0) return;
    for (const player of [...handDirty.values()]) {
        try {
            if (player.isValid === false) { handDirty.delete(player.id); continue; }
            heldCache.delete(player.id);
            heldItemCached(player, 0);
        } catch { handDirty.delete(player.id); }
    }
}

/** The type id in the player's selected slot, from the events (one read the first time or after a change). */
export function handTypeId(player) {
    const id = player.id;
    if (handDirty.has(id) || !handTypes.has(id)) {
        heldCache.delete(id);
        return heldItemCached(player, 0)?.typeId ?? null;
    }
    return handTypes.get(id) ?? null;
}

/** Players holding the Building Book right now (id -> player). */
export function buildingBookHands() {
    syncHands();
    return bookHands;
}

/** Players holding the Tutorial Book right now (id -> player). */
export function tutorialBookHands() {
    syncHands();
    return tutorialHands;
}

/** Re-reads one player's hand (the slow safety sweep for a missed event). */
export function refreshHand(player) {
    try {
        heldCache.delete(player.id);
        heldItemCached(player, 0);
    } catch {}
}

/** Marks a player's hand to be read again at the next look (the tool gate hears of it only if the item changed). */
export function markHandDirty(player) {
    if (!player?.id) return;
    handDirty.set(player.id, player);
}

/**
 * Backstop for a hotbar slot change that sent no event (a script that sets the slot, for one): a slot that differs
 * from the one the hand was read in is treated as a change. One property read, no inventory read.
 */
export function checkSlot(player) {
    const c = heldCache.get(player.id);
    if (!c) { if (!handDirty.has(player.id)) markHandDirty(player); return; }
    if (c.slot !== player.selectedSlotIndex) touch(player);
}

/** Whether this player's hand was ever read or reported (the sweep adds the others). */
export function handKnown(id) {
    return handTypes.has(id) || handDirty.has(id);
}

function forgetHand(id) {
    handTypes.delete(id);
    handDirty.delete(id);
    bookHands.delete(id);
    tutorialHands.delete(id);
}
/** player -> tick their hand last changed (slot change or an item change in the inventory) */
const handTouched = new WeakMap();
/** Whether the player's hand changed this tick or the one before (an idle player's loop then looks right away). */
export function handJustChanged(player) {
    return (handTouched.get(player) ?? -Infinity) >= system.currentTick - 1;
}
/**
 * Idle players (nothing to draw, no book in hand) are looked at every IDLE_EVERY ticks only, spread over the ticks
 * by their place in the player list, so a big server costs little while nobody builds.
 */
export const IDLE_EVERY = 5;
const idleClock = createIdleClock();
/** One step of this loop's own clock. A period that divides the world tick still walks every idle index. */
export function nextIdlePhase() {
    return idleClock.tick();
}
export function idleSkip(player, index, busy, phase = playersTick, window = 1) {
    const now = system.currentTick;
    const span = Math.max(1, Number(window) || 1);
    const handFresh = (handTouched.get(player) ?? -Infinity) >= now - span;
    return !idleDue(index, phase, busy.has(player), handFresh);
}
const touch = (player) => {
    heldCache.delete(player.id);
    handTouched.set(player, system.currentTick);
    markHandDirty(player);
};
try {
    world.afterEvents.playerHotbarSelectedSlotChange.subscribe(({ player, itemStack, newSlotSelected }) => {
        touch(player);
        // The event names the new held item: no read needed.
        try {
            heldCache.set(player.id, { tick: system.currentTick, slot: newSlotSelected, item: itemStack });
            setHand(player, itemStack?.typeId);
        } catch {}
    });
    // Only a change in the selected slot can change what is in hand (picking up items elsewhere costs nothing).
    world.afterEvents.playerInventoryItemChange.subscribe(({ player, slot }) => {
        try { if (slot === player.selectedSlotIndex) touch(player); } catch { touch(player); }
    });
    world.afterEvents.playerLeave.subscribe(({ playerId }) => {
        heldCache.delete(playerId);
        forgetHand(playerId);
        forgetHolder(playerId);
    });
    world.afterEvents.playerSpawn.subscribe(({ player }) => {
        if (!player?.id) return;
        markHandDirty(player);
        markHolderDirty(player.id);
    });
} catch {}

export function hasItem(player, typeId) {
    try {
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) return false;
        for (let i = 0; i < inv.size; i++) {
            const id = inv.getItem(i)?.typeId;
            if (id === typeId || (typeId === BOOK_ID && id === LEGACY_BOOK_ID)) return true;
        }
    } catch {}
    return false;
}

function give(player, typeId, name, lore) {
    try {
        const inv = player.getComponent("minecraft:inventory")?.container;
        if (!inv) return false;
        const stack = new ItemStack(typeId, 1);
        stack.nameTag = name;
        stack.setLore(lore);
        inv.addItem(stack);
        return true;
    } catch { return false; }
}

export function giveBuildingBook(player) {
    return give(player, BOOK_ID, BOOK_NAME, BOOK_LORE);
}

export function giveTutorialBook(player) {
    return give(player, TUTORIAL_BOOK_ID, TUTORIAL_BOOK_NAME, TUTORIAL_BOOK_LORE);
}
