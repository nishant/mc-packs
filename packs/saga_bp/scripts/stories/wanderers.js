// Wanderers of the Wilds: the eight Recurring Wanderers and their chains (story kind "wander", giver
// `w_<id>`). The wanderer pack (wander_bp) decides who appears where; these stories run the quests. A chain's
// first chapter sets up the wanderer's camp (`camp`), where they wait for the rest of it; `camp:<id>` is the
// camp's place. Voices and the rules in docs/STORY_BIBLE.md (sections 4, 6, 10, and "Wanderers" in 4).

/** @typedef {import("../types.js").Story} Story */
/** @typedef {import("../types.js").Wanderer} Wanderer */

/** @type {Wanderer[]} */
export const WANDERERS = [
  { id: "pell", name: "Pell the Pilgrim", short: "Pell", archetype: "pilgrim", guild: "wayfarers", entity: "minecraft:villager_v2", camp: "camp_road" },
  { id: "anwen", name: "Anwen, the Surveyor's Ghost", short: "Anwen", archetype: "ghost", guild: "wayfarers", entity: "minecraft:allay", camp: "camp_ruin" },
  { id: "brannoch", name: "Brannoch Deepdelve", short: "Brannoch", archetype: "miner", guild: "miners", entity: "minecraft:villager_v2", camp: "camp_deep" },
  { id: "rook", name: "Rook the Rival", short: "Rook", archetype: "rival", guild: "wardens", entity: "minecraft:villager_v2", camp: "camp_road" },
  { id: "marigold", name: "Marigold of the Heights", short: "Marigold", archetype: "hermit", guild: "growers", entity: "minecraft:villager_v2", camp: "camp_peak" },
  { id: "tamsin", name: "Tamsin Galeward", short: "Tamsin", archetype: "storm", guild: "wayfarers", entity: "minecraft:villager_v2", camp: "camp_peak" },
  { id: "vesk", name: "Vesk the Exile", short: "Vesk", archetype: "exile", guild: "miners", entity: "minecraft:villager_v2", camp: "camp_ruin" },
  { id: "hob", name: "Hob Fairweather", short: "Hob", archetype: "traveler", guild: "growers", entity: "minecraft:villager_v2", camp: "camp_road" },
];


const PE = "§ePell:§r ";
const AN = "§eAnwen:§r ";
const BN = "§eBrannoch:§r ";
const RO = "§eRook:§r ";
const MG = "§eMarigold:§r ";
const TA = "§eTamsin:§r ";
const VE = "§eVesk:§r ";
const HO = "§eHob:§r ";
const Q = "§eQuill:§r ";

/** A chain finale's relic roll: 15% of one of the everyday relics. */
const ROLL = { chance: 0.15, relics: ["rain_charm", "tide_boots", "compass_echoes", "frost_band", "miners_lamp", "wayfarer_boots"] };
const ACCUSED = { "g:w_accused": ">=1" };
const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);
const MIDNIGHT = /** @type {[number, number]} */ ([17000, 19500]);
const DUSK = /** @type {[number, number]} */ ([11500, 13500]);
const DAWN = /** @type {[number, number]} */ ([22500, 1500]);
const CANDLES = ["minecraft:candle", ...["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"].map((c) => `minecraft:${c}_candle`)];
const FLOWERS = ["minecraft:poppy", "minecraft:dandelion", "minecraft:cornflower", "minecraft:azure_bluet", "minecraft:oxeye_daisy", "minecraft:allium", "minecraft:lily_of_the_valley", "minecraft:blue_orchid"];
const SAPLINGS = ["minecraft:oak_sapling", "minecraft:spruce_sapling", "minecraft:birch_sapling", "minecraft:jungle_sapling", "minecraft:acacia_sapling", "minecraft:dark_oak_sapling", "minecraft:cherry_sapling", "minecraft:pale_oak_sapling", "minecraft:bamboo_sapling", "minecraft:poplar_sapling", "minecraft:mangrove_propagule"];
const MONSTERS = ["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:skeleton", "minecraft:stray", "minecraft:spider", "minecraft:creeper", "minecraft:witch", "minecraft:slime", "minecraft:enderman", "minecraft:bogged"];

/** @type {Story} */
const PELL = {
  id: "w_pell_road",
  title: "Pell's Long Road",
  short: "Pell's Road",
  giver: "w_pell",
  kind: "wander",
  tones: ["cozy", "mystery", "sad"],
  summary: "A footsore pilgrim walks to the old holy places, one at a time, and wonders what the stones are listening for.",
  requires: { stories: ["drowned_bell"] },
  chapters: [
    {
      id: "boots",
      title: "Blisters and Bootlaces",
      camp: { prefab: "camp_road", near: "wanderer" },
      intro: [
        `A thin man in a patched gray cloak sits on a stone, rubbing one bare foot.\n\n${PE}Pell, pilgrim, at your service. Or I would be, if my boots hadn't given up two valleys back. The left one has a mouth now. It laughs at me.`,
        { text: `${PE}They say on the road that you've been calling travelers liars to their faces. Well. I'm a poor liar, so I'll take my chances with you.`, when: ACCUSED },
        `${PE}I'm walking to the old holy places. The chapel, the dome on the hill, the crater where the star fell. One at a time, the way my teacher did. I'll set up camp right here while my feet forgive me.`,
        `${PE}Three pieces of leather and a length of string, and I can mend these myself. Will you walk with me afterward, or just tell me the way? Either is a kindness.`,
      ],
      introChoices: [
        { id: "walk", label: "I'll walk with you", set: { way: "walk" } },
        { id: "map", label: "I'll show you the way", set: { way: "map" } },
      ],
      objectives: [
        { type: "deliver", label: "Bring Pell 3 leather", npc: "w_pell", item: "minecraft:leather", count: 3 },
        { type: "deliver", label: "Bring Pell 1 string", npc: "w_pell", item: "minecraft:string", count: 1 },
      ],
      outro: [
        `Pell sews with quick, patient stitches, humming something old. When he pulls the boot on, he wiggles his toes and laughs out loud.\n\n${PE}It's stopped laughing at me! Thank you, friend.`,
        { text: `${PE}When I'm rested, we'll walk to the Old Chapel together. I talk a lot on the road. I'm told it helps.`, when: { way: "walk" } },
        { text: `${PE}When I'm rested, go on ahead to the Old Chapel and light a candle so I can see it from the road. I'll follow the light.`, when: { way: "map" } },
      ],
      reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:bread", amount: 4 }] },
      hint: "Leather drops from cows, horses and llamas; string from spiders and cobwebs. Pell's camp is where you met him: the tracker points to it.",
    },
    {
      id: "chapel",
      title: "The Road to the Chapel",
      intro: [
        `${PE}My teacher walked this road forty years ago, the year of the great storm. She said the chapel bell rang by itself the night before. I don't know if I believe that. I'd like to.`,
        { text: `${PE}Lead on, then. I'll keep up. Mostly.`, when: { way: "walk" } },
        { text: `${PE}Go on ahead. Light a candle in the chapel window and I'll find my way by it.`, when: { way: "map" } },
      ],
      objectives: [
        { type: "escort", label: "Walk Pell to the Old Chapel", who: { id: "pell", name: "Pell the Pilgrim", entity: "minecraft:villager_v2", look: "minecraft:become_cleric", invul: true }, from: { place: "camp:pell" }, to: { place: "old_chapel", radius: 8 }, radius: 8, when: { way: "walk" } },
        { type: "reach", label: "Go ahead to the Old Chapel", place: "old_chapel", radius: 12, when: { way: "map" } },
        { type: "interact", label: "Light a candle in the Old Chapel", place: "old_chapel", blocks: CANDLES, count: 1, radius: 10, when: { way: "map" } },
      ],
      outro: [
        `Pell kneels at the altar for a long time. When he gets up, his eyes are wet.\n\n${PE}It's quieter than I thought. Holy places usually are.`,
        { text: `${PE}The young keeper here, Brother Hollis. I met him on the steps. He has the look of a man who sleeps well now. Someone did him a great kindness, I think.`, when: { "g:hollis": "saved" } },
        { text: `${PE}They say the young keeper here is gone. The candles still burn. Someone keeps them. Isn't that something.`, when: { "g:hollis": "lost" } },
        `${PE}Come and see me at camp. I've a strange errand next, and a night one.`,
      ],
      reward: { levels: 3, crowns: 40 },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "The Old Chapel is a story place: the tracker points to it. Walking, Pell follows your path once you walk up to him at his camp; keep monsters off him. Going ahead instead, light a candle in the chapel; if its candles are gone, place a candle of your own within 10 blocks of the chapel and tap it.",
    },
    {
      id: "vigil",
      title: "A Vigil Under the Dome",
      camp: { prefab: "camp_road", near: "observatory" },
      intro: [
        `${PE}My teacher's last letter said: "Sit under the broken dome at midnight and count the stars that move." I've never managed it. I always fall asleep.`,
        `${PE}So I'm moving camp to the hill by the Stargazer's Ruin. Keep the vigil with me at midnight. If I nod off, nudge me.`,
      ],
      sky: [{ kind: "shooting_star", place: "observatory" }],
      objectives: [{ type: "vigil", label: "Keep a midnight vigil at the Stargazer's Ruin", place: "observatory", radius: 16, seconds: 90, timeOfDay: MIDNIGHT, outdoors: true }],
      outro: [
        "The night is cold and enormous. Pell talks for a while, then stops, and you both just watch. Somewhere near midnight a single star slides down the sky and is gone.",
        `${PE}One that moved. Just one. My teacher counted three, she said. Maybe the sky's getting tired.`,
        `${PE}Come back to camp when you can. There's one last thing I want to ask you.`,
      ],
      reward: { levels: 3, crowns: 45 },
      hint: "Midnight is the middle of the night (around 18000 on the game clock). Stand outdoors at the Stargazer's Ruin with the sky above you. Pell's camp moved next to it.",
    },
    {
      id: "stone",
      title: "What the Stone Listens For",
      intro: [
        `${PE}My teacher said the old holy places were built on listening stones. Stones that heard everything, and waited for one sound in particular.`,
        `${PE}Set four candles around my camp, would you? Then sit with me and tell me. You've been out on that sea. You've heard things. What does the stone listen for?`,
      ],
      objectives: [
        { type: "place", label: "Set 4 candles around Pell's camp", blocks: CANDLES, count: 4, place: "camp:pell", radius: 10 },
        { type: "answer", label: "Tell Pell what the stone listens for", npc: "w_pell", question: `${PE}What does the stone listen for?`, answers: ["the bell", "bell", "a bell", "the bells", "bells", "the true note", "a true note", "the note", "its note", "a note", "the bells note", "the bell's note"] },
      ],
      outro: [
        `Pell sits very still in the candlelight.\n\n${PE}A bell. Of course. My teacher heard one ring the night before the storm. Maybe the stones were waiting for it. Maybe they still are.`,
        `${PE}I'll walk on tomorrow. There are more holy places than one life has days. But I'll tell every one of them about you.`,
        { text: `${PE}And friend? The road says you've called honest folk liars. I think you were only frightened. I'll tell them that too.`, when: ACCUSED },
      ],
      reward: { levels: 8, crowns: 120, title: "Pilgrim's Friend", relicRoll: ROLL, codex: { id: "w_pell", title: "Pell's Road", text: "Pell walks to the old holy places because his teacher did, forty winters ago, the year of the great storm. She heard the chapel bell ring by itself the night before. He thinks the old places were built on stones that listen, and that what they listen for is a bell." } },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "Candles are made from string and honeycomb, or found in ancient cities and trail ruins. Place them within 10 blocks of Pell's camp. He was there when the chapel's bell rang over the sea: think of The Drowned Bell.",
    },
  ],
};

/** @type {Story} */
const ANWEN = {
  id: "w_anwen_survey",
  title: "The Last Survey",
  short: "Last Survey",
  giver: "w_anwen",
  kind: "wander",
  tones: ["eerie", "sad", "mystery"],
  summary: "A pale woman by the old stones is still measuring the sky, long after she stopped breathing.",
  requires: { stories: ["act1_signs"] },
  chapters: [
    {
      id: "instruments",
      title: "The Wrong Stars",
      camp: { prefab: "camp_ruin", near: "wanderer" },
      intro: [
        `The figure by the old stones is thin as mist. When she turns, you can see the stars through her.\n\n${AN}You can see me. Good. Nobody has, for a very long time. I am Anwen. I was a surveyor. I think I still am.`,
        `${AN}The stars are in the wrong places. Not very wrong. A hair's breadth. I measured them once, long ago, and I wrote it all down, and now they've moved and I cannot say how much.`,
        `${AN}My instruments are gone. Bring me a compass and a clock, and I will make camp here among these stones, and we will begin again.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Anwen a compass", npc: "w_anwen", item: "minecraft:compass", count: 1 },
        { type: "deliver", label: "Bring Anwen a clock", npc: "w_anwen", item: "minecraft:clock", count: 1 },
      ],
      outro: [
        "Her fingers pass through the compass, then close on it, slowly, as if remembering how. The needle swings and settles.",
        `${AN}There. North is still north. That is something. Some things don't move.`,
        `${AN}Come to my stones at night. I need someone with a body to stand where I point.`,
      ],
      reward: { levels: 3, crowns: 35 },
      hint: "A compass takes iron and redstone; a clock takes gold and redstone. Anwen's camp is among the old stones where you met her.",
    },
    {
      id: "height",
      title: "Measuring the Dark",
      intro: [
        `${AN}A survey needs two points, high and low. I was always the high one. I climbed everything. Mountains, towers, once a very angry giraffe.`,
        `${AN}That last part is a joke. I think. Climb high for me, higher than the clouds sit, and look east. Then come back and keep watch at my stones after dark, while I take the low reading.`,
      ],
      objectives: [
        { type: "reach", label: "Climb above height 150", aboveY: 150 },
        { type: "vigil", label: "Keep watch at Anwen's camp after dark", place: "camp:anwen", radius: 12, seconds: 60, timeOfDay: NIGHT, outdoors: true },
      ],
      outro: [
        `${AN}East. You looked east. Did you see the smudge? Sol the sky-reader calls it the Lantern. We called it that too.`,
        `${AN}We measured its road across the sky, every forty years, and marked three places on the ground where its light must fall. Three marks. I can't remember where. I remember the line.`,
      ],
      reward: { levels: 3, crowns: 40 },
      hint: "Height 150 is above most mountains: build a tower, climb a peak or fly. The watch counts at night, outdoors, within 12 blocks of Anwen's camp.",
    },
    {
      id: "line",
      title: "The Line Home",
      intro: [
        `${AN}The line. I remember the line now. It runs from these stones to the old dome on the hill. Follow my light and I'll show you.`,
        `${AN}I'm sorry if I drift. I have been drifting for a very long time.`,
      ],
      objectives: [
        { type: "follow", label: "Follow Anwen's light to the Stargazer's Ruin", from: { place: "camp:anwen" }, to: { place: "observatory", radius: 20 }, wisp: "Anwen's light", stray: 10 },
        { type: "inspect", label: "Find Anwen's old survey marks at the ruin", place: "observatory", clues: [
          { dx: 4, dz: 2, text: "A notch cut in the stone, with a tiny star scratched beside it. Old, older than the tower." },
          { dx: -3, dz: -4, text: "Three dots in a row, joined by a line, and an arrow pointing back toward town." },
          { dx: 1, dz: -5, text: "A word in a script you can't read. Beside it, in plain letters: \"A. checked this. Still true.\"" },
        ] },
      ],
      outro: [
        `${AN}A. checked this. That's me. I wrote that. I was here.\n\nShe touches the stone and, for a moment, her hand doesn't pass through it.`,
        `${AN}Three marks on a line, and the line points home. Whoever comes after me will have to finish it. I can't hold a pen anymore.`,
      ],
      reward: { levels: 4, crowns: 50 },
      hint: "Walk up to the light at Anwen's camp and it drifts toward the Stargazer's Ruin, waiting when you fall behind. Faint green sparkles mark her survey marks there: walk onto each.",
    },
    {
      id: "rest",
      title: "Rest, Surveyor",
      intro: [
        `${AN}I think I've finished. Isn't that strange? I didn't know I could.`,
        `${AN}There's a lodestone in the old dome. Strike it for me, so it remembers this place. Then I'd like to see the stars one last time, the way I first saw them.`,
      ],
      objectives: [
        { type: "interact", label: "Strike the lodestone in the Stargazer's Ruin", place: "observatory", blocks: ["minecraft:lodestone"], count: 1, radius: 8 },
        { type: "vision", label: "Watch the stars with Anwen", place: "observatory", radius: 12, scenes: [
          { title: "The First Night", text: "A young woman on a mountain, a brass rod in her hand, counting stars out loud and laughing when she loses count.", seconds: 4 },
          { title: "The Lantern", text: "A long smudge of light crossing the sky, slow as a cart, and below it three tiny fires lit on far hills.", seconds: 4 },
          { title: "Still True", text: "The same woman, older, scratching a note on a stone: still true. Then nothing but stars.", seconds: 4 },
        ] },
      ],
      outro: [
        `When you open your eyes, Anwen is smaller. Fainter. Smiling.\n\n${AN}Still true. Thank you, friend. Tell the sky-reader the Lantern keeps its road. It always has.`,
        { text: `${AN}You have a gentle way about you. The living usually don't, with the dead. Keep it.`, when: { "g:mercy": ">=3" } },
        "Then there is only the wind in the broken dome, and a compass and a clock lying on the stones where she sat.",
      ],
      reward: { levels: 8, crowns: 130, title: "Keeper of the Survey", relicRoll: ROLL, items: [{ item: "minecraft:compass", amount: 1, name: "§bAnwen's Compass", lore: ["§7North is still north."] }], codex: { id: "w_anwen", title: "The Last Survey", text: "Anwen was a sky surveyor, one of the people who measured the Lantern's road across the sky every forty years and marked three places on the ground where its light must fall. Three marks on a line, and the line points home. She kept measuring long after she died, and wrote on the old stones: still true." } },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "The lodestone stands in the middle of the Stargazer's Ruin: tap or hit it. If it has been mined out, place a lodestone of your own within 8 blocks of the ruin's center (8 chiseled stone bricks around an iron ingot craft one). The vision plays when you stand in the ruin.",
    },
  ],
};

/** @type {Story} */
const BRANNOCH = {
  id: "w_brannoch_deep",
  title: "Deepdelve's Last Seam",
  short: "Last Seam",
  giver: "w_brannoch",
  kind: "wander",
  tones: ["exploration", "funny", "dangerous"],
  summary: "A broad, soot-faced miner deep underground is after one last seam, and the thing that guards it.",
  chapters: [
    {
      id: "pick",
      title: "A Pick for a Pick",
      camp: { prefab: "camp_deep", near: "wanderer" },
      intro: [
        `A broad figure sits on an upturned bucket, polishing a pick worn down to a stub.\n\n${BN}Brannoch Deepdelve. Fifty years under the stone and never once lost. Well. Twice. Three times, if you count the cheese incident.`,
        { text: `${BN}Was that your doing, the bell? Rang out over the sea a while back. Heard it clear down here, through a mile of rock. Gave me goosebumps.`, when: { "drowned_bell.bell": "ring" } },
        `${BN}My pick's done. Fifty years of rock wore her to a toothpick. Bring me a new one, iron, nothing fancy. And show me you can swing one yourself: break me some deepslate.`,
        `${BN}I'll make camp right here. The stone likes a guest who stays.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Brannoch an iron pickaxe", npc: "w_brannoch", item: "minecraft:iron_pickaxe", count: 1 },
        { type: "mine", label: "Mine 32 deepslate", blocks: ["minecraft:deepslate", "minecraft:cobbled_deepslate"], count: 32 },
      ],
      outro: [
        `${BN}Ah. Feel the balance on that. You've a good eye, or a good blacksmith.\n\nHe spins the pickaxe once and buries it in the wall. A chunk of stone falls neatly into his hand.`,
        `${BN}Now. There's a seam I've chased for thirty years. Deep, deeper than most dare. You'll help me light the way.`,
      ],
      reward: { levels: 3, crowns: 35, skill: { skill: "mining", amount: 60 } },
      hint: "Iron pickaxes take three iron ingots and two sticks. Deepslate is the dark stone below height 0. Brannoch's camp is where you met him underground.",
    },
    {
      id: "torches",
      title: "Down Where It's Warm",
      intro: [
        `${BN}Below the cold rock there's a warm layer, where the old lava sleeps. My seam's down there, past height minus forty.`,
        `${BN}Go down and light it as you go: six torches, so I can follow without falling on my face. I've fallen on my face enough for one life.`,
      ],
      objectives: [
        { type: "reach", label: "Go below height -40", belowY: -40 },
        { type: "place", label: "Place 6 torches on the way down", blocks: ["minecraft:torch", "minecraft:soul_torch", "minecraft:copper_torch"], count: 6 },
      ],
      outro: [
        `${BN}Ha! I saw your torches from my camp. Like a string of little suns going down.`,
        `${BN}But I heard something down there too. Scratching. Big scratching. Come back to camp, I want to show you what the old miners left.`,
      ],
      reward: { levels: 3, crowns: 40, skill: { skill: "mining", amount: 40 } },
      hint: "Height -40 is deep in the deepslate layer. Any torch you place counts, anywhere.",
    },
    {
      id: "marks",
      title: "Scratches in the Dark",
      intro: [
        `${BN}The old mine past the hills. The miners there left marks for each other: chalk, cuts, warnings. Find them. And mind the little spiders. They're the old lady's grandchildren.`,
        `${BN}The old lady. Old Gnasher. The biggest spider under the hills. She's guarded my seam since before you were born.`,
      ],
      objectives: [
        { type: "inspect", label: "Find the old miners' marks at the Abandoned Mine", place: "old_mine", clues: [
          { dx: 0, dz: -4, text: "Chalk on a beam: GOOD COAL, BAD AIR. Someone has added: BAD SPIDER." },
          { dx: 2, dz: 3, text: "Eight deep scratches in the stone, each as long as your arm." },
          { dx: -2, dz: 1, text: "A miner's tally: 31 days, 31 lines. The last line wobbles and trails away." },
        ] },
        { type: "defeat", label: "Defeat 8 cave spiders", mobs: ["minecraft:cave_spider"], count: 8 },
      ],
      outro: [
        `${BN}Eight scratches. Arm-long. That's her. She's grown.\n\nFor once, the old miner doesn't joke.`,
        `${BN}I'm too old to fight her. But you're not. Come to camp when you're ready, and bring a sword you trust.`,
      ],
      reward: { levels: 4, crowns: 45, skill: { skill: "combat", amount: 40 } },
      hint: "The Abandoned Mine is a story place: the tracker points to it. Faint green sparkles mark the miners' marks. Cave spiders live in mineshafts, around their spawners.",
    },
    {
      id: "gnasher",
      title: "Old Gnasher",
      intro: [
        `${BN}She's waiting at the old mine. I can feel her in my teeth. Go down, find her, and end it. Then the seam is ours.`,
        `${BN}Mind the cold. She bites like winter. And if you hear her laugh, that's just the echo. Probably.`,
      ],
      objectives: [
        { type: "defeat", label: "Defeat Old Gnasher at the Abandoned Mine", place: "old_mine", radius: 40, champion: { tag: "realm:saga:old_gnasher", mob: "minecraft:spider", name: "Old Gnasher", trait: "frostbound", health: 60, warn: "Something enormous unfolds its legs in the dark. Old Gnasher!", adds: { mobs: ["minecraft:cave_spider"], count: 4 } } },
        { type: "collect", label: "Optional: gather 8 string from her lair", item: "minecraft:string", count: 8, optional: true, bonus: { levels: 1, crowns: 15 } },
      ],
      outro: [
        `${BN}You did it! You actually did it!\n\nHe hugs you, which is like being hugged by a warm boulder.`,
        `${BN}The seam's there, just where I said. Thirty years! I'll dig it slow. Come visit. There'll be tea, and coal, and stories.`,
      ],
      reward: { levels: 8, crowns: 140, title: "Gnasher's Bane", relicRoll: ROLL, items: [{ item: "minecraft:diamond", amount: 2 }], codex: { id: "w_brannoch", title: "Old Gnasher", text: "For thirty years Brannoch Deepdelve chased one seam under the hills, and for thirty years the great spider Old Gnasher guarded it, growing in the cold dark until her scratches were as long as a man's arm. She bit like winter. Brannoch still digs there, slowly, and tells everyone who it was who ended her." } },
      rep: [{ guild: "miners", amount: 20 }],
      hint: "Old Gnasher comes when you're within 40 blocks of the Abandoned Mine. She is cold: frost slows you if you let her bite. She calls her grandchildren at half health.",
    },
  ],
};

/** @type {Story} */
const ROOK = {
  id: "w_rook_rival",
  title: "Rook's Wager",
  short: "Rook's Wager",
  giver: "w_rook",
  kind: "wander",
  tones: ["funny", "violent", "dangerous"],
  summary: "A swaggering bounty hunter keeps turning up wherever you've just won something, and he hates to lose.",
  chapters: [
    {
      id: "wager",
      title: "The Wager",
      camp: { prefab: "camp_road", near: "wanderer" },
      intro: [
        `A lean man in a dented breastplate leans on a spear, grinning.\n\n${RO}Rook. You've heard of me. If you haven't, it's because I was busy collecting the bounties you were about to.`,
        { text: `${RO}And I've heard of you. Calling honest travelers liars to their faces? Bold. I like bold. I'll still beat you.`, when: ACCUSED },
        `${RO}Here's a wager. Ten monsters, four minutes, start when you like. Do it and I'll admit you're not bad. Fail and you buy me supper. I'll camp here and keep score.`,
      ],
      objectives: [{ type: "defeat", label: "Defeat 10 monsters within 4 minutes", mobs: MONSTERS, count: 10, within: 240 }],
      outro: [
        `${RO}Ten. In time. Huh.\n\nHe looks genuinely annoyed, then laughs.\n\n${RO}Fine. You're not bad. Don't let it go to your head. I'll be watching the bounty boards.`,
      ],
      reward: { levels: 3, crowns: 40, skill: { skill: "combat", amount: 50 } },
      hint: "Any hostile monster counts: zombies, skeletons, spiders, creepers. Hunt at night, or in a dark cave. The four minutes start with the first kill.",
    },
    {
      id: "bounties",
      title: "Three Bounties",
      intro: [
        `${RO}Real hunters take real bounties. The champions on the board: the moment you get close to one, I'll be on its trail too. Five minutes, from then. Beat me to three of them, if you can.`,
        { text: `${RO}And if I get there first? I put my arrow in it. Kill it after that and the board pays you half. Hunter's rules.`, when: { "pack:bounty_bp": "on" } },
        { text: `${RO}No board out here? Then there's a brute I've been tracking. First one to bring it down wins.`, when: { "pack:bounty_bp": "off" } },
      ],
      objectives: [
        { type: "defeat", label: "Beat Rook to 3 bounty champions", bounty: true, race: 300, rival: "Rook", count: 3, or: "race", set: { beat: "yes" }, tally: "g:rook_won", lose: { rook_lost: "yes" }, when: { "pack:bounty_bp": "on" } },
        { type: "defeat", label: "Beat Rook to the Brushwood Brute", or: "race", set: { beat: "yes" }, champion: { tag: "realm:saga:rook_brute", mob: "minecraft:zombie", name: "Brushwood Brute", health: 40, warn: "Branches crack. The Brushwood Brute comes out of the trees!" } },
      ],
      outro: [
        `Rook arrives just in time to see you finish.\n\n${RO}No. No, no, no. I had that one. I HAD it.`,
        { text: `${RO}Mind you, I've beaten you to one or two. Don't think I've forgotten. I've got them written down.`, when: { rook_lost: "yes" } },
        `He kicks a stone. Then he sits down heavily on it.\n\n${RO}All right. You beat me. What now? Going to rub it in?`,
      ],
      choices: [
        { id: "spite", label: "Rub it in", set: { spite: "yes" }, inc: { "g:iron": 1 }, reply: [`${RO}Ha. Ha. Very funny. Laugh it up. We'll see who's laughing next time.`] },
        { id: "drink", label: "Buy him a drink", cost: { crowns: 10 }, set: { spite: "no" }, inc: { "g:mercy": 1 }, reply: [`${RO}...Huh. Nobody's ever done that.\n\nHe takes the cup and doesn't quite meet your eyes.\n\n${RO}Thanks. I mean it.`] },
      ],
      reward: { levels: 3, crowns: 45 },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "With the Bounty Board: go after the champion targets on the board. Within 300 blocks of one, Rook is on its trail too: defeat it within 5 minutes to win that race (helpers count). Too slow and the bounty pays you half; the next target is a new race. Or bring down the Brushwood Brute: it comes near you once you start, a big zombie with extra health.",
    },
    {
      id: "map",
      title: "The Map Room",
      camp: { prefab: "camp_road", near: "watchtower" },
      intro: [
        `${RO}I found an old map. Says there's a cache in the Ruined Watchtower: a hunter's stash, from the old days. I'm moving camp there. You coming?`,
        { text: `${RO}Don't think I've forgotten you laughing at me. I haven't.`, when: { spite: "yes" } },
        { text: `${RO}You bought me a drink. So you get first look. Don't make it weird.`, when: { spite: "no" } },
        { text: `${RO}Got a treasure map? Then I'll race you to the chest, too. Last clue to coins in five minutes, or I take my cut.`, when: { "pack:maps_bp": "on" } },
      ],
      objectives: [
        { type: "inspect", label: "Search the Ruined Watchtower for the hunter's cache", place: "watchtower", clues: [
          { dx: 3, dz: -4, text: "Ashes in the old fire pit, and under them a tin box. Empty, except for a note: NOT HERE, FOOL." },
          { dx: 0, dz: 1, text: "Scratched into the ladder: a wolf's head, the old hunters' sign." },
          { dx: -3, dz: 2, text: "A loose stone. Behind it, a pouch of old Crowns and a broken arrowhead." },
        ] },
        { type: "event", label: "Optional: beat Rook to a treasure chest", quest: { pack: "maps_bp" }, race: 300, rival: "Rook", count: 1, optional: true, bonus: { crowns: 30 }, tally: "g:rook_won", lose: { rook_lost: "yes" }, when: { "pack:maps_bp": "on" } },
      ],
      outro: [
        `${RO}A pouch of Crowns and a broken arrowhead. Fifty years of legend for that.\n\nHe turns the arrowhead over in his fingers.`,
        `${RO}The old hunters' sign. My father had one of these. Come back to camp. I've got something to settle.`,
      ],
      reward: { levels: 3, crowns: 50 },
      hint: "The Ruined Watchtower is a story place: the tracker points to it, and Rook's camp is next to it now. Faint green sparkles mark where to look. The race is optional: within 300 blocks of your treasure map's last clue, find the chest within 5 minutes; too slow and the chest pays half its Crowns.",
    },
    {
      id: "turned",
      title: "Rook, Turned",
      when: { spite: "yes", "g:iron": ">=4", "g:rook_won": ">=3" },
      intro: [
        `Rook is standing when you come, spear in hand, and he isn't grinning.\n\n${RO}You laughed. Everyone always laughs. My father laughed, the day he left me at the board with his debts.`,
        `${RO}Three races. Three times you got there first, and laughed. No more wagers. No more races. Let's see who's the better hunter, properly.`,
      ],
      objectives: [
        { type: "defeat", label: "Defeat Rook", place: "camp:rook", radius: 40, champion: { tag: "realm:saga:rook_turned", mob: "minecraft:vindicator", name: "Rook, Turned", trait: "shielded", health: 50, warn: "Rook comes at you, and his friends come out of the trees with him!", adds: { mobs: ["minecraft:pillager"], count: 2 } } },
      ],
      outro: [
        `Rook goes down on one knee, breathing hard.\n\n${RO}Fine. FINE. You're better. You were always better.`,
        `He gets up slowly, picks up his spear, and walks away without looking back. Later, you find his old arrowhead left on your path.`,
      ],
      choices: [{ id: "go", label: "Let him go", set: { turned: "yes" } }],
      reward: { levels: 8, crowns: 110, title: "Rook's Better", relicRoll: ROLL, codex: { id: "w_rook", title: "Rook's Wager", text: "Rook's father was a bounty hunter who left his son nothing but debts and a wolf's-head arrowhead. Rook has been trying to win ever since. Some players beat him and laughed; he came for them once, properly, and lost, and walked away." } },
      rep: [{ guild: "wardens", amount: 20 }],
      hint: "Rook waits at his camp by the Ruined Watchtower. He fights like a vindicator and has friends with crossbows: keep moving.",
    },
    {
      id: "partners",
      title: "Partners",
      when: { turned: "!yes" },
      intro: [
        `${RO}Here's the thing. Something's been creeping round my camp at night. A lot of somethings. I could handle it alone. Probably.`,
        { text: `${RO}But you bought me a drink. So I thought: partners. Just this once.`, when: { spite: "no" } },
        { text: `${RO}You still owe me for the laughing. Stand with me tonight and we're square.`, when: { spite: "yes" } },
        { text: `${RO}And don't look so worried. I'm the one who beat you to a bounty, remember? You're in good hands.`, when: { rook_lost: "yes" } },
      ],
      objectives: [{ type: "defend", label: "Hold Rook's camp against the night", place: "camp:rook", radius: 16, waves: [{ mobs: ["minecraft:zombie", "minecraft:skeleton"], count: 4 }, { mobs: ["minecraft:zombie", "minecraft:spider", "minecraft:skeleton"], count: 6 }] }],
      outro: [
        `At dawn Rook leans on his spear among the bones and grins, properly this time.\n\n${RO}Not bad, partner. Not bad at all.`,
        `${RO}I'll see you at the boards. And I'll still beat you. Sometimes.`,
      ],
      reward: { levels: 8, crowns: 120, title: "Rook's Rival", relicRoll: ROLL, codex: { id: "w_rook", title: "Rook's Wager", text: "Rook's father was a bounty hunter who left his son nothing but debts and a wolf's-head arrowhead. Rook has been trying to win ever since. Somewhere along the way he found a rival worth losing to, and a partner worth standing beside." } },
      rep: [{ guild: "wardens", amount: 20 }],
      hint: "Stand within 16 blocks of Rook's camp by the Ruined Watchtower to start. Two waves come; if you fall or leave for 30 seconds, it starts over.",
    },
  ],
};

/** @type {Story} */
const MARIGOLD = {
  id: "w_marigold_garden",
  title: "The High Garden",
  short: "High Garden",
  giver: "w_marigold",
  kind: "wander",
  tones: ["cozy", "happy", "funny"],
  summary: "A hermit high in the cold hills grows things where nothing grows, and could use a hand and a goat.",
  chapters: [
    {
      id: "tea",
      title: "Tea at the Top of the World",
      camp: { prefab: "camp_peak", near: "wanderer" },
      intro: [
        `A small woman in three coats is crouched over a pot that steams in the cold wind.\n\n${MG}Marigold. I live up here. On purpose, before you ask. The quiet is very good for the roots. Mine and the plants'.`,
        { text: `${MG}You've the cold of a crown about you. Don't look so surprised; the wind talks. I don't care. Tea's tea.`, when: { "g:ending": "crown" } },
        `${MG}I make the best tea in the hills, which is to say the only tea. I'm out of berries for it, and bone meal for my garden. Bring some up and you can have a cup.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Marigold 8 sweet berries", npc: "w_marigold", item: "minecraft:sweet_berries", count: 8 },
        { type: "deliver", label: "Bring Marigold 4 bone meal", npc: "w_marigold", item: "minecraft:bone_meal", count: 4 },
      ],
      outro: [
        `The tea is bitter and red and very hot. It tastes like a whole autumn.\n\n${MG}Good, isn't it? You can stay. Not forever. The goats would get jealous.`,
      ],
      reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:sweet_berries", amount: 6 }] },
      hint: "Sweet berry bushes grow in taiga forests. Bone meal comes from skeletons' bones. Marigold's camp is where you met her, up high.",
    },
    {
      id: "goat",
      title: "The Stubborn Goat",
      intro: [
        `${MG}My goat ran off. Not my goat, exactly. A goat. Any goat. I need one for milk and company and to eat the weeds I'm too old to pull.`,
        `${MG}They're stubborn and they jump. Bring one up on a lead. Goats love it up here. They just don't know it yet.`,
      ],
      objectives: [{ type: "lead", label: "Bring a goat to Marigold's camp on a lead", mob: "minecraft:goat", to: { place: "camp:marigold", radius: 8 } }],
      outro: [
        `The goat looks at Marigold. Marigold looks at the goat. The goat headbutts the tea pot.\n\n${MG}Perfect. I'll call her Nettle. She'll be a terror. Thank you.`,
      ],
      reward: { levels: 3, crowns: 40 },
      rep: [{ guild: "growers", amount: 10 }],
      hint: "Goats live on mountains. Make a lead from string and a slimeball, tie it to the goat and walk it to Marigold's camp. Goats jump: mind the cliffs.",
    },
    {
      id: "garden",
      title: "Seeds for the High Garden",
      intro: [
        `${MG}Now the real work. Flowers, up here, where the wind says nothing grows. Six of them around my camp. Any kind.`,
        `${MG}And then sit with me at dawn. The first light on new flowers. That's the whole reason I live up here.`,
      ],
      objectives: [
        { type: "place", label: "Plant 6 flowers around Marigold's camp", blocks: FLOWERS, count: 6, place: "camp:marigold", radius: 12 },
        { type: "vigil", label: "Watch the dawn with Marigold", place: "camp:marigold", radius: 12, seconds: 60, timeOfDay: DAWN, outdoors: true },
      ],
      outro: [
        "The sun comes up over the edge of the world and lights each flower one by one, poppy and cornflower and daisy, bright against the gray rock. Nettle eats one.",
        `${MG}There. A garden at the top of the world. Come back in spring. There'll be more. And tea.`,
      ],
      reward: { levels: 8, crowns: 110, title: "Highland Gardener", relicRoll: ROLL, items: [{ item: "minecraft:flower_pot", amount: 2 }], codex: { id: "w_marigold", title: "The High Garden", text: "Marigold of the Heights lives above the tree line on purpose. She grows flowers where the wind says nothing grows, makes the only tea in the hills, and keeps a goat named Nettle who is a terror. She says the first light on new flowers is the whole reason she lives up there." } },
      rep: [{ guild: "growers", amount: 20 }],
      hint: "Place any small flowers within 12 blocks of Marigold's camp (they need dirt or grass under them). Dawn is the end of the night, just before and after sunrise.",
    },
  ],
};

/** @type {Story} */
const TAMSIN = {
  id: "w_tamsin_storm",
  title: "Catch the Lightning",
  short: "Catch Lightning",
  giver: "w_tamsin",
  kind: "wander",
  tones: ["heroic", "funny", "exploration"],
  summary: "A storm-chaser out in the thunder wants to catch lightning in a bottle, and keeps very nearly doing it.",
  chapters: [
    {
      id: "rod",
      title: "Lightning in a Bottle",
      camp: { prefab: "camp_peak", near: "wanderer" },
      intro: [
        `A woman in a soaked coat is laughing at the sky, her hair standing straight up.\n\n${TA}Tamsin Galeward! Storm-chaser! Don't stand next to me, I'm very conductive today.`,
        `${TA}I want to catch lightning. Properly. I need copper for my rods, and one rod set up here, on high ground, where the sky can find it. I'll camp right here.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Tamsin 6 copper ingots", npc: "w_tamsin", item: "minecraft:copper_ingot", count: 6 },
        { type: "place", label: "Place a lightning rod by Tamsin's camp", blocks: ["minecraft:lightning_rod"], count: 1, place: "camp:tamsin", radius: 12 },
      ],
      outro: [
        `${TA}Look at it! Gleaming! Asking for it! Oh, the sky's going to love that.\n\nShe pats the rod like a horse.`,
        `${TA}Next thunderstorm, come and stand watch with me. It'll be the best night of your life or the last. Kidding! Mostly.`,
      ],
      reward: { levels: 3, crowns: 35 },
      hint: "Copper ingots come from copper ore, smelted. A lightning rod takes three copper ingots. Place it within 12 blocks of Tamsin's camp.",
    },
    {
      id: "watch",
      title: "Storm Watch",
      intro: [
        `${TA}Here's the plan. Thunderstorm comes. We stand out in it. Lightning hits the rod. I write it all down. Nobody gets cooked.`,
        { text: `${TA}And if a real storm cell rolls in, the big spinning kind, chase it! I'll want to hear everything.`, when: { "pack:storm_bp": "on" } },
        { text: `${TA}My gran said storms used to ring a bell out over the harbor. Somebody shut it up for good, I hear. Shame. I'd have liked to hear it in a gale.`, when: { "drowned_bell.bell": "silence" } },
        { text: `${TA}You don't have to wait around for it, either. Ask the almanac when the next storm's due.\n\n§7(/realm:weather_forecast shows when the next thunderstorm comes.)`, when: { "pack:weather_bp": "on" } },
      ],
      objectives: [
        { type: "survive", label: "Keep watch outdoors at Tamsin's camp in a thunderstorm", place: "camp:tamsin", radius: 32, seconds: 90 },
        { type: "event", label: "Optional: get within 64 blocks of a storm cell", events: ["storm_cell"], near: 64, count: 1, optional: true, bonus: { levels: 2, crowns: 25 }, when: { "pack:storm_bp": "on" } },
      ],
      outro: [
        "The storm comes in like a wall. Rain, wind, and then a crack so loud you feel it in your boots: the rod glows blue-white for an instant and the air smells like a struck match.",
        `${TA}DID YOU SEE THAT? Did you SEE that? I'm writing it down. I can't feel my fingers. Best night ever!`,
      ],
      reward: { levels: 4, crowns: 45 },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "Only a thunderstorm counts, and only outdoors with open sky above you, within 32 blocks of Tamsin's camp. Sleeping skips storms, so stay up when the sky darkens.",
    },
    {
      id: "gale",
      title: "Riding the Gale",
      intro: [
        `${TA}Last thing. My mother taught me to chase storms on horseback. You've never lived until you've galloped in front of thunder.`,
        `${TA}Ride with me. A long way. Then climb up somewhere high and wave at the clouds. They like that.`,
      ],
      objectives: [
        { type: "ride", label: "Ride a horse 400 blocks", mobs: ["minecraft:horse", "minecraft:donkey", "minecraft:mule"], distance: 400 },
        { type: "reach", label: "Climb above height 130 and wave at the clouds", aboveY: 130 },
      ],
      outro: [
        `${TA}You've got it now. The storm-chaser's grin. Can't wipe it off, can you?`,
        `${TA}I'll be out there, wherever the thunder is. Look for the woman with her hair standing up. And bring copper.`,
      ],
      reward: { levels: 8, crowns: 115, title: "Galeward's Second", relicRoll: ROLL, codex: { id: "w_tamsin", title: "Catch the Lightning", text: "Tamsin Galeward chases thunderstorms on horseback, the way her mother taught her. She keeps a notebook of every lightning strike she has ever caught on a rod, and claims she has never once been cooked. Her hair says otherwise." } },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "Tame a horse (keep mounting it) and ride: the distance counts while you're riding. Height 130 is a tall hill or a tower.",
    },
  ],
};

/** @type {Story} */
const VESK = {
  id: "w_vesk_home",
  title: "The Long Way Home",
  short: "Way Home",
  giver: "w_vesk",
  kind: "wander",
  tones: ["sad", "dangerous", "happy"],
  summary: "A gaunt man in the Nether's heat has been there for years, and wants to go home.",
  chapters: [
    {
      id: "out",
      title: "Bread from Home",
      camp: { prefab: "camp_ruin", near: "watchtower" },
      intro: [
        `A gaunt man in scorched leather crouches by the netherrack, watching you with red-rimmed eyes.\n\n${VE}Vesk. Just Vesk. They took the rest of my name when they sent me down here. It was a long time ago. I think.`,
        `${VE}I didn't do it. What they said. It doesn't matter now. What matters is I've found the way out, and I'm too scared to take it alone.`,
        `${VE}Meet me where the old watchtower stands, up there in the green. I'll make camp. Bring bread. Real bread. I've forgotten what it tastes like.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Vesk 6 bread at his camp by the Ruined Watchtower", npc: "w_vesk", item: "minecraft:bread", count: 6 },
        { type: "deliver", label: "Bring Vesk a flint and steel, for his fire", npc: "w_vesk", item: "minecraft:flint_and_steel", count: 1 },
      ],
      outro: [
        "Vesk eats the first loaf slowly, with his eyes closed. Then he cries, quietly, with his face in his hands. Then he eats the second one much faster.",
        `${VE}Grass. I'm sitting on grass. I'd forgotten it was soft.`,
      ],
      reward: { levels: 3, crowns: 40 },
      hint: "Vesk's camp is next to the Ruined Watchtower in the Overworld: the tracker points to it once you're back. Bread takes three wheat; flint and steel takes iron and flint.",
    },
    {
      id: "ash",
      title: "Ash in the Lungs",
      intro: [
        `${VE}The heat's still in me. My chest is full of ash. I cough all night.`,
        `${VE}Sit with me at dusk, would you? I don't like the dark coming on alone. And catch me fish. Fresh fish, from cold water. I dreamed of it every night down there.`,
      ],
      objectives: [
        { type: "vigil", label: "Sit with Vesk at dusk", place: "camp:vesk", radius: 10, seconds: 60, timeOfDay: DUSK },
        { type: "fish", label: "Catch 3 fish for Vesk", items: ["minecraft:cod", "minecraft:salmon"], count: 3 },
      ],
      outro: [
        `The sun goes down red, and Vesk watches it the whole way. When it's gone, he lets out a long breath that doesn't end in a cough.\n\n${VE}That's the first one I didn't hate.`,
        `${VE}One more thing. Then I think I'll be home.`,
      ],
      reward: { levels: 3, crowns: 45, skill: { skill: "fishing", amount: 40 } },
      hint: "Dusk is the end of the day, as the sun sets. Stay within 10 blocks of Vesk's camp. Raw cod or salmon count, caught with a rod.",
    },
    {
      id: "name",
      title: "A Name Given Back",
      intro: [
        `${VE}My mother planted a tree for every child. Mine was an oak. I suppose it's gone.`,
        `${VE}Plant me a new one, here by the camp. Then sleep, somewhere safe. I'll keep watch. I've kept watch for years; I'm good at it. And in the morning, I'll tell you my whole name.`,
      ],
      objectives: [
        { type: "place", label: "Plant a sapling by Vesk's camp", blocks: SAPLINGS, count: 1, place: "camp:vesk", radius: 10 },
        { type: "sleep", label: "Sleep while Vesk keeps watch" },
      ],
      outro: [
        `In the morning, Vesk is sitting by the sapling with his hands around his knees.\n\n${VE}Vesk Aldermoor. That's my name. Vesk Aldermoor, of the Aldermoors by the river. Say it once, so somebody has.`,
        { text: `${VE}You're kind. People down there said kindness was a thing you lose. You didn't lose yours.`, when: { "g:mercy": ">=3" } },
        "You say it. He nods, and something in his face settles, the way a house settles when everyone is finally home.",
      ],
      reward: { levels: 8, crowns: 120, title: "Homeward Friend", relicRoll: ROLL, codex: { id: "w_vesk", title: "The Long Way Home", text: "Vesk Aldermoor was sent to the Nether for something he swears he didn't do, and lived there for years in the heat and the ash. He found the way out but was too frightened to take it alone. Now he sits by a young oak next to the old watchtower, and anyone who asks gets to hear his whole name." } },
      rep: [{ guild: "miners", amount: 20 }],
      hint: "Any sapling counts, planted on dirt or grass within 10 blocks of Vesk's camp. Then sleep in a bed at night, anywhere.",
    },
  ],
};

/** @type {Story} */
const HOB = {
  id: "w_hob_tales",
  title: "Hob's Tall Tales",
  short: "Hob's Tales",
  giver: "w_hob",
  kind: "wander",
  tones: ["funny", "cozy", "happy"],
  summary: "A chatty tinker mends pots on the road and owes a story to half the traders in the land.",
  chapters: [
    {
      id: "pots",
      title: "Pots and Pans",
      camp: { prefab: "camp_road", near: "wanderer" },
      intro: [
        `A round man with a pack full of clanking pots waves both arms at you.\n\n${HO}Hob Fairweather! Tinker, mender, teller of tales, all three at once if you're not careful!`,
        `${HO}Bad news, good friend: I'm out of iron for rivets and clay for patches, and every pot from here to the sea has a hole in it. Bring me some and I'll set up shop right here.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Hob 4 iron ingots", npc: "w_hob", item: "minecraft:iron_ingot", count: 4 },
        { type: "deliver", label: "Bring Hob 6 clay balls", npc: "w_hob", item: "minecraft:clay_ball", count: 6 },
      ],
      outro: [
        `${HO}Rivets! Patches! Oh, happy pots!\n\nHe mends three of them while telling you a story about a duck, a duke and a misunderstanding, and you don't follow any of it, and you laugh anyway.`,
      ],
      reward: { levels: 2, crowns: 30, items: [{ item: "minecraft:bucket", amount: 1 }] },
      hint: "Iron ingots are smelted from iron ore. Clay balls come from clay blocks, found in shallow water and lush caves. Hob's camp is where you met him.",
    },
    {
      id: "mule",
      title: "The Donkey Who Wouldn't",
      intro: [
        `${HO}My donkey left me. Ran off with a better tinker, I expect. Can't blame her. Any donkey will do, mind; they're all much the same, and all of them better company than me.`,
        `${HO}Bring one to camp on a lead, and a chest for its back, so I can carry more pots. More pots, more stories!`,
      ],
      objectives: [
        { type: "lead", label: "Bring a donkey to Hob's camp on a lead", mob: "minecraft:donkey", to: { place: "camp:hob", radius: 8 } },
        { type: "deliver", label: "Bring Hob a chest for the donkey", npc: "w_hob", item: "minecraft:chest", count: 1 },
      ],
      outro: [
        `${HO}She's beautiful. Look at those ears! I'll call her Duchess. That's a callback, to the duck story. You'll understand one day.`,
      ],
      reward: { levels: 3, crowns: 40 },
      rep: [{ guild: "growers", amount: 10 }],
      hint: "Donkeys roam plains and savannas. A lead takes string and a slimeball. Walk the donkey into Hob's camp, then give him a chest.",
    },
    {
      id: "tale",
      title: "A Tale for Quill",
      intro: [
        `${HO}I owe Quill the trader a story. Owed him for years. He lent me a pot once and I paid him in a tale, and the tale was so bad he says I still owe him.`,
        { text: `${HO}Is he still in the cells, after that business with the Choir? Then tell him through the bars. A story's a story.`, when: { "g:quill": "exposed" } },
        { text: `${HO}They say he did the town a quiet turn against the Choir. Doesn't surprise me. Quill always paid his debts, even mine.`, when: { "g:quill": "trusted" } },
        `${HO}Go and tell him Hob's coming, would you? Then come back and answer me a riddle. If you can answer it, it's good enough for Quill.`,
      ],
      objectives: [
        { type: "talk", label: "Tell Quill that Hob is coming", npc: "quill" },
        { type: "answer", label: "Answer Hob's riddle", npc: "w_hob", question: `${HO}What has a bottom at the top, a hole in its middle, and goes to every house but never comes inside?`, answers: ["a pot", "pot", "a cooking pot", "a pan", "pan", "a bucket", "bucket", "a cauldron", "cauldron", "a road", "road", "the road", "a path", "path", "the path"] },
      ],
      outro: [
        `${HO}A pot! Of course a pot! Everything's a pot, if you look at it right. Quill's going to hate it.`,
        `${HO}Take this, for all your trouble. And if you ever need a story, find the man with the clanking pack.`,
      ],
      reward: { levels: 8, crowns: 100, title: "Teller of Tales", relicRoll: ROLL, codex: { id: "w_hob", title: "Hob's Tall Tales", text: "Hob Fairweather mends pots on the road and pays his debts in stories, most of them about a duck, a duke and a misunderstanding. He owes Quill the trader one good tale, and has owed it for years. He has a donkey named Duchess. That's a callback." } },
      rep: [{ guild: "growers", amount: 20 }],
      hint: "Quill is one of the townsfolk (/realm:npc shows where). Then go back to Hob's camp. A riddle about something every house has and every tinker mends.",
    },
  ],
};

/** The Recurring Wanderers' chains. @type {Story[]} */
export const STORIES = [PELL, ANWEN, BRANNOCH, ROOK, MARIGOLD, TAMSIN, VESK, HOB];
