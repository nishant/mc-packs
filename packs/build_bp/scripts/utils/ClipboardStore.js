// @ts-nocheck
const MAX_SLOTS  = 20;
const CHUNK_SIZE = 24000;

export const AUTO_SLOT = 0;

function metaKey(slot)     { return `eb:cbm${slot}`; }
function chunkKey(slot, i) { return `eb:cbc${slot}_${i}`; }

export function getSlotCount() { return MAX_SLOTS; }
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
    try {
        player.setDynamicProperty(metaKey(slot), JSON.stringify(meta));
        const data = JSON.stringify(clipboard.blocks);
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
    } catch { }
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

export function autoSaveToStore(player, clipboard) {
    saveSlot(player, AUTO_SLOT, clipboard);
    clipboard.originSlot = AUTO_SLOT;
    return AUTO_SLOT;
}

export function saveToFreeSlot(player, clipboard) {
    for (let i = AUTO_SLOT + 1; i < MAX_SLOTS; i++) {
        if (loadSlotMeta(player, i) === null) {
            saveSlot(player, i, clipboard);
            return i;
        }
    }
    return null;
}
