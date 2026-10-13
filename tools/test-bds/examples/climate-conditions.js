// Regional Weather on a flat world: sand around a player in the rain is a sandstorm (Slowness I and the note above
// the hotbar), a helmet stops the Slowness, water nearby makes it a beach (no sandstorm), snow is a blizzard that a
// lit campfire ends, after the rain a dawn by the water brings a fog bank, and each condition goes to the Journal
// once. Needs --flat.
// node tools/test-bds/run.mjs --quiet --flat --only climate_bp --scenario tools/test-bds/examples/climate-conditions.js --timeout 300
export default async function (t) {
  t.echoActionBar = true;
  const journal = [];
  t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:journal") journal.push(JSON.parse(e.message));
  }, { namespaces: ["realm"] });
  const p = await t.player("Dune", { op: true, gameMode: "survival" });
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  const y = Math.floor(p.location.y) - 1; // the ground block
  t.log(`Dune at ${x}, ${y + 1}, ${z}`);
  const ground = (block) => t.server(`/fill ${x - 10} ${y} ${z - 10} ${x + 10} ${y} ${z + 10} ${block}`);
  const slow = () => !!p.getEffect("slowness");

  // Sandstorm: sand under a player outdoors in the rain.
  ground("sand");
  t.server("/weather rain");
  await t.waitMessage(p, /Sandstorm!/, { kind: "actionbar", timeout: 200 });
  await t.waitUntil(slow, { timeout: 60, message: "Slowness in the sandstorm" });
  t.log("sandstorm: note and Slowness");

  // A helmet keeps the sand out: Slowness isn't renewed (it lasts 2 s).
  p.getComponent("equippable").setEquipment(t.mc.EquipmentSlot.Head, new t.mc.ItemStack("minecraft:leather_helmet", 1));
  await t.wait(70);
  t.check(!slow(), "no Slowness with a helmet on");
  p.getComponent("equippable").setEquipment(t.mc.EquipmentSlot.Head, undefined);
  await t.waitUntil(slow, { timeout: 60, message: "Slowness is back without the helmet" });

  // Water within 8 blocks: a beach, where it really rains. The condition lingers 3 s, then it's gone (beach scan every 5 s).
  t.server(`/fill ${x + 5} ${y} ${z + 5} ${x + 7} ${y} ${z + 7} water`);
  await t.wait(220);
  t.check(!slow(), "no sandstorm on a beach (water within 8 blocks)");
  t.server(`/fill ${x + 5} ${y} ${z + 5} ${x + 7} ${y} ${z + 7} sand`);

  // Blizzard: snow underfoot. A lit campfire within 4 blocks ends it.
  t.clearMessages();
  ground("snow");
  await t.waitMessage(p, /Blizzard!/, { kind: "actionbar", timeout: 300 });
  await t.waitUntil(slow, { timeout: 60, message: "Slowness in the blizzard" });
  t.log("blizzard: note and Slowness");
  t.server(`/setblock ${x + 2} ${y + 1} ${z} campfire`);
  await t.wait(220); // campfire scan every 3 s, linger 3 s, Slowness 2 s
  t.check(!slow(), "a lit campfire within 4 blocks ends the blizzard");
  t.server(`/setblock ${x + 2} ${y + 1} ${z} air`);

  // Fog bank: after the rain, at dawn (the fresh world's time 0 is inside the dawn window, so set noon first), by
  // the water, below y 80.
  t.clearMessages();
  ground("grass_block");
  t.server(`/fill ${x + 3} ${y} ${z + 3} ${x + 5} ${y} ${z + 5} water`);
  t.server("/time set 6000");
  t.server("/weather clear");
  await t.wait(100);
  t.check(!t.messages(p).some((m) => /fog bank/.test(m.plain)), "no fog bank at noon");
  const since = t.tick;
  t.server("/time set 23500");
  await t.waitMessage(p, /fog bank rolls in/, { kind: "actionbar", timeout: 300, since });
  t.log("fog bank: note");
  t.check(!slow(), "no Slowness in a fog bank");

  // Each condition went to the Journal once.
  const entries = journal.filter((j) => j.page === "weather" && j.player === p.id).map((j) => j.entry);
  t.check(entries.join(",") === "sandstorm,blizzard,fogbank", `realm:journal got each condition once (${entries.join(",")})`);

  // /realm:climate is a switch for this player.
  t.assert(t.cmd(p, "/realm:climate").ok, "/realm:climate ran");
  t.assert(t.cmd(p, "/realm:climate").ok, "/realm:climate ran again");
}
