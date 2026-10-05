const COPPER_CHESTS = ["", "exposed_", "weathered_", "oxidized_"].flatMap((stage) => [
  `minecraft:${stage}copper_chest`,
  `minecraft:waxed_${stage}copper_chest`,
]);

const COLORS = [
  "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
  "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
];
const SHULKER_BOXES = ["undyed", ...COLORS].map((color) => `minecraft:${color}_shulker_box`);
const BUNDLES = ["minecraft:bundle", ...COLORS.map((color) => `minecraft:${color}_bundle`)];

export const CONFIG = {
  /** Blocks around the player that /realm:stash looks in for containers. */
  stashRadius: 8,

  /**
   * Block ids that get the sneak-tap menu and can be sorted: chests, trapped chests, copper chests
   * (every stage, waxed or not), barrels and placed shulker boxes. Ender chests get the menu too,
   * without "Sort this", since add-ons can't see inside them.
   */
  containerTypes: ["minecraft:chest", "minecraft:trapped_chest", ...COPPER_CHESTS, "minecraft:barrel", ...SHULKER_BOXES],

  /**
   * Block ids that receive /realm:stash. Shulker boxes are left out: they're a kit you pick up and
   * carry, not storage that should fill up behind your back.
   */
  stashTypes: ["minecraft:chest", "minecraft:trapped_chest", ...COPPER_CHESTS, "minecraft:barrel"],

  /**
   * What sneaking and tapping a container does, with an empty hand or holding a tool, weapon or armor
   * (it never opens it): "menu" = a menu to sort it, quick stack or sort your inventory,
   * "sort" = sort it right away, "off" = nothing, it opens as usual.
   */
  sneakTap: "menu",

  /** /realm:stash also moves items with a custom name (otherwise they stay with you). */
  stashNamedItems: false,

  /** /realm:stash also moves gear: anything with durability, like tools, weapons, armor and elytra. */
  stashGear: false,

  /** Item ids /realm:stash never moves: carried storage, the totem, and what you find your way with. */
  keepItems: [
    ...SHULKER_BOXES,
    ...BUNDLES,
    "minecraft:totem_of_undying",
    "minecraft:filled_map",
    "minecraft:compass",
    "minecraft:lodestone_compass",
    "minecraft:recovery_compass",
    "minecraft:clock",
  ],

  /** /realm:sort also sorts the hotbar (otherwise only slots 9–35). */
  sortHotbar: false,

  /** Minimum time between uses per player, in ticks (20 = 1 s). */
  cooldownTicks: 20,
};
