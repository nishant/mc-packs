// Town Projects with Land Claims (F37): a claim in the middle of a town; no automatic spot's region overlaps it
// (realm:claims_check over the town's square, player "" for every claim).
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,claims_bp --scenario tools/test-bds/examples/town-claims-spots.js --timeout 3000
export default async function (t) {
  const own = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  await t.waitMessage(own, /Claimed/, { timeout: 60 });
  const r = 16; // claims_bp's default radius around where Ann stood
  const c = { x: Math.floor(own.location.x), z: Math.floor(own.location.z) };
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "claimed", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(own, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const since = t.tick;
  town("add", { name: "Claimed" });
  await t.waitMessage(own, /Town Claimed added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well && d.town.spots.notice_board, { timeout: 6000, interval: 100, message: "spots picked" });
  t.log("regions:", JSON.stringify(d.regions));
  for (const [id, [x1, z1, x2, z2]] of Object.entries(d.regions)) {
    const apart = x2 < c.x - r || x1 > c.x + r || z2 < c.z - r || z1 > c.z + r;
    t.check(apart, `${id}'s region keeps out of the claim`);
  }
}
