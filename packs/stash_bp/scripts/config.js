export const CONFIG = {
  /** Blocks around the player that /realm:stash looks in for containers. */
  stashRadius: 8,

  /** Block ids that sort and receive stashes. Shulker boxes are left out on purpose. */
  containerTypes: ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel"],

  /** Sneak and tap a container with an empty hand to sort it (it doesn't open). */
  sneakTapSorts: true,

  /** /realm:stash also moves items with a custom name (otherwise they stay with you). */
  stashNamedItems: false,

  /** /realm:sort also sorts the hotbar (otherwise only slots 9–35). */
  sortHotbar: false,

  /** Minimum time between uses per player, in ticks (20 = 1 s). */
  cooldownTicks: 20,
};
