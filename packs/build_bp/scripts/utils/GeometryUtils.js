// @ts-nocheck
export const MAX_BLOCKS = 50000;
export const FACE_OFFSETS = {
    Up:    { x:  0, y:  1, z:  0 },
    Down:  { x:  0, y: -1, z:  0 },
    North: { x:  0, y:  0, z: -1 },
    South: { x:  0, y:  0, z:  1 },
    East:  { x:  1, y:  0, z:  0 },
    West:  { x: -1, y:  0, z:  0 },
};
export function sign(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }
export function range(a, b) {
    a = Math.round(a);
    b = Math.round(b);
    const arr = [];
    const s = a <= b ? 1 : -1;
    for (let v = a; s > 0 ? v <= b : v >= b; v += s) arr.push(v);
    return arr;
}
export function dedup(positions) {
    if (!positions.length) return positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const W = maxX - minX + 1;
    const strideY = W;
    const strideZ = W * (maxY - minY + 1);
    const seen = new Set();
    return positions.filter(p => {
        const k = (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export function catmullRomSpline(points, clampY = false, cap = MAX_BLOCKS) {
    if (points.length === 0) return [];
    if (points.length === 1) return [{ x: Math.round(points[0].x), y: Math.round(points[0].y), z: Math.round(points[0].z) }];
    if (points.length === 2) return lineBetween(points[0], points[1]);
    const P = [
        { x: 2*points[0].x - points[1].x, y: 2*points[0].y - points[1].y, z: 2*points[0].z - points[1].z },
        ...points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) })),
        { x: 2*points[points.length-1].x - points[points.length-2].x, y: 2*points[points.length-1].y - points[points.length-2].y, z: 2*points[points.length-1].z - points[points.length-2].z },
    ];
    const out = [];
    for (let seg = 0; seg < points.length - 1; seg++) {
        const p0 = P[seg], p1 = P[seg+1], p2 = P[seg+2], p3 = P[seg+3];
        const segLen = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2 + (p2.z-p1.z)**2);
        const steps = Math.max(Math.ceil(segLen * 8), 4);
        const yMin = clampY ? Math.min(p1.y, p2.y) : -Infinity;
        const yMax = clampY ? Math.max(p1.y, p2.y) :  Infinity;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, t2 = t*t, t3 = t2*t;
            const rawY = 0.5*((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3);
            out.push({
                x: Math.round(0.5*((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3)),
                y: Math.round(Math.min(yMax, Math.max(yMin, rawY))),
                z: Math.round(0.5*((2*p1.z) + (-p0.z+p2.z)*t + (2*p0.z-5*p1.z+4*p2.z-p3.z)*t2 + (-p0.z+3*p1.z-3*p2.z+p3.z)*t3)),
            });
            if (out.length >= cap) return dedup(out);
        }
    }
    return dedup(out);
}
export function bezierCurve(p0, p1, p2) {
    const d1 = Math.sqrt((p1.x-p0.x)**2 + (p1.y-p0.y)**2 + (p1.z-p0.z)**2);
    const d2 = Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2 + (p2.z-p1.z)**2);
    const steps = Math.max(Math.ceil((d1 + d2) * 2), 2);
    const positions = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        positions.push({
            x: Math.round(mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x),
            y: Math.round(mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y),
            z: Math.round(mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z),
        });
        if (positions.length >= MAX_BLOCKS) break;
    }
    return dedup(positions);
}
export function lineBetween(p1, p2, cap = MAX_BLOCKS) {
    const dx = Math.round(p2.x) - Math.round(p1.x);
    const dy = Math.round(p2.y) - Math.round(p1.y);
    const dz = Math.round(p2.z) - Math.round(p1.z);
    const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (steps === 0) return [{ x: Math.round(p1.x), y: Math.round(p1.y), z: Math.round(p1.z) }];
    const positions = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        positions.push({
            x: Math.round(p1.x + dx * t),
            y: Math.round(p1.y + dy * t),
            z: Math.round(p1.z + dz * t),
        });
        if (positions.length >= cap) break;
    }
    return dedup(positions);
}
export function isFacingNS(yaw) {
    const a = Math.abs(yaw);
    return a < 45 || a > 135;
}
export function axisLineByYaw(anchor, target, yaw) {
    const positions = [];
    if (isFacingNS(yaw)) {
        for (const x of range(anchor.x, target.x)) {
            positions.push({ x, y: anchor.y, z: anchor.z });
            if (positions.length >= MAX_BLOCKS) break;
        }
    } else {
        for (const z of range(anchor.z, target.z)) {
            positions.push({ x: anchor.x, y: anchor.y, z });
            if (positions.length >= MAX_BLOCKS) break;
        }
    }
    return positions;
}
export function wallAABBByYaw(anchor, target, yaw) {
    const positions = [];
    const y1 = Math.min(anchor.y, target.y);
    const y2 = Math.max(anchor.y, target.y);
    if (isFacingNS(yaw)) {
        for (const x of range(anchor.x, target.x))
            for (let y = y1; y <= y2; y++) {
                positions.push({ x, y, z: anchor.z });
                if (positions.length >= MAX_BLOCKS) return positions;
            }
    } else {
        for (const z of range(anchor.z, target.z))
            for (let y = y1; y <= y2; y++) {
                positions.push({ x: anchor.x, y, z });
                if (positions.length >= MAX_BLOCKS) return positions;
            }
    }
    return positions;
}
export function axisLine(anchor, target, cap = MAX_BLOCKS) {
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const dz = target.z - anchor.z;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const positions = [];
    if (ax >= ay && ax >= az) {
        for (const x of range(anchor.x, target.x)) {
            positions.push({ x, y: anchor.y, z: anchor.z });
            if (positions.length >= cap) break;
        }
    } else if (ay >= ax && ay >= az) {
        for (const y of range(anchor.y, target.y)) {
            positions.push({ x: anchor.x, y, z: anchor.z });
            if (positions.length >= cap) break;
        }
    } else {
        for (const z of range(anchor.z, target.z)) {
            positions.push({ x: anchor.x, y: anchor.y, z });
            if (positions.length >= cap) break;
        }
    }
    return positions;
}
export function fillAABB(p1, p2, cap = MAX_BLOCKS) {
    const positions = [];
    const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
    const z1 = Math.min(p1.z, p2.z), z2 = Math.max(p1.z, p2.z);
    outer:
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
            for (let z = z1; z <= z2; z++) {
                positions.push({ x, y, z });
                if (positions.length >= cap) break outer;
            }
    return positions;
}
export function wallAABB(anchor, target, cap = MAX_BLOCKS) {
    const dx = Math.abs(target.x - anchor.x);
    const dz = Math.abs(target.z - anchor.z);
    const positions = [];
    const y1 = Math.min(anchor.y, target.y);
    const y2 = Math.max(anchor.y, target.y);
    if (dx >= dz) {
        for (const x of range(anchor.x, target.x))
            for (let y = y1; y <= y2; y++) {
                positions.push({ x, y, z: anchor.z });
                if (positions.length >= cap) return positions;
            }
    } else {
        for (const z of range(anchor.z, target.z))
            for (let y = y1; y <= y2; y++) {
                positions.push({ x: anchor.x, y, z });
                if (positions.length >= cap) return positions;
            }
    }
    return positions;
}
export function floorRect(anchor, target, cap = MAX_BLOCKS) {
    const positions = [];
    for (const x of range(anchor.x, target.x))
        for (const z of range(anchor.z, target.z)) {
            positions.push({ x, y: anchor.y, z });
            if (positions.length >= cap) return positions;
        }
    return positions;
}
export function diagonalWall(anchor, target, cap = MAX_BLOCKS) {
    const ys = range(anchor.y, target.y);
    const xzLine = lineBetween(
        { x: anchor.x, y: 0, z: anchor.z },
        { x: target.x, y: 0, z: target.z },
        cap
    );
    const positions = [];
    for (const pt of xzLine)
        for (const y of ys) {
            positions.push({ x: pt.x, y, z: pt.z });
            if (positions.length >= cap) return positions;
        }
    return dedup(positions);
}
export function slopeFloor(anchor, target, yaw = 0, cap = MAX_BLOCKS) {
    const positions = [];
    const xs = range(anchor.x, target.x);
    const zs = range(anchor.z, target.z);
    const xMin = Math.min(anchor.x, target.x), xMax = Math.max(anchor.x, target.x);
    const zMin = Math.min(anchor.z, target.z), zMax = Math.max(anchor.z, target.z);
    const yMin = Math.min(anchor.y, target.y), yMax = Math.max(anchor.y, target.y);
    const lenX = (xMax - xMin) || 1;
    const lenZ = (zMax - zMin) || 1;
    const a = ((yaw % 360) + 360) % 360;
    const getT = (x, z) => {
        if (a < 45 || a >= 315) return (z - zMin) / lenZ;
        if (a < 135)            return (xMax - x) / lenX;
        if (a < 225)            return (zMax - z) / lenZ;
        return                         (x - xMin) / lenX;
    };
    for (const x of xs) {
        for (const z of zs) {
            const y = Math.round(yMin + (yMax - yMin) * getT(x, z));
            positions.push({ x, y, z });
            if (positions.length >= cap) return positions;
        }
    }
    return dedup(positions);
}
export function circleXZ(cx, cy, cz, r, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r);
    const r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dz = -ri; dz <= ri; dz++) {
            if (dx * dx + dz * dz <= r2) {
                positions.push({ x: cx + dx, y: cy, z: cz + dz });
                if (positions.length >= cap) return positions;
            }
        }
    return positions;
}
export function hollowCircleXZ(cx, cy, cz, r, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dz = -ri; dz <= ri; dz++) {
            if (dx * dx + dz * dz > r2) continue;
            if (
                (dx+1)*(dx+1) + dz*dz     > r2 ||
                (dx-1)*(dx-1) + dz*dz     > r2 ||
                dx*dx + (dz+1)*(dz+1)     > r2 ||
                dx*dx + (dz-1)*(dz-1)     > r2
            ) {
                positions.push({ x: cx + dx, y: cy, z: cz + dz });
                if (positions.length >= cap) return positions;
            }
        }
    return positions;
}
export function ellipseXZ(cx, cy, cz, rx, rz, cap = MAX_BLOCKS) {
    rx = Math.max(rx, 0); rz = Math.max(rz, 0);
    if (rx < 0.5 && rz < 0.5) return [{ x: cx, y: cy, z: cz }];
    const rix = Math.ceil(rx), riz = Math.ceil(rz);
    const positions = [];
    for (let dx = -rix; dx <= rix; dx++)
        for (let dz = -riz; dz <= riz; dz++) {
            const nx = rx > 0 ? (dx * dx) / (rx * rx) : (dx !== 0 ? 2 : 0);
            const nz = rz > 0 ? (dz * dz) / (rz * rz) : (dz !== 0 ? 2 : 0);
            if (nx + nz <= 1) {
                positions.push({ x: cx + dx, y: cy, z: cz + dz });
                if (positions.length >= cap) return positions;
            }
        }
    return positions;
}
export function hollowEllipseXZ(cx, cy, cz, rx, rz, cap = MAX_BLOCKS) {
    const filled = ellipseXZ(cx, cy, cz, rx, rz, cap);
    if (filled.length <= 1) return filled;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of filled) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const W = maxX - minX + 2;
    const set = new Set(filled.map(p => (p.x - minX) + (p.z - minZ) * W));
    return filled.filter(p => {
        const k = (p.x - minX) + (p.z - minZ) * W;
        return !set.has(k + 1) || !set.has(k - 1) || !set.has(k + W) || !set.has(k - W);
    });
}
export function ellipseCylinder(anchor, target, cap = MAX_BLOCKS) {
    const rx = Math.abs(target.x - anchor.x);
    const rz = Math.abs(target.z - anchor.z);
    const positions = [];
    for (const y of range(anchor.y, target.y)) {
        for (const p of ellipseXZ(anchor.x, y, anchor.z, rx, rz, cap)) {
            positions.push(p);
            if (positions.length >= cap) return dedup(positions);
        }
    }
    return dedup(positions);
}
export function hollowEllipseCylinder(anchor, target, cap = MAX_BLOCKS) {
    const rx   = Math.abs(target.x - anchor.x);
    const rz   = Math.abs(target.z - anchor.z);
    const yMin = Math.min(anchor.y, target.y);
    const yMax = Math.max(anchor.y, target.y);
    const positions = [];
    for (const y of range(yMin, yMax)) {
        const slice = (y === yMin || y === yMax)
            ? ellipseXZ(anchor.x, y, anchor.z, rx, rz, cap)
            : hollowEllipseXZ(anchor.x, y, anchor.z, rx, rz, cap);
        for (const p of slice) {
            positions.push(p);
            if (positions.length >= cap) return dedup(positions);
        }
    }
    return dedup(positions);
}
export function cylinder(anchor, target, cap = MAX_BLOCKS) {
    const dx = target.x - anchor.x;
    const dz = target.z - anchor.z;
    const r = Math.sqrt(dx * dx + dz * dz);
    const positions = [];
    for (const y of range(anchor.y, target.y)) {
        for (const p of circleXZ(anchor.x, y, anchor.z, r, cap)) {
            positions.push(p);
            if (positions.length >= cap) return dedup(positions);
        }
    }
    return dedup(positions);
}
const OUTLINE_NEIGHBORS = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];
export function outlinePositions(positions) {
    if (!positions.length) return positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const W = maxX - minX + 2;
    const strideY = W;
    const strideZ = W * (maxY - minY + 2);
    const set = new Set(positions.map(p => (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ));
    return positions.filter(p => {
        const b = (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ;
        return !set.has(b + 1) || !set.has(b - 1) ||
               !set.has(b + strideY) || !set.has(b - strideY) ||
               !set.has(b + strideZ) || !set.has(b - strideZ);
    });
}
export function sphere(anchor, target, cap = MAX_BLOCKS) {
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const dz = target.z - anchor.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r < 0.5) return [{ x: anchor.x, y: anchor.y, z: anchor.z }];
    const ri = Math.ceil(r);
    const r2 = r * r;
    const positions = [];
    for (let ddx = -ri; ddx <= ri; ddx++)
        for (let ddy = -ri; ddy <= ri; ddy++)
            for (let ddz = -ri; ddz <= ri; ddz++) {
                if (ddx * ddx + ddy * ddy + ddz * ddz <= r2) {
                    positions.push({ x: anchor.x + ddx, y: anchor.y + ddy, z: anchor.z + ddz });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function shellAABB(p1, p2, cap = MAX_BLOCKS) {
    const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
    const z1 = Math.min(p1.z, p2.z), z2 = Math.max(p1.z, p2.z);
    const positions = [];
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
            for (let z = z1; z <= z2; z++) {
                if (x === x1 || x === x2 || y === y1 || y === y2 || z === z1 || z === z2) {
                    positions.push({ x, y, z });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function shellSphere(anchor, target, cap = MAX_BLOCKS) {
    const dx = target.x - anchor.x, dy = target.y - anchor.y, dz = target.z - anchor.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (r < 0.5) return [{ x: anchor.x, y: anchor.y, z: anchor.z }];
    const ri = Math.ceil(r);
    const r2 = r * r;
    const positions = [];
    for (let ddx = -ri; ddx <= ri; ddx++)
        for (let ddy = -ri; ddy <= ri; ddy++)
            for (let ddz = -ri; ddz <= ri; ddz++) {
                if (ddx * ddx + ddy * ddy + ddz * ddz > r2) continue;
                if (
                    (ddx+1)*(ddx+1) + ddy*ddy     + ddz*ddz     > r2 ||
                    (ddx-1)*(ddx-1) + ddy*ddy     + ddz*ddz     > r2 ||
                    ddx*ddx + (ddy+1)*(ddy+1)     + ddz*ddz     > r2 ||
                    ddx*ddx + (ddy-1)*(ddy-1)     + ddz*ddz     > r2 ||
                    ddx*ddx + ddy*ddy     + (ddz+1)*(ddz+1)     > r2 ||
                    ddx*ddx + ddy*ddy     + (ddz-1)*(ddz-1)     > r2
                ) {
                    positions.push({ x: anchor.x + ddx, y: anchor.y + ddy, z: anchor.z + ddz });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function hollowCylinder(anchor, target, cap = MAX_BLOCKS) {
    const dx = target.x - anchor.x, dz = target.z - anchor.z;
    const r  = Math.sqrt(dx * dx + dz * dz);
    const yMin = Math.min(anchor.y, target.y);
    const yMax = Math.max(anchor.y, target.y);
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (const y of range(yMin, yMax)) {
        const isCap = (y === yMin || y === yMax);
        for (let ddx = -ri; ddx <= ri; ddx++)
            for (let ddz = -ri; ddz <= ri; ddz++) {
                if (ddx * ddx + ddz * ddz > r2) continue;
                const onSurface = isCap || (
                    (ddx+1)*(ddx+1) + ddz*ddz     > r2 ||
                    (ddx-1)*(ddx-1) + ddz*ddz     > r2 ||
                    ddx*ddx + (ddz+1)*(ddz+1)     > r2 ||
                    ddx*ddx + (ddz-1)*(ddz-1)     > r2
                );
                if (onSurface) {
                    positions.push({ x: anchor.x + ddx, y, z: anchor.z + ddz });
                    if (positions.length >= cap) return dedup(positions);
                }
            }
    }
    return dedup(positions);
}
export function smartOutline(positions) {
    if (!positions.length) return positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const dX = maxX - minX, dY = maxY - minY, dZ = maxZ - minZ;
    const varyingAxes = (dX > 0 ? 1 : 0) + (dY > 0 ? 1 : 0) + (dZ > 0 ? 1 : 0);
    if (varyingAxes <= 1) return positions;
    if (varyingAxes === 3) return outlinePositions(positions);
    const W = dX + 2;
    const strideY = W;
    const strideZ = W * (dY + 2);
    const deltas = [];
    if (dX > 0) { deltas.push(1); deltas.push(-1); }
    if (dY > 0) { deltas.push(strideY); deltas.push(-strideY); }
    if (dZ > 0) { deltas.push(strideZ); deltas.push(-strideZ); }
    const set = new Set(positions.map(p => (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ));
    return positions.filter(p => {
        const b = (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ;
        return deltas.some(d => !set.has(b + d));
    });
}
export function wireframePositions(positions) {
    if (!positions.length) return positions;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const dX = maxX - minX, dY = maxY - minY, dZ = maxZ - minZ;
    const varyingAxes = (dX > 0 ? 1 : 0) + (dY > 0 ? 1 : 0) + (dZ > 0 ? 1 : 0);
    if (varyingAxes <= 1) return positions;
    if (varyingAxes === 2) return smartOutline(positions);
    if (positions.length === (dX + 1) * (dY + 1) * (dZ + 1))
        return skeletonAABB({ x: minX, y: minY, z: minZ }, { x: maxX, y: maxY, z: maxZ });
    const W = dX + 2;
    const strideY = W;
    const strideZ = W * (dY + 2);
    const set = new Set(positions.map(p => (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ));
    return positions.filter(p => {
        const b = (p.x - minX) + (p.y - minY) * strideY + (p.z - minZ) * strideZ;
        const eX = !set.has(b + 1)       || !set.has(b - 1);
        const eY = !set.has(b + strideY)  || !set.has(b - strideY);
        const eZ = !set.has(b + strideZ)  || !set.has(b - strideZ);
        return (eX ? 1 : 0) + (eY ? 1 : 0) + (eZ ? 1 : 0) >= 2;
    });
}

export function aabbBounds(p1, p2) {
    return {
        minX: Math.min(p1.x, p2.x), maxX: Math.max(p1.x, p2.x),
        minY: Math.min(p1.y, p2.y), maxY: Math.max(p1.y, p2.y),
        minZ: Math.min(p1.z, p2.z), maxZ: Math.max(p1.z, p2.z),
    };
}

export function radiusBounds(centre, rx, ry, rz) {
    return {
        minX: centre.x - rx, maxX: centre.x + rx,
        minY: centre.y - ry, maxY: centre.y + ry,
        minZ: centre.z - rz, maxZ: centre.z + rz,
    };
}

export function sampledBoxEdges(x1, x2, y1, y2, z1, z2, budget = 400) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const xs = dx === 0 ? [x1] : [x1, x2];
    const ys = dy === 0 ? [y1] : [y1, y2];
    const zs = dz === 0 ? [z1] : [z1, z2];

    const total = (dx ? ys.length * zs.length * (dx + 1) : 0)
                + (dy ? xs.length * zs.length * (dy + 1) : 0)
                + (dz ? xs.length * ys.length * (dz + 1) : 0);
    const step  = total > budget ? Math.ceil(total / budget) : 1;

    const out = [];

    if (dx) for (const y of ys) for (const z of zs) {
        for (let x = x1; x <= x2; x += step) out.push({ x, y, z });
        if (dx % step) out.push({ x: x2, y, z });
    }
    if (dy) {
        const skipEnds = dx !== 0;
        const last     = skipEnds ? y2 - 1 : y2;
        for (const x of xs) for (const z of zs) {
            for (let y = skipEnds ? y1 + step : y1; y <= last; y += step) out.push({ x, y, z });
            if (!skipEnds && dy % step) out.push({ x, y: y2, z });
        }
    }
    if (dz) {
        const skipEnds = dx !== 0 || dy !== 0;
        const last     = skipEnds ? z2 - 1 : z2;
        for (const x of xs) for (const y of ys) {
            for (let z = skipEnds ? z1 + step : z1; z <= last; z += step) out.push({ x, y, z });
            if (!skipEnds && dz % step) out.push({ x, y, z: z2 });
        }
    }

    if (!out.length) out.push({ x: x1, y: y1, z: z1 });
    return out;
}

export function boxEdges(x1, x2, y1, y2, z1, z2) {
    const out  = [];
    const seen = new Set();
    const add = (x, y, z) => {
        const k = `${x},${y},${z}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ x, y, z });
    };
    for (let x = x1; x <= x2; x++) {
        add(x, y1, z1); add(x, y1, z2); add(x, y2, z1); add(x, y2, z2);
    }
    for (let y = y1; y <= y2; y++) {
        add(x1, y, z1); add(x1, y, z2); add(x2, y, z1); add(x2, y, z2);
    }
    for (let z = z1; z <= z2; z++) {
        add(x1, y1, z); add(x1, y2, z); add(x2, y1, z); add(x2, y2, z);
    }
    return out;
}

export function skeletonAABB(p1, p2, cap = MAX_BLOCKS) {
    const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
    const z1 = Math.min(p1.z, p2.z), z2 = Math.max(p1.z, p2.z);
    const positions = [];
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
            for (let z = z1; z <= z2; z++) {
                const planes = (x === x1 || x === x2 ? 1 : 0)
                             + (y === y1 || y === y2 ? 1 : 0)
                             + (z === z1 || z === z2 ? 1 : 0);
                if (planes >= 2) {
                    positions.push({ x, y, z });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function hollowDiagonalWall(anchor, target) {
    const yMin = Math.min(anchor.y, target.y);
    const yMax = Math.max(anchor.y, target.y);
    const ys   = range(yMin, yMax);
    const xzLine = lineBetween(
        { x: anchor.x, y: 0, z: anchor.z },
        { x: target.x, y: 0, z: target.z }
    );
    if (!xzLine.length) return [];
    const minX = Math.min(anchor.x, target.x);
    const minZ = Math.min(anchor.z, target.z);
    const W = Math.abs(target.x - anchor.x) + 1;
    const strideY = W + 1;
    const strideZ = strideY * (yMax - yMin + 1);
    const positions = [];
    const seen = new Set();
    function add(x, y, z) {
        const k = (x - minX) + (y - yMin) * strideY + (z - minZ) * strideZ;
        if (seen.has(k)) return;
        seen.add(k);
        positions.push({ x, y, z });
    }
    for (const pt of xzLine) {
        add(pt.x, yMin, pt.z);
        add(pt.x, yMax, pt.z);
    }
    const first = xzLine[0];
    const last  = xzLine[xzLine.length - 1];
    for (const y of ys) {
        add(first.x, y, first.z);
        add(last.x,  y, last.z);
    }
    return positions;
}
export function hollowSlopeFloor(anchor, target, yaw = 0, cap = MAX_BLOCKS) {
    const xs   = range(anchor.x, target.x);
    const zs   = range(anchor.z, target.z);
    const xMin = Math.min(anchor.x, target.x), xMax = Math.max(anchor.x, target.x);
    const zMin = Math.min(anchor.z, target.z), zMax = Math.max(anchor.z, target.z);
    const yMin = Math.min(anchor.y, target.y), yMax = Math.max(anchor.y, target.y);
    const lenX = (xMax - xMin) || 1;
    const lenZ = (zMax - zMin) || 1;
    const a = ((yaw % 360) + 360) % 360;
    const getT = (x, z) => {
        if (a < 45 || a >= 315) return (z - zMin) / lenZ;
        if (a < 135)            return (xMax - x) / lenX;
        if (a < 225)            return (zMax - z) / lenZ;
        return                         (x - xMin) / lenX;
    };
    const W = xMax - xMin + 1;
    const strideY = W;
    const strideZ = W * (yMax - yMin + 1);
    const positions = [];
    const seen = new Set();
    for (const x of xs) {
        for (const z of zs) {
            if (x !== xMin && x !== xMax && z !== zMin && z !== zMax) continue;
            const t = getT(x, z);
            const y = Math.round(yMin + (yMax - yMin) * t);
            const k = (x - xMin) + (y - yMin) * strideY + (z - zMin) * strideZ;
            if (!seen.has(k)) {
                seen.add(k);
                positions.push({ x, y, z });
                if (positions.length >= cap) return positions;
            }
        }
    }
    return positions;
}
export function semiCircleHorizontal(cx, cy, cz, r, hDir, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dz = -ri; dz <= ri; dz++) {
            if (dx * dx + dz * dz > r2) continue;
            if (hDir === "south" && dz < 0) continue;
            if (hDir === "north" && dz > 0) continue;
            if (hDir === "east"  && dx < 0) continue;
            if (hDir === "west"  && dx > 0) continue;
            positions.push({ x: cx + dx, y: cy, z: cz + dz });
            if (positions.length >= cap) return positions;
        }
    return positions;
}
export function hollowSemiCircleHorizontal(cx, cy, cz, r, hDir, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dz = -ri; dz <= ri; dz++) {
            if (dx * dx + dz * dz > r2) continue;
            if (hDir === "south" && dz < 0) continue;
            if (hDir === "north" && dz > 0) continue;
            if (hDir === "east"  && dx < 0) continue;
            if (hDir === "west"  && dx > 0) continue;
            const onFlat = (hDir === "south" || hDir === "north") ? dz === 0 : dx === 0;
            const onEdge =
                (dx+1)*(dx+1) + dz*dz > r2 || (dx-1)*(dx-1) + dz*dz > r2 ||
                dx*dx + (dz+1)*(dz+1) > r2 || dx*dx + (dz-1)*(dz-1) > r2;
            if (onFlat || onEdge) {
                positions.push({ x: cx + dx, y: cy, z: cz + dz });
                if (positions.length >= cap) return positions;
            }
        }
    return positions;
}
export function arch(cx, cy, cz, r, facingNS, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    if (facingNS) {
        for (let dx = -ri; dx <= ri; dx++)
            for (let dy = 0; dy <= ri; dy++) {
                if (dx * dx + dy * dy <= r2) {
                    positions.push({ x: cx + dx, y: cy + dy, z: cz });
                    if (positions.length >= cap) return positions;
                }
            }
    } else {
        for (let dz = -ri; dz <= ri; dz++)
            for (let dy = 0; dy <= ri; dy++) {
                if (dz * dz + dy * dy <= r2) {
                    positions.push({ x: cx, y: cy + dy, z: cz + dz });
                    if (positions.length >= cap) return positions;
                }
            }
    }
    return positions;
}
export function hollowArch(cx, cy, cz, r, facingNS, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    if (facingNS) {
        for (let dx = -ri; dx <= ri; dx++)
            for (let dy = 0; dy <= ri; dy++) {
                if (dx * dx + dy * dy > r2) continue;
                const onFlat = dy === 0;
                const onEdge =
                    (dx+1)*(dx+1) + dy*dy > r2 || (dx-1)*(dx-1) + dy*dy > r2 ||
                    dx*dx + (dy+1)*(dy+1) > r2  || dx*dx + (dy-1)*(dy-1) > r2;
                if (onFlat || onEdge) {
                    positions.push({ x: cx + dx, y: cy + dy, z: cz });
                    if (positions.length >= cap) return positions;
                }
            }
    } else {
        for (let dz = -ri; dz <= ri; dz++)
            for (let dy = 0; dy <= ri; dy++) {
                if (dz * dz + dy * dy > r2) continue;
                const onFlat = dy === 0;
                const onEdge =
                    (dz+1)*(dz+1) + dy*dy > r2 || (dz-1)*(dz-1) + dy*dy > r2 ||
                    dz*dz + (dy+1)*(dy+1) > r2  || dz*dz + (dy-1)*(dy-1) > r2;
                if (onFlat || onEdge) {
                    positions.push({ x: cx, y: cy + dy, z: cz + dz });
                    if (positions.length >= cap) return positions;
                }
            }
    }
    return positions;
}
export function dome(cx, cy, cz, r, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dy = 0; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++) {
                if (dx * dx + dy * dy + dz * dz <= r2) {
                    positions.push({ x: cx + dx, y: cy + dy, z: cz + dz });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function hollowDome(cx, cy, cz, r, cap = MAX_BLOCKS) {
    if (r < 0.5) return [{ x: cx, y: cy, z: cz }];
    const ri = Math.ceil(r), r2 = r * r;
    const positions = [];
    for (let dx = -ri; dx <= ri; dx++)
        for (let dy = 0; dy <= ri; dy++)
            for (let dz = -ri; dz <= ri; dz++) {
                if (dx * dx + dy * dy + dz * dz > r2) continue;
                const onFlat = dy === 0;
                const onEdge =
                    (dx+1)*(dx+1) + dy*dy + dz*dz > r2 || (dx-1)*(dx-1) + dy*dy + dz*dz > r2 ||
                    dx*dx + (dy+1)*(dy+1) + dz*dz > r2  || dx*dx + (dy-1)*(dy-1) + dz*dz > r2 ||
                    dx*dx + dy*dy + (dz+1)*(dz+1) > r2  || dx*dx + dy*dy + (dz-1)*(dz-1) > r2;
                if (onFlat || onEdge) {
                    positions.push({ x: cx + dx, y: cy + dy, z: cz + dz });
                    if (positions.length >= cap) return positions;
                }
            }
    return positions;
}
export function cone(anchor, target, cap = MAX_BLOCKS) {
    const r     = Math.sqrt((target.x - anchor.x) ** 2 + (target.z - anchor.z) ** 2);
    const baseY = Math.round(anchor.y);
    const apexY = Math.round(target.y);
    const h     = apexY - baseY;
    if (h === 0) return circleXZ(anchor.x, baseY, anchor.z, r, cap);
    const positions = [];
    for (const y of range(baseY, apexY)) {
        const t      = Math.abs(y - baseY) / Math.abs(h);
        const rLayer = r * (1 - t);
        for (const p of circleXZ(anchor.x, y, anchor.z, rLayer, cap)) {
            positions.push(p);
            if (positions.length >= cap) return dedup(positions);
        }
    }
    return dedup(positions);
}
export function hollowCone(anchor, target, cap = MAX_BLOCKS) {
    const r     = Math.sqrt((target.x - anchor.x) ** 2 + (target.z - anchor.z) ** 2);
    const baseY = Math.round(anchor.y);
    const apexY = Math.round(target.y);
    const h     = apexY - baseY;
    if (h === 0) return hollowCircleXZ(anchor.x, baseY, anchor.z, r, cap);
    const positions = [];
    for (const y of range(baseY, apexY)) {
        const t      = Math.abs(y - baseY) / Math.abs(h);
        const rLayer = r * (1 - t);
        const isBase = (y === baseY);
        if (rLayer < 0.5) {
            positions.push({ x: anchor.x, y, z: anchor.z });
            if (positions.length >= cap) return dedup(positions);
        } else if (isBase) {
            for (const p of circleXZ(anchor.x, y, anchor.z, rLayer, cap)) {
                positions.push(p);
                if (positions.length >= cap) return dedup(positions);
            }
        } else {
            for (const p of hollowCircleXZ(anchor.x, y, anchor.z, rLayer, cap)) {
                positions.push(p);
                if (positions.length >= cap) return dedup(positions);
            }
        }
    }
    return dedup(positions);
}

export function diagonalCone(anchor, radiusPoint, apex, cap = MAX_BLOCKS) {
    const r     = Math.sqrt((radiusPoint.x - anchor.x) ** 2 + (radiusPoint.z - anchor.z) ** 2);
    const baseY = Math.round(anchor.y);
    const apexY = Math.round(apex.y);
    const h     = apexY - baseY;
    if (h === 0) return circleXZ(anchor.x, baseY, anchor.z, r, cap);
    const dxA = apex.x - anchor.x;
    const dzA = apex.z - anchor.z;
    const positions = [];
    for (const y of range(baseY, apexY)) {
        const t      = Math.abs(y - baseY) / Math.abs(h);
        const rLayer = r * (1 - t);
        const cx     = Math.round(anchor.x + dxA * t);
        const cz     = Math.round(anchor.z + dzA * t);
        for (const p of circleXZ(cx, y, cz, rLayer, cap)) {
            positions.push(p);
            if (positions.length >= cap) return dedup(positions);
        }
    }
    return dedup(positions);
}
export function hollowDiagonalCone(anchor, radiusPoint, apex, cap = MAX_BLOCKS) {
    const r     = Math.sqrt((radiusPoint.x - anchor.x) ** 2 + (radiusPoint.z - anchor.z) ** 2);
    const baseY = Math.round(anchor.y);
    const apexY = Math.round(apex.y);
    const h     = apexY - baseY;
    if (h === 0) return hollowCircleXZ(anchor.x, baseY, anchor.z, r, cap);
    const dxA = apex.x - anchor.x;
    const dzA = apex.z - anchor.z;
    const positions = [];
    for (const y of range(baseY, apexY)) {
        const t      = Math.abs(y - baseY) / Math.abs(h);
        const rLayer = r * (1 - t);
        const cx     = Math.round(anchor.x + dxA * t);
        const cz     = Math.round(anchor.z + dzA * t);
        const isBase = (y === baseY);
        if (rLayer < 0.5) {
            positions.push({ x: cx, y, z: cz });
            if (positions.length >= cap) return dedup(positions);
        } else if (isBase) {
            for (const p of circleXZ(cx, y, cz, rLayer, cap)) {
                positions.push(p);
                if (positions.length >= cap) return dedup(positions);
            }
        } else {
            for (const p of hollowCircleXZ(cx, y, cz, rLayer, cap)) {
                positions.push(p);
                if (positions.length >= cap) return dedup(positions);
            }
        }
    }
    return dedup(positions);
}
