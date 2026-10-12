# Working on the packs (for Claude sessions)

How changes are actually made here, learned from PRs #14-#33 and hosting #45-#63. `CLAUDE.md` has the rules; this file has the order of work, the traps and how to keep a session cheap. Read the part you need, not the whole file.

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
7. PR to the default branch, **`ccr-a6a7a26a-bw0003`** (not `master`), merged with a merge commit; then the hosting steps in CLAUDE.md.

## Big features: subagents and worktrees

- The lead writes one short brief per track, plus a shared common brief (the rules that matter for the task, not all of CLAUDE.md), and gives each subagent its own worktree (`git worktree add`, symlink `node_modules`).
- Subagents own only their pack folders. The lead alone edits `docs/PACKS.md`, `README.md`, `docs/NEWS.md`, `tools/` and the generated catalogs, then regenerates once after merging (`git merge --no-ff`).
- Reviewers get a pack list, `git diff <base>..HEAD -- packs/<x>`, a findings cap and the brief, never the whole repo. Run them in parallel, one per area, and read only their summaries.
- Run cross-pack checks in the integration review: the action bar protocol, `realm:` ids, dimension ids, the safe zones copies.

## Known API quirks (Bedrock 1.26, `@minecraft/server` 2.1.0)

- `weatherChange` reports `dimension` as `"overworld"`, without the `minecraft:` prefix other events use. Accept both (four packs were fixed one by one).
- Check every entity, block and item id against `@minecraft/vanilla-data` (installed with `@minecraft/server`), e.g. `node -e "import('@minecraft/vanilla-data').then(v=>console.log(v.MinecraftEntityTypes.EvocationIllager))"`. Evokers are `minecraft:evocation_illager` and oak gates `minecraft:fence_gate`; wrong guesses broke story Act II and Skills XP. `check-stories` checks story ids, but nothing checks the other packs.
- A tool whose stdout is JSON prints its progress to stderr (`bundle.mjs --list --json`).

## Keeping a session cheap

One big feature session cost about $177 at API rates: 572M tokens, of which 561M (98%) were cache reads and only 320K output. The cost is the context being re-read on every turn, not the writing. So:

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
