// Story Questlines and the world: optional objectives, "either" groups, event objectives (sky events and other
// packs' quests), `pack:` flags and sky requests. Tested with a copy of saga_bp that has a test story (`hook`
// below, appended to the copy's stories.js; the pack itself ships no test content):
//   rm -rf /tmp/swe && mkdir -p /tmp/swe && cp -r packs/saga_bp /tmp/swe/
//   node -e 'import("./tools/test-bds/examples/saga-world-events.js").then((m) => require("fs").appendFileSync("/tmp/swe/saga_bp/scripts/stories.js", m.hook))'
//   node tools/test-bds/run.mjs --quiet --packs /tmp/swe --scenario tools/test-bds/examples/saga-world-events.js --timeout 600
// Chapter 1: accepting it sends the chapter's meteor request (burst) and, once, the optional objective's rainbow
// request and the rain vigil's weather help. The "either" member gated by `pack:expedition_bp` only shows once a
// pack answers realm:help_ping as expedition_bp (the scenario does). A meteor (realm:sky_event) far away starts a
// chase for the optional `near` objective; coming close finishes it with its bonus levels and flag. A Blood Moon
// counts at once (no `near`). An Expeditions clear (realm:quest_done) below the asked tier doesn't count; a hard
// one does and ends the other way of the group (talking to Tobin then counts nothing). The outro reads the flags.
// Chapter 2: the other member of an "either" group finishes it, and the unfinished optional objective just ends.

const SPAWN = { x: 163, z: 170 }; // seed 1's world spawn

/** @type {import("../../../packs/saga_bp/scripts/types.js").Story} */
const STORY = {
  id: "zz_world_test",
  title: "World Test",
  short: "World Test",
  giver: "wren",
  chapters: [
    {
      id: "c1",
      title: "Signs Above",
      intro: ["Watch the sky."],
      sky: [{ kind: "meteor", burst: true }],
      objectives: [
        { type: "event", label: "See a Blood Moon", events: ["blood_moon"] },
        { type: "event", optional: true, label: "Get close to a falling meteor", events: ["meteor"], near: 20, bonus: { levels: 2 }, set: { saw: "meteor" }, sky: { kind: "rainbow" } },
        { type: "event", or: "way", label: "Clear a dungeon on hard", quest: { pack: "expedition_bp", id: "expedition_*", tier: "hard" }, set: { way: "crypt" }, when: { "pack:expedition_bp": "on" } },
        { type: "talk", or: "way", label: "Ask Tobin about it", npc: "tobin", set: { way: "talk" } },
        { type: "vigil", label: "Keep watch in the rain", weather: "rain", seconds: 3, at: SPAWN, radius: 200 },
      ],
      outro: ["Done.", { text: "OUTRO-METEOR", when: { saw: "meteor" } }, { text: "OUTRO-CRYPT", when: { way: "crypt" } }, { text: "OUTRO-TALK", when: { way: "talk" } }],
    },
    {
      id: "c2",
      title: "Two Roads",
      intro: ["Pick a road."],
      objectives: [
        { type: "talk", or: "road", label: "Ask Tobin", npc: "tobin", set: { road: "tobin" } },
        { type: "talk", or: "road", label: "Ask Mara", npc: "mara", set: { road: "mara" } },
        { type: "event", optional: true, label: "See the northern lights", events: ["aurora"], bonus: { levels: 5 } },
      ],
      outro: ["Done.", { text: "ROAD-TOBIN", when: { road: "tobin" } }, { text: "ROAD-MARA", when: { road: "mara" } }],
    },
  ],
};

export const hook = `\n// Test story (tools/test-bds/examples/saga-world-events.js)\nSTORIES.push(${JSON.stringify(STORY)});\n`;

export default async function (t) {
  const sys = t.system;
  const OW = "minecraft:overworld";
  /** @type {any[]} */
  const requests = [];
  let answerAsExpeditions = false;
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:sky_request") requests.push({ tick: sys.currentTick, ...JSON.parse(message) });
        // Pretend Expeditions is installed, once the scenario says so.
        if (id === "realm:help_ping" && answerAsExpeditions) sys.sendScriptEvent("realm:help_pong", "expedition_bp");
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const event = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  const talk = (p, npc) => event("realm:npc_talk", { player: p.id, npc });
  const choose = (p, key) => event("realm:npc_choose", { pack: "saga_bp", player: p.id, key });
  /** Answers dialogue pages with Next, then `last`; returns the bodies. */
  async function pages(p, last) {
    const seen = [];
    for (;;) {
      const f = await t.waitForm(p, { timeout: 300 });
      seen.push(String(f.body));
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(last);
      return seen.join("\n");
    }
  }
  /** The chapter page of the story log: /realm:saga_log, then the story. */
  async function chapterPage(p) {
    let next = t.waitForm(p, { title: "Current quests" });
    t.assert(t.cmd(p, "/realm:saga_log").ok, "/realm:saga_log ran");
    let f = await next;
    next = t.waitForm(p, { title: "World Test" });
    f.answer("World Test");
    f = await next;
    const body = String(f.body);
    next = t.waitForm(p, { title: "Current quests" });
    f.answer("OK");
    (await next).answer("Back");
    return body;
  }

  t.server("/weather clear");
  t.server("/time set day");
  const p = await t.player("Tester", { x: SPAWN.x, z: SPAWN.z });
  await t.seconds(4); // saga's first installed-packs scan (3 s after load) is over: no expedition_bp
  const levels0 = p.level;

  // --- Chapter 1: accept --------------------------------------------------------------------------
  let since = t.tick;
  let w = pages(p, "Accept");
  choose(p, "start:zz_world_test");
  await w;
  await t.waitMessage(p, /World Test: Signs Above/, { since, timeout: 100 });
  const accept = t.messages(p, { since }).map((m) => m.plain);
  t.check(accept.some((l) => /- Ask Tobin about it/.test(l) && !/Either|Or:/.test(l)), `before Expeditions answers, Tobin is the only way: ${JSON.stringify(accept)}`);
  t.check(!accept.some((l) => /Clear a dungeon/.test(l)), "the expedition way is hidden while no expedition_bp answered");
  t.check(accept.some((l) => /- Optional: Get close to a falling meteor/.test(l)), "the optional objective is listed as Optional:");

  await t.seconds(3);
  const meteorReq = requests.filter((r) => r.kind === "meteor");
  t.check(meteorReq.length === 1 && meteorReq[0].burst === true && meteorReq[0].from === "saga_bp" && meteorReq[0].player === p.id && meteorReq[0].reason === "zz_world_test:c1" && meteorReq[0].dim === OW && typeof meteorReq[0].x === "number", `the chapter's meteor request: ${JSON.stringify(meteorReq)}`);
  t.check(requests.filter((r) => r.kind === "rainbow").length === 1, `the optional objective's rainbow request, once: ${JSON.stringify(requests)}`);
  const rainReq = requests.filter((r) => r.kind === "rain");
  t.check(rainReq.length === 1 && rainReq[0].minutes === 6 && rainReq[0].within === 8, `weather help for the rain vigil, once: ${JSON.stringify(rainReq)}`);

  // --- pack: flags -------------------------------------------------------------------------------
  answerAsExpeditions = true;
  sys.sendScriptEvent("realm:help_ping", ""); // someone pings (like /realm:help): saga hears the answer
  await t.wait(10);
  const page = await chapterPage(p);
  t.check(/Either: Clear a dungeon on hard/.test(page) && /Or: Ask Tobin about it/.test(page), `with Expeditions installed, the group shows both ways: ${page}`);
  t.check(/Optional: Get close to a falling meteor/.test(page), "the log shows Optional:");

  // --- Optional near objective: a meteor 40 blocks away, then close -------------------------------
  const at = p.location;
  since = t.tick;
  event("realm:sky_event", { kind: "meteor", dim: OW, x: Math.floor(at.x) + 40, z: Math.floor(at.z), text: "A meteor is falling" });
  await t.waitMessage(p, /A meteor is falling: get within 20 blocks of where it lands/, { since, timeout: 60 });
  await t.seconds(2);
  t.check(!t.messages(p, { since }).some((m) => /falling meteor: done/.test(m.plain)), "40 blocks away doesn't count");
  const chase = await chapterPage(p);
  t.check(/A meteor is falling: get within 20 blocks of where it lands/.test(chase), `the log points at the meteor: ${chase}`);
  since = t.tick;
  p.teleport({ x: at.x + 30, y: at.y, z: at.z });
  await t.waitMessage(p, /Optional: Get close to a falling meteor: done/, { since, timeout: 100 });
  await t.waitMessage(p, /Bonus for "Get close to a falling meteor": 2 levels/, { since, timeout: 40 });
  t.check(p.level === levels0 + 2, `bonus levels given (${levels0} -> ${p.level})`);
  t.check(!t.messages(p, { since }).some((m) => /Signs Above" is done/.test(m.plain)), "an optional objective doesn't finish the chapter");
  p.teleport({ x: at.x, y: at.y, z: at.z });

  // --- Blood Moon (no near): counts when announced -----------------------------------------------
  since = t.tick;
  event("realm:moon", { state: "blood" });
  event("realm:sky_event", { kind: "blood_moon", dim: OW, text: "A Blood Moon rises" });
  await t.waitMessage(p, /See a Blood Moon: done/, { since, timeout: 60 });
  event("realm:moon", { state: "normal" });

  // --- Either group: the quest way -----------------------------------------------------------------
  since = t.tick;
  event("realm:quest_done", { player: p.id, pack: "expedition_bp", id: "expedition_crypt", label: "Crypt", kind: "expedition", dungeon: "crypt", level: 3, tier: "normal", nightmare: 0, gauntlet: false });
  await t.seconds(1);
  t.check(!t.messages(p, { since }).some((m) => /Clear a dungeon on hard: done/.test(m.plain)), "a normal-tier clear doesn't count for tier hard");
  event("realm:quest_done", { player: p.id, pack: "expedition_bp", id: "expedition_crypt", label: "Crypt", kind: "expedition", dungeon: "crypt", level: 12, tier: "hard", nightmare: 0, gauntlet: false });
  await t.waitMessage(p, /Clear a dungeon on hard: done/, { since, timeout: 60 });
  since = t.tick;
  talk(p, "tobin");
  await t.seconds(1);
  t.check(!t.messages(p, { since }).some((m) => /Ask Tobin about it: done/.test(m.plain)), "the other way of the group ended");

  // --- Rain vigil, then report -------------------------------------------------------------------
  since = t.tick;
  t.server("/weather rain");
  await t.waitMessage(p, /"Signs Above" is done/, { since, timeout: 300 });
  w = pages(p, "Finish the chapter");
  choose(p, "end:zz_world_test");
  const outro = await w;
  const intro2 = pages(p, "Accept"); // the same questgiver goes straight on to the next chapter
  t.check(outro.includes("OUTRO-METEOR"), "the optional objective's flag is set (saw = meteor)");
  t.check(outro.includes("OUTRO-CRYPT") && !outro.includes("OUTRO-TALK"), "the group member's flag is set (way = crypt)");
  await t.waitMessage(p, /Chapter complete: Signs Above/, { timeout: 100 });

  // --- Chapter 2: the other member finishes a group; the optional one just ends -------------------
  await intro2;
  await t.waitMessage(p, /World Test: Two Roads/, { timeout: 100 });
  const levels1 = p.level;
  since = t.tick;
  talk(p, "mara");
  await t.waitMessage(p, /Ask Mara: done/, { since, timeout: 60 });
  await t.waitMessage(p, /"Two Roads" is done/, { since, timeout: 60 });
  talk(p, "tobin");
  await t.seconds(1);
  t.check(!t.messages(p, { since }).some((m) => /Ask Tobin: done/.test(m.plain)), "Tobin's way ended");
  w = pages(p, "Finish the story");
  choose(p, "end:zz_world_test");
  const outro2 = await w;
  t.check(outro2.includes("ROAD-MARA") && !outro2.includes("ROAD-TOBIN"), "road = mara");
  await t.waitMessage(p, /Story complete: World Test/, { timeout: 100 });
  t.check(p.level === levels1, "no bonus for the unfinished optional objective");
  // Sky requests are never sent again for a chapter already handled.
  t.check(requests.filter((r) => r.kind === "meteor").length === 1 && requests.filter((r) => r.kind === "rainbow").length === 1, `no repeated requests: ${JSON.stringify(requests.map((r) => r.kind))}`);
}
