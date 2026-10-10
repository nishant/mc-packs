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
  /** Townsfolk turn to face players, say idle lines and go home at night. Taps and the menu work either way. */
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

  /** Townsfolk with a home (`/realm:npc_home`) go there at night and back to their post at dawn. */
  nightRoutine: true,

  /** Night for the routine: from this time of day (ticks, 13000 = dusk)... */
  nightStart: 13000,

  /** ...to this one (23000 = just before sunrise). */
  nightEnd: 23000,

  /** How far `/realm:npc_remove` looks for a townsfolk NPC, in blocks. */
  removeRange: 5,

  /**
   * A missing NPC is spawned again at its post (or home at night) once a player has been within this many
   * blocks of that spot for a few seconds and the NPC still isn't there.
   */
  respawnRange: 24,

  /**
   * The townsfolk operators can place with `/realm:npc_add <id>`. Keep the ids: other packs and saved data use them.
   * @type {Townsfolk[]}
   */
  townsfolk: [
    {
      id: "mara",
      name: "Mara",
      title: "the Cartographer",
      roles: ["cartographer"],
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
      roles: ["innkeeper"],
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
      roles: ["merchant"],
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
      roles: ["skymage"],
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
  ],
};
