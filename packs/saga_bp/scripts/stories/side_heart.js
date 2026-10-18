// Story content: see docs/STORY_BIBLE.md. The twelve heart stories (Hearth & Hearsay, docs/RPG_DESIGN.md
// section 2): one per townsfolk, offered once a player is Close with them (`g:aff_<npc>` from the Townsfolk
// pack's realm:affinity, level 3 or more). Each has three chapters and a Crown chapter, first in the list,
// that only a Hollow-Crowned player gets (`g:ending` = "crown"): that townsfolk confronts what they did.
// Keep every id (story, chapter, choice) when editing: players' progress is saved by them.
/** @typedef {import("../types.js").Story} Story */

const M = "§eMara:§r ";
const T = "§eTobin:§r ";
const R = "§eReyes:§r ";
const E = "§eElsie:§r ";
const B = "§eBram:§r ";
const Q = "§eQuill:§r ";
const I = "§eIda:§r ";
const S = "§eSol:§r ";
const H = "§eHollis:§r ";
const MO = "§eMoss:§r ";
const W = "§eWren:§r ";
const BE = "§eBea:§r ";

const CROWN = { "g:ending": "crown" };
const DUSK = /** @type {[number, number]} */ ([12000, 13800]);
const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);
const MIDNIGHT = /** @type {[number, number]} */ ([17000, 20000]);
const SQUARE = { x: 10, z: -14 };
const FLOWERS = ["minecraft:poppy", "minecraft:dandelion", "minecraft:cornflower", "minecraft:oxeye_daisy", "minecraft:azure_bluet", "minecraft:allium", "minecraft:lily_of_the_valley", "minecraft:blue_orchid"];
const CANDLES = ["minecraft:candle", "minecraft:white_candle", "minecraft:light_gray_candle", "minecraft:gray_candle", "minecraft:yellow_candle", "minecraft:orange_candle", "minecraft:red_candle", "minecraft:blue_candle"];
const NIGHT_MOBS = ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:creeper", "minecraft:husk", "minecraft:stray", "minecraft:drowned"];

/** @type {Story} */
const TOBIN = {
  id: "heart_tobin",
  title: "The Gull's Last Voyage",
  short: "The Gull's Voyage",
  giver: "tobin",
  kind: "heart",
  tones: ["sad", "warm"],
  summary: "Old Tobin has kept his brother's boat at the dock for forty years. He'd like to sail her once more.",
  requires: { stories: ["drowned_bell"], flags: { "g:aff_tobin": ">=3" } },
  chapters: [
    {
      id: "salt",
      title: "Salt in the Wound",
      when: CROWN,
      intro: [
        `§eOld Tobin§r doesn't look up from his net.\n\n${T}Hal rowed out into the Long Storm to stop a man who wanted what lives under the water. He drowned doing it. And you. You went and took it. Wore it.`,
        `${T}I won't shout. I'm too old to shout. But you'll sit with me at the lighthouse at dusk, and you'll be quiet, and you'll look at the water where he went down. Then we'll see.`,
      ],
      objectives: [
        { type: "vigil", label: "Sit in silence at the lighthouse at dusk", place: "lighthouse", radius: 24, seconds: 90, timeOfDay: DUSK, outdoors: true },
        { type: "talk", label: "Ask Elsie whether Tobin will ever forgive you", npc: "elsie" },
      ],
      outro: [
        `${E}Forgive you? Love, he already has, a little. He's just angry it was so easy. Hal forgave everyone. It drove Tobin mad.`,
        `${T}Elsie talks too much. ...She's right, though. Hal would have let you help with the Gull. So I will. Don't make me sorry.`,
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "Be outdoors within 24 blocks of the lighthouse at dusk (time 12000 to 13800) for 90 seconds, then talk to Elsie at the inn.",
    },
    {
      id: "patch",
      title: "Tar and Timber",
      intro: [
        `${T}The Gull. Hal's boat. You've seen her at the dock, under the tarp. Forty years I've kept her dry and never once put her in the water.`,
        `${T}I'm going to sail her out past the point. Once. Where he went down. But she needs a new keel plank and a patched hull, and my hands aren't what they were.`,
        `${T}Spruce. Twenty-four planks. Good straight grain. And lay a few on the old landing by the lighthouse, so I can haul her up there to work.`,
        { text: `${T}Hear the bell out there, ringing? Hal's bell, I call it now. It'll be good to row past it with something to say.`, when: { "drowned_bell.bell": "ring" } },
        { text: `${T}The bell's quiet since you dealt with it. Good. I want to hear myself think when I go out there.`, when: { "drowned_bell.bell": "silence" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Tobin 24 spruce planks", npc: "tobin", item: "minecraft:spruce_planks", count: 24 },
        { type: "place", label: "Lay 6 spruce planks on the landing at the lighthouse", blocks: ["minecraft:spruce_planks"], count: 6, place: "lighthouse", radius: 16 },
      ],
      outro: [
        "Tobin works on the Gull all afternoon without a word, fitting the new plank with a care you've never seen in him. When he's done he runs his palm along the hull the way you'd stroke a horse.",
        `${T}There. She's sound. Hal carved his name under the bench, see? H. A. L. Badly. He was nine.`,
        `${T}Tomorrow we row. Bring a strong back.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Spruce planks come from spruce logs (taiga trees). Give Tobin 24 at the dock, and place 6 more near the lighthouse (within 16 blocks).",
    },
    {
      id: "bell",
      title: "Past the Sunken Bell",
      intro: [
        `${T}Out we go. You row. I'll sit in the back and tell you you're doing it wrong. That's tradition.`,
        `${T}Row her a good long way. Three hundred blocks. Get the feel of her. Then take us out over the sunken bell and wait there while the sun goes down. That's where he was last seen. Rowing for the tower.`,
      ],
      objectives: [
        { type: "ride", label: "Row a boat 300 blocks", mobs: ["minecraft:boat", "minecraft:chest_boat"], distance: 300 },
        { type: "vigil", label: "Keep a dusk vigil over the sunken bell", place: "sunken_bell", radius: 40, seconds: 90, timeOfDay: DUSK },
      ],
      outro: [
        "As the sun touches the sea, Tobin stands up in the boat, which you have been told a hundred times never to do. He takes off his cap.",
        `${T}Hal. It's me. I'm old. I kept your boat. I'm sorry I didn't row out with you. I was scared. You weren't. You never were.`,
        `He sits down and doesn't speak again until the dock. When you tie up, he grips your shoulder, hard, once.\n\n${T}One more thing. Then I'm done. Then I can let him go.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "Any boat counts for the 300 blocks. Then sit in a boat (or swim) over the Sunken Bell, within 40 blocks, at dusk (time 12000 to 13800) for 90 seconds.",
    },
    {
      id: "ash",
      title: "Ash-Salt for Hal",
      end: "tobin",
      intro: [
        `${T}No grave for Hal. Sea took him. But Moss keeps an empty plot for him at the Old Graveyard. Paid for it forty years ago. Never put anything in it.`,
        `${T}Old custom here: you scatter ash-salt for the ones the sea keeps. Bone meal, the old folk used. It makes the grass come up green where there's nobody to bury.`,
        `${T}Three handfuls on the plot. Then tell Moss it's done. He'll want to know.`,
      ],
      objectives: [
        { type: "use", label: "Scatter bone meal 3 times at the Old Graveyard", item: "minecraft:bone_meal", count: 3, place: "graveyard", radius: 16 },
        { type: "talk", label: "Tell Moss the plot is tended", npc: "moss" },
      ],
      outro: [
        `${MO}Hal's plot? About time. The grass there's been waiting forty years for a reason to grow. I'll keep it trimmed. He'd want it trimmed. He was a tidy lad.`,
        `Back at the dock, Tobin hands you something long wrapped in oilcloth.\n\n${T}Hal's rod. His good one. I've oiled it every spring. It should go fishing again. With somebody who'll keep going back out.`,
        `${T}Thank you. That's all. Don't make it a thing. ...Thank you.`,
      ],
      choices: [{ id: "farewell", label: "Say goodbye to Hal", set: { "g:gull": "sailed" }, reply: ["You say his name to the water. The tide takes it, and gives nothing back but a small, ordinary wave. It feels like enough."] }],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:fishing_rod", amount: 1, name: "Hal's Old Rod", lore: ["Oiled every spring", "for forty years.", "H. A. L. carved in the grip."] }],
        codex: { id: "hal_rod", title: "Hal's Old Rod", text: "Hal built the Gull at twenty and carved his name under her bench at nine. Tobin kept both for forty years. The Gull sailed once more, past the sunken bell, and the grass came up green on an empty plot." },
      },
      hint: "Use bone meal on the grass within 16 blocks of the Old Graveyard 3 times, then talk to Moss.",
    },
  ],
};

/** @type {Story} */
const MARA = {
  id: "heart_mara",
  title: "Fenn's Unfinished Survey",
  short: "Fenn's Survey",
  giver: "mara",
  kind: "heart",
  tones: ["warm", "mystery"],
  summary: "Mara keeps one of Aldous Fenn's surveys pinned over her desk, with a corner left blank.",
  requires: { stories: ["last_map"], flags: { "g:aff_mara": ">=3" } },
  chapters: [
    {
      id: "off_map",
      title: "Off the Map",
      when: CROWN,
      intro: [
        `§eMara§r has an eraser in her hand and your mark in front of her.\n\n${M}I put you on my map, {player}. In ink. And now I'm sitting here trying to rub it out, and ink doesn't rub out. That's the point of ink.`,
        `${M}Fenn said a map is a promise to a stranger. You were never a stranger. So here's my promise: prove you still know the way. Walk to the Stargazer's Ruin and look at the world from up there. Then come back and tell me what you saw.`,
      ],
      objectives: [{ type: "reach", label: "Walk to the Stargazer's Ruin", place: "observatory", radius: 16 }],
      outro: [
        `${M}And? Same hills. Same rivers. Nothing up there moved because of you. ...I needed to hear that. I don't know why.`,
        `${M}Fine. Your mark stays. Pencil, though. Pencil until I say otherwise.`,
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "The Stargazer's Ruin is on the highest land nearby; the tracker points the way.",
    },
    {
      id: "corner",
      title: "The Blank Corner",
      intro: [
        `${M}This is Fenn's last regional survey. Every road, every stream, signed and dated. Except this corner, to the southwest. He left it blank. Fenn never left anything blank.`,
        `${M}I always thought he ran out of time. Then I found a note on the back: "Mara will finish this." In his handwriting. Before I was even his apprentice. I've never had the nerve.`,
        `${M}I've got the nerve now. Because you're coming. Bring me paper and a compass, and then go and stand in the blank corner and tell me what's there.`,
        { text: `${M}You let me keep Fenn's last map. I still have it. I'll bring it, for luck.`, when: { "last_map.map": "keep" } },
        { text: `${M}We shared Fenn's last map with the town. Half of them stop me to ask about it now. This one I'd like to keep, just between us.`, when: { "last_map.map": "share" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Mara 8 paper", npc: "mara", item: "minecraft:paper", count: 8 },
        { type: "deliver", label: "Bring Mara a compass", npc: "mara", item: "minecraft:compass", count: 1 },
        { type: "reach", label: "Stand in Fenn's blank corner (about {far:-560,500} blocks southwest)", offset: { x: -560, z: 500 }, mark: "Fenn's blank corner", radius: 24 },
      ],
      outro: [
        `${M}A meadow? Just a meadow? With a pond and a crooked oak?\n\nShe laughs, and then she has to sit down.`,
        `${M}I know that oak. I was born under it. My mother told me so a hundred times. Fenn left my birthplace blank. For me to draw. That sentimental old fraud.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Paper is crafted from sugar cane, a compass from iron and redstone. The corner is an offset from world spawn; the tracker points to it.",
    },
    {
      id: "measure",
      title: "Measure Twice",
      intro: [
        `${M}If I'm drawing it, I'm drawing it properly. Fenn's way. That means sightings from two high places, so the angles agree.`,
        `${M}Take a spyglass up to the Stargazer's Ruin and sight the corner twice, two different ways. Then climb high, above y 150, anywhere, and look at the whole valley at once. Fenn did that every year. He said it kept his maps honest.`,
      ],
      objectives: [
        { type: "use", label: "Take 2 sightings with a spyglass at the Stargazer's Ruin", item: "minecraft:spyglass", count: 2, place: "observatory", radius: 16 },
        { type: "reach", label: "Climb above y 150 and look at the valley", aboveY: 150 },
      ],
      outro: [
        `${M}Two sightings, one view from the top, and they agree to within a block. Fenn would have bought you a drink. Fenn never bought anyone a drink.`,
        `${M}I'm going to draw it tonight. Will you come back tomorrow? I want somebody to watch me sign it.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "A spyglass needs amethyst shards and copper. Use it within 16 blocks of the Stargazer's Ruin twice. Then go anywhere above height 150 (a mountain, a tower, a pillar).",
    },
    {
      id: "signed",
      title: "Signed and Dated",
      end: "mara",
      intro: [
        `${M}It's done. Look. The pond, the oak, the path my mother walked. And here, the last thing: a cairn. Every survey Fenn finished, he built a cairn at the last point. Eight stones.`,
        `${M}Build it for me, at the corner? And bring me one glow ink sac. I'm signing this one in ink that shines. So I can read it in the dark when I miss him.`,
      ],
      objectives: [
        { type: "place", label: "Build a cairn of 8 cobblestone at Fenn's blank corner", blocks: ["minecraft:cobblestone", "minecraft:mossy_cobblestone"], count: 8, offset: { x: -560, z: 500 }, mark: "Fenn's blank corner", radius: 16 },
        { type: "deliver", label: "Bring Mara a glow ink sac", npc: "mara", item: "minecraft:glow_ink_sac", count: 1 },
      ],
      outro: [
        `Mara signs the survey: "Finished by Mara, with {player}." The letters glow faintly on the paper.`,
        `${M}I made you a copy. Don't fold it wrong. And {player}? Thank you for not getting lost. Everybody else does, eventually. You keep finding your way back to my door.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:paper", amount: 1, name: "Fenn's Finished Survey", lore: ["Finished by Mara.", "The corner glows", "faintly in the dark."] }],
        codex: { id: "fenn_survey", title: "The Blank Corner", text: "Aldous Fenn left one corner of his last survey blank: the meadow where Mara was born, under a crooked oak. He wrote on the back that she would finish it. She did, in glowing ink, with a cairn of eight stones." },
      },
      hint: "Place 8 cobblestone (or mossy cobblestone) within 16 blocks of the corner. Glow ink sacs drop from glow squid in dark water.",
    },
  ],
};

/** @type {Story} */
const REYES = {
  id: "heart_reyes",
  title: "The Warden's Helmet",
  short: "Warden's Helmet",
  giver: "reyes",
  kind: "heart",
  tones: ["heroic", "warm"],
  summary: "Warden Reyes still has the helmet a warden gave her to hold when she was nine.",
  requires: { flags: { "g:aff_reyes": ">=3" } },
  chapters: [
    {
      id: "watch_list",
      title: "On the Watch List",
      when: CROWN,
      intro: [
        `${R}Three of my wardens asked me to arrest you this week. I said no. They asked why. I didn't have an answer that wasn't "because I like them". That isn't an answer.`,
        `${R}So give me one. Stand a night watch with the wardens. Put down the things that come out of the dark. Show my people whose side you're on.`,
      ],
      objectives: [{ type: "defeat", label: "Defeat 8 monsters at night", mobs: NIGHT_MOBS, count: 8, night: true }],
      outro: [
        `${R}You held the line. The wardens saw it. Doesn't make them like you. Makes them quiet. Quiet is a start.`,
        `${R}You're still on my watch list. But you're on the roster too. Both. That's a first.`,
      ],
      reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:arrow", amount: 16 }] },
      hint: "Zombies, skeletons, spiders, creepers, husks, strays and drowned count, anywhere, at night.",
    },
    {
      id: "gate",
      title: "The Night of the Gate",
      intro: [
        `${R}The raid, when I was nine. I told you. The warden who gave me her helmet was Sergeant Ilse Varga. She held the old watchtower gate all night with four others.`,
        `${R}I've never gone back to that tower at night. I patrol it by day. Every day. Never at night.`,
        `${R}I'm going tonight. You're coming. Stand the watch at the Ruined Watchtower with me. Two hours of dark, or what feels like it. Then we talk.`,
        { text: `${R}You swore on the shield, in the Oath. Protect first. Ilse would have liked you.`, when: { "wardens_oath.oath": "shield" } },
        { text: `${R}You swore on the sword, in the Oath. Ilse was a sword too. Sharpest one we had.`, when: { "wardens_oath.oath": "sword" } },
      ],
      objectives: [{ type: "vigil", label: "Stand a night watch at the Ruined Watchtower", place: "watchtower", radius: 24, seconds: 150, timeOfDay: NIGHT }],
      outro: [
        `Reyes stands at the broken gate the whole time, very straight, one hand on the stone.\n\n${R}This is where she stood. The raiders came over that ridge. She laughed at them. I remember she laughed.`,
        `${R}In the morning she gave me her helmet and said "hold this while I sleep". She never woke up. Wound nobody saw. I've been holding it thirty years.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Be within 24 blocks of the Ruined Watchtower at night (time 13000 to 23000) for 2 and a half minutes. The tracker points to it.",
    },
    {
      id: "name",
      title: "A Name on Stone",
      intro: [
        `${R}Ilse has no stone. Wardens who fall on duty get their name on the gate. The gate fell down twenty years ago. Nobody put it back up.`,
        `${R}Iron, for a plate. And a block of it at the Old Graveyard, where Moss says there's room. I want her name somewhere that doesn't fall down.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Reyes 8 iron ingots", npc: "reyes", item: "minecraft:iron_ingot", count: 8 },
        { type: "place", label: "Set a block of iron at the Old Graveyard", blocks: ["minecraft:iron_block"], count: 1, place: "graveyard", radius: 16 },
        { type: "talk", label: "Ask Moss to keep Ilse's stone", npc: "moss" },
      ],
      outro: [
        `${MO}Ilse Varga? I know the name. My father dug for her. Shallow, he said, because the ground was frozen. He always felt bad about it. I'll keep the iron polished. Shiny as a warden's boots.`,
        `${R}Good. Good. ...One more thing, and then I'll stop being sentimental. It's bad for discipline.`,
      ],
      reward: { levels: 4, crowns: 40 },
      rep: [{ guild: "wardens", amount: 20 }],
      hint: "Iron ingots are smelted from iron ore. Place a block of iron within 16 blocks of the Old Graveyard, then talk to Moss.",
    },
    {
      id: "returned",
      title: "Returned to Duty",
      end: "reyes",
      intro: [
        `${R}Last watch. Hold the tower the way she did. Put down whatever comes over the ridge.`,
        `${R}Then come to my post. I have something I've been holding for too long.`,
      ],
      objectives: [{ type: "defeat", label: "Hold the Ruined Watchtower: defeat 10 monsters there at night", mobs: NIGHT_MOBS, count: 10, night: true, place: "watchtower", radius: 40 }],
      outro: [
        "Reyes is waiting at her post with a battered iron helmet in both hands. There's a dent in the crest and a name scratched inside the rim: I. VARGA.",
        `${R}She said "hold this while I sleep". I've held it. Now I'm giving it to someone who held the tower. That's what she'd have wanted. Not a shelf. A head.`,
        `${R}Wear it or don't. But if you wear it, stand straight. That's an order. Not mostly.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:iron_helmet", amount: 1, name: "Ilse's Helmet", lore: ["Dented at the crest.", "I. VARGA scratched", "inside the rim."] }],
        codex: { id: "ilse_helmet", title: "Ilse's Helmet", text: "Sergeant Ilse Varga held the watchtower gate through a raid and gave her helmet to a nine-year-old to hold while she slept. She never woke. Reyes held it for thirty years, then gave it to the one who held the tower again." },
      },
      rep: [{ guild: "wardens", amount: 30 }],
      hint: "Defeat 10 monsters within 40 blocks of the Ruined Watchtower at night, then report to Reyes.",
    },
  ],
};

/** @type {Story} */
const ELSIE = {
  id: "heart_elsie",
  title: "Old Words",
  short: "Old Words",
  giver: "elsie",
  kind: "heart",
  tones: ["warm", "mystery", "sad"],
  summary: "Elsie still remembers the old songs of her people. She has never sung them to anyone.",
  requires: { stories: ["act3_deep"], flags: { "g:aff_elsie": ">=3" } },
  chapters: [
    {
      id: "no_room",
      title: "No Room at the Inn",
      when: CROWN,
      intro: [
        `${E}I failed once, {player}. Forty years ago I stood at that window and I was too late, and the Lantern broke. I have carried that every day since.`,
        `${E}You weren't too late. You were right on time, and you chose the Hollow anyway. I don't know how to hold that. My hands are full.`,
        `${E}Bring me honey. Three bottles. It's the old way of saying sorry among my people: something sweet, given without words. I'll decide if I can take it.`,
      ],
      objectives: [{ type: "deliver", label: "Bring Elsie 3 honey bottles", npc: "elsie", item: "minecraft:honey_bottle", count: 3 }],
      outro: [
        `Elsie holds the bottles a long time.\n\n${E}You came back. That's the part that matters, among my people. Coming back. Sit down, love. I'll teach you anyway. Somebody has to remember the songs.`,
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "Honey bottles come from bee nests and beehives: use a glass bottle on a full hive, with a campfire under it so the bees stay calm.",
    },
    {
      id: "song",
      title: "The Lantern Song",
      intro: [
        `${E}My people sang to the sky. Not prayers. Conversation. You sang so the stars would know you were still here, and they'd answer by being where they should be.`,
        `${E}I haven't sung the Lantern Song since before the Long Storm. I'd like to teach it to you. It has to be sung under the sky, at night, from somewhere high and old.`,
        `${E}The Stargazer's Ruin. My people built it. Go there at night and stay a while. I'll come and sing. Don't tell Wren. She'll want to come, and she can't hold a note to save her life.`,
        { text: `${E}You forgave me, after the apron. I still don't quite know what to do with that. Singing seems like a start.`, when: { "act3_deep.elsie": "forgive" } },
        { text: `${E}You were hard on me, after the apron. You weren't wrong. I'd still like to sing for you.`, when: { "act3_deep.elsie": "condemn" } },
      ],
      objectives: [{ type: "vigil", label: "Listen to Elsie's song at the Stargazer's Ruin at night", place: "observatory", radius: 20, seconds: 120, timeOfDay: NIGHT, outdoors: true }],
      outro: [
        "Elsie sings in a language that sounds like wind through a keyhole. It has no rhyme you can catch. Halfway through, the brightest star in the east seems to steady, the way a candle does when you close a door.",
        `${E}There. It still works. Oh, I'd forgotten. I'd forgotten it works.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Be outdoors within 20 blocks of the Stargazer's Ruin at night (time 13000 to 23000) for 2 minutes.",
    },
    {
      id: "quilt",
      title: "A Quilt for Wren",
      intro: [
        `${E}If anything happens to me, and things do happen to me, love, I want Wren to have something. Not the inn. The inn's a burden. Something warm.`,
        `${E}A quilt. White wool, and candles to sew by, and I'll stitch the old star-marks into the corners so she's never lonely in the dark. Will you fetch them?`,
        { text: `${E}You told me you'd let me go, if it came to it. This is me getting ready, just in case.`, when: { "act4_seals.act4:promise": "allow" } },
        { text: `${E}You told me you'd never let me go. I believe you. I'm sewing it anyway. Old habit.`, when: { "act4_seals.act4:promise": "refuse" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Elsie 12 white wool", npc: "elsie", item: "minecraft:white_wool", count: 12 },
        { type: "deliver", label: "Bring Elsie 4 candles", npc: "elsie", item: "minecraft:candle", count: 4 },
      ],
      outro: [
        "Elsie sews by candlelight with stitches too small to see. In each corner she works a little shape: three points and a line. You've seen it before, on the seals.",
        `${E}The Lantern's mark. It means "someone is watching over you". Wren will think they're stars. That's all right. They are, in a way.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "Shear sheep (or craft wool from string) for white wool. Candles are crafted from string and honeycomb.",
    },
    {
      id: "hearth",
      title: "Hearth-Friend",
      end: "elsie",
      intro: [
        `${E}One last thing. Stay the night. Not in a rented bed. In the room at the top of the stairs. It was mine, long before the inn was an inn.`,
        `${E}Sleep there. My people believed the hearth remembers. If it's kind, it'll show you something.`,
      ],
      objectives: [
        {
          type: "sleep",
          label: "Sleep a night under Elsie's roof",
          vision: [
            { title: "§7The hearth remembers", text: "A long hall of stone, lit by a fire that never needs feeding. People in coats stitched with points of light sit around it, singing. A small girl sits closest to the flames.", seconds: 6 },
            { text: "The girl looks up, straight at you, and smiles. She has Elsie's eyes, and no grief in them at all.", seconds: 6 },
            { text: "You wake warm. Someone has put a second blanket on you in the night, and there is honey cake on the chair.", seconds: 5 },
          ],
        },
      ],
      outro: [
        `${E}It showed you the hall, didn't it? I can tell. You have that look. I was so small, then. I thought the fire would never go out.`,
        `${E}In the old tongue there's a word: hearth-friend. Someone you'd let sit closest to the fire. I haven't called anyone that in three hundred years. You're my hearth-friend, {player}. Here. Take this.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:string", amount: 1, name: "Elsie's Star-Thread", lore: ["A thread from her apron hem.", "It glows, just barely,", "in the dark."] }],
        codex: { id: "hearth_friend", title: "Hearth-Friend", text: "Among the Starwrights, the one you let sit closest to the fire was your hearth-friend. Elsie sang the Lantern Song at the Stargazer's Ruin, sewed the Lantern's mark into a quilt for Wren, and gave a thread of her apron to a hearth-friend after three hundred years." },
      },
      hint: "Sleep in any bed at night. Elsie means her inn, but any bed will do.",
    },
  ],
};

/** @type {Story} */
const BRAM = {
  id: "heart_bram",
  title: "The Locked Drawer",
  short: "The Locked Drawer",
  giver: "bram",
  kind: "heart",
  tones: ["warm", "sad", "funny"],
  summary: "Mayor Bram's father left a drawer in the town hall that Bram has never dared to open.",
  requires: { stories: ["act2_choir"], flags: { "g:aff_bram": ">=3" } },
  chapters: [
    {
      id: "verdict",
      title: "The Town's Verdict",
      when: CROWN,
      intro: [
        `${B}The council wants your name on the honor roll. For saving the town. Some of the council. Two of them. Well, Quill, and Quill's cousin.`,
        `${B}The rest want it struck off everything. I have to decide. I'm the mayor. I've never wanted to be less the mayor.`,
        `${B}Ask Reyes and Hollis what they think. Their words, not mine. I'll write down whatever they say. Then I'll decide.`,
      ],
      objectives: [
        { type: "talk", label: "Ask Warden Reyes for her verdict", npc: "reyes" },
        { type: "talk", label: "Ask Brother Hollis for his verdict", npc: "hollis" },
      ],
      outro: [
        `${B}Reyes said "on the roll, in small letters". Hollis said "on the roll, and pray for them". So. On the roll. Small letters. With a prayer.`,
        `${B}My father buried things for the town's sake. I won't bury you. I'll just write you very, very small.`,
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "Talk to Warden Reyes and Brother Hollis, then go back to Bram.",
    },
    {
      id: "drawer",
      title: "The Archive",
      intro: [
        `${B}My father's desk has a drawer that's been locked since the day he died. I have the key. I've always had the key. I've just never... used it.`,
        `${B}I'd like to. With you there. But first, I want copies of everything in the archive. If the drawer says what I think it says, the town deserves the record. Mara has a copying hand. Paper first, then her.`,
        { text: `${B}I told the town about my father, after the plaque. Out loud. I'm still shaking, a little. The drawer's the last of it.`, when: { "mayors_burden.plaque": "lost" } },
        { text: `${B}We put up a plaque. For a goat. You know why. I'm still not sure if that was brave or cowardly. The drawer will tell me.`, when: { "mayors_burden.plaque": "goat" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Bram 16 paper", npc: "bram", item: "minecraft:paper", count: 16 },
        { type: "talk", label: "Ask Mara to copy the town archive", npc: "mara" },
      ],
      outro: [
        `${M}Copied. All of it. Most of it is drain reports. Your father had very strong opinions on drains, Bram.`,
        `${B}He did. He did. Right. The drawer. Tomorrow. I'll be brave tomorrow.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Paper is crafted from 3 sugar cane. Give Bram 16, then talk to Mara.",
    },
    {
      id: "hat",
      title: "Father's Hat",
      intro: [
        "Bram opens the drawer. Inside: a pipe, a ribbon from a fair, and one letter, addressed to him, in his father's careful hand.",
        `${B}"Bram. If you are reading this, you are braver than I was. I made the town forget the Long Storm. I told myself it was kindness. It was fear. Visit your mother's grave for me. I never could."`,
        `${B}He never visited her. Thirty years and he never went. He sent me with flowers every spring and I thought he was busy. Will you come with me? Flowers. Four of them. I'll bring the hat.`,
      ],
      objectives: [{ type: "place", label: "Plant 4 flowers at the Old Graveyard", blocks: FLOWERS, count: 4, place: "graveyard", radius: 16 }],
      outro: [
        "Bram takes off the mayoral hat and sets it on the headstone for a moment, as if letting it rest.",
        `${B}Mother, this is {player}. They're the reason I'm braver than Father. Don't tell him. He'd be ever so cross.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "Any small flower counts. Place 4 within 16 blocks of the Old Graveyard.",
    },
    {
      id: "speech",
      title: "A Speech of His Own",
      end: "bram",
      intro: [
        `${B}I'm giving a speech. In the square. A real one, not the kind with forty adjectives. About remembering, instead of forgetting.`,
        `${B}I need fireworks. Three. At the end. Mayors need fireworks. It's in the charter. It isn't. It should be.`,
      ],
      objectives: [{ type: "use", label: "Set off 3 fireworks in the town square", item: "minecraft:firework_rocket", count: 3, offset: SQUARE, mark: "Town square", radius: 16 }],
      outro: [
        "Bram's speech is four minutes long, which for Bram is a miracle. He says the word \"remember\" eleven times. When the fireworks go up, he doesn't flinch.",
        `${B}My father's hat. It's three sizes too big. I want you to have the replica I had made, the one that fits. You were the one who said I could wear the real one. Thank you, {player}.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:leather_helmet", amount: 1, name: "The Mayoral Hat (Replica)", lore: ["Fits much better", "than the real one.", "Smells of nothing at all."] }],
        codex: { id: "bram_drawer", title: "The Locked Drawer", text: "Mayor Bram's father made the town forget the Long Storm, and never once visited his wife's grave. He left one letter, locked away, saying so. Bram read it, took flowers to his mother, and gave a speech about remembering." },
      },
      hint: "Fireworks are crafted from paper and gunpowder. Use 3 within 16 blocks of the town square (just off world spawn).",
    },
  ],
};

/** @type {Story} */
const QUILL = {
  id: "heart_quill",
  title: "Mother's Teapot",
  short: "Mother's Teapot",
  giver: "quill",
  kind: "heart",
  tones: ["funny", "warm"],
  summary: "Quill sold his mother's teapot at her wake. He has regretted it for eleven years.",
  requires: { stories: ["act2_choir"], flags: { "g:aff_quill": ">=3" } },
  chapters: [
    {
      id: "partners",
      title: "Partners",
      when: CROWN,
      intro: [
        `${Q}Look at you. The Crowned, in my shop. Business has never been better. People come to see where you buy your bread.`,
        `${Q}So here's a proposal: partners. You, the crown. Me, the ledger. We'd own this coast in a year. ...You're quiet. Good. Think about it. Bring me a diamond either way. A deposit. On a partnership, or on my silence.`,
      ],
      objectives: [{ type: "deliver", label: "Bring Quill a diamond", npc: "quill", item: "minecraft:diamond", count: 1 }],
      outro: [`${Q}A diamond. Generous. Now tell me plainly.`],
      choices: [
        { id: "accept", label: "\"Partners, then.\"", set: { partner: "yes" }, reply: [`${Q}Partners. Oh, that's a terrible idea. I love it. And I hate how much I love it. Let's never shake on it, so we can both deny it later.`] },
        { id: "refuse", label: "\"No. I don't want a coast.\"", set: { partner: "no" }, reply: [`${Q}No? Huh. A Crowned who doesn't want a coast. You're stranger than I thought. I'll keep the diamond as a souvenir of the day someone refused me.`] },
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "Diamonds are deep underground, below y 0. Bring one to Quill.",
    },
    {
      id: "bargain",
      title: "A Bad Bargain",
      intro: [
        `${Q}Confession. My mother had a teapot. Ugly thing. Green, with a chipped spout. At her wake, someone offered me a fair price for it, and I took it. Out of habit. Before I knew I'd done it.`,
        `${Q}I've spent eleven years tracking that teapot. It went to a collector, then a smuggler, then a cove I used to use for, ah, logistics. The Smugglers' Cove. The trail ends there.`,
        `${Q}Go and look. And bring a few emeralds. Nobody in that cove talks for free. Least of all me.`,
        { text: `${Q}You trusted me, back when you shouldn't have. Trust me on this: it's just a teapot. It's not just a teapot.`, when: { "g:quill": "trusted" } },
        { text: `${Q}You turned me in, once. Fair. I'm asking anyway. That's how much this teapot matters.`, when: { "g:quill": "exposed" } },
      ],
      objectives: [
        { type: "reach", label: "Search the Smugglers' Cove", place: "sea_cave", radius: 16 },
        { type: "deliver", label: "Bring Quill 4 emeralds for bribes", npc: "quill", item: "minecraft:emerald", count: 4 },
      ],
      outro: [
        `${Q}A note in the barrel? "Sold to the caravan, for gold and purple stones." Purple stones. Amethyst. Of course. That collector always loved shiny things. So did I. So did she.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "The Smugglers' Cove is on the coast; the tracker points there. Emeralds come from villager trades and mountain ore.",
    },
    {
      id: "trade_up",
      title: "Trade Up",
      intro: [
        `${Q}The collector rides with the merchant caravan. She'll sell it back. For a price. She always has a price. I taught her that.`,
        `${Q}Gold, eight ingots. Amethyst, eight shards. I'd pay myself, but if she sees me she'll triple it. She knows my face. She knows my mother's face in my face. It's a whole thing.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Quill 8 gold ingots", npc: "quill", item: "minecraft:gold_ingot", count: 8 },
        { type: "deliver", label: "Bring Quill 8 amethyst shards", npc: "quill", item: "minecraft:amethyst_shard", count: 8 },
      ],
      outro: [
        "Quill unwraps the teapot from a scrap of sailcloth. It is exactly as ugly as he said. Green. Chipped spout. He holds it the way you'd hold a bird.",
        `${Q}She used to make tea in this for anybody who came to the door. Debt collectors. Wardens. Me, when I came home with something I shouldn't have. Tea first, she said. Then we'll see.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "Gold ingots are smelted from gold ore; amethyst shards are mined from amethyst clusters in geodes underground.",
    },
    {
      id: "tea",
      title: "Tea First",
      end: "quill",
      intro: [
        `${Q}Tea. In her pot. With you. At the cove, at dusk, where I did my worst business and her best worrying. That's the plan. Don't laugh.`,
        `${Q}Bring sweet berries. She always put berries in. It's disgusting. I want it exactly right.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Quill 6 sweet berries", npc: "quill", item: "minecraft:sweet_berries", count: 6 },
        { type: "vigil", label: "Drink tea with Quill at the Smugglers' Cove at dusk", place: "sea_cave", radius: 20, seconds: 60, timeOfDay: DUSK },
      ],
      outro: [
        "The tea is genuinely awful. Quill drinks two cups and doesn't say a word for a very long time. Then he refills yours without asking.",
        `${Q}I don't do this, you know. Give things. Here. Her lucky emeralds. They were in the pot. She hid them from me. Smart woman. You keep them. Don't spend them. If you spend them, I'll know.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:emerald", amount: 3, name: "Mother's Lucky Emerald", lore: ["Found in a green teapot.", "Hidden from her son,", "for his own good."] }],
        codex: { id: "quill_teapot", title: "Mother's Teapot", text: "Quill sold his mother's ugly green teapot at her wake, out of habit, and spent eleven years buying it back. Tea first, she always said. Then we'll see." },
      },
      hint: "Sweet berries grow on bushes in taiga forests. Then be within 20 blocks of the Smugglers' Cove at dusk (time 12000 to 13800) for a minute.",
    },
  ],
};

/** @type {Story} */
const IDA = {
  id: "heart_ida",
  title: "Dunmore's Pick",
  short: "Dunmore's Pick",
  giver: "ida",
  kind: "heart",
  tones: ["warm"],
  summary: "Ida has never lit her master's old forge. She thinks it's time.",
  requires: { stories: ["act1_signs"], flags: { "g:aff_ida": ">=3" } },
  chapters: [
    {
      id: "quench",
      title: "Quench",
      when: CROWN,
      intro: [`${I}No.`, `${I}...Fine. One thing. Fire that cooled. Obsidian. Four. Show me you can be tempered. Then we work.`],
      objectives: [{ type: "deliver", label: "Bring Ida 4 obsidian", npc: "ida", item: "minecraft:obsidian", count: 4 }],
      outro: [`${I}Hot, then cold. Hard. Not broken.`, `${I}We work.`],
      reward: { levels: 2, crowns: 20 },
      hint: "Obsidian forms where water meets lava. You need a diamond pickaxe to mine it.",
    },
    {
      id: "cold_forge",
      title: "The Cold Forge",
      intro: [
        `${I}Dunmore's forge. Behind mine. Cold since he died. Twelve years.`,
        `${I}I want to light it. Need iron. Real ore, not ingots. Mine it yourself. He said ore you mine has your sound in it.`,
        `${I}And coal. Eight. For the first fire.`,
      ],
      objectives: [
        { type: "mine", label: "Mine 12 iron ore", blocks: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"], count: 12 },
        { type: "deliver", label: "Bring Ida 8 coal", npc: "ida", item: "minecraft:coal", count: 8 },
      ],
      outro: [`The old forge takes three tries to catch. On the third it roars, and Ida closes her eyes.`, `${I}There. He's listening.`],
      reward: { levels: 3, crowns: 30 },
      hint: "Iron ore is common in caves and mountains. Coal comes from coal ore.",
    },
    {
      id: "listening",
      title: "The Listening Stone",
      intro: [
        `${I}Dunmore went deep. Below the deepslate line. To listen. Said the stone there hums with the old notes.`,
        `${I}Go below y -40. Break deepslate. Twenty-four. Listen while you do.`,
        { text: `${I}The blade sings Hal's note. Dunmore would have wept. Big man. Wept easily.`, when: { "singing_forge.blade": "hal" } },
      ],
      objectives: [
        { type: "reach", label: "Go below y -40", belowY: -40 },
        { type: "mine", label: "Mine 24 deepslate", blocks: ["minecraft:deepslate", "minecraft:cobbled_deepslate"], count: 24 },
      ],
      outro: [`${I}Hear it? Low. Steady. Like a heart under the floor.`, `${I}That's what he heard. Every night. Now you know.`],
      reward: { levels: 4, crowns: 40 },
      hint: "Deepslate is the dark stone below y 0. Dig down below y -40 and mine 24 blocks of it.",
    },
    {
      id: "good_hammer",
      title: "The Good Hammer",
      end: "ida",
      intro: [`${I}Last piece. His pick. I kept the head. Needs a diamond. Needs iron for the bands.`, `${I}Bring them. I forge. You watch. Don't talk.`],
      objectives: [
        { type: "deliver", label: "Bring Ida a diamond", npc: "ida", item: "minecraft:diamond", count: 1 },
        { type: "deliver", label: "Bring Ida 4 iron ingots", npc: "ida", item: "minecraft:iron_ingot", count: 4 },
      ],
      outro: [
        "Ida works through the night. Every strike of the hammer rings a different note, and somehow they add up to a tune.",
        `${I}Dunmore's pick. Remade. Yours.`,
        `${I}Use the good hammer, I said. You did. Thank you.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:iron_pickaxe", amount: 1, name: "Dunmore's Pick", lore: ["Every strike rings", "a different note."] }],
        codex: { id: "dunmore_pick", title: "Dunmore's Pick", text: "Dunmore, the smith who forged the first relics, went below the deepslate to listen to the stone. Ida relit his forge after twelve years and remade his pick with ore its new owner mined." },
      },
      hint: "Diamonds are below y 0; iron ingots are smelted from iron ore.",
    },
  ],
};

/** @type {Story} */
const SOL = {
  id: "heart_sol",
  title: "Adela's Star",
  short: "Adela's Star",
  giver: "sol",
  kind: "heart",
  tones: ["sad", "warm"],
  summary: "Sol's wife found a star the winter before she died. He has never shown it to anyone.",
  requires: { stories: ["act1_signs"], flags: { "g:aff_sol": ">=3" } },
  chapters: [
    {
      id: "dark_star",
      title: "A Dark Star",
      when: CROWN,
      intro: [
        `${S}Your star went dark in my book the night of the Lantern. I've looked every night since. Nothing. A hole where you used to shine.`,
        `${S}Sit with me at the Starfall Crater, where the old Lantern fell. If there's any light left in you, that's where it'll show.`,
      ],
      objectives: [{ type: "vigil", label: "Sit with Sol at the Starfall Crater at night", place: "starfall", radius: 24, seconds: 90, timeOfDay: NIGHT }],
      outro: [`${S}There. Faint. Very faint. But there. I'll write it in. Small. The faint ones are the faithful ones, Adela said. Let's see if she was right about you.`],
      reward: { levels: 2, crowns: 20 },
      hint: "The Starfall Crater is far out; the tracker points there. Stay within 24 blocks of it at night for 90 seconds.",
    },
    {
      id: "chart",
      title: "The Winter Chart",
      intro: [
        `${S}Adela kept a winter chart. Every star she ever named, in her own hand. The last page has one more star than the sky does. I've never found it.`,
        `${S}I need to redraw the chart. Paper, and glowstone dust for the ink, the way she made it. Then come to the Stargazer's Ruin on a clear night and help me look.`,
        { text: `${S}Wren's cat Moonpie climbs up to my roof and sleeps on the chart every night. She knows something. Cats always do.`, when: { "lost_lambs.cat": "moonpie" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Sol 4 paper", npc: "sol", item: "minecraft:paper", count: 4 },
        { type: "deliver", label: "Bring Sol 4 glowstone dust", npc: "sol", item: "minecraft:glowstone_dust", count: 4 },
        { type: "vigil", label: "Watch the sky with Sol at the Stargazer's Ruin at night", place: "observatory", radius: 20, seconds: 90, timeOfDay: NIGHT, outdoors: true },
      ],
      outro: [`${S}Nothing yet. But the chart is right, I'm sure of it now. Her star is real. It's only hiding. Stars hide from people who look too hard. We'll look softly next time.`],
      reward: { levels: 3, crowns: 30 },
      hint: "Glowstone dust comes from glowstone in the Nether. Stay outdoors within 20 blocks of the Stargazer's Ruin at night for 90 seconds.",
    },
    {
      id: "softly",
      title: "Looking Softly",
      intro: [
        `${S}Adela said you find a shy star by looking beside it, not at it. From somewhere low. Somewhere she loved.`,
        `${S}She loved the lighthouse. Take a spyglass there and look twice, beside where the chart says. And then, for me, stay up very late, somewhere with sky, past midnight. That's when she found it.`,
      ],
      objectives: [
        { type: "use", label: "Look through a spyglass twice at the lighthouse", item: "minecraft:spyglass", count: 2, place: "lighthouse", radius: 16 },
        { type: "vigil", label: "Stay under the open sky after midnight at the lighthouse", place: "lighthouse", radius: 24, seconds: 60, timeOfDay: [18000, 23000], outdoors: true },
      ],
      outro: [
        `${S}There. There! Look beside the Net, a hand's width down. A little blue one. She was right. She was right, and I was looking straight at it for eleven years.`,
        "Sol cries without any fuss, the way someone does who has done a great deal of it already. Then he laughs.",
      ],
      reward: { levels: 4, crowns: 40 },
      sky: [{ kind: "shooting_star", place: "lighthouse" }],
      hint: "Use a spyglass twice within 16 blocks of the lighthouse, then be outdoors there between midnight and dawn (time 18000 to 23000) for a minute.",
    },
    {
      id: "naming",
      title: "Naming Night",
      end: "sol",
      intro: [`${S}A found star needs a name. I've thought of one. I'd like you to hear it first. Bring me something that shines, and meet me at the meadow at night. Adela and I courted there. Don't tell Wren. She'll name it Pudding.`],
      objectives: [
        { type: "deliver", label: "Bring Sol an amethyst shard", npc: "sol", item: "minecraft:amethyst_shard", count: 1 },
        { type: "vigil", label: "Name the star with Sol at Wren's Meadow at night", place: "meadow", radius: 24, seconds: 60, timeOfDay: NIGHT, outdoors: true },
      ],
      outro: [
        `${S}Adela's Lamp. That's its name. She'd hate it. Too sentimental. She'd let me keep it anyway.`,
        `${S}This was her spyglass. She'd want it to look at things. Not sit in a box. Look at things for her, {player}.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:spyglass", amount: 1, name: "Adela's Glass", lore: ["For looking beside things,", "not at them."] }],
        codex: { id: "adela_lamp", title: "Adela's Lamp", text: "Adela kept a winter chart with one more star than the sky. Sol searched for it for eleven years by looking straight at it. You found it by looking beside it, from the lighthouse, after midnight. It is called Adela's Lamp." },
      },
      hint: "Amethyst shards come from geodes underground. Then be outdoors within 24 blocks of Wren's Meadow at night for a minute.",
    },
  ],
};

/** @type {Story} */
const HOLLIS = {
  id: "heart_hollis",
  title: "Every Candle Lit",
  short: "Every Candle Lit",
  giver: "hollis",
  kind: "heart",
  tones: ["warm", "eerie"],
  summary: "Brother Hollis has never once slept through a whole night. He'd like to try.",
  requires: { stories: ["act2_choir"], flags: { "g:aff_hollis": ">=3", "g:hollis": "!lost" } },
  chapters: [
    {
      id: "put_down",
      title: "Put It Down",
      when: CROWN,
      intro: [
        `${H}I'm not angry. Please don't think I'm angry. I've been where you are, almost. The water spoke to me for a year. It promised me everything. I said no, every night. Barely.`,
        `${H}You said yes. I understand why. I'd like to sit with you in the chapel, at midnight, when it's loudest. Just sit. And then ask you something.`,
      ],
      objectives: [{ type: "vigil", label: "Sit with Hollis in the Old Chapel at midnight", place: "old_chapel", radius: 12, seconds: 60, timeOfDay: MIDNIGHT }],
      outro: [`${H}Can you hear it, still? The song? I can, a little, when you're near. Will you put it down? Not today. Ever. Will you try?`],
      choices: [
        { id: "try", label: "\"I'll try.\"", set: { plea: "try" }, inc: { "g:mercy": 1 }, reply: [`${H}That's all anyone can do. That's all I do. Every night. Thank you, {player}. I'll light a candle for the trying.`] },
        { id: "cant", label: "\"I can't put it down.\"", set: { plea: "cant" }, reply: [`${H}Then I'll pray for you every night until you can. I'm very stubborn about prayers. You'll see.`] },
      ],
      reward: { levels: 2, crowns: 20 },
      hint: "Be within 12 blocks of the Old Chapel between time 17000 and 20000 (around midnight) for a minute.",
    },
    {
      id: "wax",
      title: "Wax and Wick",
      intro: [
        `${H}I've never slept a whole night. Not once, since I came here. I think, if every candle in the chapel were lit at once, the dark would have nowhere to stand.`,
        `${H}I make my own candles. Honeycomb for the wax, string for the wicks. Would you... could you bring some? I'm out. I'm always out. I burn so many.`,
        { text: `${H}You told me to forgive myself. I'm doing better. I'm still out of candles.`, when: { "hollis_faith.forgive": "mercy" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Hollis 6 honeycomb", npc: "hollis", item: "minecraft:honeycomb", count: 6 },
        { type: "deliver", label: "Bring Hollis 6 string", npc: "hollis", item: "minecraft:string", count: 6 },
      ],
      outro: [`Hollis dips candles all afternoon, humming something that isn't a hymn. When you ask what it is, he looks startled.\n\n${H}A lullaby. My mother's. I didn't know I remembered it.`],
      reward: { levels: 3, crowns: 30 },
      hint: "Shear a bee nest or hive with shears for honeycomb (a campfire underneath keeps the bees calm). Spiders drop string.",
    },
    {
      id: "vigil",
      title: "The Long Vigil",
      intro: [
        `${H}Tonight I light them all. Every candle in the chapel. Will you help? And then stay. Through midnight. That's when it's worst. The listening.`,
        `${H}If you're there, I think I can bear it. If I can bear it once, maybe I can sleep after.`,
      ],
      objectives: [
        { type: "interact", label: "Light 4 candles in the Old Chapel", place: "old_chapel", blocks: CANDLES, count: 4, radius: 10 },
        { type: "vigil", label: "Keep the midnight vigil in the Old Chapel", place: "old_chapel", radius: 12, seconds: 120, timeOfDay: MIDNIGHT },
      ],
      outro: [
        "At midnight the candle flames all lean the same way at once, toward the sea, as if a door has opened. Hollis grips the pew. You stay. He stays. After a while, the flames straighten.",
        `${H}It passed. It passed and I'm still here. I'm still me. Oh. Oh, I think I'm tired. I think I'm actually tired.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "Tap 4 candles in the Old Chapel (light them with flint and steel if they're out), then stay within 12 blocks between time 17000 and 20000 for 2 minutes.",
    },
    {
      id: "plain_sleep",
      title: "Plain Sleep",
      end: "hollis",
      intro: [`${H}Will you sleep too? Tonight? If you sleep, and I know you're sleeping, I think I'll believe I can. Silly. I know.`],
      objectives: [
        {
          type: "sleep",
          label: "Sleep a night, so Hollis can",
          vision: [
            { title: "§7No dream", text: "Nothing. No water, no song, no voice. Only dark, the warm, ordinary kind, like the inside of a closed hand.", seconds: 6 },
            { text: "You wake to a bell. Not the drowned one. The chapel's own little handbell, rung badly, and someone laughing.", seconds: 5 },
          ],
        },
      ],
      outro: [
        `${H}I slept. All night. I woke up and the sun was already up and I didn't know where I was and it was wonderful. I rang the handbell. I'm sorry. I couldn't help it.`,
        `${H}Here. Two of the candles I made. Blessed, a little, in my clumsy way. Light one when it's dark and you can't sleep. Think of a priest who finally did.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:candle", amount: 2, name: "Hollis's Candle", lore: ["Dipped by hand.", "For the nights", "you can't sleep."] }],
        codex: { id: "plain_sleep", title: "Every Candle Lit", text: "Brother Hollis had never slept through a night. He lit every candle in the chapel, kept the midnight vigil with a friend, and slept until the sun was up. He rang the handbell, badly, out of joy." },
      },
      hint: "Sleep in any bed at night.",
    },
  ],
};

/** @type {Story} */
const MOSS = {
  id: "heart_moss",
  title: "The Unvisited Grave",
  short: "Unvisited Grave",
  giver: "moss",
  kind: "heart",
  tones: ["funny", "sad", "warm"],
  summary: "Moss tends one grave nobody else visits. He'd like you to meet her.",
  requires: { flags: { "g:aff_moss": ">=3" } },
  chapters: [
    {
      id: "even_dead",
      title: "Even the Dead",
      when: CROWN,
      intro: [
        `${MO}The dead don't like you. I've never said that about anyone. They go quiet when you walk past. Not the polite quiet. The other one.`,
        `${MO}Stand watch in my yard one night. Put down whatever climbs out. Let them see you protect them. Maybe they'll come round. I did, mostly.`,
      ],
      objectives: [{ type: "defeat", label: "Defeat 5 monsters at the Old Graveyard at night", mobs: NIGHT_MOBS, count: 5, night: true, place: "graveyard", radius: 32 }],
      outro: [`${MO}Mrs. Abernathy says you'll do. Old Pell wants it on record he still doesn't like you. Noted, Pell.`],
      reward: { levels: 2, crowns: 20 },
      hint: "Defeat 5 monsters within 32 blocks of the Old Graveyard at night.",
    },
    {
      id: "nell",
      title: "Old Nell",
      intro: [
        `${MO}Nell Moss. My grandmother. First gravedigger in the family. Dug this whole yard by hand. And nobody visits her. Not even the family. Well. I'm the family. I visit. Daily. That's different.`,
        `${MO}She liked flowers and hated bare dirt. Plant four flowers by her stone, and green up the ground around it. Bone meal. She'd want it lush. She'd want it embarrassingly lush.`,
        { text: `${MO}You had a proper stone carved, back on the graveyard shift. Nell would've liked that. She judged a person by their stonework.`, when: { "graveyard_shift.stone": "carved" } },
      ],
      objectives: [
        { type: "place", label: "Plant 4 flowers at the Old Graveyard", blocks: FLOWERS, count: 4, place: "graveyard", radius: 16 },
        { type: "use", label: "Use bone meal 3 times at the Old Graveyard", item: "minecraft:bone_meal", count: 3, place: "graveyard", radius: 16 },
      ],
      outro: [`${MO}Look at that. Lush. Embarrassingly lush. She'd be insufferable about it. Nell, this is {player}. They did the flowers. Don't start.`],
      reward: { levels: 3, crowns: 30 },
      hint: "Any small flower counts; place 4 within 16 blocks of the Old Graveyard, and use bone meal on the grass there 3 times.",
    },
    {
      id: "lantern",
      title: "Nell's Lantern",
      intro: [
        `${MO}Nell kept a soul lantern by the gate. Blue flame. Said it was so the dead could find the way out, if they ever wanted to leave. None did. Too comfortable. Excellent landlady.`,
        `${MO}It went out the night she died. I never relit it. Bring me a soul lantern, and then sit up with her a while. Sneak. Quiet. The dead are shy about lanterns.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Moss a soul lantern", npc: "moss", item: "minecraft:soul_lantern", count: 1 },
        { type: "vigil", label: "Sit very still by Nell's stone at night (sneak)", place: "graveyard", radius: 8, seconds: 60, timeOfDay: NIGHT, sneaking: true },
      ],
      outro: [
        "When the lantern is lit, the blue flame flickers once toward Nell's stone, the way a dog's tail wags. Moss pretends not to see it. He's smiling.",
        `${MO}She approves. Don't ask how I know. I know.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "A soul lantern is crafted from 8 iron nuggets around a soul torch. Then sneak within 8 blocks of the Old Graveyard's center at night for a minute.",
    },
    {
      id: "plot",
      title: "Six and a Half Feet",
      end: "moss",
      intro: [
        `${MO}Now the important bit. When your time comes, a long way off, I'll dig for you. That's a promise in my trade. The best one there is.`,
        `${MO}But you have to dig too. Family tradition. Everybody digs their own first spadeful. Dig me some dirt. Twenty blocks. And tell Hollis to put your name in the book. He keeps the good book.`,
      ],
      objectives: [
        { type: "mine", label: "Dig 20 dirt or grass blocks", blocks: ["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt"], count: 20 },
        { type: "talk", label: "Ask Brother Hollis to write your name in the chapel book", npc: "hollis" },
      ],
      outro: [
        `${H}Moss's book? He asked you to dig? Oh, that's... that's lovely, actually. He's only asked three people in his life. I'll write it nicely.`,
        `${MO}It's in the book. Six and a half feet, extra deep, nice view of the sea. Here. Nell's spade. It's dug every grave in this yard. It'll dig yours, someday. Not soon. I'll be very cross if it's soon.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:iron_shovel", amount: 1, name: "Nell's Spade", lore: ["Dug every grave", "in the Old Graveyard.", "Not yours. Not yet."] }],
        codex: { id: "nell_spade", title: "Old Nell", text: "Nell Moss dug the whole Old Graveyard by hand and kept a soul lantern by the gate so the dead could find the way out. None ever left. Her grandson relit it, and promised to dig for a friend, someday, extra deep." },
      },
      hint: "Dig any 20 dirt or grass blocks, then talk to Brother Hollis at the chapel.",
    },
  ],
};

/** @type {Story} */
const WREN = {
  id: "heart_wren",
  title: "Clover's Foal",
  short: "Clover's Foal",
  giver: "wren",
  kind: "heart",
  tones: ["happy", "funny"],
  summary: "Wren is absolutely, completely, one hundred percent sure Clover is having a foal. Again.",
  requires: { flags: { "g:aff_wren": ">=3" } },
  chapters: [
    {
      id: "scared",
      title: "Scared",
      when: CROWN,
      intro: [
        `${W}Um. Hi. Clover hides when you come now. The goats too. Grumbles even. And Grumbles isn't scared of anything, he headbutted a creeper once.`,
        `${W}I'm not scared. I'm just standing behind the fence. Can you... can you feed them? Gently? So they know you're still nice? I think you're still nice.`,
      ],
      objectives: [{ type: "tend", label: "Gently feed 3 horses at Wren's Meadow", mobs: ["minecraft:horse", "minecraft:donkey"], item: "minecraft:apple", count: 3, place: "meadow", radius: 32 }],
      outro: [`${W}Clover ate from your hand! She did! See? You ARE still nice. I knew it. I mostly knew it.\n\nWren hugs you very fast and runs away before you can hug back.`],
      reward: { levels: 2, crowns: 20 },
      hint: "Feed apples to horses (or donkeys) within 32 blocks of Wren's Meadow. Lead or ride one there if there are none.",
    },
    {
      id: "hay",
      title: "Hay and Hope",
      intro: [
        `${W}Clover is having a FOAL. For real this time. I asked Moss and he said "hm" which means yes. Probably.`,
        `${W}She needs the best hay in the world. Hay bales, four. And apples, because apples are her favorite and I think the foal will like them too, even inside.`,
        { text: `${W}Biscuit the cat keeps sleeping on Biscuit the cow. And now on Clover. Biscuit is a very confusing name to have around here.`, when: { "lost_lambs.cat": "biscuit" } },
        { text: `${W}And Ember is SO excited to be a big brother. Ember is your horse from Lantern Night. I've decided he's the uncle.`, when: { "act5_lantern.horse": "ember" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Wren 4 hay bales", npc: "wren", item: "minecraft:hay_block", count: 4 },
        { type: "deliver", label: "Bring Wren 6 apples", npc: "wren", item: "minecraft:apple", count: 6 },
      ],
      outro: [`${W}Clover loves it! She lay down in the hay and went "hhhrrrmph". That's horse for "thank you, I'm comfy". Now we wait. I'm so bad at waiting. Are you good at waiting?`],
      reward: { levels: 3, crowns: 30 },
      hint: "Hay bales are crafted from 9 wheat. Apples drop from oak leaves.",
    },
    {
      id: "names",
      title: "A Name for Everyone",
      intro: [
        `${W}Moss says horses like company when they're waiting. So we need to give everybody golden carrots so they're all happy and calm and nobody is jealous. Golden carrots are fancy. Clover deserves fancy.`,
        `${W}Feed three horses at the meadow. Any horses! Even horses that aren't ours. They're all a little bit ours.`,
      ],
      objectives: [{ type: "tend", label: "Feed 3 horses golden carrots at Wren's Meadow", mobs: ["minecraft:horse", "minecraft:donkey"], item: "minecraft:golden_carrot", count: 3, place: "meadow", radius: 32 }],
      outro: [`${W}Everybody's so calm! Clover is SO calm. I named all the other horses while you were feeding them. That one's Captain. That one's Soup. Don't ask about Soup.`],
      reward: { levels: 4, crowns: 40 },
      hint: "Golden carrots are crafted from a carrot and 8 gold nuggets. Feed them to horses within 32 blocks of Wren's Meadow.",
    },
    {
      id: "long_night",
      title: "Long Night in the Stable",
      end: "wren",
      intro: [`${W}It's TONIGHT. I can tell. Clover is pacing. Elsie says I can stay up, which she never says. Will you stay up with me? At the meadow? Please please please?`],
      objectives: [{ type: "vigil", label: "Stay up with Wren at the meadow at night", place: "meadow", radius: 24, seconds: 120, timeOfDay: NIGHT }],
      outro: [
        "Just before dawn, in the hay, there's a very small, very wobbly foal, all legs and surprise. Wren doesn't make a single sound. Then she makes all of them at once.",
        `${W}You have to name it. You HAVE to. Clover says so. I'm translating.`,
      ],
      choices: [
        { id: "dawn", label: "\"Dawn.\"", set: { foal: "dawn" }, reply: [`${W}Dawn! Because she came at dawn! That's so smart! Dawn, this is {player}. They named you!`] },
        { id: "pudding", label: "\"Pudding Two.\"", set: { foal: "pudding" }, reply: [`${W}PUDDING TWO. Oh no. Pudding is going to be SO jealous. I love it. I love it so much.`] },
        { id: "wren", label: "\"Little Wren.\"", set: { foal: "wren" }, reply: [`${W}...Me? After ME? I'm not crying. It's the hay. It's always the hay.`] },
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:lead", amount: 1, name: "Wren's Lead", lore: ["Braided by hand,", "with a flower in it.", "The flower is a bit eaten."] }],
        codex: { id: "clover_foal", title: "Clover's Foal", text: "Wren was right this time. Clover had her foal just before dawn, in a bed of the best hay in the world, after a long night in the stable with a friend who stayed up." },
      },
      hint: "Be within 24 blocks of Wren's Meadow at night (time 13000 to 23000) for 2 minutes.",
    },
  ],
};

/** @type {Story} */
const BEA = {
  id: "heart_bea",
  title: "The Last Ship's Supper",
  short: "Ship's Supper",
  giver: "bea",
  kind: "heart",
  tones: ["funny", "warm"],
  summary: "Bea wants to cook the supper she cooked on her last night at sea, twenty years ago. Once.",
  requires: { flags: { "g:aff_bea": ">=3" } },
  chapters: [
    {
      id: "crew",
      title: "Crew Is Crew",
      when: CROWN,
      intro: [
        `${BE}You eat last on my ship now, sailor. That's the rule for crew who steer us onto rocks on purpose. Last, and you wash up.`,
        `${BE}Twelve wheat. Knead the bread for the whole inn. With your own hands. Then we'll talk about where you sit.`,
      ],
      objectives: [{ type: "deliver", label: "Bring Bea 12 wheat", npc: "bea", item: "minecraft:wheat", count: 12 }],
      outro: [`${BE}Hm. Decent kneading. Not good. Decent. Fine. Sit. Not at the head. Not at the foot either. Middle. Crew is crew. Even stupid crew.`],
      reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:bread", amount: 3 }] },
      hint: "Wheat grows from seeds on farmland. Bring Bea 12.",
    },
    {
      id: "galley",
      title: "Galley Hands",
      intro: [
        `${BE}Last night on the Saltwife. Twenty years ago. We'd come through a gale off the Serpent Rocks and everyone was alive and I cooked for sixty like it was a wedding. Best supper of my life.`,
        `${BE}I want to cook it again. Once. Fish pie, potato bread, cocoa pudding. First, the basics. Cod and potatoes, eight each. Good ones. I'll know.`,
        { text: `${BE}Marty's chopping for me now. He cries at every onion. He's going to cry so much at this.`, when: { "hearth_and_table.marty": "hired" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Bea 8 cod", npc: "bea", item: "minecraft:cod", count: 8 },
        { type: "deliver", label: "Bring Bea 8 potatoes", npc: "bea", item: "minecraft:potato", count: 8 },
      ],
      outro: [`${BE}Good fish. Good spuds. You've got a galley hand's eye, sailor. Now the hard part.`],
      reward: { levels: 3, crowns: 30 },
      hint: "Fish for cod with a rod, or catch them in the sea. Potatoes grow on farms and drop from zombies.",
    },
    {
      id: "rocks",
      title: "The Serpent Rocks Recipe",
      intro: [
        `${BE}The secret of the pie was salmon caught in rough weather. Fish fight harder in a gale. Fighting fish taste better. That's science. Ship science.`,
        `${BE}Catch five salmon. And cocoa beans, three, for the pudding. The captain smuggled them aboard and I pretended not to know.`,
        { text: `${BE}Tobin swears salmon caught in the rain are angrier. For once, the old crab is right.\n\n§7(/realm:weather_forecast shows when the next rain comes.)`, when: { "pack:weather_bp": "on" } },
      ],
      objectives: [
        { type: "fish", label: "Catch 5 salmon", items: ["minecraft:salmon"], count: 5 },
        { type: "deliver", label: "Bring Bea 3 cocoa beans", npc: "bea", item: "minecraft:cocoa_beans", count: 3 },
      ],
      outro: [`${BE}Oh, these fought. I can tell. Look at the color. We're nearly there, sailor. Nearly at the Saltwife.`],
      reward: { levels: 4, crowns: 40 },
      hint: "Salmon bite in rivers and cold oceans. Cocoa beans grow on jungle trees.",
    },
    {
      id: "supper",
      title: "Supper for the Crew",
      end: "bea",
      intro: [`${BE}It's cooked. All of it. Now I need a crew. Go and fetch them: Tobin, who sailed. Elsie, who gave me a galley. Reyes, who eats standing up and shouldn't. Tell them supper's on and it's not optional.`],
      objectives: [
        { type: "talk", label: "Invite Old Tobin to supper", npc: "tobin" },
        { type: "talk", label: "Invite Elsie to supper", npc: "elsie" },
        { type: "talk", label: "Invite Warden Reyes to supper", npc: "reyes" },
      ],
      outro: [
        "Supper is loud. Tobin tells the Gnasher story. Reyes sits down, and then is too full to stand up. Elsie hums. Bea stands at the head of the table with her ladle like a captain on a deck, and for an hour the inn is a ship that made it through the storm.",
        `${BE}There. That's the Saltwife's supper. I'll never cook it again. Once is right. Here. My good ladle. NOBODY touches my good ladle. You do now. Don't make me regret it, sailor.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        items: [{ item: "minecraft:bowl", amount: 1, name: "Bea's Good Ladle", lore: ["NOBODY touches it.", "Except you."] }],
        codex: { id: "marigold_supper", title: "The Saltwife's Supper", text: "Bea's last night at sea, on the Saltwife, after a gale off the Serpent Rocks, she cooked for sixty like it was a wedding. Twenty years later she cooked it once more, for the crew she has now, and gave away her good ladle." },
      },
      hint: "Talk to Old Tobin, Elsie and Warden Reyes, then go back to Bea.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [TOBIN, MARA, REYES, ELSIE, BRAM, QUILL, IDA, SOL, HOLLIS, MOSS, WREN, BEA];
