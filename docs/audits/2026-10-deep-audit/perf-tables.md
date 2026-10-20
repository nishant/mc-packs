# Performance evidence

## Current matched audit: 10 and 40 players (2026-10-19)

Production before: master `27f26f6e8eab780e7e18462c7475529028fdb92b` (the later `92ffb5ad` changes only review documentation; its packs tree is identical). Production after: `a1b2a32ce68eaf8568b2c44d69669bb1d95e59ef`; later suite/leaf-adapter commits change no production pack. Both sides use the same `a1b2a32c` native profiler runtime and scenario, Windows BDS 1.26.52.3, and the original declared workload: group 5, spread 240, two water players, two Nether players, commands 45 and refill 20.

Each accepted run retained every declared player through **900 steady game seconds / 18,000 ticks**. The figures below exclude the spawn ramp and sum **67 separate script contexts**. They are not the owner-deferred genuine Realm Bundle one-context run, client FPS, or all engine CPU. Each run's 30-second census observed one owned BDS and no other native server (31 samples at 10 players, 36 at 40); this is not a guarantee against every short external CPU task. The profiler uses 1 ms `Date.now` callback timing, includes synchronous native work, and does not attribute post-`await` continuations.

**Owner override (2026-10-20):** "lets skip the soak tests, let nishs claude do that later". The genuine final `414a18f6` Bundle + Resources run was identity-verified and stopped at 05:06:43 UTC (`USER_DEFERRED_INTERRUPTED`): it logged 40 players through 660 game seconds, but did not finish the declared 900-second window or produce a final timing report. It is NOT PASS and supplies no replacement timing here. Candidate 100/300, Saga 100/two quests/120 and the unstarted O10 idle diagnostic measurement are `USER_DEFERRED` to Nish's Claude. No completed hour or profile is rerun. The table's candidate remains the explicitly historical `a1b2a32c`, before the later two-tick Expedition loader-release fix and Realm News update; it is not a final-`414a18f6` performance certificate.

| Players | Master steady ms/tick | Candidate steady ms/tick | Workload acceptance |
|---|---:|---:|---|
| 10 | 6.648 | 4.941 | Both full 900-second windows valid; failed first candidate 7/10 admission excluded and retained separately |
| 40 | 9.429222222222222 | 7.972722222222222 | Both full 900-second windows valid; numerical budget FAIL |
| 100 | N/A | N/A | Master admission BLOCKED after two bounded attempts; candidate USER_DEFERRED before running, no partial-population timing substituted |

**Owner answer (2026-10-19): ACCEPTED_EXCEPTION.** The owner accepts the known whole-total 40-player target miss for this release, with documentation and pending the other gates. The measured total is about **15.45% lower**, but **does not meet under 5 ms/tick**. The unchanged canonical evaluator still returns failure. This is not a budget PASS, an increased threshold, or an implied waiver of individual-pack targets.

The individual failures at 40 players remain: Map **3.738 > 1**; Build **0.574222**, Stash **0.313889**, Silly **0.276**, Elytra **0.227944**, Saga **0.227**, Stats **0.212111**, Admin **0.183667**, Calendar **0.150444**, each greater than 0.15. Calendar is not rounded down into a pass. The current cadence/defaults remain; this Realm's capacity 10 / usual 1-4 players is context, not evidence of meeting the 40-player target. No further small safe O1 cut was identified in the bounded follow-up. That does not prove the target impossible, establish a mathematical time-budget floor, or separate JS from native read costs.

### Per behavior pack

Values are ms/tick over the steady window, rounded here to six decimal places; verdicts use the unrounded values. Source: the retained 67-row machine receipt `final-audit-matched-10-40-a1b2.json`, SHA-256 `0c32d5c37ace807255733fbd718253e2e6ee03d51b8cc96fcf438169c9e4af3d`, including input hashes, population/window proof and census limits.

| Pack | Master 10 | Candidate 10 | Master 40 | Candidate 40 |
|---|---:|---:|---:|---:|
| admin_bp | 0.055944 | 0.033000 | 0.218833 | 0.183667 |
| afk_bp | 0.033611 | 0.023889 | 0.054111 | 0.047389 |
| atlas_bp | 0.053056 | 0.029000 | 0.097000 | 0.072167 |
| bounty_bp | 0.026167 | 0.015667 | 0.028889 | 0.017000 |
| build_bp | 0.393778 | 0.314556 | 0.674222 | 0.574222 |
| calendar_bp | 0.155000 | 0.140444 | 0.162111 | 0.150444 |
| caravan_bp | 0.024722 | 0.017667 | 0.028111 | 0.021611 |
| chairs_bp | 0.027722 | 0.018500 | 0.034333 | 0.028944 |
| claims_bp | 0.030611 | 0.008778 | 0.033167 | 0.009722 |
| cleanup_bp | 0.016444 | 0.011111 | 0.016667 | 0.011333 |
| climate_bp | 0.012444 | 0.009389 | 0.013667 | 0.008722 |
| cooking_bp | 0.028056 | 0.008556 | 0.034611 | 0.009667 |
| crowns_bp | 0.023556 | 0.008833 | 0.024444 | 0.010889 |
| death_bp | 0.017222 | 0.008833 | 0.020722 | 0.014167 |
| dolphin_bp | 0.060444 | 0.042167 | 0.084889 | 0.068167 |
| domt_bp | 0.032444 | 0.009667 | 0.036056 | 0.012056 |
| durability_bp | 0.056500 | 0.048833 | 0.131556 | 0.119000 |
| elite_bp | 0.045000 | 0.082111 | 0.147667 | 0.088333 |
| elytra_bp | 0.223722 | 0.181778 | 0.323222 | 0.227944 |
| expedition_bp | 0.030722 | 0.012222 | 0.037722 | 0.013556 |
| farm_bp | 0.015556 | 0.006611 | 0.015556 | 0.010167 |
| find_bp | 0.016000 | 0.008667 | 0.017944 | 0.009833 |
| fishing_bp | 0.034500 | 0.016944 | 0.039722 | 0.018667 |
| goals_bp | 0.016167 | 0.007278 | 0.018056 | 0.009056 |
| guard_bp | 0.019389 | 0.008167 | 0.020222 | 0.009944 |
| guilds_bp | 0.036944 | 0.024389 | 0.060944 | 0.046611 |
| harvest_bp | 0.012222 | 0.008611 | 0.015056 | 0.009944 |
| help_bp | 0.015500 | 0.009444 | 0.022389 | 0.016611 |
| hud_bp | 0.156556 | 0.139778 | 0.195222 | 0.185444 |
| journal_bp | 0.050222 | 0.037444 | 0.067556 | 0.058056 |
| leaves_bp | 0.019333 | 0.011444 | 0.019167 | 0.013333 |
| mail_bp | 0.025167 | 0.009556 | 0.029333 | 0.009000 |
| map_bp | 3.280722 | 2.453444 | 3.800389 | 3.738000 |
| maps_bp | 0.156111 | 0.125056 | 0.181111 | 0.132222 |
| meteor_bp | 0.021889 | 0.008556 | 0.023000 | 0.009944 |
| milestones_bp | 0.047444 | 0.042444 | 0.093000 | 0.092333 |
| mobhp_bp | 0.116389 | 0.107000 | 0.121833 | 0.115000 |
| moon_bp | 0.023056 | 0.009500 | 0.054056 | 0.010778 |
| news_bp | 0.016111 | 0.009556 | 0.017111 | 0.012944 |
| nick_bp | 0.032111 | 0.024667 | 0.056389 | 0.056000 |
| night_bp | 0.026333 | 0.016111 | 0.056500 | 0.056500 |
| npc_bp | 0.054333 | 0.019278 | 0.063000 | 0.026389 |
| party_bp | 0.024167 | 0.011722 | 0.032389 | 0.015167 |
| phantom_bp | 0.014111 | 0.008889 | 0.018389 | 0.010889 |
| platypus_bp | 0.013500 | 0.011167 | 0.018444 | 0.012278 |
| quests_bp | 0.030833 | 0.033389 | 0.080056 | 0.068722 |
| rain_bp | 0.014833 | 0.008056 | 0.014611 | 0.008944 |
| rainbow_bp | 0.014944 | 0.009722 | 0.017444 | 0.009000 |
| refill_bp | 0.012611 | 0.009667 | 0.025333 | 0.019278 |
| relics_bp | 0.097222 | 0.044389 | 0.226444 | 0.105833 |
| saga_bp | 0.187389 | 0.159944 | 0.260000 | 0.227000 |
| settings_bp | 0.012944 | 0.010056 | 0.016556 | 0.010389 |
| silly_bp | 0.146611 | 0.131056 | 0.290333 | 0.276000 |
| skills_bp | 0.061833 | 0.048333 | 0.120722 | 0.106000 |
| slots_bp | 0.013167 | 0.007611 | 0.016222 | 0.009722 |
| stash_bp | 0.106833 | 0.090500 | 0.311333 | 0.313889 |
| stats_bp | 0.046722 | 0.065833 | 0.071611 | 0.212111 |
| storm_bp | 0.032944 | 0.012444 | 0.038111 | 0.014111 |
| titles_bp | 0.045944 | 0.036500 | 0.070000 | 0.064722 |
| tornado_bp | 0.018556 | 0.008889 | 0.020222 | 0.009278 |
| town_bp | 0.029667 | 0.010111 | 0.035500 | 0.011556 |
| translucent_bp | 0.012778 | 0.009444 | 0.015278 | 0.010000 |
| wander_bp | 0.066500 | 0.041722 | 0.427778 | 0.076444 |
| waystone_bp | 0.039333 | 0.010556 | 0.039833 | 0.009556 |
| weather_bp | 0.022556 | 0.012667 | 0.027667 | 0.016111 |
| welcome_bp | 0.014500 | 0.009667 | 0.015556 | 0.011778 |
| zones_bp | 0.028111 | 0.009667 | 0.029833 | 0.008167 |

The seven resource packs (`build_rp`, `hud_rp`, `platypus_rp`, `rain_rp`, `silly_rp`, `sky_rp`, `translucent_rp`) have no script callback ms/tick row: N/A, not zero measured cost or client-rendering approval.

### Invalid attempts and remaining scope

- Candidate 10-player v1 admitted 7/10 and ran no steady window; its unchanged v2 retry supplied the valid 10-player row.
- Master 100-player v1 admitted 95/100 and ran no steady window. Its only identical retry irreversibly lost a required player after three original ground probes and was stopped before further futile ramp work. Both are excluded; no 95-player or old historical value fills the 100-player column.
- Candidate 100, Saga 100 with two real quests each, the genuine one-context 40-player Realm Bundle and O10's remaining measurement are owner-deferred, not passes. The full functional master/candidate matrices and separately versioned corrected-case proofs are not replaced by these four historical profiles.
- The older unprofiled 40-player hour observed private-byte growth and working-set trimming; a completed population/window is not a leak rule-out, GC evidence or pack attribution.

## Historical initial-audit figures (different source, host and windows)

The original figures below are retained as history, not substituted into the current matched comparisons.

### 10 players

- window: 6094 ticks; args {'players': '10', 'seconds': '300'}
- whole bundle: 45.42 ms/tick in pack callbacks; per-tick p50 39 / p95 106 / p99 150 / max 254 ms; 1814 ticks over 50 ms
- calls/tick 1163.4; setDynamicProperty 1.036/tick (34.1 chars/tick); setActionBar 0.003/tick; setTitle 2.424/tick; runCommand 0.007/tick
- server (test pack tick meter): 11.56 TPS; tick interval avg 86.4 / p95 143 / p99 194 / max 534 ms; 5433 ticks > 55 ms, 1520 > 100 ms
- bedrock_server process: 87.6 CPU ms/tick (101% of one core), RSS 1336 MB

| # | pack | ms/tick avg | p95 tick ms | max tick ms | calls/tick | setDynamicProperty/tick | setActionBar/tick | setTitle/tick | runCommand/tick |
|---|---|---|---|---|---|---|---|---|---|
| 1 | map_bp | 24.946 | 52 | 137 | 22.95 | 0.000 | 0.000 | 2.422 | 0.000 |
| 2 | stash_bp | 8.971 | 24 | 52 | 11.75 | 0.922 | 0.000 | 0.000 | 0.000 |
| 3 | saga_bp | 1.396 | 5 | 15 | 30.58 | 0.002 | 0.000 | 0.000 | 0.000 |
| 4 | elytra_bp | 1.286 | 5 | 18 | 22.11 | 0.000 | 0.000 | 0.000 | 0.000 |
| 5 | calendar_bp | 1.244 | 5 | 13 | 26.16 | 0.000 | 0.000 | 0.000 | 0.000 |
| 6 | maps_bp | 1.224 | 5 | 17 | 46.77 | 0.000 | 0.000 | 0.000 | 0.000 |
| 7 | hud_bp | 1.202 | 4 | 18 | 20.94 | 0.000 | 0.000 | 0.000 | 0.000 |
| 8 | mobhp_bp | 1.150 | 4 | 13 | 15.91 | 0.000 | 0.000 | 0.000 | 0.000 |
| 9 | build_bp | 1.130 | 2 | 14 | 34.94 | 0.000 | 0.000 | 0.000 | 0.000 |
| 10 | npc_bp | 0.259 | 1 | 4 | 31.50 | 0.002 | 0.000 | 0.000 | 0.000 |
| 11 | wander_bp | 0.202 | 1 | 3 | 22.20 | 0.000 | 0.000 | 0.000 | 0.000 |
| 12 | caravan_bp | 0.195 | 1 | 3 | 10.90 | 0.000 | 0.000 | 0.000 | 0.000 |
| 13 | silly_bp | 0.175 | 1 | 3 | 17.83 | 0.000 | 0.000 | 0.000 | 0.000 |
| 14 | relics_bp | 0.125 | 1 | 6 | 21.60 | 0.000 | 0.000 | 0.000 | 0.000 |
| 15 | skills_bp | 0.096 | 1 | 4 | 22.81 | 0.003 | 0.003 | 0.000 | 0.000 |
| 16 | platypus_bp | 0.095 | 1 | 2 | 13.14 | 0.000 | 0.000 | 0.000 | 0.000 |
| 17 | journal_bp | 0.094 | 1 | 5 | 17.42 | 0.007 | 0.000 | 0.000 | 0.000 |
| 18 | elite_bp | 0.078 | 1 | 3 | 21.91 | 0.000 | 0.000 | 0.000 | 0.000 |
| 19 | durability_bp | 0.078 | 1 | 4 | 10.40 | 0.000 | 0.000 | 0.000 | 0.000 |
| 20 | titles_bp | 0.071 | 1 | 3 | 16.00 | 0.010 | 0.000 | 0.000 | 0.000 |
| 21 | dolphin_bp | 0.062 | 1 | 2 | 16.69 | 0.000 | 0.000 | 0.000 | 0.000 |
| 22 | atlas_bp | 0.060 | 1 | 5 | 20.68 | 0.002 | 0.000 | 0.001 | 0.000 |
| 23 | quests_bp | 0.060 | 1 | 3 | 16.95 | 0.019 | 0.000 | 0.000 | 0.000 |
| 24 | fishing_bp | 0.059 | 1 | 2 | 27.70 | 0.000 | 0.000 | 0.000 | 0.000 |
| 25 | storm_bp | 0.052 | 1 | 2 | 26.76 | 0.000 | 0.000 | 0.000 | 0.000 |
| 26 | waystone_bp | 0.049 | 0 | 2 | 36.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 27 | admin_bp | 0.045 | 0 | 4 | 15.51 | 0.000 | 0.000 | 0.000 | 0.000 |
| 28 | stats_bp | 0.045 | 0 | 4 | 15.60 | 0.002 | 0.000 | 0.000 | 0.000 |
| 29 | expedition_bp | 0.044 | 0 | 4 | 21.21 | 0.000 | 0.000 | 0.000 | 0.000 |
| 30 | cooking_bp | 0.041 | 0 | 3 | 25.74 | 0.000 | 0.000 | 0.000 | 0.000 |
| 31 | guilds_bp | 0.041 | 0 | 2 | 15.50 | 0.012 | 0.000 | 0.000 | 0.000 |
| 32 | domt_bp | 0.040 | 0 | 4 | 20.62 | 0.000 | 0.000 | 0.000 | 0.000 |
| 33 | claims_bp | 0.039 | 0 | 3 | 25.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 34 | town_bp | 0.037 | 0 | 3 | 25.85 | 0.000 | 0.000 | 0.000 | 0.000 |
| 35 | afk_bp | 0.036 | 0 | 2 | 10.35 | 0.000 | 0.000 | 0.000 | 0.000 |
| 36 | weather_bp | 0.034 | 0 | 2 | 15.50 | 0.002 | 0.000 | 0.000 | 0.000 |
| 37 | zones_bp | 0.033 | 0 | 3 | 25.74 | 0.000 | 0.000 | 0.000 | 0.000 |
| 38 | bounty_bp | 0.033 | 0 | 3 | 15.47 | 0.000 | 0.000 | 0.000 | 0.000 |
| 39 | phantom_bp | 0.032 | 0 | 2 | 11.24 | 0.000 | 0.000 | 0.000 | 0.000 |
| 40 | milestones_bp | 0.032 | 0 | 3 | 10.40 | 0.034 | 0.000 | 0.000 | 0.000 |
| 41 | mail_bp | 0.031 | 0 | 3 | 20.59 | 0.002 | 0.000 | 0.000 | 0.000 |
| 42 | crowns_bp | 0.030 | 0 | 2 | 20.60 | 0.005 | 0.000 | 0.000 | 0.000 |
| 43 | nick_bp | 0.030 | 0 | 2 | 10.40 | 0.000 | 0.000 | 0.000 | 0.000 |
| 44 | party_bp | 0.030 | 0 | 2 | 15.47 | 0.000 | 0.000 | 0.000 | 0.000 |
| 45 | moon_bp | 0.027 | 0 | 2 | 15.50 | 0.000 | 0.000 | 0.000 | 0.002 |
| 46 | meteor_bp | 0.025 | 0 | 2 | 15.58 | 0.000 | 0.000 | 0.000 | 0.000 |
| 47 | chairs_bp | 0.021 | 0 | 2 | 10.35 | 0.000 | 0.000 | 0.000 | 0.000 |
| 48 | tornado_bp | 0.020 | 0 | 1 | 15.45 | 0.000 | 0.000 | 0.000 | 0.000 |
| 49 | cleanup_bp | 0.020 | 0 | 2 | 10.35 | 0.000 | 0.000 | 0.000 | 0.000 |
| 50 | rainbow_bp | 0.020 | 0 | 2 | 10.45 | 0.000 | 0.000 | 0.000 | 0.000 |
| 51 | night_bp | 0.019 | 0 | 2 | 10.35 | 0.000 | 0.000 | 0.000 | 0.000 |
| 52 | guard_bp | 0.019 | 0 | 1 | 15.44 | 0.000 | 0.000 | 0.000 | 0.000 |
| 53 | leaves_bp | 0.018 | 0 | 2 | 11.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 54 | harvest_bp | 0.018 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 55 | death_bp | 0.017 | 0 | 2 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 56 | help_bp | 0.017 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 57 | climate_bp | 0.017 | 0 | 2 | 10.30 | 0.000 | 0.000 | 0.000 | 0.002 |
| 58 | news_bp | 0.017 | 0 | 2 | 10.30 | 0.011 | 0.000 | 0.000 | 0.000 |
| 59 | settings_bp | 0.016 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 60 | goals_bp | 0.016 | 0 | 2 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 61 | rain_bp | 0.015 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.003 |
| 62 | find_bp | 0.015 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 63 | translucent_bp | 0.015 | 0 | 2 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 64 | welcome_bp | 0.013 | 0 | 2 | 10.30 | 0.002 | 0.000 | 0.000 | 0.000 |
| 65 | slots_bp | 0.013 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 66 | farm_bp | 0.013 | 0 | 2 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |
| 67 | refill_bp | 0.013 | 0 | 1 | 10.30 | 0.000 | 0.000 | 0.000 | 0.000 |

Top callbacks of the 10 most expensive packs (ms total, calls, max single call ms):

- **map_bp**: `runInterval(1) @ main.js:632` 96928 ms / 6094 calls / max 74; `runInterval(1) @ main.js:948` 45828 ms / 6094 calls / max 54; `runInterval(10) @ main.js:992` 8613 ms / 610 calls / max 39
- **stash_bp**: `runInterval(2) @ pages.js:972` 54560 ms / 3047 calls / max 51; `system.after.scriptEventReceive @ settings.js:357` 51 ms / 31371 calls / max 1; `world.after.entitySpawn @ pages.js:784` 37 ms / 5762 calls / max 1
- **saga_bp**: `system.after.scriptEventReceive @ side.js:307` 7047 ms / 31371 calls / max 4; `runInterval(2) @ actors.js:325` 672 ms / 3047 calls / max 2; `system.after.scriptEventReceive @ main.js:526` 258 ms / 31371 calls / max 2
- **elytra_bp**: `system.after.scriptEventReceive @ side.js:307` 7026 ms / 31371 calls / max 3; `runInterval(1) @ main.js:692` 308 ms / 6094 calls / max 1; `runInterval(5) @ main.js:759` 222 ms / 1219 calls / max 1
- **calendar_bp**: `system.after.scriptEventReceive @ side.js:307` 7090 ms / 31371 calls / max 4; `system.after.scriptEventReceive @ main.js:2339` 134 ms / 31371 calls / max 1; `runInterval(4) @ side.js:328` 123 ms / 1524 calls / max 1
- **maps_bp**: `system.after.scriptEventReceive @ side.js:307` 6883 ms / 31371 calls / max 3; `runInterval(4) @ side.js:328` 136 ms / 1524 calls / max 1; `runInterval(40) @ main.js:559` 78 ms / 152 calls / max 1
- **hud_bp**: `system.after.scriptEventReceive @ side.js:307` 6955 ms / 31371 calls / max 3; `runInterval(4) @ side.js:328` 121 ms / 1524 calls / max 1; `runInterval(10) @ main.js:104` 113 ms / 610 calls / max 1
- **mobhp_bp**: `system.after.scriptEventReceive @ side.js:307` 6798 ms / 31371 calls / max 4; `runInterval(4) @ side.js:328` 108 ms / 1524 calls / max 1; `system.after.scriptEventReceive @ settings.js:350` 52 ms / 31371 calls / max 1
- **build_bp**: `runInterval(1) @ core/Preview.js:1047` 4177 ms / 6094 calls / max 14; `runInterval(1) @ main.js:875` 1149 ms / 6094 calls / max 5; `runInterval(2) @ core/GuideBook.js:277` 650 ms / 3047 calls / max 2
- **npc_bp**: `runInterval(2) updateLabels @ main.js:726` 1132 ms / 3047 calls / max 3; `system.after.scriptEventReceive @ main.js:2255` 98 ms / 31371 calls / max 1; `system.after.scriptEventReceive @ main.js:2204` 82 ms / 31371 calls / max 1

### 40 players

- window: 6713 ticks; args {'players': '40', 'seconds': '300'}
- whole bundle: 135.37 ms/tick in pack callbacks; per-tick p50 112 / p95 268 / p99 362 / max 593 ms; 6529 ticks over 50 ms
- calls/tick 2722.8; setDynamicProperty 0.396/tick (37.2 chars/tick); setActionBar 0.010/tick; setTitle 5.751/tick; runCommand 0.024/tick
- server (test pack tick meter): 5.22 TPS; tick interval avg 191.4 / p95 322 / p99 407 / max 695 ms; 6634 ticks > 55 ms, 6403 > 100 ms
- bedrock_server process: 193.9 CPU ms/tick (101% of one core), RSS 1458 MB

| # | pack | ms/tick avg | p95 tick ms | max tick ms | calls/tick | setDynamicProperty/tick | setActionBar/tick | setTitle/tick | runCommand/tick |
|---|---|---|---|---|---|---|---|---|---|
| 1 | map_bp | 108.152 | 198 | 356 | 51.94 | 0.000 | 0.000 | 5.745 | 0.000 |
| 2 | saga_bp | 3.038 | 11 | 30 | 64.23 | 0.006 | 0.000 | 0.000 | 0.000 |
| 3 | elytra_bp | 2.897 | 10 | 74 | 51.09 | 0.000 | 0.000 | 0.000 | 0.000 |
| 4 | build_bp | 2.829 | 5 | 11 | 71.18 | 0.000 | 0.000 | 0.000 | 0.000 |
| 5 | maps_bp | 2.800 | 10 | 57 | 111.98 | 0.000 | 0.000 | 0.000 | 0.000 |
| 6 | calendar_bp | 2.762 | 10 | 41 | 62.44 | 0.000 | 0.000 | 0.000 | 0.000 |
| 7 | hud_bp | 2.736 | 10 | 43 | 49.93 | 0.000 | 0.000 | 0.000 | 0.000 |
| 8 | mobhp_bp | 2.648 | 9 | 26 | 37.69 | 0.000 | 0.000 | 0.000 | 0.000 |
| 9 | stash_bp | 1.786 | 5 | 52 | 25.40 | 0.024 | 0.000 | 0.000 | 0.000 |
| 10 | wander_bp | 0.545 | 2 | 16 | 50.32 | 0.000 | 0.000 | 0.000 | 0.000 |
| 11 | npc_bp | 0.440 | 1 | 8 | 75.00 | 0.006 | 0.000 | 0.000 | 0.000 |
| 12 | silly_bp | 0.383 | 3 | 6 | 39.60 | 0.000 | 0.000 | 0.000 | 0.000 |
| 13 | caravan_bp | 0.324 | 1 | 5 | 25.41 | 0.000 | 0.000 | 0.000 | 0.000 |
| 14 | relics_bp | 0.310 | 2 | 17 | 49.76 | 0.003 | 0.000 | 0.000 | 0.000 |
| 15 | journal_bp | 0.277 | 1 | 16 | 38.32 | 0.025 | 0.000 | 0.000 | 0.000 |
| 16 | durability_bp | 0.203 | 2 | 8 | 24.89 | 0.000 | 0.000 | 0.000 | 0.000 |
| 17 | skills_bp | 0.153 | 1 | 7 | 50.97 | 0.009 | 0.009 | 0.000 | 0.000 |
| 18 | atlas_bp | 0.152 | 1 | 11 | 49.69 | 0.007 | 0.000 | 0.006 | 0.000 |
| 19 | titles_bp | 0.152 | 1 | 4 | 37.74 | 0.036 | 0.000 | 0.000 | 0.000 |
| 20 | dolphin_bp | 0.113 | 1 | 2 | 38.44 | 0.000 | 0.000 | 0.000 | 0.000 |
| 21 | quests_bp | 0.109 | 1 | 3 | 37.85 | 0.072 | 0.000 | 0.000 | 0.000 |
| 22 | waystone_bp | 0.102 | 1 | 3 | 87.05 | 0.000 | 0.000 | 0.000 | 0.000 |
| 23 | stats_bp | 0.098 | 1 | 3 | 37.34 | 0.006 | 0.000 | 0.000 | 0.000 |
| 24 | admin_bp | 0.097 | 1 | 11 | 37.29 | 0.000 | 0.000 | 0.000 | 0.000 |
| 25 | elite_bp | 0.093 | 1 | 5 | 50.07 | 0.000 | 0.000 | 0.000 | 0.000 |
| 26 | guilds_bp | 0.091 | 1 | 3 | 37.25 | 0.027 | 0.000 | 0.000 | 0.000 |
| 27 | fishing_bp | 0.088 | 1 | 3 | 63.07 | 0.000 | 0.000 | 0.000 | 0.000 |
| 28 | milestones_bp | 0.088 | 1 | 13 | 24.90 | 0.094 | 0.000 | 0.000 | 0.000 |
| 29 | domt_bp | 0.082 | 1 | 3 | 49.66 | 0.000 | 0.000 | 0.000 | 0.000 |
| 30 | claims_bp | 0.080 | 1 | 2 | 62.03 | 0.000 | 0.000 | 0.000 | 0.000 |
| 31 | storm_bp | 0.079 | 1 | 2 | 62.12 | 0.000 | 0.000 | 0.000 | 0.000 |
| 32 | cooking_bp | 0.077 | 1 | 3 | 61.99 | 0.000 | 0.000 | 0.000 | 0.000 |
| 33 | expedition_bp | 0.074 | 1 | 2 | 50.24 | 0.000 | 0.000 | 0.000 | 0.000 |
| 34 | town_bp | 0.071 | 1 | 3 | 62.09 | 0.000 | 0.000 | 0.000 | 0.000 |
| 35 | nick_bp | 0.068 | 1 | 2 | 24.89 | 0.000 | 0.000 | 0.000 | 0.000 |
| 36 | zones_bp | 0.068 | 1 | 2 | 61.97 | 0.000 | 0.000 | 0.000 | 0.000 |
| 37 | afk_bp | 0.067 | 1 | 5 | 24.84 | 0.000 | 0.000 | 0.000 | 0.000 |
| 38 | mail_bp | 0.063 | 1 | 2 | 49.59 | 0.006 | 0.000 | 0.000 | 0.000 |
| 39 | crowns_bp | 0.063 | 1 | 2 | 49.59 | 0.018 | 0.000 | 0.000 | 0.000 |
| 40 | weather_bp | 0.063 | 1 | 2 | 37.24 | 0.006 | 0.000 | 0.000 | 0.000 |
| 41 | bounty_bp | 0.062 | 1 | 3 | 37.22 | 0.000 | 0.000 | 0.000 | 0.000 |
| 42 | moon_bp | 0.054 | 1 | 3 | 37.25 | 0.000 | 0.000 | 0.000 | 0.006 |
| 43 | party_bp | 0.053 | 1 | 2 | 37.21 | 0.000 | 0.000 | 0.000 | 0.000 |
| 44 | death_bp | 0.052 | 1 | 4 | 24.82 | 0.003 | 0.000 | 0.000 | 0.000 |
| 45 | meteor_bp | 0.052 | 1 | 3 | 37.32 | 0.000 | 0.000 | 0.000 | 0.000 |
| 46 | guard_bp | 0.047 | 0 | 2 | 37.18 | 0.000 | 0.000 | 0.000 | 0.000 |
| 47 | tornado_bp | 0.043 | 0 | 2 | 37.19 | 0.000 | 0.000 | 0.000 | 0.000 |
| 48 | platypus_bp | 0.040 | 0 | 4 | 25.08 | 0.000 | 0.000 | 0.000 | 0.000 |
| 49 | help_bp | 0.039 | 0 | 3 | 24.82 | 0.000 | 0.000 | 0.000 | 0.000 |
| 50 | chairs_bp | 0.038 | 0 | 2 | 24.84 | 0.000 | 0.000 | 0.000 | 0.000 |
| 51 | leaves_bp | 0.037 | 0 | 2 | 25.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 52 | news_bp | 0.037 | 0 | 2 | 24.81 | 0.042 | 0.000 | 0.000 | 0.000 |
| 53 | find_bp | 0.036 | 0 | 1 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 54 | rainbow_bp | 0.036 | 0 | 2 | 24.94 | 0.000 | 0.000 | 0.000 | 0.000 |
| 55 | climate_bp | 0.036 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.006 |
| 56 | night_bp | 0.035 | 0 | 6 | 24.84 | 0.000 | 0.000 | 0.000 | 0.000 |
| 57 | cleanup_bp | 0.035 | 0 | 2 | 24.84 | 0.000 | 0.000 | 0.000 | 0.000 |
| 58 | welcome_bp | 0.033 | 0 | 2 | 24.81 | 0.006 | 0.000 | 0.000 | 0.000 |
| 59 | goals_bp | 0.033 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 60 | refill_bp | 0.032 | 0 | 2 | 24.81 | 0.000 | 0.000 | 0.000 | 0.000 |
| 61 | settings_bp | 0.032 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 62 | harvest_bp | 0.031 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 63 | slots_bp | 0.031 | 0 | 1 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 64 | phantom_bp | 0.031 | 0 | 2 | 24.86 | 0.000 | 0.000 | 0.000 | 0.000 |
| 65 | translucent_bp | 0.030 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 66 | farm_bp | 0.030 | 0 | 2 | 24.79 | 0.000 | 0.000 | 0.000 | 0.000 |
| 67 | rain_bp | 0.030 | 0 | 1 | 24.79 | 0.000 | 0.000 | 0.000 | 0.012 |

Top callbacks of the 10 most expensive packs (ms total, calls, max single call ms):

- **map_bp**: `runInterval(1) @ main.js:632` 504882 ms / 6713 calls / max 198; `runInterval(1) @ main.js:948` 174662 ms / 6713 calls / max 233; `runInterval(10) @ main.js:992` 44929 ms / 671 calls / max 151
- **saga_bp**: `system.after.scriptEventReceive @ side.js:307` 17313 ms / 83202 calls / max 14; `runInterval(2) @ actors.js:325` 1390 ms / 3356 calls / max 4; `system.after.scriptEventReceive @ main.js:526` 485 ms / 83202 calls / max 2
- **elytra_bp**: `system.after.scriptEventReceive @ side.js:307` 17432 ms / 83202 calls / max 19; `runInterval(5) @ main.js:759` 693 ms / 1342 calls / max 4; `runInterval(1) @ main.js:692` 602 ms / 6713 calls / max 2
- **build_bp**: `runInterval(1) @ core/Preview.js:1047` 9768 ms / 6713 calls / max 10; `runInterval(1) @ main.js:875` 4314 ms / 6713 calls / max 5; `runInterval(2) @ core/GuideBook.js:277` 2505 ms / 3356 calls / max 7
- **maps_bp**: `system.after.scriptEventReceive @ side.js:307` 17223 ms / 83202 calls / max 8; `runInterval(4) @ side.js:328` 413 ms / 1678 calls / max 3; `runInterval(40) @ main.js:559` 194 ms / 167 calls / max 2
- **calendar_bp**: `system.after.scriptEventReceive @ side.js:307` 17430 ms / 83202 calls / max 38; `runInterval(4) @ side.js:328` 386 ms / 1678 calls / max 2; `system.after.scriptEventReceive @ main.js:2339` 287 ms / 83202 calls / max 2
- **hud_bp**: `system.after.scriptEventReceive @ side.js:307` 17285 ms / 83202 calls / max 7; `runInterval(10) @ main.js:104` 368 ms / 671 calls / max 3; `runInterval(4) @ side.js:328` 361 ms / 1678 calls / max 1
- **mobhp_bp**: `system.after.scriptEventReceive @ side.js:307` 17155 ms / 83202 calls / max 8; `runInterval(4) @ side.js:328` 352 ms / 1678 calls / max 1; `system.after.scriptEventReceive @ settings.js:350` 156 ms / 83202 calls / max 2
- **stash_bp**: `runInterval(2) @ pages.js:972` 11734 ms / 3356 calls / max 50; `system.after.scriptEventReceive @ main.js:1114` 112 ms / 83202 calls / max 1; `system.after.scriptEventReceive @ settings.js:357` 108 ms / 83202 calls / max 1
- **wander_bp**: `runInterval(2) updateLabels @ main.js:1507` 2840 ms / 3356 calls / max 6; `system.after.scriptEventReceive @ main.js:1345` 272 ms / 83202 calls / max 1; `runInterval(10) @ main.js:1532` 126 ms / 671 calls / max 1
