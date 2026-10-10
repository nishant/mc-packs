export const CONFIG = {
  /** Rainbows appear on their own after rain. `/realm:rainbow_now` works either way. */
  enabled: true,

  /** Chance (0-1) of a rainbow when rain clears in the morning (time 0-3000) or evening (9000-12000). */
  chance: 0.7,

  /** Seconds a rainbow stays in the sky. */
  durationSeconds: 150,

  /** Its end (the pot of gold) is this many blocks from a random player in the Overworld: a random distance in this range. */
  distance: { min: 150, max: 300 },

  /** The pot of gold is never placed closer than this many blocks to the world spawn. */
  avoidSpawn: 64,

  /** Width of the rainbow in blocks as players see it (it's drawn about 100 blocks away, or at its real spot when closer). */
  size: 120,

  /** Minutes the pot of gold can be found after the rainbow appears. After that an empty pot chest is removed; one with items is left. */
  potMinutes: 15,

  /** Crowns paid to the first player who reaches the pot of gold (needs nothing else: any pack can show balances). */
  crowns: 50,

  /** Chance (0-1) the finder also gets a relic from one of `relics` (Relics pack; without it, nothing happens). */
  relicChance: 0.1,

  /** Relics the pot of gold can give (Relics pack ids). */
  relics: ["sun_pendant", "rain_charm"],

  /**
   * What goes in the pot of gold's chest: each entry is put in with its `chance` (0-1), a random
   * amount from `min` to `max`.
   * @type {{ item: string, min: number, max: number, chance: number }[]}
   */
  loot: [
    { item: "minecraft:gold_ingot", min: 3, max: 8, chance: 1 },
    { item: "minecraft:gold_nugget", min: 8, max: 24, chance: 1 },
    { item: "minecraft:golden_apple", min: 1, max: 1, chance: 0.3 },
    { item: "minecraft:magenta_dye", min: 1, max: 4, chance: 0.4 },
    { item: "minecraft:cyan_dye", min: 1, max: 4, chance: 0.4 },
    { item: "minecraft:pink_dye", min: 1, max: 4, chance: 0.4 },
    { item: "minecraft:light_blue_dye", min: 1, max: 4, chance: 0.4 },
    { item: "minecraft:lime_dye", min: 1, max: 4, chance: 0.4 },
    { item: "minecraft:emerald", min: 1, max: 3, chance: 0.25 },
  ],
};
