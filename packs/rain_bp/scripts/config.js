export const CONFIG = {
  /** Extras start off for players who never ran /realm:rain. */
  defaultOff: false,

  stormFog: {
    /** Thunderstorms roll in denser, darker fog for each player (the fog itself comes from Realistic Rain). */
    enabled: true,
    /** Seconds the storm fog takes to roll in, and again to clear, in three steps. */
    fadeSeconds: 12,
  },

  haze: {
    /** A darker, blue-gray haze in rain and thunderstorms for players on Vibrant Visuals, which ignores fog colors. Fancy is unaffected. */
    enabled: true,
    /** Seconds the haze takes to thicken, and again to clear, in two steps. */
    fadeSeconds: 10,
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

  wind: {
    /** Gusting wind while it rains: strong in thunderstorms, a soft breeze in plain rain, muffled indoors. */
    enabled: true,
    /** Wind volume in thunderstorms, 0-1. */
    inThunder: 0.7,
    /** Wind volume in plain rain, 0-1. */
    inRain: 0.35,
  },

  stormSound: {
    /** The thunderstorm recording, played around each player for as long as a thunderstorm lasts, muffled indoors. */
    enabled: true,
    /** Volume, 0-1. */
    volume: 1,
  },

  roof: {
    /** Rain drumming on the roof while you're indoors (a roof 2 to maxHeadroom blocks over your head, not leaves). */
    enabled: true,
    /** Volume, 0-1. */
    volume: 0.8,
    /** Highest roof (blocks above your feet) that still counts as being indoors. */
    maxHeadroom: 10,
    /**
     * Muffled rain indoors: under a roof (or deep underground) the game's own rain sound is stopped for you, and under a
     * roof you hear the rain muffled through it instead (at `volume`). Bedrock plays its rain the same indoors and out.
     */
    muffleRain: true,
  },
};
