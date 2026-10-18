export const CONFIG = {
  /**
   * Where it shows for players who haven't chosen in /realm:prefs: one of the Side HUD boxes (Realm Resources)
   * "right1".."right4", "left1".."left4" (top to bottom) or "middle" (under the crosshair); "overhead" (a name
   * tag above the hit mob for holdTicks, which everyone nearby sees; players and mobs with a name show in
   * "left1" instead); or "hotbar" (the action bar above the hotbar). The boxes show at the same time as the
   * other packs' boxes, and other add-ons that redraw the action bar all the time can't cover them.
   * Without Side HUD the boxes' text shows in the middle of the screen.
   */
  showAt: "left1",

  /** Mob health on the action bar for the whole realm. Disabled: nobody sees it, whatever they chose. */
  enabled: true,

  /** Players see mob health until they disable it for themselves with /realm:mobhp or in /realm:prefs. */
  defaultOn: true,

  /** Also show a player's health when you hurt another player. */
  players: false,

  /** How many | characters make up the health bar. */
  barLength: 10,

  /** How long (ticks) the health shows after a hit (and the Coordinates HUD leaves it on the action bar). */
  holdTicks: 40,
};
