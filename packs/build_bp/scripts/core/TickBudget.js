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

let checks = 0;
/** For a loop inside a job: about every 32 calls, true once this tick's budget is spent (the job yields then). */
export function sliceDue() {
    return (++checks & 31) === 0 && overBudget();
}

/**
 * Runs a generator as a `system.runJob` job and resolves with what it returns (undefined when it threw). The job is
 * given a slice of each tick; the generator yields when `sliceDue()` says this tick's budget is spent.
 * @template T
 * @param {Generator<void, T, void>} gen
 * @returns {Promise<T | undefined>}
 */
export function runJobAsync(gen) {
    return new Promise((resolve) => {
        system.runJob((function* () {
            /** @type {T | undefined} */
            let out;
            try { out = yield* gen; } catch (e) { console.warn(`[EB] job failed: ${e}`); }
            resolve(out);
        })());
    });
}

/**
 * A job's owner is still here to finish it: in the world, in the dimension it started in, and alive (C17). Checked
 * after every yield; a job that fails it stops before charging or writing anything.
 * @param {import("@minecraft/server").Player} player
 * @param {string} dimId
 */
export function ownerHere(player, dimId) {
    try {
        if (!player.isValid || player.dimension.id !== dimId) return false;
        const health = /** @type {any} */ (player.getComponent("minecraft:health"));
        return typeof health?.currentValue !== "number" || health.currentValue > 0;
    } catch { return false; }
}

/** player id -> the tail of that player's chain of read jobs: one big read at a time per player. */
const chains = new Map();
/**
 * Runs `work` after the player's earlier read jobs, so two quick confirms never read the same cells before either
 * writes. Resolves with what `work` resolves.
 * @template T
 * @param {string} playerId
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
export function inTurn(playerId, work) {
    const prev = chains.get(playerId) ?? Promise.resolve();
    const next = prev.then(work, work);
    const tail = next.then(() => {}, () => {});
    chains.set(playerId, tail);
    tail.then(() => { if (chains.get(playerId) === tail) chains.delete(playerId); });
    return next;
}
