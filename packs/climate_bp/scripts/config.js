export const CONFIG = {
  /** Sandstorms, blizzards and fog banks happen. Disabled, the pack does nothing and clears its fogs. */
  enabled: true,

  /** Sandstorms (without a helmet) and blizzards give Slowness I. Disabled, they're only fog and particles. */
  slowness: true,

  /** Seconds a condition lingers after you step out of it, so a patch of other ground doesn't make it flicker. */
  lingerSeconds: 3,

  /** Particle bursts per second around each player in a sandstorm or blizzard (fog bank puffs are half that). */
  particlesPerSecond: 2,

  wind: {
    /** Wind speed for the blowing sand and snow, in blocks per second. */
    speed: 6,
    /** How fast the wind turns, in degrees per second, so storms drift around over a few minutes. */
    turnDegrees: 2,
  },

  sandstorm: {
    /**
     * Rain or a thunderstorm over sand, red sand, sandstone or terracotta (deserts and badlands, which get no rain)
     * blows up a sandstorm around players outdoors.
     */
    enabled: true,
    /** Wearing any helmet keeps the sand out of your eyes: no Slowness. */
    helmetProtects: true,
  },

  blizzard: {
    /** Rain or a thunderstorm where snow or ice is on top (snowy places) is a blizzard for players outdoors. */
    enabled: true,
    /** A lit campfire (or soul campfire) within this many blocks shelters you from the blizzard. */
    campfireRadius: 4,
  },

  fogbank: {
    /** Low fog rolls in by the water at dawn after rain. */
    enabled: true,
    /** Real minutes after the rain ends during which a dawn brings a fog bank. */
    minutesAfterRain: 30,
    /** Dawn starts at this time of day (ticks, 0-23999; 23000 is sunrise). */
    fromTime: 23000,
    /** ... and ends at this time of day (2500 is mid-morning). */
    toTime: 2500,
    /** Only below this height (the fog lies low, by lakes, rivers and the sea). */
    maxY: 80,
    /** Water must be within this many blocks to the side... */
    waterRadius: 6,
    /** ... and no more than this many blocks below your feet. */
    waterBelow: 3,
  },
};
