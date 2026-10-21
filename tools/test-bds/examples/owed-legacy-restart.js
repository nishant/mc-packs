// Owed stores (O23): a world saved with the old layout (every player's owed dishes in the one property
// `cooking:owed`) is migrated by the real Cooking pack to one property per player plus an index, a physical restart
// keeps that, odd leftovers stay where they were, and a returning player is paid exactly once, even when one part's
// grant fails.
// The old layout is seeded and every property is read by a harness-only probe in a copy of the pack
// (tools/test-bds/hooks/owed-probe.mjs): dynamic properties belong to the add-on that wrote them, so the test add-on
// can't see them, and the probe uses no code of the pack, so it works the same on a tree from before the owed stores.
// There (7eb5f72, recipe's third argument) phase 2 fails at "per-player key and index exist": the old code keeps the
// one property, which is the migration this checks. Only the grant failure needs Cooking's own console hook
// (`realm:cooking_owed_test` with `claim` and `fail`), after the migration checks. About 60 s (three phases):
//   mkdir -p /tmp/owed-cooking
//   node tools/test-bds/hooks/owed-probe.mjs /tmp/owed-cooking/packs cooking_bp
//   node tools/test-bds/run.mjs --quiet --timeout 900 --packs /tmp/owed-cooking/packs --only cooking_bp --scenario tools/test-bds/examples/owed-legacy-restart.js
export default async function (t) {
  const BASE = "cooking:owed";
  const reports = new Map();
  let hookReport;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "harness:owed_report") {
      const r = JSON.parse(message);
      reports.set(r.id, r);
    }
    if (id === "realm:cooking_owed_test_report") hookReport = JSON.parse(message);
  });
  let seq = 0;
  /** The probe in the copy of Cooking: raw reads and writes of its own properties. */
  const probe = async (body) => {
    const id = `cook-${t.phase}-${++seq}`;
    await t.console(`scriptevent harness:owed_probe ${JSON.stringify({ id, folder: "cooking_bp", base: BASE, dump: true, ...body })}`);
    const r = await t.waitUntil(() => reports.get(id), { timeout: 100, message: "the probe in Cooking answered" });
    t.assert(!r.error, `probe: ${r.error ?? "ok"}`);
    return r;
  };
  const p = await t.player("Cook");
  const inv = p.getComponent("minecraft:inventory").container;
  const count = (name) => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && (it.nameTag ?? "").replace(/§./g, "").includes(name)) n += it.amount;
    }
    return n;
  };
  const longId = "9".repeat(30);
  /** Cooking's own hook pays the debt stored under 7001 to Cook, failing the named parts' grants. */
  const claim = async (fail) => {
    hookReport = undefined;
    await t.console(`scriptevent realm:cooking_owed_test ${JSON.stringify({ claim: "7001", as: "Cook", ...(fail ? { fail } : {}) })}`);
    await t.waitUntil(() => hookReport, { timeout: 100, message: "cooking answered the owed test hook" });
    await t.wait(10);
    return probe({});
  };

  if (t.phase === 1) {
    const r = await probe({
      seed: {
        7001: { harbor_chowder: 2, fishermans_breakfast: 1, mystery_dish: 3, note: "kept" },
        [longId]: { harbor_chowder: 1 },
      },
    });
    t.assert(r.legacy && r.legacy["7001"] && r.legacy[longId], `the old one-property layout is saved (${JSON.stringify(r.legacy)})`);
    t.restart("old-layout owed map saved; restarting");
    return;
  }

  // Cook's join makes Cooking take from its store 100 ticks later, which migrates it.
  await t.wait(120);

  if (t.phase === 2) {
    const r = await probe({});
    t.log(JSON.stringify(r));
    t.assert(r.keys.includes("cooking:owed:7001") && r.keys.includes("cooking:owed_idx"), `per-player key and index exist (${r.keys})`);
    t.assert(JSON.stringify(r.index) === JSON.stringify(["7001"]), `the index lists the migrated player (${JSON.stringify(r.index)})`);
    const v = r.values["7001"];
    t.assert(v.harbor_chowder === 2 && v.fishermans_breakfast === 1 && v.mystery_dish === 3 && v.note === "kept", `unknown fields kept (${JSON.stringify(v)})`);
    t.assert(r.legacy && r.legacy[longId] && !("7001" in r.legacy), `the entry that can't be indexed stays in the old property, the moved one is gone (${JSON.stringify(r.legacy)})`);

    // The fishermans_breakfast grant fails: only that part is owed again, the chowders are paid once.
    const after = await claim(["fishermans_breakfast"]);
    t.assert(count("Harbor Chowder") === 2, `two chowders paid (${count("Harbor Chowder")})`);
    t.assert(count("Fisherman") === 0, "the failed part was not paid");
    t.assert(after.values["7001"]?.fishermans_breakfast === 1 && !after.values["7001"]?.harbor_chowder, `only the failed part is owed again (${JSON.stringify(after.values["7001"])})`);

    const done = await claim();
    t.assert(count("Fisherman") === 1 && count("Harbor Chowder") === 2, `the rest is paid once (${count("Fisherman")}, ${count("Harbor Chowder")})`);
    t.assert(!("7001" in done.values) && !(done.index ?? []).includes("7001") && !done.keys.includes("cooking:owed:7001"), "nothing left for the player");
    await claim();
    t.assert(count("Fisherman") === 1 && count("Harbor Chowder") === 2, "a second claim pays nothing");
    t.restart("paid; restarting to prove it stays paid");
    return;
  }

  const r = await probe({});
  t.assert(!r.keys.includes("cooking:owed:7001") && !(r.index ?? []).includes("7001"), `still nothing owed after the restart (${JSON.stringify(r.keys)})`);
  t.assert(r.legacy && r.legacy[longId], "the leftover is still in the old property");
  await claim();
  t.assert(count("Fisherman") === 0 && count("Harbor Chowder") === 0, "no repeat payment after a restart");
}
