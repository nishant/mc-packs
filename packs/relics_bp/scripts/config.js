export const CONFIG = {
  /** Relic abilities work. Disabled, relics are only keepsakes (the forge and the commands still work). */
  enabled: true,

  /** Relic Shards it takes to forge one relic. */
  shardsPerForge: 8,

  /** Players can forge from `/realm:relics` anywhere, not only after talking to a relicsmith. */
  forgeAnywhere: false,

  /** The NPC role whose townsfolk offer "Relic forge" (Townsfolk pack). */
  npcRole: "relicsmith",

  /** New relics are kept when their owner dies (set when the relic is made; existing relics keep what they had). */
  keepOnDeath: true,

  /** Relics' durability is restored while they're held or worn, so a relic never breaks. */
  autoRepair: true,

  /** How likely the forge picks each rarity (relative weights). */
  rarityWeights: { common: 50, rare: 30, epic: 15, legendary: 5 },

  /** Storm Staff: how far it reaches (blocks). */
  staffRange: 32,

  /** Storm Staff: lightning can strike players. Disabled, players are skipped and the bolt hits what's behind them. */
  staffHitsPlayers: false,

  /** Storm Staff: no lightning within this many blocks of world spawn, so the town can't be set on fire. */
  avoidSpawn: 64,

  /** Compass of Echoes: how far it looks for a champion (blocks). */
  compassRange: 128,

  /**
   * The relics. `id` is fixed (saved on items and in players' records; other packs ask for relics by it).
   * `item` is a vanilla item that doesn't stack (relics carry data, which only unstackable items can);
   * `where` is where it works: `hand` (main hand), `carry` (anywhere in the hotbar or off hand),
   * `head` or `feet` (worn). `cooldown` in seconds (0 = none). `ability` is the lore line players read.
   * @type {{ id: string, name: string, item: string, rarity: "common" | "rare" | "epic" | "legendary", where: "hand" | "carry" | "head" | "feet", cooldown: number, ability: string }[]}
   */
  relics: [
    { id: "storm_staff", name: "Storm Staff", item: "minecraft:trident", rarity: "legendary", where: "hand", cooldown: 30, ability: "Use in a thunderstorm: lightning strikes what you look at" },
    { id: "rain_charm", name: "Rain Charm", item: "minecraft:goat_horn", rarity: "common", where: "carry", cooldown: 0, ability: "Regeneration I while you stand in the rain" },
    { id: "tide_boots", name: "Tide Boots", item: "minecraft:leather_boots", rarity: "rare", where: "feet", cooldown: 0, ability: "Worn in the rain: Dolphin's Grace and Speed I" },
    { id: "lantern_deep", name: "Lantern of the Deep", item: "minecraft:warped_fungus_on_a_stick", rarity: "common", where: "carry", cooldown: 0, ability: "Night Vision below y 0" },
    { id: "storm_meter", name: "Storm Meter", item: "minecraft:spyglass", rarity: "rare", where: "hand", cooldown: 0, ability: "Held: shows the nearest storm cell" },
    { id: "compass_echoes", name: "Compass of Echoes", item: "minecraft:lodestone_compass", rarity: "rare", where: "hand", cooldown: 10, ability: "Use: points to the nearest champion" },
    { id: "frost_band", name: "Frost Band", item: "minecraft:music_disc_wait", rarity: "rare", where: "carry", cooldown: 0, ability: "Your melee hits give Slowness I" },
    { id: "sun_pendant", name: "Sun Pendant", item: "minecraft:music_disc_blocks", rarity: "epic", where: "carry", cooldown: 120, ability: "On fire: Fire Resistance for 10 seconds" },
    { id: "miners_lamp", name: "Miner's Lamp", item: "minecraft:golden_helmet", rarity: "common", where: "head", cooldown: 0, ability: "Worn below y 30: Haste I" },
    { id: "wayfarer_boots", name: "Wayfarer Boots", item: "minecraft:chainmail_boots", rarity: "common", where: "feet", cooldown: 0, ability: "Sprinting outdoors: Speed I" },
  ],
};
