export const CONFIG = {
  /**
   * The almanac runs the overworld weather: it sets the `doWeatherCycle` gamerule to false and plays its
   * own plan. Disabled, it puts the gamerule back the way it found it and the game's weather takes over.
   */
  enabled: true,

  /**
   * Story Questlines can ask for rain or a thunderstorm at story moments: the almanac plans it to start within
   * a few minutes (at most one request every 20 real minutes) and the forecast shows it. Needs `enabled` too.
   */
  storyEvents: true,

  /** How far ahead the plan reaches, in real hours. The forecast shows this far. */
  horizonHours: 3,

  clear: {
    /** Shortest clear spell, in real minutes. */
    minMinutes: 30,
    /** Longest clear spell, in real minutes. */
    maxMinutes: 90,
  },

  rain: {
    /** Shortest rain spell, in real minutes. */
    minMinutes: 8,
    /** Longest rain spell, in real minutes. */
    maxMinutes: 20,
  },

  thunder: {
    /** Shortest thunderstorm, in real minutes. */
    minMinutes: 6,
    /** Longest thunderstorm, in real minutes. */
    maxMinutes: 12,
  },

  /** Chance (0-1) that a clear spell ends in a thunderstorm straight away instead of rain. */
  thunderAfterClear: 0.1,

  /** Chance (0-1) that rain builds into a thunderstorm instead of clearing. */
  thunderAfterRain: 0.35,

  /** Chance (0-1) that a thunderstorm eases off into rain instead of clearing. */
  rainAfterThunder: 0.5,

  /** A one-line forecast in chat the first time each player joins on a (UTC) day. Players can switch it in /realm:prefs. */
  dailyForecast: true,

  /** The townsfolk role that offers "Forecast" when tapped (Townsfolk pack). Empty = no NPC offer. */
  npcRole: "skymage",
};
