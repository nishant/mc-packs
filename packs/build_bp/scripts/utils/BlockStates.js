// @ts-nocheck
const FACING_ORDER = ["south", "west", "north", "east"];
const FACING_INDEX = Object.fromEntries(FACING_ORDER.map((f, i) => [f, i]));

const WEIRDO_CYCLE = [0, 2, 1, 3];
const WEIRDO_POS   = [0, 2, 1, 3];

export function rotateFacing(facing, n) {
    const i = FACING_INDEX[facing];
    return i !== undefined ? FACING_ORDER[(i + n) & 3] : facing;
}

export function rotateStates(states, n) {
    if (!n) return states;
    const s = { ...states };

    if (typeof s.weirdo_direction === "number")
        s.weirdo_direction = WEIRDO_CYCLE[(WEIRDO_POS[s.weirdo_direction] + n) & 3];
    if (typeof s.direction === "number")
        s.direction = (s.direction + n) & 3;

    if (typeof s["minecraft:cardinal_direction"] === "string")
        s["minecraft:cardinal_direction"] = rotateFacing(s["minecraft:cardinal_direction"], n);

    if (typeof s.facing_direction === "number" && s.facing_direction >= 2) {
        const str  = ["north", "south", "west", "east"][s.facing_direction - 2];
        const rmap = { north: 2, south: 3, west: 4, east: 5 };
        s.facing_direction = rmap[rotateFacing(str, n)] ?? s.facing_direction;
    }

    if (typeof s["minecraft:block_face"] === "string")
        s["minecraft:block_face"] = rotateFacing(s["minecraft:block_face"], n);

    if (typeof s.torch_facing_direction === "string")
        s.torch_facing_direction = rotateFacing(s.torch_facing_direction, n);

    if (typeof s.pillar_axis === "string" && n & 1) {
        if      (s.pillar_axis === "x") s.pillar_axis = "z";
        else if (s.pillar_axis === "z") s.pillar_axis = "x";
    }

    if (typeof s.ground_sign_direction === "number")
        s.ground_sign_direction = (s.ground_sign_direction + n * 4) % 16;
    if (typeof s.hanging_strip_direction === "number")
        s.hanging_strip_direction = (s.hanging_strip_direction + n * 4) % 16;

    return s;
}
