export const CONFIG = {
  /** Leaves decay quickly after a log is broken. Disabled: leaves decay at vanilla speed. */
  enabled: true,

  /** Ticks to wait after a log breaks before checking the leaves (20 = 1 second), so a whole tree felled at once (Bedrock Essentials+ sneak-break) is checked in one go. */
  delayTicks: 20,

  /** Most leaves that decay per tick, across the realm. 6 = a 120-leaf canopy in 1 second. */
  leavesPerTick: 6,

  /** Leaves stay while a log is this many steps away or closer, counted through leaves (vanilla: 6). */
  logDistance: 6,

  /** How far (steps through leaves) from a broken log the pack looks. Leaves further out are left to vanilla. */
  searchDepth: 16,

  /** Most blocks one check reads. A check that reaches it treats the unread leaves as held up by a log, so nothing that might still be attached decays. */
  maxBlocks: 3000,

  /** After a log breaks, how far up (blocks) the pack follows the trunk's empty column to find the canopy of a felled tree. */
  fellHeight: 32,
};
