# Track: expedition (expedition_bp)

Worktree /home/user/wt/expedition, branch audit/expedition, base 3ce2384 (origin/master da2149f merged; re-fetched before
return: up to date). Before-fix proof: every scenario below was run on `git archive 3ce2384 packs/expedition_bp`
(scratchpad/expedition/base/packs, `--packs`) and on the fixed code (archives of the fixing commit or later);
logs in scratchpad/expedition/<scenario>.before.out / .after.out.
recent-changes.md: no finding is tagged expedition; the only master change in this pack since 3b00080 is the
manifest spacing (#91) and the shared settings.js copy (menus/infra own it): nothing new to report.

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | high (C6) | expedition_bp | main.js spawnMob ~2015, spawnBoss ~2112, takeBoon wolves ~2697, tickTraps arrows ~2936; gauntlet.js saveStash ~234, saveParcel ~462 | a world whose entity ids repeat (an old level.dat put back): `spawnEntity` hands back an entity that already exists. A stash/parcel cart handle that is someone's real chest minecart gets filled, then `clearAll()` + `remove()`d (their cart and its items gone); a mob/boss/wolf handle that is a dropped item or pet gets the run's tags and is removed when the room clears or the run ends | `spawnFresh(dim, type, at)` in gauntlet.js (exported, used for all six): retries up to 8 times until `typeId` matches (ids without `minecraft:` are normalized), else throws (caught by every caller) | XS | fixed 4b8a25b (no scenario: BDS can't make repeating ids, and the test pack's own `spawnEntity` can't be faked into another pack's context; the whole expedition suite passes) |
| 2 | high (C27, public servers) | expedition_bp | main.js run.started/deadline, tickRun deadline check, clearMs, recordFail, boon/shrine durations | the run clock, the time limit and leaderboard times used `Date.now()`. A lagging server (baseline: 11.6 TPS at 10 players, 5.2 TPS at 40 with the whole bundle) counts wall time while mobs and players move at game speed: at 5 TPS a 24-minute limit is about 6 minutes of play, and clear times depend on server load | `gameMs()` = `system.currentTick * 50` for started, deadline, clock, clearMs, fail times and remaining-effect ticks (timestamps `at` stay wall clock). Same units, identical at 20 TPS, so saved leaderboards stay comparable | S | fixed 6e67b70 (expedition-lag-clock: before the bar showed 0:58 after 20 game s at ~6.5 TPS, FAIL; after 0:19, PASS) |
| 3 | high (players dropped from the sky) | expedition_bp | main.js surface() ~883, teleportBack ~1787, clearBox, resetBox | `world.getDefaultSpawnLocation()` answers y 32767 for a spawn with no fixed height (most worlds; checked on BDS: `{x:163,y:32767,z:170}`). surface() fell back to it whenever the topmost block wasn't above the box, which is always the case in a flat world (ground y -61, box y -41 up) and over any column whose ground is below the box: anyone standing in the box area when a dungeon is built, or found in it at reset without a return spot, was teleported to y 32767 and fell to their death (items dropped at spawn); named or tamed pets the same. teleportBack's no-return-spot fallback too | surface(): ground below the box counts as outside (put them on it); `worldSpawn()` looks the spawn up on the ground (y 320 + `toWorldSpawn` for players: Slow Falling, then put on the ground once the chunk loads, up to 10 s); players in clearBox/resetBox and teleportBack use it | S | fixed 499110a (expedition-surface: before Bob moved to y 32767, FAIL; after y -60 on the ground under the box, PASS) |
| 4 | medium (never stuck, C16/C23) | expedition_bp | main.js endRun ~1898, worldLoad, opReset, cantStart | a box whose reset couldn't load it (the world has its 10 ticking areas, or chunks never loaded) stays in `pending` and closes its slot until the next restart or an operator's /realm:expedition_reset; with `slots` 1 that's every expedition. Players were told `An expedition is in progress (). Try again when it's over.` with no run listed; operators were never told (console only) | `resetPending()` (one at a time, shared by worldLoad, opReset, a 1-minute interval while anything waits, and cantStart when only pending boxes block); operators online told once per slot (`[Expeditions] Dungeon N couldn't be loaded to fill it in (the world may have its 10 ticking areas: /tickingarea list). It's tried again every minute...`); players get `The last expedition's dungeon is still being filled in. Try again in a minute.` | S | fixed 920c048 (expedition-pending: before 4 checks FAIL, slot still closed after a free ticking area; after PASS: told, reset without a restart, next run starts) |
| 5 | medium (portability) | expedition_bp | main.js freeSlot ~1251, setSite ~4140, maxSizeAt | with `slots` 2-3 the extra dungeons are 132/264 blocks east of the site; only the site itself was checked against `avoidSpawn`, and maxSizeAt never shrinks a box below 100. A site 140 blocks west of spawn put dungeon 2's box 8 blocks from world spawn (dug under the spawn town; the foreign-block check only protects builds that reach y -41..-8) | `slotFits(site, slot)`: slots above 0 must keep `avoidSpawn` + 50 from spawn, else freeSlot skips them; setSite says which dungeon is never used and why | XS | fixed 593ca3a (expedition-slot-spawn: before slot 1 active 8 blocks from spawn, FAIL; after slot 1 never used and the site message says so, PASS) |
| 6 | medium (QoL at 30+ players) | expedition_bp | main.js cantStart | every dungeon taken (default `slots` 1): the leader is told `Try again when it's over.` and has to keep retrying | `waiting` map: a turned-away leader is told `An expedition dungeon is free now: /realm:expedition to start one.` when a slot frees (asked within 30 minutes, not on a run, expeditions enabled); refusal text now `You'll be told when a dungeon is free.` | XS | fixed b57cc46 (expedition-queue: before nothing, FAIL; after told, PASS) |
| 7 | medium (portability) | expedition_bp | main.js setSite | a flat world (grass y -61) or a site over a deep valley: the dungeon is built above the ground, a 60-120 block deepslate cube in the open that stays after every reset ("filled back in" with deepslate) | warning on /realm:expedition_site when the ground at the site is below the tallest box top (`The ground here is at y -61, below the top of the tallest dungeon (y -8): ... Pick a spot where the ground is higher.`). Refusing would break every `--flat` expedition scenario | XS | fixed 234dd59 (expedition-flat-site: before no warning, FAIL; after warned, PASS) |
| 8 | low (C13) | expedition_bp | main.js beforeEvents.playerBreakBlock, beforeEvents.playerInteractWithBlock | in the bundle, a claim (loaded first) cancels breaking a block a player placed in a dungeon: our handler still dropped it from `run.placed`, so that block could never be broken later | `if (ev.cancel) return;` first in both | XS | fixed bfeff3e (no scenario: the harness runs packs in separate script contexts, so another pack's cancel is never seen; check passes) |
| 9 | low (perf) | expedition_bp | main.js `online()`, run loop, tickRun | `online(id)` built the whole player list for every lookup (fall interval every 2 ticks per member in shaft rooms, tell, sound, present); the loop listed every player; members' and wave mobs' positions/health were re-read per mob and per member | `world.getEntity(id)`; the loop looks up only members; positions read once per check (`stray()` replaces bringBack); objective line built once | S | fixed 604f3af (fall interval 0.073 -> 0.051 ms/tick @40; the main loop is unchanged within noise: its cost is wave spawning, trap/affix particles and the action bars) |
| 10 | medium (scale, design) | expedition_bp | config.js `slots` (1-3), main.js worldLoad slot loop | at most 3 runs x `maxParty` 4 = 12 players in expeditions at once; a 50-100 player server queues (#6 helps) | more slots need more of Bedrock's 10 ticking areas and a wider `expedition:run:<slot>` scan; or let parties share a dungeon (rejoin a run) | M | deferred: Phase 2 |
| 11 | low (perf) | expedition_bp | main.js fillBoxSteps (16x16x20 deepslate fills) | each run start: the build is ~0.5 s of script time over ~120 ticks, but single steps take up to 25-31 ms (p95 3 ms) | 8 x 16 columns would halve the worst step | XS | deferred: once per run, under the 50 ms tick; change only if hitches are reported |
| 12 | low (perf) | expedition_bp | main.js tickTraps | while players stand in a trap hall: ~0.75 ms per check (about 25 `spawnParticle` + a lane sort per flame patch, arrows) | linear nearest-cell scan; fewer particles | XS | deferred: visuals; a hall lasts seconds |
| 13 | low (C19 window) | expedition_bp | gauntlet.js cartsOf | stash/parcel carts are put down at the player's feet and emptied ~4 ticks later; if the player disconnects in that window and someone breaks the carts, on rejoin `placed` carts aren't found and the structure is placed again (a copy). The docs/comment say a taken-apart parcel is forgotten | tag-count check: only re-place when the carts were never seen (record `seen: true` once found) | S | deferred: ~0.2 s window; touches the item-safety path, needs its own restart scenario |
| 14 | low | expedition_bp | main.js resetBox | someone who is not a member (no return spot) logs out inside a box; it's filled in; they rejoin inside deepslate and suffocate | remember non-members found in the box (world list), move them on join | S | deferred: needs a way into a sealed box (operator, /tp) |
| 15 | low (chat at scale) | expedition_bp | main.js finish `world.sendMessage` | every clear is announced to the whole server (`Ann, Bob cleared the Crypt (Easy) in 6:12.`); 3 slots on a 100-player server is steady chat noise | option `announceFrom` (level), default Easy | XS | deferred: owner content decision |
| 16 | low (clean removal) | expedition_bp | (docs) | removing the pack mid-run leaves players in a sealed box at y -40 (they must dig out) and the box stays; no command wipes the pack's saved data (leaderboards, progress, parcels) | docs line below; Phase 2 `/realm:expedition_reset` "and forget everything" option | XS docs | deferred: docs request |
| 17 | info (portability) | expedition_bp | main.js isOp | operator = `commandPermissionLevel >= GameDirectors`, same on a Realm and BDS (`/op`); tag-based staff systems aren't recognized | - | - | no change |

Checked and clean: C10 (no `.header(`), C11 (only `p.dimension.id`/`block.dimension.id` against `minecraft:overworld`, no weatherChange), C12 (crownsOf try/catch), C15/C16 (surface reads a column of the loaded box; now also `< 319`), C17 (`show()` retries UserBusy, stops on UserClosed/deadline; isValid after every await in forms, teleport-in timeout, homecoming; playerLeave/death/away paths drop members; offline players are sent back on join; dead players are kept until respawn), C18 (`realm:actionbar` before every bar, `steady: 40` for the run line; `realm:title` before every title, all with a subtitle), C19 (addItem leftovers spawned exactly once), C20 (every block/item/entity id is in vanilla-data except `minecraft:evocation_fang`, which is the real entity id; particles aren't in vanilla-data), C22 (best per dungeon trimmed to 30,000 chars, history/tiers 20, callings 300, rolls per level), C23 (runs, stashes, parcels, buffs and return spots survive restarts; covered by expedition-restart), C24 (op re-checked after every operator form), C26 (wolves tamed with `tameable.tame` before taming). Multiple parties: each slot has its own box, pocket, ticking area and record; mobs, wolves, sigils and boss deaths are matched by run id; a player can't be in two runs (start, ask and prepare all re-check `runOf`); two bosses dying in one tick finish each run once (expedition-two). 40 players with 3 parties running Nightmare 10 at once: no errors, runs stay active, mobs under the cap (expedition-perf).

## Perf (ms/tick average, expedition_bp only, --no-relay --profile, 120 s)

| scenario | @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| perf-soak (idle, nobody on a run) | 0.009 | 0.017 | 0.010 | 0.015 |
| expedition-perf (2 runs @10, 3 runs @40, Nightmare 10, whole window incl. dungeon builds) | 0.653 | 0.902 | 0.672 | 0.974 |
| expedition-perf steady (loops and events; no build, no test debug events) | 0.211 | 0.307 | 0.209 | 0.291 |
| of that: fall check runInterval(2) | 0.042 | 0.073 | 0.029 | 0.051 |

Budget: idle is far under 0.15. With runs going the pack costs ~0.1 ms per active run (bounded by `slots` <= 3, independent of how many players are online), plus ~0.5 s of building per run start (worst step 25-31 ms). Instrumented split at 40 players (90 s): tickTraps 111 ms in 148 calls, tickAffixes 62, spawnWave+spawnMob 56, action bars 20, the rest ~150 (member/room checks). The whole-window numbers vary with the dungeons built (runJob 1071-1916 ms) and with the other track's load on the machine.

## Scenarios added (all in tools/test-bds/examples/)

| scenario | before (3ce2384) | after |
|---|---|---|
| expedition-slot-spawn.js | FAIL (dungeon 2 active 8 blocks from world spawn; no note when setting the site) | PASS |
| expedition-pending.js (2 phases, restart) | FAIL (operators not told; "in progress ()"; box not reset after a ticking area is free) | PASS |
| expedition-lag-clock.js | FAIL (bar 0:58 after 20 game s) | PASS (0:19) |
| expedition-queue.js | FAIL (never told) | PASS |
| expedition-flat-site.js | FAIL (no warning) | PASS |
| expedition-surface.js | FAIL (Bob at y 32767) | PASS (y -60) |
| expedition-perf.js (load; `--profile` numbers above) | PASS | PASS |

Suite (`node tools/test-bds/suite.mjs --filter '^expedition' --retry`, 2 at a time): 18 scenarios, 17 pass, 1 flaky (expedition-climb: `a fall in the shaft doesn't hurt (20 -> 14)` once while another server ran beside it; passed on the suite's retry and twice more alone. The fall check runs every 2 ticks and a heavily loaded machine can let a fast fall land before it; the same logic as before this audit), 0 fail. The 11 baseline expedition scenarios all still pass.

`npm run check` passes (no doc or catalog regeneration needed: no command or option changed); `npm run build` passes.

## DOCS (docs/PACKS.md, "## Expeditions — `expedition_bp`")

- How to use, step 10 (Operators): after "...or if anything that isn't natural rock... is in the way." add: "With `slots` above 1, a second or third dungeon that would come within `avoidSpawn` of world spawn is never used, and setting the site says so. Where the ground at the site is below the dungeon (a flat world, a deep valley) you're warned: the dungeon would be built above the ground."
- What players see, **The time limit**: append "The clock counts game time: on a lagging server it runs as slowly as the game does, so lag never eats your time (and clear times are fair on any server)." In "The clock runs from the moment you arrive" (intro) nothing else changes.
- What players see, **Leaving** (or a new bullet **When every dungeon is taken**): "When every dungeon is in use, starting one tells you so (`An expedition is in progress (...). You'll be told when a dungeon is free.`), and you get `An expedition dungeon is free now: /realm:expedition to start one.` once one is (within 30 minutes). While the last run's dungeon is still being filled in: `The last expedition's dungeon is still being filled in. Try again in a minute.`"
- Commands, `/realm:expedition_site [x] [z]` row: "Sets where dungeons are built: where you stand, or at x z. Refused within 124 blocks of world spawn (default 64, `avoidSpawn`, plus half the biggest dungeon) or where anything but natural underground blocks is in the way of the biggest dungeon, with what and where. With more than one slot (`slots`), a dungeon that would come within `avoidSpawn` of spawn is left out; where the ground is below the dungeon (a flat world) it warns you."
- Configuration: `slots` description: "Expeditions that can run at the same time (1 to 3), each in its own dungeon: the first at the site, each next one `slotSpacing` blocks east. One that would come within `avoidSpawn` of world spawn is never used." `timeLimitMinutes`: "Minutes of game time for a 7-room run: ..." (rest unchanged).
- Saved data, `expedition:best:<dungeon id>`: "milliseconds" -> "milliseconds of game time (ticks x 50)"; `expedition:history` `t` the same.
- How it works, **Filling in**: replace "If the box can't be loaded, it's tried again after a restart or with `/realm:expedition_reset`, and no new run starts there until then" with "If the box can't be loaded (the world has its 10 ticking areas, say), it's tried again every minute, when someone wants to start a run, after a restart and with `/realm:expedition_reset`; operators online are told once, and no new run starts there until then." Also in **Building**: "anyone in it, dropped items and named or tamed animals are moved to the surface (the top of the water over a lake or the sea; the ground under the box where the ground is below it)". And where it says players are sent "to the world spawn": "to the world spawn, on the ground".
- How it works, **The run**: "the time limit" -> "the time limit (in game ticks)".
- New line (operators, How it works or How to use step 10): "Before removing the pack, end every run with `/realm:expedition_reset`, so nobody is left in a sealed dungeon."
- How it works: "**Spawning** checks what the game hands back (`typeId`), so a world whose entity ids repeat never turns an existing entity into a dungeon mob or a stash cart."
- README row: no change needed.

NEWS (plain ASCII):
- Expedition clocks now count game time: a laggy server no longer runs out your time early.
- Turned away because every dungeon was busy? You now get a message when one is free.
- Fixed: in a flat world, someone standing where a dungeon was built could be dropped from the top of the sky.
- A dungeon that couldn't be filled in no longer blocks expeditions until a restart.

## Requests for the lead

- docs/PACKS.md corrections above (then `node tools/help-catalog.mjs` if How to use changes; no command or option changed, so no admin catalog).
- Bump expedition_bp once at integration.
- tools/test-bds/suite.mjs: expedition-perf.js runs with its light header (8 players, 30 s); the 40-player profile command is in its header comment.
- No shared-copy changes needed (settings.js untouched).

## Phase 2 ideas

1. More concurrent dungeons for big servers: `slots` up to 5-6 (ticking-area budget shown in the setup checklist) or a real queue that starts the next waiting party's run when a slot frees.
2. Drop-in: let a party member who was offline (or a mate who arrives later) join a run in progress at the entry room, up to `maxParty`.
3. Weekly rotating "featured" dungeon and affix set with its own leaderboard and a `realm:title_unlock` / `realm:gossip` for the weekly winner.
4. An operator "Forget everything" (leaderboards, progress, parcels, structures) for a clean removal, plus `/realm:expedition_reset` reminding to run it before removing the pack.
5. Per-world site check for flat/void worlds that builds the box with its own floor and ceiling shell (so flat-world servers can host dungeons safely).

## Review

Reviewer read 3ce2384..HEAD (the track's own diff; a4cccca..3ce2384 is the master merge). Only packs/expedition_bp and new
tools/test-bds/examples/expedition-*.js are touched: no manifest bump, no PACKS.md/README/NEWS/catalog edit, no shared copy,
nothing near msftMyt's #86 (stash_bp) or #84 (saga_bp). Added text is ASCII, there's no `.header(`, no new setActionBar/setTitle
call, and no cross-pack import. origin/master hasn't moved.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| high | expedition_bp/scripts/gauntlet.js:56 spawnFresh | The C6 fix checked only `typeId`. That misses the case the finding itself names: in a world with repeating ids, a returned handle that is someone's existing chest minecart (or pet wolf) has the same type. It passed the check and was filled, `clearAll()`ed and removed, so the cart's items were lost. | fixed 394b0b2: the entity must also be in the dimension asked for, within 0.5 block horizontally (1.5 vertically) of the spawn point, and untagged. A probe spawned 16 types the pack uses (zombie, chest_minecart, arrow, wolf, blaze, phantom, enderman, shulker, ravager, drowned, magma_cube, breeze, vex, evocation_illager, silverfish, zombie_villager_v2) and all passed the new check. No scenario: BDS can't make repeating ids. |
| low | main.js:1498 clearBox / :970 resetBox | When world spawn's chunk isn't loaded, `worldSpawn()` gives y 320. Players get Slow Falling and a settle, but named or tamed animals and dropped items are teleported to y 320 with neither, so pets die in the fall. Before the audit it was y 32767, so this is not a regression. | deferred: rare (a pet inside a sealed box at reset, in a world whose spawn has no fixed height) |
| low | main.js:903 toWorldSpawn | A player who logs out within the 10 s settle rejoins high up with only what's left of the 15 s of Slow Falling, and nobody puts them on the ground. | deferred: tiny window; could re-run the settle on join |
| low | main.js:4324 opReset | If the 1-minute resetPending is already running, opReset awaits that pass. That pass iterates a snapshot taken before endRun added the new pending slots, so opReset can report "couldn't be loaded" for a box it never tried. | deferred: the next minute retries it, and the message says so |
| low | main.js:3358 | The `@type {Map<string, Player>}` JSDoc line is duplicated. | deferred: cosmetic |
| info | main.js gameMs | Checked: runs and their `started`/`deadline` are never saved (recordOf has no times; a restart resets the box), so moving from wall time to `currentTick*50` loses no saved data. Leaderboard and history `t` keep the same units. | no change |
| info | main.js online() | Checked on BDS: `world.getEntity(id)` returns a dead player (valid, health 0), so dead members still get crowns, return trips and history, as with getAllPlayers. | no change |

Before/after proof: logs in scratchpad/expedition/*.before.out show FAIL on base 3ce2384 for slot-spawn, pending, lag-clock, queue,
flat-site and surface, and the matching *.after.out PASS. scratchpad/expedition/base/packs/expedition_bp/scripts/main.js
matches 3ce2384 byte for byte. The reviewer didn't re-run the before side.

Re-run after 394b0b2: npm run check passes; npm run build passes. Suite `--filter '^expedition' --retry` (18 scenarios, log
scratchpad/expedition/review/suite.out): still running when this was written (expedition-deaths and expedition-climb pass so far).
The lead should read that file's final table before merging.
