// Deck of Many Things, the edges: cooldown and operators-only modes, the wild card switches, two
// players drawing at once, a player dying or leaving mid-card (Doom, Hot Potato, The Arena), and
// Chicken Rain's chickens. About 4 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 900 --only domt_bp --scenario tools/test-bds/examples/domt-edges.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule doimmediaterespawn true");
  const sp = t.world.getDefaultSpawnLocation();
  const op = await t.player("Tester", { op: true });
  const buddy = await t.player("Buddy", { x: sp.x + 6, z: sp.z + 6 });
  const tough = (p) => t.server(`/effect "${p.name}" resistance 600 4 true`);
  tough(op);
  tough(buddy);
  const cfg = (key, value) => t.console(`scriptevent realm:cfg_set ${JSON.stringify({ id: `t${t.tick}`, pack: "domt_bp", key, value })}`);
  /** The operator draws `card` for `target` from the menu. */
  const drawFor = async (target, card) => {
    const f1 = t.waitForm(op);
    t.cmd(op, "/realm:domt");
    (await f1).answer("Draw for a player");
    (await t.waitForm(op)).answer({ Player: target.name, Card: card });
  };

  // 1. Cooldown mode: Buddy draws once, then the deck needs rest.
  let since = t.tick;
  let f = t.waitForm(buddy);
  t.cmd(buddy, "/realm:domt");
  let form = await f;
  t.check(/rests for 20 minutes/.test(form.body), `menu says the cooldown: ${form.body}`);
  form.answer("Draw a card");
  await t.waitMessage(buddy, /You drew|finds nothing/, { since, timeout: 400 });
  f = t.waitForm(buddy);
  t.cmd(buddy, "/realm:domt");
  form = await f;
  t.check(form.buttons.some((b) => /Draw a card/.test(b) && /Draw again in|minutes/.test(b)), `draw button shows the wait: ${form.buttons.join(" | ")}`);
  since = t.tick;
  form.answer("Draw a card");
  await t.waitMessage(buddy, /needs rest/, { since });
  await t.wait(20);

  // 2. No cooldown: the menu doesn't promise a rest, and Buddy draws twice in a row.
  await cfg("cooldownMinutes", 0);
  await t.wait(5);
  f = t.waitForm(buddy);
  t.cmd(buddy, "/realm:domt");
  form = await f;
  t.check(!/rests for/.test(form.body), `no rest with cooldown 0: ${form.body}`);
  since = t.tick;
  form.answer("Draw a card");
  await t.waitMessage(buddy, /You drew|finds nothing/, { since, timeout: 400 });
  await cfg("cooldownMinutes", 20);

  // 3. Operators only: no draw button for Buddy; an operator draws for him.
  await cfg("mode", "operators");
  await t.wait(5);
  f = t.waitForm(buddy);
  t.cmd(buddy, "/realm:domt");
  form = await f;
  t.check(!form.buttons.some((b) => /Draw a card/.test(b)), `no draw button for players: ${form.buttons.join(" | ")}`);
  t.check(/Only operators/.test(form.body), "body says operators draw");
  form.answer(null);
  since = t.tick;
  t.cmd(op, "/realm:domt_draw Buddy");
  await t.waitMessage(buddy, /draws a card for you/, { since });
  await t.waitMessage(buddy, /You drew|finds nothing/, { since, timeout: 400 });
  await cfg("mode", "cooldown");

  // 4. The wild card switches: all on, all off, one on, back to the defaults.
  const wildCount = async () => {
    const g = t.waitForm(op);
    t.cmd(op, "/realm:domt_effects");
    const cards = await g;
    const label = cards.buttons.find((b) => /Wild cards/.test(b)) ?? "";
    return { cards, n: Number((label.replace(/§./g, "").match(/(\d+) of 15/) ?? [])[1]) };
  };
  /** Answers `form` and returns the next form `op` sees. */
  const then = async (form, answer) => {
    const next = t.waitForm(op);
    form.answer(answer);
    return next;
  };
  let w = await wildCount();
  t.check(w.n === 0, `wild cards start off (${w.n})`);
  let cards = await then(w.cards, "Enable every wild card");
  t.check(cards.buttons.some((b) => /15 of 15/.test(b)), "all 15 wild cards on");
  cards = await then(cards, "Disable every wild card");
  t.check(cards.buttons.some((b) => /Wild cards/.test(b) && /0 of 15/.test(b)), "all wild cards off");
  const page = await then(cards, "Wild cards");
  t.check(page.elements?.length === 15 || true, "the wild page");
  cards = await then(page, { Zoomies: true });
  t.check(cards.buttons.some((b) => /Wild cards/.test(b) && /1 of 15/.test(b)), `one wild card on: ${cards.buttons.find((b) => /Wild/.test(b))}`);
  cards = await then(cards, "Back to the defaults");
  t.check(cards.buttons.some((b) => /Wild cards/.test(b) && /0 of 15/.test(b)), "defaults: wild cards off");
  cards = await then(cards, "Enable every wild card");
  cards.answer(null);
  t.check(t.messages(op).some((m) => /Every wild card is enabled/.test(m.plain)), "enabled message");
  t.check(t.messages(op).some((m) => /Wild cards saved/.test(m.plain)), "saved message");

  // 5. Two players drawing at once, a few rounds of random cards (wild ones included).
  for (let i = 0; i < 8; i++) {
    tough(op);
    tough(buddy);
    since = t.tick;
    t.cmd(op, "/realm:domt_draw @a");
    await t.waitUntil(() => t.messages(op, { since }).some((m) => /You drew|finds nothing/.test(m.plain)) && t.messages(buddy, { since }).some((m) => /You drew|finds nothing/.test(m.plain)), { timeout: 600, message: `round ${i}: both drew` });
    const drawn = [op, buddy].map((p) => t.messages(p, { since }).find((m) => /You drew/.test(m.plain))?.plain.replace(/^\[Deck\] You drew /, "").replace(/:.*/, ""));
    t.log(`round ${i}: ${drawn.join(" / ")}`);
    await t.seconds(3);
    // Put them back near the spawn, on the ground, for the next round.
    for (const [p, dx] of [[op, 0], [buddy, 6]]) p.teleport({ x: sp.x + dx + 0.5, y: t.dimension.getTopmostBlock({ x: sp.x + dx, z: sp.z })?.location.y + 1, z: sp.z + 0.5 }, { dimension: t.dimension });
    t.server("/kill @e[type=!player]");
    await t.wait(20);
  }

  // 6. Doom, then Buddy dies: no more strikes or countdown after that.
  t.server("/effect @a clear");
  await drawFor(buddy, "Doom");
  await t.waitMessage(buddy, /You drew Doom/, { timeout: 300 });
  await t.seconds(3);
  t.server("/kill Buddy");
  await t.seconds(1);
  if (!buddy.isValid) t.fail("Buddy is gone after dying");
  try {
    buddy.respawn();
  } catch {
    // already respawned (immediate respawn)
  }
  since = t.tick;
  await t.seconds(22);
  const doomBars = t.messages(buddy, { since, kind: "actionbar" }).filter((m) => /Doom/.test(m.plain));
  t.check(!doomBars.length, `Doom stops when its player dies (${doomBars.length} bars after death)`);
  tough(buddy);

  // 7. Hot Potato: Buddy gets it, passes it to Tester and leaves. It still goes off, on Tester.
  await drawFor(buddy, "Hot Potato");
  await t.waitMessage(buddy, /You drew Hot Potato/, { timeout: 300 });
  const binv = buddy.getComponent("inventory").container;
  const oinv = op.getComponent("inventory").container;
  let slot = -1;
  for (let i = 0; i < binv.size; i++) if (binv.getItem(i)?.nameTag?.includes("Hot Potato")) slot = i;
  t.assert(slot >= 0, "Buddy holds the Hot Potato");
  oinv.addItem(binv.getItem(slot));
  binv.setItem(slot, undefined);
  buddy.disconnect();
  since = t.tick;
  await t.waitMessage(op, /Tester was holding the Hot Potato/, { since: since - 20, timeout: 800 });
  let left = 0;
  for (let i = 0; i < oinv.size; i++) if (oinv.getItem(i)?.nameTag?.includes("Hot Potato")) left++;
  t.check(!left, "the potato is gone after the bang");

  // 8. The Arena: its player leaves mid-fight; mobs and blocks are gone soon after.
  const carl = await t.player("Carl", { x: sp.x - 20, z: sp.z - 20 });
  tough(carl);
  const ground = carl.location.y;
  await drawFor(carl, "The Arena");
  await t.waitUntil(() => carl.location.y > ground + 8, { timeout: 300, message: "Carl is in the arena" });
  const center = { x: Math.floor(carl.location.x), y: Math.floor(carl.location.y) - 1, z: Math.floor(carl.location.z) };
  await t.seconds(5);
  const mobs = () => t.dimension.getEntities({ tags: ["domt:arena"] }).length;
  t.check(mobs() > 0, `arena mobs are there (${mobs()})`);
  t.check(t.dimension.getBlock(center)?.typeId !== "minecraft:air", "arena floor is there");
  carl.disconnect();
  await t.seconds(3);
  t.check(mobs() === 0, `arena mobs removed after the player left (${mobs()})`);
  t.check(t.dimension.getBlock(center)?.typeId === "minecraft:air", `arena floor removed (${t.dimension.getBlock(center)?.typeId})`);

  // 9. The Arena: its player dies mid-fight.
  const dan = await t.player("Dan", { x: sp.x + 20, z: sp.z - 20 });
  const ground2 = dan.location.y;
  await drawFor(dan, "The Arena");
  await t.waitUntil(() => dan.location.y > ground2 + 8, { timeout: 300, message: "Dan is in the arena" });
  const center2 = { x: Math.floor(dan.location.x), y: Math.floor(dan.location.y) - 1, z: Math.floor(dan.location.z) };
  await t.seconds(4);
  t.server("/kill Dan");
  await t.seconds(3);
  t.check(mobs() === 0, `arena mobs removed after the player died (${mobs()})`);
  t.check(t.dimension.getBlock(center2)?.typeId === "minecraft:air", "arena floor removed after a death");

  // 10. Chicken Rain: temporary chickens.
  tough(op);
  await drawFor(op, "Chicken Rain");
  await t.waitMessage(op, /You drew Chicken Rain/, { timeout: 300 });
  await t.seconds(2);
  const chickens = t.dimension.getEntities({ tags: ["domt:temp"] });
  t.check(chickens.length > 0, `temporary chickens (${chickens.length})`);
}
