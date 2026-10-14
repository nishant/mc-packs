// Story content: see docs/STORY_BIBLE.md. The Calling (docs/RPG_DESIGN.md section 5): one chapter, offered once a
// player's skills add up to the Calling level (`g:calling_ready`, saved from the Skills pack's realm:calling). Brother
// Hollis keeps the chapel book of the six old Callings; when the story lost him (`g:hollis` = "lost"), Moss has the
// book. The choice itself is made in the Skills pack (Choose a Calling, at Hollis or Moss): its realm:quest_done
// (`skills:calling:<id>`) counts, and `g:calling` (the id, or "none") lets the outro answer the choice.
// Keep every id (story, chapter, choice) when editing: players' progress is saved by them.
/** @typedef {import("../types.js").Story} Story */
/** @typedef {import("../types.js").Page} Page */

const H = "§eHollis:§r ";
const MO = "§eMoss:§r ";
const PICKED = { "g:calling": "!none" };
const QUEST = { pack: "skills_bp", id: "skills:calling:*" };
const CODEX = {
  id: "six_callings",
  title: "The Six Callings",
  text: "The chapel book lists six old Callings, the paths the first settlers swore to: the Delvers of the deep, the Wardens on the wall, the Pathfinders of road and coast, the Hearthkeepers of field and table, the Woodwrights of timber and orchard, and the Stormcallers who stood out in the weather. Each kept a sigil. Most were buried with their keepers.",
};

/** Hollis's answer to each Calling. @type {Page[]} */
const HOLLIS_ANSWERS = [
  { text: `${H}A Delver. Down in the dark, where the stone remembers. Take a lamp. Take two. And come back up, please. Not everyone did.`, when: { "g:calling": "delver" } },
  { text: `${H}A Warden. Reyes will be insufferable about it. Stand on the wall, then. I'll stand in the chapel. Between us we'll keep the lights on.`, when: { "g:calling": "warden" } },
  { text: `${H}A Pathfinder. Every road and every coast. Mara will want your notes. I only want you to find your way home.`, when: { "g:calling": "pathfinder" } },
  { text: `${H}A Hearthkeeper. Oh, that's a kind one. Full fields and a warm table. Bea will claim she taught you. Let her.`, when: { "g:calling": "hearthkeeper" } },
  { text: `${H}A Woodwright. The chapel pews were made by one, a hundred years ago. They still don't creak. Well. One does. Mine.`, when: { "g:calling": "woodwright" } },
  { text: `${H}A Stormcaller. Out in the weather, on purpose. I... the storms frighten me. They don't frighten you. That's good. Somebody has to listen to them who isn't afraid.`, when: { "g:calling": "stormcaller" } },
];

/** Moss's answer to each Calling. @type {Page[]} */
const MOSS_ANSWERS = [
  { text: `${MO}Delver. Good choice. I already dig holes for a living. You'll dig deeper ones. Wave if you pass anyone I know.`, when: { "g:calling": "delver" } },
  { text: `${MO}Warden. Brave. The last three Wardens are in the north row. Don't hurry to join them. Plenty of room, though.`, when: { "g:calling": "warden" } },
  { text: `${MO}Pathfinder. Wander far. The dead don't travel, so somebody should do it for them. Send postcards.`, when: { "g:calling": "pathfinder" } },
  { text: `${MO}Hearthkeeper. Feed the living. It keeps them out of my graveyard. I approve, professionally.`, when: { "g:calling": "hearthkeeper" } },
  { text: `${MO}Woodwright. Wonderful. I always need good boxes. Kidding. Mostly. Plant a tree for me now and then.`, when: { "g:calling": "woodwright" } },
  { text: `${MO}Stormcaller. Lightning likes graveyards, you know. All that iron in the fences. Come stand out here with me some night. We'll see who it picks.`, when: { "g:calling": "stormcaller" } },
];

/** @type {Story} */
const CALLING = {
  id: "the_calling",
  title: "The Calling",
  short: "The Calling",
  giver: "hollis",
  tones: ["warm", "mystery"],
  summary: "Brother Hollis keeps an old book of the six Callings. He thinks you're ready for one.",
  requires: { flags: { "g:calling_ready": "1", "pack:skills_bp": "on" } },
  chapters: [
    {
      id: "chapel_book",
      title: "The Chapel Book",
      when: { "g:hollis": "!lost", "g:called": "!1" },
      intro: [
        `${H}{player}, may I show you something? It's under the altar cloth. Careful, the spine is older than the chapel. Older than the town, maybe.`,
        `${H}It's a book of Callings. Six of them. The first settlers swore to one each: delving, warding, pathfinding, keeping the hearth, working wood, calling storms. Each kept a sigil, and the sigil kept them.`,
        `${H}I've watched you. You mine, you fight, you fish, you walk farther than anyone. You're ready for one. I'd be honored to write your name next to it. Choose when you're ready. Ask me, and I'll read you each page.`,
        { text: `*His voice drops, flat and cold.* Six doors, and every one of them opens onto water.\n\n${H}...Sorry. Sorry. I don't know why I said that. Choose. Please.`, when: { "g:ending": "crown" } },
      ],
      objectives: [
        { type: "event", or: "pick", label: "Choose your Calling: tap Hollis and pick Choose a Calling", quest: QUEST, count: 1 },
        { type: "talk", or: "pick", label: "Tell Hollis the Calling you chose", npc: "hollis", when: PICKED },
      ],
      outro: [
        `Hollis turns the brittle pages until he finds the right one, dips his pen and writes your name in a careful, shaking hand.`,
        ...HOLLIS_ANSWERS,
        `${H}The sigil will answer you now. It answered them. Use it well, and if you ever want a different page, come back. I'll still be here. I'm always here.`,
      ],
      choices: [
        { id: "thanks", label: "\"Thank you, Brother.\"", set: { "g:called": "1" }, reply: [`${H}Thank me by coming back in one piece. That's all the thanks a chapel keeper wants. That, and candles.`] },
        { id: "candle", label: "\"Light a candle for me?\"", set: { "g:called": "1" }, reply: [`${H}I already did. Last night, before you came. Don't ask me how I knew. I don't know how I knew.`] },
      ],
      reward: { levels: 3, crowns: 40, codex: CODEX },
      hint: "Tap Brother Hollis in the Old Chapel and pick Choose a Calling (/realm:skills_calling shows each Calling first). Your first Calling is free.",
    },
    {
      id: "graveyard_book",
      title: "The Gravedigger's Book",
      npc: "moss",
      when: { "g:hollis": "lost", "g:called": "!1" },
      intro: [
        `${MO}{player}. Got something for you. Hollis left it with me, before. The chapel book. Said I'd know when to hand it over. I always know. It's the job.`,
        `${MO}Six Callings in here. Delvers, Wardens, Pathfinders, Hearthkeepers, Woodwrights, Stormcallers. Half the old ones are buried in my rows. They kept sigils. I kept the sigils. Nobody asked.`,
        `${MO}You've got the look. Skills up to your ears. Pick a page and I'll write your name in it. Hollis had nicer handwriting. You'll have to live with mine.`,
      ],
      objectives: [
        { type: "event", or: "pick", label: "Choose your Calling: tap Moss and pick Choose a Calling", quest: QUEST, count: 1 },
        { type: "talk", or: "pick", label: "Tell Moss the Calling you chose", npc: "moss", when: PICKED },
      ],
      outro: [
        `Moss licks the pencil, writes your name in big square letters and blows on the page as if the ink could be wet.`,
        ...MOSS_ANSWERS,
        `${MO}He'd have liked this, Hollis. He'd have cried a bit. I'll do it for him later, when nobody's looking. Off you go.`,
      ],
      choices: [
        { id: "thanks", label: "\"Thank you, Moss.\"", set: { "g:called": "1" }, reply: [`${MO}Don't thank me. Come back and change your mind someday. I like the company.`] },
        { id: "hollis", label: "\"For Hollis.\"", set: { "g:called": "1" }, reply: [`${MO}For Hollis. I'll tell him. He's not in my rows, but I tell him things anyway.`] },
      ],
      reward: { levels: 3, crowns: 40, codex: CODEX },
      hint: "Tap Moss at the old graveyard and pick Choose a Calling (/realm:skills_calling shows each Calling first). Your first Calling is free.",
    },
  ],
};

/** @type {Story[]} */
export const STORIES = [CALLING];
