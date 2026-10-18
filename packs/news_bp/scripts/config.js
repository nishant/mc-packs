// Defaults only. Ops can change everything in-game:
//   /realm:news_edit   edit the news popup
//   /realm:news_tips   add/edit/delete tips, change how often they're posted

export const DEFAULTS = {
  news: {
    title: "§l§bRealm News",
    body: "",
  },

  /**
   * The starting tip list, posted in turn. A tip with a `pack` is only posted while that pack is installed (it
   * answers /realm:help), so a server with a few packs gets no tips about the rest. Once an operator edits the
   * list in /realm:news_tips, the saved list is used as it is: the tips it showed, plus the edit. Keep each tip
   * to 100 characters, the most the tip editor's box takes.
   * @type {(string | { text: string, pack?: string })[]}
   */
  tips: [
    { text: "Run /realm:stats to see your stats and the leaderboards.", pack: "stats_bp" },
    { text: "Going AFK? Run /realm:afk, then the night can be skipped without you.", pack: "afk_bp" },
    { text: "Run /realm:help to see every realm command and how to use it.", pack: "help_bp" },
    { text: "Sneak and tap a chest to sort it, or to quick stack your inventory into the chests nearby.", pack: "stash_bp" },
    { text: "Lost track of where something is? /realm:find iron points to the chest that has it.", pack: "find_bp" },
    { text: "Run /realm:prefs to choose your own settings: warnings, phantoms, rain extras and more.", pack: "settings_bp" },
    { text: "Run /realm:mail to write a letter to any player, even one who is offline.", pack: "mail_bp" },
    { text: "Run /realm:quests to see today's quests and their rewards.", pack: "quests_bp" },
    { text: "Run /realm:nick to show a nickname in your own color above your head.", pack: "nick_bp" },
  ],

  /** Post a tip in chat every N minutes (only while someone is online). */
  tipIntervalMinutes: 20,
  tipsEnabled: true,
};

export const CONFIG = {
  /**
   * Post each bundle's release news (scripts/release.js, generated from docs/NEWS.md) once: it
   * replaces the news and pops up for everyone. false = only news operators write in game.
   */
  releaseNews: true,

  /** Ticks after joining before showing the news popup. Later than the welcome popup on purpose. */
  delayTicks: 100,

  /** Mention how long a player was away if it's at least this many hours. 0 = never. */
  awayNoticeHours: 12,

  /** Prefix for tips in chat. */
  tipPrefix: "§b[Tip]§r ",
};
