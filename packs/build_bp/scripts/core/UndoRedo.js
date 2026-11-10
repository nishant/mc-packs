// @ts-nocheck
import { world, system, BlockPermutation } from "@minecraft/server";
import { coachEvent } from "../utils/CoachEvents.js";
import { enqueue } from "./PlacementQueue.js";
import { reportPlaced } from "../utils/PlacedReport.js";
import { getUndoThreshold } from "./Settings.js";
import { isCreative, countBlocks, removeBlocks, giveBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { lockActionBar } from "../utils/ActionBar.js";
import { filterAllowedPositionsAsync } from "./Protection.js";
import { getState } from "./PlayerState.js";
import { dropCutSlots } from "../utils/ClipboardStore.js";
import { ALWAYS_REPLACEABLE } from "./BlockPlacer.js";
// Players whose undo or redo is waiting on the claims answer: a second one must not interleave.
const busy = new Set();
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
function itemUnits(block) {
    if (!block || block.u === 0) return 0;
    const id = unpack(block.t);
    if (id === "minecraft:air") return 0;
    if (block.s?.head_piece_bit === true && (id === "minecraft:bed" || id === "minecraft:straw_bed")) return 0;
    return 1;
}
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
        s: pos._resolvedStates ?? (perPosTypeIds ? {} : (blockStates ?? {})),
        u: pos._bedHead || pos._resolvedStates?.head_piece_bit === true ? 0 : 1,
    }));
    return { dim: dim.id, bef, aft };
}
export function recordSnapshot(player, snapshot) {
    if (!snapshot) return;
    routePush(player, "undo", snapshot);
    routeClear(player, "redo");
}
function applyBlocks(dim, playerId, blocks) {
    reportPlaced(dim.id, blocks.filter((b) => unpack(b.t) !== "minecraft:air"));
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
function currentType(dim, c) {
    try { return dim.getBlock({ x: c.x, y: c.y, z: c.z })?.typeId ?? null; } catch { return null; }
}
/** Keep the cells Land Claims and safe zones allow, in their original order (each entry keeps its own fields). */
async function allowedCells(player, dim, cells) {
    if (!cells.length) return [];
    const allowed = await filterAllowedPositionsAsync(player, dim.id, cells, true);
    const keep = new Set(allowed ?? []);
    return cells.filter((c) => keep.has(c));
}
/** The undone cut is back in the world, so neither the clipboard nor a saved slot of it may paste for free any more. */
function forgetUndoneCut(player, entry) {
    if (!entry.isCutSource || entry.cutId === undefined) return;
    try {
        const state = getState(player);
        if (state.clipboard?.isCut === true && state.clipboard.cutId === entry.cutId) state.clipboard = null;
        dropCutSlots(player, entry.cutId);
    } catch { }
}
export async function performUndo(player) {
    if (busy.has(player.id)) return;
    busy.add(player.id);
    try { await undoOne(player); } finally { busy.delete(player.id); }
}
function pushBack(player, type, entry) {
    try { routePush(player, type, entry); } catch { }
}
async function undoOne(player) {
    const entry = routePop(player, "undo");
    if (!entry) {
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(t("eb.undo.nothing"));
        return;
    }
    const dim = world.getDimension(entry.dim);
    let toApply = entry.bef ?? [];
    if (entry.destroy) {
        // Put back only into cells that are still empty and that the player may build in.
        const empty = toApply.filter((b) => {
            const cur = currentType(dim, b);
            return cur === null || ALWAYS_REPLACEABLE.has(cur);
        });
        toApply = await allowedCells(player, dim, empty);
        if (!player.isValid) { pushBack(player, "undo", entry); return; }
    }
    if (entry.destroy && entry.survival && !isCreative(player) && toApply.length) {
        const needed = new Map();
        for (const b of toApply) {
            if (!itemUnits(b)) continue;
            const befId = unpack(b.t);
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
            if (checkRefund && itemUnits(a) && unpack(b.t) !== aftId) {
                refund.set(aftId, (refund.get(aftId) ?? 0) + 1);
            }
        }
        for (const [tid, count] of refund) giveBlocks(player, tid, count);
        toApply = filteredBef;
    }
    if (entry.isCutSource && entry.cutId !== undefined && toApply.length < (entry.bef?.length ?? 0)) {
        // Some cut cells were built over: restoring only part of them while the cut can still paste would duplicate blocks.
        let live = false;
        try { const c = getState(player).clipboard; live = c?.isCut === true && c.cutId === entry.cutId; } catch { }
        if (live) {
            pushBack(player, "undo", entry);
            lockActionBar(player.id, 2500);
            player.sendMessage(t("eb.undo.built_over"));
            return;
        }
    }
    applyBlocks(dim, player.id, toApply);
    forgetUndoneCut(player, entry);
    // Redoing a survival cut takes the blocks out again, so it refunds them like a destroy (and a later undo charges).
    if (entry.isCutSource && entry.survival) entry.destroy = true;
    if (!player.isValid) { pushBack(player, "redo", entry); return; }
    routePush(player, "redo", entry);
    const n = toApply.length;
    lockActionBar(player.id, 1500);
    player.onScreenDisplay.setActionBar(t("eb.undo.done", n));
    coachEvent(player, "undo");
}
export async function performRedo(player) {
    if (busy.has(player.id)) return;
    busy.add(player.id);
    try { await redoOne(player); } finally { busy.delete(player.id); }
}
async function redoOne(player) {
    const entry = routePop(player, "redo");
    if (!entry) {
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(t("eb.redo.nothing"));
        return;
    }
    const dim = world.getDimension(entry.dim);
    // Redo writes only into cells that still hold what the undo left there, and that the player may build in.
    const aft = entry.aft ?? [];
    const same = [];
    for (let i = 0; i < aft.length; i++) {
        const b = entry.bef?.[i];
        const cur = currentType(dim, aft[i]);
        if (b && cur !== null && cur !== unpack(b.t)) continue;
        same.push({ x: aft[i].x, y: aft[i].y, z: aft[i].z, _i: i });
    }
    const sel = (await allowedCells(player, dim, same)).map((c) => c._i);
    if (!player.isValid) { pushBack(player, "redo", entry); return; }
    const aftSel = sel.map((i) => aft[i]);
    const befSel = sel.map((i) => entry.bef?.[i]);
    if (entry.destroy && entry.survival && !isCreative(player) && befSel.length) {
        const refund = new Map();
        for (const b of befSel) {
            if (!itemUnits(b)) continue;
            const befId = unpack(b.t);
            refund.set(befId, (refund.get(befId) ?? 0) + 1);
        }
        for (const [tid, count] of refund) giveBlocks(player, tid, count);
    } else if (entry.survival && !isCreative(player) && aftSel.length) {
        const needed = new Map();
        for (let i = 0; i < aftSel.length; i++) {
            const a = aftSel[i];
            const b = befSel[i];
            if (!itemUnits(a)) continue;
            const aftId = unpack(a.t);
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
    applyBlocks(dim, player.id, aftSel);
    routePush(player, "undo", entry);
    const n = aftSel.length;
    lockActionBar(player.id, 1500);
    player.onScreenDisplay.setActionBar(t("eb.redo.done", n));
    coachEvent(player, "redo");
}
