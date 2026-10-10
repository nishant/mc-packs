export const CONFIG = {
  /** The journal records new entries. Disabled, nothing new is recorded (the journal can still be read). */
  enabled: true,

  /** A chat line for each new entry (`Journal: New entry in Mobs - Creeper`). Players can choose for themselves in /realm:prefs. */
  notes: true,

  /** Finishing a page gives its `reward`. */
  rewards: true,

  /** Players within this many blocks of an announced sky event (a tornado, a meteor...) get its Weather entry. */
  skyEventRadius: 256,

  /** Distances from world spawn (blocks, overworld) that are Places entries. */
  farDistances: [1000, 5000, 10000],

  /**
   * The pages, in menu order. `entries` are what completes the page: `id` (saved on players; keep it when
   * editing), `label`, and for mobs a `blurb` shown once found. Entries other packs send that aren't listed
   * here are kept too and shown under "Also found", but don't count toward the page.
   * `reward` is given once, when every entry is found: XP `levels`, `crowns` and a `title` (Titles pack).
   * Pages with no `entries` (Story) just collect what other packs send, with no completion.
   * @type {{ id: "mobs" | "places" | "fish" | "weather" | "relics" | "story", label: string, entries: { id: string, label: string, blurb?: string }[], reward: { levels: number, crowns: number, title: string } }[]}
   */
  pages: [
    {
      id: "mobs",
      label: "Mobs",
      reward: { levels: 10, crowns: 200, title: "Naturalist" },
      entries: [
        { id: "zombie", label: "Zombie", blurb: "Slow and hungry. Burns in daylight unless it wears a helmet." },
        { id: "husk", label: "Husk", blurb: "A desert zombie that never burns and leaves you hungry." },
        { id: "drowned", label: "Drowned", blurb: "A zombie gone to the water. Some carry tridents." },
        { id: "skeleton", label: "Skeleton", blurb: "A fine archer. Hides from the sun under trees." },
        { id: "stray", label: "Stray", blurb: "A frozen skeleton whose arrows slow you down." },
        { id: "bogged", label: "Bogged", blurb: "A mossy skeleton of the swamps with poison arrows." },
        { id: "creeper", label: "Creeper", blurb: "Silent until it hisses. Keep your distance." },
        { id: "spider", label: "Spider", blurb: "Climbs walls and only turns hostile in the dark." },
        { id: "cave_spider", label: "Cave Spider", blurb: "Small, fast and poisonous. Guards mineshafts." },
        { id: "enderman", label: "Enderman", blurb: "Don't look it in the eye. Hates water." },
        { id: "witch", label: "Witch", blurb: "Throws potions and drinks her own to heal." },
        { id: "slime", label: "Slime", blurb: "Splits in two when hit. Lives in swamps and deep slime chunks." },
        { id: "phantom", label: "Phantom", blurb: "Hunts players who haven't slept in days." },
        { id: "pillager", label: "Pillager", blurb: "A crossbow raider from the outposts." },
        { id: "vindicator", label: "Vindicator", blurb: "An axe-swinging raider of woodland mansions." },
        { id: "guardian", label: "Guardian", blurb: "Guards ocean monuments with a laser beam." },
        { id: "silverfish", label: "Silverfish", blurb: "Hides in stone bricks and calls its friends." },
        { id: "breeze", label: "Breeze", blurb: "A whirling wind spirit of the trial chambers." },
        { id: "blaze", label: "Blaze", blurb: "Floats over Nether fortresses, throwing fire." },
        { id: "ghast", label: "Ghast", blurb: "Cries over the Nether and spits fireballs. Hit them back." },
        { id: "magma_cube", label: "Magma Cube", blurb: "A Nether slime that doesn't mind lava." },
        { id: "wither_skeleton", label: "Wither Skeleton", blurb: "A tall fortress guard whose blade withers." },
        { id: "piglin", label: "Piglin", blurb: "Loves gold. Wear some and it leaves you alone." },
        { id: "hoglin", label: "Hoglin", blurb: "A charging Nether beast, scared of warped fungus." },
        { id: "shulker", label: "Shulker", blurb: "Hides in its shell in End cities and makes you float." },
        { id: "cow", label: "Cow", blurb: "Milk, leather and beef. A farm's best friend." },
        { id: "pig", label: "Pig", blurb: "Rides with a saddle and a carrot on a stick." },
        { id: "sheep", label: "Sheep", blurb: "Wool in sixteen colors, if you dye it." },
        { id: "chicken", label: "Chicken", blurb: "Eggs, feathers and a lot of clucking." },
        { id: "rabbit", label: "Rabbit", blurb: "Quick and shy. Its foot is lucky for brewers." },
      ],
    },
    {
      id: "places",
      label: "Places",
      reward: { levels: 10, crowns: 200, title: "Explorer" },
      entries: [
        { id: "overworld", label: "The Overworld" },
        { id: "nether", label: "The Nether" },
        { id: "the_end", label: "The End" },
        { id: "below_0", label: "Below y 0" },
        { id: "bottom", label: "Near the bottom of the world (below y -55)" },
        { id: "above_200", label: "Above y 200" },
        { id: "above_300", label: "Above y 300" },
        { id: "far_1000", label: "1,000 blocks from spawn" },
        { id: "far_5000", label: "5,000 blocks from spawn" },
        { id: "far_10000", label: "10,000 blocks from spawn" },
        { id: "desert", label: "Desert" },
        { id: "badlands", label: "Badlands" },
        { id: "snowy", label: "Snowy lands" },
        { id: "ocean", label: "Ocean" },
        { id: "jungle", label: "Jungle" },
        { id: "mushroom", label: "Mushroom Fields" },
        { id: "cherry_grove", label: "Cherry Grove" },
        { id: "swamp", label: "Swamp" },
        { id: "taiga", label: "Taiga" },
        { id: "dark_forest", label: "Dark Forest" },
        { id: "savanna", label: "Savanna" },
        { id: "pale_garden", label: "Pale Garden" },
        { id: "lush_caves", label: "Lush Caves" },
        { id: "dripstone_caves", label: "Dripstone Caves" },
        { id: "deep_dark", label: "The Deep Dark" },
        { id: "crimson_forest", label: "Crimson Forest" },
        { id: "warped_forest", label: "Warped Forest" },
        { id: "soul_sand_valley", label: "Soul Sand Valley" },
        { id: "basalt_deltas", label: "Basalt Deltas" },
      ],
    },
    {
      id: "fish",
      label: "Fish",
      reward: { levels: 5, crowns: 100, title: "Angler" },
      entries: [
        { id: "cod", label: "Cod" },
        { id: "salmon", label: "Salmon" },
        { id: "tropical_fish", label: "Tropical Fish" },
        { id: "pufferfish", label: "Pufferfish" },
      ],
    },
    {
      id: "weather",
      label: "Weather",
      reward: { levels: 10, crowns: 250, title: "Stormwatcher" },
      entries: [
        { id: "rain", label: "Rain" },
        { id: "thunderstorm", label: "Thunderstorm" },
        { id: "storm_cell", label: "Storm cell" },
        { id: "tornado", label: "Tornado" },
        { id: "rainbow", label: "Rainbow" },
        { id: "meteor", label: "Meteor" },
        { id: "aurora", label: "Aurora" },
        { id: "blood_moon", label: "Blood Moon" },
        { id: "harvest_moon", label: "Harvest Moon" },
      ],
    },
    {
      id: "relics",
      label: "Relics",
      reward: { levels: 15, crowns: 500, title: "Relic Keeper" },
      entries: [
        { id: "storm_staff", label: "Storm Staff" },
        { id: "rain_charm", label: "Rain Charm" },
        { id: "tide_boots", label: "Tide Boots" },
        { id: "lantern_deep", label: "Lantern of the Deep" },
        { id: "storm_meter", label: "Storm Meter" },
        { id: "compass_echoes", label: "Compass of Echoes" },
        { id: "frost_band", label: "Frost Band" },
        { id: "sun_pendant", label: "Sun Pendant" },
        { id: "miners_lamp", label: "Miner's Lamp" },
        { id: "wayfarer_boots", label: "Wayfarer Boots" },
      ],
    },
    {
      id: "story",
      label: "Story",
      reward: { levels: 10, crowns: 300, title: "Loremaster" },
      entries: [],
    },
  ],

  /**
   * How biomes are guessed (the stable API can't read them): `blocks` are block ids (without
   * `minecraft:`) that mark the place. `at` is where to look: `top` (the highest block over the
   * player, only while near the surface), `feet` (the block under the player). `dim` limits it to a
   * dimension, `maxY` and `minY` to below or above a height (the player's). The first match wins.
   * Ocean is found on its own: deep water (8+ blocks) under open sky.
   * @type {{ entry: string, at: "top" | "feet", blocks: string[], dim?: string, maxY?: number, minY?: number }[]}
   */
  biomes: [
    { entry: "deep_dark", at: "feet", blocks: ["sculk", "sculk_vein", "sculk_sensor", "sculk_catalyst", "sculk_shrieker"], dim: "overworld", maxY: 0 },
    { entry: "lush_caves", at: "feet", blocks: ["moss_block", "moss_carpet", "clay", "azalea", "flowering_azalea"], dim: "overworld", maxY: 50 },
    { entry: "dripstone_caves", at: "feet", blocks: ["dripstone_block", "pointed_dripstone"], dim: "overworld", maxY: 60 },
    { entry: "crimson_forest", at: "feet", blocks: ["crimson_nylium"], dim: "nether" },
    { entry: "warped_forest", at: "feet", blocks: ["warped_nylium"], dim: "nether" },
    { entry: "soul_sand_valley", at: "feet", blocks: ["soul_sand", "soul_soil"], dim: "nether" },
    { entry: "basalt_deltas", at: "feet", blocks: ["basalt", "smooth_basalt", "blackstone"], dim: "nether" },
    { entry: "mushroom", at: "top", blocks: ["mycelium", "red_mushroom_block", "brown_mushroom_block"], dim: "overworld" },
    { entry: "cherry_grove", at: "top", blocks: ["cherry_leaves", "pink_petals"], dim: "overworld" },
    { entry: "pale_garden", at: "top", blocks: ["pale_oak_leaves", "pale_moss_block", "pale_moss_carpet", "pale_hanging_moss"], dim: "overworld" },
    { entry: "jungle", at: "top", blocks: ["jungle_leaves"], dim: "overworld" },
    { entry: "swamp", at: "top", blocks: ["mangrove_leaves", "mangrove_roots", "muddy_mangrove_roots", "waterlily", "lily_pad"], dim: "overworld" },
    { entry: "dark_forest", at: "top", blocks: ["dark_oak_leaves"], dim: "overworld" },
    { entry: "savanna", at: "top", blocks: ["acacia_leaves"], dim: "overworld" },
    { entry: "taiga", at: "top", blocks: ["spruce_leaves", "podzol"], dim: "overworld" },
    { entry: "badlands", at: "top", blocks: ["red_sand", "hardened_clay", "stained_hardened_clay", "terracotta", "orange_terracotta", "red_terracotta", "yellow_terracotta", "white_terracotta", "brown_terracotta", "light_gray_terracotta"], dim: "overworld" },
    { entry: "desert", at: "top", blocks: ["sand", "cactus", "deadbush"], dim: "overworld", minY: 66 },
    { entry: "snowy", at: "top", blocks: ["snow", "snow_layer", "powder_snow", "ice", "packed_ice", "blue_ice"], dim: "overworld" },
  ],
};
