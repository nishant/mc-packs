// Waystones (waystone_bp) trips: a trip to a waystone that's loaded but walled in is canceled and costs
// nothing, moving cancels the countdown, tapping a waystone (or /realm:waystones_list) during the countdown
// says the trip is on its way, a player who leaves mid-countdown is forgotten without errors, and a trip
// into a chunk that isn't loaded is paid once and lands the player beside the lodestone on the ground once
// the chunk loads.
// Simulated players can't tap a block with an empty hand (no playerInteractWithBlock reaches the pack), so
// taps go through the pack's test hook (/scriptevent realm:waystone_test from the console), which runs the
// same code as a tap. They don't load chunks around them either, so the far chunk is loaded with a ticking
// area after the jump, as a real player's arrival would.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only waystone_bp --scenario tools/test-bds/examples/waystone-trips.js --timeout 500
export default async function (t) {
  const dim = t.dimension;
  const Y = -60; // flat world: grass at -61
  const p = await t.player("Tester", { op: true, x: 0, z: 0 });
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `w_${key}`, pack: "waystone_bp", key, value }));
  const crowns = (who) => t.world.scoreboard.getObjective("crowns")?.getScore(who) ?? 0;
  const standAt = async (who, x, z) => {
    who.teleport({ x: x + 0.5, y: Y, z: z + 0.5 });
    await t.wait(5);
  };
  /** An empty-hand tap on the lodestone at x, z by `who`, through the pack's test hook. */
  const tap = (who, x, z) => t.console(`scriptevent realm:waystone_test ${JSON.stringify({ action: "tap", player: who.name, x, y: Y, z })}`);
  /** Places a lodestone with a "Waystone: <name>" sign beside it and taps it as `who`. */
  const raise = async (who, x, z, name) => {
    dim.getBlock({ x, y: Y, z }).setType("minecraft:lodestone");
    const sign = dim.getBlock({ x, y: Y, z: z + 1 });
    sign.setType("minecraft:standing_sign");
    sign.getComponent("minecraft:sign").setText(`Waystone: ${name}`);
    await t.wait(2);
    const since = t.tick;
    await tap(who, x, z);
    const m = await t.waitMessage(who, /raised the waystone|already a waystone|Put a sign|Write a name/, { since, timeout: 60 });
    t.log(`${name}: ${m.plain}`);
    t.assert(/raised/.test(m.plain), `the waystone ${name} is made`);
  };
  /** Taps the waystone at `from` and picks `dest` in the travel menu. */
  const travel = async (who, from, dest) => {
    const form = t.waitForm(who, { timeout: 60 });
    await tap(who, from.x, from.z);
    const f = await form;
    t.assert(f.buttons.some((b) => b.includes(dest)), `${dest} is in the travel menu (${f.title}: ${f.buttons.join(" | ")})`);
    f.answer(dest);
  };

  // Alpha by the spawn. Beta 117 blocks east: made, then walled in on every side with a stone column over it
  // (the buried search looks 40 blocks straight up), so it's loaded but has no safe spot.
  const A = { x: 3, z: 0 };
  const B = { x: 120, z: 0 };
  await raise(p, A.x, A.z, "Alpha");
  const areaB = await t.loadArea(B.x, B.z, { radius: 2 });
  await raise(p, B.x, B.z, "Beta");
  t.server(`/fill ${B.x - 2} ${Y - 1} ${B.z - 2} ${B.x + 2} ${Y + 3} ${B.z + 2} stone`);
  t.server(`/fill ${B.x} ${Y + 1} ${B.z} ${B.x} ${Y + 42} ${B.z} stone`);
  dim.getBlock({ x: B.x, y: Y, z: B.z }).setType("minecraft:lodestone");
  t.server("/scoreboard objectives add crowns dummy Crowns");
  t.server("/scoreboard players set Tester crowns 50");
  cfg("channelSeconds", 1);
  await t.wait(3);
  t.assert(crowns(p) === 50, `Tester has 50 Crowns (${crowns(p)})`);

  // ---- 1. A walled-in waystone: the trip is canceled and nothing is paid ----
  await travel(p, A, "Beta");
  const walled = await t.waitMessage(p, /walled in|Paid|fizzled|no safe place/, { timeout: 100 });
  t.log(`walled in: ${walled.plain}`);
  t.check(/walled in/.test(walled.plain), "a trip to a walled-in waystone is canceled");
  t.check(crowns(p) === 50, `a canceled trip costs nothing (Tester has ${crowns(p)} Crowns)`);
  t.check(Math.hypot(p.location.x - 0.5, p.location.z - 0.5) < 1, "the player stayed at Alpha");

  // ---- 2. Moving cancels; a tap or the menu during the countdown says the trip is on its way ----
  cfg("channelSeconds", 4);
  await t.wait(3);
  await travel(p, A, "Beta");
  await t.waitMessage(p, /Traveling to Beta in 4/, { timeout: 40 });
  const formsBefore = t.forms(p).length;
  let since = t.tick;
  await tap(p, A.x, A.z);
  const again = await t.waitMessage(p, /already traveling/i, { since, timeout: 30 }).catch(() => undefined);
  t.log(`tap during the countdown: ${again?.plain ?? "(nothing)"}`);
  t.check(again !== undefined, "tapping a waystone during the countdown says the trip is on its way");
  cfg("travelAnywhere", true);
  await t.wait(2);
  since = t.tick;
  t.cmd(p, "/realm:waystones_list");
  const again2 = await t.waitMessage(p, /already traveling/i, { since, timeout: 30 }).catch(() => undefined);
  t.check(again2 !== undefined, "/realm:waystones_list during the countdown says so too");
  cfg("travelAnywhere", false);
  await t.wait(2);
  t.check(t.forms(p).length === formsBefore, `no second travel menu opened (${t.forms(p).length - formsBefore} new forms)`);
  p.teleport({ x: 0.5, y: Y, z: 4.5 });
  const moved = await t.waitMessage(p, /You moved|walled in|Paid|You got hurt/, { timeout: 120 });
  t.log(`moved: ${moved.plain}`);
  t.check(/You moved/.test(moved.plain), "moving more than a block cancels the trip");
  t.check(crowns(p) === 50, `nothing paid for the canceled trip (${crowns(p)})`);

  // ---- 3. A player who leaves during the countdown is forgotten (no errors) ----
  const sinceQ = t.tick;
  const q = await t.player("Leaver", { x: B.x + 3, z: B.z }); // next to Beta: discovered by standing near it
  await t.waitMessage(q, /Waystone discovered: Beta/, { since: sinceQ, timeout: 80 });
  t.server("/scoreboard players set Leaver crowns 50");
  await standAt(q, 0, 0);
  await travel(q, A, "Beta"); // the tap discovers Alpha first, then opens the menu
  await t.waitMessage(q, /Traveling to Beta in 4/, { timeout: 40 });
  q.disconnect();
  await t.wait(120);
  t.log("Leaver left during the countdown; no script error so far");

  // ---- 4. A trip into a chunk that isn't loaded: paid once, lands beside the lodestone on the ground ----
  const D = { x: A.x - 300, z: A.z }; // 300 blocks: 3 Crowns
  const areaD = await t.loadArea(D.x, D.z, { radius: 2 });
  await raise(p, D.x, D.z, "Delta");
  await standAt(p, 0, 0);
  t.server(`/tickingarea remove ${areaD.name}`);
  const unloaded = await t
    .waitUntil(() => dim.getBlock({ x: D.x, y: Y, z: D.z }) === undefined, { timeout: 400, message: "Delta's chunk didn't unload" })
    .then(() => true)
    .catch(() => false);
  t.log(`Delta's chunk unloaded before the trip: ${unloaded}`);
  cfg("channelSeconds", 1);
  await t.wait(3);
  const before = crowns(p);
  await travel(p, A, "Delta");
  const paid = await t.waitMessage(p, /Paid|no safe place|fizzled|walled in|sent you back/, { timeout: 100 });
  t.log(`arrival: ${paid.plain}`);
  const cost = Number(/Paid (\d+) Crown/.exec(paid.plain)?.[1] ?? -1);
  t.check(cost === 3, `paid 3 Crowns for 300 blocks (${paid.plain})`);
  await t.wait(15);
  t.log(`just after the jump Tester is at ${p.location.x.toFixed(1)}, ${p.location.y.toFixed(1)}, ${p.location.z.toFixed(1)}`);
  await t.loadArea(D.x, D.z, { radius: 2 }); // a real player's arrival loads the chunk; simulated players don't
  await t.wait(130); // the last landing check is 100 ticks after the jump
  const at = p.location;
  const feet = dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) });
  const flat = Math.hypot(at.x - (D.x + 0.5), at.z - (D.z + 0.5));
  t.log(`landed at ${at.x.toFixed(1)}, ${at.y.toFixed(1)}, ${at.z.toFixed(1)} (${flat.toFixed(1)} from Delta), feet in ${feet?.typeId}`);
  t.check(flat >= 0.9 && flat <= 3 && Math.abs(at.y - Y) < 0.6, "lands beside the lodestone, on the ground, not on top of it");
  t.check(feet?.typeId === "minecraft:air", "not inside a block");
  t.check(crowns(p) === before - 3, `paid once (${before} -> ${crowns(p)})`);
  t.check(!t.messages(p).some((m) => /sent you back/.test(m.plain)), "not sent back");
  t.log(`Beta's area ${areaB.name} stays; ${t.forms(p).length} forms shown to Tester in all`);
}
