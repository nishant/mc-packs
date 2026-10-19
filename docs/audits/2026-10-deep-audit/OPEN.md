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

- O1 **CODE ACCEPTED `42de58a5` (lossless hot-path cuts); actual 1 ms Map / 5 ms bundle acceptance remains UNVERIFIED.** Original target: (high) The bundle is 8.3-9.7 ms/tick at 40 simulated players against the 5 ms budget; map_bp alone is 3.96 ms
  against 1 ms (redraw, scan and passes: main.js around :749, :1280, :1380). Make map_bp's redraw cheaper.
- O2 **MEASUREMENT REQUIRED; named remaining hot paths are separately owned, no current budget PASS.** Original target: (medium) Packs over 0.15 ms/tick at 40 players: silly 0.38, wander 0.36, elytra 0.34, stash 0.26, saga 0.23,
  relics 0.22, durability 0.18, calendar 0.15 (phase3-report.md table b).
- O3 **CODE ACCEPTED `fce94f2a`; round-robin work and 0.8/player density (ceiling 80, nearby 3); actual night/scale timing remains UNVERIFIED.** Original target: (medium) elite_bp and wander_bp cost rises 5-12x over a soak as night falls (elite auraLoop main.js:876, wander
  updateLabels main.js:1510): cap the work per entity count. Champion density should scale with online players
  (`maxAlive` per player or per area) instead of a fixed 8 or 16.
- O4 **REQUIRED: unprofiled 40-player 3600-second RSS observation, NOT started or passed.** Original target: (medium, unverified) bedrock_server memory grew about 8.7 MiB/min (+126 MiB in 15 min) at 40 players without
  leveling off: run a 60-minute soak to confirm or rule out a leak.
- O5 **REQUIRED: actual 100-player Map and Saga quest workloads, NOT passed.** Original target: 100-player soak of map_bp and saga (keep-alive resends may use up drawBudget at 100; the story tracker is
  about 0.8 ms/tick at 40 with quests).
- O6 **CODE ACCEPTED `a83dc571`; full multipart producer/Stats/Party assembly and bounds; native 100-player proof still queued.** Original target: Split `realm:hud_state` into parts (it lists only 100 players; stats_bp and party_bp join the parts).
- O7 **CODE ACCEPTED `d910426d`; night cell cache, loaded-world cap and all-dimension dawn cleanup; actual native scale timing still queued.** Original target: Blood Moon at scale: an 8-block cell cache for "built" checks and a world monster cap (option, docs, Large preset).
- O8 **CODE ACCEPTED `369d257b`; real bounded FIFO queue, unchanged 1-3 slots and shared 10-area limit; native queue/pending scenarios still required.** Original target: More expedition slots (5-6 within the ticking-area budget) or a queue.
- O9 **CODE ACCEPTED `aa5a36fa`; real steady-window fail-closed 40-player budget gate and 8-block per-player sound bands; actual gate/weather runs still required.** Original target: `suite.mjs --perf 10,40,100` fails over budget; add it and `weather-crowd.js` to WORKING.md's finishing order.
  Batch tornado sounds by distance band.
- O10 **MEASUREMENT REQUIRED; deferred labels/preview/rebuild/build hitches are not presumed solved by source cuts.** Original target: D rows to re-measure: npc_bp 10-tick label loop 0.20 ms; build_bp preview floor 0.38 ms (measure without the
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

- O17 **CODE DONE `d7390b7c24a8b31934c1177f65eac297f5b22612`; measured acceptance remains W1.** Snapshot-bound index, real earlier-page routing and all-later manual fill rebuilt; unit and real solo native collect/reward proofs retained.
- O18 **DONE `f38d249a` (within reviewed W3 `2b48a310`).** Confirmed operator backup export, stale/permission/dimension guards and idempotent retry; strict native physical-restart/metadata/export/no-repeat PASS. Live inventory is not deduplicated.
- O19 **CODE DONE `b1a1e3ce`; native durability limit explicit.** Seen carts are saved and a partial hand-back never re-places over survivors; strict native partial-cart PASS. A timed disconnect/break/restart interruption is not claimed as a native PASS; saved-seen restart behavior is covered offline.
- O20 **DONE `58608132` / `d7390b7c`.** Indexed misses, named/locked stacks and refill workload added; strict native refill PASS, including move-not-copy, long lore, death, no-match and protected-stack cases.
- O21 **WON'T CLAIM A REPRO `46a77a3d`.** The alleged Nether-spawn-and-stay fail-before could not be reproduced on BDS. Header claim withdrawn; the actual Nether round trip remains a regression, not fabricated RED.
- O22 **DONE in this Wave2 documentation checkpoint, code context `58608132`.** Player docs explicitly warn that cross-page refill can replace Flight 3 with Flight 1; rockets intentionally remain eligible.

## T4. Bounded stores for offline players

- O23 **DONE `84d45df2e1e1ec77fda5caddae50ec691f58ead1` plus bounded probe `507e87ce`.** Per-player owed stores, lazy verified migration, unknown leftovers and partial-grant re-owe. Actual three-phase/two-restart native PASS has one deliberate caught grant-failure warning (official non-strict, not warning-free). Hard-crash take/grant and indivisible-part limits documented.
- O24 **DONE `abbb1624`.** Live system inbox/expiry/reserve policy preserves player-written letters; focused 400x50 simulation and native mail/consumer regressions pass.
- O25 **DONE `a7829ba9`.** Conservative live-config nickname/title/solo-party pruning preserves unknown and untimestamped records, skips online players and rechecks after yields. Defaults and destructive scope documented.
- O26 **DONE `9c9fec57` / `68ae7b92`.** Real operator confirmation, online clear, persisted offline generation and stale-form protection; strict native owning-addon reset PASS.

## T5. Public-server protections

- O27 Land Claims: tamed and farm animals, fire and liquids where the stable API allows (say what it can't do:
  pistons, endermen), a "visitors may open doors" switch, an operator audit list.
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; native acceptance queued, not run, not PASS:**
  `protectAnimals` and `protectedAnimals` cover leash, ride, feed, milk, shear, name, sit and tame through
  cancellable interactions only. Animal damage, fire, external fluid flow, pistons and endermen are NOT protected:
  stable 2.1 has no cancelable event for them. There is no tame-owner getter, so any tamed animal in a claim is
  covered. The door switch and audit list were not re-verified in this batch.
- O28 Chest Finder privacy (index only containers the player opened, owns or that are shared).
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; native acceptance queued, not PASS:** the
  `privateIndex` setting (default `true`) indexes only what the player opened, owns or shares. Worlds that already
  had an index migrate to `false` once.
- O29 Mail and party moderation: block list, operator purge by sender, per-sender unread cap, party chat mute and
  a 1 s cooldown; prune long-gone parties.
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; native acceptance queued, not PASS:** Realm Mail
  `senderUnreadCap` (default `5`, 0 = no cap) and `blockListMax` (default `30`). Party mute covers only
  `/realm:party_chat` and the party form: stable 2.1 has no chatSend beforeEvent. The cooldown and purge were not
  re-verified in this batch.
- O30 Crowns ledger (`/realm:crowns_audit`, last 200 pays and gives) and a daily pay limit per player.
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; native acceptance queued, not PASS:** the audit
  form shows the newest 50 of the last 200 entries (times UTC). `dailyPayLimit` (default `250000`, 0 = no limit)
  caps pays per player per UTC day.
- O31 Reserved nickname list (Admin, Owner, Server, operators' gamertags).
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; native acceptance queued, not PASS:**
  `reservedNames` (default `"Admin, Owner, Server"`) and `reservedGamertags` (default `""`). Online operators
  auto-reserve their gamertag. A never-seen offline operator is NOT reservable without `reservedGamertags`.

## T6. Story portability (saga_bp)

- Wave 3a status (W6 `f500cb44`, core `c551f18c`; W8 core `470f8df3`; W10 core `ea39ff8e`, merge `4f93be85`; integrated at
  `907fc492`). **Authoring proof only unless stated:** unit/source tests and review passed. Root's strict native Gristle
  (28.0 s) and stopped-time vigil (16.5 s) PASS on W6 `f500cb44` with 0 script errors cover those two paths only; they do
  NOT prove all 78 timesteps, the full native world, champion load or scan performance. Native W8 new-bundle ordering and
  the manual checks stay UNVERIFIED. O52 Saga code is now done in `7b5dd77ee9ead783de858bb0f35d86976e11c391` after W6; its small source delta was directly reviewed.
- O32 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring + native Gristle/vigil only).** `/realm:saga_place town` (Overworld, saved exact place, `usedBy` = the 7 town stories, default world spawn). Operator catalog gets the `town` value when root regenerates it. Original: Operator-set town anchor (`/realm:saga_place town`) for the 15 steps that assume the town is at world spawn.
- O33 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring; vigil native PASS only).** Time windows/night are met while the cycle is stopped; classic and straw bed taps count as sleep/vision; wait steps count 20 real minutes a day only while the cycle is off, with no false ETA. Not all 78 steps were run natively. Original: Stories with `doDaylightCycle` off (78 required steps can never finish).
- O34 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring; Gristle native PASS).** A started story shows the missing-pack `Needs <pack> to go on` line; Gristle's kill falls back with cooking on / elite off, or cooking off. Original: "needs <pack>" in the story log when a required pack was removed; Gristle's two-objective split (a `fallback:`
  objective or an OR in `when`), with a scenario for cooking on / elite off and a real kill.
- O35 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring).** Kitchen dishes carry a `Dish: <name>` lore line that stories check; dishes made before are still accepted, so a renamed old dish remains a known limit. Original: Match Kitchen dishes and Champion's Hearts by lore, not name only.
- O36 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring; champion load not native-verified).** Stale champions are swept on entityLoad; saves past 30,000 UTF-8 bytes are trimmed in the allowed order and a codex entry that still doesn't fit is refused; unknown fields are kept. Original: Remove leftover fallback champions on entityLoad; second trim for saves past 30,000 characters.
- O37 **DONE `c551f18cc83ec72347fb4112ffbd54cb898e6e3c` (authoring).** Player-local `variable.life/style/color`; interact scan bounded to 256 blocks per scan, max 4 scans, so 1,024 blocks per tick. Tuning measurement NOT done. The escort test fix is test-side and claims nothing physical. Original: Rebuild closed PR #84's player-local `variable.life`, `variable.style` and `variable.color` outline
  bindings on latest master with regression coverage, then the interact outline scan as a runJob; steady escort
  facing (saga-escort flake). No dependency on merging the old PR remains.

## T7. Checks and the story bible

- O38 check-stories: partial color families, reused cast names and wanderer ids, ungated pack-only items, unknown
  champion traits, rewards above the bible's scale. Carry forward O74's finite-source check: any objective
  referencing a prefab in the same chapter may establish the overlap; ordinary trees/logs, crafting, geodes,
  inventory or party sources are alternates. Separately flag mined-out interact targets such as
  `act4_seals/tide_echo`'s sea lanterns. The urgent release inventories these risks; it does not implement W7.
  **Done in `fc79476fad977d0f416d8e076c47aa7f3ea8f466`, `5582b32c795a959feccd27ae497e5cb3bc33e9e2`
  and `4a06bf364eaef4bab00d91ae793f318cb49cf40b`:** the checker enforces these rules, seven partial-family
  findings and thirteen finite-interact hints are corrected, and only four explicitly owner-pending O64 rewards
  remain allowed unchanged. Real story-data tests fail before and pass after. Native pre-content data produces
  exactly five expected failures; the fixed data passes actual poplar fence/planks, bamboo/poplar sapling and
  mined-out replacement controls (`bcf5b3db56069e48e39494c6718fedcc64c3fbd8`). Placements/mining are native;
  candle taps replay the actual handler because native item taps report `isFirstEvent: false`, not physical acceptance.
- O39 check-ids: per-kind id sets, particle and sound ids from bedrock-samples, and bare ids in data lists and regex
  alternations (the `dead_bush` and `note_block` cases).
  **Checker done in `fc79476fad977d0f416d8e076c47aa7f3ea8f466`:** typed kinds and offline pinned,
  attributed particle/sound catalogs are covered by RED/GREEN tests. Known individual exceptions remain explicit;
  the Easy Building/Elite data corrections still belong to W9, not a claim that allowing an exception fixed it.
- O40 docs/STORY_BIBLE.md "As shipped": Gristle and NO_KITCHEN, Prewitt, Brynn, Rosalind, Saltwife; add the writing
  rules (no reused names or wanderer ids; list every color and wood).
  **Done in `5582b32c795a959feccd27ae497e5cb3bc33e9e2`:** the as-shipped facts, distinct character names and
  writing rules match the real story data. Prewitt's `who.id` appears in `smugglers_run`; his vote-counting mention
  in `mayors_burden` is not another objective id. The content/Bible checks pass with the four O64 amounts preserved.

## T8. Operator tools

- O41 **DONE `209bd5f9`, `5b9b1d42` (authoring).** `/realm:titles_take <player:String> <title:String>` and a give-or-take form over offline holders. README row updated. Original: Titles take-away (`/realm:titles_take`, a toggle in Give a title).
- O42 **DONE `209bd5f9`, `5b9b1d42` (authoring).** Nickname operator list pages of 20 with search; title holders indexed by lowercase name (`titles:n:`). Original: Big-server lists: page or search the nickname list; index title holders by lowercase name.
- O43 **DONE `209bd5f9`, `5b9b1d42` (authoring).** A new world gets a generic welcome; a world with Realm or saved text keeps it. NEW CONFIG options are listed in PACKS with their code defaults. `welcome:profile` and the startup heuristic are tested on a fake-API harness; the full-bundle native path is UNVERIFIED. Original: A generic default welcome for new servers (the owner keeps the live Realm's text).
- O44 **DONE `209bd5f9`, `5b9b1d42` (authoring).** The wizard's generation guards leave/death/respawn and busy pings. Original: Set up this world: the `resumed` flag left set by `showWaiting` (one extra tap) and an unhandled rejection
  when a player leaves mid-form.
- O45 **DONE `5c8e727a` (canonical), `470f8df3` (authoring).** Untouched declared world prefixes have owners; unknown/ambiguous stay unowned; a late forget answer after 200 ticks, max 16 pending, 12,000-tick expiry. Native bundle behavior UNVERIFIED. Original: Pack diagnostics: a `diag_forgot` answer after 40 ticks shows "nothing was deleted" although it was; keys whose
  prefix no pack touched since reload stay unowned.

## T9. Easy Building (build_bp, build_rp)

- O46 **OWNER-DIRECTED NO FURTHER WORK.** User reported talking to the owner and explicitly declined further licensing work. This is not independent legal verification; no new license/credit/grant/upstream copy or attribution removal.
- O47 **PARTIAL (all-mode gap):** the Line-only native handler PASS does NOT satisfy the original every-build-mode requirement. The all-mode camera-setup gap ("yaw 0 not looking up") and a second physical input are UNVERIFIED; the handler proof is not a retail pixel or physical PASS. O47 **CODE DONE `534e8fd902745e6dc11c06db5d53de5ef785742f`.** Real Bedrock ids, paired placement/claims/caps/clipboard/undo and public-main boundary fixed; 21 focused tests/type pass. Strict native main-pipeline Line/item/undo/redo PASS uses one actual anchor event and one explicitly test-only confirm invocation. Second native input/physical acceptance stays UNVERIFIED under W2; bounded all-mode runtime matrix retained separately.
- O48 **CODE DONE `534e8fd9`; W1 measurement REQUIRED.** Actual holder gate wired, dirty hints and negative resolve cache; unit zero-read counts are not a measured performance improvement.
- O49 **DONE `d61e5441`, `534e8fd9`, `4636486919cba60811533890b1534f0060dd0197`.** Actionbar arbitration, per-loop cadence and native `noteblock` fixed. Actual BDS Script API resolves `end_gateway` although vanilla command grammar rejects it: keep unbreakable protection.
- O50 **DONE `534e8fd9`.** Duplicate language keys removed with last-effective labels retained; new limit labels localized.
- O51 **DONE `534e8fd9` plus this lead preset checkpoint.** Separate default/cap, immediate player clamp; Large is 2000, operator-only and no Infinite Reach. Existing gameplay default 50000 preserved.

## T10. Town news follow-ups

- O52 **CODE DONE: non-Saga `ea39ff8e`, serialized Saga `7b5dd77e` (authoring).** At most one gossip per pack per 1,000 ticks, 64-key dedupe, dropped not queued; rewards unaffected. `calendar.js` expects a second siege_lost gossip within the hour, so that assertion needs updating at native time. Original: Rate-limit gossip at the source in elite, calendar (Siege, carve_off, regatta), fishing, meteor, expedition,
  guilds, relics, skills and saga.
- O53 **DONE `4b7c01a3`, `ea39ff8e` (authoring).** Nameless fallback line in Townsfolk; milestones records gain `tf: 1` so a later join doesn't resend old top-tier titles. Original: npc_bp shows an empty `{name}` for a non-town kind sent without `player`; milestones re-sends up to 9 title
  unlocks on every join (save a flag); add a scenario for LETTERS_MAX 10.

## T11. Script events and the action bar (cross-pack)

- O54 (medium, perf) 237 `scriptEventReceive` subscribers in the bundle wake on every `realm:` event (most of its
  ~550 calls/tick): one listener per pack that dispatches by id, with the test hooks and help_ping folded in.
  **Implemented in `fa75e390178e1b84a1bae680ff2ff19c50e06db3` and `d61e544196df98e29141af73cd6cfc9ee168b02f`, not yet terminal:** all 67
  real pack modules execute with one listener each offline. Full-fidelity native runs show three genuine old
  listener/source failures and all after assertions passing: 224 active production listeners become 67
  (225/68 with the probe), distinct from the 237 static subscription sites. Help/config/diag, console-only source,
  handler order, exception isolation, unsubscribe and late registration pass. The probe's own 24 ms is attributed
  to its callback; another pack's ordinary interval work is not mislabeled as misattribution. Exactly one intended
  probe exception is narrowly allowed, with no unexpected script errors. Fixture corrections are in
  `d6b3d848cc49be5c87c6a7bb0612f50f807c935b`. Matched W13-before/W11-after performance remains queued
  for W1; callback-count reduction is not a measured speedup.
- O55 (medium) maps_bp's warmth line (main.js:571) redraws every 40 ticks with a 45-tick hold, without `steady` and
  without listening, so the steady lines (saga, build, expedition, relics, elytra) wait while a map is held.
  **Server behavior done in `537cbaff447c2429cffc9edd6d36f801832b9207`:** rank 35, a listening hold and continued announcements preserve notes
  and higher steady ranks. Identical fixed-harness native runs show five genuine before failures and all after
  assertions passing, including lower/background ranks and putting the map away. Pixel acceptance remains W2.
- O56 Tighten check-actionbar's helper detection so cases like O49's FloatingPanels.js:318 are caught.
  **Done in `ce34c1ab0111cba0f0bbb8035c32a4101a245bb3`:** per-file/import/function matching, request-before-write order and alias checks catch
  the old bypass fixtures and real build writes; all writes found are corrected, including O49's FloatingPanels.
  Existing HUD/Stats exceptions remain explicitly pinned; an anonymous-function allowance is not a universal
  proof against every possible future anonymous write.
- O57 One shared weather listener (`realm:weather_plan` `now` plus `realm:weather_ask`) instead of 7 separate guesses.
  **Done in `bb81fb931a1f276a7d303f6b6694ee962fb8aa2e`:** six packs that actually keep a weather guess
  learn the enabled Almanac's plan and ask once after load; Rainbows has no saved guess and remains unchanged.
  Genuine native old-data RED after restart keeps all six keys null with zero native weather changes; the fixed
  code learns Thunder with zero native changes, and a separate strict no-Almanac restart/fallback case passes.
  A fixture read/clear protocol mismatch was corrected in `1ff75be80d72126413a9066c8c8fd20a644e8ecf`;
  the original failed attempt is retained. Startup ask coalescing has offline coverage; this late-attaching
  native observer saw zero initial ask/plan messages, so that vacuous count is not native coalescing certification.

## T12. Stability, the harness and CI

- O58 Recurring `[elite] InvalidEntityError ... dimension` (console.warn catches around elite main.js 167, 176, 433,
  437, 646) and one `[moon] InvalidEntityError hasTag`: an isValid gap in a hot path.
  **Code done in `6f85410bf00df1a220c3378eae2179522ea07045`, merged via `653ec2fc6ae9ebe295181399922d6398a0b257af`:**
  InvalidEntity guards in elite and moon, plus `tools/invalid-entity-guards.test.mjs`. Native log check not run.
- O59 `spawnFresh` exists as separate copies in elite, saga, atlas, domt, expedition, calendar and moon: one shared
  module with a sync tool (C14); the moon copy already broke once (5018ece).
  **Code done in `fe651846b4154b90ba84cd8c4b7fc26d68bb03d1`: one shared `tools/spawn-shared.js`, synchronous, 8 attempts
  by default. Only `fresh: true` (used by expedition) also checks position, dimension and tags; every other caller
  verifies type. It is wired into all 7 consumers. Calendar (4 attempts, throws) and moon (4 attempts, warns) are
  player-facing. Native run queued, not run, not PASS.
- O60 Harness: `--flat` world templates get a random spawn point (meteor-edge and expedition-nether-carts depend on
  0,0), and a template race with `--jobs > 1` on a fresh cache (tools/test-bds/lib/server.mjs). Fresh Windows W0
  also reproduced 13 failing hook recipes with mangled backslashes/paths; resolve those in W12a, not by skipping
  them. The soak's `made > 0` guard accepted only 97 of 100 requested players: require the declared population
  and window in its performance acceptance. A separately preserved unchanged-default retry reached all 100.
  Triage `guilds-placed-restart` separately: it failed with 1, then 22 pumpkins left; do not assume a fixture cause.
  Validate ticking-area inputs and surface command rejection: an invalid circle radius 6 in the first O74
  fixture was swallowed and became a 400-tick chunk timeout. The urgent fixture now uses legal radius 4;
  fail-fast harness validation remains W12a.
  **Implemented in `1659017eacb60cbc7adb53cdf28caca8061e06e4` and
  `8ff1e461cefa3570db7a4163e59141299d2984f5`, performance acceptance still queued:** both real two-worker
  cold-cache races generate exactly one ready template; controlled native legacy spawn 261,5 produces two RED
  assertions and is re-pinned to 0,0 for GREEN. Radius/rejection native checks pass. All thirteen old Windows
  recipe failures now pass on current source, without retry, flaky or skipped rows, in official suite mode.
  The new fail-fast exposed restart-name collisions: only successfully recorded harness-owned ticking areas
  are cleaned between phases. Rain's fixture now proves its own dry-sand/seabed classifier readiness rather
  than assuming a terrain write was settled; no production Rain logic was changed. Its original first-push
  transient cause was not determined by the old counters. Guilds now breaks all 30 pumpkins in 30 native
  attempts after restart (zero left); original 1/22-left receipts remain preserved. Explicit-y player spawning's
  pre-existing best-effort `loadArea` catch remains a disclosed harness limitation. Real matched full-window
  population/performance gates remain the W1 performance stream (wave 5), not inferred from the guard's unit tests.
- O61 Harness on the bundle as one script context (catches C13 canceled-event bugs); a BDS smoke test in CI;
  `tools/release.mjs` for the whole publish order.
  **Implemented in `1659017eacb60cbc7adb53cdf28caca8061e06e4`, C13 still queued:** strict native real
  Realm Bundle plus all resources passes with 67/67 help/diag replies and one shared 67-pack registry.
  The full-fidelity cancellation/protocol fixture was independently approved at
  `41d3540d3e5ddaa4c1d5e77c63ee87885bf4576d` and registered in the official suite by
  `5250425951666d93e2e6aa283a187b8eac3fff8a`. After preserving and correcting failed fixture attempts,
  strict native C13 passes at `d5b75e48fbec627fea99643f42b51a724f24f3ed`: real entity/item data, one
  router per production pack plus probe, claim-before/after ordering, visitor refusals and owner positive
  controls, native rod placement/charging, exactly-one disc accounting even after native pickups, shared-store
  isolation and the real help form. Replay and actual native callback deliveries remain separately labeled:
  this is not a physical-input/render test. Suite preparation builds/instruments the genuine archive instead of
  running a literal `<stage>` placeholder. Its review also exposed Townsfolk's missing canceled-entity guard:
  `649795d3fcd68883b7007dcdbd4190a04671b515` fixes actual matching-NPC callbacks (two RED tests, four GREEN)
  before any conversation or operator-editor work is scheduled. The 14 existing actionbar/weather regressions
  pass without retries or skipped rows. `weather-crowd`'s profiling case is explicitly deferred to W1 because
  the independent toolkit lane did not grant an exclusive host window; that is not a scenario PASS or removal.
  Toolkit development has no Realm source/publication gate, only shared host capacity. A proposed private GUI
  checkpoint was canceled by user-directed decoupling: no source pin, GUI join or W2 acceptance is inferred.
  Final merged review/CI/matched-suite/soak gates remain.
- O62 Expedition: an option to announce clears only from a chosen level; forget leaves saved structures behind.
  **Code done in `d00a41dcdd676698ef7af36a8f7ac77a342127f4`; partial by design. Official strict native PASS on
  `971e5533` (16.6 s, 0 errors, `tools/test-bds/examples/expedition-forget.js`): orphaned parcels deleted, stash and
  foreign structures kept, exactly one ok answer. No other native PASS is claimed.**
  `announceFromLevel` (default `"0"`) limits only the chat line. A forget deletes orphaned `expedition:parcel_<n>`
  structures. The cleanup sweep waits for in-flight hand-overs and rechecks every 40 ticks; it is not a delivery retry. PLAYER-owned `expedition:stash_<n>` structures are
  deliberately retained: stash refs live in player properties and offline players can't be enumerated, so deleting
  one early loses native inventory. Saves stay blocked until `/reload`. No global protection, full cleanup or
  native PASS is claimed.

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
  opaque row exactly once, using the documented test-only simulated-ID adapter. The W3/O17 routing and index work
  is code done at `d7390b7c24a8b31934c1177f65eac297f5b22612` (earlier-page routing, snapshot-bound index) and reuses this
  primitive; its measured acceptance remains W1. PR86 was closed unmerged under O67 (commit `5413ec948b1dfc3d9f3450027021cfef82344aa6`);
  that closure decision is recorded at O67 and is separate from any replacement proof. Real inventory mouse/touch
  acceptance remains W2.
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
