export const CONFIG = {
  /** Warn (yellow) at or below this % of durability left. */
  warnPercent: 10,

  /** Warn again (red, louder, also in chat) at or below this %. */
  criticalPercent: 3,

  /** Never warn while more than this many uses are left, even if under the % (e.g. netherite). 0 = off. */
  maxUsesForWarning: 0,

  /** Also put critical warnings in chat, so they aren't missed mid-fight. */
  chatOnCritical: true,

  /** How often to check, in ticks (20 = 1s): items used, hit with or worn down since the last check; every slot of every player once in 10 checks. */
  checkIntervalTicks: 10,
};
