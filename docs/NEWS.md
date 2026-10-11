# Realm news

Player-facing release notes, newest first. The newest entry is what pops up in game: every
`npm run bundle` runs `node tools/gen-news.mjs`, which copies it into Realm News
(`packs/news_bp/scripts/release.js`), and each player sees it once after the packs are updated.
Write for players, in plain ASCII (no curly quotes, dashes or emoji), short lines. Keep older
entries below as a changelog.

## The Lantern and the Hollow

The biggest update yet. Talk to the townsfolk: something is wrong with the sky.

- A five-act main story, The Lantern and the Hollow, plus 14 side questlines: about 40 hours of quests with choices that change how it ends. Start with Old Tobin and Mara, then Sol.
- Four new townsfolk: Brother Hollis, Moss the gravedigger, Wren and Bea the cook. Each questgiver also has a daily favor.
- Stuck? Open /realm:saga and Ask for a hint (it costs a little of the reward and shows coordinates). The Codex keeps every secret you uncover.
- New: Kitchen (cook buff foods at a cauldron over a campfire), Deck of Many Things (/realm:domt), Slot Machine (/realm:slots), Silly Enchants (/realm:silly) and Dolphin Friends (feed a dolphin raw fish to tame and ride it).
- Expeditions 2.0: 8 dungeons, Nightmare tiers 1 to 20 with random affixes, 9 kinds of puzzles, tall rooms for elytras and builders, Nightmare Sigils and leaderboards per tier. /realm:expedition
- Champions now wear a colored badge, a helmet and an aura.
- Relics fixed: the Storm Staff calls lightning in storms again, Tide Boots work, and there are 7 new story relics. Rainbows show up again.
- Safe zones: towns and claims can be protected from meteors, storms and other world events.
- /realm:prefs: a stats ticker you can tune, a Translucent tools switch, and Measure my catches. /realm:fishing can make your fish stackable.
- Mob Health, the Elytra HUD and treasure map Warmer / Colder now show in a box on the right side of the screen, above the scoreboard, where other add-ons can't cover them (pick the middle of the screen or above the hotbar in /realm:prefs).
- Most commands now open a menu: try /realm:town, /realm:relics, /realm:meteor or /realm:champions.
- Operators: you now carry a Realm Configuration star. Use it for every realm command with preset choices, a setup checklist and quick actions (weather, time, teleport, give).
- Fixes from testing: helmets you drop near a champion stay put, town builds you remove or move keep what you placed around them, Stormchaser counts storms, dishes and recipe cards can't be faked with an anvil, dolphins keep all their vanilla behavior, and expedition mobs that teleport away no longer lock a room.
