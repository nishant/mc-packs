# Realm news

Player-facing release notes, newest first. The newest entry is what pops up in game: every
`npm run bundle` runs `node tools/gen-news.mjs`, which copies it into Realm News
(`packs/news_bp/scripts/release.js`), and each player sees it once after the packs are updated.
Write for players, in plain ASCII (no curly quotes, dashes or emoji), short lines. Keep older
entries below as a changelog.


## Clearer preferences

- /realm:prefs: a setting the operators turned off for the whole realm now shows as gray text with the reason ("Locked by the operators: Coordinates HUD is Disabled for the whole realm") instead of a switch that does nothing.
- Changes apply when you press Save at the bottom. Closing with X now says "Nothing was saved" and offers Back to my preferences.
- Easy Building: a build speed changed in /realm:prefs works on your next build (no rejoin), Floating 3D panels always shows what you really have, the preview refresh is a list of the speeds that work, and your max blocks per build is what the menu says.
- Turning off the welcome popup no longer hides the welcome message in chat.

## A full quest box and smoother parties

- The story tracker has its own bigger box now (bottom right by default). It shows the quest and chapter, every step as a checklist ([>] the one it points at, [ ] still to do, [x] done) with where each one is, and says when steps go in any order.
- Nothing gets cut off after the first line any more: long steps keep their distance and direction, and anything that doesn't fit says "+2 more in /realm:saga".
- Night watches say what they wait for: "wait for nightfall (in about 4 min)" or "step out under the open sky".
- Parties: items to have on you (a compass, paper...) now count for the whole party, so one report to the questgiver finishes the chapter for everyone and you move on together.
- The box shows who shares a quest: "Party: all progress shared with Bob. One report counts for all."
- The coordinates HUD above the hotbar is one clear line in sections: X 120  Y 64  Z -340 | Facing NE | Day 12 6:30 AM. Party mates and the stats ticker join it as more sections.
- Fixed: in a party, the coordinates HUD disappeared while a mate was nearby.

## Neater side HUDs and a clearer minimap

- Mob health and the Elytra HUD default to the left, with the rotating scoreboard. Existing choices in /realm:prefs and realm settings are kept.
- Story readouts stay on the right and the real rotating Stats board stays on the left. Side readouts use their natural text height with the same small gap, not oversized blank cells.
- Readouts stack in numbered order and center vertically on each side. Empty positions collapse; native text, colors and useful two-line values stay unchanged.
- The minimap stays at its approved top-right position. Right-side readouts center below it; the original top compass is unchanged.
- The full native scoreboard height counts toward the left group. If a very tall board or large GUI scale cannot fit, use /realm:stats, hide optional readouts or choose a smaller GUI scale.
- All readout boxes, the radar and scoreboard leave the compass band clear, even when the compass is hidden.
- The minimap uses its old thick black border space for terrain instead, with a thin boundary and no dark edge shading.
- N, E, S and W stay visible when markers share their position. Your arrow and real-player markers are slightly larger; NPC and mob icon sizes are unchanged relative to map cells.

## World-fixed character names

- Townsfolk, caravan traders, wanderers, and story characters now use one world-fixed name helper above the character's head instead of viewer-relative projected labels.
- While a helper is active, the character's native caption uses invisible format codes to avoid drawing the same name twice. Native captions and helper names are resent when a new viewer approaches.
- If a helper cannot be created, the character keeps its ordinary readable name. Transformation ownership stays tied to an exact hidden marker.
- The final near-player rejoin cache-refresh correction passed native tests, but its latest 5-block production client view was not recaptured. Exact client draw distance and remaining visual acceptance are not guaranteed by server tests.

## Caravan traders, chest marks and menu titles

- Each caravan trader now sells goods of their own: 5 each, and no two traders sell the same thing, so visit all three.
- Caravan traders show their real names (Zahir, Old Marisol, Fennick) instead of NPC when you walk up to them.
- Operators can give a caravan trader a skin: sneak and tap it in creative mode. The skin comes back on every later visit.
- /realm:find now outlines the chest it found with green sparkles for 10 seconds, so you can spot it in a wall of chests.
- Section titles in menus (My preferences, Realm Help, Quick Stack help, finished stories) are normal size now instead of huge.


## Inventory controls and clearer terrain

- Inventory page controls sit together in the last three slots of the top row: previous, current page/menu, next. Old pages migrate without rebuilding native item data.
- Delayed inventory events no longer request extra page changes. A busy inventory menu rebuilds its page labels and actions before retrying.
- Minimap terrain samples include river water and visible roofs, with clearer elevation, masonry, and crop colors. The compass and radar keep using the same pose, destination, and region.
- The radar geometry is about 15 percent larger, and the scoreboard uses a right-anchored slot below the other right-side readouts.
- Physical inventory clicks and client HUD placement are not yet verified. The test-only name-range prototype is disabled; native name visibility is unchanged and 20-block readability is not claimed.

## Safer inventory pages and steadier realm tools

- Inventory pages now save native items, including filled shulker boxes, potions, and enchanted gear, across page changes, logout, and clean server restarts. Items that do not fit when pages shrink stay saved instead of dropping on the ground.
- Extra Realm Configuration items are removed automatically when carried, including old copies restored from another inventory page. Ordinary Nether Stars and the three page controls are left alone.
- Minimap terrain stays separate above and below ground, fills the rotated view while flying, and retries unloaded ground promptly. Off-map party and friend arrows are no longer hidden by compass badges.
- The scoreboard sidebar joins the bottom of the right HUD stack, with space reserved below the compass. The radar uses original generated frame art.
- Character names stay over their real heads using Minecraft's native names. Old floating helper labels are removed on upgrade; exact native name visibility remains controlled by Minecraft.

## Character names stay on the characters

- Townsfolk, caravan traders, wanderers, and story characters now use the game's own close-up names over the real character instead of a shared floating helper label that could drift toward another player.
- Old floating helper labels from upgraded worlds are loaded only long enough to be removed cleanly.
- The extra far-name sliders are gone from /realm:config because stable Bedrock does not let packs set a true per-player distance for native names.

## Operator buttons in red everywhere

- Operator-only buttons in every pack's own menu (stats, towns, caravan, news and more) are now red, like in the Realm Configuration menu. Players who aren't operators still never see them.

## Easier to read realm menu

- Operator entries in the Realm Configuration menu are now red instead of gold, which was hard to read on the gray buttons.
- Headings in the menu, like "What do you want to do?", are normal size instead of huge.
## A friendlier realm menu, less rain, softer rain indoors

- Everyone now gets the Realm Configuration item (the nether star with a gold name). Use it for every realm command you can use, sorted into six scrolling pages: My Screen & Toggles, Items & Building, Story & Adventure, Friends, Crowns & Fun, World & Events, and Towns & Townsfolk. Every button says what it does on its second line. Operators see their own commands in gold, plus Operator Tools.
- It rains about a quarter less: clear spells now last 30 to 90 minutes.
- Step inside and the rain fades to a soft, muffled version of itself instead of cutting out to a whoosh.
- You can see a small rainbow over the pot of gold when you get close. If the rainbow ends out at sea, the chest floats on the water instead of the pot vanishing as you swim by.
- The Lighthouse stands on solid ground and has an open balcony to keep watch from. Old lighthouses fix themselves when you come near.
- Stop tracking a quest from its page in the Story Log, and track it again when you want it.
- Special items say on their last description line where they work: in your hand, in your hotbar or offhand, worn, or anywhere in your inventory.

## Champions are back

- Champions spawn in the wild again. A few dropped items had been mistaken for champions, which used up the limit of 8 at once. They are cleared out now.

## Story bosses on time

- The Bell Warden and other story champions now come within seconds of you reaching their place. A spawn that went wrong used to leave you waiting 2 minutes for another try.

## Names across town

- Townsfolk, wanderers and caravan traders have floating names from up to 120 blocks away, even behind house walls and roofs. You don't have to aim directly at them.
- Operators: Show names from afar in /realm:config adjusts each pack's range from 0 to 200 blocks. Zero keeps only the ordinary close-up names.
- Each character's shared label follows the nearest player; other players may see it offset.

## Sieges that come, and steady rain

- The Gray Choir no longer scatters for want of "open ground". Its circles rise just outside a town's safe zone, about 110 blocks from Lanternford, and nobody was out there to load that ground. Now the Choir loads it itself, so the next siege night really comes.
- The Choir's pillagers gather as you walk up to a circle. Its Singer waits there from the start.
- Rain no longer cuts out and comes back as you pass under an awning, a doorway or a lamp. It goes muffled only once you've been under a roof for about 2 seconds.
- On phones and tablets, the indoor rain, wind and thunderstorm sounds no longer drop out for 20 seconds at a time.

## Effortless Building v5.0, NOS Rockets & Tornado Vortex

- Easy Building is now the full Effortless Building v5.0 experience: pick a mode, right-click to set your first anchor, watch the live 3D block outline stretch as you aim, and right-click again to build (or a third time for 3D height on cubes, cylinders, cones and slopes).
- Hold the Building Book (/realm:build_book): tap right-click for the floating 3D Mode Menu, hold right-click for the Quick Switch Wheel, left-click for the Block Palette, Sneak + left-click for Mirror/Array/Radial Modifiers, and Sneak + right-click for Settings.
- Craft NOS Rockets (1 firework rocket surrounded by 8 gunpowder) and use one while gliding with an elytra for a 3.5x nitrous speed burst with blue/cyan and orange flames.
- Tornadoes now have a dense, swirling multi-layered vortex funnel with a ground dust skirt and storm collar: step close in any gamemode and it sucks you in, spins you up the funnel and shoots you high out the top into the sky (leaving mobs, items and blocks untouched).

## Townsfolk stay home

- Every townsfolk now lives in a house of their own and stays inside it, day and night. No more wandering off, no more lunch or evening trips: knock on their door and they are there, facing you.
- The town grew east, past the end of the main road: Sol's observatory, Wren's stable, Brother Hollis's chapel, Moss's cottage by the graveyard and Old Tobin's fishing hut by the pond. All twelve townsfolk now have a home of their own.
- /realm:npc_who still shows the way to each of them.

## Your finished quests

- /realm:saga -> Finished now has two sections: Stories you finished to the end, and Quests, every chapter you finished in stories still going. No more "0 finished" after a dozen quests.

## More houses found

- Operators: /realm:npc_houses now finds houses with a porch roof, an awning or eaves over the front door, and neighbors' doors on a tight street count as separate houses.

## Story together

- Parties: one of you accepts a story chapter and it's accepted for the whole party. Mates see the conversation in a popup, and chat lists the steps.
- One report back gives everyone in the party their reward, and the choice made counts for everyone.
- Started a side story in a party? Your mates get a Join? popup.
- Everyone's quest box keeps the party's main quest on top, so you all follow the same story.
- Choir sieges now show the way: the compass star points to the town during the warning, then to the nearest circle still singing. The siege box says how far too.
- Circles find room more often: when the land around a town is too built up, they rise near the players defending it instead.
- If the Choir still can't find open ground, chat now says so. Nothing is lost.

## Storm watch

- Story steps that need a storm or rain (like The Storm Vigil) now say so in the quest box: the seconds still needed, and when the next storm is due.
- Operators: /weather gets put back by the Weather Almanac. You now get a chat line when that happens. Use /realm:weather_set instead.

## Home in town

- Townsfolk now live in the houses of the town: right outside their front door by day, inside at night. They stroll a few steps around and stop when you walk up to talk.
- The quest box on the right lists every quest you have going, not just one: the one you follow on top, the others under it.
- Fog and storm mist now look like real mist: wide, faint wisps lying low instead of round puffs.
- Compass: a destination's name is no longer cut off (Report to Warden Reyes).
- Operators: stand in the middle of the town and run /realm:npc_houses (or Move them into the houses around me in /realm:npc). /realm:npc_undo puts them back.

## Out and about

- Townsfolk can now live all around the village instead of in one crowd. Go find them: /realm:npc_who and the Minimap show the way.
- Townsfolk keep their skins: one that has to come back now looks the same as before.
- Operators: stand in the middle of the village and run /realm:npc_spread (or Spread them out around me in /realm:npc). It shows the new spots first.

## Tidy compass

- Compass: the place name under the strip no longer runs through the line. It sits just below it now.

## Bring the whole party

- Expeditions: starting one now asks your whole party, wherever they are. Everyone online gets a Join popup, even far away or in the Nether, and goes back to their own spot afterward.
- Operators: Teleport to a Player lists everyone else online, nearest first. Recent shows who an action was for, since it runs again right away.

## Follow the rainbow

- Rainbows: the dotted rainbow in the sky is gone. A rainbow on your compass now points to the pot of gold, with rainbow arrows at the ends of the strip when it's behind you.
- Compass: a house shows the nearest town and a red bed shows where you respawn. Turn either off in /realm:prefs > Minimap. Towns are in /realm:map > Pick a destination.
- Compass: the last icon on the right no longer drops below the strip.
- Dolphins: back to their old speed, and a dolphin you ride only swims where you steer it. It can stay under water as long as you ride.
- Champions now walk around trees and walls to reach you instead of getting stuck.
- Wanderers on the road no longer turn invisible when a monster comes near.
- Fen Charm: Poison really can't touch you now.

## Townsfolk stay put

- Townsfolk no longer hop up and down when you, or another townsfolk, stand in their spot: they wait beside it until it is free.
- Operators: /realm:npc_list marks townsfolk that share a spot, and placing one on another's spot warns you. Spread them out so the town feels lived in.
- The story tracker box never gets cut off: long steps end with "..." and extra steps show as "+2 more". /realm:saga has the full text.

## Counting down

Quests now show how many are left:

- The story tracker on the right is a small quest log: the quest's name on top, the next step in white, the other steps in gray.
- It counts down within a second of every kill: after 6 of 12, "Defeat 12 drowned" reads "Defeat 6 more drowned". Steps without a number show "(6 left)", "(60 s left)" or "(2 waves left)".
- No more progress notes flashing over the tracker: it counts by itself.
- The story log, Daily Quests and Bounty Board count down the same way.
- Mob Health: the box for the mob you hit now says "Drowned 14/20 HP", and "Drowned defeated" when it dies, so it no longer looks like a quest counter.

## Better together

Play the story with your party, and a lot of fixes from the Realm:

- Story: pick which quest your tracker follows with Track this quest in /realm:saga > Current quests. In a party it sets the tracker for everyone.
- Parties share the main story: you play one chapter together, at the pace of whoever is furthest behind, and progress on it counts for everyone.
- Party mates now share Daily Quest kills nearby, hear where a member died, travel together at waystones, can share a land claim, get letters sent to the whole party, and split treasure they find together.
- Townsfolk stand on top of paths and slabs instead of sinking in, and show their names instead of "NPC".
- The Minimap's compass and radar turn smoothly with you.
- Champions now slowly come looking for nearby players.
- Expeditions: no more phantoms stuck in corners, no free ladders in climbing rooms (jump the ledges; a fall drifts you gently down), and more jumping ledges.
- Silly Enchants: Disco, Rainbow Trail, Bubbles and confetti are easy to see now, and Grunt Birthday cheers "yaaay" with a party horn.
- Platypuses: feed them fish to heal or breed them, name tags always show, and leads attach properly.
- Dolphins: riders breathe under water, and ridden dolphins are about 20% faster.
- Lantern Fair: a lone pumpkin in the carve-off wins.

## Claims that hold

Another round of fixes:

- Land claims now cover stairs and slabs you sit on, cooking pots, slot machines, waystones and charged lightning rods: only the claim's players can use them.
- Only operators can claim land that reaches into a safe zone or a town.
- Mail subjects and letters no longer keep color codes.
- Story drowned and other sea creatures by the water come in the water, not on the shore.
- Field Journal: an "Also found" entry that made room for newer finds comes back quietly when you find it again.
- A merchant caravan that arrives while nobody is near stands on the ground instead of high in the sky.
- A meteor that lands at the edge of the loaded world waits for its crater instead of vanishing.
- Side HUD has its own pack icon.

## Lines that take turns

A few more fixes from the big review:

- The lines above your hotbar take turns: the Elytra HUD, Relics readouts, an expedition's run line, the build mode line and the story tracker no longer block each other.
- Story monsters and characters near a lake or the sea appear on the water's surface, not on the bottom.
- Story defenses: a wave only counts when its monsters fall. Waiting doesn't win it, and a wave stuck out of reach regroups.
- Field Journal: "Also found" keeps your 100 newest finds on each page instead of stopping at 40.

## A big round of fixes

We went through every pack looking for bugs. Here is what changed:

- The welcome popup is now a short guide to the realm: the story, what to do, handy commands and the rules.
- Quick Stack no longer drops your items into chests in someone else's land claim.
- Chest Finder only lists containers you can open: other players' locked chests and chests in their claims stay private.
- Story defenses wait while you're away, and attackers that vanished with their chunk regroup when you come back.
- Items you rename on a phone keyboard now count for story quests, and fish dropped next to your hook no longer count as catches.
- Expeditions: when several of you fall at once, everyone gets their own items back.
- Guilds: pumpkins, melons and ores you placed no longer count as harvests or mining after the realm restarts.
- Meteors burn up over water instead of leaving magma on the lake bed, tornadoes ride the water's surface, and storm fog and rain sounds reach you in a boat.
- Storm Chasing remembers lightning rods that oxidize or are waxed.
- Bounty targets over a lake or the sea come as drowned in the water, not land mobs on the bottom.
- The Field Journal's Ocean page can now be found: swim in deep water.
- Rain Charm, Tide Boots and the Stormchaser title count rain while you swim over a sandy sea floor.
- The Regatta course puts its checkpoints on the water, and the Deck never drops a locked item.
- The stats ticker shows up right away for new players and costs the server less.
- Community Goals and party chat answer instead of closing or doing nothing.
- Operators: moving a story place keeps its terrain snapshot, and /realm:npc_remove asks first.

## Shorter roads

The far story spots came closer to town.

- The Cartographer's three pins are now about 700 to 750 blocks out instead of 1,100 to 1,200.
- The Edges of the Map stations, the pillager outpost, the illager lodge, Drowned Rock and the raider camps moved in too. Anything within 300 blocks of spawn stays put.
- Story text and hints say the new distances, and the tracker points to the new spots.
- New treasure maps lead 400 to 1,000 blocks instead of 800 to 2,000.
- Operators: /realm:config -> Story Questlines -> Distance of far story spots (0.5 now, 1 for the old distances).

## Rook races you, and Pell walks with you

Rook the Rival doesn't just talk about bounties anymore.

- Get within 300 blocks of a bounty champion and Rook may turn up on the road. On his chapter "Three Bounties", he races you to it: 5 minutes from when you get close.
- Win the race and the bounty pays in full. Lose it and Rook got there first: finish it anyway for half the Crowns.
- With a treasure map, he races you to the chest too. Too slow and he takes half the coins (the loot stays yours).
- Beat him three times for real, and he may not take it well.
- Walking Pell to the Old Chapel? He's a cleric now and walks behind you step by step, facing where he goes. Nobody can hurt him.
- Operators: /realm:admin_title "Text" "Subtitle" 5 shows a title the minimap and side boxes step aside for. Use it instead of /title.

## A minimap

A compass strip now runs across the top of your screen.

- It shows which way you face, the region you're in, and icons: yellow for townsfolk, green for wanderers, blue for your party, red for mobs close by, tents for camps and diamonds for sites you found.
- Pick a destination with /realm:map: a townsfolk, a waystone, a camp, a site, where you died, a party mate or a spot you marked (/realm:map_mark). A gold star points the way and it says Arrived when you get there.
- No destination? The star follows your story's next step.
- Want more? Turn on the Radar in /realm:prefs -> Minimap: a small map of what's around you.
- /realm:map also gives Mara's Field Map. Hold it in your other hand to see the land.
- Hostile strangers in disguise never show up on it. Watch out.

## Wanderers now walk

The people you meet out on the road don't stand frozen anymore.

- Pilgrims, hermits, miners, storm-chasers, exiles and the Recurring Wanderers are villagers now, dressed for who they are: Pell as a cleric, Brannoch as an armorer, Hob as a toolsmith, and so on, in the clothes of the biome you meet them in.
- Travelers on the road are wandering traders (no llamas). Ghosts still float.
- They stroll around where they appeared or around their camp, and stop to listen while you talk.
- Tapping one still opens their talk menu, never a trade screen. Real villagers and traders trade as always.
- Zombies, lightning and lava can't hurt them.

## Callings and Relic Ascension

Seasoned adventurers can take up a Calling now, and Ida can wake the power in your relics.

- When your six skill levels add up to 75, Brother Hollis shows you the chapel book: choose one of six Callings (Delver, Warden, Pathfinder, Hearthkeeper, Woodwright, Stormcaller). The first choice is free.
- Each Calling gives a Calling Sigil with an ability (ores that glow, a rally cry, a burst of speed, a healing song, Haste II, static in the rain) and a talent tree: up to 10 points, three tiers, one capstone. See /realm:skills_calling.
- Reset your talents for 50 Crowns, or switch Calling at Hollis for 100 Crowns and up, at least 3 Realm days apart.
- Some talents work in other packs: cheaper waystones, treasure spots from farther away, longer dish effects, rarer fish, bigger builds, more Storm Glass.
- At Ida's forge, ascend a relic to +1, +2 and +3 Starlit with Relic Shards, Storm Glass and Crowns: shorter cooldowns, longer reach, and a unique bonus with a gold name. Story relics go past +1 once a story or a friendship allows it.
- Two of the same relic? Ida breaks one into 4 Relic Essence, which counts like shards.
- Carry all three relics of a set for a bonus: Storm (lightning can't hurt you), Tide, Deep or Sun.
- The guilds' top title is now Miners' Guildmaster (and so on), so it no longer reads like the Skills title Master Miner.

## Realm Calendar

The realm keeps a calendar now: seasons, festivals, and a Choir that comes for the towns.

- Every dawn is a new Realm day, and 96 of them make a year of four seasons. /realm:calendar shows the day and the next festival.
- Four festivals, four days each: guard turtle hatchlings at the Hatchling Tide, race boats at the Midsummer Regatta, carve pumpkins for the realm's vote at the Lantern Fair, and give gifts under falling stars on Starwright's Long Night (gifts to the townsfolk count double).
- Festival activities pay Festival Ribbons. Spend them at Quill's ribbon stall on titles, hats, recipe cards and two new trails.
- The townsfolk have 16 festival chapters, four each festival.
- Some nights the Gray Choir besieges a town: three Ritual Circles rise around it. Beat each circle's Choir Singer and ring its bell 5 times before 12 minutes are up. Hold the town and it's Heartened for a day (deliveries count extra); lose and it's Shaken. Nothing breaks a block.
- Each 3 Choir Cairns silenced in the Atlas make the Choir smaller.

## Atlas of the Realm

Every stretch of land has a name now, and there's something to find between the towns.

- Cross into a new region and its name comes up on screen: The Gray Downs, The Brine Shallows... with how many of its sites you've found.
- Out in the wilds, away from towns and claims, the realm builds wayside sites as you come near: shrines that bless you once a day, Choir cairns with a bell to break, abandoned camps, hermit huts, sunken wrecks, watch posts to hold, fossil digs, starglass pools and Fenn's old survey markers.
- 60 Starwright tablets tell the oldest story in the world, one at a time. Some are too worn to read until you've seen more of the main story. Finish an act and the ones you found read differently.
- Every first find pays Crowns, skill XP and guild reputation. Titles for 10, 25 and 50 regions and more, and a new Starwright glyphs trail at 25 sites.
- /realm:atlas shows your regions, sites, tablets and which way the nearest site is. Rather not see the banner? Disable Region banners in /realm:prefs.

## Wanderers of the Wilds

Out past the town lamps, you'll meet people on the road now.

- Go exploring, 300 blocks from spawn and away from towns and claims, and someone turns up about twice an hour. Walk up and tap them.
- Eight Recurring Wanderers: Pell the Pilgrim, a surveyor's ghost, a deep miner, a rival bounty hunter, a hermit, a storm-chaser, a Nether exile and a tinker. Each has a short questline and sets up a camp where they wait for you, with a waystone sign.
- Strangers ask for small favors: food, firewood, a shrine, a guard for their fire. Their names and requests change every time.
- Not everyone is friendly. After the prologue, watch for a toll man with no road, a sailor far from the sea, and worse. Each one gives itself away if you listen. Warden Reyes's friends get a "Something's off..." button.
- The Field Journal has a new Wanderers page, with the title Friend of the Road.
- /realm:wander shows the wanderers you know and their camps. Rather not meet anyone? Disable Meet wanderers in /realm:prefs.

## The townsfolk remember you

Hearth & Hearsay: the twelve townsfolk now get to know you.

- Talk to them every day, bring gifts (sneak-tap holding something) and help with their favors and stories. Each one goes from Stranger to Confidant.
- Everyone loves, likes and hates different things. Tobin loves salmon. Hollis can't bear a bell.
- Friends get 10% off: Quill's market, Bea's recipes, Elsie's beds, Mara's maps and Ida's forge. Tobin pays his friends more for fish.
- Become Close and they write you a letter, and tell you their heart story: 12 new stories, one each.
- Confidants get a title, the new Hearts trail and a keepsake every week.
- Gossip! Slay a champion or land a legendary fish and the town will talk about it.
- The townsfolk remember your story choices, and say so. And if you took the Hollow Crown, they remember that too.
- Townsfolk can now have a lunch spot and an evening spot. The realm also counts its days now: each dawn is a new Realm day.

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
