// @ts-nocheck
export function applyArray(positions, cfg) {
    const { ox, oy, oz, count } = cfg;
    if (count <= 0) return positions;
    const result = [...positions];
    for (let c = 1; c <= count; c++) {
        const dx = ox * c, dy = oy * c, dz = oz * c;
        for (const p of positions) {
            result.push({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
        }
    }
    return result;
}
