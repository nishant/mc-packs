# Towns, townsfolk and mobs: performance findings

Scope read (second pass, from the code; the first pass was used only as a list of leads):
- Shared: `tools/name-labels-shared.js`, `tools/tether-shared.js`, `tools/spawn-shared.js`, `tools/gossip-shared.js` (all); `tools/owed-shared.js` (40-383); `tools/prune-shared.js` (header and exports: none of these packs imports it).
- `packs/npc_bp/scripts/main.js` (all 2,565 lines), `config.js` (ranges and cast), `entities/*.json`. `mayors.js` and `hearth.js`: exports only (pure logic and data).
- `packs/town_bp/scripts/main.js`: 30-1102, 1690-3937 in full; 1104-1690 (menus) and 3938-4025 (commands) by grep. `sites.js` (all). `placed.js` (all), `designs.js` (footprints, cells), `life.js` (path planner), `residents.js` (reconcile), `growth.js` (`townJson`). `entities/villager_v2.json`: the `realm:` additions and the events that test them.
- `packs/wander_bp/scripts/main.js` (all), `config.js`. `packs/caravan_bp/scripts/main.js` (30-1250).
- `packs/elite_bp/scripts/main.js` (20-1477 in full, the rest by grep), `config.js`, `zones.js` (119-161). `packs/bounty_bp/scripts/main.js` (30-788 in full, the rest by grep). `packs/guard_bp/scripts/main.js` (14-176).
- `packs/dolphin_bp/scripts/main.js` (40-600 in full, the rest by grep), `spread.js`, `entities/dolphin.json` (the `realm:` groups). `packs/platypus_bp` (script, entity components, spawn rule), `packs/platypus_rp` (all).
- Scenario headers: `perf-soak.js`, `npc-labels-perf.js`, `town-capital-perf.js`, `town-hillside.js`, `town-unloaded.js`, `elite-crowd-perf.js`, `elite-density.js`, `dolphin-riding.js`.

Costs below use the brief's 10 us per native call. Property reads (`location`, `dimension`, `typeId`, `isValid`) are counted as native calls; if they turn out cheaper, the call counts still hold and the milliseconds shrink. Nothing here was measured on a server.

## Summary
- The town spot scan does not just take minutes on a hillside: a project that fits nowhere in the loaded part of a town is scanned again from scratch every 5 seconds, for as long as a player is in the town, at about 120 native calls a tick (ENT-05). The column cache lives inside one scan, columns past the ticking distance always read as unknown, and "unknown" never ends in "no good spot". Pacing of cached lookups (100 a tick) and same-shaped houses re-walking every ring add minutes on top.
- npc_bp is the largest steady cost in this track and the soak never sees it. With a player in the town: 9 native calls per townsfolk per label sync plus about 13 per townsfolk per `loop`, about 270 calls every 10 ticks for 12 townsfolk and 2 players (0.27 ms/tick). With players online but away: 3 calls per townsfolk per player every 10 ticks (ENT-01, ENT-02). Standing NPCs need almost none of these reads.
- The label sync's 2 ms at 40 players is 229 native calls: 3 per observer and 9 per townsfolk. The two attempts that changed nothing removed none of them (ENT-02).
- Spikes nobody measures: town_bp's 5-second check reads every player about 16 times per town (ENT-28); wander_bp reads 405 blocks around every exploring player once a minute at night before a 7% roll (ENT-29).
- Mob farms and exploring: elite_bp pays 3 to 5 calls on every hurt and every spawned mob or item; caravan_bp audits every loaded entity in the world with no type check; together these packs spend about 14 calls per loaded entity (ENT-07, ENT-08, ENT-30).
- elite_bp's 0.04 to 0.09 is not noise in the code: nothing in it runs at a steady rate. Its cost follows how many mobs spawn, burn and die in the window and whether one rolled champion (night only), and the soak pins neither time nor spawning (ENT-09).
- Helpers: one label entity per townsfolk, trader or wanderer, only while a player is within 24 blocks (36 for wanderers). A standing NPC's helper is never teleported; a walking wanderer's is, 10 times a second, by design (ENT-03).
- Fine: the `villager_v2` override, the platypus packs, guard_bp in its default mode, town residents and the census.

## Findings

### ENT-05 town_bp: a project with no valid spot in the loaded ground is scanned from scratch, over and over  [high / confirmed by reading, not measured / M / medium]
- Where: `packs/town_bp/scripts/sites.js:440` (the column cache is a local of one `scanTown` call), `:576` (`decide`: no valid candidate and any unknown column is "wait", also when `final`), `:481-495` (only "none" is remembered per footprint shape, not "wait"), `:443-468` (`work++` per lookup, cached or not; `pace` yields at 100), `:658-679` (`look` reads the whole footprint before testing its spread). Driver: `packs/town_bp/scripts/main.js:2147-2198` (`stepScan`), `:2201-2229` (`finishScan` drops the job, counts the wait), `:2634-2636` (`autoTick` starts the next scan with no backoff), `:2066-2087` (`readCol`).
- What happens and how often:
  1. Columns outside the ticking area read as unknown (`readCol`, the C16 check at `:2071`). The harness and Realms run tick distance 4 (`tools/test-bds/lib/server.mjs:92`), about 64 to 79 blocks around a player; a town of radius 96 walks rings out to 88. With the player near the center, rings past about 66 are unknown in every scan.
  2. A project with no valid candidate in the loaded part (a hillside, a built-up town) therefore ends "wait", never "none". `finishScan` clears `scanJob`; the project stays in `t.scan`; the next 100-tick check starts a new scan, which builds a new generator with an empty cache and reads every loaded column again. `SCAN_FINAL_AFTER` only helps when a valid candidate exists. This repeats until the player leaves the town. `town-unloaded.js` shows the wait is intended; the cost of repeating it is not.
  3. One scan on a hillside: about 2,770 candidate positions per footprint shape (27 rings from 10 to 88, about 2*pi*r/3 positions each). First walk: about 15,000 loaded columns at 12 a tick is at least 1,280 ticks (64 s). Each position also costs 20 to 40 work units for the "no reads" checks (`:506`) plus 49 to 81 footprint lookups, so at 100 units a tick a walk over fully cached columns still takes 1,900 to 2,800 ticks (1.6 to 2.3 minutes) per shape. A house that ended "wait" is not remembered, so each further house of the same shape walks every ring again (about 1,100 ticks each).
- Cost estimate: while a scan runs, 12 columns x about 10 native calls (`getTopmostBlock`, `location`, `heightRange`, `typeId`, three block reads of 2 calls) = 120 calls a tick, about 1.2 ms/tick, plus `playerIn` every tick (ENT-06). In the endless case that is a constant 1.2 ms/tick whenever someone is in that town: more than the whole bundle at 10 players.
- Fix, in order of value:
  1. Keep the column cache per town across scans: a `Map` owned by `main.js`, passed in `ScanInput`, known columns only (unknown ones are asked again), dropped after about 10 minutes, on town removal and when the town's placed cells change. A stale column cannot cause a wrong build: `deepCheck` (`sites.js:737`) and `checkRegion` (`main.js:2312`) read the blocks again before anything changes.
  2. Back off: after a scan that picked nothing and only waited, start the next one only when a player in the town has moved 32 blocks or more (new ground is loaded) or after `scanWaits` minutes. Decide whether three such scans should list the project under "no good spot" (operators already have "find spots again").
  3. Budget: in `stepScan` (`main.js:2178`) treat `["tick"]` as a checkpoint: go on in the same server tick while no native read was made this tick, up to about 20 checkpoints or until `Date.now()` changes. No change to `sites.js` or its tests; cached walks get about 20 times faster.
  4. In `look`, read the footprint's four corners and center first and return `null` when their spread is over `2 * depth`: on a slope most positions end after 5 lookups instead of 49 to 81, and the first walk reads about half the columns.
  5. Remember "wait" per shape as `none` does (`sites.js:481-495`), while no pick was made in between.
  6. `col()`: look in `cache` first and only `yield*` on a miss (each cached lookup allocates a generator today). Read `dim.heightRange` once per job (ENT-15).
- Prove it with: `tools/town-sites.test.mjs` (same picks; add counts of column requests and "tick" yields on a sloped world, and a second scan with the kept cache making no requests for known columns); `town-hillside.js` (log ticks from `startScan` to `finishScan`); `town-unloaded.js` (count scans started while the player stands at the edge: today one every 5 s); `town-capital-perf.js --arg transient=scan` under `--profile`.

### ENT-01 npc_bp: the activity check reads every player once per townsfolk, every half second  [high / confirmed / S / low]
- Where: `packs/npc_bp/scripts/main.js:758-767` (`loop`, every 10 ticks from `:797`); `activeRange` is 40 blocks (`:757`).
  ```js
  if (!players.some((p) => p.dimension.id === rec.dim && dist(p.location, rec) <= activeRange)) {
  ```
- What happens and how often: for each placed townsfolk (12 cast, plus up to 64 town mayors) `some` reads `p.dimension`, `.id` and `p.location` for each player until one is near. Away from town, the usual state for anyone exploring, nobody is near and every player is read for every townsfolk.
- Cost estimate: 3 x players x townsfolk calls per run. 12 townsfolk: 4 players 144 calls (0.14 ms/tick), 10 players 360 (0.36 ms/tick), 40 players 1,440 calls, about 14 ms in one callback twice a second. The soak places no townsfolk; `npc-labels-perf.js` stands every player next to them, so `some` stops at the first.
- Fix: read the players once per run into `{ dim, x, y, z }` records (3 calls a player) and test those. Share that snapshot with the label sync (ENT-02). Since posts never move, a per-dimension bounding circle of the posts plus one `dim.getPlayers({ location, maxDistance })` skips the whole pass when nobody is near.
- Prove it with: a variant of `npc-labels-perf.js` that teleports every player 300 blocks away for 120 s under `--profile` (npc_bp ms/tick before and after); `npc-stay-home.js`, `npc-far-names.js` for behavior.

### ENT-02 name labels: where the 2 ms goes (229 native calls), and what a standing NPC needs  [high / confirmed count, gain not measured / M / low]
- Where: `tools/name-labels-shared.js:249-258` (observers), `:260-371` (targets), `:139-147` and `:286-289` (`restoreFallback`); callers `packs/npc_bp/scripts/main.js:478-496` with `entityOf` `:294-302` and `labelTextFor` `:471-475`; `packs/caravan_bp/scripts/main.js:490-510`, `:529-537`. The same townsfolk are read again by `behave` (`npc_bp/scripts/main.js:676-744`).
- What happens and how often: per sync (every 10 ticks), counted from the code:
  - once: `world.getPlayers` (1).
  - per observer: `p.location`, `p.dimension`, `.id` (3; `p.id` is the cheap one). `getGameMode` and `isValid` are skipped.
  - per loaded townsfolk, before `sync`: `world.getEntity`, `isValid`, `system.currentTick` (3). In `sync`: `target.isValid`, `getHeadLocation()`, `target.dimension`, `.id` (4). Then either the near branch, `helper.isValid` and the `target.nameTag` read at `:355` (2), or the far branch, `restoreFallback`'s `isValid` and `nameTag` (2). So 9 per townsfolk whether or not anyone is within 24 blocks.
  - every 10th sync: `helper.nameTag`, `helper.location` (2 more) and `sweepStrays` (6 per tracked label, 3 `getDimension`, 3 `getEntities` by type).
  - teleports: none (a standing NPC's anchor does not move). `nameTag` writes: only on a caption change and for the two resends after a new viewer comes within 20 blocks (2 writes on the helper, 2 on the NPC).
  - 40 players, 12 townsfolk: 1 + 120 + 108 = 229 calls, so the measured 2 ms is about 9 us a call. The per-dimension observer list still read every player's place; cached names removed string building only. Neither removed a call.
  - `loop` adds about 13 calls per active townsfolk every 10 ticks: the `some` reads (3), `world.getEntity` and `isValid` (2), `world.getDimension` (1), `entity.dimension.id` and `location` (3), a second `location` and a `getPlayers` query for the nearest player (2 to 3), `currentTick` (1), and a teleport when it turns.
- Cost estimate: real Realm, 2 players in town: 6 + 108 + about 160 = about 270 calls per 10 ticks, 0.27 ms/tick for as long as anyone is in the main town. 40 around the square: about 385 calls per 10 ticks.
- Fix (shared module plus npc_bp; caravan_bp gets it through a `fixed` option):
  1. Validity by event: keep entity handles in a `Map` and drop them from `world.afterEvents.entityRemove` with `{ entityTypes: [NPC_TYPE, LABEL_TYPE] }` (wander_bp already does this, `wander_bp/scripts/main.js:1239-1248`); `entityLoad` (`npc_bp/scripts/main.js:547`) refills them. No `getEntity`, `isValid` or `helper.isValid` per sync.
  2. Fixed anchors: a townsfolk stands on its post, so its dimension is `rec.dim` and its head is the post plus a head height read once when the entity loads. No `getHeadLocation`, `dimension` or `.id` per sync. `behave`'s own position check (pushed off the post) can run every 2 seconds.
  3. Trust what was written: remember that the full name was restored (a flag per key) and the last `target.nameTag` written; read back only on the sweep sync, as the helper's caption already is.
  4. One player snapshot per 10 ticks for `loop` and the labels; `behave` picks the nearest player from it instead of a `getPlayers` query per townsfolk.
  - Expected (not measured): per townsfolk about 1 call per 10 ticks instead of 22; 2 players in town about 20 calls per 10 ticks instead of 270; the 40-player test about 150 instead of 385 (its observer reads remain).
- Prove it with: `npc-labels-perf.js` at 10 and 40 with a call counter (a scenario-only wrapper that counts `Entity.prototype` reads per sync), `npc-far-names.js`, `npc-name-capability.js`, `npc-stay-home.js`, `npc-floor-gone.js`, `caravan-traders.js`.

### ENT-28 town_bp: the 5-second check reads every player about 16 times per town  [medium / confirmed / S / low]
- Where: `packs/town_bp/scripts/main.js:1080-1102` (every 100 ticks); `playerIn` `:2037` called from `lifeTick` twice (`:2890`, `:2897`), `residentTick` (`:3787`), and the same pattern in `penTick` (`:2745`), `mayorCheck` (`:3271`) and the build check (`:1095`).
- What happens and how often: each check runs `players.some(...)` reading `pl.dimension`, `.id`, `pl.location.x` and `pl.location.z` (4 calls; `location` is read twice). With nobody in a town, every player is read in every check of every town.
- Cost estimate: about 16 x players x towns calls in one callback every 5 s. 4 players, 3 towns: 190 calls (1.9 ms). 10 players, 5 towns: 800 (8 ms). 40 players, 5 towns: 3,200 calls, about 32 ms in one tick. `town-capital-perf.js` stands the players inside the towns, where `some` stops early.
- Fix: read each player once per check into `{ dim, x, z }` (3 calls a player, whatever the number of towns) and pass that list to every check; compute "players in this town" once per town.
- Prove it with: `town-capital-perf.js` with a phase where all players stand 300 blocks from both towns, reporting the slowest tick (needs the plan's slow-tick record), and `town-two-towns.js` for behavior.

### ENT-29 wander_bp: 405 blocks are read around each exploring player every minute at night, before a 7% roll  [medium / confirmed / S / low]
- Where: `packs/wander_bp/scripts/main.js:572` (`archetypeFor` runs before the chance at `:576-581`), `:409` (`ruinsAround` when it is night and no story site is within 64 blocks), `:362-373` (9 x 9 x 5 blocks; `b.typeId` is read up to three times per block), `:376-385` (`coldAround`, 15 blocks).
- What happens and how often: once a minute for each eligible player (survival, 300 blocks from spawn, 160 from any zone, off cooldown). At night, away from sites, the scan finds no ruins and reads everything: 405 `getBlock` plus up to 1,215 `typeId`. 93% of the rolls then fail the chance.
- Cost estimate: up to 1,620 native calls, about 16 ms, in one tick per exploring player per minute at night. Rolls are spread over slots, so the spikes do not stack. The soak never sets night.
- Fix: roll first against the highest chance this player could have (`rollChance * siteBonus * nightBonus`); only when that passes work out the archetype and test the exact chance. Read `typeId` once per block. That leaves about 810 calls on about 1 roll in 8.
- Prove it with: `wander.js` (the `roll` debug action) at night with a tick-time log around `roll`; unit-style check that the share of meetings does not change (same expected chance).

### ENT-03 wander_bp: the 2-tick label sync repeats every read to move a label  [medium / confirmed count, needs-measurement / M / low]
- Where: `packs/wander_bp/scripts/main.js:758-766` and `:1678` (every 2 ticks); `tools/name-labels-shared.js:260-357`.
- What happens and how often: on the nine syncs between full passes, each hot observer costs 3 reads and each hot wanderer `isValid`, `getHeadLocation`, `dimension`, `.id`, then `helper.isValid` and the `nameTag` read (6), or `restoreFallback` (6 in all) when it is hot but past 36 blocks, plus one `teleport` whenever its head moved more than 0.01 blocks, which is every sync while it walks. Only the teleport needs 2-tick timing. One group of 5 players with one walking wanderer: 22 calls per 2 ticks, 11 a tick; that is the size of the pack's 0.111 ms at 40 players if one or two wanderers had rolled in.
- Cost estimate: about 0.1 ms/tick per wanderer with a group near it, and 10 move packets a second per walking wanderer to every client that sees it. The earlier attempt cached the observers' places only (15 of the 22 calls) and measured no gain, so either those reads are cheap or the run had no wanderer: measure before building.
- Fix: split the module's work. `follow()` every 2 ticks: for each tracked label, `target.getHeadLocation()` (a thrown read drops the label), compare with `entry.at`, teleport when it moved: 1 to 2 calls per visible label. `sync()` every 10 ticks with `syncTicks: 10` as npc_bp has: observers, range, captions, resends, validity. If the teleports themselves are the cost, the only cut is fewer of them (a dead band of about 0.1 blocks; the label then steps instead of gliding). There is no attach mechanism for a vanilla villager or wandering trader without overriding them.
- Prove it with: `perf-soak.js --arg wanderers=3` at 10 and 40 (the option exists for this), with a counter of native reads and teleports per second; `wander-walk.js`, `wander-visible.js`.

### ENT-06 town_bp: a scan is dropped when no player is in the town, and that test runs every tick  [medium / confirmed / S / low]
- Where: `packs/town_bp/scripts/main.js:2151-2153` (`scanJob = undefined`), `:2037` (`playerIn`), and the same test in `stepLife` (`:2918`).
- What happens and how often: the generator and its cache go when the in-town player steps past `townRadius` for one tick; the next 5-second check starts over. `playerIn(world.getAllPlayers(), t)` runs on every scan tick: up to 4 calls per player (all of them when the in-town player is last in the list).
- Cost estimate: every column read so far, again (up to about 15,000 columns x 10 calls); and up to 160 calls a tick at 40 players for the whole scan.
- Fix: pause instead of dropping (keep `scanJob`; return while nobody is in the town; drop after about 10 idle minutes or when the town or `autoSpots` goes). Test `playerIn` every 20 ticks. With ENT-05's kept cache a restart is cheap anyway.
- Prove it with: `town-hillside.js` with the player stepping out and back every 20 s: spots still picked, fewer column reads in total.

### ENT-07 elite_bp: every `entityHurt` in the world costs 3 to 5 native calls  [medium / confirmed / S / low]
- Where: `packs/elite_bp/scripts/main.js:543-551`.
- What happens and how often: no filter. Fall, fire and farm damage: `damagingEntity`, `hurtEntity.isValid`, `hasTag` (3). A hit from a mob or player: `isValid` and `hasTag` on the attacker too (5).
- Cost estimate: 30 to 50 us per hurt; a farm with 200 hurts a second about 8 ms/s (0.4 ms/tick), all wasted when no champion is loaded.
- Fix: return when `known.size === 0`; else test `live.has(hurtEntity.id)` and `live.has(attacker.id)` before any other read (`live` and `known` are kept by `makeChampion`, `upkeep`, `entityLoad`, `refresh` and the death handler).
- Prove it with: a new scenario with 50 zombies taking fall or fire damage under `--profile`; `elite-crowd-perf.js`, `elite-invalid.js`, `elite-storm-flat.js` for behavior.

### ENT-08 elite_bp: every spawned mob costs 3 to 5 calls and every item entity 5  [medium / confirmed / S / low]
- Where: `packs/elite_bp/scripts/main.js:462-484`, `noteItem` `:278-284`, `purgeGear` `:292-316`.
- What happens and how often: for cause `Spawned`: `isValid`, `typeId` (read twice for mobs), then for items `getComponent("minecraft:item")`, `itemStack`, the stack's `typeId`; for listed mobs `dimension`, `.id` and two settings before the 2.5% roll. Every mined block, crop and mob drop is an item spawn.
- Cost estimate: about 50 us per item and 30 to 50 us per mob; a farm dropping 100 items a second about 5 ms/s.
- Fix: items: keep a count of loaded champions that wear a helmet (`info.gear`), and return from the item branch when it is 0. A watch window opened in `entityDie` does not work: the drop's spawn event can come before the death event (`purgeGear` accepts `appeared >= died - 2`, `:300`). Mobs: read `typeId` once, drop `isValid` (the handler is in a `try`), and roll `Math.random() >= chance` before reading the dimension.
- Prove it with: the farm scenario from ENT-07 with drops; `elite-not-a-mob.js` and the gear checks in `elite-density.js`.

### ENT-09 elite_bp: why 0.04 to 0.09 between runs, and the 5-second upkeep  [medium / likely / S / low]
- Where: `packs/elite_bp/scripts/main.js:462-484`, `:543-551`, `:1149-1191`, `:1341-1350` (event handlers); `:1026-1040` (`sortNear` reads every player once a second while a champion is loaded); `:892-981` (`approachStep`); `:1299-1339` (`refresh`); `config.js:31` (`nightOnly: true`).
- What happens and how often: with no champion loaded, every interval returns at once (`live.size`, `thunder`), and the only steady work is `refresh` (3 tag queries every 5 s). Everything else is per event: mobs spawned (3 to 5 calls), items (5), hurts (3 to 5), deaths (2), loads (2). Champions only come at night (2.5% of listed spawns), and each one near a player then costs an approach step every 5 ticks (ENT-31) plus the 3-calls-per-player read each second. The soak sets neither the time nor mob spawning, so the figure follows how much of the window was night, how many monsters spawned and burned around the eight groups, and whether one rolled champion. `elite-crowd-perf.js` pins both (`doMobSpawning false`, midnight) and is the stable measurement.
- Cost estimate: 30 mob spawns a second at night is about 150 calls a second (0.075 ms/tick); one champion near players adds about 0.1 ms/tick; at 40 players the players read adds 0.06 ms/tick while any champion is loaded. `refresh` re-runs the full `upkeep` (about 18 calls) on every loaded champion: 32 champions (the cap at 40 players) is about 600 calls, 6 ms, in one tick every 5 s.
- Fix: ENT-07 and ENT-08 for the event side. In `refresh`, run the full `upkeep` only for champions not in `known` (`entityLoad` already does it on load); for known ones update `at` and `dim` only. For the measurement: report elite_bp from a soak with time and spawning pinned, or accept the spread.
- Prove it with: read elite_bp's per-callback breakdown in the profile JSON of two soaks that differ (spawn and hurt handlers against intervals); `elite-crowd-perf.js` and `elite-density.js` at 10 and 40, comparing three runs.

### ENT-31 elite_bp: an approach step is about 50 native calls, 18 of them `dim.id` for cache keys  [medium / needs-measurement / S / low]
- Where: `packs/elite_bp/scripts/main.js:751-760` (`lookAt` builds its key from `dim.id` on every lookup, hit or miss), `:775-803`, `:848-865`, `:892-945`.
- What happens and how often: every 5 ticks for up to 8 champions near players. One step in open ground: about 7 reads on the champion, a player query and 2 reads per player found, 3 `isProtected(dim.id, ...)`, about 18 block lookups (each reads `dim.id`; about 9 are misses at 2 more calls), one teleport.
- Cost estimate: about 10 calls a tick per champion near a player (0.1 ms/tick each); 8 or more champions about 0.8 ms/tick. If `Dimension.id` is as cheap as `player.id`, the saving is small: measure it once.
- Fix: read `dim.id` once per step and pass the string to `lookAt` and `isProtected`.
- Prove it with: `elite-crowd-perf.js` at 10 players, 40 champions, before and after; `elite-approach.js`, `elite-approach-terrain.js` for behavior.

### ENT-30 entity load handlers read before they check the type; caravan_bp audits every entity  [medium / confirmed count, needs-measurement / S / low]
- Where: `packs/caravan_bp/scripts/main.js:563-574` and `audit` `:540-541` (`isValid` and `hasTag` for every loaded entity of any type, on top of two `typeId` reads); `packs/wander_bp/scripts/main.js:1339-1354` (`typeId` read three times, then `isValid` and `hasTag` twice for villagers, traders, allays and NPCs: ENT-22); `packs/npc_bp/scripts/main.js:547-559` (`typeId` three times); `packs/elite_bp/scripts/main.js:1341-1350` (`isValid`, `hasTag`, no type check); `packs/town_bp/scripts/main.js:3840-3848` and `packs/platypus_bp/scripts/main.js:93` (1 each).
- What happens and how often: once per entity whose chunk loads, in every pack. A player flying or riding into new ground loads 50 to 200 entities a second. The soak's players load no chunks.
- Cost estimate: about 14 native calls per loaded entity in these six packs (XC-06 counts 14 handlers in the whole bundle): 100 loads a second is about 1,400 calls, 0.7 ms/tick while exploring. Not measured; `typeId` may be cheap.
- Fix: in each handler read `entity.typeId` once into a local and return unless it is in the pack's own `Set`: caravan `minecraft:npc`, the two llama types and its label type; elite `mobSet` (a tagged non-mob is still caught by `refresh`); the label modules take the type as an argument.
- Prove it with: the plan's churn scenario (a player teleported through fresh chunks) under `--profile`; `caravan-unloaded.js`, `elite-not-a-mob.js`, `npc-placement.js` for behavior.

### ENT-11 owed store: the index is parsed and rewritten once per offline player owed  [medium / confirmed / S / low]
- Where: `tools/owed-shared.js:274-298` (`set`: `readIndex` parses the whole index, `writeIndex` stringifies and writes it for a new id), `:303-311`; callers `packs/town_bp/scripts/main.js:448-467` (`finishProject`, with `online(id)` = `getAllPlayers().find` per contributor) and `packs/bounty_bp/scripts/main.js:127-137`.
- What happens and how often: once per finished project, per offline contributor: a value read and write, a parse of the index (up to 1,000 ids, 27 KB) and, for a player not yet owed, a full rewrite of it. A join's `take` only touches the index when something was owed.
- Cost estimate: not measured. 100 offline contributors on a server with many past visitors is up to 100 parses and 100 writes of 27 KB in one tick, likely 100 ms or more. On the Realm (a handful of contributors, a short index) it is nothing.
- Fix: cache the index (array plus `Set`) in the store after the first read (the pack is the only writer) and write it once per change; add `updateMany` so one project writes the index once. In `finishProject`, build one map of online players.
- Prove it with: a unit test with a fake world counting property reads and writes for 100 `update` calls; `town-news.js` and `bounty-news.js`.

### ENT-24 dolphin_bp: a ridden dolphin costs about 16 native calls per rider per tick  [medium / confirmed count / S / low]
- Where: `packs/dolphin_bp/scripts/main.js:491-518`, `mountOf` `:354-361`, `steer` `:378-412`.
- What happens and how often: every tick per rider: `p.isValid`, `mountOf` (`getComponent`, `entityRidingOn`, `isValid`, `typeId`, the owner property: 5), `isJumping`, then `steer` (`isInWater`, `inputInfo`, `getMovementVector`, `getViewDirection`, `getVelocity`, `applyImpulse`, `getRotation`, `setRotation`: 8), `currentTick`. Also, while any tamed dolphin is loaded, every player is asked for a riding component every 5 ticks (`:476-489`).
- Cost estimate: about 0.16 ms/tick per rider; two friends riding is more than a typical pack's whole budget. The soak has no riders.
- Fix: re-check the mount every 5 ticks, not every tick (the Sneak handler at `:521-532` can call `dropRider` itself, and a `steer` on a dolphin that is gone throws and drops the rider); skip the owner property when `entityRidingOn.id` equals the known `r.d.id`. About 9 calls a tick.
- Prove it with: `dolphin-riding.js` under `--profile` with 2 riders; its steering checks for behavior.

## Low-impact table
| ID | Where | What | Fix |
|---|---|---|---|
| ENT-04 | `tools/name-labels-shared.js:283-289`, `:298-305`, `:350-353`, `:373-377` | One distance both creates and removes a helper, so each crossing of 24 (36) blocks is a remove, a full `nameTag` write, a spawn, 3 tags, a caption write and a second teleport to where it was just spawned (`entry.at` unset). Per crossing, not per sync. | Remove at range + 4; set `entry.at = anchor` after the spawn. |
| ENT-10 | `packs/bounty_bp/scripts/main.js:366-381`, `packs/elite_bp/scripts/main.js:612-626` | A clean spot reads 81 columns: 81 `getTopmostBlock`, 405 `getBlock`, 405 `typeId` and about 570 `top.y` (the loop condition), up to 1,460 calls in one tick. Bounty: once per target spawn (a built spot exits early; at most 6 tries 2 s apart). Elite: once per Stormcaller strike. | Hoist `top.y`; test the 81 top blocks first; spread over ticks if it shows in the slow-tick record. |
| ENT-12 | `packs/dolphin_bp/scripts/main.js:538-579`, `:135-142`, `:108-132`, `:171-185` | Every second: the whole index is copied (`Object.fromEntries`) even with no dolphin loaded, 3 type queries, one property read per wild dolphin; when a tamed one moved a block, every owner's list is rebuilt and stringified and that owner's property written (1 write a second while it swims). | Tag tamed dolphins and query by tag; keep `known` as the live map with a set of dirty owners; save a position only after 16 blocks. |
| ENT-13 | `packs/dolphin_bp/scripts/main.js:336-337`, `packs/npc_bp/scripts/main.js:575-577`, `packs/elite_bp/scripts/main.js:1149-1161`, `packs/bounty_bp/scripts/main.js:705-707` | Per death in the world: dolphin 1 call, npc 1, elite 2, bounty 1. | `entityTypes` for dolphin and npc; elite: `known.has(id)` first. |
| ENT-14 | `packs/town_bp/scripts/main.js:2485-2497`, `:2542-2556` | A build in progress: `autoGeometry` (plan decoded) every tick; in the outline phase every player is read every tick (4 calls) though used every 10th; in the apply phase `playersOn` (3 per player) and a volume `getEntities` every tick. | Cache `geo` on the job; read players and clear mobs every 10 ticks. |
| ENT-15 | `packs/town_bp/scripts/main.js:2071`, `:2077` | `dim.heightRange` read per column (1 of about 10 calls). | Once per job. |
| ENT-16 | `tools/name-labels-shared.js:345-348` | Every caption write is read back. | Read back on the sweep sync only. |
| ENT-18 | `packs/npc_bp/entities/npc_name_probe.json` | No script uses it (a scenario header describes a manual probe). | Delete, or say why it stays. |
| ENT-19 | `packs/bounty_bp/scripts/main.js:718-720` | Each cull kill by a player with notes on: a preference read (XC-04), a `realm:actionbar` event (67 listener wake-ups, XC-01) and an action bar packet; a sweeping hit on a grinder sends 10 in a tick. | One per player per 10 ticks, latest text. |
| ENT-20 | `packs/elite_bp/scripts/main.js:526-534` | `convert` reads a column top and 75 blocks (150 calls) before the JS-only `recent` spacing test. | Move the `recent` test up. |
| ENT-21 | `packs/platypus_bp/scripts/main.js:48-56`, `:93-94` | Three subscriptions each read `typeId`. | One spawn handler, one read. |
| ENT-22 | `packs/wander_bp/scripts/main.js:1339-1354` | Per loaded entity `typeId` 3 times; per vanilla villager or trader `isValid` and `hasTag` twice. | Part of ENT-30; `audit` returns whether it is ours. |
| ENT-25 | `packs/npc_bp/scripts/main.js:538`, `:1751-1760` | Bug: a townsfolk with no saved skin and any non-player entity within 2 blocks (a painting, an armor stand, a pet) fails `saveSkin` every 10 s, and `saveSkin` removes its label first (`:1754`): the label is removed and spawned again every 10 s, with 2 queries and a structure lookup. | Check for neighbors before `removeFor`; back off to once a minute after a failure. |
| ENT-26 | `packs/town_bp/scripts/main.js:441`, `:450` | `online(id)` once per contributor. | Part of ENT-11. |
| ENT-27 | `packs/npc_bp/scripts/main.js:632-642`, `packs/caravan_bp/scripts/main.js:749-767` | Turning to a player is a teleport per townsfolk or trader per half second (a move packet each), bounded by `TURN_MIN` 4 degrees. | Raise `TURN_MIN` to about 10 if packets matter. |
| ENT-32 | `tools/name-labels-shared.js:159-181`, `:236-241`; `packs/wander_bp/scripts/main.js:1356-1366`; `packs/caravan_bp/scripts/main.js:576-585`; `packs/npc_bp/scripts/main.js:561-571`; `packs/elite_bp/scripts/main.js:1299-1304`; `packs/bounty_bp/scripts/main.js:521-533`; `packs/dolphin_bp/scripts/main.js:171-185` | Backstop sweeps with nothing to do: about 100 whole-dimension `getEntities` per 10 s across six packs (wander's label sweep runs every second), most of them on tick multiples of 200 (XC-03). The label helpers are saved with their chunk, which is why strays exist. | Sweep labels once a minute; try `minecraft:transient` on the three label entities so they never persist (verify on BDS), and drop `minecraft:physics` from them. |
| ENT-33 | `packs/bounty_bp/scripts/main.js:433`, `:423-425`, `:437` | Every 2 s per champion target: `p.location` twice per overworld player; for a spawned target a tag query over the whole dimension even with nobody near. | Read places once per run; query only when a player is within `spawnDistance`. |
| ENT-34 | `packs/town_bp/scripts/main.js:1707-1742`, `:2494` | An outline is about 250 `spawnParticle` calls per player per draw (step 0.5), twice a second for 5 s per automatic build: 2.5 ms of calls and 250 packets per nearby player per draw. | Step 1 block; draw every 20 ticks. |
| ENT-35 | `packs/npc_bp/scripts/main.js:1918-1982`, `:2080` | `/realm:npc_houses` (operators, once): per door about 170 block reads for `cover` and up to 180 for `standNear`, all in one tick; 40 doors is tens of thousands of native calls. | Spread over ticks with a generator, as the town scan does. |
| ENT-36 | `packs/town_bp/scripts/main.js:3061-3072`, `:3100-3115`; `placed.js:79` | Every placed block wakes the handler (1 `typeId`); while a player places natural blocks in a town, both cell properties (up to 2 x 10 KB) are encoded and written every 10 s. | `blockTypes` filter (XC-06); write only the part that changed. |
| ENT-37 | `tools/tether-shared.js:74-87`, `:97-148` | A last-resort snap with no free spot reads up to 74 columns at up to 5 calls per block (`getBlock`, `typeId` twice, `isLiquid`, `isAir`): about 1,100 calls. The snap guard backs off to 30 s. | Read `typeId` once per block and derive air and liquid from it (as elite_bp's `lookAt` does). |
| ENT-38 | `packs/caravan_bp/scripts/main.js:304-307`, `:784-792`; `packs/wander_bp/scripts/main.js:645-659` | With no visit, `caravan:last` is read from the world every 2 s. `protect` costs 5 calls per wanderer every 10 ticks. | Cache the value; protect every 100 ticks. |
| ENT-39 | `packs/town_bp/scripts/main.js:557-612`, `:922-928` | A build at an operator-set spot saves its snapshot and places the whole design in one tick (about 4 calls per block). | Send it through the build job as automatic spots are. |
| ENT-40 | `packs/npc_bp/scripts/main.js:519-545`, `:561-571`, `:801` | Every 10 s each loaded townsfolk is audited (about 18 calls: two `getTags`, 4 to 5 `hasTag`, a block read) and `auditAll` runs a second label sync in the tick the regular one runs. | Audit on load and on change; drop the extra sync. |

## Rejected leads
- ENT-17 (`llamaTether` never forgets): true, but 2 llama ids per visit, one visit a week, cleared at every restart. Not worth a change.
- ENT-23 (`villager_v2.json` schedule groups): not a performance lead, and it cannot be compared with Mojang's file offline.
- ENT-03, "idle mobs sway more than 0.01 blocks": nothing in the code supports it; a standing mob's head location is constant, so its helper is not teleported.
- ENT-05, "the minutes come from pacing, not block reads": half right. The first walk is bound by reads (12 columns a tick); only walks over cached columns are bound by the 100-unit budget. The larger cause, scans repeated from scratch, was missed.
- ENT-08, "open a helmet watch window in `entityDie`": the item's spawn event can arrive before the death event (`elite_bp/scripts/main.js:300`).
- ENT-09, "the 5-second refresh is the source of the noise": at soak scale (0 to 2 champions) the refresh is 0 to 40 calls per 5 s. It is a spike at the 32-champion cap, not the spread.
- ENT-10, "repeats every 2 s while it keeps failing": a failing check exits at the first built block; only a clean spot pays the full scan, once.
- ENT-11, "every join's `take` parses and rewrites the index": only when something was owed (`owed-shared.js:332-333`).
- First pass "checked and fine", pen `entityDie` "JS only": it calls `getTags()` once per sheep or chicken death (`town_bp/scripts/main.js:2774`). Still cheap.

## Checked and fine
- `town_bp/entities/villager_v2.json`: one bool property with no client sync, one component group (dweller without POI search, home restriction) and property filters on vanilla schedule events. Nothing is added per villager per tick.
- platypus_bp and platypus_rp: density limit 3, herds of 1 to 2; two 64x32 textures (1.6 and 2.3 KB), a 9-bone model, one render controller, a two-state animation controller. `minecraft:persistent` is a base component, so platypuses stay like vanilla animals do (bounded per area by the density limit).
- guard_bp: `event.source?.typeId` first; the default mode `everywhere` clears the list at once. In zones mode it reads each impacted block's location before testing zones (about 100 calls per creeper): acceptable.
- town_bp residents: the census is one tag query per town per 30 s while a player is in it, about 6 calls per resident, at most 2 spawns; saved only on change. Resident and pen `entityDie` are filtered by type. `progCache`, `resCache`, `lifeCache` and `placedCells` are bounded by towns and projects.
- town_bp saved data: one property per town (spots with their plans, up to about 15 KB), written on events only; the job ticker clears itself when idle (`main.js:2611-2614`).
- npc_bp: `affCache`, `flagCache`, `heardCache`, `busy`, `lastTap` are cleared on leave; gossip is capped at 24 and gated to one piece per pack per in-game hour; the day counter saves on change.
- wander_bp: the handle cache, `entityRemove` and `entityDie` with `entityTypes`, the tether's `forget`, `hasOffer` cleaned on leave, rolls spread over 60 slots, per-wanderer queries on a busy server (`labelObservers`).
- caravan_bp with no visit: the loops return after one or two cheap tests (but see ENT-30 and ENT-38).
- elite_bp: the aura and approach round robins are capped (12 and 8 a run); `hitters`, `nextStrike`, `detours`, `nearState` are pruned on death and every 5 s.
- Helper counts: one per labeled target, only while a player is in range; at most 12 cast, 64 mayors, 3 traders and 13 wanderers. Nothing grows without bound.
- `tools/gossip-shared.js` (64 keys kept), `tools/spawn-shared.js` (8 tries).

## Not read
- `packs/town_bp/scripts/main.js` 1104-1690 (menus) and 3938-4025 (commands) line by line; `designs.js` design tables; `life.js` `planPosts`; `mayors.js`.
- `packs/npc_bp/scripts/mayors.js`, `hearth.js` (data). `packs/wander_bp/scripts/lines.js` (data).
- `packs/elite_bp/scripts/main.js` 1477-1679, `packs/bounty_bp/scripts/main.js` 788-988, `packs/dolphin_bp/scripts/main.js` 600-777, `packs/guard_bp/scripts/main.js` 176-356 (menus and commands).
- `tools/owed-shared.js` 1-40; `tools/prune-shared.js` bodies (not used by these packs); every pack's `zones.js` copy (the weather and utility reader's).
