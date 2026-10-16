export const CONFIG = {
  /** Easy Building (Effortless Building) for the whole realm. Disabled: commands say so and placing blocks builds nothing extra. */
  enabled: true,

  /** Only operators can use the building tools. */
  operatorsOnly: false,

  /** Maximum blocks per build allowed on the realm (survival and creative). */
  maxBlocksCap: 50000,

  /** Mode list complexity: "player" (players choose), "simple" (force simple modes), or "advanced" (force all modes). */
  modeComplexity: "player",

  /** Require a player tag to use Effortless Building. */
  tagRequired: false,

  /** Tag required when tagRequired is enabled. */
  requiredTag: "admin",

  /** Allow Destroy mode with a pickaxe, axe, or shovel. */
  allowDestroy: true,

  /** Restrict Destroy mode to Creative mode only. */
  destroyCreativeOnly: false,

  /** Allow Infinite Reach mode (placing or destroying at a distance in midair). */
  allowInfiniteReach: true,

  /** Longest reach distance cap in blocks (0 = no cap, up to 256). */
  maxReachCap: 64,

  /** Automatically give the Building Book and Tutorial Book to new players when they first join. */
  autoGiveBook: false,

  /** Restrict preview quality changes to players with the required tag. */
  configTagRequired: false,

  /** Use standard menus instead of floating 3D panels for all players. */
  plainMenusForAll: false,

  /** Builds may reach into other players' land claims (Land Claims). Off: blocks inside another player's claim are skipped. */
  inOthersClaims: false,

  /** Inside a safe zone made with Safe Zones (/realm:zones), only operators can build or destroy with the tools. */
  safeZonesOperatorsOnly: true,
};
