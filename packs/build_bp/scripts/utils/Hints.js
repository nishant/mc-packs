// @ts-nocheck
import { t } from "./Text.js";
import { getHintsEnabled } from "../core/Settings.js";

const PROP = "eb:seenHints";

function load(player) {
    try {
        const raw = player.getDynamicProperty(PROP);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function save(player, seen) {
    try { player.setDynamicProperty(PROP, JSON.stringify(seen)); } catch {}
}

export function hasSeenHint(player, hintId) {
    return load(player).includes(hintId);
}

export function markHintSeen(player, hintId) {
    const seen = load(player);
    if (!seen.includes(hintId)) {
        seen.push(hintId);
        save(player, seen);
    }
}

export function showHintOnce(player, hintId, messageKey, ...args) {
    if (!getHintsEnabled(player)) return;
    if (hasSeenHint(player, hintId)) return;
    markHintSeen(player, hintId);
    player.sendMessage(t(messageKey, ...args));
}
