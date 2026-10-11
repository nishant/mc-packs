// Kitchen: the dishes, the rare ingredients and the rolling table.
//
// Dish and ingredient names are plain text (no § codes) and must stay exactly as they are: Story
// Questlines delivers and rewards dishes by name ("Harbor Chowder"), and players' saved recipes use
// the ids. Add new ones freely; keep the ids of existing ones.

/**
 * An effect: [effect id, amplifier (0 = level I), seconds]. Seconds are scaled by the Effect
 * durations setting, except for the effects in FIXED_EFFECTS.
 * @typedef {[string, number, number]} Fx
 */

/**
 * One thing a recipe needs: [item id, count]. "ing:<id>" is a rare ingredient (INGREDIENTS).
 * A plain item id only counts items without a custom name, so dishes are never used up as ingredients.
 * @typedef {[string, number]} Need
 */

/**
 * A way to learn a recipe from the chef: Crowns and/or items (all of them).
 * @typedef {{ crowns?: number, items?: Need[] }} Offer
 */

/**
 * @typedef {object} Dish
 * @property {string} id saved on players; keep it
 * @property {string} name the item's custom name, plain text
 * @property {string} base the vanilla food item it is
 * @property {"basic" | "chef" | "rare"} tier basic: everyone knows it; chef: Bea teaches it; rare: needs a rare ingredient
 * @property {number} yield servings per cooking
 * @property {Need[]} needs
 * @property {Fx[]} effects when eaten (for a rolling dish: what it gives with rolling off)
 * @property {string} blurb the first lore line
 * @property {Offer[]} [learn] how Bea teaches it (any one offer); none = only from a story or a recipe card
 * @property {boolean} [card] recipe cards for it drop from champions
 * @property {Need[]} [returns] given back after cooking (the glass bottle of a honey bottle)
 * @property {{ silly: number, jackpot: number }} [roll] rolls on ROLLS: weights of silly results and the jackpot are multiplied by these
 */

/**
 * @typedef {object} Ingredient
 * @property {string} id
 * @property {string} name the item's custom name, plain text
 * @property {string} item the vanilla item it is
 * @property {string} source where it comes from (lore and menus)
 * @property {string} [alsoAny] also accept any item of this type with this name and some lore (the Storm Eel of Fishing 2.0)
 */

/** Effects whose length is never scaled (instant-ish or silly). */
export const FIXED_EFFECTS = ["saturation", "levitation", "nausea"];

/** @type {Ingredient[]} */
export const INGREDIENTS = [
  { id: "champions_heart", name: "Champion's Heart", item: "minecraft:beetroot", source: "Dropped by champions" },
  { id: "storm_eel", name: "Storm Eel", item: "minecraft:cod", source: "Caught in thunderstorms, or from Stormcaller champions", alsoAny: "minecraft:cod" },
  { id: "frost_pepper", name: "Frost Pepper", item: "minecraft:light_blue_dye", source: "From Frostbound champions and strays" },
  { id: "glow_honey", name: "Glow Honey", item: "minecraft:honeycomb", source: "From full beehives harvested at night" },
  { id: "starwright_flour", name: "Starwright Flour", item: "minecraft:sugar", source: "From ripe wheat on a night of aurora or meteors" },
  { id: "ember_truffle", name: "Ember Truffle", item: "minecraft:magma_cream", source: "From nether wart and champions in the Nether" },
  { id: "moon_salt", name: "Moon Salt", item: "minecraft:quartz", source: "From Blood Moon hunts and Vampiric champions" },
  { id: "harvest_saffron", name: "Harvest Saffron", item: "minecraft:orange_dye", source: "From ripe crops under a Harvest Moon" },
];

/** Champion trait -> the extra ingredient its killer may get. */
export const TRAIT_INGREDIENT = { stormcaller: "storm_eel", frostbound: "frost_pepper", vampiric: "moon_salt" };

const BOWL = /** @type {Need} */ (["minecraft:bowl", 1]);

/** @type {Dish[]} */
export const DISHES = [
  // Basics: everyone knows these.
  {
    id: "harbor_chowder",
    name: "Harbor Chowder",
    base: "minecraft:rabbit_stew",
    tier: "basic",
    yield: 1,
    needs: [BOWL, ["minecraft:cooked_cod", 1], ["minecraft:baked_potato", 1], ["minecraft:kelp", 1]],
    effects: [["water_breathing", 0, 480]],
    blurb: "Warm and salty, like the docks at dawn",
  },
  {
    id: "fishermans_breakfast",
    name: "Fisherman's Breakfast",
    base: "minecraft:cooked_salmon",
    tier: "basic",
    yield: 1,
    needs: [["minecraft:cooked_salmon", 1], ["minecraft:bread", 1], ["minecraft:egg", 1]],
    effects: [["conduit_power", 0, 180]],
    blurb: "Eaten before the tide turns",
  },
  {
    id: "miners_pasty",
    name: "Miner's Pasty",
    base: "minecraft:baked_potato",
    tier: "basic",
    yield: 2,
    needs: [["minecraft:cooked_beef", 1], ["minecraft:potato", 2], ["minecraft:wheat", 1]],
    effects: [["haste", 0, 300]],
    blurb: "Still warm in your pocket at the bottom of the mine",
  },
  {
    id: "garden_salad",
    name: "Garden Salad",
    base: "minecraft:beetroot_soup",
    tier: "basic",
    yield: 1,
    needs: [BOWL, ["minecraft:beetroot", 2], ["minecraft:carrot", 1]],
    effects: [["speed", 0, 300]],
    blurb: "Crunchy, fresh and good for your legs",
  },
  {
    id: "hearty_porridge",
    name: "Hearty Porridge",
    base: "minecraft:mushroom_stew",
    tier: "basic",
    yield: 1,
    needs: [BOWL, ["minecraft:wheat", 3], ["minecraft:sugar", 1]],
    effects: [["saturation", 0, 2], ["regeneration", 0, 15]],
    blurb: "Fills you right up",
  },
  {
    id: "campfire_kebab",
    name: "Campfire Kebab",
    base: "minecraft:cooked_mutton",
    tier: "basic",
    yield: 2,
    needs: [["minecraft:cooked_mutton", 2], ["minecraft:carrot", 1], ["minecraft:stick", 1]],
    effects: [["jump_boost", 0, 300]],
    blurb: "Smoky, and best eaten on the move",
  },

  // Bea teaches these.
  {
    id: "wardens_ration",
    name: "Warden's Ration",
    base: "minecraft:bread",
    tier: "chef",
    yield: 3,
    needs: [["minecraft:bread", 2], ["minecraft:cooked_beef", 1], ["minecraft:dried_kelp", 2]],
    effects: [["resistance", 0, 240]],
    blurb: "What the wardens carry on a long watch",
    learn: [{ crowns: 30 }, { items: [["minecraft:cooked_beef", 8]] }],
  },
  {
    id: "glow_berry_tart",
    name: "Glow Berry Tart",
    base: "minecraft:cookie",
    tier: "chef",
    yield: 3,
    needs: [["minecraft:glow_berries", 3], ["minecraft:wheat", 2], ["minecraft:sugar", 1]],
    effects: [["night_vision", 0, 600]],
    blurb: "Tart, sweet, and it makes the dark less dark",
    learn: [{ crowns: 25 }, { items: [["minecraft:glow_berries", 16]] }],
  },
  {
    id: "honey_glazed_ham",
    name: "Honey-Glazed Ham",
    base: "minecraft:cooked_porkchop",
    tier: "chef",
    yield: 2,
    needs: [["minecraft:cooked_porkchop", 2], ["minecraft:honey_bottle", 1], ["minecraft:sugar", 1]],
    returns: [["minecraft:glass_bottle", 1]],
    effects: [["absorption", 0, 360], ["regeneration", 0, 15]],
    blurb: "Sticky fingers, steady heart",
    learn: [{ crowns: 35 }, { items: [["minecraft:honey_bottle", 4]] }],
  },
  {
    id: "spiced_pumpkin_soup",
    name: "Spiced Pumpkin Soup",
    base: "minecraft:mushroom_stew",
    tier: "chef",
    yield: 1,
    needs: [BOWL, ["minecraft:pumpkin", 1], ["minecraft:sugar", 1], ["minecraft:cocoa_beans", 1]],
    effects: [["fire_resistance", 0, 480]],
    blurb: "So hot that fire feels mild after it",
    learn: [{ crowns: 40 }, { items: [["minecraft:pumpkin", 8]] }],
  },
  {
    id: "climbers_trail_mix",
    name: "Climber's Trail Mix",
    base: "minecraft:cookie",
    tier: "chef",
    yield: 4,
    needs: [["minecraft:cocoa_beans", 1], ["minecraft:wheat", 2], ["minecraft:sweet_berries", 2]],
    effects: [["jump_boost", 1, 180], ["slow_falling", 0, 180]],
    blurb: "A handful before every cliff",
    learn: [{ crowns: 30 }, { items: [["minecraft:sweet_berries", 16]] }],
  },
  {
    id: "rabbit_ragout",
    name: "Rabbit Ragout",
    base: "minecraft:rabbit_stew",
    tier: "chef",
    yield: 1,
    needs: [BOWL, ["minecraft:cooked_rabbit", 1], ["minecraft:carrot", 1], ["minecraft:potato", 1], ["minecraft:brown_mushroom", 1]],
    effects: [["speed", 0, 480], ["jump_boost", 0, 480]],
    blurb: "Quick feet from a quick animal",
    learn: [{ crowns: 40 }, { items: [["minecraft:rabbit_hide", 6]] }],
  },
  {
    id: "pathfinders_carrots",
    name: "Pathfinder's Carrots",
    base: "minecraft:golden_carrot",
    tier: "chef",
    yield: 2,
    needs: [["minecraft:golden_carrot", 2], ["minecraft:sugar", 1]],
    effects: [["night_vision", 0, 480], ["speed", 0, 240]],
    blurb: "Sharp eyes for the long road",
    learn: [{ crowns: 45 }, { items: [["minecraft:gold_nugget", 16]] }],
  },
  {
    id: "smiths_hotpot",
    name: "Smith's Hotpot",
    base: "minecraft:mushroom_stew",
    tier: "chef",
    yield: 1,
    needs: [BOWL, ["minecraft:cooked_beef", 1], ["minecraft:baked_potato", 1], ["minecraft:coal", 1]],
    effects: [["haste", 1, 240]],
    blurb: "Cooked on the forge, eaten at the anvil",
    learn: [{ crowns: 50 }, { items: [["minecraft:iron_ingot", 6]] }],
  },
  {
    id: "sweet_berry_roll",
    name: "Sweet Berry Roll",
    base: "minecraft:bread",
    tier: "chef",
    yield: 2,
    needs: [["minecraft:bread", 1], ["minecraft:sweet_berries", 3], ["minecraft:sugar", 1]],
    effects: [["regeneration", 0, 45]],
    blurb: "Mends scrapes and moods alike",
    learn: [{ crowns: 25 }, { items: [["minecraft:wheat", 32]] }],
  },
  {
    id: "mystery_stew",
    name: "Mystery Stew",
    base: "minecraft:mushroom_stew",
    tier: "chef",
    yield: 1,
    needs: [BOWL, ["minecraft:red_mushroom", 1], ["minecraft:brown_mushroom", 1], ["minecraft:beetroot", 1]],
    effects: [["saturation", 0, 2]],
    roll: { silly: 1, jackpot: 1 },
    blurb: "Nobody knows what is in it. Not even Bea",
    learn: [{ crowns: 20 }, { items: [["minecraft:red_mushroom", 8]] }],
  },
  {
    id: "hiccup_cookies",
    name: "Hiccup Cookies",
    base: "minecraft:cookie",
    tier: "chef",
    yield: 4,
    needs: [["minecraft:wheat", 2], ["minecraft:cocoa_beans", 1], ["minecraft:sugar", 1]],
    effects: [["jump_boost", 0, 60]],
    roll: { silly: 2, jackpot: 1 },
    blurb: "Baked a little too fizzy",
    learn: [{ crowns: 15 }, { items: [["minecraft:cocoa_beans", 8]] }],
  },
  {
    id: "gamblers_goulash",
    name: "Gambler's Goulash",
    base: "minecraft:rabbit_stew",
    tier: "chef",
    yield: 1,
    needs: [BOWL, ["minecraft:cooked_beef", 1], ["minecraft:carrot", 1], ["minecraft:gold_nugget", 3]],
    effects: [["strength", 0, 60]],
    roll: { silly: 0.3, jackpot: 3 },
    blurb: "Bet your supper on it",
    learn: [{ crowns: 60 }, { items: [["minecraft:gold_ingot", 4]] }],
    card: true,
  },

  // Rare: each needs a rare ingredient.
  {
    id: "storm_eel_pie",
    name: "Storm Eel Pie",
    base: "minecraft:pumpkin_pie",
    tier: "rare",
    yield: 2,
    needs: [["ing:storm_eel", 1], ["minecraft:wheat", 3], ["minecraft:egg", 1]],
    effects: [["speed", 1, 300], ["haste", 1, 300]],
    blurb: "It still crackles when you cut it",
    learn: [{ crowns: 60, items: [["ing:storm_eel", 1]] }],
    card: true,
  },
  {
    id: "frost_pepper_soup",
    name: "Frost Pepper Soup",
    base: "minecraft:beetroot_soup",
    tier: "rare",
    yield: 1,
    needs: [BOWL, ["ing:frost_pepper", 1], ["minecraft:beetroot", 2]],
    effects: [["fire_resistance", 0, 900], ["resistance", 0, 180]],
    blurb: "Cold as a glacier, all the way down",
    learn: [{ crowns: 60, items: [["ing:frost_pepper", 1]] }],
    card: true,
  },
  {
    id: "ember_truffle_risotto",
    name: "Ember Truffle Risotto",
    base: "minecraft:mushroom_stew",
    tier: "rare",
    yield: 1,
    needs: [BOWL, ["ing:ember_truffle", 1], ["minecraft:wheat", 2], ["minecraft:brown_mushroom", 1]],
    effects: [["strength", 0, 360], ["fire_resistance", 0, 360]],
    blurb: "A little bit of the Nether, tamed",
    learn: [{ crowns: 60, items: [["ing:ember_truffle", 1]] }],
    card: true,
  },
  {
    id: "moon_salt_roast",
    name: "Moon Salt Roast",
    base: "minecraft:cooked_beef",
    tier: "rare",
    yield: 2,
    needs: [["minecraft:cooked_beef", 2], ["ing:moon_salt", 1]],
    effects: [["night_vision", 0, 900], ["strength", 0, 300]],
    blurb: "Seasoned under a red sky",
    learn: [{ crowns: 60, items: [["ing:moon_salt", 1]] }],
    card: true,
  },
  {
    id: "golden_harvest_loaf",
    name: "Golden Harvest Loaf",
    base: "minecraft:bread",
    tier: "rare",
    yield: 3,
    needs: [["ing:harvest_saffron", 1], ["minecraft:wheat", 3]],
    effects: [["health_boost", 1, 600], ["saturation", 0, 1]],
    blurb: "Baked from the best night of the year",
    learn: [{ crowns: 60, items: [["ing:harvest_saffron", 1]] }],
    card: true,
  },
  {
    id: "champions_heart_stew",
    name: "Champion's Heart Stew",
    base: "minecraft:rabbit_stew",
    tier: "rare",
    yield: 1,
    needs: [BOWL, ["ing:champions_heart", 1], ["minecraft:cooked_beef", 1], ["minecraft:carrot", 1], ["minecraft:baked_potato", 1]],
    effects: [["strength", 0, 480], ["health_boost", 1, 480], ["regeneration", 0, 20]],
    blurb: "The strength of a champion, in a bowl",
    learn: [{ crowns: 80, items: [["ing:champions_heart", 1]] }],
    card: true,
  },
  {
    id: "starwright_bread",
    name: "Starwright Bread",
    base: "minecraft:bread",
    tier: "rare",
    yield: 2,
    needs: [["ing:starwright_flour", 1], ["minecraft:wheat", 2], ["minecraft:glowstone_dust", 1]],
    effects: [["night_vision", 0, 900], ["slow_falling", 0, 300], ["jump_boost", 0, 300]],
    blurb: "An old family recipe. It tastes like starlight",
    card: true,
  },
  {
    id: "lantern_cake",
    name: "Lantern Cake",
    base: "minecraft:pumpkin_pie",
    tier: "rare",
    yield: 2,
    needs: [["ing:glow_honey", 1], ["minecraft:wheat", 3], ["minecraft:sugar", 2], ["minecraft:egg", 1], ["minecraft:glowstone_dust", 1]],
    effects: [["night_vision", 0, 1200], ["regeneration", 0, 60], ["village_hero", 0, 1200]],
    blurb: "Glows softly, like a window at night",
    card: true,
  },
  {
    id: "hearthkeepers_feast",
    name: "Hearthkeeper's Feast",
    base: "minecraft:rabbit_stew",
    tier: "rare",
    yield: 1,
    needs: [BOWL, ["ing:champions_heart", 1], ["ing:glow_honey", 1], ["ing:harvest_saffron", 1], ["minecraft:cooked_beef", 1]],
    effects: [["health_boost", 1, 900], ["resistance", 0, 900], ["strength", 0, 600], ["regeneration", 0, 60], ["saturation", 0, 2]],
    blurb: "A feast fit for the whole town, in one bowl",
    card: true,
  },
];

/**
 * The rolling table. `w` is the weight; silly results have `silly: true` (their weight is multiplied by
 * the dish's `roll.silly`), the jackpot `jackpot: true`. `fx` are effects; `act` a silly action the
 * script does: "glow" (sparkles for 15 seconds), "hiccups" (six little hops), "burp" (a burp everyone near hears).
 * @type {{ id: string, w: number, text: string, fx?: Fx[], act?: "glow" | "hiccups" | "burp", silly?: boolean, jackpot?: boolean }[]}
 */
export const ROLLS = [
  { id: "swift", w: 12, text: "A rush of speed!", fx: [["speed", 1, 120]] },
  { id: "mighty", w: 10, text: "You feel mighty.", fx: [["strength", 0, 180]] },
  { id: "busy", w: 10, text: "Your hands are itching to work.", fx: [["haste", 1, 120]] },
  { id: "mend", w: 10, text: "Warmth spreads through you.", fx: [["regeneration", 0, 40]] },
  { id: "padded", w: 8, text: "You feel well padded.", fx: [["absorption", 1, 240]] },
  { id: "bouncy", w: 8, text: "Boing!", fx: [["jump_boost", 1, 120], ["slow_falling", 0, 120]] },
  { id: "owl", w: 8, text: "Your eyes adjust to the dark.", fx: [["night_vision", 0, 600]] },
  { id: "hero", w: 4, text: "The villagers seem to like you more.", fx: [["village_hero", 0, 600]] },
  { id: "jackpot", w: 3, text: "JACKPOT! Everything at once!", fx: [["strength", 0, 240], ["speed", 0, 240], ["regeneration", 0, 30], ["absorption", 0, 240]], jackpot: true },
  { id: "float", w: 5, text: "Whoa, you float up!", fx: [["levitation", 0, 3], ["slow_falling", 0, 12]], silly: true },
  { id: "dizzy", w: 4, text: "The world spins a little.", fx: [["nausea", 0, 8]], silly: true },
  { id: "glow", w: 5, text: "You sparkle all over.", act: "glow", silly: true },
  { id: "hiccups", w: 5, text: "Hic! Hic! Hic!", act: "hiccups", silly: true },
  { id: "burp", w: 4, text: "BUUURP. Excuse you.", act: "burp", silly: true },
];
