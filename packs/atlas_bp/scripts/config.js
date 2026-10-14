export const CONFIG = {
  /** Region banners, new sites and site rewards. Disabled, nothing new is built and nothing pays (sites already built stay). */
  enabled: true,

  /** Show a banner (title) when a player crosses into another region. Each player can also disable it in /realm:prefs. */
  banners: true,

  /** The side of a region, in blocks, on a grid centered on world spawn. Read when the world starts; never change it once players explore (every region and site moves). */
  cellSize: 512,

  /** Sites per region: at least this many... Read when the world starts. */
  poiMin: 2,

  /** ...and at most this many (up to 4). Read when the world starts. */
  poiMax: 4,

  /** A site is built when a player first comes within this many blocks of its spot. */
  buildRange: 64,

  /** A site is never built within this many blocks of a town, a land claim or a safe zone. */
  avoidRadius: 128,

  /** ...nor within this many blocks of a story place or a wanderer's camp (Story Questlines). */
  placeDistance: 48,

  /** ...nor within this many blocks of world spawn. */
  spawnDistance: 160,

  /** A player finds a site by coming within this many blocks of it. */
  findRange: 10,

  /** A shrine's blessing lasts this many minutes (once a day per player). */
  blessingMinutes: 10,

  /** Seconds a Fallen Watch Post must be held (three waves). */
  watchSeconds: 60,

  /** Crowns for each kind of site, the first time a player earns its reward. */
  crowns: { shrine: 10, tablet: 8, cairn: 15, camp: 10, hermit: 0, wreck: 15, watch: 15, fossil: 12, pool: 0, survey: 0 },

  /** Exploration XP (Skills) for finding any site, and the extra for a shrine. */
  findXp: 10,
  shrineXp: 30,

  /** Mining XP (Skills) for clearing a fossil dig. */
  fossilXp: 60,

  /** Starwright Flour (Kitchen) from a Starglass Pool, once per player per pool. */
  poolFlour: 2,

  /** Milestones: titles (Titles & Trails) at these counts, and the trail at `trailSites` sites. */
  milestones: {
    regions: [
      [10, "Surveyor"],
      [25, "Pathfinder"],
      [50, "Atlas-Maker"],
    ],
    sites: [
      [10, "Wayfarer of Stones"],
      [25, "Wayfinder"],
      [60, "Keeper of the Atlas"],
    ],
    tablets: [
      [12, "Tablet Reader"],
      [60, "Starwright Scholar"],
    ],
  },

  /** Sites found for the Starwright Glyphs trail (Titles & Trails). */
  trailSites: 25,
};
