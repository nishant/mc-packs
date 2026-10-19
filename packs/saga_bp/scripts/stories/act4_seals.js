// Story content: see docs/STORY_BIBLE.md. Written by the act4_seals writer.
//
// Act IV: The Three Seals. 12 chapters, and every player plays all 12: the three seal branches are
// written once each and reordered, never duplicated or skipped.
//
// How the seal order works (only chapter `when`, choice `requires` and `!x` values):
//
// - Own story flag `now` is the seal being worked on: "tide", "stone", "sky", then "done".
//   Every chapter of a seal carries `when: { now: "<seal>" }`. The engine's current chapter is the
//   first unfinished chapter whose `when` matches, so the list order (tide, stone, sky) never
//   matters: only the seal `now` names can be current.
// - The council's choices set `first` and `now` to the seal picked.
// - Each seal's last chapter (tide_echo, stone_light, sky_vision) ends with choices made by
//   `sealChoices()` that move `now` along. Which buttons show depends on which slot this seal
//   filled, worked out from `first` and `second` alone:
//     first slot  (`first` = this seal): two buttons, one per other seal; each sets `second` and
//                 `now` to that seal.
//     second slot (`second` = this seal): one button, to the seal that is neither `first` nor this
//                 one (`requires.flags: { second: this, first: <the other done seal> }`).
//     last slot   (`first` and `second` both "!this"): one button, back to Elsie, `now` = "done".
//   Exactly one slot matches at each finale, and `second` is always set by the time a "!x" test on
//   it can matter, so the result never depends on how a missing flag compares.
// - Text acknowledges the order with the same three conditions (FIRST, SECOND and LAST below):
//   "First seal", "One seal lit", "Two seals lit and you saved the wet one for last".
// - The closing chapters (promise, gate) need no `when`: they come after every seal chapter in the
//   list, so they are reached only once all nine seal chapters are finished.
//
// Flags this story sets: `first`, `second`, `now` (order), `hal` ("carried" / "listened", read in the
// Tide finale) and `act4:promise` ("allow" / "refuse"; later stories read
// `act4_seals.act4:promise`). Counters: `g:iron` +1 (allow) or `g:mercy` +1 (refuse).
// Flags read: drowned_bell.bell, last_map.map, act1_signs.act1:path, act2_choir.mayor,
// act3_deep.elsie, act3_deep.keys (the council: who stands with you), g:quill, g:hollis, g:mercy / g:iron (">=4").
// Seal keys given as items (for Act V): "Tide Key" (heart of the sea), "Stone Key" (echo shard),
// "Sky Key" (amethyst shard).

/** @typedef {import("../types.js").Story} Story */
/** @typedef {import("../types.js").Choice} Choice */
/** @typedef {import("../types.js").When} When */

const E = "§eElsie:§r ";
const T = "§eTobin:§r ";
const R = "§eReyes:§r ";
const I = "§eIda:§r ";
const S = "§eSol:§r ";
const M = "§eMara:§r ";
const HAL = "§bHal:§r ";
const HER = "§5The Herald:§r ";

/** @param {string} seal @returns {When} */
const NOW = (seal) => ({ now: seal });
/** This seal is the first one played. @param {string} seal @returns {When} */
const FIRST = (seal) => ({ first: seal });
/** This seal is the second one played. @param {string} seal @returns {When} */
const SECOND = (seal) => ({ second: seal });
/** This seal is the last one played. @param {string} seal @returns {When} */
const LAST = (seal) => ({ first: `!${seal}`, second: `!${seal}` });

const SEALS = /** @type {const} */ (["tide", "stone", "sky"]);
const SEAL_LABEL = { tide: "the Tide Seal, with Tobin", stone: "the Stone Seal, with Ida", sky: "the Sky Seal, with Sol" };
const SEAL_GO = {
  tide: "Old Tobin will be down at the dock, pretending he isn't waiting for you. Bring water breathing. Bring patience.",
  stone: "Ida will be at her forge with her pack already on. Bring torches, a pickaxe, and soft boots.",
  sky: "Sol will be on the inn roof with a spyglass, counting. Bring blocks to climb, and something for falling.",
};

/**
 * The buttons at the end of a seal's last chapter: they pick the next seal (see the comment at the
 * top of the file).
 * @param {"tide" | "stone" | "sky"} seal
 * @returns {Choice[]}
 */
function sealChoices(seal) {
  const others = SEALS.filter((s) => s !== seal);
  /** @type {Choice[]} */
  const choices = others.map((next) => ({
    id: `next_${next}`,
    label: `Next: ${SEAL_LABEL[next]}`,
    set: { second: next, now: next },
    requires: { flags: { first: seal } },
    reply: [`One seal down. ${SEAL_GO[next]}`],
  }));
  for (const next of others) {
    const done = others.find((s) => s !== next) ?? next;
    choices.push({
      id: `last_${next}`,
      label: `The last seal: ${SEAL_LABEL[next]}`,
      set: { now: next },
      requires: { flags: { second: seal, first: done } },
      reply: [`Two seals down, one to go. ${SEAL_GO[next]}`],
    });
  }
  choices.push({
    id: "done",
    label: "Go back to Elsie",
    set: { now: "done" },
    requires: { flags: LAST(seal) },
    reply: ["Three seals, three keys, all of them warm in your pack. The walk back to the inn feels shorter than it has any right to."],
  });
  return choices;
}

/** @type {Story[]} */
export const STORIES = [
  {
    id: "act4_seals",
    title: "The Three Seals",
    short: "The Three Seals",
    giver: "elsie",
    kind: "main",
    act: 4,
    tones: ["epic", "heroic", "dangerous", "exploration", "sad"],
    summary: "Elsie calls a council at the inn. Three seals to relight, three roads to walk, and the Lantern is already in the sky.",
    requires: { stories: ["act3_deep"] },
    chapters: [
      // 1. The council: everyone together; choose the first seal.
      {
        id: "council",
        title: "The Council at the Inn",
        npc: "elsie",
        intro: [
          `§eElsie§r has pushed every table in the common room together into one long board and set out more bread than six people could eat in a week.\n\n${E}Sit, starling. Eat something. Then go and fetch the others. Tonight this house stops keeping secrets.`,
          `${E}The Lantern is in the sky for anyone to see now. Sol says it brightens a little every night. When it passes overhead, its light has to find three seals lit and waiting. If it finds them dark, it finds nothing at all.`,
          `${E}Fetch Reyes, Tobin, Ida and Sol. Mara will come on her own; she can smell an open map from three streets away. Tell them Elsie is asking, and tell them there is pie. Both of those are true.`,
          { text: `${E}And if you pass Quill, tell him the back door is open. He will pretend he wasn't already listening at it.`, when: { "g:quill": "trusted" } },
          { text: `${E}Quill is still in the warden's cells. Reyes won't let him out for supper, and I can't say she's wrong. I set a plate aside for him anyway. Old habits.`, when: { "g:quill": "exposed" } },
          { text: "By the fire, §eBrother Hollis§r looks up from a cup of tea he hasn't touched. He is thin and gray under the eyes, but they are his own eyes again.\n\n§eHollis:§r I'll keep a candle lit in the chapel every night until you're home. It's the one thing I'm sure I can do.", when: { "g:hollis": "saved" } },
          { text: "One chair by the fire stays empty. It is where Brother Hollis used to sit with his tea. Elsie has set a cup there anyway, and nobody touches it.", when: { "g:hollis": "lost" } },
        ],
        objectives: [
          { type: "talk", label: "Ask Warden Reyes to come to the council", npc: "reyes" },
          { type: "talk", label: "Ask Old Tobin to come to the council", npc: "tobin" },
          { type: "talk", label: "Ask Ida the Relicsmith to come to the council", npc: "ida" },
          { type: "talk", label: "Ask Sol the Sky-reader to come to the council", npc: "sol" },
        ],
        outro: [
          "By full dark the common room is crowded: Reyes in her armor, Tobin with his cap twisted in his fists, Ida with soot to the elbows, Sol at the window watching the sky, and Mara unrolling Fenn's old map right across the bread.",
          { text: `${M}Good thing half the realm copied this off the square. Three travelers asked me this week what Fenn's pins were. I told them a bakery. I am a terrible liar.`, when: { "last_map.map": "share" } },
          { text: `${M}I never hung it in the square, so this is the only copy in the world that shows the seals. Nobody spill anything. I mean it, Tobin.`, when: { "last_map.map": "keep" } },
          { text: `${R}And this time you take somebody with you. You went after the Choir alone once and came back. Don't make a habit of being lucky. That's an order. Mostly.`, when: { "act1_signs.act1:path": "alone" } },
          { text: `${R}You came to me first, back when this was just singing in the woods. I haven't forgotten. My wardens are yours for this, every one who can hold a sword. That's an order. Mostly to me.`, when: { "act1_signs.act1:path": "report" } },
          { text: `${I}The miners are camped at the mine mouth with picks and lamps, waiting on your word. You asked for us at the end of all that, and we don't forget being asked.`, when: { "act3_deep.keys": "miners" } },
          { text: `${S}The wayfarers have horses saddled in the square and a boat at the dock. You asked for us at the end of all that, and a wayfarer never forgets a road someone asked him to ride.`, when: { "act3_deep.keys": "wayfarers" } },
          `${E}Tide, Stone, Sky. Tobin knows the water over the Tide Seal, Ida has stood at the Stone Seal, and only Sol can find the Sky Seal by the stars. The shard has light enough for all three keys. So. Which seal first, starling? The other two follow, in whatever order you choose.`,
        ],
        choices: [
          {
            id: "tide",
            label: "The Tide Seal first, with Tobin",
            set: { first: "tide", now: "tide" },
            reply: [`${T}The sea, then. Good. If I'm going to be scared, I'd rather get it over with.`],
          },
          {
            id: "stone",
            label: "The Stone Seal first, with Ida",
            set: { first: "stone", now: "stone" },
            reply: [`${I}Stone first. Good. I know the way. I've been dreaming it.`],
          },
          {
            id: "sky",
            label: "The Sky Seal first, with Sol",
            set: { first: "sky", now: "sky" },
            reply: [`${S}Up, then. Polaris will be glad. It has been staring at that empty ring for forty years.`],
          },
        ],
        reward: {
          levels: 4,
          crowns: 60,
          items: [{ item: "minecraft:pumpkin_pie", amount: 6 }],
          codex: {
            id: "act4_three_seals",
            title: "The Council of Three Seals",
            text: "The Starwrights bound the Hollow with three seals: the Tide Seal on the sea floor past the ocean vaults, the Stone Seal in a shrine room deep in the deepslate, and the Sky Seal, a ring floating above the clouds. Each key must be relit with the Lantern's light before the comet passes, or its light falls on dark seals and the Hollow wakes. The shard holds light enough for all three.",
          },
        },
        hint: "Reyes, Tobin, Ida and Sol are townsfolk in your town: the tracker points to each one you still need. Talk to all four, then come back to Elsie at the inn to choose the first seal.",
      },

      // 2-4. The Tide Seal (Tobin).
      {
        id: "tide_vault",
        title: "The Drowned Vaults",
        npc: "tobin",
        when: NOW("tide"),
        intro: [
          { text: `§eOld Tobin§r is already at the dock when you arrive, scraping barnacles off a boat he hasn't sailed in years.\n\n${T}First seal, and it's the wet one. Good. Rather do it before I lose my nerve.`, when: FIRST("tide") },
          { text: `§eOld Tobin§r is waiting at the dock.\n\n${T}One seal lit already. Heard Elsie singing about it in the kitchen. Forty years, never heard her sing. Now it's the sea's turn.`, when: SECOND("tide") },
          { text: `§eOld Tobin§r is waiting at the dock, the way he has every morning since the council.\n\n${T}Two seals lit, and you saved the wet one for last. Smart. The sea doesn't like to be rushed.`, when: LAST("tide") },
          `${T}Elsie says the Tide Seal lies past the old vaults. The ocean monuments. Great green halls on the sea floor, with those one-eyed fish circling them like dogs around a gate.`,
          `${T}Ida needs prismarine crystals to tune the shard to the water. The glowing kind, not the shards. Guardians drop them, and so do the lamps inside the monuments. Sixteen. And thin the guardians out while you're down there. I'd like you home.`,
          { text: `${T}Funny thing. Since you recast the bell I sleep with the window open. I hear it every tide. Feels like it's counting us home, one by one.`, when: { "drowned_bell.bell": "ring" } },
          { text: `${T}Since you silenced the bell the harbor's been quiet as a held breath. I used to like quiet. Now I keep waiting for it to end.`, when: { "drowned_bell.bell": "silence" } },
        ],
        introChoices: [
          {
            id: "ask_vaults",
            label: "Ask Tobin if he's ever seen a monument",
            reply: [
              `${T}Once. I was nineteen and stupid, and Hal was seventeen and stupider. We dove on one for a dare. Got close enough to see the lamps inside. Then one of those fish looked at me.\n\nHe taps his chest.`,
              `${T}Felt it in my bones for a week. Couldn't lift an oar. Hal laughed himself sick. Then he carried my nets for a month and never said a word to Father. That was Hal.`,
            ],
          },
          {
            id: "ask_scared",
            label: "Ask Tobin if he's scared",
            reply: [`${T}Of the sea? Every day for sixty years. That's how you know you respect it. The ones who aren't scared, the sea keeps.\n\nHe looks down at his hands.\n\n${T}Of what's under the seal? Ask me after.`],
          },
        ],
        objectives: [
          { type: "collect", label: "Have 16 prismarine crystals", item: "minecraft:prismarine_crystals", count: 16 },
          { type: "defeat", label: "Defeat 8 guardians at an ocean monument", mobs: ["minecraft:guardian"], count: 8 },
        ],
        outro: [
          `${T}Sixteen. They glow like the old harbor lamps did, before the lighthouse. Go on. Hold one up to the shard.`,
          "When the crystal touches the Lantern Shard, both of them hum the same low note. For one breath you can hear the whole sea from inside your own chest: the tide, the whales, and somewhere very far down, a slow and patient listening.",
          `${T}Elsie says those guardians weren't monsters. Wardens of the water, set there by her people. Kept that gate so long they forgot what they were keeping it for.\n\nHe looks out at the bay.\n\n${T}I know the feeling.`,
          `${T}Now. The seal's out past the vaults, over the deep water, and I'm not swimming it. Tomorrow we take a boat. My boat. Hal's boat, really. I never could sell it.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:cooked_salmon", amount: 8 }],
          codex: {
            id: "act4_tide_vaults",
            title: "The Tide Vaults",
            text: "The ocean monuments are Starwright vaults, built to guard the road to the Tide Seal. Their guardians were wardens of the water, set to keep the way until the Lantern came again. After the Long Storm nobody came, and the wardens kept guarding anyway, against everyone. Prismarine crystals still carry the vaults' old light; touched to a Lantern shard, they tune it to the sea.",
          },
        },
        rep: [{ guild: "growers", amount: 10 }],
        hint: "Ocean monuments sit in deep ocean: look for a large prismarine building with guardians around it. Guardians drop prismarine crystals, and sea lanterns broken without Silk Touch drop them too. Bring potions of water breathing, doors or sponges for air, and a good sword.",
      },
      {
        id: "tide_boat",
        title: "Tobin Rows Out",
        npc: "tobin",
        when: NOW("tide"),
        intro: [
          `${T}Right. I'm coming with you this time. Don't argue. Forty years I've stood on that dock and watched the water. My knees can sit in a boat as well as anywhere.`,
          `${T}Bring a boat, any kind. You row; I give directions and complain. A couple hundred blocks of open water, then you dive for the seal while I hold the boat steady over you.`,
          `${T}And Elsie says something guards the seal itself. Not one of the little ones. The old one. The elder. Biggest fish I'll ever not catch.`,
          { text: `${T}They say you've got a soft way with people. Reyes says it'll get you hurt one day. I say it's why I'm getting in a boat with you.`, when: { "g:mercy": ">=4" } },
          { text: `${T}They say you hit first and ask later. Fine by me today. Whatever's down there won't be asking either.`, when: { "g:iron": ">=4" } },
        ],
        introChoices: [
          {
            id: "ask_boat",
            label: "Ask about the boat",
            reply: [
              `${T}The Gull. Hal built her the summer he turned sixteen. Crooked as a dog's hind leg, leaks at the stern, pulls left in any wind. I've kept her tarred every spring for forty years.\n\nHe pats the hull like a horse.`,
              `${T}Can't bring her this far out, mind. Too old. So you bring whatever floats, and I sit in it and pretend it's the Gull. Don't tell her.`,
            ],
          },
          {
            id: "ask_elder",
            label: "Ask how to fight an elder guardian",
            reply: [`${T}Quickly. It'll put a weight in your arms so you can't dig or swing proper. Sword, not pick. Strike, swim back, breathe, strike again. And don't let it get you in a corner. Old things are patient. Be faster than patient.`],
          },
        ],
        objectives: [
          { type: "ride", label: "Row a boat 200 blocks with Tobin aboard", mobs: ["minecraft:boat", "minecraft:chest_boat"], distance: 200 },
          { type: "reach", label: "Dive to the Tide Seal", place: "seal_tide", radius: 24 },
          {
            type: "defeat",
            label: "Defeat the Drowned Gatekeeper at the Tide Seal",
            place: "seal_tide",
            radius: 40,
            count: 1,
            champion: {
              tag: "realm:saga:tide_gatekeeper",
              mob: "minecraft:elder_guardian",
              name: "The Drowned Gatekeeper",
              warn: "The sea lanterns of the Tide Seal flicker. Something old opens one enormous eye.",
              health: 40,
              adds: { mobs: ["minecraft:guardian"], count: 3 },
            },
          },
        ],
        outro: [
          "When the elder guardian finally goes still, the sea-lantern ring around the shrine brightens, one lantern at a time, all the way around. It stops one lantern short of whole.",
          `You surface beside the boat, gasping. Tobin hauls you in by the collar.\n\n${T}You're bleeding seawater. Sit down. No. Wait. Look down there, by the pillars. That light. That's not a lantern.`,
          `He goes quiet, gripping the side of the boat with both hands.\n\n${T}I know that light. I rowed behind it every morning of my life until I was twenty. Go down. Go and see. I'll hold the boat.`,
        ],
        reward: {
          levels: 6,
          crowns: 90,
          items: [{ item: "minecraft:golden_apple", amount: 2 }],
          codex: {
            id: "act4_gatekeeper",
            title: "The Drowned Gatekeeper",
            text: "The oldest warden of the Tide Seal was an elder guardian that had circled the shrine since the Starwrights left. Forty years without the Lantern turned its watch into hunger: it attacked anything that came near, friend or Choir alike. With it gone, the Tide Seal's sea lanterns woke one by one, all but the last.",
          },
        },
        rep: [{ guild: "growers", amount: 10 }],
        hint: "Any boat counts for the rowing, and it can be on the way to the seal. The Tide Seal is on the deep sea floor; the tracker points the way. The elder guardian gives Mining Fatigue, so fight with a sword, potions of water breathing and a helmet with Respiration.",
      },
      {
        id: "tide_echo",
        title: "Hal's Echo",
        npc: "tobin",
        when: NOW("tide"),
        intro: [
          `${T}That light by the pillars. It's an echo, isn't it. Like the ones Ida plays on her lamp. Sound frozen in crystal.`,
          `${T}If it's him... if it's Hal...\n\nHe stops. Starts again.\n\n${T}Don't tell him anything. Echoes can't hear. Just listen. Somebody should listen to him, after all this time.`,
          `${T}Then take the shard to the sea lanterns around the frame in the middle and light the seal. Elsie says you'll know how when you're there. Elsie says that about everything.`,
          { text: `${T}And if he asks about the bell... it rings again. Tell him that. He'd like that. He always said the harbor sounded wrong without it.`, when: { "drowned_bell.bell": "ring" } },
          { text: `${T}And if he asks about the bell... it's quiet. For good. Tell him that. He'd understand. He saw what it did.`, when: { "drowned_bell.bell": "silence" } },
        ],
        objectives: [
          {
            type: "meet",
            label: "Listen to the echo by the Tide Seal's pillars",
            place: "seal_tide",
            radius: 16,
            who: { id: "hal", name: "Hal's echo", entity: "minecraft:allay" },
            pages: [
              `The light unfolds into a young man made of pale blue glow, with Tobin's nose and a fisherman's cap pushed back on his head. He looks straight through you, at the water above.\n\n${HAL}If somebody hears this, I didn't make it back. Tell my brother I'm sorry.`,
              `${HAL}I saw the chapel keeper climb the harbor tower. Ashgrave. He was ringing the bell wrong, all wrong, a note that hurt your teeth, and the sky cracked open like an egg. I rowed for the tower. I thought if I could reach the rope...`,
              `${HAL}Tobin, if it's you, you big lump: you were right about the weather. You were always right about the weather. Mend the blue net, the one Mother made. Don't sell the boat. And don't you dare stop going out.`,
              `${HAL}It's warm down here. Something old is keeping me, like a hand around a candle. I think I'm holding a door shut. If somebody comes with the Lantern's light, let me go. I'm so tired, brother.`,
            ],
            choices: [
              {
                id: "carry",
                label: "Promise to carry his words to Tobin",
                set: { hal: "carried" },
                reply: ["You say it out loud, to the light: you will tell Tobin everything. Echoes can't hear. But Hal's echo smiles anyway, at nothing, at someone up above the water."],
              },
              {
                id: "listen",
                label: "Stay and listen until he fades",
                set: { hal: "listened" },
                reply: ["You don't say anything. You stay, the way Tobin asked, and let the echo say its piece again and again, until you know the words by heart."],
              },
            ],
          },
          { type: "interact", label: "Relight the Tide Seal: hit 4 of its sea lanterns", place: "seal_tide", blocks: ["minecraft:sea_lantern", "minecraft:conduit"], count: 4, radius: 10 },
        ],
        outro: [
          "The shard flares. Light races around the sea-lantern ring and down into the frame, and the whole shrine sings one long note you feel in your teeth. Hal's echo turns toward the sound, smiles, and goes out like a candle somebody finally let rest.",
          { text: `Back in the boat you tell Tobin every word. He doesn't say anything for a long time. Then he laughs, once, wet and cracked.\n\n${T}The blue net. The idiot. Forty years dead and he's still telling me how to mend.`, when: { hal: "carried" } },
          { text: "Back in the boat you don't have to tell Tobin anything. He saw the light go out from above, and he knew. He takes his cap off and holds it in his lap all the way home.", when: { hal: "listened" } },
          `${T}He held the door. All this time. He wasn't lost. He was working.\n\nHe wipes his face with the back of his hand.\n\n${T}Salt spray. Don't look at me like that.`,
          { text: `${T}One seal lit. Two to go. Go on, pick your next road. I'm going home to mend a net.`, when: FIRST("tide") },
          { text: `${T}Two seals lit. One left. Go on, finish it. I'm going home to mend a net.`, when: SECOND("tide") },
          { text: `${T}That's all three. Three! Go tell Elsie before she wears a hole in the floor. I'm going home to mend a net.`, when: LAST("tide") },
        ],
        choices: sealChoices("tide"),
        reward: {
          levels: 8,
          crowns: 120,
          items: [
            { item: "minecraft:heart_of_the_sea", amount: 1, name: "Tide Key", lore: ["The Tide Seal's key, relit.", "It smells of salt and tar."] },
            { item: "minecraft:prismarine_shard", amount: 8 },
          ],
          codex: {
            id: "act4_hal_echo",
            title: "Hal's Echo",
            text: "Hal, Old Tobin's younger brother, rowed out in the Long Storm to stop Brother Ashgrave from ringing the broken note. He never reached the tower. The Tide Seal kept what was left of him as an echo, and that echo held the seal's door shut for forty years. When the seal was relit, Hal was finally let go. His last words were for his brother: mend the blue net, keep the boat, keep going out.",
          },
        },
        rep: [{ guild: "growers", amount: 25 }],
        hint: "Hal's echo appears at the Tide Seal: swim close to the shrine and talk to the glowing figure. Then hit 4 of the sea lanterns around the shrine's frame. This whole chapter is underwater, so bring water breathing.",
      },

      // 5-7. The Stone Seal (Ida and the Miners).
      {
        id: "stone_door",
        title: "The Cracked Door",
        npc: "ida",
        when: NOW("stone"),
        intro: [
          { text: `§eIda§r has her pack on before you finish saying hello.\n\n${I}Stone first. Good. I've been down there. I know what's wrong with it. Let's go.`, when: FIRST("stone") },
          { text: `§eIda§r is sharpening a pick that doesn't need it.\n\n${I}One seal lit. I felt it from my forge, a hum in the anvil. Now mine.`, when: SECOND("stone") },
          { text: `§eIda§r is sitting on her anvil, waiting.\n\n${I}Two seals lit. Mine last. Fine. Stone waits. Stone is good at waiting.`, when: LAST("stone") },
          `${I}Last time we stood at the Stone Seal it cracked while we fought. It's worse now. The miners say the rock down there sings at night. The Miners' guild won't send anyone below forty without me, and I won't go without you.`,
          `${I}Get below y -40 first. Then to the seal. The Choir left diggers behind, sculk-blind things that wander the halls. They can't see far, but they hear a footstep. Sneak past them to the chained door. Don't fight unless you must.`,
          { text: `${I}Hollis gave me a prayer for the deep. Wrote it on a card. I don't pray. I put it in my boot anyway.`, when: { "g:hollis": "saved" } },
          { text: `${I}Moss says the chapel bell rang by itself last night. Nobody's there to ring it now. Don't think about it. I'm not.`, when: { "g:hollis": "lost" } },
        ],
        introChoices: [
          {
            id: "ask_master",
            label: "Ask about her master",
            reply: [
              `${I}Dunmore. Big hands, bad knees, sang while he worked. Off key. He forged the first relics from the stones that fell in the Long Storm. Said they were warm when he found them. Said they hummed.`,
              `${I}He never went below forty either. Said the rock down there listened back. I thought he was a superstitious old man.\n\nShe tightens a strap.\n\n${I}He was right about most things. I hate that.`,
            ],
          },
          {
            id: "ask_miners",
            label: "Ask what the miners hear",
            reply: [`${I}A song with no tune. Like a crowd humming behind a wall. Old Brannock says it calls him by his mother's name. He's sixty. He hasn't gone below the lamp line in ten years.`],
          },
        ],
        objectives: [
          { type: "reach", label: "Go deep: below y -40", belowY: -40 },
          {
            type: "stealth",
            label: "Sneak past the Choir's diggers to the Stone Seal's door",
            place: "seal_stone",
            radius: 32,
            guards: { mob: "minecraft:zombie", count: 4, name: "Sculk-Blind Digger" },
            goal: { dx: 0, dz: 0 },
            detect: 10,
            detectSneak: 4,
            onSpotted: "ambush",
          },
        ],
        outro: [
          "The chained door hangs open a hand's width. Through the gap the shrine room looks worse than you remember: the frame around the seal stone has crumbled to gravel, and sculk has crept up the walls in long blue veins, pulsing slowly, like breath.",
          `${I}Frame's gone. That's what holds the light. Without it the shard would just pour out on the floor like water.\n\nShe crouches and runs her thumb along a broken edge.`,
          `${I}Starwright work. Chiseled deepslate, polished blackstone. Old and good. My master would have wept to see it like this. We can rebuild it. Bring blocks.`,
          `Somewhere far off in the dark, past the edge of the torchlight, something clicks. A slow, deep tick, like a great clock. Ida goes very still.\n\n${I}We don't have long. It's waking up. Next time we come down here, we work fast and we work quiet.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:torch", amount: 32 }],
          codex: {
            id: "act4_stone_ear",
            title: "What the Stone Seal Does",
            text: "The Stone Seal does not hold the Hollow down. It keeps it from hearing. The Hollow listens wherever there is sound, and the sculk grows toward that listening. The Starwrights built their deepest seal as a stopper in the ear of the world. Cracked, it lets the Hollow hear again, and the Hollow sings back: the miners have heard that song in the rock since the Long Storm.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "Dig or find a cave down below y -40 (deepslate starts around y 0). At the Stone Seal, hold sneak and keep your distance from the diggers: walking, they notice you within 10 blocks; sneaking, only within 4. If they spot you, they all attack at once.",
      },
      {
        id: "stone_frame",
        title: "The Frame of the Deep",
        npc: "ida",
        when: NOW("stone"),
        intro: [
          `${I}Sixteen blocks. Chiseled deepslate or polished blackstone, either one. Chisel it from cobbled deepslate slabs, or polish blackstone in a stonecutter. Place them around the seal stone. I'll chalk the lines.`,
          `${I}One more thing. Don't panic.\n\nShe says it the way other people say good morning.\n\n${I}When we hammer, it hears. The Warden. It's an ear, Elsie says. Something under the world listening through it.`,
          `${I}When it comes, we sneak and we keep still. Not a step. Not a breath you don't need. It goes when it hears nothing. It always goes.\n\nShe checks her own boots twice.`,
          { text: `${I}And don't hit it. I know you. Some things you don't win by hitting.`, when: { "g:iron": ">=4" } },
          { text: `${I}You're good at being gentle. Be gentle with the floor.`, when: { "g:mercy": ">=4" } },
        ],
        introChoices: [
          {
            id: "ask_scared",
            label: "Ask Ida if she's scared",
            reply: [`${I}Yes.\n\nThat's all she says for a while. Then:\n\n${I}Scared is fine. Scared keeps your feet quiet. It's the brave ones who get loud. Be scared with me. Quietly.`],
          },
          {
            id: "promise_watch",
            label: "Tell her you'll watch her back",
            reply: [`${I}Good. I'll watch the frame. You watch the dark. If it comes, tap my shoulder twice and get down.\n\nShe almost smiles.\n\n${I}Dunmore and I used to do that. He tapped too hard. You tap soft.`],
          },
        ],
        objectives: [
          { type: "place", label: "Rebuild the seal frame: place 16 chiseled deepslate or polished blackstone", blocks: ["minecraft:chiseled_deepslate", "minecraft:polished_blackstone"], count: 16, place: "seal_stone", radius: 12 },
          { type: "vigil", label: "The Warden is near: sneak and keep still by the seal for 60 seconds", place: "seal_stone", radius: 6, seconds: 60, sneaking: true },
        ],
        outro: [
          "For a full minute something enormous breathes in the dark beyond the chained door. You hear its heartbeat in the floor, in the new frame, in your own knees. It sniffs the air an arm's length from your face. Then, slowly, it turns away, and the heartbeat sinks back into the stone.",
          `${I}...There. Told you. It goes.\n\nHer hands are shaking. She looks at them as if they belong to someone else, then stuffs them into her apron pockets.`,
          `${I}Frame's whole. Good blocks. Good work. My master forged the first relics from Lantern shards, you know. He said they felt alive. I think they were remembering this. Now the light.`,
        ],
        reward: {
          levels: 6,
          crowns: 90,
          items: [{ item: "minecraft:diamond", amount: 2 }],
          codex: {
            id: "act4_warden_ear",
            title: "The Ear of the Hollow",
            text: "The Warden is not the Hollow, only one of its ears. It goes where sound is and carries what it hears down to the hunger at the bottom of the world. It cannot see. The Starwrights learned to work the deep in silence, and they built the Stone Seal's frame of chiseled deepslate and polished blackstone because, they wrote, the dark stone does not echo.",
          },
        },
        rep: [{ guild: "miners", amount: 10 }],
        hint: "Craft chiseled deepslate from two cobbled deepslate slabs, or polished blackstone from four blackstone (a stonecutter does both). Place 16 within 12 blocks of the seal. Then stand within 6 blocks of the seal and hold sneak for a full minute.",
      },
      {
        id: "stone_light",
        title: "The Stone Remembers",
        npc: "ida",
        when: NOW("stone"),
        intro: [
          `${I}The seal stone has words cut in it. Starwright letters. Elsie read me the first line years ago, when I was an apprentice and didn't think to ask why an innkeeper could read them.`,
          `${I}It asks a question. Answer right, and the stone opens to the light. Answer wrong and it calls whatever is close. Elsie says the question is old. The answer is older.`,
          `${I}Think about where you are. Think about what kept you alive past the Warden. Then light it: the shard against the reinforced stone, corner by corner.`,
          { text: `${I}You silenced a bell once. You know what quiet costs. That should help.`, when: { "drowned_bell.bell": "silence" } },
          { text: `${I}You gave a bell its voice once. Now you need the opposite. Funny trade, ours.`, when: { "drowned_bell.bell": "ring" } },
        ],
        introChoices: [
          {
            id: "ask_letters",
            label: "Ask Ida what the letters say",
            reply: [`${I}Most of it I can't read. The first line Elsie told me: HERE THE WORLD STOPS ITS EARS. The last line is newer. Scratched, not carved. Dunmore's hand, I think.\n\nShe swallows.\n\n${I}It says I WAS HERE. I LISTENED. FORGIVE ME.`],
          },
          {
            id: "ask_wrong",
            label: "Ask what happens if you answer wrong",
            reply: [`${I}The stone calls whatever is close. Diggers, mostly. Maybe worse. So answer right.\n\nShe hands you her second-best sword without looking at you.\n\n${I}Or answer wrong and swing hard. Either way, I'm here.`],
          },
        ],
        objectives: [
          {
            type: "answer",
            label: "Answer the seal stone's question",
            place: "seal_stone",
            radius: 8,
            question: "Cut into the seal stone, in letters that seem to shift while you read them: I am broken the moment you name me. The deep is made of me. The Hollow starves on me. What am I?",
            answers: ["silence", "quiet", "stillness", "the silence"],
            failSpawn: { mobs: ["minecraft:zombie"], count: 3 },
          },
          { type: "interact", label: "Relight the Stone Seal: hit its reinforced deepslate 4 times", place: "seal_stone", blocks: ["minecraft:reinforced_deepslate"], count: 4, radius: 10 },
        ],
        outro: [
          "Light runs out of the shard and into the new frame like water finding a channel. Every chiseled line glows blue-white. The sculk on the walls curls back from it, hissing softly, and the seal stone hums one deep note you feel in your back teeth.",
          `${I}Listen.\n\nYou do. For the first time since you came down, the rock is not singing. It is only rock, cold and heavy and blessedly quiet.`,
          `${I}Forty years the miners heard that song. Forty years they boarded up tunnels and pretended. Tonight they'll sleep.`,
          { text: `${I}One seal. Two to go. I'm going to sleep for a day. Then I'm going to sharpen everything you own.`, when: FIRST("stone") },
          { text: `${I}Two seals. One left. Go. I'll sharpen your sword before you leave. Don't argue.`, when: SECOND("stone") },
          { text: `${I}Three. That's all of them. Go tell Elsie before I start crying in front of you.`, when: LAST("stone") },
        ],
        choices: sealChoices("stone"),
        reward: {
          levels: 8,
          crowns: 120,
          items: [
            { item: "minecraft:echo_shard", amount: 1, name: "Stone Key", lore: ["The Stone Seal's key, relit.", "Hold it to your ear: nothing at all."] },
            { item: "minecraft:diamond", amount: 3 },
          ],
          codex: {
            id: "act4_stone_question",
            title: "The Stone's Question",
            text: "The Stone Seal opens only to someone who knows what the Hollow cannot bear: silence. The Starwrights cut the question into the seal stone so that only those who had learned to be quiet in the deep could relight it. Relit, the seal stops the Hollow's ear again, and the singing in the rock that the miners heard for forty years falls silent.",
          },
        },
        rep: [{ guild: "miners", amount: 25 }],
        hint: "The answer is one word: the thing the Warden cannot find you in. Type it when the stone asks. Then hit the reinforced deepslate blocks of the shrine 4 times.",
      },

      // 8-10. The Sky Seal (Sol and the Wayfarers).
      {
        id: "sky_stair",
        title: "The Stair to the Sky",
        npc: "sol",
        when: NOW("sky"),
        intro: [
          { text: `§eSol§r is on the inn roof with a spyglass when you find him.\n\n${S}The sky first. Of course. You were always going to look up.`, when: FIRST("sky") },
          { text: `§eSol§r is on the inn roof with a spyglass.\n\n${S}One seal sings already. I heard it in the starlight last night: Vega flickered, just once, like a wink. Now the high road.`, when: SECOND("sky") },
          { text: `§eSol§r is on the inn roof, spyglass in hand.\n\n${S}Two seals singing, and the third is mine: the highest, and the last. Deneb is very bright tonight. I think it is showing off for you.`, when: LAST("sky") },
          `${S}The Sky Seal is a ring of quartz and glass floating far above the clouds, higher than two hundred. The Starwrights built it closest to where the Lantern passes, so its light would land there first.`,
          `${S}You will have to climb. Scaffolding, a pillar, a mountain, wings if you have them. I do not mind how. Go above y 200, and then, at night, stand near the ring and watch the sky with me.`,
          `${S}The Wayfarers have offered rope and ladders. They say anyone who climbs that high deserves a song. They also say they will not be climbing it themselves.`,
        ],
        introChoices: [
          {
            id: "ask_heights",
            label: "Ask Sol if he's afraid of heights",
            reply: [`${S}Terribly. I have been afraid of heights my whole life. It is very inconvenient for an astronomer.\n\nSol shrugs.\n\n${S}But the stars do not come down to visit, so someone has to go up. I will follow your climb. Slowly. With my eyes closed for parts of it.`],
          },
          {
            id: "ask_ring",
            label: "Ask how Sol found the ring",
            reply: [
              `${S}Fenn and I argued for nineteen years about a patch of sky where the stars bent, just slightly, as if seen through old glass. He said it was my spyglass. I said it was the sky. We were both stubborn.`,
              `${S}It was the ring. Glass and quartz, turning so slowly that only the stars behind it gave it away. I wish I could tell him I was right. I would be insufferable about it. He would have loved that.`,
            ],
          },
        ],
        objectives: [
          { type: "reach", label: "Climb above y 200", aboveY: 200 },
          { type: "vigil", label: "Watch the night sky outdoors near the Sky Seal (90 seconds)", place: "seal_sky", radius: 40, seconds: 90, timeOfDay: [13000, 23000], outdoors: true },
        ],
        outro: [
          "From up here the world is a dark map, and the Lantern is enormous: a pale smear across half the sky with a tail like a torn veil. Below it the Sky Seal turns slowly in the starlight, a broken ring with a gap where a bridge used to be.",
          `Sol's voice comes up the climb behind you, out of breath.\n\n${S}Look at the gap. The bridge fell. Forty years ago, I think, the night the Lantern cracked. We will have to build it again.`,
          `${S}Also, there are things in the gap. Long things, with wings. Altair is hiding behind one of them right now. I do not like it.`,
          `${S}Go down and rest. Bring glass next time, and quartz, and something sharp for the winged things. I will stay and draw the gap so we know exactly how much bridge we owe the sky.`,
        ],
        reward: {
          levels: 5,
          crowns: 70,
          items: [{ item: "minecraft:scaffolding", amount: 32 }],
          codex: {
            id: "act4_sky_ring",
            title: "The Sky Seal",
            text: "The Sky Seal is a ring of quartz and glass floating above the clouds, crowned with end rods, turning so slowly that only the stars behind it give it away. The Starwrights built it highest so the Lantern's light would strike it first and pass down to the other two seals. When the Lantern cracked, the ring's bridge fell, and the ring has turned broken ever since.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 10 }],
        hint: "Build up anywhere: the height goal counts wherever you are, but near the Sky Seal is best, and the tracker points to it. Once above y 200, wait for night and stay outdoors within 40 blocks of the ring for a minute and a half. Bring a water bucket or slow falling.",
      },
      {
        id: "sky_bridge",
        title: "A Bridge of Glass",
        npc: "sol",
        when: NOW("sky"),
        intro: [
          `${S}Quartz and glass. That is what they built with. Twenty-four blocks across the gap and the ring will close. Quartz blocks, glass, stained glass: whatever you have. The ring is not proud.`,
          `${S}And the winged things. Phantoms, drawn up by the Lantern's light, and with them something worse: vexes, little gray spites the Choir sends where it cannot climb itself.`,
          `${S}The largest phantom wears the Lantern's light on its back like a stolen coat. The Wayfarers call it the Lantern Thief. They do not call it anything kind after that.`,
          { text: `${S}Quill sent up a crate. Fireworks, a crossbow, and a note: Don't ask where I got it. I have not asked. The note also says he would like the crate back.`, when: { "g:quill": "trusted" } },
          { text: `${S}Reyes sent up arrows. Quill used to sell the good ones; Reyes says these will have to do. They are a little crooked. Like the Little Dipper.`, when: { "g:quill": "exposed" } },
        ],
        introChoices: [
          {
            id: "ask_vexes",
            label: "Ask what vexes are",
            reply: [`${S}Little gray spites with swords and no mercy. The Choir's evokers call them up out of nothing. Nothing is where they go back to when they are hurt enough. They fly through walls, so do not trust a wall. Trust a shield.`],
          },
          {
            id: "ask_phantoms",
            label: "Ask why phantoms come for the light",
            reply: [`${S}Phantoms come to the sleepless. Down in town they hunt people who have not rested in three nights. Up here they hunt the Lantern itself: it has not slept in forty years. Neither has Elsie. I try not to think about what that means.`],
          },
        ],
        objectives: [
          {
            type: "place",
            label: "Bridge the gap: place 24 quartz or glass blocks at the Sky Seal",
            blocks: [
              "minecraft:quartz_block",
              "minecraft:smooth_quartz",
              "minecraft:quartz_pillar",
              "minecraft:chiseled_quartz_block",
              "minecraft:quartz_bricks",
              "minecraft:glass",
              "minecraft:tinted_glass",
              ...["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"].map((c) => `minecraft:${c}_stained_glass`),
            ],
            count: 24,
            place: "seal_sky",
            radius: 16,
          },
          {
            type: "defeat",
            label: "Defeat the Lantern Thief at the Sky Seal",
            place: "seal_sky",
            radius: 48,
            count: 1,
            champion: {
              tag: "realm:saga:lantern_thief",
              mob: "minecraft:phantom",
              name: "The Lantern Thief",
              warn: "A long shadow crosses the Lantern. Something up here is wearing its light.",
              health: 30,
              adds: { mobs: ["minecraft:vex", "minecraft:phantom"], count: 6 },
            },
          },
          { type: "defeat", label: "Defeat 4 of its vexes and phantoms", mobs: ["minecraft:vex", "minecraft:phantom"], count: 4, place: "seal_sky", radius: 48, spawn: { count: 2, every: 15, warn: "Vexes and phantoms peel off the Lantern Thief's shadow and dive at you." } },
        ],
        outro: [
          "The last block of glass clicks into place and the ring is whole. The Lantern Thief's stolen light pours out of it as it falls, scattering like sparks, and every one of those sparks drifts back toward the ring.",
          `${S}Did you see? The light wanted to come home. Everything does, in the end. Even light. Especially light.`,
          `${S}Now stand in the middle of the ring with the shard. I think it is going to show you something. I think it has waited a very long time to show someone.`,
          { text: `${S}Before you do: Quill's note had a second page. It says, Tell the hero the crossbow is a loan. Tell the hero I'm proud of them. Then cross out the second part. He did not cross it out.`, when: { "g:quill": "trusted" } },
          { text: `${S}Before you do: Reyes asked me to tell you the arrows were her own. She fletched them herself, at night, after her watch. That is why they are crooked. Do not tell her I told you.`, when: { "g:quill": "exposed" } },
        ],
        reward: {
          levels: 6,
          crowns: 90,
          items: [{ item: "minecraft:arrow", amount: 32 }],
          codex: {
            id: "act4_lantern_thief",
            title: "The Lantern Thief",
            text: "Phantoms rose to the Sky Seal drawn by the Lantern's light, and the largest of them wore a scrap of that light on its back. The Gray Choir sent vexes after it. With the thief gone and the bridge of quartz and glass rebuilt, the stolen light drifted home to the ring.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 10 }],
        hint: "Bring 24 quartz blocks or glass (clear, tinted, white, light gray, light blue or yellow) and place them within 16 blocks of the ring. The Lantern Thief comes when you are near: fight on a wide platform with a bow, and bring slow falling or a water bucket.",
      },
      {
        id: "sky_vision",
        title: "The Lantern's Long Road",
        npc: "sol",
        when: NOW("sky"),
        intro: [
          `${S}Everything the Lantern has seen, it remembers. Elsie told me that once, when I was very small and she was exactly as old as she looks now.\n\nSol stops.\n\n${S}Which is strange, now that I say it out loud.`,
          `${S}Stand in the ring. Hold up the shard. Let it show you. I will stay right here, counting stars, so you have something to come back to.`,
          `${S}Then light the crown: the end rods at the top of the ring. Tap them with the shard in hand, all four. Arcturus first, if you are being proper. Nobody is.`,
          { text: `${S}You are gentle with broken things. That is good. The Lantern is the most broken thing I know.`, when: { "g:mercy": ">=4" } },
          { text: `${S}You have a hard way about you lately. Leave it outside the ring, if you can. The Lantern has been hurt enough.`, when: { "g:iron": ">=4" } },
        ],
        introChoices: [
          {
            id: "ask_afraid",
            label: "Ask Sol what he's afraid you'll see",
            reply: [`${S}That it was always going to break. That the Starwrights knew, and built it anyway, and hoped.\n\nSol turns the spyglass over and over.\n\n${S}No. I am afraid it will be beautiful, and I will not be able to see it, and you will not have the words to tell me. Try anyway.`],
          },
          {
            id: "ask_stars",
            label: "Ask Sol to name the stars above the ring",
            reply: [`${S}Vega, the harp. Deneb, the swan's tail. Altair, the eagle's eye. Arcturus, the bear's keeper. And there, low, the Lantern, which has no name in any book in town, because the only person who remembers its name runs an inn.`],
          },
        ],
        objectives: [
          {
            type: "vision",
            label: "Stand in the Sky Seal's ring and let the shard show you",
            place: "seal_sky",
            radius: 8,
            scenes: [
              { title: "Ages ago", text: "People in pale robes stand on a mountaintop, reading the sky with instruments of brass and glass. They are the Starwrights. Far below them, under all the world, something vast is listening.", sound: "ambient.cave", seconds: 7 },
              { title: "The binding", text: "They cannot kill the Hollow. So they build: a vault under the sea, a room under the stone, a ring in the sky. Then they wait for a comet that passes once every forty years.", seconds: 7 },
              { title: "The Lantern", text: "The comet comes. Its light pours down through the ring, through the stone, through the sea, and far below, the listening dark closes its ears and sleeps.", sound: "beacon.activate", seconds: 7 },
              { title: "Forty years, again and again", text: "Pass after pass, the Starwrights grow old and few. At the last good pass there is only one keeper on the mountain: a young woman with a sliver of light sewn into her apron hem. Elsie.", seconds: 8 },
              { title: "The Long Storm", text: "A bell rings wrong from a harbor tower. The Lantern shudders, cracks, and breaks across the sky. Its pieces fall burning into the sea and onto the land. On the mountain, Elsie screams.", sound: "block.bell.hit", seconds: 7 },
              { title: "After", text: "Elsie walks down off the mountain alone, the apron's light flickering. She finds a harbor town with a broken tower and a drowned bell, and she opens an inn across from the chapel, and she waits. And waits.", seconds: 8 },
              { title: "Now", text: "The Lantern comes again, cracked and smaller, but coming. Three seals wait for it. And at the bottom of the world, something is waiting too.", sound: "mob.warden.heartbeat", seconds: 7 },
            ],
          },
          { type: "interact", label: "Light the crown: hit the Sky Seal's 4 end rods", place: "seal_sky", blocks: ["minecraft:end_rod"], count: 4, radius: 10 },
        ],
        outro: [
          "The end rods blaze. A thin white line of light shoots up from the crown of the ring, straight toward the Lantern, and for one heartbeat the comet seems to lean down to meet it.",
          `${S}You saw her, didn't you. Elsie, on the mountain. I saw it on your face.\n\nSol sits down on the new glass bridge, legs dangling over a two-hundred-block drop, as calm as if it were a garden wall.`,
          `${S}She was there at the last pass, and the one before, and the one before that. She has been keeping this sky longer than there have been names for its stars.`,
          { text: `${S}One seal sings. Two to go. I will stay up here a while. The view is better when nobody is falling.`, when: FIRST("sky") },
          { text: `${S}Two seals sing. One left. Go. I will be up here, counting down for you.`, when: SECOND("sky") },
          { text: `${S}All three seals sing. Listen. Go to Elsie. Tell her she does not have to keep watch alone anymore.`, when: LAST("sky") },
        ],
        choices: sealChoices("sky"),
        reward: {
          levels: 8,
          crowns: 120,
          items: [
            { item: "minecraft:amethyst_shard", amount: 1, name: "Sky Key", lore: ["The Sky Seal's key, relit.", "It is warm, like a hand."] },
            { item: "minecraft:firework_rocket", amount: 16 },
          ],
          codex: {
            id: "act4_lantern_history",
            title: "The Lantern's Long Road",
            text: "The Lantern is a comet that has passed over the world every forty years since the Starwrights bound the Hollow. Each pass, its light ran through the Sky, Stone and Tide Seals, and the Hollow slept again. The Starwrights dwindled until one keeper was left: Elsie. Forty years ago Ashgrave's broken note cracked the Lantern and its pieces fell as meteors. It returns now cracked and smaller, but it returns.",
          },
        },
        rep: [{ guild: "wayfarers", amount: 25 }],
        hint: "Stand within 8 blocks of the middle of the Sky Seal ring and the vision starts. Afterward, hit the 4 end rods at the ring's crown (they pop off; put them back if you like).",
      },

      // 11. Elsie's choice.
      {
        id: "promise",
        title: "Elsie's Choice",
        npc: "elsie",
        intro: [
          `${E}Three seals lit, starling. Three keys warm, and the Lantern close enough to read by. And Sol told me what you saw in the ring, so you know how old I am.\n\nShe touches the hem of her apron. A thread of starlight glows through the cloth.`,
          `${E}A sliver of the Lantern. My mother sewed it there on the last good pass, to keep the watch going one more lifetime. It kept me young. It kept me here. It may be the last whole piece of the Lantern in the world.`,
          { text: `${E}When I told you the truth, you forgave me. Forty years of silence, and you forgave me in an afternoon. I am going to ask you to be kind once more, in a way that won't feel like it.`, when: { "act3_deep.elsie": "forgive" } },
          { text: `${E}When I told you the truth, you said I should have spoken forty years ago. You were right. So I will not keep anything from you now, even this. I am going to ask you for something hard, and I am sorry for it.`, when: { "act3_deep.elsie": "condemn" } },
          `${E}But not tonight. Go and see Wren; she knows something is wrong and won't ask me. Bring me a pie, Bea's recipe, not mine. Then sleep. I want to ask you in the morning, with a clear head. Mine, not yours.`,
        ],
        introChoices: [
          {
            id: "ask_mother",
            label: "Ask about her mother",
            reply: [
              `${E}Her name was Ilse. She read the sky the way Bea reads a stew: by smell, by feel, by being stubborn. She taught me every star by its old name, and then made me learn the new ones too, so I would never be lonely in a new town.`,
              `${E}She sewed this hem by lamplight the night before the pass. Her hands were shaking. I thought it was the cold. It wasn't the cold.`,
            ],
          },
          {
            id: "ask_wren",
            label: "Ask what Wren knows",
            reply: [`${E}That I'm older than I look. That I cry in the cellar sometimes. That I love her more than every star in the sky put together. The first two she guessed. The last one I tell her every night, whether she wants to hear it or not.`],
          },
        ],
        objectives: [
          { type: "talk", label: "Go and see Wren", npc: "wren" },
          { type: "deliver", label: "Bring Elsie a pumpkin pie", npc: "elsie", item: "minecraft:pumpkin_pie", count: 1 },
          {
            type: "sleep",
            label: "Sleep through the night",
            vision: [
              { title: "A dream", text: "You stand on a mountain under strange stars. A young woman in an apron puts a lantern into your hands and says, in a language you somehow understand: Keep it lit. Whatever it costs, keep it lit.", seconds: 7 },
              { text: "She turns, and she is Elsie, and she is old, older than the mountain, older than the sea. She says: I am so tired, starling. Then the lantern in your hands goes out.", seconds: 7 },
            ],
          },
        ],
        outro: [
          "In the morning Elsie is waiting at the long table, the pie untouched, her hands folded over the starlit hem.",
          `Wren told you, before you slept, that Elsie sings to herself sometimes in a language nobody knows. "She's sad when she does it," Wren said, "but a nice sad. Like rain on the stable roof. I named the song Rainy. Don't tell her."`,
          `${E}When the Lantern passes, if the keys are not enough, if the seals fail, there is one more way. The sliver can become a seal, if a Starwright holds it. It would bind the Hollow for a thousand years, not forty. It would cost exactly one innkeeper.`,
          `${E}I am not asking you to let me die. I am asking you to let me choose, if it comes to that. Promise me you won't stop me. Or tell me no, and I will listen to you. I have been alone with this for a very long time.`,
        ],
        choices: [
          {
            id: "allow",
            label: "Promise to let her choose",
            set: { "act4:promise": "allow" },
            inc: { "g:iron": 1 },
            rep: [{ guild: "wayfarers", amount: 20 }],
            reply: [
              `${E}Thank you.\n\nShe lets out a breath she has been holding for forty years.\n\n${E}It probably won't come to it. Probably. Now eat. You look like a ghost, and I would know.`,
            ],
          },
          {
            id: "refuse",
            label: "Refuse: nobody else dies for the seals",
            set: { "act4:promise": "refuse" },
            inc: { "g:mercy": 1 },
            rep: [{ guild: "wardens", amount: 20 }],
            reply: [
              `${E}No?\n\nFor a moment she looks angry. Then she looks a hundred years younger.\n\n${E}No. All right. Then we find another way, you and I. Now eat. You look like a ghost, and I would know.`,
            ],
          },
        ],
        reward: {
          levels: 6,
          crowns: 100,
          codex: {
            id: "act4_sliver",
            title: "The Sliver in the Apron",
            text: "On the last good pass of the Lantern, Elsie's mother sewed a sliver of the comet into her daughter's apron hem so the watch would go on. It has kept Elsie young and alive for centuries. It may be the last whole piece of the Lantern. Held by a Starwright, it can become a seal itself, binding the Hollow for a thousand years instead of forty, at the cost of the Starwright who holds it.",
          },
        },
        hint: "Wren is usually at the stables or near her meadow; the tracker points to her. Bake a pumpkin pie (pumpkin, sugar and an egg) and bring it to Elsie, then sleep in any bed at night.",
      },

      // 12. The gate opens.
      {
        id: "gate",
        title: "The Gate Opens",
        npc: "reyes",
        end: "elsie",
        sky: [{ kind: "meteor", place: "hollow_gate", burst: true }],
        intro: [
          "The night after Elsie's question, the sky splits. A meteor tears across the Lantern's tail and comes down far beyond the edge of town, with a sound like the biggest door in the world slamming shut. Or open.",
          `${R}It hit the old black arch past the wastes. The Hollow Gate, Mara calls it. My scouts say the ground there is still hot, and it's singing. Not the Choir. The ground.`,
          `${R}Go and look. Not alone, if I had my way, but I never get my way with you. Take what you need from the armory. The Choir will be there already. They always are.`,
          { text: `${R}And Sol's up on the lighthouse swearing there's more of it still coming, right down the same track. If the sky lights up over the arch again, that's why. Don't stand under it.`, when: { "pack:meteor_bp": "on" } },
          { text: `${R}Quill's people saw Choir boats heading upriver an hour before the meteor. They knew where it would fall. Your smuggler earned his keep tonight. Don't tell him I said so.`, when: { "g:quill": "trusted" } },
          { text: `${R}And we're half blind. Quill used to tell us where the Choir's boats ran. Now he's in a cell and they run where they like. I'm not saying it was the wrong call. I'm saying it has a price.`, when: { "g:quill": "exposed" } },
          { text: `${R}Bram's ringing the square bell to call everyone in. Since you told the town the truth about the Long Storm, they come when he rings. Nobody's pretending anymore. It helps.`, when: { "act2_choir.mayor": "truth" } },
          { text: `${R}Bram's telling the town it was "a bit of weather." They don't believe him. You kept the truth buried, and now it's coming up out of the ground on its own. He'll have to tell them soon.`, when: { "act2_choir.mayor": "bury" } },
        ],
        introChoices: [
          {
            id: "ask_town",
            label: "Ask Reyes to guard the inn while you're gone",
            reply: [`${R}Already done. Two wardens on the inn door, one on the roof, and Bea with a cleaver in the kitchen, which frankly scares me more than the wardens.\n\nShe pauses.\n\n${R}Nobody touches Elsie. That's an order. Not mostly. Entirely.`],
          },
          {
            id: "ask_hollis",
            label: "Ask Reyes to keep Hollis safe",
            requires: { flags: { "g:hollis": "saved" } },
            reply: [`${R}Hollis is in the chapel with Moss, praying and pretending he isn't scared. I've put a warden outside. If the Herald so much as whispers through that boy again, Moss has orders to hit him with a shovel. Gently.`],
          },
          {
            id: "ask_choir",
            label: "Ask how many of the Choir are left",
            reply: [`${R}Fewer than before the Gray Ring burned. More than I'd like. The hard ones are left now, the ones who really believe. People who think the end of the world is a kindness don't run when you shout at them.`],
          },
        ],
        objectives: [
          { type: "reach", label: "Go to the Hollow Gate", place: "hollow_gate", radius: 24 },
          {
            type: "inspect",
            label: "Search the meteor's landing around the gate",
            place: "hollow_gate",
            radius: 16,
            clues: [
              { dx: 0, dz: 0, text: "The meteor lies in the pit under the arch, still glowing. It is a piece of the Lantern, cracked forty years ago and only now arriving. Soul fire licks around it and cannot burn it." },
              { dx: 6, dz: -3, text: "A hymn page, nailed to the arch: WHEN THE LANTERN PASSES, RING THE BROKEN NOTE. NOTHING LOST. NOTHING MISSED. The handwriting is shaky, as if written in the dark." },
              { dx: -5, dy: 1, dz: 4, text: "The crying obsidian is warm. When you touch it you hear, very faintly, a bell. Not the harbor bell. The wrong note, over and over, slow as a heartbeat." },
              { dx: 3, dz: 6, text: "A Choir camp, left in a hurry: bedrolls, a cold fire, and a child's drawing of the inn with a gray figure standing on its roof. Underneath, in careful letters: THE KEEPER WILL COME HOME." },
            ],
          },
          { type: "defeat", label: "Drive the Gray Choir from the gate: defeat 12", mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 12, place: "hollow_gate", radius: 48, spawn: { count: 4, every: 20, warn: "The Gray Choir holds the gate. They raise their crossbows." } },
        ],
        outro: [
          "When the last of the Choir runs, the soul fire in the pit flares tall and blue, and a voice rises out of the dark. Everyone in town hears it at once: Bea in the kitchen, Reyes on the wall, Tobin on the dock, Wren in the hay.",
          { text: `${HER}Little lamplighter. You took my boy Hollis from me. No matter. I need only one bell and one night. Three seals, three keys. You have been so busy.`, when: { "g:hollis": "saved" } },
          { text: `${HER}Little lamplighter. My boy Hollis sings for me now. He has a lovely voice. You will hear it on Lantern Night. Three seals, three keys. You have been so busy.`, when: { "g:hollis": "lost" } },
          `${HER}When the Lantern passes I will ring the broken note, and the Hollow will wake, and nothing will ever be lost again. Come to the gate. Bring your keys. Bring your innkeeper.`,
          `${E}That was Ashgrave. I knew his voice when he was a boy singing in the chapel choir.\n\nShe pins a small silver star to your coat.\n\n${E}Lantern Night is days away, not weeks. Bram is calling the town together. You have earned a name, starling: Sealwarden.`,
        ],
        reward: {
          levels: 10,
          crowns: 250,
          title: "Sealwarden",
          items: [{ item: "minecraft:golden_apple", amount: 3 }],
          journal: { entry: "act4_seals", label: "The Three Seals" },
          codex: {
            id: "act4_hollow_gate",
            title: "The Hollow Gate",
            text: "With all three seals relit, the last falling piece of the Lantern struck the Hollow Gate, a blackened arch of crying obsidian and sculk over a pit of soul fire. Through it the Herald, who was once Brother Ashgrave, spoke to the whole town. He means to ring the broken note again when the Lantern passes, and he has asked for the keys and for Elsie by name.",
          },
        },
        rep: [{ guild: "wardens", amount: 20 }],
        hint: "The Hollow Gate is far out, {band:hollow_gate} blocks from spawn; the tracker points the way, and a horse, boat or elytra helps. Clues are around the arch: look for faint particles and tap near them. The Choir comes in numbers, so bring a shield.",
      },
    ],
  },
];
