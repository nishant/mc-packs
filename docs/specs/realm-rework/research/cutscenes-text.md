# Cutscenes and on-screen text: findings and proposed fix

Read-only research for the implementation spec. Nothing in any repo was changed.

Each claim is marked **[V]** (verified by reading the code, the data or Mojang's files) or **[S]** (suspected: reasoned, or from memory of the game, and needs a look on a real client).

Paths are relative to `/home/user/mc-packs` unless they start with `/`.

## Summary

- A "cutscene" is the story's `vision` objective (and the dream after a `sleep` step). It is one function, `playVision` in `packs/saga_bp/scripts/objectives.js:2956-3018`. There is no camera move and no input lock: a black fade, an optional Darkness effect, then one title per scene. **[V]**
- **"One massive long line":** each scene's whole text (50 to 240 characters, median 139) is sent as the **subtitle** of a title (`objectives.js:2982`). Bedrock's title and subtitle labels have no width, so they never wrap. The line runs off both sides of the screen and the player sees only the middle of the sentence. Only 1 of the 103 scenes contains a line break. **[V]**
- **"Wall of text in the chat":** the same call site also sends every scene to chat, one gray italic message per scene (`objectives.js:2983`). A vision is 2 to 7 scenes, 220 to 1,320 characters. It is on purpose: the doc comment and `docs/PACKS.md` both say "also in chat". **[V]**
- The scenes are also shown too briefly to read: the median is 24 characters a second, and 95 of 103 scenes are faster than 17 a second, the usual upper limit for film subtitles. **[V]** (the counts) / **[S]** (the 17 figure is from subtitle style guides, from memory and one search).
- **Proposed fix:** a shared wrap module with pixel widths (`tools/text-shared.js`), captions on the **action bar** (normal font, bottom of the screen, wrapped by the server into 3 rows of 228 pixels, paged, timed at 15 characters a second, Jump for the next page, Sneak to skip), nothing in chat during the scene, and a "Visions and dreams" page in the Story Log to read them again. No resource pack change is needed for that. A caption box in `hud_rp` is possible later as polish.
- The riskiest unknown is how a 3 to 5 row action bar looks on a phone. A two-minute test on the owner's phone answers it (section 9).

## 1. How cutscenes work today

### 1.1 Where the code is

| What | Where |
|---|---|
| The player | `packs/saga_bp/scripts/objectives.js:2942-3018` (`watching`, `dreams`, `playVision`) |
| Starts a `vision` step | `objectives.js:3021-3033` (`visionTick`), called once a second from `tickPlayer` (`objectives.js:3714-3716`) |
| Queues a dream | `objectives.js:1433` (bed tap with time stopped) and `objectives.js:3682-3686` (`isSleeping`) |
| Plays the dream | `objectives.js:3740-3745` |
| Forgets a dream when the player leaves | `objectives.js:3883` |
| The scene type | `packs/saga_bp/scripts/types.js:72-75` |
| The author's reference | `docs/STORY_BIBLE.md:586-587` |
| The players' docs | `docs/PACKS.md:2522-2523` (Sleep, Vision) |
| Lifecycle helpers | `packs/saga_bp/scripts/util.js:88` (`wait`), `:125-132` (`lifecycle`), `:140-146` (`cancelInteractions`), `:329-343` (`claim`, `release`) |
| Title protocol | `packs/saga_bp/scripts/side.js:309-313` (`holdTitle`), source `tools/side-shared.js` |
| Party rule for visions | `packs/saga_bp/scripts/party.js:285-288` |
| Unit tests | `tools/saga-interaction-lifecycle.test.mjs:551-600` (they run the body of `playVision` in a `vm` context) |
| BDS scenario that sees a vision | `tools/test-bds/examples/saga-party-stealth.js:145-153` |

All of this is **[V]**.

### 1.2 How a scene is defined in data

```js
// types.js:72-75
/** @typedef {{ title?: string, text: string, sound?: string, seconds?: number }} Scene */

// a vision step (stories/act1_signs.js:134-146)
{ type: "vision", label: "Touch the crater's glowing heart", place: "starfall", radius: 8, dark: true,
  scenes: [
    { title: "The Heart", text: "The glow is warm as skin. You lay your hand on it, and ...", seconds: 4 },
    { title: "A Storm", text: "Night. Rain sideways off the sea. ...", sound: "ambient.weather.thunder", seconds: 5 },
  ] }

// a dream (a sleep step with scenes)
{ type: "sleep", label: "Sleep a night under Elsie's roof", vision: [ { title: "A dream", text: "...", seconds: 7 } ] }
```

- `title` is optional (40 of 103 scenes have one). `seconds` defaults to 5. `sound` is any sound id. **[V]**
- `dark: true` on the step adds the Darkness effect. A dream is always dark (`objectives.js:3744` passes `true`). **[V]**
- A vision step can have a place (`place`, `at`, `offset`, with `radius`, default 8) or none. Without a place it starts wherever the player stands, the moment the step is open. **[V]**
- Scene text does not go through `pagesFor` (`data.js:877`), so `{player}` and `when` conditions do not work in scenes. No scene uses them today. **[V]**
- `tools/check-stories.mjs:100` only checks that a vision has scenes. Nothing checks a scene's length or time. **[V]**

The content: 18 visions and 9 dreams, 103 scenes, 14,461 characters. **[V]**

### 1.3 How it plays

`playVision(player, list, dark)` (`objectives.js:2956-3018`), step by step. **[V]**

1. Refuses when the player already watches a vision, is dead, or is in another dialogue (`claim` fails). The busy mark it takes is the same one forms use, so no story form can open during a vision.
2. `player.camera.fade` to black: 0.6 s in, 0.6 s hold, 1.2 s out. This is the only camera call. There is no `setCamera`, so the view never moves.
3. With `dark`: `addEffect("darkness", (total + 4) * 20)`, one effect for the whole length.
4. Waits 24 ticks.
5. For each scene:
   - `holdTitle(player, secs * 20 + 20)` sends `realm:title`, so the Side HUD boxes stop drawing.
   - `setTitle(title ? "§l" + title : " ", { subtitle: text, fadeInDuration: 10, stayDuration: secs * 20, fadeOutDuration: 10 })`.
   - `sendMessage("§7§o" + (title ? title + ": " : "") + text)`.
   - `playSound(sound, { volume: 0.8 })` when the scene has one.
   - Then it loops every 5 ticks for `secs` seconds. Every 40 ticks it sends `realm:actionbar` (45 ticks) and `setActionBar("§8Sneak to skip")`. It reads `player.isSneaking`: a sneak that starts after a moment of not sneaking skips the rest.
6. At the end (`finally`): the busy mark is released, the title is cleared with `setTitle(" ", { subtitle: " " })`, and Darkness is removed when the vision was skipped or cut.
7. It resolves `true` when the vision ended or was skipped (the step is then counted by `visionTick`), and `false` when it was cut.

What it does not do. **[V]**

- **No input lock.** `inputPermissions` is never used. The player can walk, fight, open a chest or leave the place while the scenes play. Nothing checks the distance after the start.
- **No protection.** Mobs can hurt the player, who may be blind from Darkness.
- **No hidden HUD.** `setHudVisibility` is never used.

### 1.4 Leaving, dying, another dimension

`lifecycle(player)` (`util.js:125-132`) returns a check that turns true when the player is dead or gone, changed dimension, or had their interactions cancelled (respawn and dimension change call `cancelInteractions`, `main.js:742-758`). `playVision` reads it before each scene and every 5 ticks. **[V]**

| Event | What happens | Verified |
|---|---|---|
| Dies mid-scene | Cut within 5 ticks. No credit. Title cleared. Death removes Darkness anyway. A vision with a place plays again when the player comes back; one without a place starts again right after the respawn | **[V]** |
| Changes dimension | Cut. No credit. Darkness removed. Plays again when the player is back in the place's dimension and radius | **[V]** |
| Logs out | Cut. No credit. `player.isValid` is false, so the cleanup skips `removeEffect`: see bug 6. The vision plays again after the next join | **[V]** |
| Sneaks | Skipped. The step **is** counted | **[V]** |
| Walks away from the place | Nothing: it plays on | **[V]** |
| A dream, cut or never started | Lost. The sleep step was already counted when the player lay down (`objectives.js:3684`), the dream is deleted before it plays (`:3743`), and the result is ignored (`:3744`): see bug 8 | **[V]** |

### 1.5 Party members

Visions are each player's own (`docs/PACKS.md:2691`, "clues, riddles, waits, sleeps, wearing and visions stay each player's own"). Every member inside the radius gets their own `playVision` from their own once-a-second tick, so mates at the same spot start within a second of each other and each has their own skip. A mate who is still watching is not interrupted when another mate's vision finishes the shared step (`party.js:285-288`). A mate somewhere else gets the step done without seeing anything. **[V]**

### 1.6 Which call draws each piece of text

| Text | Call | String | Channel |
|---|---|---|---|
| Scene heading | `objectives.js:2982` `setTitle` | `"§l" + sc.title`, or `" "` | Title (the biggest font, center of the screen) |
| Scene text | `objectives.js:2982`, option `subtitle` | `sc.text`, unchanged | Subtitle (big font, under the title) |
| The same text again | `objectives.js:2983` `sendMessage` | `"§7§o" + title + ": " + text` | Chat |
| Skip hint | `objectives.js:2992-2993` `setActionBar` | `"§8Sneak to skip"` | Action bar |
| After the step counts | `objectives.js:453` `sendMessage` | `"§a[Story] <label>: done."` and the next step | Chat |

All **[V]**.

## 2. Complaint 1: "one massive long line"

### 2.1 The cause

The scene text is the subtitle, and nothing wraps it.

- Server side: `sc.text` is passed as written. No helper is called. **[V]**
- Client side: Mojang's `hud_screen.json` (fetched from `Mojang/bedrock-samples`, `resource_pack/ui/hud_screen.json`) draws the subtitle as a `label` with `font_size: "large"`, `text_alignment: "center"` and **no `size`** inside a frame of `["100%", "100%cm"]`. A label with no size takes the size of its text, so it never wraps. `packs/hud_rp/ui/hud_screen.json` copies those two frames and adds only a visibility binding, so the result is the same with or without Side HUD. **[V]**
- So a 139-character sentence is one centered row. In the default font it is about 690 pixels wide at normal size (measured with the glyph table in `tools/lib/client-font.mjs`), and the subtitle is drawn larger than normal. A phone's whole screen is about 320 to 480 UI units wide (the figures `docs/PACKS.md:6721` uses). The player sees the middle third of the sentence at best. **[V]** for the widths, **[S]** for the exact scale of the subtitle font (2x, by parity with Java; see 4.1).

Only one scene has a line break (`stories/act1_signs.js:501`, "...Won't you, Brother?\n\nAnd Hollis, eyes open, asleep, nods."). **[V]**

The heading has the same problem in a smaller way. It is drawn bold in the title font, the largest. 15 of the 40 headings are wider than 300 units if the title font is 4x; the widest is "Forty years, again and again" (28 characters, 170 pixels bold at normal size). **[V]** for the counts, **[S]** for 4x.

### 2.2 Why no existing helper caught it

The repo has wrap code, but none of it is on this path. **[V]**

| Helper | Where | What it does | Why it did not help |
|---|---|---|---|
| Quest box rows | `packs/saga_bp/scripts/ui.js:1405-1460`, `:1560-1600` (`BOX_COLS = 32`, `BOX_ROWS = 10`, `rowsOf`, `fitRows`) | Estimates the rows the client will make and trims the text to fit | It inserts no line breaks. The Side HUD quest box wraps on the client, because its label has `max_size [200, 110]` (`hud_rp`, `realm_quest_slot`). The vanilla subtitle has no such size |
| Client font model | `tools/lib/client-font.mjs` (`NARROW`, `advance`, `clientRows`) | Pixel widths of the default font, and the rows a 200-pixel label makes | A test tool only. No pack imports it |
| The same table again | `packs/admin_bp/scripts/presets.js:96-100` (`LINE = 168`, `GLYPH`, `textWidth`) and `main.js:63-70` (`fit`) | Cuts a menu button line with "..." | admin_bp only, and it cuts, it does not wrap |
| `wrap(text, w = 15)` | `packs/expedition_bp/scripts/layout.js:436-449` | Character-count wrap for signs | Local to its pack |
| `wrap(text, width)` | `packs/maps_bp/scripts/main.js:144-157` | The same function | Local |
| `wrap(text)` | `packs/relics_bp/scripts/main.js:192-205` | The same function, for item lore | Local |

`tools/test-bds/examples/saga-quest-wrap.js` and `saga-note-box.js` test the Side HUD boxes only (`realm:side` messages). No test looks at a vision's title text.

Three things to carry into the spec:

- The three character-count `wrap` functions are the same code in three packs (checklist C14).
- The two glyph tables disagree: `(`, `)` and `*` are 5 pixels in `admin_bp/presets.js:98` and 4 in `tools/lib/client-font.mjs:11`; `{` and `}` are 6 (the default) in the first and 4 in the second. One of them is wrong. **[V]** that they differ, **[S]** which is right (Java's font has 5 for the parentheses).
- The existing `saga-party-stealth.js:151` waits for the **chat** copy of a scene (`/The Gray Ring: Gray hoods, a dozen or more/`), so it must change with the fix.

### 2.3 The longest scenes

Characters are counted as written (a few scenes carry `§7` and `§r` codes, 2 characters each).

| # | Chars | Shown for | Chars/s | Scene | Source | Text (start) |
|---|---|---|---|---|---|---|
| 1 | 240 | 10 s | 24.0 | act5_lantern/dawn_gift #2 | stories/act5_lantern.js:883 | I can see everything from up here. The harbor. The chapel. Lily's grav... |
| 2 | 212 | 9 s | 23.6 | act5_lantern/dawn_gift #1 | stories/act5_lantern.js:882 | My dear. If you are reading this, you let me go, and I am so grateful ... |
| 3 | 210 | 7 s | 30.0 | act1_signs/song #3 | stories/act1_signs.js:499 | §7The Cantor:§r Forty winters ago, one faithful man rang the broken no... |
| 4 | 205 | 8 s | 25.6 | act4_seals/sky_vision #6 | stories/act4_seals.js:702 | Elsie walks down off the mountain alone, the apron's light flickering.... |
| 5 | 196 | 6 s | 32.7 | act1_signs/song #1 | stories/act1_signs.js:497 | Gray hoods, a dozen or more, stand in a circle around a cracked bell h... |
| 6 | 194 | 7 s | 27.7 | act4_seals/promise #1 | stories/act4_seals.js:768 | You stand on a mountain under strange stars. A young woman in an apron... |
| 7 | 192 | 7 s | 27.4 | act1_signs/song #4 | stories/act1_signs.js:500 | §7The Cantor:§r Nothing lost. §7The circle answers: Nothing missed.§r ... |
| 8 | 189 | 6 s | 31.5 | act1_signs/song #2 | stories/act1_signs.js:498 | A tall figure in a hood darker than the rest lifts one hand, and the h... |
| 9 | 189 | 7 s | 27.0 | act3_deep/lamp #3 | stories/act3_deep.js:126 | One of them looks straight up, through a mile of rock, as if she can s... |
| 10 | 189 | 7 s | 27.0 | act4_seals/sky_vision #1 | stories/act4_seals.js:697 | People in pale robes stand on a mountaintop, reading the sky with inst... |
| 11 | 186 | 7 s | 26.6 | act1_signs/count #2 | stories/act1_signs.js:641 | It goes down forever. It is not empty. It is a dark that listens. Ever... |
| 12 | 185 | 6 s | 30.8 | star_kittens/same_sky #2 | stories/side_bright.js:436 | A woman with gray in her hair sits on the wall, laughing at something.... |
| 13 | 184 | 7 s | 26.3 | act4_seals/sky_vision #5 | stories/act4_seals.js:701 | A bell rings wrong from a harbor tower. The Lantern shudders, cracks, ... |
| 14 | 184 | 9 s | 20.4 | act5_lantern/dawn_gift #3 | stories/act5_lantern.js:884 | Look after Wren. She will try to run the inn like a stable. Let her. G... |
| 15 | 183 | 7 s | 26.1 | act2_choir/mayor #2 | stories/act2_choir.js:827 | BY ORDER OF THE MAYOR: the events of the storm night are not to be spo... |
| 16 | 183 | 8 s | 22.9 | act4_seals/sky_vision #4 | stories/act4_seals.js:700 | Pass after pass, the Starwrights grow old and few. At the last good pa... |
| 17 | 180 | 7 s | 25.7 | act1_signs/song #5 | stories/act1_signs.js:501 | §7The Cantor:§r And the little keeper hears our master now, every nigh... |
| 18 | 175 | 7 s | 25.0 | act3_deep/listening #6 | stories/act3_deep.js:221 | The note cracks. High above, the Lantern splits like dropped glass and... |
| 19 | 173 | 6 s | 28.8 | hollis_faith/forgive #2 | stories/side_dark.js:1130 | He reaches the last page and hesitates. Then: 'Brother Ashgrave, keepe... |
| 20 | 172 | 7 s | 24.6 | act4_seals/sky_vision #2 | stories/act4_seals.js:698 | They cannot kill the Hollow. So they build: a vault under the sea, a r... |

Every vision and dream, by how much it writes to chat (headings and text together):

| Vision | Kind | Where | Scenes | Chat characters | Length today | Darkness |
|---|---|---|---|---|---|---|
| act4_seals/sky_vision | vision | seal_sky | 7 | 1320 | 51 s |  |
| act3_deep/listening | vision | old_chapel | 7 | 1012 | 45 s | yes |
| act1_signs/song | vision | choir_ring | 5 | 994 | 33 s | yes |
| act5_lantern/dawn_gift | vision | anywhere | 4 | 772 | 36 s |  |
| act1_signs/count | vision | observatory | 5 | 728 | 29 s | yes |
| act1_signs/fallen | vision | starfall | 5 | 726 | 26 s | yes |
| act2_choir/mayor | vision | anywhere | 4 | 719 | 26 s | yes |
| vesna_bargain/fen_mother | vision | witch_hut | 4 | 665 | 23 s | yes |
| act3_deep/apron | dream | after waking | 4 | 622 | 24 s | yes |
| act3_deep/lamp | vision | anywhere | 4 | 604 | 25 s | yes |
| act1_signs/inn | vision | anywhere | 4 | 556 | 20 s |  |
| act5_lantern/choice | vision | seal_sky | 4 | 518 | 25 s |  |
| act5_lantern/gate | vision | hollow_gate | 4 | 491 | 25 s | yes |
| hollis_faith/forgive | vision | graveyard | 3 | 490 | 17 s |  |
| inn_ghost/storm_child | vision | lighthouse | 4 | 487 | 21 s | yes |
| hollis_faith/dream | dream | after waking | 4 | 482 | 21 s | yes |
| act1_signs/keeper | vision | old_chapel | 4 | 453 | 19 s | yes |
| star_kittens/same_sky | dream | after waking | 3 | 436 | 17 s | yes |
| heart_elsie/hearth | dream | after waking | 3 | 400 | 17 s | yes |
| act5_lantern/dawn_crown | dream | after waking | 3 | 385 | 21 s | yes |
| inn_ghost/cold_room | dream | after waking | 3 | 374 | 15 s | yes |
| act4_seals/promise | dream | after waking | 2 | 368 | 14 s | yes |
| act3_deep/seal | vision | seal_stone | 3 | 347 | 17 s |  |
| w_anwen_survey/rest | vision | observatory | 3 | 346 | 12 s |  |
| singing_forge/dunmore | vision | offset | 3 | 327 | 15 s |  |
| heart_hollis/plain_sleep | dream | after waking | 2 | 227 | 11 s | yes |
| smugglers_run/crate | dream | after waking | 2 | 220 | 11 s | yes |

### 2.4 The distribution

103 scenes. **[V]**

| Measure | Characters |
|---|---|
| Shortest | 50 |
| 25th percentile | 119 |
| Median | 139 |
| Mean | 140.7 |
| 75th percentile | 165 |
| 90th percentile | 186 |
| Longest | 240 |

| Characters | Scenes |
|---|---|
| 40-59 | 1 |
| 60-79 | 1 |
| 80-99 | 9 |
| 100-119 | 17 |
| 120-139 | 26 |
| 140-159 | 19 |
| 160-179 | 13 |
| 180-199 | 13 |
| 200-219 | 3 |
| 240 | 1 |

- Every scene is longer than 40 characters and 92 are longer than 100. No scene fits one row of any HUD text channel.
- Widths in the default font at normal size: 245 pixels (shortest) to 1,210 (longest), median 690. The average over all scene text is 5.0 pixels a character, not the 6 of a plain letter.
- Time on screen: 4 to 10 seconds (4 s: 9 scenes, 5 s: 24, 6 s: 41, 7 s: 22, 8 s: 4, 9 s: 2, 10 s: 1). That is a median of 24 characters a second and a maximum of 36.3 (`act1_signs/inn` scene 1: 145 characters in 4 seconds). 95 of 103 scenes need more than 17 characters a second. The first 10 ticks of each scene are also a fade-in.
- Headings: 40. Longest 28 characters. 25 of 40 fit 300 units at 4x bold; all 40 fit 300 units at 2x when not bold; 3 do not fit at 2x bold.

## 3. Complaint 2: "a wall of text in the chat"

### 3.1 The cause

`objectives.js:2983`: `player.sendMessage("§7§o" + (sc.title ? sc.title + ": " : "") + sc.text)`, once per scene, at the moment the scene's title goes up. **[V]**

- It is **per scene**, not one block: 2 to 7 messages over 11 to 51 seconds. Chat wraps each one, so a 180-character scene is 3 to 5 chat rows on a phone. The longest vision (`act4_seals/sky_vision`) puts 1,320 characters in chat; the table above has every vision's total.
- It is **on purpose**. The function's comment says "a title and subtitle per scene (also in chat)" (`objectives.js:2951`), and `docs/PACKS.md:2523` tells players "titles show each scene (also written in chat)". It reads as a log to scroll back to, and in practice it was the only place the text could be read at all, because the subtitle is cut off.
- Bedrock also draws new chat lines on the HUD for a few seconds, top left. So during the cutscene the gray wall covers part of the picture, on top of the cut-off subtitle. **[S]** (how long and how wide the chat overlay is on a phone).
- After the last scene the step counts and `bump` adds `[Story] <label>: done.` and the next step (`objectives.js:453-475`), so the wall ends with two more lines. **[V]**
- Five scenes carry `§7Name:§r` inside the text (all "The Cantor", `stories/act1_signs.js:498-501`). In chat the `§r` ends the gray italics of `§7§o`, so the rest of those lines is white and upright. **[V]**

### 3.2 What the other story text paths do

| Path | Where | Channel | A wall? |
|---|---|---|---|
| NPC talk: intro, outro, choices | `util.js:362-373` (`dialog`), `ui.js` | A form, one page at a time with Next. Forms wrap by themselves. Pages are kept under 450 characters (`tools/check-stories.mjs:685`) | No |
| Accepting a chapter | `ui.js:675-694` | Chat: `[Story] Title: Chapter`, then **one message per objective** (`ui.js:684`), then missing places, travel tips, then where the tracker is | Mild: 5 to 9 lines at once |
| Party mate's accept | `ui.js:548-553` | Chat: joined line, title line, one message per objective, a party note | Mild: 5 to 8 lines |
| Clues (`inspect`) | `objectives.js:2053` | Chat, `[Clue 2/4] text`, one message per clue found | No, and by design (`docs/PACKS.md:2511`: no blocking popup) |
| Progress notes | `objectives.js:420-428` (`note`), `:404-414` (`showLine`) | The small Side HUD box, or the action bar | No |
| The tracker | `ui.js:1380-1400`, `:1520-1600` | Side HUD quest box (wraps on the client), or one action bar line | No |
| A wanderer's outro when they are gone | `ui.js:1111` | Chat, one message per page | Mild: 1 to 3 pages |
| Hints, the Story Log, the Codex, a chapter's page | `ui.js:754`, `:1694-1820` | Forms | No |
| Step done, chapter done | `objectives.js:453-475` | Chat, one or two lines | No |

All **[V]**. Visions are the only path that puts long narrative prose in a HUD title, and the only one that copies it into chat scene by scene.

## 4. The limits of each text channel on Bedrock

### 4.1 What is known

| Fact | Source | Mark |
|---|---|---|
| `setTitle(title, { subtitle?, fadeInDuration, stayDuration, fadeOutDuration })`, all three times in ticks and all three required; `updateSubtitle(text)`; `setActionBar(text)`. Nothing else: no position, size or wrap option | `@minecraft/server` 2.1.0 `index.d.ts` (`ScreenDisplay`, `TitleDisplayOptions`), downloaded from npm | **[V]** |
| The title label is `font_size: "extra_large"`, the subtitle `"large"`, both centered, with no size: no wrap. They sit in a stack in the middle of the screen (`offset [0, -19]`) | Mojang `hud_screen.json`, `hud_title_text` | **[V]** |
| The action bar is a label with no size and the normal font, in a box `100%c + 12px` by `100%c + 5px`, whose **center** is 68 units above the bottom edge (`offset [0, "50%-68px"]`). No wrap. It fades out over 3 seconds (`in_expo`, so it is nearly solid for the first 2) and is then destroyed | Mojang `hud_screen.json`, `hud_actionbar_text`, `anim_actionbar_text_alpha_out` | **[V]** |
| `\n` starts a new row in a subtitle | The Side HUD fallback depends on it (`tools/side-shared.js:15-19`: "Without hud_rp the vanilla subtitle shows every slot, one per line"), and one scene uses it | **[V]** by reading, never by this research on a client |
| `\n` starts a new row in an action bar | It is the same control type (a label) as the subtitle and the side boxes. No pack in the repo sends a multi-row action bar today | **[S]** |
| `\n` in a title | Same reasoning | **[S]** |
| Font sizes: normal is 1x; `large` is 2x and `extra_large` is 4x | Not in the Bedrock Wiki's JSON UI page (it lists the four names and no scale). Assumed from Java, where a title is 4x and a subtitle 2x | **[S]** |
| A screen is about 320 to 480 UI units wide and 180 to 240 tall on phones | `docs/PACKS.md:6721` (Side HUD: "a 240-unit UI height", "about 180 units tall, such as a phone cover screen", "a 320-unit screen") | **[V]** that the repo designs for these; **[S]** for the owner's unfolded Fold, which is nearly square and may be narrower than 320 units |
| The default font is not monospace: most letters and digits advance 6 pixels, a space 4, `i ! . , : ; ' |` 2, `l` and a backtick 3, `I t [ ]` and `"` 4, `f k < >` 5, `@ ~` 7. Bold adds 1 a glyph | `tools/lib/client-font.mjs`, `packs/admin_bp/scripts/presets.js:98` | **[V]** that both tables say so; they disagree on `( ) * { }` |
| A label wraps at spaces when it has a `size` or `max_size`, and breaks a word wider than a row | `tools/lib/client-font.mjs:1-6`, and the Side HUD quest box (`max_size [200, 110]`) depends on it. The Bedrock Wiki only lists a legacy `wrap` property as no longer working, which fits: the size does it | **[V]** by reading; the repo's own docs say the box geometry still "awaits its own actual-client acceptance" |
| `player.clientSystemInfo.platformType` (`Console`, `Desktop`, `Mobile`), `player.inputInfo.lastInputModeUsed`, `world.afterEvents.playerButtonInput` (Jump and Sneak, pressed and released, with filters), `player.isJumping`, `player.inputPermissions.setPermissionCategory`, `onScreenDisplay.setHudVisibility(Hide or Reset, [elements])`, `camera.setCamera` are all in stable 2.1.0 | The same `index.d.ts`; `afk_bp`, `dolphin_bp`, `night_bp` and `silly_bp` already use the button event | **[V]** |
| JSON UI can test the action bar's text: copy `$actionbar_text` into a variable and use it in `visible` (`"$atext": "$actionbar_text", "visible": "(not ($atext = 'hello world'))"`); `('%.Ns' * $var)` cuts by bytes and `(a - b)` removes a substring | Bedrock Wiki, Intro to JSON UI | **[V]** (the wiki says so) |
| JSON UI is being replaced by Ore UI, which resource packs cannot change | The same page: "any add-ons using JSON UI will eventually break in the coming years" | **[V]** (the wiki says so) |

### 4.2 What fits

Taking 320 units as the narrowest screen and the scales above:

| Channel | Font | Characters a row on a 320-unit screen | Rows that are comfortable | Notes |
|---|---|---|---|---|
| Title | 4x **[S]**, bold in visions | About 11 (260 units / 24) | 1 | In the middle of the view |
| Subtitle | 2x **[S]** | About 24 (260 / 12, average text) | 2 to 3 | In the middle of the view; shares the channel with the Side HUD boxes, which disappear while it shows |
| Action bar | 1x | About 45 at 228 pixels (5.0 pixels a character on average) | 3 to 4 | At the bottom, above the hotbar: where film captions go. Needs a resend every second |
| Chat | 1x, wraps by itself | Whole width of the chat area | Any | Scrolls away; top left on the HUD |
| Form body | 1x, wraps by itself, scrolls | Any | Any | Blocks play while open |

So the subtitle can hold about 70 characters in 3 rows and the action bar about 135. The median scene is 139.

### 4.3 Pixel widths or a character count?

**Pixel widths.** A character-count wrap must assume 6 pixels a character to be safe, and real prose averages 5.0, so it wastes a sixth of every row; if it assumes the average instead, a row of capitals overflows ("BY ORDER OF THE MAYOR:" is all 6-pixel glyphs). Measured over the 103 scenes at 228 pixels: the pixel wrap makes rows of up to 50 characters and 162 pages; a 38-character count (228 / 6) makes 441 rows where the pixel wrap makes 381 (16% more).

The table is small (27 entries, ASCII only, which is all game text may contain) and already exists twice in the repo. A plain count stays good enough for one thing only: item lore and signs, where the three existing `wrap` functions are used, because their limits are set by the item tooltip and the sign, not by the screen. They can move to the shared module with a `px` of `width * 6` later.

### 4.4 Safe areas

- The action bar and the title are centered horizontally, so side notches and rounded corners do not reach them. **[V]** (their anchors in Mojang's file)
- Vertically the action bar's center is fixed at 68 units above the bottom. It grows up and down from there: 3 rows (35 units with padding) reach from 50 to 86 units above the bottom, 4 rows from 45 to 91, 5 rows from 40 to 96. The hotbar and XP bar end at about 34 units, hearts and hunger at about 49, the armor row at about 59. So 3 rows reach into the armor row (only a player wearing armor has one), and 4 or 5 rows reach the top of the hearts. The first page of a vision can be 5 rows (speaker, 3 rows of text, the hint). **[S]** (the bar heights are from memory, not measured: test 1 and 2 in section 9)
- The Side HUD boxes are up to 200 units wide and sit at the left and right edges, centered vertically between y 48 and the bottom (`docs/PACKS.md:6720`). A caption is 240 units wide in the center. On a 320-unit screen only 40 units are free on each side, so a tall quest box at Right 4 and a caption can overlap at the bottom right. **[S]** On screens of 440 units and more they cannot.

## 5. Could `hud_rp` draw a caption box?

How the Side HUD gets its text today. **[V]**

- The server can send the HUD only a title, a subtitle and an action bar. Every side box travels in **one subtitle**: the title is the marker `§s§2§r` (color codes only, invisible), and the subtitle is 9 bytes of radar flags plus 12 fixed-width segments, 5,425 bytes in all (`tools/side-shared.js:1-20`, `docs/PACKS.md:6733`).
- `hud_rp` cuts each segment out with string expressions (`'%.159s' * (sub - ('%.10s' * sub))`), hides the vanilla title while the title is a marker, and draws each segment in a `label` with a `max_size`, which is what wraps it (`packs/hud_rp/ui/hud_screen.json`: `realm_slot_text`, `realm_slot`, `realm_quest_slot`).
- Real titles share that channel, so every pack announces one with `realm:title` first and the boxes stop drawing until it has faded (the title protocol).

Three ways to add a caption box, and what each costs:

| Way | How | Cost | Without the resource pack |
|---|---|---|---|
| **A. A thirteenth segment** in the side boxes subtitle | `side.show(player, "caption", text, ticks)`; a new `realm_caption` control at the bottom center with a fixed width | Changes the byte layout: every copy of `side.js` (7 packs) and `hud_rp` must ship together ("Mixed versions don't mix well", `docs/PACKS.md:6740`). Every title any pack draws grows by the segment (500+ bytes), including the minimap's many draws a second. `tools/hud-layout.test.mjs`, `hud-state-parts.test.mjs` and `side-compositor.test.mjs` pin the layout | The caption is one more row in the pile of readouts in the middle of the screen, at the subtitle's large font |
| **B. A caption marker title** (`§s§3§r`) with the caption as the whole subtitle | `holdTitle`, then `setTitle("§s§3§r", { subtitle })`; `hud_rp` hides the vanilla frames for that marker too and shows a wrapped label | Small in `hud_rp` (one control, one more marker in two bindings). No change to `side.js`. But the side boxes vanish for the whole cutscene | The subtitle at the large font, where 3 rows hold about 70 characters: twice as many pages |
| **C. Restyle the action bar** when its text starts with a marker (`§s§c§r`) | The server wraps and sends the caption on the action bar. `hud_rp` gives `hud_actionbar_text` a second look for marked text: anchored so it grows upward from a fixed line, more padding, a darker background | Small: one control definition in `hud_screen.json`, no protocol change, no other pack touched. Needs a test on a client that a variable copied from `$actionbar_text` can pick the look | **The same text, in the vanilla action bar: normal font, already wrapped, above the hotbar. Fully readable** |

**Recommendation:** C, in two steps. Step 1 is the server side only (wrap, page, send on the action bar) and fixes the complaint for every player with no resource pack release. Step 2 is the `hud_rp` look, and is optional polish: with the server doing the wrapping, the client box no longer has to wrap anything. It only moves the box so it cannot touch the hearts, and makes it look like a caption. A and B are worse than C on every row of the table.

A caption box bound to a hidden channel "like the existing Side HUD boxes" is feasible (B is exactly that, and so is A), but the side boxes' channel is the title, the title's fallback is the large font, and that is the wrong fallback for long text.

## 6. The same class of problem in other packs

The whole of `packs/*/scripts` was searched for `setTitle`, `updateSubtitle`, `setActionBar` and bursts of `sendMessage`. Widths are in pixels of the default font at normal size (`tools/lib/client-font.mjs`). Multiply by the font scale: on a 320-unit screen a title holds about 65 pixels if it is 4x and a subtitle about 130 if it is 2x. **[V]** for the strings and widths, **[S]** for the scales.

### 6.1 Titles and subtitles

| Where | String | Example | Width (1x) | Verdict |
|---|---|---|---|---|
| `packs/saga_bp/scripts/objectives.js:2982` | Subtitle: the scene text | 50-240 characters | 245-1,210 | **Broken on every screen** |
| `packs/saga_bp/scripts/objectives.js:2982` | Title: `§l` + heading | "Forty years, again and again" | up to 170 | Too wide for phones (15 of 40) |
| `packs/town_bp/scripts/main.js:487-495` | Title: `<Town> is now a <Level> (level N)` | "Oakhaven is now a Village (level 2)" | 173 and more (the town name is the player's) | **Too wide everywhere** as a title |
| `packs/town_bp/scripts/main.js:489-495` | Subtitle: `New projects: a, b` | "New projects: Notice Board, Market Stall" | 203 | Too wide on phones |
| `packs/expedition_bp/scripts/main.js:2434` | Subtitle: `<Dungeon> <Level> cleared in <time>` | "Sculk Depths Nightmare 3 cleared in 12:34" | 211 | Too wide on phones |
| `packs/expedition_bp/scripts/main.js:2434` | Title: "Expedition complete" | | 97 | Too wide on phones if 4x |
| `packs/expedition_bp/scripts/main.js:1726` | Subtitle: `<Level> - the clock is running` | "Nightmare 3 - the clock is running" | 172 | Too wide on phones |
| `packs/expedition_bp/scripts/main.js:1726` | Title: `§l` + dungeon name | | bold | Check each name |
| `packs/expedition_bp/scripts/main.js:2358` | Title: boss name | "The Warlord's Ravager" | 115 | Too wide on phones if 4x |
| `packs/calendar_bp/scripts/main.js:508` | Subtitle: "A festival begins: /realm:calendar" | | 170 | Too wide on phones |
| `packs/calendar_bp/scripts/main.js:508`, `:1293`, `:1829` | Title: festival name, "The Choir is coming", "The siege is broken" | "Midsummer Regatta" | 92-96 | Too wide on phones if 4x |
| `packs/atlas_bp/scripts/main.js:564` (drawn at `:529`) | Title: region name, "The <Adjective> <Noun>" | "The Whispering Greenwood" (24 characters; median 16, 90th percentile 19) | up to 132 | Too wide on phones if 4x |
| `packs/domt_bp/scripts/main.js:179` | Title: `§l` + card name | "the Deck's Champion" | 116 bold | Too wide on phones if 4x |
| `packs/admin_bp/scripts/actions.js:107-111` | Title and subtitle typed by an operator, cut at 100 characters, never wrapped | | up to 600 | An operator can send a broken title. Measure and warn, or wrap |
| `packs/welcome_bp/scripts/main.js:319` | Title: the operator's welcome title | Default "Welcome!" | short | Fine by default; same warning as above when edited |
| `packs/moon_bp/scripts/main.js:145` | "Blood Moon" / "Crops grow faster tonight" | | 60 / 133 | Borderline subtitle |
| `packs/skills_bp/scripts/main.js:272` | `<Skill> <level>` / "Level up!" | "Woodcutting 25" | 74 | Borderline title |
| `packs/domt_bp/scripts/events.js:104-167`, `packs/slots_bp/scripts/main.js:336`, `packs/silly_bp/scripts/main.js:658-673` | "FIGHT!", "VICTORY", "JACKPOT!", "LIFTOFF!", a countdown | | short | Fine |

Every one of these would be settled by the same measurement: how many digits of a ruler title fit on the owner's phone (section 9).

### 6.2 Action bars

84 call sites. All are single lines; none is prose. The long ones (longest literal on the line, variables counted as 6 characters):

| Where | Text | Width (1x) |
|---|---|---|
| `packs/settings_bp/scripts/main.js:573` | "Only operators can change the realm's settings. Your own: /realm:prefs" | 364 |
| `packs/admin_bp/scripts/main.js:1286` | "The <item> item is for operators here. /realm:admin opens the menu" | about 365 |
| `packs/storm_bp/scripts/main.js:547` | "This lightning rod isn't charged. A lightning strike charges it." | 305 |
| `packs/skills_bp/scripts/calling.js:699` | "The Sigil is quiet: you have no Calling. /realm:skills_calling" | about 300 |
| `packs/stash_bp/scripts/main.js:533`, `:185`, `:1248`, `:724` | "You already have N locked containers. Unlock one first." and three more | 250-300 |
| `packs/calendar_bp/scripts/main.js:1867`, `:1659` | "The circle's stones won't move. Silence its bell instead." | about 270 |
| `packs/atlas_bp/scripts/main.js:1317`, `:1234` | "The water is still. You've taken its star-dust already." | about 260 |
| `packs/elytra_bp/scripts/main.js:470` | "Too many jukeboxes are playing Run Away on this world." | about 260 |
| `packs/hud_bp/scripts/main.js:66-72` | The Coordinates HUD above the hotbar: `X .. Y .. Z ..  |  Facing NE  |  Day 4 6:20 AM  |  <other packs' lines>` on one row | 250 and more with extras |
| `packs/saga_bp/scripts/ui.js:1393` | The tracker above the hotbar (not the default): `<Short>: <step line>` on one row | can pass 300 |

Anything over about 300 pixels is cut off at both ends on a 320-unit screen. These are all one `wrap(text, 300).join("\n")` away from fitting, if `\n` works in the action bar.

### 6.3 Chat

No other pack sends prose to chat scene by scene. Long single messages (up to about 250 characters) exist in `expedition_bp` (`main.js:2463`, `:3330`, `:2551`), `admin_bp` (`setup.js:588`), `dolphin_bp` (`main.js:251`) and `saga_bp`'s party lines (`ui.js:857`, `:867`, `:529`), and chat wraps those by itself. The multi-line messages that exist are answers to a command the player typed (`caravan_bp/main.js:1093`, `elite_bp/main.js:1561`, `guilds_bp/main.js:180`, `npc_bp/main.js:2362`, `stats_bp/main.js:662`, `settings_bp/main.js:308`, `saga_bp/places.js:1205`). Welcome posts its title and body to chat only when an operator turns `chat` on (`welcome_bp/config.js:28`, off by default); News sends one line. The burst that comes closest to a wall, after visions, is the story's own chapter accept (`ui.js:675-694`). **[V]**

## 7. The proposed fix

### 7.1 A shared text module

**Files**

- `tools/text-shared.js`: the source. Pure JavaScript, no imports, no module-level state, so node tests import it directly and the bundle can keep one copy.
- `tools/sync-text.mjs`: copies it to `scripts/text.js` in each pack that has one, with `syncCopies` from `tools/lib/shared-copy.mjs` (the `sync-gossip` pattern). `--check` goes into `npm run check` next to the other sync checks.
- `tools/bundle.mjs:264`: add `"text.js"` to `SHARED`.
- `tools/lib/client-font.mjs`: import the table from `tools/text-shared.js` instead of holding its own, so there is one table. `packs/admin_bp/scripts/presets.js:98` then imports `widthOf` from its own `text.js` copy. Decide the five characters the two tables disagree on first; until a client says otherwise use the wider value (5 for `( ) *`, 5 for `{ }`), because a row that is estimated too wide only wraps early.

**API**

```js
/** Advance of each glyph that is not 6 pixels. ASCII only. */
export const ADVANCE = { " ": 4, "!": 2, ... };
export const DEFAULT_ADVANCE = 6;

/** Text without its section-sign codes. @param {string} s */
export function plain(s)

/** Width in font pixels at normal size. Codes take no room; bold (section l) adds 1 a glyph until section r. @param {string} s */
export function widthOf(s)

/**
 * Lines of at most `px` pixels, broken at spaces. A "\n" in the text always breaks. A word wider than a line is
 * split between characters. Each line after the first starts with the codes that were active at the break, so a
 * color or bold run carries over. No line starts or ends with a space.
 * @param {string} text @param {number} px @returns {string[]}
 */
export function wrap(text, px)

/**
 * Pages of at most `rows` lines of at most `px` pixels. Sentences stay together when they fit a page; a "\n\n"
 * always starts a page; when a sentence needs more than a page its lines are spread evenly over the pages it needs
 * (4 lines at 3 rows become 2 + 2, not 3 + 1).
 * @param {string} text @param {{ px: number, rows: number }} box @returns {string[][]}
 */
export function pages(text, box)

/** One line cut to `px` with "..." (what admin_bp's fit does). @param {string} text @param {number} px */
export function fit(text, px)

/**
 * Ticks a reader needs: lead + characters / cps, between min and max.
 * @param {string} text @param {{ cps?: number, lead?: number, min?: number, max?: number }} [o]
 *   defaults: cps 15, lead 12 ticks, min 40 ticks, max 200 ticks
 */
export function readTicks(text, o)

/**
 * A title and subtitle that fit. A title wider than `titlePx` moves to the subtitle (and the subtitle below it);
 * a subtitle wider than `subPx` is wrapped to at most `subRows` lines and then cut with "...".
 * @param {string} title @param {string} subtitle
 * @param {{ titlePx?: number, subPx?: number, subRows?: number }} [o] defaults 64, 128, 2
 * @returns {{ title: string, subtitle: string }}
 */
export function fitTitle(title, subtitle, o)

/** The widths the HUD channels hold on the narrowest screen, at normal font size. */
export const HUD = { BAR_PX: 228, BAR_ROWS: 3, NOTE_PX: 300, TITLE_PX: 64, SUB_PX: 128 };
```

`TITLE_PX` and `SUB_PX` are 256 units divided by the assumed 4x and 2x. They are the two numbers the ruler test in section 9 sets.

**Why 228 pixels and 3 rows.** 228 plus the action bar's 12 units of padding is 240, three quarters of a 320-unit screen, and it averages 45 characters a row, close to the 42 that film captions use. Measured over the 103 scenes:

| Width | 3 rows a page: pages, scenes on one page | 4 rows a page: pages, scenes on one page | Longest row |
|---|---|---|---|
| 200 | 184, 23 | 137, 69 | 44 characters |
| **228** | **162, 44** | 120, 86 | 50 |
| 240 | 153, 53 | 116, 90 | 52 |
| 264 | 137, 69 | 108, 98 | 56 |
| 300 | 122, 84 | 105, 101 | 63 |

Three rows keep the vanilla action bar clear of the hearts (4.4). With the `hud_rp` look of step 2 the box grows upward, and 4 rows become safe; the constants live in one place so that is a one-line change.

**Unit tests: `tools/text-shared.test.mjs`**

- `widthOf`: known strings ("iii" is 6, "MMM" is 18, a space is 4); codes add nothing; `§l` adds 1 a glyph and `§r` ends it.
- `wrap`: no line over `px` unless it is one unbreakable word; no leading or trailing spaces; `\n` kept; wrapping the joined result again changes nothing; the words in order are the input's words; a `§7` run that crosses a break starts the next line with `§7`; a 400-pixel word is split.
- `pages`: every page has at most `rows` lines; pages joined give back the text; "A. B. C." with room for two sentences a page breaks after B; a 4-line sentence at 3 rows gives 2 + 2; `\n\n` starts a page.
- `readTicks`: 0 characters gives `min`; 1,000 gives `max`; 150 characters at 15 a second gives 212, capped to 200.
- `fitTitle`: a short title is untouched; "Oakhaven is now a Village (level 2)" moves to the subtitle; a long subtitle becomes 2 lines.
- **Every scene in the game:** for all 103 scenes, each page of `pages(text, { px: 228, rows: 3 })` has at most 3 lines of at most 228 pixels, and no scene needs more than 3 pages. This is the regression test for the complaint.
- The table: `tools/lib/client-font.mjs`, `admin_bp`'s `textWidth` and the copy inside `tools/test-bds/examples/saga-quest-wrap.js` all agree with `ADVANCE` (extend `tools/client-font.test.mjs`, which already checks the scenario's copy).

**`tools/check-stories.mjs`** (and `tools/check-stories.test.mjs`):

- error: a scene heading wider than `HUD.SUB_PX` at normal weight;
- warning: a scene that needs more than 3 pages (write it as two scenes);
- error: `by` is not a string, `seconds` is not a positive number;
- error: a vision whose computed length is over 120 seconds.

### 7.2 Captions for cutscenes

**The scene data** (`packs/saga_bp/scripts/types.js:72-75`, `docs/STORY_BIBLE.md:587`):

```js
/**
 * One scene of a vision.
 * @typedef {object} Scene
 * @property {string} text      what the caption says; any length, it is wrapped and paged
 * @property {string} [title]   a heading shown big in the middle while the scene starts (keep it under 20 characters)
 * @property {string} [by]      who speaks: shown as the caption's first row, in yellow
 * @property {string} [sound]
 * @property {number} [seconds] the least time the scene lasts; the reading time is used when it is longer
 */
```

Old data keeps working unchanged: `title`, `text`, `sound` and `seconds` mean what they meant, except that `seconds` is now a minimum. The five Cantor scenes can move their `§7The Cantor:§r` prefix into `by: "The Cantor"` (one of them has three speakers in one text and should become three scenes).

**What the player sees**

```
                      The Rope                        <- the heading: a real title, 3 seconds, then gone

   +----------------------------------------------+
   | Someone is hauling the bell rope. Not wildly.|   <- the caption: action bar, normal font,
   | In a rhythm. Slow, slow, quick. Slow, slow,  |      at most 3 rows of 228 pixels (+ 1 row for `by`)
   | quick. Like a heartbeat with something wrong |
   +----------------------------------------------+
                  [ hotbar ]
```

Then the second page: "inside it." alone would be an orphan, so `pages` splits this scene 2 + 2.

**The strings**

- Caption: `CAPTION_MARK + [by ? "§e" + by + "§r" : null, ...lines, hint].filter(Boolean).join("\n")`, where `CAPTION_MARK = "§s§c§r"` (color codes only: invisible, and what step 2's `hud_rp` look keys on) and `hint` is `"§7Jump: next   Sneak: skip"`, on the first page of the vision only. `§7`, not today's `§8`: dark gray on the bar's dark background is hard to read.
- Heading: through `fitTitle`. A heading that fits the title is `setTitle(heading, { subtitle: " ", fadeInDuration: 10, stayDuration: 40, fadeOutDuration: 10 })` after `holdTitle(player, 60)`; one that does not goes in the subtitle with a `" "` title. No `§l`: bold costs a pixel a glyph. A scene without a heading sends no title at all, so the Side HUD boxes stay.

**Timing, in ticks**

| Step | Ticks |
|---|---|
| Fade to black, as today | 12 in, 12 hold, 24 out; the first scene starts at tick 24 |
| Heading | 10 in, 40 stay, 10 out (the title hold is 60) |
| A caption page | `readTicks(plain(page))`: 12 + characters * 20 / 15, at least 40, at most 200. 45 characters: 72 ticks. 90: 132. 135: 192 |
| Resend of the page while it shows | every 20 ticks, with `realm:actionbar { player, ticks: 30, from }` first and `ownUntil` set to now + 30 |
| Jump is ignored at the start of a page for | 10 ticks |
| Sneak is ignored at the start of the vision for | 10 ticks |
| Between pages and between scenes | 0: the next text replaces the last |
| A scene with `seconds` longer than its pages | the last page stays until `seconds * 20` |
| Darkness (dark visions) | 60 ticks, added again every 20, so it ends at most 3 seconds after the vision does, however it ends |
| End | `setActionBar("")`, and the title cleared as today only if a heading is still up |

At 15 characters a second the 27 visions grow from 616 seconds in all to about 1,070: the median vision from 21 to 36 seconds, the longest (`act4_seals/sky_vision`) from 51 to 90. That is the price of text that can be read; Jump lets a fast reader go at their own pace.

**Controls**

- **Jump: next page.** From `world.afterEvents.playerButtonInput` (button `Jump`, state `Pressed`), with one module-level subscription that returns at once when nobody is watching (`if (!watching.size) return`).
- **Sneak: skip the vision.** The same event (button `Sneak`, `Pressed`), plus today's `isSneaking` poll every 5 ticks as a fallback (the BDS scenarios set `isSneaking` on simulated players). The step still counts, as today.
- No input lock. The player keeps control, as today.

**Function signatures** (in `packs/saga_bp/scripts/objectives.js`, or a new `packs/saga_bp/scripts/caption.js` that `objectives.js` imports):

```js
/** The pages of a scene: each is the caption text for one action bar. @param {Scene} sc @param {boolean} first the vision's first scene (adds the hint row to its first page) @returns {{ text: string, ticks: number }[]} */
export function captionPages(sc, first)

/**
 * Shows one caption until its time is up, Jump is pressed, Sneak is pressed or the player is gone.
 * @param {Player} player @param {{ text: string, ticks: number }} page @param {() => boolean} stale
 * @returns {Promise<"done" | "next" | "skip" | "cut">}
 */
async function showCaption(player, page, stale)

/** Unchanged signature and return value. */
export async function playVision(player, list, dark = false)
```

`playVision` keeps its contract (true when it ended or was skipped, false when it was cut; the lock handling the unit tests pin), so `visionTick`, the dream path and `party.js` do not change.

### 7.3 What goes to chat

**Nothing while the scene plays.** After it (ended or skipped), one line:

```
§7[Story] Read it again in /realm:saga: Visions and dreams.
```

The step's own `[Story] <label>: done.` follows as today.

**A "Visions and dreams" page in the Story Log** replaces the chat as the place to read a scene again. A form is the right place for long text: it wraps by itself, scrolls, and stays until closed.

- `packs/saga_bp/scripts/ui.js`, `chapterInfo` (about line 794): a button `Visions and dreams (N)` when the chapter has vision or dream steps that are done.
- The finished story's page (about line 1797): the same button, for every chapter of the story.
- It lists the visions by their step label. Picking one shows a form: title = the story, body = each scene as `§l<heading>§r`, `§e<by>:§r`, the text, a blank line. Buttons: `Watch it again` (plays it with `playVision`, no credit) and `Back`.
- No new saved data: a vision counts as seen when its step is done (`objDone`) or its chapter is finished (`st.dn`).
- This also gives back what is lost today: a skipped vision, a dream that was cut, and a party step a mate finished for you. For that last case add one chat line to the mate who was not there: `§7[Party] <Name> saw a vision for the party. Read it in /realm:saga.`

**The chapter accept burst** (`ui.js:675-694`, `:548-553`): send the objectives as one message joined with `\n` instead of one message each, and drop the tracker sentence after the player's first chapter. This is small and optional.

### 7.4 A per-player preference

One is justified: **how fast the pages turn**. The Realm has children and adults, phones and televisions, and no single reading speed suits all of them. A second one (scene text in chat) is not justified: the Story Log covers it.

`packs/saga_bp/scripts/settings.js`, a world default and a player option in `/realm:prefs`:

```js
{ key: "scenePace", type: "enum", scope: "player", base: "scenePace", choices: ["slow", "normal", "fast", "manual"],
  names: ["Slow", "Normal", "Fast", "Only when I press Jump"], label: "How fast story scenes turn the page",
  help: "Jump always turns the page early. Sneak skips the scene" }
```

Slow is 11 characters a second, Normal 15, Fast 20. Manual waits for Jump, with the page's `max` raised to 600 ticks so a player who walked away from the screen still gets out.

### 7.5 Group cutscenes

Keep one playback per player, as today. It is the right model now that pages have a reading pace and a Jump: two players never read at the same speed, and a shared timeline would make one of them wait or lose text.

- Mates at the same place already start within a second of each other, because each one's own tick starts it.
- Each has their own pages, Jump and Sneak. One mate skipping does not skip the others (`party.js:285-288` already makes a watching mate's shared step wait).
- A mate who was elsewhere gets the chat line of 7.3 and reads it in the Story Log.

If the owner wants a true shared scene later (everyone sees the same page), `showCaption` can take a list of players and advance on the slowest reader's time. That is not needed to fix the complaint.

### 7.6 The other offenders

| Pack | Change |
|---|---|
| `town_bp` (`main.js:487-495`) | Title: the town's name. Subtitle: `is now a Village (level 2)`. The new projects go to chat, which the town news already uses. All through `fitTitle` |
| `expedition_bp` (`main.js:1726`, `:2358`, `:2434`) | `fitTitle` on all three. "Expedition complete" becomes the subtitle's first line when it does not fit; `<Dungeon> <Level>` and `cleared in 12:34` become two subtitle lines |
| `calendar_bp` (`main.js:127-131`) | `fitTitle` inside its `title` helper. The subtitle becomes "A festival begins" and the command stays in the chat line that is sent anyway |
| `atlas_bp` (`main.js:526-530`) | `fitTitle` inside `banner` |
| `domt_bp` (`main.js:179`) | `fitTitle`; bold only when the name still fits |
| `admin_bp` (`actions.js:107-111`) | `fitTitle`, and tell the operator when it had to move or wrap the text |
| `welcome_bp` (`main.js:319`) | `fitTitle` |
| Action bar notes over 300 pixels (6.2) | `wrap(text, HUD.NOTE_PX).join("\n")` in each pack's own `bar`/`actionbar` helper: `settings_bp`, `admin_bp`, `storm_bp`, `skills_bp`, `stash_bp`, `calendar_bp`, `atlas_bp`, `elytra_bp` |
| `expedition_bp/layout.js:436`, `maps_bp/main.js:144`, `relics_bp/main.js:192` | Replace the three copies of `wrap` with `text.js` (C14). Optional, and no player sees a difference |

Each pack that takes `text.js` gets a version bump and a `sync-diag` run. Do the saga first and on its own PR; the others can follow as one PR once the ruler test has set `TITLE_PX` and `SUB_PX`.

### 7.7 Step 2, optional: the `hud_rp` look

In `packs/hud_rp/ui/hud_screen.json`, give `hud_actionbar_text` a second look when the text starts with `§s§c§r`:

- copy the text: `"$atext": "$actionbar_text"`, test `(('%.9s' * $atext) = '§s§c§r')` (the marker is 9 bytes);
- the vanilla image and label show when the test is false, unchanged;
- a caption image and label show when it is true: anchored `bottom_middle` at a fixed line above the hearts so it grows upward, 8 units of padding, a darker background, the label left-aligned with `max_size [228, default]`.

Cost: about 60 lines of JSON, a case in `tools/hud-layout.test.mjs`, a Realm Resources release, and a look on a phone, a PC and a console. It changes nothing for a player without the pack. It can be skipped entirely if step 1 looks good on the phone.

### 7.8 Files to change for step 1

| File | Change |
|---|---|
| `tools/text-shared.js`, `tools/sync-text.mjs`, `tools/text-shared.test.mjs` | New |
| `tools/lib/client-font.mjs`, `tools/client-font.test.mjs` | One table |
| `tools/bundle.mjs:264`, `package.json` (`check`), `tools/check-pipeline.mjs` | `text.js` in `SHARED`; `sync-text --check` |
| `tools/check-stories.mjs`, `tools/check-stories.test.mjs` | Scene lints |
| `packs/saga_bp/scripts/text.js` | Generated copy |
| `packs/saga_bp/scripts/objectives.js` | `playVision`, captions, the button event, Darkness in slices, `ownUntil`, the dream retry |
| `packs/saga_bp/scripts/types.js` | `Scene` |
| `packs/saga_bp/scripts/ui.js` | Visions and dreams in the Story Log; the accept burst |
| `packs/saga_bp/scripts/settings.js`, `config.js` | `scenePace` |
| `packs/saga_bp/scripts/stories/act1_signs.js:498-501`, `act4_seals.js`, and the two "Year of the Long Storm" headings | `by` for the Cantor; shorter headings where the lint asks |
| `packs/saga_bp/manifest.json`, `scripts/diag.js` | Version, `sync-diag` |
| `tools/saga-interaction-lifecycle.test.mjs:551-557` | The `vm` context needs the new names `playVision` uses |
| `tools/test-bds/examples/saga-party-stealth.js:151` | It waits for the chat copy of a scene: look for the action bar text instead |
| `tools/test-bds/examples/actionbar-steady.js:42` | It filters "Sneak to skip": use the new hint text |
| `docs/PACKS.md:2522-2523` and the Story Questlines preferences, `docs/STORY_BIBLE.md:586-587`, `README.md` if the summary changes, `docs/NEWS.md`, `release/notes.json` | Docs in the same commit |
| `packs/help_bp`, `packs/admin_bp` catalogs | Regenerated last |

## 8. Bugs found

| # | Where | What happens | Why | Fix | Mark |
|---|---|---|---|---|---|
| 1 | `packs/saga_bp/scripts/objectives.js:2982` | The scene text is one row that runs off both sides of the screen | The whole text is the subtitle, and a subtitle never wraps | Captions (7.2) | **[V]** |
| 2 | `objectives.js:2983` | Every scene is also a chat message: up to 7 messages and 1,320 characters a vision | Written as a log, on purpose | No chat during the scene; the Story Log (7.3) | **[V]** |
| 3 | `objectives.js:2982` | A long heading is cut off too | It is the title, the largest font, and bold | `fitTitle`; no bold | **[V]** widths, **[S]** scale |
| 4 | `stories/*.js`, every `seconds` | Scenes change before they can be read: median 24 characters a second, up to 36 | `seconds` was set by feel | Reading time from the text (7.2) | **[V]** |
| 5 | `objectives.js:2992-2993`, `packs/saga_bp/scripts/ui.js:1386-1393`, `packs/saga_bp/scripts/main.js:557` | For a player whose tracker is above the hotbar, the tracker draws over "Sneak to skip" within a second | The tracker waits for other packs' `realm:actionbar` and for `ownUntil`. The saga ignores its own request (`msg.from !== PACK`) and `playVision` never sets `ownUntil`, as `note()` does (`objectives.js:426`) | Set `ownUntil` on every caption send. With captions on the action bar this is required, not optional | **[V]** by reading; `actionbar-steady.js:42` has to filter the hint out, which fits |
| 6 | `objectives.js:2971`, `:3008-3013` | A player who logs out (or whose game closes) during a dark vision is still blind after joining again, for up to the rest of the vision plus 4 seconds, with no vision playing | Darkness is added once for the whole length, and the cleanup runs only while `player.isValid` | Add Darkness in 60-tick slices every 20 ticks | **[V]** code, **[S]** that the effect is saved with the player |
| 7 | `objectives.js:2983` with `stories/act1_signs.js:498-501` | In chat, the five Cantor scenes turn white and upright halfway | The `§r` inside the text ends the `§7§o` in front | Gone with the chat copy; use `by` | **[V]** |
| 8 | `objectives.js:3741-3745`, `:3684`, `:1433`, `:3883` | A dream can be lost for good: the sleep step is counted when the player lies down, the dream is removed from the queue before it plays, its result is ignored, and the queue is memory only | Death or a dimension change during the dream, a log-out before waking, or a server restart drop it | Queue it again when it was cut (not when skipped); the Story Log shows it anyway | **[V]** |
| 9 | `objectives.js:2993` | The hint is dark gray (`§8`) on the action bar's dark background, during Darkness | Color choice | `§7` | **[S]** (not seen on a client) |
| 10 | `objectives.js:2985-2999` | A short tap of Sneak can be missed | `isSneaking` is read every 5 ticks | `playerButtonInput`, with the poll kept as a fallback | **[S]** |
| 11 | `objectives.js:2971`, `:3021-3027` | A dark vision blinds the player for up to 49 seconds while mobs can still hurt them; dying cuts it and it starts over. A vision without a place starts the moment its step opens, wherever the player is | No protection and no check of the surroundings | Owner's call. The cheap option: Resistance in the same 60-tick slices for dark visions. This matters more once visions are longer | **[V]** code; a design question |
| 12 | `packs/admin_bp/scripts/presets.js:98` and `tools/lib/client-font.mjs:11` | Two glyph tables that disagree on `( ) * { }` | Written at different times | One table in `tools/text-shared.js` | **[V]** |
| 13 | `packs/expedition_bp/scripts/layout.js:436`, `packs/maps_bp/scripts/main.js:144`, `packs/relics_bp/scripts/main.js:192` | The same `wrap` three times | C14 | `text.js` | **[V]** |
| 14 | `packs/town_bp/scripts/main.js:487-495` | A town's level-up title is a sentence of 35 characters or more in the title font | A sentence was put in the title | 7.6 | **[V]** widths |
| 15 | `tools/test-bds/examples/saga-party-stealth.js:151` | The only scenario that proves a vision played does it by reading the chat copy | Nothing else was observable | Check the action bar | **[V]** |

Not bugs, checked: a Creative player with `skipCreative` does not loop a vision (`objectives.js:3715` checks `counts` first); the busy mark cannot be released by an older vision (`util.js:338-342`, pinned by `tools/saga-interaction-lifecycle.test.mjs:574-600`); the title hold never exceeds `MAX_HOLD` (600 ticks; the longest scene holds 220).

## 9. Tests to add

**Unit tests** (`node --test`)

- `tools/text-shared.test.mjs`: 7.1.
- `tools/saga-caption.test.mjs`:
  - `captionPages` on a scene with `by`, a heading and 190 characters: the speaker row first, at most 3 text rows, the hint only on the vision's first page, every page starts with `CAPTION_MARK`;
  - with fake `wait`, `send` and a fake player (the fixture of `tools/saga-interaction-lifecycle.test.mjs`): a page is sent again every 20 ticks and each send is preceded by `realm:actionbar`; `ownUntil` is set; Jump after 10 ticks ends the page with "next"; Jump at 5 ticks does nothing; Sneak ends the vision and `playVision` resolves true; death resolves false; no `sendMessage` is called before the vision ends and exactly one after;
  - Darkness is added in slices and never for more than 60 ticks;
  - a dream that was cut is queued again; a skipped one is not.
- `tools/saga-interaction-lifecycle.test.mjs`: keep the four existing vision tests green with the new context.
- `tools/check-stories.test.mjs`: the new lints, each with a failing fixture.

**BDS scenarios** (`tools/test-bds/examples/`)

- `saga-vision-caption.js` (`--only saga_bp`): jump to `act1_signs` / `inn` with `realm:saga_debug` (its vision has no place and no darkness). Check with `t.messages(p, { kind: "actionbar", pack: "saga_bp" })` that every action bar during the vision has at most 4 rows and every row at most 228 pixels (with a copy of the table, as `saga-quest-wrap.js` does); that the words of all pages in order are the scene's text; that no `kind: "chat"` message carries scene text; that one chat line follows; that the step is done; that the vision lasts at least `characters / 15` seconds.
- `saga-vision-skip.js`: sneak after a second: the vision ends, the step counts, the action bar is cleared, Darkness is gone within 60 ticks. Then a second player who dies mid-vision: no credit, and it plays again.
- `saga-vision-tracker-bar.js`: the tracker above the hotbar (`trackerAt: "hotbar"`): between the first and the last caption no `saga_bp` action bar is the tracker line (bug 5).
- `saga-party-stealth.js`: update line 151.
- Other packs, once they use `fitTitle`: extend `admin-title.js` (a 60-character title arrives as a wrapped subtitle) and add a `town-level-title.js`.

**On a real client** (the scenarios cannot see the screen). Ten minutes, on the owner's phone folded and unfolded, then a PC:

1. `/titleraw @s actionbar {"rawtext":[{"text":"Someone is hauling the bell rope. Not wildly.\nIn a rhythm. Slow, slow, quick. Slow, slow,\nquick. Like a heartbeat with something wrong"}]}`: three rows? Inside the screen? Clear of the hearts?
2. The same with a fourth and fifth row.
3. `/realm:admin_title "0123456789012345678901234567890123456789" "0123456789012345678901234567890123456789" 10`: how many digits of each row are visible. A digit is 6 pixels, so that gives the title and subtitle scales and sets `TITLE_PX` and `SUB_PX`.
4. `( ) * { }` next to letters in a 200-pixel side box, to settle the two tables.

## 10. Risks and unknowns

1. **`\n` in the action bar, and how 3 to 5 rows sit above the hotbar on a phone.** Everything in step 1 rests on it. It is the same label control that already shows line breaks in subtitles and side boxes, so it should work, but no pack does it today. Test 1 above settles it before any code is written. If it failed, the fallback is way B of section 5 (subtitle, 24 characters a row, more pages).
2. **The font scales** of the title and subtitle (4x and 2x assumed). They set which headings and which other packs' titles count as too wide. Test 3 settles it.
3. **The unfolded Fold.** A nearly square screen may be under 320 units wide. 240 units of caption still fit 273; the margin is thin. `clientSystemInfo.platformType` can pick a narrower width for `Mobile` if needed.
4. **Longer cutscenes.** About 74% longer in all at 15 characters a second. With Darkness and no protection that is more time to be hit (bug 11). The owner should choose: Resistance during dark visions, or leave it.
5. **Jump as a control.** The player really jumps. On touch, auto-jump does not press the button (suspected); holding Jump must not turn every page (use `Pressed` only, and the 10-tick guard). On a mount or in water Jump means something else. Whether the event still fires when the game ignores the jump is unknown.
6. **The action bar is shared.** Packs that follow the protocol wait (they all do: `tools/check-actionbar.mjs`). A caption held for a minute and a half keeps every other pack's notes off the bar for that long: a durability warning or a mob's health would not show. The Coordinates HUD and the stats ticker wait too.
7. **Resend flicker.** The bar's fade is `in_expo` over 3 seconds; a resend every 20 ticks should never show a dip. Not seen on a client.
8. **Chat as a log is removed.** A player who liked scrolling back loses that until they find the Story Log; the one chat line says where it is.
9. **Step 2 depends on JSON UI**, which Mojang is replacing. Step 1 does not.
10. **The profanity filter** is on for the action bar, the title and the subtitle in Mojang's file (`enable_profanity_filter: true`). Story text could get a word starred out on some platforms. It applies today as well.
11. **Tests that read scene text from chat** (`saga-party-stealth.js:151`) fail until updated; `tools/saga-interaction-lifecycle.test.mjs` runs `playVision`'s source in a `vm` with a fixed list of names.

## 11. Sources

In the repo: the files and lines named above.

Outside:

- Mojang, `bedrock-samples`, `resource_pack/ui/hud_screen.json` (`hud_title_text`, `hud_actionbar_text`, `anim_actionbar_text_alpha_out`): https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/ui/hud_screen.json
- `@minecraft/server` 2.1.0 type definitions (npm): `ScreenDisplay`, `TitleDisplayOptions`, `HudElement`, `InputPermissionCategory`, `PlayerButtonInputAfterEvent`, `ClientSystemInfo`.
- Bedrock Wiki, JSON UI Documentation (label properties; `font_size` has four names and no scale; `wrap` is listed as legacy): https://wiki.bedrock.dev/json-ui/json-ui-documentation
- Bedrock Wiki, Intro to JSON UI (`$actionbar_text` copied into a variable for `visible`; `%.Ns` counts bytes; the Ore UI notice): https://wiki.bedrock.dev/json-ui/json-ui-intro
- Netflix timed text style guides (42 characters a line; 17 characters a second for adults and 13 for children in several language guides; the English figures were not retrieved): https://backlothelp.netflix.com/hc/en-us/articles/215758617
