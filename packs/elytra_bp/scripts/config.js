export const CONFIG = {
  /**
   * Where it shows for players who haven't chosen in /realm:prefs: "middle" (the subtitle line in the
   * middle of the screen) or "hotbar" (the action bar above the hotbar). Other add-ons that redraw the
   * action bar all the time, like waypoint and compass add-ons, can't cover the middle.
   */
  showAt: "middle",

  /** The gliding HUD for the whole realm. Disabled: nobody sees it, and /realm:elytra says so. */
  enabled: true,

  /** Ticks between HUD updates while gliding (5 = 4 times a second). */
  intervalTicks: 5,

  /** Elytra durability left (percent) at or below which the HUD shows it in red. */
  lowPercent: 10,
};
