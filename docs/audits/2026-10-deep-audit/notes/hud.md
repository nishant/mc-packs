# Track hud: map_bp, hud_bp, hud_rp (+ tools/side-shared.js, layout and terrain tests)

Worktree /home/user/wt/hud, branch audit/hud, base 593b0f1, head 831504e. Six commits (no manifest bumps; the lead bumps
map_bp and every pack with a side.js copy: calendar_bp, elytra_bp, hud_bp, map_bp, maps_bp, mobhp_bp, saga_bp).

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | blocker | map_bp | scripts/main.js:632, :948, :992 (base) | any server with 10+ players with the radar on (default): 25 ms/tick at 10, 108 ms/tick at 40 (5 TPS) | time budgets per kind of work (new scripts/budget.js), plans resumed instead of rebuilt, terrain reads planned from the misses each radar finds while it is built (no separate planner pass), per-part diff of sends, staggered polling and passes, cheaper radar build (inline keys, run cache, whole-block / 2-degree terrain pose), memoized block classification, give-up on unloaded areas | L | fixed 9c7fa0e (pass budget retuned 831504e) |
| 2 | high | all 7 side.js copies | tools/side-shared.js:307 (base) | every realm:side event (12/tick at 40 players): each copy parsed it and ran clean() on the 1.3 KB radar text with a per-character loop: 0.2 ms per event per copy, ~2.6 ms/tick per copy | skip own events before parsing (from-field check), keep other packs' text raw and clean it only when this copy draws; protocol unchanged | S | fixed 1606ac4 |
| 3 | high | all side.js copies | tools/side-shared.js byteLength | every send and draw counted UTF-8 bytes in a JS loop (0.22 ms on a radar) | native regex count (0.02 ms), equivalence-tested on 200k random strings | S | fixed 3bf7047 |
| 4 | high | map_bp | scripts/main.js gather() | showOthers: every player in the dimension became a marker/edge arrow on everyone's strip and radar (docs say within 128 blocks; O(n^2) work and clutter at 30-100 players) | apply OTHERS_RANGE (128, was defined and unused) | S | fixed 09d11da, scenario map-others-range |
| 5 | medium | hud_rp/tools | tools/hud-layout.test.mjs | slot cuts in hud_screen.json ($skip, radar %.1610s/%.1351s) were pinned as literals only, not tied to side-shared.js constants or the minimap's text sizes | new test derives every cut from SEG_BYTES/RADAR_SEG_BYTES/MARK/ALL_SLOTS and checks the 21x21 radar and the strip fit (measured 8.5 x 9 advances kept) | S | fixed eea4ee9 |
| 6 | medium | tools | package.json "check" | tools/hud-layout.test.mjs and tools/map-terrain.test.mjs are not run by npm run check, so the pinned measured layout can regress silently | add `node --test tools/hud-layout.test.mjs tools/map-terrain.test.mjs` to npm run check | S | deferred: lead (package.json) |
| 7 | medium | build_bp (read-only) | scripts/core/UndoRedo.js:165,210,216,250; core/BlockPlacer.js:122; core/Clipboard.js:185; core/EntityPanel.js:147; core/PlacementQueue.js:99; ui/ClipboardUI.js:147,175; ui/FloatingPanels.js:318; ui/ModifiersUI.js:16,24; ui/PaletteUI.js:154; ui/SettingsUI.js:287; main.js:206,230,325,406,437,515,530,551,568,621,659,706,857 | action bar notes written with no realm:actionbar before them (main.js:252/276 send lockActionBar right after the write, same tick, fine) | route every note through lockActionBar(player.id, ms) first | M | deferred: other track (report) |
| 8 | low | elytra_bp (read-only) | scripts/main.js:297 (NOS hint), :527 (disc stopped) | notes on the bar without realm:actionbar | send the request first | S | deferred: other track (report) |
| 9 | low | hud_bp, stats_bp | hud_bp/scripts/main.js:97, stats_bp main.js:317 | the two bottom steady lines write without a request; deliberate (a request would make the Party HUD and the ranked lines wait for them forever), but CLAUDE.md says "before every setActionBar" | document the exception in the protocol text | S | deferred: lead (docs) |
| 10 | medium | hud_bp | scripts/main.js:76 | realm:hud_state sends at most 100 player ids: on a 100+ player server the stats ticker thinks the HUD is off for the rest and draws over it | split into {part, parts} like the other lists (stats_bp must join parts) | M | deferred: cross-pack protocol change (stats_bp) |
| 11 | low | map_bp | scripts/main.js giveMap | a player who already carries a stack of unnamed empty maps: the give merges into it and nothing is named, but the reply says Mara's Field Map is in the inventory | compare stack sizes, or say "added to your maps" when no new slot appeared | S | deferred: cosmetic |
| 12 | low | map_bp | scripts/main.js collect() | a list whose last part never arrives stays in `partial` forever (tiny, per sender) | drop a partial list after 200 ticks | S | deferred |
| 13 | low | map_bp | scripts/terrain.js planScan, scanMemo | no longer used by the pack (fast viewers use aheadPicks, the rest the radar's own list); still the reference the tests check coverage against | remove with their tests once the new planners have equal coverage tests (one added: the radar's list equals the grid's columns) | S | deferred: test churn |
| 14 | low | map_bp | docs (Minimap section) | "a move of more than 16 blocks since the pass" but FAR_MOVE is 256 | doc fix below | S | deferred: lead (docs) |
| 15 | low | map_bp | - | no way for an operator to remove the pack's saved data (player properties map:wp, map:marks) | a /realm:config reset that clears both for online players and on join | M | deferred: Phase 2 |

Checked and fine (C1-C28 against map_bp/hud_bp/hud_rp): C1 measured layout kept and now pinned (5); C10 no .header(); C11/C15/C16
(heightRange, liquid-inclusive rays, unloaded columns are misses retried, never made-up ground; y 319 not used); C17 forms retry UserBusy
and stop on UserClosed, isValid after every await; C18 titles only through side.js (holdTitle respected via side.held); C20 ids
(minecraft:empty_map data 2, families/tags); C22 saved data is two small per-player properties, maxMarks-bounded; in-memory lists
bounded (sites 1000, wanderers 500, stores maxCols); C23 everything else is rebuilt from pings at load and join; C24 map_debug is
operator/script only; C27 Date.now is used only to time work.

## Perf (ms/tick, perf-soak, --only map_bp,hud_bp, 20 TPS after; before = base 593b0f1 on the same machine)

| pack | @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| map_bp | 17.02 (24.95 in the full-bundle baseline) | 84.22 (108.15 bundle) | 2.31 | 3.69 |
| hud_bp | 1.30 (1.20 bundle) | 2.25 (2.74 bundle) | 0.21 | 0.32 |
| side.js listener, per event per copy (hud_bp's) | 0.23 ms | 0.20 ms | 0.06 ms | 0.06 ms |
| map_bp setTitle/tick | 2.63 | 5.18 | 1.09 | 1.19 |

Runs: before 60 game s, after 120 game s (`--arg seconds=...`). Server TPS at 40 players: 9.4 before (map+hud only), 20.0 after.
map_bp at 40 after, by callback (ms/tick): per-tick redraw 1.95, scanner 1.10, passes 0.51; p95 tick 6 ms, max 30. At 10: 1.57, 0.53, 0.16.

Not reached: the ~1.5 ms/tick target at 40. Measured unit costs on this machine (QuickJS): building a radar's terrain picture
~1 ms, one strip+radar draw and send ~0.25-0.4 ms (two realm:side events and a 2961-byte title), one native call ~10 us, one
column read ~0.05-0.1 ms. The budgets (top of map_bp/scripts/main.js) are: drawing 1.0 ms/tick, terrain pictures 0.4, passes
0.5, scanner 1.0 (each saves up to 6-30 ms for bursts, at most 2-4 ms in one tick). At 1.5 ms in all, 40 constantly moving
players would get a new strip about every 4 s; at these budgets about every 1.5 s in the soak (1.2 titles a tick for 40) (most players aren't moving every
tick on a real server), and one player alone is drawn every tick as before. Halving drawBudget/scanBudget gets ~2 ms if the
owner prefers cost over smoothness.

Visible changes to expect (by design, from the budgets):
- With many players moving at once the strip/radar update less often (longest-waiting first); the terrain under the radar can lag a
  few ticks behind the markers (drawn on the last picture, flagged, rebuilt when the budget allows).
- The terrain grid moves in whole blocks and turns in 2-degree steps (was half blocks / 1 degree); markers, arrows and the strip
  are exact.
- A turn under 2 degrees or a move under 0.5 blocks doesn't redraw (was 0.5 deg / 0.25 blocks): smaller steps almost never change
  the text.
- While walking, the exact near-field columns (thin roofs within 6 blocks) are read only when the player stops; the coarse samples
  show meanwhile.
- Mob markers are refreshed every 10 ticks up to ~15 players, less often above (passes are spread and budgeted: ~every 1.3 s
  at 40).

## Scenarios

Added:
- tools/test-bds/examples/map-others-range.js (run line in its header): before 09d11da FAIL (4 checks: 2 other players on the
  strip/radar, the far one at the edge and in front), after PASS.

Changed (design change, not a weakened intent):
- map-turn.js: "the budget is used while everyone turns (>= 6 sends a tick)" replaced by "the per-tick redraw keeps to its time
  budget (< 3 ms/tick, measured 1.5)" and "every turning player gets a new strip at least every 30 ticks (measured 22)"; the idle
  window starts 60 ticks after the turning (catch-up of lagging terrain pictures) and still requires 0 sends.
- map-water-structures.js: unloaded columns must be back 40 ticks after loadArea (was 20; measured complete within ~30).
- tools/map-terrain.test.mjs: planFor/radarOf vm contexts updated; new tests for Budget, aheadPicks, the radar's own read list
  (equals the grid's columns, coarse first, nothing left once read; markers never left behind; stale picture flagged).
- tools/hud-layout.test.mjs: new slot-cut test (finding 5).

Results (suite --retry, final code): actionbar-steady, elytra-notes, map, map-flight, map-others-range, map-places, map-turn,
map-water-structures, maps-party, mobhp-sweep, rook-map-race, side-boxes, title-hold: pass. maps-hunt and mobhp-overhead fail
exactly as in the baseline (maps_bp hint text and mobhp killing-blow box; not this track's packs, side.js is not involved: the
same first failure line). map (the baseline failure "under 1 ms per player pass") passes at 0.27-0.42 ms per player pass: the
pass no longer builds or sends (the per-tick redraw does, within its budget). npm run check and npm run build pass;
node --test tools/hud-layout.test.mjs tools/map-terrain.test.mjs: 40 pass.

## DOCS (docs/PACKS.md, Minimap section; the lead edits)

- "What's around" bullet: unchanged (it already says "other online players in your dimension within 128 blocks"; the code now does it).
- Replace the **Terrain** bullet's first sentence with: "A scanner reads the land a little every tick within a time budget (about
  1 ms a tick, saved up while there is little to read) and at most 48 columns a tick (24 for one player). Walking or standing,
  it reads what your radar's own picture is missing (the exact block columns near you once you stop); flying or riding fast, also
  the ground ahead of you."
- **A full cache:** "the same 6000-column store cap" -> "a 6000-column store cap (300 more per player with the radar on)". Stale
  columns (older than 2400 ticks) are found when the radar is next built, at least every 200 ticks.
- **Each pass:** "(every 10 ticks, per player ...)" -> "(every 10 ticks per player, spread over the ticks in between: with more than
  20 players, two a tick, so a little less often)". Replace the sentence "Between passes, every tick, players who turned at least
  0.5 degrees or moved at least 0.25 blocks ... at most 8 titles a tick (the players waiting longest first). This redraw-send budget is
  separate from the terrain scanner's 96-operation global budget." with "Between passes, every tick (up to 12 players a tick, the
  rest in turns), players who turned at least 2 degrees or moved at least half a block, or whose land nearby was just read, get the
  strip and radar drawn again; only a part whose text changed is sent, and each part again every 30 ticks so it never fades. Drawing
  and building the radar's terrain picture each have a time budget a tick (about 1 ms and 0.4 ms), the players waiting longest
  first: with many players moving at once, each one's strip comes a few ticks later and the terrain under the radar may lag behind
  its markers for a moment." Also "a move of more than 16 blocks since the pass" -> "more than 256 blocks".
- **Cost:** replace with "The minimap keeps to time budgets instead of a per-player cost: about 3.7 ms a tick with 40 players
  moving around and 2.3 ms with 10 (measured on a 4-core dedicated server, October 2026; it was 108 and 25). One player alone is
  drawn every tick. The budgets are constants at the top of `scripts/main.js`."
- Side HUD / "How the packs work together", side boxes protocol: add "A copy skips its own messages without reading them and
  cleans another pack's text only when it draws."
- Action bar protocol: add "The Coordinates HUD and the stats ticker are the bottom lines: they write without a request (a request
  from them would hold every other line) and wait for everyone else's."

README rows: unchanged.

NEWS (plain ASCII, one line): "The minimap now costs the server a fraction of what it did (about 3 ms a tick with 40 players instead
of over 100), so big servers stay smooth; players outside your party show only within 128 blocks."

## Requests for the lead

1. package.json "check": add `node --test tools/hud-layout.test.mjs tools/map-terrain.test.mjs` (finding 6).
2. Bump manifests: map_bp, hud_bp, and the other side.js copies (calendar_bp, elytra_bp, maps_bp, mobhp_bp, saga_bp) since
   tools/side-shared.js changed (sync-side.mjs was run; `--check` passes).
3. build_bp / elytra_bp action bar writes without realm:actionbar (findings 7, 8): pass to their tracks.
4. realm:hud_state in parts for 100+ players (finding 10): needs hud_bp + stats_bp together.
5. Consider an operator option for the minimap budget (e.g. `tickBudgetMs`) instead of constants; adding it needs a PACKS.md row
   and an admin preset, so it is not in this branch.
6. tools/test-bds/examples/perf-soak.js could query realm:map_debug "cost" at the end (a copy that does is in
   scratchpad/hud/sc/soak-cost.js) to show the minimap's own split per tick.

## Phase 2 ideas

1. An operator "Minimap budget" setting (low / normal / high) mapped to the budgets, shown with the measured cost in /realm:config.
2. Per-player "Minimap detail" (radar off while flying, or a 15x15 radar) so big servers can trade detail for smoothness.
3. Share radar terrain pictures between party members standing together (same store, same rounded pose) to cut rebuilds.
4. A /realm:map_reset for operators that clears map:wp and map:marks (online players now, the rest on join).
5. A 100-player BDS soak in the finishing steps with a per-pack budget table (the Minimap's split is available via realm:map_debug).

## Review

Reviewer pass on a4cccca..831504e, then merged origin/master (#88-#91, which the branch did not have yet) as 7d87c0f.
Head after review: 7d87c0f. npm run check and npm run build pass; node --test tools/hud-layout.test.mjs tools/map-terrain.test.mjs:
41 pass; node tools/sync-side.mjs --check: all 7 copies current.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| high | tools/side-shared.js:206 (textOf), merge with #88 | The branch was never merged with master. A plain merge auto-resolved textOf() to clean another pack's text with `slot === "radar" ? RADAR_TEXT_BYTES : TEXT_BYTES`, so the story's new 511-byte "quest" box, received raw from saga_bp, would be cut to 159 bytes whenever any other copy (hud_bp every second, map_bp every tick) drew the title. Shown with a Node stub harness (scratchpad/sidetest/run.mjs: the naive merge FAILs, the fix PASSes). | fixed in merge 7d87c0f: textOf uses `segBytesOf(slot) - 1`, the receive path keeps the branch's raw apply, and all 7 copies were synced again |
| medium | tools/hud-layout.test.mjs (merge) | The branch's new slot-cut test assumed 11 slots and a 2961-byte subtitle. After #88 there are 12 slots and 3473 bytes. The whole file conflicted because of a CRLF to LF change. | fixed in 7d87c0f: master's file plus the branch's test, now also checking quest ($skip %.2962s, %.511s, 3473 bytes) |
| medium | tools/test-bds/examples/map-turn.js:123 | The new fairness check "a new strip at least every 30 ticks" is borderline: 33 in the suite run (2 jobs in parallel), passed alone on retry (22-30). HOLD is 40, so nothing faded. | not fixed: flaky threshold, not a behavior bug. Suggest <= 36 (still under HOLD) or measure without parallel load |
| medium | packs/map_bp/scripts/main.js redraw (REFRESH 30, HOLD 40, drawBudget 1 ms) | At about 100 players, the resends needed just to keep the readouts from fading (one per player every 30 ticks, about 0.3 ms each) fill the whole drawBudget. Players who stand still would then see the strip and radar blink out (HOLD runs out) when many others move. Not measured above 40. | deferred: needs a 100-player soak. Options: refresh still players in a cheaper way, or a longer HOLD |
| low | packs/map_bp/scripts/main.js planFor fast branch | Fast movers' plans get `at = now`, so columns from the radar's need list that were read after needAt (but before now) are not skipped by spendBudget and get read twice. Wasted reads only. | deferred: perf-tuned path, needs re-measuring. Fix: give the listed picks `since: drawn.needAt` |
| low | packs/map_bp/scripts/terrain.js #bump | A region's version is bumped for (wx,wz) and (wx+res,wz+res) only. A shaded neighbor in the next region over (east or south edge) keeps its old shading until the next rebuild (at most STALE_EVERY 200 ticks). | deferred: cosmetic |
| low | packs/map_bp/scripts/main.js radarOf key | `Math.floor(now / STALE_EVERY)` changes for every player on the same tick, so rebuilds come in a wave every 200 ticks. The budget smooths it (the radars lag briefly). | deferred: add a per-player offset if it shows up in a soak |
| low | tools/side-shared.js byteLength | A lone surrogate counts as 2 bytes (the old loop counted 3). Game text is ASCII, so this does not happen in practice. | deferred |
| low | terrain.js, map-terrain.test.mjs, map-water-structures.js | Whole files were converted from CRLF to LF (927/982/346-line diffs for small changes). Any other branch that touches them will conflict. | deferred: tell the lead at integration (hud-layout already conflicted this way) |
| low | tools/test-bds/examples/perf-soak.js | A retry loop was added to the lead's shared scenario, outside the track's files. Harmless. | not reverted: the lead decides |

Checked and fine: the own-message skip (`"from":"` cannot appear unescaped inside a JSON string value, and an unusual
spacing just falls back to parsing); raw entries are cleaned once, on draw or payload; pass() now only marks views dirty, and
the redraw sends with refresh (the longest-waiting first), so nothing fades at 10-40 players; playerLeave clears every new map;
retries after misses are bounded (4 failed in a row stops a plan, retried in MISS_RETRY); no saved data or store keys changed;
no manifest bumps; no PACKS.md, README, NEWS or catalog edits on the branch (only master's, from the merge); no .header(),
no non-ASCII game text, no imports between packs; nothing touches stash_bp (#86) or saga_bp/scripts/objectives.js (#84);
saga_bp is touched only in its synced side.js.

### Scenario results (review, final code 7d87c0f)

`suite.mjs --jobs 2 --retry --filter '^(map|map-.*|side-boxes|title-hold|actionbar-steady|elytra-notes|maps-party|maps-hunt|mobhp-sweep|mobhp-overhead|rook-map-race|admin-title|prefs-locks|saga-quest-box|calendar)$'`:
pass: admin-title, actionbar-steady, elytra-notes, calendar, map-others-range, map-places, map-flight, map-water-structures, map,
maps-party, mobhp-sweep, prefs-locks, rook-map-race, saga-quest-box, title-hold, side-boxes. flaky: map-turn (33 > 30 in
parallel, passed alone). fail, same as baseline with the same first line: maps-hunt, mobhp-overhead.
map-others-range before the fix (09d11da reverted, run with --packs on a copy): FAIL, 4 checks (2 others on the strip and the radar,
the far one shown). After: PASS.

## Review (second pass)

Re-read the diff against origin/master (master has not moved since 7d87c0f), concentrating on tools/side-shared.js and
the new budget.js. Head after this pass: a411052.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| high | packs/map_bp/scripts/budget.js:31 (spend) | A Budget's debt had no floor. A hitch measured during one piece of work (a long garbage collection, or the system clock stepping forward, such as an NTP step or a VM resume) was charged in full: a 1 s hitch stopped drawing for 1000 ticks (50 s); a 1-hour clock step stopped the strip and radar for every player until a restart. A clock step back made `used` hugely negative, so one tick could run without a limit. | fixed 79bae30: debt floored at -max (work resumes within max/perTick ticks: 8 for drawing, 30 for the scanner), a step back of more than 1 s is ignored; the Budget unit test now covers both (fails before, passes after) |
| medium | tools/test-bds/examples/map-turn.js:123 | fairness threshold 30 flaked at 33 under 2 parallel jobs (first review) | fixed a411052: <= 36, still under HOLD 40, so a check failure still means a strip fading |
| low | tools/side-shared.js apply() | Another pack's text is now stored raw and checked for emptiness before cleaning: a text of only "~" or MARK characters now occupies the slot (drawn as empty) and adds its `until` to the stay time; before, it cleaned to "" and was dropped. No pack sends such text. | deferred: harmless |
| low | tools/test-bds/examples/map.js | "every player drawn each pass" failed once with 2 suite jobs in parallel, passed alone on retry. The budget change only raises the floor, so it can't cause fewer draws. | deferred: load flake; watch it in the lead's integration run |

Checked and fine: byteLength's regex count matches UTF-8 for 1-, 2-, 3-byte and surrogate pairs; the own-message skip
cannot misfire (an escaped `\"from\":\"` inside a value never matches `"from":"`); textOf cleans with the same
segBytesOf(slot) - 1 limit as before, once per entry; OTHERS_RANGE applied in gather(); no saved-data keys, manifests,
PACKS.md/README/NEWS or catalogs changed by the track; nothing in stash_bp (#86) or saga_bp/scripts/objectives.js (#84).

Checks (a411052): npm run check passes, npm run build passes, node --test hud-layout + map-terrain: 41 pass,
sync-side --check: 7 copies current.

Suite (--jobs 2 --retry, same filter as the first review): 16 pass (admin-title, actionbar-steady, calendar, elytra-notes,
map-flight, map-others-range, map-places, map-turn, map-water-structures, maps-party, mobhp-sweep, prefs-locks,
rook-map-race, saga-quest-box, side-boxes, title-hold), 1 flaky (map, passed alone), 2 fail with the baseline's exact
first lines (maps-hunt, mobhp-overhead; not this track's packs).
