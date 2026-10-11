// Story place builders. STUB written by the saga-engine agent so the engine runs before the
// prefabs agent's real file lands; the merge takes theirs. Same exports, two simple places.
import { BlockPermutation } from "@minecraft/server";

/** @typedef {{ x: number, y: number, z: number }} V3 */
/** @typedef {"land" | "coast" | "water" | "underground" | "sky" | "high"} Site */
/** @typedef {{ label: string, size: V3, site: Site, minDist: number, maxDist: number, y?: number, features: Record<string, V3> }} PrefabInfo */

/** @type {Record<string, PrefabInfo>} */
export const PREFABS = {
  lighthouse: { label: "Lighthouse", size: { x: 5, y: 18, z: 5 }, site: "coast", minDist: 80, maxDist: 250, features: { door: { x: 0, y: 0, z: -2 }, top: { x: 0, y: 17, z: 0 } } },
  meadow: { label: "Wren's Meadow", size: { x: 11, y: 4, z: 11 }, site: "land", minDist: 40, maxDist: 150, features: { gate: { x: 0, y: 0, z: -5 }, actor: { x: 0, y: 0, z: 0 } } },
};

/** @param {V3} o @param {number} facing */
export function rotate(o, facing) {
  const f = ((facing % 4) + 4) % 4;
  if (f === 1) return { x: -o.z, y: o.y, z: o.x };
  if (f === 2) return { x: -o.x, y: o.y, z: -o.z };
  if (f === 3) return { x: o.z, y: o.y, z: -o.x };
  return { x: o.x, y: o.y, z: o.z };
}

/** @param {string} name @param {V3} origin @param {number} facing @returns {{ min: V3, max: V3 }} */
export function footprint(name, origin, facing) {
  const p = PREFABS[name];
  const s = p ? p.size : { x: 1, y: 1, z: 1 };
  const hx = Math.floor(s.x / 2);
  const hz = Math.floor(s.z / 2);
  const a = rotate({ x: -hx, y: 0, z: -hz }, facing);
  const b = rotate({ x: s.x - 1 - hx, y: s.y - 1, z: s.z - 1 - hz }, facing);
  return {
    min: { x: origin.x + Math.min(a.x, b.x), y: origin.y - 1, z: origin.z + Math.min(a.z, b.z) },
    max: { x: origin.x + Math.max(a.x, b.x), y: origin.y + s.y - 1, z: origin.z + Math.max(a.z, b.z) },
  };
}

/**
 * @param {string} name @param {import("@minecraft/server").Dimension} dimension @param {V3} origin @param {number} facing
 * @returns {Generator<void, void, void>}
 */
export function* buildSteps(name, dimension, origin, facing) {
  const box = footprint(name, origin, facing);
  const set = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {string} */ id) => {
    const b = dimension.getBlock({ x, y, z });
    if (b) b.setPermutation(BlockPermutation.resolve(id));
  };
  let n = 0;
  for (let x = box.min.x; x <= box.max.x; x++)
    for (let z = box.min.z; z <= box.max.z; z++) {
      for (let y = box.min.y; y <= box.max.y; y++) {
        const edge = x === box.min.x || x === box.max.x || z === box.min.z || z === box.max.z;
        let id = "minecraft:air";
        if (y === box.min.y) id = name === "meadow" ? "minecraft:grass_block" : "minecraft:stone_bricks";
        else if (name === "meadow") id = edge && y === box.min.y + 1 ? "minecraft:oak_fence" : "minecraft:air";
        else if (edge) id = y === box.max.y ? "minecraft:glass" : "minecraft:stone_bricks";
        set(x, y, z, id);
        if (++n % 200 === 0) yield;
      }
    }
}

/** @param {string} name @param {import("@minecraft/server").Dimension} dimension @param {number} x @param {number} z */
export function siteOk(name, dimension, x, z) {
  try {
    const top = dimension.getTopmostBlock({ x, z });
    if (!top) return { ok: false, reason: "not loaded" };
    if (top.isLiquid || /leaves|log/.test(top.typeId)) return { ok: false, reason: "water or trees" };
    return { ok: true, y: top.location.y + 1 };
  } catch {
    return { ok: false, reason: "not loaded" };
  }
}
