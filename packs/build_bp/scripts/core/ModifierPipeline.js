// @ts-nocheck
import { getMirrorState, getArrayState, getRadialState } from "./PlayerState.js";
import { applyMirror, getFlippedStates, mirrorCoord } from "../modifiers/MirrorModifier.js";
import { applyArray }  from "../modifiers/ArrayModifier.js";
import { applyRadial } from "../modifiers/RadialMirrorModifier.js";
import { rotateStates } from "../utils/BlockStates.js";

export function applyModifiers(player, positions) {
    if (!positions?.length) return positions;

    const mirror = getMirrorState(player);
    const array  = getArrayState(player);
    const radial = getRadialState(player);

    let result = positions;
    if (mirror.enabled) result = applyMirror(result, mirror);
    if (array.enabled)  result = applyArray(result, array);
    if (radial.enabled) result = applyRadial(result, radial);

    if (result === positions) return positions;

    const seen = new Set();
    return result.filter(p => {
        const k = `${p.x},${p.y},${p.z}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

function mirrorEntries(entries, cfg) {
    const { x: cx, y: cy, z: cz, axisX, axisY, axisZ, radius, odd } = cfg;
    const r2   = radius * radius;
    const out  = [];
    const seen = new Set();

    function add(pos, typeId, permStates) {
        const k = `${pos.x},${pos.y},${pos.z}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ pos, typeId, permStates });
    }

    for (const e of entries) {
        const p = e.pos;
        if ((p.x - cx) ** 2 + (p.z - cz) ** 2 > r2) { add(p, e.typeId, e.permStates); continue; }

        const xs = [p.x]; if (axisX) xs.push(mirrorCoord(p.x, cx, odd));
        const ys = [p.y]; if (axisY) ys.push(mirrorCoord(p.y, cy, odd));
        const zs = [p.z]; if (axisZ) zs.push(mirrorCoord(p.z, cz, odd));

        for (let xi = 0; xi < xs.length; xi++)
        for (let yi = 0; yi < ys.length; yi++)
        for (let zi = 0; zi < zs.length; zi++) {
            const mx = xi > 0, my = yi > 0, mz = zi > 0;
            add(
                { x: xs[xi], y: ys[yi], z: zs[zi] },
                e.typeId,
                (mx || my || mz) ? getFlippedStates(e.permStates, mx, my, mz) : e.permStates,
            );
        }
    }
    return out;
}

function arrayEntries(entries, cfg) {
    const { ox, oy, oz, count } = cfg;
    if (count <= 0) return entries;
    const out = [...entries];
    for (let c = 1; c <= count; c++) {
        const dx = ox * c, dy = oy * c, dz = oz * c;
        for (const e of entries) {
            out.push({
                pos:        { x: e.pos.x + dx, y: e.pos.y + dy, z: e.pos.z + dz },
                typeId:     e.typeId,
                permStates: e.permStates,
            });
        }
    }
    return out;
}

function radialEntries(entries, cfg) {
    const { x: cx, z: cz, slices, radius, alternate } = cfg;
    if (slices <= 1) return entries;
    const r2   = radius * radius;
    const out  = [];
    const seen = new Set();

    function add(pos, typeId, permStates) {
        const k = `${pos.x},${pos.y},${pos.z}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ pos, typeId, permStates });
    }

    const TWO_PI    = Math.PI * 2;
    const HALF_PI   = Math.PI / 2;
    for (const e of entries) {
        const p  = e.pos;
        const dx = p.x - cx, dz = p.z - cz;
        if (dx * dx + dz * dz > r2) { add(p, e.typeId, e.permStates); continue; }

        for (let k = 0; k < slices; k++) {
            const angle = k * TWO_PI / slices;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const flipped = alternate && k % 2 === 1;

            const bx = flipped ? -dx : dx;
            const rx = cx + Math.round(bx * cos - dz * sin);
            const rz = cz + Math.round(bx * sin + dz * cos);

            const quad = ((Math.round(angle / HALF_PI) % 4) + 4) % 4;
            let states = e.permStates;
            if (flipped) states = getFlippedStates(states, true, false, false);
            if (quad)    states = rotateStates(states, quad);

            add({ x: rx, y: p.y, z: rz }, e.typeId, states);
        }
    }
    return out;
}

export function applyModifiersToEntries(player, entries) {
    if (!entries?.length) return entries;

    const mirror = getMirrorState(player);
    const array  = getArrayState(player);
    const radial = getRadialState(player);
    if (!mirror.enabled && !array.enabled && !radial.enabled) return entries;

    let result = entries;
    if (mirror.enabled) result = mirrorEntries(result, mirror);
    if (array.enabled)  result = arrayEntries(result, array);
    if (radial.enabled) result = radialEntries(result, radial);

    const seen = new Set();
    return result.filter(e => {
        const k = `${e.pos.x},${e.pos.y},${e.pos.z}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export function getModifierCacheKey(player) {
    const m = getMirrorState(player);
    const a = getArrayState(player);
    const r = getRadialState(player);
    return `m:${m.enabled?1:0},${m.x},${m.y},${m.z},${m.axisX?1:0}${m.axisY?1:0}${m.axisZ?1:0},${m.radius},${m.odd?1:0}|a:${a.enabled?1:0},${a.ox},${a.oy},${a.oz},${a.count}|r:${r.enabled?1:0},${r.x},${r.y},${r.z},${r.slices},${r.radius},${r.alternate?1:0}`;
}
