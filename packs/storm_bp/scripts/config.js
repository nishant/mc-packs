export const CONFIG = {
  /** Thunderstorms in the overworld get a drifting storm cell. */
  enabled: true,

  /** The storm cell throws lightning. Disabled, it still drifts and shows on clocks and the Storm Meter. */
  lightning: true,

  /** A chat line when a storm cell forms (`A storm cell is forming to the NE.`). Players can choose for themselves in /realm:prefs. */
  formNotes: true,

  /** Seconds after a storm cell passes before the next can form (if the thunderstorm is still on). */
  gapSeconds: 60,

  /** A new cell forms this far from a random online player (blocks). */
  minDistance: 200,
  maxDistance: 500,

  /** How long a cell lasts (seconds), picked between these. */
  minLifeSeconds: 240,
  maxLifeSeconds: 480,

  /** How fast a cell drifts (blocks per second), picked between these for each cell. */
  minSpeed: 1,
  maxSpeed: 3,

  /** How fast the wind turns, at most (degrees per second). */
  turnPerSecond: 3,

  /** Lightning lands within this many blocks of the cell. */
  strikeRadius: 30,

  /** Seconds between strikes at strength 10 and at strength 1 (strikes come faster as the cell grows). */
  strikeSecondsMin: 3,
  strikeSecondsMax: 8,

  /** No lightning within this many blocks of world spawn (lightning rods still get struck there). */
  avoidSpawn: 64,

  /** Chance (0-1) that a strike goes to an uncharged lightning rod a player placed within strikeRadius of the cell, when there is one. */
  rodChance: 0.5,

  /** Lightning rods remembered (placed by players). Past this, the oldest are forgotten. */
  maxRods: 200,

  /** Storm Glass from tapping a charged rod, picked between these. */
  glassMin: 1,
  glassMax: 2,

  /** Players within this many blocks of the cell get the Field Journal's "Storm cell" entry. */
  journalRadius: 64,

  /** Operators' `/realm:storm_cell` puts the cell this far from them (blocks), picked between these. */
  commandMinDistance: 48,
  commandMaxDistance: 96,
};
