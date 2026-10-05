export const CONFIG = {
  /** Phantoms start off for players who never ran /realm:phantoms. */
  defaultOff: false,

  /** Only remove phantoms that appear at least this many blocks above their nearest player, as natural spawns do. Spawn eggs and /summon keep working. */
  minHeightAbovePlayer: 10,

  /** How far (blocks) to look for a new phantom's nearest player. */
  searchRadius: 64,
};
