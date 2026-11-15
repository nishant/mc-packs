// @ts-nocheck
import { world } from "@minecraft/server";

const activeTAs  = new Map();
const CHUNK_BLOCKS = 16;
const TA_PROP = "eb:tickingAreas";
// The world allows 10 ticking areas and Expeditions needs one per dungeon: builds hold at most two at a time.
const MAX_BUILD_AREAS = 2;
/** player ids whose failed add was already logged (once until one succeeds) */
const warned = new Set();

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

/** The chunk-aligned area (at most 96 blocks a side, from the box's low corner) a loader for this box covers. */
export function loaderArea(dimensionId, box) {
    const minX = Math.floor(box.minX / CHUNK_BLOCKS) * CHUNK_BLOCKS;
    const minZ = Math.floor(box.minZ / CHUNK_BLOCKS) * CHUNK_BLOCKS;
    const maxX = Math.min(minX + 95, Math.ceil((box.maxX + 1) / CHUNK_BLOCKS) * CHUNK_BLOCKS - 1);
    const maxZ = Math.min(minZ + 95, Math.ceil((box.maxZ + 1) / CHUNK_BLOCKS) * CHUNK_BLOCKS - 1);
    const yMin = dimensionId === "minecraft:nether" || dimensionId === "minecraft:the_end" ? 0 : -64;
    const yMax = dimensionId === "minecraft:nether" ? 127 : dimensionId === "minecraft:the_end" ? 255 : 319;
    const minY = Math.max(yMin, Math.min(yMax, box.minY));
    const maxY = Math.max(yMin, Math.min(yMax, box.maxY));
    return { dimensionId, minX, minY, minZ, maxX, maxY, maxZ };
}

/**
 * Keeps one ticking area per player over the box of the blocks that came back unloaded (BSE-32: only then, never for
 * a paste into loaded chunks). Returns the area now loaded for this player, or null when none could be added.
 */
export function ensureChunkLoaders(playerId, dimensionId, box) {
    if (!box) {
        releaseChunkLoaders(playerId);
        return null;
    }
    const area = loaderArea(dimensionId, box);
    const { minX, minY, minZ, maxX, maxY, maxZ } = area;
    const name = taName(playerId);
    const key = `${dimensionId}:${minX},${minZ},${maxX},${maxZ}`;
    const prev = activeTAs.get(playerId);
    if (prev && prev.key === key) return prev.area;
    if (!prev && activeTAs.size >= MAX_BUILD_AREAS) return null;

    if (prev) {
        try {
            world.getDimension(prev.dimensionId)
                .runCommand(`tickingarea remove ${prev.name}`);
        } catch {}
        saveRemove(prev.name, prev.dimensionId);
        activeTAs.delete(playerId);
    }

    try {
        const result = world.getDimension(dimensionId)
            .runCommand(`tickingarea add ${minX} ${minY} ${minZ} ${maxX} ${maxY} ${maxZ} ${name}`);
        if (result && result.successCount === 0) throw new Error("the world has no free ticking area");
        activeTAs.set(playerId, { dimensionId, name, key, area });
        saveAdd(name, dimensionId);
        warned.delete(playerId);
        return area;
    } catch (e) {
        if (!warned.has(playerId)) {
            warned.add(playerId);
            console.warn(`[EB] tickingarea add failed: ${e}`);
        }
        return null;
    }
}

export function releaseChunkLoaders(playerId) {
    warned.delete(playerId);
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
