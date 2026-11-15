# Realm rework 02: the story lead

Status: in progress · Slug: realm-rework-02-story-lead · Date: 2026-11-15 · Size: medium
Repos: `nishant/mc-packs` (spec lives here), `nishant/skills` (one line in `MANUAL-STEPS.md`, at release)
ROADMAP: `ROADMAP.md`, entry `## Realm rework 02: the story lead` (one paragraph pointing at this file; deleted in the PR that ships it)

Program contracts: `docs/specs/realm-rework/README.md` (decisions D1-D20, contracts C1-C8). This file wins on its
own details; the README wins on C1. Depends on workstream 01 being released (it adds `packs/saga_bp/scripts/text.js`).
If `packs/saga_bp/scripts/text.js` or `tools/text-shared.js` is missing on `origin/master`, stop: 01 has not shipped.

## Goal

A player who opens the game after weeks away, a new player, and a player between two chapters all see the same
thing today: an empty story tracker and no Minimap star. This workstream makes Story Questlines (`saga_bp`) work
out one fact per player, the **lead** (the one thing to do next, in words, with a place), shows it on the tracker
and the Minimap, and publishes it to other packs as `realm:saga_lead`. It also fixes five small bugs that give
wrong or missing directions.

Outcomes (each checkable):

1. A new file `packs/saga_bp/scripts/guide.js` exports `nextStep(player)`, `leadOf`, `idleDays` and the ladder
   below; `node --test tools/saga-lead.test.mjs` pins the ladder order and the 900-character size bound.
2. A player with story left to play and no accepted chapter has a quest box (or a line above the hotbar) that says
   who to talk to, with a direction and distance, and `realm:track` carries that target
   (`tools/test-bds/examples/saga-lead.js`).
3. Directions to a townsfolk work when the NPC entity is not loaded, from Townsfolk's `realm:npc_places`.
4. `saga_bp` sends `realm:saga_lead` exactly as contract C1 says: within 2 s of a join, on change, and on
   `realm:saga_lead_ping`.
5. The tracker's order is: the quest picked with Track this quest; a finished main chapter to report; the party's
   chapter; another finished quest to report; a quest accepted this session; the main story; the rest. After a
   login the main story leads again.
6. An accepted daily favor that was not finished runs out after `favorDays` (2) real days, with one chat line
   (`tools/test-bds/examples/saga-favor-expiry.js`).
7. The Story Log's home line names the story in progress between chapters (6.1); lock reasons name the real cause
   (6.6); `Current quests (N)` counts what the page lists (6.10); looking at an intro and picking Not now creates
   no saved story state (6.11); the accept line does not say the tracker points the way when the tracker is off
   (6.14).
8. `saga_bp` costs at most 0.03 ms a tick more at 40 players than before, measured as a pair.

## Out of scope

- The `/realm:saga` front door (`Your Story`), `Previously`, picks, offer order at NPCs: workstream 03. This
  workstream adds no form and no button.
- The saved fields `ls` (last seen) and `rc` (recap shown): workstream 03. Only `la` is added here.
- Content fields (`opensAfter`, `recap`, goal lines): workstream 04. Party proposals and votes: workstream 05.
- Any consumer of `realm:saga_lead` (03, 09, 11, 12). `map_bp` and `npc_bp` code is not edited: the Minimap
  already resolves `realm:track`'s `npc`, and Townsfolk already sends `realm:npc_places`.
- The daily reset hour (D17, workstream 12): favors keep using `today()` (UTC days).
- `packsNeeded`'s `Needs expedition_bp to go on` wording (it names the folder): unchanged.
- The 168 px button rule and `tools/saga-menu-width.test.mjs`: workstream 03 (no button changes here).

## Decisions

- **D9** (README): one fact, the lead, chosen by `nextStep(player)`; everything else reads it.
- **C1** (README) is implemented without change. Where C1 is silent this spec defines the meaning (Design, Data).
- **D19 / C7** (README): the hotbar lead line is cut with `fit` and `widthOf` from `./text.js`. No other width
  helper is written. The quest box keeps its own row logic (`rowsOf`, `layoutBox`), which wraps and never cuts.
- L1 (default): `Next.st` uses C1's `st` values plus `"none"`, and a `Next` carries C1's fields under C1's
  names, so workstream 03 can use it as a C1 object. The research's kinds (`lead`, `blocked`, `done`, `off`) are
  not used. `nextStep` never returns `undefined`: "nothing to point at" is `st: "none"`.
- L2 (default): **one authority.** The tracker's top is the lead's quest. The research had two orders (a ladder
  for menus, a sort for the tracker) that disagreed for finished side quests and quests accepted this session;
  both are rows of one ladder here. The only time the box's top differs from the lead: the player stopped tracking
  that quest, or turned the lead off.
- L3 (default): hiding the lead is a preference, not a saved story field: world option `leadTracker` (default
  `true`) and player preference `leadTracker` in `/realm:prefs`. Off: no lead in the box, above the hotbar or on
  the Minimap; `realm:saga_lead` is still sent. (The research proposed `"main"` in `saga.ut` and a button in
  Continue; 03 can call `setFor(player, "leadTracker", false)` from its button.)
- L4 (default): `favorDays` world option, 1 to 14, default 2. A favor accepted on UTC day D can be finished on D,
  D+1 and D+2 and is dropped the first time it is tidied on D+3 or later.
- L5 (default): a lead's distance is rounded (to 5 under 100 blocks, to 20 under 1,000, to 100 above) so the box
  of a player who is not following it is rewritten rarely. An accepted quest's distances stay exact.
- L6 (default): no chat line when the lead changes. The existing `[Story] Next: talk to ...` line gains a
  direction.
- L7 (default): for an NPC whose post is known and who is more than 48 blocks away or in another dimension, the
  post is used without asking the game for the entity.
- L8 (default): lock reasons are imperative phrases, because they are also used after `you need to:` in the party
  line (`party.js` `partyTick`).
- L9 (default): `la` (last story step) is stamped on progress and on a finished chapter, favor or job. Accepts are
  already stamped by `t`.

## Current state

Line numbers are for commit `470be3d` (`saga_bp` 1.16.25, before workstream 01). 01 moves lines in
`objectives.js` and may move them elsewhere: find everything by function name.

`packs/saga_bp/scripts/ui.js` (1,938 lines)
- `npcCache`, `npcAt` 87-104; `bearing` 107-113; `towardNpc` 116-124 (returns `""` unless the NPC entity is loaded
  or it is a Recurring Wanderer with a camp); `hidden` 127; `stepLine` 175-182.
- `trackQuest` 349-366, `untracked` 369 (exported, used only in `ui.js`), `showAgain` 372-376, `untrackQuest`
  383-391, `trackedFirst` 398-406 (exported, used only in `ui.js`): tracked, else the party's chapter, else the
  newest `st.t`, favors included.
- `startChapter` 597-641 calls `stateOf(saga, story)` at 600, before the dialog (6.11). `accept` 647-699 ends with
  `The tracker ... points the way` at 691-694 whatever the player's `tracker` preference (6.14).
- `complete` 891-944: `Next: talk to <npc> for "<title>"` at 926 with no direction; the `New story:` loop at
  938-941 skips any story that has a state object.
- `favorInfo`'s give-up 985-997 ends the favor's scenes. `tidyFavors` 1026-1038 deletes only claimed or
  never-accepted favors of an earlier day.
- The tracker: `Pointed`, `pointed`, `pointedAt` 1177-1184; `npcTarget` 1187-1193; `trackLine` 1196-1215;
  `pointAt` 1218-1283; `watchText` 1291-1296; `trackSent`, `boxSent`, `BOX_TICKS`, `BOX_RENEW` 1299-1315;
  `clearBox` 1318-1325; `sendTrack` 1332-1344; `resendTracks` 1347-1349; `track` 1356-1399.
- The box region, `const BOX_COLS` (1405) to the `// The story log (/realm:saga)` divider (1614): `rowsOf`,
  `fitRows`, `fitTail`, `whereOf`, `partyLine`, `questBox` 1520-1549, `KEEP_PRIO` 1557, `layoutBox` 1566-1597,
  `clipTo`.
- `sortStories` 1641-1664; `showMenu` 1667-1701 (home lines 1677-1681 use `available[0]`, stories with no
  progress at all: 6.1; the count at 1684 leaves out a party quest whose story is not in `current`: 6.10);
  `currentPage` 1704-1739; `availablePage` 1742-1755.

`packs/saga_bp/scripts/main.js` (805 lines)
- The player loop 70-121: `if (get("enabled") !== true) return;` at 97; an empty `entries(player)` sends an empty
  `realm:track`, clears the box and `continue`s (107-110); `track(...)` at 116 every 2 s per player
  (`TRACKER_RUNS`, `idSlot`) or the run after progress.
- `onDebug` 376-434; its permission gate is at 570 (`!(sourceEntity instanceof Player) ||
  sourceEntity.commandPermissionLevel >= CommandPermissionLevel.GameDirectors`).
- `onScriptEvent([...], handler)` 446-583: early `if (id === ...) { ...; return; }` blocks, then the guard at
  533-543. `tools/check-event-guards.mjs` fails if a registered id reaches that guard and is not in it.
- `worldLoad` 720-740 (timeouts at 60, 80, 90, 95, 100, 110, 120 ticks); `playerSpawn` 742-755 (only
  `wanderJoined`); `afterEvents.playerLeave` 768-778.

`packs/saga_bp/scripts/data.js` (885 lines)
- `Saga` typedef 41-50; `today` 140; `versions` 266 (bumped by `invalidate`, 400-402; not exported); `sagaOf`
  283-320 validates the fields it knows and keeps the rest; `trimSave` 342-374 never drops unknown fields;
  `stateOf` 445-449 creates a state; `installed` 460.
- `requires` 566-599: line 592 turns every failing flag that is not `g:aff_*` or `cal:festival` into `make
  different choices earlier in the story` (6.6). Two stories are hit: `the_calling` (`g:calling_ready`,
  `pack:skills_bp`) and `listening_deep` (`pack:expedition_bp`).
- `currentChapter` 627-636; `packsNeeded` 644-653; `chapterNumber` 656-664; `PartyView` typedef 784-787 and
  `partyViews`; `onHold` 795-798; `entries` 806-815; `ownEntries` 818-868.

`packs/saga_bp/scripts/party.js`: `frontier` 99-118 (the first unfinished main chapter, with `why` when the story
cannot start); `partyTick` 172-243 computes `real` (members who have the party chapter accepted), `behind` (names
of members whose own next chapter it is, line 203) and sets each member's view (218-219). Views hold only
`{ story, chapter, ghost? }`.

`packs/saga_bp/scripts/objectives.js`: `progressed` 378, `holdUntil` 381, `TRACKER_STEADY` 387, `ownUntil` 390,
`showLine` 403-412 (sends `realm:actionbar` before `setActionBar`), `reportTo` 431, `bump` 437-479.

`packs/saga_bp/scripts/settings.js` `OPTIONS` 12-34 (a world option and a player option may share a key; the
player one names the world one with `base`); `config.js` `CONFIG`.

Other packs (read only)
- `packs/npc_bp/scripts/main.js` 248-286: `realm:npc_places { part, parts, folk: [{ id, n, dim, x, z }] }`, parts
  under 1,800 characters, `{ part: 1, parts: 0, folk: [] }` for an empty list; sent when the list changes and on
  `realm:npc_places_ping` (2487-2490, answered once Townsfolk's `worldLoad` ran).
- `packs/map_bp/scripts/main.js`: `collect` 323-337 (how parts are joined); `realm:track` 2580-2587 keeps
  `{ n, spot?, npc? }`; the star resolves `npc` from its own copy of `realm:npc_places` (585-590).

Facts from the data (`packs/saga_bp/scripts/stories.js`, loaded in Node): 59 stories; 7 are `main` (two prologue
stories with act 0, `drowned_bell` at `tobin` and `last_map` at `mara`, then `act1_signs` to `act5_lantern`); main
stories require only earlier main stories. Longest story title 28 characters, `short` 18, chapter title 30, NPC
name 27 (`Anwen, the Surveyor's Ghost`), story id 18. `drowned_bell` chapters: `salt` (tobin), `choir` (reyes),
`vigil` (tobin), `iron` (ida), `sunken` (ida), `warden` (bram, reports to tobin).

Traps
- Four unit tests read `ui.js` as text. `tools/saga-quest-box.test.mjs` runs the box region in a `vm`: it needs
  the literal lines `const BOX_ROWS = 10;` and `const BOX_BYTES = ...;`, the divider comment, `const listNames =`
  on one line, and no new top-level statement in the region that uses an import. `tools/saga-pack-fallback.test.mjs`
  needs `const needs = packsNeeded(story, saga);` directly followed by `const step = needs.length` in
  `currentPage`. `tools/saga-gossip.test.mjs` needs line 3 of `ui.js` unchanged.
  `tools/saga-interaction-lifecycle.test.mjs` runs `codexPage`, `listenIn`, `inviteSide`, `pickPlayer`, `opTools`.
- `tools/o2-hotpaths.test.mjs` ("saga: the once-a-second loop ...") loads the real pack in `tools/lib/pack-sim.mjs`
  with two players who have no quests and allows 13 `world.getAllPlayers()` calls in 10 runs. The lead now runs
  for them: no code in the lead path may call `world.getAllPlayers()`, `online()` or `partyMates()`.
- `tools/check-events.mjs` flags a send whose payload text (or the `const` it was set from, up to 25 lines
  earlier) contains `.map(`, `.filter(`, `.join(`, `[...`, `Object.entries(` or `.nameTag`. Build the lead message
  in a function and send the result.
- `npm run check` starts with `tsc -p .`: every new function needs JSDoc types that pass.
- `bump()` does not call `invalidate()`: a chapter can become done without the entry cache version changing.
- A simulated player gets a new `player.id` on every spawn (`tools/test-bds/README.md`, Limitations), so "days
  away" is driven by a debug action, never by a rejoin.

## Design

### Data

**The lead in code** (`guide.js`):

```js
/**
 * Where a tracker line points, for the Minimap (realm:track): a spot, or a townsfolk by id. (Moved from ui.js.)
 * @typedef {{ label: string, dim?: string, x?: number, z?: number, npc?: string }} Pointed
 */
/**
 * The one thing a player should do next.
 * @typedef {object} Next
 * @property {"start" | "step" | "report" | "party" | "wait" | "none"} st  C1's `st`; "none" = nothing to point at
 * @property {number} row       the ladder row that matched, 1 to 15
 * @property {Story} [story]
 * @property {Chapter} [chapter]
 * @property {Entry} [e]        the accepted chapter (or party quest) it is about; unset for a lead to an NPC
 * @property {string} label     what to do, no color codes: "Talk to Quill the Trader"; "" for "none"
 * @property {string} why       one plain sentence; "" when there is none
 * @property {string} [npc]     who to talk to
 * @property {string} [who]     npcName(npc)
 * @property {Pointed} [at]     where the tracker and the Minimap point
 * @property {{ dim: string, x: number, z: number }} [spot]  where C1 says to go
 * @property {string} [place]   a place name, when the target is a named place or a camp
 * @property {string} [dir]     without `e`: "NE 140m", "here", "in the Nether", or "" when the place is unknown
 * @property {string} [lost]    without `e`, when `dir` is "": "(/realm:npc_who)", "(needs Townsfolk)", "(on the road)"
 * @property {string} [head]    without `e`: the quest box's first line, with color codes
 * @property {string} [sub]     without `e`: the quest box's third line, with color codes
 * @property {string} [line]    with `e`: its tracker line, with color codes (what trackLine returned)
 * @property {number} [i]       with `e`: the objective that line points at, or -1
 * @property {number} more      C1's `more`
 * @property {{ on: number, of: number, hold?: string, behind: string[] }} [party]  C1's `party`
 * @property {Next} [also]      the main story's (or the party's) lead, when the headline is another quest and no
 *                              main chapter is accepted
 * @property {string} [k]       C1's `k`: story.kind ?? "side"
 * @property {string} [s]       C1's `s`: story.id
 * @property {string} [title]   C1's `title`: story.title (not cut)
 * @property {string} [ch]      C1's `ch`: chapter.title (not cut)
 * @property {string} [hint]    C1's `hint`: the same text as `label`
 * @property {string} [dim]     C1's `dim`, `x`, `z`: `spot`, floored
 * @property {number} [x]
 * @property {number} [z]
 */
```

A `Next` whose `st` is not `"none"` is therefore also a C1 object (uncut, without `player` and `v`): code inside
the pack (workstream 03's `lead.js`) can read `s`, `title`, `ch`, `hint`, `why`, `npc`, `who`, `place`, `dim`,
`x`, `z`, `more` and `party` from it. `st: "none"` means "no lead"; it still carries `row` and `why`.

**The ladder.** First match wins. "Entry" is an element of `entries(player)`; "own" means not a party quest
(`!e.pq`); "main" means `e.story.kind === "main" && !e.fav`; "done" means `chapterDone(e, saga)`. A stranger's job
that finishes by itself (`e.wv && (e.st.g || e.st.tn)` and done) is never picked. Entries the player stopped
tracking (`saga.ut`) are skipped in rows 5, 6 and 11 only.

| Row | Name in `LADDER` | Condition | `st` | `label` | `why` |
|---|---|---|---|---|---|
| 1 | (off) | `get("enabled") !== true` | none | (empty) | `Stories are paused by an operator.` |
| 2 | `tracked` | `saga.tr` is set and not in `saga.ut`, and names an entry, or a story for which `leadOf` returns a lead (not a main story while the player has a party view) | by entry (below), or start | by entry, or `Talk to <who>` | `You picked this one to follow.` |
| 3 | `mainDone` | an own main entry is done (the first in list order) | report | `Report to <who>` | `"<chapter title>" is done. Report back to hear what happens next.` |
| 4 | `partyEntry` | the player has a party view and an entry for its chapter (own or the party quest) | own: step; party quest: party | the focused step | own: `Your party is on this chapter. Progress is shared.` Party quest: `Your party is on this chapter. You are helping <hold> with it.` (`<hold> and others` when two or more are behind) |
| 5 | `otherDone` | an own entry that is not main is done (the first in list order) | report | `Report to <who>` | `It is done. Report back for your reward.` |
| 6 | `session` | an own entry accepted since the player joined (`e.st.t` later than the join time), the newest | step | the focused step | `You took this on since you logged in.` |
| 7 | `mainStep` | an own main entry, the newest `st.t` | step | the focused step | `It is the next step of the main story.` |
| 8 | `partyLead` | a party view and no entry for its chapter | on it: start; ahead of it: party | on it: `Talk to <who>`; ahead: `Meet <hold> at <who>` | on it: `Your party's next chapter. One accept starts it for everyone.` Ahead: `Your party waits for <hold> to start this chapter. Your own story waits too.` |
| 9 | `mainNext` | no party view; `frontier()` names a main story with finished chapters, none accepted, and no `why` | start | `Talk to <who>` | `<who> has the next chapter, "<chapter title>".` |
| 10 | `mainStart` | as 9, but the story has no finished chapter | start | `Talk to <who>` | no main story has progress: `The main story starts here.` Otherwise: `The main story goes on here: <story title>.` |
| 11 | `otherStep` | an own entry that is not main, the newest `st.t` | step | the focused step | `This one is still going.` |
| 12 | `otherNext` | a story that is not main, with finished chapters and none accepted, for which `leadOf` returns a lead; the newest `st.t` | start | `Talk to <who>` | `<who> has the next chapter, "<chapter title>".` |
| 13 | `otherStart` | a side, heart or festival story (never a wanderer's) with no progress that can start now; festival stories first, then side, then heart, each in `ORDERED` order | start | `Talk to <who>` | `<open> stories are open. This is one of them.` (`This is the one story still open.` when `<open>` is 1), with `You finished the main story. ` in front when `frontier()` is undefined |
| 14 | `mainWait` | no party view; `frontier()` has a non-empty `why` | wait | `To go on: <why[0]>` | `<story title> needs that first.` |
| 15 | (none) | nothing above | none | (empty) | `You have done every story there is. The townsfolk still have a favor each day.` With `favors` off: `You have done every story there is.` |

"On it" in row 8: `view.behind` includes the player's own name. `<hold>` is the first name in `view.behind` that
is not the player's.

For an entry (rows 2-7, 11): `st` is `"party"` for a party quest, else `"report"` when done, else `"step"`. The
label of a done entry is `Report to <who>` (`Your party reports to <who>` for a party quest), with
`who = npcName(reportTo(e))`. The label of a step is `labelOf(e, i, saga)` for the objective `i` the tracker line
points at, except that `survive`, `vigil` and `ride` objectives use the plain `obj.label` (their `labelOf` text
counts down every second, which would resend the lead every 2 s).

One override, for any lead with an `npc` and no `e`: when a full `realm:npc_places` list has arrived, the NPC is
not in it, no entity was found and the id does not start with `w_`, `why` becomes
`<who> is not in this world yet. Ask an operator to place them.`

**`realm:saga_lead`** is contract C1, unchanged. What C1 leaves open is fixed here:

| Field | Value |
|---|---|
| `st` | `Next.st`. A message with `st` `"none"` is the empty form `{ "player", "v": 1 }` |
| `k` | `story.kind ?? "side"`. A daily favor is `"side"` with `s` `fv:<npc>`; a stranger's job is `"wander"` with `s` `wv:<template>` |
| `s`, `title`, `ch` | story id (cut to 64), story title (40), chapter title (48) |
| `hint` | `Next.label` without color codes, cut to 120 |
| `why` | `Next.why`, cut to 120; left out when empty |
| `npc`, `who` | `Next.npc` (64) and `Next.who` (32) |
| `place` | `Next.place` (32): a place label (`Lighthouse`), a sky event's text, or a camp (`Pell's Camp`) |
| `dim`, `x`, `z` | `Next.spot`, floored. For an NPC: its post from `realm:npc_places` when known (it does not move), else where the tracker points. Never set for a secret step whose hint was not bought (`trackLine` gives no target there) |
| `more` | side, heart and festival stories with no progress that can start now, not counting the lead's own story when the row is 13; 0 to 9 |
| `party` | only with a party view: `of` = party members online (the player included); `on` = how many of them have the party's chapter accepted as their own; `behind` = up to 3 names (each cut to 20) of the members whose own next main chapter it is; `hold` = the first of them that is not the player, only when the player is not one of them |

Cuts end in `...` (`cut(s, n)`: `s` when it fits, else the first `n - 3` characters, trimmed, plus `...`). The
longest possible message is 857 characters; the unit test bounds it at 900.

When it is sent: on the player's tracker run (every 2 s, or the run after progress) when the JSON differs from the
last one sent to that player; so within 2 s of a join. Not before the first installed-packs scan has answered
(`installed.ready`, about 5 s after a world load), because leads flicker until then. On `realm:saga_lead_ping`
the last JSON of the named player (or of everyone) is sent again at once; a ping for everyone is answered at most
once in 20 ticks.

**NPC posts.** `guide.js` keeps `npcHome: Map<npc id, { dim, x, z }>` from `realm:npc_places`, replaced whole when
the last part of a list arrives (`parts: 0` empties it). `saga_bp` sends `realm:npc_places_ping {}` 70 ticks after
`worldLoad`, and once more at 400 ticks if no list arrived. Memory only.

**Saved data: one new optional field.**

| Key | Field | Meaning | Bound |
|---|---|---|---|
| `saga:p` (player) | `la?: number` | `Date.now()` of the last story step: progress on an objective (`bump`), a chapter reported (`complete`), a favor or a stranger's job finished | 13 digits, 21 bytes with its key; `sagaOf` deletes a value that is not a finite number |
| `saga:pref` (player) | `leadTracker` | the player's own choice, written by `settings-core` when they change it | a boolean |
| `saga:cfg` (world) | `leadTracker`, `favorDays` | written by `settings-core` when an operator changes them | a boolean, an integer 1-14 |

No migration, because:
- `la` is optional. A save without it reads as "use the newest `st.t`, `st.fin`, favor `t` or job `t`"
  (`idleDays`), so an existing player gets a correct figure on day one.
- `sagaOf` keeps fields it does not know and `trimSave` never drops them (`tools/saga-save-bound.test.mjs`,
  "unknown top-level fields"), so the previous pack version reads and rewrites a save with `la` unchanged.
  Rollback note: after a rollback `la` is ignored and kept; favors that ran out stay gone (the NPC offers today's).
- No key, prefix or existing field changes shape. `saga.tr` can already name a story with no accepted chapter
  (between chapters); `saga.ut` keeps its meaning.
- Favor expiry deletes `saga.fv[npc]` exactly as the claimed-favor tidy does today. It never touches `saga.s`.
- 6.11 stops creating empty story states; states already saved (`{ dn: [], f: {}, ch: {} }`) stay valid and are
  treated as "no progress" (`st.a || st.dn.length`).
- A corrupt `saga:p` still goes to `saga:p_bak` and is never overwritten (unchanged code).

**Settings** (`settings.js` `OPTIONS`, `config.js` `CONFIG`):

| Key | Scope | Type | Default | Label | Help |
|---|---|---|---|---|---|
| `leadTracker` | world | bool | `true` | `Story lead on the tracker` | `Default for players: with no quest going, the tracker shows who to talk to next` |
| `favorDays` | world | int 1-14, step 1 | `2` | `Days before an unfinished daily favor runs out` | (none) |
| `leadTracker` | player | bool, `base: "leadTracker"`, `lock: [["enabled", false]]` | follows the world option | `Story lead on my tracker` | `With no quest going, shows who to talk to next and points the Minimap star there` |

**Debug actions** (`realm:saga_debug`, same gate as today):
- `{ player, action: "away", days }`: as if the player was last here `days` (0 to 3650, floored) days ago. Moves
  `saga.la`, every `st.t`, every favor's `d` and `t` and the job's `t` back by that much, then runs the join
  routine. This is how scenarios test "days away".
- `{ player, action: "next" }`: sends the player one chat line
  `[saga next] <JSON of { row, idle, ...the realm:saga_lead message }>`.

### UI

No form, button or command is added or renamed. Every state below is text in the quest box (Side HUD's quest
slot, about 32 characters a row, 10 rows, 502 bytes; `layoutBox` wraps whole lines and drops the least useful),
on the line above the hotbar, in chat, or in the body of the existing Story Log. Phones: the lead block is 3
lines and at most 6 rows of the 10 (5 outside a party; computed over every story and chapter); nothing here is measured against the 168 px button line because no button
changes. Light and dark: not affected (game HUD).

**Quest box, the top is an accepted quest** (rows 2-7, 11 with an entry): today's box, unchanged, with one
possible extra line among the other quests, first of them, when `Next.also` is set:

```
§3Main story§7: Talk to Quill the Trader NE 140m
§3Party story§7: Talk to Old Tobin S 60m            (when also.row is 8)
```
(no direction when it is unknown; no `here` text: `§3Main story§7: Talk to Old Tobin here`).

**Quest box, the top is a lead with no accepted chapter.** Three lines: `head`, the step, `sub`; then the other
quests as today (`§3<short>§7: <their line>`).

Step line: `§e[>] §f<label>` followed by ` §e<dir>` (`NE 140m`, `in the Nether`), or ` §a(you're here)` when
`dir` is `here`, or ` §7<lost>` when the place is unknown, or nothing for a `wait` lead.

| Case | `head` | `sub` |
|---|---|---|
| the next chapter of a story in progress (rows 9, 12, and 2 for a story with finished chapters) | `§b<short>§7: next chapter` | `§7"<chapter title>" (<pos> of <total>)` |
| a main story with no finished chapter, and no main story has any progress | `§bThe story starts here` | `§7<story title> (main story)` |
| a main story with no finished chapter, otherwise | `§bMain story§7: next part` | `§7Act <n>: <story title>` (`§7<story title>` when `act` is 0 or unset) |
| another story with no finished chapter (rows 13, and 2) | `§b<short>§7: new story` | `§7<story title> (<word>)`, or `§7A <word>` when the title equals `short` |
| row 8, the player is on it | `§b<short>§7: party chapter` | `§7"<chapter title>": one accept starts it for the party` |
| row 8, the player is ahead of it | `§b<short>§7: party chapter` | `§7Then you help with "<chapter title>"` |
| row 14 | `§b<short>§7: not yet` | `§7<story title>` |

`<word>`: `side story` (kind `side` or unset), `heart story`, `festival story`, `wanderer's story`.
`<pos>` and `<total>` come from `chapterNumber(saga, story, index)`.

Examples:

```
§bThe story starts here
§e[>] §fTalk to Old Tobin §eS 60m
§7The Drowned Bell (main story)

§bThe Gray Choir§7: next chapter
§e[>] §fTalk to Quill the Trader §eNE 140m
§7"The Pattern" (4 of 12)

§bDrowned Bell§7: next chapter
§e[>] §fTalk to Warden Reyes §7(/realm:npc_who)
§7"The Drowned Choir" (2 of 6)
```

`<lost>`: `(on the road)` for an id starting with `w_`; `(needs Townsfolk)` when the pack scan has answered and
`npc_bp` is not installed; else `(/realm:npc_who)`.

**Above the hotbar** (`trackerAt: "hotbar"`), a lead with no accepted chapter:
`§b<short>: §f<label> <dir>` (no `<dir>` when unknown), with `<label>` cut by `fit` so the whole line is at most
`HUD.BAR_PX` (228) pixels: `§bThe Gray Choir: §fTalk to Quill the Trader NE 140m`. With an accepted quest on top
the line is today's.

**Minimap.** `realm:track` for a lead with no accepted chapter: `label` = `<short>: <label>`
(`Drowned Bell: Talk to Old Tobin`), `npc`, and `dim`, `x`, `z` when known. A `wait` lead sends `{ player }`.

**Nothing shown** (box cleared, `realm:track { player }`): `st` is `none`; the lead's quest is one the player
stopped tracking and nothing else is going; `leadTracker` is off and no chapter is accepted; the player's
`tracker` is off (the box only: `realm:track` is still sent, as today); a form is open (as today).

**Chat**
- Chapter reported, next chapter at another NPC (`complete`):
  `§e[Story] Next: talk to <who><toward> for "<chapter title>".` where `<toward>` is `towardNpc`'s text
  (` NE 140m`, ` here`, ` in the Nether`, ` at Pell's Camp N 300m`, or nothing).
- Accept, tracker on (unchanged): `§7The tracker <spot> points the way. /realm:saga shows your progress, and a
  hint if you're stuck.`
- Accept, the player's `tracker` preference off:
  `§7/realm:saga shows the way, and a hint if you're stuck (your story tracker is off: /realm:prefs).`
- One favor ran out: `§7[Story] An old daily favor ran out: <favor label>.`
- Several: `§7[Story] <n> old daily favors ran out.` On a join the line is sent 100 ticks after the spawn.

**Story Log home** (`showMenu` body), below the existing paused line:

| `nextStep` | Lines |
|---|---|
| has `e` | `§fNow: §e<story title>§r` and `§7Current step: <stepLine(player, e, saga)>` (today's two lines) |
| no `e`, `st` not `none` | `§fNext: §e<label>§r` followed by ` §7<dir>` or ` §7<lost>` when there is one, then `§7<why>` |
| `none`, row 15 | `§7<why>` |
| `none`, row 1 | nothing more (the red paused line is already there) |

**Lock reasons** (`requires`), joined with `, ` by the callers:

| Failing flag | Reason |
|---|---|
| `g:aff_<npc>` | unchanged: `become <level> with <name> (Townsfolk)` |
| `cal:festival` | unchanged: `come back during <festival> (Realm Calendar)` |
| `g:calling_ready` | `reach your Calling in /realm:skills` |
| `pack:<folder>` wanting `on`, pack scan answered | `ask an operator for the <pack title> pack` |
| `pack:<folder>` wanting anything else, pack scan answered | `play on a Realm without the <pack title> pack` |
| `pack:<folder>`, pack scan not answered yet | `wait a moment (the Realm's packs are being checked)` |
| any other flag | unchanged: `make different choices earlier in the story` (once) |

So **Available** reads `The Calling: reach your Calling in /realm:skills, ask an operator for the Skills pack.`

### Security

- No command and no operator screen is added. `leadTracker` and `favorDays` change only through Realm Settings,
  which checks operator rights itself (`settings-core.js`).
- `realm:saga_debug`'s new actions run inside `onDebug`, behind the existing gate (the console, another pack, or
  a player at `GameDirectors` or above). `days` is clamped to 0-3650 and floored.
- `realm:npc_places` is parsed in a `try`; `readFolk` accepts at most 400 entries a part, ids matching
  `/^[a-z0-9_:]{1,64}$/`, the three dimension ids, and finite coordinates within 30,000,000; anything else is
  skipped. `parts` above 50, `part` outside 1 to `parts`, and a later part with no first part are ignored. The
  map holds at most 400 posts.
- `realm:saga_lead_ping` only sends again JSON that was already built. `player` must be a string; a message that
  is not JSON counts as "everyone". The everyone form is answered at most once in 20 ticks.
- `realm:saga_lead` carries pack text and player names only, each cut; the message is at most 900 characters
  (the limit is 2048). Coordinates come only from the tracker's own target, so a secret step never leaks.
- Saved data: `la` is validated on read. Expiry removes only `saga.fv[npc]` for an accepted, unclaimed favor
  older than `favorDays`. Nothing writes a key in a new shape.

### Performance

Budget: `saga_bp` at most 0.15 ms a tick in the gate soak at 40 players, and at most 0.03 ms a tick more than
before in the pair below.

What is new per player every 2 s: one `nextStep` and, for a player with no accepted chapter, one lead box.

- **The choice is cached.** `choose()` (the ladder, `leadOf` over 52 stories, `more`) runs only when the player's
  key changes or after 1,200 ticks. The key is one string: entry cache version (`versionOf(player.id)`), `today()`,
  `saga.tr`, `saga.ut` joined, `installed.ready`, the posts revision, one character per entry for done or not, and
  the party view (`story/chapter/ghost/on/of/behind`). The time limit covers what has no version (guild
  reputation in `requires`).
- **Per run, only the volatile part:** `stepOf` for the top entry (the tracker computed this line already; it is
  now computed once, in `nextStep`, and handed to the box), or one `npcSpot` and one bearing for a lead.
- **No entity query for a far NPC** (L7): `npcAt`'s `getEntities` runs only within 48 blocks of a known post, or
  when the post is unknown; its 40-tick cache per dimension and NPC stays.
- **The box is rewritten only when its text changes** (`boxSent`, unchanged) and a lead's distance is rounded
  (L5), so a player who walks past the lead costs a `realm:side` only every 5 to 100 blocks.
- `realm:track` and `realm:saga_lead` are sent only on change (`trackSent`, `leadSent`). A post does not move, so
  a lead's messages are stable.
- No `world.getAllPlayers()` in the lead path (party facts come from the view `partyTick` already built).
- The favor sweep is once in 600 runs (10 minutes) per player: a loop over at most 12 favors.

Measured in T5 with `saga-perf-quests` at 10 and 40 players, before and after, twice each, alternating.

### Ops

Not affected: no env var, port, workflow or hosting change.

## Tasks

Checkout for every task: `mc-packs` at `/home/user/mc-packs` in a cloud session, or the session's own worktree of
`nishant/mc-packs`. Run every command from the repo root.

### T1 Saved data, lock reasons, party view, options

- Repo / checkout: `mc-packs`
- Owns: `packs/saga_bp/scripts/data.js`, `packs/saga_bp/scripts/party.js`, `packs/saga_bp/scripts/settings.js`,
  `packs/saga_bp/scripts/config.js`, `tools/saga-lock-reasons.test.mjs` (new), `tools/saga-save-bound.test.mjs`
- Reads (does not edit): `packs/saga_bp/scripts/types.js`, `tools/saga-party-plays.test.mjs` (the `grab` pattern),
  `tools/saga-pack-fallback.test.mjs`
- Depends on: none
- Change:
  1. `data.js`, `Saga` typedef: add
     `@property {number} [la] when the player last took a story step (ms): progress, a chapter, favor or job finished`.
  2. `data.js`, `sagaOf`, next to the other field checks:
     `if (saga.la !== undefined && (typeof saga.la !== "number" || !Number.isFinite(saga.la))) delete saga.la;`
  3. `data.js`, after `invalidate`:
     `/** The entry cache version of a player: changes whenever their chapters or flags do. @param {string} id */`
     `export const versionOf = (id) => versions.get(id) ?? 0;`
  4. `data.js`, `PartyView` typedef: add the optional fields
     `on?: number` (members who have the party's chapter accepted as their own), `of?: number` (members online),
     `behind?: string[]` (names of the members whose own next main chapter it is).
  5. `data.js`, above `requires`:

     ```js
     /** Pack titles for lock reasons (`pack:<folder>` in a story's `requires`). Kept equal to each manifest's header.name by tools/saga-lock-reasons.test.mjs. */
     export const PACK_TITLES = /** @type {Record<string, string>} */ ({ atlas_bp: "Atlas of the Realm", bounty_bp: "Bounty Board", calendar_bp: "Realm Calendar", cooking_bp: "Kitchen", elite_bp: "Champions", expedition_bp: "Expeditions", maps_bp: "Treasure Maps & Riddles", meteor_bp: "Meteor Strikes", moon_bp: "Blood Moon & Harvest Moon", night_bp: "Aurora & Shooting Stars", npc_bp: "Townsfolk", rainbow_bp: "Rainbows & the Pot of Gold", skills_bp: "Skills", storm_bp: "Storm Chasing", tornado_bp: "Tornadoes", weather_bp: "Weather Almanac" });
     ```
  6. `data.js`, `requires`: replace the whole `if (req.flags) { ... }` block with

     ```js
     if (req.flags) {
       /** @type {Record<string, string>} */
       const fest = FESTIVAL_NAMES;
       let choices = false;
       for (const [k, v] of Object.entries(req.flags)) {
         if (test(flagOf(saga, storyId, k), v)) continue;
         // Say what is missing in words a player can act on; only a real story flag is "choices".
         if (k.startsWith("g:aff_")) why.push(`become ${AFF_LEVELS[Number(String(v).replace(/[^0-9]/g, "")) || 3] ?? "Close"} with ${npcName(k.slice(6))} (Townsfolk)`);
         else if (k === "cal:festival") why.push(`come back during ${fest[v] ?? "its festival"} (Realm Calendar)`);
         else if (k === "g:calling_ready") why.push("reach your Calling in /realm:skills");
         else if (k.startsWith("pack:")) {
           const title = PACK_TITLES[k.slice(5)] ?? k.slice(5);
           why.push(!installed.ready ? "wait a moment (the Realm's packs are being checked)" : v === "on" ? `ask an operator for the ${title} pack` : `play on a Realm without the ${title} pack`);
         } else choices = true;
       }
       if (choices) why.push("make different choices earlier in the story");
     }
     ```
     Leave the `minCount` and `rep` lines below it as they are.
  7. `party.js`, `partyTick`, right after `partyViews.set(p.id, view);`:
     `view.on = real.size; view.of = members.length; view.behind = behind;`
     (also when the view object is reused). Change nothing else in `party.js`.
  8. `config.js`, after `favors`:

     ```js
     /** With no quest going, the tracker shows who to talk to next (the story lead), for players who haven't chosen in /realm:prefs. */
     leadTracker: true,

     /** A daily favor that was accepted and not finished runs out after this many real days (UTC), so its questgiver can offer a new one. */
     favorDays: 2,
     ```
  9. `settings.js` `OPTIONS`: after the world `favors` line add
     `{ key: "leadTracker", type: "bool", scope: "world", label: "Story lead on the tracker", help: "Default for players: with no quest going, the tracker shows who to talk to next" },`
     `{ key: "favorDays", type: "int", scope: "world", label: "Days before an unfinished daily favor runs out", min: 1, max: 14, step: 1 },`
     and after the player `trackerAt` line add
     `{ key: "leadTracker", type: "bool", scope: "player", lock: [["enabled", false]], base: "leadTracker", label: "Story lead on my tracker", help: "With no quest going, shows who to talk to next and points the Minimap star there" },`
     Do not touch anything below the `// ---- Shared:` marker.
  10. `tools/saga-save-bound.test.mjs`: add `la: 1731628800000,` to `maxed()` and, in "trimming drops only ...",
      `assert.equal(out.la, before.la, "the last-step stamp");`.
  11. `tools/saga-lock-reasons.test.mjs` (new): run the real `requires` in a `vm` with the `grab` helper of
      `tools/saga-party-plays.test.mjs` (TypeScript parser, function by name) and stubs for `storyById`,
      `finished`, `flagOf`, `test`, `npcName`, `AFF_LEVELS`, `FESTIVAL_NAMES`, `repOf`, `installed`; take
      `PACK_TITLES` from the source with `/^export const PACK_TITLES = [^\n]+$/m`. Tests:
      - `{ flags: { "g:calling_ready": "1", "pack:skills_bp": "on" } }`, nothing set, `installed.ready` true and
        the pack absent: `why` is exactly
        `["reach your Calling in /realm:skills", "ask an operator for the Skills pack"]`.
      - the same with `installed.ready` false: the second reason is
        `wait a moment (the Realm's packs are being checked)`.
      - `{ flags: { "pack:elite_bp": "off" } }` with the pack present: `play on a Realm without the Champions pack`.
      - `{ flags: { "g:hollis": "saved", "g:ending": "!gift" } }` with `g:hollis` unset and `g:ending` equal to
        `gift` (both fail): exactly `["make different choices earlier in the story"]`.
      - `{ flags: { "g:aff_tobin": ">=3" } }` unset: `["become Close with Old Tobin (Townsfolk)"]` (stub
        `npcName` to return `Old Tobin`). `{ flags: { "cal:festival": "lantern_fair" } }` unset:
        `["come back during the Lantern Fair (Harvest, days 58-61) (Realm Calendar)"]`. Both are today's texts.
      - every title in `PACK_TITLES` equals `header.name` of `packs/<folder>/manifest.json`, and every
        `pack:<folder>` key found by `/"pack:([a-z_]+)"/g` in `packs/saga_bp/scripts/stories.js` and
        `packs/saga_bp/scripts/stories/*.js` has a title.
- Edge cases:
  - `saga.la` saved as a string or `null`: deleted on read, the save is otherwise kept.
  - A `pack:` flag for a folder with no title: the folder name is used.
  - The party line `First, for <story>, you need to: <why>` (`partyTick`) now reads
    `you need to: ask an operator for the Skills pack`: that is why reasons are imperative.
  - A view reused across ticks: `on`, `of`, `behind` are refreshed every tick.
- Acceptance: `npx tsc -p . && node --test tools/saga-lock-reasons.test.mjs tools/saga-save-bound.test.mjs
  tools/saga-pack-fallback.test.mjs tools/saga-party-plays.test.mjs && node tools/sync-settings.mjs --check &&
  npx eslint tools/saga-lock-reasons.test.mjs` all pass.

### T2 The guide: posts, ladder, lead message

- Repo / checkout: `mc-packs`
- Owns: `packs/saga_bp/scripts/guide.js` (new), `tools/saga-lead.test.mjs` (new)
- Reads (does not edit): `packs/saga_bp/scripts/ui.js` (the functions to copy), `data.js`, `party.js`,
  `objectives.js`, `places.js`, `wander.js`, `util.js`, `settings.js`, `text.js`, `tools/saga-save-bound.test.mjs`
  (the `slice` + `runInNewContext` pattern)
- Depends on: T1
- Change: create `guide.js`. It imports from `@minecraft/server` (`system`), `./data.js`, `./objectives.js`
  (`outdoors`, `radiusOf`, `reportTo`, `sceneFocus`, `skyFocus`, `timeText`, `timeWait`, `weatherWait`),
  `./party.js` (`frontier`), `./places.js` (`campName`, `isCamp`, `locate`, `placeLabel`, `placesOf`),
  `./settings.js` (`get`), `./wander.js` (`wandererOf`), `./util.js`. It must never import `./ui.js` or
  `./main.js`. `ui.js` keeps its own copies of the moved functions until T3 removes them.
  1. **Copy from `ui.js`, unchanged** (with their JSDoc): `npcCache`, `npcAt`, `bearing`, `hidden`, `watchText`,
     the `Pointed` typedef, `pointed`, `pointedAt`, `trackLine`, `pointAt`, and `untracked`. Export `bearing`,
     `hidden`, `watchText`, `untracked`.
  2. **Posts:**

     ```js
     /** Where each townsfolk is posted, from Townsfolk's realm:npc_places. @type {Map<string, { dim: string, x: number, z: number }>} */
     export const npcHome = new Map();
     let homesSeen = false;
     let homesRev = 0;
     /** The parts of a list still arriving. @type {{ id: string, dim: string, x: number, z: number }[] | undefined} */
     let homeParts;
     const HOME_MAX = 400;
     /** Has a whole realm:npc_places list arrived? */
     export const homesKnown = () => homesSeen;

     /** realm:npc_places { part, parts, folk }: parts arrive in order; parts 0 is an empty list. @param {any} msg */
     export function onNpcPlaces(msg) {
       const part = Number.isInteger(msg.part) ? msg.part : 1;
       const parts = Number.isInteger(msg.parts) ? msg.parts : 1;
       if (parts > 50 || (parts > 0 && (part < 1 || part > parts))) return;
       if (parts <= 0 || part === 1) homeParts = [];
       if (!homeParts) return; // a later part without its first
       if (parts > 0) for (const f of readFolk(msg.folk)) if (homeParts.length < HOME_MAX) homeParts.push(f);
       if (parts > 0 && part < parts) return;
       npcHome.clear();
       for (const f of homeParts) npcHome.set(f.id, { dim: f.dim, x: f.x, z: f.z });
       homeParts = undefined;
       homesSeen = true;
       homesRev++;
     }
     ```
  3. **Where an NPC is.** New versions of `towardNpc` and `npcTarget` (do not copy the old ones; the copied
     `trackLine` and `pointAt` call these) and the new `npcSpot`; export all three:

     ```js
     /** A post this far away (blocks) is used without looking for the entity. */
     const POST_FAR = 48;
     /**
      * Where a townsfolk is for this player: the entity when it is loaded near them, else their post, else a
      * Recurring Wanderer's camp. `r`: how close counts as "here".
      * @param {Player} player @param {string} npc
      * @returns {{ dim: string, x: number, z: number, r: number, camp?: string } | undefined}
      */
     export function npcSpot(player, npc) {
       const home = npcHome.get(npc);
       const far = !!home && (home.dim !== player.dimension.id || across(player.location, home) > POST_FAR);
       if (!far) {
         const at = npcAt(player.dimension, npc);
         if (at) return { dim: player.dimension.id, x: at.x, z: at.z, r: 4 };
       }
       if (home) return { dim: home.dim, x: home.x, z: home.z, r: 6 };
       const w = wandererOf(npc);
       const camp = w ? placesOf()[campName(w.id)] : undefined;
       return camp && w ? { dim: camp.dim, x: camp.x, z: camp.z, r: 6, camp: placeLabel(campName(w.id)) } : undefined;
     }
     /** " NE 40m", " here", " at Pell's Camp N 300m", or "" when nobody knows where they are. */
     export function towardNpc(player, npc) {
       const s = npcSpot(player, npc);
       return s ? `${s.camp ? ` at ${s.camp}` : ""} ${bearing(player, s, s.r)}` : "";
     }
     /** A townsfolk as a tracker target. @returns {Pointed} */
     export function npcTarget(player, npc, label) {
       const s = npcSpot(player, npc);
       return s ? { label, npc, dim: s.dim, x: s.x, z: s.z } : { label, npc };
     }
     ```
  4. **One quest's tracker line**, so no caller reads `pointed` and `pointedAt`:

     ```js
     /** The tracker line of one entry, where it points and which objective, or undefined when there is nothing to point at. */
     export function stepOf(player, e, saga) {
       const text = trackLine(player, e, saga);
       return text === undefined ? undefined : { text, at: pointed, i: pointedAt };
     }
     ```
  5. **The pure part.** Put these between the two marker comments, exactly
     `// ---- pure: tools/saga-lead.test.mjs runs this part in node ----` and `// ---- end pure ----`. Nothing
     in between may use an import, `system`, `world` or module state outside the markers.

     ```js
     /** `s`, or its first n - 3 characters and "...". @param {string} s @param {number} n */
     const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 3).trimEnd()}...`);
     /** Text without color codes. @param {string} s */
     const bare = (s) => s.replace(/§./g, "");

     /** The ladder's rows 2 to 14, in order. Row 1 is "stories are off", row 15 "nothing". */
     export const LADDER = ["tracked", "mainDone", "partyEntry", "otherDone", "session", "mainStep", "partyLead", "mainNext", "mainStart", "otherStep", "otherNext", "otherStart", "mainWait"];

     /**
      * The first candidate there is, in LADDER order.
      * @param {{ off?: boolean } & Record<string, any>} c one optional value per LADDER name
      * @returns {{ row: number, name: string, pick: any }}
      */
     export function ladder(c) {
       if (c.off) return { row: 1, name: "off", pick: undefined };
       for (let k = 0; k < LADDER.length; k++) if (c[LADDER[k]]) return { row: k + 2, name: LADDER[k], pick: c[LADDER[k]] };
       return { row: LADDER.length + 2, name: "none", pick: undefined };
     }

     /** A lead's distance, rounded so its text changes rarely. @param {number} d */
     export const roundFar = (d) => (d < 100 ? Math.round(d / 5) * 5 : d < 1000 ? Math.round(d / 20) * 20 : Math.round(d / 100) * 100);

     /** Whole days since the last story step: `la`, else the newest accept or finish time; 0 with no stamp at all. */
     export function idleDays(saga, now = Date.now()) {
       let last = typeof saga.la === "number" ? saga.la : 0;
       for (const st of Object.values(saga.s ?? {})) last = Math.max(last, Number(st?.t) || 0, Number(st?.fin) || 0);
       for (const fs of Object.values(saga.fv ?? {})) last = Math.max(last, Number(fs?.t) || 0);
       last = Math.max(last, Number(saga.wv?.t) || 0);
       return last > 0 ? Math.max(0, Math.floor((now - last) / 86400000)) : 0;
     }

     /**
      * What tidyFavors does with one saved favor: "tidy" (claimed or never accepted, from an earlier day, or not
      * an object), "expired" (accepted, not claimed, more than `keep` days old), or "" (keep it).
      * @param {any} fs @param {number} day today's UTC day number @param {number} keep
      */
     export function favorFate(fs, day, keep) {
       if (!fs || typeof fs !== "object") return "tidy";
       const d = typeof fs.d === "number" ? fs.d : NaN;
       if (fs.c || !fs.a) return d < day ? "tidy" : "";
       return d < day - keep ? "expired" : "";
     }

     /** The posts in one realm:npc_places part that are well formed. @param {unknown} raw */
     export function readFolk(raw) {
       /** @type {{ id: string, dim: string, x: number, z: number }[]} */
       const out = [];
       if (!Array.isArray(raw)) return out;
       for (let k = 0; k < raw.length && k < 400; k++) {
         const f = raw[k];
         if (!f || typeof f !== "object") continue;
         if (typeof f.id !== "string" || !/^[a-z0-9_:]{1,64}$/.test(f.id)) continue;
         if (f.dim !== "minecraft:overworld" && f.dim !== "minecraft:nether" && f.dim !== "minecraft:the_end") continue;
         if (typeof f.x !== "number" || typeof f.z !== "number" || !Number.isFinite(f.x) || !Number.isFinite(f.z) || Math.abs(f.x) > 3e7 || Math.abs(f.z) > 3e7) continue;
         out.push({ id: f.id, dim: f.dim, x: Math.floor(f.x), z: Math.floor(f.z) });
       }
       return out;
     }

     /**
      * The quest box's first and third line for a lead with no accepted chapter (Design, UI).
      * @param {"next" | "first" | "main" | "new" | "partyStart" | "partyWait" | "wait"} kind
      * @param {{ short: string, title: string, act?: number, word: string, chapter: string, pos: number, total: number }} v
      */
     export function leadText(kind, v) {
       if (kind === "first") return { head: "§bThe story starts here", sub: `§7${v.title} (main story)` };
       if (kind === "main") return { head: "§bMain story§7: next part", sub: `§7${v.act ? `Act ${v.act}: ` : ""}${v.title}` };
       if (kind === "new") return { head: `§b${v.short}§7: new story`, sub: v.title === v.short ? `§7A ${v.word}` : `§7${v.title} (${v.word})` };
       if (kind === "partyStart") return { head: `§b${v.short}§7: party chapter`, sub: `§7"${v.chapter}": one accept starts it for the party` };
       if (kind === "partyWait") return { head: `§b${v.short}§7: party chapter`, sub: `§7Then you help with "${v.chapter}"` };
       if (kind === "wait") return { head: `§b${v.short}§7: not yet`, sub: `§7${v.title}` };
       return { head: `§b${v.short}§7: next chapter`, sub: `§7"${v.chapter}" (${v.pos} of ${v.total})` };
     }

     /** The realm:saga_lead message for a player (README contract C1). @param {string} playerId @param {Next} n */
     export function leadMessage(playerId, n) {
       /** @type {Record<string, unknown>} */
       const msg = { player: playerId, v: 1 };
       if (n.st === "none" || !n.story) return msg;
       msg.st = n.st;
       msg.k = n.story.kind ?? "side";
       msg.s = cut(n.story.id, 64);
       msg.title = cut(bare(n.story.title), 40);
       if (n.chapter) msg.ch = cut(bare(n.chapter.title), 48);
       msg.hint = cut(bare(n.label), 120);
       if (n.why) msg.why = cut(bare(n.why), 120);
       if (n.npc) msg.npc = cut(n.npc, 64);
       if (n.npc && n.who) msg.who = cut(bare(n.who), 32);
       if (n.place) msg.place = cut(bare(n.place), 32);
       if (n.spot && Number.isFinite(n.spot.x) && Number.isFinite(n.spot.z)) {
         msg.dim = n.spot.dim;
         msg.x = Math.floor(n.spot.x);
         msg.z = Math.floor(n.spot.z);
       }
       msg.more = Math.max(0, Math.min(9, Math.floor(n.more) || 0));
       if (n.party) {
         /** @type {string[]} */
         const behind = [];
         for (let k = 0; k < n.party.behind.length && k < 3; k++) behind.push(cut(n.party.behind[k], 20));
         msg.party = { on: n.party.on, of: n.party.of, ...(n.party.hold ? { hold: cut(n.party.hold, 20) } : {}), behind };
       }
       return msg;
     }
     ```
  6. **Sessions and sent state:**

     ```js
     const START = Date.now();
     /** When each player joined (ms); a /reload counts as a join for everyone. @type {Map<string, number>} */
     const joinedAt = new Map();
     /** The realm:saga_lead JSON last sent per player. @type {Map<string, string>} */
     const leadSent = new Map();
     /** @type {Map<string, Chosen>} */
     const chosen = new Map();
     let lastAll = -1000;

     /** A player joined: nothing they accepted before counts as "this session". @param {Player} player */
     export function joined(player) {
       joinedAt.set(player.id, Date.now());
       leadSent.delete(player.id);
     }
     /** A player left. @param {string} id */
     export function leadGone(id) {
       joinedAt.delete(id);
       leadSent.delete(id);
       chosen.delete(id);
     }
     /** Sends realm:saga_lead when it changed. Not before the first pack scan: leads flicker until then. @param {Player} player @param {Next} next */
     export function publishLead(player, next) {
       if (!installed.ready) return;
       const json = JSON.stringify(leadMessage(player.id, next));
       if (leadSent.get(player.id) === json) return;
       leadSent.set(player.id, json);
       system.sendScriptEvent("realm:saga_lead", json);
     }
     /** realm:saga_lead_ping: the last lead of one player, or of everyone (at most once in 20 ticks), again. @param {string | undefined} playerId */
     export function resendLeads(playerId) {
       if (!playerId) {
         if (system.currentTick - lastAll < 20) return;
         lastAll = system.currentTick;
       }
       for (const [id, json] of leadSent) if (!playerId || id === playerId) system.sendScriptEvent("realm:saga_lead", json);
     }
     ```
  7. **`leadOf`** (exported):

     ```js
     /**
      * A story's next chapter that is not accepted yet and that this player could take on now, or undefined.
      * @param {Player} player @param {Saga} saga @param {Story} story
      * @returns {{ story: Story, chapter: Chapter, index: number, npc: string, fresh: boolean } | undefined}  fresh: no finished chapter
      */
     export function leadOf(player, saga, story) {
       if (finished(saga, story) || storyWaitsForPacks(story) || packsNeeded(story, saga).length) return undefined;
       const st = saga.s[story.id];
       if (st?.a) return undefined;
       const cur = currentChapter(saga, story);
       if (!cur || onHold(player.id, story, cur.chapter.id)) return undefined;
       const fresh = !st?.dn.length;
       if (fresh && !requires(story.requires, saga, story.id, player).ok) return undefined;
       const npc = cur.chapter.npc ?? story.giver;
       if (story.kind === "wander" && !npcSpot(player, npc)) return undefined; // a wanderer with no camp cannot be found on purpose
       return { story, chapter: cur.chapter, index: cur.index, npc, fresh };
     }
     ```
  8. **`choose`** (not exported): builds the candidates and runs the ladder. `Chosen` is
     `{ key: string, at: number, row: number, name: string, pick: any, also: any, more: number, open: number, begun: boolean, over: boolean }`.

     ```js
     function choose(player, saga, list) {
       const view = partyViews.get(player.id);
       const since = joinedAt.get(player.id) ?? START;
       const isMain = (/** @type {Entry} */ e) => e.story.kind === "main" && !e.fav;
       const done = (/** @type {Entry} */ e) => chapterDone(e, saga);
       // A stranger's job that pays by itself has nothing to point at.
       const own = list.filter((e) => !e.pq && !(e.wv && (/** @type {any} */ (e.st).g || /** @type {any} */ (e.st).tn) && done(e)));
       const shown = own.filter((e) => !untracked(saga, e.story.id));
       const newest = (/** @type {Entry[]} */ xs) => {
         /** @type {Entry | undefined} */
         let best;
         for (const e of xs) if (!best || (e.st.t ?? 0) > (best.st.t ?? 0)) best = e;
         return best;
       };
       const wrap = (/** @type {Entry | undefined} */ e) => (e ? { e } : undefined);
       /** @type {Record<string, any>} */
       const c = {};
       if (saga.tr && !untracked(saga, saga.tr)) {
         const e = list.find((x) => x.story.id === saga.tr && (x.pq || own.includes(x)));
         const story = e ? undefined : storyById.get(saga.tr);
         c.tracked = e ? { e } : story && !(view && story.kind === "main") ? leadOf(player, saga, story) : undefined;
       }
       c.mainDone = wrap(own.find((e) => isMain(e) && done(e)));
       if (view) {
         const e = list.find((x) => !x.fav && x.story.id === view.story.id && x.chapter.id === view.chapter.id);
         if (e) c.partyEntry = { e };
         else c.partyLead = { story: view.story, chapter: view.chapter, index: view.story.chapters.indexOf(view.chapter), npc: view.chapter.npc ?? view.story.giver, fresh: false, party: true };
       }
       c.otherDone = wrap(shown.find((e) => !isMain(e) && done(e)));
       c.session = wrap(newest(shown.filter((e) => (e.st.t ?? 0) > since)));
       c.mainStep = wrap(newest(own.filter(isMain)));
       const f = view ? undefined : frontier(saga, player);
       if (f && !saga.s[f.story.id]?.a) {
         if (f.why === undefined) {
           const lead = leadOf(player, saga, f.story);
           if (lead) c[lead.fresh ? "mainStart" : "mainNext"] = lead;
         } else if (f.why.length) c.mainWait = { story: f.story, chapter: f.chapter, index: f.index, reason: f.why[0] };
       }
       c.otherStep = wrap(newest(shown.filter((e) => !isMain(e))));
       const rank = (/** @type {Story} */ s) => (s.kind === "festival" ? 0 : s.kind === "heart" ? 2 : 1);
       let open = 0;
       let begun = false;
       for (const story of ORDERED) {
         const st = saga.s[story.id];
         if (story.kind === "main") {
           if (st && (st.a || st.dn.length)) begun = true;
           continue;
         }
         const lead = leadOf(player, saga, story);
         if (!lead) continue;
         if (!lead.fresh) {
           if (!c.otherNext || (st?.t ?? 0) > (saga.s[c.otherNext.story.id]?.t ?? 0)) c.otherNext = lead;
         } else if (story.kind !== "wander") {
           open++;
           if (!c.otherStart || rank(story) < rank(c.otherStart.story)) c.otherStart = lead;
         }
       }
       const hit = ladder(c);
       const story = hit.pick ? (hit.pick.e ? hit.pick.e.story : hit.pick.story) : undefined;
       const side = hit.name === "tracked" || hit.name === "otherDone" || hit.name === "session";
       const also = side && story && story.kind !== "main" && !list.some(isMain) ? (c.partyLead ?? c.mainNext ?? c.mainStart) : undefined;
       return { row: hit.row, name: hit.name, pick: hit.pick, also, open, more: Math.min(9, Math.max(0, open - (hit.name === "otherStart" ? 1 : 0))), begun, over: !view && !f };
     }
     ```
  9. **`nextStep`** (exported), signature `nextStep(player, saga = sagaOf(player))`, returns `Next`:
     1. `!player.isValid`: `{ st: "none", row: 15, label: "", why: "", more: 0 }`.
     2. `get("enabled") !== true`: `{ st: "none", row: 1, label: "", why: "Stories are paused by an operator.", more: 0 }`.
     3. `const list = entries(player);` build the key:

        ```js
        let done = "";
        for (const e of list) done += chapterDone(e, saga) ? "1" : "0";
        const view = partyViews.get(player.id);
        const key = `${versionOf(player.id)}|${today()}|${saga.tr ?? ""}|${(saga.ut ?? []).join(",")}|${installed.ready ? 1 : 0}|${homesRev}|${done}|${view ? `${view.story.id}/${view.chapter.id}/${view.ghost ? 1 : 0}/${view.on ?? 0}/${view.of ?? 0}/${(view.behind ?? []).join(",")}` : ""}`;
        ```
        Reuse `chosen.get(player.id)` when its `key` is equal and `system.currentTick - at <= 1200`; else
        `choose(...)`, store it with `key` and `at`.
     4. Row 15: `{ st: "none", row: 15, label: "", why: get("favors") === true ? "You have done every story there is. The townsfolk still have a favor each day." : "You have done every story there is.", more: 0 }`.
     5. Otherwise build the `Next` with a helper `fill(player, saga, row, pick, ch)` and set `n.also` with the
        same helper when `ch.also` is set (row 8 when `ch.also.party`, else 10 when `ch.also.fresh`, else 9).
        `party` (when `view`): `behind = view.behind ?? []`, `mine = behind.includes(player.name)`,
        `hold = mine ? undefined : behind.find((x) => x !== player.name)`,
        `{ on: view.on ?? 0, of: view.of ?? 0, hold, behind }`.

        `fill` for a pick with `e`:
        - `step = stepOf(player, e, saga)`; `isDone = chapterDone(e, saga)`; `to = reportTo(e)`.
        - `st`: `e.pq ? "party" : isDone ? "report" : "step"`.
        - `label`: done: `` `${e.pq ? "Your party reports" : "Report"} to ${npcName(to)}` ``; else when
          `step && step.i >= 0`: the objective `obj = e.chapter.objectives[step.i]`,
          `obj.type === "survive" || obj.type === "vigil" || obj.type === "ride" ? obj.label : labelOf(e, step.i, saga)`;
          else `step ? plain(step.text) : e.chapter.title`.
        - `at = step?.at`; `npc = at?.npc ?? (isDone ? to : undefined)`; `who = npc ? npcName(npc) : undefined`.
        - `place`: `at && !at.npc ? at.label : undefined`.
        - `spot`: `(npc ? npcHome.get(npc) : undefined) ?? (at && at.dim !== undefined && Number.isFinite(at.x) && Number.isFinite(at.z) ? { dim: at.dim, x: at.x, z: at.z } : undefined)`.
        - `line = step?.text`, `i = step?.i ?? -1`, `story = e.story`, `chapter = e.chapter`, `why` from the
          ladder table by `row`, `more = ch.more`.
        - Row 4, party quest: `others = behind.filter((x) => x !== player.name).length >= 2`; with a `hold` the
          sentence ends `You are helping ${hold}${others ? " and others" : ""} with it.`; with no `hold` (the
          player is one of those behind) `why` is the own-entry sentence.

        `fill` for a pick without `e` (`{ story, chapter, index, npc, fresh, party? }`, or for row 14
        `{ story, chapter, index, reason }` with no `npc`):
        - Row 14 first, because it has no NPC: `st: "wait"`, `` label = `To go on: ${pick.reason}` ``,
          `` why = `${story.title} needs that first.` ``, `head` and `sub` from `leadText("wait", ...)`, `dir: ""`,
          and `npc`, `who`, `at`, `spot`, `place`, `lost` unset. The lines below are for every other row.
        - `who = npcName(pick.npc)`; `s = npcSpot(player, pick.npc)`; `p = player.location`.
        - `st`, `label`, `why` from the ladder table by `row` (row 2 uses `"start"` and `Talk to <who>`). Row 10:
          `ch.begun` false means no main story has progress. Row 13: `<open>` is `ch.open`, and the sentence
          starts with `You finished the main story. ` when `ch.over`. Row 8: `mine` and `hold` as in `party`
          above (row 8 with no `hold` cannot happen; use `your party` for `<hold>` if it does).
        - `dir`: `s` unset: `""`. Other dimension: `` `in the ${dimName(s.dim)}` ``. `d = across(player.location, s)`;
          `d <= s.r`: `"here"`; else `` `${compass(s.x - p.x, s.z - p.z)} ${num(Math.max(5, roundFar(d)))}m` ``.
        - `lost`: only when `dir` is `""`: `pick.npc.startsWith("w_") ? "(on the road)" : installed.ready && !installed.set.has("npc_bp") ? "(needs Townsfolk)" : "(/realm:npc_who)"`.
        - the "not in this world yet" override of `why` (Design, Data): `!s && homesSeen && !pick.npc.startsWith("w_")`.
        - `at`: `s ? { label, npc: pick.npc, dim: s.dim, x: s.x, z: s.z } : { label, npc: pick.npc }`.
        - `spot`: `npcHome.get(pick.npc) ?? (s ? { dim: s.dim, x: s.x, z: s.z } : undefined)`; `place = s?.camp`;
          `npc = pick.npc`.
        - `head`, `sub`: `leadText(kind, { short: story.short, title: story.title, act: story.act, word, chapter: chapter.title, pos, total })`
          with `{ pos, total } = chapterNumber(saga, story, pick.index)`, `word` as in Design (UI), and `kind`:
          row 8: `mine ? "partyStart" : "partyWait"`; `pick.fresh && story.kind === "main"`:
          `ch.begun ? "main" : "first"`; `pick.fresh`: `"new"`; else `"next"`.
        - `more = ch.more`.

        Both shapes, last: set the C1 mirror fields `k = story.kind ?? "side"`, `s = story.id`,
        `title = story.title`, `ch = chapter.title`, `hint = label`, and, when `spot` is set, `dim = spot.dim`,
        `x = Math.floor(spot.x)`, `z = Math.floor(spot.z)`. `label` never holds color codes (`plain()` it when it
        comes from `step.text`).
  10. `tools/saga-lead.test.mjs` (new). Read `guide.js` as text, take what is between the two markers, strip
      `export `, and run it with `node:vm` `runInNewContext` (no context needed), returning
      `({ LADDER, ladder, roundFar, idleDays, favorFate, readFolk, leadText, leadMessage })`. Tests:
      - **the choice order is pinned:** `LADDER` deep-equals the 13 names in the order of this spec; with every
        name set, `ladder` returns row 2; for every index `k`, with only names `k..12` set it returns row `k + 2`
        and that name; `{ off: true, tracked: 1 }` returns row 1; `{}` returns row 15, name `none`.
      - **the size bound:** a `Next` with every field at its worst (`st: "report"`, kind `festival`, a 200
        character id, title, chapter title, label, why, npc, who and place, `spot` at -30,000,000, `more: 99`,
        `party: { on: 99, of: 99, hold: 40 characters, behind: five names of 40 }`) and player id
        `-8589934588123`: `JSON.stringify(leadMessage(...)).length <= 900`; `hint` and `why` are 120 long and end
        in `...`; `title` 40; `ch` 48; `who` and `place` 32; `more` is 9; `behind` has 3 names of 20.
      - a `Next` with `st: "none"` gives exactly `{ player, v: 1 }`; a label with `§e` codes arrives without them.
      - `idleDays`: `{ s: {} }` is 0; `la` 3.5 days before `now` is 3; without `la`, the newest of a story's `t`,
        a story's `fin`, a favor's `t` and the job's `t` is used.
      - `favorFate(fs, 100, 2)`: claimed on day 99 is `tidy`; claimed on day 100 is `""`; never accepted on day 99
        is `tidy`; accepted on day 98 is `""`; accepted on day 97 is `expired`; `null` is `tidy`; accepted with no
        `d` is `""`.
      - `readFolk`: keeps a good entry and floors it; skips a non-object, a numeric id, an id with a space, a
        dimension `nowhere`, `x: "1"`, `x: 4e7`, `NaN`; a non-array gives `[]`; 500 good entries give 400.
      - `roundFar`: 97 is 95, 130 is 140, 1234 is 1200.
      - `leadText`: each of the seven kinds returns the exact `head` and `sub` of Design (UI), including
        `§7A side story` when the title equals `short`.
      - static: `guide.js` does not contain `./ui.js`, `getAllPlayers` or `partyMates`.
- Edge cases:
  - `realm:npc_places` in three parts: the map changes only when part 3 arrives. Part 2 with no part 1: ignored.
    `parts: 0`: the map is emptied and `homesKnown()` becomes true.
  - A post in another dimension: `in the Nether`; no entity query.
  - A wanderer's chain with no camp: no lead for it (`leadOf` returns undefined), so it is never row 12.
  - The tracked story is finished, or unknown: row 2 does not match; `saga.tr` is left alone.
  - Two prologue stories accepted: row 7 picks the newer accept.
  - In a party view, rows 9, 10 and 14 never match (`frontier` is not asked); row 4 or 8 does.
  - `frontier().why` is `[]` (pack scan pending): no main lead this time; nothing is published until
    `installed.ready`.
  - A secret step with no hint: `stepOf().at` is undefined, so `spot` is undefined.
- Acceptance: `npx tsc -p . && node --test tools/saga-lead.test.mjs && npx eslint tools/saga-lead.test.mjs &&
  node tools/check-events.mjs && node tools/check-ascii.mjs` pass.

### T3 The tracker, favors and the log (`ui.js`)

- Repo / checkout: `mc-packs`
- Owns: `packs/saga_bp/scripts/ui.js`, `tools/saga-quest-box.test.mjs`, `tools/saga-ui-lead.test.mjs` (new)
- Reads (does not edit): `packs/saga_bp/scripts/guide.js`, `packs/saga_bp/scripts/text.js`,
  `tools/text-shared.js`, `tools/saga-party-plays.test.mjs`, `tools/saga-pack-fallback.test.mjs`,
  `tools/saga-interaction-lifecycle.test.mjs`
- Depends on: T2
- Change:
  1. **Use the guide.** Delete from `ui.js`: `npcCache`, `npcAt`, `bearing`, `towardNpc`, `hidden`, the `Pointed`
     typedef, `pointed`, `pointedAt`, `npcTarget`, `trackLine`, `pointAt`, `watchText`, `untracked`,
     `trackedFirst`. Add
     `import { bearing, favorFate, hidden, nextStep, stepOf, towardNpc, untracked, watchText } from "./guide.js";`
     below the `./party.js` import, `import { HUD, fit, widthOf } from "./text.js";` below the `./side.js` import,
     and the typedefs `/** @typedef {import("./guide.js").Pointed} Pointed */` and
     `/** @typedef {import("./guide.js").Next} Next */`. Keep line 3 (the gossip import) as it is. Remove imports
     that are no longer used (`campName`, `compass`, `outdoors`). If `text.js` does not export `HUD`, use the
     literal `228` with the comment `// D7: the action bar holds 228 px`.
  2. **`track`** returns the `Next` it drew. Replace its body:

     ```js
     export function track(player, list, shown = true) {
       const saga = sagaOf(player);
       const n = nextStep(player, saga);
       const visible = saga.ut?.length ? list.filter((e) => !untracked(saga, e.story.id)) : list;
       const leadOn = getFor(player, "leadTracker") === true;
       /** @type {Entry | undefined} */
       let top = n.e && n.line && visible.includes(n.e) ? n.e : undefined;
       let line = top ? n.line : undefined;
       let shownAt = top ? (n.i ?? -1) : -1;
       /** @type {Pointed | undefined} */
       let target = top && n.at ? { ...n.at, label: `${top.story.short}: ${n.at.label}` } : undefined;
       // A lead with no accepted chapter: who to talk to next.
       const block = !n.e && n.head && n.story && leadOn && !untracked(saga, n.story.id) ? n : undefined;
       if (block?.at && block.story) target = { ...block.at, label: `${block.story.short}: ${block.label}` };
       /** @type {{ e: Entry, text: string }[]} */
       const others = [];
       for (const e of restOrder(visible, top, saga)) {
         const s = stepOf(player, e, saga);
         if (!s) continue;
         if (!top && !block) {
           top = e;
           line = s.text;
           shownAt = s.i;
           target = s.at ? { ...s.at, label: `${e.story.short}: ${s.at.label}` } : undefined;
         } else others.push({ e, text: s.text });
       }
       const also = top && leadOn && n.also?.story && !untracked(saga, n.also.story.id) ? n.also : undefined;
       sendTrack(player, target);
       const where = getFor(player, "trackerAt");
       const any = (!!top && !!line) || !!block;
       if (!shown || !any || !isSlot(where)) clearBox(player);
       if (!shown || !any) return n;
       const now = system.currentTick;
       if (now < (ownUntil.get(player.id) ?? 0)) {
         boxSent.delete(player.id); // the note took the box's place: draw the box afresh after it
         return n;
       }
       if (where === "hotbar" && now < (holdUntil.get(player.id) ?? 0)) return n;
       if (!isSlot(where)) {
         showLine(player, top ? `§b${top.story.short}: ${line}` : hotbarLead(/** @type {Next} */ (block)), 50, TRACKER_STEADY);
         return n;
       }
       const box = top ? questBox(player, top, saga, /** @type {string} */ (line), shownAt, others, also) : leadBox(/** @type {Next} */ (block), others);
       const key = `${where}|${box}`;
       const sent = boxSent.get(player.id);
       if (sent && sent.text === key && sent.until - now > BOX_RENEW) return n;
       boxSent.set(player.id, { text: key, until: now + BOX_TICKS });
       showLine(player, box, BOX_TICKS, TRACKER_STEADY);
       return n;
     }
     ```
     Keep the existing comments about notes and the hotbar. Next to it add:

     ```js
     /** The quests under the top one: reports first, then the main story, then the newest. @param {Entry[]} list @param {Entry | undefined} top @param {Saga} saga */
     function restOrder(list, top, saga) {
       const rank = (/** @type {Entry} */ e) => (chapterDone(e, saga) ? 0 : e.story.kind === "main" && !e.fav ? 1 : 2);
       return list.filter((e) => e !== top).sort((a, b) => rank(a) - rank(b) || (b.st.t ?? 0) - (a.st.t ?? 0));
     }

     /** A lead with no accepted chapter, above the hotbar: "Gray Choir: Talk to Quill the Trader NE 140m", cut to the bar. @param {Next} n */
     function hotbarLead(n) {
       const head = `${n.story?.short ?? "Story"}: `;
       const tail = n.dir ? ` ${n.dir}` : "";
       return `§b${head}§f${fit(n.label, HUD.BAR_PX - widthOf(head) - widthOf(tail))}${tail}`;
     }
     ```
  3. **The box region** (between `const BOX_COLS` and the story log divider; function declarations only):
     - `questBox(player, e, saga, first, at, others = [], also)`: add the seventh parameter
       (`@param {Next} [also]`) and, just before the `for (const o of others)` loop,
       `if (also) add(`§3${also.row === 8 ? "Party story" : "Main story"}§7: ${also.label}${also.dir ? ` ${also.dir}` : ""}`, 1, "quest");`
     - add after `questBox`:

       ```js
       /**
        * The quest box for a lead with no accepted chapter: what it is, who to talk to and which way, the chapter
        * it starts, then the other quests going.
        * @param {Next} n @param {{ e: Entry, text: string }[]} [others]
        */
       function leadBox(n, others = []) {
         const tail = n.st === "wait" ? "" : n.dir === "here" ? " §a(you're here)" : n.dir ? ` §e${n.dir}` : n.lost ? ` §7${n.lost}` : "";
         /** @type {BoxLine[]} */
         const items = [{ text: n.head ?? "", prio: 10, kind: "other" }, { text: `§e[>] §f${n.label}${tail}`, prio: KEEP_PRIO, kind: "step", tail }];
         if (n.sub) items.push({ text: n.sub, prio: 6, kind: "other" });
         for (const o of others) items.push({ text: `§3${o.e.story.short}§7: ${plain(o.text)}`, prio: 1, kind: "quest" });
         return layoutBox(items);
       }
       ```
  4. **`tidyFavors(player, delay = 0)`** returns how many favors ran out. Replace its body:

     ```js
     export function tidyFavors(player, delay = 0) {
       const saga = sagaOf(player);
       if (!saga.fv) return 0;
       const day = today();
       const keep = Math.max(1, Math.min(14, Math.floor(Number(get("favorDays")) || 2)));
       /** @type {string[]} */
       const gone = [];
       let changed = false;
       for (const [npc, fs] of Object.entries(saga.fv)) {
         const fate = favorFate(fs, day, keep);
         if (!fate) continue;
         if (fate === "expired") {
           // As Give up this favor does: its scenes end, and its questgiver offers today's favor again.
           const e = entries(player).find((x) => x.fav === npc && !x.wv);
           if (e) e.chapter.objectives.forEach((_, i) => endScene(player.id, objKey(e, i)));
           gone.push(favorById(fs.id)?.label ?? "a favor");
           if (saga.tr === `fv:${npc}`) delete saga.tr;
           showAgain(saga, `fv:${npc}`);
         }
         delete saga.fv[npc];
         changed = true;
       }
       if (!changed) return 0;
       if (gone.length) invalidate(player.id);
       markDirty(player);
       if (gone.length) {
         const say = () => {
           if (player.isValid) player.sendMessage(gone.length === 1 ? `§7[Story] An old daily favor ran out: ${gone[0]}.` : `§7[Story] ${gone.length} old daily favors ran out.`);
         };
         if (delay > 0) system.runTimeout(say, delay);
         else say();
       }
       return gone.length;
     }
     ```
     Update its doc comment (claimed favors of an earlier day, and accepted ones older than `favorDays`).
  5. **6.1, the home line.** In `showMenu` replace the five lines from `const tr = saga.tr ? ...` to the
     `else lines.push(available.length ? ...)` line with:

     ```js
     const n = nextStep(player, saga);
     if (n.e && n.story) lines.push(`§fNow: §e${n.story.title}§r`, `§7Current step: ${stepLine(player, n.e, saga)}`);
     else if (n.st !== "none") lines.push(`§fNext: §e${n.label}§r${n.dir ? ` §7${n.dir}` : n.lost ? ` §7${n.lost}` : ""}`, `§7${n.why}`);
     else if (n.row !== 1) lines.push(`§7${n.why}`);
     ```
     `available` is still used for the `Available (n)` button.
  6. **6.10, the count.** Add above `showMenu`:

     ```js
     /** What Current quests lists: the stories going (a party quest first) and the favors and jobs. @param {Player} player */
     function currentList(player) {
       const { saga, current } = sortStories(player);
       const list = entries(player);
       const favs = list.filter((e) => e.fav);
       // A party quest (party.js) comes first, also when the player finished that story long ago.
       const party = list.find((e) => e.pq);
       const stories = party && !current.includes(party.story) ? [party.story, ...current] : current;
       return { saga, list, favs, stories };
     }
     ```
     `currentPage`: replace its first five statements inside the loop (`sortStories` to `stories`) with
     `const { saga, list, favs, stories } = currentList(player);`. Leave
     `const needs = packsNeeded(story, saga);` and the `const step = needs.length ...` line exactly as they are.
     `showMenu`: the first action becomes
     `` [`Current quests (${shownNow.stories.length + shownNow.favs.length})`, () => currentPage(player)] `` with
     `const shownNow = currentList(player);` above the `actions` array.
  7. **6.11, no state from looking.** In `startChapter`: replace `const st = stateOf(saga, story);` with
     `const seen = saga.s[story.id];` and use `seen?.a`, `seen.cur`, `!seen?.dn.length` in the checks before the
     dialog (three places). After the dialog, the "check again" line reads the state afresh:
     `const now = saga.s[story.id];` and `(now?.a && now.cur === chapter.id)`. The accept call becomes
     `await accept(player, story, chapter, saga, stateOf(saga, story), choice, stop);`. The function body must
     contain exactly one `stateOf(` call, in that line. In `complete`'s `New story:` loop replace
     `saga.s[s.id]` in the `continue` condition with
     `(saga.s[s.id] && (saga.s[s.id].a || saga.s[s.id].dn.length))`.
  8. **6.14, the accept line.** In `accept`, replace the last `player.sendMessage(`§7The tracker ...`)` with:

     ```js
     player.sendMessage(getFor(player, "tracker") === true ? `§7The tracker ${spot} points the way. /realm:saga shows your progress, and a hint if you're stuck.` : "§7/realm:saga shows the way, and a hint if you're stuck (your story tracker is off: /realm:prefs).");
     ```
  9. **`complete`:** after `st.dn.push(chapter.id);` add `showAgain(saga, story.id);` (a finished chapter clears
     Stop tracking, so the next chapter's lead shows) and `saga.la = Date.now();`. Change the not-shared `Next:`
     line to
     `` `§e[Story] Next: talk to ${npcName(who)}${towardNpc(player, who)} for "${next.chapter.title}".` ``.
  10. **`la` stamps:** `favorEnd`, after `fs.a = 0;`: `saga.la = Date.now();`. `wanderEnd`, after `wv.c = 1;`:
      `saga.la = Date.now();`.
  11. `tools/saga-quest-box.test.mjs`: add `leadBox` to the `globalThis.api = { ... }` line. Add a test "a lead
      box always fits": for every story and every chapter index, build
      `n = { st: "start", label: `Talk to ${name}`, dir: "NE 99,900m", head, sub }` for each `leadText` kind that
      can apply (import `leadText` by running the pure part of `guide.js` as `tools/saga-lead.test.mjs` does;
      names from `NPC_NAMES` and `WANDERERS`, `pos`/`total` 12 of 14) and assert the box has at most 6 rows
      (`rowsOfBox`), at most `BOX_BYTES` bytes, no `...` and no `more` summary line; with 8 `others` the first
      two lines (head and step) are still there. Add "the main lead rides along": `questBox(..., others, also)`
      with `also = { row: 9, label: "Talk to Quill the Trader", dir: "NE 140m" }` contains
      `§3Main story§7: Talk to Quill the Trader NE 140m` before the other quests' lines.
  12. `tools/saga-ui-lead.test.mjs` (new), with the `grab` helper of `tools/saga-party-plays.test.mjs`:
      - `hotbarLead` run with `fit`, `widthOf`, `HUD` imported from `../tools/text-shared.js`: for every story
        `short` and every NPC and wanderer name with `dir` `NE 99,900m`, `widthOf` of the result is at most 228
        and it ends with ` NE 99,900m`; a short case equals `§bDrowned Bell: §fTalk to Old Tobin S 60m`.
      - `currentList` run with stubs (`sortStories` returns `current: []`; `entries` returns one party quest
        entry and one favor entry): `stories.length + favs.length === 2` (6.10).
      - the text of `startChapter` contains `stateOf(` exactly once and it is inside `await accept(` (6.11).
      - `tidyFavors` run with stubs and the real `favorFate` (from the pure part of `guide.js`): an accepted favor
        3 days old with `favorDays` 2 is deleted, returns 1, one message matching
        `/An old daily favor ran out: /`, `invalidate` called; one 2 days old is kept and returns 0; a `favorDays`
        of `99` is treated as 14.
      - `ui.js` no longer contains `function trackedFirst`, `function npcAt` or `let pointed`.
- Edge cases:
  - The lead's quest is one the player stopped tracking: it is not the top; the next visible quest is; with none,
    the box is cleared and `realm:track` is `{ player }` (`tools/test-bds/examples/saga-untrack.js` must still
    pass).
  - `leadTracker` off and no chapter accepted: box cleared, `realm:track { player }`; the returned `Next` still
    has the lead, so `realm:saga_lead` is unchanged.
  - The player's `tracker` is off (`shown` false): no box, but `realm:track` still carries the lead when
    `leadTracker` is on.
  - `trackerAt` is `hotbar` and another pack holds the bar: the lead waits, as an accepted quest's line does.
  - A favor runs out while its page is open: the page's own checks (`entries(player).find`) already handle a
    missing entry.
  - `tidyFavors` with `delay` and the player leaves before it: no message (`player.isValid`).
  - An existing save with an empty story state: `startChapter` treats it as no progress; nothing is deleted.
- Acceptance: `npx tsc -p . && node --test tools/saga-quest-box.test.mjs tools/saga-ui-lead.test.mjs
  tools/saga-pack-fallback.test.mjs tools/saga-gossip.test.mjs tools/saga-interaction-lifecycle.test.mjs
  tools/saga-lead.test.mjs && npx eslint tools/saga-ui-lead.test.mjs tools/saga-quest-box.test.mjs &&
  node tools/check-ascii.mjs && node tools/check-actionbar.mjs` pass.

### T4 Wiring: the loop, script events, join, debug (`main.js`)

- Repo / checkout: `mc-packs`
- Owns: `packs/saga_bp/scripts/main.js`, `packs/saga_bp/scripts/objectives.js` (one line, in `bump`)
- Reads (does not edit): `packs/saga_bp/scripts/guide.js`, `packs/saga_bp/scripts/ui.js`,
  `tools/check-event-guards.mjs`, `tools/o2-hotpaths.test.mjs`, `tools/lib/pack-sim.mjs`
- Depends on: T3
- Change:
  1. Import from `./guide.js`: `homesKnown`, `idleDays`, `joined`, `leadGone`, `leadMessage`, `nextStep`,
     `onNpcPlaces`, `publishLead`, `resendLeads`.
  2. **The loop.**
     - In the first `try` block add `if (runs % 600 === 7) for (const p of all()) tidyFavors(p);`.
     - Replace `if (get("enabled") !== true) return;` with

       ```js
       if (get("enabled") !== true) {
         // Paused: consumers of the story lead are told once that there is nothing to point at.
         if (runs % 2 === 0) for (const p of all()) publishLead(p, nextStep(p));
         return;
       }
       ```
     - In the per-player `try`, replace everything from `const list = entries(player);` to the `track(...)` line
       with

       ```js
       const list = entries(player);
       if (list.length) {
         const saga = sagaOf(player);
         if (runs % 5 === 0) for (const e of list) for (const name of missingPlaces(e, saga)) hintOps(player, name, e.story);
         tickPlayer(player, list);
       }
       // Every 2 seconds, or on the next run after progress so the count never lags. A player with no chapter
       // accepted gets the story lead: who to talk to next.
       if (tracking || progressed.delete(player.id)) publishLead(player, track(player, list, getFor(player, "tracker") === true && !busy.has(player.id)));
       ```
       `sendTrack` and `clearBox` are no longer called from `main.js`: remove them from the `./ui.js` import if
       nothing else uses them.
  3. **Script events.** Add `"realm:npc_places"` and `"realm:saga_lead_ping"` to the id list of the big
     `onScriptEvent` call, and this block before the guard (`if (id !== "realm:npc_talk" && ...) return;`), next
     to the other early blocks:

     ```js
     if (id === "realm:npc_places" || id === "realm:saga_lead_ping") {
       /** @type {any} */
       let msg;
       try {
         msg = JSON.parse(message);
       } catch {
         msg = undefined; // a ping with no message asks for everyone
       }
       if (id === "realm:saga_lead_ping") resendLeads(msg && typeof msg === "object" && typeof msg.player === "string" ? msg.player : undefined);
       else if (msg && typeof msg === "object") onNpcPlaces(msg);
       return;
     }
     ```
  4. **World load.** Add
     `system.runTimeout(() => send("realm:npc_places_ping", {}), 70); // where the townsfolk are posted, for directions to someone who isn't loaded`
     and
     `system.runTimeout(() => { if (!homesKnown()) send("realm:npc_places_ping", {}); }, 400);`.
  5. **Join.** Add above the `playerSpawn` subscription

     ```js
     /** A player came in: a stale stranger goes, the session starts, old favors run out (the chat line 5 seconds later). @param {Player} player */
     function onJoin(player) {
       wanderJoined(player);
       joined(player);
       tidyFavors(player, 100);
     }
     ```
     and call `onJoin(player)` where `wanderJoined(player)` is called today.
  6. **Leave.** In `afterEvents.playerLeave` add `leadGone(playerId);`.
  7. **Debug.** In `onDebug` add two branches (and both actions to its doc comment):

     ```js
     } else if (msg.action === "away") {
       // Test hook: as if the player was last here `days` days ago (a simulated player cannot rejoin as the same player).
       const days = Math.max(0, Math.min(3650, Math.floor(Number(msg.days) || 0)));
       const ms = days * 86400000;
       const saga = sagaOf(player);
       if (typeof saga.la === "number") saga.la -= ms;
       for (const st of Object.values(saga.s)) if (typeof st.t === "number") st.t -= ms;
       for (const fs of Object.values(saga.fv ?? {})) {
         if (!fs || typeof fs !== "object") continue;
         if (typeof fs.d === "number") fs.d -= days;
         if (typeof fs.t === "number") fs.t -= ms;
       }
       if (saga.wv && typeof saga.wv.t === "number") saga.wv.t -= ms;
       invalidate(player.id);
       markDirty(player);
       onJoin(player);
     } else if (msg.action === "next") {
       const n = nextStep(player);
       player.sendMessage(`[saga next] ${JSON.stringify({ row: n.row, idle: idleDays(sagaOf(player)), ...leadMessage(player.id, n) })}`);
     }
     ```
  8. `objectives.js`, `bump`: after `markDirty(player);` add
     `sagaOf(player).la = Date.now(); // the last story step, for "days since" (guide.js idleDays)`.
     Change nothing else in that file.
- Edge cases:
  - Stories disabled: the per-player loop does not run (as today); each player gets one empty
    `realm:saga_lead`; boxes run out by themselves.
  - `realm:saga_lead_ping` with `""`, `{}` or `{ "player": 5 }`: everyone, at most once in 20 ticks. With an
    unknown player id: nothing is sent.
  - `realm:npc_places` that is not JSON, or JSON `null`: ignored.
  - Both new ids are handled before the guard, so `node tools/check-event-guards.mjs` passes without adding them
    to the guard.
  - A `/reload` with players online: no `playerSpawn`; `joinedAt` falls back to the script's start time.
  - `tools/o2-hotpaths.test.mjs`: the lead path runs for its two idle players. It must stay within 13
    `getAllPlayers` calls. If the simulator lacks something the lead path touches, guard the pack code (a `try`
    exists in `npcAt`); do not edit `tools/lib/pack-sim.mjs`.
- Acceptance: `npx tsc -p . && node tools/check-event-guards.mjs && node tools/check-events.mjs &&
  node tools/check-actionbar.mjs && node --test tools/o2-hotpaths.test.mjs tools/saga-lead.test.mjs
  tools/saga-ui-lead.test.mjs && npm run test 2>&1 | tail -5` pass (the last line shows 0 failures).

### T5 BDS scenarios and the perf pair

- Repo / checkout: `mc-packs`
- Owns: `tools/test-bds/examples/saga-lead.js` (new), `tools/test-bds/examples/saga-lead-party.js` (new),
  `tools/test-bds/examples/saga-favor-expiry.js` (new), `tools/test-bds/examples/saga-perf-quests.js`,
  `tools/test-bds/saga-perf-quests.test.mjs`, and any existing `tools/test-bds/examples/saga-*.js` or `map*.js`
  whose expectation this workstream changes on purpose (list each in the PR body with the reason)
- Reads (does not edit): `tools/test-bds/README.md` ("Writing a scenario", "Profiling"),
  `tools/test-bds/examples/saga-quest-log.js` and `saga-untrack.js` (the header format and the `accept` helper),
  `packs/saga_bp/scripts/*.js`
- Depends on: T4
- Change: each new scenario starts with a comment that says what it proves, then its run command on its own line
  (`//   node tools/test-bds/run.mjs ...`), exactly as `saga-quest-log.js` does; the suite reads that line. Each
  must fail on `origin/master` and pass on the branch (C28). All use `--only saga_bp`, collect script events with
  `t.system.afterEvents.scriptEventReceive.subscribe(..., { namespaces: ["realm"] })`, and drive NPCs with
  `realm:npc_choose` and the form loop of `saga-quest-log.js`. Posts are sent by the scenario:
  `send("realm:npc_places", { part: 1, parts: 1, folk: [...] })`, relative to
  `ax = Math.floor(ann.location.x)`, `az = Math.floor(ann.location.z)` read after the spawn. Compare box and form
  text with the color codes removed. A lead's distance is rounded, so match it with a pattern
  (`/ E (35|40|45)m/`, `/ N (80|100|120)m/`), never an exact number.
  1. `saga-lead.js`, command
     `node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-lead.js --timeout 400`:
     1. Spawn `Ann` (op). Send posts: `tobin` at `(ax + 40, az)`, `reyes` at `(ax, az - 100)`, `mara` at
        `(ax - 200, az)`, all `minecraft:overworld`.
     2. New player (wait up to 200 ticks, the pack scan comes first): a `realm:side` from `saga`, slot `quest`,
        whose text contains `The story starts here` and `Talk to Old Tobin` and matches `/ E (35|40|45)m/`; a `realm:track` for Ann
        with `npc: "tobin"`, `x: ax + 40`, `z: az` and a label containing `Drowned Bell: Talk to Old Tobin`; a
        `realm:saga_lead` for Ann with `v: 1`, `st: "start"`, `k: "main"`, `s: "drowned_bell"`,
        `hint: "Talk to Old Tobin"`, `why: "The main story starts here."`, `npc: "tobin"`, `who: "Old Tobin"`,
        `x: ax + 40`, `z: az`, `more` a number, and a message length under 900.
     3. `realm:saga_debug { player: "Ann", action: "next" }`: a chat line starting `[saga next] ` whose JSON has
        `row: 10`.
     4. Accept `start:drowned_bell` at `tobin`: the next `realm:saga_lead` has `st: "step"`, `ch` set; the box's
        first line starts with `Drowned Bell: `; chat has `The tracker` and `points the way`.
     5. `realm:saga_debug { player: "Ann", action: "jump", story: "drowned_bell", chapter: "choir" }`: the lead
        becomes `st: "start"`, `hint: "Talk to Warden Reyes"`, `ch: "The Drowned Choir"`, `z: az - 100`; the box
        contains `Drowned Bell: next chapter`, `Talk to Warden Reyes` and `"The Drowned Choir" (2 of`, and matches
        `/ N (80|100|120)m/`;
        `next` reports `row: 9`.
     6. `/realm:saga` (`t.cmd`): the form body contains `Next: ` and `Talk to Warden Reyes` and does not contain
        `to start` (6.1). Answer `Available`: the body contains
        `The Calling: reach your Calling in /realm:skills, ask an operator for the Skills pack.` and no
        `different choices` on that line (6.6). Close both forms.
     7. `realm:saga_lead_ping { player: ann.id }`: a `realm:saga_lead` for Ann arrives within 5 ticks, equal to
        the last one.
     8. `realm:cfg_set { id: "l1", pack: "saga_bp", key: "leadTracker", value: false, player: ann.id }`: within
        100 ticks the newest `realm:track` for Ann has no `label`, and no later `realm:side` quest text contains
        `Talk to`; the last `realm:saga_lead` still has `st: "start"`. Set it back to `true`: the box returns.
     9. `realm:cfg_set` `tracker` `false` for Ann, then accept `start:drowned_bell` at `reyes`: chat has
        `your story tracker is off` and no `points the way` since that tick (6.14). Set `tracker` back.
     10. Bad posts: send `{ part: 2, parts: 3, folk: [] }`, then
         `{ part: 1, parts: 1, folk: [5, null, { id: "tobin", dim: "nowhere", x: 1, z: 1 }, { id: "ida", dim: "minecraft:overworld", x: "a", z: 1 }] }`.
         No script error (the harness fails the run on one). Jump to `drowned_bell` / `iron` (told by `ida`): the
         lead has no `x`, and the box shows `Talk to Ida the Relicsmith` with `(needs Townsfolk)`.
  2. `saga-lead-party.js`, command
     `node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-lead-party.js --timeout 400`:
     Ann and Bob, posts as above. Jump Ann to `drowned_bell` / `vigil`. Give both the tag `realm_party:t1`
     (`p.addTag`). Within 100 ticks: Bob's lead is `st: "start"`, `hint: "Talk to Old Tobin"`,
     `party: { on: 0, of: 2, behind: ["Bob"] }` with no `hold`; Ann's is `st: "party"`,
     `hint: "Meet Bob at Old Tobin"`, `party.hold: "Bob"`, and her box contains `party chapter`. Bob accepts
     `start:drowned_bell` at `tobin`: Bob's lead is `st: "step"` with `party.on: 1`; Ann's is `st: "party"` with
     `why` containing `helping Bob`, and her `next` reports `row: 4`. Remove both tags: within 100 ticks neither
     lead has `party`.
  3. `saga-favor-expiry.js`, command
     `node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-favor-expiry.js --timeout 400`:
     1. Ann accepts `start:drowned_bell` at `tobin`, then the favor `fvstart:tobin`. The box's first line starts
        with `Favor: ` (accepted this session, the newest), and the Drowned Bell is a line under it.
     2. `realm:saga_debug { player: "Ann", action: "away", days: 1 }`: no `ran out` message in 150 ticks; the
        box's first line now starts with `Drowned Bell: ` and the favor is a line under it (after a login the main
        story leads).
     3. `away` with `days: 2`: the favor's day is now 3 days old; within 150 ticks chat has
        `An old daily favor ran out: `; the box has no `Favor`; `realm:npc_talk { player: ann.id, npc: "tobin", req: "r1" }`
        is answered with a `realm:npc_offer` whose `key` is `fvstart:tobin`.
     4. `realm:cfg_set { id: "f1", pack: "saga_bp", key: "favorDays", value: 5 }`, accept the favor again,
        `away` with `days: 4`: no `ran out`; `away` with `days: 2`: it runs out.
  4. `saga-perf-quests.js`: add the argument `idle` (default 0): that many more players, named `Idle01`,
     `Idle02`..., spawned after the others on the same grid, who accept nothing. With `idle` above 0 the scenario
     sends `realm:npc_places` once, before the quests are accepted, with `tobin` and `mara` 30 blocks from the
     grid's first spot. Idle players count for "declared", "spawned" and "retained" but not for "quested"; no
     check requires a box from them (the same file must pass on a base tree). Log and report how many idle
     players had a quest box containing `Talk to` (`leadBoxes` in the `saga-quest-workload` report). The header
     gains a line describing `idle`. The default run (no `idle`) behaves exactly as before.
     `tools/test-bds/saga-perf-quests.test.mjs`: add a case with `idle: "2"` (two more spawns, `quested` equals
     `players`, the run passes with no box from the idle players) and keep every existing case passing.
  5. Run `node tools/test-bds/suite.mjs --filter '^(saga-|map|actionbar-steady|npc)' --retry 2>&1 | tail -40`.
     For each scenario that fails because the tracker now shows a lead or orders quests differently, change the
     scenario's expectation, never the pack, and list it in the PR body. A failure of any other kind goes back
     to the task that owns the file.
  6. **The perf pair.** Base tree: `git worktree add --detach ../mc-packs-02-base origin/master` (remove it with
     `git worktree remove ../mc-packs-02-base` when done). The new scenario file runs against both trees:

     ```bash
     S=tools/test-bds/examples/saga-perf-quests.js
     run() { node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-every 0 --profile-json "$1" $2 --only saga_bp,npc_bp,hud_bp --scenario $S --arg players=$3 --arg idle=$3 --arg seconds=120 --timeout 3000; }
     mkdir -p logs/perf-02
     run logs/perf-02/before-10-a.json "--packs ../mc-packs-02-base/packs" 5
     run logs/perf-02/after-10-a.json  ""                                  5
     run logs/perf-02/before-10-b.json "--packs ../mc-packs-02-base/packs" 5
     run logs/perf-02/after-10-b.json  ""                                  5
     run logs/perf-02/before-40-a.json "--packs ../mc-packs-02-base/packs" 20
     run logs/perf-02/after-40-a.json  ""                                  20
     run logs/perf-02/before-40-b.json "--packs ../mc-packs-02-base/packs" 20
     run logs/perf-02/after-40-b.json  ""                                  20
     ```
     One run at a time. Read `saga_bp`'s steady ms a tick from each JSON
     (`packs[].pack === "saga_bp"`, `steadyMsPerTick`, else `msPerTick`); a run counts only when its
     `acceptance.ok` is true. Pass: mean(after) - mean(before) is at most 0.02 at 10 players (5 + 5) and at most
     0.03 at 40 (20 + 20). Then the gate, once:
     `node tools/test-bds/suite.mjs --perf 10,40 --perf-only saga_bp,npc_bp,hud_bp 2>&1 | tail -20` must not
     report `saga_bp` over 0.15 at 40. Put the eight figures and the gate's line in the PR body.
     If the pair fails, look at `saga_bp`'s top callbacks in the after JSON and apply, in this order, re-measuring
     after each: (a) confirm the choice cache hits (log `choose` calls for one run; expected: a handful per
     player per minute); (b) in `npcSpot`, use a known post always (skip `npcAt` whenever `home` is set);
     (c) double the steps of `roundFar`. Do not raise the budget.
     Also start the CI pair for the unchanged workload: GitHub > Actions > validate > Run workflow on the
     branch, `base` = `master`, `scenarios` =
     `saga-perf-quests --arg players=40 --arg seconds=120 --timeout 3000`. The base tree runs its own copy of
     the scenario there, so `idle` is not used in CI.
- Edge cases:
  - BDS cannot be downloaded in the session (`node tools/test-bds/setup.mjs` fails): write the scenarios, run
    `node tools/test-bds/suite.mjs --prepare-only`, push the branch and read the PR's `pr-tests.yml` `scenarios`
    and `perf` jobs instead; say so in the PR body. The local perf pair is then replaced by the CI pair plus the
    PR's own 10-player perf job.
  - `--flat` worlds spawn at `0, 0`; the scenarios read the position, so both work.
  - The pack scan takes about 5 s after the world loads: the first waits use `timeout: 200`.
- Acceptance: the three run commands above exit 0;
  `node --test tools/test-bds/saga-perf-quests.test.mjs` passes;
  `node tools/test-bds/suite.mjs --filter '^(saga-|map|actionbar-steady|npc)' --retry` reports no failure; the
  perf pair meets its limits (or the CI jobs are green, per the first edge case).

### T6 Wire-up and docs

- Repo / checkout: `mc-packs`
- Owns: `packs/saga_bp/manifest.json`, `packs/saga_bp/scripts/diag.js`, `packs/help_bp/**` (through its
  generator), `docs/PACKS.md`, `docs/NEWS.md`, `release/notes.json`, `ROADMAP.md`,
  `docs/specs/realm-rework/README.md`, `docs/specs/realm-rework/02-story-lead.md` (deleted),
  `packs/news_bp/**` (through its generator)
- Reads (does not edit): everything the other tasks changed
- Depends on: T1, T2, T3, T4, T5
- Change, in this order:
  1. `packs/saga_bp/manifest.json`: `header.version` becomes `[1, M + 1, 0]`, where `[1, M, P]` is the version on
     `origin/master`. Then `node tools/sync-diag.mjs`.
  2. `docs/PACKS.md`. Read one section at a time (`grep -n '^## ' docs/PACKS.md`, then `sed -n 'A,Bp'`); never
     open the file whole. In the texts below, `\`` stands for one backtick in `PACKS.md`. Find each sentence to
     replace with `grep -n`; if one is not there word for word (another workstream edited it), keep its meaning
     and make the same change. In `## Story Questlines — \`saga_bp\``:
     - `### How to use`, step 1: add at the end
       `New here, or between two chapters? The tracker says who to talk to next, which way and how far (\`The story starts here\`, \`[>] Talk to Old Tobin S 60m\`), and the Minimap's gold star points there.`
     - step 4: replace `until it's done, then the newest quest again` with
       `until it's done; then the usual order is back: a finished main chapter to report, your party's chapter, another finished quest to report, a quest you took since you logged in, the main story, then the rest`.
     - step 6: add at the end `Between chapters the tracker and the log's first line name the next NPC.`
     - step 8: add at the end
       `A favor you took but did not finish runs out after 2 more days (\`favorDays\`); chat says so, and the questgiver offers a new one.`
     - step 11: add at the end
       `**Story lead on my tracker** there turns off the "who to talk to next" lines and their Minimap star.`
     - `### What players see`, the bullet `**The tracker**`: replace the sentence
       `It follows your tracked quest, otherwise the last accepted chapter; stopped quests are skipped.` with
       `It follows your tracked quest; otherwise a finished main chapter to report, your party's chapter, another finished quest to report, a quest accepted since you logged in (the newest), then the main story; stopped quests are skipped.`
       and add a paragraph to the bullet:
       `With no chapter accepted (a new player, or between two chapters) the box shows the **story lead** in three lines: what it is (\`The story starts here\`, \`The Gray Choir: next chapter\`, \`Main story: next part\`, \`<story>: new story\`, \`<story>: party chapter\`), \`[>] Talk to <name>\` with the direction and distance (rounded; \`(you're here)\`, \`in the Nether\`, or \`(/realm:npc_who)\` when nobody has placed them), and the chapter it starts (\`"The Pattern" (4 of 12)\`). Other quests going are listed under it. When another quest is on top and no main chapter is accepted, one line keeps the main story in view: \`Main story: Talk to Quill the Trader NE 140m\`. Above the hotbar the lead is one line, \`The Gray Choir: Talk to Quill the Trader NE 140m\`. Directions to a townsfolk use their post, so they work from anywhere.`
     - the bullet `**The story log**`: replace `the story you're on and its **Current step**` with
       `the story you're on and its **Current step**, or with no chapter accepted \`Next: Talk to <name>\` with the direction and the reason`;
       and after `and the next locked ones with what they need` add
       ` (the real reason: \`reach your Calling in /realm:skills\`, \`ask an operator for the Skills pack\`, a festival, a friendship, or choices made earlier)`.
     - the bullet `**Daily favors:**`: add at the end
       `An accepted favor that is not finished runs out after \`favorDays\` (2) more days.`
     - `### Configuration`: add two rows after `favors`:
       `| \`leadTracker\` | \`true\` | With no quest going, the tracker shows the story lead (who to talk to next), for players who haven't chosen in \`/realm:prefs\` |`
       `| \`favorDays\` | \`2\` | An accepted daily favor that was not finished runs out after this many more real days (UTC), 1 to 14 |`
       and in the paragraph under the table, after the sentence about **Where my story tracker shows**, add
       `**Story lead on my tracker** (follows \`leadTracker\`) hides the lead for themselves.`
     - `### Saved data`: in the `saga:p` row change `g?, cx?, fv? }` to `g?, cx?, fv?, la? }` and add to its
       text `\`la\` is when the player last took a story step.`; in the `saga:pref` row change
       `\`tracker\` and \`trackerAt\` choices` to `\`tracker\`, \`trackerAt\` and \`leadTracker\` choices`.
     - `### How it works`: in the `**Modules:**` bullet add
       `\`guide.js\` (the next step: the ladder that picks the story lead, where the townsfolk are posted, one quest's tracker line)`;
       replace the `**Minimap:**` bullet's `the tracker's target goes out as` sentence start with
       `the tracker's target (an accepted quest's, or the story lead's NPC) goes out as`; and add two bullets:
       `- **The story lead** (\`guide.js\` \`nextStep\`): one ladder, first match wins: the tracked quest; a finished main chapter; the party's chapter; another finished quest; a quest accepted this session; the main chapter; the party's chapter nobody accepted yet; the next main chapter's NPC; the next main story's giver; another quest; another story's next chapter; a side, heart or festival story that can start; a locked main story's reason. The choice is cached per player until their chapters, flags, party view, tracked quest or the day change. Every 2 seconds it goes out as \`realm:saga_lead\` when it changed (see [How the packs work together](#how-the-packs-work-together)); \`realm:saga_lead_ping\` sends it again.`
       `- **Townsfolk posts:** the pack keeps Townsfolk's \`realm:npc_places\` in memory (asked with \`realm:npc_places_ping\` 70 ticks after the world loads) and uses a post for directions when the NPC is not loaded, or is more than 48 blocks away.`
     In `## How the packs work together`:
     - `### Pack links` table: add the rows
       `| Story Questlines → any pack (the story lead) | Story Questlines sends each player's next step as \`realm:saga_lead\`: what to do in words, why, who and where. Packs keep the last one per player in memory and ask again with \`realm:saga_lead_ping\`. Nothing breaks without a listener |`
       `| Townsfolk → Story Questlines (posts) | Story Questlines keeps \`realm:npc_places\` so the tracker, the log and the lead give a direction to a townsfolk who is not loaded |`
     - in the list under `**The Hearth & Hearsay events**`, after the `realm:saga_progress` bullet, add
       `- **\`realm:saga_lead\`** (Story Questlines sends) \`{ player, v: 1, st, k, s, title, ch?, hint, why?, npc?, who?, place?, dim?, x?, z?, more, party? }\`, or \`{ player, v: 1 }\` when there is nothing to point at (everything done, or stories paused): the one thing that player should do next. \`st\`: \`start\` (talk to \`who\` to take on a chapter), \`step\` (a step of an accepted chapter), \`report\` (it is done: report to \`who\`), \`party\` (the party's chapter, which the player helps with or waits for), \`wait\` (the main story is locked; \`hint\` says by what). \`k\`: the story's kind (\`main\`, \`side\`, \`heart\`, \`wander\`, \`festival\`); a daily favor is \`side\` with \`s\` \`fv:<npc>\`, a stranger's job \`wander\` with \`s\` \`wv:<template>\`. \`hint\` and \`why\` are plain sentences of at most 120 characters. \`more\`: other stories that could start now, 0 to 9. \`party\` \`{ on, of, hold?, behind }\`: members online, how many have the chapter accepted, who the party waits for. Sent within 2 seconds of a join, when it changes (checked every 2 seconds) and on \`realm:saga_lead_ping\` \`{ player? }\`; at most 900 characters.`
     - in the list under `**The minimap events**`: in the `realm:npc_places` bullet add
       ` Story Questlines reads it too (directions to a townsfolk who is not loaded).`; in the `realm:track` bullet
       replace `where the tracker points` with
       `where the tracker points: an accepted quest's target, or with no chapter accepted the NPC of the story lead (\`Drowned Bell: Talk to Old Tobin\`)`.
     In `## Townsfolk — \`npc_bp\``, `### How it works`, the `**Minimap:**` bullet: add at the end
     ` Story Questlines and Welcome Message read it too.` (docs only: `npc_bp` is not bumped).
  3. `README.md`: no change (no command and no summary changed). Confirm with `node tools/check-docs.mjs`.
  4. `docs/NEWS.md`: add at the top, above the newest entry (plain ASCII):

     ```
     ## The story always points somewhere

     - Story Questlines: your story tracker is never empty. With no quest going it says who to talk to next, which way and how far, and the Minimap's gold star points there. New players see "The story starts here".
     - Directions to townsfolk work from anywhere now, not only when they are in sight.
     - After you log in, the main story is back on top of the tracker. A quest you picked with Track this quest, a finished quest waiting for its report and a quest you took since logging in still come first.
     - A daily favor you took but never finished runs out after 2 days, so its questgiver can offer you a new one.
     - /realm:saga names the right story between chapters, and its Available page gives the real reason a story is locked.
     - Rather not see it? Disable "Story lead on my tracker" in /realm:prefs.
     ```
  5. `release/notes.json`: add to `notes` (keep the old lines):
     `"Story Questlines: the story tracker and the Minimap star are never empty. With no quest going they point at the townsfolk who has your next chapter, with a direction that works from anywhere; the main story leads again after each login; unfinished daily favors run out after 2 days; /realm:saga names the right story between chapters and gives real lock reasons."`
     Replace `packNotes.saga_bp` with
     `{ "version": "<the new saga_bp version>", "notes": "The story lead: who to talk to next on the tracker, above the hotbar and on the Minimap; directions to townsfolk who are not loaded; realm:saga_lead for other packs; a new tracker order; favors run out after favorDays (2); the Story Log's first line, lock reasons, the Current quests count and the accept line are fixed. New options: leadTracker, favorDays." }`.
     `help_bp` and `news_bp` name their own release.
  6. `package.json`: no change (`npm run test` already runs every `tools/**/*.test.mjs`).
  7. `ROADMAP.md`: delete the `## Realm rework 02: the story lead` entry. `docs/specs/realm-rework/README.md`:
     delete the row for 02 in the Workstreams table. Delete `docs/specs/realm-rework/02-story-lead.md`.
  8. Merge `origin/master` if it moved. Then regenerate, last, in this order:
     `node tools/help-catalog.mjs`, `node tools/admin-catalog.mjs` (no command changed: it must report no
     change; if `packs/admin_bp/scripts/catalog.js` did change, bump `admin_bp` and add its `packNotes`),
     `node tools/gen-news.mjs`, `node tools/sync-diag.mjs`.
  9. `npm run check 2>&1 | tail -30` and `npm run build 2>&1 | tail -3`, then the bundle smoke:
     `npm run bundle -- --all 2>&1 | tail -3` and
     `node tools/test-bds/run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/bundle-smoke.js`.
- Edge cases:
  - `check-docs` fails on `leadTracker` or `favorDays`: the Configuration rows are missing or misspelled.
  - `release-notes.mjs` fails: `packNotes.saga_bp.version` is not the new `header.version`.
  - Another lane merged first: merge `master`, then repeat step 8 (catalogs last).
- Acceptance: `npm run check 2>&1 | tail -30` ends with the versions check passing; `npm run build 2>&1 | tail -3`
  succeeds; `git status --short` shows no generated file left unstaged; `grep -c "realm:saga_lead" docs/PACKS.md`
  is at least 4.

## Waves

W1: T1 · W2: T2 (needs T1) · W3: T3 (needs T2) · W4: T4 (needs T3) · W5: T5 (needs T4) · W6: T6 (last; needs all).

Strictly one after another: each task's type check needs the exports of the one before, and `ui.js` and
`main.js` each have one owner.

## Review focus

- **One authority:** for every ladder row, the box's top equals the lead's quest; the two exceptions are a
  stopped quest and `leadTracker` off. Check rows 5 and 6 against a tracked quest, and a party view with and
  without an entry.
- **C1 conformance:** field names, the empty form, cuts, `v: 1`, the ping; nothing sent before
  `installed.ready`; no resend every 2 s for a timed step (the `survive` / `vigil` / `ride` label rule).
- **No leak:** a secret step without a bought hint has no `dim`, `x`, `z` in `realm:saga_lead` or `realm:track`.
- **Saved data:** `la` only; `tidyFavors` deletes exactly what `favorFate` says; `startChapter` creates no
  state; a corrupt save path is untouched.
- **C29 and C17:** the two new ids are handled before the guard; the delayed favor line checks `player.isValid`;
  `leadGone` clears all three maps on leave.
- **C21:** `choose()` runs on a key change only; no `getAllPlayers` in the lead path; the perf pair's figures.
- **Tests that read `ui.js` as text** still pass, and the box region has no new top-level statement.
- **Copy:** every string is ASCII plus `§`; the lead block is at most 6 rows; the hotbar line is at most 228 px.

## Release

One PR to `master` in `nishant/mc-packs`, merged with a merge commit; then the `release` workflow publishes
(never run for real from a session: `node tools/ci-release.mjs`, hosting's `publish-packs.mjs`, any upload to a
`packs-<slug>` release). Bumps: `saga_bp` (minor), `help_bp` and `news_bp` (by their generators). No hosting
change by hand. Verify: the release run's summary, check-live, and the Realm Bundle version on
https://minecraft.nish.software/realm/. `MANUAL-STEPS.md` (nishant/skills): add one real-client check for the
owner, "with no quest going, the lead's three lines fit in the Right 4 quest box on the phone, and the gold star
points at the townsfolk named".

## Open questions for the research phase

1. `saga_bp`'s steady ms a tick in `saga-perf-quests` at 5 + 5 and 20 + 20 players on `origin/master` (the
   "before" of the pair); not measured yet.
2. Do `fit(text, px)`, `widthOf(text)` and `HUD.BAR_PX` in the `text.js` that 01 shipped have these names and
   argument orders? Read `packs/saga_bp/scripts/text.js`; use what is there.
3. Does `tools/lib/pack-sim.mjs` run the lead path for players with no quest without an error
   (`tools/o2-hotpaths.test.mjs`)? It has `player.location` and `dimension.id` but no `dimension.getEntities`.
4. In the one-context Realm Bundle, does Townsfolk answer the `realm:npc_places_ping` sent 70 ticks after
   `worldLoad`, or only the second one at 400 (`bundle-smoke.js`, then `/scriptevent realm:saga_debug` `next`)?
5. On a phone, do the lead's rows crowd the Right 4 slot next to the Minimap (owner check on the Realm; the
   harness has no client)?
