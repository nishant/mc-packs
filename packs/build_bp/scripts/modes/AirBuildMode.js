// @ts-nocheck
import { BlockPermutation } from "@minecraft/server";
const FACE_OFFSETS = {
    Up:    { x:  0, y:  1, z:  0 },
    Down:  { x:  0, y: -1, z:  0 },
    North: { x:  0, y:  0, z: -1 },
    South: { x:  0, y:  0, z:  1 },
    East:  { x:  1, y:  0, z:  0 },
    West:  { x: -1, y:  0, z:  0 },
};
function isAirLike(block) {
    if (!block) return true;
    const id = block.typeId;
    return id === "minecraft:air";
}
export const AirBuildMode = {
    airBuild: true,
};
function yawToHDir(yaw) {
    const n = ((yaw % 360) + 360) % 360;
    if (n < 45 || n >= 315) return "south";
    if (n < 135)            return "west";
    if (n < 225)            return "north";
    return "east";
}
const stateIndexCache = new Map();
function tryStates(typeId, candidates) {
    const cached = stateIndexCache.get(typeId);
    if (cached !== undefined) {
        return cached >= 0 ? candidates[cached] : {};
    }
    for (let i = 0; i < candidates.length; i++) {
        try {
            BlockPermutation.resolve(typeId, candidates[i]);
            stateIndexCache.set(typeId, i);
            return candidates[i];
        } catch {  }
    }
    stateIndexCache.set(typeId, -1);
    return {};
}
export function getPlacementStatesFromFace(typeId, blockFace, player) {
    const hDir = yawToHDir(player.getRotation().y);
    const hOpposites = { north:"south", south:"north", east:"west", west:"east" };
    const blockFacing = (blockFace === "Up" || blockFace === "Down")
        ? (hOpposites[hDir] ?? hDir)
        : blockFace.toLowerCase();
    const facingInt = { down:0, up:1, north:2, south:3, west:4, east:5 }[blockFacing] ?? 3;
    const pillarAxis = { Up:"y", Down:"y", North:"z", South:"z", East:"x", West:"x" }[blockFace] ?? "y";
    const dirInt = { south:0, west:1, north:2, east:3 }[hDir] ?? 0;
    const weirdoDir   = { east:0, west:1, south:2, north:3 }[hDir] ?? 0;
    const upsideDown  = blockFace === "Down";
    return tryStates(typeId, [
        { "pillar_axis":                    pillarAxis  },
        { "facing_direction":               facingInt   },
        { "minecraft:facing_direction":     facingInt   },
        { "minecraft:cardinal_direction":   blockFacing },
        { "direction":                      dirInt      },
        { "weirdo_direction":     weirdoDir, "upside_down_bit": upsideDown },
        { "weirdo_direction":               weirdoDir   },
        {},
    ]);
}
export function getPlacementStatesFromAir(typeId, player) {
    const rot   = player.getRotation();
    const hDir  = yawToHDir(rot.y);
    const pitch = rot.x;
    const hOpposites = { north:"south", south:"north", east:"west", west:"east" };
    let blockFacing;
    if      (pitch < -45) blockFacing = "up";
    else if (pitch >  45) blockFacing = "down";
    else                  blockFacing = hOpposites[hDir] ?? hDir;
    const facingInt = { down:0, up:1, north:2, south:3, west:4, east:5 }[blockFacing] ?? 3;
    let pillarAxis;
    if (pitch < -45 || pitch > 45) {
        pillarAxis = "y";
    } else {
        pillarAxis = (hDir === "north" || hDir === "south") ? "z" : "x";
    }
    const dirInt    = { south:0, west:1, north:2, east:3 }[hDir] ?? 0;
    const weirdoDir = { east:0, west:1, south:2, north:3 }[hDir] ?? 0;
    return tryStates(typeId, [
        { "pillar_axis":                    pillarAxis  },
        { "facing_direction":               facingInt   },
        { "minecraft:facing_direction":     facingInt   },
        { "minecraft:cardinal_direction":   blockFacing },
        { "direction":                      dirInt      },
        { "weirdo_direction":               weirdoDir   },
        {},
    ]);
}
export function getAirBuildTarget(player, reach = 4) {
    try {
        const head = player.getHeadLocation();
        const dir  = player.getViewDirection();
        const hit = player.getBlockFromViewDirection({
            maxDistance: reach,
            includePassableBlocks: false,
        });
        if (hit?.block) {
            const off = FACE_OFFSETS[hit.face] ?? { x: 0, y: 1, z: 0 };
            const bl  = hit.block.location;
            return { x: bl.x + off.x, y: bl.y + off.y, z: bl.z + off.z };
        }
        const pos = {
            x: Math.floor(head.x + dir.x * reach),
            y: Math.floor(head.y + dir.y * reach),
            z: Math.floor(head.z + dir.z * reach),
        };
        try {
            if (!isAirLike(player.dimension.getBlock(pos))) {
                for (let d = reach - 0.5; d >= 0; d -= 0.5) {
                    const tp = {
                        x: Math.floor(head.x + dir.x * d),
                        y: Math.floor(head.y + dir.y * d),
                        z: Math.floor(head.z + dir.z * d),
                    };
                    try {
                        if (isAirLike(player.dimension.getBlock(tp))) return tp;
                    } catch { return tp; }
                }
            }
        } catch {  }
        return pos;
    } catch { return null; }
}
