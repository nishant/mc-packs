// Counting down: the story tracker's Side HUD box is a mini quest log whose steps count down, Mob Health says "HP" and
// "defeated", and a Daily Quests kill note counts down too. Run with
//   node tools/test-bds/run.mjs --quiet --only saga_bp,mobhp_bp,quests_bp --scenario tools/test-bds/examples/saga-countdown.js --timeout 300
// Checks, for a player on "The Drowned Choir" (defeat 12 drowned, fish 5) with the tracker in its quest box (next to the default Right 4):
// 1. One drowned down: within 2 seconds the box reads "Drowned Bell" on its first line, "Defeat 11 more drowned", and
//    the other open step in gray, "- Catch 5 things with a fishing rod".
// 2. Six down: "Defeat 6 more drowned", and no quarter note ("6/12") written over the box.
// 3. Mob Health: a hit that doesn't kill shows "18/20 HP" (or 19/20 when the drowned wears armor); the killing hit shows "defeated".
// 4. Daily Quests: the "Defeat 10 zombies" quest (drowned count) notes "Defeat 7 more zombies 3/10" on the action bar.
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
    } catch {}
  }, { namespaces: ["realm"] });

  const ann = await t.player("Ann", { op: true });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  /** What a pack wrote to Ann's boxes since a tick. */
  const wrote = (from, since, slot) => sides.filter((s) => s.tick >= since && s.m.player === ann.id && s.m.from === from && (!slot || s.m.slot === slot)).map((s) => String(s.m.text));
  const tracker = (since) => wrote("saga", since, "quest"); // the quest box, next to Right 4

  // Start "The Drowned Choir" (the scenario plays Warden Reyes: realm:npc_choose, no Townsfolk pack).
  send("realm:saga_debug", { player: "Ann", action: "jump", story: "drowned_bell", chapter: "choir" });
  await t.wait(10);
  let since = t.tick;
  let next = t.waitForm(ann, { timeout: 300 });
  send("realm:npc_choose", { player: ann.id, npc: "reyes", pack: "saga_bp", key: "start:drowned_bell" });
  for (let k = 0; k < 20; k++) {
    const f = await next;
    const last = !f.buttons.includes("Next");
    if (!last) next = t.waitForm(ann, { timeout: 300 });
    f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b))) : "Next");
    if (last) break;
  }
  await t.waitMessage(ann, /The Drowned Bell: The Drowned Choir/, { since, timeout: 300 });
  await t.console(`scriptevent realm:quests_test ${JSON.stringify({ player: "Ann", ids: ["kill_zombies"] })}`);
  await t.wait(40);

  const at = (dx = 2) => ({ x: ann.location.x + dx, y: ann.location.y, z: ann.location.z });
  const kill = () => {
    const d = t.dimension.spawnEntity("minecraft:drowned", at());
    d.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: ann });
  };

  // --- 1. One drowned ---------------------------------------------------------------------------------------
  since = t.tick;
  kill();
  const box1 = await t.waitUntil(() => tracker(since).find((s) => s.includes("Defeat 11 more drowned")), { timeout: 40, message: `tracker box counts down after 1 kill; wrote ${JSON.stringify(tracker(since))}` });
  t.log(`1. box after 1 kill: ${JSON.stringify(box1)}`);
  const lines = box1.split("\n");
  t.check(lines[0].replace(/§./g, "") === "Drowned Bell: The Drowned Choir" && lines[0].startsWith("§s§q§4§b"), `first line is the story's short name in aqua and the chapter: ${JSON.stringify(lines[0])}`);
  t.check(lines.includes("§7Steps, in any order:"), `says the steps go in any order: ${JSON.stringify(lines)}`);
  t.check(lines.includes("§f[ ] Catch 5 things with a fishing rod"), `a checklist row for the fishing step: ${JSON.stringify(lines)}`);

  // --- 2. Six drowned: no quarter note over the box ---------------------------------------------------------
  const before6 = t.tick;
  for (let k = 0; k < 5; k++) {
    kill();
    await t.wait(4);
  }
  const box6 = await t.waitUntil(() => tracker(before6).find((s) => s.includes("Defeat 6 more drowned")), { timeout: 40, message: `tracker box after 6 kills; wrote ${JSON.stringify(tracker(before6))}` });
  t.log(`2. box after 6 kills: ${JSON.stringify(box6)}`);
  await t.wait(20);
  const quarter = wrote("saga", since).filter((s) => /\d+\/12/.test(s));
  t.check(!quarter.length, `no quarter note in the box: ${JSON.stringify(quarter)}`);
  const bar = t.messages(ann, { kind: "actionbar", since, pack: "saga_bp" }).map((m) => m.text);
  t.check(!bar.length, `no saga action bar note either: ${JSON.stringify(bar)}`);

  // --- 4. Daily Quests note (3 drowned crossed the 2.5 quarter; 5 crossed 5) -------------------------------
  const qn = t.messages(ann, { kind: "actionbar", since, pack: "quests_bp" }).map((m) => m.plain);
  t.log(`4. quest notes: ${JSON.stringify(qn)}`);
  t.check(qn.some((s) => s === "Quest: Defeat 7 more zombies 3/10"), "quest note at 3/10 counts down");
  t.check(qn.some((s) => s === "Quest: Defeat 5 more zombies 5/10"), "quest note at 5/10 counts down");

  // --- 3. Mob Health ----------------------------------------------------------------------------------------
  await t.wait(70); // the earlier kill boxes have run out
  const target = t.dimension.spawnEntity("minecraft:drowned", at(-2));
  await t.wait(2);
  since = t.tick;
  target.applyDamage(2, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: ann });
  const hurt = await t.waitUntil(() => wrote("mobhp", since).find((s) => s.includes(" HP ")), { timeout: 20, message: `mobhp box for a hit; wrote ${JSON.stringify(wrote("mobhp", since))}` });
  t.log(`3a. mobhp hit: ${JSON.stringify(hurt)}`);
  t.check(/(^|\D)1\d\/20 HP /.test(hurt), `non-lethal hit shows the health left out of 20 (a drowned may wear armor, so 18 or 19): ${hurt}`);
  await t.wait(12);
  since = t.tick;
  target.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: ann });
  const dead = await t.waitUntil(() => wrote("mobhp", since).find((s) => s.includes("defeated")), { timeout: 20, message: `mobhp box for the killing hit; wrote ${JSON.stringify(wrote("mobhp", since))}` });
  t.log(`3b. mobhp kill: ${JSON.stringify(dead)}`);
  t.check(!/\d+\/\d+/.test(dead), "killing hit shows no 0/20");
}
