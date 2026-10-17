// Townsfolk use only native minecraft:npc names now: no projected helper entity, but old helper leftovers are
// still cleaned up. Caravan traders keep their projected labels. Server assertions cannot verify the client's exact
// native name-tag draw distance.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp,caravan_bp --scenario tools/test-bds/examples/npc-far-names.js --timeout 400
export default async function (t) {
  const p = await t.player("NameTester", { op: true, gameMode: "creative", x: 0, z: 0 });
  const dim = t.dimension;
  await t.loadArea(0, 0, { radius: 4 });
  const base = { x: 0.5, y: p.location.y, z: 0.5 };
  p.teleport(base);
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:npc_add ida").ok, "place Ida");
  await t.waitUntil(() => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:ida"] }).length === 1, { timeout: 80, message: "Ida placed" });
  const labels = (type = "realm:npc_label") => dim.getEntities({ type });
  const move = async (dx) => {
    p.teleport({ x: base.x + dx, y: base.y, z: base.z }, { rotation: { x: 0, y: 90 } });
    await t.wait(6);
  };
  const setting = async (pack, key, value) => {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "names", pack, key, value }));
    await t.wait(8);
  };
  const [ida] = dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:ida"] });
  t.assert(!!ida, "Ida exists");
  t.check((ida.nameTag ?? "").includes("Ida"), "Ida's native NPC name is set");
  await move(-38);
  t.check(labels().length === 0, "townsfolk no longer spawn projected helper labels");
  const orphan = dim.spawnEntity("realm:npc_label", { x: base.x, y: base.y + 1, z: base.z + 3 });
  orphan.nameTag = "Orphan";
  await t.wait(205);
  t.check(!orphan.isValid, "npc audit removes leftover townsfolk helper labels");
  p.setGameMode(t.mc.GameMode.Spectator);
  await t.wait(6);
  t.check(labels().length === 0, "spectators still do not create townsfolk helper labels");
  p.setGameMode(t.mc.GameMode.Creative);
  await t.wait(6);

  p.teleport(base);
  await t.wait(5);
  t.assert(t.cmd(p, '/realm:caravan_spot "Name Test"').ok, "add caravan spot");
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "call caravan");
  await t.waitUntil(() => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_owner:caravan_bp"] }).length === 3, { timeout: 240, message: "three caravan traders" });
  p.teleport(base);
  await t.waitUntil(() => labels("realm:caravan_label").length === 3, { timeout: 80, message: "every caravan trader gets a label while nearby" });
  t.check(labels("realm:caravan_label").length === 3, "every caravan trader has a far name");
  await setting("caravan_bp", "farNameRange", 0);
  await t.waitUntil(() => labels("realm:caravan_label").length === 0, { timeout: 80, message: "caravan labels clear when disabled" });
  t.check(labels("realm:caravan_label").length === 0, "caravan projections disable independently");
  t.log("Townsfolk native-name mode verified server-side; projected helpers remain for caravan traders, not townsfolk.");
}
