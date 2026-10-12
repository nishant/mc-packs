// Silly Enchants: cosmetic "enchantments" kept as lore lines on gear. None of them adds power.

export const CONFIG = {
  /** Silly effects play. When false, the lore stays on the gear but does nothing. */
  enabled: true,

  /** Most silly enchants one item can hold. */
  maxPerItem: 2,

  /** Enchant ids that never play (and can't be applied), e.g. ["moo"]. The ids are listed in the docs. */
  disabled: [],

  /** Hyper Jump: scales every launch (0.2 to 2). At 1 a big jump goes about 30 blocks up, a huge one about 50 and the Space Program about 150. */
  hyperJumpStrength: 1.0,

  /** Hyper Jump: the odds of each launch, as weights (they needn't add up to 100). */
  hyperJumpOdds: { big: 60, huge: 30, space: 10 },

  /** Hyper Jump: a puff of slow falling just above the ground stops the fall, so landings don't hurt. When false, a big jump can mean real fall damage (Feather Falling helps). */
  hyperJumpSoftLanding: true,

  /** Hyper Jump: seconds between bounces. */
  hyperJumpCooldownSeconds: 4,

  /** Hat Trick: seconds between rabbits for one player. */
  hatTrickCooldownSeconds: 10,

  /** Hat Trick: seconds before the rabbit vanishes again. */
  hatTrickRabbitSeconds: 10,
};
