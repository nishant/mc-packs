export const CONFIG = {
  /**
   * Where it shows for players who haven't chosen in /realm:prefs: one of the Side HUD boxes (Realm Resources)
   * "right1".."right4", "left1".."left4" (top to bottom) or "middle" (under the crosshair), or "hotbar" (the
   * action bar above the hotbar). The boxes show at the same time as the other packs' boxes, and other add-ons
   * that redraw the action bar all the time can't cover them. Without Side HUD the text shows in the middle.
   */
  showAt: "left2",

  /** The gliding HUD for the whole realm. Disabled: nobody sees it, and /realm:elytra says so. */
  enabled: true,

  /** Ticks between HUD updates while gliding (5 = 4 times a second). */
  intervalTicks: 5,

  /** Elytra durability left (percent) at or below which the HUD shows it in red. */
  lowPercent: 10,

  /** Allow using NOS Rockets (custom:nos_rocket) while gliding with an elytra. */
  nosEnabled: true,

  /** NOS Rocket boost multiplier relative to normal firework baseline (3.0 to 4.0). */
  nosMultiplier: 3.5,

  /** Normal firework rocket impulse baseline in blocks/tick. */
  nosBaseline: 0.75,

  /** Maximum total flight speed cap in blocks/tick (~72 blocks/s) so repeated NOS Rockets do not compound infinitely. */
  nosMaxSpeed: 3.6,

  /** Sustained full-boost turbo hold duration in ticks (50 ticks = 2.5s at peak speed, plus 0.55s spool-up and 4.5s slow taper). */
  nosBurstTicks: 50,
};
