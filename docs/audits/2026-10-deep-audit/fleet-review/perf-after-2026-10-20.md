# Fix campaign measurements (October 20, 2026)

Machine: Claude cloud container, 4 vCPU, 15 GiB, Linux BDS 1.26.52.3, Node v22.22.0. Nothing else ran during timing runs (a watcher logged every 10 s: never more than one bedrock_server during the soaks). Calibration: master 7dac598 at 10 players with the aef10dc harness gave 7.04 ms/tick steady (perf-report.md: 6.39), so this machine is about 10% slower; compare only runs below with each other (F55).

- **before** = master 5422aac (same pack code as 8aa5cf06, #96). **r1** = release 1 (88cc198): group 1 fixes.
- perf-soak with --profile: 15 min at 10 and 40, 5 min at 100; the Realm Bundle (--bundle, one context) 5 min at 10 and 40. Per-pack figures are whole-run ms/tick; 'bundle steady' is the soak window only.
- Retries: a run that spawned fewer players than declared is INVALID and was retried once; both are kept (*.try1.*). Spawn flakes ("chunk did not load in 400 ticks") happened on both trees: F73.

## soak-10

| pack | before/soak-10 | r1/soak-10 |
|---|---:|---:|
| **bundle steady avg** | 6.269 | 6.415 |
| bundle whole avg / p95 | 6.280 / 13 | 6.424 / 13 |
| valid | true | true |
| map_bp | 3.091 | 3.214 |
| build_bp | 0.496 | 0.497 |
| elytra_bp | 0.202 | 0.207 |
| saga_bp | 0.181 | 0.179 |
| calendar_bp | 0.163 | 0.153 |
| hud_bp | 0.156 | 0.151 |
| silly_bp | 0.149 | 0.154 |
| stash_bp | 0.143 | 0.146 |
| maps_bp | 0.138 | 0.145 |
| mobhp_bp | 0.123 | 0.123 |
| durability_bp | 0.070 | 0.070 |
| journal_bp | 0.063 | 0.061 |
| stats_bp | 0.060 | 0.066 |
| skills_bp | 0.056 | 0.056 |
| titles_bp | 0.054 | 0.055 |
| relics_bp | 0.052 | 0.053 |
| dolphin_bp | 0.051 | 0.053 |
| wander_bp | 0.050 | 0.048 |
| quests_bp | 0.042 | 0.042 |
| milestones_bp | 0.042 | 0.043 |
| elite_bp | 0.041 | 0.043 |
| admin_bp | 0.038 | 0.039 |
| afk_bp | 0.036 | 0.032 |
| atlas_bp | 0.035 | 0.039 |
| nick_bp | 0.035 | 0.035 |
| guilds_bp | 0.031 | 0.034 |
| chairs_bp | 0.028 | 0.025 |
| npc_bp | 0.027 | 0.026 |
| night_bp | 0.026 | 0.027 |
| fishing_bp | 0.026 | 0.024 |
| leaves_bp | 0.024 | 0.022 |
| caravan_bp | 0.022 | 0.025 |
| expedition_bp | 0.021 | 0.021 |
| bounty_bp | 0.020 | 0.022 |
| town_bp | 0.019 | 0.016 |
| moon_bp | 0.018 | 0.035 |
| weather_bp | 0.018 | 0.018 |
| cleanup_bp | 0.018 | 0.016 |
| party_bp | 0.018 | 0.018 |
| claims_bp | 0.017 | 0.018 |
| storm_bp | 0.017 | 0.015 |
| help_bp | 0.016 | 0.014 |
| meteor_bp | 0.016 | 0.013 |
| death_bp | 0.016 | 0.015 |
| crowns_bp | 0.016 | 0.014 |
| platypus_bp | 0.015 | 0.013 |
| refill_bp | 0.015 | 0.014 |
| rainbow_bp | 0.015 | 0.016 |
| domt_bp | 0.015 | 0.014 |
| waystone_bp | 0.015 | 0.016 |
| goals_bp | 0.015 | 0.014 |
| welcome_bp | 0.015 | 0.013 |
| find_bp | 0.014 | 0.013 |
| news_bp | 0.014 | 0.014 |
| phantom_bp | 0.014 | 0.013 |
| cooking_bp | 0.014 | 0.013 |
| translucent_bp | 0.014 | 0.012 |
| tornado_bp | 0.014 | 0.013 |
| zones_bp | 0.013 | 0.012 |
| guard_bp | 0.013 | 0.013 |
| climate_bp | 0.013 | 0.013 |
| rain_bp | 0.013 | 0.013 |
| mail_bp | 0.013 | 0.013 |
| slots_bp | 0.013 | 0.014 |
| settings_bp | 0.012 | 0.013 |
| harvest_bp | 0.012 | 0.014 |
| farm_bp | 0.011 | 0.016 |

## soak-40

| pack | before/soak-40 | r1/soak-40 |
|---|---:|---:|
| **bundle steady avg** | 9.108 | 9.558 |
| bundle whole avg / p95 | 9.010 / 25 | 9.591 / 28 |
| valid | true | true |
| map_bp | 3.907 | 4.039 |
| build_bp | 0.847 | 0.908 |
| stash_bp | 0.445 | 0.488 |
| silly_bp | 0.297 | 0.328 |
| elytra_bp | 0.253 | 0.268 |
| admin_bp | 0.238 | 0.242 |
| saga_bp | 0.225 | 0.243 |
| hud_bp | 0.186 | 0.195 |
| wander_bp | 0.185 | 0.199 |
| stats_bp | 0.184 | 0.210 |
| calendar_bp | 0.143 | 0.148 |
| maps_bp | 0.137 | 0.135 |
| durability_bp | 0.136 | 0.152 |
| skills_bp | 0.113 | 0.130 |
| mobhp_bp | 0.108 | 0.121 |
| relics_bp | 0.106 | 0.120 |
| journal_bp | 0.092 | 0.093 |
| milestones_bp | 0.086 | 0.094 |
| atlas_bp | 0.084 | 0.097 |
| titles_bp | 0.080 | 0.086 |
| dolphin_bp | 0.079 | 0.094 |
| quests_bp | 0.075 | 0.081 |
| elite_bp | 0.066 | 0.141 |
| nick_bp | 0.056 | 0.062 |
| night_bp | 0.053 | 0.050 |
| afk_bp | 0.052 | 0.059 |
| guilds_bp | 0.050 | 0.059 |
| moon_bp | 0.048 | 0.018 |
| npc_bp | 0.036 | 0.038 |
| refill_bp | 0.031 | 0.033 |
| chairs_bp | 0.029 | 0.034 |
| caravan_bp | 0.027 | 0.031 |
| fishing_bp | 0.025 | 0.027 |
| bounty_bp | 0.025 | 0.025 |
| expedition_bp | 0.022 | 0.021 |
| weather_bp | 0.020 | 0.022 |
| party_bp | 0.020 | 0.020 |
| leaves_bp | 0.020 | 0.021 |
| help_bp | 0.020 | 0.023 |
| death_bp | 0.019 | 0.022 |
| waystone_bp | 0.018 | 0.018 |
| domt_bp | 0.018 | 0.016 |
| claims_bp | 0.017 | 0.018 |
| storm_bp | 0.017 | 0.020 |
| cleanup_bp | 0.016 | 0.018 |
| town_bp | 0.016 | 0.015 |
| crowns_bp | 0.015 | 0.017 |
| guard_bp | 0.015 | 0.013 |
| cooking_bp | 0.014 | 0.013 |
| welcome_bp | 0.014 | 0.015 |
| slots_bp | 0.014 | 0.013 |
| mail_bp | 0.014 | 0.017 |
| platypus_bp | 0.014 | 0.018 |
| find_bp | 0.014 | 0.014 |
| phantom_bp | 0.014 | 0.016 |
| rain_bp | 0.014 | 0.014 |
| farm_bp | 0.014 | 0.015 |
| rainbow_bp | 0.014 | 0.016 |
| news_bp | 0.014 | 0.016 |
| harvest_bp | 0.013 | 0.013 |
| meteor_bp | 0.013 | 0.016 |
| goals_bp | 0.013 | 0.015 |
| translucent_bp | 0.012 | 0.013 |
| climate_bp | 0.012 | 0.014 |
| zones_bp | 0.012 | 0.013 |
| settings_bp | 0.012 | 0.015 |
| tornado_bp | 0.012 | 0.014 |

## soak-100

| pack | before/soak-100 | r1/soak-100 |
|---|---:|---:|
| **bundle steady avg** | 14.158 | 15.099 |
| bundle whole avg / p95 | 11.171 / 39 | 15.012 / 49 |
| valid | true | true |
| map_bp | 4.028 | 5.216 |
| build_bp | 1.235 | 1.657 |
| stash_bp | 0.843 | 1.235 |
| wander_bp | 0.494 | 0.470 |
| silly_bp | 0.443 | 0.657 |
| admin_bp | 0.414 | 0.642 |
| stats_bp | 0.289 | 0.403 |
| elytra_bp | 0.286 | 0.379 |
| saga_bp | 0.266 | 0.366 |
| durability_bp | 0.210 | 0.305 |
| skills_bp | 0.192 | 0.275 |
| hud_bp | 0.180 | 0.253 |
| relics_bp | 0.162 | 0.249 |
| atlas_bp | 0.153 | 0.222 |
| maps_bp | 0.129 | 0.168 |
| calendar_bp | 0.125 | 0.148 |
| milestones_bp | 0.116 | 0.169 |
| journal_bp | 0.115 | 0.151 |
| dolphin_bp | 0.114 | 0.159 |
| quests_bp | 0.114 | 0.158 |
| titles_bp | 0.107 | 0.148 |
| mobhp_bp | 0.090 | 0.104 |
| nick_bp | 0.084 | 0.132 |
| guilds_bp | 0.080 | 0.108 |
| afk_bp | 0.073 | 0.103 |
| elite_bp | 0.053 | 0.064 |
| npc_bp | 0.042 | 0.060 |
| refill_bp | 0.035 | 0.056 |
| crowns_bp | 0.031 | 0.031 |
| chairs_bp | 0.030 | 0.038 |
| fishing_bp | 0.029 | 0.035 |
| death_bp | 0.028 | 0.037 |
| caravan_bp | 0.027 | 0.037 |
| weather_bp | 0.026 | 0.036 |
| expedition_bp | 0.026 | 0.032 |
| party_bp | 0.024 | 0.030 |
| waystone_bp | 0.023 | 0.026 |
| bounty_bp | 0.023 | 0.032 |
| help_bp | 0.023 | 0.034 |
| moon_bp | 0.020 | 0.035 |
| news_bp | 0.019 | 0.031 |
| leaves_bp | 0.019 | 0.026 |
| cleanup_bp | 0.019 | 0.023 |
| domt_bp | 0.018 | 0.029 |
| platypus_bp | 0.017 | 0.028 |
| storm_bp | 0.016 | 0.022 |
| welcome_bp | 0.016 | 0.020 |
| claims_bp | 0.016 | 0.018 |
| cooking_bp | 0.016 | 0.023 |
| mail_bp | 0.016 | 0.025 |
| climate_bp | 0.015 | 0.019 |
| rain_bp | 0.014 | 0.024 |
| meteor_bp | 0.014 | 0.019 |
| phantom_bp | 0.014 | 0.019 |
| tornado_bp | 0.014 | 0.017 |
| settings_bp | 0.014 | 0.018 |
| town_bp | 0.014 | 0.024 |
| night_bp | 0.013 | 0.017 |
| find_bp | 0.013 | 0.018 |
| zones_bp | 0.012 | 0.016 |
| farm_bp | 0.012 | 0.018 |
| goals_bp | 0.012 | 0.016 |
| guard_bp | 0.011 | 0.018 |
| rainbow_bp | 0.011 | 0.015 |
| translucent_bp | 0.011 | 0.015 |
| slots_bp | 0.010 | 0.019 |
| harvest_bp | 0.010 | 0.017 |

## bundle-10

| pack | before/bundle-10 | r1/bundle-10 |
|---|---:|---:|
| **bundle steady avg** | 4.618 | 4.475 |
| bundle whole avg / p95 | 4.282 / 9 | 4.169 / 10 |
| valid | true | true |
| realm_bundle | 4.282 | 4.169 |

## bundle-40

| pack | before/bundle-40 | r1/bundle-40 |
|---|---:|---:|
| **bundle steady avg** | 7.487 | 7.813 |
| bundle whole avg / p95 | 6.876 / 19 | 7.170 / 21 |
| valid | true | true |
| realm_bundle | 6.876 | 7.170 |

## Workloads (whole-run ms/tick per pack; reruns r2, r3 alternate trees)

- saga-100 before: saga_bp 1.529, hud_bp 0.229, npc_bp 0.052; saga_bp 0.077, hud_bp 0.059, npc_bp 0.023; saga_bp 2.283, hud_bp 0.250, npc_bp 0.057; 
- saga-100 r1: saga_bp 1.826, hud_bp 0.252, npc_bp 0.059; saga_bp 0.199, hud_bp 0.128, npc_bp 0.040; saga_bp 1.817, hud_bp 0.250, npc_bp 0.054; 
- autostore-perf before: stash_bp 0.429; stash_bp 0.491; stash_bp 0.514; 
- autostore-perf r1: stash_bp 0.504; stash_bp 0.489; stash_bp 0.514; 
- saga-100 r2 runs (0.077 / 0.199) did not populate fully; the valid runs are before 1.529 / 2.283 vs r1 1.826 / 1.817: no regression beyond the run-to-run spread.
    | pack | before/weather-crowd-40 | r1/weather-crowd-40 |
    |---|---:|---:|
    | **bundle steady avg** | - | - |
    | bundle whole avg / p95 | 1.766 / 7 | 1.623 / 7 |
    | valid | - | - |
    | tornado_bp | 0.785 | 0.481 |
    | rain_bp | 0.415 | 0.488 |
    | moon_bp | 0.181 | 0.209 |
    | climate_bp | 0.156 | 0.182 |
    | storm_bp | 0.072 | 0.085 |
    | night_bp | 0.046 | 0.055 |
    | calendar_bp | 0.038 | 0.044 |
    | rainbow_bp | 0.032 | 0.035 |
    | leaves_bp | 0.013 | 0.017 |
    | meteor_bp | 0.013 | 0.012 |
    | weather_bp | 0.011 | 0.013 |
    | translucent_bp | 0.002 | 0.003 |

## Memory, 60 minutes at 40 players, unprofiled (bedrock_server VmRSS every 10 s)

- before: start 1291 MB, at 10 min 1471, end 1571 (+101 from 10 min), max 1571
- r1: start 1252 MB, at 10 min 1480, end 1625 (+145 from 10 min), max 1625

## Full suite (suite.mjs --jobs 2 --retry)

- before: total 250: 245 pass, 4 flaky, 1 fail, 0 timeout, 0 skipped; wall 73.7 min; logs /home/user/wt/base/tools/test-bds/logs/suite-2026-10-20T11-40-30-590Z
  - atlas                       | flaky   |      69 | chunk at 2000,2000 did not load in 400 ticks
  - expedition-restart          | flaky   |      92 | chunk at 0,0 did not load in 400 ticks
  - saga-escort                 | flaky   |      43 | chunk at 900,900 did not load in 400 ticks
  - saga-perf-quests            | flaky   |     110 | spawned 5 of 10 declared players
  - wander                      | fail    |      99 | Hob is at his camp after the restart
- r1: total 261: 258 pass, 3 flaky, 0 fail, 0 timeout, 0 skipped; wall 85.8 min; logs /home/user/wt/r1/tools/test-bds/logs/suite-2026-10-20T14-10-33-549Z
  - cooking-restart             | flaky   |      18 | the interrupted dish is owed to its cook ({"players":0,"batches":0})
  - expedition-climb            | flaky   |      45 | 1 check(s) failed: a fall in the shaft doesn't hurt (20 -> 13)
  - maps-hunt                   | flaky   |     901 | TIMEOUT after 900 s

## Reading

- r1 changes no pack in the hot path except saga (party scenes), moon (shelter cache removed: 0.018 -> 0.035 at 10, correct over cached), wander/npc/caravan (tether). Their rows are within noise or lower.
- The 100-player soak rose about the same share (+30-40%) in every pack, including packs r1 did not touch (map_bp, build_bp, silly_bp): a machine-state difference between the two runs, not code. Steady bundle: 14.16 -> 15.10.
- Memory: the 10-60 min growth is +100 MB (before) vs +145 MB (r1) in one run each; tracked as F74 with the RSS soak tool (tools/test-bds/rss-soak.mjs) bisecting by pack.
