# Realm rework: one menu, a story you can rejoin, waypoints, fewer things to remember

Status: specified, not started · Date: 2026-11-15 · Size: program of 13 workstreams
Repos: `nishant/mc-packs` (specs live here), `nishant/hosting` (website, workstreams 08 and 13)
Research behind every decision: `docs/specs/realm-rework/research/` (nine reports, file:line evidence)

This folder is a program, not one feature. Each numbered file is a complete `/ship` spec for one
workstream: one session, one PR, one release (`CLAUDE.md`: "Ship each workstream as its own PR and
release"). This README holds what all of them share: the goal, the decisions, the cross-pack contracts
and the order. A workstream spec wins over this file on its own details; this file wins on contracts
that two workstreams share. A session that changes a shared contract edits this file in the same PR.

## How to run it

Give a `/ship` session exactly this, with the workstream number filled in:

> /ship Build workstream NN of the realm rework. The spec is `docs/specs/realm-rework/NN-<slug>.md` in
> nishant/mc-packs and the shared contracts are in `docs/specs/realm-rework/README.md` (if the folder is
> not on master yet: `git fetch origin ccr-b0ee40f7-oc4425 && git checkout origin/ccr-b0ee40f7-oc4425 --
> docs/specs/realm-rework`). The spec is final: do not re-plan it, do not ask me to approve it. Check
> "Depends on" in the README first and stop if a dependency is not released. Follow the repo's
> CLAUDE.md for the finishing steps. In the PR that ships the workstream, delete its spec file and its
> row in the README's workstream table; the PR that ships the last one deletes the folder.

Two lanes can run at the same time, one session each, because they touch different packs:

- **Story lane** (all edit `packs/saga_bp`, so strictly one after another): 01 → 02 → 06 → 03 → 07 → 04 → 05
- **Menu lane:** 08 → 09 → 11 → 12 → 10, then 13 last (it reads what 04, 09 and 11 export)

Cross-lane dependencies are in the table below. Every PR regenerates the help and admin catalogs, bumps
`help_bp`, and edits `docs/NEWS.md` and `release/notes.json`: when two lanes are open at once, the
second to merge merges `master` in first and regenerates the catalogs last (`CLAUDE.md`, "Generated
catalogs, regenerated last"). Do not run workstream 10 (it bumps every pack) alongside any other open
PR, or alongside the performance plan's W1 or W2 (`docs/audits/2026-11-perf-audit/PLAN.md`).

## The brief, restated

The owner's request, cleaned up. This is the prompt the specs answer.

> My Realm has 67 behavior packs, 182 commands and about 600 settings. Nothing is wrong with any one of
> them, but together they are too much to navigate and remember, and players have stopped opening the
> menu. Keep every function. Change how it is presented.
>
> 1. **One front door.** The nether star everyone carries becomes the Realm Menu: task first (continue the
>    story, travel, today, my stuff, tools, settings, help), about seven buttons on the first screen,
>    everything else one level down, and every existing command still reachable.
> 2. **Fewer settings to think about.** Presets and a few pages instead of one 126-row form. Hide what
>    nobody should need to touch. Delete no option.
> 3. **Our own waypoints,** replacing the third-party add-on and its separate item: anyone saves a named
>    waypoint where they stand, public or private; public ones are one shared list that operators can
>    reorder; picking one teleports you. Opened from the star.
> 4. **A story you can come back to.** After weeks away I open `/realm:saga` and do not know what to do.
>    Give me one obvious next step, where it is, and a short "previously". Offer a few choices, not fifty.
> 5. **A story a group can play.** Someone proposes, everyone joins the same chapter, choices are made
>    together, nobody is silently held back.
> 6. **Cutscenes that can be read.** The text is one unwrapped line on screen and a wall of text in chat.
>    Wrap it, pace it, keep it out of chat.
> 7. **Less jank.** Find and fix the bugs in story mob spawning, story items, places and NPC interactions.
> 8. **A world that points at the story.** Townsfolk, notice boards, wanderers and the login message
>    should tell me who is waiting for me. Add small cross-pack protocols where that needs one.
> 9. **Rework the story where it helps:** one entry point, a stated goal, recaps, clear step text, ways
>    past progression walls. Bigger rewrites are allowed but come after the confusion is fixed.
> 10. **A website that matches:** a "start here" page, the menu as a cheat sheet, the realm page by task.
> 11. Sweep up the QoL gaps and bugs found along the way. Combine packs only where it really helps.

## Outcomes (each checkable)

1. Using the star opens `Realm Menu` with at most 7 fixed buttons for a player; no player screen has
   more than 10 fixed buttons; `tools/check-menu.mjs` fails when a registered command is neither placed
   nor hidden with a reason. (09)
2. The first button reads `Continue: <story>` with the next step on its second line, and tapping it shows
   one next step with a direction and distance. (02, 03, 09)
3. The story tracker and the Minimap star are never blank for a player with story left to play. (02)
4. A player away 7 days or more gets a "Previously" recap; any player can open it on demand. (03, 04)
5. A new player has exactly one story entry point; at any point at most 3 picks are offered before
   "See everything". (03, 04)
6. A party plays one chapter that someone proposed and the others accepted; branch choices are a 30 s
   vote; nobody is held on a chapter without being told why. (05)
7. Vision and dream text is wrapped to the screen, paged at a readable pace, and not copied to chat. (01)
8. The 5 high and 21 other story findings (`JNK-01` to `JNK-26`) are each fixed or closed with a
   reason, with a regression test or BDS scenario per fix. (06, 07)
9. `/realm:waypoints` exists as specified, is the first row of Travel, and the third-party add-on's
   retirement steps are in `MANUAL-STEPS.md`. (08)
10. `/realm:prefs` opens short pages with 3 pickers and about 13 switches by default; operators see about
    108 controls by default instead of 516; saved choices of every existing world and player are
    unchanged. (10)
11. A returning player gets one welcome-back card and no join chat lines from the packs that feed it. (11)
12. Every townsfolk and mayor can answer "What should I do next?"; a town's Notice Board opens Today. (12)
13. `minecraft.nish.software/realm/` leads with tasks, and has Start here, Menu and Story pages generated
    from the same data the game uses. (13)

## Out of scope

- Merging packs on disk. The Realm Bundle is already one add-on with one saved-data store, so a merge
  changes nothing a player sees and risks saved settings, published pack slugs and the realm page
  (`research/pack-consolidation.md` section 6). Packs are grouped in the menu, help, settings and the
  website instead. No pack folder is renamed, removed or merged by any workstream here.
- Removing or renaming any command, deleting any option, changing any saved-data key or prefix.
- Beta APIs, experiments, custom items or blocks. `@minecraft/server` 2.1.0 and `server-ui` 2.0.0 only.
- Live data from the Realm to the website. The Realm is hosted by Mojang; the only path is data baked
  into the bundle (`research/hosting-onboarding.md` A4).
- The story's "should" and "could" rewrite tiers and the lower-ranked cross-pack connections. They are
  listed under "Backlog" below and become ROADMAP entries when the first workstream ships.

## Decisions

Defaults the owner did not state are marked (default). All of them are reversible in settings.

| # | Decision | Why |
|---|---|---|
| D1 | The carried item, its pack title and chat prefix become **Realm Menu**; new `/realm:menu`. Folder `admin_bp`, prefix `admin:` and every existing command stay. | "Configuration" reads as an admin tool; the folder and prefix hold saved data. Carried items rename in place through the existing normalize path (`packs/admin_bp/scripts/main.js:771-832`). |
| D2 | One taxonomy for everything: the Realm Menu's areas, defined once in `packs/admin_bp/scripts/menu.js` (`SCREENS`, `HIDDEN`, `TOPICS`) and exported to `docs/menu.json`. Help, settings pages, the `README.md` pack table and the website all read it. `docs/PACKS.md` keeps its section order. Every pack folder is in exactly one `TOPICS` area. | Two groupings would be one more thing to learn. The only grouping in the repo today (`GROUPS`, `presets.js:29-90`) is replaced by it. |
| D3 | Commands that only repeat a button of their pack's own menu (58) and toggles that duplicate a preference (12) are hidden from the tree but stay registered, typed, searchable, pinnable and in A-Z. (default) | Keeps all functionality; removes 48% of the buttons. |
| D4 | No disk merges (see Out of scope). | Cost and risk with no player-visible gain. |
| D5 | Waypoints are a new pack `waypoints_bp` ("Waypoints", prefix `waypoints`), free and instant by default (`cost`, `warmupSeconds`, `cooldownSeconds` all 0). Waystones & Inns is unchanged. (default) | The owner asked for simple. Operators can add friction later. |
| D6 | Caps: 20 private per player, 5 public per player (operators exempt), 60 public realm-wide (hard ceiling 100). Names 1 to 24 ASCII characters. No icons in v1. (default) | Fits one 32 KB property with no chunking (`research/waypoints.md` 3.3). |
| D7 | Cutscene text moves from the title subtitle to the action bar, server-wrapped to 3 rows of 228 px, paged, 15 characters a second, Jump for the next page, Sneak to skip. Config `captionAt: "actionbar" \| "subtitle"` keeps the fallback. Nothing is copied to chat; one line points at a new "Visions and dreams" page. | The subtitle label never wraps and holds about 24 characters a row (`packs/saga_bp/scripts/objectives.js:2982`). Whether `\n` renders in the action bar on a phone is the one unverified fact: the fallback is one config change. |
| D8 | During a vision the player is protected (Resistance and Darkness applied in 60-tick slices, removed on any exit). (default) | Longer captions mean up to 90 s of a blind, defenseless player. |
| D9 | `saga_bp` publishes one fact, the **lead** (`realm:saga_lead`): the one thing this player should do next, in words, with a place. The tracker, the Minimap star, the Realm Menu, the login card, townsfolk and notice boards all read it. | It is the missing fact behind "I don't know what to do" (`research/saga-flow.md` 6.1-6.3, `research/npc-world.md` 3.0). |
| D10 | `/realm:saga` opens **Your Story** (next step, why, Go, Previously, Something else, Play with my party, Everything). The old Story Log is `Everything`, unchanged. `/realm:saga_log` keeps opening the log. (default) | One front door without removing anything. |
| D11 | Choice is cut by presentation, not by a cap: at most 3 picks, side questlines unlock after the main quest that introduces their NPC (`opensAfter`), at most two "Offered now", wanderers listed only once met, daily favors become 3 a day on a party-shared board. No quest is removed and no id changes. (default) | Day one drops from 2 + 5 + 12 offers to 1 + 1 + 3 (`research/story-content.md` section 4). A hard cap was rejected: it blocks players who like breadth. |
| D12 | Party story is opt-in: a member proposes, mates answer Join or Not now. One chapter per party; no switch mid-chapter; branch choices are a 30 s vote (ties: the proposer); moral counters and the ending stay per player; helpers who are ahead earn 25% (`helperShare`). World option `partyStoryAsk` off restores today's automatic behavior. (default) | Today the slowest online member silently sets everyone's chapter (`packs/saga_bp/scripts/party.js:172-243`). |
| D13 | Story content: the "must" tier only (spine fields, single entry point, 24 recaps, 68 goal lines, 58 tips, hand-over lines, gating fields, a second way past four walls, renames) plus the `check-stories` rules that keep it true. The writing itself is kept. | The writing is good; the problems are structural (`research/story-content.md` 2.3, 5.10). |
| D14 | Packs contribute menu badges, the Today screen and the login card through **one** protocol, `realm:card_ping` / `realm:card_pong` with a `ctx`. The three separately proposed protocols (`menu_ping`, `hub_ping`, `login_ping`) are this one. | One helper to copy, one thing to test, one cost to measure. |
| D15 | A town's Notice Board opens the Realm Menu's Today screen (`realm:menu_open`), with the story lead on top. It does not get its own offer list. | One Today surface, reachable from the star and from the world. |
| D16 | Quieter defaults (default): stats ticker off for players who never chose; welcome popup on first join and after an edit only; chat tips every 60 minutes, rewritten around the menu; per-gain notes (skill XP, quest and bounty progress, reputation, journal entries) off in the Normal notifications preset; milestone broadcasts for the top tier only. Explicit choices already saved are kept. Each is one news line. The ticker, per-gain notes and milestone broadcasts ship in 10; the welcome popup and the tips ship in 11. | The owner's complaint is noise. Nothing is removed; every one is a switch. |
| D17 | One daily reset hour for bounties, daily quests, favors and townsfolk limits: world option `dayResetHourUtc`, default 10 (4 or 5 am US Central). A bounty or cull in progress is never swept at the roll. | Today all four reset at 00:00 UTC, mid-evening for this Realm, and the roll removes the champion being fought (`packs/bounty_bp/scripts/main.js:348-352`). |
| D18 | Script-spawned story and quest mobs carry the entity tag `realm_scripted`; converters (Champions, Blood Moon, Phantom) skip tagged mobs. Players who must not be teleported carry `realm_no_teleport`. | Champions rolls 2.5% to turn any story mob into a random champion (`packs/elite_bp/scripts/main.js:482-565`). |
| D19 | Per-character pixel widths, one table, in `tools/text-shared.js`. `tools/lib/client-font.mjs` and the table in `packs/admin_bp/scripts/presets.js:98` become re-exports of it. | Two tables exist and disagree on `( ) * { }`. |
| D20 | Hosting reads three optional exports from mc-packs: `docs/menu.json`, `docs/story.json`, `docs/news.json`. Hosting treats each as optional until one mc-packs release has shipped it. | Hosting `master`'s `pack-docs.mjs` runs on every mc-packs release (`tools/ci-release.mjs:316-331`). |

## What the research measured

| | Today |
|---|---|
| Packs | 74 folders: 67 behavior, 7 resource |
| Commands | 182 registered: 120 for players, 62 operators only |
| Per-player preferences | 89, on one form of 126 rows |
| Operator options in game | 516 on 6 pages (764 `config.js` keys) |
| Star menu | 9 buttons on home, then 6 pages of 14 to 24; every screen scrolls on a phone |
| `/realm:help` | one screen of 67 buttons in the order the packs were written; shows 44 operator commands to players unmarked |
| Story | 59 stories, 252 chapters, 607 steps, 78,512 words; main story 68 chapters, about 20 hours |
| Offers open to a new player | 2 main + 5 side + 12 favors; up to 51 after Act II |
| Main-story goal first stated | chapter 49 of 68 |
| Vision scenes | 103, 50 to 240 characters, shown as one unwrapped subtitle at a median 24 characters a second |
| Login for a returning player | 2 popups and up to about 12 chat lines in 11 seconds, from 15 packs; nothing about the story |
| Distinct "things to do" systems | 21, on 4 different clocks; 7 reachable only by command |

## Shared contracts

A workstream that introduces a contract owns its tests; a workstream that consumes one must work when
the other side is missing (single-pack installs, an older bundle): no answer means the old behavior.
All script events are `realm:...`, JSON, under 2048 characters, registered through each pack's
`onScriptEvent` (never a direct `scriptEventReceive` subscription), and handled before any id guard
(`docs/WORKING.md` C29).

### C1 `realm:saga_lead` (introduced by 02; read by 03, 09, 11, 12)

`saga_bp` pushes one message per player: within 5 s of a join, on change (checked with the tracker, every
2 s), and on a ping. Consumers keep `Map<playerId, lead>` in memory and drop a player on leave.

```
realm:saga_lead
{ "player": "<player id>", "v": 1,
  "st": "start" | "step" | "report" | "party" | "wait",
  "k": "main" | "side" | "heart" | "wander" | "festival",
  "s": "<story id>", "title": "<story title, at most 40>", "ch": "<chapter title, at most 48>"?,
  "hint": "<one plain sentence, no color codes, at most 120>",
  "why": "<one plain sentence, at most 120>"?,
  "npc": "<townsfolk id or w_<wid>>"?, "who": "<name as shown>"?, "place": "<place name, at most 32>"?,
  "dim": "minecraft:overworld"?, "x": 0?, "z": 0?,
  "more": 0,
  "party": { "on": 2, "of": 3, "hold": "<name>"?, "behind": ["<name>"] }? }
{ "player": "<player id>", "v": 1 }            nothing to point at (all done, or stories paused)

realm:saga_lead_ping  { "player"?: "<player id>" }   any pack; without "player", every online player
```

The lead is chosen by `nextStep(player)` in the new `packs/saga_bp/scripts/guide.js`; its ladder is in
`02-story-lead.md`. For a `start` lead `saga_bp` also sends the existing `realm:track`, so the Minimap
star is never empty. A consumer pings 100 ticks after world load.

### C2 `realm:card_ping` / `realm:card_pong` / `realm:card_shown` (introduced by 09; used by 11, 12)

One request and answer for "what should the menu or the login card say about your pack right now".

```
realm:card_ping   { "id": "<tick base 36>.<counter>", "player": "<player id>", "v": 1,
                    "ctx": "menu" | "login", "away"?: <whole hours, 0 = unknown>, "first"?: true }
realm:card_pong   { "id": "<same>", "pack": "<folder>", "items": [Item, ... at most 8] }
realm:card_shown  { "player": "<player id>", "ctx": "login", "packs": ["<folder>", ...] }

Item = { "k": "<key, at most 24>",            the entry's key in menu.js; required
         "t"?: "<line 1, at most 40>", "h"?: "<line 2, at most 40>",   overrides for that button
         "n"?: 0-999,                         a count shown as " (n)"
         "a"?: 1-100, "c"?: "realm:<command>", an alert candidate and the command it runs
         "hide"?: 1,                          hide a normal entry
         "kind"?: "story" | "news" | "mail" | "reward" | "todo" | "world" | "friends",
         "line"?: "<one line, plain ASCII, at most 60>",   for the Today screen and the login card
         "order"?: 0-99 }
```

- Asker for `ctx: "menu"` is `admin_bp`, once per menu open, answers reused for 40 ticks. It waits for
  the packs that have answered before, at most `menuTicks` (default 4), then draws with what arrived.
- Asker for `ctx: "login"` is `welcome_bp`, 60 ticks after spawn, waiting at most 20 ticks.
- A contributor always answers, with an empty `items` too. `admin_bp` ignores a key whose command does
  not belong to the answering pack.
- A pack that answers `ctx: "login"` does not send its own join chat line for that join. A pack that
  sees no login ping within 100 ticks of a spawn falls back to its old line.
- The helper is `tools/cards-shared.js`, copied to `scripts/cards.js` by `tools/sync-cards.mjs`: a
  factory `createCards({ PACK, onScriptEvent, items: (player, ctx, req) => Item[] })` with no module
  state, added to `SHARED` in `tools/bundle.mjs`. It adds no per-tick work.

### C3 `realm:menu_open` (introduced by 09; used by 11, 12)

`{ "player": "<player id>", "screen"?: "home" | "travel" | "today" | "stuff" | "tools" | "settings" | "help" }`
opens the Realm Menu at that screen for that player. Unknown screens open home.

### C4 `realm:waypoints_open` (introduced by 08; used by 09)

`{ "player": "<player id>", "page"?: "list" | "add" | "mine" | "admin" }` opens the Waypoints menu.
The Realm Menu's `Waypoints` row sends it, so no "Ran /..." chat line appears.

### C5 Entity and player tags (introduced by 06 and 08)

- `realm_scripted` on any mob a script spawns for a quest, scene or event that must stay what it is.
  `elite_bp`, `moon_bp` and `phantom_bp` skip tagged mobs. A `check-ids`-style rule lists the spawn
  helpers that must add it.
- `realm_no_teleport` on a player: Waypoints refuses to move them. `expedition_bp` already tags
  `realm_expedition` (also honored); `domt_bp` adds `realm_no_teleport` in its arena, `saga_bp` during a
  vision.

### C6 `realm:rally_ask` / `realm:rally` (introduced by 12)

Shapes are in `12-npc-links.md`. `party_bp` relays a "gather here" call to party members: chat, a party
HUD line and the Minimap star. Never a teleport.

### C7 Shared modules added by this program

| Module | Copied to | Introduced by | Used by |
|---|---|---|---|
| `tools/text-shared.js` (`plain`, `widthOf`, `wrap`, `pages`, `fit`, `readTicks`, `fitTitle`) | `scripts/text.js` | 01 | saga, then any pack that sends titles or action bars; `check-menu` |
| `tools/cards-shared.js` | `scripts/cards.js` | 09 | every card contributor |
| `tools/landing-shared.js` (safe landing search) | `scripts/landing.js` | 08 | waypoints. 06 builds the story's own safe-spot finder inside `saga_bp` and does not depend on this |
| `tools/day-shared.js` (`dayKey(now, resetHourUtc)`) | `scripts/day.js` | 12 | bounty, quests, saga favors, npc |

Each has a `tools/sync-<name>.mjs` with `--check` wired into `npm run check`, and a unit test.

### C8 Exports for the website (introduced by 09, 04, 11; read by 13)

| File | Writer | Shape |
|---|---|---|
| `docs/menu.json` | `tools/menu-export.mjs` (09), `--check` in `npm run check` | `{ version, home[], tasks[{ id, title, want, hint, synonyms[], items[{ title, hint, command, pack, ops, path[] }], packs[] }], ops[] }` |
| `docs/story.json` | `tools/story-export.mjs` (04) | `{ version, stories[{ id, title, kind, act, giver{ id, name }, summary, requires[], needsPacks[], chapters[{ id, title, goal, hint, recap }] }] }` |
| `docs/news.json` | `tools/gen-news.mjs` (11) | `[{ id, title, date, headline?, lines[] }]`, newest first, 30 entries |

## Workstreams

Sizes are `/ship` sizes. "Bumps" is the packs whose version goes up.

| # | Spec | What ships | Size | Depends on | Bumps |
|---|---|---|---|---|---|
| 01 | `01-captions.md` | Shared text module; vision and dream captions; the Visions page; the other packs' unwrapped titles | large | none | saga, help, admin + the offenders |
| 02 | `02-story-lead.md` | `guide.js` and `nextStep`; the lead in the tracker and Minimap; `realm:saga_lead`; NPC homes; favor expiry; the home-line and lock-reason fixes | medium | 01 | saga, help |
| 03 | `03-your-story.md` | `/realm:saga` front door; Previously; curated picks; offer order at NPCs | large | 02 | saga, help, admin |
| 04 | `04-story-spine.md` | The content "must" tier, the new data fields, the `check-stories` rules, `docs/story.json` | large | 03 | saga, help |
| 05 | `05-party-story.md` | Opt-in party story, votes, roles, the content's `party` and `decide` fields | large | 03 | saga, party, help |
| 06 | `06-story-jank-1.md` | The high findings; the safe-spot finder; the actor registry; `realm_scripted`; the delivery, credit and form policy | large | 02 | saga, elite, moon, phantom, help |
| 07 | `07-story-jank-2.md` | Places validated and finished before use; authored character spots; scene state saved; the stuck-step watchdog and "Fix my quest" | large | 06 | saga, help |
| 08 | `08-waypoints.md` | `waypoints_bp`; the Minimap destination group; `realm_no_teleport`; the hosting catalog edit; the add-on's retirement steps | large | none | new pack, admin, map, domt, help |
| 09 | `09-realm-menu.md` | Rename; `menu.js` and `check-menu`; the tree; pins; cards and Today; help by area; `docs/menu.json`; the menu, help and welcome bugs | large | 08, 02 (soft: static text without it) | admin, help, settings, welcome + first card contributors |
| 10 | `10-settings-presets.md` | `page`, `tier`, `preset` in the settings core; preference pages; Quick Setup; operator basics; the quieter defaults | large | 09 | every behavior pack |
| 11 | `11-welcome-back.md` | The login card; the first-join card; the last 12 news entries and a seen id; join lines silenced; tips; `docs/news.json` | large | 09, 02 | welcome, news + the 15 packs that speak on join |
| 12 | `12-npc-links.md` | "What should I do next?"; Notice Board to Today; residents and wanderers pass the word; gossip that waits; rally; one reset hour; `NPC-01` to `NPC-20` | large | 02, 09 | npc, town, wander, caravan, bounty, quests, party, atlas, saga, help |
| 13 | `13-realm-site.md` | hosting: task-first realm page, `realm/start/`, `realm/menu/`, `realm/story/`, search by task, catalog cleanup | large | 04, 09, 11 | none (hosting repo) |

## Rules every workstream inherits

These are in `CLAUDE.md` and `docs/WORKING.md`; they are repeated because every spec's last task does them.

1. Every pack whose files change gets a higher `header.version`, then `node tools/sync-diag.mjs`.
2. Any change to behavior, commands, options or saved data updates `docs/PACKS.md` in the same commit
   (and the `README.md` table when a summary or command changes). Read that file one `## ` section at a
   time; never open it whole.
3. Players notice it: a short entry at the top of `docs/NEWS.md`, plain ASCII.
4. `release/notes.json`: `notes`, and `packNotes.<folder>` for every bumped pack.
5. Regenerate last, in this order: `node tools/help-catalog.mjs`, `node tools/admin-catalog.mjs`
   (then bump `admin_bp` if it changed), `node tools/gen-news.mjs`, `node tools/sync-diag.mjs`.
6. `npm run check 2>&1 | tail -30` and `npm run build 2>&1 | tail -3` pass.
7. Game text is plain ASCII plus `§` codes. Never a form `.header()`: a section title is
   `.label("§l§6Title")`. Before every `setActionBar`, send `realm:actionbar`.
8. Anything per tick or per player is profiled before and after (`tools/test-bds/suite.mjs --perf 10,40`,
   120 s). Budget: 0.15 ms a tick for a typical pack, the bundle under 5 ms at 40 players.
9. Behavior is tested on BDS (`tools/test-bds/`), not only in unit tests. Run the scenarios the change
   touches locally and let CI run the rest.
10. Never run for real from a session: `node tools/ci-release.mjs`, hosting's `publish-packs.mjs` without
    a dry run, anything that uploads to a `packs-<slug>` release. CI is the only release path.
11. The Realm's saved data is production data. No workstream may write a key in a new shape over an old
    one without reading the old shape first, and a corrupt read never overwrites saved data.

## Things only the owner can do

Each workstream's release puts its own steps in `MANUAL-STEPS.md` (nishant/skills). The known ones:

- **Before 01 ships, 2 minutes on a phone:** run `/titleraw @s actionbar {"rawtext":[{"text":"Line one of a caption\nLine two of a caption\nLine three"}]}` and say whether three rows show above the hotbar. If not, 01 ships with `captionAt: "subtitle"`.
- **After 08 is live:** re-add public waypoints and order them; have players re-add their own; unlock and drop the old Waypoint Menu items; deactivate the third-party add-on's two packs. Leave Beta APIs on (Holograms needs it).
- **After 09 is live:** on a phone and a controller, check that using the star opens the menu (a nether star has no use action; a long press may start mining instead). If it does not, 09's spec has a fallback.
- **Real-client checks the harness cannot do:** an NPC tap while holding the star (`NPC-10`), the recap popup behind the welcome card, quest box crowding with a lead.

## Backlog (not specified here; becomes ROADMAP entries)

- Story "should" tier: the 32-row cut and merge list (68 to about 58 main quests, about 20 to 14 hours), clock-free alternatives for the 63 clock or sleep steps, plural page variants, the dangling threads, *Hearth and Table* to about 18 steps (`research/story-content.md` 5.3, 5.10).
- Story "could" tier: one braided opening chapter, companion arcs, a gentler Choir, dialogue as captions.
- A `hud_rp` caption box that restyles the action bar when the text starts with an invisible marker (`research/cutscenes-text.md` 7.7).
- Daily quests that reach into other packs (bounty, favor, Atlas site, town delivery, dungeon kinds).
- A realm log, "while you were away", from `realm:gossip`, `sky_event` and `siege`.
- "Happening now" Minimap destinations: bounty targets, storm cell, tornado, meteor crater, caravan.
- A Crowns statement (`crowns-shared.js`, `realm:crowns_change`): 20 packs write the scoreboard themselves.
- Party gaps: chest lock sharing, Atlas finds, festival activities, splitting a Crowns payment.
- Seasons that matter: weather odds, seasonal fish, a season line on the HUD.
- One list of every leaderboard in Stats.
- Shared helper modules for the copies of `show` (45 packs, 20 variants), `isOp` (40), `online` (24), `fmt` (16), `send` (14), `itemName` (10) (`research/pack-consolidation.md` section 7).
- Hosting: a `retired` / `replacedBy` state in `publish-packs.mjs`, only if a pack is ever retired.

## Research index

| File | Covers |
|---|---|
| `research/saga-flow.md` | `/realm:saga` today, availability, the tracker, party rules (17 messy cases), saved data, the redesign |
| `research/cutscenes-text.md` | `playVision`, both text complaints, channel limits, the text module, 15 bugs, other offenders |
| `research/saga-jank.md` | `JNK-01` to `JNK-26` and 8 structural fixes |
| `research/story-content.md` | All 59 stories and 252 chapters, the critique, 24 drafted recaps, 58 drafted tips, new fields and rules |
| `research/menus-settings.md` | The measured surface, the new tree, all 182 commands placed, all 605 settings classified, bugs |
| `research/menu-proposal.mjs` | A working prototype of `menu.js` and `check-menu.mjs` (0 problems against today's catalog) |
| `research/pack-consolidation.md` | One line per pack, script events, family verdicts, merge costs, duplicate helpers, connections |
| `research/waypoints.md` | The add-on being replaced, what overlaps here, the full design with every screen's copy |
| `research/npc-world.md` | The NPC map, `NPC-01` to `NPC-20`, the connection proposals, the offer-system overlap |
| `research/hosting-onboarding.md` | The release pipeline's constraints, website proposals, the login-noise inventory, open issues |

Where a research file names a protocol differently (`realm:menu_ping`, `realm:hub_ping`,
`realm:login_ping`, `realm:login_line`), the contract in this README is the one to build.
