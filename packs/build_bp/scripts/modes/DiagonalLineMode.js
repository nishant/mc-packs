// @ts-nocheck
import { lineBetween } from "../utils/GeometryUtils.js";
import { getMaxBlocks } from "../core/Settings.js";
export const DiagonalLineMode = {
    getPositions(anchor, target, player) {
        return lineBetween(anchor, target, getMaxBlocks(player));
    },
};
