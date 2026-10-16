// @ts-nocheck
import {
    cylinder, hollowCylinder,
    ellipseCylinder, hollowEllipseCylinder,
    FACE_OFFSETS,
} from "../utils/GeometryUtils.js";
import { getConstrainedTarget } from "../utils/ViewUtils.js";
import { getModeOption }        from "../utils/ModeOptions.js";
import { getMaxBlocks }         from "../core/Settings.js";
export const CylinderMode = {
    previewOutline: true,
    steps: 3,
    getTarget(player, anchor) {
        if (!player || !anchor) return null;
        const shape = getModeOption(player, "cylinder", "shape");
        if (shape === "uneven") {
            try {
                const hit = player.getBlockFromViewDirection({
                    maxDistance: 64,
                    includePassableBlocks: false,
                });
                if (hit?.block) {
                    const loc = hit.block.location;
                    const off = FACE_OFFSETS[hit.face] ?? { x: 0, y: 1, z: 0 };
                    if (loc.y + off.y === anchor.y) {
                        return {
                            x: loc.x + off.x,
                            y: anchor.y,
                            z: loc.z + off.z,
                        };
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
        }
        return getConstrainedTarget(player, anchor, player.getRotation().y);
    },
    getPositions(anchor, target, player, secondAnchor) {
        const cap   = getMaxBlocks(player);
        const fill  = getModeOption(player, "cylinder", "fill");
        const shape = getModeOption(player, "cylinder", "shape");
        if (shape === "uneven") {
            if (secondAnchor) {
                const t = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
                return fill === "hollow"
                    ? hollowEllipseCylinder(anchor, t, cap)
                    : ellipseCylinder(anchor, t, cap);
            }
            return ellipseCylinder(anchor, { x: target.x, y: anchor.y, z: target.z }, cap);
        }
        if (secondAnchor) {
            const t = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
            return fill === "hollow" ? hollowCylinder(anchor, t, cap) : cylinder(anchor, t, cap);
        }
        return cylinder(anchor, { x: target.x, y: anchor.y, z: target.z }, cap);
    },
    getShellPositions(anchor, target, player, secondAnchor) {
        if (!secondAnchor) return null;
        const cap   = getMaxBlocks(player);
        const shape = getModeOption(player, "cylinder", "shape");
        const t = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
        return shape === "uneven"
            ? hollowEllipseCylinder(anchor, t, cap)
            : hollowCylinder(anchor, t, cap);
    },

    getBounds(anchor, target, player, secondAnchor) {
        const radiusPoint = secondAnchor ?? target;
        const dx = radiusPoint.x - anchor.x;
        const dz = radiusPoint.z - anchor.z;
        let rx, rz;
        if (getModeOption(player, "cylinder", "shape") === "uneven") {
            rx = Math.abs(dx); rz = Math.abs(dz);
        } else {
            rx = rz = Math.floor(Math.sqrt(dx * dx + dz * dz));
        }
        const topY = secondAnchor ? target.y : anchor.y;
        return {
            minX: anchor.x - rx,            maxX: anchor.x + rx,
            minY: Math.min(anchor.y, topY), maxY: Math.max(anchor.y, topY),
            minZ: anchor.z - rz,            maxZ: anchor.z + rz,
        };
    },
};
