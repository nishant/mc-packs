export const CONFIG = {
  /** The minimap for the whole realm. Disabled: no compass strip or radar for anyone; /realm:map still gives the field map and keeps destinations. */
  enabled: true,

  /** The compass strip at the top of the screen, for players who haven't chosen in /realm:prefs. */
  compassDefault: true,

  /** The radar (a 7 x 7 grid at the top right below the compass strip), for players who haven't chosen. */
  radarDefault: true,

  /** The radar keeps north up for players who haven't chosen. false: it turns with the player, so ahead is always up. */
  radarNorthUp: false,

  /** The radar colors empty cells by the land around you (grass, water, sand, forest, stone, snow, paths, caves). */
  radarTerrain: true,

  /** Mobs show as red dots, for players who haven't chosen. */
  showMobs: true,

  /** How far mobs show (and how far the radar reaches), in blocks, for players who haven't chosen. */
  mobRadius: 24,

  /** The most any player may choose for their mob radius (8 to 48). The cost of the mob search grows with it. */
  mobRadiusMax: 32,

  /** At most this many mobs are drawn per player (the nearest). */
  maxMobs: 8,

  /** The nearest town (Town Projects) shows as a house on the strip and the radar, for players who haven't chosen. */
  showTown: true,

  /** Your bed or respawn anchor shows as a bed on the strip and the radar, for players who haven't chosen. */
  showHome: true,

  /** Players who aren't in your party show as white dots and arrows. Party mates always show. */
  showOthers: true,

  /** Townsfolk and wanderers this close show on the strip and the radar (blocks). */
  npcRange: 64,

  /** Wanderer camps and Atlas sites you found this close show on the strip (blocks). */
  placeRange: 256,

  /** A destination you picked clears when you get this close (blocks). The story target never does. */
  arriveDistance: 8,

  /** Spots each player can keep with "Mark this spot". */
  maxMarks: 5,

  /** How often (ticks) the markers, destination and region are looked up again. The strip and radar turn with you every tick in between. Read when the world starts. */
  intervalTicks: 10,

  /**
   * How much script time the minimap may use a tick, for everyone together: "low" (about 1.7 ms a tick at most),
   * "normal" (about 2.9 ms) or "high" (about 4.4 ms). The drawing, terrain pictures, passes and the terrain scanner
   * each get this share of their budget (0.6, 1 or 1.5 times the constants at the top of scripts/main.js). Lower
   * costs the server less; with many players moving at once each one's strip and radar then come a little later.
   */
  budgetLevel: "normal",
};
