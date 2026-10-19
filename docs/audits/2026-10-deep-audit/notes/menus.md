# Track: menus (admin_bp, settings_bp, help_bp, news_bp, welcome_bp, nick_bp, titles_bp)

Worktree /home/user/wt/menus, branch audit/menus, base fe54639 (origin/master da2149f merged; re-merged before return: up to date).
Before-fix proof: every scenario below was run on `git archive fe54639 packs` (scratchpad/menus/base/packs, `--packs`)
and on the branch; logs in scratchpad/menus/<tag>.before.out / .after.out.

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | medium (C4) | admin_bp | main.js isRealItem (~l.700) | `itemType` changed in config.js (or any copy of the item made of another item): the old item has our lore, is locked to the inventory and can't be dropped, but `isRealItem` required `typeId === itemType`, so every player kept a stuck locked old item AND got a second new one | lore-identified items of any type are real (exact colored marks or known lore prefixes only; the loose plain-text mark still needs itemType); `needsNormalize` checks typeId; `normalizedItem` makes a fresh item of the current type | XS | fixed b402c57 |
| 2 | medium (portability, first run) | admin_bp | main.js check/setupHint | brand-new world: nothing tells a new server owner the one-time setup jobs exist (townsfolk, towns, safe zones, caravan, bounty board...) | once per operator (player prop `admin:setupHint`), when they carry the item: one chat line pointing to Operator Tools > Server setup checklist. Also fires for an owner opped after joining (BDS) | XS | fixed 2dc75c8 |
| 3 | medium (perf at scale, C21) | admin_bp | main.js periodic check (~l.1160) | every `checkSeconds` every player's whole inventory (36 slots + offhand + cursor) read on one tick: measured max 8 ms at 40 players (24 ms once at 10), about 0.2 ms/player, so ~20 ms hitches at 100 | `system.runJob`, one player per yield, no overlapping rounds | XS | fixed 522d169 (round max 8 -> 1 ms @40) |
| 4 | low-medium (C18) | admin_bp | actions.js:104 showTitle | /realm:admin_title or Show a Title with no subtitle passed no subtitle, so the previous title's subtitle came back under it | always send `subtitle: sub || " "` | XS | fixed d8bde8b |
| 5 | low (new, recent-changes #10) | settings_bp | main.js:533-545 | every X close of My preferences, even after only looking, opened a second "Nothing was saved" popup | a chat line instead (`My preferences: closed with X, so nothing was saved. To change a setting, run /realm:prefs again and press Save at the bottom.`) | XS | fixed 71d408d (+ scenario fix 13763da) |
| 6 | medium (C5, two operators) | welcome_bp | main.js openEditor save | operator A has the welcome editor open; meanwhile B saves a new body, or a switch (chat/showOnce/screenTitle) is changed in /realm:config; A saves anything and the whole settings object from when A's editor opened overwrites both | save only fields A changed, merged into the current saved overrides; a field set back to config.js's value is removed (follows later config.js changes) | S | fixed a4ee385 |
| 7 | medium (C5, two operators) | news_bp | main.js editNews save | same race for the news: A's save put back the body A's editor opened with over B's newer news | write only the title/body A changed (a draft body is always written) | XS | fixed a34cd0e |
| 8 | medium (public servers) | nick_bp | main.js problem() | a nickname equal to the gamertag of a player who has played here but is offline and has no nickname was allowed (only online gamertags and nicked players' gamertags were checked), so anyone could pose as an absent operator; docs already claimed it was refused | world prop `nick:g:<lowercase gamertag>` -> player id, written on join; checked in O(1) | XS | fixed ba7ecee |
| 9 | low-medium (C24) | nick_bp | main.js allNicks | operator de-opped while the "Clear nickname" question is open still cleared the nickname | re-check isOp on submit | XS | fixed 3a7cd89 |
| 10 | medium (portability) | news_bp | config.js tips | default tips mention other add-ons (tree felling, vein mining, Waypoint Menu: Bedrock Essentials+) and packs that may not be installed; on a server with a few packs tips advertise missing features | default tips are `{ text, pack }`; only posted (and listed in /realm:news_tips) when that pack answers `realm:help_ping` (asked before each tip); the 3 third-party tips removed from the defaults (12 -> 9). Saved lists are untouched | S | fixed d4ba655 |
| 11 | medium (portability, first run) | news_bp | main.js applyRelease | a brand-new world (or news_bp just added) pops up the owner's last changelog entry ("Hotbar refill reaches every inventory page") to every new player, alongside the welcome popup | if no release was ever recorded, no news saved and revision 0: record the id silently; the next update's news is the first to pop up. Existing worlds (news:release set) unchanged | XS | fixed dc61a02 |
| 12 | low (perf) | titles_bp | main.js trail interval (~l.361) | every 2 ticks (real work every 4) `getAllPlayers()` + per-player work even when nobody has a trail: 0.126 ms/tick at 40 players with no trails | skip when no cached (online) player has a trail | XS | fixed f7eaed3 (0.126 -> 0.074 @40) |
| 13 | low | titles_bp | main.js unlockTitle | player with 300 titles reaching a built-in title: console.warn every second forever | log once per player+title | XS | fixed bfe1758 |
| 14 | medium (portability, docs/content) | welcome_bp | config.js DEFAULTS.body/title | default popup is this realm's: "Welcome to the Realm!", "Tap Old Tobin or Mara in town", commands of 9 packs, house rules; on a new world there's no town or NPCs yet and some packs may be missing | content decision for the owner (it's also the live Realm's text unless edited). Proposed: generic default ("Welcome, {player}!" + /realm:help, /realm:prefs, /realm:admin item; story line only "Talk to the townsfolk once an operator has placed them"), or build the body from installed packs like the tips | S | deferred: owner content |
| 15 | medium (moderation) | titles_bp | main.js | operators can give any title (free text) but never take one away: a typo or an offensive title stays wearable forever | add "Take it away" to Give a title (toggle) and `/realm:titles_take` | S | deferred: new command -> catalogs/docs (Phase 2) |
| 16 | low (perf, shared copy) | all settings.js | tools/settings-shared.js `online(id)` | every pack's cfg_ping/cfg_set answer for a player calls `world.getAllPlayers().find(...)`: 67 packs x 100 players per /realm:prefs open | `world.getEntity(id)` + `instanceof Player` | XS | deferred: shared copy, request below |
| 17 | low | settings_bp | main.js save() summary | the "before -> after" line shows the value from when the form opened, so when another operator changed it meanwhile the "before" is stale (the save itself is correct: only changed controls are sent) | use ack value and a fresh read, or note it | XS | deferred: cosmetic |
| 18 | low (C22) | welcome_bp | main.js openEditor | a body over ~32 KB (editor adds a box every edit) makes setDynamicProperty throw; the operator sees no message (only a console warning) | cap at e.g. 20,000 characters with a message | XS | deferred |
| 19 | low | admin_bp | main.js isConfigItem | any nether star renamed "Realm Configuration" on an anvil counts as carrying the item, so that player is never given the real one | documented behavior; harmless (it opens the same menu) | - | no change |
| 20 | low | titles_bp | main.js findPlayer | `/realm:titles_give` for an unknown name parses every saved player's data into the cache (1,000+ players: one slow give, memory kept) | index `titles:n:<lower name>` like nick:g | S | deferred |
| 21 | low | nick_bp | main.js allNicks | operators' list is one ActionForm with a button per saved nickname: with 500+ nicknames slow/unusable | page it, or search by name | S | deferred (Phase 2) |
| 22 | info (operator check) | all 7 | isOp | every pack uses `commandPermissionLevel >= GameDirectors` (1); no tags. Realm operators and BDS `/op` / permissions.json "operator" both give level 1+ (BDS harness: op = 1), so it works the same on a Realm and a public BDS; players with level 0 (member/visitor) are never operators; staff systems that grant power by tags (some server plugins) are not recognized | docs line (below) | - | no change |

Checked and clean: C10 (no `.header(`), C11 (titles weatherChange normalizes "overworld"), C12/C13/C6/C26 (not used), C17 (isValid after awaits in every form loop; UserBusy retried, UserClosed stops), C18 (admin item action bar and settings item action bar send realm:actionbar first; welcome title sends realm:title + one-space subtitle), C22 (admin:recent <= 20, titles <= 300 a player, news draft <= 10,000), C24 (settings_bp re-checks op after every form; welcome/news/titles editors re-check; admin exec/runAction re-check). Concurrency in /realm:config: only changed controls are sent and each pack's `set()` is a synchronous read-modify-write, so two operators saving different settings of the same pack don't lose either (verified by reading settings-shared.js). Admin item dedupe (C4/C5): `updatingItem`/`scheduledItem` guards and reconcile are idempotent; a stray copy (e.g. crafting grid) is removed on the next reconcile. Recent-changes #11 and #12 are build_bp (social-world track), not handled here.

## Perf (ms/tick average, my 7 packs only, perf-soak 120 s, --no-relay)

| pack | @10 before | @40 before | @10 after | @40 after |
|---|---|---|---|---|
| titles_bp | 0.078 | 0.126 | 0.050 | 0.074 |
| admin_bp | 0.028 (max tick 24) | 0.053 (max 8) | 0.016 (max 3) | 0.052 (periodic check max 1; 13 ms is the one-time join check of 40 players spawning together) |
| nick_bp | 0.022 | 0.043 | 0.025 | 0.053 |
| news_bp | 0.004 | 0.009 | 0.003 | 0.005 |
| help_bp | 0.002 | 0.008 | 0.003 | 0.012 |
| welcome_bp | 0.002 | 0.009 | 0.004 | 0.009 |
| settings_bp | 0.001 | 0.002 | 0.000 | 0.000 |
| all 7 | 0.137 (max 31) | 0.249 (max 11) | 0.100 (max 4) | 0.206 (max 14) |

Every pack is under the 0.15 ms/tick per-pack budget at 40 players. nick/help differences are noise (0.01 ms). JSON: scratchpad/menus/{before,after}{10,40}.json.

## Scenarios added (before = base fe54639, after = branch)

| scenario | before | after |
|---|---|---|
| admin-item-legacy.js (`--only admin_bp`) | FAIL (5: locked compass kept + second star) | PASS |
| admin-setup-hint.js (`--only admin_bp`) | FAIL (no hint) | PASS |
| admin-title.js (extended: one-space subtitle) | FAIL (subtitle undefined) | PASS |
| settings-prefs-close.js (`--only settings_bp,welcome_bp`) | FAIL (second popup, no chat line) | PASS |
| prefs-locks.js (updated part 2 to the chat line) | FAIL (expects chat line) | PASS |
| welcome-edit-concurrent.js (`--only welcome_bp`) | FAIL (chat switch reverted, Bob's body lost) | PASS |
| news-edit-concurrent.js (`--only news_bp`) | FAIL (Bob's body lost) | PASS |
| nick-impersonate.js (`--only nick_bp`) | FAIL (offline gamertag taken; de-opped op cleared nick) | PASS |
| news-new-world.js (`--only news_bp,nick_bp`) | FAIL (release popup; 12 tips incl. Waypoint Menu) | PASS |

`npm run check`: pass (catalogs unchanged: no command or doc changes). `npm run build`: pass (74 packs).
Suite for my packs: see SUITE line at the end.

## DOCS (lead edits docs/PACKS.md and README.md)

- **Realm Settings, How to use step 1:** replace "Close with X and a popup says `Nothing was saved`, with **Back to my preferences** and **Close** (the game doesn't hand back what was on a form closed with X, so changes made there have to be made again)." with "Close with X and chat says `My preferences: closed with X, so nothing was saved. To change a setting, run /realm:prefs again and press Save at the bottom.` (the game doesn't hand back what was on a form closed with X)."
- **Realm Configuration:** How to use step 1, add: "Operators: the first time you carry the item, chat says where the **Server setup checklist** is (`Setting up a new world? Open the item, then Operator Tools (the last button): ...`), once." Saved data: add row `admin:setupHint` | Player | `true` once the operator was told where the setup checklist is. How it works, "One carried item at a time": add "An item with the pack's lore made of another item than `itemType` (after `itemType` changed) also counts as the real item and is replaced by one made of the current `itemType`, so nobody keeps a locked item they can't drop." Configuration `checkSeconds` row: "...in seconds (5 to 300); each round checks one player per tick." How it works, Titles: "a title without a subtitle sends a one-space subtitle, so the last title's subtitle doesn't show under it". Add a line: "Operators are players with permission level 1 (`GameDirectors`) or more: Realm operators, and on a dedicated server players made operator with `/op` or `permissions.json`. Tags never make someone an operator."
- **README admin_bp row:** "operator commands in gold" -> "operator commands in red".
- **Welcome Message, Commands `/realm:welcome_edit` row** add: "Saving changes only what you changed: a switch flipped in `/realm:config`, or another operator's edit made while your editor was open, stays." Saved data `welcome:settings`: "JSON of in-game edits (only the fields that differ from `config.js`)".
- **Realm News & Tips:** News popup: add bullet "On a new world, or when Realm News is first added, the release news doesn't pop up (nothing changed there yet): the next update's news is the first." `/realm:news_edit` row add: "Saving changes only the title or body you changed, so news another operator saved while your editor was open stays." Tips: replace the "default tips cover the realm's other add-ons (tree felling, vein mining, the Waypoint Menu) and these packs ..." bullet with "The 9 default tips are about these packs (`/realm:stats`, `/realm:afk`, `/realm:help`, the Quick Stack & Sort sneak-tap, `/realm:find`, `/realm:prefs`, `/realm:mail`, `/realm:quests`, `/realm:nick`); a tip is posted only while its pack is installed. A world that already saved its own tips keeps them as they are." Config `tips` row: "9 tips about the packs, each posted only while its pack is installed (`{ text, pack }`)". Owner note: the realm loses the 3 Essentials+/Waypoint tips if it never saved its tip list; add them back with `/realm:news_tips` if wanted.
- **Nicknames:** Rules bullet: "A nickname can't be the gamertag of anyone who has played here (online or not) or another player's nickname, whatever the case". Saved data add row `nick:g:<lowercase gamertag>` | World | The player id of each gamertag seen joining, so nobody takes an offline player's name. Operators bullet: "an operator de-opped while the question is open clears nothing".
- **Titles & Trails:** How it works, Trails: "When nobody online has chosen a trail the pass is skipped."

## NEWS (player-facing, plain ASCII)

- Nicknames can't copy the gamertag of a player who is offline any more, so nobody can pose as someone who isn't on.
- Closing My preferences with X no longer opens a second popup: a line in chat says nothing was saved.
- Operators: two operators editing the welcome message or the news at once no longer undo each other's changes.
- Chat tips only mention features that are installed on this server.

## Requests for the lead

1. tools/settings-shared.js (finding 16): `const online = (id) => { const e = world.getEntity(id); return e instanceof Player ? e : undefined; };` (Player is already imported in every settings.js), then sync-settings. Saves 67 x getAllPlayers() per /realm:prefs open and per prefs save on big servers.
2. Regenerate nothing for my commits (no command, docs or help text changed in code); after the DOCS edits above, run help-catalog (Realm Settings, Admin and News How-to-use steps change) and bump admin_bp, settings_bp, news_bp, welcome_bp, nick_bp, titles_bp once.
3. Welcome default text (finding 14): owner decision; proposed generic default above.
4. Suite: news-draft-busy.js still passes; it tolerated the release popup and now sees none on the fresh harness world.

## Phase 2 ideas

1. Titles moderation: "Take a title" (toggle in Give, `/realm:titles_take`) and a revoke list for titles from other packs.
2. A "Set up this world" wizard in Operator Tools that walks the checklist in order (place townsfolk, add a town, safe zone, caravan spot, bounty board) instead of one command at a time.
3. Welcome popup built from installed packs (sections per pack from the help catalog), so a stranger's server gets an accurate intro with no editing.
4. Nicknames for big servers: paged/searchable operators' list, a reserved-names list (Admin, Owner, Server, operators' gamertags) in config.
5. Per-pack "remove my saved data" in Realm Settings > Reset (titles:p:*, nick:p:*, news tips, welcome edits) for servers that uninstall a pack.

SUITE (--filter admin-|forms|news-|nick-|settings-|prefs-locks|welcome-|atlas, --retry): 15 scenarios, 14 pass, 1 flaky (atlas: timing under load, passed alone; atlas_bp not mine, uses titles_bp trails/titles), 0 fail.

## Review

Independent review of `git diff fe54639..HEAD` (fe54639 = a4cccca + the origin/master merge; origin/master has not moved since,
`git log HEAD..origin/master` is empty). Head unchanged at 13763da: no blocker or high confirmed, so no review commits.

Rules: only admin_bp, settings_bp, news_bp, nick_bp, titles_bp, welcome_bp scripts and tools/test-bds/examples changed; no
manifest, PACKS.md, README, NEWS or catalog edits; no `.header(`, no cross-pack imports, game text ASCII (check-ascii passes);
stable APIs only (`system.runJob`, `waitTicks`, `sendScriptEvent`); script events stay `realm:`; no actionbar writes added.
No stash_bp or saga_bp file touched, so no conflict with msftMyt's #86 (pages.js) or #84 (objectives.js). Saved data: no store key
renamed; new keys `admin:setupHint` (player) and `nick:g:<gamertag>` (world) only add; welcome/news saves stay readable by old code.
Item safety (admin finding 1): an off-type item is replaced in its own slot by `makeItem()` (nothing else touched), extras are
removed only when they carry the pack's exact lore or a known lore prefix; no item loss or duplicate path found.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | packs/nick_bp/scripts/main.js:132-140 | `nick:g:<gamertag>` is written for every player who ever joins and never removed: on a public server with thousands of visitors that is thousands of world properties, and every bundled pack that scans `world.getDynamicPropertyIds()` (claims, goals, mail, milestones, stash, titles, town, nick itself) iterates them. Same order as titles_bp's existing `titles:p:<id>`, so not a new class of cost | not fixed: low; Phase 2 "remove saved data" should clear `nick:g:*` too |
| low | packs/nick_bp/scripts/main.js:143 | gamertags are only recorded on join after this update, so on the live Realm an offline player who has not rejoined since can still be impersonated until they next join | not fixed: inherent; add to the docs line ("anyone who has joined since this update") |
| low | packs/news_bp/scripts/config.js:18-28 | the 3 Essentials+/Waypoint tips are dropped from the defaults: the owner's Realm loses them silently if it never saved its own tip list | not fixed: intended portability change; already in "Owner note" above, the lead must put it in the owner summary |
| low | packs/news_bp/scripts/main.js:271 | each tip (default every 20 min) sends `realm:help_ping`, so every installed pack answers and every `realm`-namespace subscriber in the bundle wakes ~70 times: one short spike per tip, the same cost as one /realm:help open | not fixed: low and rare; could reuse `installedPacks` for an hour if profiling ever shows it |
| low | packs/admin_bp/scripts/main.js:1081 | on the live Realm every existing operator gets the "Setting up a new world?" line once after the update, not only new server owners | not fixed: one line once; mention in NEWS for operators if wanted |
| low | packs/titles_bp/scripts/main.js:129,307 | `toldFull` and the trail `cache.values()` scan are unbounded by offline entries (`findPlayer` loads offline players into the cache and never evicts them) | not fixed: memory/micro-cost only; ties to deferred finding 20 |

Verified: every new scenario fails on the base packs (scratchpad/menus/base/packs, `--packs`) and passes on the branch -
admin-item-legacy (base: Boss keeps nether star + locked compass), nick-impersonate (base: "bossman" taken, de-opped Ann clears
Sammy), welcome-edit-concurrent (base: chat switch reverted, Bob's body lost), news-edit-concurrent (base: Bob's body lost).

Scenario results (review run, `node tools/test-bds/suite.mjs --filter 'admin-|forms|news-|nick-|settings-|prefs-locks|welcome-|atlas' --retry`):
15 scenarios, 15 pass, 0 flaky, 0 fail (atlas passed this time). Logs: tools/test-bds/logs/suite-2026-10-18T13-22-21-065Z.
`npm run check`: exit 0 (catalogs unchanged). `npm run build`: pass.

Verdict: approve as is. The 13 fixes address their triggers, the docs/NEWS corrections above are complete enough for the lead;
add the nick "joined since this update" caveat and the dropped-tips owner note to the integration summary.

## Review

Second independent review (diff a4cccca..HEAD; the track's own commits are fe54639..13763da, fe54639 being the
origin/master merge; `git log HEAD..origin/master` empty after fetch). No blocker or high confirmed: head stays 13763da,
no review commits. Rules re-checked on the diff: only admin/settings/news/nick/titles/welcome scripts and new or updated
tools/test-bds/examples; no manifest, PACKS.md, README, NEWS, catalog or shared-copy edits; no `.header(`, no cross-pack
imports, ASCII game text, stable APIs (`system.runJob`, `waitTicks`), `realm:` events only, no new action bar writes;
nothing in stash_bp or saga_bp, so no overlap with #86 / #84. Saved data: only new keys (`admin:setupHint`,
`nick:g:*`); `welcome:settings` and `news:*` keep their format; DEFAULTS.tips changed shape but is read only by
`defaultTips()` (saved tip lists stay string arrays). Item safety of admin finding 1: an off-type item is replaced in
its own slot by `makeItem()`, extras removed only with the pack's exact colored marks or known lore prefixes; no loss
or dupe path. Admin runJob round: `check()` starts with `isValid`, so a player leaving mid-round is skipped;
`checking` is reset in `finally`. Titles trail skip: the stats loop puts every online player in the cache every
second, and the menu writes `d.tr` on the cached object, so a chosen trail is seen at once.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| low | packs/welcome_bp/scripts/main.js:226-244 | "changed" is `edited[key] !== s[key]`; a body containing a literal backslash-n doesn't round-trip through escape/unescape, so it counts as changed and is written back (as every save did before) | not fixed: same result as the old code, rare |
| low | packs/news_bp/scripts/main.js:64-68 | until the first `realm:help_ping` answer (first tip or first /realm:news_tips), `defaultTips()` is unfiltered; only `getTips()` callers outside tipsMenu/broadcastTip could see the full list | not fixed: both user-facing paths ask first |
| low | tools/test-bds/examples/prefs-locks.js | the updated scenario needs hud_bp too; its before-fail on base was not re-established in this review (only settings-prefs-close was, which covers the same change) | not fixed: settings-prefs-close fails on base (second popup, no chat line) and passes on the branch |
| low | (prior review rows) | nick:g:* unbounded, impersonation only after rejoin, dropped 3 tips on the owner's Realm, help_ping per tip, setup hint for existing ops, titles cache offline entries | agreed, not fixed (low; see above) |

Scenario results (this review): `node tools/test-bds/suite.mjs --filter 'admin-|forms|news-|nick-|settings-|prefs-locks|welcome-|atlas|smoke' --retry`:
16 scenarios, 16 pass, 0 flaky, 0 fail (logs tools/test-bds/logs/suite-2026-10-18T14-36-00-785Z). settings-prefs-close
re-run on the base packs with the current (13763da) scenario: FAIL (second "Nothing was saved" popup, no chat line), as
claimed. `npm run check`: pass. `npm run build`: pass.

Verdict: approve as is; carry the prior review's two integration notes (nick "joined since this update" caveat, dropped
tips owner note) into the owner summary.
