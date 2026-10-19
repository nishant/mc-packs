# Track: saga-engine (saga_bp, everything but scripts/stories/)

Worktree /home/user/wt/saga-engine, branch audit/saga-engine, 12 commits on 78f592a (origin/master merged at the start
and again before the final checks: nothing new). No manifest bumped, no docs/tools/shared copies edited. Not touched:
`scripts/stories/` (story track), `name-labels.js` (entities track), `side.js`/`settings.js`/`zones.js` copies, and
objectives.js lines 120-260 (msftMyt PR #84, outline particle bindings: its only hunk is @@ -137,9; my objectives.js
edits are at the note/timeWait/tickPlayer/playerGone code, far from it).

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | blocker (perf) | saga_bp | ui.js:1527 `clipTo` | Every quest box draw (every player with a quest, every 2 s) cut the text with `byteLength(out + ch)` per character: O(n^2) on ~300-500 bytes, ~8 ms per call in Bedrock's interpreter. Measured with the new saga-perf-quests soak (everyone on 2 quests): saga 1.60 ms/tick at 10 players, 4.99 at 40, single ticks up to 283 ms (the once-a-second loop took ~95 ms at 40 players) | Count bytes once, slice once (fast path when it fits) | XS | fixed e217089 |
| 2 | high (baseline fail) | saga_bp | ui.js:405 `trackButtons` | A player who tracked a quest before joining a party had no Track this quest button for it (only for untracked quests), so the party could never be given it ("saga-party-story" failed: Ann's page had only Stop tracking) | Offer "Track this quest / For your party too" while a mate on the same story follows another; trackQuest skips mates already on it (no message spam) | XS | fixed be7baf1 (saga-party-story fails before, passes after) |
| 3 | medium (perf, recent #8) | saga_bp | ui.js:1351 `track` | The quest box was resent every 2 s per player even when unchanged: 0.50 realm:side per player per second, each parsed and cleaned by all 7 side.js copies (~0.2 ms per event per copy at 40 players) and redrawn as a 3473-byte title | Remember the last box per player; write it with 300 ticks and again only when it changes or has < 60 ticks left; take it down (side.clear) when no quest/tracker off/hotbar chosen | S | fixed 9d16657: 0.50 -> 0.22 side writes per player per second with players moving (1 write per 12 s standing still, was 6); setTitle/tick halved |
| 4 | medium (perf) | saga_bp | actors.js:153 `updateActorLabels`, runInterval(2) | Ran the full nameplate sync every 2 ticks with no story character on the server: getGameMode for every player plus getEntities of the label type in 3 dimensions. Top saga callback in the soak: 0.11 ms/tick at 10 players, 0.20 at 40, for nothing | With no labeled character, sync once (removes the last helpers) then sweep for strays every 50 calls (5 s) | XS | fixed 8cc617e: saga idle 0.148 -> 0.045 (10), 0.280 -> 0.094 (40) ms/tick |
| 5 | medium (perf) | saga_bp | objectives.js:2875 `collect`, main.js:86 | "Items to have" steps read all 36 inventory slots every second per player per step (the 2nd biggest saga cost with quests going, ~5 ms/s at 40 players); and every tracker was drawn on the same tick (all players every 2 s) | Count on `playerInventoryItemChange` (and every 10 s, and at once for a step not counted yet); stagger the tracker so half the players draw each second | S | fixed c62d35e: quests soak at 40 players 1.06 -> 0.81 ms/tick, max tick 61 -> 39 ms |
| 6 | medium (C24) | saga_bp | ui.js:1847,1859 `opTools`; places.js:985 `placePage`, 860 `previewBuild` | Operator rights were checked only when /realm:saga showed the operator buttons: a player de-opped with the menu open could still Reset a player's stories, Finish a step, or Remove/Relocate/Build/Set a story place | `isOp` again on every press, with "Only operators can ..." | XS | fixed 2819bf5 (saga-op-deop: 5 checks fail before, pass after) |
| 7 | low (recent #6) | saga_bp | objectives.js:317 `note` | A progress note (defense "wave 1 of 3", quarter counts with the tracker off) wrote the quest segment: the 10-row box shrank to one line for 2-3 s, and the tracker skipped its redraws meanwhile | A note goes to the small box at `trackerAt` as a second readout ("saga/note"); only when another pack's readout holds that box does it take the quest box's place as before | XS | fixed ec4d608 (saga-note-box fails before, passes after) |
| 8 | low (recent #9) | saga_bp | objectives.js:799 `timeWait` | With `doDaylightCycle` false (common on public servers) "wait for midnight (in about N min)" counted down minutes that never pass | Read `world.gameRules.doDayLightCycle`: "wait for midnight (the time of day is stopped on this world)" | XS | fixed f9e57c5 (saga-time-stopped fails before, passes after) |
| 9 | medium (tests, infra #21) | tools/test-bds | examples/saga-untrack.js | Looked for the tracker in `right4` (moved to Side HUD's quest segment by #88) and subscribed to realm:track after the only message (realm:track goes only on change) | Read any saga readout; listen before Ann joins; header runs its own file | XS | fixed 7abddad, 64228c3 (old file fails "both quests in the box; wrote []"; new passes 3/3) |
| 10 | medium (tests, baseline fail) | tools/test-bds | examples/saga-escort.js:103 | Pell's nameTag is `marker` or `marker§r` (the name-label helper's 1 s / 3 s resend toggle, by design, accepted by `matchesHiddenMarker`); the check allowed only the first | Accept the optional extra `§r` | XS | fixed c6b4343 |
| 11 | medium (C23/C16) | saga_bp | objectives.js:3100 `sweepChampions`, actors.js:283 entityLoad | The no-Champions-pack fallback champion (named, health boost up to amplifier 30, tag `saga:champion`) in a chunk that isn't loaded at world load is never removed: the entityLoad cleanup only knows `saga:actor`/`saga:add`. After its story is done it roams for good | Keep the ids spawned this session; on entityLoad remove a `saga:champion` that isn't one of them | XS | deferred: no scenario can show it. On this harness `t.restart` loses every entity in a chunk unloaded before the restart (a plain control cow vanished too), so the leftover never comes back to test |
| 12 | low (perf) | saga_bp | ui.js:1340 `track` | Still the biggest saga cost with every player on a quest: ~0.24 ms per tracker draw (trackLine + questBox ~0.15) every 2 s, ~0.5 ms/tick at 40 players | Skip the draw for a player who hasn't moved a block, made progress or got a clock in the box, at most 10 s; or move the box text build to a runJob | M | deferred: needs a careful staleness rule (NPCs walk, party lines, weather and time waits); measured numbers in the perf table |
| 13 | low | saga_bp | objectives.js:1927 `escortFast` | Calls updateActorLabels after every 2-tick escort step on top of actors.js's own 2-tick sync: two full label syncs per tick pair during escorts | Let the interval do it (or sync only that actor's label) | XS | deferred: label smoothness behind a walking escort is the entities track's call (name-labels design) |
| 14 | low (C20) | saga_bp | util.js:233 `open` | The walk-through regex has `dead_bush`; Bedrock's id is `minecraft:deadbush`, so a dead bush counts as solid: spawn spots and ground on desert sand land one block up | `dead_?bush` | XS | deferred: one-character id fix, routed to the lead with the other id notes (no scenario) |
| 15 | low (C13) | saga_bp | objectives.js:1335 beforeEvents.playerInteractWithEntity | No `if (ev.cancel) return;`: a story character tapped inside someone's claim still talks | First line `if (ev.cancel) return;` | XS | deferred: harmless (it only cancels more and opens the player's own dialogue) |
| 16 | low (C22) | saga_bp | data.js:355 `flush` | Over 30,000 characters after dropping finished stories' chapter lists it only warns; above 32,767 setDynamicProperty throws and that save (all progress since the last one) is lost | Second trim (codex order, old favors `fv`, `ut`), then refuse new codex entries with a message | S | deferred: no realistic save near the limit (59 stories, flags and choices only); needs a maxed-save test |
| 17 | low (C21) | saga_bp | objectives.js:233 `interactBlocks` | First outline of an interact step scans up to 25x25x17 = 10,625 getBlock calls in one tick (once per scene, again when a found block changes) | Spread the scan with runJob | S | deferred: inside msftMyt PR #84's area (outline code) |
| 18 | low | saga_bp | objectives.js:2836 `weatherAsked` | Keyed "player\|objective", never pruned on leave (grows by one per player per survive/vigil step) | Delete the player's keys in playerGone | XS | deferred: tiny (one entry per player and step) |
| 19 | low (flaky) | tools/test-bds | examples/saga-escort.js:170 | "facing the way he walks" failed once under load (4 of 24 moving samples faced east, 32 samples), passed on the rerun (42/51) | Sample by tick instead of wait(2) under load | XS | deferred: load-sensitive, passes alone |
| 20 | low (docs, new) | docs | PACKS.md Story Questlines "The tracker" | Still says the box "skips its update while another pack's readout is in the same box" and that notes make it wait in either place (both changed by #88 and here); testing hook misses `race_expire`, `age_adds` | See DOCS | XS | for the lead |

Checked and fine: C6 (every saga spawn goes through `spawnFresh`, which checks `typeId`; escorts, guards, wards, adds,
lead animals, champions; sieges are calendar_bp's), C10 (no `.header(`), C11 (`weatherChange` accepts both ids), C12
(`crownsOf`/`repOf` wrapped), C18 (every setActionBar is preceded by realm:actionbar; vision titles use holdTitle and a
one-space subtitle), C19 (`giveItem` drops only the leftover), C26 (`is_tamed` first), C17 (forms: `show` retries
UserBusy 20 times and stops on close; every await in startChapter/endChapter re-checks `isValid` and the chapter state
before paying; party reports re-check each mate), saved data (`ut` capped at 40, places and camps bounded, `PLACED_MEMORY`
2000), recent-changes #6/#9 (mine: fixed), #8 (tagged hud, but the code is saga's ui.js: fixed here, side.js untouched).

## Perf (ms/tick, `--only saga_bp,npc_bp,hud_bp`, 120 s perf-soak / 90 s saga-perf-quests)

| pack | scenario | @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|---|
| saga_bp | perf-soak (no quests) | 0.148 | 0.280 | 0.045 | 0.094 |
| saga_bp | saga-perf-quests (2 quests each) | 1.602 (max tick 85) | 4.993 (max tick 283) | 0.271 (max tick 16) | 0.809 (max tick 39) |

Budget 0.15 ms/tick: met idle at 10 and 40 players; with every player on quests saga is still ~0.8 ms/tick at 40
(the window includes 40 players accepting 80 chapters; the steady part is the tracker, finding 12). Before -> after
per commit at 40 players with quests: e217089 4.99 -> 1.06 (with 9d16657), c62d35e -> 0.81.

## Scenarios added (tools/test-bds/examples/)

| scenario | before | after |
|---|---|---|
| saga-perf-quests.js (perf soak with quests; reports realm:side/track per player per second) | 0.50 side/player/s | 0.22 |
| saga-note-box.js | fail (note in slot quest, box replaced) | pass |
| saga-box-resend.js | fail (6 writes in 12 s standing still; never taken down) | pass (1 write) |
| saga-time-stopped.js | fail ("in about N min" with the cycle off) | pass |
| saga-op-deop.js | fail (5 checks: reset and Remove went through) | pass |
| saga-collect-count.js (regression guard for c62d35e: counted 15-20 ticks after /give) | pass | pass |
| changed: saga-party-story (no edit, code fix) | fail | pass |
| changed: saga-untrack.js, saga-escort.js (scenario fixes) | fail | pass |

Saga suite (`suite.mjs --jobs 1 --filter '^saga-(?!perf)' --retry`, 27 scenarios): 26 pass, 1 fail (saga-note-box, whose check
still expected a box write during the note after 9d16657 stopped resending an unchanged box; fixed in the scenario,
5480ba2, fails 3 checks on the pre-fix note code, passes after). The 3 baseline failures (saga-escort,
saga-party-story, saga-untrack) now pass.

## DOCS (docs/PACKS.md, "Story Questlines — `saga_bp`")

- "How it works", **The tracker** bullet: replace the first two sentences with: "**The tracker** shows in [Side
  HUD](#side-hud--hud_rp)'s quest box, next to the box chosen with `trackerAt` (default `right4`), with the side boxes
  protocol (`scripts/side.js`): it is recomputed every 2 seconds (half the players each second) but sent only when it
  changed, or again shortly before its 15 seconds run out, and taken down when no quest is left. Progress notes (a
  defense's waves; quarter counts while the tracker is off) show in the small box at `trackerAt` beside it, as a second
  readout; when another pack's readout holds that box, the note takes the quest box's place for its length and the
  tracker waits." Keep the rest ("Above the hotbar it listens ...").
- **Counting** bullet: "collect (counted when the inventory changes, and every 10 seconds)" instead of collect in the
  once-a-second list.
- **Testing hook** bullet: add `"action":"race_expire"` (ends the player's running races now) and
  `"action":"age_adds","seconds":600` (story monsters and running defenses that much older, then the 10-minute expiry).
- **What players see** / story log: add "On a quest you already track, **Track this quest** (For your party too) shows
  while a party mate on the same story follows another quest."
- **Commands**: `/realm:saga` row, add: "Operator tools check your operator rights again on every press."
- A vigil waiting for a time of day with the daylight cycle off says `the time of day is stopped on this world`
  instead of a countdown (one sentence under the vigil/what players see list).

## NEWS (plain ASCII, player-facing)

- The story quest box stays put during defense waves: wave notes now show in the small box beside it.
- In a party, Track this quest also works on a quest you already track, so your mates follow it too.
- Quests that wait for night say so when time is stopped on the world, instead of counting down.
- The story tracker is much lighter on busy servers (it was the biggest script cost with everyone on a quest).

## Requests for the lead

- Bump saga_bp once (ui.js, objectives.js, actors.js, main.js, places.js changed).
- Docs above; then help-catalog (Commands row change) and gen-news.
- entities track: name-labels' `dim.spawnEntity(labelType)` has no `typeId` check (C6) and saga's escortFast calls
  updateActorLabels every step (finding 13); the idle skip in actors.js (8cc617e) is outside name-labels.js and keeps
  its API.
- hud track: recent-changes #8 is done on saga's side (quest box diffed, 300-tick writes); side.js still parses every
  realm:side in every copy (~0.2 ms/event/copy at 40 players): a cheap `m.from` check before `JSON.parse` would help all.
- infra: saga-untrack.js header now names itself (same change as infra's fabac63; identical lines merge cleanly).
- Route finding 14 (`dead_bush` -> `deadbush` in saga util.js) with the other id fixes; finding 11 needs a harness that
  keeps entities across `t.restart` in unloaded chunks.

## Phase 2 ideas

1. Tracker cost per player: skip unchanged draws for idle players (position, progress and clocks unchanged), target
   < 0.15 ms/tick at 100 players with quests; add saga-perf-quests at 100 players to the perf budget run.
2. Siege and escort outcomes, chapter completions and act endings as `realm:mail_send` letters for offline party
   mates (Saga already sends mail for its own letters).
3. A "first hour" chapter for newcomers (meet Old Tobin, first favor, first tracker use) offered by the story log when
   no story was started, for public servers without an operator to explain.
4. `/realm:saga_reset` with a "forget everyone who hasn't joined in N days" option so per-player saves of one-time
   visitors can be cleared on 1,000+ player servers (and a world-data size readout in Operator tools).
5. Story places for several towns: per-town place sets (`place@town`) so a big server's second town gets its own
   Lighthouse and Watchtower instead of sharing one.

## Review

Independent review of 78f592a..5480ba2 (the track's 12 commits; a4cccca..78f592a is the master merge). No blocker or
high confirmed, so no review commits; head stays 5480ba2. origin/master has nothing new.

Checked and fine: clipTo (the `length <= max/3` fast path is a sound bound: at most 3 bytes per UTF-16 unit; the slow
path counts the same bytes as byteLength); `world.gameRules.doDayLightCycle` and `playerInventoryItemChange` are in
@minecraft/server 2.1.0 typings; the new op checks run after the awaited form, and a player who left gets canceled
before isOp is read; collect keys are story:chapter:index, so a new step is counted at once; boxSent is keyed with
`trackerAt`, cleared on leave, busy, tracker off, hotbar and no quest. Rules: only saga_bp and new or fixed saga
scenarios were edited; no manifest, docs, catalogs or shared copies; game text is ASCII; no `.header(`; no new
commands or events. PR #84: `git merge-tree` of HEAD with origin/msftmyt-quest-objective-outlines auto-merges
objectives.js; the only conflicts (NEWS, help/news/saga manifests, release.js) are the same as on 78f592a, so they are
not from this track. PR #86 (stash_bp) is not touched.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | tools/test-bds/examples/saga-escort.js:166, objectives.js:1986 | saga-escort is still flaky in isolation. "facing the way he walks" failed in 4 of 10 runs alone on HEAD, in both suite attempts (the retry also failed "Pell walked"), and in 1 of 7 runs on the pre-track code with the same scenario. The failures are bimodal (4-9 of 35-45 moving samples face east, against 33-45 when it passes). The likely cause is the villager's look-at-player AI turning Pell back toward the player between the 2-tick teleports. The track's "baseline failure now passes" holds for the marker regex only | deferred: not a regression (pre-track code fails the same way). It needs Pell's look-at goal suppressed during escorts (entity component group, entities track) or a check on body yaw |
| medium | ui.js:1384 (9d16657) | An unchanged quest box is now rewritten only every ~12 s. The title can be dropped outside the title protocol: another add-on's or an operator's `/title`, or possibly the client clearing titles on a dimension change or respawn. Then the box stays missing for up to 12 s (it was 2 s) when no other side-box pack redraws the shared picture | deferred: BDS can't show client title resets. Cheap hardening: `boxSent.delete(player.id)` on playerSpawn and playerDimensionChange |
| low | main.js:89 (c62d35e) | The stagger parity is `(runs + index)`, so a join or leave earlier in getAllPlayers() shifts it. A player can then go 3 s without a draw. Together with a 40-tick fallback note (another pack holds the trackerAt box), the ownUntil window can be missed, and the box stays blank until its renewal (up to 12 s) | deferred: rare (a fallback note and a join in the same second). Fix: stagger on a stable per-player value (a hash of the id) |
| low | places.js:967-985 (2819bf5) | Remove and Relocate check op before the action, but the action then awaits its own "Are you sure?". A de-op during that question still removes or moves the place. opTools re-checks after its question | deferred: narrow window, one-line fix (`if (!isOp(player)) return` after `confirm`) |
| low | ui.js:411 (be7baf1) | `mateElsewhere` counts a mate with no `tr` who already sees this quest through the party view, so the extra Track button shows needlessly | deferred: harmless; pressing it only sets the mate's tr and sends one party message |
| low | main.js:83 / ui.js:1388 | With saga `enabled` switched off, the loop returns before track(), and the last quest box stays up for up to 15 s (BOX_TICKS 300; it was 2.5 s) | deferred: cosmetic, one time |
| low | objectives.js:2912 (c62d35e) | With counting skipped between inventory changes, a mate who comes near gets a done items-to-have step shared up to 10 s later (it was 1 s). A step whose progress is reset (op reset, same chapter restarted) with the inventory unchanged shows the old count for up to 10 s | deferred: bounded by COLLECT_RECOUNT, no wrong final result |

Deferred items from the track (11-20): I agree with the reasons. Finding 11 (fallback champions left in chunks unloaded
at a restart) is medium rather than low for public servers, but it is untestable on this harness.

### Scenario results (review)

- Fail before, pass after: I ran each new scenario against a detached worktree at 78f592a. saga-time-stopped failed
  2 checks, saga-op-deop 5, saga-box-resend 1 (6 writes in 12 s), saga-note-box 3 and saga-party-story failed.
  All pass on HEAD.
- Suite on HEAD (`suite.mjs --jobs 1 --retry --filter '^(saga-(?!perf)|side-boxes|actionbar-steady|npc-far-names|wander-visible|sky-requests)'`):
  32 scenarios, 31 pass, 1 fail (saga-escort: facing, then on the retry "Pell walked"; see the first row). Run alone
  with its header flags, saga-escort passed 6 of 10 on HEAD and 6 of 7 on 78f592a.
- Perf spot check, saga-perf-quests at 40 players for 90 s: saga_bp 0.782 ms/tick (track: 0.809), max tick 34 ms,
  0.214 realm:side per player per second (track: 0.22). The blocker fix holds.
- `npm run check` passes, and so does `npm run build`.

### Review, second pass (follow-up commits)

This pass re-read 78f592a..5480ba2 and agrees with the review above: there is no blocker or high. Two of its cheap
deferrals are now fixed, one commit each:

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | places.js:926 `confirm` | Remove/Relocate checked op before their "Are you sure?" question but not after it, so a de-op while it was open still removed or moved the place | fixed 1ff5461: confirm() re-checks `isValid` and `isOp` after Yes ("Only operators can change story places."). saga-op-deop gained a third part: it fails 2 checks on 5480ba2 and passes after |
| medium | ui.js:1305 (9d16657) | An unchanged quest box is renewed only every ~12 s, so a title the client dropped on a respawn or dimension change stayed missing that long | fixed 460d056 (hardening): boxSent is forgotten on playerSpawn and playerDimensionChange, so the next tracker run (<= 2 s) redraws. No scenario: BDS can't show a client title reset |

The rest of the review table stays deferred for the reasons it gives. Scenarios after both commits
(`suite.mjs --jobs 1 --retry --filter '^(saga-(?!perf)|side-boxes|actionbar-steady)'`): 29/29 pass, 0 flaky. saga-escort
passed this time, but it is still known to be flaky (first row above). `npm run check` and `npm run build` pass.
origin/master: nothing new.
