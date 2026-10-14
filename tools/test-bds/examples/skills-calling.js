// Callings (Skills): the Calling unlocks at a total skill level of 75 (and opens Story Questlines' The Calling at
// Hollis), choosing at Hollis gives the Calling Sigil and counts for the chapter, the talent tree's tier gates and point
// cap, the Sigil's active with its cooldown, a consumer (Kitchen: Hearty Dishes, +25% dish effects) from realm:calling,
// reset and switch costs with the 3-Realm-day gap, a damage talent (Warden's Sharp Eye) without recursion, a finishing
// bonus that kills (one extra hit, the kill counts), and the Guilds top-rank title "Miners' Guildmaster".
// Simulated players can't tap townsfolk, so the test sends Townsfolk's realm:npc_talk / realm:npc_choose itself, and
// pretends Townsfolk is installed with a realm:help_pong "npc_bp".
//   node tools/test-bds/run.mjs --quiet --only skills_bp,saga_bp,cooking_bp,guilds_bp --scenario tools/test-bds/examples/skills-calling.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:calling", "realm:npc_offer", "realm:quest_done", "realm:gossip", "realm:title_unlock"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const p = await t.player("Alex", { op: true });
  await t.wait(40);
  const sb = t.world.scoreboard;
  const obj = (id) => sb.getObjective(id) ?? sb.addObjective(id, id);
  // XP for level n with the default curve: round(20 * k^1.5) for k = 1 .. n - 1.
  const xpFor = (n) => {
    let s = 0;
    for (let k = 1; k < n; k++) s += Math.round(20 * k ** 1.5);
    return s;
  };
  const setLevel = (skill, n) => obj(`skill_${skill}`).setScore(p, xpFor(n));
  const crowns = (n) => obj("crowns").setScore(p, n);
  const crownsNow = () => obj("crowns").getScore(p) ?? 0;
  const last = () => events.filter((e) => e.id === "realm:calling" && e.m.player === p.id).at(-1)?.m;
  const choose = (pack, key, npc = "hollis") => sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: p.id, npc, pack, key }));
  const talk = (req, npc, roles) => sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req, roles, name: npc }));
  /** Answers "Next" until a form has `button`, then presses it. Returns every body seen. */
  const pageTo = async (button) => {
    const bodies = [];
    for (;;) {
      const f = await t.waitForm(p, { timeout: 100 });
      bodies.push(f.body);
      if (f.buttons.some((b) => b.includes(button))) {
        f.answer(button);
        return bodies;
      }
      f.answer("Next");
    }
  };

  // --- Total level 74: not ready yet.
  setLevel("farming", 40);
  setLevel("fishing", 30); // farming + fishing 70: 1 + (70 - 50) / 5 = 5 talent points as a Hearthkeeper
  let form = t.waitForm(p);
  t.assert(t.cmd(p, "/realm:skills_calling").ok, "skills_calling ran");
  let f = await form;
  t.check(/total skill level of 75/.test(f.body) && /74/.test(f.body), `not ready at 74 (${f.body.slice(0, 160)})`);
  f.answer(null);

  // --- One more level (Mining 2): ready; the player is told, Skills says ready, Story Questlines opens The Calling.
  let since = t.tick;
  sys.sendScriptEvent("realm:skill_xp", JSON.stringify({ player: p.id, skill: "mining", amount: 20 }));
  await t.waitMessage(p, /you can choose a Calling/, { since, timeout: 60 });
  await t.waitUntil(() => last()?.ready === true, { timeout: 60, message: "realm:calling says ready" });
  // Townsfolk "is here": choosing then needs Hollis.
  sys.sendScriptEvent("realm:help_pong", "npc_bp");
  await t.wait(70); // Story Questlines' pack scan (pack:skills_bp) is done 3 s after load
  talk("c1", "hollis", ["priest", "questgiver"]);
  await t.wait(6);
  const offers1 = events.filter((e) => e.id === "realm:npc_offer" && e.m.req === "c1").map((e) => `${e.m.pack}:${e.m.key}`);
  t.log("offers at Hollis:", offers1.join(", "));
  t.check(offers1.includes("skills_bp:calling"), "Hollis offers Choose a Calling");
  t.check(offers1.includes("saga_bp:start:the_calling"), "Hollis offers The Calling (story)");
  // Not at Hollis: the menu only shows the Callings.
  form = t.waitForm(p);
  t.cmd(p, "/realm:skills_calling");
  f = await form;
  t.check(/Brother Hollis/.test(f.body), "away from Hollis the menu says to see him");
  f.answer("Hearthkeeper");
  f = await t.waitForm(p);
  t.check(!f.buttons.some((b) => /Become/.test(b)), "no Become button away from Hollis");
  f.answer("Back");
  (await t.waitForm(p)).answer(null);

  // --- Accept the chapter, then choose at Hollis.
  const accepted = pageTo("Accept");
  choose("saga_bp", "start:the_calling");
  await accepted;
  await t.wait(5);
  sys.sendScriptEvent("realm:calendar", JSON.stringify({ day: 10, doy: 10, year: 1, season: "thaw", from: "test" }));
  await t.wait(2);
  form = t.waitForm(p);
  choose("skills_bp", "calling");
  f = await form;
  f.answer("Hearthkeeper");
  f = await t.waitForm(p);
  t.log("offer page:", f.body.slice(0, 200));
  since = t.tick;
  let cf;
  let next = t.waitForm(p); // the menu again, shown in the same tick as the message
  f.answer("Become");
  await t.waitMessage(p, /You are a Hearthkeeper now/, { since, timeout: 40 });
  (await next).answer(null);
  const inv = p.getComponent("inventory").container;
  let sigilSlot = -1;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === "minecraft:music_disc_ward") sigilSlot = i;
  t.check(sigilSlot >= 0 && inv.getItem(sigilSlot).nameTag?.includes("Calling Sigil"), "the Calling Sigil was given");
  t.check(events.some((e) => e.id === "realm:quest_done" && e.m.id === "skills:calling:hearthkeeper" && e.m.guild === "growers"), "quest_done for the choice");
  t.check(events.some((e) => e.id === "realm:gossip" && e.m.kind === "calling" && e.m.place === "Hearthkeeper"), "gossip about the new Calling");
  await t.waitUntil(() => last()?.calling === "hearthkeeper", { timeout: 40, message: "realm:calling names hearthkeeper" });
  // The chapter is done: report back to Hollis.
  await t.wait(10);
  talk("c2", "hollis", ["priest", "questgiver"]);
  await t.wait(6);
  const offers2 = events.filter((e) => e.id === "realm:npc_offer" && e.m.req === "c2").map((e) => `${e.m.pack}:${e.m.key}`);
  t.check(offers2.includes("saga_bp:end:the_calling"), `report back offered (${offers2.join(", ")})`);
  const outro = pageTo("Thank you");
  since = t.tick;
  choose("saga_bp", "end:the_calling");
  const bodies = await outro;
  t.check(bodies.some((b) => /Hearthkeeper\. Oh, that's a kind one/.test(b)), "Hollis answers the Hearthkeeper choice");
  (await t.waitForm(p)).answer(0); // the reply
  await t.wait(10);

  // --- Talents: tier gate, point cap, capstone gate.
  const openTalents = async () => {
    const m = t.waitForm(p);
    t.cmd(p, "/realm:skills_calling");
    (await m).answer("Talents");
    return t.waitForm(p);
  };
  const spend = async (name, expectOk) => {
    const tf = await openTalents();
    since = t.tick;
    if (expectOk) {
      const c = t.waitForm(p);
      tf.answer(name);
      const cfm = await c; // confirm: Spend
      const nx = t.waitForm(p);
      cfm.answer(0);
      (await nx).answer(null); // the tree again
    } else {
      const nx = t.waitForm(p);
      tf.answer(name);
      const why = await t.waitMessage(p, new RegExp(name.split(" ")[0]), { since, timeout: 40 });
      t.log(`refused ${name}: ${why.plain}`);
      (await nx).answer(null);
    }
    await t.wait(4);
  };
  await spend("Good Soil", true);
  await spend("Bountiful", false); // tier 2 needs 3 in tier 1
  t.check(!last()?.talents?.bountiful, "tier 2 refused with 1 point in tier 1");
  await spend("Good Soil", true);
  await spend("Full Nets", true);
  await spend("Bountiful", true);
  await spend("Bountiful", true);
  await spend("Long Song", false); // 5 of 5 spent
  t.check(JSON.stringify(last()?.talents) === JSON.stringify({ good_soil: 2, full_nets: 1, bountiful: 2 }), `talents ${JSON.stringify(last()?.talents)}`);
  setLevel("fishing", 45); // 85 combined: 8 points
  await spend("Long Song", true);
  await spend("Hearty Dishes", false); // 6 in tiers 1-2, needs 7
  await spend("Long Song", true);
  await spend("Hearty Dishes", true);
  await spend("Green Thumb", false); // one capstone (and no points left)
  await t.waitUntil(() => last()?.bonus?.dishPct === 25, { timeout: 40, message: "bonus.dishPct 25 in realm:calling" });

  // --- A consumer: Kitchen's Miner's Pasty (Haste I 300 s) lasts 25% longer.
  sys.sendScriptEvent("realm:cooking_eat", JSON.stringify({ player: p.id, dish: "miners_pasty" }));
  await t.wait(3);
  const haste = p.getEffect("haste");
  t.log("haste after the pasty:", haste?.duration);
  t.check(haste && haste.duration > 7000 && haste.duration <= 7500, `Hearty Dishes: 375 s of Haste (${haste?.duration})`);
  p.removeEffect("haste");

  // --- The Sigil: Hearth Song, then its cooldown.
  p.selectedSlotIndex = sigilSlot < 9 ? sigilSlot : 0;
  if (sigilSlot >= 9) {
    inv.swapItems(sigilSlot, 0, inv);
    sigilSlot = 0;
  }
  await t.wait(2);
  since = t.tick;
  p.useItemInSlot(p.selectedSlotIndex);
  await t.waitMessage(p, /Hearth Song/, { since, kind: "actionbar", timeout: 40 });
  const regen = p.getEffect("regeneration");
  t.check(regen && regen.duration > 300, `Regeneration from Hearth Song with Long Song (${regen?.duration})`);
  await t.wait(10);
  since = t.tick;
  p.useItemInSlot(p.selectedSlotIndex);
  await t.waitMessage(p, /ready in/, { since, kind: "actionbar", timeout: 40 });

  // --- Reset talents: 50 Crowns.
  crowns(10);
  let m = t.waitForm(p);
  t.cmd(p, "/realm:skills_calling");
  (await m).answer("Reset talents");
  cf = await t.waitForm(p);
  next = t.waitForm(p);
  cf.answer(0);
  await t.waitMessage(p, /costs 50 Crowns/, { timeout: 40 });
  (await next).answer(null);
  crowns(100);
  m = t.waitForm(p);
  t.cmd(p, "/realm:skills_calling");
  (await m).answer("Reset talents");
  cf = await t.waitForm(p);
  next = t.waitForm(p);
  cf.answer(0);
  await t.waitMessage(p, /free to spend again/, { timeout: 40 });
  (await next).answer(null);
  t.check(crownsNow() === 50, `reset took 50 Crowns once (${crownsNow()})`);
  await t.waitUntil(() => last() && Object.keys(last().talents).length === 0, { timeout: 40, message: "talents empty after reset" });

  // --- Switching: 3 Realm days apart, 100 Crowns the first time.
  const trySwitch = async (to) => {
    const sm = t.waitForm(p);
    choose("skills_bp", "calling");
    (await sm).answer(`Switch to ${to}`);
    const page = await t.waitForm(p);
    const label = page.buttons[0];
    page.answer(0);
    return label;
  };
  sys.sendScriptEvent("realm:calendar", JSON.stringify({ day: 12, doy: 12, year: 1, season: "thaw", from: "test" }));
  await t.wait(2);
  let label = await trySwitch("Warden");
  t.check(/in 1 Realm day/.test(label), `switch waits for the gap (${label})`);
  (await t.waitForm(p)).answer(null);
  sys.sendScriptEvent("realm:calendar", JSON.stringify({ day: 13, doy: 13, year: 1, season: "thaw", from: "test" }));
  await t.wait(2);
  label = await trySwitch("Warden");
  t.check(/100 Crowns/.test(label), `first switch costs 100 (${label})`);
  cf = await t.waitForm(p);
  next = t.waitForm(p);
  cf.answer(0); // confirm
  await t.waitMessage(p, /costs 100 Crowns/, { timeout: 40 });
  (await next).answer(null);
  crowns(150);
  label = await trySwitch("Warden");
  cf = await t.waitForm(p);
  next = t.waitForm(p);
  cf.answer(0);
  await t.waitMessage(p, /become a Warden \(100 Crowns\)/, { timeout: 40 });
  (await next).answer(null);
  t.check(crownsNow() === 50, `switch took 100 Crowns once (${crownsNow()})`);
  await t.waitUntil(() => last()?.calling === "warden", { timeout: 40, message: "realm:calling names warden" });

  // --- Sharp Eye (+10% to monsters): a hit deals 10% more, as one hit (no recursion).
  setLevel("combat", 40);
  setLevel("exploration", 40);
  await t.wait(2);
  const hurts = new Map();
  t.world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => hurts.set(hurtEntity.id, (hurts.get(hurtEntity.id) ?? 0) + 1));
  const hit = async (dmg) => {
    const at = { x: p.location.x + 3, y: p.location.y, z: p.location.z };
    const z = t.dimension.spawnEntity("minecraft:husk", at);
    z.addTag("calltest");
    await t.wait(2);
    t.server(`/damage @e[tag=calltest,c=1] ${dmg} entity_attack entity @a[name=Alex]`);
    await t.wait(20);
    const h = z.isValid ? z.getComponent("health").currentValue : 0;
    const n = hurts.get(z.id) ?? 0;
    const alive = z.isValid && h > 0; // a dying mob stays valid through its death animation
    if (z.isValid) z.remove();
    await t.wait(2);
    return { h, n, alive };
  };
  const plain = await hit(6);
  await spend("Sharp Eye", true);
  await spend("Sharp Eye", true);
  await t.wait(5);
  const sharp = await hit(6);
  t.log(`husk after 6 damage: ${plain.h} plain, ${sharp.h} with Sharp Eye II`);
  t.check(sharp.h < plain.h - 0.3 && sharp.h > plain.h - 1.2, "Sharp Eye II takes about 10% more");
  t.check(plain.n === 1 && sharp.n === 1, `one hurt event per hit (${plain.n}, ${sharp.n})`);
  // A hit that leaves under 1 health: the bonus finishes it with one real hit (two hurt events, not more), and the kill counts.
  const xpBefore = obj("skill_combat").getScore(p) ?? 0;
  const kill = await hit(19);
  t.log(`finishing hit: alive ${kill.alive}, hurt events ${kill.n}`);
  t.check(!kill.alive, "the bonus finished the husk");
  t.check(kill.n <= 2, `no recursion on the finishing bonus (${kill.n} hurt events)`);
  t.check((obj("skill_combat").getScore(p) ?? 0) > xpBefore, "the kill gave Combat XP");

  // --- Guilds: the top rank's title is "Miners' Guildmaster".
  obj("rep_miners").setScore(p, 1490);
  sys.sendScriptEvent("realm:rep_add", JSON.stringify({ player: p.id, guild: "miners", amount: 20, reason: "test" }));
  await t.waitUntil(() => events.some((e) => e.id === "realm:title_unlock" && e.m.title === "Miners' Guildmaster"), { timeout: 60, message: "Miners' Guildmaster title" });
  t.check(!events.some((e) => e.id === "realm:title_unlock" && e.m.from === "guilds_bp" && e.m.title === "Master Miner"), "no Master Miner from Guilds");
}
