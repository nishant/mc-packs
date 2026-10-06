export const CONFIG = {
  /** Unlocks are announced in chat to everyone online. Disabled: only the player who unlocked it is told. */
  announce: true,

  /** Seconds between checks for new unlocks. */
  checkSeconds: 10,

  /** Playtime and distance aren't counted while a player has this tag (set by the AFK pack). "" = always count. */
  afkTag: "afk",

  /** Movement faster than this (blocks per second) is a teleport and isn't counted as distance. */
  maxSpeed: 100,

  /**
   * The milestones. `id`: unique, keep it when editing (unlocks are saved by it). `stat`: what it
   * counts, one of playtime (in hours here), mined, placed, travelled, flown, mobkills, pvpkills,
   * deaths, joins. `name`: shown with the tier number, "Miner II". `tiers`: the amount for each
   * tier, lowest first.
   * @type {{ id: string, stat: "playtime" | "mined" | "placed" | "travelled" | "flown" | "mobkills" | "pvpkills" | "deaths" | "joins", name: string, tiers: number[] }[]}
   */
  milestones: [
    { id: "playtime", stat: "playtime", name: "Regular", tiers: [1, 10, 100] },
    { id: "mined", stat: "mined", name: "Miner", tiers: [1000, 10000, 100000] },
    { id: "placed", stat: "placed", name: "Builder", tiers: [1000, 10000, 100000] },
    { id: "travelled", stat: "travelled", name: "Explorer", tiers: [10000, 100000, 1000000] },
    { id: "flown", stat: "flown", name: "Aviator", tiers: [10000, 100000, 1000000] },
    { id: "mobkills", stat: "mobkills", name: "Monster Hunter", tiers: [100, 1000, 10000] },
    { id: "deaths", stat: "deaths", name: "Unlucky", tiers: [10, 50, 100] },
    { id: "joins", stat: "joins", name: "Loyal", tiers: [10, 100, 365] },
  ],
};
