// Guilds: a perk note above the hotbar sends realm:actionbar with from "guilds_bp" (the action bar protocol: other
// steady lines, like an expedition's run line, ignore only their own requests, so they need to know who sent it).
// Here: Wardens' Journeyman (the perk rank) and a champion slain by the player give the Strength note.
// node tools/test-bds/run.mjs --quiet --only guilds_bp --scenario tools/test-bds/examples/guilds-perk-note.js --timeout 420
export default async function (t) {
  const p = await t.player("Ward");
  /** @type {{ tick: number, m: any }[]} */
  const requests = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:actionbar") return;
      try {
        requests.push({ tick: t.tick, m: JSON.parse(message) });
      } catch {
        // not JSON
      }
    },
    { namespaces: ["realm"] },
  );
  let since = t.tick;
  t.system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: p.id, guild: "wardens", amount: 400, reason: "a test" }));
  await t.waitMessage(p, /Wardens' Guild: you are now a Journeyman/, { since });

  since = t.tick;
  t.system.sendScriptEvent("realm:champion_slain", JSON.stringify({ player: p.id, name: "Gerald the Shielded", helpers: [] }));
  await t.waitMessage(p, /Wardens' Guild: Strength I/, { since, kind: "actionbar" });
  await t.waitUntil(() => requests.some((r) => r.tick >= since && r.m.player === p.id), { timeout: 40, message: "a realm:actionbar request came with the note" });
  const req = requests.find((r) => r.tick >= since && r.m.player === p.id);
  t.check(req?.m.from === "guilds_bp", `the request names guilds_bp (${JSON.stringify(req?.m)})`);
  t.check(req?.m.ticks === 50, `it holds the bar 50 ticks (${req?.m.ticks})`);
  t.check(!!p.getEffect("strength"), "the Wardens' perk gave Strength");
}
