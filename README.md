# mc-packs

Minecraft Bedrock add-ons for my Realm. Each folder in `packs/` is a self-contained pack: behavior packs (`*_bp`) and one resource pack (`rain_rp`). They all use only the stable Script API (Minecraft **1.21.100+**), so no experimental toggles are needed. Most behavior packs ship together as the **Realm Bundle**; the rain packs are **standalone** and run next to it.

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
| [Realistic Rain](docs/PACKS.md#realistic-rain--rain_rp) | `rain_rp` | **Resource pack, standalone.** Thicker, heavier blue rain, the realm's own rain and thunderstorm recordings, gloomier rain fog, softer splashes, and heavier snowflakes with a whiter snow fog | none |
| [Rain Extras](docs/PACKS.md#rain-extras--rain_bp) | `rain_bp` | **Standalone**, next to the bundle. Storm fog, a darker rain haze on Vibrant Visuals, ground mist, drips, the thunderstorm recording, storm wind, rain on the roof and the rain muffled indoors (needs Realistic Rain) | `/realm:rain` |

`/realm:config` and commands with `edit`, `reset`, `tips`, `sidebar`, `add` or `remove` in the name are ops-only. None of the commands need cheats. In game, `/realm:help` explains every installed command, with usage.

## Quick start

```bash
npm install
npm run build                 # dist/<folder>.mcpack for every pack
npm run bundle -- --all       # or: everything in one dist/realm_bundle.mcpack
```

Open the `.mcpack` on a device with Minecraft, then go to **Realms → ✏️ Edit Realm → Behavior Packs** and activate it (**Resource Packs** for `rain_rp`, at the top of the list). Use the individual packs **or** a bundle, never both; the standalone packs (`tools/standalone.json`) are never in the bundle and go next to it. See [Installing](docs/PACKS.md#installing-on-a-realm) and [Bundling](docs/PACKS.md#bundling-packs-into-one).

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
| `packs/<folder>/` | One behavior pack: `manifest.json`, `scripts/main.js`, `scripts/config.js`, and `scripts/settings.js` (what Realm Settings can change in it). `rain_rp` is a resource pack (textures, fogs, client biomes, sounds, particles), generated by `tools/gen-rain/` |
| `docs/PACKS.md` | Documentation, also published on mc.nish.software/realm. **Update it in the same commit as any pack change**; `npm run check` enforces it |
| `tools/build.mjs`, `tools/bundle.mjs` | Packaging, with no dependencies |
| `tools/standalone.json` | Behavior packs that `bundle --all` leaves out because they run next to the bundle (`rain_bp`) |
| `tools/gen-rain/` | Generates `rain_rp` from Mojang's vanilla files in `tools/gen-rain/vanilla/` and the realm owner's rain and thunder recordings (`recordings.json`; the originals go in the git-ignored `tools/gen-rain/sources/`) (`npm run gen:rain`); `npm run check` fails if its textures, fogs or client biomes are stale. `renders.mjs` and `sounds.mjs --audition docs/media/rain` make the rain packs' pictures and sound clips |
| `docs/media/` | Pictures and sound clips shown in `docs/PACKS.md` (`### See and hear it`) and on the realm page |
| `tools/check-docs.mjs` | Fails if a pack, its `### How to use`, a command or a config option is missing from the docs |
| `tools/check-commands.mjs` | Fails if a command or enum isn't in the `realm:` namespace, or two share a name |
| `tools/settings-shared.js`, `tools/sync-settings.mjs` | The Realm Settings helper every behavior pack copies into its `scripts/settings.js` (packs never import each other); `sync-settings.mjs` copies it, `--check` (part of `npm run check`) fails on a missing or stale copy |
| `tools/help-catalog.mjs` | Writes the in-game `/realm:help` text from `docs/PACKS.md`; `--check` (part of `npm run check`) fails if it's stale or a pack doesn't answer `/realm:help` |
| `.claude/skills/bundle-packs/` | The `/bundle-packs` skill |

Script errors show up in the content log (**Settings → Creator → Enable Content Log GUI**).
