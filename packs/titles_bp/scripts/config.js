export const CONFIG = {
  /** The pack's own work: built-in titles count up and trails show. Disabled: neither; titles from other packs are still recorded, and worn titles stay. */
  enabled: true,

  /** Trails follow the players who chose one. */
  trails: true,

  /** A trail puff every this many ticks (20 ticks = 1 second) while a player moves. */
  trailTicks: 4,

  /** At most this many trail puffs each time, shared by everyone (keeps a busy realm smooth). */
  trailBudget: 12,

  /** Tell everyone in chat when a player unlocks a title. */
  announceUnlocks: false,

  /** Movement faster than this (blocks per second) is a teleport and doesn't count for Wanderer. */
  maxSpeed: 100,

  /** Longest title, in characters. Longer ones from other packs are cut. */
  maxTitleLength: 32,

  /**
   * Titles this pack grants itself. `stat`: `distance` (blocks traveled, any way but teleporting),
   * `night` (seconds played while it's night in the Overworld) or `storm` (seconds outdoors in the
   * Overworld during a thunderstorm); `amount`: how much of it; `trail`: a trail unlocked with it
   * (`cloud`, `leaves`, `ember` or `sparkle`).
   * @type {{ title: string, stat: "distance" | "night" | "storm", amount: number, trail?: string }[]}
   */
  builtins: [
    { title: "Wanderer", stat: "distance", amount: 10000, trail: "leaves" },
    { title: "Night Owl", stat: "night", amount: 7200, trail: "sparkle" },
    { title: "Stormchaser", stat: "storm", amount: 600, trail: "cloud" },
  ],
};
