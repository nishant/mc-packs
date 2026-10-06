const ORES = (/** @type {string} */ ore) => [`minecraft:${ore}_ore`, `minecraft:deepslate_${ore}_ore`];
const LOGS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"].map((w) => `minecraft:${w}_log`);

export const CONFIG = {
  /** New quests every day at this hour, UTC (0 = midnight UTC). */
  resetHourUtc: 0,

  /** Quests each player gets per day, picked at random from `pool` (with different kinds where possible). */
  questsPerDay: 3,

  /** A short note above the hotbar as a quest gets a quarter, half and three quarters done. */
  progressNotes: true,

  /** Players in creative mode make no progress. */
  skipCreative: true,

  /**
   * Movement faster than this (blocks per second) is a teleport and doesn't count for travel quests.
   */
  maxSpeed: 100,

  /**
   * Crops that count for `harvest` quests: broken when fully grown, or reset to their first stage by
   * a tap (the Right-click Harvest pack). `state` and `ripe`: the growth state and its fully grown
   * value; without them, any break counts (melons and pumpkins).
   */
  crops: [
    { block: "minecraft:wheat", state: "growth", ripe: 7 },
    { block: "minecraft:carrots", state: "growth", ripe: 7 },
    { block: "minecraft:potatoes", state: "growth", ripe: 7 },
    { block: "minecraft:beetroot", state: "growth", ripe: 7 },
    { block: "minecraft:nether_wart", state: "age", ripe: 3 },
    { block: "minecraft:cocoa", state: "age", ripe: 2 },
    { block: "minecraft:melon_block" },
    { block: "minecraft:pumpkin" },
  ],

  /**
   * The quests to pick from. Each has a unique `id` (keep it when editing: progress is saved by id),
   * a `kind`, how many it takes (`count`), the `label` players see, which block, mob, crop, food or
   * fish ids count (`targets`; leave it out for any), and a `reward`: XP `levels` and/or an `item`
   * with its `amount`.
   *
   * Kinds: `mine` (blocks broken; blocks a player placed recently don't count), `kill` (mobs killed,
   * arrows count for the shooter), `harvest` (fully grown crops from `crops`), `place` (blocks
   * placed), `travel` (blocks moved, any way), `eat` (food eaten), `fish` (items caught with a
   * fishing rod).
   * @type {{ id: string, kind: "mine" | "kill" | "harvest" | "place" | "travel" | "eat" | "fish", count: number, label: string, targets?: string[], reward: { levels?: number, item?: string, amount?: number } }[]}
   */
  pool: [
    { id: "mine_stone", kind: "mine", count: 64, label: "Mine 64 stone", targets: ["minecraft:stone", "minecraft:cobblestone", "minecraft:deepslate", "minecraft:cobbled_deepslate", "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:tuff"], reward: { levels: 2 } },
    { id: "mine_coal", kind: "mine", count: 12, label: "Mine 12 coal ore", targets: ORES("coal"), reward: { item: "minecraft:torch", amount: 16 } },
    { id: "mine_iron", kind: "mine", count: 8, label: "Mine 8 iron ore", targets: ORES("iron"), reward: { levels: 3 } },
    { id: "mine_logs", kind: "mine", count: 32, label: "Chop 32 logs", targets: [...LOGS, "minecraft:crimson_stem", "minecraft:warped_stem"], reward: { item: "minecraft:apple", amount: 4 } },
    { id: "kill_zombies", kind: "kill", count: 10, label: "Defeat 10 zombies", targets: ["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager", "minecraft:zombie_villager_v2"], reward: { levels: 3 } },
    { id: "kill_skeletons", kind: "kill", count: 8, label: "Defeat 8 skeletons", targets: ["minecraft:skeleton", "minecraft:stray", "minecraft:bogged"], reward: { item: "minecraft:arrow", amount: 16 } },
    { id: "kill_creepers", kind: "kill", count: 5, label: "Defeat 5 creepers", targets: ["minecraft:creeper"], reward: { levels: 4 } },
    { id: "kill_spiders", kind: "kill", count: 8, label: "Defeat 8 spiders", targets: ["minecraft:spider", "minecraft:cave_spider"], reward: { item: "minecraft:string", amount: 8 } },
    { id: "kill_any", kind: "kill", count: 25, label: "Defeat 25 mobs of any kind", reward: { levels: 3 } },
    { id: "harvest_any", kind: "harvest", count: 32, label: "Harvest 32 grown crops", reward: { item: "minecraft:bone_meal", amount: 16 } },
    { id: "harvest_wheat", kind: "harvest", count: 24, label: "Harvest 24 wheat", targets: ["minecraft:wheat"], reward: { item: "minecraft:bread", amount: 6 } },
    { id: "place_blocks", kind: "place", count: 64, label: "Place 64 blocks", reward: { levels: 2 } },
    { id: "travel_1k", kind: "travel", count: 1000, label: "Travel 1,000 blocks", reward: { levels: 2 } },
    { id: "travel_3k", kind: "travel", count: 3000, label: "Travel 3,000 blocks", reward: { item: "minecraft:golden_carrot", amount: 4 } },
    { id: "eat_food", kind: "eat", count: 5, label: "Eat 5 meals", reward: { levels: 1, item: "minecraft:cookie", amount: 4 } },
    { id: "fish", kind: "fish", count: 5, label: "Catch 5 fish", targets: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"], reward: { levels: 3 } },
  ],
};
