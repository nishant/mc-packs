# Living towns: design note (F36-F41)

Owner request of October 19 (FIXES.md, "Feature: living towns"): a mayor per town, project spots picked
automatically, towns that grow with player progress, residents, houses and small life. This note is the design
asked for by FIXES.md (saved data, options and defaults, entity counts, per-tick cost, migration), written against
`int23` (`cb86c73`). It is the contract for the build steps at the end; a step that has to deviate records why in
its commit and in the "Decisions" table here.

Packs: **town_bp** (owner of towns, spots, builds, residents), **npc_bp** (mayor entities, labels, skins,
gossip), **wander_bp** (nothing changes in it: town_bp reuses `tools/spawn-shared.js`, the same spawn check wander,
saga and atlas use). Read but not changed: saga_bp (cast id `bram`, `realm:place_ready`), claims_bp
(`realm:claims_check`), zones (`realm:zones`), quests/goals/guilds (`realm:quest_done`, `realm:rep_add`).

Priorities, in order: no bugs and no item or block loss; performance; UX.

## 1. What exists today (int23)

- `town:t:<id>`: `{ id, n, dim, x, y, z, lvl, spots: { <project>: Spot }, by, at, prot? }`. Spot `{ x, y, z, f, snap?, b?, old? }`.
  `town:p:<town>:<project>`: `{ got, c, done, built }`. `town:owed:*`: rewards for offline contributors.
- Builds wait for an operator spot (`/realm:town_spot`). `build()` runs in one tick, snapshots the footprint as the
  structure `town:<town>__<project>` first, and `placeDesign()` replaces only air, `PLANTS`, `GROUND` (grass, dirt)
  and water for a dock. Remove spot restores the snapshot block by block, keeping blocks players added.
- Mayors: any townsfolk with the role `mayor` (in practice only Bram) answers `realm:npc_talk` with the nearest town
  within `townRadius` (96) of the **player**. A second town has a mayor only if the player stands in it.
- npc_bp's cast is fixed (`CONFIG.townsfolk`, 12 ids). Posts in `npc:list`, skins as structures `realm_npc:<id>`,
  "one of each" by the `realm:npc_id:<id>` tag, missing ones respawned every 2 s check when a player is near.

## 2. Data model

All keys keep each pack's own prefix (one store in the bundle). Every new field is optional, so a v1 record still
reads; a record is upgraded in memory on read and written back only when something about it changes.

### town_bp

| Key | Shape | Bound |
|---|---|---|
| `town:t:<id>` (existing) | adds `v: 2`, `m` (mayor npc id: `"bram"` or `"mayor:<id>"`), `mn` (the mayor's name for `mayor:<id>`), `scan?: string[]` (projects still to get a spot, D22), `rt?: string[]` (spot failed its check once), `as?: 1` (projects queued once), `plf?: 1` (placed cells full), `log?: [day, text][]` (the town's story), `nos?: string[]` (projects with no valid automatic spot) | `log` 12 entries, text 60 chars; whole record checked under `PROP_LIMIT` (30,000) |
| Spot (inside the town) | adds `a?: 1` (picked automatically), `lv?: string` (grading plan, below), `bs?: 1` (build started, not finished) | `lv` at most (w+4) x (d+4) chars: 15 x 17 = 255 for a house |
| `town:p:<town>:<work>` (existing shape) | town works (`house_1`..`house_10`, `pen`) reuse the progress record with `done: 1`, no `got`/`c` | 11 per town |
| `town:r:<town>` (new) | `{ n: next resident number, r: [{ i, n, h, e?, p, d? }], new: string[] }`: resident number, name, home (work id or `"well"`), entity id, profession look, `d` = absolute time (ticks) a replacement is due | `r` at most `residentCapTown` (10), `new` 3 names |
| `town:pl:<town>:<k>` (new, k = 0..1) | blocks of natural kinds that players placed in the town, as 4 x 4 x 4 cells, packed base36 | 2 properties x 2,500 cells; full: the oldest are dropped and the town is marked `plf: 1` (see 4.3) |
| `town:w:<town>` (new) | `{ <work or project>: packed cells }`: path blocks and lantern posts the town laid, for Remove spot | 48 path cells + 4 posts per project |

Town works are not in `CONFIG.projects`: they take no deliveries, pay no rewards, send no `realm:quest_done` and
do not count for leveling. Code that loops over buildable things uses `ALL = PROJECTS + WORKS`; leveling, menus of
deliveries and rewards keep using `PROJECTS`.

The grading plan `lv`: the build's region (footprint plus a 2-block apron) row by row, x then z in world
directions after rotation, one char per column: `.` untouched, `0`..`6` = the column's new ground top at `pad - 3`
.. `pad + 3`, where `pad = s.y - 1`. The plan is computed once when the spot is picked, so a build (and a build
resumed after a restart) never has to tell its own fill from natural ground again.

### npc_bp

| Key | Shape |
|---|---|
| `npc:list` (existing) | town mayors are ordinary `Placed` records with id `mayor:<townId>` |
| `npc:mayors` (new) | `{ "mayor:<townId>": { n: name, t: townId, tn: town name } }`, at most 64 mayors (one per town; a 65th is refused with an error reply) |
| skins | structure `realm_npc:m_<townId>` for a mayor (`:` is not allowed twice in a structure id); the cast keeps `realm_npc:<id>` |

`load()` keeps a `mayor:*` record only if `npc:mayors` has it (today it drops ids not in config.js; a mayor would
be removed by the audit). `folkOf(id)` replaces `folk.get(id)`: the cast entry, else a Townsfolk built from
`CONFIG.mayorTemplate` (greetings and idle lines with `{town}` filled in), roles `["mayor"]` only (never
`questgiver`: Story Questlines' favors and chapters stay with the cast). Affinity, gifts, keepsakes, letters and
"Ask about..." are for the cast only (`npc:aff` per player would otherwise grow with every town).

## 3. F36 A mayor per town

### Protocol (town_bp -> npc_bp, all under 300 characters)

- `realm:npc_mayor { op: "set", id, name, town, tn, dim, x, y, z, yaw }`: create the mayor, or move it. npc_bp puts
  it on the nearest standable spot within 3 blocks of x, y, z (its `standingSpot` rules), spawns it like any
  townsfolk (`spawnChecked`, tags, label, skin snapshot on first load).
- `realm:npc_mayor { op: "rename", id, name, tn }`, `{ op: "remove", id }` (entity, label, skin and record go).
- `realm:npc_mayor_ack { id, op, ok, error? }` answers every request ("world still loading", "too many mayors").
- `realm:npc_mayors { part, parts, ids }` from town_bp at load (parts under 2048): npc_bp removes `mayor:*` records
  that are not listed, but only after it got a complete list (a missing town_bp leaves its mayors alone).
- town_bp learns which mayors stand where from the existing `realm:npc_places` (it sends `realm:npc_places_ping`
  at load, and npc_bp sends on every change).

### Who answers for a town

- `realm:npc_talk` with `npc === t.m` for some town t: offer **Town projects (t)** wherever the player stands.
- Also, from any mayor (`roles` includes `mayor`): the town the player stands in (`townRadius`), if that town's
  own mayor is not placed (the 96-block rule as fallback). Two buttons at most, their own town first.
- A `mayor`-role townsfolk an operator added in config.js (not `bram`, not `mayor:*`) keeps today's rule.

### Creating mayors

- `addTown`: the town gets `m = "mayor:<id>"` (or `"bram"` when it is the realm's first town and Bram is not mayor
  of another town), a name from `CONFIG.mayorNames` (not used by another town; then "Mayor <Town>"), and
  `realm:npc_mayor set` at the town's center, facing the operator.
- A town whose mayor is missing from `realm:npc_places` gets `set` again when a player is within `townRadius`
  (checked on the existing 100-tick build interval, at most one request per town per 30 s).
- `/realm:town` (operators, in a town): **Mayor**: move here (where the operator stands, facing their way), rename
  (24 chars, ASCII), and for Bram: move here only (sends the existing `realm:npc_summon`; his name is the story's).
  A new mayor faces the way the operator faces (as `/realm:npc_add` does); one asked for again because Townsfolk lost
  its record comes back at the town's center facing south (D15).
- Remove town: `realm:npc_mayor remove` for `mayor:*`; Bram is never removed (he stays where he is, and the next
  town added becomes his if he has none).

### Migration of existing worlds (Bram keeps his town)

At load (+100 ticks) a v1 town list has no `m`. town_bp pings `realm:npc_places`; the 100-tick interval migrates as
soon as a complete answer is in (D12):

1. Bram's town = the town in Bram's dimension whose center is nearest Bram's post, within `townRadius`.
2. Bram placed but no town within reach, or Bram not placed: the oldest town (smallest `at`) is Bram's
   ("the mayor of the first town"). It gets no `mayor:*`; the fallback rule still lets Bram serve it as today.
3. No `realm:npc_places` answer (Townsfolk not installed): nothing is written. Until an answer comes, everything
   works as today.
4. Every other town gets `m = "mayor:<id>"`; its mayor is spawned the next time a player comes within its radius.
Spots, progress, owed rewards, snapshots and contributors are not touched. `v: 2` is written with `m`.

Skins: the stable API cannot set an NPC skin (`minecraft:skin_id` is read-only in 2.1.0). A new mayor starts with
the default NPC skin; an operator picks one in the NPC editor (sneak-tap in creative) and npc_bp's existing skin
snapshot keeps it through respawns. Shipping skin structures in the pack is possible later (decision D3).

## 4. F37 Project spots chosen automatically

### 4.1 When

- A town is added, or reaches a new level: the projects of that level (and town works due at it) without a spot are
  queued for a scan (their ids in `t.scan`, saved; D22).
- Existing towns: on the first scan after the update, projects of the current level and finished projects without a
  spot. Spots operators set are never moved.
- The scan runs only while a player is within `townRadius` of the town (its chunks are loaded); otherwise
  `t.scan` waits. One scan in the world at a time; a queue of town ids.

### 4.2 Columns: what the scan reads

`col(x, z)` (cached per scan, a Map with a numeric key, dropped when the scan ends):

1. `dim.getTopmostBlock({ x, z })` in a try/catch around the call **and** the reads (C16); undefined, y 319, or a
   throw: `U` (unknown, not loaded).
2. Walk down from the top through `PLANTS`, `snow_layer` and natural leaves (below) to the first solid block: that
   block's y is the column's ground `g`, its type the ground type. If the block above `g` is water (C15:
   `getTopmostBlock` skips water), the column is `W` with surface `w` (walk up through water).
3. Kind: `N` natural ground, `W` water, `T` tree (a log anywhere above `g`, or natural leaves over a log within 2
   blocks), `M` man-made (any other block at or above `g`, including a solid block above an air gap: a roof, an
   overhang, a dirt hut's ceiling), `L` lava.

About 2 to 4 native calls a column (about 20 to 40 us).

### 4.3 "Placed" blocks: what the stable API can know

It can't tell a placed block from a natural one: a block has no owner or history. The rule is therefore
conservative, in layers:

1. **Allow list, not deny list.** Natural ground: `grass_block, dirt, coarse_dirt, podzol, mycelium, dirt_with_roots,
   mud, sand, red_sand, gravel, clay, stone, granite, diorite, andesite, deepslate, tuff, calcite, sandstone,
   red_sandstone, snow, snow_layer` (ids checked with `@minecraft/vanilla-data`). Replaceable on top: the wild
   plants already in `PLANTS`. **Every other block is man-made**, which covers everything F37 lists (planks, glass,
   wool, concrete, torches, doors, beds, rails, containers, signs, farmland, `grass_path`, a waystone's lodestone)
   and anything a future update adds. Farmed plants (crops, saplings, sugar cane, bamboo, cactus, pumpkin, melon,
   sweet berry bush, flower pot) are man-made. Cobblestone and terracotta are man-made (players place them most).
2. **Leaves:** natural only with `persistent_bit` false (Bedrock sets it on leaves a player places). Logs are never
   touched and a column with one is `T`, so a spot never cuts a tree (that answers "leaves only if no log is
   player-placed": no log is ever removed, and natural leaves are only cleared where no log is within 2 blocks).
3. **Shape:** a solid block over an air gap anywhere in the region is man-made (catches huts and roofs made of
   natural blocks).
4. **Placed from now on:** `world.afterEvents.playerPlaceBlock` (stable): a block of a natural kind placed within a
   town's radius marks its 4 x 4 x 4 cell in `town:pl:<town>:*` (saved coalesced, every 10 s at most). A marked cell
   counts as man-made. The handler costs a type check and a radius check per placed block. When the cell list is
   full (5,000 cells), the oldest are dropped and the town keeps `plf: 1`: from then on it never levels at all
   (builds still go on ground that needs no leveling). Other packs that place natural blocks by script can send
   `realm:blocks_placed { dim, x1, y1, z1, x2, y2, z2 }` (build_bp's fill tools: a request for that pack's owner,
   not part of this feature).
5. **Exclusions:** see 4.4.
6. **Last check before building:** the whole region is read again block by block just before the build (4.7).

The residual risk, recorded as decision D1: a natural-kind block a player placed **before** this update, in open
ground, with no man-made block within 2 blocks and no overhang, can be leveled. The before-image puts it back on
Remove spot.

### 4.4 Rejections (a candidate is dropped if any holds)

The region is the outline the spot preview draws (`footprint(p, s)`) plus a 2-block margin in x and z; it is also
the apron.

- Any column of the region is `U` (the candidate waits for a later scan), `M`, `T`, `L`, or `W` (not a dock).
- A placed-block cell (4.3.4) touches the region.
- A claim overlaps it. One `realm:claims_check { id, player: "", dim, x1, z1, x2, z2 }` for the whole town square
  per scan (player "" lists every claim); 10 answers means "maybe more": then one check per finalist. No answer in
  20 ticks: Land Claims isn't installed.
- Another project's or work's region (footprint + 2) overlaps it: projects are at least 5 blocks apart, room for a
  road between them.
- Within 6 blocks of a townsfolk post (`realm:npc_places`: their houses) or 4 of the mayor's post; within 16 of a
  story place (`realm:place_ready`, collected after `realm:place_ping`; their prefabs are built later).
- Outside `townRadius - 4` from the center.
- Safe zones are not exclusions (they protect against world events; the town is one itself), decision D4.

### 4.5 Leveling (the terrain rule)

For a candidate with footprint ground heights `g`:

- Try `pad` = the median of the footprint's `g`, then `pad - 1`, `pad + 1`. Per footprint column the target is
  `pad`; per apron column at Chebyshev distance `d` (1 or 2) from the footprint, `t = pad + clamp(g - pad, -d, d)`.
- Reject the pad if any column needs more than `levelDepth` (default 3) cut or fill, if any step between two
  neighboring columns (4-neighbors, where at least one is in the region and at least one changes, D20; the outside
  ring counted at its natural height) is more than 1, or if a cut column is next to water or lava at or above its new top (it would flow in).
- Cutting removes natural blocks from the old top down to `t + 1` and needs the 2 blocks under the new top to be
  natural and solid (no opening into a cave or a basement). Filling puts dirt up to `t - 1` and the surrounding top
  block on top (grass on grass, sand on sand, podzol on podzol), never a gravity block under air.
- The town keeps its elevation: nothing outside the region changes, and no region is leveled by more than 3.

### 4.6 Scoring and order

Candidate spots: rings around the center every 3 blocks from 6 (well) or 10 (the rest) to `townRadius - 8`, an
arc step of about 3 blocks. Facing: the front (the spot side, where the notice board's signs are) toward the
center. Each candidate gets the key, compared in order:

1. leveling volume, bucketed by 6 blocks (least first);
2. 0 when already level (no column moves), else 1;
3. height variety: how many already picked spots in the town have a pad within 1 of this one (fewer first), so a
   hillside town ends up with projects on different height levels;
4. distance from the center. Distance also adds a bucket to item 1 every 48 blocks, every 12 for the well ("the
   well's counts 4 times", D21), so the well stays near the center.

The scan walks the rings outward and stops for a project once it has 6 valid candidates and the next ring is 16
blocks farther than the best one. The best 3 are validated by block reads (4.7); the first that passes is the spot.

**Dock:** shore columns: natural land with `g == w` or `g == w + 1` next to water; per direction, the 3 x 10 deck
columns must be `W` with surface `w` and its margin water or natural. `s.y = w + 1`. Nearest to the center wins.
No leveling for a dock.

**Lamps** (a 1 x 13 line) are scored the same way and point outward from the center, like a road.

**No valid spot:** the project is listed in `t.nos`; the town menu says "No good spot was found for the Well:
an operator can set one (Set a project spot)", and operators online are told once. A later scan (next level, or
an operator's **Find spots again**) tries again.

### 4.7 Building at an automatic spot

1. Finished project, spot `a: 1`: players within 32 blocks see its outline (the spot preview's particles, every 10
   ticks for `outlineSeconds`, default 5) and a chat line "The Well goes up here in 5 seconds".
2. Validation, block by block, over the region from `min(t) - 3` to the build's top + 1: what the plan cuts is
   natural, what the build replaces is air or wild plants (or water for a dock), nothing man-made, no player inside
   the build's volume (then it waits and says "step off the spot"). Claims are checked again. A failure picks a new
   spot (one rescan; then 4.6 "No valid spot").
3. `s.bs = 1` and the snapshot are saved first. The snapshot box now covers the whole region and the plan's depth,
   so Remove spot puts the original terrain back (`restoreGround`'s rule: blocks players added since stay; the fill
   kinds `dirt`/`grass_block` join the build's kinds for this spot).
4. A build job (`system.runInterval` while there is work, cleared when idle) applies the plan, then `placeDesign`,
   48 block changes a tick. A missing chunk pauses it (`s.bs` stays); it resumes when a player is near again.
5. Done: `pr.built = 1`, `bs` deleted, fireworks, announcements as today.

A resumed build (after a restart, `bs: 1`) skips step 2's natural check for columns already at their target (its
own fill), and `placeDesign` already keeps blocks that are what the design wants: applying a plan twice changes
nothing.

## 5. F38 The town grows with player progress

- Each project in config.js gains `why` ("a well, so families can move in"). The mayor's page (and Town info) shows
  the town's story so far (`t.log`: "Day 12: the Well was finished, the Smiths moved in"), the open projects with
  their `why`, and what the next level brings (residents, houses).
- Levels, needs, rewards, `realm:quest_done` and `realm:rep_add` are unchanged. Finishing a level unlocks the next
  (as now) and queues the scan for its projects and works.
- The Realm day for the log comes from `realm:calendar` (Townsfolk or Realm Calendar); without one, the log has no
  day.

## 6. F39 Residents move in

- **Who:** vanilla `minecraft:villager_v2`, spawned with `spawnFresh(dim, type, at, { spawnEvent:
  "minecraft:spawn_from_village", fresh: true })` from `scripts/spawn.js` (town_bp joins `tools/sync-spawn.mjs`), then
  tagged `realm:resident`, `town:r:<town>`, `town:rid:<town>.<n>` (C25), named from `CONFIG.residentNames` (vanilla
  name tag: a named villager never despawns; no label helper entity), and given a profession look event matching
  its house's job-site block (`minecraft:become_farmer` for a composter and so on, the wander_bp `LOOKS` events).
- **How many:** `residentsPerLevel` `[2, 4, 6, 8, 10]` (config.js), level 1's 2 only once the well is built; hard cap
  10 per town (`residentCapTown`, config) and `residentCapWorld` (setting, default 20, 0 to 40). Over the world cap,
  towns are served highest level first, then oldest. Lowering a cap never removes anyone; nobody new comes until the
  count is under it.
- **Homes, beds and job sites, only the town's own:** a resident's home is its house (F40) or, at level 1, the well.
  Vanilla villagers claim any free bed and job site in a village, players' too, and the stable API can't stop it. So
  town_bp ships the vanilla `villager_v2` behavior file (the pattern of `translucent_bp/entities/player.json` and
  `dolphin_bp/entities/dolphin.json`: a copy of the vanilla file plus our additions; re-copied after a Minecraft
  update) with one added component group `realm:town_resident` and one event `realm:become_resident`:
  `minecraft:dweller` with `can_find_poi: false, can_migrate: false` (no bed, job site or bell is ever claimed) and
  `minecraft:home` with a restriction radius (they stay near home without script work). Nothing in the base
  components changes, so every other villager in the world behaves as before. This is a gate (decision D2): if BDS
  1.26 shows the group doesn't stop claiming, residents ship with `residents` Disabled by default and the owner is
  told, rather than ship villagers that take players' beds.
- **Moving homes:** a resident whose home changes (the level 1 pair when houses go up) moves by being spawned again
  at the new home under the same name and record, while no player is within 24 blocks of either spot.
- **Trading:** off by default (`residentsTrade`): `beforeEvents.playerInteractWithEntity` (first line
  `if (ev.cancel) return;`, C13) cancels taps on a `realm:resident`.
- **Death and replacement, event driven:** `entityDie` (it fires for villagers) with `entityTypes` set marks the
  record `d = world.getAbsoluteTime() + replaceMinutes * 1200` (in-game ticks, C27; default 20 minutes = one
  in-game day). A census per town, every 600 ticks and only while a player is within its radius, is one
  `getEntities({ tags: ["town:r:<town>"] })`: a resident missing while its home is loaded for 2 censuses in a row
  is gone (a zombie conversion, a `/kill` without the event); a resident farther than `townRadius` from the center
  is teleported home; a second entity with the same `town:rid` (a cured zombie villager) loses our tags and becomes
  an ordinary villager (never killed). A due replacement spawns at its home when it is loaded, with "A new family
  moved into Riverside" to players in the town.
- Other packs: the `realm:resident` tag is documented in "How the packs work together" for any pack that acts on
  mobs. Today none needs a change: cleanup removes only items, champions, Blood Moon, sieges and the Deck of Many
  Things act only on their own tagged mobs.

## 7. F40 Houses and small life

- **House** (build kind `house`): a 7 x 7 cottage (planks walls with log corners, a door on the front, glass panes,
  a slab roof, a lantern, a bed and one job-site block from `CONFIG.houseJobs`: composter, lectern, barrel, smoker,
  cartography table, brewing stand, fletching table, loom, `stonecutter_block`, grindstone). Works `house_1`..`house_N`
  where N is the level's resident count, from level 2, each at an automatic spot (F37), built at once (no
  deliveries). A house's bed and job site are the only ones its resident is meant to use (and with D2 it claims none).
- **Paths** (`townLife`): when a project or work is built at an automatic spot, a 1-wide `grass_path` from its front
  toward the center, only by turning `grass_block` at ground level (no leveling, a step of at most 1), stopping at
  anything else, at most 48 blocks, saved in `town:w:<town>`. Remove spot turns them back to grass.
- **Lanterns along the paths:** at each new level, a fence post with a lantern beside the town's own paths every 8
  blocks, on natural ground, at most 12 per town.
- **Garden pen:** when the garden is built, a work `pen` (a 5 x 5 fence ring with a gate) at an automatic spot next
  to it, with 2 sheep and 2 chickens (spawned once, tagged `town:a:<town>`, not replaced: they are ordinary animals).
- **Notice board:** sign 2 shows projects done and the resident count, sign 3 the newest residents (`new`).
- **Mayor gossip:** `realm:gossip { kind: "town_life", place: "<town>", from: "mayor:<id>" }` for a new family,
  a house, a new level. npc_bp honors `from`: a piece with `from` is told only by that townsfolk (or Bram for his
  town). Rate-limited by town_bp's existing one piece per in-game hour.
- Every touch is blocks placed once (in the build job) or one spawn; nothing runs per tick.

## 8. Options and defaults

Settings (`town_bp/scripts/settings.js`, world scope, Realm Configuration):

| Key | Default | Range | What |
|---|---|---|---|
| `townMayors` | Enabled | bool | A mayor per town |
| `autoSpots` | Enabled | bool | Pick project spots automatically (Disabled: today's operator spots only) |
| `levelDepth` | 3 | 0-3 | Most blocks a spot's ground is cut or filled (0 = never level) |
| `outlineSeconds` | 5 | 0-15 | Outline shown before a build |
| `residents` | Enabled (D2) | bool | Residents move in |
| `residentCapWorld` | 20 | 0-40, step 2 | Most residents in the world |
| `residentsTrade` | Disabled | bool | Residents trade (bypasses the Crowns economy) |
| `replaceMinutes` | 20 | 5-120 | In-game minutes before a new family replaces one that died |
| `houses` | Enabled | bool | Towns build houses from level 2 |
| `townLife` | Enabled | bool | Paths, lanterns, the garden pen |

config.js: `mayorNames`, `residentNames` (40 ASCII first names), `residentsPerLevel`, `residentCapTown` (10, at
most 10), `houseJobs`, each project's `why`. npc_bp config.js: `mayorTemplate`.

## 9. Entity counts

| Per town | Count |
|---|---|
| Mayor (`minecraft:npc`) | 1, plus its label helper while a player is within 20 blocks |
| Residents (`villager_v2`) | at most 10 (and the world cap) |
| Pen animals | 4, once |

Two towns at Capital: 2 NPCs + 2 labels + 20 villagers + 8 animals = 32 entities. Mob count is a known Realm limit:
`residentCapWorld` defaults to 20 and SERVER_SETUP.md says so (with the per-town numbers).

## 10. Per-tick cost budget

| Work | When | Budget |
|---|---|---|
| Build interval (existing, 100 ticks): plus the mayor check per town | always | under 0.02 ms/tick |
| Census | every 600 ticks per town with a player in it | under 0.01 ms/tick |
| `playerPlaceBlock` mark | per placed block | 2 checks; saves coalesced every 10 s |
| Scan | after an add or level-up, while a player is in the town | 12 column reads a tick (about 0.4 ms/tick), for about 20 to 60 s |
| Validation and build job | a few seconds per build | 64 block reads or 48 block changes a tick (about 0.5 ms/tick) |
| npc_bp per mayor | while a player is near (its existing loop) | like one townsfolk, about 0.01 ms/tick |

Idle, town_bp stays at the typical-pack 0.15 ms/tick or less. The perf scenario (2 towns at Capital, 10 players,
residents spawned, no scan running) must show town_bp at 0.15 or less and npc_bp no more than 0.05 above its
baseline; the scan's transient cost is reported separately.

## 11. Failure modes

| Case | What happens |
|---|---|
| Unloaded chunks during a scan | `U` columns: those candidates wait; `t.scan` stays until a scan finishes with every project decided |
| Unloaded during validation or a build | the job pauses (`bs: 1` kept) and resumes when a player is near |
| Restart mid-scan | the scan starts again from `t.scan` |
| Restart mid-build | `bs: 1` + saved snapshot + saved plan: the build resumes; applying it twice changes nothing |
| Restart during the outline | the build shows the outline again next time |
| Someone builds on a picked spot before the project is finished | validation fails, one rescan, then "No good spot" for operators |
| A claim or a townsfolk house appears later | same as above |
| A player stands on the spot | the build waits and says so |
| Town removed during a scan, build or census | every job step checks the town still exists |
| Townsfolk (npc_bp) not installed | no mayors, migration waits, the fallback rule and `deliverWithCommand` work as today |
| Town Projects removed, Townsfolk kept | mayors stay as NPCs offering nothing; `/realm:npc_remove` removes one (documented) |
| A mayor's entity lost | npc_bp's existing missing check respawns it (from its skin) |
| Another add-on overrides `villager_v2` | the resident group doesn't exist: documented in SERVER_SETUP.md; `residents` can be Disabled |
| Zombie conversion or cure | census: missing becomes replaced; a duplicate loses our tags, never killed |
| Cap lowered | nobody removed, no replacements until under the cap |
| Script event sizes | every message under 300 chars, except `realm:npc_mayors` (split in parts under 2048) |
| Bundle | prefixes `town:`, `npc:`; no `clearDynamicProperties`; the canceled-tap rule (C13) for the residents' tap handler |

## 12. Test plan

Every behavior has a unit test or a BDS scenario that fails before its step and passes after.

Unit tests (`node --test`, the pure modules `town_bp/scripts/sites.js`, `designs.js`, `residents-core.js` and
npc_bp's `mayors.js`, with no `@minecraft` import):

- `tools/town-sites.test.mjs`: the allow list (every id exists in vanilla-data), persistent leaves, overhang
  rejection, the grading plan (at most 3, apron steps at most 1, outer ring joined), pad choice, scoring order
  (least leveling, then level, then height variety, then distance), a synthetic hillside heightmap giving pads on
  more than one height level, rejections (margin, overlap, claims, posts, places, water next to a cut), the dock
  shoreline finder, facing toward the center, unknown columns waiting.
- `tools/town-designs.test.mjs`: footprints unchanged for the 7 existing designs (so old snapshots and `b` boxes
  still match), the house's bed and job site inside its footprint.
- `tools/town-mayors.test.mjs`: migration (Bram's town nearest his post within the radius; else the oldest; no
  answer writes nothing), unique mayor names, ids.
- `tools/town-residents.test.mjs`: slots per level (2 only with the well), world cap priority, replacement due in
  ticks, census reconcile (missing twice, duplicates untagged).
- `tools/town-placed.test.mjs`: cell packing, the 5,000 bound, `plf`.
- `tools/town-autobuild.test.mjs`: main.js's own column reader, region check, build job and restore on a fake
  hillside: the plan's heights in the world, nothing outside the region changed, a second run changes nothing, an
  interrupted build resumed equals an uninterrupted one, nothing falls (sand), the region restores exactly.
- `tools/npc-mayors.test.mjs`: `folkOf` for a mayor, skin key, load keeps listed mayors and drops unlisted ones only
  after a complete list.

BDS scenarios (`tools/test-bds/examples/`, flat world, terrain made with `fillBlocks` near spawn, command in each
header):

| Scenario | Checks |
|---|---|
| `town-mayor-add.js` | adding a town creates `mayor:<id>` near the center; a tap (`realm:npc_debug`) offers only its town |
| `town-two-towns.js` | two towns, each its own mayor and projects; mayor A tapped from inside town B offers A first |
| `town-bram-migrate.js` | a v1 world (records written before the update, Bram placed): Bram keeps his town, its spots and progress unchanged (dump before/after); the second town gets its mayor when a player comes near |
| `town-auto-spots.js` | a planks cabin and a `grass_path` line in town: spots are picked automatically and no region touches them |
| `town-hillside.js` | a terraced hill: built projects have more than one pad height; every apron joins with steps of at most 1; nothing outside the regions changed |
| `town-terrain-restore.js` | Remove spot at a leveled spot puts every block of the region back |
| `town-build-resume.js` | a `/reload` mid-build: the build finishes, the result equals an uninterrupted build |
| `town-claims-spots.js` | a claim inside the town (claims_bp): no spot overlaps it |
| `town-unloaded.js` | part of the town unloaded: the scan waits and finishes when it loads |
| `town-placed-marks.js` | blocks reported placed (the event, and the test hook) are avoided |
| `town-residents.js` | the well finished: 2 residents move in (tags, names); one killed is replaced after `replaceMinutes` with the message |
| `town-resident-poi.js` | a player's bed in town stays unclaimed through a night (gate D2) |
| `town-houses.js` | level 2: houses at automatic spots, each with a bed and a job site; residents moved home |
| `town-life.js` | the garden: pen and 4 animals; the board lists residents; mayor gossip with `from` |
| `town-capital-perf.js` | 2 towns at Capital, 10 players: ms/tick per pack against section 10 |

Also rerun: every `town-*` and `npc-*` scenario (`suite.mjs --filter 'town|npc'`), `town-news.js`, and the one-context
bundle smoke.

## 13. Build order

Five steps, each a coherent series of commits (one commit per change), each ending with `npm run check`, its unit
tests and its scenarios passing, docs (PACKS.md Town Projects and Townsfolk, README rows) in the same commits as the
behavior, versions bumped and `node tools/sync-diag.mjs` run. The lead runs `help-catalog`, `admin-catalog` (+ the
`admin_bp` bump and the setup checklist's "Town Project Spots" text in `admin_bp/scripts/presets.js`) and
`gen-news` after merging.

1. **Mayors (F36).** Move `design()`/footprints into `designs.js` (no behavior change, footprint test). Town schema
   v2 (`m`, `mn`), the `realm:npc_mayor` protocol in npc_bp (`npc:mayors`, `folkOf`, skin key, load/audit of
   `mayor:*`, cast-only affinity), mayor creation on add, respawn requests, offer routing with the fallback,
   operators' Mayor actions, removal, Bram migration. Scenarios: mayor-add, two-towns, bram-migrate.
2. **Automatic spots and leveling (F37).** `sites.js` (allow list, columns, plan, scoring, dock), the budgeted scan
   job and its queue, exclusions (`realm:claims_check`, `realm:npc_places`, `realm:place_ready`), placed-block cells
   (`playerPlaceBlock`, `realm:blocks_placed`), validation, the outline before a build, the budgeted build job with
   the plan and the larger snapshot, resume, "No good spot", operator overrides kept. Scenarios: auto-spots,
   hillside, terrain-restore, build-resume, claims-spots, unloaded, placed-marks.
3. **Growth and houses (F38, F40 houses).** Project `why`, the town log, the mayor's story page; the `house` design,
   town works and their spots and builds from level 2. Scenarios: houses (without residents), the mayor page.
4. **Residents (F39).** The `villager_v2` override with `realm:town_resident` (gate D2 on BDS first), town_bp in
   `sync-spawn`, `town:r:*`, spawning, homes, census, death and replacement, caps, trading option, tags;
   SERVER_SETUP.md (the cap, the override). Scenarios: residents, resident-poi, houses with residents.
5. **Small life, docs and perf (F40 touches, F41).** Paths, lanterns, the pen, the notice board, mayor gossip with
   `from` (npc_bp); "How the packs work together", the welcome feature list; the perf scenario and the full town and
   npc suite plus the bundle smoke.

## 14. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | "Placed" can't be known; the conservative rule of 4.3 (allow list, persistent leaves, overhangs, placed cells from now on, re-validation) with the residual risk named | Stable API 2.1.0 has no block history |
| D2 | Residents need a `villager_v2` override group that stops POI claims; if BDS shows it doesn't work, `residents` defaults to Disabled | "never by taking players' beds" outranks residents |
| D3 | New mayors start with the default NPC skin; operators pick one in the NPC editor and the existing snapshot keeps it | `minecraft:skin_id` is read-only |
| D4 | Safe zones don't block town builds; claims, houses, story places, paths and waystones do | A town is a safe zone itself; zones are about world events |
| D5 | Leveling only at automatic spots; operator spots build as today | Operators choose those knowingly |
| D6 | Bram is never renamed or removed by town_bp; the oldest town is his when he is unplaced or far away | The story and cast use `bram`; "the mayor of the first town" |
| D7 | Mayors have the `mayor` role only, no affinity | Keeps favors and chapters with the cast and `npc:aff` bounded |
| D8 | Houses, the pen and paths are town works, not config projects: no deliveries, rewards or quests | Keeps rewards and saved progress as they are |
| D9 | Residents use the vanilla name tag, no label helper | Fewer entities; villagers show their name natively (C2 was about `minecraft:npc`) |
| D10 | No ticking areas: scans and builds wait for a player in the town | Ticking areas are limited and cost; the town is loaded when someone is there |
| D11 | The design note lives here instead of under the feature in FIXES.md | This task may not edit FIXES.md; the lead links it |
| D12 | Migration runs on the build interval as soon as a complete `realm:npc_places` answer is in, not inside a fixed 40-tick window; no answer, nothing written | Same result, and a late Townsfolk (bundle order, a slow load) still migrates in the same session |
| D13 | `townMayors` Disabled: no mayors made, asked for again or migrated; mayors already standing stay, and every `mayor`-role NPC offers the town the player is in (the int23 rule) | Turning it off must never delete NPCs or rewrite towns |
| D14 | Mayor names are `Mayor <first name>` from 20 `mayorNames` that no cast member, wanderer, elite or story character uses; shown as `Mayor Alda of Riverside` (`mayorTemplate.title`) | Players must not mistake a mayor for a story character |
| D15 | town_bp does not save a mayor's post: npc_bp owns posts (`npc:list`); a mayor whose record is gone comes back at the town center facing south | One owner per piece of state |
| D16 | `/realm:npc_remove` on a mayor drops it from `npc:mayors` too; with Town Projects it comes back (default skin) when a player is in its town, unless `townMayors` is Disabled | "Respawn if missing"; removing the town is the way to remove a mayor for good |
| D17 | A corrupt `npc:mayors` keeps every `mayor:` post and entity (the audit leaves them) until Town Projects sets them again | Never remove NPCs on unreadable data (like `loadFailed` for `npc:list`) |
| D18 | Mayors are left out of `/realm:npc_houses` and `/realm:npc_add`; they appear in Who lives here, `/realm:npc_list` and the Minimap | A mayor belongs to its town, not to the village around the operator |
| D19 | A town added while older towns still wait for migration takes Bram only when there are no towns at all | Bram's town among the old ones is decided by his post, not by the order of a later add |
| D20 | The step rule checks pairs of neighboring columns where at least one changes; a natural step between two untouched columns stays | It's nature, not ours; checking it too would reject most natural hillsides |
| D21 | Distance adds one leveling bucket every 48 blocks (every 12 for the well) before "already level" and height variety | Gives "the well's distance counts 4 times" a meaning (a pure last tiebreak scaled by 4 orders nothing) and prefers flat ground near the center |
| D22 | `t.scan` is the list of project ids to place, not `1`; `as: 1` marks a town queued once; Remove spot never queues | An operator's Remove spot isn't undone by the next scan; towns from before this version are queued exactly once |
| D23 | Builds at operator spots stay one-tick builds as before; only automatic spots use the budgeted job (48 changes a tick) | D5: operator spots behave as today; their footprints are small and checked by the preview |
| D24 | A resumed build (`bs: 1`) skips the outline and the block check | The region was checked before its first block; cuts remove only natural blocks, fills fill only air and wild plants, and the design only replaces what `canReplace` allows, so nothing man-made is touched even when someone built there meanwhile |
| D25 | At automatic spots, a design's `ground` places may also replace natural ground (sand, gravel, stone under a well or garden) | A desert well would otherwise be a ring on sand; the snapshot keeps the ground and Remove spot puts it back |
| D26 | `restoreGround` runs in two passes for every snapshot: what becomes air top down, then the rest bottom up | No sand or gravel falls while a region is put back; older snapshots restore the same blocks as before |
| D27 | After 3 scans of a town that waited on unloaded ground in one session, the scan takes the best spot it knows | A corner of the town that never loads can't stall its projects forever |
| D28 | The dock's shore is found from water columns on the rings, walking up to 4 blocks toward the center; the deck faces the water first, then the two sides | Rings every 3 blocks rarely land exactly on the shoreline |
| D29 | A failed check (someone built on the spot, a claim) forgets the spot and scans once more (`rt`); a second failure goes to `nos` | The "one rescan" of 4.7 has to survive a restart |
| D30 | `realm:blocks_placed` takes `{ dim, box: [x1, y1, z1, x2, y2, z2] }` or the six fields; a box over 5,000 cells marks the town full at once | Both shapes were named (the task and 4.3); a huge fill can't be stored cell by cell |
