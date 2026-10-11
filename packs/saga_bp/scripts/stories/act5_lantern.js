// Story content: see docs/STORY_BIBLE.md. Written by the act5_lantern writer.
// Act V, "Lantern Night": the finale of The Lantern and the Hollow (bible sections 3 and 7).
// Keep every id (story, chapter, choice, flag) stable once published: progress is saved by them.
//
// Flags read: g:quill, g:vesna, g:hollis, g:mercy, g:iron, act3_deep.elsie, drowned_bell.bell, last_map.map,
// act1_signs.act1:path, act4_seals.act4:promise (allow / refuse). Flags set: g:allies (one per ally chapter, so the
// Long Night can scale), g:ending (relight / gift / crown, read by other stories after the finale),
// and this story's own `horse` (ember / comet) and `gate` (sneak / fight).
/** @typedef {import("../types.js").Story} Story */
/** @typedef {import("../types.js").When} When */
/** @typedef {import("../types.js").Who} Who */

const B = "§eBram:§r ";
const R = "§eReyes:§r ";
const T = "§eTobin:§r ";
const I = "§eIda:§r ";
const E = "§eElsie:§r ";
const Q = "§eQuill:§r ";
const S = "§eSol:§r ";
const M = "§eMara:§r ";
const H = "§eHollis:§r ";
const MO = "§eMoss:§r ";
const W = "§eWren:§r ";
const BE = "§eBea:§r ";
const V = "§eVesna:§r ";
const A = "§7Ashgrave:§r ";
const HERALD = "§5The Herald:§r ";
const DEEP = "§5A voice from below:§r ";

/** @type {When} */ const RING = { "drowned_bell.bell": "ring" };
/** @type {When} */ const NOT_RING = { "drowned_bell.bell": "!ring" };
/** @type {When} */ const SILENCE = { "drowned_bell.bell": "silence" };
/** @type {When} */ const NOT_SILENCE = { "drowned_bell.bell": "!silence" };
/** @type {When} */ const NO_ALLIES = { "g:quill": "!trusted", "g:vesna": "!free", "g:hollis": "!saved" };
/** @type {When} */ const PROMISED = { "act4_seals.act4:promise": "allow" };
/** @type {When} */ const REFUSED = { "act4_seals.act4:promise": "refuse" };
/** @type {When} */ const EMBER = { horse: "ember" };
/** @type {When} */ const COMET = { horse: "comet" };

/** @type {Who} */ const PIP = { id: "pip", name: "Pip", entity: "minecraft:villager_v2" };
const GATE = "hollow_gate";
const SAPLINGS = [
  "minecraft:oak_sapling",
  "minecraft:spruce_sapling",
  "minecraft:birch_sapling",
  "minecraft:jungle_sapling",
  "minecraft:acacia_sapling",
  "minecraft:dark_oak_sapling",
  "minecraft:cherry_sapling",
  "minecraft:mangrove_propagule",
];
const CANDLES = [
  "minecraft:candle",
  "minecraft:white_candle",
  "minecraft:yellow_candle",
  "minecraft:orange_candle",
  "minecraft:light_gray_candle",
  "minecraft:gray_candle",
  "minecraft:red_candle",
  "minecraft:blue_candle",
];

/** @type {Story[]} */
export const STORIES = [
  {
    id: "act5_lantern",
    title: "Lantern Night",
    short: "Lantern Night",
    giver: "bram",
    kind: "main",
    act: 5,
    tones: ["epic", "heroic", "violent", "sad", "scary"],
    summary: "The Lantern burns overhead and the Hollow Gate stands open. Mayor Bram needs the town ready by nightfall.",
    requires: { stories: ["act4_seals"] },
    chapters: [
      // 1. Rally the town -------------------------------------------------------------------
      {
        id: "rally",
        title: "Rally the Town",
        npc: "bram",
        end: "wren",
        intro: [
          `§eMayor Bram§r has not slept. The council table is buried in lists, and the comet's tail hangs in the window behind him like a torn sail made of light.\n\n${B}Sol says tomorrow night. The Lantern passes straight overhead tomorrow night, and whatever is behind that gate will come out to meet it.`,
          `${B}My father told this town to forget. Forty winters of forgetting, and now we have one day to remember how to be brave.\n\nHe straightens his coat. It doesn't help much.\n\n${B}So. We remember.`,
          { text: `${B}Elsie told me what you promised her, at the end of all that business with the seals. I won't pretend I understood it. I only know she smiled for the first time in a week, and then went into the pantry and cried.`, when: PROMISED },
          { text: `${B}Elsie told me you refused her, at the end of all that business with the seals. Good. I don't care how old she is or what she's made of. Nobody in my town gets to be a candle.`, when: REFUSED },
          `${B}Reyes needs arrows and shields for the barricade on the cliff road. Bea is feeding every warden, fisher and farmer who can hold a torch. And Wren needs horses for the riders who'll carry word between the lighthouse and the square tonight.`,
          `${B}The horses bolted when the comet's tail came up last night. Wren says they're up by the lighthouse, eating the cliff grass and pretending not to hear her. Go on, then. And if anyone asks whether the mayor is frightened, tell them he's busy.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Warden Reyes 64 arrows", npc: "reyes", item: "minecraft:arrow", count: 64 },
          { type: "deliver", label: "Bring Warden Reyes 4 shields", npc: "reyes", item: "minecraft:shield", count: 4 },
          { type: "deliver", label: "Bring Bea 24 baked potatoes for the defenders", npc: "bea", item: "minecraft:baked_potato", count: 24 },
          {
            type: "lead",
            label: "Lead 3 runaway horses from the Lighthouse to Wren's Meadow",
            mob: "minecraft:horse",
            name: "Rider's Horse",
            count: 3,
            spawnAt: { place: "lighthouse", radius: 12 },
            to: { place: "meadow", radius: 10 },
          },
        ],
        outro: [
          `§eWren§r is waiting at the meadow gate, bouncing on her toes.\n\n${W}You found them! All three! That one bit me last week but I think it was a love bite, and that one is scared of comets, which is fair, I am too, a little, but only a little.`,
          `Down the hill, Reyes's wardens are fletching arrows on the chapel steps, and Bea's kitchen chimney hasn't stopped smoking since noon. For the first time in forty winters the whole town is awake on purpose.`,
          `${W}The brown mare is going to lead the riders tonight, so she needs a real name. A brave one. Elsie says names are like lanterns, you hold them up and they show you the way. Pick one. Please. Quickly. She's eating the fence.`,
        ],
        choices: [
          {
            id: "ember",
            label: "Name her Ember",
            set: { horse: "ember" },
            reply: [`${W}Ember! Because she's warm and red and she'll keep burning all night. Ember, Ember. See, she likes it. She just ate my hat. That means she likes it.`],
          },
          {
            id: "comet",
            label: "Name her Comet",
            set: { horse: "comet" },
            reply: [`${W}Comet! Like the Lantern, but on our side. Comet. She tossed her head, see? That means yes in horse. Everybody knows that.`],
          },
        ],
        reward: { levels: 6, crowns: 100, items: [{ item: "minecraft:golden_carrot", amount: 8 }, { item: "minecraft:bread", amount: 12 }] },
        rep: [
          { guild: "wardens", amount: 10 },
          { guild: "growers", amount: 10 },
        ],
        hint: "Talk to Reyes with the arrows and shields in your inventory, and to Bea with the baked potatoes. The three horses wait near the Lighthouse: bring leads (string and a slimeball, or buy them from a wandering trader) and walk them into Wren's Meadow, then report to Wren.",
      },

      // 2. Allies: Quill's smugglers (only if Quill was trusted) ------------------------------
      {
        id: "smugglers",
        title: "Quill's Last Run",
        npc: "quill",
        when: { "g:quill": "trusted" },
        intro: [
          `§eQuill§r is sitting on a crate with his boots up, which is how he looks when he is about to ask for something enormous.\n\n${Q}Friend. Partner. Co-conspirator. You trusted me when Reyes wanted me in irons. I keep a ledger, you know. Debts get paid.`,
          `${Q}I've called in every favor on this coast. Nine boats, thirty cutthroats, and a frankly illegal amount of gunpowder. They won't take orders from a mayor. They'll take them from me, and tonight I take them from you.`,
          `${Q}Two problems. The powder is sealed in barrels at the cove, and my lads won't believe it's real until someone cracks them open in front of them. And somebody has to row the first boat round to the harbor so the rest can follow. Captains first. That's you.`,
          { text: `${Q}With the bell ringing true again, my lads can find the harbor in the dark by ear. Whatever else you did, you did that right.`, when: RING },
          { text: `${Q}Shame about the bell. A silent harbor is a hard harbor to find at night. We'll steer by your lantern instead, so try to keep it lit.`, when: NOT_RING },
        ],
        objectives: [
          { type: "interact", label: "Crack open 4 powder barrels at Smugglers' Cove", place: "sea_cave", blocks: ["minecraft:barrel"], count: 4, radius: 16 },
          { type: "ride", label: "Row a boat 200 blocks at the head of Quill's fleet", mobs: ["minecraft:boat", "minecraft:chest_boat"], distance: 200 },
          { type: "talk", label: "Tell Quill the fleet is in the harbor", npc: "quill" },
        ],
        outro: [
          `Nine boats slide into the harbor behind you, dark and silent, every one of them riding low with powder and steel. Fishermen who would have cursed them a month ago catch their ropes and tie them off without a word.`,
          `${Q}Look at that. Smugglers and honest folk on the same dock, and nobody's even checking their pockets. If I'd known saving the world was this good for business I'd have started years ago.`,
          `${Q}One more thing, partner. When this is over, and it will be over, I want my name on something. A bench. A plaque. A very small statue. I'd settle for a bench.`,
        ],
        choices: [
          {
            id: "bench",
            label: "You'll get your bench",
            inc: { "g:allies": 1 },
            rep: [{ guild: "wayfarers", amount: 15 }],
            reply: [`${Q}A bench! With a little brass plate. QUILL SAT HERE AND WAS RIGHT. I'll write it myself. Go on, go, before I get sentimental and give you a discount.`],
          },
          {
            id: "statue",
            label: "Win first, then we'll talk statues",
            inc: { "g:allies": 1 },
            rep: [{ guild: "wayfarers", amount: 15 }],
            reply: [`${Q}A negotiator! I knew I liked you. Fine. Win first. But I'm measuring the square for a pedestal while you're gone.`],
          },
        ],
        reward: { levels: 5, crowns: 80, items: [{ item: "minecraft:firework_rocket", amount: 16 }] },
        hint: "Smugglers' Cove is the hidden dock on the coast; the tracker points there. Tap 4 barrels in the cove. Any boat counts for the ride: put one in the water and row anywhere until the counter fills, then talk to Quill.",
      },

      // 3. Allies: Vesna (only if she was freed) ---------------------------------------------
      {
        id: "fen",
        title: "A Song from the Fen",
        npc: "moss",
        when: { "g:vesna": "free" },
        intro: [
          `§eMoss§r leans on his shovel at the graveyard gate.\n\n${MO}Had a visitor last night. Came over the wall like a cat, smelled like a bog, left this on my best headstone.\n\nHe holds up a bundle of fen reeds tied with red thread.`,
          `${MO}Vesna's sign. You freed her, and witches remember that sort of thing longer than the rest of us remember birthdays. She wants you at Hollow Fen. Says she has a song for tomorrow night.`,
          `${MO}Bring her something for the brewing. Nether wart, she said, and glass bottles, and don't ask her what for. I asked once. I still don't sleep on my left side.`,
          { text: `${MO}She said one more thing. She said she heard Brother Hollis singing in the reeds. I told her that's not possible. She just looked at me with those swamp-water eyes.`, when: { "g:hollis": "lost" } },
          { text: `${MO}She asked after young Hollis, too. Fond of him, in her way. Says he has the kind of voice the dark wants. Lovely thing to say about a friend.`, when: { "g:hollis": "!lost" } },
        ],
        objectives: [
          { type: "collect", label: "Have 8 nether wart for Vesna's brew", item: "minecraft:nether_wart", count: 8 },
          { type: "collect", label: "Have 6 glass bottles", item: "minecraft:glass_bottle", count: 6 },
          {
            type: "meet",
            label: "Meet Vesna at Hollow Fen",
            place: "witch_hut",
            radius: 12,
            who: { id: "vesna", name: "Vesna of the Fen", entity: "minecraft:witch" },
            pages: [
              `§eVesna§r steps out of the reeds as if the water opened for her. Her hat is soaked. She is smiling, which is somehow worse.\n\n${V}My liberator. You came. Most heroes only come to the Fen to stab things.`,
              `${V}You freed me when binding me would have been safer. So I will sing for you tomorrow night: the old Starwright song, the one that makes the drowned remember they were people once. They lower their swords to listen. Not all of them. Enough.`,
              `${V}Stay until dark. A song must be learned under the stars or it never takes. And give me those bottles before you drop them, mortal. I can hear them clinking with fear.`,
            ],
          },
          { type: "vigil", label: "Stay at Hollow Fen after dark while Vesna sings", place: "witch_hut", radius: 16, seconds: 60, timeOfDay: [13000, 23000] },
        ],
        outro: [
          `Vesna sang until the moon was high. The frogs went quiet to listen. When she finished, the fen water held the shape of the song for a long moment, rings spreading out from nothing at all.`,
          `${MO}She came through here at dawn on her way to the lighthouse, carrying a cauldron on her back like a snail. Waved at me. I waved back. Strange times.`,
          `Moss hands you a note on reed paper, in green ink that smells of mint and mud:\n\n§oTell the warden I am not to be shot. Tell the cook I want soup. Tell yourself you are not alone.§r`,
        ],
        choices: [
          {
            id: "thanks",
            label: "Send Vesna your thanks",
            inc: { "g:allies": 1 },
            rep: [{ guild: "growers", amount: 15 }],
            reply: [`${MO}I'll pass it on. She'll pretend not to care. She'll keep the note in her hat for a hundred years. Witches.`],
          },
        ],
        reward: { levels: 5, crowns: 80, items: [{ item: "minecraft:golden_apple", amount: 2 }] },
        hint: "Hollow Fen is the stilt hut over the swamp; the tracker points there. Nether wart grows in Nether fortresses, and glass bottles are crafted from glass. Meet Vesna at the hut, then stay there between nightfall and dawn for a minute.",
      },

      // 4. Allies: Brother Hollis (only if he was saved) -------------------------------------
      {
        id: "chapel",
        title: "A Lamp for the Lost",
        npc: "hollis",
        when: { "g:hollis": "saved" },
        intro: [
          `§eBrother Hollis§r is on his knees in the chapel, scrubbing salt stains out of the floor. He looks up, and for once his eyes are clear.\n\n${H}I slept last night. All night. No bells, no drowned man, no voice. I woke up and cried like a child. I hope you don't mind me telling you that.`,
          `${H}You pulled me back when it would have been easier to let me go. I won't waste that. The Herald used my voice for months. Tomorrow night I mean to use it against him.`,
          `${H}The counter-song. If I sing it from this chapel while the Lantern passes, the drowned will hear it all the way down to the sea. The chapel sits on the listening stone, after all. For once, let the stone hear something kind.`,
          `${H}Light the candles for me, please. Then test me on the hymn, because I'm terrified I've forgotten it. And would you tell Moss I'm all right? He keeps leaving bread on the step like I'm a stray cat.`,
        ],
        objectives: [
          { type: "interact", label: "Light 6 candles in the Old Chapel (place new ones if they're gone)", place: "old_chapel", blocks: CANDLES, count: 6, radius: 12 },
          {
            type: "answer",
            label: "Answer Hollis's question about the hymn",
            npc: "hollis",
            question: `${H}The hymn turns on one word the drowned can't bear. It's what the Hollow hungers for and can never keep. It weighs nothing, and a candle gives it away all night and never runs out. What is it?`,
            answers: ["light", "the light", "candlelight"],
          },
          { type: "talk", label: "Tell Moss that Hollis is all right", npc: "moss" },
        ],
        outro: [
          `The candles burn straight and still, even with the door open to the sea wind. Hollis stands among them with his eyes shut and sings the hymn through once. His voice cracks on the high note. He doesn't stop.`,
          `${H}Moss came by. He brought bread. He said, and I quote, "Don't die, it's a lot of digging." I think that is the kindest thing anyone has ever said to me.`,
          `${H}Tomorrow night I'll be here, singing, until the Lantern is gone or I am. You go and do the brave part. I'll do the loud part.`,
        ],
        choices: [
          {
            id: "sing",
            label: "Sing loud, Brother",
            inc: { "g:allies": 1 },
            rep: [{ guild: "growers", amount: 10 }],
            reply: [`${H}Loud enough to wake the dead, and then sing them back to sleep. That's the job.\n\nHe laughs. It sounds rusty, like a gate nobody has opened in a long time.`],
          },
        ],
        reward: { levels: 5, crowns: 80, items: [{ item: "minecraft:candle", amount: 8 }, { item: "minecraft:honey_bottle", amount: 4 }] },
        hint: "The Old Chapel is the mossy chapel the tracker points to. Tap 6 candles inside it (bring candles and place them if none are left). The answer to Hollis's question is one plain word. Moss is in town with the other townsfolk.",
      },

      // 5. No allies: Reyes laments ----------------------------------------------------------
      {
        id: "alone",
        title: "No One Is Coming",
        npc: "reyes",
        when: NO_ALLIES,
        intro: [
          `§eWarden Reyes§r is on the cliff road, counting heads. She counts twice. The number doesn't change.\n\n${R}Forty-one. Wardens, fishers, two farmers who can't shoot and a baker who can. That's the line. That's all of it.`,
          { text: `${R}The smugglers won't come. Not after what happened with Quill. I don't blame them. In their boots, I wouldn't come either.`, when: { "g:quill": "exposed" } },
          { text: `${R}I sent riders down the coast for help. Nothing came back. Not a boat, not a letter. The coast has decided we're already lost.`, when: { "g:quill": "!exposed" } },
          { text: `${R}And the chapel's dark. No Hollis to sing the drowned back to sleep. Some nights I still hear him laughing at my jokes. He was the only one who ever did.`, when: { "g:hollis": "lost" } },
          { text: `${R}Brother Hollis is in no shape to sing. He sits in the chapel staring at the sea. I've posted a warden on him, for his sake and ours.`, when: { "g:hollis": "!lost" } },
          `${R}I wanted allies. Witches, outlaws, anybody. We don't have them. So we build walls, and we kill their scouts before the scouts can count us. That's an order. Mostly.`,
        ],
        objectives: [
          {
            type: "place",
            label: "Build a barricade at the Lighthouse (place 32 walls, fences or stone)",
            place: "lighthouse",
            radius: 32,
            count: 32,
            blocks: ["minecraft:cobblestone_wall", "minecraft:oak_fence", "minecraft:spruce_fence", "minecraft:cobblestone", "minecraft:stone_bricks", "minecraft:cobbled_deepslate"],
          },
          {
            type: "defeat",
            label: "Kill 12 Choir scouts and prowlers near the Lighthouse after dark",
            mobs: ["minecraft:zombie", "minecraft:skeleton", "minecraft:drowned", "minecraft:spider", "minecraft:creeper", "minecraft:husk", "minecraft:stray"],
            count: 12,
            place: "lighthouse",
            radius: 96,
            night: true,
          },
        ],
        outro: [
          `The barricade isn't pretty. It's cobble and fence posts and an upturned cart, and somebody has written GO HOME on it in chalk. Reyes looks at it for a long time.`,
          `${R}When I was a recruit, my captain told me heroes are just people nobody came to help. I thought it was a joke. Turns out it was a warning.`,
          `${R}Tomorrow it's us. Just us. So be worth three allies, will you? I'll try to be worth two.`,
        ],
        reward: { levels: 6, crowns: 100, items: [{ item: "minecraft:arrow", amount: 32 }, { item: "minecraft:golden_apple", amount: 1 }] },
        rep: [{ guild: "wardens", amount: 15 }],
        hint: "Any wall, fence, cobblestone or stone brick you place within 32 blocks of the Lighthouse counts. The scouts are any hostile mobs you kill near the Lighthouse at night.",
      },

      // 6. The Long Night --------------------------------------------------------------------
      {
        id: "long_night",
        title: "The Long Night",
        npc: "reyes",
        intro: [
          `The Lantern rises at dusk, a white wound across the sky, and the sea begins to sing.\n\n${R}Here they come. Every drowned thing in forty winters of water, and the Choir behind them. Positions!`,
          { text: `Quill's nine boats rock in the harbor, lanterns hooded, crossbows ready. Quill himself stands on the lighthouse steps in a coat far too good for fighting. He winks at you.`, when: { "g:quill": "trusted" } },
          { text: `On the rocks below the tower, Vesna has set her cauldron on a driftwood fire. Green steam rolls down over the surf. She is humming already, low, in a language older than the town.`, when: { "g:vesna": "free" } },
          { text: `Far behind you, up the hill, a light burns in the chapel window. Faint on the wind you hear Brother Hollis begin the hymn, alone, unaccompanied, unafraid.`, when: { "g:hollis": "saved" } },
          { text: `There is no help coming. Behind the barricade, forty-one people hold their breath, and Reyes walks the line telling each of them their name, as if they might forget it.`, when: NO_ALLIES },
          `${R}Little Pip snuck out of the cellar again. He's up in the lantern room keeping the light going and he won't come down. Fine. Then nothing gets up those stairs. Nothing.`,
          `${R}Four waves, Sol says, one for each quarter of the night. Hold the lighthouse until dawn. If the light goes out, the Lantern passes over a dark town and the seals go hungry.`,
        ],
        objectives: [
          {
            type: "defend",
            label: "Hold the Lighthouse through four waves and keep Pip alive",
            when: { "g:allies": ">=1" },
            place: "lighthouse",
            radius: 24,
            ward: PIP,
            waves: [
              { mobs: ["minecraft:drowned", "minecraft:zombie"], count: 10 },
              { mobs: ["minecraft:drowned", "minecraft:skeleton", "minecraft:pillager"], count: 12 },
              { mobs: ["minecraft:vindicator", "minecraft:pillager", "minecraft:witch"], count: 10 },
              { mobs: ["minecraft:drowned", "minecraft:vindicator", "minecraft:evocation_illager"], count: 12 },
            ],
          },
          {
            type: "defend",
            label: "Hold the Lighthouse alone through four waves and keep Pip alive",
            when: NO_ALLIES,
            place: "lighthouse",
            radius: 24,
            ward: PIP,
            waves: [
              { mobs: ["minecraft:drowned", "minecraft:zombie", "minecraft:husk"], count: 14 },
              { mobs: ["minecraft:drowned", "minecraft:skeleton", "minecraft:stray", "minecraft:pillager"], count: 16 },
              { mobs: ["minecraft:vindicator", "minecraft:pillager", "minecraft:witch"], count: 14 },
              { mobs: ["minecraft:vindicator", "minecraft:evocation_illager", "minecraft:drowned", "minecraft:ravager"], count: 12 },
            ],
          },
          {
            type: "defeat",
            label: "No smugglers guard the cliffs: kill 12 zombies and skeletons climbing up near the Lighthouse",
            when: { "g:quill": "!trusted", "g:allies": ">=1" },
            mobs: ["minecraft:zombie", "minecraft:skeleton", "minecraft:husk", "minecraft:stray"],
            count: 12,
            place: "lighthouse",
            radius: 64,
            night: true,
          },
          {
            type: "defeat",
            label: "No witch's steam keeps the dark back: kill 10 spiders, creepers or phantoms near the Lighthouse",
            when: { "g:vesna": "!free", "g:allies": ">=1" },
            mobs: ["minecraft:spider", "minecraft:creeper", "minecraft:phantom", "minecraft:cave_spider"],
            count: 10,
            place: "lighthouse",
            radius: 64,
            night: true,
          },
          {
            type: "defeat",
            label: "No hymn sings the drowned to sleep: kill 15 drowned near the Lighthouse",
            when: { "g:hollis": "!saved", "g:allies": ">=1" },
            mobs: ["minecraft:drowned"],
            count: 15,
            place: "lighthouse",
            radius: 64,
            night: true,
          },
          { type: "vigil", label: "Stand on the Lighthouse in the open until the sky turns gray", place: "lighthouse", radius: 24, seconds: 60, timeOfDay: [22000, 23900], outdoors: true },
        ],
        outro: [
          `The fourth wave breaks on the rocks at the gray end of the night. The last drowned stands in the surf, looks up at the lighthouse beam, and simply comes apart in the foam, rope and all.`,
          { text: `${R}We had everyone. Smugglers on the water, a witch on the rocks, a priest in the window. I've never seen anything like it. I never will again. Count off! ...Everyone answers. Everyone.`, when: { "g:allies": ">=3" } },
          { text: `${R}Two allies and forty-one fools, and we held. Count off! ...Two don't answer. Two out of all of that. I'll carry their names to Moss myself.`, when: { "g:allies": "2" } },
          { text: `${R}One ally. One. And we held anyway. Count off! ...Five don't answer. Five. I'll want their names on the chapel wall, Bram, not in a drawer.`, when: { "g:allies": "1" } },
          { text: `${R}Nobody came, and we held. Count off! ...Nine don't answer. Nine. She says each name out loud, and then she sits down on the barricade and puts her face in her hands, just for a moment.`, when: NO_ALLIES },
          `Up in the lantern room, Pip is asleep against the lamp housing, black with soot, one hand still on the oil can. The light never went out.`,
          `${R}Sol has been shouting from the square. Tonight the Lantern reaches its height, and the Gate is wide open, out past the hills. Everything that hit us came from there, and whatever's left is still inside.\n\nShe tightens her gauntlets.\n\n${R}You know where you're going.`,
        ],
        reward: {
          levels: 8,
          crowns: 120,
          items: [{ item: "minecraft:golden_apple", amount: 2 }, { item: "minecraft:cooked_beef", amount: 16 }],
          codex: {
            id: "long_night",
            title: "The Long Night",
            text: "On the first night of the Lantern's pass, the Hollow sent everything it had against the town: forty winters of drowned, and the Gray Choir behind them. The lighthouse held until dawn. Pip kept the lamp lit. Not everyone who stood on the cliff road came home.",
          },
        },
        rep: [{ guild: "wardens", amount: 25 }],
        hint: "Stay within 24 blocks of the Lighthouse at night; the waves come while you're there. Keep Pip alive. Extra tasks appear only for each ally you don't have. The last step needs the very end of the night, just before sunrise, out in the open.",
      },

      // 7. Through the Gate ------------------------------------------------------------------
      {
        id: "gate",
        title: "Through the Gate",
        npc: "sol",
        intro: [
          `§eSol§r has his spyglass trained on the hills, not the sky, for the first time in his life.\n\n${S}The Lantern is at Vega's shoulder. When it crosses Deneb it will stand straight over the Sky Seal. That is the moment. Between now and then, someone must walk into the door it is shining through.`,
          `${S}The Hollow Gate. I can see it from here: a black mouth with sculk for lips and soul fire for teeth. The last circle of the Gray Choir kneels around it, humming the broken note, waiting for their Herald to rise.`,
          { text: `${S}You have walked gently all this way. Sparing, forgiving, listening. The Choir does not expect that. A quiet hero can pass through a crowd of singers like starlight through cloud.`, when: { "g:mercy": ">=4" } },
          { text: `${S}You have been hard when hardness was needed, and the Choir has heard your name. They are afraid of you. Fear makes a circle easy to break.`, when: { "g:iron": ">=4" } },
          { text: `${S}Reyes wanted to send wardens with you. I reminded her of what you did at the very beginning, when you followed the Choir alone. Some roads are walked alone.`, when: { "act1_signs.act1:path": "alone" } },
          { text: `${S}Reyes will hold the road behind you with every warden she has left. You brought her the truth at the very beginning. She has never forgotten it.`, when: { "act1_signs.act1:path": "!alone" } },
          `${S}So, star-walker. Do you go through them, or past them?`,
        ],
        introChoices: [
          {
            id: "sneak",
            label: "Slip past the circle unseen",
            requires: { flags: { "g:mercy": ">=4" } },
            set: { gate: "sneak" },
            reply: [`${S}Then go softly. Keep low, keep moving, and do not let them see your face. They are watching the Gate, not the dark behind them. Polaris keep you.`],
          },
          {
            id: "fight",
            label: "Cut through the last circle",
            set: { gate: "fight" },
            reply: [`${S}Then go loudly. Thirty singers, perhaps more, and every one of them has waited forty winters for this. Do not let the song finish. Antares keep you.`],
          },
        ],
        objectives: [
          { type: "reach", label: "Travel to the Hollow Gate", place: GATE, radius: 40 },
          {
            type: "stealth",
            label: "Sneak through the Choir's last circle to the mouth of the Gate",
            when: { gate: "sneak" },
            place: GATE,
            radius: 32,
            guards: { mob: "minecraft:vindicator", count: 8, name: "Choir Singer" },
            goal: { dx: 0, dz: 0 },
            detect: 14,
            detectSneak: 5,
            onSpotted: "ambush",
          },
          {
            type: "defend",
            label: "Fight through the Choir's last circle at the Gate (three waves)",
            when: { gate: "fight" },
            place: GATE,
            radius: 20,
            waves: [
              { mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 10 },
              { mobs: ["minecraft:vindicator", "minecraft:witch", "minecraft:pillager"], count: 10 },
              { mobs: ["minecraft:vindicator", "minecraft:evocation_illager", "minecraft:pillager"], count: 10 },
            ],
          },
          {
            type: "vision",
            label: "Look down into the Hollow Gate",
            place: GATE,
            radius: 12,
            dark: true,
            scenes: [
              { title: "The Gate", text: "You step under the arch. The soul fire leans toward you like flowers toward the sun. Then the sound of the world goes away.", sound: "mob.warden.heartbeat", seconds: 6 },
              { text: "Below is not a pit. It is an ear. It has been listening since before the first word, and every sound you have ever made is still down there, kept.", sound: "ambient.cave", seconds: 7 },
              { text: "A voice, very close, very tired: You came. Good. I have been so lonely, being a song.", seconds: 6 },
              { title: "The Herald", text: "Far below, a cracked bell rings once, from forty winters away. And something climbs up out of the dark to meet you.", sound: "block.bell.hit", seconds: 6 },
            ],
          },
        ],
        outro: [
          { text: `You come back over the hill with the singers' hymn stuck in your ears. Not one of them saw you. Behind you the circle is still kneeling and humming to a door that is no longer theirs.`, when: { gate: "sneak" } },
          { text: `The last singer falls with the broken note half-sung. The circle of gray hoods lies still around the arch, and the soul fire gutters, starved of their song.`, when: { gate: "fight" } },
          `${S}You saw him. I can see it on you, like frost on a window. The Herald waits at the bottom of the Gate. When the Lantern is highest he will come up to meet it, and he will bring the broken note with him.`,
          `${S}Elsie is asking for you. She has her apron on, the starlit one, and she has not tied it like an apron. She has tied it like armor.`,
        ],
        reward: {
          levels: 7,
          crowns: 120,
          items: [{ item: "minecraft:ender_pearl", amount: 4 }],
          codex: {
            id: "hollow_gate",
            title: "The Hollow Gate",
            text: "Where the last fragment of the Lantern fell, the ground opened into the Hollow itself: an arch of crying obsidian over a pit that is not a pit but an ear. It has listened since before the first word. Every sound ever made is kept down there. The Gray Choir guarded it to the end.",
          },
        },
        rep: [
          { guild: "wayfarers", amount: 15, when: { gate: "sneak" } },
          { guild: "wardens", amount: 15, when: { gate: "fight" } },
        ],
        hint: "The Hollow Gate is far out (800 to 1500 blocks); the tracker points the way, and a horse or elytra helps. Sneaking: hold sneak and stay out of the singers' sight until you reach the middle of the pit. Fighting: stay at the arch until all three waves are down.",
      },

      // 8. The Herald ------------------------------------------------------------------------
      {
        id: "herald",
        sequential: true,
        title: "The Herald",
        npc: "elsie",
        intro: [
          `§eElsie§r is waiting at the inn door with a lantern in each hand. She looks young tonight, younger than you've ever seen her, and terribly old in the eyes.\n\n${E}He was my friend, you know. Ashgrave. He used to bring my sister apples. Lily hid them under her pillow and the whole room smelled of autumn.`,
          `${E}Grief opened a door in him, and the Hollow climbed in. Forty winters it has worn him like a coat. Whatever comes up out of that Gate will have his face. It will not be him. Remember that when it begs.`,
          { text: `${E}And child, if Hollis is there. If what is left of Hollis is there. It will be the same with him. The Hollow does not let go of a voice it likes. Be quick. Be kind with your sword.`, when: { "g:hollis": "lost" } },
          { text: `${E}Hollis is singing in the chapel. Do you hear him, faint, even from here? Every note is one the Hollow cannot use. You saved that voice. Now go and use the quiet it buys you.`, when: { "g:hollis": "saved" } },
          { text: `${E}He will try to ring the broken note. He cannot use the harbor bell; you smothered it. So he will ring the only bell he has left: himself. When he sings, strike.`, when: SILENCE },
          { text: `${E}He will try to ring the broken note through the harbor bell, but you gave it a true voice and it will fight him. Listen for it. When it rings, strike.`, when: NOT_SILENCE },
          `${E}Three times he will rise, the old songs say: as the man, as the voice, and as the hunger. Three times you must put him down. Go. I will be waiting at the Sky Seal when it's done.`,
        ],
        objectives: [
          {
            type: "defeat",
            label: "Free Brother Hollis from the Hollow (defeat him at the Gate)",
            when: { "g:hollis": "lost" },
            place: GATE,
            radius: 40,
            count: 1,
            champion: {
              tag: "realm:saga:hollow_hollis",
              mob: "minecraft:zombie_villager_v2",
              name: "Hollis, the Hollow's Choir",
              trait: "frostbound",
              warn: "A young voice sings from the pit, sweet and wrong. Brother Hollis climbs out of the dark, still wearing his chapel robe.",
              health: 40,
              adds: { mobs: ["minecraft:vex"], count: 3 },
            },
          },
          {
            type: "defeat",
            label: "Defeat Brother Ashgrave, the man",
            place: GATE,
            radius: 40,
            count: 1,
            champion: {
              tag: "realm:saga:herald_man",
              mob: "minecraft:drowned",
              name: "Brother Ashgrave",
              trait: "shielded",
              warn: "Wet footsteps climb out of the pit. A drowned man in a rotted chapel robe, black rope at his wrists, steps into the soul light.",
              health: 60,
              adds: { mobs: ["minecraft:drowned"], count: 4 },
            },
          },
          {
            type: "defeat",
            label: "Defeat the Hollow Herald, the voice",
            place: GATE,
            radius: 40,
            count: 1,
            champion: {
              tag: "realm:saga:herald_voice",
              mob: "minecraft:drowned",
              name: "The Hollow Herald",
              trait: "stormcaller",
              warn: "The air fills with a voice that has no mouth. The broken note rises out of the Gate, and every drowned for a mile turns to listen.",
              health: 80,
              adds: { mobs: ["minecraft:vex", "minecraft:drowned"], count: 5 },
            },
          },
          {
            type: "defeat",
            label: "Defeat the Hunger Below, the last shape of the Herald",
            place: GATE,
            radius: 40,
            count: 1,
            champion: {
              tag: "realm:saga:herald_hunger",
              mob: "minecraft:drowned",
              name: "The Hunger Below",
              trait: "vampiric",
              warn: "The ground at the Gate's mouth breathes in. What climbs out wears Ashgrave's face like a mask that no longer fits.",
              health: 120,
              adds: { mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:vex"], count: 6 },
            },
          },
        ],
        outro: [
          `The third time he falls, he falls slowly, like a bell rope let go. The soul fire around the Gate goes out all at once. In the silence, the thing that was the Herald turns its face up to the Lantern and speaks.`,
          { text: `${HERALD}You walked through my singers and left every one of them breathing. Even me, almost. I can feel it, how much you wanted to. Nobody ever wanted to spare me. Not even me.\n\nThe drowned face softens.\n\n${HERALD}Tell the child at the inn... no. She knows.`, when: { gate: "sneak" } },
          { text: `${HERALD}You cut through my singers like wheat. You are like me. Hard where you broke. The Hollow sees you, and it likes what it sees. When you stand at the Seal it will offer you what it offered me. Take it, or don't. It is patient. It will wait.`, when: { gate: "fight" } },
          { text: `Beside the Gate, Hollis lies on the scorched ground with his eyes open, looking at the stars. He says two words, thank you, and then he is gone, and the Lantern's light lies on his face like a blessing.`, when: { "g:hollis": "lost" } },
          `${E}You did it. Oh, child, look at you.\n\nShe touches your face with fingers that glow faintly at the tips.\n\n${E}It isn't over. The Lantern is at the top of the sky and the seals are open-mouthed and hungry. Come to the Sky Seal. There is a choice to make, and I won't make it for you.`,
        ],
        reward: {
          levels: 10,
          crowns: 200,
          items: [{ item: "minecraft:totem_of_undying", amount: 1 }, { item: "minecraft:diamond", amount: 6 }],
          codex: {
            id: "herald_ashgrave",
            title: "Brother Ashgrave",
            text: "The chapel keeper of the Year of the Long Storm. The Hollow promised him his dead daughter, and he rang the broken note that cracked the Lantern. For forty winters the Hollow kept him drowned and dreaming as its Herald. He rose three times at the Gate: as the man, as the voice, and as the hunger. Three times he was put down.",
          },
        },
        rep: [{ guild: "wardens", amount: 20 }],
        hint: "Every fight is at the Hollow Gate. Bring food, good armor and potions: the Herald rises in three shapes, each stronger and each with minions. If Brother Hollis was lost to the Hollow, he fights first. Fight away from the pit's edge.",
      },

      // 9. The Choice ------------------------------------------------------------------------
      {
        id: "choice",
        title: "The Lantern Passes",
        npc: "elsie",
        intro: [
          `The Sky Seal hangs above the clouds, a ring of quartz and glass turning slowly on nothing. Up here the Lantern fills half the sky. It is so bright that your shadow falls down through the clouds onto the sea.`,
          `${E}The three keys are lit. You lit them. Tide, Stone, Sky. Set them in the crown, and when the Lantern stands straight overhead its light will run through them, down into the deep, and the Hollow will sleep.`,
          `${E}For forty winters. That is all the Lantern ever buys. Forty winters, and then another Herald, another storm, another child with a sword.\n\nShe isn't looking at you. She's looking at her hands.`,
          { text: `${E}You promised me, once. If it came to this. I am holding you to nothing, do you hear? But the promise is still yours, and so am I.`, when: PROMISED },
          { text: `${E}You made me promise not to. I remember. I'm only telling you what is possible. I am not asking.`, when: REFUSED },
          { text: `${E}You forgave me, when I told you what I am. I have not forgiven myself. I think, tonight, I might finally get the chance.`, when: { "act3_deep.elsie": "forgive" } },
          { text: `${E}You told me forty winters of silence was unforgivable. You were right. Whatever happens up here, I wanted you to know I heard you.`, when: { "act3_deep.elsie": "condemn" } },
          { text: `And under the wind, very softly, something speaks from the bottom of the world. It speaks to you. It knows your name. It says: there is an empty chair at my table, and a crown on it.`, when: { "g:iron": ">=5" } },
        ],
        objectives: [
          { type: "reach", label: "Climb to the Sky Seal", place: "seal_sky", radius: 16 },
          { type: "interact", label: "Set the three keys in the Sky Seal's crown (hit 3 end rods)", place: "seal_sky", blocks: ["minecraft:end_rod"], count: 3, radius: 16 },
          { type: "vigil", label: "Wait in the open at the Sky Seal until the Lantern stands at midnight", place: "seal_sky", radius: 16, seconds: 60, timeOfDay: [17000, 19500], outdoors: true },
          {
            type: "vision",
            label: "Let the Lantern's light pass through the crown",
            place: "seal_sky",
            radius: 16,
            scenes: [
              { title: "The Lantern", text: "The light comes down through the crown like water through a sieve, and for one moment you can see everything it has ever seen.", sound: "beacon.activate", seconds: 6 },
              { text: "The Starwrights, tall and patient, building the seals by its light and singing the song that Vesna and Hollis still remember.", seconds: 6 },
              { text: "A harbor tower in a storm. A man ringing a bell. A small boat rowing hard toward him through black water. Hal. Hal, who almost made it.", sound: "block.bell.hit", seconds: 7 },
              { text: "And now you, standing in the crown, while the light waits the way a held breath waits, for you to decide where it goes.", seconds: 6 },
            ],
          },
        ],
        outro: [
          `The Lantern stands straight overhead. Its light pours into the crown and stops there, trembling, waiting. Elsie stands at your shoulder. Somewhere far below, the Hollow is listening.`,
          `${E}Relight the Lantern, and the Hollow sleeps for forty winters, and we live our lives, and someone else does this again. It's what every hero before you chose. There's no shame in it. There's no shame in any of this.`,
          { text: `${E}And there is the old way, the one only a Starwright can take. If you know what it costs, you know what I'm offering. If you don't, then it isn't yours to choose tonight, and I am glad.`, when: PROMISED },
          { text: `${DEEP}Or sit in my chair. Wear what he wore. I will sleep, if you ask me nicely. I will do anything you ask. All you have to do is listen to me, forever.`, when: { "g:iron": ">=5" } },
        ],
        choices: [
          {
            id: "relight",
            label: "Relight the Lantern",
            set: { "g:ending": "relight" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "wayfarers", amount: 30 }],
            reply: [
              `You let the light go. It runs down through the crown, down through the clouds, down into the sea and the stone, and far below something enormous sighs, turns over, and goes still.`,
              `Out of the light steps a man in a chapel robe, dry for the first time in forty winters. Ashgrave. His face is tired and kind and very sad. He looks down at the harbor, at the lighthouse, and he whispers one word: Tobin.`,
              `${E}He has a minute, perhaps. The light is generous at the end. Go down to the lighthouse in the morning. I think he will wait for you there.`,
            ],
          },
          {
            id: "gift",
            label: "Accept the Keeper's Gift",
            requires: { stories: ["inn_ghost"], flags: PROMISED },
            set: { "g:ending": "gift" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "growers", amount: 30 }],
            reply: [
              `${E}Thank you. Lily is at rest, thanks to you. There is nothing left down there that I need to watch over. Only up here.\n\nShe unties her apron. The hem is full of starlight.`,
              `${E}A thousand winters, not forty. Nobody else carries a sword up a sky for a thousand winters. Tell Wren the inn is hers. Tell Bea less salt. Tell Tobin he still owes me for the soup.`,
              `She steps into the crown. The light takes her the way a hearth takes a log, slowly, warmly, and with a sound like someone humming in the next room. When it fades, the seal burns white, and there is a new star in the sky.`,
            ],
          },
          {
            id: "crown",
            label: "Take the Hollow Crown",
            requires: { flags: { "g:iron": ">=5" } },
            set: { "g:ending": "crown" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "miners", amount: 30 }],
            reply: [
              `You step past Elsie and put your hand into the light, and you say yes to the dark.`,
              `The Lantern's light bends. It goes not into the seals but into you. Something settles onto your brow, cold as well water, light as a thought. A crown of black iron and drowned rope. It fits perfectly. It always would have.`,
              `${E}Oh, child. Oh, no.\n\nShe doesn't step back. That's the worst part. She stays, and she looks at you the way she looked at Ashgrave, forty winters ago, the night before the storm.`,
              `${DEEP}Sleep, you tell it, and it sleeps. Good. We will talk again, you and I. We have time.`,
            ],
          },
        ],
        reward: {
          levels: 8,
          crowns: 150,
          codex: {
            id: "lantern_pass",
            title: "The Lantern's Pass",
            text: "Once every forty winters the comet the Starwrights called the Lantern crosses the sky, and its light relights the three Seals that bind the Hollow. At the Sky Seal, at the top of the night, the light waited for one person to decide where it would go.",
          },
        },
        hint: "The Sky Seal floats high above the clouds (about y 220): pillar up, use elytra or build a stair. Hit the end rods on its crown, then stay there in the open around midnight. Which endings you can choose depends on what you've done: A Room at the Inn, your promise to Elsie, and how hard your heart has been.",
      },

      // 10a. Dawn: Relight the Lantern -------------------------------------------------------
      {
        id: "dawn_relight",
        title: "Dawn",
        npc: "tobin",
        when: { "g:ending": "relight" },
        intro: [
          `The sun comes up over a town that should not be standing. Smoke from the night's fires hangs over the harbor, and the gulls are back, loud and rude and wonderful. The Lantern is a faint smudge in the west, going away for forty winters.`,
          `§eOld Tobin§r is on the dock where he always is, mending a net that doesn't need it.\n\n${T}Heard you lit the sky. Heard it from the gulls, practically. Sit. You look like a wet sail. Folks'll be along. Whole town's coming down to the water this morning.`,
          { text: `${T}Bell rang all night. Never missed a beat. Hal would've liked that.\n\n${I}I listened from the forge. My clapper held. It'll hold forty winters, and longer, because I'll be checking it.`, when: RING },
          { text: `${T}Quiet night, for the bell. Strange. I kept listening for it anyway. Habit.\n\n${I}The band held. I went down at first light to check. Not a crack in it. Some work you only do once.`, when: NOT_RING },
          { text: `${Q}Nine boats in, nine boats out, and the mayor shook my hand in public. My reputation is ruined. I've never been happier.\n\n${B}I shook his hand. I'd do it again. Don't tell him I said that.`, when: { "g:quill": "trusted" } },
          { text: `${Q}They let me out to carry sandbags. Sandbags! Me! I hope you're all very proud.\n\n${B}He carried more than anyone. I'm reopening his case. A fair hearing. My father never gave anyone one of those. I mean to start.`, when: { "g:quill": "!trusted" } },
          { text: `${MO}Dug a grave this morning, by the chapel wall. Hollis would've hated the fuss. I made a fuss anyway.\n\n${H}(a note found on the altar) If I don't come back, light a candle. Not for me. For whoever's still afraid of the dark.`, when: { "g:hollis": "lost" } },
          { text: `${H}I heard every wave break from the chapel, and I sang, or tried to. My voice is gone. I've never felt more like myself.\n\n${MO}Didn't need my shovel once last night. Not once. Worst night for business I ever had. Best night, too.`, when: { "g:hollis": "!lost" } },
        ],
        objectives: [
          {
            type: "meet",
            label: "Speak with the echo waiting at the Lighthouse rail",
            place: "lighthouse",
            radius: 16,
            who: { id: "ashgrave", name: "Ashgrave's echo", entity: "minecraft:allay" },
            pages: [
              `A faint light stands at the lighthouse rail, shaped like a man in a chapel robe. It flickers when the wind blows. It is looking at the place where the old tower stood.\n\n${A}I asked the light for one more minute. It gave me this.`,
              `${A}I rang the bell because the Hollow told me my daughter was waiting at the bottom of the sea. She wasn't. Nothing was. Only the hunger, and forty winters of my own voice calling the drowned.`,
              `${A}Hal rowed out into that storm to stop me. He shouted my name the whole way. If I had turned around once, just once, he would have lived to be an old man mending nets on that dock.`,
              `${A}Tell Tobin I'm sorry. It mends nothing. Tell him his brother was the bravest man in the harbor, and the last thing I heard before the water was Hal, calling me home.\n\nThe light thins, and the wind carries it out to sea.`,
            ],
          },
          { type: "vigil", label: "Watch the first morning from the Lighthouse", place: "lighthouse", radius: 24, seconds: 60, timeOfDay: [0, 4000], outdoors: true },
        ],
        outro: [
          `§eTobin§r hears it all. He doesn't say anything for a long time. A gull lands on the post beside him and he doesn't shoo it.\n\n${T}Calling him home. That's Hal. Couldn't leave a man in the water if you paid him to. Forty winters I hated a ghost. Takes work. I think I'll stop now. I'm tired.`,
          { text: `${M}I'm adding the Gate to the big map in the square. Huge black X. HERE BE NOTHING, ANYMORE.\n\n${S}And I am adding a star to mine. Small, new, just east of Deneb. I am naming it after you. Do not argue. It is done.`, when: { "last_map.map": "share" } },
          { text: `${M}The Gate goes in Fenn's book, not on any wall. Some places should stay hard to find.\n\n${S}I have begun a new chart. Forty winters from now someone will need it. I wrote your name in the corner, where the makers sign.`, when: { "last_map.map": "!share" } },
          { text: `${R}You went off alone at the start of all this and I wanted to arrest you for it. Look where it got us. Don't do it again. That's an order. Mostly.\n\n${BE}Sit! Eat! You went alone once; you'll eat alone never. Pass the bread. You're family now.`, when: { "act1_signs.act1:path": "alone" } },
          { text: `${R}You brought me the truth at the very start. Most people don't. My wardens will tell this story for forty winters. Badly. With extra dragons.\n\n${BE}Sit! Eat! The wardens ate everything but the pot. I saved you the pot. Joking! I saved you the best bowl.`, when: { "act1_signs.act1:path": "!alone" } },
          { text: `${E}Rest now, child. The inn has a bed with your name on it. Literally. Wren carved it.\n\n${W}Ember carried the riders all night and didn't spook once, not even at the big drowned with the hat! I gave her nine apples. Is nine too many? She doesn't think so.`, when: EMBER },
          { text: `${E}Rest now, child. The inn has a bed with your name on it. Literally. Wren carved it.\n\n${W}Comet ran the cliff road eleven times last night, I counted, and she wasn't scared of the real comet at all! I gave her nine apples. Is nine too many? She doesn't think so.`, when: COMET },
        ],
        reward: {
          levels: 10,
          crowns: 400,
          title: "Lanternbearer",
          items: [{ item: "minecraft:enchanted_golden_apple", amount: 1 }, { item: "minecraft:emerald", amount: 16 }],
          journal: { entry: "lantern_night", label: "Lantern Night" },
          codex: {
            id: "ending_relight",
            title: "Relight the Lantern",
            text: "The Lantern's light passed through the three keys and the Hollow slept again, for forty winters. Freed at last, Ashgrave was himself for one minute, and he spent it asking Old Tobin's forgiveness. The town woke to gulls and smoke and sunrise. Someone will have to do this again. Not today.",
          },
        },
        hint: "Ashgrave's echo waits at the Lighthouse rail; go there and talk to it. Then stay at the Lighthouse in the open in the morning (from sunrise until about mid-morning) before going back to Tobin on the dock.",
      },

      // 10b. Dawn: The Keeper's Gift ---------------------------------------------------------
      {
        id: "dawn_gift",
        title: "Dawn",
        npc: "wren",
        when: { "g:ending": "gift" },
        intro: [
          `The sun comes up over a town that should not be standing, and for a moment you think the sky has a new star in it, low in the east, burning in broad daylight. It does. It's her.`,
          `§eWren§r runs down the inn steps with her face red and wet.\n\n${W}She left me a letter, and the inn, and the KEYS, all of them, even the cellar one I'm not allowed to have, and she didn't even say goodbye, and I'm so angry, and I miss her so much already.`,
          { text: `${T}Bell rang her out, at dawn. Just once, on its own. Never heard it do that.\n\n${I}I didn't touch it. Nobody touched it. Some things you make turn out to have opinions.`, when: RING },
          { text: `${T}Quiet sea this morning. Quiet as a church. She'd have liked that, Elsie.\n\n${I}I'll forge her a plate for the inn door. Iron. It'll outlast all of us. That's the point.`, when: NOT_RING },
          { text: `${Q}She used to water my wine and pretend she didn't. Best innkeeper on the coast. I'm putting her on my bench plaque, too. There's room.\n\n${B}I'll have her name read out in the square at noon. Every year. That's a law now. I just made it.`, when: { "g:quill": "trusted" } },
          { text: `${Q}They let me out to carry sandbags, and she brought me soup in my cell every night of the trial. Nobody else did.\n\n${B}I'll have her name read out in the square at noon. Every year. And I'm reopening Quill's case. She'd have insisted.`, when: { "g:quill": "!trusted" } },
          { text: `${MO}Two graves to dig and only one body. I'll dig Elsie one anyway, by Lily's. Somewhere for Wren to put flowers.\n\n${H}(a note found on the altar) If I don't come back, light a candle for whoever's still afraid of the dark.`, when: { "g:hollis": "lost" } },
          { text: `${H}I'll light a candle for her every night, in the window that faces east. She'll see it. I know she'll see it.\n\n${MO}I'll dig Elsie a grave anyway, by Lily's. Empty. Somewhere for the kid to put flowers. Don't tell me it's silly.`, when: { "g:hollis": "!lost" } },
        ],
        objectives: [
          {
            type: "vision",
            label: "Read the letter Elsie left behind",
            scenes: [
              { title: "Elsie's letter", text: "My dear. If you are reading this, you let me go, and I am so grateful I could sing. Don't be sad for too long. I have been tired for four hundred years, and now I get to be useful, which is the opposite of tired.", sound: "beacon.activate", seconds: 9 },
              { text: "I can see everything from up here. The harbor. The chapel. Lily's grave, with the flower you left. The Hollow, asleep under all of it, snoring like Tobin. A thousand winters. Nobody else has to carry a sword up a sky for a thousand winters.", seconds: 10 },
              { text: "Look after Wren. She will try to run the inn like a stable. Let her. Guests could do with more hay in their lives. Tell Bea the soup needs less salt. She won't listen. Tell her anyway.", seconds: 9 },
              { text: "When you see a star in the daytime, that's me, being nosy. Goodnight, my dear. Goodnight, my town. Light the lamps. - E.", seconds: 8 },
            ],
          },
          { type: "talk", label: "Give Bea Elsie's message about the soup", npc: "bea" },
          { type: "talk", label: "Tell Mayor Bram the inn belongs to Wren now", npc: "bram" },
        ],
        outro: [
          `${W}I hung her apron on the hook by the door. I'm not going to wear it. It's hers. I'm leaving it there so the inn knows who it belongs to. Belonged. Belongs. I don't know which word.`,
          { text: `${M}I'm putting a new star on the map in the square, so travelers can steer by her. Fenn would've loved that. A map with a person on it.\n\n${S}She is just east of Deneb, burning white. I watched her come up. I have never cried at a star before.`, when: { "last_map.map": "share" } },
          { text: `${M}I'm drawing her into Fenn's book. Not as a star. As Elsie, behind the bar, with a ladle. That's how she'd want to be found.\n\n${S}She is just east of Deneb, burning white. I watched her come up. I have never cried at a star before.`, when: { "last_map.map": "!share" } },
          { text: `${R}You went your own way from the start, and she never once told me where. Covered for you every time. Now I know where you got it.\n\n${BE}Less salt. LESS SALT. Four hundred years old and she spends her last words on my soup! ...I'll make it with less salt. Just this once.`, when: { "act1_signs.act1:path": "alone" } },
          { text: `${R}You brought me the truth at the start. She spent four hundred years hiding hers, and she gave it all back in one night. I'm posting a warden at her door. Old habit.\n\n${BE}Less salt. LESS SALT. Her last words, and she spends them on my soup! ...I'll make it with less salt. Just this once.`, when: { "act1_signs.act1:path": "!alone" } },
          { text: `${E}(at the bottom of the letter) P.S. Tell Ember she was very brave. Horses like to be told.\n\n${W}Ember slept in the hay with me last night. I'm going to give the inn a stable. Every inn should have a stable. Elsie would've said yes. She always said yes, eventually.`, when: EMBER },
          { text: `${E}(at the bottom of the letter) P.S. Tell Comet she was very brave. Horses like to be told.\n\n${W}Comet slept in the hay with me last night. I'm going to give the inn a stable. Every inn should have a stable. Elsie would've said yes. She always said yes, eventually.`, when: COMET },
          `By noon the sign over the inn door is repainted in large, careful, slightly crooked letters. It still has Elsie's name on it. Underneath, smaller, it says: AND WREN.`,
        ],
        reward: {
          levels: 10,
          crowns: 300,
          relic: "keeper_lamp",
          title: "Keeper's Heir",
          items: [{ item: "minecraft:enchanted_golden_apple", amount: 1 }],
          journal: { entry: "lantern_night", label: "Lantern Night" },
          codex: {
            id: "ending_gift",
            title: "The Keeper's Gift",
            text: "Elsie, the last of the Starwrights, gave herself to the Sky Seal. The Hollow is bound for a thousand winters, not forty. A new star burns in daylight just east of Deneb. The inn passed to Wren, who means to give it a stable. Elsie left her lamp to the one who let her go.",
          },
        },
        hint: "Elsie's letter plays as soon as the chapter starts. Then talk to Bea and to Mayor Bram (both in town with the other townsfolk) and go back to Wren.",
      },

      // 10c. Dawn: The Hollow Crown ----------------------------------------------------------
      {
        id: "dawn_crown",
        title: "Dawn",
        npc: "bram",
        when: { "g:ending": "crown" },
        intro: [
          `The sun comes up over a town that should not be standing. The fires are out. The drowned are gone. Nobody cheers. Doors are shut along the main street, and behind the shutters people are watching you walk.`,
          `You can hear them. That's the first thing you notice. Every whisper behind every shutter, every heartbeat in every house. The Hollow listened to the whole world. Now you do.`,
          `§eMayor Bram§r meets you in the square. He stands very straight, the way a man stands when he has decided not to run.\n\n${B}The town is safe. I'm told I should thank you. I'm told the Hollow sleeps because you asked it to. The town's gathering at the water. You'll want to hear them. You can hear them anyway, I suppose.`,
          { text: `${T}Bell rang all night. Then you came down off that sky, and it stopped. Mid-note. Hasn't rung since.\n\n${I}I made that clapper to sing. It won't sing for you. I'm sorry. No. I'm not.`, when: RING },
          { text: `${T}Hal drowned stopping a man who listened to that thing. You'll forgive me if I don't shake your hand.\n\n${I}The band holds. The bell stays silent. At least something down there still listens to me.`, when: NOT_RING },
          { text: `${Q}Partner. Look, I've made bad deals. I know a bad deal when I see one. That thing on your head is the worst deal I've ever seen.\n\n${B}Quill's boats left at dawn. All nine. He said to tell you the bench can wait.`, when: { "g:quill": "trusted" } },
          { text: `${Q}Ha! And they called ME the traitor. Look at you. Look at that crown.\n\n${B}Quill's case is closed. I let him go. It didn't seem like the worst thing anymore, in this town, this morning.`, when: { "g:quill": "!trusted" } },
          { text: `${MO}Buried what was left of Hollis by the chapel wall. Funny. You and him, both wearing the Hollow. Only one of you chose it.\n\n${H}(a note found on the altar) If I don't come back, light a candle for whoever's still afraid of the dark.`, when: { "g:hollis": "lost" } },
          { text: `${H}I can hear it humming in you. The same song it sang in me. I'll pray for you. I don't know if it helps. I'll do it anyway.\n\n${MO}Most folks I meet are dead. You're the first who's both. Don't take it hard. Takes one to know one.`, when: { "g:hollis": "!lost" } },
        ],
        objectives: [
          { type: "talk", label: "Report to Warden Reyes", npc: "reyes" },
          {
            type: "sleep",
            label: "Sleep in a bed, if you can",
            vision: [
              { title: "The Chair", text: "You dream of a long table at the bottom of the world. Every chair is empty but yours.", sound: "mob.warden.heartbeat", seconds: 6 },
              { text: "Something vast turns over in the dark beneath the table, the way a dog turns over by a fire. It is content. It is waiting. It loves you, the way a hunger loves.", seconds: 8 },
              { text: "Forty winters from now, it whispers, or four hundred, you will ring the bell for me. We have time. We have all the time there is.", sound: "block.bell.hit", seconds: 7 },
            ],
          },
        ],
        outro: [
          `${B}Reyes says you came to her post and she put her hand on her sword before she knew she'd done it. She apologized. She says it won't happen again. It will. It's happening to all of us.`,
          { text: `${M}I'm taking the Gate off the big map in the square. Off every map. People don't need to know where you got that.\n\n${S}The Lantern went west and it didn't look back. I have charted ten thousand stars. None of them ever frightened me before.`, when: { "last_map.map": "share" } },
          { text: `${M}I burned the page in Fenn's book with the Gate on it. He'd have understood. I don't want anybody else finding their way there.\n\n${S}The Lantern went west and it didn't look back. I have charted ten thousand stars. None of them ever frightened me before.`, when: { "last_map.map": "!share" } },
          { text: `${R}You went off alone at the start, and I let you. I keep thinking about that.\n\n${BE}I made you a bowl. It's on the step. I'm... not opening the door today. I'm sorry. I'll make you another tomorrow. I'll leave it on the step.`, when: { "act1_signs.act1:path": "alone" } },
          { text: `${R}You came to me with the truth at the very start. Tell me the truth now. Is it still you in there?\n\n${BE}I made you a bowl. It's on the step. I'm... not opening the door today. I'm sorry. I'll make you another tomorrow. I'll leave it on the step.`, when: { "act1_signs.act1:path": "!alone" } },
          { text: `${E}I looked at a man like you once, the night before the storm. I didn't stop him. I'm watching you now, child. Every night. From the inn window.\n\n${W}Ember won't let me lead her past you. She just won't. I keep telling her you're nice. I think you're nice. You used to be nice.`, when: EMBER },
          { text: `${E}I looked at a man like you once, the night before the storm. I didn't stop him. I'm watching you now, child. Every night. From the inn window.\n\n${W}Comet won't let me lead her past you. She just won't. I keep telling her you're nice. I think you're nice. You used to be nice.`, when: COMET },
          `${B}You saved us. I'll say it in the square. I'll carve it on a stone. But the children cross the street when you pass, and I can't order them not to. The crown fits you. That's what frightens them.`,
        ],
        reward: {
          levels: 10,
          crowns: 300,
          relic: "hollow_crown",
          title: "Hollow-Crowned",
          items: [{ item: "minecraft:netherite_scrap", amount: 2 }],
          journal: { entry: "lantern_night", label: "Lantern Night" },
          codex: {
            id: "ending_crown",
            title: "The Hollow Crown",
            text: "At the Sky Seal the Lantern's light bent into a hero instead of the seals, and the Hollow slept because it was asked to. The town is saved. The town is afraid. The one who wears the Hollow Crown hears every heartbeat for a mile, and dreams of a long table at the bottom of the world.",
          },
        },
        hint: "Warden Reyes is in town with the other townsfolk. Then sleep in any bed at night; the dream is part of the chapter. Go back to Mayor Bram afterward.",
      },

      // 11. Forty Winters --------------------------------------------------------------------
      {
        id: "forty",
        title: "Forty Winters",
        npc: "moss",
        end: "tobin",
        intro: [
          `§eMoss§r is waiting at the graveyard gate with a sapling in a pot and his hat in his hand.\n\n${MO}Forty winters ago we lost a tower, a bell and a lot of good people, and nobody planted a thing. Didn't want to remember. I think it's time we planted something.`,
          { text: `${MO}Tobin's coming down after. First time he's set foot in here since his brother's stone went up. Empty stone, of course. The sea kept Hal. But he's coming.`, when: { "g:ending": "relight" } },
          { text: `${MO}Wren wants a tree for Elsie too. I told her Elsie isn't dead, she's a star. Wren says that's worse, because you can't visit a star. Kid's got a point.`, when: { "g:ending": "gift" } },
          { text: `${MO}Don't mind the looks you're getting. The dead don't care what you wear on your head. That's the nice thing about the dead. Very open-minded crowd.`, when: { "g:ending": "crown" } },
          { text: `${MO}Hollis is by the chapel wall, where he can hear the singing on Sundays. I put his candle on the stone. It hasn't gone out once. I've stopped asking why.`, when: { "g:hollis": "lost" } },
          `${MO}One tree for the lost. For Hal, for my brother, for Lily, for the nine on the cliff road, for Ashgrave too, if you can stand it. Trees don't ask who deserved it. That's why I like them.`,
          `${MO}Plant it anywhere in the yard you like. Then go find Tobin. He's got something to settle with that bell, and he won't do it without you.`,
        ],
        objectives: [
          { type: "place", label: "Plant a sapling in the Old Graveyard for the lost", place: "graveyard", radius: 16, count: 1, blocks: SAPLINGS },
          { type: "ride", label: "Row Old Tobin out over the sunken bell (ride a boat 100 blocks)", when: RING, mobs: ["minecraft:boat", "minecraft:chest_boat"], distance: 100 },
          { type: "vigil", label: "Sit with Tobin at the Lighthouse at sunset, in the quiet", when: NOT_RING, place: "lighthouse", radius: 24, seconds: 60, timeOfDay: [11500, 13500], outdoors: true },
        ],
        outro: [
          { text: `Tobin rows the last stretch himself, grumbling that you do it wrong. Over the place where the tower fell he ships the oars, takes off his cap and knocks on the hull three times. Far below, as if it heard him, the harbor bell answers: one long, true note.`, when: RING },
          { text: `You sit on the rocks below the lighthouse while the sun goes down. Tobin doesn't talk. The sea doesn't either. Where the bell lies smothered there is only the tide, coming in, going out, like breathing.`, when: NOT_RING },
          { text: `${T}That's for you, Hal. I'll ring you home every night if I have to. Forty winters late. Better late.\n\n${T}Thank you. For him. For the sorry. For all of it.`, when: { "g:ending": "relight", "drowned_bell.bell": "ring" } },
          { text: `${T}That's for you, Hal. I'll ring you home every night if I have to.\n\n${T}Elsie used to bring me soup every winter. I'll miss the soup. I'll miss her more. Don't tell Bea.`, when: { "g:ending": "gift", "drowned_bell.bell": "ring" } },
          { text: `${T}That's for you, Hal.\n\nHe doesn't look at you.\n\n${T}Folks say you came down off that sky changed. Maybe. I came back from the Long Storm changed too. Sit anyway. The dead don't mind. I'm trying not to.`, when: { "g:ending": "crown", "drowned_bell.bell": "ring" } },
          { text: `${T}Quiet suits him. He was a quiet man, Hal. Talked less than me, if you can believe it. He'd like the tree.\n\n${T}Thank you. For him. For the sorry. For all of it.`, when: { "g:ending": "relight", "drowned_bell.bell": "!ring" } },
          { text: `${T}Quiet suits him. He'd like the tree.\n\n${T}Elsie used to bring me soup every winter when the bell was quiet. I'll miss the soup. I'll miss her more. Don't tell Bea.`, when: { "g:ending": "gift", "drowned_bell.bell": "!ring" } },
          { text: `${T}Quiet suits him. He'd like the tree.\n\nHe doesn't look at you.\n\n${T}Folks say you came down off that sky changed. Maybe. I came back from the Long Storm changed too. Sit anyway. I'm trying.`, when: { "g:ending": "crown", "drowned_bell.bell": "!ring" } },
          `§6LANTERN NIGHT§r\n\nWith Mara, Old Tobin, Warden Reyes, Elsie, Mayor Bram, Quill, Ida, Sol, Brother Hollis, Moss, Wren and Bea.\n\nAnd Lily, Vesna, Hal, Aldous Fenn, Pip and Brother Ashgrave.\n\nAnd you.`,
          `§6The Lantern and the Hollow§r is over. The town will be here tomorrow, and the day after, and for forty winters, and longer. Somewhere in it, someone is always lighting a lamp.`,
        ],
        reward: {
          levels: 10,
          crowns: 300,
          items: [{ item: "minecraft:cherry_sapling", amount: 4 }, { item: "minecraft:lantern", amount: 8 }],
          journal: { entry: "forty_winters", label: "Forty Winters" },
          codex: {
            id: "forty_winters",
            title: "Forty Winters",
            text: "After Lantern Night the town planted a tree in the old graveyard for everyone the Long Storm and the Long Night took: Hal, Lily, Moss's brother, the nine on the cliff road, and even Ashgrave. Trees don't ask who deserved it. Forty winters from now the Lantern returns. The town means to remember this time.",
          },
        },
        rep: [
          { guild: "growers", amount: 20 },
          { guild: "wayfarers", amount: 20, when: RING },
          { guild: "wardens", amount: 20, when: NOT_RING },
        ],
        hint: "Plant any sapling inside the Old Graveyard. If the harbor bell rings again, any boat ride of 100 blocks counts; if you silenced it, wait at the Lighthouse in the open at sunset. Then go back to Tobin.",
      },
    ],
  },
];
