# bfix: bucket B cheap fixes (audit/bfix, from audit/integration)

Item numbers follow the B rows of deferred.md in order (item n = row n of the B table). No manifest bumps (lead bumps).

| # | item | status | sha | scenario |
|---|---|---|---|---|
| 1 | expedition_bp stash/parcel carts via `structure load`; stray carts removed (copies in other dimensions dropped when the right ones are found; a cart that loads after its structure was deleted is emptied and removed on entityLoad; a record placed by the old code into the Overworld is picked up from there) | done | 29c2f79 | expedition-nether-carts.js (new): passes before AND after, see note A |
| 2 | npc_bp / caravan_bp skin restore via `structure load` | done | fa1bb33 | npc-nether-skin.js (new): fails before (skin lands in the Overworld, a fresh NPC spawns), passes after; caravan-traders.js passes |
| 3 | refillFromPages death guard (`dead.has` in pages.js, health check in stash refillNeed and in refill_bp before sending) | done | db00f28 | refill-pages.js case 5: fails before, passes after |
| 4 | cross-page refill skips arrow, ominous_bottle, `*banner`, firework_star. **Not firework_rocket**: skipping rockets would end the feature the pages refill was built for (rockets mid-glide); Flight 1 for Flight 3 stays a known limit | done (partly) | db00f28 | refill-pages.js case 4 (banner): fails before, passes after |
| 5 | refill_need lore cut to 1500 JSON characters + `loreHash` (FNV-1a of the lore JSON), stash compares the hash (old senders: full lore); check-events.allow.json line removed | done | db00f28 | refill-pages.js case 3 (20 x 100-char lore): before, shim error 2135 chars and no refill; after, passes |
| 6 | build_bp lockActionBar before 11 notes (BlockPlacer, Clipboard, PlacementQueue, UndoRedo x4, ModifiersUI x2, PaletteUI, SettingsUI); build_bp lines removed from check-actionbar.allow.json | done | 57db1d1 | suite build* |
| 7 | build_bp Preview settled branch guard | done | 4bbb1bb | suite build* |
| 8 | elytra NOS hint and disc stopped via announceDisc (sends realm:actionbar); allowlist line removed | done | 648ef93 | suite elytra* |
| 9 | hud_bp onChange / stats_bp clearTicker clear only when pausedUntil passed (allowlist lines stay: the checker still flags the empty-string clears; comment updated) | done | 284913e | suite hud*, stats* |
| 10 | build_bp Java ids -> Bedrock (iron_chain, grass_block, noteblock, portal, dirt_with_roots, cauldron, light_block_0..15, quartz_ore, lit_deepslate_redstone_ore, waxed_copper, wooden_door, trapdoor), dropped nether_portal/grass/glowing_obsidian/cauldron variants/kelp_plant/tall_seagrass/cave_air/void_air. Kept: 16 `<color>_bed` (C), `end_gateway` (not in vanilla-data, unsure of the Bedrock id), `eb:destroy` | done | 9544d89 | suite build* |
| 11 | death_bp dead ids | done | f11ceaf (also holds the check-ids.allow.json removal for #11-#13) | - |
| 12 | domt_bp rooted_dirt, leaves_bp leaves/leaves2/log/log2. SPORE_TYPES is an index list used by saved spore records: dropping rooted_dirt shifted it and broke the_spore (domt-cards caught it); 8e66e55 puts the slot back as a repeat of dirt_with_roots | done | f059489, 8e66e55, 3b24340 | domt-cards passes |
| 13 | relics_bp item_frame/glow_item_frame | done | 112c08f | - |
| 14 | saga util.js `dead_?bush` | done | 41644e8 | - |
| 15 | saga objectives.js beforeEvents ev.cancel guard (far from PR #84's hunk) | done | b82cf69 | - |
| 16 | saga weatherAsked pruned in playerGone | done | 2e7adde | - |
| 17 | saga tracker stagger by FNV hash of player.id | done | f083eee | - |
| 18 | "Old Pell" -> "Old Grimsby" (saga side_heart.js + npc_bp hearth.js; Grimsby appears nowhere else in packs/ or docs/) | done | 6a08a72 | - |
| 19 | w_hob_tales riddle accepts road/path (with a/the) | done | df421ca | check-stories passes |
| 20 | A Champion's Heart hint mentions Grandmother Gristle | done | 1d4a913 | - |
| 21 | settings-shared.js `online()` via world.getEntity (in try), sync-settings run: 66 settings.js copies changed (bump with the others) | done | e002296 | suite settings* |
| 22 | welcome_bp body > 20000 characters refused with a chat message (only openEditor touched) | done | e21c3a2 | - |
| 23 | elite_bp scanBuilt stops at dimension.heightRange.min | done | 592ca23 | elite-storm-flat.js (new): 0 bolts before, 3 after; elite-storm-zones.js header updated |
| 24 | wander_bp: each player rolled once per scheduleTicks on their own second (hash slot) | done | aa64c65 | suite wander* |
| 25 | platypus growUpOld checks typeId before scheduling | done | 370b808 | - |
| 26 | name-labels-shared.js comment; sync-labels run (4 copies: caravan, npc, saga, wander) | done | 6613931 | - |
| 27 | dolphin loadKnown assigns `known` after getDynamicPropertyIds | done | 3a0b4c5 | - |
| 28 | mail_bp keeps a running lastSent cooldown on leave | done | c138720 | - |
| 29 | party_bp 1 s chat cooldown with reply | done | 3fb4871 | - |
| 30 | slots_bp machine stores `t` (block id); a tap on another block forgets it; old machines learn `t` on first tap | done | 4cb11e1 | slots-machine-replaced.js (new): fails before, passes after |
| 31 | ev.cancel guards: slots itemUse, quests, guilds, skills main, skills calling (itemUse + interact) | done | 47d509d | - |
| 32 | mail_bp `itemsHint` config option (default today's text, "" = none) | done | f1a9b2b | - |
| 33 | skills_bp saveVisited on a per-player second | done | 6287e3a | - |
| 34 | party_bp sendAllMembers via system.runJob, one party per yield | done | 626108d | suite party* |
| 35 | journal_bp kelp/seagrass at feet with headroom -1 | done | 600e393 | journal-ocean-seagrass.js (new): fails before, passes after |
| 36 | afk_bp isValid in /realm:afk system.run | done | 8abe5e3 | - |
| 37 | rain_bp one `stopsound @a[tag=realm:rain_muffled]` per run; tag added/removed on change, cleared on first state after join | done | 0b26a42 | rain-roof.js hook updated to count the tagged command; passes (10 stops under a roof) |
| 38 | rain_bp storm fog 0 outside the Overworld | done | b53f3c7 | - |
| 39 | climate_bp topmost reads typeId inside try | done | 897fe44 | - |
| 40 | weather_bp weather_set `initiator ?? sourceEntity` | done | 6d39f99 | - |
| 41 | night_bp journaled cleared on leave | done | 89a306d | - |
| 42 | tornado-landing: health <= 0 counts as died | done | 9df0bf3 | - |
| 43 | cooking_bp applyOwed for online players 100 ticks after worldLoad | done | 47f3384 | - |
| 44 | farm_bp canEdit re-checked in addFarm/removeFarm | done | aa7ffac | - |
| 45 | claims_bp `setblock ... air destroy` for blocks placed into a claim | done | b559de5 | suite claims* |
| 46 | map_bp giveMap: "added to your empty maps" reply when no new slot (only giveMap touched) | done | d0ba0ea | - |
| 47 | tools/bundle.mjs warns on a lang key defined differently by two packs (none today: bundle --all and --resources print no warning) | done | f313de5 | - |
| 48 | package.json engines node >= 22 | done | 06f975f | - |
| 49 | hosting minecraft/docs/OPERATIONS.md `--allow-dirty` line | skipped: other repo (nishant/hosting), outside this worktree; lead's call | - | - |
| 50 | expedition duplicated JSDoc line | done | 249d994 | - |
| 51 | build_rp en_US.lang ASCII (❗ -> !, – -> -, `§8·` separators -> `§8, `, ⏳ and ■ removed, × -> x, … -> ..., language list in English); LANG_KNOWN = {} | done | 63e3ea6 | check-ascii passes |

Note A (item 1): on BDS, world.structureManager.place() puts entities into the Overworld only when a player who SPAWNED in
that dimension is near and the Overworld chunk at the same coordinates is loaded (probe: spawned-in-Nether player ->
Overworld; same player teleported in from the Overworld -> Nether, every delay tried). Expedition hand-backs always
follow a teleport home, and a rejoining simulated player gets a new id, so no BDS scenario reproduces the expedition
case; npc-nether-skin.js (player spawned in the Nether) reproduces it for skins. The expedition fix is the same proven
command swap as stash_bp's page-store.js. A real player who logs in in the Nether with a pending hand-back (or a real
client's cross-dimension load, if it behaves like a spawn) is the expected trigger.

## Scenario results

Suite: `node tools/test-bds/suite.mjs --filter '^(expedition|npc|caravan|stash|refill|build|elytra|hud|stats|death|domt|leaves|relics|saga|welcome|elite|wander|platypus|dolphin|mail|party|slots|quests|guilds|skills|journal|afk|rain|climate|weather|night|tornado-landing|cooking|farm|claims|map|settings)' --retry --jobs 1`
(151 scenarios, 102 min): 147 pass, 3 flaky (domt-busy, domt-cards, saga-escort: failed in the run, passed alone),
1 fail (wander-walk "no named witch left", failed twice under load from the other agents; passed alone afterwards at
the same HEAD 8e66e55 in this worktree and at every bisect point in a clean worktree: timing, not a regression).
domt-cards' first failure (the_spore) was a real regression from item 12, fixed in 8e66e55 before its retry.
saga-escort was a baseline failure.

New and changed scenarios (before -> after):
- expedition-nether-carts.js (new): pass -> pass (see note A).
- npc-nether-skin.js (new): fail -> pass.
- refill-pages.js (extended, cases 3-5): fail (lore over 2048 chars, banner refilled, rockets moved for a dead player) -> pass.
- elite-storm-flat.js (new): fail (0 bolts) -> pass (3 bolts).
- slots-machine-replaced.js (new): fail -> pass.
- journal-ocean-seagrass.js (new): fail -> pass.
- rain-roof.js: test hook now counts the tagged `stopsound @a[tag=realm:rain_muffled]`; passes with the hook copy.
- tornado-landing.js: health 0 folded into `died`; passes.
- elite-storm-zones.js: header only.

`npm run check`: everything passes except help-catalog --check, gen-news --check and check-versions (expected:
catalog regeneration and bumps are the lead's). admin-catalog --check passes. `npm run build` passes.

## PACKS.md changes (made in this branch)

- Quick Stack & Sort, "Hotbar refill from other pages" (item 7 of How it works): message is now
  `{ player, slot, id, name?, lore?, loreHash? }` (lore cut to 1500 characters, hash of all of it); arrows, ominous
  bottles, banners and firework stars never come from another page; nothing moves for a player who just died.
- Hotbar Refill, "A stack runs out": cross-page refill never takes tipped arrows, ominous bottles, banners or firework stars.
- Relics, Storm Staff: dropped "an item frame" from what it won't strike near.
- Welcome Message, `/realm:welcome_edit` row: a body over 20000 characters isn't saved, and chat says so.
- Parties, `/realm:party_chat` row: one message a second, with the reply `Slow down: one party message a second.`
- Slot Machine, `slots:machines` saved data: `[{ d, x, y, z, t }]`, `t` the block id; a replaced block is forgotten on the next tap.
- Realm Mail: "No items" bullet mentions `itemsHint`; new Configuration row `itemsHint`.
- Land Claims, internals: placed blocks are broken with `setblock ... air destroy` so they drop.
- Rain Extras, internals and cost: one `/stopsound @a[tag=realm:rain_muffled] ambient.weather.rain` per run; the tag.

## For the lead

- Bump every pack this branch changed (66 settings.js copies, 4 name-labels.js copies, plus the packs above), then
  regenerate help_bp's catalog (refill_bp and Quick Stack & Sort How it works text, mail Configuration).
- NEWS candidates: "Slot machines whose block was blown up or replaced stop being machines."; "Stormcallers strike on
  superflat worlds too."; "Townsfolk and traders placed in the Nether or the End come back there."; "Party chat: one
  message a second."
- Item 49 (hosting minecraft/docs/OPERATIONS.md `--allow-dirty` line) is not done: other repo.
- Item 4 keeps rockets refilling across pages on purpose (Flight levels can't be compared in the stable API).
- Item 10 leaves `minecraft:end_gateway` listed in check-ids.allow.json (not in vanilla-data; Bedrock id unconfirmed)
  and the 16 `<color>_bed` (bucket C).
- elite_bp BUILT regex still has the Java `note_block` (Bedrock `noteblock`); not in a B row, not changed.
