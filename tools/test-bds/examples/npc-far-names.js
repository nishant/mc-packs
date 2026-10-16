// Projected names: standalone data definitions, 120-block range, camera ray, walls, close-up deduplication,
// settings, spectators, and orphan cleanup. Server assertions cannot verify the client's font/rendering.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp,wander_bp,caravan_bp --scenario tools/test-bds/examples/npc-far-names.js --timeout 400
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
  const setting = async (pack, value) => {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "names", pack, key: "farNameRange", value }));
    await t.wait(8);
  };
  await move(-38);
  t.assert(labels().length === 1, "Ida gets a projected label without aiming at her");
  let label = labels()[0];
  let eye = p.getHeadLocation();
  let pos = label.location;
  t.check(Math.hypot(pos.x - eye.x, pos.y - eye.y, pos.z - eye.z) < 9, "label is inside the vanilla near-name radius");
  t.check(label.nameTag.includes("Ida") && label.nameTag.includes("(38m)"), "name and real distance");
  t.check(Math.abs((pos.y - eye.y) / (pos.x - eye.x) - (base.y + 2.25 - eye.y) / (base.x - eye.x)) < 0.005, "label lies on the overhead camera ray");

  const wallX = Math.floor(base.x - 34);
  const y = Math.floor(base.y), z = Math.floor(base.z);
  t.server(`/fill ${wallX} ${y} ${z - 3} ${wallX} ${y + 4} ${z + 3} stone`);
  await t.wait(6);
  t.check(labels()[0].location.x < wallX, "label moves in front of the house wall");
  t.server(`/fill ${wallX} ${y} ${z - 3} ${wallX} ${y + 4} ${z + 3} air`);
  await move(-4);
  t.check(labels().length === 0, "nearby clear view uses only Ida's native name");

  await t.loadArea(-110, 0, { radius: 2 });
  await move(-110);
  t.check(labels().length === 1 && labels()[0].nameTag.includes("(110m)"), "120-block default works beyond 64 blocks");
  await move(-125);
  t.check(labels().length === 0, "outside 120 blocks removes the label");
  await move(-38);
  await setting("npc_bp", 0);
  t.check(labels().length === 0, "range zero turns projections off");
  await setting("npc_bp", 120);
  t.check(labels().length === 1, "range change applies live");
  p.setGameMode(t.mc.GameMode.Spectator);
  await t.wait(6);
  t.check(labels().length === 0, "spectators don't keep projected labels alive");
  p.setGameMode(t.mc.GameMode.Creative);
  await t.wait(6);
  const orphans = ["realm:npc_label", "realm:caravan_label", "realm:wander_label"].map((type) => {
    const orphan = dim.spawnEntity(type, { x: p.location.x, y: base.y + 1, z: base.z + 3 });
    orphan.nameTag = "Orphan";
    return orphan;
  });
  await t.wait(205);
  t.check(orphans.every((orphan) => !orphan.isValid) && labels().length === 1, "all three audits remove untagged orphans but keep the live projection");
  await setting("npc_bp", 0);

  p.teleport(base);
  await t.wait(5);
  t.assert(t.cmd(p, '/realm:caravan_spot "Name Test"').ok, "add caravan spot");
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "call caravan");
  await t.waitUntil(() => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_owner:caravan_bp"] }).length === 3, { timeout: 240, message: "three caravan traders" });
  await move(-38);
  t.check(labels("realm:caravan_label").length === 3, "every caravan trader has a far name");
  await setting("caravan_bp", 0);
  t.check(labels("realm:caravan_label").length === 0, "caravan projections disable independently");

  p.teleport(base, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  t.system.sendScriptEvent("realm:wander_debug", JSON.stringify({ player: p.id, action: "spawn", archetype: "traveler", stranger: true }));
  await t.waitUntil(() => dim.getEntities({ tags: ["realm:npc_owner:wander_bp"], excludeTypes: ["realm:wander_label"] }).length > 0, { timeout: 80, message: "a wanderer appears" });
  await t.wait(6);
  t.check(labels("realm:wander_label").length === 1, "wanderer's moving body gets a far name");
  await setting("wander_bp", 0);
  t.check(labels("realm:wander_label").length === 0, "wanderer projections disable independently");
  t.log("Far-name entity lifecycle and projection verified; client rendering still needs an in-game visual check.");
}
