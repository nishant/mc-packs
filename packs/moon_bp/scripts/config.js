export const CONFIG = {
  /** Full moons can rise as a Blood Moon or a Harvest Moon. Disabled, every night is normal. */
  enabled: true,

  /** Chance (0-1) that a full moon is a Blood Moon. */
  bloodChance: 0.34,

  /** Chance (0-1) that a full moon that isn't a Blood Moon is a Harvest Moon. */
  harvestChance: 0.34,

  /** The night starts (dusk) at this time of day, in ticks (12000 = sunset). */
  duskTime: 12000,

  /** ... and ends (dawn) at this time of day (23000 = sunrise). */
  dawnTime: 23000,

  /** Never spawn Blood Moon monsters within this many blocks of world spawn. */
  avoidSpawn: 64,

  blood: {
    /** Seconds between waves of extra monsters around each player. */
    spawnSeconds: 20,
    /** Fewest extra monsters per wave, per player. */
    spawnMin: 1,
    /** Most extra monsters per wave, per player. */
    spawnMax: 2,
    /** Closest an extra monster appears to the player, in blocks. */
    minDistance: 16,
    /** Farthest an extra monster appears from the player, in blocks. */
    maxDistance: 32,
    /** No new waves around a player while this many Blood Moon monsters are alive within 48 blocks of them. */
    maxExtraPerPlayer: 8,
    /**
     * The extra monsters and how often each is picked (a higher weight is more often).
     * @type {{ id: string, weight: number }[]}
     */
    mobs: [
      { id: "minecraft:zombie", weight: 4 },
      { id: "minecraft:skeleton", weight: 3 },
      { id: "minecraft:spider", weight: 2 },
      { id: "minecraft:creeper", weight: 2 },
    ],
    /** Extra experience orbs dropped by each Blood Moon monster a player kills. */
    bonusXpOrbs: 3,
    /** XP levels for each player who was online from dusk to dawn without dying. */
    rewardLevels: 3,
    /** Crowns for each player who survived the Blood Moon (Crowns scoreboard, see the Crowns pack). 0 = none. */
    rewardCrowns: 25,
    /** The title unlocked the first time a player survives one (Titles pack). Empty = none. */
    title: "Blood Moon Survivor",
  },

  harvest: {
    /** The randomTickSpeed gamerule during a Harvest Moon (vanilla is 1): crops, saplings and grass grow this many times faster. Put back at dawn. */
    tickSpeed: 3,
  },
};
