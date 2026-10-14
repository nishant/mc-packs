// Daily favor templates: see docs/STORY_BIBLE.md section 9, "Daily favors".
// Four per questgiving townsfolk. Each is one objective that works any day without story places
// (only `meadow` and `graveyard`, which sit near town). Keep ids stable once published.
/** @typedef {import("../types.js").Favor} Favor */

const FLOWERS = [
  "minecraft:poppy",
  "minecraft:dandelion",
  "minecraft:blue_orchid",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:red_tulip",
  "minecraft:orange_tulip",
  "minecraft:white_tulip",
  "minecraft:pink_tulip",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
];
const GATES = [
  "minecraft:iron_door",
  "minecraft:iron_bars",
  "minecraft:fence_gate",
  "minecraft:spruce_fence_gate",
  "minecraft:dark_oak_fence_gate",
  "minecraft:birch_fence_gate",
];
const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);

/** @type {Favor[]} */
export const FAVORS = [
  // Mara the Cartographer: brisk, precise, hates being lost
  {
    id: "mara_survey_north",
    npc: "mara",
    label: "A Marker to the North",
    objective: { type: "reach", label: "Stand on Mara's survey marker, {far:0,-350} blocks north", offset: { x: 0, z: -350 }, mark: "Survey marker", radius: 20 },
    reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:bread", amount: 4 }] },
    lines: [
      "There's a blank patch north of town the size of my hand. I refuse to have a blank patch the size of my hand. Go stand in it so I can draw it.",
      "Good. One less blank patch. My hand thanks you, and so does every lost traveler who'd have walked into a lake there.",
    ],
  },
  {
    id: "mara_paper",
    npc: "mara",
    label: "Paper Shortage",
    objective: { type: "deliver", label: "Bring Mara 12 paper", npc: "mara", item: "minecraft:paper", count: 12 },
    reward: { levels: 1, crowns: 25 },
    lines: [
      "I've drawn on the backs of letters, the backs of receipts and, this morning, the back of a menu. Bring me paper before I start on the walls.",
      "Real paper. Oh, it's beautiful. Don't tell Bea about the menu. She thinks it blew away.",
    ],
  },
  {
    id: "mara_feathers",
    npc: "mara",
    label: "Quills for the Cartographer",
    objective: { type: "deliver", label: "Bring Mara 8 feathers", npc: "mara", item: "minecraft:feather", count: 8 },
    reward: { levels: 1, crowns: 20, items: [{ item: "minecraft:ink_sac", amount: 2 }] },
    lines: [
      "I chew my pens when I'm thinking. I've been thinking a lot. Feathers, please, eight good ones; chickens are the obvious source, and they're furious about it.",
      "Perfect. Sharp tips, straight spines. I'll try not to chew these. I won't succeed, but I'll try.",
    ],
  },
  {
    id: "mara_survey_southwest",
    npc: "mara",
    label: "Check a Bearing",
    objective: { type: "reach", label: "Find Mara's old bearing stake, {far:-250,250} blocks south-west", offset: { x: -250, z: 250 }, mark: "Bearing stake", radius: 20 },
    reward: { levels: 2, crowns: 35 },
    lines: [
      "Fenn drew a stake south-west of town, and my numbers say it should be twenty blocks east of where he put it. One of us is wrong. I'd like it to be him.",
      "So it's where he put it. Of course it is. Fine. I'll fix my numbers. Quietly. Without comment.",
    ],
  },

  // Old Tobin: gruff, short sentences, sea sayings
  {
    id: "tobin_fish",
    npc: "tobin",
    label: "Supper From the Sea",
    objective: { type: "fish", label: "Catch 6 things with a fishing rod", count: 6 },
    reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:cooked_cod", amount: 4 }] },
    lines: [
      "Knees are bad today. Sea isn't. Go wet a line for me. Six catches. Anything that comes up counts, even boots. Especially boots.",
      "Not bad. Not bad at all. Sea gives to them that wait. You waited. Here, take a bite for yourself.",
    ],
  },
  {
    id: "tobin_salmon",
    npc: "tobin",
    label: "Salmon Run",
    objective: { type: "fish", label: "Catch 3 salmon", items: ["minecraft:salmon"], count: 3 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "Hal liked salmon. Every year, on his day, I smoke three. Can't stand at the river that long anymore. Would you?",
      "Three. Good fat ones. He'd have said you hold a rod like a broom. Then he'd have bought you a drink.",
    ],
  },
  {
    id: "tobin_string",
    npc: "tobin",
    label: "Mending the Nets",
    objective: { type: "deliver", label: "Bring Tobin 16 string", npc: "tobin", item: "minecraft:string", count: 16 },
    reward: { levels: 1, crowns: 25, items: [{ item: "minecraft:fishing_rod", amount: 1 }] },
    lines: [
      "Net's got more hole than net. Spiders make the best string. Ugly teachers, good thread. Sixteen will do.",
      "That'll patch her. Here, an old rod of mine. Still bends right. Don't lose it to a turtle.",
    ],
  },
  {
    id: "tobin_drowned",
    npc: "tobin",
    label: "Clear the Shallows",
    objective: { type: "defeat", label: "Defeat 8 drowned", mobs: ["minecraft:drowned"], count: 8 },
    reward: { levels: 3, crowns: 35 },
    lines: [
      "Drowned in the shallows again. They tangle my lines and stare at my boat. Don't care for being stared at. Send eight of them back down.",
      "Shallows are quiet. Good. Water's for fish and fools like me. Not them.",
    ],
  },

  // Warden Reyes: military, dry humor
  {
    id: "reyes_zombies",
    npc: "reyes",
    label: "Night Patrol",
    objective: { type: "defeat", label: "Defeat 10 zombies at night", mobs: ["minecraft:zombie", "minecraft:zombie_villager_v2", "minecraft:husk"], count: 10, night: true },
    reward: { levels: 3, crowns: 35 },
    lines: [
      "Two wardens down with colds and one down with a broken heart, which is worse. I need a patrol tonight. Ten zombies. That's an order. Mostly.",
      "Ten. Clean work. I'll put you on the roster as a reserve. Don't let it go to your head; the roster is a napkin.",
    ],
  },
  {
    id: "reyes_skeletons",
    npc: "reyes",
    label: "Archers in the Dark",
    objective: { type: "defeat", label: "Defeat 6 skeletons", mobs: ["minecraft:skeleton", "minecraft:stray"], count: 6 },
    reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:arrow", amount: 12 }] },
    lines: [
      "Somebody's been shooting at my wardens from the tree line. Rattles when it walks. Six of them, I'd guess. Make my guess correct.",
      "Good. You can keep their arrows. Consider it a pension plan for skeletons.",
    ],
  },
  {
    id: "reyes_arrows",
    npc: "reyes",
    label: "Restock the Armory",
    objective: { type: "deliver", label: "Bring Reyes 32 arrows", npc: "reyes", item: "minecraft:arrow", count: 32 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "Inventory says we have forty arrows. Inventory was written by a warden who also says he has a girlfriend in the next town. Bring me thirty-two real ones.",
      "Counted. All thirty-two. You'd make a fine quartermaster. That isn't a compliment; nobody likes the quartermaster.",
    ],
  },
  {
    id: "reyes_graveyard_watch",
    npc: "reyes",
    label: "Graveyard Watch",
    objective: { type: "vigil", label: "Keep watch at the Old Graveyard at night", place: "graveyard", radius: 24, seconds: 60, timeOfDay: NIGHT },
    reward: { levels: 2, crowns: 25 },
    lines: [
      "Moss reports lights in the graveyard. Moss also talks to headstones, so I'd like a second opinion. Stand watch out there for a minute after dark.",
      "Nothing? Good. Or very bad and very quiet. I'll file it under good. Filing is how I sleep.",
    ],
  },

  // Elsie the Innkeeper: warm, motherly, deflects with food
  {
    id: "elsie_honey",
    npc: "elsie",
    label: "Honey for the Tea",
    objective: { type: "deliver", label: "Bring Elsie 3 honey bottles", npc: "elsie", item: "minecraft:honey_bottle", count: 3 },
    reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:honey_bottle", amount: 1 }] },
    lines: [
      "Dear, the guests have drunk the inn dry of honey again. Three bottles from the hives, if you would. Bring a campfire under the nest and the bees won't mind so much.",
      "Oh, lovely, still warm from the sun. Here, one's for you. No, I insist. Everyone needs something sweet.",
    ],
  },
  {
    id: "elsie_berries",
    npc: "elsie",
    label: "Berries for a Pie",
    objective: { type: "deliver", label: "Bring Elsie 16 sweet berries", npc: "elsie", item: "minecraft:sweet_berries", count: 16 },
    reward: { levels: 1, crowns: 20, items: [{ item: "minecraft:pumpkin_pie", amount: 1 }] },
    lines: [
      "The children have been asking for berry pie, and I have exactly four berries and a great deal of love. Sixteen would help. Mind the thorns.",
      "Look at your hands, all scratched. Sit, sit. There's a pie that isn't berry yet. Have that one.",
    ],
  },
  {
    id: "elsie_wool",
    npc: "elsie",
    label: "Fresh Bedding",
    objective: { type: "deliver", label: "Bring Elsie 6 white wool", npc: "elsie", item: "minecraft:white_wool", count: 6 },
    reward: { levels: 1, crowns: 25 },
    lines: [
      "Room four's blanket has seen more winters than I have. Well. Almost as many. Six white wool, dear, and I'll stitch a new one tonight.",
      "Soft as a cloud. Whoever sleeps in room four tonight will dream something nice. I'll make sure of it.",
    ],
  },
  {
    id: "elsie_firewood",
    npc: "elsie",
    label: "Wood for the Hearth",
    objective: { type: "deliver", label: "Bring Elsie 16 oak logs", npc: "elsie", item: "minecraft:oak_log", count: 16 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "The hearth eats more than the guests do. Sixteen oak logs and it'll stay fed through the cold nights. An inn without a fire is just a house full of strangers.",
      "There. Now it's warm, and warm is the whole point. Come sit by it later. I'll save you the good chair.",
    ],
  },

  // Mayor Bram: pompous, kind, nervous
  {
    id: "bram_flowers",
    npc: "bram",
    label: "Beautify the Town",
    objective: { type: "place", label: "Plant 8 flowers around town", blocks: FLOWERS, count: 8 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "Visitors are coming! Possibly! There's a rumor of visitors, and a town should look its best for a rumor. Plant some flowers, eight or so, somewhere people will see them.",
      "Splendid! Radiant! I shall mention it in my next speech. Briefly. Well. At some length.",
    ],
  },
  {
    id: "bram_bunting",
    npc: "bram",
    label: "Red for the Bunting",
    objective: { type: "deliver", label: "Bring Bram 4 red dye", npc: "bram", item: "minecraft:red_dye", count: 4 },
    reward: { levels: 1, crowns: 20 },
    lines: [
      "The festival bunting has faded to a sort of apologetic pink. My father's bunting was a proud red. Four red dye, please. Poppies make it, I'm told. By a child. Who laughed at me.",
      "Proud red! Excellent. Father would be... well. He'd find something to say. But it would be about the bunting, not me. Progress.",
    ],
  },
  {
    id: "bram_steps",
    npc: "bram",
    label: "Stone for the Town Steps",
    objective: { type: "mine", label: "Mine 32 stone", blocks: ["minecraft:stone", "minecraft:cobblestone", "minecraft:deepslate", "minecraft:cobbled_deepslate"], count: 32 },
    reward: { levels: 2, crowns: 35, items: [{ item: "minecraft:bread", amount: 3 }] },
    lines: [
      "The town hall steps are cracked, and I tripped on them in front of the whole market. I'd like them fixed before I trip again. Thirty-two stone, from any honest hole.",
      "Wonderful. New steps! I'll be dignified on them. I'll practice being dignified on them. Please don't watch.",
    ],
  },
  {
    id: "bram_town_fund",
    npc: "bram",
    label: "The Town Fund",
    objective: { type: "deliver", label: "Donate 2 emeralds to the town fund", npc: "bram", item: "minecraft:emerald", count: 2 },
    reward: { levels: 3, crowns: 40 },
    lines: [
      "Ahem. The town fund is, technically speaking, a sock. The sock is empty. Two emeralds would make it a sock with ambitions. The town repays its friends!",
      "Ha! The sock lives! And the town repays its friends, as promised. With interest. Well. With some interest.",
    ],
  },

  // Quill the Trader: charming, evasive, always bargaining
  {
    id: "quill_package",
    npc: "quill",
    label: "A Small Package",
    objective: { type: "reach", label: "Find Quill's drop spot, {far:450,60} blocks east", offset: { x: 450, z: 60 }, mark: "Quill's drop spot", radius: 16 },
    reward: { levels: 2, crowns: 40 },
    lines: [
      "A friend of mine left a little something under a rock out east. Nothing illegal. Nothing very illegal. Just go stand there so my friend knows it arrived, would you?",
      "Did you look inside? No? Wonderful. You're my favorite person this week. Last week it was a goat, so don't let it go to your head.",
    ],
  },
  {
    id: "quill_gunpowder",
    npc: "quill",
    label: "Fireworks, Allegedly",
    objective: { type: "deliver", label: "Bring Quill 4 gunpowder", npc: "quill", item: "minecraft:gunpowder", count: 4 },
    reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:firework_rocket", amount: 3 }] },
    lines: [
      "I'm making fireworks for the festival. That's my story, and I'm very attached to it. Four gunpowder. Creepers carry it, and they're always so eager to share.",
      "Lovely. And look, fireworks. See? I told you. Mostly fireworks. Have a few, on the house.",
    ],
  },
  {
    id: "quill_leather",
    npc: "quill",
    label: "Fine Leather Goods",
    objective: { type: "deliver", label: "Bring Quill 6 leather", npc: "quill", item: "minecraft:leather", count: 6 },
    reward: { levels: 1, crowns: 30 },
    lines: [
      "A lady in the next town wants a genuine imported handbag. I'm going to make her one, and then it'll be imported, because I'll import it. Six leather, darling.",
      "Supple. Honest. Practically foreign. Here's your cut. I always pay my partners. Eventually. Today, even.",
    ],
  },
  {
    id: "quill_rabbit_foot",
    npc: "quill",
    label: "A Little Luck",
    objective: { type: "collect", label: "Show Quill a rabbit's foot", item: "minecraft:rabbit_foot", count: 1 },
    reward: { levels: 1, crowns: 25 },
    lines: [
      "I've got a big deal tonight and I'd feel better knowing luck is real. Find a rabbit's foot and show it to me. Just show it. I don't want it; it's a bit grim.",
      "There it is. Luck. Real as anything. Put it away, it's staring at me. Thank you, truly.",
    ],
  },

  // Ida the Relicsmith: blunt, few words, loves her craft
  {
    id: "ida_iron_ore",
    npc: "ida",
    label: "Raw Iron",
    objective: { type: "mine", label: "Mine 12 iron ore", blocks: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"], count: 12 },
    reward: { levels: 2, crowns: 35 },
    lines: [
      "Out of iron. Out of patience. Twelve ore. Mine it yourself, I'll know if you didn't.",
      "Good ore. Good work. Don't stand there; I'm busy.",
    ],
  },
  {
    id: "ida_coal",
    npc: "ida",
    label: "Feed the Forge",
    objective: { type: "deliver", label: "Bring Ida 16 coal", npc: "ida", item: "minecraft:coal", count: 16 },
    reward: { levels: 1, crowns: 25 },
    lines: [
      "Forge is hungry. Sixteen coal. Charcoal doesn't burn hot enough for what I'm doing, so don't try it.",
      "That'll keep her singing. Thanks.",
    ],
  },
  {
    id: "ida_copper",
    npc: "ida",
    label: "Copper for Fittings",
    objective: { type: "deliver", label: "Bring Ida 6 copper ingots", npc: "ida", item: "minecraft:copper_ingot", count: 6 },
    reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:iron_ingot", amount: 3 }] },
    lines: [
      "Copper. Six ingots. For fittings. Don't ask what for; I don't know yet. My hands know. I'll find out when they're done.",
      "Here. Iron for your trouble. Fair trade. Go.",
    ],
  },
  {
    id: "ida_lapis",
    npc: "ida",
    label: "Blue for the Runes",
    objective: { type: "deliver", label: "Bring Ida 8 lapis lazuli", npc: "ida", item: "minecraft:lapis_lazuli", count: 8 },
    reward: { levels: 3, crowns: 35 },
    lines: [
      "Lapis. Eight. I inlay it on the hilts. Relics like blue. Don't laugh. They do.",
      "Good color. Deep. You've got an eye. Don't tell anyone I said so.",
    ],
  },

  // Sol the Sky-reader: dreamy, poetic, star names
  {
    id: "sol_stargazing",
    npc: "sol",
    label: "Count the Stars",
    objective: { type: "vigil", label: "Watch the stars from Wren's Meadow at night, under open sky", place: "meadow", radius: 24, seconds: 60, timeOfDay: [14000, 22000], outdoors: true },
    reward: { levels: 2, crowns: 25 },
    lines: [
      "Tonight Seren's Crown rises over the meadow, and I can't see it from my window. Go lie in the grass and look up for me. Tell me if she's wearing it straight.",
      "Straight? Good. Last month she wore it crooked, and it rained for a week. Thank you, star-friend.",
    ],
  },
  {
    id: "sol_glowstone",
    npc: "sol",
    label: "Light Without Fire",
    objective: { type: "deliver", label: "Bring Sol 4 glowstone dust", npc: "sol", item: "minecraft:glowstone_dust", count: 4 },
    reward: { levels: 3, crowns: 40 },
    lines: [
      "I mark my star charts with glowstone dust, so I can read them in the dark without a candle spoiling my eyes. Four pinches. It comes from the Nether, I'm afraid. Stars come from worse places.",
      "Oh, it glitters like Oriel on a cold night. You went somewhere terrible for this. I'll name a very small star after you.",
    ],
  },
  {
    id: "sol_clock",
    npc: "sol",
    label: "What Time Is It, Really",
    objective: { type: "collect", label: "Carry a clock to show Sol", item: "minecraft:clock", count: 1 },
    reward: { levels: 1, crowns: 20 },
    lines: [
      "My clock says noon and the sky says evening. One of them is lying, and the sky never lies. Show me a clock of your own, so I can check mine against it.",
      "Your clock agrees with the sky. Mine is a liar. I'm going to put it in a drawer and think about what it's done.",
    ],
  },
  {
    id: "sol_glow_ink",
    npc: "sol",
    label: "Ink That Shines",
    objective: { type: "deliver", label: "Bring Sol 3 glow ink sacs", npc: "sol", item: "minecraft:glow_ink_sac", count: 3 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "The glow squid live in the dark water under caves, like little lost moons. Their ink is the only ink fit for drawing stars. Three sacs, please. Be kind to them.",
      "Moonlight in a bottle. I'll draw the Net tonight, every knot of it. Thank you.",
    ],
  },

  // Brother Hollis: soft, polite, doubting
  {
    id: "hollis_wax",
    npc: "hollis",
    label: "Wax for Candles",
    objective: { type: "deliver", label: "Bring Hollis 6 honeycomb", npc: "hollis", item: "minecraft:honeycomb", count: 6 },
    reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:candle", amount: 2 }] },
    lines: [
      "I'm sorry to ask. I go through candles so quickly lately. Six honeycomb would let me make my own. Shears on a full hive, and a campfire below to calm the bees.",
      "Thank you, truly. Here, two candles from the last batch. A light is a small thing. It still helps.",
    ],
  },
  {
    id: "hollis_vigil",
    npc: "hollis",
    label: "Sit With the Dead",
    objective: { type: "vigil", label: "Sit a quiet vigil at the Old Graveyard at dusk", place: "graveyard", radius: 20, seconds: 60, timeOfDay: [12000, 14000] },
    reward: { levels: 2, crowns: 25 },
    lines: [
      "Someone should sit with the graves at dusk, the old keepers said. It used to be me. Lately I... don't like being out there alone. Would you, tonight? Just a minute of quiet.",
      "Was it peaceful? Good. I'm glad. Thank you for keeping them company. I think they notice.",
    ],
  },
  {
    id: "hollis_alms",
    npc: "hollis",
    label: "Bread for the Hungry",
    objective: { type: "deliver", label: "Bring Hollis 10 bread", npc: "hollis", item: "minecraft:bread", count: 10 },
    reward: { levels: 1, crowns: 30 },
    lines: [
      "There are travelers sleeping by the chapel wall again. I can give them a roof, but not much else. Ten loaves would make a real breakfast.",
      "They'll eat well tomorrow. Because of you. That's a kind of prayer too, I think. The best kind.",
    ],
  },
  {
    id: "hollis_lights",
    npc: "hollis",
    label: "Light the Path",
    objective: { type: "place", label: "Place 6 torches or lanterns at the Old Graveyard", blocks: ["minecraft:torch", "minecraft:lantern", "minecraft:soul_torch", "minecraft:soul_lantern"], count: 6, place: "graveyard", radius: 24 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "The mourners come out to the graveyard after work, and the path is so dark. Six lights along it, please. Nobody should grieve and trip at the same time.",
      "Oh, it looks warm out there now. Like someone's expecting you. Thank you.",
    ],
  },

  // Moss the Gravedigger: dry gallows humor, talks to the dead
  {
    id: "moss_bone_meal",
    npc: "moss",
    label: "Grass for the Graves",
    objective: { type: "deliver", label: "Bring Moss 16 bone meal", npc: "moss", item: "minecraft:bone_meal", count: 16 },
    reward: { levels: 1, crowns: 25 },
    lines: [
      "The grass on the graves is thin. Bone meal fixes it. Yes, I see the irony. The residents don't mind. Sixteen, please.",
      "Lovely. The grass will be green and the residents will be... well, the same. But tidier.",
    ],
  },
  {
    id: "moss_skeletons",
    npc: "moss",
    label: "Uninvited Guests",
    objective: { type: "defeat", label: "Defeat 6 skeletons at the Old Graveyard at night", mobs: ["minecraft:skeleton"], count: 6, place: "graveyard", radius: 32, night: true },
    reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:bone", amount: 6 }] },
    lines: [
      "Skeletons wandering through my graveyard at night like they own it. None of them are even ours. Six of them. Send them back where they came from.",
      "Much obliged. Keep the bones. I've got plenty, professionally speaking.",
    ],
  },
  {
    id: "moss_flowers",
    npc: "moss",
    label: "Flowers for the Forgotten",
    objective: { type: "place", label: "Plant 6 flowers at the Old Graveyard", blocks: FLOWERS, count: 6, place: "graveyard", radius: 20 },
    reward: { levels: 2, crowns: 25 },
    lines: [
      "Some of these folks haven't had a visitor in fifty years. Plant a few flowers on the old graves. Six. They won't say thank you. I'll say it for them.",
      "Thank you. From me and from them. Old Abe says it's the nicest thing that's happened to him since he died.",
    ],
  },
  {
    id: "moss_gate",
    npc: "moss",
    label: "Check the Latches",
    objective: { type: "interact", label: "Check the graveyard's gates and doors (tap 4 times)", place: "graveyard", blocks: GATES, count: 4, radius: 16 },
    reward: { levels: 1, crowns: 20 },
    lines: [
      "Gate was open this morning. Either the wind, or one of the residents went for a walk. Rattle every latch for me so I know they hold.",
      "All shut? Good. Wind it was, then. Probably. I'll tell myself it was the wind.",
    ],
  },

  // Wren the Stable Girl: excited, run-on sentences, names everything
  {
    id: "wren_cows",
    npc: "wren",
    label: "Breakfast for the Cows",
    objective: { type: "tend", label: "Feed 6 cows wheat", mobs: ["minecraft:cow"], item: "minecraft:wheat", count: 6 },
    reward: { levels: 2, crowns: 20 },
    lines: [
      "The cows are hungry and Daisy is REALLY hungry and Buttercup keeps eating Daisy's share, so can you feed six cows some wheat? Any cows! All cows deserve breakfast!",
      "Yay! Every cow is a happy cow! Even Buttercup, and she doesn't deserve it, but she's happy anyway, that's how cows work.",
    ],
  },
  {
    id: "wren_tame",
    npc: "wren",
    label: "A New Friend",
    objective: { type: "tame", label: "Tame a wolf or a cat", mobs: ["minecraft:wolf", "minecraft:cat"], count: 1 },
    reward: { levels: 3, crowns: 25, items: [{ item: "minecraft:name_tag", amount: 1 }] },
    lines: [
      "Everybody should have a best friend with fur, it's like a rule, I made it up but it's a good rule. Tame a wolf, or a cat! Wolves like bones and cats like fish!",
      "You have a FRIEND now! What's their name? You should name them, here's a name tag! I'd name them Pickle. You don't have to. But Pickle.",
    ],
  },
  {
    id: "wren_chickens",
    npc: "wren",
    label: "Seeds for the Hens",
    objective: { type: "tend", label: "Feed 4 chickens seeds at Wren's Meadow", mobs: ["minecraft:chicken"], item: "minecraft:wheat_seeds", count: 4, place: "meadow", radius: 32 },
    reward: { levels: 1, crowns: 15, items: [{ item: "minecraft:egg", amount: 4 }] },
    lines: [
      "The hens in the meadow are being SO dramatic today, they won't lay a single egg unless someone feeds them seeds, and I've got hay in my everything. Four hens, please!",
      "Look, eggs already! Hens are so easy to bribe. Here, you can have some. Don't tell Bea, she counts them.",
    ],
  },
  {
    id: "wren_gate",
    npc: "wren",
    label: "Who Left the Gate Open",
    objective: { type: "interact", label: "Check the gates at Wren's Meadow (tap 3 times)", place: "meadow", blocks: GATES, count: 3, radius: 24 },
    reward: { levels: 1, crowns: 15 },
    lines: [
      "Somebody left the paddock gate open and it was NOT me, okay, it was probably Biscuit, she's very clever for a foal. Can you check every gate so nobody else escapes?",
      "All shut! You're the best gate-checker ever. Biscuit is looking at you like she's planning something. She's always planning something.",
    ],
  },

  // Bea the Cook: loud, bossy, generous, cooking metaphors
  {
    id: "bea_eggs",
    npc: "bea",
    label: "A Dozen Eggs",
    objective: { type: "deliver", label: "Bring Bea 12 eggs", npc: "bea", item: "minecraft:egg", count: 12 },
    reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cake", amount: 1 }] },
    lines: [
      "Twelve eggs! Now! I've got a cake half built and nothing to glue it with. Can't make a cake without breaking eggs, and I can't break eggs I don't have!",
      "There we go. Here, take a whole cake. No, the whole thing. You earned it. Out of my kitchen.",
    ],
  },
  {
    id: "bea_cod",
    npc: "bea",
    label: "Fish for the Chowder",
    objective: { type: "fish", label: "Catch 5 cod", items: ["minecraft:cod"], count: 5 },
    reward: { levels: 2, crowns: 30 },
    lines: [
      "Chowder night and Tobin's knees are acting up, so the cod's on you. Five! Fresh! If it's not still flapping, it's not chowder, it's soup with regrets.",
      "Beautiful. You've got sea in your veins, kid. Come back at supper. First bowl's yours, and don't argue, I've got a ladle.",
    ],
  },
  {
    id: "bea_potatoes",
    npc: "bea",
    label: "Potatoes, Lots of Them",
    objective: { type: "deliver", label: "Bring Bea 16 potatoes", npc: "bea", item: "minecraft:potato", count: 16 },
    reward: { levels: 1, crowns: 25, items: [{ item: "minecraft:baked_potato", amount: 6 }] },
    lines: [
      "The wardens eat like a storm eats a sail. Sixteen potatoes, and I'll keep them fed till Thursday. Maybe Wednesday. They're growing boys and girls. Mostly growing outward.",
      "Good spuds. Here, some hot ones for your pockets. A warm pocket is a happy pocket.",
    ],
  },
  {
    id: "bea_milk",
    npc: "bea",
    label: "Milk for the Pudding",
    objective: { type: "deliver", label: "Bring Bea 2 buckets of milk", npc: "bea", item: "minecraft:milk_bucket", count: 2 },
    reward: { levels: 1, crowns: 20 },
    lines: [
      "Pudding needs milk, and the milk girl ran off to look at a horse. Two buckets. Find a cow, be polite, don't spill.",
      "Not a drop spilled! You'd survive a ship's galley in a gale, you would. That's the highest praise I've got.",
    ],
  },
];
