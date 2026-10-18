// Expeditions: in a flat world (grass at y -61) the dungeon box (y -41 and up) would stand above the ground as a block
// of deepslate in the open. Setting the site there now warns the operator; before, it said nothing.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-flat-site.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  const since = t.tick;
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  await t.wait(5);
  const warn = t.messages(ann, { since }).map((m) => m.plain).filter((m) => /above the ground/.test(m));
  t.log(warn.join(" / ") || "no warning");
  t.check(warn.length === 1, "the operator is warned that the ground is below the dungeon");
}
