// @ts-nocheck
import { world, system } from "@minecraft/server";

const LIGHT_PREFIX = "minecraft:light_block_";
const AIR          = "minecraft:air";
const DP_LIGHTS    = "eb:lights";
const RETRY_TICKS  = 20;
/** After this many quick tries (a light left in a chunk nobody is near), once a minute. */
const QUICK_TRIES  = 30;
const SLOW_TICKS   = 1200;

function douse(spot) {
    try {
        const block = world.getDimension(spot.dimensionId).getBlock({ x: spot.x, y: spot.y, z: spot.z });
        if (!block) return false;
        if (block.typeId.startsWith(LIGHT_PREFIX)) block.setType(AIR);
        return true;
    } catch { return false; }
}

export function clearOldPanelLights() {
    let left;
    try { left = world.getDynamicProperty(DP_LIGHTS); } catch { return false; }
    if (typeof left !== "string" || !left) return true;
    let spots = [];
    try { spots = JSON.parse(left); } catch {}
    if (!Array.isArray(spots)) spots = [];
    const remaining = spots.filter(spot => !douse(spot));
    // Written only when a light went out (or the list was empty or unreadable): an unchanged list stays (BSE-21).
    if (remaining.length !== spots.length || spots.length === 0) {
        try { world.setDynamicProperty(DP_LIGHTS, remaining.length > 0 ? JSON.stringify(remaining) : undefined); } catch { return false; }
    }
    return remaining.length === 0;
}

/** Tried every second for a while, then once a minute, and never again once the list is empty (BSE-21). */
export function startPanelLightCleanup() {
    let tries = 0;
    const attempt = () => {
        if (clearOldPanelLights()) return;
        tries++;
        system.runTimeout(attempt, tries < QUICK_TRIES ? RETRY_TICKS : SLOW_TICKS);
    };
    system.runTimeout(attempt, RETRY_TICKS);
}
