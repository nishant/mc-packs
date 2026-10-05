export const CONFIG = {
  /** What can be sat on, `*` as a wildcard: stairs that aren't upside down and bottom slabs. */
  blocks: ["*_stairs", "*_slab"],

  /** Farthest the seat may be from the player's feet, in blocks. */
  maxReach: 2.5,

  /** How often (ticks) seats nobody sits on, or whose block is gone, are removed. */
  cleanupTicks: 20,

  /** Height of the seat above the bottom of the block. Raise or lower it in steps of 0.05 if players sit too high or too low. */
  seatHeight: 0.25,
};
