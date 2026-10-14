export const CONFIG = {
  /** Festivals: their start and end, the daily activities, Festival Ribbons and the ribbon stall. The calendar itself (the Realm day and realm:calendar) always runs. */
  festivals: true,

  /** Announce a festival's first and last day to everyone (a title and a chat line). */
  announce: true,

  /** Each daily activity counts at most this many times per festival, per player. */
  activityMax: 3,

  /** Festival Ribbons a player can earn per festival (activities, the regatta board, the carve-off). */
  ribbonCap: 15,

  /** Crowns a player can earn per festival from the activities. */
  crownCap: 250,

  /** Ribbons and Crowns for one finished activity (the regatta pays `regattaRibbons`). */
  activityRibbons: 2,
  activityCrowns: 20,
  regattaRibbons: 3,

  /** Townsfolk with this role run the Festival Ribbon stall during a festival (Quill the Trader by default). */
  stallRole: "merchant",

  /** The regatta: checkpoints, how far out they go and how long a race may take. */
  regatta: {
    checkpoints: 8,
    radius: 40,
    reach: 6,
    seconds: 300,
  },

  /** Nest Watch (Hatchling Tide): how long it lasts and how many hatchlings must make it. */
  nestSeconds: 90,
  nestHatchlings: 3,
  nestSaved: 2,

  /** Choir sieges on the realm's towns, at night. */
  sieges: true,

  /** Percent chance of a siege on a night that qualifies (the Lantern Fair doubles it; the Long Night has none). */
  siegeChance: 35,

  /** Non-AFK players online for a siege (or one player who has finished Act II of the main story). */
  siegeMinPlayers: 2,

  /** Realm days between sieges. */
  siegeGapDays: 5,

  /** Minutes of warning before the circles rise, and minutes to silence them. */
  warnMinutes: 3,
  siegeMinutes: 12,

  /** Towns Town Projects keeps safe from world events ("Protect from world events") are never besieged. Disabled, they can be: the circles then rise just outside the town's safe zone. */
  spareSafeTowns: true,

  /** Hits a circle's bell needs, once its Choir Singer is down. */
  bellHits: 5,

  /** Pillagers at each circle, at least and at most (each 3 Choir Cairns silenced in the Atlas take one away, up to 6). */
  pillagersMin: 4,
  pillagersMax: 6,

  /** Rewards for each participant. */
  heldCrowns: 60,
  heldRep: 20,
  heldXp: 80,
  failedCrowns: 15,

  /** Hours a town stays Heartened (held) or Shaken (failed). Town Projects counts deliveries x1.25 in a Heartened town. */
  moodHours: 24,
};
