// @ts-nocheck
import { lineBetween } from "../utils/GeometryUtils.js";
import { getMaxBlocks } from "../core/Settings.js";
export const DiagonalLineMode = {
    getPositions(anchor, target, player, secondAnchor, opts) {
        return lineBetween(anchor, target, opts?.cap ?? getMaxBlocks(player));
    },
};
