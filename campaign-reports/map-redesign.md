# Minimap redesign (perf/map-redesign): report

Branch `perf/map-redesign` from `claude/campaign-g3-verified` (e6dd6a0), with `origin/master` (174a048) merged in;
map_bp 1.3.11. Same machine and method as campaign-reports/g3.md: 4 vCPU container, BDS 1.26.52.3, perf-soak 120 s,
WS1 set (map, hud, saga, elytra, calendar, maps, mobhp, afk), 10 and 40 players, before/after alternating, two runs
each, nothing else running (a lock). Before = `origin/master` 174a048 (map_bp 1.3.10). Goal: map_bp <= 1 ms at 40
players. **Not reached: 2.1 ms at 40, 1.5 at 10 (-54% and -46%).** The budgets now sum to 1 ms; what remains is work
outside them (below).

## Decision (lead, October 2026)

`budgetLevel` normal = the ~1 ms experiment (drawing 0.4, terrain pictures 0.15, passes 0.2, scanner 0.25 ms a tick);
high = the budgets normal had before (1, 0.4, 0.5, 1 = 2.9 ms); low = proportionally below normal (0.3, 0.1, 0.14,
0.17 = 0.71 ms). Turn checks are not charged to the drawing budget (charged, at 1 ms they left it nothing: 0.016
changed sends a tick at 40); instead the players checked a tick follow the level (low 3, normal 4, high 12). The
scanner plans again only for players who moved a chunk (16 blocks), changed dimension or height (under a roof any
change, in the open 3 blocks), whose radar listed new land, or whose roof probe is due.

## Result (ms/tick, means of 2, one session)

| | 40: before | 40: after | change | 10: before | 10: after | change |
|---|---:|---:|---:|---:|---:|---:|
| map_bp | 4.425 | 2.055 | -54% | 2.838 | 1.533 | -46% |
| WS1 set, steady | 5.900 | 3.411 | -42% | 3.455 | 2.072 | -40% |
| p95 tick | 11.5 | 9.0 | -22% | 7.0 | 5.0 | -29% |

After = d0709f06 (final). The same session ran slower than earlier ones (always-shared measured 1.89 at 40 at noon,
2.11 by evening): compare within a table, not across tables.

Each level on the final tree (one profiled run each, the Minimap's counters in the same run):

| | low 40 | normal 40 | high 40 | low 10 | normal 10 | high 10 |
|---|---:|---:|---:|---:|---:|---:|
| map_bp ms/tick | 1.649 | 1.895 | 3.642 | 1.213 | 1.475 | 2.504 |
| budgets (sum) | 0.71 | 1.00 | 2.90 | 0.71 | 1.00 | 2.90 |
| turn checks ms/tick (unbudgeted) | 0.37 | 0.37 | 0.59 | 0.23 | 0.23 | 0.29 |
| scanner planning ms/tick (unbudgeted) | 0.31 | 0.33 | 0.38 | 0.19 | 0.18 | 0.23 |

## Quality (what players get for the time)

From the Minimap's cost counters (`realm:map_debug cost`, per tick, players moving). Mob dot age = players / passes a
tick / 20 (seconds between one player's passes). Strip rate = changed strip or radar sends / players x 20 (a second,
per player). Terrain = columns read a tick (how fast the land under the radar fills in and refreshes; its age is the
inverse). Before = master 174a048 (an earlier session).

| | 40: before | 40: normal | 40: high | 10: before | 10: normal | 10: high |
|---|---:|---:|---:|---:|---:|---:|
| mob dot age (s) | 3.9 | 10.3 | 4.3 | 0.52 | 1.38 | 0.53 |
| strip rate (/s per player) | 0.069 | 0.049 | 0.198 | 1.51 | 0.73 | 1.56 |
| terrain reads a tick | 5.33 | 0.54 | 5.00 | 1.51 | 0.78 | 1.76 |
| refresh titles a tick (same text) | 1.06 | 0.37 | 0.30 | 0.07 | 0.01 | 0.00 |
| strips that ran out (compositor releases) | 0 | 0 | 0 | 0 | 0 | 0 |

So at normal, mob dots are about 2.5 times as old, the strip follows about half as often at 10 players, and terrain
fills 2 (10 players) to 10 (40) times slower; high gives back master's quality (better strips at 40) for 3.6 ms at 40
and 2.5 at 10, less than master's 4.4 and 2.8. NEWS and the player docs say so, and name High for operators who want
it. The real-client look of normal against high is A4 in docs/audits/2026-10-deep-audit/REAL_CLIENT_CHECKLIST.md (O15).

## Why 1 ms isn't reached

With players moving, demand exceeds every budget, so the budgets' sum is spent each tick; on top come costs that scale
with players and aren't budgeted (at 40, normal): turn checks 0.37 ms (about 6 a tick: 4 in turns, titles due for
their refresh, new passes, two lagging radars; two native reads each), scanner planning 0.33 (`getAllPlayers` alone
0.14: the first native call of a tick costs about 6 times a repeat), event handlers and the profiler's wrapping about
0.25. Instrumented runs (not committed) showed the rotating re-plan skipping 3%, then 18% of players (fixed by
7af9e6dd and f27cdc66: -1%, noise, but fewer game reads); fresh player handles in the turn checks made them dearer
(1365 against 1254 ms a run), so the kept ones stay; a player list kept across ticks measured -4%, inside the
run-to-run spread, and would keep handles across ticks: not committed.

To reach 1 ms the unbudgeted work has to go under a budget too, which the first try (checks charged to drawing)
showed starves drawing at 1 ms; or normal's budgets drop to about 0.2 ms in all, roughly halving every quality number
above again. Both are owner decisions; not done.

## The shared mob search (found by map.js, removed)

Round 1 shared mob searches between nearby players: each search reached 8 blocks beyond the player's range (24 to 32
blocks) and kept 4 times as many mobs, so others within 8 blocks could use it. map.js's "every player drawn each pass"
(10 players, 24 husks, at high) then failed 9 of 10 runs: a pass cost 0.52-0.70 ms against master's 0.48, over high's
0.5 ms pass budget. Bisected over e6dd6a0, c0fb5005, e18e06e5, 795fc411 and HEAD; master's search on the final code
passed 3 of 3 (0.49-0.51 ms). Asking for only the nearest maxMobs didn't help (0.61, 0.66): the wider radius is the
cost. Widening only with another player within 12 blocks still failed (0 of 3: map.js's players stand together), and
in perf-soak sharing saved nothing (1.964 against 1.891 ms at 40, 1.531 against 1.541 at 10, master's search the
cheaper). Mob searches are each player's own again (d0709f06); townsfolk searches, which don't widen, are still shared.

## Changes (each with the map scenarios passing)

1. Titles held 100 ticks, refreshed at 80 (was 40 / 30). map-turn's fade check follows HOLD (96 ticks).
2. The dimension comes from `playerDimensionChange`, not from a read in every turn check.
3. The scanner's rotating check skips a viewer who hasn't moved a chunk or changed dimension or height (under a roof
   any change, in the open 3 blocks) and whose radar listed nothing newer (no game reads); a plan still being read
   goes on (and records where it was checked), failed reads come back through retryAt. map-water-structures caught
   the first version (height).
4. With more than 16 players drawn, a player is checked and drawn at most every 2 ticks for turning or moving.
5. Radars waiting for a terrain picture are looked at only while there is rebuild time, two a tick.
6. Marker priorities by squared distance.
7. A pass within 8 blocks of another player's townsfolk search from the last 20 ticks uses it (mob searches: see
   above).
8. A radar signature skips rebuilding an unchanged radar (never hit in the soak; 0.01 ms a tick).
9. Budget levels as decided above; turn checks a tick by level; map_state's `perTick` is the sum of all four budgets.

## map-flight saturation (root cause; the check is unchanged)

"native flight saturates6000" failed on every tree. The flight was a fixed 2200 ticks, and whether the store reaches
its 6000-column cap in that time depends on the scanner's reading budget and the machine: eviction is one in, one out
at the cap, so a run that saturates always shows exactly 6000, and one that doesn't shows less. The flight now goes on
until the store is full (looked at every 200 ticks after 2000, at most 6600 ticks; about 409 s at high), and the check
(`columns === 6000 && fine >= 100`) is the same. Passes on the final tree (417 s in the suite).

## Scenarios

The quality scenarios (map, map-turn, map-flight, map-water-structures) describe the Minimap with the budgets it had,
so they set budgetLevel high first (the same code with more time; normal's cost is perf-soak's to measure).

Map set (map, map-turn, map-flight, map-empty-panels, map-others-range, map-places, map-reset, map-water-structures,
map-compositor, rook-map-race, saga-quest-box, saga-quest-wrap, saga-box-resend, saga-note-box, maps-warmth-steady,
side-boxes, title-hold, admin-title, mobhp-sweep) on the final tree: 18 of 19 pass, map and map-flight (417 s) included.
map-turn's "nothing sent by the per-tick redraw while nobody turns" failed both
tries in the suite; alone, three runs each in one session: master 1 of 3 (1 and 2 sent), final 2 of 3 (1 sent). A
flake that predates the branch and is no worse on it; not this branch's to fix here.

## Next levers (measured, not done)

- Turn checks (0.4 ms at 40): one per-tick pose snapshot shared by the redraw, the passes and the scanner, if the
  three could be arranged to read the same players in the same tick.
- `getAllPlayers` once a tick (0.14 ms): a list kept across ticks, refreshed on join and leave (-4%, inside noise).
- map-turn's idle send (on master too): one send in 100 still ticks, likely a stale-terrain rebuild landing new land.
- Terrain rebuilds (about 2.9 ms each at high): snapping the radar's terrain grid to whole cells cuts them about 2.4
  times for walkers, but the land then moves in cell steps.
