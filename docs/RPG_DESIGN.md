# RPG design: five features (October 2026)

The plan for making the Realm feel like one RPG. Not published (like `STORY_BIBLE.md`). Built in this
order, one PR each: **0 groundwork + 2 Hearth & Hearsay**, **1 Wanderers**, **3 Atlas**, **4 Realm Calendar**,
**5 Callings & Relic Ascension**. Numbers here are starting values: tune them, and make the important
ones `config.js` options (with Realm Settings entries where players or operators would want them).
Where this file and the code disagree after shipping, the code and `docs/PACKS.md` are the truth;
update the "As shipped" notes at the end of each section.

Facts the design rests on (from the repo, October 2026):
- 12 townsfolk (`minecraft:npc`, npc_bp) stand at a post, teleport back past 1.5 blocks, greet by time
  and weather; no affinity, gifts, gossip, schedules or flag reactions. Skins can't be set by script.
- Saga: 22 stories, 157 chapters, 48 favors (fixed templates, FNV-hash pick), 28 objective types,
  16 fixed places. Offers come only through `realm:npc_talk`; saga's `onTalk` (main.js:140) does not
  check `msg.npc`, but `NPC_NAMES` and `check-stories` know only the 12. Actors are per player, in
  memory, swept at load. All flags are per player in `saga:p` (30,000-char `SAVE_LIMIT`). There is no
  `g:heart`: the main story uses `g:mercy` / `g:iron` counters, plus `g:hollis`, `g:quill`, `g:ending`,
  `g:allies`, `g:vesna`, `g:fen`. `pack:<folder>` flags are live (from `realm:help_ping`), never saved.
- Mail (mail_bp) sends and reads no script events. No pack sends `realm:trail_unlock`.
  `realm:dish_give` / `realm:ingredient_give` exist in cooking_bp but are unused.
- Economy: casual play earns about 50-150 Crowns/h; market top item 25 (saddle); caravan weekly for 40 min;
  guild Master items 300-500; bounties cap about 280/day; relic forge 8 shards; champions drop 1-3 shards.
- Quirks: `entityDie` never fires for `minecraft:npc` (only `entityRemove`, which also fires on unload);
  check ids against `@minecraft/vanilla-data`; weather can't be read (each pack keeps `<pack>:weather`);
  `scoreboard.getScore` throws for brand-new players; `getBlockBelow` skips water without
  `includeLiquidBlocks`. `player.spawnParticle` is stable (per-player particles; used 21 times).

---

## 0. Groundwork (ships with 2)

Small protocol pieces every later feature uses. Document each in "How the packs work together".

| Piece | Where | Shape |
|---|---|---|
| `realm:mail_send` | mail_bp listens | `{to, from, subject (<=40), body (<=600)}`; `to` a player name or id from the roster; `from` any display name (system letters show it as sender). Letters from scripts skip the send cooldown. |
| `realm:gossip` | npc_bp listens; producers send one line each | `{kind, player, name?, place?, n?}`; kinds: `champion`, `fish_legendary`, `expedition`, `act`, `guild_master`, `town_project`, `blood_moon`, `meteor`, `wander_chain`, `siege` (more allowed) |
| `realm:npc_flags` | saga sends, npc_bp listens | `{player, flags:{...}}`, a whitelist of about 25 story flags, sent on join and on change |
| `realm:affinity` | npc_bp sends | `{player, npc, level, pts}` on a level change; on join one message `{player, all:{mara:2,...}}` |
| External flags in saga | saga | `g:aff_<npc>` (saved, from `realm:affinity`), `cal:day`, `cal:season`, `cal:festival` (live, from `realm:calendar`, like `pack:`) |
| `realm:calendar` + Realm day counter | npc_bp, for now | Put the counter in **npc_bp** now (`npc:day`, +1 at every dawn seen, time of day crossing into 0-1000 or a jump from night to morning; monotonic, immune to `/time set` rewinds) and broadcast `realm:calendar {day, season, festival?, ends?}` at dawn and on join. calendar_bp (idea 4) later takes over the broadcast and npc_bp only listens. Season and festival math is in section 4. |

**As shipped (0, October 2026):**
- `realm:affinity` also carries `off`, the percent off at that townsfolk's shop (Friend: `friendDiscount` 10, plus 5
  with Quill for the Hollow-Crowned), so consumers never redo the math; the join message is `{player, all, off}`.
- `realm:calendar` is `{day, doy, year, season, festival?, ends?, from: "npc_bp"}` (`ends` = the festival's last
  absolute day). Also sent 5 s after world load and on `realm:calendar_ping` (saga pings at load). When npc_bp hears
  `realm:calendar` from another `from`, it stops broadcasting for 2 hours (renewed by each message) and uses that
  day for birthdays: calendar_bp only has to broadcast. Counter: "night seen" = time of day >= 12000, dawn = < 6000
  after that; saved as `npc:day` `{d, n}`.
- `realm:npc_flags` carries only set flags: `g:` ending/hollis/quill/vesna/fen/allies/mercy/iron, 15 story flags, and
  `fin:<story>` = "1" for 18 stories (41 keys max). Sent every 5 s when changed; `realm:npc_flags_ping` (npc_bp at
  load) makes saga resend.
- `realm:quest_done` from saga now has `npcs` (chapter giver and ender) for stories and `npc` for favors.
- `realm:mail_send` letters have an empty writer id: no Reply, no Sent copy; still refused into a full unread inbox.
- Extra: `realm:npc_debug {player, action:"tap", npc, sneak?}` (operator/script only): simulated players' taps fire
  no interact events, so BDS scenarios tap through it (`tools/test-bds/examples/npc-hearth.js`).

---

## 2. Hearth & Hearsay: living townsfolk (`npc_bp` UPGRADE + saga content)

**Pitch:** The townsfolk remember you. Gift Tobin a salmon he loves and he opens up; befriend Quill and
his prices drop; do something big and by morning Bea is telling everyone.

**Affinity** per NPC per player, 0-1000 points. Levels: Stranger 0, Acquaintance 100, Friend 250,
Close 500, Confidant 900.
- Talk +5 (once per NPC per real UTC day, not Realm day, so sleeping can't farm it; same for gifts).
- Gift (sneak-tap or a `Give <item>` button at the top of the form when holding an item; takes 1):
  loved +40, liked +20, neutral +5, disliked -15; 1 gift per NPC per day. Birthday (a Realm Year day per
  NPC, section 4): gifts x2.
- Their daily favor done +15 (`realm:quest_done` kind `favor`, from that npc); a story chapter they
  give or end +20.
- No decay.
- Pace: about 60/day takes one NPC to Confidant in about 15 days.

**Unlocks:**
- Acquaintance: 4 more idle lines and an "Ask about..." button (3 topics each).
- Friend: 10% discount where they sell (consumers cache `realm:affinity`):
  - Quill's market (crowns_bp buy prices)
  - Bea's recipes (cooking_bp)
  - Elsie's bed, 10 -> 9 (waystone_bp)
  - Mara's map, 50 -> 45 (maps_bp)
  - Ida's forge, 8 -> 7 shards (relics_bp)
  - Tobin's fisher, +10% paid (fishing_bp)
- Close: their heart story (saga `kind: "heart"`, 3 chapters, `requires.flags {"g:aff_<npc>": ">=3"}`).
- Confidant: title `<Name>'s Confidant` (`realm:title_unlock`), a trail (`realm:trail_unlock`, the first
  sender; titles_bp may need new trail kinds), a weekly keepsake item with lore.

**Schedules** (no pathfinding):

| Slot | Ticks | Where |
|---|---|---|
| work | 0-6000 | post |
| lunch | 6000-9000 | `noon` post |
| evening | 9000-13000 | `evening` post |
| night | 13000-23000 | existing home |

- Teleport only when no player is within 16 blocks of either spot.
- A slot without a post stays at the post (backward compatible).
- `/realm:npc_post <id> <noon|evening>` (operators). "Who lives here?" shows where each NPC is now and
  your heart level with them.

**Reactions:** greeting pools keyed by whitelisted flags from `realm:npc_flags` (`g:ending`, `g:hollis`,
`g:quill`, `g:vesna`, `g:allies`, `act3_deep.elsie`, `act4_seals.act4:promise`,
`mayors_burden.plaque`...).

**The Hollow-Crowned** (`g:ending = crown`):
- The town is cold forever: greetings come from a cold set for all 12, and gossip calls the player
  "the Crowned".
- Affinity gains x0.75 below Friend.
- Each heart story has a Crown chapter (`when {"g:ending":"crown"}`) where that NPC confronts what the
  player did.
- At Confidant, that NPC uses a private warm set when no other player is within 16 blocks.
- Exceptions:
  - Hollis (if `g:hollis = saved`) is never cold: forgiveness is his arc.
  - Wren is warm but scared.
  - Quill likes them more (+5% prices in their favor).

**Gossip:**
- World ring buffer `npc:gossip`: 24 entries, 48 h life, about 4 KB.
- On a tap, a 25% chance the greeting is a templated line about the newest entry this player hasn't
  heard (about another player, or praise for themselves).
- Producers to wire now (one line each): elite_bp (champion), fishing_bp (legendary), expedition_bp
  (N5+ clear), saga (act finished), guilds_bp (Master rank), town_bp (project done), moon_bp
  (Blood Moon survived), meteor_bp (meteor found).

**Data:**

| Key | Shape |
|---|---|
| player `npc:aff` | `{mara:[pts, talkDay, giftDay, bits], ...}` |
| world `npc:gossip` | ring buffer above |
| `npc:list` entries | gain `posts:{noon, evening}` |
| player `npc:flags` | cached whitelist |
| world `npc:day` | Realm day counter |

No new per-tick loop: schedules ride the existing 200-tick audit.

**Content (v1):**
- Gift tables per NPC: 3 loved, 6 liked, 3 disliked.
- 2 reaction lines per gift tier.
- 4 level-up lines + 4 idle lines per NPC.
- 36 "Ask about" topics.
- About 150 flag-keyed reaction lines.
- About 54 gossip templates (9 kinds x 2 generic + 3 kinds x 12 voices).
- 12 heart stories x 3 chapters, each with a Crown variant where needed.
- 12 keepsakes.
- 12 birthdays.

Voices are in `STORY_BIBLE.md` section 4.

Example heart story (Tobin, "The Gull's Last Voyage"): patch the Gull (deliver 24 spruce planks,
interact at the lighthouse), row past the sunken bell (`ride` boat 300) and keep a dusk vigil there,
scatter Hal's ash-salt at the graveyard (`use` bone meal). Reward: 5 levels, 60 Crowns, "Hal's Old Rod"
(lore), a codex entry.

**As shipped (2, October 2026):**
- Content: 3/6/3 gift tables, 2 lines per tier, 4 level-up and 4 extra idle lines, 3 topics, 2 cold + 2 warm
  greetings, a keepsake, a birthday and a Close letter per NPC (`npc_bp/scripts/hearth.js`); 141 flag reactions;
  22 generic gossip pairs (10 kinds + `other`) and 36 voiced (champion, act, blood_moon x 12). Each template is a
  pair [about someone else, about you].
- `npc:aff` entries are `[pts, talkDay, giftDay, bits, keepsakeDay]` (bits: 1 Close letter sent, 2 Confidant title
  and trail sent). Gifts: sneak-tap or the `Give <item>` button; named or lore items are refused (relics, quest items).
- Confidant trail: one new trail `hearts` in titles_bp (vanilla `minecraft:heart_particle`, no sky_rp change) for
  every Confidant; title `<Name>'s Confidant` with the NPC's short name ("Old Tobin's Confidant").
- Heart stories (`saga_bp/scripts/stories/side_heart.js`): 3 chapters + a 4th Crown chapter placed first
  (`when g:ending=crown`), so a player crowned midway gets it next. Spoiler gates on top of `g:aff_<npc> >=3`: Tobin
  needs The Drowned Bell, Mara the Last Map, Ida and Sol Act I, Bram, Quill and Hollis Act II (Hollis also
  `g:hollis != lost`), Elsie Act III; Reyes, Moss, Wren, Bea none. Titles: The Gull's Last Voyage, Fenn's Unfinished
  Survey, The Warden's Helmet, Old Words, The Locked Drawer, Mother's Teapot, Dunmore's Pick, Adela's Star, Every
  Candle Lit, The Unvisited Grave, Clover's Foal (Wren's mare is Clover: Biscuit is a cow in Lost Lambs), The Last
  Ship's Supper. Tobin's sets `g:gull = sailed` at the end: section 5's Hal's Compass +3 can read it (or Tobin at
  Confidant via `realm:affinity` level 4).
- Schedules: only lunch/evening moves wait for the 16-block rule; going home at night and back at dawn stays
  instant, as before. `/realm:npc_post <id> <noon|evening>` plus two menu buttons. Slots live in memory; a restart
  puts NPCs straight into the slot of the time.
- Gossip: the same kind about the same player within 30 min replaces the older one; the subject's Crowned state is
  stored with the entry. Producers wired: elite_bp, fishing_bp, expedition_bp (Nightmare >= 5), saga (act >= 1),
  guilds_bp (top rank), town_bp (top contributor), moon_bp (each Blood Moon survivor), meteor_bp (first finder).

---

## 1. Wanderers of the Wilds (`wander_bp` NEW + `saga_bp` UPGRADE)

**Pitch:** Out past the town lamps you'll meet people: a footsore pilgrim, a hermit on a peak, a ghost at a
ruin, a dwarf-ish miner deep underground, a rival adventurer, and a few who aren't what they seem.

**Split of work:**
- `wander_bp` decides who appears where and when, owns the entities, and draws their talk form (a copy
  of npc_bp's offer collection: `realm:npc_talk` with `npc:"w_<id>"`, `roles:["wanderer","w_<id>"]`,
  `OFFER_TICKS` 4, at most 16 offers, labels cut to 80 characters).
- `saga_bp` runs every quest as story `kind: "wander"` and builds camps as instanced places.

**Scheduler** (every 1200 ticks, per online player):
- Eligible: survival or adventure, not `afk`, not `realm_expedition`, Overworld or Nether.
- Distance: 300 or more from spawn; 160 or more from every town, claim and safe zone (`realm:zones`);
  256 or more from a live wanderer.
- Roll 7% per eligible minute (`rollChance`): x1.5 within 128 blocks of an Atlas site or saga ruin,
  x1.25 at night for ghosts and hostiles.
- Cooldown 8 min after an encounter, 20 min after declining.
- Expected: about 2-2.5 encounters per hour exploring.
- Placement: 24-40 blocks ahead along the view; solid ground with 2 air above; light 7 or more
  (ghosts excepted); 12 tries, then skip.

**Caps:** 1 live encounter per player; 5 transient realm-wide (at most 2 hostile); 8 camps; at most
13 wanderer entities in total.

**Archetypes** (first match wins):

| Archetype | Context | Entity |
|---|---|---|
| deep miner | below y 0, no sky | `minecraft:npc` |
| ghost | night, within 64 of a ruin (a saga graveyard/observatory/watchtower, an Atlas site, or 6+ mossy cobblestone/cracked stone bricks in a 9x9x5 sample) | `minecraft:allay` |
| pilgrim | within 200 of old_chapel/observatory/starfall, day | `minecraft:npc` |
| rival (Rook) | within 300 of a bounty champion or a treasure-map leg | `minecraft:npc` |
| hermit | y 100+, or taiga/snow | `minecraft:npc` |
| storm-chaser | thunder (its own `wander:weather`) | `minecraft:npc` |
| Nether exile | Nether | `minecraft:npc` |
| traveler | otherwise | `minecraft:npc` |

**Despawn:**
- A transient wanderer lives 15 min untouched, or 30 min once a one-off is accepted, or until its owner
  has been 96+ blocks away for 60 s.
- `entityRemove` marks it gone in `wander:live` (never respawned).
- Sweep tagged `realm:npc_owner:wander_bp` entities not in `wander:live` at load and on `entityLoad`.
- Invulnerable (allays get resistance 4).
- A camp NPC respawns at its camp when a player with that chain active is within 48 blocks.

**Identity:**
- 8 named Recurring Wanderers with hand-written chains of 3-5 chapters (Pell the Pilgrim, Anwen the
  Starwright surveyor's ghost, Brannoch Deepdelve the deep miner, Rook the rival, plus 4 more).
- Procedural Strangers for one-offs: 40 first names x 20 epithets, 8 archetypes, 24 templates with
  randomized params.

**Camps:**
- Prefabs `camp_road`, `camp_peak`, `camp_deep` and `camp_ruin`, 7x7, under 120 blocks each, built by
  saga's place code with a terrain snapshot.
- Each has a lodestone with a `Waystone: <Name>'s Camp` sign. Check whether waystone_bp discovers
  pre-built signs; if not, add a small `realm:waystone_register` event.
- A chapter's `camp: {prefab, near}` creates or moves `camp:<wid>`.
- A moved camp is restored once no active player needs it, or after 7 real days unvisited; a letter
  follows via `realm:mail_send`.

**Hostile wanderers:**
- No hostiles until both prologue stories are done; never in expeditions, AFK, below 50% health, or
  within 160 blocks of a town/claim/zone.
- At least 30 min between hostiles per player.
- `hostileShare` 0.2 (0-0.5, operator setting).
- Party scaling: +1 add per extra party member within 32 blocks, up to +3.
- The turn: wander_bp removes the NPC and saga spawns the hostile form at that spot, tagged
  `realm:saga:wh_<id>` (saga's own champion spawning for illagers), then a `defeat` runs there.

| Type | Disguise | Reveal and fight | Appears |
|---|---|---|---|
| Choir Spy | pilgrim/traveler | attacks 20 s after the talk or when accused; vindicator "Choir Spy" + 2 pillagers | only after Act II |
| Toll Man | traveler at a crossing | "Toll's 20 Crowns": pay (choice `cost`) or he and 2 pillagers fight (no banners) | day |
| Drowned Sailor | lost sailor by water at night | a drowned champion (`vampiric`) + 2 drowned rise | after `drowned_bell` |
| Hollow-touched Hermit | hermit, y 100+ | witch champion + 3 vexes | after Act III |
| Rook, turned | rival | vindicator champion (`shielded`), once per player, a chapter of Rook's chain | if you beat him to 3 bounties and `g:iron >= 4` |

- Every hostile has one tell in its lines.
- A "Something's off..." button shows when the player wears the Gray Choir Mask, has Reyes at Friend+,
  or has `g:iron >= 3`:
  - Accusing a hostile reveals it early with Slowness II for 5 s, +10 Wardens rep, `g:iron` +1.
  - Accusing a friendly wanderer: they leave, no reward, `wander:accused` +1 (Rook and Pell mention it).
- Hostile rewards: 40-60 Crowns, 1-2 Relic Shards, 25 Wardens rep, champion Combat XP, gossip.

**Rewards (economy):**

| Content | Levels | Crowns | Other |
|---|---|---|---|
| one-off | 1-3 | 10-30 | 10 rep (guild by archetype), 20-60 skill XP |
| chain chapter | 2-5 | 30-60 | 30 rep |
| chain finale | 8 | 100-150 | title, 15% relic roll, codex |

Target total from wanderers: about 50 Crowns/h.

**Saga engine work:**
1. A `WANDERERS` table of `w_*` ids that saga and check-stories accept as givers, `npc` and `end`.
2. Instanced places (`camp:<wid>`, ignore `MAX_MOVES`), a chapter `camp:` field, and the
   `realm:place_ready {name, dim,x,y,z, state}` event.
3. Template params for one-offs (`params:{item:[...], count:[a,b]}` with `{item}`/`{count}`/`{name}`
   substitution, seeded per encounter), stored in `saga:p.wv` (only the active one, plus a counter).
4. Location `at: "wanderer"` (the spot from `realm:wander_spawn {player, wid, archetype, tpl?, dim,x,y,z}`).
5. `cost:{crowns}` on a choice.
6. `realm:wander_hide {wid, player, seconds}` while an escort actor copy exists.
7. `realm:quest_done {kind:"wander", guild}`.
8. A Journal "people" page (journal_bp: a new page "Wanderers" with the named wanderers, a reward
   10 levels / 200 Crowns / title `Friend of the Road`).

**Integrations:**
- Rook races bounty champions: kill within 300 s or the bounty pays half; needs a small bounty_bp
  hook, or keep it in saga as an optional bonus.
- Rook appears on treasure-map legs (`event.quest {pack:"maps_bp"}`).
- Brannoch's chain ends with the champion Old Gnasher (spider, `frostbound`).
- Per-player `!` particles over a wanderer who has an offer.

**Example (Pell, 4 chapters):**
1. Deliver 3 leather + 1 string; a choice walk/map.
2. Escort him to old_chapel (walk) or reach it (map); the outro reads `g:hollis`.
3. The camp moves to the observatory with a letter; a midnight vigil, with a shooting-star sky request.
4. `answer` "What does the stone listen for?" Reward: title `Pilgrim's Friend`, a codex entry.

**As shipped (1, October 2026):**
- Protocol: more events than listed, so neither pack guesses. `realm:wander_spawn` also carries `name` (and no
  `tpl`: saga picks the Stranger's template, seeded by the wid); wander_bp also sends `realm:wander_turn`
  (a disguise dropped, with `accused`) and `realm:wander_gone` (`why`: timeout, far, gone, accused); saga sends
  `realm:wander_state { player, ch, h, s, q }` (per wanderer `n`/`o`/`a`/`d`, the hostile kinds allowed, the
  "Something's off" switch, a one-off running) every 5 s on change and on `realm:wander_ping`, and
  `realm:wander_done { player, wid, how: accepted | left | turn | camp }`. `realm:place_ready` goes out for every
  place (camps and story places, the anchors), states picked/built/set/moved/removed, also on `realm:place_ping`.
  wander_bp spawns nobody until saga's first `wander_state` (no saga, no wanderers).
- Stable API limits: light can't be read, so above ground the spot needs open sky (underground: a floor near the
  player's height); biomes can't be read, so "taiga/snow" is snow, ice, podzol or spruce around the player.
- Rival: Rook comes within 20 minutes after a `realm:quest_done` from bounty_bp or maps_bp (champion and map-leg
  positions aren't broadcast). The bounty race (kill within 300 s or half pay) is not built: Rook's chapter 2 is
  "finish 3 bounties" (with Bounty Board) or a story champion, either way. `realm:poi` is accepted as an anchor.
- Camps: one spot per wanderer, shared; a chapter that moves it mails the other players on the chain. The camp is
  taken down when its last player finishes the chain, or after `campDays` (7) unvisited; a player still on the
  chain who meets the wanderer again gets it back where they are. No `realm:waystone_register`: waystone_bp makes
  a waystone from the pre-built `Waystone:` sign on the first lodestone tap. Vesk's camp is by the watchtower (the
  Overworld). The escort copy: saga sends `realm:wander_hide` (15 s, renewed every 10 s).
- Hostiles: four spawn kinds (spy, toll, sailor, hermit) plus Rook's turned chapter (when the player picked
  "Rub it in", which adds `g:iron`, and has `g:iron` 4+). The spy drops its disguise 20 s after the first talk,
  sailor and hermit 10 s; the toll man on Refuse (or not enough Crowns). Accusing: hostile slowed (Slowness II
  5 s), +10 Wardens, `g:iron` +1; friendly: they leave, `g:w_accused` +1 (Pell and Rook mention it).
  Fights pay 40-60 Crowns, 1-2 Relic Shards, Wardens 25 (quest_done 10 + rep_add 15), 50-60 Combat XP, gossip
  kind `wander_hostile`. Party adds use saga's party mates (Parties tag, `partyShare`) within 32 blocks.
- quest_done: Strangers' requests and fights `kind: "wander"` with `guild`; chain chapters `kind: "story"` with the
  wanderer's `guild` (Guilds gives story 30 to that guild instead of sharing it).
- Journal "Wanderers" page entries come when a chain's first chapter is finished (meeting all 8).
- "!" particles: `minecraft:villager_happy` sparkles, per player, while the last talk (or a fresh meeting) had
  an offer or the chain has something waiting.
- Content v1: 8 chains, 29 chapters (Pell 4, Anwen 4, Brannoch 4 ending with Old Gnasher, Rook 3 + one of 2,
  Marigold 3, Tamsin 3, Vesk 3, Hob 3), 24 Stranger templates over the 8 archetypes, 4 hostiles, 40 first names x
  20 epithets, greetings per archetype, per wanderer and per hostile (wander_bp `scripts/lines.js`).

**As shipped (walking, wander_bp 1.1.0, October 2026):**
- Entities: `minecraft:villager_v2` for everyone but ghosts (`minecraft:allay`, still pinned to their spot) and
  Strangers who are travelers (`minecraft:wandering_trader`; its two `trader_llama`s are removed as they spawn,
  `entitySpawn` cause `Event`). Townsfolk stay `minecraft:npc`. A villager spawns with `spawnEvent:
  "minecraft:spawn_from_village"` (unskilled or nitwit, random skin, the biome's clothes; the default
  `entity_spawned` picks a random job that a later `become_<job>` can't replace), then `triggerEvent` of the
  look: pilgrim cleric, miner armorer, hermit shepherd (`become_sheperd`, sic), storm cartographer, exile
  leatherworker, rival weaponsmith, Hob toolsmith, a drowned sailor in disguise fisherman. The event lands a tick
  later; the tether loop checks the type family and triggers it again until it took. Verified on BDS 1.26.52.
- Tether every 10 ticks per walker: back to the spot (road) or the camp past 12 blocks, in water or lava, or 3+
  blocks below it for 3 s; vanilla stroll AI otherwise. Resistance V, Fire Resistance, Water Breathing re-applied
  when missing (traders drink milk at dawn), health reset to full. Zombie conversion needs a fatal hit, so none.
  Lightning still makes a witch (the damage sensor ignores resistance): the witch keeps the name tag, not our
  tags, so a `Transformed` witch or zombie villager with one of our names is removed and the wanderer comes back.
- A road wanderer whose entity vanished (trader despawn timer, lightning, `/kill`) is spawned again on its spot
  while its player is within `leaveDistance` and the spot is loaded, 5 times at most (`r`); else it has left
  (`gone`) as before. A stale copy that only unloaded is removed by `audit` when it loads. `entityDie` (villagers
  fire it) and `entityRemove` cover all four types. Villagers' picked-up items drop when they're removed.
- Taps: our `beforeEvents.playerInteractWithEntity` cancels only entities tagged `realm:npc_owner:wander_bp`
  (no trade, lead or name tag); relics_bp's Hollow Crown handler now skips `realm:npc` so it doesn't also say
  "shrinks away". The walker gets Slowness 255 while the menu is open. Simulated players' taps fire no interact
  events, so "a real villager still trades" is checked by code, not by the scenario.
- Not done: saga's escort copy of Pell (`stories/wanderers.js`) is still `minecraft:npc`; switch it with the
  next saga change. Villagers far from towns can still claim a vanilla village's bed or job site if one is within
  their tether; nothing is moved for it.
- Cost: about 0.35 ms per tether pass over 13 walkers on the test server (0.035 ms a tick on average).
  Scenario: `tools/test-bds/examples/wander-walk.js`.

**As shipped (follow-up: Rook's races, walking escorts, operator titles; October 2026):**
- Broadcasts, so wander_bp and saga can see where Rook should be: bounty_bp `realm:bounty_targets` `{ targets: [{ id,
  name, dim, x, z }], part, parts }` (today's unclaimed champion targets at their last-seen spot; on change, checked
  every 2 s, and on `realm:bounty_targets_ping`); maps_bp `realm:map_leg` `{ player, hunt, dim, x, z, leg, legs,
  final }` (chest, else marker, else planned spot; `{ gone }` at the end; on change, checked every second, and on
  `realm:map_leg_ping`). Both kept in memory by the listeners and pinged for after a load.
- Rook: archetype `rival` within 300 of a live target or the player's own last leg (no change to the roll chance,
  cooldowns, caps or named share, so he can't come more often than any other wanderer); the 20-minute after-a-quest
  rule is the fallback only while nothing is live anywhere.
- The race is a saga objective, not a new type: `race: 300` on a `defeat` with `bounty: true` (counts Bounty Board
  targets by their `realm:bounty:<id>` tag through `realm:champion_slain`; never spawns anything, excluded from plain
  kill counting) or on an `event` with `quest: { pack: "maps_bp" }` (the treasure's `realm:quest_done`). The clock
  starts when the player first comes within `radius` (300) of a target not raced yet, not at accept (a target can be
  1,200 blocks out). Saga sends `realm:bounty_rival { id, player, until }` / `realm:map_rival { player, hunt, until }`
  (`until` in ms; a second message may only shorten it, never extend). Lost: bounty_bp pays the killer
  `rewards.rivalShare` (0.5) of 100, maps_bp pays `rivalShare` (0.5) of the chest's Crowns (loot unchanged); helpers
  unchanged; the bounty itself is never blocked. Win: progress +1 and `tally` `g:rook_won` +1; loss sets `lose`
  (`rook_lost`, teased in later intros and outros). Each target or hunt is raced once per objective (12 remembered).
  The tracker points at a bounty target (the board shows it anyway), never at a treasure.
- Content: Rook ch. 2 is "Beat Rook to 3 bounty champions" (or the Brushwood Brute, unchanged); ch. 3's optional
  objective is the chest race (bonus 30); ch. 4 "Rook, Turned" now needs `g:rook_won >= 3` besides spite and
  `g:iron >= 4`. Exploits checked: the penalty only lowers pay (nothing to farm); wins need real daily targets or a
  bought map; party mates who kill a target Rook "won" get full pay (accepted: the rule is per racer).
- Escorts: saga's spawnActor copies wander_bp's trick for `minecraft:villager_v2` (spawn with
  `minecraft:spawn_from_village`, then `who.look`, re-triggered once a second until the family matches). Pell's
  escort (and the `WANDERERS` table) is a villager now, cleric, `invul: true` (NPCs were unhurtable; keeping it).
  Barnaby Pike got `minecraft:become_fisherman`; Pip already was a villager. No other escort or follow actor was an
  NPC. Movement: every 2 ticks a 0.42-block step along the crumbs (0.6 / 1 when 5 / 8 blocks behind), facing the
  way; crumbs only on the ground. Every interaction with a `saga:actor` is canceled (also leftovers not in memory).
  Lightning: the named witch is removed and the character respawned where it stood; a zombie villager counts as
  hurt. Leftovers after a restart go with the existing load sweep. Measured in the scenario: 0 steps over 1.3
  blocks, 95% of steps facing the way.
- `/realm:admin_title <title> [subtitle] [seconds] [player]` (ops, 1-25 s, default everyone online, 5 s) and the
  quick action **Show a Title** send `realm:title` per target right before `setTitle`.
- Scenarios: `rook-race.js`, `rook-map-race.js` (needs a one-leg maps copy, see its header), `saga-escort.js`,
  `admin-title.js`. A `realm:saga_debug { action: "race_expire" }` ends running races for tests.

---

## 3. Atlas of the Realm (`atlas_bp` NEW)

**Pitch:** Every stretch of land has a name and a banner when you cross into it; wayside shrines, Choir
cairns, wrecks, hermit huts and 60 Starwright tablets fill the miles between story places.

**Regions:**
- 512x512 cells on a grid from world spawn.
- The name is a deterministic hash of cell + seed + a biome guess (the Journal's block rules):
  24 adjectives (Gray, Lantern, Drowned, Brine, Hollow, Ember, Saltmarsh...) x 30 nouns by biome group
  (Reach, Downs, Fen, Spires, Barrens, Shallows, Deeps, Wolds...).
- Entering a region shows a banner through the title protocol (`realm:title`):
  `§6The Gray Downs` / `§7Region 3 - 0 of 2 sites`.

**POIs:**
- 2-4 per cell at hashed positions; validated lazily (8 nudges, else skipped for good).
- Built permanently (no snapshot) when a player first comes within 64 blocks, block by block in
  `runJob` (200 per yield).
- 16+ blocks from saga places; never within 128 of a town/claim/zone (`realm:zones`,
  `realm:claims_check`); only in loaded chunks.

| Kind | Interaction | First-find reward |
|---|---|---|
| Wayside Shrine | blessing 10 min (Luck/Speed/Regeneration by biome), daily | 10 Crowns, 30 Exploration XP |
| Starwright Tablet | read form; text gated by act | 8 Crowns, codex |
| Choir Cairn | break the bell: 3 Choir mobs | 15 Crowns, 10 Wardens rep |
| Abandoned Camp | loot barrel, rolled once per player | 10 Crowns + loot |
| Hermit Hut | wanderer home (`realm:poi`) | - |
| Sunken Wreck | chest, drowned | 15 Crowns |
| Fallen Watch Post | defend 60 s (3 waves) | 15 Crowns, 10 rep |
| Fossil Dig | mine 12 bone blocks | 12 Crowns, Mining XP |
| Starglass Pool | near past meteor impacts | Starwright Flour (`realm:ingredient_give`) |
| Fenn's Survey Marker | Mara lore | codex |

**Tablets:**
- 60 in 5 tiers of 12. Text is gated by act progress from saga
  (`realm:saga_progress {player, act}`), revealing `STORY_BIBLE.md` section 2 in order.
- Finishing an act upgrades every tablet already found (a "reread the world" moment).

**Data:**

| Key | Shape |
|---|---|
| player `atlas:p` | `{r: cells, p: POIs, t: 60-bit mask, b: blessing day}` |
| world `atlas:built:<n>` | built POIs, split |
| `atlas:cfg` | `cellSize` 512, `poiPerCell` [2,4], `buildRange` 64, `avoidRadius` 128 |

**Events:**
- Sent: `realm:quest_done {kind:"explore", guild:"wayfarers", id:"atlas:<kind>:<poi>"}`,
  `realm:journal {page:"places"}`, `realm:skill_xp`, `realm:poi {kind, dim,x,z, name}`, `realm:gossip`,
  `realm:title_unlock` (Surveyor at 10 regions, more milestones), `realm:trail_unlock` (at 25 sites).
- Read: `realm:saga_progress`, `realm:zones`, `realm:sky_event` (meteor).

**Command:** `/realm:atlas` (regions found, sites by kind, tablets x/60, codex).

**Cost per player:** every 40 ticks, cell math and a 9-cell POI distance check (no block reads);
at most 1 build at a time.

**As shipped (3, October 2026):**
- Grid: centered on world spawn as first seen (`atlas:origin` also holds a random salt: no seed API), Overworld only.
  The biome guess is made once per cell, by its first visitor (5 top blocks), and saved realm-wide, so everyone sees
  the same name; region numbers are the realm's discovery order. Banner after crossing 8 blocks in; a known region at
  most every 20 s. Player pref **Region banners**.
- Slots: one per quadrant (40-block margin), kind preference hashed (tablet 24, shrine 16, camp 12, survey 11,
  cairn 10, fossil 10, watch 9, hermit 8); deep water (6+) at the slot makes a wreck; within 300 of a recorded meteor
  impact half the land slots become pools. Center + 8 nudges of 16 blocks; unloaded ground waits (no nudge used up);
  zones/claims/places near a slot make it wait 10 min (not skipped), so removing a zone later fills the region in.
  Distances: 128 from zones and every claim (`realm:claims_check` with `player: ""`), 48 from story places/camps
  (16 was too close for 64-wide prefabs), 160 from spawn. Saved "being built" first, finished after a restart.
- Interactions: tap or hit the heart block (shrine, tablet, survey, pool, watch bell), open the container (camp
  barrel, wreck chest: loot goes to the inventory, rolled per player), break the cairn bell / 12 fossil bones (their
  drops are removed, and they come back for the next player: no bell or bone farm). "First find" is proximity (10
  blocks): pays the shrine (10 Crowns + 30 XP) and hermit; the others pay on use. Every find 10 Exploration XP.
- Bedrock has no Luck effect: shrines give Regeneration (plains, forest), Speed (high, dry) or Hero of the Village
  (wet, sea), once per Realm day (`realm:calendar`, else the world day).
- Tablets: a new tablet site gives the lowest-numbered tablet the player hasn't read, so everyone reads 1-60 in order;
  tier n+1 needs `act >= n`. Worn text = first 6 words + "after <Act>". Without saga_bp installed every tablet reads in
  full. `realm:saga_progress` is sent by saga every 5 s on change (and join, and on `realm:saga_progress_ping`); the
  reread message counts tablets that just became readable. Codex is atlas's own (/realm:atlas), not saga's.
- quest_done: `{ player, pack: "atlas_bp", id: "atlas:<kind>:<cx,cz,slot>", label, kind: "explore", guild }`,
  guild wardens (cairn, watch), miners (fossil), wayfarers (rest); 10 rep each (Guilds' `other`). **Cairn:**
  sent when its 3 keepers (2 pillagers + vindicator, named `Choir Bellkeeper`, no banners) are all dead, not on the
  bell break itself (a lost fight sends nothing; the bell comes back). Calendar: count `atlas:cairn:*`.
- realm:poi `{kind, dim, x, z, name}` for hermit, shrine, tablet, cairn, watch, camp only (wander_bp caps at 400 and
  keeps them in memory): on build and re-sent 6 s after every load, 10 a tick, at most 380.
- Gossip kinds `atlas` (milestone, place = title) and `atlas_site` (cairn silenced / post held) with lines in npc_bp.
  Trail `glyphs` (vanilla `minecraft:enchanting_table_particle`) added to titles_bp. Milestone titles: Surveyor,
  Pathfinder, Atlas-Maker (10/25/50 regions); Wayfarer of Stones, Wayfinder, Keeper of the Atlas (10/25/60 sites);
  Tablet Reader, Starwright Scholar (12/60 tablets).
- Story tie-in: optional step in Edges of the Map *Sand and Snow* (`quest: { pack: "atlas_bp", id: "atlas:*" }`,
  `edges_of_map.waymark`), 20 Crowns and a codex page.
- Content v1: 10 prefabs, 60 tablets (5 x 12), 10 Fenn notes, 24 adjectives x 30 nouns (6 groups x 5).

---

## 4. Realm Calendar: festivals and Choir sieges (`calendar_bp` NEW)

**Realm Year:**
- 96 Realm days (the dawn counter, `cal:day`; calendar_bp takes over npc_bp's counter and broadcast:
  read npc_bp's last day once through an event, then own it).
- 4 seasons of 24 days, each with a 4-day festival:

| Season | Days | Festival | Festival days |
|---|---|---|---|
| Thaw | 1-24 | Hatchling Tide (defend turtle nests at night) | 10-13 |
| High Sun | 25-48 | Midsummer Regatta (boat race, 8 checkpoints, best-time board) | 34-37 |
| Harvest | 49-72 | Lantern Fair (pumpkin carve-off with a player vote, lantern float, ghost tales) | 58-61 |
| Long Dark | 73-96 | Starwright's Long Night (gift week: affinity gifts x2, shooting star request each night, siege truce) | 82-85 |

- About 13-20 real minutes per Realm day, so a festival comes about every 5-8 hours of play and lasts
  55-80 min.

**Festivals:**
- Limits are per festival, not per day: each daily activity counts at most 3 times, Ribbons are capped
  at 15, Crowns at 250.
- Festival Ribbons: a named paper item with lore.
- A caravan Ribbon stall during the festival (`realm:caravan_extra {stock}` or calendar_bp's own
  vendor); cosmetics only: hats, titles, trails, recipe cards.
- Festival chapters are saga stories `kind: "festival"` gated on `cal:festival`, 4 per festival
  (16 total).
- Daily activities run in calendar_bp (12 total) and report `realm:quest_done {pack:"calendar_bp"}`.
- The regatta's checkpoint race is calendar_bp's own (no saga race type).

**Sieges:**
- Requirements: at least 2 non-AFK players online (or 1 who has finished Act II), night, at least
  5 Realm days since the last siege; then 35% per eligible night. The Lantern Fair doubles the chance;
  the Long Night blocks sieges.
- Target: a town from `realm:zones src:"town"` (skip towns town_bp keeps safe from world events, and
  towns with calendar_bp's own `sieges` switch off), else the lighthouse place, else world spawn.
- 3 min warning, then 3 Ritual Circles 48-96 blocks out: a 3x3 gray concrete prefab with a bell and
  4 candles, snapshot-restored afterward, avoiding claims and safe zones.
- Each circle: a Choir Singer (named vindicator) + 4-6 pillagers (no banners, so no Bad Omen); one
  reinforcement wave at 6:00; at most 24 mobs tagged `realm:siege`, removed at the end.
- A bell needs 5 hits. Timer 12 min in a side box (`left1`).
- Participants: hit a siege mob or bell, or within 96 blocks for 3+ min.
- Held: 60 Crowns, 20 Wardens rep, Combat XP; the town is Heartened for 24 h (town_bp: deliveries count
  x1.25, via `realm:town_state {town, mood, until}`).
- Failed: 15 Crowns; the town is Shaken for 24 h (gossip, Hollis's line).
- Nothing ever breaks a block.
- Atlas Choir Cairns broken realm-wide: -1 siege mob per 3 cairns (cap -6).

**Events:**
- `realm:calendar {day, season, festival?, ends?}`
- `realm:siege {state, town, result?}`
- `realm:sky_event {kind:"siege"}` (inn news, Journal)
- `realm:gossip`
- `realm:quest_done {kind:"siege", guild:"wardens"}`

**Commands:** `/realm:calendar` (menu: season, day, next festival, siege history, towns), operator
`/realm:calendar_siege`, `/realm:calendar_set <day>`.

NPC birthdays (section 2) use this calendar.

**As shipped (4, October 2026):**
- Counter handoff: on its first run calendar_bp sends `realm:calendar_ping {own:true}` (npc_bp answers that one with its
  own count even while listening), takes the day, then owns `cal:day` `{d, n}` and broadcasts `realm:calendar
  {day, doy, year, season, festival?, ends?, from:"calendar_bp"}` at dawn, 2 s after load (before npc_bp's 5 s), on
  join, on ping and every 5 min (npc_bp's 2 h listen window). With `festivals` off the broadcast names no festival.
  npc_bp keeps counting in parallel and now also takes `festival` from the owner's message. `/realm:calendar_set <day>`
  is the day of the current year (1-96); setting it back pulls the siege gap back with it.
- Towns: town_bp sends `realm:town_list {part, parts, towns:[{id,n,dim,x,y,z,safe}]}` (with its zones, and on
  `realm:town_list_ping`), since `realm:zones src:"town"` only lists protected towns. `spareSafeTowns` (default off, per
  the owner: sieges reach player towns) lets every town be besieged; circles step outside a protected town's zone with
  `escapeZones`. Enabled, protected towns are spared. Per-town switch in
  `/realm:calendar` -> Sieges (`cal:towns`). `realm:town_state {town, name, mood, until}` (ms); town_bp keeps it in
  memory, pings `realm:town_state_ping` at load, counts deliveries x1.25 when Heartened and shows the mood.
- Sieges: one roll per night once a target has a player within 192 blocks. Circles: up to 10 tries per circle 48-96
  out (open flat natural ground, nothing over it, outside zones/claims, loaded); none placed = "scattered" (no result,
  no gap reset). Ground saved with `structureManager.createFromWorld` before the first change, restored block by block
  where the block is still air, liquid or a circle block; pending restores (`cal:restore`) survive restarts and their
  boxes can't be broken or blown up. A bell counts only after its Singer dies; a silenced circle's Choir leaves.
  **Pillagers despawn instantly 32+ blocks from (simulated) players and randomly from real ones**, so each circle keeps
  a count of Chanters left (`p`, minus deaths) and respawns the missing ones while a player is within 40 blocks; all
  are named (`Choir Singer`, `Choir Chanter`). A restart mid-siege ends it "scattered" (no mood). Participants: a hit
  on a Choir mob or bell, or 3 min within 96 blocks (not AFK). Held: 60 Crowns, `realm:rep_add` 10 + quest_done
  `{kind:"siege", guild:"wardens"}` (Guilds' `other` 10), 80 Combat XP; gossip `siege` / `siege_lost` (new kind, plus
  Hollis voiced lines for both). Cairns: distinct `atlas:cairn:*` keys, up to 18 kept.
- Festivals: 12 activities (Nest Watch, Turtle Feeding, Tide Swim; Regatta, High Dive, Midsummer Picnic; Carve-off,
  Lantern Float, Ghost Tales; Starwatch, Gift Round, Candle Vigil), each `realm:quest_done {pack:"calendar_bp",
  id:"cal:<activity>", kind:"festival", guild}`. Gift Round needs a new npc_bp event `realm:npc_gift {player, npc,
  tier}`. Long Night shooting stars: one `realm:sky_request` per player per night (night_bp already honored story
  requests, so night_bp is unchanged). Long Night double gifts don't stack with a birthday. Regatta course: an
  operator's (within 32 blocks of its start) or one from where the racer is; board = this year's 10 best + realm
  record; winner title `Regatta Champion`, carve-off winner `Pumpkin Champion` (+ gossip `regatta`, `carve_off`).
- Ribbon stall: calendar_bp's own vendor (an npc offer at role `merchant`, and in `/realm:calendar`), no caravan change.
  Stock: 4 titles, 4 hats (named helmets/pumpkin), 4 recipe cards (`realm:recipe_learn`), 2 new titles_bp trails
  (`confetti` totem particle, `notes` note particle); titles, trails and cards bought are remembered (not sold twice).
- Story: saga `kind:"festival"` (one chapter each, check-stories enforces it and the `cal:festival` gate; the log says
  "come back during the Lantern Fair (Harvest, days 58-61)"). 16 chapters (`stories/festivals.js`), givers: all 12
  townsfolk (Elsie, Moss, Bram, Wren twice). 12 of them pair the activity (`event` on calendar_bp's quest_done, gated on
  `pack:calendar_bp`) with an ordinary `or` way or make it optional. Not repeatable from year to year in v1.

---

## 5. Callings and Relic Ascension (`skills_bp` + `relics_bp` UPGRADE)

**Callings:**
- At total skill level 75, the saga chapter *The Calling* (Hollis at the chapel; Moss if
  `g:hollis = lost`) lets the player choose one of 6. skills_bp owns the data; saga gates the chapter
  on a flag from skills_bp (a `realm:calling` event or a `pack:`-style live flag).

| Calling | Skills | Guild | Active (Calling Sigil item) | Passive choices |
|---|---|---|---|---|
| Delver | Mining + Combat | Miners | Echo Sense: ores glow within 8 blocks (per-player particles), 90 s | Deep Lungs / Ore Hound / Stonehide |
| Warden | Combat + Exploration | Wardens | Rally Cry: party Strength I 10 s, 120 s | Champion's Bane (+15% vs `realm:champion`) / Bulwark / Second Wind |
| Pathfinder | Exploration + Fishing | Wayfarers | Trailblaze: Speed II 20 s, 90 s | Waystone -25% / Map Sense (reveal 96 -> 128) / Seafarer |
| Hearthkeeper | Farming + Fishing | Growers | Hearth Song: party Regeneration I 8 s, 120 s | Dishes +25% / Green Thumb / Lucky Line |
| Woodwright | Woodcutting + Farming | Growers | Timberline: Haste II 15 s, 60 s | Sapling Return / Bark Armor / Builder's Eye |
| Stormcaller | Combat + Exploration | Wardens | Static: hits in rain slow foes 3 s, 100 s | Rod Reader (+1 Storm Glass) / Weathered / Eye of the Storm |

- Talent points: 1 at unlock + 1 per 10 combined levels of the two skills above 50 combined, up to 10.
- Tree: 3 tiers x 3 talents, ranks 1-2 (15 ranks total), so 10 of 15 forces choices. Tier 2 needs
  3 points in tier 1; the tier 3 capstone (1 of 3) needs 7.
- Switching:
  - The first choice is free.
  - Moving talent points within the same Calling costs 50 Crowns.
  - Switching Calling costs 100, 200, 300, 400, 500 Crowns (cap 500), at least 3 Realm days apart.
  - Switches happen at the priest role (Hollis) or Moss.
- Effects use stable APIs only: `addEffect`; `spawnItem` on break; `entityHurt` -> `applyDamage` with
  a re-entry guard; discounts go out via `realm:calling {player, calling, talents}` (waystone_bp,
  maps_bp, cooking_bp, build_bp, fishing_bp, storm_bp cache it).
- Effect amplifiers don't stack with guild perks: the higher one wins.
- Guilds' rank-5 titles become `Miners' Guildmaster` and so on, ending the "Master Miner" clash
  with Skills.

**Relic Ascension at Ida** (relicsmith):

| Stage | Shards/Essence | Storm Glass | Crowns | Effect |
|---|---|---|---|---|
| +1 Awakened | 6 | 1 | 60 | -20% cooldown or +25% range/duration |
| +2 Ascended | 12 | 3 | 150 | -35% / +50%, adds a lore line |
| +3 Starlit | 20 | 5 | 400 | -50% / +75%, a unique bonus, gold name |

- Duplicate relics break into 4 Relic Essence (`relics:essence`).
- Story relics stop at +1 until a story or affinity condition (Hal's Compass +3 needs Tobin at
  Confidant or the Gull heart story).
- Stored as item property `relic:asc`.
- Sets (checked every 20 ticks, armor + hotbar):
  - Storm (Storm Staff + Storm Meter + Rain Charm): lightning immunity, +1 Storm Glass per rod.
  - Tide (Tide Boots + Hal's Compass + Compass of Echoes): Dolphin's Grace.
  - Deep (Miner's Lamp + Lantern of the Deep + Lantern Shard): Night Vision below y 0, quiet sneaking.
  - Sun (Sun Pendant + Frost Band + Wayfarer Boots): fire and freeze resistance at dawn and dusk.
- Sink: about 646 shards and 10,370 Crowns for all 17 relics at +3.
- Expedition leaderboards show each player's Calling.

**As shipped (5, October 2026):**
- Talent points: 1 + 1 per **5** combined levels of the two skills above 50 (`callings.pointsEvery`), up to 10. With 1 per 10
  the most was 6 and the 7-point capstone could never open. Tiers 1 and 2 have two ranks, the capstone one (one of three):
  15 ranks, 13 spendable, 10 points. The table's three "passive choices" are each Calling's capstones; tiers 1 and 2 are
  new (an XP talent, a perk-chance or guard talent, the active's duration and cooldown, a held effect or damage talent).
- Code: skills_bp `scripts/calling.js` (one player property `skills:calling` `{ c, t, n, d, w, cd }`; the Sigil's cooldown
  is saved there, so leaving doesn't reset it). Sigil: `minecraft:music_disc_ward` with item property `skills:sigil`, kept
  on death, canceled out of jukeboxes, works with the holder's own Calling. Static needs rain (no cooldown spent without);
  rain is tracked like the other packs (`skills:weather`).
- `realm:calling { player, name, calling, label, talents, bonus, ready, from }`: `bonus` carries the numbers consumers use
  (`waystoneOff` 25, `mapReveal` 128, `dishPct` 25, `luckyLine` 50, `buildEye` 25, `rodGlass` 1) so none redoes the
  tree; `realm:calling_ping` (debounced to once a second). Consumers: waystone_bp, maps_bp (at most 160), cooking_bp,
  fishing_bp (Lucky Line: +50% weight on rare/epic/legendary), build_bp (survival `maxBlocks`), storm_bp, expedition_bp
  (leaderboards, names saved in `expedition:callings`, 300 max).
- Saga: `g:calling_ready` and `g:calling` (id or `none`) saved from realm:calling (check-stories knows both). *The Calling*
  (`stories/calling.js`): one story, two chapters by `g:hollis` (Hollis's *The Chapel Book*, Moss's *The Gravedigger's
  Book*), an `event` on `skills:calling:*` or (chosen before accepting) a talk; the outro answers `g:calling`; `g:called`
  keeps the other chapter from opening later. The choice itself is in skills_bp's menu, offered at roles `priest` (or
  `gravedigger` when npc_flags says `g:hollis = lost`); without npc_bp (no `help_pong`) it works anywhere, and
  `callings.chooseAnywhere` allows that too. Respec works anywhere; switching only at Hollis/Moss. The switching gap is
  measured in `realm:calendar` days (game days without a calendar).
- Damage talents take the bonus off health directly (no new hit); a bonus that would leave under 1 health sets 1 and
  finishes with one guarded `applyDamage` 11 ticks later (a weaker hit inside the invulnerability frames did nothing), so
  the kill counts. Guards refund after the hit, at most 60% from all talents. Guild perks and skill perks now skip an
  effect the player has stronger or longer (higher wins).
- Relics: ascension kinds per relic (`cd` for the five with cooldowns, `boost` for Frost Band, Keeper's Lamp, Choir Mask,
  Fen Charm, `linger` 10/20/30 s for the other passives), a +2 flavor line, 17 Starlit bonuses (PACKS.md table). Costs per
  the design table, Essence spent before shards, Ida's friend discount on shards; the relic is found again by
  `relic:serial` after the confirm form. Relic Essence is `minecraft:echo_shard` named `Relic Essence` (lore-checked,
  like shards). Story gates: Hal's Compass Tobin or `g:gull` (added to saga's npc_flags), Lantern Shard Mara or
  `fin:act4_seals`, Choir Mask Reyes or `fin:act5_lantern`, Fen Charm Moss or `g:vesna = free`, Singing Blade Ida, Hollow
  Crown Quill, Keeper's Lamp Elsie (Confidant).
- Sets: Bedrock has no Dolphin's Grace, so Tide gives Conduit Power in water; Deep's "quiet sneaking" is vanilla already
  (sneaking doesn't trip sculk), so it removes Darkness below y 0. Storm also refunds the fire a bolt starts. Sets go out as
  `realm:relic_sets { player, sets }` (+ `_ping`); storm_bp adds 1 glass for `storm` (and Rod Reader's 1, at most 3 extra
  together).
- Gossip kinds `calling` and `relic_starlit` with generic lines plus Hollis, Moss (calling) and Ida (Starlit) voices.
  Guilds' top title is `topTitle` "{guild}master"; every reached title is re-sent 11 s after join.
- Tests: `tools/test-bds/examples/skills-calling.js`, `relics-ascension.js`. A simulated player gets a new id on restart,
  so the Calling's persistence across a restart can't be tested there (relic stages are, through a chest).

---

## Minimap (as shipped, `map_bp` 1.0.0 + Side HUD 1.2.0, October 2026)

- What was asked: region names, a destination marker, NPCs, the player and their heading, and red dots for mobs.
  Scripts can't draw on the HUD or on map items, so it's three parts: Bedrock's own locator map for the land
  (`/realm:map` gives "Mara's Field Map", `give @s minecraft:empty_map 1 2` then named; held in the offhand), a
  compass strip at the top center, and an optional 7 x 7 radar above the left side boxes.
- Icons: a glyph font page in Side HUD (`font/glyph_F3.png`, U+F300-U+F3FF, Private Use Area, away from E0-E9
  that Mojang and add-ons use), 55 colored glyphs drawn edge to edge (a baseline or a dark square) so they line
  up as cells, generated with the names file `map_bp/scripts/glyphs.js` by `tools/gen-glyphs/gen.mjs`
  (`--check` in `npm run check`). The only exception to the ASCII rule: private-use characters, only in that
  file (check-ascii also refuses ``-`` escapes elsewhere), only in the map's HUD strings.
- Transport: the side boxes protocol grew two slots players can't pick (`top`, `radar`; 11 segments, 1769
  bytes) and parts (`from` `map/radar`), so one pack holds two slots; `show(..., part, false)` + `redraw`
  draws once. Every copy of `side.js` was synced (6 packs bumped). Strip: 25 cells of 5 degrees (60 each side),
  75 bytes, plus a second line (destination and region) within the rest of the 159 bytes. Radar: 49 cells, 153
  bytes.
- Broadcasts added where the data lives (each under 2048 characters, lists in parts, each with a ping):
  `realm:npc_places` (npc_bp), `realm:waystones_known` (waystone_bp), `realm:atlas_region`, `realm:atlas_sites`,
  `realm:atlas_site` (atlas_bp), `realm:death_point` (death_bp), `realm:track` (saga_bp: the tracker's target,
  with `npc` for a townsfolk to talk to; computed every 2 s for every player with a story, shown or not). Saga's
  `realm:place_ready` for camps carries `label`. Parties needed nothing (the `realm_party:` tag); wanderers
  needed nothing: road wanderers show only after a non-hostile `realm:wander_spawn`, camps always.
- Not done: no drawn terrain; no story places other than camps on the strip; JSON UI layout and glyph size
  unseen in a client (BDS draws no HUD); the locator map's data value can't be read back by scripts.
- Cost: 0.39 ms per player pass (10 players, strip and radar on, 24 mobs; includes the test harness's title
  relay), 0.25-0.3 ms without the title. Scenario: `tools/test-bds/examples/map.js`.
