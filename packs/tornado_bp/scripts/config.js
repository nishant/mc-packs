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

  /**
   * Safe zones (Safe Zones, protected towns and claims). A tornado never breaks blocks anywhere; this is about
   * whether it pulls players inside a zone. "pass": it goes through safe zones like anywhere else; "calm": inside a
   * safe zone it leaves players alone; "avoid": it never forms near one and turns away from them (and is calm
   * inside one, if an operator spawns it there).
   */
  zoneMode: "pass",

  /** Players within this many blocks see the funnel. */
  viewDistance: 128,

  /** Height of the funnel in blocks. */
  height: 42,

  /**
   * Rings of vortex cloud stacked from the ground to the top of the funnel, for each player near it (half as many
   * beyond 64 blocks). The funnel is redrawn in slices every 2 ticks, plus a churning ground dust skirt and storm collar.
   */
  rings: 24,

  /** Multiplies `rings` and the debris: lower it if the funnel slows devices down, 0.25 to 1.5. */
  density: 1,

  /** Players within this many blocks of the funnel are sucked in, spun around up the vortex, and shot out the top. */
  pullRadius: 14,

  /** Extra height boost above the funnel top when shooting a player into the sky. */
  liftHeight: 16,

  /** Players close to the funnel are sucked in, spun up the funnel, and shot high out the top (in any gamemode). */
  throwPlayers: true,

  /** Seconds of Slow Falling given after being shot out the top of the funnel so players land safely. */
  slowFallingSeconds: 8,

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
