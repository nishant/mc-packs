# Review: items/safety and economy/data packs on msftmyt-deep-audit-fleet-integration (aef10dc vs origin/master 7eb5f72)

Scope: stash, refill, cooking, relics, fishing, find, claims, death, bounty, guilds, town, mail, party, crowns, nick,
titles, milestones, goals, quests. Read-only review. Nothing in the repo was edited.

What I ran:
- Unit tests for these packs (stash-pages, owed-shared, crowns-ledger, mail-*, party-moderation, claims-protections,
  find-private, inactive-prune, nick-reserved, stash-access-ours): 254/254 pass.
- check-ascii, check-events, check-actionbar, sync-owed/events/diag --check: all pass.
- A unit probe of my own and four BDS runs: an auto-store profile on HEAD and on master, a chest-pairing probe,
  owed-legacy-restart on HEAD and on master, refill-pages on master, and w10-milestones-flag on HEAD.
- Scratch files: `fleet/probe.test.mjs`,
  `fleet/scen/autostore-perf.js`,
  `fleet/scen/chestpair.js`.

## Findings (ranked)

Format: severity | pack | file:line | trigger | why it's wrong | suggested fix.

1. **BLOCKER (item loss)** | stash_bp | packs/stash_bp/scripts/pages.js:1343 and :1385-1390 (`fillEarlierPages`)
   - Trigger: a player has a slot-locked stack (`lock_in_slot`) in a storage slot of the page being shown. They use
     /realm:inv, "Fill earlier pages", and at least one other stack moves. This works from any page, including page 1
     when later pages exist.
   - Why it's wrong:
     - Live slot-locked records get `n: Number.MAX_SAFE_INTEGER` so nothing merges into them.
     - The final loop then checks `rec.n === liveWas.get(rec.s)`. For these records that is never true, so it
       rebuilds the slot with `deserializeStack(rec)` and an amount of 2^53-1.
     - In the game the `amount` setter throws, so `deserializeStack` returns `undefined`. The slot goes into the
       after-image as empty and the commit deletes the stack. The before-image is discarded once the commit succeeds.
     - My probe (two tests added to a scratch copy of stash-pages.test.mjs) fails the census:
       `diamond 5 -> 9007199254740991`. The mock's setter doesn't throw, so the mock duplicates instead of deleting.
     - The existing F1 test puts its slot-locked stacks only on saved pages, so it misses this.
   - Fix: add `if (rec.fixed) continue;` in the final loop, or keep the real `n` and mark the record unmergeable some
     other way. Add a unit case with a slot-locked stack on the live page, both as source and as destination.

2. **BLOCKER (performance)** | stash_bp | packs/stash_bp/scripts/pages.js:1231-1300 (`autoStore`; targets at :1250)
   - Trigger: any player on page 2 or later picking things up, for example mining, while an earlier page has room.
   - Why it's wrong:
     - Every genuine pickup is now routed to an earlier page. Each route is a full `commitPages`: three structure
       snapshots (page, before and after images), each with an entity spawn, `createFromWorld` and a reload readback,
       plus an index write of up to 30 KB.
     - Master moved stacks only when the page was down to one free slot.
     - Measured on BDS, one player, one pickup every 10 ticks for 60 s (`scen/autostore-perf.js`, `--profile`):

       | | stash_bp ms/tick | p95 | p99 | max | ticks over 55 ms | setDynamicProperty/tick |
       |---|---|---|---|---|---|---|
       | master | 0.33 | 1 ms | 2 ms | 14 ms | 6 | 0.008 |
       | HEAD | 1.70 | 14 ms | 20 ms | 24 ms | 125 | 0.49 |

     - That is 5x for a single player. Ten miners on later pages would cost about 17 ms/tick against a 5 ms bundle
       budget. Each route also writes an "Auto-stored 1x ..." action bar line, so mining on page 2 spams the bar.
     - OPEN.md itself says every pack's 40-player budget remains MEASUREMENT REQUIRED. perf-soak exercises Hotbar
       Refill but not page-2 pickups.
   - Fix (pick one):
     - Batch: route at most once every N seconds per player, or only when the page drops below K free slots.
     - Commit without the before/after inventory structure images when only storage slots change.
     - Keep the old "page nearly full" trigger and make "fill earlier pages" manual only.

     Then add page-2 pickups to perf-soak and measure at 10 and 40 players.

3. **HIGH (performance)** | stash_bp | packs/stash_bp/scripts/pages.js:420-432 (`mayTake`) and `storeOnPages`
   - Trigger: page 1 is full of full stacks of the item being picked up on page 2 (for example 24 x 64 cobblestone)
     while the player mines cobblestone.
   - Why it's wrong:
     - The index says page 1 holds cobblestone, so `mayTake` returns true and `readPage` loads the page's structure
       snapshot on every auto-store pass, only to find no room.
     - O17's goal was to stop exactly these loads. The index has the counts (`k`) and the slot count, but it doesn't
       use "every stack of this kind is full and no slot is free".
   - Fix: in `mayTake`, return false when `slots.length === PAGE_SIZE` and `k[kind] === stacksOfKind * maxAmount`.
     That means recording stacks per kind in the index, or just "page full and no partial stack".

4. **HIGH (item duplication by design, operator tool)** | stash_bp | packs/stash_bp/scripts/page-store.js:470-532
   (`exportPending`), pages.js:1890-1906 (`recoverInventory`)
   - Trigger: an operator runs /realm:inv_recover on a player whose journal is pending.
   - Why it's wrong:
     - The tool exports the whole before-image into chests and never compares it with what the player still carries.
       Everything that survived the failed commit now exists twice. The form and the news say so, but the plan asked
       for a restore, and the realm must stay bug-free.
     - On a re-run after a mid-export failure, `chestIsPrefixOf` refills a journaled chest whose items were partly
       taken out in between, which duplicates them again.
   - Fix:
     - Export only the difference between the before-image and the live inventory, matched by signature.
     - Or restore the before-image into the live inventory, as rollback would have, and export only what doesn't fit.
     - On re-run, refuse a partially emptied chest instead of refilling it.

5. **MEDIUM (usability, isValid/await)** | stash_bp | packs/stash_bp/scripts/pages.js:1901
   - Trigger: an operator types /realm:inv_recover in chat. On mobile, console, or when the chat stays open,
     `form.show` cancels at once with UserBusy.
   - Why it's wrong:
     - The function calls `form.show(operator)` directly, with no UserBusy retry.
     - It reports "Canceled, nothing changed." and the tool appears broken. The BDS scenario answers forms
       synthetically, so it can't catch this.
     - Every other menu in the pack retries (`show`/`showForm`).
   - Fix: use the pack's `showForm(player, form, 20)` helper.

6. **MEDIUM (saved data/privacy default)** | find_bp | packs/find_bp/scripts/main.js:69-105 (`decideMode`)
   - Trigger: a new world running the Realm Bundle.
   - Why it's wrong:
     - "Existing world" is guessed from any dynamic property outside a short boot allow-list.
     - Packs that write on worldLoad before find_bp's handler runs make a brand-new world look old. Examples:
       `claims:next`, `crowns:names`, `party:*`, `stash:snapshot_next`, owed indexes.
     - Such a world gets `privateIndex: false`, which defeats the "private on new worlds" requirement. In the other
       direction, if find's settings cache was read before `decideMode` wrote `find:cfg`, an existing world runs
       private until the next restart.
   - Fix: decide on `find:idx:0` and `find:cfg` alone (the only evidence that Chest Finder ran before), and reset the
     settings cache after writing.

7. **MEDIUM (repo rule: tests)** | claims, find, mail, party, crowns, nick, titles (W5) and relics, fishing, bounty,
   guilds, town (W4)
   - Trigger: n/a.
   - Why it's wrong:
     - Plan rule 5 asks for a BDS scenario that fails before and passes after for every behavior fix.
     - OPEN.md marks O27-O31 "native acceptance queued, not run, not PASS".
     - Only cooking has a native owed-migration scenario. relics, fishing, bounty, guilds and town share the code
       but run their own `normalize` callbacks and grant paths, which no native run has covered.
     - The mail, party and crowns moderation has only `pack-sim` unit tests.
   - Fix: run, or at least write, native scenarios before publishing:
     - one owed-legacy restart per consumer, with its real legacy shape;
     - claims animals and doors;
     - crowns pay limit across midnight;
     - mail block and cap.

8. **MEDIUM (correctness)** | cooking_bp | packs/cooking_bp/scripts/main.js:586-598 (`settle`)
   - Trigger: `owedStore.update` fails to save (byte limit, or a property write that throws).
   - Why it's wrong:
     - The closure has already computed `due`, and `settle` returns it even though the store kept the debt.
     - `finish` then delivers `due` dishes, and the next join pays them again (a duplicate).
   - Fix: return `due` only when `update` returned true.

9. **MEDIUM (performance)** | stash_bp | packs/stash_bp/scripts/pages.js:1255-1270 (`liveTotals`), called from
   `autoStore`
   - Trigger: every auto-store look, every 10 ticks for active players.
   - Why it's wrong:
     - Each look adds 9 hotbar reads, the cursor component and 5 equipment reads on top of the 24 page reads.
     - It runs on page 1 too, where `targets` ends up empty unless the page is full. The work is thrown away.
   - Fix: return before `liveTotals` when `cur === 1 && now.empty > 1`, or when there are no targets.

10. **LOW-MEDIUM (claims behavior)** | claims_bp | packs/claims_bp/scripts/main.js:233-249
    - Trigger: a visitor's own tamed horse, dog or cat inside someone else's claim.
    - Why it's wrong:
      - Any tamed entity counts as protected, so the visitor can't leash, ride or sit their own pet there.
      - The comment and OPEN.md say "there is no stable getter for who tamed it". `EntityTameableComponent.tamedToPlayerId`
        and `EntityTameMountComponent.tamedToPlayerId` are in @minecraft/server 2.1.0
        (node_modules/@minecraft/server/index.d.ts:10242, :10295).
    - Fix: read `minecraft:tameable` and `minecraft:tamemount` `tamedToPlayerId` and exempt the owner. Fix the comment
      and OPEN.md.

11. **LOW (data)** | mail_bp | packs/mail_bp/scripts/policy.js:46-48, main.js:655-660
    - Trigger: the realm holds `maxLetters - systemReserve` letters and a pack sends a letter.
    - Why it's wrong: the plan returns `ok: false` but still includes `over` and `spare` in `drop`. main.js deletes the
      recipient's oldest pack letters, unread ones included, and then delivers nothing.
    - Fix: on the "realm full" refusal, return only the expired ids.

12. **LOW (compatibility)** | cooking_bp | packs/cooking_bp/scripts/main.js:240
    - Trigger: dishes cooked before and after the update.
    - Why it's wrong: the new lore line `§8Dish: <name>` means old and new dishes of one kind never stack
      (`isStackableWith` compares lore). Saga still accepts old dishes, so nothing is lost; it is a visible
      inventory-clutter regression.
    - Fix: accept it and say so in the news, or add the mark only to rare dishes.

13. **LOW (saved data)** | milestones_bp | packs/milestones_bp/scripts/main.js:228-233
    - Trigger: Titles is not installed, or is disabled, on the first join after this update.
    - Why it's wrong: `tf` is set even though nobody received the backfill. Master re-sent it every session, which is
      idempotent, so turning Titles on later used to recover. Now the backfill never comes again.
    - Fix: set `tf` only after a `realm:help_pong` from titles_bp has been seen, or key it per titles_bp version.

14. **LOW (stash count)** | stash_bp | packs/stash_bp/scripts/pages.js:314-322 (`storedCount`)
    - Trigger: each `realm:stash_count_ask`.
    - Why it's wrong: the cache signature reads every legacy `stash:page_<n>` property (up to 25, some chunked to
      30 KB) only to measure its length.
    - Fix: build the signature from the native index alone. A legacy page is migrated on its first load anyway.

15. **LOW (code quality: broken edits)** | cooking, nick, titles, mail
    - Statements glued onto one line by an automated edit:
      - packs/cooking_bp/scripts/main.js:31 `});const PROP_MOON`
      - packs/nick_bp/scripts/main.js:186 and packs/titles_bp/scripts/main.js:340 `}system.runTimeout(...)`
      - packs/mail_bp/scripts/main.js:660 `return console.warn(...);      const next = ...`
    - packs/mail_bp/scripts/policy.js:16 has a literal `\n * ` inside the JSDoc.
    - They work, but they show unreviewed generated edits. Run prettier on the touched files.

16. **LOW (duplicated logic)** | party, nick, titles | packs/{party,nick,titles}_bp/scripts/prune.js
    - Why it's wrong:
      - Three hand-copied files share `verdict`, `stale` and `unknownFields`, with no sync tool and no `--check`.
        That is the copy drift CLAUDE.md's sync tools exist to prevent. Two of the files lack a final newline.
      - The `gossip()` throttle is pasted into fishing, relics and guilds (and probably others).
    - Fix: one `tools/prune-shared.js` with a `sync-prune.mjs --check`, or accept the copies but test all three
      against one shared test table.

17. **LOW (test seams in production)** | cooking_bp, find_bp, milestones_bp
    - Test parameters ship in production code:
      - cooking: `applyOwed(player, pid, failIds)` (:600) with `failIds` throwing "test: grant failed".
      - find: `world.afterEvents.playerPlaceBlock?.subscribe` ("keeps the older seam tests' event mock working").
      - milestones: `recheck`/`report` hooks.
    - All are gated to `ScriptEventSource.Server` (checked), so players can't reach them, but they add surface.
      `realm:cooking_owed_ping` has no source check (read-only, harmless).
    - Fix: keep the gates; drop `failIds` from the production signature and use a module-level test flag instead;
      fix the find mock rather than using optional chaining.

18. **LOW (comment does not match code)** | claims_bp
    - OPEN.md O27 and main.js:233 say there is no tame-owner getter (see finding 10).
    - The crowns_audit command description says "the last 200 pays and gives". The form shows the newest 50 (it says
      so in its body).

19. **INFO (tests that don't test the fix)**
    - Spot checks:

      | Scenario | HEAD | master | Tests the change? |
      |---|---|---|---|
      | refill-pages.js (O20 additions) | not run | PASS | No. The new cases are coverage only, and nothing natively shows the O17 index stopping page loads. |
      | owed-legacy-restart.js | PASS | FAIL | Only because master lacks the new `realm:cooking_owed_test` hook ("cooking answered the owed test hook"), not because of the old storage. Acceptable since properties are per add-on, but it is not a fail-before of the migration logic. Covers cooking only. |
      | w10-milestones-flag.js ("not run by the author") | PASS | not run | Its "recheck" calls a new test hook that doesn't exist on master, so it can't fail before for the right reason either. |
      | stash-recover-restart.js ("queued for the lead; not run by the worker") | not run | not run | One chest only. Multi-chest, a re-run after a partial export and mobile UserBusy are untested. |

    - I checked whether adjacent chests from `setType` pair into a double chest and overwrite each other in the
      multi-chest export: on BDS they stay 27-slot singles (`scen/chestpair.js`, PASS). Not a finding.

Checked and found clean in scope:
- No `.header(`, no `world.clearDynamicProperties()`, no beta modules.
- `realm:` ids everywhere, diag.js first, every handler id registered with `onScriptEvent` (compared the literal ids
  each pack handles with what it registers).
- The new `realm:actionbar` request in find_bp comes before each `setActionBar`.
- Script events are split under 2048 characters (`stash_count` chunks at 1900; cooking and milestones test reports are
  bounded).
- `realm:inv_recover`, crowns_audit and titles_take need GameDirectors and recheck operator status after the form.
- Owed store migration:
  - Values are written, then the index, then readback, and only then is the legacy property rewritten.
  - Interrupted runs resume, and `set`/`take` are blocked until migration finishes.
  - Published store keys stay as legacy fallbacks.
  - The index is bounded at about 27 KB.
- Crowns pay is synchronous: limit checked, then day total written, then take, then add, with rollback.
- Ledger bounded at 30 KB.
- transferStacks/Move to page: plans on copies, refuses stale, slot-locked or no-room moves, one commit, life and page
  rechecked after every await.

## Pack ratings (correctness / performance / maintainability)

| Pack | Correctness | Performance | Maintainability | Note |
|---|---|---|---|---|
| stash_bp | D | D | C | Fill-earlier-pages deletes slot-locked stacks; auto-store routing is 5x slower per pickup; the recovery tool duplicates by design; pages.js is now 1,900 lines. |
| refill_bp | A | A | A | Listener migration only. |
| cooking_bp | B | A | C | `settle` can double-pay on a failed save; new lore splits stacks; glued line; test seam. |
| relics_bp | B | A | B | Owed migration sound; no native run for its shape; pasted gossip throttle. |
| fishing_bp | B | A | B | Same as relics. |
| find_bp | B | A | B | Private index works; new-vs-old world heuristic is fragile; marker follows the action bar protocol. |
| claims_bp | B | A | B | Pets of visitors locked out; wrong "no API" claim; no native run. |
| death_bp | A | A | A | Listener migration only. |
| bounty_bp | A | A | B | Owed migration; Java ids in the classifier are allow-listed, not fixed. |
| guilds_bp | B | A | B | Owed migration; pasted gossip throttle. |
| town_bp | B | A | B | Owed migration with a re-owe callback; no native run for town's shape. |
| mail_bp | B | A | C | Moderation fine; "realm full" still deletes pack letters; glued line and broken JSDoc. |
| party_bp | A | A | B | Mute, prune and HUD parts are careful; hand-copied prune.js. |
| crowns_bp | A | A | A | Ledger and limit are correct and bounded; minor description mismatch. |
| nick_bp | A | A | B | Reserved names and paging fine; glued line; copied prune.js. |
| titles_bp | A | A | B | Take and prune careful; glued line; copied prune.js. |
| milestones_bp | B | A | B | `tf` makes a missed backfill permanent. |
| goals_bp | A | A | A | Listener migration only. |
| quests_bp | A | A | A | Listener migration only. |

## Verdict

**Needs rework for stash_bp; merge the rest after fixes.**

- stash_bp must not ship as is:
  - Finding 1 deletes items.
  - Finding 2 makes Expansive Inventory a multi-millisecond cost per miner on a Realm that is already over budget.
  - Finding 4 hands operators a duplication tool.
- The other packs need the medium fixes:
  - cooking `settle` (finding 8);
  - find `decideMode` (finding 6);
  - mail realm-full drop (finding 11);
  - claims tamed-owner (finding 10).
- They also need the queued native scenarios run before the first publish (finding 7).
