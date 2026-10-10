export const CONFIG = {
  /** Tornadoes form on their own during thunderstorms. `/realm:tornado_spawn` works either way. */
  enabled: true,

  /** Chance (0-1) that a thunderstorm brings one tornado. Rolled once when the thunderstorm starts. */
  chance: 0.2,

  /** Seconds after the thunderstorm starts that the tornado forms: a random time in this range. */
  formAfter: { min: 60, max: 240 },

  /** Seconds a tornado lasts: a random time in this range. */
  lifetime: { min: 90, max: 180 },

  /** How fast it drifts (blocks per second): a random speed in this range for each tornado. */
  speed: { min: 2, max: 4 },

  /** It forms this many blocks from a random player in the Overworld: a random distance in this range. */
  formDistance: { min: 80, max: 160 },

  /** It never forms or travels closer than this many blocks to the world spawn. */
  avoidSpawn: 64,

  /** Players within this many blocks see the funnel. */
  viewDistance: 128,

  /** Height of the funnel in blocks. */
  height: 40,

  /** Funnel rings drawn for each nearby player every 2 ticks (half as many beyond 64 blocks). */
  rings: 14,

  /** Multiplies `rings` and the debris: lower it if the funnel slows devices down, 0.25 to 1.5. */
  density: 1,

  /** Mobs, dropped items and players within this many blocks of the funnel are pulled in and lifted. */
  pullRadius: 12,

  /** Mobs and items are lifted up to this many blocks above the ground (they get Slow Falling, so they land safely). */
  liftHeight: 8,

  /** Players close to the funnel are thrown a few blocks, then get Slow Falling so they land safely. */
  throwPlayers: true,

  /** Seconds of Slow Falling after being thrown. */
  slowFallingSeconds: 6,

  /** Players within this many blocks get a chat warning (once per tornado) and hear the warning horn. */
  warnDistance: 150,

  /** Seconds between warning horns. 0 = no horn. */
  hornEvery: 20,

  /** Storm Glass dropped where the tornado dies down: a random count in this range. */
  stormGlass: { min: 2, max: 5 },

  /**
   * Vanilla sounds: `wind` near the funnel (within 48 blocks), `rumble` within 100 blocks, `horn` as
   * the warning. Each player hears them from the tornado's direction.
   */
  sounds: { wind: "elytra.loop", rumble: "ambient.weather.thunder", horn: "raid.horn" },
};
