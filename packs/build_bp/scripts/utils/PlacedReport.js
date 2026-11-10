import { system } from "@minecraft/server";
import { placedBoxes } from "./placed-boxes.js";

const PER_TICK = 16;

/**
 * Tells the other packs (Town Projects, Skills, Guilds, Daily Quests) that script-placed blocks exist:
 * realm:blocks_placed { dim, box, from }, at most 16 events per tick.
 * @param {string} dimId
 * @param {{x: number, y: number, z: number}[]} positions
 */
export function reportPlaced(dimId, positions) {
    if (!positions || positions.length === 0) return;
    const boxes = placedBoxes(positions);
    /** @param {number[]} box */
    const send = (box) => {
        try {
            system.sendScriptEvent("realm:blocks_placed", JSON.stringify({ dim: dimId, box, from: "build_bp" }));
        } catch (e) {
            console.warn(`build_bp: realm:blocks_placed failed: ${e}`);
        }
    };
    let i = 0;
    for (; i < boxes.length && i < PER_TICK; i++) send(boxes[i]);
    if (i >= boxes.length) return;
    const runId = system.runInterval(() => {
        const end = Math.min(i + PER_TICK, boxes.length);
        for (; i < end; i++) send(boxes[i]);
        if (i >= boxes.length) system.clearRun(runId);
    }, 1);
}
