// Saved preview cells are known terrain only: never unknown, markers, or overlays.
// Shared by the disk adapter and RAM hydration so corrupt pages cannot invent terrain.
import { G } from "./glyphs.js";

const TERRAIN = new Set([
  G.Q_GRASS, G.Q_GRASS_LO, G.Q_GRASS_HI,
  G.Q_FOREST, G.Q_FOREST_LO, G.Q_FOREST_HI,
  G.Q_SAND, G.Q_SAND_LO, G.Q_SAND_HI,
  G.Q_STONE, G.Q_STONE_LO, G.Q_STONE_HI,
  G.Q_SNOW, G.Q_SNOW_LO, G.Q_SNOW_HI,
  G.Q_PATH, G.Q_PATH_LO, G.Q_PATH_HI,
  G.Q_MESA, G.Q_MESA_LO, G.Q_MESA_HI,
  G.Q_SANDSTONE, G.Q_SANDSTONE_LO, G.Q_SANDSTONE_HI,
  G.Q_WATER, G.Q_WATER_SHALLOW, G.Q_WATER_DEEP,
  G.Q_LAVA, G.Q_CAVE, G.Q_CAVE_FLOOR, G.Q_CAVE_WALL,
  G.Q_CHERRY, G.Q_BIRCH, G.Q_SPRUCE, G.Q_SAVANNA, G.Q_SWAMP,
  G.Q_DEEPSLATE, G.Q_CROP, G.Q_WARPED, G.Q_ICE, G.Q_NETHER, G.Q_END, G.Q_BRICK,
]);

/** Full F4/F5 terrain palette plus the legacy terrain glyphs. @param {unknown} glyph */
export function knownPreviewGlyph(glyph) {
  if (typeof glyph !== "string" || glyph.length !== 1) return false;
  const code = glyph.charCodeAt(0);
  return TERRAIN.has(glyph) || (code >= 0xf400 && code < 0xf600);
}
