export const CONFIG = {
  /** Meteors fall on their own at night. `/realm:meteor_now` works either way. */
  enabled: true,

  /** Chance (0-1) that a meteor falls during a night. Rolled once each night, at a random time. */
  chance: 0.33,

  /** It lands this many blocks from a random player in the Overworld: a random distance in this range. */
  distance: { min: 200, max: 600 },

  /** `/realm:meteor_now` aims this many blocks in front of the operator, so they can watch it come down. */
  nowDistance: 100,

  /** It never lands closer than this many blocks to the world spawn. */
  avoidSpawn: 64,

  /** Seconds between the chat warning and the impact. */
  warningSeconds: 60,

  /** Make a crater with a meteorite core (ancient debris and magma). Disabled, it's only the show. */
  craters: true,

  /** Crater radius in blocks: a random size in this range. */
  craterRadius: { min: 3, max: 4 },

  /** Ancient debris in the meteorite core: a random count in this range. */
  ancientDebris: { min: 1, max: 3 },

  /**
   * A crater is only made where the chunk is loaded: if no one is near when it lands, it's made when a
   * player first comes within this many blocks.
   */
  craterDistance: 64,

  /** Players within this many blocks get the camera shake and the full boom. */
  shakeDistance: 200,

  /** Seconds the crater smokes after it's made. */
  smokeSeconds: 120,

  /** Players this close to the crater count as having found it (and get the journal page). */
  foundDistance: 12,
};
