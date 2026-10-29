# Running the packs on your own Realm or server

For owners and operators of a Bedrock Realm or a dedicated server (BDS, or a host that runs one) who want these
packs on their world. Players don't need this page: what each feature does, how to use it and every command are on
**[minecraft.nish.software/realm](https://minecraft.nish.software/realm/)** (the same text as [`PACKS.md`](PACKS.md)).

## What you get

67 behavior packs and 7 resource packs that turn vanilla survival into one cozy co-op RPG: a story told by twelve
townsfolk, town life, weather and sky events, progression (skills, guilds, relics, bounties, expeditions), and
quality-of-life tools (stash and sort, chest finder, refill, minimap, HUD). Every pack works alone and does more
next to its partners; they talk only through script events, tags and scoreboards, never by importing each other.

You install them one of two ways. **Pick one and keep it**:

| | What | When |
|---|---|---|
| **The two bundles** (recommended) | **Realm Bundle** (every behavior pack, one add-on) and **Realm Resources** (every resource pack) | Everything, with two uploads. A pack can't be both kinds, so two is the fewest possible |
| **Single packs** | Each feature as its own `.mcpack` | Only some features |

- Never activate a bundle **and** single packs from it: every command would be registered twice and those commands
  fail to load.
- **Saved data doesn't move between the two ways.** Bedrock keeps each add-on's script data separately, so switching
  from single packs to the bundle (or back) starts in-game settings, edited texts, story progress and other saved
  data over. Decide before players start.
- Downloads: every version of both bundles and of every single pack is on
  [minecraft.nish.software/realm](https://minecraft.nish.software/realm/), with its size and sha256. To build them yourself from
  this repository: `npm install`, then `npm run bundle -- --all` and `npm run bundle -- --resources`
  (`dist/realm_bundle.mcpack`, `dist/realm_resources.mcpack`) or `npm run build` (one `dist/<folder>.mcpack` per pack).
- The repository's CI starts a private BDS with the genuine Realm Bundle as one script context after its checks
  and build. This catches shared-store and cross-pack loading problems that separate-pack tests miss; it does
  not certify client rendering, phone controls or a live Realm upload.

## Requirements

| | |
|---|---|
| Minecraft | Bedrock **1.21.100 or newer** (`min_engine_version`); tested on Bedrock Dedicated Server **1.26.52.3** |
| Script API | `@minecraft/server` 2.1.0 and `@minecraft/server-ui` 2.0.0, the stable versions |
| Experiments, Beta APIs | **Not needed.** Leave every experimental toggle off; nothing uses beta modules |
| Cheats | **Not needed** for any `/realm:` command. Operators' quick actions (weather, time, give...) work without cheats too |
| Achievements | Any behavior pack that isn't from the Marketplace turns achievements off for the world (that's Bedrock) |
| Other add-ons | Translucent Tools Switch overrides the vanilla player entity, Dolphin Friends the vanilla dolphin and Town Projects the vanilla villager (`minecraft:villager_v2`): another add-on that also overrides one of them breaks one or the other. With another villager add-on, Town Projects' residents can't move in (operators are told; leave `residents` Disabled). All commands use the `realm:` namespace |
| World | Any world, new or old. Nothing assumes a spawn, a town or coordinates: operators place the townsfolk, towns and boards (see Operator setup), and the story builds the places it needs when nobody set them |

World settings that matter:

- **Daylight cycle on.** Story nights, festivals, the moon events and the Realm Calendar follow the in-game day.
  With `doDaylightCycle` off, many story steps that wait for night or a time of day never finish.
- Keep the world's spawn near where the town will be: some story steps (and the reminder to put a safe zone over it)
  start from world spawn.
- A resource pack is needed for the HUD (minimap, side boxes), skies and rain. On BDS set
  `texturepack-required=true` in `server.properties`, so every player gets Realm Resources when they join.

## Installing

### On a Realm

1. On a phone, tablet or PC with Minecraft, download the latest `Realm Bundle` and `Realm Resources` `.mcpack`
   files and open each one. Minecraft imports them.
2. Open the Realm's settings (the pencil next to it). Under **Behavior Packs** activate **Realm Bundle**. Under
   **Resource Packs** activate **Realm Resources** and move it to the **top** of the active list, so its rain, sky and
   tools win over other resource packs. Minecraft uploads both.
3. Join once the Realm restarts and accept the resource pack download. The welcome popup and the `/realm:` commands
   (type `/realm` to see them) mean it's running.

Another way: download the Realm world, activate the packs in that world's settings, and upload it again.

### On a dedicated server (BDS or a host)

1. Stop the server. A `.mcpack` is a zip file: unzip `Realm Bundle` into the server's `behavior_packs/` folder (for
   example `behavior_packs/realm_bundle/`, with `manifest.json` directly inside) and `Realm Resources` into
   `resource_packs/realm_resources/`.
2. In the world folder (`worlds/<level-name>/`), add the packs to `world_behavior_packs.json` and
   `world_resource_packs.json` (create the files if they're missing). The `pack_id` is `header.uuid` and the
   `version` is `header.version` from each pack's `manifest.json`. The bundles always keep the same uuid:

   ```json
   [{ "pack_id": "ecea9490-d833-5ee6-bea8-8d6d06c473d2", "version": [2026, 1018, 715] }]
   ```

   ```json
   [{ "pack_id": "5f0d9ca1-75f3-5e1b-8dfa-ba101d27bec5", "version": [2026, 1018, 715] }]
   ```

   (the first in `world_behavior_packs.json`, the second in `world_resource_packs.json`; use the version of the files
   you unzipped). For single packs, add one entry per pack.
3. In `server.properties`: `texturepack-required=true` (players get the resource pack); `allow-cheats` can stay
   `false`. For finding problems, `content-log-file-enabled=true` writes script errors to a log file; each starts with
   the pack's name in brackets (`[stash]`, `[map]`).
4. Start the server and join. The welcome popup and `/realm:help` mean it's running.

## Operator setup

**Who is an operator:** every pack counts a player as an operator by permission level 1 (`GameDirectors`) or
higher, and nothing else. On a Realm that's the Realm's operators; on a dedicated server, players given operator with
`/op <name>` from the console or `"permission": "operator"` in `permissions.json`. **Tags never make anyone an
operator**, so a player who gives themselves a tag gains nothing. Keep `default-player-permission-level=member`.
Operator menus check the level again when a button is pressed, so de-opping someone takes effect at once.

**Then run `/realm:admin_setup`** (or use the Realm Configuration item every player carries: **Operator Tools** >
**Set up this world**). A new world reminds operators once in chat until it's done. It walks through the one-time
jobs one page each, with what it's for, whether it's done (the packs say so where they can) and a button that runs
the step's own command:

1. **Place the Townsfolk**: stand in each one's house and pick them, or stand in your town and let them take the
   houses around you. They give the stories, gifts, letters and shops.
2. **Add a Town** at its center (a town is also a safe zone).
3. **Safe Zone at Spawn**: meteors, tornadoes, storms and Blood Moon creepers break no blocks inside a safe zone.
4. **Caravan Arrival Spot**, **Bounty Board** (a lectern), **First Waystone at Spawn**, **Expedition Site** (far
   from spawn and from anyone's builds; dungeons are built deep underground).
5. **Server Size** (below), then the rest: relicsmith, story places, town project spots (towns pick their own; set one only where you want it), Creeper Guard zones, farms
   kept loaded, a community goal, the **welcome message** and **news** (the defaults talk about our Realm: rewrite
   them for yours) and every pack's settings (`/realm:config`). On a public server, also look at Land Claims (off
   by default) and Creeper Guard.

Steps can be skipped and come back later; every step stays in Operator Tools. Each pack's own settings are in
`/realm:config` (operators, for everyone) and `/realm:prefs` (each player, for themselves); details per pack are in
the pack's "For operators" part on [minecraft.nish.software/realm](https://minecraft.nish.software/realm/).

## Choosing a server size

**Operator Tools > Server size** switches the settings that depend on the number of players, all at once, after
listing every change (old -> new). **Small Realm** (up to about 10 players) is every pack's default. **Large server**
(30 to 100+ players) sets:

| Pack | Setting | Small Realm | Large server | Why |
|---|---|---|---|---|
| Minimap | `budgetLevel` | normal | low | The heaviest pack. Its time budgets are for everyone together: low caps its budgets at about 0.7 ms a tick instead of 1, whatever the player count (measured about 1.2 ms a tick against 1.5 with 10 players, 1.65 against 1.9 with 40). Strips, radars, terrain and mob dots come a little later |
| Minimap | `mobRadiusMax` | 32 | 24 | Each mob search covers about half the ground, so the budgeted searches come round sooner for many players |
| Stats & Leaderboards | `tickerEnabled` | true | true | Both profiles allow each player's own ticker; disallowing it hides everybody without erasing choices |
| Stats & Leaderboards | `tickerDefaultOn` | true | true | Players who never chose start on. A saved personal on/off choice wins even after later default changes |
| Champions | `maxAlive` | 80 (+ 0.8 per player) | 80 | A world-wide ceiling, scaled by players online (`maxAlivePerPlayer` 0.8): 1 player meets 1, 10 meet 8, 100 meet 80. Not measured at Large player counts yet |
| Blood Moon | `blood.maxExtraWorld` | 0 (no limit) | 160 | Caps the Blood Moon extra monsters across every player and dimension, loaded ones only. Not measured at Large player counts yet |
| Expeditions | `slots` | 1 | 3 | Three dungeons of 4 players at once instead of one; about 0.1 ms a tick per run going. Uses up to 3 of the world's 10 ticking areas while dungeons reset |
| Easy Building | `maxBlocksCap` | 50,000 | 2,000 | Bound each public-server build; the separate `defaultMaxBlocks` stays 50,000 but is clamped to the cap |
| Easy Building | `operatorsOnly` | Disabled | Enabled | Only operators use the building tools on the public-server profile |
| Easy Building | `allowInfiniteReach` | Enabled | Disabled | Do not let public-server builds reach faraway areas |
| Lag Cleanup | `threshold` | 500 | 1,500 | It counts dropped items in every dimension together; more players drop more, so cleanups stay about as rare |
| Chest Finder | `liveScanRadius` | 16 | 8 | Each search reads 4,913 blocks instead of 35,937; farther containers still come from its index |
| Realm Configuration | `checkSeconds` | 30 | 60 | Each round reads the inventories that need it (a new operator, a missing item, a failed removal; every inventory once in 10 rounds), about 0.2 ms each: half as often |
| Realm Mail | `sendCooldownSeconds` | 10 | 30 | Less letter spam among many strangers |
| AFK + Smart Sleep | `sleep.percent` | 100 | 50 | With 30 or more players, all of them asleep at once never happens, so the night would never skip |

These are the release's actual Large-preset limits, not measured performance approval. Champions use a world ceiling of 80 with 0.8 per online player and at most 3 nearby; saved non-default ceilings (such as the old Large value 16) remain until an operator reapplies the preset or changes the setting. A world using the old unstored default 8 automatically adopts the new scaling default.

Measured with 40 simulated players, Large server took the whole bundle from 9.5 to 8.3 ms a tick (the Minimap from
3.8 to 2.9 ms). Pick Small Realm again to put every value back. Each value can still be changed on its own in
`/realm:config`.

## Performance

### Latest measurements (October 2026)

The same test workload (simulated players walking, looking and running commands) on master before the October 2026
fixes and after them, on a Windows server running BDS 1.26.52.3, over a 15-minute steady window (18,000 ticks). These
add up the 67 behavior packs running as separate packs, not the Realm Bundle as one pack; they are script time, not
client FPS or all of the server's CPU. Every figure in this table and the two bullets below it comes from that run.

| Players | Before, ms a tick | After, ms a tick |
|---|---:|---:|
| 10 | 6.6 | 4.9 |
| 40 | 9.4 | 8.0 |

- **At 40 players the packs are over the 5 ms goal** (about 8 ms a tick, 15% less than before). This is open: the
  goal stays, and the packs keep getting cheaper wherever a measurement shows a gain.
- The Minimap is the largest part, 3.7 ms against its 1 ms budget. Over the 0.15 ms typical-pack budget: Easy
  Building 0.57, Quick Stack & Sort 0.31, Silly Enchants 0.28, Elytra HUD 0.23, Story Questlines 0.23, Stats 0.21,
  Realm Configuration 0.18 and Realm Calendar 0.15.
- **A separate, shorter run** (a 4-core Linux test machine, an earlier build of these fixes, 5-minute steady window):
  the Realm Bundle running as one pack took about 4.8 ms a tick at 10 players, under the goal. It is not the same
  setup as the table, so do not compare the two directly.
- **Measurements cover 10 and 40 players only** (10 is this Realm's maximum; 40 shows how the packs scale). Not
  measured yet: the Realm Bundle as one pack at 40 players. Servers with more than 40 players are not measured, so
  measure your own with `/realm:diag` (below).
- This Realm keeps the **Small Realm** defaults (10 players, usually 1-4 online). Hardware, workload and how many
  packs you run all change these numbers; on your own server, measure with `/realm:diag` (below).

### Earlier measurements (first October 2026 pass)

Measured on a 4-core Linux machine running BDS 1.26.52 with every behavior pack (the Realm Bundle's contents),
simulated players walking, looking and running a command now and then (`tools/test-bds/examples/perf-soak.js`),
October 2026. "ms a tick" is script time in the packs' callbacks; a server has 50 ms per tick for everything at
20 TPS (ticks per second).

| | Before this release | Now |
|---|---|---|
| 10 players | 45.4 ms a tick, server at 11.6 TPS | 6.4 ms a tick, 19.8 TPS |
| 40 players | 135.4 ms a tick, server at 5.2 TPS | 6.2 to 9.5 ms a tick (three runs), 18.4 to 19.4 TPS; 8.3 ms with Large server |

- The Minimap was most of the old cost (25 ms a tick at 10 players, 108 at 40) and is now 2.3 to 3.8 ms at the same
  counts, kept to its time budgets. Quick Stack & Sort comes next (0.2 to 0.6 ms). Easy Building, once
  0.6 to 1 ms, now wakes only for players who are building: 0.13 to 0.18 ms at 10 and 40 players (0.34 to 0.84 before).
  39 to 45 of the 67 behavior packs cost under 0.05 ms a tick, and 58 to 60 are within the 0.15 ms budget.
- **The budget** the packs are held to: the whole bundle under 5 ms a tick at 40 players, a typical pack 0.15 ms or
  less and the heaviest (the Minimap, the HUDs) 1 ms or less. Most packs are well under it; the bundle as a whole and
  the Minimap are not there yet (see Known limits).
- Run to run, the same code measured 6.2 and 9.5 ms a tick at 40 players on that machine: read single numbers as
  rough.

## Finding and removing a costly pack

- **`/realm:diag [seconds]`** (operators; also **Operator Tools > Pack diagnostics**) measures every pack's script
  time for a few seconds (default 10, up to 60) and lists the packs slowest first, with version, ms per tick and saved
  data. Red means over 0.5 ms a tick, or one saved entry over 24 KB (an entry can hold 32 KB). A pack's page shows its
  two costliest callbacks. Packs listed under **No answer** are older versions without diagnostics.
- **Turning a feature off:** most packs have an **Enabled** switch in `/realm:config`, and their costly parts their
  own settings (the Minimap's budget, ranges, intervals). That keeps the pack installed and its data safe.
- **Removing a pack cleanly**, in this order:
  1. Players finish or end what the pack holds for them: run `/realm:expedition_reset` before removing Expeditions;
     move items from other inventory pages back to your first page before removing Quick Stack & Sort (inactive pages
     are stored where only that pack can read them); collect letters before removing Realm Mail.
  2. **Forget its saved data:** `/realm:diag`, pick the pack, **Forget this pack's saved data**, and confirm. The
     pack deletes what it saved in the world (in the Realm Bundle only its own entries: the other packs keep theirs)
     and saves nothing more. Scoreboards, tags, structures and data saved on players stay.
  3. Restart the server (or `/reload` where allowed), then uninstall: deactivate the single pack, or for the bundle,
     build one without it from this repository (`npm run bundle -- --packs <every folder you keep>`, keeping the
     default name so it updates the same add-on and its saved data) and install that.
- Forgetting is for operators, but anyone who can run `/scriptevent` (operators, command blocks) could send the
  forget event: keep command blocks away from untrusted players, as for any operator power.

## Backups and updates

- **Back up before every update.** On a Realm: the Realm's settings keep backups (**Backups**), or download the world.
  On a dedicated server: stop it (or `save hold` / `save query` / `save resume` from the console) and copy the whole
  `worlds/<level-name>/` folder. Everything the packs save is in the world: settings, story progress, mail, and the
  stored inventory pages and saved ground of town projects as structures inside it.
- **Versions:** every pack's version is in its `manifest.json`. The bundles' versions are their build time in UTC
  (`YYYY.MMDD.HHMM`), so every build is higher than the last; a single pack counts up (`1.4.2`).
- **Updating:** on a Realm, the Realm's owner opens the new Realm Bundle and Realm Resources `.mcpack` files (Minecraft
  imports them), activates both in the Realm's settings, then checks that the Realm's active packs show the new versions
  (if not, deactivate and activate them again). On BDS, stop the server, replace the folders and the `version` in the
  two world JSON files, start it. Settings and progress stay: they are in the world, and the bundles keep their uuid.
- **Update both bundles together.** Realm Resources draws what the Realm Bundle's scripts send: the Minimap's icon
  font and the side boxes' layout must match the scripts that fill them, and the rain and sky effects need their
  textures and particles. A newer bundle with older resources can show boxes for icons or a cut-off HUD. With single
  packs, update every side box pack (HUDs, Minimap, story tracker...) together with Side HUD.

## Known limits

- **Measured with simulated players**, not real clients: no chunk sending, simple movement, no client packets. A
  real server spends more time per player outside the scripts, and a Realm's CPU differs from the test machine.
- **Measured at 10 and 40 players only.** Larger servers are not measured. Coordinates HUD updates arrive in bounded parts (no cap at 100 players), but that is a code change, not a load test; the Minimap keep-alive and the story quest workload still need their 40-player measurements.
- **At 40 players the packs are over their 5 ms goal:** about 8 ms a tick, the Minimap 3.7 ms of it against 1. That is open, not accepted: it leaves less room for other server work. See Performance above.
- **Ticking areas:** Bedrock allows 10 per world. Farm Loader's farms, Expeditions' dungeon resets (up to `slots`),
  Death Point's `/realm:death_back` and some story and town builds share them, as do any you add with `/tickingarea`.
- **One cast:** there is one set of twelve townsfolk for the whole world; several towns share them. Each town also has its own mayor (Town Projects with Townsfolk, `townMayors`), one NPC per town.
- **Town residents are mobs:** with `residents` Enabled (Town Projects, default Enabled), each town gets up to 10 vanilla villagers (2 at a Settlement with a well, 4 at a Village, 6, 8, then 10 at a Capital; `residentCapTown`), and the whole world at most `residentCapWorld` (default 20, 0 to 40). Their AI is the game's, like any villager's, so on a busy or small server keep the world cap low; two towns at Capital with the default cap are 20 villagers, 2 mayors and their name labels, plus each town's garden pen with 2 sheep and 2 chickens (`townLife`; one that despawned comes back while a player is by the pen, one that died never does). Lowering the cap removes nobody: it only stops new families until the count is under it.
- **Stories:** operators can set the town anchor with `/realm:saga_place town`. Stopped daylight cycles no longer block the night/time windows, and wait steps use the documented real-time fallback. Targeted native cases do not certify every story path or real client interaction.
- **Moderation is basic:** Realm Mail has a send cooldown, block lists and unread-sender caps; party mute covers the pack's own command and form, not vanilla chat. Land Claims (off until enabled in `/realm:config`) protects blocks, containers and supported animal interactions, not animal damage, fire, external fluid flow, pistons or endermen. Chest Finder's private index uses opened, owned or shared containers; older worlds retain their previous world-wide choice until changed.
- Bedrock limits apply: achievements are off with add-ons, and an operator's plain `/title` gets drawn over by the
  HUD within a second or two (use `/realm:admin_title`).

## Getting help

- **[minecraft.nish.software/realm](https://minecraft.nish.software/realm/)**: every pack with how to use it, what players see,
  its commands, settings and saved data, plus Troubleshooting and how the packs work together. The searchable list of
  every command is at [minecraft.nish.software/commands](https://minecraft.nish.software/commands/).
- In game: `/realm:help` lists the installed features and their commands; the Realm Configuration item has every
  command a player may use, with operators' in red.
- Script errors: on a dedicated server, the content log (`content-log-file-enabled=true`); in the client,
  **Settings > Creator > Enable Content Log GUI**. Each error starts with the pack's name in brackets.
