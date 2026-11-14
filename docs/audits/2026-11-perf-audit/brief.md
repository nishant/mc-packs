# Performance audit, November 2026: common brief for reader agents

You are one reader in a read-only performance audit of `nishant/mc-packs` (Minecraft Bedrock add-on packs that run
together on one Realm as a single bundled add-on). You find and document opportunities; you change no code.

## Hard limits

- Work only inside `C:\Code\mc-packs-perf-audit` (a git worktree at master `68095de5`). Never search or list anything
  above it: `C:\Code` holds 34 checkouts with `node_modules`, and a recursive scan there has starved the live sites
  that run on this PC. Always give the Grep and Glob tools an explicit `path` inside the worktree, scoped to your
  packs. No `grep -r`, `find`, `rg` or `Get-ChildItem -Recurse` from the shell.
- Read-only: no edits to code, no `npm`, no builds, no Bedrock server runs, no git commands that write, no network.
  Your only write is your findings file (below).
- Do not start subagents.
- Never open generated or huge files whole: `packs/help_bp/scripts/catalog.js`, `packs/admin_bp/scripts/catalog.js`,
  `docs/PACKS.md` (1 MB: grep for a `## ` heading and read that range), `packs/saga_bp/scripts/stories/*` (grep, read
  ranges). In each behavior pack, `scripts/diag-core.js`, `settings-core.js`, `script-events.js` and the other synced
  copies are identical in every pack: their source is `tools/<name>-shared.js`, audited separately. Skip the copies.
- Read big `main.js` files by range: grep for `runInterval`, `subscribe`, `getDynamicProperty` and so on, then read
  around the hits.

## What is already known (do not re-report it)

The steady-state script time is measured after every merge and is within budget. Newest report (issue 218, GitHub
hosted 4 vCPU runner, simulated players in groups of 5 who take short walks, about a third of them each second, and
run a command every 45 s; the soak never sets the time or the weather, so night, moon and weather packs are measured
by luck or not at all):

| | 10 players | 40 players |
|---|---:|---:|
| Realm Bundle (one script context) | 1.06 ms/tick | 2.03 ms/tick |
| 67 packs as separate contexts, summed | 1.23 | 2.76 |
| map_bp | 0.55 | 0.93 |
| stash_bp | 0.030 | 0.144 |
| build_bp | 0.090 | 0.112 |
| wander_bp | 0.021 | 0.111 |
| saga_bp | 0.043 | 0.107 |
| stats_bp | 0.024 | 0.093 |
| elite_bp | 0.037 | 0.088 |
| hud_bp | 0.024 | 0.080 |
| elytra_bp | 0.038 | 0.080 |
| atlas_bp | - | 0.070 |
| skills_bp | 0.021 | 0.061 |
| admin_bp | - | 0.056 |
| relics_bp, moon_bp, quests_bp | - | about 0.054 each |

Every other pack is under 0.05 ms at 40. Budget: bundle under 5 ms/tick at 40, a typical pack 0.15, Minimap and HUDs 1.
Memory soak at 40 players for 60 minutes: bedrock_server RSS 1.3 GB at start, 1.56 GB at 10 minutes, +47 MB over the
next 50 minutes.

Measured unit costs on the server (QuickJS, no JIT): one native call about 10 us; `world.getAllPlayers()` 4 us at 1
player, 10.5 us at 40; `player.id` 0.2 us; inventory `getItem` 1.8 us; a plain function wrapper 0.16 us. The only
clock is `Date.now()` (whole ms). A tick is 50 ms.

Things already tried and measured as no gain (do not propose again unless you have a different mechanism): npc_bp
label loop with a per-dimension observer list and cached names; wander_bp reusing players' places for half a second.

So a finding that only says "this loop runs every tick" is not useful unless you can show its cost is real (count the
native calls per tick per player) or that the profiler's workload does not exercise it.

## What the soak does NOT measure: look hardest here

The real Realm has at most 10 players, usually 1 to 4, on phones, tablets and consoles, and the owner plays on a
Galaxy Z Fold 7. The soak uses simulated players that only take short walks: they load no chunks, never fly, fight,
break or place blocks, open no menus, have no quests, and never join or leave mid-run. So these are the blind spots:

1. **Idle floor.** The bundle costs about 0.7 ms/tick before the per-player part (1.06 at 10, 2.03 at 40 is roughly
   0.74 + 0.032 per player). Work that runs every tick or every second regardless of who is online or whether the
   feature is in use: timers that could stop when there is nothing to do, polling that an event could replace,
   intervals that could be slower or merged.
2. **Spikes.** One long callback matters more than the average: the watchdog warns on slow ticks and a hang kills
   the server. Look for synchronous bursts: world load, a player joining (every pack's join handler runs in the same
   tick in a bundle), leaving, dying, changing dimension; opening a menu that builds a large form; big
   `JSON.parse` / `JSON.stringify`; block scans (`getBlock` in loops, `getTopmostBlock` columns); `getEntities`
   over a whole dimension with no location, distance, type or tag filter; structure saves and loads; loops over
   every known player (online or not); sorting or rebuilding leaderboards.
3. **Players who move and play.** Costs keyed to movement, chunk changes, combat, block breaking and placing, item
   use, inventory changes, entity spawns and deaths, projectile hits. High-frequency after-events (`entityHurt`,
   `entitySpawn`, `entityRemove`, `entityDie`, `playerBreakBlock`, `playerPlaceBlock`, `itemUse`,
   `playerInteractWithBlock`, `entityHitEntity`, `projectileHit*`, `dataDrivenEntityTrigger`, `pistonActivate`,
   `explosion`, `weatherChange`, `effectAdd`, `playerInventoryItemChange`, `playerHotbarSelectedSlotChange`): what
   does each handler do before its first cheap early return? A mob farm fires hundreds of spawn, hurt and die events a
   second; a handler that reads a dynamic property or runs a query before checking the entity type pays that every
   time.
4. **Memory.** `Map`, `Set`, arrays and object caches at module level that grow with players ever seen, entities ever
   seen, chunks or positions visited, or time, and are never pruned (on leave, on entity removal, by age or size).
   Closures or timers created per event and never cleared. Large constant data built at load that is rarely used.
5. **Saved data.** Dynamic properties: size per key, growth with the number of players ever seen (plan for 1,000+
   one-time visitors on a public server), write frequency, and write amplification (re-serializing a whole large
   JSON blob to change one field, or writing on a timer when nothing changed). Reads of the same property many times
   a tick that a module-level cache would cover. Scoreboard objectives with unbounded participants.
6. **What players' devices pay.** Per-tick or per-second `setActionBar`, `setTitle`, `onScreenDisplay` updates,
   `sendMessage`, `playSound`, `spawnParticle` and `runCommand` particle or title spam, per player: each is a network
   packet and client work on a phone. Text that is re-sent when it did not change. Entities spawned as helpers
   (labels, markers, seats) and how many can exist at once, whether they are removed, whether they tick. Ticking
   areas added and left. For resource packs: particle emitter rates and lifetimes, texture sizes, sound file sizes,
   JSON UI bindings that re-evaluate every frame, fog and render-controller cost.
7. **Scaling shape.** Anything O(players squared) (each player against each other player), O(players x entities),
   O(all zones or claims or waystones) per player per tick without a spatial index, or linear scans of lists that
   grow forever.
8. **Bugs.** Anything wrong you notice on the way, perf-related or not: leaks of locks or flags after leave or death,
   handlers that throw on an invalid entity (an exception in a hot handler is also slow), timers never cleared,
   stale caches that give wrong answers, off-by-one staggering so one player is never serviced, work that is done
   twice because two handlers both do it.
9. **Rework.** Places where a different design would be clearly better: an event instead of a poll, one shared
   per-second pass instead of several intervals in the same pack, a spatial hash, incremental instead of full
   recompute, dirty flags, lazy building of rarely used data, moving cold code or data out of the startup path.

## Evidence rules

- Every finding names `path:line` (relative to the worktree) for the code it is about, and you must have read that
  code yourself, including enough of its callers to know how often it runs. Quote at most a few lines.
- Say how often it runs and for whom (per tick / per second / per event; per player / per entity / per world) and
  put a rough number on it where you can: native calls per tick at 1, 10 and 40 players, bytes per write, entries per
  hour. Use the unit costs above. Say "not measured" plainly; never invent a measurement.
- Rate each finding: **impact** high / medium / low (how much it helps the real Realm or a 40-player server),
  **confidence** confirmed (you traced it end to end) / likely / needs-measurement, **effort** S / M / L, and
  **risk** of the fix (saved-data migration? behavior change players would notice? timing-sensitive?).
- Give the fix as a concrete change (what to cache, which event to use, what cadence, what data structure), and how
  to prove it: which existing scenario in `tools/test-bds/examples/` covers it (grep the file names for the pack) or
  what new scenario or measurement is needed.
- If you checked a suspicious area and it turned out fine, list it in one line under "Checked and fine" so the next
  session does not redo it.
- Prefer 15 solid findings to 60 guesses, but do not drop a real low-impact finding: put it in a compact table at the
  end.

## Output

Write your full findings to the file named in your task (Markdown, American English, plain ASCII punctuation), in
this shape:

```
# <Track name>: performance findings

Scope read: <packs and files, with roughly how much of each you actually read>

## Summary
<5 to 10 lines: the most valuable things, and the overall state of these packs>

## Findings
### <ID>-01 <short title>  [impact / confidence / effort / risk]
- Where: path:line
- What happens and how often:
- Cost estimate:
- Fix:
- Prove it with:
...

## Low-impact table
| ID | Where | What | Fix |

## Checked and fine
- ...

## Not read
- <anything in your scope you did not get to, so it can be picked up>
```

Then reply to the lead with only: the file path, the count of findings by impact, and your top 8 findings in one
line each (ID, pack, what, impact). Keep that reply under 400 words.
