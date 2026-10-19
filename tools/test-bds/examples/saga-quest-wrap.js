// Story Questlines' quest box wraps instead of cutting with "..." (O68). With the tracker in a Side HUD box, every quest
// box the saga writes (the "quest" slot of realm:side, text after its quest code) must hold whole lines: no "..." of a
// cut, at most 511 bytes with its code and 10 rows of 32 columns, and the step the tracker points at in full. Checked on
// the real chapter "Salt and Silence" (The Drowned Bell): its step "Ask Warden Reyes what the night watch heard" shows
// whole as an open step and whole as a done step (`[x]`, which the box used to cut to "[x] Ask Warden Reyes what the..."),
// and a party mate who helps with it (Bob, who never accepted it) reads the short party line, "Party quest: helping your
// party (you finished it)", which used to be cut to "Party quest: you finished it, so you're helping. Your party...".
// The tracker preference lifecycle is kept: moving the box to another place rewrites it with that place's code, the
// tracker off takes it down, and back on brings it back.
// This checks the text the server sends; what a client draws still needs a real-client look at Right 1-3 and Middle.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-quest-wrap.js --timeout 600
function utf8Length(s) {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
/** Rows of a box text, wrapped at spaces at 32 columns like the saga's own estimate (color codes take no room). */
function rowsOf(text) {
  let rows = 0;
  for (const line of text.split("\n")) {
    let r = 1;
    let used = 0;
    for (const word of line.replace(/§./g, "").split(" ")) {
      if (used > 0 && used + 1 + word.length <= 32) {
        used += 1 + word.length;
        continue;
      }
      if (used > 0) r++;
      let rest = word.length;
      while (rest > 32) {
        r++;
        rest -= 32;
      }
      used = rest;
    }
    rows += r;
  }
  return rows;
}

export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:side") return;
      try {
        sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  const cfg = (key, value, player) => send("realm:cfg_set", { id: `wrap_${key}_${t.tick}`, pack: "saga_bp", key, value, player: player.id });
  await t.server("/gamerule doDaylightCycle false");
  await t.server("/gamerule doMobSpawning false");
  const ann = await t.player("Ann", { op: true, x: 163, z: 170 });
  const bob = await t.player("Bob", { x: 165, z: 170 });

  /** Every quest box write of one player (slot "quest", from the saga), newest last. */
  const boxes = (p, since = 0) => sides.filter((s) => s.tick >= since && s.m.player === p.id && s.m.from === "saga" && s.m.slot === "quest" && s.m.text);
  const lastBox = (p) => boxes(p).at(-1)?.m.text ?? "";
  /** The box text without its quest code (color codes only, "§s§q§N"). */
  const body = (text) => text.replace(/^§s§q§\d/, "");
  const plain = (text) => text.replace(/§./g, "");

  // Ann accepts "Salt and Silence" at Old Tobin.
  let next = t.waitForm(ann, { timeout: 300 });
  send("realm:npc_choose", { player: ann.id, npc: "tobin", pack: "saga_bp", key: "start:drowned_bell" });
  for (let k = 0; k < 20; k++) {
    const f = await next;
    const last = !f.buttons.includes("Next");
    if (!last) next = t.waitForm(ann, { timeout: 300 });
    f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))) : "Next");
    if (last) break;
  }
  await t.waitUntil(() => boxes(ann).some((s) => /Salt and Silence/.test(s.m.text)), { timeout: 200, message: "the quest box shows the chapter" });
  let text = plain(body(lastBox(ann)));
  t.check(text.includes("Climb to the lighthouse"), `the first step is whole in the box:\n${text}`);
  t.check(text.includes("Ask Warden Reyes what the night watch heard"), `the second step is whole in the box, not cut with "...":\n${text}`);

  // The second step done: its [x] row is whole too.
  send("realm:saga_debug", { player: ann.id, action: "bump", story: "drowned_bell", i: 1, n: 1 });
  await t.waitUntil(() => /\[x\]/.test(plain(lastBox(ann))), { timeout: 200, message: "the done step shows as [x]" });
  text = plain(body(lastBox(ann)));
  t.check(text.includes("[x] Ask Warden Reyes what the night watch heard"), `the [x] row is whole, not "[x] Ask Warden Reyes what the...":\n${text}`);

  // Bob joins the party after the chapter was accepted: he helps with it, and the party line is the short one.
  const since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you/, { since });
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  await t.waitUntil(() => boxes(bob, since).some((s) => /Party quest/.test(plain(s.m.text))), { timeout: 400, message: "Bob's quest box has the party quest line" });
  const bobText = plain(body(lastBox(bob)));
  t.check(bobText.includes("Party quest: helping your party (you finished it)"), `the party quest line is the short one:\n${bobText}`);
  t.check(!bobText.includes("you finished it, so you're helping"), "the long party line is gone");

  // Every write of the run: whole lines, the byte and row budget.
  for (const p of [ann, bob]) {
    for (const [i, s] of boxes(p).entries()) {
      const raw = String(s.m.text);
      const lines = plain(body(raw)).split("\n");
      t.check(utf8Length(raw) <= 511, `${p.name} write ${i}: ${utf8Length(raw)} bytes with its code (511 at most)`);
      t.check(rowsOf(body(raw)) <= 10, `${p.name} write ${i}: ${rowsOf(body(raw))} rows (10 at most):\n${plain(body(raw))}`);
      t.check(!lines.some((l) => l.endsWith("...")), `${p.name} write ${i}: no line is cut with "...":\n${plain(body(raw))}`);
    }
  }

  // The tracker preference lifecycle: another place, off, back on.
  const before = lastBox(ann);
  t.check(before.startsWith("§s§q§4"), `the box is at Right 4 by default (${JSON.stringify(before.slice(0, 12))})`);
  let from = t.tick;
  cfg("trackerAt", "right1", ann);
  await t.waitUntil(() => boxes(ann, from).some((s) => String(s.m.text).startsWith("§s§q§1")), { timeout: 200, message: "the box moves to Right 1: its text starts with that place's code" });
  from = t.tick;
  cfg("tracker", false, ann);
  await t.waitUntil(() => sides.some((s) => s.tick >= from && s.m.player === ann.id && s.m.from === "saga" && !s.m.text), { timeout: 200, message: "the tracker off takes the box down" });
  from = t.tick;
  cfg("tracker", true, ann);
  await t.waitUntil(() => boxes(ann, from).some((s) => String(s.m.text).startsWith("§s§q§1")), { timeout: 300, message: "the tracker back on draws the box again, at the place chosen" });
  t.check(plain(body(lastBox(ann))).includes("Ask Warden Reyes what the night watch heard"), "the redrawn box is whole too");
}
