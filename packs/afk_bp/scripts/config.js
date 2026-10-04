export const CONFIG = {
  /** Minutes without input before a player is marked AFK. */
  afkMinutes: 5,

  /** Post "X is now AFK" / "X is back" in chat. */
  announce: true,

  /** Shown before the name above an AFK player's head. */
  nameTagPrefix: "§7[AFK]§r ",

  /** Players marked AFK also get this tag (other packs/commands can use it, e.g. @a[tag=!afk]). */
  tag: "afk",

  sleep: {
    /** Skip the night when enough non-AFK players are in bed. */
    enabled: true,

    /** % of non-AFK players that must be asleep. 100 = all of them. */
    percent: 100,

    /** Count players in the Nether/End (who can't sleep) as needing to sleep, like vanilla. */
    countOtherDimensions: false,

    /** How long the condition must hold before skipping, in ticks. Minimum 140, so it never races vanilla's ~100-tick skip. */
    requiredTicks: 160,
  },
};
