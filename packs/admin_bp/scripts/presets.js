// Hand-written extras for the Realm Configuration menu. The commands themselves come from catalog.js
// (generated: every registered realm: command); this file only makes them nicer to pick: which menu
// group and section a pack sits in, friendlier labels, ranges and defaults for parameters, which commands ask
// before they run, and the server setup checklist. A command or pack missing here still shows up
// (under "Other", with plain inputs), so new commands never need this file to appear.

/**
 * @typedef {object} ParamPreset
 * @property {string} [label] what the input says
 * @property {"text" | "slider" | "toggle" | "player" | "item" | "posX" | "posY" | "posZ"} [kind] how it's asked (default: from its type)
 * @property {number} [min] slider
 * @property {number} [max] slider
 * @property {number} [step] slider
 * @property {number | string | boolean} [default]
 * @property {string} [placeholder] text
 * @property {string} [help] tooltip
 * @property {boolean} [everyone] player inputs: offer "Everyone online" (@a)
 * @property {Record<string, string>} [names] enum: how each value reads
 */

/**
 * The menu's groups, in the order the main menu shows them (after My Preferences, Realm Settings,
 * Recent and Search). Each group is one scrolling page with a heading per section; a section lists
 * the commands of its packs, the pack's own menu first, then the others, operator ones (red) last.
 * A pack not listed here lands in "Other". Realm Configuration's own commands are on Operator Tools.
 * `title` and `hint` are the group button's two lines (each must fit in LINE).
 * @type {{ id: string, title: string, hint: string, sections: { title: string, packs: string[] }[] }[]}
 */
export const GROUPS = [
  {
    id: "me",
    title: "My Screen & Toggles",
    hint: "HUD, map, warnings, name, help",
    sections: [
      { title: "Help and preferences", packs: ["help_bp", "settings_bp", "afk_bp", "chairs_bp"] },
      { title: "On your screen", packs: ["hud_bp", "map_bp", "mobhp_bp", "elytra_bp"] },
      { title: "Your own switches", packs: ["durability_bp", "refill_bp", "phantom_bp", "rain_bp", "climate_bp"] },
      { title: "Your name and look", packs: ["nick_bp", "titles_bp"] },
    ],
  },
  {
    id: "items",
    title: "Items & Building",
    hint: "Sort, find chests, build tools",
    sections: [
      { title: "Inventory and chests", packs: ["stash_bp", "find_bp", "death_bp", "cleanup_bp"] },
      { title: "Easy Building", packs: ["build_bp"] },
      { title: "Enchants", packs: ["silly_bp"] },
    ],
  },
  {
    id: "adventure",
    title: "Story & Adventure",
    hint: "Quests, dungeons, relics, maps",
    sections: [
      { title: "Story and quests", packs: ["saga_bp", "quests_bp", "milestones_bp", "journal_bp", "atlas_bp", "calendar_bp"] },
      { title: "Dungeons and loot", packs: ["expedition_bp", "elite_bp", "relics_bp", "maps_bp"] },
    ],
  },
  {
    id: "people",
    title: "Friends, Crowns & Fun",
    hint: "Party, mail, money, games, pets",
    sections: [
      { title: "Friends", packs: ["party_bp", "mail_bp", "guilds_bp"] },
      { title: "Crowns and games", packs: ["crowns_bp", "bounty_bp", "slots_bp", "domt_bp"] },
      { title: "Stats and skills", packs: ["stats_bp", "skills_bp"] },
      { title: "Animals and food", packs: ["dolphin_bp", "platypus_bp", "cooking_bp"] },
    ],
  },
  {
    id: "world",
    title: "World & Events",
    hint: "Weather, sky, news, contests",
    sections: [
      { title: "Weather and sky", packs: ["weather_bp", "storm_bp", "tornado_bp", "rainbow_bp", "night_bp", "meteor_bp", "moon_bp"] },
      { title: "Events and news", packs: ["fishing_bp", "goals_bp", "news_bp", "welcome_bp"] },
    ],
  },
  {
    id: "towns",
    title: "Towns & Townsfolk",
    hint: "Towns, claims, zones, travelers",
    sections: [
      { title: "Townsfolk and travelers", packs: ["npc_bp", "wander_bp", "caravan_bp", "waystone_bp"] },
      { title: "Towns and land", packs: ["town_bp", "claims_bp", "zones_bp", "guard_bp", "farm_bp"] },
    ],
  },
];

/**
 * How wide a menu button's line can be, in Minecraft font pixels. Bedrock cuts a longer line short
 * with "..." (measured on a phone: "Find which container holds an item" fits, "Every pack's settings
 * (/realm:config)" doesn't), so every name and hint below must fit; admin-catalog --check measures them.
 */
export const LINE = 168;
/** @type {Record<string, number>} glyph advances of the default font that aren't 6 pixels */
const GLYPH = { " ": 4, i: 2, l: 3, I: 4, t: 4, f: 5, k: 5, "!": 2, ".": 2, ",": 2, ":": 2, ";": 2, "'": 2, "`": 3, '"': 4, "(": 5, ")": 5, "[": 4, "]": 4, "<": 5, ">": 5, "*": 5, "|": 2, "@": 7, "~": 7 };
/** The width of a line of text in font pixels, without its § codes. @param {string} s */
export const textWidth = (s) => [...s.replace(/§./g, "")].reduce((n, c) => n + (GLYPH[c] ?? 6), 0);
/** The color of everything only operators can use on a (light gray) button: commands, quick actions, the setup checklist; the rest is the button's default dark text. Dark red: gold was unreadable on the gray. */
export const OP_COLOR = "§4";
/** The same red for text on the dark page (the legend, a command's options form): dark red is too dim there. */
export const OP_TEXT = "§c";

/**
 * Every command's button: a name for what it does, then a short hint (both must fit in LINE). The
 * command itself and its full description show when it's opened. Every command in catalog.js needs
 * one (admin-catalog --check fails otherwise); without it a button falls back to the command's name.
 * @type {Record<string, [string, string]>}
 */
export const NAMES = {
  "realm:admin_item": ["Get the Menu Item", "Yours again, or for others"],
  "realm:admin_setup": ["Set Up This World", "Guided one-time setup"],
  "realm:admin_title": ["Show a Title", "Big text the HUD won't cover"],
  "realm:diag": ["Pack diagnostics", "Script time, saved data"],
  "realm:afk": ["Go AFK", "Move to come back"],
  "realm:bounty": ["Bounty Board Menu", "Today's bounties and boards"],
  "realm:bounty_board": ["Make Bounty Board", "From the lectern you look at"],
  "realm:bounty_board_remove": ["Remove Bounty Board", "Back to a plain lectern"],
  "realm:bounty_list": ["Today's Bounties", "Targets and where they were"],
  "realm:build": ["Easy Building", "Effortless Building mode menu"],
  "realm:build_book": ["Get Building Book", "Give the Building Book"],
  "realm:build_clipboard": ["Clipboard Manager", "Saved copies, copy and paste"],
  "realm:build_guide": ["Live Coach Guide", "Start or stop live walkthrough"],
  "realm:build_language": ["Book Language", "13 languages for menus & book"],
  "realm:build_modifiers": ["Build Modifiers", "Mirror, array, radial symmetry"],
  "realm:build_palette": ["Block Palette", "Mix blocks in patterns"],
  "realm:build_preview": ["Preview Settings", "Outlines, quality, flick mode"],
  "realm:build_redo": ["Redo Build", "Place what you undid again"],
  "realm:build_settings": ["Building Settings", "Speed, reach, UI and admin"],
  "realm:build_setup": ["Performance Setup", "Pick a preset for your device"],
  "realm:build_tutorial": ["Get Tutorial Book", "48-page illustrated guide book"],
  "realm:build_undo": ["Undo Build", "Restore your last placement"],
  "realm:caravan": ["Caravan Menu", "Info, arrival spots, call it"],
  "realm:caravan_call": ["Call Caravan Now", "It comes right away"],
  "realm:caravan_info": ["Next Caravan", "When it comes, where it is"],
  "realm:caravan_spot": ["Add Caravan Spot", "An arrival spot right here"],
  "realm:caravan_spot_remove": ["Remove Caravan Spot", "The nearest arrival spot"],
  "realm:champions": ["Champions Menu", "Nearby, traits, spawning"],
  "realm:champions_near": ["Champions Nearby", "Within 64 blocks, in chat"],
  "realm:champions_spawn": ["Spawn Champion", "Pick a trait, or random"],
  "realm:claim": ["Land Claims", "Claim, share, see borders"],
  "realm:cleanup": ["Lag Cleanup", "Count or clear dropped items"],
  "realm:climate": ["Weather Visuals", "Sandstorm, blizzard, fog"],
  "realm:config": ["Realm Settings", "Every pack, for everyone"],
  "realm:cooking": ["Kitchen", "Recipes and the cookbook"],
  "realm:crowns": ["Crowns Menu", "Balance, pay, market"],
  "realm:crowns_audit": ["Crowns Audit", "Recent pays and gives"],
  "realm:crowns_balance": ["Crowns Balance", "Yours and the richest"],
  "realm:crowns_give": ["Give Crowns", "Negative amounts take them"],
  "realm:crowns_market": ["Crowns Market", "Open the market"],
  "realm:crowns_pay": ["Pay Crowns", "From your balance"],
  "realm:death": ["Death Point", "Where you died, go back"],
  "realm:death_back": ["Back to Death Point", "Once per death, if enabled"],
  "realm:death_info": ["Last Death Location", "Where, how far, which way"],
  "realm:dolphin": ["Dolphin Friends", "Call, name or release"],
  "realm:dolphin_call": ["Call Dolphin", "Your nearest tamed dolphin"],
  "realm:domt": ["Deck of Many Things", "Draw a card, see the odds"],
  "realm:domt_draw": ["Draw a Card for Players", "No cooldown"],
  "realm:domt_effects": ["Deck Card Settings", "Enable or disable cards"],
  "realm:durability": ["Low Durability Warning", "On or off, for you"],
  "realm:elytra": ["Elytra HUD", "Speed, height, rockets"],
  "realm:elytra_nos": ["Get NOS Rockets", "Nitrous elytra boost rockets"],
  "realm:disc": ["Run Away Music Disc", "Get the custom red music disc"],
  "realm:expedition": ["Expeditions", "Start a dungeon run"],
  "realm:expedition_gauntlet": ["Start a Gauntlet", "A long run, pick boons"],
  "realm:expedition_leave": ["Leave Expedition", "Back to where you started"],
  "realm:expedition_reset": ["Reset Expeditions", "End every run, reset dungeon"],
  "realm:expedition_site": ["Set Dungeon Site", "Here, or at x z"],
  "realm:farm": ["Farm Loader", "The farms kept loaded"],
  "realm:farm_add": ["Add Loaded Farm", "Keep the chunks here loaded"],
  "realm:farm_remove": ["Remove Loaded Farm", "Stop keeping it loaded"],
  "realm:find": ["Find Container", "Which chest holds an item"],
  "realm:fishing": ["Fishing Menu", "Fish log, records, settings"],
  "realm:fishing_log": ["Fish Log", "Species and personal bests"],
  "realm:fishing_stack": ["Stack Fish", "Measured fish to plain fish"],
  "realm:fishing_top": ["Fishing Records", "Biggest fish of each kind"],
  "realm:fishing_tournament": ["Fishing Tournament", "Start one right now"],
  "realm:goals": ["Community Goals", "See goals, donate items"],
  "realm:goals_add": ["Add Community Goal", "Fills the chest you look at"],
  "realm:guard": ["Creeper Guard", "Status and zones"],
  "realm:guard_add": ["Add Creeper Zone", "No creeper blasts around you"],
  "realm:guard_remove": ["Remove Creeper Zone", "A Creeper Guard zone"],
  "realm:guard_status": ["Creeper Guard Status", "Mode, blasts and zones"],
  "realm:guilds": ["Guilds", "Rank, reputation, shops"],
  "realm:help": ["Realm Help", "Every feature and command"],
  "realm:hud": ["Coordinates HUD", "Position, facing and time"],
  "realm:map": ["Minimap Menu", "Field map, destinations, spots"],
  "realm:minimap": ["Toggle Minimap", "Show or hide the 7x7 radar"],
  "realm:compass": ["Toggle Compass", "Show or hide the compass strip"],
  "realm:map_clear": ["Clear Destination", "The strip follows the story"],
  "realm:map_reset": ["Reset Saved Map Destinations", "Clear marks and routes"],
  "realm:map_mark": ["Mark This Spot", "Pick it as a destination later"],
  "realm:journal": ["Field Journal", "Everything you've found"],
  "realm:mail": ["Realm Mail", "Your inbox, write letters"],
  "realm:maps": ["Treasure Maps", "Your hunts, give maps"],
  "realm:maps_give": ["Give Treasure Map", "A free map for a player"],
  "realm:maps_hunts": ["Treasure Hunts", "Clue, map copy, give up"],
  "realm:meteor": ["Meteor Menu", "The last meteors, drop one"],
  "realm:meteor_info": ["Last Meteor", "Where it fell, crater found"],
  "realm:meteor_now": ["Drop a Meteor", "In front of you, warned"],
  "realm:milestones": ["Milestones", "Realm achievements"],
  "realm:mobhp": ["Mob Health", "Health of mobs you hit"],
  "realm:moon": ["Moon Menu", "Tonight's moon, set it"],
  "realm:moon_info": ["Tonight's Moon", "Phase and next full moon"],
  "realm:moon_set": ["Set Tonight's Moon", "Blood, harvest or normal"],
  "realm:news": ["Realm News", "Read it, or edit it"],
  "realm:news_add": ["Add to News Draft", "Text pasted in quotes"],
  "realm:news_body": ["Start News Body", "From text pasted in quotes"],
  "realm:news_edit": ["Edit News", "The news players see once"],
  "realm:news_read": ["Read News", "The latest Realm news"],
  "realm:news_tips": ["Chat Tips", "Add, edit or delete tips"],
  "realm:nick": ["Nickname", "Name and color over your head"],
  "realm:night": ["Night Sky Show", "Aurora and shooting stars"],
  "realm:npc": ["Townsfolk Menu", "Who lives here, place them"],
  "realm:npc_add": ["Place Townsfolk", "Lives here, facing your way"],
  "realm:npc_list": ["List Townsfolk", "Where each one lives"],
  "realm:npc_remove": ["Remove Townsfolk", "The nearest, within 5 blocks"],
  "realm:npc_houses": ["Townsfolk to Houses", "One house each, around you"],
  "realm:npc_undo": ["Undo Townsfolk Move", "Back where they were"],
  "realm:npc_who": ["Who Lives Here", "Townsfolk and where they are"],
  "realm:party": ["Party Menu", "Members, invite, chat"],
  "realm:party_accept": ["Accept Party Invite", "Join the party"],
  "realm:party_chat": ["Party Chat", "Message your party only"],
  "realm:party_invite": ["Invite to Party", "Starts one if you have none"],
  "realm:party_leave": ["Leave Party", "Quit the party you're in"],
  "realm:phantoms": ["Phantom Opt-out", "Phantoms on or off for you"],
  "realm:platypus": ["Find Platypus", "How many, the nearest one"],
  "realm:prefs": ["My Preferences", "Your own pack settings"],
  "realm:quests": ["Daily Quests", "Today's quests, progress"],
  "realm:rain": ["Rain Extras", "Fog, mist, drips, sounds"],
  "realm:rainbow": ["Rainbow Finder", "Which way the pot of gold is"],
  "realm:rainbow_now": ["Make a Rainbow", "Pot of gold 150-300 away"],
  "realm:refill": ["Hotbar Refill", "On or off, for you"],
  "realm:relics": ["Relics Menu", "Your relics, the forge"],
  "realm:relics_give": ["Give Relic", "To a player"],
  "realm:relics_list": ["My Relics", "Found, and what they do"],
  "realm:relics_smith": ["Place Relicsmith", "Where you stand"],
  "realm:saga": ["Story Log", "Quests, hints, codex, favors"],
  "realm:saga_log": ["Current Quests", "What to do next"],
  "realm:saga_place": ["Set Story Place", "Here, or list them"],
  "realm:saga_places": ["Story Places", "Set, build, move, remove"],
  "realm:saga_step": ["Finish Player Step", "A stuck player's current step"],
  "realm:saga_reset": ["Reset Player Story", "Stories, choices, progress"],
  "realm:wander": ["Wanderers Menu", "Who's on the road, camps"],
  "realm:atlas": ["Atlas of the Realm", "Regions, sites, tablets"],
  "realm:calendar": ["Realm Calendar", "Day, festival, ribbons, sieges"],
  "realm:calendar_siege": ["Choir Siege", "Start one now, or end it"],
  "realm:calendar_set": ["Set Realm Day", "Day of the year, 1-96"],
  "realm:wander_clear": ["Send Wanderers Away", "Everyone on the road leaves"],
  "realm:silly": ["Silly Enchants", "On the item in your hand"],
  "realm:silly_give": ["Give Silly Books", "To players"],
  "realm:sit": ["Sit Down", "Sneak to stand up"],
  "realm:skills": ["Skills", "Levels, XP and perks"],
  "realm:skills_calling": ["Calling", "Sigil, talents, switching"],
  "realm:slots": ["Slot Machine", "Spin, stats, pay table"],
  "realm:slots_give": ["Give Slot Machine", "The machine item"],
  "realm:slots_spin": ["Spin Slots", "Open the machine and spin"],
  "realm:sort": ["Sort Inventory", "Merge stacks, order items"],
  "realm:stash": ["Quick Stack", "To storage within 8 blocks"],
  "realm:stash_help": ["Quick Stack Help", "How stack and sort work"],
  "realm:inv": ["Inventory Pages", "Switch pages, scan for items"],
  "realm:inv_pages": ["My Page Count", "Your own inventory pages"],
  "realm:inv_recover": ["Recover a Saved Inventory", "Saved backup to chests"],
  "realm:stats": ["Stats", "Your stats, leaderboards"],
  "realm:stats_sidebar": ["Stats Sidebar", "A stat on everyone's sidebar"],
  "realm:stats_ticker": ["Stats Ticker", "Your stats above the hotbar"],
  "realm:storm": ["Storm Menu", "Read it, start or end one"],
  "realm:storm_cell": ["Start Storm Cell", "Near you, right now"],
  "realm:storm_read": ["Read the Storm", "Distance, way, strength"],
  "realm:titles": ["Titles & Trails", "Your title and trail"],
  "realm:titles_give": ["Give Title", "A title or trail to a player"],
  "realm:titles_take": ["Take Away a Title", "Remove a title or trail"],
  "realm:tornado": ["Tornado Menu", "Where it is, spawn or end"],
  "realm:tornado_info": ["Where's the Tornado", "Position and heading"],
  "realm:tornado_spawn": ["Spawn Tornado", "40 blocks ahead, any weather"],
  "realm:town": ["Town Menu", "Info, projects, other towns"],
  "realm:town_add": ["Add Town", "Centered where you stand"],
  "realm:town_remove": ["Remove Town", "The one you're in"],
  "realm:town_spot": ["Set Project Spot", "Where a project is built"],
  "realm:town_stats": ["Town Stats", "Level, projects, helpers"],
  "realm:waystones": ["Waystones Menu", "Yours, or remove one"],
  "realm:waystones_list": ["My Waystones", "Tap one to travel"],
  "realm:waystones_remove": ["Remove Waystone", "The one you look at"],
  "realm:weather": ["Weather Almanac", "Forecast, set the weather"],
  "realm:weather_forecast": ["Weather Forecast", "The next few hours"],
  "realm:weather_set": ["Set Weather", "Clear, rain or thunder now"],
  "realm:welcome": ["Welcome Message", "See it, or edit it"],
  "realm:welcome_edit": ["Edit Welcome Message", "What players see on join"],
  "realm:welcome_reset": ["Reset Welcome Message", "Back to the defaults"],
  "realm:welcome_show": ["Show Welcome Message", "To yourself"],
  "realm:zones": ["Safe Zones", "No blocks broken by events"],
};

/** The townsfolk by name (the Townsfolk pack's config.js); an id missing here shows as the id. */
const TOWNSFOLK = {
  mara: "Mara the Cartographer",
  tobin: "Old Tobin the Fisherman",
  reyes: "Warden Reyes",
  elsie: "Elsie the Innkeeper",
  bram: "Mayor Bram",
  quill: "Quill the Trader",
  ida: "Ida the Relicsmith",
  sol: "Sol the Sky-reader",
  hollis: "Brother Hollis the Chapel Keeper",
  moss: "Moss the Gravedigger",
  wren: "Wren the Stable Girl",
  bea: "Bea the Cook",
};

/** @type {Record<string, Record<string, ParamPreset>>} by command, then parameter name */
export const PARAMS = {
  "realm:admin_item": { player: { label: "Give it to", everyone: true } },
  "realm:admin_title": {
    title: { label: "Title" },
    subtitle: { label: "Subtitle (optional)" },
    seconds: { label: "Seconds on screen", kind: "slider", min: 1, max: 25, step: 1, default: 5 },
    player: { label: "Show it to", everyone: true },
  },
  "realm:diag": { seconds: { label: "Seconds to measure", kind: "slider", min: 1, max: 60, step: 1, default: 10 } },
  "realm:caravan_spot": { name: { label: "Spot name (empty: Spot 1, Spot 2...)" } },
  "realm:champions_spawn": { "realm:champion_trait": { label: "Trait (leave out: random)" } },
  "realm:crowns_give": { player: { label: "Give Crowns to", everyone: true }, amount: { label: "Crowns (negative takes them)", kind: "text", default: 100 } },
  "realm:crowns_pay": { player: { label: "Pay" }, amount: { label: "Crowns (type the command for more than 1000)", kind: "slider", min: 1, max: 1000, step: 1, default: 10 } },
  "realm:domt_draw": { player: { label: "Draw a card for", everyone: true } },
  "realm:elytra_nos": { count: { label: "How many NOS Rockets", kind: "slider", min: 1, max: 64, step: 1, default: 16 } },
  "realm:expedition_site": { x: { label: "X (default: where you stand)", kind: "posX" }, z: { label: "Z (default: where you stand)", kind: "posZ" } },
  "realm:farm_add": { name: { label: "Farm name", default: "farm" }, radius: { label: "Radius in chunks", kind: "slider", min: 1, max: 4, step: 1, default: 2 } },
  "realm:farm_remove": { name: { label: "Farm name" } },
  "realm:map_mark": { name: { label: "Spot name (empty: Spot 1, Spot 2...)" } },
  "realm:inv_pages": { pages: { label: "My pages (0 = the realm's count)", kind: "slider", min: 0, max: 25, step: 1, default: 0 } },
  "realm:inv_recover": { player: { label: "Online player to recover", everyone: false } },
  "realm:map_reset": { confirm: { label: "Type confirm to reset, or leave empty to explain", default: "" } },
  "realm:find": { item: { label: "Item to find (empty: the one in your hand)", kind: "item" } },
  "realm:goals_add": { item: { label: "Item id", kind: "item" }, amount: { label: "Amount to collect (1 to 1,000,000)", kind: "text", default: 640 }, name: { label: "Goal name" } },
  "realm:guard_add": { name: { label: "Zone name (letters, digits, _ and -)", default: "home" }, radius: { label: "Radius (blocks)", kind: "slider", min: 8, max: 256, step: 8, default: 64 } },
  "realm:guard_remove": { name: { label: "Zone name" } },
  "realm:help": { "realm:help_topic": { label: "Feature (leave out: the menu)" } },
  "realm:maps_give": { player: { label: "Give a treasure map to", everyone: true } },
  "realm:moon_set": { "realm:moon_state": { label: "Tonight's moon", names: { blood: "Blood Moon", harvest: "Harvest Moon", normal: "An ordinary night" } } },
  "realm:news_add": { text: { label: "Text to add to your news draft" } },
  "realm:news_body": { text: { label: "News body (then the editor opens)" } },
  "realm:npc_add": { "realm:npc_id": { label: "Townsfolk to place where you stand", names: TOWNSFOLK } },
  "realm:npc_houses": { radius: { label: "Look for houses within (blocks of you)", kind: "slider", min: 16, max: 64, step: 4, default: 48 } },
  "realm:party_chat": { message: { label: "Message to your party" } },
  "realm:party_invite": { player: { label: "Invite", kind: "player" } },
  "realm:relics_give": { player: { label: "Give a relic to", everyone: true }, "realm:relic_id": { label: "Relic" } },
  "realm:saga_place": { "realm:saga_place_name": { label: "Story place to set here (leave out: list them)" } },
  "realm:saga_step": { player: { label: "Finish the current step of" }, "realm:saga_story": { label: "Story (leave out: their main story, or their only one)" } },
  "realm:saga_reset": { player: { label: "Reset the stories of" } },
  "realm:silly_give": { player: { label: "Give Silly Books to", everyone: true }, "realm:silly_book": { label: "Book" }, amount: { label: "How many", kind: "slider", min: 1, max: 64, step: 1, default: 1 } },
  "realm:slots_give": { player: { label: "Give the Slot Machine to (leave out: you)", everyone: true } },
  "realm:stats_sidebar": {
    "realm:sidebar_stat": {
      label: "Sidebar shows",
      names: { playtime: "Playtime", deaths: "Deaths", mobkills: "Mob kills", pvpkills: "Player kills", mined: "Blocks mined", placed: "Blocks placed", travelled: "Distance traveled", flown: "Elytra distance", joins: "Times joined", cycle: "Rotate through the stats", off: "Hidden" },
    },
  },
  "realm:storm_cell": { force: { label: "Even without a thunderstorm", default: false } },
  "realm:titles_give": { player: { label: "Give a title to", kind: "player" }, title: { label: "Title (or trail:cloud, trail:leaves, trail:ember, trail:sparkle)" } },
  "realm:titles_take": { player: { label: "Take a title from", kind: "player" }, title: { label: "Title (or trail:cloud, trail:leaves, trail:ember, trail:sparkle)" } },
  "realm:town_add": { name: { label: "Town name (centered where you stand)" } },
  "realm:calendar_set": { day: { label: "Day of the Realm Year (festivals: 10, 34, 58, 82)", kind: "slider", min: 1, max: 96, step: 1, default: 1 } },
  "realm:town_spot": { "realm:town_project": { label: "Project to place here" } },
  "realm:weather_set": { "realm:weather_kind": { label: "Weather" }, minutes: { label: "For how many real minutes (type the command for more than 120)", kind: "slider", min: 1, max: 120, step: 1, default: 10 } },
};

/**
 * Commands that ask "Are you sure?" first, besides every *_remove and *_reset and anything run for
 * everyone online (@a): the ones that break blocks, or change the weather, the night or an event for everyone.
 */
export const CONFIRM = new Set([
  "realm:meteor_now",
  "realm:tornado_spawn",
  "realm:caravan_call",
  "realm:crowns_give",
  "realm:domt_draw",
  "realm:weather_set",
  "realm:moon_set",
  "realm:storm_cell",
  "realm:fishing_tournament",
  "realm:wander_clear",
  "realm:calendar_set",
]);

/** @param {string} name */
export const needsConfirm = (name) => CONFIRM.has(name) || /_(remove|reset)$|_remove_|_reset_/.test(name);

/**
 * Server setup checklist, in the order Set up this world walks it: what a brand-new world needs first, then the
 * rest. Each shows only when its command is installed (`size`, Realm Configuration's own, always shows). `hint`: the
 * button's second line (must fit in LINE); `help`: what to do (the command's form shows it too); `why`: what it's
 * for. `cmd`: the command its Run button opens; `alt`: a second command for the same job. `done`: how the menu can
 * tell it's done ("zones" / "towns": a safe zone list says so; "npcs": Townsfolk's placed list; "spawnZone": a safe
 * zone covers world spawn; "spawnWaystone": a waystone the operator knows is near world spawn; "size": a server size
 * is chosen). Without `done`, a step counts as done once its command ran from the wizard, or the operator marked it.
 * @type {{ id: string, title: string, hint: string, help: string, why: string, cmd?: string, alt?: string,
 *   done?: "zones" | "towns" | "npcs" | "spawnZone" | "spawnWaystone" | "size" }[]}
 */
export const SETUP = [
  { id: "npcs", title: "Place the Townsfolk", hint: "Stand where each one lives", help: "Stand inside each one's house, facing the way they should face, and pick them. Or stand in the middle of your town and let them each take a house (after a preview).", why: "They give the stories, gifts, letters and shops. Until they're placed, nobody has anyone to talk to.", cmd: "realm:npc_add", alt: "realm:npc_houses", done: "npcs" },
  { id: "town", title: "Add a Town", hint: "Stand at its center", help: "Stand at the center of the town and give it a name.", why: "Town Projects, festivals, sieges and the Minimap's house marker need a town. A town is also a safe zone.", cmd: "realm:town_add", done: "towns" },
  { id: "spawnZone", title: "Safe Zone at Spawn", hint: "Events break nothing there", help: "Stand at world spawn and add a safe zone that covers it.", why: "Meteors, tornadoes, storms and Blood Moon creepers break no blocks inside a safe zone. New players arrive at spawn first.", cmd: "realm:zones", done: "spawnZone" },
  { id: "caravan", title: "Caravan Arrival Spot", hint: "Where the caravan arrives", help: "Stand where the merchant caravan should arrive, such as your market square.", why: "Without a spot the caravan picks one near the players online, which may be anywhere.", cmd: "realm:caravan_spot" },
  { id: "bounty", title: "Bounty Board", hint: "Look at a lectern first", help: "Place a lectern in town, look at it from within 6 blocks, then run this.", why: "Players take the daily bounties at the board, and the targets are picked around it.", cmd: "realm:bounty_board" },
  { id: "waystone", title: "First Waystone at Spawn", hint: "A lodestone and a sign", help: "At spawn, place a lodestone, put a sign next to it saying Waystone: Spawn, and tap the lodestone with an empty hand. The button lists the waystones.", why: "Players travel between waystones, and the first one at spawn gives everyone a way home.", cmd: "realm:waystones", done: "spawnWaystone" },
  { id: "expedition", title: "Expedition Site", hint: "Away from spawn", help: "Where the dungeons are built, deep underground. Stand somewhere away from spawn, or give x and z.", why: "Expeditions can't start until the site is set.", cmd: "realm:expedition_site" },
  { id: "size", title: "Server Size", hint: "Small Realm or Large server", help: "Pick how many players this world is for: the settings that depend on it change together, and you see each one before anything changes.", why: "Today's defaults are made for a Realm of about 10 players. A big server needs some caps and budgets changed.", done: "size" },
  { id: "relicsmith", title: "Relicsmith", hint: "Where Ida works", help: "Stand where the relicsmith should work (needs the Townsfolk pack).", why: "Players bring her Relic Shards to forge relics.", cmd: "realm:relics_smith" },
  { id: "places", title: "Story Places", hint: "Set, build or move them", help: "Set, build or relocate the places the stories use. Places nobody set are picked and built on their own when a story needs them.", why: "Optional: only if you want the stories' places somewhere of your choosing.", cmd: "realm:saga_places" },
  { id: "spots", title: "Town Project Spots", hint: "Well, lamps, dock...", help: "Stand where a project (well, lamps, dock...) should be built, facing the way it should face.", why: "Finished projects are built there instead of a spot picked for you.", cmd: "realm:town_spot" },
  { id: "guard", title: "Creeper Guard Zones", hint: "Only in zones mode", help: "Only needed in zones mode.", why: "In zones mode creepers break blocks everywhere except in these zones.", cmd: "realm:guard" },
  { id: "farms", title: "Farms Kept Loaded", hint: "Stand in the farm", help: "Stand in the farm and give it a name.", why: "A farm keeps running while nobody is near it.", cmd: "realm:farm_add" },
  { id: "goal", title: "Community Goal", hint: "Look at its chest first", help: "Look at the chest it fills first.", why: "Everyone fills one chest together for a shared reward.", cmd: "realm:goals_add" },
  { id: "welcome", title: "Welcome Message", hint: "What players see on join", help: "What players see when they join.", why: "The default speaks for a generic realm: say what your world is about.", cmd: "realm:welcome_edit" },
  { id: "news", title: "Realm News", hint: "The news that pops up once", help: "The news that pops up once.", why: "Tell players what's new on your world.", cmd: "realm:news_edit" },
  { id: "settings", title: "Realm Settings", hint: "Every pack, for everyone", help: "Every pack's settings, for everyone.", why: "Everything else: each pack's options, for the whole world.", cmd: "realm:config" },
];

/**
 * Server size (Set up this world, Operator Tools): two profiles. Small Realm is every option below at its config.js
 * default (today's settings, for up to about 10 players); Large server (30 to 100+ players) sets each to `large`.
 * Applying one goes through each pack's Realm Settings (realm:cfg_set), after a list of every change, old -> new.
 * Why each value: see "Server size" in docs/PACKS.md (Realm Configuration).
 * @type {{ pack: string, key: string, large: boolean | number | string, why: string }[]}
 */
export const SIZE_OPTIONS = [
  { pack: "map_bp", key: "budgetLevel", large: "low", why: "the heaviest pack: its budgets are for everyone together, about 2.0 ms a tick instead of 2.9" },
  { pack: "map_bp", key: "mobRadiusMax", large: 24, why: "each mob search covers less ground, so the budgeted searches come round sooner" },
  { pack: "stats_bp", key: "tickerEnabled", large: true, why: "the ticker is each player's own; a Large server still allows it" },
  { pack: "stats_bp", key: "tickerDefaultOn", large: true, why: "players who never chose start with it on; a saved choice still wins" },
  { pack: "elite_bp", key: "maxAlive", large: 80, why: "a ceiling for 0.8 champions per player; at most 3 near one place" },
  { pack: "moon_bp", key: "blood.maxExtraWorld", large: 160, why: "a loaded-world cap shared by every player's Blood Moon monsters" },
  { pack: "expedition_bp", key: "slots", large: 3, why: "3 dungeon ticking areas; extra parties wait in order" },
  { pack: "build_bp", key: "maxBlocksCap", large: 2000, why: "a public server keeps each build within 2,000 blocks" },
  { pack: "build_bp", key: "operatorsOnly", large: true, why: "only operators use building tools on a public server" },
  { pack: "build_bp", key: "allowInfiniteReach", large: false, why: "public-server builds do not reach faraway areas" },
  { pack: "cleanup_bp", key: "threshold", large: 1500, why: "more players drop more items: cleanups stay about as rare" },
  { pack: "find_bp", key: "liveScanRadius", large: 8, why: "each search reads 7 times fewer blocks (17 x 17 x 17 instead of 33 x 33 x 33)" },
  { pack: "admin_bp", key: "checkSeconds", large: 60, why: "the item check reads every inventory: half as often" },
  { pack: "mail_bp", key: "sendCooldownSeconds", large: 30, why: "less letter spam among many strangers" },
  { pack: "afk_bp", key: "sleep.percent", large: 50, why: "with 30 or more players, all of them asleep at once never happens" },
];

/** @type {{ id: "small" | "large", title: string, hint: string, help: string }[]} */
export const SIZES = [
  { id: "small", title: "Small Realm", hint: "Up to about 10 players", help: "Today's defaults: every setting below back to what its pack comes with." },
  { id: "large", title: "Large server", hint: "30 to 100+ players", help: "Lower script budgets and caps where cost grows with players, more room where many players share one thing." },
];
