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
| `--flat` | off | Superflat world (grass at y -61). |
| `--prop key=value` | | Extra `server.properties` line, repeatable (e.g. `--prop difficulty=hard`). |
| `--allow-error <regex>` | | Do not fail on script errors matching this, repeatable. |
| `--strict` | off | Also fail on content log errors and on caught errors that packs log as warnings. |
| `--no-shim` | off | Install packs unmodified (simulated players are then invisible to them; see below). |
| `--keep` | off | Keep the temp server folder (path printed at the end). |
| `--log <file>` | `logs/...` | Where to write the full log. |
| `--quiet` | off | Print only harness lines, warnings and errors. Recommended. |
| `-h`, `--help` | | Print the usage and exit. |

Environment: `BDS_DIR` (pristine BDS, default `%USERPROFILE%\.bds` on Windows or `/home/user/bds` on Linux; downloaded by `setup.mjs` if
missing), `BDS_HARNESS_CACHE` (world templates, default `.cache/`), `BDS_HARNESS_LOGS` (default
`logs/`), `BDS_HARNESS_TMP` (temp servers, default the OS temp dir).

## Inventory persistence regression

`node tools/test-bds/stash-persistence.mjs` stages a test-only copy of `stash_bp` and runs
`examples/stash-pages-persistence.js` through an actual BDS stop/start. It checks five full 24-slot
pages, names, damage, enchantments, shared hotbar contents, native filled-shulker contents (by placing
the restored box), and a potion's hidden auxiliary data with vanilla `hasitem`. It also checks
logout/rejoin and death while the shulker is on an inactive page.

The wrapper transfers the exact saved test handle and active inventory image to a fresh simulated
player, because simulated IDs change on restart; it does not change production identity handling.
It reserves ports 19362/19363 and keeps its mutable cache inside `tools/test-bds/.cache/`.
Run it separately from another inventory BDS run using those ports.

`node --test tools/stash-pages.test.mjs` covers injected storage/index/inventory-write failures,
rollback journals, legacy migration, cursor/button echoes, and overflow without a client.
These are model tests, not proof of client mouse/touch behavior.

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
   `Generator = 2` and drops the chunks. The result is cached in `.cache/worlds/` (about 100 KB).
2. **Server copy.** The platform binary (`bedrock_server.exe` or `bedrock_server`),
   `behavior_packs`, `resource_packs`, `definitions`, `data` are linked (no disk, about 0.3 s).
   Windows uses directory junctions and file hardlinks, including DLLs; Linux uses `cp -al`.
   Linking falls back to copying when unavailable (for example, across drives). Config files are copied. `server.properties`:
   `transport=nethernet` (TCP on `server-port`; raknet needs IPv6, which this container lacks), a
   random free port, `allow-cheats=true`, `online-mode=false`, no allow list, LAN visibility off,
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

- `run.mjs`: the runner. `setup.mjs`: downloads BDS 1.26.52 into `BDS_DIR` if missing.
- `lib/server.mjs`: server copies, properties, ports, world templates. `lib/packs.mjs`: pack
  discovery and installation. `lib/shim.js`: the shim. `lib/nbt.mjs`: NBT reader/writer.
  `lib/idle-scenario.js`: the default scenario.
- `testpack/scripts/harness.js`: the scenario API.
- `examples/`: scenarios.
