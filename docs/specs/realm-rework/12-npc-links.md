# NPC links: the world points at the story, one reset hour, a party rally, NPC-01 to NPC-20

Status: in progress · Slug: realm-rework-12-npc-links · Date: 2026-11-15 · Size: large
Repos: nishant/mc-packs (spec lives here), nishant/skills (`MANUAL-STEPS.md` only, T11)
ROADMAP: `ROADMAP.md`, entry "Realm rework 12: NPC links (what next at every townsfolk, Notice Board to Today, party rally, one reset hour)"

Program: `docs/specs/realm-rework/README.md`. Its decisions D1-D20 and contracts C1-C8 bind this spec. This
spec defines contract C6 (`realm:rally_ask` / `realm:rally`) and the module `tools/day-shared.js` of C7.
Depends on (must be released first): 02 (`realm:saga_lead`), 09 (`realm:menu_open`, `realm:card_ping`,
`packs/admin_bp/scripts/menu.js`, `tools/sync-cards.mjs`). Everything here still works when the other side
is missing: no lead means no button, no `admin_bp` means the board shows its own small form.

## Goal

A player who comes back after weeks can tap any townsfolk, any mayor, any town's Notice Board, a resident or
a wanderer and be told who is waiting for them and where. A party can be called to one spot without a
teleport. The four daily clocks become one, at an hour when nobody is playing, and a roll never takes away a
fight or a half-done cull. The twenty world-side bugs the research found are fixed or closed with a reason.

Outcomes (each checkable):

1. Tapping any townsfolk or mayor while `saga_bp` has pushed a lead shows a first button
   `What should I do next?`; picking it shows the NPC's line, the story and chapter, the hint and a
   `who - distance direction` line. No lead: no button. (T2, T3; BDS `npc-lead.js`)
2. The first townsfolk tapped after 3 or more days away greets with the lead instead of weather talk, once;
   after 7 or more days away the player gets one Realm Mail letter from the quest giver, once per absence. (T3)
3. Tapping a built Notice Board sign sends `realm:menu_open { player, screen: "today" }`; without `admin_bp`
   it opens a small form with the lead. A new town gets its board at once, free. (T4; BDS `town-board.js`)
4. Residents answer a tap with a line (the lead, town news or the time of day), every 3 s at most; a
   wanderer's greeting carries the giver's message once per lead. (T4, T5)
5. The town keeps the newest 8 pieces of gossip at any age; the first tap after an absence tells one; a
   piece is marked heard only after its menu showed; every piece also appears in the inn's
   `Hear the news`. (T2, T3)
6. `/realm:party_rally`, the Today screen's `Call my party here` and a Bell Tower's bell send
   `realm:rally_ask`; `party_bp` answers with `realm:rally`; mates get one chat line, a HUD line and the
   Minimap star for 5 minutes. Nobody is teleported. One call per party per 60 s. (T4, T9; BDS `party-rally.js`)
7. Bounties, daily quests, favors and the townsfolk talk and gift limits roll at one hour (default 10:00
   UTC), read from one stored value. On the first day after the update no list rolls twice and none is
   lost. (T1, T3, T6, T7, T8)
8. A day roll keeps a champion target that a player is within 96 blocks of, and every cull with progress,
   under `Still open from yesterday`. (T6; BDS `bounty-reset-grace.js`)
9. Daily quests and community goals have a button at every mayor, expeditions at Reyes, festival activities
   at Quill, the fishing tournament at Tobin. (T8; BDS `npc-faces.js`)
10. `/realm:calendar` shows `The realm's story: Act II finished. You: Act I.` once anyone finished an act. (T7, T8)
11. A sneak-tap never takes a tool, an enchanted or unstackable item, and asks before taking anything the
    townsfolk does not love or like. (T2, T3; BDS `npc-gift-safe.js`)
12. `NPC-01` to `NPC-20`: 17 fixed with a test each (table in "Current state"), 3 closed under Out of scope.

## Out of scope

- A `board` role in the Townsfolk offer round, or any offer list on the board (the research's proposal B).
  README D15: the board opens the Realm Menu's Today screen.
- The lead itself (`nextStep`, `realm:saga_lead`, `tools/saga-lead.test.mjs`): workstream 02.
- The Today screen, the login card, `realm:card_ping`: workstreams 09 and 11. This spec adds one entry to
  `menu.js` and one card contributor (`party_bp`).
- `g:part`, `g:next`, `g:nights` in `realm:npc_flags`: workstream 04 adds them. Lines here that read them
  simply never match until 04 ships (the lead does the pointing).
- `NPC-10` (an NPC tap while holding the Realm Menu star may open both menus): suspected only, needs a real
  client on touch, controller and mouse. It is an owner's manual check (Release). If it reproduces, the fix
  is a follow-up in `admin_bp` (ignore `itemUse` in the tick of, or the tick after, a
  `beforeEvents.playerInteractWithEntity` on an entity tagged `realm:npc` or `realm:resident`).
- `NPC-18` (one returning player past Act II can draw a siege on the first night back): by design
  (`packs/calendar_bp/scripts/main.js:1237-1242`), severity Info. A guard needs a second "last seen" store in
  `calendar_bp`; it goes to the Backlog as "No siege roll on the first night back".
- `NPC-20` (a walking wanderer's label may trail its head): suspected only, needs a real client. Owner's
  manual check (Release). Wanderers of the Wilds sits at its 0.15 ms budget, so no per-tick label sync is
  added without that evidence.
- Gossip from "two towns over" (`at` on `realm:gossip`), a letter line about the caravan, a guild rank
  footer, merging favors, daily quests and bounties into one data model.
- Teleporting anyone. Renaming or removing any command or option. Any saved-data key in a new shape.

## Decisions

README decisions used: D9 (the lead), D14 (cards), D15 (board opens Today), D16 (quieter defaults),
D17 (one reset hour, no sweep of a fight), D18 (`realm_scripted`, not touched here).

Local decisions (defaults are marked):

| # | Decision | Why |
|---|---|---|
| L1 | Consumers read the lead through one shared module, `tools/lead-shared.js`, copied to `scripts/lead.js` of `npc_bp`, `town_bp`, `wander_bp` by `tools/sync-lead.mjs`. | Three packs need the same validation and the same `who - 140m NE` line (WORKING.md C14). It is a new row in README C7. |
| L2 | The reset hour is **one stored value**: score `day_reset_hour_utc` on the scoreboard objective `realm_cfg`. Each of the four packs shows it on its own settings page as the same option (its `read`/`write` go to that score), and each reads it through `scripts/day.js`. | Packs can only share state through tags, scoreboards and script events (WORKING.md). One value cannot drift; a broadcast between four copies can. It works in the bundle and in single-pack installs. |
| L3 | The option keeps the key `resetHourUtc` in `bounty_bp` and `quests_bp` (it exists there today, default 0) and is new as `dayResetHourUtc` in `saga_bp` and `npc_bp`. Config default 10 in all four. An old explicit `resetHourUtc` override of `bounty_bp` or `quests_bp` is copied into the shared value once. | No option is deleted or renamed; an operator's earlier choice is kept. |
| L4 | A day key never goes backwards: a list rolls only when the new key is **greater** than the saved one. | The saved keys are UTC day numbers; with the hour at 10 the key is one lower until 10:00 UTC. "Not equal" would roll everything twice on the first day. |
| L5 | At a roll, a champion target with a player within 96 blocks of it is carried into the new day until everyone has left it or it is claimed; a cull with progress is carried for one more day. Carried bounties come on top of the new list. No "10 minutes left" warning. (default) | D17. A warning is one more chat line for something that no longer hurts. |
| L6 | The Notice Board is built free: a new town gets it at once, and an existing town whose board is not finished gets it at the next world load. World option `freeNoticeBoard`, default on. (default) | The board is the world's door to Today; today it costs 32 planks and 3 signs that someone must think to deliver. Level 1 then needs only the Well. |
| L7 | With `admin_bp` installed the board opens Today and nothing else. `Call my party here` is a normal Today entry (`/realm:party_rally`), shown whenever a party mate is online, not only when Today was opened from a board. (default) | C3 carries no "opened from" fact and Today is drawn from cards; one button that always means the same thing is simpler than a board-only state. The place is named from the nearest town, so at a board it reads as the town. |
| L8 | `realm:rally` carries `ticks` (how long it lasts), not an absolute `until`. | Each consumer adds it to its own `system.currentTick`. |
| L9 | A rally is never saved: a restart ends it. Offline mates get nothing. | It lasts 5 minutes; a letter per call would be noise. |
| L10 | The letter after 7 days is sent by `npc_bp` through the existing `realm:mail_send`, from the giver's name, at most once per 7 days per player (`npc:letter`), only when the world option `letters` is on. | `npc_bp` already writes letters and already owns the "last seen" day. |
| L11 | An accepted road wanderer is kept while its player is offline only until `acceptedLifeMinutes` after the accept, in real time. | `saga_bp` ends the job on the same real-time limit (`packs/saga_bp/scripts/wander.js:136-138`); a paused clock in one pack only would leave a wanderer with nothing to say. This differs from the research, which proposed pausing the clock. |
| L12 | `gossipChance` default 25 becomes 10; `Give` moves below the other buttons; `Who lives here?` moves into the next-step form when the menu is full. (default) | The inn now lists town news, so the greeting can talk less (D16). A full menu scrolls on a phone at about 6 buttons. |
| L13 | The inn remembers 10 news items (`newsKept` 6 to 10). (default) | Gossip now shares the list with sky events. |
| L14 | The caravan's `lateHours` gets the value 0, "until the next caravan is due", and 0 becomes the default. | NPC-07. The key stays. |
| L15 | Residents are recognized after a transformation by name, town radius and the spawn cause `Transformed`, without a hidden name marker. | A marker means renaming every living resident. A name-tagged witch is never touched: only a mob that the game just transformed is. |

## Current state

Paths are relative to the repo root. `main.js` means `packs/<pack>/scripts/main.js`. Line numbers are from
commit `470be3d`; find the function by name if they moved.

### The pieces this builds on

- **Townsfolk** (`npc_bp`): 12 fixed ids in `config.js:112-292`: `mara` (cartographer), `tobin` (fisher),
  `reyes` (warden, guildmaster), `elsie` (innkeeper), `bram` (mayor), `quill` (merchant), `ida`
  (relicsmith), `sol` (skymage), `hollis` (priest), `moss` (gravedigger), `wren` (stablehand), `bea` (chef);
  every one also has the role `questgiver`. Town mayors have ids `mayor:<town id>` and the role `mayor`
  only (`mayors.js`, `folkOf` at `main.js:113`).
- **The offer round**: `tapped()` (`npc_bp/main.js:1066-1129`) sends `realm:npc_talk { req, player, npc,
  roles, name }`, waits `OFFER_TICKS` (4), collects `realm:npc_offer { req, pack, key, label, order? }`
  (handler at `1131-1147`, at most 16, label cut at 80), adds its own `Give` (order 0), `Ask about...` (90)
  and `Who lives here?` (95), shows one `ActionFormData`, and sends `realm:npc_choose { player, npc, pack,
  key }` for another pack's button. The greeting comes from `greetingFor()` (`1602-1627`).
- **`realm:npc_debug { player, action: "tap", npc, sneak? }`** (`npc_bp/main.js:2555-2583`) is how scenarios
  tap: simulated players fire no entity-interact events.
- **Days in `npc_bp`**: `utcDay()` (`main.js:1172`) is `Math.floor(Date.now() / 86400000)`; `talkedTo`
  (`1357-1365`) compares `a[1] === day`, `giveGift` (`1425-1454`) compares `a[2] === day`, `keepsake`
  (`1368-1387`) uses `day - a[4]`.
- **Gossip**: `gossipAlive()` (`1497-1500`) drops everything older than `gossipHours` (48); `hearGossip`
  (`1509-1536`); `gossipLine` (`1557-1580`) rolls `gossipChance` and saves `npc:heard` before the form is
  shown. Templates are pairs `[about someone else, about the listener]` in `hearth.js:492-603` (`GOSSIP`,
  with `GOSSIP.news` for pieces about nobody and `GOSSIP.other`).
- **Flag reactions**: `REACTIONS` (`hearth.js:611+`) entries `{ when: { flag: value }, lines: { npcId: line } }`,
  matched by `flagHolds` (`main.js:1590-1595`: exact, `!x`, `>=n`, `<=n`), used 35% of the time.
- **Town Projects** (`town_bp`): the Notice Board design puts three `minecraft:wall_sign` blocks at local
  `(x, 1, 0)`, x = -1, 0, 1 (`designs.js:92-98`); the Bell Tower hangs a `minecraft:bell` at local
  `(0, 4, 2)` (`designs.js:62-68`); `toWorld(spot, x, y, z)` (`designs.js:155-159`) turns local into world.
  `refreshBoard(t)` (`main.js:1043-1071`) writes the signs from `boardTexts()` (`life.js:234-241`). A town's
  record is `Town` (`main.js:66`), its log `t.log` is `[Realm day, text][]`. `finishProject` (`main.js:428-472`)
  announces, pays and builds. Scenario hook: `realm:town_test` (`main.js:3123-3225`), only while the
  scoreboard objective `realm_test_hooks` exists.
- **Residents**: a tap is canceled and answered with one gray line at most every 200 ticks
  (`town_bp/main.js:3873-3895`, `tapSaid` at `3463`); `entityDie` marks a family for replacement
  (`3851-3870`); nothing handles a transformed resident.
- **Wanderers** (`wander_bp`): `roll()` (`main.js:558-632`) makes a `Live` record with one owner `o`;
  `upkeep()` (`1006-1087`) drops a record whose entity is gone (`leave(wid, "gone")`); `tapped()`
  (`1130-1200`) runs the same offer round with `npc: "w_<wid>"`. Named ids (`lines.js:10-19`): `pell`,
  `anwen`, `brannoch`, `rook`, `marigold`, `tamsin`, `vesk`, `hob`.
- **Parties** (`party_bp`): members carry the tag `realm_party:<code>`; `partyOf(id)`, `parties()`,
  `tell(code, text)`, `mutedIn(code)`, `where(from, to)`; the HUD loop runs every 40 ticks
  (`main.js:424-460`); commands are registered through `handler(name, run)` (`711-725`).
- **Minimap** (`map_bp`): `destination()` (`main.js:564-590`) returns the picked waypoint, else a siege,
  else the story target from `realm:track`.
- **Bounty Board** (`bounty_bp`): `today()` (`main.js:82`), `ensureDay()` (`348-352`, rolls when
  `day().d !== d`), `roll()` (`317-334`), `sweep()` (`597-609`, every 10 s removes every loaded champion
  whose tag is not in today's list). Seven more places compare `d.d` with `today()` (lines 340, 598, 635,
  667, 683, 837, 884, 939). There is no test hook for the day.
- **Daily Quests** (`quests_bp`): `today()` (`main.js:24`), `questsOf()` (`114-131`, rolls when
  `day.d !== d`), saved per player as `{ d, q }`.
- **Favors** (`saga_bp`): `today()` (`data.js:140`) is the UTC day; its four callers (`ui.js:257, 955,
  1029, 1827`) already compare with `fs.d >= day` and `fs.d < day`.
- **Settings**: an option may carry `read` and `write` to keep its value outside the pack's own `:cfg`
  property (`settings-core.js:127-159`; `build_bp/scripts/settings.js` uses it).
- **Shared-copy tools**: `tools/lib/shared-copy.mjs` (`syncCopies`), as used by `tools/sync-gossip.mjs`.
  A module on `SHARED` in `tools/bundle.mjs:264` is stored once in the bundle and must have no relative
  import and no module-level state.
- **Realm Mail**: `realm:mail_send { to, from, subject, body }` (`mail_bp/main.js:641-672`): `to` is a
  player id or name on the roster, `from` any display name, subject cut at 40, body cleaned; the mail pack
  tells an online reader itself.

### Traps found while reading

- A simulated player's block tap arrives with `isFirstEvent` false and its entity taps fire nothing
  (`tools/test-bds/README.md`, "Running every example"). Every tap in a scenario goes through a debug hook.
- A simulated player gets a new `player.id` on every spawn, so "leave and rejoin as the same player" cannot
  be played on the harness.
- Server-only test hooks are sent with `await t.console("scriptevent realm:<id> <json>")` and checked with
  `ev.sourceType === ScriptEventSource.Server`; debug hooks sent with `sys.sendScriptEvent` have no
  `sourceEntity`.
- `getTopmostBlock` skips water and can hand back an unreadable block at y 319 (WORKING.md C15, C16).
- `entityDie` never fires for `minecraft:npc`.
- In the bundle every `beforeEvents` tap handler must start with `if (ev.cancel) return;` (C13).
- `settings.js` has a hand-written top (the `OPTIONS` list) and a generated tail below the marker line
  `// ---- Shared: the same in every pack.`. Edit only above the marker.
- The research says `bounty-news.js` has a debug path for the day. It does not; T6 adds one.

### The bugs

"V" was verified by reading the code at the lines given; "S" needs a client.

| Id | Sev | Cause (file:line) | Here |
|---|---|---|---|
| NPC-01 | High, V | `npc_bp/main.js:1040` (`gift = player.isSneaking`), `1082-1085` (gift before the menu), `1398-1408` (`giftInHand`: only a name or lore protects an item), `1425-1454` (`giveGift` takes 1) | T2, T3 |
| NPC-02 | High, V | `bounty_bp/config.js:6` (`resetHourUtc: 0`), `main.js:348-352`, `317-334`, `597-609`; `quests_bp/config.js:6`; `saga_bp/data.js:140`; `npc_bp/main.js:1172` | T1, T3, T6, T7, T8 |
| NPC-03 | Medium, V | `town_bp/main.js:3851-3870` is the only handler for a lost resident; no `entitySpawn` handler exists in `packs/town_bp/scripts` | T4 |
| NPC-04 | Medium, V | `wander_bp/main.js:568` (one live wanderer per owner), `619` (`o: player.id`), `629` (only the owner is told), `1150`, `1174` (`waiting for someone else`) | T5 |
| NPC-05 | Medium, V | `wander_bp/main.js:1011-1016`: a record whose entity is not loaded calls `again(rec)`, which returns nothing when the owner is offline (`936-939`), then `leave(rec.w, "gone")`; after a world load nobody is online | T5 |
| NPC-06 | Medium, V | `npc_bp/main.js:1497-1500` (48 real hours), `1557-1559` (25% of taps) | T2, T3 |
| NPC-07 | Medium, V | `caravan_bp/config.js` (`lateHours: 24`), `main.js:807-808` | T10 |
| NPC-08 | Medium, V | `caravan_bp/main.js:406-412` (no spot: world spawn), `673-688` (`getTopmostBlock` + 1, no water, tree or roof check), `705-708` (a trader whose offset is not standable falls back to the spot's own block), `731` (llamas the same) | T10 |
| NPC-09 | Medium-low, V | `elite_bp/main.js:544-565` (`convert` never calls `isProtected`); `bounty_bp/main.js:276-290`, `516-537` (no zone check; the pack has no `zones.js`) | T6, T10 |
| NPC-10 | Low-medium, S | `admin_bp/main.js:1281` (`itemUse`), `npc_bp/main.js:1021-1048` | Out of scope, manual check |
| NPC-11 | Low, V | `show()` retries 20 times, 20 ticks apart: `npc_bp/main.js:1055-1063`, `wander_bp/main.js:262-270`, `caravan_bp/main.js:847-855`, `town_bp/main.js:1114-1122`, `bounty_bp/main.js:968-974` and `988-996` | T3, T4, T5, T6, T10 |
| NPC-12 | Low, V | `town_bp/main.js:3889-3894` (one gray line, 200 ticks) | T4 |
| NPC-13 | Low, V code, S effect | `waystone_bp/main.js:938`: the spawn point is the innkeeper's own block | T10 |
| NPC-14 | Low, V | `wander_bp/main.js:970` (`talking` is a Set), `1142`, `1193` (the first talker to finish frees the walker) | T5 |
| NPC-15 | Low, S | `wander_bp/main.js:475-519` (`findSpot`: no pattern for player-made blocks), `689-710` (no puff when they appear) | T5 |
| NPC-16 | Low, V | `atlas_bp/main.js:1158-1165` (`afterEvents.playerInteractWithBlock`: the held block is placed) | T10 |
| NPC-17 | Low, V | `npc_bp/main.js:1571-1578` saves `npc:heard` inside `greetingFor`, before `show()` at `1114` | T2, T3 |
| NPC-18 | Info, V | `calendar_bp/main.js:1237-1242` | Out of scope |
| NPC-19 | Low, V | Two memories: `npc:gossip` and the inn's `realm:sky_event` list (`waystone_bp/main.js:849-870`, which stores any `kind` that has a `text`) | T3, T10 |
| NPC-20 | Low, S | `wander_bp/main.js` label sync every 2 ticks | Out of scope, manual check |

## Design

### Data

#### D-1 The lead as consumers keep it (`scripts/lead.js`, from `tools/lead-shared.js`)

```js
/**
 * @typedef {object} Lead   one cleaned realm:saga_lead (README C1)
 * @property {"start" | "step" | "report" | "party" | "wait"} st
 * @property {"main" | "side" | "heart" | "wander" | "festival"} k
 * @property {string} s        story id, at most 40
 * @property {string} title    at most 40
 * @property {string} [ch]     at most 48
 * @property {string} hint     at most 120, never empty
 * @property {string} [why]    at most 120
 * @property {string} [npc]    /^[a-z0-9_:]{1,40}$/  ("hollis", "mayor:riverside", "w_pell")
 * @property {string} [who]    at most 32
 * @property {string} [place]  at most 32
 * @property {string} [dim]    one of the three vanilla dimension ids
 * @property {number} [x]      whole number, only with dim and z
 * @property {number} [z]
 * @property {number} more     0 to 9
 * @property {{ on: number, of: number, hold?: string, behind: string[] }} [party]
 */
```

Every string is cleaned with `clean(v, max)`: not a string gives `""`; remove `§.` pairs; remove every
character outside `\x20-\x7e`; trim; cut at `max`. A message with `v !== 1`, without a string `player`, with
an unknown `st`, or with an empty `hint` after cleaning is "no lead" (the player's entry is deleted). An
unknown `k` becomes `"main"`. `party.on` and `party.of` are whole numbers 1 to 12, `behind` at most 6 names
of at most 32.

#### D-2 The shared reset hour (`scripts/day.js`, from `tools/day-shared.js`)

- Scoreboard objective `realm_cfg` (display name `Realm shared settings`), participant
  `day_reset_hour_utc`, score 0 to 23. No score: each pack falls back to its own config default (10 in all
  four; a unit test pins that they are equal).
- Day key: `dayKey(now, hour) = Math.floor((now - hour * 3600000) / 86400000)`. With hour 0 this is exactly
  the UTC day number every pack saves today.
- A list rolls only when `shouldRoll(savedKey, key)` is true: the saved key is not a finite number, or
  `key > savedKey`.

Saved keys and what happens on the first day after the update (U = the UTC day number at that moment):

| Pack | Saved | Today's rule | New rule | First day |
|---|---|---|---|---|
| `bounty_bp` | world `bounty:day` `{ d, list }` | roll when `d !== today()` | roll when `shouldRoll(d, key)` | Saved `d` is U or lower. Before 10:00 UTC the key is U - 1: no roll, the list stays current (a list is current while `!shouldRoll(d, key)`). At the next 10:00 UTC after `d + 1` begins the key passes `d` and it rolls. The first list lives 10 to 34 hours. Nothing rolls twice. |
| `quests_bp` | player `{ d, q }` | roll when `d !== today()` | roll when `shouldRoll(d, key)` | Same: a player who got quests on UTC day U keeps them until 10:00 UTC on U + 1. |
| `saga_bp` | `saga.fv[npc].d` | `fs.d >= day` = done today | unchanged comparisons, new key | A favor done on U stays "done" until 10:00 UTC on U + 1. |
| `npc_bp` | `npc:aff` entries `[pts, talkDay, giftDay, bits, keepsakeDay]` | `a[1] === day`, `a[2] === day` | `a[1] >= day`, `a[2] >= day` | A talk or gift on U is not counted again before 10:00 UTC on U + 1. |

No saved value is rewritten by the migration. Rollback: reverting the release puts the old comparisons
back; the saved keys are still UTC-day-like numbers at most one lower than the UTC day, so the old code
rolls once on its first run and carries on.

An old explicit override (`resetHourUtc` inside the JSON of `bounty:cfg` or `quests:cfg`) is copied into the
score by that pack at world load when no score exists yet. The override itself is left where it is.

#### D-3 New saved data

| Key | Scope | Pack | Shape | Bound |
|---|---|---|---|---|
| `npc:seen` | player | `npc_bp` | number: the day key of the last join or townsfolk tap | one number |
| `npc:letter` | player | `npc_bp` | number: the day key when the last "Still waiting" letter was sent | one number |
| `saga:realm_act` | world | `saga_bp` | number 0 to 5: the highest act any player has finished | one number |
| score `day_reset_hour_utc` on `realm_cfg` | world | shared | 0 to 23 | one score |
| `bounty:day` `list[].old` | world | `bounty_bp` | `1` on a carried bounty | at most `count` (8) carried entries |
| `wander:live` `rec.m` | world | `wander_bp` | `string[]` party mates' player ids at spawn | at most 11 ids per record |

`npc:heard`, `npc:gossip`, `npc:aff`, `town:*`, `party:*` keep their shapes. Memory only (never saved): the
lead maps, `returning` in `npc_bp`, the sign and bell maps in `town_bp`, rallies in `party_bp` and `map_bp`.

#### D-4 Script events (all JSON, all far under 2048 characters)

```
realm:rally_ask   any pack -> party_bp
{ "player": "<player id>",                      required: the caller, must be online
  "place"?: "<plain ASCII, 1 to 32>",            how the spot is named; party_bp names it when absent
  "dim"?: "<dimension id>", "x"?: <number>, "y"?: <number>, "z"?: <number> }
                                                 the spot; used only when all four are given, the dimension is
                                                 the caller's and it is within 32 blocks of the caller;
                                                 otherwise the caller's own feet

realm:rally       party_bp -> every pack (map_bp reads it)
{ "code": "<party code>", "by": "<caller's player id>", "name": "<caller's name, at most 32>",
  "place": "<plain ASCII, 1 to 32>", "dim": "<dimension id>", "x": <int>, "y": <int>, "z": <int>,
  "ticks": 6000 }                                how long the call lasts, in game ticks (rallyMinutes x 1200)
```

Senders of `realm:rally_ask`: `party_bp` itself for `/realm:party_rally` and its menu button (it calls the
same function, no event), `town_bp` for a Bell Tower's bell and for the board's fallback form. Only
`party_bp` sends `realm:rally`. Limits, in `party_bp`: the caller must be in a party with at least one
other member online; a member muted in the party cannot call; one call per party per
`rallyCooldownSeconds` (60), counted in game ticks; a newer call replaces the party's older one.

Other events this spec adds or extends:

```
realm:saga_progress  { "player", "act", "realm"?: 0-5 }     saga_bp adds "realm": the highest act anyone finished
realm:sky_event      { "kind": "gossip_<gossip kind>", "text": "<one line>" }   npc_bp, one per accepted gossip
realm:wander_spawn   gains "mates": ["<player id>", ...]    wander_bp
realm:wander_live    { "live": [{ "w", "o", "a": 0|1, "e": 0|1, "m": n }] }     wander_bp's answer to
                     realm:wander_debug { "action": "live" } (operators, tests)
realm:town_test      new actions "board", "bell", "resident_tap" (BDS harness only)
realm:bounty_test    { "action": "next_day" } (server console only)
```

`realm:saga_lead` and `realm:saga_lead_ping` are README C1 and `realm:menu_open` is C3; this spec only
consumes or sends them as defined there.

### UI

Phones: an action form shows about 6 buttons before it scrolls and a button line is 168 px wide. No form
uses `.header()`. Every string below is final. `§` codes are part of the copy. Light and dark: not affected
(the game draws its own forms).

#### U-1 The townsfolk menu (`npc_bp`)

Button order (lower first; another pack's offers keep the order they send):

| Order | Button | Shown when |
|---|---|---|
| 5 | `What should I do next?` | the player has a lead, `lead.npc` is not this NPC, and the world option `nextStep` is on |
| 20-50 | other packs' offers | as today |
| 85 | `Give <Item Name>\n§8a gift, takes 1` | the held item is giftable (U-3); was order 0 |
| 90 | `Ask about...` | as today |
| 95 | `Who lives here?` | no `What should I do next?` button, or fewer than 5 buttons before it |
| last | `Goodbye` | always |

Body, under the greeting line `§e<Name>:§r "<greeting>"`:

- when `lead.npc` is this NPC and `lead.st` is `start`: `§6<Name> has been waiting for you.`
- when `lead.npc` is this NPC and `lead.st` is `report`: `§6<Name> wants to hear how it went.`
- then, as today, the affinity lines.

`<Name>` is the townsfolk's `name` (`Warden Reyes`, `Mayor Bram`, a town mayor's own name).

#### U-2 The next-step form (`npc_bp`)

Title: the same as the menu (`plainName(t)`). Body lines, in this order, a blank line after the first:

```
§e<Name>:§r "<line from the table below>"

§7<title>: <ch>                                     or §7<title> when the lead has no ch
§f<hint>
§7<where>                                           left out when nothing is known
§7Your party: <on> of <of> here. It waits for <hold>.     lead.party with hold
§7Your party: <on> of <of> here.                          lead.party without hold
§8<more> other story is open too. Your Story lists them.         more = 1
§8<more> other stories are open too. Your Story lists them.      more > 1
```

`<where>` (function `whereText`): the target is the post of `lead.npc` when that townsfolk is placed, else
`lead.dim`, `lead.x`, `lead.z` when all three are given, else nothing.

| Case | Text |
|---|---|
| target in another dimension | `<who or place> - in the Nether` (`the Overworld`, `the End`) |
| target is a post, under 4 blocks | `<who> - right here` |
| target is a post | `<who> - 140m NE` |
| target is coordinates | `<place or who> - 300m E (412, -96)` |
| no target, but a `who` | `<who>` |
| no target, no `who` | line left out |

Compass: 8 points, north is -z, east is +x (`compass(dx, dz)` as in `npc_bp/main.js:573`). Distance is the
flat distance, rounded.

Buttons: `Who lives here?` (only when the menu left it out, U-1), then `Thanks`.

Lines, by voice and lead state. The voice is `mayor` for `bram` and every id starting with `mayor:`; the
NPC's own id when the table has it; else `any`. One line of the voice's list for the state is picked at
random among those whose placeholders can all be filled; when none can (or the voice has no list for the
state) the `any` list is used. `{who}` needs `lead.who`, `{hold}` needs `lead.party.hold`; `{title}`,
`{hint}`, `{player}` are always there. `{hint}` is the hint with one trailing `.`, `!` or `?` removed.

| Voice | `start` | `step` | `report` | `party` | `wait` |
|---|---|---|---|---|---|
| `any` | `{who} was asking after you, {player}. Something about {title}.` / `Someone has work for you, {player}. It is about {title}.` | `Still on {title}? Last I heard: {hint}.` / `You have a job half done, {player}. {hint}.` | `{who} is waiting to hear how it went.` / `It is done, then? Go and say so. They are waiting.` | `That one waits until your party is together, {player}.` / `Your friends are part of this one. Find {hold} first.` | `Nothing pressing, {player}. {hint}.` / `Take a breath. {hint}.` |
| `elsie` | `{who} left word for you at the inn, dear. Best not keep them waiting.` | `You look like someone with a job half done. {hint}, wasn't it?` | `You did it, didn't you? Go and tell {who} before you tell me.` | `The others are part of this, love. Find {hold} and go as one.` | `Rest a while. {hint}.` |
| `mayor` | `{who} has been to my office twice about you. Go and see them, would you?` | `The town is counting on you, {player}. {hint}.` | `Report to {who}. Then come and tell me everything.` | `This one is for all of you together, {player}.` | `Nothing from the council today. {hint}.` |
| `reyes` | `{who} wants you. That's all I was told.` | `You have your orders. {hint}.` | `Done? Then report to {who}.` | `Regroup first. {hold} isn't here.` | `Stand down for now. {hint}.` |
| `bea` | `Look who is back. Sit. Eat. {who} has been wearing a hole in my floor waiting for you.` | (none) | `Eat first. Then go and tell {who} how it went.` | (none) | (none) |

Returning players: `npc_bp` works out `days = today's key - npc:seen` at join. With `days >= 3`
(`awayDaysGreeting`) the player is "returning" until two things have happened once each:

1. The first tap on a townsfolk that is not cold to them, while they have a lead whose `npc` is not that
   townsfolk: the greeting is the lead line from the table above (instead of gossip, a festival line, a flag
   reaction or the weather). The menu is otherwise unchanged.
2. The first tap after that (or the same tap when there was no lead): the greeting is the newest piece of
   gossip they have not heard, without the `gossipChance` roll. When there is none, the normal greeting.

A Hollow-Crowned player keeps the cold greeting (`coldTo`), and still gets the button.

`Who lives here?` (`whereabouts`, `npc_bp/main.js:1725-1744`): the line of the townsfolk named by
`lead.npc` ends with ` §6(waiting for you)`.

#### U-3 Gifts (`npc_bp`, NPC-01)

An item is **giftable** when it has no custom name, no lore, a max stack above 1, no enchantment and no
durability component. Otherwise it is never offered and never taken.

| Sneak-tap holding | What happens |
|---|---|
| nothing | an ordinary tap (as today) |
| a named or lore item | chat `§e<Name>:§r "That one has a name. Keep it, it's yours."` (as today) |
| a tool, weapon, armor, enchanted or unstackable item | chat `§e<Name>:§r "Keep your <Item Name>, <player>. You need it more than I do."` Nothing is taken, no menu. |
| giftable, and a gift was already given today | chat `§e<Name>:§r "You already gave me something today. Come back tomorrow."` (as today) |
| giftable, in this townsfolk's `loved` or `liked` list | given at once (as today) |
| giftable, anything else | the confirm form below |

Confirm form: title `plainName(t)`; body
`Give <Name> your <Item Name>?\n\n§7It takes 1 of <amount>. One gift a day.`; buttons
`Give 1 <Item Name>` and `Keep it`. On `Give`, the held item is read again: a different item type, or one
that is no longer giftable, gives chat `§7You are not holding that any more.` and takes nothing.

The menu's `Give` button (order 85) appears only for a giftable item and gives without a second question.

#### U-4 Gossip (`npc_bp`)

- An old piece (more than 2 real days) is told with a gray note after the closing quote:
  ` §7(a few days back)` under 7 days, ` §7(a few weeks back)` under 30 days, ` §7(a while back)` beyond.
- The inn's `Hear the news` (unchanged form) now also lists each piece as `<ago>: <the nameless line>`,
  for example `2h ago: Word is Sam brought down Grimtooth the Vile. The whole town's talking.`

#### U-5 The Notice Board (`town_bp`)

Signs (`boardTexts`): sign 2's fourth line `See /realm:town` becomes `Tap for more`. Sign 3's fallback
`Bring materials\nto the mayor!` becomes `Tap a sign\nfor what's next`.

A tap on any of the three signs of a built board (not sneaking):

- `admin_bp` answered the pack's `realm:help_ping` at load: send
  `realm:menu_open { "player": "<id>", "screen": "today" }`. Nothing else.
- otherwise the fallback form. Title `<Town> Notice Board`. Body:

```
<Town>, a <level name> (level <n>).

§6Next for you                                   this block only with a lead
§7<title>: <ch>                                  or §7<title>
§f<hint>
§7<where>                                        as U-2; posts come from realm:npc_places
§7Your party: <on> of <of> here. It waits for <hold>.     as U-2

Nothing is waiting for you right now.            instead of the block, without a lead
```

  Buttons: `Town projects\n§8<done> of <total> done` (opens `townMenu(player, town.id, false)`),
  `Call my party here\n§8A star to this spot` (only when the player carries a `realm_party:` tag; sends
  `realm:rally_ask` with `place: "the <Town> notice board"` cut at 32 and the middle sign's position),
  `Close`.

A sneak-tap is left alone, so an operator can still break or edit around the board.

#### U-6 The Bell Tower (`town_bp`)

Tapping the bell of a built Bell Tower rings it as always (the tap is not canceled). When the player
carries a `realm_party:` tag, `town_bp` also sends `realm:rally_ask` with
`place: "the <Town> bell tower"` (cut at 32) and the tower's spot. At most one ask per player per 100
ticks. A player without a party: the bell just rings.

#### U-7 Residents (`town_bp`, NPC-12)

One chat line per tap, at most every 60 ticks: `§e<Resident name>:§r "<line>"`. The line, first match:

1. The player has a lead with `st` `start` or `report`, a `who`, and an `npc` that does not start with
   `w_`: one of
   - `{who} keeps asking where you've got to.`
   - `You're {player}! {who} was looking for you.`
   - `Aren't you meant to be with {who}?`
2. The town has a log entry and a coin flip says so (50%): `Did you hear? <newest log text>.` (the text as
   saved, one trailing `.` removed first).
3. By the time of day (`world.getTimeOfDay()`): 0-5999 `Morning. The well's cold today.` /
   `Up early, are you?`; 6000-11999 `Busy day in <Town>.` / `Mind the carts.`; 12000-12999
   `Evening. The lamps come on soon.` / `Long day. Good one, though.`; 13000-23999
   `You should be indoors.` / `Quiet night in <Town>.`

`residentsTrade` on: unchanged (the vanilla trade opens).

#### U-8 Wanderers (`wander_bp`)

The greeting line of the menu (`§e<Name>:§r "<greeting>"`) is chosen in this order:

1. A hostile in disguise: its own greeting (as today).
2. **Carried message**, once per lead per player (remembered in memory): the player has a lead with `st`
   `start` or `report`, a `who`, and an `npc` that does not start with `w_`.
   - `hob`: `Met a traveler on the road who said {who} wants you. I charge nothing for messages. Tips are welcome.`
   - anyone else: `You're {player}? {who} asked every traveler to tell you: come by when you can.`
3. **A story line**, once per player per wanderer per session, for a Recurring Wanderer whose condition on
   the flag `g:part` holds (`g:part` is `<chapter number><part letter>`, for example `4C`; absent until
   workstream 04 ships, and then none of these is used):

   | Wanderer | Condition | Line |
   |---|---|---|
   | `pell` | chapter above 3, or chapter 3 and part C or later | `They say the candles in your chapel go out at midnight. Does the keeper sleep?` |
   | `anwen` | chapter 6 or lower | `Three places on a line. I measured them. Sea, stone, sky. Has anyone been?` |
   | `brannoch` | chapter 5 | `The old mine? Sealed the winter after the storm. My uncle laid the bricks. He never whistled again.` |
   | `rook` | chapter 5 or higher | `Heard somebody burned the Gray Ring. Heard it was you. I'd have done it faster.` |
   | `vesk` | chapter 7 | `The sky has a wound in it. Where I was sent, that would mean run.` |

4. The greeting as today.

Party mates (NPC-04). When someone appears, the owner is told as today; each party mate within 64 blocks is
told `§e[Wanderers] Someone is on the road ahead (<dir>) for <owner>'s party: <name>§e.` (the name in `§6`
for a Recurring Wanderer, `§f` for a Stranger, as in the owner's line; `<dir>` from the mate). In the menu a
mate sees `§7They came for <owner>. Stay close and help out.` where a stranger still sees
`§7<name> is waiting for someone else.` Offers stay the owner's (the story pack decides them).

#### U-9 The rally (`party_bp`, `map_bp`)

- Command `/realm:party_rally`, description `Parties: call your party to where you stand (a star on their
  compass, no teleport)`, any player.
- `/realm:party` menu, for a party of 2 or more: button `Call the party here\n§8A star to this spot, 5 min`
  after `Party chat`.
- Realm Menu, Today screen: entry `Call my party here`, second line `A star to this spot`; `party_bp`'s
  card sets the second line to the place (`Riverside`, or `412, -96`) and hides the entry when no other
  member is online.

Messages (all chat, `§d[Party]` as the pack's other lines):

| When | To | Text |
|---|---|---|
| a call goes out | the caller | `§d[Party] You called the party to <place>. §7They see it for 5 minutes.` |
| a call goes out | each other online member, same dimension | `§d[Party] <name> calls the party to <place> (<dist>m <dir>).` |
| a call goes out | each other online member, another dimension | `§d[Party] <name> calls the party to <place> (in <the Nether>).` |
| not in a party | the caller | `§7[Party] You are not in a party. Start one with /realm:party.` |
| nobody else online | the caller | `§7[Party] Nobody else in your party is online.` |
| muted | the caller | `§c[Party] You are muted in this party, so you cannot call it.` |
| cooldown | the caller | `§7[Party] The party was called <n>s ago. Try again in <m>s.` |
| rallies switched off | the caller | `§7[Party] Party calls are switched off on this realm.` |

Each other member also hears `note.bell` (pitch 1.2, volume 0.6). `<place>` is the asked place, else the
name of the nearest town (from `realm:town_list`) whose center is within 96 blocks in the caller's
dimension, else `<x>, <z>`.

HUD: for `rallyMinutes` (5) after a call, every member but the caller who is not within 8 blocks of the spot
gets `§dRally: <place> <dist>m <dir>` (or `§dRally: <place>, in <the Nether>`) in front of the party HUD
line, joined with ` §7| ` when mates are near, and on its own when none are. It goes through the same two
paths as today (`realm:hud_line` under the Coordinates HUD, else the action bar after `realm:actionbar`),
and only for a player whose `partyHud` preference is on.

Minimap: while a call lasts, a member (not the caller) with no picked destination, more than 8 blocks from
the spot or in another dimension, has the star on the spot, labeled `<place>`. A picked destination wins; a
siege and the story target come after the rally.

#### U-10 Bounties (`bounty_bp`)

- Roll message, when something was carried: the existing line, then
  ` §7Still open from yesterday: <names, comma separated>.`
- Board body: after the new list, one line `§7Still open from yesterday` and then the carried bounties in
  the same format as the others.
- `New bounties in <5h 12m>.` now counts to the shared hour.

#### U-11 Faces for command-only systems

| At | Role | Pack | Button | Order | Opens | Shown when |
|---|---|---|---|---|---|---|
| every mayor (`bram`, `mayor:<town>`) | `mayor` | `quests_bp` | `Daily quests\n§8<done> of <n> done today` | 32 | `showQuests(player)` | always |
| every mayor | `mayor` | `goals_bp` | `Community goals\n§8<n> open` | 33 | `mainMenu(player)` | at least one goal is not done |
| Warden Reyes (`reyes`) | `warden` | `expedition_bp` | `Expeditions\n§8Dungeon runs, alone or as a party` | 41 | `mainMenu(player)` | always |
| Quill (`quill`) | `merchant` (`stallRole`) | `calendar_bp` | `<Festival name>\n§8Activities and what you've done` | 26 | `festivalMenu(player)` | a festival is on |
| Old Tobin (`tobin`) | `fisher` | `fishing_bp` | `Fishing tournament\n§8On now: ends in <12m>` or `Fishing tournament\n§8Next in <3d 4h>` | 22 | a form: title `Fishing tournament`, body `tournamentStatus()`, button `Thanks` | `tournamentEnabled` is on, or one is running |

#### U-12 The calendar line (`calendar_bp`)

Second line of `/realm:calendar`'s body, only when a `realm:saga_progress` with `realm >= 1` was heard:

`§7The realm's story: <Act II> finished. You: <Act I>.`

`<Act II>` is the realm's highest finished act in Roman numerals (`Act I` to `Act V`). `You:` is the act
the player is playing, their finished acts plus one (`Act I` for none finished); with all five finished it
reads `You: all five acts.`

#### U-13 Other copy

- Caravan, no spot set, once per visit, to online operators:
  `§e[Caravan] No caravan spot is set, so the caravan stands near world spawn. Set one with /realm:caravan_spot.`
- Favors page (`saga_bp`): `(a new one at midnight UTC)` becomes `(new ones in <5h 12m>)`.
- The letter (`npc_bp`): from `<who>`; subject `Still waiting`; body for a `start` lead
  `<player>,\n\nWhen you are back: <hint>. I am where I always am<at>.\n\nNo hurry. But soon.\n\n- <who>`
  and for a `report` lead
  `<player>,\n\nI hear it is done. Come and tell me how it went. I am where I always am<at>.\n\n- <who>`.
  `<at>` is ` (<x>, <z>)` when the giver's post or the lead's coordinates are in the Overworld, else empty.
  `<hint>` has one trailing `.`, `!` or `?` removed.

### Security

- **Payloads.** Every new handler parses inside `try`, checks types before use, cleans strings as in D-1
  and caps lengths. `realm:saga_lead` is ignored when the event has a `sourceEntity` or a `sourceBlock`
  (typed by someone, an NPC dialogue or a command block): the lead only ever comes from another pack's
  script. `realm:rally_ask` and `realm:rally` take no text into a form or a sign without `clean`.
- **Rally spam.** One call per party per 60 s (game ticks, in `party_bp`, whoever asks); muted members
  cannot call; the spot must be within 32 blocks of the caller; `town_bp` sends at most one ask per player
  per 100 ticks; a call reaches only members of the caller's own party; no teleport, no item, no Crowns.
- **Letters.** `mail_bp` accepts `realm:mail_send` from any pack and cannot tell packs apart, so the guard
  is at the source: only `npc_bp` builds this letter, from its own template; the only outside text in it
  is `who` (32) and `hint` (120) from a lead that passed D-1; `to` is the joining player's own id; at most
  one letter per player per 7 day keys (`npc:letter`), and only with the world option `letters` on.
- **Operators.** No new operator action. The test hooks are console-only (`ScriptEventSource.Server`) or
  need the harness objective `realm_test_hooks`.
- **Saved data.** No existing key changes shape. New per-player values are numbers. A corrupt read is
  treated as "unset" and never written back as a wrong value: `npc:seen` unreadable means "not away".
  The scoreboard value is validated (whole number 0 to 23) on every read.
- **Gifts.** The server re-reads the held item at the moment of giving (U-3).
- Secrets, auth, public routes: not affected.

### Performance

Everything is event driven: a join, a tap, a change of lead, a day roll. No new interval and no per-tick
work.

- `realm:saga_lead`: one handler in each of `npc_bp`, `town_bp`, `wander_bp`; `saga_bp` sends on change
  only. Each consumer keeps at most 64 leads.
- The reset hour: `hour()` reads the score at most once per 200 ticks per pack (cached).
- `party_bp`'s 40-tick HUD loop gains one Map lookup per player; `map_bp`'s `destination()` gains one
  `rallies.size` test, and a tag read only while a rally exists.
- `town_bp`'s new `beforeEvents.playerInteractWithBlock` handler reads `block.typeId` once and returns for
  anything but a wall sign or a bell.
- `atlas_bp`'s tap moves from the after event to the before event: the same work, earlier.
- Saved data: two small per-player numbers (`npc:seen`, `npc:letter`), one world number, one score.

Budget: every touched pack stays within 0.01 ms a tick of its number before the change, and under its
budget (0.15 ms typical, the Minimap 1 ms). Wanderers of the Wilds and the Minimap sit close to their
lines, so T11 measures before and after:
`node tools/test-bds/suite.mjs --perf 10,40 --perf-only npc_bp,town_bp,wander_bp,party_bp,map_bp,bounty_bp`.

### Ops

Not affected: no env vars, ports, hosting or runner changes, no scheduled jobs. The release goes through
the `release` workflow as always.

## Tasks

Rules for every task:

- Repo / checkout: `mc-packs` at `/home/user/mc-packs` in a cloud session, or the session's worktree. Paths
  below are relative to it.
- Do not bump a `manifest.json`, edit `docs/`, `README.md`, `release/notes.json` or a generated catalog:
  T11 does all of that once. Because of that, `npm run check` fails at its docs and version steps until
  T11; each task's acceptance lists the steps it must pass on its own.
- Game text is plain ASCII plus `§` codes. Never `.header()`. `if (ev.cancel) return;` is the first line of
  every `beforeEvents` tap handler. Script events only through the pack's `onScriptEvent`.
- BDS: `node tools/test-bds/setup.mjs` once, then the command in each scenario's header. Every new scenario
  file starts with a comment that says what it checks and one line with its own run command (the suite
  reads it), exactly as given in the task.
- `saga_bp` belongs to the story lane, which may have work open in it. T7 is the only task that touches
  it; keep its diff to the lines named there, and merge `master` in before pushing.

### T1 Shared modules: the day clock and the lead reader

- Owns: `tools/day-shared.js` (new), `tools/sync-day.mjs` (new), `tools/day-shared.test.mjs` (new),
  `tools/lead-shared.js` (new), `tools/sync-lead.mjs` (new), `tools/lead-shared.test.mjs` (new),
  `tools/test-bds/examples/day-scoreboard.js` (new), `tools/bundle.mjs`, `package.json`, and the generated
  copies `packs/bounty_bp/scripts/day.js`, `packs/quests_bp/scripts/day.js`, `packs/saga_bp/scripts/day.js`,
  `packs/npc_bp/scripts/day.js`, `packs/npc_bp/scripts/lead.js`, `packs/town_bp/scripts/lead.js`,
  `packs/wander_bp/scripts/lead.js` (all new).
- Reads (does not edit): `tools/gossip-shared.js`, `tools/sync-gossip.mjs`, `tools/lib/shared-copy.mjs`,
  `tools/check-pipeline.mjs`, `packs/npc_bp/scripts/script-events.js`.
- Depends on: none.
- Change:
  1. **First, settle one fact on BDS.** Write `tools/test-bds/examples/day-scoreboard.js`:

     ```js
     // The shared reset hour lives in a scoreboard score under a name, not a player (scripts/day.js). This checks the
     // API the module relies on: a string participant can be set, read and removed, and a missing one reads as
     // undefined or throws (both are handled).
     //   node tools/test-bds/run.mjs --quiet --flat --only help_bp --scenario tools/test-bds/examples/day-scoreboard.js
     export default async function (t) {
       const sb = t.world.scoreboard;
       const o = sb.getObjective("realm_cfg") ?? sb.addObjective("realm_cfg", "Realm shared settings");
       o.setScore("day_reset_hour_utc", 7);
       t.check(o.getScore("day_reset_hour_utc") === 7, "a named score reads back");
       t.check(o.removeParticipant("day_reset_hour_utc") === true, "it can be removed");
       let gone;
       try {
         gone = o.getScore("day_reset_hour_utc");
       } catch {
         gone = undefined;
       }
       t.check(gone === undefined, `a removed score is undefined or throws (got ${gone})`);
     }
     ```

     Run it. If the first check fails (named participants do not work on this BDS), stop and report: the
     fallback design is in "Open questions". Do not go on to the other tasks' day work without this pass.
  2. `tools/day-shared.js`, exactly these exports (no import, no module-level state):

     ```js
     // One daily reset hour for every pack with a real-day list: bounties, daily quests, favors and the townsfolk talk
     // and gift limits. The hour is one stored value, a score on a shared scoreboard objective, because packs can only
     // share state through tags, scoreboards and script events. Each pack keeps this file as scripts/day.js
     // (node tools/sync-day.mjs) and shows the value on its own settings page with the option's read and write.
     export const DAY_MS = 86400000;
     export const HOUR_MS = 3600000;
     export const DEFAULT_RESET_HOUR_UTC = 10;
     export const OBJECTIVE = "realm_cfg";
     export const PARTICIPANT = "day_reset_hour_utc";

     /** A whole hour 0 to 23, or undefined. @param {unknown} v @returns {number | undefined} */
     export const cleanHour = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : undefined);

     /** Days since 1970 counted from the reset hour. @param {number} now ms @param {unknown} resetHourUtc */
     export function dayKey(now, resetHourUtc) {
       return Math.floor((now - (cleanHour(resetHourUtc) ?? DEFAULT_RESET_HOUR_UTC) * HOUR_MS) / DAY_MS);
     }

     /** Milliseconds until the next day starts. @param {number} now @param {unknown} resetHourUtc */
     export function msUntilNextDay(now, resetHourUtc) {
       const h = cleanHour(resetHourUtc) ?? DEFAULT_RESET_HOUR_UTC;
       return (dayKey(now, h) + 1) * DAY_MS + h * HOUR_MS - now;
     }

     /** "5h 12m" or "12m". @param {number} ms */
     export function untilText(ms) {
       const m = Math.max(1, Math.ceil(ms / 60000));
       return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
     }

     /** A saved day rolls only forward: no saved key, or a key above it. @param {unknown} savedKey @param {number} key */
     export const shouldRoll = (savedKey, key) => !(typeof savedKey === "number" && Number.isFinite(savedKey)) || key > savedKey;

     /**
      * The pack's view of the shared hour. `world` and `system` are the game's (handed in, so tests can fake them);
      * `fallback` is the pack's own config value, used while nobody has set the shared one.
      * @param {{ world: any, system: any, fallback: () => unknown }} o
      */
     export function createDayClock({ world, system, fallback }) {
       /** @type {number | undefined} */
       let cached;
       let cachedAt = -Infinity;
       const objective = (/** @type {boolean} */ create) => {
         try {
           return world.scoreboard.getObjective(OBJECTIVE) ?? (create ? world.scoreboard.addObjective(OBJECTIVE, "Realm shared settings") : undefined);
         } catch {
           return undefined; // before the world loads
         }
       };
       /** The stored hour, or undefined when none is set. */
       function read() {
         try {
           return cleanHour(objective(false)?.getScore(PARTICIPANT));
         } catch {
           return undefined; // no such score
         }
       }
       /** Stores the hour for every pack; undefined removes it (back to each pack's default). @param {unknown} v */
       function write(v) {
         const h = cleanHour(v);
         try {
           const o = objective(h !== undefined);
           if (o) {
             if (h === undefined) o.removeParticipant(PARTICIPANT);
             else o.setScore(PARTICIPANT, h);
           }
         } catch {
           // the world is not loaded yet: nothing to store
         }
         cached = undefined;
         cachedAt = -Infinity;
       }
       /** The hour in force, read from the score at most every 200 ticks. */
       function hour() {
         const tick = system.currentTick;
         if (cached === undefined || tick - cachedAt >= 200) {
           cached = read() ?? cleanHour(fallback()) ?? DEFAULT_RESET_HOUR_UTC;
           cachedAt = tick;
         }
         return cached;
       }
       return { read, write, hour, key: (now = Date.now()) => dayKey(now, hour()), until: (now = Date.now()) => msUntilNextDay(now, hour()) };
     }
     ```

  3. `tools/sync-day.mjs`: a copy of `tools/sync-gossip.mjs` with `shared: "day-shared.js"`,
     `file: "day.js"`, `tool: "sync-day.mjs"`, `label: "Day clock"`,
     `expect: ["bounty_bp", "npc_bp", "quests_bp", "saga_bp"]`, and the top comment rewritten for this module.
  4. `tools/lead-shared.js`, exactly these exports (no import, no module-level state):

     ```js
     // Readers of the story lead (realm:saga_lead, docs/specs/realm-rework/README.md C1): one cleaned lead per online
     // player, and the "who - 140m NE" line. Packs never import each other, so each reader keeps this file as
     // scripts/lead.js (node tools/sync-lead.mjs).
     const STATES = new Set(["start", "step", "report", "party", "wait"]);
     const KINDS = new Set(["main", "side", "heart", "wander", "festival"]);
     const DIMS = new Set(["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]);
     export const MAX_LEADS = 64;

     /** Plain ASCII, no color codes, trimmed, at most `max`. @param {unknown} v @param {number} max */
     export const clean = (v, max) => (typeof v === "string" ? v.replace(/§./g, "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "");
     /** @param {unknown} v @param {number} lo @param {number} hi @returns {number | undefined} */
     const whole = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : undefined);

     /** A realm:saga_lead message as a Lead, or undefined for "nothing to point at" and for anything malformed. @param {any} m */
     export function cleanLead(m) {
       if (!m || typeof m !== "object" || m.v !== 1 || !STATES.has(m.st)) return undefined;
       const hint = clean(m.hint, 120);
       const s = clean(m.s, 40);
       const title = clean(m.title, 40);
       if (!hint || !s || !title) return undefined;
       /** @type {any} */
       const lead = { st: m.st, k: KINDS.has(m.k) ? m.k : "main", s, title, hint, more: whole(m.more, 0, 9) ?? 0 };
       const ch = clean(m.ch, 48);
       if (ch) lead.ch = ch;
       const why = clean(m.why, 120);
       if (why) lead.why = why;
       if (typeof m.npc === "string" && /^[a-z0-9_:]{1,40}$/.test(m.npc)) lead.npc = m.npc;
       const who = clean(m.who, 32);
       if (who) lead.who = who;
       const place = clean(m.place, 32);
       if (place) lead.place = place;
       const x = whole(m.x, -30000000, 30000000);
       const z = whole(m.z, -30000000, 30000000);
       if (DIMS.has(m.dim) && x !== undefined && z !== undefined) Object.assign(lead, { dim: m.dim, x, z });
       const p = m.party;
       if (p && typeof p === "object") {
         const on = whole(p.on, 1, 12);
         const of = whole(p.of, 1, 12);
         if (on !== undefined && of !== undefined) {
           lead.party = { on, of, behind: (Array.isArray(p.behind) ? p.behind : []).map((/** @type {unknown} */ n) => clean(n, 32)).filter(Boolean).slice(0, 6) };
           const hold = clean(p.hold, 32);
           if (hold) lead.party.hold = hold;
         }
       }
       return lead;
     }

     /** "N", "NE", ... for a step of dx east and dz south. @param {number} dx @param {number} dz */
     export function compass(dx, dz) {
       const a = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
       return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a / 45) % 8];
     }
     /** @param {string} dim */
     export const dimName = (dim) => (dim === "minecraft:nether" ? "the Nether" : dim === "minecraft:the_end" ? "the End" : "the Overworld");

     /**
      * Where the lead points, as seen from `from`: "Brother Hollis - 140m NE", "Old Chapel - 300m E (412, -96)",
      * "Sol - in the Nether", "Mara - right here", just the name when no place is known, or undefined.
      * `postOf(npcId)` is where the reader knows that townsfolk to stand, if it knows.
      * @param {any} lead @param {{ dim: string, x: number, z: number }} from
      * @param {(npc: string) => { dim: string, x: number, z: number } | undefined} [postOf]
      * @returns {string | undefined}
      */
     export function whereText(lead, from, postOf) {
       const post = lead.npc && postOf ? postOf(lead.npc) : undefined;
       const spot = post ?? (lead.dim !== undefined ? { dim: lead.dim, x: lead.x, z: lead.z } : undefined);
       const name = post ? (lead.who ?? lead.place ?? "") : (lead.place ?? lead.who ?? "");
       if (!spot) return lead.who || undefined;
       if (!name) return undefined;
       if (spot.dim !== from.dim) return `${name} - in ${dimName(spot.dim)}`;
       const d = Math.round(Math.hypot(spot.x - from.x, spot.z - from.z));
       const dir = compass(spot.x - from.x, spot.z - from.z);
       if (post) return d < 4 ? `${name} - right here` : `${name} - ${d}m ${dir}`;
       return `${name} - ${d}m ${dir} (${Math.floor(spot.x)}, ${Math.floor(spot.z)})`;
     }

     /** Changes when the lead points somewhere else: for things said once per lead. @param {any} lead */
     export const leadKey = (lead) => `${lead.s}|${lead.st}|${lead.npc ?? ""}|${lead.ch ?? ""}`;

     /**
      * Keeps every online player's lead. `onScriptEvent` is the pack's own (script-events.js); `send(id, object)` sends a
      * script event; `world` and `system` are the game's.
      * @param {{ world: any, system: any, onScriptEvent: (ids: string | readonly string[], fn: (e: any) => void) => unknown, send: (id: string, msg: object) => void }} o
      */
     export function createLeads({ world, system, onScriptEvent, send }) {
       /** @type {Map<string, any>} */
       const leads = new Map();
       onScriptEvent("realm:saga_lead", (ev) => {
         if (ev.sourceEntity || ev.sourceBlock) return; // typed or triggered in the world: the lead only comes from a script
         let m;
         try {
           m = JSON.parse(ev.message);
         } catch {
           return;
         }
         if (!m || typeof m.player !== "string") return;
         const lead = cleanLead(m);
         leads.delete(m.player); // also moves a changed lead to the end (the newest)
         if (!lead) return;
         leads.set(m.player, lead);
         if (leads.size > MAX_LEADS) leads.delete(/** @type {string} */ (leads.keys().next().value));
       });
       world.afterEvents.playerLeave.subscribe((/** @type {{ playerId: string }} */ { playerId }) => leads.delete(playerId));
       world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => send("realm:saga_lead_ping", {}), 100));
       return { get: (/** @type {string} */ id) => leads.get(id), size: () => leads.size };
     }
     ```

  5. `tools/sync-lead.mjs`: like `tools/sync-day.mjs`, with `shared: "lead-shared.js"`, `file: "lead.js"`,
     `tool: "sync-lead.mjs"`, `label: "Story lead reader"`, `expect: ["npc_bp", "town_bp", "wander_bp"]`.
  6. Run `node tools/sync-day.mjs` and `node tools/sync-lead.mjs` (the `expect` list creates the seven copies).
  7. `tools/bundle.mjs:264`: add `"day.js"` and `"lead.js"` to `SHARED`. (`CLAUDE.md`'s sentence about the
     shared modules is T11's to update.)
  8. `package.json`, script `check`: after `node tools/sync-weather.mjs --check && ` insert
     `node tools/sync-day.mjs --check && node tools/sync-lead.mjs --check && `.
  9. Tests (`node:test`, importing the two `tools/*-shared.js` files directly):
     - `tools/day-shared.test.mjs`: `dayKey(Date.UTC(2026, 10, 15, 9, 59), 10)` is one less than
       `dayKey(Date.UTC(2026, 10, 15, 10, 0), 10)`; `dayKey(t, 0) === Math.floor(t / 86400000)`; a bad hour
       (`-1`, `24`, `1.5`, `"10"`) uses 10; `msUntilNextDay` at 09:59 with hour 10 is 60000; `untilText`
       for 60000 is `1m` and for 18720000 is `5h 12m`; `shouldRoll(undefined, 5)`, `shouldRoll(4, 5)` true,
       `shouldRoll(5, 5)` and `shouldRoll(6, 5)` false; `createDayClock` with a fake world: `hour()` is the
       fallback with no score, the score after `write(7)`, the fallback again after `write(undefined)`; a
       `getScore` that throws reads as undefined; `hour()` re-reads only after 200 ticks (count the reads);
       the four packs' config defaults are equal: read `resetHourUtc` from `packs/bounty_bp/scripts/config.js`
       and `packs/quests_bp/scripts/config.js`, `dayResetHourUtc` from `packs/saga_bp/scripts/config.js` and
       `packs/npc_bp/scripts/config.js` with a regex on the file text (`/dayResetHourUtc:\s*(\d+)/`), and
       expect each to be `DEFAULT_RESET_HOUR_UTC`. Name that last test `the four packs share one default
       hour` and write it as an ordinary test (no `skip`, no `todo`): it passes once T3, T6, T7 and T8 are
       in. Until then it fails, so T1's acceptance leaves it out with `--test-name-pattern` (below) and
       T11 runs the whole file.
     - `tools/lead-shared.test.mjs`: `cleanLead` returns undefined for `{ v: 1 }`, for `v: 2`, for an
       unknown `st`, for an empty hint; strips `§c` and non-ASCII; cuts `hint` at 120 and `who` at 32;
       drops a bad `npc` (`"Hollis!"`); keeps `x`, `z` only with a known `dim`; clamps `more` to 0-9; keeps
       `party` only with numeric `on` and `of`. `whereText`: the five rows of the table in U-2 plus the two
       "no target" rows. `compass(0, -1)` is `N`, `compass(1, 0)` is `E`, `compass(-1, 1)` is `SW`.
       `createLeads` with fake `world`, `system` and `onScriptEvent`: a lead is stored and returned; the
       empty form removes it; an event with `sourceEntity` set is ignored; `playerLeave` removes it; the
       65th player evicts the oldest; `worldLoad` schedules one `realm:saga_lead_ping` at 100 ticks.
- Edge cases:
  - The scoreboard is not readable before the world loads: `read()` returns undefined, `hour()` uses the
    fallback, and the cache expires after 200 ticks, so the real value is picked up within 10 s of load.
  - Another pack removes the objective: the next `write` creates it again; reads return undefined meanwhile.
  - Two packs write different hours in the same tick: the last write wins and every pack reads that one.
  - A lead for a player who is not online yet (sent in the first ticks of a join): stored anyway; the map
    is bounded at 64.
  - A module on `SHARED` must have no relative import: neither file has one.
- Acceptance:
  - `node tools/test-bds/run.mjs --quiet --flat --only help_bp --scenario tools/test-bds/examples/day-scoreboard.js` passes.
  - `node --test --test-name-pattern='^(?!the four packs)' tools/day-shared.test.mjs` and
    `node --test tools/lead-shared.test.mjs` pass (name the config-defaults test
    `the four packs share one default hour`).
  - `node tools/sync-day.mjs --check`, `node tools/sync-lead.mjs --check`, `node tools/check-pipeline.mjs`,
    `npx tsc -p .` and `npm run --silent lint` pass.

### T2 Townsfolk: the pure modules (lines, gifts, gossip age)

- Owns: `packs/npc_bp/scripts/lead-lines.js` (new), `packs/npc_bp/scripts/gifts.js` (new),
  `packs/npc_bp/scripts/gossip-keep.js` (new), `tools/npc-lead.test.mjs` (new), `tools/npc-gift.test.mjs`
  (new), `tools/npc-gossip-age.test.mjs` (new).
- Reads (does not edit): `packs/npc_bp/scripts/main.js` (`fill`, `gossipAlive`, `giftInHand`),
  `packs/npc_bp/scripts/hearth.js`, `packs/town_bp/scripts/life.js` (the style of a module with no
  `@minecraft` import and its test `tools/town-life.test.mjs`).
- Depends on: none.
- Change (none of the three files imports anything):
  1. `lead-lines.js`:
     - `export const LEAD_LINES`: an object keyed `any`, `elsie`, `mayor`, `reyes`, `bea`, each a record from
       lead state to an array of lines, with exactly the text of the table in U-2 (a `/` in the table
       separates two entries of an array; `(none)` means the key is absent).
     - `export function voiceFor(npcId)`: `"mayor"` for `"bram"` and for ids starting with `"mayor:"`; the id
       itself when `LEAD_LINES` has it; else `"any"`.
     - `export const trimHint = (hint) => hint.replace(/[.!?]$/, "")`.
     - `export function leadLine(lead, npcId, playerName, rnd = Math.random)`: the candidates are the voice's
       lines for `lead.st` that can be filled (`{who}` needs `lead.who`, `{hold}` needs `lead.party?.hold`);
       when there are none, the `any` lines for that state that can be filled (there is always one). Pick
       `candidates[Math.floor(rnd() * candidates.length)]` and replace every `{who}`, `{hold}`, `{title}`,
       `{hint}` (with `trimHint`) and `{player}`.
     - `export function ownLine(lead, name)`: `` `§6${name} has been waiting for you.` `` for `start`,
       `` `§6${name} wants to hear how it went.` `` for `report`, else undefined.
     - `export function leadBlock(lead, where)`: the lines of U-2 from `§7<title>...` to the `more` line, as
       a `string[]` (no speaker line, no blank lines); `where` is the text from `whereText` or undefined.
       `town_bp` builds the same block itself (it cannot import this file), so keep it small.
     - `export function letterFor(lead, playerName, at)`: undefined unless `lead.st` is `start` or `report`
       and `lead.who` is set; else `{ from: lead.who, subject: "Still waiting", body }` with the body of
       U-13; `at` is `{ x, z } | undefined` (the caller passes it only for the Overworld).
     - `export const awayDays = (seen, today) => (typeof seen === "number" && Number.isFinite(seen) && today > seen ? today - seen : 0)`.
  2. `gifts.js`:

     ```js
     /** @typedef {{ maxAmount: number, named: boolean, lore: boolean, enchanted: boolean, durable: boolean }} Held */
     /** May this item ever be a gift? "named": it has a name or lore; "tool": unstackable, enchanted or with durability. @param {Held} it @returns {{ ok: true } | { ok: false, why: "named" | "tool" }} */
     export function giftable(it) {
       if (it.named || it.lore) return { ok: false, why: "named" };
       if (it.maxAmount <= 1 || it.enchanted || it.durable) return { ok: false, why: "tool" };
       return { ok: true };
     }
     /** A sneak-tap gives at once only what the townsfolk loves or likes. @param {string} tier */
     export const quickGift = (tier) => tier === "loved" || tier === "liked";
     ```

  3. `gossip-keep.js`:

     ```js
     /** Gossip still told: everything newer than `hours`, plus the newest `keep` pieces at any age. Order is kept. @template {{ i: number, t: number }} G @param {G[]} list @param {number} now ms @param {number} hours @param {number} keep @returns {G[]} */
     export function keepGossip(list, now, hours, keep) {
       const cutoff = now - Math.max(1, hours) * 3600000;
       const newest = new Set([...list].sort((a, b) => b.i - a.i).slice(0, Math.max(0, keep)).map((g) => g.i));
       return list.filter((g) => g.t >= cutoff || newest.has(g.i));
     }
     /** The gray note after an old piece. @param {number} ageMs */
     export function ageNote(ageMs) {
       const days = ageMs / 86400000;
       if (days < 2) return "";
       return days < 7 ? " §7(a few days back)" : days < 30 ? " §7(a few weeks back)" : " §7(a while back)";
     }
     ```

  4. Tests:
     - `tools/npc-lead.test.mjs`: every voice and state of the U-2 table is reachable (`rnd` 0 and 0.99);
       a `start` lead without `who` at `elsie` falls back to the `any` line without `{who}`; a `party` lead
       without `hold` at `reyes` falls back to `any`; `mayor:riverside` and `bram` use the mayor voice; a
       hint ending in `.` makes no `..`; no returned line contains `{`; `ownLine` for the five states;
       `leadBlock` with and without `ch`, `where`, `party.hold`, `more` 0, 1 and 2; `letterFor` for `start`
       (with and without `at`), `report`, and undefined for `step` and for a lead without `who`; every line
       in `LEAD_LINES` is ASCII (`/^[\x20-\x7e]+$/`) and at most 120 characters; `awayDays(undefined, 5)` is
       0, `awayDays(2, 5)` is 3, `awayDays(7, 5)` is 0.
     - `tools/npc-gift.test.mjs`: `giftable` is false with why `tool` for max stack 1, for enchanted, for
       durable; false with why `named` for named and for lore (named wins over tool); true for a plain
       stackable; `quickGift` true for `loved`, `liked`, false for `neutral`, `disliked`.
     - `tools/npc-gossip-age.test.mjs`: with 12 pieces all 10 days old, `keepGossip(list, now, 48, 8)`
       returns the 8 with the highest `i`, in their original order; a fresh piece is kept besides them;
       `keep` 0 keeps only fresh ones; `ageNote` at 1 day is `""`, at 3 days `" §7(a few days back)"`, at 10
       days `" §7(a few weeks back)"`, at 40 days `" §7(a while back)"`.
- Edge cases: an unknown lead state never reaches these functions (`cleanLead` drops it), but `leadLine`
  returns `lead.hint` if no list exists for the state, so it can never return undefined.
- Acceptance: `node --test tools/npc-lead.test.mjs tools/npc-gift.test.mjs tools/npc-gossip-age.test.mjs`
  passes; `npx tsc -p .` and `node tools/check-ascii.mjs` pass.

### T3 Townsfolk: wiring in `npc_bp`

- Owns: `packs/npc_bp/scripts/main.js`, `packs/npc_bp/scripts/config.js`, `packs/npc_bp/scripts/settings.js`
  (above the marker only), `packs/npc_bp/scripts/hearth.js`, `tools/test-bds/examples/npc-gift-safe.js`
  (new), `tools/test-bds/examples/npc-lead.js` (new), `tools/test-bds/examples/npc-hearth.js` and
  `tools/wander-npc-fixes.test.mjs` (only if the changes here break an expectation in them).
- Reads (does not edit): `packs/npc_bp/scripts/lead.js`, `day.js`, `lead-lines.js`, `gifts.js`,
  `gossip-keep.js`, `tools/test-bds/examples/npc-hearth.js` (how a scenario taps and reads events),
  `packs/build_bp/scripts/settings.js` (an option with `read` and `write`).
- Depends on: T1, T2.
- Change:
  1. `config.js`: add, each with a doc comment in the file's style:
     `dayResetHourUtc: 10` ("Townsfolk days (the first talk and the one gift a day) start at this hour, UTC.
     One value for the realm, shared with Bounty Board, Daily Quests and Story Questlines: change it in any
     of them"), `nextStep: true` ("Townsfolk and mayors offer `What should I do next?` when Story
     Questlines has a next step for the player"), `awayDaysGreeting: 3`, `awayDaysLetter: 7`,
     `gossipKeep: 8` ("The newest pieces of gossip the town never forgets, whatever their age"). Change
     `gossipChance: 25` to `10` and reword the comment of `gossipHours` to "Gossip older than this many
     hours is forgotten, except the newest `gossipKeep` pieces".
  2. `settings.js`, above the marker: `import { createDayClock } from "./day.js";` and

     ```js
     /** The realm's one reset hour (scripts/day.js). */
     export const dayClock = createDayClock({ world, system, fallback: () => BASE.dayResetHourUtc });
     ```

     and two options: `{ key: "dayResetHourUtc", type: "int", scope: "world", label: "New day at (hour, UTC)",
     help: "Shared by bounties, daily quests, favors and townsfolk. 10 = 4 or 5 am US Central", min: 0, max: 23,
     step: 1, read: () => dayClock.read(), write: (v) => dayClock.write(v) }` and
     `{ key: "nextStep", type: "bool", scope: "world", label: "Townsfolk say what to do next", help: "A first
     button at every townsfolk and mayor while the story has a next step" }`.
  3. `main.js`, imports: `dayClock` from `./settings.js`; `createLeads, whereText` from `./lead.js`;
     `leadBlock, leadLine, letterFor, ownLine, awayDays` from `./lead-lines.js`; `giftable, quickGift` from
     `./gifts.js`; `ageNote, keepGossip` from `./gossip-keep.js`. Then, next to `rounds`:
     `const leads = createLeads({ world, system, onScriptEvent, send: (id, msg) => system.sendScriptEvent(id, JSON.stringify(msg)) });`
  4. **The day key.** Replace `utcDay` (`main.js:1172`) with `const realDay = () => dayClock.key();` and its
     three callers: `talkedTo`: `if (a[1] >= day) return;`; `giveGift`: `if (a[2] >= day) return chatFrom(...)`;
     `keepsake`: unchanged arithmetic. Update the two comments that say "real (UTC) day".
  5. **Last seen.** Add `const PROP_SEEN = "npc:seen"`, `const PROP_LETTER = "npc:letter"`,
     `/** @type {Map<string, number>} */ const seenCache = new Map()`,
     `/** @type {Map<string, { lead: boolean, gossip: boolean }>} */ const returning = new Map()`, and:

     ```js
     /** A stored day number, or undefined. @param {Player} player @param {string} prop */
     function dayProp(player, prop) {
       try {
         const v = player.getDynamicProperty(prop);
         return typeof v === "number" && Number.isFinite(v) ? v : undefined;
       } catch {
         return undefined;
       }
     }
     /** On join: how long they were away, then today is the day they were last seen. @param {Player} player */
     function noteJoin(player) {
       const today = realDay();
       const days = awayDays(dayProp(player, PROP_SEEN), today);
       touchSeen(player, today);
       if (days >= Math.max(1, CONFIG.awayDaysGreeting)) returning.set(player.id, { lead: true, gossip: true });
       if (days >= Math.max(1, CONFIG.awayDaysLetter)) system.runTimeout(() => maybeLetter(player), 140);
     }
     /** @param {Player} player @param {number} [today] */
     function touchSeen(player, today = realDay()) {
       if (seenCache.get(player.id) === today) return;
       seenCache.set(player.id, today);
       try {
         player.setDynamicProperty(PROP_SEEN, today);
       } catch (e) {
         console.warn(`[npc] seen: ${e}`);
       }
     }
     ```

     Call `noteJoin(player)` in the existing `playerSpawn` timeout (`main.js:988-999`) before
     `sendAffinity(player)`; call `touchSeen(player)` at the top of `tapped` after the cooldown check; delete
     both maps' entries in the `playerLeave` handler (`main.js:1013-1019`).
  6. **The letter.** `maybeLetter(player)`: return unless `player.isValid`, `get("letters") === true`, the
     player has a lead, and `realDay() - (dayProp(player, PROP_LETTER) ?? -Infinity) >= CONFIG.awayDaysLetter`.
     `const post = postOf(lead.npc)` (step 8); `at` is `{ x, z }` from the post or from the lead's
     coordinates when that dimension is the Overworld. `const letter = letterFor(lead, player.name, at)`; if
     undefined return. Send `realm:mail_send` `{ to: player.id, from: letter.from, subject: letter.subject,
     body: letter.body.slice(0, 600) }`, then `player.setDynamicProperty(PROP_LETTER, realDay())`.
  7. **Gifts (NPC-01).** `giftInHand` returns `{ inv, slot, item, keep, why }`: build the `Held` facts inside
     its `try` (`maxAmount: item.maxAmount`, `named: !!item.nameTag`, `lore: item.getLore().length > 0`,
     `enchanted: (item.getComponent("minecraft:enchantable")?.getEnchantments().length ?? 0) > 0`,
     `durable: !!item.getComponent("minecraft:durability")`), `const g = giftable(held)`,
     `keep: !g.ok`, `why: g.ok ? undefined : g.why`. In `tapped`, replace the sneak block
     (`main.js:1082-1085`) with:

     ```js
     if (gift && cast && get("affinity") === true) {
       const held = giftInHand(player);
       if (held) {
         if (held.why === "named") return chatFrom(player, t, "That one has a name. Keep it, it's yours.");
         if (held.keep) return chatFrom(player, t, `Keep your ${itemName(held.item.typeId)}, {player}. You need it more than I do.`);
         if (affFor(player, id)[2] >= realDay()) return chatFrom(player, t, "You already gave me something today. Come back tomorrow.");
         if (quickGift(tierOf(id, held.item.typeId))) return giveGift(player, t, entity);
         const name = itemName(held.item.typeId);
         const res = await show(player, new ActionFormData().title(plainName(t)).body(`Give ${t.name} your ${name}?\n\n§7It takes 1 of ${held.item.amount}. One gift a day.`).button(`Give 1 ${name}`).button("Keep it"), entity.location);
         if (res && !res.canceled && res.selection === 0 && player.isValid) giveGift(player, t, entity, held.item.typeId);
         return;
       }
     }
     ```

     `giveGift(player, t, entity, expect)`: after reading `held`, when `expect !== undefined &&
     held?.item.typeId !== expect`, or `held?.keep` for a reason other than a name, send
     `§7You are not holding that any more.` and return; keep the existing named-item line. The menu's `Give`
     offer keeps its condition `held && !held.keep` and gets `order: 85`.
  8. **The next step.** Add `const postOf = (npcId) => { const r = placedOf(npcId); return r ? { dim: r.dim, x: r.x, z: r.z } : undefined; }`
     and `const fromOf = (player) => ({ dim: player.dimension.id, x: player.location.x, z: player.location.z })`.
     In `tapped`, after the offers were collected:

     ```js
     const lead = get("nextStep") === true ? leads.get(player.id) : undefined;
     const next = !!lead && lead.npc !== id;
     if (next) offers.push({ pack: "npc_bp", key: "next", label: "What should I do next?", order: 5 });
     // ... Give (85) and Ask about... (90) as today ...
     const whoInMenu = !next || offers.length < 5;
     if (whoInMenu) offers.push({ pack: "npc_bp", key: "who", label: "Who lives here?", order: 95 });
     ```

     Body: after the greeting line push `ownLine(lead, t.name)` when `lead && lead.npc === id` and it is
     defined. The pick: `offer.key === "next"` runs `await nextStep(player, t, lead, !whoInMenu, entity)`:

     ```js
     /** @param {Player} player @param {Townsfolk} t @param {any} lead @param {boolean} withWho @param {Entity} entity */
     async function nextStep(player, t, lead, withWho, entity) {
       const lines = [`§e${t.name}:§r "${leadLine(lead, t.id, player.name)}"`, "", ...leadBlock(lead, whereText(lead, fromOf(player), postOf))];
       const form = new ActionFormData().title(plainName(t)).body(lines.join("\n"));
       if (withWho) form.button("Who lives here?");
       form.button("Thanks");
       const res = await show(player, form, entity.isValid ? entity.location : undefined);
       if (withWho && res && !res.canceled && res.selection === 0 && player.isValid) await whoLivesHere(player, t);
     }
     ```

     In `whereabouts`, append ` §6(waiting for you)` to the text of the record whose id is
     `leads.get(player.id)?.npc`.
  9. **The greeting.** `greetingFor` returns `{ text, gossip }` (`gossip`: the id of a piece told, else
     undefined). After the cold-greeting block and before `gossipLine`:

     ```js
     const back = returning.get(player.id);
     const lead = leads.get(player.id);
     if (back?.lead && get("nextStep") === true && lead && lead.npc !== t.id) {
       back.lead = false;
       return { text: leadLine(lead, t.id, player.name) };
     }
     const news = gossipLine(player, t, !!back?.gossip);
     if (back) { back.lead = false; if (news || !gossipAlive().length) back.gossip = false; }
     if (news) return news;
     ```

     (`back.lead = false` there means: a first tap with no lead uses up the lead turn.) Every other return
     wraps its string as `{ text }`. `tapped` uses `greeting.text` in the body and, after the menu's
     `show()` returned a response (`res !== undefined`), calls `markHeard(player, greeting.gossip)` when it
     is a number.
  10. **Gossip (NPC-06, NPC-17, NPC-19).**
      - `gossipAlive = () => keepGossip(gossip, Date.now(), Number(CONFIG.gossipHours) || 48, Number(CONFIG.gossipKeep) || 8)`.
      - `gossipLine(player, t, sure = false)`: skip the chance roll when `sure`; return
        `{ text: fillGossip(...) + ageNote(Date.now() - g.t), gossip: g.i }` and do not touch `npc:heard`.
        Move the saving into `markHeard(player, id)`: `heard.filter(i => alive has it)`, push `id`, cache,
        `setDynamicProperty(PROP_HEARD, ...)` in a `try`.
      - At the end of `hearGossip`, after `saveGossip()`: build the nameless line with the first generic
        pair, `const pair = (GOSSIP[g.k] ?? (g.p ? GOSSIP.other : GOSSIP.news))[0]`, and send
        `realm:sky_event` `{ kind: ("gossip_" + g.k).slice(0, 32), text: fillGossip(pair[0], g, "").slice(0, 160) }`
        in a `try`. A playerless piece whose first pair contains `{name}` uses `GOSSIP.news[0][0]` instead.
      - The `realm:npc_debug` `gossip` action keeps working (it reads `gossipAlive()`).
  11. **Flag lines.** `flagHolds`: add, first, `if (want.startsWith("^")) return (actual ?? "").startsWith(want.slice(1));`.
      `reactionLine`: after picking, replace `{nights}` with `flagsOf(player)["g:nights"] ?? ""`. In
      `hearth.js`, append to `REACTIONS` (and document `^x` in its comment):

      ```js
      { when: { "fin:drowned_bell": "1", "drowned_bell.bell": "ring" }, lines: { tobin: "Hear that? Tide's moving the clapper. Never thought I'd like the sound." } },
      { when: { "g:part": "^4", "act1_signs.act1:path": "alone" }, lines: { reyes: "You went after them alone once. Next time you tell me. That's an order. Mostly." } },
      { when: { "g:part": "4B", "g:quill": "exposed" }, lines: { reyes: "Quill's singing in my cells again. The cove, then. I want those books." } },
      { when: { "g:part": "4B", "g:quill": "trusted" }, lines: { quill: "Barrel at the back of the cove, partner. Leather chest, walk slow." } },
      { when: { "g:part": "4C" }, lines: { moss: "Still owe that witch her price? She doesn't forget. Neither do the frogs." } },
      { when: { "g:part": "^5", "g:hollis": "saved" }, lines: { hollis: "I slept. All night. Ida was looking for you, something about a crystal that hums." } },
      { when: { "g:part": "5A" }, lines: { ida: "Shards. Four. Or go and ask the diggers at the old mine nicely. Quietly." } },
      { when: { "g:part": "7A" }, lines: { wren: "The horses are scared of the star. I told them you would fix it. You will, right?" } },
      { when: { "g:nights": ">=1" }, lines: { sol: "{nights} nights. I count them twice.", bea: "Sol says {nights} nights. I say eat something.", wren: "Is it true the star comes in {nights} sleeps?" } },
      ```

      The first entry duplicates the condition of an existing one (`hearth.js:621`) on purpose: both lines
      may be picked. Three drafted lines are left out because their flags are not sent to Townsfolk
      (`inn_ghost` finished, `act4_seals.first`, `act2_choir.mayor`); they are listed in "Open questions".
  12. **The busy retry (NPC-11).** `show(player, form, at)`: with `at` (a location) the loop runs 3 times
      instead of 20 and, before each retry, returns undefined when the player is in another dimension than
      before or more than 6 blocks from `at`. `tapped` passes `entity.location` for the menu; `askAbout` and
      `whoLivesHere` keep the long retry (they follow a tap the player just answered).
  13. `realm:npc_debug`: new action `seen`: `{ player, action: "seen", days, keepLetter? }` sets that
      player's `npc:seen` to `realDay() - days`, clears their `seenCache` and `returning` entries, sets
      `npc:letter` to undefined unless `keepLetter === true`, and calls `noteJoin(player)`. Document it in
      the comment above the handler.
  14. Scenarios (headers exactly):
      - `tools/test-bds/examples/npc-gift-safe.js`

        ```js
        // Townsfolk, gift safety (NPC-01): a sneak-tap never takes a tool, asks before taking something the townsfolk
        // neither loves nor likes, and still takes a loved item at once.
        //   node tools/test-bds/run.mjs --quiet --only npc_bp --scenario tools/test-bds/examples/npc-gift-safe.js --timeout 300
        ```

        Steps: an operator player; `/realm:npc_add tobin`; hold an unnamed `minecraft:iron_pickaxe`,
        sneak-tap through `realm:npc_debug`: a chat line matching `/Keep your Iron Pickaxe/`, the pickaxe
        still in slot 0, no form shown (`t.forms(p).length` unchanged). Hold 3 `minecraft:cobblestone`,
        sneak-tap: a form whose body matches `/Give Old Tobin your Cobblestone/` with buttons
        `Give 1 Cobblestone` and `Keep it`; answer `Keep it`: still 3. Sneak-tap again, answer
        `Give 1 Cobblestone`: 2 left and a chat line matching `/Cobblestone: \+5/`. Wait 12 ticks, hold 2
        `minecraft:salmon`, sneak-tap: chat `/already gave me something today/`, still 2 (the day's gift
        is used). A second player, same Tobin, holding salmon, sneak-tap: `/Salmon: \+40/`, 1 taken, no
        form.
      - `tools/test-bds/examples/npc-lead.js`

        ```js
        // Townsfolk, "What should I do next?": with a story lead (a fake realm:saga_lead) any townsfolk has the button
        // first and its form names the giver with a distance; the lead's own townsfolk has no button but a line; no
        // lead, no button; the first tap after 3 days away greets with the lead; 7 days away sends one letter.
        //   node tools/test-bds/run.mjs --quiet --only npc_bp,mail_bp --scenario tools/test-bds/examples/npc-lead.js --timeout 400
        ```

        Steps: place `tobin` and, 40 blocks east, `hollis`. Tap `tobin` with no lead: no button labeled
        `What should I do next?`. Send
        `realm:saga_lead { player, v: 1, st: "start", k: "main", s: "act1_signs", title: "Signs in the Sky",
        ch: "The Keeper", hint: "Talk to Brother Hollis at the chapel.", npc: "hollis", who: "Brother Hollis", more: 2 }`.
        Tap `tobin`: `form.buttons[0]` is `What should I do next?`; answer it: the next form's body matches
        `/Signs in the Sky: The Keeper/`, `/Talk to Brother Hollis at the chapel\./`,
        `/Brother Hollis - \d+m (E|NE|SE)/` and `/2 other stories are open too/`, and its buttons are
        `Thanks` only or `Who lives here?` then `Thanks`. Tap `hollis`: no such button, body matches
        `/Brother Hollis has been waiting for you\./`. Send the empty form `{ player, v: 1 }`: tap `tobin`,
        no button. Send the lead again, then `realm:npc_debug { player, action: "seen", days: 4 }`, wait
        150 ticks, tap `tobin`: the body's first line contains `Brother Hollis` (the lead as the greeting);
        no `realm:mail_send` was seen. Then `{ action: "seen", days: 8 }`, wait 160 ticks: exactly one
        `realm:mail_send` with `from: "Brother Hollis"`, `subject: "Still waiting"`, a body containing
        `Talk to Brother Hollis at the chapel` and `- Brother Hollis`. Send
        `{ action: "seen", days: 8, keepLetter: true }` (the hook then leaves `npc:letter` alone), wait 160
        ticks: no second letter.
- Edge cases:
  - `lead.npc` names a townsfolk that is not placed: the button still shows; the where-line is `lead.who`.
  - The lead changes while the next-step form is open: the open form keeps what it showed.
  - A town mayor (`mayor:<id>`) has no affinity: the button, the form and `Who lives here?` work; gifts do not.
  - `affinity` off: no gifts, no gossip, no affinity lines; `What should I do next?` still works.
  - `mail_bp` not installed: the letter event goes nowhere; `npc:letter` is still written, so nothing piles up.
  - A player away 30 days whose lead is `step` or `wait`: no letter (`letterFor` returns undefined);
    `npc:letter` is not written.
  - The player leaves between the join and the letter step: nothing is sent, and the next join has
    `days` 0, so that absence gets no letter. Accepted.
  - A form that never showed (`show` returned undefined): the gossip stays unheard.
  - Old `npc:aff` days are UTC day numbers: `>=` keeps them valid (D-2).
- Acceptance: `npx tsc -p .`, `node tools/check-ascii.mjs`, `node tools/check-events.mjs`,
  `node tools/check-event-guards.mjs`, `node tools/check-actionbar.mjs` pass;
  `node --test tools/wander-npc-fixes.test.mjs tools/npc-lead.test.mjs tools/npc-gift.test.mjs tools/npc-gossip-age.test.mjs`
  passes (the first reads `npc_bp/main.js` as text: if one of its patterns no longer matches because a
  line moved, keep the behavior it pins and update the pattern); the two new scenarios and `tools/test-bds/examples/npc-hearth.js`, `npc-news.js`, `w10-npc-nameless.js` pass
  with the command in each header (set `gossipChance` 100 where those scenarios already do; if
  `npc-hearth.js` relied on a neutral sneak gift, answer the new confirm form there).

### T4 Town Projects: the board, the bell, residents

- Owns: `packs/town_bp/scripts/main.js`, `packs/town_bp/scripts/board.js` (new), `packs/town_bp/scripts/life.js`,
  `packs/town_bp/scripts/residents.js`, `packs/town_bp/scripts/config.js`, `packs/town_bp/scripts/settings.js`
  (above the marker only), `tools/town-board.test.mjs` (new), `tools/town-residents.test.mjs`,
  `tools/town-life.test.mjs`, `tools/test-bds/examples/town-board.js` (new),
  `tools/test-bds/examples/town-resident-turned.js` (new), and the existing scenarios
  `tools/test-bds/examples/town-auto-spots.js`, `town-bram-migrate.js`, `town-breed-soak.js`,
  `town-capital-perf.js`, `town-claims-spots.js`, `town-houses.js`, `town-life.js`, `town-news.js` (only the
  one-line opt-out of step 12).
- Reads (does not edit): `packs/town_bp/scripts/lead.js`, `packs/town_bp/scripts/designs.js`,
  `packs/town_bp/scripts/growth.js`, `packs/town_bp/scripts/mayors.js` (`createPlacesAssembler`),
  `packs/wander_bp/scripts/main.js:1318-1336` (the `Transformed` handler to copy the shape of),
  `packs/bounty_bp/scripts/main.js:225-239` (a block-tap handler in the bundle).
- Depends on: T1.
- Change:
  1. `board.js` (imports only `toWorld` from `./designs.js`; no `@minecraft` import):

     ```js
     /** A block's key in the sign and bell maps. @param {string} dim @param {{ x: number, y: number, z: number }} v */
     export const cellKey = (dim, v) => `${dim}|${Math.floor(v.x)}|${Math.floor(v.y)}|${Math.floor(v.z)}`;
     /** The three signs of a notice board at `spot` (designs.js: local x -1, 0, 1 at y 1, z 0). */
     export const boardSigns = (spot) => [-1, 0, 1].map((x) => toWorld(spot, x, 1, 0));
     /** The bell of a bell tower at `spot` (designs.js: local 0, 4, 2). */
     export const bellAt = (spot) => toWorld(spot, 0, 4, 2);
     ```

     plus `export function leadLines(lead, where)`: the same block as `leadBlock` in
     `packs/npc_bp/scripts/lead-lines.js` without the `more` line (lines `§7<title>: <ch>` or `§7<title>`,
     `§f<hint>`, `§7<where>` when given, the party line of U-2);
     `export function boardBody({ town, levelName, lvl, lead, where })`: the body of U-5 as one string
     (`` `${town}, a ${levelName} (level ${lvl}).` ``, a blank line, then `§6Next for you` and `leadLines`,
     or `Nothing is waiting for you right now.`);
     `export function residentLine({ lead, player, town, log, time, rnd })`: U-7, where `log` is the newest
     log text or undefined, `time` is `world.getTimeOfDay()`, and `rnd` is called once for the 50% coin
     (`rnd() < 0.5` uses the log) and once to pick among the candidate lines.
  2. `life.js`, `boardTexts`: `See /realm:town` becomes `Tap for more`; the fallback
     `"Bring materials\nto the mayor!"` becomes `"Tap a sign\nfor what's next"`. Update the expectations in
     `tools/town-life.test.mjs`.
  3. `residents.js`: `export function turnedResident(name, rs)`: `name` with `§.` pairs removed and trimmed;
     returns the resident of `rs.r` with `d === undefined` and `n === name`, else undefined.
  4. `config.js`: `freeNoticeBoard: true` with the comment "Every town gets its Notice Board at once, at no
     cost (the board is where players tap to see what there is to do). Disabled: it is a level 1 project
     that needs its materials, as before". `settings.js`: `{ key: "freeNoticeBoard", type: "bool", scope:
     "world", label: "Notice Boards are free", help: "Each town gets its board at once; tapping it shows
     what to do next" }`.
  5. `main.js`, state near the top of the Menus section:

     ```js
     const leads = createLeads({ world, system, onScriptEvent, send });
     let adminSeen = false; // admin_bp answered our help ping: the board opens the Realm Menu's Today screen
     /** Sign and bell blocks of built boards and towers -> town id; rebuilt lazily after any town change. */
     const boardCells = new Map();
     const bellCells = new Map();
     let cellsDirty = true;
     ```

     Set `cellsDirty = true` inside `saveTown`, `saveProgress` and `deleteTown`. `rebuildCells()` clears both
     maps and, for every town and every project of `PROJECTS` with `progressOf(t, p).built` and a spot
     `t.spots[p.id]`: `notice_board` adds its three `boardSigns` keys, `bell_tower` adds its `bellAt` key
     (`cellKey(t.dim, v)`), each mapped to `t.id`; then `cellsDirty = false`.
     `onScriptEvent("realm:help_pong", ({ message }) => { if (message.trim() === "admin_bp") adminSeen = true; });`
     and, inside the existing `worldLoad` timeout (`main.js:1924`), add
     `system.sendScriptEvent("realm:help_ping", "");` (every installed pack answers with its folder name).
  6. The tap handler (new, next to the residents' handler):

     ```js
     const lastBell = new Map(); // player id -> tick of the last rally ask from a bell
     world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
       if (ev.cancel) return;
       const { player, block, isFirstEvent } = ev;
       let type;
       try {
         type = block.typeId;
       } catch {
         return;
       }
       if (type !== "minecraft:wall_sign" && type !== "minecraft:bell") return;
       if (cellsDirty) rebuildCells();
       const key = cellKey(block.dimension.id, block.location);
       if (type === "minecraft:bell") {
         const townId = bellCells.get(key);
         if (townId && isFirstEvent) system.run(() => ringBell(player, townId)); // not canceled: the bell rings
         return;
       }
       const townId = boardCells.get(key);
       if (!townId || player.isSneaking) return;
       ev.cancel = true;
       if (isFirstEvent) system.run(() => openBoard(player, townId).catch((e) => console.warn(`[town] board: ${e}`)));
     });
     ```

  7. `openBoard(player, townId)` (async): return unless the player is valid and the town exists. With
     `adminSeen`: `send("realm:menu_open", { player: player.id, screen: "today" })` and return. Otherwise
     build the fallback form of U-5: `where` from `whereText(lead, { dim, x, z } of the player, postOf)`,
     with `postOf = (npc) => places?.get(npc)` mapped to `{ dim, x, z }` (`places` is the assembled
     `realm:npc_places` list this file already keeps for mayors; read how `mayorPlaced` uses it and use the
     same structure); body from `boardBody`; the three buttons; show it with the short retry of step 10,
     anchored at the middle sign. `Town projects` runs `townMenu(player, townId, false)`. `Call my party
     here` sends `realm:rally_ask` `{ player: player.id, place: clean("the " + t.n + " notice board", 32),
     dim: t.dim, x, y, z }` with the middle sign's position.
  8. `ringBell(player, townId)`: return unless the player is valid, carries a tag starting with
     `realm_party:` and `system.currentTick - (lastBell.get(player.id) ?? -100) >= 100`; set `lastBell`;
     send `realm:rally_ask` `{ player: player.id, place: clean("the " + t.n + " bell tower", 32), dim: t.dim,
     x: s.x, y: s.y, z: s.z }` where `s` is the tower's spot. Delete the player's `lastBell` entry on
     `playerLeave` (add a handler if the file has none for this map).
  9. Residents:
     - In the existing tap handler (`main.js:3887-3894`) replace the `system.run` body: the gap is 60 ticks
       (`tapSaid.get(player.id) ?? -60`), and the message is
       `` `§e${name || "A villager"}:§r "${residentLine({ lead: leads.get(player.id), player: player.name, town: t.n, log: t.log?.at(-1)?.[1], time: world.getTimeOfDay(), rnd: Math.random })}"` ``.
     - Transformed residents (NPC-03), new handler:

       ```js
       world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
         try {
           if (cause !== "Transformed" || !/witch|zombie_villager/.test(entity.typeId) || !entity.nameTag) return;
           const name = entity.nameTag;
           const at = entity.location;
           const dim = entity.dimension.id;
           system.run(() => {
             for (const t of allTowns().values()) {
               if (t.dim !== dim || Math.hypot(t.x - at.x, t.z - at.z) > get("townRadius") + 32) continue;
               const rs = residentsOf(t);
               const rec = turnedResident(name, rs);
               if (!rec) continue;
               if (entity.isValid) entity.remove();
               rec.d = world.getAbsoluteTime() + replaceTicks();
               delete rec.e;
               delete rec.m;
               saveResidents(t, rs);
               return;
             }
           });
         } catch (e) {
           console.warn(`[town] turned: ${e}`);
         }
       });
       ```

       Use `EntityInitializationCause.Transformed` if the file already imports the enum; the string is what
       `wander_bp` compares with.
  10. `show(player, form, at)` (NPC-11): with `at` given, 3 tries instead of 20, and before each retry
      return undefined when the player is more than 6 blocks from `at` or in another dimension. Only the
      board form passes `at`.
  11. The free board (L6):

      ```js
      /** Gives a town its Notice Board without materials (freeNoticeBoard). @param {Town} t */
      function giveBoard(t) {
        if (get("freeNoticeBoard") !== true) return;
        const p = PROJECTS.find((x) => x.build === "notice_board");
        if (!p) return;
        const pr = progressOf(t, p);
        if (pr.done) return;
        pr.got = { ...p.needs };
        pr.done = 1;
        saveProgress(t, p, pr);
        if (ranking(pr).length) return finishProject(t, p, pr); // someone had delivered: thanked and paid as usual
        storyAdd(t, "The Notice Board went up");
        saveTown(t);
        build(t, p, true);
        levelUp(t);
        refreshBoard(t);
      }
      ```

      Call it in `addTown` right after `saveTown(t)` (before `zonesChanged()`), and for every town in the
      existing `worldLoad` timeout (`for (const t of [...allTowns().values()]) giveBoard(t);` inside its
      `try`). In `addTown`'s message, list only first projects that are not done:
      `projectsAt(t.lvl).filter((p) => !progressOf(t, p).done)`.
  12. Existing scenarios: run `node tools/test-bds/suite.mjs --filter '^town-' --retry`. For a scenario
      that fails only because the board is now free, add as its first action after the first player
      spawns: `t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "fb", pack: "town_bp", key: "freeNoticeBoard", value: false }));`
      followed by `await t.wait(2);`. Change nothing else in those files.
  13. `realm:town_test`, three more actions (document them in the comment above the handler):
      `board`: `openBoard(player, t.id)`; `bell`: `ringBell(player, t.id)`; `resident_tap`: says the
      resident line to the player for the first living resident of the town (same code path as the tap,
      including the 60-tick gap), or `tell("no resident")`.
  14. Tests:
      - `tools/town-board.test.mjs`: `boardSigns` for a spot facing each of the four ways equals
        `toWorld(spot, x, 1, 0)` for -1, 0, 1 and the three keys differ; `bellAt` is 4 up and 2 forward;
        `cellKey` floors; `boardBody` with and without a lead (exact strings of U-5); `leadLines` with and
        without `ch`, `where`, `party.hold`; `residentLine`: a `start` lead at a townsfolk gives one of the
        three lead lines filled with `who` and the player's name; a lead whose `npc` starts with `w_`, a
        `step` lead and no lead fall through; with a log and `rnd` below 0.5 the line is
        `Did you hear? <log>.` without a double period; each of the four time bands returns one of its two
        lines with `<Town>` filled; every returned line is ASCII.
      - `tools/town-residents.test.mjs`, new test: `turnedResident("Agnes", rs)` finds the living Agnes,
        ignores one with `d` set, ignores other names, and strips color codes from the name.
      - `tools/test-bds/examples/town-board.js`

        ```js
        // Town Projects, the Notice Board: a new town has its board free; tapping a sign asks the Realm Menu for its
        // Today screen (realm:menu_open) when admin_bp is installed, and shows the pack's own form with the story lead
        // when it is not; a party member can call the party from that form.
        //   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp,party_bp --scenario tools/test-bds/examples/town-board.js --timeout 600
        ```

        Steps (the harness provides the `realm_test_hooks` objective that `realm:town_test` needs): an
        operator adds a town through `realm:town_test { action: "add", player: "<name>", name: "Riverside" }`; wait until
        `dump` shows `notice_board` done; set its spot with `{ action: "spot", project: "notice_board" }`
        and wait until built. `{ action: "board" }` with no lead: a form titled `Riverside Notice Board`
        whose body contains `Nothing is waiting for you right now.` and whose buttons are `Town projects...`
        and `Close` (no party). Close it. Send a fake `realm:saga_lead` (as in `npc-lead.js`), `board` again:
        the body contains `Next for you` and the hint. Make a party of two (`/realm:party_invite <name>`,
        then `/realm:party_accept` as the other player, as `party-basics.js` does), `board` again: a button
        containing `Call my party here`; answer it: one `realm:rally_ask` with
        `place: "the Riverside notice board"` is sent (assert the ask only: `realm:rally` is T9's).
        The scenario branches on `t.packs.includes("admin_bp")`: when the Realm Menu is installed, the only
        assertion after the board is built is that `board` produces one `realm:menu_open` with
        `screen: "today"` for that player and no form from `town_bp`. The header command runs without
        `admin_bp`; T4 also runs it once by hand with
        `--only town_bp,npc_bp,party_bp,admin_bp,settings_bp,help_bp` and both must pass. Mention that
        second run in the header as plain words (`// Run it with admin_bp, settings_bp and help_bp added
        to --only to check the Realm Menu path.`), not as a second command line.
      - `tools/test-bds/examples/town-resident-turned.js`

        ```js
        // Town Projects, residents: a tap gets a spoken line (not "doesn't trade"), again after 3 s; a resident struck
        // by lightning leaves no witch with its name, and its family is marked for replacement (NPC-03, NPC-12).
        //   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-resident-turned.js --timeout 600
        ```

        Steps: a town with residents as `town-residents.js` sets one up (`census`); `resident_tap`: a chat
        line matching `/^.+: "/` and not `/doesn't trade/`; a second `resident_tap` within 20 ticks says
        nothing; after 70 ticks it speaks again. Find a resident entity by tag `realm:resident`, read its
        name, `t.dimension.spawnEntity("minecraft:lightning_bolt", its location)`; within 100 ticks no
        entity of type `minecraft:witch` with that `nameTag` exists in the town, and `dump` shows that
        resident with `d` set. If lightning does not transform a villager on this BDS within 100 ticks,
        the scenario logs it and passes the tap checks only (`t.log("no transformation on this server")`).
- Edge cases:
  - A board whose signs a player broke: the keys no longer hold a wall sign, so nothing happens there.
  - A board or tower removed or moved (`removeSpot`, `rebuildSpot`, `deleteTown`): `cellsDirty` is set by
    the saves those already do; the next tap rebuilds the maps.
  - A sign of another build that is not a board, a player's own wall sign: not in the map, never canceled.
  - Land Claims canceled the tap first: `ev.cancel` is set, the handler returns.
  - A town with no lead reader answer and no `npc_bp`: the form shows the town line and
    `Nothing is waiting for you right now.`
  - A resident named like two towns' residents: the first town within range wins; only one record changes.
  - A player name-tags a witch with a resident's name: nothing happens (the cause is not `Transformed`).
  - `freeNoticeBoard` turned off later: boards already given stay.
  - A town whose board had partial deliveries: `finishProject` runs, so contributors are thanked and paid.
- Acceptance: `node --test tools/town-board.test.mjs tools/town-residents.test.mjs tools/town-life.test.mjs
  tools/town-designs.test.mjs` passes; `npx tsc -p .`, `node tools/check-ascii.mjs`,
  `node tools/check-events.mjs`, `node tools/check-event-guards.mjs`, `node tools/check-ids.mjs` pass; the
  two new scenarios pass; `node tools/test-bds/suite.mjs --filter '^town-' --retry` has no `fail`.

### T5 Wanderers: party, relog, carried word

- Owns: `packs/wander_bp/scripts/main.js`, `packs/wander_bp/scripts/lines.js`,
  `packs/wander_bp/scripts/road.js` (new), `tools/wander-party.test.mjs` (new),
  `tools/test-bds/examples/wander-party.js` (new), `tools/test-bds/examples/wander-relog.js` (new).
- Reads (does not edit): `packs/wander_bp/scripts/lead.js`, `packs/saga_bp/scripts/wander.js:60-140`
  (what the story does when a wanderer leaves), `packs/bounty_bp/scripts/main.js:271-273` (`BUILT`),
  `tools/test-bds/examples/wander.js` (how a scenario spawns and taps).
- Depends on: T1.
- Change:
  1. `road.js` (no import):

     ```js
     export const MATE_RANGE = 64;
     /** Party mates near the owner when a wanderer appears. Players are { id, tag?, dim, x, z }; `tag` is the realm_party tag. */
     export function matesOf(owner, players) {
       if (!owner.tag) return [];
       return players
         .filter((p) => p.id !== owner.id && p.tag === owner.tag && p.dim === owner.dim && Math.hypot(p.x - owner.x, p.z - owner.z) <= MATE_RANGE)
         .map((p) => p.id)
         .slice(0, 11);
     }
     /** An accepted wanderer waits for its offline player until the job itself would end. @param {{ a?: number }} rec */
     export const keepOffline = (rec, ownerOnline, now, acceptedLifeMs) => !ownerOnline && typeof rec.a === "number" && now - rec.a <= acceptedLifeMs;
     /** "4C" -> { n: 4, l: "C" }. @param {unknown} flag */
     export function partOf(flag) {
       const m = typeof flag === "string" ? /^([1-7])([A-E])$/.exec(flag) : null;
       return m ? { n: Number(m[1]), l: m[2] } : undefined;
     }
     /** Does this Recurring Wanderer's story line fit the player's part of the main story? */
     export function storyLineFits(wid, part) {
       if (!part) return false;
       switch (wid) {
         case "pell": return part.n > 3 || (part.n === 3 && part.l >= "C");
         case "anwen": return part.n <= 6;
         case "brannoch": return part.n === 5;
         case "rook": return part.n >= 5;
         case "vesk": return part.n === 7;
       }
       return false;
     }
     /** Blocks players make and nature does not: a wanderer never appears on one. */
     export const BUILT = /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|noteblock|scaffolding|ladder|stairs|slab|brick|polished|frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate/;
     ```

  2. `lines.js`: `export const CARRIED = { hob: "Met a traveler on the road who said {who} wants you. I charge
     nothing for messages. Tips are welcome.", any: "You're {player}? {who} asked every traveler to tell you:
     come by when you can." };` and `export const STORY_LINES` keyed `pell`, `anwen`, `brannoch`, `rook`,
     `vesk` with the five lines of U-8.
  3. `main.js`, state: `const leads = createLeads({ world, system, onScriptEvent, send });`,
     `/** player id -> g:part */ const parts = new Map();`,
     `/** player id -> leadKey of the carried message they heard */ const carriedSaid = new Map();`,
     `/** "<player id>|<wid>" */ const storySaid = new Set();`. Clear the three for a player in the
     `playerLeave` handler (`main.js:1750`; for `storySaid` delete the keys that start with the id).
     Add `"realm:npc_flags"` to the list of the big `onScriptEvent` call (`main.js:1467-1479`) **and** to
     its id guard, and handle it: `if (typeof msg.player === "string" && msg.flags && typeof msg.flags === "object") { const v = msg.flags["g:part"]; if (typeof v === "string") parts.set(msg.player, v.slice(0, 4)); else parts.delete(msg.player); }`.
  4. Party (NPC-04). `Live` typedef: add `@property {string[]} [m] party mates near the owner when they
     appeared (ids)`. In `roll()` after the record is built: read each online player's facts once
     (`{ id, tag: p.getTags().find((t) => t.startsWith("realm_party:")), dim, x, z }`), `const mates =
     matesOf(ownerFacts, others)`; `if (mates.length) rec.m = mates;`. `realm:wander_spawn` gains
     `...(mates.length ? { mates } : {})`. After the owner's message, for each mate that is online:
     `` `§e[Wanderers] Someone is on the road ahead (${compass(spot.x - m.location.x, spot.z - m.location.z)}) for ${player.name}'s party: ${named ? "§6" : "§f"}${name}§e.` ``
     and the same chime. In `tapped()`: `const mine = !rec || rec.o === player.id;`
     `const mate = !mine && !!rec?.m?.includes(player.id);` and the body line for a non-owner becomes
     `mate ? `§7They came for ${online(rec.o)?.name ?? "your friend"}. Stay close and help out.` : `§7${name} is waiting for someone else.``.
     The disguise clock and `Something's off...` stay the owner's only.
  5. The greeting (U-8). Replace `greeting(wid, rec)` in the body line with `greetingOf(player, wid, rec)`:

     ```js
     /** @param {Player} player @param {string} wid @param {Live | undefined} rec */
     function greetingOf(player, wid, rec) {
       if (rec?.h) return greeting(wid, rec);
       const lead = leads.get(player.id);
       if (lead && (lead.st === "start" || lead.st === "report") && lead.who && lead.npc && !lead.npc.startsWith("w_") && carriedSaid.get(player.id) !== leadKey(lead)) {
         carriedSaid.set(player.id, leadKey(lead));
         return (CARRIED[wid] ?? CARRIED.any).split("{who}").join(lead.who).split("{player}").join(player.name);
       }
       const key = `${player.id}|${wid}`;
       if (STORY_LINES[wid] && !storySaid.has(key) && storyLineFits(wid, partOf(parts.get(player.id)))) {
         storySaid.add(key);
         return STORY_LINES[wid];
       }
       return greeting(wid, rec);
     }
     ```

  6. One talk lock per talker (NPC-14): `talking` becomes `Map<string, number>`. In `tapped`:
     `talking.set(entId, (talking.get(entId) ?? 0) + 1)` where it was `add`; in `finally`:
     `const left = (talking.get(entId) ?? 1) - 1; if (left > 0) talking.set(entId, left); else { talking.delete(entId); /* remove slowness as today */ }`.
     Every other use (`talking.has`, `talking.delete` in `lost`) keeps working on a Map; check them with
     `grep -n 'talking' packs/wander_bp/scripts/main.js`.
  7. Relog and restart (NPC-05, L11). In `upkeep()` (`main.js:1010-1039`), at the top of the loop body:

     ```js
     const p = online(rec.o);
     const acceptedLife = Number(CONFIG.acceptedLifeMinutes) * 60000;
     if (keepOffline(rec, !!p, now, acceptedLife)) continue; // their player is away, the job still runs: they wait
     let ent = entityById(rec.e);
     if (!ent && enabled) ent = again(rec, !!rec.a);
     if (!ent && !(rec.a && p)) {
       leave(rec.w, "gone");
       continue;
     }
     ```

     Then the lifetime check as today. The `far` block as today (an accepted wanderer whose entity could
     not come back yet because the player is far or the ground is unloaded now leaves through the 60 s
     `far` timer, not at once). Guard the two lines that use `ent` after it (`keep(ent, ...)`, `sparkle(p,
     ent)`) with `if (ent)`. `again(rec, free = false)`: when `free`, do not count the respawn against
     `RESPAWNS` (skip both the limit test and the increment).
  8. Where they appear (NPC-15): in `findSpot` (`main.js:475-519`), where the top block is tested for
     leaves, lava, fire, magma or cactus, also reject `BUILT.test(top.typeId)`. In `roll()`, right after a
     successful `spawnWanderer`, puff once at the spot:
     `try { player.dimension.spawnParticle("minecraft:knockback_roar_particle", { x: spot.x, y: spot.y + 1, z: spot.z }); } catch { /* unloaded */ }`
     (the particle `poof` uses, `main.js:293`).
  9. The busy retry (NPC-11): `show(player, form, at)` as in T3 step 12; `tapped` passes `ent.location` for
     its menu; `accuseForm` and the command menus keep the long retry.
  10. `debug(msg)`: new action `live`: `send("realm:wander_live", { live: Object.values(live).map((l) => ({ w: l.w, o: l.o, a: l.a ? 1 : 0, e: entityById(l.e) ? 1 : 0, m: l.m?.length ?? 0 })).slice(0, 20) })`.
      Document it in the comment above `debug`.
  11. Tests:
      - `tools/wander-party.test.mjs`: `matesOf`: same tag, same dimension, within 64 are in; another tag,
        no tag, another dimension, 65 blocks away and the owner are out; an owner without a tag has none;
        at most 11. `keepOffline`: true for an accepted record with the owner offline inside the limit;
        false when the owner is online, when not accepted, and one millisecond past the limit. `partOf`:
        `"4C"` parses, `"8A"`, `"4"`, `4`, `undefined` do not. `storyLineFits`: each wanderer at a part that
        fits and one that does not (`pell` at 3B no, 3C yes, 5A yes; `anwen` at 6E yes, 7A no; `brannoch` at
        5B yes, 6A no; `rook` at 4D no, 5A yes; `vesk` at 6E no, 7A yes); `marigold` never; no part, never.
        `BUILT` matches `minecraft:oak_planks` and not `minecraft:grass_block`. `CARRIED` and `STORY_LINES`
        are ASCII.
      - `tools/test-bds/examples/wander-party.js`

        ```js
        // Wanderers of the Wilds, parties (NPC-04, NPC-14): a wanderer that comes for one party member tells the mate
        // beside them too, the mate's menu has no "waiting for someone else" line, and two talkers do not free a walker
        // until both are done. Also the carried message: with a story lead the greeting names the giver once.
        //   node tools/test-bds/run.mjs --quiet --flat --only wander_bp,saga_bp,party_bp --scenario tools/test-bds/examples/wander-party.js --timeout 600
        ```

        Steps: two players 5 blocks apart, far from spawn (x 2000); make a party (as `party-basics.js`);
        wait 60 ticks for the tags; `realm:wander_debug { player: A, action: "spawn", stranger: true }`: A
        gets `/Someone is on the road ahead/`, B gets `/for .+'s party/`; `realm:wander_live` shows `m: 1`.
        Tap as B (`action: "tap"`, `wid` from the live answer): the form's body contains
        `Stay close and help out` and not `waiting for someone else`. A third player not in the party taps:
        the body contains `is waiting for someone else`. Send A a fake `realm:saga_lead` with
        `st: "start", npc: "hollis", who: "Brother Hollis"`, tap as A: the body's first line contains
        `Brother Hollis asked every traveler`; close; wait 12 ticks, tap again: it does not.
      - `tools/test-bds/examples/wander-relog.js`

        ```js
        // Wanderers of the Wilds, leaving (NPC-05): a Stranger whose job was accepted is still on record after their
        // player left the game; one with no accepted job is gone within seconds. (The harness cannot bring the same
        // player back: a simulated player gets a new id, so the return is covered by tools/wander-party.test.mjs.)
        //   node tools/test-bds/run.mjs --quiet --flat --only wander_bp,saga_bp --scenario tools/test-bds/examples/wander-relog.js --timeout 600
        ```

        Steps: players A and B, 600 blocks apart, both far from spawn, plus an operator C who stays; spawn
        a Stranger for each (`stranger: true`); mark A's accepted by sending
        `realm:wander_done { wid, player: A.id, how: "accepted" }`; `A.disconnect()` and `B.disconnect()`;
        wait 100 ticks; `realm:wander_live` (asked by C through `realm:wander_debug`) lists A's record with
        `a: 1` and does not list B's.
- Edge cases:
  - A mate who leaves the party after the wanderer appeared stays a mate for that wanderer (`rec.m` is
    fixed at spawn): harmless, the record lives 30 minutes at most.
  - `rec.m` in a saved record from before this version: absent, read as no mates.
  - The owner returns in another dimension or far away: the wanderer is not respawned; the `far` timer
    removes the record after `leaveSeconds`, and the story hears `realm:wander_gone` with the player online.
  - The limit passed while the owner was offline: at the first `upkeep` after it, `keepOffline` is false and
    the record leaves as today (`gone`); the story's own timer has ended the job by then.
  - No `saga_bp` (no `realm:npc_flags`, no lead): greetings as today.
  - A hostile in disguise never carries a message or a story line.
- Acceptance: `node --test tools/wander-party.test.mjs tools/wander-npc-fixes.test.mjs` passes (do not edit
  the second file, T3 owns it; its wander checks read help-text lines this task leaves alone);
  `npx tsc -p .`, `node tools/check-ascii.mjs`, `node tools/check-events.mjs`,
  `node tools/check-event-guards.mjs` pass; the two new scenarios and
  `tools/test-bds/examples/wander.js`, `wander-walk.js`, `wander-tether.js` pass with their header commands.

### T6 Bounty Board: the shared day, carried bounties, zones

- Owns: `packs/bounty_bp/scripts/main.js`, `packs/bounty_bp/scripts/carry.js` (new),
  `packs/bounty_bp/scripts/config.js`, `packs/bounty_bp/scripts/settings.js` (above the marker only),
  `packs/bounty_bp/scripts/zones.js` (new, generated), `tools/bounty-reset.test.mjs` (new),
  `tools/test-bds/examples/bounty-reset-grace.js` (new).
- Reads (does not edit): `packs/bounty_bp/scripts/day.js`, `tools/zones-shared.js`, `tools/sync-zones.mjs`,
  `packs/wander_bp/scripts/main.js` (how a consumer imports `zones.js` and calls `pingZones`),
  `tools/test-bds/examples/bounty-news.js`, `bounty-water.js`.
- Depends on: T1.
- Change:
  1. `config.js`: `resetHourUtc: 10`, comment "New bounties every day at this hour, UTC. One value for the
     realm, shared with Daily Quests, Story Questlines and Townsfolk: change it in any of them".
     `settings.js` above the marker: `import { createDayClock } from "./day.js";`,
     `export const dayClock = createDayClock({ world, system, fallback: () => BASE.resetHourUtc });`, and the
     existing `resetHourUtc` option becomes `{ key: "resetHourUtc", type: "int", scope: "world", label: "New
     day at (hour, UTC)", help: "Shared by bounties, daily quests, favors and townsfolk. Changing it can start
     a day early once", min: 0, max: 23, step: 1, read: () => dayClock.read(), write: (v) => dayClock.write(v) }`.
  2. `node tools/sync-zones.mjs bounty_bp` (creates `scripts/zones.js`); import `isProtected, pingZones`
     from `./zones.js`.
  3. `carry.js` (no import):

     ```js
     export const FIGHT_RANGE = 96;
     /** Is a player within FIGHT_RANGE (flat) of the target? @param {{ x: number, z: number } | undefined} at @param {{ x: number, z: number }[]} places */
     export const fought = (at, places) => !!at && places.some((p) => Math.hypot(p.x - at.x, p.z - at.z) <= FIGHT_RANGE);
     /**
      * What a day roll keeps from the old list: a spawned, unclaimed champion target someone is fighting (again and
      * again, as long as someone is there), and a cull with progress that was not carried before. Carried entries get old: 1.
      * @param {any[]} list @param {(hunt: any) => boolean} isFought
      */
     export function carryOver(list, isFought) {
       return list
         .filter((b) => !b.done && ((b.t === "c" && b.s === 1 && isFought(b)) || (b.t === "k" && b.p > 0 && !b.old)))
         .map((b) => ({ ...b, old: 1 }));
     }
     /** Between rolls: a carried target nobody is near any more is dropped. Returns the list to keep. */
     export const dropLeft = (list, isFought) => list.filter((b) => !(b.t === "c" && b.old === 1 && !b.done && !isFought(b)));
     ```

     Add `old?: 1` to the `Hunt` and `Cull` typedefs in `main.js`.
  4. The day in `main.js`: delete `today` and `untilReset` and add

     ```js
     let testShift = 0; // realm:bounty_test moves the day on (console only)
     const dayNow = () => dayClock.key() + testShift;
     /** Is the saved list the current day's? It is until a later day has begun. */
     const current = () => !shouldRoll(day().d, dayNow()) && day().d >= 0;
     const untilReset = () => untilText(dayClock.until());
     ```

     (`shouldRoll`, `untilText` from `./day.js`, `dayClock` from `./settings.js`.) `ensureDay`:
     `const d = dayNow(); if (shouldRoll(day().d, d) || day().d < 0) roll(d);`. Replace each comparison of a
     day's `d` with `today()`: `addMissingHunts` (`today_.d !== today()` becomes `!current()`), `sweep`
     (step 6), `liveTargets`, `onRival`, the interval body, the `entityDie` handler, the
     `realm:champion_slain` branch and `showBoard`: `d.d === today()` becomes `current()`, `d.d !== today()`
     becomes `!current()`. After the change `grep -n 'today()' packs/bounty_bp/scripts/main.js` prints nothing.
  5. `roll(d)`: before the new list replaces the old, compute the overworld players' places once (as the
     interval does) and `const carried = carryOver(day().list, (h) => fought(targetOf(h)?.location, places));`
     (`targetOf` in a `try` that yields undefined). The new day is `{ d, list: [...list, ...carried] }`.
     `spawnState.clear()` stays (a carried hunt has `s: 1`, so `tend` follows it). The message gains
     `` carried.length ? ` §7Still open from yesterday: ${carried.map((b) => (b.t === "c" ? b.name : b.label)).join(", ")}.` : "" ``.
  6. `sweep()`: first, when `current()`, `const kept = dropLeft(day().list, (h) => fought(targetOf(h)?.location, places))`
     with the overworld players' places; when `kept.length !== day().list.length`, set `day().list = kept`
     and `dirty = true`. Then the active set is every unclaimed champion target of the list while
     `current()`; the removal loop is unchanged (it removes the entities of the dropped ones).
  7. Zones (NPC-09): in `tend`, the bad-spot test becomes
     `if (nearSpawn(x, z) || isProtected(h.dim, x + 0.5, z + 0.5) || /leaves|_log$|_wood$/.test(top.typeId))`.
     In `targetSpot`, the loop's break condition also requires `!isProtected(OVERWORLD, x + 0.5, z + 0.5)`.
     In the `worldLoad` handler's second timeout (100 ticks) call `pingZones()`.
  8. The old override (L3), in the same 100-tick timeout, before `ensureDay()`:

     ```js
     try {
       if (dayClock.read() === undefined) {
         const raw = world.getDynamicProperty("bounty:cfg");
         const old = typeof raw === "string" ? JSON.parse(raw)?.resetHourUtc : undefined;
         if (typeof old === "number") dayClock.write(old);
       }
     } catch {
       // unreadable: the default hour applies
     }
     ```

  9. `showBoard`: after the loop over the bounties without `old`, when any entry has `old === 1`, push the
     line `§7Still open from yesterday` and then those entries in the same format. `New bounties in ...`
     uses the new `untilReset()`. Its own retry loop (`main.js:968-974`) and `show()` take the NPC-11 rule:
     when `board` is given (the lectern), 3 tries and stop when the player is more than 6 blocks from the
     lectern or in another dimension.
  10. Test hook, next to the `realm:help_ping` handler, importing `ScriptEventSource`:

      ```js
      // Scenario tests (BDS harness), only from the server console: the next day begins now.
      // /scriptevent realm:bounty_test {"action":"next_day"}
      onScriptEvent("realm:bounty_test", (ev) => {
        if (ev.sourceType !== ScriptEventSource.Server) return;
        try {
          if (JSON.parse(ev.message)?.action === "next_day") {
            testShift++;
            ensureDay();
          }
        } catch (e) {
          console.warn(`[bounty] test: ${e}`);
        }
      });
      ```

  11. Tests:
      - `tools/bounty-reset.test.mjs`: `fought`: a player at 96 blocks yes, at 97 no, no target no;
        `carryOver`: a spawned unclaimed fought hunt is carried with `old: 1`; an unspawned, a claimed and
        an unfought one are not; a cull with `p > 0` is carried once and, already `old`, not again; a cull
        with `p` 0 and a done cull are not; a carried hunt that is still fought is carried again;
        `dropLeft` drops only carried unclaimed hunts nobody is near. With `tools/day-shared.js`: a list
        saved with the UTC key `U` does not roll at 09:00 UTC on day `U` or `U + 1` with hour 10 and rolls
        at 10:00 UTC on day `U + 1`.
      - `tools/test-bds/examples/bounty-reset-grace.js`

        ```js
        // Bounty Board, the day roll (NPC-02): a champion target with a player beside it survives the roll and is
        // listed as still open; a cull with progress is carried once; a target nobody is near is removed; in a safe
        // zone no target is asked for (NPC-09).
        //   node tools/test-bds/run.mjs --quiet --flat --only bounty_bp,elite_bp,zones_bp --scenario tools/test-bds/examples/bounty-reset-grace.js --timeout 900
        ```

        Steps: set up a board and a first day as `bounty-news.js` does (`champions` 1, `count` 2 through
        `realm:cfg_set`); walk the player to the target's spot until an entity tagged `realm:bounty:<id>`
        exists; kill one mob of the cull's list so `p` is 1 (spawn it and attack, as `bounty-news.js` kills);
        `await t.console('scriptevent realm:bounty_test {"action":"next_day"}')`; wait 260 ticks (one sweep):
        the tagged entity still exists; the chat got `/Still open from yesterday/`; open the board
        (`/realm:bounty_list`): the body contains `Still open from yesterday`, the old target's name and
        the cull with `1/`. Teleport the player 300 blocks away, wait 260 ticks, return: no entity with the
        old tag. `next_day` again: the old cull is gone from the board. If `zones_bp` has a debug or command
        way to add a zone that an existing scenario uses (`grep -ln zones_bp tools/test-bds/examples`), add
        a zone over a fresh target's spot and assert no `realm:champion_spawn` is sent for a spot inside it
        within 200 ticks; if not, leave the zone check to the unit level and say so in the header.
- Edge cases:
  - The saved `d` is from before the update (a UTC day number): no roll until a later day begins (D-2).
  - `testShift` is memory only: after a restart the saved `d` is ahead of the real key, so the list simply
    stays current until real time catches up (only in tests).
  - A carried hunt is claimed after the roll: paid as any (`rewards.champion`), listed as claimed until the
    next roll.
  - A carried cull finished after the roll: paid to everyone in `who`, as any.
  - Hunts are not possible (no board, no Champions pack): `carryOver` still carries culls.
  - The operator changes the hour: the key may jump forward once (one early roll) and never back.
  - `isProtected` before any zone list arrived: false, as for every consumer.
- Acceptance: `node --test tools/bounty-reset.test.mjs` passes; `node tools/sync-zones.mjs --check`,
  `npx tsc -p .`, `node tools/check-ascii.mjs`, `node tools/check-events.mjs`,
  `node tools/check-event-guards.mjs` pass; `bounty-reset-grace.js`, `bounty-news.js` and `bounty-water.js`
  pass with their header commands.

### T7 Story Questlines: the favors' day and the realm's act

The only task in `saga_bp`. The story lane may have changed these files; find the code by the names
below, keep the diff to these lines, and merge `master` in before pushing.

- Owns: `packs/saga_bp/scripts/data.js` (`today` only), `packs/saga_bp/scripts/ui.js` (the favors page
  sentence only), `packs/saga_bp/scripts/main.js` (`sendProgress` and one line at world load),
  `packs/saga_bp/scripts/config.js`, `packs/saga_bp/scripts/settings.js` (above the marker only),
  `tools/saga-day.test.mjs` (new).
- Reads (does not edit): `packs/saga_bp/scripts/day.js`, `tools/wander-npc-fixes.test.mjs` (a source-level
  test to copy the style of).
- Depends on: T1.
- Change:
  1. `config.js`: `dayResetHourUtc: 10`, comment "Daily favors turn over at this hour, UTC. One value for
     the realm, shared with Bounty Board, Daily Quests and Townsfolk: change it in any of them".
     `settings.js` above the marker: the import, `export const dayClock = createDayClock({ world, system,
     fallback: () => BASE.dayResetHourUtc });` and the option exactly as in T3 step 2 (same key, label, help,
     `read`, `write`).
  2. `data.js` (`today`, line 140): the file must not import `settings.js`, so make the clock settable:

     ```js
     /** The day favors count in: the realm's shared day (main.js hands it in), else the UTC day. */
     let dayOf = () => Math.floor(Date.now() / 86400000);
     export const today = () => dayOf();
     /** @param {() => number} fn */
     export function setDayClock(fn) {
       dayOf = fn;
     }
     ```

     In `main.js`, at module level after the imports: `setDayClock(() => dayClock.key());`. The four callers
     in `ui.js` already compare with `>=` and `<` and stay as they are.
  3. `ui.js`, the favors page: replace the text `(a new one at midnight UTC)` with
     `` (new ones in ${untilText(dayClock.until())}) `` (`untilText` from `./day.js`, `dayClock` from
     `./settings.js`). If the story lane removed that sentence, run `grep -rn "midnight UTC" packs/saga_bp`
     and apply the same replacement wherever it is found; if nothing is found, skip this step.
  4. `main.js`, `sendProgress` (line 226):

     ```js
     const PROP_REALM_ACT = "saga:realm_act"; // world: the highest main act any player has finished (0-5)
     let realmAct = 0;
     // ... inside sendProgress, after `act` is counted:
     if (act > realmAct) {
       realmAct = act;
       try {
         world.setDynamicProperty(PROP_REALM_ACT, act);
       } catch (e) {
         console.warn(`[saga] realm act: ${e}`);
       }
       progressSent.clear(); // everyone hears the realm's new act
     }
     const sig = act * 10 + realmAct;
     if (progressSent.get(player.id) === sig) return;
     progressSent.set(player.id, sig);
     send("realm:saga_progress", { player: player.id, act, realm: realmAct });
     ```

     In the pack's `world.afterEvents.worldLoad` handler read it back:
     `const v = world.getDynamicProperty(PROP_REALM_ACT); if (typeof v === "number" && v >= 0 && v <= 5) realmAct = Math.floor(v);`
     inside a `try`. First check that no other code uses the key: `grep -rn "realm_act" packs/saga_bp` must
     print nothing before the change.
  5. `tools/saga-day.test.mjs`: source-level checks (read the files as text): `data.js` exports
     `setDayClock` and `today`; `main.js` calls `setDayClock(`; no file under `packs/saga_bp/scripts`
     contains `midnight UTC`; `main.js` contains `realm: realmAct`. One behavior check with
     `tools/day-shared.js`: for a favor saved with `d` = the UTC day number U, `d >= dayKey(t, 10)` is true
     at 09:59 UTC on U + 1 and false at 10:00 UTC on U + 1.
- Edge cases: an older `atlas_bp` or `calendar_bp` ignores the extra `realm` field; a world where nobody
  finished Act I sends `realm: 0`; the property unreadable at load leaves `realmAct` 0 until the first
  player with a finished act is seen (their own `act` raises it again).
- Acceptance: `node --test tools/saga-day.test.mjs` passes; `npx tsc -p .`, `node tools/check-stories.mjs`,
  `node tools/check-events.mjs`, `node tools/check-ascii.mjs` pass;
  `node tools/test-bds/suite.mjs --filter '^saga-quest-log$' --retry` passes.

### T8 Faces for command-only systems, the quests' day, the calendar line

- Owns: `packs/quests_bp/scripts/main.js`, `packs/quests_bp/scripts/config.js`,
  `packs/quests_bp/scripts/settings.js` (above the marker only), `packs/goals_bp/scripts/main.js`,
  `packs/expedition_bp/scripts/main.js`, `packs/fishing_bp/scripts/main.js`,
  `packs/calendar_bp/scripts/main.js`, `tools/quests-day.test.mjs` (new),
  `tools/test-bds/examples/npc-faces.js` (new).
- Reads (does not edit): `packs/quests_bp/scripts/day.js`, `packs/bounty_bp/scripts/main.js:852-910` (an
  `realm:npc_talk` / `realm:npc_choose` handler to copy), `packs/npc_bp/scripts/config.js` (roles).
- Depends on: T1.
- Change:
  1. `quests_bp`, the day: `config.js` `resetHourUtc: 10` with the comment of T6 step 1 reworded for quests;
     `settings.js` as T6 step 1 (`fallback: () => BASE.resetHourUtc`, label `New day at (hour, UTC)`, the
     same help, `read`, `write`). `main.js`: delete `today` and the old `untilReset`; add
     `const dayNow = () => dayClock.key();` and `const untilReset = () => untilText(dayClock.until());`;
     in `questsOf`: `const d = dayNow();` and `if (day && !shouldRoll(day.d, d))` in place of
     `day && day.d === d`; the test hook saves `d: dayNow()`. At world load (add a
     `world.afterEvents.worldLoad` subscription if the file has none), in a 100-tick timeout, copy an old
     override exactly as T6 step 8 with the property `quests:cfg`.
  2. The same handler shape in each pack (ids in the list **and** in the guard; `online` is
     `world.getAllPlayers().find((p) => p.id === id)` where the pack has no such helper):

     ```js
     // Townsfolk: <who> offers <what> (the pack's own menu), so it has a place in town as well as a command.
     onScriptEvent(["realm:npc_talk", "realm:npc_choose"], ({ id, message }) => {
       if (id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
       let msg;
       try {
         msg = JSON.parse(message);
       } catch {
         return;
       }
       if (!msg || typeof msg !== "object" || typeof msg.player !== "string") return;
       try {
         const player = online(msg.player);
         if (!player) return;
         if (id === "realm:npc_talk") {
           if (!Array.isArray(msg.roles) || !msg.roles.includes(ROLE) || typeof msg.req !== "string") return;
           // send realm:npc_offer { req: msg.req, pack: PACK, key: KEY, label, order } when the row's condition holds
         } else if (msg.pack === PACK && msg.key === KEY) {
           system.run(() => open(player).catch((e) => console.warn(`[<pack>] ${e}`)));
         }
       } catch (e) {
         console.warn(`[<pack>] npc: ${e}`);
       }
     });
     ```

     | Pack | `ROLE` | `KEY` | Label | Order | `open` | Condition |
     |---|---|---|---|---|---|---|
     | `quests_bp` | `"mayor"` | `"quests"` | `` `Daily quests\n§8${done} of ${n} done today` `` from `questsOf(player).day` | 32 | `showQuests` | none |
     | `goals_bp` | `"mayor"` | `"goals"` | `` `Community goals\n§8${n} open` ``, `n` = goals with `!g.done` | 33 | `mainMenu` | `n > 0` |
     | `expedition_bp` | `"warden"` | `"expeditions"` | `Expeditions\n§8Dungeon runs, alone or as a party` | 41 | `mainMenu` | none |
     | `fishing_bp` | `CONFIG.npcRole` | `"tournament"` | U-11 (`tourney` running: `` `Fishing tournament\n§8On now: ends in ${until(tourney.e - Date.now())}` ``; else `` `Fishing tournament\n§8Next in ${until(scheduledStart(Date.now()) - Date.now())}` ``) | 22 | a form: title `Fishing tournament`, body `tournamentStatus()`, button `Thanks` | `tourney` or `get("tournamentEnabled") === true` |

     `fishing_bp` and `calendar_bp` already have such a handler: add the offer and the choice to it
     (`fishing_bp/main.js:1348-1375`; `calendar_bp` `onNpc`, `main.js:2165-2175`) instead of a second one.
     In `calendar_bp`'s `onNpc`, after the stall offer, also send
     `{ req: msg.req, pack: PACK, key: "activities", label: `${FESTIVALS[fest].name}\n§8Activities and what you've done`, order: 26 }`
     (`fest = festivalNow()`), and let the choice `activities` run `festivalMenu(player)`; the early return
     on `msg.key !== "stall"` becomes a check for both keys.
  3. `calendar_bp`, the line (U-12): `let realmAct = 0;` next to `acts`; in the `realm:saga_progress`
     branch (`main.js:2337`) also `if (num(msg.realm)) realmAct = Math.max(0, Math.min(5, Math.floor(msg.realm)));`;
     in `mainMenu` (`main.js:2007`), right after the first line is pushed:

     ```js
     const ROMAN = ["", "Act I", "Act II", "Act III", "Act IV", "Act V"];
     if (realmAct >= 1) {
       const mine = Math.max(0, Math.min(5, acts.get(player.id) ?? 0));
       lines.push(`§7The realm's story: ${ROMAN[realmAct]} finished. You: ${mine >= 5 ? "all five acts" : ROMAN[mine + 1]}.`);
     }
     ```

     (`ROMAN` at module level.)
  4. Tests:
     - `tools/quests-day.test.mjs`: source-level: `packs/quests_bp/scripts/main.js` has no `today()` and
       uses `shouldRoll(`; with `tools/day-shared.js`: quests saved with the UTC key U do not roll at
       09:59 UTC on U + 1 and roll at 10:00.
     - `tools/test-bds/examples/npc-faces.js`

       ```js
       // Townsfolk as faces for the command-only systems: the mayor offers Daily quests (and Community goals while one
       // is open), Reyes offers Expeditions, Tobin the Fishing tournament, and each button opens that pack's menu.
       //   node tools/test-bds/run.mjs --quiet --flat --only npc_bp,quests_bp,goals_bp,expedition_bp,fishing_bp,calendar_bp --scenario tools/test-bds/examples/npc-faces.js --timeout 600
       ```

       Steps: an operator places `bram`, `reyes`, `tobin`, `quill` a few blocks apart; tap `bram`: a button
       matching `/^Daily quests\n.*\d of \d done today/`, none containing `Community goals`; answer it: a
       form titled `Daily Quests` (color codes ignored). Tap `reyes`: a button starting `Expeditions`;
       answer: the expedition menu's form appears. Tap `tobin`: a button starting `Fishing tournament`;
       answer: a form titled `Fishing tournament` with the button `Thanks`. Tap `quill` on Realm day 1 (no
       festival): no button containing `Activities`. Run `/realm:calendar`: the body has no
       `The realm's story` line; send `realm:saga_progress { player: p.id, act: 0, realm: 2 }`, open it
       again: the body contains `The realm's story: Act II finished. You: Act I.`
- Edge cases: a role an operator's own NPC also has gets the button too (roles, not ids, decide: as for
  every other offer); `goals_bp` with no open goal sends nothing; a player who left before the choice: no
  form; `questsOf` may roll the day's quests when the label is built, which is what opening the menu does.
- Acceptance: `node --test tools/quests-day.test.mjs` passes; `npx tsc -p .`, `node tools/check-ascii.mjs`,
  `node tools/check-events.mjs`, `node tools/check-event-guards.mjs` pass; `npc-faces.js`,
  `quests-party.js`, `calendar.js` and `fishing-shared-catch.js` pass with their header commands.

### T9 The rally: Parties, the Minimap, the Realm Menu entry

- Owns: `packs/party_bp/scripts/main.js`, `packs/party_bp/scripts/rally.js` (new),
  `packs/party_bp/scripts/config.js`, `packs/party_bp/scripts/settings.js` (above the marker only),
  `packs/party_bp/scripts/cards.js` (new, generated), `packs/map_bp/scripts/main.js`,
  `packs/admin_bp/scripts/menu.js`, `tools/party-rally.test.mjs` (new),
  `tools/test-bds/examples/party-rally.js` (new).
- Reads (does not edit): `tools/cards-shared.js`, `tools/sync-cards.mjs` and one pack that already
  contributes cards (find it with `grep -ln "createCards" packs/*/scripts/main.js`), `tools/check-menu.mjs`,
  `packs/calendar_bp/scripts/main.js:1202-1235` (how `realm:town_list` parts are put together),
  `tools/test-bds/examples/party-basics.js`.
- Depends on: none in this spec (09 must be released: `menu.js`, `cards-shared.js`).
- Change:
  1. `rally.js` (no import):

     ```js
     export const ARRIVED = 8; // blocks: this close, the call is answered
     export const ASK_RANGE = 32; // an asked spot must be this close to the caller
     export const TOWN_RANGE = 96;
     const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
     const DIMS = { "minecraft:overworld": "the Overworld", "minecraft:nether": "the Nether", "minecraft:the_end": "the End" };
     const clean = (v, max) => (typeof v === "string" ? v.replace(/§./g, "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, max) : "");
     const fin = (v) => typeof v === "number" && Number.isFinite(v);

     /** Where the call points: the asked spot when it is whole, in the caller's dimension and near them; else the caller's feet. */
     export function rallySpot(ask, caller) {
       const ok = ask && ask.dim === caller.dim && fin(ask.x) && fin(ask.y) && fin(ask.z) && Math.hypot(ask.x - caller.x, ask.z - caller.z) <= ASK_RANGE;
       const s = ok ? ask : caller;
       return { dim: caller.dim, x: Math.floor(s.x), y: Math.floor(s.y), z: Math.floor(s.z) };
     }
     /** The asked name, else the nearest town within TOWN_RANGE, else "x, z". `towns`: { n, dim, x, z }[]. */
     export function rallyPlace(asked, spot, towns) {
       const name = clean(asked, 32);
       if (name) return name;
       let best;
       for (const t of towns) {
         if (t.dim !== spot.dim) continue;
         const d = Math.hypot(t.x - spot.x, t.z - spot.z);
         if (d <= TOWN_RANGE && (!best || d < best.d)) best = { d, n: clean(t.n, 32) };
       }
       return best?.n || `${spot.x}, ${spot.z}`;
     }
     /** Whole seconds until the party may be called again (0: now). Ticks in, seconds out. */
     export const cooldownLeft = (lastTick, nowTick, seconds) => (lastTick === undefined ? 0 : Math.max(0, Math.ceil((lastTick + seconds * 20 - nowTick) / 20)));
     /** "240m NE" / "in the Nether" from a viewer to the spot. */
     export function rallyWhere(spot, viewer) {
       if (viewer.dim !== spot.dim) return { far: true, text: `in ${DIMS[spot.dim] ?? spot.dim}` };
       const dx = spot.x - viewer.x;
       const dz = spot.z - viewer.z;
       const dist = Math.round(Math.hypot(dx, dz));
       const dir = COMPASS[(Math.round((Math.atan2(dx, -dz) * 180) / Math.PI / 45) + 8) % 8];
       return { far: false, dist, text: `${dist}m ${dir}` };
     }
     /** The HUD part for a member, or undefined once they are there. */
     export function rallyLine(rally, viewer) {
       const w = rallyWhere(rally, viewer);
       if (!w.far && w.dist <= ARRIVED) return undefined;
       return w.far ? `§dRally: ${rally.place}, ${w.text}` : `§dRally: ${rally.place} ${w.text}`;
     }
     ```

  2. `config.js`: `rally: true` ("Party members can call the party to a spot: a chat line, a HUD line and a
     star on the Minimap. Nobody is moved"), `rallyMinutes: 5`, `rallyCooldownSeconds: 60`. `settings.js`:
     `{ key: "rally", type: "bool", scope: "world", label: "Party calls", help: "Call the party to a spot:
     a star on their compass, no teleport" }`.
  3. `main.js`, state: `/** code -> the call */ const rallies = new Map();`
     `/** code -> tick of the last call */ const rallyAt = new Map();`
     `/** town id -> { n, dim, x, z } from realm:town_list */ const towns = new Map();`.
     `realm:town_list` handler (`{ part, parts, towns: [{ id, n, dim, x, z }] }`): `parts <= 0` or no array
     clears the map; `part === 1` clears it first; then each valid entry is set. Send
     `realm:town_list_ping` `{}` 100 ticks after world load.
  4. The call:

     ```js
     /** @param {Player} player @param {any} [ask] a realm:rally_ask message */
     function rally(player, ask) {
       if (!enabled()) return player.sendMessage(`§c${DISABLED}`);
       if (get("rally") !== true) return player.sendMessage("§7[Party] Party calls are switched off on this realm.");
       const code = partyOf(player.id);
       const p = code ? parties().get(code) : undefined;
       if (!code || !p) return player.sendMessage("§7[Party] You are not in a party. Start one with /realm:party.");
       const others = p.m.map(([id]) => online(id)).filter((m) => m && m.id !== player.id);
       if (!others.length) return player.sendMessage("§7[Party] Nobody else in your party is online.");
       if (mutedIn(code).includes(player.id)) return player.sendMessage("§c[Party] You are muted in this party, so you cannot call it.");
       const now = system.currentTick;
       const seconds = Math.max(10, Number(CONFIG.rallyCooldownSeconds) || 60);
       const left = cooldownLeft(rallyAt.get(code), now, seconds);
       if (left > 0) return player.sendMessage(`§7[Party] The party was called ${seconds - left}s ago. Try again in ${left}s.`);
       const l = player.location;
       const spot = rallySpot(ask, { dim: player.dimension.id, x: l.x, y: l.y, z: l.z });
       const place = rallyPlace(ask?.place, spot, [...towns.values()]);
       const ticks = Math.max(1, Number(CONFIG.rallyMinutes) || 5) * 1200;
       const call = { code, by: player.id, name: player.name.slice(0, 32), place, ...spot, ticks };
       rallyAt.set(code, now);
       rallies.set(code, { ...call, until: now + ticks });
       system.sendScriptEvent("realm:rally", JSON.stringify(call));
       player.sendMessage(`§d[Party] You called the party to ${place}. §7They see it for ${ticks / 1200} minutes.`);
       for (const m of others) {
         const w = rallyWhere(spot, { dim: m.dimension.id, x: m.location.x, z: m.location.z });
         m.sendMessage(`§d[Party] ${player.name} calls the party to ${place} (${w.text}).`);
         m.playSound("note.bell", { pitch: 1.2, volume: 0.6 });
       }
     }
     ```

     `realm:rally_ask` handler: parse in a `try`; `typeof m.player === "string"`; `const player = online(m.player)`;
     without a player return; `rally(player, m)`. Command, next to the others (`main.js:734-755`):
     `r.registerCommand({ name: "realm:party_rally", description: "Parties: call your party to where you stand (a star on their compass, no teleport)", ...any }, handler("party_rally", (p) => rally(p)));`
     `mainMenu`: for a party with 2 or more members add the button
     `Call the party here\n§8A star to this spot, 5 min` after the party chat button; it runs `rally(player)`.
     When a party is deleted or the caller leaves it (`remove`), delete `rallies` and `rallyAt` for that
     code if the party is gone, and the rally if `by` was the leaver.
  5. The HUD loop (`main.js:424-460`): for each player in a party, before the `near` test,
     `const call = rallies.get(code);` drop it when `system.currentTick >= call.until`; `const head = call
     && call.by !== player.id ? rallyLine(call, { dim: player.dimension.id, x: player.location.x, z:
     player.location.z }) : undefined;`. The early `continue` for a party of one or for no mates near only
     applies when there is no `head`. The text is `[head, matesText].filter(Boolean).join(" §7| ")`. The
     two output paths are unchanged.
  6. The card: `node tools/sync-cards.mjs party_bp`, then in `main.js`
     `createCards({ PACK: "party_bp", onScriptEvent, items: (player, ctx) => { ... } })`: for `ctx ===
     "menu"` return one item `{ k: "party_rally", h: <place> }` where `<place>` is
     `rallyPlace(undefined, rallySpot(undefined, <the player's place>), [...towns.values()])` cut at 40,
     plus `hide: 1` when the player is in no party, parties are disabled, `rally` is off, or no other
     member is online; for every other `ctx` return `[]`. Follow the call shape of the pack that already
     contributes (README C2).
  7. `packs/admin_bp/scripts/menu.js`: on the `today` screen add one entry for the command
     `realm:party_rally`: title `Call my party here`, second line `A star to this spot`, key `party_rally`,
     for every player, placed last in the screen's first group. Copy the shape of the Daily Quests entry of
     that screen exactly (the field names are whatever 09 shipped). `node tools/check-menu.mjs` must pass:
     the new command is placed once and no label is too wide.
  8. `packs/map_bp/scripts/main.js`: add `"realm:rally"` to `EVENTS`; state
     `/** party code -> { spot, by, until } */ const rallies = new Map();`; in `onEvent`:

     ```js
     case "realm:rally": {
       if (typeof m.code !== "string" || typeof m.by !== "string") return;
       const s = spotOf(m, m.place);
       const ticks = isNum(m.ticks) ? Math.max(0, Math.min(12000, Math.floor(m.ticks))) : 0;
       if (!s || !s.n || !ticks) rallies.delete(m.code);
       else rallies.set(m.code.slice(0, 16), { spot: s, by: m.by, until: system.currentTick + ticks });
       if (rallies.size > 64) rallies.delete(/** @type {string} */ (rallies.keys().next().value));
       return;
     }
     ```

     In `destination()`, after the `if (wp) { ... }` block and before `siegeSpot`:

     ```js
     if (rallies.size) {
       const tag = partyTag(player);
       const r = tag ? rallies.get(tag.slice(PARTY_TAG.length)) : undefined;
       if (r && system.currentTick >= r.until) rallies.delete(/** @type {string} */ (tag).slice(PARTY_TAG.length));
       else if (r && r.by !== player.id && !(r.spot.dim === player.dimension.id && distTo(player, r.spot) <= 8)) return { spot: r.spot, picked: false };
     }
     ```

     Add the event to the protocol comment at the top of the file.
  9. Tests:
     - `tools/party-rally.test.mjs`: `rallySpot` uses a whole asked spot within 32 blocks, and the caller's
       feet for a spot 33 blocks away, in another dimension, or with a missing coordinate; coordinates are
       floored. `rallyPlace`: a cleaned asked name wins and is cut at 32; else the nearest town within 96
       blocks in the same dimension; else `"412, -96"`. `cooldownLeft(undefined, 0, 60)` is 0,
       `cooldownLeft(100, 500, 60)` is 40, `cooldownLeft(100, 1300, 60)` is 0. `rallyWhere` north-east and
       another dimension. `rallyLine` is undefined within 8 blocks, `§dRally: Riverside 240m NE` beyond,
       `§dRally: Riverside, in the Nether` across dimensions.
     - `tools/test-bds/examples/party-rally.js`

       ```js
       // Parties, the rally (README C6): /realm:party_rally and realm:rally_ask call the party to a spot: one realm:rally,
       // a chat line and a HUD line for the mate, nothing for players outside the party, nobody moved, and one call a
       // minute. The Minimap points the mate's star at the spot.
       //   node tools/test-bds/run.mjs --quiet --flat --only party_bp,map_bp --scenario tools/test-bds/examples/party-rally.js --timeout 600
       ```

       Steps: players A, B (60 blocks from A) and C (not in the party); A invites B, B accepts (as
       `party-basics.js`); record B's position; `t.cmd(A, "/realm:party_rally")`: exactly one `realm:rally`
       with `by: A.id`, `ticks: 6000`, `x`/`z` equal to A's floored position and `place` equal to
       `"<x>, <z>"`; B gets a chat line matching `/calls the party to .* \(\d+m [NSEW]{1,2}\)/`; C gets
       nothing from `party_bp`; within 60 ticks B gets an action bar matching `/Rally: /` (set
       `t.echoActionBar` or read `t.messages(B, { kind: "actionbar" })`); B's position is unchanged. Ask
       the Minimap (`realm:map_debug { player: B.id, action: "state" }`, read `realm:map_state` as the map
       scenarios do) and check its destination is the rally spot; if the state message carries no
       destination, add nothing to `map_bp` for it and check instead that B's strip text (action bar or
       title from `map_bp`) contains the place. A calls again at once: A gets `/Try again in \d+s/` and no
       second `realm:rally`. Send `realm:rally_ask { player: B.id, place: "the Test bell tower", dim, x, y, z }`
       with A's spot 60 blocks from B: refused by the cooldown (same party). C runs the command: `/not in a party/`.
- Edge cases:
  - A restart during a call: the call is gone (L9); nothing is saved.
  - The caller is the only member online: refused, no event.
  - A member in another dimension: the chat and HUD say `in the Nether`; the Minimap star follows its own
    rule for a spot in another dimension (as for any destination).
  - Two parties call at once: each consumer keys by party code.
  - `map_bp` without `party_bp`: no `realm:rally` ever arrives.
  - `party_bp` without `map_bp` or `town_bp`: chat and HUD still work; the place is coordinates.
  - A player with `partyHud` off sees the chat line only.
  - `cards.js` missing because 09's tool has another name: stop and report (this task depends on 09).
- Acceptance: `node --test tools/party-rally.test.mjs` passes; `node tools/sync-cards.mjs --check`,
  `node tools/check-menu.mjs`, `npx tsc -p .`, `node tools/check-ascii.mjs`, `node tools/check-events.mjs`,
  `node tools/check-event-guards.mjs`, `node tools/check-actionbar.mjs`, `node tools/check-commands.mjs`
  pass; `party-rally.js`, `party-basics.js`, `party-hud-coords.js` pass with their header commands.

### T10 Small fixes: caravan, Atlas tablets, Champions in zones, the inn's bed

- Owns: `packs/caravan_bp/scripts/main.js`, `packs/caravan_bp/scripts/config.js`,
  `packs/atlas_bp/scripts/main.js`, `packs/elite_bp/scripts/main.js`, `packs/waystone_bp/scripts/main.js`,
  `packs/waystone_bp/scripts/config.js`, `tools/test-bds/examples/caravan-spawn-ground.js` (new),
  `tools/test-bds/examples/elite-zone-convert.js` (new).
- Reads (does not edit): `packs/caravan_bp/scripts/tether.js` (`freeSpotNear`),
  `packs/bounty_bp/scripts/main.js:431-461` (`surfaceAt`, `waterOver`),
  `tools/test-bds/examples/caravan-traders.js`, `elite-storm-zones.js`, `tools/test-bds/hooks/elite-remove.mjs`.
- Depends on: none.
- Change:
  1. **Caravan, the week's first session (NPC-07).** `config.js`: `lateHours: 0`, comment "If nobody is
     online when the caravan is due, it comes when someone joins within this many hours of its arrival
     time (and stays the full `stayMinutes`). 0: any time until the next caravan is due". `main.js`
     (`upkeep`, line 807): `const late = CONFIG.lateHours > 0 ? Math.max(stayMs(), CONFIG.lateHours * HOUR) : schedule().every * DAY;`
  2. **Caravan, where it stands without a spot (NPC-08).** In `keepCaravan`, the `!vis.placed` branch
     (`main.js:673-688`): try the columns at the spot itself and then on rings of 4, 8, 12 and 16 blocks
     (8 directions each, 33 columns at most, one tick). A column is good when `getTopmostBlock` gives a
     readable block (the existing `try`), the block above it is not water (`dim.getBlock({ x, y: top.y + 1, z })`
     is not liquid: `getTopmostBlock` skips water), the top is not leaves, a log or wood
     (`/leaves|_log$|_wood$/`), and it does not match the `BUILT` pattern (copy the regex of
     `bounty_bp/main.js:272-273` into a `const BUILT` here). The first good column becomes the spot
     (`vis.spot.x`, `vis.spot.z` moved to it, `vis.spot.y = top.location.y + 1`); when no column is
     readable yet, return and try again at the next upkeep; when all 33 were readable and none was good,
     use the original column as today. Then, once per visit, tell online operators the line of U-13 (add a
     saved flag `told: true` on the visit so a restart does not repeat it).
     Traders (`main.js:705-708`): `tr.at = standable(dim, base) ?? freeSpotNear(dim, vis.spot, 4, i) ?? { x: vis.spot.x, y: vis.spot.y, z: vis.spot.z }`
     for every `i` (import `freeSpotNear` from `./tether.js`), and skip a candidate that is the block of a
     trader placed before (compare floored x and z with the earlier `tr.at`; on a clash use
     `freeSpotNear(dim, vis.spot, 4, i + 3)`). Llamas (`main.js:731`): the same `?? freeSpotNear(dim, home, 4, n)`
     before the fallback.
  3. **Caravan, the busy retry (NPC-11).** `show(player, form, at)` as in T3 step 12; the trader tap passes
     the trader's location for the shop's first form.
  4. **Atlas tablets (NPC-16).** In `atlas_bp/main.js`, add before the after-event handler:

     ```js
     // Tablets, survey markers and shrines answer on the before event, so a block in hand is not placed against them.
     world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
       if (ev.cancel) return;
       const { player, block, isFirstEvent } = ev;
       try {
         if (!enabled() || player.dimension.id !== OVERWORLD) return;
         const typeId = block.typeId;
         if (typeId === "minecraft:barrel" || typeId === "minecraft:chest") return;
         const at = block.location;
         const rec = siteAt(at, 1);
         const kind = rec ? kindOf(rec) : undefined;
         if (kind !== "tablet" && kind !== "survey" && kind !== "shrine") return;
         ev.cancel = true;
         if (isFirstEvent) system.run(() => onUse(player, at, typeId));
       } catch (e) {
         console.warn(`[atlas] ${e}`);
       }
     });
     ```

     and make the existing `afterEvents.playerInteractWithBlock` handler (`main.js:1158-1165`) skip those
     three kinds (`const rec = siteAt(block.location, 1); if (rec && ["tablet", "survey", "shrine"].includes(kindOf(rec))) return;`
     before `onUse`), so they do not open twice. Hits (`entityHitBlock`) stay as they are.
  5. **Champions in protected land (NPC-09).** `elite_bp/main.js`, `convert` (line 544), after the
     `crowdedAround` line: `if (isProtected(dimId, at.x, at.z)) return; // a town, a claim or a safe zone: no champion appears there`.
     `spawnRequested` is not changed (a story or a bounty placed that one on purpose). Workstream 06 also
     edits `convert` (it skips mobs tagged `realm_scripted`): keep both lines when merging.
  6. **The inn's bed (NPC-13).** `waystone_bp/main.js`, in `bedMenu` before `setSpawnPoint` (line 938):

     ```js
     /** A free block beside the innkeeper (feet and head open, solid floor), so a respawn is not inside them. */
     function bedSpot(dim, keeper) {
       const base = { x: Math.floor(keeper.x), y: Math.floor(keeper.y), z: Math.floor(keeper.z) };
       for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
         try {
           const feet = dim.getBlock({ x: base.x + dx, y: base.y, z: base.z + dz });
           const head = feet?.above();
           const floor = feet?.below();
           if (feet?.isAir && head?.isAir && floor && !floor.isAir && !floor.isLiquid) return { x: base.x + dx, y: base.y, z: base.z + dz };
         } catch {
           // unloaded: try the next
         }
       }
       return base;
     }
     ```

     and use `const at = keeper ? bedSpot(dim, spot) : { x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z) };`
     in `setSpawnPoint({ dimension: dim, ...at })`. `config.js`: `newsKept: 10` (L13).
  7. Scenarios:
     - `tools/test-bds/examples/caravan-spawn-ground.js`

       ```js
       // Merchant Caravan with no arrival spot (NPC-08): at a world spawn under a tree or over water the traders stand
       // on dry open ground nearby, no two in one block, and operators are told once to set a spot.
       //   node tools/test-bds/run.mjs --quiet --flat --only caravan_bp --scenario tools/test-bds/examples/caravan-spawn-ground.js --timeout 600
       ```

       Steps: on the flat world (spawn 0, 0) put a 3 x 3 pool of water one deep at the spawn column and a
       5 x 5 roof of `minecraft:oak_planks` 4 blocks up east of it (x 4 to 8); an operator runs
       `/realm:caravan_call`; wait until three entities tagged `realm:caravan` of type `minecraft:npc`
       exist: none stands over water or on planks, their floored x,z pairs are three different blocks,
       each is within 20 blocks of spawn; the operator got one chat line matching
       `/No caravan spot is set/`; depart through `realm:caravan_test` and call again: the line comes once
       per visit.
     - `tools/test-bds/examples/elite-zone-convert.js`

       ```js
       // Champions (NPC-09): a natural spawn inside a safe zone never becomes a champion; the same spawn outside does.
       //   node tools/test-bds/run.mjs --quiet --flat --only elite_bp,zones_bp --scenario tools/test-bds/examples/elite-zone-convert.js --timeout 600
       ```

       Steps: `realm:cfg_set` `chance` to 1 and `nightOnly` false for `elite_bp` (as `elite-density.js`
       sets options); make a safe zone of radius 24 at x 300 the way `elite-storm-zones.js` does; summon 5
       zombies inside it by a natural-cause path the existing elite scenarios use (read `elite-density.js`:
       if they spawn with `spawnEntity`, the cause is not `Spawned` and `convert` never runs; in that case
       call the conversion through the hook they use, or add to `elite_bp`'s existing debug event one action
       `convert` that runs `convert(entity)` for the nearest zombie to a point, guarded like its other debug
       actions); after 40 ticks none has the tag `realm:champion`; repeat at x 600 outside any zone: at
       least one has it.
- Edge cases:
  - A caravan called by an operator with spots set: nothing changes.
  - A visit saved before this version has no `told`: operators are told once more, then it is saved.
  - Spawn in the middle of an ocean: no good column within 16 blocks, the caravan stands where it does
    today and the operator line says how to fix it.
  - `lateHours` set by hand to a positive number in `config.js`: honored as before.
  - A tablet tapped by a player Land Claims refused: `ev.cancel` is already set, nothing opens (today it
    opened on the after event; that is the fix working, not a regression).
  - The innkeeper stands in a 1 x 1 hole: `bedSpot` returns their own block, as today.
- Acceptance: `npx tsc -p .`, `node tools/check-ascii.mjs`, `node tools/check-ids.mjs`,
  `node tools/check-events.mjs` pass; the two new scenarios and `caravan-traders.js`, `caravan-news.js`,
  `atlas.js`, `elite-density.js`, `waystone-trips.js` pass with their header commands.

### T11 Wire-up and docs

- Owns: every `manifest.json` of the changed packs, every `packs/*/scripts/diag.js` (generated),
  `docs/PACKS.md`, `README.md`, `CLAUDE.md`, `docs/NEWS.md`, `release/notes.json`, `ROADMAP.md`,
  `docs/specs/realm-rework/README.md`, `packs/help_bp/**` and `packs/admin_bp/scripts/catalog.js`
  (generated), `packs/news_bp/**` (generated), this spec file (deleted), and in `nishant/skills`:
  `MANUAL-STEPS.md`.
- Reads (does not edit): everything T1 to T10 changed.
- Depends on: T1 to T10.
- Change:
  1. Merge `master` in. Raise `header.version` (patch + 1, or minor + 1 where marked) in the manifest of:
     `npc_bp` (minor), `town_bp` (minor), `wander_bp` (minor), `bounty_bp` (minor), `quests_bp` (minor),
     `party_bp` (minor), `saga_bp`, `caravan_bp`, `atlas_bp`, `elite_bp`, `waystone_bp`, `calendar_bp`,
     `map_bp`, `goals_bp`, `expedition_bp`, `fishing_bp`, `admin_bp`. `help_bp` and `news_bp` are bumped
     by their generators. Then `node tools/sync-diag.mjs`.
  2. `node tools/sync-day.mjs --check`, `node tools/sync-lead.mjs --check`, `node tools/sync-zones.mjs --check`,
     `node tools/sync-cards.mjs --check`, `node tools/sync-settings.mjs --check`,
     `node tools/sync-events.mjs --check` all pass. `tools/bundle.mjs` `SHARED` holds `day.js` and
     `lead.js` (T1). `node --test tools/day-shared.test.mjs` passes in full now (the four defaults).
  3. `docs/PACKS.md`, one `## ` section at a time (`grep -n '^## ' docs/PACKS.md`, then `sed -n 'A,Bp'`;
     never open the file whole). In each changed pack's section update "what players see",
     `### How to use`, Commands, Configuration and Saved data:
     - **Townsfolk**: `What should I do next?` (U-1, U-2), the greeting after 3 days away, the letter after
       7 days, gift rules (replace the sentence that documents the sneak shortcut, near line 2179), gossip
       (newest 8 kept, the inn lists it, default chance 10), options `dayResetHourUtc`, `nextStep`,
       `awayDaysGreeting`, `awayDaysLetter`, `gossipKeep`; Saved data `npc:seen`, `npc:letter`.
     - **Town Projects**: the free board and `freeNoticeBoard`, tapping the board, the bell, residents
       talking, transformed residents; Saved data unchanged.
     - **Wanderers of the Wilds**: party mates, carried messages and story lines, an accepted wanderer
       waits through a restart for up to `acceptedLifeMinutes`, no spot on builds; `rec.m` in Saved data.
     - **Bounty Board**: the shared hour, `Still open from yesterday`, zones; Configuration `resetHourUtc`
       default 10 with the Commands and Configuration rows written for players ("default 10, `resetHourUtc`").
     - **Daily Quests**, **Story Questlines** (favors), each: the shared hour; Story Questlines also the
       `realm` field and `saga:realm_act`.
     - **Parties**: `/realm:party_rally` (a Commands row: "Call your party to where you stand; they get a
       chat line, a HUD line and a Minimap star for 5 minutes (`rallyMinutes`), once a minute
       (`rallyCooldownSeconds`)"), the menu button, options `rally`, `rallyMinutes`, `rallyCooldownSeconds`.
     - **Minimap**: the rally in the destination order.
     - **Merchant Caravan** (`lateHours` 0, placement), **Atlas of the Realm** (tablets),
       **Champions** (zones), **Waystones & Inns** (`newsKept` 10, the bed spot, town news in
       `Hear the news`, line 5019 and the table row at 5050), **Realm Calendar** (the story line, activities
       at Quill), **Community Goals**, **Expeditions**, **Fishing 2.0** (their button at the mayor, Reyes,
       Tobin), **Realm Configuration** (the Today entry).
     - **How the packs work together** (line 6777): add `realm:rally_ask` and `realm:rally` with the shapes
       of D-4 and the limits; the `realm` field of `realm:saga_progress`; `mates` on `realm:wander_spawn`;
       the `gossip_<kind>` kinds of `realm:sky_event`; a short part "One reset hour" (the `realm_cfg`
       objective, the participant, who reads it, that the four options are one value); and in the offer
       round's table the new buttons of U-11 and `What should I do next?`.
  4. `README.md`: the pack table rows of Parties (new command), Townsfolk, Town Projects, Bounty Board and
     Daily Quests where their summary changed. `CLAUDE.md`: in "Bundles", add `day` and `lead` to the list
     of shared modules; in the Commands block add
     `node tools/sync-day.mjs        # also sync-lead: copy tools/<name>-shared.js into the packs that use it`.
  5. `docs/specs/realm-rework/README.md`: replace the body of C6 with the two shapes of D-4 and the limits
     ("one call per party per 60 s, muted members cannot call, the spot within 32 blocks of the caller,
     `ticks` not `until`"); add to the C7 table the row
     `tools/lead-shared.js (cleanLead, whereText, leadKey, createLeads) | scripts/lead.js | 12 | npc, town, wander`
     and extend the `day-shared.js` row to `dayKey`, `shouldRoll`, `createDayClock`; delete the row of
     workstream 12 from the table; add to Backlog "No siege roll on the first night back (NPC-18)" and
     "Ignore the star's use in the tick of an NPC tap, if NPC-10 reproduces". Delete this spec file. If it
     is the last spec in the folder, delete the folder as the README says.
  6. `ROADMAP.md`: remove the entry named in this spec's header if the session created it; add the two
     Backlog items of step 5 under Ideas.
  7. `docs/NEWS.md`, a new entry at the top (plain ASCII):

     ```
     ## The town knows what you should do next

     - Townsfolk and mayors: tap anyone and pick "What should I do next?". They tell you who is waiting for you and which way to walk.
     - Back after a while? The first person you talk to tells you where you left off, and a letter from the one who is waiting may be in your mail.
     - Notice Boards: every town has one now. Tap its signs to see what there is to do today.
     - Parties: "Call my party here" in the menu, or ring a town's bell. Your friends get a star on their compass to your spot. Nobody is teleported.
     - Bounties, daily quests, favors and gifts now all start their day at the same hour, early in the morning. A bounty you are fighting or a cull you started is no longer taken away when the day turns.
     - Gifts: sneak-tapping a townsfolk never takes a tool, and asks first unless it is something they love or like.
     - Residents talk when you tap them. Wanderers pass on messages, and one who comes for your party says so.
     - The mayor has your daily quests, Reyes the expeditions, Tobin the fishing tournament.
     - Fixes: the caravan shows up for the week's first players and stands on dry ground, champions stay out of towns and claims, the inn's bed no longer puts you inside the innkeeper, and tapping an Atlas tablet no longer places your block on it.
     ```

  8. `release/notes.json`: `notes` gets

     ```
     "Townsfolk, mayors, Notice Boards, residents and wanderers now point at your next story step; a party can be called to one spot (no teleport); bounties, daily quests, favors and townsfolk days share one reset hour, 10:00 UTC by default, and a day roll keeps a bounty that is being fought or a cull in progress.",
     "Seventeen world fixes: gift safety, residents turned by lightning, wanderers for parties and across restarts, gossip that waits for returning players, the caravan's schedule and footing, champions and bounty targets out of protected land, the inn's bed, Atlas tablets."
     ```

     and `packNotes.<folder>` = `{ "version": "<the new header.version>", "notes": "<one sentence>" }` for
     each pack of step 1: `npc_bp` "What should I do next? at every townsfolk and mayor, a lead greeting
     and one letter for returning players, safe gifts, gossip that waits and reaches the inn, the shared
     reset hour."; `town_bp` "Free Notice Boards that open Today, a bell that calls your party, residents
     that talk, turned residents removed."; `wander_bp` "Party-aware wanderers, carried messages, accepted
     wanderers survive a restart, no spots on builds."; `bounty_bp` "The shared reset hour, bounties in
     progress carried over a day roll, no targets in protected land."; `quests_bp` "The shared reset hour;
     Daily quests at every mayor."; `party_bp` "/realm:party_rally: call the party to a spot."; `saga_bp`
     "Favors follow the shared reset hour; the realm's highest finished act is sent to other packs.";
     `map_bp` "The star follows a party call."; `caravan_bp` "Comes for the week's first players; dry, open
     ground without a set spot."; `atlas_bp` "Tablets no longer place the held block."; `elite_bp` "No
     champions in towns, claims or safe zones."; `waystone_bp` "A rented bed is beside the innkeeper; town
     news in Hear the news."; `calendar_bp` "The realm's story line; festival activities at Quill.";
     `goals_bp` "Community goals at every mayor."; `expedition_bp` "Expeditions at Warden Reyes.";
     `fishing_bp` "The fishing tournament at Old Tobin."; `admin_bp` "Call my party here on the Today screen."
  9. `nishant/skills` `MANUAL-STEPS.md` (follow "How Claude sessions edit this file" there): add under
     mc-packs the three real-client checks of "Release" below.
  10. Regenerate last, in this order: `node tools/help-catalog.mjs`, `node tools/admin-catalog.mjs` (bump
      `admin_bp` again only if the catalog changed after step 1), `node tools/gen-news.mjs`,
      `node tools/sync-diag.mjs`.
  11. Perf, before and after on the same machine (before: a second worktree at `origin/master`; after:
      this branch), each once:
      `node tools/test-bds/suite.mjs --perf 10,40 --perf-only npc_bp,town_bp,wander_bp,party_bp,map_bp,bounty_bp`.
      No pack may rise by more than 0.01 ms a tick at 40 players or cross its budget. Put the two tables in
      the PR body.
- Edge cases: `check-versions` fails for any pack whose files changed without a higher version or a
  `packNotes` entry: the list in step 1 is every pack this spec touches; if a task touched another pack,
  add it. `check-docs` fails for an undocumented option: every key of D-3 and of the tasks' `config.js`
  changes must appear in its pack's Configuration table.
- Acceptance: `npm run check 2>&1 | tail -30` and `npm run build 2>&1 | tail -3` pass;
  `npm run bundle -- --all` succeeds and
  `node tools/test-bds/run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/bundle-smoke.js`
  passes; `node tools/test-bds/suite.mjs --filter '^(npc-(lead|gift-safe|faces)|town-(board|resident-turned)|wander-(party|relog)|bounty-reset-grace|party-rally|caravan-spawn-ground|elite-zone-convert|day-scoreboard)$' --retry`
  has no `fail`.

## Waves

W1: T1, T2 · W2: T3 (needs T1, T2), T4, T5, T6, T7, T8 (each needs T1), T9, T10 · W3: T11 (needs all).

No file is owned by two tasks. One owner per `main.js`: `npc_bp` T3, `town_bp` T4, `wander_bp` T5,
`bounty_bp` T6, `saga_bp` T7, `quests_bp`, `goals_bp`, `expedition_bp`, `fishing_bp`, `calendar_bp` T8,
`party_bp`, `map_bp` T9, `caravan_bp`, `atlas_bp`, `elite_bp`, `waystone_bp` T10.

## Review focus

1. **The first day after the update** (D-2): read every comparison of a saved day with the new key in
   `bounty_bp`, `quests_bp`, `saga_bp`, `npc_bp`. None may be `===` or `!==`. Nothing rolls twice, nothing
   is lost, and no saved value is rewritten by the migration.
2. **The carry rule** (T6): a carried target is never removed while someone is within 96 blocks, is
   removed once they leave, a carried cull lives exactly one more day, and `sweep` cannot remove a live
   target of the current list.
3. **Gift safety** (T3): no path gives without the giftable test; the confirm re-reads the hand.
4. **Bundle behavior**: every new `beforeEvents` handler starts with `if (ev.cancel) return;` and cancels
   only its own blocks (the board's three signs, three Atlas kinds); the bell tap is not canceled.
5. **Rally limits** (T9): cooldown per party, muted members, the 32-block rule, no teleport anywhere, the
   Minimap reads a tag only while a rally exists.
6. **Saved data**: only the new keys of D-3; `saga:realm_act` did not exist before; the `realm_cfg`
   objective is created lazily and only on a write.
7. **Copy**: every line is ASCII, no line of the next-step form is wider than the form, no `.header()`.
8. **The story lane**: T7's diff in `saga_bp` is only what the task lists.
9. **Noise**: nothing new is said on join; the only new chat lines are answers to a tap, a call or a roll.

## Release

1. One PR to `master` in nishant/mc-packs, merged with a merge commit after `npm run check`,
   `npm run build` and an integration review. Not alongside workstream 10 (it bumps every pack).
2. The `release` workflow publishes, regenerates the realm page, merges the hosting PR and runs
   check-live. Wait for it; read its job summary. A failure on `releases/download` with HTTP 5xx:
   `gh run rerun <id> --failed`.
3. `validate.yml` runs after the merge: read its `perf-report` issue for `npc_bp`, `town_bp`, `wander_bp`,
   `party_bp`, `map_bp`, `bounty_bp`.
4. Owner's real-client checks (added to `MANUAL-STEPS.md` by T11; the harness cannot do them):
   - **NPC-10**: on touch, a controller and a mouse, hold the Realm Menu star and tap Elsie. One menu must
     open (hers). If the Realm Menu opens too, say so: the follow-up is in Out of scope.
   - **NPC-20**: walk beside a wanderer on the road for 20 blocks and watch the name above their head. If
     it lags behind the head, say so.
   - **The board and the bell**: tap a Notice Board sign on a phone (Today must open, not a sign editor),
     and tap a Bell Tower's bell while in a party of two (it must ring, and the other player must get the
     star).
5. Verify live: the realm page lists the new versions; in game `/realm:bounty_list` shows
   `New bounties in ...` counting to 10:00 UTC; `/realm:config`, Bounty Board and Daily Quests show the
   same `New day at (hour, UTC)`.
6. The summary to the owner ends with the line the repo's `CLAUDE.md` asks for (site up to date, the Realm
   Bundle and Realm Resources versions live).

## Open questions for the research phase

Facts only; each has a default if it cannot be settled.

1. Do named (string) scoreboard participants work on BDS 1.26 with `@minecraft/server` 2.1.0
   (`setScore("name", n)`, `getScore("name")`, `removeParticipant("name")`)? T1 step 1 settles it. If
   not, the fallback keeps `scripts/day.js` and its API and moves the value into a script event:
   `realm:day_reset { hour, from }`, sent by the pack whose option was changed, and at load (answering
   `realm:day_reset_ping`) by every pack that holds an explicit value, the lowest folder name winning;
   `createDayClock` then also takes `onScriptEvent` and `send`. Report before building it.
2. The shape of an entry of the `today` screen in the shipped `packs/admin_bp/scripts/menu.js` and the
   exact signature of `createCards` in `tools/cards-shared.js` (09). T9 copies a neighbor.
3. Does lightning turn a villager into a witch on the BDS harness within 100 ticks, with the spawn cause
   `Transformed` and the name tag copied? `town-resident-turned.js` logs the answer.
4. Does `realm:map_state` (the Minimap's debug answer) carry the current destination? If not,
   `party-rally.js` checks the strip text instead.
5. Which existing `elite_bp` scenario or hook makes a natural-cause spawn (cause `Spawned`) on a flat
   world, for `elite-zone-convert.js`?
6. Three drafted townsfolk lines need flags that `saga_bp` does not send to Townsfolk today: Elsie's
   "Before the seals, love. Room three." (`inn_ghost` finished), Elsie's "{n} lit." (a count of seals),
   Bram's "They keep asking me what the comet means." (`act2_choir.mayor`). They are not built here; the
   story lane can add the flags to `NPC_FLAGS` (`packs/saga_bp/scripts/main.js:155`) and the lines to
   `REACTIONS`.
7. Is `realm:menu_open` answered when the player has another form open, or dropped? If dropped, the board
   tap needs no retry of its own (the player taps again).
