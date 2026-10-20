// Treasure Maps' Warmer / Colder line above the hotbar is a steady line of the action bar protocol (O55): it announces
// every redraw with its rank (`steady: 35`), waits while a note or a higher-ranked line holds the player's bar (so the
// Elytra HUD, the relic readouts and an expedition's run line can draw over it), and still draws over lower ones.
// Before, its request carried no rank and it never listened: it kept the bar for as long as the map was held.
// The other lines are played by requests from this scenario (a note, then ranks 50, 45, 40 and 30), the map by the real
// pack: /realm:maps_give, the map in hand, the player's `where` set to "hotbar".
//   node tools/test-bds/run.mjs --quiet --flat --only maps_bp --scenario tools/test-bds/examples/maps-warmth-steady.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const reqs = [];
  /** @type {any[]} */
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ { id, message }) => {
      try {
        if (id === "realm:actionbar") reqs.push({ tick: sys.currentTick, m: JSON.parse(message) });
        else if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const p = await t.player("Seeker", { op: true, gameMode: "survival" });
  await t.wait(20);
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "w1", pack: "maps_bp", key: "where", value: "hotbar", player: p.id }));
  const ack = await t.waitUntil(() => acks.find((a) => a.id === "w1"), { timeout: 40, message: "ack where=hotbar" });
  t.assert(ack.ok, `where=hotbar: ${ack.error ?? "ok"}`);

  const since = t.tick;
  t.assert(t.cmd(p, `/realm:maps_give ${p.name}`).ok, "maps_give");
  await t.waitMessage(p, /treasure map|first clue/i, { since, timeout: 100 });
  const inv = p.getComponent("minecraft:inventory").container;
  const hold = () => {
    for (let i = 0; i < inv.size; i++) if (String(inv.getItem(i)?.nameTag ?? "").includes("Treasure Map")) return (p.selectedSlotIndex = i);
    return -1;
  };
  t.assert(hold() >= 0, "the map is in the inventory");
  const lines = (/** @type {number} */ from, until = Infinity) => t.messages(p, { kind: "actionbar", pack: "maps_bp", since: from }).filter((m) => m.tick < until);
  const mine = (/** @type {number} */ from, until = Infinity) => reqs.filter((r) => r.tick >= from && r.tick < until && r.m.from === "maps_bp" && r.m.player === p.id);
  const hold1 = (/** @type {number} */ ticks, /** @type {object} */ extra) => sys.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks, ...extra }));

  // 1. With the map in hand the line shows, and every request carries its rank.
  const start = t.tick;
  await t.waitUntil(() => lines(start).length >= 2, { timeout: 200, message: "the Warmer / Colder line shows above the hotbar" });
  t.log(`first line: ${lines(start)[0].plain}`);
  const first = mine(start);
  t.check(first.length >= 2 && first.every((r) => r.m.steady === 35 && r.m.ticks === 45), `its requests carry the rank 35 and a 45-tick hold (${JSON.stringify(first.at(-1)?.m)})`);

  // 2. A note (no rank) from another pack holds it off the bar; it keeps announcing, and comes back after.
  const noteAt = t.tick;
  hold1(100, { from: "test_note" });
  await t.wait(90);
  t.log(`during a 100-tick note: ${lines(noteAt + 2, noteAt + 95).length} lines, ${mine(noteAt + 2, noteAt + 95).length} requests`);
  t.check(lines(noteAt + 2, noteAt + 95).length === 0, "a note holds the line off the bar");
  t.check(mine(noteAt + 2, noteAt + 95).length >= 1, "it still announces itself while it waits");
  await t.waitUntil(() => lines(noteAt + 100).length > 0, { timeout: 120, message: "the line comes back after the note" });

  // 3. Ranks above 35 hold it: 50 (Elytra HUD), 45 (relic readouts), 40 (an expedition's run line).
  for (const [from, rank] of [["elytra_bp", 50], ["relics_bp", 45], ["expedition_bp", 40]]) {
    const at = t.tick;
    for (let i = 0; i < 9; i++) {
      hold1(30, { from, steady: rank });
      await t.wait(10);
    }
    t.log(`${from} (${rank}): ${lines(at + 5, at + 85).length} Warmer / Colder lines in 80 ticks`);
    t.check(lines(at + 5, at + 85).length === 0, `a steady line of rank ${rank} holds it off the bar`);
    await t.waitUntil(() => lines(at + 90).length > 0, { timeout: 120, message: `the line comes back after the rank ${rank} line stops` });
  }

  // 4. Lower ranks don't: build mode (30), the finder (25), the story tracker (20) wait for it instead.
  for (const [from, rank] of [["build_bp", 30], ["find_bp", 25], ["saga_bp", 20]]) {
    const at = t.tick;
    for (let i = 0; i < 9; i++) {
      hold1(30, { from, steady: rank });
      await t.wait(10);
    }
    t.check(lines(at + 5, at + 95).length >= 1, `a steady line of rank ${rank} does not hold it`);
  }

  // 5. A background line (the Party HUD) never holds it either.
  const bg = t.tick;
  for (let i = 0; i < 9; i++) {
    hold1(30, { from: "party_bp", steady: 10, background: true });
    await t.wait(10);
  }
  t.check(lines(bg + 5, bg + 95).length >= 1, "a background line does not hold it");

  // 6. The map put away: it stops announcing within its hold, so lower lines get the bar back.
  const away = t.tick;
  const slot = hold();
  inv.clearAll();
  p.selectedSlotIndex = (slot + 1) % 9;
  await t.wait(100);
  t.check(mine(away + 60).length === 0, `no request after the map is put away (${mine(away + 60).length})`);
}
