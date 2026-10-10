const ORES = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"].flatMap((o) => [`minecraft:${o}_ore`, `minecraft:deepslate_${o}_ore`]);

export const CONFIG = {
  /** The four guilds: the name players see and the word their titles use ("Master Miner"). Keep the keys: reputation is saved by them. */
  guilds: {
    miners: { name: "Miners' Guild", member: "Miner" },
    growers: { name: "Growers' Guild", member: "Grower" },
    wardens: { name: "Wardens' Guild", member: "Warden" },
    wayfarers: { name: "Wayfarers' Guild", member: "Wayfarer" },
  },

  /** The ranks, lowest first, and the reputation each needs. The first must need 0. */
  ranks: [
    { name: "Initiate", rep: 0 },
    { name: "Member", rep: 100 },
    { name: "Journeyman", rep: 300 },
    { name: "Expert", rep: 700 },
    { name: "Master", rep: 1500 },
  ],

  /** Ranks (1 = the first) that unlock a title, sent to the Titles pack: "Expert Miner", "Master Miner". */
  titleRanks: [4, 5],

  /** Rank (1 = the first) each guild's perk needs. 3 = Journeyman. */
  perkRank: 3,

  /** Reaching one of these ranks (1 = the first) is announced to everyone, not just the player. */
  announceRanks: [4, 5],

  /**
   * Reputation for a finished quest (the `realm:quest_done` event from Daily Quests, Questlines,
   * the Bounty Board, treasure maps, town projects...), by its kind. Kinds go to guilds as in
   * `kindGuild`; a quest that names a guild goes to that guild; anything else is split evenly
   * between all four.
   */
  questRep: { mine: 10, kill: 10, harvest: 10, place: 10, travel: 10, eat: 10, fish: 10, story: 30, bounty: 25, treasure: 20, town: 15, tournament: 20, expedition: 30, other: 10 },

  /** Which guild each quest kind counts for. */
  kindGuild: { mine: "miners", place: "miners", harvest: "growers", eat: "growers", kill: "wardens", bounty: "wardens", travel: "wayfarers", fish: "wayfarers", treasure: "wayfarers", expedition: "wardens" },

  /** Reputation from plain play, so it moves without the other packs. */
  passive: {
    /** Earn reputation from plain play at all. */
    enabled: true,
    /** Miners: 1 reputation per this many ores mined (from `ores`; ores a player placed lately don't count). */
    oresPerRep: 10,
    /** Growers: 1 reputation per this many fully grown crops harvested (from `crops`, broken or tapped). */
    cropsPerRep: 25,
    /** Wardens: 1 reputation per this many hostile mobs defeated. */
    killsPerRep: 10,
    /** Wardens: reputation for defeating or helping to defeat a champion (the Champions pack). */
    championRep: 5,
    /** Wayfarers: 1 reputation per this many blocks traveled (any way; teleports don't count). */
    blocksPerRep: 500,
  },

  /** What counts as an ore for the Miners. */
  ores: [...ORES, "minecraft:nether_gold_ore", "minecraft:quartz_ore", "minecraft:ancient_debris"],

  /** What counts as a grown crop for the Growers, `{ block, state, ripe, drop }`: its growth state and fully grown value (none: any break counts), and the item the Growers' perk adds. */
  crops: [
    { block: "minecraft:wheat", state: "growth", ripe: 7, drop: "minecraft:wheat" },
    { block: "minecraft:carrots", state: "growth", ripe: 7, drop: "minecraft:carrot" },
    { block: "minecraft:potatoes", state: "growth", ripe: 7, drop: "minecraft:potato" },
    { block: "minecraft:beetroot", state: "growth", ripe: 7, drop: "minecraft:beetroot" },
    { block: "minecraft:nether_wart", state: "age", ripe: 3, drop: "minecraft:nether_wart" },
    { block: "minecraft:cocoa", state: "age", ripe: 2, drop: "minecraft:cocoa_beans" },
    { block: "minecraft:melon_block", drop: "minecraft:melon_slice" },
    { block: "minecraft:pumpkin", drop: "minecraft:pumpkin" },
  ],

  /** Hostile mobs that count for the Wardens. */
  hostile: [
    "minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager_v2", "minecraft:skeleton", "minecraft:stray",
    "minecraft:bogged", "minecraft:spider", "minecraft:cave_spider", "minecraft:creeper", "minecraft:witch", "minecraft:slime",
    "minecraft:phantom", "minecraft:pillager", "minecraft:vindicator", "minecraft:evocation_illager", "minecraft:ravager", "minecraft:vex",
    "minecraft:enderman", "minecraft:silverfish", "minecraft:endermite", "minecraft:guardian", "minecraft:elder_guardian", "minecraft:blaze",
    "minecraft:ghast", "minecraft:magma_cube", "minecraft:wither_skeleton", "minecraft:piglin_brute", "minecraft:hoglin", "minecraft:zoglin",
    "minecraft:shulker", "minecraft:breeze", "minecraft:creaking", "minecraft:warden",
  ],

  /** The perks, each for its guild's players at `perkRank` or higher. */
  perks: {
    /** Apply the perks at all. */
    enabled: true,
    miners: {
      /** Mining this many ores within `seconds` gives Haste I... */
      ores: 20,
      /** See `ores`. */
      seconds: 60,
      /** ...for this many seconds. */
      hasteSeconds: 30,
    },
    growers: {
      /** Chance a grown crop drops one extra (0.25 = one in four). */
      extraChance: 0.25,
    },
    wardens: {
      /** Seconds of Strength I after defeating or helping to defeat a champion. */
      strengthSeconds: 10,
    },
    wayfarers: {
      /** Sprinting this many blocks gives Speed I... */
      sprintBlocks: 200,
      /** ...for this many seconds. */
      speedSeconds: 20,
    },
  },

  /**
   * Each guild's shop, paid in Crowns: `{ item, amount, price, rank }`. `rank` (1 = the first) is the
   * rank that unlocks it.
   * @type {Record<string, { item: string, amount: number, price: number, rank: number }[]>}
   */
  shops: {
    miners: [
      { item: "minecraft:torch", amount: 32, price: 8, rank: 1 },
      { item: "minecraft:iron_pickaxe", amount: 1, price: 40, rank: 2 },
      { item: "minecraft:tnt", amount: 4, price: 60, rank: 3 },
      { item: "minecraft:diamond_pickaxe", amount: 1, price: 200, rank: 4 },
      { item: "minecraft:netherite_scrap", amount: 1, price: 400, rank: 5 },
    ],
    growers: [
      { item: "minecraft:bone_meal", amount: 16, price: 6, rank: 1 },
      { item: "minecraft:golden_carrot", amount: 8, price: 30, rank: 2 },
      { item: "minecraft:cherry_sapling", amount: 4, price: 40, rank: 3 },
      { item: "minecraft:golden_apple", amount: 2, price: 120, rank: 4 },
      { item: "minecraft:sniffer_egg", amount: 1, price: 400, rank: 5 },
    ],
    wardens: [
      { item: "minecraft:arrow", amount: 32, price: 10, rank: 1 },
      { item: "minecraft:iron_sword", amount: 1, price: 30, rank: 2 },
      { item: "minecraft:shield", amount: 1, price: 40, rank: 3 },
      { item: "minecraft:totem_of_undying", amount: 1, price: 300, rank: 4 },
      { item: "minecraft:trident", amount: 1, price: 500, rank: 5 },
    ],
    wayfarers: [
      { item: "minecraft:bread", amount: 8, price: 6, rank: 1 },
      { item: "minecraft:empty_map", amount: 1, price: 20, rank: 2 },
      { item: "minecraft:ender_pearl", amount: 4, price: 60, rank: 3 },
      { item: "minecraft:saddle", amount: 1, price: 80, rank: 4 },
      { item: "minecraft:heart_of_the_sea", amount: 1, price: 300, rank: 5 },
    ],
  },

  /** NPCs with this role (the Townsfolk pack's guildmaster, Warden Reyes) offer the "Guild hall". */
  npcRole: "guildmaster",

  /** Movement faster than this (blocks per second) is a teleport and doesn't count as travel. */
  maxSpeed: 100,
};
