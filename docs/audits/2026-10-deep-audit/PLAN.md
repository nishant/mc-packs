# Follow-up plan: everything left open after the October 2026 deep audit

This is the work plan for the agent that finishes what the deep audit (mc-packs PR #92, hosting PR #105) left open. It
covers the 10 follow-up tasks suggested at the end of the audit and every other open item found since. Nothing from
`OPEN.md` (items O1-O75 plus the backlog) is left out: each item appears below in exactly one workstream, the owner
decisions or the backlog. Finish every workstream, or record in `OPEN.md` why an item is not done.

## 0. Read first

- `CLAUDE.md` in both repos (mc-packs and hosting): the ship rules, hard rules, commands, the performance budget,
  diag.js first in every main.js, sync-diag after every version bump, and never `world.clearDynamicProperties()`.
- `docs/WORKING.md`: finishing order, subagents and worktrees, API quirks, the recurring bug checklist C1-C28 (apply
  it to every pack you touch), and keeping a session cheap. `docs/PACKS.md` is about 1 MB: read one `## ` section
  at a time, and never open the generated catalogs.
- This folder: `OPEN.md` (the same items with ids), `notes/<track>.md` (findings tables with file:line from the
  audit), `deferred.md` (the triage), `phase3-report.md` and `phase3-recheck.md` (suites and soaks after),
  `baseline.md` and `perf-tables.md` (before), `history.md`, `brief.md` (what the owner is going for) and
  `common-brief.md` (the per-track brief the audit used: reuse it for your subagents). Paths like
  `/home/user/wt/<track>` in the notes were the audit's worktrees; that work is all on `master` now.

## 1. Ground rules for every workstream

1. **Branches and merging.** Use one branch per workstream, in its own git worktree with `node_modules` symlinked.
   Merge `origin/master` in when you start, before the final checks, and before handing back. Merge, never rebase
   or force-push. The lead merges the workstream branches into one integration branch with `--no-ff`. Never commit
   the `node_modules` link (`.gitignore` now has `node_modules` without a slash).
2. **Who edits what.** A workstream edits only the packs and tools listed for it. The lead edits `docs/PACKS.md`,
   `README.md`, `docs/NEWS.md`, `docs/WORKING.md`, `CLAUDE.md`, `docs/SERVER_SETUP.md`, the generated catalogs and
   every manifest version. Each workstream writes its docs text (Commands rows for players with defaults and option
   names, Configuration, Saved data, How to use steps) and its NEWS lines into a notes file for the lead.
3. **Shared copies.** `settings.js`, `zones.js`, `side.js`, `diag.js` and `name-labels.js` are synced from
   `tools/*-shared.js` by `tools/sync-*.mjs`. Never edit a pack's copy. Change the shared file and rerun the sync
   (only the workstream that owns that shared file does this).
4. **The other contributor and the owner's amended decision.** Close msftMyt's PRs #84 and #86 **unmerged**,
   preserve their heads, diffs and tests, and rebuild their intentions on latest master as part of this plan.
   Do not push to or delete those branches, cherry-pick stale whole files, or undo master's performance fixes.
   #84's player-local `variable.life`, `variable.style` and `variable.color` outline bindings belong to W6/O37.
   #86's genuine-pickup routing and manual fill-earlier-pages action belong to W3/O17, preserving native item
   metadata, slot order, hotbar, cursor, controls, recovery and idle fast paths. Reuse O73's transfer design.
   Closing the PRs resolves O67's disposition only, not those replacement features. See W0.
5. **Tests.** Every behavior fix gets a BDS scenario `tools/test-bds/examples/<pack>-<topic>.js` (with its run command
   in the header) that fails on the old code and passes on the new. Prove both. Unit-level logic goes in
   `tools/*.test.mjs` (run by `npm run test`).
6. **Performance.** The budget is the whole bundle under 5 ms/tick at 40 players, a typical pack 0.15 ms or less, and
   the heaviest (Minimap, HUDs) 1 ms or less. Measure before and after with the profiler and change performance only
   when the measurement says so:
   `node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json <out> [--only <packs>] --scenario tools/test-bds/examples/perf-soak.js --arg players=N --arg seconds=S --timeout 4000`.
   The historical audit host had 4 Linux cores. The follow-up host is Windows with a Ryzen 7 5800XT
   (8 cores / 16 logical processors), Node 22.17.0 and BDS 1.26.52.3. Do not compare hosts as if matched.
   Run at most 2 BDS jobs at once globally, coordinated with other sessions; performance runs alone.
7. **Rules from CLAUDE.md that bit before.**
   - Stable APIs only (`@minecraft/server` 2.1.0, `@minecraft/server-ui` 2.0.0).
   - Game text is plain ASCII. Never use a form's `.header()`.
   - `realm:` command namespace and script events under 2048 characters.
   - Send `realm:actionbar` before every `setActionBar`.
   - Check ids against `@minecraft/vanilla-data`.
   - Keep saved data backwards compatible: existing worlds keep their data and published store keys stay.
   - Confirm before anything irreversible or realm-wide.
8. **Finishing (every release).**
   1. `npm run check` and `npm run build` pass (CI runs both on the PR).
   2. Bump every changed pack, then `node tools/sync-diag.mjs`, then the catalogs (admin, help, gen-news) last.
   3. PR to `master` and merge it with a merge commit.
   4. In hosting `minecraft/`: run `publish-packs.mjs` with `--notes` and `--pack-notes <folder>="..."` for every
      bumped pack, then `pack-docs.mjs` and `--check`, then `check-site.mjs realm` (plus `commands` when commands
      changed).
   5. PR and merge in hosting, then `check-live.mjs`.
   6. Give the owner a summary with numbers, plus the new bundle files.

   One integrated publish at the end beats a publish per workstream. Review before the first publish.
9. **Mark items done in `OPEN.md`** (`O12 done in <sha>` or `O12 won't fix: <reason>`) in the same PR.

## 2. Order and parallelism

Several workstreams touch the same packs, so run them in waves. Within a wave, at most 3 agents at a time, each in its
own worktree. After each wave, merge into integration, run `npm run check` and the scenarios of the touched packs, and
merge `master` in.

**Owner-directed urgent acceleration:** once W0's untouched pack/harness snapshot and genuine offline RED tests are
frozen, isolated O75 lifecycle authoring and O74 story-data authoring may overlap the unchanged W0 suite/profiles.
Keep their file ownership separate and the total at 3 workers including W0. No additional native work, heavy local
checks during exclusive profiles, or integration/merge/publication is permitted before W0's final evidence.
Afterward, review and validate O75 first; merge its reviewed fix into O74 before O74's native acceptance. Durable
workflow checkpoints adopt the isolated helper commits and evidence instead of launching duplicate implementations.
This exception does not start later waves or relax any release gate.

| Wave | Workstreams | Why this order |
|---|---|---|
| 0 | W0 preconditions | Baseline, msftMyt PRs, cleanup |
| 1 (first) | W13 owner-reported bugs: O75 softlock and O74 the crater quest before anything else | Players hit these on the live Realm today; ship them as their own release before the rest of the plan |
| 1 | W12a harness fixes, W11 script events and action bar, W7 checks | Tests and protocol that everything else measures with; W11 touches every pack's listener, so it goes first and alone among the pack editors |
| 2 | W3 items, W4 stores, W9 Easy Building | Item safety first; W4 and W3 share stash and expedition but different files (agree on boundaries in the briefs) |
| 3 | W6 story, W10 town news, W8 operator tools | saga_bp waits for msftMyt's PR #84 (W0); W8 and W4 both touch nick and titles, so W8 runs after W4 |
| 4 | W5 public-server protections, W12b stability | W5 shares mail, party and nick with W4 and W8 |
| 5 | W1 performance at 40 and 100 players | Measure last, after every behavior change, then tune |
| 6 | W2 real-client pass (needs the owner), integration review, full suite, soaks, publish | See section 4 |

Pack overlap to plan around:
- map_bp: W1, W4.
- elite_bp: W1, W10, W12b.
- expedition_bp: W1, W3, W12b.
- mail_bp and party_bp: W4, W5.
- stash_bp: W3 and W13 (O72, O73).
- saga_bp: W6, W13 (O68, O74, O75).
- stats_bp: W1 (O6), W13 (O71).
- map_bp and hud_rp: W1, W2, W13 (O69).
- find_bp: W5 (O28), W13 (O70).
- nick_bp and titles_bp: W4, W5, W8.
- stash_bp and refill_bp: W3.
- build_bp and build_rp: W9, plus W11 for the action bar.
- every pack: W11 (listener) and W12b (spawnFresh module).

## 3. Workstreams

### W0. Preconditions and cleanup (lead)

- [x] Fetch both repos and every branch. List the open PRs in nishant/mc-packs and nishant/hosting.
  At W0 start: source `7eb5f72c`, hosting `f6b4972f`; source had only #84/#86 open, hosting had none.
- [x] **O67 disposition only:** the owner directed closing #84 and #86 unmerged and carrying their intentions
  into this audit. Both were archived and closed unmerged on October 19, 2026 (UTC):
  [#84](https://github.com/nishant/mc-packs/pull/84), head `7801855e50d47decd7d1099b7ea6fb6cf6ae3bce`;
  [#86](https://github.com/nishant/mc-packs/pull/86), head `0e54ff14ea36bdba1e7bbb549d5dddd66e405788`.
  Their branches remain intact. W6/O37 and W3/O17 now implement and verify the preserved outcomes on current
  master; neither waits for an old PR merge. O73 and O17 share one item-transfer design.
- [x] Delete the stale remote branch `audit/integration` in mc-packs, after confirming it is fully in `master`.
  Exact head `24f1b547456e1dc70debce1f6f88039f540dbe65` was rechecked as an ancestor of `7eb5f72c` before deletion.
- [x] Fresh baseline on current master: `npm run check`, `npm run build`,
  `node tools/test-bds/suite.mjs --jobs 2 --retry --json <out>`, and perf-soak with `--profile` at 10, 40 and
  100 players (300 s each). The owner approved 100 as the missing final before comparator. Freeze untouched
  latest-master pack bytes first; keep source/harness identities, per-file hashes, first failures, retries,
  skips and warnings. Exit zero is not an all-pass claim. These are the "before" numbers.
  Fresh Windows results: check/build pass; 219 scenarios, 204 pass / 14 fail / 1 flaky / 0 skipped / 0 timed out.
  Thirteen failures are Windows hook-recipe paths; `guilds-placed-restart` failed twice; `saga-escort` passed its
  retry. At 10/40 players: 4.521/7.546 ms/tick, 19.92/19.80 TPS. The first requested 100 run spawned only 97
  and is invalid as a 100-player comparator. An isolated retry with identical default geometry, packs and
  300-second workload spawned and retained all 100: 11.748 ms/tick, 14.34 TPS. These are summed separate-pack
  callback costs, not a one-context Realm Bundle measurement. All 2,435 tracked files, including 2,002 pack
  files and 239 original harness files, hash-match the frozen source. Failures and warnings remain visible.
  The audit's historical after-numbers are in `phase3-report.md`: bundle 6.56 ms at
  10 players, 9.74 at 40, 8.28 as one bundle; map_bp 3.96 at 40; 219 scenarios, 216 pass after the recheck.

### W1. Performance budget at 40 and 100 players (suggested task 1)

Packs: map_bp, saga_bp, silly_bp, wander_bp, elytra_bp, stash_bp, relics_bp, durability_bp, calendar_bp, elite_bp,
moon_bp, expedition_bp, npc_bp, build_bp (measurement only; W9 does build_bp's fix), plus hud_bp, stats_bp and
party_bp for O6. Tools: `tools/test-bds/suite.mjs`, perf-soak.

- [ ] **O1 (high)** The bundle is 8.3-9.7 ms/tick at 40 players against 5 ms, and map_bp alone is 3.96 ms against
  1 ms. Make map_bp's redraw, scan and passes cheaper (main.js around :749, :1280, :1380; budgets in budget.js;
  `budgetLevel` low, normal and high). Then bring the bundle under 5 ms at 40 players, or document exactly why not.
- [ ] **O2** Bring each pack over 0.15 ms/tick at 40 players under budget or justify it: silly 0.38, wander 0.36,
  elytra 0.34, stash 0.26, saga 0.23, relics 0.22, durability 0.18, calendar 0.15.
- [ ] **O3** elite_bp and wander_bp get 5-12x more expensive over a soak as night falls (elite auraLoop main.js:876,
  wander updateLabels main.js:1510): cap the work per entity count. Champion density should scale with online
  players (`maxAlive` per player or per area, instead of a fixed 8, or 16 in the Large profile); update the Large
  server profile in admin_bp presets.
- [ ] **O4** bedrock_server memory grew about 8.7 MiB/min (+126 MiB in 15 min) at 40 players without leveling off. Run
  a 60-minute soak with an RSS sampler. Confirm or rule out a leak, and find its pack if it is one.
- [ ] **O5** 100-player soaks (perf-soak with `players=100`, and the saga quest perf scenario at 100). Watch whether
  map_bp's keep-alive resends use up `drawBudget` (strips blink out), and whether the story tracker (about 0.8 ms at
  40 with quests) can skip unchanged draws for idle players.
- [ ] **O6** Split `realm:hud_state` into `{part, parts, players}` like the safe zones protocol (it lists only 100
  players; above that, stats and the Party HUD draw over the HUD). Join the parts in stats_bp and party_bp.
- [ ] **O7** Blood Moon at scale (moon_bp): each wave attempt runs a 9x9x9 containsBlock check over 641 block types.
  Cache "built" per 8-block cell for the night, and add a world cap on Blood Moon monsters (an option, docs and an
  admin_bp Large preset).
- [ ] **O8** Expeditions allow at most 3 runs of 4 players. Allow 5-6 slots within the ticking-area budget (shown in the
  setup checklist), or a real queue that starts the next waiting party when a slot frees.
- [ ] **O9** `suite.mjs --perf 10,40,100` must exit non-zero over budget. Add it and `weather-crowd.js` (the only
  scenario with weather events) to WORKING.md's finishing order. Batch tornado sounds by distance band.
- [ ] **O10** Re-measure these D rows and act only if over budget:
  - the npc_bp 10-tick label loop (0.20 ms; real clients first, see W2)
  - build_bp's preview floor of 0.38 ms (measure without the profiler)
  - map_bp's rebuild wave every 200 ticks
  - Expedition build steps of 25-31 ms (only if hitches show)

  Also watch the map.js load flake.

### W2. Real-client acceptance pass (suggested task 2; needs the owner and real devices)

BDS simulated players render nothing, so a person checks these on a phone and a PC in a **private test world, never the
live Realm**. The agent prepares a checklist page or doc with exact steps and what to measure, and the owner runs it.
The agent then fixes what fails, pins layout numbers in `tools/hud-layout.test.mjs`, and ships. Record measurements,
not guesses (C1: about 17 commits went to guessed HUD sizes).

- [ ] **O11** Name label resend timing for townsfolk and traders (1 s and 3 s after a player comes near;
  `tools/name-labels-shared.js`). Then lock the label design with a test, to end the C2 rework (6 designs so far).
- [ ] **O12** The story quest box (hud_rp `hud_screen.json`, about 200x110, up to 10 rows): size and placement at
  Right 1-3 and Middle next to the radar and the other side boxes, on a phone. Cap the height, or anchor it on its
  own, or drop the Middle choice.
- [ ] **O13** The one-line Coordinates HUD (hud_bp) with party mates and stats extras reaches 130-170 characters. Wrap
  it past about 70 characters if it doesn't fit on phones; use `, ` between mates; show at most 2 mates.
- [ ] **O14** The tornado funnel may look doubled for viewers 64+ blocks away.
- [ ] **O15** The Minimap at `budgetLevel` low, normal and high while walking, flying and at a crowded spawn.
- [ ] **O16** saga actors.js label sync should exclude spectators (`getPlayers({ excludeGameModes: [Spectator] })` and
  `spectatorsExcluded`), like the other label users. This one is a code fix that needs no device.

### W3. Expansive Inventory and item safety (suggested task 3)

Packs: stash_bp, refill_bp, expedition_bp (gauntlet.js only). Tools: `tools/stash-pages.test.mjs`,
`tools/test-bds/examples/refill-pages.js`. Any item loss or duplication is blocking.

- [ ] **O17 (high, perf)** `refillFromPages` (stash_bp pages.js) loads every other page's structure snapshot for each
  used-up stack, up to 24 loads; scans and the menu's usage figures load pages too. Record item ids and counts per page
  in the committed page index at save time, so these load only the pages that hold the item. Existing saved pages
  must load unchanged. Add Hotbar Refill to perf-soak. Rebuild closed PR #86's genuine-pickup routing to earliest
  eligible pages and manual fill-earlier-pages action on current master, without sorting or losing metadata,
  hotbar, cursor, reserved controls, recovery quarantine or idle fast paths. Reuse O73's transfer primitive.
- [ ] **O18** `/realm:inv_recover <player>` (operators only, with a confirmation) restores a retained before-image into
  a chest next to the operator when a page's inventory recovery is pending. Document it in the Quick Stack & Sort
  section of PACKS.md.
- [ ] **O19** Close the Expeditions stash cart window: a disconnect in the roughly 4-tick window while the carts are
  placed, plus someone breaking the carts, places the structure again (a copy). Record `seen: true` once the carts
  are found and re-place only when they never were. Add a restart scenario.
- [ ] **O20** refill-pages.js: add cases for "none on any page, many pages" and locked or named stacks.
- [ ] **O21** Make `expedition-nether-carts.js` a real fail-before test: it passes on the old code. The bug needs a
  player who spawned in the Nether and stayed there, while Expeditions teleports home first. Find a setup that
  reproduces it, or drop the claim from the header.
- [ ] **O22** Docs: cross-page refill can use a Flight 1 rocket stack in place of a Flight 3 one mid-glide (rockets
  are kept on purpose, so the mid-glide refill works). Say so in PACKS.md.

### W4. Bounded stores for offline players (suggested task 4)

Packs: cooking_bp, relics_bp, bounty_bp, guilds_bp, town_bp, fishing_bp, mail_bp, goals_bp, nick_bp, titles_bp,
party_bp, map_bp (O26 only).

- [ ] **O23** Owed rewards for offline players are either unbounded or silently dropped:
  - cooking_bp `cooking:owed`, relics_bp `relics:pending`, fishing_bp `fishing:owed` and cooking_bp `cooking:pending`
    can pass 32 KB.
  - bounty_bp and guilds_bp cap at 300 and drop the rest silently.
  - town_bp `town:owed` sits in one property, which fails past about 900 players.

  Design one per-player layout (`<pack>:owed:<playerId>` plus a small bounded index; the oldest is dropped with a log
  line, never silently), migrate existing data on load, and apply it to all of these.
- [ ] **O24** Letters sent by packs (goals_bp, town_bp since the town news feature) to players who never return: each
  inbox caps at 50 unread, but 400 such players x 50 = 20,000, above mail_bp's 5,000-letter realm cap. That would
  block player-to-player mail. Give letters from packs an expiry (for example 30 days) or a lower inbox cap than
  player letters.
- [ ] **O25** Prune the per-player entries of players gone N days (a config option): `nick:g:*`, `titles:p:*`, and
  party records (drop solo parties whose member has been away N days; needs last-seen per member). Today the only
  removal is forgetting a whole pack.
- [ ] **O26** An operator reset for map_bp's `map:wp` and `map:marks` (`/realm:map_reset`: online players now, the
  rest on join). They are player properties, which Pack diagnostics' forget keeps.

### W5. Public-server protections (suggested task 5)

Packs: claims_bp, find_bp, mail_bp, party_bp, crowns_bp, nick_bp.

- [ ] **O27** Land Claims:
  - Protect tamed and farm animals in a claim from outsiders.
  - Handle fire spread and flowing lava or water where the stable API allows. Say in the docs what it cannot do
    (pistons, endermen).
  - Add a per-claim "visitors may open doors" switch.
  - Add an operator audit list: claims by size and the owner's last visit.
- [ ] **O28** Chest Finder privacy: the 2,000-container index is world-wide, so anyone sees other players' unlocked
  chests. Index only containers the player opened, owns or that are shared, with an operator switch for the old
  world-wide index (default private on new worlds, unchanged on existing ones).
- [ ] **O29** Mail and party moderation: a per-player block list, an operator "delete every letter from X", a
  per-sender unread cap, and a party chat mute plus a 1 s cooldown. Pruning parties is in W4 (O25).
- [ ] **O30** A Crowns ledger (`/realm:crowns_audit`, the last 200 pays and gives in a world property) and a daily pay
  limit per player.
- [ ] **O31** A reserved nickname list (Admin, Owner, Server, the operators' gamertags) in nick_bp config.

### W6. Story portability (saga_bp; suggested task 6)

Packs: saga_bp (engine and `scripts/stories/`), cooking_bp (O35 lore mark only). Read docs/STORY_BIBLE.md first.

- [ ] **O32** A town anchor: 15 steps in 7 stories assume the town is at world spawn (place steps and illager waves
  land on a public spawn hub). Add `/realm:saga_place town` (operators; default world spawn) and resolve
  near-spawn offsets from it.
- [ ] **O33** Time stopped: 78 required steps can never finish with `doDaylightCycle` off. Treat a time window or night
  as met (or let operators skip it), count `wait` days as 20 real minutes while the cycle is off, and drop "in about
  N min" when time isn't moving.
- [ ] **O34** A started story whose required `pack:` was removed waits forever: show "needs <pack>" in the story log.
  Gristle is split over two objectives: use a `fallback:` objective or an OR in `when`, with a scenario for cooking
  on / elite off and a real kill.
- [ ] **O35** Named-item steps match by name only, so an anvil-renamed beetroot passes as a Champion's Heart. Also
  match the Kitchen's dish lore mark.
- [ ] **O36** The fallback champion (used when the Champions pack is absent) is never removed if its chunk was
  unloaded at world load: keep the ids spawned this session and remove any other `saga:champion` on entityLoad.
  Saves over 32,767 characters throw: trim codex order, old favors and `ut` past 30,000, then refuse new codex
  entries with a message. Add a maxed-save unit test.
- [ ] **O37** Rebuild closed PR #84's player-local outline binding fix on current master first:
  `variable.life`, `variable.style` and `variable.color` must match the particle shader, with regression tests.
  Then run the interact outline scan (up to 10,625 blocks in one tick) as a runJob. Fix the saga-escort flake:
  the villager's look-at AI turns Pell, so suppress that goal during escorts or check body yaw.

### W7. Checks and the story bible (suggested task 7)

Tools: `tools/check-stories.mjs`, `tools/check-ids.mjs` and its allowlist. Docs: docs/STORY_BIBLE.md (lead edits it
from this workstream's text).

- [ ] **O38** check-stories should warn on:
  - partial block color families
  - reused cast names and wanderer `who.id`s
  - pack-only items without a `pack:` gate
  - unknown champion traits
  - rewards above the scale in STORY_BIBLE.md and RPG_DESIGN.md
  - gather items overlapping a once-built prefab without a signposted alternate, considering any objective
    type that references that prefab in the chapter; keep finite interact targets as a separate warning
    (the `seal_tide` sea lanterns can also be mined out)

  Fix or allowlist (with a reason) what it finds.
- [ ] **O39** check-ids:
  - One id set per kind (block, item, entity).
  - Vendored particle and sound id lists from Mojang's bedrock-samples.
  - Also check bare ids in plain data lists and regex alternations (the `dead_bush` and `note_block` cases).

  Keep it fast and deterministic, and keep the allowlist reasons.
- [ ] **O40** Update docs/STORY_BIBLE.md "As shipped": Gristle and NO_KITCHEN, Prewitt, Brynn, Rosalind, Saltwife.
  Add the writing rules: no reused names or wanderer ids; list every color and wood.

### W8. Operator tools (suggested task 8)

Packs: titles_bp, nick_bp, welcome_bp, admin_bp.

- [ ] **O41** titles_bp: a "Take it away" toggle in Give a title and `/realm:titles_take <player> <title>`, for titles
  from any pack. Regenerate the admin and help catalogs.
- [ ] **O42** Big-server lists: page or search the operators' nickname list (one button per nickname today), and index
  title holders by lowercase name like `nick:g:`, so titles_give for an unknown name stops parsing every saved player.
- [ ] **O43** welcome_bp's default welcome is this Realm's own text ("Tap Old Tobin or Mara in town", house rules).
  Make a default that fits a brand-new world, built from the installed packs like the news tips are. Keep any
  welcome an operator saved; the owner decides the live Realm's text.
- [ ] **O44** Set up this world: `showWaiting` leaves the `resumed` flag set (one extra tap), and an unhandled
  rejection is logged when a player leaves mid-form.
- [ ] **O45** Pack diagnostics: a `diag_forgot` answer arriving after 40 ticks makes the operator see "nothing was
  deleted" when it was (wait longer or report late answers). Keys whose prefix no pack touched since reload stay
  unowned: decide ownership from the pack's known prefixes.

### W9. Easy Building (build_bp, build_rp; suggested task 9)

- [ ] **O46 (owner decision)** Easy Building is a port of Effortless Building v5.0 with no license or credit in the
  pack. Ask the owner to confirm the upstream license and the credit wording, then add a credits file to the pack and
  a line in PACKS.md. Publish no wording the owner hasn't approved.
- [ ] **O47** BlockPlacer has 16 `<color>_bed` cases (Java ids), but Bedrock has one `minecraft:bed` with a color
  state, so the special two-block bed handling never runs. Rewrite it for Bedrock, test placing beds in every build
  mode, and remove the bed entries from `tools/check-ids.allow.json`.
- [ ] **O48 (medium, perf)** The two runInterval(1) loops (core/Preview.js:1053, ModifierVisualizer.js:166) cost
  0.4-1.1 ms/tick when nobody holds a building tool. Run them only while a tool is held, then re-measure.
- [ ] **O49** Four small bugs:
  - FloatingPanels.js:318 writes the action bar with no `realm:actionbar` request and no `lockActionBar`.
  - `idleSkip` uses a shared tick, so a loop whose period is a multiple of 5 never sees idle players.
  - `minecraft:end_gateway` (BlockDestroyer.js:19) is unconfirmed as a Bedrock id.
  - elite_bp's built-block regex (main.js:519) has Java `note_block`, while Bedrock's is `noteblock`. Edit that line
    with W1/W12b's agreement, since they own elite_bp.
- [ ] **O50** build_rp defines `eb.help.btn.guided` and `eb.set.book_language.tip` twice in every lang file: remove the
  duplicates (the last one wins today).
- [ ] **O51** A world `defaultMaxBlocks` separate from `maxBlocksCap`. Raising the cap today raises every player's
  default too. Add a public-server preset (operators only, 2,000 blocks, no Infinite Reach) to the Large profile.

### W10. Town news follow-ups (suggested task 10)

Packs: elite_bp, calendar_bp, fishing_bp, meteor_bp, expedition_bp, guilds_bp, relics_bp, skills_bp (calling.js),
saga_bp (ui.js), npc_bp (gossip intake), milestones_bp.

- [ ] **O52** Rate-limit gossip at the source in every remaining sender, with the gate the town news feature uses:
  at most one gossip per pack per in-game hour (1,000 ticks), each event once, and a seen-events list capped at 64.
  The senders are:
  - elite (champion kills, the likeliest flood)
  - calendar: Siege (one gossip per participant today), plus carve_off and regatta
  - fishing, meteor, expedition, guilds, relics, skills, saga

  npc_bp keeps at most 24 pieces and 4 per kind. Add one scenario per sender group showing that the limit holds.
- [ ] **O53** npc_bp shows an empty `{name}` for a non-town kind sent without `player`: use a template without a name.
  milestones_bp re-sends up to 9 title unlocks on every join: save a flag. Add a scenario for goals' LETTERS_MAX 10
  (letters to the top contributors, capped at 10).

### W11. Script events and the action bar (cross-pack)

Packs: every behavior pack (the listener change) and maps_bp. Tools: `tools/check-actionbar.mjs`. This workstream runs
alone among the pack editors in its wave, because it touches every pack's main.js.

- [ ] **O54 (medium, perf)** The bundle has 237 `scriptEventReceive` subscribers, and every `realm:` event wakes all
  of them. That is most of the bundle's ~550 calls/tick. Give each pack one listener that dispatches by id, with its
  test hooks and the `realm:help_ping` responder folded in, and keep diag.js's wrapping working. Measure the bundle
  before and after.
- [ ] **O55 (medium)** maps_bp's warmth line (main.js:571) redraws every 40 ticks with a 45-tick hold, without `steady`
  and without listening. While a treasure map is held, the steady lines (saga 20, build 30, expedition 40, relics 45,
  elytra 50) wait indefinitely. Make it a proper steady line with a rank, or a short request per change.
- [ ] **O56** Tighten check-actionbar's helper detection, so cases like FloatingPanels.js:318 (O49) are caught. The
  hud_bp and stats_bp empty-string clears stay allowlisted, with their reason.
- [ ] **O57** One shared weather source: Rain Extras, Storm Chasing, Regional Weather, Tornadoes, Rainbows, Night and
  Moon each keep their own `<pack>:weather` guess. Read `realm:weather_plan`'s `now`, and ask with
  `realm:weather_ask` at load, so a pack added mid-storm knows at once.

### W12. Stability, the harness and CI

**W12a (wave 1): harness and CI.** Tools: `tools/test-bds/`, `.github/workflows/check.yml`, a new `tools/release.mjs`.

- [ ] **O60** Harness bugs:
  - `--flat` world templates get a random spawn point (261,5 on one cache, 0,0 on another); meteor-edge and
    expedition-nether-carts depend on 0,0. Pin the spawn in the template, or make those scenarios use the world spawn.
  - A template race with `--jobs > 1` on a fresh cache (tools/test-bds/lib/server.mjs).
- [ ] **O61** Run the harness on the Realm Bundle as one script context (catches C13 canceled-event bugs that
  separate packs hide; `tools/test-bds/hooks/diag-bundle.mjs` shows how). Add a short BDS smoke test to CI (CI runs
  only check and build today), and `tools/release.mjs` for the whole publish order: merge, catalogs, versions,
  sync-diag, build, publish, pack-docs, check-site.

**W12b (wave 4): stability.** Packs: elite_bp, moon_bp, plus every pack with a `spawnFresh` copy, and expedition_bp.

- [ ] **O58** Every soak logs a recurring `[elite] InvalidEntityError ... dimension` 1-5 times, from the
  `console.warn` catches around elite main.js 167, 176, 433, 437 and 646. One soak also logged
  `[moon] InvalidEntityError hasTag`. Add the missing `isValid` checks in those hot paths.
- [ ] **O59** `spawnFresh` exists as separate copies in elite, saga, atlas, domt, expedition, calendar and moon. Make it
  one shared module with a `tools/sync-spawn.mjs` and `--check` (C14); the moon copy already broke once (5018ece).
- [ ] **O62** Expeditions: an option to announce clears only from a chosen level (chat noise on big servers), and
  forget should also remove saved structures (stash and parcel structures stay behind today).

### W13. Owner-reported bugs from the live Realm (October 19; wave 1, first)

Reported by the owner from real play on the live Realm, with screenshots in `media/`. These are what players hit
today, so they go first. O74 and O75 are blockers: a quest that can't be finished, and a softlock. Each fix needs a
scenario that fails before and passes after. Where BDS can't show the effect (O69, O70), do a real-client check as
in W2.

- [x] **O75 (blocker) Softlock in Signs in the Sky (act1_signs.js, the "Search the Old Graveyard for clues (4)" step
  plus "Put down 6 zombies that rise in the graveyard at night").**
  - **What happened** (`media/graveyard-softlock.webp`, `media/graveyard-dead-no-respawn.webp`): the player tapped
    (left click) an empty spot in the Old Graveyard while searching for clues, with the zombies around.
    - The player could no longer move or interact.
    - Then the camera froze too.
    - When another player killed them, no respawn screen appeared; pressing Escape brought it back.
  - **Suspects:** whatever the clue tap runs, most likely the clue reveal in saga_bp objectives.js around :2286
    (`player.camera.fade(...)`, next to a "no camera control" comment). Look for a fade or camera set that is never
    cleared, input permissions that are never restored, or a modal or cutscene left waiting on a player who was hit,
    died or was busy.
  - **Investigation constraint:** this graveyard step is `inspect`, not the separate `playVision` fade path.
    Prove the automatic `clueFound` form/exclusive-lock lifecycle before attributing the reported freeze to a
    camera fade. Stable UI 2.0.0 exports `uiManager.closeAllForms`; assess ownership before using it.
  - **Fix:** every owned camera, input or fade change is cleared on finish, on death, on leave and on a dimension change
    (C17), with a safety timeout. A tap on empty ground does nothing. Grep all packs for camera.fade, camera.setCamera
    and input permissions, and apply the same rules (expedition_bp main.js:1629, waystone_bp main.js:627).
  - **Test:** a scenario that taps empty ground and a clue while a zombie hits the player and the player dies mid-reveal.
- [x] **O74 (blocker) A quest that can't be finished: Signs in the Sky, "Fallen Light"** (act1_signs.js:133, "Gather
  8 amethyst shards" at the Starfall Crater; `media/crater-mined-out.webp`).
  - The first players who did the quest mined out all the crater's amethyst. A party mate who started it later had
    nothing left to mine.
  - Make every world-built gather step completable for each player who takes it:
    - regrow or reset the crater's amethyst when someone accepts (or reaches) the step, or
    - place a per-player supply, or
    - credit shards a party mate already handed in, or
    - accept other sources (any amethyst shards in the inventory) and say so in the hint.
  - **Approved least-destructive route:** collection already accepts any matching inventory shards. Make the
    hint explicitly explain another geode or a party mate, and verify late players, existing/partial inventory,
    restart and exactly-once rewards. Do not regenerate player-modified terrain or add repeatable free supplies.
    The misleading hint must fail its before test; already-working inventory credit is not an engine bug.
  - Audit every story step that depends on blocks the world builds once (crater, ruins, caches) for the same problem.
    Add a check-stories rule for collect steps that rely on a built structure (W7).
- [ ] **O68 The quest box cuts text off with "..."** (`media/quest-box-cut-off.png`, `media/crater-mined-out.webp`).
  - Examples: "Party quest: you finished it, so you're helping. Your party...", and "[x] Touch the crater's...".
  - Wrap long lines over more rows instead of truncating, within the box's row limit and byte budget (side-shared.js
    slot sizes, saga ui.js quest box). If something still has to be cut, shorten the wording at the source.
    Rewrite the party-quest line to fit, for example "Party quest: helping your party (you finished it)".
  - Add a unit test that every story step label and status line fits.
- [ ] **O69 Turning the Minimap off leaves a black square** (`media/graveyard-softlock.webp`,
  `media/graveyard-dead-no-respawn.webp`, top right).
  - Turned off through the realm preference, the radar's background panel still draws, an empty black box.
  - When the Minimap is off (realm option or player preference), hide the whole radar element, background
    included: send the empty radar segment the hud_rp binding hides on, and check `hud_screen.json`'s
    visibility bindings.
  - Same for the compass strip and the quest box when they are empty.
- [ ] **O70 Chest Finder's mark is barely visible** (`media/chest-finder-faint.png`).
  - The green `villager_happy` outline and `endrod` column (find_bp main.js:462-486) are lost against chests and signs.
  - Make it obvious: a floating arrow or marker over the found container (a bright particle arrow pointing down, a
    larger pulsing beam, or a glowing marker entity removed when the search ends), plus the direction and distance on
    the action bar (with a `realm:actionbar` request) or a Minimap waypoint.
  - Keep it visible only to the searching player, and clean it up on leave or when the search times out.
- [ ] **O71 The stats ticker should be a personal preference, not only a realm option** (stats_bp config.js:17-24:
  `tickerEnabled` realm-wide, `tickerDefaultOn: false`).
  - The realm decides the default: on for this Realm.
  - Each player can turn it off (or on) for themselves in `/realm:prefs` and `/realm:stats`.
  - The realm option stays only as "allow the ticker".
  - Migrate players who already chose. Update the Large server profile and PACKS.md.
- [ ] **O72 Shift-clicking a chest doesn't sort it** (stash_bp; sneak taps are handled around main.js:761-769).
  - Sneak-tapping a container with an empty hand should sort that chest's contents (the behavior Quick Stack &
    Sort's docs describe).
  - Find why it doesn't fire:
    - The canceled-event rule (C13): is claims or another pack canceling the tap first?
    - The `menuTap` branch taking it.
    - A free-hand check that is too strict.
  - Fix it, and add a scenario. Simulated players' empty-hand taps fire no interact events, so use the two-pack
    mini-bundle approach from storm-rod-claims.js or test the handler directly.
- [ ] **O73 Items can't be moved from one Expansive Inventory page to another.**
  - Add a way to move items between pages: a "Move to page" action in the pages menu (move the selected slot or a
    whole row), and/or putting an item on the page-flip slot sends it to the next page.
  - Item-safety rules apply in full (C3, C9, C19): verify the target page accepts the stack before clearing it from
    the source, and keep one committed index. Stay compatible with msftMyt's PR #86 ("Fill earlier inventory pages
    without sorting") and with O17's page index (W3).

## 4. Integration, verification and publish (wave 6, lead)

1. Merge every workstream into one integration branch. Rerun the cross-pack checks the audit's integration review used:
   - the action bar protocol
   - `realm:` ids and the single command namespace
   - dimension ids
   - every `sync-*.mjs --check`, and diag.js as the first import
   - script event sizes
   - bundle contents (duplicate lang keys, entities, items)
   - canceled beforeEvents
   - merge damage in files changed by two or more workstreams

   One independent reviewer works on the merged tree; another reviews each workstream's diff before the merge.
2. **Release-specific owner override (2026-10-20):** "lets skip the soak tests, let nishs claude do that later".
   The remaining one-context 40/900 run was stopped with its partial evidence retained as
   `USER_DEFERRED_INTERRUPTED`, not PASS. Candidate 100/300, Saga 100/two-quest/120 and the unstarted
   O10 idle measurement are `USER_DEFERRED` to Nish's Claude. Completed memory/performance observations
   remain source-labeled evidence; they are not rerun or relabeled. This supersedes the remaining soak/load
   release gates below, not functional correctness, normal shipping, or future projects' testing policy.

   Original requirement: full suite on the frozen merged tree and on master with the same harness (`suite.mjs --jobs 2 --retry`). Then
   15-minute soaks at 10 and 40 players and a 5-minute 100-player soak with `--profile`, plus a 40-player soak of
   the Realm Bundle as one pack. Nothing may regress from W0's baseline. Every new scenario fails before its fix and
   passes after.
3. Docs:
   - PACKS.md for every touched pack (Commands rows for players, How to use, Configuration, Saved data, "How the packs
     work together").
   - README rows.
   - One NEWS entry for players.
   - WORKING.md: new quirks, an updated audit section, and the finishing order with the perf gate.
   - SERVER_SETUP.md for new options and profiles, and new performance numbers.
   - CLAUDE.md where a rule changed.
   - Mark every item in `OPEN.md`.
4. Ship per section 1 item 8. Report to the owner with tables:
   - items done or not by id
   - performance before and after per pack at 10, 40 and 100 players
   - scenarios before and after
   - versions
   - open risks

   Attach both bundles.

## 5. Owner decisions (ask nishant; do not decide for him)

- [ ] **O46** The Effortless Building credit and license (blocks W9's credit item).
- [ ] **O63** Public release packaging: ship build_bp and translucent_bp outside the Realm Bundle; turn slots_bp off by
  default for public servers; maybe merge harvest, leaves, durability, phantom and refill into one Quality of Life
  pack. The integration review recommends removing nothing.
- [ ] **O64** Story finale rewards are above the bible's scale (kept as written for now): keep them or rescale?
- [ ] **O65** Notes for the Realm:
  - 3 Essentials+ tips disappear on a Realm that never saved its own tip list (`/realm:news_tips` adds them back).
  - The Parties migration can't be rolled back.
  - Existing operators see the setup reminder once.
  - Nickname protection for an offline gamertag starts at that player's next join.
- [ ] **O66** Upload both new bundles (`realm-bundle-2026.1018.2238.mcpack`, `realm-resources-2026.1018.2238.mcpack`,
  from https://mc.nish.software/realm/) to the Realm together, since diag.js and the shared copies changed in both.
  Then upload the bundles from each later publish.
- [x] **O67 disposition:** close #84 and #86 unmerged, retain their branches, rebuild the outcomes in W6/O37 and
  W3/O17 with O73. See W0; replacement feature acceptance remains open.
- [ ] The live Realm's welcome text (O43) and the default size profile for the Realm.

## 6. Backlog (ideas from the audit; do them only if the owner picks them)

- saga:
  - siege and escort outcomes, chapter completions and act endings as letters to offline party mates
  - a first-hour newcomer chapter ("First Light")
  - story places per town and a `{town}` name the players choose
  - repeatable festivals
  - `/realm:saga_reset` with "forget players gone N days"
- expedition: drop-in for a late party mate, a weekly featured dungeon with its own leaderboard and title, a shell
  for flat or void worlds.
- Townsfolk sets per town; leaderboards with "around me" and weekly boards; a party finder.
- A storm leaderboard and title; Death Point despawn countdown and a "help me" waypoint through the Minimap.
- Minimap detail per player (radar off while flying, a 15x15 radar); shared radar pictures for a party standing
  together; perf-soak reading `realm:map_debug`.
- cleanup_bp death points kept across restarts; a "Ride tornadoes" preference.
- Caravan and Town Project letters to offline contributors beyond what town news sends.

## 7. Coverage check

Every id O1-O75 in `OPEN.md` appears exactly once in sections 3 and 5 (O46 and O67 are listed in both, as an action
and as a decision). The 10 suggested tasks map like this:
- 1 -> W1
- 2 -> W2
- 3 -> W3
- 4 -> W4
- 5 -> W5
- 6 -> W6
- 7 -> W7
- 8 -> W8
- 9 -> W9
- 10 -> W10

W11, W12, W0, section 5 and section 6 hold everything found after those tasks were written; W13 holds the bugs the owner reported from the live Realm on October 19. Before calling this plan
done, grep `OPEN.md` for every `O<n>` and confirm each one is marked.

## 8. Won't-fix decisions (all D rows from deferred.md)

The audit decided not to fix these (mostly done elsewhere, intended, or measured as negligible). They are listed so
nothing is omitted: re-confirm each one while touching its pack, and move any that no longer holds into a workstream
(rows that say "watch", "measure" or "revisit" are already in W1 O10).

| track | severity | pack | finding | decision |
|---|---|---|---|---|
| hud #6 | medium | package.json | hud-layout / map-terrain tests not in npm run check | D: already done (infra c1b5dce, `npm run test`) |
| hud #12 | low | map_bp | A list whose last part never arrives stays in `partial` | D: bytes per sender |
| hud #13 | low | map_bp | planScan/scanMemo unused, kept as the tests' reference | D: remove only with new coverage tests |
| hud #15 | low | map_bp | No operator reset for map:wp / map:marks | D: covered by feat/ops "forget my data" |
| hud review | low | map_bp | Fast movers' picks read twice | D: wasted reads only |
| hud review | low | map_bp | Region version bump misses the east/south neighbor's shading (<= 200 ticks) | D |
| hud review | low | map_bp | Stale rebuilds come in a wave every 200 ticks | D: revisit only if a soak shows it |
| hud review | low | tools/side-shared.js | Lone surrogate counted as 2 bytes | D |
| hud review | low | terrain.js, tests | Whole files moved CRLF to LF | D: already integrated |
| hud review | low | perf-soak.js | Retry loop added to the shared scenario | D |
| hud review | low | side-shared.js | Text of only "~"/MARK now occupies a slot | D |
| hud review | low | map.js | Load flake with 2 suite jobs | D: watch in integration runs |
| items | low | harvest_bp | takeSeed may take a nearby seed someone else dropped | D |
| items review | low | relics_bp | Off-hand and worn relics noticed up to 5 s late | D: documented (A) |
| items review | low | stash_bp | Quiet failing player retries on the 5 s turn, not the 2 s backoff | D |
| items review | low | stash_bp | Quiet stagger shifts on join/leave | D |
| items review | low | durability_bp | Armor warnings up to 2 s later | D: documented (A) |
| items review | medium | cooking_bp | `cooking:owed` written twice per cook | D: the cap is the C owed-store task |
| infra #15 | low | hosting publish-packs | Shared-copy-only packs still need `--pack-notes` | D: the lead passes notes at publish |
| infra #17 | low | test-bds server.mjs | Template race with --jobs > 1 on a fresh cache | D |
| infra #18 | low | test-bds shim | Relay parts can pass 2048 after re-escaping | D |
| infra #21 | low | saga-untrack.js | Waits for right4 | D: fixed by saga-engine (7abddad, 64228c3) |
| infra review | low | check-actionbar.mjs | Helper detection loose; `(anonymous)` allowlist hides new hud/stats violations | D |
| infra review | low | check-versions.mjs | Doesn't fetch; notes oversold it | D |
| infra review | low | check-* comment strippers | Regex-based, a call could be missed | D |
| infra review | low | shim.js | Counts UTF-16 units; only sendScriptEvent wrapped | D |
| saga-engine #13 | low | saga_bp | escortFast calls updateLabels every step on top of the 2-tick sync | D |
| saga-engine #19 | low | saga-escort.js | Load-sensitive sampling | D: covered by the C escort facing task |
| saga-engine review | low | saga_bp | mateElsewhere shows the Track button needlessly | D |
| saga-engine review | low | saga_bp | Saga disabled: last box stays up to 15 s | D |
| saga-engine review | low | saga_bp | Shared done collect step reaches a mate up to 10 s later | D |
| saga-content #6 | low | saga_bp | Some finale rewards above the bible's scale | D: report to the owner |
| saga-content #7 | low | saga_bp | "Show" favors pay every day for the same item | D |
| saga-content #16 | low | saga_bp | "draught" | D |
| saga-content review | low | saga_bp | Gristle split over two objectives if the pack set changes mid-chapter | D |
| saga-content review | low | saga-hearth-packs.js | Covers only one variant, no real kill | D |
| saga-content review | low | saga_bp | An already spawned actor keeps "Inspector Pell" until it respawns | D |
| saga-content review | low | saga_bp | Vesna `§5` reads dark on forms | D |
| menus #17 | low | settings_bp | Save summary's "before" can be stale | D |
| menus #19 | low | admin_bp | A renamed nether star counts as the item | D |
| menus review | low | nick_bp | `nick:g:*` grows with every visitor | D: feat/ops "forget my data" covers removal |
| menus review | low | news_bp | Owner's Realm loses the 3 Essentials+ tips if it never saved its list | D: say it in the owner summary (`/realm:news_tips` adds them back) |
| menus review | low | news_bp | Each tip sends realm:help_ping | D |
| menus review | low | admin_bp | Existing operators get the setup hint once after the update | D |
| menus review | low | titles_bp | toldFull / cache keep offline entries | D |
| menus review | low | welcome_bp | A literal backslash-n body always counts as changed | D |
| menus review | low | news_bp | defaultTips unfiltered until the first help_ping answer | D |
| menus review | low | prefs-locks.js | Before-fail not re-established | D |
| entities #11 | medium | npc_bp | 10-tick loop 0.20 ms/tick with 12 townsfolk and 40 players | D: measure with real clients first |
| entities #12 | low | elite-approach-terrain.js | Flaky positive check | D |
| entities #14 | low | elite_bp | A tamed wolf's kills name no player | D |
| entities review | low | name-labels, elite, saga, atlas, domt, moon, expedition | spawnChecked/spawnFresh retries leave the real spawn untagged | D: far better than tagging a pet |
| entities review | low | saga_bp + labels | Idle stray sweep for saga about every 50 s | D |
| entities review | low | name-labels | Extra updateLabels calls advance counters | D |
| entities review | low | dolphin_bp | One-way migration; no unit test of the split | D |
| entities review | low | name-labels | Range measured from the head | D |
| entities review | low | wander-walk.js | Flaky "no named witch left" | D: watch in integration |
| social-prog #14 | low | quests_bp | Placed-block memory lost on restart | D |
| social-prog #17 | low | goals_bp | Chest is an ordinary container | D: docs tip (A) |
| social-prog #21 | medium | milestones, goals, bounty | No gossip/titles from progress | D: being built on feat/news |
| social-prog review | low | party_bp | Rolling back Parties loses parties | D: mention in operator release notes |
| social-prog review | low | milestones_bp | A throwing check isn't flushed that round | D |
| social-prog review | low | journal_bp | Full journal re-stringified every 30 s | D |
| social-prog review | low | mail_bp | "N seen most recently" can be one off | D |
| social-prog review | low | goals_bp | A folded donor starts a new count | D: documented (A) |
| social-prog review | low | milestones_bp | Index stagger shift on join/leave | D |
| social-world #8 | medium | maps scenarios | Hooks in prose | D: done by infra (09d610c) |
| social-world #13 | low | build_bp | Preview loop 0.38 ms/tick floor under the profiler | D: measure without the profiler first |
| social-world #14 | low | cleanup_bp | Death points in memory, capped at 50 | D (Phase 2 idea) |
| social-world #16 | low | domt-cards.js | Load flaky | D |
| social-world review | low | build_bp | idleSkip coupling to loop periods | D |
| social-world review | low | domt-busy.js | Load flaky | D |
| weather #13 | low | tornado_bp | Spectators and AFK players are launched | D (Phase 2: a "Ride tornadoes" pref) |
| weather #17 | low | rainbow-race.js | Hook in prose | D: done by infra (09d610c) |
| weather review | low | tornado_bp | First Slow Falling lands on the 10-tick beat; dead/elytra/re-grabbed players keep it longer; landing map in memory | D |
| weather review | low | moon_bp | Block list built on every world load | D |
| weather review | low | storm_bp | A strike due during a running check is skipped | D: documented (A) |
| expedition #11 | low | expedition_bp | Build steps up to 25-31 ms | D: only if hitches are reported |
| expedition #12 | low | expedition_bp | tickTraps 0.75 ms per check | D |
| expedition #14 | low | expedition_bp | A non-member logged out inside a box rejoins in deepslate | D |
| expedition #15 | low | expedition_bp | Every clear announced to everyone | D |
| expedition #16 | low | expedition_bp | No "forget everything" | D: docs line done (A); data removal is feat/ops |
| expedition review | low | expedition_bp | Pets moved to y 320 without slow falling when spawn's chunk isn't loaded; settle not rerun on join; opReset report can be stale | D |
