// Story content: see docs/STORY_BIBLE.md. Written by the act1_signs writer.
// Act I of the main story, "Signs in the Sky" (bible section 7). Keep every id (story, chapter,
// choice) stable once published: players' progress is saved by them.
//
// Chapters: smudge, fallen, rhyme, keeper, graves, echo, inn, song, choice, count.
//
// Flags this act sets:
//   act1:path ("report" | "alone")  chapter "choice" (read elsewhere as "act1_signs.act1:path")
//   hollis  ("secret" | "urged")    chapter "keeper": did you keep Hollis's dream to yourself
//   elsie   ("rest" | "pressed")    chapter "inn": did you let Elsie's past rest or press her
//   g:mercy / g:iron (+1 each)      chapters "inn" and "choice"
// Flags it reads: drowned_bell.bell (silence | ring), last_map.map (share | keep).

/** @typedef {import("../types.js").Story} Story */
/** @typedef {import("../types.js").Who} Who */

const S = "§eSol:§r ";
const H = "§eHollis:§r ";
const HV = "§7§o"; // the Herald slipping through Hollis: cold, gray, italic
const MO = "§eMoss:§r ";
const M = "§eMara:§r ";
const F = "§bFenn:§r ";
const E = "§eElsie:§r ";
const BE = "§eBea:§r ";
const W = "§eWren:§r ";
const R = "§eReyes:§r ";
const C = "§8The Cantor:§r ";

const SILENCE = { "drowned_bell.bell": "silence" };
const RING = { "drowned_bell.bell": "ring" };
const SHARE = { "last_map.map": "share" };
const KEEP = { "last_map.map": "keep" };
const REPORT = { "act1:path": "report" };
const ALONE = { "act1:path": "alone" };

const CANDLES = [
  "minecraft:candle",
  "minecraft:white_candle",
  "minecraft:light_gray_candle",
  "minecraft:gray_candle",
  "minecraft:black_candle",
  "minecraft:brown_candle",
  "minecraft:red_candle",
  "minecraft:orange_candle",
  "minecraft:yellow_candle",
  "minecraft:lime_candle",
  "minecraft:green_candle",
  "minecraft:cyan_candle",
  "minecraft:light_blue_candle",
  "minecraft:blue_candle",
  "minecraft:purple_candle",
  "minecraft:magenta_candle",
  "minecraft:pink_candle",
];

/** @type {Who} */
const FENN = { id: "old_fenn", name: "Fenn's echo", entity: "minecraft:allay" };
/** @type {Who} */
const HOLLIS_WARD = { id: "hollis_ward", name: "Brother Hollis", entity: "minecraft:villager_v2" };

/** @type {Story[]} */
export const STORIES = [
  {
    id: "act1_signs",
    title: "Signs in the Sky",
    short: "Signs in the Sky",
    giver: "sol",
    kind: "main",
    act: 1,
    tones: ["mystery", "eerie", "cozy", "creepy"],
    summary: "Sol the Sky-reader has seen something in the eastern sky that should not be there yet.",
    requires: { stories: ["drowned_bell", "last_map"] },
    chapters: [
      // 1 ------------------------------------------------------------------------------------------
      {
        id: "smudge",
        title: "A Smudge in the East",
        npc: "sol",
        intro: [
          `§eSol§r is lying on his back in the grass with a cracked spyglass on his chest, as if the sky might hand her something if she holds still long enough.\n\n${S}Ah. You. The one who listens to bells. Lie down, the grass doesn't bite.`,
          { text: `${S}Since you quieted the bell, the nights are so still I can hear the stars turning. And three nights ago one of them turned wrong.`, when: SILENCE },
          { text: `${S}Your bell rings the tide in every evening now, and I count the stars by it, one per note. Three nights ago I ran out of notes before I ran out of stars.`, when: RING },
          `${S}Low in the east, under Oriel and left of the Net, there is a smudge. Faint as a thumbprint on glass. It was not there at midsummer. It is a little bigger every night.`,
          `${S}My spyglass cracked in the cold, and my eyes are old and full of wishes. I need young eyes and a clear lens. Go up to the lighthouse after dark and watch the east, out under the open sky. Then bring me a spyglass, and we'll see if we saw the same thing.`,
        ],
        objectives: [
          {
            type: "vigil",
            label: "Watch the eastern sky from the lighthouse at night",
            place: "lighthouse",
            radius: 24,
            seconds: 60,
            timeOfDay: [13000, 23000],
            outdoors: true,
          },
          { type: "deliver", label: "Bring Sol a spyglass", npc: "sol", item: "minecraft:spyglass", count: 1 },
        ],
        outro: [
          "From the lighthouse balcony the eastern sky looks ordinary at first. Then your eyes settle, and there it is: a faint green-white smear low over the sea, like breath on a cold window. It doesn't twinkle. It waits.",
          `§eSol§r takes your spyglass with both hands and looks for a long time. When he lowers it his eyes are wet.\n\n${S}You saw it too. Then it's not my wishes. Something is coming home.`,
          `${S}It is early. Forty years early, or exactly on time. I can't tell which yet, and that frightens me more than either answer.`,
          `${S}Here. I polished the lens and scratched the old star names on the barrel, so you'll know where to look. Keep it close. We'll need it again.`,
        ],
        reward: {
          levels: 4,
          crowns: 50,
          items: [{ item: "minecraft:spyglass", amount: 1, name: "Sol's Polished Spyglass", lore: ["Oriel. The Net. Seren's Crown.", "Scratched on the barrel in Sol's hand."] }],
          codex: {
            id: "lantern_smudge",
            title: "The Smudge in the East",
            text: "Low in the eastern sky, under the star Oriel, a faint green-white smudge has appeared that was not there at midsummer. It grows a little every night and does not twinkle. Sol says it is either forty years early or exactly on time.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 5 }],
        hint: "A spyglass is 2 copper ingots and 1 amethyst shard (amethyst grows in geodes deep underground). Any night will do: stand outside on or near the lighthouse, with nothing over your head, for a full minute.",
      },

      // 2 ------------------------------------------------------------------------------------------
      {
        id: "fallen",
        title: "Fallen Light",
        npc: "sol",
        intro: [
          `${S}I have been reading Fenn's old letters. He used to tease me that stars were only rocks with good manners. But he wrote one thing he never teased about: where a star fell, the ground remembers.`,
          `${S}Far out past the farms there is a crater. Black glass and purple crystal, and in the middle a light that never goes out. The farmers call it the Starfall Crater and won't graze sheep near it. The sheep agree with them.`,
          `${S}Go there for me. Bring back amethyst from the crater's teeth: eight shards. And touch the glowing heart of it, just once. If a star remembers anything, it will remember there.`,
          `${S}Take food and a good pickaxe. And if the light shows you something, don't be afraid. Or be afraid, but keep looking. That's all astronomy is.`,
        ],
        objectives: [
          { type: "reach", label: "Find the Starfall Crater", place: "starfall", radius: 24 },
          { type: "collect", label: "Gather 8 amethyst shards", item: "minecraft:amethyst_shard", count: 8 },
          {
            type: "vision",
            label: "Touch the crater's glowing heart",
            place: "starfall",
            radius: 8,
            dark: true,
            scenes: [
              { title: "The Heart", text: "The glow is warm as skin. You lay your hand on it, and the crater, the crystal and the daylight all go away.", seconds: 4 },
              { title: "A Storm", text: "Night. Rain sideways off the sea. A harbor tower stands black against the lightning, and at the top of it a great bell swings hard.", sound: "ambient.weather.thunder", seconds: 5 },
              { title: "The Rope", text: "Someone is hauling the bell rope. Not wildly. In a rhythm. Slow, slow, quick. Slow, slow, quick. Like a heartbeat with something wrong inside it.", sound: "block.bell.hit", seconds: 6 },
              { title: "The Comet", text: "High above the tower burns a comet with a long green tail. The bell's note climbs to it. A crack runs across its bright face like ice on a pond in spring.", seconds: 6 },
              { title: "Falling", text: "It breaks. Burning pieces scatter across the sky, and one of them falls and falls and falls, toward the ground where you are standing now.", sound: "chime.amethyst_block", seconds: 5 },
            ],
          },
        ],
        outro: [
          `§eSol§r holds one of the shards up to his lamp. Inside it, very faintly, a green spark drifts like a fish in a jar.\n\n${S}Oh. Oh, look at you. You're still warm.`,
          `${S}A bell that breaks a star. Slow, slow, quick.\n\nHe taps the rhythm on the table, then snatches his hand back as if the table were hot.\n\n${S}I know that rhythm. Every child in this town knows it. We skip rope to it. Nobody remembers where it came from.`,
          { text: `${S}The bell. Your bell. It was in the tower that night, wasn't it? Thank the stars you bound its mouth. Whatever it learned that night, it can't say it again.\n\n${S}Keep the shards. I only needed to see one. Go rest. You've been inside a memory that isn't yours, and they leave a chill.`, when: SILENCE },
          { text: `${S}The bell. Your bell. It was in the tower that night, wasn't it? You gave it a new voice. I hope it has forgotten the old one.\n\n${S}Keep the shards. I only needed to see one. Go rest. You've been inside a memory that isn't yours, and they leave a chill.`, when: RING },
        ],
        reward: {
          levels: 5,
          crowns: 70,
          codex: {
            id: "star_that_fell",
            title: "The Star That Fell",
            text: "At the heart of the Starfall Crater you saw a memory: a storm, the harbor tower, and someone ringing its bell in a strange rhythm, slow, slow, quick. The note climbed to a green comet and cracked it. Its pieces fell. The town's children still skip rope to that rhythm.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "The Starfall Crater is far from town (600 to 1200 blocks); the tracker points the way, and a horse or boat helps. Amethyst grows on the crater's crystal blocks: mine the clusters for shards. Then stand at the glowing middle to touch it.",
      },

      // 2b -----------------------------------------------------------------------------------------
      {
        id: "rhyme",
        title: "The Skipping Song",
        npc: "wren",
        end: "tobin",
        intro: [
          `§eWren§r is trying to skip with a rope made of three hair ribbons knotted together. It keeps snapping.\n\n${W}Sol says you want to know about the skipping song, and I know ALL the skipping songs, but I can't show you because my rope keeps breaking, see, it broke again.`,
          `${W}If you bring me string I can make a real rope, a good long one, and then I'll do the whole song, even the last verse, which you're not supposed to do, because Elsie says it's bad luck, but you're a grown-up so you can decide.`,
          `${W}Three string is enough. Spiders have it. I don't like spiders but I respect them. Then you should ask Old Tobin, because he knows every song from the olden days, except he gets grumpy when you sing this one. Really grumpy.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Wren 3 string for a skipping rope", npc: "wren", item: "minecraft:string", count: 3 },
          { type: "talk", label: "Ask Old Tobin where the skipping song came from", npc: "tobin" },
        ],
        outro: [
          `Wren's new rope slaps the ground. Slow, slow, quick. Slow, slow, quick. She sings in a high, happy voice:\n\n§7Slow bell, slow bell, quick bell, fall.\nTower in the water, keeper in the hall.\nNothing lost and nothing missed.\nCount the knots upon your wrist.§r`,
          `§eOld Tobin§r stops mending his net when you hum it. He doesn't look up.\n\n§eTobin:§r Don't. Not that one.\n\nA long breath.\n\n§eTobin:§r Nobody taught it. Winter after the storm, every child in town knew it. Same week. Like it washed in on the tide.`,
          { text: `§eTobin:§r I hollered at a little girl for singing it once. Made her cry. Never forgave myself. But you hear that rhythm and tell me it doesn't sit wrong in your chest. Bell's silent now. Song never was.`, when: SILENCE },
          { text: `§eTobin:§r I hollered at a little girl for singing it once. Made her cry. Never forgave myself. Your bell rings true now. Good. Maybe it'll drown out that one. Hasn't yet.`, when: RING },
          `§eTobin:§r Hal had a name for that beat. Called it the wrong heartbeat. Said he heard it from the harbor tower that night, before he took the boat out. Last thing he ever said to me.\n\nHe goes back to his net. His hands are shaking.`,
        ],
        reward: {
          levels: 4,
          crowns: 50,
          items: [{ item: "minecraft:cooked_salmon", amount: 4 }],
          codex: {
            id: "skipping_song",
            title: "The Skipping Song",
            text: "Slow bell, slow bell, quick bell, fall. Tower in the water, keeper in the hall. Nothing lost and nothing missed. Count the knots upon your wrist. Nobody taught it: every child in town knew it the winter after the Long Storm. Hal called its beat the wrong heartbeat, and heard it from the harbor tower the night he died.",
          },
        },
        rep: [{ guild: "growers", amount: 5 }],
        hint: "Spiders drop string; they come out at night or lurk in caves. Give 3 string to Wren, then find Old Tobin by the docks and talk to him.",
      },

      // 3 ------------------------------------------------------------------------------------------
      {
        id: "keeper",
        title: "The Keeper Who Doesn't Sleep",
        npc: "hollis",
        intro: [
          `§eBrother Hollis§r is young, and he looks old tonight. There are gray hollows under his eyes and wax on his sleeves.\n\n${H}Forgive me. I don't mean to trouble you. Sol said you were... good with strange things. I'm not sure I'm a strange thing. I hope I'm only tired.`,
          `${H}It's the candles in the old chapel. I light them every evening, the way old Brother Tam did before me, and someone before him. And every night, at the same hour, they go out. All at once. As if someone leaned over and blew.`,
          `${H}There's no draft. I've stuffed every crack with wool. I've checked. I've checked so many times.`,
          `${H}Would you light them for me? Four is enough. And then... stay. Sit with me past midnight. I'd like someone else to see it. Or not see it. Either would help.`,
        ],
        objectives: [
          { type: "interact", label: "Light 4 candles in the Old Chapel", place: "old_chapel", blocks: CANDLES, count: 4, radius: 10 },
          { type: "vigil", label: "Sit a vigil in the Old Chapel after midnight", place: "old_chapel", radius: 10, seconds: 90, timeOfDay: [18000, 23000] },
          {
            type: "vision",
            label: "Stay when the candles go out",
            place: "old_chapel",
            radius: 10,
            dark: true,
            scenes: [
              { text: "Every flame in the chapel leans the same way at once, toward the floor, as if something under the stones had breathed in.", seconds: 4 },
              { text: "Dark. Your breath smokes. Somewhere close, water drips, though the roof is dry and the night is clear.", sound: "ambient.cave", seconds: 5 },
              { text: "A voice, very near your ear, wet and patient: §7§oNothing lost. Nothing missed. Ring it slow, little keeper.§r", seconds: 6 },
              { text: "Then the candles are burning again, steady and small, as if nothing happened. Hollis is staring at you. He heard it too.", seconds: 4 },
            ],
          },
        ],
        outro: [
          `${H}You heard it. Oh, thank goodness, you heard it, I'm not... \n\nHe laughs, and it breaks in the middle.\n\n${H}I'm sorry. That's a terrible thing to be grateful for.`,
          `${H}I have to tell someone. Every night since midsummer I dream the same dream. A drowned man in a keeper's robe, like mine, standing in a bell tower in a storm. He's ringing the bell. He wants me to learn how.`,
          { text: `${H}The bell is silent now. You made sure of it, everyone says so. But in the dream it still rings, and the drowned man smiles at me, as if silence were only a door he hasn't opened yet.`, when: SILENCE },
          { text: `${H}The bell rings true now, every evening. I love the sound. But in the dream it rings another way, a broken way, and the drowned man says the true note is only the broken one, healed badly.`, when: RING },
          `He grips your wrist, gentle and cold.\n\n${H}Please don't tell anyone yet. Warden Reyes would lock the chapel. People would say the keeper's gone mad. ${HV}And perhaps he has.§r ...I didn't mean to say that. I don't know why I said that.`,
        ],
        choices: [
          {
            id: "secret",
            label: "Keep his secret for now",
            set: { hollis: "secret" },
            reply: [`${H}Thank you. I'll keep the candles lit and my eyes open. And if I start to sound like someone else... you'll tell me. Won't you?`],
          },
          {
            id: "urged",
            label: "Urge him to tell Reyes",
            set: { hollis: "urged" },
            reply: [`${H}You're right. I know you're right. I'll go to her... soon. When I can say it without shaking. Give me a few days.\n\nYou both know he won't.`],
          },
        ],
        reward: {
          levels: 5,
          crowns: 60,
          items: [{ item: "minecraft:candle", amount: 4 }],
          codex: {
            id: "drowned_ringer",
            title: "The Drowned Ringer",
            text: "Since midsummer, Brother Hollis has dreamed of a drowned man in a chapel keeper's robe, ringing a bell in a storm and trying to teach him how. At the old chapel the candles go out after midnight, and a voice says: Nothing lost. Nothing missed. Ring it slow, little keeper.",
          },
        },
        hint: "Light the candles with flint and steel (or a fire charge) inside the Old Chapel; if they're already lit, put them out and light them again. Then stay in the chapel after midnight for a minute and a half. A bed won't help you here: you have to be awake.",
      },

      // 4 ------------------------------------------------------------------------------------------
      {
        id: "graves",
        title: "What Moss Saw",
        npc: "moss",
        intro: [
          `§eMoss§r is leaning on his shovel and talking to a headstone. He finishes his sentence before he turns around.\n\n${MO}Sorry. Old Abe hates being interrupted. He was a talker in life too.`,
          `${MO}Forty years I've dug graves in that yard, and I know how it works. You dig down. You put someone in. You fill it up. Simple. Restful, even.\n\nHe spits.\n\n${MO}Somebody's digging them up.`,
          `${MO}Not robbers. Robbers are sloppy and greedy. These are careful. They only open the graves from the Year of the Long Storm, and most of those are empty. The sea kept the bodies. Families buried a keepsake instead. A comb. A pipe. A ribbon.`,
          `${MO}And here's a thing. Two nights back I saw Brother Hollis out in the Long Storm row, past midnight, barefoot in the frost. I said good evening. He didn't answer. Just stood there humming, looking at the ground like it owed him something.`,
          `${MO}Who robs an empty grave? Come out to the Old Graveyard after dark and look around with me. Bring a sword. Lately the yard's been restless, and I don't mean in the poetic way.`,
        ],
        objectives: [
          {
            type: "inspect",
            label: "Search the Old Graveyard for clues (4)",
            place: "graveyard",
            radius: 16,
            clues: [
              { dx: 3, dz: 2, text: "Footprints in the turned earth, bare and narrow, sunk deep as if whoever made them carried something heavy. They lead out of the grave, not into it, and away toward the wild country." },
              { dx: -4, dz: 4, text: "A long gray thread snagged on the iron gate. Not wool. Something finer, dyed the color of ash. It smells faintly of candle smoke." },
              { dx: 5, dz: -3, text: "Black tar smeared across a headstone, in the shape of a hand. The carved year under it is the Year of the Long Storm. The tar is the same kind the old bell rope was soaked in." },
              { dx: -2, dz: -5, text: "A torn hymn page, pressed into the mud. Most of the words have run. A circle is drawn at the top with a crack straight through it, and under it: NOTHING LOST, NOTHING MISSED. RING IT SLOW." },
            ],
          },
          { type: "defeat", label: "Put down 6 zombies that rise in the graveyard at night", mobs: ["minecraft:zombie", "minecraft:zombie_villager_v2", "minecraft:husk"], count: 6, place: "graveyard", radius: 32, night: true },
        ],
        outro: [
          `${MO}Well. That was lively.\n\nHe pats a headstone the zombies knocked crooked and sets it straight.\n\n${MO}Not you, Abe. You stayed put. Good man.`,
          `§eMoss§r turns the hymn page over in his dirty fingers.\n\n${MO}A cracked circle. I've seen that before, scratched on the back of the crypt door, years back. I scrubbed it off and told nobody. Thought it was children. Children don't use tar.`,
          `${MO}Somebody's collecting the Long Storm. Bits of it. The keepsakes of the drowned. And whoever they are, they sing. Gray thread, candle smoke, hymns. A choir, I'd wager. A gray one.`,
          `${MO}I'll keep a lantern lit out here. You keep your eyes open in town. The dead I can handle. It's the living who worry me.`,
        ],
        reward: {
          levels: 6,
          crowns: 70,
          items: [{ item: "minecraft:lantern", amount: 1 }],
          codex: {
            id: "gray_choir_sign",
            title: "The Cracked Circle",
            text: "Someone is opening the graves from the Year of the Long Storm and taking the keepsakes buried in place of the drowned. They leave gray thread, black tar like the old bell rope, and hymns marked with a circle cracked straight through. Moss calls them a choir. A gray one.",
          },
        },
        rep: [{ guild: "wardens", amount: 10 }],
        hint: "The Old Graveyard is close to town; the tracker points the way. The clues glow faintly with particles: walk up to each one and tap near it. The zombies only count at night, inside the graveyard, so a torch, a sword and some patience are all you need.",
      },

      // 5 ------------------------------------------------------------------------------------------
      {
        id: "echo",
        title: "Fenn's Second Map",
        npc: "mara",
        intro: [
          `§eMara§r has Fenn's book open on her table and a butter knife in her hand, and she looks like she might cry or laugh, and hasn't decided.\n\n${M}I've been copying your map into the back, like I promised. The back cover was thicker than the front. Fenn never did anything thick by accident.`,
          `She slides out a thin sheet that was hidden in the binding. A round tower on a hill, drawn in Fenn's cramped hand, and under it: FOR M. WHEN THE SKY GOES WRONG.\n\n${M}The sky has gone wrong. Sol says so. You've seen it.`,
          { text: `${M}It's the Stargazer's Ruin, up on the high ground. Half the travelers in the realm copy my map in the square now, and not one of them has ever mentioned a tower. He must have left it off on purpose.`, when: SHARE },
          { text: `${M}It's the Stargazer's Ruin, up on the high ground. It's on the map we kept, but Fenn drew it so small I thought it was a smudge of ink. Of course it wasn't. Nothing of his was ever a smudge.`, when: KEEP },
          `${M}Go up there. He'll have left a puzzle, because he could never just leave a note like a normal person. I'd go myself, but I'd be angry at him the whole way, and he deserves you instead.`,
        ],
        objectives: [
          { type: "reach", label: "Climb to the Stargazer's Ruin", place: "observatory", radius: 16 },
          {
            type: "answer",
            label: "Answer Fenn's riddle on the lodestone",
            place: "observatory",
            radius: 12,
            question: "Words are scratched into the lodestone, in Fenn's hand:\n\nI MAPPED THE LAND BECAUSE IT CHANGES. I MAPPED ONE OTHER THING BECAUSE IT DOES NOT. IT NEVER CHANGES, AND IT ALWAYS MOVES. SAY ITS NAME AND I WILL ANSWER.",
            answers: ["the stars", "stars", "the star", "star"],
          },
          {
            type: "meet",
            label: "Listen to Fenn's echo",
            place: "observatory",
            radius: 12,
            who: FENN,
            pages: [
              "Something hums inside the lodestone, and a small pale shape unfolds out of it like smoke out of a pipe. It has an old man's voice, crackling at the edges, as if it was recorded through a wall.",
              `${F}Mara. If you're hearing this, I'm dead, the sky is wrong, and you have, against all odds, found a hidden pocket in a book. I'm proud of you. Now listen, because this echo is cheap and won't play twice.`,
              `${F}Long before us, there were people who read the sky. They built this tower. They wrote in sound, in crystal. Echoes, like this one. I call them the Starwrights, because no one else calls them anything.`,
              `${F}They held something down. Something under the world that listens. They pinned it with three seals: one in the Tide, one in the Stone, one in the Sky. I spent my life looking for them. I found the line they sit on. I never found the doors.`,
              `${F}The seals are cracked. They've been cracked since the Long Storm, and the town buried that night so deep nobody remembers what was lost. Don't trust anyone who sings about forgetting. And Mara... finish it. You were always better at finishing than I was.`,
            ],
          },
        ],
        outro: [
          `§eMara§r listens to every word you can remember. When you get to "finish it" she turns around and stares out of the window for a while.\n\n${M}He was always so dramatic. "This echo won't play twice." He made me rewrite my first map nine times.`,
          `${M}Three seals. Tide, Stone, Sky. And he found the line but not the doors.\n\nShe taps the three pins on his old map, and the line between them, and the chapel at the end of it.\n\n${M}Then that's where I start. Finding doors is just mapping with more swearing.`,
          `${M}And someone who sings about forgetting... Moss told me about the hymn page. That's no coincidence, and Fenn hated coincidences more than he hated rain.`,
          { text: `${M}I'm going to draw the Stargazer's Ruin onto the map in the square. Small. No label. Every traveler who copies it will carry a little question mark home. Fenn would have loved that. He loved making people curious.`, when: SHARE },
          { text: `${M}Good thing we kept the map. If the Starwrights hid three doors in the wild, I'd rather nobody with a gray hood had a copy of where the wild is. Fenn kept secrets for a reason. I'm starting to see it.`, when: KEEP },
        ],
        reward: {
          levels: 6,
          crowns: 80,
          journal: { entry: "fenn_echo", label: "Fenn's Echo" },
          codex: {
            id: "three_seals",
            title: "Fenn's Echo: The Three Seals",
            text: "Fenn hid an echo in the lodestone of the Stargazer's Ruin. Long ago a people he called the Starwrights read the sky, built that tower and wrote in sound frozen in crystal. They pinned something under the world that listens with three seals: Tide, Stone and Sky. The seals have been cracked since the Long Storm. Fenn found the line they sit on, but never the doors.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 10 }],
        hint: "The Stargazer's Ruin is on the highest ground near town, 300 to 700 blocks out; the tracker points the way. At the ruin, stand near the lodestone. Fenn mapped the land because it changes. What did he map that never changes, yet moves across the sky every night?",
      },

      // 6 ------------------------------------------------------------------------------------------
      {
        id: "inn",
        title: "The Inn Remembers",
        npc: "bea",
        end: "elsie",
        intro: [
          `§eBea§r is gutting fish with a violence the fish did not earn.\n\n${BE}You! Good. Sit. No, don't sit, stir that. I've got a pot boiling over and a boss who's gone quiet as a cold oven, and I don't like either one.`,
          `${BE}Last night some loudmouth at the bar starts in on the Long Storm. Ghost stories, drowned men, the bell. And Elsie, who laughs at everything, who'd laugh at her own funeral if the food was good, puts down the tray and walks out. Didn't come back till dawn.`,
          { text: `${BE}And since you shut that harbor bell up, she says the nights are too quiet. Quiet makes a person remember things. I've seen her standing at the window at three in the morning, staring at the sea like it owes her rent.`, when: SILENCE },
          { text: `${BE}And every time that bell of yours rings the tide in, she stops whatever she's doing and listens. Hand on the counter, head tilted. Like she's waiting for a different note. One that never comes.`, when: RING },
          `${BE}Twenty years I've cooked in this kitchen, and there's one thing she's never let me touch: the old trunk in the cellar. Lock rusted shut. This morning she asked me to bring it up. Tried to. The bottom fell clean out of it, rotten through.`,
          `${BE}So here's the recipe. She needs a good sturdy chest to put her things in. You bring her one, and you be there when she opens it. Don't push. Just be there. A pot boils faster when you stop staring at it.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Elsie a sturdy chest", npc: "elsie", item: "minecraft:chest", count: 1 },
          {
            type: "vision",
            label: "Help Elsie move her things into the new chest",
            scenes: [
              { title: "The Trunk", text: "Elsie kneels by the broken trunk in the cellar lamplight. She lifts things out one at a time, slowly, as if each one weighed more than it should.", seconds: 4 },
              { text: "A child's blue hair ribbon, faded almost white. Elsie holds it a moment longer than the rest, then folds it very small.", seconds: 5 },
              { text: "A brass plate stamped with a cracked circle, a twin of the sign on Moss's hymn page. She turns it face down without a word.", seconds: 5 },
              { text: "And a star chart, older than anything in the town, drawn in silver ink on something that isn't paper. Three marks glow faintly on it: a wave, a stone, a star.", sound: "chime.amethyst_block", seconds: 6 },
            ],
          },
        ],
        outro: [
          `§eElsie§r presses the lid of the new chest down with both hands and smiles at you, the way she smiles at everyone, warm as a hearth. It doesn't reach her eyes.\n\n${E}There. Much better. That old trunk was older than the inn. I should have let it go years ago.`,
          `${E}You want to know about the ribbon. Everyone always wants to know about the ribbon.\n\nShe tucks it into her apron.\n\n${E}I had a little sister. She loved the harbor more than anything. The Long Storm took her, the same night it took the tower. I was young. I was supposed to be watching her.`,
          `${E}The chart? Oh, that was Fenn's. He left it with me for safekeeping years ago, the old fox, and I never understood a line of it. And the plate is just a bit of junk from the tower, washed up after.\n\nShe says it all easily. Too easily, like a song she's practiced.`,
          `${E}Now. You'll eat something before you go. No, I insist. Starwright bread, my grandmother's recipe...\n\nShe stops. Corrects herself.\n\n${E}Starlight bread. That's what we call it. It's just bread with honey in it. Sit.`,
        ],
        choices: [
          {
            id: "rest",
            label: "Let it rest. Eat the bread.",
            set: { elsie: "rest" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "growers", amount: 10 }],
            reply: [`You eat the bread. It is very good. Elsie watches you eat it with something like relief, and something like grief, and pats your hand once before she goes back to the bar.\n\n${E}Thank you, dear. Some doors you open slowly.`],
          },
          {
            id: "pressed",
            label: "Press her: the chart was not Fenn's",
            set: { elsie: "pressed" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 10 }],
            reply: [`${E}No. It wasn't.\n\nFor one moment she looks very, very old.\n\n${E}And I'll tell you whose it was, when telling you won't get you killed. Not before. Eat your bread.\n\nShe doesn't speak to you again that night.`],
          },
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:bread", amount: 6, name: "Starlight Bread", lore: ["Honey, and something else.", "Elsie won't say what."] }],
          codex: {
            id: "elsie_trunk",
            title: "Elsie's Trunk",
            text: "In Elsie's rotten trunk: a child's blue ribbon (her little sister's, lost in the Long Storm, she says), a brass plate stamped with the Choir's cracked circle, and an ancient star chart in silver ink marked with a wave, a stone and a star. Elsie says the chart was Fenn's. She says it too easily. Once, she called her bread Starwright bread.",
          },
        },
        hint: "A chest is 8 planks in a ring on a crafting table. Bring it to Elsie at the inn and talk to her, then stay for the unpacking.",
      },

      // 7 ------------------------------------------------------------------------------------------
      {
        id: "song",
        title: "Song in the Dark",
        npc: "wren",
        end: "hollis",
        intro: [
          `§eWren§r grabs your sleeve with both hands, out of breath, hay in her hair.\n\n${W}You have to come, you have to come right now, okay, so I was up with Biscuit because Biscuit's the new foal and she had a tummy ache, and I looked out of the stable door and Brother Hollis walked RIGHT PAST.`,
          `${W}In his nightshirt! With no shoes! And his eyes were open but he wasn't looking at anything, and I said hi Brother Hollis, really loud, and he didn't even blink, and he was humming. Humming the skipping song. Slow, slow, quick.`,
          `${W}And there's this light. Like a little pale moth, but big, floating ahead of him, and wherever it goes he goes, and it went out past the chapel toward the wild country and I'm not allowed past the chapel at night. Elsie says.`,
          `${W}But you're allowed. You're allowed everywhere. Please follow him? He always gives me the end of the candle wax to make things with. He's nice. I don't want the moth to take him.`,
        ],
        objectives: [
          {
            type: "follow",
            label: "Follow the pale light Hollis follows",
            from: { place: "old_chapel" },
            to: { place: "choir_ring", radius: 30 },
            wisp: "Pale light",
            stray: 14,
          },
          {
            type: "stealth",
            label: "Creep close to the Gray Ring without being seen",
            place: "choir_ring",
            radius: 48,
            guards: { mob: "minecraft:vindicator", count: 4, name: "Gray Choir watcher" },
            goal: { dx: 0, dz: 8 },
            detect: 14,
            detectSneak: 5,
            onSpotted: "reset",
            hint: "Sneak the whole way in. The watchers walk the outside of the stones: wait until one turns its back, then move from stone to stone. If you're seen you'll lose them and have to start again from the edge.",
          },
          {
            type: "vision",
            label: "Listen to the Cantor",
            place: "choir_ring",
            radius: 16,
            dark: true,
            scenes: [
              { title: "The Gray Ring", text: "Gray hoods, a dozen or more, stand in a circle around a cracked bell half sunk in the earth. Hollis stands among them in his nightshirt, swaying. None of them look at him. All of them are humming.", seconds: 6 },
              { title: "The Cantor", text: "A tall figure in a hood darker than the rest lifts one hand, and the humming stops. §8The Cantor:§r Sisters. Brothers. The Lantern comes home. We have counted the nights, as we were taught.", seconds: 6 },
              { text: "§8The Cantor:§r Forty winters ago, one faithful man rang the broken note, and the sky broke with it. He was not finished. The sky was mended badly, with seals and lies. On the Lantern night, we finish his song.", sound: "block.bell.hit", seconds: 7 },
              { text: "§8The Cantor:§r Nothing lost. §7The circle answers: Nothing missed.§r §8The Cantor:§r The grieving will not grieve. The drowned will come home. All of it, all of us, held in the quiet forever.", seconds: 7 },
              { text: "§8The Cantor:§r And the little keeper hears our master now, every night. He will learn the rhythm. He will ring it for us. Won't you, Brother?\n\nAnd Hollis, eyes open, asleep, nods.", sound: "mob.warden.listening", seconds: 7 },
            ],
          },
        ],
        outro: [
          "When the hoods drift away into the dark, Hollis is left alone, curled asleep against the cracked bell like a child against a door. You carry him home. He weighs almost nothing.",
          `${H}I was... where? The stones? I don't remember the stones. I remember the tower, and the rain, and a man telling me I'm doing so well. So well.\n\nHe looks down at his bare, cut feet and starts to shake.`,
          `${H}They want me to ring it. Whatever "it" is. They think I'll do it.\n\nA long silence.\n\n${HV}And I might.§r ${H}No. No, I won't. Please don't let me.`,
          { text: `${H}You kept my secret. I know what that cost you. But I think it may be too big for the two of us now.`, when: { hollis: "secret" } },
          { text: `${H}You told me to go to Reyes. I didn't. I was ashamed. I'm so sorry. Now I don't know if there's time.`, when: { hollis: "urged" } },
        ],
        reward: {
          levels: 7,
          crowns: 90,
          codex: {
            id: "broken_note",
            title: "The Broken Note",
            text: "At the Gray Ring, a cult in gray hoods meets around a cracked bell. Their leader, the Cantor, says that forty winters ago a faithful man rang the broken note and broke the sky, and that on the Lantern night they will finish his song. Their creed: Nothing lost, nothing missed. They believe Hollis will learn the rhythm and ring it for them.",
          },
        },
        hint: "Go to the Old Chapel at night; the pale light waits there and leads toward the Gray Ring (400 to 900 blocks out). Keep up with it. At the stones, sneak: the watchers only spot a sneaking player who is almost on top of them.",
      },

      // 8 ------------------------------------------------------------------------------------------
      {
        id: "choice",
        title: "Report or Pursue",
        npc: "hollis",
        intro: [
          `§eBrother Hollis§r hasn't slept. He has lit every candle in the chapel, and he keeps touching them, one after another, to be sure they're warm.\n\n${H}I've been thinking about what's right, all night. I keep landing in two places.`,
          `${H}Warden Reyes should know. A cult in the hills, graves opened, a man walking out of town in his sleep. That's her work. She'd post guards. She'd keep people safe.`,
          `${H}But if she knows, everyone knows. The chapel shut, the keeper locked away. And the Choir would simply go quiet and wait. They're patient. They've waited forty years.`,
          `${H}Or you go back alone, and learn what they want before they know we're onto them. And nobody sees me as a danger to the town until I truly am one.\n\nHe tries to smile.\n\n${H}It's your choice. I trust you more than I trust myself right now.`,
        ],
        introChoices: [
          {
            id: "report",
            label: "Tell Warden Reyes everything",
            set: REPORT,
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 20 }],
            reply: [`${H}Yes. Yes, that's right. That's the safe thing.\n\nHe sits down hard on a pew.\n\n${H}Tell her I'll go quietly, if she wants me to. Tell her I'm sorry.`],
          },
          {
            id: "alone",
            label: "Go back to the Gray Ring alone",
            set: ALONE,
            inc: { "g:mercy": 1 },
            rep: [{ guild: "wayfarers", amount: 20 }],
            reply: [`${H}You'd do that? For me?\n\nHe looks at you as if you'd handed him back something he'd dropped in the sea.\n\n${H}Then go carefully. And come back. Please come back.`],
          },
        ],
        objectives: [
          { type: "talk", label: "Tell Warden Reyes what you saw", npc: "reyes", when: REPORT },
          {
            type: "inspect",
            label: "Search the empty Gray Ring by daylight (3)",
            place: "choir_ring",
            radius: 16,
            when: ALONE,
            clues: [
              { dx: 2, dz: 1, text: "The cracked bell is cold to the touch even in the sun. Someone has scratched tally marks around its lip. Hundreds of them. The last row is still white and fresh." },
              { dx: -5, dz: 3, text: "Ash from a fire, and in it a half-burned list of names in a careful hand. Most are crossed out. One is circled three times: HOLLIS. Next to it: THE KEEPER IS THE KEY. BRING HIM BEFORE HE WAKES." },
              { dx: 4, dz: -4, text: "Boot prints, many, heading back toward town in a straight line. Not wandering. Marching. Whoever they are, they mean to come for him soon." },
            ],
          },
          {
            type: "defend",
            label: "Defend Brother Hollis at the Old Chapel",
            place: "old_chapel",
            radius: 20,
            ward: HOLLIS_WARD,
            waves: [
              { mobs: ["minecraft:vindicator"], count: 3 },
              { mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 5 },
              { mobs: ["minecraft:pillager", "minecraft:vindicator", "minecraft:witch"], count: 6 },
            ],
            hint: "Stand close to Hollis inside the chapel and stop the gray hoods before they reach him. Pillagers shoot from range: close the distance or use a shield. Bring food and armor.",
          },
          {
            type: "defeat",
            label: "Defeat the Gray Hand, who leads them",
            place: "old_chapel",
            radius: 32,
            count: 1,
            champion: {
              tag: "realm:saga:gray_hand",
              mob: "minecraft:vindicator",
              name: "The Gray Hand",
              trait: "relentless",
              warn: "A voice outside the chapel door: Keeper. The Cantor sends for you. Come and sing.",
              health: 40,
              adds: { mobs: ["minecraft:vindicator"], count: 2 },
            },
          },
        ],
        outro: [
          { text: `§eWarden Reyes§r arrives at a run with four wardens behind her, just as the last gray hood falls.\n\n${R}A cult. In my hills. And a sleepwalking priest. And you told me. Good. That's how this is supposed to work. Mostly.`, when: REPORT },
          { text: `${R}I'll post a guard at the chapel day and night. Brother, you'll hate it. You'll live. That's an order, and for once it's not a mostly.`, when: REPORT },
          { text: "When the last gray hood falls, the chapel is very quiet. Nobody comes running. Nobody in town even knows there was a fight tonight. That was the point. It still feels lonely.", when: ALONE },
          { text: `${H}The list said bring him before he wakes. Wakes from what? I'm awake. I'm awake right now.\n\nHe pinches his own arm, hard, and keeps pinching.`, when: ALONE },
          `On the Gray Hand's belt you find a coil of black rope, tarred and very old, knotted every arm's length. Slow, slow, quick. Slow, slow, quick. The knots are the rhythm, tied so it can be counted in the dark.`,
          `${H}They came here for me. Into the chapel.\n\nHe looks at the candles, still burning, every one.\n\n${H}They didn't go out this time. Not once. I think that means something. I'm choosing to believe it means something.`,
        ],
        reward: {
          levels: 7,
          crowns: 100,
          codex: {
            id: "keeper_is_key",
            title: "The Keeper Is the Key",
            text: "The Gray Choir came for Brother Hollis at the chapel, led by a hooded enforcer called the Gray Hand. Their orders: the keeper is the key, bring him before he wakes. The Gray Hand carried an ancient tarred rope knotted in the broken rhythm, slow, slow, quick, so it could be counted in the dark.",
          },
        },
        hint: "If you chose Reyes, find her in town and talk to her first. If you went alone, go back to the Gray Ring and search the three faint clues. Then go to the Old Chapel: the attack comes there, and Hollis must survive it.",
      },

      // 9 ------------------------------------------------------------------------------------------
      {
        id: "count",
        title: "The Sky-reader's Count",
        npc: "sol",
        intro: [
          `§eSol§r has covered every wall of his room in chalk. Numbers, arcs, star names, crossings-out. He's standing on a chair to reach the ceiling.\n\n${S}Don't move. Don't breathe on anything. I'm almost there and I've been almost there for three days.`,
          `${S}The smudge has a tail now. A thin green tail. Comets have tails. Fenn would say that's obvious and I'd throw a shoe at him.`,
          { text: `${S}Elsie came up last night with bread and asked me how many nights. I told her I didn't know yet. She nodded and said, then count carefully, dear, as if she already had the answer and was only checking mine.`, when: { elsie: "rest" } },
          { text: `${S}Elsie came up last night. She didn't bring bread. She stood in the door, looked at the ceiling for a long time, and said: you've carried the four wrong. Then she left. She was right. How was she right?`, when: { elsie: "pressed" } },
          `${S}I need three sightings from the highest, darkest place we have: Fenn's ruin. Oriel, the Net, and the smudge itself, all in one night, through your spyglass. Then stay up there past midnight and count with me. Out loud, if it helps. It helps me.`,
          { text: `${S}And bring your eyes back down safely. Reyes has had wardens on the roads since you told her about the hoods. They'll wave you through. Probably. Reyes is a very literal person.`, when: REPORT },
          { text: `${S}And go quietly. You haven't told the wardens about the hoods, I can see it on you. Then no one will be watching the roads but them.`, when: ALONE },
        ],
        objectives: [
          { type: "use", label: "Sight Oriel, the Net and the smudge with a spyglass", item: "minecraft:spyglass", count: 3, place: "observatory", radius: 16 },
          { type: "vigil", label: "Count the stars at the Stargazer's Ruin after midnight", place: "observatory", radius: 16, seconds: 90, timeOfDay: [18000, 23000], outdoors: true },
          {
            type: "vision",
            label: "Look into the dark between the stars",
            place: "observatory",
            radius: 16,
            dark: true,
            scenes: [
              { text: "You lower the spyglass, and for a moment the stars don't come back. Only black. Not night. Something under night.", seconds: 4 },
              { text: "It goes down forever. It is not empty. It is a dark that listens. Every sound you have ever made is in it somewhere: your footsteps, your voice, a bell you struck three times underwater.", sound: "mob.warden.heartbeat", seconds: 7 },
              { text: "It is not angry. It is hungry, the way a cold room is hungry for warmth. It has been waiting a long time. It can wait a little longer. It is very good at waiting.", sound: "mob.warden.listening", seconds: 7 },
              { text: "Far above it, small and green and brave, a light crosses the sky. The dark turns toward the light, slowly, the way a sleeper turns toward a sound.", seconds: 6 },
              { text: "Then you're lying on your back on cold stone, the stars are where they belong, and your heart is going slow, slow, quick.", sound: "block.bell.hit", seconds: 5 },
            ],
          },
        ],
        outro: [
          `§eSol§r writes your numbers on the last clean patch of ceiling, then climbs down very slowly and sits on the floor.\n\n${S}It's a comet. It's coming back the way it came forty years ago, along the same road. The old songs called it the Lantern. I always thought that was poetry.`,
          `${S}Sixty nights. In sixty nights the Lantern passes overhead, and whatever the Choir means to ring, they mean to ring it then.\n\nYou tell him about the dark between the stars. He listens with his hands over his mouth.\n\n${S}Then that's what the seals hold down. Something that listens, and waits.`,
          { text: `${S}I'll tell the travelers who copy Mara's map in the square to look east. If the whole realm is watching the sky, it's harder for anyone to do something terrible under it.`, when: SHARE },
          { text: `${S}Mara's map is on her shelf, and the wild places are still wild. Good. If we need to hide something in the next sixty nights, we'll know where no one else will look.`, when: KEEP },
          `${S}Forty years ago a star broke and this town decided to forget. This time we remember. This time we're counting.\n\nHe presses a folded chart into your hands: the Lantern's road across the sky, in his wild, beautiful hand.`,
        ],
        reward: {
          levels: 10,
          crowns: 200,
          title: "Sky-Watcher",
          items: [{ item: "minecraft:paper", amount: 1, name: "Sol's Lantern Chart", lore: ["The Lantern's road across the sky.", "Sixty nights."] }],
          journal: { entry: "act1_signs", label: "Signs in the Sky" },
          codex: {
            id: "sixty_nights",
            title: "Sixty Nights",
            text: "The smudge is a comet the old songs called the Lantern, returning along the road it took forty years ago. Sol counts sixty nights until it passes overhead, and the Choir means to ring the broken note then. Looking up from the Stargazer's Ruin you saw what the seals hold down: a vast dark under the world that listens, and waits, and is very good at waiting.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 15 }],
        hint: "Go back to the Stargazer's Ruin with a spyglass and use it three times there (hold use to look through it). Then stay outside at the ruin, under open sky, between midnight and dawn for a minute and a half.",
      },
    ],
  },
];
