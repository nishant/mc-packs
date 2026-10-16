// @ts-nocheck
import { fillAABB, shellAABB, skeletonAABB, FACE_OFFSETS } from "../utils/GeometryUtils.js";
import { getModeOption }                                   from "../utils/ModeOptions.js";
import { getMaxBlocks }                                     from "../core/Settings.js";
export const CubeMode = {
    previewOutline: true,
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
        const cap = getMaxBlocks(player);
        const p1 = { x: anchor.x, y: anchor.y, z: anchor.z };
        const p2 = secondAnchor
            ? { x: secondAnchor.x, y: target.y, z: secondAnchor.z }
            : { x: target.x,       y: anchor.y, z: target.z };
        if (!secondAnchor) return fillAABB(p1, p2, cap);
        const fill = getModeOption(player, "cube", "fill");
        if (fill === "hollow")   return shellAABB(p1, p2, cap);
        if (fill === "skeleton") return skeletonAABB(p1, p2, cap);
        return fillAABB(p1, p2, cap);
    },
    getShellPositions(anchor, target, player, secondAnchor) {
        if (!secondAnchor) return null;
        const cap = getMaxBlocks(player);
        const p1 = { x: anchor.x,       y: anchor.y, z: anchor.z };
        const p2 = { x: secondAnchor.x, y: target.y, z: secondAnchor.z };
        const fill = getModeOption(player, "cube", "fill");
        if (fill === "skeleton") return skeletonAABB(p1, p2, cap);
        return shellAABB(p1, p2, cap);
    },
};
