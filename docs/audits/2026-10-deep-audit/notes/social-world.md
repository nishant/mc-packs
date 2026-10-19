# Track social-world: audit notes

Worktree `/home/user/wt/social-world`, branch `audit/social-world` (not pushed). Packs: waystone_bp, atlas_bp, maps_bp,
afk_bp, zones_bp, cleanup_bp, chairs_bp, elytra_bp, build_bp, build_rp, silly_bp, silly_rp, domt_bp.
`origin/master` merged at start and before the final checks (already up to date). No manifest bumps (lead bumps:
build_bp, atlas_bp, chairs_bp, domt_bp, elytra_bp, silly_bp, cleanup_bp).

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | high | build_bp | core/Preview.js:303, main.js:840, core/ModifierVisualizer.js:146, core/GuideBook.js:219 | Every player, every tick (guide every 2), read the inventory and ran the preview/sneak/mirror/guide loops even with building off and no book in hand: 1.51 ms/tick at 40 players with nobody building (2.8 ms in the full-bundle baseline) | Shared per-tick hand cache and player list (`utils/Items.js` `heldItemCached`, `allPlayers`); idle players looked at every 5 ticks, staggered by list index (`idleSkip`), at once after a hotbar slot or inventory change; players with a mode on, a book in hand, a mirror on or a guide/picker open stay every tick | M | fixed 6f04064, 161af6a |
| 2 | high | build_bp | core/Preview.js (16 `setActionBar` sites), utils/ActionBar.js:18 | C18: the preview's redrawn line above the hotbar (mode prompts, sizes, paste countdown, TPS) was written every tick with no `realm:actionbar`, so other packs' steady lines overwrote it; holding the Building Book sent a steady `realm:actionbar` every tick (20 script events/s per player, each parsed by every pack's listener) | `steadyBar()` announces (steady 30, rank as before) then draws; steady requests throttled to once per 10 ticks per player | S | fixed 6f04064 (scenario build-bar) |
| 3 | high | atlas_bp, domt_bp, chairs_bp | atlas main.js:1376, domt events.js:123, effects.js:133/260, helpers.js:466, chairs main.js:69 | C6: `spawnEntity` can hand back an existing entity (reused ids). Atlas fights and Deck arenas tag the result and later `remove()`/`kill()` everything with the tag; Chairs `remove()`s the "seat" when `addRider` fails: a dropped item or pet could be deleted | `spawnFresh` (typeId check, 8 tries, then throw) in atlas and domt helpers (also `spawnAround`, `spawnAbove`, the Deck's champion); Chairs checks the seat's type and gives up quietly | S | fixed f610a52 (no failing-first scenario: id reuse cannot be forced on BDS; atlas, domt-*, claims-bundle-taps pass) |
| 4 | medium | elytra_bp | main.js:490 | C13: jukebox tap (Run Away disc) ignored `event.cancel`. In the bundle claims_bp's handler runs first in the same context, so a visitor could eject the disc (or a vanilla record) from a jukebox in someone else's claim and pick it up | `if (event.cancel) return;` first | XS | fixed 0f91cc1 (scenario elytra-jukebox-claims, mini bundle) |
| 5 | medium | silly_bp | librarian.js:380 | C13: the librarian book lock ignored a canceled villager tap | `if (ev.cancel) return;` first | XS | fixed 0f91cc1 (no scenario: the harness can't tap a villager with a book, see the pack's own test hook) |
| 6 | medium | cleanup_bp | config.js:24 | Dropped bundles (17 ids) were cleared, deleting everything inside like a shulker box | `"bundle"` in `keepItems` (matches every color) | XS | fixed 239d5a3 (scenario cleanup-bundle) |
| 7 | medium | maps_bp (test) | tools/test-bds/examples/maps-hunt.js:2-5 | Baseline failure: the scenario needed a hand-made copy with `showAt: "hotbar"`; the suite ran the plain `--only maps_bp` command, so the map line was in a side box the harness can't read. Not a pack bug (the recipe run passes) | The scenario sets `showAt=hotbar` itself with `realm:cfg_set` | XS | fixed f49007d |
| 8 | medium | maps_bp (test) | maps-cleanup.js, maps-leave.js | Always skipped: their `rvtest` hook is described in prose only | Put the hook in a file (e.g. `tools/test-bds/examples/hooks/maps-rvtest.js`) and a plain `cp`/`cat >>` recipe, plus the suite's RECIPES entry | S | deferred: needs tools/ (lead) |
| 9 | medium | build_bp | (pack) | Public release: Easy Building is "Effortless Building v5.0 ported" with no license or credit file in the pack | Owner to confirm the upstream license and add credits to the pack and docs | S | deferred: owner decision |
| 10 | medium | elytra_bp, maps_bp | side.js:307 (synced copy) | At 40 players in the full bundle both packs' cost is the shared side.js `scriptEventReceive` (about 2.6 ms per copy), not their own code (elytra own loops 0.22 ms, maps 0.02 ms) | HUD track owns tools/side-shared.js | - | reported (HUD track) |
| 11 | low (new) | build_bp | core/Settings.js:121-124 (recent-changes #11) | A player with no saved max blocks gets the operator's cap; an operator raising `maxBlocksCap` to 300,000 gives every player 300k-block builds | Docs warning in the Configuration row (below) or a world `defaultMaxBlocks` | XS | deferred: docs (lead) |
| 12 | low (new) | build_bp | settings.js:188 (recent-changes #12) | `previewQuality` choice list vs older saved values | none: `setPreviewQuality` only ever saved `PREVIEW_QUALITY_OPTIONS` (1-5, 10, 20) and the book's reader `getPreviewQuality` accepts only those, so both readers agree | - | no change needed |
| 13 | low | build_bp | core/Preview.js:303 | After the fix the preview loop still measures 0.38 ms/tick at 40 idle players although it skips 4 in 5 (getAllPlayers is 10 us at 40 players, hand reads are cached): looks like a per-tick floor of the first callback in the pack under the profiler | Measure without the profiler wrapper (tick meter only) before more work | S | deferred: measurement |
| 14 | low | cleanup_bp | main.js:33-39 | Death points live in memory, capped at 50: after a restart, or with 50+ deaths in 5 minutes (PvP server), older death drops lose their protection (documented for the restart) | Persist and raise the cap to 200, or key by player | S | deferred: low |
| 15 | low | build_bp | core/Settings.js | `maxBlocksCap` up to 300,000 and Infinite Reach are lag tools on a griefing-prone server | Safe defaults are already on; docs should say so for public servers | XS | deferred: docs |
| 16 | low | domt_bp | tools/test-bds/examples/domt-cards.js, domt-void.js:28 | domt-cards flaky in the baseline at --jobs 2 (passed here at --jobs 1); domt-void threw when its horse spawned as a foal (no tamemount) | domt-void respawns until a grown horse comes | XS | domt-void fixed b7dfdf6; domt-cards deferred: load-sensitive, not reproduced |
| 17 | low | elytra_bp | main.js:357-385 | NOS Rocket listens on four events (before itemUse, after itemStartUse, after itemUse, before tap) and relies on the trigger's own debounce | none needed; noted for C8 (no audio changes, per the lead) | - | no change |
| 18 | low | afk_bp | main.js:270 | `/realm:afk` callback's `system.run` uses the player without `isValid` (left in the same tick): harmless, caught by the runtime as an error log | add `if (!player.isValid) return;` | XS | deferred: low |

Checked with no finding: C12 (`getScore` in waystone, maps, domt wrapped in try/catch), C11 (afk weatherChange accepts both ids),
C15/C16 (atlas `topAt`, maps chest search wait for loaded land), C19 (every `addItem` uses its leftover), C22 (waystones capped by
`maxWaystones`, atlas player data `SAVE_MAX`, meteors 24, deaths 50), C24 (cleanup re-checks op on submit), waystone trips
(re-check balance and distance on submit, refund on a failed teleport, `settle` checks `isValid`), maps cleanup (a chest is
put back only once empty), cleanup_bp never touches anything but `minecraft:item` entities and keeps renamed, enchanted,
lore-marked, keepItems, near-player and death-point items. zones.js copies: no change needed.

## Performance (perf-soak, only this track's 11 behavior packs, 120 s)

ms/tick in pack callbacks. "Full bundle" = the baseline's whole-bundle run (perf-tables.md), for reference.

| pack | @10 before | @40 before | @10 after | @40 after | full bundle @10 / @40 (baseline) |
|---|---|---|---|---|---|
| build_bp | 0.589 | 1.508 | 0.373 | 0.651 | 1.130 / 2.829 |
| elytra_bp | 0.087 | 0.238 | 0.098 | 0.191 | 1.286 / 2.897 (side.js) |
| silly_bp | 0.082 | 0.218 | 0.086 | 0.180 | 0.175 / 0.383 |
| atlas_bp | 0.023 | 0.083 | 0.023 | 0.076 | 0.060 / 0.152 |
| afk_bp | 0.025 | 0.054 | 0.022 | 0.038 | 0.036 / 0.067 |
| maps_bp | 0.014 | 0.027 | 0.018 | 0.026 | 1.224 / 2.800 (side.js) |
| chairs_bp | 0.015 | 0.016 | 0.015 | 0.018 | 0.021 / 0.038 |
| domt_bp | 0.003 | 0.009 | 0.002 | 0.008 | 0.040 / 0.082 |
| cleanup_bp | 0.004 | 0.006 | 0.002 | 0.004 | 0.020 / 0.035 |
| waystone_bp | 0.002 | 0.003 | 0.002 | 0.005 | 0.049 / 0.102 |
| zones_bp | 0.001 | 0.001 | 0.000 | 0.001 | 0.033 / 0.068 |
| these 11 together | 0.850 | 2.164 | 0.642 | 1.199 | |

build_bp's callbacks at 40 players, before -> after (ms over the run): Preview.js loop 2337 -> 1071, main.js double-sneak loop
642 -> 153, GuideBook 482 -> 192, ModifierVisualizer mirror loop 430 -> 161.
Against the budget (typical pack <= 0.15 ms/tick at 40): build_bp is still over (see finding 13); elytra_bp (0.22) and
silly_bp (0.21) are just over and both are a runInterval over every player (elytra 5 ticks, silly 10 ticks), not worth a
change under 1 ms per the checklist; elytra and maps in the full bundle are dominated by side.js (HUD track).
Microbenchmark on BDS (no profiler): `world.getAllPlayers()` 4 us at 1 player, 6 us at 10, 10.5 us at 40; `player.id` 0.2 us,
`selectedSlotIndex` 0.55 us, inventory `getItem` 1.8 us. Player handles are the same JS object across ticks (usable in a WeakSet).

## Scenarios added / changed

| scenario | before | after |
|---|---|---|
| build-bar.js (new) | FAIL on the pre-fix build_bp (stash): "40 steady requests in 40 ticks" and "0 steady requests" for the mode line | PASS (4 and 4 in 40 ticks; book controls back within 3 ticks after a slot change; the tutorial book still opens for an idle player) |
| cleanup-bundle.js (new) | FAIL on the pre-fix config: both bundles cleared | PASS |
| elytra-jukebox-claims.js (new, mini-bundle recipe in its header) | FAIL with the pre-fix elytra main.js (0f91cc1~1): the visitor picked up the disc | PASS (twice) |
| maps-hunt.js (changed) | FAIL in the suite (needed a hand-made copy) | PASS with the plain `--only maps_bp` command |

Suite for this track's scenarios (`suite.mjs --jobs 1 --retry --filter '^(waystone|atlas|maps|afk|zones|cleanup|chairs|elytra|build|silly|domt|claims-bundle|claims-zones|guard-zones)'`):
31 scenarios: 27 pass, 1 flaky (domt-void: the scenario's horse spawned as a foal with no tamemount; fixed in the scenario,
b7dfdf6, then passed twice), 0 fail, 3 skipped (maps-cleanup, maps-leave: hook in prose; elytra-jukebox-claims: its recipe needs a
RECIPES entry, run by hand above). domt-cards passed (319 s, alone at --jobs 1).

`npm run check`: pass (all checks, catalogs current). `npm run build`: pass (74 .mcpack).

## DOCS (docs/PACKS.md; lead edits)

- **Lag Cleanup — `cleanup_bp`**, How to use step 3: "...items with lore, shulker boxes, bundles, elytra, nether stars, ..." (add "bundles").
  Configuration row `keepItems`: default `shulker_box`, `bundle`, `minecraft:elytra`, `minecraft:nether_star`,
  `minecraft:totem_of_undying`, `minecraft:dragon_egg`, `minecraft:beacon`, `minecraft:heavy_core`, `minecraft:enchanted_book`;
  description: "Item ids never cleared. An entry matches any id ending with it, so `shulker_box` and `bundle` cover every color.
  Renamed and enchanted items and items with lore are always kept as well".
- **Easy Building — `build_bp`**: in "what players see" or the performance note: "With building off and no book in hand, the pack
  looks at a player only every 5 ticks; holding the Building Book or a block with a mode on is followed every tick." In the
  Configuration row `maxBlocksCap`: add "Players who never chose a limit get this cap: on a public server keep it low (the default)
  and raise it only with `operatorsOnly` or `tagRequired`." Also add a credits line for Effortless Building (finding 9) once the
  owner confirms the license.
- **Easy Building**, How the packs work together / action bar protocol: Easy Building's preview line is a steady line (rank 30) and
  now announces itself with `realm:actionbar` at most every 10 ticks.
- README rows: no change.

NEWS (plain ASCII, player-facing):
- "Lag Cleanup now keeps dropped bundles, like shulker boxes."
- "A jukebox in someone else's land claim keeps its Run Away disc: only the owner can take it out."
- "Easy Building costs the server much less while nobody is building, and its line above the hotbar now takes turns with the other HUD lines."

## Requests for the lead

- Suite (tools/test-bds/suite.mjs): add `elytra-jukebox-claims` to RECIPES (its header recipe is plain shell like
  claims-bundle-taps'); give maps-cleanup / maps-leave a hook file plus a plain recipe so they stop being skipped (finding 8).
- Bump on integration: build_bp, atlas_bp, chairs_bp, domt_bp, elytra_bp, silly_bp, cleanup_bp (no manifest touched here).
- Cross-pack: other packs with per-tick `getAllPlayers()` loops over idle players can use the same pattern (object-identity
  WeakSet of busy players, staggered idle checks, wake on `playerHotbarSelectedSlotChange` / `playerInventoryItemChange`).
- C6 helper: elite, saga, atlas and domt now each carry an identical `spawnFresh`; a shared copy plus `sync-*` tool would keep them
  in step (C14).
- No zones-shared.js or side-shared.js change needed from this track.

## Phase 2 ideas

1. Lag Cleanup: persist death points per player (and the owner's name) so their drops stay protected across restarts and on busy PvP servers.
2. Easy Building: a world `defaultMaxBlocks` separate from the cap, and a public-server preset (operators only, 2,000 blocks, no Infinite Reach).
3. Waystones: an operator "set up this world" step that places the first waystone at spawn and explains discovery (first-hour guidance).
4. Atlas / Treasure Maps: send `realm:gossip` and `realm:title_unlock` for a finished hunt or a cleared Choir cairn (town news).
5. A `tools/sync-spawn.mjs` shared `spawnFresh` module for every pack that tags what it spawns.

## Review

Independent review of `git diff bfc50c8..HEAD` (the track's commits after its master merge; base a4cccca). HEAD was
85c8db6 when the review started: two commits came after the track's report (6a55605 restores librarian.js CRLF so the C13 fix
is one line; 85c8db6 grows up The Steed's foal before taming, with scenario domt-steed). Rules checked: no manifest bumps, no
docs/README/NEWS/catalog edits, no stash_bp or saga_bp edits (no conflict with #86 or #84), no cross-pack imports, no
non-ASCII game text, no `.header(`, stable APIs only (`triggerEvent("minecraft:ageable_grow_up")` is stable). Each fix was
traced to its trigger: C6 spawnFresh in atlas/domt/chairs (every caller catches the throw; atlas types all `minecraft:`; domt
normalizes the id; Chairs' sweep removes unridden seats), C13 early returns, cleanup `bundle` suffix (no other vanilla id ends
with it), build_bp idle stagger (busy players stay every tick; slot/inventory changes wake an idle player; leave cleans the caches).
No blocker or high confirmed.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low (test) | tools/test-bds/examples/elytra-jukebox-claims.js:63 | The owner's eject check counted only the owner's inventory; the disc pops out 2 blocks from the visitor too, who sometimes picked it up: failed 1 of 3 runs here ("0 on the ground, 0 picked up") | fixed 7df709e (counts both players; then passed 2 of 2) |
| medium | packs/build_bp/scripts/core/PlacementQueue.js:100 | C18 still incomplete in build_bp: the queue's recurring "waiting for chunks at x y z" line, and one-shot lines in UndoRedo.js:165/210/216/250, Clipboard.js:185, PaletteUI.js:154, ModifiersUI.js:16/24, BlockPlacer.js:122, SettingsUI.js:287, FloatingPanels.js:318, are drawn with no realm:actionbar (most main.js lines do lockActionBar right after) | deferred: pre-existing, outside the track's fix; cheap (lockActionBar / steadyBar before each), for the next build_bp pass |
| low | packs/build_bp/scripts/utils/Items.js:79-83 | idleSkip picks idle players by `(tick + index) % 5`: GuideBook's loop runs every 2 ticks, so idle players are seen every 10 ticks, and a loop whose period is a multiple of 5 would never see most idle players; a hand change on a tick the 2-tick loop skips is noticed only at the next slot (up to 0.5 s before the tutorial book opens) | deferred: latent, works for today's periods (1 and 2); a per-loop counter instead of the shared tick would remove the coupling |
| low | packs/build_bp/scripts/core/Preview.js:699 | The settled-preview branch draws (now steadyBar) without the isActionBarLocked check every other branch has, so it overwrites the pack's own one-shot lines and other packs' locks | deferred: pre-existing behavior; add the same guard |
| low | packs/atlas_bp/scripts/main.js:1369, packs/domt_bp/scripts/helpers.js:460 | spawnFresh retries leave the mob the failed call really spawned in the world, untagged (never cleaned by the fight/arena end) | deferred: rare, and far better than removing a pet; same as elite/saga's helper |
| low | tools/test-bds/examples/domt-busy.js | Flaky this run at --jobs 2 ("no message /You drew The Comet/ for Buddy within 1200 ticks"), passed alone | deferred: load-sensitive like domt-cards; no domt change in the track touches it |
| info | packs/domt_bp/scripts/effects.js:930 (85c8db6) | The Steed foal fix was not in the track's notes | verified: domt-steed on the pre-fix effects.js gave 10 of 12 tamed, 2 foals in 2 of 3 runs; passes after. NEWS line for the lead: "The Steed card now always brings a grown, tamed horse." |

Scenario results (review, `suite.mjs --jobs 2 --retry --filter '^(waystone|atlas|maps|afk|zones|cleanup|chairs|elytra|build|silly|domt|claims-bundle|claims-zones|guard-zones)'`):
32 scenarios: 28 pass, 1 flaky (domt-busy, passed on retry), 0 fail, 0 timeout, 3 skipped (maps-cleanup, maps-leave,
elytra-jukebox-claims: hook/RECIPES, lead request). elytra-jukebox-claims by hand with its mini-bundle recipe: 1 fail before
7df709e (visitor pickup), 2 of 2 pass after. domt-steed: pass (31 s); fails before its fix. build-bar, cleanup-bundle,
maps-hunt, domt-void pass. `npm run check`: pass; `npm run build`: pass (74 .mcpack). origin/master: already merged, up to date.

Verdict: the track's 3 high and 4 medium fixes hold; no blocker or high found in review. One test flake fixed (7df709e);
the remaining build_bp C18 gaps (PlacementQueue and one-shot lines) are medium and pre-existing.
