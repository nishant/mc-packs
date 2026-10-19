// @ts-nocheck
const DEFAULTS = {
    line:          { curve: "straight" },
    diagonal_line: { curve: "straight" },
    wall:          { fill: "filled" },
    floor:         { fill: "filled" },
    diagonal_wall: { fill: "filled" },
    slope_floor:   { fill: "filled" },
    cube:          { fill: "filled" },
    circle:        { fill: "filled", shape: "even"  },
    cylinder:      { fill: "filled", shape: "even"  },
    sphere:        { fill: "filled" },
    semicircle:    { orientation: "arch", fill: "filled" },
    cone:          { fill: "filled", axis: "straight" },
};
export function getModeOption(player, mode, key) {
    const def = DEFAULTS[mode]?.[key] ?? null;
    try {
        const val = player.getDynamicProperty(`eb:opt:${mode}:${key}`);
        return (val !== undefined && val !== null) ? String(val) : def;
    } catch {
        return def;
    }
}
export function setModeOption(player, mode, key, value) {
    try {
        player.setDynamicProperty(`eb:opt:${mode}:${key}`, value);
    } catch {  }
}
