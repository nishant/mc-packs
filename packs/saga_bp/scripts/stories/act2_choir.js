// Story content: see docs/STORY_BIBLE.md. Written by the act2_choir writer.
// Act II of the main story: The Gray Choir. Keep every id (story, chapter, choice) once published.
/** @typedef {import("../types.js").Story} Story */

const R = "§eReyes:§r ";
const Q = "§eQuill:§r ";
const P = "§ePip:§r ";
const I = "§eIda:§r ";
const H = "§eHollis:§r ";
const MO = "§eMoss:§r ";
const V = "§5Vesna:§r ";
const C = "§7The Cantor:§r ";
const B = "§eBram:§r ";
const T = "§eTobin:§r ";
/** Hollis when something else is speaking through him. */
const HX = "§eHollis:§r §7§o";

const ALONE = { "act1_signs.act1:path": "alone" };
const WARDENS = { "act1_signs.act1:path": "!alone" };
const SILENCE = { "drowned_bell.bell": "silence" };
const RING = { "drowned_bell.bell": "ring" };
const TRUSTED = { "g:quill": "trusted" };
const EXPOSED = { "g:quill": "exposed" };

const FARM_1 = { x: 180, z: 90 };
const FARM_2 = { x: -150, z: 210 };
const FARM_3 = { x: 70, z: -260 };
const CAMP = { x: 330, z: -470 };

const CHOIR_MOBS = ["minecraft:pillager", "minecraft:vindicator"];
const PIP = { id: "pip", name: "Pip", entity: "minecraft:villager_v2" };
const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);

/** @type {Story[]} */
export const STORIES = [
  {
    id: "act2_choir",
    title: "The Gray Choir",
    short: "The Gray Choir",
    giver: "reyes",
    kind: "main",
    act: 2,
    tones: ["stealth", "violent", "mystery", "tragic", "dangerous"],
    summary: "Gray thread on the farm fences. A boy gone in the night. Warden Reyes is done waiting for the Choir to make the next move.",
    requires: { stories: ["act1_signs"] },
    chapters: [
      // 1. The Pattern
      {
        id: "pattern",
        title: "The Pattern",
        npc: "reyes",
        intro: [
          `§eWarden Reyes§r has three strands of gray thread pinned to her map, each beside a farm.\n\n${R}Found these on fence posts. Knotted, not snagged. Three farms in four nights. Somebody is counting something.`,
          { text: `${R}You went after the Choir alone last time. I haven't forgotten, and I haven't decided if I'm angry. So this time you go where I point. That's an order. Mostly.`, when: ALONE },
          { text: `${R}You did right, telling me about the Gray Ring. My wardens have watched the roads since. And still the thread shows up. They walk past my guards like we're furniture.`, when: WARDENS },
          `${R}Go to each farm. Look properly: the ground, the fences, the doors. The thread means something, and I want to know what before it means it to my face.`,
          `${R}Last thing. Take a sword. The farmers say they hear singing at night now. Low, from the fields. Nobody goes out to check. Smart farmers.`,
        ],
        objectives: [
          {
            type: "inspect",
            label: "Search the first farm for signs of the Choir",
            offset: FARM_1,
            mark: "Marsh farm",
            radius: 20,
            clues: [
              { dx: 3, dz: -2, text: "Gray thread, knotted three times around the fence post. The knots are neat, patient. Whoever tied this was not in a hurry." },
              { dx: -4, dz: 5, text: "Footprints in the soft dirt by the well: bare feet, a dozen pairs, all walking in step. They stop at the edge of the field as if the walkers simply stood there a long while." },
              { dx: 5, dz: 4, text: "The Marshes' dog, tied by the barn, will not stop shaking. Its water bowl has been knocked over and refilled with seawater. Someone walked a long way to carry salt water inland." },
            ],
          },
          {
            type: "inspect",
            label: "Search the second farm",
            offset: FARM_2,
            mark: "Kettle farm",
            radius: 20,
            clues: [
              { dx: 2, dz: 4, text: "Chalk on the barn door: a circle with a crack down one side. The Choir's sign. Underneath, smaller, a number: 3." },
              { dx: -5, dz: -1, text: "A scrap of paper in the hay, a hymn in a careful hand: NOTHING LOST, NOTHING MISSED, NOTHING LEFT TO GRIEVE. Someone has underlined LEFT twice." },
              { dx: 4, dz: -4, text: "A ring of gray candle stubs in the pumpkin patch, every pumpkin inside the ring rotted black from the inside. The ones outside are fat and orange and perfectly fine." },
            ],
          },
          {
            type: "inspect",
            label: "Search the third farm, the Haddocks' place",
            offset: FARM_3,
            mark: "Haddock farm",
            radius: 20,
            clues: [
              { dx: 0, dz: 3, text: "The chalk sign again on the farmhouse door. This time the number is 1. Counting down, then." },
              { dx: 4, dz: -3, text: "A child's window, left open. Gray thread is tied to the latch on the outside, a loose bow, like a ribbon on a present." },
              { dx: -3, dz: -4, text: "Fresh cart tracks leading out of the yard toward the north-east. Heavy cart. Whatever they loaded, they loaded tonight." },
            ],
          },
          {
            type: "defeat",
            label: "Fight off the Choir ambush at the Haddock farm",
            mobs: CHOIR_MOBS,
            count: 6,
            offset: FARM_3,
            mark: "Haddock farm",
            radius: 32,
          },
        ],
        outro: [
          `${R}Three, two, one. A countdown, and you found the end of it.\n\nShe pins the hymn page beside the thread and stares at it a long time.`,
          { text: `${R}And here's a thing I didn't want to see. These farms are all marked on the town map. The one you and Mara hung in the square. Anyone can copy it. Somebody in a gray hood did.`, when: { "last_map.map": "share" } },
          { text: `${R}Strange thing. These farms aren't on any map but Mara's, and she keeps hers on a shelf. So whoever picked them knows the valley on foot. Someone local. I hate that.`, when: { "last_map.map": "keep" } },
          `${R}The open window bothers me most. The Haddocks have a boy. Go home and sleep with your boots on. I have a feeling tomorrow starts early.`,
        ],
        reward: {
          levels: 4,
          crowns: 50,
          items: [{ item: "minecraft:bread", amount: 8 }],
          codex: {
            id: "act2_thread",
            title: "Gray Thread",
            text: "The Gray Choir marks its targets with gray thread knotted three times and a chalk circle with a crack down one side. At the Haddock farm the countdown ended at 1, at a child's open window.",
          },
        },
        rep: [{ guild: "wardens", amount: 10 }],
        hint: "The three farms are marked on your tracker: the Marsh farm east of town, the Kettle farm south-west, the Haddock farm to the north. Clues show as faint particles; walk close and tap near them.",
      },

      // 2. Pip Is Missing
      {
        id: "pip",
        title: "Pip Is Missing",
        npc: "reyes",
        intro: [
          `Reyes is at your door before dawn, out of breath.\n\n${R}Pip Haddock. Seven years old. Gone from his bed, window open, gray bow on the latch. His mother is screaming the valley awake.`,
          `${R}He's a clever one. Pockets full of toys he whittles himself: little boats, birds, a sword he won't put down. If he was awake when they carried him, he left us a trail. I'd bet my badge on it.`,
          `${R}Find the trail and follow it. If it ends at a camp, you do NOT charge in. You sneak. Choir folk don't care about their own lives, and they'll care even less about his.`,
          `${R}Get in, get the boy, get out. Bring him back to his mother. And if anyone gets in your way on the road home... well. I won't ask how.`,
          `On the Haddocks' porch, a woman in a nightdress is holding a small carved bird so tightly her knuckles are white. She doesn't look up. She just says, to nobody: He was humming at supper. A tune I didn't know. I told him to hush.`,
        ],
        objectives: [
          {
            type: "follow",
            label: "Follow Pip's trail of dropped toys",
            from: { offset: FARM_3, mark: "Haddock farm" },
            to: { offset: CAMP, mark: "Choir camp" },
            wisp: "a trail of little carved toys",
            stray: 12,
          },
          {
            type: "stealth",
            label: "Sneak into the Choir camp to Pip's cage unseen",
            offset: CAMP,
            mark: "Choir camp",
            radius: 28,
            guards: { mob: "minecraft:pillager", count: 4, name: "Choir Sentry" },
            goal: { dx: 6, dz: -8 },
            detect: 14,
            detectSneak: 5,
            onSpotted: "ambush",
          },
          {
            type: "escort",
            label: "Bring Pip home to the Haddock farm",
            who: PIP,
            from: { offset: CAMP, mark: "Choir camp" },
            to: { offset: FARM_3, mark: "Haddock farm" },
            radius: 10,
            ambush: { mobs: CHOIR_MOBS, count: 3, every: 60 },
            hint: "Pip is small and scared: walk, don't sprint, and keep him within 10 blocks. When the Choir jumps out of the trees, put yourself between them and him.",
          },
        ],
        outro: [
          `Pip's mother doesn't say anything. She just holds him, and holds him, and doesn't let go.\n\n${P}They weren't mean. That was the scary part. They kept smiling. They said I had good ears.`,
          `${P}They said kids hear the song best. They wanted me to sing it at the bell, on the night the sky lights up. I said I don't know any songs. The lady said I would.`,
          `${P}There were boxes. Lots of boxes. With a little feather painted on them. Like on the trader's cart, in the square.\n\nHe holds out his last toy, a wooden sword. ${P}You can have it. You need it more than me.`,
          `§eReyes§r takes you aside, very quiet.\n\n${R}A feather on the crates. There's only one trader in this town who paints a quill on his stock. Come and see me when you've slept.`,
        ],
        choices: [
          {
            id: "take_sword",
            label: "Take the sword and promise to bring it back",
            reply: [`${P}Promise promise? With a spit?\n\nYou spit. He spits. It is very solemn and a bit disgusting. His mother laughs for the first time all day, and then cries, and then laughs again.\n\n${P}Don't lose it. It's got a name. It's called Stabby.`],
          },
          {
            id: "praise_pip",
            label: "Tell Pip he was the bravest one in that camp",
            reply: [`Pip thinks about this very seriously.\n\n${P}I did cry. Only a bit. Only when they sang.\n\nThen he pushes the wooden sword into your hands anyway.\n\n${P}Brave people have to share. That's the rule. You can bring it back when the bad singing stops.`],
          },
        ],
        reward: {
          levels: 6,
          crowns: 80,
          items: [{ item: "minecraft:wooden_sword", amount: 1, name: "Pip's Wooden Sword", lore: ["Carved by Pip Haddock, age seven.", "Nicked from use."] }],
          codex: {
            id: "act2_children",
            title: "Good Ears",
            text: "The Choir took Pip because children hear the song best. They meant him to sing at a bell on the night the sky lights up. Their crates bore a painted feather, Quill's mark.",
          },
        },
        rep: [{ guild: "growers", amount: 15 }],
        hint: "Start at the Haddock farm: the toys glow faintly and lead north-east to the Choir camp. Sneak (crouch) inside the camp so sentries only notice you up close. On the way home Pip must stay near you; fight the ambushers before they reach him.",
      },

      // 3. Quill's Ledger
      {
        id: "ledger",
        title: "Quill's Ledger",
        npc: "reyes",
        end: "quill",
        intro: [
          `${R}I sent two wardens back to the camp. Empty. They packed up and left in an hour, but they left some boxes behind in a hurry.\n\nShe drops a splintered board on the table. A painted feather.`,
          `${R}Quill. Charming, smiling Quill, who sells my wardens their arrows. I want to break his door down. But I want to be right first.`,
          `${R}He came to town six winters ago with a cart and a smile and no past anybody could find. I checked. I check everybody. He paid his market fees early, every time. That should have told me something. Honest men pay late.`,
          `${R}Go look at what they left. Then go talk to him. You, not me. If I go, someone gets hurt, and I'm not certain it would be him.`,
        ],
        objectives: [
          {
            type: "inspect",
            label: "Search the crates left at the Choir camp",
            offset: CAMP,
            mark: "Choir camp",
            radius: 20,
            clues: [
              { dx: 2, dz: 2, text: "A crate of candles, gray wax, hundreds of them. Stamped with Quill's feather and a cargo number in his neat hand." },
              { dx: -3, dz: 1, text: "A crate of rope. Tarred black. You have seen rope like this before, on the wrists of the drowned." },
              { dx: 1, dz: -4, text: "A torn shipping note: DELIVER TO THE GRAY RING. PAYMENT ON THE NIGHT. NO QUESTIONS, AS AGREED. Signed with a little sketched feather." },
            ],
          },
          { type: "talk", label: "Confront Quill the Trader", npc: "quill" },
        ],
        outro: [
          `§eQuill§r is counting coins when you come in. He sees the board under your arm and stops.\n\n${Q}Ah. That's mine. I'd ask where you found it, but I suspect I'd rather not know.`,
          `${Q}Yes. I run cargo for them. Candles, rope, wine. They pay in old silver, the kind nobody's minted in a century. I don't ask what candles are for. Asking is bad for business.`,
          `His smile goes. It's the first time you've seen him without it.\n\n${Q}But children? No. I didn't know. I swear it on my mother, and I loved my mother. I'm a smuggler, not a monster.`,
          `${Q}So. Here's a bargain, the only kind I know. They trust me. I can take you inside, to their cove, to their books. Or you can walk me to Reyes and let her lock me up. Either way I'll understand. Mostly.`,
        ],
        choices: [
          {
            id: "trust",
            label: "Trust him: make him your double agent",
            set: { "g:quill": "trusted" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "wayfarers", amount: 15 }],
            reply: [
              `${Q}You'll not regret it. Well. You might. But not because of me.\n\nHe pours two cups and slides one over.\n\n${Q}To bad decisions made for good reasons.`,
              `${Q}And tell Reyes nothing yet. She'd mean well, and she'd ruin it, and then she'd mean well at my funeral. Come back when you're ready to be a smuggler. Wear something you don't mind getting fish on.`,
            ],
          },
          {
            id: "expose",
            label: "Expose him to Reyes",
            set: { "g:quill": "exposed" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wardens", amount: 15 }],
            reply: [
              `Quill nods slowly, and holds out his wrists.\n\n${Q}Fair. Tell Reyes the cove is two coves past the lighthouse, the one with the crooked lantern. Tell her they keep their books there. And tell her I said she's very pretty when she's furious.`,
              `Reyes takes him herself. At the door he looks back at you, and for once there's no bargain in his face at all.\n\n${Q}Get the ones who took that boy. All of them. Whatever it costs. That part, I'd have paid for.`,
            ],
          },
        ],
        reward: {
          levels: 4,
          crowns: 60,
          codex: {
            id: "act2_quill",
            title: "Quill's Cargo",
            text: "Quill smuggles candles, tarred rope and wine to the Gray Ring for the Choir, paid in old silver no one has minted in a century. He swears he never knew they took children.",
          },
        },
        hint: "The camp's crates are at the Choir camp north-east of the Haddock farm; your tracker marks it. Then find Quill wherever he trades in town.",
      },

      // 4a. The Double Agent (trusted)
      {
        id: "double",
        title: "The Double Agent",
        npc: "quill",
        when: TRUSTED,
        intro: [
          `${Q}Here's the job. The Choir keeps its books at the Smugglers' Cove: who pays, who delivers, who they want. I bring a new hand tonight. That's you.`,
          `${Q}My hands wear leather. Plain brown leather chest, nothing fancy, nothing shiny. Dressed like that, the guards see a porter. Porters are furniture. Nobody looks at furniture.`,
          `${Q}Walk tall, but walk slow. If they look closely they'll see a hero, and heroes have a terrible habit of being stabbed. Crouch when you're near them; carry yourself like a man who owes money.`,
          `${Q}If anyone asks, your name is Barnaby, you owe me eleven silver, and you're simple. Say nothing. Barnaby says nothing. Barnaby has never said anything in his life, and it has served him well.`,
          `${Q}The ledger is in a barrel at the back of the cave. Open it, take the book, bring it to me. I'll copy it and put it back before the tide turns. Easy. I've done harder things before breakfast.`,
        ],
        objectives: [
          { type: "wear", label: "Wear a leather chestplate as a disguise", items: ["minecraft:leather_chestplate"], slot: "chest" },
          {
            type: "stealth",
            label: "Slip through the Smugglers' Cove in disguise",
            place: "sea_cave",
            radius: 24,
            guards: { mob: "minecraft:vindicator", count: 4, name: "Choir Dockhand" },
            goal: { dx: -6, dz: 5 },
            detect: 12,
            detectSneak: 4,
            onSpotted: "reset",
            disguise: { slot: "chest", item: "minecraft:leather_chestplate" },
          },
          { type: "interact", label: "Open the ledger barrel", place: "sea_cave", blocks: ["minecraft:barrel"], count: 1, radius: 10 },
          { type: "talk", label: "Bring the ledger to Quill", npc: "quill" },
        ],
        outro: [
          `${Q}Look at you. Not a scratch, and you even smell like fish. You're a natural. I'd hire you for real if you weren't so dreadfully honest.`,
          `He turns pages fast. His face changes.\n\n${Q}Names. Half are strangers. But this one... and this one... These are people I sell bread to. The cooper. The widow by the mill. They've been singing for months.`,
          `${Q}I sold the widow candles for her husband's wake, last spring. She cried on my shoulder. Then she went home and wrote her name in this.\n\nHe closes the book very gently.\n\n${Q}Nothing lost, nothing missed. You can see why it sells.`,
          `${Q}And here, in a different hand, a letter folded inside the back cover. Gray ink. Signed with a cracked circle. I think you'd better read this one sitting down.`,
        ],
        reward: {
          levels: 6,
          crowns: 90,
          items: [{ item: "minecraft:leather_helmet", amount: 1, name: "Quill's Spare Hood", lore: ["Smells faintly of fish and lies."] }],
          codex: {
            id: "act2_ledger",
            title: "The Choir's Ledger",
            text: "The Choir's ledger at the Smugglers' Cove lists who pays and who sings. Some are strangers. Some are townsfolk: the cooper, the widow by the mill. Folded inside: a letter in gray ink, signed with a cracked circle.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 15 }],
        hint: "Any leather chestplate works (8 leather at a crafting table). The Smugglers' Cove is on the coast; your tracker points there. With the disguise on, dockhands only notice you when you're very close, so crouch past them. The barrel is at the back of the cave; if every barrel there has been mined out, place a barrel of your own within 10 blocks of the cave and open it instead.",
      },

      // 4b. Raid on the Cove (exposed)
      {
        id: "raid",
        title: "Raid on the Cove",
        npc: "reyes",
        when: EXPOSED,
        intro: [
          `${R}Quill is in my cell, singing sea songs to annoy the night watch. It's working. But he gave us the cove, and the cove is where they keep their books.`,
          `${R}We go at dusk. My wardens take the cliff path and hold the dock. You come in by the beach and clear the cave. Every gray hood in there is armed, and none of them will surrender. I've stopped expecting them to.`,
          `${R}When the shouting starts, they'll try to retake the dock to get their boats out. Don't let them. Then clean out the rest. Twenty, maybe more. Count them if counting helps.`,
          `${R}And find me that ledger. I want names.`,
          `Down the hall, from the cells, Quill's voice carries, cheerful and off-key: §o...and the warden's heart is a cold, cold sea, oh she'll never fall for a rogue like me...§r\n\n${R}One more verse and I'm gagging him with his own hat.`,
        ],
        objectives: [
          {
            type: "defend",
            label: "Hold the dock at the Smugglers' Cove",
            place: "sea_cave",
            radius: 20,
            waves: [
              { mobs: ["minecraft:pillager"], count: 4 },
              { mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 5 },
              { mobs: ["minecraft:vindicator"], count: 4 },
            ],
          },
          {
            type: "defeat",
            label: "Defeat 20 Choir smugglers at the cove",
            mobs: CHOIR_MOBS,
            count: 20,
            place: "sea_cave",
            radius: 48,
          },
        ],
        outro: [
          `The cove is quiet. Smoke curls off the water. Two wardens are hurt; none of hers are dead, and Reyes keeps saying so, like she has to hear it.\n\n${R}Found it. Barrel at the back. Of course it was a barrel.`,
          `One of the gray hoods is still breathing, propped against a crate. He smiles up at you with a split lip and hums three notes. Then he stops humming, and stops breathing, and the smile stays.`,
          `${R}Names. Half strangers. But this one... and this one. The cooper. The widow by the mill. My own night clerk. They've been singing for months, right under my nose.`,
          `${R}Quill stays locked up until this is over. I'd like to say I feel good about that.\n\nShe doesn't say it.\n\n${R}There's a letter folded in the back. Gray ink. You read it. My hands are shaking.`,
        ],
        reward: {
          levels: 7,
          crowns: 100,
          items: [{ item: "minecraft:shield", amount: 1 }, { item: "minecraft:arrow", amount: 24 }],
          codex: {
            id: "act2_ledger",
            title: "The Choir's Ledger",
            text: "Seized in the raid on the Smugglers' Cove: the Choir's ledger. Some names are strangers. Some are townsfolk: the cooper, the widow by the mill, Reyes's own night clerk. Folded inside: a letter in gray ink, signed with a cracked circle.",
          },
        },
        rep: [{ guild: "wardens", amount: 20 }],
        hint: "The Smugglers' Cove is on the coast; your tracker points there. Stay near the dock until the three waves are beaten, then keep fighting pillagers and vindicators at the cove until 20 are down. Bring a shield and food.",
      },

      // 5. The Cantor's Letter
      {
        id: "letter",
        title: "The Cantor's Letter",
        npc: "reyes",
        end: "ida",
        intro: [
          { text: `Quill hands you the letter with two fingers, like it might bite.\n\n${Q}I don't read gray ink for free, as a rule. But I'll make an exception. Then I want a very large drink.`, when: TRUSTED },
          { text: "Reyes passes you the letter from the cove and sits on the edge of her desk, arms folded, waiting.", when: EXPOSED },
          `§7"To the faithful. The night of the Lantern draws near. The broken note must be struck again on the old tongue. Without the bell's tongue, the song is only a song."§r`,
          { text: `§7"The keeper's smith wrapped the tongue in a band of iron and sank it with the bell. Iron can be cut. Bring me the band, and the band's maker, if she is willing. Or if not."§r`, when: SILENCE },
          { text: `§7"The keeper's smith forged a new clapper and hung it in the bell. A false voice. But the smith kept the old tongue, the true one, in her forge. Bring it to me. And her, if she is willing. Or if not."§r`, when: RING },
          `${R}There's a name scrawled under it in pencil, like a note to self: HUSH. Quick hands. Has never been caught. Send him.\n\nShe taps it.\n\n${R}Never been caught. We'll see about that.`,
          `${R}The smith is Ida. The Cantor wants Ida. Go to her forge, now, and help her lock it down. I'll send wardens as soon as I can spare them, which is never.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Ida 6 iron ingots to bar the forge", npc: "ida", item: "minecraft:iron_ingot", count: 6 },
          {
            type: "defeat",
            label: "Catch the thief before he escapes (90 seconds)",
            count: 1,
            night: true,
            within: 90,
            champion: {
              tag: "realm:saga:choir_thief",
              mob: "minecraft:pillager",
              name: "Hush, the Choir's Thief",
              warn: "Glass breaks somewhere near the forge. A shape in gray darts into the dark. Ninety seconds before he's gone.",
              health: 20,
            },
          },
        ],
        outro: [
          `Hush hits the ground and the sack he was carrying splits open. Ida kneels and lifts out what was inside.`,
          { text: `${I}Iron filings. He'd been at the bell under the water, cutting at my band. Half through. One more night and the bell would have had its mouth back.`, when: SILENCE },
          { text: `${I}The old tongue. The clapper the bell rang with the night the tower fell. I kept it because I didn't know what else to do with it. Should have dropped it in a volcano.`, when: RING },
          `${I}I don't scare. I'm scared. They didn't want the iron. They wanted the note it makes. And they wanted me to make it for them.\n\nShe hands you a hammer from her own wall.`,
          `${I}Find who's helping them inside the town. Somebody unlocked my door before that thief ever touched it.`,
        ],
        reward: {
          levels: 6,
          crowns: 80,
          items: [{ item: "minecraft:iron_sword", amount: 1, name: "Ida's Spare Blade", lore: ["Plain. Balanced. Ugly. Perfect."] }],
          codex: {
            id: "act2_tongue",
            title: "The Bell's Tongue",
            text: "The Cantor's letter: the broken note must be struck again on the bell's old tongue on the night of the Lantern. The Choir tried to steal it from Ida, and wanted Ida herself, willing or not.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "Bring Ida 6 iron ingots first. The thief comes at night near you: once he appears you have 90 seconds to bring him down. A bow helps; he runs.",
      },

      // 6. Hollis's Confession
      {
        id: "confession",
        title: "Hollis's Confession",
        npc: "hollis",
        end: "moss",
        intro: [
          `§eBrother Hollis§r is waiting for you on the chapel steps. He looks like he hasn't slept in a week, because he hasn't.\n\n${H}It was me. The door. Ida's door. And before that, the crypt. I let them in.`,
          `${H}I don't remember doing it. I wake up with keys in my hand and mud on my feet. Last night I woke at Ida's gate, and I was humming. I don't know the tune. I know every note of it.`,
          `${H}I took this post because the chapel was quiet. I wanted quiet. I thought I could pray here and the world would leave me alone. Instead something found me in the quiet and started talking.`,
          `${H}They went into the crypt under the graveyard. The old one, nobody's been buried there in forty years. Moss has the other key. Please. Go with him. I can't go down there again.`,
          `${HX}Don't. Not the end grave. Leave him sleeping.§r\n\nHollis blinks.\n\n${H}I'm sorry. Did I say something?`,
        ],
        objectives: [
          {
            type: "mine",
            label: "Help Moss dig out the crypt steps (break 12 dirt)",
            blocks: ["minecraft:dirt", "minecraft:coarse_dirt", "minecraft:grass_block", "minecraft:podzol"],
            count: 12,
          },
          {
            type: "inspect",
            label: "Search the crypt at the Old Graveyard",
            place: "graveyard",
            radius: 16,
            clues: [
              { dx: 3, dz: 0, text: "Candle stubs in gray wax, burned down to puddles, arranged in a ring. The Choir held a service down here." },
              { dx: -2, dz: 3, text: "Wet footprints that start in the middle of the floor and walk to the door. No prints walking in. Only out. And the floor has been dry for forty years." },
              { dx: 0, dz: -4, text: "The last coffin in the row. The lid has been pushed off from the inside: the nails are bent outward. It is empty. It smells of salt and seaweed." },
              { dx: 4, dz: -3, text: "A brass plate, green with age: BROTHER ASHGRAVE. KEEPER OF THE CHAPEL. LOST IN THE LONG STORM. BODY NEVER RECOVERED. Somebody buried an empty box and wrote a name on it." },
              { dx: -4, dz: -2, text: "Scratched low into the crypt wall, as if by someone kneeling, very old: a cracked circle, and under it, in a grown man's shaking hand: I CAN HEAR HER DOWN THERE. The scratches have been traced over recently in gray chalk, by a steadier hand." },
            ],
          },
        ],
        outro: [
          `§eMoss§r reads the plate twice, then pats the coffin like an old dog.\n\n${MO}Ashgrave. The keeper before Hollis's keeper. My dad dug this. Said it was the lightest coffin he ever carried. Joked about it for years. Stopped joking one winter. Never said why.`,
          `${MO}Now, I'm the gravedigger, so I'm an expert on folk staying where they're put. And the nails on that lid are bent the wrong way. Nobody took him out. He got up.`,
          `${MO}Well. That's a sentence I hoped to retire without saying.\n\nHe lights a pipe with a hand that shakes only a little.`,
          `${MO}There's one person who might know what a dead keeper wants with a living one. She won't like me. Nobody does. But she knows the old songs. Come see me tomorrow and I'll tell you how to find her.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:lantern", amount: 2 }],
          codex: {
            id: "act2_ashgrave",
            title: "The Empty Coffin",
            text: "Brother Ashgrave was the chapel keeper forty years ago, lost in the Long Storm, body never found. His coffin in the crypt was empty, its nails bent outward, with wet footprints walking only out. Hollis, sleepwalking, let the Choir in.",
          },
        },
        hint: "Any dirt, coarse dirt, grass or podzol counts for the digging. The crypt is at the Old Graveyard; your tracker points there, and the clues glow faintly. Go at day if you can: the graveyard is busy at night.",
      },

      // 7. The Witch of Hollow Fen
      {
        id: "fen",
        title: "The Witch of Hollow Fen",
        npc: "moss",
        intro: [
          `${MO}Her name is Vesna. Lives out at Hollow Fen, in a hut on stilts with more cauldrons than sense. The kids say she eats travelers. I've met her. She doesn't. She's very picky.`,
          `${MO}She knew Ashgrave. Sang with him in the chapel choir, back when it was a choir and not a Choir. She left the night of the Long Storm and never came back to town.`,
          `${MO}Bring manners, and bring a gift. She'll name a price. Pay it, whatever it is. Witches who don't get paid have very creative ways of collecting.`,
          `${MO}And if she offers you tea, check the color first. Green is fine. Purple is fine, mostly. If it's gray, pour it in the swamp and run, and don't look back, even if it asks you to.`,
        ],
        objectives: [
          {
            type: "meet",
            label: "Meet Vesna at Hollow Fen",
            place: "witch_hut",
            radius: 14,
            who: { id: "vesna", name: "Vesna of the Fen", entity: "minecraft:witch" },
            pages: [
              `A woman in a dark hat watches you from the porch of the stilt hut, stirring a cauldron that smells of rain.\n\n${V}Moss sent you. I can smell the grave dirt. And under it... chapel candles. Ah. It's Ashgrave, then. It was always going to be Ashgrave.`,
              `${V}He had a beautiful voice. The town says I left because I was afraid of the storm. I left because I heard what he was singing up on that tower, and I knew the tune. I'd taught it to him.`,
              `She ladles something green into a cup and does not offer it to you.\n\n${V}He was grieving. His girl had died of a fever that spring, six years old. Grief makes a hole, and something at the bottom of the world can hear a hole that deep. It started talking to him through it.`,
              `${V}Your Choir is that same voice, wearing a hundred grieving faces. It promises the hole will close. It doesn't mention that it means to close it with the whole world.`,
              `${V}There is a song under the Choir's song. The old ones made it. It undoes theirs, the way a hand undoes a knot. I can teach it to you. Not for free. Nothing at the Fen is for free.`,
            ],
            choices: [
              {
                id: "bow",
                label: "Bow and ask her price politely",
                set: { vesna_first: "polite" },
                reply: [`${V}Manners. How rare. Moss must have warned you. You may live.\n\nShe pours you a cup of tea. It is green. Probably fine.`],
              },
              {
                id: "threaten",
                label: "Hand on your sword: tell her to teach you now",
                set: { vesna_first: "rude" },
                reply: [`Every cauldron on the porch stops bubbling at once. Somewhere under the hut, something large shifts in the water.\n\n${V}Brave. Stupid, but brave. The price just went up, and you'll pay it anyway.`],
              },
            ],
          },
          { type: "collect", label: "Have a mushroom stew for Vesna", item: "minecraft:mushroom_stew", count: 1 },
          { type: "collect", label: "Have a spider eye for Vesna", item: "minecraft:spider_eye", count: 1 },
        ],
        outro: [
          `Vesna sniffs the stew, eats the whole bowl standing up, and pockets the spider eye like a sweet.\n\n${V}Good. Those were the easy two. The stew was for me. The eye is for the song. Now the third.`,
          `${V}A tear. Not yours: you haven't cried enough yet. A ghast's. The song needs grief that has been kept a very long time, and nothing grieves longer than a ghast.`,
          { text: `${V}Go through the fire and fetch one. I'll be here. I'm always here.`, when: { vesna_first: "polite" } },
          { text: `${V}Go through the fire and fetch one. Two, if you'd like to apologize. I'll be here, practicing a curse in case you don't.`, when: { vesna_first: "rude" } },
        ],
        reward: {
          levels: 5,
          crowns: 60,
          codex: {
            id: "act2_vesna",
            title: "Vesna of the Fen",
            text: "Vesna sang in the chapel choir with Ashgrave forty years ago. She left the night of the Long Storm because she recognized what he sang on the tower: a tune she had taught him. Under the Choir's song lies an older one that undoes it.",
          },
        },
        rep: [{ guild: "growers", amount: 10 }],
        hint: "Hollow Fen is far out, past the swamps; your tracker points there. Mushroom stew: a bowl, a red and a brown mushroom. Spider eyes drop from spiders at night. Bring both before you talk to Vesna, or come back with them.",
      },

      // 8. A Tear from the Fire
      {
        id: "tear",
        title: "A Tear from the Fire",
        npc: "moss",
        end: "moss",
        intro: [
          `${MO}A ghast tear. Of course. Why ask for a nice turnip when you can send someone into the Nether?\n\nHe sighs and hands you a flask of something that smells like regret.`,
          `${MO}Build a portal if you haven't. Fourteen obsidian, or ten if you skip the corners like a sensible person. Light it, step through, and look for the big white crying things. Floating. Screaming. You'll know.`,
          `${MO}They spit fire. Bring a bow, and bring blocks to hide behind. And whatever happens, don't hit them close to lava. The tear sinks. I lost two cousins' worth of patience learning that.`,
          `${MO}Funny thing about ghasts. My granny said they're what's left of things that grieved so long they forgot what for. Just the crying, floating around, looking for a reason. Cheerful bedtime stories in my family.`,
          `${MO}Then take it to Vesna. She'll want you to sing. Don't worry: I've heard you hum. It's terrible, but it's honest.`,
        ],
        objectives: [
          { type: "reach", label: "Travel to the Nether", dim: "minecraft:nether" },
          {
            type: "collect",
            label: "Have a ghast tear",
            item: "minecraft:ghast_tear",
            count: 1,
            hint: "Ghasts drift over the big lava lakes and soul sand valleys. Hit a fireball back at one, or shoot it with a bow while standing on solid ground so the tear doesn't fall into lava.",
          },
          {
            type: "answer",
            label: "Answer Vesna's song riddle at Hollow Fen",
            place: "witch_hut",
            radius: 14,
            question: `Vesna drops the tear in the cauldron. It hisses like a voice.\n\n${V}The Choir sings to forget. You must answer with the song that remembers. Every mother sings it, low and soft, and none writes it down. It is sung to stop the crying. What is it?`,
            answers: ["lullaby", "a lullaby", "cradle song", "a cradle song", "cradlesong"],
            failSpawn: { mobs: ["minecraft:bogged"], count: 3 },
          },
        ],
        outro: [
          `Vesna hums. It's simple: a few notes rocking back and forth, like a boat at anchor. Then she sings it properly, and the fen goes silent. Even the frogs.\n\n${V}A lullaby. That's all it is. That's all it ever was.`,
          `${V}The Choir sings: nothing lost, nothing missed. The old song answers: everything lost, and every name remembered. Grief kept is a lantern. Grief sold is a door. Remember that.`,
          { text: `${V}You were kind to me. So I'll tell you the rest: the boy in the chapel is close to the edge. When the Herald calls him into the water, you'll have one night. Don't waste it.`, when: { vesna_first: "polite" } },
          { text: `${V}You were rude, and you paid anyway. I respect that more than I'd like. The boy in the chapel is close to the edge. When he walks into the water, sing. Or swim. Good luck.`, when: { vesna_first: "rude" } },
        ],
        reward: {
          levels: 7,
          crowns: 100,
          items: [{ item: "minecraft:golden_apple", amount: 1 }],
          codex: {
            id: "act2_counter_song",
            title: "The Counter-Song",
            text: "Vesna's counter-song is a lullaby, older than the town. The Choir sings: nothing lost, nothing missed. The lullaby answers: everything lost, and every name remembered. Grief kept is a lantern; grief sold is a door.",
          },
        },
        rep: [{ guild: "growers", amount: 10 }],
        hint: "Build a Nether portal (obsidian, lit with flint and steel). Ghasts float over open lava seas: shoot them over solid ground or reflect their fireballs. Then go back to Hollow Fen and type your answer: think of the song a mother sings to a crying baby.",
      },

      // 9. The Night Hollis Sang
      {
        id: "hollis_night",
        title: "The Night Hollis Sang",
        npc: "moss",
        end: "hollis",
        intro: [
          `Moss bangs on your door after midnight, lantern swinging.\n\n${MO}He's gone. Hollis. Walked out of the chapel in his nightshirt, singing. Straight down the cliff path to the sea by the lighthouse. I couldn't stop him. He's stronger than he looks when he's not himself.`,
          `From the shore you can hear it: Hollis's voice, high and sweet, singing words you don't know. Waist-deep and still walking. Behind him, in the black water, pale shapes rise. Rope on their wrists.`,
          `${HX}Nothing lost. Nothing missed. Come down, come down, the bell is waiting.§r`,
          `${MO}Two ways I see it. Drag him out and fight off whatever's coming for him. Or run for the chapel bell and sing that witch's song loud enough to reach him. Pick fast. He hasn't got long.`,
        ],
        introChoices: [
          {
            id: "force",
            label: "Wade in and drag him out by force",
            set: { hollis_way: "force" },
            reply: [
              `${MO}Then go! I'll hold the lantern. That's very brave of me, if you think about it.`,
              `The water is so cold it knocks the breath out of you. Hollis turns his head as you reach him. His eyes are open, and they are not his: pale, patient, drowned.\n\n${HX}Let go of him. He wants to come.§r`,
            ],
          },
          {
            id: "song",
            label: "Run for the chapel bell and sing the counter-song",
            set: { hollis_way: "song" },
            inc: { "g:mercy": 1 },
            reply: [
              `${MO}The chapel, then. I'll watch him from the rocks and shout if he goes under. Run!`,
              `Behind you as you run, Hollis's voice follows, sweet and wrong, carrying farther than any voice should:\n\n${HX}You can't outrun a song. Everyone stops running eventually. Ask him. Ask the keeper.§r`,
            ],
          },
        ],
        objectives: [
          {
            type: "defend",
            label: "Defend Hollis from the drowned while you pull him ashore",
            when: { hollis_way: "force" },
            place: "lighthouse",
            radius: 24,
            ward: { id: "hollis_sea", name: "Brother Hollis", entity: "minecraft:villager_v2" },
            waves: [
              { mobs: ["minecraft:drowned"], count: 5 },
              { mobs: ["minecraft:drowned"], count: 7 },
              { mobs: ["minecraft:drowned", "minecraft:zombie"], count: 8 },
            ],
          },
          {
            type: "interact",
            label: "Ring the chapel bell 3 times",
            when: { hollis_way: "song" },
            place: "old_chapel",
            blocks: ["minecraft:bell"],
            count: 3,
            radius: 10,
          },
          {
            type: "vigil",
            label: "Sing the counter-song at the Old Chapel until he answers (2 minutes, at night)",
            when: { hollis_way: "song" },
            place: "old_chapel",
            radius: 12,
            seconds: 120,
            timeOfDay: NIGHT,
          },
        ],
        outro: [
          { text: `You haul Hollis out of the surf by his collar while the last drowned sink back into the black. He fights you all the way, then goes limp, coughing seawater onto the sand.`, when: { hollis_way: "force" } },
          { text: `${H}I saw him. Under the water. A man in a keeper's robe, holding out his hand. He said my name like he loved me. I wanted to take it so badly.\n\nHe grips your arm hard.\n\n${H}You pulled me back. Don't let go yet.`, when: { hollis_way: "force" } },
          { text: `The bell's third note rolls down to the sea, and you sing: badly, then better. Down on the beach the singing stops. A long silence. Then, faint and cracked, Hollis's voice, joining yours on the lullaby.`, when: { hollis_way: "song" } },
          { text: `Moss carries him up to the chapel, soaked and shivering.\n\n${H}My mother sang that. I'd forgotten. How could I forget that?\n\nThen, softer, not quite his voice:\n\n${HX}Not yet. Not yet. Soon.§r`, when: { hollis_way: "song" } },
          `${MO}He'll live tonight. That's a good night's work in my trade. Most of my customers don't.`,
        ],
        choices: [
          {
            id: "stay",
            label: "Stay with him until dawn",
            requires: { flags: { hollis_way: "force" } },
            set: { "g:hollis": "saved" },
            reply: [
              `You sit with him on the chapel steps until the sky turns gray. He doesn't dream. When the sun comes up he laughs, just once, surprised.\n\n${H}It's quiet. In my head. For the first time in a year, it's quiet.`,
              `${H}He let go of me. When you pulled, he just... let go. As if he'd lost interest. Or as if he had someone else in mind.\n\nHe shivers, and it isn't the cold.\n\n${H}Thank you. I'll light a candle for you every night. A real one. White wax.`,
            ],
          },
          {
            id: "watch",
            label: "Leave him to rest and keep watch",
            requires: { flags: { hollis_way: "song" } },
            reply: [
              `${H}Go. I'll keep the candles lit. If I start humming, Moss has promised to throw a bucket of water on me.\n\n${MO}Two buckets. I'm thorough.`,
              `At the chapel door you look back. Hollis is sitting in the front pew with a candle in both hands, singing the lullaby under his breath, over and over, like a man holding a door shut with his back.`,
            ],
          },
        ],
        reward: {
          levels: 8,
          crowns: 110,
          codex: {
            id: "act2_hollis_night",
            title: "The Night Hollis Sang",
            text: "The Herald called Hollis into the sea with the Choir's song: come down, the bell is waiting. Hollis saw a man in a keeper's robe beneath the water, holding out his hand and saying his name like he loved him.",
          },
        },
        hint: "Dragging him out: stay near the lighthouse shore and kill the drowned before they reach Hollis. Singing: ring the bell at the Old Chapel three times (if it is gone, place a bell of your own within 10 blocks of the chapel and ring that one), then stay inside the chapel grounds at night for two minutes. Bring light and armor either way.",
      },

      // 10. The Gray Ring Burns
      {
        id: "ring_burns",
        title: "The Gray Ring Burns",
        npc: "reyes",
        intro: [
          `${R}The ledger gave us their numbers. Hollis's night gave us their timing. The whole Choir will be at the Gray Ring tomorrow, rehearsing for the Lantern. Every last gray hood in one place.`,
          { text: `${R}My wardens march at dusk. Twelve of us, every sword I've got and some I borrowed. You lead the charge. I want you in front because you've earned it, and because you're harder to kill than my recruits.`, when: WARDENS },
          { text: `${R}You did this alone before, and you'll have to again. My wardens are guarding the farms and the forge; if I pull them, the Choir walks into town. I hate it. Go anyway. Come back.`, when: ALONE },
          `${R}Kill the singers. Break the bell in the middle of the ring so it never rings again. And the one in the gray hood who talks like a priest: the Cantor. Bring me that hood.`,
          `${R}It isn't pretty work. But they took a seven-year-old out of his bed. I've stopped being sorry for them.`,
          `On your way out of town, Pip Haddock runs alongside you as far as the last fence, waving his mother's soup ladle like a sword. He stops at the fence because he promised. He keeps waving until you can't see him.`,
        ],
        objectives: [
          {
            type: "meet",
            label: "Face the Cantor at the Gray Ring",
            place: "choir_ring",
            radius: 24,
            who: { id: "cantor", name: "The Cantor", entity: "minecraft:evocation_illager" },
            pages: [
              `A figure in a gray hood stands by the cracked bell, alone, hands folded. Around the ring, in the dark between the stones, a hundred voices hum one low note and hold it.\n\n${C}The bell-ringer's friend. I hoped you'd come. I wanted to see your face before the end.`,
              `${C}Do you know what I lost? A husband. Two sons, one winter. I walked into the sea once, the year after. The water sent me back. Then I heard him singing under it, and he told me: soon, nothing will ever be lost again.`,
              `${C}You think we want to destroy the world. We want to finish grieving it. There's a difference, if you listen. You never listen. None of you do.`,
            ],
            choices: [
              {
                id: "parley",
                label: "Offer her a chance to lay down the song and live",
                set: { parley: "offered" },
                reply: [`She actually considers it. You can see her consider it. Then she pulls the hood forward.\n\n${C}That's kind. He told me you'd be kind. He said it would make this harder for you, not for me.`],
              },
              {
                id: "steel",
                label: "Draw your weapon: no more speeches",
                set: { parley: "refused" },
                reply: [`${C}Good. Honest, at least. The Choir sings for the ones who are tired of being honest.\n\nShe raises one hand. The humming in the dark becomes a shout.`],
              },
            ],
          },
          {
            type: "defeat",
            label: "Fight through the Choir at the Gray Ring with the wardens (20)",
            when: WARDENS,
            mobs: CHOIR_MOBS,
            count: 20,
            place: "choir_ring",
            radius: 40,
          },
          {
            type: "defeat",
            label: "Fight through the Choir at the Gray Ring alone (14)",
            when: ALONE,
            mobs: CHOIR_MOBS,
            count: 14,
            place: "choir_ring",
            radius: 40,
          },
          {
            type: "defeat",
            label: "Defeat the Cantor",
            place: "choir_ring",
            radius: 32,
            count: 1,
            champion: {
              tag: "realm:saga:cantor",
              mob: "minecraft:evocation_illager",
              name: "The Cantor",
              warn: "The singing stops. In the silence a voice says, almost kindly: You came all this way to stop a song?",
              health: 60,
              adds: { mobs: ["minecraft:vindicator"], count: 3 },
            },
          },
          { type: "interact", label: "Break the cracked bell in the Gray Ring (strike it 3 times)", place: "choir_ring", blocks: ["minecraft:bell"], count: 3, radius: 8 },
        ],
        outro: [
          `The Cantor falls in the center of the ring. The hood slips back: an ordinary face, a tired one, a woman who might have sold you apples once.\n\n${C}You think it's us. It was never us. We only sang what we heard.`,
          { text: `${C}You offered me a way out. Nobody's done that in a long time. It wouldn't have helped.\n\n${C}He's still down there. Waiting for the Lantern. You can burn every stone in this ring. You can't kill a song.\n\nShe smiles, like someone falling asleep, and is still.`, when: { parley: "offered" } },
          { text: `${C}He's still down there. Waiting for the Lantern. You can burn every stone in this ring. You can't kill a song.\n\nShe smiles, like someone falling asleep, and is still.`, when: { parley: "refused" } },
          { text: `Reyes's wardens drag the gray banners into a pile and set them alight. The standing stones crack in the heat. ${R}Nobody dead on our side. Nobody. Write that down somewhere.`, when: WARDENS },
          { text: `You stand alone in the ring while the gray banners burn. No one cheers. No one is there to. The cracked bell lies in two pieces at your feet, and the fire makes the only sound for miles.`, when: ALONE },
          `Among her things: a gray mask, smooth and blank, still warm. When you hold it up you can hear, very faintly, the Choir singing. It stops when you put it down.`,
        ],
        reward: {
          levels: 8,
          crowns: 120,
          relic: "choir_mask",
          codex: {
            id: "act2_cantor",
            title: "You Can't Kill a Song",
            text: "The Cantor, leader of the local Gray Choir, died at the Gray Ring. Her last words: it was never us, we only sang what we heard. He is still down there, waiting for the Lantern. You can't kill a song.",
          },
        },
        rep: [
          { guild: "wardens", amount: 25, when: WARDENS },
          { guild: "wayfarers", amount: 25, when: ALONE },
        ],
        hint: "The Gray Ring is far out; your tracker points there. Talk to the hooded Cantor by the cracked bell first, then fight inside the ring of stones; the Cantor appears after the singers fall and summons vexes, so kill her fast. Strike the cracked bell in the middle three times; if it has been mined out, place a bell of your own within 8 blocks of the ring's center and strike that one. Bring a shield, food and a totem if you have one.",
      },

      // 11. What the Mayor Knew
      {
        id: "mayor",
        title: "What the Mayor Knew",
        npc: "bram",
        intro: [
          `§eMayor Bram§r has a locked writing desk on his table and a crowbar in his hand. He has clearly never used a crowbar.\n\n${B}My father's desk. He made me promise never to open it. I was nine. I've kept that promise forty years. I'm done keeping it.`,
          `${B}The cooper. The widow by the mill. People I've shaken hands with every market day. They wanted the world to end, and I gave them prizes for their pumpkins.`,
          `${B}The Choir is broken. Everyone says so. The wardens are drinking to you in the inn as we speak. So why do I feel like the floor is about to open? Because something in this desk knew this was coming. I'm sure of it.`,
          `${B}Before I open it, go and ask Old Tobin what my father said to the town, that winter. Tobin was there. He's the only one who'll tell me the truth to my face.`,
        ],
        objectives: [
          { type: "talk", label: "Ask Old Tobin what the old mayor told the town", npc: "tobin" },
          {
            type: "vision",
            label: "Read the old mayor's sealed order",
            dark: true,
            scenes: [
              { title: "The Year of the Long Storm", text: "A town hall, forty winters ago. Wet coats, lamp smoke, too many people. A tired man in a mayor's chain stands at the front and does not meet anyone's eyes.", seconds: 6 },
              { title: "The Order", text: "BY ORDER OF THE MAYOR: the events of the storm night are not to be spoken of. The keeper is to be mourned as lost at sea. The tower is not to be rebuilt. The bell is not to be raised.", seconds: 7 },
              { title: "The Hall Empties", text: "One by one they file out into the rain. A fisherman with a boy's cap in his hands stays longest. Young Tobin. Nobody tells him to leave. Nobody tells him anything at all.", seconds: 6 },
              { text: "In the margin, in a smaller, shakier hand: I saw what he did on the tower. God forgive me, I will not make them see it too. Let them forget. Let it sleep.", sound: "ambient.cave", seconds: 7 },
            ],
          },
        ],
        outro: [
          `${T}He stood up in the hall and said: it was a storm, nothing more. Don't speak of it. And we didn't. I didn't, not even about my brother. Forty years of not saying Hal's name out loud.`,
          { text: `${B}And Quill. I'll have to decide about Quill. He helped us. He also sold them candles for a year. My father would have hanged him. I'm trying very hard not to be my father.`, when: TRUSTED },
          { text: `${B}And Quill in a cell, for telling us where the books were. I know he earned it. It still sits badly. My father locked up the truth too. I'm trying very hard not to be my father.`, when: EXPOSED },
          { text: `${B}At least Brother Hollis is sleeping again. Moss says he even laughed. That boy deserves one good thing from all of this.`, when: { "g:hollis": "saved" } },
          { text: `${B}And Brother Hollis still hums in his sleep, Moss says. Whatever is in him isn't finished with him.`, when: { "g:hollis": "!saved" } },
          `${B}So. I can stand in the square tomorrow and tell them everything my father buried. Or I can keep it buried until the Lantern's passed and nobody is panicking in the streets. You've done the bleeding for this town. You decide.`,
        ],
        choices: [
          {
            id: "truth",
            label: "Tell the town the truth",
            inc: { "g:mercy": 1 },
            set: { mayor: "truth" },
            rep: [{ guild: "growers", amount: 25 }],
            reply: [
              `Bram reads his father's order aloud in the square at noon, voice shaking, then steady. Nobody speaks. Then old Tobin, at the back, says one word: Hal. And then everyone is saying names.`,
              `That night the inn is full and nobody is drinking much. People sit with the people they lost the storm night and say their names out loud, one after another. Elsie serves soup to every table and says nothing at all. Her hands shake.`,
              `${B}Forty years late. But said. Thank you, Choir-Breaker. That's what they're calling you, you know. I didn't start it. I may have encouraged it.`,
            ],
          },
          {
            id: "bury",
            label: "Keep it buried until the Lantern passes",
            inc: { "g:iron": 1 },
            set: { mayor: "bury" },
            rep: [{ guild: "wardens", amount: 25 }],
            reply: [
              `Bram locks the desk again and hands you the key.\n\n${B}You keep it. If I hold it, I'll open it in a weak moment. Reyes agrees: no panic, not now, not with the sky like this.`,
              `The town goes on as if nothing happened: market day, a lost goat, an argument about fence posts. Only you, Bram and Reyes know what's in the desk. At the inn, Elsie catches your eye across the room, and looks away first.`,
              `${B}My father said: let it sleep. I'm saying: let it sleep a little longer. I hope that's different. Thank you, Choir-Breaker. The wardens started calling you that. I think it suits.`,
            ],
          },
        ],
        reward: {
          levels: 10,
          crowns: 250,
          title: "Choir-Breaker",
          journal: { entry: "act2_choir", label: "The Gray Choir" },
          codex: {
            id: "act2_order",
            title: "The Old Mayor's Order",
            text: "Forty winters ago Mayor Bram's father ordered the storm night forgotten: the keeper mourned as lost at sea, the tower never rebuilt, the bell never raised. In the margin: I saw what he did on the tower. Let them forget. Let it sleep.",
          },
        },
        hint: "Find Old Tobin wherever he fishes in town and talk to him; the old mayor's order plays right after. Then come back to Mayor Bram for the choice.",
      },
    ],
  },
];
