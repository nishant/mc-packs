// @ts-nocheck
const MAX_SLOTS  = 20;
const CHUNK_SIZE = 24000;
// About 1 MB of saved data per slot at most; a bigger clipboard stays in memory only.
export const MAX_CHUNKS = 40;

/** True when a clipboard's blocks fit in one saved slot (what saveSlot accepts). */
export function fitsInSlot(blocks) {
    try { return JSON.stringify(blocks).length <= CHUNK_SIZE * MAX_CHUNKS; } catch { return false; }
}

export const AUTO_SLOT = 0;

function metaKey(slot)     { return `eb:cbm${slot}`; }
function chunkKey(slot, i) { return `eb:cbc${slot}_${i}`; }

export function isAutoSlot(slot) { return slot === AUTO_SLOT; }

export function loadSlotMeta(player, slot) {
    try {
        const raw = player.getDynamicProperty(metaKey(slot));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function getAllMeta(player) {
    return Array.from({ length: MAX_SLOTS }, (_, i) => loadSlotMeta(player, i));
}

export function saveSlot(player, slot, clipboard) {
    const meta = {
        t: Date.now(),
        x: clipboard.dims.x,
        y: clipboard.dims.y,
        z: clipboard.dims.z,
        n: clipboard.blocks.length,
        f: clipboard.captureFacing,

        c: clipboard.isCut === true,
    };
    if (clipboard.isCut === true && clipboard.cutId !== undefined) meta.cv = clipboard.cutId;
    try {
        const data = JSON.stringify(clipboard.blocks);
        if (data.length > CHUNK_SIZE * MAX_CHUNKS) return false;
        // Chunks first, stale chunks next, the meta last: a failure leaves the slot empty, never half old and half new.
        let ci = 0;
        for (let off = 0; off < data.length; off += CHUNK_SIZE) {
            player.setDynamicProperty(chunkKey(slot, ci++), data.slice(off, off + CHUNK_SIZE));
        }
        for (;;) {
            const key = chunkKey(slot, ci);
            if (player.getDynamicProperty(key) === undefined) break;
            player.setDynamicProperty(key, undefined);
            ci++;
        }
        player.setDynamicProperty(metaKey(slot), JSON.stringify(meta));
        return true;
    } catch {
        deleteSlot(player, slot);
        return false;
    }
}

export function loadSlot(player, slot) {
    const meta = loadSlotMeta(player, slot);
    if (!meta) return null;
    try {
        let data = "";
        let ci = 0;
        for (;;) {
            const chunk = player.getDynamicProperty(chunkKey(slot, ci++));
            if (chunk === undefined) break;
            data += chunk;
        }
        if (!data) return null;
        return {
            blocks:        JSON.parse(data),
            captureFacing: meta.f,
            dims:          { x: meta.x, y: meta.y, z: meta.z },
            version:       meta.t,
            isCut:         meta.c === true,
            cutId:         meta.cv,

            originSlot:    slot,
        };
    } catch { return null; }
}

export function renameSlot(player, slot, name) {
    const meta = loadSlotMeta(player, slot);
    if (!meta) return;
    meta.name = name.trim().slice(0, 32) || undefined;
    try { player.setDynamicProperty(metaKey(slot), JSON.stringify(meta)); } catch { }
}

export function deleteSlot(player, slot) {
    try {
        player.setDynamicProperty(metaKey(slot), undefined);
        let ci = 0;
        for (;;) {
            const key = chunkKey(slot, ci);
            if (player.getDynamicProperty(key) === undefined) break;
            player.setDynamicProperty(key, undefined);
            ci++;
        }
    } catch { }
}

/** Slot number, or null when the clipboard is too big to keep (it still works until the player leaves). */
export function autoSaveToStore(player, clipboard) {
    if (!saveSlot(player, AUTO_SLOT, clipboard)) {
        // The old auto slot no longer matches the clipboard in memory: drop it rather than offer stale blocks.
        deleteSlot(player, AUTO_SLOT);
        delete clipboard.originSlot;
        return null;
    }
    clipboard.originSlot = AUTO_SLOT;
    return AUTO_SLOT;
}

/** Forget a cut after its undo: every saved slot that holds that same cut (the caller drops the in-memory one). */
export function dropCutSlots(player, cutId) {
    if (cutId === undefined) return;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
        const meta = loadSlotMeta(player, slot);
        if (meta && meta.c === true && meta.cv === cutId) deleteSlot(player, slot);
    }
}

export function saveToFreeSlot(player, clipboard) {
    for (let i = AUTO_SLOT + 1; i < MAX_SLOTS; i++) {
        if (loadSlotMeta(player, i) === null) {
            return saveSlot(player, i, clipboard) ? i : null;
        }
    }
    return null;
}
