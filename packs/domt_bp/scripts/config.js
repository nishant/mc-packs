// Deck of Many Things: draw a card with /realm:domt for a random effect, from a snack to a wish.

export const CONFIG = {
  /**
   * Who draws: "cooldown" = everyone, each player once every `cooldownMinutes`; "operators" = only
   * operators draw (no cooldown), for themselves or for any online player.
   * @type {"cooldown" | "operators"}
   */
  mode: "cooldown",

  /** Real minutes between a player's draws in "cooldown" mode. 0 = no cooldown. */
  cooldownMinutes: 20,

  /** How likely each rarity is (relative weights). A rarity with every card disabled is skipped. */
  weights: {
    common: 70,
    uncommon: 20,
    rare: 9,
    legendary: 1,
  },

  /** Rare and legendary draws are announced in chat to everyone. */
  announceRare: true,

  /** Cards that place blocks for a while (The Arena, The Spore) can be drawn. They never work inside a safe zone. */
  blockCards: true,

  /** Minutes before The Spore's mushroom field turns back to grass. */
  sporeMinutes: 60,

  /**
   * Card ids that start disabled (see the card table in docs/PACKS.md). Operators can switch each card
   * on or off in game with /realm:domt_effects; that choice wins over this list.
   * @type {string[]}
   */
  disabled: [],

  /** How many past draws each player's history keeps. */
  historySize: 20,
};
