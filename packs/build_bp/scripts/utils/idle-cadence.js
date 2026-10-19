// Idle work is spread by how many times a loop actually runs, not by the world tick.
// A loop whose period is a multiple of 5 used to see the same phase forever, so some
// player indexes were never serviced. Each loop calls tick() once per invocation.

export const IDLE_EVERY = 5;

export function createIdleClock() {
    let phase = 0;
    return {
        tick() {
            phase = (phase + 1) >>> 0;
            return phase;
        },
        phase() {
            return phase;
        },
    };
}

/** Busy players and a hand that just changed are never skipped. */
export function idleDue(index, phase, busy, handFresh) {
    if (busy || handFresh) return true;
    return (Number(phase) + index) % IDLE_EVERY === 0;
}
