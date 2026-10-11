export const CONFIG = {
  /** Don't count playtime while a player has this tag (set by the AFK pack). "" = always count. */
  afkTag: "afk",

  /** How many players a leaderboard shows. */
  leaderboardSize: 10,

  /** What everyone's sidebar shows until an operator chooses: "off", "cycle" (rotates) or a stat id such as "deaths". */
  sidebar: "off",

  /** Seconds per stat when the sidebar is set to "cycle". */
  sidebarCycleSeconds: 30,

  /** The stats the sidebar rotates through in "cycle" mode. */
  sidebarStats: ["playtime", "deaths", "mobkills", "pvpkills", "mined", "placed", "travelled", "flown", "joins"],

  /** The stats ticker (each player's own stats above the hotbar) for the whole realm. Disabled: nobody sees it. */
  tickerEnabled: true,

  /** Players see the ticker before they ever choose. false: each player enables it in /realm:stats or /realm:prefs. */
  tickerDefaultOn: false,

  /** What players start with: "cycle" shows one stat at a time, "all" shows every chosen stat on one line. */
  tickerMode: "cycle",

  /** What players start with: seconds per stat when the ticker shows one at a time. */
  tickerSeconds: 5,

  /** What players start with: "full" (name, value and rank) or "compact" (short name and value). */
  tickerStyle: "full",

  /** What players start with: the color of the stat names and of the numbers (white, gray, dark_gray, gold, yellow, green, aqua, blue, light_purple, red). */
  tickerLabelColor: "gray",
  tickerValueColor: "white",

  /** What players start with: the stats the ticker shows. */
  tickerStats: ["playtime", "deaths", "mobkills", "mined", "travelled"],

  /** Movement faster than this (blocks/second) is a teleport and isn't counted as distance. */
  maxSpeed: 100,
};
