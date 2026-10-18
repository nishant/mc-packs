// Realm Mail: on a big server the "To" list holds online players and the most recently seen (at most 60), and anyone
// else on the roster is reached by typing their name. Before, the list held everyone who ever joined (up to 400).
// node tools/test-bds/run.mjs --quiet --only mail_bp --scenario tools/test-bds/examples/mail-big-roster.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  await t.console(`scriptevent realm:mail_test {"roster":300}`);
  await t.wait(10);

  // Write to Gone250, who is far down the roster, by name.
  let seen;
  t.answerForm(ann, "Write a letter", (form) => {
    seen = form;
    return { "Or type": "gone250", Subject: "Hello", "Letter (up to": "Long time no see" };
  });
  let since = t.tick;
  t.cmd(ann, "/realm:mail");
  await t.waitUntil(() => seen, { timeout: 100, message: "the letter form opened" });
  const to = seen.elements.find((e) => e.kind === "dropdown");
  const options = to?.options ?? [];
  t.log(`To: ${options.length} choices; ${to?.label?.replace(/§./g, "").slice(0, 160)}`);
  t.check(options.length > 0 && options.length <= 60, `the To list is at most 60 names (${options.length})`);
  t.check(options.some((o) => /Bob/.test(o)), "an online player is on it");
  const sent = await t.waitMessage(ann, /Letter sent to|No player|several/, { timeout: 100, since });
  t.check(/Letter sent to Gone250/.test(sent.plain), `a typed name reaches a player who isn't on the list (${sent.plain})`);

  // A name nobody has gets the form back with the problem.
  let again;
  t.answerForm(ann, "Write a letter", { "Or type": "Nobody Here", Subject: "Hi", "Letter (up to": "Hi" }, (form) => {
    again = form;
    return null;
  });
  since = t.tick;
  t.cmd(ann, "/realm:mail");
  await t.waitUntil(() => again, { timeout: 120, message: "the form came back" });
  const label = again.elements.find((e) => e.kind === "dropdown")?.label?.replace(/§./g, "") ?? "";
  t.check(/No player called "Nobody Here"/.test(label), `an unknown name is explained (${label.slice(0, 120)})`);
}
