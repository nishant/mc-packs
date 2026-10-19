// Default welcome settings.
//
// These are only the *defaults*. Once an operator saves changes in-game with
// /realm:welcome_edit, the saved version (stored in the world) wins. Run
// /realm:welcome_reset to go back to what's in this file.
//
// Formatting:
//   \n          new line
//   §a §b §e ...  color codes (§l bold, §o italic, §r reset)
//   {player}    the joining player's name
//   {online}    number of players currently online

/** @typedef {typeof DEFAULTS} WelcomeSettings */

export const DEFAULTS = {
  /** Popup title bar. */
  title: "§l§6Welcome to the Realm!",

  /** Popup body text. */
  body:
    "Hey §b{player}§r, glad you're here! §7({online} online)§r\n\n" +
    "§l§6== The Story ==§r\n" +
    "A sleepy harbor town keeps an old secret. The drowned bell is ringing again, the stars are wrong, " +
    "and the townsfolk need a hero. Tap §bOld Tobin§r or §bMara§r in town to begin " +
    "§eThe Lantern and the Hollow§r, then follow the tracker on the right of your screen. " +
    "§b/realm:saga§r lists your quests.\n\n" +
    "§l§6== Adventure ==§r\n" +
    "§7-§r Expeditions, Champions and the Bounty Board (§b/realm:expedition§r, §b/realm:bounty§r)\n" +
    "§7-§r Wanderers, treasure maps and relics out in the wilds\n" +
    "§7-§r Skills, guilds and titles that grow as you play (§b/realm:skills§r)\n\n" +
    "§l§6== Life in Town ==§r\n" +
    "§7-§r Earn §eCrowns§r and spend them when the merchant caravan visits (§b/realm:crowns§r)\n" +
    "§7-§r Daily quests, town projects, the kitchen and better fishing\n" +
    "§7-§r Waystones for travel, land claims to keep your builds safe (§b/realm:claim§r)\n\n" +
    "§l§6== Sky and Seasons ==§r\n" +
    "§7-§r Storms, tornadoes, rainbows, meteors, blood moons and festivals (§b/realm:calendar§r)\n\n" +
    "§l§6== Handy ==§r\n" +
    "§b/realm:help§r  everything this realm adds\n" +
    "§b/realm:prefs§r  your own settings (HUD, minimap, popups)\n" +
    "§b/realm:party§r  team up with friends\n\n" +
    "§l§6== Rules ==§r\n" +
    "§7-§r Be kind, no griefing\n" +
    "§7-§r Ask before building near someone else\n" +
    "§7-§r Have fun",

  /** Text on the close button. */
  button: "§lLet's go!",

  /** true = show only once per player (until the message is edited); false = every join. */
  showOnce: false,

  /** Also post the title + body in that player's chat. */
  chat: false,

  /** Also flash the title in big on-screen text. */
  screenTitle: false,

  /** Ticks to wait after spawn before trying to show the popup (20 ticks = 1 second). */
  delayTicks: 40,
};

/**
 * What a server that is not this Realm sees until an operator edits the message: one line per installed pack
 * (pack folder -> line). It names no town, character, location or rule. The built-in text above is kept for
 * worlds that already ran it (see welcome:profile in main.js).
 */
export const GENERIC = {
  title: "§l§6Welcome!",
  intro: "Hey §b{player}§r, glad you're here! §7({online} online)§r",
  closing: "§b/realm:help§r  everything this server adds\n§7An operator can change this message with §b/realm:welcome_edit§r.",
  /** @type {Record<string, string>} */
  lines: {
    saga_bp: "Stories and quests to follow (§b/realm:saga§r)",
    quests_bp: "Daily quests (§b/realm:quests§r)",
    expedition_bp: "Expeditions (§b/realm:expedition§r)",
    bounty_bp: "A bounty board (§b/realm:bounty§r)",
    skills_bp: "Skills that grow as you play (§b/realm:skills§r)",
    crowns_bp: "Crowns to earn and spend (§b/realm:crowns§r)",
    claims_bp: "Land claims to keep your builds safe (§b/realm:claim§r)",
    calendar_bp: "A calendar of seasons and festivals (§b/realm:calendar§r)",
    party_bp: "Teams with friends (§b/realm:party§r)",
    mail_bp: "Mail for other players (§b/realm:mail§r)",
    map_bp: "A minimap (§b/realm:map§r)",
    stats_bp: "Your play stats (§b/realm:stats§r)",
    journal_bp: "A journal of what you have found (§b/realm:journal§r)",
    settings_bp: "Your own settings (§b/realm:prefs§r)",
  },
};
