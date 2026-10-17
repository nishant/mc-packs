// Merchant Caravan: traders who visit now and then and sell rare goods for Crowns.

/**
 * @typedef {object} Good
 * @property {string} id unique id (the stock of a visit is saved by it)
 * @property {string} item item id
 * @property {number} amount items per purchase
 * @property {number} price Crowns per purchase
 * @property {number} stock purchases available per visit, shared by everyone
 * @property {string} [name] how it reads in the shop (default: from the item id)
 * @property {string} [nameTag] the item's own name (Storm Glass, Relic Shard)
 * @property {string[]} [lore] the item's lore lines
 * @property {{ id: string, level: number }} [enchant] an enchantment on the item (an enchanted book's)
 */
/**
 * @typedef {object} BuyBack
 * @property {string} item item id
 * @property {string} name how it reads in the shop
 * @property {string} lore the exact first lore line that identifies it
 * @property {number} price Crowns paid for one
 */

export const CONFIG = {
  /** Caravans come on their own schedule. `/realm:caravan_call` works either way. */
  enabled: true,

  /** A caravan comes every this many real days. */
  everyDays: 7,

  /**
   * Shifts the visit day. Visits fall on days since 1 January 1970 (a Thursday) where (day - offsetDays) is a
   * multiple of `everyDays`: with 7, 0 = Thursday, 1 = Friday, 2 = Saturday, 3 = Sunday.
   */
  offsetDays: 2,

  /** The caravan arrives at this hour, UTC, on a visit day. */
  hourUtc: 18,

  /** How long it stays, in real minutes (40 = two in-game days). */
  stayMinutes: 40,

  /**
   * If nobody is online when the caravan is due, it comes when someone joins within this many hours of its
   * arrival time (and stays the full `stayMinutes`). After that, that visit is skipped.
   */
  lateHours: 24,

  /** Chat warns this many minutes before the caravan leaves. 0 = no warning. */
  warnMinutes: 5,

  /** Goods for sale per visit, picked at random from `goods`. */
  stockSize: 8,

  /** Names of the traders (one NPC each). */
  traders: ["Zahir the Spice Merchant", "Old Marisol", "Fennick the Peddler"],

  /** Pack llamas that come along (tagged, named, brought back if they stray, and taken away when the caravan leaves). */
  llamas: 2,

  /** A trader turns to face the nearest player within this many blocks. 0 = never turn. */
  faceRange: 8,

  /** A missing trader is spawned again once a player has been within this many blocks of its spot for a few seconds. */
  respawnRange: 24,

  /** How far `/realm:caravan_spot_remove` looks for a spot, in blocks. */
  removeRange: 32,

  /**
   * What the traders may sell. Each visit picks `stockSize` of these. Goods whose item can't be made (an unknown
   * id, or an enchantment the game refuses) are skipped.
   * @type {Good[]}
   */
  goods: [
    { id: "mending", item: "minecraft:enchanted_book", amount: 1, price: 60, stock: 1, name: "Enchanted Book (Mending)", enchant: { id: "minecraft:mending", level: 1 } },
    { id: "unbreaking", item: "minecraft:enchanted_book", amount: 1, price: 30, stock: 2, name: "Enchanted Book (Unbreaking III)", enchant: { id: "minecraft:unbreaking", level: 3 } },
    { id: "totem", item: "minecraft:totem_of_undying", amount: 1, price: 80, stock: 1 },
    { id: "heart_sea", item: "minecraft:heart_of_the_sea", amount: 1, price: 45, stock: 1 },
    { id: "golden_apple", item: "minecraft:golden_apple", amount: 2, price: 20, stock: 3 },
    { id: "notch_apple", item: "minecraft:enchanted_golden_apple", amount: 1, price: 150, stock: 1 },
    { id: "name_tag", item: "minecraft:name_tag", amount: 1, price: 12, stock: 4 },
    { id: "disc_pigstep", item: "minecraft:music_disc_pigstep", amount: 1, price: 40, stock: 1 },
    { id: "disc_otherside", item: "minecraft:music_disc_otherside", amount: 1, price: 35, stock: 1 },
    { id: "disc_relic", item: "minecraft:music_disc_relic", amount: 1, price: 35, stock: 1 },
    { id: "trim_silence", item: "minecraft:silence_armor_trim_smithing_template", amount: 1, price: 90, stock: 1 },
    { id: "trim_wayfinder", item: "minecraft:wayfinder_armor_trim_smithing_template", amount: 1, price: 20, stock: 2 },
    { id: "trim_coast", item: "minecraft:coast_armor_trim_smithing_template", amount: 1, price: 20, stock: 2 },
    { id: "trim_spire", item: "minecraft:spire_armor_trim_smithing_template", amount: 1, price: 40, stock: 1 },
    { id: "netherite_template", item: "minecraft:netherite_upgrade_smithing_template", amount: 1, price: 70, stock: 1 },
    { id: "sherd_prize", item: "minecraft:prize_pottery_sherd", amount: 1, price: 8, stock: 2 },
    { id: "sherd_heart", item: "minecraft:heart_pottery_sherd", amount: 1, price: 8, stock: 2 },
    { id: "sherd_skull", item: "minecraft:skull_pottery_sherd", amount: 1, price: 8, stock: 2 },
    { id: "sherd_archer", item: "minecraft:archer_pottery_sherd", amount: 1, price: 8, stock: 2 },
    { id: "sniffer_egg", item: "minecraft:sniffer_egg", amount: 1, price: 40, stock: 1 },
    { id: "echo_shard", item: "minecraft:echo_shard", amount: 2, price: 20, stock: 2 },
    { id: "nautilus", item: "minecraft:nautilus_shell", amount: 2, price: 8, stock: 3 },
    { id: "storm_glass", item: "minecraft:prismarine_crystals", amount: 1, price: 25, stock: 2, name: "Storm Glass", nameTag: "§r§bStorm Glass", lore: ["§7Charged by a lightning strike"] },
    { id: "relic_shards", item: "minecraft:amethyst_shard", amount: 2, price: 10, stock: 4, name: "Relic Shard", nameTag: "§r§dRelic Shard", lore: ["§7Bring 8 to a relicsmith"] },
  ],

  /**
   * What the traders buy from players, identified by the first lore line.
   * @type {BuyBack[]}
   */
  buys: [
    { item: "minecraft:prismarine_crystals", name: "Storm Glass", lore: "§7Charged by a lightning strike", price: 18 },
    { item: "minecraft:amethyst_shard", name: "Relic Shard", lore: "§7Bring 8 to a relicsmith", price: 5 },
  ],
};
