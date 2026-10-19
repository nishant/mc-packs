// The cap is the most a build may place. The default is what a player gets when they
// have not saved their own limit. Raising the cap must not raise that default.
// A saved player value stays, then is clamped to the cap. Unknown property types are ignored.

export const HARD_MAX_BLOCKS = 300000;
export const CONFIG_DEFAULT_MAX_BLOCKS = 50000;
export const CONFIG_MAX_BLOCKS_CAP = 50000;

function positiveInt(value, hard) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return null;
    return Math.min(Math.floor(value), hard);
}

export function resolveCap(savedCap, configCap = CONFIG_MAX_BLOCKS_CAP) {
    return positiveInt(savedCap, HARD_MAX_BLOCKS) ?? positiveInt(configCap, HARD_MAX_BLOCKS) ?? CONFIG_MAX_BLOCKS_CAP;
}

export function resolveDefaultMaxBlocks({ saved, configDefault = CONFIG_DEFAULT_MAX_BLOCKS, cap }) {
    const limit = resolveCap(cap, cap);
    const chosen = positiveInt(saved, HARD_MAX_BLOCKS) ?? positiveInt(configDefault, HARD_MAX_BLOCKS) ?? CONFIG_DEFAULT_MAX_BLOCKS;
    return Math.min(chosen, limit);
}

export function resolvePlayerMaxBlocks({ saved, fallback, cap }) {
    const limit = resolveCap(cap, cap);
    const chosen = positiveInt(saved, HARD_MAX_BLOCKS) ?? positiveInt(fallback, HARD_MAX_BLOCKS) ?? CONFIG_DEFAULT_MAX_BLOCKS;
    return Math.min(chosen, limit);
}

export function applyBuildBonus(base, bonusPct) {
    if (typeof bonusPct !== "number" || bonusPct <= 0) return base;
    return Math.min(HARD_MAX_BLOCKS, Math.floor(base * (1 + bonusPct / 100)));
}
