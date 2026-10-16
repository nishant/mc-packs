// @ts-nocheck
import { axisLine, aabbBounds } from "../utils/GeometryUtils.js";
import { getConstrainedTarget } from "../utils/ViewUtils.js";
import { getMaxBlocks } from "../core/Settings.js";

export const LineMode = {
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        try {
            return getConstrainedTarget(player, anchor, player.getRotation().y);
        } catch { return null; }
    },
    getPositions(anchor, target, player) {
        return axisLine(anchor, target, getMaxBlocks(player));
    },

    getBounds(anchor, target) {
        const ax = Math.abs(target.x - anchor.x);
        const ay = Math.abs(target.y - anchor.y);
        const az = Math.abs(target.z - anchor.z);
        const end = ax >= ay && ax >= az ? { x: target.x, y: anchor.y, z: anchor.z }
                  : ay >= ax && ay >= az ? { x: anchor.x, y: target.y, z: anchor.z }
                  :                        { x: anchor.x, y: anchor.y, z: target.z };
        return aabbBounds(anchor, end);
    },
};
