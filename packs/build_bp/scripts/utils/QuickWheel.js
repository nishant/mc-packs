// @ts-nocheck
const PROP = "eb:wheel";

export const WHEEL_SLOTS = 8;

export function getWheelLayout(player) {
    try {
        const raw  = player.getDynamicProperty(PROP);
        const list = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(list)) return null;
        return Array.from({ length: WHEEL_SLOTS }, (_, i) => typeof list[i] === "string" ? list[i] : "");
    } catch { return null; }
}

export function setWheelLayout(player, layout) {
    try { player.setDynamicProperty(PROP, layout ? JSON.stringify(layout) : undefined); } catch { }
}
