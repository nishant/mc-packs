// Townsfolk, caravan traders, and wanderers now use only native entity name tags. Server assertions cannot verify
// the client's exact native name-tag draw distance.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp,caravan_bp,wander_bp --scenario tools/test-bds/examples/npc-far-names.js --timeout 400
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
  const [ida] = dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:ida"] });
  t.assert(!!ida, "Ida exists");
  t.check((ida.nameTag ?? "").includes("Ida"), "Ida's native NPC name is set");
  await move(-38);
  t.check(labels().length === 0, "townsfolk no longer spawn projected helper labels");
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
  await t.wait(10);
  const traders = dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_owner:caravan_bp"] });
  t.check(traders.length === 3, "three caravan traders stay present");
  t.check(traders.every((entity) => (entity.nameTag ?? "").trim().length > 0), "caravan traders keep native NPC names");
  t.check(labels("realm:caravan_label").length === 0, "caravan traders no longer spawn projected helper labels");

  t.system.sendScriptEvent("realm:wander_debug", JSON.stringify({ player: p.id, action: "spawn", archetype: "traveler", stranger: true }));
  await t.waitUntil(() => dim.getEntities({ tags: ["realm:npc_owner:wander_bp"] }).length > 0, { timeout: 80, message: "a wanderer appears" });
  await t.wait(10);
  const wanderers = dim.getEntities({ tags: ["realm:npc_owner:wander_bp"] });
  t.check(wanderers.some((entity) => (entity.nameTag ?? "").trim().length > 0), "wanderers keep native names");
  t.check(labels("realm:wander_label").length === 0, "wanderers no longer spawn projected helper labels");
  t.log("Native-name mode verified server-side for townsfolk, caravan traders, and wanderers.");
}
