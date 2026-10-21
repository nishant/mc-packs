// Preview and the modifier arms draw only while somebody holds a building tool (build-tool.js).
// The first look seeds the holders. After that only players marked dirty are looked at again: a hand change
// (hotbar or inventory event), a mode, anchor or modifier change, a spawn. A leave forgets them. Nobody is polled.
// begin() runs once per tick however many loops ask (F48): the released players stay readable for that whole tick.

/**
 * @typedef {{ id: string }} GatePlayer
 */

export function createToolGate() {
    /** @type {Map<string, GatePlayer>} */
    const holders = new Map();
    /** @type {Set<string>} */
    const dirty = new Set();
    /** @type {Set<string>} */
    const known = new Set();
    let seeded = false;
    let skipped = 0;
    let ran = 0;
    /** @type {GatePlayer[]} */
    let released = [];
    /** @type {number | undefined} */
    let lastTick;
    let lastOpen = false;
    /** @type {GatePlayer[] | null} */
    let holderList = null;
    /**
     * @param {(player: GatePlayer) => boolean} holds
     * @param {GatePlayer} player
     */
    const holding = (holds, player) => {
        try { return !!holds(player); } catch { return false; }
    };
    /**
     * @param {(player: GatePlayer) => boolean} holds
     * @param {GatePlayer} player
     */
    const look = (holds, player) => {
        known.add(player.id);
        if (holding(holds, player)) {
            if (holders.get(player.id) !== player) holderList = null;
            holders.set(player.id, player);
        } else {
            if (holders.delete(player.id)) holderList = null;
            released.push(player);
        }
    };
    const drop = (/** @type {string} */ id) => {
        known.delete(id);
        dirty.delete(id);
        if (holders.delete(id)) holderList = null;
    };
    return {
        /** @param {string} id */
        mark(id) {
            dirty.add(id);
        },
        /** @param {string} id */
        forget(id) {
            drop(id);
        },
        /**
         * Once per tick (pass the tick; without it every call looks again).
         * @param {GatePlayer[]} players every online player
         * @param {(player: GatePlayer) => boolean} holds
         * @param {number} [tick]
         */
        begin(players, holds, tick) {
            if (tick !== undefined && tick === lastTick) return lastOpen;
            lastTick = tick;
            released = [];
            if (!seeded) {
                seeded = true;
                holders.clear();
                known.clear();
                holderList = null;
                for (const player of players) look(holds, player);
                dirty.clear();
            } else {
                // Someone who came without a spawn event (a reload) is looked at once; a leave is forgotten.
                for (const player of players) if (!known.has(player.id)) look(holds, player);
                if (known.size > players.length) {
                    const present = new Set(players.map((player) => player.id));
                    for (const id of [...known]) if (!present.has(id)) drop(id);
                }
                if (dirty.size) {
                    const pending = [...dirty];
                    dirty.clear();
                    const byId = new Map(players.map((player) => [player.id, player]));
                    for (const id of pending) {
                        const player = byId.get(id);
                        if (!player) { drop(id); continue; }
                        look(holds, player);
                    }
                }
            }
            lastOpen = holders.size > 0;
            if (lastOpen) ran++;
            else skipped++;
            return lastOpen;
        },
        stats() {
            return { holders: holders.size, seeded, skipped, ran, dirty: dirty.size };
        },
        /** Players looked at in this tick's begin() who hold no tool. */
        released() {
            return released;
        },
        /** @param {string} id */
        holds(id) {
            return holders.has(id);
        },
        /** The holders, as one list shared until the set changes. */
        holderPlayers() {
            if (!holderList) holderList = [...holders.values()];
            return holderList;
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
 * Shared holder bookkeeping, once per tick.
 * @param {{id: string}[]} players
 * @param {(player: {id: string}) => boolean} holds
 * @param {number} [tick]
 */
export function beginVisualizationTick(players, holds, tick) {
    return gate.begin(players, holds, tick);
}

export function visualizationStats() {
    return gate.stats();
}

/** True after the gate has closed and nobody has equipped, left, or changed mode. */
export function visualizationIdle() {
    return gate.idle();
}

/** Players looked at this tick who do not hold a tool (kept for the whole tick, whichever loop began it). */
export function visualizationReleased() {
    return gate.released();
}

/** The players holding a tool: the draw loops walk only these. */
export function visualizationHolders() {
    return gate.holderPlayers();
}

/**
 * True when this player is in the holder set. Draw loops skip everyone else without an inventory read.
 * @param {string} id
 */
export function isVisualizationHolder(id) {
    return gate.holds(id);
}
