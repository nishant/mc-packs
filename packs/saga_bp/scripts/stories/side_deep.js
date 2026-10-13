// Story content: see docs/STORY_BIBLE.md. Written by the side_deep writer.
// One side questline: The Listening Deep (ida), played through the Expeditions pack's dungeons. Keep every
// id (story, chapter, choice, codex) once published: players' progress is saved by them. Plain ASCII only
// (plus § color codes). It needs Act III and Expeditions installed, and can be played before, during or
// after Acts IV and V: it never resolves the Hollow.
//
// Chapters: roots, cold_store (Elsie) or cold_store_letters (Wren, after the Keeper's Gift), gauntlet, last_listen.
// Flags it reads: act3_deep.shards (depths: the echoes route), act3_deep.elsie (forgive | condemn),
// wardens_oath.oath (shield | sword), g:ending (relight | gift | crown).
/** @typedef {import("../types.js").Story} Story */

const I = "§eIda:§r ";
const E = "§eElsie:§r ";
const R = "§eReyes:§r ";
const W = "§eWren:§r ";

const GIFT = { "g:ending": "gift" };
const NOT_GIFT = { "g:ending": "!gift" };
const START = "Run /realm:expedition and tap Start an expedition, then pick the dungeon and a difficulty.";

/** @type {Story} */
const LISTENING_DEEP = {
  id: "listening_deep",
  title: "The Listening Deep",
  short: "Listening Deep",
  giver: "ida",
  kind: "side",
  tones: ["exploration", "dangerous", "eerie"],
  summary: "Ida's Lantern of the Deep has started humming again, and it hums toward the expedition dungeons.",
  requires: { stories: ["act3_deep"], flags: { "pack:expedition_bp": "on" } },
  chapters: [
    // 1 ---------------------------------------------------------------------------------------------
    {
      id: "roots",
      title: "Roots",
      npc: "ida",
      intro: [
        `§eIda§r has the Lantern of the Deep hanging from a hook over the anvil. It is turning, slowly, by itself, like a compass needle that can't settle.\n\n${I}Started three nights ago. Always comes to rest the same way. Toward the expedition dungeons.`,
        { text: `${I}You've been down to the Sculk Depths once already. You know the place. The lamp wants to go back. I don't like it when lamps want things.`, when: { "act3_deep.shards": "depths" } },
        { text: `${I}The Sculk Depths. The parties come back pale and won't say why. Echo walls, all the way down. The lamp wants to go there. I don't like it when lamps want things.`, when: { "act3_deep.shards": "!depths" } },
        `${I}Clear the Depths. Any difficulty, I'm not proud. Take the lamp. Come back and we'll hear what it carried home. Exactly. Don't make it prettier.`,
      ],
      objectives: [
        {
          type: "event",
          label: "Clear the Sculk Depths expedition (any difficulty)",
          quest: { pack: "expedition_bp", id: "expedition_sculk_depths" },
          hint: `${START} Pick the Sculk Depths; any difficulty counts once its boss, the Listener, falls.`,
        },
      ],
      outro: [
        `§eIda§r hangs the lamp back on its hook. It has stopped turning. It plays.\n\n§7An echo, long ago: Starwrights kneel in a ring on a sculk floor, ears pressed to the stone. Nobody sings. They are only listening.`,
        "§7Under them you hear it too: roots. Not of trees. Something reaching, slow and patient, through every crack in the deep, toward every cave, every mine, every quiet place.\n\nOne of them lifts her head. 'It grows toward sound. Wherever we dig, it follows. So we must be quiet where we dig.'",
        `The echo fades. Ida's hammer stays down.\n\n${I}Roots. Under everything. And the Starwrights' answer was to be quiet.`,
        `${I}The sculk in those dungeons isn't decoration, then. It's the Hollow's roots, reaching up toward the noise. Every party that goes down there is a lot of noise.`,
        `${I}Good. Let it reach for us. Better us, with swords, than the miners with lunch pails. But I want to know where else it reaches. Elsie will know. She was there.`,
      ],
      reward: {
        levels: 3,
        crowns: 40,
        codex: {
          id: "deep_roots",
          title: "The Hollow's Roots",
          text: "An echo the Lantern of the Deep played after the Sculk Depths: Starwrights kneeling on sculk, listening. Under them, something like roots reached through every crack in the deep toward every cave and mine. It grows toward sound. The Starwrights' only answer was to be quiet where they dug.",
        },
      },
      rep: [{ guild: "miners", amount: 10 }],
      hint: `${START} Pick the Sculk Depths at any difficulty and beat its boss, then come back to Ida. Bring friends: everyone in the party gets the credit.`,
    },

    // 2 ---------------------------------------------------------------------------------------------
    {
      id: "cold_store",
      title: "The Hollow Under the Ice",
      npc: "elsie",
      when: NOT_GIFT,
      intro: [
        `§eElsie§r sets a bowl of soup in front of you before you can open your mouth, which is how you know she already knows why you've come.\n\n${E}Roots. Ida told me. Eat first. Bad news goes down easier with barley.`,
        { text: `${E}You forgave me for the long silence, starling. So I'll not keep this one. Yes. I was there. I knelt in that ring. I was very young and very frightened.`, when: { "act3_deep.elsie": "forgive" } },
        { text: `${E}You haven't forgiven me, and you needn't. But you asked, and I've done enough keeping quiet for one life. Yes. I was there. I knelt in that ring.`, when: { "act3_deep.elsie": "condemn" } },
        `${E}After that night we kept a cold store far from any sound. A hollow under the ice, where nothing moves and nothing sings. The roots hate cold. We hid what we could not lose there: the lamp-oil for the seals, the old songbooks, our names.`,
        `${E}The expedition folk call it Frost Hollow now. They go in loud. I'd like to know if anything of ours is still listening in that ice. Go properly, mind. Not the easy way. The easy way never finds anything worth finding.`,
      ],
      objectives: [
        {
          type: "event",
          label: "Clear Frost Hollow on Normal or harder",
          quest: { pack: "expedition_bp", id: "expedition_frost_hollow", tier: "normal" },
          set: { cold: "elsie" },
          hint: `${START} Pick Frost Hollow at Normal, Hard or any Nightmare tier (Easy doesn't count).`,
        },
      ],
      outro: [
        `${E}Cold all the way through? Good. Then it's still ours.\n\nShe wraps your hands around a hot mug and holds them there.`,
        `${E}"The snow keeps old things." Fenn wrote that, did you know? He found the edge of it once and turned back. Wise man. Rude, but wise.`,
        `${E}If the roots never found the cold store in all these years, then quiet still works. That is the most hopeful thing I've heard in a century, starling. Now the Wardens want you. Reyes has a notion.`,
      ],
      reward: {
        levels: 4,
        crowns: 50,
        items: [{ item: "minecraft:mushroom_stew", amount: 2, name: "Elsie's Barley Soup", lore: ["For bad news.", "Eat first."] }],
        codex: {
          id: "deep_cold_store",
          title: "The Cold Store",
          text: "After they heard the Hollow's roots, the Starwrights hid what they could not lose in a hollow under the ice, far from any sound: lamp-oil for the seals, their songbooks, their names. The expeditions call it Frost Hollow. The roots never found it. Cold and quiet still keep the Hollow out.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: `${START} Pick Frost Hollow at Normal or harder; Easy doesn't count. Bring food and good armor.`,
    },

    // 2b (after the Keeper's Gift: Elsie is the Sky Seal now; Wren has the inn) ----------------------
    {
      id: "cold_store_letters",
      title: "The Hollow Under the Ice",
      npc: "wren",
      end: "wren",
      // Not for a player who already cleared it for Elsie before the gift ending.
      when: { "g:ending": "gift", cold: "!elsie" },
      intro: [
        `§eWren§r is behind the inn's counter on a stool, so she can see over it. She has a stack of yellow letters tied with string.\n\n${W}Ida said you'd come! These were in Elsie's room, under the floorboard with the squeak, I always knew that squeak was hiding something!`,
        `${W}They're in old writing but Sol helped me read some. She wrote about a cold store. "A hollow under the ice, where nothing moves and nothing sings." They hid stuff there. Lamp-oil and songbooks and their NAMES, why would you hide a name?`,
        `${W}The expedition people call it Frost Hollow. Elsie wrote "go properly, not the easy way," she underlined it twice. So you have to. She'd want you to. I think. I miss her. Go on, go!`,
      ],
      objectives: [
        {
          type: "event",
          label: "Clear Frost Hollow on Normal or harder",
          quest: { pack: "expedition_bp", id: "expedition_frost_hollow", tier: "normal" },
          hint: `${START} Pick Frost Hollow at Normal, Hard or any Nightmare tier (Easy doesn't count).`,
        },
      ],
      outro: [
        `${W}Was it cold? Was anything there? Did the ice remember her?\n\nYou tell her what you can. She listens with her whole face.`,
        `${W}So the roots never found it. So being quiet works! I'm going to be SO quiet. Starting tomorrow.\n\nShe folds the letters carefully, the way Elsie folded napkins.`,
        `${W}Warden Reyes was looking for you. She said it's about "the deep" and "training" and also that I talk too much. I don't. I'm efficient.`,
      ],
      reward: {
        levels: 4,
        crowns: 50,
        codex: {
          id: "deep_cold_store_letters",
          title: "The Cold Store",
          text: "After they heard the Hollow's roots, the Starwrights hid what they could not lose in a hollow under the ice, far from any sound: lamp-oil for the seals, their songbooks, their names. Elsie wrote of it in letters Wren found under her floor. The expeditions call it Frost Hollow. Cold and quiet still keep the Hollow out.",
        },
      },
      rep: [{ guild: "wayfarers", amount: 10 }],
      hint: `${START} Pick Frost Hollow at Normal or harder; Easy doesn't count. Bring food and good armor.`,
    },

    // 3 ---------------------------------------------------------------------------------------------
    {
      id: "gauntlet",
      title: "Down the Long Stair",
      npc: "reyes",
      intro: [
        `${R}Ida tells me the deep is full of roots that grow toward noise. Fine. My wardens are noise. Professional noise. So they'd better be ready for what comes up the roots.`,
        `${R}The expedition folk run something they call a Gauntlet. Room after room, no stopping, a breather every few halls. I want someone to run one and tell me if it's training or a death wish.`,
        { text: `${R}You swore as a shield. Then run it like one: get everybody in your party out the other side.`, when: { "wardens_oath.oath": "shield" } },
        { text: `${R}You swore as a sword. Then run it like one: nothing in there gets a second swing.`, when: { "wardens_oath.oath": "sword" } },
        `${R}Any dungeon. Any difficulty. Just finish it. That's an order. Mostly. And if the expedition folk have the Gauntlet shut, a plain run on Hard tells me nearly as much.`,
      ],
      objectives: [
        {
          type: "event",
          or: "run",
          label: "Finish a Gauntlet (any dungeon, any difficulty)",
          quest: { pack: "expedition_bp", gauntlet: true },
          hint: "Run /realm:expedition_gauntlet (or tap Start a Gauntlet in /realm:expedition), pick any dungeon and difficulty, and beat its boss at the end.",
        },
        {
          type: "event",
          or: "run",
          label: "Clear any expedition on Hard or harder",
          quest: { pack: "expedition_bp", id: "expedition_*", tier: "hard" },
          hint: "Pick any dungeon in /realm:expedition at Hard or a Nightmare tier and beat its boss.",
        },
      ],
      outro: [
        `${R}Well? Training or death wish?\n\nYou tell her.\n\n${R}Both. Good. That's what training is supposed to be.`,
        `${R}I'll send the recruits down in fours. If the Hollow's roots want to listen to my wardens, they'll hear a lot of shouting and very few screams. That's the job.`,
        `${R}Ida's been pacing the forge. She and the innkeeper have one more thing to ask you, and from Ida's face it's a big one.`,
      ],
      reward: { levels: 5, crowns: 60, items: [{ item: "minecraft:golden_apple", amount: 2 }] },
      rep: [{ guild: "wardens", amount: 15 }],
      hint: "A Gauntlet is a long expedition run: /realm:expedition_gauntlet, or Start a Gauntlet in /realm:expedition. Any dungeon and difficulty count once you beat the boss at the end.",
    },

    // 4 ---------------------------------------------------------------------------------------------
    {
      id: "last_listen",
      sequential: true, // the listening comes after the Nightmare run
      title: "One Last Listen",
      npc: "ida",
      intro: [
        `§eIda§r has the lamp on the anvil again. It isn't turning now. It is pointing straight down, and humming one low, steady note.\n\n${I}It wants the worst of it. The deepest, angriest run there is. Nightmare.`,
        { text: `§eElsie§r is sitting on the forge bench with her apron in her lap, which you have never seen before.\n\n${E}The Starwrights did this once, at the very end. Went as deep and as loud as they dared, then went quiet all at once, to see if the roots would draw back. I want to know if it still works.`, when: NOT_GIFT },
        { text: `${I}Elsie's letters say the Starwrights did this once, at the very end. Went as deep and loud as they dared, then went quiet all at once, to see if the roots would draw back. Wren made me read that part twice.`, when: GIFT },
        `${I}Clear any dungeon on a Nightmare tier. You'll need Hard first to open it. Then come back here and we listen. All of us, together.`,
        { text: `${I}I know what you wear on your head now. The lamp doesn't care. Neither do I, today.`, when: { "g:ending": "crown" } },
      ],
      objectives: [
        {
          type: "event",
          label: "Clear any expedition on a Nightmare tier",
          quest: { pack: "expedition_bp", id: "expedition_*", tier: "nightmare" },
          hint: "Nightmare 1 unlocks when you clear any dungeon on Hard. Then pick it in /realm:expedition. A Nightmare Sigil (dropped by bosses on Hard and Nightmare) opens one exact Nightmare run too.",
        },
        { type: "talk", label: "Sit with Elsie for the listening", npc: "elsie", when: NOT_GIFT },
      ],
      outro: [
        "You sit at the forge with the lamp between you. Ida puts out the fire. The bellows go still. For a long time there is nothing but the lamp's one low note.",
        "Then it falters. Drops. And stops. For the first time since Ida built it, the Lantern of the Deep is silent. Not dead. Just quiet, like a dog that has finally lain down.",
        { text: `${E}They drew back. The roots drew back. Not gone, starling, never gone, but back. We bought a little quiet.\n\nShe dabs her eyes with the apron.\n\n${E}You have the ears for it now. A deep-listener. We had a word for that once. It was a great honor.`, when: NOT_GIFT },
        { text: `${I}Quiet. Elsie's letters said it would go quiet if somebody was brave and loud enough first.\n\nShe looks up, as if at a star.\n\n${I}You heard that, old woman? It worked. A deep-listener, she'd call you. She had a word for everything.`, when: GIFT },
        `${I}It'll start humming again someday. Roots grow back. But not for a while. Take this. Take all of this. You've earned the quiet.`,
      ],
      reward: {
        levels: 10,
        crowns: 200,
        title: "Deep-Listener",
        items: [{ item: "minecraft:echo_shard", amount: 4 }, { item: "minecraft:diamond", amount: 4 }],
        codex: {
          id: "deep_quiet",
          title: "The Quiet",
          text: "At the very end the Starwrights went as deep and as loud as they dared, then fell silent all at once, and the Hollow's roots drew back. After a Nightmare run the Lantern of the Deep went quiet for the first time. The roots are not gone. They will grow back. But for a while, the deep is still.",
        },
      },
      rep: [{ guild: "miners", amount: 15 }, { guild: "wardens", amount: 10 }],
      hint: "Clear any dungeon on Hard to unlock Nightmare 1, then clear any Nightmare tier (/realm:expedition). Bring a party. Then come back to the forge.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [LISTENING_DEEP];
