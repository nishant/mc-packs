// @ts-nocheck
import { sphere, shellSphere, radiusBounds } from "../utils/GeometryUtils.js";
import { getModeOption }       from "../utils/ModeOptions.js";
import { getConstrainedTarget } from "../utils/ViewUtils.js";
import { getMaxBlocks }        from "../core/Settings.js";
export const SphereMode = {
    previewOutline: true,
    getTarget(player, anchor) {
        return getConstrainedTarget(player, anchor, player.getRotation().y);
    },
    getPositions(anchor, target, player) {
        const fill = getModeOption(player, "sphere", "fill");
        return fill === "hollow"
            ? shellSphere(anchor, target, getMaxBlocks(player))
            : sphere(anchor, target, getMaxBlocks(player));
    },
    getShellPositions(anchor, target, player) {
        return shellSphere(anchor, target, getMaxBlocks(player));
    },

    getBounds(anchor, target) {
        const dx = target.x - anchor.x;
        const dy = target.y - anchor.y;
        const dz = target.z - anchor.z;
        const r  = Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz));
        return radiusBounds(anchor, r, r, r);
    },
};
