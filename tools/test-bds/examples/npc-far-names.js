// Townsfolk, caravan traders, wanderers, and story characters use one world-fixed always_show helper entity per
// owned character (`realm:npc_label`, `realm:caravan_label`, `realm:wander_label`, `realm:saga_label`) pinned at
// `headLocation + 0.4y` while setting the native entity's `nameTag = "§r"` to suppress the native 5-block nameplate
// without triggering the "NPC" fallback or an empty background pill.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp,caravan_bp,wander_bp,saga_bp,build_rp --scenario tools/test-bds/examples/npc-far-names.js --timeout 400
export default async function (t) {
  const p = await t.player("NameTester", { op: true, gameMode: "creative", x: 0, z: 0 });
  const q = await t.player("NameEast", { op: true, gameMode: "creative", x: 20, z: 0 });
  const dim = t.dimension;
  await t.loadArea(0, 0, { radius: 4 });
  const base = { x: 0.5, y: p.location.y, z: 0.5 };
  const labels = (type = "realm:npc_label") => dim.getEntities({ type });
  const close = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.05;

  if (t.phase === 1) {
    for (const type of ["realm:npc_label", "realm:caravan_label", "realm:wander_label", "realm:saga_label"]) {
      const orphan = dim.spawnEntity(type, { x: base.x, y: base.y + 1, z: base.z + 3 });
      orphan.nameTag = `orphan:${type}`;
      t.check(dim.getEntities({ type }).length > 0, `${type} can exist in a saved world before restart cleanup`);
    }
    return t.restart("verify saved orphan helper labels are removed on load");
  }

  await t.waitUntil(
    () =>
      ["realm:npc_label", "realm:caravan_label", "realm:wander_label", "realm:saga_label"].every(
        (type) => labels(type).filter((e) => e.nameTag.startsWith("orphan:")).length === 0,
      ),
    { timeout: 260, message: "saved orphan helper labels cleaned after restart" },
  );
  for (const type of ["realm:npc_label", "realm:caravan_label", "realm:wander_label", "realm:saga_label"]) {
    t.check(labels(type).filter((e) => e.nameTag.startsWith("orphan:")).length === 0, `orphan ${type} cleaned after restart`);
  }

  p.teleport(base);
  q.teleport({ x: base.x + 20, y: base.y, z: base.z }, { rotation: { x: 0, y: 90 } });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:npc_add ida").ok, "place Ida");
  await t.waitUntil(() => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:ida"] }).length === 1, { timeout: 80, message: "Ida placed" });
  const move = async (dx) => {
    p.teleport({ x: base.x + dx, y: base.y, z: base.z }, { rotation: { x: 0, y: -90 } });
    await t.wait(6);
  };
  const [ida] = dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:ida"] });
  t.assert(!!ida, "Ida exists");
  await t.waitUntil(() => labels("realm:npc_label").length === 1, { timeout: 40, message: "Ida helper spawned" });
  const idaAnchor = () => {
    const h = ida.getHeadLocation();
    return { x: h.x, y: h.y + 0.4, z: h.z };
  };
  t.check(ida.nameTag === "§r" || ida.nameTag === "§r§r", `Ida's native NPC nameTag is suppressed with §r (${JSON.stringify(ida.nameTag)})`);
  t.check((labels("realm:npc_label")[0]?.nameTag ?? "").includes("Ida"), "Ida's single helper carries her canonical name");
  t.check(close(labels("realm:npc_label")[0].location, idaAnchor()), "Ida's helper stays world-fixed at head + 0.4y");

  // Opposed viewers at -5 / +20 and -20 / +20 share the exact same single world-fixed helper.
  await move(-5);
  t.check(labels("realm:npc_label").length === 1 && close(labels("realm:npc_label")[0].location, idaAnchor()), "at 5m + opposed 20m viewer: 1 world-fixed helper");
  await move(-20);
  t.check(labels("realm:npc_label").length === 1 && close(labels("realm:npc_label")[0].location, idaAnchor()), "at 20m + opposed 20m viewer: 1 world-fixed helper");

  // Beyond observerRange (both viewers far away): helper despawns cleanly, native nameTag falls back to canonical name, and spectators do not spawn helpers.
  q.teleport({ x: base.x + 60, y: base.y, z: base.z });
  await move(-38);
  // Townsfolk labels sync every 10 ticks: the helper goes within half a second.
  await t.waitUntil(() => labels("realm:npc_label").length === 0, { timeout: 20, interval: 2, message: "helper gone" }).catch(() => {});
  t.check(labels("realm:npc_label").length === 0, "townsfolk helper despawns when no observer is within 24 blocks");
  t.check((ida.nameTag ?? "").includes("Ida"), "Ida's native nameTag falls back to canonical name when no helper is active");
  p.setGameMode(t.mc.GameMode.Spectator);
  await move(-5);
  t.check(labels("realm:npc_label").length === 0, "spectators do not create townsfolk helper labels");
  t.check((ida.nameTag ?? "").includes("Ida"), "Ida's native nameTag retains canonical fallback for spectator-only observers");
  p.setGameMode(t.mc.GameMode.Creative);
  await move(-5);
  await t.waitUntil(() => labels("realm:npc_label").length === 1, { timeout: 40, message: "Ida helper returns for non-spectator" });
  t.check(ida.nameTag === "§r" || ida.nameTag === "§r§r", "Ida's native nameTag is suppressed with §r once helper returns");
  // When a second viewer (q) approaches within 20 blocks while Ida's native nameTag is already suppressed,
  // both Ida's native nameTag ("§r" <-> "§r§r") and her helper caption are resent so the client refreshes its cached default "NPC" label.
  const seenNativeForms = new Set([ida.nameTag]);
  const sampleNative = t.system.runInterval(() => {
    if (ida.isValid) seenNativeForms.add(ida.nameTag);
  }, 2);
  q.teleport({ x: base.x + 6, y: base.y, z: base.z });
  await t.waitUntil(() => seenNativeForms.has("§r") && seenNativeForms.has("§r§r"), {
    timeout: 120,
    message: "Ida's native suppressed nameTag toggles between §r and §r§r when a new near viewer enters range",
  });
  t.system.clearRun(sampleNative);
  t.check(
    seenNativeForms.has("§r") && seenNativeForms.has("§r§r"),
    `Ida's native suppressed nameTag resent (${[...seenNativeForms].join(" <-> ")}) for new near viewer`,
  );

  // Caravan traders: native "§r" + 1 realm:caravan_label per trader.
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
  t.check(traders.every((entity) => entity.nameTag === "§r" || entity.nameTag === "§r§r"), "caravan traders suppress native NPC names with §r");
  t.check(labels("realm:caravan_label").length === 3, "caravan traders each have one world-fixed helper label");

  // Wanderers: format-only suppressed native nameTag + 1 realm:wander_label per wanderer.
  t.system.sendScriptEvent("realm:wander_debug", JSON.stringify({ player: p.id, action: "spawn", archetype: "traveler", stranger: true }));
  await t.waitUntil(() => dim.getEntities({ tags: ["realm:npc_owner:wander_bp"] }).filter((e) => e.typeId !== "realm:wander_label").length > 0, {
    timeout: 80,
    message: "a wanderer appears",
  });
  await t.wait(10);
  const wanderers = dim.getEntities({ tags: ["realm:npc_owner:wander_bp"] }).filter((e) => e.typeId !== "realm:wander_label");
  t.check(wanderers.every((entity) => /^(?:§[0-9a-fr])+$/i.test(entity.nameTag)), "wanderers suppress native names with format-only marker");
  t.check(labels("realm:wander_label").length === wanderers.length, "each wanderer has one world-fixed helper label");
  t.check(labels("realm:npc_name_probe").length === 0, "ordinary packs never spawn the test-only capability probe");
  t.log("Single-carrier world-fixed helper mode verified server-side for townsfolk, caravan traders, and wanderers.");
}
