export const CONFIG = {
  /** The night sky show: shooting stars and the aurora on clear nights in the Overworld. */
  enabled: true,

  aurora: {
    /** Northern lights over snowy ground on aurora nights. */
    enabled: true,

    /** Chance (0-1) that a night is an aurora night. Rolled once each night. */
    chance: 0.4,

    /** Ribbon segments in the curtain, side by side along the northern sky. */
    segments: 9,

    /** Seconds between redraws of the curtain (each segment lasts 2 s longer, fading in and out over 2 s). */
    refreshSeconds: 4,

    /** A player counts as on snowy ground when snow or ice is on top within this many blocks (checked every 10 s). */
    snowRadius: 16,
  },

  stars: {
    /** Shooting stars for players outdoors on clear nights. */
    enabled: true,

    /** Seconds between shooting stars for each player: a random time in this range. */
    every: { min: 15, max: 30 },
  },

  wish: {
    /** Sneaking just after a shooting star makes a wish: Luck I, once a night. */
    enabled: true,

    /** Seconds after a shooting star that sneaking still counts as a wish. */
    windowSeconds: 3,

    /** Minutes of Luck I a wish gives. */
    luckMinutes: 5,
  },

  /** The show for players who never ran `/realm:night` (each player can switch it for themselves). */
  defaultOn: true,
};
