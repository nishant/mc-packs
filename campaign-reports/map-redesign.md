# Minimap redesign (perf/map-redesign): report

Branch `perf/map-redesign` from `claude/campaign-g3-verified` (e6dd6a0), with `origin/master` (174a048) merged in;
map_bp 1.3.11. Same machine and method as campaign-reports/g3.md: 4 vCPU container, BDS 1.26.52.3, perf-soak 120 s,
WS1 set (map, hud, saga, elytra, calendar, maps, mobhp, afk), 10 and 40 players, before/after alternating, two runs
each, nothing else running (a lock). Before = `origin/master` 174a048 (map_bp 1.3.10). Goal: map_bp <= 1 ms at 40
players. **Not reached: 1.9 ms at 40, 1.5 at 10 (-55% and -46%).** The budgets now sum to 1 ms; what remains is work
outside them (below).

## Decision (lead, October 2026)

`budgetLevel` normal = the ~1 ms experiment (drawing 0.4, terrain pictures 0.15, passes 0.2, scanner 0.25 ms a tick);
high = the budgets normal had before (1, 0.4, 0.5, 1 = 2.9 ms); low = proportionally below normal (0.3, 0.1, 0.14,
0.17 = 0.71 ms). Turn checks are not charged to the drawing budget (charged, at 1 ms they left it nothing: 0.016
changed sends a tick at 40); instead the players checked a tick follow the level (low 3, normal 4, high 12). The
scanner plans again only for players who moved a chunk (16 blocks), changed dimension or height (under a roof any
change, in the open 3 blocks), whose radar listed new land, or whose roof probe is due.

## Result (ms/tick, means of 2)

| | 40: before | 40: after | change | 10: before | 10: after | change |
|---|---:|---:|---:|---:|---:|---:|
| map_bp | 4.268 | 1.902 | -55% | 2.768 | 1.500 | -46% |
| WS1 set, steady | 5.612 | 3.028 | -46% | 3.378 | 1.985 | -41% |
| p95 tick | 11.0 | 8.0 | -27% | 6.5 | 5.0 | -23% |

After = 373353e4 (the budget cut). The two re-planning commits after it (7af9e6dd, f27cdc66) measured 1.887 at 40 against
1.902 (-1%, noise), and a player list cached across ticks a further 1.813 (-4%, inside the run-to-run spread of about
0.07; not committed: it keeps handles across ticks, which needs every leave handled to be safe).

Each level on the final tree (one profiled run each, the Minimap's counters in the same run):

| | low 40 | normal 40 | high 40 | low 10 | normal 10 | high 10 |
|---|---:|---:|---:|---:|---:|---:|
| map_bp ms/tick | 1.650 | 1.932 | 3.695 | 1.226 | 1.490 | 2.564 |
| budgets (sum) | 0.71 | 1.00 | 2.90 | 0.71 | 1.00 | 2.90 |
| turn checks ms/tick (unbudgeted) | 0.38 | 0.38 | 0.55 | 0.23 | 0.25 | 0.27 |
| scanner planning ms/tick (unbudgeted) | 0.31 | 0.33 | 0.38 | 0.19 | 0.19 | 0.24 |

## Quality (what players get for the time)

From the Minimap's cost counters (`realm:map_debug cost`, per tick, players moving). Mob dot age = players / passes a
tick / 20 (seconds between one player's passes). Strip rate = changed strip or radar sends / players x 20 (a second,
per player). Terrain = columns read a tick (how fast the land under the radar fills in and refreshes; its age is the
inverse).

| | 40: before (master) | 40: normal | 40: high | 10: before (master) | 10: normal | 10: high |
|---|---:|---:|---:|---:|---:|---:|
| mob dot age (s) | 3.9 | 10.7 | 3.6 | 0.52 | 1.56 | 0.53 |
| strip rate (/s per player) | 0.069 | 0.045 | 0.235 | 1.51 | 0.66 | 1.42 |
| terrain reads a tick | 5.33 | 0.44 | 5.11 | 1.51 | 0.75 | 1.77 |
| refresh titles a tick (same text) | 1.06 | 0.38 | 0.26 | 0.07 | 0.01 | 0.00 |
| strips that ran out (compositor releases) | 0 | 0 | 0 | 0 | 0 | 0 |

So at normal, mob dots are about 3 times as old, the strip follows about half as often at 10 players, and terrain
fills 2 (10 players) to 12 (40) times slower; high gives back master's quality (better strips at 40) for 3.7 ms at 40,
which is still less than master's 4.3. NEWS and the player docs say so, and name High for operators who want it.
The real-client look of normal against high is A4 in docs/audits/2026-10-deep-audit/REAL_CLIENT_CHECKLIST.md (O15).

## Why 1 ms isn't reached

With players moving, demand exceeds every budget, so the budgets' sum is spent each tick; on top come costs that scale
with players and aren't budgeted (at 40, normal): turn checks 0.38 ms (about 6 a tick: 4 in turns, titles due for
their refresh, new passes, two lagging radars; two native reads each), scanner planning 0.33 (`getAllPlayers` alone
0.14: the first native call of a tick costs about 6 times a repeat), event handlers and the profiler's wrapping about
0.25. Instrumented runs (not committed) showed the rotating re-plan skipping 3%, then 18% of players (fixed by the
commits above); fresh player handles in the turn checks made them dearer (1365 against 1254 ms a run), so the kept
ones stay.

To reach 1 ms the unbudgeted work has to go under a budget too, which the first try (checks charged to drawing)
showed starves drawing at 1 ms; or normal's budgets drop to about 0.2 ms in all, roughly halving every quality number
above again. Both are owner decisions; not done.

## Changes (each with the map scenarios passing)

1. Titles held 100 ticks, refreshed at 80 (was 40 / 30). map-turn's fade check follows HOLD (96 ticks).
2. The dimension comes from `playerDimensionChange`, not from a read in every turn check.
3. The scanner's rotating check skips a viewer who hasn't moved a chunk or changed height or dimension and whose
   radar listed nothing newer (no game reads); a plan still being read goes on, failed reads come back through
   retryAt. map-water-structures caught the first version (height).
4. With more than 16 players drawn, a player is checked and drawn at most every 2 ticks for turning or moving.
5. Radars waiting for a terrain picture are looked at only while there is rebuild time, two a tick.
6. Marker priorities by squared distance.
7. A pass near another player's mob search from the last 10 ticks (20 for townsfolk) uses it.
8. A radar signature skips rebuilding an unchanged radar (never hit in the soak; 0.01 ms a tick).
9. Budget levels as decided above; turn checks a tick by level; map_state's `perTick` is the sum of all four budgets.

## map-flight saturation (root cause; the check is unchanged)

"native flight saturates6000" failed on every tree. The flight was a fixed 2200 ticks, and whether the store reaches
its 6000-column cap in that time depends on the scanner's reading budget and the machine: eviction is one in, one out
at the cap, so a run that saturates always shows exactly 6000, and one that doesn't shows less. The flight now goes on
until the store is full (looked at every 200 ticks after 2000, at most 6600 ticks; about 409 s at high), and the check
(`columns === 6000 && fine >= 100`) is the same. Passes on the final tree (469 s).

## Scenarios

The quality scenarios (map, map-turn, map-flight, map-water-structures) describe the Minimap with the budgets it had,
so they set budgetLevel high first (the same code with more time; normal's cost is perf-soak's to measure).

SCENARIOS_PLACEHOLDER

## Next levers (measured, not done)

- Turn checks (0.4 ms at 40): one per-tick pose snapshot shared by the redraw, the passes and the scanner, if the
  three could be arranged to read the same players in the same tick.
- `getAllPlayers` once a tick (0.14 ms): a list kept across ticks, refreshed on join and leave (-4%, inside noise).
- Terrain rebuilds (about 2.9 ms each at high): snapping the radar's terrain grid to whole cells cuts them about 2.4
  times for walkers, but the land then moves in cell steps.
