// Story content: see docs/STORY_BIBLE.md. The festival chapters (Realm Calendar, docs/RPG_DESIGN.md section 4):
// 16 one-chapter stories, 4 per festival, offered only while their festival runs (`cal:festival`, the live flag
// from realm:calendar) and finishable after it ends. Each pairs a Realm Calendar activity (an `event` objective
// on its realm:quest_done) with an ordinary way to do the same, so no chapter waits for a festival or a pack.
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

const NIGHT = /** @type {[number, number]} */ ([13000, 23000]);
const NOON = /** @type {[number, number]} */ ([5000, 7000]);
const SQUARE = { x: 10, z: -14 };
const CANDLES = ["minecraft:candle", "minecraft:white_candle", "minecraft:light_gray_candle", "minecraft:gray_candle", "minecraft:yellow_candle", "minecraft:orange_candle", "minecraft:red_candle", "minecraft:blue_candle"];
const BOATS = ["minecraft:boat", "minecraft:chest_boat"];
const HELMETS = ["minecraft:leather_helmet", "minecraft:chainmail_helmet", "minecraft:iron_helmet", "minecraft:golden_helmet", "minecraft:diamond_helmet", "minecraft:netherite_helmet", "minecraft:turtle_helmet"];
/** @param {string} id */
const cal = (id) => ({ pack: "calendar_bp", id: `cal:${id}` });
/** The Realm Calendar activity objectives exist only with that pack (without it, the other way shows plainly). */
const ON = { "pack:calendar_bp": "on" };
/** @param {string} f */
const during = (f) => ({ flags: { "cal:festival": f } });

/** @type {Story[]} */
export const STORIES = [
  // ---- Hatchling Tide (Thaw) ----
  {
    id: "fest_hatchlings",
    title: "The Littlest Ones",
    short: "Littlest Ones",
    giver: "wren",
    kind: "festival",
    tones: ["adorable", "funny"],
    summary: "Wren has named every baby turtle on the beach. Every single one.",
    requires: during("hatchling_tide"),
    chapters: [
      {
        id: "names",
        title: "Forty-Two Names",
        intro: [
          `${W}The hatchlings are OUT, they came up out of the sand this morning, and I've named them all, that one's Pebble and that one's Admiral Wiggles and that one's also Pebble because I forgot.`,
          `${W}But the zombies come down to the beach at night and they STEP on them, on purpose I think, and the drowned are worse. Somebody has to watch. I'm not allowed out after dark. Elsie says.`,
          `${W}And the big turtles look hungry. They eat seagrass. Will you feed them? And watch the little ones tonight? Please? Admiral Wiggles is counting on you.`,
        ],
        objectives: [
          { type: "tend", label: "Feed seagrass to 3 turtles", mobs: ["minecraft:turtle"], item: "minecraft:seagrass", count: 3 },
          { type: "event", or: "watch", label: "Keep a Nest Watch (Realm Calendar)", when: ON, quest: cal("nest_watch"), count: 1, set: { how: "nest" } },
          { type: "vigil", or: "watch", label: "Watch the beach by the lighthouse at night", place: "lighthouse", radius: 40, seconds: 60, timeOfDay: NIGHT, outdoors: true, set: { how: "beach" } },
        ],
        outro: [
          { text: `${W}You kept a whole Nest Watch?! And they ALL made it? Okay most of them. Pebble made it. Both Pebbles! I'm going to cry. I'm crying. It's fine.`, when: { how: "nest" } },
          { text: `${W}You watched the beach ALL night? Did you see Admiral Wiggles go in the water? He's so brave. He's the size of a cookie.`, when: { how: "beach" } },
          `${W}I'm naming the next one after you. It's a girl. I've decided.`,
        ],
        reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:seagrass", amount: 8 }] },
        hint: "Seagrass grows on the sea floor: cut it with shears. Hold it and tap a turtle on a beach. For the watch, start a Nest Watch from /realm:calendar at night, or stay outdoors within 40 blocks of the lighthouse at night for 60 seconds.",
      },
    ],
  },
  {
    id: "fest_tide_tobin",
    title: "What the Tide Brings",
    short: "Tide Brings",
    giver: "tobin",
    kind: "festival",
    tones: ["cozy", "sad"],
    summary: "Every Hatchling Tide, Tobin and his brother used to go out to see the turtles off.",
    requires: during("hatchling_tide"),
    chapters: [
      {
        id: "out",
        title: "Seeing Them Off",
        intro: [
          `${T}Hatchling Tide. Hal and me, we'd row out past the breakers and watch the little ones swim for it. Thousands. Like pepper on the water.`,
          `${T}I don't row out any more. Knees. Go for me. Swim with them, or take a boat out a good long way. Tell me if they still go the same way. North by the bell.`,
          `${T}And bring back kelp. Eight strands. I dry it for the winter. Hal liked it. Can't stand the stuff myself.`,
        ],
        objectives: [
          { type: "event", or: "sea", label: "Swim the Tide Swim (Realm Calendar)", when: ON, quest: cal("tide_swim"), count: 1, set: { how: "swim" } },
          { type: "ride", or: "sea", label: "Row a boat 200 blocks out with the hatchlings", mobs: BOATS, distance: 200, set: { how: "row" } },
          { type: "deliver", label: "Bring Tobin 8 kelp", npc: "tobin", item: "minecraft:kelp", count: 8 },
        ],
        outro: [
          { text: `${T}Swam it? With them? Huh. Hal did that once. Our mother nearly drowned him herself afterward.`, when: { how: "swim" } },
          { text: `${T}Two hundred blocks. Good arms. Did they go north by the bell? ...They always do.`, when: { how: "row" } },
          `${T}Kelp. Good. I'll hang it in the shed. Smells like him, a bit. Don't tell anyone I said that.`,
        ],
        reward: { levels: 2, crowns: 25 },
        hint: "Swim 100 blocks without leaving the water during the Hatchling Tide (it shows as Tide Swim), or row any boat 200 blocks. Kelp grows on the sea floor: break it and pick it up.",
      },
    ],
  },
  {
    id: "fest_night_shift",
    title: "The Night Shift",
    short: "Night Shift",
    giver: "moss",
    kind: "festival",
    tones: ["funny", "creepy"],
    summary: "Moss has appointed himself guardian of the hatchlings. Reyes has not approved this.",
    requires: during("hatchling_tide"),
    chapters: [
      {
        id: "beach",
        title: "Graveyard Shift, Beach Edition",
        intro: [
          `${MO}The dead walk the beach on Hatchling Tide. Zombies, drowned, the odd husk who took a wrong turn. They go for the little turtles. Rude. The turtles haven't even had a chance to die properly.`,
          `${MO}I'd do it myself, but I've got three funerals and a very needy grave. So I've deputized you. Unofficially. Reyes doesn't know. Reyes must never know.`,
          `${MO}Put six of them back where they belong. At night, please: in the day they're just sad.`,
        ],
        objectives: [
          { type: "defeat", label: "Defeat 6 zombies, drowned or husks at night", mobs: ["minecraft:zombie", "minecraft:drowned", "minecraft:husk"], count: 6, night: true },
          { type: "talk", label: "Report to Reyes (who will find out anyway)", npc: "reyes" },
        ],
        outro: [
          `${R}Moss deputized you. Moss is not allowed to deputize anyone. Moss is a gravedigger.`,
          `${R}...Six, you said? At night? Fine. You're deputized. Retroactively. That's an order. Mostly.`,
          `${MO}See? I said she'd come round. She always does. Like the tide. Or a corpse in a bog.`,
        ],
        reward: { levels: 3, crowns: 30 },
        rep: [{ guild: "wardens", amount: 10 }],
        hint: "Any zombie, drowned or husk counts, but only at night. Beaches and rivers are full of drowned after dark. Then talk to Reyes.",
      },
    ],
  },
  {
    id: "fest_tide_supper",
    title: "Tide Supper",
    short: "Tide Supper",
    giver: "elsie",
    kind: "festival",
    tones: ["cozy", "happy"],
    summary: "Elsie cooks for everyone who watches the beach. She needs a few things.",
    requires: during("hatchling_tide"),
    chapters: [
      {
        id: "supper",
        title: "Bread for the Watchers",
        intro: [
          `${E}Every Hatchling Tide the whole town ends up on the beach at midnight, love, and every year nobody thinks to bring supper. Except me. I always think of it.`,
          `${E}Six loaves of bread, if you can. And sea pickles: four. I put them in jars on the tables. They glow. The children think they're magic. Maybe they are, a little.`,
          `${E}Oh, and feed the old turtles while you're down there. They work so hard. Nobody ever feeds the mothers.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Elsie 6 bread", npc: "elsie", item: "minecraft:bread", count: 6 },
          { type: "deliver", label: "Bring Elsie 4 sea pickles", npc: "elsie", item: "minecraft:sea_pickle", count: 4 },
          { type: "event", optional: true, label: "Do a Turtle Feeding (Realm Calendar)", when: ON, quest: cal("turtle_feed"), count: 1, bonus: { crowns: 10 }, set: { fed: "yes" } },
        ],
        outro: [
          `${E}Look at that table. Glowing jars, warm bread. Just like it used to be. Older than you'd think, this supper. Much older.`,
          { text: `${E}And you fed the mothers! Bless you. They'll remember. Turtles remember everything, you know. Like innkeepers.`, when: { fed: "yes" } },
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cookie", amount: 6 }] },
        hint: "Bread is crafted from 3 wheat. Sea pickles grow on coral reefs in warm oceans. The optional feeding: feed seagrass to turtles 5 times during the Hatchling Tide.",
      },
    ],
  },

  // ---- Midsummer Regatta (High Sun) ----
  {
    id: "fest_course",
    title: "Mara's Course",
    short: "Mara's Course",
    giver: "mara",
    kind: "festival",
    tones: ["funny", "happy"],
    summary: "Mara has drawn the regatta course. To scale. With a legend.",
    requires: during("midsummer_regatta"),
    chapters: [
      {
        id: "race",
        title: "To Scale",
        intro: [
          `${M}I surveyed the regatta course. Eight checkpoints, a loop, a compass rose, a legend. Nobody else has ever bothered with a legend.`,
          `${M}Now somebody has to actually race it so I can see whether my map is right. I'd do it, but I get seasick looking at puddles.`,
          `${M}Race it, or just take a boat out a good long way and note where the currents pull. Then ask Tobin what he thinks. He'll say it's wrong. He always says it's wrong.`,
        ],
        objectives: [
          { type: "event", or: "water", label: "Race the Regatta (Realm Calendar)", when: ON, quest: cal("regatta"), count: 1, set: { how: "race" } },
          { type: "ride", or: "water", label: "Take a boat 400 blocks around the coast", mobs: BOATS, distance: 400, set: { how: "row" } },
          { type: "talk", label: "Ask Tobin whether Mara's course is any good", npc: "tobin" },
        ],
        outro: [
          `${T}Course is fine. Checkpoint four's too close to the rocks. Tell her that.`,
          `${M}He said it was FINE? Tobin said FINE? I'm framing this. I'm framing it with the legend showing.`,
          { text: `${M}And you raced it! How did the turns feel? Never mind, I'll draw arrows.`, when: { how: "race" } },
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:empty_map", amount: 1 }] },
        hint: "During the Midsummer Regatta, get in a boat on open water and start a race from /realm:calendar. Or ride any boat 400 blocks. Then talk to Tobin at the docks.",
      },
    ],
  },
  {
    id: "fest_sure_thing",
    title: "A Sure Thing",
    short: "A Sure Thing",
    giver: "quill",
    kind: "festival",
    tones: ["funny"],
    summary: "Quill is taking bets on the regatta's high dive. He needs a ringer.",
    requires: during("midsummer_regatta"),
    chapters: [
      {
        id: "dive",
        title: "The Ringer",
        intro: [
          `${Q}Friend! You look like someone who isn't afraid of heights. Or water. Or the two together, very fast.`,
          `${Q}There's a little book going on the high dive this year. Nothing official. Mostly Bram. I've put a few Crowns on a mystery contestant. You're the mystery.`,
          `${Q}Jump from somewhere high into water. Twenty blocks, at least. Or at least go somewhere very high and look brave. Then come back and answer me one little riddle. For luck.`,
        ],
        objectives: [
          { type: "event", or: "high", label: "Make a High Dive (Realm Calendar)", when: ON, quest: cal("high_dive"), count: 1, set: { how: "dive" } },
          { type: "reach", or: "high", label: "Climb above height 120 and look brave", aboveY: 120, set: { how: "climb" } },
          { type: "answer", label: "Answer Quill's riddle", npc: "quill", question: `${Q}What's the one bet a trader never loses?`, answers: ["the house", "house", "the house always wins", "house always wins"] },
        ],
        outro: [
          `${Q}The house! Always the house. You'd make a terrible gambler and a wonderful trader.`,
          { text: `${Q}And what a dive! Bram fainted. Not from the dive. From what he owes me. Here's your cut.`, when: { how: "dive" } },
          { text: `${Q}A climb? Well. The book said "dive". I'll tell them it was a very long dive. Here's your cut.`, when: { how: "climb" } },
        ],
        reward: { levels: 2, crowns: 35 },
        hint: "During the Midsummer Regatta, a jump of 20 blocks or more into water counts. Or climb above height 120 anywhere. The riddle: who always wins in a game of chance?",
      },
    ],
  },
  {
    id: "fest_water_safety",
    title: "Water Safety",
    short: "Water Safety",
    giver: "reyes",
    kind: "festival",
    tones: ["funny"],
    summary: "Warden Reyes is the regatta's safety officer this year. She takes it very seriously.",
    requires: during("midsummer_regatta"),
    chapters: [
      {
        id: "helmet",
        title: "Helmets On",
        intro: [
          `${R}I am this year's Regatta Safety Officer. Bram gave me a sash. I am wearing the sash.`,
          `${R}Last year three boats collided, a fisherman fell in, and someone lost a shoe to a squid. This year: helmets. On everyone. Including you.`,
          `${R}Wear one. Any helmet. Then stand watch at the lighthouse around noon, when the boats come round the point. Eyes on the water. That's an order. Mostly.`,
        ],
        objectives: [
          { type: "wear", label: "Wear a helmet. Any helmet.", items: HELMETS, slot: "head" },
          { type: "vigil", label: "Stand watch at the lighthouse around noon", place: "lighthouse", radius: 32, seconds: 60, timeOfDay: NOON, outdoors: true },
        ],
        outro: [
          `${R}Report. ...No collisions. No one in the water who didn't mean to be. One squid, sighted, contained.`,
          `${R}Good work. You can take the helmet off. ...Actually, leave it on. You never know with Quill around.`,
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:leather_helmet", amount: 1, name: "Safety Officer's Helmet", lore: ["Issued by Warden Reyes.", "Regatta regulation."] }] },
        rep: [{ guild: "wardens", amount: 5 }],
        hint: "Put any helmet in your head slot. Then stay outdoors within 32 blocks of the lighthouse between time 5000 and 7000 (around noon) for 60 seconds.",
      },
    ],
  },
  {
    id: "fest_picnic",
    title: "The Midsummer Picnic",
    short: "Midsummer Picnic",
    giver: "bea",
    kind: "festival",
    tones: ["cozy", "happy"],
    summary: "Bea is laying out the Midsummer picnic. It will be enormous. She needs fruit.",
    requires: during("midsummer_regatta"),
    chapters: [
      {
        id: "fruit",
        title: "Summer on a Plate",
        intro: [
          `${BE}MIDSUMMER! The one day of the year nobody complains about my portions! Because there's no such thing as too much at a picnic!`,
          `${BE}Melon. Eight slices. Sweet berries, eight. Fruit's the heart of a summer table, like salt's the heart of a soup. Twenty years at sea taught me that, and twenty in a kitchen proved it.`,
          `${BE}And EAT something outside for once, under the sun, like a person. Three different things. I'll know if you don't.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Bea 8 melon slices", npc: "bea", item: "minecraft:melon_slice", count: 8 },
          { type: "deliver", label: "Bring Bea 8 sweet berries", npc: "bea", item: "minecraft:sweet_berries", count: 8 },
          { type: "event", optional: true, label: "Have a Midsummer Picnic (Realm Calendar)", when: ON, quest: cal("picnic"), count: 1, bonus: { levels: 1 }, set: { ate: "yes" } },
        ],
        outro: [
          `${BE}LOOK at that spread. Melon! Berries! Like a ship's galley on the first day in port!`,
          { text: `${BE}And you ate outside! In the sun! I'm so proud I could baste something.`, when: { ate: "yes" } },
          { text: `${BE}Next year you're eating at the table with the rest of us. I'm not asking.`, when: { ate: "!yes" } },
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:pumpkin_pie", amount: 3 }] },
        hint: "Melons grow from melon seeds (found in jungles and some chests). Sweet berry bushes grow in taiga forests. The optional picnic: eat 3 different foods outdoors in the daytime during the Regatta.",
      },
    ],
  },

  // ---- Lantern Fair (Harvest) ----
  {
    id: "fest_judge",
    title: "The Judge's Dilemma",
    short: "Judge's Dilemma",
    giver: "bram",
    kind: "festival",
    tones: ["funny"],
    summary: "Mayor Bram has to judge the pumpkin carve-off. Everyone in it is his friend.",
    requires: during("lantern_fair"),
    chapters: [
      {
        id: "pumpkins",
        title: "A Fair Fair",
        intro: [
          `${B}Ah! Just the citizen I needed. As mayor, I am traditionally the judge of the Lantern Fair carve-off. Traditionally. For eleven years.`,
          `${B}And every year someone weeps. Last year it was me. So this year, the realm votes, and I simply... encourage. Enter a pumpkin, or cast your vote. Democracy! Terrifying.`,
          `${B}And put a few jack o'lanterns around the town square, would you? Four. A square without lanterns at the Fair is like a speech without a pause for applause.`,
        ],
        objectives: [
          { type: "event", or: "vote", label: "Enter or vote in the Pumpkin Carve-off (Realm Calendar)", when: ON, quest: cal("carve_off"), count: 1, set: { how: "vote" } },
          { type: "place", or: "vote", label: "Carve a pumpkin and set it out", blocks: ["minecraft:carved_pumpkin"], count: 1, set: { how: "carve" } },
          { type: "place", label: "Place 4 jack o'lanterns around the town square", blocks: ["minecraft:lit_pumpkin"], count: 4, offset: SQUARE, mark: "Town square", radius: 32 },
        ],
        outro: [
          `${B}Splendid! The square glows! I may make a short speech. A medium speech. I've written four pages.`,
          `${B}And nobody can blame the mayor for the result. Truly, the finest day of my career.`,
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:pumpkin_pie", amount: 2 }] },
        hint: "Use shears on a placed pumpkin to carve it. A jack o'lantern is a carved pumpkin crafted with a torch. During the Lantern Fair, placing a carved pumpkin also enters the carve-off; votes are in /realm:calendar.",
      },
    ],
  },
  {
    id: "fest_lanterns_ida",
    title: "Lanterns Like Stars",
    short: "Lantern Stars",
    giver: "ida",
    kind: "festival",
    tones: ["cozy"],
    summary: "Ida makes the lanterns for the Lantern Fair's float. She's short of iron.",
    requires: during("lantern_fair"),
    chapters: [
      {
        id: "iron",
        title: "Sixteen Nuggets",
        intro: [
          `${I}Lantern Fair. I make the float lanterns. Every year. Dunmore did before me.`,
          `${I}Short on iron. Sixteen nuggets. Not ingots. Nuggets. The frames are fine work.`,
          `${I}Then take one down to the water and let it go. Or hang three at the lighthouse. Somebody should see them burn who isn't me.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Ida 16 iron nuggets", npc: "ida", item: "minecraft:iron_nugget", count: 16 },
          { type: "event", or: "light", label: "Let a lantern go over the water (Realm Calendar)", when: ON, quest: cal("lantern_float"), count: 1, set: { how: "float" } },
          { type: "place", or: "light", label: "Hang 3 lanterns by the water at the lighthouse", blocks: ["minecraft:lantern", "minecraft:soul_lantern"], count: 3, place: "lighthouse", radius: 24, set: { how: "hang" } },
        ],
        outro: [
          { text: `${I}Saw it go up. Over the water. Good frame. Held.`, when: { how: "float" } },
          { text: `${I}Three at the lighthouse. Tobin will grumble. He'll leave them up.`, when: { how: "hang" } },
          `${I}Dunmore said a lantern is a promise you can carry. Didn't understand it. Do now. A bit.`,
        ],
        reward: { levels: 3, crowns: 25, items: [{ item: "minecraft:lantern", amount: 2 }] },
        hint: "Smelt or craft iron nuggets (an iron ingot makes 9). During the Lantern Fair, at night, stand at the water's edge holding a lantern and sneak to float it. Or place 3 lanterns within 24 blocks of the lighthouse.",
      },
    ],
  },
  {
    id: "fest_unremembered",
    title: "Candles for the Unremembered",
    short: "Unremembered",
    giver: "hollis",
    kind: "festival",
    tones: ["sad", "eerie", "cozy"],
    summary: "On the Lantern Fair, Hollis lights candles for the graves nobody visits.",
    requires: during("lantern_fair"),
    chapters: [
      {
        id: "candles",
        title: "Grave Twelve",
        intro: [
          `${H}Everyone has a lantern at the Fair. Everyone has someone to light it for. But some of the graves... nobody comes. I don't think it's anyone's fault. People forget. I try not to.`,
          `${H}Would you light six candles in the old graveyard? On the forgotten ones. Moss will show you which. He knows them all by name. Even the empty one.`,
          `${H}And then sit with me at the chapel for a while, after dark. You don't have to say anything. I just don't like the quiet on the Fair night. It sings.`,
        ],
        objectives: [
          { type: "place", label: "Light 6 candles in the Old Graveyard", blocks: CANDLES, count: 6, place: "graveyard", radius: 24 },
          { type: "vigil", label: "Sit with Hollis at the Old Chapel after dark", place: "old_chapel", radius: 16, seconds: 60, timeOfDay: NIGHT },
        ],
        outro: [
          `${H}Thank you. Can you hear it? No? Good. That's good. That means it's just the wind tonight.`,
          `${H}Moss says the dead don't mind being forgotten. I think he's wrong. I think they mind a little. Six of them mind a little less now.`,
        ],
        reward: { levels: 3, crowns: 20, items: [{ item: "minecraft:candle", amount: 4 }] },
        hint: "Candles are crafted from string and honeycomb. Place 6 within 24 blocks of the Old Graveyard, then stay within 16 blocks of the Old Chapel at night for 60 seconds.",
      },
    ],
  },
  {
    id: "fest_ghost_story",
    title: "A Proper Ghost Story",
    short: "Ghost Story",
    giver: "moss",
    kind: "festival",
    tones: ["creepy", "funny"],
    summary: "Moss tells the best ghost stories in the realm. He'd like an audience.",
    requires: during("lantern_fair"),
    chapters: [
      {
        id: "tale",
        title: "Sit Closer",
        intro: [
          `${MO}Lantern Fair. Best night of the year. Everyone's a little bit scared and pretending they aren't. My favorite kind of people.`,
          `${MO}I tell the ghost stories. By the fire. Sit and listen to one. Or sit in my graveyard after dark and listen to the real ones. Your choice. One's warmer.`,
          `${MO}Then I'll ask you my riddle. I ask everyone. Nobody's ever got it on the first go. Well, a child did. Once. I don't talk about it.`,
        ],
        objectives: [
          { type: "event", or: "listen", label: "Hear a Ghost Tale by a campfire (Realm Calendar)", when: ON, quest: cal("ghost_tale"), count: 1, set: { how: "fire" } },
          { type: "vigil", or: "listen", label: "Sit in the Old Graveyard after dark", place: "graveyard", radius: 20, seconds: 60, timeOfDay: NIGHT, set: { how: "graves" } },
          { type: "answer", label: "Answer Moss's riddle", npc: "moss", question: `${MO}What has a face but no head, grins all night at the Lantern Fair, and goes soft by winter?`, answers: ["a pumpkin", "pumpkin", "jack o lantern", "jack o'lantern", "a jack o lantern", "a jack o'lantern", "carved pumpkin", "a carved pumpkin"] },
        ],
        outro: [
          { text: `${MO}Liked the tale? Most of it's true. The scary parts, mainly.`, when: { how: "fire" } },
          { text: `${MO}You sat with my lot? In the dark? They liked you. Grave seven waved. Don't look like that, it's polite.`, when: { how: "graves" } },
          `${MO}A pumpkin! There you go. Smarter than the child. Not by much.`,
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:pumpkin_seeds", amount: 4 }] },
        hint: "During the Lantern Fair, sit within 2 blocks of a lit campfire at night for 60 seconds. Or stay within 20 blocks of the Old Graveyard at night for 60 seconds. The riddle has a face but no head.",
      },
    ],
  },

  // ---- Starwright's Long Night (Long Dark) ----
  {
    id: "fest_falling_stars",
    title: "The Falling Stars",
    short: "Falling Stars",
    giver: "sol",
    kind: "festival",
    tones: ["romantic", "sad", "cozy"],
    summary: "On the Long Night the stars fall. Adela used to count them with Sol.",
    requires: during("long_night"),
    chapters: [
      {
        id: "count",
        title: "Counting with Adela",
        intro: [
          `${S}Starwright's Long Night. The sky lets go of a few of its own. Vega weeps, they say. Altair catches.`,
          `${S}Adela and I would lie on the hill and count them. She always counted one more than me. I never once caught her cheating. I'm sure she was.`,
          `${S}Keep the watch for me tonight. Or go up to the old observatory and wait there under the open sky. Then go and tell Elsie how many. She likes to know. She knew Adela too. Longer than she'll say.`,
        ],
        objectives: [
          { type: "event", or: "sky", label: "Keep the Starwatch (Realm Calendar)", when: ON, quest: cal("stargaze"), count: 1, set: { how: "watch" } },
          { type: "vigil", or: "sky", label: "Wait under the open sky at the Stargazer's Ruin at night", place: "observatory", radius: 32, seconds: 90, timeOfDay: NIGHT, outdoors: true, set: { how: "ruin" } },
          { type: "talk", label: "Tell Elsie how many stars fell", npc: "elsie" },
        ],
        outro: [
          `${E}How many, love? ...That many? She'd have said one more. She always did.`,
          `${S}Elsie told me. One more than you counted. I knew it. I always knew it.`,
        ],
        reward: { levels: 3, crowns: 30 },
        hint: "During the Long Night, stay under the open sky at night for 60 seconds (Starwatch). Or stay outdoors within 32 blocks of the Stargazer's Ruin at night for 90 seconds. Then talk to Elsie at the inn.",
      },
    ],
  },
  {
    id: "fest_gift_table",
    title: "The Gift Table",
    short: "Gift Table",
    giver: "elsie",
    kind: "festival",
    tones: ["cozy", "happy"],
    summary: "Elsie's gift table on the Long Night has something for everyone. She'd like help with it.",
    requires: during("long_night"),
    chapters: [
      {
        id: "gifts",
        title: "Something for Everyone",
        intro: [
          `${E}The Long Night is the gift week, love. Old, old custom. Older than the town. You give something to someone who didn't expect it, and the dark gets a little shorter. That's the idea.`,
          `${E}Go round the town and give a few people something. Three, say. Or, if you're shy, bring Wren a cake from all of us. She'll scream. Wonderful scream, Wren has.`,
          `${E}And bake me some cookies for the table. Eight. I'll pretend I made them.`,
        ],
        objectives: [
          { type: "event", or: "give", label: "Do a Gift Round: gifts to 3 townsfolk (Realm Calendar)", when: ON, quest: cal("gift_round"), count: 1, set: { how: "round" } },
          { type: "deliver", or: "give", label: "Bring Wren a cake", npc: "wren", item: "minecraft:cake", count: 1, set: { how: "cake" } },
          { type: "deliver", label: "Bring Elsie 8 cookies", npc: "elsie", item: "minecraft:cookie", count: 8 },
        ],
        outro: [
          { text: `${E}Three gifts, three surprised faces. Bram cried. Bram always cries. It's lovely.`, when: { how: "round" } },
          { text: `${W}A CAKE? For ME? From EVERYONE? I'm going to share it with Clover. Not the frosting. Maybe the frosting.`, when: { how: "cake" } },
          `${E}Cookies on the table. Look at that. The dark already feels shorter, doesn't it?`,
        ],
        reward: { levels: 2, crowns: 25, items: [{ item: "minecraft:cake", amount: 1 }] },
        hint: "During the Long Night, sneak-tap 3 different townsfolk while holding a gift (once a day each). Or craft a cake (milk, sugar, wheat, an egg) for Wren. Cookies are wheat and cocoa beans.",
      },
    ],
  },
  {
    id: "fest_speech",
    title: "The Long Night Speech",
    short: "Long Night Speech",
    giver: "bram",
    kind: "festival",
    tones: ["funny", "cozy"],
    summary: "Mayor Bram's Long Night speech is missing its last line. And candles.",
    requires: during("long_night"),
    chapters: [
      {
        id: "line",
        title: "The Last Line",
        intro: [
          `${B}Every Long Night, the mayor gives the Speech. My father gave it. His mother gave it. It ends with a line everyone says together, and I have, ah, forgotten it.`,
          `${B}It goes: "On the longest night, we light..." and then something. I've tried "the way". I've tried "a fire". Reyes says it's "our tempers". It is not our tempers.`,
          `${B}Help me remember. And light some candles in the square, so it looks the way it did when I was a boy. Four will do. Six would be splendid.`,
        ],
        objectives: [
          { type: "answer", label: "Help Bram finish the line", npc: "bram", question: `${B}"On the longest night, we light..."?`, answers: ["a candle", "candles", "the candles", "a lantern", "lanterns", "the lanterns", "candle", "lantern"] },
          { type: "event", or: "light", label: "Keep a Candle Vigil (Realm Calendar)", when: ON, quest: cal("candle_vigil"), count: 1, set: { how: "vigil" } },
          { type: "place", or: "light", label: "Light 4 candles in the town square", blocks: CANDLES, count: 4, offset: SQUARE, mark: "Town square", radius: 32, set: { how: "square" } },
        ],
        outro: [
          `${B}"...we light a candle, and the morning comes to find it." YES. That's it! I could kiss you. I won't. Mayoral dignity.`,
          `${B}My father would say it in the square with every candle lit. And now, so will I. Thank you, friend.`,
        ],
        reward: { levels: 2, crowns: 25 },
        hint: "Think of what you light in the dark and carry in your hand. For the candles, place 4 at night during the Long Night (Candle Vigil), or place 4 candles near the town square.",
      },
    ],
  },
  {
    id: "fest_clover",
    title: "A Present for Clover",
    short: "Present for Clover",
    giver: "wren",
    kind: "festival",
    tones: ["adorable", "happy"],
    summary: "Wren wants to give her mare Clover the best Long Night present ever.",
    requires: during("long_night"),
    chapters: [
      {
        id: "carrot",
        title: "The Golden Carrot",
        intro: [
          `${W}It's the gift week and EVERYONE gets something, so Clover should get something, she's been SO good, she only bit Bram once this year and he deserved it.`,
          `${W}Horses love golden carrots more than anything, Elsie told me, and I've never had one, I mean Clover's never had one. Could you feed a horse a golden carrot? Any horse! So I can see her face. A horse face.`,
          `${W}And apples! Six apples for the stable! For later. For all of them. And me. Mostly them.`,
        ],
        objectives: [
          { type: "tend", label: "Feed a horse a golden carrot", mobs: ["minecraft:horse"], item: "minecraft:golden_carrot", count: 1 },
          { type: "deliver", label: "Bring Wren 6 apples", npc: "wren", item: "minecraft:apple", count: 6 },
        ],
        outro: [
          `${W}Did you SEE her? Did the horse do the happy ears? They do the ears!`,
          `${W}This is the best Long Night EVER. I say that every year. This year I mean it the most.`,
        ],
        reward: { levels: 2, crowns: 20, items: [{ item: "minecraft:golden_carrot", amount: 2 }] },
        hint: "A golden carrot is a carrot surrounded by 8 gold nuggets. Hold it and tap any horse. Apples drop from oak and dark oak leaves.",
      },
    ],
  },
];
