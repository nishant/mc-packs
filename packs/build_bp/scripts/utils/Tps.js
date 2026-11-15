// @ts-nocheck
// The server's ticks a second, from the game tick and the clock: sampled by whoever shows it (the preview, while
// someone builds), so nothing has to count every tick while nobody does (BSE-31).
import { system } from "@minecraft/server";

const WINDOW_TICKS = 20;
const MAX_TPS      = 20;

let windowTick;
let windowStart = 0;
let current     = MAX_TPS;

/** Updates the figure once at least a second of ticks has passed since the last update. */
export function sampleTps() {
    const tick = system.currentTick;
    const now  = Date.now();
    if (windowTick === undefined) { windowTick = tick; windowStart = now; return; }
    const ticks = tick - windowTick;
    if (ticks < WINDOW_TICKS) return;
    const elapsed = now - windowStart;
    if (elapsed > 0) current = Math.max(0, Math.min(MAX_TPS, (ticks * 1000) / elapsed));
    windowTick  = tick;
    windowStart = now;
}

export function tpsColour(tps = current) {
    if (tps >= 19) return "§a";
    if (tps >= 15) return "§e";
    if (tps >= 10) return "§6";
    return "§c";
}

export function tpsText(tps = current) {
    return `${tpsColour(tps)}${tps.toFixed(2)}`;
}
