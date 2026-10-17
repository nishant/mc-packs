// @ts-nocheck
import { BlockPermutation } from "@minecraft/server";
const SOURCE_KEY = "eb:palette";
const DIST_KEY   = "eb:palette_dist";
const WEIGHT_KEY = "eb:palette_weight";

export function getPaletteMode(player) {
    return (player.getDynamicProperty(SOURCE_KEY) ?? "disable");
}
export function setPaletteMode(player, mode) {
    player.setDynamicProperty(SOURCE_KEY, mode);
}
export function getDistributionMode(player) {
    return (player.getDynamicProperty(DIST_KEY) ?? "random");
}
export function setDistributionMode(player, mode) {
    player.setDynamicProperty(DIST_KEY, mode);
}
export function getWeightMode(player) {
    return (player.getDynamicProperty(WEIGHT_KEY) ?? "amount");
}
export function setWeightMode(player, mode) {
    player.setDynamicProperty(WEIGHT_KEY, mode);
}
export function getPaletteBlocks(player) {
    const mode = getPaletteMode(player);
    if (mode === "disable") return null;
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return null;

    const start = mode === "inventory" ? 9 : 0;
    const end   = mode === "hotbar"    ? 9 : inv.size;
    const weightMode = getWeightMode(player);
    const blockMap   = new Map();
    for (let i = start; i < end; i++) {
        const item = inv.getItem(i);
        if (!item) continue;
        if (item.typeId.startsWith("custom:") || item.typeId.startsWith("eb:")) continue;
        try { BlockPermutation.resolve(item.typeId); } catch { continue; }
        const prev = blockMap.get(item.typeId) ?? 0;
        if (weightMode === "slots") {
            blockMap.set(item.typeId, prev + 1);
        } else if (weightMode === "unique") {
            blockMap.set(item.typeId, 1);
        } else {
            blockMap.set(item.typeId, prev + item.amount);
        }
    }
    if (!blockMap.size) return null;
    return [...blockMap.entries()].map(([typeId, count]) => ({ typeId, count }));
}

function hash(x, y, z) {
    let n = (Math.imul(x | 0, 1619) ^ Math.imul(y | 0, 31337) ^ Math.imul(z | 0, 1013904223)) | 0;
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, z, scale) {
    const sx = x / scale, sy = y / scale, sz = z / scale;
    const ix = Math.floor(sx), iy = Math.floor(sy), iz = Math.floor(sz);
    const fx = fade(sx - ix), fy = fade(sy - iy), fz = fade(sz - iz);
    return lerp(
        lerp(
            lerp(hash(ix,   iy,   iz  ), hash(ix+1, iy,   iz  ), fx),
            lerp(hash(ix,   iy+1, iz  ), hash(ix+1, iy+1, iz  ), fx), fy),
        lerp(
            lerp(hash(ix,   iy,   iz+1), hash(ix+1, iy,   iz+1), fx),
            lerp(hash(ix,   iy+1, iz+1), hash(ix+1, iy+1, iz+1), fx), fy),
        fz
    );
}

function worleyNoise(x, y, z, scale) {
    const cx = Math.floor(x / scale), cy = Math.floor(y / scale), cz = Math.floor(z / scale);
    let minDist = Infinity, minId = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                const nx = cx+dx, ny = cy+dy, nz = cz+dz;
                const px = nx + hash(nx,       ny,       nz      );
                const py = ny + hash(nx+1000,   ny,       nz      );
                const pz = nz + hash(nx,        ny+1000,  nz      );
                const dist = (x/scale - px)**2 + (y/scale - py)**2 + (z/scale - pz)**2;
                if (dist < minDist) { minDist = dist; minId = hash(nx*3, ny*7, nz*11); }
            }
        }
    }
    return minId;
}

function getBB(positions) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    return {
        minX, minY, minZ, maxX, maxY, maxZ,
        spanX: maxX - minX || 1,
        spanY: maxY - minY || 1,
        spanZ: maxZ - minZ || 1,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        cz: (minZ + maxZ) / 2,
    };
}

function getIndexByProgress(t, palette, total) {
    let cumulative = 0;
    for (let i = 0; i < palette.length - 1; i++) {
        cumulative += palette[i].count / total;
        if (t <= cumulative) return i;
    }
    return palette.length - 1;
}

export function assignPalette(palette, positions, distribution) {
    const total = palette.reduce((s, p) => s + p.count, 0);
    const n     = palette.length;

    if (!distribution || distribution === "random" || distribution === "spread") {
        const pool = [];
        for (const { typeId, count } of palette) {
            const share = Math.max(1, Math.round((count / total) * positions.length));
            for (let i = 0; i < share; i++) pool.push(typeId);
        }
        if (distribution === "spread") {
            return positions.map((pos, i) => ({ pos, typeId: pool[i % pool.length] }));
        }
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return positions.map((pos, i) => ({ pos, typeId: pool[i % pool.length] }));
    }

    const bb = getBB(positions);

    const useZ    = bb.spanZ > bb.spanX;
    const colOf   = pos => useZ ? pos.z : pos.x;
    const spanH   = useZ ? bb.spanZ : bb.spanX;
    const minH    = useZ ? bb.minZ  : bb.minX;
    const centerH = useZ ? (bb.minZ + bb.maxZ) / 2 : (bb.minX + bb.maxX) / 2;
    const isFloor = bb.spanY < Math.min(bb.spanX, bb.spanZ);
    const rowOf   = pos => isFloor ? (useZ ? pos.x : pos.z) : pos.y;
    const spanV   = isFloor ? (useZ ? bb.spanX : bb.spanZ) : bb.spanY;
    const minV    = isFloor ? (useZ ? bb.minX  : bb.minZ)  : bb.minY;
    const centerV = isFloor ? (useZ ? bb.cx : bb.cz) : bb.cy;

    if (distribution === "grad_x") {
        return positions.map(pos => {
            const t = (pos.x - bb.minX) / bb.spanX;
            return { pos, typeId: palette[getIndexByProgress(t, palette, total)].typeId };
        });
    }
    if (distribution === "grad_y") {
        return positions.map(pos => {
            const t = (pos.y - bb.minY) / bb.spanY;
            return { pos, typeId: palette[getIndexByProgress(t, palette, total)].typeId };
        });
    }
    if (distribution === "grad_z") {
        return positions.map(pos => {
            const t = (pos.z - bb.minZ) / bb.spanZ;
            return { pos, typeId: palette[getIndexByProgress(t, palette, total)].typeId };
        });
    }
    if (distribution === "grad_radial") {
        const maxR = Math.sqrt(bb.spanX**2 + bb.spanY**2 + bb.spanZ**2) / 2 || 1;
        return positions.map(pos => {
            const r = Math.sqrt((pos.x-bb.cx)**2 + (pos.y-bb.cy)**2 + (pos.z-bb.cz)**2);
            const t = Math.min(r / maxR, 1);
            return { pos, typeId: palette[getIndexByProgress(t, palette, total)].typeId };
        });
    }
    if (distribution === "grad_diagonal") {

        return positions.map(pos => {
            const tH = (colOf(pos) - minH) / spanH;
            const tV = (rowOf(pos) - minV) / spanV;
            const t  = Math.min(1, (tH + tV) / 2);
            return { pos, typeId: palette[getIndexByProgress(t, palette, total)].typeId };
        });
    }
    if (distribution === "concentric") {
        const maxR = Math.sqrt(bb.spanX**2 + bb.spanY**2 + bb.spanZ**2) / 2 || 1;
        const ringW = Math.max(1, maxR / (n * 1.5));
        return positions.map(pos => {
            const r   = Math.sqrt((pos.x-bb.cx)**2 + (pos.y-bb.cy)**2 + (pos.z-bb.cz)**2);
            const idx = Math.floor(r / ringW) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }

    if (distribution === "checker") {
        return positions.map(pos => {
            const idx = ((Math.floor(pos.x) + Math.floor(pos.y) + Math.floor(pos.z)) % n + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "stripes_h") {
        return positions.map(pos => {
            const idx = ((Math.floor(pos.y) % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "stripes_v") {

        return positions.map(pos => {
            const idx = ((Math.floor(colOf(pos)) % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "stripes_d") {

        return positions.map(pos => {
            const idx = (((Math.floor(colOf(pos)) + Math.floor(rowOf(pos))) % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "brick") {

        return positions.map(pos => {
            const row    = Math.floor(rowOf(pos));
            const isOdd  = ((row % 2) + 2) % 2 === 1;
            const offset = isOdd ? 1 : 0;
            const raw    = Math.floor((Math.floor(colOf(pos)) + offset) / 2);
            const idx    = ((raw % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "herringbone") {

        return positions.map(pos => {
            const row     = Math.floor(rowOf(pos) / 2);
            const col     = Math.floor(colOf(pos) / 2);
            const goRight = ((row + col) % 2 + 2) % 2 === 0;
            const fc      = Math.floor(colOf(pos));
            const fr      = Math.floor(rowOf(pos));
            const raw     = goRight ? (fc + fr) : (fc - fr);
            const idx     = ((raw % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }

    const noiseScale = Math.max(bb.spanX, bb.spanY, bb.spanZ, 4) / 4;

    if (distribution === "noise") {
        return positions.map(pos => {
            const v = valueNoise(pos.x, pos.y, pos.z, noiseScale);
            return { pos, typeId: palette[getIndexByProgress(v, palette, total)].typeId };
        });
    }
    if (distribution === "cell") {
        return positions.map(pos => {
            const v = worleyNoise(pos.x, pos.y, pos.z, noiseScale);
            return { pos, typeId: palette[getIndexByProgress(v, palette, total)].typeId };
        });
    }
    if (distribution === "marble") {

        return positions.map(pos => {
            const nv = valueNoise(pos.x, pos.y, pos.z, noiseScale * 0.6);
            const v  = (Math.sin(colOf(pos) / noiseScale * Math.PI * 2 + nv * 8) + 1) / 2;
            return { pos, typeId: palette[getIndexByProgress(v, palette, total)].typeId };
        });
    }

    if (distribution === "border") {

        return positions.map(pos => {
            const depth = Math.min(
                pos.x - bb.minX, bb.maxX - pos.x,
                pos.y - bb.minY, bb.maxY - pos.y,
                pos.z - bb.minZ, bb.maxZ - pos.z
            );
            const idx = ((Math.floor(depth) % n) + n) % n;
            return { pos, typeId: palette[idx].typeId };
        });
    }
    if (distribution === "wave") {

        const freq = (Math.PI * 2 / Math.max(spanH, 1)) * 3;
        return positions.map(pos => {
            const v = (Math.sin((colOf(pos) - minH) * freq
                              + (rowOf(pos) - minV) * freq * 0.4) + 1) / 2;
            return { pos, typeId: palette[getIndexByProgress(v, palette, total)].typeId };
        });
    }
    if (distribution === "spiral") {

        const maxR = Math.sqrt(spanH**2 + spanV**2) / 2 || 1;
        return positions.map(pos => {
            const angle = Math.atan2(rowOf(pos) - centerV, colOf(pos) - centerH);
            const dist  = Math.sqrt((colOf(pos) - centerH)**2 + (rowOf(pos) - centerV)**2);
            const v     = (((angle + Math.PI) / (Math.PI * 2)) + (dist / maxR)) % 1;
            return { pos, typeId: palette[getIndexByProgress(v, palette, total)].typeId };
        });
    }
    const dissolveAlong = (axisOf, minA, spanA) => positions.map(pos => {
        const t     = (axisOf(pos) - minA) / spanA;
        const noise = hash(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        const dithered = Math.max(0, Math.min(1, t + (noise - 0.5) * (2 / Math.max(spanA, 2))));
        return { pos, typeId: palette[getIndexByProgress(dithered, palette, total)].typeId };
    });
    if (distribution === "dissolve") {
        const useRow = spanV > spanH;
        return dissolveAlong(pos => useRow ? rowOf(pos) : colOf(pos), useRow ? minV : minH, useRow ? spanV : spanH);
    }
    if (distribution === "dissolve_x") return dissolveAlong(pos => pos.x, bb.minX, bb.spanX);
    if (distribution === "dissolve_y") return dissolveAlong(pos => pos.y, bb.minY, bb.spanY);
    if (distribution === "dissolve_z") return dissolveAlong(pos => pos.z, bb.minZ, bb.spanZ);

    return positions.map(pos => ({ pos, typeId: palette[0].typeId }));
}

const SMART_PATTERN_KEY = "eb:smart_pattern";
export function getSmartPattern(player) {
    return player.getDynamicProperty(SMART_PATTERN_KEY) === true;
}
export function setSmartPattern(player, enabled) {
    player.setDynamicProperty(SMART_PATTERN_KEY, enabled);
}
