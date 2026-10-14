# Story bible: The Lantern and the Hollow

The single source of truth for Story Questlines (`saga_bp`) content: the world's secret history, the
cast, the main story's acts, every side questline, the places, the tone mix, and the data format
writers fill in. **Spoilers throughout: this file is for the people building the realm, not players.**
It is not published (only `docs/PACKS.md` is).

Everything a player reads in game is plain ASCII (plus `§` color codes): no curly quotes, no
`...` as one character, no dashes other than `-`. Pages are short: 1 to 4 sentences, at most about
450 characters, because they show in a Bedrock form.

---

## 1. The pitch

A sleepy harbor town (the realm's own town; never name it, players name their towns) sits on top of
the oldest secret in the world. Forty winters ago, in the **Year of the Long Storm**, the harbor
tower fell, the bell drowned, Old Tobin's brother died, and a star fell into the sea. Nobody in town
talks about it. Now the bell is ringing again, the stars are wrong, the drowned walk with rope on
their wrists, and the gentle young chapel keeper is having the same dream every night.

The player starts by helping neighbors with small, strange problems (the two existing stories), and
pulls a thread that leads to a buried civilization, a cult that sings to something under the world,
three ancient seals, a comet that returns once a lifetime, and a final night where the town either
holds or falls. On the way they comfort a ghost child, raise turtle hatchlings, sneak through a cult
meeting, cook for a funeral, rob smugglers, duel a witch, map the edge of the world, and decide,
again and again, what kind of hero they are.

**Feel:** Zelda's warmth and townsfolk you love, Diablo's dread and violence, Genshin's lore drip and
character arcs, Minecraft's own world as the stage (ancient cities, ocean monuments, the Nether,
the End, the Warden). Every big Minecraft structure gets a story reason to exist.

## 2. The secret history (the truth, revealed slowly)

1. **The Starwrights.** Ages ago a people who read the sky built observatories on mountains, vaults
   under the sea and cities deep under the stone. They discovered **the Hollow**: not a monster but a
   hunger at the bottom of the world, the thing the sculk grows toward. Wherever sound is, the Hollow
   listens. The Warden is one of its "ears".
2. **The Lantern.** The Starwrights could not kill the Hollow. They bound it with three **Seals**
   (Tide, Stone, Sky) and fed the seals with the light of a comet they called **the Lantern**, which
   passes over the world once every forty years. Each pass "relights" the seals for another forty.
   The ancient cities (vanilla) are Starwright cities abandoned when the sculk crept in. The ocean
   monuments are Tide vaults, their guardians were wardens of the water. Their writing survives as
   echo shards ("echoes": sound frozen in crystal).
3. **The Long Storm (40 winters ago).** The last pass went wrong. **Brother Ashgrave**, the chapel
   keeper then, had heard the Hollow in his sleep for years. It promised him his dead daughter back.
   He climbed the harbor tower during the Lantern's pass and rang the great harbor bell with a
   rhythm the Hollow taught him: the bell's note cracked the Lantern. The comet shattered. Its pieces
   fell as meteors (the realm's meteor strikes are its last fragments still falling). The tower fell
   into the sea with the bell, and Ashgrave, and Tobin's brother Hal, who had rowed out to stop him.
4. **What survived.** The seals are cracked but holding, barely, on the little light left in the
   comet shards. Ida's master forged some shards into the first **relics** (that is why relics feel
   alive). Aldous Fenn, the cartographer, figured out part of the truth and spent his life mapping
   the seals' locations (the three pins in The Last Map point at a line, and the line points home:
   the chapel sits on the old Starwright "listening stone"). He told no one, because Mayor Bram's
   father, mayor at the time, ordered the whole thing forgotten "for the town's sake".
5. **Ashgrave did not die.** The Hollow kept him, drowned and dreaming, as its voice: **the Hollow
   Herald**. Through the bell (now silenced or recast by the player in The Drowned Bell) he called
   the drowned. With that voice cut off, he reaches out through dreams instead, to the new chapel
   keeper, **Brother Hollis**, and through a cult: **the Gray Choir**, outsiders and a few townsfolk
   who hear the "song" and believe the Hollow will end all grief ("Nothing lost, nothing missed").
6. **The Lantern returns.** This year. Sol has seen it: a faint smudge in the east, growing every
   night. If the seals are fixed and the Lantern's light reaches them, the Hollow sleeps for forty
   more years. If the Choir rings the "broken note" again during the pass, the seals fail and the
   Hollow rises. The finale is **Lantern Night**.
7. **The last Starwright.** Elsie the innkeeper is far older than she looks. She is the last of the
   Starwrights' line, kept young by a sliver of the Lantern sewn into her apron (revealed in Act III, *Elsie's Apron*; see "As shipped" below). She
   ran the inn so she could watch the chapel. She failed forty years ago and has carried that guilt
   since. In one ending she gives her life to become the new Sky Seal.

## 3. Themes and the player's choices

The main story tracks three player-wide flags (global, so side quests can read them too):

| Flag | Values | Set by | Pays off |
|---|---|---|---|
| `g:heart` | a running tally of `mercy` vs `iron` choices, stored as the last major choice plus counters `g:mercy` / `g:iron` (`"1"`..`"9"`) | Choices across the main acts and many side quests | Which ending choices are offered, epilogue text, the Herald's last words |
| `g:hollis` | `saved` / `lost` | Act II and Act III choices about Brother Hollis | Whether Hollis lives, helps in the finale, or becomes a second boss |
| `g:quill` | `trusted` / `exposed` | Act II (Quill's double life) and Quill's side story | Quill brings smuggled allies to Lantern Night, or the Choir has a spy |

Plus each main act ends with a choice that aligns a **guild** (Miners, Growers, Wardens, Wayfarers)
through reputation, using the Guilds pack.

**Endings (Act V):**

1. **Relight the Lantern** (heroic, default): the player carries the three seal-keys up to the Sky
   Seal and the Lantern's light passes through them. The Hollow sleeps. Bittersweet: the Herald,
   freed, becomes Ashgrave again for one minute and asks the player to tell Tobin he is sorry.
2. **The Keeper's Gift** (sad; only if Elsie's side story *A Room at the Inn* is finished): Elsie
   becomes the new seal. The Hollow is bound for a thousand years, not forty. The inn passes to Wren.
3. **The Hollow Crown** (dark; only with `g:iron` 5 or more): the player takes the Herald's place
   and bargains with the Hollow for power. The town is saved, but the player is marked: title
   `Hollow-Crowned`, a unique relic, and townsfolk greet them coldly forever after (an epilogue flag
   other stories read).

## 4. The cast

### Existing townsfolk (ids are fixed; `npc_bp` config already has them)

| Id | Name | Who they really are | Voice |
|---|---|---|---|
| `mara` | Mara the Cartographer | Fenn's apprentice; inherits his search for the seals | Brisk, funny, precise, hates being lost |
| `tobin` | Old Tobin, the Fisherman | Lost his brother Hal in the Long Storm | Gruff, short sentences, sea sayings, soft heart |
| `reyes` | Warden Reyes | Captain of the wardens; protective, suspects everyone | Military, dry humor, "That's an order. Mostly." |
| `elsie` | Elsie the Innkeeper | Secretly the last Starwright, centuries old | Warm, motherly, deflects with food; slips into old words |
| `bram` | Mayor Bram | Son of the mayor who buried the truth; ashamed when he learns | Pompous, kind, nervous, grows into courage |
| `quill` | Quill the Trader | Smuggler; was recruited by the Choir, plays both sides | Charming, evasive, always bargaining |
| `ida` | Ida the Relicsmith | Apprentice of Dunmore, the smith who forged the first relics | Blunt, few words, loves her craft |
| `sol` | Sol the Sky-reader | Astronomer (he; Adela's widower, see *The Star Kittens*); the first to see the Lantern returning | Dreamy, poetic, speaks in star names |

### New townsfolk (added to `npc_bp` by the engine work; same shape as the others)

| Id | Name | Title | Roles | Who they are | Voice |
|---|---|---|---|---|---|
| `hollis` | Brother Hollis | the Chapel Keeper | `priest`, `questgiver` | Young, gentle, sleepless; the Herald whispers to him | Soft, polite, doubting, sudden cold lines when the Herald slips through |
| `moss` | Moss | the Gravedigger | `gravedigger`, `questgiver` | Keeps the old graveyard; sees what others won't; morbid jokes, kind | Dry gallows humor, talks to the dead, unafraid |
| `wren` | Wren | the Stable Girl | `stablehand`, `questgiver` | A 12-year-old who loves every animal; Elsie's ward | Excited, run-on sentences, names everything |
| `bea` | Bea | the Cook | `chef`, `questgiver` | Runs the inn's kitchen (twenty years, after twenty as a ship's cook); the culinary questline | Loud, bossy, generous, cooking metaphors for everything |

Greetings and idle lines for the new four follow the existing pattern (2 per time of day and
weather, 4 idle lines).

### Story-only characters (spawned for a scene with the `meet` and `escort` objectives)

| Id | Name | Entity | Where | Notes |
|---|---|---|---|---|
| `lily` | Lily, a ghost girl | `minecraft:allay` | the inn (Elsie's ghost story) | Elsie's little sister from the Long Storm; sweet, sad |
| `vesna` | Vesna of the Fen | `minecraft:witch` (passive) | `witch_hut` | A witch who knows the Starwright songs; ally or enemy |
| `cantor` | The Cantor | `minecraft:evoker` (passive) | `choir_ring` | Leader of the Gray Choir's local circle (a stranger in a gray hood) |
| `hal` | Hal's echo | `minecraft:allay` | `seal_tide` | Tobin's brother, an echo in the Tide Seal |
| `old_fenn` | Fenn's echo | `minecraft:allay` | `observatory` | Fenn left a recorded echo for Mara |
| `ashgrave` | Brother Ashgrave | `minecraft:drowned` champion / `minecraft:allay` echo | the finale | The Hollow Herald |
| `pip` | Pip, a lost boy | `minecraft:villager_v2` (baby) | various | Escort quest (Reyes's story) |

### Wanderers of the Wilds (Recurring Wanderers; NPC id `w_<id>`, chains `kind: "wander"` in `stories/wanderers.js`)

Met out in the wilds (the `wander_bp` pack picks who appears where); each has a chain whose first chapter
sets up their camp (place `camp:<id>`), where they wait for the rest.

| Id | Name | Kind | Opens after | Voice |
|---|---|---|---|---|
| `pell` | Pell the Pilgrim | pilgrim | The Drowned Bell | Gentle, self-mocking, talks about his teacher; walks to the holy places and wonders what the stones listen for |
| `anwen` | Anwen, the Surveyor's Ghost | ghost (allay) | Signs in the Sky | Drifting, precise, forgetful; a sky surveyor who measured the Lantern's road and marked "three places on a line". She knows nothing past her own death: no Hollow, no Elsie |
| `brannoch` | Brannoch Deepdelve | deep miner | - | Booming, jokey, fond of the rock; fifty years under the stone |
| `rook` | Rook the Rival | rival | - | Swaggering bounty hunter who hates to lose; father left him debts. Races you to bounty champions and treasure chests (`g:rook_won` counts your wins, `rook_lost` remembers a loss). Turns on a player who mocked him, really beat him three times and has `g:iron` 4+ |
| `marigold` | Marigold of the Heights | hermit | - | Dry, kind, eccentric; tea, flowers and a goat named Nettle |
| `tamsin` | Tamsin Galeward | storm-chaser | - | Exuberant, reckless, loves thunder |
| `vesk` | Vesk the Exile | Nether exile | - | Haunted, halting; sent to the Nether for a crime he didn't commit (nothing to do with the Choir) |
| `hob` | Hob Fairweather | traveler | - | Chatty tinker, terrible jokes about a duck and a duke; owes Quill a story |

Strangers (one-offs, `stories/wander_oneoffs.js`) speak through `{name}` and keep to plain favors. Hostile
wanderers each carry one tell in their lines (the Choir's "Nothing lost, nothing missed" for the spy, a toll on
a road that isn't there, a sailor dripping seawater far from a wreck, a hermit who never blinks and says the
stone listens); the Choir spy only after Act II, the Hollow-touched hermit only after Act III.

## 5. Places

Each place is a name an operator can set with `/realm:saga_place <name>` (standing on the spot), or
that the pack picks and builds itself (`scripts/places.js` and `scripts/prefabs.js`; "Places" in the Story
Questlines section of `docs/PACKS.md`). Every place has a **prefab**: a small structure the pack can
build there. The Auto site column says where the pack looks
when it picks the spot itself.

| Place | Label | Prefab | Auto site |
|---|---|---|---|
| `lighthouse` | Lighthouse | A 5 by 5 stone-brick tower 18 high with a glass lantern room, a ladder and a balcony | coast, 80-250 blocks from spawn |
| `sunken_bell` | Sunken Bell | A collapsed tower's base on the sea floor with a bell, chains and rubble | under water, 150-400 blocks |
| `old_chapel` | Old Chapel | A small mossy cobblestone chapel with pews, a bell frame, stained glass and a loose stone | land, 120-300 blocks |
| `graveyard` | Old Graveyard | A fenced plot with 12 graves, a crypt door, dead bushes, a lantern and an iron gate | land, 60-200 blocks |
| `observatory` | Stargazer's Ruin | A ruined round tower on high ground: cracked stone, a broken dome of glass, a lodestone | highest land nearby, 300-700 blocks |
| `sea_cave` | Smugglers' Cove | A rocky cove with a hidden dock, barrels, crates and a lantern | coast, 250-600 blocks |
| `choir_ring` | The Gray Ring | Standing stones of gray concrete and tuff in a circle, with a cracked bell in the middle | land, 400-900 blocks |
| `witch_hut` | Hollow Fen | A stilt hut of dark oak over water, cauldrons, mushrooms, hanging lanterns | flat land or swamp, 500-1000 blocks |
| `old_mine` | Abandoned Mine | A boarded mine entrance with a minecart, rails going down, cobwebs | land, 200-500 blocks |
| `watchtower` | Ruined Watchtower | A broken spruce and cobblestone tower with a fire pit, banners | land, 300-700 blocks |
| `meadow` | Wren's Meadow | A fenced paddock with flowers, a hay shed, a water trough | land near spawn, 40-150 blocks |
| `starfall` | Starfall Crater | A glassy crater of blackstone, magma and amethyst with a glowing core | land, 600-1200 blocks |
| `seal_tide` | The Tide Seal | A prismarine shrine on the sea floor: pillars, a sea-lantern ring, a conduit frame | deep water, 500-1200 blocks |
| `seal_stone` | The Stone Seal | A deepslate shrine room carved at y -45: reinforced deepslate, sculk, a chained door | underground below y -40, 300-800 blocks |
| `seal_sky` | The Sky Seal | A floating ring of quartz and glass at y 220 with an end rod crown | sky, 300-800 blocks |
| `hollow_gate` | The Hollow Gate | A blackened arch of crying obsidian and sculk over a pit lit by soul fire | land, 800-1500 blocks |

Writers use only these place names, `offset` spots from world spawn, or "no place" objectives.
Expeditions (dungeons) and town projects are other packs: story text may mention them.

## 6. The tone wheel

Every questline has a dominant tone and every act mixes several. Label each story with `tones` (the
quest log shows them as tags). The full list writers draw from:

`happy`, `sad`, `scary`, `creepy`, `violent`, `stealth`, `adorable`, `dangerous`, `heroic`,
`mystery`, `funny`, `romantic`, `cozy`, `epic`, `tragic`, `eerie`, `puzzle`, `exploration`.

**Variety rule:** within one story no two chapters in a row may have the same objective mix. Use the
whole objective menu (section 9): sneaking, escorting, leading animals on a rope, defending, timed
chases, riddles, visions, clue hunts, feeding and taming, riding, building, depth and height goals,
night vigils, waiting a day, boss fights. A story made only of "go there, kill N, bring M" fails
review.

## 7. The main story: The Lantern and the Hollow

Kind `main`. Five acts plus the two existing stories as the prologue. Each act is its own story (so
the log stays readable) and requires the act before it. Target length per act: 2 to 4 hours.

### Prologue (existing, do not change ids)

- **The Drowned Bell** (`drowned_bell`, 6 chapters) — sets up the bell, the Long Storm, Hal, Ida, the
  `bell` flag (`silence` / `ring`).
- **The Cartographer's Last Map** (`last_map`, 4 chapters) — sets up Fenn, the chapel, the `map` flag
  (`share` / `keep`). Its text may be clarified (the far pins confused players: say plainly that the
  tracker points the way and each pin is hundreds of blocks out, and suggest a horse, boat or elytra).

### Act I: Signs in the Sky (`act1_signs`, giver `sol`, requires both prologue stories)

Tones: mystery, eerie, cozy, creepy. ~9 chapters.

1. **A Smudge in the East** — Sol shows the player a faint smudge over the eastern horizon through
   the spyglass. Objective: be outdoors at night for a minute looking east (`vigil` at night), and
   bring Sol a spyglass. Sol: "It is early. Forty years early, or exactly on time."
2. **Fallen Light** — Sol needs a piece of a fallen star. Visit a meteor crater (`starfall` place) and
   collect ancient debris / amethyst. Short vision when touching the core: a bell note, a cracked
   comet. First echo of the Long Storm.
3. **The Keeper Who Doesn't Sleep** — Brother Hollis (new) asks for help: candles keep going out in
   the chapel. Light candles at the chapel (`interact` with candles), then sit a vigil there after
   midnight. Creepy: a whisper in chat, a cold `vision`. Hollis admits he dreams of a drowned man
   ringing a bell.
4. **What Moss Saw** — Moss the gravedigger says graves are being dug *up*, not down. Night
   investigation at the `graveyard`: `inspect` 4 clues (footprints, a gray thread, tar, a hymn page).
   Fight a few zombies that rise. Clue reveals the Gray Choir's sign.
5. **Fenn's Second Map** — Mara, back from the prologue, finds Fenn hid an echo at the
   `observatory`. Climb there (high ground), solve Fenn's riddle (`answer`: "What never changes and
   always moves?" -> "the stars"), `meet` Fenn's echo. He names the three seals but not where they are.
6. **The Inn Remembers** — Elsie goes quiet when the Long Storm is mentioned. Bea the cook drops hints.
   Fetch Elsie's old trunk from the inn cellar (deliver), Elsie tells a careful half-truth.
7. **Song in the Dark** — Hollis sleepwalks out of town at night. `follow` a pale wisp (his trail) to
   the `choir_ring`. Stealth: watch the Gray Choir's meeting without being seen (`stealth`). The
   Cantor speaks of "the broken note" and "the Lantern night".
8. **Report or Pursue** — choice: tell Reyes everything (`g:iron`+1, Wardens rep, Reyes posts guards)
   or follow the Choir alone (`act1:path=alone`, `g:mercy`+1, Wayfarers rep) to protect
   Hollis's secret. Either way: defend Hollis from Choir enforcers who come for him (`defend`).
9. **The Sky-reader's Count** — Sol computes the Lantern's arrival: "Sixty nights." (story time, not
   real time). The act ends with a vision of the Hollow: a vast listening dark. Reward: title
   `Sky-Watcher`, journal page.

### Act II: The Gray Choir (`act2_choir`, giver `reyes`, requires Act I)

Tones: stealth, violent, mystery, tragic, dangerous. ~10 chapters.

1. **The Pattern** — Reyes has found gray thread at three farms. `reach` three marked spots
   (`offset`s), `inspect` clues at each; at the last a choir ambush.
2. **Pip Is Missing** — a farm boy, Pip, has vanished. Track him (`follow` a trail of dropped toys)
   to a Choir camp; `stealth` in, `escort` Pip home (he's terrified; ambush on the way).
3. **Quill's Ledger** — Pip saw Quill's crates at the camp. Confront Quill: he admits smuggling for
   the Choir but swears he didn't know about children. Choice: trust him as a double agent
   (`g:quill=trusted`) or expose him to Reyes (`g:quill=exposed`). Branch the next two chapters.
4a. **(trusted) The Double Agent** — Quill smuggles the player into the `sea_cave` as a hired hand:
   wear a disguise (a leather chestplate, `stealth` with `disguise`) and sneak to the Choir's ledger (`stealth` with disguise), deliver it to Quill.
4b. **(exposed) Raid on the Cove** — Reyes leads a raid on `sea_cave`: defend the dock, defeat 20
   Choir pillagers (vindicators/pillagers), Quill is jailed (he'll be freed later, bitter).
5. **The Cantor's Letter** — in the ledger: the Choir needs "the bell's tongue" (the clapper or band
   from The Drowned Bell). Text differs by `drowned_bell.bell`. Ida's forge is broken into at night:
   chase the thief (`defeat` a fleeing champion within 90 seconds: timed).
6. **Hollis's Confession** — Hollis confesses he let the Choir into the chapel crypt while
   sleepwalking. Moss and the player search the crypt (`graveyard`): `inspect` Ashgrave's empty
   coffin. First time the name Ashgrave is spoken.
7. **The Witch of Hollow Fen** — Moss says only Vesna knows the old songs. Travel to `witch_hut`,
   `meet` Vesna, she asks a price: bring a mushroom stew, a spider eye and a "tear" (ghast tear,
   dangerous Nether trip). She teaches a counter-song, `answer` a song riddle.
8. **The Night Hollis Sang** — on a stormy or any night, Hollis, possessed, walks into the sea singing.
   Choice under pressure: pull him out by force (`defend` him from drowned while he struggles: saved
   if you win) or sing Vesna's counter-song at the chapel (`interact` a bell 3 times, `vigil`). Sets
   `g:hollis=saved` or leaves it open for Act III. Very creepy.
9. **The Gray Ring Burns** — attack the `choir_ring` with Reyes's wardens (or alone, if `act1:path=alone`):
   `defeat` waves, then the Cantor (`champion`). The Cantor's dying words: "You can't kill a song."
10. **What the Mayor Knew** — Bram, shaken, opens his father's sealed desk: the order to forget the
   Long Storm. Choice: tell the town the truth (`g:mercy`+, Growers rep) or keep it buried until it's
   over (`g:iron`+, Wardens rep). Reward: title `Choir-Breaker`.

### Act III: Into the Deep (`act3_deep`, giver `ida`, requires Act II)

Tones: scary, exploration, eerie, dangerous, mystery. ~9 chapters.

1. **Echoes in Crystal** — Ida has an echo shard from Fenn's things; it hums. Bring her 4 echo shards
   (ancient city loot: dangerous, Warden country). Sneaking is the lesson: in the deep dark,
   `stealth` near sculk shriekers.
2. **Lantern of the Deep** — Ida forges a lamp that plays echoes (story item; text). `reach` y below
   -40, then hear the first echo (`vision`): Starwrights building the Stone Seal.
3. **The Abandoned Mine** — the old miners sealed a tunnel after the Long Storm. `old_mine`: clear
   cave spiders (`defeat`), `mine` 40 deepslate to reach the sealed door, `inspect` the miners' last
   notes (horror: they heard singing in the rock).
4. **Listening Stone** — Hollis (if saved) or Moss explains the chapel sits on a listening stone.
   Under the chapel: interact with the loose stone, `vision` of Ashgrave on the tower in the Long
   Storm. The truth of the broken note.
5. **Tobin's Silence** — tell Tobin how Hal really died (Hal tried to stop Ashgrave). A quiet,
   sad chapter: sit with him (`vigil` at the lighthouse at dusk, 60 s), fish together (`fish` 3).
6. **The Stone Seal** — find the `seal_stone` (y -45). Defend it while it charges (`defend`, waves of
   Choir and sculk-blind zombies). It cracks further: a Warden roar (sound only).
7. **The Herald's Voice** — Hollis (if not yet saved: final chance) or a Choir prisoner speaks with
   the Herald's voice. Riddle duel: the Herald asks three riddles (`answer` x3). Answer wrong and an
   ambush spawns (engine supports `failSpawn` on answer).
8. **Elsie's Apron** — Bea notices the starlight stitched in Elsie's apron hem. Confront Elsie.
   She tells the truth: she is the last Starwright. Choice: forgive her (`g:mercy`+) or condemn her
   for forty years of silence (`g:iron`+). Heavy, emotional.
9. **Three Keys** — Elsie explains: each seal needs its key relit by a Lantern shard. Act ends:
   the Lantern is now visible to everyone (Sol's smudge is a tail). Reward: relic `lantern_shard`.

### Act IV: The Three Seals (`act4_seals`, giver `elsie`, requires Act III)

Tones: epic, heroic, dangerous, exploration, sad. ~12 chapters: an opening, three seal branches of 3
chapters (any order: all three chapters of a branch carry `when` on the branch's choice flag or are
written so the player picks the order at a choice), and a closing.

1. **The Council** — Elsie, Reyes, Mara, Sol, Ida, Tobin meet at the inn. Choose which seal first
   (choice sets `act4:first`); the other two follow.
2-4. **The Tide Seal** (Tobin): an ocean monument trip (guardians, `defeat` elder guardian champion,
   `collect` 16 prismarine crystals), `reach` the `seal_tide`, `meet` Hal's echo (tearful farewell for
   Tobin, who comes along by boat: `ride` a boat 200 blocks). Relight with the shard (`interact`).
5-7. **The Stone Seal** (Ida, Miners): return to `seal_stone`, now cracked. Rebuild the seal frame
   (`place` 16 chiseled deepslate or polished blackstone), survive the Warden's
   approach by keeping still (`stealth` variant: sneak and stay within radius 60 s), relight.
8-10. **The Sky Seal** (Sol, Wayfarers): climb to y 220 (`reach` aboveY), the `seal_sky` ring:
   build a bridge, phantoms and vex (`defeat`), a vision of the Lantern's whole history, relight.
11. **Elsie's Choice** — Elsie asks the player to promise something (choice: let her sacrifice if it
   comes to it / refuse). Sets `act4:promise`.
12. **The Gate Opens** — a meteor falls at the `hollow_gate`. The Herald's voice to everyone. Reward:
   title `Sealwarden`, big Crowns.

### Act V: Lantern Night (`act5_lantern`, giver `bram`, requires Act IV)

Tones: epic, heroic, violent, sad, scary. ~8 chapters plus epilogues.

1. **Rally the Town** — Bram asks for help preparing: chapters with deliveries to Reyes (arrows,
   shields), to Bea (food for the defenders: deliver cooked food), to Wren (lead 3 horses to the
   `meadow` for the riders).
2. **Allies** — depending on flags: Quill's smugglers (trusted), Vesna (if her quest ended well),
   Hollis (saved). Each ally adds a short scene. Without them, harder `defend`.
3. **The Long Night** — `defend` the town (lighthouse) from four waves; Blood Moon tone.
4. **Through the Gate** — enter `hollow_gate`, `stealth` past the Choir's last circle or fight
   (`defeat` 30) depending on `g:heart`.
5. **The Herald** — boss: Brother Ashgrave (champion drowned with adds, 3 phases written as three
   `defeat` objectives with champion stages). If `g:hollis=lost`, a corrupted Hollis fights first.
6. **The Choice** — the endings (section 3), shown as choices whose availability depends on flags
   (`requires` on choices).
7. **Dawn** — epilogue by ending: the town wakes, each townsfolk has a line, rewards. Titles
   `Lanternbearer` (relight), `Keeper's Heir` (gift), `Hollow-Crowned` (crown).
8. **Forty Winters** — final chapter: plant a tree at the graveyard for the lost (`place` a sapling),
   Tobin rings or doesn't ring the bell. Credits page.

### As shipped (where the code differs from the outline above)

The outline was the plan; the story files in `packs/saga_bp/scripts/stories/` are the truth. Where
they differ (October 2026):

- **Act I** has 10 chapters: *The Skipping Song* (`rhyme`) comes third. The Report or Pursue flag is
  `act1:path` (`report` / `alone`), a flag of story `act1_signs`; other stories read it as
  `act1_signs.act1:path`, not `act1:path`.
- **Act II** has 12 chapters: 4a/4b are `double` and `raid`, and Vesna's price is its own chapter,
  *A Tear from the Fire* (`tear`), after *The Witch of Hollow Fen*.
- **Act III** has 10 chapters: *The Leaning Flame* (`flame`) comes after *Tobin's Silence*.
  **Elsie's reveal is in Act III**, not Act IV: in *Elsie's Apron* Bea sends the player to Elsie
  with a honey bottle and to sleep a night at the inn (a `sleep` objective whose dream shows Elsie's
  past); Elsie confesses in the outro. The choice sets `act3_deep.elsie` (`forgive` / `condemn`) as
  well as `g:mercy` / `g:iron`. *Tobin's Silence* gives `hal_compass` (Hal's Compass) along with
  Hal's Rod.
- **Act IV** orders the seals with its own flags `first`, `second` and `now` (not `act4:first`);
  the promise is `act4:promise` (`allow` / `refuse`), read as `act4_seals.act4:promise`.
- **Act V** has 14 chapters: the allies are five chapters (`smugglers` for a trusted Quill, `fen` for a
  freed Vesna, `fen_bound`, *The Witch Who Must Come*, for a bound one, whom Moss sends the player to
  call with a soul lantern at the Fen after dark, with a mercy or iron choice in her dialogue and the
  story flag `fen_call`, `chapel` for a saved Hollis, and `alone` for a player with no allies), and
  Dawn is three chapters, one per ending (`dawn_relight`, `dawn_gift`, `dawn_crown`). Each ally
  chapter adds 1 to `g:allies`; "no allies" everywhere in the act is `g:allies` `<=0`, and the Long
  Night's extra tasks appear per missing ally (the witch's task is skipped when `g:vesna` is `free`
  or `g:fen` is `called`). Reyes's count-off and the dead Moss names in *Forty Winters* follow
  `g:allies` (0, 2, 5 or 9 lost). It sets `g:allies`, `g:fen` and `g:ending`.
- **The Keeper's Gift** needs `act4_seals.act4:promise` = `allow` as well as *A Room at the Inn*.
- **Side-quest choices the main story reads:** `act3_deep.keys` (Act IV council: Ida's miners or
  Sol's wayfarers are waiting), `hollis_faith.forgive` (*A Lamp for the Lost*), `wardens_oath.oath`
  (*The Long Night*), `singing_forge.blade` (*The Herald*), `smugglers_run.profits` (*Quill's Last
  Run*), `hearth_and_table.marty` (*Rally the Town*), `mayors_burden.plaque`, `graveyard_shift.stone`
  and `g:vesna` / `fen_call` (*Forty Winters*). *Elsie's Apron* has a third last line for a player
  with fewer than three mercy and three iron choices.
- **Facts the text settles:** Sol is a man (Adela's widower); Ida's master was Dunmore; Hal was
  Tobin's younger brother; the Gull is Hal's boat, which Tobin still keeps (the sailors' boat that sank
  with Barnaby Pike's crew was the Petrel); Bea has cooked at the inn twenty years; an exposed Quill
  stays in the cells until Lantern Night, out by day on Reyes's parole.
- **Story relics:** `choir_mask` (Act II, *The Gray Ring Burns*), `lantern_shard` (Act III,
  *Three Keys*), `hal_compass` (Act III, *Tobin's Silence*), `keeper_lamp` and `hollow_crown`
  (Act V, the gift and crown Dawns), `singing_blade` (*The Forge That Sings*), `vesna_charm`
  (*The Witch's Bargain*).
- **Hearth and Table** teaches the Kitchen's story recipes with a chapter's `teach` (Lantern Cake in
  *A Feast for Marta*, Starwright Bread in *Elsie's Old Recipe*), and every chapter that asks for a
  dish has an "old way" with plain food, chosen in *Rations for the Wardens*.
- **Act IV** has 12 chapters, as planned.
- **Side questline requirements:** `inn_ghost` needs all of Act I, and `smugglers_run` and
  `vesna_bargain` all of Act II (not a chapter of them); `star_kittens` is given by `wren` only.
- **The Herald** (Act V) is one `sequential` chapter: its phases are `defeat` objectives that count
  one at a time.
- **World events and expeditions (October 2026):** every hook is optional or one way of two and gated on
  `pack:`: shooting stars after the vigils of *A Smudge in the East* and *Polaris*; optional fresh meteor in
  *Fallen Light* (`act1_signs.fresh`); *Echoes in Crystal* is an `or` of the echo shards or a Sculk Depths
  clear (`act3_deep.shards` = `city` / `depths`; the stealth stays required); a burst meteor over the gate on
  accepting *The Gate Opens*; a Blood Moon asked for by *The Long Night* (optional step, `act5_lantern.moon`
  = `red`) and a rainbow by *Dawn* (relight; `act5_lantern.bow`); Weather Almanac hints in *The Storm Vigil*,
  *Rain on the Water* and *A Champion's Heart*; optional Harvest Saffron for Bea (`hearth_and_table.saffron`),
  Blood Moon nights in *Until Dawn* and *The Long Watch* (`graveyard_shift.red`, `wardens_oath.red`), a sky
  wonder for Mara in *Frogs in Three Voices* (`edges_of_map.wonder`) and a pot of gold for Quill in
  *The Inspector Calls* (`smugglers_run.pot`). The new side questline is `listening_deep`
  (`stories/side_deep.js`, 5 chapters: `roots`, `cold_store` / `cold_store_letters` by `g:ending`,
  `gauntlet`, `last_listen`).
- **Story champions** whose mob the Champions pack can't make (the elder guardian, pillagers,
  vindicators, evokers, guardians, the phantom) are spawned by Story Questlines itself, never sent
  as `realm:champion_spawn`.

## 8. Side questlines

Kind `side`. Each 4 to 8 chapters, each its own story with its own giver. Some require an act of the
main story (`requires`), so they unlock as the world opens. Target length per questline: 1 to 3 hours.

| Story id | Title | Giver | Requires | Tones | Outline |
|---|---|---|---|---|---|
| `inn_ghost` | A Room at the Inn | `elsie` | Act I ch. 6 | creepy, sad, eerie | Room 3 is always cold. Toys move. Find Lily's six lost toys around town and the graveyard (`inspect`, `collect` named items), sit with the ghost at night (`meet` Lily the allay), learn she is Elsie's little sister lost in the Long Storm; help her let go (a lullaby `answer`, leave a flower on her grave `place`). Finishing it unlocks the Keeper's Gift ending. |
| `graveyard_shift` | Graveyard Shift | `moss` | none | scary, funny, creepy | Moss's comic-horror nights: a skeleton that keeps reassembling (defeat 5 times in one night), a grave that whispers riddles, a "corpse" that is actually a drunk sailor (escort him home), a crypt door that must stay closed until dawn (`defend` + `vigil`), and the reveal of the grave with Moss's name on it: his twin brother's, lost in the Long Storm. |
| `lost_lambs` | Wren's Lost Lambs | `wren` | none | adorable, happy, funny | Wren's animals keep escaping: lead a lost lamb home on a rope, feed 10 cows, name a cat (use a name tag), tame a wolf pup, brush an armadillo, catch the runaway pig that keeps "stealing" carrots (chase, timed), build a hay shed (`place` hay bales at `meadow`). |
| `star_kittens` | The Star Kittens | `wren` / `sol` | Act I | adorable, sad, cozy | Seven stray cats named after constellations by Sol's late wife. Find, feed and tame them across the world (`tame`, `tend`), the last one is old and sick: a gentle sad chapter. |
| `hatchlings` | Little Turtles | `tobin` | `drowned_bell` | adorable, heroic | Protect turtle eggs from zombies at night (`defend`), wait for them to hatch (`wait` a day), escort hatchlings to the sea (`defend` + `reach`). |
| `one_that_got_away` | The One That Got Away | `tobin` | none | happy, funny, heroic | Tobin's legend of a giant fish. Fish in 3 kinds of water, at night, in rain; bait from Bea; the final catch fights back (a champion guardian). |
| `wardens_oath` | The Wardens' Oath | `reyes` | none | violent, heroic, dangerous | Train recruits (defeat at a time limit), clear a pillager outpost, hold the ruined `watchtower` overnight, hunt a named raider captain (champion), a recruit dies (sad), swear the oath. |
| `smugglers_run` | Smuggler's Run | `quill` | Act II ch. 3 | stealth, funny, dangerous | Heists: steal back Quill's crate from a pillager outpost unseen, "borrow" a woodland mansion's map, run contraband by boat under a time limit, double-cross choice at the end (keep the profits / return them). Reads `g:quill`. |
| `mayors_burden` | The Mayor's Burden | `bram` | Act II | sad, funny, mystery | Election week: someone stole the ballots (`inspect`), a feud between two farms (choice), a statue unveiling disaster (funny), Bram's father's grave and his apology (sad). |
| `edges_of_map` | Edges of the Map | `mara` | `last_map` | exploration, happy, dangerous | Map five biomes (`reach` far offsets, `collect` biome tokens like a cactus flower, snowball, mangrove propagule...), find a lost village, cross a ravine, chart the deep ocean with a boat (`ride` boat), and finally the End (`reach` the End dimension). |
| `singing_forge` | The Forge That Sings | `ida` | Act I | dangerous, epic | Ida's masterwork: Nether trip for netherite scrap and blaze rods (`reach` Nether, `collect`), bastion danger, quench the blade in a soul-fire spring (`interact`), name it (a choice of three names). Reward: a relic. |
| `hearth_and_table` | Hearth and Table | `bea` | none | cozy, happy, funny, sad | The culinary questline: Bea's tryouts (bring ingredients), cook for the wardens, a feast for a funeral (sad), rare champion ingredients ("Champion's Heart", "Storm Eel"), the Starwright recipe from Elsie, and a cook-off against Quill's "imported" chef. Integrates the Cooking pack's dishes when installed (rewards and deliveries of named dishes). |
| `hollis_faith` | Lamp in the Window | `hollis` | Act II, `g:hollis=saved` | sad, happy, cozy | Hollis rebuilds his faith and the chapel: repair windows (`place` glass), a wedding in the chapel (funny), keep a lamp lit for the sailors, forgive himself. |
| `listening_deep` | The Listening Deep | `ida` | `act3_deep`, `pack:expedition_bp` on | exploration, dangerous, eerie | Expeditions as story: the Lantern of the Deep hums toward the expedition site (clear the Sculk Depths: an echo of the Hollow's roots reaching every deep place), the Starwrights' cold store under the ice (Frost Hollow, Normal or harder; told by Elsie, or by Wren reading her letters after the gift ending), Reyes's Long Stair (a Gauntlet, or any dungeon on Hard), one last listen (any dungeon on a Nightmare tier: the deep goes quiet for a while; title `Deep-Listener`). Never resolves the Hollow. |
| `vesna_bargain` | The Witch's Bargain | `moss` (meets `vesna`) | Act II ch. 7 | creepy, mystery, dangerous | Vesna's own past: a curse on the Fen, potions to brew (deliver), a bog spirit (stealth), choice: free Vesna or bind her. Sets `g:vesna`. |

## 9. The data format

Stories are data in `packs/saga_bp/scripts/stories/*.js`, one file per writer (for example
`stories/act1_signs.js`), each exporting `export const STORIES = [ ... ]` (an array of `Story`).
`stories/index.js` imports them in log order (main acts, then side questlines) and re-exports the
favors; `stories.js` keeps `NPC_NAMES`, `PLACES` and the prologue and adds the rest. Use the typedefs
from `types.js` (`@typedef {import("../types.js").Story} Story`; JSDoc, checked by `tsc`). Keep every
id stable once published. `node tools/check-stories.mjs` (part of `npm run check`) validates it all:
unique ids, known NPCs, places, objective types and their required fields, item, block and mob ids,
champion tags, requirements, interact blocks present in the place's prefab, every path through the
choices, and the Kitchen dishes against the Cooking pack; flags read but never set, a missing hint, a
`short` over 18 characters and pages over 450 characters are warnings.

### Story

```js
{
  id: "act1_signs",           // unique, snake_case
  title: "Signs in the Sky",  // log title
  short: "Signs in the Sky",  // tracker name, <= 18 chars
  giver: "sol",               // NPC id who starts it
  kind: "main",               // "main" | "side" (default) | "heart" | "wander" | "festival" (one chapter, gated on requires.flags "cal:festival")
  act: 1,                     // main story only
  tones: ["mystery", "eerie"],
  summary: "Sol sees something in the eastern sky.", // log line before you start
  requires: { stories: ["drowned_bell", "last_map"] }, // see Requirements
  chapters: [ ... ],
}
```

### Requirements (`requires` on a story, a chapter or a choice)

`{ stories?: string[], chapters?: string[] /* "story/chapter" */, flags?: Record<string,string>,
rep?: Record<guild, number>, minCount?: Record<string, number> /* "g:mercy": 3 */ }`. All must hold.

### Flags

- `set` on a choice: `{ key: value }`. A plain key is the story's own flag. `g:<name>` is a player-wide
  flag every story can read. `<storyId>.<flag>` in a `when` reads another story's flag
  (`"drowned_bell.bell": "ring"`).
- Counters: `inc: { "g:mercy": 1 }` on a choice adds to a numeric player-wide flag.
- `when` (pages, objectives, chapters, choices, rep): every key must match. A value starting with `>=`
  or `<=` compares numbers (`{ "g:iron": ">=5" }`, `{ "g:allies": "<=0" }`; an unset counter is 0). A value
  `"!x"` means "not x" (an unset flag passes).
- Installed packs: `pack:<folder>` is `"on"` when that pack is installed (it answered `realm:help_ping`;
  the engine asks shortly after the world loads and every 10 minutes) and `"off"` otherwise
  (`{ "pack:expedition_bp": "on" }`). Use it on every page, objective, chapter or story that mentions
  another pack, so the text never promises something that isn't there. It is checked live, never saved:
  a gated objective appears once the pack answers. A `when` needs every key, so "any of these packs" is
  separate objectives. `on` means installed, not enabled: a pack switched off in its own settings still
  answers, so its world events may never come; that's why they are only ever optional.

### Chapter

```js
{
  id: "smudge", title: "A Smudge in the East",
  npc: "sol",          // who tells the intro (default the giver)
  end: "sol",          // who hears the report (default npc)
  when: { ... },       // optional: the chapter only exists for players whose flags match (branches)
  intro: [Page, ...],
  introChoices: [Choice, ...], // optional: buttons after the intro (sets flags before objectives)
  teach: ["lantern_cake"],     // optional: Kitchen recipes taught when the chapter is accepted (realm:recipe_learn)
  objectives: [Objective, ...],
  outro: [Page, ...],
  choices: [Choice, ...],      // optional: buttons on the outro's last page
  reward: Reward,
  rep: [Rep, ...],
  hint: "Sol's spyglass works best from the lighthouse balcony.", // shown by "Ask for a hint"
  sequential: true,    // optional: objectives count one at a time, in order (a boss's phases)
  sky: [SkyRequest, ...],      // optional: world events asked for when the chapter is accepted
}
```

A SkyRequest is `{ kind, place?, burst?, minutes?, within?, on? }`: Story Questlines sends
`realm:sky_request` `{ kind, from: "saga_bp", player, dim, x, z, reason: "<story>:<chapter>", ... }` (x, z:
the place's spot, else the player's) and the pack that owns the event decides: `meteor` (Meteor Strikes;
`burst: true` breaks it apart high above the spot, no blocks broken), `blood_moon` / `harvest_moon`
(Blood Moon & Harvest Moon: tonight), `thunder` / `rain` (Weather Almanac: planned to start within
`within` minutes for `minutes`), `shooting_star` (Aurora & Shooting Stars: night, clear sky) and
`rainbow` (Rainbows). Any of them can be skipped (pack missing, its **Story events** setting disabled,
a rate limit, daytime), so the text around one must read fine whether it happens or not. Each request
is sent once per player.

A Page is a string or `{ text, when }`. A Choice is `{ id, label, set?, inc?, rep?, reply?, requires? }`.
A Rep is `{ guild, amount, when? }` (guild `miners`, `growers`, `wardens` or `wayfarers`), sent to the
Guilds pack.

### Objectives

Every objective has `type` and `label` (what the log shows; write it as an instruction:
"Sneak into the Gray Ring unseen"). Optional on every objective: `when` (flags), `hint` (overrides the
chapter hint for this step), `secret: true` (no tracker arrow until a hint is bought), `set: { flag: value }`
(flags set when it's done, like a choice's), `sky: SkyRequest` (sent when it starts counting, or with
`on: "done"` when it's done).

- `optional: true`: the chapter can be finished without it; the log shows `Optional: <label>`. Done before
  the turn-in, it gives its `bonus` (a Reward, given right away) and sets its `set` flags; unfinished, it
  just ends at the turn-in. Every chapter needs at least one objective that isn't optional.
- `or: "<group>"`: required objectives with the same group are alternatives (`Either: A` / `Or: B`): the
  first one done finishes the group and ends the others. Give each a `set` so the outro knows which way
  the player went. A group needs at least two members (a member hidden by `when`, such as one gated on
  `pack:`, leaves the other showing plainly).
- **Never block a chapter on a random world event**: a meteor, moon, rainbow, storm or tornado appears
  only in an `optional` objective or as one side of an `or` next to an ordinary way.

Locations: `place` (a place name from section 5), `at: { dim?, x, z }` (fixed coordinates, avoid),
or `offset: { x, z }` (from world spawn). `mark` names an offset spot on the tracker. `radius` in
blocks.

| Type | Fields | What the player does |
|---|---|---|
| `talk` | `npc` | Talk to a townsfolk |
| `reach` | location, `radius`, or `dim` ("minecraft:nether" / "minecraft:the_end"), `belowY`, `aboveY` | Go somewhere, to a dimension, deep or high |
| `deliver` | `npc`, `item` and/or `name` (an item's custom name, for quest items), `count` | Bring items to an NPC (taken on talk) |
| `collect` | `item` and/or `name`, `count` | Have items in your inventory |
| `defeat` | `mobs?`, `count`, location?, `night?`, `within?` (seconds, timed: progress resets if not done in time), `champion?`, or `bounty: true` (Bounty Board champion targets; with `race`, below) | Defeat mobs, or a champion at a place |
| `interact` | location, `blocks`, `count`, `radius` | Tap or hit blocks near a place |
| `survive` | location?, `seconds`, `weather?` ("thunder" default, "rain", "any"), `radius` | Stay outdoors in weather |
| `vigil` | location, `seconds`, `timeOfDay?: [from, to]` (ticks; 18000 = midnight), `outdoors?`, `sneaking?`, `weather?` (no default), `radius` | Stay at a place at a time of day |
| `mine` | `blocks?`, `count` | Break blocks |
| `fish` | `items?`, `count` | Catch with a rod |
| `meet` | `who: { id, name, entity }`, location, `pages`, `choices?` | A story character appears at the place; talk to them there |
| `inspect` | location, `clues: [{ dx, dy?, dz, text }]` (at most 30) | Find clues around a place (faint particles); tap near each to read it |
| `stealth` | location, `radius`, `guards: { mob, count, name? }`, `goal: { dx, dz }`, `detect` (blocks), `detectSneak`, `onSpotted?: "reset" \| "ambush"`, `disguise?: { slot, item }` | Reach the goal spot without a guard seeing you |
| `escort` | `who: { id, name, entity, look?, invul? }`, `from` (location object), `to` (location object), `radius`, `ambush?: { mobs, count, every }` | Lead a character safely; they walk behind you along your path |
| `lead` | `mob`, `name?`, `spawnAt?` (location object), `to` (location object), `count?` | Bring an animal on a lead |
| `defend` | location, `radius`, `waves: [{ mobs, count }]`, `ward?: { id, name, entity }` | Hold a place against waves; protect the ward |
| `follow` | `from`, `to` (location objects), `wisp?: string` (what it is called), `stray` | Follow a moving light to where it leads |
| `answer` | `npc` or location, `question` (Page), `answers: string[]`, `failSpawn?: { mobs, count }` | Answer a riddle (typed) |
| `place` | `blocks`, `count`, location?, `radius` | Place blocks (build something) |
| `tend` | `mobs`, `item?`, `count`, location? | Use an item on animals (feed, brush, name tag) |
| `tame` | `mobs`, `count` | Tame animals |
| `ride` | `mobs` (boat ids allowed), `distance` | Ride something this far |
| `sleep` | `vision?` | Sleep in a bed (and dream) |
| `vision` | location?, `scenes: [{ title?, text, sound?, seconds? }]`, `dark?` | A short cutscene plays |
| `wear` | `items`, `slot` ("head" / "chest" / "legs" / "feet") | Wear something |
| `use` | `item`, `count`, location? | Use an item (right click) somewhere |
| `wait` | `minutes` (real) or `days` (in-game) | Wait; the story continues later |
| `event` | `events?: string[]` (`meteor`, `rainbow`, `storm_cell`, `tornado`, `aurora`, `blood_moon`, `harvest_moon`), `quest?: { pack, id?, minLevel?, tier?, gauntlet? }`, `near?`, `minutes?`, `count`, location? | A world event or another pack's finished quest. `events`: from `realm:sky_event` (and `realm:moon`); with `near`, the player must get within `near` blocks of the event's spot within `minutes` (default 15, at most 60; meteor, rainbow, storm cell and tornado only); without it, moons and the aurora count if the player is in the Overworld (and at the place, if given) at any moment while they last, the others only when announced (60 s to be at the place). `quest`: a `realm:quest_done` for this player from `pack`, `id` exact or ending in `*`; for Expeditions `tier` means that tier or harder (`easy` < `normal` < `hard` < `nightmare`), `minLevel` a level and `gauntlet: true` a Gauntlet |

Characters (`who`, `ward`): people are `minecraft:villager_v2` (they walk; an NPC can't), with `look` the vanilla
event that dresses them for a job (`minecraft:become_cleric`, `minecraft:become_fisherman`...; unskilled without).
`invul: true` on an escort: they can't be hurt (and so never run back). Nobody trades with a story character.

Races (Rook): `race: <seconds>` on a `defeat` with `bounty: true` (gate it on `pack:bounty_bp`) or on an `event`
with `quest: { pack: "maps_bp" }` (gate it on `pack:maps_bp`). A race starts when the player comes within
`radius` (default 300) of a live bounty target, or of their own treasure map's last clue, not raced yet;
finished in time it counts one (`count` races to win), too late the bounty or the chest pays less. `rival` is
who they race (for the messages), `lose: { flag: value }` is set on every race lost (tease with it), and
`tally: "g:<counter>"` goes up by one with every race won (`g:rook_won`, read like `g:iron`). No `within`.

Mob and item ids are vanilla `minecraft:` ids. Champions: `champion: { tag: "realm:saga:<id>", mob,
name, trait?, warn?, health?, adds?: { mobs, count } }` (tag must start with `realm:`; `trait` is a
Champions pack trait, `stormcaller`, `frostbound`, `vampiric`, `splitting` or `shielded`, and only
applies when the Champions pack makes the mob).

Weather: while a `survive` (thunder unless it says otherwise) or a `vigil` with `weather: "thunder"` or
`"rain"` is counting and the player waits at its place in the Overworld in the wrong weather, the engine
asks the Weather Almanac for that weather (`realm:sky_request`, 6 minutes, starting within 8), at most once
per player and objective every 30 minutes. Gate any line about it on `pack:weather_bp`.

### Reward

`{ levels?, items?: [{ item, amount, name?, lore? }], crowns?, relic?, title?, journal?: { entry,
label }, codex?: { id, title, text } }`. `codex` adds a lore entry to the player's **Codex** (in the
story log): use it for every revelation so players can reread the story they've uncovered.

**Scale:** a side chapter pays 2-5 levels and 20-60 Crowns; a main chapter 3-8 levels and 40-120;
an act finale 10 levels, 150-300 Crowns and a title or relic. Hints cost 25% of a chapter's levels
and Crowns (`hintPenalty`).

### Story relics (added to the Relics pack)

The abilities below are the plan; the shipped ones differ in places (the Gray Choir Mask halves Choir
damage and blocks Darkness, the Fen Charm keeps witches from hurting you rather than targeting you):
the Relics section of `docs/PACKS.md` has them as they are.

| Id | Name | Where | Ability |
|---|---|---|---|
| `lantern_shard` | Lantern Shard | carry | Glows: night vision in darkness, and points toward the nearest unrelit seal |
| `choir_mask` | Gray Choir Mask | head | Choir enemies ignore you unless you attack; sneaking is silent to sculk |
| `hal_compass` | Hal's Compass | hand | Use: shows the way to your last death point or home |
| `vesna_charm` | Fen Charm | carry | Immune to poison; witches won't target you |
| `singing_blade` | The Singing Blade | hand | Hits ring a note that slows nearby mobs briefly |
| `hollow_crown` | The Hollow Crown | head | Night vision and strength at night; villagers flee (dark ending only) |
| `keeper_lamp` | Keeper's Lamp | carry | Light ring around you at night (particles); mobs lose interest faster |

### Wanderers (chains, camps, one-offs)

- A wanderer's chain is a story with `kind: "wander"` and `giver: "w_<id>"` (an id from `WANDERERS`); its first
  chapter has `camp: { prefab, near }` (`camp_road`, `camp_peak`, `camp_ruin`, `camp_deep`; near `"wanderer"`,
  where the player met them, or a place name). A later chapter's `camp` moves it, and the other players on the
  chain get a letter. Objectives use `npc: "w_<id>"` and `place: "camp:<id>"` like any NPC and place. An escort
  `who.id` that is a wanderer id hides the wanderer pack's own copy while yours walks.
- A choice may cost Crowns: `cost: { crowns: 10 }` (shown on the button).
- Rewards may add `skill: { skill, amount }` and `relicRoll: { chance, relics }` (a finale: 0.15).
- A Stranger's one-off is a template `{ id, label, archetypes, guild, params?, requires?, intro, objectives,
  outro, reward, hint }`; text uses `{name}`, `{item}`, `{count}`, objectives `item: "{item}"`,
  `count: "{count}"`, `npc: "{npc}"` (the stranger) and `at: "wanderer"`. Params `{ item: [...], count: [a, b] }`
  are seeded per meeting. Rewards: 1-3 levels, 10-30 Crowns, 20-60 skill XP. Chain chapters 2-5 levels and
  30-60 Crowns; finales 8 levels, 100-150 Crowns, a title, the relic roll and a codex entry.
- `g:w_accused` counts the friendly wanderers a player accused (set by the wanderer pack, read like `g:aff_`).

### Daily favors

Besides the stories, each questgiver offers a **daily favor** from templates in
`stories/favors.js`: short randomized jobs (Bea needs 12 eggs; Reyes wants 15 zombies cleared near a
farm; Wren's goat is loose; Moss needs bone meal), with small Crowns and reputation rewards, a new one
each real day per NPC. Template: `{ id, npc, label, objective, reward, lines: [intro, thanks] }`.

## 10. Writing rules

1. Every chapter has an intro (2-5 pages), objectives (1-4), an outro (1-4 pages), a reward and a
   `hint`. Labels are instructions. Hints are concrete ("The witch's hut is past the swamp to the
   south-west; the tracker points the way once you've asked Moss.").
2. Never require something a Bedrock survival player can't do. Bedrock mechanics only.
3. Name places the way section 5 does; the tracker shows the label.
4. Keep NPC voices consistent with section 4.
5. Each story pays off at least one flag from another story.
6. Write in American English, plain ASCII, short sentences. Quote dialogue with the speaker's color
   prefix like the prologue (`§eTobin:§r`).
7. Reveal the truth in the order of section 2; no character knows more than the act allows.
8. Violence is Minecraft violence: monsters die, nobody is gored. Sad means sad, not cruel.
