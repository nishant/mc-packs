# Phase 3 test run: mc-packs deep audit

Snapshots: before = /home/user/wt/before (da2149f, origin/master) with the after harness copied in (uncommitted: suite.mjs, run.mjs, lib/, hooks/, testpack/, examples/perf-soak.js); after = /home/user/wt/after (015d98c). BDS 1.26.52.3 at /home/user/bds. Suites ran with --jobs 2 --retry, and soaks ran one at a time. Nothing was committed.

Raw files are in this folder: suite-before.json/.out, suite-after.json/.out, {before-40,after-10,after-40,after-40b,bundle-40}.{json,log,out}, *.rss.csv, and the original-harness reruns in orig/.
Suite logs: before /home/user/wt/before/tools/test-bds/logs/suite-2026-10-18T18-19-34-277Z, after /home/user/wt/after/tools/test-bds/logs/suite-2026-10-18T19-11-09-648Z.

## (a) Scenarios

Totals:
- before: 157 scenarios, 143 pass / 11 fail / 2 flaky / 1 skipped / 0 timeout. Wall time 51.5 min.
- after: 219 scenarios (62 new), 215 pass / 3 fail / 1 flaky / 0 skipped / 0 timeout. Wall time 70.4 min.
- before failures caused by the new harness: 4. maps-cleanup and rainbow-race have header recipes that predate suite.mjs (prose "append to" lines), saga-untrack's header runs saga-quest-log.js, and maps-leave has no recipe, so it was skipped. No before failure came from the stricter checks: no 2048-char script event assertion fired.
- The other 8 before failures (map, maps-hunt, mobhp-overhead, npc-standing, quests-party, saga-escort, saga-party-story, tornado-pull) are real bugs at da2149f. All 8 also fail with before's own original harness (an untouched git archive of da2149f, outputs in orig/). All 8 pass in after.

Pass before, fail after:
1. **domt-busy: intermittent regression.** After failed 5 of 12 runs; before passed 5 of 5. First failure line: `no message matching /You drew The Comet/ for Buddy within 1200 ticks`. What happens: Buddy gets the title "The Comet", then `[Deck] The Comet crumbles to dust: it can't happen here. The deck draws again...`, then the operator gets `[Deck] The deck finds nothing that can happen here. Try somewhere else.` (farTeleport found no spot). Log: /home/user/wt/after/tools/test-bds/logs/suite-2026-10-18T19-11-09-648Z/domt-busy.out (.log, .retry.out). Without the new `import "./diag.js"` the scenario passed 2 of 2, which is not conclusive. domt's farTeleport is unchanged; the deck changes are spawnFresh and the tamemount fix.
2. **meteor-edge: not a pack regression (world cache).** First failure line: `the crater is made once its columns tick (0 magma or debris blocks)`. Log: .../suite-2026-10-18T19-11-09-648Z/meteor-edge.out. It fails 8 of 8 times on the after worktree's cached `--flat` template, even with before's own meteor_bp. After's meteor_bp passes on before's cache. The cached flat worlds have random spawns: after's is SpawnX/Z = 261,5 and before's is 0,0. This is a harness issue: a `--flat` template's spawn is not fixed, and meteor-edge and expedition-nether-carts depend on it.
3. **expedition-nether-carts** (new in after, not a regression): `no message matching /site set/i for NetherRunner within 200 ticks`, because "That's only 39 blocks from world spawn" with the spawn at 261,5. This is the same world-cache cause. On before's cache it passed once and failed once later (`NetherRunner fell and is out of the expedition` -> `Gauntlet active`), so it is also flaky past the site step. Log: .../suite-2026-10-18T19-11-09-648Z/expedition-nether-carts.out.
4. domt-cards: pass -> flaky ("every card passed" failed once, then passed on the alone-retry).

| scenario | before | after | note |
|---|---|---|---|
| actionbar-steady | pass | pass |  |
| admin-diag | - | pass | new in after |
| admin-diag-bundle | - | pass | new in after |
| admin-item-legacy | - | pass | new in after |
| admin-menu | pass | pass |  |
| admin-setup-hint | - | pass | new in after |
| admin-setup-wizard | - | pass | new in after |
| admin-size-profile | - | pass | new in after |
| admin-stash-singleton | pass | pass |  |
| admin-title | pass | pass |  |
| admin-tp | pass | pass |  |
| afk-twice | pass | pass |  |
| atlas | flaky | pass | fixed (before: no message matching /whole skeleton/ for Tester within 60 ticks) |
| atlas-news | - | pass | new in after |
| bounty-news | - | pass | new in after |
| bounty-water | pass | pass |  |
| build | pass | pass |  |
| build-bar | - | pass | new in after |
| calendar | pass | pass |  |
| calendar-carve-solo | pass | pass |  |
| calendar-course | pass | pass |  |
| caravan-news | - | pass | new in after |
| caravan-traders | pass | pass |  |
| caravan-unloaded | pass | pass |  |
| claims-bundle-taps | pass | pass |  |
| claims-party | pass | pass |  |
| claims-remove | pass | pass |  |
| claims-zones | pass | pass |  |
| cleanup-bundle | - | pass | new in after |
| cleanup-keep | pass | pass |  |
| climate-conditions | pass | pass |  |
| cooking-moon-restart | pass | pass |  |
| cooking-restart | - | pass | new in after |
| cooking-windows | pass | pass |  |
| crowns-amounts | pass | pass |  |
| crowns-deop-form | pass | pass |  |
| death-party | pass | pass |  |
| dolphin-breath | pass | pass |  |
| dolphin-index-full | - | pass | new in after |
| dolphin-riding | pass | pass |  |
| domt-busy | pass | fail | INTERMITTENT REGRESSION: after failed 5 of 12 runs (suite, retry, recheck, 1 of 3 later), before passed 5/5; The Comet 'crumbles to dust' then 'The deck finds nothing that can happen here' |
| domt-cards | pass | flaky | after flaky: 'every card passed' failed once, passed on retry |
| domt-champion | pass | pass |  |
| domt-crowns | pass | pass |  |
| domt-drops | pass | pass |  |
| domt-edges | pass | pass |  |
| domt-locked | pass | pass |  |
| domt-places | pass | pass |  |
| domt-restart | pass | pass |  |
| domt-steed | - | pass | new in after |
| domt-swap | pass | pass |  |
| domt-void | pass | pass |  |
| durability-rearm | pass | pass |  |
| elite-approach | pass | pass |  |
| elite-approach-terrain | pass | pass |  |
| elite-not-a-mob | pass | pass |  |
| elite-storm-flat | - | pass | new in after |
| elite-storm-zones | - | pass | new in after |
| elytra-jukebox-claims | - | pass | new in after |
| elytra-notes | pass | pass |  |
| expedition-climb | pass | pass |  |
| expedition-deaths | pass | pass |  |
| expedition-edge | pass | pass |  |
| expedition-flat-site | - | pass | new in after |
| expedition-gauntlet | pass | pass |  |
| expedition-integrations | pass | pass |  |
| expedition-lag-clock | - | pass | new in after |
| expedition-leave-death | pass | pass |  |
| expedition-nether-carts | - | fail | new in after; no message matching /site set/i for NetherRunner within 200 ticks |
| expedition-party | pass | pass |  |
| expedition-party-far | pass | pass |  |
| expedition-pending | - | pass | new in after |
| expedition-perf | - | pass | new in after |
| expedition-queue | - | pass | new in after |
| expedition-restart | pass | pass |  |
| expedition-slot-spawn | - | pass | new in after |
| expedition-surface | - | pass | new in after |
| expedition-tiers | pass | pass |  |
| expedition-two | pass | pass |  |
| find-index | pass | pass |  |
| forms | pass | pass |  |
| goals-add-form | pass | pass |  |
| goals-many-donors | - | pass | new in after |
| goals-news | - | pass | new in after |
| goals-op-back | pass | pass |  |
| guard-zones | pass | pass |  |
| guilds-first-rep | pass | pass |  |
| guilds-perk-note | pass | pass |  |
| guilds-placed-restart | pass | pass |  |
| harness-event-limit | - | pass | new in after |
| journal-extras | pass | pass |  |
| journal-ocean | pass | pass |  |
| journal-ocean-bed | - | pass | new in after |
| journal-ocean-seagrass | - | pass | new in after |
| librarian-book | pass | pass |  |
| mail-big-roster | - | pass | new in after |
| mail-codes | pass | pass |  |
| mail-party | pass | pass |  |
| map | fail | pass | fixed (before: 1 check(s) failed: under 1 ms per player pass (1.175); reproduced with before's own harness) |
| map-flight | pass | pass |  |
| map-others-range | - | pass | new in after |
| map-places | pass | pass |  |
| map-turn | flaky | pass | fixed (before: 1 check(s) failed: each strip sent costs under 4 ms with 10 players turning nonstop (4.07 ms)) |
| map-water-structures | pass | pass |  |
| maps-cleanup | fail | pass | before: header recipe predates suite.mjs (prose 'append to' line), harness-only failure |
| maps-hunt | fail | pass | fixed (before: 1 check(s) failed: far away the map only says cold / cool / faintly warm; reproduced with before's own harness) |
| maps-leave | skipped | pass | before: no shell recipe in header, harness skip |
| maps-news | - | pass | new in after |
| maps-party | pass | pass |  |
| meteor-edge | pass | fail | NOT a pack regression: fails 8/8 on the after worktree's cached --flat world (random spawn 261,5), even with before's own meteor_bp; after's meteor_bp passes on before's cache (spawn 0,0) |
| meteor-lake | pass | pass |  |
| meteor-restart | pass | pass |  |
| milestones-list | - | pass | new in after |
| milestones-news | - | pass | new in after |
| mobhp-overhead | fail | pass | fixed (before: 1 check(s) failed: killing blow box:  §fChicken  §7defeated~§r§r§r§r§r§; reproduced with before's own harness) |
| mobhp-sweep | pass | pass |  |
| moon-join | pass | pass |  |
| moon-news | - | pass | new in after |
| news-draft-busy | pass | pass |  |
| news-edit-concurrent | - | pass | new in after |
| news-new-world | - | pass | new in after |
| nick-impersonate | - | pass | new in after |
| npc-far-names | pass | pass |  |
| npc-hearth | pass | pass |  |
| npc-houses | pass | pass |  |
| npc-labels-perf | - | pass | new in after |
| npc-name-capability | pass | pass |  |
| npc-nether-skin | - | pass | new in after |
| npc-news | - | pass | new in after |
| npc-placement | pass | pass |  |
| npc-remove-confirm | pass | pass |  |
| npc-standing | fail | pass | fixed (before: 1 check(s) failed: quill has its helper name right after spawning ("§eQuill §7the Trader§r"); reproduced with before's own harness) |
| npc-stay-home | pass | pass |  |
| party-basics | pass | pass |  |
| party-hud-coords | pass | pass |  |
| party-legacy | - | pass | new in after |
| party-many | - | pass | new in after |
| perf-soak | pass | pass |  |
| platypus | pass | pass |  |
| platypus-feed | pass | pass |  |
| prefs-locks | pass | pass |  |
| quests-party | fail | pass | fixed (before: 2 check(s) failed: the killer counts both (-1); a party mate 3 blocks away shares them (-1); reproduced with before's own harness) |
| rain-roof | pass | pass |  |
| rain-seabed | pass | pass |  |
| rainbow | pass | pass |  |
| rainbow-leftover | pass | pass |  |
| rainbow-race | fail | pass | before: header recipe predates suite.mjs ('append to' prose line), harness-only failure |
| rainbow-water | pass | pass |  |
| refill-pages | pass | pass |  |
| relics-actionbar | pass | pass |  |
| relics-ascension | pass | pass |  |
| relics-fen-charm | pass | pass |  |
| restart | pass | pass |  |
| rook-map-race | pass | pass |  |
| rook-race | pass | pass |  |
| saga-anvil-name | pass | pass |  |
| saga-block-colors | - | pass | new in after |
| saga-box-resend | - | pass | new in after |
| saga-callbacks | pass | pass |  |
| saga-collect-count | - | pass | new in after |
| saga-countdown | pass | pass |  |
| saga-defend-away | pass | pass |  |
| saga-defend-expire | pass | pass |  |
| saga-escort | fail | pass | fixed (before: 1 check(s) failed: Pell carries a unique invisible format-code marker ("§r§7§a§a§4§3§d§4§1§8§c§r§r"); reproduced with before's own harness) |
| saga-far-scale | pass | pass |  |
| saga-fen-bound | pass | pass |  |
| saga-fish-drop | pass | pass |  |
| saga-ground-swimmers | pass | pass |  |
| saga-ground-water | pass | pass |  |
| saga-hearth-packs | - | pass | new in after |
| saga-kitchen-way | pass | pass |  |
| saga-lighthouse | pass | pass |  |
| saga-note-box | - | pass | new in after |
| saga-op-deop | - | pass | new in after |
| saga-op-tools | pass | pass |  |
| saga-party-coop | pass | pass |  |
| saga-party-story | fail | pass | fixed (before: no message matching /Ann set the party's tracked quest: The Drowned Bell\./ for Bob within 300 ticks; reproduced with before's own harness) |
| saga-perf-quests | - | pass | new in after |
| saga-place-move | pass | pass |  |
| saga-quest-box | pass | pass |  |
| saga-quest-log | pass | pass |  |
| saga-time-stopped | - | pass | new in after |
| saga-untrack | fail | pass | before: header runs saga-quest-log.js (copy-paste slip), harness-only failure |
| saga-world-events | pass | pass |  |
| saga-world-hooks | pass | pass |  |
| settings-prefs-close | - | pass | new in after |
| side-boxes | pass | pass |  |
| silly | pass | pass |  |
| silly-effects | pass | pass |  |
| skills-calling | pass | pass |  |
| skills-passive | pass | pass |  |
| sky-requests | pass | pass |  |
| slots-machine-replaced | - | pass | new in after |
| smoke | pass | pass |  |
| stash-claims-access | pass | pass |  |
| stash-pages | pass | pass |  |
| stash-pages-nether | - | pass | new in after |
| stash-pages-persistence | pass | pass |  |
| stash-pages-shrink | pass | pass |  |
| stats-new-name | pass | pass |  |
| stats-ticker | pass | pass |  |
| stats-ticker-scale | - | pass | new in after |
| storm-cell | pass | pass |  |
| storm-news | - | pass | new in after |
| storm-rod-claims | pass | pass |  |
| title-hold | pass | pass |  |
| tornado-landing | - | pass | new in after |
| tornado-news | - | pass | new in after |
| tornado-pull | fail | pass | fixed (before: 1 check(s) failed: a cow near the funnel is pulled (has Slow Falling); reproduced with before's own harness) |
| town-news | - | pass | new in after |
| wander | pass | pass |  |
| wander-visible | pass | pass |  |
| wander-walk | pass | pass |  |
| waystone-party | pass | pass |  |
| waystone-trips | pass | pass |  |
| weather-almanac | pass | pass |  |
| weather-crowd | - | pass | new in after |
| welcome-edit-concurrent | - | pass | new in after |
| zones-flow | pass | pass |  |
| totals | 157: 143 pass / 11 fail / 2 flaky / 1 skipped / 0 timeout | 219: 215 pass / 3 fail / 1 flaky / 0 skipped / 0 timeout | 62 new scenarios in after |

## (b) Performance (perf-soak, all 67 BPs + 7 RPs, --no-relay --profile)

Budget: whole bundle < 5 ms/tick at 40 players; a typical pack <= 0.15 ms; map_bp and hud_bp <= 1 ms.

Whole bundle (all packs summed per tick):

| run | all packs ms/tick | per-tick p50 / p95 / p99 / max | TPS | tick interval p95 ms | setDynamicProperty/t | setActionBar/t | setTitle/t | RSS end MB | server CPU ms/tick | ticks |
|---|---|---|---|---|---|---|---|---|---|---|
| before-40, separate packs, 300 s | 156.79 | 124 / 354 / 467 / 723 | 4.66 | 396 | 0.516 | 0.0109 | 6.105 | 1502 | 217.1 | 6415 |
| after-10, separate, 900 s | 6.56 | 6 / 13 / 22 / 144 | 19.81 | 59 | 0.080 | 0.0014 | 0.939 | 1366 | 30.8 | 18101 |
| after-40, separate, 900 s | 9.74 | 8 / 30 / 46 / 205 | 19.45 | 76 | 0.275 | 0.0047 | 1.105 | 1493 | 43.8 | 18369 |
| after-40 repeat, separate, 900 s | 9.76 | 8 / 30 / 46 / 219 | 19.37 | 72 | 0.291 | 0.0040 | 1.196 | 1543 | 46.2 | 18373 |
| after-40, Realm Bundle (one pack), 300 s | 8.28 | 6 / 24 / 42 / 133 | 19.95 | 70 | 0.401 | 0.0111 | 1.070 | 794 | 38.8 | 6374 |

- before-40 is unusable as a Realm: 4.66 TPS. The 300 game seconds took 23 min of wall time, and map_bp alone cost 124 ms/tick (runInterval(1) @ main.js:632). Six packs (saga, elytra, maps, calendar, hud, mobhp) each cost about 3.4 ms in the side.js:320 scriptEventReceive handler. After fixes all of that: about 16x less total work per tick and a steady 19.5 TPS.
- **After is still over the 5 ms bundle budget at 40 players**: 9.74 ms/tick with separate packs (repeat run 9.6), and 8.28 ms/tick as the real Realm Bundle. At 10 players it is 6.56. map_bp alone (3.96 ms) is close to the whole budget.
- Running as the Realm Bundle is about 15% cheaper in pack time (8.28 vs about 9.4 ms over the same first 5 minutes) and uses about half the memory: 794 MB RSS against 1493 MB, because it is one script context. Bundle top callbacks: map_bp/main.js:1280 runInterval(1) 2.07 ms/t, map_bp/main.js:749 runInterval(1) 1.01, build_bp/core/Preview.js:1053 runInterval(1) 0.65, map_bp/main.js:1380 runInterval(1) 0.55, silly_bp/main.js:238 runInterval(10) 0.26.
- Packs over budget at after-40: map_bp 3.96 (> 1 ms). Over 0.15 ms: build_bp 1.10, silly_bp 0.38, wander_bp 0.36, elytra_bp 0.34, stash_bp 0.26, saga_bp 0.23, relics_bp 0.22, durability_bp 0.18, calendar_bp 0.151. hud_bp is 0.19, inside its 1 ms. At after-10, only map_bp (2.95), build_bp (0.57), elytra_bp (0.22), saga_bp (0.18), silly_bp (0.17) and maps_bp (0.155) are over.
- setTitle/tick (about 1.1 at 40 players) is almost all map_bp (1.10/t). setDynamicProperty/tick: 0.27 total, led by milestones 0.09 and quests 0.04. setActionBar is about 0.005/t.

Per pack, sorted by after-40 (avg ms/tick / p95 ms; the p95 values are whole ms because Date.now() has 1 ms resolution):

| pack | before-40 (300 s) avg / p95 | after-10 avg / p95 | after-40 avg / p95 | after-40 dynW/t | bar/t | title/t | budget (after-40) |
|---|---|---|---|---|---|---|---|
| map_bp | 124.293 / 240 | 2.945 / 5 | 3.960 / 7 | 0.000 | 0.000 | 1.103 | OVER 1 ms |
| build_bp | 2.917 / 5 | 0.573 / 1 | 1.103 / 2 | 0.000 | 0.000 | 0.000 | over 0.15 |
| silly_bp | 0.408 / 3 | 0.170 / 1 | 0.382 / 3 | 0.000 | 0.000 | 0.000 | over 0.15 |
| wander_bp | 0.647 / 2 | 0.064 / 1 | 0.364 / 2 | 0.000 | 0.000 | 0.000 | over 0.15 |
| elytra_bp | 3.492 / 15 | 0.221 / 1 | 0.336 / 1 | 0.000 | 0.000 | 0.000 | over 0.15 |
| stash_bp | 2.435 / 13 | 0.101 / 1 | 0.260 / 1 | 0.009 | 0.000 | 0.000 | over 0.15 |
| saga_bp | 3.678 / 16 | 0.183 / 1 | 0.230 / 1 | 0.002 | 0.000 | 0.000 | over 0.15 |
| relics_bp | 0.351 / 2 | 0.083 / 1 | 0.219 / 2 | 0.001 | 0.000 | 0.000 | over 0.15 |
| hud_bp | 3.380 / 15 | 0.148 / 1 | 0.186 / 1 | 0.000 | 0.000 | 0.000 |  |
| durability_bp | 0.206 / 2 | 0.072 / 1 | 0.181 / 2 | 0.000 | 0.000 | 0.000 | over 0.15 |
| calendar_bp | 3.393 / 15 | 0.147 / 1 | 0.151 / 1 | 0.000 | 0.000 | 0.000 | over 0.15 |
| maps_bp | 3.420 / 15 | 0.155 / 1 | 0.149 / 1 | 0.000 | 0.000 | 0.000 |  |
| skills_bp | 0.178 / 1 | 0.065 / 1 | 0.136 / 1 | 0.003 | 0.005 | 0.000 |  |
| elite_bp | 0.105 / 1 | 0.110 / 1 | 0.133 / 1 | 0.000 | 0.000 | 0.000 |  |
| atlas_bp | 0.169 / 1 | 0.049 / 0 | 0.104 / 1 | 0.002 | 0.000 | 0.002 |  |
| mobhp_bp | 3.277 / 14 | 0.109 / 1 | 0.097 / 1 | 0.000 | 0.000 | 0.000 |  |
| journal_bp | 0.318 / 1 | 0.061 / 1 | 0.090 / 1 | 0.009 | 0.000 | 0.000 |  |
| dolphin_bp | 0.116 / 1 | 0.057 / 1 | 0.087 / 1 | 0.000 | 0.000 | 0.000 |  |
| milestones_bp | 0.092 / 1 | 0.045 / 0 | 0.084 / 1 | 0.090 | 0.000 | 0.000 |  |
| quests_bp | 0.107 / 1 | 0.041 / 0 | 0.084 / 1 | 0.039 | 0.000 | 0.000 |  |
| titles_bp | 0.155 / 1 | 0.052 / 1 | 0.080 / 1 | 0.035 | 0.000 | 0.000 |  |
| stats_bp | 0.112 / 1 | 0.039 / 0 | 0.070 / 1 | 0.002 | 0.000 | 0.000 |  |
| admin_bp | 0.100 / 1 | 0.045 / 0 | 0.068 / 0 | 0.000 | 0.000 | 0.000 |  |
| guilds_bp | 0.101 / 1 | 0.036 / 0 | 0.064 / 1 | 0.027 | 0.000 | 0.000 |  |
| npc_bp | 0.437 / 2 | 0.048 / 0 | 0.059 / 1 | 0.002 | 0.000 | 0.000 |  |
| nick_bp | 0.085 / 1 | 0.031 / 0 | 0.056 / 1 | 0.002 | 0.000 | 0.000 |  |
| night_bp | 0.046 / 0 | 0.028 / 0 | 0.056 / 0 | 0.000 | 0.000 | 0.000 |  |
| afk_bp | 0.073 / 1 | 0.031 / 0 | 0.054 / 1 | 0.000 | 0.000 | 0.000 |  |
| waystone_bp | 0.122 / 1 | 0.036 / 0 | 0.039 / 0 | 0.000 | 0.000 | 0.000 |  |
| fishing_bp | 0.101 / 1 | 0.036 / 0 | 0.039 / 0 | 0.000 | 0.000 | 0.000 |  |
| expedition_bp | 0.101 / 1 | 0.032 / 0 | 0.036 / 0 | 0.000 | 0.000 | 0.000 |  |
| cooking_bp | 0.098 / 1 | 0.031 / 0 | 0.034 / 0 | 0.000 | 0.000 | 0.000 |  |
| domt_bp | 0.105 / 1 | 0.032 / 0 | 0.034 / 0 | 0.000 | 0.000 | 0.000 |  |
| town_bp | 0.090 / 1 | 0.031 / 0 | 0.032 / 0 | 0.000 | 0.000 | 0.000 |  |
| storm_bp | 0.098 / 1 | 0.031 / 0 | 0.032 / 0 | 0.000 | 0.000 | 0.000 |  |
| claims_bp | 0.094 / 1 | 0.032 / 0 | 0.031 / 0 | 0.000 | 0.000 | 0.000 |  |
| chairs_bp | 0.053 / 1 | 0.026 / 0 | 0.031 / 0 | 0.000 | 0.000 | 0.000 |  |
| caravan_bp | 0.297 / 1 | 0.027 / 0 | 0.030 / 0 | 0.000 | 0.000 | 0.000 |  |
| party_bp | 0.068 / 1 | 0.025 / 0 | 0.030 / 0 | 0.000 | 0.000 | 0.000 |  |
| zones_bp | 0.090 / 1 | 0.027 / 0 | 0.029 / 0 | 0.000 | 0.000 | 0.000 |  |
| mail_bp | 0.081 / 1 | 0.025 / 0 | 0.027 / 0 | 0.002 | 0.000 | 0.000 |  |
| weather_bp | 0.073 / 1 | 0.024 / 0 | 0.027 / 0 | 0.002 | 0.000 | 0.000 |  |
| crowns_bp | 0.081 / 1 | 0.025 / 0 | 0.027 / 0 | 0.007 | 0.000 | 0.000 |  |
| moon_bp | 0.063 / 1 | 0.039 / 0 | 0.025 / 0 | 0.000 | 0.000 | 0.000 |  |
| bounty_bp | 0.067 / 1 | 0.028 / 0 | 0.025 / 0 | 0.000 | 0.000 | 0.000 |  |
| meteor_bp | 0.063 / 1 | 0.024 / 0 | 0.023 / 0 | 0.000 | 0.000 | 0.000 |  |
| death_bp | 0.055 / 1 | 0.016 / 0 | 0.023 / 0 | 0.001 | 0.000 | 0.000 |  |
| help_bp | 0.048 / 0 | 0.016 / 0 | 0.021 / 0 | 0.000 | 0.000 | 0.000 |  |
| leaves_bp | 0.046 / 0 | 0.021 / 0 | 0.021 / 0 | 0.000 | 0.000 | 0.000 |  |
| tornado_bp | 0.058 / 1 | 0.018 / 0 | 0.020 / 0 | 0.000 | 0.000 | 0.000 |  |
| guard_bp | 0.061 / 1 | 0.019 / 0 | 0.020 / 0 | 0.000 | 0.000 | 0.000 |  |
| goals_bp | 0.041 / 0 | 0.018 / 0 | 0.019 / 0 | 0.000 | 0.000 | 0.000 |  |
| rainbow_bp | 0.049 / 0 | 0.016 / 0 | 0.018 / 0 | 0.000 | 0.000 | 0.000 |  |
| cleanup_bp | 0.040 / 0 | 0.015 / 0 | 0.018 / 0 | 0.000 | 0.000 | 0.000 |  |
| platypus_bp | 0.055 / 1 | 0.014 / 0 | 0.016 / 0 | 0.000 | 0.000 | 0.000 |  |
| welcome_bp | 0.046 / 0 | 0.015 / 0 | 0.016 / 0 | 0.002 | 0.000 | 0.000 |  |
| find_bp | 0.046 / 0 | 0.014 / 0 | 0.015 / 0 | 0.000 | 0.000 | 0.000 |  |
| news_bp | 0.044 / 0 | 0.014 / 0 | 0.015 / 0 | 0.035 | 0.000 | 0.000 |  |
| phantom_bp | 0.046 / 0 | 0.014 / 0 | 0.015 / 0 | 0.000 | 0.000 | 0.000 |  |
| farm_bp | 0.044 / 0 | 0.014 / 0 | 0.014 / 0 | 0.000 | 0.000 | 0.000 |  |
| climate_bp | 0.037 / 0 | 0.013 / 0 | 0.014 / 0 | 0.000 | 0.000 | 0.000 |  |
| rain_bp | 0.039 / 0 | 0.014 / 0 | 0.014 / 0 | 0.000 | 0.000 | 0.000 |  |
| harvest_bp | 0.036 / 0 | 0.014 / 0 | 0.014 / 0 | 0.000 | 0.000 | 0.000 |  |
| refill_bp | 0.039 / 0 | 0.014 / 0 | 0.013 / 0 | 0.000 | 0.000 | 0.000 |  |
| slots_bp | 0.043 / 0 | 0.013 / 0 | 0.013 / 0 | 0.000 | 0.000 | 0.000 |  |
| settings_bp | 0.036 / 0 | 0.014 / 0 | 0.013 / 0 | 0.000 | 0.000 | 0.000 |  |
| translucent_bp | 0.038 / 0 | 0.013 / 0 | 0.012 / 0 | 0.000 | 0.000 | 0.000 |  |

## (c) Soak health

- **Script errors**: 0 in every run (before-40, after-10, after-40 x2, bundle-40). Every soak ended with RESULT: PASS.
- **Repeated warnings**:
  - before-40: `[stash] Error: native page snapshot did not restore exactly one storage entity` 675 times (15 more surfaced as scenario lines). It is gone in after.
  - after: `[elite] InvalidEntityError: Failed to get property 'dimension' due to Entity being invalid` appears 1x (after-10), 1x (after-40), 5x (after-40 repeat) and 4x (bundle 300 s). It is rare but recurs, from one of elite_bp main.js's bare `console.warn(`[elite] ${e}`)` catches (lines 167/176/433/437/646). One `[moon] InvalidEntityError: Failed to call function 'hasTag'` appeared in the after-40 repeat.
  - Every run, startup only: `[Watchdog] High memory usage detected` (once) and the custom command alias clashes for help, hud and weather (aliases taken; the full realm: names still work).
- **RSS (bedrock_server, sampled every 30 s)**:
  - after-40 repeat, 900 s: 1404 MiB at 30 s -> 1530 MiB at 901 s, +126 MiB (+9%). The growth is close to linear (about 8.7 MiB/min) and did not plateau within 15 min.
  - after-10, 900 s: 1292 -> 1366 MiB, +74 MiB (+6%).
  - before-40 (6415 ticks over 23 min wall): 1351 -> 1502 MiB, +151 MiB.
  - bundle-40, 300 s: 727 -> 787 MiB, +60 MiB. In the same window, separate packs grew +55 MiB.
  - Some of this is world and chunk state (40 players spread 240+ blocks apart, and more mobs as night falls), so it is not necessarily a script leak. A longer soak would tell.
- **TPS drift** (cumulative windows from the 120 s interim dumps, first window about 0-6 min vs last about 4-5 min):
  - after-40: 19.38 -> 19.47.
  - after-40 repeat: 19.43 -> 19.19.
  - after-10: 19.87 -> 19.70.
  - bundle-40: 19.95 -> 20.0.
  - before-40: 4.16 -> 4.88.
  - Tick-interval p95 is steady at 71-76 ms (40 players) and 58-59 ms (10 players). No downward trend beyond noise.
- **Per-pack drift** (ms/tick, first window -> last window; total 9.37 -> 10.16 at after-40, 9.38 -> 10.44 on the repeat):
  - elite_bp 0.056 -> 0.317 (repeat 0.055 -> 0.679); its runInterval(5) @ main.js:876 and auraLoop grow.
  - wander_bp 0.09 -> 0.56 (runInterval(2) updateLabels @ main.js:1510).
  - moon_bp 0.03 -> 0.17 on the repeat.
  - These rise late in the run, as night arrives (the soak spans about 0.75 day): more hostile mobs, champions and wanderers. It looks like workload, not a leak, but elite_bp and wander_bp scale with entity count and should be checked for a cap.
  - map_bp and build_bp are flat (within 6%). stash_bp drops 47% after its startup work.
