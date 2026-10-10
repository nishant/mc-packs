export const CONFIG = {
  /**
   * Most letters one player's inbox holds. When a new letter arrives in a full inbox, the oldest
   * letters already read are dropped first; if every letter is still unread, the letter isn't sent
   * and its writer is told the inbox is full.
   */
  inboxLimit: 50,

  /** Most letters kept in each player's Sent list; the oldest drop off the list first. */
  sentLimit: 30,

  /** Longest subject, in characters (at most 100, the most a text box takes). Longer subjects are shortened. */
  subjectLength: 40,

  /** Longest letter, in characters. Longer letters are shortened. The form gets one text box per 100 characters (a text box's limit). */
  bodyLength: 600,

  /** On joining, players with unread letters get a chat line such as "You have 2 unread letters: /realm:mail". */
  notifyOnJoin: true,

  /** Seconds after joining before that chat line, so it comes after the welcome and news popups. */
  notifyDelaySeconds: 8,

  /** Seconds a player waits between two letters. 0 = no wait. */
  sendCooldownSeconds: 10,

  /** Most players remembered as recipients; the ones seen longest ago are forgotten first (their letters stay). */
  maxRoster: 400,
};
