export const CONFIG = {
  /** The minimap for the whole realm. Disabled: no compass strip or radar for anyone; /realm:map still gives the field map and keeps destinations. */
  enabled: true,

  /** The compass strip at the top of the screen, for players who haven't chosen in /realm:prefs. */
  compassDefault: true,

  /** The33-cell radar defaultsOFF; an existing player is resetOFF once before later opt-ins persist. */
  radarDefault: false,
  radarCells:33,radarRadius:36,revealRadius:36,nativeTerrain:true,fineDetail:false,

  /** Fixed compatibility constant: the Oak radar always keeps north up; older saved orientation values are ignored. */
  radarNorthUp: true,

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
   * How much script time the minimap may use a tick, for everyone together: "low" (budgets of about 0.7 ms a
   * tick; measured 1.2 ms with 10 players moving, 1.6 with 40), "normal" (1 ms; measured 1.5 and 2.1) or "high" (2.9 ms,
   * the budgets before October 2026; measured 2.5 and 3.6). With many players moving, a lower
   * level makes the strip and radar follow a little later and the radar's land and mob dots lag more; a strip never
   * fades for it. See BUDGET_LEVELS in scripts/main.js.
   */
  budgetLevel: "normal",
};
