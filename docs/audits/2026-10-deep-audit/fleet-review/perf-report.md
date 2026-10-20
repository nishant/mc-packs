# Fleet branch vs master: perf and test regressions

- fleet: `/home/user/wt/fleet` at aef10dc (origin/msftmyt-deep-audit-fleet-integration), 207 commits on top of master.
- master: `/home/user/wt/master` is actually at **7dac598** (PR #95), not 7eb5f72. 7eb5f72 (PR #94) is an ancestor, and 7dac598 is the fleet branch's merge base, so this is the correct baseline.
- Harness: master lacked `--bundle`, perf acceptance and the newer perf-soak, which adds a Hotbar Refill workload every 20 s. I copied fleet's `tools/test-bds` into master uncommitted, keeping master's own versions of the 11 example scenarios that differ, plus `hooks/diag-bundle.mjs`. Both trees therefore ran the same harness and the same perf-soak (same defaults: group 5, spread 240, commands 45, refill 20, water 2, nether 2). Master's `tools/test-bds` has since been restored to its committed state, and both trees are clean. Nothing was committed or pushed.
- Every soak was VALID: all N players spawned and stayed, and the full 300 s window ran. Per-pack figures are whole-run ms/tick (spawn ramp plus soak); the "steady" columns cover the 6000-tick soak window only.
- Noise: master-40b and fleet-40b are reruns of the same code. Bundle averages agree within 0.03 ms (master, 9.49 vs 9.47) and 0.64 ms (fleet, 8.79 vs 8.15). Steady averages agree within 0.1 ms in both trees. Other agents' BDS jobs overlapped about 20 s of master-40 and about 150 s of fleet-40; master-40b and fleet-40b had no overlap.
- RSS "start" is bedrock_server's VmRSS about 30 s after boot (soak start), sampled every 5 s from /proc; "end" is the last sample.

## Whole-bundle totals

| run | bundle avg | p50 | p95 | p99 | max | steady avg/p95/p99 | calls/t | TPS | tick p95 | CPU ms/t | RSS start→end MB | dynW/t | bar/t | title/t | cmd/t | valid |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| master-10 | 6.420 | 6 | 13 | 20 | 161 | 6.387/13/20 | 418.7 | 19.82 | 61 | 40.9 | 1296→1336 | 0.120 | 0.00 | 0.84 | 0.01 | VALID |
| fleet-10 | 5.790 | 5 | 12 | 19 | 99 | 5.774/12/19 | 152.0 | 19.89 | 61 | 38.9 | 1298→1341 | 0.123 | 0.30 | 0.88 | 0.01 | VALID |
| master-40 | 9.494 | 8 | 28 | 43 | 160 | 9.340/26/40 | 500.4 | 18.94 | 78 | 57.1 | 1409→1491 | 0.391 | 0.01 | 1.00 | 0.04 | VALID |
| master-40b | 9.469 | 8 | 29 | 44 | 198 | 9.323/27/42 | 518.8 | 17.59 | 84 | 62.1 | 1404→1510 | 0.414 | 0.01 | 1.05 | 0.04 | VALID |
| fleet-40 | 8.786 | 7 | 27 | 40 | 128 | 8.673/26/38 | 182.3 | 19.29 | 78 | 54.4 | 1407→1475 | 0.408 | 1.19 | 1.10 | 0.04 | VALID |
| fleet-40b | 8.149 | 7 | 25 | 37 | 189 | 8.571/26/35 | 170.4 | 19.26 | 76 | 52.7 | 1299→1479 | 0.374 | 1.09 | 1.01 | 0.03 | VALID |
| master-bundle-10 | 5.335 | 5 | 11 | 17 | 181 | 5.314/11/16 | 500.2 | 19.98 | 57 | 14.6 | 623→637 | 0.122 | 0.00 | 1.08 | 0.01 | VALID |
| fleet-bundle-10 | 4.274 | 4 | 9 | 14 | 77 | 4.747/10/15 | 140.3 | 20.00 | 56 | 13.7 | 635→663 | 0.091 | 0.28 | 0.84 | 0.01 | VALID |

**Verdict: fleet is faster.** Steady bundle ms/tick: -7% at 40 players (9.33 → 8.62), -10% at 10 players (6.39 → 5.77), and -11% on the real one-context Realm Bundle at 10 players (5.31 → 4.75; whole run 5.34 → 4.27, -20%). Pack callbacks per tick fell about 64-72% (500 → 176 at 40 players), mostly because many per-pack `scriptEventReceive` listeners were folded into one dispatcher (`script-events.js:80`). TPS was the same or better (40p: 18.9/17.6 → 19.3/19.3). p95/p99 were within 1-3 ms. RSS was unchanged (bundle +26 MB). setDynamicProperty writes are unchanged, but **setActionBar rose from about 0 to 1.1-1.2 per tick at 40 players** (0.3/tick at 10 players), all of it from `stats_bp` (`runInterval(20) @ main.js:362`, the per-player stats ticker), which also took stats_bp from 0.07 to 0.17-0.18 ms/tick at 40 players.

## Per-pack ms/tick (sorted by fleet-40)

Δ40 = mean(fleet-40, fleet-40b) − mean(master-40, master-40b). Noise = |fleet-40 − fleet-40b|. Treat any Δ smaller than the noise as no change.

| pack | master-10 | fleet-10 | Δ10 | master-40 | master-40b | fleet-40 | fleet-40b | Δ40 (fleet avg − master avg) | fleet noise (40 vs 40b) | fleet-40 dynW/bar/title per tick | budget |
|---|---|---|---|---|---|---|---|---|---|---|---|
| map_bp | 2.949 | 2.892 | -0.057 | 3.844 | 3.866 | 3.832 | 3.578 | -0.150 | 0.253 | 0.000/0.00/1.09 | 1 **OVER** |
| build_bp | 0.503 | 0.438 | -0.065 | 0.917 | 0.925 | 0.777 | 0.732 | -0.167 | 0.045 | 0.000/0.00/0.00 | 0.15 **OVER** |
| stash_bp | 0.168 | 0.170 | +0.002 | 0.544 | 0.547 | 0.567 | 0.525 | -0.000 | 0.042 | 0.025/0.00/0.00 | 0.15 **OVER** |
| silly_bp | 0.144 | 0.140 | -0.004 | 0.277 | 0.292 | 0.288 | 0.256 | -0.013 | 0.032 | 0.000/0.00/0.00 | 0.15 **OVER** |
| elytra_bp | 0.226 | 0.182 | -0.044 | 0.299 | 0.313 | 0.235 | 0.222 | -0.078 | 0.013 | 0.000/0.00/0.00 | 0.15 **OVER** |
| admin_bp | 0.059 | 0.043 | -0.016 | 0.239 | 0.254 | 0.228 | 0.209 | -0.028 | 0.019 | 0.000/0.00/0.00 | 0.15 **OVER** |
| saga_bp | 0.186 | 0.151 | -0.035 | 0.234 | 0.244 | 0.211 | 0.194 | -0.037 | 0.017 | 0.006/0.00/0.00 | 0.15 **OVER** |
| wander_bp | 0.059 | 0.044 | -0.015 | 0.367 | 0.115 | 0.203 | 0.166 | -0.056 | 0.037 | 0.000/0.00/0.00 | 0.15 **OVER** |
| stats_bp | 0.041 | 0.059 | +0.018 | 0.068 | 0.072 | 0.181 | 0.163 | +0.102 | 0.019 | 0.006/1.18/0.00 | 0.15 **OVER** |
| hud_bp | 0.149 | 0.130 | -0.019 | 0.167 | 0.168 | 0.169 | 0.152 | -0.007 | 0.017 | 0.000/0.00/0.00 | 1 |
| calendar_bp | 0.154 | 0.144 | -0.010 | 0.140 | 0.154 | 0.136 | 0.125 | -0.017 | 0.011 | 0.000/0.00/0.00 | 0.15 |
| durability_bp | 0.065 | 0.061 | -0.004 | 0.136 | 0.139 | 0.134 | 0.124 | -0.008 | 0.010 | 0.000/0.00/0.00 | 0.15 |
| skills_bp | 0.063 | 0.057 | -0.007 | 0.130 | 0.141 | 0.123 | 0.108 | -0.020 | 0.014 | 0.009/0.01/0.00 | 0.15 |
| relics_bp | 0.087 | 0.049 | -0.038 | 0.207 | 0.213 | 0.109 | 0.099 | -0.106 | 0.010 | 0.004/0.00/0.00 | 0.15 |
| maps_bp | 0.152 | 0.122 | -0.030 | 0.140 | 0.144 | 0.106 | 0.121 | -0.028 | 0.015 | 0.000/0.00/0.00 | 0.15 |
| mobhp_bp | 0.107 | 0.110 | +0.003 | 0.095 | 0.100 | 0.091 | 0.093 | -0.006 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| milestones_bp | 0.043 | 0.039 | -0.004 | 0.084 | 0.079 | 0.087 | 0.073 | -0.002 | 0.013 | 0.095/0.00/0.00 | 0.15 |
| journal_bp | 0.061 | 0.056 | -0.004 | 0.096 | 0.100 | 0.086 | 0.080 | -0.015 | 0.007 | 0.020/0.00/0.00 | 0.15 |
| atlas_bp | 0.052 | 0.036 | -0.016 | 0.110 | 0.105 | 0.085 | 0.085 | -0.022 | 0.001 | 0.006/0.00/0.01 | 0.15 |
| quests_bp | 0.045 | 0.036 | -0.008 | 0.079 | 0.090 | 0.079 | 0.070 | -0.010 | 0.009 | 0.066/0.00/0.00 | 0.15 |
| dolphin_bp | 0.057 | 0.041 | -0.016 | 0.087 | 0.093 | 0.078 | 0.069 | -0.016 | 0.009 | 0.000/0.00/0.00 | 0.15 |
| titles_bp | 0.056 | 0.047 | -0.009 | 0.076 | 0.078 | 0.072 | 0.075 | -0.004 | 0.002 | 0.043/0.00/0.00 | 0.15 |
| afk_bp | 0.029 | 0.028 | -0.001 | 0.050 | 0.053 | 0.055 | 0.048 | +0.000 | 0.007 | 0.000/0.00/0.00 | 0.15 |
| guilds_bp | 0.037 | 0.029 | -0.008 | 0.062 | 0.063 | 0.053 | 0.048 | -0.012 | 0.005 | 0.031/0.00/0.00 | 0.15 |
| nick_bp | 0.034 | 0.034 | -0.000 | 0.048 | 0.052 | 0.049 | 0.052 | +0.000 | 0.002 | 0.012/0.00/0.00 | 0.15 |
| elite_bp | 0.044 | 0.035 | -0.009 | 0.052 | 0.060 | 0.040 | 0.039 | -0.016 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| npc_bp | 0.047 | 0.031 | -0.015 | 0.059 | 0.057 | 0.036 | 0.032 | -0.024 | 0.004 | 0.006/0.00/0.00 | 0.15 |
| moon_bp | 0.032 | 0.024 | -0.008 | 0.030 | 0.028 | 0.029 | 0.032 | +0.002 | 0.004 | 0.000/0.00/0.00 | 0.15 |
| chairs_bp | 0.023 | 0.020 | -0.003 | 0.030 | 0.030 | 0.027 | 0.024 | -0.004 | 0.003 | 0.000/0.00/0.00 | 0.15 |
| refill_bp | 0.014 | 0.016 | +0.003 | 0.028 | 0.030 | 0.027 | 0.027 | -0.002 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| fishing_bp | 0.033 | 0.024 | -0.009 | 0.038 | 0.042 | 0.026 | 0.021 | -0.017 | 0.005 | 0.000/0.00/0.00 | 0.15 |
| expedition_bp | 0.034 | 0.020 | -0.014 | 0.033 | 0.038 | 0.025 | 0.019 | -0.014 | 0.006 | 0.000/0.00/0.00 | 0.15 |
| weather_bp | 0.024 | 0.013 | -0.010 | 0.025 | 0.027 | 0.023 | 0.022 | -0.003 | 0.001 | 0.006/0.00/0.00 | 0.15 |
| caravan_bp | 0.026 | 0.025 | -0.001 | 0.025 | 0.033 | 0.022 | 0.024 | -0.006 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| bounty_bp | 0.023 | 0.017 | -0.006 | 0.026 | 0.025 | 0.022 | 0.017 | -0.006 | 0.005 | 0.000/0.00/0.00 | 0.15 |
| death_bp | 0.017 | 0.013 | -0.004 | 0.024 | 0.023 | 0.021 | 0.021 | -0.003 | 0.000 | 0.004/0.00/0.00 | 0.15 |
| help_bp | 0.018 | 0.015 | -0.003 | 0.020 | 0.021 | 0.019 | 0.018 | -0.002 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| claims_bp | 0.032 | 0.017 | -0.015 | 0.026 | 0.031 | 0.019 | 0.012 | -0.013 | 0.007 | 0.000/0.00/0.00 | 0.15 |
| party_bp | 0.021 | 0.018 | -0.003 | 0.029 | 0.026 | 0.019 | 0.019 | -0.008 | 0.000 | 0.000/0.00/0.00 | 0.15 |
| town_bp | 0.025 | 0.018 | -0.008 | 0.029 | 0.033 | 0.018 | 0.012 | -0.016 | 0.006 | 0.000/0.00/0.00 | 0.15 |
| mail_bp | 0.024 | 0.012 | -0.012 | 0.026 | 0.028 | 0.018 | 0.012 | -0.012 | 0.006 | 0.006/0.00/0.00 | 0.15 |
| cleanup_bp | 0.017 | 0.015 | -0.002 | 0.016 | 0.017 | 0.018 | 0.013 | -0.001 | 0.005 | 0.000/0.00/0.00 | 0.15 |
| waystone_bp | 0.028 | 0.013 | -0.015 | 0.041 | 0.035 | 0.018 | 0.018 | -0.020 | 0.000 | 0.000/0.00/0.00 | 0.15 |
| leaves_bp | 0.019 | 0.019 | -0.000 | 0.020 | 0.028 | 0.017 | 0.018 | -0.006 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| news_bp | 0.014 | 0.012 | -0.002 | 0.015 | 0.016 | 0.016 | 0.014 | -0.001 | 0.001 | 0.037/0.00/0.00 | 0.15 |
| storm_bp | 0.032 | 0.013 | -0.020 | 0.031 | 0.037 | 0.015 | 0.015 | -0.019 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| night_bp | 0.015 | 0.012 | -0.004 | 0.013 | 0.016 | 0.015 | 0.012 | -0.001 | 0.004 | 0.000/0.00/0.00 | 0.15 |
| platypus_bp | 0.013 | 0.011 | -0.002 | 0.016 | 0.016 | 0.015 | 0.014 | -0.001 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| domt_bp | 0.034 | 0.015 | -0.019 | 0.033 | 0.035 | 0.015 | 0.014 | -0.020 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| rainbow_bp | 0.017 | 0.016 | -0.001 | 0.017 | 0.017 | 0.015 | 0.012 | -0.003 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| rain_bp | 0.014 | 0.013 | -0.001 | 0.016 | 0.015 | 0.014 | 0.012 | -0.002 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| cooking_bp | 0.025 | 0.014 | -0.011 | 0.028 | 0.033 | 0.014 | 0.013 | -0.017 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| crowns_bp | 0.022 | 0.013 | -0.009 | 0.025 | 0.026 | 0.014 | 0.016 | -0.011 | 0.002 | 0.019/0.00/0.00 | 0.15 |
| welcome_bp | 0.012 | 0.012 | +0.000 | 0.016 | 0.018 | 0.014 | 0.014 | -0.003 | 0.000 | 0.006/0.00/0.00 | 0.15 |
| phantom_bp | 0.014 | 0.013 | -0.002 | 0.017 | 0.017 | 0.014 | 0.013 | -0.004 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| meteor_bp | 0.020 | 0.016 | -0.004 | 0.021 | 0.023 | 0.013 | 0.014 | -0.008 | 0.000 | 0.000/0.00/0.00 | 0.15 |
| climate_bp | 0.012 | 0.011 | -0.001 | 0.015 | 0.018 | 0.013 | 0.011 | -0.004 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| translucent_bp | 0.010 | 0.012 | +0.002 | 0.012 | 0.014 | 0.013 | 0.012 | -0.001 | 0.002 | 0.000/0.00/0.00 | 0.15 |
| tornado_bp | 0.015 | 0.011 | -0.003 | 0.020 | 0.020 | 0.013 | 0.012 | -0.007 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| slots_bp | 0.013 | 0.014 | +0.001 | 0.014 | 0.013 | 0.013 | 0.013 | -0.001 | 0.000 | 0.000/0.00/0.00 | 0.15 |
| goals_bp | 0.015 | 0.009 | -0.005 | 0.015 | 0.012 | 0.012 | 0.011 | -0.002 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| settings_bp | 0.014 | 0.015 | +0.000 | 0.013 | 0.016 | 0.012 | 0.011 | -0.003 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| find_bp | 0.015 | 0.013 | -0.002 | 0.014 | 0.015 | 0.012 | 0.011 | -0.003 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| zones_bp | 0.021 | 0.011 | -0.010 | 0.025 | 0.028 | 0.011 | 0.010 | -0.016 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| harvest_bp | 0.015 | 0.009 | -0.006 | 0.014 | 0.014 | 0.011 | 0.011 | -0.003 | 0.000 | 0.000/0.00/0.00 | 0.15 |
| guard_bp | 0.015 | 0.011 | -0.005 | 0.017 | 0.023 | 0.011 | 0.009 | -0.010 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| farm_bp | 0.014 | 0.010 | -0.003 | 0.013 | 0.014 | 0.011 | 0.012 | -0.003 | 0.001 | 0.000/0.00/0.00 | 0.15 |
| realm_bundle-master | - | - | - | - | - | - | - | - | - | - | 0.15 |
| realm_bundle-fleet | - | - | - | - | - | - | - | - | - | - | 0.15 |

## Over budget (typical 0.15, map_bp/hud_bp 1, bundle 5 ms/tick)

| pack | budget | master-10 | fleet-10 | master-40 | fleet-40 / 40b |
|---|---|---|---|---|---|
| map_bp | 1 | 2.949 | 2.892 | 3.844 | 3.832 / 3.578 |
| build_bp | 0.15 | 0.503 | 0.438 | 0.917 | 0.777 / 0.732 |
| stash_bp | 0.15 | 0.168 | 0.170 | 0.544 | 0.567 / 0.525 |
| silly_bp | 0.15 | 0.144 | 0.140 | 0.277 | 0.288 / 0.256 |
| elytra_bp | 0.15 | 0.226 | 0.182 | 0.299 | 0.235 / 0.222 |
| admin_bp | 0.15 | 0.059 | 0.043 | 0.239 | 0.228 / 0.209 |
| saga_bp | 0.15 | 0.186 | 0.151 | 0.234 | 0.211 / 0.194 |
| wander_bp | 0.15 | 0.059 | 0.044 | 0.367 | 0.203 / 0.166 |
| stats_bp | 0.15 | 0.041 | 0.059 | 0.068 | 0.181 / 0.163 |

- At 10 players fleet is over budget only for map_bp (2.89), build_bp (0.44), elytra_bp (0.18), stash_bp (0.17) and saga_bp (0.15). The rest exceed it only at 40 players.
- **New over budget in fleet:** stats_bp at 40 players (0.068 → 0.17), caused by the ticker. Every other pack in this list was already over on master. wander_bp (-0.18), build_bp (-0.16) and map_bp (-0.14) improved, but they remain over budget.
- Bundle (5 ms): over at 40 players in both trees (master 9.3, fleet 8.6 steady) and over at 10 players for separate packs (master 6.4, fleet 5.8). On the real Realm Bundle at 10 players, **master is over (5.31 steady) and fleet is under (4.75 steady, 4.27 whole run)**.
- hud_bp is at 0.15-0.17, within its 1 ms budget.

## New warnings or errors

- Script errors: 0 in every soak in both trees.
- Shared by every run in both trees: 3 × "Custom Command alias [weather|hud|help] already in use" and 1 × "[Watchdog] High memory usage detected" at startup (the Watchdog line does not appear in bundle runs).
- Master only: `[elite] InvalidEntityError: Failed to get property 'dimension'` (3 in master-40, 8 in master-40b). Fleet has none.
- **Fleet has no warnings or errors that master doesn't have.** In the fleet suite, the only caught error logged as a warning is the injected `test: grant failed` in owed-legacy-restart, which passed and is intended.

## Fleet suite (`suite.mjs --jobs 2 --retry`, 249 scenarios, 80 min)

**Totals: 230 pass, 17 fail, 2 flaky, 0 timeout, 0 skipped.** 28 scenarios are new (not in master); 5 of them fail.

Every failed or flaky scenario that also exists in master was rerun on master with `suite.mjs --jobs 2 --retry --filter …` (14 scenarios): 11 pass, 1 flaky (atlas), 2 fail (calendar, wander).

### Regressions: pass on master, fail on fleet (failed twice on fleet, including the retry)

| scenario | fleet first failure | fleet log | master |
|---|---|---|---|
| admin-diag-bundle | 2 check(s) failed: Nicknames owns its 2 gamertag entries (4); Nicknames kept its entries and still saves (6) | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/admin-diag-bundle.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/admin-diag-bundle.out`) |
| admin-size-profile | no message matching /Server size: Large server\. Changed 8 settings\./ for Boss within 100 ticks | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/admin-size-profile.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/admin-size-profile.out`) |
| expedition-pending | 1 check(s) failed: the box is reset and the queued run starts without another command or restart | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/expedition-pending.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/expedition-pending.out`) |
| expedition-slot-spawn | reset | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/expedition-slot-spawn.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/expedition-slot-spawn.out`) |
| find-index | no form for Opener within 200 ticks | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/find-index.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/find-index.out`) |
| stash-pages | busy retry rebuilds page-count-dependent action indices | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/stash-pages.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/stash-pages.out`) |
| stats-new-name | no message matching /Mined/i for Nell within 100 ticks | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/stats-new-name.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/stats-new-name.out`) |
| stats-ticker | no message matching /Deaths/ for Ann within 80 ticks | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/stats-ticker.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/stats-ticker.out`) |
| wander-walk | no form for Tester within 200 ticks | `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/wander-walk.out` (+ .retry.out) | pass (`fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/wander-walk.out`) |

Probable: **atlas** failed twice on fleet ("chunk at 2000,2000 did not load in 400 ticks", then on retry "no message matching /Beat its three keepers/ for Tester within 60 ticks"). On master it was flaky (the same chunk-load failure, then a pass). The chunk timeout looks environmental; the keepers message failure on retry is the suspicious part. Logs: `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/atlas.out`, `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/atlas.retry.out`.

Notes: expedition-pending's scenario file differs between the trees, so each tree ran its own version. stats-ticker and stats-new-name fail with no chat message matching /Deaths/ or /Mined/ (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/stats-ticker.out`); this fits the fleet change that moved the ticker to a per-player action bar (setActionBar +1.2/tick) without updating these older scenarios. That cause is a guess and has not been verified. find-index, wander-walk and the new find-marker and w10-npc-nameless all fail with "no form for <player> within N ticks", which may share one cause.

### Fail in both trees (not regressions)

- calendar: fleet "the held siege tells one piece of town news"; master "every circle was put back (1 left); circle floor … restored (undefined)". The scenario files differ. (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/calendar.out`, `fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/calendar.out`)
- wander: "Hob is at his camp after the restart" on both. (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/wander.out`, `fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/wander.out`)

### Flaky on fleet, pass on master

- cleanup-keep ("the item next to the player was kept", passed on retry)
- guilds-placed-restart ("the player placed 30 pumpkins (28)", passed on retry)

### New scenarios that fail (5 of 28)

- build-beds: the harness wiring is broken. suite passes `--port 20064`, and `build-beds.mjs` throws ERR_PARSE_ARGS_UNKNOWN_OPTION. (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/build-beds.out`)
- welcome-generic-bundle: the harness wiring is broken. The `<stage>` placeholder is not substituted ("no such bundle: /home/user/wt/fleet/<stage>/realm_bundle"). (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/welcome-generic-bundle.out`)
- diag-owned-reload: "phase 1: the probe wrote decl:a and has its probe:big (4)" (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/diag-owned-reload.out`)
- find-marker: "no form for Seeker within 200 ticks" (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/find-marker.out`)
- w10-npc-nameless: "no form for Ann within 80 ticks" (`/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/w10-npc-nameless.out`)

## Files

- Profiles: `fleet/<run>.profile.json`, run output `fleet/<run>.out`, full BDS logs `fleet/logs/<run>.log` (runs: master-10, fleet-10, master-40, master-40b, fleet-40, fleet-40b, master-bundle-10, fleet-bundle-10)
- Bundles used: `fleet/realm_bundle-master.mcpack`, `fleet/realm_bundle-fleet.mcpack`
- Suite: `fleet/suite-fleet.json` and `.out`, logs in `/home/user/wt/fleet/tools/test-bds/logs/suite-2026-10-19T22-55-53-985Z/`; master rerun: `fleet/suite-master-rerun.json` and `.out`, logs in `fleet/master-rerun-logs/suite-2026-10-20T00-16-10-791Z/`
- RSS samples: `fleet/rss.log`
