# F1-F55 status on mc-packs 8aa5cf06 (master after #96)

Baseline: FIXES.md was written at aef10dc. `git log aef10dc..8aa5cf06` = 77 commits. Pack code that changed after
aef10dc is limited to: expedition_bp main.js (+2, resetBox sleep), map_bp reset.js (clock-based generation),
news_bp release.js, saga_bp actors.js/objectives.js/stories/types.js (#97 defeat spawns + spectator labels),
stash_bp pages.js (F1, F2), welcome_bp (owner O43 redesign). No change at all to build, moon, elite, find, cooking,
hud, map main.js, saga ui.js, tornado, wander, npc, town, claims, mail, milestones, nick, titles, stats, storm,
crowns, calendar, tools/diag-shared.js, tools/check-actionbar.allow.json. Every item below was checked by reading
the code at 8aa5cf06, not commit messages. No BDS scenario was run (read-only review).

Counts: FIXED 4 (F1, F2, F21, F54) · PARTLY FIXED 4 (F14, F22, F43, F44) · STILL OPEN 43 · N/A 2 (F46, F55) ·
mixed F53 (calendar fixed by fixture; wander, cleanup-keep, guilds-placed-restart open) · CHANGED 0 that alter the
problem (line numbers moved for several; current lines given).

| F | status | current file:line | evidence |
|---|---|---|---|
| F1 | FIXED (4a9e3b85, merged 76c35e24) | packs/stash_bp/scripts/pages.js:1346-1347, :1366, :1391 | Final loop now `if (rec.fixed \|\| rec.n === liveWas.get(rec.s)) continue;` (:1391); source loop already skips fixed (:1366) and `edits.delete(cur)` keeps the sentinel record off disk. Unit test "fill: a slot-locked stack on the active page keeps its real amount..." in tools/stash-pages.test.mjs asserts amount 7, lock, name, census unchanged. Remaining gap: no committed BDS scenario (OPEN.md O17 claims a native public-menu run passed, but no file for it is in tools/test-bds/examples). |
| F2 | FIXED (e7344108, merged 76c35e24) | pages.js:1240, :1251, :1262-1289 | `if (!before \|\| before.page !== cur \|\| now.empty > 1) return;` and the move loop stops at `empty < 2`: routing only when the page is full or down to one free slot (master's rule). OPEN.md O17: 1 player/120 pickups 0.307 (master 27f26f6e) vs 0.354 ms/tick (fixed), vs 1.70 on aef10dc. Action bar line per route remains (:1307) but now only fires near a full page. |
| F3 | STILL OPEN | pages.js:420-432 (`mayTake`), :1212-1219 (`mayHold`) | Unchanged: a full page that holds the item returns `mayHold` true, so the structure still loads. F2 makes auto-store passes rarer, but find/storeOnPages callers still hit it. |
| F4 | STILL OPEN | packs/stash_bp/scripts/page-store.js:470 (`exportPending`), pages.js:1891-1906 | Still exports the whole before-image; the form only warns "items they still carry will exist twice" (:1900). `form.show(operator)` at :1905 has no UserBusy retry (the retry helper at :1590 is not used). No re-run record. News now calls it "a backup export, not automatic duplicate removal". |
| F5 | STILL OPEN | packs/moon_bp/scripts/main.js:561-640 (`builtCells`, `built()` :603), invalidation only in playerPlaceBlock :580 | moon_bp unchanged since aef10dc. |
| F6 | STILL OPEN | packs/saga_bp/scripts/objectives.js:716-731 (`collectCount`), bridge :686-792 | On timeout (`now - asked >= STASH_WAIT`) it sets `rows = []` and caches it: progress still drops. Bridge maps (stashRows/stashAsked/stashParts/stashRev, :698-704) are not cleared on leave (only referenced inside the bridge block). |
| F7 | STILL OPEN | packs/build_bp/scripts/utils/build-tool.js:36 (`if (item && placeable(item.typeId)) return true;`), core/Preview.js:343-370 | build_bp unchanged. |
| F8 | STILL OPEN | core/Preview.js:351-366 | `clearAnchor(player)` when the gate is closed / tool not held (:359, :366). |
| F9 | STILL OPEN | core/Preview.js:305 (`previewDestroyBeds`), build_bp/scripts/main.js:198 (`readPlaced`) | Unchanged. |
| F10 | STILL OPEN (owner decision) | packs/elite_bp/scripts/config.js:9-21, packs/admin_bp/scripts/presets.js:431 | Defaults still maxAlive 80, maxAlivePerPlayer 0.8, maxAliveNearby 3. Note: the Large server preset is now `large: 80` = the default, so the preset no longer changes champions at all (admin-size-profile was adjusted to accept this, see fixtures). |
| F11 | STILL OPEN | packs/find_bp/scripts/main.js:78-100 (`decideMode`) | Still infers "existing world" from any non-`find:` property outside BOOT lists. |
| F12 | STILL OPEN | packs/cooking_bp/scripts/main.js:586-598 (`settle`), :552 | `owedStore.update` returns false on a failed write (owed.js:304-311); `settle` ignores it and returns `due`. |
| F13 | STILL OPEN | pages.js:1237 | `liveTotals` still runs on every auto-store pass, before the new `now.empty > 1` early return at :1240 (so the F2 fix did not make it cheaper). |
| F14 | PARTLY FIXED | docs/audits/2026-10-deep-audit/OPEN.md:78-87 (O30, O31) | After aef10dc OPEN.md records strict native PASS for O30 (Crowns limit, 29.5 s) and O31 (reserved names, 33.2 s), and Finder (O28) via the find-marker/find-index fixtures. O27 and O29 still "queued, not run" or "scoped". No new owed-migration scenarios for relics, fishing, bounty, guilds, town (only owed-legacy-restart for cooking exists). No new scenario files were committed for O30/O31. |
| F15 | STILL OPEN | packs/hud_bp/scripts/main.js:96-116 | Unchanged. |
| F16 | STILL OPEN | packs/map_bp/scripts/main.js:299-311, reset.js:23 | `needsReset(gen, undefined)` is true for a brand-new player after any reset, who then gets "An operator reset everyone's destination...". The clock-based `nextGeneration` (e6a80817) does not stamp new players. |
| F17 | STILL OPEN | packs/saga_bp/scripts/ui.js:1557-1585 | `fitRows` still cuts the tail. |
| F18 | STILL OPEN | ui.js:1715 | Second `needs.length ? ...` branch is still unreachable. |
| F19 | STILL OPEN | packs/tornado_bp/scripts/main.js:361-426 (one `player.playSound` per player :425) | Unchanged. |
| F20 | STILL OPEN | tools/check-actionbar.allow.json:4, :10 | `"(anonymous)"` still exempts hud_bp and stats_bp. |
| F21 | FIXED (already at aef10dc, 70db7f4d) | docs/NEWS.md:44 | "If an old off choice comes back, turn it off once more: choices matching the old default were not saved." Caveat: it is in the "Clear quests and safer inventory pages" entry, not the newest one, so in-game Realm News (release.js shows only the newest entry) doesn't show it; only the website does. |
| F22 | PARTLY FIXED (evidence, no code change) | packs/elite_bp/scripts/main.js:142, 213, 379, 460, 515, 543-544, 860, 966 | perf-report.md: master soaks logged the InvalidEntityError 3 and 8 times, the branch soaks 0. Guard audit for the remaining dimension reads not done. |
| F23 | STILL OPEN | tools/diag-shared.js:354 (and every pack's diag.js) | `st.prefixOwner.get(prefixOf(k)) ?? st.cur ?? owner(...)`: null still falls through. The diag-owned-reload fixture now expects this (see fixtures). |
| F24 | STILL OPEN | expedition_bp/scripts/main.js:370-428 and :1343-1443 (moved +2), saga objectives.js:686-792 | Marker blocks unchanged. |
| F25 | STILL OPEN | saga_bp/scripts/main.js:429, wander_bp/scripts/main.js:1333 | Unchanged. |
| F26 | STILL OPEN | packs/{nick,party,titles}_bp/scripts/prune.js; gossip limiter copies | No sync tool for prune.js or the gossip limiter (tools has sync-owed/sync-spawn etc., none for these). |
| F27 | STILL OPEN | objectives.js:3492-3500 | `sessionChampions` is only ever `add`ed. |
| F28 | STILL OPEN | expedition_bp/scripts/main.js:1359 (`const queue = []`), block :1343-1443 | Memory only; no world-load notice. |
| F29 | STILL OPEN | packs/claims_bp/scripts/main.js:233-245 | Comment still "there is no stable getter for who tamed it"; any tamed animal is protected; no tamer exception. |
| F30 | STILL OPEN | packs/mail_bp/scripts/policy.js:48, mail main.js:655-659 | On "the realm's mail is full" `drop` still includes `over` and the spare read letters, and main.js deletes them before checking `plan.ok`. |
| F31 | STILL OPEN | cooking_bp/scripts/main.js:240 | `§8Dish:` lore line unchanged; no migration. |
| F32 | STILL OPEN | milestones_bp/scripts/main.js:226-230 | `tf` still set once regardless of Titles' confirmation. |
| F33 | STILL OPEN | cooking main.js:31, nick main.js:186, titles main.js:340, mail main.js:660, mail policy.js:16 | All glued lines and the literal `\n` remain. New instance: tools/test-bds/examples/welcome-generic-bundle.js comment has literal `\n// tests ...\n// Limit:` on one line. |
| F34 | STILL OPEN | tools/test-bds/examples/refill-pages.js, owed-legacy-restart.js, w10-milestones-flag.js, saga-quest-wrap.js | None changed after aef10dc. |
| F35 | STILL OPEN | - | Only new scenario after aef10dc is saga-defeat-spawn.js; none for the moon cache, elite O3/O58 or the build gate. |
| F36 | STILL OPEN (feature) | town_bp, npc_bp | No `mayor:` ids or per-town mayors; town_bp/npc_bp unchanged. |
| F37 | STILL OPEN (feature) | town_bp | Unchanged; spots still set by operators. |
| F38 | STILL OPEN (feature) | town_bp | Unchanged. |
| F39 | STILL OPEN (feature) | town_bp | No residents code. |
| F40 | STILL OPEN (feature) | town_bp | No house project. |
| F41 | STILL OPEN (feature) | docs, scenarios | None. |
| F42 | STILL OPEN | packs/wander_bp/scripts/main.js:62 (`TETHER_MAX = 12`), :849-875 (`tether`, `tetherAll`) | wander_bp unchanged; OPEN.md says the wander failure is "Nish's explicitly deferred F42". |
| F43 | PARTLY FIXED | see fixtures section | 7 of 9 regressions addressed (6 by fixture correction, expedition-pending by pack fix 9c36e128); wander-walk and atlas have no change at all (scenario, harness or pack) and stay unexplained. |
| F44 | PARTLY FIXED | tools/test-bds/suite.mjs:73, build-beds.mjs:12, :27, diag-owned-reload.js:33-34 | build-beds port forwarded (2f2e7743); welcome-generic-bundle dispatched as `fullBundle` (2e381e3b) and rewritten for the owner's O43 design; diag-owned-reload phase-1 count 2 -> 4; find-marker and w10-npc-nameless fixtures fixed. Not re-run here. diag-owned-reload's new count bakes in F23 behavior (see fixtures). |
| F45 | STILL OPEN | packs/stats_bp/scripts/main.js:329 (runInterval 20) | stats_bp unchanged. |
| F46 | N/A (info) | - | Still the baseline; owner accepted the 40-player shortfall (OPEN.md O1/O2 WON'T FIX, 3e793137); soaks deferred to Nish's Claude. |
| F47 | STILL OPEN | objectives.js:519 (`SOLO`), :521 (`helps`), :1948 (`stealthTick`), :1995-2027 (`stealthFast`, `gd.ent.teleport` :2027) | Unchanged apart from line shifts. |
| F48 | STILL OPEN | packs/build_bp/scripts/utils/tool-gate.js:45-95 | `begin` still resets `released = []` on every call. |
| F49 | STILL OPEN | pages.js:303-320 | `storedCount` still reads every `stash:page_<n>` property for its length. |
| F50 | STILL OPEN | cooking main.js:600-610, find_bp main.js:350, milestones main.js:420-445 | Unchanged. |
| F51 | STILL OPEN | packs/crowns_bp/scripts/main.js:787, claims_bp main.js:233 | Command description still "the last 200 pays and gives" (PACKS.md:2327 and news already say newest 50 of 200); claims comment unchanged. |
| F52 | STILL OPEN | storm_bp main.js:86, moon_bp main.js:336, tornado_bp main.js:156 | Three `planNow` copies. |
| F53 | MIXED | see fixtures section | calendar: fixture corrections (538fbbac, bf0f0b44, 024af820/cef1e57e), legitimate. wander: still fails, deferred to F42. cleanup-keep, guilds-placed-restart: no change, still unexplained. |
| F54 | FIXED (preserved) | objectives.js:1355-1358, :2113-2139 (`defeatSpawnTick`), :3288; stories/act2_choir.js:104, :354, :751, :761; act4_seals.js:644, :862; side_dark.js:803; types.js:139-141; tools/test-bds/examples/saga-defeat-spawn.js | 58540e39 is an ancestor of 8aa5cf06. Every added line of 58540e39 in objectives.js (38), act2_choir (4), act4_seals (2), side_dark (1), types.js (3), check-stories.mjs (1) and saga-defeat-spawn.js (81) is present verbatim; only version/release lines differ. Versions: saga_bp 1.16.10 (> 1.16.4), news_bp 1.7.79 (> 1.7.70). The scenario was not run here. |
| F55 | N/A (process) | - | Still applies; no new measurements in the 77 commits (soaks USER_DEFERRED in OPEN.md). |

## Fixture changes (F43, F44, F53) with verdicts

### F43 regressions

1. **admin-diag-bundle** (024af820, adf2f471): LEGITIMATE.
   ```
   +  // Nicknames saves 2 entries per player it has seen: the gamertag (nick:g:) and when it was last seen (nick:t:).
   +  const perPlayer = 2;
   -  t.check(b1.nick_bp.props === 2 && ...
   +  t.check(b1.nick_bp.props === 2 * perPlayer && ...
   -  t.check(b3.nick_bp.props === 3 && !b3.nick_bp.forgotten, ...
   +  t.check(b3.nick_bp.props === 3 * perPlayer && !b3.nick_bp.forgotten, ...
   ```
   nick_bp really writes `nick:t:<id>` (packs/nick_bp/scripts/main.js:23, from O25 8049fc25). Counts stay exact.

2. **admin-size-profile** (024af820, cef1e57e): LEGITIMATE, slightly looser.
   ```
   -  const LARGE = { ..., "elite_bp:maxAlive": 16, ... };  const SMALL = { ..., "elite_bp:maxAlive": 8, ... };
   +  const eliteSmall = 80;
   +  const eliteLarge = 80;
   +  const changes = Object.keys(LARGE).filter((k) => LARGE[k] !== SMALL[k]).length;
   +  t.assert(changes >= 7, ...);
   -  const done = t.waitMessage(op, /Server size: Large server\. Changed 8 settings\./, ...
   +  const done = t.waitMessage(op, new RegExp(`Server size: Large server\\. Changed ${changes} settings\\.`), ...
   +  t.check(alike === 0 || new RegExp(`${alike} more already match\\.`).test(plain(ask.body)), ...
   ```
   The elite defaults changed on purpose (O3), and tools/test-bds/lib/size-profile-constants.test.mjs ties the
   constants to elite config.js and admin presets.js. Every value is still checked exactly, and a check for "1 more
   already match" was added. Looser: the count is derived (`>= 7`) instead of a fixed 8. The scenario now accepts that
   the Large server preset doesn't change Champions at all (80 -> 80). That is F10's open owner decision, not a test bug.

3. **expedition-pending**: scenario unchanged. FIXED BY PACK CODE (9c36e128, `await sleep(2)` after `removeArea` in
   resetBox, expedition_bp main.js:1059-1060, plus tools/expedition-capacity.test.mjs). OPEN.md O8: the unchanged scenario
   passed in 208 s at 16a0081f. Not a test change.

4. **expedition-slot-spawn** (538e4656): LEGITIMATE and stronger.
   ```
   +  await t.waitMessage(bob, /dungeon is free now: starting yours/i, { since: releaseAt, timeout: 900 });
   +  await t.waitUntil(async () => (await state(t, 0))?.phase === "active", ... "queued Bob starts in the safe first dungeon" });
   +  t.check(!queuedSecond || queuedSecond.phase === "none", "the queued run still never uses the dungeon under world spawn");
   +  t.assert(t.cmd(bob, "/realm:expedition_leave").ok, "Bob leaves his automatically started run");
   ```
   With the O8 queue, Bob is now queued, so `runs === 0 && pending === 0` never held until he started and left. The
   fixture now checks the queued start and still checks the slot under spawn.

5. **find-index** (42383aaf, 0ca62573, a70cec55, f2a02c57): PHASE 1 LEGITIMATE, PHASE 2 NARROWED (partly weakened).
   ```
   -    for (const loc of [a, b]) dim.getBlock(loc).setType("minecraft:barrel");
   +    for (const loc of [a, b]) await place(t, p, loc, "minecraft:barrel");
   +  // A simulated player gets a new id on every spawn, so private ownership cannot be shown to survive a restart here
   +  // (find-marker covers ownership and isolation). This half checks the saved index itself under the supported
   +  // world-wide mode, switched on through the settings protocol and acknowledged.
   +  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "wide", pack: "find_bp", key: "privateIndex", value: false }));
   ```
   The "no form" failure came from the intended O28 private index: setType containers have no owner, so nothing is
   listed. Placing them natively is the right fix. But the restart half now runs with `privateIndex: false`, so the
   default mode for new worlds (private index) is no longer checked across a restart. find-marker has no restart.
   That coverage gap is a real one, even though the harness limit (new player id per spawn) explains it.

6. **stash-pages** (538e4656): LEGITIMATE, slightly looser.
   ```
   -    t.assert(/^Page #2 of 2/.test(countRetry.body) && countRetry.buttons[4].startsWith("Sort this page"), "busy retry rebuilds page-count-dependent action indices");
   +    const sortIndex = countRetry.buttons.findIndex((b) => b.startsWith("Sort this page"));
   +    t.assert(/^Page #2 of 2/.test(countRetry.body) && sortIndex >= 0, "busy retry rebuilds the current page count and exposes its Sort action");
   -    countRetry.answer(4);
   +    countRetry.answer(sortIndex);
   ```
   New menu buttons (Fill earlier pages / Move to page) shifted the index. What matters is still checked: the retried
   body says "Page #2 of 2", tapping the "Sort" label runs Sort (waits for "Sorted ..."), and `current() === 2` ("not
   stale Page #4"). Only the fixed position is no longer pinned.

7. **stats-new-name** and **stats-ticker** (538e4656): LEGITIMATE.
   ```
   +  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "ticker_fixture_off", pack: "stats_bp", key: "tickerDefaultOn", value: false }));
   +  t.assert(offAck.ok === true, "the rank fixture controls its initial ticker state; default-on has separate coverage");
   -    t.cmd(p, "/realm:stats_ticker");
   +    t.assert(t.cmd(p, "/realm:stats_ticker").ok, "the ticker toggle runs");
   +    await t.waitMessage(p, /Stats ticker: Enabled\./, { kind: "chat", timeout: 40, since });
   ```
   Root cause confirmed: with O71 default-on, the old toggle turned the ticker OFF. The fixture now sets the old
   starting state and asserts "Enabled". The original action bar checks (/Deaths/, /Mined 0/) are unchanged.
   Default-on is covered by stats-ticker-personal.js and tools/stats-ticker-prefs.test.mjs. (The F43 guess "ticker moved
   to the action bar" was wrong: these scenarios already read `kind: "actionbar"`.)

8. **wander-walk**: NO CHANGE (scenario, harness and wander_bp all unchanged). STILL OPEN, unexplained ("no form for
   Tester within 200 ticks"). The w10-npc-nameless fix (tap cooldown and busy flag) suggests a similar timing cause;
   not verified.

9. **atlas**: NO CHANGE. STILL OPEN ("no message /Beat its three keepers/" on retry).

### F44 new scenarios

- **build-beds**: LEGITIMATE wiring fix (2f2e7743): `port: { type: "string" }` plus forwarding `--prop server-port=...`.
- **welcome-generic-bundle**: LEGITIMATE (2e381e3b, 9f8131b3). The suite now has
  `"welcome-generic-bundle": { fullBundle: true, ... }`, so `<stage>` is filled in. The body was rewritten for the
  owner's O43 answer (one default welcome for every world, old Realm text replaced once): `expect=realm` is gone, and
  form title, labels, single Close button, section order, text budget and no "Rules" are now asserted. That is a
  behavior change the owner chose, not a weakening. Saved-field checks moved to tools/operator-welcome.test.mjs
  (stated limit). It has a glued-comment glitch (literal `\n`).
- **diag-owned-reload** (024af820): LEGITIMATE precondition fix, but it bakes in F23.
  ```
  -    t.check(b.probe_bp.props === 2, `phase 1: the probe wrote decl:a and has its probe:big ...`);
  +    // Written through the probe's own wrapper, so while it is running all 3 seeded keys plus probe:big are the probe's.
  +    t.check(b.probe_bp.props === 4, `phase 1: the probe wrote decl:a, help:orphan and mystery:z and has its probe:big ...`);
  ```
  Phase 2 (the property under test: declared vs. ambiguous vs. unknown ownership after reload) is unchanged. But
  `help:orphan` (the `help` prefix declared by two packs, prefixOwner null) is counted as the probe's in phase 1 only
  because of the `??` fall-through in `claim` (diag-shared.js:354). That is exactly F23. When F23 is fixed, this
  expectation must go back to 3.
- **find-marker** (42383aaf, f2a02c57): LEGITIMATE and stronger: containers are placed natively, a bystander's chest
  was added, and `form.buttons.length >= 1` became `=== 1, "only the searcher's own chest is listed, not the
  bystander's"`.
- **w10-npc-nameless** (0bafbe46): LEGITIMATE timing and precondition fix. Tobin moved 4 blocks (townsfolk on one spot
  push each other), plus `await t.wait(12)` past the 10-tick tap cooldown. Every assertion is kept.

### F53

- **calendar** (024af820/cef1e57e/bf0f0b44, 538fbbac): LEGITIMATE.
  - It now waits for the 1000-tick `NEWS_GAP` (calendar main.js:528) to open before the held siege: the gap is the
    intended "town news is quieter" change.
  - It reads the observed event tick: the old `heldNews[0].tick` was a fixture bug, since `of()` returns messages.
  - Phase 2 now loads the saved circles' chunks. Phase 1 loaded the land with the harness's own areas
    (calendar.js:82), so the pack's `loadGround` skipped its own ticking area (main.js:1402), and after the restart
    the land was unloaded. The pack's design is "put back once loaded" (main.js:1503).
  - Gap checks are kept in both directions:
    ```
    +  await t.waitUntil(() => calNews(Infinity) === undefined || sys.currentTick - calNews(Infinity) >= 1000, ...);
    -  t.check(sys.currentTick - heldNews[0].tick < 1000, ...
    +  t.check(sys.currentTick - heldNewsTick < 1000, ...
    +    for (const c of circles) await t.loadArea(c[0], c[2], { radius: 1 });
    ```
- **wander**: unchanged, fails in both trees; OPEN.md assigns it to F42.
- **cleanup-keep**, **guilds-placed-restart**: unchanged, still unexplained flakes.
- **maps-leave** (ab346a29, not in any F-list): LEGITIMATE ordering fix (unload only after the player is >200 blocks
  away).
- **map-reset** (a1b2a32c): LEGITIMATE. `resetGen === gen + 1` became `> gen` because the generation is now based on
  the clock (e6a80817).

### Weakened tests (verdict)

No fixture removes an assertion of the behavior it targets. Narrowed or looser, in order of concern:
1. find-index: the restart half no longer covers the default private index.
2. diag-owned-reload: phase 1 now asserts F23's fall-through behavior.
3. admin-size-profile: the change count is derived (`>= 7`) and accepts a no-op Champions preset (F10).
4. stash-pages: the Sort button position is no longer pinned (the label-to-action check remains).
