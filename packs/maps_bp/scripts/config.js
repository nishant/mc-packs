// Treasure Maps & Riddles: what a map costs, how far it leads, how it talks and what the chest holds.

export const CONFIG = {
  /** Crowns a treasure map costs at a cartographer. */
  price: 50,

  /** The NPC role (from the Townsfolk pack) whose NPCs sell treasure maps. */
  npcRole: "cartographer",

  /** Treasure hunts a player can have at once. */
  maxHunts: 1,

  /** The treasure is at least this many blocks (straight line) from where the map was bought. */
  minDistance: 800,

  /** ...and at most this many. */
  maxDistance: 2000,

  /** Fewest legs (clues) a hunt has; each leg ends at a spot where the next clue appears. */
  legsMin: 2,

  /** Most legs a hunt has. */
  legsMax: 3,

  /** Coming this close (blocks, ignoring height) to the end of a leg reveals the next clue. */
  legRadius: 30,

  /** The chest is buried once the player is this close to the treasure (blocks) and its chunk is loaded. */
  buryDistance: 48,

  /** How far from the planned spot (blocks) the chest may be buried, to find dry land away from builds. */
  searchRadius: 32,

  /** Never bury a chest closer than this to the world spawn (blocks). */
  avoidSpawn: 64,

  /** While holding a Treasure Map, the actionbar says Warmer, Colder or Very warm every 2 seconds. */
  warmth: true,

  /** "Very warm" within this many blocks of the next clue or the chest. */
  veryWarm: 40,

  /** /realm:maps also shows the plain direction and distance, e.g. `(W, about 1000 blocks)`, under the riddle. */
  plainHints: false,

  /** Crowns found with the treasure: a random amount from `crownsMin` to `crownsMax`, paid when the player reaches the chest. */
  crownsMin: 30,

  /** ...up to this many. */
  crownsMax: 90,

  /** Wayfarers guild reputation for finding a treasure (sent to the Guilds pack). */
  reputation: 10,

  /** Exploration skill XP for finding a treasure (sent to the Skills pack). */
  skillXp: 50,

  /** Chance (0-1) that a treasure also holds a relic (asked of the Relics pack, from `relics`). */
  relicChance: 0.1,

  /** The relics a treasure can hold (relic ids from the Relics pack). */
  relics: ["compass_echoes", "wayfarer_boots", "sun_pendant", "rain_charm"],

  /**
   * What the chest holds: each line is rolled on its own (`chance` 0-1) for `min` to `max` of `item`. A chest that rolls
   * nothing gets the first line.
   * @type {{ item: string, min: number, max: number, chance: number }[]}
   */
  loot: [
    { item: "minecraft:gold_ingot", min: 2, max: 6, chance: 0.8 },
    { item: "minecraft:iron_ingot", min: 3, max: 8, chance: 0.7 },
    { item: "minecraft:emerald", min: 1, max: 5, chance: 0.5 },
    { item: "minecraft:diamond", min: 1, max: 2, chance: 0.25 },
    { item: "minecraft:golden_apple", min: 1, max: 1, chance: 0.2 },
    { item: "minecraft:ender_pearl", min: 1, max: 3, chance: 0.3 },
    { item: "minecraft:experience_bottle", min: 3, max: 8, chance: 0.5 },
    { item: "minecraft:name_tag", min: 1, max: 1, chance: 0.15 },
    { item: "minecraft:saddle", min: 1, max: 1, chance: 0.1 },
    { item: "minecraft:heart_of_the_sea", min: 1, max: 1, chance: 0.03 },
  ],

  /**
   * How each direction reads in a clue, starting north and going clockwise (N, NE, E, SE, S, SW, W, NW).
   */
  directions: [
    "toward the North Star",
    "between the North Star and the rising sun",
    "toward the rising sun",
    "between the rising sun and the warm south wind",
    "with the North Star at your back",
    "between the warm south wind and the setting sun",
    "toward the setting sun",
    "between the setting sun and the North Star",
  ],

  /** Clues for a leg that ends at another clue: `{dir}` is a direction from `directions`, `{dist}` a distance such as "about twelve hundred". */
  clues: [
    "Walk {dir} for {dist} paces, and there the next riddle waits.",
    "Follow the path {dir}. After {dist} paces, look about you for the next sign.",
    "{dist} paces {dir}, where an old traveler left another mark.",
    "Turn {dir} and count {dist} paces. The next clue lies there.",
  ],

  /** Clues for the last leg, to the treasure. */
  finalClues: [
    "Walk {dir} for {dist} paces, to where the treasure lies buried.",
    "The last stretch: {dist} paces {dir}. Dig where the map grows warm.",
    "{dist} paces {dir}, and the X is beneath your feet.",
  ],
};
