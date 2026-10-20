# BDS test harness (`tools/test-bds`)

Runs this repo's behavior packs on a real Bedrock Dedicated Server (BDS 1.26.52, Windows or Linux) with simulated
players, and fails when a pack logs a script error or when your scenario fails. Each run gets its
own temp copy of the server, its own world copy and its own port, so many runs (and agents) can go
at once. The pristine BDS is never run in place. Run from the repo root; `node tools/test-bds/setup.mjs`
downloads the platform's BDS into `BDS_DIR` (default `%USERPROFILE%\.bds` on Windows,
`/home/user/bds` on Linux) if it is not there, and `run.mjs` does that by itself on first use.
Requires Windows or Linux x86-64 and Node 22. Setup uses `curl.exe` and `tar.exe` on Windows
(falling back to PowerShell `Expand-Archive`), or `curl` and `unzip` on Linux (falling back to Python 3).
Platform path, installation detection, linking and copy-fallback regression tests (no BDS download):
`node --test tools/test-bds/lib/server.test.mjs`.

```bash
# Every *_bp and *_rp folder in packs/ (default --packs is this repo's packs/), no players: just watch them start (about 15 s)
node tools/test-bds/run.mjs --quiet

# Your scenario, only some packs
node tools/test-bds/run.mjs --only nick_bp,help_bp --scenario my-test.js --quiet

# The smoke test with every pack (about 30 s)
node tools/test-bds/run.mjs --scenario tools/test-bds/examples/smoke.js --quiet
```

Exit code: `0` pass, `1` scenario failed, `2` script errors (or `--strict` findings), `3` timeout,
`4` server or harness problem (also: the scenario file failed to load), `64` bad arguments. The
end of the output is a summary: verdict, script errors grouped by pack folder, caught errors that
packs logged as warnings, content log errors, watchdog warnings, your scenario's log lines, and the
log file path (the full BDS output, `logs/<time>-<pid>.log` next to `run.mjs`).

## Options

| Option | Default | |
|---|---|---|
| `--packs <dir>` | `../../packs` from `run.mjs`, if it exists | Folder that holds the pack folders (any git worktree's `packs/`). |
| `--only a_bp,b_rp` | every `*_bp` and `*_rp` | Install only these folders. |
| `--scenario <file>` | idle | Scenario module (below). Without one, the server runs `--ticks` ticks with no players. |
| `--ticks <n>` | 200 | How long the idle scenario waits. |
| `--timeout <s>` | 180 | Total time limit, setup and boot included. |
| `--seed <n>` | 1 | World seed. Each seed's world is generated once and cached in `.cache/`. |
| `--flat` | off | Superflat world (grass at y -61). The world spawn is pinned to 0,0 (flat templates used to draw a random one, e.g. 261,5). |
| `--bundle <file\|dir>` | | Run a built Realm Bundle (`dist/realm_bundle.mcpack` from `node tools/bundle.mjs --all`, or an unpacked folder) as **one** behavior pack: one script context and one dynamic property store, like the Realm. Replaces `--packs`/`--only`; `t.packs` lists the bundle's members, `t.bundle` its folder, name and members. |
| `--bundle-resources <file\|dir>` | | Also install a built resource bundle (`dist/realm_resources.mcpack`). |
| `--prop key=value` | | Extra `server.properties` line, repeatable (e.g. `--prop difficulty=hard`). |
| `--allow-error <regex>` | | Do not fail on script errors matching this, repeatable. |
| `--strict` | off | Also fail on content log errors and on caught errors that packs log as warnings. |
| `--no-shim` | off | Install packs unmodified (simulated players are then invisible to them; see below). |
| `--keep` | off | Keep the temp server folder (path printed at the end). |
| `--log <file>` | `logs/...` | Where to write the full log. |
| `--quiet` | off | Print only harness lines, warnings and errors. Recommended. |
| `--arg key=value` | | Passed to the scenario as `t.args.key` (a string), repeatable. |
| `--no-relay` | off | The shim does not relay pack messages (`t.messages()` stays empty; forms still work). For profiling. |
| `--profile` | off | Time every pack's callbacks during the scenario (see "Profiling" below). |
| `--profile-every <s>` | 60 | With `--profile`: also print an interim report every s seconds (0 = off). |
| `--profile-json <file>` | log + `.profile.json` | With `--profile`: where the JSON report goes. |
| `-h`, `--help` | | Print the usage and exit. |

Environment: `BDS_DIR` (pristine BDS, default `%USERPROFILE%\.bds` on Windows or `/home/user/bds` on Linux; downloaded by `setup.mjs` if
missing; the harness only links or copies it, never writes into it), `BDS_HARNESS_CACHE` (world templates and port
reservations, default `.cache/`), `BDS_HARNESS_LOGS` (default `logs/`), `BDS_HARNESS_TMP` (temp servers, default the
OS temp dir), `BDS_HARNESS_BASH` (the bash that runs suite header recipes; on Windows Git for Windows' `bash.exe`, never the
WSL launcher in `System32`). Give every parallel job its own `BDS_HARNESS_TMP` and `BDS_HARNESS_LOGS` (or leave them: the temp
server folder and the default log name are unique per run), and share one `BDS_HARNESS_CACHE`: templates and ports are
locked across processes.

Safe to run in parallel and after a crash: each run's ports (`server-port` and the IPv6 port above it) are picked free
from the OS **and** reserved with a lock file in the cache, so two runs (or a template generation and a run) never share
one; a reservation of a dead process is reused. A run's server folder holds `server.owner.json` (harness pid, `bedrock_server`
pid, port); the harness only ever stops the exact pid it started, never a process by name.

## Profiling (`--profile`)

`--profile` adds `lib/profile.js` to every shimmed behavior pack (after the shim, before the pack's
entry, in the temp copy only). It wraps the callbacks a pack hands to the game, calls them with the
same `this` and arguments and returns their result, so the pack behaves the same:
`system.run`/`runTimeout`/`runInterval`, each step of a `runJob` generator, every
`world`/`system` `beforeEvents`/`afterEvents` subscription (unsubscribe takes the pack's own function
as before) and custom command callbacks. It also counts `setDynamicProperty` writes (world, entity,
item, and the characters written), `setActionBar`, `setTitle` and `runCommand` calls. Each callback
is named by its kind and the `file:line` that handed it over (`runInterval(20) @ main.js:148`). The
window starts when the scenario starts (startup and module loading are not measured) and ends when
it finishes; with `t.restart()` only the last phase is reported. The test pack also measures the
wall time between ticks (TPS, tick interval p95), and on Linux `run.mjs` reads `bedrock_server`'s CPU
time and memory from `/proc`.

The summary then lists, per pack sorted by cost: ms/tick (average), the p95 and max of a tick's ms,
calls/tick, `setDynamicProperty`, `setActionBar`, `setTitle` and `runCommand` per tick and the top
callback; the JSON report (`--profile-json`) has the top 5 callbacks of each pack, and the
whole-bundle per-tick total (packs summed tick by tick: p50, p95, p99, max).

Limits: Bedrock scripting has no high-resolution clock, so times are `Date.now()` differences: a
single call reads 0 or 1 ms, but sums over many calls are unbiased, and per-tick p95 values are whole
milliseconds. Code after an `await` in an async callback runs as a promise continuation and is not
counted. A pack that triggers another pack's before-event handler synchronously is charged for it as
well. With message relaying on, a pack's `sendMessage`/`setActionBar`/`setTitle` time includes the
shim's relay (a script event per message), so profile with `--no-relay`. The simulated players and
the scenario itself also cost server time that no pack is charged for.

```bash
node tools/test-bds/run.mjs --quiet --no-relay --profile --scenario tools/test-bds/examples/perf-soak.js --arg players=10 --arg seconds=300 --timeout 900
```

`examples/perf-soak.js` spreads `players` simulated players around spawn in groups (two near spawn,
the others 240+ blocks apart, two in a pool, two in the Nether), makes them walk, look around, sneak
and jump, and run a few common commands for `seconds` (see its header for the other arguments).

## Running every example (`suite.mjs`)

`node tools/test-bds/suite.mjs --jobs 2 --retry` runs every scenario in `examples/` with the command
from its own header (the first `node tools/test-bds/run.mjs ...` line; the scenario path is always the
file itself) and prints `scenario | result | seconds | first failure line`, then the totals. Results:
`pass`, `fail`, `flaky` (failed, then passed when rerun alone with `--retry`), `timeout`, `skipped`.
Headers that build a test copy with a plain shell recipe (the lines just above the command: `mkdir`,
`cp`, `sed`, `grep`, `cat`, `node ...` hooks...) get the recipe run first in **bash** (on Windows Git for Windows'
`bash.exe`, found from `git` on `PATH` or `BDS_HARNESS_BASH`), with every `/tmp/` replaced by a quoted folder of the suite
run in the quoting context it sits in (unquoted, inside `'...'`, inside `"..."`, in a here-document), and `$S` quoted, so
a folder with spaces, apostrophes or Windows backslashes works. A folder path with `"`, `$`, a backtick or a line break
is refused with a clear message. `node tools/test-bds/suite.mjs --prepare-only [--filter <regex>] [--json out]` stages every
recipe and checks the folder each run command points at, **without starting BDS** (about 3 s for all 17).
Test hooks that a scenario needs inside a pack (packs can't read each other's dynamic properties) live in
`hooks/` and are appended to the test copy by the recipe (`hooks/maps-rvtest.js` for maps-cleanup and
maps-leave, `hooks/rainbow-rvtest.js` for rainbow-race, the `hooks/limit_bp` probe pack for
harness-event-limit, Node stagers such as `hooks/saga-starfall-stage.mjs` and `hooks/stage-saga-softlock.mjs`); a `--packs`
header without a recipe is skipped ("needs hook copy"). A header whose
command runs another scenario file fails (and `npm run check` catches it too). A few have no plain command and are listed in
`SPECIAL` in `suite.mjs` (smoke and restart with every pack, forms, domt-champion, the
npc-name-capability probe, saga-lighthouse, bundle-smoke (builds `dist/realm_bundle.mcpack` first and runs it as one
script context), and stash-pages-persistence through `stash-persistence.mjs`).
Options: `--jobs N` (default 2; each run is CPU bound), `--filter <regex>` (scenario names),
`--retry`, `--json <out>`, `--list` (print each plan and exit), `--prepare-only` (above). Logs go to
`logs/suite-<time>/<scenario>.out` (run.mjs output) and `.log` (full BDS log). The exit code is 1 when
anything failed or timed out. The whole suite takes a few hours at `--jobs 2`.

`node tools/test-bds/suite.mjs --perf 10,40 [--perf-seconds 120] [--perf-only a_bp,b_bp] [--json out]` runs
only `perf-soak.js`, once per player count (one at a time, with `--profile`), and prints ms/tick per pack side by
side with the budget: the whole bundle under 5 ms/tick at 40 players, a typical pack at most 0.15, the Minimap
(`map_bp`) and HUD (`hud_bp`) at most 1. The JSON reports land in the suite's log folder.
**A count only counts when its soak was valid:** the soak must spawn every declared player (an old guard of
`made > 0` let a run that spawned 97 of 100 be written up as a 100-player measurement), keep all of them in the world at every
second of the soak, place the declared water and Nether players, and run its full `seconds` of game time with the profile
covering that window. The scenario reports this as `perf-workload` (`t.report`), `run.mjs` puts it and the verdict
(`acceptance`: `ok` and `reasons`) into the profile JSON next to `bundle.steadyWindow` (the soak window alone, without the spawn
ramp), prints `perf acceptance: VALID/INVALID`, and fails the run (exit 1) when invalid; `suite.mjs --perf` marks the count
INVALID, lists it, and exits 1. The profile still spans the spawn ramp plus the soak, as before; keep both observations when
a run is retried (an invalid first run and its valid retry), and never change the group, spread, water or Nether settings to
make a comparison pass. What the profiler measures: time inside the callbacks each pack handed to the game; time after an
`await` inside an async callback is not attributed (see `lib/profile.js`), and a run of separate packs sums separate script
contexts, whereas `--bundle --profile` measures the real merged context as one row.

Population setup removes only its own temporary ticking areas, never another pack's loader, then yields one tick
before adding the next loader. Population, group/spread, water/Nether placement and the steady window are unchanged.
Use the same setup version for the frozen before packs and candidate packs; retain invalid population attempts.

The shim also checks the script event rule: a pack that sends a `realm:` script event of 2048 characters or
more logs a `[harness-shim] ... sent script event ... with N characters` script error, so the run fails (BDS
1.26 delivers any length, so only a Realm would notice). Scenarios can listen for `harness:limit`
`{pack, id, length}` too (`examples/harness-event-limit.js`).

## The Realm Bundle as one script context (`--bundle`)

The Realm runs every behavior pack as ONE add-on (`tools/bundle.mjs --all`): one script context, one `scriptEventReceive`
bus, one dynamic property store. Separate-pack runs hide what only shows there (a canceled `beforeEvents` event that
later subscribers in the same pack still see, C13; a key two packs share; one pack's prototype patch seen by another).
`node tools/bundle.mjs --all` then
`node tools/test-bds/run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/bundle-smoke.js --timeout 300`
installs the built bundle (the real file, not a re-merge) under the shim and profiler as a single pack (`lib/unzip.mjs`
unpacks it; it must have exactly one script module that imports at least two packs). `examples/bundle-smoke.js` checks that
it loads without a script error and that every member answers `realm:help_ping` and `realm:diag_ping` with its own
folder, then runs `/realm:help`. Scenarios use `t.packs` (the members) and `t.bundle`; message and form attribution is
the bundle's name (`realm_bundle`), not the member's. `hooks/diag-bundle.mjs` stays the small, fast fixture for the diag
protocol. CI runs the smoke test after check and build (`.github/workflows/check.yml`, job `bds-smoke`, Ubuntu 24.04, BDS
from minecraft.net cached by version, 25 minutes at most).

## Releasing (`tools/release.mjs`)

`node tools/release.mjs plan` prints the whole ship order from CLAUDE.md and changes nothing; `prepare`, `source`, `publish`
and `live` run one phase with `--execute --state <file>` and refuse to start until the earlier phases are on record for the
exact commit. It never uploads to the Realm, passes `--allow-dirty` or a force flag, merges with admin rights, or invents a
native-test or review result (those are receipts: `{schema: "release-evidence-v1", kind, sourceSha, result: "pass", artifacts}`).

## Parallel runs, templates and crashes

The first run for a seed (or `--flat`) generates the world template once. Several runs that need it at the same time take an
exclusive lock folder (`<template>.lock/owner.json` names the owner pid), one generates, the others wait and use its result.
The finished template is built in a staging folder, marked ready (`template.ready.json`) and published with one rename, so
a half-built template is never used; a lock whose owner died is cleaned up with its staging and temp server folder (a
`bedrock_server` it left running is reported by pid, never stopped by name). Templates from before the marker are adopted
when they are finished (`level.dat` parses, seeded ones have their `db/CURRENT`), others are rebuilt.
`node tools/test-bds/template-race.mjs [--workers 3] [--flat]` runs the race offline with a stand-in generator (separate
processes, a cold cache): exactly one generation, one ready folder, no lock or staging left; `--real --cache <empty dir>` does
it with real BDS (starts one `bedrock_server`).

## Harness input checks

A ticking-area circle radius must be a whole number from 1 to 4. `t.loadArea` and every `t.cmd`/`t.server` of a
`tickingarea add circle` command reject another radius immediately with the rule (the first O74 fixture's radius 6 used
to be swallowed and showed up 400 ticks later as "chunk did not load"), and a `tickingarea add` the game rejects
(for example the 10-area limit) fails at once with the game's own message unless the column is already readable.
`examples/harness-tickingarea-inputs.js` shows both against the real game.

Ticking areas are saved with the world, so they outlive `t.restart()`. `t.loadArea` names each area
`harness_<phase>_<n>` and saves the list of the areas it added (the test pack's own `harness:tickingAreas` property,
not any pack's data). A phase that calls `t.restart()` removes those areas, and only those, before it ends, while
their chunks are loaded; the next phase removes whatever is still listed (an area the game would not remove, or a
phase that ended another way) before its scenario starts. That start is the last try: an area that still cannot be
removed leaves the list with a log line (BDS answers a remove of an area that is already gone, say after a scenario's
`/tickingarea remove_all`, with no success, so it is not retried every phase). Removing them only at the start of the next run broke the
atlas scenario: an area whose chunks were still loading from the save, removed then, left those chunks unloadable for
the whole run, even under a new area over the same spot (`chunk at 2000,2000 did not load in 400 ticks`, with 1 of 10
areas in use). A scenario's own areas are never touched, a list entry that is not a harness name is refused, and a
removal the game rejects is logged as `ticking area cleanup: ...` and the run goes on. Before this, the second phase's first `t.player()` at the same spot
failed with `tickingarea add circle ... failed: the command did not succeed` (the name was taken, and the old area's
chunks were not readable yet). `lib/harness-lifecycle.test.mjs` runs `harness.js` against a fake game whose areas
survive a restart; `lib/rain-seabed.test.mjs` runs Rain's real scripts, the scenario's hook and the scenario itself.

## Inventory persistence regression

`node tools/test-bds/stash-persistence.mjs` stages a test-only copy of `stash_bp` and runs
`examples/stash-pages-persistence.js` through an actual BDS stop/start. It checks five full 24-slot
pages, names, damage, enchantments, shared hotbar contents, native filled-shulker contents (by placing
the restored box), and a potion's hidden auxiliary data with vanilla `hasitem`. It also checks
logout/rejoin and death while the shulker is on an inactive page.

The wrapper transfers the exact saved test handle and active inventory image to a fresh simulated
player, because simulated IDs change on restart; it does not change production identity handling.
It defaults to ports 19362/19363 and keeps its mutable cache inside `tools/test-bds/.cache/`.
Use `node tools/test-bds/stash-persistence.mjs --port 19372` to reserve 19372/19373 instead.
Run it separately from another BDS run using the same ports.

`node --test tools/stash-pages.test.mjs` covers injected storage/index/inventory-write failures,
rollback journals, legacy migration, cursor/button echoes, and overflow without a client.
These are model tests, not proof of client mouse/touch behavior.

`node tools/test-bds/stash-persistence.mjs --scenario tools/test-bds/examples/stash-page-transfer-restart.js`
uses that same exact-native-handle identity adapter to move a genuine shulker, potion and enchanted sword between
pages before each of two physical BDS restarts. It then checks hidden contents/data and exactly-one counts across
the committed pages. `--keep` retains the named test pack/server copies; `--log <file>` selects the official log.
The default scenario and port pair are unchanged. `BDS_HARNESS_CACHE` also owns this adapter's staged pack directory.

Player dynamic properties are add-on scoped too: reading `player.getDynamicProperty("stats:pref")` from the test
pack cannot inspect Stats' saved choice. `hooks/stats-prefs.mjs` stages a console-only probe inside Stats for
`stats-ticker-personal.js`. Register message waits before triggering forms, or pass `since` from before the action;
an immediate toggle reply can arrive before the next form is answered.

## Writing a scenario

A scenario is an ES module with a default async function. It runs inside the harness test pack,
which may use `@minecraft/server` 2.1.0 and the beta `@minecraft/server-gametest`, so import from
those freely. It is copied alone into the test pack as `scripts/scenario.js`: it cannot import
other files of yours.

```js
export default async function (t) {
  const p = await t.player("Tester", { op: true });   // simulated player at the world spawn
  const menu = t.waitForm(p);                          // start waiting before the command
  t.assert(t.cmd(p, "/realm:help").ok, "help ran");
  const form = await menu;                             // what the pack showed
  t.log(form.title, form.buttons);
  form.answer("Stats");                                // press the button labeled ...Stats...
  const msg = await t.waitMessage(p, /saved/i);        // what a pack sent with sendMessage
  t.check(p.nameTag.includes("x"), "name tag");        // non-fatal; the run fails at the end
}
```

Returning normally passes. A thrown error, a failed `t.assert`, `t.fail()` or any failed
`t.check` fails the run. Independently, any `[Scripting]` error from any pack fails it too (exit 2).

### Reference

Players and commands

- `await t.player(name = "Tester", opts)`: spawns a simulated player and waits until it is in the
  world. `opts`: `x`, `z` (default: the world spawn), `y` (default: on the highest solid block),
  `dimension` (`"overworld"`), `gameMode` (`"survival"`, `"creative"`, `"adventure"`,
  `"spectator"`), `op` (`true` = operator, i.e. `GameDirectors`, or a level name like `"admin"`),
  `settle` (ticks to wait after spawning, 10). The chunk is loaded first with a ticking area
  (`harness_<n>`), which stays. Returns a gametest `SimulatedPlayer` (a `Player`), so everything
  is available: `p.location`, `p.teleport()`, `p.getComponent("inventory")`, `p.giveItem()`,
  `p.breakBlock()`, `p.interactWithBlock()`, `p.useItemInSlot()`, `p.moveToLocation()`,
  `p.navigateToLocation()`, `p.lookAtBlock()`, `p.attackEntity()`, `p.jump()`, `p.disconnect()`...
  Block methods take world coordinates (the player is not inside a gametest structure), and what
  it does fires the usual events in other packs (verified: `playerBreakBlock`, `playerPlaceBlock`,
  `playerInteractWithBlock`, `itemUse`). Example: `p.breakBlock(below)`,
  `p.giveItem(new t.mc.ItemStack("minecraft:cobblestone", 4), true)`,
  `p.useItemInSlotOnBlock(p.selectedSlotIndex, below, t.mc.Direction.Up)`.
- `t.op(p, level = "gamedirectors")`, `t.deop(p)`: sets `p.commandPermissionLevel`. Packs that
  check `player.commandPermissionLevel >= GameDirectors` see an operator. `await t.console("op Name")`
  also works.
- `t.cmd(p, "/realm:help topic")`: runs a command as the player (`p.runCommand`). Custom
  `realm:` commands work. Returns `{ ok, successCount, error }`: `ok` is false when the command
  returned `CustomCommandStatus.Failure`, threw, or did not parse (`error` has the parse message).
  The text a custom command returns (`{ message }`) is not visible.
- `t.server("/time set night")`: runs a command from the overworld with no player (commands that
  need a player, like most `realm:` ones, fail with "Must be run by a player").
- `await t.console("list")`: types a command into the BDS console (its output only goes to the log).
- `t.chat(p, "hello")`: the player chats. Packs on stable APIs cannot read chat, so this is rarely useful.

Waiting

- `await t.wait(ticks)`, `await t.seconds(s)` (20 ticks = 1 s).
- `await t.waitUntil(() => cond, { timeout: 200, interval: 1, message })`: polls until truthy,
  returns the value, fails the scenario on timeout. Errors inside the function count as "not yet".
- `await t.loadArea(x, z, { radius: 2 })`: loads a spot with a ticking area and returns
  `{ top }`, the highest solid block there.
- `t.tick`: the current tick.

Messages (what packs tell players)

- `t.messages(p?, { kind, pack, since })`: everything packs sent to `p` (or anyone) so far:
  `{ tick, pack, kind, to, text, plain, raw }`. `kind` is `"chat"` (`player.sendMessage`),
  `"broadcast"` (`world.sendMessage`, `to: "*"`, included for every player), `"title"` or
  `"actionbar"` (`onScreenDisplay.setTitle` / `setActionBar`), or `"subtitle"` (`updateSubtitle`). `plain` has the color codes removed;
  translated text shows as `%key(args)`. `pack` is the folder of the pack that sent it. A title also has
  `subtitle` (as sent, color codes kept) and `ticks` (fade in + stay + fade out) when the pack passed options.
- `await t.waitMessage(p, pattern, { timeout: 200, kind, pack, since })`: waits for the next
  message whose plain text matches (`string` = contains, case-insensitive; `RegExp`; or a
  function). Pass `since: t.tick` before running a command to also accept a message that arrived
  in the same tick. Fails the scenario on timeout.
- `t.clearMessages()`. `t.echoActionBar = true` prints action bar text too (off: the HUD packs
  send it every second).

Forms (simulated players cannot click, so the harness answers for them)

- `await t.waitForm(p, { timeout: 200, title })`: waits for the next form shown to `p` and returns
  `{ type: "action" | "modal" | "message", pack, title, body, buttons, elements, answer(a), answered, response }`.
  Start waiting before the command that opens it. Unanswered forms are closed (`UserClosed`) after
  `t.formTimeout` ticks (default 100), so answer within that.
- `form.answer(a)`: action and message forms take a button index or a label (exact, then
  "contains", case-insensitive, color codes ignored); message forms: `button1` is 0, `button2` is 1.
  Modal forms take an object keyed by (part of) the input labels, e.g.
  `{ Nickname: "Sir Alex", Color: "Gold", "Remove": true }` (dropdowns take an index or an option
  label; inputs you leave out keep their default), `true` to submit the defaults, or a raw
  `formValues` array. `null` closes the form (`UserClosed`), `"busy"` answers `UserBusy`.
- `t.answerForm(p, a1, a2, ...)`: queues answers for the next forms `p` sees; they are used
  immediately when each form opens. `a` may also be a function `(form) => answer`.
- `t.forms(p?)`: every form shown so far.
- Modal answers come back with one `formValues` entry per element in order, `undefined` for
  labels, headers and dividers (what the 2.0.0 typings describe). The packs here accept both layouts.

Checks and results

- `t.assert(cond, msg)`: fails and stops the scenario. `t.check(cond, msg)`: records a failure and
  continues. `t.fail(msg)`, `t.pass(msg)`: stop now.
- `t.allowError(/regex/)`: script errors matching this do not fail the run (applies to the whole
  run, including errors already logged).
- `t.restart(msg)`: ends this phase; the harness stops the server, starts it again on the same
  world and runs the scenario again with `t.phase` 2 (then 3...). For saved data, see
  `examples/restart.js`.
- `t.log(...)`: printed as `[scenario] ...` and listed in the summary.
- Also: `t.world`, `t.system`, `t.dimension` (overworld), `t.mc` (`@minecraft/server`), `t.gt`
  (`@minecraft/server-gametest`), `t.packs` (installed pack folders), `t.phase`.

Examples: `examples/smoke.js` (help menu, commands from several packs), `examples/forms.js`
(modal form answered by label, then the pack's reply; run with `--only nick_bp`),
`examples/restart.js` (data across a restart).

## How it works

1. **World template.** The first run for a seed (or `--flat`) boots BDS once with no packs,
   stops it and patches `level.dat` (little-endian NBT, `lib/nbt.mjs`): `experiments.gametest = 1`
   (the "Beta APIs" toggle that `@minecraft/server-gametest` needs; BDS logs
   `Experiment(s) active: gtst`), `cheatsEnabled`, `commandsEnabled`. For flat it sets
   `Generator = 2`, pins the world spawn to 0,0 (`SpawnX/Y/Z`, `lib/server.mjs` `FLAT_SPAWN`; every run's copy is pinned again) and drops the chunks. The result is cached in `.cache/worlds/` (about 100 KB) with a
   `template.ready.json` marker; see "Parallel runs, templates and crashes".
2. **Server copy.** The platform binary (`bedrock_server.exe` or `bedrock_server`),
   `behavior_packs`, `resource_packs`, `definitions`, `data` are linked (no disk, about 0.3 s).
   Windows uses directory junctions and file hardlinks, including DLLs; Linux uses `cp -al`.
   Linking falls back to copying when unavailable (for example, across drives). Config files are copied. `server.properties`:
   `transport=nethernet` (TCP on `server-port`; raknet needs IPv6, which this container lacks), a
   free, reserved port pair, `allow-cheats=true`, `online-mode=false`, no allow list, LAN visibility off,
   content log to the console.
3. **Packs.** Each pack is copied into `development_behavior_packs/` or
   `development_resource_packs/` and listed in the world's `world_behavior_packs.json` /
   `world_resource_packs.json`. Behavior packs with scripts get a shim (only in the temp copy):
   the manifest gains a `@minecraft/server-gametest` dependency and the entry becomes
   `__harness_entry.js`, which imports `__harness_shim.js` and then the pack's own entry. The
   shim (`lib/shim.js`):
   - imports `@minecraft/server-gametest`. **Without it a simulated player is invisible to a pack**:
     `playerSpawn` gives `player: undefined`, `world.getAllPlayers()` returns `[undefined]`, and the
     pack throws errors that would never happen with real players. This is why packs run shimmed;
     the packs' own code is unchanged, and they still never use a beta API themselves;
   - relays `Player.sendMessage`, `World.sendMessage`, `setTitle` and `setActionBar` to the test
     pack (script event `harness:relay`, split into parts under 2048 characters);
   - replaces `show()` of `ActionFormData`, `ModalFormData` and `MessageFormData` for simulated
     players only: it records the builder calls (title, body, buttons, inputs), sends them to the
     test pack, and resolves with the answer it gets back (`harness:form_reply`). A form shown to a
     simulated player without the shim never resolves.
4. **Test pack** (`testpack/scripts/harness.js` + your scenario). When the console prints
   `Server started.`, `run.mjs` sends `scriptevent harness:start {...}`; the test pack runs the
   scenario and reports through `HARNESS {json}` console lines, which `run.mjs` parses
   (`[Scripting] [<pack name>] ...` error lines are mapped back to pack folders).

## Limitations

- **Command permissions.** `p.runCommand()` runs custom commands even when the player lacks the
  command's registered `permissionLevel` (script-run commands skip that check). Checks a pack
  does itself (`player.commandPermissionLevel >= GameDirectors`) work. You cannot test "a member
  typing an operator command is refused by Bedrock".
- **Command output.** The `message` a custom command returns, and vanilla command feedback, are not
  visible to the scenario. Only `ok`/`successCount` and parse errors.
- **Forms.** Only forms built with `@minecraft/server-ui` in a shimmed pack are seen and answered.
  Response objects are plain objects (`canceled`, `cancelationReason`, `selection`, `formValues`),
  not real `ActionFormResponse` instances; `instanceof` checks on them would fail.
  No client means no `UserBusy` from chat being open unless you answer `"busy"`.
- **Chat.** Packs on stable APIs cannot see chat; `t.chat()` is only for packs that could.
  Messages are captured at the `sendMessage` call, not as the client would render them (raw text
  with `translate` shows as `%key`). Command feedback and death messages are not captured.
- **Player identity.** A simulated player gets a new `player.id` (an entity id like
  `-8589934588`) each time it spawns, so data a pack stores by `player.id` does not follow it after
  `disconnect()` or a restart. It has no Xbox identity; `stats_bp` logs
  `migrate: Error: Failed to resolve identity for 'Tester'` (caught, harmless here).
  `playerJoin`, `playerSpawn` (initial), `playerLeave` do fire.
- **Chunks.** Only chunks near simulated players and ticking areas are loaded. `t.player()` and
  `t.loadArea()` load what they need; reading blocks elsewhere throws `LocationInUnloadedChunkError`.
  The world is fresh: day 1, 6:00, nothing built. The default spawn of seed 1 is (163, 70, 170) on grass.
- **Resource packs** are installed and validated, but nothing renders them (no client).
- **Start-up phase.** "startup" in the summary means before the scenario started (the scenario
  starts right after `Server started.`); an error a pack logs on its first ticks may be listed under
  "scenario".
- **Watchdog.** With every pack installed, BDS logs `[Watchdog] High memory usage detected` once at
  startup (also without the shim). It is listed, not failed.
- **Network.** `transport=nethernet` signs in to Microsoft's signaling service at startup (needs
  internet; nothing else does once BDS is installed).

## Timings (4-core container, measured with 53 behavior and 3 resource packs; there are more now)

| | |
|---|---|
| First run for a new seed (world template) | +5 s, once |
| Prepare the temp server | 0.3 s |
| Boot, 1 pack | 2.5 to 3 s to `Server started.` |
| Boot, all behavior and resource packs | 5.5 to 7 s |
| Idle run, all packs, 100 ticks | about 17 s total |
| `examples/smoke.js`, all packs | about 27 s total |
| `examples/forms.js`, 1 pack | about 10 s total |
| Four runs in parallel | about 30 to 55 s each (CPU bound) |
| Stop | under 1 s |

## Files

- `run.mjs`: the runner. `setup.mjs`: downloads BDS 1.26.52 into `BDS_DIR` if missing (unpacked into a staging
  folder, moved into place when complete). `suite.mjs`: every scenario, `--perf`, `--prepare-only`.
  `template-race.mjs`: the cold-cache template race check.
- `lib/server.mjs`: server copies, properties, port reservations, world templates (locks, ready marker, pinned flat spawn).
  `lib/packs.mjs`: pack discovery, bundle loading and installation. `lib/shim.js`: the shim. `lib/nbt.mjs`: NBT
  reader/writer. `lib/unzip.mjs`: the `.mcpack` reader. `lib/recipe.mjs`: header recipe staging and bash lookup.
  `lib/tickingarea.js`: ticking-area input checks (also copied into the test pack). `lib/perf-acceptance.mjs`: the
  perf-soak verdict. `lib/profile.js`, `lib/profile-report.mjs`: the profiler. `lib/idle-scenario.js`: the default scenario.
  `lib/*.test.mjs` run in `npm run test`.
- `testpack/scripts/harness.js`: the scenario API.
- `examples/`: scenarios.
