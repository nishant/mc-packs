# Deferred findings: triage (docs agent, audit/integration)

Every finding a track or reviewer left deferred or "not fixed" in the 12 notes files, plus recent-changes findings no
track fixed. Buckets: **A** docs-only, done now in audit/integration (commits 34c7280..f40e912); **B** cheap code fix
worth doing before release (under 30 min, low risk), with what to change; **C** real follow-up work (suggested task:
title, then two lines); **D** won't fix, with why. Checked against the integration worktree code where it matters
(for example, recent-changes #2, #3 and #14 are still open: `refillFromPages` has no `dead.has` check and
`realm:refill_need` still carries the full lore).

Work already under way elsewhere, so not a new task: `feat/news` (gossip, titles and letters from goals, milestones,
bounties, treasure and Atlas) and `feat/ops` (diag-shared.js: per-pack cost, saved data and "forget my data").

Counts: A 19, B 51, C 29, D 83 (182 rows).

## A: docs-only (done)

| track | severity | pack | finding | reason deferred | bucket |
|---|---|---|---|---|---|
| hud | low | hud_bp, stats_bp | The two bottom steady lines write the bar without `realm:actionbar` (by design) | lead (docs) | A: action bar protocol "one exception" bullet, Coordinates HUD and Stats How it works |
| hud | low | map_bp | Docs said "a move of more than 16 blocks"; FAR_MOVE is 256 | lead (docs) | A: Minimap "Each pass" rewritten (also budgets, Terrain, cache, Cost) |
| hud (recent #7) | low | hud_rp, all side.js packs | Mixed versions: an old side.js copy drops the quest segment | docs | A: Side HUD "Older packs" says to update every side box pack with Side HUD |
| items | medium | death_bp | Docs said the realm keeps inventories on death | lead (docs) | A: Death Point intro and `/realm:death_back` bullet |
| items (review) | medium | stash_bp | Auto-removal of storage entities also removes one an operator loads by hand to recover items | no item loss; needs a recovery command | A for the docs part (images stay as `stash:page_<n>`, don't `/structure load` them); command is C below |
| saga-engine | low | saga_bp | Tracker docs outdated (box skipping, notes), testing hook missing `race_expire`, `age_adds` | lead (docs) | A: Story Questlines tracker, Counting, Testing hook, Commands, party Track button |
| saga-content | low | saga_bp | Hearth and Table docs said there's no way around the Champion's Hearts | lead (docs) | A: story table and the Hearth paragraph (Gristle, rabbit stews, NO_KITCHEN) |
| menus | info | all menus packs | Operator = permission level 1+, never tags | docs line | A: Realm Configuration How it works |
| menus (review) | low | nick_bp | Offline gamertags are protected only after that player rejoins once | inherent | A: Nicknames Rules bullet says "remembered from their first join after the October 2026 update" |
| entities | low | mobhp_bp | "A killing blow shows `0/20`" contradicts `defeated` | lead (docs) | A: sentence removed |
| entities | low | npc_bp, dolphin_bp, elite_bp | Resend "within 64 blocks", dolphin saved data key, Stormcaller in zones | lead (docs) | A: Townsfolk technical bullet, Dolphin `dolphin:idx:<id>`, Stormcaller row |
| social-prog | low | goals_bp | Goal chest is an ordinary container (take out and give again) | docs note | A: "Tip for operators" bullet (protect it with a Land Claim) |
| social-prog (review) | low | party/goals/milestones/mail | Console test hooks write real saved data | test-only by design | A: each Test hook bullet says so |
| social-world | low | build_bp | `maxBlocksCap` is also every player's default; Infinite Reach and big caps are lag tools on public servers | docs | A: Configuration rows for `maxBlocksCap` and `allowInfiniteReach` |
| social-world | low | build_bp | Idle cost and the steady line's protocol undocumented | docs | A: new Easy Building "How it works" |
| weather | medium | translucent_bp | Overrides the vanilla player entity; another add-on doing the same breaks one of them | docs | A: Translucent Tools Switch "Other add-ons" bullet |
| weather | low | tornado_bp, storm_bp | Docs still said entities are pushed; storm check is now a job | lead (docs) | A: Tornadoes and Storm Chasing How it works, Slow Falling rows |
| expedition | low | expedition_bp | No line on removing the pack mid-run | docs request | A: How to use step 10 ("end every run with `/realm:expedition_reset` before removing the pack") |
| infra | low | tools | New checks (check-pipeline, ids, events, actionbar, versions, unit tests, sync-labels) not in the docs | lead (docs) | A: PACKS.md "Keeping this file current" and README tools table. CLAUDE.md "Commands" block and docs/WORKING.md still need the same (lead) |

## B: cheap code fixes worth doing before release

| track | severity | pack | finding | reason deferred | bucket |
|---|---|---|---|---|---|
| items (request) | high | expedition_bp | `gauntlet.js:350` places a stash/parcel structure with `world.structureManager.place(..., includeEntities: true)`: for a player in the Nether or the End the carts land in the Overworld (the stash_bp blocker), `look()` finds none, `placed: true` then never finds them: the player's items are stranded | not routed to the expedition track | B: place with `p.dimension.runCommand(\`structure load "${rec.id}" ${x} ${y} ${z} 0_degrees none true false\`)` as stash_bp's page-store.js does; add a Nether variant of expedition-restart |
| items (request) | low | npc_bp, caravan_bp | Skin restore (`npc main.js:1656`, `caravan main.js:623`) uses the same `structureManager.place` with entities: wrong dimension outside the Overworld | not routed | B: same `structure load` command swap |
| recent-changes #3 | medium | stash_bp, refill_bp | `refillFromPages` has no `dead.has(player.id)` check: a page stack can move into a dead player's hotbar and drop with the death loot | no track picked it up | B: `if (dead.has(player.id)) return undefined;` at the top of refillFromPages (pages.js:930); in refill_bp skip the send when `health.currentValue <= 0`; scenario: kill during the 3-tick window |
| recent-changes #2 | medium | stash_bp | Cross-page refill matches id + name + lore only: a Flight 1 rocket replaces a used-up Flight 3 mid-glide (also tipped arrows, ominous bottles, banners, firework stars) | not picked up | B: skip the cross-page refill for `firework_rocket`, `arrow`, `ominous_bottle`, `*_banner`, `firework_star`; extend refill-pages.js with a Flight 1 vs Flight 3 case |
| recent-changes #14 | low | refill_bp | `realm:refill_need` carries the full lore: 20 long lines pass 2048 characters and that item never refills | not picked up | B: send `lore` cut to 1500 characters total plus a `loreHash`, compare the hash in stash_bp; remove the line from tools/check-events.allow.json |
| hud #7, social-world review | medium | build_bp | ~25 one-off action bar notes (UndoRedo, Clipboard, PlacementQueue "waiting for chunks", PaletteUI, ModifiersUI, BlockPlacer, SettingsUI, FloatingPanels, several in main.js) skip `realm:actionbar` | other track / pre-existing | B: call `lockActionBar(player.id, ms)` before each `setActionBar` (main.js already does it after); remove the build_bp lines from tools/check-actionbar.allow.json |
| social-world review | low | build_bp | Preview.js:699 settled-preview branch draws without the `isActionBarLocked` guard every other branch has | pre-existing | B: add `if (isActionBarLocked(player.id)) return;` before its steadyBar |
| hud #8 | low | elytra_bp | NOS hint (main.js:297) and "disc stopped" (:527) skip `realm:actionbar` | other track | B: send the request first; remove the allowlist line |
| infra (allow list) | low | hud_bp, stats_bp | `setActionBar("")` clears (HUD turned off, ticker off) can wipe another pack's note that is up at that moment | report only | B: clear only when that player's `pausedUntil` has passed (hud_bp main.js:130, stats_bp clearTicker main.js:290) |
| infra (ids) | low | build_bp | Java block ids in BlockDestroyer/Preview/AirBuildMode lists (chain, grass, note_block, nether_portal, rooted_dirt, cauldron variants, light, oak_door, ...) never match | other track | B: rename to the Bedrock ids listed in infra notes (iron_chain, grass_block, noteblock, portal, dirt_with_roots, cauldron, light_block_N, wooden_door, trapdoor...) and drop cave_air/void_air; leave the 16 `<color>_bed` handling for C; remove the fixed lines from tools/check-ids.allow.json |
| infra (ids), items | low | death_bp | AIRS has `cave_air`/`void_air`, lists have `dead_bush`/`magma_block` (Java) beside the Bedrock names | dead entries | B: drop them and their allowlist lines |
| infra (ids) | low | domt_bp, leaves_bp | `rooted_dirt` (domt events.js), `leaves`, `leaves2`, `log`, `log2` (leaves_bp) beside the current names | dead entries | B: drop them and their allowlist lines |
| items, infra | low | relics_bp | PROTECTED_TYPES has `minecraft:item_frame`/`glow_item_frame`, which are blocks in Bedrock: they protect nothing | low | B: drop the two dead ids and their allowlist lines (protecting frame blocks would be new work, not needed now) |
| saga-engine #14 | low | saga_bp | util.js:233 walk-through regex has `dead_bush`; Bedrock is `deadbush`, so spawn spots on desert sand land a block up | no scenario | B: `dead_?bush` |
| saga-engine #15 | low | saga_bp | objectives.js:1335 beforeEvents.playerInteractWithEntity has no `if (ev.cancel) return;` | harmless | B: add it as the first line |
| saga-engine #18 | low | saga_bp | `weatherAsked` never pruned on leave | tiny | B: delete the player's `player|*` keys in playerGone |
| saga-engine review | low | saga_bp | Tracker stagger parity from getAllPlayers index: a join can skip a player's draw for 3 s | rare | B: stagger on a hash of `player.id` instead of the list index (main.js:89) |
| saga-content #8 | low | saga_bp, npc_bp | "Old Pell" (Moss's grave, side_heart.js:873 and npc_bp hearth.js:397) reuses the pilgrim wanderer's name | needs npc_bp too | B: rename both to one new name that no townsfolk or wanderer has, in one commit |
| saga-content #17 | low | saga_bp | w_hob_tales riddle fits "road" | owner's riddle | B: add `road` and `path` to the accepted answers (harmless) |
| saga-content review | low | saga_bp | Chapter hint for "A Champion's Heart" (side_bright.js:1003) only explains Champion's Hearts | low | B: append "; without the Kitchen and Champions packs, Grandmother Gristle at the Ruined Watchtower stands in for the hearts." |
| menus #16 | low | all settings.js | `online(id)` calls `world.getAllPlayers().find(...)` in every pack's cfg answer (67 packs per /realm:prefs open) | shared copy | B: in tools/settings-shared.js `const online = (id) => { const e = world.getEntity(id); return e instanceof Player ? e : undefined; };`, run sync-settings, bump every pack it touches (do it with the other bumps) |
| menus #18 | low | welcome_bp | A body over ~32 KB makes the save throw with only a console warning | low | B: refuse bodies over 20,000 characters with a message in the editor |
| entities #13 | low | elite_bp | On superflat the build check reads below the world floor, counts as built: Stormcallers never strike | superflat only | B: treat y below `dimension.heightRange.min` as not built in nearBuilt/scanBuilt |
| entities #15 | low | wander_bp | Every 60 s all players are rolled on one tick | not in the top callbacks | B: roll a sixtieth of the players each second |
| entities #16 | low | platypus_bp | growUpOld schedules a `system.run` for every spawned or loaded entity | 0.017 ms/tick | B: check `typeId` before scheduling |
| entities review | low | tools/name-labels-shared.js | Comment still says npc/caravan watchName drive a resend toggle | comment only | B: fix the comment, run sync-labels (copies change: bump with the others) |
| entities review | low | dolphin_bp | loadKnown sets `known` to an empty Map before a throwing read | not reachable today | B: assign `known` only after `getDynamicPropertyIds()` succeeded |
| social-prog #12 | low | mail_bp | Leaving and rejoining skips the 10 s letter cooldown | no failing scenario possible | B: keep `lastSent` entries whose cooldown still runs (as slots does with nextSpin) |
| social-prog #13 | low | party_bp | Party chat has no cooldown | low | B: 1 s per-player cooldown with a reply |
| social-prog #15 | low | slots_bp | A machine destroyed by explosion/piston/setblock stays a machine | low | B: store the block typeId with the machine and check it on tap |
| social-prog #16 | low | slots, quests, guilds, skills | beforeEvents without `if (ev.cancel) return` | no effect | B: add the guard in the 5 handlers |
| social-prog #18 | low | mail_bp | Mail menu names mc.nish.software/mailroom | lead's call | B: move the hint to config `itemsHint` (default today's text, "" = none) and document the option |
| social-prog #19 | low | skills_bp | saveVisited for every player on one second every 30 s (worst tick 9 ms at 40) | under budget | B: save a share of the players each second, as milestones now does |
| social-prog #20 + review | medium | party_bp | Load sends one realm:party_members per party in one tick; party count now grows without bound | one-time spike | B: send with `system.runJob`, a few per tick (pruning old solo parties is C) |
| social-prog review | low | journal_bp | A diver standing in seagrass or kelp on the sea bed gets no Ocean entry | missed find | B: accept `kelp|seagrass` next to `water` in the headroom -1 test |
| social-world #18 | low | afk_bp | `/realm:afk` callback's system.run uses the player without isValid | harmless | B: `if (!player.isValid) return;` |
| weather #10 + review note | medium | rain_bp | Indoors in rain, `stopsound` per muffled player 4 times a second (400 commands/s at 100 players) | needs a listening test | B: one `stopsound @a[tag=<muffled tag>] <sound>` per run instead of one command per player (same timing, no listening test needed) |
| weather #12 | low | rain_bp | Storm fog commands sent in the Nether/End | no visible effect | B: compute `fog` as 0 outside the Overworld |
| weather #14 | low | climate_bp | A just-teleported player's column read throws once a second until it loads | rare | B: read `typeId` inside topmost's try |
| weather #15 | low | weather_bp | `realm:weather_set` uses only `origin.sourceEntity` | cosmetic | B: `origin.initiator ?? origin.sourceEntity` |
| weather #16 | low | night_bp | `journaled` set never cleared on leave | bytes | B: clear the player's entries on playerLeave |
| weather review | low | tools/test-bds | tornado-landing's `died` flag never fires for simulated players | low | B: fold `health <= 0` into `died` |
| items review | low | cooking_bp | After `/reload` mid-cook the online cook gets the dish only on next join | low | B: at world load, run applyOwed for every online player (after a short delay) |
| items | low | farm_bp | Remove/add not re-checked for edit rights on submit; `everyoneCanAdd` read only at load | low | B: check canEdit in removeFarm/addFarm |
| items | medium | claims_bp | A block placed into another's claim by a path the tap check misses is set to air: the item (and a shulker's contents) is destroyed | no reproducible trigger | B: `dimension.runCommand(\`setblock ${x} ${y} ${z} air destroy\`)` instead of `setType("minecraft:air")` so it drops |
| hud #11 | low | map_bp | giveMap merges into a stack of unnamed empty maps but says Mara's Field Map is in the inventory | cosmetic | B: compare the stack count before and after; reply "added to your empty maps" when no new slot appeared |
| infra #19 | low | tools/bundle.mjs | Two packs defining the same lang key: the later wins silently | no duplicates today | B: warn on a duplicate key with a different value |
| infra review | low | package.json | `node --test "tools/**/*.test.mjs"` needs Node 21+ | fine today (Node 22) | B: add `"engines": { "node": ">=22" }` |
| infra review | low | hosting OPERATIONS.md | publish-packs `--dry-run` is refused on dirty packs/ | safe default | B: one line in minecraft/docs/OPERATIONS.md: use `--allow-dirty` to preview a work-in-progress build |
| expedition review | low | expedition_bp | Duplicated `@type {Map<string, Player>}` JSDoc line (main.js:3358) | cosmetic | B: delete one |
| infra (ASCII) | low | build_rp | 31 lines of `texts/en_US.lang` hold `❗ – · ⏳` (held by LANG_KNOWN in check-ascii) | other track | B: replace with ASCII (`!`, `-`, `,`, nothing), then set LANG_KNOWN to 0 |

## C: real follow-up work (suggested tasks)

| track | severity | pack | finding | reason deferred | bucket |
|---|---|---|---|---|---|
| hud #10, recent #13 | medium | hud_bp, stats_bp, party_bp | `realm:hud_state` lists only the first 100 HUD players; above that Stats and the Party HUD draw over the HUD | cross-pack protocol change | C: **Split realm:hud_state into parts** - send `{part, parts, players}` like the zones protocol and join the parts in stats_bp and party_bp. Lets the HUD, the ticker and the Party HUD share one bar on servers with more than 100 players. |
| hud review, saga-engine #12, saga Phase 2 | medium | map_bp, saga_bp | Not measured above 40 players: at ~100 the minimap's keep-alive resends may fill drawBudget (strips blink out), and the story tracker still costs ~0.8 ms/tick at 40 with quests | needs a 100-player soak | C: **Measure and tune for 100 players** - run perf-soak and saga-perf-quests at 100 simulated players, then refresh still players' strips more cheaply (or a longer HOLD) and skip unchanged tracker draws for idle players. Add the 100-player run to the finishing steps. |
| entities review, recent #4, #5, weather review, hud | medium | npc/caravan labels, hud_rp, hud_bp, tornado_bp | Unverified on a real client: the name label resend timing (1 s / 3 s), the 10-row quest box size and placement (C1), the one-line HUD width with party and stats extras on phones, a doubled tornado funnel for viewers 64+ blocks out | BDS can't draw | C: **Real-client acceptance pass** - on a phone and a PC, check a 5-block rejoin by townsfolk, the quest box at Right 1-4 and Middle, the one-line HUD with 4 mates, and a tornado seen from 64-128 blocks. Fix what looks wrong (wrap rule, quest box cap, far-viewer particles). |
| recent #1, items | high (perf) | stash_bp | `refillFromPages` loads every other page's structure per used-up stack (up to 24 loads); Hotbar Refill and scans load pages too | measure first | C: **Index Expansive Inventory page contents** - record item ids and counts per page in the committed index at save time, so refill, scans and the menu's usage load only pages that hold the item. Add refill to the perf soak. |
| items review | medium | stash_bp | No recovery command for "inventory recovery is pending"; hand-loaded images are removed at once | no data loss | C: **Add an operator inventory recovery command** - `/realm:inv_recover <player>` restores a retained before-image into a chest next to the operator. Document it in Quick Stack & Sort. |
| items, social-prog #9, #10, entities #10 | medium | cooking_bp, relics_bp, bounty_bp, guilds_bp, town_bp | Owed rewards for offline players are unbounded (cooking:owed, relics:pending can pass 32 KB) or capped and silently dropped (bounty, guilds at 300; town:owed in one property past ~900) | needs a layout decision for 1,000+ players | C: **Bounded owed-rewards store** - one per-player property (`<pack>:owed:<id>`) or a shared capped store with timestamps, oldest dropped with a log line, used by every pack that pays offline players. Migrate the old single properties. |
| items | medium | claims_bp | Pistons, flowing lava/water, fire spread, endermen and hurting pets in a claim aren't covered | feature | C: **Land Claims for public servers** - protect tamed and farm animals from outsiders, fire and liquids where the stable API allows, a per-claim "visitors may open doors" switch, and an operator audit list. |
| items | medium | find_bp | The 2000-container index is world-wide: anyone sees other players' unlocked chests | design | C: **Chest Finder privacy** - index only containers the player opened, owns or that are shared, with an operator switch for the old world-wide index. |
| saga-engine #11 | medium | saga_bp | The no-Champions fallback champion in a chunk unloaded at world load is never removed | untestable on this harness | C: **Remove leftover story champions** - keep the ids spawned this session and remove any `saga:champion` on entityLoad that isn't one; needs a harness that keeps entities across a restart in unloaded chunks to test. |
| saga-engine #16 | low | saga_bp | A save over 32,767 characters throws and loses progress since the last save | no realistic save near it | C: **Second trim for big story saves** - trim codex order, old favors and `ut` when a save passes 30,000, then refuse new codex entries with a message; add a maxed-save unit test. |
| saga-engine #17 | low | saga_bp | First outline of an interact step scans up to 10,625 blocks in one tick | inside PR #84's area | C: **Spread the interact outline scan** - after msftMyt's PR #84 lands, run interactBlocks as a runJob. Coordinate with the PR owner. |
| saga-engine review | medium | saga_bp | saga-escort "facing the way he walks" flaky (villager look-at AI turns Pell between teleports) | not a regression | C: **Steady escort facing** - suppress the escort villager's look-at goal during escorts (component group) or check body yaw, so saga-escort passes every run. |
| saga-content #4 | medium | saga_bp | 15 steps in 7 stories assume the town is at world spawn (place steps and illager waves at a public hub) | engine work | C: **Operator-set town anchor for stories** - `/realm:saga_place town` (default world spawn); near-spawn offsets resolve from it, so stories work on servers with a protected spawn hub. |
| saga-content #5 | medium | saga_bp | 78 required steps can never finish with `doDaylightCycle` off | engine work | C: **Stories on worlds with time stopped** - treat a time window or night as met (or let operators skip it) and count `wait` days as 20 real minutes when the cycle is off. |
| saga-content #9 | low | saga_bp | A started story whose required pack was removed waits forever with no note | engine | C: **Say when a story needs a removed pack** - show "needs <pack>" in the story log for a started story whose `pack:` requirement turned off. |
| saga-content #10 | low | saga_bp, cooking_bp | Named-item steps match by name only (an anvil-renamed beetroot passes as Champion's Heart) | engine + cooking | C: **Check dish lore in story steps** - match Kitchen dishes and Champion's Hearts by the cooking pack's lore mark too. |
| saga-content (requests) | low | tools/check-stories.mjs | No checks for partial color families, reused names / wanderer ids, pack-only items, champion traits, rewards above scale | tools | C: **Extend check-stories** - warn on partial block families, reused cast names and wanderer `who.id`s, ungated pack-only items, unknown champion traits and rewards above the bible's scale. |
| menus #14 | medium | welcome_bp | The default welcome popup is this realm's ("Tap Old Tobin or Mara in town", house rules) | owner content decision | C: **Generic default welcome for new servers** - a default that fits a brand-new world (or one built from installed packs like the tips); the owner decides the live Realm's text. |
| menus #15 | medium | titles_bp | Operators can give any title but never take one away | new command | C: **Let operators take titles away** - a "Take it away" toggle in Give a title and `/realm:titles_take`, with docs and catalogs. |
| menus #21, #20 | low | nick_bp, titles_bp | Operators' nickname list is one button per nickname; titles_give for an unknown name parses every saved player | big servers | C: **Big-server lists for nicknames and titles** - page or search the operators' nickname list, and index title holders by lowercase name like `nick:g:`. |
| social-prog #11 | medium | mail_bp, party_bp | One spammer can fill inboxes or the realm's 5,000 letters; no block list or purge | moderation feature | C: **Moderation for mail and party chat** - a per-player block list, operator "delete letters from X", a per-sender unread cap, and a party chat mute. |
| social-prog review | medium | party_bp | Nothing prunes parties any more (offline solo parties stay forever) | design | C: **Prune long-gone parties** - drop solo parties whose member has been away N days (needs last-seen per member), so the party count stays bounded. |
| social-world #9 | medium | build_bp | Easy Building is a port of Effortless Building v5.0 with no license or credit in the pack | owner decision | C: **Credit Effortless Building** - confirm the upstream license with the owner, then add a credits file to the pack and a line in PACKS.md. |
| infra #20, review | low | tools/check-ids.mjs | Particles and sounds aren't checked; one set for all id kinds | follow-up | C: **Vendor particle and sound ids into check-ids** - add bedrock-samples' particle and sound lists and per-kind id sets (block, item, entity). |
| infra review, Phase 2 | low | tools/test-bds/suite.mjs | `--perf` always exits 0 | reporting mode | C: **Perf gate in the finishing steps** - make `suite.mjs --perf 10,40,100` fail over the per-pack budget and add it to WORKING.md's finishing order. |
| infra (ids) | low | build_bp | 16 `<color>_bed` cases in BlockPlacer: Bedrock has one `bed`, so the special bed handling never runs | changes behavior | C: **Fix Easy Building's bed placement** - rewrite the bed handling for Bedrock's single `bed` id and test placing beds in every mode. |
| weather #9 | medium | moon_bp | Each Blood Moon wave try is a 9x9x9 containsBlock with 641 types; 100 spread players can hold 800 extra monsters | needs a config option | C: **Blood Moon at scale** - cache "built" per 8-block cell for the night and add a world cap on Blood Moon monsters (new option, docs, admin preset). |
| expedition #10 | medium | expedition_bp | At most 3 runs of 4 players at once | design | C: **More expedition slots for big servers** - up to 5-6 slots within the ticking-area budget (shown in the setup checklist) or a real queue that starts the next party when a slot frees. |
| expedition #13 | low | expedition_bp | A disconnect in the ~4-tick cart window plus someone breaking the carts places the structure again (a copy) | touches item safety | C: **Close the stash cart window** - record `seen: true` once the carts are found and re-place only when they never were; add a restart scenario. |

## D: won't fix

| track | severity | pack | finding | reason deferred | bucket |
|---|---|---|---|---|---|
| hud #6 | medium | package.json | hud-layout / map-terrain tests not in npm run check | lead | D: already done (infra c1b5dce, `npm run test`) |
| hud #12 | low | map_bp | A list whose last part never arrives stays in `partial` | tiny | D: bytes per sender |
| hud #13 | low | map_bp | planScan/scanMemo unused, kept as the tests' reference | test churn | D: remove only with new coverage tests |
| hud #15 | low | map_bp | No operator reset for map:wp / map:marks | Phase 2 | D: covered by feat/ops "forget my data" |
| hud review | low | map_bp | Fast movers' picks read twice | perf-tuned path | D: wasted reads only |
| hud review | low | map_bp | Region version bump misses the east/south neighbor's shading (<= 200 ticks) | cosmetic | D |
| hud review | low | map_bp | Stale rebuilds come in a wave every 200 ticks | budget smooths it | D: revisit only if a soak shows it |
| hud review | low | tools/side-shared.js | Lone surrogate counted as 2 bytes | game text is ASCII | D |
| hud review | low | terrain.js, tests | Whole files moved CRLF to LF | merge noise | D: already integrated |
| hud review | low | perf-soak.js | Retry loop added to the shared scenario | harmless | D |
| hud review | low | side-shared.js | Text of only "~"/MARK now occupies a slot | no pack sends it | D |
| hud review | low | map.js | Load flake with 2 suite jobs | load | D: watch in integration runs |
| items | low | harvest_bp | takeSeed may take a nearby seed someone else dropped | 1.5 blocks, rare | D |
| items review | low | relics_bp | Off-hand and worn relics noticed up to 5 s late | measured cost win | D: documented (A) |
| items review | low | stash_bp | Quiet failing player retries on the 5 s turn, not the 2 s backoff | intended | D |
| items review | low | stash_bp | Quiet stagger shifts on join/leave | harmless | D |
| items review | low | durability_bp | Armor warnings up to 2 s later | intended | D: documented (A) |
| items review | medium | cooking_bp | `cooking:owed` written twice per cook | cheap writes | D: the cap is the C owed-store task |
| infra #15 | low | hosting publish-packs | Shared-copy-only packs still need `--pack-notes` | needs a per-file diff vs the last publish | D: the lead passes notes at publish |
| infra #17 | low | test-bds server.mjs | Template race with --jobs > 1 on a fresh cache | cached here | D |
| infra #18 | low | test-bds shim | Relay parts can pass 2048 after re-escaping | BDS takes any length | D |
| infra #21 | low | saga-untrack.js | Waits for right4 | - | D: fixed by saga-engine (7abddad, 64228c3) |
| infra review | low | check-actionbar.mjs | Helper detection loose; `(anonymous)` allowlist hides new hud/stats violations | best effort | D |
| infra review | low | check-versions.mjs | Doesn't fetch; notes oversold it | matches the integration order | D |
| infra review | low | check-* comment strippers | Regex-based, a call could be missed | no misses today | D |
| infra review | low | shim.js | Counts UTF-16 units; only sendScriptEvent wrapped | no evidence / no such call | D |
| saga-engine #13 | low | saga_bp | escortFast calls updateLabels every step on top of the 2-tick sync | only during escorts; changing it needs a client look | D |
| saga-engine #19 | low | saga-escort.js | Load-sensitive sampling | - | D: covered by the C escort facing task |
| saga-engine review | low | saga_bp | mateElsewhere shows the Track button needlessly | harmless | D |
| saga-engine review | low | saga_bp | Saga disabled: last box stays up to 15 s | cosmetic, once | D |
| saga-engine review | low | saga_bp | Shared done collect step reaches a mate up to 10 s later | bounded | D |
| saga-content #6 | low | saga_bp | Some finale rewards above the bible's scale | owner's call | D: report to the owner |
| saga-content #7 | low | saga_bp | "Show" favors pay every day for the same item | intended flavor, tiny | D |
| saga-content #16 | low | saga_bp | "draught" | accepted in US usage | D |
| saga-content review | low | saga_bp | Gristle split over two objectives if the pack set changes mid-chapter | rare; needs OR in `when` | D |
| saga-content review | low | saga-hearth-packs.js | Covers only one variant, no real kill | low | D |
| saga-content review | low | saga_bp | An already spawned actor keeps "Inspector Pell" until it respawns | one time | D |
| saga-content review | low | saga_bp | Vesna `§5` reads dark on forms | owner style | D |
| menus #17 | low | settings_bp | Save summary's "before" can be stale | cosmetic, save is right | D |
| menus #19 | low | admin_bp | A renamed nether star counts as the item | documented, harmless | D |
| menus review | low | nick_bp | `nick:g:*` grows with every visitor | same order as titles:p | D: feat/ops "forget my data" covers removal |
| menus review | low | news_bp | Owner's Realm loses the 3 Essentials+ tips if it never saved its list | intended | D: say it in the owner summary (`/realm:news_tips` adds them back) |
| menus review | low | news_bp | Each tip sends realm:help_ping | rare spike | D |
| menus review | low | admin_bp | Existing operators get the setup hint once after the update | one line | D |
| menus review | low | titles_bp | toldFull / cache keep offline entries | memory only | D |
| menus review | low | welcome_bp | A literal backslash-n body always counts as changed | same as before | D |
| menus review | low | news_bp | defaultTips unfiltered until the first help_ping answer | user paths ask first | D |
| menus review | low | prefs-locks.js | Before-fail not re-established | covered by settings-prefs-close | D |
| entities #11 | medium | npc_bp | 10-tick loop 0.20 ms/tick with 12 townsfolk and 40 players | under npc_bp's total | D: measure with real clients first |
| entities #12 | low | elite-approach-terrain.js | Flaky positive check | passes alone | D |
| entities #14 | low | elite_bp | A tamed wolf's kills name no player | no stable API for the owner | D |
| entities review | low | name-labels, elite, saga, atlas, domt, moon, expedition | spawnChecked/spawnFresh retries leave the real spawn untagged | rare world state | D: far better than tagging a pet |
| entities review | low | saga_bp + labels | Idle stray sweep for saga about every 50 s | entityLoad removes loaded strays | D |
| entities review | low | name-labels | Extra updateLabels calls advance counters | negligible | D |
| entities review | low | dolphin_bp | One-way migration; no unit test of the split | forward compatible; read-checked | D |
| entities review | low | name-labels | Range measured from the head | negligible | D |
| entities review | low | wander-walk.js | Flaky "no named witch left" | pre-existing race | D: watch in integration |
| social-prog #14 | low | quests_bp | Placed-block memory lost on restart | small rewards | D |
| social-prog #17 | low | goals_bp | Chest is an ordinary container | - | D: docs tip (A) |
| social-prog #21 | medium | milestones, goals, bounty | No gossip/titles from progress | feature | D: being built on feat/news |
| social-prog review | low | party_bp | Rolling back Parties loses parties | forward compatibility | D: mention in operator release notes |
| social-prog review | low | milestones_bp | A throwing check isn't flushed that round | no loss beyond 10 s | D |
| social-prog review | low | journal_bp | Full journal re-stringified every 30 s | one stringify | D |
| social-prog review | low | mail_bp | "N seen most recently" can be one off | cosmetic | D |
| social-prog review | low | goals_bp | A folded donor starts a new count | 700+ donors only | D: documented (A) |
| social-prog review | low | milestones_bp | Index stagger shift on join/leave | harmless | D |
| social-world #8 | medium | maps scenarios | Hooks in prose | - | D: done by infra (09d610c) |
| social-world #13 | low | build_bp | Preview loop 0.38 ms/tick floor under the profiler | measurement | D: measure without the profiler first |
| social-world #14 | low | cleanup_bp | Death points in memory, capped at 50 | documented | D (Phase 2 idea) |
| social-world #16 | low | domt-cards.js | Load flaky | not reproduced | D |
| social-world review | low | build_bp | idleSkip coupling to loop periods | latent, works for 1 and 2 | D |
| social-world review | low | domt-busy.js | Load flaky | - | D |
| weather #13 | low | tornado_bp | Spectators and AFK players are launched | owner's documented design | D (Phase 2: a "Ride tornadoes" pref) |
| weather #17 | low | rainbow-race.js | Hook in prose | - | D: done by infra (09d610c) |
| weather review | low | tornado_bp | First Slow Falling lands on the 10-tick beat; dead/elytra/re-grabbed players keep it longer; landing map in memory | harmless | D |
| weather review | low | moon_bp | Block list built on every world load | one tick | D |
| weather review | low | storm_bp | A strike due during a running check is skipped | seconds apart | D: documented (A) |
| expedition #11 | low | expedition_bp | Build steps up to 25-31 ms | once per run | D: only if hitches are reported |
| expedition #12 | low | expedition_bp | tickTraps 0.75 ms per check | a hall lasts seconds | D |
| expedition #14 | low | expedition_bp | A non-member logged out inside a box rejoins in deepslate | needs an operator /tp into a sealed box | D |
| expedition #15 | low | expedition_bp | Every clear announced to everyone | owner content | D |
| expedition #16 | low | expedition_bp | No "forget everything" | - | D: docs line done (A); data removal is feat/ops |
| expedition review | low | expedition_bp | Pets moved to y 320 without slow falling when spawn's chunk isn't loaded; settle not rerun on join; opReset report can be stale | rare / next minute retries | D |
