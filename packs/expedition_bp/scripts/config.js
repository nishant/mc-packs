export const CONFIG = {
  /** New expeditions can start. Disabled: `/realm:expedition` only shows the leaderboards (a run in progress finishes). */
  enabled: true,

  /**
   * Floor height (y) of the dungeon. It is built from 1 block under the floor to 7 blocks above it, deep
   * underground, so `-40` uses y -41 to -33. Keep it between -58 and -20.
   */
  depth: -40,

  /** The site must be at least this far (blocks, measured flat) from world spawn, so no dungeon is ever dug under the spawn town. */
  avoidSpawn: 64,

  /**
   * Expeditions that can run at the same time, each in its own dungeon. The first is at the site, each
   * further one `slotSpacing` blocks east of the one before.
   */
  slots: 1,

  /** Blocks between the dungeons of `slots` (east of the site). At least 64. */
  slotSpacing: 128,

  /** Most players in one expedition: the leader plus party members (1 to 4). */
  maxParty: 4,

  /** Party members must be within this many blocks of the leader to be asked along. */
  partyRadius: 32,

  /** Seconds party members have to answer "Join the expedition?". */
  confirmSeconds: 20,

  /** A run that isn't finished after this many minutes fails, and everyone is sent back. */
  timeLimitMinutes: 20,

  /** Seconds after the boss falls before everyone is sent back, to collect the treasure. */
  exitSeconds: 30,

  /** Items a player drops when dying in the dungeon are given back after they respawn (they would be lost when the dungeon resets). */
  returnItemsOnDeath: true,

  /** Fastest clears kept on each dungeon's leaderboard. */
  leaderboardSize: 10,

  /** Warden reputation (Guilds) for each player who finishes a run. */
  rep: 15,

  /** Chance (0 to 1) that each player who finishes a run is also given a relic (Relics pack). */
  relicChance: 0.1,

  /** Relics a finished run can give (one of these, at random). */
  relics: ["lantern_deep", "miners_lamp", "compass_echoes", "frost_band", "tide_boots"],

  /**
   * The dungeons players can pick. Each has a unique `id` (the leaderboard and Journal entries use it:
   * keep it when editing), a `name`, a `difficulty` (1 easy, 2 normal, 3 hard: more waves, more mobs
   * and a tougher boss), the `mobs` its combat rooms spawn, its `boss` (a mob, a name, and extra health
   * in points), its blocks (`wall`, `floor`, `accent` for pillars, `light` for the hanging lanterns,
   * `door` for the bars that close each room), `crowns` for each player who finishes, and the `loot`
   * in its treasure chest: each entry is an item, how many (`min` to `max`) and its `chance` (0 to 1).
   * @type {{ id: string, name: string, difficulty: 1 | 2 | 3, mobs: string[], boss: { mob: string, name: string, health: number },
   *   wall: string, floor: string, accent: string, light: string, door: string, crowns: number,
   *   loot: { item: string, min: number, max: number, chance: number }[] }[]}
   */
  dungeons: [
    {
      id: "crypt",
      name: "Crypt",
      difficulty: 1,
      mobs: ["minecraft:zombie", "minecraft:skeleton"],
      boss: { mob: "minecraft:wither_skeleton", name: "The Crypt Lord", health: 40 },
      wall: "minecraft:deepslate_bricks",
      floor: "minecraft:polished_deepslate",
      accent: "minecraft:chiseled_deepslate",
      light: "minecraft:soul_lantern",
      door: "minecraft:iron_bars",
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
      difficulty: 2,
      mobs: ["minecraft:drowned"],
      boss: { mob: "minecraft:drowned", name: "The Tide Keeper", health: 60 },
      wall: "minecraft:prismarine_bricks",
      floor: "minecraft:dark_prismarine",
      accent: "minecraft:prismarine",
      light: "minecraft:lantern",
      door: "minecraft:iron_bars",
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
      difficulty: 3,
      mobs: ["minecraft:stray"],
      boss: { mob: "minecraft:stray", name: "The Frost Archer", health: 80 },
      wall: "minecraft:packed_ice",
      floor: "minecraft:snow",
      accent: "minecraft:blue_ice",
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
  ],
};
