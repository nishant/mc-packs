// Loops that run only while they have work (BSE-31). Each one starts when its work appears (wake(), from the place
// where its list goes from empty to non-empty) and clears its own interval on the first run that finds nothing to do
// (its body returns false). With nobody building the pack has no every-tick intervals at all: what is left is the
// hand sweep every 10 ticks, which also calls wakeDue() as a backstop, so a loop whose wake was missed starts within
// half a second.
import { system } from "@minecraft/server";

/** @typedef {{ wake: () => void, running: () => boolean, hasWork: () => boolean }} WakeLoop */

/** @type {WakeLoop[]} */
const loops = [];

/**
 * @param {number} period ticks between runs
 * @param {() => boolean | void} body returns false when there is nothing left to do (the interval is then cleared)
 * @param {() => boolean} hasWork whether the loop should be running (the backstop's test; keep it to a few Map sizes)
 * @returns {WakeLoop}
 */
export function wakeLoop(period, body, hasWork) {
    /** @type {number | undefined} */
    let id;
    const run = () => {
        let more = true;
        try { more = body() !== false; } catch { more = true; }
        if (!more && id !== undefined) {
            system.clearRun(id);
            id = undefined;
        }
    };
    const loop = {
        wake() {
            if (id === undefined) id = system.runInterval(run, period);
        },
        running() {
            return id !== undefined;
        },
        hasWork() {
            try { return !!hasWork(); } catch { return false; }
        },
    };
    loops.push(loop);
    return loop;
}

/** Starts every loop that has work but is not running (the slow sweep's backstop for a missed wake). */
export function wakeDue() {
    for (const loop of loops) if (!loop.running() && loop.hasWork()) loop.wake();
}

/** @type {(() => void)[]} */
const sweeps = [];
const SWEEP_EVERY = 300;
let sweepAt = 0;
/**
 * Registers a stray-entity sweep (BSE-20): each runs once soon after the scripts load, then the sweeps take turns on
 * one interval, one every 15 s, so each runs about once a minute and never on the same tick as another.
 * @param {() => void} sweep
 */
export function slowSweep(sweep) {
    sweeps.push(sweep);
    system.runTimeout(() => { try { sweep(); } catch {} }, 20 + sweeps.length);
    if (sweeps.length > 1) return;
    system.runInterval(() => {
        if (!sweeps.length) return;
        const next = sweeps[sweepAt++ % sweeps.length];
        try { next(); } catch {}
    }, SWEEP_EVERY);
}

/** How many of the loops are running now (for tests and /realm:diag-style checks). */
export function runningLoops() {
    let n = 0;
    for (const loop of loops) if (loop.running()) n++;
    return n;
}
