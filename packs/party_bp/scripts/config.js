export const CONFIG = {
  /** Players can make and join parties. Disabled: the commands answer that parties are off and the HUD stops; parties are kept. */
  enabled: true,

  /** Most players in one party, the leader included. */
  maxSize: 6,

  /** An invite can be accepted for this many seconds. */
  inviteSeconds: 120,

  /** The party HUD above the hotbar (each player can switch it in /realm:prefs). */
  partyHud: true,

  /** The HUD lists party mates within this many blocks, in the same dimension. */
  hudRange: 128,

  /** The HUD lists at most this many mates, nearest first. */
  hudMates: 4,

  /** Longest party chat message, in characters. */
  chatMaxLength: 200,
};
