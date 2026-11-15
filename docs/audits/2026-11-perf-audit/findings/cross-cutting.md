# Cross-cutting: the bundle, shared modules and the measurement itself

Scope read: `tools/bundle.mjs`, `tools/lib/zip.mjs`, `tools/diag-shared.js`, `tools/events-shared.js`,
`tools/settings-shared.js` (all in full); the profile summaries of validation run 43107658136 (artifacts
`validate-bundle-10`, `validate-bundle-40`, `validate-soak-10`, `validate-soak-40`, `validate-memory-40-head`);
greps over `packs/` for subscriptions, intervals and script event senders; the `@minecraft/server` 2.1.0 typings for
which events accept native filters.

## Summary

The average script time is well inside its budget (Realm Bundle 1.06 ms/tick at 10 players, 2.03 at 40), so the
remaining gains are not in any one pack's steady loop. They are in how 67 packs share one script context:

- About 65% of all callbacks the bundle runs in the validation soak are script event listener wake-ups that find
  nothing to do: every `realm:` event wakes one listener per pack (XC-01), and the census protocols (help, settings,
  zones) answer with one event per pack, so one request costs packs squared (XC-02).
- Script time per tick is bursty: p50 1 ms, p95 9 ms, p99 14 ms, max 32 ms in the steady window at 40 players, and
  5% of server ticks run longer than 50 ms. About 75 intervals with periods of 20, 40, 100 and 200 ticks are all
  registered at load, so they fire on the same ticks (XC-03).
- Game events fan out the same way: one mob death calls 33 handlers in 28 packs, one broken block 22, one loaded
  entity 14. The API has native filters for most of these and almost no pack uses them (XC-06).
- The shared settings helper re-reads and re-parses a player's saved preferences on every call (XC-04), and builds
  its menu answer with quadratic stringify work in all 67 packs in one tick (XC-05).
- The profiler cannot see any of the engine-side cost of these fan-outs, nor spikes, churn or moving players. The
  first workstream has to be measurement (see `pipeline-harness.md` and the plan's W0).

## Findings

### XC-01 One script event listener per pack: every `realm:` event wakes 67 listeners  [high / confirmed / M / medium]
- Measured (2026-11-15, after the census PR #288): one native wake-up is about 1.3 us (W0d), not 10. With the help
  census gone the bundle at 40 players sends 0.26 script events a tick (0.84 before), about 17 wake-ups a tick, about
  0.02 ms a tick in all; callbacks per tick 97 to 58. The hub below is not built (PLAN.md section 7).
- Where: `tools/events-shared.js:80` (each pack's copy subscribes its own native listener); `tools/bundle.mjs:264`
  keeps `script-events.js` out of the shared list because it holds per-pack state.
- What happens and how often: in the Realm Bundle each `system.sendScriptEvent("realm:...")` is delivered to 67
  native listeners; 66 of them do one `Map` lookup and return. The profile counts these: at 40 players the bundle runs
  109 wrapped callbacks a tick, of which 65.5 are script event wake-ups (0.977 events sent a tick x 67) plus 5.7 for
  `realm:refill_need`. Only about 38 callbacks a tick are intervals, game events and timers. At 10 players it is 22 of
  57.
- Cost estimate: the JS side is small (the profile attributes about 0.12 ms/tick to it at 40). The engine side
  (building an event object and entering the script engine 67 times per event) is not measured by anything today.
  At the documented 10 us per native transition it would be about 0.7 ms/tick at 40 in the validation workload, a
  third of the bundle's whole figure, but that number is an estimate: measure it first (W0).
- Fix: one native listener per script context. Keep each pack's handler table (order, error handling and "*"
  handlers stay per pack) but register each pack's dispatcher with a hub on `globalThis.__realmEvents`: the hub owns
  the single `scriptEventReceive` subscription and an index `id -> [pack dispatchers that have a handler for it]`
  plus the packs with "*" handlers. An event then costs one native wake-up plus one call per pack that wants it.
  Keep pack order (hub registration order is today's subscription order) and error semantics (try each pack, rethrow
  the first error at the end, log the rest). Diagnostics: `diag-core.js` attributes time by wrapping each native
  subscription; give it a `wrapCallback(fn, label)` entry on `globalThis.__realmDiag` that the hub calls for each
  pack dispatcher while that pack's modules are being evaluated (`S.cur` names the pack then), so per-pack timing and
  the `realm:diag_ping` carrier keep working. A pack installed alone behaves as today (a hub with one member).
  `tools/sync-events.mjs --check` and `check-events` assert "one native listener per pack": change to "one per
  context". The harness's `handledPerTick` counter will drop from 67 per event to the real handler count; update
  what the report prints.
- Prove it with: the bundle soaks at 10 and 40 (`callsPerTick` 109 -> about 40 at 40 players; server tick interval
  p95/p99; `ticksOver50ms`), `bundle-smoke.js`, the whole suite (every protocol runs through this), and a new
  unit test for the hub (order across packs, "*" handlers, a throwing handler, register and unregister during
  delivery, the last handler dropping the native listener).

### XC-02 Census protocols cost packs squared  [high / confirmed / S after XC-01 / low]
- Where: `realm:help_ping` -> 67 x `realm:help_pong` (every pack's `main.js` responder; `help_bp` collects);
  `realm:cfg_ping` -> 67+ x `realm:cfg_schema` (`tools/settings-shared.js:356`, `:332`); `realm:zones_ping` (16
  call sites), `realm:calling_ping` (6), `realm:hud_ping`, `realm:npc_flags_ping`, `realm:diag_ping` and the other
  `_ping` ids (13 kinds in all).
- What happens and how often: one ping makes N packs each send an answer, and each answer wakes N listeners. For
  help: 1 + 67 events, 68 x 67 = 4,556 callbacks, in one or two ticks, each time a player runs `/realm:help` (the
  validation soak does it 71 times in 5 minutes: `realm:help_pong` alone is 50.6 of the 109 callbacks a tick). The
  settings menu is the same shape and adds XC-05's stringify work.
- Cost estimate: 4,556 callbacks at 5 to 10 us each is 20 to 45 ms in the tick or two after the command: a visible
  spike, not measured as such.
- Fix: XC-01 makes every census linear (68 events, about 135 callbacks). Beyond that: (a) pings that are for one
  pack carry a `pack` field and the others do not answer (`realm:cfg_ping` when the player opens one pack's page);
  (b) in a bundle the help census can read the list of packs the context already has
  (`globalThis.__realmDiag.packs` holds folder, name and version) and skip the events entirely, keeping the event
  protocol for packs installed on their own; (c) answers that only change at load (zones lists, npc places) are
  cached by the asker instead of re-pinged.
- Prove it with: a scenario that runs `/realm:help` and opens Realm Settings and Realm Configuration under the
  profiler and reports the slowest tick (needs W0's slow-tick record).

### XC-03 Periodic work is phase-aligned across packs  [high / likely, needs-measurement / M / medium]
- Where: every pack registers its intervals at module load. Counted by closing line across `packs/*_bp/scripts`: 32
  intervals every tick, 16 every 2, 27 every 20, 14 every 40, 9 every 60, 12 every 100, 21 every 200, 5 every 1200
  (plus about 30 with named periods).
- What happens and how often: `runInterval(fn, 20)` registered at tick 0 fires at ticks 20, 40, 60...; so do the
  other 26. Every 200th tick runs all of the 20s, 40s, 100s and 200s together. The profile shows the shape this
  would produce: p50 1 ms, p95 9 ms, p99 14 ms, max 32 ms a tick at 40 players (bundle), and at 10 players p95 3,
  p99 5, max 16. The 1 ms clock cannot produce a p95 of 9 ms by itself (the pipeline reader checked the profiler:
  PIPE-02), so the burstiness is real; which ticks carry it is not known until the profile is binned by tick phase,
  and the per-tick series needed for that is already collected on the host.
- Cost estimate: none on the average. The worst ticks are what a weak host or a phone-hosted world feels, and what
  the watchdog's slow-tick warning counts.
- Fix: first measure (W0: ms by `tick % 200` and the callbacks in the 10 slowest ticks). If confirmed, spread the
  phases: a small shared helper `every(ticks, fn, { phase })` (a `tools/phase-shared.js` synced like `spread.js`)
  that starts an interval after `hash(pack + name) % ticks` ticks, used for intervals of 20 ticks or more that have
  no reason to share a tick. Keep intervals within one pack that depend on each other on one phase (same `phase`
  value). A central patch of `System.prototype.runInterval` in the bundle would reach all 75 at once but changes
  timing behind the packs' backs and needs a handle map for `clearRun`: only consider it if the per-pack conversion
  proves too slow to roll out.
- Prove it with: bundle soaks at 10 and 40, comparing p95, p99, max and the phase histogram (the average must not
  move); the whole suite for timing-sensitive scenarios.

### XC-04 `settings.getFor()` reads and parses the player's saved preferences on every call  [medium / confirmed / S / low]
- Where: `tools/settings-shared.js:178` (`prefsOf`: `player.getDynamicProperty` + `JSON.parse` every call), `:193`
  (`getFor`), `:60` (`optionFor`: a linear `OPTIONS.find` on every `get` and `getFor`), `:63` (`fileDefault`:
  `key.split(".")` on every call), `:136` and `:202` (`problem()` re-validates the value on every read).
- What happens and how often: about 90 call sites in 30 packs call `getFor(player, key)`, several from per-tick or
  per-second per-player code (map_bp 10 sites, stash_bp 16, stats_bp 11, hud_bp 5, fishing_bp 8, saga_bp 9: the pack
  readers list the hot ones). Each call is one native read (about 10 us) plus a parse.
- Cost estimate: 12 to 20 us per call; a pack that asks two preferences per player per second at 40 players pays
  about 1 to 1.6 ms a second (0.05 to 0.08 ms/tick), the size of a whole typical pack. Not measured per pack.
- Fix (in the shared source, so all 66 packs get it): index options once (`Map` keyed `scope:key`); precompute each
  option's config.js default path; cache the parsed prefs per player id (the pack is the only writer of
  `<PREFIX>:pref`: update the cache in `setFor`, drop it on `playerLeave`), and cache validated values so
  `problem()` runs when a value is saved or first read, not on every read. Options with their own `prop` must be
  checked first: grep each `prop:` name for writes outside `setFor` before caching those.
- Prove it with: `tools/settings-*.test.mjs` (extend for cache invalidation on set, reset and leave), the A/B soak at
  40, and the per-player preference scenarios in `tools/test-bds/examples/`.

### XC-05 The settings menu answer is built with quadratic stringify work, in every pack, in one tick  [medium / confirmed / S / low]
- Where: `tools/settings-shared.js:320-333` (`answer`): for each option it stringifies the whole part built so far
  plus the option (`envelope([...last, o], 99, 99)`) and walks every character of it (`bytes`), then stringifies
  each part again to send it.
- What happens and how often: once per pack per `realm:cfg_ping`, so 67 times in the tick a player opens
  `/realm:prefs` or `/realm:config`. A pack with 30 options stringifies about 30 growing strings of up to 2 KB.
- Cost estimate: roughly 30 KB stringified and 30 KB of per-character work per pack, about 2 MB across the bundle
  per menu open: tens of milliseconds on QuickJS in one tick. Not measured.
- Fix: stringify each option once, keep its byte length, and add lengths (plus the envelope's fixed overhead and
  commas) to decide where a part ends; build each part's message by joining the option strings. With XC-02 (a), the
  menu asks only the pack whose page is opened.
- Prove it with: a unit test that the parts are identical to today's for every pack's OPTIONS (a golden test over
  all `settings.js` files), and the slow-tick record of a scenario that opens both menus.

### XC-06 Game events are delivered to every subscribed pack unfiltered  [medium / confirmed / M / low]
- Where: counts of native subscriptions across `packs/*_bp/scripts` (excluding the diagnostics): `entityDie` 33 in
  28 packs, `playerBreakBlock` (after) 22, `playerPlaceBlock` 18 in 17, `playerInteractWithBlock` (before) 18 in 16,
  `entitySpawn` 15 in 12, `entityLoad` 14 in 13, `entityHurt` 10, `itemUse` 9, `playerInteractWithBlock` (after) 8,
  `entityHitEntity` 7 in 5, `playerInventoryItemChange` 6, plus `playerSpawn` 52 in 38 packs, `playerLeave` 71 in
  48 and `worldLoad` 76 in 42.
- What happens and how often: every mob death anywhere calls 33 handlers; a mob farm that kills 20 mobs a second
  makes 660 calls a second before any handler's own early return. Every block a player breaks calls 22. A player
  flying into new chunks fires `entityLoad` for every entity in them, 14 handlers each. None of this happens in the
  soak (its players only take short walks: nothing dies, no block breaks, no chunk loads).
- Cost estimate: 5 to 10 us per wake-up plus what each handler reads before it returns (the pack readers list the
  handlers that read a dynamic property or component first): 3 to 7 ms a second for the mob farm above, in bursts.
- Fix: use the native filters the typed API has, so the engine never wakes the pack. `EntityEventOptions`
  (`entityTypes`, `entities`) is accepted by `entityDie`, `entityHurt`, `entityHitEntity`, `entityHitBlock`,
  `entityRemove`, `effectAdd` and `entityHealthChanged`; `BlockEventOptions` (`blockTypes`, `permutations`) by
  `playerBreakBlock` (before and after) and `playerPlaceBlock`. Today 15 entity subscriptions pass `entityTypes`
  and no block subscription passes `blockTypes`. For `entityDie`, `entityTypes` filters on the dead entity: handlers
  that only care about player deaths (party, find, relics, stash pages, atlas, admin, npc, calendar: check each)
  take `{ entityTypes: ["minecraft:player"] }`; handlers that count kills by a player cannot filter and stay.
  For block events, packs that react to a fixed set of blocks (crops, ores, logs, leaves, chests, signs) pass
  `blockTypes`. `entitySpawn` and `entityLoad` take no options: make the first statement of each handler a `typeId`
  check against a module-level `Set`, before any component or property read.
- Prove it with: a new churn scenario (W0) with a kill loop and a block break loop under the profiler; each pack's
  existing scenarios for behavior.

### XC-07 A join runs 52 handlers in 38 packs in one tick  [medium / likely / M / medium]
- Where: `world.afterEvents.playerSpawn.subscribe` in 38 packs (52 subscriptions); the pack readers list what each
  does (saved data reads, JSON parses, messages, HUD setup).
- What happens and how often: every join and every respawn. The profile's whole-run maximum, which includes the
  spawn ramp, is 71 ms in one tick for the bundle at 40 players and 404 ms with separate contexts, against 32 and 163
  in the steady window: the ramp holds the worst ticks. The soak never joins or leaves after the ramp.
- Cost estimate: not measured per join. On a Realm a join already costs the server a chunk load burst; script work
  on top lengthens the freeze every other player feels.
- Fix: measure a single join and a single respawn under the profiler (W0 churn phase). Then: every handler checks
  `initialSpawn` first (respawns should do almost nothing); work that is not needed in the first second (welcome
  text, news, mail counts, HUD setup, leaderboard refresh) is deferred with a per-pack offset over the next 20 to 60
  ticks rather than run in the join tick; packs that read the same player property several times at join read it
  once.
- Prove it with: the churn phase's slowest-tick record before and after; `welcome`, `news`, `mail` scenarios.

### XC-08 The bundle ships and evaluates about 7.8 MB of unminified script  [medium / needs-measurement / M / medium]
- Where: `tools/bundle.mjs:233-257` (files copied as they are), `:264` (10 shared modules deduplicated). All pack
  scripts are 10.66 MB; after deduplicating `diag-core.js` (67 copies, 1.84 MB) and `settings-core.js` (66 copies,
  1.06 MB) about 7.8 MB is left, including 67 copies of `script-events.js` (352 KB), 15 of `zones.js` (182 KB), 7 of
  `side.js` (261 KB), saga's `stories/` (847 KB) and help's `catalog.js` (268 KB).
- What happens and how often: once per world start and per `/reload`: the engine parses and evaluates all of it and
  keeps the compiled functions and every module-level constant in memory for the life of the world.
- Cost estimate: the bundle smoke log shows about 1.7 s of bundle startup on a CI runner (pipeline reader); script
  memory is not reported by anything. The published Realm Bundle is 2.46 MB zipped. No pack uses dynamic `import()`
  today.
- Fix, in order of safety: (1) measure world start to first tick and script memory with and without the bundle
  (W0). (2) XC-01's hub makes `script-events.js` shareable; the same factory shape makes `zones.js` and `side.js`
  shareable (state passed in, as `settings-core.js` does). (3) Strip comments and blank lines at bundle time with
  line numbers preserved (replace a comment with nothing but keep its newlines), so stack traces and the
  diagnostics' `file:line` labels do not change: JSDoc is a large share of these files. Full minification is not
  worth the unreadable server-log stacks. (4) Load cold data on first use: check on a Bedrock Dedicated Server that
  dynamic `import()` works in a behavior pack on the stable API; if it does, saga chapters and the help catalog load
  when first needed instead of at start (the story and help readers say how they are indexed).
- Prove it with: startup time and memory from W0; `bundle-smoke.js`; `check-pipeline`; a unit test that the
  comment stripper keeps every line number.

### XC-09 Deflate at the default level; no check on what goes into a pack  [low / confirmed / S / low]
- Where: `tools/lib/zip.mjs:20` (`deflateRawSync(data)` with default options).
- Fix: `{ level: 9 }` (a few percent on text, free at build time). More valuable: print the 10 largest files of each
  built pack and fail `npm run check` when a resource pack grows past a budget, since players download Realm
  Resources on join (`build_rp` is 7.4 MB and `rain_rp` 2.4 MB built: see `pipeline-harness.md` and the pack
  readers for what is in them).

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| XC-10 | `tools/diag-shared.js:335`, `:369` | `keyOwner` keeps one entry for every distinct world property key ever read or written, including misses and deleted keys: grows with players ever seen on a public server | When a key's prefix has one known owner, do not store the key (`ownerOfKey` already falls back to `prefixOwner`) |
| XC-11 | `tools/diag-shared.js:262-264` | every subscription builds a stack trace (`site()`) at load: about 600 `new Error().stack` parses at world start | fine at this size; skip `site()` when `S.cur` is set and profiling is off, and build the label lazily on the first profiled call |
| XC-12 | `tools/diag-shared.js:202-213` | a callback handed to `system.run` / `runTimeout` while profiling is off has no owner, so a later profiling window does not count long timeouts scheduled before it | accept (documented), or resolve the owner lazily on the first profiled call |

## Rejected leads

- XC-13 (the bundle's build-time version makes an unchanged tree publish a new bundle): wrong. The pipeline reader
  checked the release path: an unchanged tree publishes nothing (all rows `unchanged`, no upload). See
  `pipeline-harness.md`.

## Checked and fine

- `diag-core.js` wrappers while profiling is off: one boolean test and a plain call (`:181`); the dynamic property
  wrapper adds one `Map.has` per read (`:369`). Not worth changing.
- `events-shared.js` dispatch inside one pack: one `Map.get`, no allocation when the pack has no handler (`:42-44`).
- `settings-core.js` world options: the saved overrides are cached after the first read (`:98`).
- The bundle merges JSON lists and language files once at build time; nothing of the merge runs in game.

## Not read

- `tools/side-shared.js`, `tools/spread-shared.js` (HUD reader), `tools/zones-shared.js`, `tools/weather-plan-shared.js`
  (weather and utility reader), the name label, tether, spawn, gossip, owed and prune modules (towns reader), and
  the harness (`pipeline-harness.md`).
