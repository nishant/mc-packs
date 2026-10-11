// Silly Enchants: cosmetic "enchantments" kept as lore lines on gear. None of them adds power.

export const CONFIG = {
  /** Silly effects play. When false, the lore stays on the gear but does nothing. */
  enabled: true,

  /** Most silly enchants one item can hold. */
  maxPerItem: 2,

  /** Enchant ids that never play (and can't be applied), e.g. ["moo"]. The ids are listed in the docs. */
  disabled: [],

  /** Hyper Jump: how high the bounce goes (vertical knockback strength; 1.0 is about 6 blocks). */
  hyperJumpStrength: 1.0,

  /** Hyper Jump: seconds between bounces. */
  hyperJumpCooldownSeconds: 4,

  /** Hat Trick: seconds between rabbits for one player. */
  hatTrickCooldownSeconds: 10,

  /** Hat Trick: seconds before the rabbit vanishes again. */
  hatTrickRabbitSeconds: 10,
};
