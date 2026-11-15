# Your Story: the `/realm:saga` front door, Previously, three picks, offer order at NPCs

Status: in progress · Slug: realm-rework-03-your-story · Date: 2026-11-15 · Size: large
Repos: nishant/mc-packs (spec lives here); nishant/skills (one `MANUAL-STEPS.md` entry at release, text under Release)
ROADMAP: `ROADMAP.md`, entry "Realm rework 03: Your Story (the /realm:saga front door, Previously, picks)"

Program: `docs/specs/realm-rework/README.md`. Its decisions D1-D20 and contracts C1-C8 bind this spec.
Depends on (must be released first): 01 (`packs/saga_bp/scripts/text.js`), 02 (`packs/saga_bp/scripts/guide.js`
with `nextStep(player)`, the NPC homes, favor expiry). Story lane order: 01, 02, 06, then this.
The ship session stops when `packs/saga_bp/scripts/guide.js` or `packs/saga_bp/scripts/text.js` is missing.

## Goal

A player who types `/realm:saga` (or presses the Realm Menu's Continue button, workstream 09) sees one screen,
**Your Story**: where they are in the main story, the one next step with its direction and distance, and why.
From there: Go (track it and close), Previously (a recap, also shown by itself after a week away), Something
else (at most three picks instead of a list of fifty) and Everything (the old Story Log). Townsfolk put the
next step first among their buttons. No story, command, id or saved key is removed or renamed.

Outcomes:

1. `/realm:saga` opens a form titled `Your Story` with at most 6 buttons, in every state listed under
   Design, UI, "Your Story". Its `Next:` line is the lead from `nextStep(player)` (02), never a second
   computation. (T3, T6)
2. `Go: <target>` makes the tracker follow that step, sends one chat line with the direction and distance,
   and no further form opens. (T3, T6)
3. `Previously` shows the last 3 finished chapters of the story in focus with the choices made, and
   `Read the last chapter again` pages through that chapter's intro and outro. Any finished chapter of any
   story can be read again. (T2, T4)
4. A player with story progress who was away `recapDays` (default 7) real days or more gets, 200 ticks
   after joining, at most three chat lines and the `Previously` form; the form is tried again every 40 ticks
   for 30 seconds while the player is busy; it is shown once per return, and comes again at the next join if
   it never opened. `skipAutoRecap(playerId, what)` lets workstream 11 suppress it. (T2, T4, T6)
5. `Something else` shows at most 3 picks (a report or the main story, the nearest side story, a quick
   favor), then `See everything (n)`: every story open to the player as a button, with `Locked for now (n)`
   one tap further. A Recurring Wanderer's chain appears in no list until the player has met that wanderer.
   (T1, T5)
6. The engine reads three optional story fields, `opensAfter`, `weight` and `matters`. With none of them
   set (today's content) every story opens exactly when it does today; the only visible change is that at
   most two new side stories are "Offered now" and the rest sit one tap further. (T1, T7)
7. At a townsfolk, the offer for the player's next step sorts first (order 1) with the second line
   `Your next step`; new side stories that are not offered now sit behind one `More stories (n)` button;
   finishing a chapter that opens several stories sends one chat line, not one per story. (T7)
8. `Everything` opens the old Story Log with the same pages; `/realm:saga_log` still opens `Current quests`.
   Every button line this pack builds on these screens is at most 168 px wide, proven by a unit test over
   every story, NPC name and distance. (T3, T7)
9. `Play with my party` (only with a party tag and `partyStory` on) shows where each online party mate is in
   the main story and today's sharing rule in two lines. The page is one module that workstream 05 replaces.
   (T6)
10. Saved data: three new optional fields in `saga:p` (`ls`, `la`, `rc`) and at most 8 flags `g.met_<id>`,
    under 200 bytes together. An old save loads unchanged, an older pack version keeps the new fields, and
    the 30,000-byte save bound test still passes with them. (T2)
11. Unit tests for the picks and the recap wording, a width test, and five BDS scenarios pass; the three
    existing scenarios that open `/realm:saga` are updated. (T1, T2, T3, T8)

## Out of scope

- `guide.js`, `nextStep`, the ladder, the tracker lead, the Minimap star, `realm:saga_lead`, NPC homes, favor
  expiry and the lock-reason texts: workstream 02. This spec only calls them.
- Authored recap text, the content values of `opensAfter`, `weight`, `matters`, the `check-stories` rules
  for them, making *The Last Map* require *The Drowned Bell*, the favor board of 3, hand-over lines, goal
  lines, tips, `docs/story.json`: workstream 04.
- The opt-in party story, the vote, the helper share, `partyStoryAsk`: workstream 05. This spec ships only
  the read-only party page.
- The Realm Menu's `Continue` button, `menu.js`, `realm:card_ping`: workstream 09. The login card and the
  call to `skipAutoRecap`: workstream 11. `welcome_bp`'s text line about `/realm:saga`
  (`packs/welcome_bp/scripts/config.js:76`): workstream 11.
- Choice labels written in the story files that are wider than a button (content, workstream 04).
- A hard cap on active quests, accepting a chapter without walking to the NPC, a particle trail
  (`research/saga-flow.md` section 10: rejected).
- No change to any story, chapter or choice id, to `dn`, `f`, `ch`, or to the `saga:` prefix.

## Decisions

README decisions this spec implements: **D9** (the lead is the one fact: Your Story prints it), **D10** (Your
Story is the front door; the Story Log is `Everything`), **D11** (choice is cut by presentation: 3 picks,
`opensAfter`, two "Offered now", wanderers once met; the favor board is 04), **D19** (widths come from
`text.js`), **D12** (only as far as a party page that 05 replaces).

Local decisions:

| # | Decision | Why |
|---|---|---|
| L1 | New screens are new modules (`front.js`, `recap.js`, `picks.js`, `party-page.js`) on top of three small helper modules (`lead.js`, `labels.js`, and the pure `picks-core.js`, `recap-text.js`). `ui.js` (1,938 lines) only gets wiring and label fixes, owned by one task. | Parallel tasks without two owners of `ui.js`; pure modules run in node tests without a `vm`. |
| L2 | `lead.js` is the only file that imports from `guide.js`. Everything else calls `leadOf(player)` and `homeOf(npc)`. | One place to adapt if 02's exports are named differently than this spec assumes. |
| L3 | `/realm:saga_log` is unchanged: it opens `Current quests`, as today (D10: "keeps opening the log"). The Story Log menu is reached through `Everything`; its last button reads `Back`. (default) | No muscle memory changes, and four existing scenarios that use the command keep working. |
| L4 | `Go` on the headline lead pins nothing: it only un-hides the story, redraws the tracker and says where. `Go` on a pick sets `saga.tr` to that story (the main-story pick clears `saga.tr` instead). (default) | The lead already is what the tracker shows (D9). Pinning the main story would keep a later favor off the tracker. |
| L5 | `recapDays`: world option, whole days 0 to 60, default 7; 0 switches the automatic recap off. `recapPopup`: player option, default on, label `Story recap when I come back`. (default) | Brief: "by itself after recapDays (7) away". Each player can keep the chat lines and drop the popup. |
| L6 | `rc` means "days away of a return whose recap is still owed", not the research's "the `ls` value last shown". | `ls` is overwritten at every join, so a recap that never opened (the player was busy for 30 s, or left) could not come again. |
| L7 | A return of `recapDays` or more also clears `saga.tr` when it names anything but a main story. (default) | After weeks away the main story should lead again (`research/saga-flow.md` 8.4). |
| L8 | The generated recap is one sentence built from the chapter's step labels plus the choices made; only the newest chapter also gets the first outro page, cut at a sentence. Exact rules under Design, Data. | Accurate without authored text; outros are dialogue, so only one excerpt, and only for the chapter the player needs most. |
| L9 | `opensAfter` is enforced by merging it into the story's `requires.chapters` in one function, `storyRequires(story)`, used wherever a story's `requires` is checked (six call sites and the new-story chat line). A story the player already started is never locked again. | No new gate logic; the lock text ("finish "The Inn Remembers" of Signs in the Sky") already exists. |
| L10 | "Offered now" = every startable main, heart, festival and (met) wanderer story, plus the two side stories that sort first (`matters` first, then lower `weight`, default 50, then file order). Other startable side stories are "More in town" and, at their NPC, behind `More stories (n)`. Nothing is locked by this. (default) | D11: "at most two Offered now"; heart, festival and wanderer stories are only ever offered by their own NPC. |
| L11 | "Met" for a wanderer chain: the player talked to that Recurring Wanderer since this update (`g.met_<id>` = "1"), or has progress in the chain, or the chain's camp stands. | The only signals that exist; progress and offers of an unmet chain are untouched. |
| L12 | The recommended offer's second line is `§2Your next step` (dark green), except a report, which keeps `Done: report back`. | Dark colors read on the light gray button (`presets.js` uses `§4` for the same reason). |
| L13 | The Story Log's `Available (n)` button opens the new `All stories` page (buttons) instead of the one-page text wall (`research/saga-flow.md` 6.5). The other log pages are unchanged. | Same content as `See everything`; one implementation. |
| L14 | Button lines of the log that are wider than 168 px are shortened (list under T7). `Current quests` moves each quest's step text from the button's second line into the page body. | `research/saga-flow.md` 6.9: 374 of 607 step labels are wider than a button. |
| L15 | New debug actions `away` and `recap_skip` on `realm:saga_debug`, behind the existing operator check. | The harness cannot rejoin as the same player; `skipAutoRecap` has no caller until workstream 11. |

## Current state

Line numbers are from commit `470be3d` (2026-11-15), before workstreams 01, 02 and 06 landed. They will have
moved: find every place by the function name given. All paths are under `packs/saga_bp/scripts/` unless
they start with `tools/` or `docs/`.

**Commands.** `main.js:631-638` registers `realm:saga` (handler `showMenu`) and `realm:saga_log` (handler
`currentPage`), both through `withPlayer` (`main.js:596-608`), which runs the handler in `system.run`.

**The Story Log.** `ui.js:1667-1701` `showMenu(player)`: a loop on `lifecycle(player)`; body `Now:` /
`Current step:`; buttons `Current quests (n)`, `Available (n)`, `Finished (...)`, `Codex (n)`, `Daily favors`,
for operators `Story places` and `Operator tools`, then `Close`. `currentPage` (`ui.js:1704-1739`) puts the
step text, cut at 60 characters, on each button's second line. `availablePage` (`ui.js:1742-1755`) is one
text body. `sortStories` (`ui.js:1641-1664`) splits stories into current, available, locked, done.
`choicesMade` (`ui.js:1619-1638`) lists the labels of the choices a player made in a story. Workstream 01
adds a `Visions and dreams` page to this log; it stays where 01 put it.

**Offers.** `offerFor` (`ui.js:222-243`) builds `{ key, label }` for one story at one NPC: keys `start:`,
`end:`, `info:`, `wait:` plus the story id. `offersAt` (`ui.js:267-288`) adds `order`
(`CONFIG.offerOrder` 20 for main, 21 others, 19 riddles, 22 strangers, 25 favors). `main.js:346-355`
`onTalk` sends them as `realm:npc_offer`. Townsfolk sorts by `order`, then label, and keeps at most 16
(`packs/npc_bp/scripts/main.js:80`, `:1098`); its own `Give <item>` button has order 0. `choose`
(`ui.js:310-330`) handles `realm:npc_choose` keys.

**Chapters.** `startChapter` (`ui.js:597-641`), `accept` (`ui.js:647-699`), `acceptFor` (`ui.js:527-556`),
`endChapter` (`ui.js:812-882`), `complete` (`ui.js:891-944`). `complete` ends with a loop
(`ui.js:938-941`) that sends `[Story] New story: <title>. Talk to <giver>.` once per newly open story.
A story's `requires` is checked at seven places: `ui.js:236` (`offerFor`), `ui.js:608` (`startChapter`),
`ui.js:940` (`complete`), `ui.js:1657` (`sortStories`), `party.js:58` (`canTake`), `party.js:111`
(`frontier`), `wander.js:326` (`sendWanderState`). Each of them already skips the check for a story the
player has started.

**Saved data.** `data.js:41-50` typedef `Saga`: `{ s, g?, cx?, fv?, wv?, wn?, tr?, ut? }` in the player
property `saga:p`. `sagaOf` (`data.js:283-320`) validates the fields it knows and keeps every other field.
`trimSave` (`data.js:342-374`) drops only `ut`, finished favors and old codex ids. `markDirty(player, now)`
(`data.js:394`) saves within 5 s, or at once. There is no last-seen time today: the only times are `st.t`
(accept) and `st.fin` (story finished). `main.js:742-755` (`playerSpawn`, `initialSpawn`) only calls
`wanderJoined`; `main.js:760-766` (`beforeEvents.playerLeave`) calls `flush(player.id)`. Player properties
can be written in `beforeEvents.playerLeave` (`packs/news_bp/scripts/main.js:227-238` does).

**Forms.** `util.js:202-213` `show(player, form)`: retries `UserBusy` 20 times, gives up after `FORM_TICKS`
900 and then cancels the player's other interactions. `util.js:221-227` `showOnce(player, form, limit)`: one
try, no retry, ends nothing else on a timeout. `util.js:362-373` `dialog(player, title, header, pages,
buttons)`: pages with `Next`. `util.js:125-132` `lifecycle(player)` returns a `stale()` check.
`util.js:324` `busy`: players in one of the pack's dialogues or a vision. Never a form `.header()`.

**Party.** `party.js:26` `partyTag`, `party.js:29-32` `partyMates` (online, any distance),
`party.js:99-118` `frontier(saga, player)`: the first unfinished main chapter, with `why` when the story
cannot start yet. `data.js:787` `partyViews`: the party's chapter per player, in memory.

**Settings.** `settings.js:13-35` `OPTIONS`; world options need a key in `config.js` `CONFIG`; a player-only
option uses `default` (see `spotGuides`). `get(key)` / `getFor(player, key)`.

**Widths.** A button line holds 168 px (`packs/admin_bp/scripts/presets.js:96`). After 01,
`text.js` exports `widthOf(s)` (codes take no room, bold adds 1 px a glyph) and `fit(text, px)` (one line cut
with `...`). It imports nothing, so node tests import it directly.

**Tests.** Pure modules are imported by tests directly (`tools/saga-champions-session.test.mjs`); modules
that import `@minecraft/server` are tested by slicing source into a `vm` (`tools/saga-save-bound.test.mjs`).
BDS scenarios drive NPCs with `realm:npc_talk` / `realm:npc_choose`, jump with `realm:saga_debug`
(`main.js:376-434`), and answer forms with `t.waitForm` / `t.answerForm`
(`tools/test-bds/examples/saga-untrack.js`). A simulated player cannot rejoin as the same player.
Scenarios that run `/realm:saga` and expect `Story Log`: `saga-op-deop.js:32-33`, `saga-op-tools.js:17-18`,
`saga-party-story.js:60-61` and `:102-103`.

**The Realm Menu.** `packs/admin_bp/scripts/presets.js:240-241` `NAMES` has
`"realm:saga": ["Story Log", "Quests, hints, codex, favors"]` and
`"realm:saga_log": ["Current Quests", "What to do next"]`; `tools/admin-catalog.mjs:178-180` fails when a
name or hint is wider than 168 px. The menu runs a command with `player.runCommand`, so `/realm:saga` needs
no change to be the right thing for 09's `Continue` button.

### What 02 ships, as this spec uses it

This spec was written before `02-story-lead.md` existed. It needs three things from 02. T3 verifies them
and writes `lead.js` so that the rest of this spec never touches `guide.js`:

| Need | Assumed form | Check |
|---|---|---|
| The lead for a player | `nextStep(player)` exported from `guide.js`, returning the README's C1 object without `player` and `v`, or `undefined` | `grep -n "export function nextStep" packs/saga_bp/scripts/guide.js` |
| Where a townsfolk stands | a `Map<npc id, { dim, x, z }>` filled from `realm:npc_places` (the research calls it `npcHome`, exported from `guide.js`) | `grep -n "npc_places" packs/saga_bp/scripts/*.js` |
| A tracked story with no accepted chapter leads | with `saga.tr = "<story id>"` for a story the player can start, `nextStep` returns that story's lead (`research/saga-flow.md` 8.2, ladder row 2) | BDS scenario `saga-picks.js`, last step |

## Design

### Data

**Saved fields (all optional, all in the player property `saga:p`; no new key).**

| Field | Type and bounds | Meaning | Written |
|---|---|---|---|
| `ls` | number, ms since 1970, greater than 0 | When this player was last on the realm. | On join, after the days away are worked out (`joined`); on leave (`left`). Only for a player with story progress. |
| `la` | number, ms since 1970, greater than 0 | When this player last accepted or reported a chapter or a daily favor. | `touch(saga)` in `accept`, `acceptFor`, `complete`, `favorStart`, `favorEnd`. |
| `rc` | whole number 1 to 9999 | Days away of a return whose recap is still owed. Absent when nothing is owed. | Set on a due join; deleted when the `Previously` form was answered or closed by the player, when the popup is switched off or suppressed, and when the player opens `Previously` themselves. |
| `g.met_<id>` | the string `"1"` | The player talked to the Recurring Wanderer `<id>` (one of 8 ids in `stories/wanderers.js`). | `onTalk`, the first time `msg.npc` is `w_<id>`. |

Size: `"ls":1763190000000,` is 19 bytes, `la` 19, `"rc":9999,` 10, eight `"met_brannoch":"1",` at most 20 each:
under 210 bytes. `trimSave` never drops them.

Read rules (in `sagaOf`, `data.js`): `ls` and `la` are deleted when they are not a finite number greater
than 0; `rc` is deleted when it is not a whole number from 1 to 9999. A corrupt save keeps today's path
(copied to `saga:p_bak`, never overwritten with a guess).

No migration. An old save has none of the fields: "days away" then falls back to the newest of every
story's `st.t` and `st.fin` and every favor's `t` (`lastPlayed`), so an existing player gets a correct
figure on the first join after the update; with no time at all there is no recap. An older pack version
keeps the fields untouched (`sagaOf` keeps unknown fields). Rollback: revert the pack; the fields stay in
the save and are ignored. `/realm:saga_reset` clears them with the rest of `saga:p`.

**Settings.**

| Key | Scope | Type | Default | Label | Help |
|---|---|---|---|---|---|
| `recapDays` | world | int 0 to 60, step 1 | 7 | `Days away before the story recap` | `0 = never by itself. Players can always open Previously in /realm:saga` |
| `recapPopup` | player | bool | true | `Story recap when I come back` | `After a week or more away: what happened, and what's next` |

**Story fields the engine reads (all optional; workstream 04 writes the values).**

| Field | On | Type | Engine behavior | When absent |
|---|---|---|---|---|
| `opensAfter` | Story | `"<story id>/<chapter id>"` | The story's first chapter is offered only once that chapter is finished (L9). | No extra gate. |
| `weight` | Story | number | Offer order among side stories, lower first (L10). | 50. |
| `matters` | Story | string, a short tag such as `Matters on Lantern Night` | Sorts before other side stories; shown on the story card as `§6<matters>`. | Not shown, no sort bonus. |
| `recap` | Chapter, Story | string or `Page[]` | The chapter's (or one-chapter story's) recap text in `Previously`. | The generated sentence below. |

**The lead, as this spec sees it** (`lead.js`; the README's C1 payload without `player` and `v`):

```js
/**
 * @typedef {object} Lead
 * @property {"start" | "step" | "report" | "party" | "wait"} st
 * @property {"main" | "side" | "heart" | "wander" | "festival"} k
 * @property {string} s        story id
 * @property {string} title    story title
 * @property {string} [ch]     chapter title
 * @property {string} hint     one plain sentence, no color codes
 * @property {string} [why]
 * @property {string} [npc]    townsfolk id or w_<wid>
 * @property {string} [who]    the NPC's name as shown
 * @property {string} [place]
 * @property {string} [dim]
 * @property {number} [x]
 * @property {number} [z]
 * @property {number} [more]
 * @property {{ on: number, of: number, hold?: string, behind?: string[] }} [party]
 */
```

**Days and "ago".** `days = floor((now - then) / 86,400,000)`, never below 0. `agoText(days)`: `today` for
0, `yesterday` for 1, else `<days> days ago`.

**When the automatic recap is due** (`recapDue(saga, now, recapDays)`, returns the days or 0): 0 when
`recapDays` is 0 or less, or the player has no story progress (no story with `a` or a non-empty `dn`);
else `rc` when it is set; else the days since `ls` (or, without `ls`, since `lastPlayed(saga)`), when that
is `recapDays` or more, capped at 9999; else 0.

**The story in focus for `Previously`:** the story passed in; else the lead's story when it has a finished
chapter; else the story with a finished chapter whose newest of `st.t` and `st.fin` is highest (ties: the
earlier in `ORDERED`); else none.

**The generated recap of one finished chapter** (`chapterRecap`, `recap-text.js`), exact rules:

1. The chapter's required objectives (`!o.optional`) whose `when` matches the player's flags now, in file
   order. Each label: color codes removed, runs of whitespace made one space, trimmed, trailing `.` and `!`
   removed; longer than 70 characters: cut at the last space before character 67, trailing ` ,;:.(-`
   removed, `...` added (`cutWords`).
2. No such objective: `You finished this chapter.` One to three: `Done: <a>; <b>; <c>.` More than three:
   `Done: <a>; <b>; <c>; and <n> more steps.` (`1 more step` for one).
3. An authored `recap` replaces rules 1 and 2. A string is used as written; a `Page[]` is resolved with the
   player's flags (`pagesFor`) and its pages joined with a space.
4. The choices made in that chapter, in this order: the intro choice (`st.ch["<chapter>@"]`), each meet
   choice (`st.ch["<chapter>#<i>"]`, by objective index), the outro choice (`st.ch["<chapter>"]`). Labels
   cleaned as in rule 1 with a limit of 60; at most the first three. One: ` You chose: <a>.` Two or three:
   ` You chose: <a>; then <b>.` / ` You chose: <a>; <b>; then <c>.` None: nothing.
5. The whole text is cut to 400 characters with `cutWords`.
6. Only for the newest of the chapters shown, and only when it has no authored recap: a line
   `§7It ended: §f<excerpt>`, where the excerpt is the first outro page the player gets (`pagesFor`),
   line breaks made one space, color codes kept, cut after the last `.`, `!` or `?` that ends within 240
   visible characters (no such end: cut at the last space before 237 visible characters plus `...`), then
   `§r`.

Example (The Drowned Bell, "Iron and Sea-Glass", choice `ring`):
`Done: Bring Ida 24 iron ingots; Bring Ida 8 prismarine shards. You chose: Recast the bell.` (the two labels
are the chapter's own; the test uses fixtures, not this text).

### UI

Every screen is an `ActionFormData` (phones show about 6 buttons before scrolling). No `.header()`; a
section title is `.label("§l§6Title")`. Button lines are built by `labels.js` and cut to 168 px with
`fit`. Second lines are `§8` (dark gray) unless stated. `<where>` is `whereTo(player, at)`: `NE 140m`
(8-point compass and whole blocks, thousands with a comma), `here` within 6 blocks, `in the Nether` /
`in the End` / `in the Overworld` for another dimension, or empty when the spot is unknown. Light and dark
themes: not affected (game forms).

#### Your Story (`front.js`, `yourStory(player)`; command `/realm:saga`)

Title: `Your Story`. The page is redrawn after a sub-page returns; `Go` and `Close` end it.

Body, line by line (a line is left out when its condition fails; `""` is an empty line):

| # | Line | Condition |
|---|---|---|
| 1 | `§cStories are paused by an operator: nothing counts for now.§r` then `""` | `get("enabled") !== true` |
| 2a | `§7Main story: §afinished.` | `frontier(saga, player)` is undefined |
| 2b | `§7Main story: §fnot started yet.` | the frontier story is the first main story and has no accepted or finished chapter |
| 2c | `§7Main story: §f<story title> §7(not open yet)` then `§7To open it: <why, joined with ", ">.` | the frontier has a non-empty `why` |
| 2d | `§7Main story: §f<story title> §7(chapter <pos> of <total>)` | otherwise (`chapterNumber(saga, story, index)`) |
| 3 | `§cNeeds <packs, joined with " and "> to go on: that pack is not on this Realm.§r` | `packsNeeded(frontier story, saga)` is not empty |
| 4 | `§7You last played the story <days> days ago.` | `lastPlayed(saga)` is 2 days or more back |
| 5 | `§6Welcome back. Previously (below) has the story so far.` | `saga.rc` is set |
| 6 | `""` | always |
| 7 | `§7Your progress is safe. Everything still opens the story log.` | paused (then lines 8-14 are left out) |
| 8 | `§7You have not started a story yet.` | no story progress, and a lead exists |
| 9 | `§7Following: §f<lead.title> §7(<kind>)` | the lead's story is not the frontier story. `<kind>`: `main story`, `side story`, `heart story`, `wanderer`, `festival` |
| 10a | `§fNext: §e<lead.hint>§r` plus ` §7<where>` when where is not empty (`here` reads `§7(you are here)`) | lead with `st` other than `wait` |
| 10b | `§eWaiting: §f<lead.hint>` | lead with `st: "wait"` |
| 11 | `§7Why: <lead.why>` | `lead.why` |
| 12 | `§3Party: <on> of <of> online are on this chapter.` plus ` It waits for <hold>.` when `hold` | `lead.party` |
| 13 | `§7Your own chapter waits meanwhile. Play with my party has the rule.` | `lead.st === "party"` |
| 14a | `§aYou have finished the main story.` then `§7Something else lists what is still open.` | no lead, not paused, no frontier |
| 14b | `§7Nothing to point at right now. Something else lists what is open.` | no lead, not paused, a frontier exists |
| 15 | `""` then `§7Also going: <parts>.` | the player has accepted chapters other than the lead's story (party quests not counted). Parts, joined with `, `: `1 story` / `<n> stories`, `1 favor` / `<n> favors`, `1 stranger's job` |

Buttons, in this order (at most 6):

| Button | Second line | Shown | Does |
|---|---|---|---|
| `Go: <target>` | `<Where>. On your tracker now` | a lead with `st` other than `wait`, not paused, and a target name: `lead.who` when `lead.npc` is set, else `lead.place` | `goTo(player, lead, "keep")`, then the menu ends |
| `Got it` | `On your tracker now` | the same, but the lead has no target name | the same |
| `Previously` | `The story so far, to reread` | any story has a finished chapter (`canRecap(saga)`) | `previously(player)`; ends the menu when it returns true |
| `Something else` | `Other things to do now` | not paused | `somethingElse(player, { read })`; ends the menu when it returns true |
| `Play with my party` | `Where your party mates are` | `showsPartyButton(player)` | `partyPage(player)` |
| `Everything` | `Full log, codex, favors` | always | `showMenu(player, { available })` |
| `Close` | | always | ends the menu |

Second line of Go by `<where>`: empty: `On your tracker now`; `here`: `You are here. On your tracker`;
another dimension: `In the Nether. Now tracked` (the dimension's name); else `<where>. On your tracker now`.

The states the brief lists, as they come out of the table: **nothing started** (2b, 8, 10a, 11; Go,
Something else, Everything, Close); **between chapters** and **mid chapter** and **report ready** (2d, 4,
10a, 11, 15; all buttons that apply); **held by the party** (2d, 10a, 11, 12, 13); **blocked by a missing
pack** (2d, 3, then 10b and 11 when 02 sends a `wait` lead, else 14b; no Go button); **everything finished**
(2a, 14a); **stories paused** (1, 2, 7; Previously, Everything, Close).

Chat line of Go (`goChat`, the hint without a trailing `.` or `!`):

| `<where>` | Tracker on (`getFor(player, "tracker") === true`) | Tracker off |
|---|---|---|
| empty | `§b[Story] Next: <hint>. It is on your tracker.` | `§b[Story] Next: <hint>. Your tracker is off: /realm:prefs turns it on.` |
| `here` | `§b[Story] Next: <hint>, right here.` | the same |
| anything else | `§b[Story] Next: <hint>, <where>. Your tracker points the way.` | `§b[Story] Next: <hint>, <where>. Your tracker is off: /realm:prefs turns it on.` |

#### Previously (`recap.js`, `previously(player, opts)`)

Title: `Previously`. Opening it by hand deletes `saga.rc`.

Body:

```
§l§6<story title>§r
§7<done> of <total> chapters done[. You last played the story <ago>].      (a finished story: "§7Finished[. You last ...].")
§7<story summary, color codes removed, cut to 160 with cutWords>            (when the story has a summary)

§e<chapter title>§r                                                          (the last 3 finished chapters, oldest first)
§7<chapterRecap>
§e<chapter title>§r
§7<chapterRecap>
§e<chapter title>§r
§7<chapterRecap>
§7It ended: §f<excerpt>                                                      (rule 6 above)

<now line>
```

`[. You last played the story <ago>]` shows when `lastPlayed(saga)` is 1 day or more back (`yesterday`,
`<n> days ago`). `<done>` is the count of the story's chapters that are in `st.dn`; `<total>` is
`chapterNumber(...).total` of the current chapter, or `<done>` for a finished story. Chapter ids in `dn` that
no longer exist in the story are skipped. The now line: the lead is for this story:
`§fNow: §e<lead.hint>§r` plus ` §7<where>`; the story is finished: `§7This story is finished.`; else
`§7This story goes on: Something else in /realm:saga has it.`

Nothing finished anywhere: body `§7Nothing to look back on yet. Finish a chapter and it shows here.`, one
button `Back`.

Buttons:

| Button | Second line | Shown | Does |
|---|---|---|---|
| `Go: <target>` / `Got it` | as on Your Story | the lead is for this story, with `st` other than `wait`, not paused | `goTo(player, lead, "keep")`; returns true |
| `Read the last chapter again` | `Intro and ending, page by page` | always | `reread` of the newest finished chapter |
| `Older chapters` | `Pick any finished chapter` | the story has 2 or more finished chapters | the chapter list |
| `Other stories` | `Recaps of your other stories` | 2 or more stories have a finished chapter | the story list |
| `Back` (`Close` when the form opened by itself) | | always | returns false |

`reread(player, story, chapter)`: `dialog(player, story.title, "§7Chapter <n> of <total>: <title>§r",
pages, ["Done"])`, where `<n>` is the chapter's place among the player's finished chapters of that story
(1 = first finished, the number the chapter list shows) and `<total>` is the body's `<total>`. Do not use
`chapterNumber` for `<n>`: for a finished chapter it returns the count of finished chapters. Pages, with the
player's flags now: the intro pages, the first prefixed with
`§7How it began§r\n\n`; when an intro choice was made and it has a `reply`, its reply pages, the first
prefixed with `§7You chose: <label>§r\n\n`; the outro pages, the first prefixed with `§7How it ended§r\n\n`;
when an outro choice was made and it has a `reply`, its reply pages, the first prefixed with
`§7You chose: <label>§r\n\n`. After `Done` (or closing) the Previously page shows again.

Chapter list: title = the story's title; body `§7Pick a finished chapter to read it again.`; one button per
finished chapter, newest first: the chapter title, second line `Chapter <n>` (its place among the finished
ones, 1 = first finished); then `Back`. A pick runs `reread`, then the list shows again.

Story list: title `Previously`; body `§7Pick a story for its recap.`; one button per story with a finished
chapter, in `ORDERED` order with unfinished stories first: the story title, second line
`<done> of <total> chapters done` or `Finished`; then `Back`. A pick shows Previously for that story.

**By itself, after a return** (`joined(player)` on the first spawn):

1. No story progress: nothing, and nothing is written.
2. `days = recapDue(...)` when stories are enabled, else 0. Then `saga.ls = now`. When `days` is not 0:
   `saga.rc = days`, and `saga.tr` is deleted when it is set and is not the id of a main story (L7).
   `markDirty(player)`.
3. `days` is 0: done. Else, 200 ticks later (`announce`), if the player is still valid:
   - `skipAutoRecap(id, "all")` was called: delete `rc`, done.
   - Chat, each line only when it applies:
     `§6[Story] Welcome back. Last time (<ago>): "<newest finished chapter>", <story title>.`
     (no finished chapter in any story: `§6[Story] Welcome back. You were on "<accepted chapter>", <story
     title> (<ago>).` for the first accepted entry; `<ago>` from `lastPlayed`),
     `§e[Story] Next: <lead.hint>, <where>.` (no lead: left out; where empty: `§e[Story] Next: <hint>.`;
     `here`: `, right here.`),
     `§7[Story] /realm:saga has the story so far.`
   - `skipAutoRecap(id, "popup")` was called, or `getFor(player, "recapPopup") !== true`: delete `rc`,
     done.
   - Else `previously(player, { auto: true })`: the first form is shown with `showOnce(player, form, 600)`.
     While the answer is `UserBusy`, or the player is in `busy` (a dialogue or a vision), it is tried again
     40 ticks later, until 600 ticks have passed since the first try. Any answer (a button, or the player
     closing it) deletes `rc`. No answer in time, death, a dimension change or leaving: `rc` stays, so the
     next join tries again. The last button reads `Close`.

`skipAutoRecap(playerId, what = "popup")`: `what` is `"popup"` or `"all"`; anything else is read as
`"popup"`. It is remembered until that player's `announce` runs or they leave. Workstream 11 calls it when
`realm:card_shown` with `ctx: "login"` names `saga_bp`.

#### Something else (`picks.js`, `somethingElse(player, hooks)`)

Title: `Something else`.
Body with picks: `§7Up to three good things to do now. Your main story stays on your tracker unless you pick
another.` Body without picks: `§7Nothing else right now: your main story is the thing.`

Buttons: 0 to 3 picks, then `See everything (<n>)` / `Every story open to you` (n = the stories counted on
the All stories page under Going, Offered now, More in town and On the road), then `Back`.

| Slot | First line | Second line | Which |
|---|---|---|---|
| report | `Report: <name>` | `<Who> <where>` | a finished chapter waiting to be reported that is not the lead's story: main first, then `ORDERED` order, then favors, then a stranger's job |
| main | `Main: <short>` | `<Who or place> <where>`, or the step text when it has neither | only when there is no report pick: the frontier story, when the lead is another story and the frontier has no `why` |
| near | `Nearby: <short>` | the same | the lowest score among side, heart, festival and listable wanderer stories that are in progress, between chapters, or offered now. Score: blocks to its target in the player's dimension (unknown or another dimension: 5,000), minus 200 when not new, minus 500 for a festival chapter while its festival runs, minus 300 with `matters`. Ties: `matters`, lower `weight`, `ORDERED` order |
| quick | `Quick: <name>` | `<Who> <where>`, or `In progress` | first of: an accepted favor or stranger's job; today's favor of the nearest questgiver who still has one (favors on); a one-chapter festival story whose festival runs |

`<name>`: a story's `short`; a favor's label (`Quick:`) or `Favor for <Who>` (`Report:`); a stranger's job:
its chapter title. `<Who>` is `shortWho(name)`: the name up to the first ` the `, `, ` or ` of `, and when
that is still wider than 80 px, its first word (`Mara`, `Old Tobin`, `Anwen`, `Brannoch`). A pick never
repeats a story, and the lead's story is never a pick.

A pick opens its **story card**; an accepted favor opens the existing favor page (`choose(player,
"fvinfo:<npc>")`), an accepted stranger's job the existing job page (`choose(player, "wvinfo:x")`).

Story card. Title: the story's title. Body:

```
§7<Kind>[ §8[tone] [tone]]                         Kind: Main story, Side story, Heart story, Wanderer, Festival
§6<matters>                                         (when set)
§7Chapter <pos> of <total>: <chapter title>         (or "§7New story" with no progress; "§6Ready to report" when done)
§7<summary>                                         (no progress, and the story has a summary)

§fNext: §e<target text>§r §7<where>
```

Target text: `Report to <npc name>` (done), the current step's label (accepted), else `Talk to <npc name>`.
Buttons: `Go: <who or place>` / as on Your Story (or `Got it` / `On your tracker now` without a name): the
main-story card runs `goTo(player, target, "main")`, any other `goTo(player, target, "pin")`, then every menu
ends; `Open its page` / `Steps, hints and tracking` (an accepted chapter: `chapterInfo(player, story)`);
`Read it so far` / `Its finished chapters` (finished chapters, and `hooks.read` given: `hooks.read(story)`);
`Back`.

Favor card (a favor not accepted yet). Title: `Daily favor`. Body: `§7From <npc name>`, `§e<favor label>§r`,
`§7<the favor's objective label>`, `""`, `§fNext: §eTalk to <npc name>§r §7<where>`. Buttons: `Got it` /
`<Who> <where>`: chat `§b[Story] <npc name> has today's favor, <where>.` (where empty: `§b[Story] <npc name>
has today's favor.`; `here`: `, right here.`), nothing is tracked, every menu ends; `Back`.

**All stories** (`allStories(player, hooks)`; from `See everything` and from the Story Log's `Available`).
Title: `All stories`. Body: `§7Every story open to you. Tap one for where it goes next.`

| Section | Entries | Button |
|---|---|---|
| `.label("§l§6Going (<n>)")`; with none `.label("§7Nothing going yet.")` | stories with an accepted or finished chapter that are not finished (main first, `ORDERED` order), then accepted favors, then a stranger's job | story title (rule `titleLine`) / `Report to <Who>`, `Chapter <pos> of <total>`, `Next chapter: <Who>`, `Waiting for your party`, `Needs a pack`, `Favor, in progress`, `A stranger's job` |
| `.label("§l§6Offered now (<n>)")`; left out with none | startable stories with no progress that are offered now (L10), sorted main, `matters`, weight, file order | story title / `<Who> <where>` |
| button | `More in town (<n>)` / `Other stories you can start` | only when n is above 0: the startable side stories that are not offered now; opens a page titled `More in town`, body `§7These can start too. Nothing here is locked.`, one button each as under Offered now, then `Back` |
| button | `Locked for now (<n>)` / `What each one needs` | only when n is above 0; opens a text page titled `Locked for now`: per story `§e<title>§r` and `§7Needs: <why, joined with ", ">.`, button `Back` |
| button | `Back` | |

Listable wanderer chains that can start are part of Offered now (an `On the road` count is their number
inside it; no extra section). Locked = stories with no progress that fail `requires(storyRequires(story))`
and are listable: every side, heart, festival and wanderer one, plus the first locked main story. Every
story button opens its card; favors and jobs open their existing pages.

#### At a townsfolk (`ui.js`, `offersAt`)

- The offer that starts (`start:`) or reports (`end:`) the chapter of the lead's story
  (`leadOf(player)?.s`) gets `order: 1`: talking to this NPC is the next step. A `start:` offer's second
  line becomes `§2Your next step`; a report keeps `§8Done: report back`. Reminder (`info:`) and `wait:`
  offers are never promoted.
- A `start:` offer of a story with no progress that is a "More in town" story (L10) and is not the lead's
  story is not sent. When at least one was held back at this NPC, one more offer is sent:
  key `more:<npc id>`, label `More stories (<n>)` / `More new stories here`, order `CONFIG.offerOrder + 4`.
- Picking it opens a form: title = the NPC's name; body `§7<npc name> has more stories for you. Pick one to
  hear how it starts.`; one button per held-back story, `<Tag>: <title>` (rule `offerLine1`) / `New story`;
  `Back`. A pick runs `startChapter(player, story)`.
- First lines: `<Tag>: <story title>` when that fits 168 px, else `<Tag>: <story short>`
  (`Main story: The Cartographer's Last Map` is 206 px and becomes `Main story: Last Map`).

New-story chat after a report (`announceNew`): one story opened: `§e[Story] New story: <title>. Talk to
<npc name>.` (as today). Several: `§e[Story] <n> new stories opened. First: <title> (talk to <npc name>).
/realm:saga > Something else has the rest.` Wanderer chains are never announced.

#### Play with my party (`party-page.js`, `partyPage(player)`)

Title: `Party Story`. Body:

```
§fWhere everyone is in the main story:§r
§e<name>§r (you): <where in the story>
§e<name>§r: <where in the story>                    (one line per online party mate, by name)

§3The party's chapter now: <story title>, "<chapter title>".     (partyViews has an entry for the player)
§7Nobody else from your party is online: your own story counts.  (no mate online)

§7Today the party plays one main chapter at a time: the next one of whoever online is furthest behind.
§7Mates on it share all progress; mates ahead help, and their own chapter waits until the party catches up.
```

`<where in the story>` from `frontier(sagaOf(p), p)`: undefined: `finished the main story`; with `why`:
`<story title> (not open yet)`; else `<story title>, "<chapter title>"`. One button: `Back`.
`showsPartyButton(player)`: `get("enabled") === true && get("partyStory") === true && !!partyTag(player)`.

#### The Story Log (`ui.js`, `showMenu`), what changes

Pages and their order are unchanged. Changes: the last button reads `Back`; `Available (<n>)` opens All
stories when the caller passes the hook; unmet wanderer chains are in neither count nor list; the button
lines listed in T7 are shortened to fit.

#### Measured widths (font pixels; the table of `tools/text-shared.js`, D19, with 5 for `(` and `)`)

| Line | Width |
|---|---|
| `Go: Anwen, the Surveyor's Ghost` (longest NPC name) | 162 |
| `NE 12,240m. On your tracker now` | 165 |
| `You are here. On your tracker` | 157 |
| `In the Overworld. Now tracked` | 152 |
| `Intro and ending, page by page` | 158 |
| `Recaps of your other stories` | 151 |
| `Where your party mates are` | 144 |
| `The story so far, to reread` | 143 |
| `Brother Hollis in the Overworld` (widest `<Who> <where>` after `shortWho`) | 157 |
| `Quick: Favor for Brother Hollis` | 156 |
| `Report: Present for Clover` (longest `short`, 98 px) | 138 |
| `Not tracked. Chapter 12 of 14` | 152 |
| `Back on the tracker, party too` | 156 |
| `Heart story: The Locked Drawer` (widest tag plus short) | 163 |
| `Next step, recap, other picks` (admin hint) | 147 |

Lines that can exceed 168 px and are cut by `fit`: `Go: <place>` with a place name over about 24
characters; `Quick: <favor label>` (`Quick: Quills for the Cartographer` is 172); `<chapter title>` lines
with a prefix (`Chapter 12: Graveyard Shift, Beach Edition` is 215); distances of 100,000 blocks and more.

### Security

- No operator feature is added. The Story Log's operator buttons keep their checks (permission level on
  open and on every press). The two new debug actions run only behind the existing check in `main.js`
  (`sourceEntity` is not a player, or its `commandPermissionLevel >= GameDirectors`).
- Input from other packs: `realm:npc_choose` key `more:<npc>` only selects which NPC's list to show; the
  list is computed again from the player's own save, and `startChapter` checks every requirement again.
  `realm:npc_talk` writes `g.met_<id>` only when `w_<id>` is one of the 8 Recurring Wanderers
  (`wandererOf`), so at most 8 keys. `skipAutoRecap` accepts two values.
- Saved data: the new fields are validated on read and bounded (Data). A corrupt `saga:p` is never
  overwritten by this code: `joined` and `left` write only through `sagaOf` and `markDirty`, and only for a
  player with story progress.
- No secrets, no network, nothing public or tailnet-only.

### Performance

- Nothing is added to the per-second player loop or to any per-tick path.
- On a join: one `recapDue` (a pass over the player's saved stories) and at most one timeout.
- On a menu open: one `nextStep`, one pass over the 59 stories (`requires`), 12 favors.
- On a townsfolk talk: one `nextStep` and one pass over the stories with no progress (at most 59 `requires`
  calls; a tap is limited by Townsfolk's own cooldown). Expected under 0.2 ms per talk; measured once, see
  Open questions. `saga_bp` stays inside its 0.15 ms a tick budget because no tick cost changes; the PR's
  `perf` job (`pr-tests.yml`) is the check.
- Form bodies: `Previously` is at most 2,200 characters (unit-tested over every story); the saved fields
  add under 210 bytes to a 30,000-byte bound.

### Ops

Not affected: no env vars, ports, hosting or runner changes, no scheduled jobs.

## Tasks

Checkout for every task: `nishant/mc-packs` at `/home/user/mc-packs` in a cloud session, or the session's
worktree for this task. Acceptance commands run from the repo root. `npm run check` as a whole fails until T9
(docs coverage, versions, catalogs): tasks T1 to T8 run the narrower commands listed.

### T1 Gating and picks core

- Repo / checkout: mc-packs (see above)
- Owns: `packs/saga_bp/scripts/picks-core.js` (new), `packs/saga_bp/scripts/types.js`,
  `docs/STORY_BIBLE.md`, `tools/saga-picks.test.mjs` (new)
- Reads (does not edit): `packs/saga_bp/scripts/data.js` (`requires`, `ORDERED`),
  `tools/saga-champions-session.test.mjs` (how a pure module is tested)
- Depends on: none
- Change:
  1. `types.js`, typedef `Story`: add
     `@property {string} [opensAfter] "story/chapter": the first chapter is offered only once that chapter is finished`,
     `@property {number} [weight] offer order among side stories, lower first (default 50)`,
     `@property {string} [matters] a short tag for stories that change the finale, shown on the story's card; they sort first`,
     `@property {string | Page[]} [recap] a one-chapter story's recap for Previously`.
     Typedef `Chapter`: add `@property {string | Page[]} [recap] what happened, for Previously (2 to 3 short sentences)`.
  2. `docs/STORY_BIBLE.md`, section 9, under the `### Story` code block add this paragraph:
     "Optional, read by the engine since the Your Story update: `opensAfter: "act1_signs/graves"` (the story
     is offered only once that chapter is finished; a story a player already started stays open), `weight`
     (a number; of the side stories a player can start, the two with the lowest weight are "Offered now",
     default 50), `matters` (a short tag such as "Matters on Lantern Night"; such stories sort first),
     `recap` (a string or pages: the recap of a one-chapter story)." Under the `### Chapter` code block add:
     "Optional: `recap` (a string or pages), what happened in this chapter in 2 to 3 short sentences, shown
     by Previously instead of the generated sentence."
  3. `picks-core.js`: no imports. Exports, exactly:

     ```js
     export const DEFAULT_WEIGHT = 50;
     export const MAX_PICKS = 3;
     export const OFFERED_SIDE = 2;
     export const UNKNOWN_DIST = 5000;

     /** A chapter accepted or finished? @param {{ a?: number, dn?: string[] } | undefined} st */
     export const started = (st) => !!st && (!!st.a || (Array.isArray(st.dn) && st.dn.length > 0));

     /** @param {Story} s */
     export const weightOf = (s) => (typeof s.weight === "number" && Number.isFinite(s.weight) ? s.weight : DEFAULT_WEIGHT);

     /** @type {WeakMap<Story, Requires>} */
     const merged = new WeakMap();
     /** A story's `requires` plus the chapter named by `opensAfter`. Without a valid `opensAfter`: `story.requires` itself. */
     export function storyRequires(story) {
       const after = story.opensAfter;
       if (typeof after !== "string" || after.split("/").length !== 2) return story.requires;
       let req = merged.get(story);
       if (!req) {
         req = { ...(story.requires ?? {}), chapters: [...(story.requires?.chapters ?? []), after] };
         merged.set(story, req);
       }
       return req;
     }

     /** Offer order: main stories, then stories with `matters`, then lower weight, then the order given. */
     export function sortOffers(stories) {
       const rank = (/** @type {Story} */ s) => (s.kind === "main" ? 0 : s.matters ? 1 : 2);
       return stories.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || weightOf(a.s) - weightOf(b.s) || a.i - b.i).map((x) => x.s);
     }

     /** Of the stories a player can start: `now` (every main, heart, festival, wander story and the first OFFERED_SIDE side stories) and `later` (the other side stories), both in offer order. */
     export function offeredNow(fresh) {
       /** @type {Story[]} */ const now = [];
       /** @type {Story[]} */ const later = [];
       let side = 0;
       for (const s of sortOffers(fresh)) ((s.kind ?? "side") !== "side" || side++ < OFFERED_SIDE ? now : later).push(s);
       return { now, later };
     }

     /** A Recurring Wanderer's chain is listed only once met, started, or its camp stands. @param {(wid: string) => boolean} hasCamp */
     export function listable(story, saga, hasCamp) {
       if (story.kind !== "wander" || !story.giver.startsWith("w_")) return true;
       const wid = story.giver.slice(2);
       return saga.g?.[`met_${wid}`] === "1" || started(saga.s?.[story.id]) || hasCamp(wid);
     }
     ```

     plus the candidate type, `scoreOf` and `choosePicks`:

     ```js
     /**
      * @typedef {object} Cand
      * @property {string} id       story id; "fv:<npc>" a favor; "wv" a stranger's job
      * @property {"main" | "side" | "heart" | "wander" | "festival" | "favor" | "job"} kind
      * @property {"report" | "going" | "between" | "new"} state
      * @property {number} [dist]   blocks to its target in the player's dimension; undefined: unknown or another dimension
      * @property {number} order    place in ORDERED (favors: place of the NPC among the questgivers; a job: 0)
      * @property {number} [weight]
      * @property {boolean} [matters]
      * @property {boolean} [lead]         it is the lead's story
      * @property {boolean} [festivalOn]   a festival chapter whose festival runs now
      * @property {boolean} [single]       the story has exactly one chapter
      */
     /** @typedef {{ slot: "report" | "main" | "near" | "quick", cand: Cand }} Pick */

     /** @param {Cand} c */
     export const scoreOf = (c) => (c.dist ?? UNKNOWN_DIST) - (c.state === "new" ? 0 : 200) - (c.festivalOn ? 500 : 0) - (c.matters ? 300 : 0);

     /** @param {Cand[]} cands @param {string | undefined} mainId the frontier story, when it can be played @returns {Pick[]} */
     export function choosePicks(cands, mainId) {
       /** @type {Pick[]} */ const out = [];
       const used = new Set();
       const take = (/** @type {Pick["slot"]} */ slot, /** @type {Cand | undefined} */ c) => {
         if (!c || used.has(c.id) || out.length >= MAX_PICKS) return;
         used.add(c.id);
         out.push({ slot, cand: c });
       };
       const free = cands.filter((c) => !c.lead);
       const mainFirst = (/** @type {Cand} */ a, /** @type {Cand} */ b) => (a.kind === "main" ? 0 : 1) - (b.kind === "main" ? 0 : 1) || (a.kind === "favor" || a.kind === "job" ? 1 : 0) - (b.kind === "favor" || b.kind === "job" ? 1 : 0) || a.order - b.order;
       const report = free.filter((c) => c.state === "report").sort(mainFirst)[0];
       if (report) take("report", report);
       else take("main", mainId ? free.find((c) => c.id === mainId) : undefined);
       const story = (/** @type {Cand} */ c) => c.kind === "side" || c.kind === "heart" || c.kind === "festival" || c.kind === "wander";
       take("near", free.filter((c) => !used.has(c.id) && story(c)).sort((a, b) => scoreOf(a) - scoreOf(b) || (b.matters ? 1 : 0) - (a.matters ? 1 : 0) || (a.weight ?? DEFAULT_WEIGHT) - (b.weight ?? DEFAULT_WEIGHT) || a.order - b.order)[0]);
       const rest = free.filter((c) => !used.has(c.id));
       const far = (/** @type {Cand} */ c) => c.dist ?? UNKNOWN_DIST;
       take(
         "quick",
         rest.filter((c) => (c.kind === "favor" || c.kind === "job") && c.state !== "new").sort((a, b) => a.order - b.order)[0] ??
           rest.filter((c) => c.kind === "favor" && c.state === "new").sort((a, b) => far(a) - far(b) || a.order - b.order)[0] ??
           rest.filter((c) => c.kind === "festival" && !!c.single && !!c.festivalOn && c.state === "new").sort((a, b) => scoreOf(a) - scoreOf(b) || a.order - b.order)[0],
       );
       return out;
     }
     ```

     Add the two typedef imports at the top (`Story`, `Requires` from `./types.js`) and a first-line comment
     saying the file imports nothing so unit tests run it in node.
  4. `tools/saga-picks.test.mjs` (`node:test`, importing `../packs/saga_bp/scripts/picks-core.js`), with
     fixture stories `{ id, kind, giver, weight?, matters?, opensAfter?, requires? }`. Tests, by name:
     - "storyRequires returns the story's own requires without opensAfter" (same object; `undefined` stays
       `undefined`; `opensAfter: "bad"` and `"a/b/c"` are ignored)
     - "storyRequires adds the chapter and never changes the story" (`requires.chapters` of the story is
       untouched; the result has the old chapters plus the new one; two calls return the same object)
     - "sortOffers: main, then matters, then weight, then the order given"
     - "offeredNow keeps two side stories and every other kind" (5 side, 1 main, 1 heart, 1 festival, 1
       wander in: `now` has 6, `later` has 3; with weights 10 and 20 on the last two side stories, those two
       are in `now`; a `matters` side story is in `now` before a weight 1 story)
     - "listable: an unmet wanderer chain is hidden; met, started or camped shows it; other kinds always show"
     - "scoreOf" (unknown distance 5000; going -200; festival running -500; matters -300)
     - "choosePicks never returns more than 3, never the lead's story, never one story twice" (20 random
       candidate sets from a fixed seed)
     - "choosePicks: a report beats the main pick; the main pick needs a lead elsewhere" (main pick absent
       when the main candidate has `lead: true` or `mainId` is undefined)
     - "choosePicks: nearest story by score, ties by matters, weight, order"
     - "choosePicks: quick prefers an accepted favor, then the nearest new favor, then a running one-chapter festival"
     - "choosePicks: no candidates, no picks"
- Edge cases: `opensAfter` naming a chapter that does not exist: `requires` reports it as not finished and
  the story stays locked (04's `check-stories` rule catches it; nothing to do here). `weight` that is not a
  finite number counts as 50. `saga.s` or `saga.g` missing in `listable`: no throw.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing; `node --test tools/saga-picks.test.mjs` passes;
  `node --test tools/story-content.test.mjs tools/check-stories.test.mjs` still passes;
  `node tools/check-stories.mjs | tail -2` still passes.

### T2 Saved fields, settings and the recap text

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/recap-text.js` (new), `packs/saga_bp/scripts/data.js`,
  `packs/saga_bp/scripts/settings.js`, `packs/saga_bp/scripts/config.js`, `tools/saga-recap.test.mjs` (new),
  `tools/saga-save-bound.test.mjs`
- Reads (does not edit): `packs/saga_bp/scripts/stories.js`, `packs/saga_bp/scripts/stories/index.js`
  (pure data, importable in node), `packs/saga_bp/scripts/ui.js` (`choicesMade`, for the key shapes)
- Depends on: none
- Change:
  1. `data.js`, typedef `Saga`: add
     `@property {number} [ls] when the player was last on the realm (ms)`,
     `@property {number} [la] when the player last accepted or reported a chapter or favor (ms)`,
     `@property {number} [rc] days away of a return whose recap is still owed (1-9999)`.
  2. `data.js`, `sagaOf`, after the line that validates `saga.wv`:

     ```js
     for (const k of /** @type {const} */ (["ls", "la"])) if (saga[k] !== undefined && !(typeof saga[k] === "number" && Number.isFinite(saga[k]) && saga[k] > 0)) delete saga[k];
     if (saga.rc !== undefined && !(Number.isInteger(saga.rc) && saga.rc >= 1 && saga.rc <= 9999)) delete saga.rc;
     ```
  3. `data.js`: add `/** The player accepted or reported something now. @param {Saga} saga */ export function touch(saga) { saga.la = Date.now(); }`
     next to `markDirty`.
  4. `config.js`: add after `campDays`:
     `/** Real days away after which a returning player gets the story recap by itself. 0 = never; Previously in /realm:saga always works. */ recapDays: 7,`
  5. `settings.js`, `OPTIONS` (above the "Shared" marker): after the `campDays` row add
     `{ key: "recapDays", type: "int", scope: "world", label: "Days away before the story recap", help: "0 = never by itself. Players can always open Previously in /realm:saga", min: 0, max: 60, step: 1 },`
     and after the `spotGuides` row add
     `{ key: "recapPopup", type: "bool", scope: "player", lock: [["enabled", false]], default: true, label: "Story recap when I come back", help: "After a week or more away: what happened, and what's next" },`
  6. `recap-text.js`: no imports. Exports, exactly these names and behaviors (Design, Data has the rules):

     ```js
     export const DAY = 86400000;
     export const daysBetween = (now, then) => Math.max(0, Math.floor((now - then) / DAY));
     export const agoText = (days) => (days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`);
     /** The newest time in a save: `la`, else the newest st.t / st.fin / favor t. Undefined with none. */
     export function lastPlayed(saga) {
       if (typeof saga.la === "number") return saga.la;
       let t = 0;
       for (const st of Object.values(saga.s ?? {})) t = Math.max(t, Number(st?.t) || 0, Number(st?.fin) || 0);
       for (const fs of Object.values(saga.fv ?? {})) t = Math.max(t, Number(fs?.t) || 0);
       return t > 0 ? t : undefined;
     }
     export const hasProgress = (saga) => Object.values(saga.s ?? {}).some((st) => !!st && (!!st.a || (st.dn?.length ?? 0) > 0));
     export function recapDue(saga, now, recapDays) {
       if (!(recapDays > 0) || !hasProgress(saga)) return 0;
       if (Number.isInteger(saga.rc) && saga.rc >= 1) return Math.min(9999, saga.rc);
       const seen = typeof saga.ls === "number" ? saga.ls : lastPlayed(saga);
       if (seen === undefined) return 0;
       const days = daysBetween(now, seen);
       return days >= recapDays ? Math.min(9999, days) : 0;
     }
     const plain = (/** @type {string} */ s) => s.replace(/§./g, "");
     /** Cut at a word to at most `max` characters, ending in "...". */
     export function cutWords(s, max) {
       if (s.length <= max) return s;
       const cut = s.slice(0, max - 3);
       const at = cut.lastIndexOf(" ");
       return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.(-]+$/, "")}...`;
     }
     export const cleanLabel = (s, max) => cutWords(plain(s).replace(/\s+/g, " ").trim().replace(/[.!]+$/, ""), max);
     export function fallbackRecap(labels) {
       const all = labels.map((l) => cleanLabel(l, 70)).filter(Boolean);
       if (!all.length) return "You finished this chapter.";
       const more = all.length - 3;
       return `Done: ${all.slice(0, 3).join("; ")}${more > 0 ? `; and ${more} more ${more === 1 ? "step" : "steps"}` : ""}.`;
     }
     export function choicesLine(labels) {
       const c = labels.slice(0, 3).map((x) => cleanLabel(x, 60));
       if (!c.length) return "";
       return c.length === 1 ? `You chose: ${c[0]}.` : `You chose: ${c.slice(0, -1).join("; ")}; then ${c[c.length - 1]}.`;
     }
     ```

     and, written by this task to the rules in Design:
     - `choicesOf(chapter, st)`: the labels of the choices made in a chapter, in the order intro
       (`st.ch[chapter.id + "@"]` in `chapter.introChoices`), meets (`st.ch[chapter.id + "#" + i]` in
       `chapter.objectives[i].choices`, ascending `i`), outro (`st.ch[chapter.id]` in `chapter.choices`).
       A choice id that no longer exists is skipped.
     - `madeChoice(list, id)`: the `Choice` with that id in `list`, or undefined (used by `reread`).
     - `lastChapters(story, st, n = 3)`: the chapters of `story.chapters` whose id is in `st.dn`, ordered by
       their position in `st.dn`, the last `n` (oldest first).
     - `authored(owner, resolve)`: `owner.recap` as text: a non-empty string as is; an array through
       `resolve(pages)` (the caller passes `(p) => pagesFor(p, saga, story.id, player.name)`) joined with a
       space; else undefined. For a story with exactly one chapter, the caller tries the chapter, then the
       story.
     - `chapterRecap({ recap, labels, choices })`: `cutWords([recap ?? fallbackRecap(labels), choicesLine(choices)].filter(Boolean).join(" "), 400)`.
     - `outroExcerpt(page, max = 240)`: rule 6 (count visible characters, skip a `§` and the character after
       it; a sentence ends at `.`, `!` or `?` followed by the end of the text, a space, `"`, `'` or `§`).
     - `focusStory(stories, saga, leadId)`: the rule "the story in focus" (stories in `ORDERED` order).
     - `recapBody(v)`:

       ```js
       /** @param {{ title: string, done: number, total: number, finished: boolean, summary?: string, played?: string, blocks: { title: string, text: string }[], ended?: string, now: string }} v */
       export function recapBody(v) {
         const lines = [`§l§6${v.title}§r`, `§7${v.finished ? "Finished" : `${v.done} of ${v.total} chapters done`}${v.played ? `. You last played the story ${v.played}` : ""}.`];
         if (v.summary) lines.push(`§7${cutWords(plain(v.summary), 160)}`);
         for (const b of v.blocks) lines.push("", `§e${b.title}§r`, `§7${b.text}`);
         if (v.ended) lines.push(`§7It ended: §f${v.ended}`);
         lines.push("", v.now);
         return lines.join("\n");
       }
       ```
  7. `tools/saga-recap.test.mjs` (imports `recap-text.js`, and `STORIES` from `stories.js`). Tests, by name:
     - "agoText and daysBetween" (0 today, 1 yesterday, 23 "23 days ago"; a time in the future is 0 days)
     - "lastPlayed: la first, else the newest accept, finish or favor time, else undefined"
     - "recapDue" (table: no progress 0; `recapDays` 0 gives 0 even with `rc`; `rc` 12 gives 12; `ls` 8
       days back with 7 gives 8; 6 days back gives 0; no `ls` falls back to `st.fin`; no time at all 0;
       40,000 days gives 9999)
     - "fallbackRecap wording" (0 labels `You finished this chapter.`; 2 labels
       `Done: Defeat 12 drowned; Ask Reyes what she saw.`; 5 labels end `; and 2 more steps.`; 4 labels
       `; and 1 more step.`; a 90-character label is cut to at most 70 and ends `...`; color codes and a
       trailing `.` are removed)
     - "choicesLine wording" (none `""`; one; two `You chose: A; then B.`; four keeps three)
     - "chapterRecap: an authored recap replaces the step sentence and keeps the choices; never over 400"
     - "outroExcerpt cuts at a sentence end and keeps color codes" (a 500-character page gives at most 240
       visible characters and ends with `.§r`, `!§r` or `?§r`; a page with no sentence end ends `...§r`; a
       short page is returned whole)
     - "lastChapters follows the order in dn and skips ids the story no longer has"
     - "choicesOf: intro, meets by index, outro; unknown ids skipped"
     - "focusStory: the lead's story when it has a finished chapter, else the newest, else undefined"
     - "every chapter of every story: the generated recap is one line of at most 400 characters" (real
       `STORIES`, all required labels, every choice of the chapter taken as made)
     - "the Previously body stays under 2,200 characters for every story" (real `STORIES`: for each story,
       `recapBody` with its 3 chapters whose `chapterRecap` is longest, the longest first outro page through
       `outroExcerpt`, a 160-character now line)
  8. `tools/saga-save-bound.test.mjs`: in `maxed()` add `ls: 1763190000000, la: 1763190000000, rc: 9999`
     and `met_brannoch: "1"` inside `g`; in the test "trimming drops only ut, finished favors and codex
     order" add `assert.equal(out.ls, before.ls); assert.equal(out.la, before.la); assert.equal(out.rc, before.rc);`.
- Edge cases: a save whose `ls` is a string or negative: deleted on read, then treated as absent. `rc` 0 or
  1.5: deleted. `saga.s` with a non-object story state: `lastPlayed` and `hasProgress` skip it. A label that
  is only color codes: dropped from the sentence. An outro page that is `{ text, when }`: the caller
  resolves pages first, `outroExcerpt` only ever gets a string.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing;
  `node --test tools/saga-recap.test.mjs tools/saga-save-bound.test.mjs tools/saga-save-safety.test.mjs` passes;
  `node tools/sync-settings.mjs --check` passes; `node tools/check-ascii.mjs | tail -2` passes.

### T3 The lead adapter and the labels

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/lead.js` (new), `packs/saga_bp/scripts/labels.js` (new),
  `tools/saga-menu-width.test.mjs` (new)
- Reads (does not edit): `packs/saga_bp/scripts/guide.js` (02), `packs/saga_bp/scripts/text.js` (01),
  `packs/saga_bp/scripts/util.js`, `packs/saga_bp/scripts/places.js`, `packs/saga_bp/scripts/wander.js`,
  `packs/saga_bp/scripts/objectives.js` (`progressed`)
- Depends on: none (needs 01 and 02 released: stop and report when
  `grep -n "export function nextStep" packs/saga_bp/scripts/guide.js` or
  `grep -n "export function fit" packs/saga_bp/scripts/text.js` finds nothing)
- Change:
  1. `lead.js`. Imports: `nextStep` (and the NPC home map) from `./guide.js`; `markDirty`, `sagaOf` from
     `./data.js`; `progressed` from `./objectives.js`; `campName`, `placesOf` from `./places.js`; `getFor`
     from `./settings.js`; `across`, `compass`, `dimName`, `npcName`, `num`, `plain` from `./util.js`;
     `wandererOf` from `./wander.js`; `goChat` from `./labels.js`. Exports:
     - the `Lead` typedef (Design, Data).
     - `leadOf(player)`: `const raw = nextStep(player)`. Returns `undefined` when `raw` is null or
       undefined. When `typeof raw.st === "string"`: `raw` (a C1 object; `player` and `v`, if present, are
       ignored by every caller). When `raw` has no `st` but `typeof raw.kind === "string"` (the research's
       shape), map it: `kind` `"off"` or `"done"`: undefined; `"blocked"`: `st: "wait"`; `"report"`:
       `"report"`; `"step"`: `"party"` when `raw.from === "party"`, else `"step"`; `"lead"` or `"start"`:
       `"start"`; `k: raw.story?.kind ?? "side"`, `s: raw.story?.id`, `title: raw.story?.title`,
       `ch: raw.chapter?.title`, `hint: plain(raw.label ?? "")`, `why: raw.why`,
       `npc: raw.npc ?? raw.at?.npc`, `who: npc ? npcName(npc) : undefined`,
       `place: npc ? undefined : raw.at?.label`, `dim`, `x`, `z` from `raw.at`, `more: 0`; without a story
       id: undefined. Any other shape: undefined, and one `console.warn("[saga] lead.js: nextStep returned
       a shape this pack does not know")` per session. Look at `guide.js` first: when it returns the C1
       shape, keep only that branch and the null check.
     - `homeOf(npc)`: `{ dim, x, z } | undefined`. First the townsfolk post 02 keeps from
       `realm:npc_places` (`grep -n "npc_places" packs/saga_bp/scripts/*.js` shows the `Map` or the lookup
       function and its name; import that). Else, for a Recurring Wanderer (`wandererOf(npc)`), the camp
       `placesOf()[campName(w.id)]` as `{ dim, x, z }`. Else undefined.
     - `whereTo(player, at)`: `at` is `{ dim?: string, x?: number, z?: number } | undefined`. Empty string
       without a `dim` or a finite `x` and `z`; `in the ${dimName(at.dim)}` when
       `player.dimension.id !== at.dim`; `here` when `across(player.location, at) <= 6`; else
       `${compass(at.x - p.x, at.z - p.z)} ${num(d)}m`.
     - `goTo(player, to, how)`:

       ```js
       /**
        * Go: the tracker follows this step and chat says where. The caller closes its menus.
        * @param {Player} player @param {{ s: string, hint: string, dim?: string, x?: number, z?: number }} to
        * @param {"keep" | "pin" | "main"} how keep: the lead, nothing to pin; pin: track this story; main: drop the pin
        */
       export function goTo(player, to, how) {
         const saga = sagaOf(player);
         if (how === "pin") saga.tr = to.s;
         else if (how === "main") delete saga.tr;
         if (saga.ut?.includes(to.s)) {
           saga.ut = saga.ut.filter((x) => x !== to.s);
           if (!saga.ut.length) delete saga.ut;
         }
         markDirty(player);
         progressed.add(player.id); // the tracker redraws on the next run of the player loop
         player.sendMessage(goChat(to.hint, whereTo(player, to), getFor(player, "tracker") === true));
         player.playSound("random.orb", { pitch: 1, volume: 0.5 });
       }
       ```
  2. `labels.js`. Imports only `fit` and `widthOf` from `./text.js`. Exports:

     ```js
     export const LINE = 168;
     export const KIND = /** @type {Record<string, string>} */ ({ main: "Main story", side: "Side story", heart: "Heart story", wander: "Wanderer", festival: "Festival" });
     export const NEXT_STEP = "§2Your next step";
     /** "Mara" from "Mara the Cartographer"; the first word when that is still wide. @param {string} name */
     export function shortWho(name) {
       const a = name.split(/ the |, | of /)[0];
       return widthOf(a) > 80 ? a.split(" ")[0] : a;
     }
     /** One or two button lines, each cut to LINE; the second dark gray unless it starts with a color code. */
     export function button(line1, line2) {
       const a = fit(line1, LINE);
       if (!line2) return a;
       const b = fit(line2, LINE);
       return `${a}\n${b.startsWith("§") ? b : `§8${b}`}`;
     }
     const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
     /** The second line of Go. @param {string} where from whereTo */
     export function goLine2(where) {
       if (!where) return "On your tracker now";
       if (where === "here") return "You are here. On your tracker";
       if (where.startsWith("in the ")) return `${cap(where)}. Now tracked`;
       return `${where}. On your tracker now`;
     }
     /** "Go: <target>" or "Got it", with its second line. @param {string | undefined} target */
     export const goButton = (target, where) => button(target ? `Go: ${target}` : "Got it", goLine2(where));
     /** "<Who> NE 140m", "<Who>, right here", "<Who>" or, with no name, the text. */
     export function whoWhere(name, where, text = "") {
       if (!name) return text;
       return !where ? name : where === "here" ? `${name}, right here` : `${name} ${where}`;
     }
     /** "<Tag>: <title>", or with the short name when the title does not fit. @param {{ title: string, short: string }} story */
     export const offerLine1 = (tag, story) => (widthOf(`${tag}: ${story.title}`) <= LINE ? `${tag}: ${story.title}` : `${tag}: ${story.short}`);
     /** A story's title for a button: bold when asked and it fits, then plain, then the short name. */
     export function titleLine(prefix, story, bold) {
       const full = `${prefix}${story.title}`;
       if (bold && widthOf(`§l${full}§r`) <= LINE) return `§l${full}§r`;
       return widthOf(full) <= LINE ? full : `${prefix}${story.short}`;
     }
     export const moreButton = (/** @type {number} */ n) => button(`More stories (${n})`, "More new stories here");
     /** The chat line of Go (Design, UI: the table). */
     export function goChat(hint, where, trackerOn) {
       const h = hint.replace(/[.!]+$/, "");
       if (where === "here") return `§b[Story] Next: ${h}, right here.`;
       const off = " Your tracker is off: /realm:prefs turns it on.";
       if (!where) return `§b[Story] Next: ${h}.${trackerOn ? " It is on your tracker." : off}`;
       return `§b[Story] Next: ${h}, ${where}.${trackerOn ? " Your tracker points the way." : off}`;
     }
     ```
  3. `tools/saga-menu-width.test.mjs`: imports `labels.js`, `widthOf` from `text.js`, `STORIES`,
     `NPC_NAMES` from `stories.js`, `FAVORS`, `WANDERERS` from `stories/index.js`. A helper
     `lines(label)` splits a button at `\n`. Tests, by name:
     - "every static line fits" (each first and second line named in this spec's UI tables that has no
       variable part, listed as an array in the test; each `widthOf` at most 168)
     - "Go fits for every NPC and wanderer name and every distance" (targets: every `NPC_NAMES` value and
       every wanderer name; where: `""`, `here`, `in the Nether`, `in the End`, `in the Overworld`, and each
       of the 8 compass points with 5m, 99m, 1,240m, 99,999m)
     - "who and where fits after shortWho" (the same names through `shortWho`, the same where list, built
       with `button("Nearby: x", whoWhere(...))`)
     - "pick first lines fit for every story short and favor label" (`Report: `, `Main: `, `Nearby: `,
       `Quick: ` plus each `short`; `Quick: ` plus each favor label and `Report: Favor for <shortWho>` for
       each questgiver, through `button`)
     - "offerLine1 fits for every story and tag" (tags `Main story`, `Story`, `Heart story`, `Wanderer`,
       `Festival`; each story with its own kind's tag; no `...` in the result)
     - "titleLine fits, with and without Party: , bold or not" (every story)
     - "shortWho" (`Mara the Cartographer` gives `Mara`; `Old Tobin` stays; `Anwen, the Surveyor's Ghost`
       gives `Anwen`; `Marigold of the Heights` gives `Marigold`; `Brannoch Deepdelve` gives `Brannoch`;
       `the stranger` stays)
     - "goChat" (the six cells of the table, exact strings; a hint ending in `.` loses it)
     - "button cuts a long line to 168 and keeps a color code on the second line"
- Edge cases: `nextStep` throws: `leadOf` lets it throw (the callers' `withPlayer` and loop catch and
  log; hiding it would hide a 02 bug). A lead with `x` but no `dim`: `whereTo` returns the empty string. A
  wanderer with no camp and not loaded: `homeOf` undefined. `goTo` for a story id that is not in `ut`: `ut`
  untouched.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing; `node --test tools/saga-menu-width.test.mjs`
  passes; `node tools/check-ascii.mjs | tail -2` passes.

### T4 Previously

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/recap.js` (new)
- Reads (does not edit): `recap-text.js` (T2), `lead.js`, `labels.js` (T3), `data.js`, `util.js`,
  `settings.js`, `ui.js` (`choicesMade`, `finishedPage` for the label pattern)
- Depends on: T2, T3
- Change: `recap.js` imports `system` from `@minecraft/server`; `ActionFormData`, `FormCancelationReason`
  from `@minecraft/server-ui`; `ORDERED`, `chapterNumber`, `currentChapter`, `entries`, `finished`,
  `markDirty`, `matches`, `pagesFor`, `sagaOf`, `storyById` from `./data.js`; `get`, `getFor` from
  `./settings.js`; `busy`, `dialog`, `lifecycle`, `show`, `showOnce`, `wait` from `./util.js`; everything it
  needs from `./recap-text.js`; `goTo`, `leadOf`, `whereTo` from `./lead.js`; `button`, `goButton` from
  `./labels.js`. It does not import `ui.js`, `picks.js` or `front.js`. Exports:
  1. `canRecap(saga)`: true when any story in `ORDERED` has a chapter whose id is in `saga.s[id].dn`.
  2. `previously(player, opts = {})`, `opts: { story?: Story, auto?: boolean }`, returns
     `Promise<boolean>` (true: the player picked Go, the caller closes its menu). Steps:
     - `const stale = lifecycle(player)`. Without `opts.auto`: delete `saga.rc` (and `markDirty`) when set.
     - Loop while `!stale()`: story = `opts.story ?? focusStory(ORDERED, saga, leadOf(player)?.s)`. No story:
       the empty state, return false. Build the view: `st = saga.s[story.id]`;
       `chapters = lastChapters(story, st, 3)`; for each, `labels` = the labels of
       `chapter.objectives.filter((o) => !o.optional && matches(o.when, saga, story.id))`,
       `choices = choicesOf(chapter, st)`, `recap = authored(chapter, resolve) ?? (story.chapters.length === 1 ? authored(story, resolve) : undefined)`,
       `text = chapterRecap({ recap, labels, choices })`. `ended` = `outroExcerpt` of the first
       `pagesFor(newest.outro, saga, story.id, player.name)` page, only when the newest chapter has no
       authored recap and that page exists. `played`: `agoText(days)` when `lastPlayed(saga)` is 1 day or
       more back. `done`, `total`, `finished`, `now` per Design. Body: `recapBody(...)`.
     - Buttons per Design (the Go button uses `goButton(lead.npc ? lead.who : lead.place, whereTo(player, lead))`).
     - First pass with `opts.auto`: `res = await autoShow(player, form)`; a result that is not undefined
       deletes `saga.rc` (and `markDirty`); undefined returns false. Otherwise `res = await show(player, form)`.
       Closed or no selection: return false.
     - Go: `goTo(player, lead, "keep")`, return true. Read again: `await reread(...)`. Older chapters: the
       list (loop until Back). Other stories: the list; a pick sets `opts = { story: picked }` and
       continues the loop. Back or Close: return false.
  3. `autoShow` (not exported):

     ```js
     const AUTO_WINDOW = 600; // keep trying for 30 seconds
     const AUTO_RETRY = 40;
     async function autoShow(player, form) {
       const stale = lifecycle(player);
       const end = system.currentTick + AUTO_WINDOW;
       while (!stale() && system.currentTick < end) {
         if (!busy.has(player.id)) {
           const res = await showOnce(player, form, AUTO_WINDOW);
           if (!res) return undefined; // died, left, changed dimension, or nobody answered: still owed
           if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
         }
         await wait(AUTO_RETRY);
       }
       return undefined;
     }
     ```
  4. `reread(player, story, chapter)` (not exported): pages and header per Design
     (`<n>` = `lastChapters(story, st, Infinity).indexOf(chapter) + 1`).
  5. `joined(player, delay = 200)`, `announce` (not exported), `left(player)`,
     `skipAutoRecap(playerId, what = "popup")`, `recapForget(playerId)`:

     ```js
     /** @type {Map<string, "popup" | "all">} */
     const quiet = new Map();
     /** The scheduled announce of each player, to cancel when they leave. @type {Map<string, number>} */
     const pending = new Map();

     export function joined(player, delay = 200) {
       quiet.delete(player.id);
       const saga = sagaOf(player);
       if (!hasProgress(saga)) return; // nothing is written for a player with no story
       const now = Date.now();
       const days = get("enabled") === true ? recapDue(saga, now, Number(get("recapDays")) || 0) : 0;
       saga.ls = now;
       if (days) {
         saga.rc = days;
         if (saga.tr && storyById.get(saga.tr)?.kind !== "main") delete saga.tr; // the main story leads again
       }
       markDirty(player);
       if (!days) return;
       const old = pending.get(player.id);
       if (old !== undefined) system.clearRun(old);
       pending.set(player.id, system.runTimeout(() => {
         pending.delete(player.id);
         announce(player).catch((e) => console.warn(`[saga] recap: ${e}`));
       }, Math.max(1, delay)));
     }

     export function left(player) {
       const saga = sagaOf(player);
       if (!hasProgress(saga)) return;
       saga.ls = Date.now();
       markDirty(player);
     }

     export function skipAutoRecap(playerId, what = "popup") {
       quiet.set(playerId, what === "all" ? "all" : "popup");
     }

     export function recapForget(playerId) {
       quiet.delete(playerId);
       const run = pending.get(playerId);
       if (run !== undefined) system.clearRun(run);
       pending.delete(playerId);
     }
     ```

     `announce(player)`: return when `!player.isValid`; `const mode = quiet.get(player.id)`,
     `quiet.delete(player.id)`; then the steps of Design, "By itself, after a return", step 3. The chat lines
     use the same view as `previously` (the focus story's newest finished chapter; `leadOf(player)`).
- Edge cases: the player dies or changes dimension while the popup waits: `showOnce` returns undefined,
  `rc` stays. The story in focus changed under the player (a chapter id in `dn` no longer exists): skipped;
  a story left with no known finished chapter is not offered in the story list. `opts.story` is a finished
  story: no Go button, now line `§7This story is finished.` A `Page` with a `when` that no longer matches:
  left out by `pagesFor` (an old branch can read slightly differently: accepted). Stories paused: `joined`
  stamps `ls` and owes nothing; `previously` by hand still works and shows no Go button. `rc` set and the
  player opens `/realm:saga` > `Previously` before the 200 ticks pass: `rc` is deleted there; `announce`
  then still sends the chat lines once and, finding no `rc`, does not open the form (check `saga.rc` again
  right before `previously(player, { auto: true })`).
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing; `node tools/check-ascii.mjs | tail -2`,
  `node tools/check-actionbar.mjs | tail -2` and `node tools/check-events.mjs | tail -2` pass. Behavior is
  proven by `saga-recap.js` (T8).

### T5 Something else

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/picks.js` (new)
- Reads (does not edit): `picks-core.js` (T1), `lead.js`, `labels.js` (T3), `data.js`, `party.js`
  (`frontier`), `places.js` (`locate`, `placesOf`, `campName`), `objectives.js` (`reportTo`), `ui.js`
  (`chapterInfo`, `choose`: existing exports), `settings.js`, `util.js`
- Depends on: T1, T3
- Change: `picks.js` exports `somethingElse(player, hooks = {})` and `allStories(player, hooks = {})`, both
  `Promise<boolean>` (true: the player picked Go or Got it, every menu above closes). `hooks`:
  `{ read?: (story: Story) => Promise<unknown> }`. It does not import `recap.js` or `front.js`.
  1. `hasCamp = (wid) => !!placesOf()[campName(wid)]`.
  2. `targetOf(player, saga, story, e)` (not exported), returning
     `{ text: string, npc?: string, who?: string, place?: string, at?: { dim: string, x: number, z: number } }`:

     ```js
     function targetOf(player, saga, story, e) {
       const npcAt = (/** @type {string} */ npc, /** @type {string} */ text) => ({ text, npc, who: npcName(npc), at: homeOf(npc) });
       if (e && chapterDone(e, saga)) return npcAt(reportTo(e), `Report to ${npcName(reportTo(e))}`);
       if (e) {
         const i = currentStep(e, saga);
         const obj = e.chapter.objectives[i];
         if (!obj) return { text: "See its page" };
         const text = plain(labelOf(e, i, saga));
         if (obj.npc && (obj.type === "talk" || obj.type === "deliver" || obj.type === "answer")) return npcAt(obj.npc, text);
         const loc = obj.secret && !e.st.h ? undefined : locate(obj);
         return loc && typeof loc !== "string" ? { text, place: loc.label, at: { dim: loc.dim, x: loc.x, z: loc.z } } : { text };
       }
       const cur = currentChapter(saga, story);
       const npc = cur?.chapter.npc ?? story.giver;
       return npcAt(npc, `Talk to ${npcName(npc)}`);
     }
     ```
  3. `survey(player)` (not exported) builds, from one pass over `ORDERED`, the lists every page uses:
     - `going`: stories that are not finished and `started(saga.s[id])`, with their entry
       (`entries(player).find(...)` without `pq`), in `ORDERED` order.
     - `fresh`: stories with no progress, not finished, `listable(story, saga, hasCamp)`,
       `!storyWaitsForPacks(story)` and `requires(storyRequires(story), saga, story.id, player).ok`.
       `const { now, later } = offeredNow(fresh)`.
     - `locked`: stories with no progress that are listable and fail that `requires`, as
       `{ story, why }`; of the main stories only the first locked one.
     - `favors`: accepted favor and job entries (`entries(player).filter((e) => e.fav)`).
  4. Candidates for `choosePicks`: every `going` story (state `report` when its entry is done, `going` with
     an entry, `between` without; skipped when `onHold(player.id, story, chapter id)`); every `now` story
     (state `new`; `single: story.chapters.length === 1`; `festivalOn` for kind `festival`); each accepted
     favor (`id: "fv:" + npc`, kind `favor`) and job (`id: "wv"`, kind `job`), state `report` or `going`;
     and, when `get("favors") === true`, for each NPC in `favorsByNpc.keys()` with no accepted favor and no
     favor done or turned down today (`!(fs?.a && !fs.c) && !(fs && fs.d >= today())`) whose
     `favorOfDay(player.id, npc, today(), saga)` exists: `{ id: "fv:" + npc, kind: "favor", state: "new" }`.
     `dist`: `across(player.location, target.at)` when `target.at?.dim === player.dimension.id`, else
     undefined. `order`: the index in `ORDERED`, or the NPC's index among `favorsByNpc.keys()`. `lead`:
     `story.id === leadOf(player)?.s`. `mainId`: `frontier(saga, player)`'s story id when the frontier
     exists and has no `why`.
  5. `somethingElse`: `const stale = lifecycle(player)`; loop while `!stale()`: build the picks, show the
     form (Design), open the card or page of the pick; a card that returns true returns true;
     `See everything` runs `allStories` and returns true when it does; `Back` returns false.
  6. The story card, the favor card, `allStories` and its two sub-pages per Design. Section labels with
     `.label(...)`; a selection index counts buttons only (as in `finishedPage`, `ui.js`). The card's Go
     calls `goTo(player, { s: story.id, hint: target.text, dim: target.at?.dim, x: target.at?.x, z: target.at?.z }, story.id === mainId ? "main" : "pin")`
     with a target computed again at that moment; its button is
     `goButton(target.npc ? target.who : target.place, whereTo(player, target.at))`. Pick and list second
     lines are `whoWhere(target.npc ? shortWho(target.who ?? "") : target.place ?? "", whereTo(player, target.at), target.text)`.
- Edge cases: fewer than 3 candidates: fewer buttons; none: the empty body. The nearest giver has no known
  home: distance 5,000, still listed, second line is the name alone. Favors off: no favor candidates. A
  festival ends while the page is open: `startChapter` checks again at the NPC. The pick's story was
  finished or accepted by a party mate while the card was open: the card's Go recomputes the target before
  `goTo`; a story that is finished by then shows `§7[Story] That story is finished.` in chat and returns
  false. A stranger's job that timed out: `choose` finds no entry and does nothing; the page shows again.
  The player is on hold in a party for a main chapter: it is not a candidate.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing; `node tools/check-ascii.mjs | tail -2` passes.
  Behavior is proven by `saga-picks.js` (T8).

### T6 Your Story, the party page and `main.js`

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/front.js` (new), `packs/saga_bp/scripts/party-page.js` (new),
  `packs/saga_bp/scripts/main.js`
- Reads (does not edit): `recap.js` (T4), `picks.js` (T5), `ui.js` after T7 (`showMenu(player, hooks)`),
  `lead.js`, `labels.js`, `recap-text.js`, `data.js`, `party.js`
- Depends on: T4, T5, T7
- Change:
  1. `party-page.js`: exports `showsPartyButton(player)` and `async partyPage(player)` per Design. First
     lines of the file: `// The "Play with my party" page of Your Story. Workstream 05 (the opt-in party
     story) replaces this whole file; front.js only calls showsPartyButton(player) and partyPage(player).`
     Imports: `ActionFormData`; `partyViews`, `sagaOf` from `./data.js`; `frontier`, `partyMates`,
     `partyTag` from `./party.js`; `get` from `./settings.js`; `show` from `./util.js`. Mates sorted by name.
  2. `front.js`: exports `async yourStory(player)`. `const stale = lifecycle(player)`; loop while
     `!stale()`: `entries(player)` (tidies vanished chapters, as `showMenu` does); `saga = sagaOf(player)`;
     `lead = get("enabled") === true ? leadOf(player) : undefined`; body and buttons per Design; show with
     `show(player, form)`; closed or `Close`: return. Go: `goTo(player, lead, "keep")`, return.
     `Previously`: `if (await previously(player)) return`. `Something else`:
     `if (await somethingElse(player, { read })) return`, with
     `const read = (story) => previously(player, { story })`. Party: `await partyPage(player)`.
     `Everything`: `await showMenu(player, { available: () => allStories(player, { read }) })`.
     "First main story" for line 2b: the frontier's `si === 0`.
  3. `main.js`:
     - Imports: add `yourStory` from `./front.js`; `joined`, `left`, `recapForget`, `skipAutoRecap` from
       `./recap.js`; `wandererOf` to the existing `./wander.js` import; remove `showMenu` from the `./ui.js`
       import. Add `front.js`, `recap.js`, `picks.js` to the module list in the file's header comment.
     - Command `realm:saga`: description `"Story Questlines: your story: the next step and where it is, a
       recap, other picks, the full log"`, handler `(origin) => withPlayer(origin, yourStory)`.
       `realm:saga_log` is not changed.
     - `onTalk`, right after `talked(player, msg.npc);`:

       ```js
       const met = wandererOf(msg.npc);
       if (met) {
         const saga = sagaOf(player);
         if (saga.g?.[`met_${met.id}`] !== "1") {
           (saga.g ??= {})[`met_${met.id}`] = "1";
           markDirty(player);
         }
       }
       ```
     - `playerSpawn` (`initialSpawn`), inside the existing `system.run`, after `wanderJoined(player)`:
       `joined(player);`
     - `beforeEvents.playerLeave`: before `flush(player.id)`, inside the same `try`: `left(player);`
     - `afterEvents.playerLeave`: add `recapForget(playerId);`
     - `onDebug`, two more branches, and their lines in the doc comment above it:

       ```js
       } else if (msg.action === "away") {
         // A simulated player cannot rejoin as themselves: pretend they were last seen `days` ago and run the join routine.
         const saga = sagaOf(player);
         const then = Date.now() - Math.max(0, Math.min(9999, Number(msg.days) || 0)) * 86400000;
         saga.ls = then;
         saga.la = Math.min(saga.la ?? then, then);
         delete saga.rc;
         joined(player, Math.max(1, Math.floor(Number(msg.ticks) || 20)));
       } else if (msg.action === "recap_skip") {
         skipAutoRecap(player.id, msg.what === "all" ? "all" : "popup");
       }
       ```

       Doc lines: `` `{ player, action: "away", days, ticks? }` sets the player's last-seen time `days`
       days back and runs the join routine (the recap comes `ticks`, default 20, later), `` and
       `` `{ player, action: "recap_skip", what? }` suppresses that player's next automatic recap ("popup",
       or "all" for the chat lines too), ``.
- Edge cases: the player dies or changes dimension with Your Story open: `stale()` ends the loop and no
  parent page reopens. A lead that changes while a sub-page is open (a party mate reported): the page is
  rebuilt on return. No Townsfolk on the Realm: the lead has no spot, the Next line has no direction, the
  button reads `Go: <who>` / `On your tracker now`. A player with no party tag: no party button. An operator
  sees `Story places` and `Operator tools` under `Everything`, as today.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing; `node tools/check-ascii.mjs | tail -2`,
  `node tools/check-commands.mjs | tail -2` (it may name the docs: T9 fixes those; no other failure),
  `node tools/check-event-guards.mjs | tail -2` and `node tools/check-events.mjs | tail -2` pass;
  `npm run build 2>&1 | tail -3` passes.

### T7 `ui.js` wiring: offers, labels, the new-story line, gating

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/scripts/ui.js`, `packs/saga_bp/scripts/party.js`, `packs/saga_bp/scripts/wander.js`
- Reads (does not edit): `picks-core.js` (T1), `data.js` after T2 (`touch`), `lead.js`, `labels.js` (T3)
- Depends on: T1, T2, T3
- Change (find each place by function name):
  1. Imports in `ui.js`: `touch` from `./data.js`; `listable`, `offeredNow`, `sortOffers`, `started`,
     `storyRequires` from `./picks-core.js`; `leadOf` from `./lead.js`; `NEXT_STEP`, `button`,
     `moreButton`, `offerLine1`, `titleLine` from `./labels.js`; `fit` from `./text.js`. `party.js` and
     `wander.js`: `storyRequires` from `./picks-core.js`.
  2. Gating: replace `requires(story.requires,` with `requires(storyRequires(story),` in `offerFor`,
     `startChapter` and `sortStories` (`ui.js`), `canTake` and `frontier` (`party.js`) and
     `sendWanderState` (`wander.js`). Six replacements; the arguments after the first stay.
  3. `sortStories`: at the top of the loop body add
     `if (!listable(story, saga, (wid) => !!placesOf()[campName(wid)])) continue;` so an unmet wanderer
     chain is in no list.
  4. `offerFor`: first lines become `offerLine1(tag, story)`; second lines pass through `fit(..., 168)`:
     build each label as `button(offerLine1(tag, story), "<second line without §8>")` (`Waiting for your
     party`, `Chapter ${pos}: ${chapter.title}`, `New story`, `Done: report back`). `favorOffer`:
     `Daily favor: ${f.label}` becomes `fit(\`Daily favor: ${f.label}\`, 168)` as the first line (with
     `In progress` / `Done: report back` through `button`). `wanderOffer` and the `Answer:` offer in
     `offersAt`: first lines through `fit(..., 168)`.
  5. `offersAt`: replace the first loop:

     ```js
     const saga = sagaOf(player);
     const lead = leadOf(player);
     const fresh = ORDERED.filter((s) => !started(saga.s[s.id]) && !finished(saga, s) && !storyWaitsForPacks(s) && requires(storyRequires(s), saga, s.id, player).ok);
     const later = new Set(offeredNow(fresh).later.map((s) => s.id));
     let more = 0;
     for (const story of ORDERED) {
       const o = offerFor(player, story, npc);
       if (!o) continue;
       const next = !!lead && lead.s === story.id && (o.key.startsWith("start:") || o.key.startsWith("end:"));
       if (!next && o.key.startsWith("start:") && later.has(story.id)) {
         more++;
         continue;
       }
       if (next) out.push({ key: o.key, label: o.key.startsWith("end:") ? o.label : `${o.label.split("\n")[0]}\n${NEXT_STEP}`, order: 1 });
       else out.push({ ...o, order: CONFIG.offerOrder + (story.kind === "main" ? 0 : 1) });
     }
     if (more) out.push({ key: `more:${npc}`, label: moreButton(more), order: CONFIG.offerOrder + 4 });
     ```

     (the later `const saga = sagaOf(player);` in the function goes; the rest of the function stays.)
  6. `choose`: before `const story = storyById.get(id ?? "");` add
     `if (kind === "more") return moreStories(player, id ?? "");`. New function `moreStories(player, npc)`:
     recompute `later` as in step 5, keep the stories whose first chapter's teller
     (`currentChapter(saga, s)?.chapter.npc ?? s.giver`) is `npc`, in `sortOffers` order; none: return.
     Form per Design (title `npcName(npc)`; tag by kind as in `offerFor`); a pick runs
     `startChapter(player, story)`. Use `show`, not `exclusive` (`startChapter` claims it).
  7. `trackButtons`: second lines become: `The tracker follows it` (unchanged), with party
     `Tracker follows it, party too`; untracked: `Show it in the tracker again`, with party
     `Back on the tracker, party too`. (`For your party too` and `Hide it from the tracker and map` stay.)
  8. `touch(saga)` on the line before `markDirty(..., true)` in `accept`, `acceptFor` (its own `saga`),
     `complete`, `favorStart` and `favorEnd`.
  9. `complete`: delete the `for (const s of ORDERED) { ... New story ... }` loop in the `else` branch and
     add, after the whole `if (next) { ... } else { ... }`, `announceNew(player, saga, story, chapter, !next);`
     with:

     ```js
     /** One chat line for the stories a report just opened (a finished story's followers, or an `opensAfter` chapter). */
     function announceNew(player, saga, story, chapter, storyDone) {
       const ref = `${story.id}/${chapter.id}`;
       const fresh = sortOffers(
         ORDERED.filter(
           (s) =>
             s.id !== story.id &&
             s.kind !== "wander" &&
             !started(saga.s[s.id]) &&
             ((storyDone && !!s.requires?.stories?.includes(story.id)) || s.opensAfter === ref) &&
             !storyWaitsForPacks(s) &&
             requires(storyRequires(s), saga, s.id, player).ok,
         ),
       );
       if (!fresh.length) return;
       const first = fresh[0];
       const who = npcName(first.chapters[0]?.npc ?? first.giver);
       player.sendMessage(
         fresh.length === 1
           ? `§e[Story] New story: ${first.title}. Talk to ${who}.`
           : `§e[Story] ${fresh.length} new stories opened. First: ${first.title} (talk to ${who}). /realm:saga > Something else has the rest.`,
       );
     }
     ```
  10. `showMenu(player, hooks = {})`, `hooks: { available?: () => Promise<unknown> }`: the `Available`
      action becomes `() => (hooks.available ? hooks.available() : availablePage(player))`; the last button
      label `Close` becomes `Back`. Nothing else changes (`availablePage` stays as the fallback).
  11. `currentPage`: build the list first, then the form. For each story: `step` as today: keep the two
      lines `const needs = packsNeeded(story, saga);` and `const step = needs.length ? ...` as they are and
      next to each other (`tools/saga-pack-fallback.test.mjs` matches them); `status`: `Needs a pack` when `needs.length`; with an entry: `Party quest` for `e.pq`,
      `Report back` when `chapterDone(e, saga)`, else `Chapter ${pos} of ${total}`
      (`chapterNumber(saga, story, cur.index)`); without an entry: `Waiting for your party` when on hold,
      else `Next chapter waits`. `mark`: `Tracked. ` / `Not tracked. ` / empty, by the two conditions the
      old `mark` used. Button: `button(titleLine(e?.pq ? "Party: " : "", story, story.kind === "main"), mark + status)`.
      Favors and jobs: `button(fit(e.story.title, 168), mark + (chapterDone(e, saga) ? "Report back" : "In progress"))`.
      Body: the old sentence, an empty line, then one line per button:
      `§e${story.short}§r: §7${plain(step)}` (favors and jobs: `§e${e.story.title}§r: §7${plain(stepLine(player, e, saga))}`).
  12. `opTools`' inner list (`Finish a step`): second line `fit(plain(stepLine(...)), 168)` instead of
      `.slice(0, 60)`.
- Edge cases: the lead's story is a "later" side story (the player pinned it): it is sent, first, not held
  back. An NPC with 3 held-back stories: one `More stories (3)` button. The recommended offer at an NPC who
  only ends the chapter (`end:`): order 1, second line `Done: report back`. `leadOf` returns undefined
  (stories paused never reach `offersAt`; all done): no offer is promoted. A story with `opensAfter` whose
  chapter the player finished before the update: open (the check reads `dn`). A story the player started
  before `opensAfter` was added: `started` is true, so no call site checks `requires` for it. `announceNew`
  after a chapter that is not the story's last and opens nothing: no line. Reports by a party mate
  (`complete(p, ..., by)`): each mate gets their own line.
- Acceptance: `npx tsc -p . 2>&1 | tail -5` prints nothing;
  `node --test tools/saga-pack-fallback.test.mjs tools/saga-party-plays.test.mjs tools/saga-interaction-lifecycle.test.mjs tools/saga-quest-box.test.mjs tools/saga-gossip.test.mjs`
  passes (they read or slice `ui.js` and `party.js`; fix a slice marker only when this task moved it);
  `node tools/check-ascii.mjs | tail -2` and `node tools/check-event-guards.mjs | tail -2` pass;
  `node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-untrack.js --timeout 300`
  and the same for `saga-quest-log.js` pass.

### T8 BDS scenarios

- Repo / checkout: mc-packs
- Owns (new): `tools/test-bds/examples/saga-your-story.js`, `saga-your-story-party.js`, `saga-recap.js`,
  `saga-picks.js`, `saga-offer-order.js`. Owns (edits): `tools/test-bds/examples/saga-op-deop.js`,
  `saga-op-tools.js`, `saga-party-story.js`
- Reads (does not edit): `tools/test-bds/README.md` ("Forms", "Messages"), `saga-untrack.js` and
  `saga-quest-log.js` (the helpers `accept` and `send` to copy), every file of T1 to T7
- Depends on: T6, T7
- Change: every new file starts with a comment of what it proves and its run command, like the existing
  ones: `//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/<file> --timeout 300`.
  Every scenario: `const send = (id, msg) => t.system.sendScriptEvent(id, JSON.stringify(msg));`, waits 120
  ticks after the first player joins (the installed-packs scan), and sends the townsfolk posts itself, in
  one message:
  `send("realm:npc_places", { part: 1, parts: 1, folk: [{ id: "tobin", n: "Old Tobin", dim: "minecraft:overworld", x: 10, z: 10 }, { id: "moss", n: "Moss the Gravedigger", dim: "minecraft:overworld", x: 30, z: 10 }, { id: "wren", n: "Wren", dim: "minecraft:overworld", x: 200, z: 0 }, { id: "ida", n: "Ida the Relicsmith", dim: "minecraft:overworld", x: -200, z: 0 }, { id: "mara", n: "Mara the Cartographer", dim: "minecraft:overworld", x: -60, z: 20 }, { id: "reyes", n: "Warden Reyes", dim: "minecraft:overworld", x: 0, z: 400 }, { id: "bea", n: "Bea the Cook", dim: "minecraft:overworld", x: -300, z: 0 }, { id: "sol", n: "Sol the Sky-reader", dim: "minecraft:overworld", x: 0, z: -400 }, { id: "elsie", n: "Elsie the Innkeeper", dim: "minecraft:overworld", x: 400, z: 400 }] });`
  Assert only text this spec defines (titles, fixed lines, button labels, NPC names); never the wording of
  `lead.hint` or `lead.why`, which is 02's. Each scenario must fail on `master` before this workstream
  (`Your Story` does not exist) and pass after.
  1. `saga-your-story.js` (one player, Ann, not an operator):
     - `/realm:saga`: title `Your Story`; body has `Main story: not started yet.`,
       `You have not started a story yet.` and `Next:`; the first button starts with `Go: Old Tobin`; the
       buttons include `Something else`, `Everything`, `Close`; none contains `Previously` or
       `Play with my party`; at most 6 buttons. Answer the first button: a chat message matches
       `/\[Story\] Next: .+/`; no form opens in the next 40 ticks (`t.forms(ann).length` unchanged).
     - Accept `start:drowned_bell` at `tobin` (helper `accept`). `/realm:saga`: body has
       `Main story: The Drowned Bell (chapter 1 of 6)` (color codes removed) and `Next:`. Close.
     - Bump every step: `send("realm:saga_debug", { player: "Ann", action: "bump", story: "drowned_bell", i, n: 1e9 })`
       for `i` 0 to 3. `/realm:saga`: the first button starts with `Go: Old Tobin`. Close.
     - Report: `end:drowned_bell` at `tobin`, answering `Next` until a button matches `/Finish/`, and answer
       that (chapter 2 is told by Warden Reyes, so no intro opens after it). `/realm:saga`:
       body has `(chapter 2 of 6)`; buttons include `Previously`. Answer `Everything`: a form titled
       `Story Log` whose buttons include `Current quests`, `Finished`, `Codex` and whose last button is
       `Back`; answer `Back`: `Your Story` shows again; answer `Close`.
     - `/realm:saga_log`: a form titled `Current quests`. Close it.
     - `send("realm:cfg_set", { id: "ys_off", pack: "saga_bp", key: "enabled", value: false })`, wait 5.
       `/realm:saga`: body has `Stories are paused by an operator`; no button starts with `Go:` and none is
       `Something else`; `Previously` and `Everything` are there. Close. Set `enabled` back to `true`.
  2. `saga-your-story-party.js` (Ann and Bob, both `addTag("realm_party:t1")`; Cat with no tag):
     - `finish` `drowned_bell` and `last_map` for Ann by debug. Wait 60 ticks (the party sync).
     - Ann `/realm:saga`: the buttons include `Play with my party`. Answer it: title `Party Story`; body
       has `Ann`, `(you)`, `Bob`, `The Drowned Bell, "Salt and Silence"` (Bob), `Signs in the Sky` (Ann) and
       `one main chapter at a time`; the only button is `Back`. Back, Close.
     - Cat `/realm:saga`: no button contains `Play with my party`. Close.
     - `realm:cfg_set` `partyStory` false, wait 30: Ann's `/realm:saga` has no `Play with my party`. Set it
       back.
  3. `saga-recap.js` (Ann, an operator so the debug events are sent as her world's console does today):
     - `jump` `drowned_bell` to `iron`; accept `start:drowned_bell` at `ida`; bump steps 0 and 1 with
       `n: 1e9`; report `end:drowned_bell` at `ida`, answering `Next` until the buttons include
       `Recast the bell`, answer it; the reply and then the next chapter's intro open (Ida tells it):
       answer `Next` / `OK` until the buttons include `Not now`, answer `Not now`.
     - `/realm:saga` > `Previously`: title `Previously`; body has `The Drowned Bell`, `The Drowned Choir`,
       `The Storm Vigil`, `Iron and Sea-Glass` and `You chose: Recast the bell.`; not `Salt and Silence`
       (only the last 3). Do not assert `It ended:` or `Done:`: workstream 04's authored recaps replace
       them. Answer `Read the last chapter again`: the first page's body has
       `How it began`; answer `Next` until a body has `How it ended`; go on until the buttons include `Done`;
       answer `Done`; `Previously` shows again; answer `Older chapters`: 4 chapter buttons, the first
       `Iron and Sea-Glass`; `Back`, `Back`, `Close`.
     - `send("realm:saga_debug", { player: "Ann", action: "away", days: 30 })`: within 60 ticks chat matches
       `/Welcome back\. Last time \(30 days ago\): "Iron and Sea-Glass", The Drowned Bell\./` and
       `/\/realm:saga has the story so far/`; a form titled `Previously` opens: answer it `"busy"`; it opens
       again within 60 ticks, its last button is `Close`; answer `Close`.
     - `away` with `days: 3`: no `Welcome back` message and no form in 80 ticks.
     - `realm:cfg_set` `{ pack: "saga_bp", key: "recapPopup", value: false, player: ann.id }`; `away` 30:
       the `Welcome back` line comes, no form in 80 ticks. Set it back to `true`.
     - `away` 30 with `ticks: 40`, and right after it
       `send("realm:saga_debug", { player: "Ann", action: "recap_skip", what: "all" })`: no `Welcome back`
       message and no form in 100 ticks.
     - `realm:cfg_set` `recapDays` 0; `away` 30: nothing in 80 ticks. Set it back to 7.
  4. `saga-picks.js` (Ann at the world spawn):
     - `/realm:saga` > `Something else`: title `Something else`; at most 3 buttons start with `Report:`,
       `Main:`, `Nearby:` or `Quick:`; one is `Nearby: Graveyard Shift` with a second line containing
       `Moss`; one starts with `Quick:` and its second line contains `Old Tobin`; a button starts with
       `See everything (`; the last is `Back`.
     - `ann.teleport({ x: 195, y: ann.location.y, z: 0 })`, wait 5, open it again: the nearby pick is
       `Nearby: Lost Lambs`.
     - `See everything`: title `All stories`; no button on it or on `More in town` contains `Last Seam`,
       `Rook's Wager`, `High Garden`, `Catch Lightning`, `Way Home`, `Hob's Tales` or their titles; a button
       starts with `More in town (` and one with `Locked for now (`; the locked page's body contains
       `Needs:`.
     - `send("realm:npc_talk", { player: ann.id, npc: "w_brannoch" })`, wait 5: `All stories` now has a
       button containing `Deepdelve's Last Seam` (the chain's title).
     - `Something else` > `Nearby: ...` (teleport Ann back to the spawn first: `Graveyard Shift`): the card
       is titled `Graveyard Shift`, its first button starts with `Go: Moss the Gravedigger`; answer it: chat
       matches `/\[Story\] Next: Talk to Moss the Gravedigger/`; no form opens in 40 ticks; within 80 ticks
       a `realm:saga_lead` message for Ann has `s: "graveyard_shift"` (subscribe to it before the player
       joins, as `saga-untrack.js` does for `realm:track`). If only this last check fails, 02's ladder does
       not honor a tracked story without an accepted chapter: fix that row in `guide.js` in this PR (the
       smallest change that makes `saga.tr` naming a startable story the lead) and say so in the PR body.
  5. `saga-offer-order.js` (Ann):
     - Collect `realm:npc_offer` messages by `req`. `send("realm:npc_talk", { req: "o1", player: ann.id, npc: "tobin", roles: [], name: "Old Tobin" })`,
       wait 6. The offer with key `start:drowned_bell` has `order: 1` and a label whose second line,
       color codes removed, is `Your next step`; no offer has key `start:one_that_got_away`; one offer has
       key `more:tobin`, a label starting `More stories (1)` and `order: 24`; an offer whose key starts
       with `fv` is there.
     - `send("realm:npc_choose", { player: ann.id, npc: "tobin", pack: "saga_bp", key: "more:tobin" })`: a
       form titled `Old Tobin` with a button containing `Got Away`; answer it: a form titled
       `The One That Got Away` opens; close it (`null`).
     - One line for a burst: `finish` `drowned_bell` and `last_map`; `jump` `act1_signs` to `count`; accept
       `start:act1_signs` at `sol`; bump steps 0 to 2 with `n: 1e9`; report `end:act1_signs` at `sol`
       (answer `Next` until `Finish the story`). Since the report: exactly one message matches
       `/new stor/i`, it matches `/^\[Story\] \d+ new stories opened\. First: The Gray Choir \(talk to Warden Reyes\)\./`
       (color codes removed), and no message matches `/New story:/`.
  6. Existing scenarios:
     - `saga-op-deop.js` and `saga-op-tools.js`: replace
       `let next = t.waitForm(op, { title: "Story Log" });` / `t.assert(t.cmd(op, "/realm:saga").ok, "/realm:saga ran");` / `let f = await next;`
       with

       ```js
       let next = t.waitForm(op, { title: "Your Story" });
       t.assert(t.cmd(op, "/realm:saga").ok, "/realm:saga ran");
       let f = await next;
       next = t.waitForm(op, { title: "Story Log" });
       f.answer("Everything");
       f = await next;
       ```
     - `saga-party-story.js`: line 60 becomes
       `t.answerForm(p, "Everything", "Current quests", "Drowned Bell", (f) => f.buttons.findIndex((b) => /Track/.test(b)), "OK", "Back", "Back", "Close");`
       and line 102 becomes
       `t.answerForm(ann, "Everything", "Current quests", "Daily favor", (f) => f.buttons.findIndex((b) => /Track/.test(b)), "Back", "Back", "Close");`
- Edge cases: a form that stays unanswered is closed by the harness after 100 ticks (`t.formTimeout`), so
  every wait for "no form" is 40 to 100 ticks and every opened form is answered. Favors depend on the real
  day: assert only the `Quick:` prefix and the NPC's name. `--only saga_bp` has no Townsfolk, Minimap or
  Parties pack: posts come from the scenario, parties from the tag.
- Acceptance: each of the five new scenarios and the three edited ones passes with its header command;
  `node tools/test-bds/suite.mjs --filter 'saga-(your-story|recap|picks|offer-order|op-|party-story|untrack|quest-log|world-events|content-replacements)' --retry`
  ends with no failure.

### T9 Wire-up and docs

- Repo / checkout: mc-packs
- Owns: `packs/saga_bp/manifest.json`, `packs/admin_bp/manifest.json`, `packs/admin_bp/scripts/presets.js`,
  every pack's generated `scripts/diag.js` (through the tool), `docs/PACKS.md`, `docs/NEWS.md`,
  `release/notes.json`, `ROADMAP.md`, `docs/specs/realm-rework/README.md` (its row for 03) and this spec
  file (deleted), the generated `packs/help_bp/**`, `packs/admin_bp/scripts/catalog.js`,
  `packs/news_bp/**` (through their tools)
- Reads (does not edit): everything T1 to T8 wrote
- Depends on: T8
- Change:
  1. Merge `origin/master` in first (`git fetch -q origin && git merge --no-edit origin/master`).
  2. `packs/saga_bp/manifest.json`: `header.version` gets its minor plus 1 and patch 0 (from `[1, M, P]`
     to `[1, M + 1, 0]`).
  3. `packs/admin_bp/scripts/presets.js`, `NAMES` (run `grep -n '"realm:saga"' packs/admin_bp/scripts/*.js`:
     after workstream 09 the pair may live in `menu.js`; edit the title and hint wherever the grep finds
     them, never `catalog.js`):
     `"realm:saga": ["Your Story", "Next step, recap, other picks"],` (56 and 147 px)
     `"realm:saga_log": ["Current Quests", "Objectives, hints, tracking"],` (78 and 131 px)
     Then `packs/admin_bp/manifest.json` patch plus 1.
  4. `docs/PACKS.md`, section `## Story Questlines — \`saga_bp\`` only (find it with
     `grep -n '^## Story Questlines' docs/PACKS.md`, read with `sed -n`; never open the file whole):
     - `### How to use`: insert a new step 3 and renumber the later steps (4 to 14):
       "3. Not sure what to do? `/realm:saga` opens **Your Story**: where you are in the main story,
       `Next:` (one step, with its direction and distance) and `Why:`. **Go** puts that step on your
       tracker and closes the menu. **Previously** shows the last three chapters with the choices you made,
       and **Read the last chapter again** replays its intro and ending. After 7 days away it comes up by
       itself, with three lines in chat (default 7, `recapDays`; your own switch is **Story recap when I
       come back** in `/realm:prefs`). **Something else** offers up to three picks: a report that is
       waiting (or your main story, when you follow another quest), the nearest side story, and a quick
       favor. **See everything** there lists every story open to you as buttons. **Everything** is the
       full story log."
     - The old step 3 (`Stuck?`): "Open `/realm:saga_log` (or `/realm:saga`, **Everything**, **Current
       quests**), pick the story, then **Ask for a hint**" and the rest of the sentence unchanged.
     - The old step 4: `/realm:saga` → **Current quests** becomes `/realm:saga_log`.
     - The old step 6: "Finished stories open new ones: chat names the first and says how many more.
       **Something else** in `/realm:saga` has them; what is still locked is one tap further, under
       **Locked for now**."
     - `### What players see`, bullet **Offers at the townsfolk**: append "The offer for your next step
       comes first, with `Your next step` on its second line. Of the side stories you could start, two are
       offered at a time; the others wait behind `More stories (n)` at their townsfolk."
     - Replace the bullet **The story log** with two bullets:
       "- **Your Story** (`/realm:saga`): one screen with your place in the main story, the next step
       (`Next:`, with direction and distance, and `Why:`), and at most six buttons: **Go** (track it and
       close), **Previously**, **Something else**, **Play with my party** (in a party: where each mate is in
       the main story, and how sharing works), **Everything** and **Close**. **Previously** shows the last
       three chapters of your story with what you did and chose, lets you read any finished chapter again
       (intro, ending and the reply to your choice), and opens by itself, once, when you come back after
       `recapDays` days (7); if you are busy it tries again for 30 seconds, and again at your next join.
       **Something else** has at most three picks and **See everything**, where every story open to you is
       a button: **Going**, **Offered now**, **More in town** and **Locked for now** (what each one needs).
       A Recurring Wanderer's chain is listed once you have met that wanderer."
       "- **The story log** (**Everything** in Your Story; `/realm:saga_log` opens its **Current quests**
       page): **Current quests** (main story first, then side stories and favors, each button with its
       chapter and whether it is tracked, and every current step in the text above them; a quest opens its
       page with its objectives, distance and direction, who to report to, **Ask for a hint** and **Hear
       the intro again**), **Available** (the same page as **See everything**), **Finished**" and the rest
       of the old bullet from `**Finished**` on, unchanged.
     - `### Commands`: the `/realm:saga` row becomes "**Your Story**: your place in the main story, the
       next step with its direction and distance, and why; **Go**, **Previously** (the last three chapters,
       your choices, read a chapter again), **Something else** (up to three picks, then every story as
       buttons), **Play with my party** (in a party) and **Everything**, the story log: current quests,
       finished stories, the codex, daily favors; for operators also story places and operator tools (your
       operator rights are checked again on every press, and after an Are you sure? question)". The
       `/realm:saga_log` row is unchanged.
     - `### Configuration`: add the row
       "| `recapDays` | `7` | Real days away after which a returning player gets the story recap by
       itself (three chat lines and the **Previously** form). `0` = never; **Previously** in `/realm:saga`
       always works |" after `campDays`, and to the paragraph under the table add: "Each player can switch
       the automatic form off with **Story recap when I come back** in `/realm:prefs` (the chat lines
       stay)."
     - `### Saved data`: in the `saga:p` row, change the shape to
       `{ s: {...}, g?, cx?, fv?, ls?, la?, rc? }` and append: "`ls`: when you were last on the realm;
       `la`: when you last accepted or reported a chapter or favor; `rc`: the days you were away, while a
       recap is still owed; `g.met_<wanderer>`: `1` once you have talked to that Recurring Wanderer. All
       optional; an older save needs no conversion." In the `saga:pref` row add `recapPopup`.
     - `### How it works`, **Modules**: add "`front.js` (Your Story), `recap.js` and `recap-text.js`
       (Previously, the automatic recap and its wording), `picks.js` and `picks-core.js` (Something else,
       the offer order, `opensAfter` / `weight` / `matters`), `lead.js` (the one place that reads the lead
       from `guide.js`), `labels.js` (every button line, cut to 168 pixels), `party-page.js` (Play with my
       party)". In the paragraph **The stories** add the four optional fields in one sentence, as in
       `docs/STORY_BIBLE.md` (T1).
  5. `README.md`: no change (the pack's summary and command list are the same).
  6. `docs/NEWS.md`, a new entry at the top (plain ASCII):

     ```
     ## Your Story: one next step, and a recap when you come back

     - Story Questlines: /realm:saga now opens Your Story. It shows where you are in the main story, the one next step with its direction and distance, and why. Go puts it on your tracker.
     - Previously: the last three chapters and the choices you made, and you can read any finished chapter again. After a week away it comes up by itself (your own switch: Story recap when I come back, in /realm:prefs).
     - Something else: up to three picks (a report that is waiting, the nearest side story, a quick favor) instead of one long list. See everything has every story as a button.
     - Townsfolk put your next step first. Extra new stories sit behind More stories.
     - The full story log is still there: Everything in Your Story, and /realm:saga_log still opens your current quests.
     ```
  7. `release/notes.json`: add to `notes`:
     "Story Questlines: /realm:saga opens Your Story: your place in the main story, the one next step with
     its direction and distance, and why; Go tracks it.",
     "Story Questlines: Previously shows the last three chapters with your choices, lets you read finished
     chapters again, and opens by itself after 7 days away.",
     "Story Questlines: Something else offers up to three picks; every story open to you is a button under
     See everything; townsfolk put your next step first."
     and to `packNotes`:
     `"saga_bp": { "version": "<the new header.version as a.b.c>", "notes": "Your Story at /realm:saga (next step, why, Go), Previously (recap, reread, automatic after 7 days away), Something else (three picks, every story as a button), your next step first at townsfolk. The full log is under Everything; /realm:saga_log is unchanged." }`,
     `"admin_bp": { "version": "<its new version>", "notes": "The menu's Story Log entry is now Your Story." }`.
     Replace an older `saga_bp` or `admin_bp` entry for a lower version (`release-notes.mjs` fails on one).
  8. `ROADMAP.md`: delete the entry "Realm rework 03: Your Story (the /realm:saga front door, Previously,
     picks)". `docs/specs/realm-rework/README.md`: delete the row for 03 in the workstream table. Delete
     `docs/specs/realm-rework/03-your-story.md`.
  9. Regenerate, last and in this order: `node tools/sync-diag.mjs`, `node tools/help-catalog.mjs`,
     `node tools/admin-catalog.mjs` (if `packs/admin_bp/scripts/catalog.js` changed after step 3's bump,
     no second bump is needed: one bump covers the PR), `node tools/gen-news.mjs`, `node tools/sync-diag.mjs`.
  10. `npm run check 2>&1 | tail -30` and `npm run build 2>&1 | tail -3` pass. Then the bundle smoke:
      `npm run bundle -- --all && node tools/test-bds/run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/bundle-smoke.js`.
- Edge cases: another PR bumped `help_bp` or `news_bp` meanwhile: merge `master` again and repeat step 9.
  `admin-catalog --check` says a name is too wide: the widths above were measured with the wider table
  (D19); shorten the hint, never the check.
- Acceptance: `npm run check 2>&1 | tail -30` ends without an error; `npm run build 2>&1 | tail -3` passes;
  `git status --short` shows no generated file left unstaged; `grep -c "Your Story" docs/PACKS.md` is 3 or
  more.

## Waves

W1: T1, T2, T3 · W2: T4 (needs T2, T3), T5 (needs T1, T3), T7 (needs T1, T2, T3) · W3: T6 (needs T4, T5, T7)
· W4: T8 (needs T6, T7) · W5: T9 (needs T8)

## Review focus

- Saved data on real saves: `ls`, `la`, `rc` and `g.met_*` never written for a player with no story
  progress; a corrupt or old save unchanged; `rc` cleared on every path that showed or suppressed the recap,
  and kept on every path that did not.
- The automatic popup: it never opens over a vision or a dialogue (`busy`), never retries after an answer,
  never cancels the player's other forms on a timeout (`showOnce`, not `show`), and one lifecycle covers the
  popup and what its buttons open.
- `storyRequires` at all six call sites, and nothing re-locks a started story. With today's content
  (no field set) the set of stories a player can start is the same as before, wanderer chains included.
- `offersAt`: the recommended offer is never held back; a report is never relabeled; the `more:` key cannot
  start a story the player may not start.
- Every button line through `labels.js`; no `.header(`; no new `setActionBar` or `setTitle`.
- `lead.js` is the only importer of `guide.js` among the new files, and it matches what 02 really exports.
- The three edited scenarios still prove what they proved (operator tools after a de-op, tracking in a
  party).

## Release

1. One PR to `master` of `nishant/mc-packs`, merged with a merge commit after `check` and `pr-tests` are
   green. Versions: `saga_bp` minor plus 1, `admin_bp` patch plus 1, `help_bp` and `news_bp` by their
   generators.
2. The `release` workflow publishes and deploys (never run for real from a session:
   `node tools/ci-release.mjs`, hosting's `publish-packs.mjs`, or anything that uploads to a `packs-<slug>`
   release). Wait for its run; read its summary; check-live must pass.
3. `validate.yml` runs after the merge: read its `perf-report` issue; `saga_bp` must not be slower than its
   base.
4. Verify live: `https://minecraft.nish.software/realm/` lists the new Story Questlines version and its
   `How to use` has the Your Story step.
5. `MANUAL-STEPS.md` in `nishant/skills` (edit it the way that file's "How Claude sessions edit this file"
   says), one entry: "Realm rework 03 (Your Story), on a phone after the Realm Bundle is uploaded: (1) run
   `/realm:saga`: six buttons or fewer, no line cut with `...` except a very long place name; (2) an
   operator runs `/scriptevent realm:saga_debug {"player":"<your name>","action":"away","days":8}` while
   the Welcome popup would be open at a join, or simply rejoin after 7 days: the Previously form must open
   after the other popups are closed, never under them; (3) tap Old Tobin: the story button for your next
   step is first and reads `Your next step`, and the green text is readable on the button."
6. The summary to the owner ends with the Realm Bundle and Realm Resources versions from the release run.

## Open questions for the research phase

Facts to measure only; none blocks the build.

1. On a real client, does a second form shown while the Welcome or News popup is open come back as
   `UserBusy` (assumed, and what the harness's `"busy"` answer models), or does it queue behind it?
2. Is `§2` (dark green) readable on the light gray button on a phone? If not, `NEXT_STEP` becomes
   `§8Your next step` (one constant in `labels.js`).
3. The cost of one `offersAt` call after T7 at 40 players: one profiled run of
   `node tools/test-bds/run.mjs --quiet --no-relay --profile --only saga_bp --scenario tools/test-bds/examples/saga-offer-order.js --timeout 300`,
   reading the `onTalk` line. Expected under 0.2 ms.
4. Whether `nextStep` (02) returns the C1 object or the research's `Next` shape, and the exported name of
   the NPC home map: read `guide.js` (T3 keeps only the matching branch).
