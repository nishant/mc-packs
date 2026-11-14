# Building, storage and expeditions: performance findings

Second pass. It replaces the first pass that was in this file: every earlier finding was re-read against the code and
is kept (same id), corrected, or listed under "Rejected leads". New findings start at BSE-27.

Scope read:
- build_bp (about 60% of the lines that are not panel data): in full `main.js`, `core/Preview.js`,
  `PlacementQueue.js`, `ChunkLoader.js`, `UndoRedo.js`, `PlayerState.js`, `BlockPlacer.js`, `BlockDestroyer.js`,
  `Clipboard.js`, `Settings.js`, `Protection.js`, `ModifierVisualizer.js`, `ModifierPipeline.js`, `PanelLight.js`,
  `HoldWheel.js`, `EntityPanel.js`, `block-limit.js`, `settings.js`, `config.js`, `utils/Items.js`, `tool-gate.js`,
  `idle-cadence.js`, `build-tool.js`, `ActionBar.js`, `GeometryUtils.js`, `ClipboardStore.js`, `InventoryUtils.js`,
  `PlacedReport.js`, `placed-boxes.js`, `ModeOptions.js`, `Tps.js`, `ui/ClipboardUI.js`, `modes/SphereMode.js`,
  `CubeMode.js`, `ModeRegistry.js`; by range `GuideBook.js` (150-296), `LanguagePicker.js` (150-228), `Coach.js`
  (540-668), `VanillaModifierHook.js` (1-195), `Palette.js` (1-120), `beds.js` (199-230, 321-410), `zones.js` (119-121).
- stash_bp: `pages.js` 1-530, 584-690, 900-1430, 1600-1980 (about 65%); `page-store.js` 1-610 (75%); `main.js`
  395-680 and 818-877 (25%); `settings.js`, `config.js`.
- expedition_bp: `main.js` 286-405, 520-610, 836-1095, 1126-1165, 1316-1410, 1540-1740, 2085-2315, 3008-4001 (about
  40%); `gauntlet.js` 395-650, 690-800, 836-945; `queue.js` 150-205.
- build_rp: every particle JSON (lifetimes and rates tabulated by script), every client entity's texture list, the
  guide book and coach render controllers, the sound definitions, the PNG header of all 962 textures, the Ogg headers
  of both sounds, `du` of every folder.
- Earlier numbers used: `docs/audits/2026-10-deep-audit/fleet-review/FIXES.md` (F2, F3) and `review-items.md` for the
  measured cost of an auto-store commit.

Unit costs: the brief's "about 10 us per native call" fits the calls these packs make most (`getComponent`, dynamic
property reads, `getBlock`): Quick Stack's measured 0.0038 ms per player per tick is one quiet look every 100 ticks
(0.38 ms a look, about 37 such calls). Simple getters cost less (`player.id` 0.2 us, `getItem` 1.8 us), so the
estimates below are given as ranges where the mix matters. None of the estimates is a measurement unless it says so.

## Summary

- These packs are cheap while nobody uses them and expensive in bursts when somebody does. The soak sees none of the
  bursts.
- Easy Building does all of its reading in one callback before any sliced work starts: a 50,000-block place, destroy,
  copy, cut or paste is 300,000 to 800,000 native calls in one tick (seconds), and a cut also sets every block to air
  in that same callback (BSE-01).
- Quick Stack's auto-store on a nearly full page is one three-snapshot commit per pickup. The October audit measured
  that at 2.1 ms a tick for one miner; the trigger was narrowed since, the commit was not (BSE-27).
- The preview's cache key contains the draw cadence that the solve itself changes, so many previews (every destroy
  preview over about 50 edge cells) re-solve every 15 ticks forever (BSE-28). A destroy outline has no particle cap
  and is redrawn every tick (BSE-29). A mirror draws up to about 780 particles in one tick every second (BSE-30).
- build_bp's 0.09 ms idle figure barely moves with the player count (0.090 at 10, 0.112 at 40): it is ten interval
  callbacks a tick that return at once, not the hand sweep (BSE-31).
- Per drawing player: seven to eight property reads, two raycasts and one action bar packet a tick (BSE-04, BSE-06),
  and one broadcast particle with seven emitters per outlined block (BSE-05). A player who only holds the Building
  Book, or has a mode on with a block in hand, pays most of that too.
- Saved data: the undo history rewrites ten entries per build once full (BSE-07); every copy saves up to 960 KB and a
  join parses it back (BSE-08, BSE-09).
- build_rp: 933 of the 962 textures are referenced by client entities (334 MB as RGBA if a client ever held them all,
  which the pack's render controllers do not ask for: BSE-15); 2.9 MB of the 7.4 MB download is one music track that
  belongs to another pack and 4.3 MB is thirteen languages of pages and panels (BSE-33).
- Expeditions: generation, reset, restart cleanup, saved boards and the idle path are sound. Only small items.

## Findings

### BSE-01 Place, destroy, copy, cut and paste do all their reading in one tick  [high / confirmed / M / timing-sensitive, no saved-data change]
- Where: `packs/build_bp/scripts/main.js:298-328` (confirm: `getPositions`, `applyModifiers`, `filterBuildPositions`,
  then `placeBlocks` or `destroyBlocks`, all inside two callbacks split only by the claims answer);
  `core/BlockPlacer.js:52-63` (filter: `getBlock` + `typeId` per cell), `:160` -> `core/UndoRedo.js:173-190`
  (`captureSnapshot`: `getBlock`, `typeId`, `permutation`, `getAllStates` per cell; the `threshold` argument only
  switches it off at 0, so a 50,000-block build is captured whole), `BlockPlacer.js:329-346` (distance shells, shuffle
  and sort over every cell); destroy reads each cell twice before its loop: `main.js:197-213` (`readPlaced`) and
  `core/BlockDestroyer.js:361-367` (which also reads `getAllStates` for every block although only beds need it);
  `core/Clipboard.js:129-148` (copy: up to 5 calls a cell), `:188-235` (cut: `getBlock` + `getComponent` per block in
  survival, a second `getBlock` + `typeId`, a snapshot that re-reads what the clipboard already holds, then
  `getBlock` + `isAir` + `setType` per block, unsliced); `Clipboard.js:262-335` (paste: filter 2 calls, snapshot 4,
  `BlockPermutation.resolve` plus one `withState` per state, per entry); `core/Protection.js:60-79` with
  `zones.js:119-121` (`allZones()` builds a new array for every position, twice per build, for non-operators while
  `safeZonesOperatorsOnly` is on, the default); `utils/GeometryUtils.js:200-206`, `:381-406` (a hollow sphere or
  cylinder at the limit scans up to 2 million cells in script: the guard only refuses past 32 million).
- What happens and how often: once per confirm click, copy, cut or paste. Only the block writes are sliced (64 a tick
  at the default speed, 256 at "Instant", the paste queue by a 4 ms budget). The cap is 50,000 blocks by default
  (`Settings.js:104-105`), 300,000 at most.
- Cost estimate, for 50,000 cells at 10 us a call: place 6 calls a cell = 300,000 calls, about 3 s; destroy 6 a cell
  (2 + 4), about 3 s; copy up to 5, about 2.5 s; paste about 8 (2 + 4 + resolve and states), about 4 s, plus the JS
  passes; a survival cut about 16 a cell including 50,000 `setType` in one callback, 8 s or more before the engine's
  own block updates. A hollow sphere of radius 60 adds a 1.9 million cell script loop (roughly 0.5 to 1 s). A 5,000
  block wall is still 0.3 s. Not measured. The watchdog warns far below these and a hang ends the server.
- Fix: one generator per operation run with `system.runJob` (stable; Expeditions already does this in
  `expedition_bp/scripts/main.js:551`), yielding every few hundred cells or 4 ms: generate, filter and snapshot in the
  same pass with one `getBlock` per cell (keep `typeId` and, only when the cell will be written, the states), then
  start the writes. Cut: build the snapshot from the clipboard entries instead of re-reading, and set air through the
  sliced path. Destroy: read once, states only for beds (as `readPlaced` does). Safe zones: take the zones of this
  dimension once per build and test the build's bounding box first. Hollow shapes: walk the shell analytically (per
  y-slice, the two x roots) instead of scanning the bounding box. Charge the player and show "working" before the job
  starts so a second click cannot start a second job.
- Prove it with: `tools/test-bds/examples/build.js` and `build-beds*.js` for behavior; a new `build-big-perf.js` that
  places, copies, cuts and pastes a 40x40x30 box and a hollow sphere of radius 40 and records the longest tick
  (needs W0's slow-tick record), before and after.

### BSE-27 Quick Stack: on a nearly full page every pickup is a three-snapshot commit  [high / confirmed (measured in October) / M / players see different stacks move; item safety is the constraint]
- Where: `packs/stash_bp/scripts/pages.js:1280-1368` (`autoStore`: runs when the page has at most one free slot,
  `:1295`; moves only the amount that arrived, `:1322-1352`; a pickup that tops up a stack frees no slot, so the page
  stays full and the next pickup commits again); `pages.js:398-423` (`commitPages`); `page-store.js:386-423`
  (`saveSnapshot`: world counter write and readback, entity spawn, two `signature` calls per stack, `createFromWorld`,
  then a full reload to verify), `:454-507` (`commitInventory`: before and after images of the whole inventory, two
  index writes with readback, two structure deletes), `:354-366` (`retireSnapshot`: read, parse and rewrite the
  retired queue, up to 1,500 entries, for every replaced page).
- What happens and how often: every 10 ticks while a player with a full page keeps picking things up (mining, a farm):
  one page read (a structure load), three structure saves each read back, two deletes, four entity spawns, about 400
  `signature` calls (each about 14 native calls), 60 KB of index writes, the retired queue rewritten.
- Cost estimate: measured in `docs/audits/2026-10-deep-audit/fleet-review/FIXES.md` (F2, F3): one player, one pickup
  every 10 ticks: stash_bp 1.70 ms a tick with p95 14 ms and 125 ticks over 55 ms in a minute; on a full page with the
  index fix 2.13 ms a tick. That is one player using 14 times the pack budget. The October fix made it happen only
  near a full page; it did not make the commit cheaper. Three miners with full pages are over the whole bundle budget.
- Fix, in order of safety: (1) hysteresis: when the trigger fires, move whole stacks of the arriving kinds until
  LIVE_MARGIN (4) slots are free, so the next commit is many pickups away instead of one. (2) Batch: collect arrivals
  and commit at most once every 5 s per player (the page cannot overflow meanwhile: a full inventory just leaves the
  item on the ground as vanilla does, so batch only while at least one slot or stack has room, else commit at once).
  (3) Make the commit cheaper when only storage slots change: the before and after inventory images exist for
  rollback; a commit that only removes items from the live page can journal the page refs and skip the two whole
  inventory snapshots. (4) Keep the retired queue in memory and write it at most once a second (BSE-17).
- Prove it with: `tools/test-bds/examples/stash-autostore-full-page.js` and `stash-autostore-perf.js` with
  `--profile` (the October numbers are the baseline), `stash-pages.js`, `stash-page-transfer*.js`,
  `stash-recover-*.js` for safety.

### BSE-28 The preview cache key contains the draw cadence the solve changes: it re-solves forever  [high / likely (traced in code, not run) / S / none]
- Where: `packs/build_bp/scripts/core/Preview.js:418-426` (`drawQ = max(quality, previewTierQ)`), `:768` (`drawQ` is
  part of `contextKey`), `:857` (the deferred box sets `previewTierQ` from the box's particle count), `:1096` and
  `:1114` (the solve sets it from the outline's count, and to 1 for every destroy), `:794-799` (a key change restarts
  the 10-tick settle).
- What happens: aim held still. The box is drawn and sets tier B; ten ticks later the shape is solved and sets tier
  C; if C differs from B the next tick's key differs, the cached solve is not found, the box is drawn again (tier B),
  and ten ticks later the shape is solved again. It never settles. B and C differ for every destroy preview whose
  box has more than 50 edge cells (the solve forces tier 1), and for place previews whose outline count falls in
  another band than the box's (spheres, cylinders, shapes partly inside terrain).
- Cost estimate: one full solve (BSE-02: up to 8,000 cells, 3 calls each for destroy, plus the inventory scan of
  BSE-03) about every 13 to 15 ticks for as long as the player aims: a 10x10x5 dig is about 1,500 calls (5 to 15 ms)
  each time, a 20x20x20 one about 24,000 (60 to 240 ms). The player sees the outline flip between box and shape.
- Fix: take `drawQ` out of `contextKey` (the cached entry already stores its own particle id), and keep the tier in
  the cache entry instead of a per-player map that both branches overwrite.
- Prove it with: a scenario that sets a 10x10x5 destroy anchor, holds the aim for 100 ticks and counts calls to
  `getPositions` (wrap it in the test); expect 1, today about 7. `build-bar.js` for behavior.

### BSE-29 A destroy outline has no particle cap and is redrawn every tick  [high for clients, medium for the server / confirmed / S / the outline of a big dig looks sparser]
- Where: `packs/build_bp/scripts/core/Preview.js:1094-1106` (`if (isDestroy) tier = 1`, then `preview = wf` whatever
  its size), `:775` (redrawn from the cache every `drawQ` ticks, which is 1 at the default quality);
  `packs/build_rp/particles/eb_controller_destroy.json` (six child emitters per spawn, particle lifetime 0.1 s).
- What happens and how often: every tick per player with a destroy preview. The place path steps down to every 5
  ticks and to single-dot particles above 200 cells; the destroy path does neither. `wireframePositions` returns the
  12 edges for a clean box (about 240 cells for 20x20x20) but most of the surface for uneven terrain (up to about
  2,000 of a 20x20x20 region's 2,168 shell cells).
- Cost estimate: 240 to 2,000 `spawnParticle` calls a tick (2 to 20 ms a tick at 10 us), each a packet to every
  client in range and seven emitters there: 1,700 to 14,000 emitters created a tick on a phone. Not measured.
- Fix: give destroy the same tiers as place (cadence from the count, the q-variant particles already exist for
  destroy) and cap the outline at 500 cells by sampling; see BSE-05 for drawing edges instead of blocks.
- Prove it with: count `spawnParticle` calls a tick in a scenario with a 20x20x20 destroy anchor over terrain; a
  frame-rate check on the Fold 7.

### BSE-02 A preview solve reads every cell of the shape  [high / confirmed / M / none]
- Where: `packs/build_bp/scripts/core/Preview.js:952-982` (positions up to the block limit, then `getBlock` +
  `typeId` per cell), `:309-334` (destroy: `getBlock`, `isAir`, `typeId`), `:1068-1090` and `:1117-1131` (the shell
  is read a second time), `:785-802` with `SETTLE_MAX_VOLUME = 8000` (`:274`); `Settings.js:304-311` (defer on by
  default, 10 ticks).
- What happens and how often: with "defer shape" on, once each time the aim rests for 10 ticks on a shape whose
  bounding volume is at most 8,000 (larger shapes only ever draw the box); with it off, every draw tick the aim
  moves, up to the block limit, including the script-side bounding box scan of BSE-01. BSE-28 repeats it.
- Cost estimate: 8,000 cells: 16,000 to 24,000 calls plus up to 2,200 shell cells, 60 to 240 ms in one tick. With
  defer off and a 50,000-cell shape: over 1 s per aim change. Not measured.
- Fix: read each cell once per solve (a `Map` keyed by packed coordinates shared by the shape and shell passes);
  for outline and corner previews read only the cells that can be drawn (the shell), not the interior; run the solve
  as a `runJob` generator and keep drawing the box until it finishes.
- Prove it with: `build-bar.js` for behavior; a scenario that anchors a 20x20x20 cube and moves the aim every 15
  ticks, longest tick before and after.

### BSE-03 A destroy preview scans the whole inventory every tick  [medium-high / confirmed / S / none]
- Where: `packs/build_bp/scripts/core/Preview.js:727-759`, before the cache check at `:774` (the total durability is
  part of the key, `:768`).
- What happens and how often: every tick per player holding a digging tool with a destroy anchor: for 36 slots
  `invComp.size`, `selectedSlotIndex`, `getItem`, `typeId`, and `getComponent` plus two reads for each spare tool.
- Cost estimate: 110 to 145 native calls a tick, 0.2 to 1 ms a tick per destroying player depending on the mix.
- Fix: cache `{ total, spares }` per player; invalidate on `playerInventoryItemChange` (subscribed in
  `utils/Items.js:201`), on a hand change and when a destroy job ends. Read `size` and `selectedSlotIndex` once.
- Prove it with: a variant of `build-holders-perf.js` where each player holds a pickaxe with a destroy anchor.

### BSE-30 A mirror draws up to about 780 particles in one tick, every second  [medium / confirmed (counts) / S-M / the mirror plane looks different]
- Where: `packs/build_bp/scripts/core/ModifierVisualizer.js:132-151` (every 20 ticks), `:47-81` (`drawMirror`: with
  either horizontal axis on it draws both the X plane and the Z plane, `:53-63`, 290 spawns each at the default
  radius, plus a 196-spawn column; the Y plane adds 290), `:116-128` (98 more whenever the player's Y changes);
  `packs/build_rp/particles/eb_mod_x.json` (lifetime 1.0 s, so they are all alive at once).
- What happens and how often: per player who has a mirror on and holds a block or tool, in one callback a second.
- Cost estimate: 776 to 1,066 `dim.spawnParticle` calls in one tick, 8 to 10 ms at 10 us, plus as many packets and
  live particles on every nearby client. Not measured.
- Fix: draw each plane as a few stretched quads (one particle per edge and per cross line, with a Molang length
  variable: 6 spawns a plane instead of 290); draw only the planes whose axis is on; send them to the owner with
  `player.spawnParticle` (the pack already uses it in `Coach.js:324-326`); or spread the spawns over the 20 ticks.
- Prove it with: count spawns per tick in a scenario with a mirror on; a phone check.

### BSE-31 The idle floor is ten interval callbacks a tick that return at once  [medium / likely (from the two published numbers) / S / none]
- Where, every tick: `main.js:918` (sneak watch), `main.js:975` (hand sweep), `core/HoldWheel.js:77`,
  `core/LanguagePicker.js:202`, `core/EntityPanel.js:429`, `core/Coach.js:651`, `core/ModifierVisualizer.js:156`,
  `core/PlacementQueue.js:50`, `core/Preview.js:366`; every 2 ticks: `main.js:855` (zoom), `core/GuideBook.js:223`;
  every 20: `main.js:901`, `ModifierVisualizer.js:132`, `PanelLight.js:31`, `PlacementQueue.js:128`. That is 15
  permanent intervals and 10.2 wake-ups a tick; the other 6 of the pack's 21 `runInterval` calls are jobs that clear
  themselves (`BlockPlacer.js:298`, `BlockDestroyer.js:319` and `:466`, `UndoRedo.js:222`, `PlacedReport.js:34`,
  `VanillaModifierHook.js:23`).
- What each does with nobody building: all return after one or two `Map.size` tests; Coach and HoldWheel read
  `system.currentTick` first; only the hand sweep touches players (every 10th tick: one `selectedSlotIndex` each, and
  every 20th an inventory read for a fifth of them).
- Cost estimate: build_bp measures 0.090 ms at 10 players and 0.112 at 40: 0.083 fixed plus 0.0007 a player. The
  fixed part cannot be the per-player sweep; it is the ten wake-ups (about 8 us each with the profiler's wrapper).
  build_bp alone is 9 of the bundle's 32 every-tick intervals (XC-03).
- Fix: start each loop when it has something to do and `clearRun` it when it does not: panels, picker, coach, hold
  wheel, zoom and placement queue all have one place where their map goes from empty to non-empty; the preview and
  mirror loops can hang off the tool gate's `mark()`; the sneak watch and book-name loop off the book-holder map.
  What must stay is one sweep every 10 ticks. `PanelLight` should clear its interval when done (BSE-21).
- Prove it with: `suite.mjs --perf 10,40 --perf-only build_bp` (expect the 10-player figure to fall most) and the
  bundle's `callsPerTick`; `build-holders-perf.js`, `build.js`, `build-bar.js` for the wake-up paths.

### BSE-04 Seven to eight property reads and two raycasts a tick per drawing player  [medium / confirmed / S / none]
- Where: `packs/build_bp/scripts/core/Preview.js:415` (quality), `:428` (`getTargetPos`: a 64-block raycast plus
  head and view reads), `:434` (flick), `:443` (infinite reach: one world and one player read, `Settings.js:71-78`),
  `:684` (preview mode), `:698-708` (the target again: a second raycast), `:722-723` (game mode, replace blocks),
  `:764-766` (palette). `getMaxBlocks` (`Settings.js:135-142` with `settings.js:282-293` and `:28-35`) is 10
  property reads, called twice per solve (`:952`, `:991`) and once per modifier pass.
- Also paid by players who are not drawing a shape: anyone with a mode on and a placeable block in hand runs lines
  415-443 and the idle branch at `:629-653` every tick (five reads, one raycast whose result is unused there, a new
  rawtext object, an action bar packet); anyone holding the Building Book runs `:391-403` every tick (a fresh
  inventory read because book reads are never reused, one property read, an action bar packet).
- Cost estimate: 15 to 25 native calls a tick per such player, 0.1 to 0.25 ms a tick; this is most of the known
  0.38 ms preview floor that is not particles.
- Fix: a per-player settings object filled on first use and replaced by the setters in `Settings.js` and `Palette.js`
  and by settings' `onChange` (already wired in `main.js:999`); world options cached the same way. Reuse the first
  raycast as the default target. In the idle and book branches build the line once and skip the raycast.
- Prove it with: `build-holders-perf.js` extended with (a) anchored players standing still, (b) players with a mode
  on holding dirt, (c) players holding the book.

### BSE-05 One broadcast particle per outlined block, seven emitters each  [medium / confirmed (counts) / M / other players stop seeing your preview if it is sent to the owner only]
- Where: `packs/build_bp/scripts/core/Preview.js:232-238` (`dim.spawnParticle` per position), `:1094-1113` (tiers),
  `:131-142` (`adaptiveParticles` returns the whole border when the border alone is over 500);
  `packs/build_rp/particles/eb_controller.json` (six child emitters; face lifetime 0.1 s against a 0.05 s redraw at
  quality 1, so two generations overlap: 0.15 s at q2, 0.3 s at q5, 0.6 s at q10, 1.1 s at q20).
- What happens and how often: about 50 spawns a tick per drawing player whatever the tier (50 every tick, 100 every
  2, 200 every 4, up to 500 every 5 above 200 cells), sent to every client in range.
- Cost estimate: server 0.5 to 1 ms a tick per drawing player; client 350 emitters a tick and about 650 live quads
  for a 50-block outline. Not measured on a device.
- Fix: draw runs, not blocks: one particle per straight edge with a length variable. Send previews with
  `player.spawnParticle`. Cap the border in `adaptiveParticles`. At quality 1 a lifetime of 0.06 s halves the quads.
- Prove it with: spawn counts in `build-bar.js`; a Fold 7 frame-rate check with a 30x30 wall preview.

### BSE-06 The steady line is re-sent every tick  [medium / confirmed / S / none]
- Where: `packs/build_bp/scripts/utils/ActionBar.js:22-35`, called on every cached path (`Preview.js:397`, `:489`,
  `:562`, `:640`, `:776`, `:806`).
- What happens and how often: `setActionBar` 20 times a second for every drawing player, every book holder and every
  player with a mode on and a block in hand, with unchanged text (the TPS part changes once a second); plus a
  `realm:actionbar` script event every 10 ticks, which wakes every pack's listener in the bundle (XC-01).
- Cost estimate: 20 packets a second per such player; server cost small; phone cost not measured.
- Fix: remember the last text object and tick per player; re-send when it changed or every 20 ticks.
- Prove it with: `build-bar.js`; count `setActionBar` calls a second.

### BSE-10 Quick Stack looks at a player every 2 ticks for a second after every inventory change  [medium / likely / M / timing of buttons and auto-store]
- Where: `packs/stash_bp/scripts/pages.js:1787-1809` (beat), `:1700-1722` (active for 20 ticks after any change),
  `:1651-1690` (`tickPlayer`), `page-store.js:28-43` (`stateOf`: a property read and a `JSON.parse` of the page index,
  up to 30,000 characters; read again by `curPage` and `inventoryReady`), `pages.js:76-88` (`totalPages`, twice a
  look: `getFor` is a property read and parse each time, XC-04), `:1045-1056` (cursor component and three button
  slots), and on every fifth beat `:939-944` (33 `getItem`) and `:1200-1234` (24 `getItem`, `keyOf` twice per stack,
  hotbar, cursor and worn gear near a full page).
- `getItem` counts, as asked: a quiet player 15 + 57 in 25 s, about 3 a second; a player whose inventory keeps
  changing 30 + 2 x 57 (66 near a full page) = 144 to 162 a second, plus about 330 other item reads a second for the
  keys on a full page.
- Cost estimate: a plain look is about 17 calls and four parses (0.2 ms); an auto-store look 0.5 to 1 ms; an active
  player 3 to 4 ms a second, 0.15 to 0.2 ms a tick, before any commit (BSE-27). The soak's players never change
  their inventory.
- Fix: (1) keep the parsed index per player in memory (this pack is its only writer: update it in `writeState`,
  drop it on leave); with XC-04's cached preferences a look parses nothing. (2) Compute `totalPages` once a look.
  (3) Use the event as data for auto-store: record which page slots gained (slot, `itemStack`, `beforeItemStack`) and
  build keys only for those slots; when the page has more than LIVE_MARGIN free slots only count the empties.
  (4) One look in the tick after an event and one a second later is enough; the 2-tick polling only covers a late
  event, which the quiet look also covers. `InventoryItemEventOptions` can restrict a listener to slots 9-35.
- Prove it with: `stash-autostore-perf.js` with `--profile` (page 1, room to spare, so no commits), then with 10
  miners; `stash-pages.js`, `stash-sneak-sort.js` for the buttons.

### BSE-11 All of Quick Stack's soak figure is the quiet look every 5 seconds  [medium / confirmed (from the numbers) / S / slower repair of a lost button]
- Where: `packs/stash_bp/scripts/pages.js:1733-1735`, `:1803-1808`.
- What happens and how often: every online player gets a `tickPlayer` every 100 ticks and a page scan every 500.
- Cost estimate: stash_bp is 0.030 ms at 10 and 0.144 at 40: 0.0038 a player with no fixed part, which is exactly
  one 0.38 ms look per player per 100 ticks.
- Fix: with BSE-10 (1) and (2) a quiet look is about 10 calls; then look every 20 to 30 s (the events are the real
  signal) and scan every 2 minutes.
- Prove it with: `suite.mjs --perf 10,40 --perf-only stash_bp`.

### BSE-35 Quick Stack's event handlers read settings before their cheap tests  [medium / confirmed / S / none]
- Where: `packs/stash_bp/scripts/pages.js:1079` (`buttonsWanted`: two preference reads and parses and an operator
  check, before the test that the slot or either stack is a button; runs for every change in slots 9-35);
  `main.js:851` (`getFor(player, "sneakTap")` before `isSneaking`, on every block interaction, which repeats while
  the button is held); `main.js:625-648` (after-break and after-place build a key from `dimension.id` and `location`
  for every block before asking whether any lock exists); `pages.js:1116-1120` and `page-store.js:17-25` (two
  `entitySpawn` listeners; for every item entity the first reads the item component and its stack).
- What happens and how often: per inventory change, per block interaction, per broken or placed block, per spawned
  entity. A mob farm, a tree feller or BSE-34's 500 drops go through these.
- Cost estimate: 30 to 40 us per inventory change, 20 to 30 us per interaction, 30 us per block, 50 to 60 us per
  dropped item. 20 drops a second is about 1 ms a second.
- Fix: test the slot and stacks first; test `isSneaking` and the block type first; `if (!locks().size) return`
  first; in the spawn handler return unless some online player has their buttons in place, and merge the two
  listeners (one `typeId` read).
- Prove it with: the churn scenario of W0 (kills, breaks, pickups) with `--profile`; `stash-pages.js`,
  `stash-claims-access.js`.

### BSE-07 A full undo history rewrites every saved entry on each build  [medium / confirmed / S / migration of `eb:undo_*` and `eb:redo_*`]
- Where: `packs/build_bp/scripts/core/UndoRedo.js:65-89` (with 10 entries: the new one is written at index 10, then
  entries 1-10 are read, parsed, stringified and written to 0-9), `:142-160` (the entry is stringified once to
  measure it and again to save it), `:192-198` with `:59-63` (every build also clears the redo stack, which writes
  `eb:redo_n` even when it is already 0).
- What happens and how often: every build, destroy, cut or paste of at most 200 blocks (the default threshold) once
  the player has 10 entries. Air build makes one entry per block placed.
- Cost estimate: 11 reads, 10 parses, 11 stringifies and 13 writes; entries are up to 30,000 characters (about 100 a
  block), so up to 300 KB parsed and written per build, 10 to 25 ms. Not measured.
- Fix: a ring: `eb:undo_head` and `eb:undo_n`, write at `(head + n) % 10`; no entry moves. Reuse the measured JSON
  string. Skip the redo clear when its count is 0. Migrate on first read (no head key means head 0).
- Prove it with: a unit test for the ring order; `build.js`'s undo steps; count property writes per build.

### BSE-08 Every copy stringifies and saves the whole clipboard  [medium / confirmed / S-M / saved-data format if entries are packed]
- Where: `packs/build_bp/scripts/ui/ClipboardUI.js:176` -> `utils/ClipboardStore.js:110-119`, `:30-62` (stringify,
  then the 960,000 character check, then up to 40 writes of 24,000 characters and a meta write), `:8-10` (`fitsInSlot`
  stringifies it once more for a survival cut, `Clipboard.js:214`).
- What happens and how often: every copy and cut. An entry is 70 to 120 characters, so about 8,000 to 13,000 blocks
  fit; a larger copy builds a string of several MB and discards it. A copy that fits writes up to 960 KB of player
  properties. Twenty slots can hold 19 MB for one player, which the engine loads with the player.
- Cost estimate: a 4 to 6 MB stringify is probably 50 to 150 ms (not measured), after BSE-01's capture.
- Fix: decide from the block count and a sample before stringifying; store a palette of `typeId|states` strings and
  `[dx, dy, dz, index]` tuples (about a quarter of the size); write the auto slot a few seconds later in a job, or
  on leave; cap a player's saved slots in bytes.
- Prove it with: a unit test for the size estimate and the packed format; a timed 40x40x30 copy.

### BSE-09 A spawn loads and parses the saved clipboard  [medium / likely / S / none]
- Where: `packs/build_bp/scripts/main.js:162-192` (`:174-184`) -> `utils/ClipboardStore.js:64-87`.
- What happens and how often: on every `playerSpawn` (there is no `initialSpawn` test) while the in-memory clipboard
  is empty: up to 40 property reads joined into a string of up to 960 KB and parsed, in the tick every other pack's
  join handler runs (XC-07). It also runs on each respawn after a death, and it brings back a clipboard the player
  cleared with sneak-click, because clearing does not delete the auto slot (a bug).
- Cost estimate: 20 to 50 ms for a large clipboard. Not measured.
- Fix: keep only the meta read at spawn; load the blocks on the first paste preview or paste. Delete the auto slot
  when the player clears the clipboard.
- Prove it with: a scenario that saves an 8,000-block clipboard, rejoins, and records the join tick.

### BSE-34 The destroy loop reads `typeId` about ten times per block; up to 500 drops are then pulled every tick  [medium / confirmed / S / none]
- Where: `packs/build_bp/scripts/core/BlockDestroyer.js:466-576` (per block: `getBlock`, `isAir`, then `block.typeId`
  at `:504`, `:505`, `:507`, `:513` twice, `:514`, `:517` twice, `:519`, `:522` and in `getBlockDrop`,
  `permutation.getAllStates`, `getItemStack` for the drop, `setType`), 64 blocks a tick with no time budget;
  `:450-454` and `:562-565` (a survival destroy of 500 blocks or fewer spawns one item entity per block);
  `:313-353` (`startMagnetEffect`: `location`, `getVelocity`, `applyImpulse` per drop per tick for 20 ticks).
- Cost estimate: 15 to 20 calls a block, about 1,000 to 1,300 a tick while a destroy runs (3 to 10 ms a tick); the
  magnet is up to 1,500 calls a tick for a second; every spawned drop also runs BSE-35's handlers.
- Fix: read `typeId` once per block; share the placement queue's 4 ms budget; collect drops into totals for any
  count (as the bulk path does above 500) and hand them to the player, which removes the entities and the magnet.
- Prove it with: `build.js` destroy steps; a profile of a 500-block survival destroy.

### BSE-12 The placement queue rescans itself every second and can drop charged blocks  [medium-low / likely / S / survival players get blocks that were lost before]
- Where: `packs/build_bp/scripts/core/PlacementQueue.js:128-157` (every 20 ticks: a copy of the waiting part of the
  queue, a bounding box pass in `ChunkLoader.js:36-42` and a centroid pass), `:86` (`world.getDimension` per entry),
  `:101-107` (an entry is tried at most once a tick and dropped after 200 tries, with no refund).
- What happens and how often: while a paste drains (every paste goes through the queue, `Clipboard.js:333`) or blocks
  wait for unloaded chunks. The ticking area follows the remaining entries (its key changes when their bounding box
  does), so far entries do get a loader once the near ones are placed; they are lost only if that takes more than
  the 10 s their 200 tries last.
- Cost estimate: for a 50,000-entry paste, 150,000 script iterations and a 50,000-element copy every second for the
  3 to 20 s it drains. Not measured.
- Fix: keep the bounding box and sums as entries are added and removed; resolve the dimension once per queue; count
  tries only while a loader covers the entry; refund what is finally dropped.
- Prove it with: a survival scenario that queues a 150-block wall into unloaded chunks and checks the placed count
  and the inventory.

### BSE-32 Every paste adds and removes a ticking area, even in loaded chunks  [medium-low / confirmed / S / none]
- Where: `packs/build_bp/scripts/core/PlacementQueue.js:34-41` (the first entry of a queue calls
  `ensureChunkLoaders` before anything is known to be unloaded), `core/ChunkLoader.js:53-71` and `:17-24` (a
  `tickingarea add` command and a read, parse and write of `eb:tickingAreas`), `:77-86` (the same again to remove);
  the 20-tick pass replaces the area whenever the remaining box changes.
- What happens and how often: once per paste and per undo that queues anything: two commands and two world property
  writes at least. The world allows 10 ticking areas; Expeditions needs one per dungeon and calls a run off when it
  cannot get it (`packs/expedition_bp/scripts/main.js:1629-1641`), and a failed add here is retried every second
  with a console warning (`ChunkLoader.js:72-74`).
- Fix: add a loader only after an entry has come back unloaded; keep at most two build areas at a time.
- Prove it with: `expedition-pending.js` with several pastes running; count `tickingarea` commands in `build.js`.

### BSE-33 4.3 MB of the 7.4 MB pack is thirteen languages; 2.9 MB is another pack's music  [medium (download) / confirmed (sizes) / M / players of dropped languages lose translated panels]
- Where: `packs/build_rp/sounds/records/run_away.ogg` (2,944,154 bytes, mono, 44.1 kHz, 350 s, 67 kbit/s; used by
  `packs/elytra_bp/scripts/main.js:27-29`), `packs/build_rp/textures/entity/guide_book/<lang>/` (672 files, 2.4 MB),
  `textures/entity/panels/<lang>/` (234 files, 1.9 MB), `models/` (0.8 MB of JSON before compression).
- What happens and how often: downloaded by every player whenever Realm Resources changes version (XC-13: every
  build is a new version).
- Fix: re-encode the track at Vorbis quality 0 or 1 (about 48 kbit/s, saves about 0.8 MB; needs a listening check);
  let the Realm Resources bundle take a list of languages to ship (the standalone pack keeps all 13), which removes
  up to 4 MB for an English-only Realm; add XC-09's size budget.
- Prove it with: `du` of the built pack; the language picker scenario with a reduced list.

### BSE-15 933 textures are listed by client entities; nothing in the pack asks for more than about ten at once  [low-medium / needs-measurement / L / none]
- Where: `packs/build_rp/entity/guide_book.entity.json` (673: the cover and 14 folders of 48 pages, 160x200),
  each of 18 `entity/panel_*.entity.json` (14: one base and 13 language inks; `panel_ring` has 1), 962 PNG files in
  all; `render_controllers/guide_book.render_controllers.json` (nine controllers, each one texture from
  `Array.pages[v.first_page + v.page_...]` or `Array.bases[...]`), `panel_*.render_controllers.json` (two controllers:
  `Texture.default` and `Array.langs[v.p_lang]`).
- What is true: decoded as RGBA the listed textures are 82 MB (pages), 196 MB (panel inks) and 56 MB (bases and
  cover), 334 MB before mipmaps. An open book resolves the cover and up to eight page textures of one language; an
  open panel two.
- What would have to be true for a client to hold them all: the client would have to load every entry of a client
  entity's `textures` map when the pack loads or when the entity type is first drawn, instead of loading a texture
  when a render controller first selects it. This audit could not establish which the client does. There is no
  `textures_list.json` in the pack that would force a preload.
- Fix: measure client memory on the Fold 7 with the pack on and off, then with a book open and after paging through
  it. Only if the whole list is resident: one atlas per language, or ship fewer languages (BSE-33).
- Prove it with: the device measurement; BDS has no client.

### BSE-14 In-memory undo and clipboard can hold tens of MB per heavy builder  [low-medium / needs-measurement / M / fewer undos of huge builds]
- Where: `packs/build_bp/scripts/core/UndoRedo.js:98-112` (200,000 cells a stack, counting `bef` only; each cell
  also has an `aft` object and usually its own states object), `core/Clipboard.js:140-146` (one object and one
  states object per copied block, up to the block limit).
- What happens and how often: per online player who builds big; freed on leave (`main.js:809-814`).
- Cost estimate: 200,000 cells as 400,000 objects plus states is roughly 60 to 100 MB. Not measured; the memory
  soak never builds.
- Fix: a per-snapshot palette of `typeId|states` and typed arrays for coordinates; cap temp undo in bytes.
- Prove it with: the memory soak with one player placing and undoing ten 20,000-block builds.

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| BSE-16 | `expedition_bp/scripts/main.js:3671-3706` | With no run, every mob death still reads `deadEntity.id` and `getTags()` (the hurt handler at `:3734` returns first) | `if (!runs.size) return;` first |
| BSE-17 | `stash_bp/scripts/page-store.js:334-366`, `:368-383` | The retired queue (up to 1,500 entries, about 25 KB) is read, parsed and rewritten for every replaced page snapshot (each commit: BSE-27, each page switch twice) and parsed every minute | Keep it in memory, write at most once a second, skip the sweep when the head is not due |
| BSE-18 | `build_bp/scripts/main.js:975-995` | The hand sweep is the pack's per-player slope (0.0007 ms a player a tick), not its floor (BSE-31) | Every 40 ticks for players with no mode on |
| BSE-19 | `build_bp/scripts/core/BlockPlacer.js:296-320` | At "Instant" 256 blocks a tick with no time budget (64 at the default speed); jobs of several players stack | Share the queue's 4 ms budget |
| BSE-20 | `Coach.js:626-641`, `EntityPanel.js:387-405`, `LanguagePicker.js:172-184`, `GuideBook.js:175-190` | Four stray sweeps, 15 type-filtered `getEntities` over whole dimensions, all on the same tick every 200 ticks, forever | One sweep at world load, then remove strays from `entityLoad` by type; or one families query every 60 s |
| BSE-21 | `build_bp/scripts/core/PanelLight.js:19-34` | The interval is never cleared; while a light sits in an unloaded chunk it reads, parses and writes `eb:lights` every second | `clearRun` when done; retry on a 60 s cadence and write only when the list changed |
| BSE-22 | `Preview.js:32-34`, `:89`, `ModifierVisualizer.js:114`, `main.js:70` | `previewTicks`, `previewTierQ`, `previewLastTargetKey`, `lastPreviewTarget`, `lastY`, `wrongToolMsgMs` keep an entry per player ever seen | Delete them in the leave handler |
| BSE-23 | `EntityPanel.js:417`, `GuideBook.js:213`, `LanguagePicker.js:195` | Three `entityHitEntity` listeners read `hitEntity.typeId` for every hit in the world | One listener; pass `entityTypes: ["minecraft:player"]` if the filter applies to the attacker (check) |
| BSE-24 | `expedition_bp/scripts/main.js:3811-3814`, `gauntlet.js:779-780` | Two `typeId` reads per loaded entity | Read once |
| BSE-25 | `ModifierVisualizer.js:167-171` | `lastY` survives a mirror being turned off, so the arms are not redrawn until Y changes | Delete it when the mirror is off |
| BSE-26 | `stash_bp/scripts/pages.js:1207`, `:1225` | `keyOf` (three native reads) runs twice per stack | Compute once |
| BSE-36 | `build_bp/scripts/main.js:576-577`, `:723-726` | Every item use by anyone runs `hasRequiredTag` (two to three property reads) and `getInfiniteReach` before the mode test | Return when `state.mode === "disable"` first |
| BSE-37 | `EntityPanel.js:55-76`, `:119-136`, `:252-257` | An open panel computes `aimPoint` three times a tick (hover, cursor, the preview's `aimingAtPanel`) and sets two entity properties while the aim moves | Compute once a tick; send the cursor every other tick |
| BSE-38 | `expedition_bp/scripts/main.js:3528-3536` | `elemAt` reads `dimension.id` and `location` for every button, plate, lever and target hit with no run | `if (!runs.size) return undefined;` first |
| BSE-39 | `expedition_bp/scripts/main.js:3505-3521` | The fall watcher wakes every 2 ticks forever | Start it when a run enters a shaft or parkour room |
| BSE-40 | `expedition_bp/scripts/gauntlet.js:502-556` | A before-`entityRemove` listener reads `typeId` for every removed entity (drops, arrows, despawns); the before signal takes no filter | Subscribe only while a stash or parcel record exists |
| BSE-41 | `expedition_bp/scripts/main.js:900-917`, `:1642-1647` | `findForeign` checks the whole box (16 `containsBlock` calls over about 650,000 blocks for a 128-wide box) in one callback at run start; not measured | Run it as steps of the build job |
| BSE-42 | `expedition_bp/scripts/main.js:2295-2314`, `:2179-2222` | A wave spawns up to 18 mobs in one tick, each with two tags, five effects and up to four `replaceitem` commands | Spread a wave over three or four ticks |
| BSE-43 | `expedition_bp/scripts/queue.js:194` | The line is saved every 100 ticks while anyone waits | Save when it changes; derive the time waited from a start tick |
| BSE-44 | `build_rp/render_controllers/guide_book.render_controllers.json`, `panel_*.render_controllers.json`, `entity/panel_*.entity.json` | An open guide book is drawn by nine render controllers; an open panel evaluates 225 part-visibility entries in each of two controllers and about 3.7 KB of Molang every frame; not measured on a phone | Measure first; then fewer controllers (one material, UV-switched pages) |

## Rejected leads

- BSE-13 (two players' ticking areas collide because the name uses six characters of the id): player ids differ by
  2^32, so the last six digits repeat only every 15,625 ids. What is real about ticking areas is BSE-32.
- BSE-12's "items beyond the 96x96 area never load": the area is recomputed from the remaining entries every second
  and moves. Rewritten above.
- BSE-18's "the hand sweep is most of the pack's idle floor": the floor does not scale with players. See BSE-31.
- BSE-10's cost (0.25 ms a tick per active player, "about 12 natives" a look): it missed the commit, which is the
  cost that matters (BSE-27), and undercounted a look (about 17 calls and four parses).
- BSE-15's "about 925 textures, 350 MB if all are loaded": 933 are listed and 334 MB is the decoded size, but the
  first pass assumed the client loads them all. Rewritten as an open question.
- BSE-04's "`getMaxBlocks` is about 6 property reads": it is 10.
- BSE-20's "9 `getEntities`": 15, in four sweeps.

## Checked and fine

- build_bp tool gate (`utils/tool-gate.js`): with nobody holding a tool the preview and mirror loops return with no
  native call; holders are found from hand events, not polled.
- build_bp hot events: `playerPlaceBlock` (`main.js:762`, `VanillaModifierHook.js:100`), `playerBreakBlock`
  (`VanillaModifierHook.js:188`) and before-`playerInteractWithBlock` (`main.js:364`) return after a map lookup for
  players who are not building.
- Build mode is not saved: a rejoin starts in "Disable", so no player costs anything until they pick a mode.
- Placement queue main loop: returns at once when empty; 4 ms budget checked every 32 steps.
- Undo and redo apply 64 blocks a tick; `realm:blocks_placed` is sent 16 a tick in 16-block boxes.
- ChunkLoader: areas are saved in `eb:tickingAreas` and removed at world load after a crash.
- build_bp leave cleanup (`main.js:809-831`, `Items.js:204-208`) apart from BSE-22.
- Particle lifetimes match their cadence at every quality (1.2 to 2 times the redraw interval).
- The deferred box preview is capped (288 cells over quality) and the paste skeleton at 400.
- Expeditions idle: `main.js:1403` (every 100 ticks), `:2124` (every 1,200) and `:3480` (every 10) return on an
  empty line, no pending box and no run.
- Expedition generation and reset: a `system.runJob` over slabs with native `fillBlocks`; one ticking area per slot
  (at most three), removed after the reset and at world load.
- Expedition run loop: every 10 ticks, at most 18 mobs, `world.getEntity` for members; hazards draw a handful of
  particles; the action bar is sent once a second.
- Expedition restart cleanup (`main.js:3955-4001`) and saved boards (history, tiers, parcels expire after 30 days).
- Quick Stack leave cleanup (`pages.js:1176-1185`, `1723-1726`, `1752-1755`).
- Quick Stack locks: one scan of the world's property ids, then cached; the explosion handler tests `locks().size`.

## Not read

- build_bp: `core/EntityPanelData.js` (3,716 lines of panel data), `ui/FloatingPanels.js` (what each panel's
  `values()` reads every 5 ticks while open), `ModeSelectUI.js`, `ModifiersUI.js`, `SettingsUI.js`, `PaletteUI.js`,
  `OnboardingUI.js`, `HelpUI.js`, `utils/CustomUI.js`, `Hints.js`, `InFront.js`, `ViewUtils.js`, `PanelSound.js`,
  `BlockStates.js`, `modifiers/*`, the modes other than Sphere and Cube (whether each honors `cap`), `Palette.js`
  120-329 (`assignPalette` over 50,000 cells), `beds.js` outside the ranges above, `Coach.js` 1-540, `GuideBook.js`
  1-150, `LanguagePicker.js` 1-150, `VanillaModifierHook.js` 195-322, `Presets.js`.
- stash_bp: `main.js` 1-395 (sort, quick stack search job), 680-818, 877-1321 (commands, claims); `pages.js` 530-584,
  690-900 (`enforcePageCount`, `transferStacks`), 1430-1600 (fill earlier pages, sort all pages: how many commits),
  1980-2211 (menus, recovery); `page-store.js` 610-805 (recovery export).
- expedition_bp: `layout.js`, `rooms.js`, `spawn.js`, `gossip.js`, `forget.js`, `config.js`; `main.js` 1-286,
  405-520, 610-836 (`buildSteps`), 1165-1316, 1410-1540 (`start`, layout generation cost), 1740-2085 (end of run,
  homecoming, parcels), 2315-3008 (rooms and puzzles), 4001-4701 (menus, commands); `gauntlet.js` 1-395, 650-690,
  800-836, 945-1051.
- build_rp: `animations/`, `animation_controllers/`, `attachables/`, the geometry files (0.8 MB), the Molang in the
  panel entities beyond its size.
