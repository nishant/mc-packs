// Townsfolk: named NPCs that greet players, chat and send them to what the other packs offer.

/**
 * @typedef {object} Townsfolk
 * @property {string} id fixed id: saved data, the `realm:npc_id:<id>` tag and other packs use it
 * @property {string} name shown in yellow above the NPC and as the menu title ("Mara")
 * @property {string} title shown in gray after the name ("the Cartographer"); "" for none
 * @property {string[]} roles what other packs offer at this NPC (`merchant`, `questgiver`, ...)
 * @property {{ morning: string[], day: string[], evening: string[], night: string[], rain: string[], thunder: string[] }} greetings
 *   the menu's greeting, picked by time of day, or by the weather while it rains or storms; `{player}` is the player's name
 * @property {string[]} idle what the NPC says to itself now and then, in a speech bubble
 */

export const CONFIG = {
  /** Townsfolk turn to face players and say idle lines. They stay in their house either way, and taps and the menu work. */
  enabled: true,

  /** Townsfolk turn to face the nearest player within this many blocks. 0 = never turn. */
  faceRange: 8,

  /** An NPC says an idle line only while a player is within this many blocks. */
  idleRange: 12,

  /** Seconds between an NPC's idle lines: a random time from `idleMinSeconds` to `idleMaxSeconds`. */
  idleMinSeconds: 30,

  /** See `idleMinSeconds`. */
  idleMaxSeconds: 60,

  /** How long an idle line stays above the NPC, in seconds. */
  speechSeconds: 3,

  /** How far `/realm:npc_remove` looks for a townsfolk NPC, in blocks. */
  removeRange: 5,

  /** `/realm:npc_houses`: houses (doors) are looked for within this many blocks of the operator (16 to 64). */
  housesRadius: 48,

  /**
   * A missing NPC is spawned again at its post (inside its house) once a player has been within this many
   * blocks of that spot for a few seconds and the NPC still isn't there.
   */
  respawnRange: 24,

  /**
   * Hearth & Hearsay: each townsfolk remembers each player (affinity from talks, gifts, favors and stories),
   * with discounts, heart stories, titles and keepsakes as it grows, and townsfolk pass on gossip. Disabled:
   * nothing is gained or lost and nobody gossips; what players have earned stays.
   */
  affinity: true,

  /** Affinity points for the first talk with each townsfolk every real (UTC) day. */
  talkPoints: 5,

  /** Affinity points for a gift, by how much that townsfolk likes it (one gift per townsfolk per real day). */
  giftPoints: { loved: 40, liked: 20, neutral: 5, disliked: -15 },

  /** Affinity points when you finish that townsfolk's daily favor (Story Questlines). */
  favorPoints: 15,

  /** Affinity points when you finish a story chapter that townsfolk gives or ends (Story Questlines). */
  chapterPoints: 20,

  /** Points where each level starts: Acquaintance, Friend, Close, Confidant (Stranger is 0). Points stop at 1000. */
  levels: [100, 250, 500, 900],

  /** Percent off at a Friend's shop (Quill's market, Bea's recipes, Elsie's beds, Mara's maps, Ida's forge; Tobin pays this much more). */
  friendDiscount: 10,

  /** Hollow-Crowned players (the dark ending) gain this share of affinity points below Friend. */
  crownedGain: 0.75,

  /** Extra percent off Quill gives a Hollow-Crowned player, at any level. */
  crownedQuillBonus: 5,

  /** Real days between two keepsakes from a townsfolk you are a Confidant of. */
  keepsakeDays: 7,

  /** Townsfolk write you a letter (Realm Mail) when you become Close. */
  letters: true,

  /** Chance, in percent, that a tap's greeting is gossip you haven't heard yet. 0 = no gossip. */
  gossipChance: 25,

  /** Gossip is forgotten after this many hours. */
  gossipHours: 48,

  /** Most pieces of gossip the town remembers at once; the oldest go first. */
  gossipMax: 24,

  /**
   * The townsfolk operators can place with `/realm:npc_add <id>`. Keep the ids: other packs and saved data use them.
   * @type {Townsfolk[]}
   */
  townsfolk: [
    {
      id: "mara",
      name: "Mara",
      title: "the Cartographer",
      roles: ["cartographer", "questgiver"],
      greetings: {
        morning: ["Morning, {player}! The light's perfect for surveying.", "Up early? Good. Maps are best drawn before the fog lifts."],
        day: ["Ah, {player}. Seen anything worth putting on a map?", "Every hill out there wants a name. Got any ideas?"],
        evening: ["The sun's going down. Mind the edges of the map, {player}.", "Evening! I'm inking today's coastlines."],
        night: ["Out after dark, {player}? Stay on the roads.", "Can't sleep either? I'm counting unmapped chunks."],
        rain: ["Rain smudges the ink, {player}. Come in under the awning.", "Wet day. Good for drawing rivers, at least."],
        thunder: ["Lightning! Keep away from the high ground, {player}.", "Storms like this move the coastlines, I swear."],
      },
      idle: ["North is up. Usually.", "Where did I leave my compass?", "That ridge isn't on any map yet.", "Hmm, this river bends the wrong way."],
    },
    {
      id: "tobin",
      name: "Old Tobin",
      title: "the Fisherman",
      roles: ["fisher", "questgiver"],
      greetings: {
        morning: ["Morning, {player}. Fish bite best at sunrise, mark my words.", "Early tide, early catch. Sit a while."],
        day: ["Afternoon, {player}. Water's calm today.", "Got a line in the water? No? Shame."],
        evening: ["Evening, {player}. The big ones come up at dusk.", "Sun's low. Perfect time for salmon."],
        night: ["Night fishing, {player}? Watch for drowned.", "Can't see the float, but I can feel the tug."],
        rain: ["Rain's good for fishing, {player}. Everything's hungry.", "Wet? I've been wetter. Fish don't mind."],
        thunder: ["Get away from the water, {player}! Lightning loves a fishing rod.", "Storm Eels come out in weather like this. Nasty things."],
      },
      idle: ["Back in my day the cod were THIS big.", "*mends a net*", "Smells like rain coming.", "One more cast. Just one."],
    },
    {
      id: "reyes",
      name: "Warden Reyes",
      title: "",
      roles: ["warden", "guildmaster", "questgiver"],
      greetings: {
        morning: ["At ease, {player}. Quiet night, for once.", "Morning. Report anything strange you saw out there."],
        day: ["{player}. Keep your blade sharp.", "The wardens always need good hands."],
        evening: ["Dusk, {player}. The monsters will be out soon.", "Light your paths before nightfall."],
        night: ["Stay inside the walls, {player}. That's an order. Mostly.", "I'm on watch. What do you need?"],
        rain: ["Rain hides footsteps, {player}. Stay alert.", "Keep your armor oiled in this weather."],
        thunder: ["Thunder like this brings out the worst things, {player}.", "Charged creepers in a storm. Keep your distance."],
      },
      idle: ["Hm. Too quiet.", "*checks the perimeter*", "Patrol at dusk. Again.", "Someone left a torch out. Good."],
    },
    {
      id: "elsie",
      name: "Elsie",
      title: "the Innkeeper",
      roles: ["innkeeper", "questgiver"],
      greetings: {
        morning: ["Good morning, {player}! There's bread still warm.", "Rise and shine! The kettle's on."],
        day: ["Welcome back, {player}! Need a place to rest your feet?", "The road treating you well?"],
        evening: ["Evening, {player}! Supper's nearly ready.", "Come in, come in, before the mobs come out."],
        night: ["Late arrival, {player}? There's always a bed here.", "Shh, folk are sleeping. What can I do for you?"],
        rain: ["Look at you, soaked through! Come dry off, {player}.", "Rainy days fill the inn. Lovely."],
        thunder: ["Get inside, {player}! It's wild out there.", "Hear that thunder? Best stay till it passes."],
      },
      idle: ["Who tracked mud in here?", "*hums a tune*", "Need more candles.", "The stew could use more carrots."],
    },
    {
      id: "bram",
      name: "Mayor Bram",
      title: "",
      roles: ["mayor", "questgiver"],
      greetings: {
        morning: ["Good morning, citizen {player}! A fine day for civic projects.", "Ah, {player}! Early, I see. Admirable."],
        day: ["{player}! The town grows thanks to folk like you.", "Busy day, busy day. What can the town do for you?"],
        evening: ["Evening, {player}. Another productive day for our town.", "The town hall closes soon, but for you, never."],
        night: ["Working late too, {player}? Running a town never sleeps.", "Ah, a night owl. The paperwork understands."],
        rain: ["Rain's good for the farms, {player}. Bad for my hat.", "We really should build more roofs."],
        thunder: ["Storms! Is everyone's house lightning-proof, {player}?", "Remind me to fund a lightning rod or two."],
      },
      idle: ["We need a bigger town hall.", "*shuffles papers*", "Taxes? No, no, contributions.", "A statue. Of me. Tasteful."],
    },
    {
      id: "quill",
      name: "Quill",
      title: "the Trader",
      roles: ["merchant", "questgiver"],
      greetings: {
        morning: ["Morning, {player}! Fresh stock, fair prices.", "Early bird gets the bargains!"],
        day: ["{player}! Buying or selling today?", "Crowns for wheat, crowns for iron. Let's trade."],
        evening: ["Evening, {player}. Closing soon, so let's make it quick.", "End-of-day deals, just for you."],
        night: ["Shop's technically closed, {player}. But for you?", "Shady hours, honest prices."],
        rain: ["Rain's bad for business, {player}. Buy something, cheer me up.", "Keep the goods dry!"],
        thunder: ["Storm Glass sells high on nights like this, {player}.", "Lightning out there? Bring me what it charges."],
      },
      idle: ["Buying! Selling! Mostly selling.", "*counts coins*", "Everything has a price.", "Diamonds, anyone? No? Wheat then."],
    },
    {
      id: "ida",
      name: "Ida",
      title: "the Relicsmith",
      roles: ["relicsmith", "questgiver"],
      greetings: {
        morning: ["Morning, {player}. The forge is warming up.", "Bring me shards, I'll bring you wonders."],
        day: ["{player}. Found any Relic Shards lately?", "The old things remember the storms that made them."],
        evening: ["Evening, {player}. The forge glows best at dusk.", "Careful, the anvil's still hot."],
        night: ["Up late, {player}? So are the relics. They hum at night.", "Can't sleep with all this humming."],
        rain: ["Rain cools the steel just right, {player}.", "Wet weather, sharp edges."],
        thunder: ["Hear that? The relics feel the storm, {player}.", "Lightning makes the best Storm Glass. Go on, catch some."],
      },
      idle: ["*taps the anvil*", "Eight shards. Always eight.", "This one's humming again.", "Where did this rune come from?"],
    },
    {
      id: "sol",
      name: "Sol",
      title: "the Sky-reader",
      roles: ["skymage", "questgiver"],
      greetings: {
        morning: ["The dawn sky speaks, {player}. Listen.", "Morning. The clouds are in a talkative mood."],
        day: ["Clear skies, {player}? For now.", "I read the wind. It says hello."],
        evening: ["Red sky tonight, {player}. A sailor's delight.", "Watch the horizon. The night is coming in."],
        night: ["Look up, {player}. The stars are moving.", "The moon tells stories, if you know how to read them."],
        rain: ["I said it would rain, {player}. Nobody listens.", "The clouds wept, as foretold."],
        thunder: ["The sky is angry, {player}! Magnificent, isn't it?", "Count between the flash and the boom. Closer now."],
      },
      idle: ["The wind turns west.", "*stares at the clouds*", "A storm in three days. Maybe two.", "That cloud looks like a creeper."],
    },
    {
      id: "hollis",
      name: "Brother Hollis",
      title: "the Chapel Keeper",
      roles: ["priest", "questgiver"],
      greetings: {
        morning: ["Good morning, {player}. Did you sleep? I... mostly did.", "The morning bell would be ringing now. If we had one. Peace to you, {player}."],
        day: ["Welcome, {player}. The chapel door is always open. Even when I wish it weren't.", "Oh! {player}. Forgive me, I was miles away."],
        evening: ["The candles are lit, {player}. All of them, this time.", "Evening, {player}. I like the hour before dark. It's honest."],
        night: ["You shouldn't be out so late, {player}. Neither should I.", "Can't sleep? Nor can I. The water is loud tonight."],
        rain: ["Come in out of the rain, {player}. The roof only leaks a little.", "Rain on the windows, {player}. It sounds almost like singing."],
        thunder: ["Thunder... the bell rang in thunder, they say. Stay close, {player}.", "Stay inside tonight, {player}. Please. Something listens in storms."],
      },
      idle: ["*trims a candle wick*", "Nothing lost, nothing... no. No.", "I should mend that pew.", "Did someone say my name?"],
    },
    {
      id: "moss",
      name: "Moss",
      title: "the Gravedigger",
      roles: ["gravedigger", "questgiver"],
      greetings: {
        morning: ["Morning, {player}. Everyone here's still where I left them. Good start.", "Up with the worms, {player}? Respect."],
        day: ["Afternoon, {player}. Dig a hole, fill a hole. Honest work.", "{player}! Living, breathing. My favorite kind of visitor."],
        evening: ["Evening, {player}. The quiet ones get chatty around now.", "Sun's going down. Mind the soft ground, {player}."],
        night: ["Lovely night for it, {player}. For what? Don't ask.", "Night shift, {player}. The dead don't keep office hours."],
        rain: ["Rain softens the dirt, {player}. Makes my job easier.", "Wet? The folks down there don't complain."],
        thunder: ["Thunder! Wakes the whole yard, {player}. Not literally. Usually.", "Storm's up, {player}. Stay off the graves, they get grumpy."],
      },
      idle: ["*leans on a shovel*", "Evening, Mrs. Abernathy. You're looking well preserved.", "Six feet. Always six feet.", "That headstone's crooked again."],
    },
    {
      id: "wren",
      name: "Wren",
      title: "the Stable Girl",
      roles: ["stablehand", "questgiver"],
      greetings: {
        morning: ["Morning {player}! Biscuit had her foal, well no, but she might, and the goats got out!", "Hi {player}! I fed everyone already, even the chickens, even Grumbles!"],
        day: ["{player}! Want to meet the new lamb? I named her Pudding!", "Hi hi {player}! Did you know cows have best friends? It's true!"],
        evening: ["Evening {player}! I have to put everyone to bed and they never listen.", "It's nearly dark, {player}, and Elsie says I have to come in, but the horses!"],
        night: ["I'm not supposed to be up, {player}. Don't tell Elsie. Okay?", "Shh, {player}, the foals are sleeping. They snore! Listen!"],
        rain: ["Rain! The ducks love it, {player}. The cats hate it.", "Help me get the sheep in, {player}! Wet wool smells awful!"],
        thunder: ["The horses are scared, {player}, I'm singing to them. Want to help?", "Thunder! I'm not scared. Pudding is. I'm holding her for her."],
      },
      idle: ["Who's a good horse? You are!", "*brushes a pony*", "I named that cloud Barnaby.", "Grumbles, come back here!"],
    },
    {
      id: "bea",
      name: "Bea",
      title: "the Cook",
      roles: ["chef", "questgiver"],
      greetings: {
        morning: ["Morning, {player}! Eggs are on, coffee's black, sit down!", "Up early? Good. Early birds get the crispy bacon, {player}."],
        day: ["{player}! You look like a stew that needs salt. Eat something!", "Lunch rush, {player}. Grab a spoon or get out of my galley!"],
        evening: ["Supper's simmering, {player}. Don't you dare be late.", "Evening, {player}. A good day ends with a full plate, that's the law."],
        night: ["Kitchen's closed, {player}. Mostly. There's pie. Don't tell Elsie.", "Midnight snack, {player}? I'm not judging. I'm joining."],
        rain: ["Rain means soup weather, {player}. Get in here!", "Wet as a dropped fish, {player}. Come dry off by the oven."],
        thunder: ["Storm's up! Just like my ship days, {player}. Hold onto your bowl!", "Thunder curdles the milk, {player}. Old sailor's truth."],
      },
      idle: ["Who ate the last tart?!", "*stirs a pot*", "Needs more pepper. Everything needs more pepper.", "Back on the ship we'd call this a feast."],
    },
  ],
};
