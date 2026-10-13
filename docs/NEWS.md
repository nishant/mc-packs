# Realm news

Player-facing release notes, newest first. The newest entry is what pops up in game: every
`npm run bundle` runs `node tools/gen-news.mjs`, which copies it into Realm News
(`packs/news_bp/scripts/release.js`), and each player sees it once after the packs are updated.
Write for players, in plain ASCII (no curly quotes, dashes or emoji), short lines. Keep older
entries below as a changelog.

## The story meets the sky

The story and the world now talk to each other.

- At big story moments the real thing happens: a meteor breaks apart over the Hollow Gate, the Long Night brings a Blood Moon, and the hopeful dawn brings a rainbow with a pot of gold. Sol's night watches end with a shooting star.
- Waiting on a storm for a story step? The Weather Almanac now plans one within about 8 minutes. Check /realm:weather_forecast.
- New optional story bonuses for Blood Moons, Harvest Moons, fresh meteors, sky wonders and pots of gold. They never hold a chapter up.
- Into the Deep: you can now clear the Sculk Depths expedition instead of hunting echo shards in an ancient city.
- New side questline for Ida: The Listening Deep, four expedition chapters after Into the Deep, up to a Nightmare clear and the title Deep-Listener.

## Steadier building guides

Easy Building got a tune-up.

- The block guide outlines no longer blink on a busy realm or a slow connection.
- Looking along a diagonal, your shape no longer flips back and forth.
- Holding the Building Book's use button while sneaking switches build mode once, not on and off again.
- The Easy Building menus stay open: turn build mode on, then pick a shape, change settings, all in one go. Close them with the X when you're done.

## Easier admin menu

For operators: the Realm Configuration menu is easier to read.

- Every command has a name for what it does, like Find Container or Set Weather, with a short hint under it that fits on the button. The command itself and its full description show when you open it.
- The main menu goes Recent, Search Commands, Quick Actions, then the categories, with Server Setup Checklist and Realm Settings at the bottom.
- The menu now counts and lists /realm:help (Realm Help) too.

## Audit fixes

We went through every pack and fixed what we found.

- Story: in Lantern Night, if you bound Vesna to the Fen, Moss now sends you to call her for the Long Night, and she counts as an ally. The finale and Elsie's council remember more of your side-story choices. A daily favor done again on a later day counts the animals you fed again, and the chapter message says which screen box the tracker is in.
- Building: aiming a big two-block shape no longer makes the realm lag. A cut you leave in the middle of puts its blocks back. The start block comes back to your hand when you finish with /realm:build_here.
- Expeditions: leaving from the menu asks first. A Nightmare Sigil comes back if an operator ends the run before you go in. Dying right after you leave (or just outside the dungeon) no longer costs you your items or your way home.
- Deck of Many Things: leaving mid-Comet or mid-Gate no longer strands you in the sky. The Void and Zero G leave pets, named mobs and villagers alone. Butterfingers and The Magpie drop your things where you can see them.
- World and weather: when an operator changes the weather, everyone gets a chat line saying what and for how long, and an ended tornado says it has died down. Wind and storm sounds stop when the rain ends. Empty pot-of-gold chests left behind vanish the next time someone walks by. Joining during a Blood Moon or Harvest Moon tells you it's up.
- Treasure maps: flying past the end of a clue (or teleporting away) no longer moves the treasure or swaps the marker for a bottle.
- Economy: type amounts like 1,000 when paying Crowns. Guild reputation counts from your first minute. Waystones don't charge for a trip they cancel, and you land beside the far waystone. Kitchen dishes still cooking when you log off are no longer lost, and a moon still up after a restart keeps dropping Moon Salt and Harvest Saffron.
- Utilities: Lag Cleanup keeps items with lore (like silly-enchanted tools) and reminds everyone 10 seconds before it clears. The Elytra HUD and the Storm Meter no longer cover other messages above the hotbar. Removing your land claim asks first, and claims show your new name after a gamertag change.
- Fixes: low durability warnings no longer repeat while a Mending tool hovers at the line. /realm:afk while you're AFK tells you so. Tropical fish count as peaceful mobs for Combat XP. Sol, Ida's master and Quill's parole now match in every story.
- For operators: the Realm Configuration menu comes back to the list after a command and asks before anything that affects everyone. Townsfolk placed while flying land on the ground. News pasted in parts while chat was open keeps every part.

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
- Fixes: Easy Building no longer gives back double blocks on undo, mirrored copies turn rails, torches and levers too, and big shapes no longer stall the realm. Gauntlet items always come back, even far from the dungeon. Platypuses calm down 15 seconds after you stop hitting them. Doom ends if you die. A rainbow's pot of gold always gets its chest, even on water.

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
