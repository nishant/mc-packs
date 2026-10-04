// Bedrock's reach is hard-coded in the engine and no add-on API can change it.
// This pack works around that: when you right-click *air* while holding a block,
// it raycasts further than vanilla would and places the block itself.

export const CONFIG = {
  /** Vanilla block reach (keyboard/mouse/controller). Anything closer is left to vanilla. */
  vanillaReach: 5,

  /** 1.5 = 50% further, so 7.5 blocks. */
  reachMultiplier: 1.5,

  /** Minimum ticks between script placements per player (vanilla repeat rate is ~4). */
  cooldownTicks: 4,

  /**
   * Blocks the script can't place correctly: they need support, are two blocks
   * tall, attach to walls, or have item IDs that differ from their block IDs.
   * Matched against the item's type ID. These still work at normal range.
   */
  denyItems: [
    /door/,
    /bed$/,
    /sign$/,
    /torch/,
    /ladder/,
    /button/,
    /lever/,
    /rail/,
    /banner/,
    /sapling/,
    /flower|tulip|orchid|allium|bluet|daisy|poppy|dandelion|cornflower|lily|rose|peony|lilac|sunflower/,
    /vine/,
    /_plant$|cactus|bamboo|sugar_cane|kelp|seagrass|dripleaf|azalea$|mushroom$|fungus$|roots$|sprouts$/,
    /pointed_dripstone|scaffolding|candle|_head$|skull|amethyst_bud|amethyst_cluster/,
    /lantern|chain$|bell$|hopper|pressure_plate|tripwire|string|redstone|repeater|comparator/,
    /coral_fan|_wall_fan|glow_lichen|sculk_vein|moss_carpet|_carpet$|snow$|tall_grass|short_grass|fern|dead_bush|frogspawn|lily_pad/,
    /^minecraft:(water|lava|fire|soul_fire|portal|end_portal|end_gateway|structure_void|barrier|light_block.*)$/,
  ],
};
