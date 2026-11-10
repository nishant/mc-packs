/**
 * Groups block positions into small integer boxes (at most 64 blocks per side) for realm:blocks_placed.
 * @param {{x: number, y: number, z: number}[]} positions
 * @returns {number[][]} boxes as [minX, minY, minZ, maxX, maxY, maxZ]
 */
export function placedBoxes(positions) {
    /** @type {Map<string, number[]>} */
    const groups = new Map();
    for (const p of positions) {
        const x = Math.floor(p.x);
        const y = Math.floor(p.y);
        const z = Math.floor(p.z);
        const key = `${Math.floor(x / 64)},${Math.floor(y / 64)},${Math.floor(z / 64)}`;
        const b = groups.get(key);
        if (!b) {
            groups.set(key, [x, y, z, x, y, z]);
            continue;
        }
        if (x < b[0]) b[0] = x;
        if (y < b[1]) b[1] = y;
        if (z < b[2]) b[2] = z;
        if (x > b[3]) b[3] = x;
        if (y > b[4]) b[4] = y;
        if (z > b[5]) b[5] = z;
    }
    return [...groups.values()];
}
