export const CONFIG = {
  /** Players can set a nickname with /realm:nick. Disabled: everyone shows their gamertag again; nicknames are kept for later. */
  enabled: true,

  /** Show the gamertag in gray on a second line under the nickname, so everyone knows who is who (chat always shows the gamertag). */
  showGamertag: true,

  /** The tag the AFK pack gives AFK players (AFK `tag`). Keep the same as the AFK pack's. */
  afkTag: "afk",

  /** Shown before a nickname while the player has afkTag (AFK `nameTagPrefix`). Keep the same as the AFK pack's. */
  afkPrefix: "§7[AFK]§r ",
};
