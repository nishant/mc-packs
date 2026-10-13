// Creeper Guard, zones mode: a creeper blast at a zone's edge keeps the blocks inside the zone and breaks the
// ones outside, with 100 zones (99 far away) and 60 far safe zones; a blast inside a safe zone breaks nothing;
// a blast far from every zone breaks blocks as usual; everywhere mode breaks nothing.
//   node tools/test-bds/run.mjs --quiet --only guard_bp --scenario tools/test-bds/examples/guard-zones.js --timeout 600
export default async function (t) {
  const sys = t.mc.system, dim = t.dimension;
  const acks = new Set();
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
  }, { namespaces: ["realm"] });
  const cfg = async (key, value) => {
    const id = `g${key}${value}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "guard_bp", key, value }));
    await t.waitUntil(() => acks.has(id), { timeout: 40, message: `cfg ${key}` });
  };
  const ann = await t.player("Ann", { op: true, gameMode: "creative" });
  await cfg("mode", "zones");
  const x0 = Math.floor(ann.location.x), y0 = Math.floor(ann.location.y) + 20, z0 = Math.floor(ann.location.z);
  // A dirt floor in the air: x0 - 2 .. x0 + 40.
  t.server(`/fill ${x0 - 2} ${y0} ${z0 - 2} ${x0 + 40} ${y0} ${z0 + 2} dirt`);
  // 99 zones far away, then "home" (radius 8) centered on x0, y0 + 1, z0.
  for (let i = 0; i < 99; i++) {
    ann.teleport({ x: x0 + 5000 + i * 20 + 0.2, y: 100, z: z0 + 0.2 });
    t.check(t.cmd(ann, `/realm:guard_add far${i} 64`).ok, `far${i} added`);
    await t.wait(1);
  }
  ann.teleport({ x: x0 + 0.2, y: y0 + 1, z: z0 + 0.2 });
  await t.wait(2);
  t.assert(t.cmd(ann, "/realm:guard_add home 8").ok, "home added");
  await t.wait(2);
  // 60 safe zones far away, and one ("Base", radius 5) around x0 + 30.
  for (let part = 1; part <= 3; part++) {
    const zones = [];
    for (let i = 0; i < 20; i++) zones.push({ dim: "overworld", x: x0 - 5000 - part * 1000 - i * 30, z: z0, r: 10, id: `s${part}_${i}` });
    if (part === 3) zones.push({ dim: "overworld", x: x0 + 30.5, z: z0 + 0.5, r: 5, id: "base", name: "Base" });
    sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "guardtest", part, parts: 3, zones }));
  }
  await t.wait(5);
  ann.teleport({ x: x0 + 0.2, y: y0 + 30, z: z0 + 20 });
  const blast = (x) => {
    const at = { x: x + 0.5, y: y0 + 1, z: z0 + 0.5 };
    const c = dim.spawnEntity("minecraft:creeper", at);
    dim.createExplosion(at, 3, { source: c, breaksBlocks: true });
    try {
      c.remove();
    } catch {
      // gone
    }
  };
  const type = (x) => dim.getBlock({ x, y: y0, z: z0 })?.typeId;
  // At home's edge: x0 + 7 is inside (7.5 from its center), x0 + 9 outside.
  blast(x0 + 8);
  await t.wait(5);
  t.log(`home edge: x0+7 ${type(x0 + 7)}, x0+8 ${type(x0 + 8)}, x0+9 ${type(x0 + 9)}`);
  t.check(type(x0 + 7) === "minecraft:dirt", "a block inside the zone is kept");
  t.check(type(x0 + 9) !== "minecraft:dirt", "a block outside the zone is broken");
  // In the middle of nowhere: broken.
  blast(x0 + 18);
  await t.wait(5);
  t.check(type(x0 + 18) !== "minecraft:dirt", "a blast far from every zone breaks blocks");
  // Inside the safe zone "Base": nothing broken.
  blast(x0 + 30);
  await t.wait(5);
  t.check([29, 30, 31].every((d) => type(x0 + d) === "minecraft:dirt"), "a blast in a safe zone breaks nothing");
  // Everywhere mode: nothing broken.
  await cfg("mode", "everywhere");
  blast(x0 + 23);
  await t.wait(5);
  t.check([22, 23, 24].every((d) => type(x0 + d) === "minecraft:dirt"), "everywhere mode breaks nothing");
}
