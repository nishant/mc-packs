// @ts-nocheck
export function applyRadial(positions, cfg) {
    const { x: cx, z: cz, slices, radius, alternate } = cfg;
    if (slices <= 1) return positions;
    const r2 = radius * radius;
    const result = [];
    const seen = new Set();

    function add(p) {
        const k = `${p.x},${p.y},${p.z}`;
        if (seen.has(k)) return;
        seen.add(k);
        result.push(p);
    }

    const TWO_PI = Math.PI * 2;
    for (const p of positions) {
        const dx = p.x - cx, dz = p.z - cz;
        if (dx * dx + dz * dz > r2) { add(p); continue; }

        for (let k = 0; k < slices; k++) {
            const angle = k * TWO_PI / slices;
            const cos = Math.cos(angle), sin = Math.sin(angle);

            if (alternate && k % 2 === 1) {

                const rx = cx + Math.round(-dx * cos - dz * sin);
                const rz = cz + Math.round(-dx * sin + dz * cos);
                add({ x: rx, y: p.y, z: rz });
            } else {

                const rx = cx + Math.round(dx * cos - dz * sin);
                const rz = cz + Math.round(dx * sin + dz * cos);
                add({ x: rx, y: p.y, z: rz });
            }
        }
    }
    return result;
}
