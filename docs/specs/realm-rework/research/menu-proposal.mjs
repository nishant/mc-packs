// Prototype of the proposed packs/admin_bp/scripts/menu.js + tools/check-menu.mjs.
// Read-only: loads the generated admin catalog and presets, checks that every registered command is placed
// exactly once (on a screen, or in HIDDEN with a reason), measures every label, and prints the mapping tables.
//   node menu-proposal.mjs > menu-proposal.md
import { pathToFileURL } from "node:url";
const root = "/home/user/mc-packs";
const cat = await import(pathToFileURL(root + "/packs/admin_bp/scripts/catalog.js").href);
const presets = await import(pathToFileURL(root + "/packs/admin_bp/scripts/presets.js").href);
const RANK = { any: 0, op: 1, admin: 2, host: 3, owner: 4 };
const ALL = [
  ...cat.PACKS.flatMap((p) => p.commands.map((c) => ({ ...c, folder: p.folder, pack: p.pack }))),
  { name: "realm:admin", description: "the menu itself", permission: "any", params: [], folder: "admin_bp", pack: "Realm Configuration" },
];

/** c(command, label, hint, extra) */
const c = (cmd, label, hint, x = {}) => ({ cmd, label, hint, ...x });
const s = (screen) => ({ screen });
const b = (builtin, label, hint, x = {}) => ({ builtin, label, hint, ...x });

// ---------------------------------------------------------------------------
// The tree. `key` = the id a pack answers realm:menu_pong with (badge, hint, alert).
// `when` = shown only while the owning pack says so in its pong (otherwise left out).
// ---------------------------------------------------------------------------
export const HOME = {
  id: "home",
  title: "Realm Menu",
  sections: [
    {
      items: [
        b("alert", "(the most urgent alert)", "(from a pack's pong)", { when: "an alert exists" }),
        c("realm:saga_log", "Continue the Story", "Your quest and what's next", { key: "story" }),
        b("pins", "(up to 3 pinned entries)", "(the player's own)", { when: "pinned" }),
        s("travel"),
        s("today"),
        s("mine"),
        s("tools"),
        s("settings"),
        s("help"),
        s("ops"),
      ],
    },
  ],
};

export const SCREENS = {
  travel: {
    title: "Travel",
    hint: "Waystones, compass, death point",
    sections: [
      {
        items: [
          c("realm:waystones_list", "Waystones", "Travel to ones you found", { key: "waystones" }),
          c("realm:death", "Death Point", "Where you died, go back", { key: "death" }),
          c("realm:map", "Compass Destination", "Point the way to a place", { key: "map" }),
          c("realm:map_mark", "Mark This Spot", "Save it as a destination"),
          c("realm:map_clear", "Clear Destination", "Follow the story again", { key: "map.clear", when: "a destination is set" }),
          c("realm:atlas", "Atlas", "Regions and sites you found"),
          c("realm:dolphin_call", "Call My Dolphin", "Your nearest tamed dolphin", { key: "dolphin", when: "the player has a dolphin" }),
        ],
      },
    ],
  },
  today: {
    title: "Today",
    hint: "Quests, bounties, dungeons",
    sections: [
      {
        title: "Today",
        items: [
          c("realm:quests", "Daily Quests", "Today's quests and rewards", { key: "quests" }),
          c("realm:bounty_list", "Bounties", "Targets and where they are", { key: "bounty" }),
          c("realm:town", "Town Projects", "Help your town grow", { key: "town" }),
          c("realm:goals", "Community Goal", "See it and donate items", { key: "goals" }),
        ],
      },
      {
        title: "Adventures",
        items: [
          c("realm:saga", "Story Log", "All quests, codex, favors", { key: "story.log" }),
          c("realm:expedition", "Expeditions", "Start a dungeon run", { key: "expedition" }),
          c("realm:expedition_leave", "Leave Expedition", "Back to where you started", { key: "expedition.leave", when: "in an expedition" }),
          c("realm:maps_hunts", "Treasure Hunts", "Your clues and maps", { key: "maps" }),
        ],
      },
      { title: "More", items: [s("realm"), s("weather"), s("fun")] },
    ],
  },
  realm: {
    title: "Around the Realm",
    hint: "Calendar, caravan, news",
    sections: [
      {
        items: [
          c("realm:calendar", "Calendar", "Season, festival, sieges", { key: "calendar" }),
          c("realm:caravan_info", "Caravan", "When it comes, where it is", { key: "caravan" }),
          c("realm:npc_who", "Townsfolk", "Who lives where"),
          c("realm:wander", "Wanderers", "Who's on the road, camps"),
          c("realm:champions_near", "Champions Nearby", "Within 64 blocks"),
          c("realm:news_read", "Realm News", "What changed lately", { key: "news" }),
        ],
      },
    ],
  },
  weather: {
    title: "Weather & Sky",
    hint: "Forecast, storms, moon",
    sections: [
      {
        items: [
          c("realm:weather_forecast", "Forecast", "The next few hours", { key: "weather" }),
          c("realm:storm_read", "Read the Storm", "Distance, way, strength"),
          c("realm:tornado_info", "Tornado", "Where it is and its heading"),
          c("realm:moon_info", "Tonight's Moon", "Phase and next full moon"),
          c("realm:meteor_info", "Last Meteor", "Where it fell"),
          c("realm:rainbow", "Rainbow Finder", "Which way the pot of gold is"),
        ],
      },
    ],
  },
  fun: {
    title: "Games & Fishing",
    hint: "Slots, cards, fish records",
    sections: [
      {
        items: [
          c("realm:fishing", "Fishing", "Fish log, records, settings", { key: "fishing" }),
          c("realm:slots", "Slot Machine", "Spin, stats, pay table"),
          c("realm:domt", "Deck of Many Things", "Draw a card, see the odds", { key: "domt" }),
          c("realm:platypus", "Find Platypus", "How many, the nearest one"),
          c("realm:disc", "Run Away Music Disc", "Get the red music disc"),
        ],
      },
    ],
  },
  mine: {
    title: "My Stuff",
    hint: "Mail, party, Crowns, skills",
    sections: [
      {
        items: [
          c("realm:mail", "Mail", "Your inbox, write letters", { key: "mail" }),
          c("realm:party", "Party", "Members, invite, chat", { key: "party" }),
          c("realm:crowns", "Crowns", "Balance, pay, market", { key: "crowns" }),
          c("realm:skills", "Skills & Calling", "Levels, XP and perks", { key: "skills" }),
          c("realm:relics", "Relics", "Yours, and the forge", { key: "relics" }),
          c("realm:claim", "My Land", "Claim, share, see borders", { key: "claims" }),
          c("realm:dolphin", "Dolphins", "Call, name or release"),
          s("records"),
        ],
      },
    ],
  },
  records: {
    title: "Records",
    hint: "Stats, milestones, journal",
    sections: [
      {
        items: [
          c("realm:stats", "Stats & Leaderboards", "Yours and the realm's"),
          c("realm:milestones", "Milestones", "Realm achievements"),
          c("realm:journal", "Field Journal", "Everything you've found"),
          c("realm:guilds", "Guilds", "Rank, reputation, shops"),
        ],
      },
    ],
  },
  tools: {
    title: "Tools",
    hint: "Find items, sort, build, sit",
    sections: [
      {
        items: [
          c("realm:find", "Find an Item", "Which chest holds it"),
          c("realm:stash", "Quick Stack", "To storage within 8 blocks"),
          c("realm:sort", "Sort Inventory", "Merge stacks, order items"),
          c("realm:inv", "Inventory Pages", "Switch pages, scan for items"),
          c("realm:build", "Easy Building", "Modes, undo, palette, book", { key: "build" }),
          c("realm:cooking", "Kitchen", "Recipes and the cookbook"),
          c("realm:silly", "Silly Enchants", "On the item in your hand"),
          c("realm:sit", "Sit Down", "Sneak to stand up"),
          c("realm:afk", "Go AFK", "Move to come back"),
          s("land"),
        ],
      },
    ],
  },
  land: {
    title: "Zones & Farms",
    hint: "Safe zones, creepers, farms",
    sections: [
      {
        items: [
          c("realm:zones", "Safe Zones", "No blocks broken by events"),
          c("realm:guard_status", "Creeper Guard", "Mode, blasts and zones"),
          c("realm:farm", "Farm Loader", "The farms kept loaded"),
          c("realm:cleanup", "Dropped Items", "Count them per dimension"),
        ],
      },
    ],
  },
  settings: {
    title: "Settings",
    hint: "Screen, alerts, your name",
    sections: [
      {
        items: [
          b("presets", "Quick Setup", "3 choices set everything"),
          b("prefs:screen", "My Screen", "HUD, minimap, story tracker"),
          b("prefs:alerts", "Alerts & Chat", "Which notes you get"),
          b("prefs:play", "Gameplay", "Refill, phantoms, sneak-tap"),
          b("prefs:effects", "Weather & Sounds", "Rain, sky and storm effects"),
          s("look"),
          b("prefs:build", "Building", "Easy Building's own options", { when: "Easy Building is usable by the player" }),
          c("realm:prefs", "All My Preferences", "Every setting on one form"),
          c("realm:config", "Realm Settings", "Every pack, for everyone"),
        ],
      },
    ],
  },
  look: {
    title: "Name & Look",
    hint: "Nickname, title, trail",
    sections: [{ items: [c("realm:nick", "Nickname", "Name and color over your head"), c("realm:titles", "Titles & Trails", "Your title and trail")] }],
  },
  help: {
    title: "Help & Search",
    hint: "Guides, search, every command",
    sections: [
      {
        items: [
          b("search", "Search", "Find anything by a word"),
          b("recent", "Recent", "Run one of your last again"),
          b("topics", "How Things Work", "Short guides by topic"),
          b("az", "All Commands A-Z", "Everything, a page per letter"),
          c("realm:welcome_show", "Welcome Message", "Read it again"),
          c("realm:admin_item", "Get the Star Again", "If you lost the menu item"),
        ],
      },
    ],
  },
  ops: {
    title: "Operators",
    hint: "Setup, world, players",
    ops: true,
    sections: [
      {
        items: [
          c("realm:admin_setup", "Set Up This World", "Guided one-time setup"),
          b("size", "Server Size", "Small Realm or Large server"),
          c("realm:config", "Realm Settings", "Every pack, for everyone", { also: true }),
          s("ops.quick"),
          s("ops.events"),
          s("ops.players"),
          s("ops.places"),
          s("ops.texts"),
          s("ops.fix"),
        ],
      },
    ],
  },
  "ops.quick": {
    title: "Quick Actions",
    hint: "Time, weather, teleport, give",
    ops: true,
    sections: [{ items: [b("actions", "(the 12 quick actions of actions.js)", "(unchanged)", { n: 12 }), c("realm:admin_title", "Show a Title", "Big text the HUD won't cover", { nocount: true, note: "drawn once, as the Show a Title quick action (as today, main.js:654)" })] }],
  },
  "ops.events": {
    title: "World Events",
    hint: "Start weather, moons, sieges",
    ops: true,
    sections: [
      {
        title: "Weather and sky",
        items: [
          c("realm:weather_set", "Set Weather", "Clear, rain or thunder now"),
          c("realm:storm_cell", "Start Storm Cell", "Near you, right now"),
          c("realm:tornado_spawn", "Spawn Tornado", "40 blocks ahead"),
          c("realm:meteor_now", "Drop a Meteor", "In front of you, warned"),
          c("realm:rainbow_now", "Make a Rainbow", "Pot of gold 150-300 away"),
          c("realm:moon_set", "Set Tonight's Moon", "Blood, harvest or normal"),
        ],
      },
      {
        title: "Events",
        items: [
          c("realm:calendar_set", "Set Realm Day", "Day of the year, 1-96"),
          c("realm:calendar_siege", "Choir Siege", "Start one now, or end it"),
          c("realm:fishing_tournament", "Fishing Tournament", "Start one right now"),
          c("realm:caravan_call", "Call Caravan Now", "It comes right away"),
          c("realm:champions_spawn", "Spawn Champion", "Pick a trait, or random"),
          c("realm:wander_clear", "Send Wanderers Away", "Everyone on the road leaves"),
        ],
      },
    ],
  },
  "ops.players": {
    title: "Players",
    hint: "Give, take, fix a player",
    ops: true,
    sections: [
      {
        title: "Give",
        items: [
          c("realm:crowns_give", "Give Crowns", "Negative amounts take them"),
          c("realm:relics_give", "Give Relic", "To a player"),
          c("realm:titles_give", "Give Title", "A title or trail to a player"),
          c("realm:titles_take", "Take Away a Title", "Remove a title or trail"),
          c("realm:maps_give", "Give Treasure Map", "A free map for a player"),
          c("realm:silly_give", "Give Silly Books", "To players"),
          c("realm:slots_give", "Give Slot Machine", "The machine item"),
          c("realm:elytra_nos", "Get NOS Rockets", "Elytra boost rockets"),
          c("realm:domt_draw", "Draw a Card for Players", "No cooldown"),
        ],
      },
      {
        title: "Fix",
        items: [
          c("realm:saga_step", "Finish Player Step", "A stuck player's story step"),
          c("realm:saga_reset", "Reset Player Story", "Stories, choices, progress"),
          c("realm:inv_recover", "Recover an Inventory", "Saved backup to chests"),
          c("realm:inv_pages", "Inventory Page Count", "Pages for one player"),
          c("realm:crowns_audit", "Crowns Audit", "Recent pays and gives"),
        ],
      },
    ],
  },
  "ops.places": {
    title: "Places & Townsfolk",
    hint: "Towns, townsfolk, spots",
    ops: true,
    sections: [
      {
        title: "Townsfolk",
        items: [
          c("realm:npc_add", "Place Townsfolk", "Lives here, facing your way"),
          c("realm:npc_houses", "Townsfolk to Houses", "One house each, around you"),
          c("realm:npc_list", "List Townsfolk", "Where each one lives"),
          c("realm:npc_remove", "Remove Townsfolk", "The nearest, within 5 blocks"),
          c("realm:npc_undo", "Undo Townsfolk Move", "Back where they were"),
          c("realm:relics_smith", "Place Relicsmith", "Where you stand"),
        ],
      },
      {
        title: "Towns and story",
        items: [
          c("realm:town_add", "Add Town", "Centered where you stand"),
          c("realm:town_remove", "Remove Town", "The one you're in"),
          c("realm:town_spot", "Set Project Spot", "Where a project is built"),
          c("realm:saga_places", "Story Places", "Set, build, move, remove"),
          c("realm:saga_place", "Set Story Place", "Here, or list them"),
          c("realm:expedition_site", "Set Dungeon Site", "Here, or at x z"),
        ],
      },
      {
        title: "Spots and zones",
        items: [
          c("realm:caravan_spot", "Add Caravan Spot", "An arrival spot right here"),
          c("realm:caravan_spot_remove", "Remove Caravan Spot", "The nearest arrival spot"),
          c("realm:bounty_board", "Make Bounty Board", "From the lectern you look at"),
          c("realm:bounty_board_remove", "Remove Bounty Board", "Back to a plain lectern"),
          c("realm:waystones_remove", "Remove Waystone", "The one you look at"),
          c("realm:guard_add", "Add Creeper Zone", "No creeper blasts around you"),
          c("realm:guard_remove", "Remove Creeper Zone", "A Creeper Guard zone"),
          c("realm:farm_add", "Add Loaded Farm", "Keep the chunks here loaded"),
          c("realm:farm_remove", "Remove Loaded Farm", "Stop keeping it loaded"),
          c("realm:goals_add", "Add Community Goal", "Fills the chest you look at"),
        ],
      },
    ],
  },
  "ops.texts": {
    title: "News & Messages",
    hint: "Welcome, news, tips, sidebar",
    ops: true,
    sections: [
      {
        items: [
          c("realm:welcome_edit", "Edit Welcome Message", "What players see on join"),
          c("realm:welcome_reset", "Reset Welcome Message", "Back to the defaults"),
          c("realm:news_edit", "Edit News", "The news players see once"),
          c("realm:news_tips", "Chat Tips", "Add, edit or delete tips"),
          c("realm:stats_sidebar", "Stats Sidebar", "A stat on everyone's sidebar"),
          c("realm:domt_effects", "Deck Card Settings", "Enable or disable cards"),
        ],
      },
    ],
  },
  "ops.fix": {
    title: "Diagnostics & Resets",
    hint: "Script time, saved data",
    ops: true,
    sections: [
      {
        items: [
          c("realm:diag", "Pack Diagnostics", "Script time, saved data"),
          c("realm:expedition_reset", "Reset Expeditions", "End every run, reset dungeon"),
          c("realm:map_reset", "Reset Map Destinations", "Clear marks and routes"),
        ],
      },
    ],
  },
};

/** Commands kept (typed, Search, A-Z, pins, Recent) but on no screen, with why. */
export const HIDDEN = {
  // the same page as a placed command, for a player
  "realm:admin": "opens this menu (kept as an alias of the new /realm:menu)",
  "realm:help": "How Things Work opens it; /realm:help <topic> stays for typing",
  "realm:waystones": "for players it is the list (Waystones); operators: Remove Waystone is placed",
  "realm:bounty": "for players it only wraps Today's Bounties; operators' board buttons are placed",
  "realm:caravan": "for players it only wraps Next Caravan; operators' buttons are placed",
  "realm:maps": "for players it only wraps Treasure Hunts; Give Treasure Map is placed",
  "realm:npc": "for players it only wraps Who Lives Here; operators' buttons are placed",
  "realm:news": "for players it is Read News; operators' editors are placed",
  "realm:welcome": "for players it is Show Welcome Message; operators' editors are placed",
  "realm:weather": "for players it is the forecast; Set Weather is placed",
  "realm:storm": "wraps Read the Storm; Start Storm Cell is placed",
  "realm:tornado": "wraps Where's the Tornado; Spawn Tornado is placed",
  "realm:meteor": "wraps Last Meteor; Drop a Meteor is placed",
  "realm:moon": "wraps Tonight's Moon; Set Tonight's Moon is placed",
  "realm:guard": "wraps Creeper Guard Status; the zone commands are placed",
  "realm:champions": "wraps Champions Nearby and the trait list; Spawn Champion is placed",
  // one tap inside the pack's own menu
  "realm:death_back": "a button of Death Point (once per death)",
  "realm:death_info": "the first lines of Death Point",
  "realm:crowns_balance": "the first lines of Crowns",
  "realm:crowns_market": "a button of Crowns",
  "realm:crowns_pay": "a button of Crowns",
  "realm:party_accept": "a button of Party; shown as the alert button while an invite waits",
  "realm:party_chat": "a button of Party; faster typed",
  "realm:party_invite": "a button of Party",
  "realm:party_leave": "a button of Party",
  "realm:expedition_gauntlet": "a button of Expeditions",
  "realm:fishing_log": "a button of Fishing",
  "realm:fishing_stack": "a button of Fishing",
  "realm:fishing_top": "a button of Fishing",
  "realm:relics_list": "a button of Relics",
  "realm:skills_calling": "a button of Skills & Calling",
  "realm:slots_spin": "a button of Slot Machine",
  "realm:town_stats": "a button of Town Projects",
  "realm:stash_help": "How Things Work > Quick Stack & Sort shows the same text",
  "realm:build_book": "a button of Easy Building",
  "realm:build_clipboard": "a button of Easy Building",
  "realm:build_guide": "a button of Easy Building",
  "realm:build_language": "a button of Easy Building",
  "realm:build_modifiers": "a button of Easy Building",
  "realm:build_palette": "a button of Easy Building",
  "realm:build_preview": "a button of Easy Building; also Settings > Building",
  "realm:build_redo": "a button of Easy Building; worth a pin for builders",
  "realm:build_settings": "a button of Easy Building; also Settings > Building",
  "realm:build_setup": "a button of Easy Building",
  "realm:build_tutorial": "a button of Easy Building",
  "realm:build_undo": "a button of Easy Building; worth a pin for builders",
  // toggles that Settings pages and Quick Setup replace
  "realm:hud": "Settings > My Screen (Coordinates HUD)",
  "realm:minimap": "Settings > My Screen (Radar); the scan options stay typed",
  "realm:compass": "Settings > My Screen (Compass strip)",
  "realm:mobhp": "Settings > My Screen (Mob health)",
  "realm:elytra": "Settings > My Screen (Elytra HUD)",
  "realm:stats_ticker": "Settings > My Screen (Stats ticker)",
  "realm:durability": "Settings > Alerts & Chat (Low-durability warnings)",
  "realm:refill": "Settings > Gameplay (Refill my hotbar)",
  "realm:phantoms": "Settings > Gameplay (Phantoms near me)",
  "realm:rain": "Settings > Weather & Sounds (Rain extras)",
  "realm:climate": "Settings > Weather & Sounds (Sandstorm, blizzard, fog)",
  "realm:night": "Settings > Weather & Sounds (Night sky show)",
  // operators: text pasted from chat, only useful typed
  "realm:news_add": "takes text pasted in chat: typed only (Edit News links to it)",
  "realm:news_body": "takes text pasted in chat: typed only (Edit News links to it)",
};

// ---------------------------------------------------------------------------
// check-menu: every command exactly once; labels fit; screens reachable; ops screens hold only... etc.
// ---------------------------------------------------------------------------
const problems = [];
const placed = new Map(); // cmd -> [screen ids]
const reach = new Map(); // screen id -> depth (taps after using the item)
const parentOf = new Map();
function walk(id, screen, depth) {
  if (reach.has(id)) return problems.push(`screen ${id} is linked twice`);
  reach.set(id, depth);
  for (const sec of screen.sections)
    for (const it of sec.items) {
      if (it.screen) {
        if (!SCREENS[it.screen]) problems.push(`${id}: unknown screen ${it.screen}`);
        else {
          parentOf.set(it.screen, id);
          walk(it.screen, SCREENS[it.screen], depth + 1);
        }
      } else if (it.cmd) {
        if (!it.also) placed.set(it.cmd, [...(placed.get(it.cmd) ?? []), id]);
        const cmd = ALL.find((x) => x.name === it.cmd);
        if (!cmd) problems.push(`${id}: ${it.cmd} isn't a registered command`);
        else if (RANK[cmd.permission] > 0 && !screen.ops && it.cmd !== "realm:config") problems.push(`${id}: operator command ${it.cmd} on a player screen`);
      }
      if (it.label && !it.label.startsWith("(")) {
        if (presets.textWidth(it.label) > presets.LINE) problems.push(`${id}: label "${it.label}" is ${presets.textWidth(it.label)} px`);
        if (presets.textWidth(it.hint) > presets.LINE) problems.push(`${id}: hint "${it.hint}" is ${presets.textWidth(it.hint)} px`);
      }
    }
}
walk("home", HOME, 0);
for (const [id, sc] of Object.entries(SCREENS)) {
  if (!reach.has(id)) problems.push(`screen ${id} is not linked from anywhere`);
  if (presets.textWidth(sc.title) > presets.LINE || presets.textWidth(sc.hint) > presets.LINE) problems.push(`screen ${id}: title or hint too wide`);
}
for (const cmd of ALL) {
  const at = placed.get(cmd.name) ?? [];
  const hidden = HIDDEN[cmd.name];
  if (at.length > 1) problems.push(`${cmd.name} is placed on ${at.join(" and ")}`);
  if (at.length && hidden) problems.push(`${cmd.name} is placed and hidden`);
  if (!at.length && !hidden) problems.push(`${cmd.name} (${cmd.folder}) is not placed: add it to a screen or to HIDDEN with a reason`);
}
for (const name of Object.keys(HIDDEN)) if (!ALL.some((x) => x.name === name)) problems.push(`HIDDEN: ${name} isn't a registered command any more`);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const out = [];
const P = (x = "") => out.push(x);
const pathOf = (id) => {
  const names = [];
  for (let at = id; at && at !== "home"; at = parentOf.get(at)) names.unshift(SCREENS[at].title);
  return ["Realm Menu", ...names].join(" > ");
};
const count = (screen, ops) => {
  let n = 0, cond = 0;
  for (const sec of screen.sections)
    for (const it of sec.items) {
      if (it.screen && SCREENS[it.screen].ops && !ops) continue;
      if (it.cmd && RANK[ALL.find((x) => x.name === it.cmd)?.permission] > 0 && !ops) continue;
      if (it.nocount) continue;
      if (it.when) cond++;
      else n += it.n ?? 1;
    }
  return [n, cond];
};
P(`check-menu: ${problems.length ? problems.length + " problems\n- " + problems.join("\n- ") : "0 problems"}; ${ALL.length} commands: ${placed.size} placed, ${Object.keys(HIDDEN).length} hidden`);
P();
P("### Screens (buttons a player sees; +N = shown only while relevant; Back not counted)");
P();
P("| Screen | Path | Depth (taps after using the star) | Player buttons | Operator buttons |");
P("|---|---|---|---|---|");
for (const [id, sc] of [["home", HOME], ...Object.entries(SCREENS)]) {
  const [pn, pc] = count(sc, false), [on, oc] = count(sc, true);
  P(`| ${sc.title} | ${pathOf(id)} | ${reach.get(id)} | ${sc.ops ? "-" : `${pn}${pc ? ` +${pc}` : ""}`} | ${on}${oc ? ` +${oc}` : ""} |`);
}
P();
P("### Screen by screen (exact labels)");
for (const [id, sc] of [["home", HOME], ...Object.entries(SCREENS)]) {
  P();
  P(`**${sc.title}**${sc.ops ? " (operators only, red)" : ""} - ${pathOf(id)}${sc.hint ? `; button: \`${sc.title}\` / \`${sc.hint}\`` : ""}`);
  P();
  P("| # | Line 1 | Line 2 | Opens | Shown |");
  P("|---|---|---|---|---|");
  let i = 0;
  for (const sec of sc.sections) {
    if (sec.title) P(`| | **${sec.title}** (label) | | | |`);
    for (const it of sec.items) {
      const tgt = it.screen ? SCREENS[it.screen] : undefined;
      const l1 = tgt ? tgt.title : it.label, l2 = tgt ? tgt.hint : it.hint;
      const opens = tgt ? `screen ${tgt.title}` : it.cmd ? `\`/${it.cmd}\`` : `built in: ${it.builtin}`;
      const cmd = it.cmd ? ALL.find((x) => x.name === it.cmd) : undefined;
      const who = tgt?.ops || (cmd && RANK[cmd.permission] > 0) ? "operators" : "everyone";
      P(`| ${++i} | ${l1} | ${l2} | ${opens}${it.key ? ` (key \`${it.key}\`)` : ""}${it.note ? `; ${it.note}` : ""} | ${who}${it.when ? `, only while ${it.when}` : ""} |`);
    }
  }
}
P();
P("### Every command and where it lands");
P();
P("| Command | Who | Today: page > section (button number on that page, as that audience sees it) | New place | New label |");
P("|---|---|---|---|---|");
const posRows = JSON.parse((await import("node:fs")).readFileSync(new URL("./positions.json", import.meta.url), "utf8"));
const find = (name) => {
  for (const [id, sc] of [["home", HOME], ...Object.entries(SCREENS)]) for (const sec of sc.sections) for (const it of sec.items) if (it.cmd === name && !it.also) return { id, it };
};
for (const cmd of [...ALL].sort((a, b) => (RANK[a.permission] > 0) - (RANK[b.permission] > 0) || a.name.localeCompare(b.name))) {
  const old = posRows.find((r) => r.name === cmd.name && r.level === (RANK[cmd.permission] > 0 ? 4 : 0));
  const oldAt = old ? `${old.group} > ${old.section} (${old.pos})` : cmd.folder === "admin_bp" ? "Operator Tools / Search only" : "-";
  const f = find(cmd.name);
  P(`| \`/${cmd.name}\` | ${RANK[cmd.permission] > 0 ? "ops" : "all"} | ${oldAt} | ${f ? pathOf(f.id) : `hidden: ${HIDDEN[cmd.name]}`} | ${f ? f.it.label : "-"} |`);
}
console.log(out.join("\n"));
console.error(problems.length ? problems.join("\n") : "ok");
