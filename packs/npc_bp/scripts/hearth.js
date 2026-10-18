// Hearth & Hearsay content: what each townsfolk loves, says and gives as you get to know them, the gossip
// templates, the story-flag reactions and the Realm Year. Voices follow docs/STORY_BIBLE.md section 4.
// Game text is plain ASCII. `{player}` is the player being spoken to; in gossip, `{name}` is who the news is
// about (or "the Crowned"), `{place}` what or where (a champion's name, a dungeon, a guild...), `{n}` a number.

/** @typedef {"loved" | "liked" | "neutral" | "disliked"} Tier */
/** @typedef {[string, string]} GossipPair about someone else, about the player themselves */
/**
 * @typedef {object} Heart
 * @property {{ loved: string[], liked: string[], disliked: string[] }} gifts item ids (anything else is neutral)
 * @property {Record<Tier, string[]>} giftLines what they say to a gift, 2 per tier
 * @property {[string, string, string, string]} levelUp reaching Acquaintance, Friend, Close, Confidant
 * @property {string[]} idle 4 more idle lines, said when the nearest listener is an Acquaintance or more
 * @property {{ label: string, text: string }[]} topics "Ask about..." (Acquaintance and up)
 * @property {string[]} cold greetings for a Hollow-Crowned player
 * @property {string[]} warm a Confidant's greetings for a Hollow-Crowned player when nobody else is near
 * @property {{ item: string, amount: number, name: string, lore: string[], line: string }} keepsake weekly, for a Confidant
 * @property {number} birthday a day of the Realm Year (1-96): gifts count double
 * @property {{ subject: string, body: string }} letter sent through Realm Mail on becoming Close
 * @property {Record<string, GossipPair[]>} [gossip] voiced gossip by kind, used along with the generic templates
 */

/** Festival greetings (Realm Calendar's `realm:calendar`), sometimes said while a festival runs. */
export const FESTIVAL_LINES = {
  hatchling_tide: ["The hatchlings are out, {player}! Mind your feet on the beach.", "Hatchling Tide! Every turtle in the realm is in a hurry tonight.", "Keep the zombies off the little ones tonight, {player}. They're so small."],
  midsummer_regatta: ["Regatta's on, {player}! Got a boat? Got a fast boat?", "Midsummer already. The water's warm and everyone's showing off.", "You racing this year, {player}? I've got a few Crowns on you. Don't tell Quill."],
  lantern_fair: ["Lantern Fair, {player}! Have you carved your pumpkin yet?", "Ghost stories by the fire tonight. Bring a blanket and a brave face.", "The lanterns go out over the water after dark. Every year. It never gets old."],
  long_night: ["Happy Long Night, {player}. Gifts count double this week, you know.", "The Choir keeps the truce tonight. Even they have something like manners.", "Look up tonight, {player}. The stars fall on the Long Night. Make a wish."],
};

export const LEVEL_NAMES = ["Stranger", "Acquaintance", "Friend", "Close", "Confidant"];

/**
 * The Realm Year: 4 seasons of 24 Realm days, each with a 4-day festival (docs/RPG_DESIGN.md section 4).
 * Realm Calendar (calendar_bp) keeps the same table: while it broadcasts `realm:calendar`, Townsfolk only listens.
 */
export const CALENDAR = {
  seasonDays: 24,
  seasons: [
    { id: "thaw", name: "Thaw", festival: [10, 13], festivalId: "hatchling_tide", festivalName: "Hatchling Tide" },
    { id: "high_sun", name: "High Sun", festival: [34, 37], festivalId: "midsummer_regatta", festivalName: "Midsummer Regatta" },
    { id: "harvest", name: "Harvest", festival: [58, 61], festivalId: "lantern_fair", festivalName: "Lantern Fair" },
    { id: "long_dark", name: "Long Dark", festival: [82, 85], festivalId: "long_night", festivalName: "Starwright's Long Night" },
  ],
};

/** @type {Record<string, Heart>} */
export const HEARTH = {
  mara: {
    gifts: {
      loved: ["minecraft:spyglass", "minecraft:compass", "minecraft:glow_ink_sac"],
      liked: ["minecraft:paper", "minecraft:feather", "minecraft:ink_sac", "minecraft:book", "minecraft:sweet_berries", "minecraft:apple"],
      disliked: ["minecraft:rotten_flesh", "minecraft:poisonous_potato", "minecraft:spider_eye"],
    },
    giftLines: {
      loved: ["Oh! Oh, that's going straight in my satchel. Don't tell anyone I squeaked.", "This is exactly what I needed and I didn't even know it. Precise. I like precise."],
      liked: ["Useful. Very useful. You'd make a decent surveyor, {player}.", "That'll get used before the week is out. Thank you."],
      neutral: ["Hm. I'll find a place for it. Everything has a place.", "Thank you. I'll put it somewhere I won't lose it. Probably."],
      disliked: ["Is that... is that wet? Please don't put that on my maps.", "I'm going to pretend you meant well and put this very far away."],
    },
    levelUp: [
      "You again! Good. I like people who come back. It means they know the way.",
      "I'm putting you on my map. Small mark, nice handwriting. That's a compliment.",
      "Most people get lost around me. You never do. Sit down, I want to show you something.",
      "There are maps I show nobody. You've seen two of them now. That's all of them. Mostly.",
    ],
    idle: ["Three hundred paces to the mill. I counted twice.", "*sharpens a pencil to a dangerous point*", "Contour lines are just the land's fingerprints.", "If I name a hill after you, you have to climb it."],
    topics: [
      { label: "How did you become a cartographer?", text: "\"I got lost when I was six. Two days in the woods. When they found me I had drawn a map of the whole valley on bark. My mother cried. I asked for more bark.\"" },
      { label: "Your old teacher", text: "\"Aldous Fenn taught me everything: scale, ink, patience. He walked every road he drew. He used to say a map is a promise you make to a stranger. I still try to keep his promises.\"" },
      { label: "The worst map you ever drew", text: "\"A swamp. It moved. I swear it moved. I drew it three times and every time the river was somewhere else. I keep that map pinned over my desk, so I never get proud.\"" },
    ],
    cold: ["I know where everything is, {player}. Including where you've been. Keep walking.", "Some places I leave off the map on purpose. You're one of them now."],
    warm: ["Nobody's watching, so. Come here. You look lost, {player}. Even you get lost.", "I kept your mark on my map, you know. Small. In pencil. I couldn't rub it out."],
    keepsake: { item: "minecraft:paper", amount: 1, name: "Mara's Sketch", lore: ["A hand-drawn map of", "the town, with your house", "marked in red ink."], line: "Here. I drew it last night. Your house is the red one. Don't fold it wrong." },
    birthday: 5,
    letter: { subject: "Come see the map room", body: "{player},\n\nI've marked you on my map. Small, in ink this time, not pencil. That means you're staying.\n\nThere's something I've never shown anyone. An old survey of Fenn's I still can't finish. Come by. Bring good boots.\n\n- Mara" },
    gossip: {
      champion: [["Did you hear? {name} took down {place}. I've marked the spot. Big red X.", "{place}, gone! I put an X where you did it, {player}. A big one."]],
      act: [["{name} is getting to the bottom of things. I'm trying to keep my maps up with them.", "You keep finding things that aren't on any map, {player}. I'll need more ink."]],
      blood_moon: [["{name} stayed out under the red moon. I'd have stayed in. With a candle. And a map.", "You walked under a red moon and came back. I'm drawing a little moon next to your name."]],
    },
  },

  tobin: {
    gifts: {
      loved: ["minecraft:salmon", "minecraft:cooked_salmon", "minecraft:nautilus_shell"],
      liked: ["minecraft:cod", "minecraft:cooked_cod", "minecraft:string", "minecraft:kelp", "minecraft:tropical_fish", "minecraft:bread"],
      disliked: ["minecraft:pufferfish", "minecraft:rotten_flesh", "minecraft:poisonous_potato"],
    },
    giftLines: {
      loved: ["Salmon. Hah. You know the way to an old man's heart. Through the belly. Like a hook.", "A fine thing. My brother would have liked you. Don't make me say it twice."],
      liked: ["Good catch. Fair trade. You're all right.", "That'll do. That'll do nicely."],
      neutral: ["Hm. Thanks. I'll find a use for it.", "Didn't need it. Won't throw it back either."],
      disliked: ["A puffer? You trying to finish me off?", "Throw that back where it came from. Not literally. Well. Literally."],
    },
    levelUp: [
      "You. Again. Sit. Don't talk. Fish don't like talk.",
      "You're welcome on my dock. Not everybody is. Most people talk.",
      "Pull up a crate. I'll tell you about the Gull. Not all of it. Some of it.",
      "There's nobody I'd trust with my boat but you. And my brother. And he's gone.",
    ],
    idle: ["Tide's turning. Feel it in my knees.", "*whistles a sea shanty, badly*", "Gull's hull needs tar. Again.", "Red sky at morning. Shepherd's warning. Fisher's too."],
    topics: [
      { label: "The Gull", text: "\"My brother's boat. Hal built her the summer he turned twenty. She's tarred and patched and older than half this town. I keep her at the dock. Can't sail her. Can't sell her. So she sits.\"" },
      { label: "How long have you fished here?", text: "\"Since I could hold a line. Sixty years, give or take. The fish have changed. The sea hasn't. The sea never changes. That's the comfort of it.\"" },
      { label: "Sea sayings", text: "\"Never whistle on a boat. Never count the fish till they're salted. Never trust a calm sea, and never trust a man who says he's never been seasick. That's four. That's all you get.\"" },
    ],
    cold: ["Not today. Not you.", "Fish are biting. Somewhere else. Go and find them, {player}."],
    warm: ["Nobody about. Good. Sit, {player}. I don't understand what you did. I still saved you a crate.", "Hal used to make the wrong choices too. I loved him anyway. Don't tell anyone I said that."],
    keepsake: { item: "minecraft:cooked_salmon", amount: 4, name: "Tobin's Smoked Salmon", lore: ["Smoked over driftwood", "the old way."], line: "Smoked it myself. Driftwood fire. Don't eat it all at once. You will anyway." },
    birthday: 20,
    letter: { subject: "The Gull", body: "{player}.\n\nI'm no good at letters. Hal did the writing.\n\nCome down to the dock when you can. There's a job I've put off forty years. I'd like it done with you.\n\n- Tobin" },
    gossip: {
      champion: [["{name} put down {place}. Clean work. Like gutting a fish.", "Heard you put down {place}. Good. One less thing in the water."]],
      act: [["{name}'s stirring up old things. Old things don't like being stirred.", "You keep pulling on that line, {player}. Mind what comes up on the hook."]],
      blood_moon: [["{name} stood out under a red moon. Brave or daft. Same thing at sea.", "Red moon, and you stood out in it. Brave or daft. I'd have done the same."]],
    },
  },

  reyes: {
    gifts: {
      loved: ["minecraft:iron_ingot", "minecraft:shield", "minecraft:arrow"],
      liked: ["minecraft:cooked_beef", "minecraft:bread", "minecraft:torch", "minecraft:bone", "minecraft:string", "minecraft:flint"],
      disliked: ["minecraft:cake", "minecraft:cookie", "minecraft:dandelion"],
    },
    giftLines: {
      loved: ["Now that's a gift a warden can use. Noted. Favorably.", "Good steel. Better judgment. Thank you, {player}."],
      liked: ["Supplies. The wardens thank you. I thank you. Mostly the wardens.", "Practical. I respect practical."],
      neutral: ["Hm. Logged and stored.", "I'll put it in the armory. Someone will find a use."],
      disliked: ["Sugar makes the recruits slow. Take it to Bea.", "Flowers. For a warden. That's a joke, right? That's a joke."],
    },
    levelUp: [
      "I've seen you on patrol routes. You're consistent. That's rare.",
      "You can stand at my post any time. Don't touch the logbook.",
      "I don't say this. I'm saying it: I trust your back in a fight.",
      "If I fall, the wardens listen to you. That's an order. Not mostly.",
    ],
    idle: ["Rotation's off by one. Who swapped shifts?", "*oils a crossbow*", "Third creeper this week. Third.", "At ease. Not you. The other one."],
    topics: [
      { label: "Why did you become a warden?", text: "\"A raid, when I was nine. The wardens held the gate all night. In the morning one of them gave me her helmet to hold while she slept. I never gave it back. I'm still holding it.\"" },
      { label: "Your wardens", text: "\"Nine on the roll, four who can shoot straight, two who can cook. We hold. That's the whole job: we hold, so everyone else gets to sleep.\"" },
      { label: "What do you do off duty?", text: "\"Off duty? I sharpen things that are already sharp. Elsie says that's not a hobby. I say it's a discipline. She says that's worse.\"" },
    ],
    cold: ["You're on my watch list, {player}. Move along. That's an order. No mostly.", "I don't salute you. I won't. Keep walking."],
    warm: ["Off the record, {player}. I still have your back. Don't make me regret it more than I do.", "Quiet watch tonight. Stand with me a minute. Nobody needs to know."],
    keepsake: { item: "minecraft:arrow", amount: 16, name: "Warden's Fletching", lore: ["Gray goose feathers,", "the wardens' own."], line: "Warden's arrows. Fletched them myself. They fly true. So do you." },
    birthday: 29,
    letter: { subject: "Report to the watch post", body: "{player},\n\nYou have earned a conversation I don't have with recruits. Report to my post when you are free. Bring nothing. Wear armor anyway.\n\nThat's an order. Mostly.\n\n- Warden Reyes" },
    gossip: {
      champion: [["{name} took out {place}. Clean work. I'd recruit them if they'd hold still.", "You took {place} off my threat board, {player}. Good work. Don't let it go to your head."]],
      act: [["{name} is doing the work my wardens should be doing. I'm both grateful and annoyed.", "You keep finishing what we can't, {player}. Keep it up. And report in."]],
      blood_moon: [["{name} held under the red moon. I logged it. In ink.", "You held all night under a red moon. I logged it in ink, {player}."]],
    },
  },

  elsie: {
    gifts: {
      loved: ["minecraft:honey_bottle", "minecraft:sweet_berries", "minecraft:cake"],
      liked: ["minecraft:wheat", "minecraft:egg", "minecraft:sugar", "minecraft:candle", "minecraft:white_wool", "minecraft:apple"],
      disliked: ["minecraft:rotten_flesh", "minecraft:gunpowder", "minecraft:spider_eye"],
    },
    giftLines: {
      loved: ["Oh, love, you shouldn't have. You absolutely should have. Sit, I'll put the kettle on.", "That takes me back. Further than you'd guess. Thank you, dear."],
      liked: ["That's going in tomorrow's baking. You'll get the first slice.", "How thoughtful! The inn always needs these."],
      neutral: ["Well, isn't that kind. I'll find it a home.", "Thank you, dear. Everything comes in handy at an inn."],
      disliked: ["Oh. Oh my. Let's keep that out of the kitchen, shall we? Bea would scream.", "That's... not for the inn, love. Not near the guests."],
    },
    levelUp: [
      "There's a cup with your name on it now. Well, a cup. I remember which.",
      "You're one of my regulars now. That means the good blanket.",
      "Sit by the fire with me a while, {player}. I've a story or two, if you like old ones.",
      "In the old tongue there's a word for someone like you. Hearth-friend. I haven't said it in a long, long time.",
    ],
    idle: ["Room four needs fresh sheets.", "*polishes a mug that's already clean*", "The old words come back when I'm tired.", "Someone always forgets their scarf."],
    topics: [
      { label: "How long have you run the inn?", text: "\"Oh, longer than you'd believe, love. Long enough to have seen every kind of traveler and every kind of weather. Long enough to know the stew is always the answer.\"" },
      { label: "Your old songs", text: "\"My mother sang them, and hers before her. Songs about the sky, mostly. Stars that were friends and stars that were warnings. I hum them when I'm baking. The bread rises better.\"" },
      { label: "Wren", text: "\"Wren came to me with nothing but a goat and a very loud opinion. Now she has a dozen animals and louder opinions. She's the best thing that ever walked into this inn.\"" },
    ],
    cold: ["There's no room tonight, {player}. Not for you.", "I'll serve you, because I serve everyone. Don't ask for more."],
    warm: ["It's just us, so. Here. Eat. You're still my guest, {player}, whatever else you are.", "I've made worse choices than yours, love, a long time ago. I know what that weighs."],
    keepsake: { item: "minecraft:bread", amount: 4, name: "Elsie's Morning Loaf", lore: ["Still warm.", "Smells like honey."], line: "Fresh from the oven. I made one extra. I always make one extra for you now." },
    birthday: 44,
    letter: { subject: "A seat by the fire", body: "Dear {player},\n\nThe inn has a chair by the hearth that nobody sits in. I've kept it for someone for a very long time. I think it might be yours now.\n\nCome by after supper. There are things I'd like to tell you, slowly.\n\nWith love,\nElsie" },
    gossip: {
      champion: [["{name} came back from fighting {place} without a scratch. Well, a few scratches. I bandaged them.", "You beat {place}! Sit down, love, let me see those scratches."]],
      act: [["{name} carries a lot these days. I keep a bowl of stew warm for them.", "You carry so much now, {player}. There's always stew. Always."]],
      blood_moon: [["{name} was out all through the red moon. I didn't sleep a wink.", "You were out all through that red moon. I didn't sleep a wink, love."]],
    },
  },

  bram: {
    gifts: {
      loved: ["minecraft:gold_ingot", "minecraft:emerald", "minecraft:sunflower"],
      liked: ["minecraft:cake", "minecraft:cookie", "minecraft:paper", "minecraft:bread", "minecraft:golden_carrot", "minecraft:dandelion"],
      disliked: ["minecraft:rotten_flesh", "minecraft:bone", "minecraft:poisonous_potato"],
    },
    giftLines: {
      loved: ["For the town? For ME? I... I'll have it framed. No. Displayed. Tastefully.", "My word, {player}. A gift worthy of the town hall. I'm quite overcome."],
      liked: ["Splendid! Very civic of you.", "The town thanks you. The mayor thanks you. I thank you twice, being both."],
      neutral: ["How kind. I'll file it. Under gifts.", "Ah. Yes. Thank you. Very... thoughtful."],
      disliked: ["Is this a protest? Is this about the taxes? They're contributions!", "Please don't leave that on my desk. People already think the paperwork smells."],
    },
    levelUp: [
      "Ah, a familiar face! Always good to know the citizens by name.",
      "You're a pillar of this town, {player}. I'd put it on a plaque if plaques weren't so expensive.",
      "Come into the office. Close the door. I'd like to talk to you as Bram, not as the mayor.",
      "If anything happens to me, I've told them you're to speak for the town. Don't argue. I've already had the paper drawn up.",
    ],
    idle: ["The plaque budget is a disgrace.", "*practices a speech under his breath*", "Order. Order! Oh, there's nobody here.", "My father would know what to do. He always did. Didn't he?"],
    topics: [
      { label: "Being mayor", text: "\"It's mostly paperwork, ribbon cutting and being shouted at about drains. I love it. Don't tell anyone. Mayors are supposed to be tired.\"" },
      { label: "Your father", text: "\"He was mayor before me. Stern man. Good handwriting. He kept the town together after a very hard winter, long ago. He never talked about it. I never asked. Maybe I should have.\"" },
      { label: "Your hat", text: "\"It's the mayoral hat. It came with the office. It is three sizes too big and smells faintly of my father's pipe. I would not give it up for all the gold in the vault.\"" },
    ],
    cold: ["Ah. You. The town is... grateful, I'm told. I'm not.", "My door is closed today, {player}. And tomorrow. You understand."],
    warm: ["Close the door. Good. I don't forgive you, {player}. I'm trying to. That's new for me.", "My father buried things for the town's sake. You did worse for it. I keep asking myself which of you was right."],
    keepsake: { item: "minecraft:gold_nugget", amount: 1, name: "Commemorative Coin", lore: ["Struck for the town.", "Bram's face on one side,", "slightly too large."], line: "A commemorative coin! I had them made. Only six exist. Well, sixty. But only six good ones." },
    birthday: 52,
    letter: { subject: "Official business (unofficial)", body: "Dear {player},\n\nThis letter is from the mayor's office, but not from the mayor. It's from Bram.\n\nI'd like to show you something in the town archive. Something my father kept locked. Please come by. Bring patience. And perhaps a lantern.\n\nYours sincerely,\nBram" },
    gossip: {
      champion: [["{name} rid us of {place}! I'm proposing a holiday. A small one. A long lunch.", "You rid the town of {place}! I'm proposing a long lunch in your honor."]],
      act: [["{name} keeps doing great things for the town. I keep trying to write speeches about it.", "I've written three speeches about you, {player}. Each one longer. I'm sorry in advance."]],
      blood_moon: [["{name} survived a Blood Moon! I've drafted a commendation. It's mostly adjectives.", "A whole Blood Moon, {player}! I've drafted a commendation. It's mostly adjectives."]],
    },
  },

  quill: {
    gifts: {
      loved: ["minecraft:emerald", "minecraft:diamond", "minecraft:rabbit_foot"],
      liked: ["minecraft:gold_ingot", "minecraft:leather", "minecraft:gunpowder", "minecraft:iron_ingot", "minecraft:amethyst_shard", "minecraft:copper_ingot"],
      disliked: ["minecraft:dirt", "minecraft:cobblestone", "minecraft:rotten_flesh"],
    },
    giftLines: {
      loved: ["Now THAT is a gift. I won't even sell it. Probably. For a while.", "You have taste, {player}. Dangerous taste. I like it."],
      liked: ["Mm. Good resale. I mean, good sentiment.", "A gift with a market value. My favorite kind of gift."],
      neutral: ["How sweet. I'll find a buyer. I mean a place for it.", "Thank you, friend. Everything sells to someone."],
      disliked: ["Dirt. You brought me dirt. I'm going to remember this.", "I can't sell this. I can't even give this away. I've tried."],
    },
    levelUp: [
      "Ah, a returning customer! I'll remember your face. And your purse.",
      "For you, friend prices. Real friend prices. Not the friend prices I tell everyone.",
      "Let's talk without the counter between us. Just once. Don't get used to it.",
      "I'd tell you where I hide the good stock. I'd even mean it. That's a first.",
    ],
    idle: ["Buy low, sell high, smile always.", "*flips a coin and catches it without looking*", "That ledger balances. Mostly.", "Never ask where. Ask how much."],
    topics: [
      { label: "Where do you get your stock?", text: "\"Here and there. Mostly there. A trader never names his suppliers, {player}. It's bad for the suppliers. And worse for the trader.\"" },
      { label: "Your best deal ever", text: "\"I once sold a horse back to the man who sold it to me. For more. With the same saddle. He thanked me. I still think about that day when I'm sad.\"" },
      { label: "Do you ever stop bargaining?", text: "\"Once. For about a minute, at my mother's wake. Then someone offered me a fair price for her teapot, and, well. She'd have wanted me to haggle.\"" },
    ],
    cold: ["Ah, my favorite customer! Power is just another currency, and you're rich, {player}.", "The Crowned shops with me. Business has never been better. Or stranger."],
    warm: ["Between us, {player}? I'd have taken the crown too. That's what scares me.", "No counter, no prices, nobody listening. You did a terrible thing. I'd still trust you with my ledger."],
    keepsake: { item: "minecraft:emerald", amount: 1, name: "Quill's Lucky Emerald", lore: ["Never spent.", "Never sold.", "Never tell him you have it."], line: "My lucky emerald. Don't spend it. If you spend it, I'll know. I always know." },
    birthday: 65,
    letter: { subject: "A private offer", body: "Friend {player},\n\nI have an offer for you that I don't make to customers. It isn't for sale. That alone should worry you.\n\nCome by after closing. Knock twice, then once. If I don't answer, I'm not hiding. Probably.\n\n- Q." },
    gossip: {
      champion: [["{name} took down {place}. I'd have charged for that. They did it for free. Amateur.", "You took {place} for free, {player}? I'd have charged. I'll charge for you next time."]],
      act: [["{name} is poking at the realm's oldest secrets. Bad for business. Great for gossip.", "You keep digging up secrets, {player}. Some of them were mine. Kindly stop."]],
      blood_moon: [["{name} sold nothing during a Blood Moon. Survived it, though. Some people.", "You survived the Blood Moon? Shame. I was going to sell your boots. Kidding. Mostly."]],
    },
  },

  ida: {
    gifts: {
      loved: ["minecraft:diamond", "minecraft:amethyst_shard", "minecraft:netherite_scrap"],
      liked: ["minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:copper_ingot", "minecraft:coal", "minecraft:lapis_lazuli", "minecraft:redstone"],
      disliked: ["minecraft:cake", "minecraft:poppy", "minecraft:pufferfish"],
    },
    giftLines: {
      loved: ["Good. Very good. I'll make something worthy of it.", "Hm. That's... thank you. That's the right word. Thank you."],
      liked: ["Useful. Goes in the bin by the forge.", "Good stock. Thanks."],
      neutral: ["Fine.", "Hm. Thanks."],
      disliked: ["Can't forge a flower.", "No. Take it back. It'll melt."],
    },
    levelUp: [
      "You. You come back. Good.",
      "Use the anvil any time. Not the good hammer.",
      "Sit. Watch. Don't talk. This is how Dunmore taught me.",
      "Use the good hammer.",
    ],
    idle: ["Too much flux.", "*listens to the steel cool*", "Dunmore would hate this weld.", "Quench. Wait. Quench."],
    topics: [
      { label: "Your master, Dunmore", text: "\"Dunmore. Big hands, small words. Best smith this coast ever had. He'd stand at the forge till dawn listening to the metal. I thought he was mad. Then I started hearing it too.\"" },
      { label: "Relic Shards", text: "\"Shards hum. Each one a different note. Put two the same in a forge and they sing. Put two different ones in and they fight. I like the fights. Better relics.\"" },
      { label: "Why don't you talk much?", text: "\"Words wear out. Steel doesn't.\"" },
    ],
    cold: ["No.", "Forge is busy. For you, always."],
    warm: ["Sit. Watch the fire. Don't explain, {player}. I don't need you to.", "Bad steel can be reforged. Takes heat. Takes time. You have time."],
    keepsake: { item: "minecraft:iron_nugget", amount: 9, name: "Ida's Offcuts", lore: ["Good iron.", "Too good to waste."], line: "Offcuts. Good iron. You'll use them." },
    birthday: 70,
    letter: { subject: "Forge", body: "{player}.\n\nCome to the forge. Something to show you. Dunmore's.\n\nBring a pickaxe.\n\n- Ida" },
    gossip: {
      champion: [["{name}. {place}. Dead. Good.", "{place}. You did that. Good."]],
      act: [["{name} is asking the right questions. Dunmore would like them.", "You ask good questions, {player}. Dunmore asked good questions."]],
      blood_moon: [["{name} stood out under the red moon. Steel holds in fire. So do some people.", "Red moon. You held. Like good steel."]],
      relic_starlit: [["{name}'s {place}. Starlit. My work. Their shards. Good.", "Your {place}. Starlit. Best thing I've made. Don't drop it."]],
    },
  },

  sol: {
    gifts: {
      loved: ["minecraft:glowstone_dust", "minecraft:amethyst_shard", "minecraft:spyglass"],
      liked: ["minecraft:clock", "minecraft:feather", "minecraft:glow_berries", "minecraft:lapis_lazuli", "minecraft:paper", "minecraft:honey_bottle"],
      disliked: ["minecraft:rotten_flesh", "minecraft:gunpowder", "minecraft:coal"],
    },
    giftLines: {
      loved: ["It glows like Oriel on a winter night. You've given me a little star, {player}.", "Oh. Oh, the light in this. Adela would have held it up to the window."],
      liked: ["A lovely thing. It will sit on my sill and catch the dawn.", "Thank you. The sky approves. So do I."],
      neutral: ["Even ordinary things are made of old starlight. Thank you.", "Hm. I'll keep it near the telescope. For luck."],
      disliked: ["It smells of the dark under the world. Please, keep it away from my lenses.", "Smoke and soot. The stars hate soot."],
    },
    levelUp: [
      "The stars said someone would come back. They're usually vague. Not this time.",
      "Come up to the roof some night. I'll show you the Net and the Lantern's road.",
      "You remind me of a star Adela loved. Small, steady, always where you said it would be.",
      "I've named a star after you. A faint one. The faint ones are the faithful ones.",
    ],
    idle: ["Vega is late tonight.", "*traces a constellation in the air*", "The Net is drifting west.", "Adela would know this one."],
    topics: [
      { label: "Reading the sky", text: "\"The sky is a book written very slowly. One page a night, one chapter a year. Most people only read the weather. I read the footnotes.\"" },
      { label: "Adela", text: "\"My wife. She named half the stars I use. She said the sky gets lonely if nobody talks to it. So I talk to it. Every night. She'd laugh at how much.\"" },
      { label: "Your favorite star", text: "\"Oriel. The bright one in the east before dawn. It's always there when I can't sleep. Adela said it was the sky's lantern, keeping watch for the rest of us.\"" },
    ],
    cold: ["Your star has gone dark in my book, {player}. I don't know how to read you now.", "The sky turned away from you. I'm only following it."],
    warm: ["No one's listening but the stars, {player}. They say you're still in there. Somewhere.", "I left your star in my book. I couldn't strike it out. Faint ones are faithful."],
    keepsake: { item: "minecraft:glowstone_dust", amount: 4, name: "Sol's Stardust", lore: ["Swept off the roof", "after a falling star."], line: "Stardust from the roof. Real, I promise. Well. Real enough to glow." },
    birthday: 88,
    letter: { subject: "Look up tonight", body: "{player},\n\nThere's a star I've never shown anyone. Adela found it, the winter before she died. I'd like to show it to you.\n\nCome to me when the sky is clear. I'll wait. I'm good at waiting. The stars taught me.\n\n- Sol" },
    gossip: {
      champion: [["{name} put out {place} like a candle. I saw it in the sky. Well. I saw them come home.", "You put out {place} like a candle, {player}. The sky noticed."]],
      act: [["{name} is walking a road the stars drew long ago. I hope they read it right.", "You're walking the old star road, {player}. Mind each step."]],
      blood_moon: [["{name} stood under the red moon. The moon remembers who looks back at it.", "You looked the red moon in the eye, {player}. It remembers that. So do I."]],
    },
  },

  hollis: {
    gifts: {
      loved: ["minecraft:candle", "minecraft:honeycomb", "minecraft:book"],
      liked: ["minecraft:bread", "minecraft:white_wool", "minecraft:apple", "minecraft:glow_berries", "minecraft:lily_of_the_valley", "minecraft:paper"],
      disliked: ["minecraft:bell", "minecraft:gunpowder", "minecraft:wither_rose"],
    },
    giftLines: {
      loved: ["For the chapel? Oh, {player}. The candles will burn longer tonight. So will I, maybe.", "Thank you. I don't get many gifts. I'll try not to cry on it."],
      liked: ["That's kind. Truly kind. Thank you.", "Oh! For me? I'll put it by the altar. Is that strange? It feels right."],
      neutral: ["Thank you. I'll... find a place for it. There's always room in a chapel.", "That's very generous. I think. Thank you."],
      disliked: ["Please. Not a bell. Not in here. Take it away. I'm sorry.", "That's... no. I can't have that near the candles. Forgive me."],
    },
    levelUp: [
      "You came back! I hoped you would. I prayed about it. A little.",
      "You can sit with me any time. Even when I'm not good company. Especially then.",
      "I don't sleep much. If you're awake too, come by. We can not-sleep together.",
      "You're the first person I've told everything to. Well. Almost everything. I'm working on the rest.",
    ],
    idle: ["Forty-one candles. Forty-two.", "*straightens a hymnbook*", "Was that the wind?", "The pews remember everyone."],
    topics: [
      { label: "How did you come to the chapel?", text: "\"I was the only one who applied. That sounds sad. It isn't. I wanted a quiet place to be useful. I didn't know quiet places could be so loud at night.\"" },
      { label: "Do you sleep?", text: "\"Some. Not much. I have the same dream most nights, about water. I tell myself it's only a dream. Most nights it believes me.\"" },
      { label: "What do you believe in?", text: "\"Kindness. Candles. That the dark is just a room nobody has lit yet. I'm trying to light it. One wick at a time.\"" },
    ],
    cold: ["Peace to you, {player}. I mean it. I don't know if I can mean anything else.", "I pray for you. I don't know who I'm praying to any more."],
    warm: ["Sit. You're not beyond forgiving, {player}. Nobody is. I have to believe that.", "The water spoke to me too, once. I said no. I understand why you said yes. I still pray you'll put it down."],
    keepsake: { item: "minecraft:candle", amount: 2, name: "Chapel Candle", lore: ["Blessed, in a quiet way.", "Burns a little longer."], line: "Two candles from the chapel. For your nights. Light one when it's dark and you think of me." },
    birthday: 92,
    letter: { subject: "A quiet hour", body: "Dear {player},\n\nI've never had a friend I could tell the truth to. I think I might now. That frightens me a little.\n\nCome to the chapel when it's quiet. I'll light the candles. All of them, this time.\n\nPeace,\nHollis" },
    gossip: {
      champion: [["{name} faced {place} and came home. I lit a candle for them. Several.", "You faced {place} and came home. I lit a candle for you, {player}. Several."]],
      act: [["{name} goes where I'm too afraid to. I pray for them. It's what I can do.", "You go where I'm too afraid to, {player}. I pray for you every night."]],
      blood_moon: [["{name} was out under the red moon. I sat up with every candle lit.", "You stayed out under the red moon. I sat up with every candle lit, {player}."]],
      siege: [["{name} silenced the Choir's bells. I heard them stop, one by one. I cried a little. Good tears.", "You silenced the bells, {player}. I heard them stop, one by one. Thank you."]],
      siege_lost: [["I heard the Choir singing all night through the chapel walls. I knew the words. I don't know how I knew the words.", "I heard them singing all night, {player}. I knew the words. Please don't tell anyone that."]],
      calling: [["I wrote {name} into the chapel book. A {place}. My hand shook, but the ink took.", "Your name is in the chapel book now, {player}. A {place}. I read it every night."]],
    },
  },

  moss: {
    gifts: {
      loved: ["minecraft:bone", "minecraft:wither_rose", "minecraft:pumpkin_pie"],
      liked: ["minecraft:bone_meal", "minecraft:rotten_flesh", "minecraft:potato", "minecraft:coal", "minecraft:poppy", "minecraft:dirt"],
      disliked: ["minecraft:cake", "minecraft:sunflower", "minecraft:honey_bottle"],
    },
    giftLines: {
      loved: ["A bone! You shouldn't have. Mrs. Abernathy says thank you too.", "Pie. Pie is the only thing worth digging up. Thank you, {player}."],
      liked: ["Lovely. Useful in my line of work. Don't ask which line.", "That'll come in handy. Things usually do, eventually. Then they come to me."],
      neutral: ["Huh. I'll bury it. Kidding. Probably.", "Thanks. The yard has room for everything."],
      disliked: ["Too cheerful. The graves will talk.", "Sweet things go off. Everything goes off. This goes off faster."],
    },
    levelUp: [
      "You're still alive and you came back. My two favorite things in a visitor.",
      "I've picked out a nice plot for you. For much, much later. That's friendship, in my trade.",
      "Sit on that headstone. He won't mind. I'll tell you what the quiet ones tell me.",
      "When your time comes, I'll dig you myself. Six and a half feet. Extra deep. You've earned it.",
    ],
    idle: ["Shh. He's napping. Permanently.", "*leans on a shovel, humming*", "Soil's good this year. Rich.", "Somebody's knocking. Underground. Rude."],
    topics: [
      { label: "Talking to the dead", text: "\"Somebody has to. They've got all the time in the world and nobody visits. I tell them the news. Mrs. Abernathy likes the weather. Old Pell only wants to hear about cheese.\"" },
      { label: "Why gravedigging?", text: "\"My father dug, his father dug. Family business. Nobody ever complains about the service. Repeat customers are rare, though.\"" },
      { label: "Are you ever scared here?", text: "\"Of the dead? No. The dead are polite. The living leave the gate open and track mud on the flowers. Scared of them, sometimes.\"" },
    ],
    cold: ["I don't dig for your kind. Not yet. Go on.", "Even the dead lower their voices when you walk past, {player}."],
    warm: ["Sit, then. The dead don't judge, and neither do I, much. You're carrying something heavy, {player}.", "I've got a plot picked out for you still. Nobody gets struck off my list. Not even you."],
    keepsake: { item: "minecraft:bone", amount: 1, name: "Moss's Lucky Bone", lore: ["Whose? Don't ask.", "Lucky, though."], line: "My lucky bone. Don't ask whose. He said it was fine. Well. He didn't say it wasn't." },
    birthday: 77,
    letter: { subject: "Graveyard. Night. Bring a shovel.", body: "{player},\n\nThat sounds worse than it is. It's a nice thing. A little sad. Mostly nice.\n\nThere's a grave I tend that nobody else visits. I'd like you to meet her. Come after dark.\n\n- Moss\n\nPS. Mrs. Abernathy says hello." },
    gossip: {
      champion: [["{name} sent {place} my way. Saves me the trouble of waiting.", "You sent {place} my way. Thanks. Saves me the waiting."]],
      act: [["{name} keeps poking at old graves. I like them. They're the only one who asks first.", "You keep poking at old graves, {player}. At least you knock."]],
      blood_moon: [["{name} walked a red moon night. The yard was busy. Nobody stayed down.", "Red moon night, and you walked it. The yard was very busy. Nobody stayed down."]],
      calling: [["{name} is a {place} now. Half the old {place}s are in my north row. Good company.", "A {place}, {player}. Half the old ones are in my north row. No hurry to visit."]],
    },
  },

  wren: {
    gifts: {
      loved: ["minecraft:carrot", "minecraft:hay_block", "minecraft:apple"],
      liked: ["minecraft:wheat", "minecraft:sugar", "minecraft:wheat_seeds", "minecraft:lead", "minecraft:golden_carrot", "minecraft:sweet_berries"],
      disliked: ["minecraft:leather", "minecraft:rotten_flesh", "minecraft:bone"],
    },
    giftLines: {
      loved: ["CARROTS? For Clover? She's going to go absolutely bananas, {player}, she does a little dance!", "Oh my gosh oh my gosh, a whole bale? Pudding is going to sleep on it. Thank you!"],
      liked: ["The chickens say thank you! Well, they said bok. That means thank you.", "This is perfect, I'm going to share it with everyone, even Grumbles, even though he bit me."],
      neutral: ["Ooh, what's it for? I'll find out. Thank you!", "Thank you! I'll put it in my treasure box. It's mostly feathers."],
      disliked: ["That's... is that somebody's cow? Please take it away. Please.", "Eww. The goats won't even eat that. And they eat my socks."],
    },
    levelUp: [
      "You came back! Clover remembered you! She did a little stomp!",
      "You're officially a friend of the stable. That means you get to name a chicken. Any chicken. Except Grumbles.",
      "Can I tell you a secret? I talk to the horses about you. They think you're nice. I do too.",
      "You're my best friend. Well, my best human friend. Clover is a horse. She doesn't count. She counts a little.",
    ],
    idle: ["Pudding, that's not food!", "*braids a horse's mane with a flower*", "I'm going to have a hundred animals one day.", "Shh, the lambs are thinking."],
    topics: [
      { label: "How many animals do you have?", text: "\"Twelve! No. Fourteen. Seventeen if you count the cats, and you should, they're very important. And Grumbles, who doesn't count himself, he says he's a free goat.\"" },
      { label: "Elsie", text: "\"Elsie took me in when I was little and only had Grumbles. She says I was very loud. I'm still very loud. She says that's okay. She makes me cocoa when I can't sleep.\"" },
      { label: "What do you want to be?", text: "\"An animal doctor! Or a horse. Probably an animal doctor. Horses don't get to read.\"" },
    ],
    cold: ["H-hi {player}. The horses get scared when you come. I'm not scared. I'm not.", "Hi. I'm okay. Clover hides when you come. I don't hide. I'm just standing behind her."],
    warm: ["Nobody's here, so, um. I still like you, {player}. Even with the crown. Is that okay?", "Clover's scared of you. I told her you're still you inside. You are, right? I think you are."],
    keepsake: { item: "minecraft:poppy", amount: 3, name: "Flowers from Wren", lore: ["Picked from the meadow.", "One was nibbled. Sorry."], line: "I picked these for you! One got nibbled. That was Pudding. She says sorry. She doesn't." },
    birthday: 16,
    letter: { subject: "COME TO THE MEADOW", body: "{player}!!!\n\nI have something really important to show you. It's a surprise. It's an animal. No it's not. Maybe it is.\n\nCome to the meadow! Don't tell Elsie I'm writing letters when I should be mucking out.\n\nLove, Wren (and Clover) (and Pudding)" },
    gossip: {
      champion: [["Did you hear, did you HEAR? {name} beat {place}! I made the chickens cheer. They mostly bokked.", "You beat {place}! I made the chickens cheer for you! It was mostly bokking!"]],
      act: [["{name} is like a hero from a story. Elsie says don't say that out loud. Oops.", "You're like a hero in a story, {player}! Elsie says I'm not supposed to say that. Oops."]],
      blood_moon: [["The moon went all red and {name} stayed out ALL NIGHT. The horses wouldn't stop stomping.", "The moon went red and you stayed out all night! I hid in the hay with the lambs."]],
    },
  },

  bea: {
    gifts: {
      loved: ["minecraft:cocoa_beans", "minecraft:beetroot", "minecraft:pumpkin"],
      liked: ["minecraft:egg", "minecraft:milk_bucket", "minecraft:wheat", "minecraft:potato", "minecraft:carrot", "minecraft:sweet_berries"],
      disliked: ["minecraft:rotten_flesh", "minecraft:poisonous_potato", "minecraft:pufferfish"],
    },
    giftLines: {
      loved: ["NOW we're cooking! Oh, I could kiss you, sailor. I won't. I'll bake you something.", "Look at the color on that! Proper produce! You're a treasure, {player}!"],
      liked: ["Into the pantry with you! Good haul, sailor.", "That'll season the week nicely. Thank you, love."],
      neutral: ["Hm. Everything goes in a stew eventually.", "Thank you! I'll find a pot it fits in."],
      disliked: ["Out! Out of my galley with that! Are you trying to poison the guests?", "I've seen better food in a bilge. Take it back where you found it."],
    },
    levelUp: [
      "You again! Grab a spoon. Taste this. Needs salt? It always needs salt.",
      "You've got a stool in my galley now, sailor. Nobody gets a stool. Ask Elsie.",
      "Sit. Not on the flour. I'll tell you about the ship days, the real ones, not the version for guests.",
      "You're crew now. Proper crew. On my ship, crew eats first and nobody argues with the cook.",
    ],
    idle: ["Who moved my good ladle?!", "*sniffs the pot and nods*", "On the ship we'd have called this calm.", "Pepper. Need pepper. Always need pepper."],
    topics: [
      { label: "Your ship days", text: "\"Twenty years as a ship's cook. Fed sixty sailors in a gale with one pot and a burned thumb. If you can make soup in a storm, you can make anything anywhere.\"" },
      { label: "Your secret ingredient", text: "\"Shouting. Honestly. The stew knows when you mean it. And a pinch of smoked salt. Mostly shouting.\"" },
      { label: "Why did you leave the sea?", text: "\"My knees left first. The rest of me followed. Elsie offered me her kitchen and a window that faces the water. Best trade I ever made.\"" },
    ],
    cold: ["Kitchen's closed. For you, it's closed, {player}.", "I'll feed you because I feed everyone. Don't mistake it for anything else."],
    warm: ["Galley's empty. Sit. Eat. Crew is crew, even when crew does something stupid, {player}.", "I've cooked for pirates. Good men and bad. You still eat first on my ship."],
    keepsake: { item: "minecraft:pumpkin_pie", amount: 2, name: "Bea's Galley Pie", lore: ["Too much nutmeg.", "Exactly enough nutmeg."], line: "Two pies. Galley recipe. Eat them warm or I'll know. I always know." },
    birthday: 41,
    letter: { subject: "Galley. Now.", body: "Sailor {player}!\n\nThere's a recipe I haven't cooked in twenty years. Not since the ship. I want to cook it again and I need a second pair of hands. Clean ones.\n\nCome to the kitchen. Wear an apron. Don't touch the good ladle.\n\n- Bea" },
    gossip: {
      champion: [["{name} cut down {place} like a side of beef! I'm making a victory stew.", "You cut down {place}! Victory stew tonight, sailor, and you're eating first!"]],
      act: [["{name} is up to their elbows in trouble. I've packed them a lunch. They never eat it.", "You're always up to your elbows in trouble, {player}. Eat something, at least!"]],
      blood_moon: [["{name} stood a Blood Moon watch! Reminds me of a night off the Serpent Rocks. Worse soup, though.", "A whole Blood Moon, sailor! You look like a dropped pie. Sit, eat."]],
    },
  },
};

/**
 * Generic gossip templates by `realm:gossip` kind: each a pair, about someone else and about the player
 * themselves. `other` is used for a kind not listed here. Townsfolk add their own voiced lines from `HEARTH`.
 * @type {Record<string, GossipPair[]>}
 */
export const GOSSIP = {
  champion: [
    ["Word is {name} brought down {place}. The whole town's talking.", "Everyone's talking about you and {place}, {player}. Well done."],
    ["{name} beat {place}, they say. I'd want to see the scars.", "They say you beat {place}. Let's see the scars, then."],
  ],
  fish_legendary: [
    ["{name} landed a legendary {place}! Tobin is pretending not to be jealous.", "A legendary {place}, {player}! Tobin is pretending not to be jealous."],
    ["Did you hear? {name} caught a {place}. A real legend.", "You caught a {place}? A real legend. I'd have it mounted."],
  ],
  expedition: [
    ["{name} came back from {place} on Nightmare {n}. Alive, which is the impressive part.", "Nightmare {n} in {place}, and you walked out. Sit down before you fall down, {player}."],
    ["They say {name} cleared {place}, Nightmare {n}. People are betting on what's next.", "Nightmare {n}! People are betting on what you'll clear next, {player}."],
  ],
  act: [
    ["{name} finished something big. {place}, they're calling it. The town feels different.", "You finished {place}, {player}. The town feels different. Lighter, maybe."],
    ["Have you heard about {name}? The whole of {place}, start to finish.", "All of {place}, start to finish. You should be proud, {player}."],
  ],
  guild_master: [
    ["{name} made Master in the {place}. Mind your manners around them.", "Master in the {place}! Should I bow? I'm going to bow."],
    ["The {place} has a new Master: {name}. About time.", "The {place} made you a Master, {player}. About time."],
  ],
  town_project: [
    ["{name} did the most for the {place}. The town owes them a drink.", "You did the most for the {place}, {player}. The town owes you a drink."],
    ["Have you seen the new {place}? {name} carried half the stone themselves.", "The new {place}! People say you carried half the stone yourself."],
  ],
  blood_moon: [
    ["{name} stayed out all through the Blood Moon. Some people.", "You stayed out all through the Blood Moon? Some people, {player}."],
    ["A red moon, and {name} came through it. The wardens took notes.", "You came through the red moon. The wardens took notes, {player}."],
  ],
  meteor: [
    ["{name} found where the falling star came down. Still warm, they say.", "You found the falling star! Was it still warm, {player}?"],
    ["The meteor? {name} got there first. Of course they did.", "You got to the meteor first. Of course you did, {player}."],
  ],
  wander_chain: [
    ["{name} helped a whole string of travelers on the road. The roads feel safer.", "Travelers keep talking about you, {player}. Kind words, mostly."],
    ["The wanderers have a name they keep saying: {name}.", "The wanderers keep saying your name, {player}. In a good way."],
  ],
  siege: [
    ["{name} stood at the circles when the Choir came. The bells went quiet.", "You stood at the circles when the Choir came, {player}. Thank you."],
    ["When the Choir sang at {place}, {name} was there to stop them.", "You stopped the Choir at {place}. The whole town heard the bells go quiet."],
  ],
  siege_lost: [
    ["The Choir finished their song at {place}. {name} fought them all night, they say. Nobody's sleeping well.", "You fought the Choir at {place}, {player}. They finished their song anyway. It isn't your fault."],
    ["{place} is shaken. The Choir sang until morning. {name} was out there with the rest.", "Rest, {player}. The Choir sang at {place} until morning, but you were out there. People saw."],
  ],
  regatta: [
    ["{name} won the Midsummer Regatta! {place}, and barely wet.", "The regatta's yours, {player}! {place}. Tobin is pretending he isn't impressed."],
    ["Did you see {name} on the water? Won the regatta in {place}.", "{place}, {player}! The fastest boat on the water this summer."],
  ],
  carve_off: [
    ["{name}'s pumpkin won the carve-off. {n} votes. The face on it, though!", "Your pumpkin won the carve-off, {player}! {n} votes. Bram wants it for the town hall."],
    ["The best pumpkin at the Lantern Fair? {name}'s. Everyone says so. Well, {n} people do.", "{n} votes for your pumpkin, {player}! The best face at the Lantern Fair."],
  ],
  atlas: [
    ["{name} has been out past every road. '{place}', people call them now.", "'{place}', they're calling you now, {player}. Mara wants to see your notes."],
    ["Mara says {name} has walked more of the realm than Fenn ever did. '{place}', she calls them.", "Mara says you've walked more of the realm than Fenn ever did, {player}. '{place}'. It suits you."],
  ],
  atlas_site: [
    ["{name} fought off a whole crowd at a {place} out in the wilds. Alone, they say.", "A {place}, out in the wilds? Alone? You'll give Reyes gray hairs, {player}."],
    ["They say {name} held a {place} against all comers.", "You held a {place} against all comers? Sit down. Eat something, {player}."],
  ],
  calling: [
    ["{name} took up a Calling: a {place}, like the settlers. The old ways are coming back.", "A {place}, {player}! Like the first settlers. It suits you."],
    ["Have you heard? {name} is a {place} now. The chapel book has a new name in it.", "The chapel book has your name in it now. A {place}. Well done, {player}."],
  ],
  relic_starlit: [
    ["{name}'s {place} is Starlit. Ida hasn't stopped smiling. Ida doesn't smile.", "Your {place} is Starlit, {player}! Ida hasn't stopped smiling. That's new."],
    ["They say {name}'s {place} glows gold now. Ida worked it for days.", "A Starlit {place}! Gold right through. Let me see it, {player}."],
  ],
  goal: [
    ["The town reached its goal, '{place}', and {name} gave more than anyone. Bram wants a plaque.", "You gave the most to '{place}', {player}. Bram wants a plaque. With your name spelled right, this time."],
    ["'{place}' is done! Everybody chipped in, and {name} chipped in the most.", "'{place}' is done, and you chipped in more than anyone, {player}. Thank you."],
  ],
  milestone: [
    ["{name} made {place}. Nobody even knew that was a thing you could be.", "{place}, {player}! I didn't know that was a thing you could be. It suits you."],
    ["Have you heard? {name} is {place} now. People keep count of these things.", "{place}! People keep count of these things, {player}. I do, anyway."],
  ],
  bounty: [
    ["{name} claimed the bounty on {place}. Reyes paid out without even grumbling.", "The bounty on {place} is yours, {player}. Reyes paid without grumbling. Mark the day."],
    ["The board's one name shorter: {name} brought in {place}.", "You brought in {place}! The bounty board's one name shorter, {player}."],
  ],
  treasure: [
    ["{name} dug up a buried chest, they say. Mara swears the map was one of hers.", "You found the treasure! Mara swears it was one of her maps, {player}."],
    ["Treasure! {name} followed a map all the way to the X. People will be digging holes for weeks.", "You followed the map all the way to the X, {player}. Now everyone wants one."],
  ],
  tornado: [
    ["{name} got picked up by the tornado and came down laughing. Laughing!", "You rode the tornado, {player}? And you came down laughing? Sit down."],
    ["Did you see? The twister threw {name} over the treetops. Not a scratch.", "Over the treetops, {player}! Not a scratch on you. I'd have screamed."],
  ],
  storm_haul: [
    ["{name} pulled {n} Storm Glass off a lightning rod. Ida's already asking for it.", "{n} Storm Glass from one rod, {player}! Ida will want a look."],
    ["They say {name} waits out every storm by a lightning rod. {n} Storm Glass, last time.", "{n} Storm Glass! Waiting out the storm by a rod paid off, {player}."],
  ],
  caravan: [
    ["A merchant caravan pulled in at {place}. Bring Crowns, and hold on to them.", "A merchant caravan pulled in at {place}. Bring Crowns, and hold on to them."],
    ["The caravan's here, at {place}! Llamas everywhere. Wren has named three already.", "The caravan's here, at {place}! Llamas everywhere. Wren has named three already."],
  ],
  // Town news about nobody in particular, for a kind not listed here.
  news: [
    ["Something's going on in town. Everyone's talking about it.", "Something's going on in town. Everyone's talking about it."],
  ],
  other: [
    ["{name} has been busy. Everyone's talking about it.", "Everyone's talking about you, {player}. Good things, I think."],
    ["Have you heard the news about {name}? The town hasn't stopped talking.", "The town hasn't stopped talking about you, {player}."],
  ],
};

/**
 * Greetings keyed by Story Questlines flags (`realm:npc_flags`): when every `when` key matches, the townsfolk
 * named in `lines` may greet the player with that line instead. Values as in the stories: exact, `!x`, `>=n`.
 * `fin:<story>` is "1" once that story is finished.
 * @type {{ when: Record<string, string>, lines: Record<string, string> }[]}
 */
export const REACTIONS = [
  {
    when: { "fin:drowned_bell": "1" },
    lines: {
      tobin: "The bell's quiet now, one way or another. I sleep better. Thanks to you.",
      elsie: "You went out to that bell for Tobin. He won't say it. I will: thank you.",
      moss: "You stirred the water out past the point. The dead out there are still deciding how they feel.",
    },
  },
  {
    when: { "drowned_bell.bell": "ring" },
    lines: {
      tobin: "Hear her ringing out there? Some nights I go down to the dock just to listen.",
      sol: "The bell rings under the water and the stars lean closer to hear it. Did you know that?",
      hollis: "The bell rang again last night. I counted every stroke. It sounded almost... kind.",
    },
  },
  {
    when: { "drowned_bell.bell": "silence" },
    lines: {
      tobin: "No more bell. Good. Some sounds should stay drowned.",
      hollis: "It's so quiet without the bell. I'm grateful. I think I'm grateful.",
      wren: "The ducks are so much calmer since the bell stopped! Did you do that? You did that!",
    },
  },
  {
    when: { "fin:last_map": "1" },
    lines: {
      mara: "Fenn's last map, finished. I put it in a frame. I look at it every morning.",
      bram: "Mara tells me you finished Fenn's map. My father knew Fenn. He... never spoke of him.",
      sol: "Three pins in a line, Mara said. Lines in the sky mean something. Lines on the ground too.",
    },
  },
  {
    when: { "act1_signs.act1:path": "report" },
    lines: {
      reyes: "You reported in, before Act One got ugly. I don't forget the ones who report in.",
      bram: "You came to the council first. Proper procedure! I nearly wept.",
    },
  },
  {
    when: { "act1_signs.act1:path": "alone" },
    lines: {
      reyes: "You went alone, back then. Next time, report. That's an order. Mostly.",
      quill: "You went off alone, I hear. Never trust a committee. Wise.",
    },
  },
  {
    when: { "fin:act1_signs": "1" },
    lines: {
      sol: "The signs in the sky, read at last. You read them with me. I won't forget it.",
      mara: "The sky's on my maps now. Sol made me add it. I blame you.",
      elsie: "You've been looking up a lot lately, love. Don't forget to look where you're walking.",
      wren: "Sol says the stars are being weird. Are they being weird? You'd know!",
    },
  },
  {
    when: { "fin:act2_choir": "1" },
    lines: {
      reyes: "The Gray Ring is ash. You did that. The wardens owe you.",
      hollis: "The singing stopped when the Ring burned. I slept a whole night, the first in a year.",
      moss: "Fewer gray hoods sneaking through my yard. The dead are relieved. So am I.",
      bea: "Choir's broken! That calls for pie. Everything calls for pie, but this calls loudly.",
    },
  },
  {
    when: { "g:quill": "trusted" },
    lines: {
      quill: "You trusted me when nobody should have. I keep a ledger of that too. It's a short one.",
      reyes: "You vouched for Quill. I'm watching him. I'm watching you watching him.",
      bea: "Quill brought me saffron and didn't charge. Whatever you said to him, keep saying it.",
      elsie: "Quill smiles differently since you trusted him. Less like a fox. More like a boy.",
    },
  },
  {
    when: { "g:quill": "exposed" },
    lines: {
      quill: "You turned me in. Fair. I'd have done the same. I'm still angry. Buy something.",
      reyes: "Quill's on parole by day, in the cells by night. You did the right thing. I hate that it hurt.",
      bram: "Exposing Quill was... necessary. I've never filed paperwork so sad.",
      wren: "Quill gave me a sugar cube for Biscuit through the bars. Is that allowed? I think it's allowed.",
    },
  },
  {
    when: { "g:hollis": "saved" },
    lines: {
      hollis: "I'm still here. Because of you. I say it to the candles every night, so I don't forget.",
      moss: "Hollis came round for tea. Brought biscuits. Living people bringing biscuits. You did good.",
      elsie: "Hollis is sleeping again. Ate two bowls of stew. Whatever you did, love, bless you for it.",
      wren: "Brother Hollis helped me name the new lamb! He's way less sad now. I named it Hollis.",
    },
  },
  {
    when: { "g:hollis": "lost" },
    lines: {
      moss: "There's a candle in the chapel nobody lights now. I light it. Someone should.",
      elsie: "I keep setting a bowl for Hollis. Then I remember. Then I set it anyway.",
      reyes: "We lost Hollis. I keep checking the chapel on patrol. Old habit. New ache.",
      wren: "I put flowers on the chapel steps every morning. For Brother Hollis. He liked the yellow ones.",
    },
  },
  {
    when: { "act3_deep.elsie": "forgive" },
    lines: {
      elsie: "You forgave me. I'd forgotten how that feels, after so long. Thank you, dear heart.",
      bea: "Elsie's been singing in the kitchen again. Old songs. Whatever you said to her, sailor, it took.",
      wren: "Elsie hugged me for no reason this morning. Like, a long one. Did you do something?",
    },
  },
  {
    when: { "act3_deep.elsie": "condemn" },
    lines: {
      elsie: "I understand why you said what you said. I've said worse to myself, for longer.",
      bea: "Elsie's been quiet since you two talked. Too quiet. Fix it, sailor.",
    },
  },
  {
    when: { "act3_deep.keys": "miners" },
    lines: {
      ida: "My miners carried the keys. You chose us. Good choice.",
    },
  },
  {
    when: { "act3_deep.keys": "wayfarers" },
    lines: {
      sol: "My wayfarers carried the keys by starlight. You chose well. The sky agrees.",
    },
  },
  {
    when: { "fin:act3_deep": "1" },
    lines: {
      ida: "You came back from the deep. Not everyone does. Good.",
      mara: "I've mapped down to the deepslate now. There's a blank spot where you went. I'm leaving it blank.",
      hollis: "You went down to where the listening is. I'm so glad you're back up here, in the light.",
    },
  },
  {
    when: { "act4_seals.act4:promise": "allow" },
    lines: {
      elsie: "You'd let me go, if it came to it. That's the kindest cruel thing anyone's said to me.",
      wren: "Elsie said something about promises and then she went quiet. Are you two okay?",
    },
  },
  {
    when: { "act4_seals.act4:promise": "refuse" },
    lines: {
      elsie: "You wouldn't let me give myself. Stubborn. Thank you. I mean that.",
      bea: "You told Elsie no. Good. Somebody had to, and she'd never take it from me.",
    },
  },
  {
    when: { "fin:act4_seals": "1" },
    lines: {
      sol: "The three seals shine like a little triangle of stars when I look east. You lit that.",
      reyes: "Three seals, relit. I've added you to the watch roster. Honorary. Don't let it go to your head.",
      tobin: "The water's calmer since the seals. Even the gulls noticed.",
    },
  },
  {
    when: { "mayors_burden.plaque": "goat" },
    lines: {
      bram: "The goat plaque has become a tourist attraction. I'm told this is a good thing.",
      wren: "There's a plaque for a GOAT now. Grumbles walks past it every day. He's so proud.",
    },
  },
  {
    when: { "mayors_burden.plaque": "lost" },
    lines: {
      bram: "The plaque for the lost. I read the names every morning. My father never did. I do.",
      moss: "Bram put up a plaque for the forgotten ones. First mayor who ever came to my yard on purpose.",
    },
  },
  {
    when: { "hollis_faith.forgive": "mercy" },
    lines: {
      hollis: "You told me to forgive myself. I'm trying. The candles help. You help more.",
    },
  },
  {
    when: { "wardens_oath.oath": "shield" },
    lines: {
      reyes: "You swore on the shield. Protect first. That's the oath I took too.",
    },
  },
  {
    when: { "wardens_oath.oath": "sword" },
    lines: {
      reyes: "You swore on the sword. Fair. Somebody has to be the sharp end.",
    },
  },
  {
    when: { "singing_forge.blade": "hal" },
    lines: {
      ida: "The blade sings Hal's song. Tobin cried when he heard it. Don't tell him I told you.",
      tobin: "That blade of yours. I hear Hal in it. Keep it sharp.",
    },
  },
  {
    when: { "smugglers_run.profits": "return" },
    lines: {
      quill: "You gave the profits back. Who does that? I've been thinking about it for days.",
      bram: "Someone returned the smuggled goods to the town fund! Anonymously! It was you, wasn't it?",
    },
  },
  {
    when: { "smugglers_run.profits": "keep" },
    lines: {
      quill: "You kept the profits. A woman after my own heart. Or a man. A person after my own heart.",
    },
  },
  {
    when: { "hearth_and_table.marty": "hired" },
    lines: {
      bea: "Marty's chopping onions in my galley now. Crying the whole time. Good lad.",
    },
  },
  {
    when: { "graveyard_shift.stone": "carved" },
    lines: {
      moss: "The new stone you had carved. People stop and read it. That's all a stone wants.",
    },
  },
  {
    when: { "g:vesna": "free" },
    lines: {
      moss: "Vesna came by the yard last week. Brought me a toad. I think that's a compliment, from her.",
      sol: "Vesna hums the old star songs now, out in the fen. I can hear her on still nights.",
    },
  },
  {
    when: { "g:vesna": "bound" },
    lines: {
      moss: "The witch is bound in her fen. Quiet out there. Too quiet, some nights.",
    },
  },
  {
    when: { "g:allies": ">=3" },
    lines: {
      reyes: "Half the realm came when you called on Lantern Night. That's not luck. That's you.",
      bram: "The allies you gathered! I've proposed a festival in their honor. Annual. Possibly biannual.",
    },
  },
  {
    when: { "fin:act5_lantern": "1", "g:ending": "!crown" },
    lines: {
      quill: "Lantern Night's over and I sold out of candles. Best night of business in forty years. Also, thank you.",
      ida: "Lantern Night. You held. The forge rang all night. Good sound.",
      elsie: "We're still here, love. All of us who could be. Sit down. You've earned a long sit.",
    },
  },
  {
    when: { "g:mercy": ">=5" },
    lines: {
      hollis: "You choose mercy so often. People notice. I notice. It gives me hope.",
      elsie: "You've a soft heart under all that armor, love. Keep it soft. The world needs some.",
      wren: "You're always nice to everybody, even the bad guys sometimes. Biscuit says that's brave.",
      tobin: "You let people off the hook. Hal did that. Drove me mad. Made him the better man.",
      ida: "You spare things. Good. Anyone can break. Takes skill to mend.",
    },
  },
  {
    when: { "g:iron": ">=5" },
    lines: {
      reyes: "You make the hard calls. Somebody has to. Don't let them harden you all the way through.",
      quill: "You've an iron streak, {player}. Good for business. Bad for sleep, I'd guess.",
      moss: "You send a lot of folk my way. I'm not complaining. Just keeping count.",
      bram: "Firm decisions! Decisive! I admire it. It also frightens me a little.",
      ida: "Hard choices. Hard steel. Brittle, if you're not careful.",
    },
  },
  {
    when: { "fin:one_that_got_away": "1" },
    lines: {
      tobin: "Old Gnasher. Six hundred and two times I've told it now, and every one of them true.",
      elsie: "Tobin tells the Gnasher story with you in it now. It's very long. I love it.",
      bea: "I still have the stinkbait bucket. Nobody will touch it. It's a monument now.",
    },
  },
  {
    when: { "fin:hatchlings": "1" },
    lines: {
      tobin: "Saw a little turtle on the beach this morning. One of ours, maybe. Gave it a nod.",
      wren: "The turtles! I check on the beach every day. I named all of them. Every single one.",
    },
  },
  {
    when: { "fin:lost_lambs": "1" },
    lines: {
      wren: "All my lambs came home because of you. I made you a flower crown. It got eaten. Sorry.",
      elsie: "Wren talks about you and those lambs every night at supper. Every. Night.",
    },
  },
  {
    when: { "lost_lambs.cat": "biscuit" },
    lines: {
      sol: "Wren's cat Biscuit climbs up to sleep on my star charts. All of them. She has excellent taste in constellations.",
      wren: "Biscuit the cat and Biscuit the cow met! They're best friends now. Mostly the cow is scared.",
    },
  },
  {
    when: { "lost_lambs.cat": "pounce" },
    lines: {
      sol: "Wren's Sir Pounce has taken to guarding my telescope. From what, I don't know. He's very serious about it.",
      wren: "Sir Pounce knighted a mouse yesterday. I think. He sat on it for a while and then let it go.",
    },
  },
  {
    when: { "lost_lambs.cat": "moonpie" },
    lines: {
      sol: "Wren's Moonpie sits on my sill every night, watching the moon. Adela would have adored her.",
      wren: "Moonpie! Moonpie is the best name! I still cry about it a little. Happy crying.",
    },
  },
  {
    when: { "inn_ghost.lily": "told" },
    lines: {
      elsie: "Lily rests now. You told her the truth, and she went gently. I keep a candle for her in room nine.",
      moss: "The little ghost at the inn has gone quiet. Peaceful quiet. The good kind.",
    },
  },
  {
    when: { "inn_ghost.lily": "waiting" },
    lines: {
      elsie: "Lily still waits in room nine, some nights. I sing to her. She likes the old songs.",
      wren: "Something giggles in room nine when I clean it. Elsie says it's a friend. I say hi to it.",
    },
  },
  {
    when: { "fin:edges_of_map": "1" },
    lines: {
      mara: "The edges of the map are inked now, thanks to you. I'm almost sad. Almost. Then I find a new edge.",
      bram: "Mara sent me a map of the whole realm. It's enormous. I had a wall knocked through to hang it.",
    },
  },
  {
    when: { "edges_of_map.wonder": "charted" },
    lines: {
      mara: "That sky wonder we charted? I drew it in the corner of every map since. My signature now.",
    },
  },
  {
    when: { "fin:singing_forge": "1" },
    lines: {
      ida: "The forge still sings, some nights. Low. Like it's remembering. You did that.",
      quill: "Ida's singing forge has customers lined up for a month. I'm taking a cut of the queue. Somehow.",
    },
  },
  {
    when: { "fin:smugglers_run": "1" },
    lines: {
      quill: "My smuggling days are behind me. Mostly. The tunnel is a wine cellar now. Officially.",
      reyes: "The cove's quiet since your run with Quill. Suspiciously quiet. I check it weekly.",
    },
  },
  {
    when: { "fin:hearth_and_table": "1" },
    lines: {
      bea: "That feast we cooked. People still stop me in the street about the cake. THE CAKE, sailor.",
      elsie: "Bea's menu has your name on a dish now. She won't tell me which. I suspect the spicy one.",
    },
  },
  {
    when: { "fin:listening_deep": "1" },
    lines: {
      ida: "The deep is quiet now. You listened back. Few do.",
      mara: "I can't map the Listening Deep. It moves. You came back from it anyway. Show-off.",
    },
  },
  {
    when: { "g:fen": "called" },
    lines: {
      moss: "You called the witch with my soul lantern. She came. I'm still a little proud.",
    },
  },
  {
    when: { "fin:graveyard_shift": "1" },
    lines: {
      moss: "The yard's been calm since our graveyard shift. Mostly. Mrs. Abernathy sends her regards.",
      reyes: "The graveyard patrol is the easiest on the roster now. Moss says it's because of you.",
    },
  },
  {
    when: { "fin:mayors_burden": "1" },
    lines: {
      bram: "I told the town the truth about my father. Out loud. In the square. I'm still shaking, a little.",
      mara: "Bram's been different since you helped him. Taller. He isn't. He just stands that way.",
    },
  },
  {
    when: { "fin:hollis_faith": "1", "g:hollis": "saved" },
    lines: {
      hollis: "The lamp in the window still burns. I light it for everyone who's lost. And for you, who found me.",
    },
  },
  {
    when: { "fin:act2_choir": "1", "g:quill": "!exposed" },
    lines: {
      quill: "The Choir's finished. Some of my best customers wore gray hoods. Shame. They paid in advance.",
    },
  },
  {
    when: { "fin:act1_signs": "1" },
    lines: {
      ida: "Sol says the sky is wrong. The shards say so too. They hum louder.",
      tobin: "Sol keeps pointing east. I keep looking. Can't see a thing. Don't tell him.",
    },
  },
  {
    when: { "g:ending": "relight" },
    lines: {
      sol: "The Lantern burns again. Forty years of quiet sky. You gave us that.",
      tobin: "Heard Ashgrave was sorry, at the end. Hal would have forgiven him. I'm trying.",
      mara: "I redrew the whole coast after Lantern Night. It looks exactly the same. That's the point.",
      hollis: "No dreams last night. None. Just sleep. I'd forgotten what plain sleep was like.",
      bea: "Lantern Night's done and the town's still here! I'm cooking for a week straight.",
      wren: "We're safe! Sol says forty whole years! I'll be fifty-two! That's so old!",
      reyes: "The town held. You held it. Stand down, {player}. For a little while.",
      bram: "I gave a speech about you. Forty minutes. The town stood for all of it. Well. Most of it.",
    },
  },
  {
    when: { "g:ending": "gift" },
    lines: {
      bea: "The kitchen's too quiet without Elsie humming. I hum for her now. Badly.",
      wren: "I'm running the inn now. Elsie left me the keys and a note. I read it every morning.",
      sol: "There's a new star over the Sky Seal. A warm one. I know whose it is.",
      tobin: "Elsie's up there now. I wave at the sky some nights. Feel daft. Do it anyway.",
      moss: "No grave for Elsie. Nothing to bury. I put a stone up anyway. She'd laugh at me.",
      hollis: "A thousand years of quiet. She gave us that. I pray to her now, I think. Is that allowed?",
      reyes: "Elsie's watch now. Forever. I salute the sky at the end of every shift.",
    },
  },
];
