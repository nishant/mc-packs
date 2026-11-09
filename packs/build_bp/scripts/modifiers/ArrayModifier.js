// @ts-nocheck
export function applyArray(positions, cfg, cap = Infinity) {
    const { ox, oy, oz, count } = cfg;
    if (count <= 0) return positions;
    const result = [...positions];
    // Overlapping copies land on cells already taken: those do not count toward the cap.
    const seen = new Set(positions.map((p) => `${p.x},${p.y},${p.z}`));
    for (let c = 1; c <= count && seen.size <= cap; c++) {
        const dx = ox * c, dy = oy * c, dz = oz * c;
        for (const p of positions) {
            const x = p.x + dx, y = p.y + dy, z = p.z + dz;
            const k = `${x},${y},${z}`;
            if (seen.has(k)) continue;
            seen.add(k);
            result.push({ x, y, z });
            if (seen.size > cap) return result;
        }
    }
    return result;
}
