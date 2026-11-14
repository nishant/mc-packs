# Performance plan, November 2026

Open work only: delete a workstream in the PR that finishes it (never mark it done), and when the last one is gone
delete this file's ROADMAP entry. The findings behind every line are in [`findings/`](findings/), one file per track,
each finding with `path:line`, how often it runs, a cost estimate, the fix and how to prove it. This file says what
to do with them, in what order, and how to know it worked.

| Track | File | Ids |
|---|---|---|
| The bundle, shared modules, the profile data | [cross-cutting.md](findings/cross-cutting.md) | `XC` |
| Build, test harness, CI, releases | [pipeline-harness.md](findings/pipeline-harness.md) | `PIPE` |
| Minimap, Side HUD, maps, atlas, waystones | [hud-maps.md](findings/hud-maps.md) | `HUD` |
| Easy Building, Quick Stack, Expeditions | [build-stash-expedition.md](findings/build-stash-expedition.md) | `BSE` |
| Towns, townsfolk, wanderers, champions, mobs | [towns-entities.md](findings/towns-entities.md) | `ENT` |
| Story, quests, skills, stats and the other progress packs | [story-progression.md](findings/story-progression.md) | `PRG` |
| Weather, sky, utility and menu packs, four resource packs | [weather-utility-menus.md](findings/weather-utility-menus.md) | `UTL` |

The website and its deploy are a separate plan in `nishant/hosting`, `minecraft/docs/perf-audit-2026-11/PLAN.md`
(workstreams H1 to H5). Its H1 (CI minutes per release) goes first: every release from this plan opens a PR there.

## 1. Where performance stands (validation of `68095de`, 2026-11-11)

| | 10 players | 40 players | Budget at 40 |
|---|---:|---:|---:|
| Realm Bundle, one script context, average | 1.06 ms/tick | 2.03 ms/tick | under 5 |
| Realm Bundle, per tick: p50 / p95 / p99 / max | 1 / 3 / 5 / 16 ms | 1 / 9 / 14 / 32 ms | none today |
| Wrapped callbacks per tick | 57 | 109 | none today |
| Server ticks longer than 55 ms | 37 of 6,110 | 341 of 6,300 | none today |
| Minimap | 0.55 | 0.93 | 1 |
| Every other pack | 0.09 or less | 0.15 or less | 0.15 |

The average meets its budget with room to spare, so this plan is not about the average. What the audit found:

1. **The measurement has blind spots, and its headline number is one noisy draw.** The newest report compared two
   trees with identical packs and showed +9% and +5% (PIPE-07). The soak has one phase: nobody joins, leaves, dies,
   breaks a block, flies, opens a settings menu, has a quest or turns the radar on, and the time of day and weather
   are left to chance (PIPE-04, UTL-01). The detailed profile that would answer most questions here is written on
   every run and not uploaded (PIPE-01, PIPE-02). Nothing measures engine-side cost (PIPE-03).
2. **Sharing one context costs more than any pack.** Every `realm:` script event wakes one listener in each of the 67
   packs: 65% of the callbacks in the soak are wake-ups that find nothing to do, and a census like `/realm:help`
   costs packs squared, about 4,500 callbacks (XC-01, XC-02). One mob death calls 33 handlers, one broken block 22
   (XC-06). About 75 timers with periods of 20 to 200 ticks start in the same tick (XC-03).
3. **Real play is much more expensive than the soak.** Estimated from the code, not measured: a player flying with
   the radar on, 4 to 5 ms a tick (HUD-01, HUD-29); a miner with a nearly full Quick Stack page, 2.1 ms a tick
   (BSE-27, measured in October); a 50,000-block build, copy or cut, seconds in one tick (BSE-01); a fishing bobber,
   58 native calls a tick (PRG-01); a rainbow, 259 particle packets twice a second (UTL-02).
4. **Players' devices pay for things the server never sees.** Every side-box title is 5,425 bytes, 70% padding
   (HUD-04); Realm Resources is 10.15 MB and is downloaded again whenever any resource pack changes (PIPE-15); a
   tornado is about 2,500 live particles for each viewer (UTL-03).
5. **Saved data grows with players ever seen** in several packs, and some of it is rewritten whole for one small
   change (PRG-03, PRG-04, PRG-09, PRG-11, BSE-07, BSE-08).

## 2. Rules for this work

- **Models (owner, 2026-11-14):** the audit and this plan were done on Fable 5.2 at high effort. Implementation,
  review and fixes are done by Opus at medium effort, in the session and in every subagent it starts. No Fable.
- **Everything in `CLAUDE.md` and `docs/WORKING.md` applies**: the finishing order, version bumps and `sync-diag`,
  `release/notes.json`, PACKS.md in the same commit when behavior, commands, options or saved data change, NEWS when
  players notice, catalogs last, stable APIs only, plain ASCII game text, and CI as the only release path.
- **One workstream is one PR and one release** (WORKING.md: ship each workstream on its own). Workstreams that share
  no files may be built in parallel worktrees by different agents; the lead alone edits PACKS.md, README, NEWS,
  WORKING.md, `tools/*-shared.js` and the catalogs.
- **Measure, change, measure.** Most costs in the findings are estimates from call counts at about 10 us a native
  call. A workstream's PR body gives the before and after from the profiler (`suite.mjs --perf`, a scenario pair
  through `validate.yml`, or the new phases from W0). A change that measures no gain is not shipped; say so in the
  finding's place in this file and move on. Known no-gain attempts: the npc label loop with a per-dimension observer
  list and cached names; wander reusing players' places for half a second.
- **Perf runs use 10 and 40 players only**, 120 s windows during development (owner, October 20). New measurements
  go inside existing runs as phases, not as new player counts.
- **A fix needs a scenario that fails or measures worse before it** (C28). The findings name an existing scenario or
  describe the new one.
- **Saved data is production data.** A workstream that changes a saved format reads the old format forever (or
  migrates it once, on load, without losing anything on a crash halfway) and says so in PACKS.md "Saved data".
- **On this PC:** it hosts the live sites. Never scan above the worktree, keep to about 4 agents at once, one heavy
  command at a time, and let CI run the soaks.
- **Behavior players would notice** (a sparser outline, a radar that fills more slowly, a different stack moving) is
  called out in each workstream. Keep the default behavior unless the workstream says otherwise; where a real
  trade-off needs the owner, it is listed in section 6 and the workstream ships its other parts without waiting.

## 3. Targets

Set from the findings; each is checked on the validation report after its workstream ships. Compare same-runner
pairs, and read differences against the A/A spread once W0 publishes it.

| Measure (Realm Bundle unless said) | Today | Target | Workstream |
|---|---:|---:|---|
| Validation wall time after a merge | 100 min | about 31 min | W0 |
| A/A spread of the bundle figure | +5% to +9% seen, unknown in general | published with every report | W0 |
| Callbacks per tick at 40 | 109 | 45 or less | W1 |
| Slowest tick caused by one `/realm:help` or `/realm:prefs` | not measured (about 4,500 callbacks) | under 5 ms | W1, W2 |
| p95 / p99 / max per tick at 40, steady window | 9 / 14 / 32 ms | 5 / 8 / 20 or less | W3, W1 |
| Average at 10 players | 1.06 ms | 0.8 or less | W5, W8, W1 |
| Slowest tick of a join, a respawn, a leave | not measured | measured in W0, then halved | W13 |
| Minimap with the radar on, one flier | 4 to 5 ms/tick (estimate) | 2 or less, measured | W5 |
| Side-box title, compass only | 5,425 bytes | 1,609 bytes | W6 |
| Longest tick during a 50,000-block build, copy or cut | seconds (estimate) | under 50 ms | W7 |
| One miner with a nearly full Quick Stack page | 2.1 ms/tick (October) | 0.3 or less | W9 |
| Callbacks for one mob death / one broken block | 33 / 22 | 15 / 10 or less | W12 |
| Realm Resources download | 10.15 MB | budgeted; smaller after the owner's choice | W18 |

## 4. Workstreams

Order: W0 first (everything after it is judged with its data). Then W1 to W4, which change shared modules and so
touch every pack: one at a time, each fully released before the next starts. W5 to W17 are per pack and can run in
parallel where their pack lists do not overlap (the "Packs" line of each). W18 to W20 last.

Size is the amount of work: S (one sitting), M (a day of agent work with tests), L (several PRs: split as noted).

### W0 Make the measurement trustworthy and fast (harness and CI only; no pack changes)

Two PRs, in this order. None changes a pack, so none needs a pack release; each still merges through the normal
flow and is proven by one `validate.yml` dispatch. The validation report already keeps the full profiles, the tick
histograms by `tick % 20` to `% 200`, the 10 worst ticks of the steady window and each phase, watchdog counts, flaky
scenarios and the bundle's per-pack table by `scripts/<pack>/` path; a merge is validated in about 31 minutes against
the last master commit with a finished validation, and the memory soak runs nightly.

**W0c Phases and a pinned world** (M). Findings: PIPE-04, UTL-01, PIPE-10, UTL-07 (confirm), and the measurement
halves of XC-02, XC-06, XC-07, HUD-01, BSE-27, PRG-16.
- `perf-soak.js` sets the time and weather itself and reports them, so day and night are measured on purpose. Run
  the bundle soak and the A/B soak over the same span of the day (PIPE-04 dusk mismatch, UTL-01).
- Phases, using the profiler's existing phase support (`night-soak.js` shows how): `empty` (20 s before the first
  player), `one` (30 s with one player), the steady window as today, then `churn`: a leave and a join every 5 s,
  two deaths and respawns, two dimension changes, block break and place loops on 4 players, 20 summoned mobs killed
  each second for 20 s, `/realm:help`, `/realm:prefs` and `/realm:config` once each. Each phase reports its own
  average, percentiles and worst ticks; acceptance still judges the steady window only.
- A `night` phase with a thunderstorm at the end of the 40-player bundle soak, replacing luck (UTL-01).
- Keep the numbers of the ten per-pack perf workloads that already run under the profiler on every merge and are
  discarded today (PIPE-10): a table per scenario in the report.
- New A/B scenarios for what phases cannot hold (run by hand through `validate.yml` `scenarios`, and by the
  workstream that needs them): `map-radar-perf` (radar on: standing, walking, flying), `stash-miner-perf` (a nearly
  full page and a stream of pickups), `build-big-perf` (place, copy and cut a 40x40x30 box; preview held), `saga-quest-perf`
  exists as `saga-perf-quests` (check it has a quest active for every player), `fishing-perf` (10 bobbers out).
  Write each with the workstream that uses it if that is simpler; list them in WORKING.md.
- Confirm or reject UTL-07 (admin_bp's steady cost being the soak emptying the slot its item sits in) with
  `refill=0`.
- Proof: the report shows every phase; rerun twice to see the phase figures are stable enough to compare.

**W0d Trust the comparison, and see the engine** (M). Findings: PIPE-07, PIPE-03, PIPE-08.
- Bundle pair as base, head, head, base; compare means as well as lows (PIPE-07 (1)). A weekly A/A dispatch (base
  equals head) whose spread is printed next to every later comparison (2). A drift table against a pinned baseline
  (3). The per-pack bar scaled to the clock noise instead of a flat 0.1 ms (4). The PR perf check measures the
  bundle, with the per-pack table by path that the validation report has (5).
- An always-on meter (`--meter`): tick interval percentiles and bedrock_server CPU ms/tick without the profiler, so
  profiled and unprofiled runs of one workload can be compared (PIPE-03 (1)).
- The differential listener scenario: an idle bundle for 60 s twice in one job, once sending 5 no-op `realm:` events
  a tick; the CPU difference divided by 5 x 67 is the real cost of one listener wake-up, engine side included
  (PIPE-03 (2)). Record the number in `cross-cutting.md` XC-01: it sizes W1 and W12.
- Try the native tools on the harness's BDS version: `script profiler start` / `stop` and `script watchdog
  exportstats`. If they exist, add `--native-profile` as a separate short pass and report script memory, which
  nothing reports today (PIPE-03 (3)). If they do not, write that in the harness README and stop.
- Remove the stack capture the profiler does on every `system.run` and `runTimeout` (PIPE-08).
- Proof: the first A/A dispatch; the wake-up cost number; `perf-compare` tests.

### W1 One script event listener per context (M)

Findings: XC-01, XC-02, UTL-11, UTL-10, HUD-32, HUD-40, UTL-34, PRG-33, PRG-36. Packs: all 67 (the synced
`script-events.js`), plus `help_bp`, `atlas_bp`, `map_bp`, `saga_bp`, `calendar_bp`, `stats_bp`, `party_bp`,
`zones_bp` and the zone consumers for the census parts.

1. `tools/events-shared.js`: a hub on `globalThis.__realmEvents` that owns the single native subscription and an
   index from id to the pack dispatchers that have a handler for it. Each pack's copy keeps its own handler table
   (order, "*" handlers, error handling as today) and registers its dispatcher with the hub. Pack order is hub
   registration order, which is today's subscription order. A pack installed alone is a hub with one member.
2. `tools/diag-shared.js`: expose `wrapCallback(fn, label)` on `globalThis.__realmDiag`; the hub wraps each pack's
   dispatcher with it while that pack's modules are evaluated, so `/realm:diag` still times script events per pack
   and the `realm:diag_ping` carrier still rides the one native listener. The test profiler (`lib/profile.js`)
   wraps the same way: check `handledPerTick` still attributes per pack.
3. `tools/sync-events.mjs --check` and `check-events`: "one native listener per context".
4. Census protocols: `/realm:help` reads the context's pack list when the hub is present and uses the event census
   only for packs outside it (XC-02 (b)); the packs that each run their own installed-packs census share one cached
   answer and stop repeating it (UTL-11, HUD-32; saga and calendar re-run theirs on timers that coincide every 10
   minutes, about 9,200 callbacks in one tick, PRG-33); an unchanged HUD line is not re-sent as an event every 2 s
   per player (PRG-36); pings meant for one pack carry `pack` and the others stay silent
   (XC-02 (a), used by W2); the zones protocol sends a change, not every zone, and splits without quadratic work
   (UTL-10); the join pings of the Minimap and Atlas are answered from caches (HUD-40).
5. Docs: "How the packs work together" in PACKS.md and the quirk in WORKING.md ("In a bundle every native script
   event listener wakes on every event") change with it.
- Proof: unit tests for the hub (order across packs, "*", a throwing handler, register and unregister during
  delivery, the last handler dropping the native listener); `bundle-smoke.js`; the whole suite (every protocol goes
  through this); the bundle soaks: callbacks per tick 109 to 45 or less at 40, the `/realm:help` worst tick from
  W0c, tick interval p95 and p99; the wake-up cost from W0d before and after.
- Risk: ordering between packs on the same event, and standalone packs talking to the bundle. Run the two-pack mini
  bundle scenarios (`storm-rod-claims.js`, `diag-bundle`) and one scenario with a pack installed beside the bundle.
- Release: every behavior pack's copy changes, so every pack is bumped: one release, one line of notes each
  ("Internal: cheaper script events"). Space it from other releases.

### W2 The shared settings helper (S to M)

Findings: XC-04, XC-05, PRG-16, HUD-11, HUD-39, BSE-35, BSE-04, UTL-05. Packs: all 66 with `settings-core.js`.

1. `tools/settings-shared.js`: index options once; precompute each option's config.js default; cache the parsed
   player preferences per player id, updated in `setFor` and dropped on `playerLeave`; validate when a value is saved
   or first read, not on every read (XC-04). Before caching options that use their own `prop`, grep every `prop:`
   name for writes outside `setFor` and route those through it.
2. `answer()`: stringify each option once and add lengths to find where a part ends (XC-05); answer only when the
   ping names this pack or names none (W1's `pack` field), and have `settings_bp` and `admin_bp` ask one pack at a
   time when a page is opened.
3. Call sites the readers found paying for the old behavior: Coordinates HUD's per-player read (HUD-11), the
   Minimap's 7 uncached reads on a first pass (HUD-39), Quick Stack's handlers reading settings before their cheap
   tests (BSE-35), Easy Building's 7 to 8 reads a tick per drawing player (BSE-04), elytra's preference read 10
   times a second while gliding (UTL-05), saga's read every second per player with a quest (PRG-16). With the cache
   most need no change: recheck each under the profiler and fix only what still shows.
- Proof: `tools/settings-*.test.mjs` extended (cache invalidated on set, reset, leave; golden test that every pack's
  schema parts are byte-identical to today's); the settings and prefs scenarios; the `/realm:prefs` worst tick from
  W0c; the A/B soak at 40.
- Release: all packs bumped again; combine with nothing else.

### W3 Spread the timers (S)

Findings: XC-03, BSE-31, UTL-19, HUD-35, HUD-18. Packs: decided by the histogram.

1. Read the validation report's `tick % 200` histogram and worst-tick lists from two validation runs. If the worst ticks are not on
   multiples of 20, stop: record what they are in `cross-cutting.md` XC-03 and reorder this plan by what they show.
2. If they are: a small shared `every(ticks, fn, { phase })` (`tools/phase-shared.js`, synced like `spread.js`, in
   the bundle's shared list) that starts an interval after a stable per-pack offset. Convert intervals of 20 ticks
   or more, the heaviest contributors in the histogram first. Intervals in one pack that depend on each other keep
   one phase. No central patch of `runInterval`.
3. Timers that should not run at all when idle: Easy Building's 15 permanent intervals, 9 of them every tick, start
   when a player takes a tool and stop when nobody holds one (BSE-31: the pack's whole idle floor); the two per-tick
   callbacks that do nothing most of the time (UTL-19); each of the 7 `side.js` copies waking every 4 ticks to copy
   key lists (HUD-35); the Minimap's two persistence intervals that can never act (HUD-18).
- Proof: bundle soaks at 10 and 40: p95, p99 and max per tick, the histogram flat, the average not worse; the whole
  suite for timing-sensitive scenarios.
- Risk: a hidden dependence between two packs' timers on the same tick. The suite is the check.

### W4 Bundle payload and startup (M, low priority)

Findings: XC-08, XC-09, PIPE-17, PIPE-22, HUD-41, XC-10, XC-11.
- Measure first with W0d's meter: world start to first tick and script memory, with the bundle and without.
- After W1, `script-events.js` can join the bundle's shared list; give `zones.js` and `side.js` the same factory
  shape so they can too (67, 15 and 7 copies today).
- Comment stripping at bundle time with every line number kept, only if the measurement shows startup or memory
  worth having (PIPE-17's assessment: likely small). No minification.
- Dormant Minimap modules that are shipped and evaluated but never used (HUD-41): delete or stop importing.
- `deflateRawSync` level 9; sort `walk()` so zip order is stable across machines (PIPE-22).
- Diagnostics: do not keep an entry per world property key when its prefix has one owner (XC-10).
- Proof: bundle size, startup time and memory before and after; `bundle-smoke.js`; `check-pipeline`.

### W5 Minimap (L: three PRs)

Findings: HUD-01, HUD-29, HUD-07, HUD-30, HUD-06, HUD-02, HUD-03, HUD-08, HUD-14, HUD-31, HUD-36, HUD-37, HUD-38,
HUD-16, HUD-17, HUD-20, HUD-21. Packs: `map_bp` (and `hud_rp` only through W6).

**W5a Measure the radar and fix the cap** (M). Write `map-radar-perf` (W0c) first: standing, walking, flying, with
the store empty and at its cap. Then: the store-wide eviction counter that switches off the incremental planner once
a store holds 6,000 columns, so the full 2,166-candidate plan runs on every check (HUD-29); a store over its cap
refusing new columns and draining one a tick, which any player can cause with `/realm:minimap scan` (HUD-07: evict
in batches, cap the radius for non-operators, free stores nobody views); the 2-minute full re-read of a standing
radar in one 25-tick burst (HUD-30: spread it or re-read only columns a block event marked).
**W5b Budgets** (M). With W5a's numbers, set the scan, rebuild and draw ceilings (6 + 2 + 1 ms today) so one flier
costs 2 ms or less and several share a per-tick envelope that carries overruns into the next tick (HUD-01). Make
`config.js`, PACKS.md and CLAUDE.md's "about 1 ms" say what is true. Finish or delete the planner's idle skip and
its dead limits (HUD-08). The radar fills more slowly at the same budget: a NEWS line.
**W5c Idle floor and resends** (S to M). One read of each player value per pass instead of 20 + n (HUD-02); a longer
pass interval for players who have not moved, with the mob search skipped when nothing nearby changed (HUD-03,
HUD-19); no
title when the text is identical after a move (HUD-06); the 4-second identical keep-alive only where a client needs
it (HUD-14: check on a device before removing); the block-change handler's reads (HUD-36); the draw building its
signature twice (HUD-37); `intervalTicks` being read from config instead of the setting (HUD-38, a bug); the small
leaks (HUD-16, HUD-17, HUD-20, HUD-21).
- Proof: `map-radar-perf` pairs; the soak's Minimap line at 10 (0.55 to 0.35 or less) and 40; `map-*` scenarios and
  `tools/map-*` fixtures; the real-client checklist item for `budgetLevel` (O15) stays open for the owner.

### W6 Side-box title size (S, needs one device check)

Findings: HUD-04, HUD-05, HUD-27. Packs: the 7 with `side.js`, `hud_rp`.
- Leave off the trailing empty radar and quest segments, never cutting before byte 1,609: a compass-only title goes
  from 5,425 to 1,609 bytes and older cached resource packs still draw it correctly (the HUD reader's answer 4 has
  the exact rule; do not use "cut after the last non-empty slot", which draws empty boxes).
- `playerById` as a map instead of a search over all players on every draw (HUD-27).
- HUD-05 (45 JSON UI string expressions cutting up the whole subtitle with no binding condition) needs frame-time
  numbers from a phone before and after: do the protocol change above first, then try binding conditions in a
  second PR only if the owner's device check shows the HUD costing frames.
- Proof: `tools/hud-layout.test.mjs`, `side-*` tests, the HUD scenarios; `setTitle` bytes per tick in the profile;
  one check on the Fold with the old and the new Realm Resources (section 6).

### W7 Easy Building: no long ticks (M to L: two PRs)

Findings: BSE-01, BSE-02, BSE-28, BSE-34, BSE-19, BSE-12, BSE-32, BSE-36. Packs: `build_bp`.
- **W7a** Place, destroy, copy, cut and paste read every cell in one tick before the sliced writes start, and cut
  sets every block to air unsliced (BSE-01): move the reading into `system.runJob` generators with a time budget per
  tick, read each cell once for both the filter and the undo snapshot, and send cut's writes through the sliced path.
  The destroy loop's ten `typeId` reads per block and the 500 drops pulled every tick (BSE-34). A time budget for
  "Instant" placing (BSE-19).
- **W7b** The preview: its cache key contains the draw cadence the solve itself changes, so many previews re-solve
  every 15 ticks forever (BSE-28: a bug, fix first and alone); a solve reads every cell, up to 8,000 with defer on
  (BSE-02: slice it, or solve the shell only). The placement queue rescanning itself every second and dropping blocks
  the player was charged for (BSE-12, a bug with a behavior change in the player's favor). A ticking area added and
  removed on every paste even in loaded chunks (BSE-32).
- Proof: `build-big-perf` (longest tick under 50 ms for 50,000 blocks); `build*.js` scenarios; undo and redo of a
  sliced job interrupted by leave, death and a dimension change (C17).
- Risk: a job that now spans ticks can be interleaved with another player's edit or the owner leaving: keep the
  existing lifecycle generation checks around every yield.

### W8 Easy Building: previews, particles and the idle floor (M)

Findings: BSE-03, BSE-29, BSE-30, BSE-05, BSE-06, BSE-37, BSE-20, BSE-21, BSE-22, BSE-23, BSE-25 (BSE-31 is in W3,
BSE-04 in W2). Packs: `build_bp`, `build_rp`.
- The destroy preview's 36-slot inventory scan moves behind its cache check and runs on inventory change (BSE-03).
- Particle counts: a destroy outline with no cap redrawn every tick, 240 to about 2,000 broadcast spawns each
  starting seven emitters (BSE-29); a mirror drawing up to 780 particles in one tick every second (BSE-30); one
  broadcast particle per outlined block (BSE-05). Draw edges as segment particles, cap per tick, and decide per
  effect whether other players need to see it (`player.spawnParticle`). The looks change: before and after pictures
  in PACKS.md "See and hear it", a NEWS line.
- The steady action bar line re-sent every tick (BSE-06); an open panel computing its aim point three times a tick
  (BSE-37); the small sweeps, leaks and dead state (BSE-20 to BSE-23, BSE-25).
- Proof: `build-holders-perf` and a preview-held phase in `build-big-perf`; particles per tick counted by the
  harness shim if it can (else count `spawnParticle` calls in the profile); the preview floor of about 0.38 ms
  (OPEN.md O10) measured again.

### W9 Quick Stack (M)

Findings: BSE-27, BSE-10, BSE-11, BSE-35, BSE-17, BSE-26. Packs: `stash_bp`.
- On a nearly full page every pickup is a three-snapshot commit: 2.1 ms a tick for one miner in October, and only
  the trigger was narrowed since (BSE-27). Batch pickups into one commit per second per player without weakening the
  item-safety rule (C3: snapshots verified before live slots change).
- Drive auto-store from `playerInventoryItemChange` with its slot filter instead of looking at an active player every
  2 ticks (BSE-10); lengthen or drop the 5-second quiet look, which is the pack's whole soak figure (BSE-11); cache
  the parsed page index; the retired-snapshot queue (BSE-17); `keyOf` twice per stack (BSE-26).
- Proof: `stash-miner-perf` (W0c), `stash-autostore-perf`, every `stash-*` scenario including the item-loss ones;
  write the still-open `stash-fill-locked.js` (OPEN.md F1) here since the same code is being changed.
- Risk: item loss is the worst bug this repo has had. Review this PR against C3, C5 and C19 before it merges.

### W10 Townsfolk, labels and towns (M to L: two PRs)

Findings: ENT-01, ENT-02, ENT-03, ENT-04, ENT-16, ENT-25, ENT-27, ENT-32, ENT-40, ENT-29, ENT-38 (W10a); ENT-05,
ENT-06, ENT-28, ENT-11, ENT-26, ENT-14, ENT-15, ENT-34, ENT-39, ENT-37 (W10b). Packs: `npc_bp`, `town_bp`,
`wander_bp`, `caravan_bp` (the four with `name-labels.js`), `tools/name-labels-shared.js`, `tools/owed-shared.js`,
`tools/tether-shared.js`.
- **W10a Labels and the townsfolk loop.** The "is anyone near" test reads every player's dimension and place once
  per townsfolk every half second (ENT-01: 3 x players x townsfolk calls, 14 ms bursts at 40 players with nobody
  near a town): read the players once per run. The label sync's 2 ms is 229 native calls, 3 per observer and 9 per
  townsfolk whether near or far (ENT-02); the two earlier attempts removed none of them. Learn validity from events
  instead of asking, and keep fixed anchors for townsfolk that do not move, which takes a standing NPC to about one
  call. This is OPEN.md O3. For wanderers, split "follow the mob" from "who sees the label" so the 2-tick sync stops
  repeating every read to move one label (ENT-03); separate create and remove distances at the label range edge
  (ENT-04); read a caption back only on the sweep (ENT-16). A bug to fix on the way: a townsfolk with no saved skin
  and any entity within 2 blocks loses and regains its label every 10 s (ENT-25). The 10-second audit of every
  loaded townsfolk (ENT-40), turning to a player being a teleport (ENT-27), and wander's 405 block reads around
  each exploring player every minute at night before a 7% roll (ENT-29: roll first).
- **W10b The town scan and saved indexes.** A project with no valid spot in the loaded ground is scanned from
  scratch every 5 s while a player is in the town: the column cache dies with each scan, columns past tick distance 4
  are always "unknown", and "unknown" never ends as "no good spot" (ENT-05); walks over cached columns are also
  capped at 100 lookups a tick. Keep the cache across scans, give an unknown result a back-off and an end, and give
  cached lookups their own budget. The scan is dropped when the town is empty, and that test runs every tick
  (ENT-06). The 5-second check reads every player about 16 times per town (ENT-28: 32 ms in one tick at 40 players
  and 5 towns). A finished project parses and rewrites the owed index once per offline contributor (ENT-11,
  ENT-26). A build at an operator-set spot saves its snapshot and places the whole design in one tick (ENT-39); a
  build in progress decodes its plan every tick (ENT-14); an outline is about 250 particle calls per player per draw
  (ENT-34).
- Proof: `npc-labels-perf` with players away from town and near it, `town-capital-perf`, `town-hillside` (962 s
  today: also the suite's slowest scenario, so this shortens every full run), `wander-*`; the label timing check on
  a real client stays with the owner (O11).

### W11 Champions, bounties, dolphins and other mobs (S to M)

Findings: ENT-07, ENT-08, ENT-09, ENT-31, ENT-20, ENT-10, ENT-33, ENT-19, ENT-12, ENT-24. Packs: `elite_bp`,
`bounty_bp`, `dolphin_bp`.
- Champions: every `entityHurt` in the world costs 3 to 5 native calls before the known-champion test (ENT-07);
  every spawned mob 3 to 5 and every item entity 5 (ENT-08: test the type first; do not gate on a death window, the
  item's spawn event can arrive before the death event). The pack's 0.04 to 0.09 ms spread between runs is the
  workload, not the code: its cost follows mob spawns, burns and deaths and whether a champion rolled, and the soak
  pins neither time nor spawning (ENT-09: W0c fixes the measurement; the 5-second upkeep is a spike only at the
  32-champion cap, slice it). An approach step is about 50 native calls, 18 of them `dim.id` for cache keys
  (ENT-31). `convert` reads 150 block calls before a spacing test that needs none (ENT-20).
- Bounties: a clean spot reads 81 columns in one tick (ENT-10, shared with elite: slice and back off); the 2-second
  target check reads each player's place twice (ENT-33).
- Dolphins: the whole index copied and every loaded dolphin queried each second (ENT-12); a ridden dolphin costs
  about 16 native calls per rider per tick (ENT-24).
- Proof: `night-soak` for champions (its numbers are kept after W0c), the churn phase's kill loop, `bounty-*`,
  `dolphin-*`.

### W12 Game event filters and cheap first lines (M: one PR per group of packs)

Findings: XC-06, PRG-02, PRG-32, PRG-07, PRG-08, PRG-18, PRG-19, PRG-20, PRG-23, PRG-28, ENT-30, ENT-13, ENT-21,
ENT-22, ENT-36, UTL-09, UTL-12, UTL-17, UTL-25, UTL-26, UTL-27, HUD-13, BSE-16, BSE-23, BSE-38, BSE-40, BSE-24.
Packs: about 30; group the PRs by the reader tracks so pack ownership does not overlap with W5 to W11 work in
flight.
- Give every `entityDie`, `entityHurt`, `entityHitEntity`, `entityHitBlock`, `entityRemove` and `effectAdd`
  subscription that only cares about some entity types an `entityTypes` filter, and every `playerBreakBlock` and
  `playerPlaceBlock` subscription that only cares about some blocks a `blockTypes` filter, so the engine never wakes
  the pack. `entityTypes` filters on the entity the event is about (the dead or hurt one): handlers that count kills
  by a player cannot use it and instead return on a cheap test first.
- For events with no filter (`entitySpawn`, `entityLoad`, `itemUse`, interact events): the first statement is a
  test that needs no native call beyond the one field, before any tag, component or property read. The readers list
  each handler that reads first: one broken block is 49 native calls in 8 handlers of the progress packs alone, 9 of
  them useful (PRG-02; saga 16, quests 14); one mob killed by a player is 61 calls in 10 handlers, and a death no
  player caused still 14 (PRG-32; skills 19, saga 12); a loaded entity costs about 11 calls in four progress
  handlers (PRG-07) and about 14 more in caravan, wander, npc and elite, with caravan auditing every entity with no
  type test (ENT-30); claims reading event data while disabled (UTL-09); a tag read on every loaded entity and every
  death all year for moon events (UTL-12); an entity query for every broken block for chairs (UTL-17); and the rows
  in each low-impact table.
- Proof: the churn phase's kill and block loops before and after (callbacks and ms for one death and one block);
  each pack's own scenarios. Add a check to `npm run check` if a pattern proves checkable (for example a
  `playerBreakBlock` subscription with no options and no comment saying why).

### W13 Joins, respawns and world load (M)

Findings: XC-07, PRG-38, PRG-15, PRG-17, PRG-11 (the join half), PRG-21, PRG-13, BSE-09, HUD-39. Packs: decided by
the churn phase's worst-tick lists.
- From W0c's `churn` phase: the callbacks in the join tick, the respawn tick and the leave tick, largest first.
  PRG-38 is the map of what the 18 progress packs do at join and when.
- Every `playerSpawn` handler tests `initialSpawn` first. Work not needed in the first second moves out of the join
  tick with a per-pack offset. Known offenders: stats running its old score migration on every join (PRG-15), mail
  rewriting its roster on every join (PRG-17), Easy Building parsing the saved clipboard in the spawn tick (BSE-09:
  load it on first use), Milestones loading every record ever saved in the first join's tick (PRG-11; Mail, Goals
  and Parties were checked and do not share this), guilds sending a title event per rank 220 ticks after every join
  (PRG-21).
- World load: saga walking the whole story graph for distance tokens (PRG-13: generate the list at build time).
- Proof: the churn phase's worst ticks before and after; `moon-join`, `milestones-rejoin`, `maps-leave`, `welcome`
  and `news` scenarios.

### W14 Progress packs: saved data that grows or is rewritten (M to L: two PRs)

Findings: PRG-37 (the map of what each pack saves, how big and how often), PRG-03, PRG-09, PRG-10, PRG-11, PRG-04,
PRG-27, PRG-31, PRG-44, PRG-24, PRG-42, HUD-10, HUD-24, BSE-07, BSE-08, BSE-14, UTL-31, UTL-32. Packs: `quests_bp`,
`stats_bp`, `skills_bp`, `guilds_bp`, `milestones_bp`, `titles_bp`, `journal_bp`, `saga_bp` (save path only),
`maps_bp`, `atlas_bp`, `build_bp`, `news_bp`, `nick_bp`.
- **W14a Write less.** Quests writing the player's property, with a stringify and a preference parse, on every
  counted block, kill or catch (PRG-03: dirty flag, flush once a second and on leave). Skills remembering every
  placed block, not only XP blocks, and rewriting the whole 10,000-key set (150 KB in 9 world properties) every 30 s
  while anyone builds (PRG-09: remember only blocks that give XP first, then hashed buckets with a dirty flag each,
  old format read forever; also a bug: no save on leave, so logs placed in the last 30 s give XP again after a
  restart). Skills rewriting all of a player's explored chunks for one new chunk (PRG-10). Milestones writing a world
  record per moving player every 10 s (PRG-11). Titles marking every online player dirty every second (PRG-44).
  Story progress stringified and walked twice per flush, all dirty players in one tick (PRG-31). Atlas rewriting
  every 24,000-character part when one record changes (HUD-24). Easy Building rewriting all 10 undo entries per
  build (BSE-07: a ring index) and stringifying the whole clipboard on every copy (BSE-08). News writing a property
  for every online player every minute (UTL-31).
- **W14b Bound what grows.** Stats boards never lose a name and the ticker reads a whole board every 5 s per shown
  stat (PRG-04: prune by last seen, cap the ticker; first verify PRG-48, whether the sidebar sends a board of every
  name ever seen to every client). 20 scoreboard objectives and the Milestones records grow with
  players ever seen (PRG-27, PRG-37, PRG-11: one shared pruning rule, "not seen for N days", using
  `tools/prune-shared.js`). `maps:undo` records re-read every 5 s (HUD-10). Nickname validation walking every key of
  every pack (UTL-32). The in-memory undo and clipboard of a heavy builder (BSE-14).
- Proof: `dynWritesPerTick` and `dynCharsPerTick` in the profile under the churn phase; `/realm:diag` bytes per pack
  before and after on a world seeded with 1,000 past players (a harness fixture: write it once, reuse it); each
  pack's persistence scenarios, including a restart in the middle.
- Risk: saved formats. One pack per commit, old format read forever, a scenario that loads data written by the
  previous version.

### W15 Fishing and the shared catch (S)

Findings: PRG-01, PRG-06, PRG-39. Packs: `fishing_bp`, `saga_bp`, `skills_bp`, `journal_bp`, `quests_bp`.
- Every live bobber gets a 27-block scan every tick for a third-party add-on's light blocks: 58 native calls per
  tick per fishing player, about 20,000 per catch (PRG-01). Skip it when that block type is not registered, and
  otherwise scan only while the hook is new. This is the cheapest high-impact fix in the audit: do it first.
- Five packs each follow every fishing hook and inspect item spawns for the same catch, 13 calls per entity spawn
  (PRG-06): `fishing_bp` sends one `realm:fish_caught` and the others listen; each keeps its own tracking only when
  Fishing Rewards is absent (packs stay independent).
- About 190 native calls in the tick of each catch to work out where it happened (PRG-39).
- Proof: `fishing-perf` (10 bobbers out), the fishing scenarios of all five packs with and without `fishing_bp`.

### W16 Saga with a quest active (M)

Findings: PRG-30, PRG-05, PRG-40, PRG-47, PRG-16 (after W2). Packs: `saga_bp`.
- The soak measures saga with no quests. From the code, a questing player costs about ten times an idle one, about
  0.1 ms/tick near a zone spot and 0.16 to 0.64 ms/tick in a stealth scene (PRG-30, not measured). Measure with
  `saga-perf-quests` (every player on a quest, one near a zone spot, one in a stealth scene), then fix what shows:
  tag queries over a whole dimension with no location (PRG-40), `places.js` asking for every player's place once per
  pending place every 2 s (PRG-05), a `getTags()` per player per second for the party story (PRG-47).
- Proof: `saga-perf-quests` pairs; `check-stories`; the saga scenarios.

### W17 Weather and sky effects (M: two PRs)

Findings: UTL-02, UTL-03, UTL-06, UTL-15, UTL-35, UTL-36, UTL-16, UTL-37, UTL-18. Packs: `rainbow_bp`, `tornado_bp`,
`elytra_bp`, `claims_bp`, `zones_bp`, `climate_bp`, `leaves_bp`, `rain_bp`, and `sky_rp`, `rain_rp`, `silly_rp`.
- **W17a Fewer packets.** The rainbow as 7 client emitters instead of 259 server particles twice a second (UTL-02);
  the tornado's 67 packets a second and about 2,500 live particles per viewer (UTL-03: fewer, larger particles and a
  per-player density preference); a NOS boost's 41 spawns a tick (UTL-06); claim borders and zone outlines (UTL-15);
  a new `MolangVariableMap` per player per second (UTL-35); leaf decay's 6 destroy commands a tick (UTL-36).
- **W17b What devices load.** `rain_rp`'s ten 20-second clips loaded as samples and all marked for low-memory
  devices (UTL-16: needs a memory reading on the phone before and after); the vanilla rain splash redefined with 300
  particles and per-frame work (UTL-37).
- Proof: `weather-crowd`, `tornado-sound-perf` (numbers kept after W0c), the night-and-thunder phase; before and
  after pictures and clips regenerated (`gen:rain`, `gen:sky`); the looks change, so a NEWS line and the owner's
  device check (section 6).

### W18 Small polls that can be events or caches (S each: batch by pack owner)

Findings: UTL-04, UTL-05, UTL-07, UTL-08, UTL-13, UTL-14, UTL-20, UTL-21, UTL-22, UTL-23, UTL-24, UTL-28, UTL-29,
UTL-30, UTL-33, UTL-38, HUD-09, HUD-12, HUD-15, HUD-22, HUD-23, HUD-25, HUD-26, HUD-33, HUD-34, BSE-39, BSE-41,
BSE-42, BSE-43, PRG-34, PRG-35, PRG-12, PRG-14, PRG-25, PRG-26, PRG-36, PRG-41, PRG-43, PRG-45, PRG-46, ENT-18,
ENT-35.
- Each is a few lines: a poll replaced by an event (elytra's `isGliding` every 5 ticks, UTL-04), a per-second probe
  that only needs to run when something is due (night stars, UTL-13), a synchronous sweep sliced (cleanup's dropped
  items once a minute, UTL-08; the treasure search's 150 block reads in one tick, HUD-09; three Deck cards reading
  1,100 to 4,000 blocks in one tick, PRG-35), a menu that recounts the inventory (the Kitchen's pot menu, 13,000 to
  18,000 native calls in one tick, PRG-34: count once), a cache for an answer that cannot change, a map pruned on
  leave.
- Do them in the PR of the workstream that already touches the pack when there is one; otherwise batch 5 to 8 packs
  per PR by reader track. Every one still gets its version bump, notes line and a before and after where it is
  measurable; the ones too small to measure are justified by the call count in the finding.

### W19 What players download (M, part needs the owner)

Findings: PIPE-15, BSE-33, BSE-15, BSE-44, XC-09. Packs: `build_rp`, `elytra_bp`'s track inside it, the Realm
Resources bundle.
- A size budget in `npm run check`: print the largest files of each built pack and fail when a resource pack grows
  more than 5% without a line in `release/notes.json` (PIPE-15 (d)). Ship this first; it needs no decision.
- A bundle-time language filter for Realm Resources (`bundle.mjs --resources --langs ...`), with Easy Building's
  language picker offering only the languages present; the standalone `build_rp` keeps all 13. Default: all 13, so
  nothing changes until the owner says which languages the Realm needs (section 6). The 12 non-English sets are
  about 3.2 MB of the 10.15 MB, and this is also the fix for BSE-15 (933 textures listed by client entities).
- Not planned: re-encoding the 2.9 MB song (audible), a third upload (two uploads is a rule).
- Proof: built size of `realm_resources.mcpack`; the language picker scenario with a filtered bundle.

### W20 Release and local checks (S)

Findings: PIPE-11, PIPE-12, PIPE-18, PIPE-21, PIPE-14.
- check-live racing the deploy, which made 2 of the last 8 releases need a manual rerun (PIPE-11); Playwright
  installed twice per release, uncached and with no time limit (PIPE-12); the bundle smoke waiting for `check`
  though it needs nothing from it (PIPE-18); the BDS cache key changing on any edit to `lib/server.mjs` (PIPE-21).
- `npm run check`: unit tests (45 s), `tsc` (12 s) and `check-stories` (11 s) are 80% of its 85 s and run one after
  another: run the three in parallel with one combined report and keep the rest of the chain as it is (PIPE-14).
- Proof: merge-to-live time over the next five releases (9 to 14 minutes today, no reruns); `npm run check` wall
  time.

## 5. Order and what can run together

1. Hosting H1 (CI minutes), then W0c and W0d here. From here every workstream has cheap, fast, trustworthy
   measurement with phases.
2. W1, then W2 (both bump every pack: never in flight together, and nothing else merges between a start and its
   release).
3. W3 as soon as two validation runs with histograms exist.
4. In parallel, at most four at a time, with no overlapping packs: W5 (map_bp), W7 then W8 (build_bp), W9
   (stash_bp), W10 (npc, town, wander, caravan), W11 (elite, bounty, dolphin), W15 (fishing and four others), W16
   (saga), W17 (weather packs).
5. W12, W13, W14, W18: each touches many packs lightly, so run them when the per-pack workstreams above are merged,
   grouped by track.
6. W6, W19, W4, W20 any time their inputs exist (W6 after the owner's device is available; W4 after W1).

Releases: each merge here opens a hosting PR and a new Realm Bundle for the owner to upload. Group the small ones
(W18) and leave at least the release run's length between merges.

## 6. Needs the owner

Add each to `nishant/skills` `MANUAL-STEPS.md` when its workstream reaches it, with the exact steps; none blocks the
rest of its workstream.

- **Device checks on the Fold** (frame rate and memory cannot be measured by the harness): the shorter side-box
  title with the old and the new Realm Resources installed (W6); whether the HUD costs frames, which decides HUD-05
  (W6); rain storm memory before and after the sound change (W17b); the tornado and rainbow looks (W17a); whether the
  game preloads every texture a client entity lists (BSE-15, decides how much W19 matters).
- **Which languages the Realm needs** in Easy Building's guides and panels (W19): each one dropped from Realm
  Resources saves about 0.27 MB of every player's download.
- **The real-client checklist** items already open in `docs/audits/2026-10-deep-audit/OPEN.md` (O11 label timing,
  O15 Minimap budget levels) are touched by W10 and W5: run them after those ship.

## 7. Not planned, and why

- A third Realm upload for stable assets: CLAUDE.md keeps it at two.
- Minifying the bundle: unreadable stacks in the server log for a gain nobody has measured.
- A central patch of `runInterval` to stagger every pack's timers: it would change timing behind the packs' backs.
- New player counts for perf runs: the owner's rule is 10 and 40.
- XC-12 (a timeout scheduled before a profiling window is not counted in it): documented behavior of
  `/realm:diag`, not worth the code. BSE-18 is a measurement note, not a change.
- Everything under "Checked and fine" and "Rejected leads" in the findings files.
