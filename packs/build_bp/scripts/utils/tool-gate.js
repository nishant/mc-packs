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
    /** @type {string[]} */
    let released = [];
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
            released = [];
            if (!seeded) {
                seeded = true;
                holders.clear();
                known.clear();
                for (const player of players) {
                    known.add(player.id);
                    if (holding(holds, player)) holders.add(player.id);
                    else released.push(player.id);
                }
                dirty.clear();
                wake = false;
            } else {
                const present = new Set(players.map((player) => player.id));
                for (const id of known) {
                    if (!present.has(id)) {
                        known.delete(id);
                        holders.delete(id);
                        dirty.delete(id);
                    }
                }
                for (const player of players) {
                    if (known.has(player.id)) continue;
                    known.add(player.id);
                    if (holding(holds, player)) holders.add(player.id);
                    else released.push(player.id);
                }
                if (dirty.size) {
                    const pending = [...dirty];
                    dirty.clear();
                    const byId = new Map(players.map((player) => [player.id, player]));
                    for (const id of pending) {
                        const player = byId.get(id);
                        if (!player) {
                            holders.delete(id);
                            known.delete(id);
                            continue;
                        }
                        if (holding(holds, player)) holders.add(id);
                        else {
                            holders.delete(id);
                            released.push(id);
                        }
                    }
                }
                wake = false;
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
        released() {
            return released;
        },
        /** @param {string} id */
        holds(id) {
            return holders.has(id);
        },
        idle() {
            return seeded && holders.size === 0 && dirty.size === 0;
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

/** True after the gate has closed and nobody has equipped, left, or changed mode. */
export function visualizationIdle() {
    return gate.idle();
}

/** Players just checked who do not hold a tool. Callers clear a stale anchor for these ids only. */
export function visualizationReleased() {
    return gate.released();
}

/**
 * True when this player is in the holder set. Draw loops skip everyone else without an inventory read.
 * @param {string} id
 */
export function isVisualizationHolder(id) {
    return gate.holds(id);
}
