// @ts-nocheck
import { cone, hollowCone, diagonalCone, hollowDiagonalCone } from "../utils/GeometryUtils.js";
import { getConstrainedTarget, getFreeTarget } from "../utils/ViewUtils.js";
import { getModeOption }        from "../utils/ModeOptions.js";
import { getMaxBlocks }         from "../core/Settings.js";
export const ConeMode = {
    previewOutline: true,
    steps: 3,
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        return getConstrainedTarget(player, anchor, player.getRotation().y);
    },

    getStep3Target(player, anchor, secondAnchor) {
        if (getModeOption(player, "cone", "axis") !== "diagonal") return null;
        return getFreeTarget(player);
    },
    getPositions(anchor, target, player, secondAnchor) {
        const cap  = getMaxBlocks(player);
        const fill = getModeOption(player, "cone", "fill");
        const axis = getModeOption(player, "cone", "axis");
        if (secondAnchor) {
            if (axis === "diagonal") {
                return fill === "hollow"
                    ? hollowDiagonalCone(anchor, secondAnchor, target, cap)
                    : diagonalCone(anchor, secondAnchor, target, cap);
            }
            const t = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
            return fill === "hollow" ? hollowCone(anchor, t, cap) : cone(anchor, t, cap);
        }
        return cone(anchor, { x: target.x, y: anchor.y, z: target.z }, cap);
    },
    getShellPositions(anchor, target, player, secondAnchor) {
        if (!secondAnchor) return null;
        const cap = getMaxBlocks(player);
        if (getModeOption(player, "cone", "axis") === "diagonal") {
            return hollowDiagonalCone(anchor, secondAnchor, target, cap);
        }
        const t = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
        return hollowCone(anchor, t, cap);
    },
    getBounds(anchor, target, player, secondAnchor) {
        const radiusPoint = secondAnchor ?? target;
        const dx = radiusPoint.x - anchor.x;
        const dz = radiusPoint.z - anchor.z;
        const r  = Math.floor(Math.sqrt(dx * dx + dz * dz));
        const diagonal = getModeOption(player, "cone", "axis") === "diagonal";
        let apex = !secondAnchor
            ? { x: anchor.x, y: anchor.y, z: anchor.z }
            : diagonal
                ? target
                : { x: anchor.x, y: target.y, z: anchor.z };

        if (Math.round(apex.y) === Math.round(anchor.y)) {
            apex = { x: anchor.x, y: anchor.y, z: anchor.z };
        }

        return {
            minX: Math.min(anchor.x - r, apex.x), maxX: Math.max(anchor.x + r, apex.x),
            minY: Math.min(anchor.y, apex.y),     maxY: Math.max(anchor.y, apex.y),
            minZ: Math.min(anchor.z - r, apex.z), maxZ: Math.max(anchor.z + r, apex.z),
        };
    },
};
