const ORES = (/** @type {string} */ ore) => [`minecraft:${ore}_ore`, `minecraft:deepslate_${ore}_ore`];

export const CONFIG = {
  /** Skills gain XP and perks work. Disabled: no XP, no perks; levels are kept for later. */
  enabled: true,

  /** Players in creative mode gain no XP and get no perks. */
  skipCreative: true,

  /** The highest level a skill can reach. Read when the world starts. */
  maxLevel: 50,

  /**
   * XP needed to go from level n to n + 1 is round(xpBase * n ^ xpExponent): with 20 and 1.5, level 2
   * takes 20 XP, level 10 about 2,200 XP in all, level 20 about 13,400 and level 50 about 138,000. Read when the world starts.
   */
  xpBase: 20,

  /** See `xpBase`. Read when the world starts. */
  xpExponent: 1.5,

  /** Every XP gain is multiplied by this (0.5 = half, 2 = double), before the party bonus and perks. */
  xpMultiplier: 1,

  /** Extra XP, in percent, while a party mate (the Parties pack) is within `partyRange` blocks in the same dimension. */
  partyBonus: 10,

  /** How near a party mate has to be for `partyBonus`, in blocks. */
  partyRange: 64,

  /** A short note above the hotbar as you gain XP (`+12 Mining XP`), at most once a second. Each player can switch it in /realm:prefs. */
  xpNotes: true,

  /** Perks (double drops, short effects) work. Disabled: levels still go up, but perks do nothing. */
  perksEnabled: true,

  /** Tell everyone in chat when a player reaches `maxLevel` in a skill. */
  announceMaster: true,

  /** The title (Titles & Trails pack) a player unlocks on reaching `maxLevel` in each skill. */
  masterTitles: {
    mining: "Master Miner",
    woodcutting: "Master Woodcutter",
    farming: "Master Farmer",
    fishing: "Master Angler",
    combat: "Master Warrior",
    exploration: "Master Explorer",
  },

  mining: {
    /**
     * Blocks that give Mining XP when broken (not ones a player placed lately). `drop` is what the
     * double-drop perk adds (`amount` of it, default 1); blocks without `drop` are never doubled.
     * @type {{ blocks: string[], xp: number, drop?: string, amount?: number }[]}
     */
    blocks: [
      { blocks: ["minecraft:stone", "minecraft:deepslate", "minecraft:andesite", "minecraft:diorite", "minecraft:granite", "minecraft:tuff", "minecraft:calcite", "minecraft:blackstone", "minecraft:basalt", "minecraft:end_stone"], xp: 1 },
      { blocks: ORES("coal"), xp: 3, drop: "minecraft:coal" },
      { blocks: ORES("copper"), xp: 3, drop: "minecraft:raw_copper", amount: 2 },
      { blocks: ORES("iron"), xp: 5, drop: "minecraft:raw_iron" },
      { blocks: [...ORES("redstone"), "minecraft:lit_redstone_ore", "minecraft:lit_deepslate_redstone_ore"], xp: 4, drop: "minecraft:redstone", amount: 4 },
      { blocks: ORES("lapis"), xp: 6, drop: "minecraft:lapis_lazuli", amount: 4 },
      { blocks: ORES("gold"), xp: 7, drop: "minecraft:raw_gold" },
      { blocks: ORES("diamond"), xp: 15, drop: "minecraft:diamond" },
      { blocks: ORES("emerald"), xp: 15, drop: "minecraft:emerald" },
      { blocks: ["minecraft:quartz_ore"], xp: 3, drop: "minecraft:quartz" },
      { blocks: ["minecraft:nether_gold_ore"], xp: 3, drop: "minecraft:gold_nugget", amount: 3 },
      { blocks: ["minecraft:ancient_debris"], xp: 25 },
    ],

    /** Ores (blocks with a `drop`) mined with at most this many seconds between them count as one streak, for the Haste perk. */
    streakGapSeconds: 30,
  },

  woodcutting: {
    /** Logs and stems that give Woodcutting XP when broken (not ones a player placed lately). */
    logs: ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak"].map((w) => `minecraft:${w}_log`).concat(["minecraft:crimson_stem", "minecraft:warped_stem"]),

    /** XP per log. */
    xp: 4,
  },

  farming: {
    /**
     * Crops that give Farming XP when harvested fully grown: broken, or reset by a tap (the
     * Right-click Harvest pack). `state`/`ripe`: the growth state and its fully grown value (without
     * them any break counts, if a player didn't place the block lately). `drop` is what the extra
     * crop perk adds; `seeds` what the seeds perk adds.
     * @type {{ block: string, state?: string, ripe?: number, xp: number, drop: string, seeds?: string }[]}
     */
    crops: [
      { block: "minecraft:wheat", state: "growth", ripe: 7, xp: 3, drop: "minecraft:wheat", seeds: "minecraft:wheat_seeds" },
      { block: "minecraft:carrots", state: "growth", ripe: 7, xp: 3, drop: "minecraft:carrot" },
      { block: "minecraft:potatoes", state: "growth", ripe: 7, xp: 3, drop: "minecraft:potato" },
      { block: "minecraft:beetroot", state: "growth", ripe: 7, xp: 3, drop: "minecraft:beetroot", seeds: "minecraft:beetroot_seeds" },
      { block: "minecraft:nether_wart", state: "age", ripe: 3, xp: 3, drop: "minecraft:nether_wart" },
      { block: "minecraft:cocoa", state: "age", ripe: 2, xp: 3, drop: "minecraft:cocoa_beans" },
      { block: "minecraft:melon_block", xp: 4, drop: "minecraft:melon_slice", seeds: "minecraft:melon_seeds" },
      { block: "minecraft:pumpkin", xp: 4, drop: "minecraft:pumpkin", seeds: "minecraft:pumpkin_seeds" },
    ],
  },

  fishing: {
    /** XP for a fish (an item in `fish`). */
    fishXp: 12,

    /** XP for a treasure (an item in `treasure`). */
    treasureXp: 25,

    /** XP for anything else caught (junk). */
    junkXp: 5,

    /** What counts as a fish. Only fish are doubled by the second-catch perk. */
    fish: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"],

    /** What counts as treasure. */
    treasure: ["minecraft:enchanted_book", "minecraft:name_tag", "minecraft:saddle", "minecraft:nautilus_shell", "minecraft:bow", "minecraft:fishing_rod"],
  },

  combat: {
    /** XP for killing a hostile or any other mob not listed in `passive`. */
    xp: 10,

    /** XP for killing a mob in `passive`. */
    passiveXp: 2,

    /** Animals and other peaceful mobs: less XP. */
    passive: ["cow", "pig", "sheep", "chicken", "rabbit", "horse", "donkey", "mule", "llama", "trader_llama", "cod", "salmon", "tropicalfish", "pufferfish", "squid", "glow_squid", "bat", "mooshroom", "goat", "camel", "armadillo", "sniffer", "frog", "tadpole", "turtle", "axolotl", "fox", "panda", "parrot", "ocelot", "cat", "wolf", "villager", "villager_v2", "wandering_trader", "allay", "strider", "dolphin", "polar_bear", "bee", "snow_golem", "iron_golem", "skeleton_horse", "zombie_horse"].map((m) => `minecraft:${m}`),

    /** Big mobs with their own XP instead of `xp`. @type {{ mob: string, xp: number }[]} */
    bosses: [
      { mob: "minecraft:ender_dragon", xp: 1000 },
      { mob: "minecraft:wither", xp: 600 },
      { mob: "minecraft:warden", xp: 300 },
      { mob: "minecraft:elder_guardian", xp: 150 },
      { mob: "minecraft:ravager", xp: 60 },
      { mob: "minecraft:evocation_illager", xp: 40 },
    ],

    /** A champion (tag `realm:champion`, from the Champions pack) gives this many times the XP. */
    championMultiplier: 5,

    /** Never give XP for these (things that aren't really mobs, or can be made and broken again and again). */
    ignore: ["armor_stand", "npc", "player", "ender_crystal", "boat", "chest_boat", "minecart", "chest_minecart", "hopper_minecart", "tnt_minecart", "command_block_minecart", "painting", "leash_knot"].map((m) => `minecraft:${m}`),
  },

  exploration: {
    /** XP for each 16 x 16 chunk you enter for the first time (per dimension). */
    chunkXp: 4,

    /** One XP for every this many blocks traveled (any way but teleporting) in chunks you haven't been in lately (the last 128). */
    blocksPerXp: 50,

    /** At most this many new chunks a minute give XP (fast elytra flights find many); the rest are still remembered. */
    maxChunksPerMinute: 30,

    /** Movement faster than this (blocks per second) is a teleport: no distance XP. */
    maxSpeed: 100,

    /** Areas of 8 x 8 chunks remembered per player (about 20 characters each); the least recently visited are forgotten past this. */
    maxAreas: 4000,
  },

  /**
   * Perks per skill. Each unlocks at `level`; for each `perk` the highest unlocked row counts.
   * Kinds: `doubleOre` (mining: `chance` of one more of the ore's drop, not with Silk Touch), `haste`
   * (mining: Haste I for `seconds` after a streak of `streak` ores), `extraLog` (woodcutting: `chance`
   * of one more log), `apple` (woodcutting: `chance` of an apple), `extraCrop` (farming: `chance` of
   * one more crop), `seeds` (farming: `chance` of seeds), `secondCatch` (fishing: `chance` of a
   * second fish), `strength` (combat: `chance` of Strength I for `seconds` after a kill), `regen`
   * (combat: `chance` of Regeneration I for `seconds` after a kill), `speed` (exploration: Speed I for
   * `seconds` on entering a new chunk), `bonusXp` (any skill: `percent` more XP in that skill).
   * @type {Record<"mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration", { level: number, perk: string, chance?: number, seconds?: number, streak?: number, percent?: number }[]>}
   */
  perks: {
    mining: [
      { level: 10, perk: "doubleOre", chance: 0.05 },
      { level: 20, perk: "haste", streak: 20, seconds: 20 },
      { level: 30, perk: "doubleOre", chance: 0.1 },
      { level: 40, perk: "haste", streak: 12, seconds: 30 },
      { level: 50, perk: "doubleOre", chance: 0.15 },
    ],
    woodcutting: [
      { level: 10, perk: "extraLog", chance: 0.05 },
      { level: 20, perk: "apple", chance: 0.05 },
      { level: 30, perk: "extraLog", chance: 0.1 },
      { level: 40, perk: "apple", chance: 0.1 },
      { level: 50, perk: "extraLog", chance: 0.15 },
    ],
    farming: [
      { level: 10, perk: "extraCrop", chance: 0.05 },
      { level: 20, perk: "seeds", chance: 0.1 },
      { level: 30, perk: "extraCrop", chance: 0.1 },
      { level: 40, perk: "seeds", chance: 0.2 },
      { level: 50, perk: "extraCrop", chance: 0.15 },
    ],
    fishing: [
      { level: 10, perk: "secondCatch", chance: 0.05 },
      { level: 20, perk: "bonusXp", percent: 10 },
      { level: 30, perk: "secondCatch", chance: 0.1 },
      { level: 40, perk: "bonusXp", percent: 20 },
      { level: 50, perk: "secondCatch", chance: 0.15 },
    ],
    combat: [
      { level: 10, perk: "strength", chance: 0.05, seconds: 5 },
      { level: 20, perk: "bonusXp", percent: 10 },
      { level: 30, perk: "strength", chance: 0.1, seconds: 5 },
      { level: 40, perk: "regen", chance: 0.1, seconds: 4 },
      { level: 50, perk: "strength", chance: 0.15, seconds: 8 },
    ],
    exploration: [
      { level: 10, perk: "bonusXp", percent: 10 },
      { level: 20, perk: "speed", seconds: 10 },
      { level: 30, perk: "bonusXp", percent: 20 },
      { level: 40, perk: "speed", seconds: 20 },
      { level: 50, perk: "bonusXp", percent: 30 },
    ],
  },

  /**
   * Callings (docs/RPG_DESIGN.md section 5): at a total skill level of `unlockTotal` a player picks one of six, gets
   * the Calling Sigil (one active ability) and spends talent points in a tree of 3 tiers x 3 talents.
   */
  callings: {
    /** Callings work: the menu, the Sigil and every talent. Disabled: nothing a Calling gives works (choices are kept). */
    enabled: true,

    /** The total of all six skill levels (6 to 300) a player needs to choose a Calling. */
    unlockTotal: 75,

    /** Talent points at unlock. */
    pointsBase: 1,

    /** One more talent point for every this many combined levels of the Calling's two skills above `pointsFrom`. */
    pointsEvery: 5,

    /** See `pointsEvery`: the combined level (of the Calling's two skills) where extra points start. */
    pointsFrom: 50,

    /** The most talent points a player can have. */
    maxPoints: 10,

    /** Points in tier 1 a tier 2 talent needs. */
    tier2Points: 3,

    /** Points in tiers 1 and 2 the tier 3 capstone (one of three, one rank) needs. */
    tier3Points: 7,

    /** Crowns to take back every talent point and spend them again (same Calling). */
    respecCost: 50,

    /** Crowns for each switch to another Calling, in order (the first choice is free); the last one repeats. */
    switchCosts: [100, 200, 300, 400, 500],

    /** Realm days (Realm Calendar, else game days) at least between two Calling choices. */
    switchDays: 3,

    /** Players may choose and switch their Calling from the menu anywhere, not only at Brother Hollis (or Moss). Without the Townsfolk pack they always can. */
    chooseAnywhere: false,

    /** How near party mates must be for Rally Cry and Hearth Song, in blocks. */
    partyRange: 16,

    /**
     * The six Callings. `skills`: the two skills whose levels give talent points; `guild`: the Guilds guild it suits;
     * `active`: the Calling Sigil's ability (`kind` echo, rally, trail, song, timber or static; `seconds`, `cooldown`,
     * `radius`); `talents`: tiers 1 and 2 have two ranks (`v` per rank), tier 3 one. Talent kinds: `xp` (+v% XP in
     * `skill`), `chance` (+v% chance for the skill perks in `perks`), `dur` / `cd` (the active lasts v% longer / its
     * cooldown is v% shorter), `dmg` (v% more damage `vs` champion, monster, under (you underground) or rain (you in the
     * rain)), `guard` (v% less damage `from` any, fall, fire, projectile, monster, lightning, under or rain), `hold`
     * (`effects` kept while `cond`: under, water, sprint, rain or thunder; `amp: true` = level v), `lowhp` (Regeneration
     * II for v s below 30% health, every `cooldown` s), `kill` (v% chance of `effect` for `seconds` after a kill),
     * `sapling` (v% chance of a sapling from a log), `orehound` (mining an ore shows the same ore within v blocks) and
     * `ext` (read by another pack from `realm:calling`, as `bonus.<key>`). Keep the ids: choices are saved by them.
     * @type {{ id: string, name: string, skills: ("mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration")[], guild: string, blurb: string, active: { name: string, kind: string, seconds: number, cooldown: number, radius?: number, text: string }, talents: { id: string, name: string, tier: number, kind: string, v: number[], text: string, skill?: string, perks?: string[], vs?: string, from?: string, effects?: string[], cond?: string, amp?: boolean, cooldown?: number, effect?: string, seconds?: number, key?: string }[] }[]}
     */
    list: [
      {
        id: "delver",
        name: "Delver",
        skills: ["mining", "combat"],
        guild: "miners",
        blurb: "Deep tunnels, rich veins and whatever waits in the dark.",
        active: { name: "Echo Sense", kind: "echo", seconds: 10, cooldown: 90, radius: 8, text: "Ores within {radius} blocks glow for {seconds}s" },
        talents: [
          { id: "prospector", name: "Prospector", tier: 1, kind: "xp", skill: "mining", v: [10, 20], text: "+{v}% Mining XP" },
          { id: "rich_veins", name: "Rich Veins", tier: 1, kind: "chance", perks: ["doubleOre"], v: [4, 8], text: "+{v}% chance of a double ore drop" },
          { id: "long_echo", name: "Long Echo", tier: 1, kind: "dur", v: [50, 100], text: "Echo Sense lasts {v}% longer" },
          { id: "tunnel_rat", name: "Tunnel Rat", tier: 2, kind: "hold", effects: ["haste"], cond: "under", amp: true, v: [1, 2], text: "Haste {lvl} underground (below y 40, under cover)" },
          { id: "deep_brawler", name: "Deep Brawler", tier: 2, kind: "dmg", vs: "under", v: [8, 15], text: "Your hits deal {v}% more underground" },
          { id: "quick_echo", name: "Quick Echo", tier: 2, kind: "cd", v: [20, 35], text: "Echo Sense cooldown {v}% shorter" },
          { id: "deep_lungs", name: "Deep Lungs", tier: 3, kind: "hold", effects: ["water_breathing", "night_vision"], cond: "water", v: [1], text: "Water Breathing and Night Vision underwater" },
          { id: "ore_hound", name: "Ore Hound", tier: 3, kind: "orehound", v: [6], text: "Mining an ore shows the same ore within {v} blocks" },
          { id: "stonehide", name: "Stonehide", tier: 3, kind: "guard", from: "under", v: [20], text: "{v}% less damage underground" },
        ],
      },
      {
        id: "warden",
        name: "Warden",
        skills: ["combat", "exploration"],
        guild: "wardens",
        blurb: "The wall between the town and the night.",
        active: { name: "Rally Cry", kind: "rally", seconds: 10, cooldown: 120, text: "You and party mates near you get Strength I for {seconds}s" },
        talents: [
          { id: "drillmaster", name: "Drillmaster", tier: 1, kind: "xp", skill: "combat", v: [10, 20], text: "+{v}% Combat XP" },
          { id: "sharp_eye", name: "Sharp Eye", tier: 1, kind: "dmg", vs: "monster", v: [5, 10], text: "Your hits deal {v}% more to monsters" },
          { id: "loud_voice", name: "Loud Voice", tier: 1, kind: "dur", v: [50, 100], text: "Rally Cry lasts {v}% longer" },
          { id: "iron_skin", name: "Iron Skin", tier: 2, kind: "guard", from: "projectile", v: [15, 30], text: "{v}% less damage from arrows and other projectiles" },
          { id: "battle_rhythm", name: "Battle Rhythm", tier: 2, kind: "kill", effect: "strength", seconds: 5, v: [10, 20], text: "{v}% chance of Strength I for 5s after a kill" },
          { id: "ready_again", name: "Ready Again", tier: 2, kind: "cd", v: [20, 35], text: "Rally Cry cooldown {v}% shorter" },
          { id: "champions_bane", name: "Champion's Bane", tier: 3, kind: "dmg", vs: "champion", v: [15], text: "Your hits deal {v}% more to champions" },
          { id: "bulwark", name: "Bulwark", tier: 3, kind: "guard", from: "monster", v: [15], text: "{v}% less damage from monsters" },
          { id: "second_wind", name: "Second Wind", tier: 3, kind: "lowhp", cooldown: 120, v: [6], text: "Below 30% health: Regeneration II for {v}s (every 2 minutes)" },
        ],
      },
      {
        id: "pathfinder",
        name: "Pathfinder",
        skills: ["exploration", "fishing"],
        guild: "wayfarers",
        blurb: "Every road, every coast, every map's edge.",
        active: { name: "Trailblaze", kind: "trail", seconds: 20, cooldown: 90, text: "Speed II for {seconds}s" },
        talents: [
          { id: "long_strides", name: "Long Strides", tier: 1, kind: "xp", skill: "exploration", v: [10, 20], text: "+{v}% Exploration XP" },
          { id: "light_feet", name: "Light Feet", tier: 1, kind: "guard", from: "fall", v: [30, 60], text: "{v}% less fall damage" },
          { id: "long_trail", name: "Long Trail", tier: 1, kind: "dur", v: [50, 100], text: "Trailblaze lasts {v}% longer" },
          { id: "anglers_path", name: "Angler's Path", tier: 2, kind: "xp", skill: "fishing", v: [10, 20], text: "+{v}% Fishing XP" },
          { id: "fleet", name: "Fleet", tier: 2, kind: "hold", effects: ["speed"], cond: "sprint", amp: true, v: [1, 2], text: "Speed {lvl} while you sprint" },
          { id: "fresh_legs", name: "Fresh Legs", tier: 2, kind: "cd", v: [20, 35], text: "Trailblaze cooldown {v}% shorter" },
          { id: "waystones", name: "Waystone Friend", tier: 3, kind: "ext", key: "waystoneOff", v: [25], text: "Waystone trips cost {v}% less (Waystones & Inns)" },
          { id: "map_sense", name: "Map Sense", tier: 3, kind: "ext", key: "mapReveal", v: [128], text: "Treasure map spots show from {v} blocks away, not 96 (Treasure Maps)" },
          { id: "seafarer", name: "Seafarer", tier: 3, kind: "hold", effects: ["conduit_power"], cond: "water", v: [1], text: "Conduit Power while you're in water" },
        ],
      },
      {
        id: "hearthkeeper",
        name: "Hearthkeeper",
        skills: ["farming", "fishing"],
        guild: "growers",
        blurb: "Full fields, full nets, a warm table.",
        active: { name: "Hearth Song", kind: "song", seconds: 8, cooldown: 120, text: "You and party mates near you get Regeneration I for {seconds}s" },
        talents: [
          { id: "good_soil", name: "Good Soil", tier: 1, kind: "xp", skill: "farming", v: [10, 20], text: "+{v}% Farming XP" },
          { id: "full_nets", name: "Full Nets", tier: 1, kind: "chance", perks: ["secondCatch"], v: [4, 8], text: "+{v}% chance of a second fish" },
          { id: "long_song", name: "Long Song", tier: 1, kind: "dur", v: [50, 100], text: "Hearth Song lasts {v}% longer" },
          { id: "bountiful", name: "Bountiful", tier: 2, kind: "chance", perks: ["extraCrop"], v: [4, 8], text: "+{v}% chance of an extra crop" },
          { id: "warm_hearth", name: "Warm Hearth", tier: 2, kind: "guard", from: "fire", v: [20, 40], text: "{v}% less damage from fire and lava" },
          { id: "calm_waters", name: "Calm Waters", tier: 2, kind: "cd", v: [20, 35], text: "Hearth Song cooldown {v}% shorter" },
          { id: "hearty_dishes", name: "Hearty Dishes", tier: 3, kind: "ext", key: "dishPct", v: [25], text: "Kitchen dishes' effects last {v}% longer (Kitchen)" },
          { id: "green_thumb", name: "Green Thumb", tier: 3, kind: "chance", perks: ["extraCrop", "seeds"], v: [10], text: "+{v}% chance of an extra crop and of seeds" },
          { id: "lucky_line", name: "Lucky Line", tier: 3, kind: "ext", key: "luckyLine", v: [50], text: "Rare, epic and legendary fish bite {v}% more often (Fishing 2.0)" },
        ],
      },
      {
        id: "woodwright",
        name: "Woodwright",
        skills: ["woodcutting", "farming"],
        guild: "growers",
        blurb: "Timber, orchards and the things you build from them.",
        active: { name: "Timberline", kind: "timber", seconds: 15, cooldown: 60, text: "Haste II for {seconds}s" },
        talents: [
          { id: "timber", name: "Timber", tier: 1, kind: "xp", skill: "woodcutting", v: [10, 20], text: "+{v}% Woodcutting XP" },
          { id: "heartwood", name: "Heartwood", tier: 1, kind: "chance", perks: ["extraLog"], v: [4, 8], text: "+{v}% chance of an extra log" },
          { id: "long_day", name: "Long Day", tier: 1, kind: "dur", v: [50, 100], text: "Timberline lasts {v}% longer" },
          { id: "orchard", name: "Orchard", tier: 2, kind: "chance", perks: ["apple"], v: [4, 8], text: "+{v}% chance of an apple from a log" },
          { id: "seedkeeper", name: "Seedkeeper", tier: 2, kind: "chance", perks: ["seeds"], v: [5, 10], text: "+{v}% chance of extra seeds" },
          { id: "steady_hands", name: "Steady Hands", tier: 2, kind: "cd", v: [20, 35], text: "Timberline cooldown {v}% shorter" },
          { id: "sapling_return", name: "Sapling Return", tier: 3, kind: "sapling", v: [30], text: "{v}% chance of a sapling from each log" },
          { id: "bark_armor", name: "Bark Armor", tier: 3, kind: "guard", from: "any", v: [12], text: "{v}% less damage from everything" },
          { id: "builders_eye", name: "Builder's Eye", tier: 3, kind: "ext", key: "buildEye", v: [25], text: "Survival builds may place {v}% more blocks (Easy Building)" },
        ],
      },
      {
        id: "stormcaller",
        name: "Stormcaller",
        skills: ["combat", "exploration"],
        guild: "wardens",
        blurb: "Rain on your face and thunder at your back.",
        active: { name: "Static", kind: "static", seconds: 20, cooldown: 100, text: "For {seconds}s, your hits in the rain slow foes for 3s (needs rain)" },
        talents: [
          { id: "storm_study", name: "Storm Study", tier: 1, kind: "xp", skill: "exploration", v: [10, 20], text: "+{v}% Exploration XP" },
          { id: "charged_blows", name: "Charged Blows", tier: 1, kind: "dmg", vs: "rain", v: [8, 15], text: "Your hits deal {v}% more in the rain" },
          { id: "long_static", name: "Long Static", tier: 1, kind: "dur", v: [50, 100], text: "Static lasts {v}% longer" },
          { id: "grounded", name: "Grounded", tier: 2, kind: "guard", from: "lightning", v: [50, 100], text: "{v}% less damage from lightning" },
          { id: "storm_legs", name: "Storm Legs", tier: 2, kind: "hold", effects: ["speed"], cond: "rain", amp: true, v: [1, 2], text: "Speed {lvl} in the rain" },
          { id: "quick_charge", name: "Quick Charge", tier: 2, kind: "cd", v: [20, 35], text: "Static cooldown {v}% shorter" },
          { id: "rod_reader", name: "Rod Reader", tier: 3, kind: "ext", key: "rodGlass", v: [1], text: "+{v} Storm Glass from each charged lightning rod (Storm Chasing)" },
          { id: "weathered", name: "Weathered", tier: 3, kind: "guard", from: "rain", v: [20], text: "{v}% less damage in the rain" },
          { id: "eye_of_storm", name: "Eye of the Storm", tier: 3, kind: "hold", effects: ["strength"], cond: "thunder", v: [1], text: "Strength I in a thunderstorm" },
        ],
      },
    ],
  },
};
