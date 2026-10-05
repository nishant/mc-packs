export const CONFIG = {
  /** Extras start off for players who never ran /realm:rain. */
  defaultOff: false,

  stormFog: {
    /** Thunderstorms roll in denser, darker fog for each player (the fog itself comes from Realistic Rain). */
    enabled: true,
    /** Seconds the storm fog takes to roll in, and again to clear, in three steps. */
    fadeSeconds: 12,
  },

  mist: {
    /** Low mist near the ground around each player during thunderstorms, when outdoors. */
    enabled: true,
    /** Mist puffs per second per player. Each puff is 4 soft sprites that live about 4 s (2 → about 32 on screen). */
    puffsPerSecond: 2,
  },

  drips: {
    /** Water dripping from leaves and roof edges near each player while it rains. */
    enabled: true,
    /** Drips per second per player, shared across the spots found. */
    perSecond: 5,
    /** Seconds drips keep falling after the rain stops, tapering off. */
    afterRainSeconds: 30,
    /** How far from the player (blocks) to look for leaves and roof edges. */
    radius: 6,
    /** Block lookups per second per player for drips and mist: the main server cost. */
    lookupsPerSecond: 6,
  },
};
