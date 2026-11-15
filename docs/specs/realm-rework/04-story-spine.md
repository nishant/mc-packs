# Story spine: one way in, a stated goal, recaps, hand-overs and gated town stories

Status: specified, not started · Slug: realm-rework-04-story-spine · Date: 2026-11-15 · Size: large
Repos: nishant/mc-packs (spec lives here; the only repo this workstream changes)
ROADMAP: `ROADMAP.md`, entry "Realm rework 04: the story spine (one entry point, goals, recaps, hand-overs, gated town stories)"

Workstream 04 of the realm rework. The shared decisions (D1-D20) and contracts (C1-C8) are in
`docs/specs/realm-rework/README.md`; they win where this file and that one disagree about something two
workstreams share. Depends on 03 (`03-your-story.md`), which depends on 02 and 01: stop if
`packs/saga_bp/scripts/guide.js` does not exist or `grep -n '"Your Story"' packs/saga_bp/scripts/ui.js`
finds nothing.

Words used in this file:

- **Chapter** (capital C): one of the seven main stories (`kind: "main"`), numbered 1 to 7 by the new field
  `Story.chapter`. Players never see the word: the game already calls a quest a "chapter" (`Chapter 3 of 12`),
  so player text says `Story 4 of 7`.
- **quest**: what the code calls a chapter (`Story.chapters[]`). There are 68 main quests.
- **part**: two to six quests of one Chapter that share one recap. There are 24 parts, ids `1A` to `7E`.
- **town story**: a story of kind `side` (16 of them; the files call them side questlines).
- **started**: a story with a quest accepted (`st.a === 1`), a quest finished (`st.dn.length > 0`) or
  finished (`st.fin`).

## Goal

A player who opens the story after weeks away should read, in a few lines, what happened, what they chose,
why the next quest matters and who has it. A new player should have one place to start and a short list of
things on offer. This workstream adds the data that makes that true (the spine fields and all of their text),
the engine code that reads it, the rules that keep it true, and the file the website reads. The writing that
exists is kept: no quest is removed, no story, quest or choice id changes, and no objective changes its
position.

Outcomes:

1. A player with no progress is offered exactly one main story, *The Drowned Bell*, at Old Tobin. Mara does
   not offer *The Cartographer's Last Map* until *The Drowned Bell* is finished. A player who already
   started or finished *The Cartographer's Last Map* keeps it.
2. Every one of the 68 main quests has a `part` and a `goal`; the 24 parts have a recap each; 15 town
   stories have a recap. `node tools/check-stories.mjs` fails when one is missing.
3. Every main quest that ends at one townsfolk while the next quest starts at another ends with a
   hand-over page that names the next townsfolk (42 quests, 61 lines), on every path through the choices.
4. The form titled `Previously` leads with the part's recap and at most two lines about the player's own
   choices, and `Your Story` shows which of the seven stories and which part the player is on, and a
   countdown to Lantern Night that follows progress.
5. 64 steps that used to read as riddles (scenes that play by themselves, sleeps, waits, trails,
   champions with no place, named items, other packs' activities) carry a free `tip`, shown under the step.
6. Town stories open after the main quest that introduces their townsfolk (`opensAfter`); at most two are
   "Offered now", the rest are "Later in town"; four are marked `Matters on Lantern Night`. Only one
   wanderer's chain can be begun at a time. A story that was started before this release stays open.
7. Daily favors are a town board of 3 a day, the same 3 for a whole party. Favors already accepted are
   untouched. World option `favorBoard` 0 restores a favor at every questgiver.
8. Four quests have a second way that needs no rare place: glass instead of prismarine shards
   (`drowned_bell/iron`), a midnight watch instead of a thunderstorm (`drowned_bell/vigil`), glass instead
   of a spyglass (`act1_signs/smudge`), the diggers' crates instead of echo shards (`act3_deep/echoes`).
9. The song path of `act2_choir/hollis_night` sets `g:hollis` to `shaken` instead of leaving it unset.
10. The 21 "Ask ..." buttons of Act IV are marked `flavor`; their quests show `Accept` first.
11. The confusable names listed in "Renames" are changed in every file that holds them.
12. `realm:npc_flags` carries three live flags: `g:part`, `g:next`, `g:nights`.
13. `docs/story.json` is written by `tools/story-export.mjs`, holds no dialogue, choice, flag or reward, and
    `node tools/story-export.mjs --check` is part of `npm run check`.

## Out of scope

- The "should" and "could" tiers of `research/story-content.md` 5.10: merging or cutting quests, the
  re-ordered Act III, halved kill counts, group variants of pages, clock-free alternatives for the other 62
  clock steps, a real item for every "hold the lamp" step, the dangling threads. They are README backlog.
- `party`, `decide`, `soloCount`, `skippable` (workstream 05) and scene `lines` (backlog). Do not add them.
  `flavor` is the one field from that list that this workstream adds, because outcome 10 needs it.
- Sharing favor progress inside a party. The board is the same for party mates; each mate still does and
  reports their own favor.
- Any change to `npc_bp`, `wander_bp` or another pack. The three live flags are published here and read by
  workstream 12.
- The reset hour (D17). Favors keep using `today()` in `packs/saga_bp/scripts/data.js`; workstream 12
  changes that one function and the board follows.
- A second ghast-tear way, a second way for Act IV's monument and sky quests. Those walls are announced
  (`needs`) but stay.
- Editing `tools/check-stories.allow.json`'s `entries` array or the tests that pin it
  (`tools/story-content.test.mjs`).

## Decisions

README decisions this spec carries out: D9 (the lead's `why` is the quest's goal), D10 (the new text shows in
Your Story, Previously and Everything), D11 (choice is cut by presentation; nothing is removed), D13 (the
"must" tier and the rules that keep it true), D17 (the reset hour stays with 12), D20 (`docs/story.json`).

Local decisions:

| # | Decision | Why |
|---|---|---|
| L1 | The single entry point is `last_map.requires = { stories: ["drowned_bell"] }`, as D11 and the research say. It is not behind a setting. | The lead (02) and the lock reason already understand `requires.stories`. |
| L2 | `opensAfter` and the one-chain rule sit behind one world option, `storyGates` (default on). (default) | The README says every default is reversible in settings. Old BDS scenarios turn it off with one line. |
| L3 | *The One That Got Away* opens after `drowned_bell/warden` with weight 30, not "after Little Turtles is finished" as the research proposed. (default) | A town story must never be locked behind another town story (D11: no hard cap). The weight already keeps Tobin's two stories from being offered together. |
| L4 | The storm vigil's second way is always there, not only when Weather Almanac is missing. (default) | "Installed" does not mean the Almanac will send a storm (its Story events switch, its rate limit). The second way costs 3 minutes instead of 2 and needs midnight. |
| L5 | Each recap says only what the player knew when the part's first quest was offered. 17 of the research's 24 drafts told the part's own events and were rewritten. | A recap is shown before the part ("Previously"), and on the website before the visitor ticks the quest. |
| L6 | State lines: at most 2 per recap, the newest in story order first. | As researched; more reads as a list. |
| L7 | The town board has no preference for townsfolk of the current part. (default) | Party mates on different parts must see the same board (D11). |
| L8 | `Favor.board` is a boolean, default true. No template sets it in this release. | The field exists so a later review can retire templates from the board without deleting them. |
| L9 | A `tip` is required only on `vision`, `sleep`, `wait`, `follow` and on a `defeat` with a champion and no place. The other 26 drafted tips ship as content but no rule demands them. | The research's rule (every vigil, event, interact, answer...) needs about 250 tips; D13 budgets 58. |
| L10 | The spine's own allow-list is a second array, `spine`, in `tools/check-stories.allow.json`. | `tools/story-content.test.mjs` asserts that `entries` holds exactly four rows. |
| L11 | Brannoch's reward title becomes `Rimejaw's Bane`. Players who earned `Gnasher's Bane` keep it. | Titles stores earned titles as text (`packs/titles_bp/scripts/main.js:247-266`); nothing is migrated. |
| L12 | Ida's story lamp is renamed `Ida's Echo Lamp` / `the Echo Lamp` in story text. | The Relics pack already has a different relic called Lantern of the Deep (`packs/relics_bp/scripts/config.js`). Lamps players already hold keep their old name; no step checks it. |
| L13 | `flavor` choices are not recorded as "You chose" and `Accept` is a new first button. Picking a flavor button still shows its reply and then accepts, as today. | No save changes; the button stops looking like a decision. |
| L14 | The word "Chapter" is never shown for the seven stories; the UI says `Story 4 of 7, part C: The Counter-Song`. (default) | See "Words used in this file". |
| L15 | `goal` is at most 100 characters (the research said 80). | The lead's `why` (C1) allows 120; 100 leaves room and fits the drafted lines. |
| L16 | `docs/story.json` gives every quest the recap of its part (main), its story's recap (town stories) or `""`, and adds optional keys beyond C8 (`chapter`, `parts`, `part`, `branch`, `opensAfter`, `weight`, `matters`, `minutes`, `needs`, `usesPacks`, `recap` on a story). | C8 asks for `chapters[].recap`; D13 budgets 24 recaps, not 252. Extra keys are optional for the reader. |

## Current state

Line numbers are for `master` at 470be3d (before workstreams 01, 02, 03, 06 and 07). Those five will have
moved lines in `packs/saga_bp/scripts/ui.js`, `main.js`, `objectives.js` and `data.js`: find every function
below by name (`grep -n "function <name>\|const <name> =" packs/saga_bp/scripts/*.js`), never by line.

**Content.** `packs/saga_bp/scripts/stories.js` holds `NPC_NAMES` (16-29), `PLACES` (35-53) and the two
prologue stories `drowned_bell` (66-232) and `last_map` (234-333); `STORIES = [...PROLOGUE,
...MORE_STORIES]` (337). `packs/saga_bp/scripts/stories/index.js` lists the other files: `act1_signs.js`,
`act2_choir.js`, `act3_deep.js`, `act4_seals.js`, `act5_lantern.js`, `side_dark.js` (`inn_ghost`,
`graveyard_shift`, `vesna_bargain`, `hollis_faith`), `side_bright.js` (`lost_lambs`, `star_kittens`,
`hatchlings`, `one_that_got_away`, `hearth_and_table`), `side_bold.js` (`wardens_oath`, `smugglers_run`,
`mayors_burden`, `edges_of_map`, `singing_forge`), `side_deep.js` (`listening_deep`), `side_heart.js` (12
heart stories), `wanderers.js` (8 chains), `festivals.js` (16), `calling.js` (`the_calling`), `favors.js`
(48 templates, 4 per questgiver), `wander_oneoffs.js`. Each file has speaker constants at its top
(`const T = "§eTobin:§r ";` and the like); use the file's own constant for a speaker, and where a file has
none for that speaker write `§e<Name>:§r ` out.

**Types.** `packs/saga_bp/scripts/types.js`: `Page` (17), `Requires` (29-35), `Objective` (111-188),
`Choice` (205-214), `Chapter` (217-235), `Story` (238-249), `Favor` (253-261). The file holds typedefs
only.

**Engine facts this spec relies on** (`packs/saga_bp/scripts/data.js`):

- `ORDERED` (92-98): main stories first, by `act`, then the rest in file order.
- `today()` (140): the UTC day number. `favorOfDay(playerId, npc, day, saga)` (147-154): FNV-1a of
  `${playerId}|${npc}|${day}` picks one of the questgiver's templates whose `when` holds.
- `requires(req, saga, storyId, player)` (566-599) already understands `req.chapters` (`"story/chapter"`,
  574-583) and words the reason as `finish "<quest title>" of <story title>`.
- `finished(saga, story)` (554-559), `currentChapter(saga, story)` (627-636): the accepted quest, else the
  first unfinished quest in file order whose `when` holds.
- Progress is saved per objective **index** (`StoryState.o`, `x`, and `ch["<quest>#<index>"]`, 24-35), so
  an objective may never be inserted, removed or moved; one may be appended.
- An objective's `set` is applied when it reaches its target (`finishObj`, `objectives.js:486-498`).
  Members of an `or` group are "either" steps; `labelOf` (data.js:724-731) writes `Either:` / `Or:` in
  front of their labels by itself.
- A `sleep` step counts the moment the player lies in a bed (`player.isSleeping`,
  `objectives.js:3682-3687`); the night does not have to pass and other players do not have to sleep. A
  `wait` with `days` counts in-game days from when it started (`objectives.js:3668-3680`). A `survive`
  with no `weather` needs thunder (`objectives.js:885-887`), and the engine already asks Weather Almanac
  for a storm while the player stands at the place (`weatherHelp`, `objectives.js:3530-3539`).
- `scale.js` `initFar` (82-90) rewrites every string in the story data that holds `{far:`, `{leg:` or
  `{band:`; new text must not use those tokens.

**Where a story's start is checked today** (each skips the check for a started story):
`ui.js` `offerFor` (222-243, line 236), `startChapter` (597-645, line 607-613), `complete` (the `New story:`
lines, 938-941), `sortStories` (1641-1664); `party.js` `canTake` (51-59), `frontier` (99-118);
`wander.js` 326. Workstreams 02 and 03 add more callers in `guide.js`.

**Text surfaces today** (`ui.js`): `chapterHeader` (80-85, `Chapter 2 of 6: <title>`), `objectiveLines`
(130-162), `startChapter` (intro dialog; `introChoices` replace the `Accept` button, 615-616),
`endChapter` (812-883; the outro dialog, then `complete`, then the choice's reply dialog at 874),
`choicesMade` (1619-1638), `favorOffer` (246-261), `favorsPage` (1825-1841), `offersAt` (267-288).
`objectives.js` `bump` prints `§e[Story] Next: <label>` when a step is done (471-472).

**Flags sent to Townsfolk.** `main.js` `NPC_FLAGS` (155-193) and `sendFlags` (199-219), every 5 seconds
per player (main loop, 82-85), sent only when the JSON changed. Townsfolk keeps at most 64 flags
(`packs/npc_bp/scripts/main.js:1162`); 42 are sent today.

**`g:hollis`.** Set to `saved` by `act2_choir/hollis_night` choice `stay` (only on the force path) and
by `act3_deep/herald` (`hold`: saved, `bell`: lost). Every reader tests `saved`, `lost`, `!saved` or
`!lost` (about 50 uses in `stories/*.js`; `packs/npc_bp/scripts/hearth.js:695,704,1000`;
`packs/npc_bp/scripts/main.js:1251`; `packs/skills_bp/scripts/calling.js:1099`), so a third value behaves
exactly like unset.

**The checker.** `tools/check-stories.mjs`: structure checks (60-390), game ids (393-450), prefabs
(452-485), the path walker that plays every story through every choice (487-657; it already builds
`values`, the set of values each flag can be set to, at 497-537), content rules `auditStoryRules`
(768-967) with an exact-entry allow-list (`applyStoryAllowlist` 974-985, `loadStoryAllow` 988-993,
`tools/check-stories.allow.json`), `--list` (713-719). `tools/story-content.test.mjs` pins the allow-list's
`entries` to four rows and names objectives by index (`"drowned_bell/sunken objective 2"`).

**Corrections to the research** (`research/story-content.md`), found while checking it against the files:

- Ida's lamp is a real item: `act3_deep/echoes` rewards a soul lantern named `Lantern of the Deep`
  (`stories/act3_deep.js:93`). No step checks for it, so the tips that say "no item needed" are right.
- "Everyone online must be in bed" is wrong for a `sleep` step (see above); the tips say so.
- There are 12 festival steps labeled `(Realm Calendar)`, not 10, and Brannoch's title is
  `Gnasher's Bane`.
- Parts 5B and 5C follow today's quest order (the research's note under 5.4), because the re-order is not
  in this tier.

**BDS scenarios that this changes.** About 40 files in `tools/test-bds/examples/` name a town story, a
wanderer's chain or `last_map` (many start one for a fresh player), 5 match the quest title
`The Drowned Choir`, 2 match `The Long Night`, and `saga-party-story.js` takes a favor at Tobin. T11 fixes
them.

## Design

### Data

Section numbers `D1` to `D18` are referred to by the tasks. All new game text is plain ASCII plus `§`
codes. Tables give text exactly as it must appear; copy it, do not rephrase it.

#### D1 New fields (`packs/saga_bp/scripts/types.js`)

All optional. None is saved with a player.

| Where | Field | Type | Meaning |
|---|---|---|---|
| `Story` | `chapter` | `number` | Main stories only: 1 to 7, the spine's order. |
| `Story` | `opensAfter` | `string` | `"story/quest"`: the story cannot be begun until that main quest is finished. Read only while `storyGates` is on. |
| `Story` | `weight` | `number` | Town stories only. Above 0: the story's place in the offer order (lower first). 0: outside the order (The Calling). |
| `Story` | `matters` | `string` | A tag shown with the story (`"Matters on Lantern Night"`). |
| `Story` | `minutes` | `number` | Rough play time, shown before the story starts. |
| `Story` | `needs` | `Need[]` | Walls the whole story has, shown before it starts. |
| `Story` | `recap` | `string` | Town stories: one recap for the whole story. |
| `Chapter` | `part` | `string` | Main quests only: the id of its part (`"4C"`), an entry of `PARTS`. |
| `Chapter` | `goal` | `string` | Why the player is doing the quest. One sentence. |
| `Chapter` | `next` | `Page[]` | Hand-over lines. The first page whose `when` holds (a plain string always holds) is shown when the quest is reported. |
| `Chapter` | `needs` | `Need[]` | Walls this quest has. |
| `Objective` | `tip` | `string` | A free instruction for the step. |
| `Choice` | `flavor` | `boolean` | Intro choices only: talk that sets nothing. |
| `Favor` | `board` | `boolean` | `false` keeps the template off the town board. Default true. |

`Need` is `"nether" | "end" | "monument" | "deep" | "sky" | "storm"`.

Text limits, checked by D17: `goal` at most 100 characters; `tip` at most 100; a `next` page at most 200;
a recap at most 240 and 2 or 3 sentences; none of them may hold `§` except a `next` page (speaker colors),
none may hold `{` or `}`, every one ends with `.`, `!`, `?`, `'` or `"`.

The typedef lines to add (JSDoc, in the existing typedefs):

```js
/** A wall a quest or story has: a place or event a casual player may be weeks away from. @typedef {"nether" | "end" | "monument" | "deep" | "sky" | "storm"} Need */

// in Objective
 * @property {string} [tip] a free instruction shown under the step (at most 100 characters, no color codes)
// in Choice
 * @property {boolean} [flavor] intro choices only: talk that sets nothing; the quest shows Accept first
// in Chapter
 * @property {string} [part] main quests: the id of its part in stories/spine.js PARTS ("4C")
 * @property {string} [goal] why the player is doing it: one sentence, at most 100 characters
 * @property {Page[]} [next] hand-over lines: the first page whose `when` holds is the last thing the ender says
 * @property {Need[]} [needs] walls this quest has, told before it is accepted
// in Story
 * @property {number} [chapter] main stories: 1 to 7, the spine's order
 * @property {string} [opensAfter] "story/quest": cannot be begun before that main quest is finished (world option storyGates)
 * @property {number} [weight] town stories: offer order, lower first; 0 = outside the order
 * @property {string} [matters] a tag shown with the story ("Matters on Lantern Night")
 * @property {number} [minutes] rough play time
 * @property {Need[]} [needs] walls the whole story has
 * @property {string} [recap] town stories: the story so far, 2 or 3 sentences
// in Favor
 * @property {boolean} [board] false keeps it off the town board (default true)
```

#### D2 The spine module (`packs/saga_bp/scripts/stories/spine.js`, new)

Pure data and pure functions. It must not import `@minecraft/server` or any file that does, so
`tools/*.mjs` can import it. It imports nothing.

```js
/** @typedef {{ id: string, story: string, title: string, quests: string[], recap: string }} Part */
/** What the pure functions read of a player. @typedef {{ flag: (key: string) => string | undefined, done: (story: string, quest: string) => boolean, accepted: (story: string, quest: string) => boolean, started: (story: string) => boolean, finished: (story: string) => boolean }} Read */

/** @type {Part[]} */
export const PARTS = [ /* the 24 rows of D4, in that order */ ];
/** @type {Map<string, Part>} */
export const partById = new Map(PARTS.map((p) => [p.id, p]));

/** How each wall reads. @type {Record<string, string>} */
export const NEEDS = {
  nether: "a way into the Nether",
  end: "a way into the End",
  monument: "gear for an ocean monument",
  deep: "gear for the deep dark",
  sky: "blocks to climb above the clouds",
  storm: "a thunderstorm",
};
/** "a way into the Nether, a thunderstorm"; "" for none. @param {string[] | undefined} needs */
export const needsText = (needs) => (needs ?? []).map((n) => NEEDS[n]).filter(Boolean).join(", ");

/** "about 45 minutes", "about 1.5 hours", "about 2 hours"; "" for none. @param {number | undefined} m */
export function minutesText(m) {
  if (!m || m <= 0) return "";
  if (m < 60) return `about ${m} minutes`;
  const h = Math.round(m / 30) / 2;
  return `about ${h} hour${h === 1 ? "" : "s"}`;
}

/** FNV-1a, 32 bit: the hash data.js favorOfDay has always used. @param {string} s */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/**
 * The questgivers on the town board: `npcs` ordered by fnv(`${seed}|${day}|${npc}`), lowest first (ties keep
 * the order of `npcs`), then the first `count` for which `has(npc)` is true.
 * @param {string} seed @param {number} day @param {string[]} npcs @param {number} count @param {(npc: string) => boolean} has
 */
export function boardNpcs(seed, day, npcs, count, has) {
  const order = npcs.map((npc, i) => ({ npc, i, h: fnv(`${seed}|${day}|${npc}`) })).sort((a, b) => a.h - b.h || a.i - b.i);
  /** @type {string[]} */
  const out = [];
  for (const { npc } of order) {
    if (out.length >= count) break;
    if (has(npc)) out.push(npc);
  }
  return out;
}

/** Town stories in offer order: weight above 0, lowest first (ties keep the given order). @template {{ weight?: number }} T @param {T[]} stories @returns {T[]} */
export const townOrder = (stories) => stories.map((s, i) => ({ s, i })).filter((x) => (x.s.weight ?? 0) > 0).sort((a, b) => (a.s.weight ?? 0) - (b.s.weight ?? 0) || a.i - b.i).map((x) => x.s);

export const STATE_LINES = [ /* D5 */ ];
/** The lines of D5 that are true for this player, newest first, at most `max`. @param {Read} read @param {number} [max] @returns {string[]} */
export function stateLines(read, max = 2) { /* D5 */ }

/** Nights until the Lantern passes, from progress (D6); undefined before Sol's count and after the ending. @param {Read} read @returns {number | undefined} */
export function nights(read) { /* D6 */ }
/** D6's sentence, without color codes; "" for undefined. @param {number | undefined} n */
export function nightsText(n) { /* D6 */ }
```

`packs/saga_bp/scripts/stories/index.js` gains one line:
`export { PARTS, partById, NEEDS, needsText, minutesText, fnv, boardNpcs, townOrder, STATE_LINES, stateLines, nights, nightsText } from "./spine.js";`

#### D3 The spine: every main quest, its Chapter, its part and its goal

`Story.chapter`: `drowned_bell` 1, `last_map` 2, `act1_signs` 3, `act2_choir` 4, `act3_deep` 5,
`act4_seals` 6, `act5_lantern` 7. `Story.act` stays as it is. `last_map` gains
`requires: { stories: ["drowned_bell"] }` (it has no `requires` today).

Each quest below gets `part` and `goal` exactly as given. "When" repeats the quest's existing `when`, for
orientation only: do not change it.

| Story | Quest id | When | `part` | `goal` |
|---|---|---|---|---|
| `drowned_bell` | `salt` | | `1A` | Find out what rang in a harbor with no bell. |
| `drowned_bell` | `choir` | | `1A` | Thin out the drowned on the shore and see what they carry. |
| `drowned_bell` | `vigil` | | `1A` | Keep watch at the lighthouse and mark where the bell rings from. |
| `drowned_bell` | `iron` | | `1B` | Bring Ida what she needs to forge something to face the bell. |
| `drowned_bell` | `sunken` | | `1B` | Take Ida's work down to the sunken bell and settle it. |
| `drowned_bell` | `warden` | | `1B` | End the bell's keeper so the harbor is safe. |
| `last_map` | `pins` | | `2A` | Show Mara you are ready to walk off the edge of her map. |
| `last_map` | `far` | | `2A` | Walk to Fenn's pins and see what he was pointing at. |
| `last_map` | `chapel` | | `2B` | Find what Fenn left at the Old Chapel. |
| `last_map` | `last` | | `2B` | Finish Fenn's map with a map of a place you love. |
| `act1_signs` | `smudge` | | `3A` | See for yourself what Sol has seen in the eastern sky. |
| `act1_signs` | `fallen` | | `3A` | Find out what the ground remembers where a star fell. |
| `act1_signs` | `rhyme` | | `3A` | Find out where the children's skipping song came from. |
| `act1_signs` | `keeper` | | `3B` | See what puts out the chapel candles every night. |
| `act1_signs` | `graves` | | `3B` | Find out who is opening the Long Storm's graves. |
| `act1_signs` | `echo` | | `3B` | Follow Fenn's hidden page to the Stargazer's Ruin. |
| `act1_signs` | `inn` | | `3B` | Be there when Elsie opens her old trunk. |
| `act1_signs` | `song` | | `3C` | Follow Brother Hollis and see who is calling him. |
| `act1_signs` | `choice` | | `3C` | Decide who should know about the Choir, then keep Hollis safe. |
| `act1_signs` | `count` | | `3C` | Help Sol count the nights until the comet passes. |
| `act2_choir` | `pattern` | | `4A` | Find out what the gray thread on the farm fences is counting. |
| `act2_choir` | `pip` | | `4A` | Follow Pip's trail and bring him home. |
| `act2_choir` | `ledger` | | `4A` | Find out whose crates the Choir was carrying. |
| `act2_choir` | `double` | `g:quill` trusted | `4B` | Get the Choir's ledger out of the Smugglers' Cove unseen. |
| `act2_choir` | `raid` | `g:quill` exposed | `4B` | Take the Smugglers' Cove with Reyes and find the Choir's ledger. |
| `act2_choir` | `letter` | | `4B` | Keep the Choir from taking the bell's tongue, and Ida. |
| `act2_choir` | `confession` | | `4B` | Find out what the Choir wanted in the old crypt. |
| `act2_choir` | `fen` | | `4C` | Ask the witch of Hollow Fen what a dead keeper wants. |
| `act2_choir` | `tear` | | `4C` | Pay Vesna's price for the counter-song. |
| `act2_choir` | `hollis_night` | | `4C` | Get Brother Hollis back from the sea before the voice takes him. |
| `act2_choir` | `ring_burns` | | `4D` | Break the Gray Choir at the Gray Ring. |
| `act2_choir` | `mayor` | | `4D` | Learn what the old mayor ordered the town to forget. |
| `act3_deep` | `echoes` | | `5A` | Gather enough echoes for Ida to hear what Fenn's shard remembers. |
| `act3_deep` | `lamp` | | `5A` | Take Ida's lamp deep and hear what the stone remembers. |
| `act3_deep` | `mine` | | `5A` | Find out why the miners sealed a tunnel after the storm. |
| `act3_deep` | `listening` | | `5B` | Hear what the stone under the Old Chapel kept of the storm night. |
| `act3_deep` | `tobin` | | `5B` | Tell Old Tobin how his brother Hal really died. |
| `act3_deep` | `flame` | | `5B` | Follow the lamp's flame to the room the Starwrights built. |
| `act3_deep` | `seal` | | `5B` | Hold the Stone Seal while the lamp tries to fill it. |
| `act3_deep` | `herald` | | `5C` | Answer the voice that speaks from the Hollow. |
| `act3_deep` | `apron` | | `5C` | Find out what Elsie has been hiding for forty winters. |
| `act3_deep` | `keys` | | `5C` | Learn how the three seals can be relit. |
| `act4_seals` | `council` | | `6A` | Gather the town's council and choose the first seal. |
| `act4_seals` | `tide_vault` | `now` tide | `6B` | Gather sea-light from the ocean monuments to tune the shard. |
| `act4_seals` | `tide_boat` | `now` tide | `6B` | Row out with Tobin and clear the way to the Tide Seal. |
| `act4_seals` | `tide_echo` | `now` tide | `6B` | Hear Hal's echo, then relight the Tide Seal. |
| `act4_seals` | `stone_door` | `now` stone | `6C` | Get back down to the Stone Seal past the Choir's diggers. |
| `act4_seals` | `stone_frame` | `now` stone | `6C` | Rebuild the Stone Seal's frame so it can hold the light. |
| `act4_seals` | `stone_light` | `now` stone | `6C` | Answer the seal stone and relight the Stone Seal. |
| `act4_seals` | `sky_stair` | `now` sky | `6D` | Climb above the clouds and find the Sky Seal. |
| `act4_seals` | `sky_bridge` | `now` sky | `6D` | Close the gap in the Sky Seal's ring. |
| `act4_seals` | `sky_vision` | `now` sky | `6D` | See what the Lantern remembers, then light the Sky Seal. |
| `act4_seals` | `promise` | | `6E` | Hear what Elsie wants to ask before the Lantern passes. |
| `act4_seals` | `gate` | | `6E` | See what the meteor opened at the Hollow Gate. |
| `act5_lantern` | `rally` | | `7A` | Get the town ready for Lantern Night. |
| `act5_lantern` | `smugglers` | `g:quill` trusted | `7A` | Bring Quill's fleet into the harbor for the night. |
| `act5_lantern` | `fen` | `g:vesna` free | `7A` | Fetch the song Vesna promised for Lantern Night. |
| `act5_lantern` | `fen_bound` | `g:vesna` bound | `7A` | Call Vesna from the Fen to sing for the town. |
| `act5_lantern` | `chapel` | `g:hollis` saved | `7A` | Help Brother Hollis ready the counter-song in the chapel. |
| `act5_lantern` | `alone` | `g:allies` <= 0 | `7A` | Build the barricade. No one else is coming. |
| `act5_lantern` | `long_night` | | `7B` | Hold the lighthouse until dawn and keep the light burning. |
| `act5_lantern` | `gate` | | `7C` | Get through the Choir's last circle to the mouth of the Gate. |
| `act5_lantern` | `herald` | | `7C` | Put the Herald down, all three times he rises. |
| `act5_lantern` | `choice` | | `7D` | Set the keys in the Sky Seal and decide where the light goes. |
| `act5_lantern` | `dawn_relight` | `g:ending` relight | `7E` | Hear what Ashgrave's echo has to say, and tell Tobin. |
| `act5_lantern` | `dawn_gift` | `g:ending` gift | `7E` | Carry Elsie's last messages to the people she left them for. |
| `act5_lantern` | `dawn_crown` | `g:ending` crown | `7E` | Face the town that you saved. |
| `act5_lantern` | `forty` | | `7E` | Plant a tree for the lost, then go and sit with Tobin. |

68 rows: 6 + 4 + 10 + 12 + 10 + 12 + 14.

#### D4 The 24 parts and their recaps (`PARTS` in `stories/spine.js`)

A recap says what the player knew when the part's first quest was offered (L5). `quests` lists every
quest of the part in file order, branches included.

| `id` | `story` | `title` | `quests` | `recap` |
|---|---|---|---|---|
| `1A` | `drowned_bell` | A Bell That Isn't There | `salt`, `choir`, `vigil` | A bell rang over the harbor last night, in a town that has had no bell for forty winters. Old Tobin heard it, and he wants to know what rang. |
| `1B` | `drowned_bell` | Iron for a Bell | `iron`, `sunken`, `warden` | The drowned came ashore with tarred rope on their wrists: the old harbor bell's rope. From the lighthouse you heard the bell itself ring from under the sea. Old Tobin says Ida the Relicsmith can make something to face it. |
| `2A` | `last_map` | Fenn's Pins | `pins`, `far` | Mara the Cartographer's old teacher, Aldous Fenn, left her an unfinished map: three pins, far from anything, and a note that says FINISH IT. She needs someone who can walk far and come back. |
| `2B` | `last_map` | The Line Home | `chapel`, `last` | You stood on Fenn's three pins. Lines drawn through them cross near home, at the Old Chapel, where Fenn used to sit for hours. Mara never asked him why. |
| `3A` | `act1_signs` | The Smudge | `smudge`, `fallen`, `rhyme` | The harbor bell is dealt with and Fenn's map is finished. Now Sol the Sky-reader has seen something in the eastern sky that should not be there yet. |
| `3B` | `act1_signs` | What the Town Forgot | `keeper`, `graves`, `echo`, `inn` | At the Starfall Crater you saw a storm night long ago: a bell rung in a strange rhythm, slow, slow, quick, until a comet cracked. The town's children skip rope to that rhythm. Old Tobin's brother Hal called it the wrong heartbeat. |
| `3C` | `act1_signs` | The Gray Ring | `song`, `choice`, `count` | Fenn's echo named three seals that hold something down under the world: Tide, Stone and Sky. Someone is opening the graves of the Long Storm and leaving a cracked circle. Brother Hollis dreams of a drowned man who teaches him to ring a bell. |
| `4A` | `act2_choir` | The Missing Boy | `pattern`, `pip`, `ledger` | The smudge is a comet, the Lantern, and it passes in sixty nights. The Gray Choir means to ring a broken note that night, and they want Brother Hollis to ring it. Warden Reyes is hunting them. |
| `4B` | `act2_choir` | The Ledger | `double`, `raid`, `letter`, `confession` | The Choir took a boy, Pip, and you brought him home. Their crates carried Quill the Trader's mark. Their books are kept at the Smugglers' Cove. |
| `4C` | `act2_choir` | The Counter-Song | `fen`, `tear`, `hollis_night` | The Choir wants the bell's tongue, and Ida. Brother Hollis let them into the crypt in his sleep, where the coffin of the old keeper, Brother Ashgrave, was opened from the inside. Moss knows someone who knows the old songs. |
| `4D` | `act2_choir` | The Ring Burns | `ring_burns`, `mayor` | Vesna of the Fen taught you the counter-song, and it is only a lullaby. The voice called Brother Hollis into the sea, and you got him back to shore. The Choir still gathers at the Gray Ring. |
| `5A` | `act3_deep` | Echoes | `echoes`, `lamp`, `mine` | The Gray Ring is burned and the Cantor is dead. Her last words: you can't kill a song. Ida has a crystal from Fenn's things that hums at night. |
| `5B` | `act3_deep` | The Storm Night | `listening`, `tobin`, `flame`, `seal` | Ida's lamp plays echoes, the sounds the stone kept. It showed the Starwrights, people in coats of stars, building a seal deep under the ground. At the old mine, three miners were bricked into a tunnel that sang, and they are still humming. |
| `5C` | `act3_deep` | The Last Starwright | `herald`, `apron`, `keys` | Forty winters ago Brother Ashgrave rang the bell to get his dead daughter back, and the note cracked the Lantern. Hal, Tobin's brother, died trying to stop him. The Stone Seal under the mine is cracked, and something below it roared. |
| `6A` | `act4_seals` | The Council | `council` | Elsie the innkeeper is the last Starwright. Each seal has a key that must be relit with a piece of the Lantern before the comet passes, and she cut that piece from her apron for you. Tide, Stone, Sky. |
| `6B` | `act4_seals` | The Tide Seal | `tide_vault`, `tide_boat`, `tide_echo` | The council chose its roads. The Tide Seal lies under the sea, and Old Tobin knows the water over it. He is waiting at the dock. |
| `6C` | `act4_seals` | The Stone Seal | `stone_door`, `stone_frame`, `stone_light` | The Stone Seal is the chained door far under the old mine, the one that cracked when Ida's lamp tried to fill it. Ida has stood there before, and she is going down again with you. |
| `6D` | `act4_seals` | The Sky Seal | `sky_stair`, `sky_bridge`, `sky_vision` | The Sky Seal is somewhere above the clouds, higher than birds go. Only Sol the Sky-reader can find it by the stars, and he is on the roof of the inn with his spyglass. |
| `6E` | `act4_seals` | The Promise | `promise`, `gate` | All three seals are lit and the Lantern is close enough to read by. Elsie has one more thing to ask of you before it passes. |
| `7A` | `act5_lantern` | Rally | `rally`, `smugglers`, `fen`, `fen_bound`, `chapel`, `alone` | A meteor struck the Hollow Gate, and the Herald, Brother Ashgrave's voice, spoke to the whole town at once. Lantern Night is days away. Mayor Bram is calling the town together. |
| `7B` | `act5_lantern` | The Lighthouse | `long_night` | The town is armed and fed, and whoever you won over stands with it. The Lantern passes tonight. Warden Reyes holds the line at the lighthouse. |
| `7C` | `act5_lantern` | The Gate | `gate`, `herald` | The lighthouse held, and Pip kept the light burning all night. Everything that came, came from the Hollow Gate. Whatever is left is still inside. |
| `7D` | `act5_lantern` | The Choice | `choice` | The Herald fell three times. The Lantern stands at the top of the sky and the three keys are lit. Elsie is waiting for you at the Sky Seal. |
| `7E` | `act5_lantern` | Dawn | `dawn_relight`, `dawn_gift`, `dawn_crown`, `forty` | Lantern Night is over and the town is still standing. The sun is coming up, and there are people to see. |

The part id is `<Chapter number><letter>`; workstream 12 reads it that way (`g:part`). In Chapter 6 the
letters B, C and D are fixed to Tide, Stone and Sky whatever order the player takes them in.

#### D5 State lines (`STATE_LINES` and `stateLines` in `stories/spine.js`)

A state line is one sentence about the player's own choices. `stateLines(read, max = 2)` walks
`STATE_LINES` from the first entry to the last and returns the first `max` lines that apply. The order
below is the array's order (the latest part of the story first).

An entry is either `{ key, values }` (the line is `values[read.flag(key)]`, when that exists) or
`{ id, line }` where `line` is a function of `read` that returns a string or `undefined`.

| # | Entry | Lines |
|---|---|---|
| 1 | `key: "g:ending"` | `relight`: `You relit the Lantern. The Hollow sleeps for forty winters.` · `gift`: `Elsie became the seal. She is the star you can see by day.` · `crown`: `You took the Hollow Crown. The town is safe, and afraid of you.` |
| 2 | `id: "allies"` | See below. |
| 3 | `key: "act4_seals.act4:promise"` | `allow`: `You promised to let Elsie choose, if it comes to that.` · `refuse`: `You told Elsie that nobody else dies for the seals.` |
| 4 | `id: "seals"` | See below. |
| 5 | `key: "act3_deep.keys"` | `miners`: `Ida's miners stand with you.` · `wayfarers`: `Sol's wayfarers stand with you.` |
| 6 | `key: "act3_deep.elsie"` | `forgive`: `You forgave Elsie her forty winters of silence.` · `condemn`: `You told Elsie she should have spoken forty winters ago.` |
| 7 | `key: "g:vesna"` | `free`: `Vesna of the Fen is free, and she remembers who freed her.` · `bound`: `Vesna is bound to the Fen and must come when you call.` |
| 8 | `key: "act2_choir.mayor"` | `truth`: `Bram told the town the truth about the Long Storm.` · `bury`: `Only you, Bram and Reyes know what the old mayor buried.` |
| 9 | `id: "hollis"`, `key: "g:hollis"` | `saved`: `Brother Hollis is free of the voice and sleeps again.` · `lost`: `The voice has Brother Hollis. His chair by the fire stays empty.` · `shaken`: `Brother Hollis came back from the sea, but the voice is not done with him.` Also the `shaken` line when `g:hollis` is unset and `read.flag("act2_choir.hollis_way") === "song"` (players who took the song path before this release). |
| 10 | `key: "g:quill"` | `trusted`: `You trusted Quill the smuggler, and he works for you now.` · `exposed`: `You gave Quill to Reyes. He sits in her cells.` |
| 11 | `key: "act1_signs.act1:path"` | `report`: `You told Warden Reyes about the Choir, and her wardens stand with you.` · `alone`: `You kept the Choir from Reyes to protect Hollis, and went alone.` |
| 12 | `key: "last_map.map"` | `share`: `Fenn's map hangs in the square for every traveler.` · `keep`: `Fenn's map stays on Mara's shelf.` |
| 13 | `key: "drowned_bell.bell"` | `silence`: `You silenced the harbor bell with Ida's iron band.` · `ring`: `You recast the harbor bell; it rings the tide in every evening.` |
| 14 | `id: "inn"` | `You helped Lily, Elsie's little sister, to rest.` when `read.finished("inn_ghost")`. |
| 15 | `id: "heart"` | With `m = Number(read.flag("g:mercy") ?? 0)` and `i = Number(read.flag("g:iron") ?? 0)`: when `m >= 4 && m >= i`: `In town they say you are gentle with people.`; else when `i >= 4`: `In town they say you are hard when it is needed.` |

Entry 2, `allies`: applies when `read.done("act5_lantern", "rally")` and `read.flag("g:ending")` is
undefined. Names, in this order: `Quill's boats` when `read.done("act5_lantern", "smugglers")`; `Vesna`
when `read.done("act5_lantern", "fen")` or `read.done("act5_lantern", "fen_bound")`; `Brother Hollis` when
`read.done("act5_lantern", "chapel")`. With names: `With you on Lantern Night: <names>.`, the names joined
as `A`, `A and B`, `A, B and C`. With none and `read.done("act5_lantern", "alone")`: `Nobody answered.
The town stands alone.` Otherwise undefined.

Entry 4, `seals`: applies when `read.done("act4_seals", "council")` and not `read.finished("act4_seals")`.
Lit seals, in this order: `Tide` when `read.done("act4_seals", "tide_echo")`, `Stone` when
`read.done("act4_seals", "stone_light")`, `Sky` when `read.done("act4_seals", "sky_vision")`. None lit:
`No seal is lit yet.` Otherwise `Seals lit: <names joined by ", ">.` and, when
`read.flag("act4_seals.now")` is `tide`, `stone` or `sky` and that seal is not lit, the line continues
` Next: the Tide Seal.` (or Stone, Sky).

Keys are written the way `flagOf(saga, "", key)` reads them (`data.js:498-507`): `g:<name>`, or
`<story id>.<flag>`.

#### D6 The countdown (`nights`, `nightsText`)

`nights(read)` returns the first that applies:

| Condition | Value |
|---|---|
| `read.flag("g:ending")` is set | `undefined` |
| `read.done("act5_lantern", "long_night")` or `read.accepted("act5_lantern", "long_night")` | `0` |
| `read.started("act5_lantern")` | `1` |
| `read.finished("act4_seals")` | `3` |
| 3 of `act4_seals` `tide_echo`, `stone_light`, `sky_vision` are done | `10` |
| 2 of them | `15` |
| 1 of them | `20` |
| `read.finished("act3_deep")` | `30` |
| `read.finished("act2_choir")` | `45` |
| `read.finished("act1_signs")` | `60` |
| otherwise | `undefined` |

`nightsText(n)`: `undefined` gives `""`; `0`: `The Lantern passes tonight.`; `1`: `The Lantern passes
tomorrow night.`; otherwise `The Lantern passes in <n> nights.` Where the UI colors it: the number or the
words `tonight` / `tomorrow night` in `§f`, the rest in `§7` (see UI).

#### D7 Hand-over lines (`Chapter.next`)

A quest gets `next` when the townsfolk who hears its report is not the one who tells the next quest. The
engine shows the first page of `next` whose `when` holds (D16 `handover`), so the order of the rows of one
quest below is the order of its array, and a row with no "When" is a plain string that must come last.

How to write a row: "Speaker" `Tobin` means the page is the file's Tobin constant followed by the text
(`` `${T}Reyes keeps the watch house ...` `` in `stories.js`). Speaker `-` means the text is used as it
is; where the text holds `<Bea>` or `<Reyes>`, put that speaker's constant there and a blank line before
it (`"On your way out, Bea leans out of the kitchen.\n\n" + BE + "Wren was looking ..."`, or the same as a
template string). A row with a "When" becomes `{ text: <page>, when: <When> }`; use the file's own
constant for the condition where it has one (`EXPOSED`, `NOW("tide")`), else the literal object.

Every line names the next townsfolk by the name in the "Names" column (D17 checks it as a whole word).

`stories.js`:

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `drowned_bell/salt` | | Reyes | Tobin | Reyes keeps the watch house by the square. Tell her what you saw from the lighthouse. |
| `drowned_bell/choir` | | Tobin | Reyes | Take that scrap of rope down to Tobin on the docks. He has waited forty winters to be proved right. |
| `drowned_bell/vigil` | | Ida | Tobin | Ida's forge is the one that never goes cold. Go now, before I talk myself out of all this. |
| `drowned_bell/sunken` | | Bram | Ida | Bram is at the town hall. Tell him what answered the bell. Use small words. |
| `drowned_bell/warden` | | Mara | Tobin | Mara's been asking for someone who can walk far and come back. Old map of her teacher's. Go see her. |
| `last_map/last` | | Sol | Mara | Sol wants to see you. He says the stars are wrong, which is Sol for 'come at once'. |

`stories/act1_signs.js`:

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `fallen` | | Wren | Sol | One more thing before you rest. Ask Wren at the stables about the skipping song. She knows every verse. |
| `rhyme` | | Hollis | Tobin | If it's old songs you're after, the chapel keeper's been asking for help. Young Hollis. He isn't sleeping. |
| `keeper` | | Moss | Hollis | Moss was asking for you. Something is wrong in the graveyard, and he would not tell me what. I think he was being kind. |
| `graves` | | Mara | Moss | A cracked circle. Fenn drew circles on everything. Mara has his book: go and ask her. |
| `echo` | | Bea | Mara | The Long Storm again. Elsie was here for it. Go by the inn, and ask Bea first: Elsie tells her cook more than her guests. |
| `inn` | | Wren | - | On your way out, Bea leans out of the kitchen. `<Bea>` Wren was looking for you. Out of breath, hay in her hair. Go and see what the child wants. |
| `choice` | | Sol | Hollis | Sol has been shouting numbers out of his window all day. I think he has counted something. Go and see. |
| `count` | | Reyes | Sol | Warden Reyes has been asking for you. Gray thread on the farm fences, she says. She does not like thread. |

`stories/act2_choir.js`:

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `ledger` | `{ "g:quill": "exposed" }` | Reyes | - | Reyes stops in the doorway with Quill's arm in her hand. `<Reyes>` The cove at dusk. Come and find me when you have your sword. |
| `double` | | Reyes | Quill | This letter is past keeping from Reyes. Come along. I would rather she heard it with you in the room. |
| `letter` | | Hollis | Ida | Brother Hollis has been sitting on the chapel steps since dawn, asking for you. Go and see what he wants. |
| `hollis_night` | | Reyes | - | At the chapel door a warden is waiting with a lantern. Reyes wants you at first light. She says she knows where the whole Choir will be. |
| `ring_burns` | | Bram | Reyes | Bram sent for you. He has his father's desk on the table and a crowbar in his hand. Go before he hurts himself. |
| `mayor` | | Ida | Bram | One more thing. Ida came by asking for you. Something of Fenn's that hums at night, she said. |

`ledger` has only the one conditional row: on the trusted path the next quest is Quill's own.

`stories/act3_deep.js`:

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `mine` | | Moss | Ida | Moss will be in the graveyard at this hour. Tell him the three are still singing. |
| `listening` | | Tobin | Moss | Tobin will be on the docks with his net. Go gently. Forty winters is a long time to be wrong about a brother. |
| `tobin` | | Ida | Tobin | Ida was down here looking for you. Said her lamp has started leaning. Whatever that means, it had her worried. |
| `seal` | | Reyes | Ida | Warden Reyes has runners out looking for you. Something about a voice. Go. |
| `herald` | | Bea | - | Bea is waiting at the end of the road with her arms folded. `<Bea>` You. Kitchen. Now. It is about Elsie. |

`stories/act4_seals.js` (`NOW(seal)` is the file's helper for `{ now: seal }`):

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `council` | `NOW("tide")` | Tobin | Elsie | Tobin will be at the dock at first light. Take something to breathe with. |
| `council` | `NOW("stone")` | Ida | Elsie | Ida is at her forge with her pack on. Take torches and soft boots. |
| `council` | `NOW("sky")` | Sol | Elsie | Sol is on the roof of the inn with his spyglass. Take blocks to climb with. |
| `tide_echo` | `NOW("stone")` | Ida | Tobin | Ida next. Tell her the sea has done its part. |
| `tide_echo` | `NOW("sky")` | Sol | Tobin | Sol next. Tell him the sea has done its part, and to mind his feet up there. |
| `tide_echo` | `NOW("done")` | Elsie | Tobin | Go and tell Elsie. She will want to hear it from you. |
| `stone_light` | `NOW("tide")` | Tobin | Ida | Tobin next. The dock. Tell him the stone is quiet. |
| `stone_light` | `NOW("sky")` | Sol | Ida | Sol next. The inn roof. Tell him the stone is quiet. |
| `stone_light` | `NOW("done")` | Elsie | Ida | Go to Elsie. Walk. You have earned a slow walk. |
| `sky_vision` | `NOW("tide")` | Tobin | Sol | Old Tobin next, down at the dock. The sea has waited longest. |
| `sky_vision` | `NOW("stone")` | Ida | Sol | Ida next, at her forge. Stone is patient, but Ida is not. |
| `sky_vision` | `NOW("done")` | Elsie | Sol | Go down to Elsie at the inn. I will stay and watch a little longer. |
| `promise` | | Reyes | - | Before the plates are cleared, a warden is at the inn door: Reyes wants you on the wall. Something has come down past the wastes. |
| `gate` | | Bram | Elsie | Go to Bram, starling. He is calling the town together, and he will want you beside him. |

`stories/act5_lantern.js`:

| Quest | When | Names | Speaker | Text |
|---|---|---|---|---|
| `rally` | `{ "g:quill": "trusted" }` | Quill | Wren | Oh! And Quill is sitting on a crate behind the stable. He said to send you. He said it was enormous. He says that a lot. |
| `rally` | `{ "g:vesna": "free" }` | Moss | Wren | Moss came by looking for you. He was holding a bunch of reeds like flowers. He said a lady left them. |
| `rally` | `{ "g:vesna": "bound" }` | Moss | Wren | Moss came by looking for you. He had a blue lantern in each hand and he did not look happy. |
| `rally` | `{ "g:hollis": "saved" }` | Hollis | Wren | Brother Hollis asked if you would come up to the chapel. He was scrubbing the floor. He was smiling. |
| `rally` | | Reyes | Wren | Warden Reyes is up on the cliff road counting people. She counted me. I do not think I was supposed to count. |
| `smugglers` | `{ "g:vesna": "free" }` | Moss | Quill | Your gravedigger was asking for you. Moss. He had swamp on his boots and a look I would not bet against. |
| `smugglers` | `{ "g:vesna": "bound" }` | Moss | Quill | Moss the gravedigger was asking for you. He was carrying blue lanterns, which I am told is a bad sign. |
| `smugglers` | `{ "g:hollis": "saved" }` | Hollis | Quill | The chapel keeper wants you. Hollis. He asked nicely, which is how I knew he was not one of mine. |
| `smugglers` | | Reyes | Quill | Reyes wants you on the cliff road. Go on. I will try to look like an honest harbor. |
| `fen` | `{ "g:hollis": "saved" }` | Hollis | Moss | Young Hollis wants you up at the chapel. He is scrubbing floors. In my trade we call that a good sign. |
| `fen` | | Reyes | Moss | Reyes is on the cliff road, counting heads. Go and be one of them. |
| `fen_bound` | `{ "g:hollis": "saved" }` | Hollis | Moss | Young Hollis wants you up at the chapel. He is scrubbing floors. In my trade we call that a good sign. |
| `fen_bound` | | Reyes | Moss | Reyes is on the cliff road, counting heads. Go and be one of them. |
| `chapel` | | Reyes | Hollis | Warden Reyes is on the cliff road. Go to her. I will be here, practicing the high note. |
| `long_night` | | Sol | Reyes | Sol is in the square with his spyglass on the hills. Go to him. He knows the hour. |
| `gate` | | Elsie | Sol | The inn. Elsie. Go now, while the Lantern is still climbing. |
| `choice` | `{ "g:ending": "relight" }` | Tobin | - | In the morning, Old Tobin is on the dock where he always is. Go and sit with him. |
| `choice` | `{ "g:ending": "gift" }` | Wren | - | In the morning, go down to the inn. Wren will need someone. |
| `choice` | `{ "g:ending": "crown" }` | Bram | - | In the morning, Mayor Bram is waiting for you in the square. |
| `dawn_relight` | | Moss | Tobin | Moss was asking for you. Something about a tree. Go on. I will be along. |
| `dawn_gift` | | Moss | Wren | Moss says to come to the graveyard when you can. He has a tree in a pot. He says it is for everybody. |
| `dawn_crown` | | Moss | Bram | Moss asked for you at the graveyard. He is one of the few who did. Go. |

61 lines on 42 quests: 6, 8, 6, 5, 14, 22. A quest not in these tables gets no `next`.

`Chapter.needs` (walls that stay; shown before the quest is accepted and with the hand-over):

| Quest | `needs` |
|---|---|
| `act2_choir/tear` | `["nether"]` |
| `act4_seals/tide_vault` | `["monument"]` |
| `act4_seals/sky_stair` | `["sky"]` |
| `act5_lantern/fen` | `["nether"]` |
| `act5_lantern/choice` | `["sky"]` |

#### D8 Tips (`Objective.tip`)

"Step" is the objective's place in the quest's `objectives` array as written, counting from 1 (the number
`check-stories` prints as `objective N`). The label is given so the step can be found; do not change it.

Three lines are used many times (write the full sentence, not the name):

- **SLEEP_DREAM**: `Lie down in any bed at night. It counts at once, and a dream follows.`
- **SLEEP**: `Lie down in any bed at night. It counts as soon as you are in bed.`
- **WAIT1**: `Wait one in-game day. It counts while you do other things.`

| File | Quest | Step | Label today | `tip` |
|---|---|---|---|---|
| `act1_signs.js` | `fallen` | 3 | Touch the crater's glowing heart | Walk to the glowing core in the middle of the crater. A vision plays; stay close. |
| `act1_signs.js` | `keeper` | 3 | Stay when the candles go out | Stay inside the Old Chapel after the vigil. The scene plays by itself. |
| `act1_signs.js` | `inn` | 2 | Help Elsie move her things into the new chest | Nothing to do: after you give Elsie the chest, watch the scene. |
| `act1_signs.js` | `song` | 1 | Follow the pale light Hollis follows | Go to the Old Chapel. A pale light waits there: walk after it and keep close. |
| `act1_signs.js` | `song` | 3 | Listen to the Cantor | Stay hidden inside the Gray Ring. The scene plays by itself. |
| `act1_signs.js` | `count` | 3 | Look into the dark between the stars | Stay at the Stargazer's Ruin after the count. The scene plays by itself. |
| `act2_choir.js` | `pip` | 1 | Follow Pip's trail of dropped toys | Start at the Haddock farm (on the tracker). The toys glow: walk from one to the next. |
| `act2_choir.js` | `letter` | 2 | Catch the thief at the forge | Wait for night. Hush appears close to you, wherever you are: bring him down before he runs. |
| `act2_choir.js` | `confession` | 1 | Help Moss dig out the crypt steps (break 12 dirt) | Break 12 dirt or grass blocks; any will do. Then search the crypt at the graveyard. |
| `act2_choir.js` | `mayor` | 2 | Read the old mayor's sealed order | Nothing to do: after you talk to Tobin, the order plays as a scene. |
| `act3_deep.js` | `lamp` | 2 | Hold the lamp and hear the first echo | Go below y -40 anywhere. The echo plays by itself; you need no item in hand. |
| `act3_deep.js` | `mine` | 2 | Mine 40 deepslate (anywhere below y 0) | Mine any 40 deepslate blocks. They count anywhere, also away from the mine. |
| `act3_deep.js` | `listening` | 2 | Hold the lamp to the listening stone | Stay inside the Old Chapel. The scene plays by itself; you need no lamp in hand. |
| `act3_deep.js` | `flame` | 1 | Follow the lamp's leaning flame down from the mine | Go to the Abandoned Mine. A small flame waits at the entrance: walk after it, down. |
| `act3_deep.js` | `seal` | 2 | Listen as the seal drinks the lamp's light | Stay in the seal room after the last wave. The scene plays by itself. |
| `act3_deep.js` | `apron` | 2 | Sleep a night under Elsie's roof | SLEEP_DREAM |
| `act4_seals.js` | `tide_boat` | 1 | Row a boat 200 blocks with Tobin aboard | Row any boat 200 blocks, anywhere. Tobin is with you in the story only. |
| `act4_seals.js` | `stone_frame` | 2 | Sneak and keep still by the seal for 60 seconds | Hold sneak within 6 blocks of the seal stone for a full minute. |
| `act4_seals.js` | `sky_vision` | 1 | Stand in the Sky Seal's ring and let the shard show you | Stand in the middle of the ring at the Sky Seal. A vision plays; no item needed. |
| `act4_seals.js` | `promise` | 3 | Sleep through the night | SLEEP_DREAM |
| `act5_lantern.js` | `gate` | 4 | Look down into the Hollow Gate | Walk under the black arch. A vision plays; stay there. |
| `act5_lantern.js` | `choice` | 4 | Let the Lantern's light pass through the crown | Stand on the Sky Seal. The scene plays by itself; then report to Elsie to choose. |
| `act5_lantern.js` | `dawn_gift` | 1 | Read the letter Elsie left behind | Nothing to do: the letter plays as soon as you accept. |
| `act5_lantern.js` | `dawn_crown` | 2 | Sleep in a bed, if you can | SLEEP_DREAM |
| `side_dark.js` | `inn_ghost/cold_room` | 1 | Sleep through a night (room three, or any bed) | SLEEP_DREAM |
| `side_dark.js` | `inn_ghost/sea_kept` | 1 | Have a nautilus shell named Lily's Shell | Rename a nautilus shell to Lily's Shell at an anvil and carry it. It is not taken. |
| `side_dark.js` | `inn_ghost/sea_kept` | 2 | Have an amethyst shard named Lily's Marble | Rename an amethyst shard to Lily's Marble at an anvil and carry it. It is not taken. |
| `side_dark.js` | `inn_ghost/sea_kept` | 3 | Have a sheet of paper named Lily's Paper Star | Rename a sheet of paper to Lily's Paper Star at an anvil and carry it. It is not taken. |
| `side_dark.js` | `inn_ghost/storm_child` | 2 | Look back forty winters | Stay at the lighthouse after sundown. The scene plays by itself. |
| `side_dark.js` | `vesna_bargain/fen_mother` | 2 | Look into the steam | Stay by Vesna's cauldron after pouring. The scene plays by itself. |
| `side_dark.js` | `vesna_bargain/spring` | 1 | Give the Fen a day to settle | WAIT1 |
| `side_dark.js` | `hollis_faith/dream` | 1 | Sleep, and see whether the dream comes | SLEEP |
| `side_dark.js` | `hollis_faith/forgive` | 1 | Read the names of the lost with Hollis at the Old Graveyard | Go to the Old Graveyard. The reading plays as a scene. |
| `side_bright.js` | `star_kittens/same_sky` | 2 | Sleep in a bed | SLEEP |
| `side_bright.js` | `hatchlings/fence` | 3 | Wait two days for the eggs to hatch | Wait two in-game days. It counts while you do other things. |
| `side_bright.js` | `hearth_and_table/hearts` | 1 | Get 2 Champion's Hearts from fallen champions | Defeat champions, the named, tougher mobs that roam the realm. Each drops one heart. |
| `side_bold.js` | `wardens_oath/outpost` | 3 | Defeat Sergeant Vell | Stay at the outpost. Vell comes down after the two waves. |
| `side_bold.js` | `wardens_oath/embers` | 2 | Follow the trail of embers to the raiders' camp | Start at the burned farm. The embers drift ahead: walk after them and stay close. |
| `side_bold.js` | `wardens_oath/red_hand` | 2 | Defeat Captain Marrow, the Red Hand, at his camp (at night) | Go to the raiders' camp (on the tracker) after dark. He only comes at night. |
| `side_bold.js` | `smugglers_run/crate` | 2 | Sleep in a bed to lie low for a night | SLEEP |
| `side_bold.js` | `mayors_burden/unveiling` | 3 | Set off 3 fireworks in the town square | Use 3 firework rockets on the ground in the town square (paper and gunpowder). |
| `side_bold.js` | `mayors_burden/election` | 1 | Wait one day while Prewitt counts the votes | WAIT1 |
| `side_bold.js` | `singing_forge/dunmore` | 2 | Lay a hand on the old anvil | Stand right by the anvil at Dunmore's old forge (on the tracker). A scene plays. |
| `side_heart.js` | `heart_elsie/hearth` | 1 | Sleep a night under Elsie's roof | SLEEP |
| `side_heart.js` | `heart_bram/speech` | 1 | Set off 3 fireworks in the town square | Use 3 firework rockets on the ground in the town square (paper and gunpowder). |
| `side_heart.js` | `heart_hollis/plain_sleep` | 1 | Sleep a night, so Hollis can | SLEEP |
| `wanderers.js` | `w_anwen_survey/line` | 1 | Follow Anwen's light to the Stargazer's Ruin | Start at Anwen's camp. Her light drifts ahead: walk after it. |
| `wanderers.js` | `w_anwen_survey/rest` | 2 | Watch the stars with Anwen | Stay at the Stargazer's Ruin. The scene plays by itself. |
| `wanderers.js` | `w_rook_rival/bounties` | 2 | Beat Rook to the Brushwood Brute | The Brushwood Brute, a big zombie, comes out near you. Bring it down; there is no clock. |
| `wanderers.js` | `w_vesk_home/name` | 2 | Sleep while Vesk keeps watch | SLEEP |
| `festivals.js` | `fest_hatchlings/names` | 2 | Keep a Nest Watch (Realm Calendar) | At night, open /realm:calendar and start a Nest Watch. It counts when the watch ends. |
| `festivals.js` | `fest_tide_tobin/out` | 1 | Swim the Tide Swim (Realm Calendar) | During the Hatchling Tide, swim 100 blocks without leaving the water. |
| `festivals.js` | `fest_tide_supper/supper` | 3 | Do a Turtle Feeding (Realm Calendar) | During the Hatchling Tide, feed seagrass to turtles 5 times. |
| `festivals.js` | `fest_course/race` | 1 | Race the Regatta (Realm Calendar) | During the Regatta, sit in a boat on open water and start a race from /realm:calendar. |
| `festivals.js` | `fest_sure_thing/dive` | 1 | Make a High Dive (Realm Calendar) | During the Regatta, jump 20 blocks or more into water. |
| `festivals.js` | `fest_picnic/fruit` | 3 | Have a Midsummer Picnic (Realm Calendar) | During the Regatta, eat 3 different foods outdoors in the daytime. |
| `festivals.js` | `fest_judge/pumpkins` | 1 | Enter or vote in the Pumpkin Carve-off (Realm Calendar) | During the Lantern Fair, place a carved pumpkin to enter, or vote in /realm:calendar. |
| `festivals.js` | `fest_lanterns_ida/iron` | 2 | Let a lantern go over the water (Realm Calendar) | During the Lantern Fair, at night, hold a lantern at the water's edge and sneak. |
| `festivals.js` | `fest_ghost_story/tale` | 1 | Hear a Ghost Tale by a campfire (Realm Calendar) | During the Lantern Fair, sit within 2 blocks of a lit campfire at night for a minute. |
| `festivals.js` | `fest_falling_stars/count` | 1 | Keep the Starwatch (Realm Calendar) | During the Long Night festival, stay under the open sky at night for a minute. |
| `festivals.js` | `fest_gift_table/gifts` | 1 | Do a Gift Round: gifts to 3 townsfolk (Realm Calendar) | During the Long Night festival, sneak-tap 3 different townsfolk while holding a gift. |
| `festivals.js` | `fest_speech/line` | 2 | Keep a Candle Vigil (Realm Calendar) | During the Long Night festival, place 4 candles at night. |
| `calling.js` | `the_calling/chapel_book` | 1 | Choose your Calling: tap Hollis and pick Choose a Calling | Tap Hollis, pick Choose a Calling, then pick one. |
| `calling.js` | `the_calling/graveyard_book` | 1 | Choose your Calling: tap Moss and pick Choose a Calling | Tap Moss, pick Choose a Calling, then pick one. |

64 tips: 24 in the main story, 19 in town stories, 3 in heart stories, 4 in wanderers' chains, 12 in
festival stories, 2 in The Calling. Before adding one, check that the step at that number has the label in
the table; if it does not, the content moved: find the step by its label and report the new number.

#### D9 Town stories: gates, order, tags and recaps

Fields to add to each `side` story object (next to its `requires`, which stays as it is). `minutes` is a
rough figure; `needs` lists the walls D17's wall rule finds in the story.

| Story id | File | `opensAfter` | `weight` | `matters` | `minutes` | `needs` |
|---|---|---|---|---|---|---|
| `inn_ghost` | `side_dark.js` | `act1_signs/count` | 5 | `Matters on Lantern Night` | 90 | |
| `vesna_bargain` | `side_dark.js` | `act2_choir/mayor` | 6 | `Matters on Lantern Night` | 110 | |
| `hollis_faith` | `side_dark.js` | `act2_choir/mayor` | 8 | `Matters on Lantern Night` | 70 | |
| `wardens_oath` | `side_bold.js` | `act1_signs/choice` | 9 | `Matters on Lantern Night` | 120 | |
| `hatchlings` | `side_bright.js` | `drowned_bell/warden` | 10 | | 130 | |
| `lost_lambs` | `side_bright.js` | `drowned_bell/salt` | 20 | | 90 | |
| `one_that_got_away` | `side_bright.js` | `drowned_bell/warden` | 30 | | 80 | |
| `graveyard_shift` | `side_dark.js` | `act1_signs/graves` | 40 | | 90 | |
| `hearth_and_table` | `side_bright.js` | `act1_signs/inn` | 50 | | 130 | `["storm"]` |
| `star_kittens` | `side_bright.js` | `act1_signs/count` | 60 | | 110 | |
| `smugglers_run` | `side_bold.js` | `act2_choir/mayor` | 62 | | 80 | |
| `mayors_burden` | `side_bold.js` | `act2_choir/mayor` | 65 | | 90 | |
| `singing_forge` | `side_bold.js` | `act2_choir/letter` | 70 | | 100 | `["nether"]` |
| `edges_of_map` | `side_bold.js` | `act1_signs/count` | 90 | | 230 | `["end"]` |
| `listening_deep` | `side_deep.js` | `act3_deep/keys` | 95 | | 190 | |
| `the_calling` | `calling.js` | (none) | 0 | | | |

Rules the table follows (D17 checks them): weights above 0 are unique; every story with `matters` weighs
less than every story without; an `opensAfter` quest is a main quest with no `when`. `the_calling` has
weight 0: it is offered at its townsfolk as today and is never in "Offered now" or "Later in town".

What a player with no town story started sees open, in order: after `drowned_bell/salt`: Wren's Lost
Lambs. After `drowned_bell/warden`: Little Turtles, Wren's Lost Lambs, and later The One That Got Away.
After `act1_signs/graves`, `inn`, `choice`: Graveyard Shift, Hearth and Table, The Wardens' Oath join.
After Act I: A Room at the Inn (first), The Star Kittens, Edges of the Map. After `act2_choir/letter`: The
Forge That Sings. After Act II: The Witch's Bargain, Lamp in the Window, Smuggler's Run, The Mayor's
Burden. After Act III: The Listening Deep. Their existing `requires` (packs, `g:hollis` saved) still apply.

`Story.recap` (town stories with weight above 0; premise only, so it can be shown at any point):

| Story id | `recap` |
|---|---|
| `inn_ghost` | Room three at the inn is always cold, and guests say the toys move. There are no toys in room three. Elsie asked you to spend a night there. |
| `graveyard_shift` | You work nights for Moss the gravedigger. The dead in his yard are restless, and some are just rude. |
| `vesna_bargain` | Dead things float down the ditch from Hollow Fen every morning. Vesna's water has turned, and Moss wants to know why before he runs out of shovel. |
| `hollis_faith` | The Choir is broken, and Brother Hollis is putting the chapel, and himself, back together. He asked for your help with the windows. |
| `lost_lambs` | Wren's animals keep getting out, and she has a name for every one of them. She cannot leave the others to fetch the ones that ran. |
| `star_kittens` | Wren found seven little collars in the inn's attic, each stitched with a star's name. They were the cats of Sol's wife. Sol would like to see his old friends again. |
| `hatchlings` | Turtle tracks have come back to the beach below the lighthouse for the first time in forty years. Old Tobin means to see every egg to the sea. |
| `one_that_got_away` | Old Tobin swears he once hooked a giant fish with eyes like two green lanterns. Nobody believes him yet. |
| `hearth_and_table` | You are Bea's kitchen hand at the inn. She feeds the whole town and shouts while she does it. |
| `wardens_oath` | Warden Reyes has three recruits, Dace, Brynn and Orrin, and not nearly enough time to train them. She wants you beside them. |
| `smugglers_run` | Quill has jobs for you, and most of them are nearly legal. The first is a crate that raiders took from his wagon. |
| `mayors_burden` | It is election week, the first real one in twenty years, and Mayor Bram is not coping. The ballot box is already gone. |
| `edges_of_map` | Mara wants the blank edges of her map filled in: far stations in every kind of land, then the deep sea, then the End. |
| `singing_forge` | Ida is forging the blade her master Dunmore never could. His notes say it must be born of deep fire and quenched where souls burn. |
| `listening_deep` | Ida's lamp has started turning by itself, and it always comes to rest toward the expedition dungeons. She wants to hear what it brings home. |

#### D10 A second way past four walls

Rules for every change here: an objective is only ever **appended** to the end of the quest's
`objectives` array; existing objectives keep their place and type; an existing objective may gain `or`,
`set` or `tip`. The engine writes `Either:` / `Or:` before the labels of an `or` group itself, so labels do
not say "or".

**1. `drowned_bell/iron` (`stories.js`): glass instead of prismarine shards.**

- Objective 2 (`Bring Ida 12 prismarine shards`) gains `or: "tune"`.
- Append objective 3:
  `{ type: "deliver", label: "Bring Ida 24 glass to grind into sea-glass", npc: "ida", item: "minecraft:glass", count: 24, or: "tune" }`
- Append to `intro` (as the 4th page):
  `` `${I}No way out to the monuments? Then bring me glass, two dozen blocks. I can grind sea-glass the slow way. It takes longer, and I complain more.` ``
- `hint` becomes: `Bring the iron and the shards or glass in as many trips as you like; Ida keeps count. Guardians around ocean monuments drop prismarine shards. No monument in reach: 24 glass blocks (smelt sand) do instead.`

**2. `drowned_bell/vigil` (`stories.js`): a midnight watch instead of a thunderstorm.**

- Objective 1 (the `survive`) gains `or: "watch"`.
- Append objective 2:
  `{ type: "vigil", label: "Stand the whole watch at the lighthouse after midnight (3 minutes)", place: "lighthouse", radius: 24, seconds: 180, timeOfDay: [18000, 23000], outdoors: true, or: "watch", set: { watch: "calm" } }`
- Insert into `intro` after the third page (`${T}Two minutes of it, mind ...`) and before the
  `pack:weather_bp` page:
  `` `${T}And if the sky won't oblige, go up anyway, after midnight, and stand the whole watch. Three minutes. Dry nights have their own thunder, far out.` ``
- `outro`: the first page (`"Rain sheets across the lantern room. ..."`) becomes
  `{ text: <that same text>, when: { watch: "!calm" } }`, and right after it insert
  `{ text: "No storm comes. A little after midnight the wind drops, and far out one flash of dry lightning walks along the horizon. Under it you hear one deep note, rolling up out of the water. A ring of pale green light flickers under the waves and goes dark.", when: { watch: "calm" } }`.
  The other two outro pages stay.
- Append to `hint`: ` No storm in sight: stand outdoors within 24 blocks of the lighthouse after midnight for three minutes instead.`

**3. `act1_signs/smudge` (`stories/act1_signs.js`): glass instead of a spyglass.**

- Objective 2 (`Bring Sol a spyglass`) gains `or: "lens"`.
- Append objective 3:
  `{ type: "deliver", label: "Bring Sol 3 glass to grind a lens for his cracked spyglass", npc: "sol", item: "minecraft:glass", count: 3, or: "lens", set: { lens: "ground" } }`
- Insert into `intro` after the page that starts `${S}My spyglass cracked in the cold` and before the
  `pack:night_bp` page:
  `` `${S}No amethyst for a spyglass? Then bring me three blocks of glass and I will grind a new lens for mine. It will take all night. I have the night.` ``
- `outro`: the second page (it starts `§eSol§r takes your spyglass with both hands`) becomes
  `{ text: <that same text>, when: { lens: "!ground" } }`, and right after it insert
  `` { text: `§eSol§r grinds your glass against a wet stone until the stars come out, fits it to his cracked spyglass and looks for a long time. When he lowers it his eyes are wet.\n\n${S}You saw it too. Then it's not my wishes. Something is coming home.`, when: { lens: "ground" } } ``.
- Append to `hint`: ` No amethyst yet: 3 glass blocks (smelt sand) do instead, and Sol mends his own.`
- The reward (Sol's Polished Spyglass) is unchanged, so `act1_signs/count` still has a spyglass to use.

**4. `act3_deep/echoes` (`stories/act3_deep.js`): the diggers' crates instead of 4 echo shards.**

- Append objective 4 (objectives 2 and 3 are already the group `shards`):

```js
{
  type: "inspect",
  label: "Search the diggers' crates at the mine for echo shards (3)",
  place: "old_mine",
  radius: 16,
  or: "shards",
  set: { shards: "dig" },
  clues: [
    { dx: -3, dz: 8, text: "A crate of broken picks. Every head is chipped the same way, as if they all struck the same hard thing." },
    { dx: 3, dz: 8, text: "A crate of gray candles and a tally board: SHARDS FOUND, and four strokes. The fourth stroke is fresh." },
    { dx: 1, dz: 10, text: "The third crate is packed with straw. In the straw, four dark crystals hum against each other, the same note as Fenn's." },
  ],
  hint: "Sneak past the diggers first. The three crates stand at their dig and glow faintly: walk up to each one and tap near it.",
},
```

- `outro`: the first two pages change their `when` from `{ shards: "!depths" }` to `{ shards: "city" }`.
  After the fourth page (the second `{ shards: "depths" }` page) insert two pages:
  - `{ text: "At the Choir's dig the crates are still nailed shut. In the third one, packed in straw, four dark crystals hum against each other. The diggers found their echoes. They never got to carry them out. Under the straw lies a hymn page with one line circled: THE STONE REMEMBERS THE NOTE.", when: { shards: "dig" } }`
  - `` { text: `§eIda§r lays the four shards from the crate in a ring around Fenn's. The humming changes. It becomes five voices, then a crowd, then something almost like words.\n\n${I}There. Hear it? Building. Somebody, long ago, building something down deep. And singing while they did it.`, when: { shards: "dig" } } ``
- Append to `intro` (as its last page):
  `` `${I}And if the old cities are out of reach: the diggers have been at it for weeks. If they have pried any echoes loose, they will be crated up at the dig. Take them. I will not ask how.` ``
- Append to `hint`: ` No ancient city in reach: sneak past the diggers and search the three crates at their dig instead; they glow faintly.`
- `stories/side_deep.js` reads `act3_deep.shards` as `depths` / `!depths` only; `dig` reads as `!depths`,
  which is right. Nothing there changes for this.

A player who finished the group before this release has `shards` set to `city` or `depths`, so one of the
old page pairs still shows.

#### D11 `g:hollis` = `shaken`

`stories/act2_choir.js`, quest `hollis_night`, choice `watch` (`"Leave him to rest and keep watch"`, the
only choice on the song path): add `set: { "g:hollis": "shaken" }`. Nothing else changes: every reader
tests `saved`, `lost`, `!saved` or `!lost`. `act3_deep/herald` still sets `saved` or `lost` over it.
Players who took the song path before this release keep `g:hollis` unset; D5 entry 9 covers them. No save
is rewritten.

#### D12 Renames

Ids never change (`gnasher`, `long_night`, `listening`, `partners`, `choir`, `dawn_*`, the champion tag
`realm:saga:w_gnasher_spider`, codex ids). Replace exactly these strings; the line numbers are for
`master` at 470be3d.

| # | File | Old | New |
|---|---|---|---|
| R1 | `stories.js:98` | `title: "The Drowned Choir"` | `title: "The Drowned on the Shore"` |
| R2 | `stories/act2_choir.js:282` | `your name is Barnaby, you owe me eleven silver, and you're simple. Say nothing. Barnaby says nothing. Barnaby has never said anything` | `your name is Nobby, you owe me eleven silver, and you're simple. Say nothing. Nobby says nothing. Nobby has never said anything` |
| R3 | `stories/act3_deep.js:201` | `Jory, Brann and little Tam Hask` | `Jory, Corry and little Wil Hask` |
| R4 | `stories/act3_deep.js:172` | `Tam drew this the night before` | `Wil drew this the night before` |
| R5 | `stories/act3_deep.js:87` | `${I}Lantern of the Deep. Don't drop it.` | `${I}The Echo Lamp. Don't drop it.` |
| R6 | `stories/act3_deep.js:93` | `name: "Lantern of the Deep"` | `name: "Ida's Echo Lamp"` |
| R7 | `stories/act3_deep.js:97` | `the Lantern of the Deep, which plays` | `the Echo Lamp, which plays` |
| R8 | `stories/act3_deep.js:106` | `title: "Lantern of the Deep"` | `title: "The Echo Lamp"` |
| R9 | `stories/side_deep.js:29` | `Ida's Lantern of the Deep has started` | `Ida's Echo Lamp has started` |
| R10 | `stories/side_deep.js:38` | `has the Lantern of the Deep hanging` | `has the Echo Lamp hanging` |
| R11 | `stories/side_deep.js:64` | `An echo the Lantern of the Deep played` | `An echo that Ida's Echo Lamp played` |
| R12 | `stories/side_deep.js:213` | `the Lantern of the Deep is silent` | `the Echo Lamp is silent` |
| R13 | `stories/side_deep.js:226` | `the Lantern of the Deep went quiet` | `the Echo Lamp went quiet` |
| R14 | `stories/act5_lantern.js:389` | `title: "The Long Night"` (the quest `long_night`) | `title: "Hold the Lighthouse"` |
| R15 | `stories/act5_lantern.js:494` | `title: "The Long Night"` (its codex entry, id `long_night`) | `title: "Hold the Lighthouse"` |
| R16 | `stories/act5_lantern.js:1022` | `the Long Storm and the Long Night took` | `the Long Storm and Lantern Night took` |
| R17 | `stories/act5_lantern.js:797` | `title: "Dawn"` (quest `dawn_relight`) | `title: "Dawn: The Lantern"` |
| R18 | `stories/act5_lantern.js:864` | `title: "Dawn"` (quest `dawn_gift`) | `title: "Dawn: The Star"` |
| R19 | `stories/act5_lantern.js:920` | `title: "Dawn"` (quest `dawn_crown`) | `title: "Dawn: The Crown"` |
| R20 | `stories/side_heart.js:639` | `title: "The Listening Stone"` (quest `heart_ida/listening`) | `title: "The Quiet Seam"` |
| R21 | `stories/wanderers.js:435` | `title: "Partners"` (quest `w_rook_rival/partners`) | `title: "Even"` |
| R22 | `stories/wanderers.js:298` | `The old lady. Old Gnasher. The biggest spider` | `The old lady. Old Rimejaw. The biggest spider` |
| R23 | `stories/wanderers.js:317` | `title: "Old Gnasher"` (quest `w_brannoch_deep/gnasher`) | `title: "Old Rimejaw"` |
| R24 | `stories/wanderers.js:323` | `label: "Defeat Old Gnasher at the Abandoned Mine"` | `label: "Defeat Old Rimejaw at the Abandoned Mine"` |
| R25 | `stories/wanderers.js:323` | `name: "Old Gnasher", trait: "frostbound"` | `name: "Old Rimejaw", trait: "frostbound"` |
| R26 | `stories/wanderers.js:323` | `in the dark. Old Gnasher!` | `in the dark. Old Rimejaw!` |
| R27 | `stories/wanderers.js:330` | `title: "Gnasher's Bane"` | `title: "Rimejaw's Bane"` |
| R28 | `stories/wanderers.js:330` | `title: "Old Gnasher", text:` (the codex entry `w_brannoch`) | `title: "Old Rimejaw", text:` |
| R29 | `stories/wanderers.js:330` | `the great spider Old Gnasher guarded it` | `the great spider Old Rimejaw guarded it` |
| R30 | `stories/wanderers.js:332` | `hint: "Old Gnasher comes when` | `hint: "Old Rimejaw comes when` |

After the renames these must hold:
`grep -c "Lantern of the Deep" packs/saga_bp/scripts/stories/act3_deep.js packs/saga_bp/scripts/stories/side_deep.js`
prints 0 for both; `grep -c "Gnasher" packs/saga_bp/scripts/stories/wanderers.js` prints 0;
`grep -c "Barnaby" packs/saga_bp/scripts/stories/act2_choir.js` prints 0. Tobin's fish in
`side_bright.js` stays Old Gnasher, Barnaby Pike in `side_dark.js` stays, Brother Tam in
`act1_signs.js` stays, the Long Night festival in `festivals.js` stays, and `heart_quill/partners` keeps
its title.

#### D13 Act IV's talk buttons (`Choice.flavor`)

`stories/act4_seals.js`: add `flavor: true` to these 21 intro choices (each has `id`, `label` and `reply`
only; `ask_hollis` also has `requires`, which stays):

| Quest | Intro choice ids |
|---|---|
| `tide_vault` | `ask_vaults`, `ask_scared` |
| `tide_boat` | `ask_boat`, `ask_elder` |
| `stone_door` | `ask_master`, `ask_miners` |
| `stone_frame` | `ask_scared`, `promise_watch` |
| `stone_light` | `ask_letters`, `ask_wrong` |
| `sky_stair` | `ask_heights`, `ask_ring` |
| `sky_bridge` | `ask_vexes`, `ask_phantoms` |
| `sky_vision` | `ask_afraid`, `ask_stars` |
| `promise` | `ask_mother`, `ask_wren` |
| `gate` | `ask_town`, `ask_hollis`, `ask_choir` |

No other choice in any file gets `flavor`. Intro choices that set something (`act1_signs/choice`,
`act2_choir/hollis_night`, `act5_lantern/gate`) are decisions and stay as they are.

#### D14 The town board (daily favors)

World option `favorBoard` (whole number 0 to 12, default 3). 0: every questgiver offers a favor each day,
exactly as today. Above 0: only that many questgivers do. How the board is chosen, exactly:

1. `seed`: the player's party tag (the tag that starts `realm_party:`) when they carry one, else their
   player id. Party mates therefore share a board.
2. `day`: `today()` from `data.js` (the UTC day number until workstream 12 gives it the reset hour).
3. `npcs`: the keys of `favorsByNpc`, in the order that map holds them (the order questgivers first
   appear in `stories/favors.js`).
4. For a questgiver, the eligible templates are that questgiver's templates whose `board` is not `false`
   and whose `when` holds for this player (`matches(f.when, saga, "fv:" + npc)`; with no `saga`, `when` is
   not tested). A questgiver "has" a favor when at least one is eligible.
5. The board is `boardNpcs(seed, day, npcs, favorBoard, has)` (D2).
6. A board questgiver's favor today is `eligible[fnv(seed + "|" + npc + "|" + day) % eligible.length]`.

`favorOfDay(playerId, npc, day, saga)` keeps its signature. With `favorBoard` 0 it does what it does
today (hash of `${playerId}|${npc}|${day}` over every template whose `when` holds, `board` ignored). Above
0 it returns the favor of step 6 when `npc` is on the board of steps 1 to 5, else `undefined`. Every
caller (`favorOffer`, `favorStart`, `favorsPage`, and what 02 and 03 added) therefore follows the board
without being changed.

Accepted favors are untouched: an accepted favor is read from `saga.fv[npc].id` (`ownEntries`,
`data.js:841-853`), never from `favorOfDay`, and `favorOffer` answers `In progress` / `Done: report back`
before it looks at the day. A questgiver who is not on today's board still takes the report of a favor
accepted earlier. "Done or turned down today" (`fs.d >= day`) is unchanged. A player who changes party
during a day gets the new party's board; more than 3 favors in one day are possible that way and that is
accepted.

#### D15 Live flags in `realm:npc_flags`

Three keys are added to the `flags` object `sendFlags` builds (`main.js`). They are computed, never
saved, and absent when they have no value:

| Key | Value |
|---|---|
| `g:part` | The part id of the main quest the spine is on (`mainNext(saga)`, D16): `"1A"` for a new player, absent when the main story is finished. |
| `g:next` | The townsfolk id the main story needs next: when that quest is accepted, who hears its report (`chapter.end ?? chapter.npc ?? story.giver`); otherwise who tells it (`chapter.npc ?? story.giver`). Absent when the main story is finished. |
| `g:nights` | `String(nights(read))` (D6): `"60"`, `"45"`, `"30"`, `"20"`, `"15"`, `"10"`, `"3"`, `"1"`, `"0"`; absent when `nights` is undefined. |

With these the message holds at most 45 flags (Townsfolk keeps 64).
