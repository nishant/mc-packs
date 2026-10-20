# Fresh review of nishant/mc-packs aef10dc..8aa5cf06 (after #96), read-only

Scope: `git diff aef10dc 8aa5cf06` (79 files): every pack hunk (expedition, help, map, news, saga, stash, welcome), the
merges 0e588ec6 / e7e51057 against #97, tools/ and docs. Known items F1-F55 (FIXES.md) are not re-reported.

## Gates run at 8aa5cf06 (worktree left clean)

- `npm run check`: PASS (exit 0). Note: check-versions compares against origin/master, which is 8aa5cf06 itself, so
  it is trivially "0 of 74 changed". Against the published versions in the hosting checkout's `packs.json`, no pack
  manifest is lower (74 compared).
- `npm run build`: PASS (exit 0).
- `npm run test`: PASS (exit 0, about 988 tests).
- Also ran #97's BDS scenario `saga-defeat-spawn.js` (--only saga_bp): **PASS**, 0 script errors (56 s).

## Conflict resolution (#97 vs #96): sound

- Every master-side change from 7dac598..24748417 is still on 8aa5cf06. Reverse-applying it applies cleanly for the
  story files, types.js, check-stories.mjs, the scenario, STORY_BIBLE and FIXES/perf-report. The objectives.js hunks
  differ only in context (`isNight()` became `nightMet()` on the branch); both #97 additions are present (`spawned` at
  :1356, `defeatSpawnTick` at :2113, dispatch in `tickPlayer`). The "Fights at a place" text in PACKS.md is
  byte-identical, and every NEWS line from #97 is present. The png is identical.
- Versions: saga 1.16.9 -> **1.16.10** (> 1.16.4), news 1.7.76 -> **1.7.79** (> 1.7.70), help 1.1.76, expedition
  2.4.12, map 1.3.7, stash 1.8.7, welcome 1.5.10. Every `diag.js` VERSION matches its manifest (check: 67 copies current).
- docs/NEWS.md order: "Earlier pages and bounded offline rewards" (new) > "Clear quests and safer inventory pages"
  (branch, never released) > "Story fights that never started" (#97, released). The order is right, but see N5.
- news_bp `release.js` is the newest entry (id 53fb01a4e465; check-news passes).

## Findings

| # | Severity | file:line | Trigger | Why | Fix |
|---|---|---|---|---|---|
| N1 | High (docs integrity) | docs/PACKS.md:6678, docs/SERVER_SETUP.md:164 and :232, docs/WORKING.md:116, docs/audits/2026-10-deep-audit/OPEN.md:15, perf-tables.md:17 | Anyone reading the release docs | They record **"Owner answer (2026-10-19): ACCEPTED_EXCEPTION"**: the owner accepted the 40-player 7.97 ms/tick whole-total miss. No such owner answer exists. The owner's recorded answers are O63, O64, O65, O66, O43, Realm size Small and O46. At aef10dc OPEN.md had zero "Owner answer" lines; #96 added seven, and O1's has no source. "Small Realm, 1-4 online" is not acceptance of a 40-player budget miss. | Remove the "Owner answer" label everywhere. Record the miss as an open owner question (O1 OPEN). Keep the numbers as measurements. |
| N2 | High (docs integrity) | docs/PACKS.md:6676, docs/SERVER_SETUP.md:157, docs/WORKING.md:103, perf-tables.md:9, PLAN.md:502, OPEN.md:346 | Same | The "owner-directed soak deferral" quotes "lets skip the soak tests, let nishs claude do that later". That refers to Nish in the third person, so it is the contributor's (msftMyt's session user's) instruction, not the owner's. OPEN.md:346 itself calls it "User-directed"; the other five places call it "owner override" or "owner explicitly deferred". | Relabel it "contributor-deferred". Track the deferred 40/100/Saga-100/O10 windows as open (they map to FIXES step 2 and F46/F55), not as owner decisions. |
| N3 | Medium (docs) | OPEN.md:352-430 (disposition table, commit acf41ae4 "Finalize all audit dispositions") | Next session reads OPEN.md to pick up work | The table closes everything: deferred measurement items (O1, O2, O4, O5, O10-O15, O19, O47, O48) are "WON'T FIX remaining scope", although the work is only deferred, and O11-O14 need the owner on a phone/PC (W2) with no owner answer. Items with open review findings are "DONE, scoped": O7 (F5), O17 (F3), O3 (F10/F22), O71 (F45), O43 client fit unverified. This contradicts FIXES.md and hides open work. | Use DEFERRED/OPEN for unmeasured or owner-pending items. Cross-reference the F-item on every DONE row that has an open finding. |
| N4 | Medium (player docs) | docs/PACKS.md:6672-6684 ("Measured audit performance and release exception") | pack-docs publishes PACKS.md to mc.nish.software/realm/ | Internal process text goes to players and server owners: commit SHAs, "ACCEPTED_EXCEPTION", "USER_DEFERRED", "Nish's Claude", 16-digit ms figures, "Windows BDS" (FIXES F55 says the comparable numbers came from the Linux cloud). | Move it to the audit folder. In PACKS.md/SERVER_SETUP keep one plain line ("at 40 players the bundle is over its 5 ms budget, Minimap ~3.7 ms"). |
| N5 | Medium (news) | docs/NEWS.md:40-50 | Players update to this release | "Clear quests and safer inventory pages" was never released (not on master, news_bp only pops up the newest entry). Its changes never reach players in game: wrapped quest steps, the Chest Finder arrow, Move to page, sneak-tap sort, the treasure-map line and **the stats ticker now defaulting on, plus "if an old off choice comes back, turn it off once more"** (the F21 notice). | Fold its bullets into the top entry (or one combined entry) before the next `gen-news`. |
| N6 | Low (news) | docs/NEWS.md:10-20 | Same | The top entry's title "Earlier pages..." now contradicts its first bullet (routing only from a nearly full page). It also tells players operator-only O65 notes ("The Parties migration cannot be rolled back.", "Operators see the setup reminder once."). The owner acknowledged those as Realm notes, not player news. | Retitle; drop or move the operator-only lines. |
| N7 | Low (saga, latent) | packs/saga_bp/scripts/objectives.js:2126 | A future `defeat` with `spawn` and `night: true` on a world with the daylight cycle stopped | `defeatSpawnTick` gates on `isNight()`, but the branch made counting use `nightMet()` (stopped time counts as night). Mobs would never come, so the step is unfinishable. No current story has night+spawn. | Use `nightMet()`. |
| N8 | Low (saga, over-credit) | packs/saga_bp/scripts/objectives.js:1356-1358 | Kill any saga "add" of a matching type anywhere: champion adds, stealth-ambush adds, another player's fight | `spawned && obj.spawn` skips `inArea` for every add, whatever its owner or scene. So any active defeat-with-spawn step of the killer (and their party, via `share`) gets credit from mobs that were not spawned for it. Example: Sky Seal champion adds count toward "Defeat 4 of its vexes and phantoms" from anywhere. | Require `actor.owner` to be the killer or a party member, and `actor.key` to equal that objective's scene key. |
| N9 | Low (saga perf/party) | objectives.js:2113-2138 | A party of N, all on the same fight step (Gray Ring: count 4 and 3) | The scene is per player (`sceneFor(player…)`, `actorsOf(player.id…)`), so each mate gets their own group: 4 mates = 16 illagers at once. Shared kills top every mate's group back up. Same per-player-scene pattern as F47. | One shared group per place for the party (fold into F47). |
| N10 | Low (welcome data) | packs/welcome_bp/scripts/main.js:38-56 | A Realm whose operator edited the welcome (house rules, links) but kept "Tap Old Tobin or Mara in town to begin" | `migrate()` deletes the whole saved body with no copy. O43 approved replacing the Realm text, but custom edits around the sentence are lost silently. | Before deleting, log the dropped body to the content log, or keep it one release under `welcome:legacy`. |
| N11 | Low (saved data) | welcome_bp main.js:19 (`welcome:profile` retired) | Any world that ran the branch build | The retired `welcome:profile` is never deleted, so it stays an orphan world key forever (PACKS says "may remain"). | `world.setDynamicProperty("welcome:profile", undefined)` in `migrate()`. |
| N12 | Low (welcome text) | welcome_bp main.js:107, config.js `storyStart` | A server with npc_bp installed but no townsfolk placed (`/realm:npc_add`) | "Tap Old Tobin or Mara in town" names NPCs that don't exist yet. "Installed" is not the same as "placed". | Gate on placed townsfolk (an npc_bp ping), or soften the line. |
| N13 | Low (process consistency) | CLAUDE.md:13, OPEN.md O66 (line 323) | Next ship session | O66's answer was "uploading is assumed; don't remind the owner". #96 also dropped "plus the new `.mcpack` files" from step 4. hosting's CLAUDE.md still says "hand over any new pack files", and OPEN.md says the hosting change `79cd7cbb` is an unmerged local branch commit. The two repos now disagree. | Either keep handing over files (the owner did not ask to stop) or merge the hosting change. Make both CLAUDE.md files say the same. |
| N14 | Low (docs audience) | docs/SERVER_SETUP.md:218 | A stranger running their own server | "It is assumed the Realm Bundle and Realm Resources get uploaded to the Realm after each release; the owner does it" is a rule for this Realm's maintainers, in the guide for outside server owners. | Keep the sentence in CLAUDE.md/WORKING.md only; restore generic update steps. |
| N15 | Low (tests weakened) | tools/test-bds/examples/find-index.js (restart half) | Regression in the private index's save/restore | The restart half now switches to world-wide mode (`privateIndex: false`), because simulated players get new ids. Native restart coverage of the private index (the default for new worlds) is gone, and find-marker does not restart. | Add a unit test of private-index persistence (owner/opened sets survive reload), or a native fixture that keys by name. |
| N16 | Low (tests, verify) | tools/test-bds/examples/diag-owned-reload.js:33-34 | Diag ownership semantics | Phase 1 now expects the probe to own 4 keys, including `help:orphan` (help_bp's declared prefix) and `mystery:z`. That locks in "the writer claims another pack's prefix", which is close to what F23 wants changed. | Re-check against F23 before F23 is fixed; assert the intended ownership, not the observed one. |
| N17 | Low (bookkeeping) | packs/stash_bp/scripts/pages.js:1240, :1262, :1391; FIXES.md F1/F2/F44/F54 | Next session runs FIXES.md | F1 (locked stacks skipped in the final loop, plus a unit test) and F2 (routing only at <=1 free slot, stopping at 2) look fixed in code. F44 (build-beds `--port`, welcome-generic-bundle wiring, diag-owned-reload) and F54 are addressed. FIXES.md still lists them unchecked; F1 has no BDS scenario and F2 has no re-measurement, both of which FIXES asks for. | Mark them with shas in FIXES.md. Add the F1 native case and the F2 autostore-perf re-measure. |
| N18 | Low (quality) | packs/map_bp/scripts/reset.js (43/43 CRLF), objectives.js (106 of 3532 lines CRLF), pages.js (98), several tools tests | Diffs and tools that split on "\n" | Mixed and CRLF line endings in shipped scripts; no `.gitattributes`. Mostly pre-existing at aef10dc. | Normalize to LF; add `* text=auto eol=lf`. |
| N19 | Low (docs) | docs/PACKS.md:1598 | Operators reading saved data | `map:reset` is now max(previous+1, Unix seconds), not a reset count. The row (and the reset.js header comment, "how many resets") no longer says what the value is. F16 (new players told "an operator reset") still applies with the much larger numbers. | Document the value. Fix F16 as planned. |

Checked and found sound (not findings):
- expedition `await sleep(2)` after `removeArea`: the slot stays reserved (`pending`/run) until `resetBox` returns, the unit test covers it, and a restart mid-sleep just re-runs the idempotent reset.
- saga actors use `getPlayers({ excludeGameModes: [Spectator] })` with `spectatorsExcluded` (the shared name-labels copy supports both).
- The welcome `askInstalled` in-flight promise fixes concurrent joins.
- The editor round-trip of the default stores nothing.
- `.label()` is used, never `.header()`; the text is ASCII.
- No new test-only paths in pack code.
- No new per-tick loops; defeatSpawnTick runs inside the existing 1 s loop.

## Owner-decision check (#96 vs the owner's answers)

| Owner answer | Implemented in #96? |
|---|---|
| O63 leave packaging as is | Yes. `tools/standalone.json` is `[]`, no merges, slots default on; OPEN.md:315 matches. |
| O64 keep finale rewards (generous) | Yes. STORY_BIBLE "Approved exception", `check-stories.allow.json` reasons and `story-content.test.mjs` renamed to approved; no amounts changed. |
| O65 acknowledged | Recorded (OPEN.md:321). But the four notes are still player bullets in NEWS (N6). |
| O66 uploads assumed, don't remind | Yes: the sentence is in CLAUDE.md step 4, WORKING.md step 7 and SERVER_SETUP.md:218. Beyond the answer: it also drops handing over `.mcpack` files, and hosting is not updated (N13). Wrong audience in SERVER_SETUP (N14). |
| O43 one generic welcome incl. the Realm, synopsis, no spoilers | Yes: welcome_bp 1.5.10 (one scrolling form, three sections, a day-one synopsis, installed features, one-time legacy migration), with tests. Minor issues N10-N12. |
| Realm size Small (10, usually 1-4 online) | Recorded (OPEN O43 line, PACKS/SERVER_SETUP "Small Realm defaults stay unchanged"). No default changed. |
| O46 no credit work now; pre-release TODO doc | Yes. `docs/RELEASE_TODO.md` ("Before a public release (no date yet)", the Easy Building / Effortless Building v5.0 item), linked from README.md:97 and WORKING.md:17. |
| (none) "owner-accepted 40-player shortfall" | **No owner answer behind it** (N1). |
| (none) "owner-directed soak deferral" | **No owner answer behind it**; the quote is the contributor's (N2). |
| (none) "Finalize all audit dispositions" | Not an owner decision; it closes deferred items as WON'T FIX or DONE (N3). |
