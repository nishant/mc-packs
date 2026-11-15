# Waypoints: research and design

Read-only research for an implementation spec. Nothing in any repo was changed.
Paths are under `/home/user/mc-packs` unless they start with `/home/user/hosting`.
Each claim is marked **[V]** (verified by reading the file or page named) or **[S]** (suspected, not confirmed).
Typings were not installed in the repo (`node_modules` is absent), so API claims were checked against
`@minecraft/server@2.1.0` and `@minecraft/server-ui@2.0.0` downloaded from npm into the scratchpad
(`scratchpad/typings/minecraft-server-2.1.0/package/index.d.ts`, cited below as `server.d.ts`, and
`minecraft-server-ui-2.0.0/package/index.d.ts`, cited as `ui.d.ts`).

---

## 1. The add-on being replaced: "Multiplayer Waypoint System" (by sirob)

Sources: its CurseForge page (https://www.curseforge.com/minecraft-bedrock/addons/multiplayer-waypoint-system-cf)
and a ModBay mirror of an older description (https://modbay.org/mods/467-multiplayer-waypoint-system.html).
Both were read through a summarizing fetch, so wording is paraphrased. All of this section is **[V] from those pages**
unless marked.

| Area | What it does |
|---|---|
| Item | Every new player gets a **Waypoint Menu** item on first join (an admin setting). It is locked: can't be dropped, stored or lost on death, until the player unlocks it in their preferences. A lost item comes back with the chat command `./waypoint-menu`. Admins get a second item, the **Waypoint Control Panel** |
| Admin rights | `/function sirobwaypoints_admin` toggles admin for the player who runs it |
| Waypoints | Created where you stand, with a name (up to 100 characters, `§` color codes allowed) and an icon picked at creation. The limit per player is set per dimension, 0 to 999 (one third-party listing says 60 by default **[S]**) |
| Public ones | A player **publishes** a waypoint for a set time (it expires, and republishing has a cooldown). Others browse the public list, visit, add to **My favorites**, see visitor statistics. Owners can blacklist visitors per waypoint. Anyone can report a waypoint; admins review reports and can unpublish or delete. Admins make **featured** waypoints (no expiry, optional teleport discount) for important places |
| Teleport | A countdown standing still (0 to 999 s per dimension, 0 = instant); moving cancels. Camera animation that differs beyond 150 blocks; particles; sounds. Lists show distance in meters and a compass direction, and a color marker for the dimension |
| Dimensions | Waypoints are made and managed in the dimension you are in. The pages disagree on whether you can teleport across dimensions ("in any dimension" vs "only in your current dimension") **[S]** |
| Economy | Optional fees for teleporting, creating and updating, in XP levels or a scoreboard, scaled by distance. Off by default |
| Settings | General, language, publishing, countdowns and limits, economy, per-dimension player permissions, appearance, sounds; per-player language, sounds, fonts, item unlock |
| Not there | Death waypoints, admin ordering of the public list (only "featured" and a recently published list), sorting options |
| Experiments | CurseForge says **Beta APIs** only. Our catalog lists **Beta APIs and Experimental Cameras** for it (`/home/user/hosting/minecraft/site/catalog.json:580`) **[V]**; the camera requirement probably came from an older version **[S]** |
| Version | v2.3.28 for 26.60, released 2026-10-31. It follows every game version, which is the maintenance risk of a Beta API add-on: each Minecraft update can break it until the author ships a new build **[S, general]** |

### Keep / drop for "similar but simpler"

**Keep** (what players are used to): one menu from an item they already carry; add a waypoint where you stand with a
name; a shared public list everyone sees; a private list; tap to teleport; distance and direction in the list; a
dimension hint; a command to get back in when the item is missing (ours: `/realm:waypoints`, and `/realm:admin_item`
already restores the star).

**Drop**: publishing with expiry and republish cooldowns, favorites, visitor statistics, blacklists, reports, featured
waypoints (replaced by the admin order: the top of the list is the featured spot), per-dimension limits and
permissions, fees scaled by distance, languages, fonts, the camera fly animation (needs the camera experiment or beta
calls we don't use), 100-character colored names, a second admin item (operators get red entries in the same menu,
the house style: Realm Configuration docs, `docs/PACKS.md:303`).

**New, because the owner asked**: operators reorder the public list.

---

## 2. What exists in this repo and overlaps

### 2.1 Waystones & Inns (`packs/waystone_bp`, 1,119 lines)

- **Model [V]**: a waystone is a lodestone with a `Waystone: <name>` sign; registered on an empty-hand tap
  (`main.js:333`, `tapped` `:350`); stored as one world JSON list `waystone:list` of `{ i, n, d, x, y, z, by, t }`
  plus `waystone:next` (`main.js:9-12`, `:158-176`); each player's discovered ids are a **player** dynamic property
  `waystone:known` (`:199-213`). Name limit 24, ASCII only, `§` stripped (`:15`, `:309-331`). Cap 150 waystones
  (`config.js` `maxWaystones`).
- **Travel [V]**: only from a waystone unless `travelAnywhere` (default false) (`config.js:26`, `listMenu` `:770`).
  Cost 1 Crown per 100 blocks, minimum 1, 10 across dimensions (`costTo` `:459`). A 10-second stand-still channel
  (`channelSeconds`), followed every 5 ticks; moving more than 1 block, a dimension change or **any** damage cancels
  (`:580-627`). The interval runs always and returns at once when nobody is traveling (`:587-588`).
- **Teleport and safety [V]**: `arrive` (`:673`) looks for a spot beside the lodestone with free feet and head and a
  solid, safe floor (`safeSpot` `:642`: 12 side positions at 3 heights, then on top, then up to 40 blocks straight up;
  `PASSABLE` and `UNSAFE_FLOOR` regexes `:20-21`). If the destination chunk is not loaded it teleports anyway onto
  the top of the lodestone (`:697`, `player.teleport(spot, { dimension, facingLocation, keepVelocity: false })`), then
  `settle` (`:729`) re-checks 10, 40 and 100 ticks later and moves the player beside the lodestone, or back to where
  they started with a refund when nothing is safe (`:753-759`). No ticking area is used.
- **Extras [V]**: party mates within 6 blocks come along (`bringMates` `:547`, tag `realm_party:<code>`), a screen fade
  (`player.camera.fade`, `:629`), Pathfinder discount from Skills, Field Journal entries, innkeepers (beds, news).
- **Claims [V]**: in someone else's claim the lodestone tap is canceled by Land Claims, so it can't be made into a
  waystone or traveled from (`docs/PACKS.md` Waystones section, "In a land claim").
- **Minimap feed [V]**: `realm:waystones_known { player, part, parts, list: [{ i, n, dim, x, z }] }` in parts under
  1,800 characters, on discovery, removal and `realm:waystones_known_ping` (`sendKnown` `:239-274`).
- **Commands [V]**: `realm:waystones`, `realm:waystones_list`, `realm:waystones_remove` (`:1002-1065`).

### 2.2 Death Point (`packs/death_bp`, 546 lines)

- Saves the block a player died in as a **player** property `death:last` `{ d, x, y, z, told, used }` (`main.js:14`, `:80`).
- `/realm:death_back` is **disabled by default** (`backEnabled`), once per death (`goBack` `:399`).
- **The best teleport pattern in the repo [V]**: `safeAt` (`:225`) wants two passable blocks (explicit id set `:18-51`)
  over ground that is not air, liquid, passable or `BAD_GROUND` (`:53-66`), with no lava or fire on the four sides
  (`HOT` `:68`), inside the dimension's `heightRange`. `findSpot` (`:246`) searches radius 2 and height 8, nearest
  first, and answers a spot, `"none"` or `"unloaded"`. When unloaded, `startBack` (`:313`) adds a temporary ticking
  area in the destination dimension (`tickingarea add circle x y z 1 "<name>" true`, `:322`), polls every 5 ticks for
  up to `backLoadSeconds` (5), then removes it; the names are persisted in `death:areas` and removed on world load
  after a restart (`:274-311`). The jump is `player.tryTeleport(center, { dimension, checkForBlocks: true,
  keepVelocity: false })` (`:365`), so the game refuses a blocked spot too. A per-player `busy` set stops double runs.
- Minimap feed: `realm:death_point { player, dim, x, z }` (no `y`) and `realm:death_point_ping` (`:526-540`).

### 2.3 Minimap (`packs/map_bp`)

- **There is no generic "put my marker on the map" event [V]**. The Minimap draws only what it knows from fixed
  broadcasts, listed at `main.js:20-33` and dispatched in `onEvent` (`:2509-2740`): townsfolk, known waystones, Atlas
  region and sites, death point, the story tracker (`realm:track`), camps, towns, the rainbow pot, siege marks.
- **Destination [V]**: `/realm:map` -> **Pick a destination** offers groups built in `choices()` (`:2415-2442`):
  Townsfolk, Waystones I know, Towns, Wanderer camps, Atlas sites I found, Where I died, Party mates, Online friends,
  My marked spots. The pick is the gold star on the compass strip and radar and is saved as `map:wp`
  `{ k, id?, n, dim, x, z }`. Lists are nearest first, at most `MENU_MAX = 40` (`:189`, `:2466`).
- **No event sets a destination from another pack [V]** (the `EVENTS` set `:2509-2525` has none).
- **Overlap**: "My marked spots" (`/realm:map_mark`, 5 per player, `map:marks`, `:156`, `:459`) is a tiny private
  waypoint list without teleport. The Minimap already uses the word "waypoint" internally for the destination
  (`map:wp`, `setWaypoint`), so the new pack's docs should call the Minimap's thing "destination", as its own docs do.

### 2.4 Realm Configuration and the star item (`packs/admin_bp`)

- Every player carries a nether star named **Realm Configuration**; using it opens the menu (`itemUse` handler,
  `main.js:1281-1298`, `openMenu` `:721`). `/realm:admin` opens the same menu; `/realm:admin_item` restores the item.
- The main menu (`mainMenu` `:529-550`) starts with fixed entries (**My Preferences**, **Realm Settings** for
  operators, **Recent**, **Search**), then one button per group from `presets.js` `GROUPS` (`presets.js:29-89`), then
  **Operator Tools**. First-class entries are plain code: `if (has("realm:prefs")) entries.push({ label:
  button("My Preferences", "..."), open: async () => exec(player, "realm:prefs", "My Preferences") })` (`:537`).
- A command becomes a menu entry automatically: `tools/admin-catalog.mjs` loads every pack's `main.js` with a stand-in
  for the Minecraft modules and records what its startup handler registers (`admin-catalog.mjs:1-11`), writing
  `packs/admin_bp/scripts/catalog.js`. `--check` (in `npm run check`) fails when a command has no entry in `NAMES`
  (`presets.js:112`) or when a name or hint is wider than `LINE = 168` font pixels (`presets.js:96`,
  `admin-catalog.mjs:178-200`). A pack in no group lands under "Other" (`main.js:505-527`).
- Commands run with `player.runCommand(line)` (`exec` `:240-262`), which prints `[Realm Configuration] Ran /...` and
  adds the command to **Recent**. After a command the picked page comes back unless the command opened its own menu
  (`resume` `:152-164`: it waits `answerTicks * 2 + 5` ticks, then a `UserBusy` answer means another menu is open
  and the page stays away).
- **Precedent for opening another pack's menu by script event [V]**: `realm:zones_open { player, action }`
  (`zones_bp/scripts/main.js:575`, senders in `guard_bp` and `meteor_bp`; documented at `docs/PACKS.md:6917`).
- Operator checks: permission level `GameDirectors` or more, never tags, checked when a form opens and again on
  submit (C24; `exec` re-checks at `:248`).

### 2.5 Protections and "busy" states

- **Land Claims [V]**: disabled by default (`enabled: false`, `docs/PACKS.md` Land Claims Configuration). Other packs
  ask `realm:claims_check { id, player, dim, x1, z1, x2, z2 }` and always get `realm:claims_check_result { id,
  claims: [{ n, x1, z1, x2, z2 }] }`: up to 10 claims in that box the player may not build in, none while claims are
  disabled (`docs/PACKS.md` Land Claims "How it works"; a caller with a 20-tick timeout at
  `atlas_bp/scripts/main.js:448-454`). Claims key on the owner's `player.id` and refresh the saved name when the
  player joins with a new gamertag (`claims_bp/scripts/main.js:464-479`).
- **Safe Zones [V]**: protect blocks from world events only (`tools/zones-shared.js:1-18`). They say nothing about
  player teleports or about who may stand where. Operators can teleport to a zone center
  (`zones_bp/scripts/main.js:478-497`: `getTopmostBlock`, then walk up through water, `y ?? 100`). A waypoints pack
  does **not** need a copy of `zones.js`.
- **Expeditions [V]**: a player in a running expedition carries the tag `realm_expedition`
  (`expedition_bp/scripts/main.js:82`, added `:1688`, removed `:2011`, cleaned at `:3792`, `:3986`). Other packs read
  it: the Deck's The Swap (`domt_bp/scripts/effects.js:346`) and Wanderers (`wander_bp/scripts/main.js:329`). A
  member found outside the dungeon box for 100 ticks is dropped from the run (`AWAY_TICKS`, `:94`, `:3262-3271`), so a
  teleport out is a quiet "leave". Dungeons are filled back in with solid blocks afterwards (`docs/PACKS.md:5339`),
  so a waypoint saved inside one would later be inside rock.
- **Deck of Many Things arena [V]**: tracked in a private map and a block test (`inDeckArena`,
  `domt_bp/scripts/events.js:204-208`). **No player tag** tells other packs "this player is in an arena".
- **Story (saga_bp) [V]**: no pack uses `inputPermissions` or `camera.setCamera`; the story uses only
  `camera.fade` (`saga_bp/scripts/objectives.js:2967`). There is no "in a cutscene" state to read. Its stealth
  objective teleports a spotted player to the edge of the area (`objectives.js:2352`).
- **Combat [V]**: no shared "in combat" state. Each pack listens to `entityHurt` itself (waystone `:580`, elite
  `:574`, expedition `:3733`).
- **AFK [V]**: tag `afk` (`afk_bp/scripts/config.js:12`). Opening a menu means the player is not AFK, so no rule needed.
- **Sitting [V]**: Chairs seats a player with `rideable.addRider` and tests `player.getComponent("minecraft:riding")`
  (`chairs_bp/scripts/main.js:81`, `:89`).
- **Parties [V]**: tag `realm_party:<code>`; `realm:party_members { code, l, m }` (`docs/PACKS.md` Parties "How it
  works"). `party_bp` has **no** teleport to a mate (no `teleport(` in it).
- **Atlas [V]**: sends `realm:atlas_region { player, name }` when a player enters a region
  (`atlas_bp/scripts/main.js:17`, `:560`, `:988`) and again on `realm:atlas_ping` (`:1903`). Region names are
  Overworld only. Usable as a default waypoint name.
- **Story objective [V]**: `realm:track { player, label?, dim?, x?, z? }` from `saga_bp/scripts/ui.js:1343`; x and z
  only.

### 2.6 Every `teleport(` call in `packs/*/scripts` (79 matches, grep) **[V]**

| Pattern | Where | Notes |
|---|---|---|
| Player fast travel with safety | `waystone_bp/main.js:697,753,757` | Teleport first, re-check 10/40/100 ticks later, step aside or go back. `facingLocation`, `keepVelocity: false`, cross-dimension |
| Player back to death point | `death_bp/main.js:365` | The only `tryTeleport` with `checkForBlocks: true`; temporary ticking area to read an unloaded destination |
| Operator teleports, no checks | `admin_bp/actions.js:191,209`, `atlas_bp/main.js:1806`, `zones_bp/main.js:496`, `saga_bp/places.js:1123-1124` | Straight `teleport`, cross-dimension. The saga one gives Slow Falling for 600 ticks and drops from y 200 when the height is unknown |
| Instanced content | `expedition_bp/main.js:942,950,1703,1937`, `domt_bp/events.js:91,177,243`, `domt_bp/helpers.js:344-453`, `domt_bp/effects.js` | Saved return point as a player property (`PROP_RETURN`, expedition), `keepVelocity: false` everywhere in domt, retries wrapped in `attempt()`, a temporary ticking area at `domt_bp/helpers.js:405` |
| Nudges and rotation | `chairs_bp/main.js:79`, `calendar_bp/main.js:2219`, `tornado_bp/main.js:605-691`, `saga_bp/objectives.js:2352` | Same dimension, short range |
| NPCs and mobs | `npc_bp`, `caravan_bp`, `wander_bp`, `town_bp`, `saga_bp` actors, `elite_bp/main.js:1036`, `dolphin_bp/main.js:689`, shared `tether.js` and `name-labels.js` | `rotation: { x: 0, y: yaw }`, guarded by "is the spot loaded" |

What nobody does: carry mounts, boats or leashed pets along; dismount a rider before a teleport; protect against fall
damage with anything but `keepVelocity: false`. Ticking areas are a scarce shared budget: Bedrock allows 10 per world,
used by Farm Loader (up to 5), Expeditions (one per slot), Realm Calendar sieges, Death Point, Town houses, the Deck
and Easy Building (`farm_bp/scripts/config.js:8`, grep of `tickingarea add`).

### 2.7 Storage facts

- **One dynamic property holds 32,767 bytes [V in repo comments, not in the typings]**: `atlas_bp/scripts/main.js:47`,
  `bounty_bp/scripts/owed.js:6-9`, `crowns_bp/scripts/ledger.js:7`, `admin_bp/scripts/diagnostics.js:17`. The 2.1.0
  typings only say `setDynamicProperty` throws `ArgumentOutOfBoundsError` (`server.d.ts:7665`); they give no number
  and no total limit **[V]**. The repo's rule is "under 32 KB, bound every append-only list" (C22) and Pack
  diagnostics turns red above 24 KB per entry.
- `getDynamicPropertyTotalByteCount()` exists on world and entity (`server.d.ts:5401`, `:7292`). In the bundle the
  world store is shared by every pack, so each pack keeps to its own key prefix and never calls
  `clearDynamicProperties()` (WORKING.md "Known API quirks"). Prefix ownership is by the text before `:` (`map` and
  `maps` coexist, `packs/*/scripts/settings.js`), so `waypoints` does not collide with `waystone`.
- **Chunking patterns in use [V]**: (a) one world property per record plus a counter (`claims:c:<id>`,
  `party:p:<code>`); (b) parts of 24,000 characters (`atlas_bp/scripts/main.js:221-233`); (c) one property per player
  plus a bounded index (`tools/owed-shared.js`, 1,000 players, 30,000 bytes each); (d) a bounded single list
  (`mail:roster`, `waystone:list`); (e) player-scoped properties for per-player data (`waystone:known`, `death:last`,
  `map:marks`, `admin:recent`).
- **Identity [V]**: everything keys on `player.id` and stores the name beside it for display; the name is refreshed
  when the player joins (`claims_bp/main.js:464-479`, `mail_bp/main.js:150-157`). A gamertag change keeps the id.
  Simulated test players get a new id on every spawn (test harness README, "Player identity").
- **Pruning [V]**: `tools/prune-shared.js` (copied as `scripts/prune.js` into Parties, Nicknames, Titles) drops
  records of players not seen for `days`, never treats a missing time as ancient, and re-reads state per entry.
  It is for world-scoped per-player records. Player-scoped properties need no pruning.
- A saved property can't be read before `world.afterEvents.worldLoad` (WORKING.md quirks).

---

## 3. Design

### 3.1 Pack decision: a new `waypoints_bp` ("Waypoints")

**Recommendation: a new pack, `packs/waypoints_bp`, name "Waypoints", key prefix `waypoints`.**

Why not fold it into `waystone_bp`:

1. Different model. A waystone is a block in the world that is discovered, can crumble and is found again by
   position (`waystoneAt`, the 5-second lodestone check). A waypoint is a saved coordinate with an owner and a
   visibility. Sharing code would be limited to the landing check.
2. `waystone_bp/main.js` is already 1,119 lines and also holds inns and news. Packs here are kept independent, each
   with its own docs section, settings page and version.
3. The owner can switch one off without touching the other (`enabled` in Realm Settings).
4. Saved data stays separate, so Pack diagnostics' **Forget this pack's saved data** can't take waystones with it.

**How the two coexist** (free, instant waypoints do undercut a paid, 10-second network; say so in the PR):

- Waystones stay as they are: built in the world, discovered on foot, party travel, the Pathfinder talent, Field
  Journal places, inns. Waypoints give none of those.
- Waypoints can only be saved where the player stands, so nobody can teleport somewhere they have never walked to,
  except through a public waypoint someone else shared.
- Operators get three dials in Realm Settings, all defaulting to "simple": `cost` (0 Crowns), `warmupSeconds` (0)
  and `cooldownSeconds` (0). A realm that wants waystones to matter sets a cost or a warm-up, or sets
  `whoCanAddPublic` to operators.
- The Travel screen of the new Realm Menu lists both: **Waypoints** (opens this pack) and **Waystones**
  (`/realm:waystones`). This pack does not read waystones. Merging waystones into the waypoint list is deliberately
  left out of v1: a waystone trip has a price and a channel, and mixing free and paid rows in one list is confusing.
- Follow-up worth a ROADMAP entry, not part of this work: once waypoints are live, look at whether waystone travel
  should get cheaper or `travelAnywhere` should be on.

### 3.2 Files

```
packs/waypoints_bp/
  manifest.json            new UUIDs, version 1.0.0, @minecraft/server 2.1.0, @minecraft/server-ui 2.0.0, min_engine 1.21.100 (as death_bp/manifest.json)
  pack_icon.png
  scripts/
    main.js                import "./diag.js" first; commands, forms, teleport, events
    config.js              CONFIG (table in 3.9)
    settings.js            PACK "waypoints_bp", PREFIX "waypoints", TITLE "Waypoints", OPTIONS; factory below the marker from sync-settings
    store.js               PURE (no @minecraft imports): parse/serialize, name cleaning, caps, reorder, lookups. Unit tested
    landing.js             PURE: the safe-spot search over a `read(x, y, z) -> typeId | undefined` function. Unit tested
    diag.js, diag-core.js  node tools/sync-diag.mjs
    script-events.js       node tools/sync-events.mjs
    settings-core.js       node tools/sync-settings.mjs
```

`landing.js`: Death Point already has this logic inline (`death_bp/main.js:18-68`, `:205-270`) and Waystones has a
regex version. C14 says a helper pasted into several packs becomes `tools/<name>-shared.js` with a sync tool. For v1
write it as `tools/landing-shared.js` + `tools/sync-landing.mjs` (a plain copy through `tools/lib/shared-copy.mjs`,
like `sync-gossip.mjs`) with `waypoints_bp` as its only consumer, add its `--check` to `npm run check`, and leave
moving `death_bp` onto it as a ROADMAP entry (it changes a shipped pack's behavior slightly and needs its own BDS run).
It may be added to `SHARED` in `tools/bundle.mjs:264` only when a second pack uses it and only because it has no
module-level state.

Recipe steps from CLAUDE.md "New pack" all apply: `realm:help_ping` responder, `sync-events`, `sync-diag`, a
`## Waypoints — \`waypoints_bp\`` section in `docs/PACKS.md` (How to use, What players see, Commands, Configuration,
Saved data, How it works), a README row, a mention in "How the packs work together", `release/notes.json`
(`notes` and `packNotes.waypoints_bp`), `docs/NEWS.md`, then `help-catalog.mjs`, `admin-catalog.mjs` (bump
`admin_bp`), `gen-news.mjs` last.

### 3.3 Data model

A waypoint record (short keys, as the other packs do):

```
W = { i, n, d, x, y, z, r, o, on, t }
  i   number   id, from the world counter waypoints:next; never reused; the same id whether private or public
  n   string   name, 1 to 24 characters after cleaning
  d   string   dimension id without "minecraft:": "overworld" | "nether" | "the_end" (C11)
  x,y,z number block coordinates of the feet block (integers); the jump goes to x + 0.5, y, z + 0.5
  r   number   yaw the player faced when saving, rounded to a whole degree (-180..180)
  o   string   owner's player.id
  on  string   owner's gamertag when last seen, ASCII-cleaned, at most 32 characters (display only)
  t   number   created, Unix seconds
```

`public` is not a field: it is which list the record is in. `order` is not a field: it is the record's position in
the public array. `icon` is left out of v1 (see 3.12); unknown fields on a record are kept when it is rewritten
(`unknownFields` in `tools/prune-shared.js:44` shows the style), so a later `c` (icon) field survives an older build.

**Keys**

| Key | Scope | Contents |
|---|---|---|
| `waypoints:pub` | World | JSON array of W, **in the order operators set**. New public waypoints are appended |
| `waypoints:next` | World | The next id (number) |
| `waypoints:mine` | Player | JSON array of that player's private W |
| `waypoints:back` | Player | JSON `{ d, x, y, z, r }`: where the player was before their last waypoint trip |
| `waypoints:pref` | Player | Player choices that differ from the realm's (written by settings-core) |
| `waypoints:cfg` | World | Settings changed in `/realm:config` (written by settings-core) |
| `waypoints:areas` | World | JSON list of temporary ticking areas in use (`<dim>|<name>`), removed on world load |

Why private lists live on the player: they follow `player.id` for free, are loaded only while that player is online,
never need pruning, and a thousand one-time visitors add nothing to the world store (C22). The cost: an operator
can't see or edit an offline player's private list, which nobody asked for.

**Limits (defaults; all in Realm Settings)**

| Limit | Default | Range | Notes |
|---|---|---|---|
| Private waypoints per player (`maxPrivate`) | 20 | 0 to 50 | 0 = no private waypoints |
| Public waypoints per player (`maxPublicPerPlayer`) | 5 | 0 to 20 | Operators are not held to it |
| Public waypoints on the realm (`maxPublic`) | 60 | 10 to 100 | Hard ceiling 100 in code |
| Name | 1 to 24 characters | fixed | Same as waystones (`waystone_bp/main.js:15`); 24 x 6 px = 144 px fits a button line (`LINE` 168) |

**Name cleaning** (`store.js` `cleanName`): drop `§` and the character after it, drop everything outside printable
ASCII `0x20-0x7E`, drop `"` and `\` (so `/realm:waypoints_go "Name"` always parses), collapse runs of spaces, trim,
cut to 24, trim again. Empty after cleaning: use the default name. Default name: the player's current Atlas region
when one is known and free (`The Quiet Fen`), else `Waypoint <n>` with the lowest free n.

**Duplicates**: names are unique, ignoring case, within the list they live in: the public list as a whole, and each
player's private list. `That name is taken: there is already a public waypoint named Spawn.` A private waypoint may
share a name with a public one; `/realm:waypoints_go` looks at the player's private list first. Two waypoints at the
same block are allowed.

**Size math** (JSON, ASCII only, measured with `JSON.stringify`): a worst-case record (24-character name,
32-character owner name, 20-digit id, 8-digit coordinates) is 193 bytes; a typical one is 133.

| List | Records | Worst case | Typical |
|---|---|---|---|
| `waypoints:mine` at the default cap | 20 | 3.9 KB | 2.7 KB |
| `waypoints:mine` at the highest cap | 50 | 9.7 KB | 6.7 KB |
| `waypoints:pub` at the default cap | 60 | 11.6 KB | 8.0 KB |
| `waypoints:pub` at the hard ceiling | 100 | 19.4 KB | 13.4 KB |

Everything stays under the 24 KB line where Pack diagnostics turns red and far under 32,767. No chunking is needed;
`store.js` still refuses a write whose JSON is over 30,000 bytes with a console warning and a chat line to the
player (never silently).

**Versioning and migration**: there is no earlier data. Readers accept any array, keep records that have a numeric
`i`, string `n` and `d` and finite `x`, `y`, `z`, and drop the rest with one console warning per load (the waystone
reader does the same, `waystone_bp/main.js:163`). A corrupt property starts an empty list **in memory only** and is
not overwritten until the next successful change, so a bad read can't erase the saved list by itself. A future shape
change adds fields; a breaking change would write a new key (`waypoints:pub2`) and migrate once on `worldLoad`, the
way Parties moved from `party:data` to `party:p:<code>`.

**Gamertag changes**: on `playerSpawn` with `initialSpawn`, rewrite `on` in `waypoints:pub` for records whose `o` is
this player and whose `on` differs (claims pattern). One write, only when something changed.

**Pruning**: none. Private lists are on the player. Public waypoints are places the realm chose to share; they stay
until their owner or an operator removes them, even when the owner stops playing. An operator can see the owner's
name on each row to decide.

**Caches**: `waypoints:pub` is parsed once on `worldLoad` and kept in memory; each online player's private list is
parsed on first use and dropped on `playerLeave`. Every write goes through one `savePublic()` / `saveMine(player)`.

### 3.4 Commands

| Command | Who | What it does |
|---|---|---|
| `/realm:waypoints` | Everyone | Opens the Waypoints menu |
| `/realm:waypoints_add [name] [public]` | Everyone | Saves where you stand. `name` String (quote names with spaces), `public` Boolean (default false). No name: the default name |
| `/realm:waypoints_go <name>` | Everyone | Teleports to the waypoint with that name: yours first, then public. Exact match ignoring case, else the only one that starts with it |
| `/realm:waypoints_back` | Everyone | Teleports to where you were before your last waypoint trip |
| `/realm:waypoints_admin` | Operators (`GameDirectors`) | Opens **Manage public waypoints** |

All are `cheatsRequired: false`, return `Success` at once and do the work in `system.run` (the pattern at
`waystone_bp/main.js:1010-1015`). Dynamic waypoint names can't be a command enum (enums are fixed at startup), so
`name` is a String. Removing and renaming stay in the menu: typed commands for them add catalog entries and docs rows
for little use. Each command needs a `NAMES` entry in `packs/admin_bp/scripts/presets.js` (two lines, each at most 168
px):

```
"realm:waypoints":       ["Waypoints", "Teleport to saved places"],
"realm:waypoints_add":   ["Add Waypoint Here", "Save this spot by name"],
"realm:waypoints_go":    ["Go to Waypoint", "Teleport there by name"],
"realm:waypoints_back":  ["Go Back", "To where you were before"],
"realm:waypoints_admin": ["Manage Public Waypoints", "Order, rename, remove"],
```

`PARAMS` entries: `realm:waypoints_add` -> `name: { placeholder: "e.g. Iron cave" }`, `public: { kind: "toggle",
label: "Public (everyone sees it)" }`. Until the Realm Menu redesign lands, add `waypoints_bp` to `GROUPS`:
"Friends, Crowns & Fun" has no travel section, so put it first in **Towns & Townsfolk** -> "Townsfolk and
travelers" (`presets.js:85`), next to `waystone_bp`.

### 3.5 Script events

| Event | Direction | Payload | Use |
|---|---|---|---|
| `realm:waypoints_open` | in | `{ player, page? }` | Opens the menu for that player id. `page`: `"list"` (default), `"add"`, `"mine"`, `"admin"`. This is what the Realm Menu's Travel screen sends. Any source may send it: it only opens a form, and every action behind the form is checked again |
| `realm:waypoints_ping` | in | `{ player? }` | Asks for the list broadcast below |
| `realm:waypoints_list` | out | `{ player, part, parts, list: [{ i, n, dim, x, z, p }] }` | The public waypoints (`p: 1`) and that player's private ones, for the Minimap. Parts under 1,800 characters (`sendKnown` pattern). Sent on a ping, when the player joins and whenever a list they can see changes |
| `realm:claims_check` / `_result` | out / in | as Land Claims documents | Asked when a waypoint is made public (3.8) |
| `realm:atlas_region` | in | `{ player, name }` | Remembered per online player (a Map, dropped on leave) for the default name and the "in <region>" hint. `realm:atlas_ping` is sent once, 140 ticks after `worldLoad`, the way Waystones asks for callings (`waystone_bp/main.js:1105`) |
| `realm:actionbar` | out | `{ player, ticks, from: "waypoints_bp" }` | Before every `setActionBar` (only the warm-up countdown uses the bar) |
| `realm:help_ping` | in | | Answer `realm:help_pong` `waypoints_bp` |

`realm:waypoints_open` must not open a second menu over a first: keep one "menu open" token per player (the
`begin()` pattern, `admin_bp/main.js:709-719`) and one lifecycle generation across the whole menu and its child
dialogs, bumped on leave, death, respawn and dimension change, so an old parent form can't reopen (C17 and the form
shim note in WORKING.md).

**How the star item opens it.** Two options, both small changes in `admin_bp/scripts/main.js`:

1. Today's menu: add, as the **first** entry of `mainMenu` (before My Preferences, `:537`),
   `if (has("realm:waypoints")) entries.push({ label: button("Waypoints", "Teleport to saved places", false),
   open: async () => { system.sendScriptEvent("realm:waypoints_open", JSON.stringify({ player: player.id })); } })`.
   Sending the event instead of `exec(player, "realm:waypoints", ...)` avoids the `Ran /realm:waypoints` chat line
   and keeps it out of Recent. The entry's promise resolves at once, the admin page closes (its `open` token is
   released in `begin`'s `finally`) and the waypoints form opens on the next tick.
2. The redesigned Realm Menu: the Travel screen sends the same event. If the Travel screen wants to come back when
   the waypoints menu closes, it should not: a teleport normally ends the interaction.

`tools/admin-item.test.mjs` (890 lines; it loads `admin_bp` with stubs) needs one new case: the Waypoints entry is
shown only when `realm:waypoints` is in the available commands, and picking it sends the event with the player's id.

### 3.6 Screens and copy

All forms are `ActionFormData`, `ModalFormData` or `MessageFormData`. No `.header()`. Section titles are
`.label("§l§6...")`. Text is ASCII plus `§` codes. Operator-only buttons are dark red `§4` (the house style,
`presets.js:102`). Every form goes through one `show()` that retries `UserBusy` and stops on `UserClosed`
(`waystone_bp/main.js:132-140`), and every handler re-validates by **id**, never by list position, after the form
returns.

Where a row shows a place: same dimension `240m NE` (the `where()` helper, `waystone_bp/main.js:60`); another
dimension its name (`Nether`, `The End`, `Overworld`); within 3 blocks `You are here`.

#### A. The list (`/realm:waypoints`, the star item, `realm:waypoints_open`)

```
Title:  §lWaypoints
Body:   Tap a waypoint to go there.
        [only when set]  Each trip costs 3 Crowns. You have 42 Crowns.
        [only when set]  Stand still for 5 seconds after choosing.
        [when both lists are empty]  No waypoints yet. Stand somewhere worth coming back to and tap Add a waypoint here.

Buttons, in order:
  Go back\n§8To where you were: 240m NE            (only when waypoints:back exists and backEnabled)
  Add a waypoint here\n§8Save this spot
  label  §l§6Public (12)
  <name>\n§8240m NE                                (one per public waypoint, in the operators' order)
  <name>\n§8Nether, yours                          (", yours" marks the player's own public ones)
  label  §l§6Mine (3)
  <name>\n§8You are here                           (the player's private ones, A to Z)
  divider
  More waypoints\n§8Page 2 of 2                    (only when there is another page)
  Manage my waypoints\n§8Rename, share, move, delete   (only when the player owns at least one)
  §4Manage public waypoints\n§8Order, rename, remove   (operators)
  Close
```

- **Order**: public first, in the operators' order (the owner's request), then the player's private ones A to Z.
  A to Z and not nearest first, because distance doesn't matter when you teleport and a list that keeps its order is
  easier to use from memory. The distance is on each row anyway.
- **Paging**: 40 waypoint buttons per page (the Minimap's `MENU_MAX`, `map_bp/main.js:189`; Nicknames pages at 20
  because long forms are slow to send, `nick_bp/main.js:333`). At the default caps the worst case is 60 + 20 = 80
  rows, two pages. Page 1 always starts with the public list. The label counts are for the whole list, not the page.
- **Empty sections** show the label and one text line: `§7Nobody has shared a waypoint yet.` / `§7You have no private waypoints.`
- With `enabled` off the command and event answer in chat `Waypoints are disabled on this realm. An operator can
  enable them in /realm:config (Waypoints).` (the Death Point wording).

#### B. Add a waypoint here

```
ModalFormData
Title:   Add a waypoint
Label:   §7Saves the spot where you stand: 120, 64, -340 in the Overworld.
Text:    Name            placeholder "e.g. Iron cave"    default: the default name
Toggle:  Public          tooltip "Everyone sees a public waypoint in the shared list. Private: only you."   default off
Label:   §7You have 3 of 20 private and 1 of 5 public waypoints.
Submit:  Save
```

Read the answers by filtering `undefined` out of `formValues` (labels take a slot; the map's mark form does this,
`map_bp/main.js:2411`). Checks, each with its own chat line and no waypoint saved:

| Check | Message |
|---|---|
| In an expedition (`realm_expedition`) or tagged `realm_no_teleport` | `§cYou can't save a waypoint here.` |
| Not on the ground: gliding, falling, riding, or the spot fails the landing check at radius 0 | `§cStand on solid ground to save a waypoint.` |
| Cap reached | `§cYou already have 20 private waypoints. Delete one first, or make this one public.` / `§cYou already have 5 public waypoints.` / `§cThe realm's public list is full (60).` |
| Name taken | `§cYou already have a waypoint named Iron cave.` / `§cThere is already a public waypoint named Spawn.` |
| Public is for operators (`whoCanAddPublic`) | The toggle is not shown; the label says `§7Only operators can add public waypoints here.` |
| Public inside someone else's land claim (3.8) | `§cThis land is claimed by Sam, so a waypoint here can't be public. It was saved as private.` (saved private when there is room, else refused) |

Success: `§aSaved the waypoint Iron cave (private). §7Open the star item or run /realm:waypoints to go back to it.`
or `§aSaved the public waypoint Spawn. Everyone can see it.` plus `player.playSound("random.orb", { pitch: 1.2 })`.
A new public waypoint is announced to everyone else online in one gray line: `§7Ann shared a waypoint: Spawn.`
(`announcePublic`, default on).

The position saved is the block the player's feet are in (`Math.floor` of `location`), `y` as is, yaw from
`player.getRotation().y`. Saving requires the same landing test the teleport uses, so a waypoint is safe on the day
it is made.

#### C. Tap a waypoint

Default: **no confirmation**. The form closes and the trip starts (3.7). Players who want a guard against a wrong tap
turn on **Ask before teleporting** in `/realm:prefs` -> Waypoints (player option `confirm`, default off):

```
MessageFormData
Title:    Spawn
Body:     Teleport to Spawn (Overworld, 240m NE)?
button1:  Teleport        button2:  Cancel
```

A non-owner can do exactly one thing with a public waypoint: go there. No favorites, no reports, no copy. (The
Minimap integration in 3.8 adds "point my compass there" from the Minimap's own menu, not from this one.)

#### D. Manage my waypoints

```
ActionFormData
Title:  My waypoints
Body:   Tap one to change it. You have 3 of 20 private and 1 of 5 public.
Buttons: <name>\n§8Private, 240m NE     |     <name>\n§8Public, Nether      ...  (public ones first, then private A to Z)
         Back
```

Tap one:

```
ActionFormData
Title:  Iron cave
Body:   Private. 120, 64, -340 in the Overworld (240m NE). Added 3 days ago.
Buttons:
  Go there
  Rename
  Make public\n§8Everyone will see it        |  Make private\n§8Only you will see it
  Move it here\n§8To where you stand now
  Delete
  Back
```

- **Rename**: `ModalFormData` title `Rename Iron cave`, one text field `Name` with the current name as default,
  submit `Rename`. Same cleaning and uniqueness rules. `§aRenamed to Copper cave.`
- **Make public**: moves the record from `waypoints:mine` to the end of `waypoints:pub` (same id). Checks the public
  caps, the public name rule and the claim rule. `§aSpawn is public now. Everyone can see it.` **Make private**:
  the reverse; checks `maxPrivate`. `§aSpawn is private now. Only you can see it.` A waypoint that became private is
  simply gone from everyone else's list.
- **Move it here**: `MessageFormData` `Move Iron cave to where you stand (130, 70, -300 in the Overworld)?`
  `Move it` / `Cancel`. Same checks as adding (ground, expedition, claim when public). `§aMoved Iron cave here.`
- **Delete**: `MessageFormData` title `Delete waypoint?` body `Delete Iron cave? This can't be undone.`
  `§cDelete it` / `Keep it`. `§7Deleted the waypoint Iron cave.`
- After each change the waypoint's page (or the My waypoints list after a delete) opens again.

#### E. Manage public waypoints (operators)

```
ActionFormData
Title:  Public waypoints
Body:   12 of 60. The order here is the order everyone sees.
Buttons:
  §4Arrange the list\n§8Change the order
  §4Sort A to Z\n§8One time; asks first
  label  §l§6Change one
  1. Spawn\n§8by Ann, 240m NE
  2. Market\n§8by Sam, Nether
  ...
  Back
```

Rows are plain (not red): the whole page is operators only, like Operator Tools. Position numbers are shown here and
nowhere else. Paged at 40 like the main list.

**Tap one**:

```
Title:  Market
Body:   Public, by Sam. 14, 70, 88 in the Nether. Position 2 of 12.
Buttons: Go there | Rename | Move it here | Move in the list | Make private (give it back to Sam) | Remove | Back
```

`Rename`, `Move it here` and `Remove` work as in D but on anyone's waypoint; the owner is told the next time they are
online only if they are online now (one chat line: `§7An operator renamed your public waypoint Market to Bazaar.`;
no stored notices in v1). **Make private** hands it back to its owner: possible only while the owner is online
(their private list is a player property); offline, the button reads `Make private\n§8Sam must be online` and does
nothing but say so. **Remove** asks `Remove the public waypoint Market (by Sam)? Everyone loses it.` `§cRemove it` /
`Keep it`.

**Reordering: "pick it up, put it down"** (the least taps for a move to anywhere with forms):

```
Step 1   Title: Arrange: pick one
         Body:  Tap the waypoint you want to move.
         Buttons: 1. Spawn | 2. Market | 3. Farm | ... | Done

Step 2   Title: Arrange: move Farm
         Body:  Where should Farm go? Tap the waypoint it should come before.
         Buttons: Before 1. Spawn | Before 2. Market | (Farm itself is left out) | Before 4. Mine | ... | At the end | Cancel
```

After step 2 the list is saved and step 1 opens again with the new order, until **Done**. Any move is two taps
however far it goes. A ModalForm with a dropdown per slot was considered and rejected: 60 dropdowns of 60 options is
unusable on a phone and makes it easy to pick the same waypoint twice. "Move up / Move down" alone costs one form
round-trip per step.

**Move in the list** (from one waypoint's page) is the same step 2 for that waypoint, plus two shortcuts above the
"Before..." buttons: `To the top` and `To the bottom`.

**Sort A to Z**: `MessageFormData` `Sort the public list A to Z? This replaces the order you set.` `Sort it` /
`Cancel`.

Rules for every operator action: the operator level is checked when the page opens and again right before the
change (`§cOnly operators can manage public waypoints.`, C24); the waypoint is looked up by id after each form, and
if it is gone `§7That waypoint is already gone.`; a move is applied to the **current** list (`store.js`
`moveBefore(list, id, beforeId | null)`), so two operators arranging at once can't lose or duplicate an entry.

Caps and rules are not a screen in this pack: they are the pack's page in Realm Settings (`/realm:config` ->
Waypoints), reached from the star item. The Manage page's body ends with `§7Limits and rules: /realm:config, Waypoints.`

### 3.7 Teleport rules

One function, `travel(player, target, label, opts)`, used by a waypoint tap, `/realm:waypoints_go` and Go back.

**1. Refusals, checked when the trip starts and again right before the jump** (first match wins):

| State | How it's read | Message |
|---|---|---|
| Pack disabled | `get("enabled")` | the disabled line |
| The waypoint is gone, or no longer visible to this player | by id in the current lists | `§7That waypoint is gone.` |
| Already traveling | a per-player `busy` entry | `§7You're already on your way to Spawn.` |
| In an expedition | `player.hasTag("realm_expedition")` | `§cYou can't use waypoints during an expedition. Leave it first (/realm:expedition_leave).` |
| Another pack says no | `player.hasTag("realm_no_teleport")` (new convention, 3.8) | `§cYou can't use waypoints right now.` |
| Asleep | `player.isSleeping` (`server.d.ts:6818`) | `§cGet out of bed first.` |
| Falling or gliding | `player.isFalling` (`:6788`), `player.isGliding` (`:12982`) | `§cLand first.` |
| In a fight | hurt by a mob or player in the last `combatSeconds` (5) | `§cYou're in a fight. Try again in 4 seconds.` |
| Other dimension, not allowed | `crossDimension` off | `§cWaypoints in another dimension are disabled on this realm.` |
| Cooldown | `cooldownSeconds` > 0 | `§cYou can use a waypoint again in 12 seconds.` |
| Can't pay | `cost` > 0, the shared `crowns` scoreboard read through a try/catch helper (C12) | `§cA waypoint trip costs 3 Crowns. You have 1 Crown.` |

**Combat** is event-driven: one `world.afterEvents.entityHurt` subscription filtered to players
(`{ entityTypes: ["minecraft:player"] }`, as `waystone_bp/main.js:580-584`) stores `system.currentTick` in a Map when
`damageSource.damagingEntity` is set (a mob or a player, including their projectiles). Falling, drowning and lava
do not count: a waypoint is allowed to get someone out of trouble on a friends' realm. Durations are game ticks
(C27). The Map entry is dropped on `playerLeave`.

**Riding**: a rider is not refused. Right before the jump, if `player.getComponent("minecraft:riding")` exists, call
`riding.entityRidingOn.getComponent("minecraft:rideable")?.ejectRider(player)` and jump on the next tick
(`ejectRider(rider)` is in the typings, `server.d.ts:9967` **[V]**; the read is the Chairs pattern, `chairs_bp/main.js:89`). If the player is still
riding then, refuse with `§cGet off first.` The mount stays. **[S]** `ejectRider` on a boat or a chair seat has not
been tried on BDS here; the scenario in 3.11 covers it.

**Pets, mounts, boats**: nothing comes along in v1. The docs say so in one line (`Pets and mounts stay where they
are: sit your pets before you go.`). Bringing leashed mobs is possible later (`minecraft:leashable.leashHolder`,
`server.d.ts:9038`) but only within a dimension and is not worth the edge cases now.

**2. Warm-up** (`warmupSeconds`, default **0** = jump at once). When above 0 it is the Waystones channel: chat
`§bTeleporting to Spawn in 5 seconds. §7Stand still.`, an action bar countdown once a second (`realm:actionbar`
first), canceled by moving more than 1 block, changing dimension or taking any damage (`§cYou moved: the trip to
Spawn is canceled.`). Unlike Waystones the 5-tick interval is started when the first warm-up begins and cleared when
the last one ends, so nothing runs while nobody is waiting.

**3. Loading and the safe landing.** The saved block may have changed. Use the Death Point method, which never puts
the player somewhere unchecked:

1. `landing.find(read, heightRange, { x, y, z }, radius, height)` over the destination dimension, where `read` is a
   `getBlock(...).typeId` inside try/catch (unloaded = `undefined`; wrap the reads too, C16). A spot is safe when feet
   and head are passable (air and no-collision plants, the explicit id set from `death_bp/main.js:18-51`; water is
   **not** passable, so nobody lands underwater), the block under it is not air, liquid, passable or bad ground
   (lava, magma, fire, campfires, cactus, berry bush, wither rose, powder snow, pointed dripstone), no lava or fire on
   the four sides, and `y - 1 >= heightRange.min`, `y + 1 < heightRange.max` (the void and the build limit).
   Search order: the saved block itself first, then nearest first within `safeSearchRadius` 2 and `safeSearchHeight`
   8, ties going **up** (a filled-in floor or a new building is the usual change). Result: a block, `"none"` or
   `"unloaded"`.
2. `"unloaded"`: add a temporary ticking area in that dimension (`tickingarea add circle x y z 1
   "waypoints_<base36 time><random>" true`), save its name in `waypoints:areas`, poll every 5 ticks for up to
   `loadSeconds` (5), remove the area in a `finally`, clean leftovers on `worldLoad` (all as `death_bp/main.js:313-349`,
   `:300-311`). Radius 1 is legal (circle areas take 1 to 4, WORKING.md quirks). While waiting, chat says nothing for
   the first second; after 20 ticks one line: `§7Loading Spawn...`.
3. If the ticking area can't be added (the world's 10 are in use: Farm Loader alone may hold 5,
   `farm_bp/scripts/config.js:8-9`), fall back to the Waystones method so the feature never just stops working:
   jump to the saved block, then check at 10, 40 and 100 ticks; if the player is inside a block, over a drop or in
   lava, move them to the nearest safe spot, or back to where they started with the cost refunded when there is none
   (`waystone_bp/main.js:729-765`).
4. `"none"`: no jump, nothing charged. `§cThere's no safe place to stand at Spawn any more (it may be filled in,
   flooded or gone). Nothing happened.` The owner or an operator can fix it with **Move it here**.
5. Jump: `player.tryTeleport({ x + 0.5, y, z + 0.5 }, { dimension, rotation: { x: 0, y: w.r }, checkForBlocks: true,
   keepVelocity: false })` (`TeleportOptions`, `server.d.ts:19690-19716`). `false` back: `§cThe teleport was blocked,
   so you weren't moved. Try again in a moment.`, nothing charged. When the safe spot is not the saved block, keep the
   saved yaw.

Order of effects on success: charge the cost (refund on a later failure, `refund()` as `waystone_bp/main.js:714`),
save `waypoints:back`, jump, then sound and message.

**4. Cross-dimension**: allowed by default (`crossDimension` true), no extra cost. The End is not special-cased; see
the open question in 3.12.

**5. Go back** (`backEnabled`, default on): before each waypoint jump (not before a Go back jump) the pack saves
where the player stood as `waypoints:back` when that spot passes the landing test at radius 0; otherwise the previous
value is kept. Go back runs the same `travel()` with that point as the target and, on success, **replaces
`waypoints:back` with the place it left**, so two taps swap between the two places. It obeys every rule above
(cost, cooldown, combat). It is cleared when the player dies (their death point is Death Point's business) so it
can't be used to return to the place they died for free unless they set off from there by waypoint.

**6. Sounds, particles, messages**: on arrival `player.playSound("mob.endermen.portal", { volume: 0.8 })` (the sound
Waystones uses, `waystone_bp/main.js:707`; reuse it at the same volume so no new C8 volume target is needed) and
chat `§aYou are at Spawn.` (with a cost: `§7Paid 3 Crowns.` on the same line). With a warm-up, the Waystones fade
(`player.camera.fade`, `waystone_bp/main.js:629-635`) half a second before the jump; with no warm-up, no fade and no
particles (instant should feel instant, and the destination chunk may not be drawing yet). Nothing is announced to
other players when someone teleports.

**7. Cooldown** (`cooldownSeconds`, default 0): from the last successful jump, in ticks, in memory (a restart clears
it).

### 3.8 Integrations

| With | What | Change needed in that pack |
|---|---|---|
| **Realm Configuration (star item)** | A first-class **Waypoints** entry that sends `realm:waypoints_open` (3.5); the five commands in `NAMES`, `PARAMS`, `GROUPS` | `admin_bp/scripts/main.js`, `presets.js`, regenerate `catalog.js`, bump `admin_bp` |
| **Minimap** | A new group **Waypoints** in **Pick a destination** (`choices()`, `map_bp/main.js:2415`), fed by `realm:waypoints_list` and asked for with `realm:waypoints_ping` next to the other pings (`:2782-2785`); kind `waypoint`, a fixed spot like `mark`. The gold star then points at the chosen waypoint. No new glyph, no change to the strip or radar | `map_bp/scripts/main.js`: one `EVENTS` entry, one case, one group, one ping; `tools/test-bds/examples/map.js` gets one more broadcast case. Its docs line 9 gains "Waypoints" |
| **Minimap, later** | Showing every public waypoint as an icon on the strip needs a new icon in the generated glyph font (`npm run gen:glyphs`, Side HUD) and a client check. Not in v1. The Minimap's own "My marked spots" (5, no teleport) stays; folding it into private waypoints is a later cleanup |
| **Death Point** | Not shown in this pack's list. It belongs on the Realm Menu's Travel screen as its own row (**Where I died** -> `/realm:death`), because the teleport is Death Point's (`backEnabled`, once per death) and its event carries no `y` | None |
| **Waystones** | A Travel row (**Waystones** -> `/realm:waystones`). Not merged into the waypoint list (3.1) | None |
| **Parties** | No teleport to a mate in v1: it needs the mate's consent, and Parties has none of that today. A Travel row can open `/realm:party`. If wanted later it is a Parties feature (`ask to come to you`, accept within 60 s) that can reuse this pack's `landing.js` | None |
| **Story objective** | Never a teleport target (it would skip the walk the story is built around). The compass star already points at it (`realm:track`) | None |
| **Expeditions** | The `realm_expedition` tag blocks using and saving waypoints (3.7, 3.6 B) | None |
| **Deck of Many Things** | Gap today: nothing tells other packs a player is in the Deck's arena. New convention: any pack may put the tag `realm_no_teleport` on a player while they must not be moved; this pack honors it from day one. Adding and removing the tag in `domt_bp` (arena start and every way out, with cleanup on join like `expedition_bp/main.js:3792`) is a small follow-up PR. Document the tag in "How the packs work together" |
| **Land Claims** | Private waypoints: allowed anywhere you can stand. Public ones (add, make public, move here): ask `realm:claims_check` for the 1-block box at the spot; if the answer lists a claim the player may not build in, the waypoint is not made public (`This land is claimed by Sam...`). No answer within 20 ticks means Land Claims isn't installed: allow. Claims are disabled by default, and then the answer is empty. Operators follow the same answer (`operatorsBypass` is Land Claims' own switch). A public waypoint that was made before a claim covered it stays; the claim owner asks an operator | None |
| **Safe Zones, towns** | No rule. Zones are about world events | None |
| **Atlas** | The default name and nothing else (`realm:atlas_region`) | None |
| **Crowns** | Only when `cost` > 0: the shared `crowns` scoreboard, read and written with the helpers Waystones uses (`waystone_bp/main.js:80-108`) | None |
| **Welcome** | A line in `GENERIC.lines`: `waypoints_bp: "Waypoints to save places and teleport back (§b/realm:waypoints§r)"` (`welcome_bp/scripts/config.js`, the `lines` map; the docs table at `docs/PACKS.md:435` area lists each) | `welcome_bp/scripts/config.js`, its docs rows, bump |
| **/realm:help** | Generated from the PACKS.md section's summary, `### How to use` and Commands table: run `node tools/help-catalog.mjs` last | bumps `help_bp` |
| **Set up this world** | Optional step "A public waypoint at spawn" in `SETUP` (`presets.js:401`), done when `waypoints:pub` has an Overworld entry within 48 blocks of world spawn (answer a ping the way Waystones does for its step). Nice to have, not required | `admin_bp` |
| **Realm News** | New top entry in `docs/NEWS.md` (ASCII), for example: |

```
## Waypoints

- New: Waypoints. Use your star item (or /realm:waypoints) to save the spot where you stand and teleport back to it later.
- Make a waypoint public and everyone sees it in the shared list. Private ones are yours alone.
- Go back takes you to where you were before your last trip.
- This replaces the old Waypoint Menu item. Your old waypoints did not move over: visit them once and add them again.
```

**How to use** text for the PACKS.md section (and so `/realm:help`), operators last:

1. Use your star item and pick **Waypoints**, or run `/realm:waypoints`.
2. Stand where you want to come back to and tap **Add a waypoint here**. Give it a name. Leave **Public** off to
   keep it to yourself, or turn it on so everyone sees it.
3. Tap a waypoint in the list to teleport there. Public waypoints come first, then yours.
4. **Go back** takes you to where you were before your last trip.
5. **Manage my waypoints** renames one, makes it public or private, moves it to where you stand, or deletes it.
6. Pets and mounts stay where they are. You can't use waypoints during an expedition, in a fight, or while falling
   or gliding.
7. **Operators:** **Manage public waypoints** sets the order everyone sees (**Arrange the list**: tap one, then tap
   where it goes), and renames, moves or removes any public waypoint. `/realm:config` -> **Waypoints** sets how many
   waypoints players may keep, who may add public ones, and an optional cost, wait and cooldown.

### 3.9 Configuration (`scripts/config.js` -> `CONFIG`)

| Option | Default | In `/realm:config` | Description |
|---|---|---|---|
| `enabled` | `true` | bool | Waypoints for the whole realm. Disabled: the commands only say so; everything saved is kept |
| `whoCanAddPublic` | `"everyone"` | enum `everyone` / `operators` ("Everyone", "Operators only") | Who can make a waypoint public |
| `maxPrivate` | `20` | int 0 to 50 | Private waypoints per player |
| `maxPublicPerPlayer` | `5` | int 0 to 20 | Public waypoints per player (operators are not held to it) |
| `maxPublic` | `60` | int 10 to 100, step 5 | Public waypoints on the realm |
| `crossDimension` | `true` | bool | Teleport to a waypoint in another dimension |
| `warmupSeconds` | `0` | int 0 to 30 | Seconds to stand still before the teleport (0 = at once) |
| `cooldownSeconds` | `0` | int 0 to 600, step 5 | Seconds between trips |
| `combatSeconds` | `5` | int 0 to 30 | No waypoints this long after a mob or player hurt you (0 = allowed in a fight) |
| `cost` | `0` | int 0 to 100 | Crowns a trip costs (0 = free; needs the Crowns pack to mean anything) |
| `backEnabled` | `true` | bool | The **Go back** button and `/realm:waypoints_back` |
| `announcePublic` | `true` | bool | Tell everyone online when a waypoint is shared |
| `safeSearchRadius` | `2` | config.js only | Sideways search for a safe spot (blocks) |
| `safeSearchHeight` | `8` | config.js only | Up and down search (blocks) |
| `loadSeconds` | `5` | config.js only | How long to wait for a far waypoint to load |

Player preference (`/realm:prefs` -> Waypoints): **Ask before teleporting** (`confirm`, bool, default off).

Lowering a cap never deletes anything: players over the cap keep what they have and can't add more.
`check-docs` requires every option above in the PACKS.md Configuration table (CLAUDE.md "Docs stay current").
No Server size (Small Realm / Large server) entries are needed: nothing here scales with players.

### 3.10 Retiring the third-party add-on

Our scripts can't read another add-on's saved data (dynamic properties are per add-on, WORKING.md quirks), so the
move is by hand. Steps for the owner, in order:

1. **Ship Waypoints first** and leave the old add-on on for a few days. Both can run together: different items,
   different data.
2. **Tell players** (the Realm News entry above does it): open the old **Waypoint Menu**, teleport to each waypoint
   that matters, and add it again in the star item -> **Waypoints**. Each player must do their own private ones;
   nobody else can see them.
3. **Operator: move the shared ones.** Open the old add-on's public and featured lists, visit each, and add it as a
   **public** waypoint. Then **Manage public waypoints** -> **Arrange the list** to set the order. Operators aren't
   held to the 5-per-player cap, so one operator can re-add them all.
4. **Before removing the add-on, get rid of its items.** The Waypoint Menu item is locked by default. In the old
   add-on's Control Panel turn off "give the item on first join", and have each player unlock the item in the old
   menu's preferences and throw it away; operators do the same with the **Waypoint Control Panel** item. **[S]** If
   the items are the add-on's own custom items they should vanish from inventories when the add-on is removed; if
   they are locked vanilla items they would stay, undroppable, and an operator would have to `/clear` them. Check on
   one player before removing the add-on for everyone.
5. **Remove the add-on**: Realm settings -> the world's behavior packs and resource packs -> deactivate
   **Multiplayer Waypoint System** in both lists. Leaving it out is enough; its saved data stays in the world unused.
6. **Experiments** (`/home/user/hosting/minecraft/site/catalog.json:574-590` **[V]**):
   - **Beta APIs: leave it on.** "Holograms on dropped items" still needs it (`catalog.json:578`).
   - **Experimental Cameras: only the waypoint add-on is listed as needing it** (`catalog.json:580`). Dynamic
     Lightning, Armored Elytras, Bedrock Essentials+ and Firewolf list no needs. It can be turned off, but there is
     no gain in doing so and on a Realm it means downloading the world, editing it and uploading it back **[S]**.
     Recommended: leave it on for now and change only the website text; turn it off the next time the world is
     re-uploaded for another reason.
   - The Realm Bundle and Realm Resources need no experiments (realm page chip, `site/realm/index.html:182`).
7. **Website** (`nishant/hosting`, `minecraft/site/catalog.json`, one entry per line, then the realm-only check
   `node tools/check-site.mjs realm`):
   - delete the behavior pack entry at line 580 and the resource pack entry at line 590 (and the trailing comma on
     the line before each, lines 579/581 and 589);
   - line 574: keep `["Beta APIs", "Experimental Cameras"]` while the experiment is still on, change to
     `["Beta APIs"]` only after it is really off;
   - line 576, the Realm Bundle's `does`: add `waypoints` to the list (for example after `death point`).
   The pack's own docs reach the realm page through `pack-docs.mjs` in the release workflow; nothing by hand.
8. `docs/SERVER_SETUP.md` in mc-packs: one line under the pack list (no setup needed, no experiments).

### 3.11 Tests

**Unit tests** (`node --test`, pure modules imported straight from the pack, the pattern of
`tools/mail-policy.test.mjs` and `tools/crowns-ledger.test.mjs`):

`tools/waypoints-store.test.mjs` (imports `packs/waypoints_bp/scripts/store.js`):
- `cleanName`: strips `§` codes, non-ASCII, quotes and backslashes; collapses spaces; cuts to 24; empty -> default.
- Default names: region when free, else the lowest free `Waypoint <n>`.
- Uniqueness ignores case, per list; a private name may equal a public one.
- Caps: private, public per player, realm; operators skip only the per-player public cap; a lowered cap blocks adds
  and deletes nothing.
- `moveBefore(list, id, beforeId | null)`: to the top, to the end, before a neighbor, onto itself (no change), an id
  that is gone (no change, reports it), a `beforeId` that is gone (goes to the end). The result always has the same
  ids exactly once.
- `sortAZ` is stable and ignores case.
- Public <-> private keeps the id and every unknown field.
- Parse: a corrupt string gives an empty list **and a flag that stops the next save from overwriting it**; records
  missing required fields are dropped; extra fields survive a round trip.
- Size: 100 worst-case records serialize under 24,000 bytes; a write over 30,000 is refused, not truncated.
- `resolve(name, mine, pub)`: exact before prefix, private before public, an ambiguous prefix returns nothing.
- `listParts(items)`: every `realm:waypoints_list` message is under 2,048 characters; `parts: 0` for an empty list.
- `pageOf(rows, page, 40)`: page 1 starts with the public list; counts are for the whole list.

`tools/waypoints-landing.test.mjs` (imports `landing.js` with a fake `read`):
- The saved block is chosen when it is safe.
- Filled in with stone: the first open spot above. Floor removed: a spot within the search, never mid-air.
- Lava or fire under or beside the spot is refused; water at feet height is refused.
- Void and build limit: `y - 1 < min` and `y + 1 >= max` are refused.
- Any unreadable block in the candidates gives `"unloaded"`, not `"none"`.
- Nearest first, ties go up.

`tools/admin-item.test.mjs`: the Waypoints entry (3.5).

The existing checks then cover the rest for free: `check-commands` (namespace), `check-docs` (commands and options
documented), `check-ascii` (no `.header(`, ASCII), `check-events` (message sizes), `check-actionbar`,
`check-event-guards`, `admin-catalog --check` (button widths), `check-versions`.

**BDS scenarios** (`tools/test-bds/examples/`, each with the header recipe `suite.mjs` reads; forms are answered by
label with `t.waitForm` / `form.answer`, commands with `t.cmd`):

| File | Packs | What it proves |
|---|---|---|
| `waypoints-basic.js` | `waypoints_bp` | Add private and public by form and by command; the list shows Public before Mine with counts; a second player sees the public one and not the private one; tap teleports within 1 block of the saved spot, facing the saved yaw; Go back returns and swaps; rename, make public, make private, move here, delete; name and cap refusals with their messages |
| `waypoints-admin.js` | `waypoints_bp` | A non-operator never gets the red button and `realm:waypoints_open { page: "admin" }` refuses them; Arrange (pick, then "Before...") gives the expected order for top, middle and end moves; a de-op between the two forms changes nothing; remove and rename someone else's public waypoint; Sort A to Z; two operators arranging at once lose nothing |
| `waypoints-unsafe.js` | `waypoints_bp` | After saving: fill the spot with stone (lands above), remove the floor (lands beside or refuses), put lava there (refuses, nothing charged, player not moved). A far waypoint (2,000 blocks, unloaded) loads through the temporary ticking area and no area is left afterwards (`tickingarea list` in the log, and `waypoints:areas` empty). With 10 ticking areas already in use, the fallback path still lands safely |
| `waypoints-rules.js` | `waypoints_bp`, `expedition_bp` or a hand-set tag | `realm_expedition` and `realm_no_teleport` block use and saving; a hit from a spawned zombie blocks for `combatSeconds` and then allows; `warmupSeconds` 3: moving cancels, standing still arrives; `cooldownSeconds`; `cost` with the `crowns` objective (charged once, refunded on a blocked landing); a rider is dismounted (boat, and a chair with `chairs_bp`); Nether waypoint from the Overworld and back |
| `waypoints-restart.js` | `waypoints_bp` | Public order, ids and `waypoints:next` survive `t.restart`; a ticking area left by a kill during loading is removed on the next start. Private lists can't be checked across a restart with simulated players (they get a new `player.id` each spawn, README "Player identity"): say so in the header |
| `waypoints-claims.js` | a two-pack mini bundle with `claims_bp` (the `storm-rod-claims.js` method) | A public waypoint in someone else's claim is refused or saved private; in your own claim it is allowed; with claims disabled it is allowed |
| `map.js` (extend) | `map_bp` + `waypoints_bp` | `realm:waypoints_list` fills the **Waypoints** group; picking one sets the star |
| `admin-menu.js` (extend) | `admin_bp` + `waypoints_bp` | The Waypoints entry opens this pack's list and prints no `Ran /...` line |
| `bundle-smoke.js` (extend) | the Realm Bundle | `/realm:waypoints` opens in the one-context bundle |

**Performance**: the pack registers no always-on `runInterval`. Its standing subscriptions are `entityHurt` for
players (one Map write when a mob or player hits someone), `playerLeave`, `playerSpawn`, `worldLoad` and the script
event dispatcher (which wakes on every `realm:` event like every pack's does). Intervals exist only while a far
waypoint is loading (5-tick poll, at most `loadSeconds`) or a warm-up is counting (5-tick step), and are cleared
when the last one ends. Expected cost in `suite.mjs --perf 10,40`: indistinguishable from 0 ms a tick, well under the
0.15 ms budget for a typical pack. No new perf scenario is needed; the every-pack soak in `validate.yml` will show
it as a row. Opening the list is one JSON parse of a cached array and one form.

### 3.12 Risks and open questions, with a recommended default

| # | Question or risk | Recommended default |
|---|---|---|
| 1 | Free instant waypoints make the paid Waystone network mostly redundant | Ship waypoints free and instant as asked. Keep Waystones as is. The dials (`cost`, `warmupSeconds`, `cooldownSeconds`, `whoCanAddPublic`) exist if the owner wants friction later. Revisit Waystone pricing after a few weeks |
| 2 | A public waypoint in the End or deep in the Nether lets others skip the trip there | Allow it (a friends' realm; someone had to walk there first). An operator can remove a public waypoint or set `crossDimension` off |
| 3 | Escaping danger: falling, drowning and lava don't count as "in a fight" | Allow. Only damage from a mob or player blocks for 5 seconds; falling and gliding block by themselves |
| 4 | The temporary ticking area shares Bedrock's 10 per world | Use it (radius 1, at most 5 s), fall back to teleport-then-check when it can't be added. Document it in the Farm Loader list of who shares the budget |
| 5 | `ejectRider` behavior for boats, minecarts and chair seats is untested on BDS **[S]** | Cover it in `waypoints-rules.js`; if it misbehaves, refuse with `Get off first.` instead |
| 6 | Whether a teleport clears fall distance **[S]** | Falling is refused, so it doesn't matter |
| 7 | The Deck arena (and any future instanced content) has no "don't move this player" signal | Introduce the `realm_no_teleport` tag now, honor it here, add it to `domt_bp` in a follow-up |
| 8 | Operators can't see or clean up an offline player's private waypoints | Accept. Pack diagnostics' "Forget this pack's saved data" is the big hammer |
| 9 | A public waypoint's owner leaves the realm for good | It stays; any operator can rename, move or remove it. No ownership transfer in v1 |
| 10 | Icons and colors per waypoint (players had them in the old add-on) | Not in v1. `ActionFormData.button(text, iconPath)` (`ui.d.ts:119`) takes vanilla texture paths with no resource pack **[S: paths not checked on a client]**; a later version can add an optional `c` field and a dropdown of about a dozen icons |
| 11 | Old waypoints can't be migrated | Manual steps in 3.10; run both add-ons side by side for a few days |
| 12 | The old add-on's locked items after removal **[S]** | Unlock and drop them before removal; test on one player first |
| 13 | The Realm Menu redesign is in flight in parallel | This pack depends only on `realm:waypoints_open` and its commands. Add the entry to today's `mainMenu` so the feature ships regardless; the redesign moves it to the Travel screen |
| 14 | Naming clash: the Minimap calls its destination a "waypoint" in code (`map:wp`) | No player-facing clash (its menus say "destination"). In docs, always "destination" for the Minimap and "waypoint" for this pack |
| 15 | The Minimap's "My marked spots" now overlaps private waypoints | Leave it in v1; ROADMAP entry to replace marks with the Waypoints group |
| 16 | Should tapping a waypoint ask first? | No (the owner: "when you select it you tp there"). A per-player **Ask before teleporting** switch, default off |
| 17 | Should private lists be nearest first like every other list in the realm? | A to Z: the order should not move under the player's thumb, and distance is beside each name |
| 18 | `realm:waypoints_open` can be sent by anything, including a command block | Harmless: it opens a menu for that player and nothing else. No `sourceType` check (the `realm:zones_open` precedent has none) |
| 19 | 32,767-byte limit is taken from repo comments, not the typings | The design never goes above 20 KB per property and refuses writes above 30,000 bytes |
| 20 | Experiments on the Realm | Leave both on; update the website when one is really turned off |

### 3.13 Suggested order of work

1. `store.js`, `landing.js` and their unit tests.
2. The pack: commands, list, add, teleport with the landing check, Go back, manage, admin screens, settings.
3. BDS scenarios `waypoints-basic`, `-admin`, `-unsafe`, `-rules`, `-restart`.
4. `admin_bp` entry and presets; `map_bp` group; `welcome_bp` line. Each bumps its version and gets `packNotes`.
5. Docs: PACKS.md section, README row, "How the packs work together" (the new events and the `realm_no_teleport`
   tag), SERVER_SETUP, NEWS; then `sync-diag`, `help-catalog`, `admin-catalog`, `gen-news` last.
6. Review before merge (the merge is the first publish). After the release run is green: the hosting
   `catalog.json` edit (3.10 step 7) and the owner's manual steps.
7. Follow-ups for ROADMAP: `realm_no_teleport` in `domt_bp`; `death_bp` onto `landing-shared.js`; Minimap marks ->
   Waypoints group; icons; a "come to me" request in Parties; a look at Waystone pricing.
