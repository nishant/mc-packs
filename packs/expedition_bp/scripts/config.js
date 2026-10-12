export const CONFIG = {
  /** New expeditions can start. Disabled: `/realm:expedition` only shows the leaderboards (a run in progress finishes). */
  enabled: true,

  /**
   * Floor height (y) of the dungeon. It is built from 1 block under the floor to 2 blocks above its
   * tallest room: 7 above for a run without tall rooms (`-40` uses y -41 to -33), up to 32 above at
   * the highest Nightmare tiers (y -41 to -8). Keep it between -58 and -20.
   */
  depth: -40,

  /** The site must be at least this far (blocks, measured flat) from world spawn, so no dungeon is ever dug under the spawn town. */
  avoidSpawn: 64,

  /**
   * Expeditions that can run at the same time, each in its own dungeon. The first is at the site, each
   * further one `slotSpacing` blocks east of the one before.
   */
  slots: 1,

  /** Blocks between the dungeons of `slots` (east of the site). At least 132 (the biggest dungeon is 120 wide). */
  slotSpacing: 132,

  /** Most players in one expedition: the leader plus party members (1 to 4). */
  maxParty: 4,

  /** Party members must be within this many blocks of the leader to be asked along. */
  partyRadius: 32,

  /** Seconds party members have to answer "Join the expedition?". */
  confirmSeconds: 20,

  /**
   * Minutes for a 7-room run. Each run gets this much per 7 rooms (so 6 rooms get a little less and
   * 18 rooms a lot more), a little less per Nightmare tier, and at least 5 minutes. A run that isn't
   * finished in time fails, and everyone is sent back.
   */
  timeLimitMinutes: 20,

  /**
   * Seconds after the boss falls before everyone is sent back, to collect the treasure. Opening a treasure
   * chest near the end gives 20 seconds more (up to 2 minutes more in all); the gold button in the treasure
   * room (or /realm:expedition_leave) leaves at once. Treasure left in the chests is given to the players
   * still there when they're sent back.
   */
  exitSeconds: 90,

  /** Items a player drops when dying in the dungeon are given back after they respawn (they would be lost when the dungeon resets). */
  returnItemsOnDeath: true,

  /** Fastest clears kept on each leaderboard (one per dungeon and difficulty or tier). */
  leaderboardSize: 10,

  /** Gauntlets (long runs with boons) can start. */
  gauntletEnabled: true,

  /** Rooms in a Gauntlet, entry, boss and treasure included (10 to 20). */
  gauntletRooms: 14,

  /** A Gauntlet has a sanctuary (pick one of three boons) after every this many rooms (3 to 8). */
  boonEvery: 5,

  /** The Gauntlet preview starts with Fixed loadout on: players' own items are stored and they run with the starter kit. */
  loadoutDefault: false,

  /**
   * The Fixed loadout starter kit: an item, how many, the levels it's given at (`from` and `to`: 0 Easy, 1 Normal,
   * 2 Hard, 3 to 22 Nightmare 1 to 20), an armor or offhand `slot`, and enchantments (`ench`, id: level).
   * Everything from the kit (food, arrows and blocks too) stays in the dungeon: it is taken back when the run ends.
   * @type {{ item: string, count?: number, from?: number, to?: number, slot?: "head" | "chest" | "legs" | "feet" | "offhand", ench?: Record<string, number> }[]}
   */
  gauntletKit: [
    { item: "minecraft:iron_sword", to: 9, ench: { sharpness: 1 } },
    { item: "minecraft:diamond_sword", from: 10, ench: { sharpness: 2 } },
    { item: "minecraft:bow", ench: { power: 1 } },
    { item: "minecraft:arrow", count: 32 },
    { item: "minecraft:shield", slot: "offhand" },
    { item: "minecraft:iron_helmet", slot: "head", to: 9, ench: { protection: 1 } },
    { item: "minecraft:iron_chestplate", slot: "chest", to: 9, ench: { protection: 1 } },
    { item: "minecraft:iron_leggings", slot: "legs", to: 9, ench: { protection: 1 } },
    { item: "minecraft:iron_boots", slot: "feet", to: 9, ench: { protection: 1 } },
    { item: "minecraft:diamond_helmet", slot: "head", from: 10, ench: { protection: 2 } },
    { item: "minecraft:diamond_chestplate", slot: "chest", from: 10, ench: { protection: 2 } },
    { item: "minecraft:diamond_leggings", slot: "legs", from: 10, ench: { protection: 2 } },
    { item: "minecraft:diamond_boots", slot: "feet", from: 10, ench: { protection: 2 } },
    { item: "minecraft:cooked_beef", count: 16 },
    { item: "minecraft:golden_apple", count: 2 },
    { item: "minecraft:cobbled_deepslate", count: 64, from: 3 },
  ],

  /** Players kept on the Highest tier board. */
  tierBoardSize: 20,

  /** Finished and failed runs kept in the run history (the world's and each player's). */
  historySize: 20,

  /** Highest Nightmare tier (1 to 20). Clearing Hard unlocks tier 1, clearing tier N unlocks N + 1. */
  maxTier: 20,

  /** From this Nightmare tier, rooms can be tall (15 to 30 blocks high) with balconies, and vertical shafts appear. */
  tallFromTier: 3,

  /** Players may place blocks in a dungeon (to pillar up, bridge or wall off) from this Nightmare tier. Removed after the run. */
  buildFromTier: 1,

  /** Players may place blocks at all (see `buildFromTier`). Disabled: blocks placed in a dungeon always pop back out. */
  allowBuilding: true,

  /** Champions in waves come from the Champions pack (`elite_bp`) when it is installed and the mob is one it knows. Disabled: always the pack's own champions. */
  useChampionsPack: true,

  /** Most dungeon mobs alive in one run at a time: waves, adds and reinforcements stop at this many. */
  mobCap: 18,

  /** Crowns to reroll the affixes shown before a Nightmare run (0: free). */
  rerollCost: 25,

  /** The item a Nightmare Sigil is (a named item with lore). */
  sigilItem: "minecraft:echo_shard",

  /** Chance (0 to 1) that a boss drops a Nightmare Sigil (Hard and Nightmare runs), plus 1% per tier. */
  sigilChanceBoss: 0.35,

  /** Chance (0 to 1) that a champion in a Nightmare run drops a Nightmare Sigil. */
  sigilChanceChampion: 0.08,

  /** Warden reputation (Guilds) for each player who finishes a run. */
  rep: 15,

  /** Chance (0 to 1) that each player who finishes a run is also given a relic (Relics pack). Plus 1% per Nightmare tier, at most 50%. */
  relicChance: 0.1,

  /** Relics a finished run can give (one of these, at random). */
  relics: ["lantern_deep", "miners_lamp", "compass_echoes", "frost_band", "tide_boots"],

  /**
   * Extra treasure from a Nightmare tier on: each entry is an item, how many (`min` to `max`), its
   * `chance` (0 to 1) and the tier it starts at (`from`). Added to the dungeon's own `loot`.
   * @type {{ from: number, item: string, min: number, max: number, chance: number }[]}
   */
  tierLoot: [
    { from: 1, item: "minecraft:diamond", min: 1, max: 3, chance: 0.6 },
    { from: 3, item: "minecraft:emerald", min: 4, max: 12, chance: 0.7 },
    { from: 5, item: "minecraft:golden_apple", min: 1, max: 3, chance: 0.6 },
    { from: 8, item: "minecraft:netherite_scrap", min: 1, max: 2, chance: 0.4 },
    { from: 10, item: "minecraft:totem_of_undying", min: 1, max: 1, chance: 0.2 },
    { from: 12, item: "minecraft:enchanted_golden_apple", min: 1, max: 1, chance: 0.15 },
    { from: 15, item: "minecraft:netherite_ingot", min: 1, max: 1, chance: 0.25 },
    { from: 18, item: "minecraft:elytra", min: 1, max: 1, chance: 0.05 },
  ],

  /**
   * The dungeons players can pick. Each has a unique `id` (the leaderboards and Journal entries use it:
   * keep it when editing), a `name`, a `lore` line, a `difficulty` (1 to 3: the difficulty it had before
   * tiers, so its old fastest clears count there), its `mobs` (an id, or `{ id, from, weight }`: `from`
   * is the first level it appears at, 0 Easy, 1 Normal, 2 Hard, 3 to 22 Nightmare tiers 1 to 20),
   * `flyers` for tall rooms, its `boss` (a mob, a name, extra health in points and the `adds` it calls),
   * its blocks (`wall`, `floor`, `accent` for pillars, `trim` for balconies and ledges, `light` for the
   * lanterns, `door` for the bars), `decor` (a block scattered in combat rooms, `count` of them, set
   * into the `floor` or standing on it, and whether players may break it), `crowns` for each player who finishes, and the `loot` in its treasure
   * chest: each entry is an item, how many (`min` to `max`) and its `chance` (0 to 1).
   * @type {{ id: string, name: string, lore?: string, difficulty: 1 | 2 | 3,
   *   mobs: (string | { id: string, from?: number, weight?: number })[], flyers?: string[],
   *   boss: { mob: string, name: string, health: number, adds?: string[] },
   *   wall: string, floor: string, accent: string, trim?: string, light: string, door: string,
   *   decor?: { block: string, count: number, floor?: boolean, breakable?: boolean }, crowns: number,
   *   loot: { item: string, min: number, max: number, chance: number }[] }[]}
   */
  dungeons: [
    {
      id: "crypt",
      name: "Crypt",
      lore: "Where the town buried what it chose to forget.",
      difficulty: 1,
      mobs: [
        "minecraft:zombie",
        "minecraft:skeleton",
        { id: "minecraft:husk", from: 2 },
        { id: "minecraft:zombie_villager_v2", from: 3 },
        { id: "minecraft:wither_skeleton", from: 7, weight: 0.6 },
        { id: "minecraft:witch", from: 10, weight: 0.4 },
      ],
      flyers: ["minecraft:phantom", "minecraft:vex"],
      boss: { mob: "minecraft:wither_skeleton", name: "The Crypt Lord", health: 40, adds: ["minecraft:skeleton", "minecraft:zombie"] },
      wall: "minecraft:deepslate_bricks",
      floor: "minecraft:polished_deepslate",
      accent: "minecraft:chiseled_deepslate",
      trim: "minecraft:deepslate_tiles",
      light: "minecraft:soul_lantern",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:web", count: 3, breakable: true },
      crowns: 40,
      loot: [
        { item: "minecraft:iron_ingot", min: 4, max: 10, chance: 1 },
        { item: "minecraft:gold_ingot", min: 2, max: 6, chance: 0.8 },
        { item: "minecraft:bone", min: 4, max: 12, chance: 1 },
        { item: "minecraft:diamond", min: 1, max: 2, chance: 0.4 },
        { item: "minecraft:golden_apple", min: 1, max: 1, chance: 0.4 },
        { item: "minecraft:experience_bottle", min: 4, max: 10, chance: 0.8 },
        { item: "minecraft:name_tag", min: 1, max: 1, chance: 0.25 },
      ],
    },
    {
      id: "drowned_vault",
      name: "Drowned Vault",
      lore: "A Tide vault the sea took back. The drowned still keep its locks.",
      difficulty: 2,
      mobs: ["minecraft:drowned", { id: "minecraft:zombie", from: 1, weight: 0.5 }, { id: "minecraft:bogged", from: 4, weight: 0.6 }, { id: "minecraft:witch", from: 9, weight: 0.4 }],
      flyers: ["minecraft:phantom"],
      boss: { mob: "minecraft:drowned", name: "The Tide Keeper", health: 60, adds: ["minecraft:drowned"] },
      wall: "minecraft:prismarine_bricks",
      floor: "minecraft:dark_prismarine",
      accent: "minecraft:prismarine",
      trim: "minecraft:prismarine_bricks",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:sea_lantern", count: 2, floor: true },
      crowns: 60,
      loot: [
        { item: "minecraft:prismarine_shard", min: 8, max: 16, chance: 1 },
        { item: "minecraft:prismarine_crystals", min: 4, max: 10, chance: 0.8 },
        { item: "minecraft:gold_ingot", min: 4, max: 10, chance: 1 },
        { item: "minecraft:diamond", min: 1, max: 3, chance: 0.6 },
        { item: "minecraft:nautilus_shell", min: 1, max: 2, chance: 0.5 },
        { item: "minecraft:heart_of_the_sea", min: 1, max: 1, chance: 0.1 },
        { item: "minecraft:experience_bottle", min: 6, max: 12, chance: 0.8 },
      ],
    },
    {
      id: "frost_hollow",
      name: "Frost Hollow",
      lore: "Ice that still remembers the Long Storm.",
      difficulty: 3,
      mobs: ["minecraft:stray", { id: "minecraft:skeleton", from: 0, weight: 0.5 }, { id: "minecraft:zombie", from: 1, weight: 0.5 }, { id: "minecraft:breeze", from: 8, weight: 0.4 }],
      flyers: ["minecraft:phantom", "minecraft:breeze"],
      boss: { mob: "minecraft:stray", name: "The Frost Archer", health: 80, adds: ["minecraft:stray"] },
      wall: "minecraft:packed_ice",
      floor: "minecraft:snow",
      accent: "minecraft:blue_ice",
      trim: "minecraft:packed_ice",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
      crowns: 90,
      loot: [
        { item: "minecraft:diamond", min: 2, max: 5, chance: 1 },
        { item: "minecraft:emerald", min: 4, max: 12, chance: 1 },
        { item: "minecraft:golden_apple", min: 1, max: 3, chance: 0.7 },
        { item: "minecraft:enchanted_golden_apple", min: 1, max: 1, chance: 0.05 },
        { item: "minecraft:blue_ice", min: 8, max: 16, chance: 0.6 },
        { item: "minecraft:experience_bottle", min: 8, max: 16, chance: 1 },
      ],
    },
    {
      id: "nether_forge",
      name: "Nether Forge",
      lore: "The Starwrights forged their seal-chains in fire stolen from below.",
      difficulty: 3,
      mobs: ["minecraft:magma_cube", "minecraft:blaze", { id: "minecraft:wither_skeleton", from: 2 }, { id: "minecraft:zoglin", from: 6, weight: 0.5 }],
      flyers: ["minecraft:blaze"],
      boss: { mob: "minecraft:blaze", name: "The Forge Heart", health: 80, adds: ["minecraft:blaze", "minecraft:magma_cube"] },
      wall: "minecraft:polished_blackstone_bricks",
      floor: "minecraft:polished_basalt",
      accent: "minecraft:gilded_blackstone",
      trim: "minecraft:blackstone",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:magma", count: 3, floor: true },
      crowns: 90,
      loot: [
        { item: "minecraft:gold_ingot", min: 6, max: 14, chance: 1 },
        { item: "minecraft:blaze_rod", min: 2, max: 6, chance: 0.9 },
        { item: "minecraft:quartz", min: 8, max: 16, chance: 0.8 },
        { item: "minecraft:diamond", min: 1, max: 3, chance: 0.6 },
        { item: "minecraft:netherite_scrap", min: 1, max: 1, chance: 0.15 },
        { item: "minecraft:experience_bottle", min: 8, max: 14, chance: 1 },
      ],
    },
    {
      id: "sculk_depths",
      name: "Sculk Depths",
      lore: "The sculk grows toward the Hollow. Down here, something listens.",
      difficulty: 3,
      mobs: ["minecraft:zombie", "minecraft:silverfish", { id: "minecraft:endermite", from: 1 }, { id: "minecraft:husk", from: 3 }, { id: "minecraft:bogged", from: 6, weight: 0.6 }],
      flyers: ["minecraft:phantom", "minecraft:vex"],
      boss: { mob: "minecraft:bogged", name: "The Listener", health: 90, adds: ["minecraft:silverfish", "minecraft:zombie"] },
      wall: "minecraft:deepslate_tiles",
      floor: "minecraft:sculk",
      accent: "minecraft:cracked_deepslate_bricks",
      trim: "minecraft:polished_deepslate",
      light: "minecraft:soul_lantern",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:sculk", count: 4, floor: true },
      crowns: 100,
      loot: [
        { item: "minecraft:echo_shard", min: 1, max: 3, chance: 0.6 },
        { item: "minecraft:amethyst_shard", min: 6, max: 14, chance: 1 },
        { item: "minecraft:diamond", min: 2, max: 4, chance: 0.8 },
        { item: "minecraft:disc_fragment_5", min: 1, max: 3, chance: 0.3 },
        { item: "minecraft:experience_bottle", min: 10, max: 18, chance: 1 },
      ],
    },
    {
      id: "pillager_keep",
      name: "Pillager Keep",
      lore: "Raiders hold this keep for someone who pays in old silver.",
      difficulty: 2,
      mobs: ["minecraft:pillager", "minecraft:vindicator", { id: "minecraft:witch", from: 3, weight: 0.5 }, { id: "minecraft:evocation_illager", from: 5, weight: 0.4 }, { id: "minecraft:ravager", from: 12, weight: 0.25 }],
      flyers: ["minecraft:vex", "minecraft:phantom"],
      boss: { mob: "minecraft:ravager", name: "The Warlord's Ravager", health: 60, adds: ["minecraft:pillager", "minecraft:vindicator"] },
      wall: "minecraft:stone_bricks",
      floor: "minecraft:spruce_planks",
      accent: "minecraft:dark_oak_log",
      trim: "minecraft:spruce_planks",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
      crowns: 70,
      loot: [
        { item: "minecraft:emerald", min: 6, max: 16, chance: 1 },
        { item: "minecraft:iron_ingot", min: 6, max: 12, chance: 1 },
        { item: "minecraft:crossbow", min: 1, max: 1, chance: 0.5 },
        { item: "minecraft:totem_of_undying", min: 1, max: 1, chance: 0.15 },
        { item: "minecraft:diamond", min: 1, max: 3, chance: 0.5 },
        { item: "minecraft:experience_bottle", min: 6, max: 12, chance: 0.8 },
      ],
    },
    {
      id: "spider_nest",
      name: "Spider Nest",
      lore: "Something old spun these webs long before the spiders came.",
      difficulty: 1,
      mobs: ["minecraft:spider", "minecraft:cave_spider", { id: "minecraft:skeleton", from: 2, weight: 0.5 }, { id: "minecraft:bogged", from: 8, weight: 0.5 }, { id: "minecraft:witch", from: 12, weight: 0.3 }],
      flyers: ["minecraft:phantom"],
      boss: { mob: "minecraft:spider", name: "The Brood Mother", health: 60, adds: ["minecraft:cave_spider"] },
      wall: "minecraft:mossy_stone_bricks",
      floor: "minecraft:mossy_cobblestone",
      accent: "minecraft:stripped_dark_oak_log",
      trim: "minecraft:cobblestone",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:web", count: 7, breakable: true },
      crowns: 50,
      loot: [
        { item: "minecraft:string", min: 8, max: 20, chance: 1 },
        { item: "minecraft:spider_eye", min: 2, max: 6, chance: 0.8 },
        { item: "minecraft:iron_ingot", min: 4, max: 10, chance: 1 },
        { item: "minecraft:diamond", min: 1, max: 2, chance: 0.4 },
        { item: "minecraft:golden_apple", min: 1, max: 2, chance: 0.4 },
        { item: "minecraft:experience_bottle", min: 4, max: 10, chance: 0.8 },
      ],
    },
    {
      id: "ender_spire",
      name: "Ender Spire",
      lore: "A Starwright observatory turned upside down, still pointing at the stars.",
      difficulty: 3,
      mobs: ["minecraft:enderman", "minecraft:endermite", { id: "minecraft:shulker", from: 4, weight: 0.5 }, { id: "minecraft:skeleton", from: 2, weight: 0.5 }],
      flyers: ["minecraft:phantom", "minecraft:vex"],
      boss: { mob: "minecraft:enderman", name: "The Starless Walker", health: 100, adds: ["minecraft:endermite", "minecraft:enderman"] },
      wall: "minecraft:purpur_block",
      floor: "minecraft:end_bricks",
      accent: "minecraft:purpur_pillar",
      trim: "minecraft:end_stone",
      light: "minecraft:end_rod",
      door: "minecraft:iron_bars",
      decor: { block: "minecraft:end_rod", count: 2 },
      crowns: 110,
      loot: [
        { item: "minecraft:ender_pearl", min: 4, max: 10, chance: 1 },
        { item: "minecraft:shulker_shell", min: 1, max: 2, chance: 0.4 },
        { item: "minecraft:diamond", min: 2, max: 4, chance: 0.8 },
        { item: "minecraft:chorus_fruit", min: 6, max: 14, chance: 0.8 },
        { item: "minecraft:experience_bottle", min: 10, max: 18, chance: 1 },
      ],
    },
  ],
};
