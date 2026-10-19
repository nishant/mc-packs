# Design intent: the mc-packs Realm (what the owner is going for)

Sources: README.md (74 packs: 67 behavior, 7 resource), RPG_DESIGN, STORY_BIBLE, NEWS, PACKS.md (intro, interplay).

## The experience
- **One cozy co-op RPG layered on vanilla survival, not a minigame server.** The RPG plan is about "making the Realm
  feel like one RPG": townsfolk you love (Zelda), dread and fights (Diablo), lore told a little at a time (Genshin), and
  Minecraft's own structures as the stage (ancient cities = Starwright cities, monuments = Tide vaults).
- **Story at the center:** "The Lantern and the Hollow", a five-act main story plus side, heart and wanderer chains
  (42 stories, 234 chapters), told by 12 named townsfolk in an unnamed harbor town that players name themselves.
  Choices matter and are remembered (`g:mercy`/`g:iron`, the Hollow-Crowned ending makes the town cold for good).
- **Town life:** affinity, gifts, gossip, Friend prices, letters, Town Projects, a 96-day year with festivals and sieges.
- **Weather and atmosphere as content:** a planned forecast (Almanac), regional sandstorms and blizzards, storm cells,
  tornadoes, rainbows with a pot of gold, auroras, meteors, Blood/Harvest Moons, the owner's own rain recordings,
  custom skies and fog. Events feed the story, the Journal, the Kitchen and the inn's news.
- **Progression without a grind wall:** Skills/Callings, guilds, relics, bounties, champions, expeditions, fishing,
  cooking, Crowns (50-150/h casual). **QoL removes friction:** stash/sort, chest finder, refill, harvest, death point.
- **A HUD without clutter:** coordinates, mob health, elytra, party, minimap, tracker in Side HUD's numbered boxes.

## Tone
Warm with real stakes: the tone wheel mixes cozy, funny and adorable with eerie, tragic and epic; no two chapters in a
row share an objective mix. Monsters die, nobody is gored; sad, not cruel. Whimsy welcome (Perry, Silly Enchants, the
Deck); fair to players (slots pay an honest 92% with loss limits).

## How the packs interlock
- **No imports between packs; every pack works alone** and does more when its partners are present ("any
  combination works"). Coordination is only through tags (`afk`, `realm_party:<code>`, `realm_title:<text>`,
  `realm_expedition`), shared scoreboards (`crowns`, `stats_<stat>`) and `realm:` JSON script events under 2048
  characters, split into `{part, parts}` with a `*_ping` to resend after load.
- **Shared buses:** `realm:quest_done` (guild rep), `realm:skill_xp`, `realm:title_unlock`/`trail_unlock`,
  `realm:gossip`, `realm:mail_send`, `realm:sky_event`/`realm:journal`, `realm:zones` (safe zones protocol),
  `realm:access_check`, `realm:npc_talk` (each pack adds its buttons to a townsfolk), `realm:calendar`, minimap events.
- **Owners:** Townsfolk (NPCs), Saga (every quest), Almanac (weather), Calendar (Realm day), Side HUD (screen).

## What "polish" means here
- Game text is plain ASCII plus `§` codes (no curly quotes, ellipsis, dashes, emoji); forms never use `.header()`,
  section titles are `.label("§l§6Title")`; pages are 1-4 sentences, about 450 characters, hints concrete.
- Settings are named for what they do with Enabled/Disabled; operators change everything live in `/realm:config`,
  players their own in `/realm:prefs`; one Realm Configuration item lists every command a player may use.
- One action bar, many writers: every write is preceded by `realm:actionbar {player, ticks, from}`; steady lines
  wait and take turns by rank. Titles announce `realm:title` so side boxes step aside.
- Docs, `/realm:help`, admin catalog and news are generated and checked; stable APIs only; tested on BDS.

## The public-release goal
Today: one 10-player Realm. Next: anyone, including public servers with 30-100+ players. That means:
- **Per-tick cost scales with players:** budget per player and globally (the Minimap already caps 96 native ops
  per tick, 48 per player); spread work with `runJob`; idle players cost nothing; measure at 100 simulated players.
- **Nothing world-specific:** no assumed spawn, town, coordinates or owner names; operators place townsfolk, towns,
  caravan spots and boards; story places are built by the pack; defaults must be safe on a griefing-prone server.
- **Saved data bounded:** per-player saves (saga's 30,000 chars) and world buffers must hold 1,000+ one-time players.
- **Docs for strangers:** PACKS.md is player-facing already, but it says "the realm" and assumes the owner's setup;
  an operator who never met the owner must be able to install, configure and moderate from the docs alone.

## Gaps noticed (between packs)
- **Milestones, Community Goals, Merchant Caravan and Bounty Board send no `realm:gossip` or `realm:title_unlock`**
  (grep: 0 hits each); a finished community goal or a milestone tier should be town news and a title.
- **Letters come only from Townsfolk and Saga** (`realm:mail_send` senders: npc_bp, saga_bp): the fishing
  tournament result, a caravan arriving, a town project finished or a siege outcome never reach offline players.
- **Onboarding is one popup:** welcome text, `/realm:help` and the admin item, but no guided first hour (meet Quill,
  first favor, first waystone) that walks a newcomer into 67 behavior packs; "tutorial" only exists in build/expedition.
- **Operator setup is spread out:** townsfolk houses, towns, caravan spot, bounty lectern, waystones placed one
  command at a time; the setup checklist counts things but there is no "set up a new world" wizard.
- **No moderation tooling for big servers:** nothing for spam in mail or party chat, griefers in claims, or
  economy abuse (Crowns audit, pay limits).
- **Scale has no published budget per pack:** only the Minimap documents per-tick cost; most packs run fixed
  `runInterval`s over every player, and there is no 30/100-player BDS scenario in the finishing steps.
- **Owner-specific content in the release:** Easy Building is "Effortless Building v5.0 ported" (check its license
  and credit), the rain is the owner's own recordings, and the welcome/news defaults speak about this realm.
- **Weather has one owner but few listeners:** the Almanac sends `realm:weather_plan`/`weather_kind`, yet only Saga
  and the admin menu read them; Rain Extras, Storm Chasing, Regional Weather, Rainbows and Fishing still keep their
  own `<pack>:weather` guess, since scripts can't read the weather directly.
- **Fixed cast of 12 townsfolk** (ids fixed in the bible): a 100-player server with several towns has one Quill and
  one Bea for everyone; affinity and gossip are per player, but towns cannot have their own folk.
