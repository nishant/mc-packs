// @ts-nocheck
import { world, system } from "@minecraft/server";
import { getState, clearAnchor, getWaypoints } from "./PlayerState.js";
import { isDiggingTool } from "./BlockDestroyer.js";
import { getModeHandler, MODE_OPTIONS } from "../modes/ModeRegistry.js";
import { FACE_OFFSETS, smartOutline, wireframePositions, skeletonAABB, boxEdges, sampledBoxEdges, catmullRomSpline, aabbBounds } from "../utils/GeometryUtils.js";
import { getModeOption } from "../utils/ModeOptions.js";
import { getPreviewMode, getDestroyPreviewMode, getFlickPreview, getAirBuildReach, getInfiniteReach, getInfiniteReachDistance, getReplaceBlocks, getMaxBlocks, getPreviewQuality, getSwapBookActions, getDeferShapeCalc, SHAPE_SETTLE_TICKS } from "./Settings.js";
import { BOOK_ID, TUTORIAL_BOOK_ID, heldItemCached, idleSkip, IDLE_EVERY, allPlayers } from "../utils/Items.js";
import { createIdleClock } from "../utils/idle-cadence.js";
import { holdsBuildTool } from "../utils/build-tool.js";
import { beginVisualizationTick, markHolderDirty, onHolderMark, visualizationHolders, visualizationIdle, visualizationReleased } from "../utils/tool-gate.js";
import { wakeLoop } from "../utils/wake-loop.js";
import { creaseSegmentsGen, creaseSegments, boxSegments, capSegments } from "../utils/edges.js";
import { drawSegments, EDGE_CAP } from "./EdgeParticles.js";
import { modifiedStates } from "../modifiers/MirrorModifier.js";
import { expandBeds, isBedType, directionFromYaw, directionFromStates, bedPartnerPos } from "./beds.js";

/** Players the preview looks at every tick: a mode on, or a book in hand. The others every IDLE_EVERY ticks. */
const previewBusy = new WeakSet();
import { ALWAYS_REPLACEABLE } from "./BlockPlacer.js";
import { getPaletteMode, getDistributionMode } from "./Palette.js";
import { isCreative } from "../utils/InventoryUtils.js";
import { t, rawtext } from "../utils/Text.js";
import { isActionBarLocked, steadyBar } from "../utils/ActionBar.js";
import { showHintOnce } from "../utils/Hints.js";
import { sampleTps, tpsText } from "../utils/Tps.js";
import { getAirBuildTarget } from "../modes/AirBuildMode.js";
import { yawToFacingIndex, getRotatedEntries, boxVolume } from "./Clipboard.js";
import { applyModifiers, applyModifiersToEntries, getModifierCacheKey } from "./ModifierPipeline.js";
import { aimingAtPanel } from "./EntityPanel.js";
import { aimingAtCoach } from "./Coach.js";
import { aimingAtPicker } from "./LanguagePicker.js";
import { overBudget } from "./TickBudget.js";

const previewTicks         = new Map();
const previewTierQ         = new Map();
const previewLastTargetKey = new Map();
const flickChangeAt        = new Map();
const FLICK_WINDOW_TICKS   = 6;

function qSuffix(q) { return q === 1 ? "" : "_q" + q; }
function previewParticle(q)  { return "eb:preview"           + qSuffix(q); }
function outlineParticle(q)  { return "eb:controller"        + qSuffix(q); }
function destroyParticle(q)  { return "eb:controller_destroy"+ qSuffix(q); }
const FILL_THRESHOLD = 500;

const BIG_PREVIEW_TIER = 5;
/** The redraw period for an outline of `count` lines: about 50 particles a tick at most, whatever the shape. */
function segmentTier(count) {
    return count <= 50 ? 1 : count <= 100 ? 2 : count <= 150 ? 3 : count <= 200 ? 4 : BIG_PREVIEW_TIER;
}
const WOOD_BLOCK_IDS = new Set([
    "minecraft:oak_log","minecraft:oak_planks","minecraft:oak_wood",
    "minecraft:stripped_oak_log","minecraft:stripped_oak_wood",
    "minecraft:oak_stairs","minecraft:oak_slab","minecraft:wooden_door","minecraft:trapdoor",
    "minecraft:spruce_log","minecraft:spruce_planks","minecraft:spruce_wood",
    "minecraft:stripped_spruce_log","minecraft:stripped_spruce_wood",
    "minecraft:spruce_stairs","minecraft:spruce_slab","minecraft:spruce_door","minecraft:spruce_trapdoor",
    "minecraft:birch_log","minecraft:birch_planks","minecraft:birch_wood",
    "minecraft:stripped_birch_log","minecraft:stripped_birch_wood",
    "minecraft:birch_stairs","minecraft:birch_slab","minecraft:birch_door","minecraft:birch_trapdoor",
    "minecraft:jungle_log","minecraft:jungle_planks","minecraft:jungle_wood",
    "minecraft:stripped_jungle_log","minecraft:stripped_jungle_wood",
    "minecraft:jungle_stairs","minecraft:jungle_slab","minecraft:jungle_door","minecraft:jungle_trapdoor",
    "minecraft:acacia_log","minecraft:acacia_planks","minecraft:acacia_wood",
    "minecraft:stripped_acacia_log","minecraft:stripped_acacia_wood",
    "minecraft:acacia_stairs","minecraft:acacia_slab","minecraft:acacia_door","minecraft:acacia_trapdoor",
    "minecraft:dark_oak_log","minecraft:dark_oak_planks","minecraft:dark_oak_wood",
    "minecraft:stripped_dark_oak_log","minecraft:stripped_dark_oak_wood",
    "minecraft:dark_oak_stairs","minecraft:dark_oak_slab","minecraft:dark_oak_door","minecraft:dark_oak_trapdoor",
    "minecraft:mangrove_log","minecraft:mangrove_planks","minecraft:mangrove_wood",
    "minecraft:stripped_mangrove_log","minecraft:stripped_mangrove_wood",
    "minecraft:mangrove_stairs","minecraft:mangrove_slab","minecraft:mangrove_door","minecraft:mangrove_trapdoor",
    "minecraft:cherry_log","minecraft:cherry_planks","minecraft:cherry_wood",
    "minecraft:stripped_cherry_log","minecraft:stripped_cherry_wood",
    "minecraft:cherry_stairs","minecraft:cherry_slab","minecraft:cherry_door","minecraft:cherry_trapdoor",
    "minecraft:pale_oak_log","minecraft:pale_oak_planks","minecraft:pale_oak_wood",
    "minecraft:stripped_pale_oak_log","minecraft:stripped_pale_oak_wood",
    "minecraft:pale_oak_stairs","minecraft:pale_oak_slab","minecraft:pale_oak_door","minecraft:pale_oak_trapdoor",
    "minecraft:crimson_stem","minecraft:crimson_planks","minecraft:crimson_hyphae",
    "minecraft:stripped_crimson_stem","minecraft:stripped_crimson_hyphae",
    "minecraft:crimson_stairs","minecraft:crimson_slab","minecraft:crimson_door","minecraft:crimson_trapdoor",
    "minecraft:warped_stem","minecraft:warped_planks","minecraft:warped_hyphae",
    "minecraft:stripped_warped_stem","minecraft:stripped_warped_hyphae",
    "minecraft:warped_stairs","minecraft:warped_slab","minecraft:warped_door","minecraft:warped_trapdoor",
    "minecraft:bamboo_block","minecraft:bamboo_planks","minecraft:stripped_bamboo_block",
    "minecraft:bamboo_stairs","minecraft:bamboo_slab","minecraft:bamboo_door","minecraft:bamboo_trapdoor",
    "minecraft:bamboo_mosaic","minecraft:bamboo_mosaic_stairs","minecraft:bamboo_mosaic_slab",
    "minecraft:crafting_table","minecraft:chest","minecraft:trapped_chest",
    "minecraft:smithing_table","minecraft:cartography_table","minecraft:fletching_table",
    "minecraft:beehive","minecraft:bookshelf","minecraft:barrel",
    "minecraft:lectern","minecraft:loom","minecraft:chiseled_bookshelf",
    "minecraft:noteblock","minecraft:scaffolding",
]);
function isWood(typeId) { return WOOD_BLOCK_IDS.has(typeId); }
const lastPreviewTarget    = new Map();
const lastPreviewTargetPos = new Map();
export function getLastPreviewTargetPos(playerId) {
    return lastPreviewTargetPos.get(playerId) ?? null;
}

const previewCache  = new Map();
const pasteStableMs = new Map();
const shapeStableAt = new Map();

const CURVE_MODES = new Set(
    Object.keys(MODE_OPTIONS).filter(m => MODE_OPTIONS[m].some(o => o.key === "curve")),
);

const DEFER_HINT_AFTER_DRAWS = 40;
const deferHintDraws = new Map();
const deferHintDone  = new Set();

const lastSolvedFamily = new Map();
function particleFamily(id) {
    if (id.startsWith("eb:controller_destroy")) return "destroy";
    if (id.startsWith("eb:controller"))         return "outline";
    return "preview";
}

/** player id -> the digging tools' uses left, as last read: { tick, slot, typeId, durabRemaining, durabMax, total, spares } */
const toolTotals = new Map();
/** Re-read at least this often even without an inventory event (a missed event can only be this stale). */
const TOOL_TOTALS_TICKS = 100;
/**
 * The held digging tool's uses left and those of the spare tools of its kind in the inventory. The 36-slot scan runs
 * once and again only after an inventory change, a slot change or another tool in hand (BSE-03).
 */
function destroyToolTotals(player, held) {
    const now = system.currentTick;
    const slot = player.selectedSlotIndex;
    const c = toolTotals.get(player.id);
    if (c && c.slot === slot && c.typeId === held?.typeId && now - c.tick < TOOL_TOTALS_TICKS) return c;
    const out = { tick: now, slot, typeId: held?.typeId, durabRemaining: -1, durabMax: -1, total: -1, spares: 0 };
    try {
        const dc = held?.getComponent("minecraft:durability");
        if (dc) {
            out.durabRemaining = dc.maxDurability - dc.damage;
            out.durabMax       = dc.maxDurability;
            out.total          = out.durabRemaining;
            try {
                const invComp = player.getComponent("minecraft:inventory")?.container;
                const size = invComp?.size ?? 0;
                const ht = held.typeId;
                const kind = ht.includes("_pickaxe") ? "_pickaxe" : ht.includes("_axe") ? "_axe" : ht.includes("_shovel") ? "_shovel" : null;
                if (kind) for (let s = 0; s < size; s++) {
                    if (s === slot) continue;
                    const spare = invComp.getItem(s);
                    if (!spare || !spare.typeId.includes(kind) || !isDiggingTool(spare.typeId)) continue;
                    // "_axe" is also in "_pickaxe": an axe's spares are axes only
                    if (kind === "_axe" && spare.typeId.includes("_pickaxe")) continue;
                    const sdc = spare.getComponent("minecraft:durability");
                    if (!sdc) continue;
                    const spareDur = sdc.maxDurability - sdc.damage;
                    if (spareDur <= 0) continue;
                    out.total += spareDur;
                    out.spares++;
                }
            } catch { }
        }
    } catch { }
    toolTotals.set(player.id, out);
    return out;
}
try {
    world.afterEvents.playerInventoryItemChange.subscribe(({ player }) => { toolTotals.delete(player.id); });
} catch {}

/** A player left: everything the preview kept for them (BSE-22). */
export function forgetPreviewPlayer(playerId) {
    clearPreviewCache(playerId);
    clearDeferHintState(playerId);
    previewTicks.delete(playerId);
    previewTierQ.delete(playerId);
    previewLastTargetKey.delete(playerId);
    lastPreviewTarget.delete(playerId);
}

export function clearPreviewCache(playerId) {
    toolTotals.delete(playerId);
    previewCache.delete(playerId);
    pasteStableMs.delete(playerId);
    lastPreviewTargetPos.delete(playerId);
    flickChangeAt.delete(playerId);
    pasteSkeletonCache.delete(playerId);
    shapeStableAt.delete(playerId);
    solving.delete(playerId);
}

export function clearDeferHintState(playerId) {
    deferHintDraws.delete(playerId);
    deferHintDone.delete(playerId);
    lastSolvedFamily.delete(playerId);
}
function borderPositions(positions) {
    return smartOutline(positions);
}
function adaptiveParticles(positions) {
    if (positions.length <= FILL_THRESHOLD) return positions;
    const border      = borderPositions(positions);
    const borderKeys  = new Set(border.map(p => `${p.x},${p.y},${p.z}`));
    const interior    = positions.filter(p => !borderKeys.has(`${p.x},${p.y},${p.z}`));
    if (interior.length === 0) return positions;
    const interiorBudget = FILL_THRESHOLD - border.length;
    if (interiorBudget <= 0) return border;
    const step    = Math.ceil(interior.length / interiorBudget);
    const sampled = interior.filter((_, i) => i % step === 0);
    return [...border, ...sampled];
}
export function getTargetPos(player) {
    try {
        const hit = player.getBlockFromViewDirection({
            maxDistance: 64,
            includePassableBlocks: false,
        });
        if (hit?.block) {
            const head = player.getHeadLocation();
            const dir  = player.getViewDirection();
            const bl   = hit.block.location;
            const face = hit.face;
            const off = FACE_OFFSETS[face] ?? { x: 0, y: 1, z: 0 };
            const adj = { x: bl.x + off.x, y: bl.y + off.y, z: bl.z + off.z };
            const FACE_NORMAL = { North:'z', South:'z', West:'x', East:'x', Down:'y', Up:'y' };
            const FACE_PLANE  = {
                North: bl.z,     South: bl.z + 1,
                West:  bl.x,     East:  bl.x + 1,
                Down:  bl.y,     Up:    bl.y + 1,
            };
            const axis = FACE_NORMAL[face];
            const pv   = FACE_PLANE[face];
            if (axis !== undefined && pv !== undefined && Math.abs(dir[axis]) > 0.001) {
                const t = (pv - head[axis]) / dir[axis];
                if (t > 0) {
                    return {
                        x: axis === 'x' ? adj.x : Math.floor(head.x + dir.x * t),
                        y: axis === 'y' ? adj.y : Math.floor(head.y + dir.y * t),
                        z: axis === 'z' ? adj.z : Math.floor(head.z + dir.z * t),
                    };
                }
            }
            return adj;
        }
    } catch {  }
    try {
        const head = player.getHeadLocation();
        const dir  = player.getViewDirection();
        return {
            x: Math.floor(head.x + dir.x * 24),
            y: Math.floor(head.y + dir.y * 24),
            z: Math.floor(head.z + dir.z * 24),
        };
    } catch { return null; }
}
export function getTargetBlock(player, maxDist = 64) {
    try {
        const hit = player.getBlockFromViewDirection({
            maxDistance: Math.min(maxDist, 512),
            includePassableBlocks: false,
        });
        if (hit?.block) {
            return hit.block.location;
        }
    } catch { }
    try {
        const head = player.getHeadLocation();
        const dir  = player.getViewDirection();
        return {
            x: Math.floor(head.x + dir.x * 24),
            y: Math.floor(head.y + dir.y * 24),
            z: Math.floor(head.z + dir.z * 24),
        };
    } catch { return null; }
}
export function getStep3HeightTarget(player, secondAnchor) {
    if (!secondAnchor) return null;
    try {
        const head = player.getHeadLocation();
        const dir  = player.getViewDirection();
        const dX   = secondAnchor.x + 0.5 - head.x;
        const dZ   = secondAnchor.z + 0.5 - head.z;
        const hDist    = Math.sqrt(dX * dX + dZ * dZ);
        const hViewLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        const MAX_T     = 64;
        const effectiveH = Math.max(hDist, 4);
        const t = hViewLen < 0.001
            ? Math.min(24, MAX_T)
            : Math.min(effectiveH / hViewLen, MAX_T);
        const rawY = Math.floor(head.y + dir.y * t);
        const dimId = player.dimension.id;
        const yMin = dimId === "minecraft:nether" ? 0 : dimId === "minecraft:the_end" ? 0 : -64;
        const yMax = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
        return {
            x: secondAnchor.x,
            y: Math.max(yMin, Math.min(yMax, rawY)),
            z: secondAnchor.z,
        };
    } catch { return null; }
}
/** Most block particles one draw spawns (an even sample past it): the paste ghost, a long curve, dots mode. */
const CELL_CAP = 300;
/** One particle a block, for the builder only (a preview is nobody else's: BSE-05). */
function spawnParticles(player, positions, particleId) {
    if (!positions?.length) return;
    const step = positions.length > CELL_CAP ? Math.ceil(positions.length / CELL_CAP) : 1;
    for (let i = 0; i < positions.length; i += step) {
        const p = positions[i];
        try {
            player.spawnParticle(particleId, { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });
        } catch { if (!player.isValid) return; }
    }
}
/**
 * Draws a cached preview: its outline segments (lines that last until the next draw, q ticks away) or its block
 * particles.
 */
function drawEntry(player, entry, q = entry?.drawQ ?? 1) {
    if (!entry) return;
    if (entry.segments) drawSegments(player, entry.segments, entry.edgeKind, q + 1);
    else spawnParticles(player, entry.preview, entry.particleId);
}

const pasteSkeletonCache = new Map();
const PASTE_SKELETON_BUDGET = 400;

function getPasteSkeleton(playerId, clipboard, pasteFacing) {
    const key = `${clipboard.version}|${pasteFacing}`;
    const hit = pasteSkeletonCache.get(playerId);
    if (hit && hit.key === key) return hit;

    const n = (pasteFacing - clipboard.captureFacing + 4) & 3;
    const X = Math.max(0, (clipboard.dims?.x ?? 1) - 1);
    const Y = Math.max(0, (clipboard.dims?.y ?? 1) - 1);
    const Z = Math.max(0, (clipboard.dims?.z ?? 1) - 1);

    let minX, maxX, minZ, maxZ;
    switch (n) {
        case 1:  minX = -Z; maxX = 0; minZ = 0;  maxZ = X; break;
        case 2:  minX = -X; maxX = 0; minZ = -Z; maxZ = 0; break;
        case 3:  minX = 0;  maxX = Z; minZ = -X; maxZ = 0; break;
        default: minX = 0;  maxX = X; minZ = 0;  maxZ = Z; break;
    }

    let offsets = boxEdges(minX, maxX, 0, Y, minZ, maxZ);
    if (offsets.length > PASTE_SKELETON_BUDGET) {
        const step = Math.ceil(offsets.length / PASTE_SKELETON_BUDGET);
        offsets = offsets.filter((_, i) => i % step === 0);
    }

    const entry = { key, offsets, minX, maxX, minY: 0, maxY: Y, minZ, maxZ };
    pasteSkeletonCache.set(playerId, entry);
    return entry;
}

const DEFER_BOX_BUDGET = 288;

const SETTLE_MAX_VOLUME = 8_000;

function shapeBounds(handler, anchor, target, player, secondAnchor) {
    if (handler.getBounds) {
        try {
            const b = handler.getBounds(anchor, target, player, secondAnchor);
            if (b) return b;
        } catch {  }
    }
    const corner = secondAnchor
        ? { x: secondAnchor.x, y: target.y, z: secondAnchor.z }
        : handler.steps === 3
            ? { x: target.x, y: anchor.y, z: target.z }
            : target;
    return aabbBounds(anchor, corner);
}

function bboxCorners(minX, maxX, minY, maxY, minZ, maxZ) {
    const seen = new Set();
    const out  = [];
    for (const x of [minX, maxX])
        for (const y of [minY, maxY])
            for (const z of [minZ, maxZ]) {
                const k = `${x},${y},${z}`;
                if (!seen.has(k)) { seen.add(k); out.push({ x, y, z }); }
            }
    return out;
}

const tpsPart = { text: "" };

const AIR_ID     = "minecraft:air";
const BEDROCK_ID = "minecraft:bedrock";

/** player id -> the solve being read in a job, { key, gen }. A newer aim or a cleared preview replaces or drops it. */
const solving = new Map();

/** Over the block limit: keep the last outline of the same context with a warning instead. */
function warnOverLimit(player, contextKey, cacheKey, cap) {
    const last = previewCache.get(player.id);
    const warnBar = t("eb.preview.exceeds_limit", cap.toLocaleString());
    if (last?.contextKey === contextKey) {
        previewCache.set(player.id, { ...last, key: cacheKey, settled: true, actionBar: warnBar });
        drawEntry(player, last);
    }
    if (!isActionBarLocked(player.id)) steadyBar(player, warnBar);
}

/** Caches a finished solve and draws it. */
function applySolve(player, dim, entry) {
    if (entry.tier !== undefined) previewTierQ.set(player.id, entry.tier);
    lastSolvedFamily.set(player.id, entry.family);
    previewCache.set(player.id, entry);
    if (!isActionBarLocked(player.id)) steadyBar(player, entry.actionBar);
    drawEntry(player, entry);
}

/** Runs the rest of a solve a slice a tick; stops when a newer aim replaced it or the preview was cleared. */
function* finishSolve(player, playerId, dim, job) {
    try {
        while (solving.get(playerId) === job) {
            const step = job.gen.next();
            if (step.done) {
                solving.delete(playerId);
                if (step.value && player.isValid) applySolve(player, dim, step.value);
                return;
            }
            yield;
        }
    } catch {
        if (solving.get(playerId) === job) solving.delete(playerId);
    }
}

/**
 * Reads the shape at one aim and builds its outline, bar and cache entry (BSE-02). Each cell is read once for both the
 * shape and its shell (kept in a Map by position), the states only for a bed, and the reading yields whenever this
 * tick's shared budget is spent, so a big shape is finished over a few ticks while the box stays drawn. After every
 * yield the player must still be here, in the same dimension, with the same anchor. Returns the entry to cache and draw,
 * or null when there is nothing to draw (a warning was already shown, or the player, anchor or dimension changed).
 */
function* solveShape(c) {
    const { player, state, handler, target, dim, creative, replaceBlocks, isDestroy, previewMode, quality, contextKey, cacheKey } = c;
    const anchor       = state.anchor;
    const secondAnchor = state.secondAnchor ?? null;
    const blockTypeId  = state.blockTypeId;
    const dimId        = dim.id;
    const live = () => {
        try { return player.isValid && getState(player).anchor === anchor && player.dimension.id === dimId; }
        catch { return false; }
    };
    const maxBlocks = getMaxBlocks(player);
    const rawPositions = handler.getPositions(anchor, target, player, secondAnchor, { cap: maxBlocks + 1 });
    if (rawPositions?.oversize || rawPositions?.length > maxBlocks) {
        warnOverLimit(player, contextKey, cacheKey, maxBlocks);
        return null;
    }
    if (!rawPositions?.length) return null;
    const allPositions = applyModifiers(player, rawPositions);
    if (!allPositions?.length) return null;

    // position -> its block's type, or null when there is no readable block there (unloaded, out of the world)
    const typeAt = new Map();
    let reads = 0;
    const read = (p) => {
        const k = `${p.x},${p.y},${p.z}`;
        let v = typeAt.get(k);
        if (v !== undefined) return v;
        try { v = dim.getBlock(p)?.typeId ?? null; } catch { v = null; }
        typeAt.set(k, v);
        return v;
    };

    let positions = [];
    const partners = [];
    for (const p of allPositions) {
        if ((++reads & 31) === 0 && overBudget()) {
            yield;
            if (!live()) return null;
        }
        const existing = read(p);
        if (isDestroy) {
            // Every breakable block (no air, no bedrock outside creative), plus the other half of each bed.
            if (existing === null || existing === AIR_ID) continue;
            if (!creative && existing === BEDROCK_ID) continue;
            positions.push(p);
            if (isBedType(existing)) {
                try {
                    const partner = bedPartnerPos(p, dim.getBlock(p).permutation.getAllStates());
                    if (partner) partners.push(partner);
                } catch {}
            }
        } else {
            if (existing !== null) {
                if (!creative && existing === BEDROCK_ID) continue;
                if (!replaceBlocks && !ALWAYS_REPLACEABLE.has(existing)) continue;
                if (existing === blockTypeId) continue;
            }
            positions.push(p);
        }
    }
    if (partners.length) {
        const keys = new Set(positions.map((p) => `${p.x},${p.y},${p.z}`));
        for (const partner of partners) {
            const k = `${partner.x},${partner.y},${partner.z}`;
            if (keys.has(k)) continue;
            keys.add(k);
            positions.push(partner);
        }
    }
    if (!positions.length) return null;
    if (!isDestroy) positions = previewBedPositions(positions, blockTypeId, player, state.blockStates);
    if (!positions.length) return null;
    const cap = getMaxBlocks(player);
    if (positions.length > cap) {
        warnOverLimit(player, contextKey, cacheKey, cap);
        return null;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    const dims = [dx + 1, dy + 1, dz + 1].filter(d => d > 1);
    const dimStr = dims.length ? dims.join('x') : '1';
    const dirKey = dx === 0 && dy === 0 && dz === 0 ? "eb.dir.single"
        : dx >= dy && dx >= dz ? "eb.dir.ew"
        : dz >= dx && dz >= dy ? "eb.dir.ns" : "eb.dir.ud";
    let stepHintKey;
    if (handler.steps === 3) {
        stepHintKey = secondAnchor
            ? (isDestroy ? "eb.preview.step3_destroy" : "eb.preview.step3_place")
            : "eb.preview.step2";
    } else {
        stepHintKey = isDestroy ? "eb.preview.hint_destroy" : "eb.preview.hint_place";
    }
    const { durabRemaining, durabMax, totalDurabRemaining, spareToolCount, paletteOn, paletteSrc, paletteDist } = c;
    let durabSuffix = "";
    if (durabRemaining >= 0) {
        const willBreak = positions.length >= totalDurabRemaining;
        const pct       = durabMax > 0 ? durabRemaining / durabMax : 1;
        const color     = willBreak ? "§c" : pct < 0.15 ? "§e" : "§f";
        const stackInfo = spareToolCount > 0 ? ` §8(+${spareToolCount} stacked)` : "";
        const breakMsg  = willBreak
            ? (spareToolCount > 0 ? " §c- all tools exhausted!" : " §c- tool will break!")
            : "";
        durabSuffix     = `\n${color}${totalDurabRemaining} uses left${stackInfo}${breakMsg}`;
    }
    const totalSteps = handler.steps === 3 ? 3 : 2;
    const curStep    = handler.steps === 3 ? (secondAnchor ? 3 : 2) : 2;
    const actionBar = rawtext(
        { text: `§f${positions.length} blocks §7(${dimStr})` },
        tpsPart,
        { text: `\n§7` },
        t(`eb.mode.${state.mode}`),
        { text: `  §8-  §7` },
        t("eb.preview.step_of", curStep, totalSteps),
        { text: `  §8-  §7` },
        t(dirKey),
        { text: `  §8-  ` },
        t(stepHintKey),
        ...(durabSuffix ? [{ text: durabSuffix }] : []),

        ...(paletteOn ? [
            { text: `\n` },
            t("eb.preview.palette_active",
                t(`eb.palette.source.${paletteSrc}`),
                t(`eb.palette.dist.${paletteDist}`)),
        ] : []),
    );

    // The shell is read through the same Map: only its cells that are not in the shape cost a read.
    function* shellBase() {
        if (!handler.getShellPositions) return positions;
        const shellAll = handler.getShellPositions(anchor, target, player, secondAnchor);
        if (!shellAll?.length) return positions;
        const filtered = [];
        for (const p of shellAll) {
            if ((++reads & 31) === 0 && overBudget()) {
                yield;
                if (!live()) return null;
            }
            const existing = read(p);
            if (isDestroy) {
                if (existing === null || existing === AIR_ID) continue;
                if (!creative && existing === BEDROCK_ID) continue;
            } else if (existing !== null) {
                if (!creative && existing === BEDROCK_ID) continue;
                if (existing === blockTypeId) continue;
            }
            filtered.push(p);
        }
        return filtered.length ? filtered : positions;
    }

    const { PARTICLE, CONTROLLER, CONTROLLER_DESTROY } = c;
    const isCornerOutline = previewMode === "corner_outline";
    const isOutline       = isDestroy || previewMode === "outline" || isCornerOutline;
    let preview;
    let particleId = PARTICLE;
    let tier;
    let segments;
    if (isCornerOutline) {
        preview = bboxCorners(minX, maxX, minY, maxY, minZ, maxZ);
        particleId = isDestroy ? CONTROLLER_DESTROY : CONTROLLER;
    } else if (isOutline) {
        // The shape's outer edges as lines (BSE-05, BSE-29): a box is 12 particles whatever its size. Built from the
        // cells that change, a slice at a time like the reads; at most EDGE_CAP lines (the longest), and the redraw
        // slows with the count the same way for building and digging.
        const edges = creaseSegmentsGen(positions, overBudget);
        let segs;
        for (;;) {
            const step = edges.next();
            if (step.done) { segs = step.value; break; }
            yield;
            if (!live()) return null;
        }
        segments = capSegments(segs, EDGE_CAP);
        tier = segmentTier(segments.length);
        particleId = isDestroy ? CONTROLLER_DESTROY : CONTROLLER;
    } else {
        let base = yield* shellBase();
        if (!base) return null;
        if (!isDestroy) base = previewBedPositions(base, blockTypeId, player, state.blockStates);
        preview = adaptiveParticles(wireframePositions(base));
    }
    return {
        key: cacheKey, contextKey, settled: true, preview, particleId, actionBar, tier,
        segments, edgeKind: isDestroy ? "destroy" : "place", drawQ: Math.max(quality, tier ?? 1),
        family: { mode: state.mode, destroy: isDestroy, family: particleFamily(particleId) },
    };
}

function previewBedPositions(positions, typeId, player, blockStates) {
    if (!isBedType(typeId) || !positions?.length) return positions;
    let yaw = 0;
    try { yaw = player.getRotation().y; } catch { yaw = 0; }
    const { positions: expanded } = expandBeds(positions.map((p) => {
        const raw = p.states ?? p._resolvedStates ?? blockStates ?? {};
        const flipped = modifiedStates(raw, p);
        return {
            x: p.x, y: p.y, z: p.z, typeId,
            direction: directionFromStates(flipped) ?? directionFromYaw(yaw),
            states: flipped,
            _alreadyHalf: flipped?.head_piece_bit === true,
        };
    }));
    return expanded.map((p) => ({ x: p.x, y: p.y, z: p.z, states: p._resolvedStates }));
}

/** A player stopped holding a tool: forget what was drawn for them, and clear an anchor only in "Disable". */
function releasePreview(player) {
    try {
        lastPreviewTarget.delete(player.id);
        previewCache.delete(player.id);
        solving.delete(player.id);
        previewBusy.delete(player);
        const state = getState(player);
        if (state.anchor && state.mode === "disable") clearAnchor(player);
    } catch {}
}

const previewClock = createIdleClock();
export function startPreviewLoop() {
    // Runs while the tool gate has holders or players to look at; a holder mark wakes it (BSE-31).
    const loop = wakeLoop(1, () => {
        if (visualizationIdle()) return false;
        sampleTps();
        const open = beginVisualizationTick(allPlayers(), holdsBuildTool, system.currentTick);
        // Put away what this preview drew for players who just stopped holding a tool. Their anchor stays (F8): it
        // is drawn again when they hold the block or tool it was set with. Only an anchor left over in "Disable"
        // (which never builds) is cleared.
        for (const player of visualizationReleased()) releasePreview(player);
        if (!open) return;
        tpsPart.text = `  §8-  ${tpsText()}`;
        const phase = previewClock.tick();
        const holders = visualizationHolders();
        for (let i = 0; i < holders.length; i++) {
            const player = holders[i];
            let anchored = false;
            try { anchored = !!getState(player).anchor; } catch { continue; }
            if (!anchored && idleSkip(player, i, previewBusy, phase, 1)) continue;
            if (!holdsBuildTool(player)) {
                markHolderDirty(player.id);
                previewBusy.delete(player);
                continue;
            }
            try {
                const idle   = getState(player).mode === "disable";
                const inHand = heldItemCached(player, IDLE_EVERY);
                const book   = inHand?.typeId === BOOK_ID || inHand?.typeId === TUTORIAL_BOOK_ID;
                if (idle && !book) previewBusy.delete(player);
                else previewBusy.add(player);
                if (book) {
                    if (!isActionBarLocked(player.id)) {
                        steadyBar(player,
                            inHand.typeId === TUTORIAL_BOOK_ID
                                ? t("eb.bar.tutorial_book_controls")
                                : t(getSwapBookActions(player) ? "eb.bar.book_controls_swapped" : "eb.bar.book_controls")
                        );
                    }
                    continue;
                }

                if (aimingAtPanel(player) || aimingAtCoach(player) || aimingAtPicker(player)) continue;

                const state      = getState(player);
                if (state.mode === "disable" || (state.anchor && !state.blockTypeId)) {
                    lastPreviewTarget.delete(player.id);
                    previewCache.delete(player.id);
                    continue;
                }

                const quality    = getPreviewQuality(player);
                const tick       = (previewTicks.get(player.id) ?? 0) + 1;
                previewTicks.set(player.id, tick);
                const autoTier   = previewTierQ.get(player.id) ?? 1;

                const pastePositioning = state.mode === "copy_paste" && !!state.clipboard;
                const isCursorPreview  = !pastePositioning
                    && (state.mode === "air_build" || !state.anchor);

                const drawQ      = isCursorPreview ? 1 : Math.max(quality, autoTier);

                if (tick % drawQ !== 0) continue;

                const qt      = getTargetPos(player) ?? getTargetBlock(player);
                const qk      = qt ? `${qt.x},${qt.y},${qt.z}` : null;
                const lastQK  = previewLastTargetKey.get(player.id) ?? null;
                const posMoved = qk !== lastQK;
                if (qk !== null) previewLastTargetKey.set(player.id, qk);

                const flickMode = getFlickPreview(player);
                if (posMoved) flickChangeAt.set(player.id, tick);
                const flickHold = !flickMode
                    || (tick - (flickChangeAt.get(player.id) ?? -1e9)) < FLICK_WINDOW_TICKS;

                const PARTICLE           = previewParticle(drawQ);
                const CONTROLLER         = outlineParticle(drawQ);
                const CONTROLLER_DESTROY = destroyParticle(drawQ);

                const infiniteReach = getInfiniteReach(player);
                if (state.mode === "air_build") {
                    const previewMode = infiniteReach ? "outline" : getPreviewMode(player);
                    if (!infiniteReach && previewMode === "disable") continue;
                    const held = heldItemCached(player);
                    if (!held) continue;
                    const reach  = getAirBuildReach(player);
                    const target = getAirBuildTarget(player, reach);
                    if (!target) continue;
                    try {
                        if (player.dimension.getBlock(target)?.typeId === held.typeId) continue;
                    } catch {  }
                    const particleId = (previewMode === "outline" || previewMode === "corner_outline") ? CONTROLLER : PARTICLE;
                    spawnParticles(player, previewBedPositions([target], held.typeId, player), particleId);
                    if (!isActionBarLocked(player.id)) steadyBar(player,
                        t("eb.preview.air_build", target.x, target.y, target.z)
                    );
                    continue;
                }

                if (state.mode === "copy_paste") {
                    const dim            = player.dimension;
                    const previewMode    = getPreviewMode(player);
                    const useOutline     = previewMode !== "particle";
                    const useCornerOutline = previewMode === "corner_outline";
                    const particleId     = useOutline ? CONTROLLER : PARTICLE;

                    if (state.clipboard && !state.anchor) {
                        const target = getTargetPos(player);
                        if (!target) { lastPreviewTarget.delete(player.id); continue; }
                        const pasteFacing  = yawToFacingIndex(player.getRotation().y);
                        const targetKey    = `${target.x},${target.y},${target.z}`;
                        const stableInfo   = pasteStableMs.get(player.id);
                        if (!stableInfo || stableInfo.key !== targetKey) {
                            pasteStableMs.set(player.id, { key: targetKey, since: Date.now() });
                        }
                        const stableMs     = Date.now() - pasteStableMs.get(player.id).since;
                        const isStable     = stableMs >= 3000;
                        const countdownStep = (!isStable && stableMs >= 500)
                            ? (stableMs < 1500 ? 3 : stableMs < 2500 ? 2 : 1)
                            : 0;
                        const cacheKey     = `cp_paste|${targetKey}|${state.clipboard.version}|${pasteFacing}|${previewMode}|${isStable ? "g" : countdownStep}|${getModifierCacheKey(player)}`;
                        const cached       = previewCache.get(player.id);
                        const suppressBar  = Date.now() - (state.lastPasteAt ?? 0) < 1000;
                        if (cached?.key === cacheKey) {
                            if (flickHold) drawEntry(player, cached, drawQ);
                            if (!suppressBar && !isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                            continue;
                        }

                        let preview;
                        let fakePlace = false;
                        let ghostCount = 0;
                        let segments;

                        if (isStable && state.clipboard.blocks.length <= 500 && previewMode !== "particle") {
                            const pastePositions = applyModifiersToEntries(
                                player,
                                getRotatedEntries(state.clipboard, target, pasteFacing),
                            ).map(e => e.pos);
                            segments   = capSegments(creaseSegments(pastePositions), EDGE_CAP);
                            ghostCount = pastePositions.length;
                            fakePlace  = true;
                        } else {
                            const box = getPasteSkeleton(player.id, state.clipboard, pasteFacing);
                            if (useOutline && !useCornerOutline) {
                                segments = boxSegments(
                                    target.x + box.minX, target.x + box.maxX,
                                    target.y + box.minY, target.y + box.maxY,
                                    target.z + box.minZ, target.z + box.maxZ,
                                );
                            } else preview = box.offsets.map(o => ({
                                x: target.x + o.x, y: target.y + o.y, z: target.z + o.z,
                            }));
                            if (useCornerOutline) {
                                preview = bboxCorners(
                                    target.x + box.minX, target.x + box.maxX,
                                    target.y + box.minY, target.y + box.maxY,
                                    target.z + box.minZ, target.z + box.maxZ,
                                );
                            }
                        }
                        const previewParticle = fakePlace ? CONTROLLER : particleId;

                        const clipCount = state.clipboard.blocks.length;
                        const d         = state.clipboard.dims;
                        const dimStr    = d ? `${d.x}x${d.y}x${d.z}` : "";
                        const actionBar = fakePlace
                            ? rawtext(
                                { text: `§f${ghostCount} §7blocks §8-  §a* §7ghost preview\n` },
                                { text: `§7Right-click to place  §8-  §7Move cursor to dismiss` },
                              )
                            : countdownStep > 0
                            ? rawtext(
                                { text: `§f${clipCount} §7blocks copied §8(${dimStr})\n` },
                                { text: `§7Right-click to paste  §8-  §e${"o".repeat(countdownStep)}§8${".".repeat(3 - countdownStep)}` },
                              )
                            : rawtext(
                                { text: `§f${clipCount} §7blocks copied §8(${dimStr})\n` },
                                { text: `§7Right-click to paste  §8-  §7Sneak+click to recopy` },
                              );
                        const entry = { key: cacheKey, preview, particleId: previewParticle, actionBar, segments, edgeKind: "place", drawQ };
                        previewCache.set(player.id, entry);
                        drawEntry(player, entry);
                        if (!suppressBar && !isActionBarLocked(player.id)) steadyBar(player, actionBar);
                        continue;
                    }

                    if (!state.clipboard && state.anchor) {
                        const hasSecondAnchor = !!state.secondAnchor;
                        let target;
                        if (hasSecondAnchor) {
                            target = getStep3HeightTarget(player, state.secondAnchor) ?? getTargetPos(player);
                        } else {
                            target = player.isSneaking
                                ? (getTargetBlock(player) ?? getTargetPos(player))
                                : (getTargetPos(player) ?? getTargetBlock(player));
                        }
                        if (!target) { lastPreviewTarget.delete(player.id); continue; }
                        const anchor       = state.anchor;
                        const secondAnchor = state.secondAnchor;
                        const saKey        = secondAnchor ? `${secondAnchor.x},${secondAnchor.y},${secondAnchor.z}` : "~";
                        const targetKey    = `${target.x},${target.y},${target.z}`;
                        const cacheKey     = `cp_copy|${anchor.x},${anchor.y},${anchor.z}|${saKey}|${targetKey}|${previewMode}`;
                        const cached       = previewCache.get(player.id);
                        if (cached?.key === cacheKey) {
                            if (flickHold) drawEntry(player, cached, drawQ);
                            if (!isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                            continue;
                        }
                        let x1, x2, y1, y2, z1, z2;
                        if (hasSecondAnchor && secondAnchor) {
                            x1 = Math.min(anchor.x, secondAnchor.x); x2 = Math.max(anchor.x, secondAnchor.x);
                            z1 = Math.min(anchor.z, secondAnchor.z); z2 = Math.max(anchor.z, secondAnchor.z);
                            y1 = Math.min(anchor.y, target.y);       y2 = Math.max(anchor.y, target.y);
                        } else {

                            x1 = Math.min(anchor.x, target.x); x2 = Math.max(anchor.x, target.x);
                            y1 = anchor.y; y2 = anchor.y;
                            z1 = Math.min(anchor.z, target.z); z2 = Math.max(anchor.z, target.z);
                        }
                        const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
                        // Same clamped y range Copy uses, so the "over your limit" warning matches what Copy accepts.
                        const blockCount = boxVolume(player.dimension.id, { x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 });
                        const dims    = [dx + 1, dy + 1, dz + 1].filter(d => d > 1);
                        const dimStr  = dims.length ? dims.join("x") : "1";
                        let preview;
                        let segments;
                        // The box's 12 edges as lines, however big; dots mode samples the edges (no cell of the box
                        // is ever listed: a far-off corner made a list of every cell before).
                        const copyLimitBlocks = getMaxBlocks(player);
                        const copyTooLarge = blockCount > copyLimitBlocks;
                        if (useCornerOutline) {
                            preview = bboxCorners(x1, x2, y1, y2, z1, z2);
                        } else if (useOutline) {
                            segments = boxSegments(x1, x2, y1, y2, z1, z2);
                        } else {
                            preview = sampledBoxEdges(x1, x2, y1, y2, z1, z2);
                        }
                        const actionBar = rawtext(
                            { text: `${copyTooLarge ? "§c" : "§f"}${blockCount} blocks §7(${dimStr})${copyTooLarge ? ` §c- over your limit of ${copyLimitBlocks}` : ""}\n` },
                            t(hasSecondAnchor ? "eb.preview.copy_step3" : "eb.preview.copy_step2"),
                        );
                        const entry = { key: cacheKey, preview, particleId, actionBar, segments, edgeKind: "place", drawQ };
                        previewCache.set(player.id, entry);
                        drawEntry(player, entry);
                        if (!isActionBarLocked(player.id)) steadyBar(player, actionBar);
                        continue;
                    }

                    const idleTarget = player.isSneaking
                        ? getTargetBlock(player)
                        : (getTargetPos(player) ?? getTargetBlock(player));
                    if (idleTarget) {
                        spawnParticles(player, [idleTarget], CONTROLLER);
                        if (!isActionBarLocked(player.id)) steadyBar(player,
                            t(player.isSneaking
                                ? "eb.preview.copy_corner1_sneak"
                                : "eb.preview.copy_corner1")
                        );
                    } else {
                        lastPreviewTarget.delete(player.id);
                    }
                    continue;
                }

                if (state.mode === "disable" || (state.anchor && !state.blockTypeId)) {
                    lastPreviewTarget.delete(player.id);
                    previewCache.delete(player.id);
                    continue;
                }
                if (!state.anchor) {
                    if (!infiniteReach) {
                        lastPreviewTarget.delete(player.id);
                        previewCache.delete(player.id);

                        if (!isActionBarLocked(player.id)) {
                            const idleHandler = getModeHandler(state.mode);
                            const idleTotal   = idleHandler?.steps === 3 ? 3 : 2;
                            const idleHeld    = heldItemCached(player);
                            const idlePalette = getPaletteMode(player);
                            const idlePalOn   = idlePalette && idlePalette !== "disable";
                            steadyBar(player, rawtext(
                                idleHeld
                                    ? t("eb.preview.idle_start", t(`eb.mode.${state.mode}`), 1, idleTotal)
                                    : t("eb.preview.idle_need_item", t(`eb.mode.${state.mode}`)),
                                tpsPart,
                                ...(idlePalOn ? [
                                    { text: `\n` },
                                    t("eb.preview.palette_active",
                                        t(`eb.palette.source.${idlePalette}`),
                                        t(`eb.palette.dist.${getDistributionMode(player)}`)),
                                ] : []),
                            ));
                        }
                        continue;
                    }
                    const previewMode = infiniteReach ? "outline" : getPreviewMode(player);
                    if (!infiniteReach && previewMode === "disable") continue;
                    const held = heldItemCached(player, IDLE_EVERY);
                    if (!held) {
                        lastPreviewTarget.delete(player.id);
                        continue;
                    }
                    const reach            = infiniteReach ? getInfiniteReachDistance(player) : getAirBuildReach(player);
                    const isDestroyPending = isDiggingTool(held.typeId);
                    const target = isDestroyPending
                        ? getTargetBlock(player, reach)
                        : getAirBuildTarget(player, reach);
                    if (!target) continue;
                    const particleId = (previewMode === "outline" || previewMode === "corner_outline") ? CONTROLLER : PARTICLE;
                    spawnParticles(player, [target], particleId);
                    if (!isActionBarLocked(player.id)) steadyBar(player,
                        t(isDestroyPending ? "eb.preview.no_anchor_destroy" : "eb.preview.no_anchor_build",
                            t(`eb.mode.${state.mode}`), target.x, target.y, target.z)
                    );
                    continue;
                }
                // Checked first: a hidden preview or another item in hand must not keep an anchor from another dimension.
                if (player.dimension.id !== state.anchor.dimensionId) {
                    lastPreviewTarget.delete(player.id);
                    previewCache.delete(player.id);
                    clearAnchor(player);
                    continue;
                }
                const isDestroy  = state.blockTypeId === "eb:destroy";
                const previewMode = isDestroy ? getDestroyPreviewMode(player) : getPreviewMode(player);
                if (previewMode === "disable" && !isDestroy) continue;
                // The hand cache is dropped on every hotbar or selected-slot change, so a few ticks old is still current.
                const held = heldItemCached(player, IDLE_EVERY);
                // Holding something else: the anchor is kept and just not drawn (F8).
                if (isDestroy ? (!held || !isDiggingTool(held.typeId)) : (!held || held.typeId !== state.blockTypeId)) {
                    lastPreviewTarget.delete(player.id);
                    previewCache.delete(player.id);
                    continue;
                }
                const dim            = player.dimension;
                const handler = getModeHandler(state.mode);
                if (!handler) continue;
                const isStep3 = handler.steps === 3 && !!state.secondAnchor;
                const getDefaultTarget = () => infiniteReach
                    ? getAirBuildTarget(player, getInfiniteReachDistance(player))
                    : (isDestroy ? getTargetBlock(player) : getTargetPos(player));
                let target;
                if (isStep3) {
                    target = (handler.getStep3Target?.(player, state.anchor, state.secondAnchor)
                        ?? getStep3HeightTarget(player, state.secondAnchor)) ?? getDefaultTarget();
                } else if (!isDestroy && handler.getTarget) {
                    target = handler.getTarget(player, state.anchor) ?? getDefaultTarget();
                } else {
                    target = getDefaultTarget();
                }
                if (!target) continue;
                lastPreviewTargetPos.set(player.id, target);
                const targetKey = `${target.x},${target.y},${target.z}`;
                if (lastPreviewTarget.get(player.id) !== targetKey) {
                    lastPreviewTarget.set(player.id, targetKey);
                    try {
                        player.playSound(
                            isWood(state.blockTypeId) ? "hit.wood" : "hit.stone",
                            { volume: 0.5 }
                        );
                    } catch {  }
                }
                const creative      = isCreative(player);
                const replaceBlocks = creative && getReplaceBlocks(player);
                let durabRemaining      = -1, durabMax = -1;
                let totalDurabRemaining = -1;
                let spareToolCount      = 0;
                if (isDestroy) {
                    // Read once and kept until the inventory, the slot or the tool changes (BSE-03).
                    const tools = destroyToolTotals(player, held);
                    durabRemaining      = tools.durabRemaining;
                    durabMax            = tools.durabMax;
                    totalDurabRemaining = tools.total;
                    spareToolCount      = tools.spares;
                }
                const yawQ = state.mode === "slope_floor"
                    ? Math.floor((((player.getRotation().y % 360) + 360) % 360) / 90)
                    : 0;

                const paletteSrc  = isDestroy ? "disable" : getPaletteMode(player);
                const paletteOn   = paletteSrc && paletteSrc !== "disable";
                const paletteDist = paletteOn ? getDistributionMode(player) : "";

                // No draw cadence (drawQ) in the key: the solve itself changes the cadence (previewTierQ), so a key
                // with it never found its own solve again and re-solved about every 13 ticks while the aim rested
                // (BSE-28). Each cached entry keeps its own particle id.
                const contextKey = `${state.mode}|${state.anchor.x},${state.anchor.y},${state.anchor.z}|${state.secondAnchor ? `${state.secondAnchor.x},${state.secondAnchor.y},${state.secondAnchor.z}` : "~"}|${state.blockTypeId}|${previewMode}|${creative ? 1 : 0}|${replaceBlocks ? 1 : 0}|${totalDurabRemaining}|${yawQ}|${paletteSrc}|${paletteDist}|${getModifierCacheKey(player)}`;

                const cacheKey = `${contextKey}|${targetKey}`;
                const cached   = previewCache.get(player.id);
                const sameAim  = cached?.key === cacheKey;

                if (sameAim && cached.settled) {
                    if (flickHold) drawEntry(player, cached, drawQ);
                    if (!isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                    continue;
                }

                const isBezier   = !isDestroy && CURVE_MODES.has(state.mode)
                    && getModeOption(player, state.mode, "curve") === "bezier";
                const deferShape = !isBezier && getDeferShapeCalc(player);
                let   settled    = true;
                let   bounds     = null;
                if (deferShape) {
                    bounds = shapeBounds(handler, state.anchor, target, player, state.secondAnchor ?? null);
                    const volume = (bounds.maxX - bounds.minX + 1)
                                 * (bounds.maxY - bounds.minY + 1)
                                 * (bounds.maxZ - bounds.minZ + 1);
                    if (volume > SETTLE_MAX_VOLUME) {

                        settled = false;
                    } else {
                        const stable = shapeStableAt.get(player.id);
                        if (!stable || stable.key !== cacheKey) {
                            shapeStableAt.set(player.id, { key: cacheKey, tick });
                            settled = false;
                        } else {
                            settled = (tick - stable.tick) >= SHAPE_SETTLE_TICKS;
                        }
                    }
                }

                if (sameAim && !settled) {
                    if (flickHold) drawEntry(player, cached, drawQ);
                    if (!isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                    continue;
                }

                if (deferShape && !settled) {

                    const b   = bounds;
                    const bdx = b.maxX - b.minX, bdy = b.maxY - b.minY, bdz = b.maxZ - b.minZ;
                    const bDims   = [bdx + 1, bdy + 1, bdz + 1].filter(d => d > 1);
                    const bDimStr = bDims.length ? bDims.join("x") : "1";

                    const boxBudget = Math.max(96, Math.floor(DEFER_BOX_BUDGET / quality));

                    let boxPreview = previewMode === "corner_outline"
                        ? bboxCorners(b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ)
                        : sampledBoxEdges(b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ, boxBudget);

                    const modded = applyModifiers(player, boxPreview);
                    if (modded !== boxPreview) {
                        boxPreview = modded;
                        if (boxPreview.length > boxBudget) {
                            const step = Math.ceil(boxPreview.length / boxBudget);
                            boxPreview = boxPreview.filter((_, i) => i % step === 0);
                        }
                    }

                    const boxCount = boxPreview.length;
                    const boxTier  = boxCount <=  50 ? 1
                                   : boxCount <= 100 ? 2
                                   : boxCount <= 150 ? 3
                                   : boxCount <= 200 ? 4
                                   : BIG_PREVIEW_TIER;
                    const boxSpawnQ = Math.max(quality, boxTier);

                    let boxFamily;
                    if (isDestroy)                            boxFamily = "destroy";
                    else if (previewMode === "corner_outline") boxFamily = "outline";
                    else if (previewMode === "particle")       boxFamily = "preview";
                    else {
                        const remembered = lastSolvedFamily.get(player.id);
                        const usable = remembered
                            && remembered.mode === state.mode
                            && remembered.destroy === isDestroy
                            && remembered.family !== "destroy";
                        boxFamily = usable
                            ? remembered.family
                            : (4 * (bdx + bdy + bdz) > 200 ? "preview" : "outline");
                    }
                    const boxParticle = boxFamily === "destroy" ? destroyParticle(boxSpawnQ)
                                      : boxFamily === "preview" ? previewParticle(boxSpawnQ)
                                      :                           outlineParticle(boxSpawnQ);
                    previewTierQ.set(player.id, boxTier);

                    const bDirKey = bdx === 0 && bdy === 0 && bdz === 0 ? "eb.dir.single"
                        : bdx >= bdy && bdx >= bdz ? "eb.dir.ew"
                        : bdz >= bdx && bdz >= bdy ? "eb.dir.ns" : "eb.dir.ud";
                    let bHintKey;
                    if (handler.steps === 3) {
                        bHintKey = state.secondAnchor
                            ? (isDestroy ? "eb.preview.step3_destroy" : "eb.preview.step3_place")
                            : "eb.preview.step2";
                    } else {
                        bHintKey = isDestroy ? "eb.preview.hint_destroy" : "eb.preview.hint_place";
                    }
                    const bTotal = handler.steps === 3 ? 3 : 2;
                    const bStep  = handler.steps === 3 ? (state.secondAnchor ? 3 : 2) : 2;
                    const boxActionBar = rawtext(
                        t("eb.preview.deferred_head", bDimStr),
                        tpsPart,
                        { text: `\n§7` },
                        t(`eb.mode.${state.mode}`),
                        { text: `  §8-  §7` },
                        t("eb.preview.step_of", bStep, bTotal),
                        { text: `  §8-  §7` },
                        t(bDirKey),
                        { text: `  §8-  ` },
                        t(bHintKey),
                        ...(paletteOn ? [
                            { text: `\n` },
                            t("eb.preview.palette_active",
                                t(`eb.palette.source.${paletteSrc}`),
                                t(`eb.palette.dist.${paletteDist}`)),
                        ] : []),
                    );

                    // An outline without modifiers: the box's 12 edges as lines (a modifier's copies stay sampled cells).
                    const boxSegs = previewMode !== "corner_outline" && previewMode !== "particle" && modded === boxPreview
                        ? boxSegments(b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ) : undefined;
                    if (boxSegs) previewTierQ.set(player.id, 1);
                    const boxEntry = {
                        key: cacheKey, contextKey, settled: false,
                        preview: boxPreview, particleId: boxParticle, actionBar: boxActionBar,
                        segments: boxSegs, edgeKind: isDestroy ? "destroy" : "place", drawQ: Math.max(quality, boxSegs ? 1 : boxTier),
                    };
                    previewCache.set(player.id, boxEntry);
                    if (flickHold) drawEntry(player, boxEntry);
                    if (!isActionBarLocked(player.id)) steadyBar(player, boxActionBar);

                    if (!deferHintDone.has(player.id)) {
                        const draws = (deferHintDraws.get(player.id) ?? 0) + 1;
                        deferHintDraws.set(player.id, draws);
                        if (draws >= DEFER_HINT_AFTER_DRAWS) {
                            deferHintDone.add(player.id);
                            deferHintDraws.delete(player.id);
                            showHintOnce(player, "defer_shape", "eb.hint.defer_shape");
                        }
                    }
                    continue;
                }

                if (isBezier) {
                    const waypoints = getWaypoints(player);
                    const allPoints = [state.anchor, ...waypoints, target];
                    const cap = getMaxBlocks(player);
                    const n = waypoints.length + 1;
                    const bezierContextKey = `bezier|${state.mode}|${state.anchor.x},${state.anchor.y},${state.anchor.z}|${n}`;
                    const wpsKey = `${n}:${target.x},${target.y},${target.z}`;
                    const splineCacheKey = `bezier|${state.mode}|${state.anchor.x},${state.anchor.y},${state.anchor.z}|${wpsKey}`;
                    const cachedSpline = previewCache.get(player.id);

                    const splinePositions = catmullRomSpline(allPoints, false, cap + 1);
                    if (!splinePositions?.length) continue;
                    if (splinePositions.length > cap) {
                        const stillRelevant = cachedSpline?.contextKey === bezierContextKey;
                        const warnBar = t("eb.preview.exceeds_limit", cap.toLocaleString());
                        if (stillRelevant) {
                            previewCache.set(player.id, { ...cachedSpline, key: splineCacheKey, actionBar: warnBar });
                            drawEntry(player, cachedSpline, drawQ);
                        }
                        if (!isActionBarLocked(player.id)) steadyBar(player, warnBar);
                        continue;
                    }
                    const preview = splinePositions;
                    const hint = n === 1
                        ? `§7Click to add curve points  §8-  §fSneak+click §7to place`
                        : `§f${n} points set  §8-  §fSneak+click §7to place  §8-  §7Click to add more`;
                    const actionBar = rawtext(
                        { text: `§f${preview.length} blocks\n` },
                        { text: hint },
                    );
                    if (cachedSpline?.key === splineCacheKey) {
                        if (flickHold) drawEntry(player, cachedSpline, drawQ);
                        if (!isActionBarLocked(player.id)) steadyBar(player, cachedSpline.actionBar);
                    } else {
                        const bezierParticleId = preview.length <= 200 ? CONTROLLER : PARTICLE;
                        previewCache.set(player.id, { key: splineCacheKey, contextKey: bezierContextKey, preview, particleId: bezierParticleId, actionBar });
                        spawnParticles(player, preview, bezierParticleId);
                        if (!isActionBarLocked(player.id)) steadyBar(player, actionBar);
                    }
                    continue;
                }

                // The shape at this aim is still being read in a job: keep what is drawn (the box) meanwhile.
                const pending = solving.get(player.id);
                if (pending?.key === cacheKey) {
                    if (cached) {
                        if (flickHold) drawEntry(player, cached, drawQ);
                        if (!isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                    }
                    continue;
                }
                const solve = solveShape({
                    player, state, handler, target, dim, creative, replaceBlocks, isDestroy, previewMode, quality,
                    contextKey, cacheKey, PARTICLE, CONTROLLER, CONTROLLER_DESTROY,
                    durabRemaining, durabMax, totalDurabRemaining, spareToolCount, paletteOn, paletteSrc, paletteDist,
                });
                // A small shape is read here, in this tick, as before; one that runs out of this tick's budget goes
                // on in a job, a slice a tick.
                const first = solve.next();
                if (first.done) {
                    solving.delete(player.id);
                    if (first.value) applySolve(player, dim, first.value);
                    continue;
                }
                const job = { key: cacheKey, gen: solve };
                solving.set(player.id, job);
                system.runJob(finishSolve(player, player.id, dim, job));
                if (cached) {
                    if (flickHold) drawEntry(player, cached, drawQ);
                    if (!isActionBarLocked(player.id)) steadyBar(player, cached.actionBar);
                }
            } catch {  }
        }
    }, () => !visualizationIdle());
    onHolderMark(loop.wake);
    loop.wake();
}
