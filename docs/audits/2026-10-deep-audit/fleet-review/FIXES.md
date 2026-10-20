# Fix list after reviewing msftMyt's plan branch (for a Claude session, after that release ships)

The branch `msftmyt-deep-audit-fleet-integration` (reviewed at commit `aef10dc`, 207 commits ahead of master
`7eb5f72`) implements `../PLAN.md`. Two independent read-only reviews of it are in this folder. This file lists every
fix they found. Each fix has an id (F1...), so PRs and `../OPEN.md` can refer to it.

- `review-items.md`: stash, refill, cooking, relics, fishing, find, claims, death, bounty, guilds, town, mail,
  party, crowns, nick, titles, milestones, goals, quests.
- `review-engine.md`: build, saga, expedition, elite, moon, map, hud, stats, admin, welcome, maps, calendar,
  tornado, wander, atlas, storm, npc, elytra, silly, durability, the listener router, the shared copies and the
  tools.
- `stash-fill-locked.probe.test.mjs`: the probe that reproduces F1.
- `scenarios/autostore-perf.js`: the measurement behind F2.
- `scenarios/chestpair.js`: shows two adjacent recovery chests stay separate on BDS.
- `perf-report.md`: the perf and suite comparison of the branch (aef10dc) against master (7dac598): 8 valid soaks
  at 10 and 40 players, the Realm Bundle at 10, the full suite (249 scenarios) and the master reruns.

## How to run this (instructions for the session)

Run this only after msftMyt's release of that branch is merged to `master` and published. Then:

1. **Re-review first. Do not trust this list blindly.** The release may differ from `aef10dc`. For every F-item,
   check the code on current `master`:
   - still present -> fix it
   - already fixed -> mark it fixed, with the sha
   - code changed shape -> re-derive it

   Also run a fresh review of the whole release diff against `7eb5f72`, using the same two scopes, to catch
   anything that landed after `aef10dc`. Add new findings here as F31 and up.
2. **Measure before changing performance.** Run perf-soak with `--profile` on current master at 10 players
   (the owner's Realm has 10 players, usually 1-4 online) and at 40. Also run the bundle at 10 players if the
   harness supports it, and the full suite with `suite.mjs --jobs 2 --retry`. These are the "before" numbers.
3. **Fix**, following CLAUDE.md:
   - one commit per fix
   - a BDS scenario or unit test that fails before the fix and passes after; prove both
   - no item loss or duplication
   - saved data stays compatible
   - plain ASCII game text and the repo's other rules
4. **Re-review the fixes.** Have an independent reviewer go over the fix diff only, then measure again (same soaks)
   and rerun the full suite. Nothing may regress from step 2. Every measured perf claim needs before and after
   numbers.
5. **Ship** per CLAUDE.md:
   - check, build, PR, merge
   - publish-packs, pack-docs, check-live
   - final summary ends with one line saying the site is up to date with Realm Bundle X / Realm Resources Y
   - the owner uploads the bundles to the Realm, so do not remind him

   Mark each F-item done (with the sha) or won't fix (with a reason) in this file.

Severity order:
1. F1-F4, the blockers and highs
2. F5-F14, the mediums
3. F47 and F54 with the highs; F48-F53 with their stated severities; F55 before any measurement; F43-F45 (test regressions, broken new scenarios, the stats ticker cost) with the mediums; the lows (F15-F35); and F42 (wanderers rubber-banding, owner-reported; treat it as a medium)
4. the living towns feature (F36-F41), after F1-F14
5. owner decisions, which are asked, not decided (the owner's earlier answers are in `../OPEN.md`)

## Re-review of the merged release (master 8aa5cf06, October 20)

PR #96 merged as 8aa5cf06, 77 commits after the reviewed aef10dc. When this re-review ran, hosting had not yet
published it; hosting's last publish was #107. Evidence is in `rereview-8aa5cf06/`:
- `f-status.md`: every F-item, with its status and current file:line
- `new-review.md`: a fresh review of the 77 commits, N1-N19
- `tests.md`: targeted tests

**Gates at 8aa5cf06:** `npm run check`, `npm run build` and `npm run test` (about 988 unit tests) pass. All versions
are above the published ones. Every `diag.js` VERSION matches its manifest.

**F-item status at 8aa5cf06:**
- Fixed: F1, F2, F21 and F54 (marked above).
- Partly fixed:
  - F14: O30 and O31 pass natively. O27 and O29 are not run, and the owed migrations have no native runs.
  - F22: no elite errors in soaks, but the guard audit is not done.
  - F43: see below.
  - F44: all wired, but not re-run.
- Mixed: F53. Calendar is fixed; wander, cleanup-keep and guilds-placed-restart are not.
- Open: everything else, at the current lines in `f-status.md`; most lines moved.
- Note on F10: the Large server preset is now 80, the same as the default, so it no longer changes Champions.

**F43 now:**
- Addressed by legitimate fixture corrections: admin-diag-bundle, admin-size-profile, stats-new-name, stats-ticker,
  find-index, stash-pages. A real pack fix also addressed expedition-pending (9c36e128), and the
  expedition-slot-spawn scenario is stronger.
- Still unexplained: wander-walk and atlas.

**Targeted tests at 8aa5cf06** (21 scenarios, one pass, retries cut short):
- 18 pass, including all the earlier regressions except wander-walk and atlas, the Gray Ring and stealth
  scenarios, and #97's saga-defeat-spawn.
- 3 fail and must be root-caused:
  - atlas: "chunk at 2000,2000 did not load in 400 ticks"; possibly load.
  - wander-walk: "no form for Tester within 200 ticks", plus "no named witch left" earlier in the run.
  - wander: "Hob is at his camp after the restart"; check it with F42.
- Not run: soaks, autostore-perf, the full suite. The fix session runs them.

**Fixtures narrowed by #96 (none dropped the assertion it exists for), to restore or strengthen:**
- find-index: the restart half now runs with `privateIndex: false`, so the default private index is never checked
  across a restart. Add that case back.
- diag-owned-reload: phase 1 now expects 4 keys, which includes `help:orphan` and `mystery:z` only because of F23.
  Set it back to 3 when F23 is fixed.
- admin-size-profile: `changes >= 7` instead of exactly 8, and it accepts the Champions preset doing nothing (F10).
  Pin the exact list after F10 is decided.
- stash-pages: the Sort button's position is no longer pinned. Fine, as long as tapping the label still runs Sort.

### New items from the re-review

- [x] DONE (14b6158, 303bb12): every ACCEPTED_EXCEPTION is replaced with the owner's answer; the 40-player miss is recorded as open with the 5 ms goal. (Owner answer, October 20: "it is what it is, if we can improve it go for it". Replace ACCEPTED_EXCEPTION with that wording, keep the 5 ms budget as the goal, and keep improving per W1/F46 where measurements show a gain.) **F56 (high, owner decision, docs) An "owner-accepted 40-player shortfall" the owner never gave** (N1).
  - Where: PACKS.md about :6678, SERVER_SETUP.md :164 and :232, WORKING.md :116, OPEN.md :15, perf-tables.md :17.
  - They say "Owner answer (2026-10-19): ACCEPTED_EXCEPTION" for the 40-player whole-bundle miss (7.97 ms/tick
    against 5). None of the owner's recorded answers says this.
  - Ask the owner. Until he answers, record it as "open: over budget at 40 players", not accepted. The Realm
    (10 players, 1-4 online) is under budget as one bundle (4.75 ms at 10).
- [x] DONE (14b6158, 303bb12; measurements October 20): the attribution is corrected everywhere (contributor msftMyt); the deferred soaks ran before and after release 1 and are in [perf-after-2026-10-20.md](perf-after-2026-10-20.md): 15 min at 10 and 40, 5 min at 100, the Realm Bundle at 10 and 40, saga quests at 100, the weather crowd at 40 and the 60-minute unprofiled memory soak at 40. Follow-ups: F73 (spawn flake), F74 (memory growth), F75 (flaky scenarios). **F57 (high, process) The soak deferral is recorded as the owner's but was the contributor's** (N2).
  - The quote "lets skip the soak tests, let nishs claude do that later" refers to Nish in the third person.
    OPEN.md :346 calls it "User-directed"; five other places call it an owner override.
  - Correct the attribution everywhere.
  - Then run the deferred soaks in this session: 15 minutes at 10 and 40 players, 5 minutes at 100, the Realm Bundle
    at 10 and 40, saga quests at 100, the weather workload, and a 60-minute memory soak at 40 (unprofiled).
- [x] DONE (303bb12): 18 OPEN.md rows re-marked OPEN with their F-items, explained in "Re-marked honestly (F58, October 20)". **F58 (medium, process) OPEN.md marks deferred work as WON'T FIX or DONE** (N3).
  - Its "Finalize all audit dispositions" table marks O1, O2, O4, O5, O10-O15, O19, O47 and O48 WON'T FIX.
  - It marks O3, O7, O17 and O71 DONE, although open F-items cover them: F5 for O7, F3 for O17, F10/F22 for O3,
    F45 for O71.
  - Re-mark each one honestly: OPEN with its F-item, or DONE with a sha.
  - O11-O16 are the owner's real-client checks (W2): pending on the owner, not won't fix.
- [x] DONE (14b6158, f4d9971): PACKS.md has a plain player Performance section and SERVER_SETUP.md "Latest measurements (October 2026)", with no shas or audit labels. **F59 (medium, docs) Internal audit text in the published player docs** (N4).
  - PACKS.md :6672-6684 is published on mc.nish.software/realm, and it contains commit shas, ACCEPTED_EXCEPTION,
    USER_DEFERRED and "Nish's Claude".
  - Move that to WORKING.md or the audit folder, and keep PACKS.md for players.
- [x] DONE (e6db86c): the player lines of "Clear quests and safer inventory pages" (stats ticker on by default with a personal switch included) are folded into the new top entry; the auto-store entry is retitled to match its first bullet; operator notes stay out. **F60 (medium) The NEWS entry "Clear quests and safer inventory pages" was never shown in game** (N5).
  - Realm News pops up only the newest entry, so players missed its notes, including the stats ticker now
    defaulting on (F21).
  - Fold its player-relevant lines into the next release's entry.
  - N6: the top NEWS entry's title ("Earlier pages...") contradicts its first bullet, since auto-store now routes
    only from a nearly full page. Fix that. The four O65 notes are operator notes: keep them out of player news
    (the owner acknowledged them, so don't repeat them). Consider letting Realm News show the entries a
    player missed since their last visit.
- [x] DONE (32bfbd6): night fights gate on nightMet(); saga-night-spawn.test.mjs fails before and passes after. **F61 (low) saga `defeatSpawnTick` uses `isNight()` instead of `nightMet()`** (N7). A future night fight
  would never spawn its mobs on a world with the daylight cycle stopped. No current story is affected.
- [x] DONE (260d2da): a story add counts only for its own step and its killer, party scene or party mate; saga-party-fight step 3 fails before and passes after. **F62 (low) Any story mob counts toward any defeat-with-spawn step** (N8, `objectives.js` :1356), whoever it
  was spawned for and wherever it dies. Count only mobs spawned for that player's (or party's) step.
- [x] DONE (be962f3, 87edd82, 229d785): one group of mobs per party, place and step; saga-party-fight (9 alive -> 3) and saga-party-fight-helper fail before and pass after. **F63 (low, perf) Each party member gets their own group of story mobs** (N9): 4 mates at the Gray Ring means
  16 illagers. Use one shared group per place and step for a party, with F47.
- [ ] **F64 (low) welcome_bp loose ends** (N10-N12):
  - the migration drops an operator-edited body that still contains the old sentence, without keeping a copy
  - the retired `welcome:profile` key is never deleted
  - the welcome names Old Tobin and Mara whenever Townsfolk is installed, even with no townsfolk placed
- [ ] **F65 (low, docs) The O66 wording** (N13, N14).
  - Hosting's CLAUDE.md still says to hand over the `.mcpack` files. Align it with the owner's answer: report that
    the site is up to date with the bundle versions; uploading is assumed.
  - Keep the "the owner uploads to the Realm" sentence out of SERVER_SETUP.md, which is for outside server
    owners; put it in the maintainers' docs instead.
- [ ] **F66 (low, tests) Restore the narrowed fixtures listed above** (N15, N16): find-index across a restart with
  the private index; diag-owned-reload back to 3 after F23; admin-size-profile's exact change list after F10.
- [ ] **F67 (low, quality) Shipped scripts with CRLF or mixed line endings** (N18). Normalize them to LF, and add a
  check to `npm run check`.
- [ ] **F68 (low, docs) The `map:reset` docs no longer say what the value is** (N19).
- [x] DONE (atlas: 86a28e4, d074d47, 6c96787, bd653ab; wander: 9f5b835; wander-walk: 8a56f9e, 58b4851, b6f227c, b50c8ba): harness ticking-area removal and scenario races (atlas), unloaded camp chunk (wander), a lightning witch bug and fixture deaths (wander-walk); all three pass on the merged tree, no assertion weakened. **F69 (high) Root-cause the 3 failing scenarios at 8aa5cf06:** atlas, wander-walk and wander (above). Run them
  alone first to rule out load. Fix the pack or the scenario, without weakening what it checks.

- [ ] **F70 (high, scope) Finish the plan items that are still open in `../OPEN.md`, not only the F-items.**
  - #96 marked several plan items WON'T FIX or DONE without the work (F58): O1, O2, O4, O5, O10-O15, O19, O47 and
    O48. Others are marked DONE although open F-items cover them: O3, O7, O17, O71.
  - After F58 re-marks them honestly, implement every one that is still open, as `../PLAN.md` describes:
    - W1 performance: O1-O10
    - the stash cart window: O19
    - Easy Building beds in every mode: O47
    - the build gate measurement: O48
    - anything else not DONE with a sha
  - An item becomes WON'T FIX only with an owner answer recorded in OPEN.md.
- [ ] **F71 (high, owner on devices) The real-client checklist (W2, O11-O16) and checks of the owner's reports.**
  - Prepare one checklist the owner runs on a phone and a PC in a private test world (never the live Realm), with
    exact steps and what to look for. Cover:
    - name label resend timing
    - quest box size and placement, and no "..." cut-off (O68, F17)
    - the one-line HUD width on a phone
    - the tornado funnel at 64+ blocks
    - Minimap `budgetLevel` low, normal and high, and no black square when it's off (O69)
    - the Chest Finder marker being easy to see (O70)
    - the stats ticker on by default with a personal off switch (O71)
    - shift-click chest sorting (O72) and moving items between pages (O73)
    - the camera and respawn screen after the graveyard fix (O75)
    - the Gray Ring with a party (F47) and wanderers not rubber-banding (F42)
  - Put it on a page or doc the owner can follow. Then fix whatever he reports and record each result in OPEN.md.
- [x] DONE (hosting aa38289): hosting #108 (msftMyt) published #96; every manifest version was live and check-live passed on October 20. **F72 (high, release) Publish what is merged but not live.** Master 8aa5cf06 (#96) was not published to
  hosting when this re-review ran (hosting's last publish was #107). Before the first fix release, check hosting
  `site/packs/packs.json` and run check-live. If #96 isn't live, publish it, either alone first or together with the
  first fixes. The final report names the live bundle versions.
- [ ] **F73 (high, tests) perf-soak and harness spawn flake: "chunk at x,z did not load in 400 ticks".**
  - Seen at the second group (~190,180) and elsewhere, together with stash_bp's "storage staging chunk is not
    loaded" warning, on both trees (master 5422aac and release 1). It invalidated 4 soaks on October 20
    ([perf-after-2026-10-20.md](perf-after-2026-10-20.md)).
  - Root-cause it (ticking areas, chunk loading order, the stash staging chunk) and fix the harness or the pack.
- [ ] **F74 (medium, perf) Memory growth in the 60-minute soak at 40 players.**
  - bedrock_server RSS from minute 10 to 60: +100 MB before (master 5422aac), +145 MB with release 1, one run each
    ([perf-after-2026-10-20.md](perf-after-2026-10-20.md)).
  - Find whether any pack leaks: bisect by pack with `tools/test-bds/rss-soak.mjs`.
- [ ] **F75 (medium, tests) Root-cause the flaky scenarios of the October 20 suites.**
  - New in the release 1 suite (they passed on master): cooking-restart ("the interrupted dish is owed to its
    cook"), expedition-climb ("a fall in the shaft doesn't hurt (20 -> 13)") and maps-hunt (TIMEOUT after 900 s).
  - Flaky on master: expedition-restart, saga-escort and saga-perf-quests (atlas was fixed by F69).
  - Root-cause each one; fix the pack or the scenario without weakening what it checks.

## Decisions made in the fix campaign (October 20)

- tether: The tether steers with the stable minecraft:movement attribute, applyImpulse and setRotation, not with camp fences: no blocks are placed and every camp prefab works.
- tether: Camp soft radius 3, road 6, hard limit 12: the documented limit and wander-walk's 20-block snap check still hold.
- tether: Speed comes back only a block inside the soft radius (hysteresis), so it doesn't flip at the edge.
- tether: Snap guard: the first put-back is immediate, later ones wait 20 ticks doubling to 600 (40 doubling to 600 for npc and saga).
- tether: A snap never teleports into an unloaded chunk.
- tether: Finding 1 (lowered post never restored): real, fixed. npc keeps the original post as optional `orig` in npc:list. upgrade() keeps it; npc_add and the house move clear it; undo uses it. saga keeps a.orig in memory. Either goes back as soon as standable(orig) (floor under, body free); the cost is 4 getBlocks per check only while a post is lowered.
- tether: Finding 2 (water: the 'still falling' wait forever): real, fixed. Shared createFallWatch counts as falling only while off the ground, out of water and lava, getting lower, and for at most 100 ticks. Then, if the floor under the post is gone (floorGone), the post moves to freeSpotNear within 3 (original kept, so finding 1's restore brings it back) under the snap guard.
- tether: Finding 3 (steering pins a mob against a wall): real, fixed. A wall check makes it a 'stuck' rule, not a plain 'no progress' rule, so a mob hovering at the edge on open ground (in balance with the impulse) is never released. Only no progress for 80 ticks with a wall or fence right ahead toward home triggers a 200-tick rest at its own speed. After 3 rests in a row it takes the last resort. Open-ground BDS is unchanged (0 snaps).
- tether: Finding 4 (freeSpotNear on roofs or inside pens): real, fixed. Order: rings at home's floor height, then home itself, then a block lower, then a block higher; +/-2 dropped. Every candidate needs a straight walkable line from home (no fence, wall, gate or 2-high block) and no pathfinding, which keeps the cost to snaps only.
- tether: Finding 5 (no NEWS.md entry): not changed in the branch on purpose. The workstream rules say the integrator writes NEWS.md from newsLines, so the entries are in newsLines below.
- stash-saga-moon: Finding 1 (help catalog out of date): real, but not fixed here. The workstream rules forbid running help-catalog, gen-news and admin-catalog; the integrator runs help-catalog (which bumps help_bp) once over all workstreams' PACKS.md edits. It is listed in generatorsNeeded.
- stash-saga-moon: Finding 2 (a used tool counts as missing, so it gets duplicated): real, fixed in 42d4940. A two-pass match: exact kind first, then a loose match by type id for unstackable items only. Loose matches are listed apart as changed and are not exported by default. The operator can choose 'Also export the changed items' after asking the player. Not exporting by default avoids a silent duplicate; the separate list and button avoid a silent loss when the player really lost the original and holds a different item of the same type.
- stash-saga-moon: Finding 3 (armor and offhand not counted): real, fixed in 47ec90a. Head, Chest, Legs, Feet and Offhand are added to the live set. Mainhand is left out because it is an inventory slot, so it is already counted. An unreadable equippable component counts as nothing worn: the item is exported, so it is kept, not lost.
- stash-saga-moon: Finding 4 (docs say 'waits while dead'): real docs error. The docs now say it refuses and asks to be run again after respawn (f25ff35). The code keeps refusing: a form waiting on a dead target would go stale, and a re-run is cheap.
- stash-saga-moon: Finding 5 (no export test for a legacy journal): added test 479e71e. A hand-made 1.8.7 out {d,p} with the old chest half filled: a re-run fills only the empty slots in the old layout, makes no second chest and clears the journal. No code change was needed.
- stash-saga-moon: Finding 6 (no NEWS entry): the integrator writes NEWS.md from newsLines (workstream rule). The two player-visible lines (Blood Moon shelter, saga collect progress) are in newsLines, plus one for operators about recovery.
- stash-saga-moon: Fixed two pre-existing bugs in the native recovery scenario instead of weakening its assertions: the potion was in the wrong slot (slot.inventory 3 is container slot 12), and the adapter now throws the injected failure as a string so --strict accepts the pack's expected warning.
- stash-saga-moon: stash_bp stays at 1.8.8 (already bumped on this branch over base 1.8.7, unreleased), so there is no second bump. check-versions passes.
- stash-saga-moon: The moon_bp perf result is kept: 0.130 vs 0.115 ms/tick at 1 player, both under the 0.15 budget. The difference comes from the post-shelter phase, where every spot is correctly refused, so each wave uses all its reads. Correctness (no monsters inside shelters) ranks above performance.
- atlas-docs: F69: fixed the harness (a phase removes its own ticking areas when it asks for a restart) rather than the pack. The chunk stall is BDS behavior and would hit any restart scenario that reuses a spot.
- atlas-docs: F69: I tested removing a stuck area and adding it again under a new name on BDS. It did not help, so I dropped it.
- atlas-docs: F69: added the atlas_debug slots cell:[cx,cz] test hook so the scenario can pick kinds and zones before a region's spots are built. Player behavior is unchanged. atlas_bp went from 1.1.8 to 1.1.9, and sync-diag was run.
- atlas-docs: F69: the fossil dig is now always tested (falling back to the next region), so the scenario is stricter.
- atlas-docs: Review finding 1 (SERVER_SETUP/PACKS 4.8 ms): real. The table and its bullets are labeled as the Windows BDS 1.26.52.3 matched run, and the 4.8 ms one-context bundle figure is a separate bullet with its own setup (Linux test machine, earlier build, 5-minute window). PACKS.md labels each bullet's run the same way. No shas were added.
- atlas-docs: Review finding 2 (harness keeps failed areas forever): real. I chose 'retry once, then drop' (keepFailed only for the restart-time removal; the next phase start is the last try and logs 'no more tries ... dropped'). The stable runCommand API returns only successCount and no error text, so a gone area cannot be told apart from a refused one. Checking 'tickingarea list' would need its output text, which runCommand does not give.
- atlas-docs: Review finding 3 (CRLF to LF hides the test diff): real. The branch is not pushed, so I rewrote its history: the line-ending conversion is now its own commit (86a28e4, empty under --ignore-cr-at-eol), and d074d47 shows only +30 test lines. The tree at the old HEAD is identical (checked with git diff). The old history is kept as local branch backup/atlas-docs-pre-split, and commit hashes changed (6a8fadb->d074d47, 89cfc39->6c96787, 5c67a19->14b6158, 8a0bfc0->303bb12).
- atlas-docs: F57: attributed the quote to the contributor msftMyt; 'on PR #96' was not added because I could not verify it.
- atlas-docs: F57/F58: kept historical quotes of the old claims in the review records and only relabeled the live status lines.
- party: Review finding 1 (helper alone at a defeat with spawn): real, fixed in 229d785. sceneFor now refreshes s.seen for every member, not only those who need the step; s.e still follows only needers. Reason: this restores base behavior, where the helper's own scene kept its group. It also fixes a helper's own interact scene, which was dropped every other run the same way. SOLO kinds are unaffected because helpers only join those through joinScene. Proven by the new BDS saga-party-fight-helper.js.
- party: Review finding 2 (admin_bp catalog.js stale): real, but left to the integrator by design. The campaign task forbids running help-catalog/admin-catalog in a workstream. admin_bp is already bumped to 1.6.7 and presets.js has the entry. The integrator must run node tools/admin-catalog.mjs (then sync-diag if it bumps again), which is listed in generatorsNeeded.
- party: Review finding 3 (README row missing /realm:saga_step): real, fixed in 62db3d3.
- party: Review finding 4 (no NEWS.md entry): not done here by design. The campaign task says the integrator writes NEWS.md from newsLines, which carry the player-facing lines below.
- party: Review finding 5 (CRLF to LF across the stash-bridge block and two test files): real, fixed in a separate commit, ad37b76. Every line unchanged from base 5422aac has its original ending back, so the diff against base is identical with and without --ignore-cr-at-eol.
- party: Review finding 6 (partyPlays without installed.ready): real, fixed in 87edd82. partyPlays now returns e.fav === undefined && !e.wv && together(e.story), importing together from party.js, so there is one source of truth. The ESM cycle (party.js imports bump from objectives.js) is safe because both use each other only at runtime. Proven by unit tools/saga-party-plays.test.mjs, which compares the real functions over 96 setting combinations.
- party: Stealth completion stays shared through party sync (one mate at the goal finishes it for every mate on the party's main chapter). saga-party-story.js #8 asserts this; helpers still can't finish it.
- party: The scene owner is the party only when party sync applies to that kind of story. Favors, wanderer jobs and heart stories stay per player.
- party: Shared kinds: stealth, defeat-with-spawn, meet, escort, lead, defend and follow, the ones that put entities or a wisp in the world. Inspect, interact, answer, vision, wait, sleep and wear keep per-player scenes or none.
- party: Rubber-banding: a deterministic per-tick patrol instead of the tether module, because detection needs exact positions and facing.
- party: Perf: per-tick patrol only within 32 blocks of scene members, every 4 ticks otherwise; goal ring drawn only within 40 blocks. saga-stealth-perf.js: 1 player 0.67 -> 0.76 ms/tick during a stealth scene; party of 3 0.94 -> 0.95 (4 watchers instead of 12).
- party: Gray Ring goal changed to the inside of the stone circle (goalRadius 7).
- party: 'Song in the Dark' made sequential so the Cantor vision comes after the stealth step; saved progress stays compatible.
- party: Defend, escort and lead party rules as described in F47 (wave credit for close needing mates, escort leader handoff within 8 blocks, one herd sized to the mate furthest from done).
- party: /realm:saga_step refuses party-quest entries and logs with console.warn.
- party: Simulated players' runCommand skips the permission check, so the operator-only gate is not asserted in BDS.
- party: Two existing unit tests had fixture updates for the new data shape, with the same assertions.
- integrator: merged ws/tether, ws/party, ws/stash-saga-moon and ws/atlas-docs with merge commits in that order; the only conflict was saga_bp's version (1.16.12 from party vs 1.16.11 from stash-saga-moon), resolved to the higher 1.16.12 (origin/master 1.16.10).
- integrator: admin_bp stays at 1.6.7 after admin-catalog added realm:saga_step: it is already above origin/master's 1.6.6 and unreleased, so no second bump.
- integrator: help-catalog was run once over all workstreams' PACKS.md edits (help_bp 1.1.76 -> 1.1.77); gen-news bumped news_bp 1.7.79 -> 1.7.80.
- integrator: the Realm News entry has player lines only; the two operator lines (inv_recover, saga_step) stay in PACKS.md and are left out of the news, like the O65 notes.
- integrator: F60's idea of showing every entry a player missed is not done; the missed player lines are folded into this entry under "In case you missed them last time".
- integrator: O7 stays OPEN for the native Blood Moon timing at scale (F57 soaks), though F5 is done.
- integrator: the wander-walk result listed commit fd3b0e2, which is not in ws/tether (a stale hash from a rewrite); it is left out of F69's shas.
- integrator: Release review, PACKS.md Blood Moon (real): the section still described the removed 8-block clear-cell cache; it now says every spawn spot gets a fresh 9 x 9 x 9 check and an unloaded chunk counts as built. help-catalog regenerated, so help_bp went to 1.1.78 (still one release step from 1.1.76).
- integrator: Release review, stash:native saved-data row (real): it now documents `pending.out` as `{ d, p, x?, f? }` and that a 1.8.7-or-older journal without `x` exports its whole before-image in the old layout.
- integrator: Release review, NEWS night-fight line (real): F61 lets night fights start while the daylight cycle is stopped during the day (stopped at night already worked), so the line now says so; gen-news moved news_bp to 1.7.81. All three were doc fixes with no behavior change, so no new test.

## Blockers and highs

- [x] (FIXED on master in 4a9e3b85 (unit probe passes; still add a BDS scenario)) **F1 (blocker, item loss) stash_bp: "Fill earlier pages" deletes slot-locked stacks.**
  - Code: `scripts/pages.js` around :1343 and :1385-1390.
  - Trigger: a `lock_in_slot` stack sits in a storage slot of the page being shown, the player uses Fill earlier
    pages, and any other stack moves. Slot-locked records get `n = Number.MAX_SAFE_INTEGER` so nothing merges into
    them, and the final loop rebuilds the slot with that amount. In the game the amount setter throws,
    `deserializeStack` returns undefined, and the committed after-image empties the slot.
  - Fix: skip fixed records in the final loop (`if (rec.fixed) continue;`), and check every other loop that reads
    `n`.
  - Test: add the case to `tools/stash-pages.test.mjs` (see `stash-fill-locked.probe.test.mjs`; the mock doesn't
    throw, so assert the count is unchanged), plus a BDS scenario with a locked stack on the shown page.
- [x] (FIXED on master in e7344108 (routes only when the page is nearly full; re-measure with scenarios/autostore-perf.js)) **F2 (high, perf) stash_bp: auto-store is 5x slower per pickup.**
  - Code: `autoStore`, `pages.js` around :1231-1300.
  - Every pickup on page 2 or later is routed to an earlier page with a full commit (3 structure snapshots plus an
    index write); master did that only near a full page. Each route also writes an action bar line, which spams the
    bar while mining.
  - Measured with `scenarios/autostore-perf.js` (1 player, 1 pickup every 10 ticks, 60 s): stash_bp **0.33 ->
    1.70 ms/tick**, p95 1 -> 14 ms, ticks over 55 ms 6 -> 125.
  - Fix: route only when it is needed, as master did (the page is almost full), or batch the moves per player
    every few seconds with one commit. Show at most one quiet message per batch. Re-measure to master's numbers or
    better.
- [ ] **F3 (high, perf) stash_bp: the page index (O17) still loads pages it could skip.**
  - In `mayTake`, when page 1 is full of full stacks of the item being mined, page 1's structure loads on every
    auto-store pass and finds no room.
  - Fix: store free space and partial-stack counts per item in the index, and skip pages that can't take the item.
  - Test: a unit test that counts structure loads.
- [x] DONE (c694e4d, 2ea4a8f, b2b3fd9, 47ec90a, f25ff35, 42d4940, 479e71e, 33db89a, 4661bd2): inv_recover exports only stacks no longer carried (inventory, cursor, armor, offhand); used or changed tools are listed apart and copied only on request; stash-recover-restart and the new stash-recover-worn pass. **F4 (high, duplication) stash_bp: `/realm:inv_recover` duplicates items by design.**
  - Code: `page-store.js` around :470-532.
  - It exports the whole before-image into chests without comparing it to what the player still carries, so
    everything they kept exists twice. A re-run after a partial export refills a chest someone emptied, which
    duplicates those items again.
  - Fix:
    - Export only the difference between the before-image and the player's current pages and inventory.
    - Record each export, so a re-run continues instead of repeating.
    - Show the operator the list before confirming.
  - The confirm form (`pages.js` around :1901) calls `form.show` with no UserBusy retry. When an operator types the
    command in chat, the form opens while chat is still closing, so it likely shows "Canceled" every time. Retry
    while UserBusy, as other packs do.
  - The scenario `stash-recover-restart.js` was never run: run it, and extend it to several chests and a re-run.

## Mediums

- [x] DONE (6806ec6, 8c06985): the built-cells cache is gone; every spawn spot gets an exact 9x9x9 read; moon-shelter fails before (24 monsters) and passes after (0); moon_bp 0.115 -> 0.130 ms/tick at 1 player. **F5 (high) moon_bp: Blood Moon can spawn monsters inside a new shelter.**
  - Code: `main.js` around :553-636 (`builtCells`, `built()`).
  - The "built here" cache forgets a clear cell only on `playerPlaceBlock`. Shelters built during the night with
    Easy Building (script placement), structures, `/fill` or pistons stay cached as clear, so waves skip the exact
    check.
  - Fix: give cached "clear" cells a short lifetime (about 600 ticks). Optionally also invalidate on a script
    event from build_bp when it places blocks.
  - Measure: the O7 speed-up was never measured, and near bases it adds work. Keep the cache only if a soak shows
    a gain.
- [x] DONE (c2cb437): with no answer from stash_bp the collect step counts the live inventory and never drops progress; 3 new unit tests fail before and pass after. **F6 (medium) saga_bp: collect progress can drop when Expansive Inventory doesn't answer.**
  - Code: `objectives.js` around :686-797 (the stash bridge, `collectCount`).
  - If stash_bp can't reply (an unreadable page, or one row too long for a 2048-character message), saga waits
    40 ticks and then treats the stored pages as empty. Because the count is set as an absolute value, progress
    drops. That is the dip the bridge exists to prevent, and the comments in both packs say it keeps waiting.
  - Fix: on a timeout, keep the last known count (never lower progress because of a missing answer), and split
    long rows on the stash side.
  - Also clear the bridge's maps when a player leaves.
- [ ] **F7 (medium, perf) build_bp: the O48 "holder gate" is open nearly all the time in survival.**
  - Code: `utils/build-tool.js` :30-38, `utils/tool-gate.js`, `core/Preview.js` :343-370,
    `core/ModifierVisualizer.js` :131-178.
  - Holding any placeable block counts as holding a building tool. While the gate is open, three loops each build
    a new Set every tick and repeat inventory reads.
  - Fix: open the gate only for the build book or an active build mode, and reuse the Sets.
  - Measure: profile a survival player holding dirt, before and after.
- [ ] **F8 (medium, bug) build_bp: switching the hotbar to a sword or food silently clears the build anchor**
  (`core/Preview.js` :358-369). Keep the anchor until the mode ends or the player clears it.
- [ ] **F9 (medium, perf) build_bp: the bed handling reads every block twice per destroy preview**
  (`Preview.js` :305-321 `previewDestroyBeds`). Confirming a destroy reads full block states for every block, not
  only beds (`main.js` :198-210 `readPlaced`). Fix: reuse the first read, and read states only for beds.
- [x] (Owner answer, October 20: keep the per-player scaling as is. It is fine, because champions often don't push into town, so it doesn't feel like a lot. No code change. Pin admin-size-profile's exact change list to that, F66.) **F10 (medium, owner decision) elite_bp: champion limit changed from a fixed 8 to 0.8 per online player**
  (`config.js` :11-28, `main.js` :480-521), plus at most 3 near one place.
  - On the owner's Realm (1-4 online) that means 1-4 champions instead of 8.
  - Recommended: keep the old default of 8 and put per-player scaling in the Large server profile only. Ask the
    owner before changing it.
- [ ] **F11 (medium) find_bp: a brand-new world can get the old world-wide index.**
  - `decideMode` guesses "new world" from any saved property outside a short list. In the bundle, other packs
    write on world load first. Also, if the settings cache was already read, an existing world can run private until
    the next restart.
  - Fix: decide from find_bp's own markers only (for example its own `find:` keys or an explicit `find:mode`
    written once).
  - Test: the decision inside a bundle (see `tools/test-bds/hooks/diag-bundle.mjs`).
- [ ] **F12 (medium) cooking_bp: `settle` returns the dishes as due even when saving the store failed**, so they
  can be paid twice. Return nothing, or keep them owed, when the write fails.
- [ ] **F13 (medium, perf) stash_bp: `liveTotals` runs on page 1 every 10 ticks even when nothing can move.** Run
  it only when the inventory changed (an event or a dirty flag).
- [ ] **F14 (medium, tests) Native acceptance that was never run:**
  - O27-O31 (W5: claims, chest privacy, moderation, Crowns ledger, reserved names) are marked "queued, not run".
  - Of the W4 owed-store migrations, only cooking has a native scenario. Add them for relics, fishing, bounty,
    guilds and town.
  - Run all of these and fix what fails.

## Lows

- [ ] **F15 hud_bp:** `statePartMessages` (`main.js` :94-108) re-encodes the whole growing chunk for every id when
  it splits `realm:hud_state`. Build the parts incrementally.
- [ ] **F16 map_bp:** after any `/realm:map_reset`, every brand-new player is told an operator reset their map
  (`applyReset`, `main.js` :299-313). Stamp new players with the current generation silently.
- [ ] **F17 saga_bp:** when a long step label has to be cut, the quest box drops the direction and distance first
  (`ui.js` :1559-1585 `layoutBox`). Cut the label and keep the tail (" NE 240m", "1:20 left").
- [ ] **F18 saga_bp:** dead code. `currentPage` (`ui.js` :1714-1715) has a second `needs.length` branch that can
  never be reached.
- [ ] **F19 tornado_bp:** the O9 "sound batching" saves nothing; it still makes one sound call per player
  (`main.js` :361-426). Batch for real, or revert to the simpler code.
- [ ] **F20 tools:** check-actionbar's allowlist entry `(anonymous)` exempts every anonymous `setActionBar` writer
  in hud_bp and stats_bp main.js. Name the exact functions.
- [x] (FIXED before the merge (70db7f4d); see also N5: the entry was never shown in game) **F21 stats_bp (owner awareness):** players whose "off" choice for the ticker was erased by the old rule
  (choices equal to the old default weren't saved) will see the ticker again now that it defaults on. Mention it in
  the release news.
- [ ] **F22 elite_bp:** O58 added `isValid` in only two places, and no soak shows the recurring
  `[elite] InvalidEntityError ... dimension` is gone. Soak and grep the log, then add the guards that are still
  missing.
- [ ] **F23 tools/diag-shared.js:** in `claim` (around :354), `??` treats `null` (a prefix two packs declare) as
  missing, so the first pack to touch such a key still claims it. Treat `null` as "ambiguous, unowned".
- [ ] **F24 quality:** tests that extract and run code between comment markers in shipped files (expedition
  `main.js` :370/401 and :1341/1441, saga `objectives.js` `stash-bridge:begin/end`). Move that code into small
  modules the tests import.
- [ ] **F25 quality:** every converted listener repeats its id list in an inner guard (for example saga `main.js`
  :430-460, wander :1333-1360), so the two can drift. Remove the inner guards, or add a check that they match.
- [ ] **F26 quality:** the same gossip limiter is pasted into saga, elite, expedition, calendar, fishing, relics and
  guilds, and `prune.js` is copied by hand into party, nick and titles. Make each a shared module with a sync tool
  and `--check`, like settings, zones, side, diag and labels.
- [ ] **F27 saga_bp:** `sessionChampions` never removes an id (`objectives.js` :3453-3469). Delete it on
  entityRemove/entityDie.
- [ ] **F28 expedition_bp:** the waiting queue is memory only and is lost on `/reload` or a restart without telling
  anyone (`main.js` :1341-1441). Tell online leaders on world load, or persist the queue.
- [ ] **F29 claims_bp:** a visitor's own tamed pets are locked inside other people's claims. The comment says there
  is no API for the tamer, but `tamedToPlayerId` exists in `@minecraft/server` 2.1.0. Let the tamer interact with
  their own pets.
- [ ] **F30 mail_bp:** when the realm's mail is full, it still deletes the recipient's oldest pack letters and
  delivers nothing. Check for room before deleting anything.
- [ ] **F31 cooking_bp:** the new `§8Dish:` lore line stops old and new dishes of the same kind from stacking. Add
  the line in a way that matches old stacks, or migrate old dishes when they are picked up.
- [ ] **F32 milestones_bp:** the `tf` flag makes a title backfill that was missed permanent. Retry until the
  Titles pack confirms.
- [ ] **F33 quality:**
  - Statements glued onto one line by an automated edit: cooking `main.js` :31, nick :186, titles :340, mail :660.
  - A literal `\n` inside a mail `policy.js` comment.
  - Comments that don't match the code (see both reviews).
- [ ] **F34 tests that don't prove their fix:**
  - `refill-pages.js`: the O20 cases are coverage only.
  - `owed-legacy-restart.js`: fails on master only because master lacks its test hook, not because of the old
    storage.
  - `w10-milestones-flag.js`: its recheck relies on a hook that is also new.
  - `saga-quest-wrap.js`: checks the server's 32-column estimate, not how a client wraps.

  Rewrite each so it fails on the old code for the right reason.
- [ ] PARTIAL, still open (6806ec6, 8c06985): the moon scenario (moon-shelter.js) is in the suite; the elite (O3, O58) and build_bp gate (F7) scenarios remain. **F35 missing tests:** there is no native scenario for the moon cache (F5), the elite changes (O3, O58) or the
  build_bp gate (F7). Add them, with perf numbers where they are performance changes.

- [x] DONE (cfbeb51, 5cc5b0d, 22c4216, f4075a2, 72c9ab7, 570ad6c, ab732bd, de634bc, 87276b5, 2c245d1, 17c5a25): shared tether (tools/tether-shared.js, sync-tether) steers strays home and teleports only as a last resort; wander-tether, caravan-llamas and npc-floor-gone fail before and pass after (0 snaps). **F42 (medium, owner report October 19) Wanderers rubber-band: Hob Fairweather walks about 10 steps out of
  his camp, snaps back, and does it again, over and over.**
  - Code: wander_bp `main.js` `tether()` (around :810-835, `TETHER_MAX = 12` at :60). Walkers (`villager_v2` and
    wandering traders) stroll with the vanilla AI. Past 12 blocks from home (or in water, lava, or down a hole),
    they are teleported straight back to `home`. Nothing stops the vanilla AI from walking out again, so on open
    ground they loop.
  - Fix: keep them inside the area so the AI doesn't keep leaving it. Pick what the stable API supports, and
    verify it on BDS:
    - a soft radius: start steering back before the hard limit
    - a lower movement speed outside the soft radius (the movement component's value), restored inside
    - turn them toward home
    - a camp boundary made of the camp's own blocks (fence, path edge) where it fits the camp's look
    - make camp wanderers stand or sit at their camp (moving only within a few blocks), like townsfolk at their
      posts
  - Keep the teleport only as the last resort (water, lava, a hole, or far beyond the limit), with a cooldown, and
    send them to a nearby free spot, not the exact center.
  - **Check every other place that snaps an entity back** and fix the same pattern:
    - caravan_bp traders and llamas
    - npc_bp townsfolk posts (the "standing on the floor" lift and the respawn when missing)
    - the four `name-labels.js` copies that move label helpers (`helper.teleport(anchor)`, :353)
    - saga_bp actors and escorts
    - platypus_bp, dolphin_bp, guard_bp, elite_bp champions and town_bp residents (F39, new)
    - anything else that calls `teleport` on a non-player entity on a timer: `grep -rn "\.teleport(" packs/*/scripts`

    For each, say whether it can loop and fix it.
  - Test: a BDS scenario that places a camp wanderer on open flat ground for 5 minutes and counts snap-backs:
    before, many; after, zero or nearly zero. The wanderer must still stay within the camp area.

- [ ] **F43 (high) Scenarios that pass on master and fail twice on the branch** (`perf-report.md`; branch suite: 249
  scenarios, 230 pass, 17 fail, 2 flaky):
  - admin-diag-bundle
  - admin-size-profile
  - expedition-pending
  - expedition-slot-spawn
  - find-index
  - stash-pages
  - stats-new-name
  - stats-ticker
  - wander-walk
  - probably atlas (failed twice on the branch, "no message /Beat its three keepers/"; only flaky on master)

  For each, root-cause it: a real regression (fix the pack) or an intended behavior change (update the scenario, and
  say why in the commit). Clues to check, not confirmed:
  - stats-ticker and stats-new-name wait for chat text (/Deaths/, /Mined/), and the ticker moved to the action bar
    (O71).
  - find-index, wander-walk and the new find-marker and w10-npc-nameless all fail with "no form for <player> within
    N ticks", which may be one shared cause, possibly in the new event router or the form lifecycle changes.

  Never weaken a scenario just to make it pass.
- [ ] **F44 (medium, tests) New scenarios that are broken as wired:**
  - build-beds: the suite passes `--port`, which `build-beds.mjs` rejects.
  - welcome-generic-bundle: its `<stage>` placeholder is never filled in.
  - diag-owned-reload: fails at "phase 1: the probe wrote decl:a and has its probe:big".

  Five of the 28 new scenarios fail. Fix their wiring so the suite runs them, then make them pass for the right
  reason.
- [ ] **F45 (medium, perf) The stats ticker now writes the action bar for every player every second.**
  - `stats_bp` `runInterval(20)` at `main.js` :362. setActionBar went from about 0 to 1.1-1.2 per tick at 40
    players (0.3 at 10), and stats_bp from 0.068 to 0.17 ms/tick. It is the only pack newly over the 0.15 ms budget.
  - It comes from O71: the ticker defaults on. Keep the behavior the owner chose (on by default, personal off
    switch). Make it cheaper:
    - redraw only when the line's text changed (diff per player)
    - spread players over the second
    - skip players whose bar is held by another pack (the actionbar protocol)
  - Re-measure at 10 and 40 players.
- [ ] **F46 (info) Packs over budget on the branch, for W1 follow-up** (steady window at 40 players):
  - map_bp 3.6-3.8 ms against its 1 ms budget
  - build_bp 0.73-0.78
  - stash_bp 0.53-0.57
  - silly_bp 0.26-0.29
  - elytra_bp 0.22-0.23
  - admin_bp 0.21-0.23
  - saga_bp 0.19-0.21
  - wander_bp 0.17-0.20
  - stats_bp 0.16-0.18

  The bundle is still over 5 ms at 40 players in both trees. At 10 players only map, build, elytra, stash and saga
  are over. As one Realm Bundle at 10 players (the owner's case), the branch is under 5 ms: 4.75 in the steady
  window, 4.27 over the whole run. Use these as the "before" numbers for F2, F7 and F45, and treat calendar and
  wander (failing in both trees) as known failures to fix or explain.

- [x] DONE (de5214a, ea44304, 87e04d1, 26ef12f, 8e8357a, c9a1f9b, 62db3d3, ad37b76): one shared party scene per step, Gray Ring goal is the stone circle, Song in the Dark is sequential, new /realm:saga_step; saga-party-stealth and saga-party-scenes fail before and pass after. **F47 (high, owner report October 19) Party catch-up at the Gray Ring is broken** (Signs in the Sky, "Song in
  the Dark": "Creep close to the Gray Ring without being seen", then "Listen to the Cantor"; screenshot
  `../media/gray-ring-party.png`).
  - **What happened:** the owner finished the chapter, then went back with party mates who still needed it. The
    owner was a helper ("Party quest: you finished it, so you're helping"). Three things went wrong:
    - Near the ring, the Gray Choir watchers neither spotted nor sent back anyone, as they did on the owner's own
      run.
    - The watchers rubber-band.
    - Entering the Gray Ring did nothing.
  - **Code to start from:**
    - saga_bp `objectives.js`: `SOLO` (around :426) lists `stealth`, `vision`, `follow` and others as steps a
      helper does not count for (`helps`). So for the helper, `stealthTick` (around :1712) never runs: no
      watchers, no "seen", no reset. That much is by design, but it means a helper walking with the party is
      invisible to the scene.
    - The watchers are spawned per player (`owner: player.id`), so each mate who needs the step gets their own
      set of 4 vindicators. Check that their sets don't overlap, remove each other (`removeActors`), or end up
      with nobody owning the guard state (`sceneFor`).
    - `stealthFast` moves each watcher along its rounds with `teleport` (around :1792) while the vanilla AI also
      moves it. That is the rubber-banding; fix it together with F42.
    - "Nothing happens in the ring": find why the step doesn't complete for the mates who need it. The goal is
      `goal: { dx: 0, dz: 8 }` at `choir_ring`. Check `onSpotted: "reset"`, the goal check, and that the next
      step (`vision` "Listen to the Cantor") starts for each mate.
  - **What it should do (the owner's intent: the party plays it together):**
    - One shared watcher set per place while any party member there still needs the step.
    - The watchers see every party member nearby, helpers included. Being seen sends that player back (and tells
      the party), the same as on a solo run.
    - Each mate who needs the step completes it on reaching the goal, and the vision plays for them.
    - Helpers can't complete it for others, but they are part of the scene.
    - Review every other `SOLO` step type (meet, inspect, escort, lead, defend, follow, vision, answer, wait,
      sleep, wear) for the same "helper is invisible or the scene is per player" problem with a party. Say per
      type whether it works with a party, and fix the ones that don't.
  - **Observations from the owner's later attempts (October 20), on the live Realm, Story Questlines 1.16.4:**
    1. With the helper (the owner) nearby: nothing happened. No watchers spotted or sent back anyone, and entering
       the ring did nothing.
    2. With the owner gone, the mate alone: at first, still nothing.
    3. The owner then set the time to midnight, with the mate still alone, and the watchers worked: they spotted
       him and sent him back. Neither step requires night in the code (`stealthTick` has no `night` check, and
       `dark` on the "Listen to the Cantor" vision only adds a darkness effect while it plays). So the time change
       is probably not the cause.

    Likely factors to test:
    - a helper nearby
    - old watcher state per owner (`sceneFor`, `removeActors({ owner, key })`) left over from earlier attempts or
      from the owner's own run
    - the time it took for that state to clear
    - the 32-block `near` margin (`r + 32`) when players approach and leave
  - **Workaround the owner can use until the fix ships (operators only; `/scriptevent` may need cheats on):**
    `/scriptevent realm:saga_debug {"player":"<name>","action":"bump","story":"act1_signs","i":1,"n":1}` completes
    "Creep close to the Gray Ring" (chapter `song`: 0 follow, 1 stealth, 2 vision). Use `"i":2` for "Listen to the
    Cantor" if it doesn't start.
  - **Docs:** add the "no regular way to skip a stuck step" gap to the operator docs. Consider an operator command
    or menu button to complete a player's current step, logged in the content log, so owners don't need
    `/scriptevent` and cheats.
  - **Test:** a BDS scenario with 3 players in a party: a helper who finished the chapter, and two mates on the
    step. Also run a separate case with one mate alone after an earlier player's run of the same step. Check that:
    - watchers spawn once
    - spotting a mate and spotting the helper each send that player back
    - both mates complete the step at the goal and get the vision
    - no watcher snaps back more than a few times in 2 minutes

- [ ] **F48 (low, bug) build_bp: the shared tool gate drops a "released" anchor** (`utils/tool-gate.js` :45-95,
  engine review #5). Three loops share one gate. When the mirror loop (every tick) or the array loop (every 20
  ticks) calls `begin` first in a tick, it consumes `dirty` and `released`. Preview's closed-gate branch then sees an
  empty `released` and never clears a stale anchor, and `visualizationIdle()` short-circuits every loop until
  someone holds a tool again. Fix: make `begin` once per tick (cache by `system.currentTick`), or keep `released`
  until Preview reads it. Fix it together with F7 and F8.
- [ ] **F49 (low, perf) stash_bp: `storedCount` reads every legacy page property on each `realm:stash_count_ask`**
  (`pages.js` :314-322, item review #14). Up to 25 `stash:page_<n>` properties, some chunked to 30 KB, are read
  only to measure their length. Build the cache signature from the native index alone; a legacy page is migrated
  on its first load anyway.
- [ ] **F50 (low, quality) Test parameters in production code** (item review #17):
  - cooking `applyOwed(player, pid, failIds)` (:600) with `failIds` throwing "test: grant failed"
  - find's `world.afterEvents.playerPlaceBlock?.subscribe` (optional chaining kept for an older mock)
  - milestones' `recheck`/`report` hooks

  All are limited to `ScriptEventSource.Server`, so players can't reach them, and `realm:cooking_owed_ping` has no
  source check (read-only, harmless). Keep the gates; move test switches to a module-level test flag; fix the find
  mock instead of using optional chaining.
- [ ] **F51 (low, docs) Descriptions that don't match the code** (item review #18):
  - `crowns_audit`'s description says "the last 200 pays and gives", but the form shows the newest 50.
  - claims_bp's comment and OPEN.md O27 say there is no tame-owner getter (fixed by F29).
- [ ] **F52 (low, quality) The weather plan code is copied three times** (`planNow` in storm_bp, moon_bp and
  tornado_bp, engine review). Make it one shared module with a sync tool, or read `realm:weather_plan` as O57
  intended.
- [ ] **F53 (medium, tests) Failing and flaky scenarios not covered by F43** (`perf-report.md`):
  - calendar and wander fail on both master and the branch.
  - cleanup-keep and guilds-placed-restart are flaky only on the branch.

  Root-cause each (pack bug or scenario timing). Fix it, or make the scenario robust without weakening what it
  checks. The suite must end with 0 unexplained failures and 0 flakes.
- [x] (FIXED: #97 survived the merge (saga 1.16.10, news 1.7.79; saga-defeat-spawn passes)) **F54 (high, merge safety) Keep the story fight fix from PR #97 when msftMyt's #96 merges.**
  - #97 (published as Story Questlines 1.16.4 and Realm News 1.7.70, hosting #107) makes story defeat steps spawn
    their own mobs at places mobs never reach by themselves: the Choir ambush at the Haddock farm, the Smugglers'
    Cove, the Gray Ring, the Hollow Gate and three more.
  - #96 conflicts with master in exactly those files (saga_bp and news_bp manifests, diag.js, release.js,
    docs/NEWS.md).
  - In the re-review (step 1), check that #97's code in `saga_bp/scripts/objectives.js` and its story edits
    (`act2_choir.js`, `act4_seals.js`) are on master after #96. Its scenario must pass. Versions must be above
    saga 1.16.4 and news 1.7.70.
- [ ] **F55 (process) Comparable measurements.** Every number in `perf-report.md` comes from Claude's cloud
  container, so any later "before" or "after" has to be measured the same way to compare:
  - Ubuntu 24.04, 4 vCPUs Xeon 2.8 GHz, 15 GiB
  - Node 22.22, Linux BDS 1.26.52.3
  - nothing else running, at most 2 BDS jobs at once

  Calibrate first: master 7dac598 at 10 players, separate packs, should give about 6.39 ms/tick in the steady
  window. msftMyt's #96 says its own baseline was contaminated by another BDS process on the host. If the machine
  differs, compare only runs on that machine.

## Feature: living towns (owner request, October 19)

The owner added a second town and found two problems. Mayor Bram is one NPC for the whole world and only serves
the town within 96 blocks of him, so a new town has no mayor. Nothing gets built until an operator sets every
project spot by hand. The owner wants each town to grow on its own as players work with its mayor, and to feel
alive. This is a feature across town_bp, npc_bp and wander_bp. Build it after F1-F14, and design it first:

1. Write a short design note in this file under the feature, covering:
   - saved data
   - new options with their defaults
   - entity counts
   - per-tick cost
   - migration of existing towns
2. Then build it in steps, each with scenarios.

Packs: town_bp (owner), npc_bp (the mayor townsfolk, the resident labels), wander_bp (reuse its villager spawning
and the identity checks from the shared spawn module).

- [ ] **F36 A mayor per town.**
  - Every town gets its own mayor NPC: a named townsfolk generated for that town, with a name from a list, a
    skin and the `mayor` role, created when the town is added and standing at the town's center or town hall.
  - Mayor Bram stays the realm's main mayor (the story and the cast use `bram`) and the mayor of the first town.
  - Each mayor offers **Town projects** for its own town only, wherever the player stands. The 96-block "nearest
    town" rule is only a fallback for towns without a mayor.
  - Existing worlds: Bram keeps his town. Every other town gets its mayor the next time a player comes near it.
  - Mayors are townsfolk:
    - they follow the same label design
    - they keep their posts, save their skins and respawn if missing
    - the "one of each" rule applies (one mayor per town)
  - Operators can move or rename a town's mayor in `/realm:town`.
  - Removing a town removes its mayor.
  - Use namespaced ids (for example `mayor:<townId>`) so npc_bp's fixed cast ids and the stories are untouched.
  - Until this ships, the owner's workaround for a second town: turn on `deliverWithCommand` (Town Projects in
    Realm Configuration), so `/realm:town` takes deliveries inside any town's radius, and set its level 1 spots
    (`well`, `notice_board`) by hand.
- [ ] **F37 Project spots chosen automatically.**
  - When a town is added (and when it reaches a new level), town_bp picks a spot for each project of that level
    within the town radius, so operators no longer have to set them.
  - **Never touch a man-made block.** A build may only replace air, natural terrain (grass, dirt, sand, gravel,
    stone, plants, snow, leaves only if no log is player-placed) and, for the dock, water.
  - Reject any spot whose outline (the same outline the spot preview draws) or a 2-block margin around it contains:
    - a block players place, such as planks, any crafted block, glass, wool, concrete, torches, doors, beds,
      rails, chests and other containers, signs or farmland
    - a claim (`realm:access_check`)
    - another project
    - a path
    - a waystone
    - a townsfolk's house
  - **Terrain:** a spot may be leveled where a build needs it. Leveling may cut natural terrain down or fill it
    up (with the surrounding natural block, for example grass on dirt), at most 3 blocks either way, inside the
    build's footprint plus a 1-2 block apron graded as a gentle slope or steps back to the existing ground. It
    never levels a man-made block, a claim, a path or a house.
    - The town must keep its elevation: no clearing a whole area flat. Builds follow the land, as a well on a
      rise, terraced houses or a dock down at the water. Choose spots in this order:
      1. ground that needs the least leveling
      2. ground that is already level
      3. a different height level of the town, so the projects end up at varied heights
    - Save the leveled ground with the build's before-image, so Remove spot puts the original terrain back.
    - Test: a hillside town keeps a spread of build heights (more than one height level), and every apron joins
      the ground with steps of at most 1 block.
  - Prefer flat ground near the center, roads between projects, the dock at the nearest shoreline, and the well
    near the center. Face the build toward the center.
  - If no valid spot exists, say so in the town menu and let operators set it by hand, as now. Operators can
    still move any spot (Manage spots) and preview it before the build.
  - Before a project is built, show its outline to players who are near it for a few seconds, so nobody is
    surprised.
- [ ] **F38 The town grows as players progress.**
  - The mayor drives it. Talking to the mayor shows the town's story so far, what the next project is for ("a
    well so the families can move in"), and the projects of the current level.
  - Finishing a level unlocks the next, as now. Each finished project and level adds visible life (F39).
  - Keep the existing projects, rewards and saved data. New towns pick spots per F37. Existing towns keep spots
    already set and get automatic spots for the rest.
- [ ] **F39 Residents move in.**
  - Ordinary villagers (vanilla `minecraft:villager_v2` with professions, spawned the way wander_bp spawns its
    villagers, checked with spawnFresh) move into a town as it grows. For example:
    - 2 at Settlement with a well
    - 4 at Village
    - 6 at Town
    - 8 at City
    - 10 at Capital

    These are options, with a hard cap per town and per world.
  - Residents:
    - stay inside the town radius
    - get beds and job sites only from blocks the town builds (F37/F40), never by taking players' beds
    - are named from a list
    - are tagged as town residents, so other packs (cleanup, elite, Blood Moon) leave them alone
  - If one dies, a new one moves in after a while, with a message ("A new family moved into Riverside").
  - They don't trade by default: an option, since vanilla trading would bypass the Crowns economy.
  - **Cost budget:** residents are vanilla mobs, so their AI cost is the game's. The script side must be event
    driven (no per-tick loops over residents). Measure 2 towns at Capital at 10 players. Mob count is a known
    Realm limit, so keep the per-world cap small (default 20) and document it in SERVER_SETUP.md.
- [ ] **F40 Houses and small life.**
  - Add a project kind "house": a small built-in cottage with a bed and a job-site block. A town builds one per
    resident slot at levels 2+, at automatic spots (F37), so residents have homes.
  - Add small touches when projects finish:
    - lanterns along the town's paths
    - a few animals in the garden pen
    - the notice board listing new residents
    - gossip from the town's mayor through `realm:gossip`
  - Keep each touch cheap: blocks placed once, no per-tick work.
- [ ] **F41 Docs and tests.**
  - PACKS.md: Town Projects (How to use without the operator spot step, mayors, residents, houses, options,
    saved data, cost) and Townsfolk (town mayors). Add Town Projects' new behavior to "How the packs work
    together".
  - Update the welcome feature list and SERVER_SETUP.md (the resident cap).
  - Scenarios:
    - adding a town creates its mayor
    - spots are picked automatically and never overlap a placed block: build a planks cabin and a path, then
      check the spots avoid them
    - a finished level moves residents in, and a dead one is replaced
    - two towns, each with its own mayor and projects
    - Bram's town is unchanged on an existing world
    - perf: 2 towns at Capital, 10 players

## Coverage: every review finding has an F-item

So nothing is omitted, this maps each source to its items:

| Source | Finding | F-item |
|---|---|---|
| review-items.md | #1 Fill earlier pages deletes slot-locked stacks | F1 |
| review-items.md | #2 auto-store 5x slower | F2 |
| review-items.md | #3 page index loads pages it could skip | F3 |
| review-items.md | #4 recovery duplicates | F4 |
| review-items.md | #5 recovery form without UserBusy retry | F4 |
| review-items.md | #6 find_bp `decideMode` | F11 |
| review-items.md | #7 native acceptance not run (W5, W4) | F14 |
| review-items.md | #8 cooking `settle` | F12 |
| review-items.md | #9 `liveTotals` | F13 |
| review-items.md | #10 claims pets | F29 |
| review-items.md | #11 mail full | F30 |
| review-items.md | #12 dish lore stacking | F31 |
| review-items.md | #13 milestones `tf` | F32 |
| review-items.md | #14 `storedCount` | F49 |
| review-items.md | #15 broken edits | F33 |
| review-items.md | #16 copied prune.js | F26 |
| review-items.md | #17 test seams | F50 |
| review-items.md | #18 comments and descriptions | F51 |
| review-items.md | #19 tests that don't test | F34 |
| review-engine.md | #1 Blood Moon cache | F5 |
| review-engine.md | #2 elite density (owner decision) | F10 |
| review-engine.md | #3 build gate | F7 |
| review-engine.md | #4 anchor cleared | F8 |
| review-engine.md | #5 gate race | F48 |
| review-engine.md | #6 bed reads | F9 |
| review-engine.md | #7 saga stash bridge | F6 |
| review-engine.md | #8 hud_state encoding | F15 |
| review-engine.md | #9 map reset message | F16 |
| review-engine.md | #10 quest box tail | F17 |
| review-engine.md | #11 dead branch | F18 |
| review-engine.md | #12 tornado batching | F19 |
| review-engine.md | #13 actionbar allowlist | F20 |
| review-engine.md | #14 ticker choices | F21 |
| review-engine.md | #15 elite O58 unverified | F22 |
| review-engine.md | #16 diag `claim` | F23 |
| review-engine.md | #17 marker tests | F24 |
| review-engine.md | #18 inner guards | F25 |
| review-engine.md | #19 gossip limiter copies | F26 |
| review-engine.md | #20 `sessionChampions` | F27 |
| review-engine.md | #21 expedition queue | F28 |
| review-engine.md | three `planNow` copies | F52 |
| review-engine.md | missing native tests | F35 |
| review-engine.md | quest-wrap test is server-only | F34 |
| perf-report.md | 9 regressions plus atlas | F43 |
| perf-report.md | broken new scenarios | F44 |
| perf-report.md | stats ticker action bar | F45 |
| perf-report.md | over-budget packs | F46 |
| perf-report.md | calendar/wander failing in both trees, two flakes on the branch | F53 |
| Owner, October 19-20 | Hob Fairweather rubber-banding | F42 |
| Owner, October 19-20 | Gray Ring with a party | F47 |
| Owner, October 19-20 | mayor per town, automatic spots, terrain, residents | F36-F41 |
| Owner, October 19-20 | farm quest mobs | released in #97; protect it when merging #96: F54 |
| This session | measurement environment | F55 |
| rereview-8aa5cf06/new-review.md | N1-N5 | F56-F60 |
| rereview-8aa5cf06/new-review.md | N6 (O65 notes still player bullets in NEWS) | F60 |
| rereview-8aa5cf06/new-review.md | N7-N9 | F61-F63 |
| rereview-8aa5cf06/new-review.md | N10-N12 | F64 |
| rereview-8aa5cf06/new-review.md | N13-N14 | F65 |
| rereview-8aa5cf06/new-review.md | N15-N16 | F66 |
| rereview-8aa5cf06/new-review.md | N17 (fixed items not marked) | marked in this file |
| rereview-8aa5cf06/new-review.md | N18 | F67 |
| rereview-8aa5cf06/new-review.md | N19 | F68 |
| rereview-8aa5cf06/tests.md | 3 failing scenarios | F69 |
| ../OPEN.md | plan items still open or wrongly closed | F58, F70 |
| ../OPEN.md (W2), owner reports O68-O75 | real-client checks | F71 |
| release state | #96 merged but not published | F72 |

Tracked elsewhere: the plan's own items O1-O75 (`../OPEN.md`, `../PLAN.md`), including the W2 real-client checks
(O11-O16), which need the owner on a phone and a PC. The owner's decisions are in `../OPEN.md`. The one still open
here is F10.

## What the reviews found sound (don't redo it)

- One listener per pack (W11): the shared router is correct, no handler lost an id, and callbacks per event dropped
  from about 237 to about 67 (unmeasured, so measure in step 2).
- The shared copies are in sync, and the spawn module (O59) is fine.
- The Minimap's empty radar (O69) matches the producer byte for byte. The treasure map's warmth line (O55) is a
  proper steady line.
- The welcome popup (O43) is safe for the live Realm, and Pack diagnostics' late answers (O45) are correct.
- The graveyard and crater fixes (O74/O75) are unchanged from master.
- Every new `*_test` / `*_debug` hook is limited to operators or the server console.
- The owed-store migration is ordered safely and resumes after an interruption. The Crowns pay limit and ledger
  are correct and bounded. Move to page (O73) is sound.
- Repo rules hold everywhere checked: ASCII text, no `.header()`, `realm:` ids, diag.js first, the action bar
  protocol, script events under 2048 characters, no `clearDynamicProperties`, stable APIs only.
- `npm run check` and `npm run build` pass at `aef10dc`, and the unit tests pass (254 in the item scope, 64 in the
  engine scope).

## Pack grades at aef10dc (correctness / performance / maintainability)

- Weakest: stash D/D/C, build C/C/C, moon C/B/B.
- B range: saga B/B/B, cooking B/A/C, mail B/A/C, expedition B/A/C, elite B/A/B, stats B/A/B, relics, fishing, find,
  claims, guilds, town and milestones B/A/B, tornado A/B/C.
- Good: map A/A/B, hud A/B/B, bounty, party, nick and titles A/A/B, refill, death, goals, quests and crowns A/A/A.
