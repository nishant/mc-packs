// A building tool is a book, a pickaxe/axe/shovel, a placeable block, or copy/paste
// (an empty hand is still a valid paste). An anchor alone is not a tool: the preview
// must notice a lost tool and clear it.
import { BlockPermutation } from "@minecraft/server";
import { getState } from "../core/PlayerState.js";
import { isDiggingTool } from "../core/BlockDestroyer.js";
import { heldItemCached, isBook, isTutorialBook } from "./Items.js";

/** @type {Set<string>} */
const placeableIds = new Set();
/** @type {Set<string>} */
const unplaceableIds = new Set();

/** @param {string} typeId */
function placeable(typeId) {
    if (!typeId || typeId.startsWith("eb:") || typeId.startsWith("realm:")) return false;
    if (placeableIds.has(typeId)) return true;
    if (unplaceableIds.has(typeId)) return false;
    try {
        BlockPermutation.resolve(typeId);
        placeableIds.add(typeId);
        return true;
    } catch {
        unplaceableIds.add(typeId);
        return false;
    }
}

/** @param {import("@minecraft/server").Player} player */
export function holdsBuildTool(player) {
    let state = null;
    try { state = getState(player); } catch { state = null; }
    const item = heldItemCached(player, 0);
    if (isBook(item) || isTutorialBook(item)) return true;
    if (item && isDiggingTool(item.typeId)) return true;
    if (state?.mode === "copy_paste") return true;
    if (item && placeable(item.typeId)) return true;
    return false;
}
