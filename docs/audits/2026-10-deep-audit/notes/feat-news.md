# feat-news: progress events become town life (gossip, letters, titles)

Worktree /home/user/wt/f-news, branch feat/news, head 9001acd (12 commits on top of 00517e1). No manifest bumps (lead):
goals_bp, milestones_bp, bounty_bp, maps_bp, atlas_bp, caravan_bp, town_bp, tornado_bp, storm_bp, moon_bp, npc_bp
changed. mail_bp and titles_bp intake needed no change (both already bounded: mail inbox 50 / world 5000 letters /
roster 400; titles 300 per player, dedupe by name, 32-char limit).

## What was built

| Pack | Event | Sends |
|---|---|---|
| goals_bp | a Community Goal reached (by donations; not "Mark finished") | gossip `goal` {player: top contributor, name, place: goal name}; title `Pillar of <goal>` to the top contributor (`Pillar of the Town` when that passes 32 chars); `realm:mail_send` thank-you letter from "Community Goals" to each of the top `topContributors` (5, at most 10), offline ones included |
| milestones_bp | a milestone's top tier reached | title `<Milestone> <roman>` ("Miner III", "Loyal III"); gossip `milestone` {place: that title}. A tier the player already had when the pack first saw them: title only, no gossip. Top tiers reached before this update get their title once a session (backfill; Titles dedupes) |
| bounty_bp | a champion bounty claimed | gossip `bounty` {place: champion name}; title `Bounty Hunter` (sent each claim, Titles keeps/tells it once, so the first counts) |
| maps_bp | a treasure found | gossip `treasure` {player, name} |
| atlas_bp | cleared cairn / watch post (`atlas_site`, already sent) and site-count titles (`atlas`, already sent) | now rate-limited + deduped (was one per event, unbounded) |
| caravan_bp | a caravan arrives | gossip `caravan` with NO player (town news), place = arrival spot name |
| town_bp | a Town Project finished | gossip `town_project` (already sent) now rate-limited; NEW `realm:mail_send` letter from the town to each offline contributor (biggest 10), saying how much they gave and that their Crowns wait |
| tornado_bp | a player shot out the top of a tornado | gossip `tornado` about the first rider, once per tornado |
| storm_bp | Storm Glass collected from a charged rod | gossip `storm_haul` {n: glass count}, each player once per storm cell |
| moon_bp | Blood Moon survived (natural dawn) | was one `blood_moon` gossip PER SURVIVOR (100 players = 100 pieces, evicting everything); now one piece about a random survivor with n = survivor count |

### Rate limit (at the source, every sender above)
Each pack has the same small in-memory gate: at most one `realm:gossip` per in-game hour (1,000 ticks, 50 s) from
that pack, and each event key once (goal id, player+milestone, day+bounty id, player+hunt id, player+site key, visit,
town+project, tornado, cell+player, day). A gossip inside the gap is dropped, not queued (news, not a log). Titles and
letters are never rate-limited (they are per-person rewards, already one-off). The gate resets on restart (fine:
events are themselves one-off by saved flags).

### Consumer (npc_bp gossip intake only)
- Store was already bounded (`gossipMax` 24, drops oldest, 48 h expiry). Added `GOSSIP_PER_KIND` = 4: a fifth piece of
  one kind drops the oldest of that kind, so one busy pack can't push every other piece out.
- Town news: `realm:gossip` without `player` (or `player: ""`) is accepted (p = "", never "about the listener"); unknown
  town kinds use a new `news` template. Old shapes unchanged.
- Merge: within 30 min, the same player + same place replaces the older piece across kinds (Champions' `champion` and
  the Bounty Board's `bounty` about the same kill become one piece), besides the existing same kind + same player.
- Name from `msg.name` now has § codes stripped.
- New templates (hearth.js GOSSIP): goal, milestone, bounty, treasure, tornado, storm_haul, caravan, news.
- Test path: `realm:npc_debug {"action":"gossip"}` answers `realm:npc_gossip {count, kinds, last}` (newest 6, < 2048).

### Test hooks added (server console only, ScriptEventSource.Server)
- `realm:milestones_test {"player","stat","count"}` sets an online player's own count.
- `realm:caravan_test {"action":"depart"}`.
- `realm:storm_test {"action":"collect","player","x","y","z"}` (sim players' taps can't reach a rod).
- `realm:town_test "finish"` takes `donors` (offline contributors, 5 items each) and `give` (the player's own items).

## Commands and options added
None (no new player commands or config.js options). Constants: NEWS_GAP 1000 ticks in each sender, LETTERS_MAX 10
(town_bp), GOSSIP_PER_KIND 4 (npc_bp).

## Saved data
No new keys. Everything new is in memory or goes through existing consumers' stores (npc:gossip, mail letters,
titles:p:<id>).

## DOCS (for the lead, docs/PACKS.md)
- Community Goals: "When a goal is reached, the townsfolk gossip about its top contributor, who gets the title
  `Pillar of <goal>` (or `Pillar of the Town` for a long name) with the Titles pack, and each of the top contributors
  (topContributors, default 5), online or not, gets a thank-you letter with Realm Mail."
- Milestones: "Reaching a milestone's last tier gives its title, such as `Miner III`, with the Titles pack (also for
  top tiers reached earlier, the next time you join), and the townsfolk gossip about it."
- Bounty Board: "Claiming a champion bounty gives the title `Bounty Hunter` and town gossip."
- Treasure Maps: "A found treasure is town gossip." Merchant Caravan: "Townsfolk tell everyone a caravan has arrived."
- Town Projects: "Contributors who are offline when a project is finished get a letter from the town (Realm Mail):
  what they gave and that their Crowns wait for them (the biggest 10)."
- Tornadoes / Storm Chasing / Blood Moon: rider, rod haul and Blood Moon survival are town gossip; Blood Moon is now one
  piece about one survivor ("n survived"), not one per survivor.
- Townsfolk (Hearth & Hearsay): "The town remembers at most 4 pieces of one kind of news (gossipMax in all); news about
  the same player and place within 30 minutes is one piece. Town news (a caravan arriving) is about nobody in
  particular." Add `realm:npc_debug {"action":"gossip"}` -> `realm:npc_gossip` to the protocol list.
- "How the packs work together", `realm:gossip`: senders now also goals, milestones, bounty, maps, caravan, tornado,
  storm; `player` optional (town news); every sender sends at most one piece per in-game hour.
  `realm:mail_send` senders: + goals_bp, town_bp. `realm:title_unlock` senders: + goals_bp, milestones_bp, bounty_bp.
- Test hooks above (harness only), if the docs list them.

## NEWS
"The town talks about more now: reached goals, top milestones, bounties, treasure, caravans, tornado rides and storm
hauls. Goal donors get thank-you letters and new titles (Pillar of ..., Miner III, Bounty Hunter)."

## Measured cost
Event-driven only (no new intervals; milestones' backfill is one Set check per player check). 40 simulated players, 60 s
perf-soak, --only the 14 touched packs + elite_bp/mail_bp/atlas_bp: bundle 0.484 ms/tick; every touched pack under
0.15 (atlas 0.112, moon 0.084 [a one-off 78 ms startup runTimeout @ main.js:307, pre-existing], titles 0.071, elite 0.056,
milestones 0.055, maps 0.038, npc 0.034, goals 0.015, mail 0.013, caravan 0.013, storm 0.009, bounty 0.009); 19.99 TPS.
Report: scratchpad/news-perf40.json. Gossip flood bound: at most ~1 piece/50 s per pack (11 senders) into a store
capped at 24 / 4 per kind.

## Scenarios (all pass; each fails before its fix: the events did not exist, or two were sent)
goals-news, milestones-news, bounty-news, maps-news, atlas-news, caravan-news, town-news, tornado-news, storm-news,
moon-news, npc-news. Each checks the consumer (npc_bp's `realm:npc_gossip` dump; caravan-news a townsfolk greeting;
goals/milestones/bounty the Titles chat line) and the rate limit (second event: no second gossip).
Regression: `suite.mjs --filter` over the 11 new + atlas, npc-hearth, maps-party, maps-hunt, tornado-pull, storm-cell,
moon-join, goals-*, milestones-list, rook-race, bounty-water, caravan-traders, calendar, relics-ascension,
skills-calling: 28/28 pass, 0 flaky.
`npm run check`: only check-versions fails (expected). `npm run build`: ok.

## Requests for the lead
- Bump the 11 packs above. check-events.allow.json needs nothing (the new payloads are capped).
- Other gossip senders not in my scope have no source rate limit (calendar, elite champion, fishing legendary, guilds,
  meteor, relics, saga, skills, expedition); npc_bp's per-kind cap now bounds them on the consumer side. Elite's
  `champion` gossip on a 100-player server with many champion kills is the likeliest flood: same 1-per-hour gate there.

## Review (independent reviewer, head beedee4)

Verdict: ship. No blockers or highs. One medium fixed (beedee4), the rest deferred.

| sev | pack | file:line | trigger | fix / status |
|---|---|---|---|---|
| medium | goals_bp | main.js:173 | operator changes the world setting Top contributors (3-20): letters still went to CONFIG's 5 | use `get("topContributors")` (capped 10); places named up to "tenth" instead of "the number 6 most". fixed beedee4 |
| medium | mail_bp (consumer) | main.js:557 | automated letters (goals 10/goal, town 10/project, plus older npc letters) to players who never come back: each inbox caps at inboxLimit 50 unread, but roster 400 x 50 = 20,000 > MAX_LETTERS 5000, so over months they can fill the realm's mail and block player-to-player mail ("The realm's mail is full") | deferred, request for the mail owner: give pack letters (`f: ""`) a smaller unread cap per inbox (e.g. 10, dropping the oldest unread pack letter) or an expiry, so pack mail never consumes the world cap |
| low | town_bp / goals_bp | scenarios | LETTERS_MAX 10 and the 10-letter goal cap are not exercised (3 donors) | deferred: bounded by inspection |
| low | npc_bp | main.js:1270 | a sender that omits `player` for a kind with a {name} template (not a town kind) now renders "{name}" empty instead of being dropped; calendar carve_off/regatta/siege always send a player, so no current sender | deferred |
| low | milestones_bp | main.js:221 | backfill re-sends every top-tier title_unlock (<= 9) on each join forever; Titles dedupes silently (no second "New title" line), cost negligible | deferred: could persist a flag |
| low | calendar_bp (out of scope) | main.js:1833 | Siege still sends one gossip per participant (same flood class as the old Blood Moon); bounded by npc_bp's GOSSIP_PER_KIND 4 | deferred to the lead with the other unlimited senders |

Checked and fine: every new sender goes through the per-pack gate (1 per 1000 ticks, key Set capped at 64) and only atlas/maps/town/goals/milestones/bounty/caravan/tornado/storm/moon send; all payloads < 300 chars (names/places sliced 48, bodies 600, subjects 40); npc store bounded (24, 4 per kind, 48 h), saved shape backwards compatible (p "" passes loadGossip's filter); titles never doubled (Titles dedupes case-insensitively; moon keeps PROP_SURVIVOR; goals once via g.m/g.done; "Mark finished" does not celebrate); no awaits added, storm collect runs in system.run, tornado/maps/atlas paths synchronous; test hooks Server-only; ASCII titles (goals plain()); no cross-pack imports, no .header(), stable APIs. No per-tick work added, so perf-soak not re-run (feature's own 40-player run: bundle 0.484 ms/tick).
Runs: npm run check passes up to check-versions (only version bumps, expected); npm run build ok; suite of 11 *-news scenarios 11/11 pass.
