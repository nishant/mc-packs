# Review: msftmyt-deep-audit-fleet-integration (aef10dc) vs origin/master 7eb5f72, engine scope

Read-only review. Nothing was edited, committed or pushed.

**Checks I ran:**
- `npm run check` passes: every sync `--check`, catalogs, versions.
- These unit tests pass (64 tests): check-actionbar, check-ids, check-stories, expedition-capacity and saga-collect-stash.
- I wrote a heuristic script that compares each pack's `onScriptEvent` id lists with the ids its handlers compare against. It found no handler that lost an id in the W11 conversion. Its only hits were relics_bp false positives (that pack builds its id list from a Set).

**Not run on BDS:** another agent's profile runs (`--profile`) and a stash run were using BDS the whole time. I did not start a run against master, because it would have skewed their timings. The master copies of maps_bp, map_bp and stats_bp are extracted to `scratchpad/master/packs` for a later before/after run.

## Findings (ranked)

| # | Sev | Pack | File:line | Trigger | Why it's wrong | Fix |
|---|---|---|---|---|---|---|
| 1 | **High** | moon_bp | scripts/main.js:553-636 (`builtCells`, `built()`, playerPlaceBlock invalidation) | During a Blood Moon a wave checks a cell and caches it as "clear". A player then builds a shelter there with Easy Building (build_bp places through script: `setPermutation`/`setType`, no `playerPlaceBlock`), or a structure, `/fill` or a piston adds blocks. | Only `playerPlaceBlock` removes clear cells from the cache, so the cell stays "clear" for the rest of the night. Waves then skip the exact 9x9x9 check and can spawn monsters inside the new build. Before the change every spot got the exact check. The O7 claim is also unmeasured ("native scale timing still queued"). Near bases most cells read "built", so those cells pay one 16^3 `containsBlock` and then the exact check anyway. The cache only saves work in the wild. | Give clear cells a TTL (for example 600 ticks). Or invalidate on a `realm:` event that build_bp sends after a batch placement. Or always run `exact()` within about 24 blocks of a player who placed or built recently. Measure before keeping it. |
| 2 | Medium | elite_bp | config.js:11-28, main.js:480-521 (`aliveCap`, `crowdedAround`) | The owner's Realm has 1-4 players online. | The default changes from a fixed 8 champions to 0.8 per online player (ceiling 80), plus at most 3 within 64 blocks. One player now meets at most 1 champion, four players at most 4. This halves or worse the champion density on the live Realm. That is a gameplay change for the owner to decide (PLAN section 5), not a performance fix. A world that saved `maxAlive` 8 keeps 8 only as the ceiling, so the per-player cap still applies. | Default `maxAlivePerPlayer` to 0 (the old behavior) and put 0.8 only in the Large preset, or ask the owner. |
| 3 | Medium (perf, unproven) | build_bp | utils/build-tool.js:30-38, utils/tool-gate.js, core/Preview.js:343-370, core/ModifierVisualizer.js:131-178 | Any player in survival holding any placeable block (dirt, torches, cobblestone). | `holdsBuildTool` counts every placeable block as a building tool, so the O48 gate is open nearly whenever anyone builds normally. While it is open: three loops call `beginVisualizationTick` every tick, each building `new Set(players.map(...))`; Preview calls `getState` for every non-holder every tick; each loop calls `holdsBuildTool` again (an inventory read) for holders. The saving is only real on an idle server. OPEN.md itself says "W1 measurement REQUIRED", and none was done. | Count only the Building Book, an active build mode with an anchor, or `copy_paste` as "holding". Build the presence Set once per tick, not per loop. Profile at 1-4 and 40 players. |
| 4 | Medium (bug) | build_bp | core/Preview.js:358-369 | A player has a build anchor and switches the hotbar to a sword or food. | The anchor is cleared silently: either the non-holder branch or `!holdsBuildTool` calls `clearAnchor`. That is a behavior change nobody listed, and fighting mid-build loses the anchor. | Keep the anchor and only stop drawing. Or document and announce it. |
| 5 | Low (bug) | build_bp | utils/tool-gate.js:45-95 (`released`) | Three loops share one gate. When the mirror loop (every tick) or the array loop (every 20 ticks) calls `begin` first in a tick, it consumes `dirty` and `released`. | Preview's closed-gate branch then sees an empty `released` and never clears a stale anchor. After that, `visualizationIdle()` short-circuits every loop, so the stale anchor stays until someone holds a tool again. | Make `begin` once-per-tick (cache by `system.currentTick`), or keep `released` until Preview reads it. |
| 6 | Medium (perf) | build_bp | core/Preview.js:305-321 (`previewDestroyBeds`), main.js:198-210 (`readPlaced`) | A destroy-mode preview of a large shape; confirming a large destroy. | The filter just above already calls `dim.getBlock` for every position. `previewDestroyBeds` calls it a second time per position, every redraw. On confirm, `readPlaced` calls `getAllStates()` on every block, synchronously, not only on beds. That doubles the native reads on the hot path for a beds-only feature. | Do the bed check inside the existing filter, using the block it already read. Check `isBedType(typeId)` before `getAllStates()`. |
| 7 | Medium | saga_bp | objectives.js:686-797 (stash bridge, `collectCount`) | stash_bp can't send an answer: a page fails to read, or a single row with long lore pushes the message over 2048 characters so `sendScriptEvent` throws. | The comment (and stash_bp's) says the asker "keeps waiting rather than counting zero". In fact saga gives up after 40 ticks and caches `rows = []` until the next `stash_changed`. Then `bump(..., have, true)` sets the absolute count, so collect progress can drop: the dip the bridge was written to avoid. The maps (`stashRows`, `stashAsked`, `stashParts`, `stashRev`) are also never cleared in `playerGone`. | Keep the last good rows, or keep waiting, instead of caching `[]`. Clamp the progress so it never goes down while stash data is missing. Clear the maps on leave. In stash_bp, cut lore so one row always fits. |
| 8 | Low-Med (perf) | hud_bp | main.js:94-108 (`statePartMessages`) | Every `realm:hud_state` send (on change and every 5 s) at large player counts. | For each id it stringifies the whole growing chunk again and walks it character by character for UTF-8. That is O(n^2) work, about 100 stringifies of up to 1.9 KB at 100 players. | Keep a running byte count (id length + 3 bytes per entry). |
| 9 | Low | map_bp | main.js:299-313 (`applyReset`) | After any `/realm:map_reset`, a player who never had map data joins for the first time. | Everyone whose saved generation is lower is told "An operator reset everyone's destination and marked spots", which means every new player, forever after a reset. `resetPlayer`'s return value (whether anything was cleared) is ignored. | Send the message only when `resetPlayer` returns true. |
| 10 | Low | saga_bp | ui.js:1559-1585 (`layoutBox`), removed `fitTail` | A long open step label that has to be cut (the last resort). | `fitRows` cuts from the end, so the location tail (" NE 240m", "1:20 left") goes first. The old `fitTail` always kept it. Row counts are a 32-column estimate of a proportional font, so wrapped lines may take more real rows than counted. The real-client check is still open. | Keep `fitTail` for the last-resort cut. Check Right 1-3 and Middle on a real client. |
| 11 | Low (dead code) | saga_bp | ui.js:1714-1715 (`currentPage`) | Always. | `needs.length ? ... : e ? ... : onHold ? ... : needs.length ? ... : ...`: the second `needs.length` branch can never be reached. | Remove it. |
| 12 | Low (no gain) | tornado_bp | main.js:361-426 (`SOUND_BAND`, `bandVolume`) | Any tornado. | O9 asked to "batch tornado sounds by distance band". The code only shares one volume multiplication per 8-block band and still makes one `playSound` per player, as its own comment says. The work is unchanged, and volume now jumps in 8-block steps. | Revert, or record O9 as won't-fix with the reason. |
| 13 | Low | admin_bp, hud_bp, stats_bp | tools/check-actionbar.allow.json | Someone adds a new anonymous `setActionBar` writer in hud_bp or stats_bp main.js. | The allowlist entry is `(anonymous)`, so any anonymous function in those files passes. That defeats O56's tighter detection for exactly the two packs with exemptions. | Allowlist by line or by a named function (`tickerLoop`, `hudLoop`). |
| 14 | Low | stats_bp | settings.js:50, config.js:21 (O71) | Live Realm: a player who once switched the ticker off while the default was off. | The old policy erased choices equal to the default, so nothing is saved for them. With the default now on, they see the ticker again. OPEN.md accepts this. The owner should know before release, and the NEWS line needs to say how to switch it off. | Accept and say so in NEWS, or do a one-time migration that stores "off" for players who have no saved choice and a known `stats:` first-join date before this release. |
| 15 | Low | elite_bp | main.js:460, 1147 (O58) | Soak logs. | Only two `isValid` guards were added (`entitySpawn`, `upkeep`). There is no scenario or log run showing the recurring `[elite] InvalidEntityError ... dimension` is gone (OPEN: unverified). `convert` runs a tick later on a captured entity: it checks `isValid` first, but `e.dimension` is read again after `get()` calls without a recheck. | Run the 40-player soak, grep for `[elite]` lines, and add the before/after counts. |
| 16 | Low | tools/diag-shared.js | :354 (`claim`) | A prefix two packs declare (stored as `null`). | `prefixOwner.get(p) ?? st.cur ?? owner(...)`: `??` treats `null` as missing, so a key with an ambiguous prefix is still claimed by whoever touches it first. The header says ambiguous namespaces stay "unowned". | Use `has()` and return null for ambiguous prefixes, or fix the comment. |
| 17 | Low (quality) | expedition_bp, saga_bp | expedition main.js:370/401 and 1341/1441 markers; saga objectives.js `stash-bridge:begin/end` | Refactors. | The tests (tools/expedition-capacity, expedition-forget, saga-collect-stash `.test.mjs`) slice production source between comment markers and `vm`-eval it against fakes. That ties shipped code to test markers, and moving a helper out of the block silently changes what is tested. | Move the queue, forget hook and stash bridge into their own modules (`queue.js`, `stash-bridge.js`) and import them in the tests. |
| 18 | Low (quality) | every pack | for example saga main.js:430-460 and :490-520, wander main.js:1333-1360, map main.js:1844 | Adding an event id later. | Every converted listener keeps its old `if (id !== a && id !== b ...) return` guard next to a registration list with the same ids (23 of them in saga). If someone adds an id to one list and not the other, it is dropped silently. The dispatcher already filters by id. | Remove the inner guards, or register one handler per id. |
| 19 | Low (quality) | saga, elite, expedition, calendar | ui.js:66-82, elite main.js:1057, expedition main.js:2407, calendar main.js:526 | Two notable events from one pack within 1000 ticks (two players finishing an act, a siege and a regatta). | Four copies of the same `gossip()` limiter. The second piece of news is dropped, not queued, and the seen-set is process memory. That's acceptable per the plan, but it is duplicated code. | Make it a shared copy (`tools/news-shared.js` and a sync tool), like spawn.js. |
| 20 | Low | saga_bp | objectives.js:3453-3469 | A long session. | `sessionChampions` never removes an id on death or removal. It grows for the whole session (small). | Delete on `entityRemove` or `entityDie`. |
| 21 | Low | expedition_bp | main.js:1341-1441 | `/reload` or a restart while parties wait. | The queue is memory only, and waiting leaders are not told their place is gone (the docs say memory only). | On world load, tell online players they were in line, or save the queue. |

## Items the brief asked about that are fine

- **W11/O54, one listener per pack.** `tools/events-shared.js` is sound:
  - one native subscription per pack, with an id map and an ordered merge with `"*"` handlers;
  - one handler throwing doesn't stop the others;
  - lists are replaced, never edited, so a handler can unregister safely during dispatch;
  - diag's carrier detection still works, because the first subscription is the shared one with the `realm` namespace.

  The bundle drops from about 237 native callbacks per `realm:` event to about 67. That is cheaper by construction, but not measured. Only admin's setup uses `"*"`, and only temporarily (`offScriptEvent` later). The sync check enforces that no pack subscribes directly.
- **Shared copies.** events, settings, zones, side, diag, labels, spawn and owed are all in sync.
- **O59 (spawnFresh).** One shared module. Expedition keeps the strict `fresh` check. Calendar's old "return undefined" is replaced by a throw, and every call site is inside try/catch.
- **O69 (black square).** I recomputed the empty radar segment: `segment("", " ", 1352)` is "~" plus 450 "§r" = 1351 bytes, at byte 1610 = MARK 9 + 10 × 160. That matches the new `$radar_empty`; the old one was 1354 bytes and could never match. The real-client check is still open.
- **O55 (maps warmth).** It is now a proper steady line (rank 35, unique among 20/25/30/40/45/50), announces before writing, listens only while someone holds a map, and the scenario covers notes, higher and lower ranks, background lines and putting the map away. Lower lines (saga, build, find) still wait for as long as a map is held. That is how steady ranks work, not a bug.
- **O43 (welcome).** The profile is decided once, at world load. The live Realm has player data, so it keeps "realm". `askInstalled` is rate-limited and `isValid` is rechecked after the await.
- **O45 (diag forget).** Late answer, bounded pending list and expiry are correct (apart from #16). The forget hook in diag-shared runs synchronously and sends exactly one answer.
- **O75 and O74.** On master and unchanged here: `clueFound` is chat-only, with no form or camera. Nothing in this branch touches them.
- **O3 (elite round-robin).** Identical to the old behavior at the owner's champion counts. Step catch-up keeps the pace.
- **Canceled beforeEvents.** npc_bp now returns if `ev.cancel`. No new beforeEvent handlers in scope skip that check.
- **Repo rules.** No `.header()`, no beta APIs, `realm:` command namespace kept (`realm:map_reset` is op-gated and needs `confirm`). New script events (stash_count, hud_state parts) are split under 2048. One exception: a single stash_count row can exceed 2048 (#7).
- **Test and debug hooks.** All new or extended `*_debug` / `*_test` hooks keep their gates:
  - saga, npc, map and expedition hooks check the operator level for player sources;
  - maps and storm hooks run from the server console only.

  The stats test hook is injected by `tools/test-bds/hooks/stats-prefs.mjs` into a copy of the packs; it is not shipped.

## Tests spot-checked

- **maps-warmth-steady.js:** would fail on master. It asserts `steady === 35` and that a note holds the line off the bar; master sent no rank and never listened. This is a real RED/GREEN test, but not run here.
- **saga-quest-wrap.js:** asserts whole lines and no "..." on a real chapter and the party line. It would fail on master's `fitTail` and old party text. It only checks the server's 32-column estimate, not real wrapping.
- **stats-ticker-personal.js:** the header documents why it fails before the change (default off). Valid.
- **map-empty-panels.js:** checks the producer's bytes against hud_rp's literal. It is good with the hud-layout unit test, but a client is still needed.
- **Missing:** no native scenario for O7 (moon cache, including #1), O3 or O58 (elite), or O48 (holder gate). Those changes rest on fake-API unit tests, and OPEN.md marks their timing unverified.

## Pack ratings (correctness / performance / maintainability)

| Pack | C | P | M | Note |
|---|---|---|---|---|
| build_bp | C | C | C | The holder gate is broad and unmeasured, clears anchors silently and is shared racily across loops; bed reads double the native calls. |
| saga_bp | B | B | B | The stash bridge falls back to zero (#7); the quest box is good apart from losing the tail; dead branch; the save trim is sound. |
| expedition_bp | B | A | C | The queue logic is right (`runs.set` happens before any await); the code is shaped around test markers; the queue isn't saved. |
| elite_bp | B | A | B | The density default changes the owner's game (#2); O58 is unverified. |
| moon_bp | C | B | B | The clear-cell cache can spawn monsters inside script-built shelters (#1). |
| map_bp | A | A | B | Per-tick player list and no full sort are real savings; small reset-message nit. |
| hud_bp | A | B | B | Splitting the state into parts is correct; O(n^2) encoding. |
| hud_rp | A | A | A | The byte math checks out; a real client is still needed. |
| stats_bp | B | A | B | O71 works; erased "off" choices come back on. |
| admin_bp | A | A | B | Lifecycle generations and late forget answers are correct. |
| welcome_bp | A | A | B | The startup heuristic is safe for the live Realm. |
| maps_bp | A | A | A | Correct steady line, tested. |
| calendar_bp | A | A | B | spawnFresh call sites are guarded; duplicated gossip limiter. |
| tornado_bp | A | B | C | The "batching" is a no-op change (#12). |
| wander_bp | A | B | B | The observer query only applies above 8 players. |
| atlas_bp | A | A | A | Mechanical changes. |
| storm_bp | A | A | B | Same weather-plan copy as moon and tornado (three copies of `planNow`). |
| npc_bp | A | A | A | Cancel guard and nameless gossip filtering. |
| elytra_bp | A | A | A | Reads skipped while not gliding. |
| silly_bp | A | A | A | Listener change only. |
| durability_bp | A | A | A | Max durability cached per item type. |
| events-shared / sync tools | A | A | A | Sound design, enforced by `--check`. |

## Verdict

**Merge after fixes.** Before release, fix #1 (moon cache vs script-built blocks) and #7 (saga stash fallback dipping progress). Settle #2 (elite density) and #14 (ticker coming back) with the owner. Fix or measure #3-#6 in build_bp: either profile them at 1-4 and 40 players and show they help, or narrow the gate to the book and active modes. #8-#21 can follow in a later pass.
