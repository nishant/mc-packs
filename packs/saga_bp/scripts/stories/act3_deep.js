// Story content: see docs/STORY_BIBLE.md. Written by the act3_deep writer.
// Act III of the main story, "Into the Deep" (bible section 7). Keep every id (story, chapter,
// choice, codex) stable once published: players' progress is saved by them.
/** @typedef {import("../types.js").Story} Story */

const I = "§eIda:§r ";
const T = "§eTobin:§r ";
const R = "§eReyes:§r ";
const E = "§eElsie:§r ";
const H = "§eHollis:§r ";
const MO = "§eMoss:§r ";
const BE = "§eBea:§r ";
const S = "§eSol:§r ";
const F = "§7Fenn's echo:§r ";
const V = "§5The voice:§r ";

const SAVED = { "g:hollis": "saved" };
const NOT_SAVED = { "g:hollis": "!saved" };
const SILENCE = { "drowned_bell.bell": "silence" };
const RING = { "drowned_bell.bell": "ring" };

/** The Herald's three riddles, shared by both versions of the duel. */
const RIDDLE_1 = `${V}I have no mouth, and I answer every voice. I live in caves and empty halls, and I am all that is left of the ones who built them. What am I?`;
const RIDDLE_2 = `${V}The more of me there is, the less you hear. The deep loves me best of all. Your town will have a great deal of me, soon. What am I?`;
const RIDDLE_3 = `${V}I come once in forty winters. I burn without wood. I was broken by a bell, and I was not the only thing broken that night. What am I?`;
const ANSWERS_1 = ["echo", "an echo", "the echo", "echoes", "echo shard", "an echo shard"];
const ANSWERS_2 = ["silence", "the silence", "quiet", "the quiet", "darkness", "the dark"];
const ANSWERS_3 = ["lantern", "the lantern", "comet", "the comet", "a comet", "star", "a star", "falling star"];

/** @type {Story[]} */
export const STORIES = [
  {
    id: "act3_deep",
    title: "Into the Deep",
    short: "Into the Deep",
    giver: "ida",
    kind: "main",
    act: 3,
    tones: ["scary", "exploration", "eerie", "dangerous", "mystery", "sad"],
    summary: "Ida has a crystal from Fenn's things, and it hums at night. Something under the stone remembers the Long Storm.",
    requires: { stories: ["act2_choir"] },
    chapters: [
      // 1 ---------------------------------------------------------------------------------------
      {
        id: "echoes",
        title: "Echoes in Crystal",
        npc: "ida",
        intro: [
          `§eIda§r sets a dark crystal on the anvil between you. It is the color of deep water, and it is humming. Very softly. Like someone in the next room.\n\n${I}From Fenn's things. Mara brought the box. It started at midnight. It hasn't stopped.`,
          `${I}Echo shard. Sound, frozen in crystal. Fenn knew. He wrote one word on the box: LISTEN. I tried. One shard is one voice in a crowd. I need more voices to make sense of it.`,
          { text: `${I}You put my band on the bell. Quiet harbor. Good. But quiet is when you hear the small things. This is a small thing that will not stay small.`, when: SILENCE },
          { text: `${I}You rang the bell with my clapper. Since then this shard hums in tune with it, every tide. Same note. That is not a coincidence. I do not believe in those.`, when: RING },
          `${I}Echo shards lie in the chests of the ancient cities, deep under the mountains, where the stone turns to sculk. Warden country. Do not fight it. Do not wake it. Sneak, or die.`,
          { text: `${I}Or. Expedition parties go down into the Sculk Depths. Old miners won't. They say the sculk down there grows one way only, toward the noise, toward something that listens. Walls full of echo. Clear it and bring the hum back on you. That will do.`, when: { "pack:expedition_bp": "on" } },
          { text: `${I}One more thing. Quill sent word through the back door: the Choir has diggers at the Abandoned Mine, hunting echoes. Learn to be quiet on them first. They forgive less than sculk does.`, when: { "g:quill": "trusted" } },
          { text: `${I}One more thing. Quill bought himself a softer cot from Reyes with one secret: the Choir has diggers at the Abandoned Mine, hunting echoes. Practice your quiet on them first.`, when: { "g:quill": "exposed" } },
        ],
        objectives: [
          {
            type: "stealth",
            label: "Sneak past the Choir diggers to their dig at the mine",
            place: "old_mine",
            radius: 24,
            guards: { mob: "minecraft:vindicator", count: 4, name: "Choir Digger" },
            goal: { dx: 0, dz: 10 },
            detect: 12,
            detectSneak: 4,
            onSpotted: "ambush",
            hint: "Hold sneak the whole way. The diggers spot a walking player at 12 blocks but a sneaking one only at 4, so circle wide around them.",
          },
          { type: "collect", label: "Have 4 echo shards (from ancient city chests)", item: "minecraft:echo_shard", count: 4, or: "shards", set: { shards: "city" } },
          {
            type: "event",
            label: "Clear the Sculk Depths expedition (any difficulty)",
            quest: { pack: "expedition_bp", id: "expedition_sculk_depths" },
            or: "shards",
            set: { shards: "depths" },
            when: { "pack:expedition_bp": "on" },
            hint: "Start an expedition with /realm:expedition and pick the Sculk Depths; any difficulty counts once you beat its boss. Bring friends: everyone in the party gets the credit.",
          },
        ],
        outro: [
          { text: "At the Choir's dig you find nothing but a hole, a broken pick and a hymn page with one line circled: THE STONE REMEMBERS THE NOTE. They were digging for echoes in the wrong rock. You found yours where the old cities sleep.", when: { shards: "!depths" } },
          { text: `§eIda§r lays your four shards in a ring around Fenn's. The humming changes. It becomes five voices, then a crowd, then something almost like words.\n\n${I}There. Hear it? Building. Somebody, long ago, building something down deep. And singing while they did it.`, when: { shards: "!depths" } },
          { text: "At the Choir's dig you find nothing but a hole, a broken pick and a hymn page with one line circled: THE STONE REMEMBERS THE NOTE. They were digging for echoes in the wrong rock. You went where the stone is all echo: the Sculk Depths.", when: { shards: "depths" } },
          { text: `§eIda§r holds Fenn's shard against your sleeve. It jumps in her fingers. The humming becomes a crowd, then something almost like words.\n\n${I}The Depths. You walked through a wall of voices and they stuck to you. There. Hear it? Building. Somebody, long ago, building something down deep. And singing.`, when: { shards: "depths" } },
          `${I}I worked all night. Soul lantern, iron cage, Fenn's shard in the heart of it. The rest tune it. Take it down below the deepslate line and it will play what the stone remembers.\n\nShe pushes it into your hands.\n\n${I}Lantern of the Deep. Don't drop it.`,
          `She taps the Choir's hymn page with one scarred finger.\n\n${I}THE STONE REMEMBERS THE NOTE. They want the broken note back. The one Ashgrave rang. If the stone remembers it, they mean to dig it up and learn it. We find it first.`,
        ],
        reward: {
          levels: 5,
          crowns: 80,
          items: [{ item: "minecraft:soul_lantern", amount: 1, name: "Lantern of the Deep", lore: ["Ida's lamp. It plays", "what the stone remembers."] }],
          codex: {
            id: "act3_echoes",
            title: "Echoes",
            text: "Echo shards are sound frozen in crystal. They lie in the ancient cities under the mountains, and they hum when they are near each other. Fenn left one in a box marked LISTEN. Ida tuned a lamp to them: the Lantern of the Deep, which plays what the stone remembers.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "Ancient cities are in the deep dark, under mountains, around y -50. Look for sculk and gray deepslate brick halls. Wear soft steps: sneak everywhere, never step on a sculk shrieker, and throw wool down over sensors. The Choir's dig is at the Abandoned Mine; the tracker points to it.",
      },
      // 2 ---------------------------------------------------------------------------------------
      {
        id: "lamp",
        title: "Lantern of the Deep",
        npc: "ida",
        intro: [
          `${I}The lamp needs depth. Below the deepslate line the stone is older than anything we have a name for. Go below forty under sea level. Hold the lamp. Wait. Listen.`,
          `${I}I don't know what it will show you. Echoes are not stories. They are just what was loud enough to stay. Could be a song. Could be a scream. Come back and tell me either way.`,
          { text: "§eMara§r catches you at the door, a roll of paper under her arm.\n\n§eMara:§r The map in the square marks every old shaft Fenn ever charted. Half the town has copied it. Use the deep ones, not the ones with skulls drawn on.", when: { "last_map.map": "share" } },
          { text: "§eMara§r catches you at the door and presses a folded sheet into your hand.\n\n§eMara:§r Fenn's private shaft chart. Nobody else has seen it; you kept the wild places wild, so I'm trusting you with the deep ones. Bring it back.", when: { "last_map.map": "keep" } },
          "The lamp is cold in your hand, colder than iron should be. When you lift it near your ear, you can hear something breathing in it. Slow. Patient. Very far away.",
        ],
        objectives: [
          { type: "reach", label: "Go deep: below y -40 with the lamp", belowY: -40 },
          {
            type: "vision",
            label: "Hold the lamp and hear the first echo",
            dark: true,
            scenes: [
              { title: "§7An echo, long ago", text: "Tall figures in long coats stitched with points of light cut a room out of living deepslate. Their tools make no sound. Only their singing does.", sound: "ambient.cave", seconds: 6 },
              { text: "They sing to the stone as they shape it, and the stone listens. You can feel it listening, the way you feel someone behind you in a dark room.", seconds: 6 },
              { text: "One of them looks straight up, through a mile of rock, as if she can see the sky. 'When the Lantern passes, the seal will drink,' she says. 'Forty winters of light. Then again. Then again.'", seconds: 7 },
              { text: "Far below the builders, something enormous turns over in its sleep. Every one of them stops singing at once.", sound: "mob.warden.heartbeat", seconds: 6 },
            ],
          },
        ],
        outro: [
          `You tell Ida everything. She listens with her hammer still in her hand, and doesn't put it down once.\n\n${I}Coats full of stars. Building a seal. Singing to stone.\n\nShe sets the hammer down very carefully.`,
          `${I}My master used to say the first relics weren't made, they were woken. He worked iron that fell from the sky, the year of the Long Storm. Said it was warm for a week. Said it hummed.\n\n${I}I thought he was old. Maybe he was right.`,
          `${I}Those people. The cities are theirs, I'd bet my anvil on it. Fenn had a name for them in his margins: the Starwrights. People who read the sky and built under the stone. And they were afraid of something down there.`,
          `${I}Something under the builders turned over and they all went quiet. You don't go quiet like that for a bear. You go quiet like that when the thing in the dark might hear you.\n\nShe picks the hammer back up.\n\n${I}Rest. The lamp is not done with you.`,
        ],
        reward: {
          levels: 4,
          crowns: 60,
          codex: {
            id: "act3_starwrights",
            title: "The Starwrights",
            text: "Long ago a people who read the sky built observatories on the mountains, vaults under the sea and cities deep under the stone. Fenn called them the Starwrights. The ancient cities are theirs. The first echo shows them carving a seal in the deepslate and singing to it, waiting for something called the Lantern to pass overhead.",
          },
        },
        hint: "Any deep cave or mineshaft works: dig a staircase down until your coordinates show y -41 or lower (the deepslate layer starts near y 0). The vision plays on its own once you are deep enough.",
      },
      // 3 ---------------------------------------------------------------------------------------
      {
        id: "mine",
        title: "The Abandoned Mine",
        npc: "ida",
        intro: [
          `${I}The lamp went quiet after you came up. Then, at dawn, it started pulling. Like a compass. Toward the old mine.\n\n${I}You've seen it. Boards over the mouth, rails going down into the dark.`,
          `${I}The miners sealed a tunnel down there the winter after the Long Storm. Bricked it up and walked away. Nobody has said why in forty years. The foreman drank himself quiet. I asked him once. He threw a mug at me.`,
          `${I}Cave spiders nest in the upper galleries now; the cobwebs are thick as curtains. Clear them. Then dig: the sealed door is under a lot of deepslate. Bring milk for the poison.`,
          "As you leave, Ida says one more thing without turning around.\n\n§eIda:§r If you hear singing down there, you come back up. That's not a suggestion.",
        ],
        objectives: [
          { type: "defeat", label: "Clear 10 cave spiders from the mine", mobs: ["minecraft:cave_spider"], count: 10 },
          { type: "mine", label: "Mine 40 deepslate to reach the sealed door", blocks: ["minecraft:deepslate"], count: 40 },
          {
            type: "inspect",
            label: "Read the miners' last notes at the mine",
            place: "old_mine",
            radius: 16,
            clues: [
              { dx: 3, dz: 2, text: "A page nailed to a beam, the ink run with damp: FOREMAN'S LOG. Day after the storm. The lower face is humming. The men say water in the rock. Water does not hum in tune." },
              { dx: -2, dz: 5, text: "Tucked in the rusted minecart: Jory won't come down anymore. Says the rock sang his name in his mother's voice. His mother is eleven years dead. I docked his pay. Forgive me. I heard it too." },
              { dx: 4, dz: -3, text: "Chalk on a board, steady hand: Bricked the tunnel today. Twelve of us went down. Nine came up. The three who stayed were singing when we laid the last brick. They sounded happy. That is the worst of it." },
              { dx: -4, dz: -4, text: "Scratched deep into the wood, small letters, over and over: IT IS NOT SINGING TO US. IT IS SINGING TO SOMETHING THAT LISTENS. DO NOT OPEN. DO NOT OPEN. DO NOT OPEN." },
              { dx: 0, dz: 7, text: "A child's drawing pinned under a lamp hook, gone brown with age: three stick men holding hands in a hole, smiling, with music notes coming out of their mouths. Under it, in a grown-up's hand: Tam drew this the night before. He was nine. He was not there." },
            ],
          },
        ],
        outro: [
          "The sealed door is old brick gone black with damp. You put your ear to it before you can stop yourself.\n\nNothing. Then, very faint, three voices, humming the same tune Fenn's shard hums. Happy. Forty years down there, and happy.",
          `You don't remember climbing out. Ida is waiting at the mine mouth with a lantern and a pickaxe, which she lowers when she sees your face.\n\n${I}You heard it.\n\nIt isn't a question. She reads the notes in silence.`,
          `${I}Something listens. That's what the Starwrights were afraid of. Not a beast. Something that listens, and sings back.\n\n${I}Three names on a wall at the graveyard. Moss tends them. He talks to the dead. Go talk to him.`,
          "That night you dream of a brick wall. On the other side of it, three men are humming, and one of them stops to say, very kindly, that there is room for one more.",
        ],
        reward: {
          levels: 6,
          crowns: 90,
          items: [{ item: "minecraft:milk_bucket", amount: 1 }, { item: "minecraft:torch", amount: 32 }],
          codex: {
            id: "act3_mine",
            title: "The Sealed Tunnel",
            text: "The winter after the Long Storm the lower face of the old mine began to hum. Twelve miners went down; three stayed, singing, and the rest bricked them in. The last note says: it is not singing to us, it is singing to something that listens. Behind the bricks, the three are still humming.",
          },
        },
        rep: [{ guild: "miners", amount: 15 }],
        hint: "Cave spiders spawn from the spawners in mineshaft cobwebs: torch the spawner and fight in the open. Deepslate is everywhere below y 0; any 40 count, and a pickaxe without Silk Touch still counts the block. The notes glow faintly around the mine entrance; tap near each one.",
      },
      // 4 ---------------------------------------------------------------------------------------
      {
        id: "listening",
        title: "The Listening Stone",
        npc: "moss",
        intro: [
          `§eMoss§r is sitting on a headstone eating an apple, which he offers you, which you decline.\n\n${MO}Jory, Brann and little Tam Hask. I dig round their stone every spring. Empty graves, of course. Hard to bury a man who's still humming.`,
          { text: `§eBrother Hollis§r stands at Moss's shoulder, thin and pale but steady.\n\n${H}I know where the singing goes. I have dreamed it every night. Down, under the old chapel. There is a stone there that listens. I think it is why the chapel was built.`, when: SAVED },
          { text: `${MO}Brother Hollis won't come near the chapel since the Choir business. He sits at the inn with his candle and doesn't sleep. He told me one thing before he stopped talking: the chapel was built on a stone that listens.`, when: NOT_SAVED },
          `${MO}Fenn knew too. Sat in that chapel for hours, Mara says. Not praying. Listening. Old Fenn pinned a line on a map and the line came home here.\n\n${MO}There's a loose stone under the window. Everybody's found it. Nobody's put their ear to what's under it.`,
          `${MO}Take your lamp. Put the lamp to the stone. And if a dead man starts talking, be polite. They hate it when you scream.`,
        ],
        objectives: [
          { type: "interact", label: "Lift the loose stone in the old chapel", place: "old_chapel", blocks: ["minecraft:mossy_cobblestone", "minecraft:cobblestone", "minecraft:stone_bricks", "minecraft:mossy_stone_bricks", "minecraft:cracked_stone_bricks", "minecraft:stone"], count: 1, radius: 8 },
          {
            type: "vision",
            label: "Hold the lamp to the listening stone",
            place: "old_chapel",
            radius: 10,
            dark: true,
            scenes: [
              { title: "§7The Year of the Long Storm", text: "Rain like thrown gravel. The harbor tower, whole and tall. A man in chapel gray climbs its stairs with the bell rope wound around his arm. His lips are moving.", sound: "ambient.weather.thunder", seconds: 6 },
              { text: "'She said Papa,' he whispers. 'In the dark, I heard her. It promised me. One note, and she comes home.' Brother Ashgrave. He has not slept in years.", seconds: 7 },
              { text: "Overhead the Lantern blazes across the storm, a comet bright as noon, its light pouring down toward three places in the world at once.", seconds: 6 },
              { text: "He rings. Not a call. A rhythm: three strokes and a stutter, a pattern no bell was made for. The note climbs and climbs.", sound: "block.bell.hit", seconds: 6 },
              { text: "A small boat fights the waves below. A big man rows like his arms are on fire, shouting a name up at the tower. He ties off and climbs.", seconds: 6 },
              { text: "The note cracks. High above, the Lantern splits like dropped glass and its pieces fall burning into the sea. The tower leans. The man from the boat has the rope in both fists.", sound: "random.explode", seconds: 7 },
              { text: "Then water. Then dark. Then, from under everything, a sound like something vast and patient, finally satisfied.", sound: "mob.warden.heartbeat", seconds: 7 },
            ],
          },
        ],
        outro: [
          `You come up out of the vision on the chapel floor with Moss holding your collar.\n\n${MO}Breathe. There you go. You were humming. I don't recommend it.`,
          "You tell him. The comet. The rhythm. The broken note. Ashgrave and the voice that promised him his daughter. Moss stops joking somewhere in the middle.",
          { text: `${H}He thought he was bringing her home.\n\nHollis is crying, very quietly.\n\n${H}It promises me things too. It sounds so kind. That is the worst part. It always sounds so kind.`, when: SAVED },
          `${MO}A big man in a rowboat. Climbing a tower in a storm to stop a madman.\n\nHe looks toward the harbor.\n\n${MO}That's Hal. Tobin's Hal. Tobin's thought for forty years his brother drowned chasing their father's boat. Somebody has to tell him. I think it has to be you.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          codex: {
            id: "act3_long_storm",
            title: "The Broken Note",
            text: "Forty winters ago Brother Ashgrave, keeper of the old chapel, climbed the harbor tower during the Lantern's pass. A voice from under the world had promised him his dead daughter back. He rang the bell in a rhythm it taught him, and the note cracked the Lantern. The comet shattered and fell into the sea. Hal, Tobin's brother, rowed out and climbed the tower to stop him. The chapel stands on a Starwright listening stone.",
          },
        },
        hint: "The loose stone is under the old chapel's window. Tap or hit any stone block near it while standing inside the chapel; the vision follows on its own. The tracker points to the Old Chapel.",
      },
      // 5 ---------------------------------------------------------------------------------------
      {
        id: "tobin",
        title: "Tobin's Silence",
        npc: "tobin",
        intro: [
          `§eOld Tobin§r is mending the same net he was mending when you met him. He doesn't look up until you've stood there long enough that he has to.\n\n${T}You've got a face on you. Out with it.`,
          "So you tell him. The tower. The bell. The rowboat in the waves, and the man who tied off and climbed, and had the rope in both fists at the end.\n\nTobin's hands stop moving on the net.",
          `${T}He went for the boat. That's what I thought. Our father's boat, and the fool went out in a storm for a bit of wood.\n\nHe swallows.\n\n${T}Forty years I was angry at him. For a boat.`,
          "He is quiet for so long that a gull lands on the dock, looks at the two of you, and leaves again. When Tobin speaks, his voice is very small.\n\n§eTobin:§r I never went to his stone. Not once. Too angry. Moss keeps it clean anyway. Moss keeps them all clean.",
          `${T}He went for the town. Didn't he.\n\nHe sets the net down and doesn't pick it back up.\n\n${T}Sit with me a while. Lighthouse. When the sun goes. He used to light the lamp up there for the boats. Then bring a rod. We'll see what's biting.`,
        ],
        objectives: [
          { type: "vigil", label: "Sit with Tobin at the lighthouse at dusk", place: "lighthouse", radius: 12, seconds: 60, timeOfDay: [11500, 13800], outdoors: true },
          { type: "fish", label: "Fish with Tobin: catch 3 fish", items: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"], count: 3 },
        ],
        outro: [
          "The sun goes down red over the water. Tobin doesn't say anything for the whole of it. Once he lifts his hand, like he's waving to a boat that isn't there.",
          { text: `${T}Hear that? The bell. Tide's moving the clapper.\n\nHe almost smiles.\n\n${T}He'd have liked that. He hated quiet water. Said quiet water's just the sea holding its breath.`, when: RING },
          { text: `${T}Quiet. No bell. Good.\n\nHe looks at the flat dark sea a long time.\n\n${T}That bell killed him. I'm glad it's choking on Ida's band. Is that wrong? Don't answer.`, when: SILENCE },
          `When you've caught three, he takes the last fish off your hook himself, the way you'd do it for a boy.\n\n${T}I taught Hal that knot. He was six. I slapped his hand every time he got it wrong. I'd give the rest of my years for one more wrong knot.`,
          `${T}Take his rod. And his compass: it always found the way home, which is more than he ever did. Been in my shed forty years, waiting for somebody worth it. Go on. And when you find whatever's under there, whatever he died fighting, you give it one from Hal.`,
        ],
        reward: {
          levels: 4,
          crowns: 50,
          items: [{ item: "minecraft:fishing_rod", amount: 1, name: "Hal's Rod", lore: ["He went for the town.", "Not for the boat."] }],
          relic: "hal_compass", // the Relics pack's story relic (realm:relic_give); no other story gives it
          codex: {
            id: "act3_hal",
            title: "How Hal Died",
            text: "For forty years Tobin believed his brother Hal drowned chasing their father's boat in the Long Storm. The truth: Hal rowed out to the harbor tower, climbed it, and fought Ashgrave for the bell rope as the Lantern broke. He died trying to save the town. Tobin gave you Hal's rod.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 10 }],
        hint: "Dusk is the hour when the sun sets (around 6 in the evening on the game clock). Stand outdoors on or beside the lighthouse balcony from sunset until it is dark. Any water works for the fishing afterward.",
      },
      // 6 ---------------------------------------------------------------------------------------
      {
        id: "flame",
        title: "The Leaning Flame",
        npc: "ida",
        intro: [
          `${I}The lamp. Look at it.\n\nThe soul flame inside Ida's lamp is leaning, hard, like a candle in a draft. It points down and away, steady as a lodestone.\n\n${I}It wants to go home. To the room it heard being built.`,
          `${I}The miners' rails go deeper than their brick wall. Older galleries, from before anybody's grandfather. The flame leans that way. Follow it. It will wait if you fall behind. It's more patient than me.`,
          { text: `${I}Hollis came by at dawn. Said his dream changed last night. A door with chains on it, deep down. And something knocking. Politely. From the other side.`, when: SAVED },
          { text: `${I}Moss says Hollis wrote one line on the inn wall last night, then scrubbed it off before anyone woke: THE DOOR IS CHAINED FROM THE WRONG SIDE. Moss copied it first. Moss always copies it first.`, when: NOT_SAVED },
          `${I}Take torches. A lot. If we end up fighting down there I want light the whole way. Put them up around whatever you find. Then come back and tell me what it looks like. Do not touch it. That one is an order.`,
        ],
        objectives: [
          { type: "follow", label: "Follow the lamp's leaning flame down from the mine", from: { place: "old_mine" }, to: { place: "seal_stone" }, wisp: "the leaning flame", stray: 16 },
          { type: "place", label: "Light the seal room: place 12 torches or lanterns", place: "seal_stone", radius: 24, blocks: ["minecraft:torch", "minecraft:soul_torch", "minecraft:lantern", "minecraft:soul_lantern"], count: 12 },
        ],
        outro: [
          "The flame does not stop at the miners' bricks. It never meant the bricks. It leads you past them, down an older shaft with steps cut for longer legs than yours, into a room of black deepslate veined with sculk. At the far end, a door. Chained.",
          "Carvings run around the frame: tall figures in coats full of stars, and three circles in a row. A wave. A stone. A star. On the floor in front of the door, in fresh chalk, someone has drawn the Gray Choir's sign. Many someones. Recently.",
          `§eIda§r hears you out with her arms folded tight.\n\n${I}Chalk. So they mean to sing to it. Then we get there first and stay there. Eat. Sleep. Sharpen everything you own. Then we go down and hold that room.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:torch", amount: 32 }],
          codex: {
            id: "act3_seal_room",
            title: "The Room Below the Mine",
            text: "Below the miners' brick wall, an older shaft with steps cut for taller people leads to a Starwright room of deepslate and sculk with a chained door. Its frame shows three circles in a row: a wave, a stone, a star. The Gray Choir has been there first and left its sign in chalk.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "Start at the Abandoned Mine and follow the pale flame; it waits up to 16 blocks ahead. Bring a water bucket for long drops and a pickaxe for cave-ins. Place the 12 lights anywhere within 24 blocks of the chained door.",
      },
      // 7 ---------------------------------------------------------------------------------------
      {
        id: "seal",
        title: "The Stone Seal",
        npc: "ida",
        intro: [
          `${I}Starwright seal. The thing they sang to sleep. If the Choir rings their broken note again when the Lantern comes, that is what wakes.\n\n${I}My lamp has one trick left. Hold it to the door and the seal drinks. Keep the room while it does.`,
          { text: `${R}I'm sending two wardens down after you with a spare pick and a lot of torches. Don't argue. You told me everything once, and it saved lives. That's an order. Mostly.`, when: { "act1_signs.act1:path": "!alone" } },
          { text: `${I}Reyes doesn't know. You chose to go alone once, after the Choir, and you came back. I'm trusting that again. Don't make me wrong.`, when: { "act1_signs.act1:path": "alone" } },
          `${I}The chalk says they're coming. Let them find you waiting. Whatever happens, keep the lamp near the door. And if the stone starts to sing, sing louder. I don't know if that works. Nobody does.`,
          "On the way down, the sculk on the walls ticks and clicks as you pass, like something counting your footsteps. The lamp in your hand is warm for the first time. It knows where it is going.",
        ],
        objectives: [
          {
            type: "defend",
            label: "Hold the Stone Seal while the lamp charges it",
            place: "seal_stone",
            radius: 16,
            waves: [
              { mobs: ["minecraft:zombie"], count: 6 },
              { mobs: ["minecraft:vindicator", "minecraft:pillager"], count: 5 },
              { mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:vindicator"], count: 8 },
            ],
          },
          {
            type: "vision",
            label: "Listen as the seal drinks the lamp's light",
            place: "seal_stone",
            radius: 16,
            scenes: [
              { text: "The lamp's flame stretches toward the chained door like a hand. Cracks of pale light open in the reinforced deepslate and run along the floor.", seconds: 5 },
              { text: "Then the light gutters. The seal drinks and drinks and is not full. A crack runs up the middle of the door with a sound like ice on a lake.", seconds: 6 },
              { text: "And from far, far below, through a mile of stone, something roars.", sound: "mob.warden.roar", seconds: 6 },
            ],
          },
        ],
        outro: [
          "The roar goes through the floor, through your boots, through your teeth. The sculk on the walls pulses all at once. Then everything is quiet again, and the crack in the seal is wider than when you came.",
          { text: "Reyes's wardens find you sitting against the wall, the lamp dark in your lap. One of them is very young. He doesn't stop shaking until you're back on the surface.", when: { "act1_signs.act1:path": "!alone" } },
          { text: "Nobody comes. You climb out alone, the lamp dark in your lap, and every vibration in the stone behind you sounds like footsteps.", when: { "act1_signs.act1:path": "alone" } },
          `${I}A roar. Like the bell's keeper, all those months ago, only bigger.\n\nShe turns the dead lamp over in her hands.\n\n${I}The lamp wasn't enough. Not nearly. The seal needs the real thing. It needs the Lantern.`,
          `${I}And the roar. Something down there heard us knocking. If it comes up the shaft, we will not stop it with picks. Nobody goes near that door again without a plan. Not you. Not me.`,
        ],
        reward: {
          levels: 7,
          crowns: 110,
          items: [{ item: "minecraft:golden_apple", amount: 2 }],
          codex: {
            id: "act3_seals",
            title: "The Hollow and the Seals",
            text: "The Starwrights could not kill what lies at the bottom of the world: the Hollow, a hunger that listens to every sound, the thing the sculk grows toward. The Warden is one of its ears. They bound it with three seals (Tide, Stone and Sky) fed by the Lantern's light. The Stone Seal lies deep under the stone. It is cracked, and the lamp could not fill it.",
          },
        },
        rep: [{ guild: "miners", amount: 15 }],
        hint: "Go back down to the Stone Seal (around y -45; the tracker points to it). Bring a shield, food and a bow: the waves come from every tunnel. Stay within 16 blocks of the chained door until the last wave falls, and the vision follows.",
      },
      // 8 ---------------------------------------------------------------------------------------
      {
        id: "herald",
        title: "The Herald's Voice",
        npc: "reyes",
        intro: [
          { text: `§eWarden Reyes§r meets you on the road, out of breath.\n\n${R}Hollis locked himself in the old chapel at dawn. He's talking. It isn't his voice. My wardens won't go in. I won't order them to. Not for this.`, when: NOT_SAVED },
          { text: `${R}It asked for you. By name. It said: tell the one with the lamp that the stone is cracked, and I can hear them through the crack. Then it laughed in Hollis's mouth, and Hollis started crying at the same time.`, when: NOT_SAVED },
          { text: `§eWarden Reyes§r meets you on the road, out of breath.\n\n${R}The Choir man we took at the Gray Ring. Chained in the crypt at the graveyard, Moss watching him. Since the seal cracked he speaks in another man's voice. An old one.`, when: SAVED },
          { text: `${R}Hollis is with Moss down there. He says he knows that voice better than his own. It asked for you by name. It says the stone is cracked, and it can hear us all through the crack.`, when: SAVED },
          `${R}Whatever it is, it wants a game. Riddles. Moss tried one and got it wrong, and the dead came up out of the ground for him. He's fine. Mostly. Think before you answer. That's an order.`,
        ],
        objectives: [
          { type: "answer", label: "Answer the voice's first riddle at the chapel", when: NOT_SAVED, place: "old_chapel", radius: 10, question: RIDDLE_1, answers: ANSWERS_1, failSpawn: { mobs: ["minecraft:drowned"], count: 3 } },
          { type: "answer", label: "Answer the voice's second riddle at the chapel", when: NOT_SAVED, place: "old_chapel", radius: 10, question: RIDDLE_2, answers: ANSWERS_2, failSpawn: { mobs: ["minecraft:drowned", "minecraft:zombie"], count: 4 } },
          { type: "answer", label: "Answer the voice's third riddle at the chapel", when: NOT_SAVED, place: "old_chapel", radius: 10, question: RIDDLE_3, answers: ANSWERS_3, failSpawn: { mobs: ["minecraft:drowned", "minecraft:vindicator"], count: 5 } },
          { type: "answer", label: "Answer the voice's first riddle in the crypt", when: SAVED, place: "graveyard", radius: 12, question: RIDDLE_1, answers: ANSWERS_1, failSpawn: { mobs: ["minecraft:zombie"], count: 3 } },
          { type: "answer", label: "Answer the voice's second riddle in the crypt", when: SAVED, place: "graveyard", radius: 12, question: RIDDLE_2, answers: ANSWERS_2, failSpawn: { mobs: ["minecraft:zombie", "minecraft:skeleton"], count: 4 } },
          { type: "answer", label: "Answer the voice's third riddle in the crypt", when: SAVED, place: "graveyard", radius: 12, question: RIDDLE_3, answers: ANSWERS_3, failSpawn: { mobs: ["minecraft:vindicator", "minecraft:skeleton"], count: 5 } },
        ],
        outro: [
          `${V}Clever. Hal was clever too. He climbed so fast. He had the rope in both hands, and I let him have it, and the sea took us both.\n\nA soft, terrible laugh.\n\n${V}I rang it once. When the Lantern comes, I will ring it again.`,
          `${V}Do you know what it gave me, for the note? Nothing. Her voice, in the dark, forever, just out of reach. Nothing lost, nothing missed. You will understand. Everyone does, at the bottom.\n\nThen the voice is gone, and the room is only a room.`,
          { text: `Hollis slumps against the pew, then grabs your sleeve with his own hand, his own eyes.\n\n${H}Please. It is still in here. It is offering to leave if you give it the lamp. If you say no, I do not know what it will do with me.`, when: NOT_SAVED },
          { text: `The prisoner sags in his chains, a frightened farmhand again, sobbing. Hollis kneels beside him.\n\n${H}He heard it for years. Like I did. He is not the voice. He is just the room it was standing in.`, when: SAVED },
          { text: `${H}What happens to him now is up to you. Reyes will listen to you. Everybody does, now.`, when: SAVED },
        ],
        choices: [
          {
            id: "hold",
            label: "Hold on to Hollis and call him back",
            requires: { flags: NOT_SAVED },
            set: { "g:hollis": "saved" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "growers", amount: 15 }],
            reply: [
              `You keep his hands in yours and say his name. Again. Again. The voice laughs, then snarls, then fades like a wave pulling back.\n\n${H}I am here. I am still here. Thank you. I did not think anyone would stay.`,
              `${R}He walks out on his own feet. I'll take that. I'll put a warden at the chapel door day and night, and Moss says he'll sit up with him. Moss says the dead are poor company anyway.`,
            ],
          },
          {
            id: "bell",
            label: "Ring the chapel bell and drive the voice out",
            requires: { flags: NOT_SAVED },
            set: { "g:hollis": "lost" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 15 }],
            reply: [
              "You haul the bell rope. The voice shrieks and is gone, and Hollis goes with it: up off the floor and out the door into the dusk, running for the sea, singing. By the time you reach the shore there is nothing on it but footprints going into the water.",
              `${R}The town's safe tonight. I'll say that much. I'll have the wardens walk the shore with lanterns till dawn, calling his name. I don't expect an answer. I'll do it anyway.`,
            ],
          },
          {
            id: "free",
            label: "Ask Reyes to let the prisoner go home",
            requires: { flags: SAVED },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "growers", amount: 15 }],
            reply: [`${R}Against my better judgment. Fine. He goes home to his farm, and a warden goes with him for a month. If he so much as hums, he's back in chains.`],
          },
          {
            id: "chains",
            label: "Keep the prisoner in chains",
            requires: { flags: SAVED },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 15 }],
            reply: [`${R}Good. He stays until the Lantern's passed. Whatever was in him might come back, and I'd rather it found iron than a front door.`],
          },
        ],
        reward: {
          levels: 6,
          crowns: 90,
          codex: {
            id: "act3_herald",
            title: "The Hollow Herald",
            text: "Something speaks through the ones who hear the song: a voice that remembers the tower, the rope and Hal's hands on it. It says it rang the bell once, and will ring it again when the Lantern returns. The drowned keeper of the old chapel did not stay dead. The Hollow kept him as its voice: the Herald.",
          },
        },
        hint: "Stand inside the place the tracker shows and type each answer when asked. Think about sound: what answers every voice, what grows when sound dies, and what comes once in forty winters and was broken by a bell. A wrong answer only brings an ambush; you can try again.",
      },
      // 9 ---------------------------------------------------------------------------------------
      {
        id: "apron",
        title: "Elsie's Apron",
        npc: "bea",
        end: "elsie",
        intro: [
          `§eBea§r drags you into the inn's kitchen by the elbow and shuts the door with her hip.\n\n${BE}Sit. Don't talk. Listen. I've been cooking in this kitchen twenty years and I know when a pot's been hiding something under the lid.`,
          `${BE}Last night the lamps went out in the storm. Pitch dark. And Elsie's apron was glowing. The hem. Little points of light stitched right in, like somebody sewed the stars down so they wouldn't run off.`,
          `${BE}Then the lamps came back and it was just an apron. She looked at me like I'd caught her with her hand in the till. Forty years she's run this inn. She hasn't aged a day of it. I asked my mother. She said the same.`,
          `${BE}You're the one everybody tells things to. Take her a honey bottle; nobody lies with honey on their tongue, I've proved it a hundred times. Then stay the night. Whatever she shows you, I want the whole recipe.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Elsie a honey bottle, Bea's way", npc: "elsie", item: "minecraft:honey_bottle", count: 1 },
          {
            type: "sleep",
            label: "Sleep a night under Elsie's roof",
            vision: [
              { title: "§7A memory, not yours", text: "A girl in a coat stitched with points of light stands on a mountain beside a stone dome, her hand in her mother's. Above them a comet crosses the sky.", seconds: 6 },
              { text: "The same girl, older, alone, cutting a sliver of the comet's light and sewing it into a hem by candlelight. Her people's cities are empty. The sculk has them.", seconds: 6 },
              { text: "A woman who looks exactly like Elsie stands at the inn window in the Long Storm, watching the harbor tower. She is running. She is too late. She is always too late.", sound: "ambient.weather.thunder", seconds: 7 },
              { text: "You wake before dawn. Downstairs, someone is sitting by the dead hearth in the dark, and the hem of her apron is full of stars.", seconds: 5 },
            ],
          },
        ],
        outro: [
          `§eElsie§r does not offer you breakfast. That is how you know.\n\n${E}You saw. The light remembers for me. I am the last of them, child. The Starwrights. The others went into the deep cities and the song took them one by one. I sewed a sliver of the Lantern into this hem, and it kept me.`,
          `${E}I built this inn to watch the chapel. Every keeper, for longer than this town has had a name. I saw Ashgrave failing. I told myself he was only grieving. The night of the storm I ran for the tower and the tower was already falling.`,
          { text: `${E}You've been gentle with people, all this way. I've watched. I don't deserve gentle. Say what you came to say.`, when: { "g:mercy": ">=3" } },
          { text: `${E}You've been hard when it was needed. I've watched. Don't soften it for me now. Say what you came to say.`, when: { "g:iron": ">=3" } },
          { text: `${E}You've been neither soft nor hard with people, all this way. Just there, when it counted. I've watched. Say what you came to say.`, when: { "g:mercy": "<=2", "g:iron": "<=2" } },
        ],
        choices: [
          {
            id: "forgive",
            label: "Forgive her",
            set: { elsie: "forgive" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "growers", amount: 20 }],
            reply: [
              `She takes your hand in both of hers and holds it the way she holds a cup on a cold morning.\n\n${E}Forty winters I've waited for somebody to say that. I never once thought I'd let them. Light keep you, child. Now. Breakfast.`,
            ],
          },
          {
            id: "condemn",
            label: "Condemn her silence",
            set: { elsie: "condemn" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 20 }],
            reply: [
              `She nods, slowly, as if you've told her the weather.\n\n${E}Yes. Forty years. Hal. The miners. Ashgrave. All of it while I poured ale and said nothing. You're right. Keep being right. Somebody should.`,
            ],
          },
        ],
        reward: {
          levels: 6,
          crowns: 80,
          codex: {
            id: "act3_elsie",
            title: "The Last Starwright",
            text: "Elsie the innkeeper is the last of the Starwrights, kept alive for longer than the town has stood by a sliver of the Lantern sewn into her apron hem. She built the inn to watch the chapel and its keepers. She saw Ashgrave falling and did not stop him in time, and has carried it for forty years.",
          },
        },
        hint: "Honey bottles come from a full beehive or bee nest: use a glass bottle on it, with a campfire underneath so the bees stay calm. Give it to Elsie, then sleep in any bed at night; the dream plays as you sleep.",
      },
      // 10 --------------------------------------------------------------------------------------
      {
        id: "keys",
        title: "Three Keys",
        npc: "elsie",
        end: "elsie",
        intro: [
          { text: `${E}You stayed. After all that, you stayed for breakfast. Eat. Then listen, because I'm done keeping things.`, when: { elsie: "forgive" } },
          { text: `§eElsie§r sets a plate in front of you anyway and doesn't sit down.\n\n${E}You don't have to like me to hear this. Eat. Then listen, because I'm done keeping things.`, when: { elsie: "condemn" } },
          `${E}Every seal has a key: a heart-stone in its frame that drinks the Lantern's light and holds it for forty winters. The Long Storm cracked all three. A lamp of echoes cannot relight a key. Only a piece of the Lantern can.`,
          `${E}The Lantern is coming back. Sol has been watching it grow for months. It will pass over us once, for one night, and the keys must be ready to drink when it does, or they never will again.`,
          `${E}Fenn knew most of this. He came to me with his maps, years ago, and I told him half and let him guess the rest. He left an echo at his tower for Mara. I think there's a second voice in it now. One meant for whoever carried a lamp.`,
          `${E}Go to Sol first. Then the Stargazer's Ruin. Then come home to me, and I'll give you what I should have given someone forty years ago.`,
        ],
        objectives: [
          { type: "talk", label: "Ask Sol what the sky is doing", npc: "sol" },
          {
            type: "meet",
            label: "Hold up the lamp at the Stargazer's Ruin and hear Fenn's second echo",
            place: "observatory",
            radius: 10,
            who: { id: "old_fenn", name: "Fenn's echo", entity: "minecraft:allay" },
            pages: [
              `A pale shape gathers in the lamp light, small and blue and flickering, and it clears its throat exactly the way Mara does.\n\n${F}If you can hear this, you have a lamp of echoes, which means Ida finally listened to me. Tell her I said so.`,
              { text: `${F}And Mara gave my map to the whole realm. Good. A secret only one person keeps is just a slow way of losing it.`, when: { "last_map.map": "share" } },
              { text: `${F}And Mara kept my map close. Good. Some roads should only be walked by people who earned them.`, when: { "last_map.map": "keep" } },
              `${F}Three keys. Tide in a guardian's vault under the sea. Stone in the deep, where you've already been, I expect. Sky above the clouds, higher than birds go. Elsie will tell you the rest. She owes me a drink and you a truth.`,
          `${F}The Lantern breaks the dark for one night. The keys drink. Then forty years of quiet. I used to think that was sad, living from light to light. Now I think it is just what everyone does. We just don't usually get the dates.`,
              `${F}I mapped the world to find three rooms, and I found them, and I was too old and too afraid to walk to them. Don't be me. Walk.`,
            ],
          },
          { type: "vigil", label: "Watch the sky from the ruin at night", place: "observatory", radius: 16, seconds: 60, timeOfDay: [13000, 23000], outdoors: true },
        ],
        outro: [
          "From the top of the ruin you see it without a spyglass for the first time: the Lantern, low in the east, no longer a smudge but a white streak with a tail like spilled milk. Down in town, every window is lit. Everyone is outside. Everyone is looking up.",
          `§eElsie§r is waiting on the inn steps with a pair of sewing shears. Before you can stop her she cuts one point of light out of her apron hem. Her hand shakes. A gray hair you've never seen falls across her face.\n\n${E}No. Let me. It's mine to give.`,
          `${E}A Lantern shard. The last free piece of it in the world. It will light your way in the dark, and it will pull toward any seal that needs it. When the keys are ready, it will know.`,
          `${E}Each seal needs friends to reach it. Ida's miners to dig. Sol's wayfarers to ride. Who stands with you first is yours to choose, child. Choose people you'd want beside you at the end.`,
        ],
        choices: [
          {
            id: "miners",
            label: "Ask the Miners to stand with you",
            set: { keys: "miners" },
            rep: [{ guild: "miners", amount: 30 }],
            reply: [`§eIda§r is already outside with forty miners and their picks.\n\n${I}We dig. You walk. Nobody else gets left behind a brick wall. Not again.`],
          },
          {
            id: "wayfarers",
            label: "Ask the Wayfarers to stand with you",
            set: { keys: "wayfarers" },
            rep: [{ guild: "wayfarers", amount: 30 }],
            reply: [`§eSol§r arrives with the wayfarers, saddles creaking, every face turned to the sky.\n\n${S}Vega, Arcturus, and the Lantern rising between them. We ride by its light, my friend, wherever you point.`],
          },
        ],
        reward: {
          levels: 10,
          crowns: 250,
          relic: "lantern_shard",
          journal: { entry: "act3_deep", label: "Into the Deep" },
          codex: {
            id: "act3_lantern",
            title: "The Lantern and the Keys",
            text: "The Lantern is a comet that passes once every forty winters. Its light relights the three seals through a key set in each one. The Long Storm cracked all three keys, and only a piece of the Lantern can relight them. It is coming back this year, visible now to everyone. Elsie cut the last free shard from her own apron and gave it to you.",
          },
        },
        hint: "Talk to Sol first. The Stargazer's Ruin is on the highest ground nearby; the tracker points to it. Fenn's echo appears there; talk to it. Then stay outdoors at the ruin after dark for a minute, and go back to Elsie at the inn.",
      },
    ],
  },
];
