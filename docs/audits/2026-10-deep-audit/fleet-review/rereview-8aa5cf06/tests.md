# Targeted tests on nishant/mc-packs master 8aa5cf06 (after PR #96)

Scope was cut partway through by the lead: no BDS runs. The suite was stopped while it was retrying its failures alone,
and its processes were killed (suite pid 2348, run.mjs 9213 and its bedrock_server 9231, all started by this agent).
Steps 3 (F2 autostore-perf) and 4 (perf-soak, separate packs and --bundle) were **not run**. Nothing was committed or pushed,
and the repo tree is clean.

## 1. Targeted suite (partial: first pass done, retries cut off)

Command: `node tools/test-bds/suite.mjs --jobs 2 --retry --json rel/suite-sub.json --filter "$(cat rel/filter.txt)"`
(the filter is in rel/filter.txt). There are 21 scenarios. Stealth, choir and song matched saga-fen-bound and saga-party-story, plus
calendar, which was already in the list. PR #97's scenario is saga-defeat-spawn. saga-countdown is the other saga
defeat-step scenario that spawns mobs.
Output: rel/suite-sub.out. Logs: /home/user/wt/rel/tools/test-bds/logs/suite-2026-10-20T05-35-35-449Z/<scenario>.out and .log. No suite-sub.json was written, because the suite was killed.

| scenario | first pass | note |
|---|---|---|
| admin-diag-bundle | pass (40 s) | earlier regression |
| admin-size-profile | pass (45 s) | earlier regression |
| expedition-pending | pass (196 s) | earlier regression |
| expedition-slot-spawn | pass (23 s) | earlier regression |
| find-index | pass (16 s) | earlier regression |
| stash-pages | pass (22 s) | earlier regression |
| stats-new-name | pass (9 s) | earlier regression |
| stats-ticker | pass (9 s) | earlier regression |
| wander-walk | **FAIL** (102 s) | "no form for Tester within 200 ticks"; earlier in the run: "FAILED: no named witch left". Retry not run |
| atlas | **FAIL** (69 s) | "chunk at 2000,2000 did not load in 400 ticks" (0 script errors; may be load, since 2 jobs plus other agents were running). Retry was killed after 8 s |
| calendar | pass (115 s) | |
| wander | **FAIL** (100 s) | "Hob is at his camp after the restart". Retry not run |
| cleanup-keep | pass (39 s) | |
| guilds-placed-restart | pass (46 s) | |
| build-beds | pass (6 s) | the wiring was broken on the fleet branch; it is fixed now |
| welcome-generic-bundle | pass (15 s) | the wiring was broken on the fleet branch; it is fixed now |
| diag-owned-reload | pass (31 s) | it failed on the fleet branch; it passes now |
| saga-fen-bound | pass (43 s) | Gray Ring and song |
| saga-party-story | pass (35 s) | stealth step |
| saga-defeat-spawn | pass (57 s) | added by PR #97 (58540e3) |
| saga-countdown | pass (18 s) | defeat step that spawns drowned |

Totals: 18 passed and 3 failed on the first pass (atlas, wander-walk, wander). It is undetermined whether these 3 are flaky or real failures, because the retries were cut off.

## 2. F1 probe (node --test, scratch copy only)

- Original probe, with paths changed to /home/user/wt/rel/packs: rel/f1/tools/stash-fill-locked.probe.test.mjs, output rel/f1-original-probe.out
- The current tools/stash-pages.test.mjs plus the two PROBE tests appended: rel/f1/tools/stash-pages-plus-probe.test.mjs, output rel/f1-current-plus-probe.out

Result: **F1 is fixed on 8aa5cf06.** Both probes pass, and the census is unchanged. The slot-locked diamond x5 stays in its slot with amount 5 and is
neither inflated nor lost:
- `PROBE result {"ok":true,"stacks":1,"items":3,"left":0} slot10 minecraft:diamond 5`
- `PROBE1 result {"ok":true,"stacks":1,"items":3,"left":0} slot12 minecraft:diamond 5`

The current test file plus the probes passes 135/135. The original probe file passes 130/133. Its 3 failures are old fleet-branch auto-store
expectations that master's rule deliberately replaced (route only when the page is nearly full): "PR86: ... even when page 3
has room", "F4 index: a pickup never restores ...", and "F5 auto-store: a failed save ...". They are not F1 failures.

## 3. F2 autostore-perf: NOT RUN (scope cut)
Prepared, not executed: rel/tree is a git archive of 8aa5cf06 with the scenario at tools/test-bds/examples/autostore-perf.js.
Suggested command: `node tools/test-bds/run.mjs --quiet --no-relay --profile --only stash_bp --scenario tools/test-bds/examples/autostore-perf.js`.
Note: the scenario's page 1 has room, so under master's restored rule, auto-store should not route at all.

## 4. Perf soak: NOT RUN (scope cut)
Prepared: rel/tree/dist/realm_bundle.mcpack was built from 8aa5cf06 in the scratch tree (gen-news changed no packs).
Baseline to compare against (perf-report.md): fleet-10 5.77 steady, bundle-10 4.75 steady.
