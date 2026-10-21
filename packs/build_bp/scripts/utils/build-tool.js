// A building tool is in hand when the player is actually building (F7): the Building Book or the Tutorial Book, Copy /
// Paste mode (an empty hand is still a valid paste), or a placeable block or digging tool while a build mode is on or a
// Mirror, Array or Radial modifier is (the arms show where hand-placed blocks go). A survival player holding dirt with
// building off holds no tool, so the preview loops stay asleep. An anchor alone is not a tool either (F8: the anchor is
// kept while the player holds something else, it is just not drawn).
import { BlockPermutation } from "@minecraft/server";
import { getState, anyModifierEnabled } from "../core/PlayerState.js";
import { isDiggingTool } from "../core/BlockDestroyer.js";
import { handTypeId, BOOK_ID, LEGACY_BOOK_ID, TUTORIAL_BOOK_ID } from "./Items.js";

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
    const typeId = handTypeId(player);
    if (typeId === BOOK_ID || typeId === LEGACY_BOOK_ID || typeId === TUTORIAL_BOOK_ID) return true;
    let state = null;
    try { state = getState(player); } catch { state = null; }
    if (state?.mode === "copy_paste") return true;
    if (!typeId) return false;
    if (!isDiggingTool(typeId) && !placeable(typeId)) return false;
    if (state && state.mode !== "disable") return true;
    try { return anyModifierEnabled(player); } catch { return false; }
}
