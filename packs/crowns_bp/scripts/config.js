// Crowns: the realm's currency, kept in the `crowns` scoreboard so any pack can pay or charge it.

/**
 * @typedef {object} SellEntry
 * @property {string} item item id
 * @property {number} per how many items make one lot
 * @property {number} price Crowns paid for one lot
 * @property {string} [name] how the item reads in the market (default: from the id)
 * @property {string} [lore] only items whose first lore line is exactly this (Storm Glass, Relic Shard); without it, only items with no lore
 */
/**
 * @typedef {object} BuyEntry
 * @property {string} item item id
 * @property {number} amount items in one lot
 * @property {number} price Crowns for one lot
 * @property {string} [name] how the item reads in the market (default: from the id)
 */

export const CONFIG = {
  /** Crowns a player gets the first time they join. */
  startBalance: 0,

  /** Crowns for each player's first visit of the day (UTC). 0 = none. */
  dailyBonus: 5,

  /** The market is open: merchants offer it, and `/realm:crowns_market` works where allowed. */
  marketEnabled: true,

  /** `/realm:crowns_market` opens the market anywhere. When false, it tells players to visit a merchant. */
  marketAnywhere: false,

  /** The NPC role whose townsfolk offer the market (the Townsfolk pack's Quill the Trader has it). */
  merchantRole: "merchant",

  /** Who `/realm:crowns_market` sends players to when `marketAnywhere` is false. */
  merchantName: "Quill the Trader",

  /** Most Crowns one `/realm:crowns_pay` can send. */
  maxPay: 100000,

  /** The top of `/realm:crowns`: how many players it lists. */
  topCount: 10,

  /**
   * What the market buys from players: `per` items for `price` Crowns.
   * @type {SellEntry[]}
   */
  sell: [
    { item: "minecraft:wheat", per: 8, price: 1 },
    { item: "minecraft:carrot", per: 16, price: 1 },
    { item: "minecraft:potato", per: 16, price: 1 },
    { item: "minecraft:beetroot", per: 16, price: 1 },
    { item: "minecraft:melon_slice", per: 16, price: 1 },
    { item: "minecraft:pumpkin", per: 4, price: 1 },
    { item: "minecraft:sugar_cane", per: 16, price: 1 },
    { item: "minecraft:cod", per: 4, price: 1 },
    { item: "minecraft:salmon", per: 4, price: 1 },
    { item: "minecraft:rotten_flesh", per: 16, price: 1 },
    { item: "minecraft:bone", per: 8, price: 1 },
    { item: "minecraft:string", per: 8, price: 1 },
    { item: "minecraft:gunpowder", per: 4, price: 1 },
    { item: "minecraft:leather", per: 4, price: 1 },
    { item: "minecraft:coal", per: 8, price: 1 },
    { item: "minecraft:copper_ingot", per: 8, price: 1 },
    { item: "minecraft:iron_ingot", per: 1, price: 3 },
    { item: "minecraft:gold_ingot", per: 1, price: 4 },
    { item: "minecraft:lapis_lazuli", per: 8, price: 1 },
    { item: "minecraft:redstone", per: 16, price: 1 },
    { item: "minecraft:emerald", per: 1, price: 5 },
    { item: "minecraft:diamond", per: 1, price: 25 },
    { item: "minecraft:prismarine_crystals", per: 1, price: 15, name: "Storm Glass", lore: "§7Charged by a lightning strike" },
    { item: "minecraft:amethyst_shard", per: 1, price: 4, name: "Relic Shard", lore: "§7Bring 8 to a relicsmith" },
  ],

  /**
   * What the market sells: `amount` items for `price` Crowns.
   * @type {BuyEntry[]}
   */
  buy: [
    { item: "minecraft:bread", amount: 4, price: 3 },
    { item: "minecraft:cooked_beef", amount: 4, price: 5 },
    { item: "minecraft:torch", amount: 16, price: 2 },
    { item: "minecraft:arrow", amount: 16, price: 4 },
    { item: "minecraft:bone_meal", amount: 16, price: 3 },
    { item: "minecraft:empty_map", amount: 1, price: 8, name: "Empty Map" },
    { item: "minecraft:lead", amount: 1, price: 6 },
    { item: "minecraft:name_tag", amount: 1, price: 20 },
    { item: "minecraft:saddle", amount: 1, price: 25 },
  ],
};
