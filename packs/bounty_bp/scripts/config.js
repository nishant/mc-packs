export const CONFIG = {
  /** Post new bounties every day. Disabled, the board keeps today's list and no new targets spawn. */
  enabled: true,

  /** New bounties every day at this hour, UTC (0 = midnight UTC). Unfinished bounties expire then. */
  resetHourUtc: 0,

  /** Bounties on the board each day (3 to 5 is a good number). */
  count: 4,

  /** How many of them are champion targets (the rest are cull bounties). Champion targets need the Champions pack and a registered board. */
  champions: 2,

  /** Champion targets are this many blocks or more from the board... */
  minDistance: 300,

  /** ...and at most this many. */
  maxDistance: 1200,

  /** A target appears when a player comes this close (blocks) to its spot. */
  spawnDistance: 64,

  /** Never put a target spot within this many blocks of the world spawn. */
  avoidSpawn: 64,

  /** Rewards in Crowns (and Wardens reputation for the Guilds pack). */
  rewards: {
    /** Crowns for the player who defeats a champion target. */
    champion: 100,
    /** Crowns for each helper: players who damaged it in its last 30 seconds, and the killer's party mates within 64 blocks. */
    helper: 30,
    /** Crowns for every player who defeated at least one mob toward a finished cull bounty. */
    cull: 40,
    /** Wardens reputation for the killer (on top of what the Guilds pack gives for the finished bounty). */
    killerRep: 15,
    /** Wardens reputation for each helper and each cull contributor. */
    helperRep: 5,
  },

  /** First names for champion targets: `Gerald the Unexploded`. */
  names: [
    "Gerald", "Morwen", "Bartholomew", "Grizzle", "Ottilie", "Mortimer", "Hilda", "Barnaby", "Agatha", "Cornelius",
    "Edna", "Ignatius", "Prudence", "Rupert", "Wilhelmina", "Fenwick", "Gertrude", "Thaddeus", "Mildred", "Percival",
  ],

  /** The mobs champion targets can be, and the epithets that go with each: `Gerald the Unexploded` is a creeper. */
  targets: [
    { mob: "minecraft:creeper", epithets: ["Unexploded", "Hissing", "Short-Fused", "Ever-Smoldering"] },
    { mob: "minecraft:zombie", epithets: ["Unwashed", "Ravenous", "Moldering", "Groaning"] },
    { mob: "minecraft:skeleton", epithets: ["Rattling", "Bony", "Sharpshooter", "Hollow-Eyed"] },
    { mob: "minecraft:spider", epithets: ["Eight-Legged", "Creeping", "Web-Weaver", "Many-Eyed"] },
    { mob: "minecraft:husk", epithets: ["Parched", "Sun-Dried", "Dusty"] },
    { mob: "minecraft:stray", epithets: ["Frozen", "Frostbitten", "Pale"] },
  ],

  /**
   * Cull bounties the board picks from: defeat `count` of the listed `mobs`, all players together.
   * Keep each `id` unique.
   */
  culls: [
    { id: "zombies", label: "Defeat 40 zombies", count: 40, mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:zombie_villager_v2"] },
    { id: "drowned", label: "Defeat 30 drowned", count: 30, mobs: ["minecraft:drowned"] },
    { id: "skeletons", label: "Defeat 30 skeletons", count: 30, mobs: ["minecraft:skeleton", "minecraft:stray", "minecraft:bogged"] },
    { id: "spiders", label: "Defeat 30 spiders", count: 30, mobs: ["minecraft:spider", "minecraft:cave_spider"] },
    { id: "creepers", label: "Defeat 20 creepers", count: 20, mobs: ["minecraft:creeper"] },
    { id: "witches", label: "Defeat 5 witches", count: 5, mobs: ["minecraft:witch"] },
    { id: "phantoms", label: "Defeat 10 phantoms", count: 10, mobs: ["minecraft:phantom"] },
    { id: "endermen", label: "Defeat 10 endermen", count: 10, mobs: ["minecraft:enderman"] },
    { id: "slimes", label: "Defeat 25 slimes", count: 25, mobs: ["minecraft:slime"] },
    { id: "illagers", label: "Defeat 15 pillagers or vindicators", count: 15, mobs: ["minecraft:pillager", "minecraft:vindicator"] },
  ],

  /** NPCs with this role (the Townsfolk pack's Warden Reyes) offer "Bounties". */
  npcRole: "warden",
};
