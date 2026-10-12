# Realm news

Player-facing release notes, newest first. The newest entry is what pops up in game: every
`npm run bundle` runs `node tools/gen-news.mjs`, which copies it into Realm News
(`packs/news_bp/scripts/release.js`), and each player sees it once after the packs are updated.
Write for players, in plain ASCII (no curly quotes, dashes or emoji), short lines. Keep older
entries below as a changelog.

## Easy Building 2.0

Building got a lot easier, and a few loose ends are tied up.

- Easy Building 2.0: get the Building Book with /realm:build_book. Mirror, radial and array copies, 14 block palette patterns, Air Build, curves, ellipses and leaning cones.
- Block guides outline exactly where a build, paste or destroy will go.
- Copy, cut and paste whole areas, turned to face your way, with 19 saved copies.
- Destroy mode breaks a whole shape with your pickaxe, axe or shovel. In survival you get the drops and the tool wears.
- Undo and redo now survive a server restart.
- Titles like a card's name, FIGHT!, a level-up or a story scene are no longer covered by the side boxes. The boxes step aside and come back when the title fades.
- Deck of Many Things: Anvil Drop's anvil crumbles away a few seconds after it lands.
- Treasure maps: cairns, flags and standing stones come down once you are done with them, and an empty treasure chest turns back into ground.
- Expeditions: items you drop dying and treasure left in the chests are kept safe through a server restart.

## Platypus, Gauntlets and a Dangerous Deck

New things to find, build and survive.

- New animal: the platypus! Look along rivers and in swamps. It is peaceful, but hit it and it bites back with poison and a wobbly screen. About 1 in 200 is teal and wears a brown fedora. /realm:platypus helps you find them.
- New: Easy Building. Run /realm:build, pick one of 22 shapes (walls, floors, towers, domes, roofs, stairs, bridges, huts...) and place a block to build it all at once. Patterns, mirrors and repeats too. Survival uses your blocks; /realm:build_undo gives them back.
- Expeditions: bigger rooms in many shapes, the exit is always across the room, and trap halls wind past flames, arrows and pits. New Gauntlet: 14 rooms with a boon every 5, optional fixed loadout (your items come back exactly). 90 seconds at the treasure, a Leave now button, and leftover loot comes home with you.
- The Deck of Many Things got dangerous: The Sky really drops you, and lightning, anvils, lit fuses and half-heart curses can kill. Effects last 15 minutes to an hour, and there are 32 new cards (operators can add 15 wild ones). The Champion card now always brings a champion you can see.
- Treasure maps have new riddles (headings, compass steps, coordinate puzzles), each leading to a real landmark with a cairn, flag or standing stone. Warmer / Colder only works within 64 blocks.
- Rainbows stay put in the sky and grow as you walk to them. A golden beam marks the pot of gold until someone finds it.
- Several readouts now show at once in 8 side boxes (pick each one's box in /realm:prefs). Mob health can also float above the mob.
- Hyper Jump boots launch you 30 to 50 blocks up, sometimes into orbit with the Realm Space Program. Bring Feather Falling. Silly enchants are louder and wackier.
- Kitchen: crops harvested by tapping now give Starwright Flour, Harvest Saffron and Ember Truffle, and chat tells you when a window opens. Starwright Flour: 25% per ripe wheat for 15 minutes after an aurora or meteor.

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
