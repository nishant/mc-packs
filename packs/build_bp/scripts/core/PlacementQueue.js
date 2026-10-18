// @ts-nocheck
import { world, system } from "@minecraft/server";
import { allPlayers } from "../utils/Items.js";
import { getState } from "./PlayerState.js";
import { t } from "../utils/Text.js";
import { ensureChunkLoaders, releaseChunkLoaders } from "./ChunkLoader.js";
const DEFAULT_SPEED    = 2500;
const GLOBAL_MAX_TICK  = 50000;
const NOTIFY_EVERY     = 20;
const LOADER_UPDATE_EVERY = 20;
const pending      = [];
const playerSpeeds = new Map();
export function setPlayerBuildSpeed(playerId, blocksPerTick) {
    playerSpeeds.set(playerId, Math.max(1, Math.floor(blocksPerTick)));
}
export function removePlayerBuildSpeed(playerId) {
    playerSpeeds.delete(playerId);
    for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].playerId === playerId) pending.splice(i, 1);
    }
    releaseChunkLoaders(playerId);
}
export function enqueue(playerId, dimensionId, pos, permutation) {
    const isFirst = !pending.some(e => e.playerId === playerId);
    pending.push({ playerId, dimensionId, pos, permutation });
    if (isFirst) {
        ensureChunkLoaders(playerId, dimensionId, pending.filter(e => e.playerId === playerId));
    }
}
export function queueSize() { return pending.length; }
export function startPlacementQueue() {

    const hadPending = new Set();

    system.runInterval(() => {
        if (pending.length === 0) {
            for (const playerId of hadPending) releaseChunkLoaders(playerId);
            hadPending.clear();
            return;
        }
        const placedThisTick = new Map();
        let totalPlaced = 0;
        let i = 0;
        while (i < pending.length && totalPlaced < GLOBAL_MAX_TICK) {
            const { playerId, dimensionId, pos, permutation } = pending[i];
            const limit       = playerSpeeds.get(playerId) ?? DEFAULT_SPEED;
            const playerDone  = placedThisTick.get(playerId) ?? 0;
            if (playerDone >= limit) { i++; continue; }
            let remove = false;
            try {
                const block = world.getDimension(dimensionId).getBlock(pos);
                if (block) {
                    block.setPermutation(permutation);
                    placedThisTick.set(playerId, playerDone + 1);
                    totalPlaced++;
                    remove = true;
                }

            } catch {
                remove = true;
            }
            if (remove) pending.splice(i, 1);
            else i++;
        }

        const nowPending = new Set(pending.map(e => e.playerId));
        for (const playerId of hadPending) {
            if (!nowPending.has(playerId)) {
                releaseChunkLoaders(playerId);
                hadPending.delete(playerId);
            }
        }
        for (const playerId of nowPending) hadPending.add(playerId);
    }, 1);

    system.runInterval(() => {
        if (pending.length === 0) return;

        const byPlayer = new Map();
        for (const e of pending) {
            if (!byPlayer.has(e.playerId)) byPlayer.set(e.playerId, []);
            byPlayer.get(e.playerId).push(e);
        }

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
                player.onScreenDisplay.setActionBar(
                    n === 1
                        ? t("eb.queue.waiting_one", cx, cy, cz)
                        : t("eb.queue.waiting", n, cx, cy, cz)
                );
            } catch {  }
        }
    }, LOADER_UPDATE_EVERY);
}
