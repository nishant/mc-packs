// @ts-nocheck
import { world, system } from "@minecraft/server";
import { allPlayers } from "../utils/Items.js";
import { getState } from "./PlayerState.js";
import { t } from "../utils/Text.js";
import { ensureChunkLoaders, releaseChunkLoaders } from "./ChunkLoader.js";
import { lockActionBar } from "../utils/ActionBar.js";
const DEFAULT_SPEED    = 2500;
const GLOBAL_MAX_TICK  = 50000;
const NOTIFY_EVERY     = 20;
const LOADER_UPDATE_EVERY = 20;
const TIME_BUDGET_MS   = 4;
const ROUND_SLICE      = 256;
const MAX_ATTEMPTS     = 200;
// Per-player FIFO: items[head..] are waiting. head advances on pop; the array is compacted when head passes half.
const queues       = new Map();
const playerSpeeds = new Map();
let totalPending   = 0;
let tickNo         = 0;
let rotate         = 0;
function waiting(q) { return q.head === 0 ? q.items : q.items.slice(q.head); }
export function setPlayerBuildSpeed(playerId, blocksPerTick) {
    playerSpeeds.set(playerId, Math.max(1, Math.floor(blocksPerTick)));
}
export function removePlayerBuildSpeed(playerId) {
    playerSpeeds.delete(playerId);
    const q = queues.get(playerId);
    if (q) {
        totalPending -= q.items.length - q.head;
        queues.delete(playerId);
    }
    releaseChunkLoaders(playerId);
}
export function enqueue(playerId, dimensionId, pos, permutation) {
    let q = queues.get(playerId);
    const isFirst = !q;
    if (!q) { q = { items: [], head: 0 }; queues.set(playerId, q); }
    q.items.push({ playerId, dimensionId, pos, permutation, attempts: 0, tried: -1 });
    totalPending++;
    if (isFirst) ensureChunkLoaders(playerId, dimensionId, waiting(q));
}
export function queueSize() { return totalPending; }
function isUnloaded(e) {
    return e?.name === "LocationInUnloadedChunkError" || /unloaded chunk/i.test(String(e?.message ?? e));
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
        const start = Date.now();
        const placedThisTick = new Map();
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
                    if ((++steps & 31) === 0 && Date.now() - start > TIME_BUDGET_MS) { outOfTime = true; break; }
                    const entry = q.items[q.head];
                    q.items[q.head++] = undefined;
                    if (entry.tried === tickNo) {
                        // Already retried this tick: move to the back, try again next tick.
                        q.items.push(entry);
                        continue;
                    }
                    let result = "drop";
                    try {
                        const block = world.getDimension(entry.dimensionId).getBlock(entry.pos);
                        if (block) {
                            block.setPermutation(entry.permutation);
                            result = "placed";
                        } else {
                            result = "retry";
                        }
                    } catch (e) {
                        result = isUnloaded(e) ? "retry" : "drop";
                    }
                    progress = true;
                    if (result === "placed") {
                        done++;
                        totalPlaced++;
                        totalPending--;
                    } else if (result === "retry" && ++entry.attempts < MAX_ATTEMPTS) {
                        entry.tried = tickNo;
                        q.items.push(entry);
                    } else {
                        // Dropped. The charge happens in BlockPlacer, not here, so there is no refund path to call.
                        totalPending--;
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

        const byPlayer = new Map();
        for (const [id, q] of queues) byPlayer.set(id, waiting(q));

        for (const player of allPlayers()) {
            try {
                const mine = byPlayer.get(player.id);
                if (!mine || mine.length === 0) continue;

                ensureChunkLoaders(player.id, mine[0].dimensionId, mine);

                const state = getState(player);
                if (state.anchor) continue;
                let sx = 0, sy = 0, sz = 0;
                for (const e of mine) { sx += e.pos.x; sy += e.pos.y; sz += e.pos.z; }
                const n  = mine.length;
                const cx = Math.round(sx / n);
                const cy = Math.round(sy / n);
                const cz = Math.round(sz / n);
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
