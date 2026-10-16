// @ts-nocheck
import { wallAABB, smartOutline, aabbBounds } from "../utils/GeometryUtils.js";
import { getModeOption }           from "../utils/ModeOptions.js";
import { getConstrainedTarget }    from "../utils/ViewUtils.js";
import { getMaxBlocks }            from "../core/Settings.js";
export const WallMode = {
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        return getConstrainedTarget(player, anchor, player.getRotation().y);
    },
    getPositions(anchor, target, player) {
        const positions = wallAABB(anchor, target, getMaxBlocks(player));
        if (getModeOption(player, "wall", "fill") === "hollow") return smartOutline(positions);
        return positions;
    },

    getBounds(anchor, target) {
        const dx = Math.abs(target.x - anchor.x);
        const dz = Math.abs(target.z - anchor.z);
        const end = dx >= dz
            ? { x: target.x, y: target.y, z: anchor.z }
            : { x: anchor.x, y: target.y, z: target.z };
        return aabbBounds(anchor, end);
    },
};
