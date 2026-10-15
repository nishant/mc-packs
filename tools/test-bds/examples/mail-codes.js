// Realm Mail (mail_bp): color and format codes typed into a letter are taken out, so a subject can't pass for a
// realm message in the recipient's chat notification. (The harness shows forms without codes, so only chat is checked.)
// node tools/test-bds/run.mjs --quiet --only mail_bp --scenario tools/test-bds/examples/mail-codes.js
// Before the fix the notification read `New letter from Writer: "§c§l[Realm] Account notice..."`.
export default async function (t) {
  const reader = await t.player("Reader");
  const writer = await t.player("Writer");
  await t.wait(10);
  const sent = t.tick;
  t.answerForm(writer, "Write a letter", { To: "Reader", Subject: "§c§l[Realm] Account notice", "Letter (up to": "§4Hello§r from §kme" });
  t.cmd(writer, "/realm:mail");
  const note = await t.waitMessage(reader, /New letter from Writer/, { timeout: 100, since: sent });
  t.log("notification:", note.text);
  t.check(note.text.includes('"[Realm] Account notice') && !/§[cl]\[Realm\]/.test(note.text), "the subject reaches chat without its codes");
}
