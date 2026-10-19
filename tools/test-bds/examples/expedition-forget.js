// Expeditions: a confirmed realm:diag_forget for expedition_bp deletes its own saved parcel structures, keeps its stash
// structures (players' own data still points at them) and every other structure (another pack's, a builder's), and
// answers ONCE, after the clean-up. A forget without the exact confirmation deletes nothing. Needs real BDS: the structure list and delete are native.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-forget.js
export default async function (t) {
  await t.player("Tester", { op: true });
  await t.wait(40);
  const sm = t.world.structureManager;
  const own = ["expedition:stash_901", "expedition:parcel_901", "expedition:parcel_902"];
  const foreign = ["stash:stash_901", "harness:house"];
  const at = { x: 8, y: 100, z: 8 };
  for (const id of [...own, ...foreign]) sm.createFromWorld(id, t.dimension, at, at, { includeBlocks: true, saveMode: "World" });
  const ids = () => sm.getWorldStructureIds();
  t.check([...own, ...foreign].every((id) => ids().includes(id)), "test structures saved");

  const got = [];
  t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "realm:diag_forgot") got.push(JSON.parse(ev.message));
  }, { namespaces: ["realm"] });
  const send = (msg) => t.system.sendScriptEvent("realm:diag_forget", JSON.stringify(msg));

  send({ id: "x1", pack: "expedition_bp" });
  await t.wait(40);
  t.check(own.every((id) => ids().includes(id)), "no confirmation: nothing deleted");

  send({ id: "x2", pack: "expedition_bp", confirm: "FORGET expedition_bp" });
  await t.waitUntil(() => got.some((g) => g.id === "x2"), { timeout: 100, message: "the forget answer" });
  const left = ids().filter((x) => x.startsWith("expedition:"));
  t.check(!left.some((id) => id.startsWith("expedition:parcel_90")), `own parcels deleted (${left.join(", ")})`);
  t.check(ids().includes("expedition:stash_901"), "stash kept");
  t.check(foreign.every((id) => ids().includes(id)), "other structures kept");
  t.check(got.filter((g) => g.id === "x2").length === 1 && got.find((g) => g.id === "x2").ok === true, "one ok answer");
  for (const id of [...foreign, "expedition:stash_901"]) sm.delete(id);
}
