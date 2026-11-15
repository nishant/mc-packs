import { system } from "@minecraft/server";

/**
 * One time budget a tick shared by Easy Building's long work: preview solves, the reading before a build, destroy,
 * copy, cut or paste, and the block writes of the placement queue and the build schedules. The clock starts at the
 * first check of a tick, so whatever runs first gets the time and the rest goes on next tick. Without it a 50,000-block
 * build read every cell in one tick (seconds) and a preview solve up to 8,000 cells (60 to 240 ms).
 */
export const TICK_BUDGET_MS = 4;
let budgetTick = -1;
let budgetStart = 0;

/** Milliseconds of this tick's shared budget used so far. */
export function budgetUsed() {
    const now = system.currentTick;
    if (now !== budgetTick) {
        budgetTick = now;
        budgetStart = Date.now();
    }
    return Date.now() - budgetStart;
}

/** True when this tick's shared budget is spent: stop here and go on next tick (a job yields). */
export function overBudget(ms = TICK_BUDGET_MS) {
    return budgetUsed() >= ms;
}
