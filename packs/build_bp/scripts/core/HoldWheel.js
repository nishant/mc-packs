// @ts-nocheck
import { world, system } from "@minecraft/server";
import { openPanel, openPanelName, closePanel, releasePanel } from "./EntityPanel.js";
import { usesFloatingUI } from "../utils/CustomUI.js";
import { isBook, heldItem } from "../utils/Items.js";

const WHEEL       = "ring";
const HOLD_TICKS  = 5;
const TAP_TICKS   = 1;
const DISTANCE    = 2.2;
const NEAREST     = 1;
const CLEARANCE   = 0.35;

const presses   = new Map();
const startedAt = new Map();

function openWheel(player) {
    const head = player.getHeadLocation();
    const view = player.getViewDirection();
    let reach  = DISTANCE;
    try {
        const hit = player.dimension.getBlockFromRay(head, view, { maxDistance: DISTANCE + 1, includeLiquidBlocks: false, includePassableBlocks: true });
        if (hit) {
            const at = { x: hit.block.location.x + hit.faceLocation.x, y: hit.block.location.y + hit.faceLocation.y, z: hit.block.location.z + hit.faceLocation.z };
            reach = Math.max(NEAREST, Math.min(DISTANCE, Math.hypot(at.x - head.x, at.y - head.y, at.z - head.z) - CLEARANCE));
        }
    } catch {}
    return openPanel(player, WHEEL, {
        centre: { x: head.x + view.x * reach, y: head.y + 0.1 + view.y * reach, z: head.z + view.z * reach },
    });
}

function tap(playerId, press) {
    presses.delete(playerId);
    try { press.tap(); } catch (e) { console.warn(`[EB] book click failed: ${e}`); }
}

export function bookPressed(player, onTap) {
    if (!usesFloatingUI(player)) {
        onTap();
        return;
    }
    presses.set(player.id, {
        player, tap: onTap, at: system.currentTick, opened: false,
        started: startedAt.get(player.id) === system.currentTick,
    });
}

export function cleanupHoldWheel(playerId) {
    presses.delete(playerId);
    startedAt.delete(playerId);
}

export function startHoldWheel() {
    world.afterEvents.itemStartUse.subscribe(ev => {
        if (!isBook(ev.itemStack)) return;
        startedAt.set(ev.source.id, system.currentTick);
        const press = presses.get(ev.source.id);
        if (press) press.started = true;
    });

    world.afterEvents.itemStopUse.subscribe(ev => {
        const press = presses.get(ev.source.id);
        if (!press) return;
        if (ev.source?.isValid !== true) {
            presses.delete(ev.source.id);
            return;
        }
        if (!press.opened) {
            tap(ev.source.id, press);
            return;
        }
        presses.delete(ev.source.id);
        if (openPanelName(ev.source.id) === WHEEL) releasePanel(ev.source);
    });

    system.runInterval(() => {
        const tick = system.currentTick;
        for (const [playerId, press] of presses) {
            if (!press.player || press.player.isValid !== true) {
                presses.delete(playerId);
                closePanel(playerId);
                continue;
            }
            const held = tick - press.at;
            if (!press.started) {
                if (held >= TAP_TICKS) tap(playerId, press);
                continue;
            }
            let holding = false;
            try { holding = isBook(heldItem(press.player)); } catch {}
            if (!holding) {
                presses.delete(playerId);
                if (press.opened && openPanelName(playerId) === WHEEL) closePanel(playerId);
            } else if (!press.opened && held >= HOLD_TICKS) {
                press.opened = true;
                if (!openWheel(press.player)) tap(playerId, press);
            } else if (press.opened && openPanelName(playerId) !== WHEEL) {
                presses.delete(playerId);
            }
        }
    }, 1);
}
