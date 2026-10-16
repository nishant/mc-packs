// Realm Configuration: Teleport to a Player lists everyone else online (not you), nearest first, and teleports to
// the one picked. Recent then shows who it was for under its name, since tapping it there runs it again at once.
// Run with: node tools/test-bds/run.mjs --quiet --only admin_bp --scenario tools/test-bds/examples/admin-tp.js
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const x = Math.floor(p.location.x);
  const z = Math.floor(p.location.z);
  const far = await t.player("Faraway", { x: x + 40, z });
  const near = await t.player("Nearby", { x: x + 5, z });
  await t.wait(60);
  const title = (/** @type {any} */ f) => String(f?.title ?? "").replace(/§./g, "");
  async function tap(form, answer) {
    const next = t.waitForm(p, { timeout: 100 }).catch(() => undefined);
    form.answer(answer);
    return next;
  }
  const first = t.waitForm(p, { timeout: 100 });
  t.cmd(p, "/realm:admin");
  const main = await first;
  let page = await tap(main, "Operator Tools");
  const form = await tap(page, "Teleport to a Player");
  t.assert(title(form) === "Teleport me to a player", `the teleport form opened (got "${title(form)}")`);
  const dd = form.elements.find((/** @type {any} */ e) => e.kind === "dropdown");
  t.log(`dropdown: ${dd?.label} ${JSON.stringify(dd?.options)}`);
  t.check(JSON.stringify(dd?.options) === JSON.stringify(["Nearby", "Faraway"]), "the list is everyone else, nearest first");
  t.check(/2 online besides you/.test(dd?.label ?? ""), "the label counts them");
  const done = t.waitMessage(p, /Teleported to Faraway/, { pack: "admin_bp" });
  page = await tap(form, { Player: "Faraway" });
  await done;
  await t.wait(5);
  t.check(Math.hypot(p.location.x - far.location.x, p.location.z - far.location.z) < 2, "teleported to Faraway");
  const main2 = await tap(page, "Back");
  const recent = await tap(main2, "Recent");
  t.assert(title(recent) === "Recent", `Recent opened (got "${title(recent)}")`);
  t.log(JSON.stringify(recent.buttons));
  t.check(recent.buttons.some((/** @type {string} */ b) => b.replace(/§./g, "") === "Teleport to a Player\nQuick action: Faraway"), "Recent shows who it was for");
  void near;
}
