# Track social-prog: crowns, guilds, bounty, mail, party, quests, goals, milestones, stats, skills, journal, slots

Worktree `/home/user/wt/social-prog`, branch `audit/social-prog` (master da2149f merged, nothing new on origin since).
12 commits (head 0f4d50c): 9 fixes and 3 console-only test hook commits (party, goals, mail) made first so the scenarios could fail on the old code. No manifest bumps, no docs or
catalog edits (corrections below). `notes/recent-changes.md` has no finding tagged social-prog; #4 and #13 touch
party_bp but are tagged hud (party line width, `realm:hud_state` first 100): left to the hud track.

Economy verdict (the prompt's "crowns duplication, slots fairness, races"): no duplication or race found. Every
Crowns path is synchronous check-then-write in one tick (pay, give, market sell recount + remove-then-pay, buy
take-then-give with refund on a bad id, guild shop, Calling switch/respec, slots take-before-pay, bounty and cull
claims set `done` before paying, journal page reward once via `r`). No buy/sell arbitrage between the market,
guild shops and the 50% max Quill discount (checked every overlap). Slots: RTP 91.97% exactly as documented
(recomputed in Node from `reels.js`), the spin is settled at once so leaving mid-animation can't change it, loss
limit and cooldown hold. C12: every `getScore` in these packs is wrapped (crowns, guilds, slots, skills, calling,
stats, milestones). Baseline failure quests-party was a stale regex in the scenario, not a bug.

## Findings

| # | severity | pack | file:line | trigger | fix | effort | status |
|---|---|---|---|---|---|---|---|
| 1 | blocker (data loss at scale) | party_bp | main.js:56-84 (old `save`) | All parties lived in one property capped at 30,000 chars; past ~280 parties of two (offline players' parties never go away) `save()` threw "too many parties", only logged. From then on no create/join/leave/kick was saved: after a restart every change since was gone (the scenario on old code: 0 of 401 parties after the restart). | One property per party (`party:p:<code>`), old `party:data` moved on load and removed; a member -> party index replaces the O(parties) scan in `partyOf` (run for every player every 2 s). Scenarios party-many, party-legacy. | M | fixed 008bc98 |
| 2 | high (data loss at scale) | goals_bp | main.js:76-80 (`save`) | Contributors kept by name in the goal's one property: past ~700 distinct donors `setDynamicProperty` throws inside `donate()` after the items were already moved into the chest; the cache shows progress, a restart loses it (scenario: 964 -> 0) and the player gets no message. | When the JSON passes 30,000 chars, keep the 400 biggest by name and add the rest up under `*` ("Others"), excluded from the top list. | S | fixed 02cfb2d |
| 3 | high (perf at scale) | stats_bp | main.js:399-410, 267-268, 505-507 | Ticker in full style: per player per second `list.findIndex(s => s.participant.displayName === name)` walks every participant through a native getter, and the sort comparator reads native `score`. With 40 tickers and 1,000 names on a board: 0.89 ms/tick, ticks up to 81 ms (every second). Boards keep everyone who ever played, so this grows with a public server's history. | One read per board per tick into plain `{name, score}` plus a name -> place Map (`placeOf`). 0.33 ms/tick, max 22 ms. Scenario stats-ticker-scale (perf). A 5-second-old rank would reach 0.21 but breaks stats-ticker's "rank changes within a second", so not done. | S | fixed 56e725b |
| 4 | medium (test, baseline failure) | quests_bp | examples/quests-party.js:19 | Scenario regex wanted "Defeat 10 zombies"; under way the label counts down ("Defeat 8 more zombies"), so both party checks read -1. Party sharing itself works (Ann 2, Bob 2, Cat 0, Dan 0). | Regex matches both label forms. | XS | fixed b41f7e7 |
| 5 | medium (perf) | journal_bp | main.js:432-441 | Every 2 s all players explored on one tick: getTopmostBlock, 2 getBlock, block `typeId` read again for each of 18 biome rules, ocean climb on dry land, a full journal JSON save whenever height/distance changed. 40 players: 0.232 ms/tick, worst tick 16 ms. | One in 10 players every 8 ticks (each every 4 s, player list read once per round), skip lookups while on the same block, ids read once, ocean climb only above a sea bed, heights saved with the next entry / within 30 s / on leave. 40 players 0.131 ms/tick, max 4 ms. | S | fixed 32b736e, 0f4d50c |
| 6 | medium (lists at 100+) | milestones_bp | main.js:322-340 (`pickPlayer`) | "Another player's milestones" listed every record ever (one button each): 1,000 one-time players = a 1,000-button form. | At most 50: online first, then most milestones, then name; the text says "50 of the N players". Scenario milestones-list. | XS | fixed 75cc12b |
| 7 | medium (lists at 100+) | mail_bp | main.js:258-310 (`write`) | The To dropdown held the whole roster (up to `maxRoster` 400) alphabetically. | Online players plus the most recently seen, 60 in all; once the roster is bigger an "Or type their name" box (exact name, or the only one it starts) reaches anyone else, an unknown or ambiguous name brings the form back with why. Small realms see the same form as before. Scenario mail-big-roster. | S | fixed abf7cfa |
| 8 | low (perf spike) | milestones_bp | main.js:226-243 | Every 10 s all players' `check()` (8 stats `getScore` by name, throwing for missing ones) and all dirty record writes on one tick; worst tick 5 ms at 40, linear in players. | A share of the players each second, and only their records saved then; a leaving player's own record saved on leave (was: every dirty record). Check interval worst tick 1 ms. | XS | fixed e67ec46 |
| 9 | medium (C22) | bounty_bp | main.js:118-128 | Offline players' owed Crowns capped at 300 players: the oldest owed amounts are dropped silently (cull bounties pay every contributor, many go offline). | Raise the cap to what fits (~1,500 at 17 chars each) and warn in the log when dropping, or pay through a shared "owed" scoreboard keyed by name. Not testable without 300+ offline ids reaching `claim()` (needs a live hunt). | S | deferred: needs a hook into claim() to test; low frequency |
| 10 | low (C22) | guilds_bp | main.js:206-215 | Same for offline reputation (`PENDING_MAX` 300, silent). | Same as #9. | S | deferred: as #9 |
| 11 | medium (moderation) | mail_bp | main.js:327, 15 | One spammer can fill a recipient's 50 unread slots (then nobody else can write to them) or the realm's 5,000 letters (10 s cooldown: about 14 h of scripting) and break mail for everyone; no block list, no operator purge. | Per-player block list, operator "delete letters from X", per-sender unread cap per recipient. | M | deferred: Phase 2 moderation (below) |
| 12 | low | mail_bp | main.js:243 | `lastSent` is deleted on leave, so leaving and rejoining skips the 10 s letter cooldown. | Keep entries whose cooldown is still running (as slots does with `nextSpin`). | XS | deferred: the harness gives a rejoining simulated player a new id, so no failing scenario is possible |
| 13 | low | party_bp | main.js:300 (`chat`) | Party chat has no cooldown or length-per-minute limit. | 1 s per-player cooldown. | XS | deferred: low |
| 14 | low (exploit) | quests_bp | main.js:242-252 | Recently placed blocks are remembered in memory only (guilds and skills persist theirs): after a restart (a Realm closes when everyone leaves) placed stone/logs/ores count for Mine quests again. Rewards are small (2-3 levels, 16 torches, 4 apples). | Persist only the blocks that some Mine quest targets, chunked like guilds:placed. | S | deferred: small rewards |
| 15 | low | slots_bp | main.js:668-671 | Only `playerBreakBlock` unregisters a machine; a machine block destroyed by an explosion, piston or /setblock stays a machine, so whatever block lands there opens the slots. | Check `machineAt` blocks' type on tap (store `typeId` with the machine). | XS | deferred: low |
| 16 | low (C13) | slots_bp, quests_bp, guilds_bp, skills_bp | slots main.js:585; quests :272; guilds :501; skills main.js:505, calling.js:771 | `beforeEvents` without `if (ev.cancel) return`. The harvest taps only read and re-check the crop 3 ticks later (a canceled tap leaves the crop ripe, so nothing counts); the slot item and Sigil cancel their own use. No observable effect found. | Add the guard for consistency when next touched. | XS | deferred: no effect |
| 17 | low (economy design) | goals_bp | main.js:154-220 | The goal's chest is an ordinary container: anyone can take donations out and give them again, inflating the top list (no Crowns reward, so no money). | Docs: protect the chest with a Land Claim; or count only items that leave the donor (already) and refuse chests not protected. | XS docs | deferred: docs note below |
| 18 | low (portability) | mail_bp | main.js:470 | The mail menu text names `mc.nish.software/mailroom` (our site). | Move the hint to config (`itemsHint`, "" = none). | XS | deferred: the site is the packs' own home; lead's call for public release |
| 19 | low (perf) | skills_bp | main.js:807-810 | `saveVisited` for every player on the same second every 30 s (up to 21 KB per player property). 40 players: worst tick 9 ms. | Save a share each second like milestones. | XS | deferred: under budget (0.12 ms/tick at 40) |
| 20 | low (perf, load) | party_bp | main.js:118-126 | `sendAllMembers` at load sends one `realm:party_members` per party in one tick: with hundreds of parties that's hundreds of events through every pack's listener at once. | Spread with `runJob`, a few per tick. | XS | deferred: one-time, measured nothing |
| 21 | medium (gap, brief) | milestones_bp, goals_bp, bounty_bp | n/a | No `realm:gossip` / `realm:title_unlock` from a milestone tier, a reached goal or a claimed bounty (brief "Gaps"). | See Phase 2. | S | deferred: feature |

## Perf (ms/tick, my 12 packs alone, perf-soak 120 s)

Before = sp/before-10/40.json (my packs at the start of the track), after = sp/final-10/40.json (every fix), both
in the scratchpad. The baseline.md numbers (whole bundle) were 2-3x higher for every pack from contention; these
are comparable with each other only, and +-0.02 per pack is noise (the other track's BDS ran meanwhile).
Budget: <= 0.15 per typical pack.

| pack | @10 before | @40 before | @10 after | @40 after | note |
|---|---|---|---|---|---|
| journal_bp | 0.052 | 0.232 (max 16 ms) | 0.060 (max 1) | 0.103 (max 3 ms) | fixed #5 |
| skills_bp | 0.037 | 0.100 | 0.047 | 0.123 | unchanged code; per-second pass over all players (#19) |
| stats_bp | 0.026 | 0.065 | 0.022 | 0.066 | ticker off in the soak; stats-ticker-scale (40 tickers, 1,000 names): 0.892 -> 0.330, max 81 -> 22 ms (#3) |
| quests_bp | 0.020 | 0.053 | 0.027 | 0.064 | unchanged code |
| milestones_bp | 0.020 | 0.050 (check max 5 ms) | 0.031 | 0.064 (check max 1 ms) | #8 removes the spike |
| guilds_bp | 0.025 | 0.042 | 0.025 | 0.051 | unchanged code |
| crowns_bp | 0.010 | 0.037 | 0.010 | 0.041 | join-time welcome |
| bounty_bp | 0.009 | 0.011 | 0.010 | 0.014 | |
| mail_bp | 0.003 | 0.008 | 0.002 | 0.010 | |
| party_bp | 0.003 | 0.009 | 0.002 | 0.010 | index replaces the per-player scan (matters with hundreds of parties) |
| goals_bp | 0.000 | 0.000 | 0.000 | 0.000 | |
| slots_bp | 0.000 | 0.000 | 0.000 | 0.000 | |
| all 12 | 0.206 (max 9) | 0.607 (max 33 ms) | 0.238 (max 9) | 0.548 (max 24 ms) | |

Every pack is under 0.15 ms/tick at 40 players after the fixes. Finding for everyone (lead request 1): with 40
players one `world.getAllPlayers()` measured about 0.1-0.3 ms inside journal; packs that call it every second (most
of the 67) pay that each time.

## Scenarios added (before -> after)

- `quests-party.js` (fixed, baseline failure): FAIL (Ann -1, Bob -1) -> PASS (Ann 2, Bob 2, Cat 0, Dan 0).
- `party-many.js`: on pre-fix storage FAIL ("0 parties; R3FJ is missing" after the restart) -> PASS (401 parties,
  the new one with Ann and Bob).
- `party-legacy.js`: an old-format `party:data` party survives two restarts (migrated, then read from its own
  property). New behavior only (no old code to fail on).
- `goals-many-donors.js`: FAIL (964 -> 0 after the restart, no donate reply) -> PASS (964, Op first in the top list).
- `milestones-list.js`: FAIL (81 buttons) -> PASS (50, online first, then most milestones, count in the text).
- `mail-big-roster.js`: FAIL (301 choices, no name box) -> PASS (60 choices, typed "gone250" reaches Gone250, unknown
  name explained).
- `stats-ticker-scale.js`: perf scenario (passes before and after): 0.892 -> 0.330 ms/tick with --profile.
- Suite (`suite.mjs --jobs 2 --retry --filter '^(bounty|crowns|goals|guilds|journal|mail|milestones|party|quests|skills|slots|stats)-(?!ticker-scale)|^saga-party'`):
  26 scenarios, 25 pass, 1 fail: saga-party-story, the same baseline failure as before this track ("no message
  matching /Ann set the party's tracked quest/"; saga-engine's), unrelated to party_bp's storage (party-basics,
  party-hud-coords, mail-party, saga-party-coop pass). stats-ticker-scale passes too (run alone).
- `npm run check`: passes (exit 0). `npm run build`: passes.

Test hooks added (console only, `ScriptEventSource.Server`, like `realm:quests_test`): `realm:party_test`
`{fill|legacy|report}`, `realm:goals_test {donors}`, `realm:milestones_test {fill}`, `realm:mail_test {roster}`.

## DOCS (docs/PACKS.md; I edited none)

- **Parties, Saved data:** replace the `party:data` row with
  `| party:p:<code> | World | One per party: JSON { l, m }, the leader (player id) and the members as [player id, gamertag when last seen], in joining order. Worlds saved by older versions kept every party in party:data; it is moved to these when the world loads and then removed |`
- **Parties, How it works, Member lists:** drop "(also for parties of one forgotten to stay under the save limit)";
  add after it: "Each party is saved on its own, so a server can have any number of parties."
  Add a bullet: "- **Test hook** (for the BDS scenario tests): the script event `realm:party_test` `{ fill: n }` adds n
  parties of two offline players, `{ report: "<code>" }` says in chat how many parties there are and who is in that
  one, `{ legacy: "<code>" }` saves one the old way. It only works from the server console."
- **Community Goals, What players see / Saved data:** after "the top 5 contributors (`topContributors`)" add: "A goal
  with hundreds of contributors keeps the 400 who gave most by name and adds up the rest as Others, so its total
  and top list stay right (a player added up there starts a new count if they give again)." In the `goals:g:<id>`
  row: "contributions by player id (`{ "<id>": [name, amount] }`, plus `"*": ["Others", amount]` once there are too
  many to keep by name)". New How it works bullet: "**Tip for operators:** the goal's chest is an ordinary
  container; protect it with a [Land Claim](#land-claims--claims_bp) so nobody takes donations out to give them
  again." Test hook bullet: "`realm:goals_test` `{ donors: n }` adds n offline contributors to every open goal
  (server console only)."
- **Milestones, How to use step 3 and the Commands row:** "Pick **Another player's milestones** to see up to 50
  players who have played since the pack was added: online players first, then those with the most milestones."
  **What players see, Unlocking:** "Each player is checked every 10 seconds (`checkSeconds`; a share of the players
  each second), and when you open the menu." **How it works:** "Counts are kept in memory and each player's are
  saved when they're checked and when they leave." Test hook: "`realm:milestones_test` `{ fill: n }` adds n
  offline players' records (server console only)."
- **Realm Mail, How to use step 1:** "Choose who it's for from the list (online players, with `(online)` after
  their names, and those seen most recently: 60 names at most), or, once more players have joined than the list
  holds, type a name in **Or type their name** (the whole name, or enough of it to match one player; offline
  players get it when they're back). A name nobody has brings the form back with `No player called "..." has joined
  the realm.`" Test hook: "`realm:mail_test` `{ roster: n }` adds n long-gone players to the roster (server
  console only)."
- **Field Journal, How it works, Places:** "every 4 seconds (one in 10 players every 8 ticks, so they're spread
  out) each player's dimension, height and distance from world spawn are checked, plus one `getTopmostBlock` and
  two `getBlock` lookups for biomes (and a climb through the water over a sea bed). A player still on the same
  block only gets the rain and thunder check. The deepest, highest and farthest are saved with the next entry,
  within 30 seconds, or when the player leaves."
- **Stats & Leaderboards, How it works:** "Once a second the pack builds each ticker from the player's scores (and
  ranks, in the full style: each board is read once a second for everyone)."
- **Daily Quests:** no change (the counting-down label is documented: `Mine 6 more coal ore`).
- README rows: no change.

## NEWS (player-facing, plain ASCII)

- Parties are saved one by one now, so a busy server never stops saving new parties.
- Community goals with hundreds of helpers keep counting every donation.
- Realm Mail: on a big server, type the name of anyone not in the To list.
- Milestones: Another player's milestones lists the 50 most interesting players, online first.

## Requests for the lead

1. `world.getAllPlayers()` is not free (about 0.1-0.3 ms with 40 players, measured inside journal): worth a line in
   docs/WORKING.md ("read it once per interval, pass the list down; for per-tick slices read it once a round").
2. Bump at integration: party_bp, goals_bp, milestones_bp, mail_bp, journal_bp, stats_bp (no others changed).
3. Run `node tools/help-catalog.mjs` after the docs edits (Milestones and Mail How to use change); no command or
   parameter changed, so the admin catalog stays.
4. `tools/test-bds/suite.mjs`: stats-ticker-scale's header runs with `--profile` (it is a perf scenario that also
   passes as a test); fine as is, or mark perf scenarios to skip in quick suites.

## Phase 2 ideas

1. **Town news for progress:** a reached Community Goal, a milestone's top tier and a claimed champion bounty send
   `realm:gossip` (and a `realm:title_unlock`: "Pillar of <goal>", "<Milestone> III", "Bounty Hunter") so townsfolk
   and Titles pick them up; and `realm:mail_send` the goal's top contributors a thank-you letter.
2. **Moderation for public servers:** mail block list and operator purge ("delete every letter from X"), party chat
   cooldown and mute, a Crowns ledger (last 200 pays/gives in a world property, `/realm:crowns_audit`) and a daily
   pay limit per player.
3. **Owed rewards that never drop:** one shared "owed" store (Crowns and rep by player id, bounded by size with a
   log line) used by bounty, guilds and any pack that pays offline players.
4. **Leaderboards for big servers:** stats/milestones/crowns top lists with "around me" (5 above and below) and a
   weekly board (resets every UTC week) so new players can place.
5. **Parties for big servers:** party finder (open parties listed with what they're doing), and party disband after
   every member has been away 30 days (needs last-seen per member).

## Review

Independent review of `git diff b25f718..HEAD` (the track's 12 commits; a4cccca..b25f718 is the master merge). Master
had not moved (`git log HEAD..origin/master` empty). Rules: no manifest bumps, no PACKS.md/README/NEWS/catalog
edits, no shared copies (settings.js/side.js/zones.js) touched, nothing in stash_bp or saga_bp (PRs #86/#84 not
touched), added text is plain ASCII, only stable APIs (`ScriptEventSource` is in @minecraft/server 2.1.0), no
`.header()`, no setActionBar added, no cross-pack imports. Every test hook is gated to `ScriptEventSource.Server`.

Fixes checked against their triggers:
- party_bp: one property per party; `write()` clears the member index on every change, `parties()` clears it on
  (re)load, so an index built while the world wasn't loaded can't stick. Migration skips codes already moved and drops
  `party:data` only after every party was written (a throw leaves it for the next load). The renamed-player path now
  writes only its party, as before without a `party_changed`. No other pack reads `party:data` (checked). OK.
- goals_bp: the fold keeps 400 by amount (about 20 KB), "*" is excluded from `ranking`; nothing else counts `g.c`
  keys, and the donor's own amount (`g.c[player.id]`) still works. OK.
- stats_bp: every `ranked()` user moved to `{ name, score }` and `placeOf`; first-index semantics kept. OK.
- milestones_bp: a share each second, flush only those ids (plus the leaver). OK.
- mail_bp: exact or unique-prefix name over the whole roster, self excluded; the dropdown index is computed after the
  sort; a typed name wins over the dropdown (documented in DOCS above). OK.
- journal_bp: one regression, fixed below.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| medium (regression) | journal_bp main.js:465 | The new "only over a sea bed" gate (`headroom < -1`) skipped the ocean climb for a diver standing on the bed: there the topmost block is the one under their feet (headroom -1), exactly as on land, so Ocean was never found there. journal-ocean only tests mid-water (y+8). | fixed 7af10f0: also climb when headroom is -1 and the block at the feet is water. New scenario journal-ocean-bed.js: FAIL on 0f4d50c, PASS on 7af10f0 |
| low | party_bp main.js:52-87 | The migration is one-way: rolling party_bp back to a published version (reads only `party:data`) shows no parties. | not fixed: forward compatibility is what's required; mention in the release notes for operators |
| low | goals_bp main.js:567, party_bp :606, milestones_bp :356, mail_bp :582 | The console test hooks write real saved data (`goals_test` adds fake donors and raises `got` on every open goal; `party_test fill` adds parties that never go away; `mail_test` pushes real players off the 400 roster). Console-only, like `realm:quests_test`. | not fixed: test-only by design; the DOCS bullets should say "for tests only: it changes the world's saved data" |
| low | milestones_bp main.js:221-240 | A player whose `check()` throws is not flushed that round (dirty kept); saved on leave or the next good check. | not fixed: no data loss beyond the existing 10 s window |
| low | journal_bp main.js:156-165 | A journal over SAVE_LIMIT keeps its id in `numbersDirty`, so it is re-stringified every 30 s (save returns false before clearing). | not fixed: one JSON.stringify per 30 s for an already-full journal |
| low | mail_bp main.js:281-286 | `more` is counted before a reply target from beyond the 60 is added, so the label's "N seen most recently" count can be one off. | not fixed: cosmetic |

No blocker or high found in the fixes; the track's deferred items (#9-#21) were re-read and their severities stand
(#9/#10 drop owed Crowns/rep silently past 300 offline players: medium/low, not item loss in normal play).

Scenario results (review, 7af10f0 except the suite which ran on 0f4d50c plus the uncommitted journal fix):
- `suite.mjs --jobs 2 --retry --filter '^(bounty|crowns|goals|guilds|journal|mail|milestones|party|quests|skills|slots|stats)-(?!ticker-scale)|^saga-party'`:
  26 scenarios, 25 pass, 1 fail: saga-party-story (failed again on retry, same baseline failure owned by
  saga-engine: "no message matching /Ann set the party's tracked quest: The Drowned Bell./"). party-many,
  party-legacy, goals-many-donors, milestones-list, mail-big-roster, quests-party pass.
- `suite.mjs --filter '^journal-'` on 7af10f0: journal-extras, journal-ocean, journal-ocean-bed pass.
- journal-ocean-bed alone: FAIL with 7af10f0's change stashed, PASS with it.
- `npm run check`: passes. `npm run build`: passes.
- DOCS addition for the lead: Field Journal, Places: "the Ocean is found swimming or standing in water 8+ deep" (no
  text change needed if the current wording already says "deep water at the player's height").

## Review

Independent review of `b25f718..7af10f0` (the track's own 13 commits on top of the master merge; head is 7af10f0, one
journal fix after the 0f4d50c the track reported). Only the track's six pack folders' `scripts/main.js` and new
scenarios changed: no manifest bumps, no edits to PACKS.md/README/NEWS/catalogs, nothing in stash_bp or saga_bp
(no overlap with #86 or #84), no cross-pack imports, no `.header(`, new text is ASCII, test hooks are `realm:`
script events limited to `ScriptEventSource.Server`. origin/master has nothing new.

Verdict: the blocker and both highs are real and fixed. No new blocker or high found, so no review commits.

| severity | file:line | issue | fixed sha / why not |
|---|---|---|---|
| ok (verified) | party_bp main.js:91-106 | Per-party properties: every mutation (create, join, remove, rename on spawn) ends in `write()`, which clears the member index, so `partyOf` never reads a stale index. Legacy `party:data` is migrated per party and removed only after its parties are written. Old code at fc646e6 + party-many: FAIL, log shows `too many parties (41781 characters)`; new: PASS. | n/a |
| ok (verified) | goals_bp main.js:81-98 | Fold to Others: total `got` kept, Others left out of the ranking. Old code at 48f0fcd + goals-many-donors: FAIL (0 / 100,000 after the restart); new: PASS. | n/a |
| medium | party_bp main.js:91-106, 118-127 | The old save pruned offline solo parties once it got near the limit. Now nothing prunes, so the party count grows without bound. Each load's `sendAllMembers` then sends one `realm:party_members` per party in one tick, through every bundled pack's listener. That is the track's #20, which grows over time now. | deferred: one-time load spike. Spread it with `system.runJob` (a few per tick), and maybe drop solo parties whose member has been gone for N days. Same fix as #20 |
| low | goals_bp main.js:85-95, 289 | A small donor can be folded into Others in the same save as their donation. If they give again they start a new count, so "You gave" shows only the new amount. The total is right. The track's DOCS note mentions it. | deferred: only on goals with 700+ donors; cosmetic |
| low | journal_bp main.js:466 | The sea-bed case (headroom -1) needs the feet block id to contain "water". A diver standing in seagrass or kelp on the bed gets no Ocean entry there. They get it once they swim up (headroom < -1). | deferred: a missed find, not lost data; add `kelp|seagrass` to that test when next touched |
| low | milestones_bp main.js:220-229 | Turns are picked by index into `getAllPlayers()`. A join or leave shifts the indices, so one player may wait up to 2x `checkSeconds` for a check. Their record is still saved on leave. | deferred: harmless delay |
| low | journal_bp main.js:147 | Saves in `beforeEvents.playerLeave` (`setDynamicProperty` on the leaving player). guilds_bp and skills_bp do the same and it works on BDS. | no change needed |
| low (process) | report | The reported head 0f4d50c was stale; the real head is 7af10f0 (journal-ocean-bed fix, scenario added but not listed). | noted here; the structured result uses 7af10f0 |

Scenario results (review run, `suite.mjs --jobs 2 --retry --filter '^(bounty|crowns|goals|guilds|journal|mail|milestones|party|quests|skills|slots|stats)-|^saga-party'`):
28 scenarios, 27 pass, 1 fail. The failure is saga-party-story, the baseline failure with the same message ("no message matching /Ann set the party's tracked quest: The Drowned Bell/"). It belongs to the saga-engine track. Passing: party-basics, party-hud-coords, party-many, party-legacy, mail-party, saga-party-coop, quests-party (fixed baseline), goals-many-donors, milestones-list, mail-big-roster, journal-ocean, journal-ocean-bed, stats-ticker, stats-ticker-scale and the rest.
Old code checks: party-many at fc646e6 FAIL, goals-many-donors at 48f0fcd FAIL (both pass at head). `npm run check` passes and `npm run build` passes at 7af10f0.
