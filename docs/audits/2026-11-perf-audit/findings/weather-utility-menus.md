# Weather, sky, utility and menu packs, and their resource packs: performance findings

Scope read: every `scripts/main.js` in full for `weather_bp`, `storm_bp`, `tornado_bp`, `rain_bp`, `rainbow_bp` (and
`sky.js`), `meteor_bp`, `moon_bp` (and `spawn.js`), `night_bp`, `climate_bp`, `phantom_bp`, `elytra_bp`, `silly_bp` (and
`librarian.js`), `durability_bp`, `refill_bp`, `chairs_bp`, `afk_bp` (and `spread.js`), `death_bp`, `cleanup_bp`,
`farm_bp`, `harvest_bp`, `leaves_bp`, `translucent_bp`, `claims_bp` (and `tamer.js`), `zones_bp`, `settings_bp`,
`help_bp`, `news_bp`, `welcome_bp`, `nick_bp`, plus the `config.js` of each where a rate or size comes from it.
`admin_bp/scripts/main.js`: lines 26-285, 660-1424 (the item, the checks, the events, the commands; the menu pages in
285-660 were not read), `setup.js` 40-190 and 555-589, `diagnostics.js` 1-135. `tools/weather-plan-shared.js` and
`tools/zones-shared.js` in full. `tools/test-bds/examples/perf-soak.js` in full (what the measurement does). Resource
packs: every particle JSON of `rain_rp`, 12 of 16 in `sky_rp`, all 5 of `silly_rp`; `rain_rp` sound definitions,
`sounds.json`, 3 fog files and 1 client biome; `translucent_rp` one attachable, the render controllers and animations
(first 60 lines each); folder sizes of all four. Catalogs were not opened.

Unit costs used below: a real native call (`getTopmostBlock`, `getBlock`, `spawnParticle`, `getDynamicProperty`,
`getComponent`, `getEntities`, `isGliding`) about 10 us; a plain property read (`id`, `typeId`, `location`) about 1 us;
`runCommand` is dearer than a native call and is not measured anywhere. All totals are estimates from counting calls in
the code, not measurements.

## Summary

- The soak never sets the time or the weather, so what these packs cost depends on where the window falls and on
  dice. `moon_bp`'s whole figure is its special-night loop (the old profile shows exactly one `/fog` command per
  player), which is the likely reason for its +86%: one run rolled a Blood or Harvest Moon and the other did not
  (UTL-01). Rain, thunder, sandstorms, tornadoes and gliding are never exercised.
- Three effects are drawn point by point from the server: the rainbow arc (259 `spawnParticle` calls in one tick,
  twice a second), the tornado funnel (about 67 calls a second for each viewer, about 2,500 live particles on that
  viewer's device) and the NOS boost (41 calls a tick for one player). Each could be a handful of client-side emitters.
- `elytra_bp`'s steady cost is one `isGliding` call per player every 5 ticks; a jump-press event can replace the poll.
  A player who is actually gliding costs about as much as the whole pack at 40 idle players.
- `admin_bp`'s steady soak cost is probably an artifact: the soak deletes hotbar slot 0 every 20 s, which is where the
  Realm Configuration item lands, and the pack gives it back with three full inventory scans.
- `cleanup_bp` scans every dropped item synchronously once a minute; `claims_bp` reads event data on every block
  event while claims are disabled; `chairs_bp` queries entities on every broken block.
- The safe zones protocol re-sends every claim to 16 listeners on any claim change, with the same quadratic
  splitting as XC-05.
- Otherwise these packs are in good shape: loops stop when there is nothing to do (rain, climate, tornado, silly's
  jump and flight checks), per-player state is dropped on leave everywhere I looked, and most saved data is small.

## Findings

### UTL-01 The soak's time of day and weather are left to chance: 10 packs are measured by luck or not at all  [high / likely / S / low]
- Where: `tools/test-bds/examples/perf-soak.js` (no `/time`, `/weather` or gamerule anywhere in the file);
  `packs/moon_bp/scripts/main.js:343-399` (the loop and `during`); `packs/night_bp/scripts/main.js:119-139`;
  `packs/rain_bp/scripts/main.js:167-277`; `packs/climate_bp/scripts/main.js:147-225`.
- What happens and how often: a new world starts on a full moon (phase 0), so if the window reaches dusk
  `moon_bp` rolls a Blood Moon (34%) or a Harvest Moon (22% more). Then `during()` runs for every Overworld player
  every second: `getTopmostBlock` at the feet, fog bookkeeping, motes every 3 s, and a monster wave every 20 s per
  player. The historical profile confirms the soak gets there: `docs/audits/2026-10-deep-audit/perf-tables.md:164`
  and `:252` list `moon_bp` with 0.002 and 0.006 `runCommand` a tick, which over 6,094 and 6,713 ticks is 12 and 40
  commands, one `/fog push` per player, and `setFog` (`main.js:464-476`) is the pack's only steady command. An ordinary
  night costs two native calls a second for the whole pack. So `moon_bp` reads 0.01 or 0.05 ms depending on a roll.
  The same applies to `night_bp` (works only on clear nights), `meteor_bp` (33% a night), `phantom_bp`, and never
  applies to `rain_bp`, `climate_bp`, `storm_bp`, `tornado_bp`, `rainbow_bp`: the weather is never changed and the
  default cycle rarely rains inside a 300 s window.
- Cost estimate (not measured), per player per second: `moon_bp` special night about 25 us (40 players: 0.05 ms a
  tick, which is the reported 0.054); `night_bp` clear night about 27 us (40 players: 0.054 ms a tick, half of all game
  time); `rain_bp` thunderstorm outdoors about 180 us (one `getDynamicProperty` through `getFor`, up to 6
  `getTopmostBlock`, 7 `spawnParticle`, `getViewDirection`, about 15 block property reads), plain rain about 100 us;
  `climate_bp` in rain about 40 us, in a sandstorm or blizzard about 150 us. A thunderstorm at 40 players is then about
  0.4 to 0.5 ms a tick on top of the 2.03 measured, in bursts every 5 ticks (`rain_bp` updates a quarter of the
  players each run: about 1.8 ms a run at 40). At the Realm's 1 to 4 players it is under 0.05 ms a tick.
- Fix: make the workload deterministic and then cover the states on purpose. (a) In `perf-soak.js` pin the default
  window: `/time set noon`, `/gamerule dodaylightcycle false`, `/weather clear`. (b) Add `--arg phase=` runs (or one
  scenario with marked phases) for clear night, thunderstorm, and a forced Blood Moon (`/realm:moon_set blood`), and
  report each phase as its own column, so a weather pack has a number that means something. (c) Only then decide on
  the per-pack trims below (UTL-13, UTL-18, UTL-20).
- Prove it with: two soaks at the same commit with the pinned time must give the same `moon_bp` figure; the phase
  runs give first numbers for `rain_bp`, `climate_bp`, `night_bp`, `moon_bp`. `night-soak.js`, `weather-crowd.js` and
  `tornado-sound-perf.js` in `tools/test-bds/examples/` already set up some of these states.

### UTL-02 The rainbow over the pot is 259 server particles, redrawn twice a second  [medium / confirmed / M / low]
- Where: `packs/rainbow_bp/scripts/main.js:376-421` (`drawArc`, `runInterval(..., ARC_TICKS)` with `ARC_TICKS = 10`
  at `:30`); `packs/rainbow_bp/scripts/sky.js:41-56` (`arcDots`: 7 bands, a dot every 0.75 blocks: 43 + 41 + 39 + 37 +
  35 + 33 + 31 = 259 dots).
- What happens and how often: while a pot of gold is up and unfound (up to `potMinutes` = 15 minutes after a
  rainbow, 70% of rains that clear in the morning or evening) and any player is within 96 blocks of it, every 10 ticks
  one callback calls `dim.spawnParticle` 259 times. `Dimension.spawnParticle` goes to every player in range.
- Cost estimate: 259 native calls is about 2.6 ms in one tick, twice a second (0.26 ms a tick averaged), more than
  the whole bundle's average tick at 40 players. Each player near the pot receives about 518 particle packets a
  second and keeps 259 or more flame particles alive. Not measured.
- Fix: draw each band with one client-side emitter. Add a `realm:sky_arc` particle to `tools/gen-sky/gen.mjs`: a
  steady emitter that lives a few seconds, with `minecraft:emitter_shape_custom` whose offset is
  `[cos(a) * r * variable.ux, sin(a) * r, cos(a) * r * variable.uz]` with `a = variable.particle_random_1 * 180`, and
  `variable.color`, `variable.r`, `variable.ux`, `variable.uz` from the `MolangVariableMap`. The server then sends 7
  particles every few seconds instead of 518 a second. The vanilla flame was chosen so the arc shows without the
  resource pack (`main.js:31`); keep the vanilla dots as a fallback at a much lower rate (one band a run, or every
  third dot), or drop them, since the Realm always ships Realm Resources. Cheaper stopgap with no new particle: draw a
  seventh of the dots each run on a 2-tick interval (37 calls a tick instead of 259 in one), if the flame's lifetime
  allows; check the lifetime first.
- Prove it with: `rainbow.js` and `rainbow-race.js` for behavior; a profile of `/realm:rainbow_now` with a player
  standing at the pot, before and after (slowest tick, `spawnParticle` a tick).

### UTL-03 A tornado is about 67 particle packets a second and about 2,500 live particles for each viewer  [medium / confirmed (counts), needs-measurement (device) / M / medium]
- Where: `packs/tornado_bp/scripts/main.js:457-520` (`draw`, `drawSlice`), `:17-21` (`FRAME_TICKS = 2`,
  `REDRAW_FRAMES = 5`), `packs/tornado_bp/scripts/config.js:41-44` (`rings: 22`, `density: 1`);
  `packs/sky_rp/particles/sky_tornado.json` (generated by `tools/gen-sky/gen.mjs:659`).
- What happens and how often: every 2 ticks, for each viewer within 64 blocks, `drawSlice` spawns 5 ring emitters,
  1 skirt or collar emitter, debris every other frame and a spark every fourth: about 6.75 `spawnParticle` calls, each
  after 1 to 3 `setFloat` calls. That is about 67 packets and about 270 native calls a second per near viewer; a
  viewer 64 to 128 blocks away gets 40 packets a second. With 2 or more near viewers one shared copy is drawn, but
  every far viewer still gets a private copy. Each ring emitter spawns `clamp(radius * 5.2 + 14, 18, 44)` particles,
  about 31 on average over the funnel's height, living 1.05 to 1.55 s, and each ring is redrawn every 0.5 s, so two
  to three generations of every ring are alive together.
- Cost estimate: server about 0.14 ms a tick per privately drawn viewer (10 far viewers: about 0.8 ms a tick for
  the 90 to 180 s a tornado lasts). Device: about 1,970 particles spawned a second, about 2,500 alive for a near
  viewer (about 1,700 for a far one). Every particle evaluates 9 Molang expressions a frame (3 parametric position
  terms with `cos` and `sin`, 2 sizes, 4 color terms) and is an alpha-blended billboard 1.5 to 4.5 blocks wide, so
  standing close means heavy overdraw. Not measured on a phone. Also `v.player.isValid` is read twice per viewer per
  frame on handles kept from the once-a-second scan (`:461`, `:471`); `afk_bp/scripts/spread.js:10-12` records that
  `isValid` on a kept handle made the reads after it several times dearer on BDS 1.26.
- Fix, cheapest first: (1) replace the two `isValid` reads by the `try/catch` that is already there and prune
  viewers on `playerLeave`. (2) Make `density` a player preference as well (the copy is already per player for a
  single viewer and for every far viewer), so the Fold can run at 0.5 without changing it for everyone; shared mode
  uses the realm value. (3) Halve the overlap: either `REDRAW_FRAMES` 5 to 8 with the same lifetimes, or keep the
  cadence and lower the clamp to about 12 to 28; both cut packets or particles by about 40%; judge by eye. (4) Larger:
  one steady emitter per ring that follows the funnel for a second (`sky_meteor.json` already moves its emitter with
  `variable.dx * variable.emitter_age`), re-spawned once a second with the current velocity: 22 packets a second
  instead of 67, the same picture.
- Prove it with: `tornado-sound-perf.js` extended to count `spawnParticle` a tick with 1, 2 and 10 viewers at 30
  and 100 blocks; a frame-time check on the Fold standing 20 blocks from `/realm:tornado_spawn` at density 1 and 0.5.

### UTL-04 elytra_bp's steady cost is one `isGliding` call per player every 5 ticks  [medium / confirmed / S / low]
- Where: `packs/elytra_bp/scripts/main.js:742-777` (`runInterval(..., INTERVAL)`, `INTERVAL = 5` from
  `config.js:14`), the read at `:747`.
- What happens and how often: 4 times a second the loop reads `player.isGliding` for every player; for a player on
  the ground nothing else of note runs (three `Set`/`Map` deletes keyed by `player.id`). The old profile timed this
  callback at 693 ms over 1,342 calls at 40 players (`docs/audits/2026-10-deep-audit/perf-tables.md:283`), 13 us per
  player per call, so `isGliding` is a real native call.
- Cost estimate: 8 calls a tick at 40 players is 0.08 ms a tick, the pack's whole reported figure (0.080 at 40,
  0.038 at 10 includes the script event wake-ups of XC-01).
- Fix: only poll players who may be gliding. Subscribe `world.afterEvents.playerButtonInput` with
  `{ buttons: [InputButton.Jump], state: ButtonState.Pressed }` (stable; `night_bp` and `silly_bp` use the same
  event): a glide starts with a jump press in the air. A press puts the player in a `candidates` map for 20 ticks; the
  5-tick loop reads `isGliding` only for candidates and current `gliders`. Keep a slow safety pass over everyone
  (every 40 ticks, or 100) for a glide that starts with no press seen (script reload in flight). Idle cost falls
  from N calls per 5 ticks to N per 40 or more.
- Prove it with: the A/B soak at 40 (`elytra_bp` 0.08 to about 0.01), and `elytra-notes.js` plus a new check that
  the HUD appears within half a second of taking off.

### UTL-05 A gliding player costs as much as the whole pack at 40 idle players  [medium / confirmed / S / low]
- Where: `packs/elytra_bp/scripts/main.js:671-702` (slipstream, every 2 ticks per glider: `hudOff(player)` at
  `:676` is `getFor`, a `getDynamicProperty` plus `JSON.parse`, XC-04), `:38-53` (`rocketCounts`: 36 `getItem` plus two
  `getComponent` and an offhand read), `:56-64` (`elytraLeft`: 3 component reads), `:82-88` (`hud`), called from
  `:762` or `:772` every 5 ticks.
- What happens and how often: per glider, 10 times a second: `isGliding`, `isOnGround`, the preference read,
  `getVelocity`, and above 24 blocks a second also `getViewDirection`, `getHeadLocation` and 3 `spawnParticle`. 4
  times a second: two more preference reads (`:751-752`), a full inventory scan for rockets, the elytra's durability
  and a `setActionBar` or side box write.
- Cost estimate: about 45 to 100 us x 10 plus about 190 us x 4 a second: 1.2 to 1.8 ms a second, 0.06 to 0.09 ms
  a tick per glider. Four friends flying together cost more than `map_bp`'s per-player share. The soak never glides.
- Fix: keep per-glider state in the `gliders` map: `{ player, off, where, rockets, nos, elytra, countsAt }`.
  Refresh `off` and `where` through the settings `onChange` hook (as `rain_bp` and `durability_bp` do) instead of
  reading them 10 and 4 times a second; rescan rockets and durability once a second, or mark them dirty from
  `playerInventoryItemChange` for that player and from the pack's own `itemUse` handlers; keep speed and height live.
- Prove it with: a new scenario that puts simulated players in a glide (or a unit test of the cache with a fake
  player) and the profiler's per-callback totals for `main.js:581` and `:742`; `elytra-notes.js` for behavior.

### UTL-06 A NOS boost is 41 `spawnParticle` calls a tick for one player  [medium / confirmed / M / low]
- Where: `packs/elytra_bp/scripts/main.js:173-239` (`spawnNosParticles`), called every tick from `:611`, `:632`
  and on a third of the taper ticks (`:655-659`).
- What happens and how often: during the 2.5 s of full boost each tick spawns 4 ring points x 4 particle ids, 6
  ribbon points x 4 ids and one lava particle: 41 `dim.spawnParticle` calls, each a packet to every player in range
  and a separate emitter on their device (`realm:sky_spark` alone is 4 particles per emitter, `realm:trail_ember` 2).
  Spool-up is 12 calls a tick for 11 ticks. The loop also reads `player.isValid` first on a kept handle (`:585`).
- Cost estimate: about 0.45 ms a tick on the server per boosting player (820 calls a second), and about 1,600
  particles a second, about 1,000 alive, around them. Not measured.
- Fix: one `realm:nos_plume` emitter in `tools/gen-sky/gen.mjs` that takes `variable.dx/dy/dz` (the flight
  direction and speed) and emits the ring sparks ahead and the ember ribbon behind for 2 or 3 ticks, spawned once per
  tick or every other tick: 1 packet instead of 41. Keep one vanilla flame per tick as the no-resource-pack fallback.
- Prove it with: `spawnParticle` a tick in a profile of a scripted boost; a visual check in first and third person.

### UTL-07 admin_bp's steady soak cost is probably the soak deleting its item; every inventory change reads two lores  [medium / likely, needs-measurement / S / low]
- Where: `tools/test-bds/examples/perf-soak.js:278-284` (every 20 s each land player's hotbar slot 0 is set to
  nothing); `packs/admin_bp/scripts/main.js:1201-1217` (the item is given 40 ticks after spawn, into the first free
  slot of an empty inventory: slot 0; `welcome_bp` gives no kit), `:1174-1199` (the inventory event handler),
  `:1254-1279` (the 30 s round: a player in `missing` is checked every round), `:847-1013` (`reconcileItems`),
  `:771-786` (`isRealItem`, `isConfigItem`), `:1028-1054` (`giveItem`: reconcile, `addItem`, reconcile again).
- What happens and how often: in steady state the pack runs one callback a second that returns at once for 29
  of 30 runs, and its callback count in the old profile equals `moon_bp`'s (37.29 against 37.25 a tick at 40), so its
  time comes from a few dear calls. `reconcileItems` calls `getLore()` on every non-empty stack (`isConfigItem` falls
  through to `isRealItem` whenever the type is not the configured one), about 0.5 ms for a full inventory. If the
  deleted slot-0 stack is the Realm Configuration item, each deletion costs one reconcile (the event) and, within
  30 s, a give with two more, and the new item lands in slot 0 again unless stash's refill put rockets there first.
- Cost estimate: about 1.7 ms per land player per 30 s if it repeats: 36 land players at 40 is about 0.10 ms a
  tick, 6 at 10 players about 0.017; the report shows 0.056 at 40 and nothing at 10, the old one 0.097 and 0.045.
  The shape fits; whether the loop repeats every cycle depends on `stash_bp`'s answer to `realm:refill_need`, which I
  did not read.
- Fix: (measurement) make the soak's refill step use a slot the item cannot be in (give the rockets first and empty
  their slot, or move the item away at the start), and count "You have the Realm Configuration item" messages in an
  old soak log to confirm. (code) In `isRealItem` and `isConfigItem` test cheap fields before `getLore()`:
  `typeId === CONFIG.itemType`, or `lockMode === ItemLockMode.inventory`, or `keepOnDeath` (every real item is locked
  and kept on death, `makeItem` at `:788-799`); leave odd legacy items to the safety round. The same pre-filter makes
  the `playerInventoryItemChange` handler free for ordinary stacks: today each slot change of any player costs
  `isValid` and two `getLore()` calls (about 30 us), and a chest sort fires dozens.
- Prove it with: the 40-player soak with `--arg refill=0`: if `admin_bp` drops to the floor the artifact is
  confirmed; `admin-item-legacy.js` and `admin-stash-singleton.js` for the pre-filter.
- **Answer (W0c, 2026-11-14): confirmed, about half of it.** Run
  [43654869418](https://github.com/nishant/mc-packs/actions/runs/43654869418) (issue #245): perf-soak at 40 players,
  120 s, separate contexts, pinned noon, two same-commit pairs per setting. `admin_bp` steady ms/tick with the refill
  step (`refill=20`): 0.043, 0.035, 0.039, 0.043 (mean 0.040); with `refill=0`: 0.020, 0.018, 0.019, 0.018 (mean
  0.019), on a runner whose whole bundle read slower (2.55 against 2.20), so the drop is not the machine. With the
  refill step its dearest callback is the 30 s round (`runJob @ main.js:1278`, 34 ms over 101 calls: re-giving the item
  the soak deleted from slot 0); without it, the spawn-time give (`runTimeout @ main.js:1216`) is the dearest and the
  round is not on top. So 0.02 ms/tick at 40 is the soak's artifact, and 0.02 is the pack's own steady floor (the
  inventory handler's `getLore()` calls on ordinary stacks, which the pre-filter above still removes). Soaks keep
  `refill=20` (Hotbar Refill and Quick Stack need it); read `admin_bp`'s soak figure with this half in mind.

### UTL-08 cleanup_bp inspects every dropped item synchronously once a minute  [medium / confirmed / S / low]
- Where: `packs/cleanup_bp/scripts/main.js:206-220` (the check), `:64-79` (`itemsByDimension`), `:89-102`
  (`clearable`), `:125-145` (`keeps`).
- What happens and how often: every `checkSeconds` (60) the pack lists every item entity in three dimensions and
  calls `keeps()` on each, in one tick. `keeps` reads the item component, the stack, `nameTag`, `getLore()`, the type,
  the enchantable component and its enchantments, and only then the location and the near-player test. The count is
  compared with `threshold` (500) after all that.
- Cost estimate: 6 to 8 native calls an item, 60 to 80 us: 300 items lying at a farm (below the threshold, or all
  within 4 blocks of an AFK player, so never cleared) cost about 20 ms in one tick every minute, forever. 1,000 items
  about 70 ms. Not measured; the soak has no dropped items.
- Fix: (1) return before `clearable()` when `total(dims) <= threshold`: `clearable` can never exceed the total.
  (2) In `keeps`, do the position tests first (one `location` read, pure math): items near players or recent deaths,
  the usual farm case, then cost one read. (3) When the total is over the threshold, count in a `runJob` with a
  yield every 50 items, as `clearJob` already does (`:152-182`).
- Prove it with: a scenario that drops 600 item stacks next to a standing player and records the slowest tick
  over two checks, before and after; `cleanup-keep.js` and `cleanup-bundle.js` for behavior.

### UTL-09 claims_bp reads event data on every block event while claims are disabled, and scans all claims linearly when enabled  [medium / confirmed / S (guard), M (index) / low]
- Where: `packs/claims_bp/scripts/main.js:202-207` (before break), `:212-223` (before interact), `:261-273`
  (before interact with entity), `:277-302` (after place), `:146-152` (`claimAt`), `:165-169` (`closedTo`, where the
  `enabled()` test lives), `:392-402` (explosion), `:408-435` (the 1 s loop); `config.js:6` (`enabled: false`).
- What happens and how often: the arguments of `closedTo(...)` are evaluated before it tests `enabled()`. With
  claims disabled (the default, and the Realm's state unless an operator enabled them) every broken block reads
  `event.player`, `event.dimension.id` and `event.block.location`; every block interaction, including the repeats
  while the use button is held (`isFirstEvent` is only used for the message), destructures five event fields (the
  item stack among them), reads `block.dimension.id`, `block.location`, and with an item in hand `block.x/y/z` for
  `across()`; every placed block reads dimension, location and `typeId`; every entity interaction reads `typeId`, up
  to two tags and the `is_tamed` component and starts the tamer watch. With claims enabled, `claimAt` walks every
  claim (up to 500): per player per second, per block event, and per impacted block of every explosion (one
  `b.location` read and a full walk each).
- Cost estimate: disabled: 5 to 12 property reads per block event, a few us each, for nothing; it adds up for
  builders but stays small. Enabled with 500 claims: the 1 s loop is 40 x 500 comparisons (about 2 ms a second at 40
  players); one TNT blast of 300 blocks is 150,000 comparisons plus 300 native reads, 15 to 30 ms in the tick of the
  explosion. Not measured.
- Fix: (1) first statement of the four handlers: `if (!enabled() || !claims().size) return;` (the entity handler
  keeps `watchTaming` only if tamers must be recorded while disabled; decide and say so in a comment). In the
  interact handler also return early for `!isFirstEvent` when the cached decision for this player and block from the
  first event can be reused. (2) A grid index: `Map<dim|floor(x/64)|floor(z/64), Claim[]>` rebuilt in `saveClaim` and
  `removeClaim`; `claimAt` looks at one cell. (3) Explosions: test the blast's bounding box against the index once
  and skip the per-block filter when no claim is near.
- Prove it with: `claims-bundle-taps.js`, `claims-animals.js`, `claims-own-pet.js`, `claims-party.js`,
  `claims-remove.js`; a churn scenario (XC-06's) with a block break loop, claims disabled, shows the handler leaving
  the profile.

### UTL-10 The safe zones protocol re-sends every zone to 16 listeners on any change, with quadratic splitting  [medium at scale, low on the Realm / confirmed / S / low]
- Where: `tools/zones-shared.js:237-249` (`zoneMessages`), `:257-276` (`provideZones`), `:85-109`
  (`receiveZones`), `:287-293` (the world-load pings); `packs/claims_bp/scripts/main.js:116-120` (`saveClaim` always
  calls `publishZones()`), `:408-416`, `:466-479`, `:680-685` (callers that change no shape);
  `packs/rainbow_bp/scripts/main.js:189-231` (a second, hand-written receiver and the 16th ping).
- What happens and how often: 15 packs carry the copy (admin, atlas, build, calendar, claims, domt, elite, guard,
  maps, meteor, moon, storm, tornado, wander, zones) and each sends `realm:zones_ping` in the world-load tick (15
  events x 67 wake-ups, XC-01), plus rainbow 40 ticks later, plus `admin_bp/scripts/setup.js:164` and
  `wander_bp/scripts/main.js:1680` on demand. Each provider answers once a tick (the `queued` flag) and again 100
  ticks after load, so every consumer parses every list twice at start. Each answer is the provider's whole list in
  2,000-byte parts; all 16 receivers `JSON.parse` every part and rebuild every zone object. `zoneMessages` has the
  XC-05 shape: for each zone it stringifies the whole part so far and walks its characters (`utf8Length`). And
  `saveClaim` publishes on every save: a share added, the door switch, the owner's party code changing (checked
  every second), a gamertag change at join, none of which change what is sent (`id`, name, dim, x, z, r).
- Cost estimate: at the Realm's size (a few zones, towns and claims) all of this is noise. At 500 claims one
  publish is about 18 parts: about 0.5 MB of stringify and character walking in the provider, 18 events x 67 wake-ups,
  and 16 x 36 KB of `JSON.parse` plus 8,000 zone objects, all in two ticks, every time anybody edits a claim. Not
  measured.
- Fix (in the shared source, then `node tools/sync-zones.mjs`): (1) stringify each zone once, add byte lengths to
  decide where a part ends, join the strings (as proposed for XC-05). (2) `provideZones` remembers the last messages
  it sent and skips a publish whose messages are identical, unless it answers a ping; that makes the shape-neutral
  `saveClaim` calls free without touching claims. (3) Drop the provider's own 100-tick publish, or the consumers'
  world-load ping; one of them is enough. (4) `isProtected` and `protectedBox` are linear in all zones and
  `allZones()` allocates a flattened copy on every call (`:118-120`, used by `zonesAt`, `escapeZones`,
  `tornado_bp/scripts/main.js:312-320`): keep a flat array rebuilt in `zonesChanged()`; add a grid only if a consumer
  ever calls it per tick (none of mine do: tornado once per 2 ticks only in `avoid` mode, storm once per strike,
  moon once per spawned monster, meteor per crater). (5) `rainbow_bp` could take the shared copy.
- Prove it with: `tools/zones-*.test.mjs` (a golden test that the parts are byte-identical to today's for a 500
  zone list), `claims-zones.js`, `zones-flow.js`, `storm-rod-claims.js`, `meteor-edge.js`.

### UTL-11 Four packs each run their own help census, three of them again and again  [medium / confirmed / S / low]
- Where: `packs/help_bp/scripts/main.js:31-41` (every `/realm:help`, no cache); `packs/news_bp/scripts/main.js:52-63`
  and `:253-259` (before every chat tip: the comment says packs can be added while the world runs);
  `packs/welcome_bp/scripts/main.js:110-129` (once a minute, on a join; also pings `realm:npc_places_ping`);
  `packs/admin_bp/scripts/main.js:93-106` (cached 60 s).
- What happens and how often: each census is XC-02's 68 events and 4,556 callbacks, and each caller then waits
  10 ticks before it shows anything. The set of installed packs cannot change while the script context lives: adding
  or removing a pack needs a restart or `/reload`, and both reset every module's state.
- Cost estimate: XC-02's 20 to 45 ms per census; with tips every few minutes and a join a minute that is the
  realm's most frequent census after `/realm:help` itself. The 10-tick wait is half a second of menu latency on
  every `/realm:help`.
- Fix: cache the answer for the life of the context in all four (ask once, 5 s after world load, and again only if
  the first census came back empty). `/realm:help` then opens in the tick of the command. With XC-02 (b) the census
  disappears in a bundle. A complete census can be recognized without waiting: `PACKS` in the catalog is the full
  list, so stop waiting when every catalog folder has answered.
- Prove it with: `bundle-smoke.js`, `welcome-generic-bundle.js`, `news-new-world.js`; the callback count of a soak
  (`realm:help_pong` is 50.6 of 109 callbacks a tick in the validation run).

### UTL-12 moon_bp reads a tag on every entity that loads and every mob that dies, all year  [low-medium / confirmed / S / low]
- Where: `packs/moon_bp/scripts/main.js:724-730` (`entityLoad`: `entity.hasTag(MOB_TAG)` whenever it is not a
  Blood Moon), `:732-751` (`entityDie`: `isValid` and `hasTag` for every non-player death).
- What happens and how often: a player flying into new chunks fires `entityLoad` for every entity in them; each
  costs a `hasTag` call here to find leftover Blood Moon monsters, which exist only for a while after a Blood Moon.
  Every mob death anywhere costs two calls, though the bonus only applies during a Blood Moon.
- Cost estimate: about 10 us per loaded entity and 20 us per death; a mob farm at 20 kills a second is 0.4 ms a
  second from this handler alone. Not in the soak.
- Fix: `entityDie`: return first unless `night?.a && night.s === "blood"`; the player branch needs the same state.
  `entityLoad`: subscribe only while leftovers can exist: keep a saved counter of tagged monsters spawned minus
  removed or died (or simply "a Blood Moon ended within the last N in-game days"), unsubscribe at zero. Or test
  `entity.typeId` against the 4 configured monster ids before `hasTag`.
- Prove it with: `moon-join.js`, `moon-shelter.js`; the churn scenario's kill loop.

### UTL-13 night_bp probes every Overworld player every second all night; it needs to only when a star is due  [low-medium / confirmed / S / low]
- Where: `packs/night_bp/scripts/main.js:119-139` (loop), `:102-113` (`auroraNight`: a world `getDynamicProperty`
  and `JSON.parse` every second), `:130` (`getFor`: XC-04), `:142-152` (`show`: `getTopmostBlock` before anything else).
- What happens and how often: on every clear night, once a second per Overworld player: a preference read, the
  location, `getTopmostBlock`. A shooting star comes every 15 to 30 s per player and the aurora redraws every 4 s on
  aurora nights over snow.
- Cost estimate: about 27 us per player per second: 0.054 ms a tick at 40 players for half of all game time.
- Fix: in `show`, return before the reads unless `now >= st.nextStar` or (aurora night and `--st.auroraIn <= 0`):
  the loop then costs one `Map` lookup per player. Cache tonight's aurora roll in a module variable keyed by the day.
  Move the `getFor` after that test (or XC-04).
- Prove it with: `night-soak.js` (it exists for this pack), before and after.

### UTL-14 Charged lightning rods: every rod against every player, three location reads a pair, every 2 s  [low-medium / confirmed / S / low]
- Where: `packs/storm_bp/scripts/main.js:557-584` (the test at `:566` reads `p.dimension.id` and `p.location` three
  times for each player for each charged rod).
- What happens and how often: every 40 ticks while any remembered rod is charged. A charged rod stays charged
  until a player collects it, so a rod field charged by one storm keeps this running for days. A rod near a player
  then costs `getDimension`, `getBlock`, `typeId` and a `spawnParticle`.
- Cost estimate: 50 charged rods and 10 players, nobody near: 500 pairs x 4 reads; with a player near each rod add
  50 x 4 native calls, about 2 ms in one tick every 2 s. Up to `maxRods` = 200.
- Fix: read each player's dimension id and location once per run into plain objects; skip rods in dimensions with
  no player; `getDimension` once per dimension. A charged-rod count kept beside `rods` replaces `rods.some(...)`.
- Prove it with: `storm-cell.js`, `storm-rod-claims.js`; a profile with 100 charged rods placed by a scenario.

### UTL-15 Claim borders and zone outlines are hundreds of per-player particles every 10 ticks  [low-medium / confirmed / M / low]
- Where: `packs/claims_bp/scripts/main.js:493-529` (`showBorders`: a 33 x 33 claim is 68 points x 2 heights = 136
  `player.spawnParticle` a run, per claim shown, for `borderSeconds` = 10); `packs/zones_bp/scripts/main.js:153-226`
  (`drawOutlines`: up to about 75 edge points x 2 plus 5 center points per shape a run, for `previewSeconds`).
- What happens and how often: on demand (a menu button, a new claim, a zone preview). "Show claim borders" and
  "Show nearby outlines" draw every claim or zone within 64 blocks.
- Cost estimate: one claim 272 packets a second; 4 claims plus 2 zones about 850 native calls a run, about 8 ms
  in one tick twice a second for 10 to 20 s, and about 1,700 packets a second to that player. Both loops also read
  `player.isValid` on a kept handle and `player.dimension.id` per shape per run.
- Fix: one line emitter in a resource pack (`emitter_shape_box` with a half-length from `variable.len` along x or
  z, steady rate, a lifetime of the whole preview): 4 packets per claim, once. A circle is one emitter with a
  `emitter_shape_custom` ring. Until then: draw at one height, every second point, and cap the shapes drawn at once.
- Prove it with: `zones-flow.js`, `claims-remove.js`; `spawnParticle` a tick while the outline shows.

### UTL-16 rain_rp: ten 20-second ambience clips are loaded as samples, all marked load-on-low-memory  [medium (device memory) / needs-measurement / S / medium]
- Where: `packs/rain_rp/sounds/sound_definitions.json` (no `"stream": true` anywhere; every entry has
  `"load_on_low_memory": true`), written by `tools/gen-rain/sounds.mjs:571`; encoding at `:495` (mono, 44.1 kHz,
  Vorbis q3). Files: `bed1-4.ogg` 172 KB each, `rain_enter1-2` and `rain_inside1-2` about 130 KB, `bed_inside1-2`
  about 76 KB, `wind1-3` 86 KB, `wind_inside1-2` 37 to 45 KB, of 2.5 MB in `sounds/` (the pack is 2.6 MB).
- What happens: a sound that is not streamed is decoded to PCM when it is loaded. 20 s of mono 44.1 kHz 16-bit
  audio is 1.76 MB; the ten 20 s clips are about 17.6 MB decoded, the five wind clips about 4.4 MB more, on a phone,
  for sounds of which one or two play at a time. Whether Bedrock loads them all at pack load or on first play, and
  what the flag does on the Fold, is not known to me: measure before changing.
- Fix: `stream: true` for the long beds (`realm.storm.bed`, `bed_inside`, `realm.rain.inside`, `realm.rain.enter`,
  `realm.storm.wind`, `wind_inside`); keep the short one-shots (`rain1-8`, `roof`, `thunder`, `crack`) as samples,
  because the game starts a rain clip every 2 to 4 ticks. Risk: a streamed sound starts a little late, which matters
  for `rain_enter` (it must meet the rain it replaces): test that one by ear, or leave it a sample. Smaller: the
  muffled "inside" clips are low-passed and would be half the size at 22.05 kHz.
- Prove it with: client memory with and without the pack on the phone (no harness measures this), and the
  listening clips (`node tools/gen-rain/sounds.mjs --audition docs/media/rain`).

### UTL-17 chairs_bp runs an entity query for every block any player breaks  [low-medium / confirmed / S / low]
- Where: `packs/chairs_bp/scripts/main.js:178-181` (`seatsNear` is `dim.getEntities({ type, location, maxDistance })`).
- What happens and how often: every `playerBreakBlock`, anywhere, whether or not a seat exists in the world.
- Cost estimate: one location read and one entity query (10 us or more) per broken block per player; a player
  clearing land breaks several blocks a second. One of the 22 handlers of XC-06, and one of the dearer ones.
- Fix: keep a live seat count (incremented in `sit`, set by the once-a-second sweep at `:192-214`, which already
  lists every seat) and return when it is 0.
- Prove it with: the churn scenario's block break loop; a chair test that breaks the stair under a sitter.

### UTL-18 rain_bp: commands where state would do  [low / confirmed / S / low]
- Where: `packs/rain_bp/scripts/main.js:406-418` (`stopSounds` runs 7 `stopsound @s` commands whenever a player's
  place changes: walking through a door, entering a desert, the rain ending); `:199-205` (one `stopsound @a[tag=...]`
  4 times a second while anyone is indoors in the rain); `:141-149` (2 `/fog @s remove` in the join tick; `moon_bp:480`
  and `climate_bp:121` add one each: 4 commands from 3 packs in the tick of every join, see XC-07).
- Fix: remember which of the 7 sounds were started for the player and when (the clip lengths are known) and stop
  only those still playing: usually 2 or 3. Remove a fog on join only when the pack's own saved flag says one may be
  left (or defer the three packs' removals by a few ticks, they are not urgent).
- Prove it with: `rain-roof.js`, `rain-seabed.js`; `runCommand` a tick in a rain phase of UTL-01.

### UTL-19 Two per-tick callbacks that do nothing most of the time  [low / confirmed / S / low]
- Where: `packs/elytra_bp/scripts/main.js:581-703` (`runInterval(..., 1)`: NOS bursts and the slipstream; returns at
  `:671` when nobody glides); `packs/leaves_bp/scripts/main.js:233-269` (`runInterval(..., 1)`: returns at `:234` when
  nothing is pending).
- What happens: two of the 32 every-tick intervals of XC-03. `silly_bp/scripts/main.js:339-340` records that an
  every-tick callback that did nothing cost about 0.04 ms a tick with 40 players on, and that pack now starts its
  jump and flight checks only while they are needed.
- Fix: the same pattern: start the interval when `gliders` or `activeNosBursts` gets its first entry (from the HUD
  round or `triggerNosRocket`), or when a log break queues a check; `clearRun` when the maps and queues are empty.
- Prove it with: the bundle soak's callbacks a tick; `elytra-notes.js`; a leaves scenario (none exists: fell a tree
  and count the leaves gone).

### UTL-20 Four packs ask "is this player outdoors" with their own `getTopmostBlock` every second  [low-medium / confirmed / M / low]
- Where: `packs/rain_bp/scripts/main.js:235`, `packs/climate_bp/scripts/main.js:210`,
  `packs/moon_bp/scripts/main.js:412-421`, `packs/night_bp/scripts/main.js:145-152`.
- What happens and how often: each active pack reads the topmost block at each player's feet once a second, and
  then its height and type. In a thunderstorm on a Blood Moon night three of them do so for the same column.
- Fix: a shared `sky-probe` module (a `tools/*-shared.js` on the bundle's shared list) that caches
  `{ topY, typeId, tick }` per player and answers from the cache while the player is in the same column and the
  entry is under 20 ticks old. In the bundle the cache is shared by the four packs; alone each pack has its own.
- Prove it with: the UTL-01 phase runs (native calls a tick in the thunderstorm phase), and each pack's scenarios.

## Low-impact table

| ID | Where | What | Fix |
|---|---|---|---|
| UTL-21 | `meteor_bp/scripts/main.js:450-469` | once any crater is "made", every 2 s forever: for each player a string key with `player.id` per impact before the distance test; `reached` is never pruned | distance test first, `player.id` once; clear `reached` keys of impacts that left the list |
| UTL-22 | `meteor_bp/scripts/main.js:170-179`, `:192` | the night plan is read and parsed from the world every 5 s all night | keep it in a module variable; the pack is its only writer |
| UTL-23 | `meteor_bp/scripts/main.js:515`, `:610-620` | `dim.heightRange` read 11 times a column in the build scan; `carve` calls `protectedBox` (all zones) for each of about 500 blocks | hoist `heightRange`; test the zone once per column |
| UTL-24 | `storm_bp/scripts/main.js:249-268`, `rainbow_bp:428-460` | the build scans run a 90-alternative regex on up to 405 and 810 type ids a scan | a `Map<typeId, boolean>` memo beside each regex |
| UTL-25 | `storm_bp:523-553`, `chairs_bp:152-159`, `harvest_bp:37-44`, `elytra_bp:350-359` and `:497-517` | before-interact handlers destructure `itemStack` and `block` before the cheap `isFirstEvent` or `cancel` test; elytra has two subscriptions | read `isFirstEvent` first; merge elytra's two handlers and its five `itemUse` / `itemStartUse` subscriptions into one each |
| UTL-26 | `refill_bp:39`, `afk_bp:85-86`, `silly_bp:761`, `admin_bp/scripts/main.js:695` | `entityHitEntity`, `entityHitBlock` and `entityDie` handlers that only want players are unfiltered (XC-06) | `{ entityTypes: ["minecraft:player"] }`, as `durability_bp:72-73` does |
| UTL-27 | `elytra_bp/scripts/main.js:519-523` | every broken block: location, dimension id, a string key and the broken type, to find a jukebox | `blockTypes: ["minecraft:jukebox"]`, or return when `activeJukeboxes.size === 0` and the type is not a jukebox |
| UTL-28 | `elytra_bp/scripts/main.js:561-575` | every jukebox that ever held the disc is polled every 15 ticks forever (`getDimension`, `getBlock`), up to 200 | poll only while its song plays; afterwards check on interaction and on the break event |
| UTL-29 | `durability_bp/scripts/main.js:96-116`, `:77-80` | every player's 6 slots are swept every 5 s (about 150 us each): at 40 players that is the pack's 0.04 ms; the inventory handler builds two item stacks per change | sweep armor only (held items have events) or every 30 s; return from the handler when the player is already in `armorDirty` |
| UTL-30 | `silly_bp/scripts/main.js:348-359`, `:430-448` | one full gear read every 4 ticks whether or not any silly gear exists; a new `MolangVariableMap` per colored particle | sweep every 20 ticks while `wearers` is empty; six prebuilt color maps (as `rainbow_bp:399-403`) |
| UTL-31 | `news_bp/scripts/main.js:227-230` | a player property write for every online player every minute, for an "away" notice measured in hours | every 5 or 10 minutes |
| UTL-32 | `nick_bp/scripts/main.js:262-294`, `:173-184` | validating a new nickname walks `world.getDynamicPropertyIds()` (every key of every pack in a bundle); two world keys per player ever seen, pruned after 365 days | keep the legacy-key migration behind a one-time flag; nothing else |
| UTL-33 | `weather_bp/scripts/main.js:318-333`, `afk_bp/scripts/main.js:206-209` | both read `isSleeping` for every player every second | fine at this size; note for a shared sleep signal if one is ever added |
| UTL-34 | `afk_bp/scripts/main.js:226-235` | while anyone is in bed: one `realm:actionbar` event (67 wake-ups, XC-01) and one `setActionBar` per Overworld player per second, same text | resend every 2 s (the hold is already 40 ticks) and only when the text changed or the hold is about to end |
| UTL-35 | `climate_bp/scripts/main.js:369`, `tornado_bp:288-298` | a new `MolangVariableMap` per player per second in a storm; `getDefaultSpawnLocation` twice a frame | one reused map (as tornado's `molang()`); read the spawn once per tornado |
| UTL-36 | `leaves_bp/scripts/main.js:256-268` | up to 6 `setblock ... destroy` commands a tick while a canopy decays, each with break particles, a sound and drops on nearby devices | by design; lower `leavesPerTick` on phones if it stutters |
| UTL-37 | `rain_rp/particles/rain_splash.json:14` | the vanilla rain splash is redefined with `max_particles` 300, collision and per-frame Molang | compare with the vanilla value and measure on the phone |
| UTL-38 | `help_bp/scripts/main.js:86-97` | "All commands" builds one form with every installed pack's command text (most of the catalog) | page it by pack group if it is slow to open on a phone; not measured |

## What a phone renders (counts from the particle files)

- Rain or thunder, outdoors: the game's rain with the redefined splash (up to 300 particles); `realm:rain_mist` 2
  emitters a second x 2 sheets x 5 to 7 s, about 24 blended sheets 2 to 2.8 blocks wide (thunder only);
  `realm:rain_drip` 5 a second, each up to 3 s with collision, about 15; a storm fog and, on Vibrant Visuals, a
  volumetric haze. Server packets: 7 particles a second, a wind clip every 8 s, a storm bed every 18 s. Light.
- Sandstorm or blizzard: 2 bursts a second x 20 grains or streaks, 1.2 to 2.2 s (sand) and 0.9 to 1.6 s (snow),
  about 68 and 50 alive, each with collision and three `sin`/`cos` acceleration terms a frame. Fog bank: about 28
  sheets 5 to 7.5 blocks wide. Light.
- Tornado: about 2,500 alive within 64 blocks, about 1,700 beyond (UTL-03). The heaviest thing in these packs.
- Meteor: one emitter per player, 70 particles a second, at most 160, for up to 3 s; a camera shake and two sounds;
  the crater smokes with about 72 particles for 2 minutes. A burst over a safe zone adds 48 smoke particles. Light.
- Aurora: 9 additive quads about 15 x 19 blocks, redrawn every 4 s with a 6 s life (about 14 alive), from a 256 x 128
  flipbook. Shooting star: one emitter, at most 80 particles for about a second.
- Blood or Harvest Moon: 2 emitters x 6 motes every 3 s, about 21 alive, and one fog.
- Textures are all small (the largest is the aurora sheet, 37 KB); `sky_rp` is 194 KB, `silly_rp` 55 KB,
  `translucent_rp` 327 KB, `rain_rp` 2.6 MB of which 2.5 MB is sound.

## Checked and fine

- `weather_bp`: one loop a second (N `isSleeping`, one `getAbsoluteTime`); the plan is saved only when a spell
  changes; `realm:weather_ask` from six packs is answered once (`:509-523`).
- `rain_bp`, `climate_bp`: loops exist only while it rains, drips or a fog is up, and stop themselves; players are
  spread over 4 and 2 runs; state dropped on leave; fog commands only on change.
- `tornado_bp`: no timer except a 100-tick check while no tornado exists; the wind's `stopsound` is one command per
  5 s; sound volumes are worked out per distance band.
- `storm_bp`: idle when it is not thundering (one comparison a second); the strike's build scan is a job;
  `entitySpawn` tests the type first; rods are capped at 200 and saved only on change.
- `meteor_bp`: the 10-tick loop does nothing unless a meteor is falling; craters are made in jobs; 5 impacts kept.
- `phantom_bp`: `entitySpawn` returns on the type id before anything else.
- `silly_bp`: the per-tick jump and flight checks exist only while needed; ambient effects only for wearers; gear is
  cached and follows events; the rabbit sweep stops at zero.
- `refill_bp`: it only sends `realm:refill_need` (one event when a stack runs out with no spare in the inventory);
  it does not handle it. Its `playerInventoryItemChange` handler returns after field comparisons.
- `durability_bp`: handlers only add an id to a `Set`; max durability is cached per item type; maps dropped on leave.
- `afk_bp`: one pass a second (rotation, movement vector); handlers only stamp a tick.
- `death_bp`: `entityDie` is filtered to players; the back search is at most 425 spots and reads each block once.
- `farm_bp`, `harvest_bp`, `translucent_bp`, `settings_bp`: no timers; work only on commands, taps and spawns.
- `leaves_bp`: checks are jobs with a 3,000-block limit, merged per tree; queues are capped.
- `zones_bp`: no timers; the zone list is cached and saved as one small property (at most 100 zones).
- `welcome_bp`, `news_bp`: join work is deferred 40 and 100 ticks; saved data is a few small properties.
- `nick_bp`: one name tag check per player per 5 s; nicknames cached.
- `help_bp`: the 268 KB catalog is a static import used only to filter and render pages (startup cost: XC-08).
- `translucent_rp`: 40 attachables with a two-line `pre_animation` script, tiny textures; `silly_rp` particles are
  short bursts of 1 to 9 (confetti 14 to 40 on a hit or a kill).

## Not read

- `packs/admin_bp/scripts/main.js:285-660` (the menu pages), `actions.js`, `presets.js`, `lifecycle.js`, and the
  rest of `setup.js` and `diagnostics.js`: on-demand menu code; the form sizes built there were not checked.
- `packs/stash_bp`'s handling of `realm:refill_need`, which decides whether UTL-07's loop repeats (another track).
- `sky_rp` particles `sky_harvest`, `trail_cloud`, `trail_leaves`, `trail_sparkle`; `rain_rp`'s 20 other fog files
  and `snowy_slopes.client_biome.json`; `translucent_rp`'s geometry and the other 39 attachables.
- `tools/gen-rain`, `gen-sky`, `gen-translucent`, `gen-silly` beyond the lines cited.
- The synced copies (`side.js`, `gossip.js`, `prune.js`, `spawn.js` beyond a first read, `zones.js` copies).
- How the other 10 zone consumers (atlas, build, calendar, domt, elite, guard, maps, wander and admin's wizard) call
  `isProtected` and how often: only the import lines were seen; their readers should say.
