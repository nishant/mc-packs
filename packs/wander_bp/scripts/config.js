export const CONFIG = {
  /** Wanderers appear. Disabled, nobody new appears (those on the road leave within a minute) and camps stay empty. */
  enabled: true,

  /** Ticks between rolls for each player (1200 = once a minute). Read when the world starts. */
  scheduleTicks: 1200,

  /** The chance per eligible minute that someone appears (0.07 = 7%: about 2 to 2.5 meetings an hour of exploring). */
  rollChance: 0.07,

  /** The chance is multiplied by this within 128 blocks of a story place or an Atlas site. */
  siteBonus: 1.5,

  /** ...and by this at night for ghosts and when a hostile wanderer could come. */
  nightBonus: 1.25,

  /** Nobody appears closer than this to world spawn (blocks, across; in the Nether, an eighth of it). */
  spawnDistance: 300,

  /** ...or closer than this to a town, a land claim or a safe zone (from its edge). */
  zoneDistance: 160,

  /** ...or closer than this to another wanderer or a camp. */
  wandererDistance: 256,

  /** Minutes before the next meeting after one where you took a job (or fought). */
  cooldownMinutes: 8,

  /** Minutes before the next meeting after one you walked away from. */
  declineCooldownMinutes: 20,

  /** A wanderer nobody took a job from leaves after this many minutes. */
  lifeMinutes: 15,

  /** ...and one whose job was taken after this many. */
  acceptedLifeMinutes: 30,

  /** A wanderer leaves when the player they came for has been this far away (blocks) for `leaveSeconds`. */
  leaveDistance: 96,
  leaveSeconds: 60,

  /** Most wanderers on the road at once, realm-wide (camps not counted). */
  maxOnRoad: 5,

  /** ...of which hostile. */
  maxHostile: 2,

  /** Most wanderer entities at once, camps included. */
  maxEntities: 13,

  /** The share of meetings that are hostile wanderers, once a player may meet them (0 to 0.5). */
  hostileShare: 0.2,

  /** Minutes between hostile wanderers for one player. */
  hostileGapMinutes: 30,

  /** When a Recurring Wanderer could appear, the chance it's them rather than a Stranger. */
  namedShare: 0.5,

  /** A camp's wanderer is there while a player on their chain is within this many blocks. */
  campRange: 48,

  /** Green sparkles over a wanderer who has something for you (only you see them). */
  sparkles: true,
};
