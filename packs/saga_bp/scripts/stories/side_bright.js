// Story content: see docs/STORY_BIBLE.md. Written by the side_bright writer: the five bright side
// questlines (Wren's animals, Sol's cats, Tobin's turtles and fish, Bea's kitchen).
// Keep every id (story, chapter, choice) when editing: players' progress is saved by them.
//
// Dish deliveries (Hearth and Table): the Cooking pack's dishes are checked by their custom `name`
// only (the base item differs per dish), so those objectives carry `name` and no `item`.
// Chapters that ask for dishes also offer "the old way" (vanilla food) through the `way` flag,
// so the questline still works for a player who hasn't found the kitchen yet.
/** @typedef {import("../types.js").Story} Story */

const W = "§eWren:§r ";
const BE = "§eBea:§r ";
const S = "§eSol:§r ";
const T = "§eTobin:§r ";
const R = "§eReyes:§r ";
const E = "§eElsie:§r ";
const MO = "§eMoss:§r ";
const BR = "§eBram:§r ";
const Q = "§eQuill:§r ";

const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);
const LATE_NIGHT = /** @type {[number, number]} */ ([18000, 23000]);
const RING = { "drowned_bell.bell": "ring" };
const SILENCE = { "drowned_bell.bell": "silence" };
// Hearth and Table's two ways, chosen in "Rations for the Wardens". The new kitchen's dishes exist only while the
// Kitchen pack (cooking_bp) is installed: a player who chose it and then lost the pack gets the old way's steps
// (NO_KITCHEN), appended at the end of each chapter's objectives so saved progress keeps its indexes.
const KITCHEN = { way: "kitchen", "pack:cooking_bp": "on" };
const OLD_WAY = { way: "old" };
const NO_KITCHEN = { way: "kitchen", "pack:cooking_bp": "off" };
/** An old-way page, for the old way and for a new-kitchen player without the Kitchen pack. @param {string} text */
const plain = (text) => [
  { text, when: OLD_WAY },
  { text, when: NO_KITCHEN },
];
/** Old-way steps again for a new-kitchen player without the Kitchen pack (see NO_KITCHEN). @param {any[]} list */
const noKitchen = (list) => list.map((o) => ({ ...o, when: NO_KITCHEN }));
// Champion's Hearts drop only when the Kitchen pack and the Champions pack (elite_bp) are both installed.
const HEARTS = { "pack:cooking_bp": "on", "pack:elite_bp": "on" };

/** Every wooden fence (Bedrock ids). */
const FENCES = [
  "minecraft:oak_fence",
  "minecraft:spruce_fence",
  "minecraft:birch_fence",
  "minecraft:jungle_fence",
  "minecraft:acacia_fence",
  "minecraft:dark_oak_fence",
  "minecraft:mangrove_fence",
  "minecraft:cherry_fence",
  "minecraft:bamboo_fence",
  "minecraft:pale_oak_fence",
  "minecraft:crimson_fence",
  "minecraft:warped_fence",
];

/** Every candle (Bedrock ids). */
const CANDLES = [
  "minecraft:candle",
  ...["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"].map(
    (c) => `minecraft:${c}_candle`,
  ),
];

/** @type {Story} */
const LOST_LAMBS = {
  id: "lost_lambs",
  title: "Wren's Lost Lambs",
  short: "Lost Lambs",
  giver: "wren",
  kind: "side",
  tones: ["adorable", "happy", "funny"],
  summary: "Wren's animals keep escaping, and she has a name for every single one of them.",
  chapters: [
    {
      id: "clover",
      title: "Clover Wanders Off",
      intro: [
        `§eWren§r skids to a stop in front of you, out of breath, with hay in her hair.\n\n${W}Have you seen a lamb? Small, white, one black ear, answers to Clover, except she doesn't answer, she never answers, she just eats things!`,
        `${W}I counted them this morning and there were eleven, and then I counted again and there were ten, and I counted four more times to be sure and it was ten every time. Ten is not eleven. I checked.`,
        `${W}I heard bleating out past the old fields, that way. But I can't leave the others, because Pudding will eat the fence if nobody watches him, and Pudding is a goat, so he really will.`,
        `${W}Please bring her home to the meadow? You need a lead. Rope, on the neck, gently. She likes it if you say her name in a nice voice. She won't come, but she likes it.`,
        `${W}Oh, and if she sits down, she's not being difficult. She's thinking. She thinks a lot. Mostly about flowers. Just wait, and then tug a tiny bit, and say "Clover, please." That one works sometimes.`,
      ],
      objectives: [
        {
          type: "lead",
          label: "Lead Clover the lamb home to Wren's Meadow",
          mob: "minecraft:sheep",
          name: "Clover",
          spawnAt: { offset: { x: -170, z: 130 }, mark: "Bleating", radius: 6 },
          to: { place: "meadow", radius: 10 },
        },
      ],
      outro: [
        `Clover trots into the meadow as if she planned the whole trip, walks straight past Wren, and starts eating a flower.\n\n${W}CLOVER. You are in so much trouble. You are the most trouble. Come here and be hugged.`,
        `${W}She was all the way out by the old fields? That's so far for legs that short! You were so brave, Clover. And you too. Mostly Clover, though. She's very small.`,
        `${W}Here, these are from the good apple tree, the one Pudding hasn't found yet. Please don't tell Pudding. Can you come back tomorrow? Or now? Now is also good.`,
      ],
      reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:apple", amount: 6 }, { item: "minecraft:lead", amount: 2 }] },
      hint: "Clover is about 200 blocks southwest of world spawn; the tracker points to the bleating. Tie a lead on her (craft one from 4 string and a slime ball, or buy one from a wandering trader) and walk her back to Wren's Meadow.",
    },
    {
      id: "cows",
      title: "Ten Hungry Cows",
      intro: [
        `${W}Okay, don't panic, but the cows are being dramatic. Buttercup, Moo Two, Big Steve, Little Steve, Duchess, Biscuit, Biscuit Two, Pancake, Admiral and Kevin. Kevin is the loud one.`,
        `${W}Elsie says I'm not allowed to feed them out of the inn's flour bin anymore, which is SO unfair because they love it, but fine, fine, fine. They need wheat. Real wheat. Lots of it.`,
        `${W}Feed ten of them for me? You hold the wheat out and they come running. It's the best thing in the whole world. They make a happy noise. Kevin makes a very loud happy noise.`,
        { text: `${W}Mara says you kept the big map on her shelf so the wild places stay wild. I think that's right. Cows like wild places. Kevin especially. Kevin is a wild cow at heart.`, when: { "last_map.map": "keep" } },
        { text: `${W}Mara hung your big map in the square! I found the meadow on it. Somebody drew a little cow there. It was me. I drew the cow. Don't tell Mara.`, when: { "last_map.map": "share" } },
        `${W}And then tell Elsie the cows are fed, so she stops checking the flour bin every five minutes. She thinks I don't see her. I see her.`,
      ],
      objectives: [
        { type: "tend", label: "Feed wheat to 10 cows", mobs: ["minecraft:cow"], item: "minecraft:wheat", count: 10 },
        { type: "talk", label: "Tell Elsie the cows are fed", npc: "elsie" },
      ],
      outro: [
        "The cows crowd around you as if you were the most famous person in the world. Somewhere in the middle of the herd, Kevin makes a sound like a foghorn with feelings.",
        `${W}See? SEE? That's the happy noise! And Elsie said thank you. She said "tell your friend the flour bin thanks them too." I don't think a flour bin can thank people. Maybe it can.`,
        `${W}You're really good with animals. Most grown-ups just pat them like a table. You pat them like a cow. That's the right way.`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cookie", amount: 8 }] },
      hint: "Hold wheat and use it on a cow. Any ten cows count, in Wren's Meadow or anywhere else. Wheat grows from seeds on tilled dirt near water. Elsie is at the inn; the tracker points to her.",
    },
    {
      id: "cat",
      title: "A Name for a Cat",
      intro: [
        `${W}There's a cat. It lives under the hay shed and it comes out at night and it looks at me like I owe it money. Every animal in the meadow has a name except the cat. It's a scandal.`,
        `${W}I tried to name it myself, but every name I pick, it looks at me even worse. So I think the cat wants someone else to pick. Someone with good taste. You have good taste. I can tell from your boots.`,
        `${W}You need a name tag. Write the name on it at an anvil, then come to the meadow at night when the cat comes out, and put the tag on it. Or on any cat that likes you. Which name should we try?`,
      ],
      introChoices: [
        { id: "biscuit", label: "Biscuit", set: { cat: "biscuit" }, reply: [`${W}Biscuit! Oh, wait, I already have a cow called Biscuit. And a Biscuit Two. Okay, it's fine. It's a strong name. It can be shared.`] },
        { id: "pounce", label: "Sir Pounce", set: { cat: "pounce" }, reply: [`${W}SIR Pounce. Like a knight. A knight who sleeps nineteen hours a day. That's what knights do, probably.`] },
        { id: "moonpie", label: "Moonpie", set: { cat: "moonpie" }, reply: [`${W}Moonpie. Oh. Oh, that's so good. I'm going to cry. I'm not crying. It's the hay.`] },
      ],
      objectives: [
        { type: "vigil", label: "Wait for the cat in Wren's Meadow at night", place: "meadow", radius: 16, seconds: 60, timeOfDay: NIGHT },
        { type: "tend", label: "Put a name tag on a cat", mobs: ["minecraft:cat"], item: "minecraft:name_tag", count: 1 },
      ],
      outro: [
        { text: "The cat looks at the tag. It looks at you. It looks at the tag again. Then it sits down, wraps its tail around its feet, and accepts the name Biscuit as if it had been waiting all its life.", when: { cat: "biscuit" } },
        { text: "The cat looks at the tag. It looks at you. Then it lifts its chin, the way a knight lifts a visor, and accepts the title of Sir Pounce with tremendous dignity.", when: { cat: "pounce" } },
        { text: "The cat looks at the tag. It looks at you. Then it rolls over onto its back, all four paws in the air, and becomes Moonpie forever, right there in the dirt.", when: { cat: "moonpie" } },
        `${W}It purred! Did you hear it purr? It has NEVER purred at me. I'm a little jealous. No, I'm not. Yes, I am. It's fine. It's a good name and that's what matters.`,
        `${W}I'm writing it in my book. Look, here's the page: all the animals, with drawings. The cat's drawing is just a big angry circle right now, but I'll fix it.`,
      ],
      reward: { levels: 3, crowns: 25, items: [{ item: "minecraft:cod", amount: 6 }] },
      hint: "Name tags come from fishing, dungeon and mineshaft chests, and librarian or wandering trader trades. Rename the tag at an anvil, then use it on a cat (stray cats live in villages). The vigil only needs you in Wren's Meadow at night for a minute.",
    },
    {
      id: "pup",
      title: "The Pup in the Dark",
      intro: [
        `${W}Something is crying in the woods. Not a person crying. A little yip-yip crying. I went to look and then it got dark and there were skeletons, rattling, so I ran. I'm not a coward. I'm twelve.`,
        `${W}I think it's a wolf pup, all alone. Wolves aren't scared of anything, and they HATE skeletons, but a pup is too small to fight them. It just stands there yipping at them. Bravely.`,
        `${W}Can you go at night and chase off the skeletons? Then make friends with the pup. Wolves like bones. Not in a scary way. In a snack way.`,
        { text: `${W}Reyes says you're practically a warden since you hushed the drowned bell. So skeletons should be easy for you. She said that. Mostly. She said "mostly."`, when: SILENCE },
        { text: `${W}Tobin says the bell sings the boats home now, because of you. Maybe you can sing the pup home too. Do you sing? You don't have to sing.`, when: RING },
      ],
      objectives: [
        { type: "defeat", label: "Drive off 6 skeletons at night", mobs: ["minecraft:skeleton"], count: 6, night: true },
        { type: "tame", label: "Tame a wolf with bones", mobs: ["minecraft:wolf"], count: 1 },
      ],
      outro: [
        "The pup sniffs the bone, sniffs your hand, and decides that you are its whole family now. It follows you home so closely that it trips over your heels twice.",
        `${W}Oh. Oh no. Oh no, it's perfect. Look at its feet. It has such big feet for a small dog. That means it's going to be enormous. Do you hear that? You're going to be ENORMOUS.`,
        `${W}It's yours now, you know. Wolves pick one person, and it picked you. You have to give it a name, and tell me the name, and I have to approve it. I'm joking. I approve all names. Except Kevin. Kevin is taken.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:bone", amount: 8 }] },
      hint: "Skeletons spawn in the dark; any 6 defeated at night count. Wolves live in forests and taigas: hold a bone and use it on one until red hearts appear. Any wolf counts, pup or grown.",
    },
    {
      id: "armadillo",
      title: "The Armadillo Who Wouldn't",
      intro: [
        `${W}I read in a book that wolves can wear armor. ARMOR. Little dog armor. Your wolf needs armor. It's not up for discussion. I've already decided.`,
        `${W}You make it from armadillo scutes, which are like their shell flakes, and you get them by brushing an armadillo. Gently. They hate running and loud noises, so don't run. Walk like a cloud.`,
        `${W}Armadillos live where it's hot and dry and flat, out in the savannas and the red badlands. You'll need a brush: a feather, a copper ingot and a stick. And patience. I don't have patience. You do.`,
        `${W}If one rolls up, just stand still and wait. They peek. When they peek, that's when you know they trust you a little bit. That's the best part of anything, when something trusts you a little bit.`,
      ],
      objectives: [
        { type: "tend", label: "Brush 2 armadillos", mobs: ["minecraft:armadillo"], item: "minecraft:brush", count: 2 },
        { type: "deliver", label: "Bring Wren 6 armadillo scutes", npc: "wren", item: "minecraft:armadillo_scute", count: 6 },
      ],
      outro: [
        `${W}Six! Six scutes! You brushed an ARMADILLO. Was it soft? It looks crunchy. Was it crunchy? Don't tell me. I want to imagine it.`,
        `She runs off to Ida's forge and comes back an hour later with a small, perfect suit of wolf armor and soot on her nose.\n\n${W}Ida helped. Ida said "hmph." That's Ida for "I love it."`,
        `${W}She also said, and I'm quoting, "Tell your friend the brush work was clean." Ida has never said anything nice about anybody's work ever. I'm going to write it on the wall. In big letters.`,
        `${W}Go put it on your wolf! Then come and show me! Then do it again so I can watch! He's going to be the safest dog in the whole world. Safer than Reyes. Don't tell Reyes.`,
      ],
      reward: { levels: 4, crowns: 35, items: [{ item: "minecraft:wolf_armor", amount: 1 }] },
      hint: "Armadillos live in savannas and badlands. Craft a brush (feather, copper ingot, stick), walk up slowly (they roll up if you sprint near them), and use the brush on them: each brushing drops a scute. A brush lasts about 4 brushings, so bring two.",
    },
    {
      id: "turnip",
      title: "The Carrot Bandit",
      intro: [
        `${W}Someone has been stealing carrots from the inn garden and Bea is FURIOUS. She says she's going to find the thief and make him into a pie. I think she means it as a joke. I'm almost sure.`,
        `${W}The thing is, I know who it is. It's Turnip. Turnip is a pig. He's my pig. He learned to open the garden gate with his nose, and now he's out there somewhere with a belly full of carrots and no regrets.`,
        `${W}Get him back before Bea finds him! He's quick when he's guilty. Bribe a few pigs with carrots first so you know the trick, then find Turnip and walk him home fast. Bea's sharpening a knife. It's for onions. Probably.`,
        `From the inn kitchen, a voice like a ship's horn: "I CAN HEAR YOU, WREN. TELL YOUR PIG HIS DAYS ARE NUMBERED."`,
      ],
      objectives: [
        { type: "tend", label: "Bribe 3 pigs with carrots", mobs: ["minecraft:pig"], item: "minecraft:carrot", count: 3 },
        {
          type: "lead",
          label: "Lead Turnip home before Bea finds him (5 minutes once he's tied)",
          mob: "minecraft:pig",
          name: "Turnip",
          spawnAt: { offset: { x: 220, z: -80 }, mark: "Carrot crumbs", radius: 6 },
          to: { place: "meadow", radius: 10 },
          within: 300,
        },
      ],
      outro: [
        "Turnip trots into the meadow with a carrot top still stuck to his snout. He looks at Wren. He looks at you. He does not look sorry.",
        `§eBea§r arrives a minute later, apron flapping, holding a wooden spoon like a sword.\n\n${BE}THAT PIG. That pig has eaten forty carrots. FORTY. I counted the stalks!`,
        `${BE}...Fine. Fine! He's got good taste, I'll give him that. Those were my best carrots. Wren, fix that gate. And you, carrot catcher: come see me in the kitchen sometime. I could use quick hands.`,
        `${W}She LIKES you. She never likes anybody. She threw a ladle at Mayor Bram once. A big ladle.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:carrot_on_a_stick", amount: 1 }, { item: "minecraft:golden_carrot", amount: 4 }] },
      hint: "Use a carrot on any 3 pigs. Turnip waits about 230 blocks east of world spawn (the tracker points to the carrot crumbs). Once he's on your lead you have 5 minutes to walk him back to Wren's Meadow, or he slips away and you try again.",
    },
    {
      id: "shed",
      title: "A Shed for Everyone",
      intro: [
        `${W}Okay. Big announcement. I've been thinking, and the reason everyone keeps running away is the shed. It's old and small and it leaks and Pudding ate one of the walls. So they're not running away. They're running TO somewhere better.`,
        `${W}So we need a new shed. A big one. Made of hay, so they can sleep on it and eat it at the same time, which Elsie says is "a design flaw" but I say is efficient.`,
        `${W}Sixteen hay bales, and a proper fence, so nobody escapes. Well. So fewer people escape. Turnip will always escape. Turnip is a free spirit.`,
        { text: `${W}And Brother Hollis said he'll come and bless it! He's been smiling more lately. He says the meadow is the most peaceful place in town. He's right. Except for Kevin.`, when: { "g:hollis": "saved" } },
      ],
      objectives: [
        { type: "place", label: "Build the hay shed: 16 hay bales in Wren's Meadow", blocks: ["minecraft:hay_block"], count: 16, place: "meadow", radius: 16 },
        { type: "place", label: "Mend the paddock: 12 fences in Wren's Meadow", blocks: FENCES, count: 12, place: "meadow", radius: 20 },
      ],
      outro: [
        "The new shed is lopsided and smells wonderful. Every animal in the meadow goes inside at once to inspect it. Clover eats a corner. Nobody runs away. For one whole evening, nobody runs away.",
        { text: "Biscuit the cat claims the highest bale for herself and looks down on everyone, as is her right.", when: { cat: "biscuit" } },
        { text: "Sir Pounce takes the highest bale and guards it all night, like a knight on a castle wall. A very sleepy castle wall.", when: { cat: "pounce" } },
        { text: "Moonpie falls asleep on the highest bale, upside down, with one paw over her face.", when: { cat: "moonpie" } },
        `${W}You found Clover and fed the cows and named the cat and got a wolf and brushed an armadillo and caught Turnip and built a SHED. That's everything. That's literally every animal thing there is.`,
        `${W}So I made you this. It's a badge. I drew it. It says Friend of Every Animal, except it's small, so it says Friend of Every Anim. The rest is on the back. Wear it forever, okay? Okay.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Friend of Every Animal",
        items: [{ item: "minecraft:name_tag", amount: 2 }, { item: "minecraft:saddle", amount: 1 }],
        journal: { entry: "lost_lambs", label: "Wren's Lost Lambs" },
      },
      rep: [{ guild: "growers", amount: 20 }],
      hint: "A hay bale is 9 wheat (16 bales is 144 wheat, so plant a big field or trade with farmer villagers). Any wooden fence counts. Place them near the middle of Wren's Meadow; the tracker points there.",
    },
  ],
};

/** @type {Story} */
const STAR_KITTENS = {
  id: "star_kittens",
  title: "The Star Kittens",
  short: "Star Kittens",
  giver: "wren",
  kind: "side",
  tones: ["adorable", "sad", "cozy"],
  summary: "Wren found a box of seven little collars in the inn's attic. They belong to Sol.",
  requires: { stories: ["act1_signs"] },
  chapters: [
    {
      id: "collars",
      title: "A Box of Collars",
      end: "sol",
      intro: [
        `§eWren§r is sitting on the inn steps holding a dusty wooden box as if it might bite.\n\n${W}Elsie told me to clean the attic and I found this. Seven little collars, with names stitched in. Orion. Castor. Pollux. Cassie. Draco. Ursa. Polaris.`,
        `${W}Elsie went all quiet when she saw it. She said it belongs to Sol, and it belonged to Sol's wife before that, and I should give it back. But Sol always looks so sad when I bring him things. So I'm bringing you, too.`,
        `${W}Will you come? You don't have to say anything. Just stand there being tall. And bring some fish, because there's a note in the box that says "always bring fish," and I don't know why, but I think it's important.`,
      ],
      objectives: [
        { type: "collect", label: "Have 10 raw cod", item: "minecraft:cod", count: 10 },
        { type: "talk", label: "Bring the box of collars to Sol", npc: "sol" },
      ],
      outro: [
        `§eSol§r turns the box over in his hands for a long time. He touches each collar the way he touches a star on a chart.\n\n${S}Adela's cats. My wife. She named them for the constellations, because she said a constellation is only a few friends who agreed to stand together in the dark.`,
        `${S}When she died, they scattered. Cats do. They went where the fish were, and the warm roofs. I let them go. I could not look at Orion without looking for her.`,
        `${S}But it has been years, and the sky is moving strangely, and I find I want my old friends back. Would you find them? Strays come to whoever brings fish. That is what the note means. She wrote it for me. I never listened.`,
      ],
      reward: {
        levels: 2,
        crowns: 25,
        codex: {
          id: "adela",
          title: "Adela of the Seven Cats",
          text: "Sol the Sky-reader was married to Adela, who laughed at his star charts and then learned every one of them by heart. She kept seven cats and named them for the constellations: Orion, Castor, Pollux, Cassie, Draco, Ursa and Polaris. When she died, the cats scattered, and Sol put their collars in a box and gave the box to Elsie, so he would not have to see it.",
        },
      },
      hint: "Raw cod comes from fishing, or from cod swimming in the ocean. Sol is in town; the tracker points to him.",
    },
    {
      id: "twins",
      title: "Orion and the Twins",
      npc: "sol",
      intro: [
        `${S}Orion was the hunter. Big, orange, a notch in one ear. He will be wherever the fishing is best. Castor and Pollux are the twins, gray and grayer. Where one is, the other is close behind.`,
        `${S}A wild cat is as shy as a new star. Approach slowly, hold out raw fish, and wait. When they decide you are kind, they will come home with you. Adela always said every cat is one of hers, once it has been fed.`,
        `§eWren§r bounces in from the doorway.\n\n${W}Villages! Strays live in villages! I've seen them on the roofs. And you need more fish, cats eat SO much fish. I did the math. It's a lot of fish.`,
        `${S}Orion will come first, I think. He always did. He would sit on the chart table while I worked and put one paw on whatever star I was measuring, as if to say: that one, Sol. That one is the important one.`,
      ],
      objectives: [
        { type: "fish", label: "Catch 6 fish with a rod", items: ["minecraft:cod", "minecraft:salmon"], count: 6 },
        { type: "tame", label: "Tame 3 stray cats (Orion and the twins)", mobs: ["minecraft:cat"], count: 3 },
      ],
      outro: [
        "Three cats follow you everywhere now: one big, orange and smug, two gray, identical and in the way. They walk in a line, like a small constellation that has decided where it's going.",
        `${W}ORION. Look at him! He's so big! He looks like a sofa that learned to walk. And the twins! I can't tell them apart. I'm going to tie a ribbon on one. Pollux gets the ribbon. Or Castor. One of them.`,
        `${S}They know you. You can see it in how they sit. Adela would have liked you, I think. She liked anyone the cats liked. It was her only rule.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:cooked_salmon", amount: 6 }] },
      hint: "Stray cats spawn in villages, mostly at night. Hold raw cod or raw salmon, approach slowly and use it on a cat until hearts appear. Any 3 cats count. Fish with a rod anywhere.",
    },
    {
      id: "cassie",
      title: "Cassie on the Roof",
      intro: [
        `${W}Tobin says a cat lives at the top of the lighthouse. A white one, with a dark patch like a crown. That's Cassie! Cassie for Cassiopeia, the queen. Sol says she was always the proudest.`,
        `${W}She sits up there every night and watches the sea, and if anyone climbs up she hisses and climbs higher, and there IS no higher, so she just sits on the edge of the roof and hisses. At the sky.`,
        `${W}So don't go loud. Go at night, get close, and be very, very quiet. Sneak. Like this. No, like this. I'm not good at it. You'll be better.`,
        { text: `${W}And the bell rings at night now, because of you. Tobin says she likes it. She sits and listens to it like it's singing just for her.`, when: RING },
        { text: `${W}Tobin says ever since you hushed the bell, she sleeps better up there. The sea is quiet now. Cats like quiet. So do I. Sometimes.`, when: SILENCE },
      ],
      objectives: [
        { type: "vigil", label: "Sneak and wait quietly at the lighthouse at night", place: "lighthouse", radius: 12, seconds: 60, timeOfDay: NIGHT, sneaking: true },
        {
          type: "meet",
          label: "Win over Cassie at the lighthouse",
          place: "lighthouse",
          radius: 12,
          who: { id: "cassie", name: "Cassie", entity: "minecraft:cat" },
          pages: [
            "A white cat with a dark, crown-shaped patch watches you from the railing. She does not hiss. She does not come closer. She is deciding.",
            "You hold out a piece of fish and say nothing. Cassie looks at the fish, then at the sea, then at you. At last she steps down, takes the fish with great dignity, and lets you scratch her exactly once, behind one ear.",
            "§eCassie:§r Mrrp.",
          ],
          choices: [
            { id: "sit", label: "Sit with her a while", set: { cassie: "sat" }, reply: ["You sit together and watch the moon on the water until she falls asleep against your knee."] },
            { id: "carry", label: "Carry her down", set: { cassie: "carried" }, reply: ["She allows it, but makes it very clear that this was her idea."] },
          ],
        },
      ],
      outro: [
        `${W}She came down? She CAME DOWN? Tobin says she hasn't come down for anyone in three years. Not even for him, and he has the most fish of anybody.`,
        { text: `${W}You sat with her? That's what Adela did, Sol says. She'd just sit, and the cats would come to her. You're doing it the Adela way.`, when: { cassie: "sat" } },
        { text: `${W}You carried her! And she LET you! She bit Tobin once for looking at her. You must smell like a queen's servant. That's a compliment.`, when: { cassie: "carried" } },
        `When you tell §eSol§r, he smiles, really smiles, for the first time you can remember.\n\n${S}Cassie. Still the queen, then. Adela used to say Cassie watched the sea for her. Maybe she was watching for me.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:cod", amount: 8 }] },
      hint: "Go to the lighthouse after dark (the tracker points to it) and sneak (hold the sneak button) within 12 blocks of it for a minute. Cassie appears there: talk to her.",
    },
    {
      id: "draco_ursa",
      title: "Draco and Ursa",
      npc: "sol",
      intro: [
        `${S}Draco is black as the space between stars, and fierce. He brought Adela dead mice as gifts and was offended when she did not eat them. Ursa is the big gentle one, the color of honey. She slept on Adela's feet every night for nine years.`,
        `${S}I do not know where they went. But Adela was certain of one thing: every stray that takes fish from a kind hand is one of hers. So perhaps it does not matter which cats you find. Perhaps it only matters that you find them.`,
        `§eWren§r leans in through the window.\n\n${W}And they need beds! Cats sleep on beds! I asked Elsie and she said not HER beds, so they're going in the meadow shed. With a blanket. And fish. Feed all of them. Cats need so much fish.`,
      ],
      objectives: [
        { type: "tame", label: "Tame 2 more stray cats (Draco and Ursa)", mobs: ["minecraft:cat"], count: 2 },
        { type: "tend", label: "Feed raw cod to 5 of your cats", mobs: ["minecraft:cat"], item: "minecraft:cod", count: 5 },
        { type: "place", label: "Put 2 beds in Wren's Meadow for the cats", blocks: ["minecraft:bed"], count: 2, place: "meadow", radius: 20 },
      ],
      outro: [
        "Two more cats join your parade: a black one with yellow eyes who glares at everyone, and a big honey-colored one who flops onto the first bed she sees and does not move for an hour.",
        `${W}Draco brought me a fish! Off my own plate! He's so generous. And Ursa is asleep on my foot, so I can't move. I live here now. Tell Elsie.`,
        `${S}Draco glared at Adela like that, too, for the first year. Then one winter morning I found him asleep inside her slipper. He pretended it never happened. We all pretended with him. That is what you do for a proud cat.`,
        `${S}Six. Six of seven.\n\nHe looks at the last collar in the box, smaller and more worn than the rest.\n\n${S}Polaris. She was already old when Adela died. I think... I think I know where she went.`,
      ],
      reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:salmon", amount: 8 }] },
      hint: "Tame any 2 more cats (villages have strays), use raw cod on 5 of your tamed cats, and place 2 beds of any color near the middle of Wren's Meadow.",
    },
    {
      id: "polaris",
      title: "Polaris",
      npc: "sol",
      intro: [
        `${S}Polaris was Adela's first cat, long before the others. Small, gray at the muzzle even then. Adela named her for the one star that does not move, because she never, ever left her side.`,
        `${S}On clear nights we climbed to the Stargazer's Ruin, Adela and I, to count meteors. Polaris always came. She sat on the broken wall between us and watched the sky as if she were counting too.`,
        `${S}Wren says the shepherds have seen a gray cat up there. An old one. I cannot climb that hill anymore; my knees are as old as my telescope. Will you go? Go at night. She always liked the night.`,
        `${S}And be gentle. She is very old now. Older than cats should be. I think she has been waiting for someone to come.`,
      ],
      objectives: [
        { type: "reach", label: "Climb to the Stargazer's Ruin", place: "observatory", radius: 16 },
        {
          type: "meet",
          label: "Find Polaris at the Stargazer's Ruin",
          place: "observatory",
          radius: 16,
          who: { id: "polaris", name: "Polaris", entity: "minecraft:cat" },
          pages: [
            "A tiny gray cat sits on the broken wall, exactly where Sol said she would be. Her fur is thin and her eyes are cloudy, but her ears turn toward you before you make a sound.",
            "You show her the last collar. She sniffs it for a long moment. Then she climbs, slowly, into your lap, turns once, settles, and starts to purr like a very small, very tired engine.",
            "Above you the stars come out one by one. Polaris watches them. You think she might be counting.",
          ],
        },
        { type: "vigil", label: "Watch the stars with Polaris", place: "observatory", radius: 16, seconds: 120, timeOfDay: [14000, 23000], outdoors: true, sky: { kind: "shooting_star", on: "done" } },
      ],
      outro: [
        "Near dawn, a meteor crosses the whole sky, long and green and bright. Polaris lifts her head to watch it go. Then she lays her head down on her paws, and sighs, and does not lift it again.",
        "You carry her down the hill wrapped in your coat. She weighs almost nothing. The sky behind you turns pink, then gold, and the one star that never moves fades out last of all.",
        `§eSol§r takes her from you very carefully, the way you would take a sleeping child.\n\n${S}She waited. All those years, up there, in our place. She waited for one of us to come back and watch the sky with her one more time.`,
        `${S}Thank you. I mean it in a way the words are too small for. Thank you for going when I could not.`,
      ],
      reward: { levels: 4, crowns: 40 },
      hint: "The Stargazer's Ruin is the ruined round tower on the highest hill nearby; the tracker points to it. Go at night, find Polaris there, then stay outdoors near her for 2 minutes.",
    },
    {
      id: "same_sky",
      title: "Under the Same Sky",
      npc: "sol",
      end: "wren",
      intro: [
        `${S}Adela is buried in the old graveyard, under the oak. Moss keeps her grave tidy; he always has. I would like Polaris to rest beside her. Moss has already dug a small place. He did not ask. Moss never asks. He just knows.`,
        `${S}Adela loved blue flowers best. Cornflowers, the color of the evening sky before the stars come out. Would you plant some there, for both of them? I will come when I can. I am... slower today.`,
        `${S}And then rest yourself. You have walked a long way for an old man's cats. Sleep, and let the sky keep watch for once.`,
      ],
      objectives: [
        { type: "place", label: "Plant 4 cornflowers at the Old Graveyard", blocks: ["minecraft:cornflower"], count: 4, place: "graveyard", radius: 16 },
        {
          type: "sleep",
          label: "Sleep in a bed",
          vision: [
            { title: "A dream", text: "You are on the hill at the Stargazer's Ruin, but the tower is whole, the dome is clear glass, and the sky is full of stars.", seconds: 5 },
            { text: "A woman with gray in her hair sits on the wall, laughing at something. Seven cats sit around her in the shape of a constellation. The smallest, gray at the muzzle, is curled in her lap.", seconds: 6 },
            { text: "She looks up at you and smiles, as if she knew you would come. \"Tell him to bring fish,\" she says. \"He always forgets.\"", seconds: 6 },
          ],
        },
        { type: "talk", label: "Go and see Wren", npc: "wren" },
      ],
      outro: [
        `§eWren§r is waiting at the meadow shed with her finger to her lips. She points inside.\n\n${W}Shh. Look. Look look look.`,
        "On the bed where Ursa sleeps there is a tangle of honey-colored fur, and inside it, four tiny kittens. One of them is small and gray, with a dark smudge on her nose, and her eyes are just opening.",
        `${W}Sol came and saw her this morning, and he cried, but the happy kind, and he asked if he could name her. He named her Polaris. He said every sky needs one star that stays.`,
        `${W}So it's seven again. The constellation is whole again. That's how it works, Sol says. Stars don't really go out. They just pass the light along.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Keeper of the Seven",
        items: [{ item: "minecraft:name_tag", amount: 1, name: "Polaris", lore: ["Adela's last collar.", "Every sky needs one star that stays."] }],
        journal: { entry: "star_kittens", label: "The Star Kittens" },
        codex: {
          id: "seven_cats",
          title: "The Seven Cats",
          text: "Polaris, the oldest of Adela's cats, waited for years at the Stargazer's Ruin, where Sol and Adela used to count meteors. She died there under the stars, and rests beside Adela under the oak in the old graveyard, among blue cornflowers. Ursa's newest kitten, small and gray, is named Polaris after her.",
        },
      },
      rep: [{ guild: "growers", amount: 15 }],
      hint: "Cornflowers grow in plains and flower forests (or use bone meal on grass). Plant 4 near the Old Graveyard, sleep in any bed at night, then find Wren.",
    },
  ],
};

/** @type {Story} */
const HATCHLINGS = {
  id: "hatchlings",
  title: "Little Turtles",
  short: "Little Turtles",
  giver: "tobin",
  kind: "side",
  tones: ["adorable", "heroic", "cozy"],
  summary: "Old Tobin has found turtle tracks on the beach below the lighthouse, for the first time in forty years.",
  requires: { stories: ["drowned_bell"] },
  chapters: [
    {
      id: "tracks",
      title: "Tracks in the Sand",
      intro: [
        `§eOld Tobin§r is crouched on the sand below the lighthouse, very still, for once not mending anything.\n\n${T}Come here. Quiet. Look at that.`,
        `${T}Turtle tracks. Flippers both sides, belly drag down the middle. First I've seen on this beach in forty years. They stopped coming after the Long Storm. Thought they'd forgotten the way.`,
        { text: `${T}Maybe it's the bell. Rings true now, out over the water. Turtles steer by sound, my grandmother said. Maybe they heard it and remembered home.`, when: RING },
        { text: `${T}Maybe it's the quiet. Since you hushed that bell, the sea's been calm as milk. Maybe they felt it and decided it was safe to come back.`, when: SILENCE },
        `${T}Look around the beach for me. Tracks, nests, anything. My eyes aren't what they were. And if you see anything that wants those eggs, you tell me.`,
      ],
      objectives: [
        { type: "reach", label: "Go down to the beach below the lighthouse", place: "lighthouse", radius: 24 },
        {
          type: "inspect",
          label: "Search the beach below the lighthouse",
          place: "lighthouse",
          radius: 32,
          clues: [
            { dx: 6, dz: 4, text: "Flipper tracks, deep and fresh, run up from the water's edge and stop at a little hollow scooped out of the sand." },
            { dx: -5, dz: 7, text: "A nest. Four white eggs, half buried, warm from the sun. Someone has smoothed sand over them very carefully. Turtles, or Tobin." },
            { dx: 9, dz: -6, text: "Footprints. Not flippers: feet, dragging, toes turned the wrong way. They circle the nest twice, then wander off toward the dunes." },
            { dx: -8, dz: -4, text: "A rotten scrap of cloth caught on a bush. It smells like a zombie. It smells like a zombie that was very interested in eggs." },
          ],
        },
      ],
      outro: [
        `${T}Zombies. Course it is. Zombies go for turtle eggs like Mayor Bram goes for pie. Stomp them flat out of spite.`,
        `${T}Four eggs. Four. Those take days to hatch, and every night the dead will come shuffling down the sand to crush them.`,
        `${T}So we guard them. You and me. Well. You. I'll supervise. I'm very good at supervising. Come back at dusk with your sword.`,
        `${T}And bring a light. A torch or two on the sand helps. Not much. The dead don't mind the light like spiders do. But it helps me see what I'm shouting at.`,
      ],
      reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:cooked_cod", amount: 6 }] },
      hint: "Go to the lighthouse (the tracker points to it) and walk around the beach nearby. Faint particles mark each clue; stand close to one to read it.",
    },
    {
      id: "long_night",
      title: "The Long Night on the Sand",
      intro: [
        `§eTobin§r has dragged a crate down to the sand and sits on it with a lantern and a flask of cocoa, like a man settling in for a show.\n\n${T}There you are. Sun's going. They'll come soon.`,
        `${T}Zombies don't like water, but they love eggs. They'll come down from the dunes in twos and threes. Don't let one stand on that nest. One stomp and it's done. Turtle eggs crack like a bad promise.`,
        `${T}And stay till the night's mostly through. They come in a rush, then in a trickle, and it's the trickle that gets you. My brother used to say that about mackerel. Works for zombies too.`,
        `${T}I've got cocoa. You get some when you're done. That's how guarding works.`,
        { text: `${T}Bell's quiet tonight. Just the tide moving the clapper, soft. Listen. You can hear it under the waves. Makes it feel like somebody's keeping watch with us.`, when: RING },
        { text: `${T}No bell tonight, and no bell ever, thanks to you. Just the waves. I used to hate a quiet beach. Now I don't mind it. Funny what forty years does.`, when: SILENCE },
      ],
      objectives: [
        {
          type: "defend",
          label: "Guard the turtle nest from the dead",
          place: "lighthouse",
          radius: 24,
          waves: [
            { mobs: ["minecraft:zombie"], count: 4 },
            { mobs: ["minecraft:zombie", "minecraft:husk"], count: 5 },
            { mobs: ["minecraft:zombie", "minecraft:zombie_villager_v2"], count: 6 },
          ],
        },
        { type: "vigil", label: "Keep watch on the beach deep into the night", place: "lighthouse", radius: 32, seconds: 180, timeOfDay: NIGHT, outdoors: true },
      ],
      outro: [
        "The last zombie goes down in the surf. The beach is quiet except for the waves. Behind you, Tobin has fallen asleep sitting up, the flask in his lap, snoring like a foghorn.",
        "You check the nest. Four eggs, all whole. And one of them, if you put your ear right down by the sand, is making the smallest tapping sound.",
        `§eTobin§r wakes with a snort.\n\n${T}Was I asleep? I was resting my eyes. Supervising with my eyes closed. Eggs all right? Good. Good. Have your cocoa. You earned it, and I drank half.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:cookie", amount: 8 }] },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "Be at the lighthouse beach after dark. Waves of zombies come for the nest: defeat them all while staying within 24 blocks. Then stay outdoors there for 3 minutes of night.",
    },
    {
      id: "fence",
      title: "A Fence and a Wait",
      intro: [
        `${T}Can't sit on that beach every night forever. My back says no, and my back is the boss. We need a fence. A proper one, all the way round, so nothing on two legs gets near.`,
        `${T}Turtle eggs hatch when they're ready, not when you are. Two days, three. You can't hurry them. You can only keep the dead off and wait. Most of fishing's the same.`,
        `${T}And bring seagrass. When they hatch they'll be hungry and tiny, and they'll head straight for the water. I want the shallows full of good green weed for them. Shears on seagrass, off the sea floor.`,
        { text: `${T}Mara's map, the one in the square, has this beach marked as a turtle beach now. Somebody drew a little turtle on it. Wasn't me. Might have been me.`, when: { "last_map.map": "share" } },
      ],
      objectives: [
        { type: "place", label: "Fence in the nest: 12 fences by the lighthouse", blocks: FENCES, count: 12, place: "lighthouse", radius: 24 },
        { type: "collect", label: "Have 16 seagrass", item: "minecraft:seagrass", count: 16 },
        { type: "wait", label: "Wait two days for the eggs to hatch", days: 2 },
      ],
      outro: [
        "On the morning of the third day you come down to the beach and the nest is moving. The sand lifts and falls, like something breathing underneath.",
        "Then a tiny gray head pushes out into the light. Then another. Then four little turtles, no bigger than your palm, blink at the sun as if it were the most surprising thing in the world.",
        `${T}There. There they are.\n\nThe old man's voice is rough.\n\n${T}Forty years. Hello, little ones. Welcome back.`,
        "The four hatchlings sit in a row at the edge of the nest, blinking. The smallest one tries to climb over the others, falls on his back, and waves his flippers at the sky until Tobin, very gently, turns him the right way up with one finger.",
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Any wooden fence counts; place 12 within 24 blocks of the lighthouse. Seagrass needs shears: use them on seagrass growing on the sea floor. Then wait two in-game days.",
    },
    {
      id: "run",
      title: "The Run to the Sea",
      intro: [
        `${T}Now the hard part. Hatchlings run for the sea all at once, by moonlight, and everything that's hungry knows it. Drowned come up out of the shallows. Spiders come down out of the dune grass.`,
        `${T}One of them's the runt. Smallest of the four. I've been calling him Pebble. Don't tell anyone. He's slow. If one of them doesn't make it, it'll be him. Watch Pebble.`,
        `${T}Get them down the beach and into the water. Then swim out with them, past the drop-off, where the water goes deep and blue. After that, they belong to the sea.`,
        `${T}Go on. I'll be here. I'll be shouting. Shouting helps. Ask anyone who's ever been shouted at by me.`,
      ],
      objectives: [
        {
          type: "defend",
          label: "Protect Pebble and the hatchlings on their run to the sea",
          place: "lighthouse",
          radius: 24,
          ward: { id: "pebble", name: "Pebble", entity: "minecraft:turtle" },
          waves: [
            { mobs: ["minecraft:drowned"], count: 4 },
            { mobs: ["minecraft:drowned", "minecraft:spider"], count: 6 },
          ],
        },
        { type: "reach", label: "Swim out past the drop-off with them (dive below height 50)", place: "lighthouse", radius: 96, belowY: 50 },
      ],
      outro: [
        "Down in the blue, four small shapes paddle ahead of you. Then they turn, all four, as if to look back. Then they're gone into the green dark, small and sure, and the sea closes over them like a door.",
        `When you climb back up the sand, dripping, Tobin is standing at the waterline with his hat in his hands.\n\n${T}All four? Pebble too? ...Good. That's good. That's very good.`,
        `${T}Turtles come home to the beach they were born on. Twenty years, thirty, they'll come back here to lay their own. Long after me. Maybe long after you. But they'll come back. Because of tonight.`,
        `${T}I'll keep the fence up. Every summer. Somebody will have to, after me. Might as well be you. You've got the knack. You've got the patience. And you don't snore on the job, which is more than I can say.`,
      ],
      reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:potion", amount: 1, name: "Tobin's Flask", lore: ["Still has some cocoa in it.", "(It's water.)"] }] },
      hint: "Be at the lighthouse beach, ideally at night. Waves of drowned and spiders come for Pebble, the smallest hatchling: keep him alive and defeat every wave. Then swim out from the beach and dive below height 50 (turn on Show Coordinates in the world settings).",
    },
    {
      id: "where_they_go",
      title: "Where the Turtles Go",
      intro: [
        `${T}I've a confession. I followed them. In the boat, this morning, just a little way out. Couldn't help it. They went west along the coast, the four of them, past the point.`,
        `${T}And there's more out there. Big ones. Grown turtles, a whole herd, grazing on the weed beds, like they'd been waiting offshore all this time for someone to make the beach safe.`,
        `${T}Row out along the coast, a good long way. I want you to see them. And take seagrass for the big ones. Feed them by hand. They'll remember you. Turtles remember everything.`,
        { text: `${T}Folk talk about you, you know. Kind, they say. Stops for the small things. Takes time with old fools. I told them they're right.`, when: { "g:mercy": ">=3" } },
      ],
      objectives: [
        { type: "ride", label: "Row a boat 300 blocks along the coast", mobs: ["minecraft:boat", "minecraft:chest_boat"], distance: 300 },
        { type: "tend", label: "Feed seagrass to 4 turtles", mobs: ["minecraft:turtle"], item: "minecraft:seagrass", count: 4 },
      ],
      outro: [
        "Far along the coast the water is full of turtles: big old ones with barnacled shells, grazing as slowly as cows. One of them, enormous and ancient, swims right up to your boat and looks you in the eye for a long, slow moment.",
        `${T}That one, you saw him? That's a granddad. Older than me, maybe. Might have hatched on our beach, before the storm. Might have been waiting out there all this time to bring the little ones home.`,
        `${T}Here. Turtle shell. Found it on the beach the year before the storm. My brother and I meant to give it to a hero someday, when we met one. Took me a while. But I met one.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Turtle Guardian",
        items: [{ item: "minecraft:turtle_helmet", amount: 1 }],
        journal: { entry: "hatchlings", label: "Little Turtles" },
        codex: {
          id: "turtle_beach",
          title: "The Turtle Beach",
          text: "Sea turtles nested on the beach below the lighthouse every summer until the Year of the Long Storm, then never came again. Forty years later, the year the harbor bell was dealt with, they returned. Four eggs hatched under the player's guard. Tobin says turtles always come home to the beach where they hatched, no matter how long it takes.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "Any boat counts; row 300 blocks in total. Turtles live on warm beaches and in the shallows; hold seagrass and use it on 4 of them.",
    },
  ],
};

/** @type {Story} */
const ONE_THAT_GOT_AWAY = {
  id: "one_that_got_away",
  title: "The One That Got Away",
  short: "Got Away",
  giver: "tobin",
  kind: "side",
  tones: ["happy", "funny", "heroic"],
  summary: "Old Tobin swears he once hooked the biggest fish in the sea. Nobody believes him.",
  chapters: [
    {
      id: "this_big",
      title: "A Fish This Big",
      intro: [
        `§eOld Tobin§r holds his hands apart. Then a little further. Then he gets up and walks backward to make it wider still.\n\n${T}This big. Bigger. Old Gnasher. Biggest fish in the sea, and I had him on my line.`,
        `${T}Summer before the Long Storm. Me and my brother, out past the point. Line goes tight as a fiddle string. The boat turns all the way round. Something with eyes like two green lanterns looks up at us out of the deep.`,
        `${T}Fought him an hour. Then the line snapped and he was gone, and my brother laughed so hard he fell in. Nobody believes me. Ask Elsie. She'll say she's heard it four hundred times. That's not a no.`,
        `${T}I'm too old to catch him now. You're not. But first I need to know you can fish. Real fishing. Show me your rod hand.`,
        `${T}Cod, salmon, whatever bites. Puffers too, if you're unlucky. Don't eat the puffers. My brother ate a puffer once to win a bet. Won the bet. Lost the afternoon.`,
      ],
      objectives: [
        { type: "fish", label: "Catch 8 fish with a rod", items: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"], count: 8 },
        { type: "talk", label: "Ask Elsie if Tobin's story is true", npc: "elsie" },
      ],
      outro: [
        `When you asked §eElsie§r, she laughed until she had to wipe her eyes with her apron.\n\n${E}Old Gnasher? Oh, love. Four hundred is generous. It's closer to six hundred. And the fish gets longer every winter.`,
        `${E}But I'll tell you something he won't. His brother came in that night soaked to the skin, laughing, and swore to the same thing. Two men don't tell the same lie that well. Not those two.`,
        `${T}Six hundred? She's counting wrong. Anyway. Good catch. Your rod hand's not hopeless. We'll make a fisher of you yet.`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cooked_cod", amount: 8 }] },
      hint: "Fish with a rod in any water; any 8 fish count. Elsie is at the inn; the tracker points to her.",
    },
    {
      id: "night_waters",
      title: "Night Waters",
      intro: [
        `${T}Gnasher's a night fish. Lantern eyes, see. A fish doesn't grow lanterns to sit about in daylight.`,
        `${T}Take your rod down to the lighthouse after midnight. Sit on the rocks. Fish the black water. And listen. Night fishing's half listening. The sea tells you things at night it won't say in daylight.`,
        `${T}You won't catch him tonight. Nobody catches Gnasher the first night. But he'll know you're there. That's how you start with a fish like him. You introduce yourself.`,
        { text: `${T}Listen for the bell while you're out there. It's a good sound to fish by. My brother would have loved it.`, when: RING },
        { text: `${T}Sea's been so quiet since the bell went dead. Good for fishing. Fish don't like noise any more than I do.`, when: SILENCE },
      ],
      objectives: [
        { type: "vigil", label: "Keep a night watch at the lighthouse after midnight", place: "lighthouse", radius: 24, seconds: 120, timeOfDay: LATE_NIGHT, outdoors: true },
        { type: "fish", label: "Catch 5 fish", count: 5 },
      ],
      outro: [
        "Around two in the morning, something huge passes under your line. You don't see it. You feel it: the float dips, the water bulges, and a cold current swirls around your bobber, as if the sea took a deep breath.",
        "Then, far out, just for a moment, two pale green lights blink under the water. Slowly. Like something looking. Then they're gone.",
        `${T}Green? You saw green? Hah! HAH! Elsie, did you hear that? Green lights! Six hundred times, she says!\n\nTobin does a small dance, which you were not prepared for.`,
        `${T}Forty years, everybody's smiled at me the way you smile at a man who talks to gulls. Tonight I'm going to the inn, and I'm going to order the biggest supper on the board, and I'm going to tell the story. Six hundred and one.`,
      ],
      reward: { levels: 3, crowns: 30 },
      hint: "Be outdoors within 24 blocks of the lighthouse between midnight and dawn for 2 minutes. The 5 fish can be caught anywhere, night or day.",
    },
    {
      id: "stinkbait",
      title: "Bea's Stinkbait",
      end: "bea",
      intro: [
        `${T}Gnasher won't take worms. Won't take cod. He's seen it all. We need bait so foul it's an insult to the sea. And there's only one person in town who can make a smell like that on purpose.`,
        `${T}Bea. Ship's cook, twenty years on the salt. Made a stinkbait once that cleared the harbor of gulls for a week. Go and ask her. Ask nicely. Then duck.`,
        `§eBea§r slams a cleaver into her cutting board when she hears the name.\n\n${BE}GNASHER? That old fish story? Tobin's been chasing that tale since I had both my eyebrows! Fine. FINE. You want stinkbait? You'll get stinkbait.`,
        `${BE}Rotten flesh, eight. Spider eyes, two, for the zing. Glow berries, six, so it shines in the deep. Bring it all and keep your nose shut, sailor. I mean that literally.`,
        `${BE}And don't you dare tell Tobin what's in it. A fisherman who knows his bait is a fisherman who argues with his bait. I've seen grown men argue with a bucket for an hour. On a ship. In a storm.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Bea 8 rotten flesh", npc: "bea", item: "minecraft:rotten_flesh", count: 8 },
        { type: "deliver", label: "Bring Bea 2 spider eyes", npc: "bea", item: "minecraft:spider_eye", count: 2 },
        { type: "deliver", label: "Bring Bea 6 glow berries", npc: "bea", item: "minecraft:glow_berries", count: 6 },
      ],
      outro: [
        "Bea mixes it in a bucket outside, at arm's length, with a clothes peg on her nose. The smell rolls over the inn garden like fog. A passing chicken faints. Turnip the pig, hiding in the carrots, runs home on his own.",
        `${BE}THERE. Bea's Famous Stinkbait. Glows green in the dark, smells like a shipwreck's armpit. If that fish has a nose, he's yours. If he doesn't, he'll grow one just to be offended.`,
        `${BE}And come back here when you've caught him. I want to see this fish. And then I want to cook this fish. Fair's fair.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:glow_berries", amount: 4, name: "Bea's Stinkbait", lore: ["Smells like a shipwreck.", "Glows in the deep."] }] },
      hint: "Rotten flesh drops from zombies, spider eyes from spiders, and glow berries grow on cave vines in lush caves. Bea is in the inn kitchen; deliver everything to her.",
    },
    {
      id: "rain",
      title: "Rain on the Water",
      intro: [
        `${T}Rain. That's the secret. My brother said so, and I didn't listen, and I've had forty years to think about it. Gnasher comes up in the rain. Rain on the water sounds like food falling.`,
        `${T}Next time it rains, take Bea's bait down to the lighthouse and stay out in it. Get wet. Proper wet. Fishers who stay dry don't catch legends.`,
        `${T}Catch a few salmon while you're out there; they run in the rain. And watch for the green lights. If he comes up close, don't strike. Not yet. Let him smell the bait. Let him get curious.`,
        { text: `${T}My knee says rain's coming. The almanac says when. Trust the almanac. My knee lies.\n\n§7(/realm:weather_forecast shows when the next rain comes.)`, when: { "pack:weather_bp": "on" } },
        { text: `${T}Quill came by asking about Gnasher. Wanted to sell tickets to watch. I told him where to put his tickets. Then I bought three.`, when: { "g:quill": "trusted" } },
        { text: `${T}Reyes asked me if Gnasher's real. Said she'd heard enough tall tales from Quill to last a lifetime, and now she checks every story twice. Told her to come watch. She said she might. That's Reyes for yes.`, when: { "g:quill": "exposed" } },
      ],
      objectives: [
        { type: "survive", label: "Stay out in the rain at the lighthouse", place: "lighthouse", radius: 32, seconds: 120, weather: "rain" },
        { type: "fish", label: "Catch 3 salmon", items: ["minecraft:salmon"], count: 3 },
      ],
      outro: [
        "The rain is hammering the water flat when the green lights come up, closer than ever. Close enough to see the shape around them: long, armored, spiked, as big as a boat. It circles your bobber once. Twice. Then it sinks away, slow and thoughtful.",
        `${T}Spikes? It had spikes?\n\nHe sits down hard.\n\n${T}It did. It did have spikes. I'd forgotten. My brother called him the Pincushion. We laughed about it all the way home.`,
        `${T}He's curious now. Next time he'll bite, and when he bites, he'll fight. He's not a fish that gets caught, you understand. He's a fish that decides to be caught. Or doesn't.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:cooked_salmon", amount: 6 }] },
      hint: "Wait for rain (a thunderstorm counts), then stay outdoors within 32 blocks of the lighthouse for 2 minutes. Salmon bite in rivers and oceans; any 3 caught with a rod count.",
    },
    {
      id: "gnasher",
      title: "Old Gnasher",
      intro: [
        `${T}Today. I can feel it in my knees, and my knees have never once been wrong about a fish. Well. Once. Twice. Today, though.`,
        `${T}He'll come up near the lighthouse, in the deep water off the rocks. When he bites, he won't just pull. He'll come at you. He's armored and he's mean and he's older than the harbor wall. That's why nobody's ever landed him.`,
        `${T}Bring a sword as well as a rod. And something to breathe with. And if he wins... well, he won't. You're too stubborn. I can tell. Takes one to know one.`,
        `§eWren§r appears out of nowhere, as Wren does.

${W}Is it today? Is it the fish day? Everyone's going to the pier. Bea's bringing a pan. Elsie's bringing a blanket. I'm bringing Clover. Clover doesn't know what's happening, but she wants to be there.`,
        `${T}Beat him fair and bring me a spike off his back. That's all I ask. I just need my brother to have been right.`,
      ],
      objectives: [
        {
          type: "defeat",
          label: "Land Old Gnasher in the deep water by the lighthouse",
          place: "lighthouse",
          radius: 48,
          count: 1,
          champion: {
            tag: "realm:saga:old_gnasher",
            mob: "minecraft:guardian",
            name: "Old Gnasher",
            warn: "Two green lights rise out of the deep. The water around the lighthouse goes very still.",
            health: 60,
            adds: { mobs: ["minecraft:pufferfish"], count: 4 },
          },
        },
        { type: "collect", label: "Bring back 3 of his spikes (prismarine shards)", item: "minecraft:prismarine_shard", count: 3 },
      ],
      outro: [
        "You come up out of the water with three green spikes in your fist, and every fisher in town is on the pier, and Bea, and Elsie, and Wren on someone's shoulders. They saw the whole fight from the docks. The cheering goes on a long time.",
        `§eTobin§r turns the spikes over and over in his old hands. Then he laughs, the big helpless kind, until he has to sit down on a crate.\n\n${T}This big. I told them. THIS big. Six hundred times!`,
        `${BE}Well? Where's the FISH? I've got the pan hot! I've got butter! I've got LEMONS, do you know how hard lemons are to come by?\n\n${T}You're not cooking a legend, Bea. Make chowder like a normal person.`,
        { text: `The harbor bell rings out over the water, all on its own, one long happy note. Tobin looks out at it and nods, as if someone had said something only he could hear.`, when: RING },
        `${T}For you. My brother's sea rod, the one he fought Gnasher with. Kept it forty years in case someone came along who deserved it. Go on. Catch something worth lying about.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Angler of Legend",
        items: [{ item: "minecraft:fishing_rod", amount: 1, name: "The Brother's Rod", lore: ["Old Tobin's brother fished with this.", "It has caught a legend."] }],
        journal: { entry: "one_that_got_away", label: "The One That Got Away" },
        codex: {
          id: "old_gnasher",
          title: "Old Gnasher",
          text: "The summer before the Long Storm, Old Tobin and his brother hooked a fish with eyes like green lanterns and fought it for an hour before the line snapped. Tobin told the story about six hundred times and nobody believed him. Forty years later it rose again off the lighthouse rocks: a huge old guardian, spiked like a pincushion. This time it was landed.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 20 }],
      hint: "Swim out into deep water within 48 blocks of the lighthouse; Old Gnasher, a champion guardian, rises there. Bring a sword, armor and water breathing. Guardians drop prismarine shards: you need 3, from him or any guardian.",
    },
  ],
};

/** @type {Story} */
const HEARTH_AND_TABLE = {
  id: "hearth_and_table",
  title: "Hearth and Table",
  short: "Hearth and Table",
  giver: "bea",
  kind: "side",
  tones: ["cozy", "happy", "funny", "sad"],
  summary: "Bea the cook needs a kitchen hand. She is loud about it.",
  chapters: [
    {
      id: "tryouts",
      title: "Tryouts",
      intro: [
        `§eBea§r is shouting at a pot when you walk into the inn kitchen. The pot is losing.\n\n${BE}YOU! I've heard about you. Runs errands, fights drowned, doesn't complain. Good. Stand there. No, THERE. Out of the steam.`,
        `${BE}I need a kitchen hand. My last one quit to become a sailor, because he said it would be "calmer." Calmer! I was a ship's cook for twenty years, sailor. The sea is a bathtub next to a dinner rush.`,
        `${BE}So. Tryouts. Bring me eggs, sugar, and a cake you made with your own two hands. A real cake. Not a sad flat thing. If I can see my face in the frosting, you're hired. If I can't, you're still hired, but I'll yell.`,
        `${BE}A kitchen's like a ship, sailor. Everybody pulls their rope, or everybody sinks with the soup.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Bea 6 eggs", npc: "bea", item: "minecraft:egg", count: 6 },
        { type: "deliver", label: "Bring Bea 6 sugar", npc: "bea", item: "minecraft:sugar", count: 6 },
        { type: "deliver", label: "Bake Bea a cake", npc: "bea", item: "minecraft:cake", count: 1 },
      ],
      outro: [
        "Bea holds the cake up to the light. She turns it. She sniffs it. She cuts a slice with a cleaver, eats it in one bite, and chews for a very long time with her eyes closed.",
        `${BE}...Hm. HM. Crumb's a bit tight. Frosting's honest. You didn't burn the bottom. Sailor, that is a cake I'd serve to a captain. Don't let it go to your head. Heads swell like dough.`,
        `${BE}You're hired. Now listen. There's a new kind of kitchen going round the realm: proper cooking, dishes that DO things for you, not just fill you up. Find out how it works. I'll want real dishes from you soon. With NAMES.`,
        `${BE}And eat something before you go. You look like a plank. No kitchen hand of mine walks around looking like a plank. Here. Sit. Pie. No, don't argue. The pie has already decided.`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:pumpkin_pie", amount: 4 }] },
      hint: "Chickens lay eggs; sugar comes from sugar cane. A cake is 3 buckets of milk, 2 sugar, 1 egg and 3 wheat at a crafting table. Deliver everything to Bea in the inn kitchen. The Cooking pack's kitchen (see /realm:help) makes the named dishes later chapters ask for.",
    },
    {
      id: "rations",
      title: "Rations for the Wardens",
      end: "reyes",
      intro: [
        `${BE}Reyes's wardens are living on hardtack and spite. You can't guard a town on hardtack, sailor. A warden marches on her stomach, and right now those stomachs are marching in circles.`,
        `${BE}So we feed them. Proper food, warm and filling and enough to go round twice. You'll carry it out to Reyes yourself, because I'm not leaving my stove for anybody. Not even the mayor. ESPECIALLY not the mayor.`,
        `${BE}And mind yourself out there. Good cooking smells carry, and the dead have noses. They'll come shuffling after you like gulls after a trawler. Carry with one hand, swing with the other.`,
        `${BE}Reyes came in here last week to ask if I had "anything at all" left over. ANYTHING AT ALL. Like a stray dog. The captain of the wardens. I nearly threw a pot at the wall. I didn't. The pot was full.`,
        `${BE}Now. Have you got that new kitchen working, or are we doing this the old way?`,
      ],
      introChoices: [
        {
          id: "kitchen",
          label: "The new kitchen",
          set: KITCHEN,
          // Its dishes come only from the Kitchen pack: without it, the old way is the only way.
          requires: { flags: { "pack:cooking_bp": "on" } },
          reply: [`${BE}Good! Then I want Warden's Rations, four of them, cooked proper. They keep a warden on her feet all night. Name on every one, so Reyes knows who to thank.`],
        },
        {
          id: "old",
          label: "The old way",
          set: OLD_WAY,
          reply: [`${BE}Ha! Nothing wrong with the old way. Steak and bread, a heap of each, no fancy names. My grandmother fed a whole crew like that. Figure out the new kitchen when you can, though. I'll be asking.`],
        },
      ],
      objectives: [
        // Dishes from the Cooking pack: `name` is what the delivery checks.
        { type: "deliver", label: "Bring Reyes 4 Warden's Rations", npc: "reyes", name: "Warden's Ration", count: 4, when: KITCHEN },
        { type: "deliver", label: "Bring Reyes 12 steak", npc: "reyes", item: "minecraft:cooked_beef", count: 12, when: OLD_WAY },
        { type: "deliver", label: "Bring Reyes 12 bread", npc: "reyes", item: "minecraft:bread", count: 12, when: OLD_WAY },
        { type: "defeat", label: "Fend off 10 zombies drawn by the smell", mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:zombie_villager_v2"], count: 10 },
        ...noKitchen([
          { type: "deliver", label: "Bring Reyes 12 steak", npc: "reyes", item: "minecraft:cooked_beef", count: 12 },
          { type: "deliver", label: "Bring Reyes 12 bread", npc: "reyes", item: "minecraft:bread", count: 12 },
        ]),
      ],
      outro: [
        `§eWarden Reyes§r opens the basket, breathes in, and for a moment the captain of the wardens looks about nine years old.\n\n${R}Is that... hot food? Actual hot food? For us?`,
        { text: `${R}Bea's rations. Labeled and everything. One of my wardens ate half of one and walked the whole wall twice without stopping. I'm putting in a standing order.`, when: KITCHEN },
        ...plain(`${R}Steak and bread. Simple. Honest. Food you can eat with one hand while the other holds a shield. That woman understands soldiers.`),
        `${R}My night watch has been eating hardtack so old it has its own rank. Tell Bea she has my gratitude. Tell her I'll stop letting the recruits steal her pies. That's an order. Mostly.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:arrow", amount: 16 }] },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "Reyes is at the warden post; the tracker points to her. Warden's Rations come from the Cooking pack's kitchen. The old way: steak is raw beef cooked in a furnace or smoker, bread is 3 wheat. Any 10 zombies count, day or night.",
    },
    {
      id: "chowder",
      title: "Chowder for the Docks",
      end: "tobin",
      intro: [
        `${BE}The fishers go out before dawn, come back after dark, and eat whatever's in their pockets, which is usually lint. It breaks my heart, sailor. It also breaks my rules. Nobody in this harbor eats lint on my watch.`,
        `${BE}So: chowder. Harbor chowder, the way we made it on the Saltwife, my old ship. Fish, potatoes, whatever the sea gives you, and a stubborn amount of pepper. Catch the fish yourself. Bought fish is a lie.`,
        `${BE}Then take it down to Old Tobin on the docks. He'll pretend he isn't hungry. He's always hungry. He just hates admitting he needs anything. Men and boats, sailor. Men and boats.`,
        { text: `${BE}And give him a Fisherman's Breakfast while you're at it. He's been up every night chasing some fish story. A man can't fight a legend on an empty stomach.`, when: KITCHEN },
      ],
      objectives: [
        { type: "fish", label: "Catch 8 fish with a rod", count: 8 },
        // Dishes from the Cooking pack: `name` is what the delivery checks.
        { type: "deliver", label: "Bring Tobin 2 Harbor Chowders", npc: "tobin", name: "Harbor Chowder", count: 2, when: KITCHEN },
        { type: "deliver", label: "Bring Tobin a Fisherman's Breakfast", npc: "tobin", name: "Fisherman's Breakfast", count: 1, when: KITCHEN },
        { type: "deliver", label: "Bring Tobin 2 rabbit stews", npc: "tobin", item: "minecraft:rabbit_stew", count: 2, when: OLD_WAY },
        ...noKitchen([{ type: "deliver", label: "Bring Tobin 2 rabbit stews", npc: "tobin", item: "minecraft:rabbit_stew", count: 2 }]),
      ],
      outro: [
        `§eOld Tobin§r looks at the bowl as if it might be a trick.\n\n${T}I'm not hungry.\n\nHe eats the whole thing in under a minute, then scrapes the bowl with his finger.`,
        { text: `${T}...Pepper. Too much pepper. Exactly the right amount of too much pepper. That's ship's chowder, that is. The Saltwife's chowder. Haven't had it in thirty years.`, when: KITCHEN },
        ...plain(`${T}...Rabbit. Bea's grandmother's stew, if I know it. Not chowder, but it'll keep a man afloat. I've had worse on better days.`),
        `${T}Tell Bea... tell her thank you. No. Tell her it was adequate. She'll know what I mean. She always knows what I mean, that woman. It's very annoying.`,
        `Back at the inn, when you pass on the message, Bea goes very quiet and pink, then bangs a pot so hard the windows rattle. "ADEQUATE," she bellows. "Did you hear that, everyone? ADEQUATE!" She is smiling for the rest of the day.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:bowl", amount: 4 }, { item: "minecraft:baked_potato", amount: 8 }] },
      hint: "Fish anywhere with a rod. Harbor Chowder and Fisherman's Breakfast come from the Cooking pack's kitchen. The old way: rabbit stew is cooked rabbit, a carrot, a baked potato, a mushroom and a bowl. Tobin is on the docks; the tracker points to him.",
    },
    {
      id: "marta",
      title: "A Feast for Marta",
      end: "moss",
      // Lantern Cake is a story recipe in the Kitchen (no one sells it): Bea teaches it here.
      teach: ["lantern_cake"],
      intro: [
        `The kitchen is quiet when you come in. That's the first wrong thing. Bea is sitting on an upturned bucket with her apron in her hands, and she isn't shouting.\n\n${BE}Marta Penhallow died last night. In her sleep. Ninety-one.`,
        `${BE}She ran the bakery for sixty years. Taught me to knead when I was so small I had to stand on a flour sack. When I ran off to sea at sixteen, she packed me a loaf so big it lasted to the first port. Never asked why I was going.`,
        `${BE}Moss is burying her tomorrow evening at the old graveyard, and I'm feeding everyone after. That's what you do. You cook, because your hands have to do something, or your heart does it for them.`,
        `${BE}Pumpkin pie was her favorite. And a cake, a tall one, with lights. She always said a cake should look like a lantern in a window, so people know someone's home. Will you help me, sailor? Quietly, this time.`,
      ],
      objectives: [
        // Dishes from the Cooking pack: `name` is what the delivery checks.
        { type: "deliver", label: "Bring Moss a Lantern Cake for the wake", npc: "moss", name: "Lantern Cake", count: 1, when: KITCHEN },
        { type: "deliver", label: "Bring Moss a cake for the wake", npc: "moss", item: "minecraft:cake", count: 1, when: OLD_WAY },
        { type: "deliver", label: "Bring Moss 3 pumpkin pies", npc: "moss", item: "minecraft:pumpkin_pie", count: 3 },
        { type: "place", label: "Set 6 candles at the Old Graveyard", blocks: CANDLES, count: 6, place: "graveyard", radius: 16 },
        ...noKitchen([{ type: "deliver", label: "Bring Moss a cake for the wake", npc: "moss", item: "minecraft:cake", count: 1 }]),
      ],
      outro: [
        `The whole town comes, more than the graveyard holds. They stand along the fence and out into the road, holding candles. §eMoss§r reads the words in his dry, gentle voice and doesn't make a single joke, which is how you know he loved her too.`,
        { text: "Brother Hollis says the blessing. His voice shakes at first, then steadies. He looks like a man who has finally slept.", when: { "g:hollis": "saved" } },
        `${MO}Marta baked all night, the night of the Long Storm. Did you know that? Every oven in the bakery going till dawn, for the men out searching the water. Forty years ago. Nobody asked her to. She just did.`,
        `Afterward, at the long tables, Bea serves everyone. Her eyes are red and her voice is loud again, and when someone asks for seconds she says "Of COURSE you can have seconds, what am I, a monster?" and everyone laughs, a little wet.`,
        `${BE}Thank you, sailor. She'd have liked you. She'd have said you knead too hard. She said that to everyone.`,
      ],
      reward: {
        levels: 4,
        crowns: 40,
        codex: {
          id: "long_storm_bread",
          title: "The Night of the Long Storm",
          text: "Forty winters ago, in the Year of the Long Storm, the harbor tower fell into the sea and boats were lost. Marta Penhallow, the town baker, kept every oven going all night for the people searching the water, and handed out bread on the docks until dawn. Nobody asked her to. Nobody in town talks much about that night. Bea says that is exactly why somebody should.",
        },
      },
      hint: "Pumpkin pie is a pumpkin, sugar and an egg. A Lantern Cake comes from the Cooking pack's kitchen (the old way: a plain cake). Moss is at the Old Graveyard; place 6 candles of any color within 16 blocks of it.",
    },
    {
      id: "hearts",
      title: "A Champion's Heart",
      intro: [
        `§eBea§r slams a letter on the table so hard the spoons jump.\n\n${BE}"Quill the Trader is pleased to announce the arrival of Chef Marcel Duvanne, of the Grand Kitchens of the Far Coast, for a friendly cook-off. The winner feeds the harvest festival." FRIENDLY!`,
        `${BE}Twenty years I've fed this town. And Quill ships in some fancy-trousers chef with a mustache you could moor a boat to. Fine. He wants a cook-off, he'll get one. He'll tell his grandchildren about it. Through tears.`,
        { text: `${BE}I need what nobody else has. A Champion's Heart: those big ugly champion beasts that roam about drop one when they fall, and it makes a stew that could wake the dead. Two, if you can.`, when: HEARTS },
        // Without the Kitchen or the Champions pack no champion drops a heart: the story brings its own beast.
        { text: `${BE}I need what nobody else has. A champion's heart. There's a spider the size of a cart nesting at the old watchtower, Grandmother Gristle, the wardens call her. Bring her down and the heart's mine. It makes a stew that could wake the dead.`, when: { "pack:cooking_bp": "off" } },
        { text: `${BE}I need what nobody else has. A champion's heart. There's a spider the size of a cart nesting at the old watchtower, Grandmother Gristle, the wardens call her. Bring her down and the heart's mine. It makes a stew that could wake the dead.`, when: { "pack:cooking_bp": "on", "pack:elite_bp": "off" } },
        `${BE}And Storm Eel. Old sailor's secret: any fish pulled out of the water in a thunderstorm tastes of lightning. Get out there in the next storm and fish. Wear something rubber. That's a joke. Mostly.`,
        { text: `${BE}Don't stand there waiting for clouds. The almanac will tell you when the next storm's due. Look it up. Then be at the lighthouse when it comes.\n\n§7(/realm:weather_forecast shows when the next thunderstorm comes.)`, when: { "pack:weather_bp": "on" } },
        { text: `${BE}Oh, and if you're out on a Harvest Moon night, pick me some Harvest Saffron off the ripe crops. A harvest festival dish with harvest saffron in it. Marcel's mustache will fall right off.`, when: { "pack:cooking_bp": "on", "pack:moon_bp": "on" } },
      ],
      objectives: [
        { type: "collect", label: "Get 2 Champion's Hearts from fallen champions", name: "Champion's Heart", count: 2, when: HEARTS },
        { type: "survive", label: "Stay out at the lighthouse in a thunderstorm", place: "lighthouse", radius: 48, seconds: 90, weather: "thunder" },
        { type: "fish", label: "Catch 3 Storm Eels (any fish, best in a storm)", count: 3 },
        {
          type: "deliver",
          optional: true,
          label: "Bring Bea Harvest Saffron",
          npc: "bea",
          item: "minecraft:orange_dye",
          name: "Harvest Saffron",
          count: 1,
          when: { "pack:cooking_bp": "on", "pack:moon_bp": "on" },
          set: { saffron: "yes" },
          bonus: { levels: 1, crowns: 30, items: [{ item: "minecraft:golden_carrot", amount: 4 }] },
          hint: "Harvest Saffron only drops from ripe crops broken during a Harvest Moon (the Kitchen says so in chat when one rises). Bring one to Bea before you finish the chapter.",
        },
        // The story's own champion when no champion drops a heart (two members so a `when` can say "either pack is missing").
        { ...{
          type: "defeat",
          label: "Bring down Grandmother Gristle at the Ruined Watchtower",
          place: "watchtower",
          radius: 40,
          count: 1,
          set: { heart: "gristle" },
          champion: { tag: "realm:saga:gristle", mob: "minecraft:spider", name: "Grandmother Gristle", health: 40, warn: "Something the size of a cart unfolds from the tower stones. Grandmother Gristle!", adds: { mobs: ["minecraft:spider"], count: 2 } },
          hint: "Grandmother Gristle nests at the Ruined Watchtower; the tracker points the way, and she comes out when you get close. Bring a sword, armor and food: two ordinary spiders come with her.",
        }, when: { "pack:cooking_bp": "off" } },
        { ...{
          type: "defeat",
          label: "Bring down Grandmother Gristle at the Ruined Watchtower",
          place: "watchtower",
          radius: 40,
          count: 1,
          set: { heart: "gristle" },
          champion: { tag: "realm:saga:gristle", mob: "minecraft:spider", name: "Grandmother Gristle", health: 40, warn: "Something the size of a cart unfolds from the tower stones. Grandmother Gristle!", adds: { mobs: ["minecraft:spider"], count: 2 } },
          hint: "Grandmother Gristle nests at the Ruined Watchtower; the tracker points the way, and she comes out when you get close. Bring a sword, armor and food: two ordinary spiders come with her.",
        }, when: { "pack:cooking_bp": "on", "pack:elite_bp": "off" } },
      ],
      outro: [
        { text: `${BE}Two hearts! Look at them. Still warm. Don't tell me how, I don't want to know, I just want to cook them.\n\nShe holds one up to the window like a jewel.`, when: { heart: "!gristle" } },
        { text: `${BE}Grandmother Gristle's heart! Look at it. Still warm. Don't tell me how, I don't want to know, I just want to cook it.\n\nShe holds it up to the window like a jewel.`, when: { heart: "gristle" } },
        `${BE}And storm fish! I can smell the lightning on them. That's not a real thing. It's completely a real thing. Don't argue with the cook, sailor. The cook has knives.`,
        { text: `${BE}And SAFFRON. Off a Harvest Moon field. Sailor, I could kiss you. I won't. I'm holding a cleaver.`, when: { saffron: "yes" } },
        `${BE}Now all I need is a secret. Something Marcel Mustache can't buy on the Far Coast. And I know exactly who has one, and she's been hiding it from me for twenty years.`,
        { text: `${BE}And as for Quill. If he thinks he can win a cook-off with a hired mustache, he's dafter than his ledgers. I've known that man since he was selling "genuine dragon eggs" that were painted potatoes. Painted. Potatoes.`, when: { "g:quill": "!exposed" } },
        { text: `${BE}And Quill's doing this from a warden cell, if you can believe it. Booked the chef by letter. Paid in advance, too, the cheek of it. You can lock up a trader, sailor, but you can't lock up the trade.`, when: { "g:quill": "exposed" } },
      ],
      reward: { levels: 4, crowns: 45, items: [{ item: "minecraft:golden_carrot", amount: 6 }] },
      hint: "Champions are the tougher, named monsters that roam the realm; with the Cooking pack installed, each drops a Champion's Heart when it falls. Wait for a thunderstorm and stay outdoors within 48 blocks of the lighthouse for 90 seconds. Any 3 fish count.",
    },
    {
      id: "starwright",
      title: "Elsie's Old Recipe",
      end: "elsie",
      // Starwright Bread is a story recipe in the Kitchen: Elsie hands it over here.
      teach: ["starwright_bread"],
      intro: [
        `${BE}Elsie has a bread. Once a year, on the longest night, she bakes it in the inn's old oven with the shutters down, and the whole street smells of honey and woodsmoke and something I can't name. Twenty years I've begged for that recipe.`,
        `${BE}She won't give it to me. She says it's "family." Well, I'm family! I've burned my arm on her oven a hundred times! Go and ask her. She likes you. Everybody likes you. It's infuriating.`,
        `§eElsie§r is folding napkins by the fire. When you ask, her hands go still.\n\n${E}The star bread. Oh, love. That's an old, old recipe. Older than the inn. Older than the town, if I'm honest.`,
        `${E}My family kept it. We baked it for... for a night that only comes round once in a long while. I suppose it doesn't matter who knows it now. But it's written the old way, as a riddle. You'll have to earn it the way I did.`,
      ],
      objectives: [
        {
          type: "answer",
          label: "Answer Elsie's riddle",
          npc: "elsie",
          question: `${E}My mother taught it to me like this: "I rise without legs, and I'm warm without sun. I am broken for sharing, and gone when I'm done." What am I, love?`,
          answers: ["bread", "a bread", "loaf", "a loaf", "the loaf", "a loaf of bread", "dough", "star bread", "starwright bread"],
        },
        // Dishes from the Cooking pack: `name` is what the delivery checks.
        { type: "deliver", label: "Bake Starwright Bread and bring Elsie a loaf", npc: "elsie", name: "Starwright Bread", count: 1, when: KITCHEN },
        { type: "deliver", label: "Bake it the old way: bring Elsie 6 bread", npc: "elsie", item: "minecraft:bread", count: 6, when: OLD_WAY },
        { type: "deliver", label: "...and 2 honey bottles", npc: "elsie", item: "minecraft:honey_bottle", count: 2, when: OLD_WAY },
        ...noKitchen([
          { type: "deliver", label: "Bake it the old way: bring Elsie 6 bread", npc: "elsie", item: "minecraft:bread", count: 6 },
          { type: "deliver", label: "...and 2 honey bottles", npc: "elsie", item: "minecraft:honey_bottle", count: 2 },
        ]),
      ],
      outro: [
        "Elsie breaks the loaf. It's dark gold, flecked with something that glimmers faintly, and the smell fills the inn: honey and woodsmoke and something cold and clean, like the air on a high hill at night.",
        `${E}There. That's how it should smell. That's how it smelled when I was small. My mother held a slice up to the window so the starlight could see it. Silly old custom.`,
        `${E}Tell Bea she can have it. Tell her to bake it on the longest night, with the shutters closed, and save one slice for the window. She'll think it's a silly custom too. That's all right. Some customs are for remembering, not for understanding.`,
      ],
      reward: {
        levels: 4,
        crowns: 45,
        items: [{ item: "minecraft:honey_bottle", amount: 3 }],
        codex: {
          id: "starwright_bread",
          title: "Starwright Bread",
          text: "Elsie's family recipe, older than the inn and, she says, older than the town. It is baked on the longest night with the shutters closed, and one slice is held up to the window for the starlight. The recipe was passed down as a riddle. Elsie says her family baked it for a night that only comes round once in a long while, and would not say more.",
        },
      },
      hint: "Elsie's riddle has a one-word answer: think of what an innkeeper bakes every morning. Starwright Bread comes from the Cooking pack's kitchen; the old way, bring her plain bread and honey bottles (use a glass bottle on a full beehive).",
    },
    {
      id: "cook_off",
      title: "The Great Cook-Off",
      end: "bram",
      intro: [
        "The whole town has turned out at Wren's Meadow, the only place big enough. Wren has strung bunting between the fence posts. Two cooking fires, two long tables, and Mayor Bram between them on a hay bale, wearing a napkin like a cape and an expression of total joy.",
        { text: `${BE}This is it, sailor. Champion's Heart Stew, a Glow Berry Tart or two, and the Starwright loaf on the side for luck. You did the hunting and the hauling. Today we cook like the ship's sinking and the captain's hungry.`, when: { ...KITCHEN, "pack:elite_bp": "on" } },
        { text: `${BE}This is it, sailor. My grandmother's rabbit stew, a Glow Berry Tart or two, and the Starwright loaf on the side for luck. You did the hunting and the hauling. Today we cook like the ship's sinking and the captain's hungry.`, when: { ...KITCHEN, "pack:elite_bp": "off" } },
        ...plain(`${BE}This is it, sailor. Rabbit stew the way my grandmother made it, and a heap of golden carrots so shiny Bram will need a hat. Plain food, cooked perfectly. That's what wins.`),
        { text: `§eQuill§r leans on the fence, grinning.\n\n${Q}Friendly competition, friend. Good for business. Good for morale. Very good for ticket sales.`, when: { "g:quill": "!exposed" } },
        { text: `A letter came for Bea this morning from the warden lockup, in Quill's handwriting: "Couldn't come. Detained. Enjoy the show. -Q." Reyes stands guard by the chef's table, just in case.`, when: { "g:quill": "exposed" } },
        `${BE}Go and say hello to the competition. Be polite. Then come back and help me crush him like a garlic clove.`,
      ],
      objectives: [
        {
          type: "meet",
          label: "Meet Quill's imported chef at Wren's Meadow",
          place: "meadow",
          radius: 16,
          who: { id: "marcel", name: "Chef Marcel", entity: "minecraft:villager_v2" },
          pages: [
            "A tall man in a very white hat and a very black mustache bows so low his hat nearly falls off.\n\n§eMarcel:§r Ah! Ze famous kitchen hand! Enchante. I am Marcel Duvanne, of ze Grand Kitchens of ze Far Coast. You will lose today, but you will lose to ze best, non?",
            "His mustache slips, just a little, on the left side. He pushes it back up without blinking.\n\n§eMarcel:§r Ze sea air. It is very... sticky, here.",
            "Up close, his apron has a stain shaped like a fish finger, and the tag on his knife roll says: PROPERTY OF MARTY, THIRD STALL FROM THE LEFT, SWEETWATER MARKET.",
          ],
          choices: [
            { id: "quiet", label: "Say nothing (for now)", set: { marcel: "quiet" }, reply: ["You smile politely. Marcel smiles back, a little too widely, and goes to light his fire. It takes him four tries."] },
            { id: "called", label: "\"Nice mustache, Marty.\"", set: { marcel: "called" }, reply: ["Marcel goes very pale. \"Please,\" he whispers, in a completely ordinary voice. \"Not before the judging. My cousin will kill me.\""] },
          ],
        },
        // Dishes from the Cooking pack: `name` is what the delivery checks.
        { type: "deliver", label: "Serve Mayor Bram a Champion's Heart Stew", npc: "bram", name: "Champion's Heart Stew", count: 1, when: { ...KITCHEN, "pack:elite_bp": "on" } },
        { type: "deliver", label: "Serve Mayor Bram 2 Glow Berry Tarts", npc: "bram", name: "Glow Berry Tart", count: 2, when: KITCHEN },
        { type: "deliver", label: "Serve Mayor Bram 2 rabbit stews", npc: "bram", item: "minecraft:rabbit_stew", count: 2, when: OLD_WAY },
        { type: "deliver", label: "Serve Mayor Bram 8 golden carrots", npc: "bram", item: "minecraft:golden_carrot", count: 8, when: OLD_WAY },
        ...noKitchen([
          { type: "deliver", label: "Serve Mayor Bram 2 rabbit stews", npc: "bram", item: "minecraft:rabbit_stew", count: 2 },
          { type: "deliver", label: "Serve Mayor Bram 8 golden carrots", npc: "bram", item: "minecraft:golden_carrot", count: 8 },
        ]),
        // No Champions pack: no hearts to make the stew with, so a plain stew stands in for it.
        { type: "deliver", label: "Serve Mayor Bram 2 rabbit stews", npc: "bram", item: "minecraft:rabbit_stew", count: 2, when: { ...KITCHEN, "pack:elite_bp": "off" } },
      ],
      outro: [
        "§eMayor Bram§r tastes Marcel's dish first. It is a fish finger. A very large fish finger, on a silver plate, with a sprig of parsley. Bram chews politely, then reaches for your bowl.",
        { text: `${BR}Oh. Oh my. Oh, my word. Is this the heart stew? I can feel it in my knees. I can feel it in my HAT. And this tart is glowing, it's actually glowing! Bea, I'm sorry I ever called your gravy "brave."`, when: { ...KITCHEN, "pack:elite_bp": "on" } },
        { text: `${BR}Oh. Oh my. Oh, my word. Rabbit stew, the way my mother made it. And this tart is glowing, it's actually glowing! Bea, I'm sorry I ever called your gravy "brave."`, when: { ...KITCHEN, "pack:elite_bp": "off" } },
        ...plain(`${BR}Oh. Oh my. Now THIS is rabbit stew. The stew my mother made when I had a cold. And these carrots! I can see my face in them! I look wonderful!`),
        `${BR}The winner, by a margin I can only call humiliating, and I say that with love: Bea and her kitchen hand! They feed the harvest festival!\n\nBea lifts you clean off the ground in a hug that smells of pepper and smoke.`,
        { text: `Marcel, or rather Marty, peels off his mustache and sighs.\n\n§eMarty:§r Fair cop. Cousin Quill said nobody here would know a real chef. I do a good fish finger, though. Third stall from the left. Ask anyone.`, when: { marcel: "called" } },
        { text: `Marcel bows deeply to Bea, and his mustache falls off into the parsley. There is a long silence.\n\n§eMarcel:§r ...Marty. It's Marty. I do fish fingers. Cousin Quill said it would be fun.`, when: { marcel: "quiet" } },
        `${BE}A fraud! A FRAUD! In MY meadow!\n\nThen she looks at his sad face, and his sad fish finger, and her shoulders drop.\n\n${BE}...What do we do with him, sailor? You decide. You've earned it.`,
      ],
      choices: [
        {
          id: "hire",
          label: "Give Marty a job in Bea's kitchen",
          set: { marty: "hired" },
          inc: { "g:mercy": 1 },
          rep: [{ guild: "growers", amount: 15 }],
          reply: [`${BE}Fine! FINE. He peels potatoes for a month, and if I catch him gluing anything to his face I'll make HIM into a fish finger. Welcome aboard, Marty. Wipe your feet.`],
        },
        {
          id: "send",
          label: "Send him packing",
          set: { marty: "sent" },
          inc: { "g:iron": 1 },
          rep: [{ guild: "wardens", amount: 15 }],
          reply: [`${BE}Off you go, then, and take your fish finger with you! And tell Cousin Quill that next time he wants a cook-off, he can come and lose in person.`],
        },
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Master of the Hearth",
        items: [{ item: "minecraft:cake", amount: 1 }, { item: "minecraft:golden_carrot", amount: 8 }],
        journal: { entry: "hearth_and_table", label: "Hearth and Table" },
      },
      rep: [{ guild: "growers", amount: 20 }],
      hint: "Wren's Meadow is near world spawn; meet Chef Marcel there. Then serve Mayor Bram: a Champion's Heart Stew and 2 Glow Berry Tarts from the Cooking pack's kitchen, or, the old way, 2 rabbit stews and 8 golden carrots.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [LOST_LAMBS, STAR_KITTENS, HATCHLINGS, ONE_THAT_GOT_AWAY, HEARTH_AND_TABLE];
