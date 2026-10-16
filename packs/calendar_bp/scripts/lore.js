// Realm Calendar content: the Realm Year, the four festivals, their activities, the ribbon stall, the ghost
// tales and the siege lines. Game text is plain ASCII. Voices follow docs/STORY_BIBLE.md section 4.

/**
 * The Realm Year: 4 seasons of 24 Realm days, each with a 4-day festival. Townsfolk (npc_bp) keeps the same
 * table for its birthdays: keep them the same (docs/RPG_DESIGN.md section 4).
 */
export const SEASON_DAYS = 24;
export const SEASONS = [
  { id: "thaw", name: "Thaw", festival: [10, 13], fid: "hatchling_tide" },
  { id: "high_sun", name: "High Sun", festival: [34, 37], fid: "midsummer_regatta" },
  { id: "harvest", name: "Harvest", festival: [58, 61], fid: "lantern_fair" },
  { id: "long_dark", name: "Long Dark", festival: [82, 85], fid: "long_night" },
];
export const YEAR_DAYS = SEASONS.length * SEASON_DAYS;

/** @typedef {{ name: string, color: string, blurb: string, start: string, end: string }} Festival */
/** @type {Record<string, Festival>} */
export const FESTIVALS = {
  hatchling_tide: {
    name: "Hatchling Tide",
    color: "§b",
    blurb: "The turtles come ashore. Guard their hatchlings at night, feed the turtles, swim the tide.",
    start: "The Hatchling Tide has come! The turtles are hatching on every beach.",
    end: "The Hatchling Tide is over. The little ones are out at sea.",
  },
  midsummer_regatta: {
    name: "Midsummer Regatta",
    color: "§e",
    blurb: "Boats, sun and showing off. Race the regatta course, dive from high places, picnic in the sun.",
    start: "The Midsummer Regatta begins! Boats to the water.",
    end: "The Midsummer Regatta is over. The boats are hauled up for the year.",
  },
  lantern_fair: {
    name: "Lantern Fair",
    color: "§6",
    blurb: "Pumpkins, lanterns and ghost stories. Carve a pumpkin for the vote, float a lantern, hear a tale.",
    start: "The Lantern Fair is open! Carve your best pumpkin: the realm votes.",
    end: "The Lantern Fair is over. The lanterns go out one by one.",
  },
  long_night: {
    name: "Starwright's Long Night",
    color: "§d",
    blurb: "The gift week. Gifts to the townsfolk count double, the Choir keeps a truce, and the stars fall.",
    start: "Starwright's Long Night begins. Gifts count double, and the stars are falling.",
    end: "Starwright's Long Night is over. The truce ends with it.",
  },
};

/**
 * The 12 daily activities, 3 per festival. `guild`: who hears about it (Guilds' realm:quest_done).
 * @typedef {{ id: string, fid: string, name: string, how: string, guild: string }} Activity
 * @type {Activity[]}
 */
export const ACTIVITIES = [
  { id: "nest_watch", fid: "hatchling_tide", name: "Nest Watch", how: "At night, start a Nest Watch from /realm:calendar and keep the hatchlings safe from the mobs that come for them.", guild: "wardens" },
  { id: "turtle_feed", fid: "hatchling_tide", name: "Turtle Feeding", how: "Feed seagrass to turtles, 5 times.", guild: "growers" },
  { id: "tide_swim", fid: "hatchling_tide", name: "Tide Swim", how: "Swim 100 blocks without leaving the water.", guild: "wayfarers" },
  { id: "regatta", fid: "midsummer_regatta", name: "The Regatta", how: "Get in a boat on open water and start a race from /realm:calendar: 8 checkpoints, then back to the start.", guild: "wayfarers" },
  { id: "high_dive", fid: "midsummer_regatta", name: "High Dive", how: "Jump from 20 blocks up or more and land in water.", guild: "wayfarers" },
  { id: "picnic", fid: "midsummer_regatta", name: "Midsummer Picnic", how: "Eat 3 different foods outdoors in the daytime.", guild: "growers" },
  { id: "carve_off", fid: "lantern_fair", name: "Pumpkin Carve-off", how: "Place a carved pumpkin or a jack o'lantern: your newest one is your entry. Then vote for someone else's in /realm:calendar.", guild: "growers" },
  { id: "lantern_float", fid: "lantern_fair", name: "Lantern Float", how: "At night, stand at the water's edge with a lantern in your hand and sneak to let it go.", guild: "wayfarers" },
  { id: "ghost_tale", fid: "lantern_fair", name: "Ghost Tales", how: "At night, sit by a lit campfire for 60 seconds and listen.", guild: "wardens" },
  { id: "stargaze", fid: "long_night", name: "Starwatch", how: "At night, stay under the open sky for 60 seconds: a shooting star comes for you.", guild: "wayfarers" },
  { id: "gift_round", fid: "long_night", name: "Gift Round", how: "Give gifts to 3 different townsfolk.", guild: "growers" },
  { id: "candle_vigil", fid: "long_night", name: "Candle Vigil", how: "At night, place 4 candles.", guild: "wardens" },
];

/**
 * The Festival Ribbon stall: cosmetics only. `fid`: only during that festival (none: any festival).
 * kind `title` / `trail` (Titles & Trails), `hat` (an item), `recipe` (a Kitchen recipe card, learned at once).
 * @typedef {{ id: string, kind: "title" | "trail" | "hat" | "recipe", label: string, cost: number, fid?: string, value: string, item?: string, lore?: string[], pack: string }} Stock
 * @type {Stock[]}
 */
export const STOCK = [
  { id: "t_hatch", kind: "title", label: "Title: Hatchling Keeper", cost: 6, fid: "hatchling_tide", value: "Hatchling Keeper", pack: "titles_bp" },
  { id: "h_hatch", kind: "hat", label: "Hatchling Cap", cost: 4, fid: "hatchling_tide", value: "Hatchling Cap", item: "minecraft:leather_helmet", lore: ["Sea-green, more or less.", "Worn on the beach at Hatchling Tide."], pack: "" },
  { id: "r_hatch", kind: "recipe", label: "Recipe card: Sweet Berry Roll", cost: 5, fid: "hatchling_tide", value: "sweet_berry_roll", pack: "cooking_bp" },
  { id: "t_regatta", kind: "title", label: "Title: Old Salt", cost: 6, fid: "midsummer_regatta", value: "Old Salt", pack: "titles_bp" },
  { id: "h_regatta", kind: "hat", label: "Sailor's Cap", cost: 4, fid: "midsummer_regatta", value: "Sailor's Cap", item: "minecraft:leather_helmet", lore: ["Smells of salt and sunscreen.", "Midsummer Regatta."], pack: "" },
  { id: "r_regatta", kind: "recipe", label: "Recipe card: Glow Berry Tart", cost: 5, fid: "midsummer_regatta", value: "glow_berry_tart", pack: "cooking_bp" },
  { id: "t_fair", kind: "title", label: "Title: Lantern Bearer", cost: 6, fid: "lantern_fair", value: "Lantern Bearer", pack: "titles_bp" },
  { id: "h_fair", kind: "hat", label: "Pumpkin Hat", cost: 3, fid: "lantern_fair", value: "Pumpkin Hat", item: "minecraft:carved_pumpkin", lore: ["You can see out. Mostly.", "Lantern Fair."], pack: "" },
  { id: "r_fair", kind: "recipe", label: "Recipe card: Spiced Pumpkin Soup", cost: 5, fid: "lantern_fair", value: "spiced_pumpkin_soup", pack: "cooking_bp" },
  { id: "t_night", kind: "title", label: "Title: Keeper of the Long Night", cost: 6, fid: "long_night", value: "Keeper of the Long Night", pack: "titles_bp" },
  { id: "h_night", kind: "hat", label: "Star Crown", cost: 5, fid: "long_night", value: "Star Crown", item: "minecraft:golden_helmet", lore: ["Paper stars on a gold band.", "Starwright's Long Night."], pack: "" },
  { id: "r_night", kind: "recipe", label: "Recipe card: Hiccup Cookies", cost: 5, fid: "long_night", value: "hiccup_cookies", pack: "cooking_bp" },
  { id: "tr_confetti", kind: "trail", label: "Trail: Confetti", cost: 10, value: "confetti", pack: "titles_bp" },
  { id: "tr_notes", kind: "trail", label: "Trail: Festival Notes", cost: 10, value: "notes", pack: "titles_bp" },
];

/** Ghost tales (Lantern Fair), told by a campfire. */
export const TALES = [
  "§eMoss:§r They say a fisherman rowed out on Lantern night and never came back. His lantern did. Every year. Still lit. No oars.",
  "§eElsie:§r When I was a girl, love, we left a bowl of soup on the step for the Long Storm's dead. In the morning the bowls were always clean. Always.",
  "§eMoss:§r Grave twelve is empty. Nobody remembers who dug it. I keep it tidy anyway. Seems polite.",
  "§eTobin:§r Bell under the water rang once on a dead calm night. No current. No wind. Hal heard it too. That was the year the storm came.",
  "§eWren:§r Clover the horse won't go past the old chapel at night, she stops dead and snorts, and once she pulled me the WHOLE way home, I didn't even ask her to!",
  "§eHollis:§r Some nights the candles lean toward the door. All of them. As if someone just walked in. Nobody ever has. I always say good evening anyway.",
  "§eMoss:§r Pumpkins? Folk carved faces so the dead would know which houses were friendly. Or unfriendly. Depends on the face, really.",
  "§eSol:§r There is a star that rises only on the Lantern Fair. The Starwrights called it the Lamplighter. I've never found it. I keep looking.",
];

/** Siege lines. */
export const SIEGE_LINES = {
  warn: "§7[Siege] §cThe Gray Choir is coming to {town}. §7Singing rises from the dark, three ways at once. They're here in {min}.",
  rise: "§7[Siege] §cThree Ritual Circles rise around {town}! §7Beat each circle's Choir Singer, then strike its bell {hits} times. {minutes} minutes before the song is done.",
  wave: "§7[Siege] §cMore of the Choir answer the song!",
  bell: "§7[Siege] §aA circle is silenced ({n} of {all}).",
  held: "§6[Siege] {town} held! The Choir's song breaks apart and the singers flee into the dark.",
  failed: "§7[Siege] §cThe Choir's song is finished. {town} is shaken.",
  scattered: "§7[Siege] The Choir scattered before the song began.",
  noGround: "§7[Siege] The Choir found no open ground around {town} for its circles and scattered. Nothing was lost. §8(Circles need flat, open, natural ground outside safe zones and claims.)",
  hollis: "§eHollis:§r I heard them singing, all night, through the chapel walls. I knew the words. I don't know how I knew the words.",
  reyes: "§eReyes:§r Good work. Clean up, get some sleep, and stop grinning. That's an order. Mostly.",
};
