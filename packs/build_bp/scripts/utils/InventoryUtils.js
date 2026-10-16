// @ts-nocheck
import { ItemStack } from "@minecraft/server";
export function isCreative(player) {
    return String(player.getGameMode()).toLowerCase() === "creative";
}
export function countBlocks(player, typeId) {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv?.container) return 0;
    let count = 0;
    for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item?.typeId === typeId) count += item.amount;
    }
    return count;
}
export function removeBlocks(player, typeId, amount) {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv?.container) return 0;
    const container = inv.container;
    let remaining = amount;
    for (let i = 0; i < container.size && remaining > 0; i++) {
        const item = container.getItem(i);
        if (!item || item.typeId !== typeId) continue;
        if (item.amount <= remaining) {
            remaining -= item.amount;
            container.setItem(i, undefined);
        } else {
            const updated = new ItemStack(item.typeId, item.amount - remaining);
            container.setItem(i, updated);
            remaining = 0;
        }
    }
    return amount - remaining;
}
export function giveBlocks(player, typeId, amount) {
    if (amount <= 0) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    let remaining = amount;
    while (remaining > 0) {
        const batch = Math.min(64, remaining);
        remaining -= batch;
        try {
            const stack = new ItemStack(typeId, batch);
            const leftover = inv ? inv.addItem(stack) : stack;
            if (leftover) player.dimension.spawnItem(leftover, player.location);
        } catch {}
    }
}
