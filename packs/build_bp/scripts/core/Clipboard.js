// @ts-nocheck
import { BlockPermutation, system } from "@minecraft/server";
import { getState } from "./PlayerState.js";
import { isCreative, countBlocks, removeBlocks } from "../utils/InventoryUtils.js";
import { t } from "../utils/Text.js";
import { getMaxBlocks, getUndoThreshold, getReplaceBlocks, getAllowDestroy, getDestroyCreativeOnly } from "./Settings.js";
import { snapshotJob, recordSnapshot, pack, trackWrites } from "./UndoRedo.js";
import { sliceDue, runJobAsync, ownerHere, inTurn } from "./TickBudget.js";
import { enqueue, cancelQueued } from "./PlacementQueue.js";
import { reportPlacedJob } from "../utils/PlacedReport.js";
import { ALWAYS_REPLACEABLE, UNPLACEABLE } from "./BlockPlacer.js";
import { rotateStates } from "../utils/BlockStates.js";
import { applyModifiersToEntries } from "./ModifierPipeline.js";
import { deleteSlot, fitsInSlot } from "../utils/ClipboardStore.js";
import { filterAllowedPositionsAsync, inSafeZoneAt, isBuildBlockedForPlayer, safeZonesIn } from "./Protection.js";
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
/** getRotatedEntries a slice a tick, for a paste (a 50,000-block clipboard is a lot of objects for one tick). */
function* rotatedJob(clipboard, origin, pasteFacingIdx) {
    const n = (pasteFacingIdx - clipboard.captureFacing + 4) & 3;
    const out = new Array(clipboard.blocks.length);
    for (let i = 0; i < clipboard.blocks.length; i++) {
        if (sliceDue()) yield;
        const b = clipboard.blocks[i];
        const { dx, dz } = rotateOffset(b.dx, b.dz, n);
        out[i] = {
            pos:        { x: origin.x + dx, y: origin.y + b.dy, z: origin.z + dz },
            typeId:     b.typeId,
            permStates: n ? rotateStates(b.permStates, n) : b.permStates,
        };
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

const AIR_ID = "minecraft:air";
let airPerm = null;
function air() {
    if (!airPerm) airPerm = BlockPermutation.resolve(AIR_ID);
    return airPerm;
}

function hasInventory(block) {
    try { return !!block.getComponent("minecraft:inventory"); } catch { return false; }
}

/**
 * Reads the box for a copy or cut in a job, a slice a tick (BSE-01): per cell one getBlock and one typeId, and the
 * states only for a block (2 to 4 native calls; it was 5). With `withInventory`, the indexes of blocks with an
 * inventory are noted too (a survival cut leaves them). Returns null when the owner left, died or changed dimension.
 */
function* captureJob(player, dimId, corner1, corner2, withInventory) {
    if (!ownerHere(player, dimId)) return null;
    const dim = player.dimension;
    if (boxVolume(dimId, corner1, corner2) > copyLimit(player)) return null;
    let yaw = 0;
    try { yaw = player.getRotation().y; } catch { }
    const { x1, x2, y1, y2, z1, z2 } = boxBounds(dimId, corner1, corner2);
    const blocks = [];
    const inv = withInventory ? new Set() : null;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++)
            for (let z = z1; z <= z2; z++) {
                if (sliceDue()) {
                    yield;
                    if (!ownerHere(player, dimId)) return null;
                }
                try {
                    const block = dim.getBlock({ x, y, z });
                    if (!block) continue;
                    const typeId = block.typeId;
                    if (typeId === AIR_ID) continue;
                    if (inv && hasInventory(block)) inv.add(blocks.length);
                    blocks.push({
                        dx: x - x1,
                        dy: y - y1,
                        dz: z - z1,
                        typeId,
                        permStates: block.permutation.getAllStates(),
                    });
                } catch { }
            }
    return { blocks, inv, yaw, dimId, x1, x2, y1, y2, z1, z2 };
}

function setClipboard(player, cap) {
    if (!cap.blocks.length) { getState(player).clipboard = null; return 0; }
    getState(player).clipboard = {
        blocks:        cap.blocks,
        version:       Date.now(),
        captureFacing: yawToFacingIndex(cap.yaw),
        dims:          { x: cap.x2 - cap.x1 + 1, y: cap.y2 - cap.y1 + 1, z: cap.z2 - cap.z1 + 1 },
    };
    return cap.blocks.length;
}

/** Copies the box into the player's clipboard; resolves with the number of blocks copied. */
export async function captureClipboard(player, corner1, corner2) {
    const dimId = player.dimension.id;
    const cap = await inTurn(player.id, () => runJobAsync(captureJob(player, dimId, corner1, corner2, false)));
    if (!cap || !ownerHere(player, cap.dimId)) return 0;
    return setClipboard(player, cap);
}

export async function cutAndCapture(player, corner1, corner2) {
    if (isBuildBlockedForPlayer(player, true)) return 0;
    if (!getAllowDestroy()) { try { player.sendMessage(t("eb.destroy.disabled")); } catch { } return 0; }
    if (getDestroyCreativeOnly() && !isCreative(player)) { try { player.sendMessage(t("eb.destroy.creative_only")); } catch { } return 0; }
    const dim = player.dimension;
    const dimId = dim.id;
    const { x1, y1, z1, x2, z2 } = boxBounds(dim.id, corner1, corner2);
    if (!isOp(player) && get("safeZonesOperatorsOnly") === true) {
        const zones = safeZonesIn(dim.id);
        if (zones.length) {
            for (let x = x1; x <= x2; x++) {
                for (let z = z1; z <= z2; z++) {
                    const zHit = inSafeZoneAt(dim.id, x, z, zones);
                    if (zHit) {
                        try { player.sendMessage(`§c[EB] You cannot cut inside safe zone "${zHit.name}".`); } catch {}
                        return 0;
                    }
                }
            }
        }
    }
    const creative = isCreative(player);
    const cap = await inTurn(player.id, () => runJobAsync(captureJob(player, dimId, corner1, corner2, !creative)));
    if (!cap || !ownerHere(player, dimId)) return 0;
    const count = setClipboard(player, cap);
    if (count === 0) return 0;
    const state     = getState(player);
    const clipboard = state.clipboard;

    // Bedrock, spawners and the like stay put, and so do containers in survival (the clipboard keeps no contents).
    const asked = [];
    await runJobAsync((function* () {
        for (let i = 0; i < clipboard.blocks.length; i++) {
            if (sliceDue()) yield;
            const b = clipboard.blocks[i];
            if (UNBREAKABLE.has(b.typeId)) continue;
            if (cap.inv?.has(i)) continue;
            asked.push({ x: x1 + b.dx, y: y1 + b.dy, z: z1 + b.dz, _b: b });
        }
    })());
    if (!ownerHere(player, dimId) || state.clipboard !== clipboard) return 0;
    // Land Claims: cells in someone else's claim are neither cut nor copied.
    const allowed = await filterAllowedPositionsAsync(player, dim.id, asked, true);
    if (!ownerHere(player, dimId) || state.clipboard !== clipboard) return 0;
    const cutPositions = [];
    const cutBlocks = [];
    await runJobAsync((function* () {
        for (const a of allowed ?? []) {
            if (sliceDue()) yield;
            // What the cell held comes from the clipboard: the undo snapshot reads nothing again.
            cutPositions.push({ x: a.x, y: a.y, z: a.z, _bt: pack(a._b.typeId), _bs: a._b.permStates, _t: a._b.typeId });
            cutBlocks.push(a._b);
        }
    })());
    if (!ownerHere(player, dimId) || state.clipboard !== clipboard) return 0;
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
    const snapshot = await runJobAsync(snapshotJob(dim, cutPositions, "minecraft:air", {}, null, undoThreshold));
    if (!ownerHere(player, dimId) || state.clipboard !== clipboard) return 0;
    // The cells go to air through the placement queue, within the shared tick budget (it was every cell in one
    // tick). A cell that holds something else by its turn is left as it is, and an undo drops the air still waiting.
    const playerId = player.id;
    let jid;
    if (snapshot) {
        snapshot.isCutSource = true;
        snapshot.survival = !creative;
        snapshot.cutId = clipboard.cutId;
        trackWrites(snapshot, () => cancelQueued(playerId, jid));
        jid = snapshot.jid;
        recordSnapshot(player, snapshot);
    }
    await runJobAsync((function* () {
        for (const pos of cutPositions) {
            if (sliceDue()) yield;
            enqueue(playerId, dimId, { x: pos.x, y: pos.y, z: pos.z }, air(), undefined, pos._t, jid);
        }
    })());
    return cutBlocks.length;
}

/**
 * Reads the paste's cells in a job (one getBlock, one typeId and, for a non-air cell, its states: the filter and the
 * undo snapshot in one pass, BSE-01). Returns the entries that may be written, or null when the owner left, died or
 * changed dimension.
 */
function* pasteReadJob(player, dimId, allowedEntries, creative, replaceBlocks) {
    if (!ownerHere(player, dimId)) return null;
    const dim = player.dimension;
    const { yMin, yMax } = dimYRange(dimId);
    // Kept bottom layer first, as the paste writes them, in buckets by y (stable, and no sort of 50,000 entries).
    const byY = new Map();
    const keep = (e) => {
        let list = byY.get(e.pos.y);
        if (!list) { list = []; byY.set(e.pos.y, list); }
        list.push(e);
    };
    for (const e of allowedEntries) {
        if (sliceDue()) {
            yield;
            if (!ownerHere(player, dimId)) return null;
        }
        if (e.pos.y < yMin || e.pos.y > yMax) continue;
        if (UNPLACEABLE.has(e.typeId)) continue;
        if (!creative && UNBREAKABLE.has(e.typeId)) continue;
        let block, existing;
        try {
            block = dim.getBlock(e.pos);
            existing = block?.typeId;
        } catch { keep(e); continue; }
        if (existing === undefined) { keep(e); continue; }
        if (!creative && existing === "minecraft:bedrock") continue;
        if (!replaceBlocks && !ALWAYS_REPLACEABLE.has(existing)) continue;
        let states = {};
        if (existing !== AIR_ID) { try { states = block.permutation.getAllStates(); } catch { } }
        e._bt = pack(existing);
        e._bs = states;
        keep(e);
    }
    const out = [];
    for (const y of [...byY.keys()].sort((a, b) => a - b)) for (const e of byY.get(y)) out.push(e);
    return out;
}

export async function executePaste(player, origin) {
    if (isBuildBlockedForPlayer(player, true)) return 0;
    const state = getState(player);
    if (!state.clipboard?.blocks?.length) return 0;
    const { clipboard } = state;
    const isCut         = clipboard.isCut === true;
    const dim           = player.dimension;
    const dimId         = dim.id;
    const creative      = isCreative(player);
    const cap           = getMaxBlocks(player);
    const pasteFacing   = yawToFacingIndex(player.getRotation().y);

    const replaceBlocks = creative && getReplaceBlocks(player);

    // Safe zones and Land Claims, like every other way of building.
    const rotated = await runJobAsync(rotatedJob(clipboard, origin, pasteFacing));
    if (!rotated || !ownerHere(player, dimId) || getState(player).clipboard !== clipboard) return 0;
    const allowedEntries = await filterAllowedPositionsAsync(
        player,
        dim.id,
        applyModifiersToEntries(player, rotated),
        true
    );
    // The claims answer can take a few ticks: the player or the clipboard may be gone by now.
    if (!player.isValid || getState(player).clipboard !== clipboard) return 0;
    const read = await inTurn(player.id, () => runJobAsync(pasteReadJob(player, dimId, allowedEntries, creative, replaceBlocks)));
    if (!read || !ownerHere(player, dimId) || getState(player).clipboard !== clipboard) return 0;
    let entries = trimPasteEntries(read, cap);

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

    const positions     = new Array(entries.length);
    const perPosTypeIds = new Array(entries.length);
    await runJobAsync((function* () {
        for (let i = 0; i < entries.length; i++) {
            if (sliceDue()) yield;
            const e = entries[i];
            positions[i] = {
                x: e.pos.x, y: e.pos.y, z: e.pos.z,
                _resolvedStates: e.permStates,
                _bedHead: isBedType(e.typeId) && e.permStates?.head_piece_bit === true,
                _bedGroup: e._bedGroup,
                _bt: e._bt,
                _bs: e._bs,
            };
            perPosTypeIds[i] = e.typeId;
        }
    })());
    if (!ownerHere(player, dimId) || getState(player).clipboard !== clipboard) return 0;

    const undoThreshold = getUndoThreshold(player);
    const snapshot = await runJobAsync(snapshotJob(
        dim, positions, entries[0]?.typeId ?? "minecraft:air", {},
        perPosTypeIds, undoThreshold,
    ));
    if (!ownerHere(player, dimId) || getState(player).clipboard !== clipboard) return 0;
    if (snapshot) snapshot.survival = !creative && !isCut;
    if (!snapshot) {
        lockActionBar(player.id, 1500);
        player.onScreenDisplay.setActionBar(
            undoThreshold === 0
                ? t("eb.place.undo_disabled")
                : t("eb.place.too_large_to_undo", undoThreshold),
        );
    }

    // Charged before the writes are queued (they are queued over a few ticks below).
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

    // One permutation per kind of block and states (resolved once, not once per entry with a withState per state).
    const playerId = player.id;
    await runJobAsync((function* () {
        const perms = new Map();
        for (const e of entries) {
            if (sliceDue()) yield;
            try {
                const key = `${e.typeId}|${JSON.stringify(e.permStates)}`;
                let perm = perms.get(key);
                if (!perm) {
                    try {
                        perm = BlockPermutation.resolve(e.typeId, e.permStates);
                    } catch {
                        perm = BlockPermutation.resolve(e.typeId);
                        for (const [k, v] of Object.entries(e.permStates)) {
                            try { perm = perm.withState(k, v); } catch {}
                        }
                    }
                    perms.set(key, perm);
                }
                // A survival player paid for this block (or cut it): given back if the queue finally gives it up.
                const refund = !creative && chargeUnits(e.typeId, e.permStates) > 0 ? e.typeId : undefined;
                enqueue(playerId, dimId, e.pos, perm, refund);
            } catch { }
        }
        yield;
        yield* reportPlacedJob(dimId, entries.map((e) => ({ ...e.pos, typeId: e.typeId })), (p) => p.typeId);
    })());
    return entries.length;
}
