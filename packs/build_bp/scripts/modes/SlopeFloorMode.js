// @ts-nocheck
import { slopeFloor, hollowSlopeFloor, FACE_OFFSETS } from "../utils/GeometryUtils.js";
import { getModeOption }               from "../utils/ModeOptions.js";
import { getMaxBlocks }                from "../core/Settings.js";
export const SlopeFloorMode = {
    steps: 3,
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        try {
            const hit = player.getBlockFromViewDirection({
                maxDistance: 64,
                includePassableBlocks: false,
            });
            if (hit?.block) {
                const loc = hit.block.location;
                const off = FACE_OFFSETS[hit.face] ?? { x: 0, y: 1, z: 0 };
                if (loc.y + off.y === anchor.y) {
                    return { x: loc.x, y: anchor.y, z: loc.z };
                }
            }
        } catch {  }
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
    },
    getPositions(anchor, target, player, secondAnchor) {
        const effectiveTarget = secondAnchor
            ? { x: secondAnchor.x, y: target.y, z: secondAnchor.z }
            : { x: target.x,       y: anchor.y,  z: target.z };
        const yaw = player?.getRotation?.()?.y ?? 0;
        const cap = getMaxBlocks(player);
        if (getModeOption(player, "slope_floor", "fill") === "hollow")
            return hollowSlopeFloor(anchor, effectiveTarget, yaw, cap);
        return slopeFloor(anchor, effectiveTarget, yaw, cap);
    },
};
