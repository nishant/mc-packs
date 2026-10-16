// @ts-nocheck
import { getModeOption } from "../utils/ModeOptions.js";
import { getConstrainedTarget } from "../utils/ViewUtils.js";
import {
    isFacingNS,
    semiCircleHorizontal, hollowSemiCircleHorizontal,
    arch, hollowArch,
    dome, hollowDome,
} from "../utils/GeometryUtils.js";
import { getMaxBlocks } from "../core/Settings.js";
function yawToHDir(yaw) {
    const n = ((yaw % 360) + 360) % 360;
    if (n < 45 || n >= 315) return "south";
    if (n < 135)            return "west";
    if (n < 225)            return "north";
    return "east";
}
function getRadius(anchor, target, orientation, facingNS) {
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const dz = target.z - anchor.z;
    if (orientation === "horizontal") return Math.sqrt(dx * dx + dz * dz);
    if (orientation === "arch")       return facingNS ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.max(Math.abs(dz), Math.abs(dy));
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
export const SemicircleMode = {
    previewOutline: true,
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        const orientation = getModeOption(player, "semicircle", "orientation");
        if (orientation === "horizontal") {
            try {
                const head = player.getHeadLocation();
                const dir  = player.getViewDirection();
                if (Math.abs(dir.y) < 0.001) return null;
                const t = Math.min((anchor.y - head.y) / dir.y, 64);
                if (t <= 0) return null;
                return {
                    x: Math.floor(head.x + dir.x * t),
                    y: anchor.y,
                    z: Math.floor(head.z + dir.z * t),
                };
            } catch { return null; }
        }
        return getConstrainedTarget(player, anchor, player.getRotation().y);
    },
    getPositions(anchor, target, player) {
        const cap         = getMaxBlocks(player);
        const orientation = getModeOption(player, "semicircle", "orientation");
        const fill        = getModeOption(player, "semicircle", "fill");
        const yaw         = player.getRotation().y;
        const facingNS    = isFacingNS(yaw);
        const hDir        = yawToHDir(yaw);
        const r           = getRadius(anchor, target, orientation, facingNS);
        if (orientation === "horizontal") {
            return fill === "hollow"
                ? hollowSemiCircleHorizontal(anchor.x, anchor.y, anchor.z, r, hDir, cap)
                : semiCircleHorizontal(anchor.x, anchor.y, anchor.z, r, hDir, cap);
        }
        if (orientation === "arch") {
            return fill === "hollow"
                ? hollowArch(anchor.x, anchor.y, anchor.z, r, facingNS, cap)
                : arch(anchor.x, anchor.y, anchor.z, r, facingNS, cap);
        }
        return fill === "hollow"
            ? hollowDome(anchor.x, anchor.y, anchor.z, r, cap)
            : dome(anchor.x, anchor.y, anchor.z, r, cap);
    },

    getBounds(anchor, target, player) {
        const orientation = getModeOption(player, "semicircle", "orientation");
        const yaw         = player.getRotation().y;
        const facingNS    = isFacingNS(yaw);
        const r           = Math.floor(getRadius(anchor, target, orientation, facingNS));

        if (orientation === "horizontal") {
            const hDir = yawToHDir(yaw);
            return {
                minX: anchor.x - (hDir === "east"  ? 0 : r),
                maxX: anchor.x + (hDir === "west"  ? 0 : r),
                minY: anchor.y, maxY: anchor.y,
                minZ: anchor.z - (hDir === "south" ? 0 : r),
                maxZ: anchor.z + (hDir === "north" ? 0 : r),
            };
        }
        if (orientation === "arch") {
            return {
                minX: anchor.x - (facingNS ? r : 0), maxX: anchor.x + (facingNS ? r : 0),
                minY: anchor.y,                      maxY: anchor.y + r,
                minZ: anchor.z - (facingNS ? 0 : r), maxZ: anchor.z + (facingNS ? 0 : r),
            };
        }
        return {
            minX: anchor.x - r, maxX: anchor.x + r,
            minY: anchor.y,     maxY: anchor.y + r,
            minZ: anchor.z - r, maxZ: anchor.z + r,
        };
    },
    getShellPositions(anchor, target, player) {
        const cap         = getMaxBlocks(player);
        const orientation = getModeOption(player, "semicircle", "orientation");
        const yaw         = player.getRotation().y;
        const facingNS    = isFacingNS(yaw);
        const hDir        = yawToHDir(yaw);
        const r           = getRadius(anchor, target, orientation, facingNS);
        if (orientation === "horizontal") return hollowSemiCircleHorizontal(anchor.x, anchor.y, anchor.z, r, hDir, cap);
        if (orientation === "arch")       return hollowArch(anchor.x, anchor.y, anchor.z, r, facingNS, cap);
        return hollowDome(anchor.x, anchor.y, anchor.z, r, cap);
    },
};
