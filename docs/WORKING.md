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

1. Code, PACKS.md and README together; bump every changed pack's `header.version` (`sky_rp`'s lives in `tools/gen-sky/gen.mjs`; `help_bp` and `news_bp` are bumped by their generators).
2. `docs/NEWS.md` entry if players notice.
3. **Last, after every doc edit:** `node tools/help-catalog.mjs` and, if commands changed, `node tools/admin-catalog.mjs` plus an `admin_bp` bump. `help_bp` was published with a stale catalog twice (#20, #24) because docs changed after it.
4. `npm run check 2>&1 | tail -30` (it stops at the first failing step, so rerun after each fix) and `npm run build 2>&1 | tail -3`.
5. Game behavior: `node tools/test-bds/run.mjs --quiet --only <packs> --scenario <file>`.
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
- Check every entity, block and item id against `@minecraft/vanilla-data` (installed with `@minecraft/server`), e.g. `node -e "import('@minecraft/vanilla-data').then(v=>console.log(v.MinecraftEntityTypes.EvocationIllager))"`. Evokers are `minecraft:evocation_illager` and oak gates `minecraft:fence_gate`; wrong guesses broke story Act II and Skills XP. `check-stories` checks story ids, but nothing checks the other packs.
- A tool whose stdout is JSON prints its progress to stderr (`bundle.mjs --list --json`).
- `scoreboard.getScore(player)` throws `Failed to resolve identity` for a player with no score on any objective (a brand-new player). Read scores through a try/catch helper (`crownsOf`, `repOf`); Guilds lost every new player's rep to this.
- A tamed mob loses `minecraft:tameable`, so `getComponent("minecraft:tameable")?.isTamed` never matches a pet; use `minecraft:is_tamed`.
- Dynamic properties are per pack: a property one pack writes is invisible to every other pack (and to the test pack). Packs may only share state through tags, scoreboards and script events.
- `entityDie` never fires for `minecraft:npc` on BDS 1.26 (only `entityRemove`, which also fires on chunk unload).
- `getBlockBelow` skips water unless `includeLiquidBlocks: true`; an operator flying over the sea gets the sea floor.
- A canceled `beforeEvents` event (a block tap Land Claims refused) is no longer delivered to packs loaded after the one that canceled it, but later subscribers in the same pack still get it. On the Realm everything is one bundle, so every tap handler must return when `event.cancel` is already set (harvest, stash, storm do); a harness run with separate packs hides the bug (`storm-rod-claims.js` shows how to build a two-pack mini bundle). A pack loaded before `claims_bp` never sees the cancel and must ask (`realm:access_check`).
- `getTopmostBlock` skips water: with water over stone it returns the stone (checked on BDS 1.26), so a lake or sea bed looks like dry ground. Look at the block above it before putting anything on the "surface" (`waterOver()` in calendar_bp, `dryGround()` in rain_bp).
- `getTopmostBlock` on a column that isn't ticking can return a block (at y 319) that throws `LocationInUnloadedChunkError` as soon as you read it (`isLiquid`, `typeId`): wrap the reads too, not only the call (wander_bp's spot finder).

## Audit pass (PR #38: every pack once; what mattered)

One audit agent per group, in its own worktree, with a findings cap and the rule that it edits only its packs; one reviewer per diff (diff only, findings cap); one integration review of the merged tree; a baseline suite run before and after. Groups that worked: `saga_bp` engine and `saga_bp` story content apart, `expedition_bp`, `build_bp`, `admin_bp`+`settings_bp`+`help_bp` (the menu pass), the Realm Configuration categories (`admin_bp/scripts/presets.js`, world and utilities split in two), the six resource packs with their generators. The bar for a change and the checklist are in the PR; the short version:

- Bugs with a trigger: a player leaves, dies, changes dimension or is in another chunk mid-operation (forms, timers, teleports, jobs); `isValid` after every await; `UserBusy` retried, `UserClosed` stops; command parameters at their limits; saved data under 32 KB with append-only lists bounded; ids against `@minecraft/vanilla-data`.
- Performance only when measured (`Date.now()` in a scratch copy, 8-10 simulated players): the wins were per-player work done for everyone on one tick (rainbow, blood moon, stats ticker), outlines or layouts recomputed per look or per refresh (zones, build guides), and list scans per block (creeper guard). Nothing under 1 ms a tick was worth a change.
- QoL that counts: a confirmation before anything irreversible or realm-wide, a reply where a command did nothing silently, the admin list coming back after a command.
- Every behavior fix got a scenario that fails before and passes after (40 new ones in `tools/test-bds/examples/`, named `<pack>-<topic>.js`, run command in the header). Five scenarios need a hook copy of a pack (`maps-cleanup`, `maps-leave`, `rainbow-race`, `title-hold`, `maps-hunt`): the header says how to make it.
- Harness limits met: simulated players stand still, so a mob's melee AI can park just out of reach: reset positions before checking for attacks (`platypus.js`); simulated players load no chunks (removing a ticking area before teleporting looks like the player leaving); their empty-hand taps and `interactWithBlock` on containers fire no interact events; a rejoin gives a new `player.id`, so per-id saved data can't be tested across a leave; `spawnParticle` isn't relayed. Two parallel runs on 4 cores make timing-sensitive scenarios flaky: give them `--timeout` headroom and `since` on waits.

Open items: none known. Fixed in the October review: the flaky `platypus.js` and `wander-walk.js` scenarios (scenario timing, not pack bugs), `realm:actionbar` without `from` (every pack sends it now), Quick Stack and Chest Finder against claims and locks (`realm:access_check`), steady action bar lines holding each other off (they send a rank, `steady`), story spots on sea beds, defense waves timing out, the Field Journal's 40-entry pages.

## Keeping a session cheap

One big feature session cost about $177 at API rates: 572M tokens, of which 561M (98%) were cache reads and only 320K output. The cost is the context being re-read on every turn, not the writing. The audit session hit the account's rate limit three times by running 9-19 agents at once; three at a time, committing after every fix, was sustainable. So:

- **Keep the main conversation small.** Delegate any wide read (an audit, a review, a search across packs) to a subagent that returns a short report. Its reads die with it; the lead's are re-read on every later turn.
- **Read sections, never whole files.** Find them with `grep -n '^## ' docs/PACKS.md` or `grep -n`, then `sed -n a,bp`.

  | File | Size | How to read it |
  |---|---|---|
  | `docs/PACKS.md` | 646 KB (about 160K tokens) | one `## ` section; the largest are Expeditions 35 KB, Story 28 KB, Kitchen 21 KB |
  | `packs/expedition_bp/scripts/main.js` | 155 KB | grep for the function |
  | `packs/saga_bp/scripts/stories/` | 612 KB, side quests 88-94 KB each | one chapter by id |
  | `packs/help_bp/scripts/catalog.js`, `admin_bp/scripts/catalog.js` | 172 KB, 31 KB | generated: never open, use `--check` |
  | hosting `site/realm/index.html` | 875 KB | generated: never open, use `pack-docs.mjs --check` |
  | hosting `site/catalog.json`, `site/packs/packs.json` | 184 KB, 166 KB | `grep` a slug; for the newest pack read the top entry only |

- **Trim output:** `| tail`, `--quiet`, and `fields`/`minimal_output` on GitHub list calls.
- **Split sessions at PR boundaries.** The three long sessions each covered 4-7 PRs. When a PR merges, put what's left (versions bumped, what still needs publishing) in its body and start the next piece of work in a new session that reads it, instead of carrying the whole build history.
- Stop-hook "checkpoint" commits (21 here, 10 in hosting) mean a turn ran too long: give that work to subagents next time.
