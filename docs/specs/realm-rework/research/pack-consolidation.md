# Pack consolidation research: combine, connect or leave alone

Read-only research for the implementation spec, 2026-11-15. Repos read: `/home/user/mc-packs` (packs, tools, docs) and `/home/user/hosting/minecraft` (publish and realm page tools). Nothing was edited, built or committed.

Each claim is marked **[V]** (verified by reading the file cited) or **[S]** (suspected: inferred, not read line by line, or dependent on Bedrock behavior I could not test).

## 1. The short version

1. **The packs are already well connected. The navigation is not.** The packs send 121 distinct `realm:` script event ids (about 100 of them used by two or more packs), and most of the connections the owner listed already exist (story target on the Minimap, festival chapters, guild reputation and titles from the story, death point and waystones as destinations). What is missing is a shared grouping. `/realm:help` is one flat list of 66 features, `/realm:config` is one flat list of about 60 packs, `/realm:prefs` is one form with about 90 controls, and the docs, README and website are flat lists of 74.
2. **A grouping exists in exactly one place**: `GROUPS` in `packs/admin_bp/scripts/presets.js:29-90` (6 groups, 18 sections), used only by the Realm Configuration menu. Making one taxonomy the source for help, settings, the menu, the docs and the site is the cheapest, largest win.
3. **Merging packs on disk changes nothing a Realm player sees.** The Realm runs the Realm Bundle, where every pack is already one add-on with one saved-data store. Players see help pages, settings pages, commands and menus, and all of those can be regrouped without moving a file. On-disk merging is worth it in at most two places, both optional and late: the three menu packs (help, settings, admin) and Milestones into Stats.
4. **Recommended end state: 11 groups** a person can hold in their head, one carried menu item as the only thing to remember, a **Today** page that answers "what can I do right now", and presets that cut the notes and alerts.

## 2. Key numbers [V]

From `scratchpad/research/pack-table.mjs` (reads manifests, `settings.js`, `config.js`, `diag.js`, the generated `admin_bp/scripts/catalog.js` and `docs/PACKS.md`).

| | |
|---|---:|
| Pack folders | 74 (67 behavior, 7 resource) |
| Own script lines (not the synced copies or generated catalogs) | 133,729 |
| Synced copies of `tools/*-shared.js` in the packs | 91,206 lines |
| Commands | 181 in 64 packs |
| Commands a player can run | 119 (111 take no parameter) |
| Operator commands | 62 |
| Player commands that repeat a menu page in chat (`_info`, `_list`, `_read`...) | 22 |
| Player commands that only flip a switch that is also in `/realm:prefs` | 12 |
| Per-player preferences (static entries in `settings.js`) | 81, plus one per stat for the stats ticker (about 90 controls) |
| Realm-wide options changeable in game | 500 |
| `config.js` top-level keys | 757 |
| Forms built in code (`new ...FormData(`) | 317 |
| `runInterval` timers / game event subscriptions | 153 / 503 |
| `docs/PACKS.md` pack sections | 6,562 lines of 7,084 |
| BDS scenarios / unit test files | 328 / 186 |
| Synced shared modules that exist | 13 (`tools/*-shared.js`) |

Largest packs by own lines: `saga_bp` 24,526, `build_bp` 18,146, `expedition_bp` 8,161, `town_bp` 6,259, `map_bp` 6,030, `stash_bp` 4,629, `npc_bp` 4,275, `domt_bp` 3,957. Fifteen packs are under 400 own lines (`translucent_bp` 73, `phantom_bp` 102, `harvest_bp` 207, `platypus_bp` 208, `help_bp` 221, `refill_bp` 243, `mobhp_bp` 287, `chairs_bp` 296, `farm_bp` 311, `durability_bp` 320, `hud_bp` 320, `leaves_bp` 324, `afk_bp` 362, `cleanup_bp` 379, `guard_bp` 395).

## 3. How a player finds things today

- **`/realm:help`** [V]: "All commands", then one button per installed feature in docs order: `for (const pack of features) form.button(...)` at `packs/help_bp/scripts/main.js:148`. No groups, no search. With the bundle that is 66 buttons.
- **Realm Configuration item (`/realm:admin`)** [V]: My Preferences, Recent, Search, then six groups with 18 sections (`packs/admin_bp/scripts/presets.js:29-90`). This is the only grouped view and the only search. A pack missing from `GROUPS` lands in "Other"; `fishing_bp` sits under "World & Events > Events and news" and `cooking_bp` under "Friends, Crowns & Fun > Animals and food", so the groups are already strained.
- **`/realm:config`** (operators) [V]: "All settings", then one button per pack, then "Reset a pack" (`packs/settings_bp/scripts/main.js:333-342`). About 60 buttons.
- **`/realm:prefs`** [V]: one modal form, a heading per pack (`packs/settings_bp/scripts/main.js:515-520`). 81 static preferences; 22 of them are Easy Building's.
- **Three names for one idea** [V]: the item everyone carries is "Realm Configuration" (`admin_bp`), operators' settings are "Realm Settings" (`/realm:config`, `settings_bp`), and a player's own are "My preferences" (`/realm:prefs`). The item called Configuration is in fact the main menu.
- **Help and the menu describe the same commands twice** [V]: `help_bp/scripts/catalog.js` (240 KB, text from the docs) and `admin_bp/scripts/catalog.js` (37 KB, command signatures). A player who wants to know what a feature does and then use it crosses from one pack's forms to the other's.
- **Docs, README, website** [V]: `docs/PACKS.md` contents (lines 9-99), the README table and the realm page are flat, in the order the packs were written. `hosting/minecraft/tools/pack-docs.mjs` makes one card per `## Name — \`folder\`` section and has no notion of a group.
- **Joining** [V from docs]: welcome popup at 2 s (every join: `showOnce: false`, `packs/welcome_bp/scripts/config.js:25`), news popup at 5 s, unread mail line at 8 s, daily quests line at 10 s, Crowns daily bonus line at 10 s, the forecast line at 10 s on the first join of the day, plus the menu item line when it is handed out. Six packs each speak separately.

## 4. One line per pack

Groups are the proposed end state (section 10). **Use**: A = a player opens it on purpose; P = it shows itself and the player sometimes looks or toggles; S = silent tweak, nothing to remember; O = operator set-up; R = resource pack (visuals only). "Timers / event subs / forms" are counts of `runInterval(`, `afterEvents|beforeEvents.*.subscribe(` and `new ...FormData(` in the pack's own files: a rough measure of tick work and menu size, not a cost. Measured cost (validation of `68095de`, `docs/audits/2026-11-perf-audit/PLAN.md:23-30`): Minimap 0.55 ms a tick at 10 players, every other pack 0.09 ms or less.

| Folder | Name | Proposed group | Use | What it does for a player | Own script lines | Commands (player / ops) | Prefs | Realm options | config.js keys | Saved-data prefixes | On screen | Timers / event subs / forms | Docs lines |
|---|---|---|---|---|---:|---|---:|---:|---:|---|---|---|---:|
| `admin_bp` | Realm Configuration | 1 Menu | A | Carried menu item: every command as buttons, search, recent; operator tools | 3192 | 1 / 3 | 0 | 5 | 7 | `admin:` | action bar x1, title x1 | 1 / 6 / 25 | 71 |
| `help_bp` | Realm Help | 1 Menu | A | One help page per feature and command | 221 | 1 / 0 | 0 | 1 | 2 | `help:` | - | 0 / 2 / 3 | 44 |
| `news_bp` | Realm News & Tips | 1 Menu | P | Update news popup, welcome back line, chat tips | 723 | 2 / 4 | 0 | 3 | 4 | `news:` | - | 2 / 4 / 7 | 75 |
| `settings_bp` | Realm Settings | 1 Menu | A | Operator settings and each player's preferences for every pack | 635 | 1 / 1 | 0 | 0 | 3 | - | action bar x1 | 0 / 3 / 7 | 68 |
| `welcome_bp` | Welcome Message | 1 Menu | P | Welcome popup on join | 768 | 2 / 2 | 1 | 3 | 0 | `welcome:` | title x1 | 0 / 3 / 6 | 110 |
| `durability_bp` | Low Durability Warning | 2 Screen | S | Warns before gear breaks | 320 | 1 / 0 | 1 | 5 | 5 | `durability:` | action bar x2 | 1 / 15 / 0 | 52 |
| `elytra_bp` | Elytra HUD | 2 Screen | P | Glide readout; NOS rockets; a music disc | 933 | 2 / 1 | 2 | 9 | 9 | `elytra:` | side box, action bar x2 | 3 / 10 / 0 | 64 |
| `hud_bp` | Coordinates HUD | 2 Screen | P | Coordinates, facing, day and time readout | 320 | 1 / 0 | 3 | 6 | 7 | `hud:` | side box, action bar x2 | 1 / 2 / 0 | 59 |
| `hud_rp` | Side HUD | 2 Screen | R | Draws the side boxes, compass and radar | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 38 |
| `map_bp` | Minimap | 2 Screen | A | Compass strip, radar, destinations, 5 marked spots | 6030 | 5 / 1 | 7 | 17 | 23 | `map:` | side box | 5 / 10 / 5 | 106 |
| `mobhp_bp` | Mob Health | 2 Screen | P | Health of the mob you hit | 287 | 1 / 0 | 2 | 5 | 6 | `mobhp:` | side box, action bar x1 | 1 / 5 / 0 | 56 |
| `translucent_bp` | Translucent Tools Switch | 2 Screen | S | Per-player switch for see-through tools | 73 | 0 / 0 | 1 | 1 | 1 | `translucent:` | - | 0 / 2 / 0 | 44 |
| `translucent_rp` | Translucent Tools | 2 Screen | R | See-through held tools | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 54 |
| `build_bp` | Easy Building | 3 Inventory & Building | A | Shape building, copy and paste, undo | 18146 | 13 / 0 | 22 | 16 | 16 | `build:` `eb:` | action bar x42 | 21 / 28 / 15 | 110 |
| `build_rp` | Easy Building Guides | 3 Inventory & Building | R | Easy Building's panels, book and sounds | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 27 |
| `find_bp` | Chest Finder | 3 Inventory & Building | A | Which chest holds an item | 996 | 1 / 0 | 0 | 4 | 6 | `find:` | action bar x1 | 2 / 10 / 1 | 56 |
| `refill_bp` | Hotbar Refill | 3 Inventory & Building | S | Refills the hotbar slot you emptied | 243 | 1 / 0 | 1 | 3 | 3 | `refill:` | - | 0 / 11 / 0 | 52 |
| `stash_bp` | Quick Stack & Sort | 3 Inventory & Building | A | Sort, quick stack, chest locks, 5 inventory pages | 4629 | 4 / 2 | 5 | 10 | 15 | `stash:` | action bar x2 | 3 / 17 / 9 | 119 |
| `afk_bp` | AFK + Smart Sleep | 4 Home & Land | S | AFK tag; night skips without AFK players | 362 | 1 / 0 | 1 | 6 | 5 | `afk:` | action bar x1 | 0 / 13 / 0 | 85 |
| `chairs_bp` | Chairs | 4 Home & Land | S | Sit on stairs and slabs | 296 | 1 / 0 | 0 | 2 | 4 | `chairs:` | action bar x1 | 1 / 3 / 0 | 57 |
| `claims_bp` | Land Claims | 4 Home & Land | A | Claim land (off until an operator enables it) | 1071 | 1 / 0 | 0 | 7 | 11 | `claims:` | action bar x1 | 3 / 11 / 1 | 76 |
| `cleanup_bp` | Lag Cleanup | 4 Home & Land | S | Clears piles of dropped items after a warning | 379 | 1 / 0 | 0 | 7 | 8 | `cleanup:` | - | 1 / 2 / 1 | 58 |
| `farm_bp` | Farm Loader | 4 Home & Land | O | Keeps named farms loaded | 311 | 1 / 2 | 0 | 3 | 3 | `farm:` | - | 0 / 1 / 4 | 50 |
| `guard_bp` | Creeper Guard | 4 Home & Land | S | Creeper blasts break no blocks | 395 | 2 / 2 | 0 | 3 | 4 | `guard:` | - | 0 / 2 / 2 | 50 |
| `harvest_bp` | Right-click Harvest | 4 Home & Land | S | Tap a ripe crop to harvest and replant | 207 | 0 / 0 | 0 | 3 | 4 | `harvest:` | action bar x1 | 0 / 1 / 0 | 53 |
| `leaves_bp` | Fast Leaf Decay | 4 Home & Land | S | Leaves of a felled tree drop fast | 324 | 0 / 0 | 0 | 2 | 7 | `leaves:` | - | 1 / 1 / 0 | 55 |
| `phantom_bp` | Phantom Opt-out | 4 Home & Land | S | Turn phantoms off for yourself | 102 | 1 / 0 | 1 | 1 | 3 | `phantom:` | - | 0 / 2 / 0 | 42 |
| `zones_bp` | Safe Zones | 4 Home & Land | O | Safe zones world events leave alone | 643 | 1 / 0 | 0 | 5 | 6 | `zones:` | action bar x1 | 1 / 2 / 2 | 61 |
| `atlas_bp` | Atlas of the Realm | 5 Travel | P | Named regions and wayside sites to find | 2449 | 1 / 0 | 1 | 9 | 19 | `atlas:` | action bar x1, title x1 | 4 / 9 / 8 | 94 |
| `death_bp` | Death Point | 5 Travel | P | Where you died; optional teleport back | 598 | 3 / 0 | 2 | 5 | 6 | `death:` | - | 1 / 4 / 2 | 65 |
| `maps_bp` | Treasure Maps & Riddles | 5 Travel | A | Riddle treasure hunts from Mara | 2174 | 2 / 1 | 1 | 14 | 27 | `maps:` | side box, action bar x1 | 4 / 4 / 9 | 111 |
| `waystone_bp` | Waystones & Inns | 5 Travel | A | Fast travel between waystones; inns | 1208 | 2 / 1 | 0 | 12 | 16 | `waystone:` | action bar x2 | 2 / 8 / 8 | 94 |
| `calendar_bp` | Realm Calendar | 6 Story & Towns | P | Realm Year, festivals, Choir sieges | 2744 | 1 / 2 | 0 | 16 | 28 | `cal:` | side box, action bar x1, title x1 | 5 / 14 / 5 | 129 |
| `caravan_bp` | Merchant Caravan | 6 Story & Towns | P | Weekly traders with rare goods | 1404 | 2 / 3 | 0 | 6 | 15 | `caravan:` | - | 3 / 5 / 8 | 78 |
| `goals_bp` | Community Goals | 6 Story & Towns | A | Shared donation goals set by operators | 681 | 1 / 1 | 0 | 3 | 5 | `goals:` | - | 0 / 1 / 2 | 60 |
| `npc_bp` | Townsfolk | 6 Story & Towns | A | Twelve townsfolk: talk, gifts, friendship, menus of other packs | 4275 | 2 / 5 | 0 | 7 | 25 | `npc:` | - | 3 / 9 / 10 | 136 |
| `saga_bp` | Story Questlines | 6 Story & Towns | A | 42 stories, 234 chapters, daily favors, tracker | 24526 | 2 / 4 | 3 | 17 | 18 | `saga:` | side box, action bar x2, title x2 | 10 / 25 / 28 | 233 |
| `town_bp` | Town Projects | 6 Story & Towns | A | Deliver materials so towns build and level up | 6259 | 2 / 3 | 0 | 16 | 25 | `town:` | title x1 | 4 / 8 / 7 | 129 |
| `wander_bp` | Wanderers of the Wilds | 6 Story & Towns | P | People met on the road (quests run by Story) | 1996 | 1 / 1 | 1 | 11 | 22 | `wander:` | - | 5 / 14 / 5 | 91 |
| `bounty_bp` | Bounty Board | 7 Adventure | A | Daily bounties on champions and mobs | 1228 | 2 / 2 | 1 | 11 | 13 | `bounty:` | action bar x1 | 1 / 6 / 4 | 83 |
| `elite_bp` | Champions | 7 Adventure | P | Named night champions that drop Relic Shards | 2016 | 2 / 1 | 1 | 16 | 25 | `elite:` | - | 3 / 7 / 4 | 129 |
| `expedition_bp` | Expeditions | 7 Adventure | A | Party dungeon runs and gauntlets | 8161 | 3 / 2 | 0 | 19 | 35 | `expedition:` | action bar x1, title x3 | 4 / 20 / 18 | 271 |
| `quests_bp` | Daily Quests | 7 Adventure | P | Three daily quests | 796 | 1 / 0 | 1 | 6 | 9 | `quests:` | action bar x1 | 3 / 11 / 1 | 96 |
| `relics_bp` | Relics | 7 Adventure | A | Seventeen relics, forge, ascension, sets | 2172 | 2 / 2 | 1 | 8 | 17 | `relics:` | action bar x1 | 1 / 14 / 7 | 174 |
| `guilds_bp` | Guilds & Reputation | 8 My Character | P | Four guild reputations, shops, perks | 1050 | 1 / 0 | 1 | 7 | 17 | `guilds:` | action bar x1 | 1 / 10 / 2 | 124 |
| `journal_bp` | Field Journal | 8 My Character | P | Collection log that fills itself | 1034 | 1 / 0 | 1 | 3 | 7 | `journal:` | - | 2 / 8 / 2 | 64 |
| `milestones_bp` | Milestones | 8 My Character | P | Tiered achievements on the same stats | 647 | 1 / 0 | 0 | 1 | 5 | `milestones:` | - | 0 / 6 / 1 | 69 |
| `nick_bp` | Nicknames | 8 My Character | A | Nickname and color above your head | 501 | 1 / 0 | 0 | 5 | 7 | `nick:` | - | 1 / 3 / 5 | 58 |
| `skills_bp` | Skills | 8 My Character | P | Six skills, perks, Callings and talents | 2782 | 2 / 0 | 1 | 16 | 20 | `skills:` | action bar x2, title x1 | 7 / 19 / 6 | 184 |
| `stats_bp` | Stats & Leaderboards | 8 My Character | P | Stats, leaderboards, ticker, sidebar | 973 | 2 / 1 | 7 | 12 | 14 | `stats:` | action bar x2 | 3 / 10 / 5 | 104 |
| `titles_bp` | Titles & Trails | 8 My Character | A | Titles under your name, particle trails | 888 | 1 / 2 | 0 | 6 | 9 | `titles:` | - | 2 / 5 / 5 | 73 |
| `crowns_bp` | Crowns | 9 Friends & Crowns | A | Currency: balance, pay, market, daily bonus | 1074 | 4 / 2 | 0 | 5 | 11 | `crowns:` | - | 1 / 3 / 11 | 89 |
| `domt_bp` | Deck of Many Things | 9 Friends & Crowns | A | Draw a random-effect card | 3957 | 1 / 2 | 0 | 9 | 8 | `domt:` | action bar x3, title x4 | 7 / 11 / 8 | 261 |
| `mail_bp` | Realm Mail | 9 Friends & Crowns | A | Letters to online and offline players | 835 | 1 / 0 | 1 | 8 | 14 | `mail:` | action bar x1 | 0 / 3 / 4 | 77 |
| `party_bp` | Parties | 9 Friends & Crowns | A | Parties: HUD, chat, shared credit | 853 | 5 / 0 | 1 | 7 | 8 | `party:` | action bar x1 | 2 / 5 / 6 | 86 |
| `slots_bp` | Slot Machine | 9 Friends & Crowns | A | Slot machine for Crowns or emeralds | 1001 | 2 / 1 | 0 | 7 | 8 | `slots:` | action bar x1, title x1 | 0 / 5 / 11 | 79 |
| `climate_bp` | Regional Weather | 10 Weather & Sky | S | Sandstorms, blizzards, fog banks | 548 | 1 / 0 | 1 | 9 | 8 | `climate:` | action bar x1 | 1 / 5 / 0 | 81 |
| `meteor_bp` | Meteor Strikes | 10 Weather & Sky | P | Meteor strikes with a crater to find | 1046 | 2 / 1 | 0 | 8 | 16 | `meteor:` | - | 4 / 1 / 2 | 77 |
| `moon_bp` | Blood Moon & Harvest Moon | 10 Weather & Sky | P | Blood Moon and Harvest Moon nights | 1073 | 2 / 1 | 0 | 12 | 9 | `moon:` | title x1 | 1 / 8 / 1 | 97 |
| `night_bp` | Aurora & Shooting Stars | 10 Weather & Sky | S | Shooting stars to wish on; aurora | 484 | 1 / 0 | 1 | 8 | 6 | `night:` | - | 1 / 6 / 0 | 67 |
| `rain_bp` | Rain Extras | 10 Weather & Sky | S | Storm fog, mist, drips, wind, roof rain | 699 | 1 / 0 | 1 | 13 | 8 | `rain:` | - | 1 / 5 / 0 | 104 |
| `rain_rp` | Realistic Rain | 10 Weather & Sky | R | Heavier rain, recordings, fog | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 80 |
| `rainbow_bp` | Rainbows & the Pot of Gold | 10 Weather & Sky | P | Rainbow and a pot of gold race | 878 | 1 / 1 | 0 | 8 | 11 | `rainbow:` | - | 2 / 4 / 0 | 78 |
| `sky_rp` | Realm Skies | 10 Weather & Sky | R | Particles and fogs for every sky event | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 90 |
| `storm_bp` | Storm Chasing | 10 Weather & Sky | P | Storm cells to chase; Storm Glass | 878 | 2 / 1 | 1 | 5 | 23 | `storm:` | action bar x1 | 2 / 11 / 1 | 84 |
| `tornado_bp` | Tornadoes | 10 Weather & Sky | P | Tornadoes that throw players | 1011 | 2 / 1 | 1 | 9 | 20 | `tornado:` | - | 3 / 4 / 1 | 95 |
| `weather_bp` | Weather Almanac | 10 Weather & Sky | P | Planned weather with a forecast | 840 | 2 / 1 | 1 | 12 | 11 | `weather:` | - | 1 / 5 / 3 | 80 |
| `cooking_bp` | Kitchen | 11 Animals, Food & Fun | A | 27 dishes at a cooking pot | 2076 | 1 / 0 | 1 | 7 | 15 | `cooking:` | - | 2 / 10 / 8 | 145 |
| `dolphin_bp` | Dolphin Friends | 11 Animals, Food & Fun | A | Tame and ride dolphins | 836 | 2 / 0 | 0 | 6 | 9 | `dolphin:` | - | 2 / 6 / 6 | 61 |
| `fishing_bp` | Fishing 2.0 | 11 Animals, Food & Fun | P | 40 species, sizes, records, weekly tournament | 1647 | 4 / 1 | 2 | 6 | 13 | `fishing:` | - | 2 / 8 / 8 | 150 |
| `platypus_bp` | Platypus | 11 Animals, Food & Fun | S | A new animal by rivers | 208 | 1 / 0 | 0 | 3 | 3 | `platypus:` | - | 0 / 6 / 0 | 67 |
| `platypus_rp` | Platypus Models | 11 Animals, Food & Fun | R | Platypus model and skins | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 36 |
| `silly_bp` | Silly Enchants | 11 Animals, Food & Fun | A | 14 cosmetic silly enchants | 1617 | 1 / 1 | 1 | 5 | 10 | `silly:` | action bar x1, title x2 | 5 / 11 / 7 | 95 |
| `silly_rp` | Silly Enchants Sounds | 11 Animals, Food & Fun | R | Silly Enchants particles and cheer | 0 | 0 / 0 | 0 | 0 | 0 | - | - | 0 / 0 / 0 | 42 |
| **Total** | 74 packs (67 behavior, 7 resource) | | | | 133729 | 119 / 62 | 81 | 500 | 757 | | | 153 / 503 / 317 | 6562 |

### Script events per pack (protocol dependencies)

Every behavior pack also answers `realm:help_ping`, `realm:cfg_*` and `realm:diag_*`; those are left out. Read from string literals passed to `sendScriptEvent` or a `send` helper (sent) and other literals that some pack sends (listened), so a dynamic id is missed and the synced `zones.js` and `side.js` traffic is not counted.

| Folder | Sends | Listens to | Synced modules it carries |
|---|---|---|---|
| `admin_bp` | actionbar, npc_places_ping, title, waystones_known_ping | npc_places, waystones_known | zones |
| `help_bp` | - | - | - |
| `news_bp` | - | - | - |
| `settings_bp` | actionbar | - | - |
| `welcome_bp` | npc_places_ping, title | npc_places | - |
| `durability_bp` | actionbar | - | - |
| `elytra_bp` | actionbar | - | side |
| `hud_bp` | hud_state | actionbar, hud_line, hud_ping | side |
| `map_bp` | atlas_ping, death_point_ping, map_state, npc_places_ping, place_ping, rainbow_ping, siege_ping, town_list_ping, track_ping, waystones_known_ping | atlas_region, atlas_site, atlas_sites, death_point, npc_places, place_ready, rainbow_pot, siege_marks, town_list, track, wander_gone, wander_spawn, wander_turn, waystones_known | side |
| `mobhp_bp` | actionbar | - | side |
| `translucent_bp` | - | - | - |
| `build_bp` | actionbar, blocks_placed, calling_ping, claims_check | calling, claims_check_result | zones |
| `find_bp` | access_check, actionbar | access_check_result | - |
| `refill_bp` | refill_need | - | - |
| `stash_bp` | access_check, access_check_result, actionbar, stash_changed, stash_count | refill_need, stash_count_ask | - |
| `afk_bp` | actionbar, nametag | - | spread |
| `chairs_bp` | access_check, actionbar | access_check_result | - |
| `claims_bp` | access_check_result, actionbar, claims_check_result, party_members_ping | access_check, claims_check, party_members | zones |
| `cleanup_bp` | - | - | - |
| `farm_bp` | - | - | - |
| `guard_bp` | zones_open | - | zones |
| `harvest_bp` | actionbar | - | - |
| `leaves_bp` | - | - | - |
| `phantom_bp` | - | - | - |
| `zones_bp` | actionbar | zones_open | zones |
| `atlas_bp` | actionbar, atlas_region, atlas_site, atlas_sites, atlas_state, claims_check, gossip, ingredient_give, journal, place_ping, poi, quest_done, saga_progress_ping, skill_xp, title, title_unlock, trail_unlock | atlas_ping, claims_check_result, place_ready, saga_progress, sky_event | gossip, spawn, spread, zones |
| `death_bp` | death_point | death_point_ping | - |
| `maps_bp` | actionbar, calling_ping, gossip, journal, map_leg, npc_offer, quest_done, relic_give, rep_add, skill_xp | affinity, calling, map_leg_ping, map_rival, npc_choose, npc_talk | gossip, side, zones |
| `waystone_bp` | actionbar, calling_ping, journal, npc_offer, waystones_known | affinity, calling, npc_choose, npc_talk, sky_event, waystones_known_ping | - |
| `calendar_bp` | actionbar, calendar, calendar_ping, calendar_state, claims_check, gossip, npc_offer, place_ping, quest_done, recipe_learn, rep_add, saga_progress_ping, siege, siege_marks, skill_xp, sky_event, sky_request, title_unlock, town_list_ping, town_state, trail_unlock | claims_check_result, npc_choose, npc_gift, npc_talk, place_ready, saga_progress, siege_ping, town_list, town_state_ping | gossip, side, spawn, zones |
| `caravan_bp` | gossip, sky_event | - | gossip, name-labels, tether |
| `goals_bp` | gossip, mail_send, title_unlock | - | gossip |
| `npc_bp` | affinity, calendar, mail_send, npc_choose, npc_flags_ping, npc_gift, npc_gossip, npc_mayor_ack, npc_places, npc_summoned, npc_talk, title_unlock, trail_unlock | calendar_ping, gossip, npc_flags, npc_mayor, npc_mayors, npc_offer, npc_places_ping, npc_summon, quest_done | name-labels, tether |
| `saga_bp` | actionbar, bounty_rival, bounty_targets_ping, calendar_ping, calling_ping, champion_spawn, fish_ping, gossip, journal, mail_send, map_leg_ping, map_rival, npc_flags, npc_offer, place_ready, quest_done, recipe_learn, relic_give, rep_add, saga_progress, seals, skill_xp, sky_request, stash_count_ask, title_unlock, track, wander_done, wander_hide, wander_state, weather_ask | affinity, bounty_targets, calling, champion_slain, fish_caught, fish_pong, map_leg, npc_choose, npc_flags_ping, npc_talk, place_ping, saga_progress_ping, seals_ping, sky_event, stash_changed, stash_count, track_ping, wander_gone, wander_ping, wander_spawn, wander_turn, weather_plan | gossip, name-labels, side, spawn, tether |
| `town_bp` | calendar_ping, claims_check, gossip, mail_send, npc_mayor, npc_mayors, npc_offer, npc_places_ping, npc_summon, place_ping, quest_done, rep_add, title, town_list, town_state_ping, zones | blocks_placed, claims_check_result, npc_choose, npc_mayor_ack, npc_places, npc_talk, place_ready, town_list_ping, town_state, zones_ping | gossip, owed, spawn |
| `wander_bp` | bounty_targets_ping, map_leg_ping, npc_choose, npc_talk, place_ping, wander_gone, wander_ping, wander_spawn, wander_tether, wander_turn | bounty_targets, map_leg, npc_offer, place_ready, poi, quest_done, wander_done, wander_hide, wander_state | name-labels, tether, zones |
| `bounty_bp` | actionbar, bounty_targets, champion_spawn, gossip, npc_offer, quest_done, rep_add, title_unlock | bounty_rival, bounty_targets_ping, champion_slain, npc_choose, npc_talk | gossip, owed |
| `elite_bp` | champion_slain, gossip, journal | champion_spawn | gossip, spawn, zones |
| `expedition_bp` | actionbar, champion_spawn, expedition_state, gossip, journal, quest_done, relic_give, rep_add, title | calling | gossip, spawn |
| `quests_bp` | actionbar, fish_ping, quest_done | blocks_placed, fish_caught, fish_pong | spread |
| `relics_bp` | actionbar, gossip, journal, npc_flags_ping, npc_offer, npc_summon, relic_sets, seals_ping | affinity, npc_choose, npc_flags, npc_summoned, npc_talk, relic_give, relic_sets_ping, seals | gossip, owed |
| `guilds_bp` | actionbar, gossip, npc_offer, title_unlock | blocks_placed, champion_slain, npc_choose, npc_talk, quest_done, rep_add | gossip, owed, spread |
| `journal_bp` | fish_ping, title_unlock | fish_caught, fish_pong, sky_event | spread |
| `milestones_bp` | gossip, milestones_test_report, title_unlock | title_ack | gossip, spread |
| `nick_bp` | - | nametag | prune, spread |
| `skills_bp` | actionbar, calendar_ping, calling, fish_ping, gossip, npc_flags_ping, npc_offer, quest_done, title, title_unlock | blocks_placed, calling_ping, fish_caught, fish_pong, npc_choose, npc_flags, npc_talk, skill_xp | gossip |
| `stats_bp` | hud_line, hud_ping | actionbar, hud_state | - |
| `titles_bp` | nametag, title_ack | title_unlock, trail_unlock | prune, spread |
| `crowns_bp` | npc_offer | affinity, npc_choose, npc_talk | - |
| `domt_bp` | actionbar, champion_spawn, domt_tested, skill_xp, title | - | spawn, zones |
| `mail_bp` | actionbar, party_members_ping | mail_send, party_members | - |
| `party_bp` | actionbar, hud_line, party_changed, party_members | hud_state, party_members_ping | prune |
| `slots_bp` | actionbar, title | - | - |
| `climate_bp` | actionbar, journal, weather_ask | weather_plan | weather-plan |
| `meteor_bp` | gossip, journal, sky_event, zones_open | sky_request | gossip, zones |
| `moon_bp` | gossip, journal, moon, sky_event, title, title_unlock, weather_ask | sky_request, weather_plan | gossip, spawn, weather-plan, zones |
| `night_bp` | journal, sky_event, weather_ask | sky_request, weather_plan | weather-plan |
| `rain_bp` | weather_ask | weather_plan | weather-plan |
| `rainbow_bp` | journal, rainbow_pot, relic_give, sky_event, zones_ping | rainbow_ping, sky_request | - |
| `storm_bp` | access_check, actionbar, calling_ping, gossip, journal, relic_sets_ping, sky_event, storm_cell, weather_ask | access_check_result, calling, relic_sets, weather_plan | gossip, weather-plan, zones |
| `tornado_bp` | gossip, journal, sky_event, weather_ask | weather_plan | gossip, weather-plan, zones |
| `weather_bp` | npc_offer, weather_plan | npc_choose, npc_talk, sky_request, weather_ask | - |
| `cooking_bp` | calling_ping, cooking_owed, cooking_owed_test_report, npc_offer, skill_xp | affinity, calling, champion_slain, ingredient_give, npc_choose, npc_talk, recipe_learn, sky_event | owed |
| `dolphin_bp` | - | - | spread |
| `fishing_bp` | calling_ping, fish_caught, fish_pong, gossip, journal, npc_offer, quest_done, skill_xp, sky_event | affinity, calling, fish_ping, npc_choose, npc_talk | gossip, owed |
| `platypus_bp` | - | - | - |
| `silly_bp` | actionbar, silly_fx, title | - | - |

## 5. Families: merge, present as one, connect or leave alone

Options: **(a)** merge on disk; **(b)** keep the packs, present them as one thing (one menu entry, one hub page, one settings group, one docs group); **(c)** connect with a protocol or shared module; **(d)** leave alone.

| Family | Packs | Verdict | Why |
|---|---|---|---|
| Menu packs | `help`, `admin`, `settings` (+ `welcome`, `news`) | **(b) now, (a) later and optional** | Three packs, three names, two catalogs of the same commands. Regroup and rename first; merging `help_bp` and `settings_bp` into `admin_bp` is the safest on-disk merge in the repo (section 6) but is only worth it if the seams between their forms still hurt afterwards |
| Weather and sky | `weather`, `climate`, `storm`, `tornado`, `rainbow`, `night`, `meteor`, `moon`, `rain` (+ `rain_rp`, `sky_rp`) | **(b) + small (c)** | 20 commands, 84 realm options, 6 preferences in 9 packs. Each event is switched on its own and they already share `weather-plan.js`, `zones.js`, `realm:weather_ask` / `weather_plan` and `realm:sky_request` / `sky_event`. One "Weather & Sky" page: the forecast, tonight (moon, aurora, meteor), happening now (storm cell, tornado, pot of gold), my sky visuals (5 switches), and for operators the six "make it happen" commands |
| On-screen readouts | `hud`, `mobhp`, `elytra`, `map`, `durability`, `hud_rp`, plus the stats ticker, party HUD, story tracker and Warmer / Colder | **(b)** | They already share `side.js` (7 packs) and the action bar protocol (33 packs write the bar). What is missing is one "My screen" page: every readout with on/off and where it shows. Today that is about 27 preferences (plus a switch per stat for the ticker) under 11 pack headings |
| Inventory and storage | `stash`, `find`, `refill` | **(b) + small (c)** | Already linked (`realm:refill_need`, `realm:access_check`). `stash_bp` already holds two features (Quick Stack and the 5-page inventory). Missing: chest locks have no "share with my party" (Land Claims has it; `stash_bp/scripts/main.js` has no party code) |
| Farming and world tweaks | `harvest`, `farm`, `leaves`, `cleanup`, `guard`, `phantom`, `chairs` (+ `afk`, `zones`, `claims`) | **(b), mostly "hide"** | Seven of these need nothing remembered. One help page "Things that just work", a line each. An "Essentials" pack on disk was considered and rejected: 4,090 lines in 10 packs with no shared code, one settings prefix each, and other servers install them one by one |
| Things to do | `quests`, `bounty`, `calendar`, story favors, fishing tournament, `caravan`, `goals` | **(c)** | Five separate "daily" systems (3 quests, a favor per questgiver, bounties, festival activities, the login bonus) and two weekly ones, each with its own command. This is where "hard to remember" comes from. One **Today** page fed by every pack (section 8, C1) |
| Progress | `stats`, `milestones`, `skills`, `guilds`, `journal`, `titles`, `nick` | **(b); (a) optional for Milestones into Stats** | Milestones counts the same eight things as Stats with its own subscriptions and takes the larger number (`packs/milestones_bp/scripts/main.js:12-16`, `:132`, `:153-155`). Skills and Guilds are two ladders over the same four activities (mine, farm, fight, travel); they cannot merge without a redesign, so show them side by side on one "My Character" page with one list of every leaderboard |
| Travel and places | `waystone`, `death`, `atlas`, `maps`, `map` | **(b) + (c)** | The one-screen Travel idea largely exists: `/realm:map` > Pick a destination already offers Townsfolk, Waystones I know, Towns, Wanderer camps, Atlas sites, Where I died, Party mates and My marked spots (`docs/PACKS.md:1542`). Gaps in section 8 (C5, C6). `zones` and `claims` are about land, not travel |
| NPCs and story | `npc`, `town`, `wander`, `caravan`, `saga`, `elite`, `relics`, `expedition`, `bounty` | **(d) on disk, (b) in menus** | The most connected family: 13 packs answer the Townsfolk offer round (`realm:npc_talk` / `npc_offer` / `npc_choose`). `wander_bp` needs Story Questlines and has two commands players rarely type: show it as a page of Story, not a feature of its own |
| Gambling and fun | `domt`, `slots`, `silly` | **(d)** | Independent, opt-in, no overlap |
| Social | `party`, `mail`, `nick`, `afk` | **(b) + (c)** | Party credit reaches 11 packs through the `realm_party:` tag; gaps in section 8 (C8) |

Two naming traps to fix while regrouping [V]: `map_bp` (Minimap, `/realm:map`) against `maps_bp` (Treasure Maps, `/realm:maps`); and the menu labels in section 3.

## 6. What an on-disk merge really costs here

**What does not need to move on the Realm.** The Realm Bundle is one add-on with one saved-data store, and every key carries its pack's prefix ("the bundle keeps every pack's saved data in one store", `CLAUDE.md`; the warning at `docs/PACKS.md:6773`). A merged pack that reads the old keys needs no migration there. `diag.js` already takes several prefixes (`registerPack({ prefixes })`, `tools/diag-shared.js:66-73`; `build_bp` declares `["build","eb"]`). Scoreboards (`crowns`, `stats_*`, `rep_*`) are world-wide and unaffected. [V]

**What does.**

1. **Settings keys.** `createSettings` takes one `PREFIX` and saves `<PREFIX>:cfg` (world) and `<PREFIX>:pref` (per player) (`tools/settings-shared.js:52-54`). A merged pack either keeps one settings instance per old pack (then Realm Settings still lists them separately and nothing is gained) or folds the options into one instance and migrates `<old>:cfg` once and every player's `<old>:pref` when that player next joins, reading the old keys forever. Player properties can only be read while the player is online, so the migration is lazy by nature. This is the production-data risk. [V for the key shape, S for the migration design]
2. **Single-pack installs.** A single pack's data is stored under its own add-on; a merged pack has another header UUID, so a server that runs single packs starts that feature's settings over, and the old pack stops getting updates. The Realm is not affected. [V: `docs/PACKS.md:6773`]
3. **The website.** `publish-packs.mjs:227-244` walks the folders that exist now and finds each entry by `folder`. Nothing retires an entry: a removed folder's entry stays in `packs.json` as a download frozen at its last version, its `packs-<slug>` release stays, and its realm page card (made from the `PACKS.md` section, `pack-docs.mjs`) disappears, so links to `realm/#<id>` break. An on-disk merge needs a `retired` state in hosting first. [V]
4. **Commands.** The names can stay: the merged pack registers them. The registry has no alias field [S], so an "alias" is a second registered command and makes the `/realm` list longer, not shorter.
5. **Everything keyed by folder.** The `/realm:help` topic (`tools/help-catalog.mjs:102`), the admin catalog and `GROUPS`, `check-docs` (a section per folder), `check-versions`, `release/notes.json` `packNotes.<folder>`, the `realm:help_ping` responder, `/realm:diag` rows and Forget (a merged pack forgets all its prefixes together), and the tests named per pack (3 `milestones-*` and 4 `stats-*` scenarios, for example). [V]
6. **What it buys.** In the bundle: one script event listener, one diagnostics wrapper and one settings responder fewer per pack merged. Perf plan W1 (`docs/audits/2026-11-perf-audit/PLAN.md:142`) already removes most of that per-pack wake-up cost, so little is left. For players on the Realm: nothing they can see.

**So: presentation-level grouping gets all of the player-facing benefit.** Two merges have a case beyond presentation:

- **A. `help_bp` + `settings_bp` into `admin_bp`** (M). Saved data is trivial: `help:cfg` only; `settings_bp` saves nothing (`prefixes: []` in its `diag.js`); `admin:setup`, `admin:recent`, `admin:setupTold`, `admin:cfg`. Both catalogs are already regenerated and both packs bumped on every release. Gain: one navigation stack (a feature page with what it is, open it, how it works, my settings), where today the menu has to run `/realm:help` and `/realm:prefs` as the player and loses the way back. Cost: hosting retirement for two slugs, 12 scenarios and the two generators to rework. Do it only after the regrouping, and only if the seams remain.
- **B. `milestones_bp` into `stats_bp`** (M). Gain: the duplicate counting goes (three subscriptions, `milestones_bp/scripts/main.js:153-155`), one help entry fewer. Risk: Stats stores scores under the player's name and Milestones under the player's id (`milestones:p:<id>`), so the fold must take the larger of the two per player once, when they join, and keep the tiers reached (`g`) exactly. Low value; last.

Everything else: **do not merge on disk.**

## 7. Duplicate code and shared-module candidates

Thirteen synced modules exist (`tools/diag-shared.js`, `events`, `gossip`, `name-labels`, `owed`, `prune`, `settings`, `side`, `spawn`, `spread`, `tether`, `weather-plan`, `zones`). None of them covers forms, players, formatting, Crowns or finding a safe spot, and those are what the packs copy most. From `scratchpad/research/dup-helpers.mjs` (top-level functions with the same name in five or more packs' own files; "variants" is the number of different bodies after stripping comments and whitespace) [V for the counts, S for how far the variants really differ in behavior]:

| Candidate | Helpers found (packs / variants / largest identical group) | Lines today | Example |
|---|---|---:|---|
| `forms-shared.js` | `show` (45 / 20 / 13): show a form, retry while the player is busy; `confirm` (5), `showForm` (6). `UserBusy` handling appears in 56 files | about 600 | `packs/admin_bp/scripts/main.js:125`, `packs/death_bp/scripts/main.js:433`, `packs/crowns_bp/scripts/main.js:228` |
| `players-shared.js` | `isOp` (40 / 6 / 21), `stillOp` (5), `online` (24 / 6 / 19), `playerOf` (11 / 1 / 11), `originPlayer` (7 / 2 / 6) | about 165 | `packs/admin_bp/scripts/diagnostics.js:88`, `packs/caravan_bp/scripts/main.js:1060` |
| `format-shared.js` | `fmt` (16 / 15), `bar` (12 / 11), `compass` (11 / 9), `direction` (7 / 5), `describe` (9 / 9), `clock` (6), `dimName` (5), `plain` (8) | about 700 | `packs/bounty_bp/scripts/main.js:49`, `:70`, `:916`; `packs/death_bp/scripts/main.js:175` |
| `crowns-shared.js` | `crownsObjective` (16 / 4 / 8), `addCrowns` (12 / 12), `crownsOf` (11 / 6), `takeCrowns` (6), `pay` (5). 20 packs touch the `crowns` scoreboard at 49 `getObjective`/`addObjective` sites | about 440 | `packs/bounty_bp/scripts/main.js:107-135`, `packs/atlas_bp/scripts/main.js:904`, `packs/caravan_bp/scripts/main.js:197-209` |
| `sendEvent` in `events-shared.js` | `send(id, msg)` (14 / 13) beside 262 direct `system.sendScriptEvent` calls | about 130 | `packs/atlas_bp/scripts/main.js:78` |
| `ground-shared.js` (a safe place to stand) | `topAt` (6), `groundAt` (5), `blockAt` (8), `spot` (5). 14 packs teleport (`npc` 9 sites, `expedition` 8, `caravan`, `tornado`, `waystone` 3 each), and `death_bp` has its own safe-spot search | about 375 | `packs/atlas_bp/scripts/main.js:465`, `packs/guilds_bp/scripts/main.js:444` |
| `items-shared.js` | `itemName` (10 / 10, 26 lines each), `giveItem` (5), `makeItem` (5), `inventoryOf` (5) | about 385 | `packs/caravan_bp/scripts/main.js:130` |
| `sky-shared.js` | `skyRequest` (5 / 5, 26 lines each) in the sky packs | 130 | `packs/meteor_bp/scripts/main.js:921` |
| `party-shared.js` | 11 packs read Parties' `realm_party:` tag, each with its own helper (`partyOf`, `partyMates`, `partyCode`, `partyMembers`...) | about 200 [S] | `bounty`, `claims`, `death`, `expedition`, `mail`, `map`, `maps`, `quests`, `saga`, `skills`, `waystone` |

About 3,000 lines in total. Notes for the spec:

- These are maintenance wins, not things a player sees. The exception is `crowns-shared.js`: twelve hand-written `addCrowns` bodies is where a money bug hides, and one module is also what makes a Crowns statement possible (C7).
- Every new synced module bumps each pack that takes it, like perf W1 and W2. Never run one together with those; adopt the identical groups first (21 identical `isOp`, 19 `online`, 13 `show`, 11 `playerOf`, 8 `crownsObjective`) and leave the odd variants until someone reads them.
- To be stored once in the bundle a module must have no per-pack module state and no relative import (`SHARED`, `tools/bundle.mjs:264`). All of the above qualify except a forms helper that keeps per-player state (the menu's `show` tracks `resumed`, `packs/admin_bp/scripts/main.js:125-140`).
- A docs slip found on the way [V]: `docs/PACKS.md:362` links to `#expansive-inventory--stash_bp`, and no heading makes that anchor (the section is "Quick Stack & Sort").

## 8. Connections and gap-bridging features

**Already there, so not to be rebuilt** [V from "How the packs work together", `docs/PACKS.md:6777-7004`]: the story's current goal on the compass and radar (`realm:track`); festival chapters offered while a festival runs (`realm:calendar`); guild reputation from stories, bounties, maps, fishing, expeditions and town projects (`realm:quest_done`, `realm:rep_add`); titles from eight packs (`realm:title_unlock`); the Journal's Story, Wanderers, Weather and Relics pages (`realm:journal`, `realm:sky_event`); the death point, waystones, towns, camps, Atlas sites, party mates and marked spots as destinations; letters from townsfolk, the story, goals and towns (`realm:mail_send`); town gossip from 19 packs (`realm:gossip`); party credit in 11 packs.

**Missing, ranked by value for the owner's problem (too much to navigate and remember), then cost.**

| # | Connection | Value | Cost | Protocol | Packs touched |
|---|---|---|---|---|---|
| C1 | **Today.** One page (and one chat line on joining in place of four) listing what is open right now: the 3 daily quests, favors on offer, today's bounties, a running festival's activities, the tournament countdown, the caravan, the forecast and tonight's moon, the login bonus, unread mail, a ready Deck draw, what the town still needs | Very high | M to L | New, shaped like the Townsfolk offer round: `realm:hub_ping` `{ req, player, hub }`, answered by `realm:hub_card` `{ req, pack, hub, order, lines, label, cmd }`, collected for a few ticks. One synced module (`tools/hub-shared.js`) | Host: `quests_bp` or the menu. Cards from about 15: `quests`, `saga`, `bounty`, `calendar`, `fishing`, `caravan`, `weather`, `moon`, `crowns`, `mail`, `domt`, `town`, `goals`, `expedition`, `atlas` |
| C2 | **Presets for notes and visuals.** "Quiet", "Normal", "Everything" set the 15 or so note switches at once; "Slower device" turns off the heavy visuals (rain extras, regional weather, night sky, tornado density, silly effects, radar) | High | S | None new: the menu sends the existing `realm:cfg_set` with `player`, exactly as Server size does for realm options (`docs/PACKS.md`, Realm Configuration, "Server size") | `settings_bp` only |
| C3 | **Realm log, "while you were away".** News keeps the last 50 happenings (a town leveled up, a goal reached, a legendary fish, a meteor, a siege held) and a returning player gets them after `Welcome back! You were away 3d 5h.` Today the notice is the time only, and News listens to nothing but the help ping (`packs/news_bp/scripts/main.js:610-616`) | High | S | Existing `realm:gossip` (19 senders), `realm:sky_event` (9), `realm:siege` | `news_bp` only. Saved as one bounded ring under `news:` |
| C4 | **Daily quests that reach into the other packs.** New quest kinds counted from `realm:quest_done`: claim a bounty, do a favor, find an Atlas site, deliver to a town, clear a dungeon, win a festival activity; and pay Crowns as well as XP. Today the pool is seven vanilla kinds (`packs/quests_bp/scripts/config.js:53-59`) and the pack sends `realm:quest_done` (`main.js:212`) but never listens for it | High | S to M | Existing `realm:quest_done` `{ pack, kind }`; `cooking` and `waystone` would have to start sending it | `quests_bp` (+ `cooking_bp`, `waystone_bp`) |
| C5 | **"Happening now" as destinations.** Pick a destination also offers today's bounty targets, the storm cell, the tornado, the last meteor crater, the caravan and the bounty board. The Minimap listens to neither `realm:bounty_targets` nor `realm:storm_cell` today | Medium to high | S to M | Existing `realm:bounty_targets`, `realm:storm_cell`, `realm:sky_event` (where it carries a place) | `map_bp` (+ a place added to some `sky_event` senders) |
| C6 | **Marked spots worth using.** 5 private marks today (`maxMarks`, `packs/map_bp/scripts/config.js:49`). Raise it, let a mark be shared with the party or everyone. The Realm also runs a third-party "Multiplayer Waypoint System" that needs the Beta APIs and Experimental Cameras experiments (`hosting/minecraft/site/catalog.json:573-581`); shared marks plus waystones could replace it and its experiments | Medium to high | M | `realm:party_members` (exists); new `realm:marks` only if another pack should see them | `map_bp` |
| C7 | **Crowns statement.** "Where did my Crowns come from": the last 20 changes per player, and an audit that covers every pack. Today the audit holds pays and gives only (`docs/PACKS.md:2354`), because 20 packs write the scoreboard themselves | Medium | M | New `realm:crowns_change` `{ player, n, why, from }` sent by `crowns-shared.js` | `crowns_bp` + the 20 packs that pay or charge |
| C8 | **Party gaps.** Chest locks shared with the party (`stash_bp`); Atlas finds and festival activities counting for mates nearby; "split with my party" in Crowns pay | Medium | S each | Existing tag `realm_party:<code>` and `realm:party_members` | `stash_bp`, `atlas_bp`, `calendar_bp`, `crowns_bp` |
| C9 | **Seasons that matter.** The Realm Year has four seasons, and only Townsfolk, the story, Atlas and Town Projects read `realm:calendar`. Weather odds by season, a season line on the Coordinates HUD (it shows the vanilla day, `packs/hud_bp/scripts/main.js:69`, a different number from the Realm day), seasonal fish, Harvest Moon odds in Harvest | Medium | S each | Existing `realm:calendar` | `weather_bp`, `hud_bp`, `fishing_bp`, `moon_bp` |
| C10 | **One list of every leaderboard** in Stats: its own boards plus Crowns, fishing records, expedition clears, skill totals, guild ranks | Medium | S to M | The hub card protocol of C1 (`hub: "boards"`) | `stats_bp` + 5 |
| C11 | **Journal pages for the newer packs**: dishes cooked, Atlas sites, champions by trait, dungeons cleared, waystones found. Kitchen sends no `realm:journal` today | Medium | S to M | Existing `realm:journal` | `journal_bp` config + `cooking`, `expedition`, `waystone` |
| C12 | **Features with a place in town.** Goals at the mayor, daily quests on a notice board, Mail at a postmaster: players find things by walking, not by remembering a command. `goals_bp` does not take part in the offer round | Medium | S each | Existing `realm:npc_talk` / `npc_offer` | `goals_bp`, `quests_bp`, `mail_bp` |
| C13 | **The waystone menu knows where you are going**: marks the stone nearest your destination, quest target or death point | Low to medium | S | Existing `realm:track`, `realm:death_point` (+ the picked destination, new) | `waystone_bp` |
| C14 | **Rewards paid while offline arrive as a letter**, so a returning player knows what they got | Low | S | Existing `realm:mail_send`, sent from `owed-shared.js` | 6 packs through one sync |

## 9. Noise: what to default off or hide

Nothing here is deleted. Each is a default or a place in a menu, and every switch stays.

| What | Today | Suggestion |
|---|---|---|
| Stats ticker above the hotbar | On for everyone (`tickerDefaultOn: true`, `packs/stats_bp/scripts/config.js:21`) | Default off. Explicit choices are already kept across a default change (`docs/PACKS.md`, Realm Settings, Saved data) |
| Welcome popup | Every join (`showOnce: false`, `packs/welcome_bp/scripts/config.js:25`) | First join and after each edit |
| Chat tips | Every 20 minutes, 9 fixed tips about the oldest packs (`packs/news_bp/scripts/config.js:31-32`) | Every 60 minutes, or one "tip of the day" on the Today page |
| Join lines | Mail, quests, Crowns bonus, forecast, each on its own | One Today line (C1) |
| Per-gain notes | Skill XP, quest progress, bounty progress, reputation, journal entries, all on (`xpNotes`, `progressNotes`, `notes`...) | The "Normal" preset (C2) keeps level-ups and completions and drops the per-gain lines |
| Milestone unlocks in public chat | Every tier (`announce: true`, `packs/milestones_bp/scripts/config.js:3`) | Public for the top tier only |
| 22 chat twins of menu pages (`weather_forecast`, `death_info`, `moon_info`, `relics_list`...) | Listed in help, the menu and `/realm` autocomplete | Hide from help and the menu (a "More" line). Removing them from autocomplete means not registering them, which the owner should decide: it takes away a way to do something, not the thing |
| 12 switch commands (`/realm:durability`, `/realm:phantoms`, `/realm:rain`...) | A menu button each | One "My screen and switches" page |
| Silent tweaks (`harvest`, `leaves`, `guard`, `cleanup`, `refill`, `durability`, `chairs`, `phantom`, `afk`) | Nine help entries | One help page, "Things that just work" |
| Operator set-up packs (`farm`, `zones`, `guard` zones) | Shown to players as features | Under the operator view only, except their read-only pages |
| Resource pack sections (7) | Seven features in the docs and help order | Folded into the feature they draw for |

## 10. Recommended end state

**One thing to remember: the Realm Menu item** (today's Realm Configuration nether star; `/realm:menu`, with `/realm:admin` kept). It opens Today, My preferences, Recent, Search and eleven groups. `/realm:help`, `/realm:config`, `/realm:prefs`, the docs and the website use the same eleven groups in the same order.

| # | Group | Packs | Own lines | Player / ops commands | Prefs |
|---|---|---|---:|---|---:|
| 1 | Menu, help and news | `admin`, `help`, `settings`, `welcome`, `news` | 5,539 | 7 / 10 | 1 |
| 2 | My screen | `hud`, `mobhp`, `elytra`, `map`, `durability`, `translucent_bp`, `translucent_rp`, `hud_rp` | 7,963 | 10 / 2 | 16 |
| 3 | Inventory and building | `stash`, `find`, `refill`, `build`, `build_rp` | 24,014 | 19 / 2 | 28 |
| 4 | Home and land | `claims`, `zones`, `guard`, `farm`, `harvest`, `leaves`, `cleanup`, `chairs`, `phantom`, `afk` | 4,090 | 9 / 4 | 2 |
| 5 | Travel | `waystone`, `death`, `atlas`, `maps` (with the Minimap's destinations) | 6,429 | 8 / 2 | 4 |
| 6 | Story and towns | `saga`, `npc`, `wander`, `town`, `caravan`, `calendar`, `goals` | 41,885 | 11 / 19 | 4 |
| 7 | Adventure | `quests`, `bounty`, `elite`, `expedition`, `relics` | 14,373 | 10 / 7 | 4 |
| 8 | My character | `skills`, `guilds`, `stats`, `milestones`, `journal`, `titles`, `nick` | 7,875 | 9 / 3 | 10 |
| 9 | Friends and Crowns | `party`, `mail`, `crowns`, `slots`, `domt` | 7,720 | 13 / 5 | 2 |
| 10 | Weather and sky | `weather`, `climate`, `storm`, `tornado`, `rainbow`, `night`, `meteor`, `moon`, `rain`, `rain_rp`, `sky_rp` | 7,457 | 14 / 6 | 6 |
| 11 | Animals, food and fun | `fishing`, `cooking`, `dolphin`, `platypus`, `platypus_rp`, `silly`, `silly_rp` | 6,384 | 9 / 2 | 4 |

Each group is one page: a line of live status where it has one (the forecast, the party, today's count), its features with **Open**, **How it works** and **My settings**, and the rarely used commands under **More**. `/realm:prefs` is cut by purpose, not by pack: My screen, Notes and alerts, Visual effects, Helpers, Easy Building, each with the presets of C2 on top.

## 11. Workstreams, in order

Sizes as in the perf plan: S one sitting, M a day of agent work with tests, L several PRs. The perf plan's W1 and W2 each bump every pack; nothing here that touches many packs may be in flight with them.

| # | Workstream | Size | Depends on | Touches | Risk |
|---|---|---|---|---|---|
| 1 | **One taxonomy.** `tools/groups.json` (group, order, title, hint, packs, section); a check that every pack is in exactly one group; `bundle.mjs --list --json` gains `group` (the interface hosting already reads); `GROUPS` in `admin_bp` generated from it | S | none | tools, `admin_bp` (generated part) | Low. No saved data |
| 2 | **Help by group**, with search and the "Things that just work" page; chat twins and switch commands under "More" | S | 1 | `help-catalog.mjs`, `help_bp` | Low. `help_bp` is bumped every release anyway |
| 3 | **Settings by group and preferences by purpose**, with the presets (C2) and `/realm:prefs [feature]`, `/realm:config [feature]` to open one pack's page | M | 1; after perf W2, which changes how settings pages ask the packs | `settings_bp` only (a table of pack and key to purpose, as `admin_bp` does for commands) | Medium: a paged preferences form must save exactly what the single form saves. Saved keys do not change |
| 4 | **Quieter defaults** (section 9: ticker, welcome, tips, milestone chat) | S | none | `stats`, `welcome`, `news`, `milestones` | Low, visible. Players who never chose get the new default, which is the point. Needs the owner's yes per line |
| 5 | **Realm Menu**: rename the item and menu, `/realm:menu`, groups from the taxonomy, a page per feature (Open, How it works, My settings, More), Favorites beside Recent | M | 1, 3 | `admin_bp`, its 10 scenarios | Medium: the item's name and lore are normalized in place (there is a precedent, `docs/PACKS.md:361`), so old items must keep counting as the real one |
| 6 | **Docs and website by group**: `PACKS.md` contents and README grouped (sections can stay where they are), the realm page's cards under eleven headings | S to M | 1 | `docs`, README; `hosting` `pack-docs.mjs`, realm page, check-site | Low. Two repos, one release |
| 7 | **Realm log** (C3) | S | none | `news_bp` | Low. One bounded saved value |
| 8 | **Hub cards and Today** (C1), then the group pages' status lines and the leaderboard list (C10) on the same protocol | M to L (two PRs: protocol and Today with five packs, then the rest) | perf W1 (so a ping wakes only packs with a card); 5 | `tools/hub-shared.js`, about 15 packs | Medium: many packs bumped; the join line must not fight the welcome and news popups |
| 9 | **Daily quests reach out** (C4) and **seasons** (C9) | S to M | none | `quests`, `weather`, `hud`, `fishing`, `moon`, `cooking`, `waystone` | Low. Quest progress is saved by quest id: new ids only |
| 10 | **Map: happening now, shared marks** (C5, C6), then the waystone hint (C13) | M | none; keep clear of perf W5 (`map_bp`) | `map_bp`, `waystone_bp` | Medium: `map_bp` is the one pack near its perf budget, and marks are saved per player |
| 11 | **Party gaps, journal pages, places in town, offline letters** (C8, C11, C12, C14) | S each | none | one or two packs each | Low |
| 12 | **Shared helper modules** (section 7), `crowns-shared.js` first because it carries C7 | M to L, one module per release | after perf W1 and W2; never together with 8 | up to 45 packs per module | Medium: 20 variants of `show` do not all behave alike. Identical groups first |
| 13 | **Optional on-disk merges** (section 6, A then B), after hosting can retire a pack | M each (+ S in hosting) | 5 for A; 12 for B | `help`, `settings`, `admin`; `stats`, `milestones`; hosting | The only work here that touches saved-data keys and published packs. Skip unless the earlier steps leave a real problem |

Steps 1 to 6 are the simplification the owner asked for and move no saved data. Steps 7 to 11 are the new connections. Steps 12 and 13 are maintenance and can wait.

## 12. Decisions for the owner

1. Rename "Realm Configuration" to "Realm Menu" (item, menu, `/realm:menu`)?
2. The eleven groups and their names.
3. Each quieter default in section 9, line by line.
4. Chat twins: hide from menus only (recommended), or also stop registering them.
5. Replace the third-party Multiplayer Waypoint System with shared marks (C6), which would also let the Realm drop two experiments?
6. Whether the two optional merges (section 6) are wanted at all.

## 13. Method and limits

- Tables come from scripts in `scratchpad/research/` (`pack-table.mjs`, `make-tables.mjs`, `dup-helpers.mjs`); outputs are `table.txt`, `table.json`, `tables.md`, `dups.txt`, `howto.txt`.
- Script events are read from string literals, so an id built at run time is missed, and "listens" means the literal appears in the pack and some pack sends it.
- "Timers / subs / forms" are counts in source, not measured cost. No pack was run; nothing here was tested on a server or a client.
- `docs/PACKS.md` was read in full only for Contents, Common to all packs, Realm Help, Realm Settings, Realm Configuration, Realm News, the Minimap's How to use, Bundling and How the packs work together; every other pack by its summary and How to use, with single paragraphs where a claim needed them.
- The duplicate-helper finder matches by function name, so two helpers with one name but different jobs are counted together (`mainMenu`, `menu`, `save`, `load` were left out of the candidates for that reason), and a helper under another name is missed.
- Bedrock behavior marked [S] (no command aliases, what a command registration can read at startup) is from memory of the API, not from a test.
