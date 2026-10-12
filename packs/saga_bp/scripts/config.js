// Story Questlines options. The stories themselves are in stories.js.
export const CONFIG = {
  /** Stories can be started and make progress. Disabled, the story log still opens but nothing counts. */
  enabled: true,

  /** The story tracker above the hotbar (`Drowned Bell: Lighthouse NE 240m`), for players who haven't chosen in /realm:prefs. */
  tracker: true,

  /**
   * Where the tracker and progress notes show for players who haven't chosen in /realm:prefs: one of the Side
   * HUD boxes (Realm Resources) "right1".."right4", "left1".."left4" (top to bottom) or "middle" (under the
   * crosshair), or "hotbar" (the action bar above the hotbar). The boxes show at the same time as the other
   * packs' boxes, and other add-ons that redraw the action bar all the time can't cover them. Without Side HUD
   * the text shows in the middle of the screen.
   */
  trackerAt: "right4",

  /** Party mates (Parties pack) on the same chapter share progress for defeat, survive and reach objectives. */
  partyShare: true,

  /** How close (blocks) a party mate must be to share progress. */
  partyRange: 64,

  /** Players in creative mode make no story progress. */
  skipCreative: true,

  /** Tell operators online when a player's chapter needs a place nobody has set yet (at most every 10 minutes per place). */
  opHints: true,

  /**
   * When no Champions pack answers a champion request within 3 seconds, spawn the story's mob
   * ourselves: a named vanilla mob made tougher with effects.
   */
  championFallback: true,

  /** Seconds before a story champion is asked for again at the same place (when the last one is gone). */
  championRetrySeconds: 120,

  /** Where story offers sit among an NPC's buttons (lower is higher up; offers default to 50). */
  offerOrder: 20,

  /**
   * "Ask for a hint" takes this share of the chapter's levels and Crowns (once per chapter). 0 = hints
   * are free; 1 = a hinted chapter pays no levels or Crowns (items, relics and titles are kept).
   */
  hintPenalty: 0.25,

  /**
   * A chapter that needs a place nobody has set gets one picked by the pack (by the place's site
   * rules: distance from world spawn, coast, water, high ground...), and its building is built when a
   * player comes close. Disabled, operators set every place by hand.
   */
  autoPlaces: true,

  /** How close (blocks) a player must come to a picked place before its building is built there. */
  buildRange: 64,

  /** Seconds a story character (a ghost, a guard, an escort) waits for its player to come back before it is removed. It comes back when needed. */
  actorTimeoutSeconds: 300,

  /** Questgivers offer a daily favor: a short job, a new one each real day (UTC). */
  favors: true,
};
