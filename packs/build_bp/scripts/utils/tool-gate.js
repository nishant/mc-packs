// Preview and the modifier arms draw only while somebody holds a building tool.
// The first tick seeds the set. Equipping dirties that player so the next tick wakes the loops.
// Leaving removes them. Mirror state is not cleared here.

/**
 * @typedef {{ id: string }} GatePlayer
 */

export function createToolGate() {
    /** @type {Set<string>} */
    const holders = new Set();
    /** @type {Set<string>} */
    const dirty = new Set();
    /** @type {Set<string>} */
    const known = new Set();
    let seeded = false;
    let wake = false;
    let skipped = 0;
    let ran = 0;
    /**
     * @param {(player: GatePlayer) => boolean} holds
     * @param {GatePlayer} player
     */
    const holding = (holds, player) => {
        try { return !!holds(player); } catch { return false; }
    };
    return {
        /** @param {string} id */
        mark(id) {
            dirty.add(id);
            wake = true;
        },
        /** @param {string} id */
        forget(id) {
            holders.delete(id);
            dirty.delete(id);
            known.delete(id);
        },
        /**
         * @param {GatePlayer[]} players
         * @param {(player: GatePlayer) => boolean} holds
         */
        begin(players, holds) {
            if (!seeded) {
                seeded = true;
                holders.clear();
                known.clear();
                for (const player of players) {
                    known.add(player.id);
                    if (holding(holds, player)) holders.add(player.id);
                }
                dirty.clear();
                wake = false;
            } else {
                for (const player of players) {
                    if (!known.has(player.id)) dirty.add(player.id);
                }
                if (dirty.size) {
                    for (const player of players) {
                        if (!dirty.has(player.id)) continue;
                        dirty.delete(player.id);
                        known.add(player.id);
                        if (holding(holds, player)) holders.add(player.id);
                        else holders.delete(player.id);
                    }
                    wake = false;
                }
            }
            if (holders.size === 0) {
                skipped++;
                return false;
            }
            ran++;
            return true;
        },
        stats() {
            return { holders: holders.size, seeded, skipped, ran, dirty: dirty.size };
        },
    };
}

const gate = createToolGate();

/** @param {string} id */
export function markHolderDirty(id) {
    gate.mark(id);
}

/** @param {string} id */
export function forgetHolder(id) {
    gate.forget(id);
}

/**
 * Shared holder bookkeeping. Callers must still clear a stale anchor when this is false.
 * @param {{id: string}[]} players
 * @param {(player: {id: string}) => boolean} holds
 */
export function beginVisualizationTick(players, holds) {
    return gate.begin(players, holds);
}

export function visualizationStats() {
    return gate.stats();
}
