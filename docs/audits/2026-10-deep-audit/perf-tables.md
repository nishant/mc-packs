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

