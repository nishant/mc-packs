export const CONFIG = {
  /**
   * Land claims for the whole realm. Off by default: until an operator enables it in /realm:config,
   * /realm:claim only says so and nothing is protected. Disabling it again keeps every claim for later.
   */
  enabled: false,

  /** A new claim reaches this many blocks from where you stand, each way: 16 = 33 x 33 blocks, top to bottom. */
  radius: 16,

  /** Most claims one player can have. */
  maxClaims: 2,

  /** Most players one claim can be shared with. */
  maxShared: 10,

  /** Explosions (creepers, TNT, ghasts...) break no blocks inside a claim. They still hurt. */
  protectExplosions: true,

  /** Operators can build and open things in anyone's claim. Off: operators can only remove claims. */
  operatorsBypass: false,

  /** Entities in a claim only its players can use: armor stands, and minecarts and boats that hold items. */
  protectedEntities: [
    "minecraft:armor_stand",
    "minecraft:chest_minecart",
    "minecraft:hopper_minecart",
    "minecraft:chest_boat",
  ],

  /** How long "Show claim borders" draws them, in seconds. */
  borderSeconds: 10,
};
