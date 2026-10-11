export const CONFIG = {
  /** Ticks to wait for the installed packs to answer, or to confirm a change (20 = 1 s). */
  answerTicks: 10,

  /** Operators who use an item with exactly this name (renamed on an anvil) open /realm:config. "" = off. */
  itemName: "Realm Settings",

  /** All settings: at most this many lines per page (a heading per pack plus a line per setting). A pack is never split. 0 = one page. */
  allPageSize: 100,
};
