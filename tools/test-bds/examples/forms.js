// Forms and messages: answer a modal form by label, then read what the pack told the player.
// Run with: node run.mjs --packs <dir> --only nick_bp --scenario examples/forms.js
export default async function (t) {
  const p = await t.player("Alex");

  // Queue the answer before the command: the next form Alex sees gets it right away.
  // /realm:nick may open a menu first (action form) or the nickname form (modal) directly.
  const first = t.waitForm(p);
  t.cmd(p, "/realm:nick");
  let form = await first;
  if (form.type === "action") {
    const next = t.waitForm(p);
    form.answer("nickname"); // press the button whose label contains "nickname"
    form = await next;
  }
  t.assert(form.type === "modal", `nickname form is a modal form (got ${form.type} "${form.title}")`);
  t.log("inputs:", form.elements.filter((e) => "default" in e).map((e) => `${e.kind} "${e.label}"`).join(", "));
  const said = t.waitMessage(p, /nickname is now/i, { pack: "nick_bp" });
  form.answer({ "Nickname": "Sir Alex", "Color": "Gold" });
  const m = await said;
  t.log("pack said:", m.plain);
  t.assert(/Sir Alex/.test(m.plain), "nickname saved");
  await t.wait(5);
  t.assert(p.nameTag.includes("Sir Alex"), `name tag shows the nickname (${JSON.stringify(p.nameTag)})`);
}
