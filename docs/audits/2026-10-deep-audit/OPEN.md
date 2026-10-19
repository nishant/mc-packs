# Open items after the October 2026 deep audit (PR #92)

Everything the audit found and did not finish, in one list, so nothing is lost. The evidence is next to this file:
`notes/<track>.md` (findings tables with file:line), `deferred.md` (the triage of 182 deferred rows into A docs, B cheap
fix, C follow-up, D won't fix), `phase3-report.md` (suites and soaks), `baseline.md` and `perf-tables.md` (before),
`history.md` (recurring bug classes C1-C28, also in `docs/WORKING.md`). Paths under `/home/user/wt/...` in the notes
were the audit's worktrees and no longer exist; the commits are on `master`.

Original status: A and B are done (B: 50 of 51 in mc-packs, the 51st in hosting 9170842f). Follow-up dispositions
are recorded below; everything without a disposition remains open. Historical D rows do not waive an active O item.
Each group is one follow-up task; ids (`O1`...) are for reference in PRs.

## T1. Performance budget at 40 and 100 players

- O1 (high) The bundle is 8.3-9.7 ms/tick at 40 simulated players against the 5 ms budget; map_bp alone is 3.96 ms
  against 1 ms (redraw, scan and passes: main.js around :749, :1280, :1380). Make map_bp's redraw cheaper.
- O2 (medium) Packs over 0.15 ms/tick at 40 players: silly 0.38, wander 0.36, elytra 0.34, stash 0.26, saga 0.23,
  relics 0.22, durability 0.18, calendar 0.15 (phase3-report.md table b).
- O3 (medium) elite_bp and wander_bp cost rises 5-12x over a soak as night falls (elite auraLoop main.js:876, wander
  updateLabels main.js:1510): cap the work per entity count. Champion density should scale with online players
  (`maxAlive` per player or per area) instead of a fixed 8 or 16.
- O4 (medium, unverified) bedrock_server memory grew about 8.7 MiB/min (+126 MiB in 15 min) at 40 players without
  leveling off: run a 60-minute soak to confirm or rule out a leak.
- O5 100-player soak of map_bp and saga (keep-alive resends may use up drawBudget at 100; the story tracker is
  about 0.8 ms/tick at 40 with quests).
- O6 Split `realm:hud_state` into parts (it lists only 100 players; stats_bp and party_bp join the parts).
- O7 Blood Moon at scale: an 8-block cell cache for "built" checks and a world monster cap (option, docs, Large preset).
- O8 More expedition slots (5-6 within the ticking-area budget) or a queue.
- O9 `suite.mjs --perf 10,40,100` fails over budget; add it and `weather-crowd.js` to WORKING.md's finishing order.
  Batch tornado sounds by distance band.
- O10 D rows to re-measure: npc_bp 10-tick label loop 0.20 ms; build_bp preview floor 0.38 ms (measure without the
  profiler); map_bp rebuild wave every 200 ticks; expedition build steps of 25-31 ms.

## T2. Real-client acceptance pass (phone and PC, private world)

- O11 Name label resend timing (1 s / 3 s), then lock the label design with a test (ends the C2 rework).
- O12 Story quest box size and placement (Right 1-3, Middle) with the radar and other boxes.
- O13 One-line Coordinates HUD width with party and stats extras (130-170 characters).
- O14 Tornado funnel doubling for viewers 64+ blocks away.
- O15 Minimap `budgetLevel` low, normal and high while walking, flying and at a crowded spawn.
- O16 saga actors.js label sync should exclude spectators (`excludeGameModes: [Spectator]`, `spectatorsExcluded`)
  like the other label users.

## T3. Expansive Inventory and item safety

- O17 (high, perf) Index page contents (item ids and counts per page in the committed index), so Hotbar Refill from
  pages, scans and the menu's usage load only the pages they need; add refill to perf-soak. Also rebuild closed
  PR #86's genuine-pickup routing and manual fill-earlier-pages action on latest master, without sorting or
  metadata/hotbar/cursor/control loss; share O73's transfer design. Closure alone does not finish this work.
- O18 `/realm:inv_recover <player>` for pending inventory recovery.
- O19 Close the Expeditions stash cart window (a disconnect plus broken carts re-places the structure, a copy).
- O20 refill-pages.js: add "none on any page, many pages" and locked or named stack cases.
- O21 Make `expedition-nether-carts.js` a real fail-before test (it passes on the old code; the bug needs a player who
  spawned in the Nether and stayed there).
- O22 Docs: cross-page refill can use a Flight 1 rocket stack for a Flight 3 one mid-glide (rockets are kept on purpose).

## T4. Bounded stores for offline players

- O23 One per-player owed layout for cooking `cooking:owed`, relics `relics:pending`, bounty, guilds, town
  `town:owed`, plus `fishing:owed` and `cooking:pending`; migrate on load, drop the oldest with a log line.
- O24 Letters sent by packs (goals, town) expire or have a lower inbox cap than player letters, so 400 players who
  never return can't fill the 5,000-letter realm cap.
- O25 Prune `nick:g:*`, `titles:p:*` and party entries of players gone N days (forget only wipes a whole pack).
- O26 An operator reset for map_bp `map:wp` and `map:marks` (player properties, which Pack diagnostics' forget keeps).

## T5. Public-server protections

- O27 Land Claims: tamed and farm animals, fire and liquids where the stable API allows (say what it can't do:
  pistons, endermen), a "visitors may open doors" switch, an operator audit list.
- O28 Chest Finder privacy (index only containers the player opened, owns or that are shared).
- O29 Mail and party moderation: block list, operator purge by sender, per-sender unread cap, party chat mute and
  a 1 s cooldown; prune long-gone parties.
- O30 Crowns ledger (`/realm:crowns_audit`, last 200 pays and gives) and a daily pay limit per player.
- O31 Reserved nickname list (Admin, Owner, Server, operators' gamertags).

## T6. Story portability (saga_bp)

- O32 Operator-set town anchor (`/realm:saga_place town`) for the 15 steps that assume the town is at world spawn.
- O33 Stories with `doDaylightCycle` off (78 required steps can never finish).
- O34 "needs <pack>" in the story log when a required pack was removed; Gristle's two-objective split (a `fallback:`
  objective or an OR in `when`), with a scenario for cooking on / elite off and a real kill.
- O35 Match Kitchen dishes and Champion's Hearts by lore, not name only.
- O36 Remove leftover fallback champions on entityLoad; second trim for saves past 30,000 characters.
- O37 Rebuild closed PR #84's player-local `variable.life`, `variable.style` and `variable.color` outline
  bindings on latest master with regression coverage, then the interact outline scan as a runJob; steady escort
  facing (saga-escort flake). No dependency on merging the old PR remains.

## T7. Checks and the story bible

- O38 check-stories: partial color families, reused cast names and wanderer ids, ungated pack-only items, unknown
  champion traits, rewards above the bible's scale. Carry forward O74's finite-source check: any objective
  referencing a prefab in the same chapter may establish the overlap; ordinary trees/logs, crafting, geodes,
  inventory or party sources are alternates. Separately flag mined-out interact targets such as
  `act4_seals/tide_echo`'s sea lanterns. The urgent release inventories these risks; it does not implement W7.
- O39 check-ids: per-kind id sets, particle and sound ids from bedrock-samples, and bare ids in data lists and regex
  alternations (the `dead_bush` and `note_block` cases).
- O40 docs/STORY_BIBLE.md "As shipped": Gristle and NO_KITCHEN, Prewitt, Brynn, Rosalind, Saltwife; add the writing
  rules (no reused names or wanderer ids; list every color and wood).

## T8. Operator tools

- O41 Titles take-away (`/realm:titles_take`, a toggle in Give a title).
- O42 Big-server lists: page or search the nickname list; index title holders by lowercase name.
- O43 A generic default welcome for new servers (the owner keeps the live Realm's text).
- O44 Set up this world: the `resumed` flag left set by `showWaiting` (one extra tap) and an unhandled rejection
  when a player leaves mid-form.
- O45 Pack diagnostics: a `diag_forgot` answer after 40 ticks shows "nothing was deleted" although it was; keys whose
  prefix no pack touched since reload stay unowned.

## T9. Easy Building (build_bp, build_rp)

- O46 (owner decision) Credit Effortless Building v5.0 after confirming its license.
- O47 Bedrock's single `bed` id: rewrite the 16 `<color>_bed` cases and test every mode.
- O48 (medium, perf) The two runInterval(1) loops (Preview.js:1053, ModifierVisualizer.js:166) cost 0.4-1.1 ms/tick
  with nobody holding a building tool: run them only while a tool is held.
- O49 FloatingPanels.js:318 writes the action bar with no request or lock; `idleSkip` uses a shared tick (a loop
  whose period is a multiple of 5 never sees idle players); `minecraft:end_gateway` (BlockDestroyer.js:19)
  unconfirmed; elite_bp's built-block regex (main.js:519) has Java `note_block` (Bedrock `noteblock`).
- O50 build_rp defines `eb.help.btn.guided` and `eb.set.book_language.tip` twice in every lang file.
- O51 A world `defaultMaxBlocks` separate from `maxBlocksCap`, and a public-server preset.

## T10. Town news follow-ups

- O52 Rate-limit gossip at the source in elite, calendar (Siege, carve_off, regatta), fishing, meteor, expedition,
  guilds, relics, skills and saga.
- O53 npc_bp shows an empty `{name}` for a non-town kind sent without `player`; milestones re-sends up to 9 title
  unlocks on every join (save a flag); add a scenario for LETTERS_MAX 10.

## T11. Script events and the action bar (cross-pack)

- O54 (medium, perf) 237 `scriptEventReceive` subscribers in the bundle wake on every `realm:` event (most of its
  ~550 calls/tick): one listener per pack that dispatches by id, with the test hooks and help_ping folded in.
- O55 (medium) maps_bp's warmth line (main.js:571) redraws every 40 ticks with a 45-tick hold, without `steady` and
  without listening, so the steady lines (saga, build, expedition, relics, elytra) wait while a map is held.
- O56 Tighten check-actionbar's helper detection so cases like O49's FloatingPanels.js:318 are caught.
- O57 One shared weather listener (`realm:weather_plan` `now` plus `realm:weather_ask`) instead of 7 separate guesses.

## T12. Stability, the harness and CI

- O58 Recurring `[elite] InvalidEntityError ... dimension` (console.warn catches around elite main.js 167, 176, 433,
  437, 646) and one `[moon] InvalidEntityError hasTag`: an isValid gap in a hot path.
- O59 `spawnFresh` exists as separate copies in elite, saga, atlas, domt, expedition, calendar and moon: one shared
  module with a sync tool (C14); the moon copy already broke once (5018ece).
- O60 Harness: `--flat` world templates get a random spawn point (meteor-edge and expedition-nether-carts depend on
  0,0), and a template race with `--jobs > 1` on a fresh cache (tools/test-bds/lib/server.mjs). Fresh Windows W0
  also reproduced 13 failing hook recipes with mangled backslashes/paths; resolve those in W12a, not by skipping
  them. The soak's `made > 0` guard accepted only 97 of 100 requested players: require the declared population
  and window in its performance acceptance. A separately preserved unchanged-default retry reached all 100.
  Triage `guilds-placed-restart` separately: it failed with 1, then 22 pumpkins left; do not assume a fixture cause.
  Validate ticking-area inputs and surface command rejection: an invalid circle radius 6 in the first O74
  fixture was swallowed and became a 400-tick chunk timeout. The urgent fixture now uses legal radius 4;
  fail-fast harness validation remains W12a.
- O61 Harness on the bundle as one script context (catches C13 canceled-event bugs); a BDS smoke test in CI;
  `tools/release.mjs` for the whole publish order.
- O62 Expedition: an option to announce clears only from a chosen level; forget leaves saved structures behind.

## T13. Owner-reported bugs from the live Realm (October 19; screenshots in `media/`)

- O68 The quest box cuts text off with "..." ("Party quest: you finished it, so you're helping. Your party...",
  "[x] Touch the crater's..."). **Server text fix done in `a1a4ef301bc685d9293168728ecfafcd8810bd45`
  and `70db7f4daa29835c1153dabaeb645119662ee812`:** whole lines wrap within 10 rows/502 text bytes,
  lower-priority whole lines are omitted with a truthful count, and helpers are not falsely told they finished
  the chapter. Exhaustive offline RED/GREEN and the native quest/preference-lifecycle scenario pass.
  Actual crowded PC/phone layout acceptance remains W2, not a headless PASS.
- O69 Turning the Minimap off (realm preference) leaves a black square: hide the whole radar, background included.
  **Resource binding fix done in `374ce27343176786936d3954fb4c46a3769c3c1d`:** the empty radar literal is
  1351 bytes, matching the producer, rather than 1354. Offline visibility checks cover backgrounds, compass and
  quest panels; native personal/realm toggle and empty-segment guards pass. Actual pixels remain W2.
- O70 Chest Finder's mark is barely visible: add a floating arrow or another obvious marker, plus direction and distance.
  **Server marker and guide done in `26c91c05f7b427b190635b865f9b71530ac549cc`:** a bounded player-local bright
  arrow and steady-ranked direction/distance line replace the faint outline. Genuine native RED/GREEN verifies
  searcher-only output, arbitration, replacement, timeout, death, leave and dimension cleanup. Visual prominence
  against chests/signs still needs the owner; it is not certified by particles on a headless server.
- O71 The stats ticker is realm-wide only: make it a per-player preference in /realm:prefs (realm default on).
  **Done in `1917982ec31f59ee9c224debfb60104d9a62fec8` and `70db7f4daa29835c1153dabaeb645119662ee812`:**
  the existing personal switch now defaults on, the realm switch is explicitly an allowance, and an explicit on/off
  stays saved even when matching a default. Native tests exercise both forms, actual owning-add-on saved data,
  default flips, cache invalidation and disallow/reallow. Existing stored choices are preserved. An old off choice
  erased by the old default-equal policy cannot be reconstructed; the player news explains choosing off once more.
- O72 Shift-clicking (sneak-tapping) a chest doesn't sort it.
  **Done in `abf8fc6eb09dd4274b498510a2876cccd0f95be1`:** empty-hand sneak-taps sort immediately; gear opens
  the default menu. The access protocol runs before sorting or opening an editable storage menu. A native
  Claims/stash mini-bundle genuinely fails before and passes after, including reversed load order, locked outsiders
  and cooldown feedback. Simulated empty-hand events use an explicit relay, not a claim of physical mouse/touch proof.
- O73 Items can't be moved from one Expansive Inventory page to another.
  **Done in `351068d589312202f91cf722ceaa8213bd73aded` with native restart coverage in
  `70db7f4daa29835c1153dabaeb645119662ee812` and `202874c29b38112c4b97ce817f5e1b72afc7cfc0`:**
  Move to page uses one reusable transactional stack/row transfer, validates capacity before mutation and keeps native
  metadata, controls, hotbar and cursor. Genuine native RED/GREEN covers a full-page refusal, real shulker contents,
  potion auxiliary data, enchantments, Nether/End and no leaked stores. Two physical restarts preserve a twice-moved
  opaque row exactly once, using the documented test-only simulated-ID adapter. W3/O17 and PR86 routing/index work
  remain open and must reuse this primitive; real inventory mouse/touch acceptance remains W2.
- O74 (blocker) Signs in the Sky "Fallen Light" can't be finished: the crater's amethyst was mined out by players who
  finished it first, so a party mate catching up has nothing to gather. Reset or regrow per accept, or accept any
  shards; audit every step that depends on blocks built once.
  **Done in `68c15bc2417958881c69e0dba6389a6193ff881e`:** the intro and real hint explain another geode, shards
  already carried, or a party mate. Collection already accepted those sources; no engine, terrain, item grant,
  objective index or reward change was needed. The paired native scenario completes three phases and two real
  BDS restarts: before has 61 passing engine/persistence/reward checks and only 2 guidance failures; fixed has
  63/63 passes, with zero script errors in both. It covers a real built/depleted crater, a late solo player,
  3 plus 5 party-provided shards, retained player edits, partial native saves and exactly-once rewards.
  Simulated IDs and simple inventory/level/Crowns are explicitly adapted, not ordinary rejoin or opaque-item
  persistence proof. The 183-step finite-gather inventory and adjacent interact risks remain assigned to W7/O38.
- O75 (blocker) Softlock in Signs in the Sky at the Old Graveyard: tapping an empty spot while searching for clues
  froze movement, interaction and then the camera; after being killed there was no respawn screen until Escape.
  **Server-side fix done in `6e7352ba3744447d88df8d40f404909933821bc1` and
  `ce164b9ec609a4b1a1cdbc82b0cddc60742845ff`:** clue discovery is chat-only, pending conversations have owned
  lifecycle cancellation and a safety timeout, and stale answers cannot accept or pay after death or travel
  between dimensions. The native regression records 13 genuine failures before and 35/35 passes after, including
  natural zombie melee/death, actual stale-report rewards, respawn, leave/rejoin IDs, dimensions and timeout
  recovery before the shim fallback. The versioned candidate also passes this case in the affected Saga suite.
  Camera/respawn-screen pixels and simultaneous unrelated add-on forms remain later private W2 human acceptance;
  headless results do not certify them.

## Owner decisions (no task; for nishant)

- O63 Public release packaging: ship build_bp and translucent_bp outside the bundle; slots_bp off by default; maybe
  merge harvest, leaves, durability, phantom and refill into one Quality of Life pack.
- O64 Story finale rewards above the bible's scale (kept as written).
- O65 Notes for the Realm: 3 Essentials+ tips disappear on a Realm that never saved its tip list (`/realm:news_tips`
  adds them back); the Parties migration can't be rolled back; existing operators see the setup reminder once;
  nickname protection for an offline gamertag starts at that player's next join.
- O66 Upload both new bundles to the Realm together (diag.js and the shared copies changed in both).
- O67 **Disposition done in `5413ec948b1dfc3d9f3450027021cfef82344aa6`:** the owner directed closing
  [#84](https://github.com/nishant/mc-packs/pull/84) and
  [#86](https://github.com/nishant/mc-packs/pull/86) **unmerged**, not updating or merging them.
  Closed October 19, 2026 (UTC), with heads `7801855e50d47decd7d1099b7ea6fb6cf6ae3bce` and
  `0e54ff14ea36bdba1e7bbb549d5dddd66e405788` archived with complete patches/tests. Branches retained.
  O37 and O17 still own implementation and verification of their preserved intentions; O73 shares the transfer
  design. Their feature work is not complete merely because the old PRs are closed.

## Backlog (ideas from the audit, not commitments)

saga: siege and escort outcomes as letters, a first-hour newcomer chapter, story places per town, a `{town}` name,
repeatable festivals, `saga_reset` "forget players gone N days". expedition: drop-in, a weekly featured dungeon, a
shell for flat worlds. Townsfolk sets per town; leaderboards "around me" and weekly; a party finder; a storm
leaderboard and title; Death Point despawn countdown and a "help me" waypoint; Minimap detail per player and shared
radar pictures; perf-soak reading `realm:map_debug`; cleanup_bp death points kept across restarts; a "Ride
tornadoes" preference.
