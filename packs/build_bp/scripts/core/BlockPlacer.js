// @ts-nocheck
import { system, BlockPermutation } from "@minecraft/server";
import { modifiedStates, hasStateMods } from "../modifiers/MirrorModifier.js";
import { getMaxBlocks, getBuildSpeed, getUndoThreshold, getReplaceBlocks } from "./Settings.js";
import { isCreative, countBlocks, removeBlocks, giveBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { enqueue } from "./PlacementQueue.js";
import { reportPlaced } from "../utils/PlacedReport.js";
import { snapshotJob, recordSnapshot, pack, trackWrites } from "./UndoRedo.js";
import { overBudget, sliceDue, runJobAsync, ownerHere, inTurn } from "./TickBudget.js";
import { getPaletteBlocks, assignPalette, getDistributionMode, getSmartPattern } from "./Palette.js";
import { getPlacementStatesFromAir } from "../modes/AirBuildMode.js";
import { filterSafeZonePositions, isBuildBlockedForPlayer } from "./Protection.js";
import { lockActionBar } from "../utils/ActionBar.js";
import { expandBeds, isBedType, directionFromStates, directionFromYaw, trimPlacement, placementItemCount, keepBedHalvesTogether, dropIncompleteBeds, trimPlacementByType } from "./beds.js";
export const UNPLACEABLE = new Set([
    "minecraft:undyed_shulker_box",
]);

export const ALWAYS_REPLACEABLE = new Set([
    "minecraft:air",
"minecraft:water", "minecraft:flowing_water",
    "minecraft:lava", "minecraft:flowing_lava",
    "minecraft:fern", "minecraft:large_fern",
    "minecraft:short_grass", "minecraft:tall_grass",
    "minecraft:short_dry_grass", "minecraft:tall_dry_grass",
    "minecraft:bush",
    "minecraft:nether_sprouts",
    "minecraft:seagrass",
    "minecraft:kelp",
    "minecraft:dandelion", "minecraft:poppy",
    "minecraft:blue_orchid", "minecraft:allium",
    "minecraft:azure_bluet", "minecraft:red_tulip",
    "minecraft:orange_tulip", "minecraft:white_tulip",
    "minecraft:pink_tulip", "minecraft:oxeye_daisy",
    "minecraft:cornflower", "minecraft:lily_of_the_valley",
    "minecraft:wither_rose", "minecraft:sunflower",
    "minecraft:lilac", "minecraft:rose_bush",
    "minecraft:peony", "minecraft:pitcher_plant",
    "minecraft:torchflower", "minecraft:open_eyeblossom",
    "minecraft:closed_eyeblossom",
]);
/**
 * Builds a shape. Returns the number of blocks it will write: at once for `options.immediate` (one Air Build block),
 * else a Promise. A big build reads its cells in a `system.runJob` job a slice a tick (BSE-01): each cell is read once
 * for both the filter and the undo snapshot, nothing is charged or written until the reading is done, and a build
 * whose owner left, died or changed dimension meanwhile stops there. Then the writes go out a few a tick within the
 * shared tick budget, at every speed (BSE-19).
 */
export function placeBlocks(player, positions, anchor, typeId, blockStates, options = {}) {
    // The build belongs to the dimension it was confirmed in, even if the job starts after a portal.
    const startDim = player.dimension.id;
    if (options.immediate) {
        const job = placeJob(player, startDim, positions, anchor, typeId, blockStates, options);
        let step = job.next();
        while (!step.done) step = job.next();
        return step.value ?? 0;
    }
    return inTurn(player.id, async () => (await runJobAsync(placeJob(player, startDim, positions, anchor, typeId, blockStates, options))) ?? 0);
}
const BEDROCK_ID = "minecraft:bedrock";
const AIR_ID = "minecraft:air";
function* placeJob(player, startDim, positions, anchor, typeId, blockStates, options) {
    if (UNPLACEABLE.has(typeId)) return 0;
    if (!ownerHere(player, startDim)) return 0;
    if (isBuildBlockedForPlayer(player, true)) return 0;
    const dim           = player.dimension;
    const dimId         = dim.id;
    const yMin          = dimId === "minecraft:nether" || dimId === "minecraft:the_end" ? 0 : -64;
    const yMax          = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
    const creative      = isCreative(player);
    const survival      = !creative;
    const replaceBlocks = creative && getReplaceBlocks(player);
    const waveTicks     = options.immediate ? 1 : getBuildSpeed(player);
    // One read per cell for the filter and the undo snapshot (_bt/_bs: what the cell held; air has no states).
    let toPlace = [];
    for (const p of filterSafeZonePositions(player, dimId, positions, true)) {
        if (sliceDue()) {
            yield;
            if (!ownerHere(player, dimId)) return 0;
        }
        if (p.y < yMin || p.y > yMax) continue;
        let block, existing;
        try {
            block = dim.getBlock(p);
            existing = block?.typeId;
        } catch { toPlace.push(p); continue; }
        if (existing === undefined) { toPlace.push(p); continue; }
        if (!creative && existing === BEDROCK_ID) continue;
        if (!replaceBlocks && !ALWAYS_REPLACEABLE.has(existing)) continue;
        if (existing === typeId) continue;
        let states = {};
        if (existing !== AIR_ID) { try { states = block.permutation.getAllStates(); } catch { } }
        p._bt = pack(existing);
        p._bs = states;
        toPlace.push(p);
    }
    if (!toPlace.length) return 0;
    if (toPlace.some(p => p._bedGroup != null)) toPlace = dropIncompleteBeds(toPlace);
    const cap = getMaxBlocks(player);
    const bedBuild = isBedType(typeId);
    if (!bedBuild && toPlace.length > cap) toPlace = toPlace.slice(0, cap);
    const canPlaceBed = (p, tid) => {
        const want = tid || typeId;
        if (p.y < yMin || p.y > yMax) return false;
        if (!filterSafeZonePositions(player, dim.id, [p], true).length) return false;
        try {
            const block = dim.getBlock(p);
            if (block === null || block === undefined) return true;
            const existing = block.typeId;
            if (!creative && existing === "minecraft:bedrock") return false;
            if (!replaceBlocks && !ALWAYS_REPLACEABLE.has(existing)) return false;
            return existing !== want;
        } catch { return true; }
    };
    const palette      = getPaletteBlocks(player);
    const distribution = getDistributionMode(player);
    const typeByKey    = new Map();
    let assignments    = palette ? assignPalette(palette, toPlace, distribution) : null;
    if (assignments) {
        assignments = assignments.filter(a => !UNPLACEABLE.has(a.typeId));
        toPlace     = assignments.map(a => a.pos);
        for (const a of assignments) typeByKey.set(`${a.pos.x},${a.pos.y},${a.pos.z}`, a.typeId);
    }
    const alreadyExpanded = toPlace.some(p => p._bedGroup != null);
    if (alreadyExpanded) {
        toPlace = trimPlacement(dropIncompleteBeds(toPlace), cap).positions;
        if (assignments) assignments = toPlace.map(p => ({ pos: p, typeId: p.typeId ?? typeByKey.get(`${p.x},${p.y},${p.z}`) ?? typeId }));
    } else if (bedBuild || (assignments && assignments.some(a => isBedType(a.typeId)))) {
        let yaw = 0;
        try { yaw = player.getRotation().y; } catch { yaw = 0; }
        const entries = (assignments ?? toPlace.map(p => ({ pos: p, typeId }))).map(({ pos, typeId: tid }) => {
            const raw = pos.states ?? blockStates ?? {};
            const flipped = modifiedStates(raw, pos);
            return {
                x: pos.x, y: pos.y, z: pos.z, typeId: tid,
                states: flipped,
                direction: directionFromStates(flipped) ?? directionFromYaw(yaw),
                _alreadyHalf: flipped.head_piece_bit === true,
                _mx: pos._mx, _my: pos._my, _mz: pos._mz, _rot: pos._rot, _alt: pos._alt,
            };
        });
        const expanded = expandBeds(entries, canPlaceBed);
        const trimmed = trimPlacement(expanded.positions, cap);
        toPlace = trimmed.positions;
        if (assignments) assignments = toPlace.map(p => ({ pos: p, typeId: p.typeId ?? typeByKey.get(`${p.x},${p.y},${p.z}`) ?? typeId }));
    }
    let basePerm;
    try {
        basePerm = BlockPermutation.resolve(typeId, blockStates ?? {});
    } catch {
        try { basePerm = BlockPermutation.resolve(typeId); } catch { return 0; }
    }
    if (!creative) {
        if (assignments) {
            const needed = new Map();
            for (const a of assignments) {
                if (a.pos?._bedHead) continue;
                needed.set(a.typeId, (needed.get(a.typeId) ?? 0) + 1);
            }
            let totalAvailable = 0;
            for (const [t, count] of needed) {
                totalAvailable += Math.min(countBlocks(player, t), count);
            }
            if (totalAvailable <= 0) {
                player.sendMessage(t("eb.place.no_palette_blocks"));
                return 0;
            }
            const have = new Map();
            for (const t of needed.keys()) have.set(t, countBlocks(player, t));
            const typeMap = new Map(assignments.map(a => [a.pos, a.typeId]));
            const trimmed = trimPlacementByType(toPlace, e => typeMap.get(e) ?? e.typeId ?? typeId, have);
            if (trimmed.positions.length < toPlace.length) {
                player.sendMessage(t("eb.place.limited_palette_blocks", placementItemCount(trimmed.positions)));
                toPlace = trimmed.positions;
                assignments = toPlace.map(p => ({ pos: p, typeId: typeMap.get(p) ?? p.typeId ?? typeId }));
            }
            if (toPlace.length === 0) return 0;
            for (const [t, count] of trimmed.charged) {
                removeBlocks(player, t, count);
            }
        } else {
            const available = countBlocks(player, typeId);
            const need = placementItemCount(toPlace);
            if (available <= 0) {
                player.sendMessage(t("eb.place.no_blocks"));
                return 0;
            }
            if (available < need) {
                player.sendMessage(t("eb.place.limited_blocks", available));
                toPlace = trimPlacement(toPlace, undefined, available).positions;
            }
            removeBlocks(player, typeId, placementItemCount(toPlace));
        }
    }
    const total = toPlace.length;
    if (total === 0) return 0;
    try { player.playSound("block.end_portal_frame.fill", { pitch: 0.6 }); } catch { }
    const perPosTypeIds  = assignments ? assignments.map(a => a.typeId) : null;
    const undoThreshold  = getUndoThreshold(player);
    const snapshot = yield* snapshotJob(dim, toPlace, typeId, blockStates ?? {}, perPosTypeIds, undoThreshold);
    if (snapshot) snapshot.survival = survival;
    if (!snapshot) {
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(t("eb.place.undo_disabled"));
    }
    // Recorded now, before any write, with its write id (trackWrites, also kept in a saved entry): an undo while the
    // writes run stops the rest of them first.
    const ctl = { stopped: false, onStop: null };
    const untrack = trackWrites(snapshot, () => {
        ctl.stopped = true;
        if (ctl.onStop) ctl.onStop();
    });
    recordSnapshot(player, snapshot);
    const permMap    = new Map();
    const posTypeMap = new Map();
    if (assignments) {
        for (const { pos, typeId: t } of assignments) {
            const key = `${pos.x},${pos.y},${pos.z}`;
            posTypeMap.set(key, t);
            if (!permMap.has(key)) {
                try {
                    const states = getPlacementStatesFromAir(t, player);
                    permMap.set(key, BlockPermutation.resolve(t, states));
                } catch { permMap.set(key, basePerm); }
            }
        }
    }
    const smartPattern = getSmartPattern(player);

    let tileMinX=0,tileMaxX=0,tileMinY=0,tileMaxY=0,tileMinZ=0,tileMaxZ=0;
    let tile2D = "floor";
    if (smartPattern && toPlace.length > 0) {
        tileMinX=tileMaxX=toPlace[0].x;
        tileMinY=tileMaxY=toPlace[0].y;
        tileMinZ=tileMaxZ=toPlace[0].z;
        for (const p of toPlace) {
            if (p.x<tileMinX) tileMinX=p.x; if (p.x>tileMaxX) tileMaxX=p.x;
            if (p.y<tileMinY) tileMinY=p.y; if (p.y>tileMaxY) tileMaxY=p.y;
            if (p.z<tileMinZ) tileMinZ=p.z; if (p.z>tileMaxZ) tileMaxZ=p.z;
        }
        const sX = tileMaxX-tileMinX, sY = tileMaxY-tileMinY, sZ = tileMaxZ-tileMinZ;

        if      (sY === 0) tile2D = "floor";
        else if (sZ === 0) tile2D = "ns";
        else if (sX === 0) tile2D = "ew";
        else               tile2D = null;
    }
    const playerId = player.id;
    function placeOne(pos) {
        let perm = assignments
            ? (permMap.get(`${pos.x},${pos.y},${pos.z}`) ?? basePerm)
            : basePerm;

        if (pos._resolvedStates) {
            try {
                const base = assignments
                    ? (posTypeMap.get(`${pos.x},${pos.y},${pos.z}`) ?? pos.typeId ?? typeId)
                    : (pos.typeId ?? typeId);
                try {
                    perm = BlockPermutation.resolve(base, pos._resolvedStates);
                } catch {
                    const known = { ...pos._resolvedStates };
                    delete known.color;
                    perm = BlockPermutation.resolve(base, known);
                }
            } catch {  }
        } else if (hasStateMods(pos)) {
            try {
                const base = assignments
                    ? (posTypeMap.get(`${pos.x},${pos.y},${pos.z}`) ?? typeId)
                    : typeId;
                const flippedStates = modifiedStates(blockStates ?? {}, pos);
                perm = BlockPermutation.resolve(base, flippedStates);
            } catch {  }
        }

        if (smartPattern) {
            const posKey      = `${pos.x},${pos.y},${pos.z}`;
            const blockTypeId = assignments ? (posTypeMap.get(posKey) ?? typeId) : typeId;
            if (blockTypeId.includes("glazed_terracotta")) {
                let fu, fv, face;
                if (tile2D !== null) {

                    face = tile2D;
                } else {

                    const dT  = tileMaxY - pos.y, dBo = pos.y - tileMinY;
                    const dN  = pos.z  - tileMinZ, dS  = tileMaxZ - pos.z;
                    const dE  = tileMaxX - pos.x,  dW  = pos.x - tileMinX;
                    const minD = Math.min(dT, dBo, dN, dS, dE, dW);
                    if      (dT === minD || dBo === minD) face = "floor";
                    else if (dN === minD || dS  === minD) face = "ns";
                    else                                   face = "ew";
                }
                if (face === "floor") {
                    fu = ((Math.floor(pos.x) % 2) + 2) % 2;
                    fv = ((Math.floor(pos.z) % 2) + 2) % 2;
                } else if (face === "ns") {
                    fu = ((Math.floor(pos.x) % 2) + 2) % 2;
                    fv = ((Math.floor(pos.y) % 2) + 2) % 2;
                } else {
                    fu = ((Math.floor(pos.z) % 2) + 2) % 2;
                    fv = ((Math.floor(pos.y) % 2) + 2) % 2;
                }

                const PINWHEEL_FLOOR = [["south", "east"], ["west", "north"]];
                const PINWHEEL_NS    = [["east",  "south"], ["west", "north"]];
                const PINWHEEL_EW    = [["south", "east"],  ["north", "west"]];
                const table   = face === "ns" ? PINWHEEL_NS : face === "ew" ? PINWHEEL_EW : PINWHEEL_FLOOR;
                const dir       = table[fu][fv];
                const facingInt = { north:2, south:3, west:4, east:5, down:0, up:1 }[dir];
                const dirInt    = { south:0, west:1, north:2, east:3 }[dir] ?? 0;

                for (const states of [
                    { "facing_direction":             facingInt },
                    { "minecraft:facing_direction":   facingInt },
                    { "minecraft:cardinal_direction": dir       },
                    { "direction":                    dirInt    },
                ]) {
                    try { perm = BlockPermutation.resolve(blockTypeId, states); break; } catch {}
                }
            }
        }
        // What a survival player paid for this block: given back if the queue finally gives the write up (BSE-12).
        const refund = survival && !pos._bedHead
            ? (assignments ? (posTypeMap.get(`${pos.x},${pos.y},${pos.z}`) ?? typeId) : (pos.typeId ?? typeId))
            : undefined;
        try {
            const block = dim.getBlock(pos);
            if (block) {
                block.setPermutation(perm);
            } else {
                enqueue(playerId, dim.id, pos, perm, refund);
            }
        } catch (e) {
            const msg = String(e);
            // An unloaded chunk waits in the queue like a missing block (it used to be lost after the charge).
            if (e?.name === "LocationInUnloadedChunkError" || /unloaded chunk/i.test(msg)) {
                enqueue(playerId, dim.id, pos, perm, refund);
            } else if (!msg.includes("LocationOutOfWorldBoundaries")) {
                console.warn(`[EB] place failed @ ${pos.x},${pos.y},${pos.z} - ${e}`);
            }
        }
    }
    const refundFrom = (list, from) => {
        if (!survival || from >= list.length || !player.isValid) return;
        const refund = new Map();
        for (let r = from; r < list.length; r++) {
            const p = list[r];
            if (p._bedHead) continue;
            const tid = assignments ? (posTypeMap.get(`${p.x},${p.y},${p.z}`) ?? typeId) : typeId;
            refund.set(tid, (refund.get(tid) ?? 0) + 1);
        }
        for (const [tid, cnt] of refund) giveBlocks(player, tid, cnt);
    };
    function scheduleOrdered(ordered, perTick) {
        let idx = 0;
        const runId = system.runInterval(() => {
            try {
                // At most perTick a tick (64 at most at the wave speeds, 256 at Instant), within the shared budget.
                const end = Math.min(idx + perTick, ordered.length);
                let n = 0;
                while (idx < end) {
                    if ((++n & 15) === 0 && overBudget()) break;
                    placeOne(ordered[idx++]);
                }
                // Never split a bed between ticks.
                const edge = ordered[idx - 1];
                const next = ordered[idx];
                if (edge && next && edge._bedGroup != null && edge._bedGroup === next._bedGroup) placeOne(ordered[idx++]);
                if (idx >= ordered.length) {
                    system.clearRun(runId);
                    untrack();
                }
            } catch {
                system.clearRun(runId);
                untrack();
                refundFrom(ordered, idx);
            }
        }, 1);
        // An undo of this build while it is written: stop and hand back what was not written.
        ctl.onStop = () => {
            system.clearRun(runId);
            refundFrom(ordered, idx);
        };
    }
    if (options.immediate) {
        untrack();
        for (let i = 0; i < total; i++) placeOne(toPlace[i]);
    } else {
        let ordered;
        if (waveTicks <= 1) {
            ordered = keepBedHalvesTogether(toPlace);
        } else {
            // Shells by distance from the anchor, each shuffled: plain script work, sliced too.
            const ax = anchor.x + 0.5, ay = anchor.y, az = anchor.z + 0.5;
            const shellMap = new Map();
            for (const pos of toPlace) {
                if (sliceDue()) yield;
                const shell = Math.floor(Math.sqrt(
                    (pos.x - ax) ** 2 + (pos.y - ay) ** 2 + (pos.z - az) ** 2
                ));
                if (!shellMap.has(shell)) shellMap.set(shell, []);
                shellMap.get(shell).push(pos);
            }
            for (const shell of shellMap.values()) {
                for (let i = shell.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shell[i], shell[j]] = [shell[j], shell[i]];
                }
                if (sliceDue()) yield;
            }
            const shellList = [...shellMap.keys()].sort((a, b) => a - b).map(k => shellMap.get(k));
            yield;
            ordered = keepBedHalvesTogether(shellList.flat());
        }
        if (ctl.stopped) {
            // Undone before a block was written: everything goes back.
            refundFrom(ordered, 0);
        } else {
            scheduleOrdered(ordered, waveTicks <= 1 ? 256 : Math.min(64, Math.max(1, Math.ceil(ordered.length / waveTicks))));
        }
    }
    if (!options.immediate) yield;
    reportPlaced(dim.id, toPlace, (p) => (assignments ? (posTypeMap.get(`${p.x},${p.y},${p.z}`) ?? p.typeId ?? typeId) : (p.typeId ?? typeId)));
    return total;
}
