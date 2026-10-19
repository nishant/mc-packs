# Phase 3 recheck (audit/integration)

Head: 24f1b54 (015d98c plus one scenario commit). No pack files changed, no versions bumped.

## Suite
`node tools/test-bds/suite.mjs --jobs 2 --retry --filter '^(domt-|meteor-|expedition-nether-carts$)' --json .../p3/suite-recheck.json`

The reviewer changed no packs, so the filter covers every scenario that regressed or failed in the after run
(domt-busy, domt-cards, meteor-edge, expedition-nether-carts) plus every scenario of their packs (all 12 domt-*,
all 3 meteor-*).

Result: 16 scenarios, 16 pass, 0 flaky, 0 fail, 0 timeout (11.1 min). Logs:
/home/user/wt/integration/tools/test-bds/logs/suite-2026-10-18T22-23-31-372Z
(A first attempt at 22:04 was stopped by the background time limit during the meteor scenarios. Its 13 finished
scenarios all passed.)

## Regressions
- domt-busy: harness/scenario flakiness, not a pack regression. I instrumented a copy of domt_bp's hoverAndLand.
  The Comet picks 4 random spots 150-300 blocks from Buddy (163, 170 in the seed-1 world cache). In the failing runs,
  every one of them loaded and its top block was ocean-floor gravel (y 37-50), so surface() found nothing to stand
  on and the card returned false ("crumbles to dust", then "finds nothing" because the card was chosen). before's
  own domt_bp (da2149f) failed the same way 1 of 5 times on the same world, and farTeleport and The Comet are
  unchanged by the audit. Fix (commit 24f1b54, scenario only): the last wait accepts either ending. The scenario is
  about the "still drawing" message and the first draw finishing. 4 of 4 standalone runs passed, both endings were
  seen, and it passed in the suite.
- domt-cards (flaky after): passed on the first try in the recheck. Nothing to fix.
- meteor-edge: passes on the integration worktree's flat cache. The after failure was the cached flat world's random
  spawn point (a harness cache issue, as the test runner found). No change.
- expedition-nether-carts (new): passes. Same cache cause as meteor-edge. No change.

Final regression list: empty.

## Checks
- npm run check: passes (Versions: 68 of 74 packs changed since da2149f, each with a higher header.version).
- npm run build: passes.

Packs changed: none.
