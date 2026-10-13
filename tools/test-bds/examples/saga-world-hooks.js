// Story Questlines content hooks into the world-event packs and Expeditions (the shipped stories, no test story).
// The scenario answers realm:help_ping as expedition_bp, moon_bp, meteor_bp, night_bp, rainbow_bp and weather_bp,
// simulates their events and listens for the story's sky requests.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-world-hooks.js --timeout 900 --prop difficulty=peaceful
// 1. Into the Deep, "Echoes in Crystal": Ida's gated Sculk Depths line shows, the echo shards and the expedition are
//    an either/or, and a realm:quest_done for the Sculk Depths finishes the group (the shards way ends).
// 2. Graveyard Shift, "Until Dawn": the optional "Be in the graveyard under a Blood Moon" counts when a Blood Moon
//    (realm:sky_event) rises while the player stands in the graveyard, and gives its bonus levels.
// 3. The Three Seals, "The Gate Opens": accepting it sends a burst meteor request at the Hollow Gate.
// 4. The Long Night: accepting it sends a Blood Moon request.
// 5. The Listening Deep (needs Act III and expedition_bp): offered by Ida; "Down the Long Stair" needs a Gauntlet (or a Hard clear)
//    (a plain clear doesn't count), "One Last Listen" a Nightmare clear (Hard doesn't count), then the title.
export default async function (t) {
  const sys = t.system;
  const OW = "minecraft:overworld";
  const PACKS = ["expedition_bp", "moon_bp", "meteor_bp", "night_bp", "rainbow_bp", "weather_bp"];
  /** @type {any[]} */
  const requests = [];
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:sky_request") requests.push({ tick: sys.currentTick, ...JSON.parse(message) });
        else if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
        else if (id === "realm:help_ping") for (const f of PACKS) sys.sendScriptEvent("realm:help_pong", f);
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const event = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  const debug = (p, msg) => event("realm:saga_debug", { player: p.name, ...msg });
  const choose = (p, key) => event("realm:npc_choose", { pack: "saga_bp", player: p.id, key });
  let reqN = 0;
  /** Talks to a townsfolk as the player and returns Story Questlines' offers. */
  async function talk(p, npc) {
    const req = `r${++reqN}`;
    event("realm:npc_talk", { player: p.id, npc, req });
    await t.wait(4);
    return offers.filter((o) => o.m.req === req && o.m.pack === "saga_bp").map((o) => o.m);
  }
  /** Pages with Next, then `last`; returns the bodies. */
  async function pages(p, last, timeout = 300) {
    const seen = [];
    for (;;) {
      const f = await t.waitForm(p, { timeout });
      seen.push(String(f.body));
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(typeof last === "function" ? last(f) : last);
      return seen.join("\n");
    }
  }
  /** Starts the chapter `npc` offers for `story`; returns the intro text and the chat lines since. */
  async function accept(p, npc, story, title) {
    const got = await talk(p, npc);
    const start = got.find((o) => o.key === `start:${story}`);
    t.assert(start, `${npc} offers ${story} (offers: ${JSON.stringify(got)})`);
    const since = t.tick;
    // Accept, or the first intro choice (a chapter with introChoices starts once one is picked).
    const pick = (f) => (f.buttons.includes("Accept") ? "Accept" : f.buttons[0]);
    const w = pages(p, pick);
    choose(p, `start:${story}`);
    let intro = await w;
    // Any forms that follow (an intro choice's reply): answer them until none comes.
    for (let k = 0; k < 4; k++) {
      try {
        intro += "\n" + (await pages(p, pick, 30));
      } catch {
        break;
      }
    }
    await t.waitMessage(p, new RegExp(title), { since, timeout: 100 });
    await t.wait(10);
    return { intro, lines: t.messages(p, { since }).map((m) => m.plain), since };
  }
  /** Reports to `npc` and returns the outro text. */
  async function report(p, npc, story, title) {
    const got = await talk(p, npc);
    t.assert(got.some((o) => o.key === `end:${story}`), `${npc} takes the report (offers: ${JSON.stringify(got)})`);
    const since = t.tick;
    const w = pages(p, (f) => f.buttons[0]);
    choose(p, `end:${story}`);
    const outro = await w;
    await t.waitMessage(p, new RegExp(`Chapter complete: ${title}`), { since, timeout: 200 });
    return outro;
  }
  const quest = (p, extra) => event("realm:quest_done", { player: p.id, pack: "expedition_bp", label: "Expedition cleared", kind: "expedition", guild: "wardens", ...extra });

  t.server("/time set day");
  t.server("/weather clear");
  const p = await t.player("Tester", { op: true });
  await t.seconds(5); // saga's first installed-packs scan (3 s after load) has heard our answers
  sys.sendScriptEvent("realm:help_ping", ""); // and once more, to be sure
  await t.wait(10);

  // --- 1. Echoes in Crystal: the expedition way ---------------------------------------------------
  debug(p, { action: "finish", story: "act2_choir" });
  debug(p, { action: "jump", story: "act3_deep", chapter: "echoes" });
  await t.wait(5);
  let r = await accept(p, "ida", "act3_deep", "Echoes in Crystal");
  t.check(r.intro.includes("Expedition parties go down into the Sculk Depths"), "Ida's gated Sculk Depths line shows");
  t.check(r.lines.some((l) => /Clear the Sculk Depths expedition/.test(l)), `the expedition way is listed: ${JSON.stringify(r.lines)}`);
  let since = t.tick;
  quest(p, { id: "expedition_crypt", dungeon: "crypt", level: 1, tier: "easy", nightmare: 0, gauntlet: false });
  await t.seconds(2);
  t.check(!t.messages(p, { since }).some((m) => /Sculk Depths expedition \(any difficulty\): done/.test(m.plain)), "a Crypt clear doesn't count");
  quest(p, { id: "expedition_sculk_depths", dungeon: "sculk_depths", level: 0, tier: "easy", nightmare: 0, gauntlet: false });
  await t.waitMessage(p, /Clear the Sculk Depths expedition \(any difficulty\): done/, { since, timeout: 100 });
  p.giveItem(new t.mc.ItemStack("minecraft:echo_shard", 4), true);
  await t.seconds(3);
  t.check(!t.messages(p, { since }).some((m) => /Have 4 echo shards.*: done/.test(m.plain)), "the shards way ended with the group (holding shards counts nothing)");

  // --- 2. Until Dawn: a Blood Moon in the graveyard -------------------------------------------------
  t.assert(t.cmd(p, "/realm:saga_place graveyard").ok, "set the graveyard where the player stands");
  await t.waitMessage(p, /Place "graveyard"/, { since: t.tick });
  debug(p, { action: "jump", story: "graveyard_shift", chapter: "till_dawn" });
  await t.wait(5);
  r = await accept(p, "moss", "graveyard_shift", "Until Dawn");
  t.check(r.lines.some((l) => /Optional: Be in the graveyard under a Blood Moon/.test(l)), `the optional Blood Moon objective is listed: ${JSON.stringify(r.lines)}`);
  const levels0 = p.level;
  // The moon rises at dusk (12000, as moon_bp does) while the player is away; they get there 40 s later.
  const yard = { x: p.location.x, y: p.location.y, z: p.location.z };
  p.teleport({ x: yard.x + 120, y: yard.y + 2, z: yard.z });
  t.server("/time set 12000");
  since = t.tick;
  event("realm:sky_event", { kind: "blood_moon", dim: OW, text: "A Blood Moon rises" });
  await t.seconds(40);
  t.check(!t.messages(p, { since }).some((m) => /under a Blood Moon: done/.test(m.plain)), "not done while away from the graveyard");
  p.teleport(yard);
  await t.waitMessage(p, /Optional: Be in the graveyard under a Blood Moon: done/, { since, timeout: 200 });
  await t.waitMessage(p, /Bonus for "Be in the graveyard under a Blood Moon": 2 levels/, { since, timeout: 60 });
  t.check(p.level >= levels0 + 2, `bonus levels given (${levels0} -> ${p.level})`);
  event("realm:moon", { state: "normal" });

  // --- 3. The Gate Opens: a burst meteor over the Hollow Gate ----------------------------------------
  const gate = { x: Math.floor(p.location.x) + 20, z: Math.floor(p.location.z) };
  p.teleport({ x: gate.x + 0.5, y: p.location.y + 2, z: gate.z + 0.5 });
  await t.wait(10);
  t.assert(t.cmd(p, "/realm:saga_place hollow_gate").ok, "set the Hollow Gate");
  await t.waitMessage(p, /Place "hollow_gate"/, { since: t.tick });
  p.teleport({ x: gate.x - 300.5, y: p.location.y, z: gate.z + 0.5 });
  await t.wait(10);
  debug(p, { action: "finish", story: "act3_deep" });
  debug(p, { action: "jump", story: "act4_seals", chapter: "gate", flags: { "g:quill": "exposed", "g:hollis": "lost" } });
  await t.wait(5);
  let n0 = requests.length;
  r = await accept(p, "reyes", "act4_seals", "The Gate Opens");
  t.check(r.intro.includes("Sol's up on the lighthouse swearing"), "Reyes's gated meteor line shows");
  await t.seconds(2);
  const meteor = requests.slice(n0).filter((q) => q.kind === "meteor");
  t.check(meteor.length === 1 && meteor[0].burst === true && meteor[0].from === "saga_bp" && meteor[0].reason === "act4_seals:gate" && Math.abs(meteor[0].x - gate.x) <= 1 && Math.abs(meteor[0].z - gate.z) <= 1, `one burst meteor request at the gate ${JSON.stringify(gate)}: ${JSON.stringify(meteor)}`);

  // --- 4. The Long Night: a Blood Moon request -------------------------------------------------------
  debug(p, { action: "finish", story: "act4_seals" });
  debug(p, { action: "jump", story: "act5_lantern", chapter: "long_night", flags: { "g:quill": "exposed", "g:hollis": "lost", "g:allies": "0" } });
  await t.wait(5);
  n0 = requests.length;
  r = await accept(p, "reyes", "act5_lantern", "The Long Night");
  t.check(r.intro.includes("the moon may come up red tonight"), "Reyes's gated Blood Moon line shows");
  t.check(r.lines.some((l) => /Optional: Keep the light burning under a Blood Moon/.test(l)), "the Long Night's optional Blood Moon objective is listed");
  await t.seconds(2);
  const moon = requests.slice(n0).filter((q) => q.kind === "blood_moon");
  t.check(moon.length === 1 && moon[0].reason === "act5_lantern:long_night", `one Blood Moon request: ${JSON.stringify(requests.slice(n0))}`);

  // --- 5. The Listening Deep ------------------------------------------------------------------------
  let got = await talk(p, "ida");
  t.check(got.some((o) => o.key === "start:listening_deep" && o.label.includes("The Listening Deep")), `Ida offers The Listening Deep: ${JSON.stringify(got)}`);
  debug(p, { action: "jump", story: "listening_deep", chapter: "gauntlet" });
  await t.wait(5);
  r = await accept(p, "reyes", "listening_deep", "Down the Long Stair");
  since = t.tick;
  quest(p, { id: "expedition_crypt", dungeon: "crypt", level: 1, tier: "normal", nightmare: 0, gauntlet: false });
  await t.seconds(2);
  t.check(!t.messages(p, { since }).some((m) => /Finish a Gauntlet.*: done/.test(m.plain)), "a plain Normal clear is neither a Gauntlet nor the Hard way");
  quest(p, { id: "expedition_spider_nest", dungeon: "spider_nest", level: 0, tier: "easy", nightmare: 0, gauntlet: true });
  await t.waitMessage(p, /Finish a Gauntlet \(any dungeon, any difficulty\): done/, { since, timeout: 100 });
  let outro = await report(p, "reyes", "listening_deep", "Down the Long Stair");
  t.check(outro.includes("Training or death wish"), "Reyes's outro");

  r = await accept(p, "ida", "listening_deep", "One Last Listen");
  t.check(r.intro.includes("apron in her lap"), "Elsie is at the forge (no Keeper's Gift)");
  since = t.tick;
  quest(p, { id: "expedition_ender_spire", dungeon: "ender_spire", level: 2, tier: "hard", nightmare: 0, gauntlet: false });
  await t.seconds(2);
  t.check(!t.messages(p, { since }).some((m) => /Nightmare tier: done/.test(m.plain)), "a Hard clear isn't Nightmare");
  quest(p, { id: "expedition_ender_spire", dungeon: "ender_spire", level: 3, tier: "nightmare", nightmare: 1, gauntlet: false });
  await t.waitMessage(p, /Clear any expedition on a Nightmare tier: done/, { since, timeout: 100 });
  await talk(p, "elsie");
  await t.waitMessage(p, /Sit with Elsie for the listening: done/, { since, timeout: 100 });
  since = t.tick;
  outro = await report(p, "ida", "listening_deep", "One Last Listen");
  t.check(outro.includes("They drew back"), "Elsie's last line");
  await t.seconds(2);
  t.log(t.messages(p, { since }).map((m) => m.plain).join(" | "));
}
