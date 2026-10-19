// C13 on the genuine 67-member Realm Bundle: one add-on, pack data kept, production handlers not patched.
// PowerShell must not use npm run bundle -- --all (that drops --all). Build and stage with Node:
//   node tools/bundle.mjs --all
//   node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>
// The hook prints the run command. It is run.mjs --quiet --flat --bundle <stage>/realm_bundle
// --scenario tools/test-bds/examples/full-bundle-protocols.js --timeout 1200.
// suite.mjs does not stage a --bundle header, so this file has no suite run line.
//
// What a pass means:
//   callback-replay: harness:c13_tap hands one event object to the production beforeEvents listeners
//   in bundle registration order. That is not an engine delivery and not a physical tap.
//   native-emission: a simulated-player use or break that the engine actually delivered. A zero count
//   is reported and is not treated as a pass of the engine path. Empty-hand taps often emit nothing.
// A pass does not accept pixels, the resource bundle, or an owner import.
export default async function (t) {
  const bundle = Array.isArray(t.bundle) ? t.bundle[0] : undefined;
  t.assert(bundle && bundle.members.length >= 67, "run with --bundle of the staged full Realm Bundle (hook --from dist/realm_bundle.mcpack)");
  const instrument = new Set(["__c13_tap", "__events_count", "probe_bp"]);
  const real = bundle.members.filter((m) => !instrument.has(m));
  t.assert(real.length === 67, `the staged bundle imports 67 realm packs (${real.length})`);
  t.assert(bundle.members.includes("__c13_tap") && bundle.members.includes("probe_bp"), "the tap relay and the W11 probe are in this add-on");
  t.log(`bundle ${bundle.folder}: ${real.length} realm packs, mode will be labeled per tap`);

  const seat = t.mc.EntityTypes.get("realm:seat");
  const rocket = t.mc.ItemTypes.get("custom:nos_rocket");
  const discType = t.mc.ItemTypes.get("custom:music_disc_run_away");
  t.check(!!seat, "realm:seat is registered (chairs entity data, not a scripts-only bundle)");
  t.check(!!rocket && !!discType, "custom:nos_rocket and custom:music_disc_run_away are registered (item data kept)");

  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
    let m;
    try { m = JSON.parse(ev.message || "null"); } catch { m = undefined; }
    events.push({ id: ev.id, m, raw: ev.message });
  }, { namespaces: ["realm", "harness"] });
  const of = (id, since) => events.slice(since).filter((e) => e.id === id);
  const mark = () => events.length;
  const send = (id, msg) => t.system.sendScriptEvent(id, typeof msg === "string" ? msg : JSON.stringify(msg));

  await t.wait(100);
  let at = mark();
  send("harness:events_report", "");
  await t.wait(10);
  const report = of("harness:events_reply", at)[0]?.m;
  t.assert(report, "the W11 listener counter answered");
  t.check(report.notOne.length === 0, `one native realm listener per member (not one: ${JSON.stringify(report.notOne)})`);
  t.check(report.direct.length === 0, `subscriptions come from script-events.js (others: ${JSON.stringify(report.direct)})`);
  t.check(report.packs === 68 && report.total === 68, `68 listeners: 67 packs plus the probe (${report.total} for ${report.packs})`);
  t.check(JSON.stringify(report.ns) === '["realm"]', `realm namespace only (${JSON.stringify(report.ns)})`);

  at = mark();
  send("realm:help_ping", "");
  send("realm:diag_ping", { id: "c13" });
  await t.wait(60);
  const helps = of("realm:help_pong", at).map((e) => e.raw);
  t.check(helps.length === 68 && new Set(helps).size === 68, `help answers once from 67 packs plus the probe (${helps.length})`);
  const diags = of("realm:diag_pong", at).filter((e) => e.m?.id === "c13").map((e) => e.m);
  const shared = [...new Set(diags.map((d) => d.shared))];
  t.check(diags.length === 68 && shared.length === 1 && shared[0] === 68, `one diag registry of 68 (shared: ${shared.join(",") || "none"}, answers ${diags.length})`);

  const op = await t.player("Owner", { op: true, gameMode: "survival" });
  await dismissJoin(t, op);
  send("realm:cfg_set", { id: "en", pack: "claims_bp", key: "enabled", value: true });
  await t.wait(5);
  t.answerForm(op, "Claim this land");
  t.assert(t.cmd(op, "/realm:claim").ok, "/realm:claim ran");
  t.log((await t.waitMessage(op, /Claimed/, { timeout: 80 })).plain);
  const base = { x: Math.floor(op.location.x), y: Math.floor(op.location.y), z: Math.floor(op.location.z) };
  const dim = t.dimension;
  const visitor = await t.player("Visitor", { x: base.x + 8, z: base.z + 8, gameMode: "survival" });
  await dismissJoin(t, visitor);

  const results = [];
  const native = [];
  t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "harness:c13_tap_result") results.push(JSON.parse(ev.message));
    else if (ev.id === "harness:c13_native_result") native.push(JSON.parse(ev.message));
  }, { namespaces: ["harness"] });
  let tapId = 0;
  const replay = async (p, spot, extra = {}) => {
    const id = ++tapId;
    send("harness:c13_tap", { id, player: p.name, ...spot, ...extra });
    await t.waitUntil(() => results.find((r) => r.id === id), { timeout: 40, message: `callback-replay ${id}` });
    const r = results.find((x) => x.id === id);
    t.assert(r.mode === "callback-replay", `tap ${id} is labeled callback-replay (${r.mode})`);
    t.assert(!r.error, `callback-replay ${id} (${r.signal || extra.signal || "interact"}): ${r.error || "ok"}`);
    t.log(`callback-replay ${id} ${r.signal} cancel=${r.cancel} listeners=${r.listeners}`);
    await t.wait(1);
    return r;
  };
  const row = (r, pack) => r.trace.find((x) => x.pack === pack);
  const before = (r, pack) => {
    const i = r.order.indexOf(pack);
    t.assert(i >= 0, `${pack} subscribed to ${r.signal} (${r.listeners} listeners)`);
    return i;
  };

  // Chest: chairs (before claims) does not see the cancel; claims sets it; later packs see it.
  const chest = { x: base.x + 4, y: base.y, z: base.z + 2 };
  dim.getBlock(chest).setType("minecraft:chest");
  const box = () => dim.getBlock(chest).getComponent("minecraft:inventory").container;
  const fill = () => {
    const c = box();
    for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
    c.setItem(0, new t.mc.ItemStack("minecraft:stone", 5));
    c.setItem(1, new t.mc.ItemStack("minecraft:dirt", 3));
  };
  const contents = () => {
    const c = box();
    const out = [];
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) out.push(`${it.typeId}:${it.amount}`);
    }
    return out.join(",");
  };
  fill();
  const unsorted = contents();
  let since = t.tick;
  let r = await replay(visitor, chest, { hand: "empty", sneaking: true });
  await t.wait(20);
  t.check(before(r, "chairs_bp") < before(r, "claims_bp"), "chairs_bp subscribed before claims_bp");
  t.check(before(r, "claims_bp") < before(r, "stash_bp") && before(r, "claims_bp") < before(r, "slots_bp"), "stash_bp and slots_bp subscribed after claims_bp");
  t.check(before(r, "claims_bp") < before(r, "elytra_bp") && before(r, "claims_bp") < before(r, "storm_bp"), "elytra_bp and storm_bp subscribed after claims_bp");
  t.check(row(r, "chairs_bp")?.before === false, "chairs (before claims) did not see a cancel on the event");
  t.check(row(r, "claims_bp")?.after === true && r.cancel, "claims canceled the visitor chest tap");
  t.check(row(r, "stash_bp")?.before === true && row(r, "slots_bp")?.before === true, "stash and slots (after claims) saw the cancel");
  t.check(contents() === unsorted, `callback-replay: visitor sorted nothing (${contents()})`);
  const claimed = t.messages(visitor, { kind: "actionbar", since }).map((m) => m.plain);
  t.check(claimed.some((m) => /This land is claimed by Owner/.test(m)), `action bar relay says the land is claimed (${claimed.join(" | ")})`);
  t.check(t.messages(visitor, { since }).every((m) => m.pack === bundle.folder), "relay attributes the line to the one add-on, not a member folder");
  r = await replay(op, chest, { hand: "empty", sneaking: true });
  await t.wait(20);
  t.check(row(r, "claims_bp")?.after !== true, "claims does not cancel the owner's tap");
  t.check(contents() !== unsorted, `callback-replay: the owner still sorts the chest (${contents()})`);

  // Chairs asks realm:access_check because it runs before claims. Production still requires an empty hand and isFirstEvent.
  const stair = { x: base.x + 6, y: base.y, z: base.z };
  dim.getBlock({ x: stair.x, y: stair.y - 1, z: stair.z }).setType("minecraft:stone");
  for (let dy = 1; dy <= 2; dy++) dim.getBlock({ x: stair.x, y: stair.y + dy, z: stair.z }).setType("minecraft:air");
  dim.getBlock(stair).setType("minecraft:oak_stairs");
  const standAt = (p, at) => p.teleport({ x: at.x + 0.5, y: at.y, z: at.z + 1.2 });
  const riding = (p) => !!p.getComponent("minecraft:riding");
  standAt(visitor, stair);
  await t.wait(5);
  r = await replay(visitor, stair, { hand: "empty", sneaking: false });
  await t.wait(50);
  t.check(!riding(visitor), "callback-replay: a visitor does not sit on a stair in the claim (chairs asked access_check)");
  standAt(op, stair);
  await t.wait(5);
  r = await replay(op, stair, { hand: "empty", sneaking: false });
  await t.wait(50);
  t.check(riding(op), "callback-replay: the owner sits, so realm:seat from the bundle was used");
  t.server("/ride Owner stop_riding");
  await t.wait(5);

  // Slots, after claims. Making the machine is a real command; the refused tap is callback-replay.
  const machine = { x: base.x + 8, y: base.y, z: base.z };
  dim.getBlock(machine).setType("minecraft:noteblock");
  op.teleport({ x: machine.x + 0.5, y: machine.y, z: machine.z + 1.5 }, { facingLocation: { x: machine.x + 0.5, y: machine.y + 0.5, z: machine.z + 0.5 } });
  await t.wait(5);
  op.lookAtBlock(machine);
  await t.wait(2);
  t.answerForm(op, "Operator tools", "Make the block I look at a machine");
  t.assert(t.cmd(op, "/realm:slots").ok, "/realm:slots ran");
  t.log((await t.waitMessage(op, /is now a slot machine/, { timeout: 80 })).plain);
  const formsBefore = t.forms(visitor).length;
  r = await replay(visitor, machine, { hand: "pickaxe", sneaking: false });
  await t.wait(25);
  t.check(row(r, "slots_bp")?.before === true, "slots saw the claim cancel");
  t.check(t.forms(visitor).length === formsBefore, "callback-replay: the visitor gets no slot machine");
  const menu = t.waitForm(op, { title: /Slot Machine/, timeout: 60 });
  await replay(op, machine, { hand: "pickaxe", sneaking: false });
  const form = await menu;
  t.check(/Slot Machine/.test(form.title), `callback-replay: the owner still gets the machine (${form.title})`);
  form.answer(null);

  // Elytra jukebox, after claims. The disc item has to come from the bundled item definition.
  const juke = { x: base.x + 10, y: base.y, z: base.z };
  dim.getBlock({ x: juke.x, y: juke.y - 1, z: juke.z }).setType("minecraft:stone");
  dim.getBlock(juke).setType("minecraft:jukebox");
  const DISC = "custom:music_disc_run_away";
  const groundDiscs = () => dim.getEntities({ type: "minecraft:item", location: { x: juke.x + 0.5, y: juke.y + 1, z: juke.z + 0.5 }, maxDistance: 4 })
    .filter((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === DISC).length;
  op.getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack(DISC, 1));
  op.selectedSlotIndex = 0;
  standAt(op, juke);
  await t.wait(5);
  r = await replay(op, juke, { item: DISC, sneaking: false });
  await t.wait(15);
  t.check(row(r, "elytra_bp")?.before === false, "the owner's jukebox tap was not already canceled");
  t.check(op.getComponent("minecraft:inventory").container.getItem(0)?.typeId !== DISC, "callback-replay: the owner's disc went into the jukebox");
  const beforeEject = groundDiscs();
  r = await replay(visitor, juke, { hand: "pickaxe", sneaking: false });
  await t.wait(20);
  t.check(row(r, "elytra_bp")?.before === true, "elytra saw the claim cancel");
  t.check(groundDiscs() === beforeEject, `callback-replay: the visitor does not eject the disc (${groundDiscs()} on the ground)`);
  r = await replay(op, juke, { hand: "pickaxe", sneaking: false });
  await t.wait(20);
  t.check(groundDiscs() > beforeEject, `callback-replay: the owner ejects the disc (${groundDiscs()} on the ground)`);

  // Storm rod, after claims. Production still requires isFirstEvent; the replay sets it. The script is not patched.
  const rod = { x: base.x + 12, y: base.y, z: base.z };
  dim.getBlock({ x: rod.x, y: rod.y - 1, z: rod.z }).setType("minecraft:stone");
  dim.getBlock(rod).setType("minecraft:lightning_rod");
  op.teleport({ x: base.x + 0.5, y: base.y, z: base.z + 0.5 });
  visitor.teleport({ x: base.x + 1.5, y: base.y, z: base.z + 0.5 });
  dim.spawnEntity("minecraft:lightning_bolt", { x: rod.x + 0.5, y: rod.y + 1, z: rod.z + 0.5 });
  await t.wait(20);
  const glass = (p) => {
    const c = p.getComponent("minecraft:inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === "minecraft:prismarine_crystals") n += c.getItem(i).amount;
    return n;
  };
  since = t.tick;
  r = await replay(visitor, rod, { hand: "pickaxe", sneaking: false });
  await t.wait(20);
  t.check(row(r, "storm_bp")?.before === true, "storm saw the claim cancel");
  t.check(glass(visitor) === 0 && !t.messages(visitor, { since }).some((m) => /Storm Glass/.test(m.plain)), "callback-replay: the visitor collects no Storm Glass");
  since = t.tick;
  r = await replay(op, rod, { hand: "pickaxe", sneaking: false });
  await t.wait(20);
  const got = t.messages(op, { since }).find((m) => /Storm Glass/.test(m.plain));
  t.check(!!got && glass(op) > 0, `callback-replay: the owner collects the glass (${glass(op)}${got ? `, ${got.plain}` : ""})`);

  // Break and entity interact: same shared event object, still callback-replay.
  const stone = { x: base.x + 3, y: base.y - 1, z: base.z + 3 };
  dim.getBlock(stone).setType("minecraft:stone");
  r = await replay(visitor, stone, { signal: "playerBreakBlock" });
  t.check(row(r, "claims_bp")?.after === true, "callback-replay break: claims cancels");
  t.check(before(r, "calendar_bp") >= 0 && before(r, "calendar_bp") < before(r, "claims_bp"), "calendar_bp (before claims) is on the break signal");
  t.check(row(r, "calendar_bp")?.before === false, "calendar did not see the claim cancel");
  t.check(before(r, "expedition_bp") > before(r, "claims_bp") && row(r, "expedition_bp")?.before === true, "expedition (after claims) saw the break cancel");
  t.check(dim.getBlock(stone).typeId === "minecraft:stone", "callback-replay does not itself break the block");
  const stand = dim.spawnEntity("minecraft:armor_stand", { x: base.x + 5.5, y: base.y, z: base.z + 5.5 });
  t.assert(stand?.isValid, "armor stand spawned");
  r = await replay(visitor, { x: base.x + 5, y: base.y, z: base.z + 5 }, { signal: "playerInteractWithEntity", entity: "minecraft:armor_stand" });
  t.check(row(r, "claims_bp")?.after === true, "callback-replay entity: claims cancels an armor stand in the claim");
  t.check(before(r, "npc_bp") > before(r, "claims_bp") && row(r, "npc_bp")?.before === true, "npc_bp (after claims) saw the entity cancel");

  // Honest native attempt. A zero count is not a pass of the engine path.
  const hitsBefore = await nativeCount(t, send, native, "playerInteractWithBlock");
  let attempted = false;
  try {
    visitor.teleport({ x: chest.x + 1.5, y: chest.y, z: chest.z + 0.5 });
    await t.wait(5);
    attempted = visitor.useItemInSlotOnBlock(0, chest, t.mc.Direction.Up);
  } catch (e) {
    t.log(`native use attempt threw: ${e}`);
  }
  await t.wait(10);
  const hitsAfter = await nativeCount(t, send, native, "playerInteractWithBlock");
  const gained = hitsAfter - hitsBefore;
  t.log(`native-emission playerInteractWithBlock: ${gained} new hit(s); useItemInSlotOnBlock returned ${attempted}. A zero count is the known simulated-player gap, not proof the engine delivered the cancel.`);

  // Addon-scoped store: the probe reads what nick saved; the harness add-on does not.
  send("realm:cfg_set", { id: "nk", pack: "nick_bp", key: "showGamertag", value: false });
  await t.wait(8);
  at = mark();
  send("realm:probe_prop", { get: ["nick:cfg"] });
  await t.waitUntil(() => of("realm:probe_props", at).length > 0, { timeout: 40, message: "probe_props" });
  const saved = of("realm:probe_props", at)[0].m?.values?.["nick:cfg"];
  t.check(typeof saved === "string" && /showGamertag/.test(saved), `the probe, in the bundle add-on, reads nick:cfg (${saved})`);
  t.check(t.world.getDynamicProperty("nick:cfg") == null, "the harness add-on does not see the bundle's dynamic properties");

  const help = t.waitForm(op, { title: /realm commands/, timeout: 80 });
  t.check(t.cmd(op, "/realm:help").ok, "/realm:help ran");
  const helpForm = await help;
  t.check(helpForm.pack === bundle.folder, `the help form is relayed as the one add-on (${helpForm.pack})`);
  helpForm.answer(null);
  t.log("C13 gameplay above is callback-replay of production handlers. It is not a physical tap and not a render check.");
}

// Lead command, after the suite's header scan (suite.mjs skips this file; it does not stage --bundle):
//   node tools/bundle.mjs --all
//   node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>
//   node tools/test-bds/run.mjs --quiet --flat --bundle <stage>/realm_bundle --scenario tools/test-bds/examples/full-bundle-protocols.js --timeout 1200

async function dismissJoin(t, p) {
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `w${p.name}`, pack: "welcome_bp", key: "popup", value: false, player: p.name }));
  await t.wait(45);
  for (const f of t.forms(p)) if (!f.answered && /Welcome|News/.test(f.title)) f.answer(0);
  await t.wait(2);
}

async function nativeCount(t, send, native, signal) {
  const id = `n${native.length}`;
  send("harness:c13_native", { id, signal });
  await t.waitUntil(() => native.find((n) => n.id === id), { timeout: 40, message: "c13_native" });
  return native.find((n) => n.id === id).hits;
}
