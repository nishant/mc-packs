export const CONFIG = {
  /** Champions appear on their own (natural spawns). Disabled, only `/realm:champions_spawn` and other packs (the Bounty Board) make them. */
  enabled: true,

  /** Chance that a hostile mob spawning in the overworld becomes a champion (0.025 = 2.5%, one in 40). */
  chance: 0.025,

  /** During a Blood Moon (the `realm:moon` event from the Blood Moon pack) the chance is multiplied by this. */
  bloodMoonMultiplier: 3,

  /**
   * The most champions loaded in the whole world for natural ones to stay appearing. The real limit scales with the
   * players online (`maxAlivePerPlayer`), so this is only the ceiling: 80 lets 100 players meet 0.8 each. A value an
   * operator saved earlier (8 or 16) stays the ceiling. Operators and other packs can still spawn more.
   */
  maxAlive: 80,

  /**
   * Natural champions stop at this many loaded champions for each player online, up to `maxAlive`: 0.8 is the old
   * 8 for about 10 players, 1 player meets 1, 100 meet 80. At least one. 0 = no per-player limit (only `maxAlive`).
   */
  maxAlivePerPlayer: 0.8,

  /**
   * Natural champions don't appear within 64 blocks of this many loaded champions, so one area (a base, a
   * crowd of players) doesn't fill the whole `maxAlive`. 0 = no limit. `areaSpacing` already keeps natural ones 48 blocks apart.
   */
  maxAliveNearby: 3,

  /** Natural champions only appear at night (time of day 13000 to 23000). */
  nightOnly: true,

  /**
   * Natural champions only appear under the open sky (nothing above the mob's head), so dark-room
   * mob farms and caves don't turn out champions.
   */
  surfaceOnly: true,

  /**
   * After a champion appears on its own, no other natural champion appears within this many blocks
   * of it for `areaCooldownMinutes`, so one busy area (or a mob farm) can't keep making them.
   */
  areaSpacing: 48,

  /** See `areaSpacing`. */
  areaCooldownMinutes: 10,

  /**
   * Natural champions never appear next to anything player-made (the 5 x 5 blocks around the spawn,
   * from under its feet to its head): bases, villages and the platforms of open-sky mob farms.
   */
  avoidBuilds: true,

  /**
   * Champions come looking for you: a champion with a player (survival or adventure, not AFK) within
   * `range` blocks walks slowly toward the nearest one, a small step along the ground every quarter
   * second, until it is `stopDistance` blocks away and its own hunt takes over. It never steps into
   * water, lava, a safe zone or a land claim, over a fence or wall, or up more than one block.
   * Champions in an Expedition dungeon are left to the dungeon.
   */
  approach: {
    /** Disabled: champions only wander and hunt like ordinary mobs. */
    enabled: true,
    /** How far away (blocks) a champion notices a player and starts coming. */
    range: 48,
    /** Walking pace of the approach in blocks per second (an ordinary zombie walks about 2.3). */
    speed: 1,
    /** It stops stepping this close (blocks) and lets the mob's own hunting take over. */
    stopDistance: 10,
  },

  /** Mobs that can become champions. Mobs not listed here are never champions. */
  mobs: [
    "minecraft:zombie",
    "minecraft:husk",
    "minecraft:drowned",
    "minecraft:zombie_villager_v2",
    "minecraft:skeleton",
    "minecraft:stray",
    "minecraft:spider",
    "minecraft:creeper",
    "minecraft:witch",
  ],

  /** First names champions get at random: `Gerald the Stormcaller`. */
  names: [
    "Gerald", "Morwen", "Bartholomew", "Grizzle", "Ottilie", "Mortimer", "Hilda", "Barnaby", "Agatha", "Cornelius",
    "Edna", "Ignatius", "Prudence", "Rupert", "Wilhelmina", "Fenwick", "Gertrude", "Thaddeus", "Mildred", "Percival",
    "Beatrix", "Ambrose", "Dorcas", "Silas", "Ursula", "Horace", "Petunia", "Lucius", "Winifred", "Osric",
  ],

  /**
   * The traits and how strong they are. Each champion gets one at random (creepers can't be
   * Frostbound or Vampiric: they don't hit).
   */
  traits: {
    stormcaller: {
      /** In thunderstorms it calls lightning near a player within this many blocks. */
      range: 16,
      /** Seconds between strikes: a random time from `minSeconds` to `maxSeconds`. */
      minSeconds: 6,
      /** See `minSeconds`. */
      maxSeconds: 10,
    },
    frostbound: {
      /** Seconds of Slowness II each of its hits gives. */
      slownessSeconds: 4,
    },
    vampiric: {
      /** Share of the damage it deals that it heals (0.5 = half). */
      healShare: 0.5,
    },
    splitting: {
      /** Copies it leaves behind when it dies (baby zombies for the zombie kind, the same mob at half health otherwise). */
      copies: 3,
    },
    shielded: {
      /** Hits it takes before its Resistance IV shield breaks. */
      hits: 5,
    },
  },

  /** Traits that also give the champion Speed I. */
  speedTraits: ["vampiric", "splitting"],

  /** Resistance level every champion has (0 = none, 1 = Resistance I). */
  resistanceLevel: 1,

  /** Health Boost level every champion has (each level adds 4 health, 2 hearts). If a mob ignores it, it gets Absorption of the same level instead. */
  healthBoostLevel: 2,

  /** Champions don't burn in daylight or fire (Fire Resistance), so they last until someone deals with them. */
  fireResistance: true,

  /** Relic Shards a champion drops when a player had a hand in its death: a random number from `min` to `max`. */
  shards: { min: 1, max: 3 },

  /** XP orbs a champion drops when a player had a hand in its death. */
  xpOrbs: 20,

  /** Players who damaged a champion this many seconds or less before it died count as helpers (and the last one as the killer when the champion died some other way). */
  helperSeconds: 30,

  /** Players within this many blocks get a chat line when a champion appears. */
  announceRadius: 48,

  /** Stormcaller lightning never lands within this many blocks of the world spawn (it just crackles there), so the spawn area doesn't burn. */
  avoidSpawn: 64,

  /** How champions stand out from ordinary mobs. Each trait has its own color, helmet and aura (see the docs). */
  looks: {
    /** A small particle aura in the trait's color around every champion that has a player within 64 blocks. */
    aura: true,
    /** Ticks between aura puffs (20 ticks = 1 second; each puff is 2 particles per champion). Lower is busier. */
    auraTicks: 10,
    /**
     * Champions that can wear armor (zombies, husks, drowned, zombie villagers, skeletons, strays and
     * the like) wear a helmet that shows their trait. It never drops: the pack removes it when the champion dies.
     */
    gear: true,
    /** A spell sound and a burst of the aura when a champion appears. */
    spawnEffect: true,
  },
};
