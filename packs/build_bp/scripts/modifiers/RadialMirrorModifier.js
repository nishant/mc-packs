// @ts-nocheck
export function applyRadial(positions, cfg, cap = Infinity) {
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
        if (result.length > cap) break;
        const dx = p.x - cx, dz = p.z - cz;
        if (dx * dx + dz * dz > r2) { add(p); continue; }

        for (let k = 0; k < slices; k++) {
            const angle = k * TWO_PI / slices;
            const cos = Math.cos(angle), sin = Math.sin(angle);

            const flipped = !!(alternate && k % 2 === 1);
            const quad = ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
            const bx = flipped ? -dx : dx;
            const rx = cx + Math.round(bx * cos - dz * sin);
            const rz = cz + Math.round(bx * sin + dz * cos);
            const q = ((p._rot ?? 0) + quad) % 4;
            const q2 = { ...p, x: rx, z: rz };
            if (q) q2._rot = q; else delete q2._rot;
            if (flipped || p._alt) q2._alt = true; else delete q2._alt;
            add(q2);
        }
    }
    return result;
}
