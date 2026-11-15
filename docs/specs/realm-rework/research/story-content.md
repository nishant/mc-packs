# Story Questlines (`saga_bp`): narrative and structure review

Read-only research for the implementation spec. Nothing in `/home/user/mc-packs` was changed. Date: 2026-11-15.

**How this was made.** I loaded the story modules read-only in Node (`stories.js` and `stories/index.js` import nothing from `@minecraft/server`), measured them with scripts kept in `/tmp/claude-0/-home-user/e7d14249-f800-5d65-baae-735465eb4b11/scratchpad/tools/` (`inv.mjs`, `report.mjs`, `metrics.mjs`), and read the content itself: the prologue and Acts I and II in full, Acts III to V with pages cut at 210 characters, nine side questlines as skeletons (first and last intro page, every step, every choice, flag-dependent outro pages), and the remaining seven side questlines, the heart stories, wanderer chains, festivals, favors and one-offs as one line per chapter (steps and choices). So judgments about prose quality rest mainly on the main story; for the side content the structural findings (steps, flags, counts) are complete and the prose findings are samples. Play times are estimates from a per-step heuristic, not measurements.

**What the engine already does (so the spec does not re-invent it).** A chat line after every report names the next quest and its NPC; the log has `Now:` and `Current step`; every chapter has a paid hint (25% of its levels and Crowns) with coordinates; "Hear the intro again"; a Codex (108 entries); a party takes main, side and festival chapters on together (one accept, one report, the reporter's choice applied to every mate it fits; shared scenes for stealth, defeat, meet, escort, lead, defend, follow; counts add up); `realm:npc_flags` already sends about 25 story flags plus `fin:<story>` to the Townsfolk pack; `realm:gossip` carries town news. There is **no recap**, no single recommended next quest across stories, no cap on open stories, and no free "what now" line per step.

## Contents

1. Inventory: totals, every story, every chapter, objective types, dependency graph
2. The plot as written: acts, cast, mystery, endings
3. Critique
4. How much choice the content creates (the numbers behind "too much choice")
5. Rework proposal: spine, side categories, cut/merge list, drafted recaps, drafted hints, group play, NPC connective tissue, data fields, check-stories rules, tiers and sizes
6. Appendices: every long sentence, long vision scene and long label; flag table

---

# 1. Inventory

## 1.1 Totals

| | Count |
|---|---|
| Stories | 59 (7 main, 16 side incl. The Calling, 12 heart, 8 wanderer chains, 16 festival) |
| Chapters (quests) | 252 (main 68, side 91, heart 48, wanderer 29, festival 16) |
| Steps (objectives) | 607 (main 187, side 241, heart 81, wanderer 54, festival 44) |
| Text units (dialogue pages, replies, meet pages, clues, riddles, vision scenes) | 2,354; of them 1,904 intro/outro pages, 103 vision scenes, 71 clues |
| Words in stories | 78,512 (main 34,159; side 31,741; heart 6,191; wanderer 4,060; festival 2,361) |
| Choice buttons | 139, in 56 chapters; 48 chapters have a choice with a consequence, 27 of those change a player-wide flag or the mercy/iron counters |
| Codex entries | 108 |
| Daily favor templates | 48 (4 per questgiver, 12 questgivers) |
| Stranger one-off templates / hostile wanderers | 24 / 4 |
| Estimated play time | main story about 20 hours (prologue 2.5, Act I 2.7, II 3.7, III 2.9, IV 3.2, V 5); side questlines about 28; everything about 60 to 70 by the same heuristic (PACKS.md says "about 55 hours") |

Dialogue is shown as Bedrock forms, one page per form with a Next button: a median page is 168 characters (p90 229, longest 317; the 450 limit is never near). A main chapter averages 5.5 intro and 4.6 outro pages as authored (variants included).

## 1.2 Dependency graph of the main story

```
drowned_bell (6 quests, Tobin) ---+
   sets bell = silence | ring     +--> act1_signs (10, Sol) --> act2_choir (12, Reyes) --> act3_deep (10, Ida) --> act4_seals (12, Elsie) --> act5_lantern (14, Bram)
last_map (4 quests, Mara) --------+
   sets map = share | keep
```

Inside the acts:

- **Act I**: linear, 10 quests. Flags: `hollis` secret/urged (text only), `elsie` rest/pressed (+mercy/+iron), `act1:path` report/alone (+iron/+mercy; read in 14 places up to the epilogue).
- **Act II**: linear with one fork. `ledger` sets `g:quill` trusted/exposed, which picks quest 4a `double` or 4b `raid`. `hollis_night` sets `hollis_way` force/song; only **force** can set `g:hollis` = saved here (song leaves it open). `mayor` truth/bury.
- **Act III**: linear. `echoes` is an either/or (4 echo shards from an ancient city, or a Sculk Depths expedition when Expeditions is installed). `herald` is two parallel riddle sets by `g:hollis`; an unsaved Hollis is saved or lost here. `apron` forgive/condemn. `keys` miners/wayfarers.
- **Act IV**: council (pick the first seal) then three 3-quest branches in the player's order (story flags `first`, `second`, `now`; 9 of 12 quests are conditional), then `promise` allow/refuse and `gate`.
- **Act V**: `rally`; up to four ally quests by flag (`smugglers` if `g:quill` = trusted; `fen` if `g:vesna` = free; `fen_bound` if bound; `chapel` if `g:hollis` = saved) or `alone` when there are none; `long_night`; `gate` (sneak needs `g:mercy` >= 4); `herald` (four champions in sequence when Hollis was lost, else three); `choice` (three endings); one of three `dawn_*`; `forty`.

What unlocks what outside the main line:

| Finished | Opens |
|---|---|
| nothing | Graveyard Shift, Wren's Lost Lambs, The One That Got Away, Hearth and Table, The Wardens' Oath; hearts of Reyes, Moss, Wren, Bea; chains of Brannoch, Rook, Marigold, Tamsin, Vesk, Hob |
| The Drowned Bell | Little Turtles; heart of Tobin; Pell's chain |
| The Cartographer's Last Map | Edges of the Map; heart of Mara |
| Act I | A Room at the Inn, The Star Kittens, The Forge That Sings; hearts of Ida and Sol; Anwen's chain |
| Act II | The Witch's Bargain, Lamp in the Window (only if Hollis is saved), Smuggler's Run, The Mayor's Burden; hearts of Bram, Quill, Hollis |
| Act III | The Listening Deep (needs Expeditions); heart of Elsie |

Side content the main story reads back: *A Room at the Inn* finished (unlocks the Keeper's Gift ending), `g:vesna` from *The Witch's Bargain* (an ally quest in Act V), `hollis_faith.forgive`, `wardens_oath.oath`, `singing_forge.blade`, `smugglers_run.profits`, `hearth_and_table.marty`, `mayors_burden.plaque`, `graveyard_shift.stone` (one line of text each in Act V).

The mercy and iron counters: the main story offers 7 either/or pairs (inn, report or pursue, Quill, the mayor, the Herald, Elsie's apron, Elsie's promise) plus one mercy-only pick (the counter-song), so before Act V a player can hold at most 8 mercy or 7 iron from the main line. The Hollow Crown ending needs iron 5 or more; sneaking past the last circle needs mercy 4 or more. Side questlines add 8 more mercy/iron choices.

## 1.3 Every story (59)

Est. min is a per-step heuristic plus reading time; conditional branches are partly counted. "Party (engine)": shared = a party takes the chapters on together today; solo = each player's own by design.

| # | Id | Title | Kind | Giver | Requires | Ch | Steps | Words | Est. min | Objective types (count) | Choices (flags) | Titles / relics | Party (engine) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `drowned_bell` | The Drowned Bell | main 0 | tobin | - | 6 | 10 | 1240 | ~85 | reach 2, defeat 2, deliver 2, talk 1, fish 1, survive 1, interact 1 | bell | title Stormwatcher, title Bellkeeper, relic tide_boots | shared |
| 2 | `last_map` | The Cartographer's Last Map | main 0 | mara | - | 4 | 8 | 718 | ~65 | reach 4, collect 2, talk 1, deliver 1 | map | title Cartographer, relic compass_echoes | shared |
| 3 | `act1_signs` | Signs in the Sky | main 1 | sol | drowned_bell+last_map | 10 | 28 | 5246 | ~160 | vision 5, vigil 3, deliver 3, reach 2, talk 2, inspect 2, defeat 2, collect 1, event 1, interact 1, answer 1, meet 1, follow 1, stealth 1, defend 1, use 1 | hollis, elsie, g:mercy, g:iron, act1:path | title Sky-Watcher | shared |
| 4 | `act2_choir` | The Gray Choir | main 2 | reyes | act1_signs | 12 (2 cond.) | 35 | 5873 | ~225 | defeat 6, inspect 5, talk 3, interact 3, collect 3, stealth 2, defend 2, meet 2, follow 1, escort 1, wear 1, deliver 1, mine 1, reach 1, answer 1, vigil 1, vision 1 | g:quill, g:mercy, g:iron, vesna_first, g:hollis, hollis_way, parley, mayor | relic choir_mask, title Choir-Breaker | shared |
| 5 | `act3_deep` | Into the Deep | main 3 | ida | act2_choir | 10 | 27 | 5390 | ~175 | answer 6, vision 3, vigil 2, stealth 1, collect 1, event 1, reach 1, defeat 1, mine 1, inspect 1, interact 1, fish 1, follow 1, place 1, defend 1, deliver 1, sleep 1, talk 1, meet 1 | g:hollis, g:mercy, g:iron, elsie, keys | relic hal_compass, relic lantern_shard | shared |
| 6 | `act4_seals` | The Three Seals | main 4 | elsie | act3_deep | 12 (9 cond.) | 30 | 6641 | ~195 | talk 5, defeat 5, reach 4, interact 3, place 2, vigil 2, collect 1, ride 1, meet 1, stealth 1, answer 1, vision 1, deliver 1, sleep 1, inspect 1 | first, now, second, hal, act4:promise, g:iron, g:mercy | title Sealwarden | shared |
| 7 | `act5_lantern` | Lantern Night | main 5 | bram | act4_seals | 14 (8 cond.) | 49 | 9051 | ~305 | defeat 8, vigil 6, talk 5, deliver 3, interact 3, collect 3, meet 3, defend 3, vision 3, ride 2, place 2, event 2, reach 2, lead 1, answer 1, stealth 1, sleep 1 | horse, g:allies, g:fen, fen_call, g:mercy, g:iron, gate, g:ending | title Lanternbearer, title Keeper's Heir, relic keeper_lamp, title Hollow-Crowned, relic hollow_crown | shared |
| 8 | `inn_ghost` | A Room at the Inn | side | elsie | act1_signs | 7 | 16 | 2673 | ~90 | vigil 4, collect 3, meet 2, sleep 1, talk 1, inspect 1, vision 1, defend 1, answer 1, place 1 | lily, g:mercy | title Lily's Friend | shared |
| 9 | `graveyard_shift` | Graveyard Shift | side | moss | - | 6 | 15 | 1932 | ~85 | answer 3, defeat 2, talk 2, vigil 2, escort 1, defend 1, event 1, mine 1, place 1, inspect 1 | stone, g:mercy | title Night-Shift | shared |
| 10 | `vesna_bargain` | The Witch's Bargain | side | moss | act2_choir | 7 (2 cond.) | 17 | 2665 | ~110 | deliver 3, meet 2, interact 2, defeat 2, inspect 1, fish 1, vision 1, stealth 1, defend 1, place 1, vigil 1, wait 1 | g:vesna, g:mercy, g:iron | relic vesna_charm, title Fenwalker | shared |
| 11 | `hollis_faith` | Lamp in the Window | side | hollis | act2_choir; g:hollis=saved | 5 | 10 | 2177 | ~65 | place 2, deliver 2, sleep 1, talk 1, lead 1, vigil 1, vision 1, interact 1 | forgive, g:mercy, g:iron | title Lamplighter | shared |
| 12 | `lost_lambs` | Wren's Lost Lambs | side | wren | - | 7 | 13 | 2113 | ~90 | tend 4, lead 2, place 2, talk 1, vigil 1, defeat 1, tame 1, deliver 1 | cat | title Friend of Every Animal | shared |
| 13 | `star_kittens` | The Star Kittens | side | wren | act1_signs | 6 | 15 | 1967 | ~105 | talk 2, tame 2, vigil 2, meet 2, place 2, collect 1, fish 1, tend 1, reach 1, sleep 1 | cassie | title Keeper of the Seven | shared |
| 14 | `hatchlings` | Little Turtles | side | tobin | drowned_bell | 5 | 11 | 1471 | ~130 | reach 2, defend 2, inspect 1, vigil 1, place 1, collect 1, wait 1, ride 1, tend 1 | - | title Turtle Guardian | shared |
| 15 | `one_that_got_away` | The One That Got Away | side | tobin | - | 5 | 11 | 1544 | ~80 | fish 3, deliver 3, talk 1, vigil 1, survive 1, defeat 1, collect 1 | - | title Angler of Legend | shared |
| 16 | `hearth_and_table` | Hearth and Table | side | bea | - | 7 | 39 | 3217 | ~130 | deliver 29, defeat 3, fish 2, place 1, collect 1, survive 1, answer 1, meet 1 | way, pack:cooking_bp, marty, g:mercy, g:iron, marcel | title Master of the Hearth | shared |
| 17 | `wardens_oath` | The Wardens' Oath | side | reyes | - | 7 | 17 | 2045 | ~115 | defeat 3, defend 2, vigil 2, deliver 1, reach 1, event 1, inspect 1, follow 1, wear 1, place 1, talk 1, interact 1, answer 1 | oath, g:mercy, g:iron | title Sworn Warden | shared |
| 18 | `smugglers_run` | Smuggler's Run | side | quill | act2_choir | 5 | 14 | 2001 | ~80 | stealth 2, meet 2, sleep 1, wear 1, collect 1, ride 1, defeat 1, answer 1, lead 1, event 1, defend 1, talk 1 | profits, g:iron, g:mercy | title Night Runner | shared |
| 19 | `mayors_burden` | The Mayor's Burden | side | bram | act2_choir | 5 | 12 | 1818 | ~85 | inspect 2, meet 2, place 2, deliver 2, tend 1, use 1, vigil 1, wait 1 | feud, g:mercy, plaque | title Deputy Mayor | shared |
| 20 | `edges_of_map` | Edges of the Map | side | mara | last_map | 7 | 26 | 2362 | ~230 | collect 7, reach 6, event 5, ride 2, tame 1, vigil 1, meet 1, place 1, defeat 1, fish 1 | village | title Edgewalker | shared |
| 21 | `singing_forge` | The Forge That Sings | side | ida | act1_signs | 5 | 14 | 1661 | ~95 | deliver 2, talk 2, inspect 1, vision 1, reach 1, mine 1, defeat 1, collect 1, place 1, interact 1, defend 1, vigil 1 | blade | title Forge-Singer, relic singing_blade | shared |
| 22 | `listening_deep` | The Listening Deep | side | ida | act3_deep; pack:expedition_bp=on | 5 (2 cond.) | 7 | 1410 | ~190 | event 6, talk 1 | - | title Deep-Listener | shared |
| 23 | `heart_tobin` | The Gull's Last Voyage | heart | tobin | drowned_bell; g:aff_tobin=>=3 | 4 (1 cond.) | 8 | 706 | ~50 | vigil 2, talk 2, deliver 1, place 1, ride 1, use 1 | g:gull | - | solo (own) |
| 24 | `heart_mara` | Fenn's Unfinished Survey | heart | mara | last_map; g:aff_mara=>=3 | 4 (1 cond.) | 8 | 604 | ~55 | reach 3, deliver 3, use 1, place 1 | - | - | solo (own) |
| 25 | `heart_reyes` | The Warden's Helmet | heart | reyes | g:aff_reyes=>=3 | 4 (1 cond.) | 6 | 538 | ~45 | defeat 2, vigil 1, deliver 1, place 1, talk 1 | - | - | solo (own) |
| 26 | `heart_elsie` | Old Words | heart | elsie | act3_deep; g:aff_elsie=>=3, g:ending=!gift | 4 (1 cond.) | 5 | 676 | ~40 | deliver 3, vigil 1, sleep 1 | - | - | solo (own) |
| 27 | `heart_bram` | The Locked Drawer | heart | bram | act2_choir; g:aff_bram=>=3 | 4 (1 cond.) | 6 | 554 | ~30 | talk 3, deliver 1, place 1, use 1 | - | - | solo (own) |
| 28 | `heart_quill` | Mother's Teapot | heart | quill | act2_choir; g:aff_quill=>=3 | 4 (1 cond.) | 7 | 556 | ~55 | deliver 5, reach 1, vigil 1 | partner | - | solo (own) |
| 29 | `heart_ida` | Dunmore's Pick | heart | ida | act1_signs; g:aff_ida=>=3 | 4 (1 cond.) | 7 | 254 | ~45 | deliver 4, mine 2, reach 1 | - | - | solo (own) |
| 30 | `heart_sol` | Adela's Star | heart | sol | act1_signs; g:aff_sol=>=3 | 4 (1 cond.) | 8 | 450 | ~50 | vigil 4, deliver 3, use 1 | - | - | solo (own) |
| 31 | `heart_hollis` | Every Candle Lit | heart | hollis | act2_choir; g:aff_hollis=>=3, g:hollis=!lost | 4 (1 cond.) | 6 | 504 | ~40 | vigil 2, deliver 2, interact 1, sleep 1 | plea, g:mercy | - | solo (own) |
| 32 | `heart_moss` | The Unvisited Grave | heart | moss | g:aff_moss=>=3 | 4 (1 cond.) | 7 | 470 | ~35 | defeat 1, place 1, use 1, deliver 1, vigil 1, mine 1, talk 1 | - | - | solo (own) |
| 33 | `heart_wren` | Clover's Foal | heart | wren | g:aff_wren=>=3 | 4 (1 cond.) | 5 | 460 | ~35 | tend 2, deliver 2, vigil 1 | foal | - | solo (own) |
| 34 | `heart_bea` | The Last Ship's Supper | heart | bea | g:aff_bea=>=3 | 4 (1 cond.) | 8 | 419 | ~50 | deliver 4, talk 3, fish 1 | - | - | solo (own) |
| 35 | `w_pell_road` | Pell's Long Road | wander | w_pell | drowned_bell | 4 | 8 | 689 | ~35 | deliver 2, escort 1, reach 1, interact 1, vigil 1, place 1, answer 1 | way | title Pilgrim's Friend | solo (own) |
| 36 | `w_anwen_survey` | The Last Survey | wander | w_anwen | act1_signs | 4 | 8 | 641 | ~45 | deliver 2, reach 1, vigil 1, follow 1, inspect 1, interact 1, vision 1 | - | title Keeper of the Survey | solo (own) |
| 37 | `w_brannoch_deep` | Deepdelve's Last Seam | wander | w_brannoch | - | 4 | 8 | 522 | ~45 | defeat 2, deliver 1, mine 1, reach 1, place 1, inspect 1, collect 1 | - | title Gnasher's Bane | solo (own) |
| 38 | `w_rook_rival` | Rook's Wager | wander | w_rook | - | 5 (2 cond.) | 7 | 707 | ~45 | defeat 4, inspect 1, event 1, defend 1 | spite, g:iron, g:mercy, turned | title Rook's Better, title Rook's Rival | solo (own) |
| 39 | `w_marigold_garden` | The High Garden | wander | w_marigold | - | 3 | 5 | 331 | ~35 | deliver 2, lead 1, place 1, vigil 1 | - | title Highland Gardener | solo (own) |
| 40 | `w_tamsin_storm` | Catch the Lightning | wander | w_tamsin | - | 3 | 6 | 383 | ~40 | deliver 1, place 1, survive 1, event 1, ride 1, reach 1 | - | title Galeward's Second | solo (own) |
| 41 | `w_vesk_home` | The Long Way Home | wander | w_vesk | - | 3 | 6 | 394 | ~35 | deliver 2, vigil 1, fish 1, place 1, sleep 1 | - | title Homeward Friend | solo (own) |
| 42 | `w_hob_tales` | Hob's Tall Tales | wander | w_hob | - | 3 | 6 | 393 | ~30 | deliver 3, lead 1, talk 1, answer 1 | - | title Teller of Tales | solo (own) |
| 43 | `fest_hatchlings` | The Littlest Ones | festival | wren | cal:festival=hatchling_tide | 1 | 3 | 185 | ~45 | tend 1, event 1, vigil 1 | - | - | shared |
| 44 | `fest_tide_tobin` | What the Tide Brings | festival | tobin | cal:festival=hatchling_tide | 1 | 3 | 155 | ~45 | event 1, ride 1, deliver 1 | - | - | shared |
| 45 | `fest_night_shift` | The Night Shift | festival | moss | cal:festival=hatchling_tide | 1 | 2 | 145 | ~10 | defeat 1, talk 1 | - | - | shared |
| 46 | `fest_tide_supper` | Tide Supper | festival | elsie | cal:festival=hatchling_tide | 1 | 3 | 137 | ~15 | deliver 2, event 1 | - | - | shared |
| 47 | `fest_course` | Mara's Course | festival | mara | cal:festival=midsummer_regatta | 1 | 3 | 153 | ~40 | event 1, ride 1, talk 1 | - | - | shared |
| 48 | `fest_sure_thing` | A Sure Thing | festival | quill | cal:festival=midsummer_regatta | 1 | 3 | 158 | ~40 | event 1, reach 1, answer 1 | - | - | shared |
| 49 | `fest_water_safety` | Water Safety | festival | reyes | cal:festival=midsummer_regatta | 1 | 2 | 120 | ~10 | wear 1, vigil 1 | - | - | shared |
| 50 | `fest_picnic` | The Midsummer Picnic | festival | bea | cal:festival=midsummer_regatta | 1 | 3 | 144 | ~20 | deliver 2, event 1 | - | - | shared |
| 51 | `fest_judge` | The Judge's Dilemma | festival | bram | cal:festival=lantern_fair | 1 | 3 | 142 | ~40 | place 2, event 1 | - | - | shared |
| 52 | `fest_lanterns_ida` | Lanterns Like Stars | festival | ida | cal:festival=lantern_fair | 1 | 3 | 118 | ~50 | deliver 1, event 1, place 1 | - | - | shared |
| 53 | `fest_unremembered` | Candles for the Unremembered | festival | hollis | cal:festival=lantern_fair | 1 | 2 | 156 | ~15 | place 1, vigil 1 | - | - | shared |
| 54 | `fest_ghost_story` | A Proper Ghost Story | festival | moss | cal:festival=lantern_fair | 1 | 3 | 166 | ~40 | event 1, vigil 1, answer 1 | - | - | shared |
| 55 | `fest_falling_stars` | The Falling Stars | festival | sol | cal:festival=long_night | 1 | 3 | 141 | ~40 | event 1, vigil 1, talk 1 | - | - | shared |
| 56 | `fest_gift_table` | The Gift Table | festival | elsie | cal:festival=long_night | 1 | 3 | 147 | ~45 | deliver 2, event 1 | - | - | shared |
| 57 | `fest_speech` | The Long Night Speech | festival | bram | cal:festival=long_night | 1 | 3 | 160 | ~35 | answer 1, event 1, place 1 | - | - | shared |
| 58 | `fest_clover` | A Present for Clover | festival | wren | cal:festival=long_night | 1 | 2 | 134 | ~10 | tend 1, deliver 1 | - | - | shared |
| 59 | `the_calling` | The Calling | side | hollis | g:calling_ready=1, pack:skills_bp=on | 2 (2 cond.) | 4 | 685 | ~70 | event 2, talk 2 | g:called | - | shared |

## 1.4 Totals by kind

| Kind | Stories | Chapters | Steps | Words | Est. hours (all branches) |
|---|---|---|---|---|---|
| main | 7 | 68 | 187 | 34159 | ~20 |
| side | 16 | 91 | 241 | 31741 | ~29 |
| heart | 12 | 48 | 81 | 6191 | ~9 |
| wander | 8 | 29 | 54 | 4060 | ~5 |
| festival | 16 | 16 | 44 | 2361 | ~8 |
| **all stories** | 59 | 252 | 607 | 78512 | ~72 |

Plus 48 daily favor templates (2603 words), 24 stranger one-off templates (1685 words) and 4 hostile wanderers (445 words). Text units ("pages": intro, outro, reply, meet pages, clues, riddles, vision scenes): 2354. Choices: 139. Vision scenes: 103. Clues: 71. Grand total words: 83245.

## 1.5 Objective-type distribution (607 steps in stories)

| Type | Count | Share |
|---|---|---|
| deliver | 107 | 17.6% |
| vigil | 54 | 8.9% |
| defeat | 49 | 8.1% |
| talk | 47 | 7.7% |
| reach | 37 | 6.1% |
| place | 36 | 5.9% |
| event | 34 | 5.6% |
| collect | 28 | 4.6% |
| answer | 22 | 3.6% |
| interact | 20 | 3.3% |
| inspect | 20 | 3.3% |
| meet | 20 | 3.3% |
| vision | 18 | 3.0% |
| defend | 17 | 2.8% |
| fish | 12 | 2.0% |
| ride | 11 | 1.8% |
| tend | 11 | 1.8% |
| sleep | 10 | 1.6% |
| stealth | 9 | 1.5% |
| mine | 8 | 1.3% |
| use | 7 | 1.2% |
| lead | 7 | 1.2% |
| follow | 5 | 0.8% |
| survive | 4 | 0.7% |
| wear | 4 | 0.7% |
| tame | 4 | 0.7% |
| escort | 3 | 0.5% |
| wait | 3 | 0.5% |

Top types by kind: **main**: defeat 24, talk 18, reach 16, vigil 14, vision 13, deliver 12; **side**: deliver 43, vigil 18, collect 16, place 16, event 16, talk 15; **heart**: deliver 30, vigil 13, talk 10, place 5, use 5, reach 5; **wander**: deliver 13, defeat 6, place 5, reach 4, vigil 4, inspect 3; **festival**: event 12, deliver 9, vigil 5, place 5, talk 3, answer 3.

Favors by type: deliver 23, defeat 4, reach 3, fish 3, vigil 3, place 3, mine 2, collect 2, interact 2, tend 2, tame 1. Favors per NPC: mara 4, tobin 4, reyes 4, elsie 4, bram 4, quill 4, ida 4, sol 4, hollis 4, moss 4, wren 4, bea 4.

Clock-bound steps: 54 vigils (53 tied to a time of day, 72 minutes of standing still in total), 10 sleep steps, 3 wait steps, 4 weather survive steps, 15 night-only defeat steps, 5 timed (`within`) steps.

## 1.6 Every chapter (252)

Step notation: type, count, seconds, @place, NPC, [champion]; `?` optional, `|` one way of an either/or, `*` exists only for some flag values.

Format: `chapter id` "Title" (starts at > reports to) [exists only when]: steps. Flags read / set. Reward.


**The Drowned Bell** (`drowned_bell`, main act 0, giver tobin, requires -, ~85 min)

1. `salt` "Salt and Silence" (tobin): reach @lighthouse; talk reyes. 3L 0C.
2. `choir` "The Drowned Choir" (reyes): defeat 12; fish 5. 4L 40C.
3. `vigil` "The Storm Vigil" (tobin): survive 120s @lighthouse. 5L 0C, title Stormwatcher.
4. `iron` "Iron and Sea-Glass" (ida): deliver 24 ida; deliver 12 ida. Sets bell=silence / bell=ring. 5L 60C.
5. `sunken` "The Sunken Bell" (ida): reach @sunken_bell; interact 3 @sunken_bell. 5L 0C.
6. `warden` "The Bell Warden" (bram > tobin): defeat @sunken_bell [The Bell Warden]. 10L 150C, title Bellkeeper, relic tide_boots.

**The Cartographer's Last Map** (`last_map`, main act 0, giver mara, requires -, ~65 min)

1. `pins` "Pins in an Old Map" (mara): collect; collect 8. 2L 0C.
2. `far` "Three Pins" (mara): reach; reach; reach. 6L 60C.
3. `chapel` "The Old Chapel" (mara): reach @old_chapel; talk sol. 5L 0C.
4. `last` "The Last Map" (mara): deliver mara. Sets map=share / map=keep. 8L 100C, title Cartographer, relic compass_echoes.

**Signs in the Sky** (`act1_signs`, main act 1, giver sol, requires drowned_bell+last_map, ~160 min)

1. `smudge` "A Smudge in the East" (sol): vigil 60s @lighthouse; deliver sol. 4L 50C.
2. `fallen` "Fallen Light" (sol): reach @starfall; collect 8; vision @starfall; event?*. Reads pack:meteor_bp. Sets fresh=meteor. 5L 70C.
3. `rhyme` "The Skipping Song" (wren > tobin): deliver 3 wren; talk tobin. 4L 50C.
4. `keeper` "The Keeper Who Doesn't Sleep" (hollis): interact 4 @old_chapel; vigil 90s @old_chapel; vision @old_chapel. Sets hollis=secret / hollis=urged. 5L 60C.
5. `graves` "What Moss Saw" (moss): inspect @graveyard; defeat 6 @graveyard. 6L 70C.
6. `echo` "Fenn's Second Map" (mara): reach @observatory; answer @observatory; meet @observatory. 6L 80C.
7. `inn` "The Inn Remembers" (bea > elsie): deliver elsie; vision. Sets elsie=rest / +g:mercy / elsie=pressed / +g:iron. 5L 70C.
8. `song` "Song in the Dark" (wren > hollis): follow @choir_ring; stealth @choir_ring; vision @choir_ring. 7L 90C.
9. `choice` "Report or Pursue" (hollis): talk reyes*; inspect @choir_ring*; defend @old_chapel; defeat @old_chapel [The Gray Hand]. Reads act1:path. Sets act1:path=report / +g:iron / act1:path=alone / +g:mercy. 7L 100C.
10. `count` "The Sky-reader's Count" (sol): use 3 @observatory; vigil 90s @observatory; vision @observatory. 10L 200C, title Sky-Watcher.

**The Gray Choir** (`act2_choir`, main act 2, giver reyes, requires act1_signs, ~225 min)

1. `pattern` "The Pattern" (reyes): inspect; inspect; inspect; defeat 6. 4L 50C.
2. `pip` "Pip Is Missing" (reyes): follow; stealth; escort. 6L 80C.
3. `ledger` "Quill's Ledger" (reyes > quill): inspect; talk quill. Sets g:quill=trusted / +g:mercy / g:quill=exposed / +g:iron. 4L 60C.
4. `double` "The Double Agent" (quill) [only g:quill=trusted]: wear; stealth @sea_cave; interact @sea_cave; talk quill. Reads g:quill. 6L 90C.
5. `raid` "Raid on the Cove" (reyes) [only g:quill=exposed]: defend @sea_cave; defeat 20 @sea_cave. Reads g:quill. 7L 100C.
6. `letter` "The Cantor's Letter" (reyes > ida): deliver 6 ida; defeat [Hush, the Choir's Thief]. 6L 80C.
7. `confession` "Hollis's Confession" (hollis > moss): mine 12; inspect @graveyard. 5L 70C.
8. `fen` "The Witch of Hollow Fen" (moss): meet @witch_hut; collect; collect. Sets vesna_first=polite / vesna_first=rude. 5L 60C.
9. `tear` "A Tear from the Fire" (moss): reach; collect; answer @witch_hut. 7L 100C.
10. `hollis_night` "The Night Hollis Sang" (moss > hollis): defend @lighthouse*; interact 3 @old_chapel*; vigil 120s @old_chapel*. Reads hollis_way. Sets g:hollis=saved / hollis_way=force / hollis_way=song / +g:mercy. 8L 110C.
11. `ring_burns` "The Gray Ring Burns" (reyes): meet @choir_ring; defeat 20 @choir_ring*; defeat 14 @choir_ring*; defeat @choir_ring [The Cantor]; interact 3 @choir_ring. Reads act1_signs.act1:path. Sets parley=offered / parley=refused. 8L 120C, relic choir_mask.
12. `mayor` "What the Mayor Knew" (bram): talk tobin; vision. Sets mayor=truth / +g:mercy / mayor=bury / +g:iron. 10L 250C, title Choir-Breaker.

**Into the Deep** (`act3_deep`, main act 3, giver ida, requires act2_choir, ~175 min)

1. `echoes` "Echoes in Crystal" (ida): stealth @old_mine; collect| 4; event|*. Reads pack:expedition_bp. Sets shards=city / shards=depths. 5L 80C.
2. `lamp` "Lantern of the Deep" (ida): reach; vision. 4L 60C.
3. `mine` "The Abandoned Mine" (ida): defeat 10; mine 40; inspect @old_mine. 6L 90C.
4. `listening` "The Listening Stone" (moss): interact @old_chapel; vision @old_chapel. 5L 70C.
5. `tobin` "Tobin's Silence" (tobin): vigil 60s @lighthouse; fish 3. 4L 50C, relic hal_compass.
6. `flame` "The Leaning Flame" (ida): follow @seal_stone; place 12 @seal_stone. 5L 70C.
7. `seal` "The Stone Seal" (ida): defend @seal_stone; vision @seal_stone. 7L 110C.
8. `herald` "The Herald's Voice" (reyes): answer @old_chapel*; answer @old_chapel*; answer @old_chapel*; answer @graveyard*; answer @graveyard*; answer @graveyard*. Reads g:hollis. Sets g:hollis=saved / +g:mercy / g:hollis=lost / +g:iron. 6L 90C.
9. `apron` "Elsie's Apron" (bea > elsie): deliver elsie; sleep. Sets elsie=forgive / +g:mercy / elsie=condemn / +g:iron. 6L 80C.
10. `keys` "Three Keys" (elsie): talk sol; meet @observatory; vigil 60s @observatory. Sets keys=miners / keys=wayfarers. 10L 250C, relic lantern_shard.

**The Three Seals** (`act4_seals`, main act 4, giver elsie, requires act3_deep, ~195 min)

1. `council` "The Council at the Inn" (elsie): talk reyes; talk tobin; talk ida; talk sol. Sets first=tide,now=tide / first=stone,now=stone / first=sky,now=sky. 4L 60C.
2. `tide_vault` "The Drowned Vaults" (tobin) [only now=tide]: collect 16; defeat 8. Reads now. 5L 70C.
3. `tide_boat` "Tobin Rows Out" (tobin) [only now=tide]: ride; reach @seal_tide; defeat @seal_tide [The Drowned Gatekeeper]. Reads now. 6L 90C.
4. `tide_echo` "Hal's Echo" (tobin) [only now=tide]: meet @seal_tide; interact 4 @seal_tide. Reads now. Sets second=stone,now=stone / second=sky,now=sky / now=stone / now=sky / now=done / hal=carried / hal=listened. 8L 120C.
5. `stone_door` "The Cracked Door" (ida) [only now=stone]: reach; stealth @seal_stone. Reads now. 5L 70C.
6. `stone_frame` "The Frame of the Deep" (ida) [only now=stone]: place 16 @seal_stone; vigil 60s @seal_stone. Reads now. 6L 90C.
7. `stone_light` "The Stone Remembers" (ida) [only now=stone]: answer @seal_stone; interact 4 @seal_stone. Reads now. Sets second=tide,now=tide / second=sky,now=sky / now=tide / now=sky / now=done. 8L 120C.
8. `sky_stair` "The Stair to the Sky" (sol) [only now=sky]: reach; vigil 90s @seal_sky. Reads now. 5L 70C.
9. `sky_bridge` "A Bridge of Glass" (sol) [only now=sky]: place 24 @seal_sky; defeat @seal_sky [The Lantern Thief]; defeat 4 @seal_sky. Reads now. 6L 90C.
10. `sky_vision` "The Lantern's Long Road" (sol) [only now=sky]: vision @seal_sky; interact 4 @seal_sky. Reads now. Sets second=tide,now=tide / second=stone,now=stone / now=tide / now=stone / now=done. 8L 120C.
11. `promise` "Elsie's Choice" (elsie): talk wren; deliver elsie; sleep. Sets act4:promise=allow / +g:iron / act4:promise=refuse / +g:mercy. 6L 100C.
12. `gate` "The Gate Opens" (reyes > elsie): reach @hollow_gate; inspect @hollow_gate; defeat 12 @hollow_gate. 10L 250C, title Sealwarden.

**Lantern Night** (`act5_lantern`, main act 5, giver bram, requires act4_seals, ~305 min)

1. `rally` "Rally the Town" (bram > wren): deliver 64 reyes; deliver 4 reyes; deliver 24 bea; lead 3 @meadow. Sets horse=ember / horse=comet. 6L 100C.
2. `smugglers` "Quill's Last Run" (quill) [only g:quill=trusted]: interact 4 @sea_cave; ride; talk quill. Reads g:quill. Sets +g:allies. 5L 80C.
3. `fen` "A Song from the Fen" (moss) [only g:vesna=free]: collect 8; collect 6; meet @witch_hut; vigil 60s @witch_hut. Reads g:vesna. Sets +g:allies. 5L 80C.
4. `fen_bound` "The Witch Who Must Come" (moss) [only g:vesna=bound]: collect; vigil 30s @witch_hut; meet @witch_hut. Reads g:vesna. Sets g:fen=called / +g:allies / fen_call=promised / +g:mercy / fen_call=ordered / +g:iron. 5L 80C.
5. `chapel` "A Lamp for the Lost" (hollis) [only g:hollis=saved]: interact 6 @old_chapel; answer hollis; talk moss. Reads g:hollis. Sets +g:allies. 5L 80C.
6. `alone` "No One Is Coming" (reyes) [only g:allies=<=0]: place 32 @lighthouse; defeat 12 @lighthouse. Reads g:allies. 6L 100C.
7. `long_night` "The Long Night" (reyes): defend @lighthouse*; defend @lighthouse*; defeat 12 @lighthouse*; defeat 10 @lighthouse*; defeat 15 @lighthouse*; vigil 60s @lighthouse; event? @lighthouse*. Reads g:allies, g:quill, g:vesna, g:fen, g:hollis, pack:moon_bp. Sets moon=red. 8L 120C.
8. `gate` "Through the Gate" (sol): reach @hollow_gate; stealth @hollow_gate*; defend @hollow_gate*; vision @hollow_gate. Reads gate. Sets gate=sneak / gate=fight. 7L 120C.
9. `herald` "The Herald" (elsie): defeat @hollow_gate [Hollis, the Hollow's Choir]*; defeat @hollow_gate [Brother Ashgrave]; defeat @hollow_gate [The Hollow Herald]; defeat @hollow_gate [The Hunger Below]. Reads g:hollis. 10L 200C.
10. `choice` "The Lantern Passes" (elsie): reach @seal_sky; interact 3 @seal_sky; vigil 60s @seal_sky; vision @seal_sky. Sets g:ending=relight / +g:mercy / g:ending=gift / g:ending=crown / +g:iron. 8L 150C.
11. `dawn_relight` "Dawn" (tobin) [only g:ending=relight]: meet @lighthouse; vigil 60s @lighthouse; event?*. Reads g:ending, pack:rainbow_bp. Sets bow=seen. 10L 400C, title Lanternbearer.
12. `dawn_gift` "Dawn" (wren) [only g:ending=gift]: vision; talk bea; talk bram. Reads g:ending. 10L 300C, title Keeper's Heir, relic keeper_lamp.
13. `dawn_crown` "Dawn" (bram) [only g:ending=crown]: talk reyes; sleep. Reads g:ending. 10L 300C, title Hollow-Crowned, relic hollow_crown.
14. `forty` "Forty Winters" (moss > tobin): place @graveyard; ride*; vigil 60s @lighthouse*. Reads drowned_bell.bell. 10L 300C.

**A Room at the Inn** (`inn_ghost`, side, giver elsie, requires act1_signs, ~90 min)

1. `cold_room` "Room Three" (elsie > bea): sleep; talk bea. 2L 25C.
2. `odd_places` "Toys in Odd Places" (elsie): vigil 40s @graveyard; inspect @graveyard. 3L 30C.
3. `sea_kept` "What the Sea Kept" (elsie): collect; collect; collect. 3L 35C.
4. `small_hand` "A Small Cold Hand" (elsie): vigil 60s @graveyard; meet @graveyard. Sets lily=told / +g:mercy / lily=waiting. 4L 40C.
5. `storm_child` "The Long Storm's Child" (tobin > elsie): vigil 30s @lighthouse; vision @lighthouse. 3L 35C.
6. `lullaby` "The Little Lantern" (elsie): defend @graveyard; answer @graveyard. 4L 40C.
7. `flower` "A Flower for Lily" (elsie): place @graveyard; vigil 60s @graveyard; meet @graveyard. 5L 60C, title Lily's Friend.

**Graveyard Shift** (`graveyard_shift`, side, giver moss, requires -, ~85 min)

1. `gerald` "Bones That Won't Stay Down" (moss): defeat 5 @graveyard; defeat @graveyard [Gerald, Twice Buried]. 3L 30C.
2. `whisper` "The Grave That Whispers" (moss): answer @graveyard; answer @graveyard; answer @graveyard. 3L 30C.
3. `dead_drunk` "Dead Drunk" (moss > tobin): escort @lighthouse; talk tobin. 3L 35C.
4. `till_dawn` "Until Dawn" (moss): defend @graveyard; vigil 120s @graveyard; event? @graveyard*. Reads pack:moon_bp. Sets red=moon. 5L 50C.
5. `admiral` "A Very Small Funeral" (moss > bram): mine 6; place 4 @graveyard; talk bram. 2L 25C.
6. `name_stone` "The Name on the Stone" (moss): inspect @graveyard; vigil 60s @graveyard. Sets stone=carved / +g:mercy / stone=blank. 5L 60C, title Night-Shift.

**The Witch's Bargain** (`vesna_bargain`, side, giver moss, requires act2_choir, ~110 min)

1. `downstream` "Dead Things Downstream" (moss): inspect @witch_hut; meet @witch_hut. 3L 35C.
2. `draught` "The Loosening Draught" (moss): deliver 2 moss; deliver 2 moss; deliver 2 moss; fish. 4L 40C.
3. `fen_mother` "What the Water Wanted" (moss): interact @witch_hut; vision @witch_hut. 3L 40C.
4. `reeds` "Through the Reeds" (moss): stealth @witch_hut; defeat 6 @witch_hut. Sets g:vesna=free / +g:mercy / g:vesna=bound / +g:iron. 4L 45C.
5. `break_heart` "Breaking the Heart" (moss) [only g:vesna=free]: interact @witch_hut; defend @witch_hut; defeat @witch_hut [The Fen Mother]. Reads g:vesna. 5L 60C, relic vesna_charm.
6. `bind_heart` "The Keeper of the Fen" (moss) [only g:vesna=bound]: place 4 @witch_hut; vigil 90s @witch_hut. Reads g:vesna. 5L 60C.
7. `spring` "The Fen in Spring" (moss): wait; meet @witch_hut. 5L 60C, title Fenwalker.

**Lamp in the Window** (`hollis_faith`, side, giver hollis, requires act2_choir; g:hollis=saved, ~65 min)

1. `glass` "Broken Glass" (hollis): place 12 @old_chapel; deliver 6 hollis. 3L 30C.
2. `dream` "The Door You Keep" (hollis > elsie): sleep; talk elsie. 3L 35C.
3. `wedding` "A Wedding, Mostly" (hollis): lead @old_chapel; deliver 12 hollis. 4L 40C.
4. `lamp` "Lamp in the Window" (hollis): place @old_chapel; vigil 180s @old_chapel. 4L 45C.
5. `forgive` "Forgiving Brother Hollis" (hollis): vision @graveyard; interact @old_chapel. Sets forgive=mercy / +g:mercy / forgive=iron / +g:iron. 5L 60C, title Lamplighter.

**Wren's Lost Lambs** (`lost_lambs`, side, giver wren, requires -, ~90 min)

1. `clover` "Clover Wanders Off" (wren): lead @meadow. 2L 20C.
2. `cows` "Ten Hungry Cows" (wren): tend 10; talk elsie. 2L 25C.
3. `cat` "A Name for a Cat" (wren): vigil 60s @meadow; tend. Sets cat=biscuit / cat=pounce / cat=moonpie. 3L 25C.
4. `pup` "The Pup in the Dark" (wren): defeat 6; tame. 3L 30C.
5. `armadillo` "The Armadillo Who Wouldn't" (wren): tend 2; deliver 6 wren. 4L 35C.
6. `turnip` "The Carrot Bandit" (wren): tend 3; lead @meadow. 3L 35C.
7. `shed` "A Shed for Everyone" (wren): place 16 @meadow; place 12 @meadow. 5L 60C, title Friend of Every Animal.

**The Star Kittens** (`star_kittens`, side, giver wren, requires act1_signs, ~105 min)

1. `collars` "A Box of Collars" (wren > sol): collect 10; talk sol. 2L 25C.
2. `twins` "Orion and the Twins" (sol): fish 6; tame 3. 3L 30C.
3. `cassie` "Cassie on the Roof" (wren): vigil 60s @lighthouse; meet @lighthouse. Sets cassie=sat / cassie=carried. 3L 30C.
4. `draco_ursa` "Draco and Ursa" (sol): tame 2; tend 5; place 2 @meadow. 4L 40C.
5. `polaris` "Polaris" (sol): reach @observatory; meet @observatory; vigil 120s @observatory. 4L 40C.
6. `same_sky` "Under the Same Sky" (sol > wren): place 4 @graveyard; sleep; talk wren. 5L 60C, title Keeper of the Seven.

**Little Turtles** (`hatchlings`, side, giver tobin, requires drowned_bell, ~130 min)

1. `tracks` "Tracks in the Sand" (tobin): reach @lighthouse; inspect @lighthouse. 2L 20C.
2. `long_night` "The Long Night on the Sand" (tobin): defend @lighthouse; vigil 180s @lighthouse. 3L 35C.
3. `fence` "A Fence and a Wait" (tobin): place 12 @lighthouse; collect 16; wait. 3L 30C.
4. `run` "The Run to the Sea" (tobin): defend @lighthouse; reach @lighthouse. 4L 40C.
5. `where_they_go` "Where the Turtles Go" (tobin): ride; tend 4. 5L 60C, title Turtle Guardian.

**The One That Got Away** (`one_that_got_away`, side, giver tobin, requires -, ~80 min)

1. `this_big` "A Fish This Big" (tobin): fish 8; talk elsie. 2L 25C.
2. `night_waters` "Night Waters" (tobin): vigil 120s @lighthouse; fish 5. 3L 30C.
3. `stinkbait` "Bea's Stinkbait" (tobin > bea): deliver 8 bea; deliver 2 bea; deliver 6 bea. 3L 30C.
4. `rain` "Rain on the Water" (tobin): survive 120s @lighthouse; fish 3. 3L 35C.
5. `gnasher` "Old Gnasher" (tobin): defeat @lighthouse [Old Gnasher]; collect 3. 5L 60C, title Angler of Legend.

**Hearth and Table** (`hearth_and_table`, side, giver bea, requires -, ~130 min)

1. `tryouts` "Tryouts" (bea): deliver 6 bea; deliver 6 bea; deliver bea. 2L 25C.
2. `rations` "Rations for the Wardens" (bea > reyes): deliver 4 reyes*; deliver 12 reyes*; deliver 12 reyes*; defeat 10; deliver 12 reyes*; deliver 12 reyes*. Reads way, pack:cooking_bp. Sets way=kitchen,pack:cooking_bp=on / way=old. 3L 35C.
3. `chowder` "Chowder for the Docks" (bea > tobin): fish 8; deliver 2 tobin*; deliver tobin*; deliver 2 tobin*; deliver 2 tobin*. Reads way, pack:cooking_bp. 3L 35C.
4. `marta` "A Feast for Marta" (bea > moss): deliver moss*; deliver moss*; deliver 3 moss; place 6 @graveyard; deliver moss*. Reads way, pack:cooking_bp. 4L 40C.
5. `hearts` "A Champion's Heart" (bea): collect| 2*; survive 90s @lighthouse; fish 3; deliver? bea*; defeat| @watchtower [Grandmother Gristle]*; defeat| @watchtower [Grandmother Gristle]*. Reads pack:cooking_bp, pack:elite_bp, pack:moon_bp. Sets saffron=yes / heart=gristle. 4L 45C.
6. `starwright` "Elsie's Old Recipe" (bea > elsie): answer elsie; deliver elsie*; deliver 6 elsie*; deliver 2 elsie*; deliver 6 elsie*; deliver 2 elsie*. Reads way, pack:cooking_bp. 4L 45C.
7. `cook_off` "The Great Cook-Off" (bea > bram): meet @meadow; deliver bram*; deliver 2 bram*; deliver 2 bram*; deliver 8 bram*; deliver 2 bram*; deliver 8 bram*; deliver 2 bram*. Reads way, pack:cooking_bp, pack:elite_bp. Sets marty=hired / +g:mercy / marty=sent / +g:iron / marcel=quiet / marcel=called. 5L 60C, title Master of the Hearth.

**The Wardens' Oath** (`wardens_oath`, side, giver reyes, requires -, ~115 min)

1. `drill` "The Drill Yard" (reyes): defeat 8; deliver 3 reyes. 3L 30C.
2. `outpost` "The Outpost on the Ridge" (reyes): reach; defend; defeat [Sergeant Vell]. 4L 45C.
3. `long_watch` "The Long Watch" (reyes): defend @watchtower; vigil 120s @watchtower; event? @watchtower*. Reads pack:moon_bp. Sets red=moon. 4L 50C.
4. `embers` "Embers on the Road" (reyes): inspect; follow. 3L 30C.
5. `red_hand` "The Red Hand" (reyes): wear; defeat [Captain Marrow, the Red Hand]. 5L 60C.
6. `orrins_stone` "Orrin's Stone" (reyes): place 6 @graveyard; talk moss; vigil 60s @graveyard. 3L 25C.
7. `oath` "The Oath at Dawn" (reyes): interact @watchtower; answer @watchtower. Sets oath=shield / +g:mercy / oath=sword / +g:iron. 5L 60C, title Sworn Warden.

**Smuggler's Run** (`smugglers_run`, side, giver quill, requires act2_choir, ~80 min)

1. `crate` "The Crate Job" (quill): stealth; sleep. 3L 35C.
2. `borrowed_map` "The Borrowed Map" (quill): wear; stealth. 3L 40C.
3. `honey_run` "The Honey Run" (quill): collect 6; ride; defeat 4; meet. 4L 45C.
4. `inspector` "The Inspector Calls" (quill): meet @sea_cave; answer @sea_cave; lead @sea_cave; event?*. Reads pack:rainbow_bp. Sets pot=found. 3L 30C.
5. `double_cross` "The Double-Cross" (quill): defend @sea_cave; talk reyes. Sets profits=keep / +g:iron / profits=return / +g:mercy. 5L 60C, title Night Runner.

**The Mayor's Burden** (`mayors_burden`, side, giver bram, requires act2_choir, ~85 min)

1. `ballots` "The Missing Ballots" (bram): inspect; tend 3. 2L 25C.
2. `feud` "Fences and Feuds" (bram): meet; meet; place 12. Sets feud=moon / feud=garrow / feud=split / +g:mercy. 3L 35C.
3. `unveiling` "The Unveiling" (bram): place 16; deliver 4 bram; use 3. 3L 40C.
4. `fathers_name` "My Father's Name" (moss > bram): inspect @graveyard; vigil 90s @graveyard. 4L 45C.
5. `election` "Election Day" (bram): wait; deliver bram. Sets plaque=lost / +g:mercy / plaque=goat. 5L 60C, title Deputy Mayor.

**Edges of the Map** (`edges_of_map`, side, giver mara, requires last_map, ~230 min)

1. `kit` "A Proper Kit" (mara): tame; ride; collect 3. 2L 25C.
2. `sand_snow` "Sand and Snow" (mara): reach; collect 4; reach; collect 16; event?*. Reads pack:atlas_bp. Sets waymark=found. 4L 45C.
3. `night_sounds` "Frogs in Three Voices" (mara): vigil 90s; collect 4; collect 12; event?*; event?*; event?*; event?*. Reads pack:night_bp, pack:rainbow_bp, pack:tornado_bp, pack:storm_bp. Sets wonder=charted. 4L 40C.
4. `lost_village` "The Village Nobody Mapped" (mara): reach; collect 10; meet. Sets village=mapped / village=hidden. 4L 45C.
5. `mouth` "The Mouth" (mara): reach; place 24; defeat 6. 4L 45C.
6. `deep` "Charting the Deep" (mara): ride; fish 3; reach. 4L 50C.
7. `end` "Off the Edge" (mara): reach; collect 16. 5L 60C, title Edgewalker.

**The Forge That Sings** (`singing_forge`, side, giver ida, requires act1_signs, ~95 min)

1. `dunmore` "Dunmore's Notes" (ida): inspect; vision; deliver 16 ida. 3L 30C.
2. `deep_fire` "The Deep Fire" (ida): reach; mine 4. 4L 45C.
3. `brutes` "Brutes and Blazes" (ida): defeat 2; collect 6; deliver 4 ida. 5L 55C.
4. `quench` "Where the Souls Burn" (ida): place; interact 3; defend. 4L 50C.
5. `named_true` "Named True" (ida): talk sol; talk tobin; vigil 60s. Sets blade=starsong / blade=hal / blade=dunmore. 5L 60C, title Forge-Singer, relic singing_blade.

**The Listening Deep** (`listening_deep`, side, giver ida, requires act3_deep; pack:expedition_bp=on, ~190 min)

1. `roots` "Roots" (ida): event. 3L 40C.
2. `cold_store` "The Hollow Under the Ice" (elsie) [only g:ending=!gift]: event. Reads g:ending. Sets cold=elsie. 4L 50C.
3. `cold_store_letters` "The Hollow Under the Ice" (wren) [only g:ending=gift,cold=!elsie]: event. Reads g:ending, cold. 4L 50C.
4. `gauntlet` "Down the Long Stair" (reyes): event|; event|. 5L 60C.
5. `last_listen` "One Last Listen" (ida): event; talk elsie*. Reads g:ending. 10L 200C, title Deep-Listener.

**The Gull's Last Voyage** (`heart_tobin`, heart, giver tobin, requires drowned_bell; g:aff_tobin=>=3, ~50 min)

1. `salt` "Salt in the Wound" (tobin) [only g:ending=crown]: vigil 90s @lighthouse; talk elsie. Reads g:ending. 2L 20C.
2. `patch` "Tar and Timber" (tobin): deliver 24 tobin; place 6 @lighthouse. 3L 30C.
3. `bell` "Past the Sunken Bell" (tobin): ride; vigil 90s @sunken_bell. 4L 40C.
4. `ash` "Ash-Salt for Hal" (tobin): use 3 @graveyard; talk moss. Sets g:gull=sailed. 5L 60C.

**Fenn's Unfinished Survey** (`heart_mara`, heart, giver mara, requires last_map; g:aff_mara=>=3, ~55 min)

1. `off_map` "Off the Map" (mara) [only g:ending=crown]: reach @observatory. Reads g:ending. 2L 20C.
2. `corner` "The Blank Corner" (mara): deliver 8 mara; deliver mara; reach. 3L 30C.
3. `measure` "Measure Twice" (mara): use 2 @observatory; reach. 4L 40C.
4. `signed` "Signed and Dated" (mara): place 8; deliver mara. 5L 60C.

**The Warden's Helmet** (`heart_reyes`, heart, giver reyes, requires g:aff_reyes=>=3, ~45 min)

1. `watch_list` "On the Watch List" (reyes) [only g:ending=crown]: defeat 8. Reads g:ending. 2L 20C.
2. `gate` "The Night of the Gate" (reyes): vigil 150s @watchtower. 3L 30C.
3. `name` "A Name on Stone" (reyes): deliver 8 reyes; place @graveyard; talk moss. 4L 40C.
4. `returned` "Returned to Duty" (reyes): defeat 10 @watchtower. 5L 60C.

**Old Words** (`heart_elsie`, heart, giver elsie, requires act3_deep; g:aff_elsie=>=3, g:ending=!gift, ~40 min)

1. `no_room` "No Room at the Inn" (elsie) [only g:ending=crown]: deliver 3 elsie. Reads g:ending. 2L 20C.
2. `song` "The Lantern Song" (elsie): vigil 120s @observatory. 3L 30C.
3. `quilt` "A Quilt for Wren" (elsie): deliver 12 elsie; deliver 4 elsie. 4L 40C.
4. `hearth` "Hearth-Friend" (elsie): sleep. 5L 60C.

**The Locked Drawer** (`heart_bram`, heart, giver bram, requires act2_choir; g:aff_bram=>=3, ~30 min)

1. `verdict` "The Town's Verdict" (bram) [only g:ending=crown]: talk reyes; talk hollis. Reads g:ending. 2L 20C.
2. `drawer` "The Archive" (bram): deliver 16 bram; talk mara. 3L 30C.
3. `hat` "Father's Hat" (bram): place 4 @graveyard. 4L 40C.
4. `speech` "A Speech of His Own" (bram): use 3. 5L 60C.

**Mother's Teapot** (`heart_quill`, heart, giver quill, requires act2_choir; g:aff_quill=>=3, ~55 min)

1. `partners` "Partners" (quill) [only g:ending=crown]: deliver quill. Reads g:ending. Sets partner=yes / partner=no. 2L 20C.
2. `bargain` "A Bad Bargain" (quill): reach @sea_cave; deliver 4 quill. 3L 30C.
3. `trade_up` "Trade Up" (quill): deliver 8 quill; deliver 8 quill. 4L 40C.
4. `tea` "Tea First" (quill): deliver 6 quill; vigil 60s @sea_cave. 5L 60C.

**Dunmore's Pick** (`heart_ida`, heart, giver ida, requires act1_signs; g:aff_ida=>=3, ~45 min)

1. `quench` "Quench" (ida) [only g:ending=crown]: deliver 4 ida. Reads g:ending. 2L 20C.
2. `cold_forge` "The Cold Forge" (ida): mine 12; deliver 8 ida. 3L 30C.
3. `listening` "The Listening Stone" (ida): reach; mine 24. 4L 40C.
4. `good_hammer` "The Good Hammer" (ida): deliver ida; deliver 4 ida. 5L 60C.

**Adela's Star** (`heart_sol`, heart, giver sol, requires act1_signs; g:aff_sol=>=3, ~50 min)

1. `dark_star` "A Dark Star" (sol) [only g:ending=crown]: vigil 90s @starfall. Reads g:ending. 2L 20C.
2. `chart` "The Winter Chart" (sol): deliver 4 sol; deliver 4 sol; vigil 90s @observatory. 3L 30C.
3. `softly` "Looking Softly" (sol): use 2 @lighthouse; vigil 60s @lighthouse. 4L 40C.
4. `naming` "Naming Night" (sol): deliver sol; vigil 60s @meadow. 5L 60C.

**Every Candle Lit** (`heart_hollis`, heart, giver hollis, requires act2_choir; g:aff_hollis=>=3, g:hollis=!lost, ~40 min)

1. `put_down` "Put It Down" (hollis) [only g:ending=crown]: vigil 60s @old_chapel. Reads g:ending. Sets plea=try / +g:mercy / plea=cant. 2L 20C.
2. `wax` "Wax and Wick" (hollis): deliver 6 hollis; deliver 6 hollis. 3L 30C.
3. `vigil` "The Long Vigil" (hollis): interact 4 @old_chapel; vigil 120s @old_chapel. 4L 40C.
4. `plain_sleep` "Plain Sleep" (hollis): sleep. 5L 60C.

**The Unvisited Grave** (`heart_moss`, heart, giver moss, requires g:aff_moss=>=3, ~35 min)

1. `even_dead` "Even the Dead" (moss) [only g:ending=crown]: defeat 5 @graveyard. Reads g:ending. 2L 20C.
2. `nell` "Old Nell" (moss): place 4 @graveyard; use 3 @graveyard. 3L 30C.
3. `lantern` "Nell's Lantern" (moss): deliver moss; vigil 60s @graveyard. 4L 40C.
4. `plot` "Six and a Half Feet" (moss): mine 20; talk hollis. 5L 60C.

**Clover's Foal** (`heart_wren`, heart, giver wren, requires g:aff_wren=>=3, ~35 min)

1. `scared` "Scared" (wren) [only g:ending=crown]: tend 3 @meadow. Reads g:ending. 2L 20C.
2. `hay` "Hay and Hope" (wren): deliver 4 wren; deliver 6 wren. 3L 30C.
3. `names` "A Name for Everyone" (wren): tend 3 @meadow. 4L 40C.
4. `long_night` "Long Night in the Stable" (wren): vigil 120s @meadow. Sets foal=dawn / foal=pudding / foal=wren. 5L 60C.

**The Last Ship's Supper** (`heart_bea`, heart, giver bea, requires g:aff_bea=>=3, ~50 min)

1. `crew` "Crew Is Crew" (bea) [only g:ending=crown]: deliver 12 bea. Reads g:ending. 2L 20C.
2. `galley` "Galley Hands" (bea): deliver 8 bea; deliver 8 bea. 3L 30C.
3. `rocks` "The Serpent Rocks Recipe" (bea): fish 5; deliver 3 bea. 4L 40C.
4. `supper` "Supper for the Crew" (bea): talk tobin; talk elsie; talk reyes. 5L 60C.

**Pell's Long Road** (`w_pell_road`, wander, giver w_pell, requires drowned_bell, ~35 min)

1. `boots` "Blisters and Bootlaces" (w_pell): deliver 3 w_pell; deliver w_pell. Sets way=walk / way=map. 2L 30C.
2. `chapel` "The Road to the Chapel" (w_pell): escort @old_chapel*; reach @old_chapel*; interact @old_chapel*. Reads way. 3L 40C.
3. `vigil` "A Vigil Under the Dome" (w_pell): vigil 90s @observatory. 3L 45C.
4. `stone` "What the Stone Listens For" (w_pell): place 4 @camp:pell; answer w_pell. 8L 120C, title Pilgrim's Friend.

**The Last Survey** (`w_anwen_survey`, wander, giver w_anwen, requires act1_signs, ~45 min)

1. `instruments` "The Wrong Stars" (w_anwen): deliver w_anwen; deliver w_anwen. 3L 35C.
2. `height` "Measuring the Dark" (w_anwen): reach; vigil 60s @camp:anwen. 3L 40C.
3. `line` "The Line Home" (w_anwen): follow @observatory; inspect @observatory. 4L 50C.
4. `rest` "Rest, Surveyor" (w_anwen): interact @observatory; vision @observatory. 8L 130C, title Keeper of the Survey.

**Deepdelve's Last Seam** (`w_brannoch_deep`, wander, giver w_brannoch, requires -, ~45 min)

1. `pick` "A Pick for a Pick" (w_brannoch): deliver w_brannoch; mine 32. 3L 35C.
2. `torches` "Down Where It's Warm" (w_brannoch): reach; place 6. 3L 40C.
3. `marks` "Scratches in the Dark" (w_brannoch): inspect @old_mine; defeat 8. 4L 45C.
4. `gnasher` "Old Gnasher" (w_brannoch): defeat @old_mine [Old Gnasher]; collect? 8. 8L 140C, title Gnasher's Bane.

**Rook's Wager** (`w_rook_rival`, wander, giver w_rook, requires -, ~45 min)

1. `wager` "The Wager" (w_rook): defeat 10. 3L 40C.
2. `bounties` "Three Bounties" (w_rook): defeat| 3*; defeat| [Brushwood Brute]. Reads pack:bounty_bp. Sets spite=yes / +g:iron / spite=no / +g:mercy / beat=yes. 3L 45C.
3. `map` "The Map Room" (w_rook): inspect @watchtower; event?*. Reads pack:maps_bp. 3L 50C.
4. `turned` "Rook, Turned" (w_rook) [only spite=yes,g:iron=>=4,g:rook_won=>=3]: defeat @camp:rook [Rook, Turned]. Reads spite, g:iron, g:rook_won. Sets turned=yes. 8L 110C, title Rook's Better.
5. `partners` "Partners" (w_rook) [only turned=!yes]: defend @camp:rook. Reads turned. 8L 120C, title Rook's Rival.

**The High Garden** (`w_marigold_garden`, wander, giver w_marigold, requires -, ~35 min)

1. `tea` "Tea at the Top of the World" (w_marigold): deliver 8 w_marigold; deliver 4 w_marigold. 2L 30C.
2. `goat` "The Stubborn Goat" (w_marigold): lead @camp:marigold. 3L 40C.
3. `garden` "Seeds for the High Garden" (w_marigold): place 6 @camp:marigold; vigil 60s @camp:marigold. 8L 110C, title Highland Gardener.

**Catch the Lightning** (`w_tamsin_storm`, wander, giver w_tamsin, requires -, ~40 min)

1. `rod` "Lightning in a Bottle" (w_tamsin): deliver 6 w_tamsin; place @camp:tamsin. 3L 35C.
2. `watch` "Storm Watch" (w_tamsin): survive 90s @camp:tamsin; event?*. Reads pack:storm_bp. 4L 45C.
3. `gale` "Riding the Gale" (w_tamsin): ride; reach. 8L 115C, title Galeward's Second.

**The Long Way Home** (`w_vesk_home`, wander, giver w_vesk, requires -, ~35 min)

1. `out` "Bread from Home" (w_vesk): deliver 6 w_vesk; deliver w_vesk. 3L 40C.
2. `ash` "Ash in the Lungs" (w_vesk): vigil 60s @camp:vesk; fish 3. 3L 45C.
3. `name` "A Name Given Back" (w_vesk): place @camp:vesk; sleep. 8L 120C, title Homeward Friend.

**Hob's Tall Tales** (`w_hob_tales`, wander, giver w_hob, requires -, ~30 min)

1. `pots` "Pots and Pans" (w_hob): deliver 4 w_hob; deliver 6 w_hob. 2L 30C.
2. `mule` "The Donkey Who Wouldn't" (w_hob): lead @camp:hob; deliver w_hob. 3L 40C.
3. `tale` "A Tale for Quill" (w_hob): talk quill; answer w_hob. 8L 100C, title Teller of Tales.

**The Littlest Ones** (`fest_hatchlings`, festival, giver wren, requires cal:festival=hatchling_tide, ~45 min)

1. `names` "Forty-Two Names" (wren): tend 3; event|*; vigil| 60s @lighthouse. Reads pack:calendar_bp. Sets how=nest / how=beach. 2L 20C.

**What the Tide Brings** (`fest_tide_tobin`, festival, giver tobin, requires cal:festival=hatchling_tide, ~45 min)

1. `out` "Seeing Them Off" (tobin): event|*; ride|; deliver 8 tobin. Reads pack:calendar_bp. Sets how=swim / how=row. 2L 25C.

**The Night Shift** (`fest_night_shift`, festival, giver moss, requires cal:festival=hatchling_tide, ~10 min)

1. `beach` "Graveyard Shift, Beach Edition" (moss): defeat 6; talk reyes. 3L 30C.

**Tide Supper** (`fest_tide_supper`, festival, giver elsie, requires cal:festival=hatchling_tide, ~15 min)

1. `supper` "Bread for the Watchers" (elsie): deliver 6 elsie; deliver 4 elsie; event?*. Reads pack:calendar_bp. Sets fed=yes. 2L 25C.

**Mara's Course** (`fest_course`, festival, giver mara, requires cal:festival=midsummer_regatta, ~40 min)

1. `race` "To Scale" (mara): event|*; ride|; talk tobin. Reads pack:calendar_bp. Sets how=race / how=row. 2L 25C.

**A Sure Thing** (`fest_sure_thing`, festival, giver quill, requires cal:festival=midsummer_regatta, ~40 min)

1. `dive` "The Ringer" (quill): event|*; reach|; answer quill. Reads pack:calendar_bp. Sets how=dive / how=climb. 2L 35C.

**Water Safety** (`fest_water_safety`, festival, giver reyes, requires cal:festival=midsummer_regatta, ~10 min)

1. `helmet` "Helmets On" (reyes): wear; vigil 60s @lighthouse. 2L 25C.

**The Midsummer Picnic** (`fest_picnic`, festival, giver bea, requires cal:festival=midsummer_regatta, ~20 min)

1. `fruit` "Summer on a Plate" (bea): deliver 8 bea; deliver 8 bea; event?*. Reads pack:calendar_bp. Sets ate=yes. 2L 25C.

**The Judge's Dilemma** (`fest_judge`, festival, giver bram, requires cal:festival=lantern_fair, ~40 min)

1. `pumpkins` "A Fair Fair" (bram): event|*; place|; place 4. Reads pack:calendar_bp. Sets how=vote / how=carve. 2L 25C.

**Lanterns Like Stars** (`fest_lanterns_ida`, festival, giver ida, requires cal:festival=lantern_fair, ~50 min)

1. `iron` "Sixteen Nuggets" (ida): deliver 16 ida; event|*; place| 3 @lighthouse. Reads pack:calendar_bp. Sets how=float / how=hang. 3L 25C.

**Candles for the Unremembered** (`fest_unremembered`, festival, giver hollis, requires cal:festival=lantern_fair, ~15 min)

1. `candles` "Grave Twelve" (hollis): place 6 @graveyard; vigil 60s @old_chapel. 3L 20C.

**A Proper Ghost Story** (`fest_ghost_story`, festival, giver moss, requires cal:festival=lantern_fair, ~40 min)

1. `tale` "Sit Closer" (moss): event|*; vigil| 60s @graveyard; answer moss. Reads pack:calendar_bp. Sets how=fire / how=graves. 2L 25C.

**The Falling Stars** (`fest_falling_stars`, festival, giver sol, requires cal:festival=long_night, ~40 min)

1. `count` "Counting with Adela" (sol): event|*; vigil| 90s @observatory; talk elsie. Reads pack:calendar_bp. Sets how=watch / how=ruin. 3L 30C.

**The Gift Table** (`fest_gift_table`, festival, giver elsie, requires cal:festival=long_night, ~45 min)

1. `gifts` "Something for Everyone" (elsie): event|*; deliver| wren; deliver 8 elsie. Reads pack:calendar_bp. Sets how=round / how=cake. 2L 25C.

**The Long Night Speech** (`fest_speech`, festival, giver bram, requires cal:festival=long_night, ~35 min)

1. `line` "The Last Line" (bram): answer bram; event|*; place| 4. Reads pack:calendar_bp. Sets how=vigil / how=square. 2L 25C.

**A Present for Clover** (`fest_clover`, festival, giver wren, requires cal:festival=long_night, ~10 min)

1. `carrot` "The Golden Carrot" (wren): tend; deliver 6 wren. 2L 20C.

**The Calling** (`the_calling`, side, giver hollis, requires g:calling_ready=1, pack:skills_bp=on, ~70 min)

1. `chapel_book` "The Chapel Book" (hollis) [only g:hollis=!lost,g:called=!1]: event|; talk| hollis*. Reads g:hollis, g:called, g:calling. Sets g:called=1. 3L 40C.
2. `graveyard_book` "The Gravedigger's Book" (moss) [only g:hollis=lost,g:called=!1]: event|; talk| moss*. Reads g:hollis, g:called, g:calling. Sets g:called=1. 3L 40C.
---

# 2. The plot as written

## 2.1 Summary

**The secret.** Ages ago the Starwrights found the Hollow, a hunger at the bottom of the world that listens to every sound. They could not kill it, so they bound it with three seals (Tide, Stone, Sky) that drink the light of a comet, the Lantern, once every forty years. Forty winters ago, in the Year of the Long Storm, the grieving chapel keeper Brother Ashgrave was promised his dead daughter back and rang the harbor bell in a rhythm the Hollow taught him ("slow, slow, quick"). The note cracked the Lantern. The tower, the bell, Ashgrave and Hal (Old Tobin's brother, who rowed out to stop him) went into the sea. The old mayor ordered the town to forget. Ashgrave did not die: the Hollow kept him as its voice, the Hollow Herald. The Lantern is coming back this year.

**Prologue.** *The Drowned Bell* (Tobin, 6 quests): a bell rings where there is no bell; drowned walk ashore with tarred bell rope on their wrists; a storm vigil at the lighthouse; Ida forges a band (silence the bell) or a clapper (recast it), the player strikes the sunken bell and kills its keeper, the Bell Warden. *The Cartographer's Last Map* (Mara, 4 quests): Aldous Fenn's three far pins draw a line that points home to the old chapel; the player draws the last page and shares the map or keeps it.

**Act I, Signs in the Sky** (Sol, 10 quests). Sol sees a smudge in the east. A vision at the Starfall Crater shows a bell breaking a comet. The children's skipping song carries the rhythm. Brother Hollis's candles go out at midnight and a drowned man teaches him the rhythm in dreams. Moss finds Long Storm graves dug up and the sign of a cracked circle. Fenn's echo at the Stargazer's Ruin names three seals. Elsie hides a trunk and a slip of the tongue ("Starwright bread"). Hollis sleepwalks to the Gray Ring, where the Gray Choir ("Nothing lost, nothing missed") plans to ring the broken note on Lantern night with Hollis as the ringer. The player reports to Reyes or goes alone, defends Hollis, and Sol counts: sixty nights.

**Act II, The Gray Choir** (Reyes, 12 quests). Gray thread counts down at three farms; seven-year-old Pip is taken and rescued; the crates are Quill's. The player trusts Quill as a double agent (sneak into the cove) or exposes him (raid the cove). The Cantor's letter wants "the bell's tongue" and Ida; a thief is caught at the forge; Hollis confesses he let the Choir in while asleep; Ashgrave's coffin was opened from inside. The witch Vesna, who taught Ashgrave the tune, sells the counter-song (a lullaby) for stew, a spider eye and a ghast tear. Hollis walks into the sea singing: drag him out (he is saved) or sing him back (he is not yet free). The Gray Ring is stormed, the Cantor dies saying "you can't kill a song", and Bram opens his father's order to forget: tell the town or keep it buried.

**Act III, Into the Deep** (Ida, 10 quests). Echo shards and Ida's lamp of echoes play what the stone remembers: Starwrights building the Stone Seal; miners who bricked up three singing men; under the chapel, the whole storm night, with Hal on the tower stairs. Tobin learns his brother died for the town. The lamp leads to the Stone Seal, which cracks further when charged. The Herald speaks through Hollis (or a prisoner) in three riddles; Hollis is saved or lost. Elsie is revealed as the last Starwright, kept young by a sliver of the Lantern in her apron; forgive or condemn. She cuts out a Lantern shard: three keys must be relit.

**Act IV, The Three Seals** (Elsie, 12 quests). A council at the inn; three seals in any order. Tide (Tobin): monument crystals, a row out in Hal's boat, an elder guardian, Hal's echo holding a door shut, relight. Stone (Ida): sneak past sculk-blind diggers, rebuild the frame, keep still while the Warden passes, answer "silence", relight. Sky (Sol): climb above y 200, bridge the ring, kill the Lantern Thief, see the Lantern's whole history (and Elsie's), light the crown. Elsie asks the player to let her become a seal if it comes to that. A meteor opens the Hollow Gate and the Herald speaks to the whole town.

**Act V, Lantern Night** (Bram, 14 quests). Supplies and horses; ally quests for what the player earned (Quill's fleet, Vesna free or bound, Hollis's hymn) or a barricade with nobody; four waves at the lighthouse with Pip keeping the light; through the last circle at the Gate by stealth or force; the Herald in three shapes (Hollis first, if he was lost); at the Sky Seal the player chooses.

**Endings.** *Relight the Lantern* (always): forty more winters; Ashgrave's echo asks the player to tell Tobin he is sorry. *The Keeper's Gift* (needs *A Room at the Inn* finished and the promise allowed): Elsie becomes a seal for a thousand years and a daytime star; the inn passes to Wren. *The Hollow Crown* (iron 5+): the player takes the Herald's chair; the town is saved and afraid of them from then on. Each ending has its own Dawn, then *Forty Winters*: a tree in the graveyard, a last scene with Tobin, credits.

## 2.2 Cast

Twelve townsfolk give quests: Old Tobin (fisherman, lost Hal), Mara (cartographer, Fenn's apprentice), Warden Reyes (captain), Elsie (innkeeper, last Starwright), Mayor Bram (son of the mayor who buried it), Quill (trader, smuggler), Ida (relicsmith, Dunmore's apprentice), Sol (sky-reader, Adela's widower), Brother Hollis (chapel keeper, the Herald's target), Moss (gravedigger), Wren (stable girl, Elsie's ward), Bea (cook). Scene characters: Fenn's echo, Hal's echo, Lily (Elsie's sister, a ghost), Vesna of the Fen, the Cantor, Pip Haddock, Hush the thief, Brother Ashgrave. Eight recurring wanderers with their own chains (Pell, Anwen, Brannoch, Rook, Marigold, Tamsin, Vesk, Hob). The main story starts quests at Reyes 11 times, Ida 10, Moss 8, Tobin 7, Sol 7, Mara 5, Elsie 5, Bram 4, Hollis 4, Wren 3, Bea 2, Quill 2.

## 2.3 Verdict on the writing

The prose is good and should be kept: distinct voices, a real mystery with a fair reveal order, recurring motifs that pay off (the rhythm, the tarred rope, "Nothing lost, nothing missed", the lullaby), choices that are remembered for hours (the bell choice is read in 40 places, Hollis's fate in 42, Quill's in 28), and three endings with different mornings. The problems are structural: how the content is ordered, gated, signposted, repeated and offered, not how it is written.

---

# 3. Critique

## 3.1 Where the through-line gets lost

1. **Two openings and no bridge.** A new player has two "Main story" stories at two NPCs with no order. Each ends closed (titles Bellkeeper and Cartographer, a relic each); neither outro says "now see Sol". Act I needs both, so a player who did only one sees nothing new. *The Last Map* reads as a finished side story.
2. **The goal arrives late.** "Relight three seals with the comet's light before the Choir rings the broken note" is first hinted in Act I quest 6, said plainly only in Act III quest 10 (quest 49 of 68, about 12 hours in). Until then the only stated goal is "find out". That is fine for a mystery played in one sitting and bad for a player who returns after three weeks.
3. **The quest giver moves constantly.** About 35 of the 61 quest-to-quest steps in the main story hand over to a different NPC. In Act I, 7 of 9 do (Sol, Sol, Wren, Hollis, Moss, Mara, Bea, Wren, Hollis, Sol), and 6 of those 7 outros do not say who is next in the fiction (for example *Fallen Light* ends "Go rest", then the next quest is at Wren). The only pointer is one chat line (`Next: talk to Wren for "The Skipping Song"`), which scrolls away.
4. **"Sixty nights" is never used again.** Sol's countdown is the story's clock and nothing tracks it: no later line says forty, twenty, tomorrow until Act V says "tomorrow night".
5. **Mara drops out.** Fenn's heir says "that's where I start, finding doors" in Act I quest 6 and never starts another main quest; the seals are found by the lamp, Elsie and Sol. The prologue's second lead has no arc.
6. **Act III doubles back.** The player charges the Stone Seal with the lamp (a 19-mob defense that fails by design), is told two quests later that a lamp can never relight a key, and returns to the same room three more times in Act IV. The Abandoned Mine is used in quests 1, 3 and 6 of Act III.
7. **Act V opens with a shopping list.** After the Herald addresses the town, the next step is 64 arrows, 4 shields, 24 baked potatoes and 3 horses, then up to four ally errands, before anything happens.

## 3.2 Pacing: grind, fetch chains, long walks, waiting

- **Fetching is the most common step.** `deliver` 107 of 607 steps (17.6%) plus `collect` 28: 22% of all steps, 43 of the side questlines' 241 steps, 30 of the heart stories' 81, 23 of the 48 favors. *Hearth and Table* is 29 deliveries in 39 steps.
- **Standing still.** 54 vigils (8.9% of steps), 53 tied to a time of day (dusk, night, after midnight, before dawn), 72 minutes of pure waiting plus the wait for the right hour; 10 sleep steps; 4 weather steps (the third quest of the very first story needs 120 seconds in a thunderstorm); 15 night-only fights; 3 real waits of one or two in-game days. In multiplayer nobody can sleep the clock forward alone, so each of these is a possible 10-minute stall.
- **Vanilla progression walls in the main line.** Prologue quest 4 needs 12 prismarine shards (ocean monument guardians) and 24 iron. Act I quest 1 needs a spyglass (amethyst from a geode). Act II needs a ghast tear from the Nether. Act III needs 4 echo shards from an ancient city unless Expeditions is installed. Act IV needs 16 prismarine crystals, an elder guardian fight, a build to y 220 and 24 quartz or glass there. Side: *Edges of the Map* ends in the End; *The Forge That Sings* needs netherite scrap and a bastion. For casual players each wall is a place the story is silently parked for weeks.
- **Long walks with nothing at the end.** *Three Pins* sends the player to three empty spots 700 to 750 blocks out in three directions (about 2,500 blocks of travel) for one line of dialogue. Nine of the 16 places are at least 300 blocks from spawn by their site rules (the Hollow Gate 800 to 1,500, the Starfall Crater 600 to 1,200, before `farScale` halves the distance past 300); the Hollow Gate is walked to in three quests.
- **The same room again.** Steps at the Old Graveyard: 43; Lighthouse: 40; Old Chapel: 26; Stargazer's Ruin: 21; Hollow Fen: 18. The Stone Seal is entered in five quests, the Sky Seal in four.
- **Length against the audience.** The main story is about 20 hours in 68 quests. A group that plays two hours every few weeks needs most of a year, and has to remember it.

## 3.3 Repetition

- **The storm night is shown seven times**: the crater vision (Act I), the mayor's order (II), the listening stone (III), the Herald's taunt (III), Hal's echo (IV), the Lantern's long road (IV), the light in the crown (V), and again in *A Room at the Inn*. Each adds a detail, but four are full cutscenes of the same tower.
- **Riddle answers repeat**: "silence" (Act III and Act IV), "lullaby" (Act II) and "asleep" (inn ghost), "echo", "lantern".
- **Defend-the-place fights**: 17 `defend` steps, 6 of them at the lighthouse or graveyard, with near-identical instructions.
- **Paired variant pages.** Reactivity is the story's best feature and its maintenance cost: `drowned_bell.bell` 40 reads, `g:hollis` 42, `g:quill` 28, `hearth_and_table.way` 27, `g:ending` 23, `act4_seals.first`/`second` 36. Any rewrite of a quest with variants costs two to three times its visible length.
- **Favors and one-offs** are 72 templates of "bring N of X / kill N / stand here", renewed daily at 12 NPCs: the largest source of sameness and of open quests.

## 3.4 Tonal drift

Mostly controlled; the comic side questlines (a goldfish funeral, Gerald the skeleton, the carrot bandit) are a strength. The risks for a friends-and-family realm:

- **The Choir are neighbors, and the player kills between about 55 and 120 of them, depending on the path.** The ledger names the cooper, the widow by the mill and Reyes's night clerk; then *Raid on the Cove* asks for 20 dead "Choir smugglers" and its outro has a hooded man die smiling. Across Acts I to V the required counts are 14 + 1, 6 + 20, 14 or 20 + the Cantor, 12, 12 + 30. The bible says "nobody is gored; sad means sad, not cruel".
- **Killing Hollis.** If Hollis was lost, the first boss of the finale is the gentle priest the player spent three acts protecting.
- **The Hollow Crown is a permanent social penalty**: every townsfolk greets the player coldly "forever after" and every heart story opens with a fear chapter. Fine for a solo RPG; on a realm of ten friends it marks one person for good, and (see 3.9) in a party one member can pick it for the others who qualify.
- **Whiplash by menu.** Because 5 to 15 side questlines are open at once, a player can go from Pip's kidnapping to Admiral Bubbles's funeral and back in one evening. The content is fine; the ordering is the player's and the log gives no guidance.

## 3.5 Quests that feel like filler

Main: *The Skipping Song* (3 string and a talk), *A Tear from the Fire* (a Nether trip to deliver one riddle answer), *Lantern of the Deep* (go below y -40 to watch a cutscene), *The Leaning Flame* (follow, place 12 torches), *The Council at the Inn* (four talks to fetch people), *The Drowned Vaults* (16 crystals and 8 guardians), *The Stair to the Sky* (climb and wait 90 seconds; two more climbs follow), *Rally the Town*. Each has good text; the steps are padding.
Side: *Hearth and Table* (29 deliveries), *Edges of the Map* (7 collect, 6 reach, about 4 hours), *The Listening Deep* (6 of 7 steps are "finish a dungeon in another pack", about 3 hours), the 48 favors, the 24 one-offs.

## 3.6 Dangling threads

- Pip lends the player his wooden sword "Stabby" with a spit-promise to bring it back; it is never returned (no mention in Acts III to V).
- The brass plate stamped with the Choir's cracked circle in Elsie's trunk (Act I) is never explained.
- The three miners humming behind the brick wall (Jory, Brann, Tam Hask: "room for one more") are never freed, mourned or mentioned after Act III quest 4.
- Vesna "taught Ashgrave the tune" (Act II): a major admission, never followed up in the main line.
- The named Choir members in town (the cooper, the widow by the mill, the night clerk) and the freed or chained prisoner have no later scene.
- Ashgrave's daughter has no name.
- Mara's search (3.1.5) and Sol's sixty nights (3.1.4).
- `g:hollis` can stay unset from Act II (the song path) until Act III quest 8, so for about five quests Hollis is "not saved, not lost" and the variant text has to hedge.
- Flags set and never read (by my scan): `heart_quill.partner`, `heart_hollis.plea`, `heart_wren.foal`, `w_rook_rival.beat`, `fest_judge.how`, `fest_falling_stars.how`, `fest_speech.how` (`g:gull` is sent to the Townsfolk pack). Small flags with one local use: `vesna_first`, `parley`, `hal`, `hollis` (Act I), `horse`.

## 3.7 Steps where the player is not told why, or what to do

- *The Drowned Choir*: "Catch 5 things with a fishing rod" (the result is never mentioned).
- *Three Pins*: stand on three empty spots.
- *Hollis's Confession*: "break 12 dirt" (anywhere; it is meant to be the crypt steps).
- *The Abandoned Mine*: "Mine 40 deepslate (anywhere below y 0)" while the text says the sealed door is under deepslate at the mine.
- **Items that do not exist.** Ida "pushes the lamp into your hands", and seven later steps say "hold the lamp", "with the lamp", "hold up the lamp"; no lamp item is given (the reward is levels, Crowns and a codex entry). The same for "the shard in hand" in Act IV when the Relics pack is absent. Players will search their inventory.
- **Cutscene steps phrased as actions.** 18 vision steps and 10 sleep steps have labels like "Stay when the candles go out", "Help Elsie move her things into the new chest", "Read the old mayor's sealed order", "Sleep in a bed, if you can" with no place or no action; some play by themselves. Section 5.5 lists all 58 unclear steps with drafted lines.
- **Flavor choices that look like decisions.** Act IV has 21 intro buttons such as "Ask Tobin if he's scared" that set nothing; the player may pick only one, cannot tell it is flavor, and picking it accepts the quest.
- Only 26 of 607 steps have their own hint; the chapter hint is good but costs a quarter of the reward, so the clear instruction sits behind a fee.

## 3.8 Names that are easy to confuse

| Cluster | Members |
|---|---|
| Lantern | the Lantern (comet), Lantern of the Deep (Ida's lamp), Lantern Shard, Lantern Night, Lantern Fair (festival), Lantern Cake, "little lantern" (Lily), Lantern Thief, Sol's Lantern Chart, Keeper's Lamp, *Lamp in the Window*, *A Lamp for the Lost*, Lamplighter, Lanternbearer, soul lantern |
| Hollow / H names | the Hollow, Hollow Herald, Hollow Gate, Hollow Fen, Hollow Crown, *The Hollow Under the Ice*, Frost Hollow; Brother **Hollis**; Hal, Hush, Hob, Hask, Haddock |
| Warden | Warden Reyes, the wardens, the Wardens guild, the Warden (the mob), the Bell Warden (boss), "wardens of the water", Sealwarden and Sworn Warden (titles), Warden (a Calling) |
| Long ... | the Long Storm (the past), *The Long Night* (Act V quest), **Long Night (a calendar festival)**, Lantern Night (the finale), *The Long Watch*, *The Long Vigil*, *The Long Night on the Sand*, *Long Night in the Stable*, *Down the Long Stair* |
| Keeper / key | chapel keeper (Hollis, Ashgrave, Tam), the bell's keeper, Keeper's Gift, Keeper's Heir, Keeper of the Fen, Keeper of the Seven, Keeper of the Survey, "the keeper is the key", three keys |
| Seal / key / shard | three seals, three keys (heart-stones in the seals), the Lantern shard, echo shards, amethyst shards, prismarine shards and prismarine crystals |
| Choir | the Gray Choir, *The Drowned Choir* (a prologue quest about drowned), the chapel choir, the Cantor |
| Same name, two things | **Old Gnasher** (Tobin's giant fish and Brannoch's beast at the mine, both champions, both with quests titled "Old Gnasher"); **Barnaby** (the player's cover name in Act II and Barnaby Pike the sailor); Tam (Brother Tam, Tam Hask, Tamsin); *The Listening Stone* (Act III quest and Ida's heart quest); "Dawn" (three quests); "Partners" (Quill and Rook); *Graveyard Shift* (a questline) and "Graveyard Shift, Beach Edition" / *The Night Shift* (a festival quest) |
| M / B / P names | Mara, Moss, Marta, Marty, Marcel, Marigold, Marrow, Marsh; Bram, Brann, Brannoch, Brynn, Bea; Pip, Pell, Pike, Prewitt, Pebble, Pudding, Polaris |
| One place, several names | Stargazer's Ruin = "Fenn's ruin" = "his tower" = observatory; Smugglers' Cove = "the cove" = sea cave; Hollow Fen = "the Fen" = the witch's hut; the Old Chapel = "the chapel" |

24 chapter ids are reused across stories (`gate` and `chapel` and `vigil` and `long_night` three times each); legal, but confusing in logs, release notes and operator tools.

## 3.9 Text length (forms today, captions if the spec moves there)

- Today a page is a form body, so length is comfortable: median 168 characters, none over 317.
- If dialogue moves to on-screen captions: 1,554 of 1,904 intro/outro pages (82%) are over 120 characters, 997 of 2,251 text pages (44%) have more than 4 sentences and 119 have 8 or more. Only a rewrite or an automatic splitter gets there.
- **Vision scenes already are captions** (title and subtitle, and a chat copy): 72 of 103 scenes are over 120 characters, the longest 240. These are the lines most likely to be cut off on a phone screen today.
- 137 single sentences are over 120 characters (main 70, side 55); the longest are Wren's run-ons (231 and 213 characters), which are in character but unreadable as one caption.
- 36 objective labels are over 60 characters; the tracker row is 32.
- Long sequences of forms: 36 chapters have more than 5 intro pages as authored (*Forty Winters* 17, *The Long Night* 11, *The Herald* 10); 53 have more than 4 outro pages. Many are variants, but a player still clicks Next 6 to 9 times at the climax.
- Appendix 6 lists every long sentence, scene and label.

## 3.10 Where a returning player has no idea what is going on

- There is no recap anywhere. "Hear the intro again" replays 4 to 11 pages of one quest's intro, which assumes the context instead of giving it.
- Dialogue leans on memory: "all that business with the seals", "what you promised her", "you told me to go to Reyes", "the list said bring him before he wakes".
- The log's `Now:` line shows the tracked quest or the first main quest; with 3 to 10 quests accepted (which is normal, since every NPC offers one) it shows one of them without saying which one moves the story.
- After a break the pending step is often a wait (night, storm, a day) or a wall (monument, Nether, ancient city) with nothing saying what to prepare.
- In a party the main story silently switches to the chapter of whoever is furthest behind; a returning veteran sees "Party quest: helping your party" for a quest they finished months ago, and their own story "waits" with no recap of either.
- Finishing an act prints up to 8 `New story:` chat lines at once (Act II: Act III, four side questlines, three heart stories); a week later they are gone and the same 8 are an unsorted list under Available.

## 3.11 Content that works badly with 2 to 4 players

The engine side is ahead of the content here (shared accept, report, scenes and counts). What the content does:

- **One person decides for everyone.** 27 choice points change player-wide flags or the mercy/iron counters (Quill's fate, Hollis's fate, Vesna's fate, Elsie, the promise, the ending). Whoever taps the NPC first reads the outro and chooses; mates "listen in" and get the same choice unless it does not fit their flags. The ending itself is chosen this way.
- **Paths that split a party.** Act II quests 4a/4b exist only for one value of `g:quill`; Act IV's nine seal quests exist by each player's own `first`/`second`/`now`; Act V's ally quests by four flags. Mates who chose differently earlier (or played a quest apart) are on different chapters and the party has to play both. Needs an engine check; the content gives it many chances to happen.
- **Written for one hero.** "You carry him home", "Nobody comes. You climb out alone", the whole `act1:path` = alone thread (14 reads) and Act V's "No One Is Coming" tell four players standing together that they are alone. Reyes's count-off of the dead depends on one player's ally count.
- **Solo-only content.** Heart stories (48 chapters), wanderer chains (29), favors, one-offs and The Calling are each player's own by design: 31% of all chapters, and the favors are what NPCs offer most often. In a group session these are the quests that pull people apart.
- **Riddles and cutscenes.** 22 typed riddles and 28 vision or dream steps count as done for the party when one member finishes; the others can miss the best scenes or the answer.
- **Sleep and clock steps** (10 and 53): with several players online one bed does nothing and nobody can skip to dusk.
- **Stealth with a crowd** (9 steps, shared scene): the least patient member sets off the reset or the ambush for all.
- **Counts are written for one size.** Counts add up in a party, so four players finish "64 arrows" or "defeat 20" in a quarter of the time while a solo player grinds. I found no party scaling of fetch counts, kill counts or waves in the content (only the hostile wanderers add one helper per party mate); the engine review should confirm.
- **Catch-up.** A party of mixed progress always plays the oldest chapter; with a 20-hour main line a newcomer keeps a veteran group in the prologue for hours, at reduced reward for the veterans.


---

# 4. How much choice the content creates

Counted from each story's `requires` (stories finished). "Open" means the player could start it now. Heart stories also need the player to be Close with that NPC; wanderer chains need a meeting in the wild; festival quests need their festival to be running (4 quests per festival); a daily favor is offered by each of the 12 questgivers every real day.

| Point in the story | Main quests on offer | Side questlines open (if none finished) | Heart stories unlockable | Wanderer chains | Festival quests | Daily favors | The Calling | Worst case open at once |
|---|---|---|---|---|---|---|---|---|
| New player | **2** (The Drowned Bell, The Last Map) | 5 | 4 | 6 | 4 | 12 | 1 | 34 |
| After The Drowned Bell only | 1 | 6 | 5 | 7 | 4 | 12 | 1 | 36 |
| After both prologue stories (Act I opens) | 1 | 7 | 6 | 7 | 4 | 12 | 1 | 38 |
| After Act I | 1 | 10 | 8 | 8 | 4 | 12 | 1 | 44 |
| After Act II | 1 | 14 | 11 | 8 | 4 | 12 | 1 | 51 |
| After Act III | 1 | 15 | 12 | 8 | 4 | 12 | 1 | 53 |
| After Act IV | 1 | 15 | 12 | 8 | 4 | 12 | 1 | 53 |
| After Act V | 0 | 15 | 12 | 8 | 4 | 12 | 1 | 52 |

A realistic player (two hearts unlocked, two wanderers met, no festival, three favors taken) sees about: **14 things to start on day one** (2 main, 5 side, a favor at every NPC they talk to), **19 after Act I**, **25 after Act II**. The number only goes down when a questline is finished, and the side questlines average 6 quests and 1.5 to 2 hours each.

What makes it feel worse than the numbers:

- **A new player's first screen is a fork**: two main stories, five side questlines, and no rule for which comes first. Three of the five side questlines open on day one are long (*Hearth and Table* 39 steps, *The Wardens' Oath* 17, *Graveyard Shift* 15).
- **Every NPC is a menu.** On day one Tobin has a main story, a side questline and a favor; after Act II Ida, Moss, Hollis, Wren and Tobin each have three story offers plus a favor. Talking to the NPC the main story sent you to shows three or four buttons of the same weight (`Main story`, `Story`, `Heart story`, `Daily favor`).
- **Everything accepted is tracked as equal.** The log lists current quests "main story first, then side stories and favors" with no cap; the tracker follows the last accepted chapter unless one is pinned.
- **Unlocks arrive in bursts** at the end of an act (3 side + 2 heart after Act I; 4 side + 3 heart after Act II) instead of one at a time where the story introduces the person.
- **Nothing says what is optional, what is long, or what matters later.** *A Room at the Inn* decides whether an ending exists and *The Witch's Bargain* whether an ally exists; they look exactly like *Wren's Lost Lambs*.
- **In a group** each of 2 to 4 players has a different set of 15 to 25 open things; only main, side and festival quests can be shared, and the 12 daily favors, heart stories and wanderer jobs cannot. "What shall we do tonight?" has no default answer.

Side questlines by what unlocks them: nothing: Graveyard Shift, Wren's Lost Lambs, The One That Got Away, Hearth and Table, The Wardens' Oath. The Drowned Bell: Little Turtles. The Last Map: Edges of the Map. Act I: A Room at the Inn, The Star Kittens, The Forge That Sings. Act II: The Witch's Bargain, Lamp in the Window, Smuggler's Run, The Mayor's Burden. Act III: The Listening Deep.


---

# 5. Rework proposal

Principles: keep the world, the cast, the three endings and almost all the prose; keep every story id, chapter id and choice id (progress is saved by them); fix confusion with ordering, gating and added text first, and rewrite only where the structure itself is the problem. Vocabulary used below: a **Chapter** is what the files call a story of kind `main` (seven of them); a **quest** is what the files call a chapter; a **part** is a new grouping of two to four quests that share one recap.

## 5.1 The spine (golden path)

One Chapter is open at a time and it always has exactly one next quest. The log, the tracker, the NPC menus and the recap all point at that quest first. Everything else is a detour that says so.

| Chapter | Story id | Giver | Parts (quests) | Change from today |
|---|---|---|---|---|
| 1. The Drowned Bell | `drowned_bell` | Tobin | A "A Bell That Isn't There" (`salt`, `choir`, `vigil`); B "Iron for a Bell" (`iron`, `sunken`, `warden`) | The only story offered to a new player. `iron`: prismarine becomes one way of two (5.3). Last outro gains Tobin's hand-over to Mara. |
| 2. The Last Map | `last_map` | Mara | A "Three Pins" (`pins`, `far`); B "The Line Home" (`chapel`, `last`) | Now requires `drowned_bell`. One pin required, two optional (5.3). Last outro gains Mara's hand-over to Sol. |
| 3. Signs in the Sky | `act1_signs` | Sol | A "The Smudge" (`smudge`, `fallen`, `rhyme`); B "What the Town Forgot" (`keeper`, `graves`, `echo`, `inn`); C "The Gray Ring" (`song`, `choice`, `count`) | Hand-over lines on 7 outros. `rhyme` folds into `fallen` (5.3). |
| 4. The Gray Choir | `act2_choir` | Reyes | A "The Missing Boy" (`pattern`, `pip`, `ledger`); B "The Ledger" (`double` or `raid`, `letter`, `confession`); C "The Counter-Song" (`fen`, `tear`, `hollis_night`); D "The Ring Burns" (`ring_burns`, `mayor`) | `fen` + `tear` merge; the ghast tear gets a second way. Hollis is always decided by the end of part C (5.3). |
| 5. Into the Deep | `act3_deep` | Ida | A "Echoes" (`echoes`, `lamp`, `mine`); B "The Storm Night" (`listening`, `tobin`, `herald`); C "The Last Starwright" (`flame` + `seal` merged, `apron`, `keys`) | Echo shards get a way without an ancient city. One trip to the Stone Seal, not two. `herald` moves before `flame`. |
| 6. The Three Seals | `act4_seals` | Elsie | A "The Council" (`council`); B, C, D one part per seal (Tide, Stone, Sky, in the chosen order; 2 quests each after merging); E "The Promise" (`promise`, `gate`) | 12 quests become 9. Mara joins one branch (5.3). |
| 7. Lantern Night | `act5_lantern` | Bram | A "Rally" (`rally`, then the ally detours); B "The Long Night" (`long_night`); C "The Gate" (`gate`, `herald`); D "The Choice" (`choice`); E "Dawn" (a `dawn_*`, `forty`) | `rally` shrinks; ally quests are marked as detours with a line saying which ones this player has. |

Rules of the spine:

1. **One entry.** `last_map.requires = { stories: ["drowned_bell"] }`. (The alternative, a short new first quest that leads to both, costs more text and leaves the fork.)
2. **Every outro whose next quest is at another NPC ends with a hand-over line** naming that NPC and the reason (a new field `next`, shown as the outro's last page and kept in the log as "Next"). About 35 lines; drafts for Act I are in 5.7.
3. **A goal line on every quest** (`goal`, at most 80 characters): why you are doing it. It heads the quest's page in the log and the tracker's first row. Example for `act3_deep/mine`: "Find out why the miners sealed a tunnel after the Long Storm."
4. **The recap (5.4) is per part**, shown when a part starts, on the first log open after 3 real days away, and on demand ("The story so far").
5. **The countdown is the progress bar.** Sol's sixty nights become a line derived from progress, not from time: 60 at the end of Chapter 3, 45 after Chapter 4, 30 after Chapter 5, 20/15/10 as each seal is lit, 3 after `gate`, "tomorrow" in `rally`, "tonight" from `long_night`. The log header shows `Lantern: 30 nights`, and NPCs say it (5.7).
6. **Walls are announced before they are hit.** A `needs` list on a quest (`"nether"`, `"monument"`, `"deep"`, `"sky"`, `"storm"`) is shown at the hand-over ("You will need: a way into the Nether"), so a returning group can prepare or pick the other way.

## 5.2 What each side category becomes

| Category | Today | Proposal |
|---|---|---|
| Side questlines (15) | 5 open on day one, 14 by Act II, all equal | **Town stories, at most two offered at a time.** Each gets `opensAfter` (a main quest, not just an act) and `weight`; the two lightest open ones show as "Offered now" in the log and at the NPC, the rest as one collapsed line "Later in town (n)". Finishing or declining one offers the next. A player can still start any open one from "Later in town": nothing is locked, only unsorted lists go away. |
| Side questlines that change the finale (4) | look like the rest | Tagged **"Matters on Lantern Night"**: *A Room at the Inn* (an ending), *The Witch's Bargain* (an ally), *Lamp in the Window* (an ally's scene), *The Wardens' Oath* (the Long Night). They sort first, and Elsie reminds the player about *A Room at the Inn* before `act4_seals/promise`. |
| Heart stories (12) | appear at the NPC and in Available when Close | Stay each player's own. Offered only at the NPC, never in "what next", listed on a "Friends" page of the log. In a party, mates may walk along and listen (no progress, no reward). |
| Wanderer chains (8) | met in the wild, up to 8 at once | One chain active at a time; a second wanderer says "finish with {name} first, I'll be at my camp". Never in "what next". |
| Stranger one-offs (24) and hostiles (4) | per meeting | Unchanged; shown under "Odd jobs", never tracked over a main quest unless pinned. |
| Daily favors (48) | one per NPC per day, 12 a day | **A town board of three.** Each real day three favors are posted (seeded per party, else per player), preferring NPCs of the current part. Party-shared. The per-NPC "Daily favor" button stays only for those three. Cuts 12 daily offers to 3 without deleting a template. |
| Festival quests (16) | 4 per festival, listed with the rest | One log group "Festival: {name} (4)" while the festival runs; never in "what next" but announced once per festival. |
| The Calling | a side story | Unchanged (it is a one-time pointer to the Skills pack); hidden from "Later in town". |

Suggested `opensAfter` and order (lower weight is offered first):

| Town story | Opens after | Weight | Why there |
|---|---|---|---|
| Little Turtles | `drowned_bell/warden` | 10 | Same NPC and beach as the prologue; gentle; 5 quests |
| Wren's Lost Lambs | `drowned_bell/salt` | 20 | The cozy starter; teaches leads, taming, building |
| The One That Got Away | Little Turtles finished | 30 | Tobin's second story; never two Tobin stories at once |
| Graveyard Shift | `act1_signs/graves` | 40 | The main story introduces Moss there |
| Hearth and Table | `act1_signs/inn` | 50 | The main story introduces Bea there |
| The Wardens' Oath | `act1_signs/choice` | 15 (matters) | Reyes becomes central; pays off in The Long Night |
| The Star Kittens | Act I finished | 60 | as today |
| A Room at the Inn | Act I finished | 5 (matters) | as today, but offered first |
| The Forge That Sings | `act2_choir/letter` | 70 | Ida's forge is attacked there; needs the Nether, which Act II also opens |
| Edges of the Map | Act I finished (was: The Last Map) | 90 | Long travel; the End becomes an optional epilogue |
| Smuggler's Run | Act II finished | 60 | as today |
| The Mayor's Burden | Act II finished | 65 | as today |
| The Witch's Bargain | Act II finished | 5 (matters) | as today, offered first |
| Lamp in the Window | Act II finished, Hollis saved | 10 (matters) | as today |
| The Listening Deep | Act III finished, Expeditions | 95 | as today; see 5.3 |

Result at each point (side questlines offered, not counting ones in progress): day one 1 (was 5); after the prologue 2; after Act I 2 offered + 3 later (was 10 open); after Act II 2 offered + up to 8 later (was 14). With the favor board, a new player's first hour has 1 main quest, 1 town story and 3 favors on the board instead of 2 + 5 + 12.

## 5.3 Quests to cut, merge, shorten, re-order or rewrite

Every row keeps ids where it can; "merge A into B" means A's steps and best pages move into B and A is removed (the engine already tidies chapters that vanished; a player standing on A needs a one-time migration rule: mark A done, or move to B).

| # | Quest | Change | Reason | Tier |
|---|---|---|---|---|
| 1 | `drowned_bell/iron` | 24 iron and 12 prismarine shards become 16 iron and an either/or: 6 prismarine shards, or 12 glass and 6 lapis ("sea-glass the plain way") | An ocean monument in the fourth quest of the game stops casual players before the story starts | must |
| 2 | `drowned_bell/choir` | Drop "catch 5 things" or make it optional with one outro line about the empty lines | Never explained or paid off | must |
| 3 | `drowned_bell/vigil` | Keep the storm; add an either/or: 120 s in a thunderstorm, or 120 s at the lighthouse after midnight when the Weather Almanac is not installed | A random weather gate in quest 3 | must |
| 4 | `last_map/far` | One pin required (the nearest), the other two optional with a bonus; put a small find at each pin (a cairn with one clue line) | About 2,500 blocks of travel to empty ground | must |
| 5 | `act1_signs/smudge` | Sol lends his cracked spyglass (a named item given at accept); "bring a spyglass" becomes optional (bonus: the polished one) | Amethyst wall in the first quest of Act I | must |
| 6 | `act1_signs/rhyme` | Merge into `fallen`: after the crater, the report goes to Sol, then one talk with Tobin with Wren's skipping scene as its intro; drop the string delivery | A fetch of 3 string and a third NPC for one (good) scene | should |
| 7 | `act1_signs/inn` | Keep; shorten to the chest and the scene; move the "Starwright bread" slip to the choice reply so it lands for everyone | The weakest link to the plot at that point, with the best clue in it | should |
| 8 | `act2_choir/fen` + `tear` | One quest "The Witch of Hollow Fen": meet Vesna, bring stew and a spider eye, then an either/or for the third price: a ghast tear, or sit a night vigil at the Fen and answer the riddle | A Nether trip to deliver a one-word answer; two trips to the farthest hut | should |
| 9 | `act2_choir/hollis_night` | The song path sets `g:hollis` = `shaken` instead of leaving it unset (it still passes every `!saved` and `!lost` test, so no logic changes); text and recaps can then say plainly that the voice is still in him and that Act III decides it | Removes the unnamed "neither saved nor lost" state that five quests of variant text have to hedge around | must |
| 10 | `act2_choir/raid`, `ring_burns`, `act4/gate`, `act5/gate` | Halve required kill counts (20 to 10, 20/14 to 12/8, 12 to 8, 30 to 15); outros say the hoods "throw down their masks and run" | Tone (3.4) and grind | should |
| 11 | `act3_deep/echoes` | Add a third way that always exists: the sneak at the mine ends at the diggers' crate, which holds the shards (an `interact`); ancient city and Sculk Depths stay as bonus ways | Ancient city wall when Expeditions is not installed | must |
| 12 | `act3_deep/lamp` | Give a real item at `echoes` (a named soul lantern, "Lantern of the Deep", renamed **"Ida's Echo Lamp"**), and let "hold the lamp" steps check for it in a hand or accept any soul lantern | Seven steps refer to an item the player does not have; also frees the word Lantern | must (name), should (item) |
| 13 | `act3_deep/mine` | "Mine 40 deepslate anywhere" becomes "clear the fallen stone at the mine: mine 16 blocks there" | The step contradicts its own text | should |
| 14 | `act3_deep/flame` + `seal` | One quest "The Room Below": follow the flame, light the room, hold it against two waves (was three), the seal cracks and something roars | Two trips to y -45 for one beat; the failed charge reads as wasted effort | should |
| 15 | `act3_deep/herald` | Move before `flame`; one riddle set (the place still differs by `g:hollis`) | Puts the three reveals (storm night, Hal, the Herald) together; halves the duplicate text | should |
| 16 | `act4_seals/council` | One step: ring the inn's bell (or talk to Elsie once more); the outro stays | Four talk steps to fetch four people | should |
| 17 | `act4_seals/tide_vault` + `tide_boat` | One quest: 8 crystals (was 16), guardians optional, row out, the Gatekeeper | 3 quests per seal is one too many | should |
| 18 | `act4_seals/stone_door` + `stone_frame` | One quest: sneak in, place the 16 blocks, keep still | Same room three times | should |
| 19 | `act4_seals/sky_stair` + `sky_bridge` | One quest: climb, bridge (24 blocks), the Lantern Thief | Three climbs to y 220 | should |
| 20 | Act IV "Ask about ..." buttons (21) | Move under a "Talk a while" button on the quest's page, or mark them `flavor` so the menu shows Accept first | They look like decisions and hide Accept | must |
| 21 | `act4_seals`, one branch | Mara comes on the Sky or Stone branch (two pages and one step: she maps the door) | Pays off "finding doors" (3.1.5) | should |
| 22 | `act5_lantern/rally` | An either/or of three ways to help (Reyes: 32 arrows or 2 shields; Bea: 16 of any cooked food; Wren: the horses), any two | A shopping list at the climax | should |
| 23 | `act5_lantern/herald` | When Hollis was lost, the first fight ends with Hollis freed and dying, as written, but the label reads "Free Brother Hollis from the voice" | Softens "defeat Hollis" without changing the story | should |
| 24 | `act5_lantern/dawn_*` | Add one page: the player gives Stabby back to Pip | Dangling promise | should |
| 25 | `hearth_and_table` | 7 quests stay; each asks for one dish (the kitchen way) or one plain delivery, and the duplicated `way`/`pack` step triplets collapse into one either/or per quest: 39 steps to about 18 | 29 deliveries | should |
| 26 | `edges_of_map/end` | Optional epilogue after the title | The End as a requirement for a side story | should |
| 27 | `listening_deep` | Fold into Ida's menu as five repeatable "deep jobs" with the same text, or keep as a questline that is never in "Offered now" | 6 of 7 steps belong to another pack | could |
| 28 | Names | Brannoch's beast: "Old Gnasher" becomes **"Old Rimejaw"** (title "Rimejaw's Bane" needs a migration, or keep the title and only rename the mob and quest); Quill's cover name "Barnaby" becomes **"Nobby"**; `heart_ida/listening` "The Listening Stone" becomes "The Quiet Seam"; the three "Dawn" quests become "Dawn: The Lantern", "Dawn: The Star", "Dawn: The Crown"; `w_rook_rival/partners` becomes "Even"; *The Drowned Choir* becomes "The Drowned on the Shore"; the miner "Brann" becomes "Corry", "Tam Hask" becomes "Wil Hask" | 3.8 | must |
| 29 | "Lantern Night" vs the Long Night festival | The Act V quest *The Long Night* becomes **"Hold the Lighthouse"**; in text, the finale is always "Lantern Night" and the past is always "the Long Storm" | 3.8 | must |
| 30 | The Hollow Crown | Townsfolk coldness lasts until the player finishes a new short quest "Put It Down" (one per realm year) or is limited to greetings, never prices or access; in a party it is always chosen per player (5.6) | A permanent mark on a friends realm | could |
| 31 | Favors | Remove the 12-a-day offer (the board of three, 5.2); retire the six most generic templates per review | Repetition | should |
| 32 | The three bricked-up miners; Elsie's brass plate; the Choir's named neighbors | One line each: Ida says in `stone_light` that the wall is quiet now; Elsie explains the plate in `apron` (the cracked circle is the Starwrights' mark for a broken seal, which the Choir took as its sign); in `mayor`'s truth reply the cooper and the widow come back to the square | Dangling threads | should |

Main-story quest count after the "should" tier: 68 becomes about 58; required steps on the golden path drop from about 150 to about 115; estimated time from about 20 hours to about 14.

## 5.4 "Previously" recaps (drafted)

Format: a `recap` on each part: 2 to 3 short sentences, plain ASCII, at most 240 characters, no speaker. State lines (below) are appended when their flag is set, at most two per recap, newest first. Shown as: `Previously: <recap> <state lines>` then `Now: <goal of the next quest>`.

**Chapter 1, The Drowned Bell**

- 1A (`salt`, `choir`, `vigil`): A bell rings at night in a harbor that has had no bell for forty winters. Drowned walk out of the surf with tarred bell rope on their wrists. Old Tobin wants to know what is pulling the rope.
- 1B (`iron`, `sunken`, `warden`): The old harbor bell is awake under the sea, where the tower fell in the Long Storm. Ida the Relicsmith can forge a band to silence it or a clapper to recast it. Someone has to dive down and strike it.

**Chapter 2, The Last Map**

- 2A (`pins`, `far`): The bell is settled. Mara's teacher, Aldous Fenn, left her an unfinished map with three pins far out and a note: FINISH IT. You are walking to the pins for her.
- 2B (`chapel`, `last`): Fenn's three pins draw a line that points home, to the Old Chapel. His last note says the map is finished when someone walks it. Mara wants a map of a place you love for its last page.

**Chapter 3, Signs in the Sky**

- 3A (`smudge`, `fallen`, `rhyme`): The bell is settled and Fenn's map is finished. Now Sol the Sky-reader has seen a smudge in the eastern sky that grows every night. He thinks it has to do with the night the tower fell.
- 3B (`keeper`, `graves`, `echo`, `inn`): At the Starfall Crater you saw a bell break a comet, rung in a rhythm the town's children still skip rope to: slow, slow, quick. Brother Hollis hears that rhythm in his sleep. Others in town know pieces of the Long Storm.
- 3C (`song`, `choice`, `count`): Fenn's echo named three seals that hold something down under the world: Tide, Stone and Sky. People in gray hoods, the Gray Choir, are opening the Long Storm's graves. Brother Hollis walks toward them in his sleep.

**Chapter 4, The Gray Choir**

- 4A (`pattern`, `pip`, `ledger`): The smudge is a comet, the Lantern, and it passes in sixty nights. The Gray Choir means to ring a broken note that night, and they want Brother Hollis to ring it. Warden Reyes is hunting them.
- 4B (`double` or `raid`, `letter`, `confession`): The Choir took a boy, Pip, and you brought him home. Their crates carried Quill the Trader's mark. Their books are kept at the Smugglers' Cove.
- 4C (`fen`, `tear`, `hollis_night`): The Choir wants the bell's tongue, and Ida. Hollis let them into the crypt in his sleep, and the coffin of the old keeper, Brother Ashgrave, is empty: he got up. Moss knows a witch who knew him.
- 4D (`ring_burns`, `mayor`): Vesna of the Fen taught you the counter-song: a lullaby. Ashgrave's voice called Hollis into the sea, and you went after him. Reyes knows where the whole Choir will gather.

**Chapter 5, Into the Deep**

- 5A (`echoes`, `lamp`, `mine`): The Gray Ring is burned and the Cantor is dead. Her last words: you can't kill a song. Ida has a crystal from Fenn's things that hums at night, and she wants to hear what it remembers.
- 5B (`listening`, `tobin`, `herald`): Ida's lamp plays echoes, sounds the stone kept. It showed the Starwrights, people in coats of stars, building a seal deep underground, and miners who walled up a tunnel that sang. Now the lamp pulls toward the Old Chapel.
- 5C (`flame`, `seal`, `apron`, `keys`): Forty winters ago Brother Ashgrave rang the bell to get his dead daughter back, and the note cracked the Lantern. Hal, Tobin's brother, died trying to stop him. Ashgrave is the Herald now, the voice of the Hollow.

Note: parts 5B and 5C above follow the re-ordered Chapter 5 (5.3 row 15). Until that ships, 5B is `listening`, `tobin`, `flame`, `seal` and 5C is `herald`, `apron`, `keys`; use the same texts, with 5C reading: "Forty winters ago Brother Ashgrave rang the bell to get his dead daughter back, and the note cracked the Lantern. Hal, Tobin's brother, died trying to stop him. The Stone Seal under the mine is cracked, and something below it roared."

**Chapter 6, The Three Seals**

- 6A (`council`): Elsie the innkeeper is the last Starwright. Each seal has a key that must be relit with a piece of the Lantern before the comet passes, and she cut that piece from her apron for you: the Lantern Shard. Tide, Stone, Sky.
- 6 Tide (`tide_*`): The Tide Seal lies on the sea floor, past the ocean monuments. Old Tobin is coming along in his brother Hal's boat. Light the seal's ring of sea lanterns with the shard.
- 6 Stone (`stone_*`): The Stone Seal is the chained door far under the old mine. Its frame has crumbled and Ida will help rebuild it. Be quiet down there: the Warden is the Hollow's ear.
- 6 Sky (`sky_*`): The Sky Seal is a ring of quartz and glass above the clouds. Sol found it by the stars. Bridge the gap in the ring and light its crown.
- 6E (`promise`, `gate`): All three seals are lit and the Lantern is close enough to read by. Elsie has one more thing to ask of you before it passes.

**Chapter 7, Lantern Night**

- 7A (`rally` and the ally quests): A meteor opened the Hollow Gate, and the Herald spoke to the whole town at once. The Lantern passes tomorrow night. Mayor Bram is getting everyone ready.
- 7B (`long_night`): The town is armed and fed, and whoever you won over stands with it. At dusk the drowned come for the lighthouse. Hold it until dawn.
- 7C (`gate`, `herald`): The lighthouse held, and Pip kept the light burning all night. Everything that came, came from the Hollow Gate. The Herald is waiting there.
- 7D (`choice`): The Herald fell three times. The Lantern stands over the Sky Seal and the three keys are lit. Elsie is waiting for you at the top.
- 7E (a `dawn_*`, `forty`): Lantern Night is over and the town is still standing. There are people to see, and one tree to plant.

**State lines** (appended when true; one sentence each)

| Flag | Line |
|---|---|
| `drowned_bell.bell` = silence | You silenced the harbor bell with Ida's iron band. |
| `drowned_bell.bell` = ring | You recast the harbor bell; it rings the tide in every evening. |
| `last_map.map` = share / keep | Fenn's map hangs in the square for every traveler. / Fenn's map stays on Mara's shelf. |
| `act1_signs.act1:path` = report | You told Warden Reyes about the Choir, and her wardens stand with you. |
| `act1_signs.act1:path` = alone | You kept the Choir from Reyes to protect Hollis, and went alone. |
| `g:quill` = trusted | You trusted Quill. He is your man inside the Choir. |
| `g:quill` = exposed | You gave Quill to Reyes. He sits in her cells. |
| `act2_choir.hollis_way` = song, `g:hollis` unset | Brother Hollis came back from the sea, but the voice is not done with him. |
| `g:hollis` = saved | Brother Hollis is free of the voice and sleeps again. |
| `g:hollis` = lost | The voice has Brother Hollis. His chair by the fire stays empty. |
| `act2_choir.mayor` = truth / bury | Bram told the town the truth about the Long Storm. / Only you, Bram and Reyes know what the old mayor buried. |
| `act3_deep.elsie` = forgive / condemn | You forgave Elsie her forty winters of silence. / You told Elsie she should have spoken forty winters ago. |
| `act3_deep.keys` = miners / wayfarers | Ida's miners stand with you. / Sol's wayfarers stand with you. |
| `act4_seals.first`, `second`, `now` | Seals lit: {list}. Next: the {now} Seal. (or: No seal is lit yet.) |
| `act4_seals.act4:promise` = allow | You promised to let Elsie choose, if it comes to that. |
| `act4_seals.act4:promise` = refuse | You told Elsie that nobody else dies for the seals. |
| `g:vesna` = free / bound | Vesna of the Fen is free, and owes you a song. / Vesna is bound to the Fen and must come when called. |
| `g:allies` (Chapter 7) | With you tonight: {Quill's boats, Vesna, Brother Hollis}. (or: Nobody answered. It is the town alone.) |
| `inn_ghost` finished | You helped Lily, Elsie's little sister, to rest. |
| `g:ending` = relight | You relit the Lantern. The Hollow sleeps for forty winters. |
| `g:ending` = gift | Elsie became the seal. She is the star you can see by day. |
| `g:ending` = crown | You took the Hollow Crown. The town is safe, and afraid of you. |
| `g:mercy` >= 4 / `g:iron` >= 4 | In town they say you are gentle with people. / In town they say you are hard when it is needed. |

**Town stories** (one recap each; a second sentence can be added per quest later)

| Story | Recap |
|---|---|
| A Room at the Inn | Room three at the inn is always cold, and a little ghost named Lily leaves her toys around town. She is Elsie's sister, lost in the Long Storm. |
| Graveyard Shift | You work nights for Moss the gravedigger. The dead in his yard are restless, and some are just rude. |
| The Witch's Bargain | Something is poisoning Hollow Fen. Vesna the witch made a promise to the water long ago, and it has come due. |
| Lamp in the Window | The Choir is broken, and Brother Hollis is putting the chapel, and himself, back together. |
| Wren's Lost Lambs | Wren's animals keep getting out, and she has a name for every one of them. |
| The Star Kittens | Sol's late wife Adela named seven cats after the stars. Wren found their collars, and Sol wants his old friends back. |
| Little Turtles | Turtles nested on the beach below the lighthouse for the first time in forty years. Old Tobin is guarding the eggs. |
| The One That Got Away | Old Tobin swears he once hooked a giant fish with lantern eyes. Nobody believes him yet. |
| Hearth and Table | You are Bea's kitchen hand at the inn. She feeds the whole town and shouts while she does it. |
| The Wardens' Oath | Warden Reyes is training three recruits, Dace, Brynn and Orrin, and wants you beside them. |
| Smuggler's Run | Quill has jobs that are not quite legal: a crate, a map, a boat at night. |
| The Mayor's Burden | It is election week, and Mayor Bram's ballots, neighbors and statue are all going wrong. |
| Edges of the Map | Mara wants the blank edges of her map filled in: sand, snow, swamp, the deep sea and beyond. |
| The Forge That Sings | Ida is forging her masterwork from her master Dunmore's notes. It needs fire from the Nether. |
| The Listening Deep | Ida's lamp hums toward the deep places. Each one you clear makes the roots of the Hollow a little quieter. |

**Coming back after a while** (the wrapper the log shows on the first open after 3 real days): `Welcome back. <recap> <state lines> Now: <goal>. <NPC> is <direction and distance>.` In a party: `Your party is on "<quest>" (<Chapter>), where <names> are. <that part's recap> Your own story waits at "<own quest>".`


## 5.5 "What now" lines for unclear steps (drafted)

Finding: all 252 chapters have a `hint`, and the hints are good, but a hint costs a quarter of the chapter's levels and Crowns, and only 26 of 607 steps have their own. The plain instruction should be free and the fee should buy only the exact coordinates. Proposal: a free `tip` on every step (at most 100 characters, ASCII, an instruction that names the place or the action), shown under the step in the log and as the tracker's second row. Steps of types `deliver`, `collect`, `defeat` (with a count and mobs), `talk`, `fish`, `mine`, `place`, `tend`, `tame` usually need none because the label is the instruction; `check-stories` should require a `tip` on every `vision`, `sleep`, `wait`, `follow`, `event`, `use`, `interact`, `inspect`, `stealth`, `escort`, `lead`, `answer`, `vigil`, `survive`, on every `defeat` with a champion, and on every `collect` with a `name`.

The 58 steps a script flagged (cutscenes, sleeps, waits, trails, champions without a place, named items, other packs' events), with a drafted line each:

| Step | Label today | Drafted `tip` |
|---|---|---|
| `act1_signs/fallen` 3 | Touch the crater's glowing heart | Walk to the glowing core in the middle of the crater. A vision plays; stay close. |
| `act1_signs/keeper` 3 | Stay when the candles go out | Stay inside the Old Chapel after the vigil. The scene plays by itself. |
| `act1_signs/inn` 2 | Help Elsie move her things into the new chest | Nothing to do: after you give Elsie the chest, watch the scene. |
| `act1_signs/song` 1 | Follow the pale light Hollis follows | At night, go to the Old Chapel. A pale light waits there: walk after it. |
| `act1_signs/song` 3 | Listen to the Cantor | Stay hidden inside the Gray Ring. The scene plays by itself. |
| `act1_signs/count` 3 | Look into the dark between the stars | Stay at the Stargazer's Ruin after the count. The scene plays by itself. |
| `act2_choir/pip` 1 | Follow Pip's trail of dropped toys | Start at the Haddock farm (on the tracker). The toys glow: walk from one to the next. |
| `act2_choir/letter` 2 | Catch the thief at the forge | Wait for night near Ida. Hush appears close to you: bring him down before he runs. |
| `act2_choir/confession` 1 | Help Moss dig out the crypt steps (break 12 dirt) | Break 12 dirt or grass blocks; any will do. Then search the crypt at the graveyard. |
| `act2_choir/mayor` 2 | Read the old mayor's sealed order | Nothing to do: after you talk to Tobin, the order plays as a scene. |
| `act3_deep/lamp` 2 | Hold the lamp and hear the first echo | Go below y -40 anywhere. The echo plays by itself; you need no item in hand. |
| `act3_deep/mine` 2 | Mine 40 deepslate (anywhere below y 0) | Any deepslate below y 0 counts, also away from the mine. |
| `act3_deep/listening` 2 | Hold the lamp to the listening stone | Tap the loose stone under the chapel window, then stay. The scene plays by itself. |
| `act3_deep/flame` 1 | Follow the lamp's leaning flame down from the mine | Go to the Abandoned Mine. A small flame waits at the entrance: walk after it, down. |
| `act3_deep/seal` 2 | Listen as the seal drinks the lamp's light | Stay in the seal room after the last wave. The scene plays by itself. |
| `act3_deep/apron` 2 | Sleep a night under Elsie's roof | Sleep in any bed tonight (everyone online must be in bed). A dream follows. |
| `act4_seals/tide_boat` 1 | Row a boat 200 blocks with Tobin aboard | Row any boat 200 blocks, anywhere. Tobin is with you in the story only. |
| `act4_seals/stone_frame` 2 | Sneak and keep still by the seal for 60 seconds | Hold sneak and do not move, next to the seal, for one minute. |
| `act4_seals/sky_vision` 1 | Stand in the Sky Seal's ring and let the shard show you | Stand in the middle of the ring at the Sky Seal. A vision plays; no item needed. |
| `act4_seals/promise` 3 | Sleep through the night | Sleep in any bed tonight (everyone online must be in bed). A dream follows. |
| `act5_lantern/gate` 4 | Look down into the Hollow Gate | Walk under the black arch. A vision plays; stay there. |
| `act5_lantern/choice` 4 | Let the Lantern's light pass through the crown | Stay on the Sky Seal after midnight. The scene plays, then go to Elsie to choose. |
| `act5_lantern/dawn_gift` 1 | Read the letter Elsie left behind | Nothing to do: the letter plays as soon as you accept. |
| `act5_lantern/dawn_crown` 2 | Sleep in a bed, if you can | Sleep in any bed tonight. A dream follows. |
| `inn_ghost/cold_room` 1 | Sleep through a night (room three, or any bed) | Sleep in any bed tonight. A dream follows. |
| `inn_ghost/sea_kept` 1-3 | Have a nautilus shell named Lily's Shell (and two more) | Rename the item at an anvil to the exact name. Carry it; it is not taken. |
| `inn_ghost/storm_child` 2 | Look back forty winters | Stay at the lighthouse after sundown. The scene plays by itself. |
| `vesna_bargain/fen_mother` 2 | Look into the steam | Stay by Vesna's cauldron after pouring. The scene plays by itself. |
| `vesna_bargain/spring` 1 | Give the Fen a day to settle | Wait one in-game day. It counts while you do other things. |
| `hollis_faith/dream` 1 | Sleep, and see whether the dream comes | Sleep in any bed tonight. A dream follows. |
| `hollis_faith/forgive` 1 | Read the names of the lost with Hollis at the Old Graveyard | Go to the Old Graveyard. The reading plays as a scene. |
| `star_kittens/same_sky` 2 | Sleep in a bed | Sleep in any bed tonight. A dream follows. |
| `hatchlings/fence` 3 | Wait two days for the eggs to hatch | Wait two in-game days. It counts while you do other things. |
| `hearth_and_table/hearts` 1 | Get 2 Champion's Hearts from fallen champions | Champions (named, tougher mobs) drop them. The Bounty Board lists where some are. |
| `wardens_oath/outpost` 3 | Defeat Sergeant Vell | Vell comes down after the two waves at the outpost. Stay there. |
| `wardens_oath/embers` 2 | Follow the trail of embers to the raiders' camp | Start where you read the clues. The embers glow: walk from one to the next. |
| `wardens_oath/red_hand` 2 | Defeat Captain Marrow, the Red Hand, at his camp (at night) | Go to the raiders' camp (on the tracker) after dark. He only comes at night. |
| `smugglers_run/crate` 2 | Sleep in a bed to lie low for a night | Sleep in any bed tonight. |
| `mayors_burden/unveiling` 3 | Set off 3 fireworks in the town square | Use 3 firework rockets on the ground in the town square (paper and gunpowder). |
| `mayors_burden/election` 1 | Wait one day while Prewitt counts the votes | Wait one in-game day. It counts while you do other things. |
| `singing_forge/dunmore` 2 | Lay a hand on the old anvil | Stand right by the anvil at Dunmore's old forge (on the tracker). A scene plays. |
| `heart_elsie/hearth` 1 | Sleep a night under Elsie's roof | Sleep in any bed tonight. |
| `heart_bram/speech` 1 | Set off 3 fireworks in the town square | Use 3 firework rockets on the ground in the town square. |
| `heart_hollis/plain_sleep` 1 | Sleep a night, so Hollis can | Sleep in any bed tonight. |
| `w_anwen_survey/line` 1 | Follow Anwen's light to the Stargazer's Ruin | Start at Anwen's camp. Her light drifts ahead: walk after it. |
| `w_anwen_survey/rest` 2 | Watch the stars with Anwen | Stay at the Stargazer's Ruin. The scene plays by itself. |
| `w_rook_rival/bounties` 2 | Beat Rook to the Brushwood Brute | The Brushwood Brute is a champion that appears near you. Find it and defeat it before Rook claims it. (Check the exact rule.) |
| `w_vesk_home/name` 2 | Sleep while Vesk keeps watch | Sleep in any bed tonight. |
| 10 festival steps | "... (Realm Calendar)" | During the festival, open the Realm Calendar and join "<activity>". It counts once you finish it. |
| `the_calling/*` 1 | Choose your Calling: tap Hollis (or Moss) and pick Choose a Calling | Tap the NPC, pick "Choose a Calling", then pick one. |

Notes: the lines "everyone online must be in bed" and the festival and Calling wording depend on world settings and on other packs' menus, so the implementer should check them. Two more lines are needed wherever the text says "the lamp" or "the shard": either the item exists (5.3 row 12) or the tip says "no item needed".

**A goal line per main quest** (`goal`, the "why"): 68 lines, about 60 characters each. Examples: `salt`: "Find out what rang in a harbor with no bell." `far`: "Walk to Fenn's pins and see what he was pointing at." `graves`: "Find out who is opening the Long Storm's graves." `tear`: "Pay Vesna's price for the counter-song." `mine`: "Find out why the miners sealed a tunnel after the storm." `stone_frame`: "Rebuild the Stone Seal's frame so it can hold the light." `rally`: "Get the town ready for Lantern Night."

## 5.6 Group play

**Sharing by step type.** Today everything in a shared story counts for the party in one of three modes (add, furthest, done-for-all). Proposed content-level field `party` on a step, checked against type:

| `party` | Meaning | Use for |
|---|---|---|
| `"shared"` (default) | as today | defeat, defend, mine, fish, place, tend, tame, lead, escort, follow, stealth, reach, ride, deliver, collect |
| `"together"` | starts when every online mate on the quest is within range (or after a 60-second "waiting for the party" window); plays for all at once | every `vision`, every `meet` with choices, the 6 riddles that are story beats (Fenn's lodestone, Vesna's lullaby, the Herald's three, the seal stone, Lily's lullaby), act finales |
| `"each"` | every member does their own | named keepsakes (Lily's toys), the map of "a place you love", naming choices (the cat, the horse), `wear` |
| `"any"` | one member is enough and the others are told who did it | `sleep` (replace with: one member sleeps, or the party rests 60 seconds at a campfire or the inn), `wait`, time-of-day vigils (the furthest-along rule already does this) |

**Clock steps.** For the 53 time-of-day vigils and 10 sleeps, add an either/or that does not need the world clock when two or more players are online: "keep watch for N seconds" at the place at any hour, with the night text kept as flavor (`when: { "party:size": ">=2" }` on the alternative). The engine could instead widen every window in multiplayer; the content needs the hook either way.

**Choices in a party.** Three kinds, set per choice with `decide`:

| `decide` | Rule | Which choices |
|---|---|---|
| `"each"` | every member picks for themselves; the outro's last page waits for each member's own tap (or a prompt on their screen while they listen in) | everything that sets `g:mercy` / `g:iron` only, every heart and flavor pick, **the ending** (`act5_lantern/choice`), Elsie forgive/condemn, the promise, Hollis's forgiveness, Pip's sword |
| `"vote"` | members online on the quest get a 45-second form; majority wins, the reporter breaks ties; absent members get the result | choices that change what the party plays next: Report or Pursue, Quill trusted/exposed, the first and second seal, sneak or fight at the Gate, the counter-song or force, Vesna free/bound |
| `"leader"` | the reporter decides (today's rule) | small local flags: parley, Vesna polite/rude, Hal carried/listened, the horse's name, the cat's name |

The split matters because a vote keeps the party on one branch (no more 4a/4b or seal-order splits), while moral counters and the ending stay personal: four players can stand at the Sky Seal and each take their own dawn (the three `dawn_*` quests are already separate, and a party can simply play them apart, then plant the tree together).

**Scenes that need a group variant** (text only; mark pages with `when: { "party:size": ">=2" }` / `"<=1"`):

- Every "alone" page of the `act1:path` thread (14 reads) and `act5_lantern/alone` ("No One Is Coming"): with a party, "alone" should read "without the wardens": "Nobody from town comes. It is only the {n} of you."
- Carry and rescue outros written for one pair of hands (`song` "You carry him home", `hollis_night`, `tide_boat` "Tobin hauls you in"): a plural variant, about 20 pages.
- The Council (`act4_seals/council`): each member is asked by a different townsfolk which seal they would take first, then the vote.
- The Long Night: give the party posts in the intro (the stairs, the rocks, the barricade) and let Reyes's count-off use the party's best ally count, not the reporter's.
- The Herald: Ida's line about the blade and Elsie's line about Hollis should read the state of whoever accepted, and say whose.
- The Choice: per-player (above), with a short shared scene first.
- Riddles: when one member answers, the others see the question and the answer as a scene ("Mara's friend {name} says: the stars") instead of a silent tick.

**Catch-up.** A `skippable` flag on quests that are pure travel or fetch (rows 4, 6, 16, 22 in 5.3) lets a party carry a newer member past them ("{name} did this for the party") while story beats and choices are never skipped. Add a per-Chapter "story so far" for a member who joins late: the same recaps, read in order.

**Scaling fetches.** Counts for `deliver`/`collect` in shared stories should scale down for one player rather than up for four: author the number for a party of three, and let a solo player need two thirds (a field `soloCount`, or a global factor).

## 5.7 NPC connective tissue

What exists: Townsfolk greetings can already read about 25 story flags and `fin:<story>` through `realm:npc_flags`; `realm:gossip` announces a finished act once. Proposal: add two derived flags to that message, `g:part` (the spine part the player is on, for example `4C`) and `g:next` (the NPC id of the next main quest), plus `g:nights` (the Lantern countdown, 5.1). Then:

**1. Hand-over lines** (the outro's new last page; field `next`). Act I drafts:

| After | Line |
|---|---|
| `fallen` (Sol, next Wren) | Sol: That rhythm. The children skip rope to it. Ask Wren at the stables: she knows every skipping song. |
| `rhyme` (Tobin, next Hollis) | Tobin: If it's old songs you're after, the chapel keeper's been asking for help. Young Hollis. He isn't sleeping. |
| `keeper` (Hollis, next Moss) | Hollis: Moss the gravedigger saw me walking at night. Ask him what else he has seen. Please. |
| `graves` (Moss, next Mara) | Moss: A cracked circle. Fenn drew circles on everything. Mara has his book: go and ask her. |
| `echo` (Mara, next Bea) | Mara: The Long Storm again. Elsie was here for it. Go by the inn, and ask Bea first: Elsie tells her cook more than her guests. |
| `inn` (Elsie, next Wren) | Elsie: Wren has been up all night with a sick foal. Take her this bread, would you? |
| `choice` (Hollis, next Sol) | Hollis: Sol has been shouting numbers out of his window all day. I think he has counted something. Go and see. |
| `drowned_bell/warden` (Tobin, next Mara) | Tobin: Mara's been asking for someone who can walk far and come back. Old map of her teacher's. Go see her. |
| `last_map/last` (Mara, next Sol) | Mara: Sol wants to see you. He says the stars are wrong, which is Sol for "come at once". |

**2. Anyone in town points at the next quest** (a generic idle line every townsfolk gets, shown at most once per visit, when `g:next` is not them):

- "{giver} was asking after you." / "You should see {giver}. Something about {short}."
- With the countdown: Sol (any time after Chapter 3): "{nights} nights. I count them twice." Bea: "Sol says {nights} nights. I say eat something." Wren: "Is it true the star comes in {nights} sleeps?"

**3. Progress comments** (greetings keyed to flags that already cross the bridge):

| NPC | Reads | Line |
|---|---|---|
| Tobin | `fin:drowned_bell`, `drowned_bell.bell` = ring | Hear that? Tide's moving the clapper. Never thought I'd like the sound. |
| Reyes | `act1_signs.act1:path` = alone, Chapter 4 open | You went after them alone once. Next time you tell me. That's an order. Mostly. |
| Reyes | `g:part` = 4B, `g:quill` = exposed | Quill's singing in my cells again. The cove, then. I want those books. |
| Quill | `g:quill` = trusted, `g:part` = 4B | Barrel at the back of the cove, partner. Leather chest, walk slow. |
| Moss | `g:part` = 4C | Still owe that witch her price? She doesn't forget. Neither do the frogs. |
| Hollis | `g:hollis` = saved, Chapter 5 open | I slept. All night. Ida was looking for you, something about a crystal that hums. |
| Ida | `g:part` = 5A | Shards. Four. Or go and ask the diggers at the old mine nicely. Quietly. |
| Elsie | Chapter 6 open, `inn_ghost` not finished | Before the seals, love. Room three. I should have asked you long ago. |
| Elsie | `act4_seals.first` set | {n} lit. I can feel them, like lamps in far windows. |
| Bram | `act2_choir.mayor` = bury, Chapter 6 open | They keep asking me what the comet means. I keep saying weather. Nobody believes me. |
| Wren | `g:part` = 7A | The horses are scared of the star. I told them you would fix it. You will, right? |
| Mara | Chapter 6, a seal lit | I am drawing the doors as you open them. Fenn only had the line. |
| Bea | any Chapter open, 3+ real days away | Look who is back. Sit. Eat. {giver} has been wearing a hole in my floor waiting for you. |

**4. Returning-player greeting.** The first townsfolk spoken to after 3 real days opens with one page: "{name}! It has been a while." then the part's recap and the hand-over line. One generic template per NPC voice (12 short lines).

**5. Wanderers and the road** (lines in their chains or idle talk, gated on flags they may already read):

- Pell (after `act1_signs/keeper`): "They say the candles in your chapel go out at midnight. Does the keeper sleep?"
- Anwen (any time; points at Chapter 6): "Three places on a line. I measured them. Sea, stone, sky. Has anyone been?"
- Brannoch (Chapter 5 open): "The old mine? Sealed the winter after the storm. My uncle laid the bricks. He never whistled again."
- Hob (carries word; `g:next` set): "Met a {role} on the road who said {giver} wants you. I charge nothing for messages. Tips are welcome."
- Rook (after Chapter 4): "Heard somebody burned the Gray Ring. Heard it was you. I'd have done it faster."
- Vesk (Chapter 7 open): "The sky has a wound in it. Where I was sent, that would mean run."
- The caravan and guild masters, if those packs take lines: Wardens master reads `act1:path`; Miners master, Chapter 5: "Nobody of mine goes below forty. Ida says you do."; Wayfarers master, Chapter 6: "Rope and ladders are at the square for whoever climbs to the ring."; a trader after Chapter 4: "Roads are quiet past the Gray Ring since it burned."

**6. Word passed between NPCs** (cheap and effective): when a quest's ender differs from the next giver, the next giver's intro gets a first page that shows they were told: "Tobin sent word you would come." About 35 one-line pages, the mirror of the hand-over lines.

**7. The calendar.** The Long Night festival and Lantern Night share a name today; either rename (5.3 row 29) or tie them: during the Long Night festival townsfolk say "Forty winters ago tonight" before Chapter 7 and "A year since Lantern Night" after.

## 5.8 New data fields

| Where | Field | Type | Purpose |
|---|---|---|---|
| Story | `chapter` | number (1-7) | The spine's order; replaces reading `act` for display. |
| Story | `opensAfter` | "story/chapter" | Gate a town story on a main quest, not only on finished stories. |
| Story | `weight` | number | Order of offers; the two lightest open town stories are "Offered now". |
| Story | `matters` | string | Tag shown in the log ("Matters on Lantern Night"). |
| Story | `minutes`, `needs` | number, string[] | Shown before starting: "about 90 minutes; needs the Nether". |
| Story | `recap` | Page[] | One recap for a town story. |
| Chapter (quest) | `part` | string ("4C") and a `PARTS` table `{ id, title, recap: Page[] }` | Grouping for recaps and the countdown. |
| Chapter | `goal` | string <= 80 | The why. |
| Chapter | `next` | Page | Hand-over line, shown last in the outro and in the log. |
| Chapter | `skippable` | boolean | A party may carry a member past it. |
| Chapter | `needs` | string[] | Walls announced at the hand-over. |
| Objective | `tip` | string <= 100 | Free what-now line. |
| Objective | `party` | "shared" \| "together" \| "each" \| "any" | 5.6. |
| Objective | `soloCount` | number | Fetch count for a lone player. |
| Choice | `decide` | "each" \| "vote" \| "leader" | 5.6. |
| Choice | `flavor` | boolean | Sets nothing; shown under "Talk a while", never instead of Accept. |
| Scene | `lines` | string[] (each <= 120) | Caption lines; replaces one long `text`. |
| Page | `{ text, when }` with the new live flags `party:size`, `g:part`, `g:nights`, `away:days` | | Group variants and returning-player text. |
| Favor | `board` | boolean or weight | Eligible for the town board of three. |

## 5.9 What `check-stories` should newly enforce

Errors unless noted; each with an exact-entry allow list like today's.

1. Every `main` story has `chapter`; chapters are 1..N without gaps; exactly one `main` story has no `requires.stories` (one entry point).
2. Every chapter of a `main` story has `part`, `goal` (<= 80 characters) and, when the next chapter's `npc` differs from this one's `end`, a `next` page that contains that NPC's name.
3. Every part has a `recap` of 2 to 3 sentences, <= 240 characters, with no speaker prefix; every town story has a `recap`.
4. Every flag in a `RECAP_FLAGS` list (the state lines in 5.4) has a line for every value a choice can set (the path walker already enumerates values).
5. `tip` required (<= 100 characters, starts with a verb, no `§`) on the step types listed in 5.5; warning when a label is over 48 characters (36 are over 60 today).
6. Caption length: every vision scene line <= 120 characters and <= 4 lines per scene (72 scenes fail today); warning for any sentence over 120 characters in a page (137 today) and for a page with more than 5 sentences (use the existing page walker).
7. Sequence length: at most 5 intro and 4 outro pages for any one path through the variants (count per path, not as authored); *Forty Winters* and the Dawns need an allow entry or a split.
8. Every choice has `decide`; a choice that sets a `g:` flag read by a chapter `when` must be `vote` or `each`, never `leader`; a `flavor` choice has no `set`, `inc` or `rep`.
9. Every `vision` and every `meet` with choices is `party: "together"`; every `sleep` and `wait` is `party: "any"` or has an either/or without the world clock.
10. Names: no two chapters with the same title (5 today); no two champions with the same name (Old Gnasher); a new "confusable names" warning when two cast names share their first three letters (Bram/Brann/Brannoch, Mara/Marta/Marty/Marcel) unless allow-listed.
11. No main-line step may require a `needs` wall without an either/or (a list of wall items: prismarine, echo shards, ghast tear, netherite, the End), warning.
12. Open-offer budget: simulate each point of the spine and fail when more than 2 town stories are "Offered now" or more than 1 `main` quest is next (this is the "too much choice" test, in CI).
13. Text that names an item the player is not given ("the lamp", "the shard"): warning from a small word list checked against rewards so far.
14. Flags set and never read: already a warning for reads never set; add the reverse (7 today).

## 5.10 Tiers and sizes

Sizes are content lines touched in `packs/saga_bp/scripts/stories/` (about 12,000 lines today), not engine or tool code.

**Must: fixes confusion with little rewriting (about 650 content lines, no quest removed)**

| # | Work | Lines |
|---|---|---|
| M1 | One entry and a spine: `last_map` requires `drowned_bell`; `chapter`, `part` on 68 quests; the `PARTS` table | 120 |
| M2 | Recaps: 24 parts, about 30 state lines, 15 town stories (drafted in 5.4); `g:hollis` = `shaken` (5.3 row 9) | 135 |
| M3 | `goal` on 68 main quests; `tip` on the 58 flagged steps (drafted in 5.5) and on the other clock, trail and scene steps (about 60 more) | 190 |
| M4 | Hand-over `next` lines on about 35 main outros (9 drafted) | 40 |
| M5 | Town-story gating: `opensAfter`, `weight`, `matters`, `minutes`, `needs` on 15 stories; favor `board` | 50 |
| M6 | Walls get a second way: rows 1, 3, 5, 11 of 5.3 (prismarine, the storm, the spyglass, echo shards) | 60 |
| M7 | Renames (rows 28, 29) and the Act IV flavor buttons (row 20) | 40 |
| M8 | `check-stories` rules 1 to 5, 10, 12 (tool code, about 200 lines) and the log changes they assume (engine: one "next" across stories, "Offered now" / "Later in town", the recap page, the board of three) | 20 |

**Should: shorter, group-ready, connected (about 1,500 content lines; main quests 68 to about 58)**

| # | Work | Lines |
|---|---|---|
| S1 | Merges and trims in the main line: rows 2, 4, 6 to 10, 13 to 19, 21 to 24 | 650 |
| S2 | Group play: `party` on steps, `decide` on 139 choices, plural and "not alone" page variants (about 40 pages), clock-free alternatives for 63 steps | 300 |
| S3 | NPC connective tissue: 13 progress greetings, 12 returning greetings, generic pointer and countdown lines, 8 wanderer lines, 35 "sent word" pages (some live in the Townsfolk pack's config) | 150 |
| S4 | Captions: split the 72 long vision scenes into `lines`; break the worst 137 sentences | 220 |
| S5 | *Hearth and Table* to about 18 steps; *Edges of the Map* epilogue; favors review (rows 25, 26, 31) | 150 |
| S6 | Dangling threads (rows 24, 32) | 30 |

**Could: bigger rewrites**

| # | Work | Lines |
|---|---|---|
| C1 | One 45-minute opening Chapter that braids the Bell and the Map (Tobin and Mara in one story, the chapel as the meeting point) and hands straight to Sol | 700 new, 500 retired |
| C2 | Rebuild Chapter 5 around Mara "finding the doors": the Stone Seal is found once, the lamp is a real tool, the Herald scene is the midpoint | 600 |
| C3 | Companion arcs: each townsfolk's town story, heart story and favors become one arc in three tiers on a "Friends" page (12 arcs), replacing the side/heart/favor split | 3,000 touched |
| C4 | Re-voice the main story for a party (roles in the Council, the Long Night and the Choice; per-player dawns as designed scenes) | 800 |
| C5 | Dialogue as on-screen captions throughout: 82% of pages are over 120 characters today | 8,000 |
| C6 | A gentler Choir: unmask-and-flee fights (needs an engine behavior) and a path where named neighbors are won back; the Hollow Crown's mark made temporary (row 30) | 250 |
| C7 | *The Listening Deep* as repeatable deep jobs (row 27) | 150 |

Order of work that gives the owner's two complaints the fastest relief: M1 + M5 + the log changes (one next quest, two offers, three favors) first; M2 + M4 + S3 (recap and pointers) second; M3 + M6 (never stuck) third; then S2 for group nights.


---

# 6. Appendices (generated)

## 6.1 Offers per NPC, duplicate titles and ids, text metrics

Side questlines by what unlocks them: **act1_signs**: A Room at the Inn, The Star Kittens, The Forge That Sings; **(nothing)**: Graveyard Shift, Wren's Lost Lambs, The One That Got Away, Hearth and Table, The Wardens' Oath; **act2_choir**: The Witch's Bargain, Lamp in the Window, Smuggler's Run, The Mayor's Burden; **drowned_bell**: Little Turtles; **last_map**: Edges of the Map; **act3_deep**: The Listening Deep.

Story offers per NPC, fresh player (plus 1 daily favor each, plus festival quests): tobin 2 (MAIN+side), mara 1 (MAIN), moss 2 (side+heart), wren 2 (side+heart), bea 2 (side+heart), reyes 2 (side+heart), hollis 1 (side).

Story offers per NPC, after act ii (plus 1 daily favor each, plus festival quests): ida 3 (MAIN+side+heart), elsie 1 (side), moss 3 (side+side+heart), hollis 3 (side+heart+side), wren 3 (side+side+heart), tobin 3 (side+side+heart), bea 2 (side+heart), reyes 2 (side+heart), quill 2 (side+heart), bram 2 (side+heart), mara 2 (side+heart), sol 1 (heart).

Chapter titles used more than once: "The Listening Stone" (act3_deep/listening, heart_ida/listening); "Dawn" (act5_lantern/dawn_relight, act5_lantern/dawn_gift, act5_lantern/dawn_crown); "Old Gnasher" (one_that_got_away/gnasher, w_brannoch_deep/gnasher); "The Hollow Under the Ice" (listening_deep/cold_store, listening_deep/cold_store_letters); "Partners" (heart_quill/partners, w_rook_rival/partners).

Chapter ids reused across stories (legal, but they collide in talk and in logs): `salt` x2, `vigil` x3, `iron` x2, `chapel` x3, `song` x2, `choice` x2, `count` x2, `fen` x2, `lamp` x2, `listening` x2, `herald` x2, `gate` x3, `long_night` x3, `gnasher` x2, `quench` x2, `ash` x2, `name` x2, `partners` x2, `tea` x2, `names` x2, `supper` x2, `line` x2, `out` x2, `tale` x2.

Sentences over 120 characters: 137 (main 70, side 55, heart 2, wander 5, festival 5); by where: outro 53, intro 64, reply 10, clue 4, meet 6.
Pages with more than 4 sentences: 997 of 2251 (main 394, side 427, heart 99, wander 36, festival 41).
Pages with 8 or more sentences: 119. Pages over 350 characters: 0.
Vision scenes over 120 characters: 72 of 103 (longest 240).
Objective labels over 60 characters: 36.
Intro pages per chapter (as authored, variants included): over 5 in 36 chapters (act3_deep/echoes 8, act4_seals/gate 8, act5_lantern/long_night 11, act5_lantern/herald 10, act5_lantern/choice 8, act5_lantern/dawn_relight 8, act5_lantern/dawn_gift 8, act5_lantern/dawn_crown 9, act5_lantern/forty 17, hearth_and_table/hearts 8, hearth_and_table/cook_off 8, edges_of_map/night_sounds 9). Outro pages over 4 in 53 chapters (act4_seals/council 8, act5_lantern/long_night 8, act5_lantern/dawn_relight 8, act5_lantern/dawn_gift 8, act5_lantern/dawn_crown 8, act5_lantern/forty 10, hearth_and_table/cook_off 9, the_calling/chapel_book 8, the_calling/graveyard_book 8).

## 6.2 Every sentence over 120 characters (137)

- act1_signs/rhyme (intro, 231): Wren: If you bring me string I can make a real rope, a good long one, and then I'll do the whole song, even the last verse, which you're not supposed to do, because Elsie says it's bad luck, but you're a grown-up so you can decide.
- act4_seals/council (outro, 224): By full dark the common room is crowded: Reyes in her armor, Tobin with his cap twisted in his fists, Ida with soot to the elbows, Sol at the window watching the sky, and Mara unrolling Fenn's old map right across the bread.
- act1_signs/song (intro, 213): Wren: You have to come, you have to come right now, okay, so I was up with Biscuit because Biscuit's the new foal and she had a tummy ache, and I looked out of the stable door and Brother Hollis walked RIGHT PAST.
- act4_seals/stone_door (outro, 200): Through the gap the shrine room looks worse than you remember: the frame around the seal stone has crumbled to gravel, and sculk has crept up the walls in long blue veins, pulsing slowly, like breath.
- act5_lantern/dawn_gift (intro, 195): Wren: She left me a letter, and the inn, and the KEYS, all of them, even the cellar one I'm not allowed to have, and she didn't even say goodbye, and I'm so angry, and I miss her so much already.
- fest_hatchlings/names (intro, 191): Wren: The hatchlings are OUT, they came up out of the sand this morning, and I've named them all, that one's Pebble and that one's Admiral Wiggles and that one's also Pebble because I forgot.
- act1_signs/song (intro, 188): Like a little pale moth, but big, floating ahead of him, and wherever it goes he goes, and it went out past the chapel toward the wild country and I'm not allowed past the chapel at night.
- star_kittens/cassie (intro, 187): Wren: She sits up there every night and watches the sea, and if anyone climbs up she hisses and climbs higher, and there IS no higher, so she just sits on the edge of the roof and hisses.
- edges_of_map/deep (outro, 182): You tell her about the bottom: blue-black and cold, kelp like a forest, the ribs of something enormous half buried in sand, and once, far off, the green glow of a monument's windows.
- star_kittens/draco_ursa (outro, 181): Two more cats join your parade: a black one with yellow eyes who glares at everyone, and a big honey-colored one who flops onto the first bed she sees and does not move for an hour.
- hearth_and_table/starwright (outro, 178): It's dark gold, flecked with something that glimmers faintly, and the smell fills the inn: honey and woodsmoke and something cold and clean, like the air on a high hill at night.
- act3_deep/keys (outro, 173): From the top of the ruin you see it without a spyglass for the first time: the Lantern, low in the east, no longer a smudge but a white streak with a tail like spilled milk.
- hearth_and_table/starwright (intro, 172): Once a year, on the longest night, she bakes it in the inn's old oven with the shutters down, and the whole street smells of honey and woodsmoke and something I can't name.
- hatchlings/fence (outro, 171): The smallest one tries to climb over the others, falls on his back, and waves his flippers at the sky until Tobin, very gently, turns him the right way up with one finger.
- lost_lambs/clover (intro, 169): Wren: I counted them this morning and there were eleven, and then I counted again and there were ten, and I counted four more times to be sure and it was ten every time.
- act1_signs/rhyme (intro, 165): Wren: Sol says you want to know about the skipping song, and I know ALL the skipping songs, but I can't show you because my rope keeps breaking, see, it broke again.
- act2_choir/hollis_night (reply, 162): Hollis is sitting in the front pew with a candle in both hands, singing the lullaby under his breath, over and over, like a man holding a door shut with his back.
- inn_ghost/flower (outro, 162): The trader who left without his boots comes back for them, falls asleep there by mistake, and says in the morning it was the best night's sleep he's had in years.
- act2_choir/confession #2 (clue, 161): Scratched low into the crypt wall, as if by someone kneeling, very old: a cracked circle, and under it, in a grown man's shaking hand: I CAN HEAR HER DOWN THERE.
- one_that_got_away/gnasher (outro, 160): You come up out of the water with three green spikes in your fist, and every fisher in town is on the pier, and Bea, and Elsie, and Wren on someone's shoulders.
- act3_deep/mine #3 (clue, 159): A child's drawing pinned under a lamp hook, gone brown with age: three stick men holding hands in a hole, smiling, with music notes coming out of their mouths.
- hearth_and_table/cook_off #1 (meet, 159): Up close, his apron has a stain shaped like a fish finger, and the tag on his knife roll says: PROPERTY OF MARTY, THIRD STALL FROM THE LEFT, SWEETWATER MARKET.
- act5_lantern/dawn_gift (intro, 158): The sun comes up over a town that should not be standing, and for a moment you think the sky has a new star in it, low in the east, burning in broad daylight.
- fest_clover/carrot (intro, 158): Wren: It's the gift week and EVERYONE gets something, so Clover should get something, she's been SO good, she only bit Bram once this year and he deserved it.
- act5_lantern/choice (reply, 157): It runs down through the crown, down through the clouds, down into the sea and the stone, and far below something enormous sighs, turns over, and goes still.
- act4_seals/sky_vision (outro, 156): A thin white line of light shoots up from the crown of the ring, straight toward the Lantern, and for one heartbeat the comet seems to lean down to meet it.
- vesna_bargain/reeds (outro, 156): Or sink it back with Vesna's name on it: the Mother sleeps forever, the Fen heals, and Vesna is bound to the water for good, answering to whoever binds her.
- last_map/far (intro, 154): Mara: The three pins are far out: about {far:900,-700} blocks northeast, {far:-1100,-200} blocks west, and {far:150,1200} blocks south of the world spawn.
- act4_seals/tide_vault (outro, 150): For one breath you can hear the whole sea from inside your own chest: the tide, the whales, and somewhere very far down, a slow and patient listening.
- act5_lantern/choice (intro, 148): Set them in the crown, and when the Lantern stands straight overhead its light will run through them, down into the deep, and the Hollow will sleep.
- act4_seals/gate (intro, 147): A meteor tears across the Lantern's tail and comes down far beyond the edge of town, with a sound like the biggest door in the world slamming shut.
- act5_lantern/rally (outro, 147): Through the inn's kitchen window you can see Marty, mustache long gone, peeling potatoes at a speed that suggests Bea is standing right behind him.
- w_hob_tales/pots (outro, 147): He mends three of them while telling you a story about a duck, a duke and a misunderstanding, and you don't follow any of it, and you laugh anyway.
- drowned_bell/iron (outro, 146): By morning two things lie on her bench: a heavy iron clapper wrapped in sea-glass, and a dull gray band of iron, sized to fit around a bell's lip.
- act1_signs/song (intro, 146): And his eyes were open but he wasn't looking at anything, and I said hi Brother Hollis, really loud, and he didn't even blink, and he was humming.
- act3_deep/flame (intro, 146): Ida: Moss says Hollis wrote one line on the inn wall last night, then scrubbed it off before anyone woke: THE DOOR IS CHAINED FROM THE WRONG SIDE.
- hearth_and_table/hearts (intro, 146): Bea: "Quill the Trader is pleased to announce the arrival of Chef Marcel Duvanne, of the Grand Kitchens of the Far Coast, for a friendly cook-off.
- act1_signs/smudge (intro, 145): Sol is lying on his back in the grass with a cracked spyglass on his chest, as if the sky might hand him something if he holds still long enough.
- act4_seals/sky_bridge (intro, 145): Phantoms, drawn up by the Lantern's light, and with them something worse: vexes, little gray spites the Choir sends where it cannot climb itself.
- act5_lantern/rally (outro, 145): That one bit me last week but I think it was a love bite, and that one is scared of comets, which is fair, I am too, a little, but only a little.
- inn_ghost/flower (intro, 145): Elsie is waiting at the door before first light, in her good coat, with a basket on her arm and six treasures inside it wrapped in a clean cloth.
- act4_seals/sky_bridge (outro, 144): The Lantern Thief's stolen light pours out of it as it falls, scattering like sparks, and every one of those sparks drifts back toward the ring.
- hollis_faith/forgive (intro, 144): He has a heavy book under his arm: the chapel's Book of the Lost, where the names of the dead are written so that someone always remembers them.
- lost_lambs/cows (intro, 144): Wren: Elsie says I'm not allowed to feed them out of the inn's flour bin anymore, which is SO unfair because they love it, but fine, fine, fine.
- hearth_and_table/marta (outro, 144): Her eyes are red and her voice is loud again, and when someone asks for seconds she says "Of COURSE you can have seconds, what am I, a monster?"
- act5_lantern/long_night (intro, 143): Behind the barricade, forty-one people hold their breath, and Reyes walks the line telling each of them their name, as if they might forget it.
- w_tamsin_storm/watch (outro, 143): Rain, wind, and then a crack so loud you feel it in your boots: the rod glows blue-white for an instant and the air smells like a struck match.
- act5_lantern/long_night (intro, 142): On the rocks below the tower, Vesna stands in the surf with her cauldron on a driftwood fire, bound and called, her eyes the color of the Fen.
- heart_bea/supper (outro, 142): Bea stands at the head of the table with her ladle like a captain on a deck, and for an hour the inn is a ship that made it through the storm.
- inn_ghost/small_hand #2 (meet, 141): A small blue light drifts over the stone and settles into the shape of a girl in a nightgown, with a red ribbon in her hair that isn't there.
- edges_of_map/kit (outro, 141): Mara: And if you get lost, you won't, but if you do: stop, climb something tall, and look for the tracker's arrow before you look for a road.
- w_marigold_garden/garden (outro, 140): The sun comes up over the edge of the world and lights each flower one by one, poppy and cornflower and daisy, bright against the gray rock.
- last_map/chapel (outro, 139): Inside is one last sheet, blank but for a compass rose and a single line in Fenn's cramped hand: THE MAP IS FINISHED WHEN SOMEONE WALKS IT.
- hearth_and_table/cook_off (intro, 139): Two cooking fires, two long tables, and Mayor Bram between them on a hay bale, wearing a napkin like a cape and an expression of total joy.
- mayors_burden/ballots (outro, 139): The goat eats the wheat, considers you, and coughs up the ballot box key, a damp wad of ballots, and a button from Bram's second-best coat.
- hatchlings/where_they_go (intro, 138): Grown turtles, a whole herd, grazing on the weed beds, like they'd been waiting offshore all this time for someone to make the beach safe.
- vesna_bargain/bind_heart (intro, 137): Moss: Then she sinks the heart in the deepest part of the Fen with her name scratched on it, and you stay with her until midnight's past.
- hearth_and_table/hearts (intro, 137): A Champion's Heart: those big ugly champion beasts that roam about drop one when they fall, and it makes a stew that could wake the dead.
- act2_choir/hollis_night (reply, 136): Behind you as you run, Hollis's voice follows, sweet and wrong, carrying farther than any voice should: Hollis: You can't outrun a song.
- act3_deep/flame (outro, 136): It leads you past them, down an older shaft with steps cut for longer legs than yours, into a room of black deepslate veined with sculk.
- act4_seals/council (intro, 136): Elsie has pushed every table in the common room together into one long board and set out more bread than six people could eat in a week.
- act4_seals/tide_boat (outro, 136): When the elder guardian finally goes still, the sea-lantern ring around the shrine brightens, one lantern at a time, all the way around.
- act1_signs/inn (reply, 135): Elsie watches you eat it with something like relief, and something like grief, and pats your hand once before she goes back to the bar.
- star_kittens/collars (intro, 135): And bring some fish, because there's a note in the box that says "always bring fish," and I don't know why, but I think it's important.
- star_kittens/collars (outro, 135): She named them for the constellations, because she said a constellation is only a few friends who agreed to stand together in the dark.
- act3_deep/herald (reply, 134): The voice shrieks and is gone, and Hollis goes with it: up off the floor and out the door into the dusk, running for the sea, singing.
- hollis_faith/wedding (intro, 134): Hollis: Quill sent a note from his cell: congratulations to the happy couple, and the wine he promised them is "regrettably detained".
- act1_signs/echo (intro, 133): Mara has Fenn's book open on her table and a butter knife in her hand, and she looks like she might cry or laugh, and hasn't decided.
- act5_lantern/rally (outro, 133): Down the hill, Reyes's wardens are fletching arrows on the chapel steps, and Bea's kitchen chimney hasn't stopped smoking since noon.
- lost_lambs/shed (outro, 133): Wren: You found Clover and fed the cows and named the cat and got a wolf and brushed an armadillo and caught Turnip and built a SHED.
- edges_of_map/mouth (intro, 132): Mara: Fenn's notes say that on a still night you could hear the harbor bell from the west station, before the Long Storm drowned it.
- act4_seals/gate (reply, 131): Two wardens on the inn door, one on the roof, and Bea with a cleaver in the kitchen, which frankly scares me more than the wardens.
- act1_signs/song (outro, 130): When the hoods drift away into the dark, Hollis is left alone, curled asleep against the cracked bell like a child against a door.
- act3_deep/echoes (outro, 130): At the Choir's dig you find nothing but a hole, a broken pick and a hymn page with one line circled: THE STONE REMEMBERS THE NOTE.
- act3_deep/echoes (outro, 130): At the Choir's dig you find nothing but a hole, a broken pick and a hymn page with one line circled: THE STONE REMEMBERS THE NOTE.
- hollis_faith/forgive (outro, 130): Back in the chapel the candles are lit, the windows are whole, and the lamp burns in the east window although it's broad daylight.
- singing_forge/quench (intro, 130): The last time it sang at my forge, every dog in town howled, and that night someone knocked on my door and there was nobody there.
- listening_deep/cold_store (intro, 130): Elsie sets a bowl of soup in front of you before you can open your mouth, which is how you know she already knows why you've come.
- act1_signs/keeper (outro, 129): But in the dream it rings another way, a broken way, and the drowned man says the true note is only the broken one, healed badly.
- act4_seals/tide_echo (outro, 129): Light races around the sea-lantern ring and down into the frame, and the whole shrine sings one long note you feel in your teeth.
- act4_seals/sky_stair (outro, 129): From up here the world is a dark map, and the Lantern is enormous: a pale smear across half the sky with a tail like a torn veil.
- act4_seals/sky_stair (reply, 129): Sol: Fenn and I argued for nineteen years about a patch of sky where the stars bent, just slightly, as if seen through old glass.
- act5_lantern/smugglers (intro, 129): The powder is sealed in barrels at the cove, and my lads won't believe it's real until someone cracks them open in front of them.
- lost_lambs/clover (intro, 129): But I can't leave the others, because Pudding will eat the fence if nobody watches him, and Pudding is a goat, so he really will.
- hatchlings/long_night (intro, 129): Tobin has dragged a crate down to the sand and sits on it with a lantern and a flask of cocoa, like a man settling in for a show.
- w_hob_tales/pots (intro, 129): Hob: Bad news, good friend: I'm out of iron for rivets and clay for patches, and every pot from here to the sea has a hole in it.
- act1_signs/inn (outro, 128): Elsie presses the lid of the new chest down with both hands and smiles at you, the way she smiles at everyone, warm as a hearth.
- graveyard_shift/gerald (intro, 128): Every night he climbs out and rattles about, and I knock him down, and every night he puts himself back together and goes again.
- fest_tide_supper/supper (intro, 128): Elsie: Every Hatchling Tide the whole town ends up on the beach at midnight, love, and every year nobody thinks to bring supper.
- act4_seals/sky_vision (reply, 127): And there, low, the Lantern, which has no name in any book in town, because the only person who remembers its name runs an inn.
- act4_seals/gate (outro, 127): The Herald: When the Lantern passes I will ring the broken note, and the Hollow will wake, and nothing will ever be lost again.
- act4_seals/gate #2 (clue, 127): A Choir camp, left in a hurry: bedrolls, a cold fire, and a child's drawing of the inn with a gray figure standing on its roof.
- lost_lambs/turnip (intro, 127): He learned to open the garden gate with his nose, and now he's out there somewhere with a belly full of carrots and no regrets.
- w_anwen_survey/height (outro, 127): Anwen: We measured its road across the sky, every forty years, and marked three places on the ground where its light must fall.
- act2_choir/ring_burns (intro, 126): On your way out of town, Pip Haddock runs alongside you as far as the last fence, waving his mother's soup ladle like a sword.
- act5_lantern/fen #3 (meet, 126): So I will sing for you tomorrow night: the old Starwright song, the one that makes the drowned remember they were people once.
- one_that_got_away/night_waters (outro, 126): You feel it: the float dips, the water bulges, and a cold current swirls around your bobber, as if the sea took a deep breath.
- act1_signs/rhyme (intro, 125): Then you should ask Old Tobin, because he knows every song from the olden days, except he gets grumpy when you sing this one.
- act4_seals/stone_light (outro, 125): The sculk on the walls curls back from it, hissing softly, and the seal stone hums one deep note you feel in your back teeth.
- act5_lantern/choice (outro, 125): Elsie: Relight the Lantern, and the Hollow sleeps for forty winters, and we live our lives, and someone else does this again.
- act5_lantern/dawn_relight #1 (meet, 125): Tell him his brother was the bravest man in the harbor, and the last thing I heard before the water was Hal, calling me home.
- graveyard_shift/dead_drunk (intro, 125): The "body" lies face up in a freshly dug grave on the south side, arms crossed on its chest, in a sailor's coat and one boot.
- lost_lambs/shed (intro, 125): Made of hay, so they can sleep on it and eat it at the same time, which Elsie says is "a design flaw" but I say is efficient.
- star_kittens/twins (intro, 125): He would sit on the chart table while I worked and put one paw on whatever star I was measuring, as if to say: that one, Sol.
- wardens_oath/oath (intro, 125): The company stands in a line on the road below: Dace, Brynn, a dozen wardens you half know, and one empty space nobody fills.
- edges_of_map/lost_village (outro, 125): She looks at the empty space for a long moment, then draws the smallest dot you've ever seen, so faint it's almost not there.
- act4_seals/promise (reply, 124): She taught me every star by its old name, and then made me learn the new ones too, so I would never be lonely in a new town.
- act1_signs/inn (intro, 123): And Elsie, who laughs at everything, who'd laugh at her own funeral if the food was good, puts down the tray and walks out.
- act1_signs/inn (intro, 123): Bea: Twenty years I've cooked in this kitchen, and there's one thing she's never let me touch: the old trunk in the cellar.
- act3_deep/mine (outro, 123): On the other side of it, three men are humming, and one of them stops to say, very kindly, that there is room for one more.
- act4_seals/council (outro, 123): Tobin knows the water over the Tide Seal, Ida has stood at the Stone Seal, and only Sol can find the Sky Seal by the stars.
- act4_seals/tide_echo #1 (meet, 123): The light unfolds into a young man made of pale blue glow, with Tobin's nose and a fisherman's cap pushed back on his head.
- edges_of_map/end (intro, 123): I've read every book about it, and every book stops at the portal, because the people who wrote them stopped at the portal.
- fest_hatchlings/names (intro, 123): Wren: But the zombies come down to the beach at night and they STEP on them, on purpose I think, and the drowned are worse.
- act3_deep/echoes (intro, 122): Quill bought himself a softer cot from Reyes with one secret: the Choir has diggers at the Abandoned Mine, hunting echoes.
- act3_deep/keys #2 (meet, 122): A pale shape gathers in the lamp light, small and blue and flickering, and it clears its throat exactly the way Mara does.
- act4_seals/stone_light (intro, 122): Elsie read me the first line years ago, when I was an apprentice and didn't think to ask why an innkeeper could read them.
- act5_lantern/fen_bound (intro, 122): Moss is standing at the graveyard gate with a soul lantern in each hand, which is not how he usually holds a conversation.
- inn_ghost/lullaby (intro, 122): Elsie: Every night she made me sing it, and every night she sang the last word herself, very loud, so the whole inn heard.
- hatchlings/fence (outro, 122): Then four little turtles, no bigger than your palm, blink at the sun as if it were the most surprising thing in the world.
- mayors_burden/unveiling (outro, 122): In the silence, Councilor the goat walks out of the crowd, looks up at the statue, and bleats once, with enormous respect.
- edges_of_map/night_sounds (intro, 122): And if the sky does anything strange while you're out, chase it: a rainbow's end, a twister, a storm with its own weather.
- edges_of_map/night_sounds (intro, 122): And if the sky does anything strange while you're out, chase it: a rainbow's end, a twister, a storm with its own weather.
- edges_of_map/night_sounds (intro, 122): And if the sky does anything strange while you're out, chase it: a rainbow's end, a twister, a storm with its own weather.
- fest_clover/carrot (intro, 122): Wren: Horses love golden carrots more than anything, Elsie told me, and I've never had one, I mean Clover's never had one.
- the_calling/chapel_book (outro, 122): Hollis turns the brittle pages until he finds the right one, dips his pen and writes your name in a careful, shaking hand.
- last_map/last (intro, 121): Take the blank map I gave you, open it (use it) somewhere you love and walk around until it's drawn, then bring it to me.
- act5_lantern/rally (intro, 121): The council table is buried in lists, and the comet's tail hangs in the window behind him like a torn sail made of light.
- act5_lantern/choice (reply, 121): The light takes her the way a hearth takes a log, slowly, warmly, and with a sound like someone humming in the next room.
- act5_lantern/forty (outro, 121): LANTERN NIGHT With Mara, Old Tobin, Warden Reyes, Elsie, Mayor Bram, Quill, Ida, Sol, Brother Hollis, Moss, Wren and Bea.
- graveyard_shift/name_stone #1 (clue, 121): At the foot of the stone, two little shovels are carved side by side, the way two children carve their marks into a tree.
- hollis_faith/glass (outro, 121): When the last pane is in, the afternoon sun comes through every color at once and lays them across the pews like a quilt.
- hearth_and_table/tryouts (outro, 121): There's a new kind of kitchen going round the realm: proper cooking, dishes that DO things for you, not just fill you up.
- hearth_and_table/chowder (outro, 121): Back at the inn, when you pass on the message, Bea goes very quiet and pink, then bangs a pot so hard the windows rattle.
- mayors_burden/feud (intro, 121): Bram: Last night someone moved the fence again, and Old Garrow threw a turnip at Hattie, and Hattie threw it back harder.
- singing_forge/brutes (outro, 121): Sol comes by on the second night and stands outside for an hour with his eyes closed, saying star names under his breath.
- heart_elsie/quilt (intro, 121): White wool, and candles to sew by, and I'll stitch the old star-marks into the corners so she's never lonely in the dark.

## 6.3 Every vision scene over 120 characters (72)

- act5_lantern/dawn_gift #1 (240): I can see everything from up here. The harbor. The chapel. Lily's grave, with the flower you left. The Hollow, asleep under all of it, snoring like Tobin. A thousand winters. Nobody else has to carry a sword up a sky for a thousand winters.
- act5_lantern/dawn_gift #1 (212): My dear. If you are reading this, you let me go, and I am so grateful I could sing. Don't be sad for too long. I have been tired for four hundred years, and now I get to be useful, which is the opposite of tired.
- act1_signs/song #3 (206): The Cantor: Forty winters ago, one faithful man rang the broken note, and the sky broke with it. He was not finished. The sky was mended badly, with seals and lies. On the Lantern night, we finish his song.
- act4_seals/sky_vision #1 (205): Elsie walks down off the mountain alone, the apron's light flickering. She finds a harbor town with a broken tower and a drowned bell, and she opens an inn across from the chapel, and she waits. And waits.
- act1_signs/song #3 (196): Gray hoods, a dozen or more, stand in a circle around a cracked bell half sunk in the earth. Hollis stands among them in his nightshirt, swaying. None of them look at him. All of them are humming.
- act4_seals/promise #3 (194): You stand on a mountain under strange stars. A young woman in an apron puts a lantern into your hands and says, in a language you somehow understand: Keep it lit. Whatever it costs, keep it lit.
- act3_deep/lamp #2 (189): One of them looks straight up, through a mile of rock, as if she can see the sky. 'When the Lantern passes, the seal will drink,' she says. 'Forty winters of light. Then again. Then again.'
- act4_seals/sky_vision #1 (189): People in pale robes stand on a mountaintop, reading the sky with instruments of brass and glass. They are the Starwrights. Far below them, under all the world, something vast is listening.
- act1_signs/count #3 (186): It goes down forever. It is not empty. It is a dark that listens. Every sound you have ever made is in it somewhere: your footsteps, your voice, a bell you struck three times underwater.
- act1_signs/song #3 (185): A tall figure in a hood darker than the rest lifts one hand, and the humming stops. The Cantor: Sisters. Brothers. The Lantern comes home. We have counted the nights, as we were taught.
- star_kittens/same_sky #2 (185): A woman with gray in her hair sits on the wall, laughing at something. Seven cats sit around her in the shape of a constellation. The smallest, gray at the muzzle, is curled in her lap.
- act4_seals/sky_vision #1 (184): A bell rings wrong from a harbor tower. The Lantern shudders, cracks, and breaks across the sky. Its pieces fall burning into the sea and onto the land. On the mountain, Elsie screams.
- act5_lantern/dawn_gift #1 (184): Look after Wren. She will try to run the inn like a stable. Let her. Guests could do with more hay in their lives. Tell Bea the soup needs less salt. She won't listen. Tell her anyway.
- act2_choir/mayor #2 (183): BY ORDER OF THE MAYOR: the events of the storm night are not to be spoken of. The keeper is to be mourned as lost at sea. The tower is not to be rebuilt. The bell is not to be raised.
- act4_seals/sky_vision #1 (183): Pass after pass, the Starwrights grow old and few. At the last good pass there is only one keeper on the mountain: a young woman with a sliver of light sewn into her apron hem. Elsie.
- act1_signs/song #3 (180): The Cantor: Nothing lost. The circle answers: Nothing missed. The Cantor: The grieving will not grieve. The drowned will come home. All of it, all of us, held in the quiet forever.
- act1_signs/song #3 (176): The Cantor: And the little keeper hears our master now, every night. He will learn the rhythm. He will ring it for us. Won't you, Brother?

And Hollis, eyes open, asleep, nods.
- act3_deep/listening #2 (175): The note cracks. High above, the Lantern splits like dropped glass and its pieces fall burning into the sea. The tower leans. The man from the boat has the rope in both fists.
- hollis_faith/forgive #1 (173): He reaches the last page and hesitates. Then: 'Brother Ashgrave, keeper of this chapel. Lost.' The wind stops. Every candle bends toward the sea, then stands straight again.
- act4_seals/sky_vision #1 (172): They cannot kill the Hollow. So they build: a vault under the sea, a room under the stone, a ring in the sky. Then they wait for a comet that passes once every forty years.
- heart_elsie/hearth #1 (172): A long hall of stone, lit by a fire that never needs feeding. People in coats stitched with points of light sit around it, singing. A small girl sits closest to the flames.
- act2_choir/mayor #2 (170): One by one they file out into the rain. A fisherman with a boy's cap in his hands stays longest. Young Tobin. Nobody tells him to leave. Nobody tells him anything at all.
- hollis_faith/forgive #1 (168): Hollis reads the names in a clear, steady voice. Alder Moss. Hal. Lily. Name after name. At each one, somewhere in the graveyard, a candle you didn't light flickers on.
- vesna_bargain/fen_mother #2 (166): She learns the song in a heartbeat and sings it into the storm. Far away, a bell rings once, wrong, before she can finish. The tower falls. She was a breath too late.
- act4_seals/promise #3 (165): She turns, and she is Elsie, and she is old, older than the mountain, older than the sea. She says: I am so tired, starling. Then the lantern in your hands goes out.
- vesna_bargain/fen_mother #2 (165): The water answers in a voice like reeds rubbing together. 'Forty winters of the song, little singer. Then you are mine.' A hand of black mud closes around her wrist.
- act3_deep/apron #2 (164): A woman who looks exactly like Elsie stands at the inn window in the Long Storm, watching the harbor tower. She is running. She is too late. She is always too late.
- hollis_faith/dream #1 (163): On the sill of the chapel's east window a small lamp is burning. The voice tries the door, then the window, and stops at the light as if it had walked into a wall.
- act1_signs/count #3 (162): It is not angry. It is hungry, the way a cold room is hungry for warmth. It has been waiting a long time. It can wait a little longer. It is very good at waiting.
- act5_lantern/dawn_crown #2 (160): Something vast turns over in the dark beneath the table, the way a dog turns over by a fire. It is content. It is waiting. It loves you, the way a hunger loves.
- act3_deep/listening #2 (159): Rain like thrown gravel. The harbor tower, whole and tall. A man in chapel gray climbs its stairs with the bell rope wound around his arm. His lips are moving.
- act1_signs/inn #2 (158): And a star chart, older than anything in the town, drawn in silver ink on something that isn't paper. Three marks glow faintly on it: a wave, a stone, a star.
- act3_deep/apron #2 (158): The same girl, older, alone, cutting a sliver of the comet's light and sewing it into a hem by candlelight. Her people's cities are empty. The sculk has them.
- vesna_bargain/fen_mother #2 (158): Rain hammers the Fen. A young woman with black braids wades out into the water up to her waist, holding up a lantern. Falling stars streak the sky behind her.
- vesna_bargain/fen_mother #2 (157): She is shouting into the water. 'Teach me! You know the old songs. Teach me the one that stops it!' Far off, the harbor tower stands black against the storm.
- act2_choir/mayor #2 (155): A town hall, forty winters ago. Wet coats, lamp smoke, too many people. A tired man in a mayor's chain stands at the front and does not meet anyone's eyes.
- act1_signs/fallen #3 (154): High above the tower burns a comet with a long green tail. The bell's note climbs to it. A crack runs across its bright face like ice on a pond in spring.
- act2_choir/mayor #2 (154): In the margin, in a smaller, shakier hand: I saw what he did on the tower. God forgive me, I will not make them see it too. Let them forget. Let it sleep.
- act4_seals/sky_vision #1 (153): The comet comes. Its light pours down through the ring, through the stone, through the sea, and far below, the listening dark closes its ears and sleeps.
- act3_deep/apron #2 (150): A girl in a coat stitched with points of light stands on a mountain beside a stone dome, her hand in her mother's. Above them a comet crosses the sky.
- act3_deep/listening #2 (148): 'She said Papa,' he whispers. 'In the dark, I heard her. It promised me. One note, and she comes home.' Brother Ashgrave. He has not slept in years.
- act1_signs/count #3 (146): Far above it, small and green and brave, a light crosses the sky. The dark turns toward the light, slowly, the way a sleeper turns toward a sound.
- act5_lantern/gate #4 (146): Below is not a pit. It is an ear. It has been listening since before the first word, and every sound you have ever made is still down there, kept.
- act1_signs/fallen #3 (145): Someone is hauling the bell rope. Not wildly. In a rhythm. Slow, slow, quick. Slow, slow, quick. Like a heartbeat with something wrong inside it.
- act1_signs/inn #2 (145): Elsie kneels by the broken trunk in the cellar lamplight. She lifts things out one at a time, slowly, as if each one weighed more than it should.
- act3_deep/lamp #2 (144): Tall figures in long coats stitched with points of light cut a room out of living deepslate. Their tools make no sound. Only their singing does.
- act3_deep/lamp #2 (142): They sing to the stone as they shape it, and the stone listens. You can feel it listening, the way you feel someone behind you in a dark room.
- act3_deep/seal #2 (142): The lamp's flame stretches toward the chained door like a hand. Cracks of pale light open in the reinforced deepslate and run along the floor.
- act4_seals/sky_vision #1 (140): The Lantern comes again, cracked and smaller, but coming. Three seals wait for it. And at the bottom of the world, something is waiting too.
- act3_deep/seal #2 (139): Then the light gutters. The seal drinks and drinks and is not full. A crack runs up the middle of the door with a sound like ice on a lake.
- inn_ghost/cold_room #1 (139): A little wooden horse on a stick rolls out from under the bed, stops at your feet and tips over, as if someone small has just let go of it.
- inn_ghost/storm_child #2 (139): The sea is black glass under a sky full of falling stars. On the end of the old pier stands a small figure in white, holding a tin whistle.
- act1_signs/fallen #3 (138): It breaks. Burning pieces scatter across the sky, and one of them falls and falls and falls, toward the ground where you are standing now.
- inn_ghost/storm_child #2 (138): On top of the harbor tower a man in a dark robe stands at the great bell, singing. You can't hear the words. You feel them, in your teeth.
- act3_deep/listening #2 (135): A small boat fights the waves below. A big man rows like his arms are on fire, shouting a name up at the tower. He ties off and climbs.
- act5_lantern/choice #4 (135): A harbor tower in a storm. A man ringing a bell. A small boat rowing hard toward him through black water. Hal. Hal, who almost made it.
- act3_deep/listening #2 (134): Overhead the Lantern blazes across the storm, a comet bright as noon, its light pouring down toward three places in the world at once.
- hollis_faith/dream #1 (133): You are in the old chapel at night. The new windows are black. Outside, something wet walks slowly around the walls, dragging a rope.
- act1_signs/fallen #3 (131): Night. Rain sideways off the sea. A harbor tower stands black against the lightning, and at the top of it a great bell swings hard.
- act5_lantern/dawn_crown #2 (129): Forty winters from now, it whispers, or four hundred, you will ring the bell for me. We have time. We have all the time there is.
- smugglers_run/crate #2 (129): You dream of wanted posters. Every one has your face on it, drawn badly. Under each one, in Quill's handwriting: REWARD: ONE FIG.
- act3_deep/apron #2 (127): You wake before dawn. Downstairs, someone is sitting by the dead hearth in the dark, and the hem of her apron is full of stars.
- hollis_faith/dream #1 (127): A voice at the door, gentle as a father's: 'Let me in. Nothing lost, nothing missed. Let me in, and no one ever grieves again.'
- hollis_faith/forgive #1 (127): Hollis closes the book. 'There,' he says, to no one you can see. 'Someone remembers you now. That's all I can do. Go to sleep.'
- act5_lantern/choice #4 (126): The light comes down through the crown like water through a sieve, and for one moment you can see everything it has ever seen.
- act5_lantern/choice #4 (125): The Starwrights, tall and patient, building the seals by its light and singing the song that Vesna and Hollis still remember.
- inn_ghost/cold_room #1 (124): The room is so cold your breath clouds. Moonlight lies on the floorboards. Somewhere close, very softly, a child is humming.
- act1_signs/inn #2 (123): A brass plate stamped with a cracked circle, a twin of the sign on Moss's hymn page. She turns it face down without a word.
- act5_lantern/gate #4 (123): You step under the arch. The soul fire leans toward you like flowers toward the sun. Then the sound of the world goes away.
- star_kittens/same_sky #2 (123): You are on the hill at the Stargazer's Ruin, but the tower is whole, the dome is clear glass, and the sky is full of stars.
- act1_signs/keeper #3 (121): Every flame in the chapel leans the same way at once, toward the floor, as if something under the stones had breathed in.
- act1_signs/count #3 (121): Then you're lying on your back on cold stone, the stars are where they belong, and your heart is going slow, slow, quick.

## 6.4 Objective labels over 60 characters (36)

- edges_of_map/night_sounds #1 (101): Camp at the southwest station after midnight (90 seconds outdoors, about {far:-1100,1050} blocks out)
- edges_of_map/sand_snow #5 (96): Stop at a wayside site on the way and use it (a shrine's blessing, a tablet, a camp's barrel...)
- act5_lantern/long_night #4 (95): No witch's steam keeps the dark back: kill 10 spiders, creepers or phantoms near the Lighthouse
- act5_lantern/long_night #3 (92): No smugglers guard the cliffs: kill 12 zombies and skeletons climbing up near the Lighthouse
- edges_of_map/night_sounds #4 (79): Chart a sky wonder: northern lights, a rainbow's end, a tornado or a storm cell
- act2_choir/hollis_night #3 (78): Sing the counter-song at the Old Chapel until he answers (2 minutes, at night)
- act4_seals/stone_frame #1 (74): Rebuild the seal frame: place 16 chiseled deepslate or polished blackstone
- act5_lantern/long_night #5 (71): No hymn sings the drowned to sleep: kill 15 drowned near the Lighthouse
- act5_lantern/alone #1 (69): Build a barricade at the Lighthouse (place 32 walls, fences or stone)
- act5_lantern/choice #3 (69): Wait in the open at the Sky Seal until the Lantern stands at midnight
- wardens_oath/drill #1 (69): At night, defeat 8 monsters within 5 minutes while the recruits watch
- edges_of_map/lost_village #1 (69): Survey the southeast station (about {far:1150,1150} blocks southeast)
- act3_deep/keys #2 (68): Hold up the lamp at the Stargazer's Ruin and hear Fenn's second echo
- wardens_oath/outpost #1 (68): Ride to the pillager outpost (about {far:-640,520} blocks southwest)
- heart_mara/corner #3 (68): Stand in Fenn's blank corner (about {far:-560,500} blocks southwest)
- graveyard_shift/gerald #1 (67): Knock Gerald down 5 times in one night (skeletons at the graveyard)
- hollis_faith/wedding #1 (67): Walk Clementine the goat on a lead from Wren's Meadow to the chapel
- singing_forge/named_true #3 (67): Sit with the blade at Dunmore's old forge after midnight (1 minute)
- act5_lantern/chapel #1 (66): Light 6 candles in the Old Chapel (place new ones if they're gone)
- singing_forge/quench #2 (65): Quench the blade in the soul fire 3 times (use the soul campfire)
- act5_lantern/alone #2 (64): Kill 12 Choir scouts and prowlers near the Lighthouse after dark
- act4_seals/sky_bridge #1 (63): Bridge the gap: place 24 quartz or glass blocks at the Sky Seal
- act5_lantern/long_night #2 (63): Hold the Lighthouse alone through four waves and keep Pip alive
- act5_lantern/gate #3 (63): Fight through the Choir's last circle at the Gate (three waves)
- act5_lantern/forty #2 (63): Row Old Tobin out over the sunken bell (ride a boat 100 blocks)
- last_map/far #1 (62): Stand on the first pin (about {far:900,-700} blocks northeast)
- act2_choir/ring_burns #2 (62): Fight through the Choir at the Gray Ring with the wardens (20)
- act5_lantern/gate #2 (62): Sneak through the Choir's last circle to the mouth of the Gate
- wardens_oath/orrins_stone #1 (62): Build Orrin a gravestone at the Old Graveyard (6 stone bricks)
- wardens_oath/orrins_stone #3 (62): Stand the dusk watch at the Old Graveyard (1 minute at sunset)
- edges_of_map/night_sounds #5 (62): Chart a sky wonder: a rainbow's end, a tornado or a storm cell
- edges_of_map/night_sounds #6 (62): Chart a sky wonder: a rainbow's end, a tornado or a storm cell
- edges_of_map/night_sounds #7 (62): Chart a sky wonder: a rainbow's end, a tornado or a storm cell
- wardens_oath/long_watch #2 (61): Stand watch on the tower after midnight (2 minutes, outdoors)
- edges_of_map/sand_snow #3 (61): Survey the north station (about {far:-80,-1350} blocks north)
- heart_reyes/returned #1 (61): Hold the Ruined Watchtower: defeat 10 monsters there at night

## 6.5 Flags: where each is set and how many places read it

| Flag | Set at | Read in (count) | Read by stories |
|---|---|---|---|
| `act1_signs.act1:path` | act1_signs/choice | 14 | act1_signs, act2_choir, act3_deep, act4_seals, act5_lantern |
| `act1_signs.elsie` | act1_signs/inn | 1 | act1_signs |
| `act1_signs.fresh` | act1_signs/fallen | 1 | act1_signs |
| `act1_signs.hollis` | act1_signs/keeper | 1 | act1_signs |
| `act2_choir.hollis_way` | act2_choir/hollis_night | 6 | act2_choir |
| `act2_choir.mayor` | act2_choir/mayor | 1 | act4_seals |
| `act2_choir.parley` | act2_choir/ring_burns | 1 | act2_choir |
| `act2_choir.vesna_first` | act2_choir/fen | 2 | act2_choir |
| `act3_deep.elsie` | act3_deep/apron | 5 | act3_deep, act4_seals, act5_lantern, listening_deep, heart_elsie |
| `act3_deep.keys` | act3_deep/keys | 1 | act4_seals |
| `act3_deep.shards` | act3_deep/echoes | 2 | act3_deep, listening_deep |
| `act4_seals.act4:promise` | act4_seals/promise | 4 | act5_lantern, heart_elsie |
| `act4_seals.first` | act4_seals/council | 21 | act4_seals |
| `act4_seals.hal` | act4_seals/tide_echo | 1 | act4_seals |
| `act4_seals.now` | act4_seals/council, act4_seals/tide_echo, act4_seals/stone_light, act4_seals/sky_vision, ... | 9 | act4_seals |
| `act4_seals.second` | act4_seals/tide_echo, act4_seals/stone_light, act4_seals/sky_vision, ... | 15 | act4_seals |
| `act5_lantern.bow` | act5_lantern/dawn_relight | 1 | act5_lantern |
| `act5_lantern.fen_call` | act5_lantern/fen_bound | 2 | act5_lantern |
| `act5_lantern.gate` | act5_lantern/gate | 4 | act5_lantern |
| `act5_lantern.horse` | act5_lantern/rally | 4 | act5_lantern, heart_wren |
| `act5_lantern.moon` | act5_lantern/long_night | 1 | act5_lantern |
| `cal:festival` | (another pack / engine) | 16 | fest_hatchlings, fest_tide_tobin, fest_night_shift, fest_tide_supper, fest_course, fest_sure_thing, fest_water_safety, fest_picnic, +8 |
| `drowned_bell.bell` | drowned_bell/iron | 40 | drowned_bell, act1_signs, act2_choir, act3_deep, act4_seals, act5_lantern, inn_ghost, graveyard_shift, +12 |
| `edges_of_map.village` | edges_of_map/lost_village | 1 | edges_of_map |
| `edges_of_map.waymark` | edges_of_map/sand_snow | 1 | edges_of_map |
| `edges_of_map.wonder` | edges_of_map/night_sounds | 1 | edges_of_map |
| `fest_course.how` | fest_course/race | 1 | fest_course |
| `fest_falling_stars.how` | fest_falling_stars/count | 0 |  |
| `fest_ghost_story.how` | fest_ghost_story/tale | 1 | fest_ghost_story |
| `fest_gift_table.how` | fest_gift_table/gifts | 1 | fest_gift_table |
| `fest_hatchlings.how` | fest_hatchlings/names | 1 | fest_hatchlings |
| `fest_judge.how` | fest_judge/pumpkins | 0 |  |
| `fest_lanterns_ida.how` | fest_lanterns_ida/iron | 1 | fest_lanterns_ida |
| `fest_picnic.ate` | fest_picnic/fruit | 1 | fest_picnic |
| `fest_speech.how` | fest_speech/line | 0 |  |
| `fest_sure_thing.how` | fest_sure_thing/dive | 1 | fest_sure_thing |
| `fest_tide_supper.fed` | fest_tide_supper/supper | 1 | fest_tide_supper |
| `fest_tide_tobin.how` | fest_tide_tobin/out | 1 | fest_tide_tobin |
| `g:aff_bea` | (another pack / engine) | 1 | heart_bea |
| `g:aff_bram` | (another pack / engine) | 1 | heart_bram |
| `g:aff_elsie` | (another pack / engine) | 1 | heart_elsie |
| `g:aff_hollis` | (another pack / engine) | 1 | heart_hollis |
| `g:aff_ida` | (another pack / engine) | 1 | heart_ida |
| `g:aff_mara` | (another pack / engine) | 1 | heart_mara |
| `g:aff_moss` | (another pack / engine) | 1 | heart_moss |
| `g:aff_quill` | (another pack / engine) | 1 | heart_quill |
| `g:aff_reyes` | (another pack / engine) | 1 | heart_reyes |
| `g:aff_sol` | (another pack / engine) | 1 | heart_sol |
| `g:aff_tobin` | (another pack / engine) | 1 | heart_tobin |
| `g:aff_wren` | (another pack / engine) | 1 | heart_wren |
| `g:allies` | act5_lantern/smugglers, act5_lantern/fen, act5_lantern/fen_bound, act5_lantern/chapel, ... | 8 | act5_lantern |
| `g:called` | the_calling/chapel_book, the_calling/graveyard_book | 2 | the_calling |
| `g:calling` | (another pack / engine) | 4 | the_calling |
| `g:calling_ready` | (another pack / engine) | 1 | the_calling |
| `g:ending` | act5_lantern/choice | 23 | act5_lantern, listening_deep, heart_tobin, heart_mara, heart_reyes, heart_elsie, heart_bram, heart_quill, +8 |
| `g:fen` | act5_lantern/fen_bound | 2 | act5_lantern |
| `g:gull` | heart_tobin/ash | 0 |  |
| `g:hollis` | act2_choir/hollis_night, act3_deep/herald | 42 | act2_choir, act3_deep, act4_seals, act5_lantern, vesna_bargain, hollis_faith, lost_lambs, hearth_and_table, +5 |
| `g:iron` | act1_signs/inn, act1_signs/choice, act2_choir/ledger, act2_choir/mayor, ... | 13 | act3_deep, act4_seals, act5_lantern, inn_ghost, graveyard_shift, hollis_faith, wardens_oath, mayors_burden, +1 |
| `g:mercy` | act1_signs/inn, act1_signs/choice, act2_choir/ledger, act2_choir/hollis_night, ... | 17 | act3_deep, act4_seals, act5_lantern, inn_ghost, graveyard_shift, vesna_bargain, hollis_faith, hatchlings, +5 |
| `g:quill` | act2_choir/ledger | 28 | act2_choir, act3_deep, act4_seals, act5_lantern, vesna_bargain, hollis_faith, one_that_got_away, hearth_and_table, +4 |
| `g:rook_won` | w_rook_rival/bounties, w_rook_rival/map | 1 | w_rook_rival |
| `g:vesna` | vesna_bargain/reeds | 10 | act5_lantern, vesna_bargain, hollis_faith |
| `g:w_accused` | (another pack / engine) | 3 | w_pell_road, w_rook_rival |
| `graveyard_shift.red` | graveyard_shift/till_dawn | 1 | graveyard_shift |
| `graveyard_shift.stone` | graveyard_shift/name_stone | 3 | act5_lantern, hollis_faith, heart_moss |
| `heart_hollis.plea` | heart_hollis/put_down | 0 |  |
| `heart_quill.partner` | heart_quill/partners | 0 |  |
| `heart_wren.foal` | heart_wren/long_night | 0 |  |
| `hearth_and_table.heart` | hearth_and_table/hearts | 1 | hearth_and_table |
| `hearth_and_table.marcel` | hearth_and_table/cook_off | 1 | hearth_and_table |
| `hearth_and_table.marty` | hearth_and_table/cook_off | 2 | act5_lantern, heart_bea |
| `hearth_and_table.saffron` | hearth_and_table/hearts | 1 | hearth_and_table |
| `hearth_and_table.way` | hearth_and_table/rations | 27 | hearth_and_table |
| `hollis_faith.forgive` | hollis_faith/forgive | 2 | act5_lantern, heart_hollis |
| `inn_ghost.lily` | inn_ghost/small_hand | 3 | inn_ghost, hollis_faith |
| `last_map.map` | last_map/last | 17 | act1_signs, act2_choir, act3_deep, act4_seals, act5_lantern, inn_ghost, graveyard_shift, lost_lambs, +3 |
| `listening_deep.cold` | listening_deep/cold_store | 1 | listening_deep |
| `lost_lambs.cat` | lost_lambs/cat | 4 | lost_lambs, heart_sol, heart_wren |
| `mayors_burden.feud` | mayors_burden/feud | 1 | mayors_burden |
| `mayors_burden.plaque` | mayors_burden/election | 2 | act5_lantern, heart_bram |
| `singing_forge.blade` | singing_forge/named_true | 2 | act5_lantern, heart_ida |
| `smugglers_run.pot` | smugglers_run/inspector | 1 | smugglers_run |
| `smugglers_run.profits` | smugglers_run/double_cross | 1 | act5_lantern |
| `star_kittens.cassie` | star_kittens/cassie | 1 | star_kittens |
| `w_pell_road.way` | w_pell_road/boots | 5 | w_pell_road |
| `w_rook_rival.beat` | w_rook_rival/bounties | 0 |  |
| `w_rook_rival.rook_lost` | w_rook_rival/bounties, w_rook_rival/map | 2 | w_rook_rival |
| `w_rook_rival.spite` | w_rook_rival/bounties | 3 | w_rook_rival |
| `w_rook_rival.turned` | w_rook_rival/turned | 1 | w_rook_rival |
| `wardens_oath.oath` | wardens_oath/oath | 3 | act5_lantern, listening_deep, heart_reyes |
| `wardens_oath.red` | wardens_oath/long_watch | 1 | wardens_oath |