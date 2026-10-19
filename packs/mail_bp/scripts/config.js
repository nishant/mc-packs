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

  /** Most unread letters from one player that one inbox holds; they can send again once some are read or deleted. 0 = no cap. Letters from packs aren't counted. */
  senderUnreadCap: 5,

  /** Most players one player can block (a blocked player's letters aren't delivered; letters from packs still are). */
  blockListMax: 30,

  /** Seconds after joining before that chat line, so it comes after the welcome and news popups. */
  notifyDelaySeconds: 8,

  /** Seconds a player waits between two letters. 0 = no wait. */
  sendCooldownSeconds: 10,

  /** Most letters from packs (townsfolk, Community Goals) one inbox keeps; a newer one pushes out the oldest of them. Letters from players are never pushed out by these. */
  systemInboxLimit: 20,

  /** Days a letter from a pack is kept, read or not, before it is deleted. */
  systemLetterDays: 30,

  /** Letters of the realm's 5000 kept free for players: letters from packs stop arriving when the realm holds 5000 minus this. */
  systemReserve: 1000,

  /** Most players remembered as recipients; the ones seen longest ago are forgotten first (their letters stay). */
  maxRoster: 400,

  /** A line in the mail menu on how to send items (letters carry words only). "" = no line. */
  itemsHint: "To send items, use the Player Mailroom build (mc.nish.software/mailroom).",
};
