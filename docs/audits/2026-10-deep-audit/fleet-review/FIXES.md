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
- The perf and suite comparison of the branch against master at 10 and 40 players is added as `perf-report.md`
  when it finishes.

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
3. the lows (F15-F35)
4. the living towns feature (F36-F41), after F1-F14
5. owner decisions, which are asked, not decided (the owner's earlier answers are in `../OPEN.md`)

## Blockers and highs

- [ ] **F1 (blocker, item loss) stash_bp: "Fill earlier pages" deletes slot-locked stacks.**
  - Code: `scripts/pages.js` around :1343 and :1385-1390.
  - Trigger: a `lock_in_slot` stack sits in a storage slot of the page being shown, the player uses Fill earlier
    pages, and any other stack moves. Slot-locked records get `n = Number.MAX_SAFE_INTEGER` so nothing merges into
    them, and the final loop rebuilds the slot with that amount. In the game the amount setter throws,
    `deserializeStack` returns undefined, and the committed after-image empties the slot.
  - Fix: skip fixed records in the final loop (`if (rec.fixed) continue;`), and check every other loop that reads
    `n`.
  - Test: add the case to `tools/stash-pages.test.mjs` (see `stash-fill-locked.probe.test.mjs`; the mock doesn't
    throw, so assert the count is unchanged), plus a BDS scenario with a locked stack on the shown page.
- [ ] **F2 (high, perf) stash_bp: auto-store is 5x slower per pickup.**
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
- [ ] **F4 (high, duplication) stash_bp: `/realm:inv_recover` duplicates items by design.**
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

- [ ] **F5 (high) moon_bp: Blood Moon can spawn monsters inside a new shelter.**
  - Code: `main.js` around :553-636 (`builtCells`, `built()`).
  - The "built here" cache forgets a clear cell only on `playerPlaceBlock`. Shelters built during the night with
    Easy Building (script placement), structures, `/fill` or pistons stay cached as clear, so waves skip the exact
    check.
  - Fix: give cached "clear" cells a short lifetime (about 600 ticks). Optionally also invalidate on a script
    event from build_bp when it places blocks.
  - Measure: the O7 speed-up was never measured, and near bases it adds work. Keep the cache only if a soak shows
    a gain.
- [ ] **F6 (medium) saga_bp: collect progress can drop when Expansive Inventory doesn't answer.**
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
- [ ] **F10 (medium, owner decision) elite_bp: champion limit changed from a fixed 8 to 0.8 per online player**
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
- [ ] **F21 stats_bp (owner awareness):** players whose "off" choice for the ticker was erased by the old rule
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
- [ ] **F35 missing tests:** there is no native scenario for the moon cache (F5), the elite changes (O3, O58) or the
  build_bp gate (F7). Add them, with perf numbers where they are performance changes.

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
