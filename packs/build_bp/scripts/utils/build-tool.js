// A building tool is a book, a pickaxe/axe/shovel, a placeable block, or any item while
// copy/paste is on. An anchor already set is an in-progress build and keeps the preview up.
import { BlockPermutation } from "@minecraft/server";
import { getState } from "../core/PlayerState.js";
import { isDiggingTool } from "../core/BlockDestroyer.js";
import { heldItem, isBook, isTutorialBook } from "./Items.js";

const placeableIds = new Set();

function placeable(typeId) {
    if (!typeId || typeId.startsWith("eb:") || typeId.startsWith("realm:")) return false;
    if (placeableIds.has(typeId)) return true;
    try {
        BlockPermutation.resolve(typeId);
        placeableIds.add(typeId);
        return true;
    } catch {
        return false;
    }
}

export function holdsBuildTool(player) {
    let state = null;
    try { state = getState(player); } catch { state = null; }
    if (state && state.mode !== "disable" && state.anchor) return true;
    const item = heldItem(player);
    if (isBook(item) || isTutorialBook(item)) return true;
    if (item && isDiggingTool(item.typeId)) return true;
    if (state?.mode === "copy_paste" && item) return true;
    if (item && placeable(item.typeId)) return true;
    return false;
}
