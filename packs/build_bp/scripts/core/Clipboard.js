// @ts-nocheck
import { BlockPermutation } from "@minecraft/server";
import { getState } from "./PlayerState.js";
import { isCreative, countBlocks, removeBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { getMaxBlocks, getUndoThreshold, getReplaceBlocks } from "./Settings.js";
import { captureSnapshot, recordSnapshot } from "./UndoRedo.js";
import { enqueue } from "./PlacementQueue.js";
import { ALWAYS_REPLACEABLE, UNPLACEABLE } from "./BlockPlacer.js";
import { rotateStates } from "../utils/BlockStates.js";
import { applyModifiersToEntries } from "./ModifierPipeline.js";
import { deleteSlot } from "../utils/ClipboardStore.js";
import { filterSafeZonePositions, inSafeZoneAt, isBuildBlockedForPlayer } from "./Protection.js";
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
        const add = chargeUnits(entry.typeId, entry.permStates)
            + (pair >= 0 ? chargeUnits(entries[pair].typeId, entries[pair].permStates) : 0);
        if (items + Math.max(add, pair >= 0 ? 1 : 0) > cap) break;
        const group = out.length + 1;
        if (pair >= 0) {
            out.push({ ...entry, _bedGroup: group }, { ...entries[pair], _bedGroup: group });
            used.add(pair);
        } else {
            out.push(entry);
        }
        used.add(i);
        items += add;
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

export function captureClipboard(player, corner1, corner2) {
    const dim = player.dimension;
    const dimId = dim.id;
    const yMin = dimId === "minecraft:nether" || dimId === "minecraft:the_end" ? 0 : -64;
    const yMax = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
    const x1 = Math.min(corner1.x, corner2.x), x2 = Math.max(corner1.x, corner2.x);
    const y1 = Math.max(yMin, Math.min(corner1.y, corner2.y)), y2 = Math.min(yMax, Math.max(corner1.y, corner2.y));
    const z1 = Math.min(corner1.z, corner2.z), z2 = Math.max(corner1.z, corner2.z);
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

export function cutAndCapture(player, corner1, corner2) {
    if (isBuildBlockedForPlayer(player, true)) return 0;
    const dim = player.dimension;
    if (!isOp(player) && get("safeZonesOperatorsOnly") === true) {
        const x1 = Math.min(corner1.x, corner2.x), x2 = Math.max(corner1.x, corner2.x);
        const z1 = Math.min(corner1.z, corner2.z), z2 = Math.max(corner1.z, corner2.z);
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
    clipboard.isCut = !creative;
    const x1  = Math.min(corner1.x, corner2.x);
    const y1  = Math.min(corner1.y, corner2.y);
    const z1  = Math.min(corner1.z, corner2.z);
    const cutPositions = clipboard.blocks.map(b => ({ x: x1 + b.dx, y: y1 + b.dy, z: z1 + b.dz }));
    const undoThreshold = getUndoThreshold(player);
    const snapshot = captureSnapshot(dim, cutPositions, "minecraft:air", {}, null, undoThreshold);
    if (snapshot) {
        snapshot.isCutSource = true;
        recordSnapshot(player, snapshot);
    }
    for (const b of clipboard.blocks) {
        try {
            const block = dim.getBlock({ x: x1 + b.dx, y: y1 + b.dy, z: z1 + b.dz });
            if (block && !block.isAir) block.setType("minecraft:air");
        } catch { }
    }
    return count;
}

export function executePaste(player, origin) {
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

    const dimId         = dim.id;
    const yMin          = dimId === "minecraft:nether" || dimId === "minecraft:the_end" ? 0 : -64;
    const yMax          = dimId === "minecraft:nether" ? 127 : dimId === "minecraft:the_end" ? 255 : 319;
    let entries = filterSafeZonePositions(
        player,
        dim.id,
        applyModifiersToEntries(player, getRotatedEntries(clipboard, origin, pasteFacing)),
        true
    )
        .filter(e => {
            if (e.pos.y < yMin || e.pos.y > yMax) return false;
            if (UNPLACEABLE.has(e.typeId)) return false;
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

    recordSnapshot(player, snapshot);

    if (isCut && !creative) {
        if (typeof clipboard.originSlot === "number") deleteSlot(player, clipboard.originSlot);
        state.clipboard = null;
    }
    return entries.length;
}
