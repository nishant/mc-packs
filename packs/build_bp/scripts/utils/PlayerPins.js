// @ts-nocheck
const PROP = "eb:pins";

function load(player) {
    try {
        const raw = player.getDynamicProperty(PROP);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function save(player, pins) {
    try { player.setDynamicProperty(PROP, JSON.stringify(pins)); } catch { }
}

export function getPinnedModes(player) { return load(player); }
export function isPinned(player, modeId) { return load(player).includes(modeId); }

export function pinMode(player, modeId) {
    const pins = load(player).filter(id => id !== modeId);
    pins.unshift(modeId);
    save(player, pins);
}

export function unpinMode(player, modeId) {
    save(player, load(player).filter(id => id !== modeId));
}
