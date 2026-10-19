// Story Questlines: "A Champion's Heart" with the Kitchen (cooking_bp) installed and Champions (elite_bp) absent:
// Grandmother Gristle stands in for the hearts. A real kill must finish the step and set heart=gristle, and the kill
// must still count when the pack set changes afterwards (the hearts step and the Gristle steps are one either-group).
//   node tools/test-bds/run.mjs --quiet --only saga_bp,cooking_bp --scenario tools/test-bds/examples/saga-gristle-kill.js --timeout 600
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  const p = await t.player("Cook", { op: true });
  await t.wait(140); // the installed-packs scan (realm:help_ping) runs 5 seconds after the world loads

  debug(p, { action: "jump", story: "hearth_and_table", chapter: "hearts", flags: { way: "old" } });
  await t.wait(5);
  const dim = p.dimension;
  p.runCommand("realm:saga_place watchtower");
  await t.wait(5);
  debug(p, { action: "state" });
  const gristle = () => dim.getEntities({ tags: ["realm:saga:gristle"] });
  // Standing at the watchtower brings her out (the tracker's radius is 40).
  for (let i = 0; i < 120 && !gristle().length; i++) await t.wait(5);
  t.assert(gristle().length > 0, "Grandmother Gristle spawns with cooking on and elite off");
  const kill = t.tick;
  for (const e of gristle()) e.kill();
  await t.wait(20);
  debug(p, { action: "state" });
  t.check(!!(await t.waitMessage(p, /Grandmother Gristle/, { since: kill, timeout: 60 }).catch(() => undefined)), "the kill is announced");
  const log = t.log.filter((l) => /\[saga\] entry hearth_and_table\/hearts/.test(l)).pop() ?? "";
  t.check(/"o":|o=\{?[^ ]*[1-9]/.test(log), `the kill counted (${log})`);
}
