// Defaults only. Ops can change everything in-game:
//   /realm:news_edit   edit the news popup
//   /realm:news_tips   add/edit/delete tips, change how often they're posted

export const DEFAULTS = {
  news: {
    title: "§l§bRealm News",
    body: "",
  },

  tips: [
    "Sneak while breaking a log to fell the whole tree.",
    "Sneak while mining ore to mine the whole vein.",
    "Use the Waypoint Menu item to save and share teleport points.",
    "Run /realm:stats to see your stats and the leaderboards.",
    "Going AFK? Run /realm:afk, then the night can be skipped without you.",
  ],

  /** Post a tip in chat every N minutes (only while someone is online). */
  tipIntervalMinutes: 20,
  tipsEnabled: true,
};

export const CONFIG = {
  /** Ticks after joining before showing the news popup. Later than the welcome popup on purpose. */
  delayTicks: 100,

  /** Mention how long a player was away if it's at least this many hours. 0 = never. */
  awayNoticeHours: 12,

  /** Prefix for tips in chat. */
  tipPrefix: "§b[Tip]§r ",
};
