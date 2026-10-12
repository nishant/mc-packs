// Treasure Maps & Riddles: what a map costs, how far it leads, how it talks and what the chest holds.

export const CONFIG = {
  /**
   * Where Warmer / Colder shows for players who haven't chosen in /realm:prefs: one of the Side HUD boxes
   * (Realm Resources) "right1".."right4", "left1".."left4" (top to bottom) or "middle" (under the crosshair),
   * or "hotbar" (the action bar above the hotbar). The boxes show at the same time as the other packs' boxes,
   * and other add-ons that redraw the action bar all the time can't cover them. Without Side HUD the text
   * shows in the middle of the screen.
   */
  showAt: "right3",

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

  /** Fewest legs (clues) a hunt has; each leg but the last ends at a marker (a cairn, a flag or a standing stone) that holds the next clue. */
  legsMin: 2,

  /** Most legs a hunt has. Each leg uses a different kind of clue (a heading, compass steps, coordinates, or both), so at most 4. */
  legsMax: 4,

  /** Where no marker can stand (water, builds), coming this close (blocks, ignoring height) to the end of a leg finds the next clue in a bottle. */
  legRadius: 30,

  /**
   * Coming this close (blocks) to the planned end of a leg, once its land is loaded, settles it: the pack picks a landmark there
   * (water, the edge of a wood, a hilltop, a hollow, sand, snow, flowers or level ground), builds the marker at it (or buries the
   * chest) and the map names the landmark.
   */
  revealDistance: 96,

  /** On the last leg, how far from the planned spot (blocks) the chest may be buried when no landmark spot works. */
  searchRadius: 32,

  /** Never bury a chest or build a marker closer than this to the world spawn (blocks). */
  avoidSpawn: 64,

  /** Build a marker at the end of each leg but the last. Disabled: the next clue waits in a bottle, found by coming within `legRadius`. */
  markers: true,

  /** While holding a Treasure Map, the side box says Warmer, Colder or Very warm every 2 seconds (within `warmthRadius`). */
  warmth: true,

  /** Warmer / Colder only works this close (blocks) to the marker or the chest; farther away the map only says cold, cool or faintly warm. */
  warmthRadius: 64,

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
};
