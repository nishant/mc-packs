# Working on the packs (for Claude sessions)

How changes are actually made here, learned from PRs #14-#38 and hosting #45-#68. `CLAUDE.md` has the rules; this file has the order of work, the traps and how to keep a session cheap. Read the part you need, not the whole file.

## Flows

| Change | What it touches (in one commit unless noted) |
|---|---|
| Fix in one pack | its code, `manifest.json` bump, its `docs/PACKS.md` section, the README row if the summary or commands changed, a `docs/NEWS.md` entry if players notice, then the help/admin catalogs |
| New pack | `packs/<folder>/` with the `realm:help_ping` responder, a PACKS.md section, a README row, "How the packs work together" if it talks to other packs, catalogs, NEWS |
| Generated resource pack (`rain_rp`, `sky_rp`, `translucent_rp`) | the generator in `tools/gen-*`, then rerun it; the diff is mostly output. Rain renders and clips go in `docs/media/` |
| Big feature (many packs) | one session branch, briefs, subagents in worktrees (below), one integration review, then one publish |
| Publish (hosting) | `site/packs/packs.json`, `site/realm/index.html` and the new `.mcpack` files, always one commit (see CLAUDE.md step 2) |

Over the last 20 PRs, `docs/PACKS.md` changed in 19, a manifest in 16, the help catalog in 11 and the README in 11: expect all four.

## Finishing order (the steps that went wrong before)

1. Code, PACKS.md and README together; bump every changed pack's `header.version` (`sky_rp`'s lives in `tools/gen-sky/gen.mjs`; `help_bp` and `news_bp` are bumped by their generators), then `node tools/sync-diag.mjs`: every behavior pack's `scripts/diag.js` carries its version, so `npm run check` fails after any bump until you do (the two generators run it for their own packs).
2. `docs/NEWS.md` entry if players notice.
3. **Last, after every doc edit:** `node tools/help-catalog.mjs` and, if commands changed, `node tools/admin-catalog.mjs` plus an `admin_bp` bump. `help_bp` was published with a stale catalog twice (#20, #24) because docs changed after it.
4. `npm run check 2>&1 | tail -30` (it stops at the first failing step, so rerun after each fix; `check-versions` runs last and fails on any pack changed since `origin/master` without a higher version) and `npm run build 2>&1 | tail -3`. `npm run test` runs the unit tests alone (about 1 s).
5. Game behavior: `node tools/test-bds/run.mjs --quiet --only <packs> --scenario <file>`, or every scenario touching your packs with `node tools/test-bds/suite.mjs --filter '<regex>' --retry`. First, `node tools/test-bds/suite.mjs --prepare-only` stages every header recipe offline; Windows needs Git for Windows' bash (`BDS_HARNESS_BASH`). Run the genuine one-context bundle too (`--bundle dist/realm_bundle.mcpack`, `bundle-smoke.js`), because separate packs hide C13 and shared-store bugs; CI runs this smoke after check/build. Anything that can cost per tick: profile it (Performance, below). A perf result counts only when the profile JSON's `acceptance.ok` is true: every declared player spawned and stayed for the full window. Keep invalid observations and their valid retries separately.
6. **Review before the first publish, not after.** #30 shipped 25 packs and #31 then fixed 46; #32 published 47 versions and #33 republished 25 the same day. One integration pass before publishing saves a whole publish cycle.
7. PR to the default branch, **`master`**, merged with a merge commit; then the hosting steps in CLAUDE.md.
8. In hosting, check only what changed: `node tools/check-site.mjs realm` after a publish takes seconds, while a full run loads about 1,100 pages (436 with a 3D build engine rendered on the CPU). A full run is only for site changes (`site/assets/`, header, footer, hub, catalog, templates); it uses every CPU core (`--jobs N`). To wait for a background run, wait on its task; don't loop on `pgrep -f "<name>"`, which matches the loop's own command line and never ends.

## Big features: subagents and worktrees

- The lead writes one short brief per track, plus a shared common brief (the rules that matter for the task, not all of CLAUDE.md), and gives each subagent its own worktree (`git worktree add`, symlink `node_modules`).
- Subagents own only their pack folders. The lead alone edits `docs/PACKS.md`, `README.md`, `docs/NEWS.md`, `tools/` and the generated catalogs, then regenerates once after merging (`git merge --no-ff`).
- Reviewers get a pack list, `git diff <base>..HEAD -- packs/<x>`, a findings cap and the brief, never the whole repo. Run them in parallel, one per area, and read only their summaries.
- Run cross-pack checks in the integration review: the action bar protocol, `realm:` ids, dimension ids, the safe zones copies.

## Known API quirks (Bedrock 1.26, `@minecraft/server` 2.1.0)

- `weatherChange` reports `dimension` as `"overworld"`, without the `minecraft:` prefix other events use. Accept both (four packs were fixed one by one).
- Check every entity, block and item id against `@minecraft/vanilla-data` (pinned in `package.json` to the game version the test server runs), e.g. `node -e "import('@minecraft/vanilla-data').then(v=>console.log(v.MinecraftEntityTypes.EvocationIllager))"`. Evokers are `minecraft:evocation_illager` and oak gates `minecraft:fence_gate`; wrong guesses broke story Act II and Skills XP. `tools/check-ids.mjs` (in `npm run check`) checks typed uses against the matching kind, not the union of all ids. Particle and sound ids also use the pinned, attributed identifiers in `tools/vanilla-ids/`; update them with `tools/update-vanilla-ids.mjs` from a matching local Mojang samples checkout, never by fetching during a check.
- In a bundle every native script event listener wakes on every event in its namespace. Use `onScriptEvent` / `offScriptEvent` from the pack's generated `script-events.js`, never a direct subscription: one native `realm` listener per pack dispatches by id. Change `tools/events-shared.js`, then `node tools/sync-events.mjs`; the diagnostics carrier and per-pack timing stay on that native callback.
- A tool whose stdout is JSON prints its progress to stderr (`bundle.mjs --list --json`).
- Flat templates pin the world spawn to 0,-60,0; a ready marker and exclusive template lock prevent a cold-cache `--jobs 2` race. `template-race.mjs --real --workers 2` checks real generation, separately from its offline race. Use `node tools/release.mjs plan` to inspect the ship order; executing phases require native/review receipts and never upload to the Realm.
- `scoreboard.getScore(player)` throws `Failed to resolve identity` for a player with no score on any objective (a brand-new player). Read scores through a try/catch helper (`crownsOf`, `repOf`); Guilds lost every new player's rep to this.
- A tamed mob loses `minecraft:tameable`, so `getComponent("minecraft:tameable")?.isTamed` never matches a pet; use `minecraft:is_tamed`.
- Dynamic properties are per add-on: a property one pack writes is invisible to every other pack installed separately (and to the test pack). Packs may only share state through tags, scoreboards and script events. **In the Realm Bundle all 67 behavior packs are one add-on with one store**, so each pack must keep to its own key prefix (`news:...`; no two packs share one; a pack's `settings.js` `PREFIX` is also what `tools/lib/diag-sync.mjs` writes into its `diag.js` so an untouched key still has an owner when forgotten, C14), `world.clearDynamicProperties()` there wipes every pack's data (diag.js deletes only the pack's own keys instead), and `getDynamicPropertyTotalByteCount()` is the whole bundle's. Switching between the bundle and single packs starts every pack's saved data over.
- `world.structureManager.place(..., { includeEntities: true })` in the Nether or the End puts the structure's entities into the **Overworld** at the same coordinates (seen on BDS 1.26 whenever a player who spawned in that dimension is near and the Overworld chunk is loaded). Stash pages leaked item copies this way, and expedition carts and townsfolk skins landed in the wrong dimension. Load structures with entities through the dimension's command instead: `dimension.runCommand('structure load "<id>" x y z 0_degrees none true false')` (entities yes, blocks no; stash_bp `page-store.js`, expedition `gauntlet.js`).
- A saved dynamic property can't be read before `world.afterEvents.worldLoad`: read settings at load for the default, then again on `worldLoad` (the Minimap's `budgetLevel`).
- `system.beforeEvents.startup` fires after **every** module of the add-on has run, so in a bundle it runs after the last pack's top-level code; anything that tracks "the pack being evaluated" must reset there.
- BDS 1.26 delivers script events of any length (2049, 4000 and 40,000 characters arrive intact), so a message over 2048 passes on a dedicated server and may fail elsewhere. The test harness shim fails a run on a `realm:` message of 2048 or more; `tools/check-events.mjs` checks the senders.
- Stack frames in a bundle read `<folder>/main.js:130` (`scripts/<folder>/...`), which is how diag.js tells packs apart without per-call bookkeeping.
- Costs measured on BDS (no profiler): one native call about 10 us, `world.getAllPlayers()` 4 us at 1 player and 10.5 us at 40, `player.id` 0.2 us, inventory `getItem` 1.8 us, a plain function wrapper 0.16 us (a rest/apply wrapper 0.45 us). Player handles are the same JS object across ticks (usable in a WeakSet). The only clock is `Date.now()` (whole ms).
- `entity.typeId` always has the namespace (`minecraft:zombie`): normalize ids from `config.js` before comparing (`zombie` and `minecraft:zombie`).
- Do not rely on `entityDie` for simulated players: some death methods do not emit it. Check health to tell a death, and record which native lifecycle events actually fired rather than assuming either result.
- `entityDie` never fires for `minecraft:npc` on BDS 1.26 (only `entityRemove`, which also fires on chunk unload).
- `getBlockBelow` skips water unless `includeLiquidBlocks: true`; an operator flying over the sea gets the sea floor.
- A canceled `beforeEvents` event (a block tap Land Claims refused) is no longer delivered to packs loaded after the one that canceled it, but later subscribers in the same pack still get it. On the Realm everything is one bundle, so every tap handler must return when `event.cancel` is already set (harvest, stash, storm do); a harness run with separate packs hides the bug (`storm-rod-claims.js` shows how to build a two-pack mini bundle). A pack loaded before `claims_bp` never sees the cancel and must ask (`realm:access_check`).
- `getTopmostBlock` skips water: with water over stone it returns the stone (checked on BDS 1.26), so a lake or sea bed looks like dry ground. Look at the block above it before putting anything on the "surface" (`waterOver()` in calendar_bp, `dryGround()` in rain_bp).
- `world.beforeEvents.effectAdd`'s `effectType` is the effect's display name with its level (`Invisibility`, `Resistance V`, `Poison`), not its id: normalize before comparing (`toLowerCase()`, strip `minecraft:` and a trailing roman numeral). The Fen Charm never blocked Poison until relics_bp 1.2.5 for this.
- `ActionFormData`/`ModalFormData` `.header()` renders in a huge font (a pack title in "My preferences" filled the menu's width and wrapped). Section titles are `.label("§l§6Title")`; both take a slot in `formValues` the same way, so the swap keeps indexes. `check-ascii` rejects `.header(`. Keep game text at the normal size everywhere else too: no `§l` on long body text, titles short enough for one line.
- The BDS form shim has its own 1,200-tick fallback, separate from the test pack's `t.formTimeout`. Raising `t.formTimeout` does not extend it. A hung-form regression must prove the pack releases its own operation before that fallback, not accept the shim eventually closing it. Keep one lifecycle generation across the whole menu and its child dialogs; starting a fresh snapshot at each `show()` lets an old parent reopen after death or a dimension change.
- Bedrock circle ticking areas accept radii 1-4, not 6. The harness rejects invalid radii before sending the command and reports a rejected add immediately unless the column is already readable. Use a legal radius and explicit fixture readiness, and retain the original command failure instead of calling it a pack regression.
- `getTopmostBlock` on a column that isn't ticking can return a block (at y 319) that throws `LocationInUnloadedChunkError` as soon as you read it (`isLiquid`, `typeId`): wrap the reads too, not only the call (wander_bp's spot finder).

## Recurring bugs: the checklist (C1-C29)

From two weeks of history (728 commits, 161 of them fixes): the same classes came back pack after pack. Apply every row to every pack you touch; most have a check in `npm run check` now (ids, events, action bar, ASCII, sync copies, versions).

| # | Class | Grep for | Correct pattern |
|---|---|---|---|
| C1 | HUD / JSON UI sizes | `"size"`, `"offset"`, `$cell` aliases in `hud_screen.json` | Literal sizes measured on a real client with a sizing diagnostic, pinned by `tools/hud-layout.test.mjs` |
| C2 | Nameplates | `nameTag =` on `minecraft:npc` or villagers, `*_label.json` | One shared module (`tools/name-labels-shared.js`, `sync-labels`), checked on a client; removing an entity definition needs a cleanup of entities already in worlds |
| C3 | Item persistence | `JSON.stringify` of items, `getLore`, `setDynamicProperty(.*page` | World structure snapshots (`StructureSaveMode.World`), verified before the live slots change, one committed index |
| C4 | Recognizing a pack item | `nameTag ===`, `getLore().includes` | Accept current and legacy marks; dedupe to one item |
| C5 | Re-entrant inventory handlers | handlers that write to the inventory they watch | A per-player "updating" set and one coalesced `system.run` reconcile |
| C6 | `spawnEntity` result | `spawnEntity(` | Check `e.typeId === type` (retry or fail), tag only after |
| C7 | Stale generated packs | (process) | `help-catalog`, `admin-catalog`, `gen-news` last, after merging master; `publish-packs` refuses stale catalogs and versions already on master |
| C8 | Sound volume | new or retuned sounds | A written dB target against a vanilla sound, plus a hash and volume lock in `npm run check` |
| C9 | Cursor and button slots | writes to cursor or reserved slots | Never overwrite a real item: move it, or leave it and tell the player |
| C10 | Form headers | `\.header\(` | `.label("§l§6Title")` (`check-ascii` fails on `.header(`) |
| C11 | Dimension ids | `weatherChange`, `dimension ===` | `id.replace(/^minecraft:/, "")` before comparing |
| C12 | Scores | `\.getScore\(` | A try/catch helper that returns 0 |
| C13 | Canceled `beforeEvents` in the bundle | `beforeEvents\.(playerInteractWithBlock\|playerBreakBlock\|itemUse\|playerInteractWithEntity)` | First line `if (ev.cancel) return;`; a pack loaded before claims asks `realm:access_check` |
| C14 | Duplicated modules | `md5sum packs/*/scripts/<file>` | A `tools/*-shared.js` with a `sync-*.mjs` and its `--check` |
| C15 | Water | `getTopmostBlock`, `getBlockBelow` | Check the block above for water (`waterOver`, `dryGround`); `includeLiquidBlocks: true` |
| C16 | Unloaded chunks | `getTopmostBlock`, `getBlock(` | try/catch around the call **and** the reads (`typeId`, `isLiquid`); y 319 or undefined means not loaded: retry later, never drop the job; spawning far away needs a ticking area |
| C17 | Leave, death, dimension change mid-operation | `await`, `runTimeout`, `form.show` | Validity, health and an owned lifecycle generation after every await and timeout, spanning parent/child dialogs; leave/death/respawn/dimension cleanup; old callbacks cannot clear a newer lock; `UserBusy` retried, `UserClosed` stops |
| C18 | Action bar and titles | `setActionBar`, `setTitle` | `realm:actionbar {player, ticks, from}` first (with `steady` and a rank for redrawn lines), `realm:title` before titles, a one-space subtitle (`check-actionbar`) |
| C19 | Giving items | `addItem(`, `spawnItem(` | Use the returned leftover exactly once (drop only it); rewards that cross a restart are persisted |
| C20 | Ids | `"minecraft:` literals, `effectAdd` | `@minecraft/vanilla-data` (`check-ids`); normalize `effectAdd`'s display name |
| C21 | Per-tick cost | `runInterval` with `getAllPlayers()` inside | Stagger players over ticks (by a hash of `player.id`, not the list index), share per-second work, cache geometry, time budgets for the heavy packs; measure first |
| C22 | Saved data size | `setDynamicProperty(` with `JSON.stringify` | Under 32 KB; bound every append-only list (drop the oldest), never refuse silently; plan for 1,000+ one-time players |
| C23 | Restarts | any `Map` or `Set` of pending work | Persist it; on world load clean up and resume |
| C24 | Operators | op checks | Permission level 1+ (never tags), checked server side when the form opens **and** on submit |
| C25 | Ownership | choosing by proximity, type or name | A unique tag or hidden marker per pack |
| C26 | Pets | `tameable` | `minecraft:is_tamed`, not `tameable.isTamed` |
| C27 | Time | `Date.now()` for durations | In-game durations in game ticks or time of day |
| C28 | Process | (process) | Integration review before the first publish; before/after for visual and perf changes; a BDS scenario that fails before the fix |
| C29 | Script event listeners | `scriptEventReceive.subscribe` | `onScriptEvent` / `offScriptEvent` from the pack's `script-events.js`; one native listener per pack, canonical source and copies checked by `sync-events --check` |

## Audit pass (October 2026: every pack for public servers)

Everything this audit left open (75 items in 13 task groups, plus owner decisions and a backlog) is in `docs/audits/2026-10-deep-audit/OPEN.md`, with the findings tables, triage, baseline and soak reports beside it. Start follow-up work there, and mark items done in it as they ship.

The second full audit (after PR #38) judged everything against a public release: servers with 30 to 100+ players, strangers installing from the docs, worlds with no town. It found 5 blockers, 26 highs, 74 mediums and 125 lows; every blocker and high was fixed, and the deferred rest is triaged into docs-only, cheap fixes, follow-up tasks and won't-fix.

- **Tracks** (one agent each, owning only its packs): infra (tools and the harness), saga engine, saga content, expedition, HUD (Minimap, Coordinates HUD, Side HUD), entities (townsfolk, caravan, wanderers, towns, champions, mobs), items (stash, refill, relics, chest finder, claims, cooking...), menus (admin, settings, help, news, welcome, nicknames, titles), weather and sky, and social split in two (progress: crowns, guilds, bounties, mail, parties, quests, goals, milestones, stats, skills; world: building, zones, cleanup, waystones, atlas, maps, the rest). Then two feature tracks (diagnostics and server setup, town news), a cheap-fixes track for the deferred list, and a docs pass.
- **Method:** a baseline first (the whole suite and a 10 and 40 player profile, before anything changed); a common brief (goal, rules, the C1-C29 checklist, the budget) plus a short brief per track; one `git worktree` per track on its own branch with `node_modules` symlinked; commit every fix separately; never push from a track. Each track writes a notes file (findings table with severity and status, perf before/after, scenarios, exact doc text for the lead, requests); then an independent reviewer per track reads only the diff and the notes, fixes what it confirms, and adds a Review section.
- **Master moves during an audit.** Merge `origin/master` into every running track (`git fetch -q origin && git merge --no-edit origin/master`) at its start, before its final checks and before it returns; merge, never rebase; and review what came in with the same checklist ("(new)" findings). Open PRs from other contributors get a "don't touch these hunks" line in the brief.
- **Only the lead edits** PACKS.md, README, NEWS, WORKING.md, shared `tools/` files and the generated catalogs, and bumps each changed pack once at integration (then `sync-diag`, `help-catalog`, `admin-catalog`, `gen-news`, last).
- **Suite runner:** `node tools/test-bds/suite.mjs --jobs 2 --retry [--filter '<regex>'] [--json <out>]` runs every scenario with the command in its own header (about an hour for all of them; pass, fail, flaky, timeout, skipped). Headers that need a hook copy of a pack give a shell recipe (`tools/test-bds/hooks/`), which the suite runs first. `--perf 10,40 [--perf-seconds 120] [--perf-only a_bp,b_bp]` runs the perf soak per player count against the budget.
- **Profiler:** `node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json <out> --only <packs> --scenario tools/test-bds/examples/perf-soak.js --arg players=40 --arg seconds=120 --timeout 3000`: ms per tick per pack, the top callbacks with file and line, writes per tick, server TPS. Two runs share 4 cores: keep them short and `--only` your packs. In game, `/realm:diag` measures the same thing per pack on any server.
- **The budget:** the whole bundle under 5 ms a tick at 40 players, a typical pack 0.15 ms or less, the heaviest (Minimap, HUDs) 1 ms or less. Before: 45 ms a tick at 10 players (11.6 TPS), 135 ms at 40 (5.2 TPS). After: 6.4 ms at 10 (19.8 TPS), 6.2 to 9.5 ms at 40 (18.4 to 19.4 TPS), the Minimap 2.3 to 3.8 ms of it. Not reached yet: the bundle total and the Minimap.

Lessons:

- **One engine bug can look like many pack bugs.** The stash's Nether errors, stray expedition carts and townsfolk skins in the wrong dimension were all `structureManager.place` (above). When two packs fail the same way, look for the API under both.
- **The bundle is the product; the harness runs packs separately.** Shared saved data, startup order, canceled before-events and stack attribution only show in one context: build a mini bundle for those tests (`tools/test-bds/hooks/diag-bundle.mjs`, `storm-rod-claims.js`).
- **Measure, then change, then measure again.** The two biggest wins (the Minimap, 108 -> 3.7 ms at 40, and the side boxes' listener, 2.6 ms per copy) came from the profile's top lines; whole-bundle numbers vary by a third run to run on a shared machine, so compare per-pack lines. A listener every pack adds costs every pack's events: the first diagnostics version added 176 calls a tick until it rode on the packs' existing listeners.
- **Rate-limit at the source.** Gossip, letters and chat that fire per player or per event flood a 100-player world; one per pack per in-game hour plus a consumer cap per kind kept the town's news readable.
- **Turn every rule into a check.** The classes that stopped coming back are the ones `npm run check` now enforces (ids, script event length, action bar requests, ASCII lang files, shared copies, version bumps, every check in the chain).
- **Harness limits** (still true): simulated players stand still unless moved, load no chunks, their empty-hand taps fire no interact events, a rejoin gives a new `player.id`, `spawnParticle` isn't relayed, and `entityDie` is unreliable for them (use health and record native event counters). Two parallel runs make timing-sensitive scenarios flaky: give them `--timeout` headroom and `since` on waits. A scenario per fix must fail before and pass after (`<pack>-<topic>.js`, run command in the header).

## Keeping a session cheap

One big feature session cost about $177 at API rates: 572M tokens, of which 561M (98%) were cache reads and only 320K output. The cost is the context being re-read on every turn, not the writing. The audit session hit the account's rate limit three times by running 9-19 agents at once; three at a time, committing after every fix, was sustainable. So:

- **Keep the main conversation small.** Delegate any wide read (an audit, a review, a search across packs) to a subagent that returns a short report. Its reads die with it; the lead's are re-read on every later turn.
- **Read sections, never whole files.** Find them with `grep -n '^## ' docs/PACKS.md` or `grep -n`, then `sed -n a,bp`.

  | File | Size | How to read it |
  |---|---|---|
  | `docs/PACKS.md` | 1.0 MB (about 250K tokens) | one `## ` section; the largest are Story 66 KB, How the packs work together 55 KB, Expeditions 52 KB, Deck of Many Things 33 KB |
  | `packs/expedition_bp/scripts/main.js` | 201 KB | grep for the function |
  | `packs/saga_bp/scripts/stories/` | 838 KB, the biggest files 88-99 KB each | one chapter by id |
  | `packs/help_bp/scripts/catalog.js`, `admin_bp/scripts/catalog.js` | 240 KB, 37 KB | generated: never open, use `--check` |
  | hosting `site/realm/index.html` | 1.3 MB | generated: never open, use `pack-docs.mjs --check` |
  | hosting `site/catalog.json`, `site/packs/packs.json` | 184 KB, 503 KB | `grep` a slug; for the newest pack read the top entry only |

- **Trim output:** `| tail`, `--quiet`, and `fields`/`minimal_output` on GitHub list calls.
- **Split sessions at PR boundaries.** The three long sessions each covered 4-7 PRs. When a PR merges, put what's left (versions bumped, what still needs publishing) in its body and start the next piece of work in a new session that reads it, instead of carrying the whole build history.
- Stop-hook "checkpoint" commits (21 here, 10 in hosting) mean a turn ran too long: give that work to subagents next time.
