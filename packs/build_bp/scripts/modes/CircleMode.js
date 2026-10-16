// @ts-nocheck
import {
    circleXZ, hollowCircleXZ,
    ellipseXZ, hollowEllipseXZ,
    radiusBounds,
} from "../utils/GeometryUtils.js";
import { getModeOption } from "../utils/ModeOptions.js";
import { getMaxBlocks }  from "../core/Settings.js";
export const CircleMode = {
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
        const cap   = getMaxBlocks(player);
        const fill  = getModeOption(player, "circle", "fill");
        const shape = getModeOption(player, "circle", "shape");
        const dx    = target.x - anchor.x;
        const dz    = target.z - anchor.z;
        if (shape === "uneven") {
            const rx = Math.abs(dx);
            const rz = Math.abs(dz);
            return fill === "hollow"
                ? hollowEllipseXZ(anchor.x, anchor.y, anchor.z, rx, rz, cap)
                : ellipseXZ(anchor.x, anchor.y, anchor.z, rx, rz, cap);
        }
        const r = Math.sqrt(dx * dx + dz * dz);
        return fill === "hollow"
            ? hollowCircleXZ(anchor.x, anchor.y, anchor.z, r, cap)
            : circleXZ(anchor.x, anchor.y, anchor.z, r, cap);
    },

    getBounds(anchor, target, player) {
        const dx = target.x - anchor.x;
        const dz = target.z - anchor.z;
        if (getModeOption(player, "circle", "shape") === "uneven") {
            return radiusBounds(anchor, Math.abs(dx), 0, Math.abs(dz));
        }
        const r = Math.floor(Math.sqrt(dx * dx + dz * dz));
        return radiusBounds(anchor, r, 0, r);
    },
};
