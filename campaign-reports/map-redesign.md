# Minimap redesign (perf/map-redesign): report

Branch `perf/map-redesign` from `claude/campaign-g3-verified` (e6dd6a0). Before = e6dd6a0 (the g3 tree), after =
this branch (map_bp 1.3.9). Same machine and method as campaign-reports/g3.md: 4 vCPU container, BDS 1.26.52.3,
perf-soak 120 s, WS1 set (map, hud, saga, elytra, calendar, maps, mobhp, afk), 10 and 40 players, before/after
alternating, two runs each, nothing else running (lock). Goal: map_bp <= 1 ms at 40 players without changing what
players see at budgetLevel normal. **Not reached.**

## Result (ms/tick, means of 2)

| | 40: before | 40: after | change | 10: before | 10: after | change |
|---|---:|---:|---:|---:|---:|---:|
| map_bp (round 2, e589760) | 4.389 | 3.924 | -11% | 2.861 | 2.739 | -4% |
| map_bp (round 1, 3c7ab7b) | 4.315 | 3.902 | -10% | 2.925 | 2.681 | -8% |
| WS1 set, steady (round 2) | 5.949 | 5.384 | -9% | 3.440 | 3.295 | -4% |

What players get for that time at 40 players (Minimap cost counters, per tick):

| | before | after |
|---|---:|---:|
| strips/radars sent because they changed | 0.156 | 0.505 - 0.632 |
| refresh titles (same text) | 1.193 | 0.22 - 0.30 |
| passes (mob and townsfolk markers) | 0.517 | 0.51 - 0.56 |
| terrain reads | 5.1 | 4.4 - 4.9 |
| strips that ran out (compositor releases) | 0 | 0 |

## Why the cost barely falls

The Minimap's work is budgeted (drawing 1 ms, terrain pictures 0.4, passes 0.5, scanner 1). With 10 or 40 players
moving, demand exceeds every budget, so each saving buys more drawing, not less time: the redraw now sends 3-4 times as
many changed strips and radars for the same milliseconds. Timers inside the redraw at 40 players (ms a tick): turn
checks 0.41, strip building 0.27, radar without a terrain rebuild 0.34, terrain rebuilds 0.42 (2.9 ms each),
sending 0.30; passes 0.49 (1.1 ms each); scanner 1.3 (reads 0.13 ms each, planning 0.45).

Experiment (not committed): budgets near 1 ms in all (drawing 0.4, terrain pictures 0.15, passes 0.2, scanner 0.25)
on this branch's code:

| | 40 players | 10 players |
|---|---:|---:|
| map_bp | 2.090 | 1.545 |
| changed strips/radars a tick | 0.124 (before at normal: 0.156) | 0.355 (before at normal: 0.88) |
| passes a tick | 0.20 (0.52) | 0.38 (0.99) |
| terrain reads a tick | 0.5 (5.1) | 0.65 (1.67) |

Even then about 1.1 ms a tick at 40 players is outside the budgets (turn checks 0.48, scanner planning 0.33, the
rest). So 1 ms at 40 means much staler mob dots and terrain (2.5 and 10 times), and a slower strip at 10 players (the
Realm's size): an owner decision (O15), not done here. `budgetLevel` low (3.5 ms at 40 on the g3 tree) remains.

## Changes (each with the map scenarios passing)

1. Titles held 100 ticks, refreshed at 80 (was 40 / 30): refresh titles 1.19 -> 0.22-0.30 a tick at 40. A strip only
   lingers this long if the Minimap stops. map-turn's fade check follows HOLD (96 ticks).
2. The dimension comes from `playerDimensionChange`, not from a read in every turn check.
3. The scanner's rotating check skips a viewer whose plan is read out, who hasn't moved a block or changed height and
   whose radar listed nothing newer (no game reads). map-water-structures caught the first version (height).
4. With more than 16 players drawn, a player is checked and drawn at most every 2 ticks for turning or moving (titles
   due and new passes always). Up to 16, every tick (map-turn's single-player cadence holds).
5. Radars waiting for a terrain picture are looked at only while there is rebuild time, two a tick.
6. Marker priorities by squared distance (same order, no square root).
7. A pass near another player's mob search from the last 10 ticks (20 for townsfolk) uses it; mob searches reach 8
   blocks farther.
8. A radar signature (terrain key, facing, marker cells) skips rebuilding an unchanged radar. It never hit in the
   soak (walking players change their whole-block position between draws): kept, cheap, measured at 0.01 ms a tick.

## Scenarios

Map set (map, map-turn, map-flight, map-empty-panels, map-others-range, map-places, map-reset, map-water-structures,
map-compositor, rook-map-race, saga-quest-box, saga-quest-wrap, saga-box-resend, saga-note-box, maps-warmth-steady,
side-boxes, title-hold, admin-title, mobhp-sweep): 18 of 19 pass; map-flight's "native flight saturates6000" fails as
on every tree (7aa0cce, int23, g3). map-turn's idle check ("nothing sent while nobody turns", 1 send) and map's
"every player drawn each pass" flaked once each and passed on retry, as on the g3 tree.

## Next levers (measured, not done)

- Turn checks (0.4-0.5 ms a tick at 40, unbudgeted): two native reads per check; batch them with a per-tick pose
  snapshot only if a pass/scanner/redraw share were arranged so one read serves all three.
- Terrain rebuilds at 2.9 ms each: snapping the radar's terrain grid to whole cells (2.4 blocks) instead of whole
  blocks would cut rebuilds for walkers about 2.4 times, but the land then moves in cell steps (visible).
- Strip building at 0.16 ms (about 40 markers each with 40 players): cache bearings per pass.
