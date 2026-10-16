// @ts-nocheck
export function yawToward(from, to) {
    return Math.atan2(-(to.x - from.x), to.z - from.z) * 180 / Math.PI;
}

export function spotInFront(player, distance, minDistance, drop) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const flat = Math.hypot(view.x, view.z);
    const yaw  = player.getRotation().y * Math.PI / 180;
    const dir  = flat > 0.001
        ? { x: view.x / flat, y: 0, z: view.z / flat }
        : { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

    let reach = distance;
    try {
        const hit = player.dimension.getBlockFromRay(head, dir, {
            maxDistance: distance + 0.5,
            includeLiquidBlocks: false,
            includePassableBlocks: false,
        });
        if (hit) {
            const hx = hit.block.location.x + hit.faceLocation.x - head.x;
            const hz = hit.block.location.z + hit.faceLocation.z - head.z;
            reach = Math.max(minDistance, Math.min(distance, Math.hypot(hx, hz) - 0.4));
        }
    } catch {}

    return { x: head.x + dir.x * reach, y: head.y - drop, z: head.z + dir.z * reach };
}

function filled(dimension, x, y, z) {
    try {
        const block = dimension.getBlock({ x: Math.floor(x), y, z: Math.floor(z) });
        return Boolean(block) && !block.isAir && !block.isLiquid;
    } catch { return false; }
}

export const HIGHEST_LIFT = 8;

export function liftClear(dimension, bottom, yaw, wide, tall, maxLift = HIGHEST_LIFT) {
    const rad     = yaw * Math.PI / 180;
    const half    = Math.max(0, wide / 2 - 0.02);
    const steps   = Math.max(2, Math.ceil(wide / 0.5));
    const columns = [];
    for (let i = 0; i <= steps; i++) {
        const along = -half + 2 * half * i / steps;
        columns.push({ x: bottom.x + Math.cos(rad) * along, z: bottom.z + Math.sin(rad) * along });
    }
    let y = bottom.y;
    for (let tries = 0; tries < 12; tries++) {
        const lowest = Math.floor(y + 0.01);
        let blocked  = null;
        for (let level = Math.floor(y + tall - 0.01); level >= lowest && blocked === null; level--) {
            if (columns.some(column => filled(dimension, column.x, level, column.z))) blocked = level;
        }
        if (blocked === null) return { x: bottom.x, y, z: bottom.z };
        y = blocked + 1.02;
        if (y - bottom.y > maxLift) return null;
    }
    return null;
}

export function clearSpotInFront(player, distance, minDistance, wide, tall, drop) {
    const first = spotInFront(player, distance, minDistance, drop);
    let best = null;
    for (let reach = distance; reach >= minDistance - 0.001; reach -= 0.35) {
        const spot  = reach === distance ? first : spotInFront(player, reach, minDistance, drop);
        const clear = liftClear(player.dimension, spot, yawToward(spot, player.location), wide, tall, HIGHEST_LIFT);
        if (!clear) continue;
        const lift = clear.y - spot.y;
        if (lift <= tall / 2 + 0.3) return clear;
        if (!best || lift < best.lift - 0.01) best = { clear, lift };
    }
    return best?.clear ?? first;
}

export function spotBeside(player, distance, angle, minDistance, drop) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    const flat = Math.hypot(view.x, view.z);
    const yaw  = player.getRotation().y * Math.PI / 180;
    const fore = flat > 0.001
        ? { x: view.x / flat, z: view.z / flat }
        : { x: -Math.sin(yaw), z: Math.cos(yaw) };
    const turn = angle * Math.PI / 180;
    const dir  = {
        x: fore.x * Math.cos(turn) - fore.z * Math.sin(turn),
        y: 0,
        z: fore.z * Math.cos(turn) + fore.x * Math.sin(turn),
    };

    let reach = distance;
    try {
        const hit = player.dimension.getBlockFromRay(head, dir, {
            maxDistance: distance + 0.5,
            includeLiquidBlocks: false,
            includePassableBlocks: false,
        });
        if (hit) {
            const hx = hit.block.location.x + hit.faceLocation.x - head.x;
            const hz = hit.block.location.z + hit.faceLocation.z - head.z;
            reach = Math.max(minDistance, Math.min(distance, Math.hypot(hx, hz) - 0.4));
        }
    } catch {}

    return { x: head.x + dir.x * reach, y: head.y - drop, z: head.z + dir.z * reach };
}
