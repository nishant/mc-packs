// @ts-nocheck
import { world, system } from "@minecraft/server";
import { getState, getMirrorState, getRadialState, getArrayState } from "./PlayerState.js";
import { idleSkip, nextIdlePhase, allPlayers } from "../utils/Items.js";
import { beginVisualizationTick } from "../utils/tool-gate.js";
import { holdsBuildTool } from "../utils/build-tool.js";

const OFFSET   = 0.525;
const VIEW_CLIP = 24;

function spawnX(dim, x, y, z) {
    try { dim.spawnParticle("eb:mod_x",   { x: x - OFFSET, y: y + 0.5,    z: z + 0.5    }); } catch {}
}
function spawnZ(dim, x, y, z) {
    try { dim.spawnParticle("eb:mod_z",   { x: x + 0.5,    y: y + 0.5,    z: z - OFFSET }); } catch {}
}
function spawnY(dim, x, y, z) {
    try { dim.spawnParticle("eb:mod_top", { x: x + 0.5,    y: y - OFFSET, z: z + 0.5    }); } catch {}
}

function inView(x, y, z, p) {
    return Math.abs(x - p.x) <= VIEW_CLIP &&
           Math.abs(y - p.y) <= VIEW_CLIP &&
           Math.abs(z - p.z) <= VIEW_CLIP;
}

function drawOutlineAndCross(dim, p, ca1, ca2, r, spawnFn) {
    const minA1 = ca1 - r, maxA1 = ca1 + r;
    const minA2 = ca2 - r, maxA2 = ca2 + r;

    for (let a1 = minA1; a1 <= maxA1; a1++) {
        if (inView(...spawnFn.coords(a1, minA2), p)) spawnFn(dim, a1, minA2);
        if (inView(...spawnFn.coords(a1, maxA2), p)) spawnFn(dim, a1, maxA2);
    }
    for (let a2 = minA2 + 1; a2 < maxA2; a2++) {
        if (inView(...spawnFn.coords(minA1, a2), p)) spawnFn(dim, minA1, a2);
        if (inView(...spawnFn.coords(maxA1, a2), p)) spawnFn(dim, maxA1, a2);
    }

    for (let a1 = minA1; a1 <= maxA1; a1++)
        if (inView(...spawnFn.coords(a1, ca2), p)) spawnFn(dim, a1, ca2);
    for (let a2 = minA2; a2 <= maxA2; a2++)
        if (inView(...spawnFn.coords(ca1, a2), p)) spawnFn(dim, ca1, a2);
}

function drawMirror(player, m) {
    const { x: cx, y: cy, z: cz, axisX, axisY, axisZ, radius } = m;
    const dim = player.dimension;
    const p   = player.location;
    const r   = Math.min(radius, VIEW_CLIP);

    if (axisX || axisZ) {

        const py = Math.floor(p.y);

        const fnX = (dim, y, z) => spawnX(dim, cx, y, z);
        fnX.coords = (y, z) => [cx, y, z];
        drawOutlineAndCross(dim, p, py, cz, r, fnX);

        const fnZ = (dim, x, y) => spawnZ(dim, x, y, cz);
        fnZ.coords = (x, y) => [x, y, cz];
        drawOutlineAndCross(dim, p, cx, py, r, fnZ);

        for (let y = py - r; y <= py + r; y++) {
            if (inView(cx, y, cz, p)) {
                spawnX(dim, cx, y, cz);
                spawnX(dim, cx, y, cz - 1);
                spawnZ(dim, cx,     y, cz);
                spawnZ(dim, cx - 1, y, cz);
            }
        }
    }

    if (axisY) {

        const fn = (dim, x, z) => spawnY(dim, x, cy, z);
        fn.coords = (x, z) => [x, cy, z];
        drawOutlineAndCross(dim, p, cx, cz, r, fn);
    }
}

function drawRadial(player, r) {
    const { x: cx, y: cy, z: cz, slices, radius } = r;
    const dim      = player.dimension;
    const p        = player.location;
    const displayR = Math.min(radius, VIEW_CLIP);
    const TWO_PI   = Math.PI * 2;

    for (let k = 0; k < slices; k++) {
        const angle = k * TWO_PI / slices;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        for (let d = 1; d <= displayR; d++) {
            const px = Math.round(cx + d * cos);
            const pz = Math.round(cz + d * sin);
            if (inView(px, cy, pz, p)) spawnY(dim, px, cy + 0.1, pz);
        }
    }
}

function drawArray(player, a, anchor) {
    if (!anchor) return;
    const { ox, oy, oz, count } = a;
    const dim = player.dimension;
    const p   = player.location;
    for (let c = 1; c <= count; c++) {
        const px = anchor.x + ox * c;
        const py = anchor.y + oy * c;
        const pz = anchor.z + oz * c;
        if (inView(px, py, pz, p)) spawnY(dim, px, py, pz);
    }
}

const lastY = new Map();

function drawHorizontalArms(player, mirror) {
    const { x: cx, z: cz, radius } = mirror;
    const p   = player.location;
    const py  = Math.floor(p.y);
    const r   = Math.min(radius, VIEW_CLIP);
    const dim = player.dimension;

    for (let z = cz - r; z <= cz + r; z++)
        if (inView(cx, py, z, p)) spawnX(dim, cx, py, z);

    for (let x = cx - r; x <= cx + r; x++)
        if (inView(x, py, cz, p)) spawnZ(dim, x, py, cz);
}

export function startModifierVisualizerLoop() {

    system.runInterval(() => {
        const all = allPlayers();
        if (!beginVisualizationTick(all, holdsBuildTool)) return;
        for (const player of all) {
            try {
                const mirror = getMirrorState(player);
                const radial = getRadialState(player);
                const array  = getArrayState(player);

                if (!mirror.enabled && !radial.enabled && !array.enabled) continue;

                const anchor = getState(player).anchor;

                if (mirror.enabled) drawMirror(player, mirror);
                if (radial.enabled) drawRadial(player, radial);
                if (array.enabled)  drawArray(player, array, anchor);
            } catch {}
        }
    }, 20);

    // Players with a mirror on are followed every tick; the others are looked at every few ticks only.
    const mirrorBusy = new WeakSet();
    system.runInterval(() => {
        const all = allPlayers();
        if (!beginVisualizationTick(all, holdsBuildTool)) return;
        const phase = nextIdlePhase();
        for (let i = 0; i < all.length; i++) {
            const player = all[i];
            if (idleSkip(player, i, mirrorBusy, phase)) continue;
            if (!holdsBuildTool(player)) { mirrorBusy.delete(player); continue; }
            try {
                const mirror = getMirrorState(player);
                if (!mirror.enabled || !(mirror.axisX || mirror.axisZ)) { mirrorBusy.delete(player); continue; }
                mirrorBusy.add(player);

                const py = Math.floor(player.location.y);
                if (lastY.get(player.id) === py) continue;
                lastY.set(player.id, py);

                drawHorizontalArms(player, mirror);
            } catch {}
        }
    }, 1);
}
