export const CONFIG = {
  /** The coordinates HUD for the whole realm. Disabled: nobody sees it, whatever they chose; /realm:hud says so. */
  enabled: true,

  /** Players see the HUD before they ever run /realm:hud. Off: each player enables it for themselves. */
  defaultOn: false,

  /** Show the day number and the time of day after the coordinates. Each player can change it for themselves in /realm:prefs. */
  showTime: true,

  /** Facing in 8 directions (N, NE, E...). false: 4 directions (N, E, S, W). */
  eightWay: true,

  /**
   * Where the HUD shows for players who haven't chosen in /realm:prefs: "hotbar" (the action bar above the
   * hotbar) or one of the Side HUD boxes (Realm Resources) "right1".."right4", "left1".."left4" (top to bottom),
   * which show at the same time as the other packs' boxes. Without Side HUD a box's text shows in the middle.
   */
  showAt: "hotbar",

  /** How often (ticks) the HUD updates. 10 = twice a second, the fastest it goes. Read when the world starts. */
  intervalTicks: 10,

  /** Send an unchanged HUD again after this many ticks, so the action bar doesn't fade while you stand still. */
  refreshTicks: 40,
};
