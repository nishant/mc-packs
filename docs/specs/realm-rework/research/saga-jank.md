# Story Questlines (saga_bp 1.16.25): world-side jank hunt

Read-only review of `packs/saga_bp/scripts/` at master `6eaac41`. Nothing was run on BDS: every finding says
whether it is **verified by reading** (the code path is unambiguous) or **suspected** (depends on engine behavior
or terrain, with the BDS scenario that would confirm it).

Files read in full: `actors.js`, `spawn.js`, `places.js`, `tether.js` (API and helpers), `name-labels.js` (API),
`stash-bridge.js`, `scale.js`, `champions-session.js`, `util.js`, `types.js`, and in `objectives.js` the inventory,
champion, spawnGroup, kill, place, interact, tame/tend, talk/deliver, scenes, meet, inspect, stealth, defeat-spawn,
escort, lead, defend, follow, vision, answer, per-second loop and cleanup sections. `prefabs.js`: placement,
site checks, features, camps. Also `wander.js` (camps, hostile), `main.js` (loop, lifecycle), and the handlers of
`elite_bp`, `claims_bp`, `mobhp_bp`, `cleanup_bp`, `phantom_bp`, `moon_bp`, `stash_bp` that touch story mobs or items.

Content counts used below come from loading `stories.js` in node (objective type / location kind):
meet 16 at places + 4 at offsets, defend 15 + 2, stealth 6 + 3, escort 3, follow 5, lead 7, inspect 13 + 7,
champions 20 (9 own fallback only, 11 through Champions; 2 at offsets, 2 near the player).

## What is already solid (do not redo)

- Form and busy-flag lifecycle (`util.js` `lifecycle` / `claim` / `show`): 32 unit tests, `saga-graveyard-softlock.js`.
- Anchored actor falling loop (`tendActors` + tether helpers): `saga-anchor-tether.test.mjs`.
- Spawning on water vs. the bed: `saga-ground-water.js`, `saga-ground-swimmers.js`.
- Spawned-fight stragglers, party-shared fights and credit scope: `saga-fight-straggler.js`, `saga-party-fight*.js`,
  `saga-defeat-credit.test.mjs`.
- Defend: walking away (far) and waiting out (`saga-defend-away.js`, `saga-defend-expire.js`).
- Villager -> witch / zombie villager transformation, restart sweep of tagged actors: `saga-escort.js`.
- Place snapshots and restore on operator Remove / move: `saga-place-move.js`, `saga-lighthouse.js`.
- Collect + Expansive Inventory pages: `saga-collect-stash.test.mjs`. Quick Stack skips named items; Lag Cleanup keeps
  named, lore and near-player items; Mob Health never renames a named mob. No finding there.

None of the existing tests covers: an actor whose chunk unloads mid-scene, where a character stands at a built
prefab, a spot with no saved height, the edge teleport, camp teardown with a player inside, other packs converting
or deleting story entities, deliveries of gear, or auto-picked places near claims and zones.

---

## Findings

### HIGH

#### JNK-01 An escorted character silently vanishes when its chunk unloads (ran ahead, died, respawned)
- **Where:** `actors.js:221-228` (`tendActors` deletes the record when `!a.ent.isValid`), `actors.js:328-337`
  (`entityLoad` removes any `saga:actor` it does not know), `objectives.js:2443-2444` (escort branch needs a valid
  entity), `objectives.js:2520-2526` (respawn only within 32 blocks of `from`), `objectives.js:3807-3809` (tracker).
- **Player sees:** They lead Pip / Barnaby / Pell, get more than about 64-80 blocks away (an ambush kills them and they
  respawn at their bed, they chase a mob, they fetch something), come back to where the character was waiting: nobody
  is there and nothing was said. "X got tired of waiting and went back" never shows. The only way on is to walk back
  to the start (330 blocks for `act2_choir/pip#2`).
- **Cause:** "unloaded" and "dead" are the same thing to the registry. Once the entity unloads the record is deleted
  after at most 1 s; when the chunk loads again the entity is removed as an unknown leftover. The `tooFar` timer and
  its message live inside the `a?.ent.isValid` branch, so they never run for an unloaded escort. `s.state` stays `"go"`.
  Since escorts have ambushes, dying mid-escort is the normal failure path and always ends here.
- **Sure?** Verified by reading. Confirm: `saga-escort-unload.js`: start `graveyard_shift/dead_drunk`, lead Barnaby 40
  blocks, teleport the player 200 blocks away for 5 s and back. Expect today: no escort, no message.
- **Fix:** Keep the record across an unload (state `unloaded`, last position, `unloadedAt`); in `entityLoad`, if
  `actors.has(entity.id)` set `a.ent = entity` and `state = "live"` instead of ignoring it. Mark dead only from
  `entityDie`, our own `removeActor`, or a transformation. Run `tooFar` on the record, not the entity, and always send
  the "went back" line when it expires. Better: when the leader returns within 48 blocks of the last position and the
  entity is missing, respawn it there in state `wait` ("X waited for you here"). See structural S2.

#### JNK-02 "Slip back to the edge" teleports the player into solid rock or into the air
- **Where:** `objectives.js:2333` (ambush branch only when its 30 s cooldown is over, otherwise it falls through to the
  teleport), `objectives.js:2341-2353`, `util.js:282-287` (`groundAt` without `strict` returns the hint height when no
  open spot is within 6 blocks of it), `objectives.js:2348` (`?? p.y` when the column is not loaded).
- **Player sees:** A guard spots them and they are moved `radius + 4` blocks from the center (28 to 52 blocks) at the
  **center's** height. On a slope they arrive inside the hillside (suffocating) or several blocks up in the air. At the
  Stone Seal (`act4_seals/stone_door#1`, underground at y -45, radius 32) the second sighting within 30 s puts them 36
  blocks out in solid deepslate. `onSpotted: "ambush"` steps are affected too because of the cooldown fall-through
  (6 of the 9 stealth steps are ambush steps).
- **Sure?** Verified by reading (the fallback `return y0` and the fall-through). Confirm: `saga-stealth-edge.js`: Gray
  Ring on flat ground with a 12-high wall of stone 50 blocks east; get spotted on the east side; assert feet and head
  blocks are air and the block below is solid. Second case: seal_stone in solid stone, two sightings 5 s apart.
- **Fix:** Use a strict finder; walk the line from the player outward to the edge and take the **farthest standable
  spot reachable** (never past the first unloaded or non-standable column); if none, do not teleport: apply a short
  slowness/blindness and reset `graceOf`. Underground places (`site: "underground"`, `"deep"`) send the player to a
  prefab feature (`corridor`, `door`) instead of a ring point. Make the cooldown fall-through explicit: during the
  ambush cooldown do nothing.

#### JNK-03 A wanderer's camp is taken down on top of the player (deep camp: buried in stone)
- **Where:** `ui.js:935` (`leaveCamp` when the chain's last chapter is reported, at the camp), `places.js:871-879`,
  `places.js:656-663` (`removePlace` -> `restore` at once), `places.js:392-423`, `places.js:851` (`makeCamp` restores
  the old camp the moment the next chapter is accepted, also at the camp), `places.js:885-897` (weekly upkeep).
- **Player sees:** They report the last chapter of Brannoch's chain standing in his carved room
  (`prefabs.js:481-486`: `camp_deep` is air carved out of rock); if nobody else is on the chain the stone is put back
  the same tick, around them and around Brannoch. On land camps the old surface (up to 3-4 blocks higher, with up to 3
  trees) comes back through the player. Anything they put in the camp's barrel (`prefabs.js:497`) or built or stored
  inside the 7x7 box is gone with it. A camp that moves (`near: "observatory"`, `"watchtower"`) does the same at accept.
- **Sure?** Verified by reading. Confirm: `saga-camp-teardown.js`: finish `w_brannoch_deep` with the player on the
  camp's `actor` spot and an item in the barrel; assert the player's head block is air afterwards and the item survives.
- **Fix:** Teardown becomes a queued job (the `saga:restore` list already persists): a camp is marked `gone: 1` and is
  restored only when no player is within 12 blocks of its box. Before restoring, every block with an inventory inside
  the box drops its contents at the lodestone (or the restore is skipped for that tile until it is empty). Tell the
  player: "X packs up once you leave."

#### JNK-04 The "harmless story character" filter deletes players' own projectiles, and story vexes
- **Where:** `actors.js:380-416`.
- **Player sees:** (a) Within 3 blocks of any invulnerable story character (every `meet` character, every stealth
  guard, a hostile ward) a thrown trident, arrow, splash potion, snowball or wind charge is removed as it spawns. The
  trident is lost for good (the item has already left the hand). Stealth ambushes are fought right among the invulnerable
  guards, so this is where it happens. (b) Any vex or evoker fang spawning within 18 blocks of any invulnerable actor
  is removed, including the story's own vex adds (`act4_seals` Lantern Thief adds and its "Defeat 4 vexes and
  phantoms" spawn, `act5_lantern` champion adds, a hostile wanderer's vex adds) whenever some player's meet character,
  guard or witch ward stands near: the fight tops up forever and nothing comes, or a defend wave counts as beaten.
- **Cause:** The handler checks only type and distance, never who threw or summoned it, and does not skip `actors`.
- **Sure?** (a) verified by reading; that `minecraft:projectile.owner` is readable at `entitySpawn` is how
  fishing_bp, journal_bp and quests_bp already find a hook's owner. (b) verified by reading; needs two scenes close
  together to show. Confirm: `saga-actor-projectiles.js`: stand 2 blocks from a meet character, throw a trident and
  shoot an arrow: both entities must still exist next tick; spawn a vex add 5 blocks from an invulnerable witch.
- **Fix:** First lines: `if (actors.has(entity.id)) return;` and for thrown types read
  `entity.getComponent("minecraft:projectile")?.owner`: remove only when the owner is one of our invulnerable actors
  (never when it is a player, never when unknown and a player is within 2 blocks). For summoned types act only when an
  invulnerable **evoker** actor is within range, and never on an entity carrying `saga:add` a tick later.

#### JNK-05 Deliveries take enchanted gear and personal maps without asking, when the NPC's menu opens
- **Where:** `main.js:345-355` (`talked` runs on every `realm:npc_talk`), `objectives.js:1655-1672`,
  `objectives.js:711-731` (`takeItem`: first matching `typeId` in slot order; only renamed stacks are skipped).
- **Player sees:** Opening Brannoch's menu with an Efficiency/Unbreaking iron pickaxe in the hotbar: it is gone ("You
  give Brannoch 1 Iron Pickaxe"). Same for enchanted shields (`act5_lantern` 4, `side_bold` 3), any filled map (their
  base map), compass, spyglass, flint and steel, milk buckets. No choice of which stack, no confirmation, no undo.
- **Sure?** Verified by reading.
- **Fix:** In `takeItem` pass 1 takes only plain stacks (no enchantments, no lore, full durability); pass 2 (damaged,
  still unenchanted) only if pass 1 was short; enchanted or lore items are never taken automatically: the NPC says "I
  won't take your enchanted pickaxe: bring a plain one." Non-stackable deliveries go through a one-button confirm
  ("Give Brannoch your Iron Pickaxe?") from the NPC's offer list instead of on menu open. Unit test `takeItem` order.

### MEDIUM

#### JNK-06 A spot with no saved height resolves to the topmost block: roofs and treetops
- **Where:** `util.js:289-296` (no `yHint` -> `getTopmostBlock` + 1), reached through `objectives.js:138-146` (`withY`),
  `1884-1888` (`standSpot`), `2087` (stealth center, guard heights), `2419` (spawned fights), `2527` (escort start),
  `2640` (lost animals), `2698`/`2736` (defend center and ward), `2879` (wisp start), `1989-1990` (clues).
  `objectives.js:1074` is the same class with a worse fallback: `loc.y ?? player.location.y`.
- **Player sees:** Every `offset` / `at` location (and an operator's place has a y, a picked one before it is built does
  not): the character to meet stands on a house roof or a tree canopy ("X is here. Walk up to them"), waves and the
  ward of "defend the forge" (`singing_forge/quench#2`) and the outpost (`wardens_oath/outpost#1`) start on the roof,
  clue sparkles sit on leaves. In town stories the offsets are counted from the town, which is all roofs. The two
  offset champions (`wardens_oath/outpost#2`, `red_hand#1`) spawn at the **player's** height above the offset's x/z
  while the player may be up to 40 blocks away on other ground: in the air (fall damage) or inside a hill.
- **Affected content:** 4 meets, 2 defends, 3 stealth steps, 7 inspects, 2 champions, 1 escort and 2 wisp trails that
  start at offsets, 2 lost-animal spots.
- **Sure?** Verified by reading (`getTopmostBlock` returns leaves and roofs). Confirm: `saga-spot-roof.js`: put a
  5-high cobblestone hut with a roof and an oak tree on the `mayors_burden/feud#0` offset; the actor must stand on the
  ground (block below is not leaves/planks, sky access not required), within 4 blocks of walkable ground.
- **Fix:** The shared finder (S1): from the topmost block walk down through leaves, logs and player-made blocks to
  natural ground or an indoor floor with a 2-high gap and a walkable neighbor; prefer the height nearest the player
  when the player is within 16 blocks. Cache the resolved y on the scene. Champions use the same finder.

#### JNK-07 When no open spot is near the hint, `groundAt` hands back the hint: mobs in rock, wisps inside hills
- **Where:** `util.js:282-287`; callers without `strict`: `objectives.js:1066-1070` (champion with no place: 10 blocks
  from the player at the player's y), `1216` + `1230` (`spawnGroup`: after 8 failed tries every mob goes to the middle
  point), `2171` (guards), `2240` (patrol steps), `2644` (animals), `2937-2938` (wisp), `2530` (escort beside player).
- **Player sees:** With a place-less champion step (`act2_choir/letter#1`, `w_rook_rival/bounties#1`) in a cave, mine
  or house: the warn line shows, nothing appears (it is inside stone), then either "calls for help" lines and adds, or
  the step completes by itself when it suffocates (`championSlain` credits everyone within 32 blocks,
  `objectives.js:1172-1178`). A wisp walks a straight line through a hill at its old height, cannot be seen, the
  player climbing over it gets more than 48 blocks of 3D distance and "You lost the light. It waits where the trail
  began" (`objectives.js:2915-2922`): back to the start. Groups in tight places spawn stacked on one block.
- **Sure?** Fallback verified by reading; the suffocation outcome is suspected. Confirm: `saga-champion-cave.js`
  (player in a 2-high tunnel at y 20 with solid stone around, step `act2_choir/letter#1` at night: champion's feet and
  head blocks must be air) and `saga-wisp-hill.js` (a 15-high ridge across `act1_signs/song#0`'s line).
- **Fix:** Remove the non-strict mode; callers get `undefined` and must choose: try the next candidate, spawn beside
  the player in line of sight, or wait. The wisp follows the surface (finder with no hint when the hint fails),
  measures "fell behind" in 2D, and when lost comes to the nearest follower instead of resetting to the start.

#### JNK-08 No story character has an authored spot at a built place
- **Where:** `objectives.js:1879-1889` (`standSpot` looks for a prefab feature named after `who.id` or `actor`),
  `prefabs.js:31-108` (no prefab has either; only camps have `actor`), `objectives.js:2736` (ward: feature or the raw
  place origin), `objectives.js:1074` (champion: raw origin + 0.5).
- **Player sees:** All 16 place meets, all 7 wards and the graveyard escort use the fallback. Meets stand at
  "origin + 2 blocks east", not turned with the building's facing: Vesna (5 meets) stands on the pond under her
  stilted hut (`prefabs.js:913-937`: column (2,0) is pond water, the hut floor is 3 blocks above) and as a ward she
  spawns in the pond's center; lighthouse and observatory characters are wherever +2 east falls for that facing.
  Wards and the 9 own-fallback champions spawn at the origin's own height, which is the floor block, on a block
  corner for wards: they rely on the engine pushing them up.
- **Sure?** Positions verified by reading; whether a mob with its feet in a floor block pops up or takes damage is
  suspected. Confirm: `saga-actor-spots.js`: build each prefab at 4 facings, start each meet/defend/champion step,
  assert the character's block is air, the block below is solid and not water, and it is within the prefab's box.
- **Fix:** Add `features` per character (`vesna: v(0,4,0)` in the hut, `hollis_ward` at the altar, `pip` on the
  balcony, `champion`/`arena` per fight) and make `tools/check-stories.mjs` fail when a `who`/`ward`/`champion` at a
  prefab place has no feature. The fallback uses S1 around the door feature, turned with `rec.f`.

#### JNK-09 Auto-picked places and camps ignore Land Claims, safe zones and towns
- **Where:** `places.js:284-311` (`pickSpot`: only other story places, 64 blocks center to center, the last try is
  taken even when it overlaps), `places.js:689-757` (`search`: site rules plus the `BUILT` regex inside the box only),
  `places.js:710` (relaxed after 3 moves: a spot the site check refused as `built up` is accepted),
  `places.js:51-52` (the regex has no cobblestone, logs, farmland, crops, obsidian, terracotta, copper, quartz),
  `wander.js:262-296` (camps go where the player met the wanderer or where the player stands). saga_bp has no
  `scripts/zones.js`; atlas, calendar, maps, wander, meteor and the rest do.
- **Player sees:** Wren's Meadow (40-150 blocks from world spawn), the graveyard (60-200) and the lighthouse (80-250)
  are picked inside or against the spawn town; a 17x17 or 25x25 building appears in someone's claimed but still empty
  land, in a farm (farmland and crops are not "built"), across a cobblestone road or a nether portal frame, flush
  against a base (no margin). Remove puts it back, but only an operator can.
- **Sure?** Verified by reading. Confirm: `saga-place-claims.js` (mini bundle with claims_bp and zones_bp: a claim and
  a safe zone over the band; the picked and built spot must be outside both with a margin) and a unit test of
  `search` on a fake grid with a wheat field.
- **Fix:** Sync `tools/zones-shared.js` into saga; `pickSpot` and `search` refuse a box within 32 blocks of a zone or
  town (`realm:zones`) and ask `realm:claims_check` for the box plus margin before building. Relaxed mode keeps
  refusing `built up`. Add crops, farmland, paths, cobblestone, logs placed next to planks, obsidian to the check, or
  better: reuse `landOk`'s `kind === "built"` test for every column of the box.

#### JNK-10 A picked place moves away as the player walks up, then sticks without a word
- **Where:** `places.js:787-805` (8 waits of 4 s for unloaded ground, then the spot is moved 80-160 blocks),
  `places.js:796-800` (after 6 moves only operators online are told; retry in 10 minutes), `prefabs.js:1658-1681`
  (`trees` fails a site at more than 3 of 25 samples), every objective handler returns silently on `loc.pending`.
- **Player sees:** On a Realm (simulation distance 4) a player 50-64 blocks from the spot has the near half loaded. If
  the near candidates fail (forest, water, slope) and the far ones are not loaded, 32 s later: "X isn't here after all:
  the land didn't suit it." It moves, up to 6 times (relaxed rules after 3), 80-160 blocks each. After that the
  tracker points at an empty spot, the log says "(built when you get close)" and nothing happens.
- **Sure?** Logic verified by reading; how often terrain triggers it is suspected. Confirm: `saga-place-chase.js` on a
  generated forest world with `tick-distance 4`: walk toward `meadow` stopping 56 blocks out for 40 s; count moves.
- **Fix:** Never count "unloaded" as "unsuitable": wait for the player to come closer (or load the area with a
  temporary ticking area of radius 4, see S5). Validate and build at pick time so the player is only ever sent to a
  place that exists. When a place cannot be built, tell the player on the step ("needs an operator: /realm:saga_places")
  and put the reason in the quest box.

#### JNK-11 A half-built prefab is recorded as built
- **Where:** `prefabs.js:1432-1548` (unloaded blocks are counted in `skipped` and only logged), `places.js:526-552`
  (`runBuild` resolves true unless something throws), `places.js:592-596` (`b: 1` is saved whatever happened).
- **Player sees:** The player who triggered the build flies, rides or boats on while the job runs; part of the box
  unloads; the lighthouse has no top, the chapel no bell. Steps that need a feature block ("strike the bell", "open
  the barrel", stand on the balcony) cannot be done; nothing retries (touch-ups run only for a new prefab revision).
- **Sure?** Verified by reading. Confirm: `saga-place-partial.js`: start an auto build and teleport the only player
  300 blocks away two ticks later; come back; every feature block must exist within 10 s.
- **Fix:** `buildSteps` returns `{ skipped, failed }`; `buildAt` saves `pb: 1` (partial) when either is non-zero and
  `autoTick` runs `buildOver(name, false)` while a player is near until a pass has no skips. After any build verify
  each feature block the stories tap (`placeNeeds`) and log what is missing.

#### JNK-12 Forms that open by themselves, and again
- **Where:** `objectives.js:1929-1930` (a meet conversation opens when the player is within the step's radius, 10 to
  24 blocks in the content, of the character), `objectives.js:1952` (closed without choosing: again in 15 s),
  `objectives.js:3084-3096` + `3068` (a riddle's text form reopens 10 to 20 s after a wrong answer or a close while the
  player stands in the area, including while its `failSpawn` mobs are attacking).
- **Player sees:** Arriving at the Gray Ring a dialogue pops up 24 blocks from the Cantor. Closing a dialogue (to
  fight, to think about the choice) brings it back every 15 s for as long as they are near. A wrong answer raises
  drowned and 10 s later a text box covers the screen mid-fight. This is the class the graveyard softlock fix removed
  for clues ("it would open by itself, in the middle of a fight").
- **Sure?** Verified by reading.
- **Fix:** Open once per approach (re-arm when the player has left radius + 4), at most 4 blocks away whatever the
  step's radius; never while the player was hurt in the last 5 s or story mobs of that key are alive within 16
  blocks; a tap (and a hit, JNK-22) always works. After a wrong answer the riddle is re-asked by tapping the place's
  block or from the log, not on a timer.

#### JNK-13 Kills by pets, golems and falls do not count in a spawned fight
- **Where:** `objectives.js:1315` (returns unless the killer is a player), `1275-1281`.
- **Player sees:** "Fight off the Choir ambush (defeat 6)" with two wolves: the wolves' kills vanish, the count does
  not move, a fresh mob replaces each one. A mob knocked off a cliff, or killed by an iron golem at the farm, the same.
  The step is not stuck, but it reads as broken. Champions already count for everyone within 32 blocks.
- **Sure?** Verified by reading.
- **Fix:** For a mob that is one of our adds (`actor.role === "add"`) with a live scene: credit the scene's members
  within 24 blocks of where it died, whatever killed it. Extend `saga-defeat-credit.test.mjs` (killer a wolf, no
  killer) and add a BDS kill with `/damage ... entity_attack entity <wolf>`.

#### JNK-14 Defend: waves count as beaten when their mobs unload or never spawned, and a lost ward is not replaced
- **Where:** `objectives.js:2706` (`close` is `2r + 16` = 56 to 64 blocks for the content's radii 20-24),
  `2766-2771` (an invalid mob is "lost" only when everyone was away), `2809-2813`, `2826-2828` (a wave whose
  `spawnGroup` returned nothing is cleared a second later), `2735-2741` (the ward is spawned once, result unchecked).
- **Player sees:** Standing 55-64 blocks out (still "close") the far side of the ring is past the Realm's ticking
  edge: mobs there are not valid, so the wave is beaten and the next one comes. A wave that could not spawn (unloaded
  ring, Peaceful) is beaten at once. The ward unloads the same way, its record is deleted (JNK-01) and it is removed
  when it loads: "Keep Hollis alive" goes on with no Hollis.
- **Sure?** Suspected: depends on tick distance 4 and where the player stands. `saga-defend-away.js` covers only the
  far case. Confirm: the same scenario with the player held at `center + 60` and `tick-distance 4`.
- **Fix:** `close` = `min(2r + 16, 40)`; a wave is beaten only by deaths (`entityDie` of its ids, or JNK-13's rule) or
  the stall regroup; an invalid mob is always "lost" and comes again; zero mobs spawned = retry next second, not a
  clear; the ward is checked each second and respawned at its spot when its record is unloaded.

#### JNK-15 Champions (elite_bp) converts story mobs into random natural champions
- **Where:** `elite_bp/scripts/main.js:482-506` (every `entitySpawn` with cause `Spawned`, which is what
  `spawnEntity` reports, rolls 2.5%, 7.5% in a Blood Moon), `:544-565` (`convert` skips only its own tags),
  `saga_bp/scripts/actors.js:88-124` (no opt-out mark).
- **Player sees:** An ambush zombie, a wave skeleton or spider, a "Sculk-Blind Digger" guard or (away from buildings)
  a story witch becomes "Gerald the Stormcaller": renamed, tougher, with a trait, and elite then keeps rewriting its
  name tag. For an invulnerable guard or witch that means a champion nobody can hurt. `avoidBuilds` and
  `surfaceOnly` hide it at most built places, so it shows in escorts, offset fights and wrong-answer spawns.
- **Sure?** Verified by reading both packs. Confirm with a two-pack mini bundle: elite `chance: 1`,
  `saga-defeat-spawn.js`: no story mob may carry elite's champion tag.
- **Fix:** A shared convention (S6): every pack tags what it spawns for a scene with `realm:scripted`; `convert`
  returns on that tag or on any non-empty `nameTag`. phantom_bp's remover (`phantom_bp/scripts/main.js:15-30`) gets the
  same test (a story phantom 10+ blocks above a player with phantoms off is removed today).

#### JNK-16 Story champions: duplicates, leftovers, and a warning before anything exists
- **Where:** `objectives.js:994-1005` (`championAlive` sees loaded entities only), `1076-1085`, `1088-1094` (warn line
  sent before the spawn is tried), `1097-1130`, `main.js:717-725` (removed only at world load).
- **Player sees:** They flee a champion past 64 blocks, come back to the place by another way: a second one is there.
  Killing either finishes the step; the other, and any champion whose player left, logged off or was skipped past the
  step, stays for the rest of the session: a named, strength II, health-boosted mob at the lighthouse 80-250 blocks
  from spawn that never despawns and attacks anyone.
- **Sure?** Verified by reading. Confirm: `saga-champion-dup.js`.
- **Fix:** Champions join the registry (S2) with owner step and last position; one per tag; a champion whose step
  nobody online has open within 96 blocks for `actorTimeoutSeconds` is removed; when its step is done its duplicates
  go. Send `warn` only after the entity exists.

#### JNK-17 Disconnecting loses an escort or a wisp trail, with no note on return
- **Where:** `main.js:768-770` -> `objectives.js:3876-3877` (`endScenesOf`), scenes live only in `scenes` (C23).
- **Player sees:** The phone drops the connection 300 blocks into Pip's escort or a wisp trail; on rejoin the
  character and the light are gone and the step starts again from `from`. Defend already resumes at the saved wave.
- **Sure?** Verified by reading.
- **Fix:** Save `{ state, x, y, z, t }` for escort and follow in the entry's `st.x` every 5 s; on the first tick after
  a join within 10 minutes, respawn the escort at that spot in `wait` and put the wisp there, with one chat line.

### LOW

#### JNK-18 Escort trail goes through blocks and air; the character slides
- `objectives.js:2557-2592`. Crumbs are the leader's own positions. Pillaring up puts the crumb 2.5 blocks behind
  inside the pillar (a non-invulnerable escort suffocates: "was hurt and ran back"); an elytra or a pearl leaves
  crumbs in the air, and when the leader gets 32 blocks ahead the frozen escort is left hanging and falls. The escort
  is teleported in short steps with slowness 250, so it glides with no walk animation (open audit item "steady
  escort facing" is the same root). Suspected; confirm with `saga-escort-pillar.js`. Fix: drop a crumb only where S1
  says a body fits with a floor below; snap skipped crumbs to the ground; consider real walking with the tether's
  impulse steering.

#### JNK-19 Guards walk their circle through walls and over roofs
- `objectives.js:2234-2244`: each step takes the nearest open height within 6 blocks, else the old height. At a built
  place the rings (0.35r to 0.9r) cross the building: guards step onto wall tops and through fences. Suspected
  (visual); `saga-party-stealth.js` checks snaps, not paths. Fix: sample the ring once when posting, keep only arcs of
  standable columns with a step of at most 1 block, and turn around at an arc's end.

#### JNK-20 Collect and deliver disagree about where items are
- `objectives.js:676-689`: only the 36 inventory slots. An item in the offhand (maps, compasses, shields), worn, in
  a bundle or a shulker does not count. `stash-bridge.js` makes collect count Expansive Inventory pages, but
  `takeItem` reads only the live page, so "have 8 paper: done" is followed by "Mara still needs 8 paper. Renamed
  items are never taken." Fix: count and take the offhand; when a delivery is short and the stash rows hold the
  item, say "N are on another inventory page".

#### JNK-21 Led animals stay at the pen forever; any leashed animal counts
- `objectives.js:2665-2680`: the animal loses `saga:actor`, gets `saga:led` and is never removed; each player and
  each repeat leaves `count` more at Wren's Meadow, the cove or a camp (cramming, lag). Any goat on a lead counts,
  not only the lost one. Fix: keep a registry record with role `home` and remove it (with a puff) after 10 minutes or
  when more than 6 led animals are within the pen's radius.

#### JNK-22 A tap from a player who is not on the quest does nothing; no hit-to-talk
- `objectives.js:1588-1593`, `1934-1938`. The tap is cancelled and ignored for helpers and bystanders, with no
  line. Talking relies on `playerInteractWithEntity`; a frozen cat, allay or evoker has no interact button on touch,
  so phone players may only get the proximity form (JNK-12). Needs a real-client check (add to
  `REAL_CLIENT_CHECKLIST.md`). Fix: `entityHitEntity` on a `meet` actor counts as a tap (like "strike the bell");
  bystanders get "X has nothing to say to you right now" at most every 10 s.

#### JNK-23 Prefab entities and what stands in a footprint
- `prefabs.js:1535-1543`: plain `spawnEntity` and a tag (C6), skipped when any minecart is within 3 blocks (C25).
  Mobs and pets standing in the box when it is built are walled in; tree tops above a prefab's cleared height are
  left floating. Fix: `spawnFresh`; push entities out of the box before building; clear logs and leaves above the box
  for 8 blocks.

#### JNK-24 `place` step memory is in RAM
- `objectives.js:1328-1358`: `counted` and `placed` are lost on a restart (C23): the same block can be broken and
  placed again for credit, and breaking a counted block no longer takes credit back. Low; note only.

#### JNK-25 Spawn failures are silent everywhere
- `actors.js:120-123` logs and returns `undefined`; callers either retry each second for ever (meet, escort, guards,
  Peaceful difficulty) or go on without (ward, a short wave). The player is never told. Covered by S4.

#### JNK-26 Actors are real entities for everyone
- Any player can push an anchored character (it snaps back with a growing delay), kill a non-invulnerable escort or
  ward ("was hurt and ran back" for the owner), take a lost animal, or scoop a frozen villager into a boat or
  minecart. Stable APIs cannot hide an entity per player. Fix worth doing: all story characters invulnerable to
  players other than through the scene's own mobs is not possible either; make escorts and wards `invul` against
  player damage by healing damage whose source is a player not in the scene (`entityHurt` after-event).

---

## Structural improvements

**S1. One safe-spot finder.** `spots.js` (or `tools/spots-shared.js`, since wander, caravan, moon and elite have the
same need): `findSpot(dim, { x, z, yHint?, near?: Player, kind: "land" | "surface" | "bed" | "air", height: 2,
sight?: Vector3, natural?: boolean })` -> `{ status: "ok", at } | { status: "unloaded" } | { status: "none" }`. Never
returns the hint; reads `typeId` inside the try (C16); walks down from the topmost block through leaves, logs and
built blocks; refuses lava, fire, cactus, powder snow (the tether's `BAD_FLOOR`); turns prefab-relative offsets with
the facing. Every `groundAt` caller moves to it and must handle `unloaded` (retry) and `none` (visible fallback
beside the player, or the watchdog reason). Removes JNK-02, 06, 07, most of 08, 18, 19.
*Tests:* a node unit test over a fake block grid (hill, cave, roofed hut, tree, lake, lava pool, unloaded column,
y 319 phantom block) asserting feet/head free and floor solid for every result; BDS `saga-spot-roof.js`,
`saga-champion-cave.js`, `saga-stealth-edge.js`, `saga-wisp-hill.js`.

**S2. An actor registry that tells unloaded from dead, reconciled on load.** One record per (owner, key, role, n):
`{ id, type, dim, pos, state: live | unloaded | dead, since }`, champions included (replacing
`champions-session.js`). `entityLoad` re-adopts by id; `entityDie` / transformation / own removal mark dead; a sweep
enforces one entity per record and removes extras; timeouts act on records. Small enough to persist in one world
property so a restart resumes instead of sweeping everything. Removes JNK-01, 14 (ward), 16, 21.
*Tests:* unit test with fake handles (unload -> load -> same record, die -> respawn rule, duplicate removal); BDS
`saga-escort-unload.js`, `saga-champion-dup.js`, a restart case with `t.restart`.

**S3. Scenes that survive a rejoin (C23).** Escort and follow save their state in the player's entry; defend already
does. Removes JNK-17. *Tests:* BDS rejoin scenario (a rejoin gives a new `player.id` in the harness: key the saved
state by the entry, not the id).

**S4. A stuck-step watchdog with "Fix my quest".** Each scene tick returns a reason code instead of a bare `return`
(`place_pending`, `place_partial`, `spot_unloaded`, `spot_none`, `spawn_failed`, `actor_missing`, `block_missing`,
`needs_night`, `peaceful`). In range with the same blocking reason for 20 s: the quest box shows one plain line; the
story log gets **Fix my quest**, which per reason rebuilds missing feature blocks (`buildOver` touch), respawns the
character beside the player, brings the wisp to the player, moves the champion to a safe spot, re-issues a lost
reward item list, and after 3 tries offers "Skip this step" (operators are told). Removes the silent halves of
JNK-10, 11, 25 and gives every future bug a way out. *Tests:* unit test per reason; BDS `saga-fix-quest.js` (bell
block removed; a meet whose spot is filled with stone; Peaceful).

**S5. Places are validated and finished before a player is sent there.** Pick -> temporary ticking area (radius 4,
the legal maximum) -> site check including `realm:zones` and `realm:claims_check` with a margin -> full build ->
verify feature blocks -> release. Record `complete | partial`; partial is repaired when a player is near. A place
whose coordinates a player has been shown never moves by itself. Teardown is a queued job that waits for the box to
be empty of players and spills containers. Removes JNK-03, 09, 10, 11. *Tests:* unit tests of `pickSpot`/`search`
with fake zones and a crop field; BDS `saga-place-claims.js`, `saga-place-partial.js`, `saga-camp-teardown.js`.

**S6. A cross-pack "hands off" mark for scripted mobs.** Every pack tags scene entities `realm:scripted`; converters
and removers (elite, phantom, any future one) skip it; a `tools/check-*.mjs` rule requires the test in every
`entitySpawn` handler that calls `remove()` or converts. Saga's own projectile filter keys on the projectile's owner.
Removes JNK-04, 15. *Tests:* mini-bundle BDS scenario (elite `chance: 1`), `saga-actor-projectiles.js`, a unit test of
the filter with fake owners.

**S7. Authored character spots, enforced by check-stories.** Features named for each `who.id` / `ward.id`, an `arena`
feature per champion place; `check-stories` fails when a character at a prefab place has none;
`saga-prefab-footprint.test.mjs` asserts from the blueprint that each such feature has a solid floor and two free
blocks. Removes JNK-08. *Tests:* the static rule plus `saga-actor-spots.js` over 4 facings.

**S8. One policy module for credit, items and forms.** `creditScene(add, cause)` (JNK-13, 14), `takeForDelivery`
(plain first, never enchanted without a yes, offhand counted, stash pages named: JNK-05, 20), `mayOpenForm(player)`
(once per approach, not in combat: JNK-12, 22). *Tests:* extend `saga-defeat-credit.test.mjs`; unit tests for the take
order and the re-arm rule in `saga-interaction-lifecycle.test.mjs`.

---

## What needs a BDS (or real client) run

| Finding | Scenario | What it must show |
|---|---|---|
| JNK-01 | `saga-escort-unload.js` | escort survives the leader going 200 blocks away and back, or says why not |
| JNK-02 | `saga-stealth-edge.js` | after a sighting the player's feet/head are in air on solid ground (surface wall case, seal_stone case) |
| JNK-03 | `saga-camp-teardown.js` | player in a deep camp at chain end is not in stone; barrel contents survive |
| JNK-04 | `saga-actor-projectiles.js` | trident/arrow thrown 2 blocks from a meet actor still exist; own vex adds survive near an invulnerable actor |
| JNK-06/07 | `saga-spot-roof.js`, `saga-champion-cave.js`, `saga-wisp-hill.js` | nobody on roofs/canopies or in rock; the wisp is not lost over a ridge |
| JNK-08 | `saga-actor-spots.js` | every meet/ward/champion at each prefab, 4 facings, stands in air on a floor inside the box; whether a mob spawned in the floor block pops up or is hurt |
| JNK-09 | `saga-place-claims.js` (mini bundle) | picked places land outside claims, zones and towns |
| JNK-10 | `saga-place-chase.js` (generated world, tick distance 4) | how often a place moves while a player waits 56 blocks out |
| JNK-11 | `saga-place-partial.js` | a build interrupted by unloading is completed later |
| JNK-14 | `saga-defend-away.js` variant at `center + 60`, tick distance 4 | waves are not beaten by unloading |
| JNK-15 | elite + saga mini bundle, `chance: 1` | no story mob becomes a champion |
| JNK-16 | `saga-champion-dup.js` | one champion per tag after flee and return |
| JNK-18 | `saga-escort-pillar.js` | escort unhurt after the leader pillars 5 up |
| JNK-22, JNK-12 | real client (phone and controller) | which input reaches `playerInteractWithEntity` on a frozen cat/allay/evoker; how the proximity form feels |

Verified by reading alone (no run needed to believe them, a scenario only to pin the fix): JNK-01, 03, 04a, 05, 06,
09, 11, 12, 13, 16, 17, 20, 21.
