export const CONFIG = {
  /** Clear dropped items automatically when too many lie around. Disabled: only operators' /realm:cleanup clears them. */
  enabled: true,

  /** Dropped items (item entities, a stack counts once) in all dimensions together that start a cleanup. */
  threshold: 500,

  /** Seconds between counts. */
  checkSeconds: 60,

  /** Seconds between the chat warning and the clearing. */
  warnSeconds: 30,

  /** Keep items lying within nearPlayerRadius blocks of a player. */
  keepNearPlayers: true,

  /** Blocks around each player where items are kept (with keepNearPlayers). */
  nearPlayerRadius: 4,

  /** Item ids never cleared. An entry matches an id that ends with it, so "shulker_box" covers every color. Items renamed on an anvil are always kept. */
  keepItems: ["shulker_box", "minecraft:elytra", "minecraft:nether_star", "minecraft:totem_of_undying", "minecraft:dragon_egg", "minecraft:beacon", "minecraft:heavy_core"],
};
