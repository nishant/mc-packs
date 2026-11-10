import { system } from "@minecraft/server";
import { placedBoxes } from "./placed-boxes.js";
import { isNaturalKind } from "./natural-kinds.js";

const PER_TICK = 16;

/**
 * Tells the other packs (Town Projects, Skills, Guilds, Daily Quests) that script-placed blocks exist:
 * realm:blocks_placed { dim, box, from }, at most 16 events per tick. The boxes of natural-kind blocks and wild plants
 * (what Town Projects keeps cells for) are sent again with natural: true; Town Projects only listens to those.
 * @param {string} dimId
 * @param {{x: number, y: number, z: number}[]} positions
 * @param {(pos: any) => string | undefined} [typeOf] the block type placed at a position
 */
export function reportPlaced(dimId, positions, typeOf) {
    if (!positions || positions.length === 0) return;
    /** @type {string[]} */
    const messages = placedBoxes(positions).map((box) => JSON.stringify({ dim: dimId, box, from: "build_bp" }));
    if (typeOf) {
        const natural = positions.filter((p) => isNaturalKind(typeOf(p)));
        for (const box of placedBoxes(natural)) messages.push(JSON.stringify({ dim: dimId, box, from: "build_bp", natural: true }));
    }
    /** @param {string} message */
    const send = (message) => {
        try {
            system.sendScriptEvent("realm:blocks_placed", message);
        } catch (e) {
            console.warn(`build_bp: realm:blocks_placed failed: ${e}`);
        }
    };
    let i = 0;
    for (; i < messages.length && i < PER_TICK; i++) send(messages[i]);
    if (i >= messages.length) return;
    const runId = system.runInterval(() => {
        const end = Math.min(i + PER_TICK, messages.length);
        for (; i < end; i++) send(messages[i]);
        if (i >= messages.length) system.clearRun(runId);
    }, 1);
}
