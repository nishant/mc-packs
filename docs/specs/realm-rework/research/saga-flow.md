# Story Questlines: how a player joins, resumes and picks quests (research for the spec)

Read-only research, 2026-11-15. Pack: `packs/saga_bp` 1.16.25 (`manifest.json`). All paths are under
`/home/user/mc-packs`. Claims are marked **[read]** (verified by reading the code named) or **[suspected]**
(follows from the code but not run, or depends on the client). Nothing was run on BDS. Numbers about the
content come from loading `packs/saga_bp/scripts/stories.js` in Node (pure data, no Minecraft imports).

Contents: 1 menu tree, 2 availability model, 3 returning player, 4 group play, 5 saved data, 6 bugs,
7 other packs that offer things to do, 8 redesign, 9 tests, 10 alternatives rejected, 11 unknowns.

---

## 0. The short version

- The story has no front door. `/realm:saga` opens a five-section log (`Current quests`, `Available`,
  `Finished`, `Codex`, `Daily favors`); the answer to "what do I do now" is two more taps down, and its
  one-line summary on the home page is wrong in the most common resume state (6.1).
- The tracker (quest box, Minimap star) only knows *accepted* chapters. 35 of the 61 chapter-to-chapter
  transitions in the main story hand you to a different NPC, and in that state (and for a new player, and
  after "Not now") the tracker is blank and nothing points anywhere. One chat line said where to go, once.
- Nothing is time-aware: no last-seen stamp, no recap, no login line. Outros can never be reread. Daily
  favors accepted weeks ago never expire and can sit on top of the tracker.
- Choice: a new player has 13 startable stories (6 of them wanderers who cannot be found on purpose) plus
  12 daily favors, with no cap on how many are active; `Available` is one text page of 54 entries.
- Party play is automatic and all-or-nothing: being in a party rewires your main story to the online member
  who is furthest behind, anywhere in the world, with popups for mates who may be in a fight; the only way
  out is to leave the party. Any member can accept, report, choose and retarget everyone's tracker.

---

## 1. What `/realm:saga` does today (every menu, in order)

Registration: `main.js:631-634` (`realm:saga` -> `showMenu`), `main.js:635-638` (`realm:saga_log` ->
`currentPage`). Both run through `withPlayer` (`main.js:596-608`). Forms use `show()` (`util.js:202-213`):
retries `UserBusy` 20 times, gives up after `FORM_TICKS` = 900 ticks (45 s, `util.js:97`), and ends on death,
leave or dimension change (`lifecycle`).

### 1.1 The tree **[read]** `ui.js:1667-1840`

```
/realm:saga                                  ui.js:1667 showMenu
  title "Story Log" (bold)
  body:  [paused line when disabled]
         "Now: <story title>"  +  "Current step: <stepLine>"         (an accepted chapter exists)
      or "Talk to <giver of available[0]> to start <available[0].title>."   (none accepted)
      or "No story in progress."
  buttons:
  1 "Current quests (N)"                      -> currentPage      ui.js:1704
       title "Current quests"
       body "Pick one for its objectives, Track this quest or Stop tracking, a hint, and the intro again."
       one button per story in progress: "[Tracked] <Title>\n<step, cut at 60 chars>"
            (main stories bold; "Party: " prefix for a party quest; "[Not tracked]" when stopped)
       one button per accepted favor / stranger's job
       "Back"
       -> chapterInfo (ui.js:762)   title <story title>
            body: "Chapter 2 of 6: <title>", tone tags, "Current step: ...", every objective line with
                  progress and "(<place> NE 240m)", order note, party note
            buttons: "Track this quest\nThe tracker follows it[, for your party too]"
                     "Stop tracking\nHide it from the tracker and map"
                     "Ask for a hint\nCosts N levels, M Crowns" | "Ask for a hint\nFree" | "Read the hint again"
                         -> "Ask for a hint?" confirm ("Ask for the hint" / "No, I'll manage") -> "Hint" page ("OK")
                     "Hear the intro again"  -> the intro pages ("Next"... "OK")
                     "Answer: <riddle>"      (riddles answerable from the log)
                     "OK"
          a story between chapters has no buttons at all: body "Talk to <npc> <dir> to begin this chapter." + "OK"
       -> favorInfo (ui.js:974): "OK", "Give up this favor", track buttons
       -> wanderInfo (ui.js:1076): "OK", track buttons, "Give up this job"
  2 "Available (N)"                           -> availablePage    ui.js:1742
       ONE text page, no buttons but "Back":
       "Ready to start" then per story: "<Title> [tones]\n<summary> Talk to <giver> <dir>."
       "Later" then per locked story: "<Title>: <what it needs>."
  3 "Finished (N stories, M quests)"          -> finishedPage     ui.js:1769
       label "Stories (N)" + a button per finished story ("<Title>\nK choices made")
       label "Quests (M)" + a button per story still going ("<Title>\nn of m quests done")
       -> text page: chapter titles, "Your choices", "The ending: ..."  ("Back")
  4 "Codex (N)"                               -> codexPage        ui.js:1802  (a button per entry -> text)
  5 "Daily favors"   (when favors are on)     -> favorsPage       ui.js:1825  (one text page, 12 lines, "Back")
  6 "Story places\nOperators"   (ops, dark red)
  7 "Operator tools\nOperators" (ops, dark red) -> opTools ui.js:1895
  8 "Close"
```

`/realm:saga_log` jumps to node 1 (`Current quests`).

### 1.2 The other half of the flow: the NPC **[read]**

Chapters are only ever started and ended at a townsfolk. `npc_bp/scripts/main.js:1065-1128` (`tapped`)
sends `realm:npc_talk`, waits 4 ticks for `realm:npc_offer` answers (max 16, `MAX_OFFERS`, line 80), sorts by
`order` then label, and shows one ActionForm: greeting, affinity line, the offers, `Goodbye`.

Saga's offers (`ui.js:267-288 offersAt`, labels from `offerFor` 222-243, `favorOffer` 246-261,
`wanderOffer` 291-307):

| Button | When | order |
|---|---|---|
| `Answer: <riddle>` | a riddle step waits at this NPC | 19 |
| `Main story: <Title>` + `New story` / `Chapter N: <title>` / `Done: report back` / `Waiting for your party` | main | 20 |
| `Story:` / `Heart story:` / `Wanderer:` / `Festival:` + the same second lines | others | 21 |
| `Request: <title>` or a hostile's label | a stranger | 22 |
| `Daily favor: <label>` (+ `In progress` / `Done: report back`) | favors on | 25 |

Other packs put buttons in the same list with overlapping orders: Market 10, Kitchen 15, `Buy a treasure
map` 20, `Your treasure hunt` 21, `Rent a bed` 20, `Hear the news` 21, `Sell fish` 20, `Fish records` 21,
`Festival Ribbon stall` 25, `Guild hall` 30, `Town projects` 30+, `Bounties` 40, `Relic forge` 40, `Forecast`
40, then Townsfolk's own `Give <item>` 0, `Ask about...` 90, `Who lives here?` 95 (grep `realm:npc_offer` in
`packs/*/scripts/main.js`). Ties sort alphabetically, so `Hear the news` sits between `Main story:` and
`Story:` at the inn. Nothing marks which offer is "the one to take now".

Accepting: `startChapter` (`ui.js:597-641`): the intro pages one at a time with `Next` (4.1 pages on
average, 17 at most), then `Accept` / `Not now`, or the intro choices plus `Not now` (16 chapters). Then chat
lists the steps (`accept`, `ui.js:647-699`), and the tracker takes over.

Reporting: `endChapter` (`ui.js:812-882`): outro pages, then `Finish the chapter` / `Finish the story` or the
choices (39 chapters). When the *same* NPC tells the next chapter its intro opens right away
(`continueWith`, line 873/881). Otherwise the player gets one chat line,
`[Story] Next: talk to <npc> for "<title>".` (`complete`, `ui.js:926`), and nothing else.

### 1.3 Taps from "I just logged in" to "I know where to go and I am walking"

| State when you log in | What the screen shows without a tap | Taps to an answer |
|---|---|---|
| **A.** A chapter is accepted, its next step has a place in your dimension | Quest box bottom right: `[>] <step> NE 240m`; Minimap gold star. | 0. This case works. |
| **A2.** Accepted, next step is a townsfolk whose entity is not loaded (you are away from town; the exact distance depends on the Realm's simulation distance, **[suspected]** well under 100 blocks) | Box: `[>] Ask Warden Reyes ... (Warden Reyes: /realm:npc)` or `> report to Old Tobin` with **no direction** (6.2). The Minimap star does point (it has its own NPC list). | 0 if you read the compass strip; the box itself does not help. |
| **A3.** Several accepted | The box follows the one accepted *last*, which can be a three-week-old daily favor (6.4). The main story is a one-line "other quest". | 3 to retarget: `/realm:saga` > Current quests > story > Track this quest (4 with the item). |
| **B.** Between chapters (the next chapter is told by another NPC, or you said `Not now`, or a party mate reported for you) | **Nothing.** Box cleared, no star (`main.js:107-110`). | Type `/realm:saga` (or item > `Story & Adventure` > `Story Log`, 3 taps); the home line names the wrong story (6.1); `Current quests` > the story says `Talk to Ida the Relicsmith to begin this chapter.` (direction only when Ida is loaded); `OK`, `Back`, `Close`. 5 taps to read it, 3 to close, and still no arrow. An arrow needs `/realm:map` and picking Ida as a destination. |
| **C.** Nothing started (new player, or everything accepted is done) | Nothing. The Welcome popup says `Tap Old Tobin or Mara in town to begin`. | `/realm:saga` shows `Talk to Old Tobin to start The Drowned Bell.` with no direction. |

Through the Realm item (`admin_bp/scripts/main.js:529-548`, `presets.js:53-57`): use item (1) >
`Story & Adventure` (2) > `Story Log` (3) > `Current quests` (4) > the story (5). The main menu has no
story entry; `My Preferences` is hard-wired on top (`main.js:537`).

---

## 2. The availability model

### 2.1 What exists **[read, counted from the data]**

59 stories, 252 chapters, 607 objectives: 7 main stories / 68 chapters (two prologue stories `drowned_bell`
and `last_map`, both `kind: "main"`, `act: 0`, then acts 1-5), 16 side / 91, 12 heart / 48, 8 wanderer
chains / 29, 16 festival / 16 (one chapter each), plus 48 daily favors (4 per NPC, 12 NPCs), 24 stranger
templates and 4 hostiles. (`docs/PACKS.md` says 42 / 234: it leaves out the festival chapters and The
Calling.)

### 2.2 How many can be offered, how many active **[read]**

- **No cap anywhere.** `startChapter` (`ui.js:597-641`) checks only that the chapter is the story's
  current one, the story's `requires`, the party hold and the pack scan. `ownEntries` (`data.js:818-868`)
  lists every story with `st.a`, every accepted favor and the one stranger's job.
- **One accepted chapter per story**, chapters strictly in file order filtered by `when`
  (`currentChapter`, `data.js:627-636`). So the theoretical maximum is 59 chapters + 12 favors + 1 job.
- Startable without any flag, by progress (simulated from `requires.stories`):

  | Progress | Startable | of which | Extra behind flags |
  |---|---|---|---|
  | new player | 13 | 2 main, 5 side, 6 wanderer | 4 heart (affinity), 16 festival |
  | Drowned Bell done | 14 | 1 main, 6 side, 7 wanderer | 5 heart |
  | prologue done | 15 | 1 main, 7 side, 7 wanderer | 6 heart |
  | act 1 done | 19 | 1 main, 10 side, 8 wanderer | 8 heart |
  | act 2 done | 22 | 1 main, 13 side, 8 wanderer | 11 heart |

  Plus 12 daily favors a day (one per NPC, `favorOfDay`, `data.js:147-154`), on top of Daily Quests' 3 and
  the Bounty Board's 4.

### 2.3 Gates **[read]** `data.js:566-599 requires`

- `requires.stories` (finished stories): the whole main chain and most side stories.
- `requires.chapters` ("story/chapter").
- `requires.flags`: `g:aff_<npc> >= 3` (heart stories: be Close with the townsfolk), `cal:festival`
  (festival chapters, only while the festival runs), `g:hollis`, `g:ending` (earlier choices),
  `g:calling_ready` + `pack:skills_bp` (The Calling), `pack:expedition_bp` (The Listening Deep).
- `requires.rep` (guild reputation, read from the `rep_<guild>` scoreboard) and `minCount`.
- Chapter `when` (39 chapters, 19 of them in the main story: acts 2, 4 and 5 branch on choices).
- There is **no level gate, no time gate, no "recommended level", no difficulty label**. Tones
  (`[mystery] [eerie]`) are the only descriptor. Acts are gated only by finishing the act before.
- In a party, a main chapter other than the party's is on hold (`onHold`, `data.js:795-798`).

### 2.4 Who offers, and how a player finds them **[read]**

Only NPCs: the chapter's `npc` (default the story's `giver`) starts it, `end` (default `npc`) ends it
(`offerFor`, `ui.js:228-229`). The 12 townsfolk stand at posts set by an operator (`/realm:npc_add`).
Finding one: `/realm:npc_who`, the Minimap radar within 64 blocks, or the Minimap star when an accepted
chapter targets them. Townsfolk broadcasts every post (`realm:npc_places { folk: [{ id, n, dim, x, z }] }`,
`npc_bp/scripts/main.js:248-285`), the Minimap listens (`map_bp/scripts/main.js:2531`), **saga does not**:
its own text knows an NPC's position only while the entity is loaded (`npcAt`, `ui.js:91-104`, a
`getEntities` by tag). Recurring Wanderers are met at random on the road ("about twice an hour of
exploring", PACKS.md Wanderers), never findable on purpose until their camp exists.

### 2.5 The tracked quest and the tracker **[read]**

- `saga.tr` = the story id the player picked with `Track this quest` (`trackQuest`, `ui.js:349-366`); it is
  sticky per story across chapters. `saga.ut` = ids hidden with `Stop tracking` (max 40).
- Which quest is on top: `trackedFirst` (`ui.js:398-406`): the tracked one, else in a party the party's
  chapter, else **the entry with the newest `st.t`** (accept time), favors and jobs included.
- The loop: `main.js:70-121`, once a second, each player every 2 s (`TRACKER_RUNS`), or the run after
  progress (`progressed`). `track()` (`ui.js:1356-1399`) builds one line per entry with `trackLine` /
  `pointAt` (1196-1283): a sky event to chase first; `report to <npc>` when the chapter is done; else the
  nearest located open step, or a timed one; optional steps only when nothing required has anything.
- The quest box (`questBox`, `ui.js:1520-1549`; `layoutBox` 1566-1597): Side HUD's quest slot next to the
  player's `trackerAt` box (default Right 4), 10 rows of about 32 characters and 502 bytes. Lines:
  `<short>: <chapter title>`; `Steps, in any order:` / `Steps, one at a time, in order:`; `[>]` the focused
  step with ` NE 240m` / `(you're here)` / `in the Nether` / `1:20 left` / `(hint available)`; `[ ]` other
  open steps; `[ ] Then:` later steps; `[x]` done; a party line; one line per other quest; `+2 more ... in
  /realm:saga` when it overflows.
- Guidance that exists: `bearing()` (`ui.js:107-113`) gives an 8-point compass direction and meters in the
  same dimension; `realm:track { player, label, dim?, x?, z?, npc? }` (`sendTrack`, `ui.js:1332-1344`) feeds
  the Minimap's gold star (compass strip, `<star> Mara 57m`); quest spot outlines within about 40 blocks
  (`questGuides`, `objectives.js:350`); a travel tip over 600 blocks (`travelTips`, `ui.js:448-458`);
  `Ask for a hint` gives exact coordinates for 25% of the chapter's levels and Crowns.
- Guidance that does not exist: anything for a chapter that is not accepted yet (the NPC to talk to next),
  anything for a story that is available but not started, and a direction in saga's own text for an NPC
  that is not loaded.

---

## 3. What a returning player sees after weeks away

**[read]** `main.js:742-755`: the only thing saga does on `playerSpawn` with `initialSpawn` is
`wanderJoined` (drops a stale stranger). There is:

- **No last-seen stamp** in saga's data (the `Saga` typedef, `data.js:41-50`, has none; the only times are
  `st.t` accept time and `st.fin`). `news_bp` keeps its own `lastSeen` and says `Welcome back! You were away
  3 weeks.` (`news_bp/scripts/main.js:186-205`), but packs cannot read each other's data.
- **No recap.** The intro of the *current* chapter can be replayed (`Hear the intro again`,
  `ui.js:793`). An outro, or anything from a finished chapter, can never be read again: `Finished` shows
  chapter titles and the labels of the choices made (`ui.js:1793-1796`). The Field Journal's Story page
  is also only titles. A mate whose chapter was reported by someone else never saw the outro unless the
  listening-in popup happened to be open (4.6).
- **No recommended next step** beyond the home line of `/realm:saga`, which is wrong between chapters
  (6.1), and the tracker, which is blank between chapters (1.3 B).
- **No login nudge from saga.** What does arrive on join, from other packs: the Welcome popup (every join
  by default, about 2 s in, static text), a News popup when there is unseen news, `You have 2 daily quests
  to finish: /realm:quests` (about 10 s), `You have N unread letters`, a festival or siege line.
- **Stale leftovers on top.** Accepted daily favors never expire: `tidyFavors` (`ui.js:1026-1038`) only
  deletes claimed or never-accepted ones, so a favor accepted three weeks ago is still an entry, and because
  the tracker follows the newest `st.t` it can outrank the main story. That NPC also offers no new favor
  until the old one is done or given up (`favorOffer`, `ui.js:250-256`). A stranger's job is dropped after
  3 days (`wander.js:26`), favors have no such rule.
- A returning player in state A gets a correct quest box with zero context (which story, why, what
  happened before); in state B or C they get an empty screen.

---

## 4. Group play today

Code: `party.js` (the party story), `ui.js:460-699` and `812-882` (accept and report once),
`objectives.js:558-584` (the 64-block share), `objectives.js:1700-1760` (shared scenes). Parties come from
`party_bp` as the tag `realm_party:<code>`; saga reads only the tag (`partyTag`, `party.js:26`) and never
learns who the leader is (party_bp does broadcast it: `realm:party_members { code, l, m }`).

### 4.1 The rules as coded **[read]**

1. **Automatic.** Once a second (`partyTick`, `party.js:172-243`) every online player with the same tag
   is grouped; with two or more online the party has one main-story chapter: the *earliest* frontier among
   them (`party.js:193`, `frontier` 99-118: first unfinished main chapter in story order). There is no
   opt-in; a chat line tells you (`tell`, 224-231).
2. **Members on that chapter** share all progress anywhere in the world (`share`, `party.js:261-294`):
   counts add, time and distance take the furthest, single steps are done for all, `collect` is done once
   one carries the items (`modeOf`, 125-148).
3. **Members past it, or who have not accepted it**, get an in-memory "party quest" (`partyQuest`,
   160-163; `Entry.pq`). Their own main chapter is hidden from `entries()` (`data.js:811`), makes no
   progress and is not offered: the NPC says `Waiting for your party` (`ui.js:233`). Helpers cannot do 12
   step kinds (`SOLO`, `objectives.js:524`: meet, inspect, stealth, escort, lead, defend, follow, vision,
   answer, wait, sleep, wear), get no reward, and a free hint (`hintCost`, `ui.js:706`).
4. **Accept once** (`accept`, `ui.js:647-672`; `acceptFor` 527-556): whoever talks to the NPC accepts the
   party's chapter for every mate who could take it, with the talker's intro choice applied to all. Mates
   get a "listening in" popup (`listenIn`, 490-516) with every page in one body; it is closed by
   `uiManager.closeAllForms` when the talker finishes.
5. **Report once** (`endChapter`, `ui.js:850-871`; `reporters`, `party.js:80-90`): the talker's report
   completes the chapter for every mate who is on it and done, with the **talker's choice**, each with their
   own rewards. A mate for whom the choice has a cost or whose `requires` fail is skipped and told
   (`choiceFits`, `ui.js:433`).
6. **Side and festival stories** (`together`, `party.js:40-44`, with `partyShare`): when one member starts
   a chapter, mates whose *next chapter is that same chapter* get a `Party: join a story?` popup for 60 s
   (`inviteSide`, `ui.js:563-594`). Progress is shared only for **defeat, reach, collect and survive**, only
   within `partyRange` 64 blocks in the same dimension (`mates` + `share`, `objectives.js:558-584`; call
   sites 1179, 1322, 3604, 3619, 3627). Reports count for mates who are done, anywhere.
7. **Heart stories, wanderer chains, favors, strangers' jobs** are personal.
8. **Scenes** (guards, an escort, waves, a wisp, a character to meet, spawned fights) are one per party per
   step (`sceneOwner`, `objectives.js:1735`).
9. **Tracking**: `Track this quest` sets the tracked quest for every online mate on the same story
   (`trackQuest`, `ui.js:357-365`). `Stop tracking` is personal.

### 4.2 Every messy case found

| # | Case | What happens | Evidence |
|---|---|---|---|
| G1 | A friend with no progress joins a party of two in act 2 | Everyone's main story snaps to `The Drowned Bell, "Salt and Silence"`. The two veterans' own chapter disappears from the tracker and stops counting. The only way to play their own chapter is to **leave the party** (losing the party HUD, chat, shared claims). | `party.js:193`, `data.js:811`, `holdNote` `ui.js:340` ("or until you leave the party") **[read]** |
| G2 | The friend furthest behind is online but building, or AFK | Same as G1 for as long as they are online. If they have not accepted the chapter, `real.size` is 0, so helpers get **no party quest either**: no main quest in their tracker at all, just one chat line. A helper cannot accept the chapter for them (`startChapter` only works for one's own next chapter). | `party.js:215` (`!real.has(p.id) && real.size`), `party.js:234` **[read]** |
| G3 | Members log in and out | The party chapter is recomputed from who is online. It can flip several times an evening, each with a `[Party] Party story: ...` line and a different tracker. A chapter in progress is dropped mid-way for an earlier one. | `party.js:177-193` **[read]** |
| G4 | A mate was done but offline when the chapter was reported | They stay on it. When they log in the party goes back to that chapter until they walk to the NPC; everyone else's next chapter is on hold meanwhile. | `reporters` only sees online mates, `frontier` reads saved state **[read]** |
| G5 | Two members at the same point on different branches (act 4's three seals in different orders; the two prologue stories done in different order) | The one whose chapter comes first in the file is "behind"; the other "helps" with a chapter they still have to do themselves later, and the roles swap afterwards. Both are told the other is behind. | `party.js:193` compares `si` then `index` only; act 4 has 9 branch chapters, act 5 has 8 **[read]**, effect **[suspected]** |
| G6 | Who picks | Nobody and everybody. Any member on the chapter can accept it, report it, make the choice that sets everyone's flags, and retarget every mate's tracker. There is no leader and no vote. | `accept`, `endChapter`, `trackQuest` **[read]** |
| G7 | Choices | 22 main chapters end in a choice and 13 start with one. The talker decides for all, including act endings. Mates learn it from a chat line (`... and chose: <label>`). This is also what keeps a party on one branch (G5), so "everyone chooses for themselves" would split the party. | `ui.js:851-862`, counted **[read]** |
| G8 | Popups reach mates anywhere | The listening-in popup and the side-story `Join?` popup go to every online mate regardless of distance or dimension, as a form that covers the screen (up to 2 minutes, 60 s). A mate in a fight or flying gets it too. | `partyMates` has no range (`party.js:29-32`); `listenIn` skips only dead/busy mates (`ui.js:494`) **[read]** |
| G9 | The popup closes when the talker is done | A talker who knows the text taps through in seconds; the mates' copy closes under them (`heard()` right after accepting, `ui.js:673`). They can replay the intro, never the outro. A mate who had another form open got chat only. | `ui.js:490-516`, 673, 872 **[read]** |
| G10 | Side stories at different chapters | No invite, no sharing, no party quest: silently nothing. Sharing needs the same `story:chapter:i` key. | `canTake` `party.js:51-59`, `objKey` **[read]** |
| G11 | Side stories share four step kinds within 64 blocks | Mining, fishing, delivering, placing, tending, interacting and talking are each player's own, while the box says `Party: mates within 64 blocks share progress.` The main chapter shares everything everywhere. Two different rule sets in one party. | `objectives.js:572-584` and its 5 call sites; `partyLine` `ui.js:1507` **[read]** |
| G12 | A side story of seven chapters | The `Join?` popup comes again for every chapter (the main story auto-accepts for mates). | `accept` -> `inviteSide`, `ui.js:697` **[read]** |
| G13 | Members far away | On the main chapter one member can finish every step; the others get `[Story] <step>: done.` lines and miss every scene (a meet, a vision). Fine as a rule, but nothing lets them read what happened (no recap). | `modeOf` returns "done" for single steps **[read]** |
| G14 | Helpers | A member ahead replays an old chapter for nothing: no levels, Crowns or reputation, and on 44 of 68 main chapters at least one required step is one a helper cannot do (4 chapters are helper-proof entirely). | `SOLO`, counted **[read]** |
| G15 | Nothing needs everyone | No step requires all members; there is no "gather the party" moment. A step done by one is done for all. | `modeOf` **[read]** |
| G16 | The helper's log | `Current quests (N)` does not count a party quest for a story the helper already finished, though the page lists it. | `ui.js:1684` vs `1712` **[read]** |
| G17 | A member on the chapter with a step of their own left (`party.open`) | The reporter moves on; the party chapter stays on the straggler's, so the reporter's next intro opens and immediately says the story waits for the party. | `ui.js:864-881`, `startChapter` 603 **[read]**, rare **[suspected]** |

---

## 5. Saved data for story progress

### 5.1 What is saved **[read]** `data.js:21-85`, PACKS.md "Saved data"

| Key | Scope | Shape | Bound |
|---|---|---|---|
| `saga:p` | player | JSON `Saga`: `{ s, g?, cx?, fv?, wv?, wn?, tr?, ut? }` | 30,000 UTF-8 bytes (`SAVE_LIMIT`, `data.js:85`; the property holds 32,767). `trimSave` (342-374) drops, in order, `ut`, finished favors, oldest codex ids; never stories, flags or unknown fields. |
| `saga:p_bak` | player | a copy of an unreadable `saga:p` | never overwritten |
| `saga:pref` | player | the player's `tracker`, `trackerAt`, `spotGuides` | settings-core |
| `saga:cfg` | world | changed settings | settings-core |
| `saga:places`, `saga:places_bak`, `saga:restore`, `saga:weather` | world | places, pending terrain restores, last weather | not story progress |

`Saga.s[storyId]` = `StoryState { dn: string[], f: {}, ch: {}, a?, cur?, o?: number[], t?, fin?, h?, x? }`:
finished chapter ids, the story's flags, choices by chapter key (`<chapter>`, `<chapter>@` intro,
`<chapter>#<i>` meet), accepted flag, current chapter id, per-objective progress, accept time, finish time,
hint bought, per-objective extras. `g` = player-wide flags and counters. `cx` = codex ids. `fv[npc]` =
`{ id, d, a?, o?, x?, c?, t?, h? }`. `wv` = the one live stranger encounter. `tr` / `ut` as in 2.5.

Saved 5 s after a change (`flushAll`, `main.js:77`), at once for accepts and reports (`markDirty(p, true)`),
and on `beforeEvents.playerLeave` (`main.js:760-766`).

**Everything about parties is in memory only**: `partyViews` (`data.js:787`), `synced` and `told`
(`party.js:151-153`), `talking` and `popups` (`ui.js:468-470`), scenes. A restart recomputes it from the
tags and each member's own save. Party quest entries (`pq`) are never saved.

### 5.2 What a redesign can change without a migration

- **Add optional top-level fields to `saga:p`.** `sagaOf` (`data.js:283-320`) validates only the fields it
  knows and keeps the rest; `trimSave` never drops unknown fields; an older pack version round-trips them.
  New fields proposed below (`ls`, `la`, `rc`, `ps`, `pn`, `g.met_<wid>`) add under 150 bytes.
- **Add optional fields to a `StoryState`**: `tidy` (272-280) keeps unknown keys; `complete` deletes only the
  ones it knows.
- **Change any party logic**: nothing is persisted, so there is nothing to convert.
- **Reuse `tr` for a story that has no accepted chapter** (a lead): old code simply does not find it in the
  entry list (`trackedFirst`, k = -1) and falls back.
- **New settings** are additive (`settings.js` OPTIONS).
- **Must not change:** story, chapter and choice ids (progress is keyed by them, `stories.js:3-5`), the
  meaning of `dn` / `f` / `ch`, the `saga:` prefix (the bundle shares one store; `diag.js` forgets by prefix).
- **Harness note:** a simulated player gets a new `player.id` on every spawn and its dynamic properties do
  not follow (`tools/test-bds/README.md`, Limitations), so "away for N days" must be driven by a debug hook.

---

## 6. Bugs and rough edges found on the way

Each: where, what happens, why, fix. Severity is for the owner's complaint, not for stability.

### 6.1 The home line recommends the wrong story between chapters (high) **[read]**
`ui.js:1677-1681`. When no chapter is accepted, the body is
`Talk to <npc of available[0]> to start <available[0].title>.`, where `available` is the list of stories
with **no progress at all**. `current` (stories with finished chapters and no accepted one, i.e. between
chapters) is computed two lines up and used only for a button count. A player who finished chapter 3 of
The Gray Choir and logs back in is told `Talk to Moss the Gravedigger to start Graveyard Shift.` Before
the prologue is done it names the *other* prologue story.
Fix: one `nextStep()` (8.2) used by the home page; minimal patch: prefer the first `current` main story's
`currentChapter` (`Talk to <chapter.npc ?? giver> for "<chapter title>"`) over `available[0]`.

### 6.2 The tracker and Minimap are blank between chapters (high) **[read]**
`main.js:107-110` clears the box and sends an empty `realm:track` when `entries(player)` is empty; `track()`
only iterates accepted entries. 35 of 61 main-story transitions (53 of 193 over all stories) change NPC, so
the intro does not auto-open (`ui.js:873`) and the player is left with one chat line (`ui.js:926`). Same
after `Not now`, after a mate reported for you (`ui.js:925-926`), and for a new player.
Fix: tracker "leads" (8.3).

### 6.3 Saga's text has no direction to an NPC that is not loaded (high) **[read]**
`towardNpc` (`ui.js:116-124`) returns `""` unless `npcAt` finds the entity; the quest box then prints
`(Old Tobin: /realm:npc)` (`whereOf`, `ui.js:1471`) or just `report to Old Tobin` (`trackLine`, 1211).
`npcTarget` (1187-1193) sends the Minimap `{ label, npc }` without coordinates; the Minimap resolves it from
`realm:npc_places` (`map_bp/scripts/main.js:587-590`), so the star works but the words do not. Players
build far from town, so this is the normal case on login.
Fix: listen to `realm:npc_places` in saga, keep `npcHome: Map<id, { dim, x, z }>`, ping
`realm:npc_places_ping` after world load, use it as the fallback in `towardNpc` and `npcTarget` (8.3).

### 6.4 The tracker follows the newest accept, favors included; accepted favors never expire (high) **[read]**
`trackedFirst` (`ui.js:400`) sorts by `st.t`; `favorStart` sets `t` (`ui.js:963`). `tidyFavors`
(`ui.js:1032`) keeps `a && !c` forever. A returning player's top quest can be `Favor: ...` from weeks ago,
with the main story as a one-line extra. The story log's `Now:` line uses a different rule (tracked, else a
main entry, `ui.js:1679`), so the log and the box can disagree.
Fix: drop accepted favors older than `favorDays` (2) real days in `tidyFavors`, run it on join; order the
tracker as tracked > report ready > party chapter > accepted this session > main > the rest (8.3).

### 6.5 `Available` is a wall of text and lists stories you cannot start on purpose (high) **[read]**
`availablePage` (`ui.js:1742-1755`) is one body: for a new player 13 "Ready to start" entries (two lines
each) and 41 "Later" lines (11 side, 12 heart, 2 wanderer, 16 festival; `sortStories` 1652-1661 pushes every
locked non-main story). Six of the 13 "ready" are wanderer chains (`Talk to Brannoch Deepdelve.`, no
place: they appear at random on the road). Nothing can be tapped, tracked or navigated to.
Fix: 8.5 (three picks; "everything" as buttons; wanderers only once met; locked behind one more tap).

### 6.6 Wrong lock reasons (medium) **[read]**
`requires` (`data.js:592`) turns any failing flag that is not `g:aff_*` or `cal:festival` into
`make different choices earlier in the story`. The Calling (`g:calling_ready`, `pack:skills_bp`) and The
Listening Deep (`pack:expedition_bp`) therefore read as if the player chose wrong.
Fix: `g:calling_ready` -> `reach your Calling in /realm:skills`; `pack:<folder>` "on" ->
`needs <pack> on this Realm` (`packsNeeded`, `data.js:644-653`, already names the folder for a started
story: `Needs expedition_bp to go on`; a pack title map would read better); keep the choices text for the
rest.

### 6.7 Finished chapters cannot be reread (medium) **[read]**
No code path shows an `outro` again (`grep outro ui.js`: `endChapter`, `wanderEnd` only). In a party the
mate's only chance is the listening-in popup (G9). Fix: the reader in 8.4.

### 6.8 Listening-in and `Join?` popups have no range, and close under the reader (medium) **[read]**
See G8, G9. Fix: popups only for mates within 96 blocks in the same dimension; everyone else gets chat and
can read the chapter in `Previously`; do not close a listener's popup on accept, let it time out or be
dismissed (it changes nothing when answered).

### 6.9 Button second lines are longer than a button (medium) **[suspected: needs a client]**
`admin_bp` measures every button line against 168 pixels (`presets.js:96 LINE`, `textWidth`) "because
Bedrock cuts longer lines off with `...`". Saga does not: `Current quests` puts the step under the title cut
at 60 characters (`ui.js:1727, 1731`); 374 of 607 objective labels are wider than 168 px (the widest 526),
`The tracker follows it, for your party too` is 213, `Main story: The Cartographer's Last Map` 206.
Fix: put the step in the page body, keep buttons to `<short>` plus a short status; add a unit test that
measures every generated label with `presets.textWidth` logic (copy the width table to `tools/lib`).

### 6.10 `Current quests (N)` can be one short (low) **[read]** G16. Fix: count the list the page shows.

### 6.11 An empty story state is created by looking (low) **[read]**
`startChapter` calls `stateOf` before the dialog (`ui.js:600`), so `saga.s[id]` exists after `Not now`.
`complete` skips the `New story: ...` announcement for any story with a state (`ui.js:939`), and
`sortStories` still calls it available. Harmless today; any "have they seen this story" logic must test
`st.a || st.dn.length`, not the object. Fix: read `saga.s[story.id]` in `startChapter` and create it in
`accept`.

### 6.12 Offer order collides with shop buttons (low) **[read]** 1.2. Fix in 8.5 (the recommended offer
first, order 1).

### 6.13 A done-but-offline mate pulls the party back (medium) **[read]** G4. Fix in 8.6 (no mid-chapter
switch; a member who only has to report does not set the pace).

### 6.14 `The tracker ... points the way` is said when it may not (low) **[read]**
`accept` ends with `The tracker in the <box> ... points the way` (`ui.js:691-694`) even when the player
turned the tracker off (`getFor(player, "tracker")` is not checked). Fix: say
`/realm:saga shows the way (your tracker is off: /realm:prefs)` then.

---

## 7. How the other packs offer "things to do" (overlap)

| Pack | Offer | How you get it | Overlap with story quest picking |
|---|---|---|---|
| `quests_bp` Daily Quests | 3 a day, automatic, counted as you play; chat on join | nothing to pick | none: it is the model of "no choice" |
| `saga_bp` daily favors | 12 a day, one per NPC | walk to each NPC and accept | competes with story offers in the same NPC menu and in the tracker (6.4) |
| `bounty_bp` | 4 a day realm-wide (2 champions, 2 culls), open to all | board or `/realm:bounty`; `Bounties` at Reyes | Rook's chain races these; no pick needed |
| `calendar_bp` | festival activities, sieges | automatic; `/realm:calendar` | adds 4 festival chapters to NPC menus while a festival runs (time-limited, not highlighted) |
| `guilds_bp` | ranks, shops | passive; `Guild hall` at Reyes | story `requires.rep` reads it |
| `journal_bp` | pages that fill themselves | passive | its Story page lists finished chapter titles (a thin recap) |
| `expedition_bp`, `maps_bp`, `goals_bp`, `town_bp`, `milestones_bp` | dungeons, treasure hunts, donations, projects, tiers | own menus | The Listening Deep needs expeditions |
| `party_bp` | parties | `/realm:party` | has a leader (`l`) saga never reads |
| `admin_bp` | the Realm item menu | every command, grouped | no "what now" entry; story is 3 taps down |

There is no shared "what should I do" surface. This spec stays inside saga (plus one button in `admin_bp`);
a realm-wide "Today" page is a possible follow-up (10.1).

---

## 8. Proposed redesign

Goal: keep all content, remove the picking. One recommended next step everywhere (tracker, Minimap, menu,
NPC), a recap when you come back, three picks instead of fifty, and a party flow someone decides.

Suggested shipping order (each its own PR and release, per `docs/WORKING.md`): **P1** 8.2 + 8.3 + 6.1-6.4,
6.6 fixes (the tracker never blank; this alone answers "idk what to do"); **P2** 8.1 + 8.4 + 8.5 + 8.7
(Continue, Previously, picks, Realm menu); **P3** 8.6 (party story).

### 8.1 One front door: `/realm:saga` opens "Your Story"

**Files:** `ui.js` (new `continueMenu`, `showMenu` renamed `logMenu` and kept as is), `main.js:631-638`
(`realm:saga` -> `continueMenu`; `realm:saga_log` -> `logMenu`, description `Story Questlines: the full
story log (quests, finished, codex, favors)`), `admin_bp/scripts/presets.js:240-241` (names below).

**Page** (ActionFormData, no `.header()`):

```
title: Your Story

body (example, between chapters, back after 23 days):
  §7Main story: §fAct II, The Gray Choir §7(chapter 4 of 12)
  §7Last story step: 23 days ago.

  §fNext: §eTalk to Quill the Trader §7NE 140m
  §7Why: he has the next chapter, "The Pattern".

  §3Party story: with Ann and Bob.            (only in a party story, 8.6)
  §7Also going: 2 side stories, 1 favor.      (only when there are any)

buttons:
  Go: Quill the Trader          | Keep going                    (when the tracker already shows it)
  §8NE 140m. On your tracker now| §8Your tracker shows the way
  Previously
  §8The story so far, to reread
  Something else
  §83 picks for right now
  Play with my party            (only with a party tag and partyStory on)
  §8One chapter for everyone
  Everything
  §8Full log, codex, favors
  Close
```

All lines measured under 168 px with `admin_bp`'s `textWidth` (the longest, `NE 1,240m. On your tracker
now`, is 159). Buttons use `story.short` (18 characters at most), never the full title
(`Main: The Cartographer's Last Map` is 174).

- **Go** sets `saga.tr = <story id>` (personal: no party broadcast), removes it from `ut`, adds the player
  to `progressed` so the box redraws next second, sends `realm:track` now, says in chat
  `§b[Story] Next: Talk to Quill the Trader, NE 140m. Your tracker and the compass star point there.` and
  closes. Login to walking: **0 taps** (the lead is already on the tracker, 8.3) or **3** through the item
  (item > `Continue My Story` > `Go`).
- A step with no place (`Catch 5 things with a fishing rod`): the button is `Got it` / `§8On your tracker
  now`.
- Body lines by `nextStep().kind` (8.2). Stories paused: the existing red line, and `Next:` is omitted.
- `Everything` opens the old Story Log unchanged, so nothing is removed.

**Edge cases:** dead or changing dimension (keep `lifecycle` + `exclusive` as `showMenu` does, C17);
no Townsfolk placed (`Next: Talk to Old Tobin §7(not in town yet: ask an operator)` when `npcHome` has no
entry and the pack scan says `npc_bp` is on; without `npc_bp`, the existing `Needs Townsfolk` wording);
target in another dimension (`in the Nether`, from `bearing`); an operator sees `Story places` and
`Operator tools` under `Everything` as today.

**Migration:** none. **Risk:** players who typed `/realm:saga` for the log get one more tap
(`Everything`), and `/realm:saga_log` changes meaning (was `Current quests`); say so in `docs/NEWS.md`.

### 8.2 The next-step engine

**New file** `packs/saga_bp/scripts/guide.js` (imports `data.js`, `places.js`, `party.js`, `util.js`; move
`npcAt`, `bearing`, `towardNpc`, `npcTarget`, `Pointed` out of `ui.js:87-124, 1177-1193` into it so `ui.js`
imports them and no cycle is added).

```js
/**
 * @typedef {object} Next
 * @property {"report" | "step" | "lead" | "start" | "blocked" | "done" | "off"} kind
 * @property {Story} [story]
 * @property {Chapter} [chapter]
 * @property {Entry} [e]            an accepted chapter (report, step)
 * @property {string} [npc]         who to talk to (report, lead, start)
 * @property {string} label         "Talk to Quill the Trader", "Report to Old Tobin", "Defeat 6 more drowned"
 * @property {string} why           one sentence, see the table
 * @property {Pointed} [at]         where, for the Minimap and the bearing
 * @property {"tracked" | "party" | "main" | "side"} from
 */
export function nextStep(player, saga = sagaOf(player)) {}
/** The lead of one story with no accepted chapter: its next chapter's NPC, or undefined. */
export function leadOf(player, saga, story) {}
/** Days since the last story step: saga.la, else the newest st.t / st.fin. */
export function idleDays(saga, now = Date.now()) {}
```

Ladder (first match wins):

| # | Condition | kind / from | `label` | `why` |
|---|---|---|---|---|
| 1 | stories disabled | off | - | `Stories are paused by an operator.` |
| 2 | `saga.tr` names an accepted entry or a story with a lead, and it is not in `ut` | step/report/lead, tracked | from that story | `You picked this one to follow.` |
| 3 | an accepted **main** chapter is done | report, main | `Report to <npc>` | `"<chapter>" is done: report back for what happens next.` |
| 4 | in a party story: the party's chapter (own entry or party quest) | step, party | its `stepLine` | `Your party is on this chapter.` (helper: `You are helping <names> with it.`) |
| 5 | an accepted main chapter | step, main | the tracker's focused step | `It is the next step of the main story.` |
| 6 | a main story with finished chapters and none accepted (`frontier`, `party.js:99-118`, no `why`) | lead, main | `Talk to <npc>` | `<Npc> has the next chapter, "<title>".` |
| 7 | the next main story is startable | start, main | `Talk to <giver>` | `The main story starts here.` / `Act <n> starts here: <summary>` |
| 8 | the next main story is locked (`frontier().why`) and the missing story is another main story | recurse on that story | - | `<Act title> needs <story> first.` |
| 9 | locked on a pack | blocked | - | `Needs <pack> on this Realm.` |
| 10 | no main story left: the best pick of 8.5 | from pick | - | `You finished the main story. <n> stories are still open.` |
| 11 | nothing at all | done | - | `You have done every story there is. The townsfolk still have a favor each day.` |

Any other done chapter (side, favor, job) is not the headline but always appears as pick 1 of 8.5
(`Report: ...`), so a reward is never buried.

`at` for 3-5 comes from the existing `trackLine` (`pointed`); for 2 (lead), 6 and 7 from `npcTarget` with
the `npcHome` fallback.

**Cost:** `nextStep` runs when a menu opens and, for the lead only, in the tracker loop every 2 s for a
player with no main entry. Cache the lead per player keyed by the entry-cache version
(`versions`, `data.js:266`; export a `versionOf(id)`) and the calendar day; recompute only the bearing.
Profile with `saga-perf-quests.js` before and after at 10 and 40 players (budget 0.15 ms a tick).

### 8.3 The tracker never goes blank: leads, NPC homes, a sane order

**Files:** `main.js` (loop 99-120; script events), `ui.js` (`track`, `trackedFirst`, `questBox`,
`tidyFavors`), `guide.js`, `settings.js` + `config.js` (`leadTracker` world bool default true,
`favorDays` world int 1-14 default 2), `util.js` if `send` helpers are needed.

1. **NPC homes.** `guide.js`: `export const npcHome = new Map()`; `onNpcPlaces(msg)` collects the
   multi-part message (`{ part, parts, folk: [{ id, n, dim, x, z }] }`, parts may arrive in any tick; `parts:
   0` clears). `main.js`: add `"realm:npc_places"` to the `onScriptEvent` id list (446-471) and handle it
   **before** the id guard at 533-543 (C29: `check-event-guards` fails otherwise); at world load
   `system.runTimeout(() => send("realm:npc_places_ping", {}), 70)`. `towardNpc` and `npcTarget` fall back to
   `npcHome.get(npc)` (bearing radius 6) when the entity is not loaded and it is not a wanderer.
2. **Leads.** In `main.js` drop the early `continue` for an empty list (107-110); always call
   `track(player, list, shown)`. In `track()`:
   - build the entry lines as today;
   - `const lead = leadTracker && nextStep-style main lead (rows 6-8) unless the player has a main entry,
     or "main" is in saga.ut` plus, when `saga.tr` names a story with no entry, that story's lead;
   - no entry line: the lead is the box; else the lead is one more "other quest" line
     (`§3Main story§7: talk to Ida NE 140m`, prio 1, kind "quest").
   - `sendTrack(player, lead.at)` with label `<short>: Talk to <npc>` when the lead is the box.

   Box, lead on top (3 rows):
   ```
   §bGray Choir§7: next chapter
   §e[>] §fTalk to Quill the Trader §eNE 140m
   §7"The Pattern" (4 of 12)
   ```
   New player:
   ```
   §bThe story starts here
   §e[>] §fTalk to Old Tobin §eS 60m
   §7The Drowned Bell (main story)
   ```
   Above the hotbar (`trackerAt: "hotbar"`): `§bGray Choir: §fTalk to Quill the Trader NE 140m`.
   `Hide the story hint` in Continue (shown only while the lead is a `start`) adds `"main"` to `ut`; starting
   any main chapter removes it (`showAgain`).
3. **Order** (`trackedFirst`): tracked; a done chapter (report ready), main before others; the party
   chapter; an entry accepted this session (`st.t > joinedAt.get(player.id)`, a new in-memory map set on
   `playerSpawn`); the main story; then by `st.t`. So a favor taken five minutes ago leads now, and after
   the next login the main story leads again.
4. **Stale favors.** `tidyFavors`: also delete `fs.a && !fs.c && fs.d < today() - favorDays` (end its
   scenes like `favorInfo`'s give-up does, `ui.js:986-995`); call it from the join routine (8.4), and tell
   the player once: `§7[Story] 2 old daily favors ran out while you were away.`

**Edge cases:** `leadTracker` off (operators) or tracker off (player): no lead in the box, but
`realm:track` still goes (the Minimap star is its own switch), as today for hidden trackers
(`ui.js:1380`). A party hold: the lead is the party chapter's NPC. The NPC is not placed: the lead shows
without a direction, `(/realm:npc_who)`. A lead to a wanderer: the camp (`placesOf()[campName(id)]`, as
`towardNpc` already does) or no lead when there is no camp.
**Migration:** none. **Risk:** a box that never goes away for players who ignore the story; the hide
button and the tracker pref cover it. The quest box is redrawn only on change (`boxSent`), and a lead's text
changes with the bearing like any step.

### 8.4 "Previously": a recap on return and on demand

**Files:** `guide.js` (`recapOf`), `ui.js` (`recapPage`, `rereadChapter`), `main.js` (join routine, leave
stamp, debug actions), `data.js` (typedef), `types.js` + `docs/STORY_BIBLE.md` section 9 (optional
`Chapter.recap`), `tools/check-stories.mjs` (recap: plain ASCII plus section-sign codes, 200 characters at
most), `settings.js` / `config.js`.

**Data (all optional, in `saga:p`):**

```js
/** @property {number} [ls] when the player was last on the realm (ms), stamped on join and on leave */
/** @property {number} [la] the last story step (ms): bump(), accept(), complete() */
/** @property {number} [rc] the `ls` value the recap was last shown for (one recap per return) */
```
No `ls` yet (first join after the update): use `idleDays()`' fallback, the newest `st.t` / `st.fin`, so
existing players get a correct "23 days ago" the first time.

**Settings:** `recapDays` (world int 0-60, default 7; 0 = never by itself), `recapPopup` (player bool,
default true, label `Story recap when I come back`, help `After a week or more away: what happened, and
what's next`).

**On join** (`main.js:742-755`, after `wanderJoined`, in the same `system.run`):

```
const away = days since (saga.ls ?? fallback); saga.ls = now; markDirty(player);
tidyFavors(player)                      // 8.3.4
if (!hasProgress(saga) || recapDays === 0 || away < recapDays) return;   // the tracker lead is enough
if (saga.tr && its story is not main) delete saga.tr;                    // the main story leads again
chat, 200 ticks after spawn (after Daily Quests' line):
  §6[Story] Welcome back. Last time (23 days ago): "Rope and Ash", The Gray Choir.
  §e[Story] Next: Talk to Quill the Trader, NE 140m.
  §7[Story] /realm:saga has the story so far (Realm item > Continue My Story).
popup when recapPopup: showOnce(recap form, 600 ticks), retried every 40 ticks while the answer is
  UserBusy, for 30 s at most (the Welcome and News popups come first); then saga.rc = saga.ls.
```
`showOnce` (`util.js:222-227`) never retries by itself and ends nothing else on a timeout, which is what a
popup nobody asked for needs. Stamp `saga.ls = Date.now()` in `beforeEvents.playerLeave` before the
`flush` (`main.js:760-766`).

**The page** (`recapPage(player, story?)`, also behind `Previously`):

```
title: Previously

body:
  §l§6The Gray Choir§r §7Act II, 3 of 12 chapters done
  §7<story.summary>

  §eThe Missing Watch§r
  §7<chapter.recap, or: "Done: <step label>; <step label>.">
  §eRope and Ash§r
  §7<recap> §7You chose: Spare the smuggler.
  §eThe Ledger§r §7(last time, 23 days ago)
  §f<recap, or the first outro page cut at a sentence, 240 characters>

  §fNow: §eTalk to Quill the Trader§r §7NE 140m, for "The Pattern".

buttons:
  Go: Quill the Trader           (as in 8.1)
  Read the last chapter again
  §8Intro and ending, page by page
  Older chapters
  §8Pick any finished chapter
  Other stories                  (when more than one story has finished chapters)
  Back
```

- At most the last 3 finished chapters of the story in focus (the `nextStep` story, else the story with the
  newest `la`); choices from `choicesMade` (`ui.js:1619-1638`).
- `rereadChapter` = `dialog(player, story.title, chapterHeader(...), [...pagesFor(intro), ...pagesFor(outro)],
  ["Done"])` with today's flags. This also gives party mates the outro they missed (6.7, G9).
- `Older chapters`: buttons, newest first, 20 a page (`<chapter title>` / `§8<story short>`).
- **Content:** `Chapter.recap` is optional. Without it the fallback is structural (step labels, the choice)
  plus the first outro page. Writing a one-line recap for the 68 main chapters is content work that can
  follow; the feature works without it.

**Edge cases:** a player with no progress gets no recap (the start lead is enough); the story changed and a
finished chapter id no longer exists (skip it: iterate `story.chapters` filtered by `dn`, as
`finishedPage` does); pages with `when` use current flags (an old branch may read slightly differently:
accepted); the popup never shows over another form (UserBusy) and gives up silently; death or a dimension
change ends it (`lifecycle`).
**Migration:** none (optional fields, fallback for `ls`). **Risk:** popup timing against the Welcome
popup needs a real client; if it proves annoying the chat lines alone already work.

### 8.5 A small curated choice

**Files:** `guide.js` (`picks`), `ui.js` (`picksPage`, `storyCard`, `everythingPage` replacing
`availablePage`; `offersAt`), `main.js` (`onTalk` records meetings), `data.js` (6.6 reasons).

```js
/** @typedef {{ slot: "report" | "main" | "near" | "quick", story: Story, title: string, hint: string, next: Next, dist: number }} Pick */
export function picks(player, saga = sagaOf(player)) {}   // 0 to 3
```

- **Slot 1:** a done chapter waiting to be reported that is not the headline (`Report: Got Away` /
  `Old Tobin S 60m`); else the main-story step when the headline is something the player tracked
  (`Main: Gray Choir` / `Quill the Trader NE 140m`).
- **Slot 2, `Nearby`:** among side, heart and festival stories that are in progress, between chapters or
  startable, and wanderer chains whose wanderer was met, the one whose next target is nearest. Score =
  blocks to the target in this dimension (unknown or other dimension: 5,000), minus 200 when in progress,
  minus 500 for a festival chapter while its festival runs (it goes away).
- **Slot 3, `Quick`:** an accepted favor or job in progress; else today's favor from the nearest
  questgiver who still has one (`favorOfDay` gives its label without a visit:
  `Quick: Favor for Bea` / `Bring 8 bread. Bea S 35m`); else a one-chapter festival story.
- "Met" for wanderers: `onTalk` (`main.js:346-355`) sets `g.met_<id> = "1"` the first time
  `msg.npc === "w_<recurring id>"`; a chain also counts as met when its story has a state with progress or
  its camp exists. Unmet chains appear nowhere in the pick lists (they still show in `Finished` when done).

```
title: What now?
body:  §7Three good next things. Your main story stays on top of your tracker unless you pick another.
buttons:
  Report: Got Away              Main: Gray Choir            (slot 1, one of them)
  §8Old Tobin S 60m             §8Quill the Trader NE 140m
  Nearby: Graveyard Shift
  §8Moss the Gravedigger W 60m
  Quick: Favor for Bea
  §8Bring 8 bread. Bea S 35m
  See everything (22)
  §8Every story you can start
  Back
```

A pick opens a **story card**: title = the story; body = kind and tones, `Chapter 2 of 6: <title>` or
`New story`, the summary, who and where, the open steps when accepted; buttons `Go: <target>` (8.1),
`Read it so far` (when it has finished chapters), `Back`.

**Everything** (replaces the text wall, `ui.js:1742-1755`): one ActionForm with `.label("§l§6...")`
sections (as `finishedPage` already does): `Going (n)` (accepted or between chapters, main first),
`Ready in town (n)` (startable, nearest first), `On the road (n)` (met wanderers), then one button
`Locked for now (41)` / `§8What each one needs` that opens the old "Later" text with the corrected reasons
(6.6). Every story button opens its card.

**At the NPC** (`offersAt`, `ui.js:267-288`): the offer whose story is `nextStep().story` gets `order: 1`
and the second line `§eYour next step` (it then sorts above Market and Kitchen); reports and
`Answer:` keep their place; of the *new-story* offers at most 2 are sent, the rest behind
`More stories (3)` (key `more:<npc>`, a saga form listing them). The 16-offer cap of Townsfolk is then
never near.

**Soft limit, no hard cap:** when a player accepts a new story while 3 or more non-main chapters are
accepted, the accept chat adds `§7You have 4 side quests going. /realm:saga keeps the main story on top.`

**Edge cases:** fewer than 3 candidates (show what there is; with none, `Nothing else right now: your main
story is the thing.`); the nearest giver is not placed (dist 5,000, still listed); favors off (`favors`
setting): no quick favor; a festival ends while the page is open (`requires` is checked again by
`startChapter`).
**Migration:** none (`g.met_*` is a new optional flag; players who met a wanderer before the update see
the chain again the next time they talk to them or as soon as it has progress).
**Risk:** "nearest" needs `npcHome`; without Townsfolk positions the order falls back to file order.

### 8.6 The party story: someone picks, everyone knows the rules

**Principle:** sharing the main story is something a party *starts*, with one chosen chapter, visible
rules for who is on it, ahead of it or behind it, and a way out that is not leaving the party. Keep the
engine (`share`, party quests, shared scenes, accept and report once): it is sound. Change who is in, which
chapter, how choices are made, and what helpers get.

**Files:** `party.js` (`partyTick` grouping and the choice of `at`; new `propose`, `joinStory`,
`leaveStory`, `paceOf`), `ui.js` (`partyPage`, the join popup, `listenIn` range, the vote in `endChapter`
and `startChapter`, the helper share, `inviteSide` once per story, `trackQuest`), `data.js` (typedef;
`onHold` unchanged), `main.js` (join hook, world-load read of `saga:pace`, debug actions), `settings.js` /
`config.js`, the six `saga-party-*.js` scenarios and `tools/saga-party-plays.test.mjs`.

**Data:**

```js
// saga:p (player): the party code whose story this player shares. Absent = their own story counts.
/** @property {string} [ps] */
/** @property {number} [pn] 1 = told once that the party story is opt-in (the upgrade notice) */

// saga:pace (world, JSON, at most 64 parties, the oldest `t` dropped first, under 6 KB):
// { [code]: { m: "e" | "<player id>", by: "<name>", t: <ms> } }
//   "e": the earliest chapter among the sharing members online (today's rule)
//   a player id: that member's chapter, while they are online and sharing; else falls back to "e"
```
In memory, per party: `{ key, since, voting?: {...} }` next to `synced`.

**Settings:** `partyStory` (existing master switch) stays. New `partyStoryAsk` (world bool, default
true): on = members opt in as below; off = the old automatic behavior (every online member shares, pace
"e"). `helperShare` (world float 0-1, default 0.25). `partyPopupRange` (world int, default 96).

**Rules (this is the copy for the docs too):**

1. **Starting.** Any member opens `/realm:saga` > `Play with my party`. The page shows where everyone is
   and offers at most three plays. The member who picks is the *proposer*; if the party leader is online and
   is someone else, the leader gets the same popup as everyone plus `Ann (party leader)` in the roster, no
   veto (the leader may be AFK; a veto stalls). Leader info is optional: saga may listen to
   `realm:party_members` to mark them, and works without it.
2. **Joining is each member's own yes.** Every other online mate gets `Party story` (Join / Not now, 60 s,
   chat only for a mate who is busy, AFK-tagged, or further than `partyPopupRange`). `Join` sets `ps`.
   That is the quick vote: the story is shared among those who said yes. Nobody's story changes without
   their yes.
3. **One chapter.** The pace (`saga:pace`) decides it: `Catch <name> up` = "e"; `Play on from here` = the
   proposer's chapter. Members **on** it share everything, anywhere (unchanged). Members **ahead** help
   through a party quest; their own chapter waits; when it is reported they get `helperShare` of its levels
   and Crowns if they were within 128 blocks of a member on it or raised a shared count (a `Set` on the
   `synced` record). Members **behind** a pinned chapter tag along as helpers too: nothing is saved for
   them and they are warned about spoilers before joining.
4. **No switch in the middle.** Once anyone sharing has accepted the party's chapter, it stays the party's
   chapter until it is reported or everyone on it left, even when a member further behind comes online
   (they help until then). A member whose chapter is done and only needs reporting never sets the pace:
   the reporter's next chapter is not held for them (fixes G4, G17); they are told to report when they can.
5. **AFK does not hold the party.** A member with the `afk` tag (`afk_bp/scripts/config.js:12`) does not
   set the pace and gets no popups; shared progress still reaches them.
6. **Accept once, report once** as today, with popups only in range (6.8); everyone else reads it in
   `Previously`.
7. **Choices are a party vote.** When the talker reaches a choice (intro or outro) and at least one
   sharing mate is on the chapter and in range, each of them gets `Party vote` for 30 s: the choices that
   fit them plus `Let <talker> decide`. The talker picks at the same time. Most votes win; a tie, or no
   votes, is the talker's pick. Chat: `[Party] The party chose: Recast the bell (Ann, Cat; Bob: Melt it
   down).` The result is applied through the existing code path, so it still skips a mate it does not fit
   (cost, their own earlier branch). One choice per party is what keeps a party on one branch: the main
   story has 19 branch chapters keyed on these flags.
8. **Side stories.** `A side story together` lists at most 3 side or festival stories that the proposer
   can start or continue and at least one sharing mate can take at the same chapter (nearest giver first).
   Picking one tracks its lead for everyone who can take it. `Join?` is asked **once per story**, not per
   chapter: mates who joined get later chapters accepted with the party, like the main story (an in-memory
   `joined: Map<code, Set<storyId>>`; after a restart the next chapter asks once more). Phase 3b (optional):
   share side-story progress with the same anywhere rules as the main chapter by running `share()` for
   every chapter two or more sharing members have accepted (`synced` keyed `code|story/chapter`), and have
   `objectives.js share()` skip those keys; until then fix the box text to say what is true
   (`Party: fights, places and items count for mates within 64 blocks.`).
9. **Leaving.** `/realm:saga` > `Play my own story` clears `ps`: your own chapter counts again at once and
   you stay in the party. Leaving the party, or the code changing, makes `ps` stale; it is ignored and
   cleared. Fewer than two sharing members online: everyone's own story counts until a second one is
   back (`ps` is kept, so they resume without a new vote; chat says so).
10. **Tracking.** `Track this quest` is personal again, except for the proposer's pick in 8, which is
    announced. (Today any mate retargets everyone, G6.)

**Menu copy:**

```
title: Party Story
body:
  §fWhere everyone is in the main story:§r
  §eAnn§r (you): Act II, "The Pattern"
  §eBob§r: Act II, "The Pattern"
  §eCat§r: Prologue, "Salt and Silence"
  §7Dan: offline
  §7Sharing now: nobody.          | §3Sharing now: Ann, Bob. Chapter: "The Pattern".
buttons:
  Catch Cat up
  §8Help with their chapter
  Play on from here
  §8Behind? You tag along
  A side story together
  §8Pick one all can join
  Play my own story               (only while sharing)
  §8Leave the party story
  Back
```

Join popup (MessageFormData, `button1` Join, `button2` Not now):

```
title: Party story
body:
  §bAnn§r wants to play the main story together.

  §fThe party's chapter:§r §eThe Drowned Bell, "Salt and Silence"§r
  §7It is Cat's next chapter: the party goes at the pace of whoever is furthest behind.

  §fFor you:§r you finished this one. You help, your own chapter ("The Pattern") waits, and you get a
  helper's share of the reward.

  §7One of you accepts and reports for everyone. Choices are a party vote. To stop:
  /realm:saga > Play my own story.
```
`For you` variants: on it: `it is your next chapter: what anyone does for it counts for you.`;
behind a pinned chapter: `you are 3 chapters behind this one: you tag along and help, nothing is saved for
you, and it may spoil your own story.`

Vote popup (ActionFormData):

```
title: Party vote
body:  §bAnn§r is reporting back on "Rope and Ash". The party decides together (30 s):
buttons: <choice labels that fit this member> ... , Let Ann decide
```

**Implementation notes:**

- `partyTick` (`party.js:172-243`): group by tag **and** (`partyStoryAsk` off, or `sagaOf(p).ps === code`);
  pace candidates exclude `afk`-tagged members and members whose frontier chapter is accepted and
  `chapterDone` (rule 4); `at` = the sticky key while valid (rule 4), else by `paceOf(code)`. The rest of
  the function (views, ghosts, `tell`, `share`) is unchanged. A member behind a pinned chapter needs no new
  code path: they have no own entry for it, so they get the party quest like a member ahead (`ghost`, line
  215), with `sg` from a mate on it.
- `tell` texts gain the way out: `... Your own chapter waits. /realm:saga > Play my own story to stop.`
- Vote: in `endChapter` between the dialog and `complete` (`ui.js:841-851`), and in `startChapter` before
  `accept` (627-634): `const choice = await partyVote(player, story, chapter, choices, pick)` using
  `showOnce(p, form, 600)` for the mates and a 600-tick cap; re-run the existing "check again" guards after
  it (the chapter may have been reported meanwhile). Nothing is applied before the vote resolves, so a
  restart or a leave during it leaves the report waiting at the NPC (C17, C23).
- Helper share: after `party.done` in `endChapter`, for each sharing mate whose `partyViews` ghost is this
  chapter and who qualifies: `reward(p, { levels: round(r.levels * share), crowns: round(r.crowns * share) },
  "Helping: <story title>")` and `§b[Party] Thanks for helping: <got>`.
- Upgrade notice: the first time a player with a party tag and no `pn` is online with a mate, one chat
  line: `§b[Party] The party story is now something you start together: /realm:saga > Play with my party.`
  then `pn = 1`.

**Edge cases:** the proposer logs off during the vote (popups stay valid; each Join stands on its own);
nobody joins (`Nobody joined: your own story counts.`); a member joins the party or logs in while a story is
shared (they get the join popup once, 15 s after spawn, after the recap); the pinned member leaves (pace
falls back to "e" and everyone is told the new chapter, subject to rule 4); a party of two where one
stops (the other is told `Nobody else is sharing the story now: your own story counts.`); members on
different branches at the same point (the roster shows both chapters; the proposer picks whose with
`Play on from here` on the right member, and the vote keeps them together from then on); `partyStory` off
(the button is hidden); stories disabled.
**Migration:** none in data (party state was never saved). In behavior, with `partyStoryAsk` on, existing
parties stop sharing until someone starts it (the notice says how); `partyStoryAsk` off restores today's
automatic sharing exactly, which is also what the unchanged parts of the old scenarios run with.
**Risks:** the largest behavior change in this spec (six BDS scenarios and the docs' item 9 are rewritten);
more forms in play at once (vote, join, listen-in), so keep one `popups` set and one lifecycle per player as
today (`ui.js:468-470`); the helper share can be farmed by re-helping new players (bounded by needing a real
mate on the chapter; set `helperShare` 0 to switch it off).

### 8.7 Where it plugs into the Realm menu

- `admin_bp/scripts/main.js:529-548` `mainMenu`: first entry, before `My Preferences`, when the catalog
  has the command:
  `if (has("realm:saga")) entries.push({ label: button("Continue My Story", "What to do next, and where", false), open: async () => exec(player, "realm:saga", "Continue My Story") });`
  (90 and 136 px). Same pattern as `My Preferences` on line 537; no import between packs.
- `admin_bp/scripts/presets.js:240-241` `NAMES`: `"realm:saga": ["Story: Continue", "Next step, recap, quest
  picks"]` (76 / 147 px), `"realm:saga_log": ["Story Log (everything)", "Quests, codex, favors, finished"]`
  (118 / 156 px).
- Then `node tools/admin-catalog.mjs` (command descriptions changed), bump `admin_bp`, `node
  tools/sync-diag.mjs`, `node tools/help-catalog.mjs` last.
- `welcome_bp/scripts/config.js:76` `lines.saga_bp`: `§b/realm:saga§r shows your next step and the story so
  far.` (a text default; saved operator text wins, as documented).
- Docs in the same PRs: `docs/PACKS.md` Story Questlines (How to use 3, 4, 6, 9; the story log bullet; the
  tracker bullet; Commands; Configuration; Saved data `ls`, `la`, `rc`, `ps`, `pn`, `g.met_*`, `saga:pace`;
  How it works: party story), Parties (the saga bullet), Realm Configuration (the new top button), README
  rows, `docs/NEWS.md`, `release/notes.json`.

---

## 9. Testing on the BDS harness

Conventions from the existing scenarios (`tools/test-bds/examples/saga-quest-log.js`,
`saga-party-coop.js`): drive NPCs with `realm:npc_choose` / `realm:npc_talk` (no Townsfolk needed), jump
with `realm:saga_debug { action: "jump" | "finish" | "bump" }`, read the box from `realm:side` (`from:
"saga"`, `slot: "quest"`) and the Minimap target from `realm:track`, answer forms with `t.waitForm` /
`t.answerForm` (`t.formTimeout` is 100 ticks; answer `"busy"` to exercise the retry). Each scenario gets
its run command in its header; each must fail before its change and pass after (C28).

New debug actions (`main.js:376-434 onDebug`, operators and the console only, as today):
`{ action: "away", days }` (sets `ls` and `la` back and runs the join routine), `{ action: "next" }`
(warns `nextStep` as JSON to the content log), `{ action: "npc_home", npc, dim, x, z }` is not needed: the
scenario sends `realm:npc_places` itself.

| Scenario | Packs | Checks |
|---|---|---|
| `saga-lead.js` | `saga_bp` | Send `realm:npc_places` (Tobin at 40,40, Ida at -200,0). New player: box has `Talk to Old Tobin` and a bearing; `realm:track` has `npc: "tobin"`, x, z. Accept and finish `drowned_bell/vigil` (bump), report at Tobin: box shows `Talk to Ida the Relicsmith` with `W` and a distance; before: no `realm:side` from saga and an empty `realm:track`. With an accepted side quest too, the lead is a second line. `Hide the story hint` removes it. |
| `saga-continue.js` | `saga_bp` | `/realm:saga`: title `Your Story`, body has `Next:` and `Why:`, first button starts with `Go:`; answering it sets the tracker (`realm:track` changes, chat `Next: ...`) and no further form opens. Between chapters the body names the in-progress story, not `available[0]` (6.1). `Everything` opens `Story Log` with the old buttons. `/realm:saga_log` opens it directly. |
| `saga-recap.js` | `saga_bp` | Jump to act 1 chapter 3 with a choice flag; accept a favor; `away` 30: chat `Welcome back. Last time (30 days ago)`, the favor is gone (`fv` empty in `state`), a form `Previously` lists the last chapters and the choice; `Read the last chapter again` pages through intro then outro. Answer the first try `"busy"`: it comes again. `away` 3: no chat, no form. `recapPopup` off: chat only. |
| `saga-picks.js` | `saga_bp` | With `npc_places` sent and act 1 finished: `Something else` has at most 3 picks plus `See everything`; the `Nearby` pick is the story whose giver is closest to the player; teleport the player and it changes; an unmet wanderer chain is in no list, and is after a `realm:npc_talk` with `w_brannoch`. `See everything` has section labels and `Locked for now (n)`; The Calling's reason is not "different choices". |
| `saga-offer-order.js` | `saga_bp` | Collect `realm:npc_offer` for a talk to Tobin with three startable stories: the `nextStep` story has `order: 1`; at most 2 new-story offers plus `More stories (n)`. |
| `saga-party-ask.js` | `saga_bp,party_bp` | Ann and Bob (act 1) and Cat (new) in one party: with `partyStoryAsk` on nothing changes for anyone (Ann's own chapter still counts: bump it). Ann proposes `Catch Cat up`: Bob and Cat get `Party story`; Bob joins, Cat says Not now: the party chapter is Ann's and Bob's own; Cat's story is untouched. Cat joins later: the chapter does not switch while Ann's is accepted with progress (rule 4), then goes to Cat's after the report. `Play my own story` gives Ann her chapter back with the tag still on. |
| `saga-party-vote.js` | `saga_bp,party_bp` | Three sharing members on `drowned_bell/iron`, done: Ann reports; Bob and Cat get `Party vote`; two votes beat Ann's pick; all three have the same flag; chat names the result. No votes in 30 s: Ann's pick. A mate out of range gets no popup and the result still applies. |
| `saga-party-helper.js` | `saga_bp,party_bp` | Ann (ahead) helps Bob: on Bob's report Ann gets `Thanks for helping` with 25% of the levels and Crowns; with `helperShare` 0, nothing. An `afk`-tagged member further behind does not set the pace. |
| existing `saga-party-story.js`, `-coop.js`, `-scenes.js`, `-fight.js`, `-fight-helper.js`, `-stealth.js` | | Either set `partyStoryAsk` off at the top (`realm:cfg_set`, as other scenarios set options) to keep testing the engine as is, or add the join answers. Keep at least `-story` and `-coop` on the new flow. |

Unit tests (`tools/*.test.mjs`, the `vm` + `grab` pattern of `tools/saga-party-plays.test.mjs`): the
`nextStep` ladder table of 8.2 with fake sagas; `picks` never returns more than 3 and never an unmet
wanderer; `recapOf` stays under 1,500 characters; every generated button line (all stories' `short`, all
NPC names, distances up to `99,999m`) is 168 px or less (`tools/saga-menu-width.test.mjs`, sharing the width
table with `admin_bp/scripts/presets.js`); `tidyFavors` drops only favors older than `favorDays`;
`saga-save-bound.test.mjs` gets the new fields in its maxed save.

Also: `npm run check` (check-events for the new ids, check-event-guards for `realm:npc_places`,
check-actionbar, check-ascii for every new string, admin and help catalogs), `suite.mjs --filter 'saga|npc|admin'
--retry`, the one-context bundle smoke, and `saga-perf-quests.js` as a pair on `validate.yml` (the lead
and the party grouping run in the per-second loop).

Not testable on the harness, to check on the Realm: popup timing against the Welcome and News popups, the
168 px claim on phone and PC, the quest box rows with a lead, real rejoin after days (player ids persist on
a Realm), the feel of the vote's 30 s.

---

## 10. Alternatives considered and rejected

1. **A realm-wide "Today" board** (one page with daily quests, bounties, favors, expeditions, the story),
   through a new `realm:todo` ask-and-answer protocol like `realm:npc_offer`. It adds a place to choose
   rather than removing choice, and touches six packs. Possible later: `Something else` could gain one line
   per answering pack.
2. **A hard cap on active quests** (say 3). Blocks party joins and festival chapters, needs a rule for
   players already over it, and the problem is the picking, not the count. The tracker order and the three
   picks do the job; a soft note at 4 is enough.
3. **Accept the next chapter automatically** (no walk to the NPC). Breaks "told by the townsfolk", skips
   intro choices, and party accept-once depends on a talker. A lead that points at the NPC keeps the
   fiction and removes the confusion.
4. **Catch a member up by skipping chapters** to the party's. Rewards, relics, titles, reputation, codex
   entries and every branch flag of the skipped chapters would have to be invented or copied from a mate;
   the save has no notion of "done by proxy". Operators already have `realm:saga_debug jump` for a
   deliberate skip. The spec instead lets the party choose between the laggard's chapter and playing on.
5. **The leader alone decides.** Needs the leader online and attentive, and saga does not know the leader
   today. Chosen: whoever proposes picks the chapter, and each member's Join is their vote.
6. **Everyone makes their own choices in a party.** Splits the party across the main story's 19 branch
   chapters within an act. Chosen: one choice per party, by vote.
7. **A recap popup on every join.** Noise on top of the Welcome popup. Chosen: after `recapDays` away, and
   on demand.
8. **Generate recaps by cutting the outro for every chapter, no authored text.** Outros are dialogue; the
   first page is often mid-conversation. Chosen: an optional authored `recap`, a structural fallback, and
   the full reread.
9. **Remove the Story Log.** It is the complete reference and operators' entry point; it moves behind
   `Everything`.
10. **A particle trail or beam to the next NPC.** A per-tick cost per player (C21) for something the
    compass star and the quest box already do once 6.2 and 6.3 are fixed. Spot outlines within 40 blocks
    already exist.
11. **Read `news_bp`'s last-seen stamp.** Packs do not share data outside the bundle; saga keeps its own.

---

## 11. Riskiest unknowns

1. **Client behavior nobody here can see:** whether button lines really cut at 168 px on phones, how the
   recap popup behaves behind the Welcome and News popups (only `UserBusy` is visible to a script), and
   whether three more rows in the quest box crowd the default Right 4 slot.
2. **The party change is a behavior change the owner has to want:** opt-in instead of automatic
   (`partyStoryAsk`), a vote instead of "the talker decides", a helper's share. Each has a setting, but the
   default decides how the Realm feels. Ask before P3.
3. **NPC positions** come from Townsfolk's posts. If an operator has not placed someone, or moves them
   (`/realm:npc_houses`), leads are directionless until the next broadcast; saga must tolerate a missing or
   multi-part list.
4. **The harness cannot rejoin as the same player**, so the "weeks away" path is tested through a debug
   hook only.
5. **Recap quality without authored text.** The structural fallback is accurate but dry; 68 one-line
   recaps for the main story are a writing task with a spoiler policy to agree.
6. **Per-second cost:** the lead and the party grouping run in the player loop. Cached, they should be a
   few lookups, but saga is a "typical pack" with a 0.15 ms budget; measure as a pair.
7. **`/realm:saga_log` changes meaning** and `/realm:saga` gains a step for log users: small, but it is
   muscle memory; NEWS and the help catalog must say it.
8. **Wanderers "met" has no history:** chains a player met before the update disappear from the pick
   lists until they meet that wanderer again (their progress and offers are untouched).
