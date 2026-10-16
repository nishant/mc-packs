// @ts-nocheck
const WINDOW_TICKS = 20;
const MAX_TPS      = 20;

let ticks       = 0;
let windowStart = Date.now();
let current     = MAX_TPS;

export function recordTick() {
    if (++ticks < WINDOW_TICKS) return;
    const now     = Date.now();
    const elapsed = now - windowStart;

    if (elapsed > 0) {
        current = Math.max(0, Math.min(MAX_TPS, (ticks * 1000) / elapsed));
    }
    ticks       = 0;
    windowStart = now;
}

export function getTps() { return current; }

export function tpsColour(tps = current) {
    if (tps >= 19) return "§a";
    if (tps >= 15) return "§e";
    if (tps >= 10) return "§6";
    return "§c";
}

export function tpsText(tps = current) {
    return `${tpsColour(tps)}${tps.toFixed(2)}`;
}
