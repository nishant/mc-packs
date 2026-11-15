# NPC and world systems outside the story pack: research findings

Scope: `npc_bp`, `town_bp`, `wander_bp`, `caravan_bp`, `guilds_bp`, `bounty_bp`, `calendar_bp`, `atlas_bp`, `elite_bp`,
`crowns_bp`, the shared modules (`tools/gossip-shared.js`, `name-labels-shared.js`, `tether-shared.js`, `spawn-shared.js`)
and the bridges into `saga_bp` (read only where they touch the world packs). Read-only: nothing was edited, built or run.

Every claim is marked **V** (verified by reading the code at the lines given) or **S** (suspected: needs a client or BDS
check). Paths are relative to `/home/user/mc-packs`. "main.js" always means `packs/<pack>/scripts/main.js`.

Contents: 1 NPC world map, 2 bugs (NPC-01...), 3 rejoin and group proposals with protocols and copy, 4 simplification,
5 QoL list, 6 tests, 7 risks and open questions.

---

## 1. Map of the NPC world

### 1.1 Every kind of NPC entity

| Kind | Entity type | Owner, tags | Spawned | Persisted | Name label | Position keeping | After a reload | Protection | A tap does |
|---|---|---|---|---|---|---|---|---|---|
| **Townsfolk** (12 fixed: mara, tobin, reyes, elsie, bram, quill, ida, sol, hollis, moss, wren, bea) | `minecraft:npc` | `npc_bp`. Tags `realm:npc`, `realm:npc_owner:npc_bp`, `realm:npc_id:<id>`, `realm:npc_role:<role>` (npc main.js:48-55, 586-596) | By an operator: `/realm:npc_add <id>`, `/realm:npc_houses`, or `realm:npc_summon` (main.js:1801, 2250, 2585) | World property `npc:list` (post, yaw, entity id `eid`, `orig` when the floor went); skin as structure `realm_npc:<id>` (main.js:44, 1908-1996) | Helper entity `realm:npc_label` at head + 0.4, native name `§r`; synced every 10 ticks; resend 1 s and 3 s after a viewer comes within 20 blocks (main.js:60-68, 617-640; name-labels-shared.js) | Never walks. Loop every 10 ticks: > 1.5 blocks from post = teleported back, with a snap guard (40 to 600 ticks), fall watch, post moved down when its floor is gone, lifted when a block was laid into it (main.js:834-908) | `auditAll` at world load and every 60 s; `entityLoad` audit: unknown or duplicate removed, an unsaved copy adopted (main.js:664-723). Missing with a player within 24 blocks for 6 s: found by tags or spawned again, from the saved skin when there is one (main.js:742-765) | Vanilla NPC: cannot be hurt in survival. `/kill` = respawn in about 6 s (main.js:725-735). Cleanup pack removes items only. Land Claims skips `realm:npc` (claims main.js:69, 226) | `beforeEvents.playerInteractWithEntity`, canceled. Sneak + creative + operator = the game's NPC editor. Sneak-tap with an item = gift, at once (see NPC-01). Else the offer round: `realm:npc_talk` to every pack, 4 ticks, a menu of `realm:npc_offer` buttons, the pick goes out as `realm:npc_choose` (main.js:1021-1147) |
| **Town mayors** (one per town; Bram is the first town's) | `minecraft:npc` | `npc_bp` owns the entity, id `mayor:<town id>`, role `mayor` only; `town_bp` asks for it | `realm:npc_mayor {op:"set"}` when a town is added, and again every 30 s while a player is in a town whose mayor is not placed (town main.js:3251-3274; npc main.js:2622-2669) | `npc:mayors` (name, town) plus a row in `npc:list`; the town keeps `m`, `mn` | Same helper; title `of <Town>` | Same as townsfolk; placed on the nearest standable spot within 3 of the town center | Same audit; `realm:npc_mayors` (full list at load) removes mayors of deleted towns (npc main.js:2712-2720) | Same | Offer round. Offers "Town projects (<Town>)" for its own town anywhere; no affinity, gifts or stories (npc main.js:1072-1073; town main.js:3408-3439) |
| **Town residents** | `minecraft:villager_v2` (town_bp's own copy of the vanilla file adds group `realm:town_resident`: no bed, job or bell claims, home radius 16) | `town_bp`. Tags `realm:resident`, `town:r:<town>`, `town:rid:<town>.<n>`; property `realm:resident` | By the census (every 30 s per town, only while a player is in it; at most 2 spawns per census): 2 at the well, then a family per house the town built itself (main.js:3668-3792) | World property `town:r:<town>` (slot, name, home, entity id, death time) | Vanilla name tag (first name), no helper | Vanilla AI inside the home restriction; a stray past 32 blocks is teleported home only while no player is within 16 (main.js:3692-3710) | The census reconciles by tag; a removed town's residents "move away" when their chunk loads (`town:gone`, main.js:3794-3848) | None: they can die. A dead one is replaced after 20 in-game minutes (main.js:3851-3870). Not tagged `realm:npc`. No handling of a resident turned into a witch or zombie villager (NPC-03) | Canceled (unless `residentsTrade`). One gray chat line at most every 10 s: "<Name> lives in <Town> and doesn't trade." (main.js:3873-3895) |
| **Pen animals** | 2 sheep, 2 chickens per garden pen | `town_bp` | With the garden's pen (townLife) | Progress `an`, `k` | none | Fenced | Vanished ones spawned again, killed ones never (life.js:243-259) | none | vanilla |
| **Recurring Wanderers** (8, on the road and at camps) and **Strangers** | `minecraft:villager_v2`, `minecraft:wandering_trader` (travelers), `minecraft:allay` (ghosts); legacy `minecraft:npc` | `wander_bp` owns entity and menu; `saga_bp` owns every quest. Tags `realm:npc`, `realm:npc_owner:wander_bp`, `realm:npc_id:w_<wid>`, `wander:k:<wid>` (road) or `wander:c:<wid>` (camp) (wander main.js:38-46, 689-710) | Road: one roll a minute per eligible player (7 percent), 24 to 40 blocks ahead in the view direction, far from spawn (300), zones, towns and claims (160) and other wanderers (256) (main.js:321-339, 475-519, 558-632). Camp: while a player on that chain is within 48 blocks (main.js:1040-1080) | `wander:live`, `wander:camps` (world); `wander:p` (player cooldowns) | Helper `realm:wander_label`, synced every 2 ticks; native name carries a hidden format-code marker so a transformed copy is recognized (main.js:713-715, 1295-1314) | Walkers stroll; tether steers past 3 (camp) or 6 (road) blocks, teleports only past 12, in water, lava or a hole (tether-shared.js; main.js:963-1004). Ghosts are pinned | `sweep` at load and every 10 s: an entity matching no record is removed, a match is adopted (main.js:1339-1387). **Road wanderers do not survive a restart or their player logging out** (NPC-05) | Resistance V, fire resistance, water breathing, health reset every 5 s; invisibility canceled; a witch or zombie villager made from one is removed (main.js:657-682, 1318-1336) | Canceled; offer round with `npc: "w_<wid>"`, roles `["wanderer", "w_<wid>"]`. A non-owner sees "<Name> is waiting for someone else." (main.js:1130-1200, NPC-04) |
| **Caravan traders** (3) and **llamas** (2) | `minecraft:npc`; `minecraft:trader_llama` or `minecraft:llama` | `caravan_bp`. Tags `realm:caravan`, `realm:caravan_v:<visit>`, `realm:caravan_trader:<i>`, `realm:npc`, `realm:npc_owner:caravan_bp`; llamas `realm:caravan_llama` (caravan main.js:35-43) | On the schedule (default every 7 real days, Saturday 18:00 UTC, 40 real minutes) at a random operator spot, else world spawn (main.js:400-442, 787-809) | `caravan:visit` (stock, trader entity ids, spot), `caravan:spots`, `caravan:last` | Helper `realm:caravan_label` | Traders put back past 1.5 blocks (snap guard); llamas tethered 5 soft, 10 hard (main.js:672-762) | Audit removes anything not of the current visit and duplicate traders; a visit that ended while offline departs quietly (main.js:556-578, 812-820) | NPCs cannot be hurt; llamas can | Canceled. **Not** the offer round: its own shop form (buy, sell back) (main.js:882-951) |
| **Champions** | zombie, husk, drowned, zombie villager, skeleton, stray, spider, creeper, witch | `elite_bp`. Tag `realm:champion`, trait tag, optional request tag | 2.5 percent of natural night spawns in the Overworld (converted a tick later), or on `realm:champion_spawn` from Bounty Board, Story, Expeditions, the Deck (elite main.js:482-567, 1497-1512) | Dynamic properties on the entity; nothing in the world | Vanilla name tag with a colored badge | Vanilla AI; an "approach" helper walks it toward players and stays out of zones (main.js:1026-1030) | `entityLoad` re-registers; may despawn far from players (main.js:446) | none (they are the fight) | none |
| **Bounty targets** | a champion (above) with tag `realm:bounty:<day>_<i>` | `bounty_bp` asks `elite_bp` | When a player comes within 64 blocks of the spot (300 to 1,200 blocks from the main board), after a build scan (bounty main.js:472-594) | `bounty:day` (the day's list, last seen spot) | champion name | follows the mob, re-spawned when gone | `sweep` every 10 s removes targets of earlier days or claimed ones (main.js:597-609) | none | none |
| **Choir Singers, Chanters** (sieges), **Nest Watch mobs** | pillagers and others | `calendar_bp`. Tags `realm:siege`, `realm:siege_<id>`, `realm:siege_c<i>`, `realm:siege_singer` | When the circles rise (3 circles, 4 to 6 pillagers each, at most 24 mobs) (calendar main.js:1526-1558) | `cal:siege` | vanilla name tag ("Choir Singer") | none | A siege running at a restart ends "scattered": mobs removed, circles restored; leftovers go on `entityLoad` (main.js:1855-1860, 1920-1927) | none | none |
| **Atlas fight mobs** | pillager, vindicator, drowned | `atlas_bp`. Tags `atlas:mob`, `atlas:f:<fight>` | Breaking a cairn bell, holding a watch post, looting a wreck (atlas main.js:1428-1462) | none (fights are memory) | "Choir Bellkeeper" | none | swept on `entityLoad` (main.js:1581-1591) | none | none |
| **Story actors** (other agent's area) | villagers and others | `saga_bp`, tag `saga:actor`, helper `realm:saga_label` | by story steps | saga data | helper | saga's own anchor tether | saga | saga | `saga_bp/objectives.js:1584` cancels and runs "meet" taps |

Entity budget when everything is at its cap, one town, a caravan in, a siege on: 12 townsfolk + 1 mayor + 14 helpers, 20
residents (world cap, `residentCapWorld`) + 4 pen animals, 13 wanderers (`maxEntities`) + helpers, 3 traders + 2 llamas +
3 helpers, 24 siege mobs, up to 8 natural champions for 10 players (`maxAlivePerPlayer` 0.8), 2 bounty targets, up to 6
Atlas fights of 3 mobs: about 120 scripted entities on top of story actors. Nothing here ticks per entity per tick except
the label syncs and the tethers; **V** (caps read from each config.js).

### 1.2 Where they live: what a town is

- **V** A town is an operator's record, not a detected village: `/realm:town_add <name>` or **Add a town here** in
  `/realm:town` saves `{ id, n, dim, x, y, z, lvl, spots, ... }` at the operator's feet (town main.js:1370-1421).
  `townRadius` (96) is its reach; towns must be 48 blocks apart. With `autoSpots` the town picks build spots on natural
  ground itself, asking Land Claims, and keeping away from townsfolk posts (`realm:npc_places`) and story places
  (`realm:place_ready`).
- **V** Towns are broadcast two ways: as a safe zone (`realm:zones`, source town_bp, only while **Protect from world
  events** is on) and as `realm:town_list { id, n, dim, x, y, z, safe }` (town main.js:1865-1898). The Minimap, Realm
  Calendar and Land Claims read these. Neither carries the radius.
- **V** The twelve townsfolk are **not tied to a town**. Each has one post wherever an operator put it. Only mayors know
  their town. `npc_bp` has no idea which town Elsie stands in. Anything that wants "the townsfolk of this town" has to
  work it out from `realm:npc_places` and `realm:town_list` (nearest town within about 128 blocks).
- **V** A level 1 town project is the **Notice Board** (32 planks, 3 signs): three waxed wall signs that the town rewrites
  with its name and level, "Projects done n of m / Residents / See /realm:town", and the newest families or top
  contributors (town main.js:1043-1072; life.js:234-241). Tapping the signs does nothing. A level 4 project is the
  **Bell Tower** ("A bell to call the whole town together", config.js projects). Both are natural anchors for section 3.
- **V** Bounty boards are lecterns an operator registers (`/realm:bounty_board`); the first is the "main board" champion
  targets are measured from (bounty main.js:165-201).
- **V** Wanderer camps are story places (`camp:<wid>`) that `saga_bp` builds and reports with `realm:place_ready`; the
  wanderer pack only stands the NPC there.

### 1.3 Communication that exists today

**The offer round** (**V**, npc main.js:1086-1147): every pack that has something for an NPC's roles answers
`realm:npc_talk` within 4 ticks. What answers today:

| Role (townsfolk) | Offers | Pack, line |
|---|---|---|
| any NPC id | story chapters to start, report or look at; "Answer:" riddles; "Daily favor"; a Stranger's "Request:" | saga main.js:354, ui.js:222-290 (order 20 to 25) |
| merchant (Quill) | Market; Festival Ribbon stall (festivals only) | crowns main.js:698; calendar main.js:2169 |
| chef (Bea) | Kitchen | cooking main.js:1357 |
| fisher (Tobin) | Sell fish; Fish records | fishing main.js:1364-1365 |
| cartographer (Mara) | Buy a treasure map; Your treasure hunt | maps main.js:1272-1274 |
| innkeeper (Elsie) | Rent a bed; Hear the news | waystone main.js:982-983 |
| guildmaster (Reyes) | Guild hall | guilds main.js:323 |
| warden (Reyes) | Bounties | bounty main.js:900 |
| mayor | Town projects (<Town>) | town main.js:3429 |
| relicsmith (Ida) | Relic forge | relics main.js:1921 |
| skymage (Sol) | Forecast | weather main.js:532 |
| priest or gravedigger | Choose a Calling / Your Calling | skills calling.js:1110 |
| npc_bp itself | Give <item>, Ask about..., Who lives here?, Goodbye | npc main.js:1098-1113 |

Important consequence (**V**, saga ui.js:222-243): a story offer shows **only at the chapter's own starter or ender**.
At every other townsfolk the menu says nothing about the story. Nobody in town can tell you who is waiting for you.

**Gossip** (**V**):
- Producers call a per-pack gate `createGossip` (tools/gossip-shared.js:18-30): one piece per pack per 1,000 game ticks,
  each key once (64 keys, process memory), anything else dropped.
- Kinds and senders: `champion` (elite main.js:1354), `bounty` (bounty main.js:773), `guild_master` (guilds main.js:184),
  `town_project` and `town_life` with `from: <mayor id>` (town main.js:446, 2702), `atlas`, `atlas_site` (atlas
  main.js:1515, 1612), `caravan` (caravan main.js:440), `siege`, `siege_lost`, `regatta`, `carve_off` (calendar
  main.js:1833), `act`, `wander_chain`, `wander_hostile` (saga ui.js:70, 931), plus fishing, expeditions, relics, skills,
  goals, milestones, meteor, tornado, storm, blood moon, treasure.
- The only listener is `npc_bp` (`hearGossip`, main.js:1509-1536): keeps 24 pieces, 4 per kind, for **48 real hours**
  (`Date.now()`, main.js:1497-1500).
- It reaches a player in exactly one way: when they tap a townsfolk there is a 25 percent chance (`gossipChance`) the
  greeting is the newest piece they have not heard (main.js:1557-1580). Told once per player (`npc:heard`).
- It is realm-wide, not per town. `from` only restricts who may tell it (a mayor's town news).

**A second, separate news memory** (**V**, waystone main.js:832-883): the inn's **Hear the news** lists the last
`newsKept` `realm:sky_event` messages (meteor, caravan, siege, storms) with "2h ago" and a direction. It does not see
gossip, and gossip does not see it.

**Story state exposed to other packs** (**V**, saga main.js:154-237, ui.js:1332-1349):
- `realm:npc_flags { player, flags }`: about 40 chosen flags (`g:ending`, `g:hollis`, `fin:<story>`, a few story
  choices). npc_bp uses them for cold or warm greetings and the `REACTIONS` lines (35 percent chance; hearth.js:611+).
- `realm:saga_progress { player, act }` (0 to 5): Atlas tablets and the siege rule read it.
- `realm:track { player, label, dim?, x?, z?, npc? }`: the tracker's target for the Minimap. Sent only for an **active**
  chapter. When nothing is active (the next chapter waits at a giver) there is no target.
- `realm:wander_state`, `realm:place_ready`, `realm:quest_done`, `realm:rep_add`, `realm:calendar` (festival chapters).
- Not exposed: the title of the current chapter, the next step in words, who offers the next chapter, the party's state.

**Reputation and affinity** (**V**): Townsfolk affinity is per player per townsfolk (`npc:aff`), from the first talk of a
real UTC day (+5), one gift per real day, favors (+15) and chapters (+20) (npc config.js; main.js:1357-1365, 2540-2548).
`realm:affinity` carries levels and friend discounts to Crowns, Kitchen, Waystones, Maps, Relics, Fishing, and to saga
as `g:aff_<npc>` (heart stories at Close). Guild reputation is four scoreboards fed by `realm:quest_done` from every
quest-like pack and by `realm:rep_add` (guilds main.js:256-284).

**Crowns** (**V**): the `crowns` scoreboard, written directly by every pack that pays or charges; `crowns_bp` adds the
balance, pay, daily bonus and the Market at Quill. No pack needs `crowns_bp` to pay.

**The calendar** (**V**): Realm Calendar counts in-game dawns (`realm:calendar { day, doy, year, season, festival?, ends? }`),
taking over from npc_bp's own counter. Festival chapters in `saga_bp/scripts/stories/festivals.js` are offered only
while `cal:festival` matches; each counts festival activities from `realm:quest_done` with `pack: "calendar_bp"`.

**Clocks do not agree** (**V**): Realm days are in-game dawns, but daily quests (`quests_bp` config.js:6), bounties
(`bounty_bp` config.js `resetHourUtc: 0`), favors (saga data.js:140) and the townsfolk talk and gift limits (npc
main.js:1172) all turn over at **00:00 UTC**, which is 6 or 7 pm US Central. The caravan is weekly in real time, and
gossip lives 48 real hours. For a realm people visit some evenings, three of these work against them (NPC-02, 06, 07).

---

## 2. Jank and bugs

Severity is for this realm (10 players at most, groups of 2 to 4, evenings, weeks away).

| Id | Sev | One line |
|---|---|---|
| NPC-01 | High | A sneak-tap on a townsfolk gives away the held item at once, tools and weapons included |
| NPC-02 | High | 00:00 UTC resets land mid-evening: the bounty champion you are fighting is removed, cull progress wiped |
| NPC-03 | Medium | A resident turned into a witch or zombie villager keeps its name and stays forever |
| NPC-04 | Medium | A wanderer belongs to one player: party mates get "waiting for someone else" and are locked out of their own |
| NPC-05 | Medium | Road wanderers vanish on any restart or when their player logs out, also after a job was accepted |
| NPC-06 | Medium | Gossip dies after 48 real hours and is a 25 percent greeting: a returning player hears nothing |
| NPC-07 | Medium | Default caravan: Saturday 18:00 UTC, 40 minutes, skipped unless someone joins within 24 hours |
| NPC-08 | Medium | Caravan with no operator spot stands on whatever tops world spawn (sea bed, roof, tree), traders stacked |
| NPC-09 | Medium-low | Champions and bounty targets ignore towns, claims and safe zones when they appear |
| NPC-10 | Low-med (S) | Tapping an NPC while holding the Realm menu star may open both menus, the NPC's late |
| NPC-11 | Low | A menu that hit "busy" retries for 20 s with taps blocked, then opens wherever the player is |
| NPC-12 | Low | Residents answer one gray line, then ignore taps for 10 s |
| NPC-13 | Low | A rented bed's respawn point is the innkeeper's own block |
| NPC-14 | Low | Two players talking to one walking wanderer: the first to close lets it walk off |
| NPC-15 | Low (S) | Wanderers appear in plain view 24 to 40 blocks ahead, and can land on an unclaimed build |
| NPC-16 | Low | Atlas tablets react on after-events: a held block is placed against the tablet as it opens |
| NPC-17 | Low | A piece of gossip is marked heard before the menu that tells it is shown |
| NPC-18 | Info | One returning player past Act II can draw a siege alone on the first night back |
| NPC-19 | Low | Mayor town news and the inn's news are two memories with different contents |
| NPC-20 | Low (S) | A walking wanderer's label is moved every 2 ticks and can trail the head |

### NPC-01 (High, V): sneak-tap gives the held item away with no question

- Where: npc main.js:1040 (`gift = player.isSneaking`), 1082-1085 (gift path before the menu), 1398-1408
  (`giftInHand`: only a custom name or lore protects an item), 1425-1454 (`giveGift` removes 1; for a single item the
  slot is cleared).
- Player sees: they sneak (out of habit, or because the stash pack teaches sneak-tapping) and tap Elsie holding an
  unnamed enchanted diamond pickaxe. Chat: `Elsie: "Thank you." (Diamond Pickaxe: +5; Stranger (10/100))`. The pickaxe
  is gone. Same for a totem, an elytra, a stack's top item, or a plain item a story step asked them to bring.
- Cause: the shortcut skips the menu, and "can be a gift" means "has no name and no lore". Enchantments, durability and
  stack size are not looked at. It works once per townsfolk per real day, so 12 losses a day are possible.
- Sure: high (read end to end; docs/PACKS.md line 2179 documents the shortcut as intended).
- Fix: (a) the sneak shortcut only gives at once when the item is in that townsfolk's `loved` or `liked` list
  (hearth.js `gifts`); (b) for anything else open a two-button confirm ("Give Elsie your Diamond Pickaxe? It takes 1.");
  (c) never offer or take an item with `maxAmount === 1`, any enchantment (`minecraft:enchantable`) or a durability
  component, in the menu's **Give** button either. About 25 lines in `giftInHand` and `tapped`.
- Test: extend `tools/test-bds/examples/npc-hearth.js`: sneak-tap (`realm:npc_debug` with `sneak: true`) holding an
  unnamed iron pickaxe leaves the pickaxe and opens a form; holding a loved item gives at once.

### NPC-02 (High, V): the UTC midnight reset hits the middle of an evening

- Where: bounty config.js `resetHourUtc: 0`; main.js:82 (`today`), 348-352 (`ensureDay` rolls when the day changed),
  317-334 (`roll` replaces the list), 597-609 and 706-708 (`sweep` every 10 s removes every loaded champion whose tag is
  not in today's list). Same clock: quests config.js:6, saga data.js:140 (favors, fixed, no setting), npc main.js:1172.
- Player sees: at 6 pm (winter) or 7 pm (summer) Central, mid-fight, the named bounty champion disappears; the cull at
  38 of 40 is replaced by a new list; "New bounties are posted". Favors and daily quests flip at the same minute.
- Sure: high for the code path; the live `resetHourUtc` may have been changed in `/realm:config` (it is a setting for
  bounties and quests, not for favors or townsfolk days).
- Fix: (1) default `resetHourUtc` 10 for bounties and quests (4 or 5 am Central), and give saga's `today()` and npc_bp's
  `utcDay()` the same offset through one shared setting name so all four agree; (2) in `sweep`, keep an old target
  while a player is within 96 blocks of it (it is claimed at yesterday's reward or removed when everyone leaves);
  (3) tell players 10 minutes ahead only if a champion target is spawned or a cull is past half.
- Test: unit test for the grace rule (pure function `keepOld(target, players)`); BDS: `bounty-news.js` style scenario
  that moves the day (the scenario already has a debug path for the day) with a player next to a spawned target.

### NPC-03 (Medium, V for the missing handler, S for how often): transformed residents

- Where: town main.js:3594-3640 (resident named with `nameTag`), 3851-3870 (only `entityDie` marks a family for
  replacement); there is no `entitySpawn` handler for cause `Transformed` anywhere in `packs/town_bp/scripts` (grep).
  The wanderer pack has exactly that handler because "a transformed mob copies the name tag and loses script tags"
  (wander main.js:1289-1336; name-labels-shared.js:17-19).
- Player sees: after a thunderstorm or a zombie night, a witch or zombie villager named "Agnes" walks the town. Named
  mobs never despawn, so it stays, and a zombie villager makes more of them out of other residents. The census finds
  the resident gone and a new family moves in next to it.
- Sure: high that nothing handles it; medium that it happens often (the bell tower has a lightning rod, towns are lit
  by 12 lantern posts at most, and storm packs add lightning).
- Fix: copy the wanderer pattern. Give each resident a hidden marker in its name tag (`encodeHiddenMarker("7a",
  ridTag)` appended; it is invisible), subscribe `entitySpawn`, and for cause `Transformed` with a matching marker (or
  a name equal to a living resident's within the town radius) remove the mob and set that resident's `d` (replacement
  time). `tools/sync-labels.mjs` would then copy `name-labels.js` into town_bp for the marker helpers, or the two small
  functions are added to a new shared module.
- Test: BDS scenario `town-resident-turned.js`: `/summon lightning_bolt` on a resident; after 2 s no witch with that
  name exists and `town_test dump` shows the slot waiting for a family.

### NPC-04 (Medium, V): wanderers are single-player

- Where: wander main.js:568 (one live wanderer per owner), 619 (`o: player.id`), 629 (only the owner is told), 337 and
  352 (anyone within 256 blocks of a live wanderer is not eligible for their own), 1150 and 1174 (a non-owner sees
  "waiting for someone else" and gets no offers because saga's `wanderOffer` only answers for the owner, saga
  ui.js:291-306).
- Player sees: three friends ride out together. One gets "Someone is on the road ahead". The other two see a villager
  with a name, tap it and are told it waits for someone else; they also never get a wanderer of their own while they
  travel together.
- Fix (wander side, about 30 lines): at spawn, collect the owner's party mates within 64 blocks (players sharing a
  `realm_party:<code>` tag) into `rec.m`; send the road message to them too ("...for Nish's party"); treat them as
  `mine` for the greeting; add `mates: [ids]` to `realm:wander_spawn`. The story side decides what a mate may do (join
  the owner's request, share credit); with no change there, mates at least see "Nish is talking to them: stay close,
  the job counts for the party" instead of the cold line.

### NPC-05 (Medium, V): road wanderers do not survive a restart or a relog

- Where: wander main.js:1011-1016: every second, a live record whose entity is not loaded calls `again(rec)`, which
  returns nothing when the owner is offline (936-939), and then `leave(rec.w, "gone")`. After a world load nobody is
  online yet, so every road wanderer is dropped in the first second. Also 1025-1031: owner offline for 60 s = "far".
- Player sees: they accept a Stranger's request ("stays 30 minutes"), the Realm restarts or they relog, and the
  Stranger is gone. Saga then either finishes the job "without them" or ends it (saga wander.js:96-108), but
  `onWanderGone` does nothing for an offline player (wander.js:76-78), so the saved job lingers until its own timer.
- Fix: do not judge a record while its owner is offline and `rec.a` (accepted) is set: keep it up to
  `acceptedLifeMinutes` of the owner's online time (store remaining ms, pause the clock offline), and spawn again when
  the owner is back within `leaveDistance`. Unaccepted ones can keep leaving.
- Test: `tools/wander-npc-fixes.test.mjs` style unit test on the pure decision; BDS `wander.js` with a simulated leave
  and rejoin.

### NPC-06 (Medium, V): gossip is built for a busy server

- Where: npc main.js:1497-1500 (48 real hours), 1557-1559 (25 percent of taps), config.js `gossipHours`, `gossipMax`;
  tools/gossip-shared.js:18-30 (one piece per sender per in-game hour, dropped not queued).
- Player sees: they come back after two weeks; the town has nothing to say about what the others did, and never says
  anything about what they themselves were doing.
- Fix: keep the newest 8 pieces whatever their age (age only orders them), measure age in Realm days from
  `realm:calendar` when there is one ("a few days back", "last season"), and make the first tap after 3 or more real
  days away always tell the newest unheard piece. About 20 lines in `gossipAlive` and `gossipLine`.

### NPC-07 (Medium, V for defaults): the caravan keeps a schedule nobody is online for

- Where: caravan config.js (`everyDays: 7`, `offsetDays: 2`, `hourUtc: 18`, `stayMinutes: 40`, `lateHours: 24`);
  main.js:787-809.
- Player sees: nothing, ever, unless someone is online between Saturday noon and Sunday noon Central. The pack then
  looks broken ("where is the caravan?").
- Fix (pick one): make "late" mean "the first time anyone is online on or after the due day until the next due day"
  (`lateHours = everyDays * 24`), so each week's caravan meets the first session of that week; or schedule by Realm
  days (every 8 Realm days, stays 2), which fits the calendar and the festivals.

### NPC-08 (Medium, V): caravan placement at world spawn

- Where: caravan main.js:406-412 (no spots: world spawn, `surface = true`), 672-688 (`getTopmostBlock` + 1, no water
  check though C15 says the call skips water, no leaves or roof check), 705-708 (trader 0 always stands on the spot
  itself; the others fall back to the same block when their offset is not standable), 731 (llamas the same).
- Player sees: traders on a roof or treetop at spawn, under water at a coastal spawn, or three NPCs inside each other.
- Fix: look for dry, open, natural ground in rings out to 16 blocks (`waterOver` as in bounty main.js:447-461, the
  `BUILT` and tree patterns from calendar `groundAt`), use `freeSpotNear` from tether.js for each trader, and tell
  operators once when no spot was set ("/realm:caravan_spot"). Affects only realms that never set a spot.

### NPC-09 (Medium-low, V): champions and bounty targets do not ask the zones

- Where: elite main.js:544-567 (`convert` checks caps, spacing, roof, `avoidBuilds`, but never `isProtected`, which the
  file imports and uses only for the approach at 1026-1030); 1497-1512 (`spawnRequested`: no check); bounty
  main.js:276-290 and 472-552 (spot choice and build scan; the pack has no `zones.js`).
- Player sees: a named champion appears in the unbuilt part of a town's radius or in a claimed field; a bounty reads
  "last seen near" coordinates inside somebody's claim.
- Fix: one line in `convert` (`if (isProtected(dimId, at.x, at.z)) return;`); bounty gets `scripts/zones.js` through
  `tools/sync-zones.mjs` and treats a protected spot as `badSpot`. Requested story champions are left alone (the story
  places them on purpose).

### NPC-10 (Low-medium, S): the Realm menu star and an NPC tap

- Where: npc main.js:1021-1048 cancels the entity interaction; admin main.js:1281-1299 opens the Realm menu on
  `afterEvents.itemUse` of the star. Nothing in either pack looks at the other.
- What may happen: on some input methods a canceled entity interaction falls through to "use item". The Realm menu
  opens first, the NPC menu gets `UserBusy`, retries every second (npc main.js:1055-1063) and pops up when the Realm
  menu is closed.
- Sure: low. It needs one client check per input: touch, controller, mouse; tap Elsie holding the star.
- Fix if it reproduces: in admin_bp, remember the tick of any `beforeEvents.playerInteractWithEntity` whose target has
  tag `realm:npc` or `realm:resident` per player, and ignore `itemUse` in the same or next tick.

### NPC-11 (Low, V): the busy retry

- Where: `show()` in npc main.js:1055-1063, wander main.js:262-270, caravan main.js:847-855, town main.js:1114-1126,
  bounty main.js:977-983: up to 20 tries, 20 ticks apart. `busy` stays set meanwhile (npc main.js:1068, 1074).
- Player sees (rare): taps on any townsfolk do nothing for up to 20 s, then a menu opens although they walked away.
- Fix for tap-opened menus: 3 tries, and give up when the player is more than 6 blocks from the NPC.

### NPC-12 (Low, V): residents are mute

- Where: town main.js:3887-3894. Fix: section 3, proposal C.

### NPC-13 (Low, V code, S effect): the inn's bed

- Where: waystone main.js:926-938 sets the spawn point to the innkeeper's own block. On respawn the player stands in
  Elsie; npc_bp then refuses to put her back while someone is on the spot (npc main.js:776-784, 883), so she stays
  nudged off her post until they move.
- Fix: a free standable block within 3 of her (`freeSpotNear`).

### NPC-14 (Low, V): one talk lock per wanderer

- Where: wander main.js:1139-1148 adds the entity to `talking` and slows it; 1191-1198 the first talker to finish
  removes both. Fix: count talkers (`Map<entityId, number>`).

### NPC-15 (Low, S): where and how wanderers appear

- Where: wander main.js:475-519. The spot is 24 to 40 blocks along the player's view, on the topmost block unless it is
  leaves, lava, fire, magma or cactus. No pattern for player-made blocks, so an unclaimed base's roof qualifies; and
  the villager appears in plain sight with only a chime (689-710).
- Fix: reject tops matching the `BUILT` pattern (bounty main.js:272-273), and add the existing `poof` particles at the
  spot when they appear.

### NPC-16 (Low, V): Atlas tablets on after-events

- Where: atlas main.js:1158-1179 (`afterEvents.playerInteractWithBlock` and `entityHitBlock`). A tap with a block in
  hand places the block and opens the tablet; a hit opens it too.
- Fix: `beforeEvents.playerInteractWithBlock`, first line `if (ev.cancel) return;` (C13), cancel when `siteAt` matches
  a tablet, shrine, survey marker or pool, then `system.run` the form.

### NPC-17 (Low, V): gossip marked heard too early

- Where: npc main.js:1571-1578 runs inside `greetingFor` (1616), before `show()` (1114). If the form never shows, that
  piece is lost for the player. Fix: return the id with the line and save it after `show()` resolves uncanceled.

### NPC-18 (Info, V): a siege on the first night back

- Where: calendar main.js:1237-1242: one non-AFK player who finished Act II is enough; 35 percent a night after a 5 day
  gap (config.js). By design. For the rejoin flow: no siege roll for a player set in which everyone joined less than
  one Realm day ago after 3 or more real days away. About 8 lines with a `lastSeen` player property.

### NPC-19 (Low, V) and NPC-20 (Low, S)

- NPC-19: see section 4, "one news memory".
- NPC-20: wander main.js:1699 syncs labels every 2 ticks and name-labels-shared.js:425-429 teleports the helper to the
  head it read; a walker moves in between. Check on a client; if visible, sync walkers every tick while a viewer is
  within 12 blocks.

Things checked and found sound (**V**): duplicate townsfolk after a reload (audit keeps the saved entity id, removes the
other: npc main.js:664-687); duplicate traders (caravan main.js:556-578); leftover siege and Atlas mobs (removed on
load); a townsfolk post sunk into a later path or with its floor gone (npc main.js:549-566, 854-880); canceled-tap
handling in the bundle (every handler starts with `if (ev.cancel) return;`); mayors of deleted towns (removed from the
full list at load); the Nether structure-load quirk for skins (npc main.js:1984-1986 uses the command form).

---

## 3. How the world can bring a player back into the story, alone or in a group

Design rule taken from the owner's words: nothing here may be a new thing to learn. Each proposal either **replaces** a
line an NPC already says, **fills** an object that is already in the world (the notice board, the bell), or **removes**
a command from the path. No new HUD element, no new item, one new saga event.

### 3.0 The one missing fact: `realm:saga_lead`

Everything below needs a single piece of state the story pack does not publish today: "the one thing this player
should do next, in words, and where". `realm:track` is close but exists only for an active chapter and has no words.

Protocol (push, same shape as `realm:npc_flags`, `realm:saga_progress` and `realm:track`; consumers keep it in memory):

```
realm:saga_lead        (saga_bp sends; on join within 5 s, on change (checked with the tracker, every 2 s), on ping)
{
  "player": "<player id>",
  "v": 1,
  "st": "start" | "step" | "report" | "party" | "wait",
  "k":  "main" | "side" | "heart" | "wander" | "festival",
  "s":  "act2_choir",                      // story id
  "title": "The Gray Choir",               // story title, plain ASCII, at most 40
  "ch": "Bells in the Fog",                // chapter title, at most 48, optional
  "hint": "Find the old chapel east of town",   // one plain sentence, no color codes, at most 120
  "npc": "hollis",                         // the townsfolk or w_<wid> to talk to (start, report), optional
  "who": "Brother Hollis",                 // their name as shown, optional
  "place": "Old Chapel",                   // a place name, at most 32, optional
  "dim": "minecraft:overworld", "x": 412, "z": -96,   // where to go, optional (unknown or not built yet)
  "more": 2,                               // other stories that could be started now (side, heart), 0 to 9
  "party": { "on": 2, "of": 3, "hold": "Sam", "behind": ["Sam"] }   // optional, only in a party
}
{ "player": "<player id>", "v": 1 }        // nothing to point at (everything done, or stories paused)

realm:saga_lead_ping   { "player"?: "<id>" }   // any pack: send it again (all online players without "player")
```

Size: under 500 characters. Which lead (saga decides, one only, first match): the story the player pinned in the log;
an active main chapter (`step`, or `report` when its steps are done); a main chapter held for the party (`party`, with
`hold` the mate it waits for); the next main chapter (`start` at its giver); a main chapter locked by a requirement
(`wait`, `hint` = the first reason in words); an active side, heart or wanderer chapter; the newest startable side
story (`start`); else nothing. Saga should also send `realm:track` for a `start` lead (the giver's post) so the
Minimap's star is never empty: that is one more call to the existing `sendTrack`.

Edge cases the spec must cover: stories disabled (`enabled` off) sends the empty form; a giver that is not placed sends
`start` without coordinates and `hint` "Ask an operator to place <who>"; a player in another dimension still gets
coordinates with `dim`; on `/reload` consumers ping after 100 ticks (the pattern npc_bp already uses for flags,
main.js:981-985); leaving players are dropped from every consumer's map.

Cost: saga about 60 lines next to `sendProgress` (it already has `sortStories`, `stepLine`, `npcTarget`, `onHold`).
Check: `tools/check-events.mjs` (size), `check-event-guards`, a unit test for the choice order.

### 3.1 Proposal A: every townsfolk can answer "What should I do next?" (rank 1)

- Value: high. Today only the right NPC shows the story; after weeks away the player does not know which one.
- Packs: `npc_bp` (about 70 lines), `saga_bp` (the event). Mayors included (they use the same menu).
- Behavior, in `tapped()` (npc main.js:1094-1101), with `lead = leads.get(player.id)`:
  1. `lead.npc === id`: nothing new; saga's own button is already first. Add one body line under the greeting:
     `§6${t.name} has been waiting for you.` (`start`) or `§6${t.name} wants to hear how it went.` (`report`).
  2. Otherwise, when a lead exists: one button at the top, `order: 5`: `What should I do next?`. No button when there
     is no lead.
  3. Picking it shows one form: the NPC's line (below), then `§7<title>: <ch>`, then `§f<hint>`, then where:
     `§7<who> - 140m NE` from the existing `whereabouts` math for a townsfolk (npc main.js:1725-1744), or
     `§7<place> - 412, -96 (300m E)`, or `in the Nether`. One button: `Thanks`. With `more > 0` a last gray line:
     `§8${more} other ${more === 1 ? "story is" : "stories are"} open: see the notice board.`
  4. Back after 3 or more real days (npc_bp keeps a `npc:seen` UTC day per player, written on join and leave): the
     first tap on any townsfolk uses the lead line as the greeting itself, once, instead of weather talk. That replaces
     a random line with a useful one; it adds no popup.
- Drafted lines (ASCII; `{who}`, `{title}`, `{hint}`, `{dir}` filled by npc_bp; one picked at random):

| `st` | Any townsfolk | Elsie (innkeeper) | A mayor | Reyes |
|---|---|---|---|---|
| `start` | "{who} was asking after you, {player}. Something about {title}." | "{who} left word for you at the inn, dear. Best not keep them waiting." | "{who} has been to my office twice about you. Go and see them, would you?" | "{who} wants you. That's all I was told. {dir}." |
| `step` | "Still on {title}? Last I heard: {hint}." | "You look like someone with a job half done. {hint}, wasn't it?" | "The town's counting on you, {player}. {hint}." | "You have your orders. {hint}." |
| `report` | "{who} is waiting to hear how it went." | "You did it, didn't you? Go and tell {who} before you tell me." | "Report to {who}. Then come and tell me everything." | "Done? Then report to {who}." |
| `party` | "Your friends went on without you. It waits until you're together." | "The others are ahead of you, love. Find {hold} and go as one." | "This one is for all of you together, {player}." | "Regroup first. {hold} isn't here." |
| `wait` | "Nothing pressing, {player}. {hint}." | "Rest a while. {hint}." | "Nothing from the council today. {hint}." | "Stand down for now. {hint}." |
| none | "Quiet days. The notice board has work if you want it." | same | same | same |

- Edge cases: `hint` is saga's text and may end with a period (strip one before the template adds its own); a
  Hollow-Crowned player keeps the cold greeting but still gets the button; `{dir}` is omitted across dimensions.
- Noise: none added. One button appears only when it has an answer.
- Tests: `tools/npc-lead.test.mjs` (pure `leadLine(lead, npcId, voice)` and the where-line); BDS `npc-lead.js`: fake
  `realm:saga_lead`, `realm:npc_debug` tap, assert the first button and the body.

### 3.2 Proposal B: the Notice Board becomes the one "jobs" surface (rank 2)

- Value: high. One object in every town answers "what is there to do" without a command. It reuses the offer round, so
  no pack learns a new protocol.
- Packs: `town_bp` (about 120 lines), then about 10 lines each in `saga_bp`, `bounty_bp`, `quests_bp`, `calendar_bp`,
  `goals_bp`. `npc_bp` unchanged.
- How:
  1. `town_bp` keeps a small map `dim|x|y|z -> town id` for the three sign blocks of each built board (`toWorld(s, x,
     1, 0)`, main.js:1061), rebuilt on build, unbuild and load. `beforeEvents.playerInteractWithBlock`: first line
     `if (ev.cancel) return;`, a known sign cancels and `system.run`s `openBoard(player, townId)`.
  2. `openBoard` runs the same round the wanderer pack runs (wander main.js:1163-1172): `realm:npc_talk { req, player,
     npc: "board:<town id>", roles: ["board"], name: "<Town> Notice Board" }`, waits 4 ticks, sorts by `order`.
     `town_bp` therefore also listens for `realm:npc_offer` (it only sends today).
  3. Body, at most 9 short lines:
     ```
     Riverside, a Village (level 2). Realm day 143, Harvest.
     
     Next for you
     The Gray Choir: Find the old chapel east of town
     Brother Hollis - 140m NE
     Your party: 2 of 3 here. It waits for Sam.
     
     Work posted
     ```
     The "Next for you" block is the lead (omitted without one); the party line only with `lead.party`.
  4. Buttons, each an answer to role `board`, each label carrying its own state so the board reads as a summary:
     - saga (order 10): `Story: The Gray Choir\n§8Chapter 3 of 7` (opens the chapter page, `chapterInfo`); up to two
       `Side story: <title>\n§8Ask <giver>` for startable side stories whose giver stands within 128 blocks of this town.
     - bounty (20): `Bounties: 2 open\n§8New in 5h 12m` (opens `showBoard`).
     - quests (30): `Daily quests: 1 of 3 done` (opens its menu).
     - town (40, own): `Town projects: Well 40 percent` (opens `townMenu`; delivering stays at the mayor).
     - calendar (50, festivals only): `Lantern Fair: 2 of 3 activities` (opens `festivalMenu`).
     - goals (60, only with a goal running): `Community goal: 1,200 of 5,000 Oak Logs`.
     - own last button with `lead.party`: `Call my party here` (proposal D).
     At most 8 buttons; the round already caps at 16 offers.
  5. The third sign changes from "Bring materials to the mayor!" to `Tap for work` + `and what's next` when the board has
     no newer families to show (life.js:239).
- Realms with no town or no board: nothing changes; every command still works.
- Risk of noise: it is a place, not a popup. The rule for packs: answer `board` only with something that can be done
  today, and never with an empty state ("No bounties" is not a button).
- Tests: `tools/town-board.test.mjs` (the sign map from a spot and facing; body assembly); BDS `town-board.js` with
  `bounty_bp`, `quests_bp`, `saga_bp`: build the board with `realm:town_test finish`, tap through a debug hook like
  `realm:npc_debug` (a new `realm:town_test { action: "board" }`), assert button labels.

### 3.3 Proposal C: residents and wanderers pass the word on (rank 4)

- Residents (`town_bp`, about 25 lines, fixes NPC-12): a tap says one line in chat, in the resident's name, picked in
  this order: the lead when it names a townsfolk ("Brother Hollis keeps asking where you've got to."), the newest town
  log entry ("They finished the well last week. About time."), a time-of-day line. Cooldown 3 s instead of 10 s.
  `town_bp` reads `realm:saga_lead` (in memory). Drafted lead lines: `"{who} keeps asking where you've got to."`,
  `"You're {player}! {who} was looking for you."`, `"Aren't you meant to be with {who}?"`.
- Wanderers (`wander_bp`, about 20 lines): when a Stranger or a Recurring Wanderer greets a player whose lead is `start`
  or `report` at a **townsfolk**, the greeting line (main.js:1173) is replaced, once per lead, by a carried message:
  `"You're {player}? {who} asked every traveler to tell you: come by when you can."` The request button stays as it is.
- Value: medium (the world visibly knows about you). Cost: small. Noise: zero new elements; both replace a line.
- Mail when away (`saga_bp` or `npc_bp`, about 25 lines): on join, when the player was away 7 or more real days and the
  lead is `start` or `report` with a `who`, send **one** letter per absence through the existing `realm:mail_send`:
  from `{who}`, subject `Still waiting`, body `"{player}, when you're back: {hint}. I'm where I always am ({x}, {z}).
  No hurry. But soon. - {who}"`. Realm Mail already tells a joining player about unread letters 8 s after joining, so
  no new notice exists. Mark the absence in a player property so it is sent once. If the caravan visited while they
  were away the letter may end `(brought with the caravan)`: pure flavor, `caravan:last` is readable only by the
  caravan pack, so it would have to add that line itself; I would skip it.
- The cheaper alternative to the letter (rank 3, recommended first): `news_bp` already prints "Welcome back! You were
  away 3d." (news main.js:204-223, `awayNoticeHours` 12). Add the lead to that same line: `Welcome back! You were away
  3d. Last time: The Gray Choir. Next: Find the old chapel east of town. Any townsfolk can point the way.` `news_bp`
  sends `realm:saga_lead_ping { player }` at 60 ticks and reads the answer before its 100-tick popup. About 20 lines.
  This is the single highest value-per-line change for "I come back and don't know what to do".

### 3.4 Proposal D: group play hooks (rank 5)

- **Call the party** (`party_bp` about 45 lines, `map_bp` about 15, `town_bp` the button):
  ```
  realm:rally_ask { player, place, dim, x, y, z }      // town_bp's board button, later the bell tower's bell
  realm:rally     { code, by, name, place, dim, x, z, until }   // party_bp, after checking the party and a 60 s cooldown
  ```
  `party_bp` tells each online mate: `§d[Party] Nish calls the party to the Riverside notice board (240m NE).` and shows
  it as one line in the party HUD for 5 minutes; the Minimap's star points there unless the mate picked a destination.
  No teleport (waystones keep their meaning; mates within 6 blocks already travel together by waystone). Offline mates
  get nothing: a letter per rally would be noise.
  The **Bell Tower** (level 4) gets the same action on its bell (`playerInteractWithBlock` on the bell block at the
  tower's spot): ringing it is "Call my party here". That gives the tower's stated purpose ("a bell to call the whole
  town together") a function.
- **Party status where people look**: `lead.party` on the board and in proposal A's form ("It waits for Sam", "Sam is a
  chapter behind"). The story pack already holds a chapter for the party (`onHold`, saga ui.js:233) and shows "Waiting
  for your party" at the giver; this only repeats it at the board and at other townsfolk.
- **Shared accept**: exists in saga (`acceptFor`, `inviteSide`, `listenIn`, saga ui.js:490-600). From the world side
  the missing piece is wanderers (NPC-04).
- **Catch-up for a member behind**: a story decision (other agent). The world hook is ready with `st: "party"` and
  `behind`: any townsfolk can say "Your friends are ahead of you" and the board can list it. If saga adds a "catch me
  up" action it should arrive as a normal saga offer at the giver, so no world pack changes.

### 3.5 Proposal E: gossip that carries story progress (rank 6), and the calendar (rank 7)

- Party progress as gossip: saga already sends `act` gossip for a finished main act (ui.js:931). With NPC-06 fixed it
  will still be there when a mate returns: "Have you heard about Sam? The whole of The Gray Choir, start to finish."
  Add nothing per chapter: that would be the noise the owner is describing.
- "Two towns over": add an optional `at: "<town id>"` to `realm:gossip`; `npc_bp` learns each post's town from
  `realm:town_list` (nearest center within 128 blocks) and, when the teller's town differs, prefixes `Word from
  {town}: `. About 30 lines in npc_bp, one field in town_bp, bounty_bp and saga. Value is low while the realm has one
  town; keep it for later.
- Calendar: `realm:saga_progress` gains an optional `realm` field (the highest act anyone has finished, kept by saga in
  one world property). `/realm:calendar`'s first page and the board's header get one line: `The realm's story: Act II
  finished. You: Act I.` No broadcast, no title. About 15 lines in calendar, 10 in saga.

### 3.6 Ranking

| # | Proposal | Value | Cost | Packs | New things to learn |
|---|---|---|---|---|---|
| 0 | `realm:saga_lead` | enables the rest | S (60 lines) | saga | none |
| 1 | A: "What should I do next?" at every townsfolk | High | S-M (70) | npc | none (one button) |
| 2 | B: Notice Board = jobs and next step | High | M (120 + 5 x 10) | town, saga, bounty, quests, calendar, goals | none (an existing object) |
| 3 | C0: lead in the "Welcome back" line | High | S (20) | news | none |
| 4 | C: residents and wanderers pass the word; one letter after 7 days | Medium | S (70) | town, wander, saga | none |
| 5 | D: Call the party (board, bell) + NPC-04 | Medium-high for groups | M (90 + 30) | party, map, town, wander | one button |
| 6 | E: gossip kept across absences (NPC-06), `at` later | Medium | S (20) | npc | none |
| 7 | Calendar line "the realm's story" | Low | S (25) | calendar, saga | none |

---

## 4. Simplification candidates

### 4.1 How many offer systems a player meets today

Twenty-one distinct systems hand out or track things to do (**V**, README pack table and each pack's entry points):

| # | System | Pack | Turns over | Scope | Reached through |
|---|---|---|---|---|---|
| 1 | Main story (5 acts) | saga | never | party | the chapter's own NPC; `/realm:saga` |
| 2 | Side questlines (15) | saga | never | player, mates count nearby | their giver |
| 3 | Heart stories (12) | saga + npc | never | player | that townsfolk at Close |
| 4 | Daily favors | saga | 00:00 UTC | player | each townsfolk |
| 5 | Wanderers' chains (8) | saga + wander | never | player | random meeting, camps |
| 6 | Strangers' requests (24 kinds) | saga + wander | 15 to 30 min | player | random meeting |
| 7 | Festival chapters (16) | saga + calendar | Realm season | player | givers, during the festival |
| 8 | Festival activities (12) | calendar | Realm day | player | `/realm:calendar` |
| 9 | Daily quests (3) | quests | UTC day | player | `/realm:quests` only |
| 10 | Bounties (2 champions, 2 culls) | bounty | UTC day | realm | lectern, Reyes, `/realm:bounty` |
| 11 | Town projects | town | never | realm | mayor, `/realm:town` |
| 12 | Community goals | goals | operator | realm | `/realm:goals`, a chest |
| 13 | Milestones | milestones | never | player | `/realm:milestones` |
| 14 | Treasure hunts | maps | per map | player, mates share | Mara |
| 15 | Expeditions | expedition | per run (not checked) | party | `/realm:expedition`, the site |
| 16 | Atlas sites | atlas | never | player | walking into them, `/realm:atlas` |
| 17 | Field Journal pages | journal | never | player | `/realm:journal` |
| 18 | Guild ranks | guilds | never | player | Reyes, `/realm:guilds` |
| 19 | Fishing tournament | fishing | weekly | realm | `/realm:fishing_tournament` |
| 20 | Choir sieges | calendar | 5+ Realm days | realm | happens to you |
| 21 | Callings | skills | once | player | Hollis or Moss, `/realm:skills_calling` |

Fifteen of them post explicit tasks (1 to 12, 14, 15, 19). Entry points: 9 townsfolk roles, 1 lectern, 1 goal chest, at
least 12 commands, random meetings and world sites. Seven are command-only (8, 9, 12, 13, 15, 17, 19). There are four
clocks (UTC day, real week, Realm day, in-game hour) and three "three small things today" lists (favors, daily quests,
bounties) with different rewards and different places.

### 4.2 What to merge in presentation, keeping every function

1. **One jobs surface**: proposal B. Systems 1, 2, 7 to 12 show on the town board with their state in the label; the
   packs keep their menus and commands. The bounty lectern opens the same board form (with bounties first) instead of a
   separate list: one more caller of `openBoard`, through `realm:npc_choose`-style routing, about 10 lines in bounty.
2. **"Today" as one idea**: favors (4), daily quests (9) and bounties (10) read as one "Today" block on the board with
   one shared reset hour (NPC-02). No data merge: three packs, one heading, one clock.
3. **Route command-only systems through people who already exist**, each a 10-line `realm:npc_talk` answer:
   daily quests at the mayor (`Daily quests`, order 32), community goals at the mayor (`Community goal`, only while one
   runs), expeditions at Reyes (`Expeditions`, role `warden`), the festival's activity list at Quill next to the ribbon
   stall he already offers, the fishing tournament at Tobin next to "Fish records". After that every task-giving
   system has a face, and the Realm menu star stays the fallback.
4. **One news memory** (NPC-19): the inn's "Hear the news" keeps its button; `npc_bp` forwards each piece of gossip it
   accepts as `realm:sky_event { kind: "gossip", text }` (the filled nameless line), so the inn lists town news and
   world events together. Then the 25 percent greeting can drop to 10 percent, because there is a place to ask.
   About 15 lines in npc_bp, none in waystone (it already stores any kind with a `text`).
5. **Guilds as the score, not a system**: the Guild hall button is fine; the simplification is in wording. Every
   `realm:quest_done` already feeds reputation; the board's footer can say `Wardens: Journeyman (120 to next)` for the
   guild that moved last, which makes the link between "work" and "rank" visible without a visit to Reyes. Optional.
6. **Reyes's menu is the crowded one**: Guild hall, Bounties, story chapters, a daily favor,
   Ask about, Who lives here, Give, Goodbye: up to 10 buttons. Folding **Who lives here?** into proposal A's form
   (the where-line) and showing it only when nothing else is offered would take one button off every menu.

Not recommended: merging data models (favors into daily quests, bounties into guild jobs). The reward and save formats
differ and the gain is only on screen, which the board gives for far less risk.

---

## 5. QoL improvements, ranked

| # | Improvement | Files | Size |
|---|---|---|---|
| 1 | Gift safety (NPC-01): confirm, never tools or enchanted items | npc main.js:1082-1100, 1398-1454 | S |
| 2 | One reset hour for dailies, default 10 UTC, and a grace for a live bounty target (NPC-02) | bounty config.js, main.js:597-609; quests config.js; saga data.js:140; npc main.js:1172 | S |
| 3 | Lead in the "Welcome back" line | news main.js:204-223 (+ saga event) | S |
| 4 | "What should I do next?" at every townsfolk | npc main.js:1094-1125, 2478-2519 | S-M |
| 5 | Notice Board form | town main.js (new block near 1043), life.js:234-241 | M |
| 6 | Party-aware wanderers (NPC-04) and wanderers that outlive a relog once a job is accepted (NPC-05) | wander main.js:558-632, 1006-1039, 1130-1200 | M |
| 7 | Caravan meets the week's first session; safe placement at spawn (NPC-07, 08) | caravan main.js:672-747, 787-809, config.js | S-M |
| 8 | Gossip that waits for you (NPC-06, 17) | npc main.js:1497-1580 | S |
| 9 | Residents talk; transformed residents removed (NPC-12, 03) | town main.js:3594-3640, 3873-3895 | S-M |
| 10 | Champions and bounty targets respect zones (NPC-09) | elite main.js:544-567; bounty main.js:472-552 + zones.js | S |
| 11 | Who lives here marks who has something for you (a gold dot from the lead and from offers of the last tap) | npc main.js:1725-1754 | S |
| 12 | The inn's bed spawn next to Elsie, not in her (NPC-13) | waystone main.js:926-938 | S |
| 13 | Atlas tablets on before-events (NPC-16) | atlas main.js:1158-1179 | S |
| 14 | No siege on the first night back (NPC-18) | calendar main.js:1237-1281 | S |
| 15 | Short retry for tap-opened menus (NPC-11) | npc, wander, caravan `show()` | S |

---

## 6. Tests to add

Unit (`tools/*.test.mjs`, node, no game):
- `npc-gift.test.mjs`: `giftable(item)` false for max stack 1, enchanted, named, lore; shortcut only for loved or liked.
- `npc-lead.test.mjs`: line choice per `st` and voice, the where-line, period handling, cross-dimension.
- `saga-lead.test.mjs` (with the story agent): the choice order of 3.0 on fixture sagas; message under 2048.
- `town-board.test.mjs`: sign map from spot and facing; body lines; button order and cap.
- `bounty-reset.test.mjs`: `today()` with the shared offset; `keepOld` grace.
- `wander-party.test.mjs`: mates from tags; `mine` for mates; accepted record kept while the owner is offline.
- `npc-gossip-age.test.mjs`: newest 8 kept past 48 h; first tap after 3 days tells one.
- Extend `tools/town-residents.test.mjs`: a transformed resident with the marker is recognized.

BDS scenarios (`tools/test-bds/examples/`, header line with the run command as the others have):
- `npc-gift-safe.js` (npc_bp): sneak-tap with a pickaxe keeps it.
- `npc-lead.js` (npc_bp): fake lead, tap, first button and body; tap the lead's own NPC: no extra button.
- `town-board.js` (town_bp, bounty_bp, quests_bp, saga_bp): finish the board project, open it, labels present.
- `town-resident-turned.js` (town_bp): lightning on a resident leaves no named witch.
- `bounty-reset-grace.js` (bounty_bp, elite_bp): a spawned target next to a player survives the day roll.
- `wander-party.js` (wander_bp, saga_bp, party_bp): two simulated players in a party; the mate's tap has no "someone
  else" line.
- `wander-relog.js` (wander_bp, saga_bp): accept, leave, rejoin: the Stranger is there.
- `caravan-spawn-ground.js` (caravan_bp): spawn over water and under a tree; traders on dry ground, not stacked.
- `elite-zone-convert.js` (elite_bp, town_bp): forced conversion inside a town's zone makes no champion.

Checks that will fire and must be fed: `check-events` (new ids `realm:saga_lead`, `realm:saga_lead_ping`,
`realm:rally_ask`, `realm:rally`), `check-event-guards`, docs coverage (new settings), `help-catalog`, `admin-catalog`,
versions and `sync-diag` for every touched pack, `docs/NEWS.md` for what players notice.

---

## 7. Risks and open questions

- **Live settings may differ from defaults.** NPC-02, 06, 07 are stated for the shipped defaults; `resetHourUtc`,
  `everyDays`, `hourUtc`, `gossipChance` are `/realm:config` settings. Check the Realm before calling them live bugs.
- **NPC-10 and NPC-20 need a real client**; the BDS harness has no item-use on entity taps (simulated players fire no
  interact events, npc main.js:2550-2552).
- **The lead is only as good as saga's one-line hints.** If chapter steps have no plain sentence, proposals A to C
  repeat a title and little else. The story agent's work decides the quality of every line here.
- **Board discovery**: the board is a level 1 project that someone has to deliver 32 planks and 3 signs for, and towns
  exist only where an operator added one. A realm without a town gets proposals A and C0 only. Consider building the
  board with the town (free) so the surface always exists.
- **Role `board` discipline**: if packs answer with empty states the board becomes the mess it is meant to replace.
  Enforce in review: an answer must be doable today.
- **Bundle order**: `town_bp`'s new block handler runs with every other `playerInteractWithBlock` handler in one
  context; it must return on `ev.cancel` and must not cancel taps on signs that are not the board's.
- **Performance**: all proposals are event-driven (join, tap, change). `realm:saga_lead` is checked with the existing
  2-second tracker pass and sent only on change. No per-tick work is added.
- **Saved data**: new keys only `npc:seen` (player, a number) and one "letter sent for this absence" number in saga;
  the board's sign map is memory. Nothing append-only.
