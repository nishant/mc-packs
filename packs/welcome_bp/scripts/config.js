// Default welcome settings.
//
// These are only the *defaults*. Once an operator saves changes in-game with
// /welcome:edit, the saved version (stored in the world) wins. Run
// /welcome:reset to go back to what's in this file.
//
// Formatting:
//   \n          new line
//   §a §b §e …  colour codes (§l bold, §o italic, §r reset)
//   {player}    the joining player's name
//   {online}    number of players currently online

/** @typedef {typeof DEFAULTS} WelcomeSettings */

export const DEFAULTS = {
  /** Popup title bar. */
  title: "§l§6Welcome to the Realm!",

  /** Popup body text. */
  body:
    "Hey §b{player}§r, glad you're here!\n\n" +
    "§eRules§r\n" +
    "§7•§r Be kind, no griefing\n" +
    "§7•§r Ask before building near someone else\n" +
    "§7•§r Have fun\n\n" +
    "§7Players online: {online}",

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
