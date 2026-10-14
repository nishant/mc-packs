// Land Claims (claims_bp): a player can't claim land reaching into a Safe Zone or a town (both come in over the
// safe zones protocol, realm:zones, sent here by the test pack as Safe Zones and Town Projects would); an
// operator can, and land clear of both can be claimed as usual.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only claims_bp --scenario tools/test-bds/examples/claims-zones.js --timeout 300
// Before the fix every claim below went through.
export default async function (t) {
  const p = await t.player("Settler");
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  const zones = (src, list) => t.system.sendScriptEvent("realm:zones", JSON.stringify({ src, part: 1, parts: list.length ? 1 : 0, zones: list }));
  const dim = "minecraft:overworld";
  // A claim reaches 16 blocks each way; the safe zone's circle comes within 14 blocks of the player.
  zones("zones", [{ id: "spawn", name: "Spawn", dim, x: x + 30.5, z: z + 0.5, r: 16 }]);
  await t.wait(5);

  const tryClaim = async (pattern) => {
    const since = t.tick;
    t.answerForm(p, "Claim this land");
    t.cmd(p, "/realm:claim");
    const m = await t.waitMessage(p, pattern, { timeout: 60, since });
    t.log(m.plain);
    return m.plain;
  };
  const refusedZone = await tryClaim(/Claimed|overlap/);
  t.check(/overlap the safe zone Spawn\. Only operators/.test(refusedZone), "a claim reaching into a safe zone is refused");

  zones("zones", []);
  zones("town", [{ id: "t1", name: "Riverside", dim, x: x + 0.5, z: z - 40.5, r: 30 }]);
  await t.wait(5);
  const refusedTown = await tryClaim(/Claimed|overlap/);
  t.check(/overlap the town Riverside/.test(refusedTown), "a claim reaching into a town is refused");

  // An operator may claim there.
  t.op(p);
  await t.wait(2);
  const opClaim = await tryClaim(/Claimed|overlap/);
  t.check(/^Claimed/.test(opClaim), "an operator can claim over a town");
  t.deop(p);

  // Clear of both, a player claims as usual: the town moves away and the player claims 100 blocks east.
  zones("town", []);
  await t.loadArea(x + 100, z);
  p.teleport({ x: x + 100.5, y: p.location.y, z: z + 0.5 });
  await t.wait(10);
  const second = await tryClaim(/Claimed|overlap|already have/);
  t.check(/^Claimed/.test(second), "land clear of zones and towns can be claimed");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));
}
