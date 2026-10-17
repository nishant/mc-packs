// @ts-nocheck
import { world, system, BlockPermutation } from "@minecraft/server";
import { coachEvent } from "../utils/CoachEvents.js";
import { enqueue } from "./PlacementQueue.js";
import { getUndoThreshold } from "./Settings.js";
import { isCreative, countBlocks, removeBlocks, giveBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
const MAX_HISTORY = 10;
const UNDO_CHUNK_SIZE = 64;
const tempStacks = {
    undo: new Map(),
    redo: new Map(),
};

const routeOrder = {
    undo: new Map(),
    redo: new Map(),
};
export function clearPlayerTempStacks(playerId) {
    tempStacks.undo.delete(playerId);
    tempStacks.redo.delete(playerId);
    routeOrder.undo.delete(playerId);
    routeOrder.redo.delete(playerId);
}
function pack(typeId) { return typeId.startsWith("minecraft:") ? typeId.slice(10) : typeId; }
function unpack(t)    { return t.includes(":") ? t : "minecraft:" + t; }
function getSize(player, type) {
    return (player.getDynamicProperty(`eb:${type}_n`) ?? 0);
}
function setSize(player, type, n) {
    player.setDynamicProperty(`eb:${type}_n`, n);
}
function getEntry(player, type, i) {
    const raw = player.getDynamicProperty(`eb:${type}_${i}`);
    return raw ? JSON.parse(raw) : null;
}
function setEntry(player, type, i, entry) {
    player.setDynamicProperty(`eb:${type}_${i}`, JSON.stringify(entry));
}
function clearProp(player, type, i) {
    player.setDynamicProperty(`eb:${type}_${i}`, undefined);
}
function clearPersistent(player, type) {
    const n = getSize(player, type);
    for (let i = 0; i < n; i++) clearProp(player, type, i);
    setSize(player, type, 0);
}
function pushPersistent(player, type, entry) {
    let n = getSize(player, type);
    if (n >= MAX_HISTORY) {
        for (let i = 0; i < n - 1; i++) setEntry(player, type, i, getEntry(player, type, i + 1));
        clearProp(player, type, n - 1);
        n = n - 1;
    }
    setEntry(player, type, n, entry);
    setSize(player, type, n + 1);
}
function popPersistent(player, type) {
    const n = getSize(player, type);
    if (n === 0) return null;
    const entry = getEntry(player, type, n - 1);
    clearProp(player, type, n - 1);
    setSize(player, type, n - 1);
    return entry;
}
function pushTemp(player, type, entry) {
    if (!tempStacks[type].has(player.id)) tempStacks[type].set(player.id, []);
    tempStacks[type].get(player.id).push(entry);
}
function popTemp(player, type) {
    const stack = tempStacks[type].get(player.id);
    if (!stack?.length) return null;
    return stack.pop();
}
function clearTemp(player, type) {
    tempStacks[type].delete(player.id);
}
function pushRouteOrder(player, type, source) {
    if (!routeOrder[type].has(player.id)) routeOrder[type].set(player.id, []);
    routeOrder[type].get(player.id).push(source);
}
function popRouteOrder(player, type) {
    const arr = routeOrder[type].get(player.id);
    return arr?.length ? arr.pop() : null;
}
function clearRouteOrder(player, type) {
    routeOrder[type].delete(player.id);
}
function routePush(player, type, entry) {
    const threshold = getUndoThreshold(player);

    if (threshold > 0 && entry.bef.length > threshold) {
        pushTemp(player, type, entry);
        pushRouteOrder(player, type, "mem");
    } else {
        pushPersistent(player, type, entry);
        pushRouteOrder(player, type, "disk");
    }
}
function routePop(player, type) {
    const source = popRouteOrder(player, type);
    if (source === "mem") return popTemp(player, type);
    if (source === "disk") return popPersistent(player, type);

    return popPersistent(player, type);
}
function routeClear(player, type) {
    clearTemp(player, type);
    clearPersistent(player, type);
    clearRouteOrder(player, type);
}
export function captureSnapshot(dim, toPlace, typeId, blockStates, perPosTypeIds, threshold = 200) {
    if (threshold === 0) return null;
    const bef = toPlace.map(pos => {
        let t = "air", s = {};
        try {
            const block = dim.getBlock(pos);
            if (block) { t = pack(block.typeId); s = block.permutation.getAllStates(); }
        } catch {  }
        return { x: pos.x, y: pos.y, z: pos.z, t, s };
    });
    const aft = toPlace.map((pos, i) => ({
        x: pos.x, y: pos.y, z: pos.z,
        t: pack(perPosTypeIds ? perPosTypeIds[i] : typeId),
        s: perPosTypeIds ? {} : (blockStates ?? {}),
    }));
    return { dim: dim.id, bef, aft };
}
export function recordSnapshot(player, snapshot) {
    if (!snapshot) return;
    routePush(player, "undo", snapshot);
    routeClear(player, "redo");
}
function applyBlocks(dim, playerId, blocks) {
    const applyOne = (b) => {
        const pos = { x: b.x, y: b.y, z: b.z };
        try {
            const permutation = BlockPermutation.resolve(unpack(b.t), b.s ?? {});
            const block = dim.getBlock(pos);
            if (block) {
                block.setPermutation(permutation);
            } else {
                enqueue(playerId, dim.id, pos, permutation);
            }
        } catch {
            try {
                const block = dim.getBlock(pos);
                if (block) block.setPermutation(BlockPermutation.resolve("minecraft:air"));
            } catch {}
        }
    };
    const firstBatch = Math.min(blocks.length, UNDO_CHUNK_SIZE);
    for (let i = 0; i < firstBatch; i++) applyOne(blocks[i]);
    if (blocks.length <= UNDO_CHUNK_SIZE) return;
    let idx = UNDO_CHUNK_SIZE;
    const runId = system.runInterval(() => {
        const end = Math.min(idx + UNDO_CHUNK_SIZE, blocks.length);
        for (; idx < end; idx++) applyOne(blocks[idx]);
        if (idx >= blocks.length) system.clearRun(runId);
    }, 1);
}
export function performUndo(player) {
    const entry = routePop(player, "undo");
    if (!entry) {
        player.onScreenDisplay.setActionBar(t("eb.undo.nothing"));
        return;
    }
    const dim = world.getDimension(entry.dim);
    let toApply = entry.bef ?? [];
    if (entry.destroy && entry.survival && !isCreative(player) && entry.bef?.length) {
        const needed = new Map();
        for (const b of entry.bef) {
            const befId = unpack(b.t);
            if (befId === "minecraft:air") continue;
            needed.set(befId, (needed.get(befId) ?? 0) + 1);
        }
        for (const [tid, count] of needed) {
            if (countBlocks(player, tid) < count) {
                routePush(player, "undo", entry);
                player.sendMessage(t("eb.place.no_blocks"));
                return;
            }
        }
        for (const [tid, count] of needed) removeBlocks(player, tid, count);
    } else if (!entry.destroy && entry.aft?.length && entry.bef?.length === entry.aft.length) {
        const refund = new Map();
        const filteredBef = [];
        const checkRefund = entry.survival && !isCreative(player);
        for (let i = 0; i < entry.aft.length; i++) {
            const a = entry.aft[i];
            const b = entry.bef[i];
            const aftId = unpack(a.t);
            let unchangedSinceBuild = true;
            try {
                const cur = dim.getBlock({ x: a.x, y: a.y, z: a.z });
                if (cur && cur.typeId !== aftId) unchangedSinceBuild = false;
            } catch {}
            if (!unchangedSinceBuild) continue;
            filteredBef.push(b);
            if (checkRefund && aftId !== "minecraft:air" && unpack(b.t) !== aftId) {
                refund.set(aftId, (refund.get(aftId) ?? 0) + 1);
            }
        }
        for (const [tid, count] of refund) giveBlocks(player, tid, count);
        toApply = filteredBef;
    }
    applyBlocks(dim, player.id, toApply);
    routePush(player, "redo", entry);
    const n = toApply.length;
    player.onScreenDisplay.setActionBar(t("eb.undo.done", n));
    coachEvent(player, "undo");
}
export function performRedo(player) {
    const entry = routePop(player, "redo");
    if (!entry) {
        player.onScreenDisplay.setActionBar(t("eb.redo.nothing"));
        return;
    }
    const dim = world.getDimension(entry.dim);
    if (entry.destroy && entry.survival && !isCreative(player) && entry.bef?.length) {
        const refund = new Map();
        for (const b of entry.bef) {
            const befId = unpack(b.t);
            if (befId === "minecraft:air") continue;
            refund.set(befId, (refund.get(befId) ?? 0) + 1);
        }
        for (const [tid, count] of refund) giveBlocks(player, tid, count);
    } else if (entry.survival && !isCreative(player) && entry.aft?.length) {
        const needed = new Map();
        for (let i = 0; i < entry.aft.length; i++) {
            const a = entry.aft[i];
            const b = entry.bef?.[i];
            const aftId = unpack(a.t);
            if (aftId === "minecraft:air") continue;
            if (b && unpack(b.t) === aftId) continue;
            needed.set(aftId, (needed.get(aftId) ?? 0) + 1);
        }
        for (const [tid, count] of needed) {
            if (countBlocks(player, tid) < count) {
                routePush(player, "redo", entry);
                player.sendMessage(t("eb.place.no_blocks"));
                return;
            }
        }
        for (const [tid, count] of needed) removeBlocks(player, tid, count);
    }
    applyBlocks(dim, player.id, entry.aft);
    routePush(player, "undo", entry);
    const n = entry.aft.length;
    player.onScreenDisplay.setActionBar(t("eb.redo.done", n));
    coachEvent(player, "redo");
}
