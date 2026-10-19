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
  title: "§l§6Welcome!",

  /** Popup body text. Empty here: the default is built from the installed packs (see WELCOME below and main.js). */
  body: "",
  /** Text on the close button. */
  button: "§lClose",

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
 * The default welcome every world gets, the Realm included, until an operator saves their own. It names only
 * what the installed packs (pack folder -> line) really add, and no spoilers: nothing past the first day of the story.
 */
export const GENERIC = {
  title: "§l§6Welcome!",
  heading: { world: "The World", features: "What You Can Do", next: "Where To Go Next" },
  greeting: "Hey §b{player}§r, glad you're here! §7({online} online)§r",
  /** With Story Questlines: the story's first day (docs/STORY_BIBLE.md, section 1). */
  story:
    "A sleepy harbor town keeps an old secret. The harbor bell sank into the sea forty winters ago, yet lately it has been heard ringing again, and the stars look wrong.",
  /** With Story Questlines and Townsfolk: who starts it (the two prologue stories). */
  storyStart: "Tap §bOld Tobin§r or §bMara§r in town to begin §eThe Lantern and the Hollow§r.",
  /** Without Story Questlines. */
  noStory: "A world to explore, build and play in together.",
  /** @type {Record<string, string>} */
  lines: {
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
  },
  /** @type {Record<string, string>} */
  next: {
    help_bp: "§b/realm:help§r lists everything this server adds.",
    settings_bp: "§b/realm:prefs§r holds your own settings, this popup included.",
    saga_bp: "§b/realm:saga§r opens your story log: quests, hints and the codex.",
  },
  operators: "Operators: §b/realm:welcome_edit§r changes this message.",
};

/**
 * The Realm's old saved welcome, replaced once by the default above (welcome:migrated in main.js): only a saved
 * body that has this exact sentence goes (color codes ignored); its title and button go only when they are still the old built-in ones.
 */
export const LEGACY_REALM = {
  sentence: "Tap Old Tobin or Mara in town to begin",
  title: "§l§6Welcome to the Realm!",
  button: "§lLet's go!",
};