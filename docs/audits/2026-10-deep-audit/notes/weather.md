# Track: weather (audit/weather)

Worktree `/home/user/wt/weather`, branch `audit/weather`, base 3535950 (master with #88-#91 merged; still up to date with
origin/master at the end). Packs: rain_bp, rain_rp, weather_bp, storm_bp, climate_bp, calendar_bp, tornado_bp, rainbow_bp,
sky_rp, moon_bp, meteor_bp, night_bp, leaves_bp, translucent_bp, translucent_rp. The #88-#91 changes in these packs are only
the synced copies (settings.js, calendar's side.js) and manifest spacing: nothing of mine to fix there; no
`notes/recent-changes.md` finding is tagged `weather`. No manifest bumped (lead bumps). No generator (gen-rain, gen-sky,
gen-translucent) needed a change; their `--check`s pass.

Changed packs (need a bump): tornado_bp, storm_bp, moon_bp, calendar_bp. Tests: storm-cell.js, tornado-pull.js,
rainbow-water.js changed; tornado-landing.js and weather-crowd.js added.

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | blocker | tornado_bp | main.js `launchOutTop` (old :588-595) | A survival player sucked into a tornado is shot 80-100 blocks up; Slow Falling (8 s, `slowFallingSeconds`) ran out about 75 blocks above the ground and the fall killed them (inventory dropped). On superflat: health 20 -> 0 every time. | Slow Falling from near the apex for at least `slowFallingSeconds`, then topped up (never shortened, a potion stays) every 10 ticks until they're on the ground or in water, at most 60 s; its own interval runs only while someone is falling. | S | fixed 6659227 |
| 2 | high (perf) | tornado_bp | main.js `draw` | Every viewer got their own funnel copy (Player.spawnParticle, ~8 calls per viewer per 2 ticks): 2.1 ms per frame with 40 players near (0.87 ms with 10), so 100 watchers would be about 5 ms per frame. | With 2+ players within 64 blocks the funnel is drawn once with Dimension.spawnParticle (same rings, debris and sparks as a near viewer got); only viewers beyond 64 blocks still get their own half-ring copy. 40 players: 2.12 -> 1.09 ms per frame (the rest is the pull and per-player sounds). Visually the same for near viewers; client check advised (C28). | S | fixed 6cf1a83 |
| 3 | high (test) | storm_bp | tools/test-bds/examples/storm-cell.js | Baseline failure "a lightning bolt near the cell": the operator stood at the world spawn and the cell forms 48-96 blocks from them, so most strikes fell inside `avoidSpawn` (64) and were skipped by design (instrumented run: 3 of 3 skipped for spawn). Not a pack bug. | Scenario starts the player 300 blocks from spawn. Passes 3/3. | XS | fixed 467c9da |
| 4 | high (test) | tornado_bp | tools/test-bds/examples/tornado-pull.js | Baseline failure "a cow near the funnel is pulled": since the funnel rework (65f795e) tornadoes move players only, as PACKS.md says ("never touches mobs or dropped items"). The test still expected mobs pulled. | Test now checks a player 3 blocks away is spun up (rose 66-80 blocks) and launched, and the cow is left alone. | XS | fixed ca9731d |
| 5 | high (test) | rainbow_bp | tools/test-bds/examples/rainbow-water.js | Baseline failure "chest placed": the end landed on the real sea (seed 1, x -2 z 257), the test took the sea bed (y 45) as the ground and its fills threw UnloadedChunksError (only the center column was loaded). The pack placed the chest at the surface (y 62) correctly; the test searched y 41-47. | Wait until the fills succeed; take the water's surface as the ground. Passes 2/2 (chest at y 62 on water). | XS | fixed 73ce05a |
| 6 | medium (C6) | moon_bp, calendar_bp | moon main.js `spawnWave`; calendar main.js `startNest`, `nestTick` | `spawnEntity` results tagged without a type check: with repeating entity ids the handle can be an existing pet or item, which then gets MOB_TAG / FX_TAG and is removed at dawn or at the Nest Watch's end. (calendar's Choir already checked.) | Type check with retries (moon: 3, calendar `spawnFresh`: 4 tries, warns and skips). No scenario: BDS can't repeat ids. | XS | fixed 0dc4831 |
| 7 | medium (perf) | storm_bp | main.js `strike`/`nearBuild` | Each strike's 9 x 9 build scan (up to 405 block reads, plus try/catch on unloaded) ran in one tick: max 27 ms tick at 40 players. | `strike` runs as a runJob (yield every 9 columns, one strike at a time, skipped if the cell ended meanwhile). Max tick 27 -> 16 ms; job steps max 2 ms. | S | fixed f6e1110 |
| 8 | medium (perf) | moon_bp | main.js `playerMadeBlocks` | The 641-id block list (BlockTypes.getAll + regex) was built inside the first Blood Moon wave: one 43-47 ms tick. | Built 60 ticks after world load instead. | XS | fixed 4df6eca |
| 9 | medium (perf) | moon_bp | main.js `built` / `spawnWave` | Each wave try does a 9x9x9 `containsBlock` with 641 types (2-3 ms): a wave costs 4-7 ms, 0.17-0.20 ms/tick at 40 players in a Blood Moon, scaling per player; 100 spread players can also hold 800 extra monsters (8 each, no world cap). | Cache "built" per 8-block cell for the night; a world cap on Blood Moon monsters (e.g. 120). | S | deferred: under 0.2 ms/tick at 40; needs a new config option (docs) |
| 10 | medium (perf) | rain_bp | main.js `tick` (stopSound) | Indoors in rain, `stopsound` runs 4 times a second per player (muffled rain): 100 players indoors = 400 runCommand/s. Measured 0.48 ms/tick at 40 players outdoors in a storm (per player by nature: fogs, mist, drips, sounds). | No stable `Player.stopSound`; could stop every other run, or only while the client is in rain. | S | deferred: needs a client listening test (the 0.25 s window is tuned by ear) |
| 11 | medium (portability) | translucent_bp | entities/player.json | Overrides the vanilla player entity: on a public server any other add-on that also overrides player.json (common) silently breaks one of them. | Docs warning in Translucent Tools Switch (DOCS below). | XS | lead (docs) |
| 12 | low | rain_bp | main.js `update` | In the Nether/End during a thunderstorm the storm fog is pushed for the player (`fog` is computed before the dimension check). It's a `weather`-layer fog, so it doesn't show there; wasted /fog commands only. | Compute `fog` as 0 when not in the Overworld. | XS | deferred: no visible effect |
| 13 | low | tornado_bp | main.js `pull` | Players in Spectator (moderators watching) and AFK players are pulled and launched too (documented as "any gamemode"). | Skip spectators and `afk`-tagged players, or a setting. | XS | deferred: owner's documented design |
| 14 | low (C16) | climate_bp | main.js `detect` | A player whose own column isn't ticking yet (just teleported) reads a y 319 block whose `typeId` throws: one warning per second until it loads. | Read `typeId` inside `topmost`'s try. | XS | deferred: rare, harmless |
| 15 | low | weather_bp | main.js `realm:weather_set` callback | Uses `origin.sourceEntity` only, not `initiator ?? sourceEntity` like every other command, so an NPC-run command treats the operator as "everyone else" (they get the broadcast line too). | `origin.initiator ?? origin.sourceEntity`. | XS | deferred: cosmetic |
| 16 | low (C22) | calendar_bp, night_bp | calendar `pcache`; night `journaled` | In-memory per-player caches: calendar's is cleared on leave; night's `journaled` set is never cleared (2 strings per player per session). | Clear on playerLeave. | XS | deferred: bytes per player |
| 17 | low (test) | rainbow_bp | tools/test-bds/examples/rainbow-race.js | Baseline "skipped: needs hook copy". I built the hook copy from the header's prose (spawnParticle counter + rvtest:pot answer) and it passes (30 checks). | Lead: check the hook in as a file (e.g. `examples/hooks/rainbow-race-hook.js`) and let suite.mjs append it. | XS | passes by hand; request below |
| 18 | low (docs) | tornado_bp | PACKS.md Tornadoes "How it works" | Still says "every 4 ticks pushes entities with applyImpulse (... at most 40 entities per run)"; nothing but players is moved. Slow Falling now lasts until landing. | DOCS below. | XS | lead |
| 19 | low (docs) | storm_bp | PACKS.md Storm Chasing "How it works" | The build check is now spread over a few ticks. | DOCS below. | XS | lead |

Checked and fine (no finding): C11 every weatherChange handler accepts `overworld` and `minecraft:overworld` (rain, weather,
storm, climate, tornado, rainbow, moon, night). C15 every getTopmostBlock that decides ground climbs through water (storm
strike surface, tornado, rainbow, meteor, calendar `waterOver`, moon `spot`, rain `dryGround`, climate via `onBeach`). C16
unloaded columns are caught everywhere (storm counts them as built, rainbow/meteor retry later instead of dropping the job).
C13 storm's `playerInteractWithBlock` returns on `event.cancel` first; calendar's break/explosion guards only cancel. C12 no
`getScore` in my packs. C18 storm, climate and calendar send `realm:actionbar` first; moon and calendar send `realm:title`
first. C19 every addItem leftover dropped exactly once (storm glass, calendar ribbons/hats, rainbow loot). C24 every operator
form re-checks on submit (storm, tornado, weather, moon, meteor, calendar). C27 moon/meteor/night use the time of day; the
almanac, rainbow pot and moods are real time on purpose (documented). Nether/End: no weather pack acts outside the Overworld
(cells, tornadoes, pots, meteors, moons, aurora all check the dimension; rain/climate/moon clear their fogs there). One
event for everyone: storm cell (one point, journal check per player only), meteor (one streak per player, once), rainbow arc
(already shared Dimension.spawnParticle), tornado (now shared). Leaves: bounded queues (32 checks, 6000 leaves), 6 per tick.

## Perf

Scenario `weather-crowd.js` (players within 20 blocks of one spot, 300 blocks from spawn; a thunderstorm night with a forced
storm cell, a tornado, a Blood Moon and a meteor, then a clear night with a rainbow), only my 15 packs, `--no-relay
--profile`. ms/tick over the whole window (which includes spawning). Another track shared the 4 cores; the 10-player "after"
window was 5333 ticks instead of 2110 (slower spawning), so its averages are diluted: per-call numbers are given where it
matters. Idle cost (no weather) is from the lead's baseline soak (whole bundle, 10/40 players).

| pack | ms/tick @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| tornado_bp | 0.425 (0.87 ms/frame) | 0.817 (2.12 ms/frame) | 0.117 (0.61 ms/frame) | 0.511 (1.09 ms/frame) |
| rain_bp | 0.184 | 0.352 | 0.066 | 0.484 |
| moon_bp | 0.107 (max tick 47) | 0.166 (max 41) | 0.058 | 0.197 (waves max 18; one-off list 43 ms after load) |
| climate_bp | 0.079 | 0.134 | 0.026 | 0.171 |
| storm_bp | 0.019 | 0.026 (max tick 27) | 0.009 | 0.051 (max 16; job steps max 2) |
| night_bp | 0.022 | 0.037 | 0.008 | 0.062 |
| calendar_bp | 0.025 (baseline soak 1.244) | 0.046 (soak 2.762) | 0.030 | 0.033 |
| meteor_bp | 0.027 | 0.010 | 0.004 | 0.012 |
| rainbow_bp | 0.014 | 0.017 | 0.004 | 0.032 |
| weather_bp | 0.007 | 0.010 | 0.006 | 0.011 |
| leaves_bp | 0.007 | 0.012 | 0.012 | 0.009 |
| translucent_bp | 0.001 | 0.002 | 0.001 | 0.005 |
| whole (my packs) | 0.918 | 1.629 | 0.340 | 1.577 |

Against the budget (typical pack <= 0.15 ms/tick at 40): during a storm with 40 players around, tornado_bp (0.5, only while a
tornado lives, 1.5-3 min), rain_bp (0.48, only while it rains) and moon_bp/climate_bp (0.17-0.20, Blood Moon night / sandstorm
or blizzard) are over; all are per-player work by nature (each player's own fog, sounds, waves) except the tornado's pull.
Idle, every one of my packs is <= 0.06 ms/tick at 40 players in the baseline soak except calendar_bp, whose 1.2-2.8 ms is its
side.js copy (HUD track).

## Scenarios

| scenario | before | after |
|---|---|---|
| tornado-landing.js (new, `--flat`) | FAIL: rose 101.9 blocks, health 0 (died on landing) | PASS: rose 80.9, health 20 |
| tornado-pull.js (rewritten) | FAIL (baseline: cow not pulled; mobs are never pulled by design) | PASS (rider rose 66-80 blocks, cow left alone) |
| storm-cell.js (player 300 blocks from spawn) | FAIL (baseline, strikes skipped near spawn) | PASS 3/3 |
| rainbow-water.js (sea surface, wait for chunks) | FAIL (baseline, fills on unloaded chunks) | PASS 2/2 |
| weather-crowd.js (new, profile) | n/a | PASS at 10 and 40 |
| rainbow-race.js (hook copy by hand) | skipped | PASS |

Suite run of my packs' scenarios: see the end of this file.

`npm run check`: pass (exit 0, no catalog changes needed: no command, option or doc changed). `npm run build`: pass.

## DOCS (for the lead; PACKS.md)

- **Tornadoes — `tornado_bp`, How it works**, replace the second bullet's middle: "...draws a slice of the rings
  (`realm:sky_tornado` with `variable.radius` and `variable.spin`, `realm:sky_debris` with `variable.radius`): with two or more
  players within 64 blocks once for all of them (`Dimension.spawnParticle`), otherwise for each player near it
  (`Player.spawnParticle`, half the rings beyond 64 blocks); and pulls players with `applyKnockback` (no other entity is ever
  moved)." Delete "every 4 ticks pushes entities with `applyImpulse` (speeds capped at 0.6 blocks per tick sideways and 0.35
  up, at most 40 entities per run) and".
- **Tornadoes, What players see, "Players only" bullet**: "...and receiving Slow Falling near the apex of their sky launch, for
  at least `slowFallingSeconds` (8) and then until they're back on the ground or in water (at most a minute), so the fall never
  hurts." Same in How to use step 4 ("granting Slow Falling near the apex that lasts until you land"). Config row
  `slowFallingSeconds`: "Seconds of Slow Falling at least, after being shot out the top; it then lasts until the player lands".
- **Storm Chasing, How it works, second bullet**: "Then the 9 x 9 build check (at most 405 block lookups, spread over a few
  ticks as a job, one strike at a time), then `dimension.spawnEntity("minecraft:lightning_bolt")` on the surface."
- **Translucent Tools Switch — `translucent_bp`**: add a note: "This pack replaces the vanilla player entity
  (`entities/player.json`) to add the `realm:solid_tools` property. Another add-on that also replaces the player entity can't
  run next to it: only one of them takes effect."
- **Blood Moon & Harvest Moon** (no change needed now; if finding 9 is done, document the new world cap).

NEWS (plain ASCII, player-facing):
- "Tornadoes no longer drop you to your death: Slow Falling now lasts until you land."
- "Tornadoes cost the server far less when a crowd is watching."

## Requests for the lead

- Bump tornado_bp, storm_bp, moon_bp, calendar_bp.
- suite.mjs: tornado-landing.js needs `--flat` (in its header); rainbow-race.js needs its hook checked in as a file (finding 17;
  the hook I used: wrap `Player.prototype.spawnParticle` counting `${player.name}/${id}`, and answer `rvtest:pot` with
  `rvtest:pot_r` `{ pot: pot ?? null, counts, busy }`, appended to a copy of main.js).
- HUD track: calendar_bp's cost is its side.js copy (baseline 1.2 / 2.8 ms/tick at 10 / 40); nothing calendar-specific to fix.
- weather-crowd.js could join the finishing steps' perf runs (it's the only scenario that makes weather events happen).

## Phase 2 ideas

1. One shared weather listener: Rain Extras, Storm Chasing, Regional Weather, Tornadoes, Rainbows, Night and Moon each keep
   their own `<pack>:weather` guess; read `realm:weather_plan`'s `now` (and ask with `realm:weather_ask` at load) so a pack
   added mid-storm knows at once.
2. Weather news reach offline players: a tornado, a meteor crater found, a Blood Moon survived as `realm:mail_send` /
   `realm:gossip` from the weather packs (only moon and meteor send gossip today), and a storm cell's "Storm Glass" haul.
3. A per-pack cost budget for crowds: Blood Moon world cap and cached build checks (finding 9), rain stopsound every other run
   (finding 10), tornado sounds batched by distance band.
4. Storm chasing for public servers: a leaderboard of Storm Glass collected and "closest to a tornado" as a title.
5. Spectator/AFK opt-out for tornado launches (finding 13) as a `/realm:prefs` "Ride tornadoes" switch.

## Suite (final)

`node tools/test-bds/suite.mjs --filter '^(calendar.*|climate-conditions|cooking-moon-restart|meteor-.*|moon-join|rain-roof|rain-seabed|rainbow|rainbow-leftover|rainbow-water|sky-requests|storm-cell|storm-rod-claims|tornado-pull|tornado-landing|weather-almanac)$' --retry`:
20 pass, 0 flaky, 0 fail (6.6 min). Plus rainbow-race (hook copy) and weather-crowd at 10/40: pass.

## Review

Reviewer pass over `git diff 3535950..HEAD` (the track's 9 commits; a4cccca..3535950 is the master merge, only synced
copies and manifest spacing in these packs). origin/master had nothing new. Rules: only calendar_bp, moon_bp, storm_bp,
tornado_bp main.js plus five scenarios changed; no manifest bump, no PACKS.md/README/NEWS/catalog edits, no stash_bp or
saga_bp touched (no conflict with #84 or #86), stable APIs only (`Effect.duration`, `isOnGround`, `isInWater`,
`Dimension.spawnParticle`, `runJob`), no new game text. The spawnFresh retries match the elite/saga pattern (C6).
No blocker or high confirmed, so no review commits.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | tornado_bp/scripts/main.js:398 (`draw`) | With 2+ players near, the shared `Dimension.spawnParticle` copy also reaches viewers 64-128 blocks out if they're within the client's particle send range, and they still get their own half copy: about 1.5x the rings plus debris/sparks they didn't see before (C28 look change). | not fixed: depends on how far the server sends a dimension particle; needs a client look. If doubled, skip far viewers' own copy while shared and they're within the range. |
| low | tornado_bp/scripts/main.js:617 (`launchOutTop`/`cushion`) | First Slow Falling now lands on the 10-tick cushion beat, 28-37 ticks after launch instead of at tick 28. | not fixed: the test shows health 20; Slow Falling caps fall speed right away. |
| low | tornado_bp/scripts/main.js:630 (`cushion`) | A player who dies in the first `slowFallingSeconds` (lava) keeps getting Slow Falling top-ups after they respawn, up to 8 s; a player who glides with an elytra keeps Slow Falling up to 60 s. | not fixed: harmless. |
| low | tornado_bp/scripts/main.js:623 (`landing`) | The landing map lives in memory only (C23): a restart mid-fall leaves only the last Slow Falling top-up (2 s). | not fixed: rare (a restart within a fall of about 20 s). |
| low | moon_bp/scripts/main.js:287 | The 40 ms block list is now built on every world load, even when no Blood Moon ever comes. | not fixed: one tick 3 s after load is fine; the lazy build is still there as a fallback. |
| low | storm_bp/scripts/main.js:262 (`strike`) | A strike that's due while the last one's job is still running is skipped. | not fixed: strikes are seconds apart and a job ends in a tick or two. |
| low (test) | tools/test-bds/examples/tornado-landing.js:14 | The `entityDie` flag never fires for a simulated player: before the fix "the rider lands alive" still said ok at health 0. Only the health check fails (that's still a correct before/after). | not fixed: low. Fold `health <= 0` into `died`. |
| note | rain_bp/scripts/main.js:147 | On finding 10 (deferred): one `stopsound @a[tag=...]` per run in place of a command per muffled player would cut the command count without changing the 0.25 s timing, so no listening test needed. | idea for the lead / a perf pass |

Verified fixes: finding 1 really fixes the trigger. With `git show 6659227^` tornado main.js swapped in, tornado-landing
FAILS (rose 101.4 blocks, health 0). With the fix it PASSES (suite). Finding 2 keeps the same slice per frame (same
`drawSlice` for shared and own copies). Finding 7 re-checks `cell !== c` after the yields, and `striking` is reset in
`finally`. Finding 8: `playerMadeBlocks` still caches and still builds on its own if called early.

Scenario results (review run): `node tools/test-bds/suite.mjs --filter '^(calendar.*|climate-conditions|cooking-moon-restart|meteor-.*|moon-join|rain-roof|rain-seabed|rainbow|rainbow-leftover|rainbow-water|sky-requests|storm-cell|storm-rod-claims|tornado-pull|tornado-landing|weather-almanac|weather-crowd)$' --retry`:
21 pass, 0 flaky, 0 fail, 0 timeout (8.1 min). `npm run check`: pass (exit 0). `npm run build`: pass.

## Review (second independent pass)

Diff reviewed: `git diff a4cccca..HEAD`; the part from the master merge (a4cccca..3535950) touches these packs only through
synced settings.js/side.js copies and manifest spacing, so nothing there is ours to fix. The track's own 9 commits change
calendar_bp, moon_bp, storm_bp and tornado_bp main.js plus five scenarios. Rules: no manifest bumps, no PACKS.md, README,
NEWS or catalog edits, no shared-copy edits, no stash_bp or saga_bp files (so no conflict with #84 or #86), no non-ASCII
added, no `.header(`, stable APIs only (`getEffect().duration`, `isOnGround`, `isInWater`, `Dimension.spawnParticle`,
`system.runJob`). origin/master had nothing new. The scenario changes match the documented behavior and were not weakened:
tornado-pull now checks "players only", which PACKS.md documents.

Re-checked: finding 1 (Slow Falling until landing) fixes the trigger. The previous review confirmed tornado-landing FAILS
on 6659227^ (health 0) and it passes now. Storm's job checks `cell !== c` after the yields and resets `striking` in `finally`.
`nearBuild` yields once per dx row (9 per scan). Calendar `spawnFresh` failures are skipped inside the existing try.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | moon_bp/scripts/main.js:578 (`spawnWave`) | The new C6 type check compared `mob.typeId` (which always has the namespace) with the raw config id. A server owner who writes `{ id: "zombie" }` in config.js (spawnEntity accepts it) would get no Blood Moon monsters at all, silently, because every spawn counts as "another entity". This regression came in with 0dc4831. | fixed 5018ece (compares with `minecraft:` added when the id has no namespace) |
| medium | tornado_bp/scripts/main.js:398 (`draw`) | Same as the first review: while the funnel is drawn once for everyone, viewers 64+ blocks out get both their own half copy and the shared copy, if the server sends dimension particles that far. | not fixed: needs a look on a real client (C28); not a broken feature |
| low | moon_bp/scripts/main.js:578 | With repeating entity ids, each retry leaves the mob that was really spawned untagged, so dawn never removes it. This is the same accepted pattern as elite/saga `spawnFresh`. | not fixed: BDS can't reproduce it; same as the other packs |
| low | tornado_bp/scripts/main.js:630 (`cushion`) | A player re-grabbed by the funnel while still on the landing list is spun with Slow Falling on, for up to 60 s (before, at most 8 s), so the second spin is lower. | not fixed: the player still lands safely; cosmetic |
| low | tools/test-bds/examples/tornado-landing.js:14 | Same as the first review: `entityDie` doesn't fire for simulated players, so only the health check tells before from after. | not fixed: the before/after is still correct |

No blocker or high confirmed. The earlier review's other lows stand.

Scenario results (this pass): `node tools/test-bds/suite.mjs --filter '^(calendar.*|climate-conditions|cooking-moon-restart|meteor-.*|moon-join|rain-roof|rain-seabed|rainbow|rainbow-leftover|rainbow-water|sky-requests|storm-cell|storm-rod-claims|tornado-pull|tornado-landing|weather-almanac|weather-crowd)$' --retry`:
21 pass, 0 flaky, 0 fail, 0 timeout (8.4 min). `npm run check`: pass. `npm run build`: pass (after 5018ece).
