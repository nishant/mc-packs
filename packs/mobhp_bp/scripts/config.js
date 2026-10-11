export const CONFIG = {
  /**
   * Where it shows for players who haven't chosen in /realm:prefs: "middle" (the subtitle line in the
   * middle of the screen) or "hotbar" (the action bar above the hotbar). Other add-ons that redraw the
   * action bar all the time, like waypoint and compass add-ons, can't cover the middle.
   */
  showAt: "middle",

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
