// @ts-nocheck
import { isFacingNS } from "./GeometryUtils.js";
const MAX_T = 64;

export function getFreeTarget(player) {
    try {
        const hit = player.getBlockFromViewDirection({ maxDistance: 64, includePassableBlocks: false });
        if (hit?.block) return hit.block.location;
    } catch { }
    try {
        const head = player.getHeadLocation();
        const dir  = player.getViewDirection();
        return {
            x: Math.floor(head.x + dir.x * 24),
            y: Math.floor(head.y + dir.y * 24),
            z: Math.floor(head.z + dir.z * 24),
        };
    } catch { return null; }
}
export function getConstrainedTarget(player, anchor, yaw) {
    try {
        const head     = player.getHeadLocation();
        const dir      = player.getViewDirection();
        const facingNS = isFacingNS(yaw);

        const hLen = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        if (hLen < 0.001) return null;
        const hDirX = dir.x / hLen;
        const hDirZ = dir.z / hLen;
        const slope = dir.y / hLen;

        if (facingNS) {
            if (Math.abs(hDirZ) < 0.001) return null;
            const t = Math.min((anchor.z - head.z) / hDirZ, MAX_T);
            if (t <= 0) return null;
            return {
                x: Math.floor(head.x + hDirX * t),
                y: Math.floor(head.y + slope  * t),
                z: anchor.z,
            };
        } else {
            if (Math.abs(hDirX) < 0.001) return null;
            const t = Math.min((anchor.x - head.x) / hDirX, MAX_T);
            if (t <= 0) return null;
            return {
                x: anchor.x,
                y: Math.floor(head.y + slope  * t),
                z: Math.floor(head.z + hDirZ  * t),
            };
        }
    } catch { return null; }
}
