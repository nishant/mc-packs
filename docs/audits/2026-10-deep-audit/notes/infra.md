# Track: infra (tools/, tools/test-bds/, hosting minecraft/tools/)

Worktrees: /home/user/wt/infra (branch audit/infra, head 40de975, 17 commits of mine on top of the baseline
harness commits), /home/user/wt/hosting-infra (branch audit/infra, head 017c8232, 1 commit). Merged origin/master
at the start and again at the end; nothing new came in. No pack folders were edited and no manifests were bumped.

## Findings

| # | severity | pack / area | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | high | check pipeline (C20) | tools/check-stories.mjs:360 (only stories) | A wrong entity, block or item id in any pack script or JSON fails quietly: nothing spawns, a typeId test is never true | New `tools/check-ids.mjs`: every `minecraft:` literal checked against all @minecraft/vanilla-data enums plus server component ids; typed places (spawnEntity, ItemStack, BlockPermutation.resolve, setType, typeId ===, `type:`, summon/give/clear/setblock/fill commands) checked with any namespace against our packs' identifiers; allowlist `tools/check-ids.allow.json` (50 ids, listed below for routing) | M | fixed 6f215ca, 2d702d0, 9627176 |
| 2 | high | C7 publish | hosting minecraft/tools/publish-packs.mjs:55 | Publishing from stale help/admin/news catalogs, or from a hosting branch behind origin/master (another branch already published the same version number with other files), or with uncommitted packs (only a warning before) | Refuse when help-catalog/admin-catalog/gen-news `--check` fails, when packs/ is dirty (`--allow-dirty` overrides), and when origin/master's packs.json has versions (slug+version+sha256) this checkout lacks; an existing version now reports both sha256 | S | fixed 017c8232 (hosting) |
| 3 | high | C7 versions | (none before) | A pack's files change without a higher header.version; or two branches bump the same pack to the same number | New `tools/check-versions.mjs`: per pack, files changed (tracked + untracked) since merge-base with origin/master (or `--base`) need a higher version; no base = skip. Runs LAST in npm run check | S | fixed f021a85 |
| 4 | high | harness / script events | tools/test-bds/lib/shim.js | BDS 1.26.52 delivers script events of any length (probed: 2049, 4000 and 40000 characters arrive intact), so a pack breaking the 2048 rule passed every BDS run | Shim wraps System.prototype.sendScriptEvent: a `realm:` message >= 2048 logs a `[harness-shim]` script error (run fails, exit 2) and sends `harness:limit {pack,id,length}`; scenario `harness-event-limit.js` with probe pack `hooks/limit_bp` | S | fixed f6463a8 |
| 5 | medium | bundle | tools/bundle.mjs:31 | `bundle.mjs --list` ran gen-news first, so hosting's `pack-docs.mjs --check` and publish-packs' listing wrote release.js and bumped news_bp in mc-packs whenever NEWS.md was ahead (shown: old code left `M news_bp/manifest.json, release.js`, new code leaves nothing) | gen-news only when bundling, packs reloaded after it | XS | fixed 64fe4b3 |
| 6 | medium | check pipeline | package.json | The 7 unit test files (admin-item, hud-layout, map-terrain, name-labels, stash-pages, gen-build, server) never ran in npm run check, and gen-build's test was already failing (it pinned build_rp 2.1.7 / stash_bp 1.6.2 exactly) | `npm run test` (`node --test --test-reporter=dot "tools/**/*.test.mjs"`, about 1 s) in check; the test accepts later versions | XS | fixed c1b5dce |
| 7 | medium | check pipeline | (none) | A new generator, check tool or test added without being in npm run check | `tools/check-pipeline.mjs`: every tools/ script with `--check` and every `check-*.mjs` must be in the check chain, plus the unit tests; also each scenario header must run its own file | XS | fixed f12fa88, 174dc73 |
| 8 | medium | action bar protocol (C18) | 14 functions, see allowlist | setActionBar with no realm:actionbar request first | `tools/check-actionbar.mjs` (function-scope parser plus pack-wide helper detection, 99 call sites); exceptions in `tools/check-actionbar.allow.json` | M | fixed e8eac38 (check); pack violations routed below |
| 9 | medium | script events | refill_bp main.js:106 | Payload built from lore with no split (finding #14 of recent-changes) | `tools/check-events.mjs`: every sent id is `realm:` (287 sends found), list or player-text payloads need a split/cap; allowlist `tools/check-events.allow.json` | S | fixed ba9b624 (check); refill_bp routed to items |
| 10 | medium | suite | examples/maps-cleanup.js, maps-leave.js, rainbow-race.js | Hooks described only in prose, so 3 scenarios always skipped | Hooks as files `tools/test-bds/hooks/maps-rvtest.js`, `rainbow-rvtest.js`; headers are plain recipes; suite runs any `--packs` header with a plain recipe (RECIPES list removed) | S | fixed 09d610c: all 3 pass (74, 47, 52 s); suite now has 0 skipped |
| 11 | medium | suite | examples/saga-untrack.js:4 | Header ran saga-quest-log.js | Header fixed; suite now fails a header that names another file (not just a note) | XS | fixed fabac63, 09d610c |
| 12 | medium | C14 duplicated module | packs/{caravan,npc,saga,wander}_bp/scripts/name-labels.js | 4 identical 332-line copies kept in step by hand | `tools/name-labels-shared.js` + `tools/sync-labels.mjs` (`--check` in npm run check); copies unchanged byte for byte | XS | fixed 1fb0eb6 |
| 13 | medium | ASCII | packs/build_rp/texts/en_US.lang | English lang files are game text but check-ascii read only scripts: build_rp has 31 lines with ❗ – · ⏳ | check-ascii checks every `texts/en_US.lang`; build_rp held at 31 known lines (`LANG_KNOWN`), more fails, fewer warns | XS | fixed 40de975 (check); build_rp lines routed |
| 14 | low | package.json | devDependencies | @minecraft/vanilla-data came only as an unpinned peer (`>=1.20.70`) of @minecraft/server, so a fresh install could check ids against another game version than BDS 1.26.52 | Pinned `@minecraft/vanilla-data` 1.26.52 | XS | fixed 6f215ca |
| 15 | low | hosting notes (recent-changes #16) | publish-packs.mjs | Realm Help / Realm News got "Updated help" / "Release notes" | Default notes name the newest NEWS.md headline when `--pack-notes` doesn't | XS | fixed 017c8232; shared-copy-only packs still need `--pack-notes` (deferred: needs a per-file diff against the last publish) |
| 16 | low | suite | tools/test-bds/suite.mjs | No cheap way to compare packs at several player counts | `suite.mjs --perf 10,40 [--perf-seconds] [--perf-only]`: perf-soak per count, table vs budget, `--json` | S | fixed 09d610c (checked at 4/10 players) |
| 17 | low | harness | tools/test-bds/lib/server.mjs:183 | Two parallel runs that both need a template not yet cached generate it at the same time and copy into the same folder | Lock file or a temp dir and rename | S | deferred: templates are cached on this machine; only hits a fresh cache with --jobs > 1 |
| 18 | low | harness | tools/test-bds/lib/shim.js `sendNow` | Relay parts are 1800-character slices of JSON, and re-escaping can push a part past 2048 | Harmless on BDS (any length arrives); comment added | XS | deferred (no effect) |
| 19 | low | bundle | tools/bundle.mjs LANG merge | Two packs defining the same lang key: the later line wins silently | Warn on duplicate keys with different values | XS | deferred: no duplicates today |
| 20 | low | check-ids scope | tools/check-ids.mjs | Bare ids in plain data lists and regex alternations (`/dead_bush|.../`) aren't checked; particles have no vanilla list (suffix rule plus an 8-name list) | Typed contexts cover most; bedrock-samples particle list could be vendored | M | deferred |
| 21 | low | baseline failure | examples/saga-untrack.js | Fails after the header fix too: it waits for `realm:side` slot `right4`, but #88 moved the tracker into Side HUD's quest segment | Rewrite its `tracker()` for the quest segment | S | deferred: saga-engine track (scenario of saga_bp) |

## Ids in tools/check-ids.allow.json (route to the owning tracks)
- **build_bp (social-world)**: BlockDestroyer.js: chain (now iron_chain), deepslate_lit_redstone_ore (lit_deepslate_redstone_ore), end_gateway, glowing_obsidian, grass (grass_block), lava_cauldron / water_cauldron / powder_snow_cauldron (cauldron), light (light_block_N), nether_portal (portal), nether_quartz_ore (quartz_ore), note_block (noteblock), rooted_dirt (dirt_with_roots), waxed_copper_block (waxed_copper). BlockPlacer.js: the 16 `<color>_bed` (Bedrock has one `bed`), kelp_plant, tall_seagrass. Preview.js: note_block, oak_door (wooden_door), oak_trapdoor (trapdoor). AirBuildMode.js: cave_air, void_air. main.js: `eb:destroy` (a build mode compared with typeId; false positive, fine to keep listed). These are Java names from the Effortless Building port: lists that never match, and special bed handling that never runs.
- **death_bp**: dead_bush, magma_block, cave_air, void_air (the Bedrock names deadbush and magma sit beside them; just dead entries).
- **domt_bp** events.js: rooted_dirt (dirt_with_roots is already in the list).
- **leaves_bp**: leaves, leaves2, log, log2 (pre-1.21 names beside the current ones).
- **relics_bp** main.js:1016: item_frame and glow_item_frame in PROTECTED_TYPES: in Bedrock these are blocks (frame, glow_frame), not entities, so they protect nothing; the frames need a block check where relics break or move things.
- **translucent_bp** entities/player.json: sulfur_cube_archetype is a damage domain in the vanilla copy (false positive; keep).

## Action bar exceptions (tools/check-actionbar.allow.json)
- build_bp (social-world): BlockPlacer placeBlocks, Clipboard executePaste, PlacementQueue startPlacementQueue, UndoRedo performUndo/performRedo, ModifiersUI centerMirrorHere/centerRadialHere, PaletteUI choosePaletteOption, SettingsUI showSettingsPanel: direct setActionBar without `lockActionBar`.
- elytra_bp triggerNosRocket (main.js:297): the "use while gliding" hint skips the request.
- hud_bp (anonymous, main.js:105 and 130) and stats_bp (anonymous main.js:317, clearTicker main.js:290): lowest steady lines that only listen; the `setActionBar("")` clears (HUD turned off, ticker off) can wipe another pack's note that is up at that moment: clear only when `pausedUntil` has passed.
- stash_bp pages.js:45: the default `hooks.bar` that main.js replaces (fine).

## Perf

This track owns no packs, so there is no pack to profile. Harness changes cost nothing measurable: the shim's
sendScriptEvent wrapper is one string test per send. `suite.mjs --perf 4,10 --perf-seconds 20 --perf-only welcome_bp,afk_bp,hud_bp`
(20.1 TPS both): bundle 0.041 / 0.092 ms/tick, hud_bp 0.018 / 0.050, afk_bp 0.016 / 0.026, welcome_bp 0.006 / 0.016.

| pack | ms/tick @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| (none: tools only) | - | - | - | - |

## Scenarios added / changed, before -> after
- `harness-event-limit.js` (new, with `hooks/limit_bp`): old shim FAIL ("only the 2048-character message is reported": no report), new shim PASS (exactly one report, 2048, realm:test_long, limit_bp; 2047 passes).
- `maps-cleanup.js`, `maps-leave.js`, `rainbow-race.js`: skipped -> pass (74 s, 47 s, 52 s) via the scripted hooks.
- `saga-untrack.js`: header fixed; still fails on its own assertion (finding 21, saga-engine).
- npm run check: pass, about 34 s. npm run build: pass, 74 packs.

## DOCS (for the lead)
- CLAUDE.md "Commands" block and docs/WORKING.md finishing order: `npm run check` now also runs check-pipeline,
  check-ids, check-events, check-actionbar, the unit tests (`npm run test`), sync-labels --check, and check-versions
  last. Add: `node tools/check-ids.mjs --list` / `check-events.mjs --list` / `check-actionbar.mjs --list` print every
  finding ignoring the allowlists; fix a listed case together with removing its line; `node tools/sync-labels.mjs`
  after editing `tools/name-labels-shared.js` (never the pack copies).
- CLAUDE.md rule "Version bumps": "`npm run check` fails (check-versions, last step) when a pack's files changed since origin/master without a higher header.version."
- Hosting CLAUDE.md / minecraft/docs/OPERATIONS.md publishing steps: publish-packs now refuses stale help/admin/news catalogs, uncommitted packs/ (`--allow-dirty` to override) and a hosting checkout behind origin/master; Realm Help/News get a default note from the NEWS headline.
- tools/test-bds/README.md is updated (hook recipes, --perf, shim length check).
- NEWS: nothing player-facing.

## Requests for the lead
1. Expect check-versions to fail on every track branch that changed packs until you bump at integration. It is the last step, so every earlier check still runs.
2. When a track fixes an allowlisted id, action bar site or event, remove its line from the matching `tools/check-*.allow.json` (a stale line only warns).
3. Integration order: run help-catalog.mjs / gen-news.mjs after merging, then publish (publish-packs now refuses otherwise).
4. Route the pack findings above: build_bp ids and action bar notes and en_US.lang ASCII (social-world), relics frames (owning track), refill_bp lore payload (items, recent-changes #14), elytra NOS hint, hud_bp/stats_bp empty clears (hud), saga-untrack scenario (saga-engine).

## Phase 2 ideas
1. A CI workflow in mc-packs that runs `npm run check` and a short BDS smoke on every PR (the checks exist; nothing runs them before a merge).
2. A 100-player perf gate: `suite.mjs --perf 10,40,100 --perf-seconds 60` in the finishing steps, failing over budget.
3. Run the harness on the bundle (one script context) as well as on separate packs, to catch C13 canceled-beforeEvents bugs that separate runs hide.
4. Vendor bedrock-samples' particle and sound ids into check-ids, so particles and sounds are checked too.
5. A `tools/release.mjs` that does the whole publish order (merge, catalogs, versions, build, publish, pack-docs, check-site) in one command.

## Review

Reviewer: independent pass on `git diff 3d00c83..40de975` (the track's 17 commits; a4cccca..3d00c83 is the origin/master merge) plus hosting 017c8232. No pack folders, manifests, PACKS.md, README, NEWS or catalogs were touched, so there is no conflict with #86 (stash_bp) or #84 (saga_bp). The rules hold. Negative probes on a temporary afk_bp edit, since reverted: check-versions failed it as unbumped; check-ids flagged `zombified_piglin`, `evoker_fangs` and a typo (it correctly passed Bedrock's `zombie_pigman`, `snow_golem` and `fence_gate`); check-actionbar flagged an unprotected setActionBar; check-events flagged a non-`realm:` id and an unsplit list payload. I confirmed no blockers and no highs.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | package-lock.json:7 | package.json pins @minecraft/vanilla-data 1.26.52, but the lock's root devDependencies didn't list it (the entry stayed a `peer`). `npm ci` still installs it, but the lock was out of step | fixed ece0010 |
| low | tools/check-actionbar.mjs:116 | Any function named like a helper in another file of the same pack counts as protected, and a helper called anywhere in the function counts, even after the setActionBar. Allowlisting `(anonymous)` for all of hud_bp and stats_bp main.js also hides any new anonymous violation in those files | not fixed: best-effort check; tighten to line-scoped allow entries if it misses one |
| low | tools/check-ids.mjs:44 | VANILLA is the union of every id kind, so an item or entity id used as a block (setType("minecraft:creeper")) passes | not fixed: by design; typed per-kind sets are a follow-up |
| low | tools/check-versions.mjs (note claim) | It only catches two branches minting the same version after master is merged in (the content then differs at the same version). That is the integration order, so it works, but the notes oversell it | no change needed |
| low | tools/test-bds/suite.mjs:251 | `--perf` always exits 0, even when a run fails or a pack is over budget | not fixed: a reporting mode; Phase 2 idea 2 covers the gate |
| low | hosting minecraft/tools/publish-packs.mjs:70 | `--dry-run` is also refused on dirty packs/ and when behind origin/master (needs `--allow-dirty`), so it can't preview a work-in-progress build | not fixed: the safe default; mention `--allow-dirty` in OPERATIONS.md |
| low | tools/test-bds/lib/shim.js:53 | The limit counts UTF-16 characters. If a Realm counts bytes, a non-ASCII player name can be under the count and still too long | not fixed: payloads are ASCII apart from player names; no evidence of a byte limit |

Scenario results (`suite.mjs --jobs 2 --filter '^(harness-event-limit|maps-cleanup|maps-leave|rainbow-race|saga-untrack|claims-bundle-taps|rain-roof|title-hold)$' --retry`): harness-event-limit pass (4 s), maps-cleanup pass (72 s), maps-leave pass (62 s), rainbow-race pass (49 s), claims-bundle-taps / rain-roof / title-hold (former RECIPES entries, to check the allowlist removal) pass, saga-untrack fail ("both quests in the box; wrote []", known, deferred to saga-engine, as the notes say). harness-event-limit with the old shim (3d00c83) FAILS ("only the 2048-character message is reported") and passes with the new one: confirmed. npm run check: pass (33 s); npm run build: pass (74 packs). origin/master had nothing new.

## Review (second independent pass)

Scope: `git diff 3d00c83..ece0010` (a4cccca..3d00c83 is the origin/master merge) plus hosting 017c8232. origin/master had nothing new. The diff touches no pack folder except byte-identical name-labels.js copies (now compared with tools/name-labels-shared.js; `cmp` confirms all 4 match). There are no manifest bumps and no edits to PACKS.md, README, NEWS or catalogs, and stash_bp/saga_bp are untouched, so nothing conflicts with #86 or #84. Probes I ran myself: `publish-packs.mjs --dry-run --from <infra worktree>` gets past every new refusal and reports 0 new versions, with nothing written to mc-packs (bundle --list no longer touches news_bp). An untracked file in packs/afk_bp makes it refuse with "uncommitted changes under packs/". check-pipeline finds every tool that has a `"--check"` literal (all 18 tools that parse --check use that literal). No pack uses a `/scriptevent` command, which would bypass the shim's length check. I confirm the first review's findings and found no blockers and no highs, so I made no commits.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | package.json:16 (`test`) | `node --test "tools/**/*.test.mjs"` needs Node 21+ to expand the glob. On Node 20 the pattern is taken as a literal path and npm run check fails at that step. The cloud runs Node 22.22 | not fixed: fine everywhere it runs today; add `"engines": {"node": ">=22"}` if the PC ever runs it |
| low | tools/check-versions.mjs:33 | Uses whatever origin/master the clone last fetched, without fetching. A stale ref only widens the diff, so it never passes a bad bump, but a collision with a version master minted since then shows up only after the merge (first review, row 4) | no change: matches the integration order |
| low | tools/check-events.mjs:96, check-ids.mjs:84, check-actionbar.mjs:21 | The comment strippers are regex-based: `"a // b"` inside a string, or a regex literal with a quote, can blank or desync the rest of a line, so a call there could be missed. Best effort, as the headers say | not fixed: no misses in today's tree (the negative probes in the first review were caught) |
| low | tools/test-bds/lib/shim.js:53 | Only `system.sendScriptEvent` is checked. A `runCommand("scriptevent realm:...")` would bypass it (no pack does that today) | not fixed: no such call |
| (confirmed) | first review rows 1-7 | still accurate | as stated there |

Scenario results (`suite.mjs --jobs 2 --retry --filter '^(claims-bundle-taps|forms|harness-event-limit|maps-cleanup|maps-hunt|maps-leave|rain-roof|rain-seabed|rainbow-race|rook-map-race|saga-world-events|storm-rod-claims|title-hold|saga-untrack)$'`, which is every `--packs` scenario the RECIPES removal affects plus the track's own, 4.1 min): 12 pass, 0 skipped. These pass: harness-event-limit (5 s), maps-cleanup (79 s), maps-leave (66 s), rainbow-race (50 s), claims-bundle-taps, forms, rain-roof, rain-seabed, rook-map-race, saga-world-events, storm-rod-claims, title-hold. These fail, both known: saga-untrack ("both quests in the box; wrote []", deferred to saga-engine) and maps-hunt ("far away the map only says cold / cool / faintly warm"; a baseline failure that social-world fixed in its own branch, f49007d; this branch lacks that fix and infra did not touch maps). npm run check: pass (Versions: 0 of 74 changed since da2149f). npm run build: pass (74 packs).
