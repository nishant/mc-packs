// @ts-nocheck
import { BlockPermutation, system } from "@minecraft/server";
import { getState } from "./PlayerState.js";
import { isCreative, countBlocks, removeBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { getMaxBlocks, getUndoThreshold, getReplaceBlocks, getAllowDestroy, getDestroyCreativeOnly } from "./Settings.js";
import { captureSnapshot, recordSnapshot } from "./UndoRedo.js";
import { enqueue } from "./PlacementQueue.js";
import { reportPlaced } from "../utils/PlacedReport.js";
import { ALWAYS_REPLACEABLE, UNPLACEABLE } from "./BlockPlacer.js";
import { rotateStates } from "../utils/BlockStates.js";
import { applyModifiersToEntries } from "./ModifierPipeline.js";
import { deleteSlot, fitsInSlot } from "../utils/ClipboardStore.js";
import { filterAllowedPositionsAsync, inSafeZoneAt, isBuildBlockedForPlayer } from "./Protection.js";
import { UNBREAKABLE } from "./BlockDestroyer.js";
import { bedPartnerPos, chargeUnits, dropIncompleteBeds, isBedType } from "./beds.js";
import { isOp } from "../utils/Permissions.js";
import { get } from "../settings.js";
import { lockActionBar } from "../utils/ActionBar.js";

export function yawToFacingIndex(yaw) {
    const y = ((yaw % 360) + 360) % 360;
    return Math.round(y / 90) % 4;
}

function rotateOffset(dx, dz, n) {
    switch (n & 3) {
        case 0:  return { dx,       dz       };
        case 1:  return { dx: -dz,  dz:  dx  };
        case 2:  return { dx: -dx,  dz: -dz  };
        default: return { dx:  dz,  dz: -dx  };
    }
}

function samePos(a, b) {
    return a.x === b.x && a.y === b.y && a.z === b.z;
}
function trimPasteEntries(entries, cap) {
    const out = [];
    const used = new Set();
    let items = 0;
    for (let i = 0; i < entries.length; i++) {
        if (used.has(i)) continue;
        const entry = entries[i];
        const partner = isBedType(entry.typeId) ? bedPartnerPos(entry.pos, entry.permStates) : null;
        let pair = -1;
        if (partner) {
            for (let j = 0; j < entries.length; j++) {
                if (j === i || used.has(j)) continue;
                if (entries[j].typeId === entry.typeId && samePos(entries[j].pos, partner)) { pair = j; break; }
            }
        }
        if (isBedType(entry.typeId) && pair < 0) { used.add(i); continue; }
        const blocks = pair >= 0 ? 2 : 1;
        if (items + blocks > cap) break;
        const group = out.length + 1;
        if (pair >= 0) {
            const head = entry.permStates?.head_piece_bit === true;
            const other = entries[pair];
            const otherHead = other.permStates?.head_piece_bit === true;
            out.push(
                { ...entry, _bedGroup: group, _bedHead: head, _bedItems: head ? 0 : 1, _bedBlocks: 1 },
                { ...other, _bedGroup: group, _bedHead: otherHead, _bedItems: otherHead ? 0 : 1, _bedBlocks: 1 },
            );
            used.add(pair);
        } else {
            out.push(entry);
        }
        used.add(i);
        items += blocks;
    }
    return out;
}
export function getRotatedEntries(clipboard, origin, pasteFacingIdx) {
    const n = (pasteFacingIdx - clipboard.captureFacing + 4) & 3;
    return clipboard.blocks.map(b => {
        const { dx, dz } = rotateOffset(b.dx, b.dz, n);
        return {
            pos:        { x: origin.x + dx, y: origin.y + b.dy, z: origin.z + dz },
            typeId:     b.typeId,
            permStates: n ? rotateStates(b.permStates, n) : b.permStates,
        };
    });
}

function dimYRange(dimId) {
    const yMin = dimId === "minecraft:nether" || dimId === "minecraft:the_end" ? 0 : -64;
    const yMax = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
    return { yMin, yMax };
}

/** The box both corners span, with y clamped to the dimension (what capture and cut really read). */
export function boxBounds(dimId, corner1, corner2) {
    const { yMin, yMax } = dimYRange(dimId);
    return {
        x1: Math.min(corner1.x, corner2.x), x2: Math.max(corner1.x, corner2.x),
        y1: Math.max(yMin, Math.min(corner1.y, corner2.y)), y2: Math.min(yMax, Math.max(corner1.y, corner2.y)),
        z1: Math.min(corner1.z, corner2.z), z2: Math.max(corner1.z, corner2.z),
    };
}

export function boxVolume(dimId, corner1, corner2) {
    const b = boxBounds(dimId, corner1, corner2);
    return Math.max(0, b.x2 - b.x1 + 1) * Math.max(0, b.y2 - b.y1 + 1) * Math.max(0, b.z2 - b.z1 + 1);
}

/** A copy or cut may read at most the player's block limit (getMaxBlocks) cells: a paste is trimmed to it anyway. */
export function copyLimit(player) {
    return getMaxBlocks(player);
}

/** True (and tells the player on the action bar) when the box is over the copy limit. */
export function copyTooBig(player, corner1, corner2, notify = true) {
    const vol = boxVolume(player.dimension.id, corner1, corner2);
    const cap = copyLimit(player);
    if (vol <= cap) return false;
    if (notify) {
        // Often called from a before event, where the action bar is read-only.
        system.run(() => {
            try {
                lockActionBar(player.id, 2500);
                player.onScreenDisplay.setActionBar(t("eb.bar.copy_too_big", vol, cap));
            } catch { }
        });
    }
    return true;
}

export function captureClipboard(player, corner1, corner2) {
    const dim = player.dimension;
    if (boxVolume(dim.id, corner1, corner2) > copyLimit(player)) return 0;
    const { x1, x2, y1, y2, z1, z2 } = boxBounds(dim.id, corner1, corner2);
    const blocks = [];
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
            for (let z = z1; z <= z2; z++) {
                try {
                    const block = dim.getBlock({ x, y, z });
                    if (!block || block.isAir) continue;
                    blocks.push({
                        dx: x - x1,
                        dy: y - y1,
                        dz: z - z1,
                        typeId:     block.typeId,
                        permStates: block.permutation.getAllStates(),
                    });
                } catch { }
            }
    if (!blocks.length) { getState(player).clipboard = null; return 0; }
    getState(player).clipboard = {
        blocks,
        version:       Date.now(),
        captureFacing: yawToFacingIndex(player.getRotation().y),
        dims:          { x: x2 - x1 + 1, y: y2 - y1 + 1, z: z2 - z1 + 1 },
    };
    return blocks.length;
}

function hasInventory(block) {
    try { return !!block.getComponent("minecraft:inventory"); } catch { return false; }
}

export async function cutAndCapture(player, corner1, corner2) {
    if (isBuildBlockedForPlayer(player, true)) return 0;
    if (!getAllowDestroy()) { try { player.sendMessage(t("eb.destroy.disabled")); } catch { } return 0; }
    if (getDestroyCreativeOnly() && !isCreative(player)) { try { player.sendMessage(t("eb.destroy.creative_only")); } catch { } return 0; }
    const dim = player.dimension;
    const { x1, y1, z1, x2, z2 } = boxBounds(dim.id, corner1, corner2);
    if (!isOp(player) && get("safeZonesOperatorsOnly") === true) {
        for (let x = x1; x <= x2; x++) {
            for (let z = z1; z <= z2; z++) {
                const zHit = inSafeZoneAt(dim.id, x, z);
                if (zHit) {
                    try { player.sendMessage(`§c[EB] You cannot cut inside safe zone "${zHit.name}".`); } catch {}
                    return 0;
                }
            }
        }
    }
    const count = captureClipboard(player, corner1, corner2);
    if (count === 0) return 0;
    const state     = getState(player);
    const clipboard = state.clipboard;
    const creative  = isCreative(player);

    // Bedrock, spawners and the like stay put, and so do containers in survival (the clipboard keeps no contents).
    const asked = [];
    for (const b of clipboard.blocks) {
        if (UNBREAKABLE.has(b.typeId)) continue;
        const pos = { x: x1 + b.dx, y: y1 + b.dy, z: z1 + b.dz };
        if (!creative) {
            try {
                const block = dim.getBlock(pos);
                if (block && hasInventory(block)) continue;
            } catch { }
        }
        asked.push({ ...pos, _b: b });
    }
    // Land Claims: cells in someone else's claim are neither cut nor copied.
    const allowed = await filterAllowedPositionsAsync(player, dim.id, asked, true);
    if (!player.isValid || state.clipboard !== clipboard) return 0;
    const cutPositions = [];
    const cutBlocks = [];
    for (const a of allowed ?? []) {
        try {
            const block = dim.getBlock(a);
            if (!block || block.typeId !== a._b.typeId) continue;
        } catch { continue; }
        cutPositions.push({ x: a.x, y: a.y, z: a.z });
        cutBlocks.push(a._b);
    }
    if (!cutBlocks.length) { state.clipboard = null; return 0; }
    // A survival cut destroys the source blocks: it must be savable, or leaving would lose them for good.
    if (!creative && !fitsInSlot(cutBlocks)) {
        state.clipboard = null;
        try { player.sendMessage(t("eb.clipboard.cut_too_big_to_keep")); } catch { }
        return 0;
    }
    clipboard.blocks = cutBlocks;
    clipboard.isCut = !creative;
    clipboard.cutId = clipboard.version;
    const undoThreshold = getUndoThreshold(player);
    const snapshot = captureSnapshot(dim, cutPositions, "minecraft:air", {}, null, undoThreshold);
    if (snapshot) {
        snapshot.isCutSource = true;
        snapshot.survival = !creative;
        snapshot.cutId = clipboard.cutId;
        recordSnapshot(player, snapshot);
    }
    for (const pos of cutPositions) {
        try {
            const block = dim.getBlock(pos);
            if (block && !block.isAir) block.setType("minecraft:air");
        } catch { }
    }
    return cutBlocks.length;
}

export async function executePaste(player, origin) {
    if (isBuildBlockedForPlayer(player, true)) return 0;
    const state = getState(player);
    if (!state.clipboard?.blocks?.length) return 0;
    const { clipboard } = state;
    const isCut         = clipboard.isCut === true;
    const dim           = player.dimension;
    const creative      = isCreative(player);
    const cap           = getMaxBlocks(player);
    const pasteFacing   = yawToFacingIndex(player.getRotation().y);

    const replaceBlocks = creative && getReplaceBlocks(player);

    const { yMin, yMax } = dimYRange(dim.id);
    // Safe zones and Land Claims, like every other way of building.
    const allowedEntries = await filterAllowedPositionsAsync(
        player,
        dim.id,
        applyModifiersToEntries(player, getRotatedEntries(clipboard, origin, pasteFacing)),
        true
    );
    // The claims answer can take a few ticks: the player or the clipboard may be gone by now.
    if (!player.isValid || getState(player).clipboard !== clipboard) return 0;
    let entries = allowedEntries
        .filter(e => {
            if (e.pos.y < yMin || e.pos.y > yMax) return false;
            if (UNPLACEABLE.has(e.typeId)) return false;
            if (!creative && UNBREAKABLE.has(e.typeId)) return false;
            try {
                const block = dim.getBlock(e.pos);
                if (!block) return true;
                const existing = block.typeId;
                if (!creative && existing === "minecraft:bedrock") return false;
                if (!replaceBlocks && !ALWAYS_REPLACEABLE.has(existing)) return false;
                return true;
            } catch { return true; }
        })
        .sort((a, b) => a.pos.y - b.pos.y);
    entries = trimPasteEntries(entries, cap);

    if (!creative && !isCut) {
        const needed = new Map();
        for (const e of entries) {
            const units = chargeUnits(e.typeId, e.permStates);
            if (units > 0) needed.set(e.typeId, (needed.get(e.typeId) ?? 0) + units);
        }
        const available = new Map();
        for (const [tid] of needed) available.set(tid, countBlocks(player, tid));
        let totalAvailable = 0;
        for (const [tid, count] of needed) totalAvailable += Math.min(available.get(tid) ?? 0, count);
        if (totalAvailable <= 0) { player.sendMessage(t("eb.place.no_blocks")); return 0; }
        if (totalAvailable < entries.length) {
            player.sendMessage(t("eb.place.limited_blocks", totalAvailable));
            const remaining = new Map(available);
            entries = dropIncompleteBeds(entries.filter(e => {
                const units = chargeUnits(e.typeId, e.permStates);
                if (units <= 0) return true;
                const avail = remaining.get(e.typeId) ?? 0;
                if (avail <= 0) return false;
                remaining.set(e.typeId, avail - 1);
                return true;
            }));
        }
    }

    const positions     = entries.map(e => ({
        ...e.pos,
        _resolvedStates: e.permStates,
        _bedHead: isBedType(e.typeId) && e.permStates?.head_piece_bit === true,
        _bedGroup: e._bedGroup,
    }));
    const perPosTypeIds = entries.map(e => e.typeId);

    const undoThreshold = getUndoThreshold(player);
    const snapshot = captureSnapshot(
        dim, positions, entries[0]?.typeId ?? "minecraft:air", {},
        perPosTypeIds, undoThreshold,
    );
    if (snapshot) snapshot.survival = !creative && !isCut;
    if (!snapshot) {
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(
            undoThreshold === 0
                ? t("eb.place.undo_disabled")
                : t("eb.place.too_large_to_undo", undoThreshold),
        );
    }

    for (const e of entries) {
        try {
            let perm = BlockPermutation.resolve(e.typeId);
            for (const [k, v] of Object.entries(e.permStates)) {
                try { perm = perm.withState(k, v); } catch {}
            }
            enqueue(player.id, dim.id, e.pos, perm);
        } catch { }
    }

    if (!creative && !isCut) {
        const consumed = new Map();
        for (const e of entries) {
            const units = chargeUnits(e.typeId, e.permStates);
            if (units > 0) consumed.set(e.typeId, (consumed.get(e.typeId) ?? 0) + units);
        }
        for (const [tid, count] of consumed) removeBlocks(player, tid, count);
    }

    reportPlaced(dim.id, entries.map((e) => e.pos));
    recordSnapshot(player, snapshot);

    if (isCut && !creative) {
        if (typeof clipboard.originSlot === "number") deleteSlot(player, clipboard.originSlot);
        state.clipboard = null;
    }
    return entries.length;
}
