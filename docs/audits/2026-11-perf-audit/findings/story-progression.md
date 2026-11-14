# Story and progression: performance findings

Scope read (all under `packs/`, worktree at master `68095de5`). This replaces the first pass: every finding below was
re-derived from the code, and the first pass's leads are either kept under their old id (with counts and costs
corrected) or listed under "Rejected leads".

- `saga_bp/scripts/`: `main.js`, `data.js`, `actors.js`, `scale.js`, `champions-session.js`, `stories/index.js` in
  full; `objectives.js` about 90% (everything but the vision and riddle dialogs at `:2913-3080`); `places.js` about
  60% (saved places, `locate`, picking, snapshots and restores, the search and build jobs, camps, `autoTick`; not the
  operator preview and menus); `ui.js` about 45% (NPC lookup, offers, the whole tracker and quest box, the story log
  pages; not the dialogs and chapter accept and report flows); `party.js` `partyTick`; `wander.js` housekeeping and
  the state sender; `util.js` `groundAt`, the form watcher. Story text not read (by instruction): the story files
  were measured with greps only (11,808 lines, about 60 stories, 687 objectives, 45 `{far:}`-style tokens).
- `calendar_bp/scripts/main.js` about 75% (day clock, saved data, festival watchers, Nest Watch, regatta, every siege
  function, all event handlers, loops, load and join; not the stall and menus).
- `skills_bp/scripts/main.js` in full but the menus; `calling.js` about 65% (state, talents, glow, the hurt handler,
  the Sigil and its abilities, loops, join; not the choose and reset menus).
- `stats_bp`, `quests_bp`, `milestones_bp` `main.js` in full.
- `relics_bp/scripts/main.js` about 60% (lookup, weather, found set, gifts, carried scan, passives, the hurt, effect,
  die and interact handlers, the use handlers; abilities and forge menus only grepped for queries and loops).
- `journal_bp` about 80%, `titles_bp` about 65%, `guilds_bp` about 60%, `crowns_bp` about 45% plus `ledger.js` and
  `names.js` in full, `party_bp` about 40%, `mail_bp` about 45%, `goals_bp` about 50%, `slots_bp` block handlers and
  the machine list, `cooking_bp` about 55% (inventory counting, owed dishes, join, cooking, eating, foraging, every
  handler, the pot menu), `fishing_bp` about 65% (weather, `placesAt`, catches, hooks, tournament, join, load).
- `domt_bp`: `effects.js` about 25% (timers, temp mobs, load and die handlers, the timed cards found by grep),
  `events.js` about 45% (arena, spore field, rainbow name, join), `helpers.js` about 45% (fire scan, far teleport,
  restore tasks), `main.js` join only.
- `tools/owed-shared.js`, `prune-shared.js`: greps only, to confirm they never list every key.

Unit costs used: the brief's (10 us per native call, 1.8 us per `getItem`, 0.2 us for `player.id`). Where a getter is
probably as cheap as `player.id` I give a range. Nothing here was run: every cost is counted from the code.

## Summary

The steady loops in these packs are well tended (caches, change-only sends, dirty flags, staggered saves), and the
soak figures for them are honest for idle players. The cost is in what the soak never does:

1. **Fishing**: Fishing Rewards reads 27 blocks around every live bobber every tick, about 58 native calls a tick per
   fishing player, about 20,000 per catch (PRG-01). Four more packs follow the same hook (PRG-06).
2. **A player who plays**: one broken block is 49 native calls across 8 handlers in these packs, of which 9 do work
   (PRG-02); one mob killed by a player is 61 across 10 handlers (PRG-32); a mob that dies with no player near still
   costs 14.
3. **A player on a quest** costs Story Questlines roughly ten times an idle one, more near a quest spot (27 particles
   and about 150 native calls a second) and much more in a stealth scene (PRG-30). Their save is stringified and
   walked character by character twice every 5 seconds (PRG-31).
4. **Saved data**: Skills rewrites its whole placed-block set (up to 150 KB in 9 world properties) every 30 s while
   anyone builds, and remembers every block placed, not only the ones that could give XP (PRG-09); Daily Quests
   writes on every counted block (PRG-03); Milestones writes a world record per moving player every 10 s and never
   prunes one (PRG-11). The map of every key is in PRG-37.
5. **Spikes**: the Kitchen's pot menu makes 13,000 to 18,000 native calls to open (PRG-34); Story Questlines and
   Realm Calendar re-run the 4,556-callback installed-packs census every 10 and 5 minutes, in the same tick
   (PRG-33); three Deck cards read 1,100 to 4,000 blocks in one tick (PRG-35).

Nothing here hangs a server of the Realm's size. On a public server the first-join load of Milestones and the Stats
boards (PRG-04, PRG-11) are the ones that grow with players ever seen.

## Findings

### PRG-01 Fishing Rewards scans 27 blocks around every bobber every tick  [high / confirmed / S / low]
- Where: `packs/fishing_bp/scripts/main.js:711-736` (per-tick hook loop) calls `clearLightBlocksNearHook`
  (`:549-569`) at `:716`; also once per hook spawn at `:600`.
- What happens and how often: every tick, for every live fishing hook in the world, a 3x3x3 loop of `dim.getBlock`
  plus `b.typeId`, looking for `rdl:light_block*` blocks that a third-party add-on (Dynamic Lightning) may have put
  there. Counted per hook per tick: `hook.location`, `hook.dimension`, 27 `getBlock`, 27 `typeId`, then `isValid`
  and `location` again at `:714-717`: 58 native calls. A bobber sits 5 to 30 s per catch.
- Cost estimate: 58 calls a tick per fishing player, 0.12 to 0.58 ms a tick each (2 to 10 us a call); about 20,000
  calls per catch at an average 17 s wait. Four players fishing: 0.5 to 2.3 ms a tick, more than the bundle's
  whole idle floor. Not measured: no scenario keeps a rod cast.
- Fix: (a) at world load, `BlockTypes.getAll().some((t) => t.id.startsWith("rdl:light_block"))`; when false (the
  Realm, unless that add-on is installed) never scan. (b) When the add-on is there, scan only while the bobber is 1
  to 10 ticks old (the comment says the problem is a bobber that spawns inside a light block), which the loop
  already knows as `age`. (c) When it does run, one `dim.getBlocks(new BlockVolume(min, max), { includeTypes },
  true)` instead of 54 calls.
- Prove it with: a new `fishing-perf.js` (N players each with a rod cast over water for 120 s, `--profile`),
  fishing_bp before and after; `saga-fish-drop.js` for behavior.

### PRG-02 One broken block: 49 native calls in 8 handlers, 9 of them useful  [medium / confirmed / S / low]
- Where, for a plain block (dirt) broken in survival by a player with no matching quest, counted call by call:

  | Handler | Native calls | What they are |
  |---|---:|---|
  | `saga_bp/scripts/objectives.js:1360-1382` | 16 | `block.dimension.id` and `block.location` read twice (`:1362`, `:1376`), `brokenBlockPermutation.type.id`, `player.id` twice, and `counting()` (`:75-83`: `isValid` + `getGameMode`) three times: in `advance("interact")`, at `:1407`, in `advance("mine")`. `counting()` runs before `open()` says whether any such objective exists |
  | `quests_bp/scripts/main.js:329-341` | 14 | `perm.type.id` twice (`:331` and in `ripe`), `block.dimension.id` twice, `block.location` four times (`:332`, then `.x`, `.y`, `.z` at `:333`), `active()` (`isValid` + `getGameMode`) before the cached quest list is asked |
  | `stats_bp/scripts/main.js:88` -> `add` `:38-45` | 5 | `isValid`, `world.scoreboard`, `getObjective` (not cached, plus a `STATS.find`), `player.name`, `addScore` |
  | `milestones_bp/scripts/main.js:140` -> `add` `:103-108` | 4 | `isValid`, `player.id` twice, `player.name` (a name compare on every count) |
  | `guilds_bp/scripts/main.js:572-576` | 3 | `getGameMode` before the `ores`/`crops` test |
  | `slots_bp/scripts/main.js:692-693` | 3 | `dimension.id`, `block.location` with no machines placed |
  | `skills_bp/scripts/main.js:564-569` | 2 | correct early return |
  | `cooking_bp/scripts/main.js:882-884` | 2 | correct early return |

  Starting to mine also fires `entityHitBlock`: `saga_bp/scripts/objectives.js:1460-1470` adds 10 (it then skips 7
  of its 16 above). A stone block adds about 20 in Skills (`award` at `:242-266` calls `active()` twice, checks the
  objective's `isValid` twice and reads the score twice). A placed block is 27: saga 7 (`:1335-1345`, all read
  before `open`), quests 6, stats 5, milestones 4, skills 4, guilds 1.
- A tap on a block (`beforeEvents.playerInteractWithBlock`, about 5 a second while a player holds use to build):
  about 35 calls on the first event and 25 on repeats across 7 handlers (skills `main.js:601` and `calling.js:789`,
  quests `:344`, guilds `:604`, relics `:1286`, slots `:669`, cooking `:938`, which destructures `itemStack` and
  reads `typeId` and `isSneaking` for every block).
- How often: a player in stone with Efficiency V breaks 5 to 10 blocks a second; builders place and tap several.
- Cost estimate: 0.1 to 0.5 ms per broken block; four players mining at 8 blocks a second is 1,570 calls a second,
  0.16 to 0.8 ms a tick. Not measured: the soak breaks nothing.
- Fix (no behavior change): saga: read the block's dimension id and location once; in `advance()` and at `:1407`
  ask `byType(player).get(type)` first and return when it is empty; call `counting()` once per event. quests: read
  location and dimension once, compute `perm.type.id` once, and in `progress()` test the cached list (`wants`)
  before `active()`. stats: cache the 9 objective handles in a `Map` (re-fetch when `!o.isValid`, as
  `skills_bp/scripts/main.js:72-84` does). milestones: read `player.id` once; compare the name on `playerSpawn`
  only. guilds: test `ores.has(id) || crops.has(id)` first. slots: `if (!machines().length) return;` first in both
  handlers. Then XC-06's `blockTypes` filters for the packs with fixed lists (skills, guilds, cooking).
- Prove it with: the churn scenario XC-06 asks for (a break loop and a place loop under the profiler), reported per
  pack; `quests-party.js`, `skills-passive.js`, `guilds-placed-restart.js` for behavior.

### PRG-03 Daily Quests writes the player's quest property on every counted block, kill or catch  [medium / confirmed / S / low]
- Where: `packs/quests_bp/scripts/main.js:131-155` (`progress`), `save` at `:80-83`.
- What happens and how often: every event that counts toward an open quest ends with `JSON.stringify(day)` and
  `player.setDynamicProperty`, and (when the quest is not finished by it) a `getFor(player, "progressNotes")`, which
  is another property read and `JSON.parse` (XC-04). A "mine 64 stone" quest writes 5 to 10 times a second.
- Cost estimate: 2 property calls, one stringify and one parse per counted event, on top of PRG-02's 14.
- Fix: keep the cached `day` as the truth; mark the player dirty; flush every 5 s, on quest completion (before the
  reward is given) and in `beforeEvents.playerLeave`. Risk: a crash loses up to 5 s of quest progress.
- Prove it with: `quests-party.js`; a count of `setDynamicProperty` calls per minute in the churn scenario.

### PRG-04 The Stats ticker reads a whole board every 5 s per shown stat; boards never lose a name  [medium / likely / M / medium]
- Where: `packs/stats_bp/scripts/main.js:378-401` (`tickerPlace`, cached `RANK_TICKS` = 100) ->
  `rankedInfo` `:535-565`; names added by `add` `:38-45`, removed only by the v1.0.0 migration.
- What happens and how often: the default ticker style is "full" ("#2 of 9", `config.js:30`) and the ticker is on by
  default (`config.js:21`). For each stat some online player's ticker is showing, once per 5 s, `getScores()`
  returns every participant and the loop reads `score`, `participant`, `type` and `displayName`: 4 calls per name
  with a score. Players' tickers are on different stats (5 by default), so up to 5 rebuilds per 5 s. This was
  already improved once (one read per stat per 5 s instead of per player; `stats-ticker-scale.js` exists); what is
  left is the size of one rebuild.
- Cost estimate: at the Realm's 30 to 50 names, 120 to 200 calls per rebuild, already inside the measured 0.093 ms.
  At 1,000 names (a public server's visitors), 4,000 calls in one tick per rebuild, up to five ticks per 5 s: a 4 to
  40 ms burst each. Not measured at that size after the last change.
- Fix: keep a per-stat `Map<name, score>` loaded once (in a `system.runJob` after world load) and updated in `add()`
  (stats is the only writer of its 9 objectives), with the sorted score list patched by binary insert; never call
  `getScores()` from the ticker. Reload from the board every 10 minutes for operators who edit scores by command.
  Separately prune names not seen for `forgetAfterDays` with `removeParticipant` (see PRG-27).
- Prove it with: `stats-ticker-scale.js` (`names=1000`), `--profile`, max tick before and after.

### PRG-06 Five packs each follow every fishing hook and inspect item spawns for the same catch  [medium / confirmed / M / medium]
- Where: `skills_bp/scripts/main.js:671-755`, `journal_bp/scripts/main.js:570-617`, `quests_bp/scripts/main.js:456-503`
  (all every tick), `saga_bp/scripts/objectives.js:1490-1530` (every 2 ticks), `fishing_bp/scripts/main.js:597-736`.
- What happens and how often: each pack keeps its own `hooks` map. Skills, Journal and Fishing track every hook;
  Quests and Saga only for a player with a fishing step. Per live hook per tick: `isValid` + `location` in each (2
  calls x 3 or 4 packs), plus two `isWater` probes every 4 ticks until wet. On every `minecraft:item` spawn anywhere
  while any hook is out, each pack reads `getComponent("minecraft:item").itemStack` (an ItemStack copy) before it
  checks whether the item is near a hook: 3 to 6 calls per pack per item, 15 to 25 across the five. A player mining
  or a mob farm near a fisher fires this for every drop.
- Also: all 8 `entitySpawn` handlers in this track (`saga_bp/scripts/actors.js:278`, `:395`, `objectives.js:1490`,
  skills, relics `:248`, quests, journal, fishing) run for every entity spawned; six of them read `entity.typeId`
  twice (`=== hook`, then `!== item`): 13 native calls per spawn of anything.
- Cost estimate: 8 to 10 calls a tick per fishing player besides PRG-01; 13 per entity spawn always; 15 to 25 more
  per item spawn while someone fishes. Not measured.
- Fix: short term, in each handler read `typeId` once into a local, and for the item branch compare
  `entity.location` and the dimension with the hooks first and only then read the item component. Longer term,
  Fishing Rewards (or, when it is absent, Skills) sends one `realm:fish_caught { player, item, dim, x, y, z }` per
  catch and the others listen; each keeps its own tracker only as a fallback when no such event was heard since
  load. Risk: the packs' catch tests differ slightly today (distance 2 or 3, minimum hook age); pick one.
- Prove it with: `fishing-perf.js` (PRG-01), `saga-fish-drop.js`, `journal-extras.js`, `skills-passive.js`.

### PRG-07 A loaded entity costs about 11 native calls in four handlers  [medium / confirmed / S / low]
- Where: `saga_bp/scripts/actors.js:328-340` (shared label check, `typeId`, `id`, two `hasTag`),
  `saga_bp/scripts/main.js:718` -> `objectives.js:3860-3870` (`hasTag`), `calendar_bp/scripts/main.js:1920-1927`
  (two `hasTag`), `domt_bp/scripts/effects.js:323-330` (`isValid`, `hasTag`, `typeId`, and for item entities the
  item component and its lore).
- What happens and how often: every entity that loads with a chunk. A player flying or riding into new chunks
  loads tens to hundreds of entities a second in bursts.
- Cost estimate: 11 calls per entity plus 4 wake-ups; 200 entities in a second is 2,200 calls, 4 to 22 ms in that
  second. Not measured: the soak loads no chunks.
- Fix: one `entity.getTags()` per handler and test in JS; merge saga's two subscriptions into one; in domt read
  `typeId` first and call `hasTag` only for types `tempMob` can make.
- Prove it with: a scenario that teleports a player across 20 populated chunk areas, `--profile` saga, calendar, domt.

### PRG-09 Skills remembers every placed block and rewrites the whole set every 30 s  [medium / confirmed / S then M / low]
- Where: `packs/skills_bp/scripts/main.js:469-477` (marks every block placed, except crops with a growth state),
  `:396-402` (`markPlaced`), `:378-390` (`savePlaced`, every 600 ticks), `PLACED_MEMORY` 10,000 at `:33`.
- What happens and how often: `savePlaced` copies the `Set` to an array, slices it into 1,200-key pieces and writes
  every piece whenever one key changed. The set is in least-recently-placed order, so at the cap every piece's text
  shifts on every placement. The break handler (`:564-569`) only consults the set for blocks that give XP (stone
  family, ores, logs, melons, pumpkins); the piston handler (`:479-494`) already marks only those. The place handler
  marks dirt, planks and glass too, so any builder fills the set and it stays full for good.
- Cost estimate: at the cap, 10,000 keys of 12 to 18 characters: about 150 KB of strings and 9
  `world.setDynamicProperty` calls of about 17 KB each, every 30 s while anyone builds; a 1 to 3 ms tick, and
  150 KB of the world's saved properties changed each time. Not measured.
- Bug found on the way: Skills saves the set only on the 30 s timer. Guilds also saves on `playerLeave`
  (`guilds_bp/scripts/main.js:651-652`, "a Realm closes soon after the last player leaves"); Skills does not, so
  logs placed in the last 30 s before the Realm closes give XP again after a restart.
- Fix: (S) mark only blocks that can give XP: `mineBlocks.has(id) || logs.has(id) || (crops.has(id) && no growth
  state)`, the piston handler's test; call `savePlaced()` on `playerLeave`. (M) save as a ring: new keys go to the
  current piece only, a full piece starts the next index and the oldest piece is dropped whole, with one dirty flag
  per piece, so a placement rewrites one piece, not nine. The same ring fits Guilds (`guilds_bp/scripts/main.js:
  405-441`, 5,000 keys), which is far less urgent: it marks only ores and stateless crops, so it is rarely dirty.
- Prove it with: `skills-passive.js` and `guilds-placed-restart.js` for behavior; a profiler run with one player
  placing a block every tick for 120 s, counting bytes written to `skills:placed*`.

### PRG-11 Milestones: a world record per player ever seen, loaded in the first join's tick, rewritten every 10 s  [medium / confirmed / S / low]
- Where: `packs/milestones_bp/scripts/main.js:58-77` (`records()`), `:152-156` (join calls `add`, which calls
  `records()`), `:321-345` (check and flush every `checkSeconds` = 10), `:94-100` (`flush`).
- What happens and how often: (a) the first join after a world load lists every dynamic property key in the store
  (`getDynamicPropertyIds()`: in the Realm Bundle that is every pack's keys) and reads and parses every
  `milestones:p:<id>` record, in the `playerSpawn` tick. (b) Nothing ever removes a record: there is no
  `forgetAfterDays` and no `prune.js` here, unlike Titles and Parties. (c) Every 10 s each online player whose
  counters moved (anyone walking: distance counts every second) has the whole record stringified and written as a
  world property, about 300 bytes, 6 world writes a minute per active player. (d) The pack counts the same nine
  stats as Stats (its own per-second position pass and per-event adds) and then takes the larger of the two.
- Cost estimate: (a) 1,000 past visitors: 1,000 reads and parses, 15 to 30 ms in the first join's tick; tens of
  players: under 1 ms. (c) 60 world writes a minute at 10 players.
- Fix: load one record on demand in `recordOf` (the key is known from the player id) and build the full list, in a
  `system.runJob`, only when "Another player's milestones" is opened; prune with the shared `prune.js` as Titles
  does (`titles_bp/scripts/main.js:337-361`); flush a record when a tier changed, on leave and otherwise every 60 s.
  The first pass listed Mail, Goals and Parties with this: see "Rejected leads".
- Prove it with: `milestones-list.js` seeded with 1,000 records (the pack's `fill` test hook), profiler max tick at
  the first join; `milestones-title-ack.js` for behavior.

### PRG-30 A player on a quest costs Story Questlines about ten times an idle one  [medium / likely, not measured / S to M / low]
- Where: `packs/saga_bp/scripts/main.js:99-120` (per-player loop; players with no entries `continue` at `:107-110`,
  which is all the soak measures: 0.107 ms at 40 players is 2.7 us a tick per idle player),
  `objectives.js:3532-3711` (`tickPlayer`), `:350-371` (`questGuides`), `:202-233` (`drawStandingPad`),
  `ui.js:1356-1399` (`track`), `:91-104` (`npcAt`), `data.js:739-748` (`countdown`).
- What a questing player pays, counted from the code (3 chapters going, 4 open steps):

  | Part | Per player | Native calls |
  |---|---|---|
  | `tickPlayer` base | every second | 6 |
  | `questGuides` for each open step with a spot | every second | 4, of which one is `getFor("spotGuides")` (a property read and `JSON.parse`, XC-04) made before the distance test at `:357`/`:367` |
  | Standing within 40 blocks of a spot | every second | 15 particles, 2 new `MolangVariableMap` (8 calls); for vigil, survive, defend and place steps a ring of 12 more particles, each with a `groundAt` column probe (`util.js:244`, 3 `getBlock` and about 5 getters): about 150 calls and 27 particle packets a second |
  | Tracker and quest box | every 2 s and after each progress | 2 `getFor`; one whole-dimension `getEntities({ tags })` per townsfolk it points at (`npcAt`, cached 2 s); a `new RegExp` per step label per call (`countdown`, 2 to 3 calls per step); `layoutBox` (`ui.js:1566-1597`) walks the box text character by character on each pass of its fitting loop; a `realm:side` event whenever the text changed, which is every time while walking (the distance is in it) |
  | A survive, vigil or ride step counting | every second | `bump` (`objectives.js:437-479`): 2 `getFor`, `markDirty`, so a save every 5 s (PRG-31) |
  | A champion step near its place | every second / 10 s | `watchAdds` and `championAlive`: `getEntities({ tags })` over the whole dimension (`:997`, `:1139`) |
  | A stealth scene | every tick | each guard within 32 blocks is teleported every tick (`patrol`, `:2164-2216`; the code's own figure is 80 us a teleport): 0.16 ms a tick with 2 guards, 0.64 with 8. Measured and tuned before (`saga-stealth-perf.js`); listed so the total is honest |
  | An escort | every 2 ticks | one teleport and a label sync |
  | A named story character present | every 2 ticks | the shared name-label sync runs (`actors.js:165-183`) instead of once per 5 s |

- Cost estimate: 25 to 40 native calls and 4 to 6 preference parses a second for an ordinary questing player, about
  0.02 to 0.03 ms a tick each against 0.003 idle; about 0.1 ms a tick while standing near a zone spot; more in a
  scene. Ten players questing: 0.2 to 0.3 ms a tick, above the 0.15 ms a typical pack is budgeted, well inside the
  bundle's budget. Not measured in the soak; `saga-perf-quests.js` measures exactly this workload.
- Fix: (1) in `questGuides`, test the distance before `guidesOn(player)`; XC-04's cache removes the rest of the
  `getFor` cost. (2) Build the guide `MolangVariableMap`s once per color and style at module level (they are never
  changed after `guideVars`). (3) Cache the ring's 12 ground heights per objective key and spot for 10 s. (4) In
  `npcAt`, keep the entity handle and read `ent.location` while `ent.isValid`; query again only when it is not, or
  every 30 s. (5) Memoize `countdown` per objective and count (one small `Map` per objective, cleared on change).
  (6) In `layoutBox`, add byte lengths per line instead of re-walking the joined text, and skip the byte test when
  `text.length * 3 <= BOX_BYTES` as `clipTo` already does. (7) Give `watchAdds` and `championAlive` a `location`
  and `maxDistance`.
- Prove it with: `saga-perf-quests.js` at 10 and 40 players (`--profile`), before and after each step;
  `saga-quest-box.js`, `saga-quest-wrap.js`, `saga-quest-log.js` for the box text; `saga-stealth-perf.js`.

### PRG-31 Story progress is stringified and walked twice in JS on every flush  [medium / needs-measurement / S / low]
- Where: `packs/saga_bp/scripts/data.js:405-429` (`flush`), `:342-374` (`trimSave`), `:323-335` (`byteLength`, a
  `charCodeAt` loop over the whole JSON); called for every dirty player in one tick every 5 s (`main.js:77`).
- What happens and how often: `trimSave` stringifies the whole save (up to 30,000 bytes: every story's state, flags,
  choices, codex ids, favors) and runs `byteLength` over it; `flush` runs `byteLength` over it again at `:415`. Any
  progress marks the player dirty, so a player on a counting step flushes every 5 s.
- Cost estimate: two interpreted passes over the JSON: about 0.1 to 0.3 ms per KB of save (estimate from the loop's
  length, not measured), so 1 to 3 ms for a 10 KB mid-game save, for each dirty player, in the same tick.
- Fix: return the byte count from `trimSave` and reuse it; skip the count entirely when `json.length * 3 <=
  SAVE_LIMIT` (under 10,000 characters it cannot exceed the limit); above that, count the non-ASCII characters
  with a regular expression (native) instead of a JS loop. Flush players on different seconds (hash of the id, as
  the tracker's `idSlot` does) so ten dirty players do not share a tick.
- Prove it with: a unit test for the byte count (ASCII, section signs, surrogate pairs) against the old function;
  `saga-perf-quests.js` with a survive step running, profiler max tick.

### PRG-32 One mob kill: 61 native calls in 10 handlers; 14 for a death no player caused  [medium / confirmed / S / low]
- Where, for a zombie killed by a survival player with no quest that counts it:

  | Handler | Calls | Notes |
  |---|---:|---|
  | `skills_bp/scripts/main.js:629-652` | 19 | `award` (`:242-266`): `active()` twice, objective `isValid` twice, the score read by `xpOf` and again by each of two `perkOf` calls |
  | `saga_bp/scripts/objectives.js:1283-1326` | 12 | reads `getTags()`, `location`, `dimension.id` before looking at the killer (6 calls for every death, PRG-18); then `typeId`, `nightMet()` (3 calls: game rule and time of day, PRG-20), `counting()` |
  | `quests_bp/scripts/main.js:382-392` | 7 | `active()` twice, `getTags()` for party sharing even with no kill quest |
  | `stats_bp/scripts/main.js:91-99` | 6 | PRG-02's uncached objective |
  | `milestones_bp/scripts/main.js:142-148` | 5 | |
  | `guilds_bp/scripts/main.js:625-634` | 5 | |
  | `journal_bp/scripts/main.js:331-341` | 3 | cache-first, fine |
  | `cooking_bp/scripts/main.js:923-934` | 3 | reads and parses the `cooking:moon` world property on every hostile kill (`moonIs`, `:840-846`) |
  | `party_bp/scripts/main.js:509-511` | 1 | wants players only |
  | relics `:1042`, calendar `:1901`, domt `events.js:186` | 0 | return on a JS test, but are still woken |

  A mob that dies with no player killer (a farm's fall or drowning kills): saga 6, and 1 each in stats, milestones,
  skills, quests, journal, guilds, cooking and party: 14 calls and 10 wake-ups.
- Cost estimate: 0.1 to 0.6 ms per player kill; a farm killing 20 mobs a second with nobody hitting them is 280
  calls a second, about 0.03 to 0.14 ms a tick, for nothing. Not measured.
- Fix: saga: read `damageSource.damagingEntity` and test `actors.get(id)` and `sessionChampion(id)` (both JS)
  first; read the tags only when one of them holds (a tagged champion this session did not spawn is removed when it
  loads, so the session set is enough); make `night` lazy. skills: resolve `active`, the objective and the score
  once per `award` and pass the level to `perkOf`. quests: one `active()`; skip `partyMatesNear` when the killer has
  no open kill quest. cooking: keep the moon state in memory (update it where the pack writes the property).
  party, relics, domt `events.js`: subscribe with `{ entityTypes: ["minecraft:player"] }` (PRG-19), as
  `domt_bp/scripts/effects.js:210` does.
- Prove it with: XC-06's kill loop under the profiler, per pack; `skills-passive.js`, `quests-party.js`.

### PRG-33 Two packs re-run the installed-packs census on a timer, in the same tick  [medium until XC-01, then low / confirmed / S / low]
- Where: `packs/saga_bp/scripts/main.js:303-339` (`scanPacks` every `PACK_SCAN_EVERY` = 12,000 ticks),
  `packs/calendar_bp/scripts/main.js:2436-2439` (`broadcast()` and `scanPacks()` every 6,000 ticks; `:164-171`).
- What happens and how often: each scan sends `realm:help_ping`; 67 packs answer; XC-02 counts 4,556 callbacks per
  census. Both intervals are registered at load, so every 10 minutes both censuses and the calendar broadcast fire
  in one tick: about 9,200 callbacks. The set of installed packs cannot change without a world restart or a
  `/reload`, which restarts every script.
- Also: on every join Realm Calendar sends `realm:calendar` and `realm:saga_progress_ping` 60 ticks later
  (`:2485-2495`); Saga answers the first by invalidating every online player's cached chapter list
  (`saga_bp/scripts/main.js:284-290`), though the day did not change.
- Cost estimate: 45 to 90 ms of callbacks in one or two ticks every 10 minutes at XC-02's 5 to 10 us each.
- Fix: scan once after world load and once more 10 s later (a slow start), then never; in a bundle read XC-02 (b)'s
  pack list instead. In Saga's `onCalendar`, invalidate only when `day`, `season` or `festival` changed.
- Prove it with: the slow-tick record over a 15 minute bundle soak; `saga-world-hooks.js`, `calendar.js`.

### PRG-34 The Kitchen's pot menu counts the whole inventory up to four times per known recipe  [medium / confirmed / S / none]
- Where: `packs/cooking_bp/scripts/main.js:1079-1085` (`potMenu`), `:1071-1077` (`cookable`), `:1049-1060`
  (`recipeList`), `:342-360` (`haves`, `timesAffordable`), `:385-392` (`missingText`).
- What happens and how often: each tap on a cooking pot, and each return from a recipe page to the list.
  `servingsNow` runs once per known dish in `cookable`, again in the `ready` filter, again per button, and
  `missingText` once more for each dish that cannot be cooked. Every one of those reads all 36 slots (`getItem`) and
  tests each stack against each need (`typeId`, `nameTag`, for rare ingredients the lore).
- Cost estimate: about 166 native calls per count; 81 to 108 counts with all 27 dishes known and a full inventory:
  13,000 to 18,000 calls in one tick, 30 to 180 ms. With only the basic recipes, about 3,000.
- Fix: read the inventory once per menu draw into `Map<need id, amount>` (plain items by type when unnamed, rare
  ingredients by `ingOf`) and compute every dish's servings and missing list from the map: 36 `getItem` and about
  100 getters in all.
- Prove it with: `cooking-early.js` and `cooking-windows.js` for behavior; profiler max tick while opening the pot
  with a full inventory.

### PRG-37 Saved data: what each pack keeps, how big, how often written  [medium / confirmed / M / saved-data migration for some]
- Where and what (world = one shared store in the bundle; player = saved with that player):

  | Pack | Key | Size and growth | Written |
  |---|---|---|---|
  | saga | player `saga:p` | up to 30,000 bytes, grows with stories played | at most every 5 s while progressing (PRG-31), on leave |
  | saga | world `saga:places`, `saga:restore`, `saga:weather`; structures `saga:place_*` | one JSON for all places (a few KB; camps list up to 50 player ids); snapshot structures per built place | on place changes; a camp visit every 10 minutes |
  | skills | world `skills:placed0..8` | up to 150 KB (PRG-09) | every 30 s while building |
  | skills | player `skills:map0..3` | 21 bytes per 8x8-chunk area, cap 4,000 areas (84 KB) | every 30 s while finding new chunks (PRG-10) |
  | skills | scoreboards `skill_*` (6), player Calling state | one entity score per player ever seen per skill | per XP gain (a score set) |
  | stats | scoreboards `stats_*` (9) by name | one name per player ever seen per stat, never removed | per event and per second of travel |
  | milestones | world `milestones:p:<id>` | about 300 bytes per player ever seen, never pruned | every 10 s per active player (PRG-11) |
  | titles | world `titles:p:<id>`, `titles:n:<name>` | per player, pruned after 365 days | every 60 s per online player, changed or not (PRG-44) |
  | quests | player `quests:day`; world `quests:pbox` | about 150 bytes; 500 boxes | per counted event (PRG-03) |
  | guilds | scoreboards `rep_*` (4); world `guilds:placed0..4`, `guilds:pbox`, `guilds:pending:<id>`; player counters | scores per player with rep; 5,000 keys | counters every 30 s when changed |
  | crowns | scoreboard `crowns`; world `crowns:names` (800 names, 30 KB cap), `crowns:ledger` (200 entries, 30 KB cap) | one score per player ever seen | names when a name changes; ledger per payment (parse, stringify and a byte count of 30 KB) |
  | mail | world `mail:l:<n>` (cap 5,000, system letters expire), `mail:b:<id>`, `mail:roster` (400) | bounded | roster on every join (PRG-17) |
  | goals | world `goals:g:<id>` | up to 30 KB per goal (about 400 donors) | whole goal per donation |
  | journal | player journal JSON (size capped) | grows with entries | per new entry (twice stringified, PRG-24); numbers every 30 s |
  | party | world, one key per party | small, solo parties pruned | on change |
  | relics, cooking, fishing | small player JSONs; owed records per player with a pending gift; fishing records per species | bounded | per event |
  | calendar | about 10 small world keys; player festival counts | bounded | on change |
  | domt | world task index (64) and tasks | bounded | per card |

- What grows with every player ever seen and is never removed: 20 scoreboard objectives (stats 9, skills 6, guilds
  4, crowns 1) and Milestones' record. A one-time visitor leaves about 12 scores (9 stats names, a Crowns score,
  exploration and usually one more skill), one Milestones record and, for 365 days, two Titles keys. Only Stats
  ever iterates a board in steady state (PRG-04); Crowns does on a menu (PRG-12).
- Seven packs each track the weather and write their own world property on every change (saga, relics, skills,
  journal, titles, fishing twice): harmless at that rate, but it is one fact kept seven times.
- Not verified (engine-side): whether the bundle's world properties are saved as one blob, in which case any write
  re-serializes all of it at the next save and the total size (dominated by `skills:placed*`) matters more than the
  write count. Worth one measurement in W0: world save time with and without a full `skills:placed`.
- Fix: PRG-03, PRG-09, PRG-10, PRG-11, PRG-17, PRG-27, PRG-31, PRG-44.
- Prove it with: `/realm:diag`'s saved data page before and after each; restart scenarios (`guilds-placed-restart.js`,
  `cooking-restart.js`, `domt-restart.js`) for the ones that change format.

### PRG-08 `entityHurt`: Relics and Callings make 3 and 4 native calls before their cheap tests  [low / confirmed / S / low]
- Where: `packs/relics_bp/scripts/main.js:950-955` (`isValid`, `damageSource.cause`, `damagingEntity`),
  `packs/skills_bp/scripts/calling.js:554-559` (the same and `hurtEntity.id`). Calendar's (`:1892`) returns on
  `!siege` first.
- How often: every hurt event in loaded chunks (farm mobs falling, drowning, burning, fighting each other).
- Cost estimate: 7 calls per hurt event; 50 a second is 350 calls, 0.02 to 0.17 ms a tick. Not measured.
- Fix: read `damagingEntity` first and return unless `hurtEntity instanceof Player || attacker instanceof Player`;
  only then `isValid`, `cause`, and the `ownHits` lookup (skip it while the set is empty).
- Prove it with: a pit of 30 zombies over magma for 120 s, `--profile` relics and skills; `relics-fen-charm.js`.

### PRG-10 Skills rewrites all of a player's explored chunks when one new chunk is found  [low / confirmed / M / medium]
- Where: `packs/skills_bp/scripts/main.js:822-834` (`saveVisited`), `:840-856`, saved per player on a hashed second
  every 30 s (`:930-931`) and on leave.
- What happens: every area is re-encoded (12 `enc` steps each) and every property rewritten after any new chunk.
  The cap (4,000 areas, 84 KB, 4 properties) is far away for a real player: 2,000 explored chunks in 150 areas is
  3 KB in one property. So this is a few hundred microseconds per explorer per 30 s, and 84 KB only at the cap.
- Fix (when convenient): keep each area's encoded record string in the map and re-encode only the changed one.
- Prove it with: `skills-passive.js`; a player teleported to a new chunk every second for 10 minutes.

### PRG-12 The Crowns balance page sorts the whole board with native getters in the comparator  [low / confirmed / S / low]
- Where: `packs/crowns_bp/scripts/main.js:261-274`.
- What happens: per menu open, `getScores()` (one entry per player ever given Crowns, which is every joiner),
  a filter reading `participant.type`, a sort reading `score` twice per comparison, a `findIndex` reading
  `participant.id`. About 2N log2 N + 4N getter calls: 420 at 30 names, 24,000 at 1,000.
- Fix: map once to plain `{ id, type, score }` objects, then filter, sort and search those (as Stats does).
- Prove it with: `crowns-amounts.js` with 1,000 seeded participants, profiler max tick on opening the page.

### PRG-13 Story data: all of it is loaded, indexed and kept at start; world load walks the whole graph  [low / needs-measurement / M / low]
- Where: imports `packs/saga_bp/scripts/stories/index.js:2-23` and `stories.js:337`; indexes
  `data.js:92-121` (`ORDERED`, `storyById`, `codexById`, `favorsByNpc`), `objectives.js:968-991` (champion tags, the
  Choir set, a regular expression over every objective label), `util.js:23`, `wander.js`; world load
  `main.js:720-726` -> `scale.js:67-95` (`initFar`) and `checkStories` (`main.js:781-797`).
- How the data is held: 15 story modules (838 KB of source, about 60 stories, 687 objectives, roughly 4,000
  objects) are static imports, evaluated before the first tick and referenced for the whole session; `refresh()`
  writes filled strings back into the same objects. The indexes need ids, objective fields, `when`/`requires` and
  rewards for every story at load; they do not need the dialogue (`intro`, `outro`, `pages`, `reply`, clue and
  codex text, hints), which is most of the bytes and is read only when a dialog opens.
- What it costs: parse and evaluation of 838 KB at script start (XC-08 asks for that measurement); then at
  `worldLoad` one recursive walk of every object with three `includes` per string to find 45 tokens, and
  `checkStories` (a loop over 687 objectives with a regular expression). Estimate 5 to 15 ms in the tick every
  other pack's `worldLoad` also runs in. Heap: about 1.5 to 2 MB, small next to 1.3 GB.
- Fix: have `tools/check-stories.mjs` emit a generated `stories/far-tokens.js` (the 45 `[story, path]` pairs) and
  drop the runtime walk; move `checkStories` into the same tool (it already checks more). Splitting text from
  structure only pays if XC-08 (4) finds that dynamic `import()` works on the stable API; the split point is clear
  (text keys above).
- Prove it with: profiler time of saga's `worldLoad` callback before and after; `saga-far-scale.js` if present, else
  `saga-quest-log.js` for the filled distances.

### PRG-14 Lantern Fair "Ghost Tales": up to 150 native calls per player in one tick every 2 s  [low / confirmed / S / low]
- Where: `packs/calendar_bp/scripts/main.js:719-729` -> `byCampfire` `:626-639`.
- What happens: during the Lantern Fair (4 of 96 Realm days), at night, for every Overworld player who has not done
  the activity, once per 2 s and all players in the same tick: 50 `getBlock`, and `typeId` read twice per block
  when it is no campfire. A player not by a fire pays all 150 until they finish the activity.
- Fix: one `dimension.getBlocks(volume, { includeTypes: [campfire, soul_campfire] }, true)` per check; spread
  players over the four passes with a hash of the id. `atWater` (`:642`) has the same loop but only runs for a
  sneaking player holding a lantern.
- Prove it with: `calendar.js` with the day set to the fair at night, 10 and 40 players, `--profile`.

### PRG-16 Per-player settings are read and parsed on every `getFor` in this track's hot paths  [low here, see XC-04 / confirmed / S in the shared module / low]
- Where (call sites the soak cannot see): `saga_bp/scripts/main.js:116`, `objectives.js:166` (per open step per
  second, before the distance test), `:393`, `:404`, `:421`, `:473` (twice per progress bump), `ui.js:1381`;
  `quests_bp/scripts/main.js:144` (per counted event); `skills_bp/scripts/main.js:321`; `guilds_bp/scripts/main.js:
  140`; `relics_bp/scripts/main.js:831`; `party_bp/scripts/main.js:428` (per party member per 2 s);
  `fishing_bp/scripts/main.js:659` (2 to 3 per catch).
- Fix: XC-04's cache in the shared module covers all of them; PRG-30 (1) fixes the order in `questGuides`.
- Prove it with: `saga-perf-quests.js` before and after the shared change.

### PRG-17 Realm Mail rewrites its roster on every join  [low / confirmed / S / low]
- Where: `packs/mail_bp/scripts/main.js:152-158` (`remember`), from `playerSpawn` at `:169-175`.
- What happens: filter, push, sort and `JSON.stringify` of the whole roster (cap 400, about 24 KB; about 2 KB at the
  Realm's size) in the join tick, because the time stamp always changes.
- Fix: write only when the name changed or the stored time is over an hour old.
- Prove it with: `mail-big-roster.js`.

### PRG-35 Three Deck cards read 1,100 to 4,000 blocks in one tick  [low / confirmed / S to M / low]
- Where: `packs/domt_bp/scripts/events.js:47-88` (the Arena: a 15x15x6 all-air test, 1,350 `getBlock` + `isAir`,
  then about 450 `getBlock` + `setType`), `:263-300` (the spore field: 729 `getTopmostBlock`, `typeId`, `getBlock`,
  `typeId`, then a second pass), `packs/domt_bp/scripts/helpers.js:70-83` (`firesAround`: 567 `getBlock` + `typeId`,
  run once before a lightning card and five more times in the next 100 ticks, `:115-117`); the Hot Potato
  (`effects.js:1855-1877`) reads every online player's 36 slots each second for 30 s.
- How often: per card drawn (one draw per player per 20 minutes by default).
- Cost estimate: 11 to 40 ms in the draw's tick for these cards.
- Fix: `dimension.containsBlock(volume, { excludeTypes: ["minecraft:air"] })` for the all-air test and
  `fillBlocks` for the floor and walls; `getBlocks(volume, { includeTypes: ["minecraft:fire"] })` in
  `firesAround`; the spore field's look-around in a `system.runJob`; the Hot Potato remembers who was last seen
  holding it and checks that player first.
- Prove it with: `domt-cards.js`, `domt-places.js`, profiler max tick per card.

### PRG-36 Stats and Parties re-send an unchanged HUD line as a script event every 2 s per player  [low / confirmed / S / low]
- Where: `packs/stats_bp/scripts/main.js:407` (`toHud`, `ticks: 80`) from the ticker loop at `:444-448` every
  `REFRESH_TICKS` = 40; `packs/party_bp/scripts/main.js:447-449`.
- What happens: for a player who turned the Coordinates HUD on (it is off by default, so the soak never sees this),
  the ticker goes out as `realm:hud_line` every 2 s even when the text is the same: one script event, 67 listener
  wake-ups (XC-01), per player per 2 s. Ten such players: 5 events a second.
- Fix: send when the text changed, else renew late: `ticks: 300` and re-send at 240, as Saga's quest box does
  (`saga_bp/scripts/ui.js:1304-1308`).
- Prove it with: `stats-ticker.js`, `party-hud-coords.js`; the bundle soak with the HUD turned on for every player.

### PRG-38 Join: what these 18 packs do, and when  [low / confirmed / S / low]
- Where (every handler checks `initialSpawn` unless noted; "now" = in the `playerSpawn` tick):

  | Pack | Now | Deferred |
  |---|---|---|
  | stats `:101-116`, `:290` | the v1.0.0 score migration for all 9 stats (27 calls, PRG-15), `joins` +1 | |
  | milestones `:152-156` | `joins` +1; the first join loads every record (PRG-11) | |
  | titles `:317-334` | one world read and parse; a write when the name changed or a day passed; a name index read | |
  | mail `:169-188` | the roster rewrite (PRG-17) | unread count after 8 s (first use loads every letter, capped) |
  | party `:462-478` | tag sync (3 calls); a write when the name changed | |
  | domt `effects.js:296-303` | all 36 slots read for a stale Hot Potato (about 72 calls) | two handlers with no `initialSpawn` test, 1 property read each, next tick (`events.js:233`, `helpers.js:442`) |
  | saga `main.js:742-755` | nothing | wanderer state next tick |
  | calendar `:2485-2495` | nothing | +60: two broadcasts (PRG-33) |
  | skills `:883-893`, `calling.js:1149` | nothing | +60 Calling state (16 calls); +200 master titles (12) |
  | relics, fishing, cooking | nothing | +100: owed gifts; cooking also reads all 36 slots for old dishes |
  | crowns `:183-195` | nothing | +200: balance, name, daily bonus |
  | guilds `:223-249` | pending rep (1 or 2 world reads) | +220: up to 8 `realm:title_unlock` events for ranks already held (PRG-21) |
  | quests, journal, goals, slots | nothing or a map reset | |

- Cost estimate: about 150 to 200 native calls in the join tick from this track, plus Mail's stringify. Most of the
  rest is already spread over 1 to 220 ticks, which is what XC-07 asks every pack to do.
- Fix: PRG-11, PRG-15, PRG-17, PRG-21; move domt's potato scan to +100 ticks with the others.
- Prove it with: XC-07's single-join measurement.

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| PRG-05 | `packs/saga_bp/scripts/places.js:900-928` | Every 2 s, each place still waiting to be built (picked for a chapter someone accepted and not visited yet: usually 0 to 5, not all 24) asks for the player list and reads every player's dimension and position; so does each stale built place | Read the players' `{ dim, x, z }` once per `autoTick`; return early when nothing is pending or stale |
| PRG-15 | `packs/stats_bp/scripts/main.js:61-75`, `:101-116` | The v1.0.0 score migration runs on every join for every player who has any scoreboard score: 9 objective lookups and 9 `getScore(player)`, 27 calls. (The first pass said 9 exceptions: an entity with an identity gets `undefined`, not a throw; not verified on a server) | A player property `stats:migrated` |
| PRG-18 | `packs/saga_bp/scripts/objectives.js:1298-1314` | Every entity death reads tags, location and dimension id before the killer (6 calls) | See PRG-32 |
| PRG-19 | `packs/party_bp/scripts/main.js:509`, `packs/relics_bp/scripts/main.js:1042`, `packs/domt_bp/scripts/events.js:186` | Player-only `entityDie` handlers woken for every mob death | `{ entityTypes: ["minecraft:player"] }` |
| PRG-20 | `packs/saga_bp/scripts/objectives.js:1319` | `nightMet()` (3 calls) for every player kill | A lazy getter |
| PRG-21 | `packs/guilds_bp/scripts/main.js:223-234` | 220 ticks after every join, a `realm:title_unlock` for each title rank held (ranks 4 and 5, 4 guilds: at most 8 events, 67 wake-ups each) | Remember the highest rank sent in the player's guild property |
| PRG-23 | `packs/slots_bp/scripts/main.js:669-673`, `:692-693` | 6 calls per block tap and 3 per broken block with no machine placed | `if (!machines().length) return;` first |
| PRG-24 | `packs/journal_bp/scripts/main.js:270`, `:137`, `:299` | A new entry stringifies the journal twice (three times when it completes a page) | Stringify once and pass the JSON to `save` |
| PRG-25 | `packs/titles_bp/scripts/main.js:348` | The pruning job calls `world.getAllPlayers()` once per record | Build the online id set once per job step |
| PRG-26 | `packs/milestones_bp/scripts/main.js:140-211` | Milestones counts the same nine stats as Stats and then takes the larger | When Stats answered the installed-packs scan, read its scores and skip the own counting |
| PRG-27 | 20 scoreboard objectives (PRG-37) | Participants grow with players ever seen and are never removed | Prune ids and names not seen for `forgetAfterDays` in a job (Titles' pattern) |
| PRG-28 | `packs/relics_bp/scripts/main.js:1027-1039` | Every effect added to any entity: `effectType` read, lowercased, two regex replaces | Test against a `Set` of the known spellings first; return when `carried` is empty |
| PRG-39 | `packs/fishing_bp/scripts/main.js:201-254` (`placesAt`) | About 92 block reads and 12 `getTopmostBlock`, 190 calls, in the tick of each catch | Cache the answer per 16x16 column for a minute; read fewer rings |
| PRG-40 | `packs/saga_bp/scripts/ui.js:97`, `objectives.js:997`, `:1139`, `wander.js:128` | `getEntities({ tags })` with no location over a whole dimension, per tracked townsfolk per 2 s and per champion step per second | See PRG-30 (4) and (7) |
| PRG-41 | `packs/relics_bp/scripts/main.js:738-747` | With `autoRepair` on (default), a player holding a relic gets the full hotbar and armor scan every second (about 40 calls) | For the repair, read only the selected slot's durability; keep the full scan on change or every 5 s |
| PRG-42 | `packs/quests_bp/scripts/main.js:297-303`, `skills_bp/scripts/main.js:461-467`, `guilds_bp/scripts/main.js:503-509` | `inPlacedBox` is a linear scan of up to 500 boxes for every broken block not in the placed set (Quests: every block) | Index the boxes by 64-block cell |
| PRG-43 | `packs/milestones_bp/scripts/main.js:410-416` | "Whose milestones?" sorts every record with a comparator that recounts both sides' tiers | Compute the count once per record before sorting |
| PRG-44 | `packs/titles_bp/scripts/main.js:397-422` | Marks every online player dirty every second and saves every player's world record in the same tick once a minute, changed or not; re-checks every built-in title already owned every second | Mark dirty only when a stat moved; save on a hashed second; skip built-ins whose title is in the list |
| PRG-45 | `packs/party_bp/scripts/main.js:421-424`, `:505-514` | `syncTag` (2 to 3 calls) for every player every 2 s before the "no parties" return; the `lives` counter map keeps an entry for every player who ever left | Sync tags on join and on party change; delete `lives` entries after the stale forms are gone |
| PRG-46 | `packs/skills_bp/scripts/calling.js:430-447` | An ore glow sends up to 48 particles to one player every 10 ticks, and finds the player with `getAllPlayers().find` per glow per pass | Keep the player handle; 24 spots, or every 20 ticks |
| PRG-47 | `packs/saga_bp/scripts/party.js:172-183` | With the party story on (default), one `getTags()` per player per second | Read the party tag when Parties sends `realm:party_changed`, and on join |
| PRG-48 | `packs/stats_bp/scripts/main.js:159-164` | Not verified: with the sidebar on, a board of every name ever seen is sent to every client | Another reason for PRG-27 |

## Rejected leads

- First pass PRG-11, for Mail, Goals and Parties: not the same problem as Milestones. Goals loads only when a
  player opens its menu, and goals number in the tens; Parties holds one key per party, and solo parties are pruned;
  Mail's letters load 8 s after the first join, not in its tick, are capped at 5,000 and system letters expire.
- First pass PRG-09, Guilds half: true in shape, overstated in rate. Guilds marks only placed ores, melons and
  pumpkins, so its set is rarely dirty; kept as a note in PRG-09.
- First pass PRG-15's cost: no exceptions are thrown (see the low table); 27 plain calls per join remain.
- First pass PRG-22 (`domt_bp/scripts/helpers.js:560-575`): one property read every 10 s. Nothing to gain.
- First pass PRG-29 (`saga_bp/scripts/data.js:157`): a 96-element `find` when a chapter list is rebuilt. Nothing to
  gain.
- First pass, "Checked and fine": two lines were wrong. The Party HUD loop does not return at once with no parties
  (PRG-45), and Realm Calendar broadcasts on every join as well as at dawn and every 5 minutes (PRG-33).

## Checked and fine

- Saga, idle player: `entries()` cached by version, change-only seal, flag, progress and wanderer sends every 5 s,
  `sendTrack(undefined)` and `clearBox` return on a map test.
- Saga's leave cleanup covers every per-player map (`main.js:768-778`, `objectives.js:3841-3857`); `placed`,
  `counted`, `skyEvents`, `huntsEnded`, the wanderer shape cache and the session champion list are all capped.
- Saga scenes are bounded by design: interact scans (256 blocks a tick, 4 at once), `spawnGroup` (24 mobs), the
  place search and prefab builds run as `system.runJob`; `patrol`, `fast` and `escorts` return on empty sets.
- Saga's form watcher (`util.js:176`) is cleared in a `finally`.
- Realm Calendar's idle floor: one `getTimeOfDay` per 10 ticks; `watchPlayers` returns outside festivals; every
  siege handler returns on `!siege`; the break and explosion guards test `pendingCache.length` first.
- A siege: `raiseCircles` yields every 8 candidate spots, three ticking areas are removed once the circles are put
  back, `siegeTick` is about 15 calls per nearby player per second, Nest Watch is capped at four.
- Skills: game mode and dimension cached per player, XP notes batched per second, the per-second pass is 4 calls
  per player; Callings' per-second pass and 30 s state send are cheap; `fillerSeen` is capped.
- Relics: `idle()` skips players with no relic; the item lookup tests the item type before the item property; the
  abilities are per use and use located queries.
- Journal: cache-first `addEntry`; the place check is skipped while the player stands on the same block.
- Quests and Guilds per-second passes; Crowns' 60 s loop; Fishing's tournament clock; domt's 10 s and 20 s sweeps.
- The owed and pending stores (`tools/owed-shared.js`) read one key per player and an index, never the key list.
- World load in these packs: three small entity sweeps by tag in saga and calendar, weather reads, PRG-13.

## Not read

- `packs/saga_bp/scripts/`: `ui.js` dialogs and the accept, report, hint and favor flows (`:310-1130`), the vision
  and riddle code in `objectives.js:2913-3080`, `places.js` preview and menus, `prefabs.js` (build steps and site
  tests, run as jobs), `stash-bridge.js`, `types.js`; the shared copies (`side.js`, `tether.js`, `name-labels.js`).
- Menus and forms of calendar (stall, year, siege), skills Callings (choose, reset), relics (forge, ascension),
  crowns (market, pay), mail, party, goals, titles, guilds, fishing (log, selling), cooking (teacher, ingredients),
  journal, slots (the spin itself, `reels.js`): only grepped for board reads, entity queries and block loops.
- `packs/domt_bp/scripts/effects.js` card bodies other than the timed ones, and `main.js` (the draw flow, which
  snapshots entities within 64 blocks at `:493-510`).
