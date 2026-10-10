const ORES = (/** @type {string} */ ore) => [`minecraft:${ore}_ore`, `minecraft:deepslate_${ore}_ore`];

export const CONFIG = {
  /** Skills gain XP and perks work. Disabled: no XP, no perks; levels are kept for later. */
  enabled: true,

  /** Players in creative mode gain no XP and get no perks. */
  skipCreative: true,

  /** The highest level a skill can reach. Read when the world starts. */
  maxLevel: 50,

  /**
   * XP needed to go from level n to n + 1 is round(xpBase * n ^ xpExponent): with 20 and 1.5, level 2
   * takes 20 XP, level 10 about 2,200 XP in all, level 20 about 13,400 and level 50 about 138,000. Read when the world starts.
   */
  xpBase: 20,

  /** See `xpBase`. Read when the world starts. */
  xpExponent: 1.5,

  /** Every XP gain is multiplied by this (0.5 = half, 2 = double), before the party bonus and perks. */
  xpMultiplier: 1,

  /** Extra XP, in percent, while a party mate (the Parties pack) is within `partyRange` blocks in the same dimension. */
  partyBonus: 10,

  /** How near a party mate has to be for `partyBonus`, in blocks. */
  partyRange: 64,

  /** A short note above the hotbar as you gain XP (`+12 Mining XP`), at most once a second. Each player can switch it in /realm:prefs. */
  xpNotes: true,

  /** Perks (double drops, short effects) work. Disabled: levels still go up, but perks do nothing. */
  perksEnabled: true,

  /** Tell everyone in chat when a player reaches `maxLevel` in a skill. */
  announceMaster: true,

  /** The title (Titles & Trails pack) a player unlocks on reaching `maxLevel` in each skill. */
  masterTitles: {
    mining: "Master Miner",
    woodcutting: "Master Woodcutter",
    farming: "Master Farmer",
    fishing: "Master Angler",
    combat: "Master Warrior",
    exploration: "Master Explorer",
  },

  mining: {
    /**
     * Blocks that give Mining XP when broken (not ones a player placed lately). `drop` is what the
     * double-drop perk adds (`amount` of it, default 1); blocks without `drop` are never doubled.
     * @type {{ blocks: string[], xp: number, drop?: string, amount?: number }[]}
     */
    blocks: [
      { blocks: ["minecraft:stone", "minecraft:deepslate", "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:tuff", "minecraft:calcite", "minecraft:blackstone", "minecraft:basalt", "minecraft:end_stone"], xp: 1 },
      { blocks: ORES("coal"), xp: 3, drop: "minecraft:coal" },
      { blocks: ORES("copper"), xp: 3, drop: "minecraft:raw_copper", amount: 2 },
      { blocks: ORES("iron"), xp: 5, drop: "minecraft:raw_iron" },
      { blocks: [...ORES("redstone"), "minecraft:lit_redstone_ore", "minecraft:lit_deepslate_redstone_ore"], xp: 4, drop: "minecraft:redstone", amount: 4 },
      { blocks: ORES("lapis"), xp: 6, drop: "minecraft:lapis_lazuli", amount: 4 },
      { blocks: ORES("gold"), xp: 7, drop: "minecraft:raw_gold" },
      { blocks: ORES("diamond"), xp: 15, drop: "minecraft:diamond" },
      { blocks: ORES("emerald"), xp: 15, drop: "minecraft:emerald" },
      { blocks: ["minecraft:quartz_ore"], xp: 3, drop: "minecraft:quartz" },
      { blocks: ["minecraft:nether_gold_ore"], xp: 3, drop: "minecraft:gold_nugget", amount: 3 },
      { blocks: ["minecraft:ancient_debris"], xp: 25 },
    ],

    /** Ores (blocks with a `drop`) mined with at most this many seconds between them count as one streak, for the Haste perk. */
    streakGapSeconds: 30,
  },

  woodcutting: {
    /** Logs and stems that give Woodcutting XP when broken (not ones a player placed lately). */
    logs: ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"].map((w) => `minecraft:${w}_log`).concat(["minecraft:crimson_stem", "minecraft:warped_stem"]),

    /** XP per log. */
    xp: 4,
  },

  farming: {
    /**
     * Crops that give Farming XP when harvested fully grown: broken, or reset by a tap (the
     * Right-click Harvest pack). `state`/`ripe`: the growth state and its fully grown value (without
     * them any break counts, if a player didn't place the block lately). `drop` is what the extra
     * crop perk adds; `seeds` what the seeds perk adds.
     * @type {{ block: string, state?: string, ripe?: number, xp: number, drop: string, seeds?: string }[]}
     */
    crops: [
      { block: "minecraft:wheat", state: "growth", ripe: 7, xp: 3, drop: "minecraft:wheat", seeds: "minecraft:wheat_seeds" },
      { block: "minecraft:carrots", state: "growth", ripe: 7, xp: 3, drop: "minecraft:carrot" },
      { block: "minecraft:potatoes", state: "growth", ripe: 7, xp: 3, drop: "minecraft:potato" },
      { block: "minecraft:beetroot", state: "growth", ripe: 7, xp: 3, drop: "minecraft:beetroot", seeds: "minecraft:beetroot_seeds" },
      { block: "minecraft:nether_wart", state: "age", ripe: 3, xp: 3, drop: "minecraft:nether_wart" },
      { block: "minecraft:cocoa", state: "age", ripe: 2, xp: 3, drop: "minecraft:cocoa_beans" },
      { block: "minecraft:melon_block", xp: 4, drop: "minecraft:melon_slice", seeds: "minecraft:melon_seeds" },
      { block: "minecraft:pumpkin", xp: 4, drop: "minecraft:pumpkin", seeds: "minecraft:pumpkin_seeds" },
    ],
  },

  fishing: {
    /** XP for a fish (an item in `fish`). */
    fishXp: 12,

    /** XP for a treasure (an item in `treasure`). */
    treasureXp: 25,

    /** XP for anything else caught (junk). */
    junkXp: 5,

    /** What counts as a fish. Only fish are doubled by the second-catch perk. */
    fish: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"],

    /** What counts as treasure. */
    treasure: ["minecraft:enchanted_book", "minecraft:name_tag", "minecraft:saddle", "minecraft:nautilus_shell", "minecraft:bow", "minecraft:fishing_rod"],
  },

  combat: {
    /** XP for killing a hostile or any other mob not listed in `passive`. */
    xp: 10,

    /** XP for killing a mob in `passive`. */
    passiveXp: 2,

    /** Animals and other peaceful mobs: less XP. */
    passive: ["cow", "pig", "sheep", "chicken", "rabbit", "horse", "donkey", "mule", "llama", "trader_llama", "cod", "salmon", "tropical_fish", "pufferfish", "squid", "glow_squid", "bat", "mooshroom", "goat", "camel", "armadillo", "sniffer", "frog", "tadpole", "turtle", "axolotl", "fox", "panda", "parrot", "ocelot", "cat", "wolf", "villager", "villager_v2", "wandering_trader", "allay", "strider", "dolphin", "polar_bear", "bee", "snow_golem", "iron_golem", "skeleton_horse", "zombie_horse"].map((m) => `minecraft:${m}`),

    /** Big mobs with their own XP instead of `xp`. @type {{ mob: string, xp: number }[]} */
    bosses: [
      { mob: "minecraft:ender_dragon", xp: 1000 },
      { mob: "minecraft:wither", xp: 600 },
      { mob: "minecraft:warden", xp: 300 },
      { mob: "minecraft:elder_guardian", xp: 150 },
      { mob: "minecraft:ravager", xp: 60 },
      { mob: "minecraft:evoker", xp: 40 },
    ],

    /** A champion (tag `realm:champion`, from the Champions pack) gives this many times the XP. */
    championMultiplier: 5,

    /** Never give XP for these (things that aren't really mobs, or can be made and broken again and again). */
    ignore: ["armor_stand", "npc", "player", "ender_crystal", "boat", "chest_boat", "minecart", "chest_minecart", "hopper_minecart", "tnt_minecart", "command_block_minecart", "painting", "leash_knot"].map((m) => `minecraft:${m}`),
  },

  exploration: {
    /** XP for each 16 x 16 chunk you enter for the first time (per dimension). */
    chunkXp: 4,

    /** One XP for every this many blocks traveled (any way but teleporting) in chunks you haven't been in lately (the last 128). */
    blocksPerXp: 50,

    /** At most this many new chunks a minute give XP (fast elytra flights find many); the rest are still remembered. */
    maxChunksPerMinute: 30,

    /** Movement faster than this (blocks per second) is a teleport: no distance XP. */
    maxSpeed: 100,

    /** Areas of 8 x 8 chunks remembered per player (about 20 characters each); the least recently visited are forgotten past this. */
    maxAreas: 4000,
  },

  /**
   * Perks per skill. Each unlocks at `level`; for each `perk` the highest unlocked row counts.
   * Kinds: `doubleOre` (mining: `chance` of one more of the ore's drop, not with Silk Touch), `haste`
   * (mining: Haste I for `seconds` after a streak of `streak` ores), `extraLog` (woodcutting: `chance`
   * of one more log), `apple` (woodcutting: `chance` of an apple), `extraCrop` (farming: `chance` of
   * one more crop), `seeds` (farming: `chance` of seeds), `secondCatch` (fishing: `chance` of a
   * second fish), `strength` (combat: `chance` of Strength I for `seconds` after a kill), `regen`
   * (combat: `chance` of Regeneration I for `seconds` after a kill), `speed` (exploration: Speed I for
   * `seconds` on entering a new chunk), `bonusXp` (any skill: `percent` more XP in that skill).
   * @type {Record<"mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration", { level: number, perk: string, chance?: number, seconds?: number, streak?: number, percent?: number }[]>}
   */
  perks: {
    mining: [
      { level: 10, perk: "doubleOre", chance: 0.05 },
      { level: 20, perk: "haste", streak: 20, seconds: 20 },
      { level: 30, perk: "doubleOre", chance: 0.1 },
      { level: 40, perk: "haste", streak: 12, seconds: 30 },
      { level: 50, perk: "doubleOre", chance: 0.15 },
    ],
    woodcutting: [
      { level: 10, perk: "extraLog", chance: 0.05 },
      { level: 20, perk: "apple", chance: 0.05 },
      { level: 30, perk: "extraLog", chance: 0.1 },
      { level: 40, perk: "apple", chance: 0.1 },
      { level: 50, perk: "extraLog", chance: 0.15 },
    ],
    farming: [
      { level: 10, perk: "extraCrop", chance: 0.05 },
      { level: 20, perk: "seeds", chance: 0.1 },
      { level: 30, perk: "extraCrop", chance: 0.1 },
      { level: 40, perk: "seeds", chance: 0.2 },
      { level: 50, perk: "extraCrop", chance: 0.15 },
    ],
    fishing: [
      { level: 10, perk: "secondCatch", chance: 0.05 },
      { level: 20, perk: "bonusXp", percent: 10 },
      { level: 30, perk: "secondCatch", chance: 0.1 },
      { level: 40, perk: "bonusXp", percent: 20 },
      { level: 50, perk: "secondCatch", chance: 0.15 },
    ],
    combat: [
      { level: 10, perk: "strength", chance: 0.05, seconds: 5 },
      { level: 20, perk: "bonusXp", percent: 10 },
      { level: 30, perk: "strength", chance: 0.1, seconds: 5 },
      { level: 40, perk: "regen", chance: 0.1, seconds: 4 },
      { level: 50, perk: "strength", chance: 0.15, seconds: 8 },
    ],
    exploration: [
      { level: 10, perk: "bonusXp", percent: 10 },
      { level: 20, perk: "speed", seconds: 10 },
      { level: 30, perk: "bonusXp", percent: 20 },
      { level: 40, perk: "speed", seconds: 20 },
      { level: 50, perk: "bonusXp", percent: 30 },
    ],
  },
};
