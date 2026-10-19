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
    return item;
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
    const now = playersTick; // the loops call allPlayers() first, this tick
    const span = Math.max(1, Number(window) || 1);
    const handFresh = (handTouched.get(player) ?? -Infinity) >= now - span;
    return !idleDue(index, phase, busy.has(player), handFresh);
}
const touch = (player) => {
    heldCache.delete(player.id);
    handTouched.set(player, system.currentTick);
    markHolderDirty(player.id);
};
try {
    world.afterEvents.playerHotbarSelectedSlotChange.subscribe(({ player }) => touch(player));
    world.afterEvents.playerInventoryItemChange.subscribe(({ player }) => touch(player));
    world.afterEvents.playerLeave.subscribe(({ playerId }) => {
        heldCache.delete(playerId);
        forgetHolder(playerId);
    });
    world.afterEvents.playerSpawn.subscribe(({ player }) => {
        if (player?.id) markHolderDirty(player.id);
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
