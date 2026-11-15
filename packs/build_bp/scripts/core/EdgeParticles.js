// Draws outline segments (utils/edges.js) with build_rp's line particles: eb:edge_x, eb:edge_y and eb:edge_z, one
// stretched quad each that turns about its own axis to face the camera. Length, color and lifetime are Molang
// variables; the variable maps are made once per (kind, length, lifetime) and reused, so a draw is one native call a
// segment. Previews and modifier guides are the builder's own: they go to that player only (player.spawnParticle).
import { MolangVariableMap } from "@minecraft/server";

const IDS = ["eb:edge_x", "eb:edge_y", "eb:edge_z"];
/** @type {Record<string, number[]>} kind -> [r, g, b, a] */
const COLORS = {
    place:   [1.0, 1.0, 1.0, 0.95],
    destroy: [1.0, 0.25, 0.2, 1.0],
    guide:   [0.45, 0.85, 1.0, 0.85],
};
/** Most segments one outline keeps (the longest; capSegments). */
export const EDGE_CAP = 250;

/** @type {Map<string, MolangVariableMap>} */
const maps = new Map();
/** @param {string} kind @param {number} len @param {number} life seconds */
function varsFor(kind, len, life) {
    const k = `${kind}|${len}|${life}`;
    let m = maps.get(k);
    if (m) return m;
    if (maps.size > 2048) maps.clear();
    const c = COLORS[kind] ?? COLORS.place;
    m = new MolangVariableMap();
    m.setFloat("variable.len", len);
    m.setFloat("variable.life", life);
    m.setColorRGBA("variable.color", { red: c[0], green: c[1], blue: c[2], alpha: c[3] });
    maps.set(k, m);
    return m;
}

/**
 * One line from `from` along the unit vector `dir` (any direction: a Radial's slice), for `player` only.
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Vector3} from
 * @param {import("@minecraft/server").Vector3} dir
 * @param {number} len
 * @param {string} kind
 * @param {number} lifeTicks
 */
export function drawRay(player, from, dir, len, kind, lifeTicks) {
    const life = Math.max(2, Math.round(lifeTicks)) / 20;
    const k = `ray|${kind}|${len}|${life}|${dir.x.toFixed(3)}|${dir.y.toFixed(3)}|${dir.z.toFixed(3)}`;
    let m = maps.get(k);
    if (!m) {
        if (maps.size > 2048) maps.clear();
        const c = COLORS[kind] ?? COLORS.place;
        m = new MolangVariableMap();
        m.setFloat("variable.len", len);
        m.setFloat("variable.life", life);
        m.setFloat("variable.dx", dir.x);
        m.setFloat("variable.dy", dir.y);
        m.setFloat("variable.dz", dir.z);
        m.setColorRGBA("variable.color", { red: c[0], green: c[1], blue: c[2], alpha: c[3] });
        maps.set(k, m);
    }
    try {
        player.spawnParticle("eb:edge_ray", { x: from.x + dir.x * len / 2, y: from.y + dir.y * len / 2, z: from.z + dir.z * len / 2 }, m);
        return 1;
    } catch { return 0; }
}

/**
 * Draws the segments for `player` only.
 * @param {import("@minecraft/server").Player} player
 * @param {{ axis: number, x: number, y: number, z: number, len: number }[] | undefined} segs
 * @param {string} kind "place", "destroy" or "guide"
 * @param {number} lifeTicks how long each line stays (the redraw period plus a tick, so lines never blink)
 * @returns {number} the particles spawned
 */
export function drawSegments(player, segs, kind, lifeTicks) {
    if (!segs?.length) return 0;
    const life = Math.max(2, Math.round(lifeTicks)) / 20;
    let n = 0;
    for (const s of segs) {
        try {
            player.spawnParticle(IDS[s.axis], { x: s.x, y: s.y, z: s.z }, varsFor(kind, s.len, life));
            n++;
        } catch {
            // an unloaded spot, or the player left: the rest would fail the same way
            if (!player.isValid) break;
        }
    }
    return n;
}
