// @ts-nocheck
import { floorRect, smartOutline, aabbBounds } from "../utils/GeometryUtils.js";
import { getModeOption }           from "../utils/ModeOptions.js";
import { getMaxBlocks }            from "../core/Settings.js";
export const FloorMode = {
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
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
    getPositions(anchor, target, player) {
        const positions = floorRect(anchor, target, getMaxBlocks(player));
        if (getModeOption(player, "floor", "fill") === "hollow") return smartOutline(positions);
        return positions;
    },

    getBounds(anchor, target) {
        return aabbBounds(anchor, { x: target.x, y: anchor.y, z: target.z });
    },
};
