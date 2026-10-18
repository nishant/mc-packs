// Milestones: "Another player's milestones" lists at most 50 players (online first, then the most milestones), so a big
// server's hundreds of records don't become one endless list of buttons. Before, it listed everyone who ever played.
// node tools/test-bds/run.mjs --quiet --only milestones_bp --scenario tools/test-bds/examples/milestones-list.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  await t.console(`scriptevent realm:milestones_test {"fill":80}`);
  await t.wait(10);
  const mine = t.waitForm(ann, { title: "My milestones" });
  t.cmd(ann, "/realm:milestones");
  const first = await mine;
  const pick = t.waitForm(ann, { title: "Whose milestones" });
  first.answer("Another player's milestones");
  const list = await pick;
  list.answer(null);
  const people = list.buttons.filter((b) => !/^Back$/.test(b.replace(/§./g, "")));
  t.log(`${people.length} players listed; first: ${people[0]?.replace(/§./g, "").replace(/\n/g, " / ")}`);
  t.check(people.length === 50, `the list shows 50 players (${people.length})`);
  t.check(/Bob/.test(people[0] ?? ""), `the online player comes first (${people[0]})`);
  t.check(/1 of \d+ unlocked/.test(people[1] ?? ""), `then players with the most milestones (${people[1]})`);
  t.check(/50 of the 81 players/.test(list.body.replace(/§./g, "")), `the text says how many there are (${list.body})`);
}
