// Story content: see docs/STORY_BIBLE.md. Written by the side_dark writer.
// Four side questlines (bible section 8): A Room at the Inn, Graveyard Shift, The Witch's Bargain and
// Lamp in the Window. Keep every id (story, chapter, choice, codex) once published: progress is saved by them.
/** @typedef {import("../types.js").Story} Story */

const E = "§eElsie:§r ";
const BE = "§eBea:§r ";
const T = "§eTobin:§r ";
const B = "§eBram:§r ";
const MO = "§eMoss:§r ";
const H = "§eHollis:§r ";
const V = "§5Vesna:§r ";
const L = "§bLily:§r ";
/** The Herald's voice slipping through Hollis: dark gray italics. @param {string} s */
const HERALD = (s) => `§8§o${s}§r`;

const LILY = { id: "lily", name: "Lily", entity: "minecraft:allay" };
const VESNA = { id: "vesna", name: "Vesna of the Fen", entity: "minecraft:witch" };
const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);
const FLOWERS = [
  "minecraft:poppy",
  "minecraft:dandelion",
  "minecraft:oxeye_daisy",
  "minecraft:cornflower",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:lily_of_the_valley",
  "minecraft:blue_orchid",
];
/** Clear and every stained glass, blocks and panes: any of them mends a window. */
const GLASS = [
  "minecraft:glass",
  "minecraft:glass_pane",
  ...["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"].flatMap((c) => [`minecraft:${c}_stained_glass`, `minecraft:${c}_stained_glass_pane`]),
];
const SILENCE = { "drowned_bell.bell": "silence" };
const RING = { "drowned_bell.bell": "ring" };
const FREE = { "g:vesna": "free" };
const BOUND = { "g:vesna": "bound" };

// ---------------------------------------------------------------------------------------------
// A Room at the Inn (Elsie). Finishing it unlocks the Keeper's Gift ending in Act V.
// ---------------------------------------------------------------------------------------------

/** @type {Story} */
const INN_GHOST = {
  id: "inn_ghost",
  title: "A Room at the Inn",
  short: "Room at the Inn",
  giver: "elsie",
  kind: "side",
  tones: ["creepy", "sad", "eerie"],
  summary: "Room three at the inn is always cold, and the toys in it won't stay where they're put. There are no toys in room three.",
  requires: { stories: ["act1_signs"] },
  chapters: [
    {
      id: "cold_room",
      title: "Room Three",
      npc: "elsie",
      end: "bea",
      intro: [
        `§eElsie§r sets a bowl of stew in front of you before you can say no, then sits down across the table, which she never does.\n\n${E}Eat, love. Then I need a favor, and I'd rather ask it on a full stomach. Yours, not mine.`,
        `${E}Room three. Top of the stairs, the blue door. It's always cold, even in summer, even with the fire lit. Guests ask to move. Last week a trader left in the middle of the night without his boots.`,
        `${E}He said the toys moved. There are no toys in room three. There haven't been for a very long time.\n\nShe smooths her apron, twice.`,
        `${E}Sleep there tonight. Or in your own bed, if you'd rather; the cold seems to find whoever's looking for it. Then tell Bea what you saw. She won't laugh. She's the only one who never laughs at me.`,
      ],
      objectives: [
        {
          type: "sleep",
          label: "Sleep through a night (room three, or any bed)",
          vision: [
            { title: "Room Three", text: "The room is so cold your breath clouds. Moonlight lies on the floorboards. Somewhere close, very softly, a child is humming.", sound: "ambient.cave", seconds: 5 },
            { text: "A little wooden horse on a stick rolls out from under the bed, stops at your feet and tips over, as if someone small has just let go of it.", seconds: 5 },
            { text: "Frost creeps across the window and draws a word, letter by letter, in a careful child's hand: MINE.", seconds: 5 },
          ],
        },
        { type: "talk", label: "Tell Bea the Cook what you saw", npc: "bea" },
      ],
      outro: [
        `§eBea§r doesn't laugh. She puts down her ladle, which is worse.\n\n${BE}Humming? Low and sweet, like a kettle thinking about it? Aye. I hear it from the kitchen most nights. I leave a cup of warm milk on the stair. It's always empty by morning.`,
        `${BE}And it wrote MINE, did it? Bossy little thing. I like her already.\n\nShe lowers her voice.\n\n${BE}Don't tell Elsie I said "her". Elsie goes white as flour when anyone does.`,
        `${BE}Here's the strange part. Toys have been turning up all over town. A whistle on a grave. A ribbon on a gate. Old things. Nobody owns them. Ask Elsie about room three again, and watch her face when you say the word "toys".`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cookie", amount: 8 }] },
      hint: "Any bed works: sleep through one night and the dream comes. Then find Bea the Cook; the tracker points to her once the dream is done.",
    },
    {
      id: "odd_places",
      title: "Toys in Odd Places",
      npc: "elsie",
      intro: [
        `§eElsie§r goes very still when you say the word.\n\n${E}Toys. Yes. Bea told you about the toys.\n\nShe pours two cups of tea and forgets them both.`,
        `${E}If they're turning up again, they'll be at the old graveyard. They always were, the last time. I'd rather not go myself. My knees, you understand.\n\nHer knees are fine. You've seen her carry a cider barrel up the cellar stairs.`,
        `${E}Go at dusk, when the little lights are easy to see. Look along the row by the east fence, the stones without dates. Bring back anything that looks... loved.`,
        { text: `${E}Mara hung your map up in the square, didn't she? Someone keeps pinning a little paper star to its corner. Every morning I take it down. Every morning it's back.`, when: { "last_map.map": "share" } },
        { text: `${E}Mara keeps that map of yours on her shelf, doesn't she? She told me she found a little paper star tucked inside it. She didn't put it there. Neither did I.`, when: { "last_map.map": "keep" } },
      ],
      objectives: [
        { type: "vigil", label: "Wait at the old graveyard at dusk for the little lights", place: "graveyard", radius: 20, seconds: 40, timeOfDay: [11500, 14000] },
        {
          type: "inspect",
          label: "Search the old graveyard for lost toys",
          place: "graveyard",
          radius: 20,
          clues: [
            { dx: 4, dz: -3, text: "A tin whistle lies in a dead bush, green with age. When you pick it up it is warm, as if someone was holding it a moment ago." },
            { dx: -5, dz: 2, text: "A red ribbon is tied in a neat bow to the iron gate. The knot is a child's: two big loops and a hopeful tug." },
            { dx: 2, dz: 5, text: "A hobby horse, a carved wooden head on a broom handle, leans against a stone. Its painted eye has been touched up recently. In charcoal." },
            { dx: -2, dz: -6, text: "Tiny bare footprints in frost, though the night isn't cold. They lead from the gate to one small stone and stop. The stone says only: LILY. SHE LOVED THE STARS." },
          ],
        },
      ],
      outro: [
        "You set the three toys on Elsie's counter: the whistle, the ribbon, the hobby horse. Elsie looks at them for a long time without touching them.",
        `${E}The whistle was mine first. The horse I carved myself, badly; she didn't care. The ribbon came from a fair, and she wouldn't take it off for a month, not even in the bath.`,
        `${E}Her name was Lily. That's all I can say tonight, love. I'm sorry. Keep them for her, would you? Keep them close. She'll want to know where they are.`,
      ],
      reward: {
        levels: 3,
        crowns: 30,
        items: [
          { item: "minecraft:iron_nugget", amount: 1, name: "Lily's Tin Whistle", lore: ["Warm, as if someone just held it."] },
          { item: "minecraft:string", amount: 1, name: "Lily's Red Ribbon", lore: ["Two big loops and a hopeful tug."] },
          { item: "minecraft:stick", amount: 1, name: "Lily's Hobby Horse", lore: ["Its eye was touched up in charcoal."] },
        ],
        codex: {
          id: "inn_ghost_row",
          title: "The Row Without Dates",
          text: "Along the east fence of the old graveyard is a row of stones with names and no dates, all cut the same winter for people the Long Storm took and the sea never gave back. One of them belongs to a girl named Lily, who loved the stars.",
        },
      },
      hint: "The tracker points to the Old Graveyard. Be there around sunset and stay a little while, then tap near the faint particles by the graves to read each clue.",
    },
    {
      id: "sea_kept",
      title: "What the Sea Kept",
      npc: "elsie",
      intro: [
        `§eElsie§r has the three toys lined up on the windowsill of room three when you come in. The room is warmer than you remember.\n\n${E}She had six. Six treasures, she called them, and she counted them every night like a miser. Three came home. Three went into the sea with her.`,
        `${E}A shell from the deep water. A marble she swore was a piece of a star. A paper star she folded herself, the same way every time, and never would teach me.`,
        `${E}The old ones are gone. But there's an old, old saying where I come from: a thing is what it is called. Find her a shell, a bright stone and a sheet of paper, and name them for her at an anvil. Lily's Shell. Lily's Marble. Lily's Paper Star. She'll know them.`,
        `${E}Where I come from? Oh, nowhere you'd know, love. Up the coast. A long way up.\n\nShe busies herself with the curtains.`,
      ],
      objectives: [
        { type: "collect", label: "Have a nautilus shell named Lily's Shell", item: "minecraft:nautilus_shell", count: 1, name: "Lily's Shell" },
        { type: "collect", label: "Have an amethyst shard named Lily's Marble", item: "minecraft:amethyst_shard", count: 1, name: "Lily's Marble" },
        { type: "collect", label: "Have a sheet of paper named Lily's Paper Star", item: "minecraft:paper", count: 1, name: "Lily's Paper Star" },
      ],
      outro: [
        "You lay the three new treasures beside the old ones. For a moment nothing happens. Then the paper turns over all by itself, folded side up, creased into a little star. The way she always folded it.",
        `${E}Oh. Oh, you stubborn little thing. You noticed.\n\nElsie laughs, and then she isn't laughing, and she sits on the edge of the bed for a while.`,
        `${E}She'll come out now. Not here; she never liked to be found where she was hiding. At night, at her stone. Go and sit with her. Gently, love. She doesn't know. She never knew.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:experience_bottle", amount: 4 }] },
      hint: "Rename each item at an anvil (one level each). Nautilus shells come from drowned, fishing treasure or wandering traders; amethyst grows in geodes underground and at the Starfall Crater; paper is crafted from sugar cane.",
    },
    {
      id: "small_hand",
      title: "A Small Cold Hand",
      npc: "elsie",
      intro: [
        `${E}Go after dark. Sit by her stone and be very still. Not sneaking, exactly. Just... small. She was always shy of big people who move about.`,
        `${E}Don't come waving a lantern; she'll think it's me come to put her to bed, and she'll hide. And if she asks for me...\n\nElsie stops. Starts again.\n\n${E}If she asks for me, you tell her whatever you think is kind.`,
        `${E}I'll leave the kitchen door unlatched. Come straight back after, whatever the hour. I won't be sleeping.`,
        { text: `${E}You've a soft heart; I've watched you all year. Half the town owes you a kindness. She'll feel it. Children always do.`, when: { "g:mercy": ">=3" } },
        { text: `${E}You've a hard way about you these days, love. I don't blame you, with the year we're having. But leave it at the gate tonight.`, when: { "g:iron": ">=3" } },
      ],
      objectives: [
        { type: "vigil", label: "Sit very still by Lily's stone at night (sneak)", place: "graveyard", radius: 6, seconds: 60, timeOfDay: NIGHT, sneaking: true },
        {
          type: "meet",
          label: "Talk to the little ghost by the stone",
          place: "graveyard",
          radius: 12,
          who: LILY,
          pages: [
            `A small blue light drifts over the stone and settles into the shape of a girl in a nightgown, with a red ribbon in her hair that isn't there. She looks at you very seriously.\n\n${L}You're sitting in my best spot.`,
            `${L}Did you bring my treasures? I counted. I always count. The shell and the marble are new, but they have my names on, so they're mine. That's the rule.`,
            `${L}I've been waiting ever so long. Elsie said stay on the pier and don't move, because of the storm, and she'd come right back. Then the stars started falling. They were so pretty. And there was a man on the tower, singing.`,
            `${L}It was a horrible song. It made the sky crack like an egg. Then the water came up, and it was very cold, and I lost my shoe. Is Elsie coming soon? It's past my bedtime. It's been past my bedtime for a long time.`,
          ],
          choices: [
            {
              id: "truth",
              label: "Tell her, gently, that she is gone",
              set: { lily: "told" },
              inc: { "g:mercy": 1 },
              reply: [
                `You tell her as softly as you can. She listens with her chin up, the way children do when they've decided not to cry.\n\n${L}Oh. I wondered. Nobody's feet make noise but yours.\n\nShe thinks about it.\n\n${L}Then Elsie must be very old now. I want to see.`,
              ],
            },
            {
              id: "wait",
              label: "Tell her Elsie is coming",
              set: { lily: "waiting" },
              reply: [
                `${L}I knew it! I knew she would. She always does, even when she's cross.\n\nShe tucks her knees up under her nightgown and watches the gate, perfectly happy. It is the saddest thing you have ever seen.`,
              ],
            },
          ],
        },
      ],
      outro: [
        { text: `${E}You told her. Good. I never could, not in forty winters. Every time I went to that stone I just said "soon, my lamb, soon", like a coward.`, when: { lily: "told" } },
        { text: `${E}You told her I'm coming.\n\nElsie closes her eyes.\n\n${E}That's what I've told her for forty winters. Soon, my lamb, soon. Then I'd better make it true, hadn't I.`, when: { lily: "waiting" } },
        `${E}A man on the tower, singing? She never told me that part. She never told anyone. She was seven.\n\nElsie's hands are shaking. She hides them in her apron.`,
        `${E}Old Tobin was on the docks that night. Go and ask him what he saw. I can't. He'd ask me questions back, and I'm all out of half-truths.`,
      ],
      reward: {
        levels: 4,
        crowns: 40,
        codex: {
          id: "inn_ghost_lily",
          title: "Lily",
          text: "Lily was a storm-orphan Elsie took in and raised as her little sister. On the night of the Long Storm, Elsie told her to wait on the old pier. Lily remembers the stars falling, and a man on the harbor tower singing a song that 'made the sky crack like an egg'. Then the water came. She has been waiting, seven years old, for forty winters.",
        },
      },
      hint: "Go to the Old Graveyard after dark (the tracker points to it), stand by the small stones and sneak in place for a minute. Lily appears when the vigil is done.",
    },
    {
      id: "storm_child",
      title: "The Long Storm's Child",
      npc: "tobin",
      end: "elsie",
      intro: [
        `§eOld Tobin§r is gutting fish on the dock and doesn't stop when you say the name.\n\n${T}Lily. Elsie's little one. Aye. I've not heard that name said out loud since the year it happened.`,
        `${T}I was on these boards that night. Rain coming sideways. Stars coming down like sparks off a forge. And on the end of the old pier, a little girl in a nightgown, holding a whistle, waiting.`,
        `${T}My brother Hal saw her too. He untied his boat and rowed out toward the tower. I always thought he went for the tower. Maybe he went for her. I'll never know which.`,
        { text: `${T}Bell's quiet now, thanks to you. First winter in forty I can stand on this dock after dark. Go up to the lighthouse when the sun goes down and look at the old pier. You'll see what I mean.`, when: SILENCE },
        { text: `${T}Hear the bell? Rings true now. It rang that night too, but wrong, like a cracked cup. Go up to the lighthouse when the sun goes down and look at the old pier. You'll see what I mean.`, when: RING },
      ],
      objectives: [
        { type: "vigil", label: "Watch the old pier from the lighthouse at sundown", place: "lighthouse", radius: 16, seconds: 30, timeOfDay: [11500, 13500], outdoors: true },
        {
          type: "vision",
          label: "Look back forty winters",
          place: "lighthouse",
          radius: 16,
          dark: true,
          scenes: [
            { title: "Forty Winters Ago", text: "The sea is black glass under a sky full of falling stars. On the end of the old pier stands a small figure in white, holding a tin whistle.", seconds: 5 },
            { text: "On top of the harbor tower a man in a dark robe stands at the great bell, singing. You can't hear the words. You feel them, in your teeth.", seconds: 6 },
            { text: "A rowboat pulls hard across the harbor. The man at the oars looks like a young Tobin, but he isn't.", seconds: 5 },
            { text: "The bell rings once, wrong. The sky cracks. The sea rises over the pier like a hand closing.", sound: "random.explode", seconds: 5 },
          ],
        },
      ],
      outro: [
        "You tell Elsie what you saw from the lighthouse. She listens with her hands folded on the counter, perfectly still, the way Lily sat by her stone.",
        `${E}I told her to stay put because the pier was the safest place I could think of. High boards. Far from the tower. Then I ran to the chapel. I thought I could... stop something, there.\n\nShe doesn't say what.`,
        `${E}I was wrong about the pier. I was wrong about a great many things that night. Hal rowed out for my girl, and I never even thanked his brother. Forty years.`,
        `${E}No more half-truths about her, at least. She deserves a whole one. Come back tomorrow. I'll teach you her song.`,
      ],
      reward: {
        levels: 3,
        crowns: 35,
        codex: {
          id: "inn_ghost_pier",
          title: "The Old Pier",
          text: "From the lighthouse you saw the night of the Long Storm: Lily waiting on the old pier, a robed man ringing the harbor bell from the tower top, and Hal rowing hard across the harbor. The bell rang once, wrong, and the sea came over the pier. Tobin never knew whether Hal rowed for the tower or for the girl.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "The tracker points to the Lighthouse. Be there outdoors around sunset and stay for half a minute; the vision follows.",
    },
    {
      id: "lullaby",
      title: "The Little Lantern",
      npc: "elsie",
      intro: [
        `${E}Every night she made me sing it, and every night she sang the last word herself, very loud, so the whole inn heard. Then she was asleep before the echo stopped.`,
        `${E}I'll sing you the rest. You'll know the last word when it comes; anyone would. It's an old, old song. Older than the town. Older than you'd believe.`,
        `${E}And love... she's been out there forty winters, and she isn't the only thing near that graveyard that listens. When you sing, other things may come to hear. Keep her safe while they come. Then sing.`,
      ],
      objectives: [
        {
          type: "defend",
          label: "Keep Lily safe from the things that come to listen",
          place: "graveyard",
          radius: 14,
          ward: LILY,
          waves: [
            { mobs: ["minecraft:zombie"], count: 4 },
            { mobs: ["minecraft:drowned"], count: 4 },
            { mobs: ["minecraft:drowned", "minecraft:zombie"], count: 5 },
          ],
        },
        {
          type: "answer",
          label: "Sing Lily the last word of her lullaby",
          place: "graveyard",
          radius: 10,
          question: "§bHush, little lantern, the tide's going out,\nthe boats are all home and the gulls are about.\nHush, little lantern, the sky's going deep,\nthe stars keep the watch while the sea is ______.§r\n\nLily looks up at you, waiting for the last word.",
          answers: ["asleep", "fast asleep", "sleeping"],
        },
      ],
      outro: [
        "You sing the last word. Lily sings it with you, very loud, so the whole graveyard hears. The tarred rope on the drowned goes slack in the grass. Far out in the harbor, something that was listening stops.",
        { text: `${L}Asleep! You knew it. Elsie always sings the middle too slow.\n\nShe yawns enormously.\n\n${L}I'm not tired. I'm resting my eyes. Will you tell Elsie I can go to bed now, if she wants?`, when: { lily: "told" } },
        { text: `${L}Asleep! You knew it.\n\nShe yawns.\n\n${L}Elsie's taking such a long time. But I'm not scared any more. The song makes it feel like she's here already.`, when: { lily: "waiting" } },
        `${E}"Little lantern." I called her that because she was frightened of the dark, and the song made her brave. A lantern doesn't fear the dark, love. It's the one thing the dark has to make room for.`,
      ],
      reward: {
        levels: 4,
        crowns: 40,
        codex: {
          id: "inn_ghost_lullaby",
          title: "The Little Lantern",
          text: "Elsie's lullaby: 'Hush, little lantern, the tide's going out, the boats are all home and the gulls are about. Hush, little lantern, the sky's going deep, the stars keep the watch while the sea is asleep.' Elsie says it is older than the town. When you sang it at the graveyard, the drowned that came to listen fell still.",
        },
      },
      hint: "At the Old Graveyard, fight off the waves while staying close to Lily, then type the missing last word of the lullaby. It rhymes with deep.",
    },
    {
      id: "flower",
      title: "A Flower for Lily",
      npc: "elsie",
      intro: [
        `§eElsie§r is waiting at the door before first light, in her good coat, with a basket on her arm and six treasures inside it wrapped in a clean cloth.\n\n${E}I'm coming with you. Forty winters is long enough to send other people to do my visiting.`,
        `${E}She loved the little white bells that grow in the shade. Lily of the valley; her namesake. Plant one by her stone, or a poppy if you can't find any. Then stay with us until the sun is properly up. She always wanted to see a sunrise. I never let her stay up for one.`,
        `${E}And whatever happens, don't let me make a fuss. I'm told I make a fuss.\n\nYou have never seen Elsie make a fuss in your life.`,
      ],
      objectives: [
        { type: "place", label: "Plant a lily of the valley (or a poppy) by Lily's stone", blocks: ["minecraft:lily_of_the_valley", "minecraft:poppy"], count: 1, place: "graveyard", radius: 10 },
        { type: "vigil", label: "Stay at the graveyard with Elsie and Lily until sunrise", place: "graveyard", radius: 14, seconds: 60, timeOfDay: [22000, 23999], outdoors: true },
        {
          type: "meet",
          label: "Say goodbye to Lily",
          place: "graveyard",
          radius: 12,
          who: LILY,
          pages: [
            "The light comes up gold over the graveyard wall. Lily is sitting on her stone, swinging her feet, and Elsie is sitting beside her. For a while nobody says anything at all.",
            `${L}You got old, Elsie. Except you didn't. Your face is the same. You're the same as when you tucked me in.\n\n${E}Hush now, lamb.\n\n${L}Your apron used to glow in the dark. I told everyone. Nobody believed me.`,
            `${L}It's warm. The sun's warm. I didn't know I could feel it any more.\n\nShe puts her small cold hand on yours. It isn't cold.\n\n${L}Thank you for my treasures. You keep the whistle. Blow it if you get scared, and I'll hear.`,
            "The light fills up the place where she was. The red ribbon slips off the iron gate, drifts down onto the grass and lies still.",
          ],
        },
      ],
      outro: [
        `${E}There. She's gone to bed.\n\nElsie folds the ribbon very small and puts it in her apron pocket, over her heart.`,
        `${E}Forty winters I kept this inn so I'd be close if I was ever needed again. I wasn't there for her. Whatever comes next, love, whatever it costs, I'll be there for that.`,
        "Room three is warm that night. The trader who left without his boots comes back for them, falls asleep there by mistake, and says in the morning it was the best night's sleep he's had in years.",
        `${E}Keep the whistle, as she said. And take these. It's not much. It's only my thanks, and those don't wear out.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Lily's Friend",
        items: [{ item: "minecraft:golden_carrot", amount: 8 }],
        journal: { entry: "inn_ghost", label: "A Room at the Inn" },
        codex: {
          id: "inn_ghost_goodbye",
          title: "Lily Goes to Bed",
          text: "At sunrise Lily said goodbye. She said Elsie's face had not changed in forty winters, and that Elsie's apron used to glow in the dark at bedtime. Elsie told you she kept the inn to be near if she was ever needed again, and that whatever comes next, whatever it costs, she will be there for it.",
        },
      },
      rep: [{ guild: "growers", amount: 15 }],
      hint: "Lily of the valley grows in flower forests and meadows; a poppy works too. Plant it inside the Old Graveyard's fence near the small stones, then stay outdoors there at the very end of the night until dawn.",
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Graveyard Shift (Moss). Comic horror, then the grave with Moss's name on it.
// ---------------------------------------------------------------------------------------------

/** @type {Story} */
const GRAVEYARD_SHIFT = {
  id: "graveyard_shift",
  title: "Graveyard Shift",
  short: "Graveyard Shift",
  giver: "moss",
  kind: "side",
  tones: ["scary", "funny", "creepy"],
  summary: "Moss the gravedigger needs a hand with the night shift. The dead in his graveyard are restless. Some of them are just rude.",
  chapters: [
    {
      id: "gerald",
      title: "Bones That Won't Stay Down",
      npc: "moss",
      intro: [
        `§eMoss§r leans on his shovel at the graveyard gate as if he's been waiting for you specifically, which he probably has.\n\n${MO}Ah. A living person. Excellent. Those are hard to come by on the night shift. Can you swing a sword? Good. Can you swing it several times in a row? Better.`,
        `${MO}I've a skeleton problem. One skeleton, technically. I call him Gerald. Every night he climbs out and rattles about, and I knock him down, and every night he puts himself back together and goes again. Like a tax collector. Which he was.`,
        `${MO}Tonight I want him to stay down. Knock him apart five times before sunrise and the bones get the hint. Then whatever's holding him together has to show itself. They always do. They're very proud, the ones that hold things together.`,
        { text: `${MO}You've a hard look about you, friend. Good. Gerald respects a hard look. He's never managed one himself. No eyes.`, when: { "g:iron": ">=3" } },
        { text: `${MO}Folk say you're the gentle sort. Don't be gentle with Gerald. He takes it as an invitation.`, when: { "g:mercy": ">=3" } },
      ],
      objectives: [
        { type: "defeat", label: "Knock Gerald down 5 times in one night (skeletons at the graveyard)", mobs: ["minecraft:skeleton"], count: 5, place: "graveyard", radius: 32, night: true, within: 480 },
        {
          type: "defeat",
          label: "Defeat whatever holds Gerald together",
          place: "graveyard",
          radius: 32,
          count: 1,
          champion: {
            tag: "realm:saga:gerald",
            mob: "minecraft:skeleton",
            name: "Gerald, Twice Buried",
            warn: "Every bone in the graveyard grass rattles at once, then rolls together and stands up, with a sound like someone counting coins.",
            health: 20,
            adds: { mobs: ["minecraft:skeleton"], count: 2 },
          },
        },
      ],
      outro: [
        `Gerald's skull rolls to a stop at Moss's boots and, for the first time in weeks, stays there.\n\n${MO}There. You see? Even the dead understand a firm hand. And a sword. Mostly the sword.`,
        `${MO}I'll bury him deeper this time, with a coin in his hand. Tax collectors get anxious without one.\n\nHe pats the skull fondly before dropping it into a sack.`,
        `${MO}Come back tomorrow. There's a grave that's started talking. It's not being friendly about it.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:bone_meal", amount: 16 }] },
      rep: [{ guild: "wardens", amount: 5 }],
      hint: "Be at the Old Graveyard after dark: skeletons rise there. Knock down 5 within about 8 minutes, and the boss rises when you do. Wear armor, and fight with your back to the fence.",
    },
    {
      id: "whisper",
      title: "The Grave That Whispers",
      npc: "moss",
      intro: [
        `${MO}Third row, fifth stone. Name's worn off. Started whispering last week. Riddles, of all things. I answered one wrong and it threw a zombie at me. Rude. I've buried people for less.`,
        `${MO}I'd answer them myself, but I'm told my sense of humor "lacks gravity". So you go. Sit down by it, listen, and answer properly.`,
        `${MO}Don't overthink it. The dead aren't clever. They just have a great deal of time.`,
      ],
      objectives: [
        {
          type: "answer",
          label: "Answer the grave's first riddle",
          place: "graveyard",
          radius: 10,
          question: "§7The stone hisses:§r\n\nI have a bed but never sleep. I have a mouth but never eat. I run all day and never walk. What am I?",
          answers: ["river", "a river", "stream"],
          failSpawn: { mobs: ["minecraft:zombie"], count: 2 },
        },
        {
          type: "answer",
          label: "Answer the grave's second riddle",
          place: "graveyard",
          radius: 10,
          question: "§7The stone, sounding pleased with itself:§r\n\nThe one who makes me sells me. The one who buys me never uses me. The one who uses me never knows. What am I?",
          answers: ["coffin", "a coffin", "casket"],
          failSpawn: { mobs: ["minecraft:zombie"], count: 2 },
        },
        {
          type: "answer",
          label: "Answer the grave's third riddle",
          place: "graveyard",
          radius: 10,
          question: "§7The stone, quieter now:§r\n\nThe more of me you take, the more of me you leave behind. What am I?",
          answers: ["footsteps", "steps", "footprints", "footstep"],
          failSpawn: { mobs: ["minecraft:skeleton"], count: 2 },
        },
      ],
      outro: [
        `After the third answer the stone sighs, a long contented sigh, like someone sinking into a warm bath. Then, very faintly: "Thank you. Nobody's played with me in years." Then nothing.`,
        `${MO}Lonely. That's all it was. Most of the talkers are. Lonely and a bit show-offy.\n\nHe scratches a tally mark on the fence post. There are a great many tally marks.`,
        `${MO}Tomorrow's a strange one. There's a body in an open grave on the south side. I didn't put it there, and I didn't dig the grave either. Come early. I'd rather not do that one alone.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:book", amount: 2 }] },
      hint: "Stand among the graves at the Old Graveyard, any time of day, and type your answers. Think of what has a bed and a mouth; who never knows they used it; what you leave when you walk. A wrong answer only costs you a couple of monsters.",
    },
    {
      id: "dead_drunk",
      title: "Dead Drunk",
      npc: "moss",
      end: "tobin",
      intro: [
        `The "body" lies face up in a freshly dug grave on the south side, arms crossed on its chest, in a sailor's coat and one boot. It is the most peaceful corpse you have ever seen.\n\nIt is also snoring.`,
        `${MO}Ah. Not dead, then. That's a relief and a disappointment. I'd already picked out a stone.\n\nHe prods it with the shovel. The corpse says, "Five more minutes, mother."`,
        `${MO}That's Barnaby Pike. Sailed with Old Tobin, back when. Every year on the same night he drinks to his old crew, digs himself a grave "to save me the trouble", and climbs in. Every year I walk him home.`,
        `${MO}This year my back's out. You take him. He lives in the old net shed below the lighthouse, and he'll follow anyone who sounds like a captain. He sings on the way. Loudly. Things come to listen. Mind them.`,
      ],
      objectives: [
        {
          type: "escort",
          label: "Walk Barnaby Pike home to the lighthouse",
          who: { id: "barnaby", name: "Barnaby Pike", entity: "minecraft:villager_v2", look: "minecraft:become_fisherman" },
          from: { place: "graveyard" },
          to: { place: "lighthouse", radius: 10 },
          radius: 12,
          ambush: { mobs: ["minecraft:zombie", "minecraft:skeleton"], count: 2, every: 45 },
        },
        { type: "talk", label: "Tell Old Tobin that Barnaby got home", npc: "tobin" },
      ],
      outro: [
        `${T}Barnaby Pike. Still alive, then. Pity. He owes me a net.\n\nTobin tries to scowl and gives up halfway.`,
        `${T}He digs that grave every year on the night the Petrel went down. Our old crew's boat. Five went out, three came back. Barnaby says the grave's for him. It's not. It's for the two who never got one.`,
        { text: `${T}Did he sing "The Bell Below" the whole way? He always does. Now the real bell's quiet, that's the only place it still rings. In Barnaby's terrible voice.`, when: SILENCE },
        { text: `${T}Did he sing "The Bell Below" the whole way? And did the real bell answer him from the harbor? It does now, you know. Gives me the shivers. Good shivers.`, when: RING },
        `${T}Tell Moss thanks for minding him. And tell him to come down to the docks for a drink sometime. He spends too long with folk who don't talk back.`,
      ],
      reward: { levels: 3, crowns: 35, items: [{ item: "minecraft:cooked_salmon", amount: 6 }] },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: "Barnaby follows you from the Old Graveyard to the Lighthouse. Walk, don't run, so he keeps up, and fight off whatever his singing draws in. Then find Old Tobin in town.",
    },
    {
      id: "till_dawn",
      title: "Until Dawn",
      npc: "moss",
      intro: [
        `§eMoss§r is sitting on the crypt door at the back of the graveyard. Not in front of it. On it, cross-legged, like a man keeping the lid on a pot.\n\n${MO}Evening. Don't mind me. Just keeping a door shut.`,
        `${MO}Every few years, on the darkest nights, something inside starts knocking. Polite at first. Then less polite. The rule is the door stays shut until dawn. Old rule. My master's master's rule. Nobody remembers why. I like it that way.`,
        `${MO}Trouble is, the knocking brings company. Everything dead for a mile wants to see what the fuss is about. I can sit on a door or I can swing a shovel. I can't do both.`,
        `${MO}So hold the yard till sunrise. I'll tell jokes. You'll hate them. That's part of the shift.`,
      ],
      objectives: [
        {
          type: "defend",
          label: "Hold the graveyard while the crypt knocks",
          place: "graveyard",
          radius: 16,
          waves: [
            { mobs: ["minecraft:zombie"], count: 5 },
            { mobs: ["minecraft:skeleton", "minecraft:zombie"], count: 6 },
            { mobs: ["minecraft:husk", "minecraft:stray", "minecraft:zombie_villager_v2"], count: 6 },
            { mobs: ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider"], count: 8 },
          ],
        },
        { type: "vigil", label: "Keep watch by the crypt door until dawn", place: "graveyard", radius: 16, seconds: 120, timeOfDay: [20000, 23999] },
        {
          type: "event",
          optional: true,
          label: "Be in the graveyard under a Blood Moon",
          events: ["blood_moon"],
          place: "graveyard",
          radius: 24,
          when: { "pack:moon_bp": "on" },
          set: { red: "moon" },
          bonus: { levels: 2, crowns: 30 },
          hint: "A Blood Moon rises now and then on its own. Be at the Old Graveyard while one is up, before you report back to Moss.",
        },
      ],
      outro: [
        `At first light the knocking stops mid-knock, as if someone remembered their manners. Moss climbs off the door, stretches until his back pops, and lifts the latch.\n\n${MO}Why don't gravediggers ever get lost? They always know the plot. ...No? Tough crowd.`,
        "Inside, the crypt is empty. Dust, cobwebs, a stone coffin with its lid pushed a little aside. And on the floor, in the dust, footprints. Bare, wet footprints. All of them going in. None coming out.",
        `${MO}Well. That's the most horrible thing I've seen this week, and I watched Gerald's left foot try to walk home on its own.\n\nHe shuts the door again, gently, and doesn't sit on it.\n\n${MO}We'll not mention that to anyone just yet. Agreed?`,
        `${MO}You held. All night, and never once ran. Here. The wardens pay me in arrows to keep the yard quiet. You've earned the yard's share.`,
        { text: `${MO}And you stood in my yard under a red moon, too. The dead love a Blood Moon. Everybody gets up for it. I'd tell you a joke about that, but it's a grave matter.`, when: { red: "moon" } },
      ],
      reward: {
        levels: 5,
        crowns: 50,
        items: [{ item: "minecraft:arrow", amount: 32 }],
        codex: {
          id: "graveyard_shift_crypt",
          title: "Footprints Going In",
          text: "By a rule older than anyone remembers, the crypt at the back of the old graveyard stays shut until dawn on the darkest nights. When Moss opened it at sunrise it was empty but for a stone coffin with its lid pushed aside, and bare wet footprints in the dust: all going in, none coming out.",
        },
      },
      rep: [{ guild: "wardens", amount: 15 }],
      hint: "Be at the Old Graveyard before midnight with armor, food and torches. Stay inside the fence while the waves come, then keep watch there through the last part of the night until the sky lightens.",
    },
    {
      id: "admiral",
      title: "A Very Small Funeral",
      npc: "moss",
      end: "bram",
      intro: [
        `${MO}Today's job is a delicate one. Mayor Bram's goldfish has passed. Admiral Bubbles. Eleven years old. The mayor would like a funeral. A proper one. With a eulogy.`,
        `${MO}He would like it in my graveyard, between a sea captain and a former mayor, "as befits his station". I told him a goldfish has no station. He told me I have no heart. We're both correct.`,
        `${MO}So: dig a grave. Small, but dig it properly; the mayor will inspect it. Then flowers, since he's asked for "an arrangement". Then go and fetch him. Bring a handkerchief. Bring two.`,
      ],
      objectives: [
        { type: "mine", label: "Dig a small grave (break 6 dirt or grass blocks)", blocks: ["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt", "minecraft:podzol"], count: 6 },
        { type: "place", label: "Plant 4 flowers in the graveyard as an arrangement", blocks: FLOWERS, count: 4, place: "graveyard", radius: 16 },
        { type: "talk", label: "Fetch Mayor Bram for the funeral", npc: "bram" },
      ],
      outro: [
        `§eMayor Bram§r stands at the tiny grave in his best sash, holding a jar of water with enormous dignity. The eulogy lasts eleven minutes, one for each year.\n\n${B}He was a fish of few words. Of no words, in fact. But he listened. Which is more than I can say for the council.`,
        `Moss weeps openly through the whole thing. Afterward he insists it was the pollen.\n\n${MO}It wasn't the pollen.`,
        `${B}My father used to say grief was for small things, so the town never had to feel the big ones. I've started to think that was the worst thing he ever said. Thank you for letting me be silly about a fish.`,
        `${MO}Everyone gets a goodbye. Even fish. Even the ones nobody ever found.\n\nHe goes quiet after that, and looks toward the east fence for a long time.`,
      ],
      reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:gold_ingot", amount: 3 }] },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "Break any 6 dirt or grass blocks, plant 4 flowers inside the Old Graveyard's fence (the tracker points there), then find Mayor Bram in town.",
    },
    {
      id: "name_stone",
      title: "The Name on the Stone",
      npc: "moss",
      intro: [
        `${MO}One more job, and the shift's done. There's a stone on the east fence I clean once a year. I'm getting old. Thought I'd let someone else see it, for once.`,
        `${MO}It's in the row without dates. The Long Storm row. Go and read what's written there. Then come and sit a while after sundown. You don't have to say anything. Nobody does, at a grave. That's the nice thing about them.`,
        `${MO}Bring a lantern. The east fence gets dark early. It always has.`,
        { text: `${MO}You know the map Mara hung in the square? There's a tiny cross on it, by the coast. This graveyard. Fenn put it there years back. He used to bring me tea out here. Funny man. Liked the quiet.`, when: { "last_map.map": "share" } },
        { text: `${MO}Mara showed me that map you two kept. There's a tiny cross on it, by the coast. This graveyard. Fenn put it there years back. He used to bring me tea out here. Funny man. Liked the quiet.`, when: { "last_map.map": "keep" } },
      ],
      objectives: [
        {
          type: "inspect",
          label: "Read the stone on the east fence",
          place: "graveyard",
          radius: 16,
          clues: [
            { dx: -6, dz: -4, text: "A gray stone, older than its neighbors and much better kept. Someone scrubs the lichen off every year. It reads: HERE LIES ___ MOSS, LAMPKEEPER OF THE HARBOR TOWER. The first name has been chiseled away. On purpose." },
            { dx: -7, dz: -2, text: "At the foot of the stone, two little shovels are carved side by side, the way two children carve their marks into a tree." },
            { dx: -5, dz: -6, text: "A jar of fresh wildflowers, changed this week. Under it, a folded note: 'Kept the lamp lit for you. Every night. Still do. - M.'" },
          ],
        },
        { type: "vigil", label: "Sit with Moss by the stone after sundown", place: "graveyard", radius: 8, seconds: 60, timeOfDay: [12500, 15000] },
      ],
      outro: [
        `${MO}Alder. His name was Alder. Older than me by four minutes, and he never once let me forget it.\n\nMoss pulls up a tuft of grass and twists it in his fingers.`,
        `${MO}He kept the lamp on the harbor tower. The night of the Long Storm he went up to light it, same as always. The tower fell. The sea took it. That's all anyone knows, and I never asked for more.`,
        `${MO}I chiseled off his name because I couldn't stand to read it. Then I took up the shovel so I'd never be far from it. Forty years of talking to the dead, and the only one I want to talk to never answers.`,
        `${MO}So. What do you think, night-shift? Leave it be? Or carve it back?`,
      ],
      choices: [
        {
          id: "carve",
          label: "Carve his name back",
          set: { stone: "carved" },
          inc: { "g:mercy": 1 },
          reply: [
            "You carve it together, Moss holding the chisel and you holding the lantern. ALDER. It comes out crooked. Moss says Alder would have hated that, and laughs for the first time all night.",
            `${MO}Hello, brother. Sorry I took so long.`,
          ],
        },
        {
          id: "leave",
          label: "Leave it as it is",
          set: { stone: "blank" },
          reply: [`${MO}Aye. Some names are better carried than carved. I know what it says. So do you, now. That's two of us. That's plenty.`],
        },
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Night-Shift",
        items: [{ item: "minecraft:lantern", amount: 1, name: "Alder's Lantern", lore: ["Kept lit. Every night."] }],
        journal: { entry: "graveyard_shift", label: "Graveyard Shift" },
        codex: {
          id: "graveyard_shift_alder",
          title: "Alder Moss",
          text: "Moss had a twin, Alder, older by four minutes, who kept the lamp on the old harbor tower. On the night of the Long Storm, Alder climbed the tower to light it as always. The tower fell into the sea. Moss chiseled the name off Alder's stone, then became the gravedigger so he would never be far from it.",
        },
      },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "Look along the east side of the Old Graveyard for the faint particles and tap near each one. Then stay there for a minute just after sunset.",
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The Witch's Bargain (Moss, meeting Vesna). Sets g:vesna (free / bound), which Act V reads.
// ---------------------------------------------------------------------------------------------

/** @type {Story} */
const VESNA_BARGAIN = {
  id: "vesna_bargain",
  title: "The Witch's Bargain",
  short: "Witch's Bargain",
  giver: "moss",
  kind: "side",
  tones: ["creepy", "mystery", "dangerous"],
  summary: "Dead things are floating down the ditch from Hollow Fen, and Moss wants to know why. So, it seems, does the witch.",
  requires: { stories: ["act2_choir"] },
  chapters: [
    {
      id: "downstream",
      title: "Dead Things Downstream",
      npc: "moss",
      intro: [
        `§eMoss§r has laid out a row of very dead frogs on the graveyard wall, neatly, by size.\n\n${MO}Don't make that face. Somebody has to bury them. They come down the ditch from the Fen every morning. Frogs. Fish. Yesterday, a whole cow, which took some doing.`,
        `${MO}You've met her. Vesna. She taught you that song. Her Fen's been sweet water as long as I've been alive. Now it's killing things.`,
        `${MO}I've known Vesna a long time. We're two of a kind: folk the town doesn't invite to supper. She'd never poison her own water. So something's wrong with her, or with the water, and I'd like to know which before I run out of shovel.`,
        { text: `${MO}Brother Hollis came by. Looks better than he has in a year. Said he's praying for the Fen. I said the Fen would rather have a bucket. He laughed. Good to hear him laugh.`, when: { "g:hollis": "saved" } },
        { text: `${MO}The chapel's been dark since Brother Hollis went strange. I light a candle at the gate for him. Somebody ought to.`, when: { "g:hollis": "lost" } },
      ],
      objectives: [
        {
          type: "inspect",
          label: "Look for what is poisoning Hollow Fen",
          place: "witch_hut",
          radius: 20,
          clues: [
            { dx: 5, dz: 3, text: "Lily pads, black and curled at the edges as if burned. The water under them is still, and smells of old pennies." },
            { dx: -4, dz: 6, text: "A ring of mushrooms around a dead heron. Every mushroom leans toward the middle of the Fen, like flowers toward the sun." },
            { dx: 6, dz: -5, text: "Words cut into a stilt post, very old, worn almost smooth: V. PROMISED. FORTY WINTERS. Below, newer and shakier: NOT YET. NOT YET." },
            { dx: -3, dz: -4, text: "Black water bubbling up from the mud in slow, steady pulses. Like breathing. Like something under the Fen is asleep, and dreaming." },
          ],
        },
        {
          type: "meet",
          label: "Speak with Vesna at her hut",
          place: "witch_hut",
          radius: 16,
          who: VESNA,
          pages: [
            `§5Vesna§r sits on her steps with her feet in the black water. Her lips are gray. She smiles at you as if it costs her something.\n\n${V}The songbird. Moss sent you. He sends everyone who's too polite to say no.`,
            `${V}You've read the post, then. V. Yes, that's me. I made a promise a long time ago, to something that lives in this water. Forty winters, it gave me. The forty winters are up.`,
            `${V}Ask me what I promised and I'll lie to you. I'm good at it. But here's something true: there's a light coming back into the sky, and the thing in my Fen has woken up hungry.`,
            `${V}There's a draught that loosens a promise. Not breaks it. Loosens. Tell Moss what's needed; he knows a cauldron from a soup pot. I can't leave the water to brew it myself. That's part of the promise too.`,
          ],
        },
      ],
      outro: [
        `${MO}A promise to something in the water. Forty winters.\n\nHe rubs his face.\n\n${MO}The Long Storm, then. Everything broken in this town, dig far enough and the Long Storm's at the bottom.`,
        `${MO}She can't leave the Fen? I never knew. Twenty years I've left bread on the stump by the south road, thinking she was too proud to come and fetch it.`,
        `${MO}Well. I brew. My mother was a hedge-witch before she was a gravedigger's wife. I'll need some ugly things. I'll make a list.`,
      ],
      reward: {
        levels: 3,
        crowns: 35,
        codex: {
          id: "vesna_promise",
          title: "V. Promised",
          text: "Cut into a stilt post at Hollow Fen: 'V. PROMISED. FORTY WINTERS.' and, newer, 'NOT YET.' Vesna admits she made a promise long ago to something that lives in the Fen's water, and that it gave her forty winters. Now they are up, the Fen is dying, and she cannot leave its water.",
        },
      },
      hint: "Hollow Fen is far out of town ({band:witch_hut} blocks); the tracker points the way, and a horse or boat helps. Tap near the faint particles around the hut, then speak to Vesna on her steps.",
    },
    {
      id: "draught",
      title: "The Loosening Draught",
      npc: "moss",
      intro: [
        `${MO}Right. The list. Spider eyes, rotted with sugar and mushroom so they're properly nasty: two. Melon slices dipped in gold, for the sweetness that undoes things: two. And the skin off a phantom's wing: two.`,
        `${MO}Phantoms, aye. The things that come for you when you haven't slept. Seems right, for a draught that wakes a promise up. Stay awake a few nights and they'll find you. Don't make a habit of it.`,
        `${MO}And Vesna wants one more thing, and she was very particular. A pufferfish, caught on a line, by your own hand. Not bought, not found. She says the Fen will know.\n\nHe squints.\n\n${MO}I think she just likes pufferfish.`,
      ],
      objectives: [
        { type: "deliver", label: "Bring Moss 2 fermented spider eyes", npc: "moss", item: "minecraft:fermented_spider_eye", count: 2 },
        { type: "deliver", label: "Bring Moss 2 glistering melon slices", npc: "moss", item: "minecraft:glistering_melon_slice", count: 2 },
        { type: "deliver", label: "Bring Moss 2 phantom membranes", npc: "moss", item: "minecraft:phantom_membrane", count: 2 },
        { type: "fish", label: "Catch a pufferfish with a fishing rod", items: ["minecraft:pufferfish"], count: 1 },
      ],
      outro: [
        "Moss brews all night in the shed behind the graveyard. The smell is beyond description. Two of his crows leave and do not come back. At dawn he pours something the color of a bruise into a stoppered bottle.",
        `${MO}One loosening draught. Smells like a drowned boot. It's not for drinking. Pour it into her cauldron at the Fen and let the steam rise. Whatever's holding her has to loosen its grip, just for a breath.`,
        `${MO}And when it does, you'll see what she promised. Vesna says so. She also says to bring a sword. She says it in the same voice, which I didn't care for.`,
      ],
      reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:potion", amount: 1, name: "Loosening Draught", lore: ["Smells like a drowned boot.", "Not for drinking."] }] },
      hint: "Fermented spider eye: spider eye, sugar and a brown mushroom. Glistering melon: a melon slice ringed with gold nuggets. Phantoms come after three nights without sleep. Pufferfish bite in ocean water.",
    },
    {
      id: "fen_mother",
      title: "What the Water Wanted",
      npc: "moss",
      intro: [
        `${MO}Pour the draught into her cauldron. Don't breathe the steam. Do look into it. That's the part she was clear about.`,
        `${MO}And, friend. Whatever you see in there, she was young once. We all were. Even me. There's a painting to prove it, and I've hidden it well.`,
        `${MO}I'll be here, burying frogs. Come back and tell me everything. Don't leave out the bad parts. I'm a gravedigger; the bad parts are my trade.`,
        { text: `${MO}One more thing. If you've a heart soft enough to have got you this far, keep it. If you see her as she was, you'll want it.`, when: { "g:mercy": ">=3" } },
      ],
      objectives: [
        { type: "interact", label: "Pour the draught into Vesna's cauldron", place: "witch_hut", blocks: ["minecraft:cauldron"], count: 1, radius: 12 },
        {
          type: "vision",
          label: "Look into the steam",
          place: "witch_hut",
          radius: 16,
          dark: true,
          scenes: [
            { title: "Forty Winters Ago", text: "Rain hammers the Fen. A young woman with black braids wades out into the water up to her waist, holding up a lantern. Falling stars streak the sky behind her.", seconds: 5 },
            { text: "She is shouting into the water. 'Teach me! You know the old songs. Teach me the one that stops it!' Far off, the harbor tower stands black against the storm.", seconds: 6 },
            { text: "The water answers in a voice like reeds rubbing together. 'Forty winters of the song, little singer. Then you are mine.' A hand of black mud closes around her wrist.", sound: "mob.witch.ambient", seconds: 6 },
            { text: "She learns the song in a heartbeat and sings it into the storm. Far away, a bell rings once, wrong, before she can finish. The tower falls. She was a breath too late.", seconds: 6 },
          ],
        },
      ],
      outro: [
        `You come back to Moss smelling of drowned boot. He listens to all of it with his hat in his hands.\n\n${MO}A breath too late. She tried to stop the Long Storm. Alone, in a swamp, at nineteen. And she was a breath too late.`,
        `${MO}The old stories had a name for the bog spirits. Mothers. Not because they're kind. Because they keep what they hold. I'd wager that's what's in her Fen: a Fen Mother.`,
        `${MO}Vesna sent a crow while you were walking back. The note says: The draught loosened the grip. The heart of the Fen is in the reeds behind my hut. While it's loose, someone can take it. The reeds are watched.`,
        `${MO}"The reeds are watched." That's all. Witches. Never a map when you need one.`,
      ],
      reward: {
        levels: 3,
        crowns: 40,
        codex: {
          id: "vesna_fen_mother",
          title: "The Fen Mother",
          text: "On the night of the Long Storm, nineteen-year-old Vesna waded into the Fen and begged the spirit in its water to teach her the old song that could stop the storm. The Fen Mother taught her, for a price: forty winters of the song, then Vesna would be hers. Vesna sang it into the storm, but the bell rang its wrong note a breath before she finished, and the tower fell.",
        },
      },
      hint: "Hollow Fen's cauldrons are in and around the hut. Hit one (or use a bucket on it) within a dozen blocks of the hut, and the vision follows. If every cauldron is gone, place a cauldron of your own within 12 blocks of the hut and use that one.",
    },
    {
      id: "reeds",
      title: "Through the Reeds",
      npc: "moss",
      intro: [
        `${MO}The heart of the Fen. I've been reading my mother's books. Bog spirits keep their heart in something solid: a stone, a bone, a lump of bog iron. Take it, and the spirit can't hold anything. Including her.`,
        `${MO}The reeds behind the hut are watched by bogged. Skeletons that drowned in swamps, all moss and mushroom. They don't see well. But they hear a footstep in the mud from a long way off. So don't make any.`,
        `${MO}Sneak in. Get to the heart. Don't fight unless you have to. And once you've got it, the whole Fen's going to know, so be ready to fight your way out.`,
        { text: `${MO}Quill dropped by this morning, asking after "a certain lady of the Fen". Seems she's sold him potions for years. He says to tell you the bogged are slow to turn. Smugglers know these things.`, when: { "g:quill": "trusted" } },
        { text: `${MO}Quill used to buy potions off her, you know. Before Reyes locked him up. She hasn't had a customer since. Nobody to tell her the town remembers she's out there.`, when: { "g:quill": "exposed" } },
      ],
      objectives: [
        {
          type: "stealth",
          label: "Sneak through the reeds to the heart of the Fen",
          place: "witch_hut",
          radius: 24,
          guards: { mob: "minecraft:bogged", count: 5, name: "Reed Watcher" },
          goal: { dx: -14, dz: 10 },
          detect: 12,
          detectSneak: 4,
          onSpotted: "ambush",
        },
        { type: "defeat", label: "Escape the waking reeds (defeat 6 bogged within 3 minutes)", mobs: ["minecraft:bogged"], count: 6, place: "witch_hut", radius: 32, within: 180 },
      ],
      outro: [
        "In the middle of the reeds, half sunk in black mud, sits a lump of bog iron the size of a heart. It is warm. It is beating. When you pull it free, the whole Fen groans like a ship's timbers.",
        `You bring it to Moss wrapped in three sacks. He sets it on the graveyard wall, as far from himself as the wall allows.\n\n${MO}That is the most disgusting thing anyone has ever brought me, and I once dug up a pie.`,
        `${MO}Her crow came again. Two choices, she says. Break the heart: the Fen Mother is loosed and must be fought, and Vesna walks free if you win. Or sink it back with Vesna's name on it: the Mother sleeps forever, the Fen heals, and Vesna is bound to the water for good, answering to whoever binds her.`,
        `${MO}She says she won't hold either one against you. That's a lie; I know her handwriting when she's lying. But she means you to choose. So choose.`,
      ],
      choices: [
        {
          id: "free",
          label: "Break the heart and set Vesna free",
          set: { "g:vesna": "free" },
          inc: { "g:mercy": 1 },
          rep: [{ guild: "growers", amount: 15 }],
          reply: [`${MO}Free, then. Good. I hoped. Get your sword and your best armor. Get a bucket of milk, for the poison. And get to the Fen.`],
        },
        {
          id: "bind",
          label: "Sink it back and bind Vesna to the Fen",
          set: { "g:vesna": "bound" },
          inc: { "g:iron": 1 },
          rep: [{ guild: "wardens", amount: 15 }],
          reply: [
            `${MO}Bound.\n\nHe doesn't argue. He just looks at the heart for a long time.\n\n${MO}A witch who has to come when she's called. Reyes will be glad of that, the night the sky falls. I'll be less glad. Let's do it properly, at least.`,
          ],
        },
      ],
      reward: { levels: 4, crowns: 45 },
      hint: "At Hollow Fen, crouch the whole way and keep more than 4 blocks from each Reed Watcher; the goal is in the reeds behind the hut, and the tracker shows it. If they spot you, they ambush. Then fight your way out quickly.",
    },
    {
      id: "break_heart",
      title: "Breaking the Heart",
      npc: "moss",
      when: FREE,
      intro: [
        `${MO}Break it at the Fen, in her cauldron, where the promise was made. The Mother will come up out of the water to stop you. She'll go for Vesna first. Vesna's weak as a kitten right now. Keep them off her.`,
        `${MO}When the Mother's hurt enough she'll take a shape you can hit. Hit it. Keep hitting it. That's the whole of my mother's advice on bog spirits, and she lived to ninety.`,
        `${MO}And if the Mother starts singing while you fight, don't stop to listen. You'll want to. Everyone does.`,
        { text: `${MO}You've been gentle with folk all year. I hear the stories. That's why she trusts you with this. Don't be gentle tonight.`, when: { "g:mercy": ">=4" } },
      ],
      objectives: [
        { type: "interact", label: "Break the heart in Vesna's cauldron", place: "witch_hut", blocks: ["minecraft:cauldron"], count: 1, radius: 12 },
        {
          type: "defend",
          label: "Keep the Fen Mother's servants off Vesna",
          place: "witch_hut",
          radius: 16,
          ward: VESNA,
          waves: [
            { mobs: ["minecraft:bogged"], count: 5 },
            { mobs: ["minecraft:slime", "minecraft:bogged"], count: 6 },
            { mobs: ["minecraft:drowned", "minecraft:bogged"], count: 6 },
          ],
        },
        {
          type: "defeat",
          label: "Defeat the Fen Mother",
          place: "witch_hut",
          radius: 32,
          count: 1,
          champion: {
            tag: "realm:saga:fen_mother",
            mob: "minecraft:witch",
            name: "The Fen Mother",
            warn: "The black water rises in a column, and out of it steps a woman made of mud and reeds, wearing Vesna's face.",
            health: 60,
            adds: { mobs: ["minecraft:bogged"], count: 3 },
          },
        },
      ],
      outro: [
        "The Fen Mother comes apart like a sandcastle in the tide: reeds, mud, black water, then nothing. The bog iron in the cauldron cracks in two. The Fen goes very quiet. Then, somewhere, a frog starts to sing.",
        `${V}Oh. Oh, listen to that.\n\nVesna stands at the edge of her porch. She takes one step off it, onto the grass. Then another. Then she sits down very suddenly and laughs until she cries.`,
        `${V}Forty winters I couldn't set foot on dry land. You know what I'll do first? Walk to that graveyard and eat Moss's bread off the stump while he watches. Twenty years he's been leaving it. He deserves an audience.`,
        `${V}Take this. My mother's charm. It kept the Fen's poison off her, and now it'll keep it off you. No witch will raise a hand to you while you carry it. I'll make sure they all know why.`,
      ],
      reward: { levels: 5, crowns: 60, relic: "vesna_charm" },
      rep: [{ guild: "growers", amount: 10 }],
      hint: "At Hollow Fen, hit a cauldron (if every cauldron is gone, place a cauldron of your own within 12 blocks of the hut), then stay close to Vesna and fight off the waves. The Fen Mother rises when they're done. Milk cures her poison; bring a few buckets.",
    },
    {
      id: "bind_heart",
      title: "The Keeper of the Fen",
      npc: "moss",
      when: BOUND,
      intro: [
        `${MO}A binding needs a ring of light around the water, so the Mother can't slip out while it's done. Soul lanterns, four of them, around the hut. Blue fire holds spirits; ask any sailor who's seen it on the masts.`,
        `${MO}Then she sinks the heart in the deepest part of the Fen with her name scratched on it, and you stay with her until midnight's past. She says the binding hurts. She says it like she's telling me the weather.`,
        `${MO}I'll not come. I'd only try to stop it. Go on.`,
      ],
      objectives: [
        { type: "place", label: "Hang 4 soul lanterns around Hollow Fen", blocks: ["minecraft:soul_lantern"], count: 4, place: "witch_hut", radius: 16 },
        { type: "vigil", label: "Stay with Vesna through midnight while the binding takes", place: "witch_hut", radius: 12, seconds: 90, timeOfDay: [17000, 19500] },
      ],
      outro: [
        "At midnight the water goes still as glass. Vesna stands waist-deep with the heart in her hands and sinks with it, slowly, until only her face is above the surface. Then she rises, dry. Her eyes are the color of the Fen.",
        `${V}It's done. The Mother sleeps. The water's sweet again; you'll see frogs by morning.\n\nShe doesn't look at you.\n\n${V}And I'm the Fen now, songbird. When you call, I'll come. I won't have a choice. Remember that, when you're calling.`,
        `${MO}You did what's safe. Safe's not nothing. On the night the sky falls, a bound witch is worth ten free ones.\n\nHe doesn't sound as if he believes it.\n\n${MO}I'll keep leaving her bread. She can't come for it now. I'll have to carry it out.`,
      ],
      reward: { levels: 5, crowns: 60, items: [{ item: "minecraft:experience_bottle", amount: 8 }] },
      rep: [{ guild: "wardens", amount: 10 }],
      hint: "Craft soul lanterns from a soul torch ringed with iron nuggets. Place 4 within 16 blocks of the hut at Hollow Fen, then stay near the hut from just before midnight until just after.",
    },
    {
      id: "spring",
      title: "The Fen in Spring",
      npc: "moss",
      intro: [
        { text: `${MO}She came. Vesna. Walked right up to the graveyard gate yesterday, bold as brass, and ate the bread off my stump. Every crumb. Then she told me I've been using too much salt for twenty years.`, when: FREE },
        { text: `${MO}I carried bread out to the Fen yesterday. She was waiting at the edge of the water, where she has to stay now. She said thank you. She's never said thank you in her life. That's how I knew it was bad.`, when: BOUND },
        `${MO}She asked for you. Wants you to come in a day or so, once the Fen's settled. I'd go. Whatever she has to say, she'll only say it once.`,
        { text: `${MO}Oh, and Tobin says the bell's been quiet as a church mouse since the Fen healed. Not that it was making a fuss. He just likes to report on it.`, when: SILENCE },
        { text: `${MO}Oh, and Tobin swears the harbor bell rang a happy note the morning the Fen healed. He's getting sentimental. Don't tell him I said so.`, when: RING },
      ],
      objectives: [
        { type: "wait", label: "Give the Fen a day to settle", days: 1 },
        {
          type: "meet",
          label: "Go back to Hollow Fen and hear Vesna out",
          place: "witch_hut",
          radius: 16,
          who: VESNA,
          pages: [
            { text: `§5Vesna§r meets you at the edge of the reeds, in boots, on dry land, looking extremely pleased about it.\n\n${V}Songbird. Look at my Fen. Frogs. Fireflies. A heron that isn't dead. I'd forgotten it could look like this.`, when: FREE },
            { text: `§5Vesna§r rises out of the still water as you come, dry as paper.\n\n${V}Songbird. Look at my Fen. Sweet water, frogs, a heron. It's never been so well. I'll never leave it again, so I suppose that's lucky.`, when: BOUND },
            `${V}I owe you the truth, since you paid for it. The song the Mother taught me is the one I taught you. A piece of it. Old singers made it, long before the town, to quiet the thing under the world. The Mother only remembered it. That's all she was: a memory with teeth.`,
            `${V}When that light comes over the sky, the song will matter. Sing it in the right place at the right time, and something very old and very hungry rolls over and goes back to sleep. Sing the wrong note, and you know what happens. You've seen it happen.`,
            { text: `${V}And tell your chapel boy the counter-song held. He'll want to know it held.`, when: { "g:hollis": "saved" } },
            { text: `${V}So. I'll be at your side when that night comes, if you'll have me. Not because I owe you. Because I want to see the look on Ashgrave's drowned face.`, when: FREE },
            { text: `${V}So. When that night comes, call me. I'll come. I have to. Just once, before you do, think about what you'd want, if it were you in the water.`, when: BOUND },
          ],
        },
      ],
      outro: [
        `${MO}Done, then. The Fen's sweet, the frogs have stopped floating down my ditch, and I can put my shovel up for a night.`,
        { text: `${MO}She's asked me to supper. At the Fen. Me. Nobody's asked me to supper in thirty years. I'll have to find my good hat. I don't have a good hat.`, when: FREE },
        { text: `${MO}I'll take her bread every week. Walk out, sit on the edge, talk a while. She's got all the time in the world now. Least I can do is spend some of mine.`, when: BOUND },
        `${MO}You walked into a witch's swamp for a gravedigger's dead frogs. That's the night-shift spirit. Here: your wages, and a name. The Fen's started calling you one.`,
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Fenwalker",
        journal: { entry: "vesna_bargain", label: "The Witch's Bargain" },
        codex: {
          id: "vesna_song",
          title: "The Old Singers' Song",
          text: "Vesna's counter-song is a piece of a song made by old singers, long before the town, to quiet the thing under the world. The Fen Mother only remembered it. Vesna believes that when the light in the sky passes over, the song will matter: sung right, in the right place, the hungry thing sleeps again.",
        },
      },
      hint: "Wait one in-game day (sleeping through a night counts), then go back to Hollow Fen; Vesna appears near the hut.",
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Lamp in the Window (Hollis, only when he was saved in Act II).
// ---------------------------------------------------------------------------------------------

/** @type {Story} */
const HOLLIS_FAITH = {
  id: "hollis_faith",
  title: "Lamp in the Window",
  short: "Lamp in Window",
  giver: "hollis",
  kind: "side",
  tones: ["sad", "happy", "cozy"],
  summary: "The old chapel survived the Gray Choir. Brother Hollis isn't sure he did.",
  requires: { stories: ["act2_choir"], flags: { "g:hollis": "saved" } },
  chapters: [
    {
      id: "glass",
      title: "Broken Glass",
      npc: "hollis",
      intro: [
        `§eBrother Hollis§r is sweeping broken glass in the old chapel. He has been sweeping the same patch for a while. The colored pieces glitter in the dustpan like a smashed rainbow.\n\n${H}Oh. Hello. Mind your feet. I keep thinking I've got it all, and then the light finds another piece.`,
        `${H}The Choir broke every window the night they came through. The night I let them in. I was asleep, but my hands did it. My hands opened the door. I keep looking at them.`,
        `${H}I don't know if I can keep a chapel. I don't know if I should. But it's cold in here with the wind coming through, and people still come to light candles. They shouldn't have to do it in the cold.`,
        `${H}Would you help me put the windows back? Glass, any color you like. And candles, if you can spare some. Ours were all... used. That night.`,
      ],
      objectives: [
        { type: "place", label: "Put 12 glass blocks or panes back into the old chapel", blocks: GLASS, count: 12, place: "old_chapel", radius: 12 },
        { type: "deliver", label: "Bring Brother Hollis 6 candles", npc: "hollis", item: "minecraft:candle", count: 6 },
      ],
      outro: [
        `When the last pane is in, the afternoon sun comes through every color at once and lays them across the pews like a quilt. Hollis stops sweeping.\n\n${H}Oh. I'd forgotten it did that.`,
        `${H}My teacher used to say a chapel is just a room where people agree to be gentle. I forgot that too. I thought it was a place you had to deserve.`,
        { text: `${H}And the harbor bell is quiet now. I'm grateful. I used to hear it in my sleep, even after. Calling. It doesn't call any more.`, when: SILENCE },
        { text: `${H}You can hear the harbor bell from here, have you noticed? It rings true now. I used to dread every bell. That one I don't mind. It sounds like someone coming home.`, when: RING },
        `${H}Thank you. Come back in a day or two? I have a favor to ask. A strange one. I'm not sleeping well, and I think I need someone to tell me I'm being foolish.`,
      ],
      reward: { levels: 3, crowns: 30, items: [{ item: "minecraft:golden_carrot", amount: 6 }] },
      rep: [{ guild: "growers", amount: 5 }],
      hint: "Smelt sand into glass; any color of glass or glass pane counts. Place 12 within 12 blocks of the Old Chapel (the tracker points there), then craft candles from string and honeycomb and bring 6 to Hollis.",
    },
    {
      id: "dream",
      title: "The Door You Keep",
      npc: "hollis",
      end: "elsie",
      intro: [
        `${H}I don't sleep. Not really. I lie down and close my eyes and I listen for him. The drowned man. The bell. I know he can't reach me now. I know you stopped it. I still listen.`,
        `${H}And when I do fall asleep, I'm afraid of where my feet will take me.\n\nHe tries to laugh.\n\n${H}Elsie says she has a cure. She won't say what it is. She says I must send "someone sensible" to fetch it, and that I'm not allowed to be the someone.`,
        `${H}Would you sleep first? Somewhere safe. Tell me if the dreams come for you too, now that you've heard him. Then go to Elsie for me. I'd go myself, but she'll feed me, and look at me, and I'll cry into the soup.`,
        `He stops. For a moment his voice goes flat and cold, as if someone else were reading the line for him.\n\n${HERALD("The door is open, little brother. It was always open.")}\n\nThen he blinks, and is himself again, and doesn't seem to know he spoke.`,
      ],
      objectives: [
        {
          type: "sleep",
          label: "Sleep, and see whether the dream comes",
          vision: [
            { title: "A Dream", text: "You are in the old chapel at night. The new windows are black. Outside, something wet walks slowly around the walls, dragging a rope.", sound: "ambient.cave", seconds: 5 },
            { text: "A voice at the door, gentle as a father's: 'Let me in. Nothing lost, nothing missed. Let me in, and no one ever grieves again.'", seconds: 6 },
            { text: "On the sill of the chapel's east window a small lamp is burning. The voice tries the door, then the window, and stops at the light as if it had walked into a wall.", seconds: 6 },
            { text: "'Not yet,' it says, and goes back down to the sea.", seconds: 4 },
          ],
        },
        { type: "talk", label: "Fetch Elsie's cure for Hollis", npc: "elsie" },
      ],
      outro: [
        `§eElsie§r listens to your dream without interrupting once, which for Elsie is a great kindness.\n\n${E}A lamp in the window. Yes. That's the cure, love. It's the only one I know.`,
        `${E}When I was a girl, every house on this coast kept a lamp in the window on storm nights. For the boats, people said. That's not the whole of it. Things that come up out of the sea don't like a light someone keeps on purpose. A kept light is a kind of no.`,
        `${E}Tell that boy to put a lamp in his window and tend it himself. Not because he's strong. Because he chooses to. And tell him to come and eat something. He's thin as a candle wick.`,
        { text: `${E}And tell him from me: a little girl once taught me that the dark has to make room for a lantern. She was right. She always was; she'd tell you so herself.`, when: { "inn_ghost.lily": "told" } },
        { text: `${E}And tell him from me: a little girl once taught me that the dark has to make room for a lantern. She was right. She always was; she'd tell you so herself.`, when: { "inn_ghost.lily": "waiting" } },
      ],
      reward: {
        levels: 3,
        crowns: 35,
        codex: {
          id: "hollis_kept_light",
          title: "A Kept Light",
          text: "Elsie says every house on this coast once kept a lamp in the window on storm nights, and not only for the boats: things that come up out of the sea do not like a light someone keeps on purpose. 'A kept light is a kind of no.' In your dream, the drowned voice at the chapel door stopped at a lamp on the sill.",
        },
      },
      hint: "Sleep in any bed through a night and the dream comes. Then find Elsie at the inn; the tracker points to her.",
    },
    {
      id: "wedding",
      title: "A Wedding, Mostly",
      npc: "hollis",
      intro: [
        `${H}Good news! I think. Someone has asked me to marry them. Not to me. In the chapel. A wedding! The first since... well. The first.\n\nHe looks terrified and delighted in exactly equal parts.`,
        `${H}The groom is Barnaby Pike, the old sailor. The bride is Rosalind, who runs the ferry. They've been courting for thirty-one years. Barnaby says he wanted to be sure.`,
        `${H}There are two small problems. First, Rosalind wants flowers. A great many poppies; red, she was very specific. Second, the ring bearer is Wren's goat, Clementine. And Clementine has eaten the rings.`,
        `${H}Wren says Clementine will, um, return them in good time, if she's kept calm and walked gently to the chapel. Wren also says Clementine "only eats things she loves". I've decided to find that touching.`,
        { text: `${H}Quill has "found" six barrels of wine for the feast afterward. Nobody is asking where. I have been told, firmly, not to bless them.`, when: { "g:quill": "trusted" } },
        { text: `${H}Quill sent a note from his cell: congratulations to the happy couple, and the wine he promised them is "regrettably detained". I think he meant it kindly.`, when: { "g:quill": "exposed" } },
      ],
      objectives: [
        {
          type: "lead",
          label: "Walk Clementine the goat on a lead from Wren's Meadow to the chapel",
          mob: "minecraft:goat",
          name: "Clementine",
          spawnAt: { place: "meadow" },
          to: { place: "old_chapel", radius: 8 },
          count: 1,
        },
        { type: "deliver", label: "Bring Brother Hollis 12 poppies", npc: "hollis", item: "minecraft:poppy", count: 12 },
      ],
      outro: [
        { text: `The chapel is full. Barnaby wears a coat that almost fits. Rosalind wears a crown of poppies and a look that says thirty-one years is quite long enough. Clementine stands at the altar, chewing thoughtfully.`, when: { "g:vesna": "!free" } },
        { text: `The chapel is full. Barnaby wears a coat that almost fits. Rosalind wears a crown of poppies. In the back row sits Vesna of the Fen, on dry land, in a hat with a frog on it. Nobody knows who invited her. Moss looks very pleased with himself.`, when: FREE },
        `${H}If anyone here knows a reason these two should not be joined, speak now, or-\n\nClementine says "MEHHH." Loudly. For quite a while. Hollis waits until she's finished, then, very solemnly, overrules the goat.`,
        "The rings appear at the right moment, in a manner nobody discusses. Barnaby cries. Rosalind cries. Moss, in the back row, cries and blames the pollen. Hollis laughs out loud at the altar, and doesn't apologize for it.",
        `${H}I laughed in chapel. Out loud. My teacher would have... no. My teacher would have laughed too. I think that was the first prayer I've meant in a year.`,
      ],
      reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:cake", amount: 1 }] },
      rep: [{ guild: "growers", amount: 10 }],
      hint: "Wren's Meadow is close to town, and Clementine waits there. Craft a lead (string and a slime ball), put it on her and walk her to the Old Chapel. Poppies grow in plains and forests; bone meal on grass grows more.",
    },
    {
      id: "lamp",
      title: "Lamp in the Window",
      npc: "hollis",
      intro: [
        `${H}Elsie's cure. A lamp in the window. I've thought about it all week, and I want to do it properly. The chapel's east window looks right over the harbor. Before there was a lighthouse, it was the light the boats steered by.`,
        `${H}I'd like to hang a lantern there and keep it lit for one whole night. Myself. Awake. Choosing to. Old Tobin says the fishing boats are out late this week, so it will do some good besides whatever it does for me.`,
        `${H}Will you sit with me? I'm not afraid of the dark. I'm afraid of what I do in it when I'm alone. I'd rather not be alone.`,
        { text: `${H}With the bell silent, a lamp is all the boats have on a dark night. Tobin told me so. Gruffly. Then he gave me a fish, which I think means he approves.`, when: SILENCE },
        { text: `${H}The bell will ring the boats in, and the lamp will show them the rocks. Tobin says that's how it was when he was a boy. Then he gave me a fish, which I think means he approves.`, when: RING },
      ],
      objectives: [
        { type: "place", label: "Hang a lantern in the chapel's east window", blocks: ["minecraft:lantern"], count: 1, place: "old_chapel", radius: 10 },
        { type: "vigil", label: "Keep the lamp lit with Hollis through the night", place: "old_chapel", radius: 12, seconds: 180, timeOfDay: NIGHT },
      ],
      outro: [
        `Around midnight the wind drops, and something walks up out of the harbor and stands at the bottom of the chapel steps. You can't quite see it. You can hear the rope dragging.\n\nHollis doesn't look away from the lamp.`,
        `${HERALD("Little brother. Open the door.")}\n\n${H}No.\n\nHe says it quite softly, and trims the wick. The thing on the steps stands there a long time. Then the rope drags away down to the water, and the night is only a night.`,
        { text: `At dawn three fishing boats come in under the chapel window, one after another, steering by the lamp. Old Tobin's is last. He raises a hand to the window as he passes. Down on the rocks, someone has set a second lantern: ALDER, it says, scratched into the iron.`, when: { "graveyard_shift.stone": "carved" } },
        { text: `At dawn three fishing boats come in under the chapel window, one after another, steering by the lamp. Old Tobin's is last. He raises a hand to the window as he passes.`, when: { "graveyard_shift.stone": "!carved" } },
        `${H}I said no. I've never said no to him. I thought it would take a great shout. It only took a lamp, and a friend, and deciding.`,
      ],
      reward: {
        levels: 4,
        crowns: 45,
        codex: {
          id: "hollis_no",
          title: "No",
          text: "Hollis kept a lantern lit in the chapel's east window for a whole night. At midnight something came up out of the harbor, dragging a rope, and asked him to open the door. He said no, softly, and it went away. At dawn the fishing boats steered home by his lamp.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 15 }],
      hint: "Craft a lantern (a torch ringed with iron nuggets) and place it within 10 blocks of the Old Chapel. Then stay at the chapel after nightfall for three minutes of the night.",
    },
    {
      id: "forgive",
      title: "Forgiving Brother Hollis",
      npc: "hollis",
      intro: [
        `${H}One last thing, and then I think I can be a chapel keeper again. Or start to be.\n\nHe has a heavy book under his arm: the chapel's Book of the Lost, where the names of the dead are written so that someone always remembers them.`,
        `${H}I've been adding names. Forty winters of them: everyone the Long Storm took. Alder Moss, the lampkeeper. Hal, Tobin's brother. A little girl named Lily. And one more, that nobody ever wrote down.`,
        `${H}Brother Ashgrave. The keeper before the keeper before me. The empty coffin. I don't know everything he did. I know he got lost, the way I nearly did. I think his name belongs in the book. Someone has to remember the lost ones too. Especially them.`,
        `${H}I'd like to read the names at the graveyard, and ring the chapel bell once for all of them. Then I'd like you to tell me something true about myself. I'll know if you're only being kind.`,
      ],
      objectives: [
        {
          type: "vision",
          label: "Read the names of the lost with Hollis at the Old Graveyard",
          place: "graveyard",
          radius: 16,
          scenes: [
            { title: "The Book of the Lost", text: "Hollis reads the names in a clear, steady voice. Alder Moss. Hal. Lily. Name after name. At each one, somewhere in the graveyard, a candle you didn't light flickers on.", seconds: 6 },
            { text: "He reaches the last page and hesitates. Then: 'Brother Ashgrave, keeper of this chapel. Lost.' The wind stops. Every candle bends toward the sea, then stands straight again.", sound: "ambient.cave", seconds: 6 },
            { text: "Hollis closes the book. 'There,' he says, to no one you can see. 'Someone remembers you now. That's all I can do. Go to sleep.'", seconds: 5 },
          ],
        },
        { type: "interact", label: "Ring the chapel bell, or light a candle, for the lost", place: "old_chapel", blocks: ["minecraft:bell", "minecraft:candle", "minecraft:white_candle"], count: 1, radius: 10 },
      ],
      outro: [
        "Back in the chapel the candles are lit, the windows are whole, and the lamp burns in the east window although it's broad daylight. Hollis sits on the front pew with the Book of the Lost on his knees.",
        { text: `${H}You've been kind to everyone this year. I've heard. I'm almost afraid of what you'll say, because I know you'll be kind to me too, and I don't know if I've earned it.`, when: { "g:mercy": ">=4" } },
        { text: `${H}You've been hard this year, when things needed hardness. I've heard. That's why I'm asking you. You won't flatter me.`, when: { "g:iron": ">=4" } },
        `${H}I let them in. Asleep, dreaming, with another voice in my head, but it was my hands. Tell me something true about that. Please.`,
      ],
      choices: [
        {
          id: "not_you",
          label: "\"It wasn't you. It was the voice.\"",
          set: { forgive: "mercy" },
          inc: { "g:mercy": 1 },
          reply: [
            `${H}It wasn't me.\n\nHe says it again, slowly, like a word in a language he's learning.\n\n${H}My hands, but not me. All right. I'll try to believe that. I'll try every morning until I do.`,
            "He writes one more name on the very last line of the Book of the Lost, his own, and then he crosses it out.",
            `${H}And take the lamp. No, really. I'll light another. This one was kept all night on purpose, by two people choosing to. I think that makes it worth something. Keep it lit for someone.`,
          ],
        },
        {
          id: "do_better",
          label: "\"You did wrong. You'll do better.\"",
          set: { forgive: "iron" },
          inc: { "g:iron": 1 },
          reply: [
            `${H}I did wrong. I'll do better.\n\nHe sits up straighter, as if a weight has shifted to somewhere he can carry it.\n\n${H}Yes. That's true. That's a thing a person can live with. Thank you for not pretending.`,
            "He writes one more name on the very last line of the Book of the Lost, his own, and then he crosses it out.",
            `${H}And take the lamp. No, really. I'll light another. This one was kept all night on purpose, by two people choosing to. I think that makes it worth something. Keep it lit for someone.`,
          ],
        },
      ],
      reward: {
        levels: 5,
        crowns: 60,
        title: "Lamplighter",
        items: [{ item: "minecraft:lantern", amount: 1, name: "Hollis's Window Lamp", lore: ["It burned every night", "until the boats came home."] }],
        journal: { entry: "hollis_faith", label: "Lamp in the Window" },
        codex: {
          id: "hollis_book",
          title: "The Book of the Lost",
          text: "The chapel's Book of the Lost holds the names of everyone the Long Storm took: Alder Moss the lampkeeper, Hal, a girl named Lily, and many more. Hollis added a name nobody had ever written: Brother Ashgrave, keeper of the chapel, lost. When he read it aloud at the graveyard, every candle bent toward the sea.",
        },
      },
      rep: [
        { guild: "wayfarers", amount: 10 },
        { guild: "growers", amount: 10 },
      ],
      hint: "Go to the Old Graveyard first; the vision plays there. Then go back to the Old Chapel and tap its bell or a candle. If there's no candle, place one of your own first.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [INN_GHOST, GRAVEYARD_SHIFT, VESNA_BARGAIN, HOLLIS_FAITH];
