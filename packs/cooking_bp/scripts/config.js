// Kitchen: cook dishes with long, gentle buffs at a cooking pot (a cauldron over a lit campfire).
// The dishes, rare ingredients and the rolling table are in recipes.js.

export const CONFIG = {
  /** Dishes give their effects when eaten. When false they are plain food. */
  enabled: true,

  /** Every dish effect's length is multiplied by this (0.25 to 4 in game). Saturation, levitation and nausea keep theirs. */
  durationMultiplier: 1,

  /** Rolling dishes (Mystery Stew, Hiccup Cookies, Gambler's Goulash) roll on the surprise table. When false they give their plain effect. */
  rollingDishes: true,

  /** Chance (percent) that a champion's killer gets a Champion's Heart, and its trait's ingredient. Helpers get half this chance of a heart. */
  championDropChance: 60,

  /** Chance (percent) that a champion's killer also gets a recipe card for a rare recipe. */
  recipeCardChance: 10,

  /** Rare ingredients can be found by harvesting, beekeeping and hunting (the chances below). Champions drop them either way. */
  foragingEnabled: true,

  /** Chances (percent) of each foraged ingredient. */
  forage: {
    /** Glow Honey: harvesting a full beehive or bee nest at night (bottle or shears). */
    glowHoney: 30,
    /** Starwright Flour: breaking ripe wheat soon after an aurora or a meteor. */
    starwrightFlour: 25,
    /** Harvest Saffron: breaking any ripe crop during a Harvest Moon. */
    harvestSaffron: 8,
    /** Moon Salt: killing a hostile mob during a Blood Moon. */
    moonSalt: 8,
    /** Ember Truffle: breaking ripe nether wart. */
    emberTruffle: 3,
    /** Frost Pepper: killing a stray. */
    frostPepper: 4,
  },

  /** After an aurora or a meteor (sky events), ripe wheat can give Starwright Flour for this many minutes. */
  starMinutes: 15,

  /** Blocks that make a cauldron on top of them a cooking pot (lit only). */
  potFires: ["minecraft:campfire", "minecraft:soul_campfire"],

  /** Players can cook from `/realm:cooking` anywhere, without a pot. */
  cookAnywhere: false,

  /** How long one cooking takes at the pot, in seconds (any number of servings at once). */
  cookSeconds: 3,

  /** Most servings cooked at once. */
  maxBatch: 16,

  /** The NPC role whose townsfolk open the Kitchen (Bea the Cook has it). */
  chefRole: "chef",

  /** Who teaches recipes, for messages. */
  chefName: "Bea the Cook",

  /** Farming XP (Skills pack) per serving cooked. 0 = none. */
  skillXp: 3,
};
