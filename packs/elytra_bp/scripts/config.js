export const CONFIG = {
  /**
   * Where it shows for players who haven't chosen in /realm:prefs: one of the Side HUD boxes (Realm Resources)
   * "right1".."right4", "left1".."left4" (top to bottom) or "middle" (under the crosshair), or "hotbar" (the
   * action bar above the hotbar). The boxes show at the same time as the other packs' boxes, and other add-ons
   * that redraw the action bar all the time can't cover them. Without Side HUD the text shows in the middle.
   */
  showAt: "right2",

  /** The gliding HUD for the whole realm. Disabled: nobody sees it, and /realm:elytra says so. */
  enabled: true,

  /** Ticks between HUD updates while gliding (5 = 4 times a second). */
  intervalTicks: 5,

  /** Elytra durability left (percent) at or below which the HUD shows it in red. */
  lowPercent: 10,
};
