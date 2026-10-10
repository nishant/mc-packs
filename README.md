# mc-packs

Minecraft Bedrock add-ons for my Realm. Each folder in `packs/` is a self-contained pack: behavior packs (`*_bp`) and three resource packs (`rain_rp`, `sky_rp`, `translucent_rp`). They all use only the stable Script API (Minecraft **1.21.100+**), so no experimental toggles are needed. Most behavior packs ship together as the **Realm Bundle**; the rain packs, Realm Skies and Translucent Tools are **standalone** and run next to it.

📖 **Full documentation (what each pack does, how to use it, every command and config option): [`docs/PACKS.md`](docs/PACKS.md).** Players read the same text on **[mc.nish.software/realm](https://mc.nish.software/realm/)**, which is generated from it.

| Pack | Folder | What it does | Commands |
|---|---|---|---|
| [Realm Help](docs/PACKS.md#realm-help--help_bp) | `help_bp` | One help page for every installed feature and command, with usage | `/realm:help` |
| [Realm Settings](docs/PACKS.md#realm-settings--settings_bp) | `settings_bp` | Change every pack's settings in game: operators for everyone, each player their own preferences | `/realm:config` · `/realm:prefs` |
| [Welcome Message](docs/PACKS.md#welcome-message--welcome_bp) | `welcome_bp` | Popup when players join | `/realm:welcome` · `/realm:welcome_edit` · `/realm:welcome_reset` |
| [Low Durability Warning](docs/PACKS.md#low-durability-warning--durability_bp) | `durability_bp` | Warns at 10% and 3% durability left, for tools, weapons and armor | `/realm:durability` |
| [AFK + Smart Sleep](docs/PACKS.md#afk--smart-sleep--afk_bp) | `afk_bp` | `[AFK]` tag after 5 min idle; the night can be skipped without waiting for AFK players | `/realm:afk` |
| [Stats & Leaderboards](docs/PACKS.md#stats--leaderboards--stats_bp) | `stats_bp` | Playtime, deaths, kills, blocks, distance; leaderboards; sidebar | `/realm:stats` · `/realm:stats_sidebar` |
| [Realm News & Tips](docs/PACKS.md#realm-news--tips--news_bp) | `news_bp` | News popup when something's new, "you were away 3d", rotating chat tips | `/realm:news` · `/realm:news_edit` · `/realm:news_body` · `/realm:news_add` · `/realm:news_tips` |
| [Creeper Guard](docs/PACKS.md#creeper-guard--guard_bp) | `guard_bp` | Creeper explosions still hurt but break no blocks; TNT untouched. Optional zones mode | `/realm:guard` · `/realm:guard_add` · `/realm:guard_remove` |
| [Phantom Opt-out](docs/PACKS.md#phantom-opt-out--phantom_bp) | `phantom_bp` | Each player can disable phantoms for themselves | `/realm:phantoms` |
| [Right-click Harvest](docs/PACKS.md#right-click-harvest--harvest_bp) | `harvest_bp` | Tap a ripe crop to harvest and replant it | none |
| [Farm Loader](docs/PACKS.md#farm-loader--farm_bp) | `farm_bp` | Keeps named farms loaded with ticking areas (ops add them) | `/realm:farm` · `/realm:farm_add` · `/realm:farm_remove` |
| [Quick Stack & Sort](docs/PACKS.md#quick-stack--sort--stash_bp) | `stash_bp` | Sneak-tap any chest, barrel or shulker box for a menu: sort it, lock it, quick stack into nearby storage holding the same items, sort your inventory | `/realm:stash` · `/realm:sort` · `/realm:stash_help` |
| [Chest Finder](docs/PACKS.md#chest-finder--find_bp) | `find_bp` | Remembers what each chest holds and points you to the one with the item you need | `/realm:find` |
| [Land Claims](docs/PACKS.md#land-claims--claims_bp) | `claims_bp` | Claim the land around your base so others can't build, break or open things there. Off until an operator enables it | `/realm:claim` |
| [Chairs](docs/PACKS.md#chairs--chairs_bp) | `chairs_bp` | Sit on stairs and bottom slabs; adds the `realm:seat` entity | `/realm:sit` |
| [Death Point](docs/PACKS.md#death-point--death_bp) | `death_bp` | Tells you where you died when you respawn, with the distance and direction back; optional once-per-death teleport back (off until an operator enables it) | `/realm:death` · `/realm:death_back` |
| [Hotbar Refill](docs/PACKS.md#hotbar-refill--refill_bp) | `refill_bp` | Refills a hotbar slot from your inventory when its stack runs out or its tool breaks | `/realm:refill` |
| [Coordinates HUD](docs/PACKS.md#coordinates-hud--hud_bp) | `hud_bp` | Your coordinates, facing and the day and time above the hotbar, for players who enable it; operators can disable it realm-wide | `/realm:hud` |
| [Mob Health](docs/PACKS.md#mob-health--mobhp_bp) | `mobhp_bp` | Shows a mob's name and health above your hotbar when you hit it; players' health too if an operator enables it | `/realm:mobhp` |
| [Elytra HUD](docs/PACKS.md#elytra-hud--elytra_bp) | `elytra_bp` | Speed, height, elytra durability and rockets above the hotbar while gliding | `/realm:elytra` |
| [Realm Mail](docs/PACKS.md#realm-mail--mail_bp) | `mail_bp` | Letters to any player who has joined, waiting for offline players; inbox, replies and sent list | `/realm:mail` |
| [Nicknames](docs/PACKS.md#nicknames--nick_bp) | `nick_bp` | A nickname and color above your head (chat still shows gamertags) | `/realm:nick` |
| [Daily Quests](docs/PACKS.md#daily-quests--quests_bp) | `quests_bp` | Three quests a day per player (mine, defeat, harvest, place, travel, eat, fish) with XP and item rewards | `/realm:quests` |
| [Milestones](docs/PACKS.md#milestones--milestones_bp) | `milestones_bp` | Tiered realm achievements (hours played, blocks mined and placed, distance, mob kills, deaths, joins), announced in chat | `/realm:milestones` |
| [Community Goals](docs/PACKS.md#community-goals--goals_bp) | `goals_bp` | Operators set shared goals (an item, an amount, a chest); everyone donates from their inventory, with progress bars, top contributors and chat at each quarter | `/realm:goals` · `/realm:goals_add` |
| [Fast Leaf Decay](docs/PACKS.md#fast-leaf-decay--leaves_bp) | `leaves_bp` | Leaves of a chopped or felled tree drop within a few seconds, with their usual drops. Placed leaves stay | none |
| [Lag Cleanup](docs/PACKS.md#lag-cleanup--cleanup_bp) | `cleanup_bp` | Clears dropped items after a 30-second warning when more than 500 lie around. Renamed and rare items and items near players are kept | `/realm:cleanup` |
| [Townsfolk](docs/PACKS.md#townsfolk--npc_bp) | `npc_bp` | Eight named townsfolk NPCs who face you, chat, go home at night and offer what other packs have when tapped (market, stories, forecast...) | `/realm:npc` · `/realm:npc_add` · `/realm:npc_remove` · `/realm:npc_home` · `/realm:npc_list` |
| [Crowns](docs/PACKS.md#crowns--crowns_bp) | `crowns_bp` | The realm currency: balances and a top 10, paying players, a daily login bonus, and a market at Quill the Trader to sell harvest and ores and buy supplies | `/realm:crowns` · `/realm:crowns_pay` · `/realm:crowns_market` · `/realm:crowns_give` |
| [Merchant Caravan](docs/PACKS.md#merchant-caravan--caravan_bp) | `caravan_bp` | A weekly caravan of traders that stays 40 minutes and sells rare goods for Crowns (Mending, trims, discs, sherds...) and buys Storm Glass and Relic Shards | `/realm:caravan` · `/realm:caravan_spot` · `/realm:caravan_spot_remove` · `/realm:caravan_call` |
| [Story Questlines](docs/PACKS.md#story-questlines--saga_bp) | `saga_bp` | Multi-chapter story quests from the townsfolk, with choices, a tracker and rewards: The Drowned Bell and The Cartographer's Last Map | `/realm:saga` · `/realm:saga_place` · `/realm:saga_reset` |
| [Guilds & Reputation](docs/PACKS.md#guilds--reputation--guilds_bp) | `guilds_bp` | Rise through four guilds by playing, for shop stock, titles and perks | `/realm:guilds` |
| [Bounty Board](docs/PACKS.md#bounty-board--bounty_bp) | `bounty_bp` | A lectern board of daily bounties: named champions to hunt and mobs to cull, for Crowns | `/realm:bounty` · `/realm:bounty_board` · `/realm:bounty_board_remove` |
| [Champions](docs/PACKS.md#champions--elite_bp) | `elite_bp` | A few night monsters become named champions with a trait; they drop Relic Shards | `/realm:champions` · `/realm:champions_spawn` |
| [Skills](docs/PACKS.md#skills--skills_bp) | `skills_bp` | Six skills (Mining, Woodcutting, Farming, Fishing, Combat, Exploration) from level 1 to 50 with small perks and master titles | `/realm:skills` |
| [Parties](docs/PACKS.md#parties--party_bp) | `party_bp` | Parties of up to 6: mates' health, distance and direction on a HUD, party-only chat, shared credit in other packs | `/realm:party` · `/realm:party_invite` · `/realm:party_accept` · `/realm:party_leave` · `/realm:party_chat` |
| [Titles & Trails](docs/PACKS.md#titles--trails--titles_bp) | `titles_bp` | Earn titles shown under your name and particle trails that follow you, from playing and other packs | `/realm:titles` · `/realm:titles_give` |
| [Relics](docs/PACKS.md#relics--relics_bp) | `relics_bp` | Ten relics with powers (lightning staff, rain boots, miner's lamp...), forged from Relic Shards at a relicsmith | `/realm:relics` · `/realm:relics_give` |
| [Field Journal](docs/PACKS.md#field-journal--journal_bp) | `journal_bp` | A journal that fills itself: mobs, places, fish, weather, relics and story, with rewards for finished pages | `/realm:journal` |
| [Fishing 2.0](docs/PACKS.md#fishing-20--fishing_bp) | `fishing_bp` | 40 fish species by weather, time and place, with sizes, a fish log, realm records, a weekly tournament and a fisher who buys your catch | `/realm:fishing` · `/realm:fishing_top` · `/realm:fishing_tournament` |
| [Treasure Maps & Riddles](docs/PACKS.md#treasure-maps--riddles--maps_bp) | `maps_bp` | Treasure maps from the cartographer: follow riddle clues 800 to 2,000 blocks with Warmer / Colder hints to a buried chest, Crowns and sometimes a relic | `/realm:maps` · `/realm:maps_give` |
| [Waystones & Inns](docs/PACKS.md#waystones--inns--waystone_bp) | `waystone_bp` | Lodestones with a `Waystone:` sign become fast-travel points players discover and travel between for Crowns; innkeepers rent beds (respawn point and Well Rested) and tell the news | `/realm:waystones` · `/realm:waystones_remove` |
| [Expeditions](docs/PACKS.md#expeditions--expedition_bp) | `expedition_bp` | Dungeon runs for your party: generated rooms with mob waves, a lever puzzle, a boss, treasure and a leaderboard | `/realm:expedition` · `/realm:expedition_leave` · `/realm:expedition_site` · `/realm:expedition_reset` |
| [Town Projects](docs/PACKS.md#town-projects--town_bp) | `town_bp` | Deliver materials to the mayor so your town builds a well, lamp posts, a market stall, a dock and more, and levels up | `/realm:town` · `/realm:town_add` · `/realm:town_spot` · `/realm:town_remove` |
| [Weather Almanac](docs/PACKS.md#weather-almanac--weather_bp) | `weather_bp` | Plans the weather hours ahead in real time (clear spells, rain, thunderstorms) with a forecast, a daily chat line and a Forecast from Sol the Sky-reader | `/realm:weather` · `/realm:weather_set` |
| [Regional Weather](docs/PACKS.md#regional-weather--climate_bp) | `climate_bp` | Sandstorms in deserts, blizzards in snowy places (Slowness, campfires shelter you) and dawn fog banks by the water after rain, per player (visuals need Realm Skies) | `/realm:climate` |
| [Storm Chasing](docs/PACKS.md#storm-chasing--storm_bp) | `storm_bp` | Thunderstorms get a drifting storm cell full of lightning to chase; struck lightning rods give Storm Glass | `/realm:storm` · `/realm:storm_cell` |
| [Tornadoes](docs/PACKS.md#tornadoes--tornado_bp) | `tornado_bp` | Thunderstorms can spin up a tornado that flings mobs, items and players (never blocks) and leaves Storm Glass; needs Realm Skies to see it | `/realm:tornado` · `/realm:tornado_spawn` |
| [Rainbows & the Pot of Gold](docs/PACKS.md#rainbows--the-pot-of-gold--rainbow_bp) | `rainbow_bp` | Rainbows after morning and evening rain, with a pot of gold to race to at their end; needs Realm Skies to see them | `/realm:rainbow` · `/realm:rainbow_now` |
| [Aurora & Shooting Stars](docs/PACKS.md#aurora--shooting-stars--night_bp) | `night_bp` | Shooting stars to wish on, and northern lights over snowy lands, on clear nights; needs Realm Skies | `/realm:night` |
| [Meteor Strikes](docs/PACKS.md#meteor-strikes--meteor_bp) | `meteor_bp` | Some nights a meteor falls far from spawn, announced a minute ahead, leaving a smoking crater with ancient debris; needs Realm Skies for the streak | `/realm:meteor` · `/realm:meteor_now` |
| [Blood Moon & Harvest Moon](docs/PACKS.md#blood-moon--harvest-moon--moon_bp) | `moon_bp` | Some full moons rise as a Blood Moon (red sky, more monsters, a reward for surviving until dawn) or a Harvest Moon (gold sky, crops grow 3x faster) | `/realm:moon` · `/realm:moon_set` |
| [Realistic Rain](docs/PACKS.md#realistic-rain--rain_rp) | `rain_rp` | **Resource pack, standalone.** Thicker, heavier blue rain, the realm's own rain and thunderstorm recordings, gloomier rain fog, softer splashes, and heavier snowflakes with a whiter snow fog | none |
| [Rain Extras](docs/PACKS.md#rain-extras--rain_bp) | `rain_bp` | **Standalone**, next to the bundle. Storm fog, a darker rain haze on Vibrant Visuals, ground mist, drips, the thunderstorm recording, storm wind, rain on the roof and the rain muffled indoors (needs Realistic Rain) | `/realm:rain` |
| [Realm Skies](docs/PACKS.md#realm-skies--sky_rp) | `sky_rp` | **Resource pack, standalone.** Rainbows, auroras, shooting stars, meteors, tornado dust, sandstorms, blizzards, fog banks, blood and harvest moon glows and player trails for the sky packs (they work without it, just without the visuals) | none |
| [Translucent Tools](docs/PACKS.md#translucent-tools--translucent_rp) | `translucent_rp` | **Resource pack, standalone.** Tools, weapons and the shield are 50% see-through in your hand (40 items), so they block less of the screen | none |

`/realm:config` and commands with `edit`, `reset`, `tips`, `sidebar`, `add` or `remove` in the name are ops-only. None of the commands need cheats. In game, `/realm:help` explains every installed command, with usage.

## Quick start

```bash
npm install
npm run build                 # dist/<folder>.mcpack for every pack
npm run bundle -- --all       # or: everything in one dist/realm_bundle.mcpack
```

Open the `.mcpack` on a device with Minecraft, then go to **Realms → ✏️ Edit Realm → Behavior Packs** and activate it (**Resource Packs** for `rain_rp`, `sky_rp` and `translucent_rp`, at the top of the list). Use the individual packs **or** a bundle, never both; the standalone packs (`tools/standalone.json`) are never in the bundle and go next to it. See [Installing](docs/PACKS.md#installing-on-a-realm) and [Bundling](docs/PACKS.md#bundling-packs-into-one).

With Claude, `/bundle-packs` asks which packs to include (**All packs** is the first option) and builds the bundle.

## Development

```bash
npm run check     # type-check against @minecraft/server 2.1.0 / server-ui 2.0.0, check docs/PACKS.md is complete and every settings.js is current
npm run gen:rain  # regenerate Realistic Rain's textures, fogs and sounds (sounds need ffmpeg)
npm run build     # one .mcpack per pack
npm run bundle    # merge packs into one (--list, --all, --packs a,b, --name, --title)
```

| Path | |
|---|---|
| `packs/<folder>/` | One behavior pack: `manifest.json`, `scripts/main.js`, `scripts/config.js`, and `scripts/settings.js` (what Realm Settings can change in it). `rain_rp` and `sky_rp` are resource packs (textures, fogs, client biomes, sounds, particles), generated by `tools/gen-rain/` and `tools/gen-sky/`; `translucent_rp` is a resource pack (attachables, textures), generated by `tools/gen-translucent/` |
| `docs/PACKS.md` | Documentation, also published on mc.nish.software/realm. **Update it in the same commit as any pack change**; `npm run check` enforces it |
| `tools/build.mjs`, `tools/bundle.mjs` | Packaging, with no dependencies |
| `tools/standalone.json` | Behavior packs that `bundle --all` leaves out because they run next to the bundle (`rain_bp`) |
| `tools/gen-rain/` | Generates `rain_rp` from Mojang's vanilla files in `tools/gen-rain/vanilla/` and the realm owner's rain and thunder recordings (`recordings.json`; the originals go in the git-ignored `tools/gen-rain/sources/`) (`npm run gen:rain`); `npm run check` fails if its textures, fogs or client biomes are stale. `renders.mjs` and `sounds.mjs --audition docs/media/rain` make the rain packs' pictures and sound clips |
| `tools/gen-sky/` | Generates `sky_rp` (Realm Skies: the particles and fogs of the weather, sky and trail packs) from code, no source files (`npm run gen:sky`); `npm run check` fails if `sky_rp` is stale |
| `tools/gen-translucent/` | Generates `translucent_rp` from Mojang's vanilla files in `tools/gen-translucent/vanilla/` (`npm run gen:translucent`); `npm run check` fails if any of its files are stale |
| `docs/media/` | Pictures and sound clips shown in `docs/PACKS.md` (`### See and hear it`) and on the realm page |
| `tools/check-docs.mjs` | Fails if a pack, its `### How to use`, a command or a config option is missing from the docs |
| `tools/check-commands.mjs` | Fails if a command or enum isn't in the `realm:` namespace, or two share a name |
| `tools/settings-shared.js`, `tools/sync-settings.mjs` | The Realm Settings helper every behavior pack copies into its `scripts/settings.js` (packs never import each other); `sync-settings.mjs` copies it, `--check` (part of `npm run check`) fails on a missing or stale copy |
| `tools/help-catalog.mjs` | Writes the in-game `/realm:help` text from `docs/PACKS.md`; `--check` (part of `npm run check`) fails if it's stale or a pack doesn't answer `/realm:help` |
| `.claude/skills/bundle-packs/` | The `/bundle-packs` skill |

Script errors show up in the content log (**Settings → Creator → Enable Content Log GUI**).
