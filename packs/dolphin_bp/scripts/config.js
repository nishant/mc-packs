// Dolphin Friends: tame dolphins with raw fish, ride and steer them, and have them follow you.

export const CONFIG = {
  /** Dolphins can be tamed, ridden and called. When false, tamed dolphins stay tamed but do nothing special. */
  enabled: true,

  /** Chance in percent that one raw cod or salmon tames a dolphin. */
  tameChancePercent: 25,

  /** Most dolphins one player can have tamed at once. */
  maxPerPlayer: 3,

  /** Other players may ride (and steer) your tamed dolphins. When false, only the owner can. */
  othersCanRide: true,

  /** Top speed while ridden, in blocks per second. */
  maxSpeed: 12,

  /** How quickly a ridden dolphin speeds up: blocks per second gained each tick. */
  acceleration: 1.6,

  /** Riders breathe under water (a short Water Breathing, topped up while they ride, gone about 3 s after they get off). */
  riderWaterBreathing: true,

  /** Upward push of a leap out of the water (jump at the surface). */
  leapStrength: 0.9,

  /** A tamed dolphin swims after its owner (in water) when farther than this many blocks. */
  followDistance: 8,
};
