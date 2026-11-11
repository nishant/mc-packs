// @ts-nocheck
import { world } from "@minecraft/server";

const activeTAs  = new Map();
const CHUNK_BLOCKS = 16;
const TA_PROP = "eb:tickingAreas";

function readSaved() {
    try {
        const v = JSON.parse(world.getDynamicProperty(TA_PROP) ?? "[]");
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}
function writeSaved(list) {
    try { world.setDynamicProperty(TA_PROP, list.length ? JSON.stringify(list) : undefined); } catch {}
}
function saveAdd(name, dimensionId) {
    const list = readSaved().filter((x) => !(x.name === name && x.dimensionId === dimensionId));
    list.push({ name, dimensionId });
    writeSaved(list);
}
function saveRemove(name, dimensionId) {
    writeSaved(readSaved().filter((x) => !(x.name === name && x.dimensionId === dimensionId)));
}

function taName(playerId) {
    return `eb${String(playerId).replace(/[^a-zA-Z0-9]/g, "").slice(-6)}`;
}

export function ensureChunkLoaders(playerId, dimensionId, pendingItems) {
    if (pendingItems.length === 0) {
        releaseChunkLoaders(playerId);
        return;
    }

    let minX = Infinity,  minY = Infinity,  minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const { pos } of pendingItems) {
        if (pos.x < minX) minX = pos.x; if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y; if (pos.y > maxY) maxY = pos.y;
        if (pos.z < minZ) minZ = pos.z; if (pos.z > maxZ) maxZ = pos.z;
    }

    minX = Math.floor(minX / CHUNK_BLOCKS) * CHUNK_BLOCKS;
    minZ = Math.floor(minZ / CHUNK_BLOCKS) * CHUNK_BLOCKS;
    maxX = Math.min(minX + 95, Math.ceil((maxX + 1) / CHUNK_BLOCKS) * CHUNK_BLOCKS - 1);
    maxZ = Math.min(minZ + 95, Math.ceil((maxZ + 1) / CHUNK_BLOCKS) * CHUNK_BLOCKS - 1);
    const yMin = dimensionId === "minecraft:nether" || dimensionId === "minecraft:the_end" ? 0 : -64;
    const yMax = dimensionId === "minecraft:nether" ? 127 : dimensionId === "minecraft:the_end" ? 255 : 319;
    minY = Math.max(yMin, Math.min(yMax, minY));
    maxY = Math.max(yMin, Math.min(yMax, maxY));

    const name = taName(playerId);
    const key = `${dimensionId}:${minX},${minZ},${maxX},${maxZ}`;
    const prev = activeTAs.get(playerId);
    if (prev && prev.key === key) return;

    if (prev) {
        try {
            world.getDimension(prev.dimensionId)
                .runCommand(`tickingarea remove ${prev.name}`);
        } catch {}
        saveRemove(prev.name, prev.dimensionId);
        activeTAs.delete(playerId);
    }

    try {
        world.getDimension(dimensionId)
            .runCommand(`tickingarea add ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} ${name}`);
        activeTAs.set(playerId, { dimensionId, name, key });
        saveAdd(name, dimensionId);
    } catch (e) {
        console.warn(`[EB] tickingarea add failed: ${e}`);
    }
}

export function releaseChunkLoaders(playerId) {
    const ta = activeTAs.get(playerId);
    if (!ta) return;
    try {
        world.getDimension(ta.dimensionId)
            .runCommand(`tickingarea remove ${ta.name}`);
    } catch {}
    saveRemove(ta.name, ta.dimensionId);
    activeTAs.delete(playerId);
}

/** Removes ticking areas a previous run left behind (crash or restart), then clears the saved list. */
export function cleanupAllChunkLoaders() {
    for (const { name, dimensionId } of readSaved()) {
        try { world.getDimension(dimensionId).runCommand(`tickingarea remove ${name}`); } catch {}
    }
    writeSaved([]);
    activeTAs.clear();
}
world.afterEvents.worldLoad.subscribe(() => cleanupAllChunkLoaders());
