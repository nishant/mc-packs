// The stories Story Questlines tells. Pure data: main.js reads it, so a new story is a new entry here.
// Keep every `id` (story, chapter, choice) when editing: players' progress is saved by them. Text is
// shown in Bedrock forms, so keep pages short (a few sentences) and plain ASCII (plus § color codes).

/**
 * A page of a dialogue. A string always shows; `{ text, when }` shows only when every flag in `when`
 * has that value for the player (flags are set by choices, below).
 * @typedef {string | { text: string, when: Record<string, string> }} Page
 */

/**
 * Reputation sent to the Guilds pack (`realm:rep_add`). `when` works like a page's.
 * @typedef {{ guild: "miners" | "growers" | "wardens" | "wayfarers", amount: number, when?: Record<string, string> }} Rep
 */

/**
 * One thing to do in a chapter. Every type needs a `label` (what the story log shows).
 * - `talk`: talk to NPC `npc`.
 * - `reach`: stand within `radius` blocks (across, default 16) of a place: `place` (a named place an
 *   operator sets, see PLACES), `at` ({ dim?, x, z }) or `offset` ({ x, z } from world spawn, in the
 *   overworld). `mark` names an `at`/`offset` spot on the tracker.
 * - `deliver`: bring `count` of `item` to NPC `npc` (taken from your inventory when you talk to them).
 * - `collect`: have `count` of `item` in your inventory.
 * - `defeat`: defeat `count` mobs from `mobs` (any mob when left out), or with `champion` a champion
 *   spawned at the place when you come within `radius` (default 32).
 * - `interact`: tap (use) one of `blocks` `count` times within `radius` (default 8) of a place.
 * - `survive`: be outdoors (nothing over your head) in a thunderstorm for `seconds`, within `radius`
 *   of the place when one is given.
 * - `mine`: break `count` of `blocks` (any when left out). `fish`: catch `count` of `items` (any).
 * @typedef {object} Objective
 * @property {"talk" | "reach" | "deliver" | "collect" | "defeat" | "interact" | "survive" | "mine" | "fish"} type
 * @property {string} label
 * @property {string} [npc]
 * @property {string} [item]
 * @property {number} [count]
 * @property {number} [seconds]
 * @property {string} [place]
 * @property {{ dim?: string, x: number, z: number }} [at]
 * @property {{ x: number, z: number }} [offset]
 * @property {string} [mark]
 * @property {number} [radius]
 * @property {string[]} [mobs]
 * @property {{ tag: string, mob: string, name: string, trait?: string, warn?: string }} [champion]
 * @property {string[]} [blocks]
 * @property {string[]} [items]
 */

/**
 * @typedef {object} Reward
 * @property {number} [levels] XP levels
 * @property {{ item: string, amount: number }[]} [items]
 * @property {number} [crowns] paid on the `crowns` scoreboard
 * @property {string} [relic] a relic id for the Relics pack (`realm:relic_give`)
 * @property {string} [title] a title for the Titles pack (`realm:title_unlock`)
 * @property {{ entry: string, label: string }} [journal] a `story` page entry for the Journal pack
 */

/**
 * A choice button on the last page of a chapter's outro.
 * @typedef {{ id: string, label: string, set?: Record<string, string>, rep?: Rep[], reply?: Page[] }} Choice
 */

/**
 * @typedef {object} Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} [npc] who tells the intro (default: the story's giver)
 * @property {string} [end] who you report back to for the outro (default: `npc`)
 * @property {Page[]} intro
 * @property {Objective[]} objectives
 * @property {Page[]} outro
 * @property {Choice[]} [choices]
 * @property {Reward} [reward]
 * @property {Rep[]} [rep] reputation given when the chapter is finished
 */

/**
 * @typedef {object} Story
 * @property {string} id
 * @property {string} title
 * @property {string} short the tracker's name for it
 * @property {string} giver the NPC id who starts it
 * @property {Chapter[]} chapters
 */

/** NPC ids (the Townsfolk pack's default townsfolk) and how the story text names them. */
export const NPC_NAMES = /** @type {Record<string, string>} */ ({
  mara: "Mara the Cartographer",
  tobin: "Old Tobin",
  reyes: "Warden Reyes",
  elsie: "Elsie the Innkeeper",
  bram: "Mayor Bram",
  quill: "Quill the Trader",
  ida: "Ida the Relicsmith",
  sol: "Sol the Sky-reader",
});

/**
 * Named places operators set with /realm:saga_place <name>, standing on the spot. Name -> how the
 * tracker and story log call it.
 */
export const PLACES = /** @type {Record<string, string>} */ ({
  lighthouse: "Lighthouse",
  sunken_bell: "Sunken Bell",
  old_chapel: "Old Chapel",
});

const T = "§eTobin:§r ";
const R = "§eReyes:§r ";
const I = "§eIda:§r ";
const B = "§eBram:§r ";
const M = "§eMara:§r ";
const SILENCE = { bell: "silence" };
const RING = { bell: "ring" };

/** @type {Story[]} */
export const STORIES = [
  {
    id: "drowned_bell",
    title: "The Drowned Bell",
    short: "Drowned Bell",
    giver: "tobin",
    chapters: [
      {
        id: "salt",
        title: "Salt and Silence",
        npc: "tobin",
        intro: [
          `§eOld Tobin§r squints at you over a half-mended net.\n\n${T}You heard it too, didn't you? Last night, past midnight. One long note, low as a whale. A bell.`,
          `${T}Thing is, there's no bell. Not anymore. The harbor bell went into the sea with the old tower, forty winters back. I watched it go. Took my brother's boat down with it.`,
          `${T}My knees won't do the cliff path these days. Climb up to the old lighthouse for me and look out over the water. And ask Warden Reyes what her night watch heard. She hears everything, that one.`,
        ],
        objectives: [
          { type: "reach", label: "Climb to the lighthouse", place: "lighthouse", radius: 16 },
          { type: "talk", label: "Ask Warden Reyes what the night watch heard", npc: "reyes" },
        ],
        outro: [
          "From the lighthouse the sea looked calm. Too calm: no gulls, no fish jumping. And far out, just under the surface, something pale caught the light and was gone.",
          `${T}Pale, eh? And Reyes says her watch saw drowned walking out of the surf with rope tied to their wrists. Black rope, tarred. The old bell rope was tarred black.`,
          `${T}Go see Reyes again. If the drowned are coming ashore, she'll want a hand. Here, something warm for the climb.`,
        ],
        reward: { levels: 3, items: [{ item: "minecraft:cooked_cod", amount: 8 }] },
      },
      {
        id: "choir",
        title: "The Drowned Choir",
        npc: "reyes",
        intro: [
          `§eWarden Reyes§r taps a map pinned to the wall. Red marks line the shore.\n\n${R}Twelve nights, twelve landings. They walk out of the surf after dark, stand on the sand facing the sea, and wait. Like a choir waiting for a note.`,
          `${R}My wardens are stretched thin. Thin out the drowned for me: a dozen should do it.`,
          `${R}And watch the water while you're at it. Tobin says the fish have gone quiet. Take a rod and see if anything still bites.`,
        ],
        objectives: [
          { type: "defeat", label: "Defeat 12 drowned", mobs: ["minecraft:drowned"], count: 12 },
          { type: "fish", label: "Catch 5 things with a fishing rod", count: 5 },
        ],
        outro: [
          `${R}Rope on every one of them. Tarred black, rotten through.\n\nShe turns a scrap over in her gloved hands.\n\n${R}Old Tobin was right. This is the harbor bell's rope.`,
          `${R}The old stories say the bell rang for storms. It called the boats home before there was a lighthouse. If it rings again, it will be in thunder. Tobin will know more.`,
          `${R}Thank you, warden-for-a-day. The town owes you one.`,
        ],
        reward: { levels: 4, crowns: 40, items: [{ item: "minecraft:arrow", amount: 16 }] },
        rep: [{ guild: "wardens", amount: 10 }],
      },
      {
        id: "vigil",
        title: "The Storm Vigil",
        npc: "tobin",
        intro: [
          `${T}Bell rope. So it's the old bell, all right, and something down there is pulling on it.\n\nHe sets the net down.`,
          `${T}My grandmother said the bell only speaks in thunder. Next time a storm rolls in, go up to the lighthouse and keep watch. Stay out in the open, where the sky can see you.`,
          `${T}Two minutes of it, mind, not a heartbeat less. When it rings, mark where the sound comes from. And come back with all your fingers.`,
        ],
        objectives: [{ type: "survive", label: "Keep watch outdoors at the lighthouse in a thunderstorm", place: "lighthouse", radius: 48, seconds: 120 }],
        outro: [
          "Rain sheets across the lantern room. Between the thunderclaps you hear it: one deep note, rolling up out of the water. Far out, a ring of pale green light flickers under the waves and goes dark.",
          `${T}Green light. Then it's waking. Forty years I told myself it was just a bell.\n\nHe is quiet for a long moment.`,
          `${T}Ida the relicsmith works sea-iron. If anyone can make something to face that bell, it's her. Tell her Tobin sent you. She'll grumble, then she'll help.`,
        ],
        reward: { levels: 5, title: "Stormwatcher", journal: { entry: "storm_vigil", label: "The Storm Vigil" } },
      },
      {
        id: "iron",
        title: "Iron and Sea-Glass",
        npc: "ida",
        intro: [
          `§eIda§r doesn't look up from her anvil.\n\n${I}Tobin sent you. About the bell. Everyone has heard it by now; half the town sleeps with wool in their ears.`,
          `${I}A bell is a mouth. You can stop it, or you can give it a new voice. Either way I need iron, a great deal of it, and prismarine to tune it to the sea. The guardians at the ocean monuments carry shards.`,
          `${I}Twenty-four iron ingots. Twelve prismarine shards. Bring them as you find them; I keep count.`,
        ],
        objectives: [
          { type: "deliver", label: "Bring Ida 24 iron ingots", npc: "ida", item: "minecraft:iron_ingot", count: 24 },
          { type: "deliver", label: "Bring Ida 12 prismarine shards", npc: "ida", item: "minecraft:prismarine_shard", count: 12 },
        ],
        outro: [
          "Ida works through the night. By morning two things lie on her bench: a heavy iron clapper wrapped in sea-glass, and a dull gray band of iron, sized to fit around a bell's lip.",
          `${I}The band smothers it. Fit it around the bell and it will never ring again: no more drowned, no more wool in our ears. The wardens would sleep easy.`,
          `${I}The clapper tunes it. Strike the bell with it in place and it rings true again, a sound to guide boats home through any storm. The wayfarers have wanted that for years.\n\nYour choice. You've earned it.`,
        ],
        choices: [
          {
            id: "silence",
            label: "Silence the bell",
            set: SILENCE,
            rep: [{ guild: "wardens", amount: 15 }],
            reply: [`${I}Quiet, then. I'll wrap the band in sea-glass so the water doesn't eat it. Some songs are better ended.`],
          },
          {
            id: "ring",
            label: "Recast the bell",
            set: RING,
            rep: [{ guild: "wayfarers", amount: 15 }],
            reply: [`${I}Good. I hoped you'd say that. A harbor without a bell is just a beach.`],
          },
        ],
        reward: { levels: 5, crowns: 60 },
      },
      {
        id: "sunken",
        title: "The Sunken Bell",
        npc: "ida",
        intro: [
          { text: `${I}Take the band down to the bell. Fit it, then strike the bell three times so the iron sets. It will fight you. Bells don't like being told to be quiet.`, when: SILENCE },
          { text: `${I}Take the clapper down to the bell and strike it three times, so it learns its new voice. It may not want to learn.`, when: RING },
          `${I}Tobin knows where the old tower fell. Bring something to breathe with, a good helmet, and something sharp. The drowned guard what they love.`,
        ],
        objectives: [
          { type: "reach", label: "Dive to the sunken bell", place: "sunken_bell", radius: 12 },
          { type: "interact", label: "Strike the sunken bell 3 times", place: "sunken_bell", blocks: ["minecraft:bell"], count: 3, radius: 8 },
        ],
        outro: [
          { text: "On the third strike the band bites into the bronze and the bell goes dead under your hand. For a moment the sea is perfectly still.", when: SILENCE },
          { text: "On the third strike the bell rings clear, one bright true note that shakes the water. For a moment the sea is perfectly still.", when: RING },
          "Then, from somewhere far below, something answers with a roar.",
          `${I}A roar? Then the bell had a keeper. Go to Mayor Bram before you go back down. If this becomes a fight, the town should know.`,
        ],
        reward: { levels: 5, items: [{ item: "minecraft:golden_apple", amount: 2 }] },
      },
      {
        id: "warden",
        title: "The Bell Warden",
        npc: "bram",
        end: "tobin",
        intro: [
          `§eMayor Bram§r is already standing when you come in, hat in his hands.\n\n${B}The fishermen saw it this morning. Something huge, wearing the old tower's weather vane like a crown, walking the sea floor by the wreck.`,
          `${B}It's been down there forty years, guarding that bell. Whatever you did woke it properly. I won't send anyone else into that water. But I'll ask you.`,
          `${B}Go back to the sunken bell and end it. Then tell Old Tobin, please. He's waited longer than any of us.`,
        ],
        objectives: [
          {
            type: "defeat",
            label: "Defeat the Bell Warden at the sunken bell",
            place: "sunken_bell",
            radius: 32,
            count: 1,
            champion: { tag: "saga_bell_warden", mob: "minecraft:drowned", name: "The Bell Warden", warn: "The water around the bell goes cold. Something is coming." },
          },
        ],
        outro: [
          "§eTobin§r listens to the whole story without a word. Then he reaches into his coat and sets a small, green-crusted brass plate on the table. It reads: HARBOR BELL. CAST IN THE YEAR OF THE LONG STORM.",
          { text: `${T}Quiet, then. Good. My brother can rest. Forty years I've listened for that bell. Tonight I'll sleep without listening for anything.`, when: SILENCE },
          { text: `${T}Listen. You can hear it from here: the tide is moving the clapper, just gently. My brother would have steered home by that sound. Every boat will, now.`, when: RING },
          { text: "§eReyes§r posts the news on the warden board: the shore is safe. The wardens raise a mug to you that night, and nobody puts wool in their ears.", when: SILENCE },
          { text: "The wayfarers come down to the docks the next evening to hear the bell ring the storm in. They say it sounds like home. They say it sounds like you.", when: RING },
          `${T}Here. These were his. He'd want them walking somewhere, not sitting in a chest.`,
        ],
        reward: { levels: 10, crowns: 150, relic: "tide_boots", title: "Bellkeeper", journal: { entry: "drowned_bell", label: "The Drowned Bell" } },
        rep: [
          { guild: "wardens", amount: 40, when: SILENCE },
          { guild: "wayfarers", amount: 40, when: RING },
        ],
      },
    ],
  },
  {
    id: "last_map",
    title: "The Cartographer's Last Map",
    short: "Last Map",
    giver: "mara",
    chapters: [
      {
        id: "pins",
        title: "Pins in an Old Map",
        intro: [
          `§eMara§r unrolls a map so old it cracks at the folds. Most of it is blank. Three faded pins stand in it, far from anything.\n\n${M}My teacher's. Aldous Fenn. Best cartographer this side of the mountains, and the worst at finishing things.`,
          `${M}He died last spring and left me this, and a note that just says FINISH IT. I mean to. But nobody walks off the edge of a map with an empty pack.`,
          `${M}Bring a compass of your own, and paper. Eight sheets. Real cartographers carry their own; you'll be drawing as much as walking.`,
        ],
        objectives: [
          { type: "collect", label: "Have a compass", item: "minecraft:compass", count: 1 },
          { type: "collect", label: "Have 8 paper", item: "minecraft:paper", count: 8 },
        ],
        outro: [
          `${M}Good. Now listen. Fenn pinned three spots, far out. He never wrote down what's there. I've copied the bearings onto your compass card.`,
          `${M}Take this blank map as well. You'll want it later. Fenn always said: carry one more map than you think you need.`,
        ],
        reward: { levels: 2, items: [{ item: "minecraft:empty_map", amount: 1 }, { item: "minecraft:bread", amount: 8 }] },
      },
      {
        id: "far",
        title: "Three Pins",
        intro: [
          `${M}The first pin is far to the northeast. The second, a long way west. The third lies south, past where the roads give out.`,
          `${M}Take your time. Fenn always said a rushed map is a wrong map. When you're standing on a pin, you'll know: he marked places that make you stop.`,
        ],
        objectives: [
          { type: "reach", label: "Stand on the first pin (far northeast)", offset: { x: 900, z: -700 }, mark: "First pin", radius: 24 },
          { type: "reach", label: "Stand on the second pin (far west)", offset: { x: -1100, z: -200 }, mark: "Second pin", radius: 24 },
          { type: "reach", label: "Stand on the third pin (far south)", offset: { x: 150, z: 1200 }, mark: "Third pin", radius: 24 },
        ],
        outro: [
          `§eMara§r spreads your sketches beside Fenn's map and goes very still.\n\n${M}Look. Draw a line from each pin through the next one... they cross here. Near home. He was pointing back the whole time.`,
          `${M}There's only one old thing at that spot: the old chapel, the one nobody uses anymore. Fenn used to sit there for hours. I never asked him why.`,
        ],
        reward: { levels: 6, crowns: 60, journal: { entry: "fenn_pins", label: "Fenn's Three Pins" } },
      },
      {
        id: "chapel",
        title: "The Old Chapel",
        intro: [
          `${M}Go to the old chapel. Look for anything of his: a note, a map case, a scratch on the wall.`,
          `${M}And ask Sol the Sky-reader about him on your way. Fenn and Sol argued about stars half the night, every night. If he hid a riddle in the sky, Sol will know.`,
        ],
        objectives: [
          { type: "reach", label: "Find the old chapel", place: "old_chapel", radius: 12 },
          { type: "talk", label: "Ask Sol the Sky-reader about Fenn", npc: "sol" },
        ],
        outro: [
          "Behind a loose stone under the chapel window you find a waxed leather tube. Inside is one last sheet, blank but for a compass rose and a single line in Fenn's cramped hand: THE MAP IS FINISHED WHEN SOMEONE WALKS IT.",
          `${M}Sol said Fenn mapped the stars because they never change, and the land because it always does.\n\nShe laughs, a little wet.\n\n${M}That old fox. He didn't want me to find a place. He wanted me to make a map of my own.`,
        ],
        reward: { levels: 5, journal: { entry: "old_chapel", label: "The Old Chapel" } },
      },
      {
        id: "last",
        title: "The Last Map",
        intro: [
          `${M}So let's finish it. Take the blank map I gave you, fill it in somewhere you love, and bring it to me. Not a famous place. Your place.`,
          `${M}I'll copy it into the back of Fenn's book. The first page in his hand, the last in yours.`,
        ],
        objectives: [{ type: "deliver", label: "Bring Mara a filled map of a place you love", npc: "mara", item: "minecraft:filled_map", count: 1 }],
        outro: [
          "§eMara§r copies your map line by line into the back of Fenn's book. When she's done she turns it around so you can see. It looks like it was always meant to be there.",
          `${M}One more thing, and it's yours to decide. This is the best map of the land anyone has made. Do we hang it in the square for every traveler to copy? Or keep it here, so the wild corners Fenn found stay wild a while longer?`,
        ],
        choices: [
          {
            id: "share",
            label: "Share it with the realm",
            set: { map: "share" },
            rep: [{ guild: "wayfarers", amount: 30 }],
            reply: [`${M}Then the square it is. Every traveler who copies it will walk a little of Fenn's road. And a little of yours.`],
          },
          {
            id: "keep",
            label: "Keep the wild places wild",
            set: { map: "keep" },
            rep: [{ guild: "growers", amount: 30 }],
            reply: [`${M}Then it stays on my shelf, and the wild places stay wild. Fenn would have grumbled about it. Then he would have agreed.`],
          },
        ],
        reward: { levels: 8, crowns: 100, relic: "compass_echoes", title: "Cartographer", journal: { entry: "last_map", label: "The Cartographer's Last Map" } },
      },
    ],
  },
];
