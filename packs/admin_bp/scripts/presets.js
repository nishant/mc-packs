// Hand-written extras for the Realm Configuration menu. The commands themselves come from catalog.js
// (generated: every registered realm: command); this file only makes them nicer to pick: which menu
// category a pack sits in, friendlier labels, ranges and defaults for parameters, which commands ask
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

/** Menu categories, in order. A pack not listed here lands in "Other". */
export const CATEGORIES = [
  { id: "world", title: "World & weather", packs: ["weather_bp", "climate_bp", "storm_bp", "tornado_bp", "rainbow_bp", "night_bp", "meteor_bp", "moon_bp", "rain_bp", "zones_bp", "guard_bp"] },
  { id: "story", title: "Story & townsfolk", packs: ["saga_bp", "npc_bp", "journal_bp", "quests_bp", "milestones_bp"] },
  { id: "towns", title: "Towns & places", packs: ["town_bp", "waystone_bp", "caravan_bp", "claims_bp", "farm_bp"] },
  { id: "economy", title: "Economy", packs: ["crowns_bp", "bounty_bp", "guilds_bp", "slots_bp"] },
  { id: "events", title: "Events & news", packs: ["fishing_bp", "goals_bp", "news_bp", "welcome_bp"] },
  { id: "players", title: "Players", packs: ["stats_bp", "titles_bp", "nick_bp", "party_bp", "skills_bp", "mail_bp", "afk_bp", "death_bp"] },
  { id: "dungeons", title: "Dungeons & loot", packs: ["expedition_bp", "elite_bp", "relics_bp", "maps_bp"] },
  { id: "fun", title: "Fun", packs: ["domt_bp", "silly_bp", "dolphin_bp", "cooking_bp", "chairs_bp"] },
  { id: "utilities", title: "Utilities", packs: ["help_bp", "settings_bp", "admin_bp", "stash_bp", "find_bp", "cleanup_bp", "hud_bp", "mobhp_bp", "elytra_bp", "durability_bp", "refill_bp", "phantom_bp", "translucent_bp", "harvest_bp", "leaves_bp"] },
];

/** @type {Record<string, Record<string, ParamPreset>>} by command, then parameter name */
export const PARAMS = {
  "realm:admin_item": { player: { label: "Give it to", everyone: true } },
  "realm:caravan_spot": { name: { label: "Spot name (empty: Spot 1, Spot 2...)" } },
  "realm:champions_spawn": { "realm:champion_trait": { label: "Trait (leave out: random)" } },
  "realm:crowns_give": { player: { label: "Give Crowns to", everyone: true }, amount: { label: "Crowns (negative takes them)", kind: "text", default: 100 } },
  "realm:crowns_pay": { player: { label: "Pay" }, amount: { label: "Crowns", kind: "slider", min: 1, max: 1000, step: 1, default: 10 } },
  "realm:domt_draw": { player: { label: "Draw a card for", everyone: true } },
  "realm:expedition_site": { x: { label: "X (default: where you stand)", kind: "posX" }, z: { label: "Z (default: where you stand)", kind: "posZ" } },
  "realm:farm_add": { name: { label: "Farm name", default: "farm" }, radius: { label: "Radius in chunks", kind: "slider", min: 1, max: 4, step: 1, default: 2 } },
  "realm:farm_remove": { name: { label: "Farm name" } },
  "realm:find": { item: { label: "Item to find (empty: the one in your hand)", kind: "item" } },
  "realm:goals_add": { item: { label: "Item id", kind: "item" }, amount: { label: "Amount to collect", kind: "slider", min: 1, max: 10000, step: 1, default: 640 }, name: { label: "Goal name" } },
  "realm:guard_add": { name: { label: "Zone name (letters, digits, _ and -)", default: "home" }, radius: { label: "Radius (blocks)", kind: "slider", min: 8, max: 256, step: 8, default: 64 } },
  "realm:guard_remove": { name: { label: "Zone name" } },
  "realm:help": { "realm:help_topic": { label: "Feature (leave out: the menu)" } },
  "realm:maps_give": { player: { label: "Give a treasure map to", everyone: true } },
  "realm:moon_set": { "realm:moon_state": { label: "Tonight's moon" } },
  "realm:news_add": { text: { label: "Text to add to your news draft" } },
  "realm:news_body": { text: { label: "News body (then the editor opens)" } },
  "realm:npc_add": { "realm:npc_id": { label: "Townsfolk to place where you stand" } },
  "realm:npc_home": { "realm:npc_id": { label: "Townsfolk whose night home is here" } },
  "realm:party_chat": { message: { label: "Message to your party" } },
  "realm:party_invite": { player: { label: "Invite", kind: "player" } },
  "realm:relics_give": { player: { label: "Give a relic to", everyone: true }, "realm:relic_id": { label: "Relic" } },
  "realm:saga_place": { "realm:saga_place_name": { label: "Story place to set here (leave out: list them)" } },
  "realm:saga_reset": { player: { label: "Reset the stories of" } },
  "realm:silly_give": { player: { label: "Give Silly Books to", everyone: true }, "realm:silly_book": { label: "Book" }, amount: { label: "How many", kind: "slider", min: 1, max: 64, step: 1, default: 1 } },
  "realm:slots_give": { player: { label: "Give the Slot Machine to (leave out: you)", everyone: true } },
  "realm:stats_sidebar": { "realm:sidebar_stat": { label: "Sidebar shows" } },
  "realm:storm_cell": { force: { label: "Even without a thunderstorm", default: false } },
  "realm:titles_give": { player: { label: "Give a title to", kind: "player" }, title: { label: "Title (or trail:cloud, trail:leaves, trail:ember, trail:sparkle)" } },
  "realm:town_add": { name: { label: "Town name (centered where you stand)" } },
  "realm:town_spot": { "realm:town_project": { label: "Project to place here" } },
  "realm:weather_set": { "realm:weather_kind": { label: "Weather" }, minutes: { label: "For how many real minutes", kind: "slider", min: 1, max: 120, step: 1, default: 10 } },
};

/** Commands that ask "Are you sure?" first, besides every *_remove and *_reset. */
export const CONFIRM = new Set(["realm:meteor_now", "realm:tornado_spawn", "realm:caravan_call", "realm:crowns_give", "realm:domt_draw"]);

/** @param {string} name */
export const needsConfirm = (name) => CONFIRM.has(name) || /_(remove|reset)$|_remove_|_reset_/.test(name);

/**
 * Server setup checklist: the one-time jobs across packs. Each shows only when its command is
 * installed. `done`: how the menu can tell it's done ("zones" / "towns": a safe zone list says so).
 * @type {{ title: string, help: string, cmd: string, done?: "zones" | "towns" }[]}
 */
export const SETUP = [
  { title: "Place the townsfolk", help: "Stand where each one should live and pick them. /realm:npc_list shows who is placed.", cmd: "realm:npc_add" },
  { title: "Story places", help: "Set, build or relocate the places the stories use. Places nobody set are picked and built on their own when a story needs them.", cmd: "realm:saga_places" },
  { title: "Add a town", help: "Stand at the center of the town and give it a name.", cmd: "realm:town_add", done: "towns" },
  { title: "Town project spots", help: "Stand where a project (well, lamps, dock...) should be built, facing the way it should face.", cmd: "realm:town_spot" },
  { title: "Bounty board", help: "Look at a lectern within 6 blocks first.", cmd: "realm:bounty_board" },
  { title: "Caravan arrival spots", help: "Stand where the merchant caravan should arrive.", cmd: "realm:caravan_spot" },
  { title: "Expedition site", help: "Where the dungeons are built, deep underground. Away from spawn.", cmd: "realm:expedition_site" },
  { title: "Waystones and inns", help: "Players make waystones; here you can see and remove them.", cmd: "realm:waystones" },
  { title: "Safe zones", help: "Bases where meteors, tornadoes and storms break no blocks.", cmd: "realm:zones", done: "zones" },
  { title: "Creeper Guard zones", help: "Only needed in zones mode.", cmd: "realm:guard" },
  { title: "Farms kept loaded", help: "Stand in the farm and give it a name.", cmd: "realm:farm_add" },
  { title: "Community goal", help: "Look at the chest it fills first.", cmd: "realm:goals_add" },
  { title: "Welcome message", help: "What players see when they join.", cmd: "realm:welcome_edit" },
  { title: "Realm news", help: "The news that pops up once.", cmd: "realm:news_edit" },
  { title: "Realm settings", help: "Every pack's settings, for everyone.", cmd: "realm:config" },
];
