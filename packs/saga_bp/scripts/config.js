// Story Questlines options. The stories themselves are in stories.js.
export const CONFIG = {
  /** Stories can be started and make progress. Disabled, the story log still opens but nothing counts. */
  enabled: true,

  /** The story tracker above the hotbar (`Drowned Bell: Lighthouse NE 240m`), for players who haven't chosen in /realm:prefs. */
  tracker: true,

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
};
