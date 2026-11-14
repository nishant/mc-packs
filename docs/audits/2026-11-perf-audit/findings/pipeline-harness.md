# Build, test harness and CI pipeline: performance findings

Scope read: `docs/WORKING.md` ("Releases from CI", "Testing in CI", "Fast testing"); `package.json`, `tsconfig.json`;
`.github/workflows/check.yml`, `pr-tests.yml`, `validate.yml`, `release.yml`, `.github/actions/bds/action.yml` (all in
full); `tools/build.mjs`, `tools/bundle.mjs`, `tools/lib/zip.mjs`, `tools/ci-release.mjs`, `tools/check-versions.mjs`,
`tools/check-pipeline.mjs` (full); in `tools/test-bds/`: `run.mjs`, `suite.mjs`, `affected.mjs`, `perf-compare.mjs`,
`scenario-soak.mjs`, `setup.mjs`, `validate-report.mjs`, `lib/profile.js`, `lib/profile-report.mjs`, `lib/server.mjs`,
`lib/packs.mjs`, `lib/perf-acceptance.mjs`, `examples/perf-soak.js` (full); `testpack/scripts/harness.js` lines 1-300
and 460-500 plus a grep of its scenario API; `lib/shim.js` 1-110; `README.md` 140-280 and 440-506; the header comments
of 15 perf and soak scenarios; file names of all 314 scenarios. Real CI data read with `gh` (read-only): the last 12
runs of each workflow, per-step times of 2 check, 7 release, 4 pr-tests and 2 validate runs, failed attempts of 3
release runs, the job logs of one check job, one bundle smoke job, two failed merge jobs, two release jobs and the four
shards of a full pr-tests run (per-scenario seconds for all 314 scenarios), perf-report issues 211, 212, 217, 218, and
the asset lists of the `packs-realm-bundle`, `packs-realm-resources`, `packs-easy-building-guides` and
`packs-realistic-rain` releases. File sizes under `packs/build_rp` and `packs/rain_rp` and PNG/Ogg headers were read
with `ls`, `od` and `stat`. Nothing was built or run.

## Summary

- The harness already produces most of what the audit says is missing, then drops it. The full profile JSON of every
  soak (per-callback top lists, slowest calls, bedrock_server CPU ms per tick) is written on the runner and never
  uploaded; the per-tick series is on the host and only percentiles are kept; the bundle run reports 5 callbacks for
  67 packs. Keeping it costs a few lines (PIPE-01, PIPE-02).
- Nothing measures engine-side script cost. No native profiler, no watchdog statistics, no unprofiled tick meter; the
  watchdog lines the server prints are not counted in any report (PIPE-03, PIPE-09).
- The two headline numbers are not comparable as published: the bundle soak (5 min) ends before dusk, the
  separate-contexts A/B soak (15 min) runs about 4 of its 15 minutes after dusk (PIPE-04). The soak has no idle, join,
  leave, death, kill, block or menu-census phase; the profiler already supports named phases.
- Validation takes 100 minutes because of `max-parallel: 4`; with every job started at once it is 62 minutes (the
  memory soak), and 31 minutes if the memory soak runs nightly as `docs/WORKING.md` itself says (PIPE-05). Because it
  is slow, queued runs are canceled and 2 of the last 12 masters were never validated; their changes are also hidden
  from the next A/B because its base is `HEAD^1` (PIPE-06).
- The bundle A/B, the one for what ships, is a single 300 s pair in a fixed order. The newest report is an A/A run
  (no pack changed) and shows +9% and +5%; the last six show -10% to +43%, and the head, always second, was never
  faster at 40 players. The bars also let a typical pack grow by 0.1 ms/tick per merge with no red flag, and the PR
  check measures 67 separate contexts, not the bundle (PIPE-07).
- CI wall times are good where it matters: check 2 min 10 s, a small PR 4 to 11 min, merge to live 9 to 14 min. The
  waste is in outliers: check-live races the deploy (2 of the last 8 releases needed manual reruns, +4 and +26 min), an
  uncached Playwright install (15 to 245 s, twice per release, once hung for 45 min), and full-suite PRs capped at 4
  shards (27 to 43 min; 17 with 8 shards) (PIPE-11, PIPE-12, PIPE-13).
- `npm run check` is 85 s in CI and 80% of that is three steps (unit tests 45 s, `tsc` 12 s, `check-stories` 11 s);
  the chain of 45 small processes is under 10 s in total (PIPE-14).
- Realm Resources is 10.15 MB and is re-downloaded by every player whenever any resource pack changes (36 versions so
  far). 84% of it is three stable things: one song, 13 languages of panel and page textures, and the rain sounds
  (PIPE-15).

Corrections to facts in the brief and to `cross-cutting.md` are collected under "Cross-references" at the end.

## Findings

### PIPE-01 The detailed profile is produced on every soak and thrown away  [high / confirmed / S / none]
- Where: `tools/test-bds/suite.mjs:302` (`--json` keeps only `acceptance`, `bundle`, `server` and per-pack
  `{ whole, steady }`); `tools/test-bds/suite.mjs:271` (the full `run.mjs` profile JSON goes to
  `$BDS_HARNESS_LOGS/suite-<time>/perf-<n>.json`); `.github/workflows/validate.yml:168-183` (soak and bundle jobs
  upload only `$RUNNER_TEMP/out`; the harness log folder is uploaded for `kind == 'suite'` only);
  `tools/test-bds/lib/profile.js:201-203` (`top` and `slowest` are 5 entries each per profiler instance);
  `tools/test-bds/lib/profile-report.mjs:250-265` (the full JSON has `process`, `workload`, every pack row).
- What happens and how often: every validation run (8 soak executions per merge) writes a full profile per side with,
  per pack, the top 5 callbacks by time, the 5 slowest single calls with their `max`, the counters and the handled
  script events, plus `process.cpuMsPerTick` (bedrock_server CPU from `/proc`, the only figure that includes engine
  time). The artifact gets the reduced `head.json`. In `--bundle` mode there is one profiler instance for 67 packs, so
  even the full JSON names only 5 of about 600 callbacks, and the report has one row (`realm_bundle 2.033`): there is
  no per-pack figure inside the real one-context bundle; per-pack numbers come only from the 67-context run.
- Cost estimate: none to keep it. The full JSON is tens of KB per run.
- Fix: (1) in `validate.yml`, copy `suite-*/perf-*.json` (and `.out`) into `$OUT` for soak and bundle kinds, or upload
  the log folder for every kind. (2) In `suite.mjs:302` keep `process`, `workload` and each pack's `top`, `slowest`
  and counters. (3) In `profile.js`, when the dump is final, emit every callback with `ms > 0 || max > 0` as chunked
  `PROFILE_CALLBACKS` lines (same 1,500-character parts as `PROFILE_TICKS`, `profile.js:207-213`); in
  `profile-report.mjs` add a table by `scripts/<pack>/` path prefix when `contexts === 1`, so the bundle run gets a
  per-pack column of its own. (4) Print `process.cpuMsPerTick` for base and head in `perf-compare.mjs`'s table.
- Prove it with: `lib/profile-events.test.mjs` and `validate-report.test.mjs` extended for the new fields; one
  `validate.yml` dispatch with `quick`.

### PIPE-02 Slow ticks: the per-tick series is already on the host; keep a phase histogram and the 10 worst ticks  [high / confirmed / S to M / low]
- Where: `tools/test-bds/lib/profile.js:24` and `:45-57` (`ticks[]`, ms per tick, kept for the whole run and sent as
  `PROFILE_TICKS`); `tools/test-bds/lib/profile-report.mjs:162-176` (`bundleTicks` rebuilds tick -> ms for the whole
  bundle, then keeps avg, p50, p95, p99, max and a count).
- What happens and how often: once per profiled run. Everything XC-03 asks for on the host side exists in
  `bundleTicks`' `sum` map and is discarded after the percentiles.
- Cost estimate: zero in game for the histogram. For the worst-tick record, one array push per callback that reads
  1 ms or more (about 2 per tick at 40 players: the bundle averages 2.03 ms over 109 calls).
- Fix: (a) host side, no profiler change: `byPhase200[tick % 200] += ms` and the same for 20, 40 and 100, written to
  the JSON as arrays plus "share of ticks over 5 ms that fall on a multiple of 20". All intervals are registered in
  the load tick, so their comb has a fixed offset against `system.currentTick` and shows as spikes at fixed residues.
  (b) In `record()`, keep the current tick's `[key, ms]` pairs for calls with `ms >= 1`; at `flushTick`, if the tick
  total enters the 10 largest, store `{ tick, ms, calls: [...] }`; dump with the final row. (c) Report the worst ticks
  of the steady window and of each phase (PIPE-04), not only of the whole run.
- On the clock (answers the brief's question, corrects XC-03's hedge): a call reads `floor(end) - floor(start)`. With
  a start phase that is uniform inside a millisecond the expectation is exact, so sums are unbiased. A tick's total is
  the number of millisecond boundaries that fall inside callbacks: exact to within 1 ms when callbacks run back to
  back, and with a standard deviation of roughly 1 ms when 2 ms of work is spread over a 5 to 10 ms span. So p95 9 ms
  and p99 14 ms against a 2 ms mean are real bursts, not quantization. What is noisy is small packs: a pack at 0.03
  ms/tick collects 180 one-millisecond hits in a 300 s window (about +/-15% at two standard deviations) and 36 hits
  in the PR check's 60 s window (about +/-33%). Per-pack `p95TickMs` and `max` below 2 ms carry no information.
- Prove it with: `lib/profile-phases.test.mjs` extended; the next validation's bundle-40 histogram answers XC-03.

### PIPE-03 Nothing measures engine-side script cost; the native profiler and watchdog statistics are unused  [high / needs-measurement / M / low]
- Where: no hit for `profiler start`, `exportstats` or `cpuprofile` anywhere in `tools/test-bds` (grep); console
  commands go out through `tools/test-bds/lib/profile-report.mjs:87` (`send`) and from scenarios through `t.console`
  (`testpack/scripts/harness.js:518` -> `run.mjs:193` `bds.send(obj.cmd)`); the tick meter runs only under
  `--profile` (`harness.js:192-195`, `:209-214`); `procStats` only under `--profile` (`profile-report.mjs:93`, `:107`).
- What happens and how often: the profiler times the inside of each wrapped callback. Not in any figure: building the
  event object and entering the script engine for each of the 109 callbacks a tick (XC-01's 67 wake-ups per event),
  the profiler's own bookkeeping after the end timestamp (`record()`: one `system.currentTick` read, one `Map.get`
  per call), native work a call queues for later (packets from `setActionBar`, saves from `setDynamicProperty`,
  commands), and time after an `await`. The memory soak runs the same workload unprofiled for 60 minutes and records
  RSS only, so there is no unprofiled TPS, tick interval or CPU to compare with.
- Cost estimate: not measured, by construction. XC-01's 0.7 ms/tick at 40 players is an estimate.
- Fix: (1) Always-on meter: let `perf-soak.js` start the tick meter and let `run.mjs` take `procStats` without
  `--profile` (a `--meter` flag), so `memory-40-*` report TPS, tick interval percentiles and CPU ms/tick. Profiled
  minus unprofiled CPU ms/tick on the same workload bounds the profiler's own cost. (2) A differential scenario for
  XC-01 that needs no new instrument: the idle scenario for 60 s twice in one job, once sending 5 no-op `realm:`
  events a tick and once not, bundle installed; `process.cpuMsPerTick` difference divided by 5 x 67 is the full cost
  of one listener wake-up, engine side included. Run it before and after XC-01. (3) Native tools, to verify on BDS
  1.26.52 (I could not run the server): `script profiler start` / `script profiler stop` from the console (writes a
  `.cpuprofile`) and `script watchdog exportstats` (per-pack timing and memory). If they exist, send them from
  `Profile.start()` and `Profile.finalDump()` (`profile-report.mjs:89-109`) behind `--native-profile`, and copy the
  output files out of the server folder before `cleanup()` removes it (`run.mjs:116`; `summary()` at `:309` is the
  place, into `BDS_HARNESS_LOGS`). Run it as a separate short pass, not inside the measured soak, since the native
  profiler has its own overhead. A JS heap figure, which no report has today, would come from `exportstats`.
- Prove it with: one manual `validate.yml` dispatch with a scenario pair; `README.md` gets the verified command list.

### PIPE-04 The soak has one phase; add idle, one-player and churn phases, and fix the dusk mismatch  [high / confirmed / M / low]
- Where: `tools/test-bds/examples/perf-soak.js:254-297` (the loop), `:190-194` (12 commands), `:319` (the run fails
  if any player leaves); `lib/profile-report.mjs:235-240` (`workload.phases` is already supported and reported per
  pack; `night-soak.js` uses it); `.github/workflows/validate.yml:80-83` (soak 900 s, bundle 300 s).
- What the players do: each second, a land player walks to a random spot within 8 blocks of home with probability
  0.35 (`:264-266`), otherwise looks around, sneaks, jumps or stops; every 45 s each player runs one of 12 commands
  (a form a command shows is opened through the shim and canceled after 100 ticks, `harness.js:167`; nobody goes
  past a first page); every 20 s a land player's slot 0
  is emptied and `realm:refill_need` is sent; 2 players stand in a pool and 2 in a Nether pocket.
- What never happens in a soak, and what already measures it:

  | Never in the soak | Existing scenario | Under `--profile` today | Fold in as |
  |---|---|---|---|
  | An empty world or one player alone (the Realm's usual state) | none | no | phases `empty` (20 s) and `one` (30 s) before the ramp |
  | Join or leave after the ramp | `moon-join`, `maps-leave`, `elite-invalid-leave`, `milestones-rejoin` (functional) | no | churn phase: one `disconnect()` and one `t.player()` every 5 s |
  | Death and respawn | `death-party`, `expedition-deaths`, `saga-graveyard-softlock` | no | churn phase: `p.kill()` on 2 players |
  | Dimension change | `saga-graveyard-softlock` | no | churn phase: teleport 2 players to the Nether pocket and back |
  | Block break and place | `durability-events`, `silly-gear-events`, `claims-*` | no | churn phase: `breakBlock` and `setBlock` loops on 4 players |
  | Mob deaths in bulk (farm) | none | no | churn phase: summon 20 zombies and kill them, each second for 20 s (33 `entityDie` handlers each, XC-06) |
  | Combat with gear | `gear-perf` | yes, numbers discarded (PIPE-10) | A/B pair |
  | Inventory churn | `gear-perf`, `stash-autostore-perf` | yes, discarded | A/B pair |
  | Settings census (`/realm:prefs`, `/realm:config`; XC-02, XC-05) | `admin-menu`, `settings-*`, `prefs-*` (functional) | no | churn phase: both commands once |
  | Travel into new chunks | `wander-walk`, `map-places` (functional) | no | new phase; see note |
  | Night, champions, moons | `night-soak` (5 packs, phases) | yes, discarded | A/B pair, and see dusk note |
  | Weather events with a crowd | `weather-crowd`, `tornado-sound-perf` | yes, discarded | A/B pair |
  | Expeditions | `expedition-perf` | optional flag | A/B pair |
  | Building tools in use | `build-holders-perf` covers holders, not building | yes, discarded | new scenario (see `build-stash-expedition.md`) |
  | Towns with residents and labels | `town-capital-perf`, `npc-labels-perf` | yes, discarded | A/B pair |
  | Active story quests | `saga-perf-quests`, `saga-stealth-perf` | yes, discarded | A/B pair |
  | Minimap radar on | none (`hud-maps.md`: the soak leaves it off) | no | `--arg radar=1` variant of the bundle-10 job |

- Dusk mismatch: a fresh world starts at tick 0 (6:00, `README.md:470`) and the soak never sets the time. The bundle
  soak ends about 360 s in (ramp plus 300 s): daylight only. The A/B soak ends about 960 s in: tick 13,000 (dusk) is
  at 650 s, so its last 4 to 5 minutes include night spawns around 8 groups. "Bundle 2.03 against 2.76 summed over
  separate contexts" therefore compares a day window with a day-plus-night window, on different runners.
- Fix: (1) Phases in `perf-soak.js`: `empty`, `one`, `ramp`, `steady` (unchanged, still the only window the budget and
  the A/B use) and, after `steady` ends and retention has been judged, `churn` (60 s). Report them in
  `workload.phases`; with PIPE-02 each phase gets its worst ticks. Adds about 2 minutes per soak side. Player counts
  stay 10 and 40. (2) Make the windows comparable: run a `bundle` pair with the same 900 s window, or pin daytime in
  both (`/gamerule dodaylightcycle false` in the soak, with night covered by `night-soak` as a pair). (3) Per-pack
  perf scenarios against the bundle: `scenario-soak.mjs` builds the command from the scenario's `--only` line
  (`:31-47`) and `run.mjs:60` refuses `--bundle` with `--only`; add a `--bundle <mcpack>` option that drops `--only`
  and `--packs` so a pair runs in the one-context bundle (scenarios already test `t.packs.includes(...)`).
- Note on chunks: `docs/WORKING.md:164` says simulated players load no chunks; `perf-soak.js:26` and `:174` say a
  player keeps the chunks around it loaded. One of the two is stale. If the second is right, a travel phase is a
  teleport of 2 players 64 blocks every 2 s; if the first, it needs a moving ticking area (10 allowed). To verify on
  the server before designing that phase.
- Prove it with: `lib/perf-acceptance.test.mjs` (retention judged on the steady window only), a `quick` dispatch.

### PIPE-05 Validation takes 100 minutes because 4 jobs run at a time; the floor is 62, or 31 without the per-merge memory soak  [high / confirmed / S / none]
- Where: `.github/workflows/validate.yml:65` (`PARALLEL` default 4), `:94` (clamped to 8), `:104` (`max-parallel`),
  `:70` (`--shards 4`), `:84-85` (two 3,600 s memory jobs); `tools/test-bds/affected.mjs:195` (shards capped at 8);
  `docs/WORKING.md:172` ("Before a final release only: the 60-minute memory soak").
- What happens and how often: every merge to `master`. Run 43107658136: 10 jobs, 341 runner-minutes (11, 11, 31, 31,
  61, 61, 36, 36, 30, 33), wall 100 min 51 s. The memory jobs waited 11 minutes for a slot, suite shards waited 31 to
  67 minutes. Each matrix job is its own runner, so "one soak per runner" holds at any parallelism; the repo is public
  (free minutes, 20 concurrent jobs).
- Cost estimate: 38 minutes of waiting per merge today. With every job started at once: 61 min (memory) plus plan and
  report, 62 min. With the suite on 8 shards each shard is about 16 to 17 min (15,142 s of scenarios at `--jobs 2`;
  `town-hillside` alone is 962 s, so 16 min is the shard floor). Without the memory pair the run ends when the A/B
  soaks do: 31 min.
- Fix: `max-parallel` 14 (raise the clamp at `:94`), `--shards 8`. Then choose: (a) keep memory per merge (62 min) and
  post the report issue twice (at 31 min without memory, edited when memory lands), or (b) move `memory-40-*` to a
  nightly `schedule` plus a dispatch input, as WORKING.md already describes, and validate each merge in 31 min. In
  either case `memory-40-base` can reuse the previous run's `head.rss` when that run validated the base commit.
- Prove it with: one dispatch with `parallel` raised; compare soak figures with the previous run to confirm no change.

### PIPE-06 Merges closer together than one validation are never validated, and the next A/B hides them  [high / confirmed / S / none]
- Where: `.github/workflows/validate.yml:40-42` (`concurrency: validate-<ref>`, `cancel-in-progress: false`: GitHub
  keeps one pending run per group and cancels an older pending one), `:91` (`base=$(git rev-parse HEAD^1)`).
- What happens and how often: run 42965068720 (2ca5928) was created 05:20:04 while 6c377f8's run was in progress, and
  was canceled at 06:05:20, one second after 6397ac0's run was created. Run 42582369314 (db571e0) went the same way.
  2 of the last 12 masters were never validated. The run for 6397ac0 then compared 6397ac0 with its first parent
  2ca5928, so whatever 2ca5928 changed against 6c377f8 was in both sides of the pair and in nobody's report.
- Cost estimate: any regression that lands in a skipped merge is invisible to the A/B forever (only the absolute
  budget line could show it).
- Fix: take the base from the last master commit that has a completed validation, not `HEAD^1`: in `plan`, read the
  newest successful or failed (not canceled) `validate.yml` push run on `master` with `gh api` and use its `head_sha`
  when it is an ancestor of `HEAD`, else `HEAD^1`. Say in the report how many commits the pair spans. PIPE-05 makes
  skips rarer but does not remove them.
- Prove it with: a unit test for the base choice (pure function over a list of runs); the next two quick merges.

### PIPE-07 The bundle A/B is one short pair in a fixed order, its noise is -10% to +43%, and the bars let creep through  [high / confirmed / S to M / low]
- Where: `.github/workflows/validate.yml:142-148` (bundle kind: `for side in base head`, one 300 s run each, always
  base first), `:82-83`; `tools/test-bds/perf-compare.mjs:54` and `:59` (bundle: more than 15% AND more than 0.5 ms;
  pack: more than 50% AND more than 0.1 ms); `.github/workflows/pr-tests.yml:140` (`suite.mjs --perf 10
  --perf-seconds 60`, no `--perf-bundle`); `tools/test-bds/validate-report.mjs:107-108` (budget lines are listed,
  never red).
- What the last six reports show (whole bundle, base -> head, same runner):

  | Report | bundle-10 | bundle-40 | soak-10 (67 contexts, 900 s) | soak-40 |
  |---|---|---|---|---|
  | 218 | 0.975 -> 1.060 (+9%) | 1.937 -> 2.033 (+5%) | -3% | +1% |
  | 217 | 1.204 -> 1.222 (+2%) | 2.213 -> 2.346 (+6%) | +3% | -2% |
  | 215 | 0.670 -> 0.960 (+43%) | 1.712 -> 1.770 (+3%) | +5% | +1% |
  | 212 | 0.946 -> 0.849 (-10%) | 1.499 -> 1.664 (+11%) | +2% | -2% |
  | 211 | 1.172 -> 1.163 (-1%) | 2.134 -> 2.167 (+2%) | 0% | 0% |
  | 207 | 1.126 -> 1.106 (-2%) | 2.388 -> 2.392 (0%) | +1% | +7% |

  Report 218 is an A/A run: its head (68095de, PR #213) is a dev-dependency bump, and the release run logged every
  pack and both bundles as unchanged. Identical packs measured +9% and +5%. Report 215's +43% (+0.29 ms) passed
  because it is under the 0.5 ms bar. At 40 players the head, which always runs second, was not faster once in six
  runs. Across runners the bundle-40 head figure ranges from 1.66 to 2.39 ms/tick, so "2.03" is one draw from a 44%
  range and is not a number to compare a later run with.
- On the bars: a pack that goes from 0.05 to 0.14 ms/tick at 40 players (+180%) is "no regression" (+0.09 ms), and
  so is the next +0.09. At 10 players only map_bp is above 0.1 ms at all, so the PR check can flag a single pack only
  when it adds more than a typical pack's whole budget (0.15). The PR check runs 67 separate script contexts, which
  is not what ships; cross-pack effects (XC-01, XC-02) are smaller there.
- Cost estimate: not a runtime cost; it is how the budget gets spent unnoticed and how a real 10% change is
  indistinguishable from none.
- Fix: (1) Run the bundle pair as base, head, head, base (the `scenario` kind already alternates with `repeat`,
  `validate.yml:157-164`) and compare the means of each side as well as the lows; the job grows from 11 to 22 minutes,
  still shorter than the 31-minute soak jobs, so wall time is unchanged. Use the same 900 s window as the soaks if
  PIPE-04's dusk fix goes that way. (2) Report the A/A spread: once a week dispatch `validate.yml` with `base` equal
  to the head, and print the pair differences as the noise floor next to every later comparison. (3) A drift table
  against a pinned baseline run (stored with the `suite-times` cache): per pack and bundle, change since baseline,
  flagged when beyond the A/A spread. (4) Scale the per-pack absolute bar to the clock noise instead of a flat 0.1:
  `max(0.03, 3 * sqrt(hits) / ticks)` with `hits = ms/tick * ticks` (PIPE-02): 0.03 ms at 300 s. (5) Give the PR
  check the bundle: build both trees' bundles and run `--perf-bundle` at 10 for 60 s per side (the same 3 minutes),
  with the per-pack table from PIPE-01 (3).
- Prove it with: `perf-compare.test.mjs` with the creep cases above; replay the last 10 validation artifacts through
  the new comparison; the first A/A dispatch.

### PIPE-08 Part of the profiler's own cost is inside the figures: a stack capture on every `system.run` and `runTimeout`  [medium / likely, not measured / S / none]
- Where: `tools/test-bds/lib/profile.js:109-112` (`label(...)` is evaluated when the pack calls `run`, `runTimeout`,
  `runInterval` or `runJob`), `:100-104` and `:60-69` (`site()`: `new Error().stack`, split into lines, up to 6 regex
  tests per line), `:73-93` (a new wrapper closure and a `WeakMap.set` per call).
- What happens and how often: subscriptions and intervals pay this once at load. `system.run` and `runTimeout` pay it
  on every call, and those calls are made from inside timed callbacks, so the stack capture is charged to the pack
  that defers work. The packs have 500 `system.run(` / `system.runTimeout(` call sites (grep, synced copies
  included); how many execute per tick in the soak is not recorded. Under the profiler the pack's `diag-core.js`
  also records wrapper -> inner function for each (`profile.js:97-98`).
- Cost estimate: not measured. A stack capture plus parse on QuickJS is plausibly 10 to 30 us; at 10 deferred calls a
  tick that is 0.1 to 0.3 ms/tick, 5 to 15% of the bundle's 2.03, and it lands on exactly the packs that follow the
  advice "defer it to a later tick" (XC-07's fix would look worse than it is).
- Fix: count `site()` calls per tick and time 2,000 `site()` calls once at load (a single `Date.now()` difference is
  accurate at that size); report `profilerOverheadMsPerTick = sitesPerTick * usPerSite` per pack next to its figure.
  Then remove most of it: cache the label by the caller's own stack-free identity where possible (`inner(fn)` when
  the function object is reused), and for fresh closures sample 1 in 8 registrations and label the rest
  `run @ (unsampled)`.
- Prove it with: `lib/profile-events.test.mjs`; an A/B of the bundle soak with the profiler change only (figures
  should drop by the reported overhead).

### PIPE-09 Watchdog lines are printed and forgotten; the watchdog's settings are whatever BDS defaults to  [medium / confirmed / S / none]
- Where: `tools/test-bds/run.mjs:159`, `:269-271`, `:349-352` (lines matching `/watchdog/i` are collected, counted
  and the first 5 printed in the text summary); `tools/test-bds/lib/profile-report.mjs:250-265` (not in the profile
  JSON); `tools/test-bds/suite.mjs:302` and `validate-report.mjs` (not in any report); `.github/workflows/validate.yml:139-140`
  (the uploaded `<side>.out` is `suite.mjs`'s output; the `run.mjs` summary with the `watchdog:` line stays in the
  log folder, which soak jobs do not upload); `tools/test-bds/lib/server.mjs:78-101`
  (`baseProps` sets no `script-watchdog-*` key); `tools/test-bds/README.md:475` ("BDS logs `[Watchdog] High memory
  usage detected` once at startup" with every pack installed as separate packs).
- What happens and how often: every run. A soak that logged 50 slow-script or spike warnings passes with the same
  report as one that logged none. The memory warning is known and "listed, not failed"; nothing records how far script
  memory is from the hard limit, at which the server saves and shuts down. The bundle smoke log of run 43107658102 has
  no watchdog line, so the one-context bundle starts below the warning level with one player; at 40 players it is
  unknown.
- Cost estimate: none to record. To verify on BDS 1.26.52: the defaults I expect are spike 100 ms, slow 10 ms, hang
  10,000 ms, memory warning 100 MB, memory limit 250 MB (`script-watchdog-*` in `server.properties`).
- Fix: put `watchdog: { count, byKind, first: [...] }` into the profile JSON and the suite `--json`; print base and
  head counts in the validation report; red when head has a kind base does not. Set the watchdog keys explicitly in
  `baseProps` so a BDS update cannot change them silently, and add `--prop script-watchdog-spike-threshold=50` to the
  churn phase run to find spikes before a Realm does. With PIPE-03's `exportstats`, report script memory against the
  limit.
- Prove it with: a unit test feeding `run.mjs`'s line parser sample watchdog lines (the classifier is inline at
  `:265-274`; move it next to `lib/caught.mjs`).

### PIPE-10 Ten per-pack perf workloads run on every merge under the profiler and their numbers are discarded  [medium / confirmed / S to M / none]
- Where: scenario headers with `--profile` that the suite runs as written (`night-soak` 207 s, `town-capital-perf`
  222 s, `tornado-sound-perf` 144 s, `saga-perf-quests` 132 s, `weather-crowd`, `npc-labels-perf`,
  `saga-stealth-perf`, `stash-autostore-perf`) and `suite.mjs:69-71` (`perf-soak`, `build-holders-perf`, `gear-perf`
  with `--profile`); `suite.mjs:388-391` (the suite JSON has result and seconds only); `validate.yml:156-164` (the
  `scenario` A/B kind exists but only for manual dispatch).
- What happens and how often: every merge (and every full-suite PR) spends about 15 runner-minutes profiling these
  workloads; each writes `<log>.profile.json` into the 14-day `logs-suite-<n>` artifact, which no report reads.
- Fix: (1) cheap: `suite.mjs` copies `bundle.steadyWindow.avg` (or `msPerTick`) and the top 3 packs of every profiled
  scenario into its JSON; `validate-report.mjs` prints a "scenario perf" table with the change against the previous
  run's cached values (cross-runner, so a trend line with a 40% noise band, not a gate). (2) better: add the eight
  scenarios as `kind: "scenario"` matrix entries on every merge (same-runner pairs, 5 to 10 min each, free runners, no
  added wall time after PIPE-05), using the short suite arguments at 10 players.
- Prove it with: `validate-report.test.mjs`; one dispatch.

### PIPE-11 check-live races the deploy: 2 of the last 8 releases needed manual reruns  [medium / confirmed / S / none]
- Where: `tools/ci-release.mjs:284-292` (`checkLive`: one `check-live.mjs --wait 900`, any failure ends the run);
  `.github/workflows/release.yml:203-215`.
- What happens and how often: release 43087605338 attempt 1 failed with `FAIL packs/elytra-hud/elytra-hud-1.3.25.mcpack
  is missing` (1 problem of about 90 checks) and passed unchanged on rerun 80 s later; release 42965338467 failed
  twice (`realm-resources-2026.1020.532.mcpack should answer 302 ..., got 200`) and passed on the third attempt 22
  minutes later. Merge to live was 12 min 17 s and 34 min 5 s instead of about 10.
- Cost estimate: 4 and 26 minutes of a session or the owner waiting and rerunning, on 25% of recent releases.
- Fix: in `checkLive`, on failure sleep 60 s and run check-live once more, then a third time after 120 s; report
  "passed on attempt n". If the same line fails three times it is real. The cause is on the hosting side (the deploy's
  asset fetch and archive redirect are not finished when the deploy reports done); `check-live.mjs` is in
  `nishant/hosting` and was not read.
- Prove it with: `tools/ci-release.test.mjs` (the retry wrapper as a pure function); the next releases' summaries.

### PIPE-12 Release jobs install Playwright twice, uncached and without a time limit  [medium / confirmed / S / none]
- Where: `.github/workflows/release.yml:100-104` and `:198-202` (`npx playwright install --with-deps chromium`), `:68`
  (45-minute job limit, no step limit), `:159-166` (the upload job's two passes).
- What happens and how often: every release, in the `release` job (for `check-site realm`) and again in `merge` (for
  check-live). Measured times of the "Install the hosting tools" step (hosting's `npm ci` plus the browser install):
  15, 19, 23, 24, 25, 29, 61, 66 and 245 s. In run 43056695029 the step hung until
  the 45-minute job limit canceled the release, which was then started by hand: 93 minutes from merge to live. The
  `upload` job spends 55 to 140 s on "upload every version without an asset" and 47 to 64 s on "check the newest 5",
  about 2 minutes even when nothing is new (run 43107978168: uploaded 0).
- Cost estimate: typical merge to live with a hosting PR is 9 to 14 minutes (check 2 min 10 s, release 1 min 15 s to
  2 min, upload 2 to 3.5 min, merge 1 to 6.75 min); about 1 minute of that is Playwright in the normal case and 4 to
  45 minutes in the bad ones.
- Fix: cache `~/.cache/ms-playwright` keyed on the Playwright version in hosting's `minecraft/package-lock.json`
  (`actions/cache`), run `install-deps` only on a cache miss, and put `timeout-minutes: 6` on both install steps with
  one retry. The upload job's listing of 76 releases is in hosting's `archive-packs.mjs` (not read): one GraphQL query
  or parallel `gh` calls would cut its 2 minutes to seconds.
- Prove it with: step times of the next five releases.

### PIPE-13 Full-suite PRs are capped at 4 shards: 27 to 43 minutes where 17 is available  [medium / confirmed / S / low]
- Where: `.github/workflows/pr-tests.yml:68` (`--shards 4 --per-shard 8`), `:99` (`max-parallel: 4`);
  `tools/test-bds/affected.mjs:97-108` (balancing), `:27-31` (a harness, `package.json` or `tools/lib` change selects
  every scenario).
- What happens and how often: every PR that touches the harness, `package.json` (each @nish/ui or Dependabot bump) or
  many packs. Measured: 27, 32, 35, 35, 37, 38 and 43 minutes. A one-area PR took 3 min 36 s to 10 min 50 s; a
  docs-only PR 14 s; a follow-up push 2 minutes (the carry-over works).
- Scenario times (run 43046001686, all 314 scenarios, first runs): 15,142 s in total, median 21 s, p90 107 s; 193
  scenarios under 30 s; the 25 slowest (8%) are 42% of the time. Slowest: `town-hillside` 962 s, `town-build-resume`
  409, `domt-cards` 345, `caravan-traders` 313, `wander-tether` 312, `caravan-llamas` 306, `domt-places` 298,
  `town-life` 295, `town-resume-guards` 240, `town-capital-perf` 222. Ten town scenarios are 20% of the suite. The
  shards are balanced to within 2% (3,726 to 3,807 s) from the cached `suite-times.json`, so balancing is fine; the
  count is the limit.
- Fix: `--shards 8` and `max-parallel: 8` in `pr-tests.yml`. Then `town-hillside` (16 minutes, 6.4% of the suite) is
  the floor of any shard: see whether its waits can be shortened by test-only settings (the towns reader has the
  pack's build pacing). A dependency bump that changes no runtime file (`package.json` matches `HARNESS` at
  `affected.mjs:28`) could run the six every-pack scenarios instead of all 314.
- Prove it with: the next harness PR's wall time.

### PIPE-14 `npm run check`: three steps are 80% of 85 seconds, and they run one after another  [medium / confirmed (CI log timestamps) / M / low]
- Where: `package.json:9` (the chain), `:20` (`node --test`); `tsconfig.json` (no `incremental`).
- Measured in CI (job log of run 43107658102, 4 vCPU): 85 s in total. `tsc -p .` and check-pipeline 12.4 s;
  manifests, ASCII, docs, commands 0.5 s together; `check-stories` 11.3 s (154,137 endings); ids, events, action bar,
  event guards, line endings 3.3 s; unit tests 44.7 s (213 files, about 2,080 tests; the dot output stalls for 20.8 s
  on one file or group); ESLint 5.4 s; 13 sync checks and the two catalogs 0.7 s; the generator checks 6 s (rain
  sounds 2.5, glyphs 2.8). The boundary between the unit tests and ESLint is inferred from the last line of test
  dots. `npm run build` takes under 1 s for all 74 packs and `bundle.mjs --all` 1 s, so zipping is not a cost.
- What re-reads what: about 10 tools each walk and read all pack scripts (734 files, 10.7 MB) and only `check-docs`
  and `help-catalog` read the 1.18 MB `docs/PACKS.md`; each of them finishes in 0.1 to 1.5 s, so sharing one parsed
  tree would save under 5 s. `tsc` checks every file under `packs/**/scripts` with `checkJs`; 68 files (all of
  build_bp) carry `// @ts-nocheck`; about 30% of the bytes it parses are identical synced copies (67 `diag-core.js`,
  66 `settings-core.js`, 67 `script-events.js`).
- Fix: a small runner (`tools/check.mjs`) with the step list in a file, one step per line (which also ends the merge
  conflicts on the long line that `check-versions.mjs:99-100` works around; `check-pipeline.mjs:8-17` then reads the
  list instead of the script string). Run two lanes at once: the unit tests (they already use 3 processes) and
  everything else in order, `check-versions` last; collect every failure and print them together. Expected CI time
  about 50 s (bounded by the tests). Locally add `"incremental": true` with a `tsBuildInfoFile` under
  `node_modules/.cache` (works with `noEmit`), and skip `check-stories` when a hash of `packs/saga_bp/scripts/stories`
  and the tool is unchanged since its last pass. Find the slow test file with
  `--test-reporter=spec --test-reporter-destination=<file>` in CI (durations per file) before optimizing tests.
- Risk: CLAUDE.md documents "stops at the first failure"; a combined report changes what a session reads. Keep the
  exit code and print the first failure first.
- Prove it with: the check step's time in CI before and after; `check-pipeline` still failing on a missing step.

### PIPE-15 Realm Resources is 10.15 MB and every player downloads all of it again when any resource pack changes  [medium / confirmed sizes / M / owner decisions]
- Where: release assets: `realm-resources-2026.1111.1930.mcpack` 10,150,776 bytes, `easy-building-guides-2.1.16`
  7,442,378, `realistic-rain-1.4.4` 2,448,239, `realm-bundle-2026.1111.1930` 2,463,173. 36 Realm Resources versions
  and 105 Realm Bundle versions are published. In release 43087605338 a change to `hud_rp` (176 KB of JSON UI and
  glyphs) produced a new Realm Resources version.
- What is in it (bytes on disk): `packs/build_rp/sounds/records/run_away.ogg` 2,944,154 (one streamed music disc used
  by elytra_bp: mono, 44.1 kHz, Vorbis nominal 86 kbps, about 4.5 minutes; 29% of Realm Resources);
  `packs/build_rp/textures/entity` 4,601,650 in 928 PNGs: guide book base pages 916 KB (48 pages, 160x200), guide
  book inks 13 languages x about 116 KB, panel inks 13 languages x about 150 KB (18 textures each, 1024 wide);
  `packs/rain_rp/sounds` 2,463,557 in 37 clips (mono 44.1 kHz, `-q:a 3`, `tools/gen-rain/sounds.mjs:495`; the four
  beds are 171 KB each); build_rp models, texts and animations 1.67 MB of JSON, which deflates well.
- Cost estimate: 10.15 MB per player per Realm Resources version, on phone data for the Fold. The 12 non-English ink
  sets are about 3.2 MB (31%); the song 2.9 MB (29%); rain 2.4 MB (24%).
- Fix options, each with its cost: (a) Languages: a bundle-time filter (`bundle.mjs --resources --langs en,...`) that
  leaves other languages' ink folders and `.lang` files out of Realm Resources only, with build_bp's language picker
  offering only the languages present (a missing texture renders as the missing-texture pattern, so the pack must not
  select an absent set); saves up to 3.2 MB; standalone `build_rp` keeps all 13. This is also BSE-15's texture-memory
  fix. (b) The song: re-encode at about 56 kbps mono (saves about 1 MB, audible on music), or accept it. (c) Guide
  book base pages are already 8-bit palette PNGs at 0.6 bytes per pixel; fewer colors might save 0.3 to 0.4 MB (not
  measured). (d) A size budget in `npm run check` (XC-09's suggestion) so growth is a decision: fail when a resource
  pack's built size grows more than 5% without a line in `release/notes.json`.
- Not proposed: a third upload for stable assets (CLAUDE.md: two uploads, keep it that way).
- Checked: the panel and ink PNGs are already palette images (color type 3) at 0.01 to 0.09 bytes per pixel; nothing
  to gain from quantizing them. The rain clips are already mono.
- Prove it with: the built size of `realm_resources.mcpack` before and after; the language picker scenario.

### PIPE-16 Flaky scenarios are counted but never named, and a hung scenario can take a whole shard  [medium / confirmed / S / none]
- Where: `tools/test-bds/suite.mjs:367-377` (failures and timeouts are rerun alone, one after another, after the
  pool; a pass on rerun is `flaky`); `tools/test-bds/validate-report.mjs:47` and `:123-124` (only `fail` and `timeout`
  are listed); `.github/workflows/validate.yml:166` (`| tail -40` hides the retry lines); `suite.mjs:213-217`
  (`hardLimit` is the header's `--timeout` plus 120 s).
- What happens and how often: issue 218 says "311 pass, 3 flaky" and names none. A flaky scenario costs its first run
  plus a serial rerun; if `town-hillside` flakes, its shard grows by 16 minutes. The same scenario failed two
  validations in a row (`expedition-nether-carts`, issues 211 and 212) with two different messages, which is what an
  intermittent failure looks like, and there is no history to check it against. Header timeouts go up to 9,000 s
  (`town-life`, `town-capital-perf`) and 30,000 s (`town-breed-soak`), so one hung run ends only at the job limit (120
  minutes on a PR, 300 in validation) and the shard then writes no report.
- Fix: list flaky names with both durations and the first failure line in the report; keep a per-scenario
  `{ seconds, flaky, runs }` tally in the cached times file and print the top 5 flaky scenarios of the last 20 runs;
  cap `hardLimit` at `max(300, 3 x the cached seconds)` when a time is known. Pass the planned shard count to
  `validate-report.mjs` so a missing shard is named (issue 217 reads "158 pass, 0 fail (2 shard(s))" after two shards'
  uploads failed).
- Prove it with: `validate-report.test.mjs`; `affected.test.mjs` for the tally.

### PIPE-17 Assessment: comment stripping, deflate level and dynamic import (XC-08, XC-09)  [low / needs-measurement / M / low to medium]
- Where: `tools/bundle.mjs:233-257`, `tools/lib/zip.mjs:20`.
- Size of the prize: 43,394 of 226,365 lines in pack scripts are comment-only (19%; bytes not measured, likely 20 to
  30% because JSDoc lines are long). The published bundle is 2.46 MB (not 3.4), so stripping saves perhaps 0.4 to
  0.6 MB of download per bundle version. Startup: the bundle smoke log shows 1.7 s from launching bedrock_server to
  "Server started." with the full bundle on a flat world (prepared at 2.0 s, started at 3.7 s, scenario at 4.1 s), so
  parsing 7.8 MB is under 1.7 s on a 4 vCPU runner and comments are the cheapest part of it. Memory: an engine keeps
  function source text only for function bodies, if at all; most comments are JSDoc above functions. So the gain is
  download size, not time or memory, until measured otherwise.
- Pros: free at build time; line numbers and the diagnostics' `file:line` labels are unchanged if newlines are kept.
- Cons and risks: a regex stripper breaks on `//` inside strings, template literals and regex literals (URLs,
  `/\/\//`); use `ts.createScanner` from the TypeScript package that is already a dev dependency. The harness tests
  sources as separate packs in 300 of 314 scenarios, so a stripper bug would show only in `bundle-smoke`,
  `full-bundle-protocols` and the bundle soaks: add a unit test that the stripped text has the same line count and
  the same token stream as the source for every pack file.
- `deflate` level 9: 1 to 3% of 2.46 MB, about 50 KB. Harmless, not worth a release on its own.
- Dynamic `import()`: not used anywhere in `packs/` today (the only `import(` hits are JSDoc type imports;
  `bundle.mjs:266` already rewrites the dynamic form). Lazy loading of saga chapters would be the first use: verify
  on BDS 1.26.52 that it works on the stable API before designing around it.
- Prove it with: bundle size before and after; the token-stream test; `bundle-smoke`.

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| PIPE-18 | `.github/workflows/check.yml:30` | `bds-smoke` waits for `check` (96 s) though it needs nothing from it; the release trigger waits for both | drop `needs: check`: 2 min 10 s becomes about 1 min 40 s per PR and per release |
| PIPE-19 | `tools/test-bds/testpack/scripts/harness.js:226` | `ticksOver50ms` counts intervals over 55 ms; the JSON key says 50 (the text line at `profile-report.mjs:220` says 55) | rename the key or count both |
| PIPE-20 | `tools/test-bds/lib/profile.js:71`, `:91`, `:140` | `wrapped` maps a callback to its newest wrapper only: the same function subscribed to two signals cannot be unsubscribed from the first while profiling (behavior differs from production) | key by signal and callback (a `WeakMap` per patched signal) |
| PIPE-21 | `.github/actions/bds/action.yml:27`, `check.yml:52` | the BDS cache key hashes all of `lib/server.mjs`, so any edit to that file makes every job download BDS from minecraft.net again | key on `BDS_VERSION` (a one-line file or `grep`) |
| PIPE-22 | `tools/lib/zip.mjs:6-11` | `walk()` returns names in directory order, which Node does not guarantee; zip entry order could differ between file systems | `.sort()` the names: byte-identical packs on every OS |
| PIPE-23 | `tools/test-bds/run.mjs:206` | every profiled run waits a fixed 5 s for the final dump | finish when every pack's final row and tick parts have arrived, 5 s as the limit |
| PIPE-24 | `validate.yml:84` | `memory-40-base` measures a commit the previous run already measured as head (61 runner-minutes) | reuse the previous artifact when the commits match (PIPE-05) |
| PIPE-25 | `tools/test-bds/validate-report.mjs:65-77` | a suite shard with no artifact is not counted at all; the issue text looks complete | pass the expected shard names (PIPE-16) |
| PIPE-26 | `.github/workflows/validate.yml:133-135` | the RSS sampler takes the first `bedrock_server` pid, which is the template generator for the first seconds of a cold job; "start" can be that process | sample the pid recorded in `server.owner.json` with role `run`, or use `rss-soak.mjs`, which already handles this |
| PIPE-27 | `tools/test-bds/lib/server.mjs:92` | `max-players` is 20 while soaks spawn 40 simulated players; it works because simulated players do not count, but the properties misdescribe the run | set it from the scenario's player argument |

## Cross-references to `cross-cutting.md` and the brief

- XC-01: confirmed that nothing in the harness sees the engine side (PIPE-03 gives a way to measure it with fields
  that already exist). The `handledPerTick` counter comes from `profile.js:73-86` and counts wrapper calls, so it will
  fall from 67 per event to the real handler count after the hub, as XC-01 says.
- XC-03: corrected in part. The 1 ms clock cannot produce p95 9 ms or p99 14 ms on a 2 ms mean (PIPE-02); the
  phase histogram is free on the host.
- XC-07: the ramp maximum (71 ms bundle, 404 ms summed over separate contexts) is the only join evidence because the
  soak fails the run if anyone leaves (`perf-soak.js:319`); PIPE-04's churn phase measures a single join.
- XC-08: startup is partly measured already: 1.7 s from process start to "Server started." with the bundle (PIPE-17).
  No dynamic `import()` exists in the packs today.
- XC-09: agreed and sized: about 50 KB (PIPE-17).
- XC-13: contradicted for publishing. The bundle's version is the build time, but hosting's `publish-packs` decides
  "new" by content: release run 43107978168 (a master with no pack change) logged all 76 rows (74 packs and both
  bundles) as `unchanged`, `uploaded 0`, opened no hosting PR and skipped the merge job. An unchanged tree does not produce a new
  version or upload. What does happen is the designed behavior that any one resource pack change republishes all of
  Realm Resources (PIPE-15).
- Brief, "simulated players standing still": the soak's land players walk (probability 0.35 a second, within 8 blocks
  of home). They never travel, so no new chunks; movement-keyed costs get a little exercise, chunk-keyed costs none.
- Brief, "341 of 6,300 ticks over 50 ms": that counter is intervals over 55 ms (PIPE-19).
- Brief, "the built Realm Bundle is about 3.4 MB": the published one is 2,463,173 bytes.
- Brief, the table of ms/tick from issue 218: those figures are from one runner each. The bundle-40 head figure in the
  last six reports is 1.66, 1.77, 2.03, 2.17, 2.35 and 2.39 (PIPE-07).

## Checked and fine

- BDS download: cached; restore plus `setup.mjs` takes 1 to 3 s per job. `npm ci` takes 1 to 3 s (npm cache). The world
  template is generated in every job, about 2 s for the flat one.
- `npm run build` (74 packs) under 1 s and `bundle.mjs --all` 1 s in CI: no need for parallel zipping or caching.
- Shard balancing: uses the cached first-run seconds, longest first onto the lightest shard; measured spread 2%.
- Follow-up pushes: `affected.mjs --since --prev` carried 300+ scenarios and the rerun took 2 minutes.
- The soak's validity checks (`lib/perf-acceptance.mjs`): population, retention, window and per-pack completeness all
  fail closed; a pack whose `PROFILE_TICKS` parts did not all arrive makes the count INVALID rather than low.
- Sums from the 1 ms clock are unbiased (PIPE-02); nested timing does not double count in normal use, because script
  events, `system.run` and commands are delivered later, not inside the caller.
- `ci-release.mjs`: a rerun after a merged PR skips the merge (`:266-268`); notes are passed only once
  (`publishArgs`).
- The profiler is installed after the shim, and with `--no-relay` the shim patches no message call (`shim.js:92-93`),
  so the shim adds nothing to soak figures except its `sendScriptEvent` length check (one string compare per send).
- `release.yml` waits only on `check`; it does not wait on `pr-tests` or `validate`.

## Not read

- Everything in `nishant/hosting` (`publish-packs.mjs`, `archive-packs.mjs`, `fetch-packs.mjs`, `check-live.mjs`,
  `check-site.mjs`, `pack-docs.mjs`): outside the worktree. PIPE-11, PIPE-12 and the XC-13 answer rest on their logs.
- `tools/test-bds/testpack/scripts/harness.js` 300-460 and 500-586, `lib/shim.js` 110-194, `lib/recipe.mjs`,
  `lib/tickingarea.js`, `lib/nbt.mjs`, `lib/unzip.mjs`, `rss-soak.mjs`, `template-race.mjs`, `stash-persistence.mjs`,
  `build-beds.mjs`, `full-bundle-protocols.mjs`, the hooks, and every `*.test.mjs`.
- The bodies of the scenarios other than `perf-soak.js` (15 headers read, 314 names).
- The bodies of the `check-*.mjs`, `sync-*.mjs`, catalog and generator tools (sizes and CI timings only); which unit
  test file holds the 20 s stall.
- `README.md` of the harness outside lines 140-280 and 440-506; `docs/WORKING.md` outside the three named sections.
- Whether `script profiler`, `script watchdog exportstats` and the `script-watchdog-*` defaults behave as described
  on BDS 1.26.52 (marked "to verify" in PIPE-03 and PIPE-09), and whether simulated players load chunks (PIPE-04).
