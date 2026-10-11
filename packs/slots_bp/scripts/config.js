// Slot Machine: spin three reels for Crowns or emeralds. See docs/PACKS.md for the exact return to
// player of the table below (change symbols or payouts, then recompute it as the docs describe).

export const CONFIG = {
  /** The slots can be played. When false, machines and the item only say they're closed. */
  enabled: true,

  /** Which stakes players may use. Crowns are the `crowns` scoreboard (Crowns pack); emeralds come from the inventory. */
  currencies: {
    crowns: true,
    emeralds: true,
  },

  /** The stakes a player can choose, per currency. */
  stakes: {
    crowns: [1, 5, 10, 25],
    emeralds: [1, 2, 4, 8],
  },

  /** Most a player may lose per UTC day (stakes minus winnings), per currency. 0 = no limit. */
  dailyLossLimit: {
    crowns: 200,
    emeralds: 32,
  },

  /** Seconds between the end of one spin and the start of the next. */
  cooldownSeconds: 2,

  /** A jackpot is announced to everyone in chat. */
  announceJackpots: true,

  /**
   * The symbols on every reel. `weight` is how many of the reel's stops show it.
   * @type {import("./reels.js").SlotSymbol[]}
   */
  symbols: [
    { id: "cherry", name: "Cherry", color: "§c", weight: 7 },
    { id: "lemon", name: "Lemon", color: "§e", weight: 8 },
    { id: "bell", name: "Bell", color: "§6", weight: 6 },
    { id: "bar", name: "BAR", color: "§f", weight: 5 },
    { id: "gem", name: "Gem", color: "§a", weight: 3 },
    { id: "seven", name: "7", color: "§4", weight: 2 },
    { id: "crown", name: "Crown", color: "§d", weight: 1 },
  ],

  /**
   * What each result pays, as a multiple of the stake. The first line that matches wins, so bigger
   * wins come first. `count` is how many reels show the symbol, anywhere.
   * @type {import("./reels.js").PayLine[]}
   */
  payouts: [
    { symbol: "crown", count: 3, pay: 300, jackpot: true },
    { symbol: "seven", count: 3, pay: 100 },
    { symbol: "gem", count: 3, pay: 40 },
    { symbol: "bar", count: 3, pay: 30 },
    { symbol: "bell", count: 3, pay: 18 },
    { symbol: "cherry", count: 3, pay: 10 },
    { symbol: "lemon", count: 3, pay: 10 },
    { symbol: "cherry", count: 2, pay: 3 },
    { symbol: "crown", count: 2, pay: 8 },
  ],
};
