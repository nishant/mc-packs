// Story content: see docs/STORY_BIBLE.md. Written by the side_bold writer.
// Five side questlines: The Wardens' Oath (reyes), Smuggler's Run (quill), The Mayor's Burden (bram),
// Edges of the Map (mara) and The Forge That Sings (ida). Keep every id (story, chapter, choice) once
// published: players' progress is saved by them. Plain ASCII only (plus § color codes).
/** @typedef {import("../types.js").Story} Story */

const R = "§eReyes:§r ";
const Q = "§eQuill:§r ";
const B = "§eBram:§r ";
const M = "§eMara:§r ";
const I = "§eIda:§r ";
const MOSS = "§eMoss:§r ";
const HAT = "§eHattie:§r ";
const GAR = "§eGarrow:§r ";

const TRUSTED = { "g:quill": "trusted" };
const EXPOSED = { "g:quill": "exposed" };
const SILENCED = { "drowned_bell.bell": "silence" };
const RUNG = { "drowned_bell.bell": "ring" };
const SHARED = { "last_map.map": "share" };
const KEPT = { "last_map.map": "keep" };

// Offsets from world spawn (the tracker names them with `mark`).
const OUTPOST = { x: -640, z: 520 };
const FARM = { x: 260, z: -310 };
const RED_CAMP = { x: 520, z: -560 };
const RAIDER_CAMP = { x: 560, z: -640 };
const LODGE = { x: -820, z: -480 };
const DROWNED_ROCK = { x: 420, z: 760 };
const SQUARE = { x: 10, z: -14 };
const MOON_FARM = { x: 180, z: 90 };
const GARROW_FARM = { x: 240, z: 150 };
const FIELD = { x: 210, z: 120 };
const EAST = { x: 1300, z: 60 };
const NORTH = { x: -80, z: -1350 };
const SOUTHWEST = { x: -1100, z: 1050 };
const SOUTHEAST = { x: 1150, z: 1150 };
const WEST = { x: -1400, z: -120 };
const FORGE = { x: -40, z: 28 };

const NIGHT_MOBS = ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:creeper", "minecraft:husk", "minecraft:stray"];
const FENCES = ["minecraft:oak_fence", "minecraft:spruce_fence", "minecraft:birch_fence", "minecraft:jungle_fence", "minecraft:acacia_fence", "minecraft:dark_oak_fence", "minecraft:mangrove_fence", "minecraft:cherry_fence", "minecraft:bamboo_fence", "minecraft:pale_oak_fence", "minecraft:crimson_fence", "minecraft:warped_fence"];
const PLANKS = ["minecraft:oak_planks", "minecraft:spruce_planks", "minecraft:birch_planks", "minecraft:jungle_planks", "minecraft:acacia_planks", "minecraft:dark_oak_planks", "minecraft:mangrove_planks", "minecraft:cherry_planks", "minecraft:bamboo_planks", "minecraft:pale_oak_planks", "minecraft:crimson_planks", "minecraft:warped_planks"];
const BOATS = ["minecraft:boat", "minecraft:chest_boat"];

/** @type {Story} */
const WARDENS_OATH = {
  id: "wardens_oath",
  title: "The Wardens' Oath",
  short: "Wardens' Oath",
  giver: "reyes",
  kind: "side",
  tones: ["violent", "heroic", "dangerous", "sad"],
  summary: "Warden Reyes has three new recruits and not nearly enough time to train them.",
  chapters: [
    {
      id: "drill",
      title: "The Drill Yard",
      intro: [
        `§eWarden Reyes§r is watching three young people swing practice swords at a hay dummy. One of them hits himself in the knee.\n\n${R}Recruits. The council gave me three. I asked for thirty.`,
        `${R}Dace is the loud one. Brynn is the quiet one with the bow; she's better than she thinks. Orrin used to be a baker. He's big, he's gentle, and he apologizes to the dummy.`,
        { text: `${R}They've heard about you. The one who went down to the sunken bell and shut it up for good. Dace wants to shake your hand. I want you to show them what a real fight looks like.`, when: SILENCED },
        { text: `${R}They've heard about you. The one who made the old harbor bell sing again. Dace hums it on watch, badly. I want you to show them what a real fight looks like.`, when: RUNG },
        `${R}Tonight, when the dark brings the usual trouble, take down eight of them while the recruits watch. Fast: five minutes from the first, or it doesn't count. A slow fight teaches them nothing.`,
        `${R}And they need shields. Three. Orrin keeps blocking with his face.`,
      ],
      objectives: [
        { type: "defeat", label: "At night, defeat 8 monsters within 5 minutes while the recruits watch", mobs: NIGHT_MOBS, count: 8, night: true, within: 300 },
        { type: "deliver", label: "Bring Reyes 3 shields for the recruits", npc: "reyes", item: "minecraft:shield", count: 3 },
      ],
      outro: [
        "The recruits watch from the fence, wide-eyed. When the last one falls Dace whoops so loud a cow two fields over starts running. Brynn writes something in a little book. Orrin claps, then apologizes for clapping.",
        `${R}Not bad. You fight like someone who expects to go home afterward. That's the right way to fight.`,
        `${R}Shields go to the recruits. Orrin will take his to bed, watch. Get some sleep. Tomorrow I'm sending you somewhere you won't like.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:arrow", amount: 16 }] },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "Monsters spawn in the dark: wait for night near the edge of town, and the five-minute clock starts with your first kill. Shields are crafted from 6 planks and 1 iron ingot.",
    },
    {
      id: "outpost",
      title: "The Outpost on the Ridge",
      intro: [
        `${R}A trader came in this morning with two arrows in his cart and none in himself, by pure luck. Pillagers. They've put up an outpost on a ridge to the southwest, about {far:-640,520} blocks out.`,
        `${R}An outpost that close means raids by the next moon. I'm not waiting for the next moon.`,
        `${R}Their sergeant is a nasty piece of work called Vell. Crossbow, good aim, worse temper. Hold the yard against his garrison until he comes down to see what the noise is. Then put him down.`,
        `${R}Take a horse if you have one. Take food either way. And if they're flying a banner, I want it for my wall.`,
      ],
      objectives: [
        { type: "reach", label: "Ride to the pillager outpost (about {far:-640,520} blocks southwest)", offset: OUTPOST, mark: "Pillager outpost", radius: 32 },
        {
          type: "defend",
          label: "Fight off the outpost's garrison",
          offset: OUTPOST,
          mark: "Pillager outpost",
          radius: 24,
          waves: [
            { mobs: ["minecraft:pillager"], count: 4 },
            { mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 5 },
          ],
        },
        {
          type: "defeat",
          label: "Defeat Sergeant Vell",
          offset: OUTPOST,
          mark: "Pillager outpost",
          radius: 40,
          count: 1,
          champion: {
            tag: "realm:saga:sergeant_vell",
            mob: "minecraft:pillager",
            name: "Sergeant Vell",
            trait: "Never misses twice",
            warn: "A horn sounds from the outpost tower. Sergeant Vell is coming down.",
            health: 30,
            adds: { mobs: ["minecraft:pillager"], count: 3 },
          },
        },
      ],
      outro: [
        "The ridge goes quiet. Smoke rises from the outpost's cookfire, and a gray-and-black banner cracks in the wind above the empty tower.",
        `${R}Vell's down? Good. Better than good.\n\nShe turns one of his crossbow bolts over in her fingers.\n\n${R}This is warden steel. Ours. Someone's been selling to them, or they've been robbing our wagons.`,
        `${R}Either way, they'll want payback, and they know which road we took home. Rest tonight. Tomorrow we hold the old watchtower. If they come, that's the road they'll use.`,
        "On the ride home Dace tells the story of the fight four times, getting braver in every version. Orrin listens to all four, nodding, and quietly gives you the last of his bread. 'For the next one,' he says. 'There's always a next one, Reyes says.'",
      ],
      reward: { levels: 4, crowns: 45, items: [{ item: "minecraft:iron_ingot", amount: 6 }] },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "The outpost is about {far:-640,520} blocks southwest of spawn; the tracker points the way, and a horse saves you an hour of walking. Bring a shield, food and arrows: the garrison fights in two waves, then Vell comes down with three more crossbows.",
    },
    {
      id: "long_watch",
      title: "The Long Watch",
      intro: [
        `${R}The Ruined Watchtower. The wardens built it a hundred years ago to see raiders coming. We stopped manning it in the Year of the Long Storm, when every hand went down to the harbor. Nobody ever went back.`,
        `${R}It's still the best view of the east road. Tonight we take it back: you, me and the recruits. Dace begged. Orrin brought bread. Brynn just showed up, which is how Brynn says yes.`,
        `${R}The raiders will come at night, in waves, because they think the dark frightens us. Hold the tower. Then stand watch on top until first light, so they know we didn't run.`,
        `${R}I hold the road with Dace and Brynn. Orrin takes the lower stair. You take everything else. That's an order. Mostly.`,
      ],
      objectives: [
        {
          type: "defend",
          label: "Hold the Ruined Watchtower against the raiders",
          place: "watchtower",
          radius: 20,
          waves: [
            { mobs: ["minecraft:pillager"], count: 4 },
            { mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 5 },
            { mobs: ["minecraft:vindicator", "minecraft:pillager", "minecraft:witch"], count: 6 },
          ],
        },
        { type: "vigil", label: "Stand watch on the tower after midnight (2 minutes, outdoors)", place: "watchtower", radius: 16, seconds: 120, timeOfDay: [18000, 23000], outdoors: true },
        {
          type: "event",
          optional: true,
          label: "Hold the watch under a Blood Moon",
          events: ["blood_moon"],
          place: "watchtower",
          radius: 24,
          when: { "pack:moon_bp": "on" },
          set: { red: "moon" },
          bonus: { levels: 2, crowns: 30 },
          hint: "A Blood Moon rises now and then on its own. Be at the Ruined Watchtower while one is up, before you report back to Reyes.",
        },
      ],
      outro: [
        "Dawn comes up gray over the east road. The last raider is a shape running into the trees. Dace is laughing too hard, the way people laugh when they've been afraid all night.",
        "Then Brynn comes up the stairs alone, and she isn't laughing.\n\nOrrin held the lower stair the whole night. Nothing got past him. He never told anyone he'd been hit. At first light he sat down against the wall, and he didn't get up again.",
        "§eReyes§r takes off her helmet. For a long moment she says nothing at all. Below, Dace has stopped laughing.",
        `${R}We carry him home. All of us. Then I find out who sent them.`,
        { text: `She looks up at the last of the red moon going pale in the west.\n\n${R}The old wardens said a Blood Moon always takes one. I never believed it. You held under it anyway. Remember that, and not the rest.`, when: { red: "moon" } },
      ],
      reward: {
        levels: 4,
        crowns: 50,
        codex: { id: "watchtower", title: "The Ruined Watchtower", text: "Built by the wardens a century ago to watch the east road. Abandoned in the Year of the Long Storm, when every warden was called down to the harbor and none came back up the hill. Retaken by Reyes's company for one night. A recruit named Orrin held its lower stair until dawn." },
      },
      rep: [{ guild: "wardens", amount: 15 }],
      hint: "The Ruined Watchtower is on the tracker. Get there before dark and light the ground around it so nothing spawns at your back. Stay within 20 blocks while three waves come (the last has a witch: kill her first). After midnight, stand on or by the tower in the open until the vigil fills.",
    },
    {
      id: "embers",
      title: "Embers on the Road",
      intro: [
        `§eReyes§r has not slept. Her map is covered in new red marks.\n\n${R}Orrin's mother came by. She brought me bread. His bread; she said he'd left a batch rising. I didn't know what to say to her, so I said I would make it count.`,
        `${R}The raiders who hit the tower burned a farm on their way out, about {far:260,-310} blocks northeast. Nobody hurt there, thank the stars. But they left in a hurry, and people in a hurry leave things behind.`,
        `${R}Search the farm. Find out who leads them. Then find where they went. Do not engage. I mean that one all the way.`,
      ],
      objectives: [
        {
          type: "inspect",
          label: "Search the burned farm for clues",
          offset: FARM,
          mark: "Burned farm",
          radius: 20,
          clues: [
            { dx: 3, dz: 2, text: "A broken crossbow bolt with warden steel at the tip. The fletching is dyed red." },
            { dx: -4, dz: 5, text: "Boot prints, heavy ones, circling the well over and over. Someone stood here a long time, giving orders." },
            { dx: 6, dz: -3, text: "A torn scrap of a tally sheet: 'Tower. The big one on the stair. Got him. -M.' The handwriting is neat and careful. That makes it worse." },
            { dx: -2, dz: -6, text: "Red handprints on the barn door, made on purpose. A signature. Every warden on the frontier knows it: the Red Hand." },
          ],
        },
        { type: "follow", label: "Follow the trail of embers to the raiders' camp", from: { offset: FARM, mark: "Burned farm" }, to: { offset: RED_CAMP, mark: "Raider camp", radius: 12 }, wisp: "Trail of embers", stray: 14 },
      ],
      outro: [
        "The embers end at a camp in a hollow: banners, a cage, a war-horn hanging on a post. Nobody home. They're out hunting.",
        `${R}The Red Hand. Captain Marrow. I fought him once, years ago, before I was captain. He gave me the long scar on my arm and I took two of his teeth. I'd hoped he died somewhere cold.`,
        `${R}He tallies kills. He wrote Orrin down like a line in a shop book.\n\nShe folds the scrap very small.\n\n${R}Next time he comes home to that hollow, someone will be waiting.`,
      ],
      reward: {
        levels: 3,
        crowns: 30,
        items: [{ item: "minecraft:iron_chestplate", amount: 1, name: "Warden's Coat", lore: ["Patched twice.", "Still holds."] }],
        codex: { id: "red_hand", title: "The Red Hand", text: "Captain Marrow, a raider who marks his raids with red handprints and keeps a tally of everyone he kills in a neat little book. Reyes fought him once, years ago. He is the one who sent the raiders to the Ruined Watchtower." },
      },
      rep: [{ guild: "wardens", amount: 5 }],
      hint: "The burned farm is about {far:260,-310} blocks northeast of spawn. Clues glow faintly: tap near each one. Then the embers lead about {leg:260,-310,520,-560} blocks further northeast; stay close, or they stop and wait for you.",
    },
    {
      id: "red_hand",
      title: "The Red Hand",
      intro: [
        `${R}Marrow comes back to that hollow at night. Always at night. He likes the dark the way a cat likes a warm stove.`,
        `${R}I can't go. The council wants me in town when the next wagon comes in, and I won't leave Dace and Brynn without a captain. So it's you. I'm sorry. I'm also not sorry: you're the best I've got.`,
        `${R}Wear real armor. Iron at least; I put my old coat in your pack for a reason. He hits like a falling tree, and he likes to hit the same place twice.`,
        `${R}And listen. This isn't revenge. Revenge is sloppy. This is making sure there's no next Orrin. Understood?\n\nShe holds your eye until you nod.\n\n${R}Good. I didn't understand it either, the first time.`,
      ],
      objectives: [
        { type: "wear", label: "Wear a chestplate of iron or better", items: ["minecraft:iron_chestplate", "minecraft:diamond_chestplate", "minecraft:netherite_chestplate"], slot: "chest" },
        {
          type: "defeat",
          label: "Defeat Captain Marrow, the Red Hand, at his camp (at night)",
          offset: RED_CAMP,
          mark: "Raider camp",
          radius: 40,
          count: 1,
          night: true,
          champion: {
            tag: "realm:saga:red_hand",
            mob: "minecraft:vindicator",
            name: "Captain Marrow, the Red Hand",
            trait: "Hits the same place twice",
            warn: "A war-horn sounds in the hollow. The Red Hand has come home.",
            health: 60,
            adds: { mobs: ["minecraft:vindicator", "minecraft:pillager"], count: 5 },
          },
        },
      ],
      outro: [
        "The war-horn falls off its post and rolls into the ashes of the cookfire. The Red Hand is gone. His tally book is inside his coat. It is very long.",
        "§eReyes§r reads every page without a word. At the end she tears out the last line, the one about the stair, and puts it in her pocket. The rest goes into the fire.",
        `${R}That's done, then. It doesn't feel the way I thought it would. It never does.`,
        `${R}Tomorrow we bury Orrin properly. Moss is digging. Come.`,
      ],
      reward: { levels: 5, crowns: 60, items: [{ item: "minecraft:golden_apple", amount: 1 }] },
      rep: [{ guild: "wardens", amount: 15 }],
      hint: "The raider camp is about {far:520,-560} blocks northeast of spawn, where the ember trail ended. Marrow only comes at night. At half health he calls five more raiders: fight with your back to a wall and keep a golden apple ready.",
    },
    {
      id: "orrins_stone",
      title: "Orrin's Stone",
      intro: [
        "The whole warden company turns out in clean coats. Dace has polished his boots twice. Brynn has spelled Orrin's name in arrowheads on a board, and she won't let anyone help her carry it.",
        `${R}Moss says the old graveyard has room by the east wall, under the lantern. Orrin liked lanterns. He said they were bread ovens for the night.`,
        `${R}Build him a stone. Something solid. Then ask Moss about the words, and stand the dusk watch with us. Wardens stand one sunset for their dead. It's the oldest thing we do.`,
        "Dace finds you before the service, boots shining, eyes red.\n\n§eDace:§r He always let me have the end of the loaf. The crusty bit. Said he didn't like it. He liked it. I knew he liked it. I took it anyway.",
      ],
      objectives: [
        { type: "place", label: "Build Orrin a gravestone at the Old Graveyard (6 stone bricks)", blocks: ["minecraft:stone_bricks", "minecraft:mossy_stone_bricks", "minecraft:chiseled_stone_bricks", "minecraft:cracked_stone_bricks"], count: 6, place: "graveyard", radius: 16 },
        { type: "talk", label: "Ask Moss the Gravedigger what to carve on it", npc: "moss" },
        { type: "vigil", label: "Stand the dusk watch at the Old Graveyard (1 minute at sunset)", place: "graveyard", radius: 16, seconds: 60, timeOfDay: [11500, 13800] },
      ],
      outro: [
        `§eMoss§r leans on his shovel while the sun goes down.\n\n${MOSS}Carved plenty of stones. Most say 'beloved'. Bit much, if you ask me. The dead don't need flattering. They need remembering right.`,
        `${MOSS}So this one says: ORRIN. HE HELD THE STAIR. The rest you lot can carry around in your heads. That's where it keeps best.`,
        "Dace cries without hiding it. Brynn doesn't cry at all; she just stands closer to the stone than anyone. Reyes stays at attention until the lantern comes on, and then a little longer.",
        `${R}Tomorrow, at the tower. Dawn. Wear something clean.`,
      ],
      reward: { levels: 3, crowns: 25, journal: { entry: "orrin", label: "Orrin's Stone" } },
      rep: [{ guild: "wardens", amount: 5 }],
      hint: "The Old Graveyard is on the tracker. Place 6 stone bricks (any kind) within 16 blocks of it and talk to Moss in town. Then stand at the graveyard as the sun goes down: the vigil only counts around sunset.",
    },
    {
      id: "oath",
      title: "The Oath at Dawn",
      intro: [
        "The watchtower looks different at dawn, with its banners mended. The company stands in a line on the road below: Dace, Brynn, a dozen wardens you half know, and one empty space nobody fills.",
        `${R}The oath is short. We wrote it short so a scared nineteen-year-old can remember it at the top of a stair in the dark.`,
        `${R}It goes: 'I keep the light. I hold the line. I bring them home.' Then I ask you what a warden holds, and you answer. Get it wrong and Dace will never let you forget it.`,
        `${R}Light the fire first. Every oath on this hill has been sworn by the tower fire. Then come stand by me.`,
      ],
      objectives: [
        { type: "interact", label: "Light the watchtower's fire (use or hit a campfire there)", place: "watchtower", blocks: ["minecraft:campfire", "minecraft:soul_campfire"], count: 1, radius: 10 },
        { type: "answer", label: "Answer Reyes before the company", place: "watchtower", radius: 12, question: `${R}Before the fire and the company: what does a warden hold?`, answers: ["the line", "line", "i hold the line"] },
      ],
      outro: [
        `${R}The line. Yes.\n\nThe company says it back, all together, and it carries down the east road farther than you would think.`,
        `${R}Now the last part. That's yours, not mine. Every warden swears to be one thing above the rest: a shield or a sword. There's no wrong answer. There's only the one you can live with at the top of a stair.`,
        { text: `${R}I've watched you. You spare what can be spared. I think I know which you'll pick. Say it anyway.`, when: { "g:mercy": ">=3" } },
        { text: `${R}I've watched you. You finish what needs finishing. I think I know which you'll pick. Say it anyway.`, when: { "g:iron": ">=3" } },
      ],
      choices: [
        {
          id: "shield",
          label: "Swear as a shield: bring them home",
          set: { oath: "shield" },
          inc: { "g:mercy": 1 },
          rep: [{ guild: "wardens", amount: 20 }],
          reply: [
            `${R}A shield. Orrin would have chosen that.\n\nShe pins a small iron badge to your coat. Her hands are steady. Her voice almost is.`,
            `${R}Welcome to the wardens. You're stuck with us now. Dace, stop whooping. ...Fine. One more.`,
            "Brynn, who never says anything, steps out of the line and shakes your hand. Then she goes back and stands very straight, next to the empty space.",
          ],
        },
        {
          id: "sword",
          label: "Swear as a sword: end the threat",
          set: { oath: "sword" },
          inc: { "g:iron": 1 },
          rep: [{ guild: "wardens", amount: 20 }],
          reply: [
            `${R}A sword. Someone has to be. I swore the same, once, on this hill.\n\nShe pins a small iron badge to your coat.`,
            `${R}Just remember who the sword is for. It's for the stair. It's for Orrin. Welcome to the wardens.`,
            "Brynn, who never says anything, steps out of the line and shakes your hand. Then she goes back and stands very straight, next to the empty space.",
          ],
        },
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Sworn Warden",
        journal: { entry: "wardens_oath", label: "The Wardens' Oath" },
        codex: { id: "wardens_oath", title: "The Wardens' Oath", text: "'I keep the light. I hold the line. I bring them home.' Sworn by the tower fire at the Ruined Watchtower, at dawn. Each warden then swears to be a shield or a sword. It was written short so a frightened recruit could remember it in the dark." },
      },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "At the Ruined Watchtower, use or hit a campfire within 10 blocks of the tower (place one in the fire pit if it's bare). Then answer Reyes there: the answer is in the middle line of the oath.",
    },
  ],
};

/** @type {Story} */
const SMUGGLERS_RUN = {
  id: "smugglers_run",
  title: "Smuggler's Run",
  short: "Smuggler's Run",
  giver: "quill",
  kind: "side",
  tones: ["stealth", "funny", "dangerous"],
  summary: "Quill has a job for you. Several jobs. Most of them are legal-ish.",
  requires: { stories: ["act2_choir"] },
  chapters: [
    {
      id: "crate",
      title: "The Crate Job",
      intro: [
        { text: `§eQuill§r is leaning on his stall like he owns the square. He doesn't, but he's working on it.\n\n${Q}My favorite double agent! Partner. Friend. Person who knows exactly how much trouble I'm in. Sit. Have a fig.`, when: TRUSTED },
        { text: `§eQuill§r is thinner than you remember, with a gray jail pallor under the charm. He sees you and his smile goes flat.\n\n${Q}Well. The one who turned me in. Reyes lets me out by day now, on a leash she calls parole; nights I'm back in the cell. Good behavior. I behaved extremely well, out of spite.`, when: EXPOSED },
        { text: `${Q}I'd tell you to leave, but you're the only person in town who can sneak, fight, and doesn't owe Bram money. So. Business. No hugging.`, when: EXPOSED },
        `${Q}Raiders hit one of my wagons on the north road. They took one crate. One, out of twelve. You know why? Because it's the crate with money sewn into the lining. Somebody talked.`,
        `${Q}They're camped about {far:560,-640} blocks northeast. Walk in, reach the crate, walk out. If they see you, they burn it; I've met these people. Crouch, stay behind things, and be a shadow with good manners.`,
        `${Q}Then lie low for a night. Sleep somewhere. Anywhere. Thieves who brag at the inn on the same night get caught. I would know. I'm usually the one who sells them out.`,
      ],
      objectives: [
        {
          type: "stealth",
          label: "Sneak into the raider camp and reach Quill's crate unseen",
          offset: RAIDER_CAMP,
          mark: "Raider camp",
          radius: 40,
          guards: { mob: "minecraft:pillager", count: 4, name: "Camp Guard" },
          goal: { dx: 6, dz: -4 },
          detect: 14,
          detectSneak: 5,
          onSpotted: "reset",
        },
        {
          type: "sleep",
          label: "Sleep in a bed to lie low for a night",
          vision: [
            { title: "A Dream", text: "You dream of wanted posters. Every one has your face on it, drawn badly. Under each one, in Quill's handwriting: REWARD: ONE FIG.", seconds: 6 },
            { text: "Somewhere a goat is reading the posters out loud. It sounds a lot like Mayor Bram.", seconds: 5 },
          ],
        },
      ],
      outro: [
        `${Q}You did it. You absolute ghost. Look at this lining. Not a stitch out of place.\n\nHe slits it with a fruit knife. Out slides a fat roll of coins, each stamped with a little gray bell.`,
        { text: `${Q}Choir money. Remember my... arrangement? I've been skimming them for weeks. Reyes knows. Mostly. Somebody in that camp knew exactly where to look, which means somebody knows I'm skimming. Delightful.`, when: TRUSTED },
        { text: `${Q}Choir money. Yes. I kept a little back when they jailed me. Don't look at me like that; a man has to eat when he gets out. Somebody knew exactly where it was. Somebody's watching me, and it isn't only Reyes.`, when: EXPOSED },
        `${Q}Good morning, by the way. You look rested. Criminal life suits you. Tomorrow I need a map that isn't mine.`,
      ],
      reward: { levels: 3, crowns: 35 },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "The raider camp is about {far:560,-640} blocks northeast of spawn (a horse helps). Crouch for the last stretch: guards see you from 14 blocks walking but only 5 sneaking. Come in from behind cover. If you're spotted, you start over at the edge. Then sleep in any bed.",
    },
    {
      id: "borrowed_map",
      title: "The Borrowed Map",
      intro: [
        `${Q}The coin was going somewhere. The raiders were paid to carry it to an illager lodge out west, about {far:-820,-480} blocks. The illagers keep a map room there, and the Choir pays them to keep it.`,
        `${Q}I need that map. Not to steal. To borrow. You'll copy it in your head and leave it where it was, and nobody will ever know. That's the difference between stealing and borrowing.`,
        `${Q}Now, illagers. Clever folk, terrible eyes. Wear a carved pumpkin on your head and to them you're a short, round fellow with a lovely complexion. They'll only notice you if you walk right into them.`,
        { text: `${Q}Yes, I know how it sounds. Consider it a small fee for the jail. You owe me one ridiculous hat. Wear it.`, when: EXPOSED },
        { text: `${Q}Trust me. You did before, and look how well that went. Mostly.`, when: TRUSTED },
      ],
      objectives: [
        { type: "wear", label: "Wear a carved pumpkin on your head", items: ["minecraft:carved_pumpkin"], slot: "head" },
        {
          type: "stealth",
          label: "Sneak through the illager lodge to the map room in disguise",
          offset: LODGE,
          mark: "Illager lodge",
          radius: 36,
          guards: { mob: "minecraft:vindicator", count: 3, name: "Lodge Keeper" },
          goal: { dx: -5, dz: 5 },
          detect: 16,
          detectSneak: 4,
          onSpotted: "ambush",
          disguise: { slot: "head", item: "minecraft:carved_pumpkin" },
        },
      ],
      outro: [
        "You walk right past a vindicator. It nods to you. You nod back. It is the strangest moment of your life so far, and you've fought a drowned thing wearing a weather vane.",
        "The map shows the whole coast with every cove marked by a little gray bell. One mark is fresh. Beside it, a note: 'Honey run. Drowned Rock. The trader pays.'",
        `${Q}The trader. That's me. I'm the trader. I set up a honey run to Drowned Rock last month, a perfectly ordinary bit of tax evasion. Someone is going to be waiting for me there.`,
        `${Q}So we'll go. Obviously. With a boat full of honey and a plan. I'll have the plan by tomorrow. Probably by tomorrow. You can take the pumpkin off now. Or don't. It's growing on me.`,
      ],
      reward: {
        levels: 3,
        crowns: 40,
        codex: { id: "choir_coast", title: "The Choir's Coast Map", text: "A map kept in an illager lodge for the Gray Choir. Every cove on the coast is marked with a small gray bell. The Choir pays outsiders to carry its coin and keep its secrets, and it knows more about Quill's business than Quill would like." },
      },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "The illager lodge is about {far:-820,-480} blocks west-northwest of spawn; ride a horse. Carve a pumpkin with shears and wear it. With it on, the keepers only see you from 4 blocks: walk wide around them to the map room. If they spot you, they attack.",
    },
    {
      id: "honey_run",
      title: "The Honey Run",
      intro: [
        `${Q}The plan. We run the honey to Drowned Rock as if nothing's wrong. Whoever's waiting expects me. They'll get you instead, which is safer for me and more interesting for you.`,
        `${Q}Mayor Bram taxes honey at a rate I can only call personal. So it's contraband. Bring six bottles; mine are under the floor, the floor is under Reyes's nose, so use your own.`,
        `${Q}Row three hundred blocks along the coast. The drowned come up after honey boats, don't ask me why, it's a whole thing. If they swarm you, sink four fast, inside three minutes, before they drag the boat under.`,
        `${Q}Then meet my buyer at the rock. Her name is Sal. One eye, two cutlasses, three husbands. Do not mention the husbands.`,
        { text: `${Q}Last time I sent someone to Sal they mentioned the husbands. He came back three days later wearing a barrel. Very well made barrel. Still.`, when: TRUSTED },
        { text: `${Q}I would go myself, but the terms of my parole say I stay within a day's walk of Reyes. She was very specific. She drew a map. It had a skull on it.`, when: EXPOSED },
      ],
      objectives: [
        { type: "collect", label: "Have 6 honey bottles (the contraband)", item: "minecraft:honey_bottle", count: 6 },
        { type: "ride", label: "Row a boat 300 blocks along the coast", mobs: BOATS, distance: 300 },
        { type: "defeat", label: "Sink 4 drowned within 3 minutes", mobs: ["minecraft:drowned"], count: 4, within: 180 },
        {
          type: "meet",
          label: "Meet One-Eyed Sal at Drowned Rock",
          offset: DROWNED_ROCK,
          mark: "Drowned Rock",
          radius: 16,
          who: { id: "sal", name: "One-Eyed Sal", entity: "minecraft:wandering_trader" },
          pages: [
            "§eSal:§r You're not Quill. Good. Quill owes me for a goat. Long story. Worse ending.",
            "§eSal:§r Here's the thing, friend. Somebody paid me double to sink Quill's boat tonight. Gray hood, soft voice, coins with little bells on. I took the money. I never said I'd do the job.",
            "§eSal:§r Tell Quill: the Choir knows. They know he's been skimming, and they know about the honey. Next time it won't be me waiting. Now hand over the honey. I've got a cold.",
          ],
        },
      ],
      outro: [
        `${Q}Sal said that? Sal said the Choir knows?\n\nFor once Quill has nothing clever to say. He sits down on a crate of what is definitely not stolen pepper.`,
        { text: `${Q}You know what's funny? When you turned me in, I thought: that's it, the worst has happened. Turns out the worst was just waiting its turn.`, when: EXPOSED },
        { text: `${Q}You know what's funny? When you trusted me, I thought: finally, someone sees the good in me. Turns out the Choir sees it too. They see everything.`, when: TRUSTED },
        `${Q}They'll come for the cove. My cove. I need help, and I hate needing help. Come back tomorrow. I'll have a better plan. Or a worse one with more fireworks.`,
      ],
      reward: { levels: 4, crowns: 45, items: [{ item: "minecraft:honeycomb", amount: 6, name: "Hush Money", lore: ["Sticky.", "Don't ask."] }] },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "Any honey bottles count: use glass bottles on a full beehive. Ride any boat 300 blocks in total. Drowned are thickest at night in deep water; the three minutes start with the first one. Drowned Rock is about {far:420,760} blocks south-southeast of spawn: row along the coast and walk the last stretch if you have to.",
    },
    {
      id: "inspector",
      title: "The Inspector Calls",
      intro: [
        `${Q}Bad news and worse news. The bad news: Bram has sent a tax inspector to my cove. Today. The worse news: he's very good at his job.`,
        `${Q}Inspector Prewitt. A man made entirely of forms. If he's still at the cove when the Choir comes, he'll get hurt, and then he'll fine me for it.`,
        `${Q}Go meet him. Answer his questions. If he asks about the barrels, the barrels are fish. Everything is fish. Then get rid of him.`,
        `${Q}How? Prewitt has one weakness: goats. A goat looked at him funny when he was six and he never recovered. Wren has a goat. Wren has many goats. Borrow one. Bring it back.`,
        { text: `${Q}And yes, I know: if Prewitt finds the honey, I'm back in that cell for good. You'd know all about how that goes.`, when: EXPOSED },
        { text: `${Q}Unrelated: if you happen across a pot of gold at the end of a rainbow while you're out, I'm buying. Unrecorded gold is the only honest gold. Prewitt would faint.`, when: { "pack:rainbow_bp": "on" } },
      ],
      objectives: [
        {
          type: "meet",
          label: "Meet Inspector Prewitt at Smugglers' Cove",
          place: "sea_cave",
          radius: 16,
          who: { id: "prewitt", name: "Inspector Prewitt", entity: "minecraft:villager_v2" },
          pages: [
            "§ePrewitt:§r Inspector Prewitt. Office of the Mayor, Department of Tariffs, Levies and Miscellaneous. I have reason to believe this cove contains honey.",
            "§ePrewitt:§r I have a form. It has forty questions. Some have sub-questions. We will now begin question one.",
          ],
        },
        { type: "answer", label: "Answer Inspector Prewitt's question about the barrels", place: "sea_cave", radius: 16, question: "§ePrewitt:§r Question one. What, precisely, is in these barrels? Think carefully. I can smell lying. It smells like honey.", answers: ["fish", "salt fish", "salted fish", "cod", "herring", "just fish"] },
        { type: "lead", label: "Lead Bartholomew the goat from Wren's Meadow to the cove", mob: "minecraft:goat", name: "Bartholomew", spawnAt: { place: "meadow" }, to: { place: "sea_cave", radius: 10 } },
        {
          type: "event",
          optional: true,
          label: "Find a pot of gold at a rainbow's end",
          events: ["rainbow"],
          near: 8,
          when: { "pack:rainbow_bp": "on" },
          set: { pot: "found" },
          bonus: { crowns: 50 },
          hint: "Rainbows come out after rain. When one appears, the tracker points to its pot of gold: get within 8 blocks of it in the next 15 minutes.",
        },
      ],
      outro: [
        "Bartholomew the goat walks onto the dock, looks Inspector Prewitt in the eye, and bleats once. Prewitt drops his clipboard and leaves at a speed the Department of Tariffs would not approve of.",
        `${Q}Magnificent. A masterpiece. I've seen generals with less command presence than that goat.`,
        `${Q}Return Bartholomew to Wren with my compliments and a carrot. Then come back at sundown. Bring your sword. Bring someone else's sword too.`,
        { text: `${Q}And... thank you. I don't say that much. It tastes strange. Like a fig that's gone off.`, when: EXPOSED },
        { text: `${Q}And between us: if this goes badly tonight, tell Reyes the ledger under my floor is hers. All of it. Even the embarrassing pages.`, when: TRUSTED },
        { text: `${Q}And you found a pot of gold! No, keep it. Keep it! If Prewitt ever sees me holding a pot of gold, I'll be filling in forms until I die. I'll just pay you for the pleasure of knowing it exists. Here.`, when: { pot: "found" } },
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:golden_carrot", amount: 4 }] },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "Prewitt appears at Smugglers' Cove, on the tracker. When he asks about the barrels, type that they hold fish. Then a goat waits at Wren's Meadow: put a lead on it and walk it to the cove. A leashed goat fits in a boat if there's water in the way.",
    },
    {
      id: "double_cross",
      title: "The Double-Cross",
      intro: [
        "The sun goes down red over Smugglers' Cove. Quill has lit every lantern and stacked crates into a wall, which is mostly for drama.",
        `${Q}Here's my thinking. The Choir wants its money back. They think I'll run. I won't run, which will confuse them, and while they're confused, you hit them.`,
        { text: `${Q}I sent word to Reyes. She said, and I quote, 'Hold the cove and I'll pretend I never heard about the honey.' She's warming to me.`, when: TRUSTED },
        { text: `${Q}I'd send word to Reyes, but the last time Reyes and I spoke, she locked a door. So it's you and me. Lucky you.`, when: EXPOSED },
        `${Q}After, there'll be a lot of money on the ground. Choir money. We'll talk about that after. If there is an after. There will be. Probably.`,
      ],
      objectives: [
        {
          type: "defend",
          label: "Hold Smugglers' Cove against the Choir's hired raiders",
          place: "sea_cave",
          radius: 24,
          waves: [
            { mobs: ["minecraft:pillager"], count: 4 },
            { mobs: ["minecraft:vindicator", "minecraft:pillager"], count: 5 },
            { mobs: ["minecraft:vindicator", "minecraft:evocation_illager"], count: 4 },
          ],
        },
        { type: "talk", label: "Tell Warden Reyes the Choir hit the cove", npc: "reyes" },
      ],
      end: "quill",
      outro: [
        "The last raider runs into the surf and doesn't come back. The cove smells of smoke and spilled honey. On the dock, in a split sack, lies more Choir coin than Quill has ever stolen in his life, and he has stolen a lot.",
        { text: `${Q}Reyes said 'good work' to me. To me! I may frame it.\n\nHe nudges the sack with his boot.\n\n${Q}Now. This. Half for you, half for me, and the Choir can hardly report us.`, when: TRUSTED },
        { text: `${Q}Reyes said you did well. She didn't say anything to me. That's fine. I'm used to it.\n\nHe nudges the sack with his boot.\n\n${Q}Now. This. Half each, and nobody knows. Or are you turning me in again?`, when: EXPOSED },
        `${Q}Or, and I can't believe I'm saying this out loud, we give it away. Pip's family lost a barn to the Choir. Half the farms on the north road did. Bram could pay them back with this.`,
        `${Q}Your call. You've earned the right to ruin my life one more time.`,
      ],
      choices: [
        {
          id: "keep",
          label: "Keep the profits (split them with Quill)",
          set: { profits: "keep" },
          inc: { "g:iron": 1 },
          rep: [{ guild: "wayfarers", amount: 15 }],
          reply: [
            `${Q}Ha! I knew it. Under all that heroism beats the heart of a businessperson. Here's your half. Spend it somewhere Bram can't see.`,
            { text: `${Q}...Thank you. Truly. I think that's the first time anyone in this town has trusted me with anything. Even if it's only a crime.`, when: EXPOSED },
            { text: `${Q}Partners. Real ones. Don't tell Reyes. Actually, do; I want to see her face.`, when: TRUSTED },
          ],
        },
        {
          id: "return",
          label: "Give it back to the farms",
          set: { profits: "return" },
          inc: { "g:mercy": 1 },
          rep: [{ guild: "growers", amount: 15 }],
          reply: [
            `${Q}Of course you would. Of course.\n\nHe sighs the sigh of a man watching money walk away. Then, oddly, he smiles.`,
            `${Q}Pip's mother is going to cry. I hate it when people cry at me. Fine. Fine! Go be a hero. I'll be here, being poor and good. It's a new look.`,
            { text: `${Q}And... maybe tell Reyes it was my idea. I'd like one line in that ledger of hers that isn't a crime.`, when: EXPOSED },
          ],
        },
      ],
      reward: { levels: 5, crowns: 60, title: "Night Runner", journal: { entry: "smugglers_run", label: "Smuggler's Run" } },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "Smugglers' Cove is on the tracker. Stay within 24 blocks of it while three waves come. The last wave brings an evoker: dodge its fangs and kill its vexes fast, or close in and finish the evoker first. Then find Warden Reyes in town.",
    },
  ],
};

/** @type {Story} */
const MAYORS_BURDEN = {
  id: "mayors_burden",
  title: "The Mayor's Burden",
  short: "Mayor's Burden",
  giver: "bram",
  kind: "side",
  tones: ["sad", "funny", "mystery"],
  summary: "It's election week, and Mayor Bram is not coping.",
  requires: { stories: ["act2_choir"] },
  chapters: [
    {
      id: "ballots",
      title: "The Missing Ballots",
      intro: [
        `§eMayor Bram§r is pacing so hard the floorboards have opinions.\n\n${B}Gone! The ballots! The whole box! Election day is in three days, and someone has stolen democracy out of my office!`,
        `${B}It's the first real election in twenty years. Hattie Moon is running against me. She grows the best pumpkins in the county and says exactly what she means, which I find very threatening.`,
        `${B}If people think I stole the ballots so I couldn't lose... Please. Look around the square. I left the box on the bench outside for, oh, an hour. Maybe two. I may have gone to lunch.`,
        { text: `${B}People say you're the kind who gives a fellow a fair chance. I need one. Just one. Preferably today.`, when: { "g:mercy": ">=3" } },
        { text: `${B}People say you're hard but fair. I'll take hard. At this point I'll take anything.`, when: { "g:iron": ">=3" } },
      ],
      objectives: [
        {
          type: "inspect",
          label: "Look for clues around the town square",
          offset: SQUARE,
          mark: "Town square",
          radius: 24,
          clues: [
            { dx: 2, dz: 1, text: "The bench where the ballot box sat. Hoofprints all around it, small and split. Something with four very confident legs." },
            { dx: -5, dz: 3, text: "A ballot, half eaten. The half that's left says VOTE FOR HAT. The rest has been chewed off. Whoever did this has political opinions." },
            { dx: 4, dz: -6, text: "Wool? No. Goat hair, white and wiry, caught on a fence nail." },
            { dx: -3, dz: -4, text: "A trail of chewed paper scraps leading out of the square, in the general direction of Wren's Meadow." },
          ],
        },
        { type: "tend", label: "Feed a goat 3 wheat until it gives back what it ate", mobs: ["minecraft:goat"], item: "minecraft:wheat", count: 3 },
      ],
      outro: [
        "The goat eats the wheat, considers you, and coughs up the ballot box key, a damp wad of ballots, and a button from Bram's second-best coat.",
        "§eWren§r arrives at a full sprint.\n\n§eWren:§r That's Councilor! She's my goat! I named her Councilor because she likes paper and she's always at meetings! I'm SO sorry, Mayor Bram, she didn't mean it, she only eats the ones she agrees with!",
        `${B}A goat. Not a conspiracy. A goat.\n\nHe sits down on the bench, laughing, and keeps laughing a little too long.\n\n${B}Most of them are still readable. We'll count on election day. With the box locked. Indoors.`,
        `${B}You know, for one awful hour I thought someone hated me enough to steal an election. It was almost a relief to find out it was a goat. A goat doesn't hate you. A goat is just hungry. I can work with hungry.`,
      ],
      reward: { levels: 2, crowns: 25 },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "The clues are in the town square near world spawn: tap near each faint sparkle. Then feed any goat 3 wheat (hold wheat and use it on the goat). Wren keeps goats at Wren's Meadow, and goats live wild in the mountains.",
    },
    {
      id: "feud",
      title: "Fences and Feuds",
      intro: [
        `${B}Now the other thing. The Moon farm and the Garrow farm have been fighting over one field since before I was mayor. It's a field. It grows turnips. It is not a good field.`,
        `${B}Last night someone moved the fence again, and Old Garrow threw a turnip at Hattie, and Hattie threw it back harder. Two of my voters are at war over a vegetable.`,
        `${B}Talk to both of them. Then put up a fence where you think it belongs. I'll back whatever you decide, mostly because I'm too frightened to decide myself.`,
      ],
      objectives: [
        {
          type: "meet",
          label: "Hear Hattie Moon's side at the Moon farm",
          offset: MOON_FARM,
          mark: "Moon farm",
          radius: 16,
          who: { id: "hattie", name: "Hattie Moon", entity: "minecraft:villager_v2" },
          pages: [
            `${HAT}The mayor sent you? Of course he did. Bram would send a letter to his own feet if they were cold.`,
            `${HAT}That field was my grandmother's. Garrow's father won it off her in a card game during the Long Storm, when nobody was thinking straight. A card game! I've got the deed. It's a bit burned.`,
            `${HAT}I don't even want the turnips. I want what's fair. And I want Garrow to say so, out loud, once.`,
          ],
        },
        {
          type: "meet",
          label: "Hear Old Garrow's side at the Garrow farm",
          offset: GARROW_FARM,
          mark: "Garrow farm",
          radius: 16,
          who: { id: "garrow", name: "Old Garrow", entity: "minecraft:villager_v2" },
          pages: [
            `${GAR}Moon sent you? No? Bram? Hah. Bram couldn't settle a bath.`,
            `${GAR}My father farmed that field forty years. Planted it after the Long Storm, when the Moons left it to the weeds. A card game, she says. Maybe so. But it was my father's sweat that made it worth fighting over.`,
            `${GAR}I'm old. I'm tired. I just don't want to be the Garrow who lost it.`,
          ],
        },
        { type: "place", label: "Put up a fence on the disputed field (12 fences)", blocks: FENCES, count: 12, offset: FIELD, mark: "Disputed field", radius: 16 },
      ],
      outro: [
        "They both come out to look at your fence. Neither says anything for a long time. Garrow kicks a turnip. Hattie picks it up and, after a moment, hands it to him.",
        `${B}Well? Where did you put it? No, don't tell me, I'll faint. Tell them.`,
      ],
      choices: [
        {
          id: "moon",
          label: "Give the field back to Hattie Moon",
          set: { feud: "moon" },
          rep: [{ guild: "growers", amount: 10 }],
          reply: [
            `${HAT}...Thank you. Garrow, you can still farm the east rows. I'm not a monster. I just wanted it said.`,
            `${GAR}...Fair's fair. Your grandmother would be glad. Hmph. Don't make me say it twice.`,
          ],
        },
        {
          id: "garrow",
          label: "Let Old Garrow keep it",
          set: { feud: "garrow" },
          rep: [{ guild: "growers", amount: 10 }],
          reply: [
            `${GAR}Hah! ...Well. Moon. Your grandmother's apple tree is on my side. You'll pick it every fall. That's settled.`,
            `${HAT}...That's actually decent of you, you old turnip.`,
          ],
        },
        {
          id: "split",
          label: "Split it down the middle",
          set: { feud: "split" },
          inc: { "g:mercy": 1 },
          rep: [{ guild: "growers", amount: 10 }],
          reply: [
            `${HAT}Half? ...Half. We share the well.`,
            `${GAR}And the turnips. Nobody wants the turnips.`,
            `${B}A compromise! In my town! I may weep.`,
          ],
        },
      ],
      reward: { levels: 3, crowns: 35 },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "Both farms are a little over 200 blocks southeast of spawn, on the tracker. Hattie and Garrow appear when you get close; talk to each. Then place 12 fences of any wood within 16 blocks of the disputed field between the two farms.",
    },
    {
      id: "unveiling",
      title: "The Unveiling",
      intro: [
        `${B}Tomorrow, before the vote, we unveil the statue. My father's idea, forty years ago. He paid a sculptor, the sculptor took the money, and the statue has sat in a barn under a sheet ever since. It's time.`,
        `${B}It's of my father. I think. Nobody has looked under that sheet in forty years. That's fine. Statues don't change.`,
        `${B}It needs a base: sixteen blocks of good stone, right in the square. And a fresh sheet; the old one has a family of mice in it, and they've earned their peace.`,
        `${B}Then fireworks! Three. A mayor without fireworks is just a man standing in a square.`,
      ],
      objectives: [
        { type: "place", label: "Build the statue's base in the town square (16 stone blocks)", blocks: ["minecraft:stone", "minecraft:smooth_stone", "minecraft:stone_bricks", "minecraft:polished_andesite", "minecraft:polished_diorite", "minecraft:polished_granite", "minecraft:quartz_block"], count: 16, offset: SQUARE, mark: "Town square", radius: 12 },
        { type: "deliver", label: "Bring Bram 4 white wool for a new sheet", npc: "bram", item: "minecraft:white_wool", count: 4 },
        { type: "use", label: "Set off 3 fireworks in the town square", item: "minecraft:firework_rocket", count: 3, offset: SQUARE, mark: "Town square", radius: 16 },
      ],
      outro: [
        "The whole town is there. Bram makes a speech about legacy that goes on for some time. Then he pulls the sheet.\n\nThe statue is not of Bram's father. The statue is of a goat. A very large, very proud stone goat, wearing a mayor's chain around its neck.",
        "In the silence, Councilor the goat walks out of the crowd, looks up at the statue, and bleats once, with enormous respect. The square loses its mind. Somebody shouts BRAM FOR GOAT. Somebody else starts a chant.",
        `${B}The sculptor. He must have been making a point about my father. Or about mayors. Or about goats.\n\nBut Bram is laughing too, and for the first time this week he doesn't look afraid.`,
        { text: "§eBrother Hollis§r, at the back of the crowd, laughs so hard he has to sit down on the steps. People who know him say they haven't heard that sound in a year.", when: { "g:hollis": "saved" } },
      ],
      reward: {
        levels: 3,
        crowns: 40,
        items: [{ item: "minecraft:firework_rocket", amount: 8 }],
        codex: { id: "goat_statue", title: "The Goat in the Square", text: "Mayor Aldric Bram paid a sculptor for a statue of himself forty years ago. The sculptor took the money and carved a goat wearing a mayor's chain. It sat under a sheet in a barn until his son unveiled it before the election. The town has decided it is the best statue it owns." },
      },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "Place 16 stone-type blocks (stone, smooth stone, stone bricks, polished stone or quartz) within 12 blocks of the town square near spawn, bring Bram 4 white wool, then use 3 firework rockets in the square.",
    },
    {
      id: "fathers_name",
      title: "My Father's Name",
      npc: "moss",
      end: "bram",
      intro: [
        "Election morning. Bram isn't at the counting table. Bea says he went out before dawn with flowers and the face of a man who's lost an argument with himself. Moss will know where. Moss always knows where.",
        `§eMoss§r is sitting on a headstone, eating an apple.\n\n${MOSS}Looking for the mayor? He's with his father. Has been since before sunrise. Talking. The father isn't saying much back. They rarely do.`,
        `${MOSS}Old Mayor Aldric Bram. I dug that grave. Big man, bigger voice. He's the one who ordered the town to forget the Long Storm. You know that. So does his son, now. That's the trouble.`,
        `${MOSS}Go and look at the grave. Look properly. Then sit with him till the sun goes. Don't fix anything. Just sit. That's most of what grief wants.`,
      ],
      objectives: [
        {
          type: "inspect",
          label: "Look properly at Aldric Bram's grave",
          place: "graveyard",
          radius: 16,
          clues: [
            { dx: 3, dz: -2, text: "ALDRIC BRAM. MAYOR. 'HE KEPT THE TOWN.' The letters are crisp; someone has recut them recently, by hand, not very well." },
            { dx: 5, dz: 1, text: "A tin box, buried shallow at the foot of the grave and recently dug up. Inside: forty dried flowers, one for every year since the Long Storm. The newest few are still fresh." },
            { dx: -2, dz: 4, text: "A letter in the tin, in a heavy hand: 'Son. I told them to forget because I could not. Someone has to carry it so the rest can sleep. Forgive me for choosing you without asking. - A.'" },
          ],
        },
        { type: "vigil", label: "Sit with Bram at the Old Graveyard until the sun goes down", place: "graveyard", radius: 16, seconds: 90, timeOfDay: [11500, 13800] },
      ],
      outro: [
        "Bram doesn't look up when you sit. The sun goes down orange over the graves. After a long time, he talks.",
        `${B}I was so angry at him. When I found the order, I was so angry. He made us all forget, and I thought, what kind of man does that to the people he loves?`,
        `${B}And it turns out: the kind of man who couldn't forget a single day of it himself. Forty flowers. He came every year. He carried it so we didn't have to. He was wrong. He was still my father.`,
        `${B}I'm sorry, Dad. For being angry. For being proud. And for the goat.\n\nHe laughs, wet. Then he stands, brushes off his knees, and says he has an election to lose.`,
      ],
      reward: {
        levels: 4,
        crowns: 45,
        codex: { id: "aldric_letter", title: "Aldric Bram's Letter", text: "Found in a tin at the old mayor's grave with forty dried flowers, one for each year since the Long Storm. 'Son. I told them to forget because I could not. Someone has to carry it so the rest can sleep. Forgive me for choosing you without asking.'" },
      },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "The Old Graveyard is on the tracker. Tap near the three faint sparkles around Aldric Bram's grave, then stay within 16 blocks of the graveyard through sunset. Get there in the late afternoon: the vigil only counts as the sun goes down.",
    },
    {
      id: "election",
      title: "Election Day",
      intro: [
        `${B}The count takes a full day. Inspector Prewitt is doing it. He has a form for counting. He has a form for the form. He asked whether the goat's ballots count. I said the goat isn't registered. He's checking.`,
        `${B}Hattie and I shook hands on the steps this morning. She said I was a better man than I was a mayor. I said she'd be a better mayor than I am a man. We're still working out whether either of us was insulted.`,
        { text: `${B}Hattie and Garrow came in to vote together. Together! They argued the whole way, but together. That fence of yours did more for this town than my last six speeches.`, when: { feud: "split" } },
        `${B}Whoever wins, the town needs a cake. Bea says a town that doesn't celebrate its elections deserves whatever government it gets. Bring a cake, and wait with me.`,
      ],
      objectives: [
        { type: "wait", label: "Wait one day while Prewitt counts the votes", days: 1 },
        { type: "deliver", label: "Bring Bram a cake for the result", npc: "bram", item: "minecraft:cake", count: 1 },
      ],
      outro: [
        "Inspector Prewitt climbs onto the statue's base, clears his throat for an entire minute, and reads the result.\n\nBram wins. By one vote.",
        `The square goes very quiet. Then everyone turns to look at Hattie Moon, who is grinning.\n\n${HAT}I voted for him. Don't look at me like that. He sat in a graveyard all night for a man who hurt him. You don't grow that in a pumpkin patch.`,
        { text: `${HAT}Besides, his helper gave me my field back. I'm not made of stone. Unlike some goats.`, when: { feud: "moon" } },
        { text: `${GAR}And I voted for Moon, just to be contrary. Don't tell her. It'll go to her head.`, when: { feud: "garrow" } },
        `${B}One vote. I'll take it, and I'll earn it.\n\nHe cuts the cake into very uneven pieces and gives you the biggest.\n\n${B}One more thing. The goat statue needs a plaque. You choose. You've earned it, Deputy.`,
      ],
      choices: [
        {
          id: "plaque_lost",
          label: "Carve: FOR EVERYONE THE LONG STORM TOOK",
          set: { plaque: "lost" },
          inc: { "g:mercy": 1 },
          reply: [`${B}Yes. Under a goat, in the middle of the square, where everyone walks past it every day. No more forgetting. My father would hate it. Then, I think, he'd come and stand by it every year.`],
        },
        {
          id: "plaque_goat",
          label: "Carve: COUNCILOR. SHE ATE THE BALLOTS.",
          set: { plaque: "goat" },
          reply: [`${B}Ha! Truth in government. Wren will cry. Councilor will try to eat the plaque. It's perfect. It's the most honest thing this town has ever carved.`],
        },
      ],
      reward: { levels: 5, crowns: 60, title: "Deputy Mayor", journal: { entry: "mayors_burden", label: "The Mayor's Burden" } },
      rep: [{ guild: "growers", amount: 10 }],
      hint: "Wait one in-game day, then bring Bram a cake (crafted from 3 milk buckets, 2 sugar, 1 egg and 3 wheat).",
    },
  ],
};

/** @type {Story} */
const EDGES_OF_MAP = {
  id: "edges_of_map",
  title: "Edges of the Map",
  short: "Edges of the Map",
  giver: "mara",
  kind: "side",
  tones: ["exploration", "happy", "dangerous"],
  summary: "Mara wants to map the edges of the world. All of them. Bring a horse.",
  requires: { stories: ["last_map"] },
  chapters: [
    {
      id: "kit",
      title: "A Proper Kit",
      intro: [
        `§eMara§r has three maps pinned to the wall, and every one of them has a big blank space at each edge.\n\n${M}You know what I can't stand? Blank. Fenn left me a finished map of home. Home is lovely. Home is also about one percent of the world.`,
        `${M}So. Five far stations, one in each direction, each in a different kind of land. Then the deep sea. Then, and I want you to hear me say this calmly: the End.`,
        { text: `${M}Your map in the square has travelers asking me what's past the edges. I'm tired of saying 'nobody knows'. I'm a cartographer. Knowing is the job.`, when: SHARED },
        { text: `${M}We kept Fenn's wild corners wild, and I don't regret it. But keeping a place wild isn't the same as never seeing it. I want to see them. Then I'll decide what goes on paper.`, when: KEPT },
        `${M}Lesson one, because people got lost on my last job: these stations are {far:1300,60} blocks out and more. Don't walk. Tame a horse and learn to ride it. The tracker points the way the whole time.`,
      ],
      objectives: [
        { type: "tame", label: "Tame a horse, donkey or mule", mobs: ["minecraft:horse", "minecraft:donkey", "minecraft:mule"], count: 1 },
        { type: "ride", label: "Ride 300 blocks on horseback", mobs: ["minecraft:horse", "minecraft:donkey", "minecraft:mule"], distance: 300 },
        { type: "collect", label: "Have 3 empty maps for the stations", item: "minecraft:empty_map", count: 3 },
      ],
      outro: [
        `${M}Look at you, mounted and mapped. Fenn walked everywhere, and it took him thirty years to fill one book. You'll do it in a season.`,
        `${M}A tip: name your horse. A horse with a name comes back for you. A horse without one just thinks about grass.`,
        `${M}First stations next time. East for sand, north for snow. Pack warm. Pack cool. Pack both.`,
        `${M}And if you get lost, you won't, but if you do: stop, climb something tall, and look for the tracker's arrow before you look for a road. Roads lie. The arrow doesn't.`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:golden_carrot", amount: 8 }, { item: "minecraft:lead", amount: 1 }] },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "Horses live in plains and savannas. Mount one with an empty hand again and again until hearts appear, then saddle it (saddles come from chests and trades). Any 300 blocks of riding count. Empty maps are crafted from 8 paper around a compass.",
    },
    {
      id: "sand_snow",
      title: "Sand and Snow",
      intro: [
        `${M}East station first: about {far:1300,60} blocks due east. If the land is honest there's desert out there. If it isn't, keep your eyes open on the way; deserts are big and hard to miss.`,
        `${M}Bring four pieces of cactus as proof. Cactus is the desert's handshake: prickly, but sincere.`,
        `${M}Then north station, about {far:-80,-1350} blocks due north. Snow country, I'd bet. Bring sixteen snowballs; a shovel on snow gets them fast. They'll keep. Your pack is colder than you think.`,
        `${M}That's a long day of riding. Take your horse, food, and a bed: if night catches you out there, sleep in it. Cartographers who ride at night end up in ravines.`,
        { text: `${M}And keep an eye out for the little places on the way: a shrine, an old camp, a stone with writing on it. Stop at one. Fenn always said the roadside tells you more than the road.`, when: { "pack:atlas_bp": "on" } },
      ],
      objectives: [
        { type: "reach", label: "Survey the east station (about {far:1300,60} blocks east)", offset: EAST, mark: "East station", radius: 40 },
        { type: "collect", label: "Have 4 cactus (deserts and badlands)", item: "minecraft:cactus", count: 4 },
        { type: "reach", label: "Survey the north station (about {far:-80,-1350} blocks north)", offset: NORTH, mark: "North station", radius: 40 },
        { type: "collect", label: "Have 16 snowballs (snowy lands)", item: "minecraft:snowball", count: 16 },
        {
          type: "event",
          optional: true,
          label: "Stop at a wayside site on the way and use it (a shrine's blessing, a tablet, a camp's barrel...)",
          quest: { pack: "atlas_bp", id: "atlas:*" },
          when: { "pack:atlas_bp": "on" },
          set: { waymark: "found" },
          bonus: {
            crowns: 20,
            codex: {
              id: "edges_waymarks",
              title: "Mara's Waymarks",
              text: "Mara has started marking the roadside places on her maps: shrines, cairns, old camps, the carved stones. Her note in the margin: 'Fenn drew roads. I'm drawing the places people stopped on them. Somebody built every one of these for a reason. My partner keeps finding them.'",
            },
          },
          hint: "Wayside sites stand out in the wilds, away from towns and claims: a little roofed shrine, a carved stone on a tuff step, a camp with a barrel, a hermit's hut. Walk up to one and use it (tap the shrine's stone or the tablet, open the camp's barrel). /realm:atlas shows which way the nearest one is.",
        },
      ],
      outro: [
        `${M}Cactus! Snow! In the same pack! The world is a strange and well-organized place.\n\nShe sketches fast, tongue between her teeth.`,
        `${M}Fenn's notes have a line about the far north: 'The snow keeps old things.' I never knew what he meant. Did you see anything old out there? No? Good. I'd have been jealous.`,
        { text: `${M}Southwest next. Swamp. Bring boots you don't love.`, when: { waymark: "!found" } },
        { text: `${M}Southwest next. Swamp. Bring boots you don't love.\n\nAnd you stopped at one of the old roadside places! I'm marking it. Fenn would never have stopped. He'd have measured it from the saddle.`, when: { waymark: "found" } },
        `${M}Oh, and one more thing about the snow: Fenn drew a little stick figure up there with a big hat. No label. I've decided it's a self-portrait. It isn't. He never wore a hat. But I've decided.`,
      ],
      reward: { levels: 4, crowns: 45 },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "East station: about {far:1300,60} blocks east of spawn. North station: about {far:-80,-1350} blocks north. The tracker points to each; on a horse each trip takes a few minutes, and a boat is faster along rivers. The cactus and snowballs can come from anywhere: cactus grows in deserts and badlands, and a shovel on snow gives snowballs.",
    },
    {
      id: "night_sounds",
      title: "Frogs in Three Voices",
      intro: [
        `${M}Southwest station, about {far:-1100,1050} blocks out. Mangrove swamp, if my guess is right: roots like a cage, mud like a grudge, frogs who judge you.`,
        `${M}I want four mangrove propagules, the little sprouts that hang under the leaves. And twelve sweet berries from any spruce forest on the way. Those are for me, not the map. I get hungry when I draw.`,
        `${M}And camp a night out there. Really camp. Sit out in the open after midnight and listen. Fenn wrote down the night sound of every land he slept in. I want to know if any of them have changed.`,
        `${M}Take a boat as well as the horse. Swamps are half water, and a horse in a swamp is just a very tall, very unhappy swimmer.`,
        { text: `${M}And be gentle with the frogs. I know you are. People talk: you're the one who lets things live when you could just as easily not. Frogs remember. Probably.`, when: { "g:mercy": ">=3" } },
        { text: `${M}Oh! And if the sky does anything strange while you're out, chase it. Northern lights, a rainbow's end, a twister, a storm with its own weather. Fenn never got to chart the sky. I want to beat him at something.`, when: { "pack:night_bp": "on" } },
      ],
      objectives: [
        { type: "vigil", label: "Camp at the southwest station after midnight (90 seconds outdoors, about {far:-1100,1050} blocks out)", offset: SOUTHWEST, mark: "Southwest station", radius: 40, seconds: 90, timeOfDay: [18000, 22500], outdoors: true },
        { type: "collect", label: "Have 4 mangrove propagules (mangrove swamps)", item: "minecraft:mangrove_propagule", count: 4 },
        { type: "collect", label: "Have 12 sweet berries (spruce forests)", item: "minecraft:sweet_berries", count: 12 },
        {
          type: "event",
          optional: true,
          label: "Chart a sky wonder: northern lights, a rainbow's end, a tornado or a storm cell",
          events: ["aurora", "rainbow", "tornado", "storm_cell"],
          near: 64,
          when: { "pack:night_bp": "on" },
          set: { wonder: "charted" },
          bonus: {
            crowns: 40,
            items: [{ item: "minecraft:empty_map", amount: 2 }],
            codex: {
              id: "edges_sky_wonders",
              title: "Mara's Sky Margin",
              text: "Mara has started a new margin on her maps, for the sky: northern lights, rainbows, twisters, storms that walk on their own. Her note at the top: 'Fenn charted every hill and never once looked up. The sky moves, so the sky gets a date, not a place. First entry by my partner. Proof that the edges of the map go up as well as out.'",
            },
          },
          hint: "Northern lights show over snowy lands on some clear nights: be out in the snow at night (anyone seeing them counts for everyone in the Overworld while they last). For a rainbow, a tornado or a storm cell, the tracker points to it when one appears: get within 64 blocks of it while it lasts.",
        },
      ],
      outro: [
        `${M}And? What did it sound like?\n\nYou tell her: frogs, rain on leaves, something big moving in the water and deciding not to bother you.`,
        `${M}Fenn wrote: 'Southwest. Frogs in three voices. Rain like a crowd whispering.' Three voices! Forty years and the frogs haven't changed their song. I find that very comforting.\n\nShe eats a berry. Then six more.`,
        `${M}Southeast next. Something's out there that isn't on any map. Fenn left a question mark. Fenn never left question marks.`,
        { text: `${M}And you charted the sky! I've started a whole new margin for it. Fenn never once looked up. Ha. One point to me.`, when: { wonder: "charted" } },
      ],
      reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:oak_boat", amount: 1 }] },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "The southwest station is about {far:-1100,1050} blocks from spawn, on the tracker. Ride there and bring a boat for the swamp. Arrive before midnight, then stay within 40 blocks of the station, in the open, for 90 seconds. Propagules hang under mangrove leaves; sweet berries grow on bushes in taiga.",
    },
    {
      id: "lost_village",
      title: "The Village Nobody Mapped",
      intro: [
        `${M}Fenn's map has a question mark about {far:1150,1150} blocks southeast. Beside it, in pencil: 'People? Ask before drawing.' I have never in my life seen that man ask before drawing.`,
        `${M}Jungle out that way, I think. Bring ten cocoa beans; they grow on the trunks of the big jungle trees. Then go to the station and see who's there.`,
        `${M}Be polite. Be patient. If they don't want visitors, don't argue. Fenn had a rule: you can draw a road to people, but you can't draw them into wanting one.`,
      ],
      objectives: [
        { type: "reach", label: "Survey the southeast station (about {far:1150,1150} blocks southeast)", offset: SOUTHEAST, mark: "Southeast station", radius: 40 },
        { type: "collect", label: "Have 10 cocoa beans (jungles)", item: "minecraft:cocoa_beans", count: 10 },
        {
          type: "meet",
          label: "Meet whoever lives at the southeast station",
          offset: SOUTHEAST,
          mark: "Southeast station",
          radius: 24,
          who: { id: "ama", name: "Elder Ama", entity: "minecraft:villager_v2" },
          pages: [
            "§eAma:§r A traveler. With a map case. Oh, dear.\n\nShe is old and small and has a voice like dry leaves.\n\n§eAma:§r The last man with a map case sat right where you're standing and drank all my tea. Fenn, he said his name was.",
            "§eAma:§r He found us fifty years ago, lost and half starved. We fed him. He drew everything, and then he burned the drawing in my fire. He said, 'Some places are only safe if nobody knows the way.'",
            { text: "§eAma:§r Travelers say your Mara hung a map in her square, and everyone copies it. If we go on her maps, everyone comes.", when: SHARED },
            { text: "§eAma:§r Travelers say your Mara keeps her map close. If we go on it, only the people she trusts will see.", when: KEPT },
            "§eAma:§r We've had fifty quiet years. But the young ones want trade, and doctors, and to see the sea. So I'll ask you the question Fenn never asked us. Should we be on the map?",
          ],
          choices: [
            {
              id: "mapped",
              label: "Put the village on the map",
              set: { village: "mapped" },
              rep: [{ guild: "wayfarers", amount: 10 }],
              reply: ["§eAma:§r Then let the young ones have their road. Tell Mara to draw our well properly. Fenn always made it look crooked."],
            },
            {
              id: "hidden",
              label: "Leave it off the map",
              set: { village: "hidden" },
              rep: [{ guild: "growers", amount: 10 }],
              reply: ["§eAma:§r Fifty more quiet years, then. Thank you. When the young ones complain, I'll tell them a stranger with kind eyes decided, and they can be cross with you instead."],
            },
          ],
        },
      ],
      outro: [
        { text: `${M}A whole village! Wells, gardens, a bell tower! I'm drawing it now. Crooked well and all. No: straight well. She said straight. Don't distract me.`, when: { village: "mapped" } },
        { text: `${M}A village. And we're leaving it blank.\n\nShe looks at the empty space for a long moment, then draws the smallest dot you've ever seen, so faint it's almost not there.\n\n${M}For me. Not for them.`, when: { village: "hidden" } },
        `${M}Fenn burned a drawing. Fenn, who once argued with a sheep about the correct shape of a hill. I'm learning more about him on this job than in ten years in his workshop.`,
        `${M}West station next. There's a ravine on the way that Fenn called the Mouth. Bring a lot of planks.`,
      ],
      reward: {
        levels: 4,
        crowns: 45,
        codex: { id: "fenn_ama", title: "Fenn and the Hidden Village", text: "Fifty years ago a lost young Aldous Fenn stumbled into a village far to the southeast. The villagers fed him. He mapped it, then burned the map in Elder Ama's fire: 'Some places are only safe if nobody knows the way.' He marked the spot on his own map with a single question mark." },
      },
      rep: [{ guild: "wayfarers", amount: 5 }],
      hint: "The southeast station is about {far:1150,1150} blocks from spawn; ride, or follow a river by boat. Cocoa beans grow on jungle tree trunks (break the pods). Elder Ama appears at the station when you get close: talk to her there.",
    },
    {
      id: "mouth",
      title: "The Mouth",
      intro: [
        `${M}West station is about {far:-1400,-120} blocks out, and in front of it is a ravine Fenn called the Mouth. Long, deep, and full of things that like the dark.`,
        `${M}Fenn crossed it on a rope. I'd rather you didn't. Build a bridge: twenty-four planks, any wood, good and solid. Travelers after you will thank you, and so will your knees.`,
        `${M}And the Mouth breathes at night. Things climb out of it. Fenn wrote 'six an hour, at least'. Clear some, so the bridge stays a bridge and doesn't become a buffet.`,
        { text: `${M}Fenn's notes say that on a still night you could hear the harbor bell from the west station, before the Long Storm drowned it. You made it ring again. Listen for it out there. Tell me if it carries.`, when: RUNG },
      ],
      objectives: [
        { type: "reach", label: "Reach the west station (about {far:-1400,-120} blocks west)", offset: WEST, mark: "West station", radius: 40 },
        { type: "place", label: "Build a bridge at the west station (24 planks)", blocks: PLANKS, count: 24, offset: WEST, mark: "West station", radius: 30 },
        { type: "defeat", label: "At night, defeat 6 monsters near the west station", mobs: NIGHT_MOBS, count: 6, night: true, offset: WEST, mark: "West station", radius: 64 },
      ],
      outro: [
        "Your bridge spans the Mouth: a little crooked, very solid. Far below, something hisses and gives up.",
        { text: "And once, very faint, carried on the wind from the east: a bell. You'd swear to it.", when: RUNG },
        `${M}A bridge. On my map. That I don't have to draw as a dotted line meaning 'good luck'. You have no idea how happy that makes me.`,
        `${M}Two left. The deep sea, and the place past the edge of everything. Rest first. I mean it. I'm not losing my best surveyor to a skipped nap.`,
      ],
      reward: { levels: 4, crowns: 45, items: [{ item: "minecraft:torch", amount: 32 }] },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "The west station is about {far:-1400,-120} blocks west of spawn; ride. Place 24 planks of any wood within 30 blocks of it (a bridge over the ravine, or anywhere close), then defeat 6 monsters within 64 blocks at night. Torches behind you keep the count honest.",
    },
    {
      id: "deep",
      title: "Charting the Deep",
      intro: [
        `${M}The deep ocean. The one part of the world Fenn never charted, because Fenn, and I loved him, could not swim.`,
        `${M}Row out. Far. Six hundred blocks of open water. Then dive: below y 40, where the light goes green, then blue, then nothing. Tell me what's on the bottom.`,
        `${M}Bring potions of water breathing if you can brew them, or a turtle shell. And fish while you're out there; Tobin says deep-water fish taste different. Tobin says a lot of things.`,
        { text: `${M}The sea's been quieter since you silenced the bell. Tobin says the drowned have thinned out past the reef. Thinned. Not gone. Mind your ankles.`, when: SILENCED },
        { text: `${M}Sailors say the recast bell carries miles out to sea now. If the fog turns you around, listen for it. That's the way home.`, when: RUNG },
      ],
      objectives: [
        { type: "ride", label: "Row a boat 600 blocks over open water", mobs: BOATS, distance: 600 },
        { type: "fish", label: "Catch 3 fish out on the deep water", items: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"], count: 3 },
        { type: "reach", label: "Dive below y 40 in a deep ocean", belowY: 40 },
      ],
      outro: [
        "You tell her about the bottom: blue-black and cold, kelp like a forest, the ribs of something enormous half buried in sand, and once, far off, the green glow of a monument's windows.",
        `${M}A monument. Fenn wrote about those: 'Old. Older than us. Built by people who knew the sea better than we ever will.' He thought they were vaults of some kind. He never got to find out.`,
        `${M}One left. The End. The edge past all the edges. I know what I'm asking. You don't have to.\n\nShe very much means that you do have to.`,
      ],
      reward: {
        levels: 4,
        crowns: 50,
        items: [{ item: "minecraft:turtle_helmet", amount: 1, name: "Mara's Spare Shell", lore: ["She bought it for herself.", "She's not going in."] }],
        codex: { id: "fenn_monuments", title: "Fenn on the Monuments", text: "From Fenn's notebook: 'Old. Older than us. Built by people who knew the sea better than we ever will.' He believed the ocean monuments were vaults of some kind, guarding something, and that the guardians were only doing their job." },
      },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "Ride any boat 600 blocks in total and catch 3 fish with a rod. For the dive, find a deep ocean (dark blue water far from land, about 30 blocks deep) and swim below y 40. Water breathing potions or a turtle shell help a lot.",
    },
    {
      id: "end",
      title: "Off the Edge",
      intro: [
        `${M}The End. Eyes of ender, a stronghold, a portal, a dragon. I've read every book about it, and every book stops at the portal, because the people who wrote them stopped at the portal.`,
        `${M}You'll need a dozen eyes of ender, give or take: blaze powder and ender pearls. Throw them and they fly toward the stronghold. Follow, dig down, find the portal room. This isn't a weekend. Take your time.`,
        `${M}Bring me sixteen pieces of End stone. I want to hold the edge of the world in my hands. Is that silly? Don't answer that.`,
        `${M}And if you come back with wings... an elytra... I'll draw you a map of anywhere you want, for free, forever. Not required. Strongly hinted.`,
      ],
      objectives: [
        { type: "reach", label: "Step through a portal into the End", dim: "minecraft:the_end" },
        { type: "collect", label: "Have 16 End stone", item: "minecraft:end_stone", count: 16 },
      ],
      outro: [
        `${M}You went. You actually went.\n\nShe turns a piece of End stone over and over in her hands. It is pale and cold and smells of nothing at all.`,
        `${M}It goes on the last page. Not a drawing. Just the word, in my best letters: END. And under it, smaller: 'Walked by a friend of Fenn's. Not empty.'`,
        `${M}I said I hated blank. I think I only hated not knowing. Now I know. And the world is so much bigger than the map, and I love that more than anything.`,
        { text: `${M}I'll hang the whole thing in the square beside the first one. Let them copy it. Let them all go and see.`, when: SHARED },
        { text: `${M}I'll keep it on my shelf with Fenn's book. When someone's ready to go and see, they'll ask me. I'll know who's ready.`, when: KEPT },
      ],
      reward: { levels: 5, crowns: 60, title: "Edgewalker", journal: { entry: "edges_of_map", label: "Edges of the Map" } },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "Craft eyes of ender (blaze powder and ender pearls) and throw them outdoors: they fly toward a stronghold, often 1,000 blocks or more away. Dig down where they fall, find the portal room and fill the frame. In the End, mine End stone on the main island; the dragon is there, so bring a bow, a lot of arrows, and blocks to climb with.",
    },
  ],
};

/** @type {Story} */
const SINGING_FORGE = {
  id: "singing_forge",
  title: "The Forge That Sings",
  short: "Forge That Sings",
  giver: "ida",
  kind: "side",
  tones: ["dangerous", "epic", "mystery"],
  summary: "Ida wants to forge the blade her old master never could.",
  requires: { stories: ["act1_signs"] },
  chapters: [
    {
      id: "dunmore",
      title: "Dunmore's Notes",
      intro: [
        `§eIda§r sets a cracked leather book on the anvil, very gently, the way she never sets anything down.\n\n${I}My master's. Old Dunmore. He forged the first relics in this town. I've read this book a hundred times. There's a page I never understood until this winter.`,
        `${I}A blade. 'Born of the deep fire, tempered in the hot stone, quenched where the souls burn, named true.' He tried four times. All four broke. He said the fifth would sing.`,
        { text: `${I}I keep thinking about the band I made you, for the bell. Iron that makes a thing quiet. This is the other way round: iron that makes a thing speak.`, when: SILENCED },
        { text: `${I}I keep thinking about the clapper I made you, for the bell. Iron that gave a dead thing its voice back. This would be like that, but in your hand.`, when: RUNG },
        `${I}His old forge is just outside town, falling down. Go and look at it. Properly. Then bring me sixteen iron ingots to start the core. We start where he started.`,
      ],
      objectives: [
        {
          type: "inspect",
          label: "Search Dunmore's old forge",
          offset: FORGE,
          mark: "Dunmore's old forge",
          radius: 16,
          clues: [
            { dx: 1, dz: 0, text: "The old anvil. Four deep gouges across its face, each where a blade broke. Someone counted them in chalk: I, II, III, IIII." },
            { dx: -3, dz: 2, text: "Glassy black slag in the ash pit, shot through with tiny points of light. It glitters like a night sky. A label in the dirt: 'star-iron'." },
            { dx: 2, dz: -3, text: "A loose brick in the chimney. Behind it, a note: 'They say it fell in the Long Storm. I say it was always falling. The metal remembers the sky. -D.'" },
          ],
        },
        {
          type: "vision",
          label: "Lay a hand on the old anvil",
          offset: FORGE,
          mark: "Dunmore's old forge",
          radius: 6,
          scenes: [
            { title: "Dunmore's Forge", text: "For a moment the forge is whole again. A broad old man in a leather apron holds up a glowing blade, and it hums.", seconds: 5 },
            { text: "The hum climbs into a note, high and pure. Then a crack runs down the steel, and the note dies.", sound: "random.anvil_land", seconds: 5 },
            { text: "The old man sets the broken halves down and says to nobody, 'Not hot enough. Not true enough. Not yet.'", seconds: 5 },
          ],
        },
        { type: "deliver", label: "Bring Ida 16 iron ingots for the core", npc: "ida", item: "minecraft:iron_ingot", count: 16 },
      ],
      outro: [
        `${I}Star-iron. He wrote about it. Metal from the craters, from the fallen stars. He said the first relics were made from it, and that it hums if you listen.`,
        `${I}Four tries. Four breaks. He was missing something, and the notes say what: the hottest metal in the world, and fire that burns souls. Both are in the Nether.`,
        `${I}I can't go. I've tried; the heat closes my throat. So it's you. Get ready. It isn't a small trip.`,
      ],
      reward: {
        levels: 3,
        crowns: 30,
        codex: { id: "dunmore", title: "Dunmore's Fifth Blade", text: "Old Dunmore, Ida's master, forged the first relics from star-iron: metal from the craters of fallen stars, which hums if you listen. He tried four times to forge a singing blade and four blades broke. His recipe: 'Born of the deep fire, tempered in the hot stone, quenched where the souls burn, named true.'" },
      },
      rep: [{ guild: "miners", amount: 5 }],
      hint: "Dunmore's old forge is about 50 blocks from spawn, on the tracker. Tap near the three faint sparkles and lay a hand on the anvil (stand right by the spot). Then bring Ida 16 iron ingots.",
    },
    {
      id: "deep_fire",
      title: "The Deep Fire",
      intro: [
        `${I}Netherite. The deep fire. Ancient debris sits low in the Nether, around y 15, buried in netherrack. It doesn't burn and it doesn't break easy: a diamond pickaxe or nothing.`,
        `${I}Four pieces. Smelt them later and you get scrap, and scrap is what I need. But first, dig.`,
        `${I}Build a portal: ten blocks of obsidian at least, and fire. Go through ready. Fire resistance if you can brew it. Gold on your boots, or the piglins will want a word.`,
        { text: `${I}Quill sold me two fire resistance potions for you, at a price he called 'friendly'. I called it something else. He laughed. Take them anyway; they're on the bench.`, when: TRUSTED },
        { text: `${I}I tried to buy fire resistance potions from Quill. He's out by day on Reyes's parole, and sour, and he charged me double 'for the jail'. I paid. Don't tell him it worked on me.`, when: EXPOSED },
        `${I}And don't fall in the lava. That's not advice. That's an order. Reyes isn't the only one in town who gives them.`,
      ],
      objectives: [
        { type: "reach", label: "Go through a portal to the Nether", dim: "minecraft:nether" },
        { type: "mine", label: "Mine 4 ancient debris (low in the Nether, around y 15)", blocks: ["minecraft:ancient_debris"], count: 4 },
      ],
      outro: [
        `${I}Four. Good. You're not on fire. Better.\n\nShe holds one up to the light. It's dark and heavy and rough, like a burned loaf of bread made of rock.`,
        `${I}Dunmore's notes call this 'the hot stone's heart'. Smelt it into scrap. Bring me the scrap, with blaze rods. Blazes live in the fortresses. Brutes guard the bastions. You'll want to go near both, and you won't want to.`,
        `${I}Sleep first. You look like you've been to the Nether.`,
        "That night the half-made core on Ida's bench hums once, very softly, when you set the debris beside it. Like something saying hello to an old friend.",
      ],
      reward: { levels: 4, crowns: 45, items: [{ item: "minecraft:golden_boots", amount: 1, name: "Piglin Manners", lore: ["Gold on your feet.", "Polite company."] }] },
      rep: [{ guild: "miners", amount: 10 }],
      hint: "Build a nether portal from 10 or more obsidian and light it. Ancient debris is most common around y 15 in the Nether: dig long tunnels at that height with a diamond pickaxe. Wear at least one piece of gold armor so piglins leave you alone.",
    },
    {
      id: "brutes",
      title: "Brutes and Blazes",
      intro: [
        `${I}Blaze rods: six. Fortresses are dark brick halls over the lava. Blazes float and throw fire. Snowballs hurt them, if you're the sort who carries snow.`,
        `${I}Dunmore's notes say 'the brute's tusk tempers the edge'. Superstition, probably. Brutes guard the bastions; they hit hard and they don't care about your gold. Put two down. If the old man was wrong, at least the bastion has fewer brutes.`,
        `${I}Then the scrap. Four pieces of netherite scrap, smelted from your debris. Don't make an ingot. I want them raw.`,
        `${I}Dunmore's first blade broke in the quench. The second broke on the anvil. The third broke when he named it, which he said served him right, because he named it after himself. The fourth broke for no reason at all, and that was the one that made him stop.`,
        { text: `${I}Brother Hollis came by the forge yesterday. Said he'd pray for you down there. Strange man. Kind. Looked like he'd slept properly for the first time in months.`, when: { "g:hollis": "saved" } },
      ],
      objectives: [
        { type: "defeat", label: "Defeat 2 piglin brutes (they guard the bastions)", mobs: ["minecraft:piglin_brute"], count: 2 },
        { type: "collect", label: "Have 6 blaze rods (nether fortresses)", item: "minecraft:blaze_rod", count: 6 },
        { type: "deliver", label: "Bring Ida 4 netherite scrap", npc: "ida", item: "minecraft:netherite_scrap", count: 4 },
      ],
      outro: [
        "Ida lays it all out: four scrap, six rods, and a brute's chipped tusk you don't remember pocketing. She says nothing for a while. Then she lights the forge.",
        "For three days she works. Nobody sleeps near the forge. It sings in its sleep, the neighbors say: low, then high, then low. Sol comes by on the second night and stands outside for an hour with his eyes closed, saying star names under his breath.",
        `${I}It's done. Almost. It wants to sing. You can feel it in the handle. But it isn't true yet. Dunmore's next line: 'quenched where the souls burn'.`,
      ],
      reward: { levels: 5, crowns: 55 },
      rep: [{ guild: "miners", amount: 10 }],
      hint: "Piglin brutes live only in bastion remnants (huge blackstone ruins in the Nether) and attack even if you wear gold. Blazes spawn in nether fortresses. Smelt ancient debris in a furnace to get netherite scrap, then bring Ida 4 of it in town.",
    },
    {
      id: "quench",
      title: "Where the Souls Burn",
      intro: [
        `${I}Soul fire. Blue, cold to look at, hotter than it looks. Soul sand or soul soil from the Nether, with logs and sticks, makes a soul campfire. Build one at Dunmore's old forge. That's where he'd want it.`,
        `${I}I'll bring the blade, and you quench it in the soul fire three times. Each time, it'll sing louder.`,
        `${I}Here's the part I don't like. The last time it sang at my forge, every dog in town howled, and that night someone knocked on my door and there was nobody there. Something listens to songs like this. Something that isn't us.`,
        `${I}So bring a sword of your own. That's not superstition. That's me knowing my neighbors.`,
        { text: `${I}Brother Hollis asked me not to do it at night. Then he asked me what the blade sounded like, three times, and he went very pale when I hummed it. I'm doing it anyway. But I listened.`, when: { "g:hollis": "!lost" } },
      ],
      objectives: [
        { type: "place", label: "Build a soul campfire at Dunmore's old forge", blocks: ["minecraft:soul_campfire"], count: 1, offset: FORGE, mark: "Dunmore's old forge", radius: 12 },
        { type: "interact", label: "Quench the blade in the soul fire 3 times (use the soul campfire)", blocks: ["minecraft:soul_campfire", "minecraft:soul_fire"], count: 3, offset: FORGE, mark: "Dunmore's old forge", radius: 12 },
        {
          type: "defend",
          label: "Defend the forge from what the song calls",
          offset: FORGE,
          mark: "Dunmore's old forge",
          radius: 20,
          waves: [
            { mobs: ["minecraft:zombie", "minecraft:skeleton"], count: 5 },
            { mobs: ["minecraft:drowned"], count: 5 },
            { mobs: ["minecraft:vindicator", "minecraft:pillager", "minecraft:drowned"], count: 6 },
          ],
        },
      ],
      outro: [
        "On the third quench the blade sings a note so clear the soul fire bends toward it. Then everything that came out of the dark to listen is gone, and the night is very quiet.",
        `${I}Did you hear it? Not the blade. Under it. Something answered. Far off, deep down. Like a door opening very slowly in a big, empty house.`,
        `${I}I don't like that. But the blade is true. Look at it. Not a crack. Dunmore, you old goat. Five tries.`,
        `${I}One more line: 'named true'. A blade that sings needs a name, or it sings whatever it likes. Ask around. Ask Sol; he names stars for a living. Ask Tobin. Then come back.`,
      ],
      reward: {
        levels: 4,
        crowns: 50,
        codex: { id: "answering_note", title: "The Note That Answered", text: "When the singing blade was quenched in soul fire, monsters came out of the dark to listen, among them drowned with rope on their wrists. And under the blade's note, Ida heard something answer: far off and deep down, like a door opening slowly in a big empty house." },
      },
      rep: [{ guild: "miners", amount: 10 }],
      hint: "Craft a soul campfire (soul sand or soul soil, logs and sticks) and place it within 12 blocks of Dunmore's old forge near spawn. Use it 3 times, then stay within 20 blocks while three waves come. Lighting the area first keeps extra monsters away.",
    },
    {
      id: "named_true",
      title: "Named True",
      intro: [
        `${I}It hums all night. Hums when I'm happy, goes quiet when I'm cross. It's listening to me. I don't want it listening to me. It should be listening to you.`,
        `${I}Ask Sol and Tobin what they'd call it. They're the two oldest souls in town that aren't Elsie, and you don't ask Elsie anything unless you want soup.`,
        `${I}Then take it to Dunmore's forge after midnight and sit with it. Quiet. It'll tell you which name it likes. Blades do. Don't laugh.`,
        `${I}Dunmore said a true name is the one that makes the thing more itself. Not the grandest. Not the one that sounds best in a song. The one it answers to.`,
      ],
      objectives: [
        { type: "talk", label: "Ask Sol the Sky-reader for a name", npc: "sol" },
        { type: "talk", label: "Ask Old Tobin for a name", npc: "tobin" },
        { type: "vigil", label: "Sit with the blade at Dunmore's old forge after midnight (1 minute)", offset: FORGE, mark: "Dunmore's old forge", radius: 12, seconds: 60, timeOfDay: [18000, 22500] },
      ],
      outro: [
        "At midnight the blade sings on your knees, so softly you could mistake it for the wind. Three names are in your head.\n\nSol's: §bStarsong§r. 'Because it is made of a star that fell, and it remembers how to sing on the way down.'",
        { text: "Tobin's: §bHal's Answer§r. He said it gruffly, looking out at the water. 'A note against the dark. My brother would've liked a sword like that.'", when: { "drowned_bell.bell": "!ring" } },
        { text: "Tobin's: §bHal's Answer§r. He said it gruffly, looking out at the water. 'A note against the dark. A bell already rings for him out there. Let a blade sing for him too.'", when: RUNG },
        `And Ida's, the one she didn't want to say: §bDunmore§r. 'The old goat earned it. Five tries.'\n\n${I}Well? Say it out loud. It's listening.`,
      ],
      choices: [
        {
          id: "starsong",
          label: "Starsong",
          set: { blade: "starsong" },
          rep: [{ guild: "wayfarers", amount: 15 }],
          reply: [`The blade rings once, high and bright, like a star coming out.\n\n${I}Starsong. Sol is going to be insufferable about this. Good.`],
        },
        {
          id: "hals_answer",
          label: "Hal's Answer",
          set: { blade: "hal" },
          rep: [{ guild: "wardens", amount: 15 }],
          reply: [`The blade gives a low, steady note, like a bell across water.\n\n${I}Hal's Answer. Go and show Tobin. Then give the man a minute alone.`],
        },
        {
          id: "dunmore",
          label: "Dunmore",
          set: { blade: "dunmore" },
          rep: [{ guild: "miners", amount: 15 }],
          reply: [`The blade hums, warm and rough and a little out of tune, like an old man laughing.\n\nIda turns away, fast.\n\n${I}...Dunmore. Thank you. Now get out of my forge before I do something embarrassing.`],
        },
      ],
      reward: { levels: 5, crowns: 60, relic: "singing_blade", title: "Forge-Singer", journal: { entry: "singing_forge", label: "The Forge That Sings" } },
      rep: [{ guild: "miners", amount: 15 }],
      hint: "Sol and Tobin are in town. Then stay within 12 blocks of Dunmore's old forge near spawn between midnight and just before dawn, for 1 minute.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [WARDENS_OATH, SMUGGLERS_RUN, MAYORS_BURDEN, EDGES_OF_MAP, SINGING_FORGE];
