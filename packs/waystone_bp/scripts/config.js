// Waystones & Inns: who makes waystones, what travel costs, and what a bed at the inn gives.

export const CONFIG = {
  /** Who can make a new waystone by tapping a lodestone that has a `Waystone: <name>` sign: `everyone` or `operators`. */
  whoCanCreate: "everyone",

  /** What travel costs: `crowns` (the Crowns pack's money) or `levels` (XP levels). */
  currency: "crowns",

  /** Travel costs this much (Crowns or levels) per 100 blocks, rounded up. */
  costPer100: 1,

  /** The least a trip costs. */
  minCost: 1,

  /** Allow travel between waystones in different dimensions. */
  crossDimension: true,

  /** What a trip to another dimension costs (instead of the distance cost). */
  crossDimensionCost: 10,

  /** Seconds a player stands still at a waystone before traveling; moving or getting hurt cancels it. */
  channelSeconds: 10,

  /** `/realm:waystones` can start a trip from anywhere (otherwise only by tapping a waystone). */
  travelAnywhere: false,

  /** Standing this close (blocks) to a waystone discovers it. */
  discoverRadius: 4,

  /** At most this many waystones on the realm. */
  maxWaystones: 150,

  /** The NPC role (from the Townsfolk pack) whose NPCs rent beds and tell the news. */
  npcRole: "innkeeper",

  /** Crowns a bed at the inn costs. */
  bedPrice: 10,

  /** How long Well Rested lasts, in minutes: 2 extra hearts (Health Boost I). */
  wellRestedMinutes: 60,

  /** How many of the latest sky events (tornadoes, meteors, caravans...) an innkeeper remembers for "Hear the news". */
  newsKept: 6,
};
