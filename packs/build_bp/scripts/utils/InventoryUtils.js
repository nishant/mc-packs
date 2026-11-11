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
            item.amount = item.amount - remaining;
            container.setItem(i, item);
            remaining = 0;
        }
    }
    return amount - remaining;
}
export function giveBlocks(player, typeId, amount) {
    if (amount <= 0) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    let remaining = amount;
    let max = 64;
    try { max = new ItemStack(typeId, 1).maxAmount; } catch { return; }
    if (!(max > 0)) max = 64;
    while (remaining > 0) {
        const batch = Math.min(max, remaining);
        try {
            const stack = new ItemStack(typeId, batch);
            remaining -= stack.amount;
            if (stack.amount <= 0) break;
            const leftover = inv ? inv.addItem(stack) : stack;
            if (leftover) player.dimension.spawnItem(leftover, player.location);
        } catch { break; }
    }
}
