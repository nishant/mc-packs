export const CONFIG = {
  /** Relic abilities work. Disabled, relics are only keepsakes (the forge and the commands still work). */
  enabled: true,

  /** Relic Shards it takes to forge one relic. */
  shardsPerForge: 8,

  /** Players can forge from `/realm:relics` anywhere, not only after talking to a relicsmith. */
  forgeAnywhere: false,

  /** The NPC role whose townsfolk offer "Relic forge" (Townsfolk pack). */
  npcRole: "relicsmith",

  /** The townsfolk (Townsfolk pack id) that **Place a relicsmith here** places: one with the `npcRole` role. */
  relicsmithId: "ida",

  /** New relics are kept when their owner dies (set when the relic is made; existing relics keep what they had). */
  keepOnDeath: true,

  /** Relics' durability is restored while they're held or worn, so a relic never breaks. */
  autoRepair: true,

  /** How likely the forge picks each rarity (relative weights). */
  rarityWeights: { common: 50, rare: 30, epic: 15, legendary: 5 },

  /** Storm Staff: how far it reaches (blocks). */
  staffRange: 48,

  /** Storm Staff: lightning can strike players. Disabled, players are skipped and the bolt hits what's behind them. */
  staffHitsPlayers: false,

  /** Storm Staff: no lightning within this many blocks of world spawn (0 = anywhere). Fires a bolt starts are put out either way. */
  avoidSpawn: 24,

  /** Compass of Echoes: how far it looks for a champion (blocks). */
  compassRange: 128,

  /** The Singing Blade, Keeper's Lamp and Lantern Shard: how far their ring, light and pull reach (blocks). */
  auraRange: 6,

  /**
   * The relics. `id` is fixed (saved on items and in players' records; other packs ask for relics by it).
   * `item` is a vanilla item that doesn't stack (relics carry data, which only unstackable items can);
   * `where` is where it works: `hand` (main hand), `carry` (anywhere in the hotbar or off hand),
   * `head` or `feet` (worn). `cooldown` in seconds (0 = none). `ability` is the lore line players read.
   * `story: true` relics are story rewards (Story Questlines): never forged, only given.
   * @type {{ id: string, name: string, item: string, rarity: "common" | "rare" | "epic" | "legendary", where: "hand" | "carry" | "head" | "feet", cooldown: number, ability: string, story?: boolean }[]}
   */
  relics: [
    { id: "storm_staff", name: "Storm Staff", item: "minecraft:trident", rarity: "legendary", where: "hand", cooldown: 30, ability: "Use in a thunderstorm: lightning strikes what you look at" },
    { id: "rain_charm", name: "Rain Charm", item: "minecraft:goat_horn", rarity: "common", where: "carry", cooldown: 0, ability: "Regeneration I while you stand in the rain" },
    { id: "tide_boots", name: "Tide Boots", item: "minecraft:leather_boots", rarity: "rare", where: "feet", cooldown: 0, ability: "Worn in the rain: Speed I and Jump Boost I" },
    { id: "lantern_deep", name: "Lantern of the Deep", item: "minecraft:warped_fungus_on_a_stick", rarity: "common", where: "carry", cooldown: 0, ability: "Night Vision below y 0" },
    { id: "storm_meter", name: "Storm Meter", item: "minecraft:spyglass", rarity: "rare", where: "hand", cooldown: 0, ability: "Held: shows the nearest storm cell" },
    { id: "compass_echoes", name: "Compass of Echoes", item: "minecraft:music_disc_5", rarity: "rare", where: "hand", cooldown: 10, ability: "Use: points to the nearest champion" },
    { id: "frost_band", name: "Frost Band", item: "minecraft:music_disc_wait", rarity: "rare", where: "carry", cooldown: 0, ability: "Your melee hits give Slowness I" },
    { id: "sun_pendant", name: "Sun Pendant", item: "minecraft:music_disc_blocks", rarity: "epic", where: "carry", cooldown: 120, ability: "On fire: Fire Resistance for 10 seconds" },
    { id: "miners_lamp", name: "Miner's Lamp", item: "minecraft:golden_helmet", rarity: "common", where: "head", cooldown: 0, ability: "Worn below y 30: Haste I" },
    { id: "wayfarer_boots", name: "Wayfarer Boots", item: "minecraft:chainmail_boots", rarity: "common", where: "feet", cooldown: 0, ability: "Sprinting outdoors: Speed I" },
    // Story relics: rewards from the Story Questlines, never forged.
    { id: "lantern_shard", name: "Lantern Shard", item: "minecraft:music_disc_otherside", rarity: "epic", where: "carry", cooldown: 0, story: true, ability: "Night Vision in the dark; held, it points to the nearest unlit seal" },
    { id: "choir_mask", name: "Gray Choir Mask", item: "minecraft:leather_helmet", rarity: "epic", where: "head", cooldown: 0, story: true, ability: "Worn: Choir enemies deal half damage unless you attack them; no Darkness" },
    { id: "hal_compass", name: "Hal's Compass", item: "minecraft:music_disc_13", rarity: "rare", where: "hand", cooldown: 5, story: true, ability: "Use: the way to your last death point and your home" },
    { id: "vesna_charm", name: "Fen Charm", item: "minecraft:music_disc_chirp", rarity: "rare", where: "carry", cooldown: 0, story: true, ability: "No Poison, and witches can't hurt you unless you attack one" },
    { id: "singing_blade", name: "The Singing Blade", item: "minecraft:iron_sword", rarity: "epic", where: "hand", cooldown: 2, story: true, ability: "Hits ring a note that slows monsters near what you hit" },
    { id: "hollow_crown", name: "The Hollow Crown", item: "minecraft:chainmail_helmet", rarity: "legendary", where: "head", cooldown: 0, story: true, ability: "Worn at night: Night Vision and Strength I. Villagers shun you" },
    { id: "keeper_lamp", name: "Keeper's Lamp", item: "minecraft:music_disc_strad", rarity: "rare", where: "carry", cooldown: 0, story: true, ability: "In the dark: a ring of light around you that slows monsters" },
  ],
};
