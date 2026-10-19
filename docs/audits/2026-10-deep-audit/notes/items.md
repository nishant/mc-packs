# Track "items": stash, refill, durability, relics, find, claims, fishing, cooking, harvest, farm, death

Branch audit/items in /home/user/wt/items, head 805f5ae. Base 593b0f1 (origin/master was merged into the branch at 21dcbb9 by someone else mid-run).
Not pushed. No manifest bumps. Changed packs: stash_bp, cooking_bp, relics_bp, durability_bp (bump all four).

## Findings

| sev | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|
| blocker | stash_bp | page-store.js loadSnapshot (structureManager.place) | Any player in the Nether or the End: `world.structureManager.place()` puts a structure's entities into the **Overworld** at the same coordinates (proved with a probe: N->N placed 0, N->O 1, O->N 0; `structure load` command places correctly). Every page save/load failed ("did not restore exactly one storage entity"), so pages, buttons and migration never worked there, retried every 2 ticks (9 ms/tick at 10 players, 1225 world property writes per 2 min) and each try **leaked a persistent `realm:stash_page_store` entity holding copies of the player's items** into the Overworld (`/kill @e` would drop them: a dupe). | Place via `dim.runCommand('structure load "<id>" x y z 0_degrees none true false')`; remove any storage entity that spawns or loads outside a synchronous save/load (cleans leaks in existing worlds; the structure is the only durable copy, remove() never drops). | S | fixed 57d60e9 |
| high | stash_bp | page-store.js stageAt | Staging spot (y+24 over the player) occupied by any entity (bat, phantom, dropped item, an old leaked store) failed the whole save; unloaded spot same. | Try 4 heights x 3 side offsets, clear only stray storage entities, then fail. | S | fixed 57d60e9 |
| high | stash_bp | pages.js runInterval(2) | A failing tick (unloaded staging chunk right after a teleport, recovery) retried and logged every 2 ticks forever ("storage staging chunk is not loaded" 1035x/20 s in the baseline). | Per-player backoff 40 ticks after a failure; identical warning at most once a minute. | S | fixed 6bd92dd |
| high (perf) | stash_bp | pages.js runInterval(2) | Every player fully ticked every 2 ticks (stateOf parses, settings, 3 button reads, plus a 57-slot scan every 10 ticks): 2.0 ms/tick at 40 players with no errors. | Active (inventory change or setting change in the last second, or buttons not placed): every 2 ticks as before. Quiet: every 5 s, staggered; page scan every 25 s as a safety net. Settings onChange wakes players. Model tests: mock inventory changes now report on the next tick and pref changes notify onChange (as in game). Trial merge with PR #86: stash files auto-merge, 61/61 model tests and stash-pages-fill pass. | M | fixed e0f3898, 30e5fd3, d1d687f |
| blocker | cooking_bp | main.js cook()/finish() | Ingredients are taken when the pot starts; the dish lived only in a runInterval for cookSeconds (3 s). A restart, crash or script reload mid-cook lost the dish (C19/C23). | `owe()` at start (durable), `settle()` at finish delivers only what is still owed, so a rejoin mid-cook (applyOwed) can't double it. Read-only test hook `realm:cooking_owed_ping` -> `realm:cooking_owed {players, batches}`. | S | fixed 74bf16b |
| medium (perf) | relics_bp | main.js runInterval(20) passives | Read 9 hotbar + 3 equipment slots of every player every second (0.22 ms/tick at 40). | Rescan only after an inventory change, a selected-slot change, every 5 s, or every second while a self-repairing relic is held. 0.17 ms at 40: still a little over 0.15; the rest is the per-player condition checks. | S | fixed d5cb9fa |
| medium (perf) | durability_bp | main.js runInterval | 6 equipment reads per player every 10 ticks (0.11 ms at 40). | Held items every check, armor every 4th (2 s). | S | fixed 805f5ae |
| medium | claims_bp | main.js:221 playerPlaceBlock | A block placed into someone else's claim by a path the tap check misses is set to air: the item (and a placed shulker's contents) is destroyed (C19). Rare: interact already cancels taps and faces; could not build a failing scenario (simulated placements always hit the interact cancel). | Replace `block.setType("minecraft:air")` with `dimension.runCommand("setblock x y z air destroy")` so it drops as an item with contents. | S | deferred: no reproducible trigger for a before/after scenario |
| medium | claims_bp | main.js protection | Public servers: pistons pushing into a claim, flowing lava/water, fire spread, endermen, hurting pets/animals in a claim are not covered. | Phase 2 (entityHurt for tamed/claim animals, piston beforeEvents not stable). | L | deferred: feature |
| medium | cooking_bp | main.js owe/PROP_OWED | `cooking:owed` (and relics `relics:pending`, 100 players x up to 20 relics) grow with players who never return; relics worst case passes 32 KB and the write throws (gift lost). | Cap entries (drop oldest with a timestamp) and cap per-entry size. | S | deferred: needs 1,000-player layout decision |
| medium | find_bp | main.js index | The 2000-container index is world-wide: anyone's search shows other players' chest contents and places (locks/claims are filtered, unlocked chests are not). On a public server that is a griefing map. | Option `onlyOwnFinds` / remember who opened a container. | M | deferred: design |
| medium | death_bp | docs + config | Docs say "the realm keeps inventories on death": not true on a server without keepInventory; nothing points players to their drops' despawn timer. | Doc rewording (below); maybe a despawn countdown in /realm:death. | S | deferred: docs (lead) |
| low | farm_bp | main.js confirmRemove/removeFarm | Remove is not re-checked for edit rights on submit (de-op while the form is open; C24). `everyoneCanAdd` is read only at world load. | Check canEdit in removeFarm/addFarm. | S | deferred: low |
| low | relics_bp | main.js:1045 PROTECTED_TYPES | `minecraft:item_frame`, `minecraft:glow_item_frame` are not Bedrock entities (frames are blocks `frame`/`glow_frame`). Harmless dead entries. | Drop them. | S | deferred: low |
| low | death_bp | main.js:218 AIRS | `cave_air`/`void_air` are Java-only ids (harmless). | Drop. | S | deferred: low |
| low | harvest_bp | main.js takeSeed | Takes the replant seed from any seed item entity within 1.5 blocks, possibly someone else's drop. | Prefer the inventory, or only entities spawned this tick. | S | deferred: low |
| low | refill/stash | stash pages.js refillFromPages (from master #90) | A `realm:refill_need` reads every other page (one structure load each, up to 24) per used-up stack. Fine at 5 pages; costly at 25 while placing blocks fast. | Cache per-page item ids in the index. | M | deferred: measure first |

Checked and clean: C10 (no `.header(`), C12 (getScore wrapped in relics/cooking), C18 (every setActionBar preceded by `realm:actionbar`), C13 (harvest/cooking/stash taps check `ev.cancel`; claims cancels), C6 (no tagging spawnEntity results; stash checks entity count/type), C20 (all other `minecraft:` literals are components/particles or valid ids), refill/fishing/relics give/take paths use the leftover once.

## Perf (perf-soak, only these 11 packs, --no-relay --profile, 120 game s; server at 20 TPS, so numbers are lower than the 67-pack baseline)

| pack | ms/tick @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| stash_bp | 2.687 | 4.415 | 0.245 | 0.440 (steady state after joins ~0.11-0.25) |
| relics_bp | 0.069 | 0.220 | 0.056 | 0.174 |
| durability_bp | 0.042 | 0.110 | 0.056 | 0.083 |
| fishing_bp | 0.021 | 0.032 | 0.022 | 0.018 |
| death_bp | 0.004 | 0.019 | 0.002 | 0.020 |
| claims_bp | 0.005 | 0.005 | 0.004 | 0.006 |
| cooking_bp | 0.001 | 0.006 | 0.002 | 0.004 |
| refill/find/harvest/farm | <=0.002 | <=0.002 | <=0.001 | <=0.003 |

Budget 0.15: stash_bp over on the whole-run average (includes 40 joins, each 3 native snapshot saves); its steady state is near budget. relics_bp slightly over. Everyone else under. Stash warnings in the soak: 1257 (@10) and 1388 (@40) before, 0 after. Raw: scratchpad/items/{before,after}-{10,40}.json.

## Scenarios added

- `tools/test-bds/examples/stash-pages-nether.js` (two players in a Nether pocket and one in the End switch pages and back; no storage entity left in any dimension). Before (57d60e9^): FAIL "NetherA buttons placed", 235 warnings. After: PASS.
- `tools/test-bds/examples/cooking-restart.js` (normal cook gives exactly one dish and leaves nothing owed; restart mid-cook leaves the dish owed). Before (old cook with only the ping hook added): FAIL "owed after the restart: 0". After: PASS.
- Model tests `tools/stash-pages.test.mjs`: runCommand mock, onChange mock, inventory change events on the next tick by default; 48/48 pass (61/61 merged with PR #86).
- Suite for my packs (22 scenarios incl. stash-pages-persistence, refill-pages, claims-*, relics-*, cooking-*): 22 pass. `npm run check` and `npm run build` pass.

## DOCS (docs/PACKS.md; lead edits)

- Quick Stack & Sort, "Fewer pages": "is retried at most once per second while you make room" -> "is retried once a second while your inventory is changing, and every 5 seconds otherwise".
- Quick Stack & Sort, "Auto-store (`autoStore`) looks every half second." -> "Auto-store (`autoStore`) looks every half second while your inventory is changing (for a second after any change) and every 25 seconds otherwise." (PR #86 rewrites this bullet: keep its text and add the timing.)
- Quick Stack & Sort, technical "Inventory pages" paragraph: "Every two ticks the pack checks slots 15, 16 and 17" -> "For a second after an inventory or setting change the pack checks slots 15, 16 and 17 every two ticks, otherwise every 5 seconds (spread over the ticks)". Add: "Snapshots are placed with the `structure load` command: the script API's structure placement puts entities into the Overworld while a player is in the Nether or the End. Any `realm:stash_page_store` entity found outside a save or load is a leftover and is removed (it never holds the only copy). The staging spot is 8 to 32 blocks above the player, moved aside when something is in the way; a player whose save can't be staged waits 2 s before the next try."
- Low Durability Warning, "Checks the main hand, offhand, helmet, chestplate (including elytra), leggings and boots every `checkIntervalTicks`." -> "Checks the main hand and offhand every `checkIntervalTicks`, and the helmet, chestplate (including elytra), leggings and boots every fourth check (every 2 s by default)."
- Kitchen, Saved data `cooking:owed`: -> "JSON `{ player id: { dish id: batches } }`: dishes owed to their cook, from the moment the pot starts until they are handed over, so a restart in the middle of cooking or a cook who left with nobody near the pot gets them on their next join". Add to the script-event list (tests): "`realm:cooking_owed_ping` -> `realm:cooking_owed` `{ players, batches }`, what is owed right now".
- Relics, technical: "Each second the pack reads your hotbar, armor and offhand" (if stated) -> "rereads your hotbar, armor and offhand after an inventory change, a new selected slot or every 5 s (every second while you hold a relic that repairs itself)".
- Death Point intro: "The realm keeps inventories on death, so nothing is lying on the ground" -> "On a world that keeps inventories nothing is lying on the ground; otherwise your items wait at the death point for 5 minutes."

NEWS (plain ASCII):
- "Expansive Inventory pages now work in the Nether and the End."
- "A dish in the cooking pot is no longer lost if the server restarts while it cooks."

## Requests for the lead

- Bump stash_bp, cooking_bp, relics_bp, durability_bp.
- Every other pack that uses `world.structureManager.place(... includeEntities: true)` in a dimension other than the Overworld has the same engine bug (grep `structureManager.place`); switch them to `structure load`.
- PR #86 merge: stash files auto-merge with this branch; the model test file merges cleanly and all 61 pass. Nothing to hand-resolve in stash_bp.
- A `stash-pages-nether` and `cooking-restart` entry needs nothing special in suite.mjs (plain header commands).

## Phase 2 ideas

1. Land Claims for public servers: pets and farm animals in a claim can't be hurt by outsiders, fire/lava/piston protection where the stable API allows, a per-claim "visitors may open doors" switch, and an operator audit list (claims by size and last owner visit).
2. Chest Finder privacy: index only containers the searching player opened or owns (or that are shared), with an operator switch for the old world-wide index.
3. Expansive Inventory index of page contents (item ids and counts per page) in the committed index, so scans, Hotbar Refill from pages and the menu's usage don't load every page structure.
4. A shared bounded "owed to player" mailbox (cooking dishes, relic gifts, fishing prizes) with a timestamp and a cap of 1,000 players, oldest dropped and logged.
5. Death Point: a despawn countdown for dropped items on servers without keepInventory, and party mates' "help me" waypoint through the minimap events.

## Review

Independent review of `git diff a4cccca..805f5ae` (track commits 57d60e9, 6bd92dd, 74bf16b, e0f3898, 30e5fd3, d1d687f, d5cb9fa, 805f5ae; the rest of the range is the origin/master merge 21dcbb9). origin/master has not moved since (da2149f is the merge base). Verdict: no confirmed blocker or high in the track's changes; no reviewer commits, head stays 805f5ae.

What was checked:
- Stray-removal safety: `realm:stash_page_store` was introduced with the native snapshots (b164eff) and was never a persistent store, so every entity found outside a synchronous save/load is a copy (verify-load leak, or a crash mid-save before the journal commit, when the live inventory and the old page structures are still intact). `remove()` deletes, the structure stays. Removal on entitySpawn/entityLoad cannot hit a live staging entity because saves/loads are synchronous and after-events are delivered later (the suite proves it: every stash scenario passes).
- `structure load "<id>" x y z 0_degrees none true false` is includeEntities=true, includeBlocks=false, the same as the old `place()` options; staging y clamps to the dimension height range (Nether roof 125, End).
- Event-gated stash ticks: button clicks are still event-driven (the existing playerInventoryItemChange handler + system.run, not gated); an active window (20 ticks) always contains two auto-store beats, so the auto-store snapshot is always taken after the last change, and PR #86's delta-based autoStore sees the same deltas as before. Trial merge of origin/msftmyt-inventory-page-filling onto 805f5ae: stash_bp files and tools/stash-pages.test.mjs auto-merge (conflicts only in docs/NEWS, PACKS, help/news catalogs and manifests, which exist against master too); model tests 61/61 pass.
- Kitchen owe/settle: owe at start, settle before deliver at finish, applyOwed 100 ticks after join; a leave-and-rejoin mid-cook delivers once (either at the pot via settle or on join), never twice.
- Rules: track commits touch only stash_bp, cooking_bp, relics_bp, durability_bp, two new scenarios and tools/stash-pages.test.mjs (the stash model test, needed to model next-tick events; merges with #86). No manifest bumps, no PACKS/README/NEWS/catalog edits, no .header(, ASCII, realm: ids, no cross-pack imports, stable 2.1.0 APIs (playerInventoryItemChange is in 2.1.0 typings). No saga_bp/objectives.js (#84) changes.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | packs/stash_bp/scripts/page-store.js:17 | Auto-removing every storage entity on spawn/load also removes one an operator loads by hand (`/structure load stash:page_N ...`) to get items out of a retained recovery image, which was the only manual recovery route for "inventory recovery is pending" (there is no recovery command). Nothing is lost (the structure stays), but recovery now needs a tool. | not fixed: no data loss; needs an operator recovery command (Phase 2: `/realm:inv_recover <player>` that restores the before-image into a chest), and docs should say images are kept as `stash:page_<n>` structures |
| low | packs/relics_bp/scripts/main.js:706 | playerInventoryItemChange in 2.1.0 covers hotbar/inventory only, so an off-hand or worn relic (Hollow Crown, boots) put on or taken off is noticed up to 5 s late (effects/villager block linger up to 5 s); worn relics are auto-repaired every 5 s instead of every 1 s. | not fixed: bounded 5 s delay, cost win measured |
| low | packs/stash_bp/scripts/pages.js:1010-1037 | A quiet player who failed is retried on their next 5 s turn, not after the 2 s backoff; enforcePageCount retries every 5 s for quiet players. Docs text in the notes already says "every 5 seconds otherwise". | not fixed: intended |
| low | packs/cooking_bp/scripts/main.js:508 | A script reload (`/reload`) mid-cook leaves the dish owed to an online cook, who gets it only on their next join (no initialSpawn after a reload). Before the fix it was lost. | not fixed: low; could call applyOwed for online players at world load |
| low | packs/durability_bp/scripts/main.js:25 | Armor warnings come up to 2 s later than before. | not fixed: intended, documented in DOCS above |
| low | tools/stash-pages.test.mjs | A tools/ file outside the track's pack folders was edited (mock events on the next tick, onChange mock). | accepted: it is the stash model test, needed for the gated ticks, and merges cleanly with PR #86 |

Deferred track findings re-checked: claims playerPlaceBlock `setType(air)` (main.js:221) stays medium; the interact tap already cancels every placement path I could find (bed/door halves crossing the border are placed from the outside block, so nothing is destroyed). The other deferrals are reasonable.

Scenario results (reviewer runs, this worktree at 805f5ae):
- `node tools/test-bds/suite.mjs --jobs 2 --retry --filter '^(actionbar-steady|admin-stash-singleton|claims-.*|cooking-.*|death-party|durability-rearm|find-index|refill-pages|relics-.*|stash-.*|storm-rod-claims)$'`: 22 pass, 0 flaky, 0 fail (2.8 min).
- Before/after: stash-pages-nether with page-store.js from 57d60e9^: FAIL "NetherA buttons placed" ("native page snapshot did not restore exactly one storage entity"); after: PASS. cooking-restart with the old cook/finish (ping hook kept): FAIL "owed after the restart: {players:0,batches:0}"; after: PASS.
- `npm run check` pass; `npm run build` pass; `node tools/stash-pages.test.mjs` 48/48 (61/61 on the trial merge with PR #86).
- Perf not re-measured (CPU shared); the track's before/after JSON is in scratchpad/items/.

## Review

Second independent review of the track's own commits (`git diff da2149f..HEAD -- packs tools/stash-pages.test.mjs tools/test-bds/examples/{stash-pages-nether,cooking-restart}.js`; the rest of a4cccca..HEAD is the origin/master merge and the lead's test-bds tooling). origin/master still at da2149f. Verdict: both blockers are really fixed at their trigger; no blocker or high left. One reviewer commit (cooking owe-write failure), head f40462e.

Checked: `structure load "<id>" x y z 0_degrees none true false` = includeEntities true, includeBlocks false (same as the old place() options) and runs in the player's dimension; the stray removal on entitySpawn/entityLoad only hits `realm:stash_page_store`, which never holds the only copy (saves/loads are synchronous, after-events arrive later, a leaked one is a copy of the live inventory or of a still-existing structure), and remove() never drops; staging candidates clear only strays; button clicks stay event-driven (playerInventoryItemChange handler + system.run), the active window (20 ticks) always holds two auto-store beats so PR #86's delta autoStore snapshot is always taken after the last change; Kitchen owe/settle/applyOwed delivers exactly once across leave, rejoin and restart; relics' cached `Carried` is read-only (mend/freshen writes happen only inside a fresh scan), durability just splits slots. Rules: only stash_bp, cooking_bp, relics_bp, durability_bp, the stash model test and two new scenarios; no manifest, PACKS/README/NEWS or catalog edits; no .header(, ASCII text, realm: ids, stable 2.1.0 APIs, no cross-pack imports; nothing in saga_bp/objectives.js (#84). Trial merge of origin/msftmyt-inventory-page-filling (#86) onto the head: every stash_bp file and tools/stash-pages.test.mjs auto-merge (conflicts only in NEWS/PACKS/help+news catalog and manifests, same as against master), model tests 61/61 pass.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | packs/cooking_bp/scripts/main.js:478,509 | New in the fix: owe() at pot start goes through saveJson, which swallows a failed write (property over 32 KB); finish() then settle()d 0 and handed over nothing, where the old code delivered the dish. | fixed f40462e: owe() returns whether it saved; if not, finish() delivers all n (and still owes it when the cook is gone and the pot unloaded) |
| medium | packs/stash_bp/scripts/page-store.js:17 | Auto-removal of every storage entity also removes one an operator loads by hand with `/structure load stash:page_N` to recover items for "inventory recovery is pending" (no recovery command exists). Nothing lost, the structure stays. | not fixed: no item loss; needs a recovery command (Phase 2), and PACKS.md should say images stay as `stash:page_<n>` structures |
| medium | packs/cooking_bp/scripts/main.js:539 | `cooking:owed` is now written for every cook (two writes per cook) and stays unbounded per departed player (track already deferred the cap). | not fixed: writes are cheap and the entry is removed at finish; cap is the track's deferred item |
| low | packs/relics_bp/scripts/main.js:706 | Off-hand and worn relics changed without an inventory event are noticed up to 5 s late; worn relics auto-repair every 5 s instead of 1 s. | not fixed: bounded, measured cost win |
| low | packs/stash_bp/scripts/pages.js:1030 | Quiet players' stagger index comes from getAllPlayers order, so a join/leave can shift a quiet player's 5 s turn (one skipped or doubled look). | not fixed: harmless |
| low | packs/stash_bp/scripts/pages.js:1035 | A quiet failing player retries on the next 5 s turn, not after the 2 s backoff. | not fixed: intended |
| low | packs/durability_bp/scripts/main.js:25 | Armor warnings up to 2 s later. | not fixed: intended (DOCS text in the notes) |
| low | packs/cooking_bp/scripts/main.js:508 | After `/reload` mid-cook the online cook gets the dish only on next join. | not fixed: before the fix it was lost |

Scenario results (this worktree):
- `node tools/test-bds/suite.mjs --jobs 2 --retry --filter '^(actionbar-steady|admin-stash-singleton|claims-.*|cooking-.*|death-party|durability-rearm|find-index|refill-pages|relics-.*|stash-.*|storm-rod-claims)$'` at f40462e: 22 pass, 0 flaky, 0 fail (3.2 min).
- Before/after: stash-pages-nether with page-store.js from 57d60e9^: FAIL "NetherB buttons placed" (warning "native page snapshot did not restore exactly one storage entity"); after: PASS. cooking-restart with the dish not owed at start (old behavior, ping hook kept): FAIL "the interrupted dish is owed to its cook ({players:0,batches:0})"; after: PASS.
- `npm run check` pass (exit 0); `npm run build` pass. Perf not re-measured (only cooking_bp changed, two property writes per cook).
