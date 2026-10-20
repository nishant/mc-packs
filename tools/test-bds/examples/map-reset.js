// Minimap: /realm:map_reset, driven through the pack's own commands. Dynamic properties belong to the add-on that
// wrote them, so the scenario never writes or reads map:* itself: marks come from /realm:map_mark and are read back
// through realm:map_debug -> realm:map_state (marks, resetGen). Checks: a non-operator is refused, no "confirm" does
// nothing, "confirm" clears the marked spots and bumps the generation, only a player who lost spots is told (not the
// operator with none, not a later joiner), and a spot marked after the reset survives.
// The offline-player half (applied once on the next join) is covered by tools/map-reset.test.mjs. About 60 s:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only map_bp --scenario tools/test-bds/examples/map-reset.js
export default async function (t) {
  const sys = t.system;
  /** @type {{ m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:map_state") return;
      try {
        ev.push({ m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const state = async (p) => {
    const since = t.tick;
    sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: p.id, action: "state" }));
    await t.waitUntil(() => ev.some((e) => e.tick >= since && e.m.player === p.id), { timeout: 20, message: "realm:map_state" });
    return ev.filter((e) => e.tick >= since && e.m.player === p.id).at(-1).m;
  };

  const op = await t.player("Op", { op: true });
  const pal = await t.player("Pal");
  t.cmd(pal, '/realm:map_mark "Cave"');
  await t.waitMessage(pal, /Marked "Cave"/, { timeout: 40 });
  let s = await state(pal);
  t.check(s.marks.length === 1 && s.marks[0].n === "Cave", `the spot is marked (${JSON.stringify(s.marks)})`);
  const gen = s.resetGen;

  t.cmd(pal, "/realm:map_reset confirm");
  await t.wait(20);
  s = await state(pal);
  t.check(s.marks.length === 1 && s.resetGen === gen, "a non-operator can't reset the map");

  t.cmd(op, "/realm:map_reset");
  await t.wait(20);
  s = await state(pal);
  t.check(s.marks.length === 1 && s.resetGen === gen, "without confirm nothing is cleared");

  const resetAt = t.tick;
  t.cmd(op, "/realm:map_reset confirm");
  await t.wait(20);
  s = await state(pal);
  t.check(Number.isSafeInteger(s.resetGen) && s.resetGen > gen, `the generation went up (${gen} -> ${s.resetGen})`);
  t.check(s.marks.length === 0 && s.wp === null, "the marked spots and destination are cleared");
  // F16: only a player who lost something is told; the operator had no spots and a later joiner has nothing saved.
  const told = (p) => t.messages(p, { kind: "chat", pack: "map_bp", since: resetAt }).filter((m) => /reset everyone's destination/.test(m.plain)).length;
  t.check(told(pal) === 1, `the player whose spot was cleared is told once (${told(pal)})`);
  t.check(told(op) === 0, `the operator with nothing saved is not told (${told(op)})`);
  const late = await t.player("Late");
  await t.wait(60);
  t.check(told(late) === 0, `a player who joins after the reset with nothing saved is not told (${told(late)})`);

  t.cmd(pal, '/realm:map_mark "After"');
  await t.waitMessage(pal, /Marked "After"/, { timeout: 40 });
  s = await state(pal);
  t.check(s.marks.length === 1 && s.marks[0].n === "After", `a spot marked after the reset is kept (${JSON.stringify(s.marks)})`);
}
