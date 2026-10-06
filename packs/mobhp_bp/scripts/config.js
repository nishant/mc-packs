export const CONFIG = {
  /** Mob health on the action bar for the whole realm. Disabled: nobody sees it, whatever they chose. */
  enabled: true,

  /** Players see mob health until they disable it for themselves with /realm:mobhp or in /realm:prefs. */
  defaultOn: true,

  /** Also show a player's health when you hurt another player. */
  players: false,

  /** How many | characters make up the health bar. */
  barLength: 10,

  /** How long (ticks) the Coordinates HUD leaves the health on the action bar before drawing itself again. */
  holdTicks: 40,
};
