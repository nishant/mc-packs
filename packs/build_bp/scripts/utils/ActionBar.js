// @ts-nocheck
import { system } from "@minecraft/server";
import { onScriptEvent } from "../script-events.js";

const PACK = "build_bp";
const STEADY = 30;
const locks = new Map();
const externalLocks = new Map();

export function lockActionBar(playerId, durationMs) {
    const exp = Date.now() + durationMs;
    if ((locks.get(playerId) ?? 0) < exp) locks.set(playerId, exp);
    lastSteady.delete(playerId); // another line takes the bar: the steady one is sent again when the lock ends
    const ticks = Math.min(200, Math.max(10, Math.ceil(durationMs / 50)));
    try {
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: playerId, ticks, from: PACK }));
    } catch {}
}

/** player id -> tick of the last steady realm:actionbar request (each asks for `ticks`; resent a third of the way in) */
const steadySent = new Map();

export function notifySteadyActionBar(playerId, ticks = 30) {
    const now = system.currentTick;
    if (now - (steadySent.get(playerId) ?? -Infinity) < Math.max(1, Math.floor(ticks / 3))) return;
    steadySent.set(playerId, now);
    try {
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: playerId, ticks, from: PACK, steady: STEADY }));
    } catch {}
}

/** player id -> the steady line last sent: { key, tick } (forgotten when any other line takes the bar) */
const lastSteady = new Map();
/** An unchanged steady line is sent again this often (the bar fades after about 3 s). */
const STEADY_RESEND_TICKS = 20;

/**
 * A redrawn (steady) line above the hotbar: announced with the action bar protocol, then shown. The same text is sent
 * once a second, not every tick (BSE-06); a changed text goes at once.
 */
export function steadyBar(player, text) {
    const now = system.currentTick;
    const key = typeof text === "string" ? text : JSON.stringify(text);
    const last = lastSteady.get(player.id);
    if (last && last.key === key && now - last.tick < STEADY_RESEND_TICKS && now >= last.tick) return;
    lastSteady.set(player.id, { key, tick: now });
    notifySteadyActionBar(player.id, 30);
    player.onScreenDisplay.setActionBar(text);
}

export function isActionBarLocked(playerId) {
    const now = Date.now();
    const ext = externalLocks.get(playerId);
    if (ext) {
        if (now < ext) return true;
        externalLocks.delete(playerId);
    }
    const exp = locks.get(playerId);
    if (!exp) return false;
    if (now >= exp) { locks.delete(playerId); return false; }
    return true;
}

export function isExternallyLocked(playerId) {
    const ext = externalLocks.get(playerId);
    if (!ext) return false;
    if (Date.now() >= ext) { externalLocks.delete(playerId); return false; }
    return true;
}

export function cleanupActionBar(playerId) {
    locks.delete(playerId);
    steadySent.delete(playerId);
    externalLocks.delete(playerId);
    lastSteady.delete(playerId);
}

try {
    onScriptEvent(
        "realm:actionbar",
        ({ id, message }) => {
            if (id !== "realm:actionbar") return;
            try {
                const req = JSON.parse(message);
                if (!req || typeof req.player !== "string" || req.from === PACK || req.background === true) return;
                if (Number.isFinite(req.steady) && (req.steady < STEADY || (req.steady === STEADY && String(req.from) > PACK))) return;
                const ticks = Math.min(Math.max(Number(req.ticks) || 40, 0), 200);
                const exp = Date.now() + ticks * 50;
                if ((externalLocks.get(req.player) ?? 0) < exp) externalLocks.set(req.player, exp);
                lastSteady.delete(req.player);
            } catch {}
        },
    );
} catch {}
