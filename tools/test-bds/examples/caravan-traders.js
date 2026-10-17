// Merchant Caravan 1.2.0: each trader sells goods of their own, a trader's name is sent again when a player comes
// near (a game can show a minecraft:npc as "NPC" until its name changes while it watches), and a trader saved as
// its skin structure (`realm_caravan:<n>`, what the NPC editor tap does after 5 s) comes back from it, with this
// visit's tags only, when it goes missing and on the next visit.
//   node tools/test-bds/run.mjs --quiet --only caravan_bp,crowns_bp --scenario tools/test-bds/examples/caravan-traders.js --timeout 1000
export default async function (t) {
  const spawn = t.world.getDefaultSpawnLocation();
  const { top } = await t.loadArea(spawn.x, spawn.z, { radius: 3 });
  const y = (top?.y ?? 70) + 1;
  const p = await t.player("Ann", { op: true, x: spawn.x + 30, y, z: spawn.z + 30 });
  const traders = () => t.dimension.getEntities({ tags: ["realm:caravan"], type: "minecraft:npc" });
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `c_${key}`, pack: "caravan_bp", key, value }));
  cfg("stayMinutes", 5); // the shortest visit, so the next one can come
  await t.wait(5);

  let since = t.tick;
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran");
  await t.waitMessage(p, /caravan has arrived/, { since, timeout: 100 });
  const first = await t.waitUntil(() => (traders().length === 3 ? traders() : undefined), { timeout: 400, interval: 20, message: "3 traders" });
  t.log(`traders: ${first.map((e) => e.nameTag).join(", ")}`);

  // Names: walk up and watch the name tags for 6 s.
  p.teleport({ x: spawn.x + 4, y, z: spawn.z + 4 });
  /** @type {Map<string, Set<string>>} */
  const seen = new Map(first.map((e) => [e.id, new Set()]));
  for (let k = 0; k < 120; k++) {
    for (const e of first) if (e.isValid) seen.get(e.id)?.add(e.nameTag);
    await t.wait(1);
  }
  for (const e of first) {
    const tags = [...(seen.get(e.id) ?? [])];
    const base = tags.find((n) => !n.endsWith("§r")) ?? "";
    t.check(/Zahir|Marisol|Fennick/.test(base), `a trader is named (${base})`);
    t.check(tags.includes(base) && tags.includes(`${base}§r`), `${base}: the name was sent again when Ann came near (${tags.length} forms seen)`);
  }

  // Goods: tap each trader and read the shop's buttons.
  /** @type {string[][]} */
  const shops = [];
  for (const e of first) {
    const formAt = t.forms(p).length;
    t.answerForm(p, null);
    const ok = p.interactWithEntity(e);
    await t.wait(10);
    const form = t.forms(p).slice(formAt)[0];
    if (!form) {
      t.log(`tap on ${e.nameTag}: interactWithEntity=${ok}, no form (simulated taps may not reach packs)`);
      continue;
    }
    const goods = (form.buttons ?? []).map((/** @type {any} */ b) => String(b.text ?? b).split("\n")[0]).filter((x) => !/Sell to the caravan|Goodbye/.test(x));
    t.log(`${form.title}: ${goods.join(", ")}`);
    shops.push(goods);
  }
  if (shops.length >= 2) {
    const all = shops.flat();
    t.check(shops.every((s) => s.length === 5), `5 goods per trader (${shops.map((s) => s.length).join(", ")})`);
    t.check(new Set(all).size === all.length, "no two traders sell the same good");
  }

  // Skin: save trader 0 as its structure (with a marker tag standing in for a skin), then remove it.
  const zero = first.find((e) => e.hasTag("realm:caravan_trader:0"));
  t.assert(zero, "trader 0 found");
  const z0 = /** @type {import("@minecraft/server").Entity} */ (zero);
  z0.addTag("test:skin");
  const l = z0.location;
  const from = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  const sm = t.world.structureManager;
  if (sm.get("realm_caravan:0")) sm.delete("realm_caravan:0");
  sm.createFromWorld("realm_caravan:0", t.dimension, from, { ...from, y: from.y + 1 }, { includeBlocks: false, includeEntities: true });
  const visitTag = z0.getTags().find((x) => x.startsWith("realm:caravan_v:"));
  z0.remove();
  const back = await t.waitUntil(() => traders().find((e) => e.hasTag("realm:caravan_trader:0")), { timeout: 400, interval: 20, message: "trader 0 back" });
  t.check(back.hasTag("test:skin"), "a missing trader comes back from its saved skin");
  t.check(back.getTags().filter((x) => x.startsWith("realm:caravan_v:")).length === 1 && back.hasTag(String(visitTag)), "with this visit's tag only");

  // Next visit: the skin comes along, without the old visit's tag.
  await t.waitMessage(p, /packed up and left/, { timeout: 6400 });
  since = t.tick;
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran again");
  await t.waitMessage(p, /caravan has arrived/, { since, timeout: 100 });
  const next = await t.waitUntil(
    () => traders().find((e) => e.hasTag("realm:caravan_trader:0") && !e.hasTag(String(visitTag))),
    { timeout: 400, interval: 20, message: "trader 0 of the next visit" },
  );
  t.check(next.hasTag("test:skin"), "the next visit's trader 0 is placed from the saved skin");
  t.check(next.getTags().filter((x) => x.startsWith("realm:caravan_v:")).length === 1, `one visit tag (${next.getTags().join(", ")})`);
  await t.seconds(4);
  t.check(traders().filter((e) => e.hasTag("realm:caravan_trader:0")).length === 1, "trader 0 exists once");
  t.check(traders().length === 3, `3 traders (${traders().length})`);
}
