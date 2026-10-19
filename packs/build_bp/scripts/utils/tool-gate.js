// Preview and the modifier arms draw only while somebody holds a building tool.
// The first tick seeds the set. Equipping dirties that player so the next tick wakes the loops.
// Leaving removes them. Mirror state is not cleared here.

export function createToolGate() {
    const holders = new Set();
    const dirty = new Set();
    const known = new Set();
    let seeded = false;
    let wake = false;
    let skipped = 0;
    let ran = 0;
    const holding = (holds, player) => {
        try { return !!holds(player); } catch { return false; }
    };
    return {
        mark(id) {
            dirty.add(id);
            wake = true;
        },
        forget(id) {
            holders.delete(id);
            dirty.delete(id);
            known.delete(id);
        },
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

export function markHolderDirty(id) {
    gate.mark(id);
}

export function forgetHolder(id) {
    gate.forget(id);
}

export function beginVisualizationTick(players, holds) {
    return gate.begin(players, holds);
}

export function visualizationStats() {
    return gate.stats();
}
