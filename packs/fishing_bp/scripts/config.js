// Fishing 2.0: which species can bite, when and where, and what they're worth.

const COD = "minecraft:cod";
const SALMON = "minecraft:salmon";
const TROPICAL = "minecraft:tropical_fish";
const PUFFER = "minecraft:pufferfish";

/**
 * @typedef {"common" | "uncommon" | "rare" | "epic" | "legendary"} Rarity
 * @typedef {"Clear" | "Rain" | "Thunder"} Weather
 * @typedef {"day" | "night" | "dawn" | "dusk"} Time
 * @typedef {"ocean" | "river" | "frozen" | "swamp" | "jungle" | "cave"} Place
 * @typedef {{ id: string, name: string, item: string, rarity: Rarity, min: number, max: number,
 *   weather?: Weather[], time?: Time[], places?: Place[], afterRain?: number }} Species
 */

export const CONFIG = {
  /** Replace vanilla fish caught with a fishing rod by a species from `species`, with a size and the catcher's name. */
  enabled: true,

  /** Tell everyone in chat when someone catches a legendary fish. */
  announceLegendary: true,

  /**
   * The rarities, rarest last: `weight` is how often a rarity bites compared with the others (among the species that
   * can bite right there), `color` the name's color code, `price` the Crowns a fisher pays for an average-sized fish,
   * `xp` the Fishing skill XP a catch gives (sent to the Skills pack).
   * @type {{ id: Rarity, label: string, weight: number, color: string, price: number, xp: number }[]}
   */
  rarities: [
    { id: "common", label: "Common", weight: 60, color: "§f", price: 2, xp: 5 },
    { id: "uncommon", label: "Uncommon", weight: 25, color: "§a", price: 5, xp: 10 },
    { id: "rare", label: "Rare", weight: 10, color: "§9", price: 12, xp: 25 },
    { id: "epic", label: "Epic", weight: 4, color: "§5", price: 30, xp: 50 },
    { id: "legendary", label: "Legendary", weight: 1, color: "§6", price: 80, xp: 100 },
  ],

  /**
   * Water below this height with blocks overhead is a cave (for species with the `cave` place).
   */
  caveBelowY: 50,

  /**
   * Share of the water samples around the bobber (up to 16 blocks away) that must be water for the spot to count as
   * `ocean`; less is `river` (rivers, ponds and small lakes).
   */
  oceanShare: 0.7,

  /** The NPC role (from the Townsfolk pack) whose NPCs buy fish and show the records. */
  npcRole: "fisher",

  /** A weekly fishing tournament: the biggest fish for its kind wins Crowns. */
  tournamentEnabled: true,

  /** The tournament's day of the week, UTC: 0 = Sunday ... 6 = Saturday. */
  tournamentDay: 0,

  /** The tournament starts at this hour, UTC. */
  tournamentHourUtc: 18,

  /** How long a tournament lasts, in minutes. */
  tournamentMinutes: 60,

  /** Chat says the tournament is coming this many minutes before it starts. */
  tournamentWarnMinutes: 10,

  /** Crowns for 1st, 2nd and 3rd place (add or remove entries for more or fewer places). */
  tournamentPrizes: [50, 30, 15],

  /**
   * The species. Each has a unique `id` (keep it when editing: logs and records are saved by it), a `name`, the vanilla
   * fish `item` it replaces (`minecraft:cod`, `minecraft:salmon`, `minecraft:tropical_fish` or `minecraft:pufferfish`),
   * a `rarity`, a size range `min`..`max` in cm, and optional conditions, all of which must hold: `weather` (`Clear`,
   * `Rain`, `Thunder`), `time` (`day`, `night`, `dawn`, `dusk`), `places` (any of `ocean`, `river`, `frozen`, `swamp`,
   * `jungle`, `cave`) and `afterRain` (only in the first this-many minutes after rain stops). Keep at least one species
   * without conditions for each item, so every catch has a species.
   * @type {Species[]}
   */
  species: [
    // Cod
    { id: "atlantic_cod", name: "Atlantic Cod", item: COD, rarity: "common", min: 35, max: 100 },
    { id: "haddock", name: "Haddock", item: COD, rarity: "common", min: 30, max: 70, places: ["ocean"] },
    { id: "brook_perch", name: "Brook Perch", item: COD, rarity: "common", min: 15, max: 40, places: ["river"] },
    { id: "blind_cavefish", name: "Blind Cavefish", item: COD, rarity: "common", min: 8, max: 20, places: ["cave"] },
    { id: "lantern_perch", name: "Lantern Perch", item: COD, rarity: "uncommon", min: 15, max: 45, places: ["cave"] },
    { id: "frostfin", name: "Frostfin", item: COD, rarity: "uncommon", min: 30, max: 70, places: ["frozen"] },
    { id: "bog_catfish", name: "Bog Catfish", item: COD, rarity: "uncommon", min: 40, max: 120, places: ["swamp"] },
    { id: "rain_carp", name: "Rain Carp", item: COD, rarity: "uncommon", min: 30, max: 90, weather: ["Rain", "Thunder"] },
    { id: "dawn_pike", name: "Dawn Pike", item: COD, rarity: "uncommon", min: 50, max: 120, time: ["dawn"] },
    { id: "moonscale_cod", name: "Moonscale Cod", item: COD, rarity: "rare", min: 40, max: 110, time: ["night"] },
    { id: "storm_eel", name: "Storm Eel", item: COD, rarity: "rare", min: 60, max: 180, weather: ["Thunder"] },
    { id: "abyssal_ling", name: "Abyssal Ling", item: COD, rarity: "epic", min: 60, max: 150, places: ["cave"] },
    { id: "old_whiskers", name: "Old Whiskers", item: COD, rarity: "legendary", min: 120, max: 200, places: ["swamp"], time: ["night"] },
    // Salmon
    { id: "silver_salmon", name: "Silver Salmon", item: SALMON, rarity: "common", min: 45, max: 100 },
    { id: "river_salmon", name: "River Salmon", item: SALMON, rarity: "common", min: 40, max: 90, places: ["river"] },
    { id: "brook_trout", name: "Brook Trout", item: SALMON, rarity: "common", min: 20, max: 50, places: ["river"], time: ["day"] },
    { id: "sockeye", name: "Sockeye Salmon", item: SALMON, rarity: "uncommon", min: 45, max: 85, places: ["river"], weather: ["Rain", "Thunder"] },
    { id: "arctic_char", name: "Arctic Char", item: SALMON, rarity: "uncommon", min: 30, max: 80, places: ["frozen"] },
    { id: "dusk_grayling", name: "Dusk Grayling", item: SALMON, rarity: "uncommon", min: 25, max: 55, time: ["dusk"] },
    { id: "tiger_trout", name: "Tiger Trout", item: SALMON, rarity: "uncommon", min: 30, max: 70, places: ["jungle"] },
    { id: "rainbow_trout", name: "Rainbow Trout", item: SALMON, rarity: "rare", min: 25, max: 75, afterRain: 10 },
    { id: "ember_salmon", name: "Ember Salmon", item: SALMON, rarity: "epic", min: 50, max: 110, time: ["dusk"], weather: ["Clear"] },
    { id: "jungle_arapaima", name: "Jungle Arapaima", item: SALMON, rarity: "epic", min: 120, max: 250, places: ["jungle"] },
    { id: "frost_monarch", name: "Frost Monarch", item: SALMON, rarity: "legendary", min: 80, max: 150, places: ["frozen"], time: ["night"] },
    // Tropical fish
    { id: "clownfish", name: "Clownfish", item: TROPICAL, rarity: "common", min: 6, max: 12 },
    { id: "blue_tang", name: "Blue Tang", item: TROPICAL, rarity: "common", min: 15, max: 30, places: ["ocean"], time: ["day"] },
    { id: "neon_tetra", name: "Neon Tetra", item: TROPICAL, rarity: "common", min: 2, max: 4, places: ["jungle"] },
    { id: "parrotfish", name: "Parrotfish", item: TROPICAL, rarity: "uncommon", min: 30, max: 70, places: ["ocean"] },
    { id: "angelfish", name: "Angelfish", item: TROPICAL, rarity: "uncommon", min: 10, max: 25, places: ["jungle", "swamp"] },
    { id: "glowtail", name: "Glowtail", item: TROPICAL, rarity: "rare", min: 3, max: 8, places: ["cave"] },
    { id: "thunder_betta", name: "Thunder Betta", item: TROPICAL, rarity: "rare", min: 5, max: 8, weather: ["Thunder"] },
    { id: "sunburst_wrasse", name: "Sunburst Wrasse", item: TROPICAL, rarity: "rare", min: 15, max: 40, places: ["ocean"], time: ["day"], weather: ["Clear"] },
    { id: "starlight_koi", name: "Starlight Koi", item: TROPICAL, rarity: "epic", min: 30, max: 80, places: ["river"], time: ["night"], weather: ["Clear"] },
    { id: "golden_koi", name: "Golden Koi", item: TROPICAL, rarity: "legendary", min: 40, max: 90, places: ["river"], time: ["dawn"] },
    // Pufferfish
    { id: "pufferfish", name: "Pufferfish", item: PUFFER, rarity: "common", min: 10, max: 40 },
    { id: "spiny_puffer", name: "Spiny Puffer", item: PUFFER, rarity: "uncommon", min: 20, max: 50, places: ["ocean"] },
    { id: "swamp_toadfish", name: "Swamp Toadfish", item: PUFFER, rarity: "uncommon", min: 15, max: 35, places: ["swamp"] },
    { id: "moon_puffer", name: "Moon Puffer", item: PUFFER, rarity: "rare", min: 10, max: 35, time: ["night"] },
    { id: "glacier_puffer", name: "Glacier Puffer", item: PUFFER, rarity: "rare", min: 15, max: 45, places: ["frozen"] },
    { id: "stormblower", name: "Stormblower", item: PUFFER, rarity: "epic", min: 30, max: 70, weather: ["Thunder"] },
  ],
};
