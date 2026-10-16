// @ts-nocheck
const FLIP_FD_X = { 4: 5, 5: 4 };
const FLIP_FD_Y = { 0: 1, 1: 0 };
const FLIP_FD_Z = { 2: 3, 3: 2 };

const FLIP_WD_X = { 0: 1, 1: 0 };
const FLIP_WD_Z = { 2: 3, 3: 2 };

const FLIP_DIR_X = { 1: 3, 3: 1 };
const FLIP_DIR_Z = { 0: 2, 2: 0 };

function flipFacingX(v) { return v === "east" ? "west" : v === "west" ? "east" : v; }
function flipFacingY(v) { return v === "up"   ? "down" : v === "down" ? "up"   : v; }
function flipFacingZ(v) { return v === "north"? "south": v === "south"? "north": v; }

function flipCardX(v) { return v === "east" ? "west" : v === "west" ? "east" : v; }
function flipCardZ(v) { return v === "north"? "south": v === "south"? "north": v; }

function applyFlip(states, mx, my, mz) {
    if (!states || (!mx && !my && !mz)) return states;
    const s = { ...states };

    if ("facing_direction" in s) {
        const v = s.facing_direction;
        if (mx && v in FLIP_FD_X) s.facing_direction = FLIP_FD_X[v];
        else if (my && v in FLIP_FD_Y) s.facing_direction = FLIP_FD_Y[v];
        else if (mz && v in FLIP_FD_Z) s.facing_direction = FLIP_FD_Z[v];
    }

    if ("minecraft:facing_direction" in s) {
        const v = s["minecraft:facing_direction"];
        if (mx && v in FLIP_FD_X) s["minecraft:facing_direction"] = FLIP_FD_X[v];
        else if (my && v in FLIP_FD_Y) s["minecraft:facing_direction"] = FLIP_FD_Y[v];
        else if (mz && v in FLIP_FD_Z) s["minecraft:facing_direction"] = FLIP_FD_Z[v];
    }

    if ("facing" in s) {
        if (mx) s.facing = flipFacingX(s.facing);
        if (my) s.facing = flipFacingY(s.facing);
        if (mz) s.facing = flipFacingZ(s.facing);
    }

    if ("minecraft:cardinal_direction" in s) {
        if (mx) s["minecraft:cardinal_direction"] = flipCardX(s["minecraft:cardinal_direction"]);
        if (mz) s["minecraft:cardinal_direction"] = flipCardZ(s["minecraft:cardinal_direction"]);
    }

    if ("weirdo_direction" in s) {
        const v = s.weirdo_direction;
        if (mx && v in FLIP_WD_X) s.weirdo_direction = FLIP_WD_X[v];
        if (mz && v in FLIP_WD_Z) s.weirdo_direction = FLIP_WD_Z[v];
    }

    if ("direction" in s) {
        const v = s.direction;
        if (mx && v in FLIP_DIR_X) s.direction = FLIP_DIR_X[v];
        if (mz && v in FLIP_DIR_Z) s.direction = FLIP_DIR_Z[v];
    }

    if (my && "upside_down_bit" in s) s.upside_down_bit = !s.upside_down_bit;

    if (my && "top_slot_bit" in s) s.top_slot_bit = !s.top_slot_bit;

    if ((mx || mz) && "door_hinge_bit" in s) s.door_hinge_bit = !s.door_hinge_bit;

    return s;
}

export function getFlippedStates(baseStates, flipX, flipY, flipZ) {
    return applyFlip(baseStates, flipX, flipY, flipZ);
}

export function mirrorCoord(v, center, odd) {

    return odd ? (2 * center - v) : (2 * center - v - 1);
}

function distSq2D(px, pz, cx, cz) {
    return (px - cx) ** 2 + (pz - cz) ** 2;
}

export function applyMirror(positions, cfg) {
    const { x: cx, y: cy, z: cz, axisX, axisY, axisZ, radius, odd } = cfg;
    const r2 = radius * radius;
    const result = [];
    const seen = new Set();

    function add(p, mx, my, mz) {
        const k = `${p.x},${p.y},${p.z}`;
        if (seen.has(k)) return;
        seen.add(k);

        result.push(mx || my || mz ? { ...p, _mx: mx, _my: my, _mz: mz } : p);
    }

    for (const p of positions) {

        if (distSq2D(p.x, p.z, cx, cz) > r2) { add(p, false, false, false); continue; }

        const xs = [p.x]; if (axisX) xs.push(mirrorCoord(p.x, cx, odd));
        const ys = [p.y]; if (axisY) ys.push(mirrorCoord(p.y, cy, odd));
        const zs = [p.z]; if (axisZ) zs.push(mirrorCoord(p.z, cz, odd));

        for (let xi = 0; xi < xs.length; xi++)
        for (let yi = 0; yi < ys.length; yi++)
        for (let zi = 0; zi < zs.length; zi++) {
            add(
                { x: xs[xi], y: ys[yi], z: zs[zi] },
                xi > 0,
                yi > 0,
                zi > 0,
            );
        }
    }
    return result;
}
