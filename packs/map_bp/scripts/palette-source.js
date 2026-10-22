// Original hybrid map-color source. Stable biome tints where exposed, our own material colors elsewhere.
import { quantizeRGBA } from "./purepalette.js";

/** Approximate colors for our existing material categories, not a copied vanilla or third-party palette. */
const MATERIAL = /** @type {Record<string, number[]>} */ ({
  grass: [72, 142, 64], forest: [42, 98, 48], water: [40, 100, 190], sand: [208, 186, 128],
  snow: [232, 238, 244], stone: [116, 120, 126], path: [148, 114, 80], lava: [224, 88, 24],
  mesa: [178, 102, 66], nether: [122, 42, 40], end: [216, 218, 164], cherry: [232, 148, 180],
  birch: [116, 146, 72], spruce: [52, 88, 60], savanna: [154, 148, 76], swamp: [66, 88, 52],
  deepslate: [64, 68, 76], brick: [172, 86, 66], warped: [36, 148, 140], ice: [148, 194, 238],
  sandstone: [216, 204, 164], crop: [122, 148, 58], cave_floor: [72, 76, 86], cave_wall: [28, 32, 40],
});
/** Original dye-color approximations make colored buildings legible even when the native component is absent. */
const DYE = /** @type {Record<string, number[]>} */ ({
  white: [232, 232, 224], light_gray: [168, 168, 160], gray: [88, 92, 96], black: [28, 28, 32],
  brown: [112, 76, 48], red: [180, 44, 40], orange: [232, 128, 36], yellow: [236, 208, 52],
  lime: [140, 194, 52], green: [76, 120, 48], cyan: [40, 148, 160], light_blue: [100, 188, 216],
  blue: [64, 80, 176], purple: [132, 64, 172], magenta: [190, 78, 180], pink: [232, 150, 176],
});

/** @param {import("@minecraft/server").Block} block @param {string} kind @returns {number | undefined} */
export function paletteForBlock(block, kind) {
  /** @type {import("@minecraft/server").BlockMapColorComponent | undefined} */
  let component;
  try { component = block.getComponent?.("minecraft:map_color"); } catch {}
  if (component) {
    try {
      const tinted = quantizeRGBA(component.tintedColor);
      if (tinted !== undefined) return tinted;
    } catch {}
    try {
      const base = quantizeRGBA(component.color);
      if (base !== undefined) return base;
    } catch {}
  }
  // A missing or unavailable optional component does not discard an otherwise valid terrain sample.
  const dye = /^minecraft:(white|light_gray|gray|black|brown|red|orange|yellow|lime|green|cyan|light_blue|blue|purple|magenta|pink)_(?:wool|concrete|concrete_powder|terracotta|glazed_terracotta)$/.exec(block.typeId)?.[1];
  const rgb = (dye && DYE[dye]) || MATERIAL[kind] || MATERIAL.grass;
  return quantizeRGBA({ red: rgb[0] / 255, green: rgb[1] / 255, blue: rgb[2] / 255, alpha: 1 });
}
