const COPPER_CHESTS = ["", "exposed_", "weathered_", "oxidized_"].flatMap((stage) => [
  `minecraft:${stage}copper_chest`,
  `minecraft:waxed_${stage}copper_chest`,
]);

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

  /** How long the bright marker and the direction line show, in seconds. */
  highlightSeconds: 10,

  /** Players only find containers they opened themselves (a player can open one they own or that was shared with them). Off: the old world-wide index, where anyone finds any remembered container they may open. A world that already had an index keeps the world-wide one until an operator turns this on. */
  privateIndex: true,

  /** Block ids that are remembered and searched: chests, trapped chests, copper chests (every stage,
   * waxed or not), barrels and placed shulker boxes. Ids this game version doesn't have are skipped.
   */
  containerTypes: ["minecraft:chest", "minecraft:trapped_chest", ...COPPER_CHESTS, "minecraft:barrel", ...SHULKER_BOXES],
};
