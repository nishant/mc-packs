export const CONFIG = {
  /**
   * Crops that harvest and replant. `block`: block id; `state` and `ripe`: the growth state and its
   * fully grown value; `seed`: the item a replant uses (for `replantCostsSeed`); `sound`: played on harvest.
   */
  crops: [
    { block: "minecraft:wheat", state: "growth", ripe: 7, seed: "minecraft:wheat_seeds", sound: "dig.grass" },
    { block: "minecraft:carrots", state: "growth", ripe: 7, seed: "minecraft:carrot", sound: "dig.grass" },
    { block: "minecraft:potatoes", state: "growth", ripe: 7, seed: "minecraft:potato", sound: "dig.grass" },
    { block: "minecraft:beetroot", state: "growth", ripe: 7, seed: "minecraft:beetroot_seeds", sound: "dig.grass" },
    { block: "minecraft:nether_wart", state: "age", ripe: 3, seed: "minecraft:nether_wart", sound: "dig.nether_wart" },
    { block: "minecraft:cocoa", state: "age", ripe: 2, seed: "minecraft:cocoa_beans", sound: "dig.wood" },
  ],

  /** Only harvest when a hoe is held (an empty hand does nothing). */
  requireHoe: false,

  /** A held hoe loses one durability per harvest (Unbreaking applies). */
  damageHoe: false,

  /** Replanting uses one seed: taken from the drops, else from your inventory; with none, the crop isn't replanted. */
  replantCostsSeed: false,
};
