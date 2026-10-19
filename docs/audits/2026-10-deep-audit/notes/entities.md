# Track: entities (audit/entities)

Worktree `/home/user/wt/entities`, branch `audit/entities`, base 0ef04ae (master with #88-#91 merged; still up to date
with origin/master at the end). Packs: npc_bp, caravan_bp, wander_bp, town_bp, elite_bp, platypus_bp, platypus_rp,
dolphin_bp, phantom_bp, guard_bp, mobhp_bp. The new master changes in these packs are only the synced copies
(`settings.js`, mobhp's `side.js`, manifests): nothing of mine to fix there, no `notes/recent-changes.md` finding is
tagged `entities`. No manifest bumped (lead bumps). saga_bp: only `scripts/name-labels.js` changed (synced copy).

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | high (perf) | npc_bp, caravan_bp, wander_bp (+ saga copy) | name-labels.js `sync`, npc main.js:726, caravan main.js:819, wander main.js:1507 | Every 2 ticks each pack's label sync read every player (isValid, getGameMode, location, dimension) and scanned all 3 dimensions for strays, also with nothing to label (no caravan, no townsfolk placed): 0.2-0.3 ms/tick per pack. With 12 townsfolk and 40 players around: npc_bp 3.37 ms/tick (updateLabels 4.7 ms per call). | No work without targets; players and dimensions read lazily, once per sync, no game mode call (caller passes `world.getPlayers({ excludeGameModes: [Spectator] })`, `spectatorsExcluded`); stray scan every 10th sync (loaded strays still go on entityLoad); last caption/position trusted between sweeps; townsfolk and traders sync every 10 ticks (they stand still; speech and resends redraw at once). | M | fixed cae58f6, 6a94d71 (test timing: 5be66c8) |
| 2 | high | dolphin_bp | main.js:24, 63-90 (old) | Every tamed dolphin of every player in one world property `dolphin:index`: at about 320 dolphins (34 players with 10, or 107 with the default 3) it passes 32,767 characters and every later taming fails for everyone, plus an error every second from the follow loop. Scenario: 312 of 340 tamings worked before. | One property per owner `dolphin:idx:<player id>` (a few hundred characters), kept in memory, only changed owners written; an older world's `dolphin:index` is split on first read and deleted only when every part was written. | S | fixed 130d91a |
| 3 | high (C2, C14) | npc/caravan/wander/saga | scripts/name-labels.js | Four byte-identical 332-line copies (CRLF) with no sync tool or check. | `tools/name-labels-shared.js` + `tools/sync-labels.mjs` (`--check`), same shape as sync-side.mjs; copies regenerated with a header and LF endings. | S | fixed d38c92c |
| 4 | medium (C2) | npc_bp, caravan_bp | npc main.js:443-466, caravan main.js:646-669 (old) | Two resend mechanisms stacked: name-labels.js toggled after 1 and 3 syncs (0.1 s / 0.3 s at a 2-tick sync, though its comment said 1 s / 3 s) and npc/caravan `watchName` toggled again at 1 s / 3 s, each toggle calling a full `updateLabels()` and a `getPlayers` per NPC per loop. 4 flips instead of 2; watchName alone cost 45% of the npc loop with a crowd. | One resend, in name-labels.js: `syncTicks` option converts 1 s / 3 s to syncs (npc and caravan pass 10 ticks: exactly the old 1 s and 3 s more); wander/saga keep the old per-sync steps. watchName, resendName, labelForm and the viewers state are gone. Not a label design change (helper, range, suppression unchanged; the 20-block client gate in npc-name-capability is untouched). | S | fixed 1744e66 |
| 5 | medium (C6) | npc, caravan, wander, labels | name-labels.js sync, npc main.js:470, caravan main.js:501 and :729, wander main.js:653 | `spawnEntity` result tagged/named without checking its type: in a world with repeating entity ids the handle can be an existing item or pet, which would be renamed and tagged (a helper tag makes `loaded()` remove it). | `spawnChecked(dim, type, at, opts)` exported from name-labels.js: up to 4 tries, `typeId` checked, throws otherwise and the wrong entity is left alone; used for helpers, townsfolk, traders, llamas, wanderers (elite and saga already had theirs). Unit test (BDS can't repeat ids). | S | fixed 5fb9525 |
| 6 | medium | elite_bp | main.js:617 (storm) | A Stormcaller struck 1.5-3 blocks from a player inside a safe zone, land claim or town: fires (put out after 2 and 20 ticks), villagers to witches, pigs to piglins, inside protected ground. Scenario: 3 bolts in 25 s in a zone before. | Inside any `realm:zones` zone it only crackles, as near builds and the spawn. | XS | fixed 3cdc81e |
| 7 | medium (test) | npc_bp | tools/test-bds/examples/npc-standing.js:20 | Baseline failure "helper name right after spawning": the check wanted the native name exactly `§r`, but the label resend switches it to `§r§r` together with the helper's `...§r` (the label text in the failure was right). | Accept `§r` or `§r§r`. | XS | fixed 80c50e8 |
| 8 | medium (test) | mobhp_bp | tools/test-bds/examples/mobhp-overhead.js:121 | Baseline failure "garbled killing-blow box": not garbled; the box says `defeated` since 8b4f0d5 (the `~§r§r...` is side-box padding), the test still wanted `0/4`. | Expect `§7defeated`. Docs also contradict themselves (DOCS below). | XS | fixed 688748d |
| 9 | medium (test) | elite_bp | tools/test-bds/examples/elite-approach.js | Baseline failure (creative 30.5 -> 22.6, safe zone 30.5 -> 19.3, never both in one run): the spider's own random stroll with the champion buffs, not the approach (which excludes creative/spectator/afk and zones correctly). | Slowness 255 on the test champions; the held survival case still closes in, proving the approach moves a held champion. | XS | fixed 3e3b56d |
| 10 | medium (C22) | town_bp | main.js:226-252 (`owe`) | All offline contributors' owed Crowns in one property `town:owed`; past about 900 owed players (quest lists already trimmed) the write fails and is only logged, so later contributors lose their Crowns and reputation. | One property per player (`town:owed:<id>`), merged with the legacy entry on payout, as dolphin_bp now does. | S | deferred: needs a project-completion scenario with an offline contributor (no town scenario exists yet); 900 never-returning contributors is months on a big server |
| 11 | medium (perf) | npc_bp | main.js:660-700 (`loop`, `behave`, `turn`) | With 12 townsfolk and 40 players around, the 10-tick loop costs 0.20 ms/tick (2 `getPlayers` queries and often a rotation teleport per NPC per loop). | One player snapshot per loop shared by all townsfolk (nearest-player and idle-listener from it); turn only when the nearest player moved. | S | deferred: under the 0.4 ms/tick total for npc_bp in the crowd test; measure with real clients first |
| 12 | low (flaky test) | elite_bp | tools/test-bds/examples/elite-approach-terrain.js | Baseline flaky ("got within 14 blocks (closest 18.0)"): a positive check against vanilla pathing among trees. | Same Slowness hold may make it deterministic; not tried. | XS | deferred: passes alone; not touched |
| 13 | low | elite_bp | main.js:525-545 (`nearBuilt`, `scanBuilt`) | On superflat worlds the build check reads 4 blocks below the top, under the world floor, gets `undefined` and counts as built: a Stormcaller never strikes there (found while writing elite-storm-zones). | Treat blocks below `dimension.heightRange.min` as not built. | XS | deferred: only superflat; harmless (crackle) |
| 14 | low (C26) | elite_bp | main.js:129-143 (`playerBehind`) | A tamed wolf loses `minecraft:tameable`, so its kills name no player (no shards/XP/credit unless the owner hit it lately). Documented in the code. | Remember the owner from the pet's `realm`/hitter history, or read `minecraft:tameable` before taming finishes; the stable API has no owner on `is_tamed`. | M | deferred: no stable API for the owner |
| 15 | low (C21) | wander_bp | main.js:1526-1535 | Every 60 s all players are rolled on the same tick (each roll may scan for a spot). | Stagger: roll a slice of players each second. | XS | deferred: not in the profile's top callbacks at 40 players |
| 16 | low (perf) | platypus_bp | main.js:86-87 | `growUpOld` schedules a `system.run` for every entity that spawns or loads (any type), the type check is inside it. | Check `typeId` before scheduling. | XS | deferred: 0.017 ms/tick at 40 players |
| 17 | low (docs) | mobhp_bp | PACKS.md Mob Health | "A killing blow shows `0/20`" next to "`defeated` after a killing blow". | DOCS below. | XS | lead |
| 18 | low (docs) | npc_bp, dolphin_bp, elite_bp | PACKS.md | Resend described as "within 64 blocks"; dolphin saved data key; Stormcaller zones. | DOCS below. | XS | lead |

Checked and fine (no finding): ticking areas: npc_bp creates at most one (`realm_npc_houses`, only while
`/realm:npc_houses` runs, removed in `finally` and on world load); no other pack of this track creates any. Leaked
entities: label helpers (removed on entityLoad when untracked, swept every 10th sync), caravan entities (visit tags,
removed on load), wander llamas, NPC duplicates (audit) are all bounded. `entityRemove` on chunk unload: wander's
`lost()` only forgets a camp's entity id, and the reloaded entity is adopted again by `audit` (no duplicate kept);
name-labels drops a tracked helper whose target is invalid. C13: the four `beforeEvents.playerInteractWithEntity`
handlers only act on their own entities (dolphin feeding counts only a fish actually used). C18: mobhp sends
`realm:actionbar` first; town sends `realm:title`. C24: every op form re-checks on submit. C12: caravan `getScore` is
wrapped. Forms: all go through a `show` helper with UserBusy retry. Guard and phantom: nothing found.

## Performance (perf-soak, these 10 behavior packs + platypus_rp, build_rp, 120 game s, --no-relay)

| pack | ms/tick @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| caravan_bp | 0.217 | 0.303 | 0.010 | 0.017 |
| npc_bp | 0.128 | 0.199 | 0.013 | 0.024 |
| wander_bp | 0.104 | 0.183 | 0.036 | 0.044 |
| dolphin_bp | 0.047 | 0.063 | 0.049 | 0.081 |
| elite_bp | 0.022 | 0.039 | 0.025 | 0.037 |
| mobhp_bp | 0.014 | 0.010 | 0.007 | 0.013 |
| platypus_bp | 0.004 | 0.024 | 0.004 | 0.017 |
| town_bp | 0.002 | 0.007 | 0.001 | 0.005 |
| phantom_bp | 0.002 | 0.003 | 0.000 | 0.002 |
| guard_bp | 0.000 | 0.000 | 0.000 | 0.000 |
| all ten | 0.541 | 0.831 | 0.145 | 0.239 |

The soak places no townsfolk and no caravan, so it shows the idle cost. With them (new `npc-labels-perf`, 12 townsfolk,
40 players walking in and out of range, 60 s): npc_bp 3.367 -> 1.343 (cae58f6) -> 0.649 (6a94d71) -> 0.385 ms/tick
(1744e66); label sync 2.34 -> 0.13 ms/tick, the rest is the 10-tick behavior loop (finding 11). Every pack is under the
0.15 ms/tick budget in the soak; npc_bp with a crowd is 0.39 (labels 0.13 + loop 0.20 + audit). mobhp's big cost in the
full-bundle baseline is the shared `side.js` listener (HUD track), not this pack. Raw: scratchpad `entities/*.json`.

## Scenarios added (before -> after)

- `dolphin-index-full.js` (new): 34 players tame 10 dolphins each with tameChancePercent 100. Before: FAIL, 312 of 340
  tamings, `ArgumentOutOfBoundsError ... 'dolphin:index', Value: 32866` every second. After: PASS, 340 of 340, no errors.
- `elite-storm-zones.js` (new, normal world: on --flat strikes only crackle, finding 13): a held Stormcaller in thunder
  next to a player. Before: FAIL, 3 bolts in a safe zone in 25 s. After: PASS, 0 in the zone, 3 outside.
- `npc-labels-perf.js` (new, profiling): 12 townsfolk, N players; checks one helper each and none left after everyone
  leaves. Passes before and after; the numbers are above.
- `npc-standing.js`, `mobhp-overhead.js`, `elite-approach.js` (fixed tests, baseline failures): all three PASS now.
  Baseline cause of each: findings 7, 8, 9 (test expectations, not pack bugs).
- `tools/name-labels.test.mjs` (node --test, 13 tests): + spawn handing back another entity (fails on the old module:
  the item got tagged), + stray scan every 10th sync, + `syncTicks` resend at 1 s / 3 s, and the townsfolk/trader
  assertions now require no second resend. File converted to LF.
- `npc-far-names.js` (adapted, 5be66c8): waits up to 20 ticks for the townsfolk helper to go once nobody is
  within 24 blocks (it checked after 6 ticks; townsfolk labels now sync every 10). Failed once in the suite run (on
  1744e66), PASS after.

Suite for these packs (`suite.mjs --jobs 2 --retry --filter '^(caravan|dolphin|elite|guard|mobhp|npc|platypus|wander)'`,
26 scenarios, 11.4 min, on 1744e66): 25 pass, 1 fail (npc-far-names, timing above; fixed in 5be66c8 and passed alone).
elite-approach-terrain passed this time. Baseline failures of this track: npc-standing, elite-approach, mobhp-overhead
all pass now. saga-escort (saga track, uses the shared module) fails exactly as in the baseline: "Pell carries a unique
invisible format-code marker (\"...§r§r\")": the same cause as npc-standing, its check must also accept the marker
followed by `§r` (the resend's look-alike form). Not edited (saga track's test).
`npm run check` and `npm run build` pass (74 packs); `node tools/sync-labels.mjs --check` passes.

## DOCS (for the lead; PACKS.md)

- **## Mob Health — `mobhp_bp`**, "What players see", the Health bullet: delete the last sentence "A killing blow shows
  `0/20`." (the bullet already says `defeated` after a killing blow, which is what the code shows).
- **## Dolphin Friends — `dolphin_bp`**, Saved data: replace the `dolphin:index` row with
  `| dolphin:idx:<player id> | World | JSON { entity id: { o, on, n, d, x, y, z } }: that player's tamed dolphins (owner, name and last known spot), for the lists while they're far away. A world from an older version has one dolphin:index for everyone; the pack splits it into these on its first load and removes it |`
- **## Champions — `elite_bp`**, traits table, Stormcaller row, new text:
  `| Stormcaller | In thunderstorms, calls lightning down 1.5 to 3 blocks from a player within 16 blocks (on the water's surface over a lake or the sea), every 6 to 10 seconds (traits.stormcaller). Near builds, within 64 blocks of the world spawn (avoidSpawn) and inside safe zones, land claims and towns it only crackles: no bolt, no fire |`
- **## Townsfolk — `npc_bp`**, technical bullet (line ~2165) "Its `nameTag` is its name. When a player comes within 64
  blocks, or the NPC loads or spawns, the name is sent again 1 and 3 seconds later ...": replace with
  "Its own `nameTag` is its name while nobody is within 24 blocks; closer, an invisible helper (`realm:npc_label`)
  carries the name and the NPC's own `nameTag` is `§r`. When a player comes within 20 blocks, or the NPC loads or
  spawns, both are sent again 1 and 3 seconds later (switching to look-alike forms ending in `§r`), because a game can
  show a `minecraft:npc` as `NPC` until its name changes while it watches. Labels are synced every half second."
  The "World-fixed names" bullet (line ~2069) is accurate again ("around 1 and 3 seconds later").
- **## Merchant Caravan — `caravan_bp`**: same as Townsfolk if it describes the resend; its "World-fixed names" bullet
  is accurate.
- **docs/WORKING.md** (lead): mention `node tools/sync-labels.mjs` next to sync-side / sync-zones.

NEWS (plain ASCII, player-facing):
- Dolphin Friends: taming keeps working however many dolphins the realm has tamed.
- Champions: a Stormcaller's lightning no longer strikes inside safe zones, claims or towns (it only rumbles there).
- Townsfolk and the caravan traders keep their names with much less work for the server.

## Requests for the lead

- `package.json` `check`: add `node tools/sync-labels.mjs --check` after `sync-side.mjs --check`, and consider running
  `node --test tools/name-labels.test.mjs` there (not part of npm run check today).
- Manifests to bump: npc_bp, caravan_bp, wander_bp, saga_bp (name-labels.js copy only), dolphin_bp, elite_bp.
  Unchanged packs: town_bp, platypus_bp, platypus_rp, phantom_bp, guard_bp, mobhp_bp (only its test changed).
- saga_bp's `actors.js` could pass `() => world.getPlayers({ excludeGameModes: [GameMode.Spectator] })` and
  `spectatorsExcluded: true` like the others (saga track; works unchanged as it is).
- The suite runner's header for npc-labels-perf is a profiling run (`--profile`); exclude it from the pass/fail suite
  if that matters (it does check helpers and passes).
- Admin/help catalogs: no command or option changed; nothing to regenerate from this track.
- Saga track: `tools/test-bds/examples/saga-escort.js` marker check must accept `${marker}§r` too (see Suite).

## Phase 2 ideas

1. Caravan and Town Projects as town news: `realm:gossip` and `realm:mail_send` when a caravan arrives or a project is
   finished (offline contributors get a letter with their Crowns), closing the gap in brief.md.
2. Saved-data housekeeping for public servers: per-player keys everywhere a world list grows with players (town owed,
   finding 10), and an operator command per pack to drop data of players not seen for N days.
3. Champion density that scales with players: `maxAlive` per online player (and per area) so 100 players don't get
   the 10-player cap, nor a crowd at spawn.
4. Townsfolk per town: let operators place a second set of the cast in another town (ids namespaced by town), as the
   fixed cast of 12 is the biggest limit for multi-town servers.
5. A real-client check of the label design (the one open client gate): record the 5-block rejoin view once, then lock
   it with a test, so the C2 churn ends.

## Review

Reviewer pass over `git diff 0ef04ae..HEAD` (the track's 11 commits; a4cccca..0ef04ae is the master merge). origin/master has
not moved. No blockers or highs confirmed, so the reviewer made no commits. I traced each fix to its trigger: dolphin per-owner
index and one-way migration, Stormcaller `isProtected` on the strike spot, the label sync cost cuts, the single resend (`syncTicks`
10 gives steps [2,6], the same 1 s / +3 s as the old watchName), and `spawnChecked` (every type is a full id). Rules: no manifest
bumps, no PACKS/README/NEWS/catalog edits, no `.header()`, ASCII, stable APIs. Nothing touches stash_bp or saga objectives.js
(#86/#84). saga-engine's actors.js change (idle throttle) works with the new module.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | tools/name-labels-shared.js resend (npc/caravan) | The flip schedule changed: the stacked 0.1/0.3 s module flips are gone and only 1 s / +3 s remain. Not checked on a real client (C2/C28: every past label design shipped unchecked). | not fixed: needs a real client; the lead should do one 5-block rejoin check before publishing |
| low | tools/name-labels-shared.js (callerAlt comment) | The comment still says npc/caravan `watchName` drives its own toggle, but that code is removed. | not fixed: comment only; fix at the next sync |
| low (C6) | name-labels-shared.js `spawnChecked`, elite `spawnFresh` | With a repeated id, the entity really spawned under the wrong handle is left untagged (for example a bare minecraft:npc showing "NPC"). | not fixed: rare world state; same as elite's existing helper |
| low | name-labels-shared.js SWEEP_EVERY + saga-engine actors.js IDLE_SYNC_EVERY | Combined, the idle stray sweep for saga runs about every 50 s. | not fixed: harmless, because entityLoad removes loaded strays; lead to note at integration |
| low | sync counter | Extra `updateLabels()` calls (say, auditAll, spawn) advance the resend and sweep counters by a sync each. | not fixed: negligible drift |
| low (process) | tools/name-labels-shared.js, tools/sync-labels.mjs, tools/name-labels.test.mjs, saga_bp/scripts/name-labels.js | These edits fall outside the track's pack folders; they are justified by C14. `sync-labels --check` is not yet in `npm run check`. | lead: wire it into package.json, or the copies can drift silently |
| low | dolphin_bp main.js loadKnown | The migration is one way: after a downgrade, the old version's list is empty (each dolphin keeps its owner; the follow loop rebuilds the loaded ones). | accepted |

Checks in the review: `npm run check` passes, `npm run build` passes, `sync-labels --check` passes (4 copies), and
`node --test tools/name-labels.test.mjs` passes 13 of 13.
Suite (`--filter '^(caravan|dolphin|elite|guard|mobhp|npc|platypus|wander|town|phantom)|saga-escort' --retry`, 27 scenarios): it was
still running when the review had to return. These 7 had passed: caravan-unloaded, dolphin-breath, dolphin-index-full,
dolphin-riding, elite-approach-terrain, elite-approach and elite-not-a-mob. The rest are in
scratchpad/entities/review-suite.txt (and review-suite.json). The fail-before reruns are not done: the before worktree is ready
at scratchpad/entities-before (0ef04ae plus the two new scenarios).

## Review (second reviewer, complete pass)

Diff reviewed: `git diff 0ef04ae..HEAD` (a4cccca..0ef04ae is only the master merge). origin/master has not moved (HEAD 5be66c8).
No blockers or highs confirmed, so this review made no commits. Fixes traced to their triggers. Dolphin: the index is split per
owner, the legacy `dolphin:index` is merged and deleted only after every write succeeds, and an owner change empties the old
owner's key. Storm: `isProtected` is checked on the strike column. Labels: there is no work without targets, and the trusted
caption and position are safe because the helpers have `has_gravity: false`, are not pushable and cannot be renamed. One resend
(`syncTicks` 10 gives [2, 6] syncs). `spawnChecked` is used with full type ids. Rules: no manifest bumps; no
PACKS/README/NEWS/catalog edits; no `.header()`; ASCII; stable APIs; no cross-pack imports. Nothing in stash_bp or
saga objectives.js (#86/#84). One process note: the infra track also created `tools/name-labels-shared.js` and
`tools/sync-labels.mjs` (1fb0eb6, a different text). The integration branch already resolved it to this track's version
(identical files) and wired `sync-labels --check` into `npm run check`.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium | tools/name-labels-shared.js:75-80 (resend), npc/caravan `syncTicks: 10` | The first resend after a player comes near or a helper spawns moved from about 2 ticks (the module's old step 1) to 1 s, and a new viewer is noticed up to 0.5 s later (10-tick sync). The old 0.1 s flip may have been what hid the client's cached default name on a fresh helper. BDS cannot show this (C2/C28). | not fixed: needs a real client. Before publishing, the lead should check once on a client: rejoin within 5 blocks and walk up to a townsfolk |
| low | packs/dolphin_bp/scripts/main.js:76-88 `loadKnown` | `known` is set to an empty Map before `getDynamicPropertyIds()`, which runs outside the try. If that call ever throws (an early-execution read), the session keeps an empty index, and the next save would rewrite owners with partial lists. The old code had the same exposure (its try returned {} and the next save overwrote everything). Not reachable today: the first call comes from a tick interval or an event. | not fixed: not reachable today. Cheap hardening: assign `known` only after the read succeeds |
| low | dolphin_bp legacy migration | No scenario covers the `dolphin:index` -> `dolphin:idx:<id>` split (a test pack cannot write another pack's dynamic properties). Checked by reading the code only. | not fixed: covered by reading; a unit test with a mocked `world` would lock it |
| low | name-labels-shared.js:273 | Range and resend distances are now measured from the target's head, not its feet (about 1.6 blocks for an NPC). The difference is negligible at 20/24/36 blocks. | accepted |
| low | tools/name-labels-shared.js:311-312 | The comment still says npc/caravan `watchName` drives a resend toggle; that code is gone. | not fixed: comment only |
| low (C6) | name-labels-shared.js:67-72 `spawnChecked` | When the handle is wrong, the entity that really spawned is left untagged (a bare `minecraft:npc` that shows "NPC", which the audit cannot find by tag). | not fixed: rare world state; same as elite's `spawnFresh` |
| low (test) | tools/test-bds/examples/wander-walk.js:185 | Flaky in this run: "no named witch left" after the lightning (it passed on retry, and in the baseline and the track's run). The witch path (`isOurTurnedWanderer`, wander main.js:1125-1160) is untouched by this diff. Likely a pre-existing race: the witch's `system.run` check skips a record whose `rec.e` still resolves. | not fixed: not caused by this track; watch it at integration |

Scenario results (on 5be66c8, `suite.mjs --jobs 2 --retry --filter '^(caravan|dolphin|elite|guard|mobhp|npc|platypus|wander|town|phantom)|saga-escort'`,
27 scenarios, 13.3 min, log `scratchpad/entities/review2-suite.txt`): **25 pass, 1 flaky (wander-walk, above), 1 fail (saga-escort)**.
saga-escort fails exactly as in the baseline: its marker check does not accept the `...§r§r` resend form. That is the saga
track's test, and the integration branch already carries a saga-escort.js change. Baseline failures of this track
(npc-standing, elite-approach, mobhp-overhead) pass; elite-approach-terrain passed; npc-labels-perf passed.
Fail-before checks (scratchpad/entities-before = 0ef04ae plus the new scenarios):
- dolphin-index-full: before FAIL, 312 of 340 (first failure at taming #313); after PASS.
- elite-storm-zones: before FAIL, 2 bolts in the zone in 25 s; after PASS.
Checks: `npm run check` passes, `npm run build` passes, `sync-labels --check` passes (4 copies), and
`node --test tools/name-labels.test.mjs` passes 13 of 13.
