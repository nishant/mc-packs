// The outline of a set of block cells as straight line segments along the block edges (BSE-05, BSE-29). An edge of the
// grid is drawn when the four cells around it make an outer corner: one of them in the set, or two across a diagonal.
// Unit edges on the same line join into one segment, so a box of any size is 12
// segments, where the old outline was one particle (and seven emitters) for every block along its edges.
// Pure script, no game reads: unit-tested in tools/build-edges.test.mjs.

/**
 * @typedef {{ x: number, y: number, z: number }} Cell
 * @typedef {{ axis: 0 | 1 | 2, x: number, y: number, z: number, len: number }} Segment the middle of the segment in
 *   world coordinates (block corners are whole numbers), its axis (0 x, 1 y, 2 z) and its length in blocks
 */

/**
 * The outline of `cells` as segments. A generator: it yields after every `every` cells when `pause()` says the tick's
 * time is spent, and returns the segments. Use creaseSegments() where no yielding is needed.
 * @param {Cell[]} cells
 * @param {() => boolean} [pause]
 * @param {number} [every]
 * @returns {Generator<void, Segment[], void>}
 */
export function* creaseSegmentsGen(cells, pause = () => false, every = 256) {
    if (!cells.length) return [];
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of cells) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    // One whole number per cell, with a free row on every side for the neighbors outside the box.
    const SX = 1, SY = maxX - minX + 3, SZ = SY * (maxY - minY + 3);
    const key = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => (x - minX + 1) * SX + (y - minY + 1) * SY + (z - minZ + 1) * SZ;
    const set = new Set();
    for (const p of cells) set.add(key(p.x, p.y, p.z));
    const has = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => set.has(key(x, y, z));
    /** @type {Map<number, number[]>[]} per axis: line key -> the unit edges on it (their start along the axis) */
    const lines = [new Map(), new Map(), new Map()];
    /** @type {Set<number>[]} per axis: the unit edges already looked at (keyed like a cell, by their start corner) */
    const seen = [new Set(), new Set(), new Set()];
    /** @type {{ u: number, v: number }[][]} per axis: line key -> its corner coordinates */
    const corners = [[], [], []];
    const lineIds = [new Map(), new Map(), new Map()];
    let n = 0;
    for (const p of cells) {
        if ((++n % every) === 0 && pause()) yield;
        const { x, y, z } = p;
        // A cell with all six neighbors in the set can still own an inner corner, but its neighbors own it too.
        if (has(x + 1, y, z) && has(x - 1, y, z) && has(x, y + 1, z) && has(x, y - 1, z) && has(x, y, z + 1) && has(x, y, z - 1)) continue;
        for (let axis = 0; axis < 3; axis++) {
            for (let du = 0; du <= 1; du++) for (let dv = 0; dv <= 1; dv++) {
                // The edge along `axis` at this cell's corner (du, dv) in the other two axes.
                let a, u, v, ex, ey, ez;
                if (axis === 0) { a = x; u = y + du; v = z + dv; ex = x; ey = u; ez = v; }
                else if (axis === 1) { a = y; u = x + du; v = z + dv; ex = u; ey = y; ez = v; }
                else { a = z; u = x + du; v = y + dv; ex = u; ey = v; ez = z; }
                const ek = key(ex, ey, ez);
                if (seen[axis].has(ek)) continue;
                seen[axis].add(ek);
                // The four cells around the edge: (u - 1 | u) x (v - 1 | v).
                const c00 = axis === 0 ? has(a, u - 1, v - 1) : axis === 1 ? has(u - 1, a, v - 1) : has(u - 1, v - 1, a);
                const c10 = axis === 0 ? has(a, u, v - 1)     : axis === 1 ? has(u, a, v - 1)     : has(u, v - 1, a);
                const c01 = axis === 0 ? has(a, u - 1, v)     : axis === 1 ? has(u - 1, a, v)     : has(u - 1, v, a);
                const c11 = axis === 0 ? has(a, u, v)         : axis === 1 ? has(u, a, v)         : has(u, v, a);
                const count = (c00 ? 1 : 0) + (c10 ? 1 : 0) + (c01 ? 1 : 0) + (c11 ? 1 : 0);
                // Outer corners and diagonal touches only: an inner corner (three of four) is left out, so a hollow
                // shape shows its outside edges alone, the same as a solid one, and a rough surface draws half as much.
                const crease = count === 1 || (count === 2 && c00 === c11);
                if (!crease) continue;
                const lk = (u - (axis === 0 ? minY : minX) + 1) * 4096 + (v - (axis === 2 ? minY : minZ) + 1);
                let id = lineIds[axis].get(lk);
                if (id === undefined) {
                    id = corners[axis].length;
                    lineIds[axis].set(lk, id);
                    corners[axis].push({ u, v });
                    lines[axis].set(id, []);
                }
                /** @type {number[]} */ (lines[axis].get(id)).push(a);
            }
        }
    }
    /** @type {Segment[]} */
    const out = [];
    for (let axis = 0; axis < 3; axis++) {
        for (const [id, starts] of lines[axis]) {
            const { u, v } = corners[axis][id];
            starts.sort((p, q) => p - q);
            let s = starts[0], e = s;
            const flush = () => {
                const mid = (s + e + 1) / 2, len = e - s + 1;
                if (axis === 0) out.push({ axis: 0, x: mid, y: u, z: v, len });
                else if (axis === 1) out.push({ axis: 1, x: u, y: mid, z: v, len });
                else out.push({ axis: 2, x: u, y: v, z: mid, len });
            };
            for (let i = 1; i < starts.length; i++) {
                if (starts[i] === e + 1) { e = starts[i]; continue; }
                flush();
                s = e = starts[i];
            }
            flush();
        }
    }
    return out;
}

/** @param {Cell[]} cells @returns {Segment[]} */
export function creaseSegments(cells) {
    const gen = creaseSegmentsGen(cells);
    for (;;) {
        const step = gen.next();
        if (step.done) return step.value;
    }
}

/**
 * The 12 edges of the box of cells from (x1, y1, z1) to (x2, y2, z2), inclusive.
 * @param {number} x1 @param {number} x2 @param {number} y1 @param {number} y2 @param {number} z1 @param {number} z2
 * @returns {Segment[]}
 */
export function boxSegments(x1, x2, y1, y2, z1, z2) {
    const ax = Math.min(x1, x2), bx = Math.max(x1, x2) + 1;
    const ay = Math.min(y1, y2), by = Math.max(y1, y2) + 1;
    const az = Math.min(z1, z2), bz = Math.max(z1, z2) + 1;
    /** @type {Segment[]} */
    const out = [];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
    for (const y of [ay, by]) for (const z of [az, bz]) out.push({ axis: 0, x: mx, y, z, len: bx - ax });
    for (const x of [ax, bx]) for (const z of [az, bz]) out.push({ axis: 1, x, y: my, z, len: by - ay });
    for (const x of [ax, bx]) for (const y of [ay, by]) out.push({ axis: 2, x, y, z: mz, len: bz - az });
    return out;
}

/**
 * At most `cap` segments: the longest are kept (they carry the shape; a rough surface's one-block steps go first).
 * @param {Segment[]} segs @param {number} cap
 */
export function capSegments(segs, cap) {
    if (segs.length <= cap) return segs;
    return [...segs].sort((p, q) => q.len - p.len).slice(0, cap);
}
