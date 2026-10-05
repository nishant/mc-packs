const SHULKER_BOXES = [
  "undyed", "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
].map((color) => `minecraft:${color}_shulker_box`);

export const CONFIG = {
  /** Containers this close (blocks) are read live at search time, so nearby results are always current. */
  liveScanRadius: 16,

  /** Most containers remembered; the ones seen longest ago are forgotten first. */
  maxContainers: 2000,

  /** Rows in the results menu. */
  maxResults: 20,

  /** How long the particle column over a chosen container shows, in seconds. */
  highlightSeconds: 10,

  /** Block ids that are remembered and searched: chests, trapped chests, barrels and placed shulker boxes. */
  containerTypes: ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", ...SHULKER_BOXES],
};
