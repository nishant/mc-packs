const COPPER_CHESTS = ["", "exposed_", "weathered_", "oxidized_"].flatMap((stage) => [
  `minecraft:${stage}copper_chest`,
  `minecraft:waxed_${stage}copper_chest`,
]);

const SHULKER_BOXES = [
  "undyed", "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
].map((color) => `minecraft:${color}_shulker_box`);

export const CONFIG = {
  /** Blocks around the player that /realm:stash looks in for containers. */
  stashRadius: 8,

  /**
   * Block ids that get the sneak-tap menu, can be sorted and receive stashes: chests, trapped chests,
   * copper chests (every stage, waxed or not), barrels and placed shulker boxes. Ender chests get the
   * menu too, without "Sort this", since add-ons can't see inside them.
   */
  containerTypes: ["minecraft:chest", "minecraft:trapped_chest", ...COPPER_CHESTS, "minecraft:barrel", ...SHULKER_BOXES],

  /**
   * What sneaking and tapping a container with an empty hand does (it never opens it):
   * "menu" = a menu to sort it, quick stack or sort your inventory, "sort" = sort it right away,
   * "off" = nothing, it opens as usual.
   */
  sneakTap: "menu",

  /** /realm:stash also moves items with a custom name (otherwise they stay with you). */
  stashNamedItems: false,

  /** /realm:sort also sorts the hotbar (otherwise only slots 9–35). */
  sortHotbar: false,

  /** Minimum time between uses per player, in ticks (20 = 1 s). */
  cooldownTicks: 20,
};
