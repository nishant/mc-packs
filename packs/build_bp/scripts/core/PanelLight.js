// @ts-nocheck
import { world, system } from "@minecraft/server";

const LIGHT_PREFIX = "minecraft:light_block_";
const AIR          = "minecraft:air";
const DP_LIGHTS    = "eb:lights";
const RETRY_TICKS  = 20;

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
    const remaining = spots.filter(spot => !douse(spot));
    try { world.setDynamicProperty(DP_LIGHTS, remaining.length > 0 ? JSON.stringify(remaining) : undefined); } catch { return false; }
    return remaining.length === 0;
}

export function startPanelLightCleanup() {
    let done = false;
    system.runInterval(() => {
        if (!done) done = clearOldPanelLights();
    }, RETRY_TICKS);
}
