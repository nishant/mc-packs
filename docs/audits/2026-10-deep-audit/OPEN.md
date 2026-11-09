Open items only: delete an entry in the PR that finishes it.

# Open items after the October 2026 deep audit

Only work that is not finished. Every DONE, scoped, won't-fix and superseded row, and the earlier narratives, were
deleted; git history keeps them (`git log -p -- docs/audits/2026-10-deep-audit/OPEN.md`). Evidence for the items
below is in `notes/`, `campaign-reports/g3.md`, `phase3-report.md` and `fleet-review/FIXES.md`. Ids (`O1`...) are for
reference in PRs. Performance counts are 10 and 40 players only (owner answer, October 20, 2026).

## Performance

- O1 target MET (listed so nothing contradicts it): the newest perf-report, nishant/mc-packs#203 (validation
  `ee246a1`, CI runner), at 40 players has map_bp 0.954 ms/tick (goal 1) and the whole bundle 2.872 ms summed /
  1.852 as one Realm Bundle (goal 5). check: the same issue lists stash_bp at 0.154 ms/tick at 40 against its 0.15
  budget (one pack, 0.004 over); look at the next perf-report before touching it, and delete this entry once map_bp
  and stash_bp are both within budget on it.
- O3 npc_bp label loop (`updateLabels`, main.js around :1510) costs about 2 ms a sync at 40 players. A per-dimension
  observer list, cached names and helper lookups gave no gain in two A/B rounds (reverted, `1ecf250c`); cap the work
  per entity count or find where the rest of the time goes. elite night load is within run-to-run noise.
- O10 Still to measure and act on only if over budget (10 and 40 players, no profiler): npc_bp label loop (see O3)
  and the build_bp preview floor (about 0.38 ms).
- O79 Optional perf follow-up: the town spot scan still takes minutes on a hillside (town-hillside Village about 7.2
  minutes); a cheaper column lookup on QuickJS would be needed, which jitless node cannot measure. Do it only if the
  owner wants it faster.

## Real-client checks (owner only)

Tracked in `nishant/skills` MANUAL-STEPS.md ("Run the mc-packs real-client checklist"). Steps and results sheet:
[REAL_CLIENT_CHECKLIST.md](REAL_CLIENT_CHECKLIST.md). Delete each entry when its check passes.

- O11 Name label resend timing (1 s / 3 s) on a phone and a PC, then lock the label design with a test.
- O12 Story quest box size and placement (Right 1-3, Middle) with the radar and other boxes.
- O13 One-line Coordinates HUD width with party and stats extras (130-170 characters).
- O14 Tornado funnel doubling for viewers 64+ blocks away.
- O15 Minimap `budgetLevel` low, normal and high while walking, flying and at a crowded spawn (checklist A4).
- O16 Saga nameplate rendering (code done `98012e88`): spectators excluded, labels look right on a real client.

## Tests

- F1 stash_bp "Fill earlier pages" item-loss fix is on master (`4a9e3b85`) and guarded only by the unit test
  `tools/stash-pages.test.mjs`. Still to write: `tools/test-bds/examples/stash-fill-locked.js` (header with its run
  command): a `lock_in_slot` stack on the shown page plus movable stacks, run Fill earlier pages, assert the locked
  stack keeps its amount, lock and slot and every page's census is unchanged; prove it fails on `4a9e3b85^`.

## Backlog (ideas from the audit, not commitments)

saga: siege and escort outcomes as letters, a first-hour newcomer chapter, story places per town, a `{town}` name,
repeatable festivals, `saga_reset` "forget players gone N days". expedition: drop-in, a weekly featured dungeon, a
shell for flat worlds. Townsfolk sets per town; leaderboards "around me" and weekly; a party finder; a storm
leaderboard and title; Death Point despawn countdown and a "help me" waypoint; Minimap detail per player and shared
radar pictures; perf-soak reading `realm:map_debug`; cleanup_bp death points kept across restarts; a "Ride
tornadoes" preference.
