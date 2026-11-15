// @ts-nocheck
// The modifier guides: a Mirror's planes, a Radial's slices and an Array's copies, drawn for the builder only.
// A mirror plane is its border and its two center lines as six line particles (BSE-30: it was a particle for every
// block along them, both vertical planes whichever axis was on, up to about 780 a second, to every player near).
// Only the planes whose axis is on are drawn. The loops run only while the tool gate has holders (BSE-31).
import { system } from "@minecraft/server";
import { getState, getMirrorState, getRadialState, getArrayState } from "./PlayerState.js";
import { idleSkip, allPlayers } from "../utils/Items.js";
import { createIdleClock } from "../utils/idle-cadence.js";
import { holdsBuildTool } from "../utils/build-tool.js";
import { beginVisualizationTick, markHolderDirty, onHolderMark, visualizationHolders, visualizationIdle } from "../utils/tool-gate.js";
import { wakeLoop } from "../utils/wake-loop.js";
import { drawSegments, drawRay } from "./EdgeParticles.js";

const OFFSET    = 0.525;
const VIEW_CLIP = 24;
/** The guides are redrawn every second and last a little longer, so they never blink. */
const GUIDE_LIFE_TICKS = 22;

function spawnY(player, x, y, z) {
    try { player.spawnParticle("eb:mod_top", { x: x + 0.5, y: y - OFFSET, z: z + 0.5 }); } catch {}
}

function inView(x, y, z, p) {
    return Math.abs(x - p.x) <= VIEW_CLIP &&
           Math.abs(y - p.y) <= VIEW_CLIP &&
           Math.abs(z - p.z) <= VIEW_CLIP;
}

/**
 * A square of the plane through `fixed` on axis `n` (0 x, 1 y, 2 z), from (a0, b0) to (a1, b1) in the other two axes
 * (in order), with its two center lines through (ac, bc): six segments.
 */
export function planeSegments(n, fixed, a0, a1, b0, b1, ac, bc) {
    const [ia, ib] = n === 0 ? [1, 2] : n === 1 ? [0, 2] : [0, 1];
    const seg = (along, at, other, from, to) => {
        const s = { axis: along, x: 0, y: 0, z: 0, len: to - from };
        const c = [0, 0, 0];
        c[n] = fixed;
        c[along] = (from + to) / 2;
        c[other] = at;
        s.x = c[0]; s.y = c[1]; s.z = c[2];
        return s;
    };
    return [
        seg(ia, b0, ib, a0, a1), seg(ia, b1, ib, a0, a1), seg(ia, bc, ib, a0, a1),
        seg(ib, a0, ia, b0, b1), seg(ib, a1, ia, b0, b1), seg(ib, ac, ia, b0, b1),
    ];
}

/** The planes of a mirror around the player's height: the vertical ones follow the player up and down. */
export function mirrorSegments(m, p) {
    const { x: cx, y: cy, z: cz, axisX, axisY, axisZ, radius } = m;
    const r  = Math.min(radius, VIEW_CLIP);
    const py = Math.floor(p.y);
    const out = [];
    // X plane at x = cx (its blocks' west faces), across y and z; Z plane at z = cz; Y plane at y = cy.
    if (axisX) out.push(...planeSegments(0, cx, py - r, py + r + 1, cz - r, cz + r + 1, py + 0.5, cz + 0.5));
    if (axisZ) out.push(...planeSegments(2, cz, cx - r, cx + r + 1, py - r, py + r + 1, cx + 0.5, py + 0.5));
    if (axisY) out.push(...planeSegments(1, cy, cx - r, cx + r + 1, cz - r, cz + r + 1, cx + 0.5, cz + 0.5));
    return out;
}

function drawMirror(player, m) {
    drawSegments(player, mirrorSegments(m, player.location), "guide", GUIDE_LIFE_TICKS);
}

function drawRadial(player, r) {
    const { x: cx, y: cy, z: cz, slices, radius } = r;
    const displayR = Math.min(radius, VIEW_CLIP);
    const TWO_PI   = Math.PI * 2;
    const from     = { x: cx + 0.5, y: cy + 0.1, z: cz + 0.5 };
    for (let k = 0; k < slices; k++) {
        const angle = k * TWO_PI / slices;
        drawRay(player, from, { x: Math.cos(angle), y: 0, z: Math.sin(angle) }, displayR, "guide", GUIDE_LIFE_TICKS);
    }
}

function drawArray(player, a, anchor) {
    if (!anchor) return;
    const { ox, oy, oz, count } = a;
    const p   = player.location;
    for (let c = 1; c <= count; c++) {
        const px = anchor.x + ox * c;
        const py = anchor.y + oy * c;
        const pz = anchor.z + oz * c;
        if (inView(px, py, pz, p)) spawnY(player, px, py, pz);
    }
}

/** player id -> the block height the vertical mirror planes were last drawn at */
const lastY = new Map();

/** A player left, or their mirror went off: its planes are drawn again from scratch next time (BSE-22, BSE-25). */
export function forgetMirrorGuide(playerId) {
    lastY.delete(playerId);
}

export function startModifierVisualizerLoop() {
    // Players with a vertical mirror plane on: their height is followed every tick (the planes move with them).
    const mirrorBusy = new WeakSet();
    const mirrorClock = createIdleClock();
    let anyMirror = false;
    const follow = wakeLoop(1, () => {
        if (visualizationIdle() || !anyMirror) { lastY.clear(); return false; }
        if (!beginVisualizationTick(allPlayers(), holdsBuildTool, system.currentTick)) { lastY.clear(); return false; }
        const phase = mirrorClock.tick();
        const holders = visualizationHolders();
        let busy = false;
        for (let i = 0; i < holders.length; i++) {
            const player = holders[i];
            if (idleSkip(player, i, mirrorBusy, phase)) { if (mirrorBusy.has(player)) busy = true; continue; }
            if (!holdsBuildTool(player)) { markHolderDirty(player.id); mirrorBusy.delete(player); lastY.delete(player.id); continue; }
            try {
                const mirror = getMirrorState(player);
                if (!mirror.enabled || !(mirror.axisX || mirror.axisZ)) { mirrorBusy.delete(player); lastY.delete(player.id); continue; }
                mirrorBusy.add(player);
                busy = true;

                const py = Math.floor(player.location.y);
                if (lastY.get(player.id) === py) continue;
                const first = !lastY.has(player.id);
                lastY.set(player.id, py);
                // The once-a-second pass draws a plane that was just turned on; this one follows a change of height.
                if (!first) drawMirror(player, mirror);
            } catch {}
        }
        return busy;
    }, () => !visualizationIdle() && anyMirror);

    const guides = wakeLoop(20, () => {
        if (visualizationIdle()) { anyMirror = false; return false; }
        if (!beginVisualizationTick(allPlayers(), holdsBuildTool, system.currentTick)) { anyMirror = false; return false; }
        let mirrors = false;
        for (const player of visualizationHolders()) {
            if (!holdsBuildTool(player)) { markHolderDirty(player.id); continue; }
            try {
                const mirror = getMirrorState(player);
                const radial = getRadialState(player);
                const array  = getArrayState(player);

                if (!mirror.enabled) lastY.delete(player.id);
                if (!mirror.enabled && !radial.enabled && !array.enabled) continue;

                const anchor = getState(player).anchor;

                if (mirror.enabled) {
                    drawMirror(player, mirror);
                    lastY.set(player.id, Math.floor(player.location.y));
                    if (mirror.axisX || mirror.axisZ) mirrors = true;
                }
                if (radial.enabled) drawRadial(player, radial);
                if (array.enabled)  drawArray(player, array, anchor);
            } catch {}
        }
        anyMirror = mirrors;
        if (mirrors) follow.wake();
    }, () => !visualizationIdle());
    onHolderMark(guides.wake);
    guides.wake();
}
