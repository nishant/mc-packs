export const CONFIG = {
  /** Operators who don't carry a Realm Configuration item get one when they join or respawn, and within `checkSeconds` of becoming an operator. */
  giveToOperators: true,

  /** Take the item away from players who aren't operators (only the real item, not something renamed on an anvil). */
  removeFromOthers: true,

  /** How often to check who carries the item, in seconds (5 to 300). */
  checkSeconds: 30,

  /** What the item is made from: a vanilla item id. It keeps its name, lore, keep-on-death and inventory lock. */
  itemType: "minecraft:nether_star",

  /** How many of your last commands the Recent page keeps (1 to 20). */
  recentSize: 8,

  /** Ticks to wait for installed packs and safe zone lists to answer (20 = 1 s). */
  answerTicks: 10,
};
