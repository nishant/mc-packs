// Parties moderation, O29 (W5), natively: the leader's party chat mute, the one-message-a-second cooldown and the
// pruning of long-gone solo parties.
// - The leader mutes Bob from the party menu ("Mute or unmute a member"): Bob's /realm:party_chat is refused and
//   reaches nobody; unmuted, it arrives again. (The stable API has no before-chat event, so ordinary chat can't be
//   muted; PACKS.md says so.)
// - Two party messages in the same second: the second is refused ("Slow down") and only the first arrives.
// - forgetSoloAfterDays (default 180): saved parties are seeded through a harness-only probe in a copy of the pack
//   (tools/test-bds/hooks/owed-probe.mjs, used here only to write and read party_bp's own properties). After a restart
//   the pack's pruning job (1600 ticks after load) deletes the solo party not seen for 400 days and keeps a solo party
//   seen 10 days ago and a two-member party not seen for 400 days.
//   mkdir -p /tmp/party-moderation
//   node tools/test-bds/hooks/owed-probe.mjs /tmp/party-moderation/packs party_bp
//   node tools/test-bds/run.mjs --quiet --packs /tmp/party-moderation/packs --only party_bp --scenario tools/test-bds/examples/party-moderation.js --timeout 900
const DAY = 86400000;
export default async function (t) {
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "harness:owed_report") return;
      try {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      } catch {}
    },
    { namespaces: ["harness"] },
  );
  let seq = 0;
  /** Writes (seed) or reads the saved party `party:p:<code>` in party_bp's own store. */
  const party = async (code, body = {}) => {
    const id = `p-${t.phase}-${++seq}`;
    await t.console(`scriptevent harness:owed_probe ${JSON.stringify({ id, folder: "party_bp", base: `party:p:${code}`, dump: true, ...body })}`);
    const r = await t.waitUntil(() => reports.get(id), { timeout: 100, message: "the probe in party_bp answered" });
    t.assert(!r.error, `probe: ${r.error ?? "ok"}`);
    return r.legacy;
  };

  if (t.phase === 1) {
    const ann = await t.player("Ann");
    const bob = await t.player("Bob");
    let since = t.tick;
    t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
    await t.waitMessage(bob, /Ann invited you to their party/, { since });
    since = t.tick;
    t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
    await t.waitMessage(bob, /You joined the party/, { since });

    // The mute, from the leader's menu.
    since = t.tick;
    t.answerForm(ann, "Mute or unmute a member", "Bob");
    t.cmd(ann, "/realm:party");
    await t.waitMessage(ann, /Bob is muted in the party chat/, { since, timeout: 100 });
    await t.waitMessage(bob, /The party leader muted you/, { since, timeout: 40 });
    await t.wait(25);
    since = t.tick;
    t.cmd(bob, '/realm:party_chat "muted words"');
    await t.waitMessage(bob, /muted you: your party messages aren't sent/, { since, timeout: 40 });
    await t.wait(10);
    t.check(!t.messages(ann, { since }).some((m) => /muted words/.test(m.plain)), "a muted member's message reaches nobody");
    since = t.tick;
    t.answerForm(ann, "Mute or unmute a member", "Bob");
    t.cmd(ann, "/realm:party");
    await t.waitMessage(ann, /Bob is unmuted/, { since, timeout: 100 });
    await t.wait(25);
    since = t.tick;
    t.cmd(bob, '/realm:party_chat "free again"');
    await t.waitMessage(ann, /\[Party\] Bob: free again/, { since, timeout: 40 });

    // The cooldown: one message a second.
    await t.wait(25);
    since = t.tick;
    t.cmd(bob, '/realm:party_chat "first"');
    t.cmd(bob, '/realm:party_chat "second"');
    await t.waitMessage(bob, /Slow down: one party message a second/, { since, timeout: 40 });
    await t.wait(10);
    t.check(t.messages(ann, { since }).some((m) => /\[Party\] Bob: first/.test(m.plain)), "the first message arrives");
    t.check(!t.messages(ann, { since }).some((m) => /\[Party\] Bob: second/.test(m.plain)), "the second, in the same second, does not");
    await t.wait(25);
    since = t.tick;
    t.cmd(bob, '/realm:party_chat "a second later"');
    await t.waitMessage(ann, /\[Party\] Bob: a second later/, { since, timeout: 40 });

    // Saved parties for the pruning after the restart.
    const now = Date.now();
    await party("OLDSOLO", { seed: { l: "-901", m: [["-901", "Gone", now - 400 * DAY]] } });
    await party("NEWSOLO", { seed: { l: "-902", m: [["-902", "Recent", now - 10 * DAY]] } });
    await party("OLDPAIR", { seed: { l: "-903", m: [["-903", "Pat", now - 400 * DAY], ["-904", "Sam", now - 400 * DAY]] } });
    t.assert(t.failures.length === 0, `phase 1: ${t.failures.length} failed checks`);
    t.restart("three saved parties seeded; restarting so the pruning job runs");
    return;
  }

  t.allowError(/deleted party OLDSOLO/);
  t.check((await party("OLDSOLO")) !== null, "right after the restart the old solo party is still saved");
  await t.wait(1700);
  t.check((await party("OLDSOLO")) === null, "a solo party not seen for 400 days is deleted");
  const recent = await party("NEWSOLO");
  t.check(recent?.m?.[0]?.[1] === "Recent", `a solo party seen 10 days ago is kept (${JSON.stringify(recent)})`);
  const pair = await party("OLDPAIR");
  t.check(pair?.m?.length === 2, `a party of two is never deleted (${JSON.stringify(pair)})`);
}
