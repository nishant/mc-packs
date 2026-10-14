export const CONFIG = {
  /** The minimap for the whole realm. Disabled: no compass strip or radar for anyone; /realm:map still gives the field map and keeps destinations. */
  enabled: true,

  /** The compass strip at the top of the screen, for players who haven't chosen in /realm:prefs. */
  compassDefault: true,

  /** The radar (a 7 x 7 grid above the left side boxes), for players who haven't chosen. */
  radarDefault: false,

  /** The radar keeps north up for players who haven't chosen. false: it turns with the player, so ahead is always up. */
  radarNorthUp: false,

  /** Mobs show as red dots, for players who haven't chosen. */
  showMobs: true,

  /** How far mobs show (and how far the radar reaches), in blocks, for players who haven't chosen. */
  mobRadius: 24,

  /** The most any player may choose for their mob radius (8 to 48). The cost of the mob search grows with it. */
  mobRadiusMax: 32,

  /** At most this many mobs are drawn per player (the nearest). */
  maxMobs: 8,

  /** Players who aren't in your party show as white dots (within 128 blocks). Party mates always show. */
  showOthers: false,

  /** Townsfolk and wanderers this close show on the strip and the radar (blocks). */
  npcRange: 64,

  /** Wanderer camps and Atlas sites you found this close show on the strip (blocks). */
  placeRange: 256,

  /** A destination you picked clears when you get this close (blocks). The story target never does. */
  arriveDistance: 8,

  /** Spots each player can keep with "Mark this spot". */
  maxMarks: 5,

  /** How often (ticks) the strip and radar update. Read when the world starts. */
  intervalTicks: 10,
};
