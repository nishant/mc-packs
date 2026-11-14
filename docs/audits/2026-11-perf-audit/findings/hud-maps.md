# HUD and maps: performance findings

Second pass, done from the code. The first pass's 28 leads were each re-read at the cited lines and callers: 16
confirmed, 11 corrected, 1 rejected (see "Rejected leads"); HUD-29 onward are new. `<S>` below stands for the section
sign that starts a Minecraft color code.

Scope read:
- `packs/map_bp/scripts/`: `main.js` (all 2,855 lines), `terrain.js` (all 899), `terrain-work.js`, `manual-scanner.js`,
  `rolling-demand.js`, `circle-delta.js`, `raster-work.js`, `terrain-estimate.js`, `scan-policy.js`, `palette-source.js`,
  `nether-layer.js`, `minimap-command.js`, `map-profile.js`, `budget.js`, `config.js`, `settings.js`, `reset.js`,
  `resident-trace.js` (all whole). Exports only: `glyphs.js` (generated), `purepalette.js`, `preview-glyph.js`,
  `map-debug-state.js`. Not read: `detail-persistence.js`, `preview-persistence.js` (never constructed: see HUD-18).
- `tools/side-shared.js`, `tools/spread-shared.js`: whole. `packs/hud_rp/ui/hud_screen.json`: whole (1,149 lines). hud_rp
  PNG headers (sizes and dimensions).
- `packs/hud_bp/scripts/main.js`, `config.js`; `packs/mobhp_bp/scripts/main.js`: whole.
- `packs/maps_bp/scripts/main.js`: lines 20-80, 150-460, 452-780, 860-1160 plus a grep of every interval, event and
  native call; `cleanup.js`, `bar.js`: whole.
- `packs/atlas_bp/scripts/main.js`: lines 128-615, 920-1185, 1500-1580, 1936-1990 plus the same grep.
- `packs/find_bp/scripts/main.js`: lines 28-565, 676-825; `config.js`. `packs/waystone_bp/scripts/main.js`: lines 150-345,
  384-633 plus the grep.
- `tools/map-perf-analysis.mjs` (whole: it counts planner calls in a Node VM with fresh data, no native cost),
  `tools/map-manual-retention.test.mjs`, the headers of `map-flight.js` and `map-turn.js` (both say they are not
  radar-on performance tests), `perf-soak.js` (grep: it never turns the radar on), `docs/PACKS.md` lines 1620-1633.

## Summary

- At the Realm's size (1 to 4 players) the compass strip costs little on the server: one pass per player every 10 ticks
  and two reads a tick per player for turning. The soak's 0.55 ms at 10 players is mostly the marker passes running
  into their 0.2 ms a tick budget (each pass searches entities again whether or not anyone moved) plus small per-player
  loops. HUD-02 and HUD-03 are the idle-floor work.
- The radar is where the risk is, and nothing measures it: the soak, `map-turn.js` and `map-flight.js` all leave it off.
  The profile in force allows the scanner 6 ms a tick, raster rebuilds 2 ms and drawing 1 ms (HUD-01). From the code, one
  player flying with the radar on costs about 4 to 5 ms a tick, the whole bundle's budget; standing still costs almost
  nothing except a 25-tick burst at the scan ceiling every 2 minutes (HUD-30).
- Two defects make moving radar players dearer than designed. Once a terrain store holds its cap (6,000 columns, about
  280 blocks of straight travel), every new column evicts one, each eviction bumps a store-wide counter, and that
  counter disables the incremental planner, so the full 2,166-candidate plan runs on every check (HUD-29). And a
  delivery-receipt rule sends the 5,425-byte title on every draw at a new position even when its text is identical
  (HUD-06).
- After a large `/realm:minimap scan` (any player may run one), or when the player count drops, a store is over its
  cap; new columns are then refused while it drains one column per tick per viewer, so the radar stops filling in for
  minutes to over an hour (HUD-07).
- Every side-box title is 5,425 bytes. Dropping the empty radar and quest segments from the end is safe for clients
  with an older Realm Resources and cuts a compass-only title to 1,609 bytes; cutting any earlier is not safe, because
  an older client then draws empty boxes (HUD-04, question 4).
- The smaller packs are fine on average. Their findings are spikes (maps_bp 150 block reads in one tick, find_bp
  re-reading rows of identical double chests) and all-players-in-one-tick loops (hud_bp, atlas_bp, maps_bp warmth).
- No unbounded growth that matters at 10 players. The worst-case memory is the terrain cache: about 46 MB at its hard
  cap of 131,072 columns (estimate).

## Answers to the lead's questions

### 1. Packets per player per second in steady state, bytes, and whether unchanged text is re-sent

Every side-box title is one `setTitle` call with a 9-byte title and a 5,425-byte subtitle (9 flag bytes + 10 slots of
160 + radar 3,304 + quest 512; `tools/side-shared.js:56-66,168-181`). How many packets the server makes of one call,
and the size after Bedrock's batch compression, were not measured; the runs of `<S>r` filler compress well, the radar
glyphs less so. Bytes below are raw.

| Source | Still | Moving or turning | Unchanged text re-sent? |
|---|---|---|---|
| map_bp compass strip (default on) | 0.25 titles/s (keep-alive every 80 ticks, `main.js:172-173,1939-1958`): 1.4 KB/s | one title per changed strip text. A player is checked every tick with up to 4 viewers, every 2.5 ticks at 10, every 10 ticks at 40 (`TURN_CHECKS` 4, `main.js:1980,2029`), so at most 20, 8 and 2 titles/s: up to 108 KB/s | Yes: the keep-alive, every 4 s. A redraw whose text is the same sends nothing (`main.js:1897-1912`) |
| map_bp radar (opt-in) | the same 0.25 titles/s (one title carries both) | one title per draw at a new exact position, text changed or not (HUD-06): about 7/s walking, 10/s sprinting, 20/s flying, 5,425 bytes each (36 to 108 KB/s) | Yes: the keep-alive, and every draw after a move of 0.5 blocks |
| hud_bp above the hotbar (default off) | 0.5 action bars/s (`refreshTicks` 40), about 60 to 110 bytes | at most 2/s (10-tick loop), only when the text changed | Yes, every 2 s, by design (an action bar fades) |
| hud_bp in a side box | one `realm:side` event per 100 ticks; no title while the Minimap composes the player and nothing changed (`side-shared.js:673-676`). Without the Minimap, its own copy draws the 5,425-byte title every 100 ticks | up to 2 events/s, each making the compositor send one more 5,425-byte title | Event: yes, every 5 s. Title: only without a compositor |
| maps_bp warmth (only while a treasure map is held) | per 40 ticks: one `realm:actionbar` event and one action bar; or in a box one `realm:side` event (and a 5,425-byte title only when no compositor draws the player) | same | Yes, every 2 s (needed to keep it up) |
| mobhp_bp | none | per hit, at most once per attacker per tick: an action bar plus a `realm:actionbar` event, or a `realm:side` event and one title | No |
| find_bp marker (10 s after picking a result) | 2 action bars/s, up to 24 particles per 10 ticks, one `realm:actionbar` event per 10 ticks | same | Yes, for those 10 s |
| waystone_bp | none | 1 action bar/s during a trip countdown | No |
| atlas_bp | none | a real title (80 ticks) on entering a region, at most one per 400 ticks | No |

### 2. What map_bp does on a tick when no player moved (compass on, radar off)

Six intervals run (registration order): side.js sweep (every 4 ticks), two persistence intervals, the scanner, the
redraw, the passes.
1. Persistence (`main.js:870-913`, every tick) and flush (`main.js:916-929`, every 2 ticks): two `Date.now()` and a
   return, because `EXP.persistence` is a constant `false`. They can never do anything in this build (HUD-18).
2. Scanner (`scanFrame`, `main.js:1184-1376`): no native calls, but it allocates the candidate array, two Sets and four
   closures, reads `Date.now()` about 10 times and calls `manualScans.synchronize` and `manualScans.tick` (HUD-18).
3. Redraw (`main.js:2013-2117`): a JS check per view; for `min(n, 4)` players in turn, `player.location` and
   `getRotation()` (2, 8 and 8 native reads a tick at 1, 10 and 40 players). Nothing changed, so nothing is built. Every
   80 ticks per player the keep-alive sends the cached subtitle again (0.0125, 0.125 and 0.5 `setTitle` a tick).
4. Passes (`main.js:2183-2223`): every 10 ticks the `seen` list reads location, dimension, dimension id and `getTags()`
   for everyone (4n reads in one tick). Every tick the longest-waiting player (2 from 11 players) gets a full pass while
   the pass budget (0.2 ms a tick, saved up to 4) lasts: a monster `getEntities` every pass, a `realm:npc` search every
   other pass, `getSpawnPoint()`, and 20 + n + camps + towns property reads (HUD-02). The result equals what is on
   screen, so nothing is drawn (`view.dirty` false, `main.js:1810`).
5. side.js sweep (`side-shared.js:693-729`): prunes; every 40 ticks one `realm:side_comp` claim with every composed
   player id.

So the idle work is re-observing: the passes (capped near 0.2 ms a tick from about 10 players up, which is why the
figure rises only from 0.55 to 0.93 between 10 and 40), and roughly 13 us per player per tick of loops, turn checks,
the `seen` sweep and keep-alive titles (from the two soak figures; the split was not measured). Nothing notes "this
player is still, skip the pass" (HUD-03).

### 3. What bounds every cache, and the worst-case memory

map_bp:

| Cache | Bound | Released |
|---|---|---|
| `terrain.stores` (`terrain.js:89`) | one surface store per dimension seen, 24 Nether band stores (`#dropOldLayer`) | only the oldest Nether band when a 25th is needed |
| `store.cols` | per store `maxCols` = 6,000, or 1,200 x players online up to 48,000 (`manual-scanner.js:97`); raised to the scan's size during a manual scan (`:65-68`); all stores 131,072 (`terrain.js:109-112`) | one column per insert at the cap; never by age or disuse (HUD-07) |
| `store.regions` (`terrain.js:29`) | none: one number per 64 x 64 region ever written, kept when its columns are evicted | never (about 1.5 MB after exploring 10,000 x 10,000 blocks) |
| `store.miss` | cleared at 4,000 (`terrain.js:318`) | |
| `store.preview`, `previewMiss`, `fine` | 2,000 / 4,000; unused in this profile | |
| `pendingTerrain` | about 96 (one tick's operations) | after 20 ticks (`main.js:1369`) |
| `scanPlans`, `labPlans`, `terrainBaseMemo`, `playerStore`, `retryAt`, `planNow` | per radar viewer: up to about 2,200 picks, `failed` 4,096 (`main.js:1097,1157`), 1,369 cached anchors, two geometry buffers of about 62 KB | on leave, dimension change, radar off |
| `views`, `lastSent`, `lastText`, `prefCache`, `wpCache`, `marksCache`, `arrived`, `npcCache`, `passAt`, `costPassBy`, `regions`, `sites` (1,000 per player), `waystones`, `tracks`, `deaths`, `netherLayers`, frame maps | per online player | on leave (`main.js:2235-2241`) |
| `resetChecked` (`main.js:404`), `partial` keys with a player id (`:310`) | none | never (HUD-16, HUD-17) |
| `npcShared` 24, `stripBases` 72, `line2Memo` 200, `champCache` 3, `wanderers` 500, `plants` and `kinds` 2,000, `manualScans.last` 64, trace 256 events | fixed | |
| `folk`, `towns`, `camps`, `pot`, `siege` | what the owning packs broadcast | replaced by each full list; camps on `removed` |
| side.js maps (`picture`, `inbox`, `versions`, `composed`, `drewAt`, `holds`, `claims`, ...) | per online player | on leave (`side-shared.js:731-742`) |

Worst case: the terrain columns. A column is an object of about 12 fields plus a Map entry and a Set entry, about 350
bytes in QuickJS (estimate, not measured): 6,000 columns are about 2 MB, 48,000 about 17 MB, the hard cap of 131,072
about 46 MB. The cap is reachable by one manual scan of radius 384 (115,800 columns) or by radar use across many
Nether bands (27 stores x 6,000 is more than the cap). Per radar viewer add about 0.5 to 1 MB. On the Realm with
normal play: 2 to 10 MB.

maps_bp: `cache` (hunts), `barHeld`, `mapHolders`, `legsSent`, `lastNpc`, `callingBonus` and the `player/hunt` keyed
`jobs`, `lastDistance`, `retryAt` are per online player and pruned on leave (`main.js:254-263`); `maraOff` is not
(HUD-22). Saved: one `maps:undo:<id>` record per marker or buried chest until it is put back; a record in land nobody
loads again stays forever and is re-read every 5 s (HUD-10). Worst-case memory: kilobytes.

atlas_bp: `slotCache` cleared above 600 cells (`main.js:173`); `cells`, `cellOrder`, `built` grow with the explored
world (one cell per 512 x 512 blocks, 2 to 4 records each, all saved); `pcache`, `acts`, `lastCell`, `lastBanner`,
`lastUse` per online player, pruned on leave (`:1974-1981`); `meteors` 24; `claimAsks` 20 ticks; `places` by place id;
`retryAt`, `waits`, `tidied` by slot and `fullTold` by player: never pruned (HUD-25). Worst case: about 1 MB for a
20,000 x 20,000 explored world.

### 4. A variable-length side-box title: what depends on fixed offsets, and the smallest safe change

Everything in `packs/hud_rp/ui/hud_screen.json` is positional. JSON UI can only take the first N bytes
(`'%.Ns' * string`) and subtract a known string; it cannot search for a delimiter. Fixed today:
- the title must equal `<S>s<S>2<S>r` (lines 72, 169, 280, 332, 720, 826);
- byte 0 of the subtitle, `R` or `N`, shows or hides the radar panel and the gap above the right boxes (720, 826);
- each box's `$skip`, the byte where its text starts, 9 + 160k + 1: `%.10s` (859), `%.170s` (869), `%.330s` (879),
  `%.490s` (889), `%.650s` (942), `%.810s` (956), `%.970s` (970), `%.1130s` (984), `%.1290s` (1033), and the strip
  `%.1450s` (1067);
- `$slot_slice` `%.159s` (200, 262) and `$slot_empty` (263): 53 x `<S>r`, exactly the 159 bytes of an empty slot. A box
  is visible when its slice is not equal to that string (280);
- the radar: skip `%.1610s`, take `%.3299s` (412, 451, 490, 529); the self arrow: skip `%.4909s`, take `%.3s` (682);
- the quest box: skip `%.4914s`, take `%.511s` (307-308); each of its nine places compares the first 9 bytes with its
  code (332).

Smallest change, with no resource pack change at all: let `compose` and `composeSlots` (`tools/side-shared.js:168-181,
378-393`) leave off the quest segment when it is empty, and the radar segment too when both are empty. The subtitle is
then 1,609 bytes (compass and boxes), 4,913 (with radar) or 5,425 (with a quest box). A client with any Realm
Resources version reads it the same: slots up to `top` are untouched; the radar panel is hidden by byte 0 = `N`; a
quest place computes `'%.4914s' * sub` = the whole string, `sub - sub` = empty, and an empty string is not its code, so
it stays hidden. Do not cut earlier than byte 1,609: a box whose slice comes out empty is not equal to `$slot_empty`,
so line 280 makes it visible and an older (and the current) client draws an empty dark box in every slot past the
cut. That is the flaw in "stop after the last non-empty segment". A quest box without the radar still carries the 3,304
empty radar bytes.

Anything beyond that (the strip first, so a compass-only title is 169 bytes) moves offsets, and a client with the
older pack would cut garbage. It needs two releases: Realm Resources that understands both layouts, picked by byte 0
(new letters for the new layout), then a world option the operator turns on once everyone has it. It saves 1,440 more
bytes per compass-only title and doubles the bindings while both layouts exist. Not worth it before HUD-04 and HUD-05
are measured on a device.

## Findings

### HUD-01 map_bp: with the radar on the ceilings are 6 + 2 + 1 ms a tick, and no test measures it  [high / confirmed (code), cost needs-measurement / M / radar fills in more slowly]
- Where: `packs/map_bp/scripts/map-profile.js:4-24,46-48` (`MAP_PROFILE = INTEGRATED`: `ops` 96, `scanMs` 6, `rebuildMs`
  2, `drawMs` 1, `featureMs` 11); `main.js:70-78` (`LabBudget.tick()` sets `left = perTick`: no debt carried, nothing
  saved, each is a wall-clock deadline per tick); `main.js:1186-1194` (scan deadline), `:1269` (96 operations a tick
  whatever `budgetLevel`), `:1996-1997`, `:2164-2173` (`normal` factor 1, `low` 0.5, `high` 1.25). `docs/PACKS.md:1623,
  1629` documents these numbers and says the 33 x 33 radar "was not re-measured on a server". Stale and contradicting
  them: `config.js:54-61` ("normal (1 ms; measured 1.5 and 2.1)"), `main.js:15-17` ("about 3 ms"), the dead
  `BUDGET_LEVELS` table (`main.js:2150-2160`) and CLAUDE.md's 1 ms budget for the Minimap.
- What happens and how often: a column costs 2 operations on land (a ray, then the map color) and 4 in water, about 8
  native calls (`terrain.js:826-864`: `heightRange`, `dim.id`, `getBlockFromRay`, `typeId`, `location`, `typeId`;
  `palette-source.js:22-35`: `getComponent`, `tintedColor`). 96 operations are 40 to 48 columns, 350 to 400 native calls,
  about 4 ms at 10 us each. A radar circle holds about 1,018 columns.
- Cost estimate (from the code at 10 us a native call; none of it measured):

  | Radar on | Scanner | Rest | Total |
  |---|---|---|---|
  | Standing | 3 reads per check (every tick alone, every 4 ticks from 4 viewers); every 2,400 ticks the whole circle again: about 25 ticks at the ceiling (HUD-30) | a raster rebuild (about 1 ms) every 200 to 240 ticks; a title every 80 ticks | under 0.05 ms a tick on average; 4 to 6 ms on 25 consecutive ticks every 2 minutes |
  | First fill: join, radar turned on, dimension change, teleport, a new Nether band (HUD-31) | 1,018 columns, about 2,300 operations | | 4 to 6 ms a tick for about 25 ticks |
  | Walking 4.3 blocks/s | 18 new columns per block: 4 a tick, about 0.3 ms | a rebuild per block (0.2 ms a tick), 7 titles/s, a plan every tick (cheap, or 1 to 2 ms: HUD-29) | 0.6 ms a tick, up to 2.5 at the cap |
  | Flying 30 blocks/s | 27 columns a tick: 57 operations, about 2.2 ms | a rebuild every tick (about 1 ms), 20 titles/s, a full plan every tick at the cap | 4 to 5 ms a tick for one player |
  | Two or more flying, or a manual scan | the 96 operation cap or the 6 ms deadline | 2 ms rebuilds, 1 ms drawing | up to 9 ms a tick |
- Fix: measure first (below). Then pick `ops` and `scanMs` for `normal` from the result so one flier keeps the pack near
  its 1 ms budget: for example 24 operations a tick steady (a fresh circle fills in 5 s, nearest columns first; walking
  needs 9) with 96 only for the first 40 ticks after a join, teleport or dimension change (`scan-policy.js` already has
  this catch-up idea and is not imported). Give stale refreshes their own small share (HUD-30). Correct the comments
  in `config.js` and `main.js`, and delete `BUDGET_LEVELS`.
- Prove it with: a new scenario (none exists: `map-flight.js:2` and `map-turn.js:89-90` say so): 1 and 4 players with
  the radar on, 120 s each of standing, walking a line of 600 blocks, and teleport-stepping 1.5 blocks a tick, under
  `--profile --profile-json`, reporting map_bp mean and per-tick maximum, plus `scanReads`, `plansMade`, `rebuilds` and
  `turnSends` from `realm:map_debug` `cost`.

### HUD-02 map_bp: one pass reads the same player and dimension 20 + n times  [medium / confirmed (count), cost needs-measurement / S / none]
- Where: `packs/map_bp/scripts/main.js:683-684` (gather: dimension, location), `:609-610` (`npcsNear` reads both again),
  `:613`, `:615` (`dim.id` once per entry of `npcShared`, up to 24, on every search), `:639`, `:715` (`dim.id` once per
  online player), `:720` (once per camp), `:727` (once per town), `:721`, `:741`, `:735-736` (`getSpawnPoint()` and its
  `dimension.id` every pass), `:1792`, `:1797` (`player.location` twice), `:1800`, `:1803` (`dimension.id` again,
  `location` twice), `:259` (`distTo`: 3 reads when a destination is picked), `:2195-2196` (`seen`: location, dimension,
  id and `getTags()` for everyone every 10 ticks).
- What happens and how often: one pass a tick up to 10 players, two from 11, while the 0.2 ms pass budget lasts.
- Cost estimate: at 10 players about 45 property reads a pass where 3 would do, plus 2 for the spawn point; at 40
  players about 75. Each is a script-to-native property read; the brief has 0.2 us for `player.id` and 10 us for a call,
  and `location` and `dimension` build an object, so 0.05 to 0.3 ms a pass: needs measurement.
- Fix: in `pass`, read `at = player.location`, `dim = player.dimension`, `dimId = dim.id` once and hand them to `gather`,
  `npcsNear`, `destination`, `arrival`, `distTo`; compare with `dimId` in every loop. Cache `getSpawnPoint()` per player
  for 100 ticks. Keep the party tag per player and refresh it every 100 ticks instead of `getTags()` every 10.
- Prove it with: the `perf-soak.js` A/B at 10 and 40 (map_bp ms a tick; passes served per second from `passFewest` /
  `passMost` in `realm:map_debug` `cost`); `map.js`, `map-places.js`, `map-others-range.js` for behavior.

### HUD-03 map_bp: a still player gets the same pass as a moving one  [medium / confirmed, gain needs-measurement / S-M / a mob walking up to a still player shows up to 1 s later]
- Where: `packs/map_bp/scripts/main.js:2143-2146` (`INTERVAL` 10, `PASS_EACH` 2, `passBudget` 0.2 ms a tick), `:2183-2223`,
  `:1770-1815` (`pass`), `:702` (monster search every pass), `:612-613` (the townsfolk search is kept only 20 ticks, so
  every other pass searches again: the first pass's HUD-19).
- What happens and how often: every player, every 10 ticks or as often as the budget allows, whatever they did. From
  about 10 players the passes fill their budget, so this is a steady 0.2 ms a tick and each player's pass comes every
  15 to 20 ticks at 10 players and far less often at 40. When nothing changed the result is dropped (`main.js:1810`).
- Cost estimate: the largest idle item of the most expensive pack: up to 0.2 ms of map_bp's 0.55 at 10 players. On the
  Realm (1 to 4 players) it is 0.1 to 0.4 passes a tick.
- Fix: a per-player interval. When the player moved under 1 block since the last pass, the pass found the same markers
  and second line, and no monster was in range, the next pass comes after 20 ticks, then 40; any of those changing puts
  it back to 10. Keep the townsfolk result 100 ticks while the player moved under 8 blocks. This keeps each player's
  own mob search (the brief lists sharing it as measured, no gain); it only runs less often when it keeps finding
  nothing. With the budget no longer full, moving players' passes come on time at 40 players.
- Prove it with: `perf-soak.js` at 10 and 40 (still players: the best case); `map-champion.js` and `map.js` with an
  added check that a mob spawned next to a still player is on the strip within 2 s.

### HUD-04 side.js: every title is 5,425 bytes; the empty radar and quest segments can be left off safely  [medium / likely (needs one device check) / S / low]
- Where: `tools/side-shared.js:56-66` (segments 160, 3,304 and 512 bytes), `:153-165`, `:168-181` and `:378-393` (every
  slot is always written), `:447` (`setTitle`). `packs/hud_rp/ui/hud_screen.json:280` (what makes a box visible), `:307`,
  `:332`, `:412`, `:682`, `:720`.
- What happens and how often: every title any of the 7 copies draws: the Minimap's keep-alive, every strip change
  (up to 20 a second while turning), every other pack's box change.
- Cost estimate: a compass-only title is 5,425 bytes of which the first 1,609 hold slots; 3,816 bytes (70%) are an
  empty radar and quest segment. Each title is built by the server, converted for the native call, compressed, sent,
  and cut up by 45 string expressions on the client (HUD-05). On the wire the filler compresses to little, so the gain
  is server and client string work, not bandwidth. Not measured.
- Fix: as in question 4: drop a trailing empty quest segment, and a trailing empty radar segment with it. Never cut
  before byte 1,609 (the first pass's "stop after the last non-empty segment" makes older and current clients draw
  empty boxes). `side.payload()` and the tests that decode the title byte for byte must accept the three lengths.
- Prove it with: `side-boxes.js`, `map-compositor.js`, `map-empty-panels.js`, `map.js` (title decoded byte for byte);
  one check on a device with the Realm Resources that is live today: strip only, strip and boxes, radar, quest box.

### HUD-05 hud_rp: 45 string expressions cut up the whole subtitle  [medium / needs-measurement / M / JSON UI regressions]
- Where: `packs/hud_rp/ui/hud_screen.json:227` (slot text) and `:280` (slot visible), 10 instances each (8 pinned, middle,
  top); `:332` (quest visible) and the slot text label inside each quest place (`:316`, through `realm_slot_box`), 9 each:
  the first pass missed these 9; `:412`, `:451`, `:490`, `:529` (4 radar labels with the same expression); `:682`; `:720`;
  `:826`. None has a `binding_condition`. The vanilla subtitle label (`:117-159`) is still bound to the full string while
  its frame is hidden.
- What happens and how often: at least once per title received, and possibly every frame (global bindings without a
  condition; not measured on a device). Each expression copies a prefix of up to 4,914 bytes, removes it from a copy of
  the 5,425-byte string and slices the rest; the radar ones then scan 3,299 bytes twice for the filler. The radar is
  drawn as four labels of 1,089 glyphs at half-pixel offsets.
- Cost estimate: about 45 x 2 passes over 5.4 KB, roughly 0.5 MB of string copying per evaluation; with HUD-04 a
  compass-only title is 70% less. Not measured.
- Fix: HUD-04 first. Then on a device: `"binding_condition": "visible"` on the text bindings of slots, so a hidden box
  does no slicing; one hidden control that holds the radar slice with the four labels bound to it by
  `source_control_name`; the same for the quest segment and its nine places. Check whether two radar labels are enough.
- Prove it with: frame time on the Fold 7 with the strip, with the radar and with the radar while turning, before and
  after. No server scenario covers the client.

### HUD-06 map_bp: a moving radar player gets the full title on every draw, even when no text changed  [medium / confirmed / S / low]
- Where: `packs/map_bp/scripts/main.js:1883-1886` (a `frame` is prepared on every radar draw; its `viewKey` holds the
  exact `at.x` and `at.z`), `:1903` (`if (frame && publishedDetailFrames.get(id)?.viewKey !== frame.viewKey) showR =
  true`), `:1920-1922` (`side.show` then `side.redraw`), `tools/side-shared.js:498-510` and `:415-447` (an unchanged part
  changes no version, but `draw` still calls `setTitle` with the cached subtitle). The no-send path at `main.js:1906-1911`
  only applies at the same exact position. Also `:1965-1966` (`MOVE_MIN` 0.5 blocks), `:1566-1569` (the raster moves in
  whole blocks, so its text changes with every block walked; a cell is 2.25 blocks), `:1852` (the self arrow is part of
  the radar text: turning past 45 degrees re-sends 5.4 KB for 3 bytes).
- What happens and how often: with radar and terrain on, every draw after the player moved 0.5 blocks sends the title:
  walking every 3 ticks (7 a second), sprinting every 2 ticks (10 a second), flying every tick (20 a second). The first
  pass blamed the text alone, which changes once per block (4.3 a second walking); the receipt rule adds about half
  again, and makes the dedupe at `:1897-1898` useless for anyone who moves.
- Cost estimate: 36 to 108 KB/s raw per moving radar player, a `setTitle` conversion of 5.4 KB each time, and on the
  client 45 expressions plus a new layout of 4 x 1,089 glyphs whenever the radar text did change.
- Fix: (1) at `:1903` compare the radar text (`accepted.radarWire !== frame.radarWire`), not the pose, and take the
  `:1910` path for an identical body at a new position. (2) Move the raster origin in steps of 2 blocks (the sample
  lattice, `COL`), which halves the text changes while walking. (3) Send the radar part at most every 4 ticks unless a
  marker changed cell; the strip keeps its own rate.
- Prove it with: the HUD-01 scenario (`turnSends` per second while walking and flying); `map-flight.js`,
  `map-compositor.js` and the `map-render-recovery`, `map-settled-pose` unit tests, which use the receipts.

### HUD-07 map_bp: a store over its cap refuses new columns and drains one a tick; any player can put it there  [medium / confirmed (code), not run / S-M / changes /realm:minimap scan for non-operators]
- Where: `packs/map_bp/scripts/terrain.js:104-109` (`makeRoom`: at or over `maxCols` it evicts one column and, if the
  store is still at or over the cap, returns false), `:229-271` (one eviction per call), `main.js:1317-1320` (a refused
  pick is deferred and ends that plan's turn for the tick), `manual-scanner.js:65-68` (the cap rises to the scan's size)
  and `:92-98` (back to `max(6000, min(48000, players x 1200))` on the tick after the scan ends, or whenever the player
  count drops), `minimap-command.js:15` (`CommandPermissionLevel.Any`), `terrain-work.js:8` (radius up to 384).
- What happens and how often: `/realm:minimap scan 384` asks for 115,800 columns: 1 to 2.3 minutes at 96 operations a
  tick, at the 6 ms ceiling (a column outside loaded chunks costs one operation and an exception, a loaded one 2 to
  4). When it ends the cap drops to 6,000 and the store holds whatever was loaded, up to 115,800. From then on every new
  column a radar asks for is refused, and each refusal evicts exactly one old column: one per viewer plan per tick.
  With one viewer a full store needs 110,000 ticks (91 minutes) to get back under the cap, and until then land outside
  what was scanned stays blank on every radar in that dimension. The first pass said the columns stay "until restart":
  they drain, but this way. The same happens in small when 10 players drop to 5 (cap 12,000 to 6,000: up to 5 minutes),
  after `scan 128` (12,900 columns: up to 11 minutes), and after the default `scan 64` (3,200 columns: up to 3 minutes)
  when the store was already full.
- Cost estimate: memory about 350 bytes a column: 40 MB for the 384 scan (estimate). The stall is a function bug, not CPU.
- Fix: when a store is over `maxCols`, trim it in the scanner (up to 256 evictions a tick, oldest and not visible first)
  instead of refusing inserts; in `makeRoom` allow the insert once one eviction succeeded. Cap non-operators at radius
  128. Optionally drop a store's columns after 5 minutes with no radar viewer in that dimension.
- Prove it with: a unit test next to `tools/map-manual-retention.test.mjs`: fill a store to 3 x `maxCols`, lower the cap,
  assert that `put` of a new column succeeds and the store is under the cap within N ticks. On a server: a scan, then
  walk out of the circle and check `realm:map_debug` `detail` `sampled2` keeps rising; the memory job with one scan.

### HUD-08 map_bp: the planner's idle skip is a stub and several of its limits are dead code  [low / confirmed / S / none]
- Where: `packs/map_bp/scripts/main.js:1403` (`planIdle` returns false; `:1380-1386` and `docs/PACKS.md:1623` describe a
  skip until the viewer moved 16 blocks), `:1252-1256`, `:1209` (`planTurn.left` set, never read: "at most 2 viewers a
  tick" is not enforced), `:1228-1250` (every id in `planNow` is planned in one tick, bounded only by the scan deadline),
  `:1024` (`lastPose` deleted in four places, never written), `:1006-1007`, `:1025`, `:1379`, `:2156` (`SCAN_TOTAL`,
  `SCAN_EACH`, `PLAN_MIN_AGE`, `IDLE_MOVE`, `BUDGET_LEVELS` unused), `:47` (`aheadPicks` imported, never called).
  `scan-policy.js` is not imported by anything in the pack.
- What happens and how often: a still radar viewer costs 3 native reads (location, dimension, id) per check, every tick
  when alone and every 4 ticks from 4 viewers up, then `planFor` returns the old plan (`:1430-1441`).
- Fix: have `planIdle` compare with the position the redraw check read that tick (keep it on the view); enforce
  `planTurn.left` in the `planNow` loop; delete the dead names and the unused file.
- Prove it with: `tools/map-planner-stationary.test.mjs`, `map-hotpaths.test.mjs`; `plansMade` in the HUD-01 scenario.

### HUD-09 maps_bp: the chest and marker search does 150 block reads in one tick  [medium (spike) / confirmed / S / none]
- Where: `packs/maps_bp/scripts/main.js:27` (`READS_PER_RUN` 150), `:664-700` (every 10 ticks), `:617-662` and `:707-743`
  (a `yield` before every `topAt`: `getTopmostBlock`, `typeId`, `above()`, `typeId`; or `blockAt`: `getBlock`, `typeId`),
  `:162-186`.
- What happens and how often: while a hunt's leg end is being settled (once per leg, when its holder comes within reveal
  range), one tick in ten runs 150 yields. The "nothing built here" check alone is 81 columns with up to 9 reads each.
- Cost estimate: 300 to 600 native calls in that tick, 3 to 6 ms at 10 us, twice a second for a few seconds. Not measured.
- Fix: the same budget as 15 yields every tick, or hand the generators to `system.runJob`.
- Prove it with: `maps-hunt.js`, `maps-party.js` with `--profile` (the per-tick maximum of maps_bp).

### HUD-10 maps_bp: the undo sweep re-reads and parses every saved record every 5 seconds  [low on the Realm, medium on a public server / confirmed / M / none]
- Where: `packs/maps_bp/scripts/cleanup.js:36-54` (`ids()`, `load()`: a world property read and a `JSON.parse` each),
  `:186-215` (`sweep`: every record, every run; `release` and `drop` read the list again), `:220-228` (every 100 ticks),
  `:117-131` (a due record whose land is not loaded fails at its first `getBlock` and is tried again forever), `:15`,
  `:17` (30 and 60 days); `main.js:1042-1046` (`online()` is `world.getAllPlayers().find` once per record).
- Cost estimate: per record 2 native calls and a parse of 0.5 to 1.5 KB. 200 records (a public server: every one-time
  visitor who bought a map leaves 1 or 2 for 60 days): 400 native calls and 200 parses in one tick every 5 s. Not measured.
- Fix: keep the records in memory (this file is the only writer; load once after world load), read the players once
  per sweep, visit due records first and at most 16 others per sweep in turn.
- Prove it with: `maps-cleanup.js`, `maps-leave.js`; a new case that seeds 200 `maps:undo:*` records under `--profile`.

### HUD-11 hud_bp: the pack's whole idle cost is one uncached preference read per player  [low on the Realm, medium at 40 / confirmed / S / none]
- Where: `packs/hud_bp/scripts/main.js:137-162` (every 10 ticks, every player, one tick), `:25` (`getFor(player, "on")`),
  `:145` (`getFor("where")`), `:69` (`getFor("showTime")`, `world.getDay()`, `getTimeOfDay()` per player).
- What happens and how often: with the HUD off (the default) each player still costs one `getDynamicProperty` and a
  `JSON.parse` every 10 ticks: 40 players x 12 to 20 us is 0.5 to 0.8 ms in one tick, 0.05 to 0.08 ms a tick, which
  matches the 0.080 ms the soak reports for hud_bp at 40 (the loop does nothing else with the HUD off). With the HUD
  on: 3 such reads plus 5 native calls per player.
- Fix: this is XC-04 (cache parsed preferences in `settings-shared.js`); with it the pack needs no change. Without it:
  a Set of player ids with the HUD on, kept by `onChange`, join and leave. Read the day and time once per loop.
- Prove it with: `perf-soak.js` at 40 with and without `--arg hud=1`; `party-hud-coords.js`.

### HUD-12 waystone_bp: the 5-second lodestone check reads every player again for each waystone  [low / confirmed / S / none]
- Where: `packs/waystone_bp/scripts/main.js:436-448` (`players.some((p) => p.dimension.id === w.d && dist3(p.location,
  ...))` for 8 waystones, `CHECKS_PER_RUN`), `:425-431` (the same run already read every player's dimension and place;
  it also allocates a `center()` object per unknown waystone per player every second: the first pass's HUD-26).
- Cost estimate: up to 8 x players x 3 reads in one tick every 5 s: 240 at 10 players, 960 at 40.
- Fix: keep `[dimension id, x, y, z]` per player from the discovery loop and test against that.
- Prove it with: `waystone-trips.js` with a few far waystones and `--profile`.

### HUD-13 mobhp_bp and atlas_bp: native reads on every entity load and every death  [low / confirmed / S / a leftover health tag or fight mob lives up to a minute longer]
- Where: `packs/mobhp_bp/scripts/main.js:182-188` (`entityLoad`: `hasTag`), `:169` and `:159-161` (`entityDie`: `hasTag`
  for every death in the world); `packs/atlas_bp/scripts/main.js:1575` and `:1565-1568` (`entityLoad`: `isValid`, `hasTag`).
- What happens and how often: 3 native calls per entity loaded (a flier loads many a second) and 1 per death (a mob
  farm), on top of the 14 and 33 wake-ups XC-06 counts.
- Fix: mobhp `entityDie`: return when `overhead` is empty or has no entry for the id, before `hasTag`. Both
  `entityLoad` handlers: replace with the world-load sweep that exists plus one tagged `getEntities({ tags })` per
  dimension every 60 s.
- Prove it with: `mobhp-sweep.js`, `mobhp-overhead.js`, `atlas.js`; the W0 churn scenario.

### HUD-14 map_bp: the keep-alive sends an identical title every 4 seconds  [low / confirmed / S / needs a redraw on respawn]
- Where: `packs/map_bp/scripts/main.js:172-173` (`HOLD` 100, `REFRESH` 80), `:1939-1958`; `tools/side-shared.js:447`
  (the stay time is the latest slot end + 2), `:72` (`MAX_TICKS` 1,200).
- Cost estimate: 0.25 titles a second per still player, 5,425 bytes each (1,609 after HUD-04).
- Fix: `HOLD` 1,200 and `REFRESH` 1,100 for the compositor's own parts: a title every 55 s. A changed text is sent at
  once either way and turning a part off clears it. Before shipping, check on a client whether a respawn or a closed
  screen drops the title; if it does, redraw on `playerSpawn` (today the 4-second refresh hides that case).
- Prove it with: `map-compositor.js`, `side-boxes.js` (other packs' boxes still expire on time); a device check of
  death and respawn.

### HUD-15 find_bp: opening a chest in a row of identical double chests reads thousands of slots  [low (a spike) / confirmed / S / none]
- Where: `packs/find_bp/scripts/main.js:205-223` (`partnerOf`: up to 64 steps back, each a 54-slot `signature`), `:178-185`,
  `:258-289` (`record` reads all slots again for the counts), `:330-340` (three reads per open: now, 10 s and 60 s later,
  each with a new signature cache), `:125-131` (at 2,000 containers every save sorts the whole index and rewrites every
  shard after the one that changed), `:409-413` (`getBlocks` over 33 x 33 x 33 blocks in one native call per search: not
  measured).
- What happens and how often: empty double chests all have the same signature, so a new storage room is the worst
  case: opening one in a row of 20 reads about 40 x 54 slots, 4 to 6 ms, three times.
- Fix: in `signature`, return a constant when `emptySlotsCount === size` (one native call instead of 54); stop the walk
  back at 8; build signature and counts in one pass; skip the 10 s re-read when the signature did not change; at the cap
  evict down to 1,900 at once.
- Prove it with: `find-index.js` with a row of 20 empty double chests under `--profile`; `find-mode-bundle.js`.

### HUD-29 map_bp: at the store cap every new column disables the incremental planner  [high for radar users / confirmed (code path), cost needs-measurement / S-M / low]
- Where: `packs/map_bp/scripts/terrain.js:267` (`#evictFrom`: every evicted valid column does `s.demandVer++`), `:183`
  and `main.js:1319` (one eviction per new column once the store is full), `main.js:1420` (the rolling update needs
  `state.demandVersion === store.demandVer`), `:1447-1483` (the full plan: 797 radar pixels and 1,369 lattice candidates
  through `add()`, an `ages` map and a sort), `manual-scanner.js:97` (cap 6,000 up to 5 players), `terrain.js:322-345`
  (a block placed or broken on a known column bumps it too).
- What happens and how often: a radar circle is about 1,018 columns and moving one block adds 18, so a store reaches
  6,000 after about 280 blocks of travel in one session and stays there (nothing ages out). From then on each tick's
  reads evict columns, the counter moves, and the next `planFor` of every moving viewer of that store takes the full
  path: every tick for a single viewer or a fast mover (`planNow`), every 4 ticks otherwise. The evicted column is the
  oldest one not on any radar, so it is almost never inside the plan that gets rebuilt. A block placed or broken near
  a radar viewer also costs one full plan, where one pick would do.
- Cost estimate: 2,166 `add()` calls with 3 or 4 Map and Set operations each: 1 to 2 ms per full plan on QuickJS at
  the brief's 0.16 us a call (not measured), charged to the 6 ms scan time, so it also takes reading time away. The
  rolling path visits a few dozen candidates. `rollTerrainDemand` exists for exactly this and is switched off in the
  normal moving state.
- Fix: scope the counter. Keep demand versions per 64-block region like `Store.regions` (`terrain.js:25-30`) and compare
  the sum over the plan's own regions (`viewVer` does this for pictures); or skip the bump when the evicted column is
  outside every active plan's circle. For a block change inside a plan, append that one column instead of planning
  again. Evicting in batches (HUD-07) removes most bumps as well.
- Prove it with: a unit test beside `tools/map-rolling-demand.test.mjs`: a store at its cap, a viewer walking 100
  blocks, assert `labStats.rolled` rises and `labStats.planned` stays near 1; `scanPlanMs` in the HUD-01 scenario.

### HUD-30 map_bp: every 2 minutes a standing radar reads its whole circle again in one burst  [medium / confirmed / S / land changed by something other than a player shows later]
- Where: `packs/map_bp/scripts/main.js:1016` (`SCAN_MAX_AGE` 2,400), `:1461` (older columns become stale picks), `:1480`
  (`freshUntil` is the first expiry), `:1430-1441` (past it, every check is a full plan until the stale picks are read),
  `terrain-work.js:251-283` (stale picks go last but have no share of their own), `main.js:981-994` (placing and breaking
  blocks already invalidate their column at once).
- What happens and how often: the columns of a circle were read in the same 25 ticks, so they expire in the same 25
  ticks: about 2,300 operations at the full rate, with a full plan (HUD-29's 1 to 2 ms) on each of those ticks. Per
  distinct area with a radar viewer, every 2,400 ticks, to find changes that are rare: explosions, fluids, growth,
  pistons, mob griefing.
- Cost estimate: about 8,000 native calls, 80 to 110 ms per circle per 2 minutes: 0.04 ms a tick on average, but 4 to
  6 ms on 25 consecutive ticks. Ten viewers in ten places: one tick in ten runs at the ceiling.
- Fix: give stale refreshes 8 operations a tick (the circle is renewed over 15 s at 0.4 ms) and plan for them at most
  every 200 ticks; or stagger the age limit per column (2,400 plus a hash of the key modulo 1,200) and raise it to 10
  minutes, with `world.afterEvents.explosion` invalidating its blocks like the two block events do.
- Prove it with: the standing phase of the HUD-01 scenario run for 5 minutes (per-tick maximum of map_bp around tick
  2,400); `tools/map-cold-freshness.test.mjs`.

### HUD-31 map_bp: in the Nether every 8-block height band is its own store  [low / confirmed (code), cost needs-measurement / M / none]
- Where: `packs/map_bp/scripts/main.js:804-808` (`NETHER_BAND` 8, 2 blocks of hysteresis), `:1411-1412` (the store is
  chosen by band), `:1416` (`same` is false in a new store: full plan), `nether-layer.js:13-21`; `terrain.js:127-146` (24
  band stores kept).
- What happens and how often: climbing or dropping about 12 blocks in the Nether with the radar on starts a new store:
  a full plan and 1,018 columns to read (25 ticks at the ceiling), unless that band was visited before. Each band store
  also fills to its own 6,000 columns: 24 bands are more than the global cap.
- Fix: measure it in the HUD-01 scenario (a staircase in the Nether). If it shows: seed a new band from the
  neighboring band's columns where the ray would start below that column's roof, or widen the band to 16.
- Prove it with: `tools/map-nether-layer.test.mjs`; the scenario.

### HUD-32 atlas_bp: a full help census every 10 minutes, for a list that cannot change  [low / confirmed / S / none]
- Where: `packs/atlas_bp/scripts/main.js:402-409` (`scanPacks` sends `realm:help_ping`), `:1967` (`runInterval(scanPacks,
  12000)`), `:1951-1955` (also once at world load).
- What happens and how often: every 10 minutes, with or without players: one ping, 67 answers, each waking 67
  listeners: 4,556 callbacks in one or two ticks (XC-02). Packs cannot be added while the world runs.
- Fix: drop the interval and keep the scan at world load (plus one retry 10 s later); or read
  `globalThis.__realmDiag.packs` in a bundle as XC-02 (b) proposes.
- Prove it with: `atlas.js`; the bundle soak's callback count.

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| HUD-16 | `packs/map_bp/scripts/main.js:404, 417, 2747` | `resetChecked` keeps one id per player seen this session | delete in the `playerLeave` handler (`:2235`) |
| HUD-17 | `packs/map_bp/scripts/main.js:310, 316-330, 2489, 2507` | a list in parts whose last part never comes stays in `partial`; keys with a player id are not dropped on leave | drop the `|<player id>` keys on leave |
| HUD-18 | `packs/map_bp/scripts/main.js:870-913, 916-929, 1184-1208, 1366-1369` | two persistence intervals that can never act while `EXP.persistence` is false (1.5 callbacks a tick); the scanner allocates an array, two Sets and closures and reads the clock about 10 times every tick with no radar and no scan | do not register the two intervals when persistence is off; return from `scanFrame` when there are no candidates, plans, pending reads or manual scans |
| HUD-19 | `packs/map_bp/scripts/main.js:612-613` | townsfolk search kept 20 ticks against a 10-tick pass | part of HUD-03 |
| HUD-20 | `packs/map_bp/scripts/main.js:427-428` | `passAt.delete(player.id)` twice | delete one |
| HUD-21 | `packs/map_bp/scripts/terrain.js:27-30` | `bumpStoreRegions` builds a Set of 3 keys for every column stored, evicted or invalidated | three keys with two equality tests |
| HUD-22 | `packs/maps_bp/scripts/main.js:1137-1151, 254-263` | `maraOff` gets an entry per joining player and is never pruned | delete on `playerLeave` |
| HUD-23 | `packs/maps_bp/scripts/main.js:289-291` | `syncLegs` stringifies every hunt's leg every second per player to compare | compare the fields |
| HUD-24 | `packs/atlas_bp/scripts/main.js:214-243` | `saveSoon` writes every 24,000-character part of `atlas:built` or `atlas:cells` again when one record changed | keep the parts as written and write only those that differ (find_bp does) |
| HUD-25 | `packs/atlas_bp/scripts/main.js:346, 562-564, 999` | `retryAt`, `waits`, `tidied` (by slot) and `fullTold` (by player) are never pruned | delete on success or when older than their time |
| HUD-26 | `packs/waystone_bp/scripts/main.js:425-431` | discovery is players x waystones every second with a `center()` object each | squared distance on the numbers; skip players who know every waystone of their dimension |
| HUD-27 | `tools/side-shared.js:462, 645, 681, 702, 714, 725` | `playerById` is `world.getAllPlayers().find` for every draw the sweep or a message causes | a roster Map kept by join and leave |
| HUD-33 | `packs/atlas_bp/scripts/main.js:1035-1041, 1077-1090` | every player in one tick every 40 ticks, 5 native reads each (`isValid`, `dimension.id`, `getGameMode`, `location`): 200 reads in one tick at 40, which matches the pack's 0.07 ms a tick there (2.8 ms per run) | drop `isValid` (spread.js already skips leavers) and read the game mode only before finding or building; then `parts: 4` |
| HUD-34 | `packs/maps_bp/scripts/main.js:541-551, 425` | the warmth loop reads the inventory component, container, selected slot and item of every online player every 40 ticks in one tick, hunts or not (the first pass listed this as 2 to 3 reads and fine) | spread it (`spread.js`), or look only at players who ever held a map this session (set by `playerInventoryItemChange` / hotbar change with the item type filter) |
| HUD-35 | `tools/side-shared.js:693-729` | each of the 7 copies wakes every 4 ticks and copies `holds`, `claims` and `picture` keys into arrays; a non-compositor copy has a `claims` entry per composed player | keep the earliest expiry and return before the copies until that tick |
| HUD-36 | `packs/map_bp/scripts/main.js:964-980` | `blockChanged` runs on every block any player places or breaks: 5 `block.location` reads, 2 `dimension.id` reads, a Set and 3 keys per store, also when no radar was ever used | return first when `terrain.stores` and `pendingTerrain` are empty; read location and dimension once |
| HUD-37 | `packs/map_bp/scripts/main.js:1827-1916` | every radar draw builds the signature string twice (`:1842`, `:1851`), two view keys, a frame object with a new tag, and asks `residentTrace.active` about 12 times, for the operator's receipt diagnostics | build frames only while a trace or `map_debug detail` asked in the last 200 ticks |
| HUD-38 | `packs/map_bp/scripts/main.js:2143`, `settings.js:28` | bug, likely: `INTERVAL` is read from `CONFIG.intervalTicks`, never from `get("intervalTicks")`, so the Realm Configuration option "Markers update every (ticks)" does nothing even after a restart | read it in the `worldLoad` handler |
| HUD-39 | `packs/map_bp/scripts/main.js:488-507, 508-526` | the first pass after a join, and after any world setting change for everyone, makes 7 uncached `getFor` calls per player (7 property reads and parses) | XC-04 |
| HUD-40 | `packs/map_bp/scripts/main.js:2726-2752`, `packs/atlas_bp/scripts/main.js:967-996, 1970` | a join sends 4 pings from the Minimap and one from Atlas to all 67 listeners; Atlas answers with every found site in 1,800-character parts, each parsed by the Minimap | XC-01 makes it linear; the pings already carry `player`, so the answer is small until a player has hundreds of sites |
| HUD-41 | `packs/map_bp/scripts/` | dormant code is shipped and evaluated: `detail-persistence.js`, `preview-persistence.js` (655 lines), `scan-policy.js`, `planScan`, `aheadPicks`, `radarGeometry` for a turned map | remove with HUD-08, or leave to XC-08's comment stripping |

## Rejected leads

- HUD-28 (hud_bp re-sends an unchanged action bar every 40 ticks): not a finding. An action bar fades in 2 to 3 s; this
  is the refresh that keeps it up, and the HUD is off by default.
- HUD-04's fix "stop after the last non-empty segment": wrong. A box slot past the end slices to an empty string, which
  is not equal to `$slot_empty`, so `hud_screen.json:280` shows it. Only the radar and quest segments may be dropped.
- HUD-07's "columns stay resident until restart" and "lowering `maxCols` never trims": wrong. The store drains one
  column per refused insert, and refuses inserts meanwhile, which is the real problem.
- HUD-01's "contradicted by the docs": `docs/PACKS.md:1623,1629` state the 6, 2 and 1 ms budgets. Only the `config.js`
  comment, the `main.js` header and CLAUDE.md's 1 ms line are out of date. Its fix (the `BALANCED` profile) would also
  turn the 4-block preview on, a behavior change nobody tested.
- HUD-05's count of 36 expressions: it is 45.
- "Checked and fine: maps_bp warmth loop, 2 to 3 native reads per player": 4 to 5, for every player (HUD-34).

## Checked and fine

- map_bp strip dedupe: a part is sent only when its text changed or its refresh is due (`main.js:1897-1912`); a pass
  that finds the same markers draws nothing (`:1810`). The radar's exception is HUD-06.
- map_bp roster: `world.getAllPlayers()` once per 100 ticks plus join and leave events (`main.js:1052-1066, 2236`).
- map_bp `prefsOf`, destination and marks are cached per player and cleared on change and leave; `idOf` keeps
  `player.id` in a WeakMap.
- map_bp `champsIn`: one tagged search per dimension per 10 ticks for everyone (`main.js:653-676`).
- map_bp leave cleanup: 24 per-player maps plus the plans (`main.js:2235-2241`); a dimension change drops the view,
  the plan and the terrain memo (`:2226-2233`).
- map_bp turn checks never call `isValid` on a kept handle (`main.js:2050-2054`).
- map_bp `manualScans.synchronize` with no scan: one assignment (`manual-scanner.js:93-98`).
- map_bp glyph lookups: a column's shaded glyph is cached on the column until it or a neighbor changes
  (`terrain.js:760-794`).
- side.js: the subtitle is composed once per picture version (`side-shared.js:436-441`); the compositor's keep-alive
  sends no script event (`:544-548`); other packs' messages stay unparsed until that copy draws the player
  (`:653-666`); leave cleanup is complete (`:731-742`).
- spread-shared.js: one `getAllPlayers` per round, slots by id, leavers from the event, no `isValid`.
- hud_rp: 8 glyph pages of 256 x 256 (1.9 to 25 KB as PNG, about 2 MB decoded in all), radar frame and shade 238 x 248
  (2.1 and 0.9 KB), four 24 x 24 badges. No particles, fog or sounds.
- hud_bp `realm:hud_state`: on change and every 100 ticks only while someone sees the HUD.
- mobhp_bp `entityHurt`: returns after `damagingEntity` when the attacker is not a player; one draw per attacker per
  tick; the 5-tick name tag loop returns when nothing shows.
- find_bp: handlers check the block type first; the save writes only changed shards below the cap; the marker is one
  interval per marking player, cleared on leave, death, dimension change and replacement.
- waystone_bp: the list and each player's known set are cached; `entityHurt` uses the native player filter
  (`main.js:580-584`); the trip loop returns when no trip is on; the block events test the block type first.
- atlas_bp: no block reads in the player loop unless a region is new to the whole world (5 columns); `entityDie`
  returns at once while no fight is on; site building runs in `system.runJob`, one at a time.
- maps_bp: hunts cached per player; the 20-tick loop does nothing for a player without hunts beyond one Map lookup.

## Not read

- `packs/map_bp/scripts/detail-persistence.js`, `preview-persistence.js` (dormant), the bodies of `glyphs.js`,
  `purepalette.js`, `preview-glyph.js`, `map-debug-state.js`.
- `packs/maps_bp/scripts/main.js` lines 80-150, 780-860 (landmark scoring), 1160-1470 (menus, commands); `clues.js`.
- `packs/atlas_bp/scripts/main.js` lines 1-128, 615-920 (site building jobs), 1185-1500 (site rewards, fights),
  1580-1936 (milestones, menus); `lore.js`, `prefabs.js`.
- `packs/waystone_bp/scripts/main.js` lines 1-150, 345-384, 633-1120 (arrival, the inn, menus).
- `packs/find_bp/scripts/main.js` lines 565-676 (marker helpers), 825-930 (command, access checks).
- `docs/PACKS.md` "How the packs work together": the protocols were read from `tools/side-shared.js` and the packs'
  code instead. The scenarios under `tools/test-bds/examples/` beyond their headers. The `tools/map-*.test.mjs` unit
  tests except the two named above. Synced copies, per the brief.
- Nothing here was run: every cost is counted from the code with the brief's unit costs.
