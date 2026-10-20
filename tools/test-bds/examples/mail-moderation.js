// Realm Mail moderation, O29 (W5), natively: the per-sender unread cap, the block list and the operators' purge by
// sender, each through the real menus.
// - senderUnreadCap 2: Writer's third unread letter to Reader is refused (the form comes back with why) until Reader
//   reads one; then it goes.
// - Reader blocks Writer from a letter: Writer's next letter is refused and nothing reaches Reader; unblocked from
//   "Blocked players", letters arrive again.
// - An operator's "Delete letters from a player" deletes every letter Writer wrote from Reader's inbox (another
//   writer's letter stays), and an operator de-opped while the confirmation is open deletes nothing.
//   node tools/test-bds/run.mjs --quiet --only mail_bp --scenario tools/test-bds/examples/mail-moderation.js --timeout 600
export default async function (t) {
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `m_${key}_${t.tick}`, pack: "mail_bp", key, value }));
  const reader = await t.player("Reader");
  const writer = await t.player("Writer");
  const other = await t.player("Other");
  const op = await t.player("Mod", { op: true });
  cfg("sendCooldownSeconds", 0);
  cfg("senderUnreadCap", 2);
  await t.wait(10);

  /** The next form shown to the player since `since` that no queued answer took (t.waitForm also sees answered ones). */
  const nextOpen = (p, since, timeout = 80) => t.waitUntil(() => t.forms(p).find((f) => f.tick >= since && !f.answered), { timeout, message: `an open form for ${p.name}` });
  /** Writes a letter through the real form; returns "sent", or the problem the form came back with. */
  const write = async (from, to, subject) => {
    const since = t.tick;
    t.answerForm(from, "Write a letter", { To: to.name, Subject: subject, "Letter (up to": `Hello from ${from.name}: ${subject}` });
    t.cmd(from, "/realm:mail");
    const got = await Promise.race([
      t.waitMessage(from, new RegExp(`Letter sent to ${to.name}`), { since, timeout: 80 }).then(() => "sent"),
      nextOpen(from, since).then((f) => {
        f.answer(null);
        return `refused: ${f.body} ${(f.elements ?? []).map((e) => e.label ?? e.text ?? "").join(" ")}`;
      }),
    ]).catch((e) => `nothing: ${e.message ?? e}`);
    await t.wait(5);
    return got;
  };
  /** The inbox line of the mail menu: "Inbox\n3 letters, 2 unread". */
  const inboxLine = async (p) => {
    const f = t.waitForm(p, { timeout: 60 });
    t.cmd(p, "/realm:mail");
    const menu = await f;
    const line = menu.buttons.find((b) => /^Inbox/.test(b)) ?? "";
    menu.answer(null);
    await t.wait(5);
    const m = /(\d+) letters?, (\d+) unread/.exec(line);
    return { total: Number(m?.[1] ?? -1), unread: Number(m?.[2] ?? -1), line };
  };

  // The unread cap.
  t.assert((await write(writer, reader, "one")) === "sent", "the first letter goes");
  t.assert((await write(writer, reader, "two")) === "sent", "the second letter goes");
  const third = await write(writer, reader, "three");
  t.check(third !== "sent" && /2 unread letters from you/.test(third), `the third unread letter is refused, and the form says why (${third})`);
  t.check((await inboxLine(reader)).unread === 2, "Reader has 2 unread letters");
  t.check((await write(other, reader, "from other")) === "sent", "the cap is per sender: another player's letter goes");
  // Reader reads Writer's first letter: Writer may send again.
  t.answerForm(reader, "Inbox", "one", "Back to inbox", null);
  t.cmd(reader, "/realm:mail");
  await t.wait(30);
  t.check((await write(writer, reader, "three again")) === "sent", "after Reader read one, Writer's letter goes");

  // The block list.
  t.answerForm(reader, "Inbox", "two", "Block sender");
  t.cmd(reader, "/realm:mail");
  await t.waitMessage(reader, /Writer is blocked/, { timeout: 80 });
  const before = await inboxLine(reader);
  const blocked = await write(writer, reader, "while blocked");
  t.check(blocked !== "sent" && /isn't accepting letters from you/.test(blocked), `a blocked writer's letter is refused (${blocked})`);
  t.check((await inboxLine(reader)).total === before.total, "nothing reached Reader");
  t.check(!t.messages(reader).some((m) => /New letter from Writer: "while blocked/.test(m.plain)), "Reader was not notified");
  t.answerForm(reader, "Blocked players", "Writer", null);
  t.cmd(reader, "/realm:mail");
  await t.waitMessage(reader, /Writer is unblocked/, { timeout: 80 });
  t.check((await write(writer, reader, "unblocked")) === "sent", "unblocked, Writer's letters arrive again");

  // The operators' purge by sender: Writer's letters go from every inbox, Other's stays.
  const fromWriter = (await inboxLine(reader)).total;
  t.log(`Reader holds ${fromWriter} letters before the purge`);
  // A moderator de-opped while the confirmation is open deletes nothing.
  let since = t.tick;
  t.answerForm(op, "Delete letters from a player", { "Gamertag of the writer": "Writer" });
  t.cmd(op, "/realm:mail");
  const confirm = await nextOpen(op, since);
  t.check(/Delete \d+ letters? from Writer/.test(confirm.body), `the purge says how many and whose (${confirm.body})`);
  t.deop(op);
  confirm.answer("Delete");
  await t.wait(20);
  t.check((await inboxLine(reader)).total === fromWriter, "a moderator de-opped during the confirmation deletes nothing");
  t.op(op);
  await t.wait(5);
  since = t.tick;
  t.answerForm(op, "Delete letters from a player", { "Gamertag of the writer": "Writer" }, "Delete");
  t.cmd(op, "/realm:mail");
  const done = await t.waitMessage(op, /Deleted (\d+) letters? from Writer/, { since, timeout: 100 });
  t.log(done.plain);
  const left = await inboxLine(reader);
  t.check(left.total === 1, `only Other's letter is left in Reader's inbox (${left.line})`);
  since = t.tick;
  t.answerForm(reader, "Inbox");
  t.cmd(reader, "/realm:mail");
  const box = await nextOpen(reader, since);
  t.check(box.buttons.some((b) => /from other/.test(b)) && !box.buttons.some((b) => /from Writer/.test(b)), `the inbox holds Other's letter and none of Writer's (${box.buttons.join(" | ")})`);
  box.answer(null);
}
