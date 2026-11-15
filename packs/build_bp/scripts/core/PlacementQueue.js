// @ts-nocheck
import { world, system } from "@minecraft/server";
import { allPlayers } from "../utils/Items.js";
import { getState } from "./PlayerState.js";
import { t } from "../utils/Text.js";
import { ensureChunkLoaders, releaseChunkLoaders } from "./ChunkLoader.js";
import { lockActionBar } from "../utils/ActionBar.js";
import { giveBlocks } from "../utils/InventoryUtils.js";
import { overBudget } from "./TickBudget.js";
const DEFAULT_SPEED    = 2500;
const GLOBAL_MAX_TICK  = 50000;
const LOADER_UPDATE_EVERY = 20;
const ROUND_SLICE      = 256;
// An entry is tried at most once a tick. A try while a chunk loader covers it counts COVERED_WEIGHT, any other try 1:
// about 10 s of tries under a loader, or a minute without one (the world's ticking areas are all taken, or the entry
// lies past the loader's 96-block box and waits for it to move there), before it is given up and refunded (BSE-12).
const MAX_ATTEMPTS     = 1200;
const COVERED_WEIGHT   = 6;
// Per-player FIFO: items[head..] are waiting. head advances on pop; the array is compacted when head passes half.
// sx/sy/sz sum the waiting entries' positions (the centroid on the action bar without a pass over them), and miss is
// the box of the entries that came back unloaded since the last loader pass (null: none did).
const queues       = new Map();
const playerSpeeds = new Map();
const dims         = new Map();
let totalPending   = 0;
let tickNo         = 0;
let rotate         = 0;
function dimOf(id) {
    let d = dims.get(id);
    if (!d) { d = world.getDimension(id); dims.set(id, d); }
    return d;
}
export function setPlayerBuildSpeed(playerId, blocksPerTick) {
    playerSpeeds.set(playerId, Math.max(1, Math.floor(blocksPerTick)));
}
/**
 * A player left: their speed goes, but their queued writes still finish (a cut whose air was still queued must not
 * leave its blocks in the world while its clipboard is saved), and the loader goes when the queue is empty.
 */
export function removePlayerBuildSpeed(playerId) {
    playerSpeeds.delete(playerId);
    if (!queues.has(playerId)) releaseChunkLoaders(playerId);
}
/**
 * Queues one block write for a cell that could not be written yet (an unloaded chunk) or for a paste. `refund` is the
 * item the player was charged for this block, given back if the write is finally given up. With `expect` (a cut), the
 * cell is written only while it still holds that type.
 */
export function enqueue(playerId, dimensionId, pos, permutation, refund, expect, jid) {
    let q = queues.get(playerId);
    if (!q) {
        q = { items: [], head: 0, sx: 0, sy: 0, sz: 0, miss: null, missDim: dimensionId, loader: null };
        queues.set(playerId, q);
    }
    q.items.push({ dimensionId, pos, permutation, refund, expect, jid, attempts: 0, tried: -1 });
    q.sx += pos.x; q.sy += pos.y; q.sz += pos.z;
    totalPending++;
}
export function queueSize() { return totalPending; }
/** Drops the player's waiting writes of one job (an undo of a cut whose air is still queued). */
export function cancelQueued(playerId, jid) {
    const q = queues.get(playerId);
    if (!q || jid === undefined) return;
    const kept = [];
    for (let i = q.head; i < q.items.length; i++) {
        const e = q.items[i];
        if (!e) continue;
        if (e.jid === jid) {
            totalPending--;
            q.sx -= e.pos.x; q.sy -= e.pos.y; q.sz -= e.pos.z;
        } else kept.push(e);
    }
    if (kept.length) { q.items = kept; q.head = 0; } else queues.delete(playerId);
}
function isUnloaded(e) {
    return e?.name === "LocationInUnloadedChunkError" || /unloaded chunk/i.test(String(e?.message ?? e));
}
function covers(area, entry) {
    const p = entry.pos;
    return !!area && area.dimensionId === entry.dimensionId
        && p.x >= area.minX && p.x <= area.maxX && p.z >= area.minZ && p.z <= area.maxZ;
}
function noteMiss(q, entry) {
    const p = entry.pos;
    const m = q.miss;
    if (!m || q.missDim !== entry.dimensionId) {
        q.miss = { minX: p.x, minY: p.y, minZ: p.z, maxX: p.x, maxY: p.y, maxZ: p.z };
        q.missDim = entry.dimensionId;
        return;
    }
    if (p.x < m.minX) m.minX = p.x; if (p.x > m.maxX) m.maxX = p.x;
    if (p.y < m.minY) m.minY = p.y; if (p.y > m.maxY) m.maxY = p.y;
    if (p.z < m.minZ) m.minZ = p.z; if (p.z > m.maxZ) m.maxZ = p.z;
}
function refundDropped(refunds) {
    for (const [playerId, byType] of refunds) {
        let player;
        try { player = world.getEntity(playerId); } catch { player = undefined; }
        if (!player?.isValid) continue;
        for (const [typeId, count] of byType) {
            try { giveBlocks(player, typeId, count); } catch { }
        }
    }
}
export function startPlacementQueue() {

    const hadPending = new Set();

    system.runInterval(() => {
        if (totalPending === 0) {
            for (const playerId of hadPending) releaseChunkLoaders(playerId);
            hadPending.clear();
            return;
        }
        tickNo++;
        const placedThisTick = new Map();
        const refunds = new Map();
        let totalPlaced = 0;
        let steps = 0;
        let outOfTime = false;
        const ids = [...queues.keys()];
        const n = ids.length;
        const first = rotate++ % Math.max(1, n);
        let progress = true;
        while (progress && !outOfTime && totalPlaced < GLOBAL_MAX_TICK) {
            progress = false;
            for (let k = 0; k < n && !outOfTime && totalPlaced < GLOBAL_MAX_TICK; k++) {
                const playerId = ids[(first + k) % n];
                const q = queues.get(playerId);
                if (!q) continue;
                const limit = playerSpeeds.get(playerId) ?? DEFAULT_SPEED;
                let done = placedThisTick.get(playerId) ?? 0;
                let visits = Math.min(ROUND_SLICE, q.items.length - q.head);
                while (visits-- > 0 && q.head < q.items.length && done < limit && totalPlaced < GLOBAL_MAX_TICK) {
                    // The tick's shared budget, with the jobs and build schedules (at least 31 writes a tick).
                    if ((++steps & 31) === 0 && overBudget()) { outOfTime = true; break; }
                    const entry = q.items[q.head];
                    q.items[q.head++] = undefined;
                    if (entry.tried === tickNo) {
                        // Already retried this tick: move to the back, try again next tick.
                        q.items.push(entry);
                        continue;
                    }
                    let result = "drop";
                    try {
                        const block = dimOf(entry.dimensionId).getBlock(entry.pos);
                        if (block && entry.expect && block.typeId !== entry.expect) {
                            result = "skip";
                        } else if (block) {
                            block.setPermutation(entry.permutation);
                            result = "placed";
                        } else {
                            result = "retry";
                        }
                    } catch (e) {
                        result = isUnloaded(e) ? "retry" : "drop";
                    }
                    progress = true;
                    if (result === "retry") {
                        entry.attempts += covers(q.loader, entry) ? COVERED_WEIGHT : 1;
                        if (entry.attempts < MAX_ATTEMPTS) {
                            entry.tried = tickNo;
                            q.items.push(entry);
                            noteMiss(q, entry);
                            continue;
                        }
                    }
                    totalPending--;
                    q.sx -= entry.pos.x; q.sy -= entry.pos.y; q.sz -= entry.pos.z;
                    if (result === "placed") {
                        done++;
                        totalPlaced++;
                    } else if (result !== "skip" && entry.refund) {
                        // Given up: hand back what the player was charged for this block.
                        let byType = refunds.get(playerId);
                        if (!byType) { byType = new Map(); refunds.set(playerId, byType); }
                        byType.set(entry.refund, (byType.get(entry.refund) ?? 0) + 1);
                    }
                }
                placedThisTick.set(playerId, done);
                if (q.head >= q.items.length) {
                    queues.delete(playerId);
                } else if (q.head > q.items.length / 2) {
                    q.items = q.items.slice(q.head);
                    q.head = 0;
                }
            }
        }
        if (refunds.size) refundDropped(refunds);

        for (const playerId of hadPending) {
            if (!queues.has(playerId)) {
                releaseChunkLoaders(playerId);
                hadPending.delete(playerId);
            }
        }
        for (const playerId of queues.keys()) hadPending.add(playerId);
    }, 1);

    system.runInterval(() => {
        if (totalPending === 0) return;
        // A loader only over the blocks that came back unloaded in the last second: none for a paste into loaded chunks.
        for (const [playerId, q] of queues) {
            if (!q.miss) continue;
            q.loader = ensureChunkLoaders(playerId, q.missDim, q.miss);
            q.miss = null;
        }

        for (const player of allPlayers()) {
            try {
                const q = queues.get(player.id);
                const n = q ? q.items.length - q.head : 0;
                if (n <= 0) continue;
                const state = getState(player);
                if (state.anchor) continue;
                const cx = Math.round(q.sx / n);
                const cy = Math.round(q.sy / n);
                const cz = Math.round(q.sz / n);
                lockActionBar(player.id, 1500);
                player.onScreenDisplay.setActionBar(
                    n === 1
                        ? t("eb.queue.waiting_one", cx, cy, cz)
                        : t("eb.queue.waiting", n, cx, cy, cz)
                );
            } catch {  }
        }
    }, LOADER_UPDATE_EVERY);
}
