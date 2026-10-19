# feat-setup: Set up this world (first-run wizard) and Server size profiles (worktree /home/user/wt/f-ops, branch feat/ops)

Built on the diag feature (same branch). Commits: 044ed1a (map_bp budgetLevel), 7631a3e (admin_bp wizard + size +
reminder + scenarios), 77ae2b5 (size scenario), dc5f29d (low level keeps the drawing budget), 2abc83a (fix: 7631a3e's
`ran?.(exec(...))` skipped exec when no callback was given, so menu commands did nothing; caught by admin-menu.js).

## What was built
- **admin_bp `scripts/setup.js`** (new) and wiring in main.js:
  - **Set up this world**: first button of Operator Tools, and `/realm:admin_setup` (operators). Start page: what it
    does, "N of M done", Start/Continue (first step neither done nor skipped), every step as a button with its mark
    (`[x]` done, `[-]` skipped, `[ ]` not done; red when its pack says not yet), "Don't remind operators" (until
    finished/dismissed), Back. Step page (`Set up: step i of n`): body = bold gold step title, status (`Done: 1 town`,
    `Not done yet: none placed yet`, `Not checked: can't be checked from here`, `Skipped`), what to do, `Why: ...`;
    buttons: the step's own command (existing flow via openCommand: its options form, confirmations, operator checks),
    an alternative command (Townsfolk: npc_add and npc_houses), Mark as done (only where no pack can tell), Next (done)
    or Skip, Previous step, All steps. After a step's command runs the step page comes back with fresh detection; if the
    command opened its own menu (Safe Zones, Story Places...), the step page waits up to 2 minutes for that menu to
    close (UserBusy retries every second), then says in chat "Setup paused..." if it never could. Summary page: counts
    and every step done / skipped / not done; reaching it finishes the wizard (chat: `Setup finished: 3 done, 2 skipped.`).
  - Steps (presets.js SETUP, now in wizard order, each with `id` and `why`): Place the Townsfolk, Add a Town, Safe Zone
    at Spawn, Caravan Arrival Spot, Bounty Board, First Waystone at Spawn, Expedition Site, Server Size, then the old
    rest (Relicsmith, Story Places, Town Project Spots, Creeper Guard Zones, Farms Kept Loaded, Community Goal, Welcome
    Message, Realm News, Realm Settings). A step shows only when its command is installed (Server Size always).
  - Done detection (no new protocol; existing events only, asked once per page, one wait of answerTicks):
    Townsfolk `realm:npc_places_ping` -> count placed; Town: `realm:zones` src town; Safe zone at spawn: any zone
    (safe zone or town) covering `world.getDefaultSpawnLocation()` x/z in the Overworld; First waystone:
    `realm:waystones_known_ping {player}` -> a waystone this operator knows within 48 blocks (x and z) of spawn (the maker
    discovers it at once); Server size: chosen through the wizard/size page (the note also says which profile the
    settings match now; a fresh world matches Small Realm but is "not chosen"). Caravan spot, bounty board, expedition
    site and the rest can't be asked: done once their command ran successfully from the wizard, or Mark as done.
  - Operator Tools' **Server setup checklist** uses the same marks (it used to mark only towns and zones).
  - **Reminder**: replaces the old one-time "Setting up a new world? ... setup checklist" hint. On every item check for
    an operator (join +40 ticks, every checkSeconds): if the world's setup isn't finished or dismissed and this operator
    wasn't told, one chat line: `[Realm Configuration] New world? Set up this world walks you through the one-time setup
    (townsfolk, a town, safe zones, server size...): open the item, then Operator Tools, or run /realm:admin_setup. Not
    needed? Pick Don't remind operators there.` No popup. Doesn't need the item any more.
  - **Server size** (Operator Tools > Server size, and the wizard's step): Small Realm / Large server, "(now)" on the
    one the settings match. Picking one pings `realm:cfg_ping` (only the size packs' answers kept), then a confirmation
    `Apply Large server?` listing every change `Pack: Setting label: old -> new` in menu words (Enabled/Disabled, enum
    names), how many already match, options a pack's version rejects, and packs not installed. Yes sends
    `realm:cfg_set {id, pack, key, value}` per change and waits for `realm:cfg_ack`; chat `Server size: Large server.
    Changed 8 settings.` (plus any failures with their error). Nothing left to change: "Every setting already matches
    ... Nothing to change." with Remember it / Back. Operator checked at open and again right after the confirmation.
- **map_bp `budgetLevel`** (world, enum low / normal / high, default normal, live): scales the four Budget objects at
  the top of main.js (drawing, terrain pictures, passes, scanner). Factors: low [1, 0.5, 0.6, 0.5] (2.0 ms/tick ceiling),
  normal 1 (2.9), high 1.5 (4.35). Applied at load, on worldLoad (a saved value can't be read earlier) and on change;
  `realm:map_state` now has `budgetLevel` and `perTick`.

## Design decisions
- No new listener while idle: setup.js subscribes a realm: listener only while it waits for answers (refcounted,
  unsubscribed after; diag.js handles unsubscribe). No intervals. The size ping (every pack answers cfg_ping) happens
  only on the start page, the size step, the summary and the size page, not on every step or Operator Tools.
- Small Realm = each listed option's schema `default` (the pack's config.js), so it is exactly today's defaults.
- Low budget level keeps the drawing budget: hud.md finding (map_bp REFRESH 30 / HOLD 40, drawBudget 1 ms) says at
  ~100 players the refresh sends alone (one per player every 30 ticks, ~0.3 ms each) fill 1 ms/tick; cutting it would
  make still players' strips fade. The first version scaled all four by 0.6 (1.74 ms); changed in dc5f29d.
- `openCommand` got a 5th parameter `ran(ok)` so a step learns whether its command ran (exec's result).
- Only existing config options are used (I may not edit other packs). Chest Finder has no index-scope option; its
  live scan radius is the cost lever. Restart-only options (intervalTicks of hud/elytra/map, chairs cleanupTicks,
  durability checkIntervalTicks) can't be set live, so they're not in the profile.
- welcome_bp: not changed (the reminder is a chat line from admin_bp, the welcome popup is unaffected).

## Large server values (presets.js SIZE_OPTIONS) and why
| pack | option | Small (default) | Large | reason / measurement |
|---|---|---|---|---|
| map_bp | budgetLevel | normal | low | heaviest pack: 3.69 ms/tick at 40 players after the HUD fix (hud.md: redraw 1.95, scanner 1.10, passes 0.51); budgets are global, so low caps it at ~2.0 ms instead of 2.9 regardless of player count; drawing kept (see above) |
| map_bp | mobRadiusMax | 32 | 24 | passes are two entity searches each (~0.3-0.4 ms, hud.md) inside a global pass budget; a smaller search volume ((48/64)^2 = 0.56 of the area) makes each cheaper so the budgeted passes come round sooner for 30-100 players (hud.md: mob markers already lag to ~1.3 s at 40) |
| elite_bp | maxAlive | 8 | 16 | global cap: 8 champions shared by 100 players spread out means most never meet one (entities.md Phase 2 idea 3: density should scale with players); elite_bp costs 0.037 ms/tick at 40 players (entities.md perf table), so doubling is affordable |
| expedition_bp | slots | 1 | 3 | expedition.md #10: 1 slot x maxParty 4 = 4 players at once, a 50-100 player server queues; cost ~0.1 ms/tick per active run, bounded by slots (expedition.md budget line). Uses up to 3 of Bedrock's 10 ticking areas while dungeons reset |
| build_bp | maxBlocksCap | 50000 | 10000 | social-world.md #11/#15: maxBlocksCap is a lag tool on a griefing-prone server and every player without their own setting gets the cap; 10,000 still covers houses and walls |
| cleanup_bp | threshold | 500 | 1500 | the threshold counts dropped items in all dimensions together; 3x the players drop ~3x the items, so cleanups (which take players' fresh drops) stay about as rare; counting is native and cheap (cleanup_bp 0.004-0.006 ms/tick, social-world.md) |
| find_bp | liveScanRadius | 16 | 8 | each search runs getBlocks over (2r+1)^3 blocks: 35,937 at 16 vs 4,913 at 8 (7.3x fewer) on every search by any player; farther containers still come from the index |
| admin_bp | checkSeconds | 30 | 60 | menus.md #3: the item check reads every inventory, ~0.2 ms per player (one per tick via runJob); at 100 players that is 100 ticks of 0.2 ms every 30 s; 60 halves it |
| mail_bp | sendCooldownSeconds | 10 | 30 | brief.md gap: no moderation for mail spam on big servers; a 30 s gap per sender limits floods among strangers |
| afk_bp | sleep.percent | 100 | 50 | with 30+ players (AFK excluded) everyone asleep at once never happens, so the night never skips |

## Commands and options (Commands rows for docs/PACKS.md)
Realm Configuration (`admin_bp`):
| `/realm:admin_setup` | Ops | **Set up this world**: walks you through the one-time jobs a new world needs, one page each: what it is, why, whether it's done (the packs say so where they can: townsfolk placed, a town, a safe zone or town over world spawn, a waystone you know near spawn), a button that runs the step's own command, and Skip. Steps: place the Townsfolk, add a town, a safe zone at spawn, a caravan arrival spot, the bounty board, a first waystone at spawn, the expedition site, Server size, then the rest of the setup checklist. Ends with a summary. Also the first button of **Operator Tools** |
Operator Tools also gets **Server size** (no command): Small Realm (up to about 10 players: every setting below at its default) or Large server (30 to 100+ players); shows every change, old -> new, before anything changes.
Minimap (`map_bp`) Configuration row:
| `budgetLevel` | `normal` | How much script time the minimap may use a tick, for everyone together: `low` (about 2 ms a tick: the radar's land and mob dots lag a little more with many players), `normal` (about 2.9 ms) or `high` (about 4.4 ms, smoother with many players moving). In /realm:config as **Minimap script time a tick** |
presets.js NAMES `realm:admin_setup`: ["Set Up This World", "Guided one-time setup"]. No new admin_bp config.js option.

## Saved data
- World `admin:setup` (JSON, < 1 KB: only SETUP ids): `{ d: {<step>: 1}, s: {<step>: 1}, f?: 1 (finished), x?: 1 (reminders dismissed), size?: "small" | "large" }`.
- Player `admin:setupTold` (true once told about Set up this world). The old `admin:setupHint` is no longer read or written (left in place on existing players).
- map_bp: `budgetLevel` in `map:cfg` like every option.

## DOCS (for the lead)
- PACKS.md Realm Configuration: Commands row above; How to use step 1: replace the setup-checklist hint sentence with "Operators: on a world whose setup isn't finished, chat says once `New world? Set up this world walks you through the one-time setup ...`; **Don't remind operators** on its first page stops it for everyone." Step 6 (Operator Tools): "It starts with **Set up this world** (see `/realm:admin_setup`) and **Server size**: Small Realm or Large server, which sets these together after a list of every change, old -> new: Minimap budgetLevel normal -> low and mobRadiusMax 32 -> 24, Champions maxAlive 8 -> 16, Expeditions slots 1 -> 3, Easy Building maxBlocksCap 50,000 -> 10,000, Lag Cleanup threshold 500 -> 1,500, Chest Finder liveScanRadius 16 -> 8, Realm Configuration checkSeconds 30 -> 60, Realm Mail sendCooldownSeconds 10 -> 30, AFK sleep.percent 100 -> 50 (Small Realm puts each back to its default)." The checklist marks: "[x] done (its pack says so, or it ran from Set up this world), [-] skipped there, red [ ] its pack says not yet." Saved data: add `admin:setup` (world) and `admin:setupTold` (player) as above; `admin:setupHint` is no longer used.
- PACKS.md Minimap: Configuration row for `budgetLevel`; in the Cost paragraph: "...budgets... at `budgetLevel` normal; low keeps the drawing budget and halves the terrain pictures and scanner (passes 0.6): about 2.0 ms a tick at most."
- Catalog: `node tools/admin-catalog.mjs` (new command; verified it then passes `--check`), then `node tools/help-catalog.mjs`.

## NEWS
- Operators: Set up this world (Operator Tools, or /realm:admin_setup) walks a new world's setup step by step, and Server size switches every setting that matters between a small Realm and a big server in one go.

## Measured cost
perf-soak, 40 simulated players, 120 s, --profile, all 67 behavior packs, same code (dc5f29d), one run each; scenario
wrappers in scratchpad/size/perf-{small,large}.js (perf-soak plus a 40-tick preamble; Large sends the 10 cfg_set,
10 of 10 acknowledged). JSON: scratchpad/size/{small,large}-40.json, output *.out.

| run | bundle ms/tick | calls/tick | p95 / max tick ms | map_bp | admin_bp | elite_bp | cleanup_bp | find_bp | build_bp | setTitle/tick | TPS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Small Realm (defaults) | 9.459 | 503.4 | 29 / 394 | 3.763 | 0.129 | 0.056 | 0.021 | 0.018 | 1.011 | 0.97 | 18.41 |
| Large server | 8.332 | 445.9 | 28 / 260 | 2.903 | 0.094 | 0.055 | 0.014 | 0.014 | 1.031 | 0.64 | 18.90 |

- Bundle -1.13 ms/tick (-12%), almost all the Minimap (-0.86 ms: budgets 2.9 -> 2.0, fewer strip sends 0.97 -> 0.64
  setTitle/tick) and admin_bp's item check (-0.035). Run-to-run noise on this machine is large (feat-diag measured 9.49
  and 6.23 for two runs of the same code), so read the per-pack lines, which move as expected, more than the total.
- The soak doesn't search chests, build, or start expeditions, so find_bp/build_bp/expedition_bp don't show their
  Large differences here; their reasons are by construction (blocks read per search, blocks per build, runs bounded).
- The feature itself: no interval, no idle listener; the wizard pings only while a page opens (one wait of answerTicks).
  admin_bp 0.129 at defaults is the existing item check (menus.md: 0.052 at 40 in that track's run).

## Scenarios and results
- `admin-setup-wizard.js` (`--only admin_bp,town_bp,zones_bp,npc_bp`): reminder once, operators only, not again after a
  second item; member refused; start page lists the 5 installed steps in order with marks and notes; step 1 text and
  both Townsfolk commands, no Mark as done; Skip; Add Town through the step's own form, step comes back "Done: 1 town";
  spawn covered by the town's zone detected; size step opens the size page (Small Realm (now)) and Back; Mark as done on
  an uncheckable step leads to the summary "3 done, 2 skipped" and chat; start page afterwards; a later operator isn't
  reminded; Operator Tools starts with Set up this world and its checklist has the same marks. PASS.
- `admin-size-profile.js` (`--only admin_bp,map_bp,elite_bp,cleanup_bp,find_bp,afk_bp,mail_bp`): member refused; Don't
  remind operators (a second operator isn't told); defaults and Minimap normal (2.9 ms); Operator Tools > Server size
  says "Now: Small Realm. 8 settings in 7 packs"; Large lists the changes old -> new; Cancel changes nothing; Yes:
  "Changed 8 settings", all 8 values read back over cfg_ping, Minimap low (2.0 ms), checklist shows [x] Server Size;
  size page says Large (now); Small Realm lists the way back and restores all 8 and Minimap normal; applying again says
  nothing to change. PASS.
- `admin-setup-hint.js` updated to the new reminder text. tools/admin-item.test.mjs copies setup.js too (9/9 pass).
- `node tools/test-bds/suite.mjs --filter '^(admin-.*|map.*)$' --retry`: 19/20 at 7631a3e+dc5f29d; the failure was
  admin-menu (menu commands didn't run: the `ran?.()` bug), fixed in 2abc83a; then admin-menu, admin-setup-hint,
  admin-setup-wizard, admin-size-profile, admin-title, admin-tp 6/6 pass. All map*/maps* (10) and admin-diag,
  admin-diag-bundle, admin-item-legacy, admin-stash-singleton passed in the first run.
- `npm run check`: fails only at check-docs (PACKS.md: `/realm:diag`, `/realm:admin_setup`, map_bp `budgetLevel`
  not documented: lead), admin-catalog --check (new command: regenerating passes --check, verified and reverted) and
  check-versions (lead bumps). Every other check passes when run alone. `npm run build` passes.

## Requests for the lead
- docs (above), `node tools/admin-catalog.mjs`, help-catalog, bumps: admin_bp, map_bp.
- Phase 2: a Chest Finder option for index scope (own/opened containers) would belong in the Large profile; per-player
  champion density (elite) would replace the fixed 16; a 100-player soak to check the Minimap's drawing budget.

## Review (independent reviewer, head 52c5249)
Verdict: ok. Operator checked on every page open and right before Server size applies; UserBusy retried (2 min on a step
page), UserClosed stops, isValid checked after waits; one listener only while waiting; state < 1 KB, ids filtered.
Profile values checked against each pack's schema (all in range, none restart-only) and their notes: justified.
| sev | where | trigger | status |
|---|---|---|---|
| low | setup.js showWaiting | after a step's command, admin's resume() marks the player `resumed`, but the step page uses showWaiting, so the flag stays and the next ctx.show gives up on its first UserBusy instead of retrying | deferred (one extra tap) |
| low | setup.js showWaiting / main.js show | form.show rejects if the player leaves mid-show; unhandled rejection is logged | deferred: same as the existing show() |
| low | presets.js SIZE_OPTIONS cleanup threshold 1500 | more item entities before a cleanup; accepted: at 500 with 100 players cleanups would take fresh drops constantly | no change |
| low | presets.js expedition slots 3 | 3 of 10 ticking areas next to farm_bp's kept-loaded farms; expedition already warns and its load check decides | no change |
| info | opsPage | every Operator Tools open now pings npc_places/waystones_known/zones and waits answerTicks (was zones only) | fine |
Scenarios admin-setup-wizard, admin-size-profile, admin-setup-hint, admin-menu pass. No setup code changed in review.
