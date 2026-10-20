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

- O1 **OPEN (F56, F70/W1, F46): over budget at 40 players. Code `42de58a5` is in.** **Owner answer (October 20, F56):** "it is what it is, if we can improve it go for it": keep the 5 ms goal and keep improving wherever a measurement shows a gain. (An earlier version of this line said the owner accepted the miss as `ACCEPTED_EXCEPTION` on 2026-10-19; he never gave that answer.) The measured 40-player whole-total miss: master `27f26f6e` **9.429222222222222** -> candidate `a1b2a32c` **7.972722222222222 ms/tick**, about **15.45% lower**, over 900 steady seconds / 18,000 ticks in **67 separate contexts**. The under 5 target was NOT met; the evaluator and thresholds remain unchanged and still fail. Minimap **3.738 > 1** and the associated individual-pack excesses remain explicit risks, not implicitly waived. The bounded retained-author follow-up found no further small safe cut preserving cadence/features; it did not prove optimization impossible or isolate JS from native read cost. Large/default changes are not the way to close it; W1/F46 continues. The actual one-context bundle, full suites, other required loads and truthful blocked/manual dispositions are still required. Original target: (high) The bundle is 8.3-9.7 ms/tick at 40 simulated players against the 5 ms budget; map_bp alone is 3.96 ms
  against 1 ms (redraw, scan and passes: main.js around :749, :1280, :1380). Make map_bp's redraw cheaper.
  `3e79313723325daf64bde9e1e1a059cd6de8da1e` documented the claimed acceptance; it is corrected by F56. The canonical numerical verdict remains FAIL, and nothing is accepted.
- O2 **OPEN (F70/W1, F46).** **CODE ACCEPTED `d23c1bed`: lossless Durability/Relics/Saga/Elytra native-read cuts and bound real-HUD regressions. Silly, Stash and Calendar retain documented source-based no-change reasons. Actual 10/40-player costs were measured on frozen `a1b2a32c` (see `perf-tables.md`); the individual 40-player excesses remain failures, not measurement-pending or implicitly waived by O1. The later Expedition loader-release delta is not retroactively included in those historical source labels.** Original target: (medium) Packs over 0.15 ms/tick at 40 players: silly 0.38, wander 0.36, elytra 0.34, stash 0.26, saga 0.23,
  relics 0.22, durability 0.18, calendar 0.15 (phase3-report.md table b).
- O3 **OPEN (F22; F10 answered: keep per-player scaling).** **CODE ACCEPTED `fce94f2a`; round-robin work and 0.8/player density (ceiling 80, nearby 3); actual night/scale timing remains UNVERIFIED.** Original target: (medium) elite_bp and wander_bp cost rises 5-12x over a soak as night falls (elite auraLoop main.js:876, wander
  updateLabels main.js:1510): cap the work per entity count. Champion density should scale with online players
  (`maxAlive` per player or per area) instead of a fixed 8 or 16.
- O4 **OPEN (F57 60-minute memory soak, F70).** **FULL OBSERVATION DONE at `3c09b137`; LEAK VERDICT UNRESOLVED, not a leak PASS.** The identical second bounded attempt retained all 40 at every one of 3,600 samples for 72,000 steady ticks (3,600 game seconds; 3,905.263 wall seconds), with 45,514 walks and 3,200 commands. The first attempt's 39/40 failure is retained, not promoted. All 2,095 staged production files and 74 manifests were verified. With no injected profiler, private bytes still grew from 1,388.8 to 1,610.9 MiB; ten-minute medians rose throughout. The working set fell late, but trimming does not rule out a leak. No GC or pack attribution is exposed, so a production leak is neither confirmed nor ruled out. Host census: 132 samples at 30-second resolution, maximum two BDS processes, minimum 25.79 GiB free; observed overlaps were the five explicitly permitted short functional cases, not foreign native jobs. This was 67 separate pack contexts, not a one-context bundle CPU comparison. Raw process/window/provenance receipts: `o4-unprofiled40-3600-v2/memory-evidence.json` and `memory-summary.json` in the coordinator's retained evidence. Later owner/F1/F2 changes are not retroactively covered.
- O5 **OPEN (F57).** **REQUIRED: actual 100-player Map and Saga quest workloads, NOT passed.** Original target: 100-player soak of map_bp and saga (keep-alive resends may use up drawBudget at 100; the story tracker is
  about 0.8 ms/tick at 40 with quests).
- O6 **CODE ACCEPTED `a83dc571`; full multipart producer/Stats/Party assembly and bounds; native 100-player proof still queued.** Original target: Split `realm:hud_state` into parts (it lists only 100 players; stats_bp and party_bp join the parts).
- O7 **OPEN (F5: Blood Moon can spawn monsters inside a new shelter).** **CODE ACCEPTED `d910426d`; night cell cache, loaded-world cap and all-dimension dawn cleanup; actual native scale timing still queued.** Original target: Blood Moon at scale: an 8-block cell cache for "built" checks and a world monster cap (option, docs, Large preset).
- O8 **DONE `369d257b` and `9c36e128`; real bounded FIFO queue, unchanged 1-3 slots and shared 10-area limit.** The unchanged `expedition-pending` case failed before the loader-release fix (220/223 seconds), then passed in 208 seconds on `16a0081f`: a restart leaves the occupied box pending, the waiting party cannot enter it, freeing native capacity resets the box and starts the queued party automatically, and leaving resets it again. A completed reset keeps its slot reserved across the old loader's native release boundary; it cannot immediately reuse chunks that are unloading. The queue/announce/cart unit group passes 28/28. Original target: More expedition slots (5-6 within the ticking-area budget) or a queue.
- O9 **CODE ACCEPTED `aa5a36fa`; real steady-window fail-closed 40-player budget gate and 8-block per-player sound bands; actual gate/weather runs still required.** Original target: `suite.mjs --perf 10,40,100` fails over budget; add it and `weather-crowd.js` to WORKING.md's finishing order.
  Batch tornado sounds by distance band.
- O10 **OPEN (F70/W1, F57).** **MEASUREMENT REQUIRED; deferred labels/preview/rebuild/build hitches are not presumed solved by source cuts.** Original target: D rows to re-measure: npc_bp 10-tick label loop 0.20 ms; build_bp preview floor 0.38 ms (measure without the
  profiler); map_bp rebuild wave every 200 ticks; expedition build steps of 25-31 ms.

## T2. Real-client acceptance pass (phone and PC, private world)

- O11 **OPEN: pending the owner's real-client check (F71).** Name label resend timing (1 s / 3 s), then lock the label design with a test (ends the C2 rework).
- O12 **OPEN: pending the owner's real-client check (F71).** Story quest box size and placement (Right 1-3, Middle) with the radar and other boxes.
- O13 **OPEN: pending the owner's real-client check (F71).** One-line Coordinates HUD width with party and stats extras (130-170 characters).
- O14 **OPEN: pending the owner's real-client check (F71).** Tornado funnel doubling for viewers 64+ blocks away.
- O15 **OPEN: pending the owner's real-client check (F71).** Minimap `budgetLevel` low, normal and high while walking, flying and at a crowded spawn.
- O16 **OPEN: code done `98012e88` (integrated at `3efcb2cd`); the rendered nameplate is pending the owner's real-client check (F71).** Saga labels use `excludeGameModes: [Spectator]` and `spectatorsExcluded`, with a lazy observer query like the other label users. Four source/model regressions pass; no phone/PC rendered-nameplate claim.

## T3. Expansive Inventory and item safety

- O17 **OPEN (F3: the page index still loads pages it could skip).** **CODE DONE `d7390b7c24a8b31934c1177f65eac297f5b22612`, corrected by owner-selected F1 `4a9e3b85` and F2 `e7344108`, integrated at `3efcb2cd`; whole-load acceptance remains W1.** The snapshot-bound index and all-later manual fill remain. The owner explicitly superseded automatic routing while the viewed page has room: automatic routing now uses master's at-most-one-free-slot criterion and stops at two free slots. F1's real public-menu native case passed in 18.4 s: a native slot-locked stack kept amount 7, lock, name and lore while 12 dirt actually moved earlier; the hotbar stayed unchanged, including after page round trips. F2's supplied one-player/120-pickup/1,200-tick scenario passed on current master `27f26f6e` and fixed `3efcb2cd`, using identical harness runtime objects and no observed native overlap: 0.3069620253 versus 0.3539192399 ms/tick, including 64/63 setup ticks. Both retained the 120 pickups on page 2. This is +0.0469572146 ms/tick, not a speedup or a 40-player budget PASS. All other fleet-review fixes are explicitly after this release; they are not new premerge requirements.
- O18 **DONE `f38d249a` (within reviewed W3 `2b48a310`).** Confirmed operator backup export, stale/permission/dimension guards and idempotent retry; strict native physical-restart/metadata/export/no-repeat PASS. Live inventory is not deduplicated.
- O19 **OPEN (F70: the timed disconnect/break/restart window during cart creation).** **CODE DONE `b1a1e3ce`; native durability limit explicit.** Seen carts are saved and a partial hand-back never re-places over survivors; strict native partial-cart PASS. A timed disconnect/break/restart interruption is not claimed as a native PASS; saved-seen restart behavior is covered offline.
- O20 **DONE `58608132` / `d7390b7c`.** Indexed misses, named/locked stacks and refill workload added; strict native refill PASS, including move-not-copy, long lore, death, no-match and protected-stack cases.
- O21 **WON'T CLAIM A REPRO `46a77a3d`.** The alleged Nether-spawn-and-stay fail-before could not be reproduced on BDS. Header claim withdrawn; the actual Nether round trip remains a regression, not fabricated RED.
- O22 **DONE in this Wave2 documentation checkpoint, code context `58608132`.** Player docs explicitly warn that cross-page refill can replace Flight 3 with Flight 1; rockets intentionally remain eligible.

## T4. Bounded stores for offline players

- O23 **DONE `84d45df2e1e1ec77fda5caddae50ec691f58ead1` plus bounded probe `507e87ce`.** Per-player owed stores, lazy verified migration, unknown leftovers and partial-grant re-owe. Actual three-phase/two-restart native PASS has one deliberate caught grant-failure warning (official non-strict, not warning-free). Hard-crash take/grant and indivisible-part limits documented.
- O24 **DONE `abbb1624`.** Live system inbox/expiry/reserve policy preserves player-written letters; focused 400x50 simulation and native mail/consumer regressions pass.
- O25 **DONE `a7829ba9`.** Conservative live-config nickname/title/solo-party pruning preserves unknown and untimestamped records, skips online players and rechecks after yields. Defaults and destructive scope documented.
- O26 **CODE DONE `9c9fec57` / `68ae7b92`, plus S2 `e6a80817` (head `94721f9d`, integrated at `3efcb2cd`).** Real operator confirmation, online clear, persisted offline generation and stale-form protection had a strict native owning-addon PASS. The new epoch-backed monotonic marker handles world-only forget while player markers remain; nine RED/GREEN-backed reset tests pass. A clock rolled back behind an earlier reset remains a limit. The native fixture now checks the actual monotonic contract rather than the retired first-reset-equals-one assumption; native acceptance of S2 is still queued, not inherited from the older PASS.

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
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; strict native public-command PASS at byte-equivalent `aef10dc8` (29.5 s, 7 staged files, zero script errors):** the audit
  form shows the newest 50 of the last 200 entries (times UTC). `dailyPayLimit` (default `250000`, 0 = no limit)
  caps pays per player per UTC day. The actual owning add-on accepted a 5,000 limit, counted payments of 1,000 and 4,000, refused the next 1 before either balance changed, and showed the real payment in `/realm:crowns_audit` with UTC text. This is not a storage-cap stress or midnight-rollover native claim.
- O31 Reserved nickname list (Admin, Owner, Server, operators' gamertags).
  **Code done in W5 at `376cf33a7c278cb0788a2e81105af9bb8cbd46f1`; strict native PASS at byte-equivalent `aef10dc8` (33.2 s, 7 staged files, zero script errors):** an offline operator's protected name was refused, a free nickname saved, and an operator deopped during confirmation could not clear another player's name.
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
- O43 **OWNER DESIGN CODE DONE `1594618c785d31f9ed74c723fc6c525eebc60de8` / typed head `9961952cbaec0bab470a09f8a6b73e973381f81f`, integrated at `3efcb2cd`; 15 offline tests pass. Full-bundle native is queued, client fit remains UNVERIFIED.** **Owner answer (2026-10-19):** one compact scrolling ActionFormData for all worlds including Realm, normal-size `.label()` bold gold (never `.header()`), ASCII prose, one Close button, under a minute, spoiler-free synopsis, installed feature lines and help/prefs/story log. The exact legacy-body phrase triggers one migration; unrelated fields survive and later operator saves always override. `welcome:migrated` replaces the retired `welcome:profile` heuristic. S1 concurrent discovery is preserved from `7c8f0df2`. Earlier generic-versus-Realm behavior (`209bd5f9`, `5b9b1d42`, `3ab057f7`) is SUPERSEDED, not silently retained. Policy applied in `e40b5109baac5b1164e4c440f5541242bb913e0d` (initial `c440f639`); Small Realm defaults stay unchanged for this 10-player Realm, usually 1-4 online. Form/word bounds are not client-pixel or no-cutoff proof.
- O44 **DONE `209bd5f9`, `5b9b1d42` (authoring).** The wizard's generation guards leave/death/respawn and busy pings. Original: Set up this world: the `resumed` flag left set by `showWaiting` (one extra tap) and an unhandled rejection
  when a player leaves mid-form.
- O45 **DONE `5c8e727a` (canonical), `470f8df3` (authoring).** Untouched declared world prefixes have owners; unknown/ambiguous stay unowned; a late forget answer after 200 ticks, max 16 pending, 12,000-tick expiry. Native bundle behavior UNVERIFIED. Original: Pack diagnostics: a `diag_forgot` answer after 40 ticks shows "nothing was deleted" although it was; keys whose
  prefix no pack touched since reload stay unowned.

## T9. Easy Building (build_bp, build_rp)

- O46 **SUPERSEDED by the owner answer below (docs applied in `c440f6395810a788a3875c1d1354ea42e7efa7ec`).** The earlier owner decline of credit wording no longer blocks: `docs/RELEASE_TODO.md` now carries the public-release item. This is not independent legal verification; still no new license/credit/grant/upstream copy or attribution removal now. Owner answer (2026-10-19): create `docs/RELEASE_TODO.md` with heading "Before a public release (no date yet)" and first checkbox "Easy Building is a port of Effortless Building v5.0: confirm the upstream license and add the credit it requires."; linked from README and WORKING; future public-prerelease items go there. Applied by `c440f6395810a788a3875c1d1354ea42e7efa7ec`.
- O47 **OPEN (F70; F9). PARTIAL (all-mode gap):** the Line-only native handler PASS does NOT satisfy the original every-build-mode requirement. The all-mode camera-setup gap ("yaw 0 not looking up") and a second physical input are UNVERIFIED; the handler proof is not a retail pixel or physical PASS. O47 **CODE DONE `534e8fd902745e6dc11c06db5d53de5ef785742f`.** Real Bedrock ids, paired placement/claims/caps/clipboard/undo and public-main boundary fixed; 21 focused tests/type pass. Strict native main-pipeline Line/item/undo/redo PASS uses one actual anchor event and one explicitly test-only confirm invocation. Second native input/physical acceptance stays UNVERIFIED under W2; bounded all-mode runtime matrix retained separately.
- O48 **OPEN (F7: the gate is open nearly all the time in survival; F70 measurement). CODE DONE `534e8fd9`; W1 measurement REQUIRED.** Actual holder gate wired, dirty hints and negative resolve cache; unit zero-read counts are not a measured performance improvement.
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
- O71 **OPEN (F45: the ticker writes every player's action bar every second; stats_bp over 0.15 ms).** The stats ticker is realm-wide only: make it a per-player preference in /realm:prefs (realm default on).
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
  **Owner answer (2026-10-19):** keep all packaging as is: every individual pack retained; the two Realm bundles (Realm Bundle and Realm Resources) together hold all packs; `tools/standalone.json` stays empty; slots default features ON; no pack merges. Read-only check at `c440f6395810a788a3875c1d1354ea42e7efa7ec`: `standalone.json` is `[]`, matching. No runtime change. No Large profile.
- O64 Story finale rewards above the bible's scale (kept as written).
  **Owner answer (2026-10-19):** keep the final rewards as written, intentionally generous. `docs/STORY_BIBLE.md` records the approved exception and `tools/check-stories.allow.json` marks the four findings approved (act5_lantern/herald, act5_lantern/choice, act5_lantern/dawn_relight, listening_deep/last_listen); no amounts, packs or story text changed. Applied by `c440f6395810a788a3875c1d1354ea42e7efa7ec`. The author's missing `@minecraft/vanilla-data` was a historical worktree limitation, not a current release dependency gap: the integrated root's full checks passed at `a1b2a32c`, and the later `4bbf6df1` CI check passed with the same story/checker data.
- O65 Notes for the Realm: 3 Essentials+ tips disappear on a Realm that never saved its tip list (`/realm:news_tips`
  adds them back); the Parties migration can't be rolled back; existing operators see the setup reminder once;
  nickname protection for an offline gamertag starts at that player's next join.
  **Owner answer (2026-10-19):** all four Realm notes acknowledged; no changes; not repeated in reports. Recorded in `f2e20ae8`, integrated through `e40b5109` at `3efcb2cd`.
- O66 Upload both new bundles to the Realm together (diag.js and the shared copies changed in both).
  **Owner answer (2026-10-19):** "It is assumed the Realm Bundle and Realm Resources get uploaded to the Realm after each release; the owner does it." Applied in `CLAUDE.md` ship step 4, `docs/WORKING.md` finishing step 7 and `docs/SERVER_SETUP.md` Updating, by `c440f6395810a788a3875c1d1354ea42e7efa7ec`. Attaching `.mcpack` files is no longer required; website completion does not wait on the upload. Hosting apply: `79cd7cbb320fd27753c2c185d796c42bd2039bd9` on branch `msftmyt-urgent-hosting-readiness` (`nishant/hosting`, CLAUDE.md step 4 only), reported by the hosting session; local commit, not yet merged to `master` or deployed.
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


## Re-marked honestly (F58, October 20)

The table below came from the #96 release, which marked deferred work WON'T FIX or DONE without the work or an owner
answer. Each change, with its reason (an item becomes WON'T FIX only with an owner answer recorded here):

- O1 WON'T FIX -> OPEN (F56, F70/W1, F46): the "owner accepts" answer was never given; his answer is "it is what it is, if we can improve it go for it".
- O2 WON'T FIX -> OPEN (F70/W1, F46): individual packs are still over budget at 40 players; no owner answer.
- O3 DONE -> OPEN (F22): the owner kept per-player champion scaling (F10), but the elite guard audit and night/scale timing are not done.
- O4 WON'T FIX -> OPEN (F57, F70): the leak verdict is unresolved; the 60-minute memory soak is still to run.
- O5 WON'T FIX -> OPEN (F57): the 100-player Map and Saga windows were never run; the deferral was msftMyt's, not the owner's.
- O7 DONE -> OPEN (F5): Blood Moon can spawn monsters inside a new shelter.
- O10 WON'T FIX -> OPEN (F70/W1, F57): the measurements were never run.
- O11, O12, O13, O14, O15 WON'T FIX -> OPEN (F71): they wait on the owner's real-client checks, not won't fix.
- O16 DONE -> OPEN (F71): code done, the rendered nameplate waits on the owner's real-client check.
- O17 DONE -> OPEN (F3): the page index still loads pages it could skip.
- O19 WON'T FIX -> OPEN (F70): the cart window's timed interruption case is still open.
- O47 WON'T FIX -> OPEN (F70, F9): beds work in Line mode only, not every build mode.
- O48 WON'T FIX -> OPEN (F7, F70): the holder gate is open nearly all the time in survival, and its measurement was never run.
- O71 DONE -> OPEN (F45): the default-on stats ticker put stats_bp over 0.15 ms.
- Deferred rows 49 and 68 WON'T FIX -> OPEN (O10, F70/W1, F57): their measurements were deferred by the contributor, not the owner.
- The soak deferral ("lets skip the soak tests, let nishs claude do that later") is relabeled as the contributor msftMyt's, not an owner override (F57).

## Final release dispositions (2026-10-20)

This is the authoritative release disposition for **all75 original items and all83 deferred rows**. Earlier queued/pending wave narratives above are historical, not current gates. DONE means the specified server/source work and its explicitly scoped evidence, never an automatic all-device, all-path or stress certificate. WON'T FIX identifies the exact remaining scope and reason; implemented portions remain recorded.

**Contributor deferral, 2026-10-20 (not the owner's):** "lets skip the soak tests, let nishs claude do that later" was the contributor msftMyt's instruction to his own session (it names Nish in the third person); `USER_DEFERRED` means deferred by that user. Every run it deferred is open (F57), not waived. The owned genuine Bundle+Resources40/900 run was stopped at05:06:43UTC with partial evidence preserved as USER_DEFERRED_INTERRUPTED, not PASS. Candidate100/300, Saga100/two quests/120 and the unstarted O10 idle40/60 measurement are USER_DEFERRED: open, for a later session (F57). Completed memory/performance windows are not rerun or relabeled. The normal non-soak release and live-check steps remain required. It was never an owner decision and sets no testing default.

The original candidate250 keeps **234 initial PASS/16 initial FAIL**, and master keeps **218PASS/4flaky/28FAIL**. Separately versioned corrections and the original O8 production fix provide positive proof for15 of those16 candidate failures; the remaining Wander case fails both sides and belongs to the open, owner-reported F42 (wanderers rubber-banding). This is **not** a synthetic249/250 all-pass certificate. Source labels, first failures, retries, fixture adaptations and concurrency segments stay in the release evidence. Historical per-pack costs remain in [perf-tables.md](perf-tables.md); they are not final414a18f6 measurements.

| Item | Final disposition | Real code/decision commits | Evidence scope or reason |
|---|---|---|---|
| O1 | OPEN (F56, F70/W1, F46) | [42de58a5](https://github.com/nishant/mc-packs/commit/42de58a50c3209a102ca4af14c53fdef3c1a149a), [27f26f6e](https://github.com/nishant/mc-packs/commit/27f26f6e8eab780e7e18462c7475529028fdb92b), [a1b2a32c](https://github.com/nishant/mc-packs/commit/a1b2a32ce68eaf8568b2c44d69669bb1d95e59ef), [3e793137](https://github.com/nishant/mc-packs/commit/3e79313723325daf64bde9e1e1a059cd6de8da1e) | Re-marked from WON'T FIX (F58): no owner acceptance exists; the owner's answer is "it is what it is, if we can improve it go for it". 7.972722222222222 ms/tick at 40 is over 5; keep the goal and keep improving. Individual excesses are not waived. Earlier note (wrong, F56): "Owner accepts the known whole-total 40-player miss, not budget PASS." Historical A1b 7.972722222222222 ms/tick remains over 5; individual excesses are not waived. |
| O2 | OPEN (F70/W1, F46) | [d23c1bed](https://github.com/nishant/mc-packs/commit/d23c1bed78995cb9f99c53fb26c759f234c46dfd), [a1b2a32c](https://github.com/nishant/mc-packs/commit/a1b2a32ce68eaf8568b2c44d69669bb1d95e59ef) | Re-marked from WON'T FIX (F58): individual packs are still over 0.15 at 40 players and WON'T FIX needs a recorded owner answer. Earlier note: Measured individual overruns remain. No further behavior-preserving cut was established for this release; preserve cadence/features and the failed targets rather than invent a waiver or a mathematical impossibility claim. |
| O3 | OPEN (F22) | [fce94f2a](https://github.com/nishant/mc-packs/commit/fce94f2a8b8ea7c527333e786efdfc0f764537b1), [8f89f3f8](https://github.com/nishant/mc-packs/commit/8f89f3f84ecb9d42f55315a58cef92ac4ef0041a) | Re-marked from DONE (F58): the owner kept the per-player scaling (F10, October 20), but the elite guard audit (F22) and the actual night/scale timing are not done. Earlier note: Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O4 | OPEN (F57, F70) | [3c09b137](https://github.com/nishant/mc-packs/commit/3c09b137b0840369fca5e486632612dd32230086) | Re-marked from WON'T FIX (F58): the leak verdict is unresolved; F57's 60-minute unprofiled memory soak at 40 is to run. Earlier note: The full source3c09 unprofiled 40-player hour completed, but private bytes rose and GC/pack attribution was unavailable. Leak unresolved; no leak-free certificate or speculative production change. |
| O5 | OPEN (F57) | No new code claim | Re-marked from WON'T FIX (F58): the 100-player Map and Saga quest windows were never run; the deferral was the contributor msftMyt's, not the owner's. Earlier note: USER_DEFERRED (by the contributor, not the owner): the remaining candidate100/300 and Saga100/two-quest/120 load windows are open. Master100 attempts were invalid; no partial-population comparator. |
| O6 | DONE, scoped | [a83dc571](https://github.com/nishant/mc-packs/commit/a83dc5710871583105116194a977d9abb2887609) | Bounded HUD-state parts and consumers are implemented. This does not certify the actual 100-player load (open, F57; deferred by the contributor, not the owner) or client rendering (F71). |
| O7 | OPEN (F5) | [d910426d](https://github.com/nishant/mc-packs/commit/d910426db5c723392a063b094d572bc2d528fbaa) | Re-marked from DONE (F58): Blood Moon can still spawn monsters inside a new shelter (F5); native scale timing is not run. Earlier note: Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O8 | DONE, scoped | [369d257b](https://github.com/nishant/mc-packs/commit/369d257b6b7d3ac8348eeebc384d762294409e14), [9c36e128](https://github.com/nishant/mc-packs/commit/9c36e128e56d91717af47b95eab573af8f8d9e25), [16a0081f](https://github.com/nishant/mc-packs/commit/16a0081fa964ed3ee817c6a3c68470dd3787a937) | Original unchanged expedition-pending failed220/223s, then passed208.117s at16a0081f after9c36e128. Native pending exclusion, automatic queued start and subsequent leave/reset pass; 28 queue/announce/cart unit checks pass. |
| O9 | DONE, scoped | [aa5a36fa](https://github.com/nishant/mc-packs/commit/aa5a36fa0b9950e34c7dfb27e5e054187b3010fe), [2030b19e](https://github.com/nishant/mc-packs/commit/2030b19e104aeea16b9535f5b94a3e76ce2c57b0) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O10 | OPEN (F70/W1, F57) | No new code claim | Re-marked from WON'T FIX (F58): the label/preview/rebuild/build-hitch measurements were deferred by the contributor, not the owner, and are not run. Earlier note: USER_DEFERRED: remaining label/preview/rebuild/build-hitch measurements, including the unstarted 40-player/60-second production-diagnostic idle probe. Prepared tooling is not a timing result. |
| O11 | OPEN (F71) | No new code claim | Re-marked from WON'T FIX (F58): pending the owner's real-client check on a phone and a PC, not won't fix. Earlier note: Rendered PC/phone label resend and final visual design were not verified. Read-only desktop/input boundary; no substitute of source or headless signals for actual client rendering. |
| O12 | OPEN (F71) | No new code claim | Re-marked from WON'T FIX (F58): pending the owner's real-client check, not won't fix. Earlier note: Rendered PC/phone crowded quest-box/radar placement remains unverified under the read-only client boundary. Server wrapping and panel signals are covered separately by O68/O69. |
| O13 | OPEN (F71) | No new code claim | Re-marked from WON'T FIX (F58): pending the owner's real-client check, not won't fix. Earlier note: Actual narrow phone/PC Coordinates HUD fit is unverified. No claim that server string bounds prove pixel fit or all GUI scales. |
| O14 | OPEN (F71) | No new code claim | Re-marked from WON'T FIX (F58): pending the owner's real-client check, not won't fix. Earlier note: Distant-viewer funnel doubling requires actual client observation; headless particles do not certify it. No new camera/input campaign in this release. |
| O15 | OPEN (F71) | No new code claim | Re-marked from WON'T FIX (F58): pending the owner's real-client check, not won't fix. Earlier note: Actual low/normal/high Minimap client budgets while walking/flying/crowded remain unverified. Server costs/signals do not prove client FPS or pixels; further load windows are open (F57). |
| O16 | OPEN (F71) | [98012e88](https://github.com/nishant/mc-packs/commit/98012e8805280fc0d9e68f1ee1f7138fbd6dc023), [3efcb2cd](https://github.com/nishant/mc-packs/commit/3efcb2cdffb8928cdfd478f9beac7e71e7d7b667) | Re-marked from DONE (F58): the code is in; the rendered nameplate is pending the owner's real-client check. Earlier note: Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O17 | OPEN (F3) | [d7390b7c](https://github.com/nishant/mc-packs/commit/d7390b7c24a8b31934c1177f65eac297f5b22612), [4a9e3b85](https://github.com/nishant/mc-packs/commit/4a9e3b855a59a81fc65266798ce9388123b89852), [e7344108](https://github.com/nishant/mc-packs/commit/e73441082379cd2455b13d1b9f87ca31c9def577), [3efcb2cd](https://github.com/nishant/mc-packs/commit/3efcb2cdffb8928cdfd478f9beac7e71e7d7b667) | Re-marked from DONE (F58): the page index still loads pages it could skip (F3). Earlier note: F1 locked-stack public-menu native proof and F2 near-full routing are done. The matched one-player benchmark was 0.3069620253 -> 0.3539192399 ms/tick, not a speedup or a 40-player certificate. |
| O18 | DONE, scoped | [f38d249a](https://github.com/nishant/mc-packs/commit/f38d249a4341c9b620901c3021029fba65995563), [2b48a310](https://github.com/nishant/mc-packs/commit/2b48a3101ac2c7086c67daef4fbfd0ebbd654743) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O19 | OPEN (F70) | [b1a1e3ce](https://github.com/nishant/mc-packs/commit/b1a1e3ce5317844f3f5fbbe88b319bda04590cd4) | Re-marked from WON'T FIX (F58): the timed disconnect/break/restart window during cart creation is still open (PLAN's stash cart window). Earlier note: Seen-cart and partial-survivor code plus scoped native partial-cart proof are done. Exact timed disconnect/break/restart during cart creation is not certified; no new interruption/input framework is introduced. |
| O20 | DONE, scoped | [d7390b7c](https://github.com/nishant/mc-packs/commit/d7390b7c24a8b31934c1177f65eac297f5b22612), [58608132](https://github.com/nishant/mc-packs/commit/58608132171c0d79c228e6b3a055530381ababe0) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O21 | DONE, scoped | [46a77a3d](https://github.com/nishant/mc-packs/commit/46a77a3d4fc699002ae9684430d4060ed7c474c8) | The alleged fail-before Nether defect was not reproduced; that claim was withdrawn. The actual round-trip regression remains, without fabricated RED evidence. |
| O22 | DONE, scoped | [58608132](https://github.com/nishant/mc-packs/commit/58608132171c0d79c228e6b3a055530381ababe0) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O23 | DONE, scoped | [84d45df2](https://github.com/nishant/mc-packs/commit/84d45df2e1e1ec77fda5caddae50ec691f58ead1), [507e87ce](https://github.com/nishant/mc-packs/commit/507e87ce6a42be3238251c3836954edd94f9e270) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O24 | DONE, scoped | [abbb1624](https://github.com/nishant/mc-packs/commit/abbb1624a3a729a973ccb76a6dc06986c47ef84e) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O25 | DONE, scoped | [a7829ba9](https://github.com/nishant/mc-packs/commit/a7829ba95dcbc3e01c08475bafbbc9d0329249d7) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O26 | DONE, scoped | [9c9fec57](https://github.com/nishant/mc-packs/commit/9c9fec57a8069e8dd398b79c9b51fda7ef209575), [68ae7b92](https://github.com/nishant/mc-packs/commit/68ae7b929c7bb6ece2da67d45b1d8a9f6f27f2e3), [e6a80817](https://github.com/nishant/mc-packs/commit/e6a8081758eeac32556268c3c1c347c83d421f75), [94721f9d](https://github.com/nishant/mc-packs/commit/94721f9d1110db96cb5af322db7ac36db1038b0e) | Confirmed reset/forget generation code and nine RED/GREEN tests are done. Earlier owning-addon native proof is scoped; clock rollback remains a documented residual, not hidden. |
| O27 | DONE, scoped | [376cf33a](https://github.com/nishant/mc-packs/commit/376cf33a7c278cb0788a2e81105af9bb8cbd46f1) | Stable-API animal interactions, visitor policy and audit code are done, with scoped Claims native controls. Damage, fire, external fluids, pistons and endermen are explicitly not protected. |
| O28 | DONE, scoped | [376cf33a](https://github.com/nishant/mc-packs/commit/376cf33a7c278cb0788a2e81105af9bb8cbd46f1) | Supported native chest/barrel placement now passes both Finder cases atf2a02c57. Private ownership/isolation, marker lifetime/replacement and saved world-wide index counts pass. Simulated IDs change across restart; private real-owner rejoin is not claimed. |
| O29 | DONE, scoped | [376cf33a](https://github.com/nishant/mc-packs/commit/376cf33a7c278cb0788a2e81105af9bb8cbd46f1) | Mail limits/block/purge and Party form/command mute/cooldown are implemented. Stable2.1 has no before-chat event; ordinary chat interception is not claimed. |
| O30 | DONE, scoped | [376cf33a](https://github.com/nishant/mc-packs/commit/376cf33a7c278cb0788a2e81105af9bb8cbd46f1), [aef10dc8](https://github.com/nishant/mc-packs/commit/aef10dc8ac060539900ef83d3514ab2b321ead6c) | Real daily-limit public-command/native audit proof passed29.5s. This does not certify every storage-cap or midnight-boundary stress case. |
| O31 | DONE, scoped | [376cf33a](https://github.com/nishant/mc-packs/commit/376cf33a7c278cb0788a2e81105af9bb8cbd46f1), [aef10dc8](https://github.com/nishant/mc-packs/commit/aef10dc8ac060539900ef83d3514ab2b321ead6c), [f500cb44](https://github.com/nishant/mc-packs/commit/f500cb4478a31f8b27c2e8543dba3bd023a163b9), [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O32 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O33 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O34 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O35 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O36 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O37 | DONE, scoped | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O38 | DONE, scoped | [fc79476f](https://github.com/nishant/mc-packs/commit/fc79476fad977d0f416d8e076c47aa7f3ea8f466), [5582b32c](https://github.com/nishant/mc-packs/commit/5582b32c795a959feccd27ae497e5cb3bc33e9e2), [4a06bf36](https://github.com/nishant/mc-packs/commit/4a06bf364eaef4bab00d91ae793f318cb49cf40b), [bcf5b3db](https://github.com/nishant/mc-packs/commit/bcf5b3db56069e48e39494c6718fedcc64c3fbd8) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O39 | DONE, scoped | [fc79476f](https://github.com/nishant/mc-packs/commit/fc79476fad977d0f416d8e076c47aa7f3ea8f466) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O40 | DONE, scoped | [5582b32c](https://github.com/nishant/mc-packs/commit/5582b32c795a959feccd27ae497e5cb3bc33e9e2) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O41 | DONE, scoped | [209bd5f9](https://github.com/nishant/mc-packs/commit/209bd5f999b721e728dbe2a36c4a6e9f9d73154d), [5b9b1d42](https://github.com/nishant/mc-packs/commit/5b9b1d42786b2df0e86daba5bfbf127b4f77c8fb), [5c8e727a](https://github.com/nishant/mc-packs/commit/5c8e727ac255a0ecce734ec04bdba5feaa569950), [470f8df3](https://github.com/nishant/mc-packs/commit/470f8df3b1370e99800c931bc83a9735558a701c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O42 | DONE, scoped | [209bd5f9](https://github.com/nishant/mc-packs/commit/209bd5f999b721e728dbe2a36c4a6e9f9d73154d), [5b9b1d42](https://github.com/nishant/mc-packs/commit/5b9b1d42786b2df0e86daba5bfbf127b4f77c8fb), [5c8e727a](https://github.com/nishant/mc-packs/commit/5c8e727ac255a0ecce734ec04bdba5feaa569950), [470f8df3](https://github.com/nishant/mc-packs/commit/470f8df3b1370e99800c931bc83a9735558a701c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O43 | DONE, scoped | [1594618c](https://github.com/nishant/mc-packs/commit/1594618c785d31f9ed74c723fc6c525eebc60de8), [9961952c](https://github.com/nishant/mc-packs/commit/9961952cbaec0bab470a09f8a6b73e973381f81f), [3efcb2cd](https://github.com/nishant/mc-packs/commit/3efcb2cdffb8928cdfd478f9beac7e71e7d7b667), [7c8f0df2](https://github.com/nishant/mc-packs/commit/7c8f0df2932b874e4f1e8ce09d69547879d06d5a) | Genuine full-bundle default plus text/form bounds pass both phases. Short existing owning-addon legacy-migration and saved-operator-text controls also pass through real restarts. Bold/gold source labels and one Close do not certify PC/phone pixels. |
| O44 | DONE, scoped | [209bd5f9](https://github.com/nishant/mc-packs/commit/209bd5f999b721e728dbe2a36c4a6e9f9d73154d), [5b9b1d42](https://github.com/nishant/mc-packs/commit/5b9b1d42786b2df0e86daba5bfbf127b4f77c8fb), [5c8e727a](https://github.com/nishant/mc-packs/commit/5c8e727ac255a0ecce734ec04bdba5feaa569950), [470f8df3](https://github.com/nishant/mc-packs/commit/470f8df3b1370e99800c931bc83a9735558a701c) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O45 | DONE, scoped | [5c8e727a](https://github.com/nishant/mc-packs/commit/5c8e727ac255a0ecce734ec04bdba5feaa569950), [470f8df3](https://github.com/nishant/mc-packs/commit/470f8df3b1370e99800c931bc83a9735558a701c), [209bd5f9](https://github.com/nishant/mc-packs/commit/209bd5f999b721e728dbe2a36c4a6e9f9d73154d), [5b9b1d42](https://github.com/nishant/mc-packs/commit/5b9b1d42786b2df0e86daba5bfbf127b4f77c8fb) | Corrected owned-reload/diagnostics native control passed38s; actual metadata, pending/late reply and deletion semantics are scoped in the preserved native records. |
| O46 | WON'T FIX remaining scope | [c440f639](https://github.com/nishant/mc-packs/commit/c440f6395810a788a3875c1d1354ea42e7efa7ec) | Owner explicitly chose no new license/attribution change now. The exact future public-release checkbox is recorded in docs/RELEASE_TODO.md; no unapproved legal wording. |
| O47 | OPEN (F70, F9) | [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f) | Re-marked from WON'T FIX (F58): beds in every build mode are not done (Line only). Earlier note: Bedrock bed code and unit coverage are done; native Line accounting/undo-redo passed. All-mode physical second-input verification is not covered by the disclosed owning-addon bridge and read-only input scope. |
| O48 | OPEN (F7, F70) | [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f) | Re-marked from WON'T FIX (F58): the holder gate is open nearly all the time in survival (F7), and the idle-floor measurement was deferred by the contributor, not the owner. Earlier note: Holder gating and source/unit zero-read regressions are done. The remaining production-diagnostic idle-floor measurement is USER_DEFERRED (by the contributor), open, not an instrumentation-free or active-preview performance PASS. |
| O49 | DONE, scoped | [d61e5441](https://github.com/nishant/mc-packs/commit/d61e544196df98e29141af73cd6cfc9ee168b02f), [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f), [46364869](https://github.com/nishant/mc-packs/commit/4636486919cba60811533890b1534f0060dd0197) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O50 | DONE, scoped | [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O51 | DONE, scoped | [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O52 | DONE, scoped | [ea39ff8e](https://github.com/nishant/mc-packs/commit/ea39ff8e6929dcde6e1f61d245ff0eb268819f06), [7b5dd77e](https://github.com/nishant/mc-packs/commit/7b5dd77ee9ead783de858bb0f35d86976e11c391) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O53 | DONE, scoped | [4b7c01a3](https://github.com/nishant/mc-packs/commit/4b7c01a3f18ba64efd31cae92a5d26068409e9d0), [ea39ff8e](https://github.com/nishant/mc-packs/commit/ea39ff8e6929dcde6e1f61d245ff0eb268819f06) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O54 | DONE, scoped | [fa75e390](https://github.com/nishant/mc-packs/commit/fa75e390178e1b84a1bae680ff2ff19c50e06db3), [d61e5441](https://github.com/nishant/mc-packs/commit/d61e544196df98e29141af73cd6cfc9ee168b02f), [d6b3d848](https://github.com/nishant/mc-packs/commit/d6b3d848cc49be5c87c6a7bb0612f50f807c935b) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O55 | DONE, scoped | [537cbaff](https://github.com/nishant/mc-packs/commit/537cbaff447c2429cffc9edd6d36f801832b9207) | Server action-bar priority/listening behavior has before/after native proof. Visual prominence/placement is not a rendered-client certificate. |
| O56 | DONE, scoped | [ce34c1ab](https://github.com/nishant/mc-packs/commit/ce34c1ab0111cba0f0bbb8035c32a4101a245bb3) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O57 | DONE, scoped | [bb81fb93](https://github.com/nishant/mc-packs/commit/bb81fb931a1f276a7d303f6b6694ee962fb8aa2e), [1ff75be8](https://github.com/nishant/mc-packs/commit/1ff75be80d72126413a9066c8c8fd20a644e8ecf) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O58 | DONE, scoped | [6f85410b](https://github.com/nishant/mc-packs/commit/6f85410bf00df1a220c3378eae2179522ea07045), [653ec2fc](https://github.com/nishant/mc-packs/commit/653ec2fc6ae9ebe295181399922d6398a0b257af) | InvalidEntity guards and source regressions are implemented. Functional suite evidence is preserved; this is not a guarantee of zero warnings under all future entity unload timings. |
| O59 | DONE, scoped | [fe651846](https://github.com/nishant/mc-packs/commit/fe651846b4154b90ba84cd8c4b7fc26d68bb03d1) | One synchronized spawn helper is wired into seven consumers; source/type and relevant native cases are covered. Deliberate warn/throw paths remain visible. |
| O60 | DONE, scoped | [1659017e](https://github.com/nishant/mc-packs/commit/1659017eacb60cbc7adb53cdf28caca8061e06e4), [8ff1e461](https://github.com/nishant/mc-packs/commit/8ff1e461cefa3570db7a4163e59141299d2984f5) | Template/recipe isolation and exact-population/window rejection are implemented and checked. Invalid100 observations remain invalid, and the remaining stress windows are open (F57; deferred by the contributor, not the owner). |
| O61 | DONE, scoped | [1659017e](https://github.com/nishant/mc-packs/commit/1659017eacb60cbc7adb53cdf28caca8061e06e4), [41d3540d](https://github.com/nishant/mc-packs/commit/41d3540d3e5ddaa4c1d5e77c63ee87885bf4576d), [52504259](https://github.com/nishant/mc-packs/commit/5250425951666d93e2e6aa283a187b8eac3fff8a), [d5b75e48](https://github.com/nishant/mc-packs/commit/d5b75e48fbec627fea99643f42b51a724f24f3ed) | Real one-context bundle protocol/smoke, CI and release-order tooling are implemented. The interrupted900-second load is not promoted to a smoke/load PASS. |
| O62 | DONE, scoped | [d00a41dc](https://github.com/nishant/mc-packs/commit/d00a41dcdd676698ef7af36a8f7ac77a342127f4), [971e5533](https://github.com/nishant/mc-packs/commit/971e553325de1f3b7eb33cabb84a107ec5fe1095) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O63 | DONE, scoped | [c440f639](https://github.com/nishant/mc-packs/commit/c440f6395810a788a3875c1d1354ea42e7efa7ec) | Owner decision applied: retain all individuals, two bundles, empty standalone list, slots on and Small Realm defaults. No pack merge or Large-profile switch. |
| O64 | DONE, scoped | [c440f639](https://github.com/nishant/mc-packs/commit/c440f6395810a788a3875c1d1354ea42e7efa7ec), [a1b2a32c](https://github.com/nishant/mc-packs/commit/a1b2a32ce68eaf8568b2c44d69669bb1d95e59ef), [4bbf6df1](https://github.com/nishant/mc-packs/commit/4bbf6df1fc2bf355cb327eb13abee9d929c10b7a) | Owner approved the exact four generous finale exceptions. Values remain unchanged; the earlier missing-dependency note was historical, not a current root-check gap. |
| O65 | DONE, scoped | [f2e20ae8](https://github.com/nishant/mc-packs/commit/f2e20ae8fcab9b8c6919308cdaba4f44e8d98a19), [e40b5109](https://github.com/nishant/mc-packs/commit/e40b5109baac5b1164e4c440f5541242bb913e0d), [3efcb2cd](https://github.com/nishant/mc-packs/commit/3efcb2cdffb8928cdfd478f9beac7e71e7d7b667) | Owner acknowledged; no change requested and no repeated notices in this report. |
| O66 | DONE, scoped | [c440f639](https://github.com/nishant/mc-packs/commit/c440f6395810a788a3875c1d1354ea42e7efa7ec) | Owner policy recorded. No additional client action is requested here; actual source/hosting merge and live verification are recorded by the release handoff, not inferred from this source ledger. |
| O67 | DONE, scoped | [5413ec94](https://github.com/nishant/mc-packs/commit/5413ec948b1dfc3d9f3450027021cfef82344aa6), [7801855e](https://github.com/nishant/mc-packs/commit/7801855e50d47decd7d1099b7ea6fb6cf6ae3bce), [0e54ff14](https://github.com/nishant/mc-packs/commit/0e54ff14ea36bdba1e7bbb549d5dddd66e405788) | Source authoring/documentation is complete at the linked commits. Native acceptance is limited to the preserved case receipts and explicit item notes, not every path, timing or device. |
| O68 | DONE, scoped | [a1a4ef30](https://github.com/nishant/mc-packs/commit/a1a4ef301bc685d9293168728ecfafcd8810bd45), [70db7f4d](https://github.com/nishant/mc-packs/commit/70db7f4daa29835c1153dabaeb645119662ee812) | Server whole-line wrapping and truthful omitted-line/helper text are done with source and scoped native proof. Crowded PC/phone rendering remains O12's unverified boundary. |
| O69 | DONE, scoped | [374ce273](https://github.com/nishant/mc-packs/commit/374ce27343176786936d3954fb4c46a3769c3c1d) | Empty-radar binding/background fix and producer/toggle signals are covered. Actual disappearance of pixels remains unverified, not a headless rendering claim. |
| O70 | DONE, scoped | [26c91c05](https://github.com/nishant/mc-packs/commit/26c91c05f7b427b190635b865f9b71530ac549cc) | Original chest/barrel native marker/guide, private isolation, replacement/cancellation/lifetime proof passes. Unsupported-placement guesses were retracted; complete existing native placement semantics were used. |
| O71 | OPEN (F45) | [1917982e](https://github.com/nishant/mc-packs/commit/1917982ec31f59ee9c224debfb60104d9a62fec8), [70db7f4d](https://github.com/nishant/mc-packs/commit/70db7f4daa29835c1153dabaeb645119662ee812) | Re-marked from DONE (F58): the default-on ticker made stats_bp the one pack newly over 0.15 ms (F45). Earlier note: Personal ticker preference/default-on and realm allowance are implemented; public native controls pass with an explicit private fixture baseline. Production default was not changed to green the test. |
| O72 | DONE, scoped | [abf8fc6e](https://github.com/nishant/mc-packs/commit/abf8fc6eb09dd4274b498510a2876cccd0f95be1) | Sneak-sort/access protocol is implemented with native Claims/Stash controls. Simulated empty-hand events use the disclosed relay, not physical mouse/touch proof. |
| O73 | DONE, scoped | [351068d5](https://github.com/nishant/mc-packs/commit/351068d589312202f91cf722ceaa8213bd73aded), [70db7f4d](https://github.com/nishant/mc-packs/commit/70db7f4daa29835c1153dabaeb645119662ee812), [202874c2](https://github.com/nishant/mc-packs/commit/202874c29b38112c4b97ce817f5e1b72afc7cfc0), [d7390b7c](https://github.com/nishant/mc-packs/commit/d7390b7c24a8b31934c1177f65eac297f5b22612) | Transactional page move and opaque metadata/restart proof are done with the disclosed simulated-ID adapter. No claim of physical inventory reachability. |
| O74 | DONE, scoped | [68c15bc2](https://github.com/nishant/mc-packs/commit/68c15bc2417958881c69e0dba6389a6193ff881e) | Urgent mined-out-crater guidance and alternative-source regression shipped separately in source#95; later finite-source content/checker work remains independently recorded. |
| O75 | DONE, scoped | [6e7352ba](https://github.com/nishant/mc-packs/commit/6e7352ba3744447d88df8d40f404909933821bc1), [ce164b9e](https://github.com/nishant/mc-packs/commit/ce164b9ec609a4b1a1cdbc82b0cddc60742845ff) | Urgent server-side lifecycle/softlock fix shipped separately in source#95. Stale-answer/death/leave/dimension regression proof is preserved; no camera/respawn-screen pixel claim. |

## Deferred83 final dispositions (2026-10-20)

Every original D row is retained below, not silently dropped. Original approved no-code-change decisions remain WON'T FIX with their scope rationale. A historical formatting change without a fix SHA is not assigned an invented commit. Measurements/visual acceptance that remain unverified are explicit; loads deferred by the contributor (not the owner) are open (F57), not passes.

| # | Track / pack | Final disposition | Commit or specific no-change reason | Original finding |
|---|---|---|---|---|
| 1 | hud #6 / package.json | DONE, scoped | [c1b5dce7](https://github.com/nishant/mc-packs/commit/c1b5dce73b24b6f6af6e5f2a664103529bd2ff2f) | hud-layout / map-terrain tests not in npm run check |
| 2 | hud #12 / map_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: bytes per sender. No new correctness or performance claim. | A list whose last part never arrives stays in partial |
| 3 | hud #13 / map_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: remove only with new coverage tests. No new correctness or performance claim. | planScan/scanMemo unused, kept as the tests' reference |
| 4 | hud #15 / map_bp | DONE, scoped | [e6a80817](https://github.com/nishant/mc-packs/commit/e6a8081758eeac32556268c3c1c347c83d421f75), [94721f9d](https://github.com/nishant/mc-packs/commit/94721f9d1110db96cb5af322db7ac36db1038b0e); actual map-reset native case PASS on439c0aa6 (Map bytes unchanged in final414); epoch-backed world/player generation code and offline regressions remain scoped, with clock rollback residual. | No operator reset for map:wp / map:marks |
| 5 | hud review / map_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: wasted reads only. No new correctness or performance claim. | Fast movers' picks read twice |
| 6 | hud review / map_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Region version bump misses the east/south neighbor's shading (<= 200 ticks) |
| 7 | hud review / map_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: revisit only if a soak shows it. No new correctness or performance claim. | Stale rebuilds come in a wave every 200 ticks |
| 8 | hud review / tools/side-shared.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Lone surrogate counted as 2 bytes |
| 9 | hud review / terrain.js, tests | WON'T FIX remaining scope | Already integrated historical line-ending move; no attributable fix SHA and no gratuitous formatting churn. | Whole files moved CRLF to LF |
| 10 | hud review / perf-soak.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Retry loop added to the shared scenario |
| 11 | hud review / side-shared.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Text of only ~ / MARK now occupies a slot |
| 12 | hud review / map.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: watch in integration runs. No new correctness or performance claim. | Load flake with 2 suite jobs |
| 13 | items / harvest_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | takeSeed may take a nearby seed someone else dropped |
| 14 | items review / relics_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: documented (A). No new correctness or performance claim. | Off-hand and worn relics noticed up to 5 s late |
| 15 | items review / stash_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Quiet failing player retries on the 5 s turn, not the 2 s backoff |
| 16 | items review / stash_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Quiet stagger shifts on join/leave |
| 17 | items review / durability_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: documented (A). No new correctness or performance claim. | Armor warnings up to 2 s later |
| 18 | items review / cooking_bp | DONE, scoped | [84d45df2](https://github.com/nishant/mc-packs/commit/84d45df2e1e1ec77fda5caddae50ec691f58ead1), [507e87ce](https://github.com/nishant/mc-packs/commit/507e87ce6a42be3238251c3836954edd94f9e270) | cooking:owed written twice per cook |
| 19 | infra #15 / hosting publish-packs | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: the lead passes notes at publish. No new correctness or performance claim. | Shared-copy-only packs still need --pack-notes |
| 20 | infra #17 / test-bds server.mjs | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Template race with --jobs > 1 on a fresh cache |
| 21 | infra #18 / test-bds shim | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Relay parts can pass 2048 after re-escaping |
| 22 | infra #21 / saga-untrack.js | DONE, scoped | [7abddad8](https://github.com/nishant/mc-packs/commit/7abddad88002bc4428989a1b7cb483de8cba5266), [64228c3d](https://github.com/nishant/mc-packs/commit/64228c3deba86804408f1a732ac80331d4ba9e1e) | Waits for right4 |
| 23 | infra review / check-actionbar.mjs | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Helper detection loose; (anonymous) allowlist hides new hud/stats violations |
| 24 | infra review / check-versions.mjs | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Doesn't fetch; notes oversold it |
| 25 | infra review / check-* comment strippers | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Regex-based, a call could be missed |
| 26 | infra review / shim.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Counts UTF-16 units; only sendScriptEvent wrapped |
| 27 | saga-engine #13 / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | escortFast calls updateLabels every step on top of the 2-tick sync |
| 28 | saga-engine #19 / saga-escort.js | WON'T FIX remaining scope | [c551f18c](https://github.com/nishant/mc-packs/commit/c551f18cc83ec72347fb4112ffbd54cb898e6e3c); Rendered PC/phone proof is unavailable under the read-only client boundary; server/source work is not pixel acceptance. | Load-sensitive sampling |
| 29 | saga-engine review / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | mateElsewhere shows the Track button needlessly |
| 30 | saga-engine review / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Saga disabled: last box stays up to 15 s |
| 31 | saga-engine review / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Shared done collect step reaches a mate up to 10 s later |
| 32 | saga-content #6 / saga_bp | DONE, scoped | Owner decision c440f639/e40b5109 preserves the exact four approved exceptions. | Some finale rewards above the bible's scale |
| 33 | saga-content #7 / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Show favors pay every day for the same item |
| 34 | saga-content #16 / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | draught |
| 35 | saga-content review / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Gristle split over two objectives if the pack set changes mid-chapter |
| 36 | saga-content review / saga-hearth-packs.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Covers only one variant, no real kill |
| 37 | saga-content review / saga_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | An already spawned actor keeps Inspector Pell until it respawns |
| 38 | saga-content review / saga_bp | WON'T FIX remaining scope | Rendered PC/phone proof is unavailable under the read-only client boundary; server/source work is not pixel acceptance. | Vesna §5 reads dark on forms |
| 39 | menus #17 / settings_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Save summary's before can be stale |
| 40 | menus #19 / admin_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | A renamed nether star counts as the item |
| 41 | menus review / nick_bp | DONE, scoped | [a7829ba9](https://github.com/nishant/mc-packs/commit/a7829ba95dcbc3e01c08475bafbbc9d0329249d7) | nick:g:* grows with every visitor |
| 42 | menus review / news_bp | DONE, scoped | [f2e20ae8](https://github.com/nishant/mc-packs/commit/f2e20ae8fcab9b8c6919308cdaba4f44e8d98a19); owner acknowledgment recorded; no repeated notices or runtime change. | Owner-acknowledged Realm note |
| 43 | menus review / news_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Each tip sends realm:help_ping |
| 44 | menus review / admin_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Existing operators get the setup hint once after the update |
| 45 | menus review / titles_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | toldFull / cache keep offline entries |
| 46 | menus review / welcome_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | A literal backslash-n body always counts as changed |
| 47 | menus review / news_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | defaultTips unfiltered until the first help_ping answer |
| 48 | menus review / prefs-locks.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Before-fail not re-established |
| 49 | entities #11 / npc_bp | OPEN (O10, F70/W1, F57) | Remaining measurement/load acceptance was deferred by the contributor msftMyt, not the owner, and is open (re-marked from WON'T FIX, F58); prepared code or earlier source proof is not a completed window. | 10-tick loop 0.20 ms/tick with 12 townsfolk and 40 players |
| 50 | entities #12 / elite-approach-terrain.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Flaky positive check |
| 51 | entities #14 / elite_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | A tamed wolf's kills name no player |
| 52 | entities review / name-labels, elite, saga, atlas, domt, moon, expedition | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: far better than tagging a pet. No new correctness or performance claim. | spawnChecked/spawnFresh retries leave the real spawn untagged |
| 53 | entities review / saga_bp + labels | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Idle stray sweep for saga about every 50 s |
| 54 | entities review / name-labels | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Extra updateLabels calls advance counters |
| 55 | entities review / dolphin_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | One-way migration; no unit test of the split |
| 56 | entities review / name-labels | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Range measured from the head |
| 57 | entities review / wander-walk.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: watch in integration. No new correctness or performance claim. | Flaky 'no named witch left' |
| 58 | social-prog #14 / quests_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Placed-block memory lost on restart |
| 59 | social-prog #17 / goals_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: docs tip (A). No new correctness or performance claim. | Chest is an ordinary container |
| 60 | social-prog #21 / milestones, goals, bounty | DONE, scoped | [7aa62a34](https://github.com/nishant/mc-packs/commit/7aa62a3495d356cfa9e3e15b2d25ebe55788d699), [9349b144](https://github.com/nishant/mc-packs/commit/9349b144c80c9fd0f5d9331b93e21225c51244cb), [bb132936](https://github.com/nishant/mc-packs/commit/bb132936b3dd1efccb8bad06db4cf3eb09ee252e) | No gossip/titles from progress |
| 61 | social-prog review / party_bp | DONE, scoped | [f2e20ae8](https://github.com/nishant/mc-packs/commit/f2e20ae8fcab9b8c6919308cdaba4f44e8d98a19); owner acknowledgment recorded; no repeated notices or runtime change. | Owner-acknowledged Realm note |
| 62 | social-prog review / milestones_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | A throwing check isn't flushed that round |
| 63 | social-prog review / journal_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Full journal re-stringified every 30 s |
| 64 | social-prog review / mail_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | 'N seen most recently' can be one off |
| 65 | social-prog review / goals_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: documented (A). No new correctness or performance claim. | A folded donor starts a new count |
| 66 | social-prog review / milestones_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Index stagger shift on join/leave |
| 67 | social-world #8 / maps scenarios | DONE, scoped | [09d610c0](https://github.com/nishant/mc-packs/commit/09d610c0061b80e32205b7ca4370a8136c6cd05c) | Hooks in prose |
| 68 | social-world #13 / build_bp | OPEN (O10, F70/W1, F57) | [534e8fd9](https://github.com/nishant/mc-packs/commit/534e8fd902745e6dc11c06db5d53de5ef785742f); Remaining measurement/load acceptance was deferred by the contributor msftMyt, not the owner, and is open (re-marked from WON'T FIX, F58); prepared code or earlier source proof is not a completed window. | Preview loop 0.38 ms/tick floor under the profiler |
| 69 | social-world #14 / cleanup_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D (Phase 2 idea). No new correctness or performance claim. | Death points in memory, capped at 50 |
| 70 | social-world #16 / domt-cards.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Load flaky |
| 71 | social-world review / build_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | idleSkip coupling to loop periods |
| 72 | social-world review / domt-busy.js | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Load flaky |
| 73 | weather #13 / tornado_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D (Phase 2: a 'Ride tornadoes' pref). No new correctness or performance claim. | Spectators and AFK players are launched |
| 74 | weather #17 / rainbow-race.js | DONE, scoped | [09d610c0](https://github.com/nishant/mc-packs/commit/09d610c0061b80e32205b7ca4370a8136c6cd05c) | Hook in prose |
| 75 | weather review / tornado_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | First Slow Falling lands on the 10-tick beat; dead/elytra/re-grabbed players keep it longer; landing map in memory |
| 76 | weather review / moon_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Block list built on every world load |
| 77 | weather review / storm_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: documented (A). No new correctness or performance claim. | A strike due during a running check is skipped |
| 78 | expedition #11 / expedition_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D: only if hitches are reported. No new correctness or performance claim. | Build steps up to 25-31 ms |
| 79 | expedition #12 / expedition_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | tickTraps 0.75 ms per check |
| 80 | expedition #14 / expedition_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | A non-member logged out inside a box rejoins in deepslate |
| 81 | expedition #15 / expedition_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Every clear announced to everyone |
| 82 | expedition #16 / expedition_bp | DONE, scoped | [d00a41dc](https://github.com/nishant/mc-packs/commit/d00a41dcdd676698ef7af36a8f7ac77a342127f4) | No 'forget everything' |
| 83 | expedition review / expedition_bp | WON'T FIX remaining scope | Approved original plan section6D no-code-change scope retained: D. No new correctness or performance claim. | Pets moved to y 320 without slow falling when the spawn chunk isn't loaded; settle not rerun on join; opReset report can be stale |
