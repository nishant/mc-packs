// Who walks the roads: the eight Recurring Wanderers (the same ids and names as Story Questlines'
// stories/wanderers.js), the Strangers' name pools, and what everyone says when you walk up. Plain ASCII.

/**
 * @typedef {"miner" | "ghost" | "pilgrim" | "rival" | "hermit" | "storm" | "exile" | "traveler"} Archetype
 * @typedef {{ id: string, name: string, archetype: Archetype, entity: string }} Named `entity`: what stands at their camp and on the road
 */

/** @type {Named[]} */
export const NAMED = [
  { id: "pell", name: "Pell the Pilgrim", archetype: "pilgrim", entity: "minecraft:villager_v2" },
  { id: "anwen", name: "Anwen, the Surveyor's Ghost", archetype: "ghost", entity: "minecraft:allay" },
  { id: "brannoch", name: "Brannoch Deepdelve", archetype: "miner", entity: "minecraft:villager_v2" },
  { id: "rook", name: "Rook the Rival", archetype: "rival", entity: "minecraft:villager_v2" },
  { id: "marigold", name: "Marigold of the Heights", archetype: "hermit", entity: "minecraft:villager_v2" },
  { id: "tamsin", name: "Tamsin Galeward", archetype: "storm", entity: "minecraft:villager_v2" },
  { id: "vesk", name: "Vesk the Exile", archetype: "exile", entity: "minecraft:villager_v2" },
  { id: "hob", name: "Hob Fairweather", archetype: "traveler", entity: "minecraft:villager_v2" },
];

/**
 * The villager look (profession) of each kind, as the vanilla `villager_v2` event that sets it; the biome sets the
 * clothes. Strangers who are travelers are wandering traders instead, ghosts allays, and a drowned sailor in
 * disguise is a fisherman whatever the kind. @type {Record<Archetype, string>}
 */
export const LOOKS = {
  pilgrim: "minecraft:become_cleric",
  miner: "minecraft:become_armorer",
  hermit: "minecraft:become_sheperd", // sic: the vanilla event's spelling
  storm: "minecraft:become_cartographer",
  exile: "minecraft:become_leatherworker",
  rival: "minecraft:become_weaponsmith",
  traveler: "minecraft:become_toolsmith", // Hob the tinker
  ghost: "",
};
export const SAILOR_LOOK = "minecraft:become_fisherman";

/** 40 first names for Strangers. */
export const FIRST_NAMES = [
  "Ada", "Bram", "Cora", "Dell", "Edda", "Finn", "Greta", "Hale", "Iris", "Jory",
  "Kit", "Lark", "Maud", "Ned", "Odo", "Pip", "Quinn", "Rhosyn", "Saul", "Tilda",
  "Ulric", "Vera", "Wil", "Xander", "Yara", "Zeb", "Alder", "Bryn", "Cass", "Dunstan",
  "Elowen", "Fenwick", "Gwen", "Hester", "Ivo", "Juno", "Kester", "Linnet", "Morwen", "Orrin",
];

/** 20 epithets; each archetype draws from its own few (and the road's). */
export const EPITHETS = [
  "the Footsore", "of the Long Road", "Dustcloak", "the Lantern-Bearer", "Mudboots",
  "the Pale", "of the Barrow", "Coldhand", "the Unquiet", "Stonegrim",
  "Deepdelve", "Candlecap", "the Hill-Wise", "Frostbeard", "of the High Pines",
  "Stormwatch", "Thunder-Struck", "Ash-Walker", "of the Red Wastes", "Quickblade",
];

/** Epithet indexes per archetype. @type {Record<Archetype, number[]>} */
export const EPITHETS_FOR = {
  traveler: [0, 1, 2, 4],
  pilgrim: [0, 1, 3],
  ghost: [5, 6, 7, 8],
  miner: [9, 10, 11],
  hermit: [12, 13, 14],
  storm: [15, 16, 1],
  exile: [17, 18, 7],
  rival: [19, 2, 1],
};

/** What a Stranger says when you walk up, by archetype (one at random). @type {Record<Archetype, string[]>} */
export const GREETINGS = {
  traveler: [
    "Well met, friend. Road's long, isn't it? Longer when you walk it alone.",
    "Oh! You startled me. Not many folk out this far.",
    "Good day. If you're going my way, I could use a hand.",
  ],
  pilgrim: [
    "Blessings of the road on you. I walk to the old holy places, one at a time.",
    "Every step's a prayer, my teacher said. My feet say otherwise.",
    "Peace, traveler. Have you come far? I have.",
  ],
  ghost: [
    "...you can see me? Then you can help me.",
    "It's cold here. It's always cold here. Won't you stay a moment?",
    "Hush. Listen. Do you hear it too? No... it's only me.",
  ],
  miner: [
    "Mind the drop, surfacer. Down here the stone keeps its own counsel.",
    "Hah! Daylight on your boots. Haven't seen that in a week.",
    "You'd be surprised what the deep gives up, if you ask it nicely.",
  ],
  hermit: [
    "Visitors. Up here. Well, the wind does say I'm too quiet.",
    "Mind the goats. And the cliff. Mostly the goats.",
    "Thin air, thick thoughts. Sit, if you like.",
  ],
  storm: [
    "Isn't it glorious? Feel that in your teeth!",
    "Stand clear of the tall trees, friend. Lightning likes a show-off.",
    "Thunder and rain! Best weather there is, if you ask me.",
  ],
  exile: [
    "Don't stare. Nobody comes down here on purpose.",
    "The heat gets into your head after a while. Are you real?",
    "Overworlder. I remember grass. I think.",
  ],
  rival: [
    "You again? Or someone like you. You all have that look.",
    "Hunting the same game, are we? May the faster blade win.",
  ],
};

/** The Recurring Wanderers' own greetings. @type {Record<string, string[]>} */
export const NAMED_GREETINGS = {
  pell: ["Ah, a fellow traveler! Pell's the name, pilgrim's the trade. Sit a moment.", "The road brought you back to me. It does that."],
  anwen: ["The stars are in the wrong places. Have you noticed? No one notices.", "I was measuring something. I can't remember what. Help me remember."],
  brannoch: ["Brannoch Deepdelve, at your service, so long as your service is digging.", "Listen to the rock. No? Your ears are too young."],
  rook: ["Rook. You've heard of me. If you haven't, you will.", "Every bounty on that board has my name on it. Figuratively."],
  marigold: ["Marigold. I grow things where nothing grows. You look like you need tea.", "Up here the sky is closer. It's company, of a sort."],
  tamsin: ["Tamsin Galeward! Storm-chaser, weather-tamer, occasional lightning rod.", "Is it thundering? Then I'm happy."],
  vesk: ["Vesk. Just Vesk. They took the rest of my name when they sent me here.", "If you've got a way out, I'm listening."],
  hob: ["Hob Fairweather, tinker and teller of tales! Need a pot mended?", "Ah, it's you! The road's friendlier with a familiar face."],
};

/**
 * What a disguised hostile says when you walk up: each has a tell (a Choir phrase, a toll for no road, a sailor
 * far from any sea who smells of salt, a hermit who never blinks). @type {Record<string, string[]>}
 */
export const HOSTILE_GREETINGS = {
  spy: ["Peace on your road, friend. Nothing lost, nothing missed, as they say.", "A pilgrim, like you. Have you heard the song? Everyone hears it in the end."],
  toll: ["Hold up there. This is a toll road. Has been since this morning.", "Nobody passes my crossing for free. Not even you."],
  sailor: ["Lost my ship, lost my way. Which way is the sea? I can smell it on me.", "Cold, isn't it? The water's always cold, after."],
  hermit: ["Welcome. Welcome. You'll stay. Everyone stays a while.", "The wind told me you'd come. The wind tells me many things."],
};
