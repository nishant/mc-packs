# Common brief: mc-packs deep audit (every track reads this)

Goal: the packs run today on a 10-player Realm; the end goal is a public release to anyone, including public
servers with 30-100+ players. Judge everything by that: smooth for players, low script cost per tick, nothing
that only works on our world, docs a stranger can install from.

Read first (all in the scratchpad ):
- `brief.md` - what the owner is going for (design intent). Respect it.
- `history.md` - recurring bug classes C1-C28 with grep hints. Apply EVERY checklist item to EVERY pack you own.
- `baseline.md` / `perf-tables.md` - baseline suite (135 pass, 12 fail, 2 flaky, 3 skipped) and per-pack ms/tick
  at 10 and 40 simulated players (40 players: whole bundle 135 ms/tick, 5.2 TPS; map_bp 108 ms; side.js
  scriptEventReceive ~2.6 ms per copy x 6 packs; stash_bp 9 ms at 10 players from pages.js:972).

## Rules for tracks
- **Pull early and often.** `master` moved after the audit started (PRs #88-#91: story quest box, prefs locks,
  refill pages, manifest spacing; side-shared.js, settings-shared.js, hud-layout.test.mjs changed). The lead merged
  it into every worktree; still run `git fetch -q origin && git merge --no-edit origin/master` in your worktree
  when you start, before your final checks, and before you return. Merge, never rebase or overwrite; resolve
  conflicts keeping both sides' intent.
- **The new master changes are in scope.** Audit them as carefully as the old code: in your packs, review
  `git diff 3b00080..origin/master -- <your pack folders and tools you own>` (mc-packs PRs #88-#91; hosting
  #102-#104 for the infra track) against the same checklist, and list their findings in your table marked "(new)".
  A dedicated reviewer already did this pass: read `notes/recent-changes.md` (16 findings, each tagged with the
  owning track; #11 and #12 are build_bp, which belongs to social-world, not menus) and fix or explicitly defer every finding tagged with your track. Track reviewers: if the audit
  track did not handle them, you do.
- Work ONLY in your worktree (path given in your prompt), on its branch. Commit each fix separately (one-line
  message saying what changed and why, no prefixes, American English). Do NOT push, do not open PRs, do not merge.
- Edit ONLY your own pack folders (plus new test scenarios `tools/test-bds/examples/<pack>-<topic>.js` and, if
  your prompt says so, specific tools/ files). The lead alone edits docs/PACKS.md, README.md, docs/NEWS.md,
  docs/WORKING.md, other tools/ files and the generated catalogs (help_bp/scripts/catalog.js,
  admin_bp/scripts/catalog.js, news_bp release). If a fix needs one of those, describe it in your notes file.
- Do NOT bump manifest versions; the lead bumps every changed pack once at integration.
- Never revert or overwrite the second contributor's (msftMyt) work. Two of their PRs are open and must not be
  conflicted with: #86 (stash_bp pages.js/main.js/config.js "Fill earlier inventory pages without sorting") and
  #84 (saga_bp/scripts/objectives.js outline particle bindings). Avoid editing those regions; if you must touch
  those files, keep changes minimal and away from the PR's hunks (`git diff origin/master...origin/msftmyt-inventory-page-filling`).
- Stable APIs only (@minecraft/server 2.1.0, server-ui 2.0.0). Game text plain ASCII. No imports between packs.
  `realm:` namespace for commands and script events, messages < 2048 chars. Send `realm:actionbar` before every
  setActionBar. Never `.header()` in forms. Check ids against @minecraft/vanilla-data.
- Shared copies (`settings.js`, `zones.js`, `side.js`) are synced from tools/*-shared.js: never edit a pack's copy;
  report needed changes (only the HUD track may edit tools/side-shared.js and run tools/sync-side.mjs).
- Keep saved data backwards compatible (existing worlds must keep their data; published store keys stay).

## Per pack, check
1. Bugs with a trigger: player leaves / dies / changes dimension / is in an unloaded chunk mid-operation;
   isValid after every await and timeout; UserBusy retry, UserClosed stop; command parameters at their limits;
   saved data < 32 KB with every list bounded; wrong ids; races between two players on the same thing.
2. Every recurring class C1-C28.
3. Performance at scale. Profile your packs at 10 AND 40 simulated players:
   `node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json <out> --only <your packs + deps> --scenario tools/test-bds/examples/perf-soak.js --arg players=40 --arg seconds=120 --timeout 3000`
   (two tracks share 4 cores: keep runs short, `--only` your packs). Budget: whole bundle < 5 ms/tick average
   at 40 players, so a typical pack <= 0.15 ms/tick and the heaviest (map_bp, hud) <= 1 ms. Report every pack
   against it. Look for per-player O(n^2) work, scans per block, intervals that should be event-driven, redraws
   that could be diffed, dynamic property writes per tick. Change performance only when the measurement says so,
   and re-measure after.
4. Portability for public release: hardcoded coordinates, town/house layouts, player names, our URLs,
   Realm-only assumptions, the operator check (permission level vs tags), a brand-new world (no town, no NPCs,
   no story progress), Nether and End, world height -64..320, every pack can be turned off cleanly, a way to
   remove a pack's saved data.
5. QoL: a reply wherever a command does nothing silently; confirmation before anything irreversible or
   realm-wide; first-run guidance; consistent menu style; settings named for what they do; plain ASCII.
6. Docs accuracy: every default, command, option and saved data key in your packs' docs/PACKS.md sections
   (read one `## ` section at a time: `grep -n '^## ' docs/PACKS.md`, then sed -n) and README rows match the code.
   Write the needed corrections in your notes file; do not edit PACKS.md.
7. Tests: every behavior fix gets a scenario `tools/test-bds/examples/<pack>-<topic>.js` (run command in its
   header) that fails before the fix and passes after. Also fix or explain baseline failures in your packs.
   Before finishing: `npm run check 2>&1 | tail -30` and `npm run build 2>&1 | tail -3` pass in your worktree
   (catalog --check failures caused only by doc/catalog regeneration are expected; say which), and every
   scenario touching your packs passes (`node tools/test-bds/suite.mjs --filter '<regex>' --retry`).

## Severity
blocker (item loss/dupe, crash, data loss, server-killing cost), high (broken feature, wrong behavior many
players hit, big perf), medium (edge case, QoL gap, doc wrong), low (polish). Findings cap ~25 per track;
fix all blockers and highs, mediums where cheap; defer the rest with a reason.

## Notes file (required)
Write `notes/<track>.md` containing:
- findings table: severity | pack | file:line | trigger | fix | effort | status (fixed <sha> / deferred: reason)
- perf table: pack | ms/tick @10 before | @40 before | @10 after | @40 after
- scenarios added and their before/after result
- DOCS: exact corrections for docs/PACKS.md (section, what to change, new text for Commands rows written for
  players with defaults) and README rows; NEWS: one-line player-facing entries (plain ASCII)
- requests for the lead (tools/, shared copies, cross-pack protocol changes)
- Phase 2 ideas (features that fill gaps or enable public release), max 5
