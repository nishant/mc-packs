# Track: saga-content (packs/saga_bp/scripts/stories/ only)

Worktree /home/user/wt/saga-content, branch audit/saga-content, 6 commits on 2fcaae6 (origin/master merged at the start
and again before the final checks: nothing new). Only story files and two new scenarios were edited. Not touched: the
saga engine (saga-engine track), docs, tools/, shared copies, manifests. msftMyt PRs #84/#86 don't touch stories/.
recent-changes.md has no finding tagged saga-content.

Method: scripts over the loaded story data (every string, objective, reward and `when`), not reading 870 KB by hand:
rewards against the scale in STORY_BIBLE section 9 and the economy in RPG_DESIGN; every `at`/`offset`/`dim`/`belowY`;
every pack-dependent step and text (`pack:` gates, `/realm:` commands, named items from other packs); speaker names
and colors against the cast; place-name spellings; timeline numbers; British spellings; riddle answers through the
engine's `normalizeAnswer`; block/item lists against `@minecraft/vanilla-data` families; vision sound ids.

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | high | saga_bp stories | side_bright.js `hearth_and_table/hearts` (collect "Champion's Heart"), `cook_off` (Champion's Heart Stew), every KITCHEN step | Without cooking_bp **or** elite_bp no Champion's Heart ever drops (cooking gives it on elite's `realm:champion_slain`), so "A Champion's Heart" could never be finished and the last 2 chapters of Hearth and Table were locked for good. The bible says every dish step has an old way; this one had none. Also: a player who chose "The new kitchen" and later lost the Kitchen pack was stuck on dish deliveries nobody could cook | Hearts step gated on both packs; otherwise the story's own champion (Grandmother Gristle, a spider at the Ruined Watchtower; sets `heart: gristle`, outro and intro pages follow). KITCHEN now also needs `pack:cooking_bp` on; NO_KITCHEN (kitchen chosen, pack gone) repeats the old-way steps and pages; the heart stew needs elite_bp, else 2 rabbit stews. New steps appended at the end of each chapter so saved progress indexes are unchanged | S | fixed b424850 (saga-hearth-packs: 3 checks fail before, pass after) |
| 2 | medium | saga_bp stories | act5_lantern.js:55, festivals.js:24, side_heart.js:27, side_dark.js:30, act4_seals.js:623, wanderers.js:41, act5_lantern.js:358 | Build steps listed only some colors: "Light 6 candles" counted 8 of 17 candles, chapel windows 8 of 16 stained glass and 6 of 16 panes, the Sky Seal bridge 4 stained glass colors, saplings missed pale oak (and mangrove in one list), the Lantern Night barricade ("walls, fences or stone") only oak/spruce fence and one wall, "Any helmet" missed copper. A gray glass or green candle a player placed did nothing, with no message | Every color (from one color list per file), every wooden fence and the common walls, pale oak sapling and mangrove propagule, copper helmet | XS | fixed 1475a28 (saga-block-colors: fails before, passes after) |
| 3 | medium | saga_bp stories | side_bold.js:478-520, 785-795 (Inspector Pell, `who.id: "pell"`); side_bold.js:61-323 (recruit Tamsin); side_dark.js:1060-1082 (Marigold the bride); side_heart.js:1045-1091 (the ship Marigold) | Names already taken by Recurring Wanderers: Inspector Pell (and his `meet` actor id `pell`, the wanderer's own id, which the engine uses to hide the wanderer pack's copy during escorts) vs Pell the Pilgrim; the silent recruit Tamsin vs the exuberant Tamsin Galeward; the ferry bride Marigold vs Marigold of the Heights; and Bea's last ship was "the Marigold" in her heart story but "the Saltwife, my old ship" in Hearth and Table | Inspector Prewitt (id `prewitt`), recruit Brynn, bride Rosalind, Bea's ship the Saltwife everywhere (codex id `marigold_supper` kept) | XS | fixed 9014edb (text only) |
| 4 | medium | saga_bp stories | side_bold.js mayors_burden (offset 10,-14 "Town square": inspect, place 16 stone, fireworks), singing_forge (offset -40,28 "Dunmore's old forge": inspect, vision, place soul campfire, interact, **defend 3 waves incl. vindicators/pillagers**, vigil), side_heart.js heart_bram, festivals.js fest_judge, fest_speech | The town is assumed to be at world spawn. On a public server spawn is the protected hub (claims, safe zones, spawn protection): `place` steps can't be done there, and a defense spawns waves of illagers among other players at the hub. 7 stories, 15 steps | Engine: an operator-set `town` anchor (`/realm:saga_place town`, default world spawn); offsets within ~100 blocks resolve from it. Content then needs no change | M | deferred: engine/lead (request below) |
| 5 | medium | saga_bp stories | 78 required steps in 33 stories (22 in the main story): `vigil` with `timeOfDay`, `defeat` with `night`, `sleep`, `wait` `days` | With `doDaylightCycle` off (common on public servers) none of them can ever finish; saga-engine's f9e57c5 only rewords the countdown | Engine: when the cycle is stopped, treat a time window/night as met (or let operators skip it) and count `wait` days as 20 real minutes | S | deferred: engine (request below) |
| 6 | low | saga_bp stories | act5_lantern `dawn_relight` reward (400 Crowns, cap 300), `herald` (200 + totem + 6 diamonds), side_deep `last_listen` (10 levels, 200 Crowns, 4 diamonds; side scale 2-5 levels, 20-60) | Above the bible's scale; the relight ending pays 100 more than gift/crown | Owner's call (the side finale is a Nightmare dungeon; the extra 100 may be intended for the "good" ending) | XS | deferred: design decision |
| 7 | low | saga_bp stories | favors.js:301 `quill_rabbit_foot`, :382 `sol_clock` | "Show" favors (`collect`, not taken): the same rabbit foot or clock earns 20-25 Crowns from the same NPC every real day forever | `deliver`, or accept it (intentional "just show it" flavor) | XS | deferred: design (tiny: one favor per NPC per day) |
| 8 | low | saga_bp stories | side_heart.js:873 (heart_moss) + npc_bp hearth.js:397 | "Old Pell", a grave Moss talks to, has the pilgrim wanderer's name | Rename both together (npc_bp is another track's) | XS | deferred: needs npc_bp in the same change |
| 9 | low | saga_bp stories | side_deep.js `listening_deep`, calling.js `the_calling` | Gated on `pack:expedition_bp` / `pack:skills_bp` only before the first chapter: remove the pack mid-story and the story waits forever (no "needs the pack" note) | Engine: show "needs <pack>" in the log for a started story whose `requires.flags` `pack:` turned off | S | deferred: engine |
| 10 | low (C4) | saga_bp stories | side_bright.js hearts / Kitchen dish deliveries | Named-item steps match by name only: an anvil-renamed beetroot "Champion's Heart" or any food renamed "Harbor Chowder" passes | Engine/cooking: check the dish's lore mark too | S | deferred: engine + cooking_bp |
| 11 | low | saga_bp stories | wanderers.js:131 Pell's riddle | "the bell's note" normalizes to "bell s note"; only "the bells note" was accepted | Add the apostrophe form | XS | fixed 4a9070e |
| 12 | low | saga_bp stories | side_bright.js:372 | "Feed raw fish to 5 of your cats", but `tend` takes one item and only raw cod counts | Label says raw cod | XS | fixed 4a9070e |
| 13 | low | saga_bp stories | act1_signs.js:581, side_bold.js:113, 241 | Champion `trait` "relentless", "Never misses twice", "Hits the same place twice" are not Champions traits (and vindicators/pillagers are never sent to the pack): dead data | Removed | XS | fixed 4a9070e |
| 14 | low | saga_bp stories | side_bright.js:1129 | Cook-off hint said Wren's Meadow is "near world spawn" (it's a story place an operator can move) | `{band:meadow}` distance; names the stew's stand-in | XS | fixed ce985c0 |
| 15 | low | saga_bp stories | act1_signs.js:27, act5_lantern.js:28 | Speaker colors differ by act: the Cantor `§8` (dark gray, hard to read on a form) in Act I vs `§7`; Vesna `§e` in Act V vs `§5` | One color each | XS | fixed c038b32 |
| 16 | low | saga_bp stories | side_dark.js vesna_bargain ("draught" x8) | British spelling; American is "draft" (fantasy "draught" is accepted in US usage too) | Owner's call | XS | deferred: style |
| 17 | low | saga_bp stories | wanderers.js w_hob_tales riddle | "goes to every house but never comes inside" fits a road, not the accepted pot/pan/bucket/cauldron (the hint says "every tinker mends") | Add "road"/"path", or reword the riddle | XS | deferred: owner's riddle |

Checked and fine: no hardcoded `at` coordinates (50 `offset`s from spawn, all far ones read through `{far:}`/`{band:}`
tokens; the 4 fixed numbers in hints are under the 300-block knee, so never scaled); no Nether/End/height step outside
-64..320 (`aboveY` 200 max, `belowY` -40); every other mention of another pack (27 `/realm:` commands, Almanac, moons,
rainbows, expeditions, calendar, bounties, maps, atlas, skills) is gated on `pack:`; hostile one-offs gated by act
(spy after Act II, hermit after Act III, wander.js:337); place labels and cast names spelled the same everywhere
(Smugglers' Cove, Stargazer's Ruin, Gray Ring...); timeline numbers agree with the bible (forty winters, Reyes 9 + 30
years, Fenn fifty years ago); `{player}` only in pages and replies, which `pagesFor` fills; vision sounds are real
Bedrock ids; no `wait minutes` (real-time) steps; time windows that wrap midnight are supported (objectives.js:2898);
no story reward is a quest item a later step needs (losing it can't lock a story); no replay, so no duplicate rewards
(festivals are once ever; party mates each get their own reward once by design); ASCII and American spelling clean
apart from #16; id checks are check-stories'.

## Perf (ms/tick, `--only saga_bp`, perf-soak 120 s; story content changes only data)

| pack | @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| saga_bp (stories at 2fcaae6 vs HEAD, same engine) | 0.296 | 0.435 | 0.279 | 0.442 |

Within noise: the content adds 7 objectives and some pages, nothing per tick. Over the 0.15 typical-pack budget, but
all of it is the engine's `runInterval(2) @ actors.js:325` (the saga-engine track's 8cc617e cuts that to 0.045/0.094 in
their worktree).

## Scenarios added (tools/test-bds/examples/)

| scenario | before | after |
|---|---|---|
| saga-hearth-packs.js (no cooking_bp/elite_bp: the champion step is listed, Bea takes "A Champion's Heart" with no heart; a new-kitchen player turns in 2 rabbit stews to Tobin) | fail (3 checks: no champion step, `info:` not `end:` for Bea and Tobin) | pass |
| saga-block-colors.js (12 gray glass and lime panes finish "Put 12 glass blocks or panes back into the old chapel") | fail (step never done) | pass |

Saga suite (`suite.mjs --jobs 1 --filter '^saga-' --retry`): 24 scenarios, 21 pass, 3 fail: saga-escort, saga-party-story and saga-untrack, the same 3 that fail in the baseline with the same first lines (Pell's marker toggle, the party Track button, the tracker slot). The saga-engine track fixes all three in its worktree (c6b4343, be7baf1, 7abddad/64228c3); none touches story content. `npm run check` and `npm run build` pass (74 packs) in this worktree at HEAD.

## DOCS

docs/PACKS.md, "Story Questlines — `saga_bp`":
- Story table, **Hearth and Table** row ("Feel" column): add "Without the Kitchen or Champions pack, Bea asks for one
  champion's heart from Grandmother Gristle at the Ruined Watchtower instead of 2 Champion's Hearts, and a player who
  chose the new kitchen gets the old way's food while the Kitchen pack is missing."
- World events / other packs list ("A Champion's Heart (Hearth and Table)" lines): add "(Champion's Hearts need both
  the Kitchen and the Champions pack; otherwise the story spawns its own champion)".

docs/STORY_BIBLE.md (lead's or owner's file, not edited here), "As shipped":
- Hearth and Table bullet: "... every chapter that asks for a dish has an old way with plain food, chosen in *Rations
  for the Wardens*; a new-kitchen player without the Kitchen pack gets the old way too (`NO_KITCHEN`). *A Champion's
  Heart* asks for the hearts only with the Kitchen and Champions packs; otherwise Grandmother Gristle (a story champion
  spider at the `watchtower`, flag `heart` = `gristle`), and the cook-off's heart stew is 2 rabbit stews without the
  Champions pack."
- Side questline table: `smugglers_run` and `mayors_burden` mention "Inspector Prewitt" if anything; `wardens_oath`
  recruits are Dace, Brynn and Orrin; the Lamp in the Window wedding is Barnaby Pike and Rosalind; Bea's ship is the
  Saltwife.
- Section 9, writing rules: add "A named character must not reuse a townsfolk's or a wanderer's name, and a `who.id`
  must not be a wanderer id unless it is that wanderer." and "A step that names a kind of block (candles, glass,
  fences, saplings, helmets) lists every color and wood."

README.md: no change (counts 42 stories / 234 chapters still exclude the 16 festivals and the Calling, as written).

## NEWS (plain ASCII, player-facing)

- Hearth and Table can be finished without the Kitchen or Champions pack: Bea sends you after Grandmother Gristle.
- Story build steps count every color now: any candle, any stained glass, any sapling.
- Pell's riddle accepts "the bell's note".

## Requests for the lead

- Bump saga_bp once (stories changed; the saga-engine track bumps nothing either).
- check-stories (tools/, yours), worth adding:
  1. Warn when a `place`/`interact`/`wear`/`tend` list holds 2+ members of a family (`*_candle`, `*_stained_glass`,
     `*_stained_glass_pane`, `*_fence`, `*_sapling`, `*_helmet`, `*_wool`, `*_planks`) but not all of them (vanilla-data
     has the families; skip `hard_*` education ids). Would have caught #2.
  2. Fail when a `who.id` equals a wanderer id outside that wanderer's own chain, and warn when a character name in
     `who.name` or a `§x<Name>:§r` speaker is also a townsfolk/wanderer name (would have caught #3).
  3. Warn when a non-optional `collect`/`deliver` with `name` is only obtainable from another pack (a list of known
     pack-made names: Champion's Heart, Kitchen dishes, Harvest Saffron) and the objective isn't gated on that pack.
  4. Validate `champion.trait` against the Champions pack traits (#13).
  5. Warn on a reward above the bible's scale per kind (main 3-8 levels / 40-120, side 2-5 / 20-60, finales 10 /
     150-300), so the owner sees #6 each time.
- saga-engine track (engine requests): #4 `town` anchor for near-spawn offsets; #5 stopped daylight cycle; #9 a
  started story whose required pack went away should say so; #10 lore check for named dish items.
- social-world / npc_bp owner: rename "Old Pell" in packs/npc_bp/scripts/hearth.js:397 together with side_heart.js:873.

## Phase 2 ideas

1. A "town" place (operator-set, default spawn) that every near-spawn offset uses, so the square, the forge and the
   farms follow the town on any world (finding #4).
2. Per-world name substitution for the town (`{town}`): players name the harbor town; stories already avoid a name.
3. A short newcomer chain ("First Light": meet Tobin, take a daily favor, follow the tracker to the lighthouse) offered
   before the prologue, for public servers where nobody explains the story log.
4. Old-way fallbacks as a data feature (`fallback: [...]` on an objective, used when its `when` reads a `pack:` that is
   off), instead of hand-written `NO_KITCHEN` copies.
5. Repeatable seasonal content: festival chapters that come back each Realm year with a smaller reward, so long-lived
   public servers keep festival quests.

## Review

Independent reviewer, at head c038b32 (2fcaae6..HEAD: 9 story files and 2 new scenarios only). No blocker or high
confirmed, so there are no reviewer commits. Checked: each fix against the engine (`matches`/`test` AND-semantics and
`!x`, `packsPending` holds a pack-gated chapter until the first scan answers, so an "off" flag can't end a chapter
early; `objApplies`/`active` skip hidden steps; `championNear` -> the fallback spawn with `championFallback` true by
default, so the spider still comes without elite_bp; `obj.set` on a defeat sets `heart`). New objectives are appended
after the old ones in all six Hearth chapters, so saved `e.st` indexes stay valid. Prewitt rename: actors are keyed by
scene key, not `who.id`, and no prefab feature is named `pell`, so the rename is save-safe. All 30 new block and item ids
(fences, walls, pale oak and mangrove, candles, glass and panes, copper helmet) are in @minecraft/vanilla-data.
Rules: no manifest, docs, catalog or shared-copy edits; ASCII clean (check-ascii passes); no engine code touched, so no
overlap with msftMyt #84 (objectives.js) or #86 (stash_bp).

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | side_bright.js:1003 | The chapter-level hint for "A Champion's Heart" still only explains Champion's Hearts ("with the Cooking pack installed, each drops..."). A player without the packs gets the right hint only on the Gristle step itself | not fixed: low; suggested text: "...; without the Kitchen and Champions packs, Grandmother Gristle at the Ruined Watchtower stands in for the hearts." |
| low | side_bright.js:972-992 | Gristle is two objectives, one per "pack missing" case. If the packs change mid-chapter (cooking added while elite stays off), the kill on index 4 doesn't count for index 5, so she must be fought again. If both packs come back after the kill, the 2-hearts step shows again | not fixed: rare edge (pack set changes mid-chapter); a `when` with OR (or a `fallback` field, the track's Phase 2 idea 4) would fix it in the engine |
| low | saga-hearth-packs.js:57 | The scenario covers only the cooking-off variant and bumps the champion step instead of fighting her. The cooking-on/elite-off variant and the real spawn and kill (fallback spider, adds, `heart` flag, Gristle outro) are untested | not fixed: low; worth a scenario variant with `--only saga_bp,cooking_bp` and a kill |
| low | side_bold.js:506 | A meet actor already spawned before the update keeps the nameTag "Inspector Pell" until it respawns; pages already read said Pell | not fixed: cosmetic, one-time |
| low | act5_lantern.js:28 | Vesna is now `§5` (dark purple) everywhere. That is consistent, but it is about as dark on a form as the `§8` the track replaced for the Cantor | not fixed: style; owner's call (`§d` would read better and stay purple) |

Track findings 1-3 and 11-15: the fixes do what they say. Deferred items 4-10, 16 and 17 have sound reasons.

Scenario results (this review):
- `suite.mjs --jobs 1 --filter '^saga-' --retry`: 24 scenarios, 21 pass, 3 fail (saga-escort, saga-party-story,
  saga-untrack: the same baseline failures, same first lines; the engine track fixes them). Both new scenarios pass.
- Before the fix (HEAD saga_bp with 2fcaae6 stories, `--packs` copy): saga-hearth-packs fails 3 checks (no champion
  step; Bea `info:` not `end:`; Tobin `info:` not `end:`); saga-block-colors fails ("12 gray glass ... finish the step").
- `npm run check` pass, `npm run build` pass (74 packs).
